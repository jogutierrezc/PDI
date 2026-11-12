/* =============================================================================
   Informes · acceso a Supabase de las mejoras de la migración 0279: estructuras propias,
   qué oficinas usan cada plantilla, responsables de cada unidad y restablecer.

   Sin la migración, las pantallas siguen con las plantillas A–D y avisan (`falta: true`);
   nada lanza. Cada función de la base repite el permiso (solo Planeación): ocultar un botón
   nunca es la única defensa.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { registrarEstructuras } from "./plantillas";
import type { EstructuraRow, PapelResponsable, PersonaRef, Plantilla, PlantillaUnidadRow, ResponsableRow, SeccionEstructuraJson } from "./types";

const sinObjeto = (e: { code?: string; message?: string }) => ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache|Could not find the function/i.test(e.message ?? "");
const FALTA = "Falta aplicar la migración 0279 (Informes · mejoras).";
const fallo = (e: { code?: string; message?: string }) => new Error(sinObjeto(e) ? FALTA : (e.message ?? "No se pudo completar."));

export const CLAVES_MEJORAS = {
  estructuras: ["informes", "estructuras"] as const,
  unidades: ["informes", "plantilla-unidades"] as const,
  responsables: (unit: string | undefined) => ["informes", "responsables", unit ?? "ninguna"] as const,
  config: (ciclo: string) => ["informes", "secciones-config", ciclo] as const,
};

/* --- Estructuras propias ------------------------------------------------------------------- */

export interface LecturaEstructuras {
  filas: EstructuraRow[];
  /** La migración 0279 no está aplicada. */
  falta: boolean;
}

/** Lee las estructuras propias y las registra junto a A–D: el resto del módulo las ve como cualquier plantilla. */
export function useEstructuras() {
  return useQuery({
    queryKey: CLAVES_MEJORAS.estructuras,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<LecturaEstructuras> => {
      const r = await supabase.from("informe_estructuras").select("plantilla, nombre, quien, destino, descripcion, base, secciones, activa, created_at, updated_at").order("plantilla");
      if (r.error) {
        if (sinObjeto(r.error)) {
          registrarEstructuras([]);
          return { filas: [], falta: true };
        }
        throw new Error(r.error.message);
      }
      const filas = (r.data as EstructuraRow[] | null) ?? [];
      registrarEstructuras(filas);
      return { filas, falta: false };
    },
  });
}

export interface DatosEstructura {
  nombre: string;
  quien: string;
  destino: string;
  descripcion: string;
  base?: Plantilla | null;
  secciones: SeccionEstructuraJson[];
  activa: boolean;
}

/** Crea (plantilla nula) o cambia una estructura propia. Devuelve la fila guardada. */
export function useGuardarEstructura() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { plantilla: Plantilla | null; datos: Partial<DatosEstructura> }): Promise<EstructuraRow> => {
      const r = await supabase.rpc("informe_estructura_guardar", { p_plantilla: a.plantilla, p_datos: a.datos });
      if (r.error) throw fallo(r.error);
      return r.data as EstructuraRow;
    },
    onSettled: () => void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.estructuras }),
  });
}

/** Elimina una estructura propia sin informes (la base lo impide si ya se usó). */
export function useEliminarEstructura() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (plantilla: Plantilla) => {
      const r = await supabase.from("informe_estructuras").delete().eq("plantilla", plantilla);
      if (r.error) throw fallo(r.error);
    },
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.estructuras });
      void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.unidades });
    },
  });
}

/* --- Qué oficinas usan cada plantilla ------------------------------------------------------ */

export function usePlantillaUnidades() {
  return useQuery({
    queryKey: CLAVES_MEJORAS.unidades,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<{ filas: PlantillaUnidadRow[]; falta: boolean }> => {
      const r = await supabase.from("informe_plantilla_unidades").select("plantilla, unit_id");
      if (r.error) {
        if (sinObjeto(r.error)) return { filas: [], falta: true };
        throw new Error(r.error.message);
      }
      return { filas: (r.data as PlantillaUnidadRow[] | null) ?? [], falta: false };
    },
  });
}

