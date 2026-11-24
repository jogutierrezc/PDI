#!/usr/bin/env node
/* =============================================================================
   Importa una tabla pública de THE Impact Rankings (la que trae la página de
   THE en su <script id="__NEXT_DATA__">) para el analizador de posicionamiento
   (/admin/rankings/posicion).

     node scripts/import-the-impact.mjs <captura.har | next-data.json> [opciones]

   Opciones
     --year 2026          el año de la tabla (por defecto, el que dice la página)
     --sql <archivo>      dónde escribir el SQL (por defecto, la migración 0148
                          para la tabla general de 2026; si no, solo imprime)
     --solo-datos         el SQL sin las tablas ni las políticas: para cargar
                          otro año u otra tabla sobre una base que ya tiene 0148
     --capturado <iso>    fecha de la captura si la entrada es un JSON (en un
                          HAR se toma la hora de la respuesta)

   Escribe
     supabase/seed/the-impact-<año>[-sdgN].json   solo lo necesario: año, tipo,
                                                  fecha de captura, títulos de
                                                  los ODS y las filas normalizadas
                                                  (sin anuncios, enlaces de
                                                  registro ni datos de ejecución)
     supabase/migrations/0148_the_impact_ranking.sql   (o --sql) las tablas
                                                  the_impact_rows,
                                                  the_impact_snapshots y RLS, y
                                                  los datos (borrar e insertar
                                                  el año y la tabla: idempotente)

   Bandas: «=96» → 96..96 (empate) · «301–400» → 301..400 · «1501+» → 1501..null.
   Puntajes: «60.7–66.1» → 60,7..66,1 · un valor → lo = hi.

   Lo que trae la página de THE: la tabla general del año (todas las
   universidades) con el ODS 17 y los TRES mejores ODS de cada una. No trae las
   tablas completas por ODS ni los años anteriores. Si se captura la página de
   un ODS (tipo «…sdgN…»), se guarda con scope «sdgN» en la misma tabla.
   Los «rank» exactos que vienen dentro de una banda son el orden alfabético,
   no la posición: no se guardan.

   La lógica de bandas es la de src/modules/rankings/posicion/bandas.ts; la
   prueba tests/noticias/the-impact-db.test.ts compara las dos.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- Argumentos ----------------------------------------------------- */

const args = process.argv.slice(2);
const opcion = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const entrada = args.find((a, i) => !a.startsWith("--") && !["--year", "--sql", "--capturado"].includes(args[i - 1]));
if (!entrada) {
  console.error("Uso: node scripts/import-the-impact.mjs <captura.har | next-data.json> [--year 2026] [--sql archivo] [--solo-datos] [--capturado 2026-10-13]");
  process.exit(1);
}

/* ---------- Bandas (copia de posicion/bandas.ts) --------------------------- */

const GUION = /\s*[–—-]\s*/;

function parseBanda(texto) {
  const label = String(texto ?? "").trim();
  if (!label) return null;
  const empate = label.startsWith("=");
  const t = label.replace(/^=/, "");
  const abierta = /^(\d+)\s*\+$/.exec(t);
  if (abierta) return { lo: Number(abierta[1]), hi: null, empate, label };
  const partes = t.split(GUION).map((x) => x.replace(/,/g, ""));
  if (partes.length === 1 && /^\d+$/.test(partes[0])) return { lo: Number(partes[0]), hi: Number(partes[0]), empate, label };
  if (partes.length === 2 && /^\d+$/.test(partes[0]) && /^\d+$/.test(partes[1])) {
    const a = Number(partes[0]);
    const b = Number(partes[1]);
    return { lo: Math.min(a, b), hi: Math.max(a, b), empate, label };
  }
  return null;
}

