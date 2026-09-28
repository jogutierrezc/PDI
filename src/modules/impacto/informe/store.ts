/* =============================================================================
   Indicadores de Impacto · el informe con Mr. Pilo: lectura y escritura (0100).

   imp_report_switches()  si la IA está encendida y a qué tipos de unidad abrió
                          la administración los informes (cualquier sesión)
   imp_ai_reports         los informes escritos: los ve quien los escribió y la
                          administración; se guardan al terminar de escribir,
                          así lo pagado a la IA no se pierde al cerrar la ventana
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import { normalizeDoc } from "./report";
import type { ReportDoc, ReportKind, ReportSwitches } from "./report";

export const reportKeys = {
  switches: ["impacto", "informe", "interruptores"] as const,
  list: ["impacto", "informe", "lista"] as const,
  one: (id: string) => ["impacto", "informe", id] as const,
};

/** Sin la migración 0100 no hay interruptor: solo la administración ve el botón. */
export function useReportSwitches(enabled = true) {
  return useQuery({
    queryKey: reportKeys.switches,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ReportSwitches | null> => {
      const { data, error } = await supabase.rpc("imp_report_switches");
      if (error || !data) return null;
      const raw = data as Record<string, unknown>;
      return { enabled: Boolean(raw.enabled), programa: raw.programa === true, facultad: raw.facultad === true, vicerrectoria: raw.vicerrectoria === true };
    },
  });
}

export interface SavedReport {
  id: string;
  kind: ReportKind;
  ref: string;
  campusId: string | null;
  title: string;
  createdAt: string;
}

export function useSavedReports(enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.list,
    enabled,
    retry: false,
    queryFn: async (): Promise<SavedReport[]> => {
      const { data, error } = await supabase
        .from("imp_ai_reports")
        .select("id,kind,ref,campus_id,title,created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      // Sin la migración 0100, la lista sale vacía.
      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id as string,
        kind: r.kind as ReportKind,
        ref: r.ref as string,
        campusId: (r.campus_id as string | null) ?? null,
        title: r.title as string,
        createdAt: r.created_at as string,
      }));
    },
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: reportKeys.one(id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<{ doc: ReportDoc; createdAt: string } | null> => {
      const { data, error } = (await supabase.from("imp_ai_reports").select("content,created_at").eq("id", id!).maybeSingle()) as {
        data: { content: unknown; created_at: string } | null;
        error: DatabaseError | null;
      };
      if (error) throw describeDatabaseError(error);
      if (!data) return null;
      const doc = normalizeDoc(data.content);
      return doc ? { doc, createdAt: data.created_at } : null;
    },
  });
}

export function useSaveReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc, id }: { doc: ReportDoc; id: string | null }): Promise<string> => {
      // Ya guardado (se volvió a escribir un capítulo): se completa el mismo.
      if (id) {
        const { error } = await supabase.from("imp_ai_reports").update({ title: doc.title.slice(0, 200), content: doc }).eq("id", id);
        if (error) throw describeDatabaseError(error as DatabaseError);
        await client.invalidateQueries({ queryKey: reportKeys.one(id) });
        return id;
      }
      const { data, error } = (await supabase
        .from("imp_ai_reports")
        .insert({ kind: doc.scope.kind, ref: doc.scope.ref, campus_id: doc.scope.campusId, title: doc.title.slice(0, 200), content: doc })
        .select("id")
        .single()) as { data: { id: string } | null; error: DatabaseError | null };
      if (error) throw describeDatabaseError(error);
      return data!.id;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: reportKeys.list });
    },
  });
}

export function useDeleteReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imp_ai_reports").delete().eq("id", id);
      if (error) throw describeDatabaseError(error as DatabaseError);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: reportKeys.list });
    },
  });
}
