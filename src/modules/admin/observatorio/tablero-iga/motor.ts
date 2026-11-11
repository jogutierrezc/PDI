/* =============================================================================
   Tablero IGA · motor común.

   Cada tema (Calidad, Estudiantes, Profesores…) se describe con una configuración
   corta: qué tablas lee, qué cifras muestra y qué pestañas tiene. Este archivo pone
   las piezas puras: leer una tabla del taller como filas, aplicar los filtros por
   la estructura, calcular una cifra y darle formato. No toca la red ni la pantalla.
   ========================================================================== */

import type { ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { numberOf, textOf } from "../../../datos-abiertos/data/free-sets";
import { dinero, num, pct } from "./financiero-datos";
import type { FiltroFin, ProgramaFin } from "./financiero-datos";

export type Fila = Record<string, string | number | null>;
export interface TablaDatos { ds: ObsDataset; filas: Fila[]; cols: Set<string> }

/** Qué tabla busca un tema: por la conexión de la Guía (clave) o, si no hay, por las columnas que trae. */
export interface Req { id: string; cols: string[]; clave?: string; nombre: string; /** Columnas que la tabla NO debe traer (separa tablas con columnas parecidas). */ sin?: string[] }

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function aFilas(ds: ObsDataset): Fila[] {
  return ds.rows
    .filter((r) => r.kind === "dato")
    .map((r) => {
      const o: Fila = {};
      for (const c of ds.columns) o[plano(c.key)] = c.kind === "cifra" ? numberOf(r.cells[c.key]) : textOf(r.cells[c.key]);
      return o;
    });
}

export function resolverTablas(reqs: Req[], datasets: ObsDataset[], indicadores: Indicador[], tema: string): Record<string, TablaDatos | undefined> {
  const enlazados = new Set(indicadores.filter((i) => i.tema_slug === tema && i.origen_tipo === "tabla" && i.origen_ref).map((i) => i.origen_ref as string));
  const candidatos = datasets.filter((d) => d.topic === tema || enlazados.has(d.id));
  const out: Record<string, TablaDatos | undefined> = {};
  for (const r of reqs) {
    const tienen = candidatos.filter((d) => r.cols.every((c) => d.columns.some((x) => plano(x.key) === c)) && !(r.sin ?? []).some((c) => d.columns.some((x) => plano(x.key) === c)));
    const ligado = r.clave ? indicadores.find((i) => i.clave === r.clave && i.origen_tipo === "tabla" && i.origen_ref) : undefined;
    const ds = tienen.find((d) => d.id === ligado?.origen_ref) ?? [...tienen].sort((a, b) => b.rows.length - a.rows.length)[0];
    out[r.id] = ds ? { ds, filas: aFilas(ds), cols: new Set(ds.columns.map((c) => plano(c.key))) } : undefined;
  }
  return out;
}

/* --- Filtros por la estructura ----------------------------------------------------------- */

const esPos = (n: string) => /^(posgrado|especializacion|maestria|doctorado)/.test(plano(n));

export function filtrar(t: TablaDatos, f: FiltroFin): Fila[] {
  if (!f.vr && !f.fac && !f.sede && !f.prog) return t.filas;
  return t.filas.filter(
    (r) =>
      (!f.vr || !t.cols.has("nivel") || esPos(String(r.nivel))) &&
      (!f.fac || !t.cols.has("facultad") || r.facultad === f.fac) &&
      (!f.sede || !t.cols.has("sede") || r.sede === f.sede) &&
      (!f.prog || !t.cols.has("programa") || r.programa === f.prog),
  );
}

/** Los programas, facultades y sedes que existen en las tablas: de ahí salen las opciones de los filtros. */
export function estructuraDe(tablas: Record<string, TablaDatos | undefined>): ProgramaFin[] {
  const mapa = new Map<string, ProgramaFin>();
  for (const t of Object.values(tablas)) {
    if (!t) continue;
    for (const r of t.filas) {
      const programa = String(r.programa ?? ""), sede = String(r.sede ?? ""), facultad = String(r.facultad ?? "");
      if (!programa && !facultad && !sede) continue;
      const k = `${programa}|${sede}|${facultad}`;
      if (!mapa.has(k)) mapa.set(k, { k, programa, sede, facultad: facultad === "Toda la UDES" ? "" : facultad, nivel: String(r.nivel ?? ""), eq: {}, fp: {}, ec: {} });
    }
  }
  return [...mapa.values()];
}

/* --- Cálculo ----------------------------------------------------------------------------- */

export interface Agg { t: "suma" | "prom" | "cont" | "razon" | "ponderado" | "max" | "dist" | "cuenta"; col?: string; den?: string; /** razón: se suma al denominador (cumplen / (cumplen + no cumplen)). */ mas?: string; peso?: string; /** cuenta: valor que se cuenta. */ val?: string }

const n = (v: string | number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function calcular(filas: Fila[], a: Agg): number | null {
  if (!filas.length) return null;
  const vals = (c?: string) => filas.map((r) => n(c ? r[c] : null)).filter((v): v is number => v !== null);
  switch (a.t) {
    case "cont": return filas.length;
    case "dist": return new Set(filas.map((r) => String(r[a.col ?? ""] ?? "")).filter(Boolean)).size;
    case "suma": { const v = vals(a.col); return v.length ? v.reduce((x, y) => x + y, 0) : null; }
    case "prom": { const v = vals(a.col); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; }
    case "max": { const v = vals(a.col); return v.length ? Math.max(...v) : null; }
    case "cuenta": return filas.filter((r) => r[a.col ?? ""] === a.val).length;
    case "razon": { const nu = vals(a.col).reduce((x, y) => x + y, 0), de = vals(a.den).reduce((x, y) => x + y, 0) + vals(a.mas).reduce((x, y) => x + y, 0); return de ? nu / de : null; }
    case "ponderado": {
      let s = 0, w = 0;
      for (const r of filas) { const v = n(r[a.col ?? ""]), p = n(r[a.peso ?? ""]); if (v !== null && p !== null && p > 0) { s += v * p; w += p; } }
      return w ? s / w : null;
    }
  }
}

/** El valor más reciente de una columna de periodo o año. */
export const ultimo = (filas: Fila[], col: string): string | null => {
  const xs = [...new Set(filas.map((r) => String(r[col] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return xs.length ? xs[xs.length - 1] : null;
};
export const enUltimo = (filas: Fila[], col: string) => { const u = ultimo(filas, col); return u === null ? filas : filas.filter((r) => String(r[col] ?? "") === u); };

export function agrupar(filas: Fila[], cat: string, a: Agg, sin: string[] = []): { k: string; v: number }[] {
  const g = new Map<string, Fila[]>();
  for (const r of filas) {
    const k = String(r[cat] ?? "").trim();
    if (!k || sin.includes(k)) continue;
    (g.get(k) ?? g.set(k, []).get(k)!).push(r);
  }
  return [...g.entries()].map(([k, rs]) => ({ k, v: calcular(rs, a) })).filter((x): x is { k: string; v: number } => x.v !== null);
}

export const porTexto = (a: { k: string }, b: { k: string }) => a.k.localeCompare(b.k, "es", { numeric: true });

/* --- Formato ----------------------------------------------------------------------------- */

export type Fmt = "num" | "pct" | "pct0" | "pct100" | "dec1" | "dec2" | "dinero" | "anio";
const D1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const D2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export function formato(f: Fmt, v: number): string {
  switch (f) {
    case "pct": return pct(v, 1);
    case "pct0": return pct(v, 0);
    case "pct100": return `${D1.format(v)} %`;
    case "dec1": return D1.format(v);
    case "dec2": return D2.format(v);
    case "dinero": return dinero(v);
    case "anio": return String(Math.round(v));
    default: return num(v);
  }
}

/* --- Configuración de un tema --------------------------------------------------------------- */

export type Donde = [col: string, valor: string];
export interface KpiSpec { etiqueta: string; tabla: string; agg: Agg; fmt: Fmt; periodo?: string; donde?: Donde }

export type Spec =
  | { t: "barras"; donde?: Donde; titulo: string; nota?: string; ancho?: 6 | 12; tabla: string; cat: string; agg: Agg; fmt: Fmt; periodo?: string; orden?: "valor" | "cat"; top?: number; sin?: string[]; filtro?: "sede" | "fac" }
  | { t: "lineas"; donde?: Donde; titulo: string; nota?: string; ancho?: 6 | 12; tabla: string; x: string; serie?: string; agg: Agg; fmt: Fmt; sin?: string[] }
  | { t: "apiladas"; donde?: Donde; titulo: string; nota?: string; ancho?: 6 | 12; tabla: string; cat: string; serie: string; agg: Agg; fmt: Fmt; periodo?: string; orden?: "cat" | "total" }
  | { t: "programas"; titulo: string; nota?: string; ancho?: 6 | 12; columnas: ColPrograma[]; orden: number; desc?: boolean }
  | { t: "lista"; donde?: Donde; titulo: string; nota?: string; ancho?: 6 | 12; tabla: string; columnas: { n: string; col: string; fmt?: Fmt }[]; orden: string; desc?: boolean }
  | { t: "nota"; titulo: string; nota?: string; ancho?: 6 | 12; texto: string };

/** Una columna de la tabla de programas: sale de cualquier tabla, por programa y sede. */
export interface ColPrograma { n: string; tabla: string; agg: Agg; fmt: Fmt; periodo?: string; barra?: boolean }

export interface Pestana { id: string; nombre: string; specs: Spec[] }
export interface CfgTema {
  slug: string;
  nombre: string;
  fuente: string;
  tablas: Req[];
  kpis: KpiSpec[];
  /** Recibe las cifras ya escritas, en el orden de `kpis`. */
  lectura: (v: string[]) => string;
  pestanas: Pestana[];
}
