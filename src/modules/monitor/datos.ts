/* =============================================================================
   Monitor de alertas tempranas · lectura de datos (migración 0160).

   Todo va por funciones de la base que ya entregan SOLO lo que la persona puede
   ver por su rol y su unidad: no hay filtro de seguridad en el navegador. Los
   estudiantes llegan por su código seudónimo.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { mensajeDe, todas } from "../warehouse/store";
import { claveGrupo, planDe, type CorteRiesgo, type FilaMonitor, type FilaRiesgo, type GrupoMonitor, type Programa, type ResumenPlan } from "./logica";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const num = (v: unknown) => Number(v ?? 0);

export const monitorKeys = {
  todo: ["monitor"] as const,
  resumen: (p: string, s: string) => ["monitor", "resumen", p, s] as const,
  grupos: (p: string, s: string) => ["monitor", "grupos", p, s] as const,
  mapa: (p: string, s: string) => ["monitor", "mapa", p, s] as const,
};

/** Las notas se cargan a veces al día, no por segundos: cinco minutos de caché. */
const FRESCO = 5 * 60_000;

export function usePermisosMonitor() {
  const { canSee, hasRole } = useAuth();
  return { ver: canSee("monitor"), asignar: canSee("monitor") && hasRole("planeacion") };
}

export function useResumenMonitor(periodo: string, sede: string) {
  return useQuery({
    queryKey: monitorKeys.resumen(periodo, sede),
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_monitor_resumen", { p_periodo: periodo, p_sede: sede }, { count: "exact" }).range(a, b));
      return filas.map(
        (r): FilaMonitor => ({
          estudiante: String(r.estudiante ?? ""),
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          materias: num(r.materias),
          con_p1: num(r.con_p1),
          con_p2: num(r.con_p2),
          con_p3: num(r.con_p3),
          prom_p1: n(r.prom_p1),
          prom_p2: n(r.prom_p2),
          prom_p3: n(r.prom_p3),
          riesgo_p1: num(r.riesgo_p1),
          riesgo_p2: num(r.riesgo_p2),
          riesgo_p3: num(r.riesgo_p3),
        }),
      );
    },
  });
}

export function useGruposMonitor(periodo: string, sede: string) {
  return useQuery({
    queryKey: monitorKeys.grupos(periodo, sede),
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_monitor_grupos", { p_periodo: periodo, p_sede: sede }, { count: "exact" }).range(a, b));
      return filas.map(
        (r): GrupoMonitor => ({
          codigo_programa: String(r.codigo_programa ?? ""),
          codigo_materia: String(r.codigo_materia ?? ""),
          materia: String(r.materia ?? ""),
          grupo: String(r.grupo ?? ""),
          grupo_clave: String(r.grupo_clave ?? claveGrupo(String(r.codigo_materia ?? ""), String(r.grupo ?? ""))),
          estudiantes: num(r.estudiantes),
          con_p1: num(r.con_p1),
          con_p2: num(r.con_p2),
          con_p3: num(r.con_p3),
          prom_p1: n(r.prom_p1),
          prom_p2: n(r.prom_p2),
          prom_p3: n(r.prom_p3),
          bajo_p1: num(r.bajo_p1),
          bajo_p2: num(r.bajo_p2),
          bajo_p3: num(r.bajo_p3),
        }),
      );
    },
  });
}

export function useMapaMonitor(periodo: string, sede: string) {
  return useQuery({
    queryKey: monitorKeys.mapa(periodo, sede),
    staleTime: FRESCO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wh_monitor_mapa", { p_periodo: periodo, p_sede: sede });
      if (error) throw new Error(mensajeDe(error));
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): Programa => ({
          codigo_programa: String(r.codigo_programa ?? ""),
          nombre: String(r.nombre ?? ""),
          unit_id: (r.unit_id as string | null) ?? null,
          unidad: (r.unidad as string | null) ?? null,
          facultad_id: (r.facultad_id as string | null) ?? null,
          facultad: (r.facultad as string | null) ?? null,
        }),
      );
    },
  });
}

export interface NotaMateria {
  codigo_programa: string;
  programa: string;
  codigo_materia: string;
  materia: string;
  grupo: string;
  grupo_clave: string;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  nota_acumulada: number | null;
}

