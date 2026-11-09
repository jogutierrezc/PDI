/* =============================================================================
   Biblioteca de evidencias · el texto de cada archivo CON SU LUGAR (0265).

   `extraer-texto.ts` da un texto corrido por archivo. Aquí se lee el mismo
   archivo en FRAGMENTOS que dicen de dónde son, para que una cifra pueda citar
   «p. 12», «Hoja «Ventas» · celda C14» o «Diapositiva 3», y para que una tabla
   de Excel conserve sus encabezados:

     · PDF        → una página por fragmento (pdf.js, hasta PAGINAS_PDF_FRAG).
     · PowerPoint → una diapositiva por fragmento (con sus notas).
     · Word       → grupos de párrafos bajo su título; cada tabla, aparte.
     · Excel      → cada tabla de cada hoja (bloques separados por filas vacías),
                    con celdas tipadas: números, porcentajes y fechas se
                    distinguen; las celdas combinadas se rellenan.
     · CSV/TSV    → igual que una hoja.
     · txt, md, html, OpenDocument… → trozos de texto («parte 3»).

   Todo sin IA y en el navegador. Cada lectura tiene tope de tiempo, de tamaño y
   de celdas; nunca lanza: los errores vuelven como estado.
   ========================================================================== */

import { strFromU8, unzipSync } from "fflate";
import { readDocx } from "../../admin/udes-en-cifras/import/docx";
import { readPdfPages } from "../../admin/pilo-ensenanza/ingest/pdf";
import { importFresh } from "../../../lib/stale-chunk";
import { LIMITE_LECTURA, decodificar, decodificarEntidades, extraerTexto, htmlATexto, lectorDe, recortar, textoOffice, xmlATexto } from "./extraer-texto";
import type { TextoExtraido } from "./extraer-texto";

export type TipoFragmento = "pagina" | "diapositiva" | "parrafos" | "tabla" | "texto";

/** Una tabla: dónde empieza en la hoja (1 = fila 1 / columna A) y sus celdas. Números como número; lo demás, texto. */
export interface TablaFrag {
  fila0: number;
  col0: number;
  celdas: (string | number | null)[][];
}

export interface FragmentoNuevo {
  orden: number;
  tipo: TipoFragmento;
  /** «p. 12», «Diapositiva 3», «Hoja «Ventas» · filas 3–20», «Sección «Resultados»». */
  ubicacion: string;
  hoja: string | null;
  texto: string;
  tabla: TablaFrag | null;
}

export interface LecturaFragmentos {
  fragmentos: FragmentoNuevo[];
  estado: TextoExtraido["estado"];
  nota: string | null;
}

export const PAGINAS_PDF_FRAG = 150;
export const MAX_FRAGMENTOS = 700;
export const MAX_CELDAS = 100_000;
const TEXTO_FRAGMENTO = 8_000;
const TROZO = 2_400;
const FILAS_TABLA = 3_000;
const COLUMNAS_TABLA = 60;
const TIEMPO_PDF_MS = 60_000;

const compacto = (t: string) => t.replace(/\s+/g, " ").trim();
const corto = (t: string, n: number) => (t.length > n ? t.slice(0, n) : t);

/* ---------- Texto en trozos ---------------------------------------------------- */

/** Parte un texto largo en trozos de ~TROZO caracteres cortando en el final de una frase. */
export function enTrozos(texto: string, max = TROZO): string[] {
  const t = compacto(texto);
  if (!t) return [];
  const out: string[] = [];
  let actual = "";
  for (const frase of t.split(/(?<=[.!?])\s+/)) {
    if (actual && actual.length + frase.length + 1 > max) {
      out.push(actual);
      actual = "";
    }
    actual = actual ? `${actual} ${frase}` : frase;
    while (actual.length > max * 1.5) {
      out.push(actual.slice(0, max));
      actual = actual.slice(max);
    }
  }
  if (actual) out.push(actual);
  return out;
}

function fragmentosDeTexto(texto: string, base: string): FragmentoNuevo[] {
  return enTrozos(texto).map((t, i, a) => ({ orden: 0, tipo: "texto" as const, ubicacion: a.length > 1 ? `${base} · parte ${i + 1} de ${a.length}` : base, hoja: null, texto: t, tabla: null }));
}

/* ---------- Tablas ------------------------------------------------------------- */

type Grilla = Map<number, Map<number, string | number>>;

const textoDeCelda = (c: string | number | null): string => (c === null ? "" : String(c));

