/* =============================================================================
   UDrive · gráficas: filtro por fecha y agrupación de rótulos repetidos.

   La preparación de las filas de una gráfica, en este orden:
   1. filtro de fecha (las filas fuera del filtro no entran a nada),
   2. agrupación de fechas (día, mes, trimestre o año) cuando el eje X es una fecha,
   3. agrupación por rótulo con la agregación de cada serie.
   Lógica pura, sin React ni DOM: la usan el editor de UDrive, los informes, la
   salida a Word y PDF y las gráficas publicadas del portal de sostenibilidad.
   ========================================================================== */

import type { Agregacion, AgruparFecha, ColumnaUd, ConfigGrafica, FilaUd, FiltroFecha, SerieGrafica, TablaDatos, Valor } from "../tipos";
import { aNumeroEs, esNumerica, numeroDe, textoNumero } from "./valores";

export const AGREGACIONES: readonly Agregacion[] = ["ninguno", "suma", "promedio", "minimo", "maximo", "conteo", "ultimo"];
export const AGRUPACIONES_FECHA: readonly AgruparFecha[] = ["ninguno", "dia", "mes", "trimestre", "anio"];
const MODOS_FILTRO: readonly FiltroFecha["modo"][] = ["todo", "rango", "ultimos", "anio"];
const UNIDADES_FILTRO: readonly FiltroFecha["unidad"][] = ["dias", "meses", "anios"];

/** El valor de una celda como rótulo de categoría. */
export function rotulo(v: Valor | undefined): string {
  if (v === null || v === undefined || v === "") return "(sin dato)";
  return typeof v === "number" ? textoNumero(v) : String(v);
}

const notNull = (x: number | null): x is number => x !== null;
const DIA = 86_400_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/* ---------- fechas ------------------------------------------------------------------------- */

/** «AAAA-MM-DD» a milisegundos UTC (día exacto); nulo si no es una fecha. */
function msIso(v: Valor | undefined): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return Date.UTC(Number(m[1]), mes - 1, dia);
}

/** Suma meses a una fecha sin desbordar (31 de marzo menos un mes es 28 o 29 de febrero). */
function sumarMeses(ms: number, meses: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), ultimo));
}

const textoFecha = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Las columnas por las que se puede filtrar: de fecha, o de números que hacen de año o periodo. */
export const columnasDeFiltro = (cols: readonly ColumnaUd[]): ColumnaUd[] => cols.filter((c) => c.tipo === "fecha" || c.tipo === "numero");

/** El valor ordenable de una celda de la columna del filtro: fecha en ms UTC o el número tal cual. */
export function claveFecha(col: ColumnaUd | undefined, v: Valor | undefined): number | null {
  if (!col) return null;
  if (col.tipo === "fecha") return msIso(v);
  return esNumerica(col) ? numeroDe(v) : null;
}

/** Cómo se lee un extremo escrito del rango (fecha AAAA-MM-DD o número). */
const claveBorde = (col: ColumnaUd, v: string | null): number | null => {
  if (v === null || v === "") return null;
  return col.tipo === "fecha" ? msIso(v) : aNumeroEs(v);
};

/** Una clave de la columna del filtro como texto legible. */
export const textoClave = (col: ColumnaUd, k: number): string => (col.tipo === "fecha" ? textoFecha(k) : textoNumero(k));

/* ---------- el filtro ---------------------------------------------------------------------- */

interface Limites {
  desde: number | null;
  hasta: number | null;
  /** El dato más reciente de la tabla, de donde cuentan «últimos» y «este año». */
  referencia: number | null;
}

