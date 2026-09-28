/* =============================================================================
   Boletín · Análisis de los datos: las indicaciones guardadas (0099).

   Sin la migración, la lista llega vacía y guardar explica qué falta: el
   análisis funciona igual, solo sin plantillas.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { describeDatabaseError, FriendlyError } from "../../data/errors";
import type { AnalysisBrief } from "../../components/pilo/ai/logic";

export interface AnalysisPrompt {
  id: string;
  name: string;
  body: string;
  brief: Partial<AnalysisBrief>;
}

const key = ["boletines", "indicaciones"] as const;
const missing = (code?: string) => code === "PGRST205" || code === "42P01";

export function useAnalysisPrompts() {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<{ list: AnalysisPrompt[]; ready: boolean }> => {
      const { data, error } = await supabase.from("od_analysis_prompts").select("id, name, body, brief").order("created_at");
      if (error && missing(error.code)) return { list: [], ready: false };
      if (error) throw describeDatabaseError(error);
      return { list: (data ?? []) as AnalysisPrompt[], ready: true };
    },
  });
}

export function useSaveAnalysisPrompt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (row: { name: string; body: string; brief: Partial<AnalysisBrief> }) => {
      const { error } = await supabase.from("od_analysis_prompts").insert(row);
      if (error && missing(error.code)) {
        throw new FriendlyError("Para guardar indicaciones falta aplicar la migración 0099.", { original: error.message });
      }
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteAnalysisPrompt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("od_analysis_prompts").delete().eq("id", id);
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
