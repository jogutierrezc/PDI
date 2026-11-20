/* Planeación y Seguimiento · proyectos · hooks de datos (TanStack Query sobre PsApi). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claveDelPlan, psKeys, usePsApi } from "../api";
import { vafKeys } from "../vaf/hooksVaf";
import type { DatosEvaluacionProyecto, DatosProyecto } from "./modeloProy";

export const proyKeys = {
  evaluaciones: (plan: string | null, no: string | null) => ["ps", "proy", "evaluaciones", plan, no] as const,
  resumen: (plan: string | null) => ["ps", "proy", "resumen", plan, claveDelPlan()] as const,
  paraActividad: (oficina: string | null) => ["ps", "proy", "para-actividad", oficina, claveDelPlan()] as const,
};

export function useEvaluacionesProyecto(planId: string | null, no: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: proyKeys.evaluaciones(planId, no), queryFn: () => api.proyectoEvaluaciones(planId!, no!), enabled: Boolean(planId && no), retry: false });
}
export function useResumenAprobacion(planId: string | null, activo = true) {
  const api = usePsApi();
  return useQuery({ queryKey: proyKeys.resumen(planId), queryFn: () => api.resumenAprobacion(planId!), enabled: Boolean(planId) && activo, retry: false });
}
export function useLineasParaActividad(oficinaId: string | null) {
  const api = usePsApi();
  return useQuery({ queryKey: proyKeys.paraActividad(oficinaId), queryFn: () => api.lineasParaActividad(oficinaId!), enabled: Boolean(oficinaId), retry: false });
}

/** Toda escritura relee lo del plan (líneas, resumen, evaluaciones). */
export function useProyectosOps() {
  const api = usePsApi();
  const qc = useQueryClient();
  const inv = () => Promise.all([qc.invalidateQueries({ queryKey: psKeys.todo }), qc.invalidateQueries({ queryKey: vafKeys.todo })]);
  return {
    evaluar: useMutation({ mutationFn: (d: { planId: string; no: string; datos: DatosEvaluacionProyecto }) => api.proyectoEvaluar(d.planId, d.no, d.datos), onSuccess: inv }),
    guardar: useMutation({ mutationFn: (d: { planId: string; datos: DatosProyecto; no?: string }) => api.proyectoGuardar(d.planId, d.datos, d.no), onSuccess: inv }),
    eliminar: useMutation({ mutationFn: (d: { planId: string; no: string }) => api.proyectoEliminar(d.planId, d.no), onSuccess: inv }),
    enviar: useMutation({ mutationFn: (d: { planId: string; nota: string }) => api.planEnviarEvaluacion(d.planId, d.nota), onSuccess: inv }),
    asignar: useMutation({ mutationFn: (d: { planId: string; claves: string[]; oficinaId: string | null }) => api.proyectosAsignarOficina(d.planId, d.claves, d.oficinaId), onSuccess: inv }),
    abrirPendientes: useMutation({ mutationFn: () => api.vafAbrirPendientes(), onSuccess: inv }),
  };
}
