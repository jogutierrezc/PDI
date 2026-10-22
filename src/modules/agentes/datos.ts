/* =============================================================================
   Portal de agentes · los datos.

   Todo se lee con la sesión del agente: la RLS (0181) decide qué ve cada quien.
   Lo que cambia en el chat se escribe SOLO por las funciones de la base (0182).
   El tiempo real es Supabase Realtime: postgres_changes avisa de lo que cambia
   en conversaciones y mensajes; aquí solo se invalidan las consultas, la base
   sigue siendo la fuente de verdad.
   ========================================================================== */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { ConversationStatus } from "../soporte/estados";

export type Availability = "en_linea" | "ocupado" | "fuera";
export type SpaceKey = "planeacion" | "ensenanza";

export interface Agent {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: "agent" | "director";
  photo_url: string;
  availability: Availability;
  capacity: number | null;
  active: boolean;
  last_seen_at: string | null;
  invited_at: string | null;
}

export interface Team {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
}

export interface Conv {
  id: string;
  contact_id: string;
  space: SpaceKey;
  status: ConversationStatus;
  priority: "baja" | "media" | "alta" | "urgente";
  team_id: string | null;
  assignee_id: string | null;
  offered_to: string | null;
  offer_expires_at: string | null;
  labels: string[];
  pilo_summary: string;
  unanswered: string;
  channel_key: string;
  after_hours: boolean;
  csat: number | null;
  waiting_since: string | null;
  created_at: string;
  queued_at: string | null;
  resolved_at: string | null;
  last_message_at: string;
  contact: Contact;
}