/** Parte una grilla (fila → columna → valor, 1-based) en tablas separadas por dos o más filas vacías. */
export function tablasDeGrilla(grilla: Grilla, hoja: string | null, avisos: string[]): FragmentoNuevo[] {
  const filas = Array.from(grilla.keys()).sort((a, b) => a - b);
  const bloques: number[][] = [];
  for (const r of filas) {
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && r - ultimo[ultimo.length - 1] <= 2) ultimo.push(r);
    else bloques.push([r]);
  }
  const out: FragmentoNuevo[] = [];
  for (const rs of bloques) {
    const a = rs[0];
    let b = rs[rs.length - 1];
    let recortada = false;
    if (b - a + 1 > FILAS_TABLA) {
      b = a + FILAS_TABLA - 1;
      recortada = true;
    }
    let c0 = Infinity;
    let c1 = 0;
    let celdasLlenas = 0;
    for (let r = a; r <= b; r++) {
      for (const c of grilla.get(r)?.keys() ?? []) {
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
        celdasLlenas++;
      }
    }
    if (celdasLlenas < 2 || !Number.isFinite(c0)) continue;
    if (c1 - c0 + 1 > COLUMNAS_TABLA) c1 = c0 + COLUMNAS_TABLA - 1;
    const celdas: (string | number | null)[][] = [];
    for (let r = a; r <= b; r++) {
      const fila: (string | number | null)[] = [];
      for (let c = c0; c <= c1; c++) fila.push(grilla.get(r)?.get(c) ?? null);
      celdas.push(fila);
    }
    const texto = corto(celdas.map((f) => f.map(textoDeCelda).join(" | ")).join("\n"), TEXTO_FRAGMENTO);
    const filasTxt = a === b ? `fila ${a}` : `filas ${a}–${b}`;
    if (recortada) avisos.push(`${hoja ? `Hoja «${hoja}»` : "Tabla"}: se leyeron las primeras ${FILAS_TABLA} filas del bloque que empieza en la fila ${a}.`);
    out.push({ orden: 0, tipo: "tabla", ubicacion: hoja ? `Hoja «${hoja}» · ${filasTxt}` : `Tabla · ${filasTxt}`, hoja, texto, tabla: { fila0: a, col0: c0, celdas } });
  }
  return out;
}

/* ---------- CSV ---------------------------------------------------------------- */

export function filasCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((s) => ({ s, n: primera.split(s).length })).sort((x, y) => y.n - x.n)[0].s;
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entre = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entre) {
      if (ch === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') entre = false;
      else celda += ch;
    } else if (ch === '"') entre = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      celda = "";
      filas.push(fila);
      fila = [];
      if (filas.length > FILAS_TABLA * 2) break;
    } else celda += ch;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

function fragmentosDeCsv(bytes: Uint8Array, avisos: string[]): FragmentoNuevo[] {
  const filas = filasCsv(decodificar(bytes));
  const g: Grilla = new Map();
  filas.forEach((f, i) => {
    const m = new Map<number, string | number>();
    f.forEach((c, j) => {
      const t = c.trim();
      if (t) m.set(j + 1, t);
    });
    if (m.size) g.set(i + 1, m);
  });
  return tablasDeGrilla(g, null, avisos);
}

/* ---------- Excel -------------------------------------------------------------- */

const attr = (tag: string, nombre: string): string | null => {
  const m = new RegExp(`(?:^|[\\s<])${nombre}="([^"]*)"`).exec(tag);
  return m ? decodificarEntidades(m[1]) : null;
};

/** «C14» → { col: 3, fila: 14 }. */
function refACelda(ref: string): { col: number; fila: number } | null {
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, fila: Number(m[2]) };
}

