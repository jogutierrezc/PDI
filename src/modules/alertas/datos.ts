/* =============================================================================
   Portal de alertas · lectura de datos.

   Reutiliza las funciones del Monitor (wh_monitor_*, migraciones 0160 y 0161) y suma las tres de
   la migración 0271: el historial por estudiante y periodo, la reprobación de un semestre y la
   evolución de los cursos. Todo llega ya filtrado por lo que la persona puede ver: en el
   navegador no hay filtro de seguridad.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { todas } from "../warehouse/store";
import { planDe, type FilaRiesgo, type CorteRiesgo } from "../monitor/logica";
import type { FilaHistorial } from "./cohorte";

export { useMapaMonitor, usePermisosMonitor, useEstudianteMonitor, useRiesgoMonitor, usePlanesMonitor } from "../monitor/datos";

const FRESCO = 5 * 60_000;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const num = (v: unknown) => Number(v ?? 0);

/** El mensaje que ve la persona cuando la base no tiene las funciones del portal. */
export function mensajeAlertas(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (/wh_monitor_(historial|riesgo_semestre|cursos_historial)|does not exist|schema cache/i.test(m)) return "Falta aplicar la migración 0271 (portal de alertas tempranas).";
  if (/sin permiso/i.test(m)) return "Su usuario no tiene programas asignados todavía: Planeación debe asociar su unidad con los programas.";
  return m;
}

/** Una fila por estudiante y periodo de un programa: el historial con el que se arman trayectorias y cohortes. */
export function useHistorial(sede: string, periodos: string[], programa: string | null, estudiante: string | null = null) {
  return useQuery({
    queryKey: ["alertas", "historial", sede, periodos.join(","), programa, estudiante],
    enabled: periodos.length > 0 && Boolean(programa || estudiante),
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) =>
        supabase.rpc("wh_monitor_historial", { p_sede: sede, p_periodos: periodos, p_programa: programa, p_estudiante: estudiante }, { count: "exact" }).range(a, b),
      );
      return filas.map(
        (r): FilaHistorial => ({
          estudiante: String(r.estudiante ?? ""),
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          periodo: String(r.periodo ?? ""),
          semestre: n(r.semestre),
          grupo_etario: (r.grupo_etario as string | null) ?? null,
          origen: (r.origen as string | null) ?? null,
          materias: num(r.materias),
          con_p1: num(r.con_p1),
          con_p2: num(r.con_p2),
          con_p3: num(r.con_p3),
          con_fin: num(r.con_fin),
          prom_p1: n(r.prom_p1),
          prom_p2: n(r.prom_p2),
          prom_p3: n(r.prom_p3),
          prom_fin: n(r.prom_fin),
          riesgo_p1: num(r.riesgo_p1),
          riesgo_p2: num(r.riesgo_p2),
          riesgo_p3: num(r.riesgo_p3),
          riesgo_fin: num(r.riesgo_fin),
        }),
      );
    },
  });
}

/** La reprobación (programa × curso × grupo × corte) de los estudiantes de un semestre de un programa. */
export function useRiesgoSemestre(periodo: string, sede: string, programa: string | null, semestre: number | null) {
  return useQuery({
    queryKey: ["alertas", "riesgo-semestre", periodo, sede, programa, semestre],
    enabled: Boolean(programa),
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_monitor_riesgo_semestre", { p_periodo: periodo, p_sede: sede, p_programa: programa, p_semestre: semestre }, { count: "exact" }).range(a, b));
      return filas.map(
        (r): FilaRiesgo => ({
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          codigo_materia: String(r.codigo_materia ?? ""),
          materia: String(r.materia ?? ""),
          grupo: String(r.grupo ?? ""),
          grupo_clave: String(r.grupo_clave ?? ""),
          plan: planDe(String(r.plan ?? "")),
          corte: Number(r.corte) as CorteRiesgo,
          con: num(r.con),
          bajo: num(r.bajo),
          promedio: n(r.promedio),
        }),
      );
    },
  });
}

export interface FilaCursoHistorial {
  periodo: string;
  codigo_programa: string;
  programa: string;
  codigo_materia: string;
  materia: string;
  corte: CorteRiesgo;
  con: number;
  bajo: number;
}

/** La reprobación de cada curso de un programa en varios periodos, por corte. */
export function useCursosHistorial(sede: string, periodos: string[], programa: string | null) {
  return useQuery({
    queryKey: ["alertas", "cursos-historial", sede, periodos.join(","), programa],
    enabled: periodos.length > 0 && Boolean(programa),
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_monitor_cursos_historial", { p_sede: sede, p_periodos: periodos, p_programa: programa }, { count: "exact" }).range(a, b));
      return filas.map(
        (r): FilaCursoHistorial => ({
          periodo: String(r.periodo ?? ""),
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          codigo_materia: String(r.codigo_materia ?? ""),
          materia: String(r.materia ?? ""),
          corte: Number(r.corte) as CorteRiesgo,
          con: num(r.con),
          bajo: num(r.bajo),
        }),
      );
    },
  });
}
