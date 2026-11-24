// Paneles con el texto exacto de los avisos del importador (salen de la prueba temporal: bitacora-avisos.json).
// Uso: node paneles-avisos.mjs <bitacora-avisos.json>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const PW = process.env.PLAYWRIGHT_CORE ?? "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import(PW);
const CAPS = join(dirname(fileURLToPath(import.meta.url)), "..", "capturas");
const b = JSON.parse(readFileSync(process.argv[2], "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const TIT = { s1: "Resumen ejecutivo", s2: "Alineación estratégica con el PDI", s3: "Objetivos y metas 2026", s4: "Resultados por dimensión estratégica", "s4:crit": "Resultados · criterios", s6: "Puntos críticos y acciones de mejora", s7: "Logros destacados", s8: "Evidencias y fuentes de verificación", s9: "Conclusiones" };
const css = `body{margin:0;padding:18px;background:#e9edf2;font-family:Aptos,Calibri,"Segoe UI",Arial,sans-serif;width:max-content}
.p{background:#fff;border:1px solid #cfd5dc;border-radius:10px;padding:16px 20px;width:1020px;box-shadow:0 4px 16px rgba(20,40,70,.12);color:#1b2530}
h3{margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a6672}
.cnt{display:flex;gap:28px;margin:8px 0 12px}.cnt b{font-size:26px;display:block}.cnt span{font-size:12.5px;color:#5a6672}
ul{margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.55}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #e3e7eb;padding:7px 8px;text-align:left}th{font-size:12px;color:#5a6672}
.ok{color:#0b7a43;font-weight:700}.rev{color:#9a6a00;font-weight:700}
.err{background:#fdecee;border:1px solid #f0b4bc;color:#8a1c2b;border-radius:8px;padding:12px 14px;font-size:14.5px}
.nota{background:#fff7e0;border:1px solid #ecd9a0;color:#6b5311;border-radius:8px;padding:10px 14px;font-size:14px;margin-top:8px}
.pie{font-size:12px;color:#7a8591;margin-top:10px}`;
const t = b.errores.totales;
const paneles = {
  "xls-errores-avisos": `<div class="p"><h3>Revisión</h3><div class="cnt"><div><b>${t.listas}</b><span>filas listas</span></div><div><b>${t.conAviso}</b><span>con aviso</span></div><div><b>${t.sinImportar}</b><span>sin importar</span></div></div><h3>${b.errores.avisos.length} avisos</h3><ul>${b.errores.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><p class="pie">Texto exacto que devuelve el importador (aplicar) con el libro de errores, modo «Agregar al final». La pantalla muestra los primeros 60.</p></div>`,
  "xls-errores-clasificacion": `<div class="p"><h3>Qué hoja va a qué sección</h3><table><tr><th>Hoja del libro</th><th>Sección de destino</th><th>Cómo se reconoció</th></tr>${b.errores.propuestas.map((p) => `<tr><td>${esc(p.hoja)}</td><td>${p.destino ? esc(TIT[p.destino] ?? p.destino) : "<i>No se importa (referencia del sistema)</i>"}</td><td class="${p.origen === "control" ? "ok" : "rev"}">${p.origen === "control" ? "Por _Control · 100 %" : "Por encabezados · " + Math.round(b.errores.soportes.puntaje * 100) + " %"}</td></tr>`).join("")}</table><p class="pie">La hoja «Mis soportes» fue renombrada por quien la diligenció: se reconoce por sus encabezados (Documento, Descripción, Enlace).</p></div>`,
  "xls-otro-informe-error": `<div class="p"><h3>Cargue el libro devuelto</h3><div class="err"><b>${esc(b.otro.error)}</b></div><div class="nota">${esc(b.huella[0])}</div><p class="pie">Arriba, el rechazo de un libro descargado de otro informe. Abajo, el aviso (no bloquea) cuando la estructura del informe cambió desde la descarga.</p></div>`,
};
const nav = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
const pag = await (await nav.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 800 } })).newPage();
for (const [n, h] of Object.entries(paneles)) {
  await pag.setContent(`<!doctype html><meta charset=utf-8><style>${css}</style><body>${h}</body>`);
  await pag.locator(".p").screenshot({ path: join(CAPS, `${n}.png`) });
}
await nav.close();
console.log("paneles listos");
