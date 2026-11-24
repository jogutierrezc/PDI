/* =============================================================================
   Datos requeridos por plantilla (migración 0253): acceso a Supabase.
   Sin la migración la pantalla sigue y avisa (`falta: true`); nada lanza.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { normalizarRequerido } from "./requeridos-logica";
import type { DatoRequerido } from "./requeridos-logica";

const COLUMNAS = "id, ciclo_id, plantilla, clave, dato, fuente_tipo, fuente_nombre, criterio, unidad, mayor_mejor, condicion, orden";
const clave = (ciclo: string | undefined) => ["informes", "requeridos", ciclo ?? "ninguno"] as const;

const sinTabla = (e: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "");

export interface LecturaRequeridos {
  filas: DatoRequerido[];
  /** La migración 0253 no está aplicada. */
  falta: boolean;
}

export function useRequeridos(cicloId: string | undefined) {
  return useQuery({
    queryKey: clave(cicloId),
    enabled: Boolean(cicloId),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<LecturaRequeridos> => {
      const r = await supabase.from("informe_datos_requeridos").select(COLUMNAS).eq("ciclo_id", cicloId as string).order("orden");
      if (r.error) {
        if (sinTabla(r.error)) return { filas: [], falta: true };
        throw new Error(r.error.message);
      }
      const filas = ((r.data as Record<string, unknown>[] | null) ?? []).map(normalizarRequerido).filter((x): x is DatoRequerido => x !== null);
      return { filas, falta: false };
    },
  });
}

const limpio = (r: DatoRequerido) => ({ ...r, dato: r.dato.trim(), fuente_nombre: r.fuente_nombre.trim().slice(0, 200) });

/** Guarda (upsert por id) uno o varios datos requeridos. */
export function useGuardarRequeridos() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (filas: DatoRequerido[]) => {
      if (!filas.length) return;
      const r = await supabase.from("informe_datos_requeridos").upsert(filas.map(limpio), { onConflict: "id" });
      if (r.error) throw new Error(sinTabla(r.error) ? "Falta aplicar la migración 0253." : r.error.message);
    },
    onSettled: (_d, _e, filas) => {
      for (const c of new Set(filas.map((f) => f.ciclo_id))) void cliente.invalidateQueries({ queryKey: clave(c) });
    },
  });
}

export function useBorrarRequerido() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (r: { id: string; ciclo_id: string }) => {
      const x = await supabase.from("informe_datos_requeridos").delete().eq("id", r.id);
      if (x.error) throw new Error(x.error.message);
    },
    onSettled: (_d, _e, r) => void cliente.invalidateQueries({ queryKey: clave(r.ciclo_id) }),
  });
}

/** Copia la configuración de un ciclo a otro (para «Preparar el ciclo siguiente»). */
export async function copiarDeCiclo(origen: string, destino: string): Promise<number> {
  const r = await supabase.from("informe_datos_requeridos").select(COLUMNAS).eq("ciclo_id", origen);
  if (r.error) return 0;
  const filas = ((r.data as Record<string, unknown>[] | null) ?? []).map(normalizarRequerido).filter((x): x is DatoRequerido => x !== null);
  if (!filas.length) return 0;
  const w = await supabase.from("informe_datos_requeridos").upsert(
    filas.map((f) => ({ ...f, id: crypto.randomUUID(), ciclo_id: destino })),
    { onConflict: "ciclo_id,plantilla,clave" },
  );
  return w.error ? 0 : filas.length;
}
