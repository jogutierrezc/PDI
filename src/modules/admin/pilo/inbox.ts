/* =============================================================================
   Pregúntele a Pilo · la bandeja de lo que no supo (0109).

   La función pilo-ia anota aquí las preguntas que no pudo responder, las que
   alguien marcó «No me sirvió» y las que la IA redactó con una cifra sin
   fuente. La misma pregunta suma veces. La administración la responde en el
   catálogo (y queda resuelta con esa clave) o la descarta.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

export type InboxReason = "sin_respuesta" | "no_sirvio" | "revisar";

export interface InboxItem {
  id: number;
  question: string;
  reason: InboxReason;
  kind: string;
  answer: string;
  answer_id: number | null;
  times: number;
  first_at: string;
  last_at: string;
}

export const REASON_LABEL: Record<InboxReason, string> = {
  sin_respuesta: "No encontró respuesta",
  no_sirvio: "No le sirvió a quien preguntó",
  revisar: "La IA dijo una cifra sin fuente",
};

const inboxKey = ["pilo-ia", "bandeja"] as const;

/** Lo pendiente: lo más preguntado primero. Sin 0109, null. */
export function useInbox(limit = 12) {
  return useQuery({
    queryKey: [...inboxKey, limit],
    queryFn: async (): Promise<{ rows: InboxItem[]; total: number } | null> => {
      const { data, error, count } = await supabase
        .from("pilo_inbox")
        .select("id, question, reason, kind, answer, answer_id, times, first_at, last_at", { count: "exact" })
        .eq("status", "pendiente")
        .order("times", { ascending: false })
        .order("last_at", { ascending: false })
        .limit(limit);
      if (error) return null;
      return { rows: (data ?? []) as InboxItem[], total: count ?? 0 };
    },
  });
}

/** Resolver (con la clave del catálogo) o descartar. Al resolver, la respuesta guardada que no sirvió se oculta. */
export function useCloseInbox() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, key }: { id: number; status: "resuelta" | "descartada"; key?: string }) => {
      const { error } = await supabase.rpc("pilo_inbox_close", { p_id: id, p_status: status, p_key: key ?? null } as never);
      if (error) throw error;
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: inboxKey });
      void client.invalidateQueries({ queryKey: ["pilo-ia", "memoria", "respuestas"] });
    },
  });
}
