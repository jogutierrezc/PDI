/* Planeación y Seguimiento · Fase 2 · buscar, filtrar, agrupar y ordenar actividades. Puro, sin DOM. */

import { DEF_ESTADOS, ESTADOS, PRIORIDADES_ACT, SIN_RESPONSABLE, rangoPrioridad, type Actividad, type EstadoAct } from "./modelo";
import { llano } from "../modelo";

export const AGRUPACIONES = ["estado", "persona", "linea", "prioridad", "campus"] as const;
export type Agrupar = (typeof AGRUPACIONES)[number];
export const ROTULO_AGRUPAR: Record<Agrupar, string> = { estado: "Estado", persona: "Persona", linea: "Línea del plan", prioridad: "Prioridad", campus: "Campus" };
export const PROPIAS = "__propias__";

export interface ContextoFiltro {
  nombreDe: (id: string) => string;
  /** «12 · Nombre» de una línea; se usa para buscar y para los rótulos. */
  nombreLinea: (no: string) => string;
}

/** Busca sin tildes ni mayúsculas en el título, la descripción, la línea y los nombres de los responsables. */
export function filtrarActividades(acts: readonly Actividad[], f: { q: string; mias: boolean; yo: string | null }, ctx: ContextoFiltro): Actividad[] {
  const q = llano(f.q);
  return acts.filter((a) => {
    if (f.mias && (!f.yo || !a.asignados.includes(f.yo))) return false;
    if (!q) return true;
    const pajar = llano([a.titulo, a.descripcion ?? "", a.lineaNo ? ctx.nombreLinea(a.lineaNo) : "actividad propia", ...a.asignados.map(ctx.nombreDe)].join(" "));
    return q.split(" ").every((t) => pajar.includes(t));
  });
}

export const comparar = (a: Actividad, b: Actividad): number => (a.fin ?? "9999") < (b.fin ?? "9999") ? -1 : (a.fin ?? "9999") > (b.fin ?? "9999") ? 1 : rangoPrioridad(a.prioridad) - rangoPrioridad(b.prioridad) || a.titulo.localeCompare(b.titulo, "es");

export interface Columna {
  id: string;
  titulo: string;
  ayuda?: string;
  estado?: EstadoAct;
  /** Id de persona (columnas por persona). */
  persona?: string | null;
  acts: Actividad[];
}

export function agrupar(acts: readonly Actividad[], por: Agrupar, ctx: ContextoFiltro & { personas: readonly string[]; campus: readonly string[]; lineas: readonly string[] }): Columna[] {
  const ordenadas = [...acts].sort(comparar);
  switch (por) {
    case "estado":
      return ESTADOS.map((e) => ({ id: e, titulo: DEF_ESTADOS[e].nombre, ayuda: DEF_ESTADOS[e].ayuda, estado: e, acts: ordenadas.filter((a) => a.estado === e) }));
    case "persona": {
      const ids = [...new Set([...ctx.personas, ...acts.flatMap((a) => a.asignados)])];
      const cols: Columna[] = [{ id: SIN_RESPONSABLE, titulo: "Sin responsable", ayuda: "Nadie la tiene asignada.", persona: null, acts: ordenadas.filter((a) => !a.asignados.length) }];
      for (const id of ids.sort((a, b) => ctx.nombreDe(a).localeCompare(ctx.nombreDe(b), "es"))) cols.push({ id, titulo: ctx.nombreDe(id), persona: id, acts: ordenadas.filter((a) => a.asignados.includes(id)) });
      return cols;
    }
    case "linea": {
      const nos = [...new Set([...ctx.lineas, ...acts.flatMap((a) => (a.lineaNo ? [a.lineaNo] : []))])].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
      const cols: Columna[] = nos.map((no) => ({ id: `l-${no}`, titulo: ctx.nombreLinea(no), acts: ordenadas.filter((a) => a.lineaNo === no) }));
      cols.push({ id: PROPIAS, titulo: "Actividades propias de la oficina", acts: ordenadas.filter((a) => !a.lineaNo) });
      return cols.filter((c) => c.acts.length || c.id === PROPIAS);
    }
    case "prioridad":
      return PRIORIDADES_ACT.map((p) => ({ id: p, titulo: p, acts: ordenadas.filter((a) => a.prioridad === p) }));
    case "campus": {
      const cs = [...new Set([...ctx.campus, ...acts.map((a) => a.campus)])];
      return cs.map((c) => ({ id: c, titulo: c === "Todos" ? "Todos los campus" : c, acts: ordenadas.filter((a) => a.campus === c) })).filter((c) => c.acts.length || ctx.campus.includes(c.id));
    }
  }
}

/* ---------- Orden de la lista ---------- */

export type ColumnaLista = "titulo" | "linea" | "oficina" | "responsable" | "estado" | "fin" | "prioridad";
export interface OrdenLista {
  col: ColumnaLista;
  dir: "asc" | "desc";
}

export function ordenarLista(acts: readonly Actividad[], o: OrdenLista, ctx: ContextoFiltro & { nombreOficina: (id: string) => string }): Actividad[] {
  const clave = (a: Actividad): string | number => {
    switch (o.col) {
      case "titulo": return llano(a.titulo);
      case "linea": return a.lineaNo ? Number(a.lineaNo) || 0 : 1e6;
      case "oficina": return llano(ctx.nombreOficina(a.oficinaId));
      case "responsable": return a.asignados.length ? llano(ctx.nombreDe(a.asignados[0])) : "￿";
      case "estado": return ESTADOS.indexOf(a.estado);
      case "fin": return a.fin ?? "9999-12-31";
      case "prioridad": return rangoPrioridad(a.prioridad);
    }
  };
  const s = o.dir === "asc" ? 1 : -1;
  return [...acts].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    return (x < y ? -1 : x > y ? 1 : comparar(a, b)) * s;
  });
}
