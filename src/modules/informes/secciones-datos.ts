/* =============================================================================
   Estructura configurable por ciclo (migración 0276): acceso a Supabase.
   Sin la migración la pantalla sigue con las plantillas del código y avisa
   (`falta: true`); nada lanza.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { tieneContenidoLibre } from "./secciones-config";
import type { ContenidoSeccion, Plantilla, SeccionConfigRow } from "./types";

const COLUMNAS = "ciclo_id, plantilla, clave, activa, orden, titulo, editable_por_unidad, libre, minimo";
const clave = (ciclo: string | undefined) => ["informes", "secciones-config", ciclo ?? "ninguno"] as const;
const sinTabla = (e: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "");

export interface LecturaConfigSecciones {
  filas: SeccionConfigRow[];
  /** La migración 0276 no está aplicada. */
  falta: boolean;
}

export function useConfigSecciones(cicloId: string | undefined) {
  return useQuery({
    queryKey: clave(cicloId),
    enabled: Boolean(cicloId),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<LecturaConfigSecciones> => {
      const r = await supabase.from("informe_secciones_config").select(COLUMNAS).eq("ciclo_id", cicloId as string);
      if (r.error) {
        if (sinTabla(r.error)) return { filas: [], falta: true };
        throw new Error(r.error.message);
      }
      return { filas: (r.data as SeccionConfigRow[] | null) ?? [], falta: false };
    },
  });
}

/** Guarda (upsert) una o varias secciones de la configuración. */
export function useGuardarConfigSecciones() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (filas: SeccionConfigRow[]) => {
      if (!filas.length) return;
      const r = await supabase.from("informe_secciones_config").upsert(filas, { onConflict: "ciclo_id,plantilla,clave" });
      if (r.error) throw new Error(sinTabla(r.error) ? "Falta aplicar la migración 0276." : r.error.message);
    },
    onSettled: (_d, _e, filas) => void cliente.invalidateQueries({ queryKey: clave(filas[0]?.ciclo_id) }),
  });
}

/** Elimina una sección libre (la base borra también lo que las unidades escribieron en ella). */
export function useBorrarSeccionLibre() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (f: { ciclo_id: string; plantilla: Plantilla; clave: string }) => {
      const r = await supabase.from("informe_secciones_config").delete().eq("ciclo_id", f.ciclo_id).eq("plantilla", f.plantilla).eq("clave", f.clave).eq("libre", true);
      if (r.error) throw new Error(r.error.message);
    },
    onSettled: (_d, _e, f) => void cliente.invalidateQueries({ queryKey: clave(f.ciclo_id) }),
  });
}

/** En cuántos informes de la plantilla ya hay algo escrito en una sección libre (para confirmar antes de borrarla). */
export async function informesConContenidoLibre(instancias: string[], claveSeccion: string): Promise<number> {
  if (!instancias.length) return 0;
  const r = await supabase.from("informe_secciones").select("contenido").eq("clave", claveSeccion).in("instancia_id", instancias.slice(0, 500));
  if (r.error) return 0;
  return ((r.data as { contenido: ContenidoSeccion | null }[] | null) ?? []).filter((f) => tieneContenidoLibre(f.contenido)).length;
}

/** Copia la estructura de un ciclo a otro (para «Preparar el ciclo siguiente»). */
export async function copiarConfigDeCiclo(origen: string, destino: string): Promise<number> {
  const r = await supabase.from("informe_secciones_config").select(COLUMNAS).eq("ciclo_id", origen);
  if (r.error) return 0;
  const filas = ((r.data as SeccionConfigRow[] | null) ?? []).map((f) => ({ ...f, ciclo_id: destino }));
  if (!filas.length) return 0;
  const w = await supabase.from("informe_secciones_config").upsert(filas, { onConflict: "ciclo_id,plantilla,clave" });
  return w.error ? 0 : filas.length;
}
