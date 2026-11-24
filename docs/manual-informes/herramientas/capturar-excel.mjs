// Renderiza las hojas de los .xlsx de docs/manual-informes/excel a PNG (2x) en docs/manual-informes/capturas/xls-*.png.
// Uso: node docs/manual-informes/herramientas/capturar-excel.mjs [filtro]
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const PW = process.env.PLAYWRIGHT_CORE ?? "/private/tmp/claude-501/-Users-coordinadorinteligenciadenegocios-Documents-PDI/519be8fa-3f90-41c1-9488-e21afcaa3e74/scratchpad/pw/node_modules/playwright-core/index.mjs";
const { chromium } = await import(PW);
import { abrir, hojaAHtml, pagina } from "./xlsx-a-html.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const EXCEL = join(AQUI, "..", "excel");
const CAPS = join(AQUI, "..", "capturas");
mkdirSync(CAPS, { recursive: true });
const filtro = process.argv[2] ?? "";

const L = "01-libro-completo-vacio/Informe_Gestion_2026_A.xlsx";
const G = "02-libro-diligenciado/Informe_Gestion_2026_A.xlsx";
const E = "04-libro-con-errores/Informe_Gestion_2026_A.xlsx";
const O = "05-libro-de-otro-informe/Informe_Gestion_2026_A.xlsx";
const EQ = (s) => `03-libros-por-equipo/Informe_Gestion_2026_A_${s}.xlsx`;
const P = (s) => `06-plantillas-de-filas/plantilla-${s}.xlsx`;
const R = "07-plantilla-resultados/plantilla-resultados-y-evidencias.xlsx";
const Q = "08-datos-requeridos-admin/datos-requeridos.xlsx";

const H = {
  portada: "00 Portada", resumen: "01 Resumen ejecutivo", pdi: "02 Alineación estratégica con e", metas: "03 Objetivos y metas 2026",
  crit: "04 Criterios", res: "04 Resultados por dimensión est", sint: "05 Síntesis de resultados insti", puntos: "06 Puntos críticos y acciones d",
  logros: "07 Logros destacados", evid: "08 Evidencias y fuentes de veri", concl: "09 Conclusiones", anexos: "10 Anexos", listas: "Listas", control: "_Control",
};
const ALTAS = { columnas: undefined };
const resA = { columnas: [0, 8] };
const resB = { columnas: [9, 17] };