function parseRango(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const nums = t.split(GUION).map((x) => (/^\d+(\.\d+)?$/.test(x) ? Number(x) : NaN));
  if (nums.some((n) => !Number.isFinite(n)) || nums.length > 2) return null;
  const [a, b = a] = nums;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

/* ---------- Lectura -------------------------------------------------------- */

function nextDataDe(html) {
  const m = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
}

const configDe = (next) => next?.props?.pageProps?.page?.rankingsTableConfig ?? next?.pageProps?.page?.rankingsTableConfig ?? null;

/** Del HAR, la respuesta de THE cuyo __NEXT_DATA__ trae una tabla de Impact. */
function desdeHar(har) {
  const candidatas = [];
  for (const e of har?.log?.entries ?? []) {
    const c = e.response?.content;
    if (!c?.text || !/html/.test(c.mimeType ?? "")) continue;
    const html = c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text;
    if (!html.includes("__NEXT_DATA__")) continue;
    const config = configDe(nextDataDe(html));
    if (config?.rankingsData?.data?.length && /impact/i.test(String(config.type ?? ""))) {
      candidatas.push({ config, url: e.request?.url ?? "", capturado: e.startedDateTime ?? null });
    }
  }
  if (!candidatas.length) throw new Error("El HAR no trae ninguna página de THE Impact Rankings con __NEXT_DATA__.");
  return candidatas[candidatas.length - 1];
}

function leerEntrada(ruta) {
  const texto = readFileSync(ruta, "utf8");
  const json = JSON.parse(texto);
  if (json?.log?.entries) return desdeHar(json);
  const config = configDe(json) ?? json?.rankingsTableConfig ?? (json?.rankingsData ? json : null);
  if (!config?.rankingsData?.data?.length) throw new Error("El JSON no trae rankingsTableConfig.rankingsData.data.");
  return { config, url: "", capturado: opcion("--capturado") ?? null };
}

/* ---------- Normalización -------------------------------------------------- */

const entero = (v) => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return String(v ?? "").trim() && Number.isFinite(n) ? Math.round(n) : null;
};

function fila(d) {
  const rank = parseBanda(d.rank);
  const overall = parseRango(d.scores_overall);
  const s17 = parseRango(d.sdg17_rankings_score_display);
  const r17 = parseBanda(d.sdg17_rankings_rank_display);
  if (!rank || !overall) throw new Error(`Fila sin puesto o puntaje: ${d.name} (${d.rank} · ${d.scores_overall})`);
  return {
    rank_label: rank.label,
    rank_lo: rank.lo,
    rank_hi: rank.hi,
    overall_lo: overall.lo,
    overall_hi: overall.hi,
    name: String(d.name ?? "").trim(),
    country: String(d.location ?? "").trim(),
    students: entero(d.stats_number_students),
    sdg17_lo: s17?.lo ?? null,
    sdg17_hi: s17?.hi ?? null,
    sdg17_rank_label: r17?.label ?? null,
    sdg17_rank_lo: r17?.lo ?? null,
    sdg17_rank_hi: r17?.hi ?? null,
    best: (d.best_scores ?? [])
      .map((b) => {
        const s = parseRango(b.score_display);
        const r = parseBanda(b.rank_display);
        return s && r ? { sdg: Number(b.sdg_number), lo: s.lo, hi: s.hi, rank_label: r.label, rank_lo: r.lo, rank_hi: r.hi } : null;
      })
      .filter(Boolean),
    iid: String(d.iid ?? d.nid ?? d.name),
    nid: entero(d.nid),
  };
}

const { config, url, capturado } = leerEntrada(resolve(entrada));
const year = Number(opcion("--year") ?? config.year);
if (!Number.isInteger(year) || year < 2019 || year > 2100) throw new Error(`Año inválido: ${opcion("--year") ?? config.year}`);
const tipo = String(config.type ?? "world_impact_rankings");
const sdgTabla = /sdg[_-]?(\d{1,2})/i.exec(tipo);
const scope = sdgTabla ? `sdg${Number(sdgTabla[1])}` : "overall";
const rows = config.rankingsData.data.map(fila);

