/* =============================================================================
   Informe de Investigación desde la carpeta Informes/.

   Lee el Word y los CSV que entrega la Vicerrectoría de Investigaciones con el
   mismo importador de la intranet (src/modules/admin/udes-en-cifras/import) y
   escribe:
   · supabase/migrations/0023_investigacion_2020_2025.sql: aplica el plan con
     od_import_report(), en una transacción, sobre el informe "investigacion"
     del periodo vigente. Reemplaza las cifras ilustrativas de ese informe.
   · Informes/plan-investigacion.json: el plan, para revisarlo.

   Uso: node scripts/build-investigacion.mjs [carpeta]   (por defecto Informes)
   Muestra los avisos de calidad de los datos antes de escribir.
   ========================================================================== */

import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.resolve(ROOT, process.argv[2] ?? "Informes");
const OUT = path.join(ROOT, "supabase", "migrations", "0023_investigacion_2020_2025.sql");
const PLAN_OUT = path.join(DIR, "plan-investigacion.json");

const bundled = path.join(os.tmpdir(), `od-import-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(ROOT, "src/modules/admin/udes-en-cifras/import/investigacion.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundled,
  logLevel: "error",
});
const { investigacionProfile } = await import(pathToFileURL(bundled).href);
fs.rmSync(bundled);

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
const files = walk(DIR)
  .filter((file) => /\.(csv|docx)$/i.test(file) && !path.basename(file).startsWith("~$"))
  .map((file) => {
    const rel = path.relative(DIR, file).split(path.sep).join("/");
    return /\.docx$/i.test(file)
      ? { name: path.basename(file), path: rel, bytes: new Uint8Array(fs.readFileSync(file)) }
      : { name: path.basename(file), path: rel, text: fs.readFileSync(file, "utf8") };
  });

// El periodo vigente de la semilla (0020): 2020-2025 con tres campus.
const plan = investigacionProfile.build(files, {
  years: [2020, 2021, 2022, 2023, 2024, 2025],
  campuses: [
    { slug: "bucaramanga", label: "Bucaramanga" },
    { slug: "cucuta", label: "Cúcuta" },
    { slug: "valledupar", label: "Valledupar" },
  ],
});

fs.writeFileSync(PLAN_OUT, `${JSON.stringify(plan, null, 2)}\n`);

const json = JSON.stringify(plan).replace(/'/g, "''");
fs.writeFileSync(
  OUT,
  `-- =============================================================================
-- PDI · 0023 · UDES en Cifras · Investigación 2020-2025 (cifras de la VI)
--
-- Generado por scripts/build-investigacion.mjs a partir de Informes/: el Word
-- de la Sección Investigación y los CSV de datos_procesados. No editar a mano.
--
-- Reemplaza el contenido ilustrativo del informe "investigacion" del periodo
-- vigente con las ${plan.sections.length} secciones del informe, ${plan.indicators.length} indicadores,
-- ${plan.breakdowns.length} desgloses, ${plan.heatmaps.length} mapas de calor, ${plan.histories.length} evolución histórica y ${plan.tables.length} tablas.
-- Corte ${plan.corte}. Avisos de calidad: ${plan.warnings.length} (ver Informes/plan-investigacion.json).
--
-- Requiere 0019 a 0022. Idempotente: od_import_report() rehace el informe.
-- =============================================================================

select public.od_import_report(
  (select r.id from public.od_reports r join public.od_periods p on p.id = r.period_id
   where r.slug = 'investigacion' and p.is_current),
  '${json}'::jsonb
);
`,
);

console.log(
  `0023 escrita: ${plan.sections.length} secciones, ${plan.indicators.length} indicadores, ${plan.breakdowns.length} desgloses, ` +
    `${plan.heatmaps.length} mapas de calor, ${plan.histories.length} históricos, ${plan.tables.length} tablas, ${plan.blocks.length} bloques · corte ${plan.corte}`,
);
console.log(`Secciones: ${plan.sections.map((s) => `${s.number} ${s.status}`).join(" · ")}`);
if (plan.warnings.length) {
  console.log(`\nAvisos (${plan.warnings.length}):`);
  for (const w of plan.warnings) console.log(`  [${w.level}] ${w.section ?? "general"}: ${w.message}`);
}
const unused = plan.files.filter((f) => !f.used);
if (unused.length) console.log(`\nArchivos sin usar: ${unused.map((f) => f.name).join(", ")}`);
