/* =============================================================================
   Pilo Publica · cifras de los documentos de la biblioteca, con su lugar exacto.

   Lógica pura (sin red, sin IA). Lee los FRAGMENTOS de un archivo
   (ranking_biblioteca_fragmentos, 0265) y saca cifras de dos maneras:

     · PROSA (páginas de PDF, diapositivas, párrafos de Word, texto): la misma
       búsqueda de «número + objeto» de las notas, pero fragmento a fragmento, así
       cada cifra sabe su página o sección. El año sale de la FRASE donde está el
       número (el más cercano antes de él); solo si no hay, del año del documento.
       La cita es la frase completa, para leerla sin abrir el archivo.

     · TABLAS (Excel, CSV, tablas de Word): cada celda numérica se lee con su
       encabezado de columna y su rótulo de fila, y se queda con su celda (C14).
       Nada se adivina: una tabla sin encabezados reconocibles no da cifras, y se
       avisa. El año sale del encabezado de la columna o del rótulo de la fila.

   Lo que devuelve es un `CifraDoc`: la función `pilo-publica` le agrega la
   clave, el tipo de fuente y la referencia al archivo.
   ========================================================================== */

import { aNumero, extraerCifras } from "../pilo-rankingsod/cifras.ts";
import { normalizar } from "../pilo-rankingsod/logica.ts";
import type { SourceCifra } from "./contrato.ts";

/** Una tabla guardada: la posición de su primera celda en la hoja y sus celdas. */
export interface TablaFrag {
  /** Fila de la hoja de la primera fila de la tabla (1 = fila 1). */
  fila0: number;
  /** Columna de la hoja de la primera columna de la tabla (1 = A). */
  col0: number;
  celdas: (string | number | null)[][];
}

export interface FragmentoSrv {
  orden: number;
  tipo: string;
  ubicacion: string;
  hoja: string | null;
  texto: string;
  tabla: TablaFrag | null;
}

/** Una cifra de un documento, con el lugar de donde sale. */
export interface CifraDoc {
  /** Para armar la clave estable: ubicación + celda o frase. */
  id: string;
  que: string;
  label: string;
  unit: string;
  value: number;
  year: number | null;
  score: number;
  source: Partial<SourceCifra>;
}

export const CIFRAS_PROSA_POR_DOCUMENTO = 30;
export const CIFRAS_TABLA_POR_DOCUMENTO = 150;

const cortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/* ---------- Años ------------------------------------------------------------- */

const RE_ANIO = /(?<![\d.,])((?:19|20)\d{2})(?:\s?[-/]\s?(?:[12]|[ab]|i{1,2}))?(?![\d])/gi;

/** El año de una frase: el más cercano ANTES de la posición (el que encabeza lo que sigue); si no, el más cercano después. */
export function anioCercano(texto: string, pos: number, fin: number): { year: number; donde: "frase" | "cerca" } | null {
  const ini = Math.max(0, texto.lastIndexOf(". ", Math.max(0, pos - 1)) + 1);
  const finFrase = texto.indexOf(". ", fin);
  const hasta = finFrase < 0 ? Math.min(texto.length, fin + 200) : finFrase;
  const buscar = (a: number, b: number): { year: number; donde: "frase" | "cerca" } | null => {
    const trozo = texto.slice(a, b);
    let antes: { y: number; d: number } | null = null;
    let despues: { y: number; d: number } | null = null;
    for (const m of trozo.matchAll(RE_ANIO)) {
      const p = a + (m.index ?? 0);
      const y = Number(m[1]);
      if (p + m[0].length <= pos) {
        const d = pos - p;
        if (!antes || d < antes.d) antes = { y, d };
      } else if (p >= fin) {
        const d = p - fin;
        if (!despues || d < despues.d) despues = { y, d };
      }
    }
    const e = antes ?? despues;
    return e ? { year: e.y, donde: "frase" } : null;
  };
  const enFrase = buscar(ini, hasta);
  if (enFrase) return enFrase;
  const cerca = buscar(Math.max(0, pos - 320), pos);
  return cerca ? { year: cerca.year, donde: "cerca" } : null;
}

