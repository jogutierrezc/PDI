/* =============================================================================
   Comprobación de las migraciones.

   Aplicar una migración contra Supabase y leer el error que devuelve es un
   ciclo lento: cada columna mal escrita cuesta un viaje, y el mensaje
   ("column p.area_id does not exist") no dice en qué línea del archivo está.

   Esto lo adelanta. No es un parser de SQL: lee las columnas que declara cada
   CREATE TABLE y cada ALTER TABLE ADD COLUMN de todas las migraciones, ata los
   alias de los FROM/JOIN a su tabla, y avisa de cada `alias.columna` que esa
   tabla no tiene. Atrapa la clase de fallo que de verdad ocurre —una columna
   que no existe— sin necesidad de una base de datos.

   Lo que NO ve, y conviene saberlo antes de fiarse:
     · El SQL dinámico. Varias migraciones añaden la misma columna a un puñado
       de tablas con `execute format('alter table public.%I add column …')`, y
       qué tabla la recibe solo se sabe ejecutando. Esas columnas se apuntan
       aparte y nunca se acusan.
     · Las vistas. Sus columnas no se deducen, así que un alias que apunte a
       una vista no se comprueba.
     · Los tipos, las restricciones y el orden de las sentencias.

   Ejecutar con: npm run check:sql
   ========================================================================== */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "supabase/migrations";
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

/** tabla → columnas declaradas. Un valor nulo marca una vista. */
const columns = new Map();
/** Columnas añadidas con SQL dinámico: existen, pero no se sabe dónde. */
const dynamic = new Set();

function add(table, column) {
  const key = table.replace(/^public\./, "");
  if (!columns.has(key)) columns.set(key, new Set());
  columns.get(key)?.add(column);
}

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");

  for (const [, table, body] of sql.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.\w+)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--") || line.startsWith("/*") || line.startsWith("*")) continue;
      if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i.test(line)) continue;
      const declared = line.match(/^(\w+)\s+/);
      if (declared) add(table, declared[1]);
    }
  }

  for (const [, table, column] of sql.matchAll(
    /alter\s+table\s+(public\.\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi,
  )) {
    add(table, column);
  }

  for (const [, column] of sql.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
    dynamic.add(column);
  }

  for (const [, view] of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(public\.\w+)/gi)) {
    const key = view.replace(/^public\./, "");
    if (!columns.has(key)) columns.set(key, null);
  }
}

const targets = process.argv.length > 3 ? process.argv.slice(3) : files;
let failures = 0;

for (const target of targets) {
  const sql = readFileSync(join(dir, target), "utf8");

  // alias → tablas, desde los FROM y JOIN con alias explícito. Un alias puede
  // apuntar a varias tablas a lo largo del archivo; entonces basta con que una
  // de ellas tenga la columna para no acusarla.
  const aliases = new Map();
  for (const [, table, alias] of sql.matchAll(
    /\b(?:from|join)\s+(public\.\w+)\s+(?:as\s+)?(\w+)\b/gi,
  )) {
    if (/^(on|where|using|left|right|inner|outer|cross|join|group|order|set|select)$/i.test(alias)) {
      continue;
    }
    const key = table.replace(/^public\./, "");
    if (!aliases.has(alias)) aliases.set(alias, new Set());
    aliases.get(alias).add(key);
  }

  // Un mismo alias puede atarse a una tabla en un sitio y a un CTE en otro
  // —`from public.activities a` arriba y `from por_area a` abajo—. Cuando eso
  // pasa no hay forma de saber a cuál se refiere cada línea, así que el alias
  // se descarta entero: mejor no mirarlo que acusar en falso.
  const ambiguous = new Set();
  for (const [, source, alias] of sql.matchAll(
    /\b(?:from|join)\s+([\w.]+)\s+(?:as\s+)?(\w+)\b/gi,
  )) {
    if (source.startsWith("public.")) continue;
    if (/^(select|as|on|where|using|left|right|inner|outer|cross|join|lateral)$/i.test(source)) {
      continue;
    }
    ambiguous.add(alias);
  }

  const problems = [];
  const lines = sql.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith("--")) continue;

    for (const [, alias, column] of lines[i].matchAll(/\b([a-z]\w{0,3})\.(\w+)\b/g)) {
      const tables = aliases.get(alias);
      if (!tables || dynamic.has(column) || ambiguous.has(alias)) continue;

      let known = false;
      const missing = [];
      for (const table of tables) {
        const cols = columns.get(table);
        // Vista o tabla que no se pudo leer: no hay nada que comprobar.
        if (cols === null || cols === undefined) {
          known = true;
          break;
        }
        if (cols.has(column)) {
          known = true;
          break;
        }
        missing.push(table);
      }

      if (!known) {
        problems.push({ line: i + 1, alias, column, tables: missing.join(", "), text: lines[i].trim() });
      }
    }
  }

  if (problems.length === 0) {
    console.log(`OK     ${target}`);
  } else {
    failures += 1;
    console.log(`FALLO  ${target}: ${problems.length} referencia(s) a columnas que la tabla no tiene`);
    for (const problem of problems) {
      console.log(`       línea ${problem.line}: ${problem.alias}.${problem.column}  (${problem.alias} → ${problem.tables})`);
      console.log(`         ${problem.text.slice(0, 110)}`);
    }
  }
}

console.log(
  failures === 0
    ? "\nNinguna migración referencia una columna que no exista."
    : `\n${failures} migración(es) con referencias rotas.`,
);
process.exit(failures === 0 ? 0 : 1);