/** Las notas de un estudiante, materia por materia. */
export function useEstudianteMonitor(periodo: string, sede: string, estudiante: string | null) {
  return useQuery({
    queryKey: ["monitor", "estudiante", periodo, sede, estudiante],
    enabled: Boolean(estudiante),
    staleTime: FRESCO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wh_monitor_estudiante", { p_periodo: periodo, p_sede: sede, p_estudiante: estudiante });
      if (error) throw new Error(mensajeDe(error));
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): NotaMateria => ({
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          codigo_materia: String(r.codigo_materia ?? ""),
          materia: String(r.materia ?? ""),
          grupo: String(r.grupo ?? ""),
          grupo_clave: String(r.grupo_clave ?? ""),
          p1: n(r.p1),
          p2: n(r.p2),
          p3: n(r.p3),
          nota_acumulada: n(r.nota_acumulada),
        }),
      );
    },
  });
}

export interface NotaEstudianteGrupo {
  estudiante: string;
  codigo_programa: string;
  programa: string;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  nota_acumulada: number | null;
}

/** Los estudiantes de un grupo (clave código de materia + letra) con sus notas por corte. */
export function useGrupoEstudiantes(periodo: string, sede: string, clave: string | null) {
  return useQuery({
    queryKey: ["monitor", "grupo", periodo, sede, clave],
    enabled: Boolean(clave),
    staleTime: FRESCO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wh_monitor_grupo_estudiantes", { p_periodo: periodo, p_sede: sede, p_clave: clave });
      if (error) throw new Error(mensajeDe(error));
      return ((data ?? []) as Record<string, unknown>[]).map(
        (r): NotaEstudianteGrupo => ({
          estudiante: String(r.estudiante ?? ""),
          codigo_programa: String(r.codigo_programa ?? ""),
          programa: String(r.programa ?? ""),
          p1: n(r.p1),
          p2: n(r.p2),
          p3: n(r.p3),
          nota_acumulada: n(r.nota_acumulada),
        }),
      );
    },
  });
}

/** La reprobación ya agregada por programa × materia × grupo × corte (ninguna nota individual). */
export function useRiesgoMonitor(periodo: string, sede: string) {
  return useQuery({
    queryKey: ["monitor", "riesgo", periodo, sede],
    staleTime: FRESCO,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_monitor_riesgo", { p_periodo: periodo, p_sede: sede }, { count: "exact" }).range(a, b));
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

/** Cuántos grupos de cada plan hay (y si el plan ya llegó de Master). */
export function usePlanesMonitor(periodo: string, sede: string) {
  return useQuery({
    queryKey: ["monitor", "planes", periodo, sede],
    staleTime: FRESCO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("wh_monitor_planes_resumen", { p_periodo: periodo, p_sede: sede });
      if (error) throw new Error(mensajeDe(error));
      return ((data ?? []) as Record<string, unknown>[]).map((r): ResumenPlan => ({ plan: planDe(String(r.plan ?? "")), grupos: num(r.grupos), matriculas: num(r.matriculas), plan_conocido: Boolean(r.plan_conocido) }));
    },
  });
}

/** Las unidades «programa» del organigrama, para asignarles los códigos de Davinci. */
export function useProgramasDelOrganigrama(habilitado: boolean) {
  return useQuery({
    queryKey: ["monitor", "organigrama"],
    enabled: habilitado,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id,name,parent_id").eq("kind", "programa").order("name");
      if (error) throw new Error(mensajeDe(error));
      return (data ?? []) as { id: string; name: string; parent_id: string | null }[];
    },
  });
}

export function useAsignarPrograma() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { codigo: string; nombre: string; unit: string | null }) => {
      const r = await supabase.rpc("wh_monitor_asignar", { p_codigo: p.codigo, p_nombre: p.nombre, p_unit: p.unit });
      if (r.error) throw new Error(mensajeDe(r.error));
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: monitorKeys.todo }),
  });
}

export function useAutoasignar(periodo: string, sede: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await supabase.rpc("wh_monitor_autoasignar", { p_periodo: periodo, p_sede: sede });
      if (r.error) throw new Error(mensajeDe(r.error));
      return Number(r.data);
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: monitorKeys.todo }),
  });
}