/** Los extremos que el filtro deja pasar, o nulo si el filtro no filtra. */
function limitesDe(col: ColumnaUd, filas: readonly FilaUd[], f: FiltroFecha): Limites | null {
  if (f.modo === "todo") return null;
  if (f.modo === "rango") {
    const desde = claveBorde(col, f.desde);
    const hasta = claveBorde(col, f.hasta);
    return desde === null && hasta === null ? null : { desde, hasta, referencia: null };
  }
  let max: number | null = null;
  for (const fila of filas) {
    const k = claveFecha(col, fila.datos[col.clave]);
    if (k !== null && (max === null || k > max)) max = k;
  }
  // Sin ningún dato con fecha no hay desde dónde contar: no queda ninguna fila.
  if (max === null) return { desde: Infinity, hasta: -Infinity, referencia: null };
  const n = Math.max(1, Math.floor(f.n) || 1);
  if (col.tipo !== "fecha") return { desde: f.modo === "anio" ? max : max - n + 1, hasta: null, referencia: max };
  if (f.modo === "anio") {
    const y = new Date(max).getUTCFullYear();
    return { desde: Date.UTC(y, 0, 1), hasta: Date.UTC(y, 11, 31), referencia: max };
  }
  const desde = f.unidad === "dias" ? max - (n - 1) * DIA : sumarMeses(max, f.unidad === "meses" ? -n : -12 * n) + DIA;
  return { desde, hasta: null, referencia: max };
}

/** La columna del filtro si el filtro está activo y la columna existe y sirve; si no, nulo (todas las filas pasan). */
function columnaDelFiltro(tabla: TablaDatos, c: ConfigGrafica): ColumnaUd | null {
  const f = c.filtroFecha;
  if (!f || !f.columna || f.modo === "todo") return null;
  const col = tabla.columnas.find((x) => x.clave === f.columna);
  return col && (col.tipo === "fecha" || col.tipo === "numero") ? col : null;
}

/** Las filas que pasan el filtro de fecha (todas si no hay filtro). Es la base de todo cálculo de la gráfica. */
export function filasFiltradas(tabla: TablaDatos, c: ConfigGrafica): readonly FilaUd[] {
  const col = columnaDelFiltro(tabla, c);
  if (!col || !c.filtroFecha) return tabla.filas;
  const lim = limitesDe(col, tabla.filas, c.filtroFecha);
  if (!lim) return tabla.filas;
  return tabla.filas.filter((fila) => {
    const k = claveFecha(col, fila.datos[col.clave]);
    return k !== null && (lim.desde === null || k >= lim.desde) && (lim.hasta === null || k <= lim.hasta);
  });
}

export interface ResumenFiltro {
  total: number;
  quedan: number;
  /** ¿El filtro está encendido y se puede aplicar? */
  activo: boolean;
  /** El filtro apunta a una columna que ya no existe o ya no sirve. */
  columnaFalta: boolean;
  /** El rango real de las filas que quedan, como texto («» si no quedan). */
  desde: string;
  hasta: string;
  /** Para «últimos» y «este año»: el dato más reciente de la tabla, como texto. */
  referencia: string;
}

/** Cuántas filas deja el filtro y de qué fechas a qué fechas. */
export function resumenFiltro(tabla: TablaDatos, c: ConfigGrafica): ResumenFiltro {
  const total = tabla.filas.length;
  const f = c.filtroFecha;
  const pedido = Boolean(f && f.columna && f.modo !== "todo");
  const col = columnaDelFiltro(tabla, c);
  const base = { total, quedan: total, activo: false, columnaFalta: pedido && !col, desde: "", hasta: "", referencia: "" };
  if (!col || !f) return base;
  const lim = limitesDe(col, tabla.filas, f);
  if (!lim) return base;
  const filas = filasFiltradas(tabla, c);
  const claves = filas.map((x) => claveFecha(col, x.datos[col.clave])).filter(notNull);
  const min = claves.length ? claves.reduce((a, b) => (b < a ? b : a)) : null;
  const max = claves.length ? claves.reduce((a, b) => (b > a ? b : a)) : null;
  return {
    ...base,
    quedan: filas.length,
    activo: true,
    desde: min === null ? "" : textoClave(col, min),
    hasta: max === null ? "" : textoClave(col, max),
    referencia: lim.referencia === null ? "" : textoClave(col, lim.referencia),
  };
}

