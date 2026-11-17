/* =============================================================================
   Presentación con Pilo · «Presentaciones de este informe» (migración 0284):
   listar, abrir, guardar y eliminar. La base repite el permiso (RLS).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import { leerPresentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { Presentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { Tono } from "../../../../supabase/functions/pilo-presentaciones/tonos";

export interface PresentacionGuardada {
  id: string;
  instancia_id: string;
  tono: Tono;
  titulo: string;
  creado_por: string | null;
  creado_en: string;
  pensamiento_s: number | null;
}

type ErrorBase = { code?: string; message?: string };
const COLS = "id, instancia_id, tono, titulo, creado_por, creado_en, pensamiento_s";
const falta = (e: ErrorBase) => e.code === "42P01" || e.code === "PGRST205" || /informe_presentaciones/.test(e.message ?? "") && /does not exist|schema cache/i.test(e.message ?? "");
const fallo = (e: ErrorBase) => (falta(e) ? new FaltaMigracion("Falta aplicar la migración 0284 (Presentaciones de informes).") : new Error(e.message ?? "Error de la base de datos"));

export const CLAVES = {
  lista: (inst: string) => ["informes", "presentaciones", inst] as const,
  una: (id: string) => ["informes", "presentacion", id] as const,
};

export function usePresentaciones(instancia: string | null | undefined) {
  return useQuery({
    queryKey: CLAVES.lista(instancia ?? ""),
    enabled: Boolean(instancia),
    retry: false,
    queryFn: async (): Promise<PresentacionGuardada[]> => {
      const r = await supabase.from("informe_presentaciones").select(COLS).eq("instancia_id", instancia ?? "").order("creado_en", { ascending: false });
      if (r.error) throw fallo(r.error);
      return (r.data ?? []) as PresentacionGuardada[];
    },
  });
}

/** Abre una guardada: el contenido pasa otra vez por la validación del esquema. */
export async function abrirPresentacion(id: string): Promise<{ fila: PresentacionGuardada; presentacion: Presentacion } | null> {
  const r = await supabase.from("informe_presentaciones").select(`${COLS}, contenido`).eq("id", id).maybeSingle();
  if (r.error) throw fallo(r.error);
  if (!r.data) return null;
  const { contenido, ...fila } = r.data as PresentacionGuardada & { contenido: unknown };
  const presentacion = leerPresentacion(contenido, fila.tono);
  if (!presentacion) throw new Error("La presentación guardada no se pudo leer (esquema distinto).");
  return { fila, presentacion };
}

export interface GuardarPresentacion {
  /** Con id, actualiza; sin él, crea. */
  id?: string;
  instancia_id: string;
  presentacion: Presentacion;
  pensamiento_s?: number | null;
}

export function useGuardarPresentacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: GuardarPresentacion): Promise<string> => {
      const fila = { tono: p.presentacion.tono, titulo: p.presentacion.titulo.slice(0, 200) || "Presentación", contenido: p.presentacion };
      if (p.id) {
        const r = await supabase.from("informe_presentaciones").update(fila).eq("id", p.id).select("id");
        if (r.error) throw fallo(r.error);
        if (!r.data?.length) throw new Error("No tiene permiso para cambiar esta presentación.");
        return p.id;
      }
      const sesion = (await supabase.auth.getUser()).data.user;
      const r = await supabase.from("informe_presentaciones").insert({ ...fila, instancia_id: p.instancia_id, creado_por: sesion?.id, pensamiento_s: p.pensamiento_s ?? null }).select("id").single();
      if (r.error) throw fallo(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: (_id, p) => void qc.invalidateQueries({ queryKey: CLAVES.lista(p.instancia_id) }),
  });
}

export function useEliminarPresentacion(instancia: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("informe_presentaciones").delete().eq("id", id).select("id");
      if (r.error) throw fallo(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para eliminar esta presentación.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CLAVES.lista(instancia) }),
  });
}