/** Define a qué oficinas se limita una plantilla. Lista vacía: todas la pueden usar. */
export function useGuardarUnidadesDePlantilla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { plantilla: Plantilla; unidades: string[] }) => {
      const r = await supabase.rpc("informe_plantilla_unidades_guardar", { p_plantilla: a.plantilla, p_unidades: a.unidades });
      if (r.error) throw fallo(r.error);
      return Number(r.data ?? 0);
    },
    onSettled: () => void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.unidades }),
  });
}

/* --- Restablecer la estructura de una plantilla en un ciclo -------------------------------- */

/** En preparación borra los ajustes del ciclo; con el ciclo abierto reactiva las secciones y las abre a la unidad. Devuelve cuántos cambió. */
export function useRestablecerEstructura() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { ciclo: string; plantilla: Plantilla }) => {
      const r = await supabase.rpc("informe_estructura_restablecer", { p_ciclo: a.ciclo, p_plantilla: a.plantilla });
      if (r.error) throw fallo(r.error);
      return Number(r.data ?? 0);
    },
    onSettled: (_d, _e, a) => void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.config(a.ciclo) }),
  });
}

/* --- Responsables ---------------------------------------------------------------------------- */

export function useResponsables(unitId: string | undefined) {
  return useQuery({
    queryKey: CLAVES_MEJORAS.responsables(unitId),
    enabled: Boolean(unitId),
    retry: false,
    queryFn: async (): Promise<{ filas: ResponsableRow[]; falta: boolean }> => {
      const r = await supabase.rpc("informe_responsables", { p_unit: unitId as string });
      if (r.error) {
        if (sinObjeto(r.error)) return { filas: [], falta: true };
        throw new Error(r.error.message);
      }
      return { filas: ((r.data as ResponsableRow[] | null) ?? []).map((x) => ({ ...x, rol: x.rol as PapelResponsable })), falta: false };
    },
  });
}

/** Busca personas por nombre o correo (desde 2 letras). */
export function useBuscarPersonas(texto: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: ["informes", "buscar-personas", q],
    enabled: q.length >= 2,
    retry: false,
    staleTime: 15_000,
    queryFn: async (): Promise<PersonaRef[]> => {
      const r = await supabase.rpc("informe_buscar_personas", { p_q: q });
      if (r.error) throw fallo(r.error);
      return (r.data as PersonaRef[] | null) ?? [];
    },
  });
}

function useMutacionResponsables<A extends { unit: string }, R>(fn: (a: A) => Promise<R>) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: (_d, _e, a) => void cliente.invalidateQueries({ queryKey: CLAVES_MEJORAS.responsables(a.unit) }),
  });
}

/** Asigna a una persona como responsable de la unidad (jefe = Gestor, editor = Contribuyente, visor = Consulta). */
export const useAsignarResponsable = () =>
  useMutacionResponsables(async (a: { unit: string; profile: string; rol: PapelResponsable; campus?: string | null }) => {
    const r = await supabase.rpc("informe_asignar_responsable", { p_unit: a.unit, p_profile: a.profile, p_rol: a.rol, p_campus: a.campus ?? null });
    if (r.error) throw fallo(r.error);
  });

/** Quita a un responsable: si lo asignó este módulo vuelve a su papel anterior. */
export const useQuitarResponsable = () =>
  useMutacionResponsables(async (a: { unit: string; profile: string }) => {
    const r = await supabase.rpc("informe_quitar_responsable", { p_unit: a.unit, p_profile: a.profile });
    if (r.error) throw fallo(r.error);
  });

/** Deshace lo asignado desde Informes en la unidad. Devuelve a cuántas personas tocó. */
export const useRestablecerResponsables = () =>
  useMutacionResponsables(async (a: { unit: string }) => {
    const r = await supabase.rpc("informe_responsables_restablecer", { p_unit: a.unit });
    if (r.error) throw fallo(r.error);
    return Number(r.data ?? 0);
  });