/** Los atajos del filtro. «Este año» es el año del dato más reciente, no el del calendario. */
export const PRESETS_FILTRO: { id: string; nombre: string; filtro: (columna: string) => FiltroFecha }[] = [
  { id: "todo", nombre: "Todo", filtro: (columna) => ({ columna, modo: "todo", desde: null, hasta: null, n: 1, unidad: "anios" }) },
  { id: "ultimo-anio", nombre: "Último año", filtro: (columna) => ({ columna, modo: "ultimos", desde: null, hasta: null, n: 1, unidad: "anios" }) },
  { id: "tres-anios", nombre: "Últimos 3 años", filtro: (columna) => ({ columna, modo: "ultimos", desde: null, hasta: null, n: 3, unidad: "anios" }) },
  { id: "este-anio", nombre: "Este año", filtro: (columna) => ({ columna, modo: "anio", desde: null, hasta: null, n: 1, unidad: "anios" }) },
];

/** El atajo que coincide con el filtro actual, si alguno. */
export function presetActivo(f: FiltroFecha | null | undefined): string | null {
  if (!f) return "todo";
  return PRESETS_FILTRO.find((p) => {
    const q = p.filtro(f.columna);
    return q.modo === f.modo && (f.modo !== "ultimos" || (q.n === f.n && q.unidad === f.unidad));
  })?.id ?? null;
}

/* ---------- periodos para el selector del portal ------------------------------------------- */

export interface Periodo {
  valor: number;
  texto: string;
}

const periodoDe = (col: ColumnaUd, k: number): number => (col.tipo === "fecha" ? new Date(k).getUTCFullYear() : k);

/** Los años (columna de fecha) o periodos (columna numérica) que hay en la tabla, de menor a mayor. */
export function periodosDisponibles(tabla: TablaDatos, c: ConfigGrafica): Periodo[] {
  const f = c.filtroFecha;
  const col = f ? tabla.columnas.find((x) => x.clave === f.columna) : undefined;
  if (!col || (col.tipo !== "fecha" && col.tipo !== "numero")) return [];
  const vistos = new Set<number>();
  for (const fila of tabla.filas) {
    const k = claveFecha(col, fila.datos[col.clave]);
    if (k !== null) vistos.add(periodoDe(col, k));
  }
  return [...vistos].sort((a, b) => a - b).map((valor) => ({ valor, texto: textoNumero(valor) }));
}

/** Los periodos extremos que deja el filtro actual (para mostrarlos en el selector). */
export function periodosActivos(tabla: TablaDatos, c: ConfigGrafica): { desde: number; hasta: number } | null {
  const f = c.filtroFecha;
  const col = f ? tabla.columnas.find((x) => x.clave === f.columna) : undefined;
  if (!col) return null;
  const claves = filasFiltradas(tabla, c).map((x) => claveFecha(col, x.datos[col.clave])).filter(notNull).map((k) => periodoDe(col, k));
  return claves.length ? { desde: Math.min(...claves), hasta: Math.max(...claves) } : null;
}

/** El filtro de «rango» que corresponde a un par de años o periodos elegidos en el portal. */
export function filtroDePeriodos(tabla: TablaDatos, c: ConfigGrafica, desde: number, hasta: number): FiltroFecha | null {
  const col = c.filtroFecha ? tabla.columnas.find((x) => x.clave === c.filtroFecha?.columna) : undefined;
  if (!col || !c.filtroFecha) return null;
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const cuatro = (y: number) => String(y).padStart(4, "0");
  return col.tipo === "fecha"
    ? { columna: col.clave, modo: "rango", desde: `${cuatro(a)}-01-01`, hasta: `${cuatro(b)}-12-31`, n: 1, unidad: "anios" }
    : { columna: col.clave, modo: "rango", desde: String(a), hasta: String(b), n: 1, unidad: "anios" };
}