/** La frase que contiene el trozo [pos, fin), recortada a un tamaño legible. */
export function frasePorPos(texto: string, pos: number, fin: number, max = 420): string {
  const ini = Math.max(0, texto.lastIndexOf(". ", Math.max(0, pos - 1)) + 1);
  const finFrase = texto.indexOf(". ", fin);
  const hasta = finFrase < 0 ? texto.length : finFrase + 1;
  let frase = texto.slice(ini, hasta).trim();
  if (frase.length > max) {
    const desde = Math.max(0, pos - ini - Math.floor(max / 2) + 20);
    frase = `${desde > 0 ? "…" : ""}${texto.slice(ini + desde, ini + desde + max).trim()}…`;
  }
  return frase;
}

/* ---------- Prosa ------------------------------------------------------------ */

const periodoDe = (anio: { year: number; donde: "frase" | "cerca" } | null, anioDoc: number | null): { year: number | null; periodo: string } => {
  if (anio) return { year: anio.year, periodo: `${anio.year} (${anio.donde === "frase" ? "indicado en la misma frase" : "indicado justo antes en el texto"})` };
  if (anioDoc) return { year: anioDoc, periodo: `${anioDoc} (año del documento: el texto no dice otro)` };
  return { year: null, periodo: "" };
};

export function cifrasDeProsa(f: FragmentoSrv, anioDoc: number | null, archivo: string): CifraDoc[] {
  const norm = normalizar(f.texto);
  const out: CifraDoc[] = [];
  for (const x of extraerCifras(f.texto)) {
    if (x.num === null || x.kind === "otro") continue;
    const pos = norm.indexOf(x.quote);
    if (pos < 0) continue;
    const fin = pos + x.quote.length;
    const { year, periodo } = periodoDe(anioCercano(norm, pos, fin), anioDoc);
    const literal = x.kind === "porcentaje" ? (x.quote.match(/\d+(?:[.,]\d+)?\s?(?:%|por\s?ciento)/i)?.[0] ?? x.value) : x.value;
    out.push({
      id: `${f.orden}|${x.value}|${x.quote}`,
      que: x.label || `Cifra del documento «${archivo.slice(0, 80)}»`,
      label: x.label || x.value,
      unit: x.kind === "porcentaje" ? "%" : x.unit,
      value: x.num,
      year,
      score: x.score + (year ? 5 : 0),
      source: {
        ubicacion: f.ubicacion,
        archivo,
        fragmento: f.orden,
        cita: x.quote,
        valor_literal: literal,
        contexto: frasePorPos(norm, pos, fin),
        ...(periodo ? { periodo } : {}),
      },
    });
  }
  return out;
}

/* ---------- Tablas ----------------------------------------------------------- */

type Cel = { n: number; pct: boolean; lit: string } | { s: string } | null;

const RE_NUM = /^-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?$|^-?\d+(?:[.,]\d+)?$/;

export function celda(v: string | number | null | undefined): Cel {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { n: v, pct: false, lit: String(v) } : null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const pct = /%\s*$/.test(t);
  const limpio = t.replace(/%\s*$/, "").replace(/^\$\s?/, "").trim();
  if (RE_NUM.test(limpio)) {
    const n = aNumero(limpio);
    if (n !== null) return { n, pct, lit: t };
  }
  return { s: t };
}

const esNumero = (c: Cel): c is { n: number; pct: boolean; lit: string } => c !== null && "n" in c;
const esAnioNum = (c: Cel): boolean => esNumero(c) && !c.pct && Number.isInteger(c.n) && c.n >= 1990 && c.n <= 2100;

/** El texto de una celda de encabezado: palabras, o el año si la celda es un año. */
const textoEnc = (c: Cel): string => (c === null ? "" : "s" in c ? c.s : esAnioNum(c) ? String((c as { n: number }).n) : "");

