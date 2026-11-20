/* Planeación y Seguimiento · VAF · hooks de datos (TanStack Query sobre PsApi). Las claves llevan el plan al final. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claveDelPlan, usePsApi } from "../api";
import type { FilaFinanciacion, FilaMov } from "./contratoVaf";
import type { DatosEvaluacion, DatosFinanciacion, DatosMov, Umbrales } from "./modeloVaf";

export const vafKeys = {
  todo: ["ps", "vaf"] as const,
  pendientes: () => ["ps", "vaf", "pendientes", claveDelPlan()] as const,
  evaluaciones: (plan: string | null) => ["ps", "vaf", "evaluaciones", plan, claveDelPlan()] as const,
  presupuestoPlan: (plan: string | null) => ["ps", "vaf", "ppto-plan", plan, claveDelPlan()] as const,
  presupuestoLinea: (linea: string | null) => ["ps", "vaf", "ppto-linea", linea, claveDelPlan()] as const,
  vigilancia: (plan: string | null) => ["ps", "vaf", "vigilancia", plan ?? "global", claveDelPlan()] as const,
  umbrales: (plan: string | null) => ["ps", "vaf", "umbrales", plan, claveDelPlan()] as const,
  config: () => ["ps", "vaf", "config"] as const,
};

export function useVafPendientes(activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.pendientes(), queryFn: () => api.vafPendientes(), enabled: activo, retry: false });
}
export function useVafEvaluaciones(planId: string | null, activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.evaluaciones(planId), queryFn: () => api.vafEvaluaciones(planId!), enabled: Boolean(planId) && activo, retry: false });
}
export function usePresupuestoPlan(planId: string | null, activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.presupuestoPlan(planId), queryFn: () => api.presupuestoPlan(planId!), enabled: Boolean(planId) && activo, retry: false });
}
export function usePresupuestoLinea(lineaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.presupuestoLinea(lineaId), queryFn: () => api.presupuestoLinea(lineaId!), enabled: Boolean(lineaId), retry: false });
}
/** Alertas de vigilancia de un plan; sin plan, las de todos (`ps_vigilancia_global`). */
export function useVigilancia(planId: string | null, activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.vigilancia(planId), queryFn: () => (planId ? api.vigilanciaPlan(planId) : api.vigilanciaGlobal()), enabled: activo, retry: false });
}
export function useUmbrales(planId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.umbrales(planId), queryFn: () => api.umbralesPlan(planId!), enabled: Boolean(planId), retry: false });
}
export function useVafConfig() {
  const api = usePsApi();
  return useQuery({ queryKey: vafKeys.config(), queryFn: () => api.vafConfigLeer(), retry: false });
}

/** Todas las escrituras releen lo de la VAF y el tablero de todos los planes. */
function useInvalidarVaf() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: vafKeys.todo }), qc.invalidateQueries({ queryKey: ["ps", "tablero"] })]);
}
export function useVafOps() {
  const api = usePsApi();
  const inv = useInvalidarVaf();
  return {
    enRevision: useMutation({ mutationFn: (id: string) => api.vafEnRevision(id), onSuccess: inv }),
    evaluar: useMutation({ mutationFn: (d: { planId: string; versionId: string; datos: DatosEvaluacion }) => api.vafEvaluar(d.planId, d.versionId, d.datos), onSuccess: inv }),
    lineaEvaluar: useMutation({ mutationFn: (d: { lineaId: string; datos: DatosFinanciacion }) => api.vafLineaEvaluar(d.lineaId, d.datos), onSuccess: inv }),
    registrar: useMutation({ mutationFn: (d: { lineaId: string; datos: DatosMov }) => api.presupuestoRegistrar(d.lineaId, d.datos), onSuccess: inv }),
    anular: useMutation({ mutationFn: (d: { id: string; motivo: string }) => api.presupuestoAnular(d.id, d.motivo), onSuccess: inv }),
    cargarFinanciacion: useMutation({ mutationFn: (d: { planId: string; filas: FilaFinanciacion[] }) => api.vafLineasCargar(d.planId, d.filas), onSuccess: inv }),
    cargarEjecucion: useMutation({ mutationFn: (d: { planId: string; filas: FilaMov[] }) => api.presupuestoCargar(d.planId, d.filas), onSuccess: inv }),
    umbrales: useMutation({ mutationFn: (d: { planId: string; umbrales: Umbrales }) => api.guardarUmbrales(d.planId, d.umbrales), onSuccess: inv }),
    config: useMutation({ mutationFn: (unidadId: string | null) => api.vafConfigGuardar(unidadId), onSuccess: inv }),
  };
}