/* ---------- agregación --------------------------------------------------------------------- */

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** La agregación que conviene a una columna: promedio para porcentajes y medidas que ya son promedio o tasa; suma para el resto. */
export function agregacionSugerida(col: Pick<ColumnaUd, "tipo" | "etiqueta" | "clave"> | undefined): Agregacion {
  if (!col) return "suma";
  if (col.tipo === "porcentaje") return "promedio";
  return /prom|media|tasa|indice|razon|ratio|nota|%/.test(sinTildes(`${col.etiqueta} ${col.clave}`)) ? "promedio" : "suma";
}

const activa = (a: Agregacion | undefined): a is Exclude<Agregacion, "ninguno"> => a !== undefined && a !== "ninguno";

const esXY = (c: ConfigGrafica): boolean => c.tipo === "dispersion" || c.tipo === "burbujas";

/** ¿Las fechas del eje X se agrupan? Solo si el eje X es una columna de fecha. */
export function agrupaFechas(tabla: TablaDatos, c: ConfigGrafica): boolean {
  return c.agruparFecha !== undefined && c.agruparFecha !== "ninguno" && tabla.columnas.find((x) => x.clave === c.x)?.tipo === "fecha";
}

/** ¿Se combinan las filas con el mismo rótulo? Es lo nuevo: las gráficas guardadas sin los campos siguen una barra por fila. */
export function hayAgrupacion(tabla: TablaDatos, c: ConfigGrafica): boolean {
  if (esXY(c)) return false;
  return activa(c.agrupar) || c.series.some((s) => activa(s.agrupar)) || agrupaFechas(tabla, c);
}

/** La agregación de una serie cuando se agrupa: la suya, la global o la sugerida por su columna. */
export function agregacionDe(c: ConfigGrafica, s: SerieGrafica, col: ColumnaUd | undefined): Exclude<Agregacion, "ninguno"> {
  if (activa(s.agrupar)) return s.agrupar;
  if (activa(c.agrupar)) return c.agrupar;
  const sugerida = agregacionSugerida(col);
  return sugerida === "ninguno" ? "suma" : sugerida;
}

/** Combina los valores de las filas de un grupo. Los vacíos no cuentan como cero; «conteo» cuenta las filas con dato. */
export function agregar(agg: Exclude<Agregacion, "ninguno">, valores: readonly (number | null)[]): number | null {
  const ok = valores.filter(notNull);
  if (agg === "conteo") return ok.length;
  if (!ok.length) return null;
  switch (agg) {
    case "suma":
      return ok.reduce((a, b) => a + b, 0);
    case "promedio":
      return ok.reduce((a, b) => a + b, 0) / ok.length;
    case "minimo":
      return Math.min(...ok);
    case "maximo":
      return Math.max(...ok);
    case "ultimo":
      return ok[ok.length - 1];
  }
}

/* ---------- grupos por rótulo -------------------------------------------------------------- */

export interface GrupoFilas {
  rotulo: string;
  /** Posición cronológica o numérica del rótulo; nulo si es texto o no tiene dato. */
  orden: number | null;
  filas: FilaUd[];
}

/** El rótulo de una celda del eje X y su posición, con las fechas agrupadas por día, mes, trimestre o año si se pidió. */
function cubeta(col: ColumnaUd | undefined, v: Valor | undefined, fecha: AgruparFecha | undefined): { rotulo: string; orden: number | null } {
  if (col?.tipo === "fecha") {
    const ms = msIso(v);
    if (ms === null) return { rotulo: rotulo(v), orden: null };
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    switch (fecha) {
      case "dia":
        return { rotulo: textoFecha(ms), orden: ms };
      case "mes":
        return { rotulo: `${MESES[m]} ${y}`, orden: Date.UTC(y, m, 1) };
      case "trimestre":
        return { rotulo: `T${Math.floor(m / 3) + 1} ${y}`, orden: Date.UTC(y, Math.floor(m / 3) * 3, 1) };
      case "anio":
        return { rotulo: String(y), orden: Date.UTC(y, 0, 1) };
      default:
        return { rotulo: rotulo(v), orden: ms };
    }
  }
  if (col && esNumerica(col)) return { rotulo: rotulo(v), orden: numeroDe(v) };
  return { rotulo: rotulo(v), orden: null };
}