const trabajos = [
  // Libro completo vacío (el que recibe la unidad)
  ["xls-instrucciones", L, H.portada, {}],
  ["xls-resumen", L, H.resumen, {}],
  ["xls-pdi", L, H.pdi, {}],
  ["xls-metas", L, H.metas, {}],
  ["xls-criterios", L, H.crit, {}],
  ["xls-resultados-a", L, H.res, resA],
  ["xls-resultados-b", L, H.res, resB],
  ["xls-sintesis", L, H.sint, {}],
  ["xls-puntos-criticos", L, H.puntos, {}],
  ["xls-logros", L, H.logros, {}],
  ["xls-evidencias", L, H.evid, {}],
  ["xls-conclusiones", L, H.concl, {}],
  ["xls-anexos", L, H.anexos, {}],
  ["xls-listas-oculta", L, H.listas, { filasLibres: 2 }],
  ["xls-control-oculta", L, H.control, { filasLibres: 2, anchoMin: 1100 }],
  // Libro diligenciado
  ["xls-lleno-resumen", G, H.resumen, {}],
  ["xls-lleno-pdi", G, H.pdi, {}],
  ["xls-lleno-metas", G, H.metas, {}],
  ["xls-lleno-criterios", G, H.crit, {}],
  ["xls-lleno-resultados-a", G, H.res, resA],
  ["xls-lleno-resultados-b", G, H.res, resB],
  ["xls-lleno-sintesis", G, H.sint, {}],
  ["xls-lleno-puntos-criticos", G, H.puntos, {}],
  ["xls-lleno-logros", G, H.logros, {}],
  ["xls-lleno-evidencias", G, H.evid, {}],
  ["xls-lleno-anexos", G, H.anexos, {}],
  // Libros por equipo
  ["xls-equipo-lidera", EQ("quien-lidera-el-informe"), H.portada, {}],
  ["xls-equipo-direccion", EQ("direccion-de-programa"), H.portada, {}],
  ["xls-equipo-secretaria", EQ("secretaria-academica"), H.portada, {}],
  ["xls-equipo-extension", EQ("coordinacion-de-extension"), H.portada, {}],
  ["xls-equipo-secretaria-resultados", EQ("secretaria-academica"), H.res, resA],
  ["xls-equipo-control-oculta", EQ("direccion-de-programa"), H.control, { filasLibres: 2, anchoMin: 1100 }],
  // Libro con errores
  ["xls-errores-metas", E, H.metas, { marcar: ["B8", "B9"] }],
  ["xls-errores-pdi", E, H.pdi, { marcar: ["A10"] }],
  ["xls-errores-criterios", E, H.crit, { marcar: ["B6"], nuevo: ["A12"] }],
  ["xls-errores-resultados-a", E, H.res, { ...resA, marcar: ["A15", "B16", "F17", "A19", "G20", "B21"], filasLibres: 1 }],
  ["xls-errores-resultados-b", E, H.res, { ...resB, marcar: ["J19", "K21", "L21", "P18"], filasLibres: 1 }],
  ["xls-errores-puntos-criticos", E, H.puntos, { marcar: ["A7", "C8"] }],
  ["xls-errores-logros", E, H.logros, { marcar: ["C7", "B8"] }],
  ["xls-errores-evidencias", E, "Mis soportes", { marcar: ["D8", "D9"] }],
  ["xls-errores-conclusiones", E, H.concl, { marcar: ["A5"] }],
  // Libro de otro informe
  ["xls-otro-informe-portada", O, H.portada, {}],
  // Plantillas de filas y de resultados
  ["xls-plantilla-puntos-criticos", P("puntos-criticos"), "Filas", {}],
  ["xls-plantilla-puntos-criticos-ayuda", P("puntos-criticos"), "Cómo llenar Filas", { filasLibres: 0, anchoMin: 1100 }],
  ["xls-plantilla-retos", P("retos-oportunidades"), "Filas", {}],
  ["xls-plantilla-logros", P("logros"), "Filas", {}],
  ["xls-plantilla-metas", P("objetivos-y-metas-anuales"), "Filas", {}],
  ["xls-plantilla-resultados-cifras-a", R, "Cifras", { columnas: [0, 9] }],
  ["xls-plantilla-resultados-acciones", R, "Acciones", { columnas: [0, 10] }],
  ["xls-plantilla-resultados-criterios", R, "Criterios", { filasLibres: 0, anchoMin: 1000 }],
  ["xls-plantilla-resultados-pilares", R, "Pilares", { filasLibres: 0, anchoMin: 1000 }],
  ["xls-datos-requeridos", Q, "Datos requeridos", { filasLibres: 2 }],
];

const nombresAbiertos = new Map();
const navegador = await chromium.launch({ executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", headless: true });
const ctx = await navegador.newContext({ deviceScaleFactor: 2, viewport: { width: 2000, height: 1400 } });
const pag = await ctx.newPage();
let n = 0;
for (const [salida, archivo, hoja, op] of trabajos) {
  if (filtro && !salida.includes(filtro)) continue;
  const ruta = join(EXCEL, archivo);
  if (!nombresAbiertos.has(ruta)) nombresAbiertos.set(ruta, await abrir(ruta));
  const wb = nombresAbiertos.get(ruta);
  const nombreArchivo = archivo.split("/").pop();
  const html = pagina(hojaAHtml(wb, hoja, { titulo: nombreArchivo, ...op }));
  await pag.setContent(html, { waitUntil: "load" });
  const win = pag.locator(".win");
  await win.screenshot({ path: join(CAPS, `${salida}.png`) });
  n++;
}
await navegador.close();
console.log(`${n} capturas en ${CAPS}`);
