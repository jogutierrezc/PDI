/* =============================================================================
   Plan de Trabajo de la decanatura (API «Plan de Trabajo Decanatura UDES
   2026», solo lectura) · lógica pura. La trae la función informe-plan; aquí
   solo se agrupa, se resume y se cuenta. Sin acceso a red ni a Supabase.

   Las siete dimensiones del plan (d1…d7) son las que las decanaturas usan en
   su plan; no son las seis de las cifras del informe (plantillas.ts DIMS).
   ========================================================================== */

export interface PlanRow {
  facultad: string;
  decano: string | null;
  fase_actual: string | null;
  total_acciones: number;
  total_actividades: number;
  version: number;
  actualizado: string | null;
}

export interface PlanAccion {
  facultad: string;
  id: string;
  dimension: string;
  dimension_nombre: string;
  accion: string;
  pilar: string | null;
  responsable: string | null;
  fecha_limite: string | null;
  recursos: string | null;
  meta: string | null;
  estado_inicial: string | null;
  presupuesto_ordinario: boolean;
  presupuesto_mejoramiento: boolean;
  n_actividades: number;
  corte: string | null;
  avance: number | null;
  estado: string | null;
  notas: string | null;
  link_evidencia_accion: string | null;
  veredicto_accion: string | null;
}

export interface PlanActividad {
  facultad: string;
  accion_id: string;
  id: string;
  descripcion: string;
  responsable: string | null;
  fecha: string | null;
  corte: string | null;
  estado: string | null;
  link_evidencia: string | null;
  veredicto: string | null;
  comentario_auditor: string | null;
}

export interface PlanSeguimiento {
  facultad: string;
  accion_id: string;
  corte: string | null;
  fecha: string | null;
  avance: number | null;
  estado: string | null;
  notas: string | null;
}

/** Lo que devuelve la función informe-plan. */
export interface RespuestaPlan {
  facultad: string;
  decano: string | null;
  plan: PlanRow | null;
  acciones: PlanAccion[];
  actividades: PlanActividad[];
  seguimientos: PlanSeguimiento[];
  traido_en: string;
}

export interface ResumenDimension {
  dimension: string;
  nombre: string;
  total: number;
  completadas: number;
  enProceso: number;
  pendientes: number;
  /** Promedio de los avances informados (0–100), sin contar los vacíos. Nulo si ninguno. */
  avance: number | null;
  /** Acciones sin responsable o sin meta: el plan aún no las define del todo. */
  incompletas: number;
}

/** Clave estable para guardar el análisis de una acción en `observaciones`. */
export const claveAccion = (id: string) => `plan_${id}`;

/** Orden natural de las dimensiones: d1 antes que d10. */
const ordenDimension = (id: string) => Number(id.replace(/\D/g, "")) || 0;

export function agruparPorDimension(acciones: PlanAccion[]): { dimension: string; nombre: string; acciones: PlanAccion[] }[] {
  const grupos = new Map<string, { dimension: string; nombre: string; acciones: PlanAccion[] }>();
  for (const a of acciones) {
    const g = grupos.get(a.dimension) ?? { dimension: a.dimension, nombre: a.dimension_nombre, acciones: [] };
    g.acciones.push(a);
    grupos.set(a.dimension, g);
  }
  return [...grupos.values()].sort((x, y) => ordenDimension(x.dimension) - ordenDimension(y.dimension));
}

const esCompletada = (a: PlanAccion) => a.estado === "Completado";
const esEnProceso = (a: PlanAccion) => a.estado === "En proceso";
const sinDefinir = (valor: string | null) => !valor || !valor.trim() || valor.trim().toLowerCase() === "por definir";

export function resumenPorDimension(acciones: PlanAccion[]): ResumenDimension[] {
  return agruparPorDimension(acciones).map((g) => {
    const avances = g.acciones.map((a) => a.avance).filter((v): v is number => typeof v === "number");
    return {
      dimension: g.dimension,
      nombre: g.nombre,
      total: g.acciones.length,
      completadas: g.acciones.filter(esCompletada).length,
      enProceso: g.acciones.filter(esEnProceso).length,
      pendientes: g.acciones.filter((a) => !esCompletada(a) && !esEnProceso(a)).length,
      avance: avances.length ? Math.round(avances.reduce((s, v) => s + v, 0) / avances.length) : null,
      incompletas: g.acciones.filter((a) => sinDefinir(a.responsable) || sinDefinir(a.meta)).length,
    };
  });
}

/** Avance global de todas las acciones (0–100), o nulo si ninguna tiene avance. */
export function avanceGeneral(acciones: PlanAccion[]): number | null {
  const avances = acciones.map((a) => a.avance).filter((v): v is number => typeof v === "number");
  return avances.length ? Math.round(avances.reduce((s, v) => s + v, 0) / avances.length) : null;
}

/** Las actividades de una acción, en el orden en que llegaron. */
export const actividadesDe = (actividades: PlanActividad[], accionId: string) => actividades.filter((a) => a.accion_id === accionId);

/** Etiqueta de estado con el tono que usa la pantalla. */
export function tonoEstado(estado: string | null): "ok" | "proceso" | "pendiente" {
  if (estado === "Completado") return "ok";
  if (estado === "En proceso") return "proceso";
  return "pendiente";
}
