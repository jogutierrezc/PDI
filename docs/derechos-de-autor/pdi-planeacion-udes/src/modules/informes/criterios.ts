/* =============================================================================
   Criterios de Resultados por dimensión (migración 0252): acceso a Supabase.
   Sin la migración la pantalla sigue con los seis criterios base y avisa.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Plantilla } from "./types";

export type EstadoCriterio = "propuesto" | "aprobado" | "rechazado" | "archivado";

export interface CriterioRow {
  id: string;
  nombre: string;
  descripcion: string;
  plantillas: Plantilla[];
  estado: EstadoCriterio;
  vigente_desde: number | null;
  unit_id: string | null;
  propuesto_por: string | null;
  nota_revision: string;
  created_at: string;
}

const COLUMNAS = "id, nombre, descripcion, plantillas, estado, vigente_desde, unit_id, propuesto_por, nota_revision, created_at";
const CLAVE = ["informes", "criterios"] as const;

const sinTabla = (e: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "");

export interface LecturaCriterios {
  filas: CriterioRow[];
  /** La migración 0252 no está aplicada. */
  falta: boolean;
}

/** Todos los que el usuario puede leer: Planeación ve todos; el resto, los aprobados y sus propuestas. */
export function useCriterios() {
  return useQuery({
    queryKey: CLAVE,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<LecturaCriterios> => {
      const r = await supabase.from("informe_criterios").select(COLUMNAS).order("nombre");
      if (r.error) {
        if (sinTabla(r.error)) return { filas: [], falta: true };
        throw new Error(r.error.message);
      }
      return { filas: (r.data as CriterioRow[] | null) ?? [], falta: false };
    },
  });
}

/** Los criterios aprobados que rigen en un ciclo para una plantilla. */
export function aprobadosPara(filas: CriterioRow[], plantilla: Plantilla, anio: number): { id: string; nombre: string }[] {
  return filas
    .filter((c) => c.estado === "aprobado" && (c.vigente_desde === null || c.vigente_desde <= anio) && (c.plantillas.length === 0 || c.plantillas.includes(plantilla)))
    .map((c) => ({ id: `c_${c.id}`, nombre: c.nombre }));
}

export function useSugerirCriterio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { nombre: string; descripcion: string; unidad: string }) => {
      const r = await supabase.from("informe_criterios").insert({ nombre: p.nombre.trim(), descripcion: p.descripcion.trim(), unit_id: p.unidad, estado: "propuesto" });
      if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "Ya existe un criterio con ese nombre." : r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useCrearCriterio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { nombre: string; descripcion: string; plantillas: Plantilla[]; vigente_desde: number | null }) => {
      const r = await supabase.from("informe_criterios").insert({ ...p, nombre: p.nombre.trim(), descripcion: p.descripcion.trim(), estado: "aprobado" });
      if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "Ya existe un criterio con ese nombre." : r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useRevisarCriterio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; estado: EstadoCriterio; vigente_desde?: number | null; plantillas?: Plantilla[]; nota?: string }) => {
      const cambios: Record<string, unknown> = { estado: p.estado };
      if (p.vigente_desde !== undefined) cambios.vigente_desde = p.vigente_desde;
      if (p.plantillas) cambios.plantillas = p.plantillas;
      if (p.nota !== undefined) cambios.nota_revision = p.nota;
      const r = await supabase.from("informe_criterios").update(cambios).eq("id", p.id);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useBorrarCriterio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("informe_criterios").delete().eq("id", id);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVE }),
  });
}