export interface Attachment {
  id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface Msg {
  id: number;
  conversation_id: string;
  kind: "incoming" | "outgoing" | "activity" | "private_note";
  author_kind: "student" | "pilo" | "agent" | "system";
  author_agent_id: string | null;
  author_name: string;
  body: string;
  staff_only: boolean;
  status: "sent" | "delivered" | "read";
  created_at: string;
  files: Attachment[];
}

export interface Portal {
  space: SpaceKey;
  name: string;
  agent_on: boolean;
  team_id: string | null;
  schedule: { tz?: string; days?: Record<string, [string, string][]> };
  messages: Record<string, string>;
}

export interface Policy {
  auto_assign: boolean;
  default_capacity: number;
  queue_order: "oldest" | "longest_wait";
  accept_seconds: number;
  long_wait_minutes: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export const PORTAL_NAME: Record<SpaceKey, string> = { planeacion: "Pilo", ensenanza: "Pilo Académico" };

/** El mensaje de un error de la base, o de la red, en palabras de la persona. */
export function errorText(error: unknown, fallback = "No se pudo completar. Intente de nuevo."): string {
  const m = (error as { message?: string } | null)?.message ?? "";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sin conexión. Seguimos intentando.";
  // Los mensajes de las funciones de la base ya están en español.
  return /[áéíóúñ¿]|\b(No|Solo|Esta|Ese|Ya|La|El)\b/.test(m) && m.length < 200 ? m : fallback;
}

const first = <T,>(data: unknown): T | null => ((Array.isArray(data) ? data[0] : data) as T | null) ?? null;

/* --- Quién soy ------------------------------------------------------------------------------------- */

/** Enlaza la sesión con la fila del agente (por el correo) y devuelve sus datos; null si no es agente. */
export async function claimAgent(): Promise<Agent | null> {
  const { data, error } = await supabase.rpc("support_claim");
  if (error) return null;
  const row = first<Agent>(data);
  return row?.id ? row : null;
}

/* --- Consultas ------------------------------------------------------------------------------------- */

const CONV_COLUMNS =
  "id, contact_id, space, status, priority, team_id, assignee_id, offered_to, offer_expires_at, labels, pilo_summary, unanswered, channel_key, after_hours, csat, waiting_since, created_at, queued_at, resolved_at, last_message_at, contact:support_contacts(id, name, email, phone, city)";

export const keys = {
  convs: ["soporte", "conversaciones"] as const,
  msgs: (id: string) => ["soporte", "mensajes", id] as const,
  unread: ["soporte", "sin-leer"] as const,
  agents: ["soporte", "agentes"] as const,
  teams: ["soporte", "equipos"] as const,
  members: ["soporte", "miembros"] as const,
  portals: ["soporte", "portales"] as const,
  policy: ["soporte", "reglas"] as const,
  labels: ["soporte", "etiquetas"] as const,
  quick: ["soporte", "rapidas"] as const,
  history: (contactId: string) => ["soporte", "historial", contactId] as const,
};

async function must<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data as T;
}

export const useConversations = () =>
  useQuery({
    queryKey: keys.convs,
    staleTime: 15_000,
    queryFn: async () => (await must(supabase.from("support_conversations").select(CONV_COLUMNS).order("last_message_at", { ascending: false }).limit(400))) as unknown as Conv[],
  });

export const useMessages = (id: string | null) =>
  useQuery({
    queryKey: keys.msgs(id ?? "ninguna"),
    enabled: Boolean(id),
    staleTime: 10_000,
    queryFn: async () =>
      (await must(
        supabase.from("support_messages").select("id, conversation_id, kind, author_kind, author_agent_id, author_name, body, staff_only, status, created_at, files:support_attachments(id, path, name, mime, size)").eq("conversation_id", id as string).order("id"),
      )) as unknown as Msg[],
  });

/** Cuántos mensajes de la persona no se han leído, por conversación. */
export const useUnread = () =>
  useQuery({
    queryKey: keys.unread,
    staleTime: 15_000,
    queryFn: async () => {
      const rows = (await must(supabase.from("support_messages").select("conversation_id").eq("kind", "incoming").neq("status", "read").limit(2000))) as { conversation_id: string }[];
      const by: Record<string, number> = {};
      for (const r of rows) by[r.conversation_id] = (by[r.conversation_id] ?? 0) + 1;
      return by;
    },
  });

export const useAgents = () =>
  useQuery({
    queryKey: keys.agents,
    staleTime: 20_000,
    queryFn: async () => {
      const filas = (await must(supabase.from("support_agents").select("id, user_id, name, email, role, photo_url, availability, capacity, active, last_seen_at, invited_at").order("name"))) as Agent[];
      // El agente colgado: quien no late en stale_minutes se muestra «Fuera», aunque su fila diga «En línea».
      // La base no se toca: si vuelve, el latido lo devuelve solo (0184).
      const pol = (await supabase.from("support_assignment_policy").select("stale_minutes").eq("id", 1).maybeSingle()).data as { stale_minutes?: number } | null;
      const vence = Date.now() - Math.max(1, Number(pol?.stale_minutes) || 3) * 60_000;
      return filas.map((a) => (a.availability === "en_linea" && a.last_seen_at && Date.parse(a.last_seen_at) < vence ? { ...a, availability: "fuera" as Availability } : a));
    },
  });

export const useTeams = () => useQuery({ queryKey: keys.teams, queryFn: async () => (await must(supabase.from("support_teams").select("id, name").order("name"))) as Team[] });

export const useMembers = () =>
  useQuery({ queryKey: keys.members, queryFn: async () => (await must(supabase.from("support_team_members").select("team_id, agent_id"))) as { team_id: string; agent_id: string }[] });

export const usePortals = () =>
  useQuery({ queryKey: keys.portals, queryFn: async () => (await must(supabase.from("support_portals").select("space, name, agent_on, team_id, schedule, messages").order("space"))) as Portal[] });

export const usePolicy = () =>
  useQuery({
    queryKey: keys.policy,
    queryFn: async () => (await must(supabase.from("support_assignment_policy").select("auto_assign, default_capacity, queue_order, accept_seconds, long_wait_minutes").eq("id", 1).single())) as Policy,
  });

export const useLabels = () => useQuery({ queryKey: keys.labels, queryFn: async () => (await must(supabase.from("support_labels").select("id, name, color").order("name"))) as Label[] });

export const useQuickReplies = () =>
  useQuery({ queryKey: keys.quick, queryFn: async () => (await must(supabase.from("support_quick_replies").select("id, shortcut, title, body").order("shortcut"))) as QuickReply[] });

/** Los festivos cierran la atención de todos los portales (0184). */
export interface Holiday {
  dia: string;
  name: string;
}

export const useHolidays = (year: number) =>
  useQuery({
    queryKey: ["soporte", "festivos", year] as const,
    queryFn: async () =>
      (await must(
        supabase.from("support_holidays").select("dia, name").gte("dia", `${year}-01-01`).lte("dia", `${year}-12-31`).order("dia"),
      )) as Holiday[],
  });

/** Las conversaciones anteriores de la misma persona. */
export const useHistory = (contactId: string | null, exceptId: string | null) =>
  useQuery({
    queryKey: keys.history(contactId ?? "ninguno"),
    enabled: Boolean(contactId),
    queryFn: async () =>
      (await must(supabase.from("support_conversations").select("id, status, created_at, space").eq("contact_id", contactId as string).order("created_at", { ascending: false }).limit(10))) as { id: string; status: string; created_at: string; space: SpaceKey }[],
    select: (rows) => rows.filter((r) => r.id !== exceptId),
  });

/* --- Tiempo real ----------------------------------------------------------------------------------- */

/**
 * Mantiene las consultas al día con lo que llega por Realtime y late cada 20 s (el latido le dice al
 * reparto que el agente sigue ahí, y vence las ofertas). Devuelve nada: se monta una vez en el marco.
 */
export function useRealtimeSync(agentId: string | null, onStatus: (connected: boolean) => void) {
  const client = useQueryClient();
  useEffect(() => {
    if (!agentId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (what: "conv" | "msg" | "agent", conversationId?: string) => {
      clearTimeout(timer);
      // Varias filas que cambian juntas piden una sola lectura.
      timer = setTimeout(() => {
        if (what === "conv" || what === "msg") {
          void client.invalidateQueries({ queryKey: keys.convs });
          void client.invalidateQueries({ queryKey: keys.unread });
        }
        if (what === "msg" && conversationId) void client.invalidateQueries({ queryKey: keys.msgs(conversationId) });
        if (what === "agent") void client.invalidateQueries({ queryKey: keys.agents });
      }, 120);
    };
    const channel = supabase
      .channel(`soporte-cambios-${agentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => refresh("conv"))
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as { conversation_id?: string } | null;
        refresh("msg", row?.conversation_id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_agents" }, () => refresh("agent"))
      .subscribe((status) => {
        onStatus(status === "SUBSCRIBED");
        // Al volver la conexión se lee todo de nuevo: pudo pasar algo mientras tanto.
        if (status === "SUBSCRIBED") {
          void client.invalidateQueries({ queryKey: ["soporte"] });
        }
      });

    const beat = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void supabase.rpc("support_heartbeat").then(() => void 0);
    };
    beat();
    const interval = setInterval(beat, 20_000);
    const online = () => {
      onStatus(true);
      beat();
      void client.invalidateQueries({ queryKey: ["soporte"] });
    };
    const offline = () => onStatus(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      void supabase.removeChannel(channel);
    };
  }, [agentId, client, onStatus]);
}

/* --- Acciones (todas por funciones de la base) ----------------------------------------------------- */

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const actions = {
  accept: (id: string) => rpc("support_accept", { p_conv: id }),
  take: (id: string) => rpc("support_take", { p_conv: id }),
  assignBest: (id: string) => rpc<boolean>("support_assign_best", { p_conv: id }),
  decline: (id: string) => rpc("support_decline", { p_conv: id }),
  send: (id: string, body: string, isPrivate: boolean, files: { path: string; name: string }[] = []) => rpc<number>("support_send", { p_conv: id, p_body: body, p_private: isPrivate, p_files: files }),
  reassign: (id: string, to: string, reason: string) => rpc("support_reassign", { p_conv: id, p_to: to, p_reason: reason }),
  requeue: (id: string, team: string | null, reason: string) => rpc("support_requeue", { p_conv: id, p_team: team, p_reason: reason }),
  undo: (id: string) => rpc("support_undo_reassign", { p_conv: id }),
  reopen: (id: string) => rpc("support_reopen", { p_conv: id }),
  snooze: (id: string) => rpc("support_snooze", { p_conv: id, p_until: null }),
  markRead: (id: string) => rpc("support_mark_read", { p_conv: id, p_read: true }),
  update: (id: string, labels: string[] | null, priority: string | null) => rpc("support_update", { p_conv: id, p_labels: labels, p_priority: priority }),
  availability: (value: Availability) => rpc("support_set_availability", { p_value: value }),
  photo: (url: string) => rpc("support_update_profile", { p_photo_url: url }),
  report: (from: string, to: string) => rpc<Report>("support_report", { p_from: from, p_to: to }),
};

export interface Report {
  total: number;
  resolved: number;
  wait_minutes: number | null;
  handle_minutes: number | null;
  csat: number | null;
  csat_count: number;
  by_space: Record<string, number>;
  by_agent: { agent_id: string; total: number; csat: number | null }[];
}

/** Sube un archivo al bucket privado, a la carpeta de la conversación, y devuelve su ruta. */
export async function uploadAttachment(conversationId: string, file: File, name: string, mime: string): Promise<string> {
  const path = `${conversationId}/${crypto.randomUUID().slice(0, 8)}-${name}`;
  const { error } = await supabase.storage.from("support-attachments").upload(path, file, { contentType: mime, upsert: false });
  if (error) throw new Error("No se pudo subir el archivo. Revise su conexión.");
  return path;
}

/** Una URL firmada y corta para abrir un adjunto. */
export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("support-attachments").createSignedUrl(path, 120);
  if (error || !data) throw new Error("No se pudo abrir el archivo.");
  return data.signedUrl;
}