const iids = new Set();
for (const r of rows) {
  if (iids.has(r.iid)) throw new Error(`iid repetido: ${r.iid} (${r.name})`);
  iids.add(r.iid);
}

const sdgs = Object.values(config.rankingsData.sdg_rankings ?? {})
  .map((s) => ({ n: Number(s.sdg_number), title: String(s.title ?? ""), url: String(s.url ?? "") }))
  .filter((s) => s.n >= 1 && s.n <= 17)
  .sort((a, b) => a.n - b.n);

const capturedAt = capturado ? new Date(capturado).toISOString() : null;
const seed = {
  source: "THE Impact Rankings",
  page: url || "https://www.timeshighereducation.com/impactrankings",
  json_url: String(config.jsonUrl ?? ""),
  year,
  type: tipo,
  scope,
  captured_at: capturedAt,
  row_count: rows.length,
  sdgs,
  rows,
};

const nombre = `the-impact-${year}${scope === "overall" ? "" : `-${scope}`}`;
const seedPath = join(ROOT, "supabase/seed", `${nombre}.json`);
// Una universidad por línea: el archivo se lee y se compara (diff) fácil.
const { rows: _filas, sdgs: _sdgs, ...cabecera } = seed;
const cuerpo = JSON.stringify(cabecera, null, 1).replace(/\n}$/, "");
writeFileSync(
  seedPath,
  `${cuerpo},\n "sdgs": [\n${sdgs.map((s) => `  ${JSON.stringify(s)}`).join(",\n")}\n ],\n "rows": [\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n ]\n}\n`,
);

/* ---------- SQL ------------------------------------------------------------ */

const DDL = `-- =============================================================================
-- 0148 · THE Impact Rankings: la tabla pública de cada año, para el analizador
-- de posicionamiento (/admin/rankings/posicion).
--
-- GENERADA por scripts/import-the-impact.mjs: no la edite a mano; vuelva a
-- correr el importador.
--
--   the_impact_rows       una fila por universidad, año y tabla (scope
--                         «overall» = la general; «sdgN» = la de un ODS, si
--                         algún día se captura). Puestos y puntajes como
--                         rangos: «601–800» → rank_lo 601, rank_hi 800;
--                         «1501+» → rank_hi null; «=96» → 96..96 (empate);
--                         «60.7–66.1» → overall_lo 60.7, overall_hi 66.1.
--                         best = los tres mejores ODS que publica THE
--                         [{sdg, lo, hi, rank_label, rank_lo, rank_hi}].
--   the_impact_snapshots  de dónde y cuándo salió cada carga.
--
-- Quién puede qué: es un dato público de THE, pero se usa para un análisis
-- interno. Leen Planeación y la administración; nadie escribe desde la
-- aplicación (solo esta migración o la clave de servicio). Sin acceso anónimo.
-- Todo DELETE lleva WHERE (safeupdate, ver 0095). Idempotente.
-- =============================================================================

create table if not exists public.the_impact_rows (
  year int not null,
  scope text not null default 'overall',
  rank_lo int not null,
  rank_hi int,
  rank_label text not null,
  overall_lo numeric not null,
  overall_hi numeric not null,
  name text not null,
  country text not null default '',
  students int,
  sdg17_lo numeric,
  sdg17_hi numeric,
  sdg17_rank_label text,
  sdg17_rank_lo int,
  sdg17_rank_hi int,
  best jsonb not null default '[]'::jsonb,
  iid text not null,
  nid int,
  constraint the_impact_rows_year check (year between 2019 and 2100),
  constraint the_impact_rows_scope check (scope ~ '^(overall|sdg([1-9]|1[0-7]))$'),
  constraint the_impact_rows_rank check (rank_lo >= 1 and (rank_hi is null or rank_hi >= rank_lo)),
  constraint the_impact_rows_overall check (overall_lo <= overall_hi),
  constraint the_impact_rows_best check (jsonb_typeof(best) = 'array'),
  constraint the_impact_rows_unique unique (year, scope, iid)
);

create index if not exists the_impact_rows_country on public.the_impact_rows (year, scope, country);

create table if not exists public.the_impact_snapshots (
  year int not null,
  scope text not null default 'overall',
  source text not null,
  captured_at timestamptz,
  row_count int not null default 0,
  notes text not null default '',
  loaded_at timestamptz not null default now(),
  constraint the_impact_snapshots_pk primary key (year, scope)
);

alter table public.the_impact_rows enable row level security;
alter table public.the_impact_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['the_impact_rows', 'the_impact_snapshots'] loop
    execute format('drop policy if exists %I on public.%I', t || '_planeacion', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.has_role_at_least('planeacion'))$p$, t || '_planeacion', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const notas = `Página pública de THE (${seed.page}). Trae la tabla general con el ODS 17 y los tres mejores ODS de cada universidad; no trae las tablas por ODS ni los años anteriores.`;
const datosJson = JSON.stringify(rows);
if (datosJson.includes("$the$")) throw new Error("Los datos contienen el delimitador $the$.");

const DATOS = `
-- ---------- Datos: THE Impact Rankings ${year} · ${scope} (${rows.length} universidades) ----------

