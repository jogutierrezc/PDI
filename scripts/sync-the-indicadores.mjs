#!/usr/bin/env node
/* Copia el mapa de indicadores de THE a la función de Deno.

   La función supabase/functions/pilo-rankingsod no puede importar de src/, así
   que lleva una copia exacta de src/modules/rankings/informes/the-indicadores.ts
   con el tipo IndicadorTHE (de tipos.ts) pegado en lugar del import.

     node scripts/sync-the-indicadores.mjs           reescribe la copia
     node scripts/sync-the-indicadores.mjs --check   falla si la copia difiere
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ORIGEN = "src/modules/rankings/informes/the-indicadores.ts";
export const TIPOS = "src/modules/rankings/informes/tipos.ts";
export const DESTINO = "supabase/functions/pilo-rankingsod/indicadores.ts";
const IMPORT = 'import type { IndicadorTHE } from "./tipos";';

const CABECERA = `// ARCHIVO GENERADO: no editar a mano.
// Copia de ${ORIGEN} (con el tipo IndicadorTHE de ${TIPOS}).
// Para cambiarlo, edite el original y ejecute: node scripts/sync-the-indicadores.mjs
`;

const unix = (s) => s.replace(/\r\n/g, "\n");

/** Saca de tipos.ts la interfaz IndicadorTHE con su comentario. */
function tipoIndicador(tipos) {
  const ini = tipos.indexOf("export interface IndicadorTHE {");
  if (ini < 0) throw new Error(`No se encontró «export interface IndicadorTHE» en ${TIPOS}`);
  const doc = tipos.lastIndexOf("/**", ini);
  const desde = doc >= 0 && tipos.slice(doc, ini).trim().endsWith("*/") ? doc : ini;
  const fin = tipos.indexOf("\n}\n", ini);
  if (fin < 0) throw new Error("La interfaz IndicadorTHE no cierra con «}» en su propia línea");
  return tipos.slice(desde, fin + 2);
}

/** El contenido que debe tener la copia de Deno. */
export function generarCopia(raiz = RAIZ) {
  const origen = unix(readFileSync(resolve(raiz, ORIGEN), "utf8"));
  const tipos = unix(readFileSync(resolve(raiz, TIPOS), "utf8"));
  if (!origen.includes(IMPORT)) throw new Error(`${ORIGEN} debe importar el tipo así: ${IMPORT}`);
  return CABECERA + origen.replace(IMPORT, tipoIndicador(tipos));
}

/** La copia actual en disco, o null si no existe. */
export function copiaActual(raiz = RAIZ) {
  try {
    return unix(readFileSync(resolve(raiz, DESTINO), "utf8"));
  } catch {
    return null;
  }
}

/** true si la copia de Deno es idéntica a lo que se generaría hoy. */
export function copiaAlDia(raiz = RAIZ) {
  return copiaActual(raiz) === generarCopia(raiz);
}

function main(args) {
  if (args.includes("--check")) {
    if (copiaAlDia()) {
      console.log(`${DESTINO} está al día.`);
      return 0;
    }
    console.error(`${DESTINO} difiere de ${ORIGEN}. Ejecute: node scripts/sync-the-indicadores.mjs`);
    return 1;
  }
  const destino = resolve(RAIZ, DESTINO);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, generarCopia(), "utf8");
  console.log(`Escrito ${DESTINO}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
