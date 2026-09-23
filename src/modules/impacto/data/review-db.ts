/* =============================================================================
   Revisión de Impacto sobre la base (0071).

   Las bandejas se leen de la misma vista que la captura (imp_capture_rows),
   que ya respeta quién ve qué. El alcance —qué programas aprueba quien
   pregunta y qué funciones valida— lo dice imp_my_review_scope(), y las
   decisiones van por imp_review(), que aplica el flujo, la separación de
   funciones y deja una transición por registro.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type { CaptureRow } from "./capture-db";
import type { FunctionId } from "./types";

export interface ReviewScope {
  deanPrograms: { id: string; name: string; faculty: string | null }[];
  functions: FunctionId[];
}

export type ReviewAction = "aprobar" | "devolver" | "validar";

/** Lo que la decanatura tiene pendiente y lo que ya pasó por ella. */
export const DEAN_PENDING = ["enviado", "devuelto_decanatura"] as const;
export const DEAN_DONE = ["aprobado_decanatura", "validado"] as const;
/** Lo que la vicerrectoría tiene pendiente y lo que ya validó. */
export const VICE_PENDING = ["aprobado_decanatura"] as const;
export const VICE_DONE = ["validado"] as const;

function fail(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    throw new Error("La base aún no tiene la revisión de Impacto: aplique la migración 0071_impacto_flujo.sql.");
  }
  // Los mensajes del flujo ya vienen en español y dicen qué registro y por qué.
  if (["42501", "23514", "55000", "22023", "P0002"].includes(error.code ?? "")) throw new Error(error.message);
  const friendly = describeDatabaseError(error as DatabaseError);
  throw new Error(`${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
}

const KEY = ["impacto", "revision"] as const;

export function useReviewScope() {
  return useQuery({
    queryKey: [...KEY, "alcance"],
    queryFn: async (): Promise<ReviewScope> => {
      const { data, error } = await supabase.rpc("imp_my_review_scope");
      // Sin la migración, nadie revisa: la vista no se ofrece en vez de fallar.
      if (error && (error.code === "PGRST202" || error.code === "42883")) return { deanPrograms: [], functions: [] };
      fail(error);
      return (data ?? { deanPrograms: [], functions: [] }) as ReviewScope;
    },
  });
}

/** Registros de los periodos abiertos que tocan a esta persona como decanatura o vicerrectoría. */
export function useReviewRows(scope: ReviewScope | undefined) {
  return useQuery({
    queryKey: [...KEY, "registros", scope?.deanPrograms.map((p) => p.id).join(","), scope?.functions.join(",")],
    enabled: Boolean(scope && (scope.deanPrograms.length || scope.functions.length)),
    queryFn: async (): Promise<{ dean: CaptureRow[]; vice: CaptureRow[] }> => {
      const programs = scope!.deanPrograms.map((p) => p.id);
      const [dean, vice] = await Promise.all([
        programs.length
          ? supabase
              .from("imp_capture_rows")
              .select("*")
              .eq("period_state", "abierto")
              .in("program_id", programs)
              .in("state", [...DEAN_PENDING, ...DEAN_DONE])
              .order("program_name")
              .order("code")
          : Promise.resolve({ data: [], error: null }),
        scope!.functions.length
          ? supabase
              .from("imp_capture_rows")
              .select("*")
              .eq("period_state", "abierto")
              .in("function_id", scope!.functions)
              .in("state", [...VICE_PENDING, ...VICE_DONE])
              .order("program_name")
              .order("code")
          : Promise.resolve({ data: [], error: null }),
      ]);
      fail(dean.error);
      fail(vice.error);
      return { dean: (dean.data ?? []) as CaptureRow[], vice: (vice.data ?? []) as CaptureRow[] };
    },
  });
}

export function useReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; action: ReviewAction; reason?: string | null; comment?: string }) => {
      const { data, error } = await supabase.rpc("imp_review", {
        record_ids: input.ids,
        action: input.action,
        reason: input.reason ?? null,
        comment: input.comment ?? "",
      });
      fail(error);
      return data as number;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["impacto"] }),
  });
}

/** Quien capturó o guardó el registro no lo revisa. La base además descarta a quien lo envió. */
export const isOwn = (row: CaptureRow & { updated_by?: string | null }, me: string | undefined) =>
  Boolean(me) && (row.captured_by === me || row.updated_by === me);
