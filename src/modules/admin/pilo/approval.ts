/* =============================================================================
   Mr. Pilo · la aprobación pública de cada fuente (0173).

   Con la memoria unificada, el público (el chat incrustado en udes.edu.co, un
   visitante, una cuenta de Pilo) lee de TODAS las fuentes, pero solo lo que es
   público Y que la administración aprobó. El personal con sesión lee también lo
   no aprobado. Esta pantalla muestra, por fuente, cuántos pasajes hay, cuántos
   son públicos y están aprobados, y deja aprobar o retirar la fuente de un
   solo interruptor. Lo que entra por los lectores profundos nace sin aprobar.

   Lo puro va arriba (leer la respuesta de la base, decidir el estado del
   interruptor, escribir el efecto); lo que habla con la base, abajo.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { missing0121 } from "./portals";

export interface SourceApproval {
  id: string;
  name: string;
  scope: string;
  kind: string;
  /** Pide sesión de la intranet en cualquier portal (Impacto): el público nunca la lee. */
  staffOnly: boolean;
  /** No sale de su portal (Moodle). */
  staysHome: boolean;
  /** Está encendida en el portal de su casa. */
  enabled: boolean;
  /** La administración aprobó que el público la lea. */
  publicOk: boolean;
  /** Pasajes que se leen (sin los ocultos), públicos, públicos aprobados y públicos pendientes de aprobar. */
  passages: number;
  public: number;
  approved: number;
  pending: number;
  /** Pasajes de la capa profunda, «con sesión» y ocultos. */
  deep: number;
  session: number;
  hidden: number;
  updatedAt: string | null;
}

const whole = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** `pilo_sources_overview()` leída con cuidado: lo que no se reconoce no entra. */
export function parseOverview(raw: unknown): SourceApproval[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.id === "string" && /^[a-z]{3,30}$/.test(r.id))
    .map((r) => ({
      id: r.id as string,
      name: text(r.name, 80) || (r.id as string),
      scope: text(r.scope, 20),
      kind: text(r.kind, 20),
      staffOnly: r.staff_only === true,
      staysHome: r.stays_home === true,
      enabled: r.enabled === true,
      publicOk: r.public_ok === true,
      passages: whole(r.passages),
      public: whole(r.public),
      approved: whole(r.approved),
      pending: whole(r.pending),
      deep: whole(r.deep),
      session: whole(r.session),
      hidden: whole(r.hidden),
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
    }));
}

/** El interruptor está encendido cuando la fuente está aprobada y no queda nada público por aprobar. */
export const approvalOn = (s: SourceApproval): boolean => s.publicOk && s.pending === 0;

export type ApprovalState = "solo-personal" | "apagada" | "aprobada" | "pendiente" | "sin-aprobar";

/** En qué estado está la fuente de cara al público. */
export function approvalState(s: SourceApproval): ApprovalState {
  if (s.staffOnly) return "solo-personal";
  if (!s.enabled) return "apagada";
  if (!s.publicOk) return "sin-aprobar";
  return s.pending > 0 ? "pendiente" : "aprobada";
}

export const STATE_TEXT: Record<ApprovalState, string> = {
  "solo-personal": "Solo personal con sesión",
  apagada: "Apagada en su portal",
  "sin-aprobar": "Sin aprobar",
  pendiente: "Aprobada, con pasajes por aprobar",
  aprobada: "Aprobada para el público",
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

/** La línea de números de una fuente. */
export function countsText(s: SourceApproval): string {
  const parts = [plural(s.passages, "pasaje", "pasajes"), `${plural(s.approved, "público aprobado", "públicos aprobados")}`];
  if (s.pending > 0) parts.push(`${plural(s.pending, "pendiente de aprobar", "pendientes de aprobar")}`);
  if (s.deep > 0) parts.push(`${s.deep.toLocaleString("es-CO")} de la capa profunda`);
  if (s.session > 0) parts.push(`${s.session.toLocaleString("es-CO")} con sesión`);
  return parts.join(" · ");
}

/** Lo que cambia al mover el interruptor, dicho antes de confirmar. */
export function confirmApprovalText(s: SourceApproval, on: boolean): string {
  if (on) {
    return s.staffOnly
      ? `«${s.name}» pide sesión de la intranet: aprobarla no la abre al público, pero deja sus pasajes listos.`
      : `¿Aprobar «${s.name}»? El público (el chat de udes.edu.co, visitantes y cuentas de Pilo) podrá leer ${plural(s.public, "pasaje público", "pasajes públicos")}. Lo marcado «con sesión» u oculto sigue sin salir.`;
  }
  return `¿Retirar «${s.name}» del público? Deja de leerla cualquiera que no sea personal con sesión; el personal sigue viéndola. Las respuestas guardadas que la citan dejan de servirle al público.`;
}

/* --- La base --------------------------------------------------------------------------- */

export const approvalKeys = { all: ["pilo-ia", "aprobacion"] as const };

/** La aprobación por fuente. Sin la migración 0173: null. */
export async function fetchApproval(): Promise<SourceApproval[] | null> {
  const { data, error } = await supabase.rpc("pilo_sources_overview" as never);
  if (error) {
    if (missing0121(error)) return null;
    throw new Error(error.message);
  }
  return parseOverview(data);
}

export function useApproval(enabled = true) {
  return useQuery({ queryKey: approvalKeys.all, enabled, retry: false, queryFn: fetchApproval });
}

/** Aprueba o retira una fuente para el público. Devuelve cuántos pasajes cambió. */
export function useApprove() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, on }: { source: string; on: boolean }): Promise<number> => {
      const { data, error } = await supabase.rpc("pilo_source_approve" as never, { p_source: source, p_ok: on } as never);
      if (error) throw new Error(missing0121(error) ? "Falta aplicar la migración 0173 en la base." : error.message);
      return whole((data as { passages?: unknown } | null)?.passages);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}
