/* =============================================================================
   Observatorio · filtros por la estructura institucional (vicerrectoría →
   facultad → programa → sede).

   Funciones puras. Una tabla se filtra por las columnas que traiga: «programa»,
   «sede», «facultad» y «nivel». Si no trae la columna de un filtro, ese filtro
   no la cambia y se dice (la tabla viene agregada a otro nivel). Los posgrados
   quedan en su facultad y además se ven bajo la Vicerrectoría de Posgrados.
   ========================================================================== */

import type { ObsColumn, ObsDataset } from "../model";
import { textOf } from "../../../datos-abiertos/data/free-sets";

export interface FiltrosEstructura {
  /** "" = todas; "pos" = Vicerrectoría de Posgrados. */
  vr: "" | "pos";
  fac: string;
  sede: string;
  prog: string;
}

export const SIN_FILTROS: FiltrosEstructura = { vr: "", fac: "", sede: "", prog: "" };
export type RolEstructura = "programa" | "sede" | "facultad" | "nivel";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const hayFiltros = (f: FiltrosEstructura) => Boolean(f.vr || f.fac || f.sede || f.prog);

export function columnaDe(ds: ObsDataset, rol: RolEstructura): ObsColumn | undefined {
  return ds.columns.find((c) => c.kind !== "cifra" && (norm(c.key) === rol || norm(c.label) === rol));
}

const esPosgrado = (valor: string) => /^(posgrado|especializacion|maestria|doctorado)/.test(norm(valor));

export interface Filtrado {
  dataset: ObsDataset;
  /** Filtros activos que esta tabla no puede aplicar por no traer la columna. */
  ignorados: string[];
}

const NOMBRE: Record<keyof FiltrosEstructura, string> = { vr: "vicerrectoría", fac: "facultad", sede: "sede", prog: "programa" };

export function filtrarDataset(ds: ObsDataset, f: FiltrosEstructura): Filtrado {
  if (!hayFiltros(f)) return { dataset: ds, ignorados: [] };
  const col = { programa: columnaDe(ds, "programa"), sede: columnaDe(ds, "sede"), facultad: columnaDe(ds, "facultad"), nivel: columnaDe(ds, "nivel") };
  const ignorados: string[] = [];
  if (f.vr && !col.nivel) ignorados.push(NOMBRE.vr);
  if (f.fac && !col.facultad) ignorados.push(NOMBRE.fac);
  if (f.sede && !col.sede) ignorados.push(NOMBRE.sede);
  if (f.prog && !col.programa) ignorados.push(NOMBRE.prog);
  const rows = ds.rows.filter((r) => {
    if (r.kind !== "dato") return false;
    if (f.vr && col.nivel && !esPosgrado(textOf(r.cells[col.nivel.key]))) return false;
    if (f.fac && col.facultad && textOf(r.cells[col.facultad.key]) !== f.fac) return false;
    if (f.sede && col.sede && textOf(r.cells[col.sede.key]) !== f.sede) return false;
    if (f.prog && col.programa && textOf(r.cells[col.programa.key]) !== f.prog) return false;
    return true;
  });
  return { dataset: { ...ds, rows }, ignorados };
}

export interface OpcionesEstructura {
  facultades: string[];
  sedes: string[];
  programas: string[];
}

/** Lo que se puede elegir en cada filtro, sacado de las tablas que lo traen (los programas, según los otros filtros). */
export function opcionesDe(datasets: ObsDataset[], f: FiltrosEstructura): OpcionesEstructura {
  const fac = new Set<string>();
  const sede = new Set<string>();
  const prog = new Set<string>();
  for (const ds of datasets) {
    const cp = columnaDe(ds, "programa");
    const cs = columnaDe(ds, "sede");
    const cf = columnaDe(ds, "facultad");
    const cn = columnaDe(ds, "nivel");
    for (const r of ds.rows) {
      if (r.kind !== "dato") continue;
      const vf = cf ? textOf(r.cells[cf.key]) : "";
      const vs = cs ? textOf(r.cells[cs.key]) : "";
      const vp = cp ? textOf(r.cells[cp.key]) : "";
      if (vf) fac.add(vf);
      if (vs) sede.add(vs);
      if (!vp) continue;
      if (f.fac && cf && vf !== f.fac) continue;
      if (f.sede && cs && vs !== f.sede) continue;
      if (f.vr && cn && !esPosgrado(textOf(r.cells[cn.key]))) continue;
      prog.add(vp);
    }
  }
  const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "es"));
  return { facultades: ord(fac), sedes: ord(sede), programas: ord(prog) };
}
