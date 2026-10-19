/* =============================================================================
   Mr. Pilo · el catálogo de saludos del chat incrustado, para la intranet (0173).

   La administración edita la lista de cada Pilo (Planeación y Enseñanza): un
   texto, el momento del día en que sirve y si está activo. Sin cifras. El chat
   los lee por `pilo_greetings_public`; aquí se escribe en la tabla (la política
   de la base deja solo a la administración).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { GREETING_MAX, hasFigures } from "../../../components/pilo/greetings";
import type { GreetingMoment } from "../../../components/pilo/greetings";
import { missing0121 } from "./portals";

export type GreetingSpace = "planeacion" | "ensenanza";

export interface GreetingRow {
  id: number;
  text: string;
  moment: GreetingMoment;
  active: boolean;
  sort: number;
}

export const MOMENT_LABEL: Record<GreetingMoment, string> = {
  cualquiera: "A cualquier hora",
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

export const MOMENT_ORDER: GreetingMoment[] = ["cualquiera", "manana", "tarde", "noche"];

/** Por qué un saludo no se puede guardar; "" si sirve. */
export function greetingProblem(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3) return "El saludo necesita al menos tres letras.";
  if (t.length > GREETING_MAX) return `El saludo admite hasta ${GREETING_MAX} caracteres.`;
  if (hasFigures(t)) return "Un saludo no lleva números ni cifras.";
  return "";
}

export function parseRows(raw: unknown): GreetingRow[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => Number.isFinite(Number(r.id)) && typeof r.text === "string")
    .map((r) => ({
      id: Number(r.id),
      text: String(r.text),
      moment: (MOMENT_ORDER.includes(r.moment as GreetingMoment) ? r.moment : "cualquiera") as GreetingMoment,
      active: r.active !== false,
      sort: Number.isFinite(Number(r.sort)) ? Number(r.sort) : 100,
    }))
    .sort((a, b) => a.sort - b.sort || a.id - b.id);
}

export const greetingKeys = { space: (space: GreetingSpace) => ["pilo-ia", "saludos", space] as const };

/** Los saludos de un Pilo. Sin la migración 0173: null. */
export function useGreetingRows(space: GreetingSpace) {
  return useQuery({
    queryKey: greetingKeys.space(space),
    retry: false,
    queryFn: async (): Promise<GreetingRow[] | null> => {
      const { data, error } = await supabase.from("pilo_greetings" as never).select("id, text, moment, active, sort").eq("space", space);
      if (error) {
        if (missing0121(error)) return null;
        throw new Error(error.message);
      }
      return parseRows(data);
    },
  });
}

export type GreetingChange =
  | { kind: "add"; text: string; moment: GreetingMoment }
  | { kind: "edit"; id: number; patch: Partial<Pick<GreetingRow, "text" | "moment" | "active">> }
  | { kind: "remove"; id: number };

export function useChangeGreeting(space: GreetingSpace) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (change: GreetingChange) => {
      if (change.kind === "add") {
        const problem = greetingProblem(change.text);
        if (problem) throw new Error(problem);
        const { error } = await supabase.from("pilo_greetings" as never).insert({ space, text: change.text.replace(/\s+/g, " ").trim(), moment: change.moment, sort: 1000 } as never);
        if (error) throw new Error(error.message);
      } else if (change.kind === "edit") {
        if (change.patch.text !== undefined) {
          const problem = greetingProblem(change.patch.text);
          if (problem) throw new Error(problem);
        }
        const patch = { ...change.patch, ...(change.patch.text !== undefined ? { text: change.patch.text.replace(/\s+/g, " ").trim() } : {}), updated_at: new Date().toISOString() };
        const { error } = await supabase.from("pilo_greetings" as never).update(patch as never).eq("id", change.id).eq("space", space);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("pilo_greetings" as never).delete().eq("id", change.id).eq("space", space);
        if (error) throw new Error(error.message);
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: greetingKeys.space(space) });
    },
  });
}