const FECHA_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function categoriaFormato(id: number, codigos: Map<number, string>): "fecha" | "pct" | "num" {
  if (id === 9 || id === 10) return "pct";
  if (FECHA_IDS.has(id)) return "fecha";
  const codigo = codigos.get(id);
  if (!codigo) return "num";
  const limpio = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  if (limpio.includes("%")) return "pct";
  if (/[dmyhs]/i.test(limpio) && !/^(general|[0#?,.\s;_*()$-]+)$/i.test(limpio)) return "fecha";
  return "num";
}

/** Un número de serie de Excel como fecha ISO («2024-03-05»). */
function fechaDeSerie(n: number): string {
  const ms = Math.round((n - 25569) * 86_400_000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(n) : d.toISOString().slice(0, 10);
}

const pctTexto = (v: number): string => `${String(Math.round(v * 100 * 10_000) / 10_000).replace(".", ",")} %`;

function textoDeSi(si: string): string {
  const sinFonetica = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let t = "";
  for (const m of sinFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += decodificarEntidades(m[1]);
  return t;
}

export function fragmentosDeXlsx(bytes: Uint8Array, avisos: string[]): FragmentoNuevo[] {
  const archivos = unzipSync(bytes, {
    filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) && f.originalSize < 80 * 1024 * 1024,
  });
  const lee = (n: string): string => (archivos[n] ? strFromU8(archivos[n]) : "");
  const libro = lee("xl/workbook.xml");
  if (!libro) throw new Error("El archivo no parece un Excel (.xlsx): no tiene xl/workbook.xml.");

  const rels = new Map<string, string>();
  for (const m of lee("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const dest = attr(m[0], "Target");
    if (id && dest) rels.set(id, dest.startsWith("/") ? dest.replace(/^\//, "") : `xl/${dest.replace(/^\.\//, "")}`);
  }
  const compartidas: string[] = [];
  for (const m of lee("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)) compartidas.push(textoDeSi(m[1] ?? ""));

  const estilos = lee("xl/styles.xml");
  const codigos = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = attr(m[0], "numFmtId");
    const code = attr(m[0], "formatCode");
    if (id && code) codigos.set(Number(id), code);
  }
  const celdasXf = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? "";
  const categorias: ("fecha" | "pct" | "num")[] = [];
  for (const m of celdasXf.matchAll(/<xf\b[^>]*>/g)) categorias.push(categoriaFormato(Number(attr(m[0], "numFmtId") ?? 0), codigos));

  const out: FragmentoNuevo[] = [];
  let celdasTotal = 0;
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = attr(m[0], "name") ?? "Hoja";
    const estado = attr(m[0], "state");
    if (estado === "hidden" || estado === "veryHidden") {
      avisos.push(`Se omitió la hoja oculta «${nombre}».`);
      continue;
    }
    const ruta = rels.get(attr(m[0], "r:id") ?? "");
    const xml = ruta ? lee(ruta) : "";
    if (!xml) continue;

    const g: Grilla = new Map();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cuerpo = c[2];
      if (!cuerpo) continue;
      const ref = refACelda(attr(c[1], "r") ?? "");
      if (!ref || ref.fila > 60_000) continue;
      const t = attr(c[1], "t");
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor: string | number | null = null;
      if (t === "s") valor = v === undefined ? null : (compartidas[Number(v)] ?? null);
      else if (t === "inlineStr") valor = textoDeSi(/<is>([\s\S]*?)<\/is>/.exec(cuerpo)?.[1] ?? "");
      else if (t === "str") valor = v === undefined ? null : decodificarEntidades(v);
      else if (t === "b") valor = v === "1" ? "Sí" : v === "0" ? "No" : null;
      else if (t === "e") valor = null;
      else if (t === "d") valor = v ?? null;
      else if (v !== undefined && v.trim() !== "") {
        const n = Number(v);
        if (Number.isFinite(n)) {
          const cat = categorias[Number(attr(c[1], "s") ?? 0)] ?? "num";
          valor = cat === "fecha" ? fechaDeSerie(n) : cat === "pct" ? pctTexto(n) : n;
        }
      }
      if (valor === null || (typeof valor === "string" && !valor.trim())) continue;
      if (typeof valor === "string") valor = valor.replace(/\s+/g, " ").trim();
      let fila = g.get(ref.fila);
      if (!fila) g.set(ref.fila, (fila = new Map()));
      fila.set(ref.col, valor);
      if (++celdasTotal > MAX_CELDAS) break;
    }

    // Celdas combinadas: el texto de la primera se repite en las demás (encabezados que abarcan varias columnas).
    for (const mc of xml.matchAll(/<mergeCell\b[^>]*>/g)) {
      const [a, b] = (attr(mc[0], "ref") ?? "").split(":");
      const ini = refACelda(a ?? "");
      const fin = refACelda(b ?? "");
      if (!ini || !fin || (fin.fila - ini.fila + 1) * (fin.col - ini.col + 1) > 60) continue;
      const ancla = g.get(ini.fila)?.get(ini.col);
      if (typeof ancla !== "string") continue;
      for (let r = ini.fila; r <= fin.fila; r++) {
        for (let cc = ini.col; cc <= fin.col; cc++) {
          let fila = g.get(r);
          if (!fila) g.set(r, (fila = new Map()));
          if (!fila.has(cc)) fila.set(cc, ancla);
        }
      }
    }
    out.push(...tablasDeGrilla(g, nombre, avisos));
    if (celdasTotal > MAX_CELDAS) {
      avisos.push(`El libro es muy grande: se leyeron las primeras ${MAX_CELDAS.toLocaleString("es-CO")} celdas con datos.`);
      break;
    }
  }
  return out;
}

/* ---------- Word, PowerPoint, PDF ---------------------------------------------- */

const ES_TITULO = /^(?:heading|t[ií]tulo|ttulo|title)\s?\d*$/i;

export function fragmentosDeDocx(bytes: Uint8Array): FragmentoNuevo[] {
  const out: FragmentoNuevo[] = [];
  let seccion = "";
  let grupo: string[] = [];
  let desde = 0;
  let nPar = 0;
  let nTabla = 0;
  let partes = 0;
  const cierra = () => {
    if (!grupo.length) return;
    partes++;
    const base = seccion ? `Sección «${corto(seccion, 80)}»` : `Párrafos ${desde}–${nPar}`;
    out.push({ orden: 0, tipo: "parrafos", ubicacion: seccion && partes > 1 ? `${base} (parte ${partes})` : base, hoja: null, texto: corto(grupo.join(" "), TEXTO_FRAGMENTO), tabla: null });
    grupo = [];
  };
  for (const b of readDocx(bytes)) {
    if (b.type === "table") {
      cierra();
      nTabla++;
      const celdas = b.rows.slice(0, FILAS_TABLA).map((r) => r.slice(0, COLUMNAS_TABLA).map((c) => compacto(c) || null));
      if (!celdas.some((r) => r.some((c) => c !== null))) continue;
      out.push({
        orden: 0,
        tipo: "tabla",
        ubicacion: seccion ? `Tabla ${nTabla} (sección «${corto(seccion, 60)}»)` : `Tabla ${nTabla}`,
        hoja: null,
        texto: corto(celdas.map((r) => r.map(textoDeCelda).join(" | ")).join("\n"), TEXTO_FRAGMENTO),
        tabla: { fila0: 1, col0: 1, celdas },
      });
      continue;
    }
    const t = compacto(b.text);
    if (!t) continue;
    if (ES_TITULO.test(b.style) && t.length <= 160) {
      cierra();
      seccion = t;
      partes = 0;
      continue;
    }
    nPar++;
    if (!grupo.length) desde = nPar;
    grupo.push(t);
    if (grupo.join(" ").length >= TROZO) cierra();
  }
  cierra();
  return out;
}

export function fragmentosDePptx(bytes: Uint8Array): FragmentoNuevo[] {
  const archivos = unzipSync(bytes, { filter: (f) => /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(f.name) && f.originalSize < 40 * 1024 * 1024 });
  const numero = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
  const notas = new Map<number, string>();
  for (const n of Object.keys(archivos)) if (n.includes("notesSlides")) notas.set(numero(n), xmlATexto(strFromU8(archivos[n])));
  const out: FragmentoNuevo[] = [];
  for (const n of Object.keys(archivos).filter((x) => x.includes("slides/slide")).sort((a, b) => numero(a) - numero(b))) {
    const i = numero(n);
    const cuerpo = xmlATexto(strFromU8(archivos[n]));
    const nota = notas.get(i);
    const texto = corto(nota ? `${cuerpo} Notas del orador: ${nota}` : cuerpo, TEXTO_FRAGMENTO);
    if (texto) out.push({ orden: 0, tipo: "diapositiva", ubicacion: `Diapositiva ${i}`, hoja: null, texto, tabla: null });
  }
  return out;
}

async function fragmentosDePdf(bytes: Uint8Array): Promise<{ fragmentos: FragmentoNuevo[]; escaneado: boolean; recortado: boolean }> {
  const { loadPdfPages } = await importFresh(() => import("../../admin/pilo-ensenanza/ingest/pdf-load"));
  const paginas = await loadPdfPages(bytes.slice(), PAGINAS_PDF_FRAG);
  const doc = readPdfPages(paginas);
  if (doc.scanned) return { fragmentos: [], escaneado: true, recortado: false };
  const porPagina = new Map<number, string[]>();
  let ultima = 1;
  for (const b of doc.blocks) {
    const texto = b.type === "table" ? b.rows.map((r) => r.join(" ")).join(" ") : b.text;
    const p = b.page ?? ultima;
    ultima = p;
    const a = porPagina.get(p);
    if (a) a.push(texto);
    else porPagina.set(p, [texto]);
  }
  const fragmentos = Array.from(porPagina.keys())
    .sort((a, b) => a - b)
    .map((p) => ({ orden: 0, tipo: "pagina" as const, ubicacion: `p. ${p}`, hoja: null, texto: corto(compacto((porPagina.get(p) ?? []).join(" ")), TEXTO_FRAGMENTO), tabla: null }))
    .filter((f) => f.texto);
  return { fragmentos, escaneado: false, recortado: doc.pages >= PAGINAS_PDF_FRAG };
}

/* ---------- Entrada ------------------------------------------------------------ */

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, mal) => {
    const reloj = setTimeout(() => mal(new Error(`La lectura pasó de ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => (clearTimeout(reloj), ok(v)),
      (e) => (clearTimeout(reloj), mal(e)),
    );
  });
}

const numerar = (fs: FragmentoNuevo[]): FragmentoNuevo[] => fs.slice(0, MAX_FRAGMENTOS).map((f, i) => ({ ...f, orden: i }));

/** Lectura síncrona de lo que no es PDF. */
export function fragmentosSync(bytes: Uint8Array, ext: string, avisos: string[] = []): FragmentoNuevo[] {
  switch (ext) {
    case "xlsx":
      return fragmentosDeXlsx(bytes, avisos);
    case "csv":
    case "tsv":
      return fragmentosDeCsv(bytes, avisos);
    case "docx":
      return fragmentosDeDocx(bytes);
    case "pptx":
      return fragmentosDePptx(bytes);
    case "odt":
    case "odp":
    case "ods":
      return fragmentosDeTexto(textoOffice(bytes, ext), "Texto");
    case "html":
    case "htm":
      return fragmentosDeTexto(htmlATexto(decodificar(bytes)), "Texto");
    default:
      return fragmentosDeTexto(decodificar(bytes), "Texto");
  }
}

/** Lee un archivo en fragmentos con su ubicación. Nunca lanza: los errores vuelven como estado. */
export async function extraerFragmentos(bytes: Uint8Array, ext: string): Promise<LecturaFragmentos> {
  const lector = lectorDe(ext);
  if (!lector) return { fragmentos: [], estado: "no_aplica", nota: "Formato sin lector: no tiene ubicaciones." };
  if (bytes.length > LIMITE_LECTURA) return { fragmentos: [], estado: "no_aplica", nota: "Muy pesado para leerlo en el navegador." };
  const avisos: string[] = [];
  try {
    let fragmentos: FragmentoNuevo[];
    if (lector === "pdf") {
      const r = await conTope(fragmentosDePdf(bytes), TIEMPO_PDF_MS);
      if (r.escaneado) return { fragmentos: [], estado: "sin_texto", nota: "PDF escaneado, sin texto: revisar a mano." };
      if (r.recortado) avisos.push(`Se leyeron las primeras ${PAGINAS_PDF_FRAG} páginas.`);
      fragmentos = r.fragmentos;
    } else {
      await new Promise((r) => setTimeout(r, 0));
      fragmentos = fragmentosSync(bytes, ext, avisos);
    }
    const lista = numerar(fragmentos);
    if (fragmentos.length > MAX_FRAGMENTOS) avisos.push(`Solo se guardaron los primeros ${MAX_FRAGMENTOS} fragmentos de ${fragmentos.length}.`);
    if (!lista.length) return { fragmentos: [], estado: "sin_texto", nota: "El archivo no trae texto: revisar a mano." };
    return { fragmentos: lista, estado: "ok", nota: avisos.length ? avisos.join(" ") : null };
  } catch (e) {
    return { fragmentos: [], estado: "error", nota: `No se pudo leer el archivo por ubicaciones (${e instanceof Error ? e.message : "error"}).` };
  }
}

/**
 * El texto corrido (para clasificar) y los fragmentos (para citar) de un archivo. El PDF se lee una sola vez y de él sale
 * el texto; el resto conserva el lector de siempre para no cambiar cómo se clasifica.
 */
export async function leerArchivoCompleto(bytes: Uint8Array, ext: string): Promise<{ texto: TextoExtraido; lectura: LecturaFragmentos }> {
  const lectura = await extraerFragmentos(bytes, ext);
  if (ext === "pdf") {
    const unido = lectura.fragmentos.map((f) => f.texto).join(" ");
    const texto: TextoExtraido =
      lectura.estado === "ok" ? { texto: recortar(unido), estado: "ok", nota: lectura.nota } : { texto: "", estado: lectura.estado, nota: lectura.nota };
    return { texto, lectura };
  }
  return { texto: await extraerTexto(bytes, ext), lectura };
}