/** Agrupa las filas por el rótulo del eje X. Fechas en orden cronológico, números en orden numérico y texto en el orden en que aparece. */
export function agruparPorRotulo(filas: readonly FilaUd[], tabla: TablaDatos, c: ConfigGrafica): GrupoFilas[] {
  const colX = tabla.columnas.find((x) => x.clave === c.x);
  const fecha = agrupaFechas(tabla, c) ? c.agruparFecha : undefined;
  const mapa = new Map<string, GrupoFilas>();
  for (const f of filas) {
    const b = cubeta(colX, f.datos[c.x], fecha);
    const g = mapa.get(b.rotulo);
    if (g) g.filas.push(f);
    else mapa.set(b.rotulo, { rotulo: b.rotulo, orden: b.orden, filas: [f] });
  }
  const grupos = [...mapa.values()];
  if (colX && (colX.tipo === "fecha" || esNumerica(colX))) {
    grupos.sort((a, b) => (a.orden === null ? (b.orden === null ? 0 : 1) : b.orden === null ? -1 : a.orden - b.orden));
  }
  return grupos;
}

/** Las filas de un grupo en orden de fecha (por la columna del filtro o, si no hay, la del eje X), para «el último». */
export function filasEnOrden(filas: readonly FilaUd[], tabla: TablaDatos, c: ConfigGrafica): readonly FilaUd[] {
  const clave = c.filtroFecha?.columna || c.x;
  const col = tabla.columnas.find((x) => x.clave === clave);
  if (!col || (col.tipo !== "fecha" && !esNumerica(col))) return filas;
  const k = (f: FilaUd) => claveFecha(col, f.datos[col.clave]) ?? -Infinity;
  return filas.map((f, i) => ({ f, i })).sort((a, b) => k(a.f) - k(b.f) || a.i - b.i).map((x) => x.f);
}

/** Cuántos rótulos del eje X están repetidos (en las filas que pasan el filtro). */
export function rotulosRepetidos(tabla: TablaDatos, c: ConfigGrafica): number {
  const cuenta = new Map<string, number>();
  for (const f of filasFiltradas(tabla, c)) {
    const r = rotulo(f.datos[c.x]);
    cuenta.set(r, (cuenta.get(r) ?? 0) + 1);
  }
  let n = 0;
  for (const v of cuenta.values()) if (v > 1) n++;
  return n;
}

/* ---------- lectura de lo guardado --------------------------------------------------------- */

/** La agregación guardada, o nada si no es una de las conocidas. */
export const leerAgregacion = (v: unknown): Agregacion | undefined => (AGREGACIONES.includes(v as Agregacion) ? (v as Agregacion) : undefined);

export const leerAgruparFecha = (v: unknown): AgruparFecha => (AGRUPACIONES_FECHA.includes(v as AgruparFecha) ? (v as AgruparFecha) : "ninguno");

/** El filtro guardado, completo y válido; nulo si no hay o no sirve. */
export function leerFiltroFecha(v: unknown): FiltroFecha | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Partial<Record<keyof FiltroFecha, unknown>>;
  if (typeof o.columna !== "string" || !o.columna) return null;
  const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" && Number.isFinite(x) ? String(x) : null);
  const n = typeof o.n === "number" && Number.isFinite(o.n) ? Math.min(9999, Math.max(1, Math.floor(o.n))) : 1;
  return {
    columna: o.columna,
    modo: MODOS_FILTRO.includes(o.modo as FiltroFecha["modo"]) ? (o.modo as FiltroFecha["modo"]) : "todo",
    desde: texto(o.desde),
    hasta: texto(o.hasta),
    n,
    unidad: UNIDADES_FILTRO.includes(o.unidad as FiltroFecha["unidad"]) ? (o.unidad as FiltroFecha["unidad"]) : "anios",
  };
}