const yearDe = (t: string): number | null => {
  const m = /(?<![\d.,])((?:19|20)\d{2})(?![\d])/.exec(t);
  return m ? Number(m[1]) : null;
};
const sinAnio = (t: string): string =>
  t
    .replace(/\s*[(\[]\s*(?:19|20)\d{2}(?:\s?[-/]\s?[12ab])?\s*[)\]]\s*/gi, " ")
    .replace(/(?<![\d.,])(?:19|20)\d{2}(?:\s?[-/]\s?(?:[12]|[ab]|i{1,2}))?(?![\d])/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·:,;\-–]+|[\s·:,;\-–]+$/g, "")
    .trim();

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export function letraColumna(n: number): string {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

const RE_IDENTIFICADOR = /^(?:a[ñn]o|vigencia|periodo|per[ií]odo|semestre|c[oó]digo|cod\b|id\b|nit|documento|tel[eé]fono|celular|c[eé]dula|snies|n[o°º.]+\b|item|[ií]tem|consecutivo)/i;

function unidadDe(pct: boolean, ...pistas: string[]): string {
  if (pct) return "%";
  const t = pistas.join(" ").toLowerCase();
  if (/millones de pesos|\(millones\)|millones de cop/.test(t)) return "millones de COP";
  if (/%|porcentaje|proporci[oó]n/.test(t)) return "%";
  if (/horas/.test(t)) return "horas";
  if (/pesos|\bcop\b|\$/.test(t)) return "COP";
  return "";
}

export interface ResultadoTabla {
  cifras: CifraDoc[];
  /** Por qué no se tomó nada, o qué se omitió. */
  avisos: string[];
}

/** Las cifras de una tabla: cada celda numérica con su encabezado, su rótulo de fila y su celda. */
export function cifrasDeTabla(f: FragmentoSrv, anioDoc: number | null, archivo: string): ResultadoTabla {
  const avisos: string[] = [];
  const t = f.tabla;
  const donde = f.hoja ? `Hoja «${f.hoja}»` : f.ubicacion;
  if (!t || !t.celdas.length) return { cifras: [], avisos: [] };
  const R = t.celdas.length;
  const C = Math.max(...t.celdas.map((r) => r.length));
  const g: Cel[][] = t.celdas.map((r) => Array.from({ length: C }, (_, c) => celda(r[c])));
  const llenas = (r: number) => g[r].filter((c) => c !== null);

  // Encabezados: las primeras filas sin ningún número (los años sirven de encabezado).
  let h = 0;
  let titulo = "";
  let filaTitulo = -1;
  while (h < Math.min(R - 1, 4)) {
    const fila = llenas(h);
    if (!fila.length) {
      h++;
      continue;
    }
    if (fila.some((c) => esNumero(c) && !esAnioNum(c))) break;
    // Una sola celda llena sobre una tabla ancha: es el título de la tabla, no un encabezado.
    if (fila.length === 1 && C >= 3 && filaTitulo < 0 && fila[0] !== null && "s" in fila[0]) {
      titulo = fila[0].s;
      filaTitulo = h;
    }
    h++;
  }
  const filasEnc = Array.from({ length: h }, (_, i) => i).filter((i) => i !== filaTitulo && llenas(i).length > 0);
  if (!filasEnc.length) {
    if (R > 1 && g.some((r) => r.some(esNumero))) avisos.push(`${donde} (${f.ubicacion}): no tiene una fila de encabezados reconocible; no se tomaron cifras de esa tabla.`);
    return { cifras: [], avisos };
  }

  const datos = Array.from({ length: R - h }, (_, i) => h + i).filter((r) => llenas(r).length > 0);
  // Columnas de rótulo: las primeras de texto (hasta dos).
  const colTexto = (c: number): boolean => {
    const v = datos.map((r) => g[r][c]).filter((x) => x !== null);
    return v.length > 0 && v.filter((x) => "s" in (x as object)).length / v.length >= 0.6;
  };
  const rotulos: number[] = [];
  for (let c = 0; c < C && rotulos.length < 2; c++) {
    if (colTexto(c)) rotulos.push(c);
    else break;
  }
  const encabezadoDe = (c: number): string => {
    const partes: string[] = [];
    for (const i of filasEnc) {
      const x = textoEnc(g[i][c]);
      if (x && partes[partes.length - 1] !== x) partes.push(x);
    }
    return partes.join(" · ");
  };
  const encabezados = Array.from({ length: C }, (_, c) => encabezadoDe(c));
  const lineaEnc = encabezados.map((e) => e || "—").join(" | ");

  const out: CifraDoc[] = [];
  for (const r of datos) {
    const rotulo = rotulos.map((c) => textoEnc(g[r][c])).filter(Boolean).join(" · ");
    const textoFila = g[r].map((c) => (c === null ? "" : "s" in c ? c.s : c.lit)).join(" | ");
    for (let c = 0; c < C; c++) {
      if (rotulos.includes(c)) continue;
      const x = g[r][c];
      if (!esNumero(x)) continue;
      const enc = encabezados[c];
      if (RE_IDENTIFICADOR.test(enc.trim())) continue;
      const anioCol = yearDe(enc);
      const anioFila = yearDe(rotulo);
      const anioTit = yearDe(titulo);
      const year = anioCol ?? anioFila ?? anioTit ?? anioDoc;
      const deDonde = anioCol ? "encabezado de la columna" : anioFila ? "rótulo de la fila" : anioTit ? "título de la tabla" : anioDoc ? "año del documento: la tabla no dice otro" : "";
      const colSin = sinAnio(enc);
      const filaSin = sinAnio(rotulo);
      const label = [filaSin, colSin].filter(Boolean).join(" · ");
      if (!label) continue;
      // Un año suelto como valor de una columna sin nombre no es una medida.
      if (!enc && esAnioNum(x)) continue;
      const ref = `${letraColumna(t.col0 + c)}${t.fila0 + r}`;
      const lugar = f.hoja ? `Hoja «${f.hoja}» · celda ${ref}` : `${f.ubicacion} · fila ${r + 1}, columna ${c + 1}`;
      const unit = unidadDe(x.pct, enc, rotulo, titulo);
      out.push({
        id: `${f.orden}|${ref}`,
        que: label,
        label: cortar(label, 160),
        unit,
        value: x.n,
        year,
        score: 10 + (anioCol || anioFila || anioTit ? 20 : 0) + (unit ? 8 : 0) + (label.length >= 6 ? 6 : 0),
        source: {
          ubicacion: lugar,
          archivo,
          ...(f.hoja ? { hoja: f.hoja, celda: ref } : {}),
          fragmento: f.orden,
          columna: colSin || enc || undefined,
          desglose: filaSin || undefined,
          fila: t.fila0 + r,
          cita: cortar(`${rotulo || "(sin rótulo)"} · ${enc || "(sin encabezado)"} = ${x.lit}`, 300),
          valor_literal: x.lit,
          contexto: cortar(`Encabezados: ${lineaEnc}\nFila ${t.fila0 + r}: ${textoFila}`, 600),
          ...(year ? { periodo: deDonde ? `${year} (${deDonde})` : String(year) } : {}),
          serie: `tbl:${slug(f.hoja ?? "")}|${slug(filaSin)}|${slug(colSin)}`,
        },
      });
    }
  }
  return { cifras: out, avisos };
}

/** Las cifras de un documento: tablas y prosa, las mejores primero y con tope. */
export function cifrasDeDocumento(fragmentos: FragmentoSrv[], anioDoc: number | null, archivo: string): { cifras: CifraDoc[]; avisos: string[] } {
  const avisos: string[] = [];
  const tablas: CifraDoc[] = [];
  const prosa: CifraDoc[] = [];
  for (const f of fragmentos) {
    if (f.tipo === "tabla") {
      const r = cifrasDeTabla(f, anioDoc, archivo);
      tablas.push(...r.cifras);
      avisos.push(...r.avisos);
    } else if (f.texto.trim()) {
      prosa.push(...cifrasDeProsa(f, anioDoc, archivo));
    }
  }
  const mejores = (xs: CifraDoc[], n: number, que: string) => {
    if (xs.length <= n) return xs;
    avisos.push(`«${archivo.slice(0, 60)}»: ${que}: se tomaron ${n} de ${xs.length} cifras (las de mayor puntaje); el resto no entró al libro.`);
    return [...xs].sort((a, b) => b.score - a.score).slice(0, n);
  };
  // Una misma frase puede repetirse en dos fragmentos (encabezados y pies): una sola vez.
  const vistas = new Set<string>();
  const unicas = prosa.filter((x) => {
    const k = `${x.value}|${x.source.cita}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  return { cifras: [...mejores(tablas, CIFRAS_TABLA_POR_DOCUMENTO, "tablas"), ...mejores(unicas, CIFRAS_PROSA_POR_DOCUMENTO, "texto")], avisos };
}