delete from public.the_impact_rows where year = ${year} and scope = ${lit(scope)};

insert into public.the_impact_rows (year, scope, rank_lo, rank_hi, rank_label, overall_lo, overall_hi, name, country, students,
  sdg17_lo, sdg17_hi, sdg17_rank_label, sdg17_rank_lo, sdg17_rank_hi, best, iid, nid)
select ${year}, ${lit(scope)}, r.rank_lo, r.rank_hi, r.rank_label, r.overall_lo, r.overall_hi, r.name, r.country, r.students,
  r.sdg17_lo, r.sdg17_hi, r.sdg17_rank_label, r.sdg17_rank_lo, r.sdg17_rank_hi, coalesce(r.best, '[]'::jsonb), r.iid, r.nid
from jsonb_to_recordset($the$${datosJson}$the$::jsonb) as r(
  rank_lo int, rank_hi int, rank_label text, overall_lo numeric, overall_hi numeric, name text, country text, students int,
  sdg17_lo numeric, sdg17_hi numeric, sdg17_rank_label text, sdg17_rank_lo int, sdg17_rank_hi int, best jsonb, iid text, nid int);

insert into public.the_impact_snapshots (year, scope, source, captured_at, row_count, notes)
values (${year}, ${lit(scope)}, ${lit(`${seed.source} ${year}`)}, ${capturedAt ? `${lit(capturedAt)}::timestamptz` : "null"}, ${rows.length}, ${lit(notas)})
on conflict (year, scope) do update set source = excluded.source, captured_at = excluded.captured_at, row_count = excluded.row_count,
  notes = excluded.notes, loaded_at = now();
`;

const soloDatos = args.includes("--solo-datos");
const sqlPorDefecto = !soloDatos && year === 2026 && scope === "overall" ? join(ROOT, "supabase/migrations/0148_the_impact_ranking.sql") : null;
const sqlPath = opcion("--sql") ? resolve(opcion("--sql")) : sqlPorDefecto;
const sql = (soloDatos ? "" : DDL) + DATOS;
if (sqlPath) writeFileSync(sqlPath, sql);
else process.stdout.write(sql);

const col = rows.filter((r) => r.country === "Colombia").length;
console.error(`THE Impact ${year} · ${scope}: ${rows.length} universidades (${col} de Colombia). Captura: ${capturedAt ?? "sin fecha"}.`);
console.error(`  ${seedPath.replace(ROOT, ".")}`);
if (sqlPath) console.error(`  ${sqlPath.replace(ROOT, ".")}`);
