/* =============================================================================
   Tablero de Indicadores de Gestión Académica · Financiero · datos.

   Une, por programa y sede, las tres tablas que se conectan en la Guía de datos:
     financiero.0  punto de equilibrio   (matriculados, punto_equilibrio por periodo)
     financiero.1  viabilidad            (descuentos, nómina, … como fracción de ingresos)
     financiero.2  ingresos y costos     (pesos por semestre)
   Funciones puras: no tocan la red ni la pantalla.
   ========================================================================== */

import type { ObsDataset } from "../model";
import type { Indicador } from "../guia/api";
import { numberOf, textOf } from "../../../datos-abiertos/data/free-sets";

export interface Equilibrio { m: number; e: number }
export interface Viabilidad { d: number | null; n: number | null; cd: number | null; eo: number | null; cf: number | null; en: number | null }
export interface Estado { i: number; cd: number; as: number; eo: number; gn: number; go: number; en: number }

export interface ProgramaFin {
  k: string;
  programa: string;
  sede: string;
  facultad: string;
  nivel: string;
  eq: Record<string, Equilibrio>;
  fp: Record<string, Viabilidad>;
  ec: Record<string, Estado>;
}

export interface TablasFin { eq?: ObsDataset; fp?: ObsDataset; ec?: ObsDataset }

export const CLAVES_FIN = { eq: "financiero.0", fp: "financiero.1", ec: "financiero.2" } as const;
export const NOMBRE_TABLA: Record<keyof TablasFin, string> = { eq: "Punto de equilibrio", fp: "Viabilidad en porcentajes", ec: "Ingresos, costos y excedentes" };

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las tablas del taller conectadas a los indicadores financieros de la Guía. */
export function tablasFinancieras(indicadores: Indicador[], datasets: ObsDataset[]): TablasFin {
  const out: TablasFin = {};
  for (const [campo, clave] of Object.entries(CLAVES_FIN) as [keyof TablasFin, string][]) {
    const ind = indicadores.find((i) => i.clave === clave && i.origen_tipo === "tabla" && i.origen_ref);
    const ds = ind ? datasets.find((d) => d.id === ind.origen_ref) : undefined;
    if (ds) out[campo] = ds;
  }
  return out;
}

function columna(ds: ObsDataset, nombre: string): string | null {
  const c = ds.columns.find((x) => plano(x.key) === nombre || plano(x.label).replace(/\s+/g, "_") === nombre);
  return c ? c.key : null;
}

export function construirProgramas(t: TablasFin): ProgramaFin[] {
  const mapa = new Map<string, ProgramaFin>();
  const nuevo = (cells: Record<string, string | number | null>, k: { p: string | null; s: string | null; f: string | null; n: string | null }) => {
    const programa = k.p ? textOf(cells[k.p]) : "";
    const sede = k.s ? textOf(cells[k.s]) : "";
    if (!programa) return null;
    const id = `${programa}|${sede}`;
    let p = mapa.get(id);
    if (!p) {
      p = { k: id, programa, sede, facultad: k.f ? textOf(cells[k.f]) : "", nivel: k.n ? textOf(cells[k.n]) : "", eq: {}, fp: {}, ec: {} };
      mapa.set(id, p);
    } else {
      if (!p.facultad && k.f) p.facultad = textOf(cells[k.f]);
      if (!p.nivel && k.n) p.nivel = textOf(cells[k.n]);
    }
    return p;
  };
  const recorrer = (ds: ObsDataset | undefined, periodo: string, cifras: string[], poner: (p: ProgramaFin, per: string, v: (number | null)[]) => void) => {
    if (!ds) return;
    const k = { p: columna(ds, "programa"), s: columna(ds, "sede"), f: columna(ds, "facultad"), n: columna(ds, "nivel") };
    const per = columna(ds, periodo);
    const cols = cifras.map((c) => columna(ds, c));
    if (!per) return;
    for (const r of ds.rows) {
      if (r.kind !== "dato") continue;
      const p = nuevo(r.cells, k);
      if (!p) continue;
      poner(p, textOf(r.cells[per]), cols.map((c) => (c ? numberOf(r.cells[c]) : null)));
    }
  };
  recorrer(t.eq, "periodo", ["matriculados", "punto_equilibrio"], (p, per, v) => {
    if (v[0] !== null && v[1] !== null) p.eq[per] = { m: v[0], e: v[1] };
  });
  recorrer(t.fp, "periodo", ["descuentos", "nomina", "costos_directos", "exc_operativo", "contribucion", "exc_neto"], (p, per, v) => {
    p.fp[per] = { d: v[0], n: v[1], cd: v[2], eo: v[3], cf: v[4], en: v[5] };
  });
  recorrer(t.ec, "semestre", ["ingresos", "costos_programa", "costos_asociados_aportes", "exc_operativo", "gastos_nomina", "otros_gastos_aportes", "exc_neto"], (p, per, v) => {
    if (v[0] !== null) p.ec[per] = { i: v[0], cd: v[1] ?? 0, as: v[2] ?? 0, eo: v[3] ?? 0, gn: v[4] ?? 0, go: v[5] ?? 0, en: v[6] ?? 0 };
  });
  return [...mapa.values()];
}

/** El semestre del reporte de ingresos («2025-A») en el periodo de las otras tablas («2025-1»). */
export const periodoDe = (semestre: string) => semestre.replace(/-A$/i, "-1").replace(/-B$/i, "-2");

export interface FiltroFin { vr: "" | "pos"; fac: string; sede: string; prog: string }
const esPos = (nivel: string) => /^(posgrado|especializacion|maestria|doctorado)/.test(plano(nivel));

export const filtrarProgramas = (ps: ProgramaFin[], f: FiltroFin) =>
  ps.filter((p) => (!f.vr || esPos(p.nivel)) && (!f.fac || p.facultad === f.fac) && (!f.sede || p.sede === f.sede) && (!f.prog || p.programa === f.prog));

export interface Suma { n: number; i: number; cd: number; as: number; eo: number; gn: number; go: number; en: number; deficit: number }

export function sumar(ps: ProgramaFin[], t: string): Suma {
  const s: Suma = { n: 0, i: 0, cd: 0, as: 0, eo: 0, gn: 0, go: 0, en: 0, deficit: 0 };
  for (const p of ps) {
    const e = p.ec[t];
    if (!e) continue;
    s.n += 1; s.i += e.i; s.cd += e.cd; s.as += e.as; s.eo += e.eo; s.gn += e.gn; s.go += e.go; s.en += e.en;
    if (e.en < 0) s.deficit += 1;
  }
  return s;
}

export const distintos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

/* --- Formato ------------------------------------------------------------------------------ */

const N0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const num = (v: number) => N0.format(v);
export const pct = (v: number, d = 0) => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v * 100)} %`;
export function dinero(v: number): string {
  const a = Math.abs(v);
  const signo = v < 0 ? "−" : "";
  if (a >= 1e9) return `${signo}$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(a / 1e9)} mil M`;
  return `${signo}$${N0.format(a / 1e6)} M`;
}
