/* =============================================================================
   Plantilla Excel de Impacto en la base (0070): firmar, verificar e importar.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type { SignedTemplate } from "../excel/template";
import type { TemplateControl } from "../excel/import";

export interface ImportResult {
  batchId: number;
  loaded: number;
  errors: { row: number; message: string }[];
  allOrNothing: boolean;
}

function fail(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    throw new Error("La base aún no tiene la plantilla de Impacto: aplique la migración 0070_impacto_plantilla.sql.");
  }
  // Los motivos de rechazo de la plantilla ya vienen en español y dicen qué hacer.
  if (["22023", "23514", "55000", "42501", "P0001", "P0002"].includes(error.code ?? "")) throw new Error(error.message);
  const friendly = describeDatabaseError(error as DatabaseError);
  throw new Error(`${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
}

export async function signTemplate(periodId: string, programId: string): Promise<SignedTemplate> {
  const { data, error } = await supabase.rpc("imp_sign_template", { period: periodId, program: programId });
  fail(error);
  return data as SignedTemplate;
}

export async function verifyTemplate(control: TemplateControl): Promise<{ templateId: string; generatedAt: string; periodCode: string }> {
  const { data, error } = await supabase.rpc("imp_verify_template", { control });
  fail(error);
  return data as { templateId: string; generatedAt: string; periodCode: string };
}

/** La política IMPORTACION_TODO_O_NADA (por defecto, carga parcial). */
export function useAllOrNothing() {
  return useQuery({
    queryKey: ["impacto", "ajustes", "importacion_todo_o_nada"],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from("imp_settings").select("value").eq("key", "importacion_todo_o_nada").maybeSingle();
      if (error && (error.code === "PGRST205" || error.code === "42P01")) return false;
      fail(error);
      return data?.value === true;
    },
  });
}

export function useImportTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      rows: { row: number; recordId: string; fields: Record<string, unknown> }[];
      fileName: string;
      summary: { rowsRead: number; rowsError: number; report: Record<string, unknown> };
    }): Promise<ImportResult> => {
      const { data, error } = await supabase.rpc("imp_import_template", {
        template: input.templateId,
        rows_in: input.rows,
        file_name: input.fileName,
        summary: input.summary,
      });
      fail(error);
      return data as ImportResult;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["impacto", "captura"] }),
  });
}
