/* =============================================================================
   Periodos, asignaciones y precargados de Impacto en la base (0068).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";

export interface Period {
  id: string;
  code: string;
  state: "abierto" | "cerrado";
  catalog_version_id: string;
  cutoff_program: string;
  cutoff_faculty: string;
  cutoff_vice: string;
  opened_at: string;
  version: { number: number } | null;
}

export interface Candidate {
  indicator_id: string;
  indicator_code: string;
  indicator_name: string;
  function_id: string;
  report_level: string;
  program_id: string;
  program_name: string;
  faculty_name: string | null;
  degree_level: string;
  campus_id: string | null;
  campus_name: string | null;
}

export interface Assignment {
  id: string;
  active: boolean;
  manual: boolean;
  justification: string;
  program_id: string;
  campus_id: string | null;
  indicator: { id: string; code: string; name: string; capture_mode: string | null; report_level: string | null };
  program: { id: string; name: string; code: string; snies_code: string | null; parent: { name: string } | null };
  campus: { name: string; slug: string } | null;
  record: { state: string }[] | null;
}

export interface ProgramOption {
  id: string;
  name: string;
  code: string;
  snies_code: string | null;
  campuses: { campus: { id: string; name: string; slug: string } }[];
}

export interface Change {
  action: "quitar" | "agregar";
  indicator_id: string;
  program_id: string;
  campus_id: string | null;
  justification: string;
  /** Solo para mostrar. */
  label?: string;
}

export interface PreloadResult {
  loaded: number;
  errors: { row: number; message: string }[];
}

function fail(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01") {
    throw new Error("La base aún no tiene los periodos de Impacto: aplique la migración 0068_impacto_periodos.sql.");
  }
  if (["P0001", "P0002", "23514", "23505", "55000", "22023", "42501"].includes(error.code ?? "")) throw new Error(error.message);
  const friendly = describeDatabaseError(error as DatabaseError);
  throw new Error(`${friendly.message}${friendly.advice ? ` ${friendly.advice}` : ""}`);
}

const KEY = ["impacto", "periodos"] as const;

export function usePeriods() {
  return useQuery({
    queryKey: [...KEY, "lista"],
    queryFn: async (): Promise<Period[]> => {
      const { data, error } = await supabase
        .from("imp_periods")
        .select("id, code, state, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice, opened_at, version:imp_catalog_versions(number)")
        .order("code", { ascending: false });
      fail(error);
      return (data ?? []) as unknown as Period[];
    },
  });
}

export function usePublishedVersions() {
  return useQuery({
    queryKey: [...KEY, "versiones"],
    queryFn: async (): Promise<{ id: string; number: number }[]> => {
      const { data, error } = await supabase.from("imp_catalog_versions").select("id, number").eq("state", "publicada").order("number", { ascending: false });
      fail(error);
      return data ?? [];
    },
  });
}

export function useAssignmentPreview(code: string | null, versionId: string | null) {
  return useQuery({
    queryKey: [...KEY, "vista-previa", code, versionId],
    enabled: Boolean(code && versionId),
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase.rpc("imp_preview_assignments", { period_code: code!, version: versionId! });
      fail(error);
      return (data ?? []) as Candidate[];
    },
  });
}

export function usePeriodAssignments(periodId: string | null) {
  return useQuery({
    queryKey: [...KEY, "asignaciones", periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from("imp_assignments")
        .select(
          `id, active, manual, justification, program_id, campus_id,
           indicator:imp_indicators(id, code, name, capture_mode, report_level),
           program:units!imp_assignments_program_id_fkey(id, name, code, snies_code, parent:units!units_parent_id_fkey(name)),
           campus:campuses(name, slug),
           record:imp_records(state)`,
        )
        .eq("period_id", periodId!);
      fail(error);
      return (data ?? []) as unknown as Assignment[];
    },
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: [...KEY, "programas"],
    queryFn: async (): Promise<ProgramOption[]> => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, code, snies_code, campuses:imp_program_campuses(campus:campuses(id, name, slug))")
        .eq("kind", "programa")
        .order("name");
      fail(error);
      return (data ?? []) as unknown as ProgramOption[];
    },
  });
}

export function useVersionIndicators(versionId: string | null) {
  return useQuery({
    queryKey: [...KEY, "indicadores", versionId],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<{ id: string; code: string; name: string; report_level: string | null }[]> => {
      const { data, error } = await supabase
        .from("imp_indicators")
        .select("id, code, name, report_level")
        .eq("version_id", versionId!)
        .eq("catalog_state", "oficial")
        .order("code");
      fail(error);
      return data ?? [];
    },
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["impacto"] });
}

export function useOpenPeriod() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { code: string; cutoffs: [string, string, string]; versionId: string; changes: Change[] }) => {
      const { data, error } = await supabase.rpc("imp_open_period", {
        period_code: input.code,
        cutoff_program: input.cutoffs[0],
        cutoff_faculty: input.cutoffs[1],
        cutoff_vice: input.cutoffs[2],
        version: input.versionId,
        changes: input.changes.map(({ label: _label, ...change }) => change),
      });
      fail(error);
      return data as { periodId: string; active: number; removed: number; added: number };
    },
    onSuccess: invalidate,
  });
}

export function useSetAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean; reason: string }) => {
      const { error } = await supabase.rpc("imp_set_assignment", { target: input.id, make_active: input.active, reason: input.reason });
      fail(error);
    },
    onSuccess: invalidate,
  });
}

export function useAddAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { periodId: string; indicatorId: string; programId: string; campusId: string | null; reason: string }) => {
      const { error } = await supabase.rpc("imp_add_assignment", {
        period: input.periodId,
        indicator: input.indicatorId,
        program: input.programId,
        campus: input.campusId,
        reason: input.reason,
      });
      fail(error);
    },
    onSuccess: invalidate,
  });
}

export function useClosePeriod() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase.rpc("imp_close_period", { target: periodId });
      fail(error);
    },
    onSuccess: invalidate,
  });
}

export function useLoadPreloaded() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { periodId: string; items: unknown[]; fileName: string }): Promise<PreloadResult> => {
      const { data, error } = await supabase.rpc("imp_load_preloaded", { period: input.periodId, items: input.items, source_file: input.fileName });
      fail(error);
      return data as PreloadResult;
    },
    onSuccess: invalidate,
  });
}
