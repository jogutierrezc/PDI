/* =============================================================================
   Mr. Pilo con IA · lectura y escritura de la configuración (0089).

   La fila de pilo_ai_settings la lee y la cambia solo la administración (RLS).
   Las claves no se leen nunca: se guardan con pilo_ai_set_key y de ellas solo
   vuelven los cuatro últimos caracteres.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type { Fn, Portal, PortalRule } from "../../../components/pilo/ai/config";
import type { MemorySource } from "./memory";

export type Provider = "mistral" | "freeai" | "nvidia" | "otro";
export type SpeechProvider = "freeai" | "otro" | "navegador";

export interface PiloSettings {
  enabled: boolean;
  provider: Provider;
  base_url: string;
  chat_path: string;
  text_model: string;
  speech_provider: SpeechProvider;
  speech_base_url: string;
  speech_path: string;
  speech_model: string;
  speech_voice: string;
  voice_engine: "proveedor" | "navegador";
  voice_rate: number;
  voice_pitch: number;
  functions: Record<Fn, boolean>;
  portals: Record<Portal, PortalRule>;
  daily_limit: number;
  max_rows: number;
  cache_days: number;
  updated_at?: string;
  /** Pregúntele a Pilo (0094): qué fuentes usa su memoria y si muestra la bienvenida. */
  memory_sources: Record<MemorySource, boolean>;
  pregunta_welcome: boolean;
  memory_indexed_at?: string | null;
  /** La base aún no tiene la migración 0090 (Mistral y voz aparte). */
  needs0090?: boolean;
  /** La base aún no tiene la migración 0094 (Pregúntele a Pilo). */
  needs0094?: boolean;
}

const DEFAULT_PORTALS: Record<Portal, PortalRule> = {
  cifras: { on: true, aud: "admin", fns: ["leer", "resumir", "sintetizar", "explicar"] },
  pdi: { on: false, aud: "admin", fns: ["leer", "resumir"] },
  observatorio: { on: false, aud: "admin", fns: ["leer", "resumir"] },
  impacto: { on: false, aud: "admin", fns: ["leer", "sintetizar", "explicar"] },
  pregunta: { on: false, aud: "publico", fns: ["preguntar"] },
};

const ALL_SOURCES: Record<MemorySource, boolean> = { cifras: true, boletines: true, pdi: true, observatorio: true, impacto: true };

/** Un nombre de modelo, no una ruta pegada por error («/tts-1»). */
const validModel = (m: string) => (/^[\w.:-][\w.:/-]*$/.test(m) && !/^https?:/.test(m) ? m : "");

/**
 * La fila tal como venga, con valores por defecto para lo que falte: así una
 * base con una versión anterior de la migración no rompe la pantalla.
 */
export function normalizeSettings(raw: Record<string, unknown>): PiloSettings {
  const str = (k: string, d: string) => (typeof raw[k] === "string" ? (raw[k] as string) : d);
  const num = (k: string, d: number) => (raw[k] === null || raw[k] === undefined || raw[k] === "" ? d : Number(raw[k]));
  const provider = (["mistral", "freeai", "nvidia", "otro"] as const).find((p) => p === raw.provider) ?? "mistral";
  const portals = { ...DEFAULT_PORTALS, ...((raw.portals as Record<Portal, PortalRule>) ?? {}) };
  return {
    enabled: Boolean(raw.enabled),
    provider,
    // Vacíos con Mistral: se muestran (y se usan en el servidor) los de Mistral,
    // no un texto de ejemplo que parece escrito y no lo está.
    base_url: str("base_url", "") || PROVIDERS[provider].base,
    chat_path: str("chat_path", "") || "/chat/completions",
    text_model: validModel(str("text_model", "")) || PROVIDERS[provider].model,
    speech_provider: (["freeai", "otro", "navegador"] as const).find((p) => p === raw.speech_provider) ?? "navegador",
    speech_base_url: str("speech_base_url", ""),
    speech_path: str("speech_path", "/audio/speech"),
    speech_model: str("speech_model", ""),
    speech_voice: str("speech_voice", ""),
    voice_engine: raw.voice_engine === "proveedor" ? "proveedor" : "navegador",
    voice_rate: num("voice_rate", 1),
    voice_pitch: num("voice_pitch", 1),
    functions: { leer: true, resumir: true, sintetizar: true, explicar: true, preguntar: true, ...((raw.functions as Partial<Record<Fn, boolean>>) ?? {}) } as Record<Fn, boolean>,
    portals,
    daily_limit: num("daily_limit", 200),
    max_rows: num("max_rows", 500),
    cache_days: num("cache_days", 30),
    updated_at: str("updated_at", ""),
    memory_sources: { ...ALL_SOURCES, ...((raw.memory_sources as Partial<Record<MemorySource, boolean>>) ?? {}) },
    pregunta_welcome: raw.pregunta_welcome === undefined ? true : Boolean(raw.pregunta_welcome),
    memory_indexed_at: (raw.memory_indexed_at as string | null | undefined) ?? null,
    needs0090: !("provider" in raw),
    needs0094: !("memory_sources" in raw),
  };
}

export type KeySlot = "mistral" | "freeai" | "nvidia" | "otro" | "voz";

export interface KeyStatus {
  /** Una por proveedor (0091). Sin 0091, no viene. */
  keys?: Partial<Record<KeySlot, { has: boolean; last4: string }>>;
  has_key: boolean;
  last4: string;
  has_speech_key: boolean;
  speech_last4: string;
  updated_at: string | null;
  today: number;
}

export interface LogRow {
  id: number;
  created_at: string;
  portal: string;
  action: string;
  subject: string;
  status: string;
  cached: boolean;
  ms: number | null;
}

/** Valores de partida de cada proveedor de texto. La dirección y el modelo se pueden cambiar. */
export const PROVIDERS: Record<Provider, { label: string; base: string; model: string; hint: string }> = {
  mistral: {
    label: "Mistral",
    base: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    hint: "Pegue su clave de console.mistral.ai. Todo lo demás ya está puesto.",
  },
  freeai: {
    label: "Free.ai",
    base: "https://api.free.ai",
    model: "qwen7b",
    hint: "Pegue su clave de free.ai (empieza por «sk-free-»). Todo lo demás ya está puesto.",
  },
  nvidia: {
    label: "NVIDIA",
    base: "https://integrate.api.nvidia.com/v1",
    model: "google/gemma-4-31b-it",
    hint: "Pegue su clave de build.nvidia.com (empieza por «nvapi-»). Todo lo demás ya está puesto; el modelo se cambia en opciones avanzadas.",
  },
  otro: { label: "Otro compatible", base: "", model: "", hint: "Cualquier servicio con el formato de OpenAI: escriba su dirección, el modelo y la ruta." },
};

export const pilokeys = {
  settings: ["pilo-ia", "ajustes"] as const,
  keys: ["pilo-ia", "claves"] as const,
  log: ["pilo-ia", "bitacora"] as const,
};

function fail(error: DatabaseError | null) {
  if (error) throw describeDatabaseError(error);
}

export function usePiloSettings() {
  return useQuery({
    queryKey: pilokeys.settings,
    queryFn: async (): Promise<PiloSettings | null> => {
      const { data, error } = await supabase.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle();
      if (error && ["PGRST205", "42P01"].includes(error.code ?? "")) return null;
      fail(error);
      if (!data) return null;
      return normalizeSettings(data as Record<string, unknown>);
    },
  });
}

export function useKeyStatus() {
  return useQuery({
    queryKey: pilokeys.keys,
    queryFn: async (): Promise<KeyStatus | null> => {
      const { data, error } = await supabase.rpc("pilo_ai_key_status");
      if (error) return null;
      return data as KeyStatus;
    },
  });
}

export function usePiloLog() {
  return useQuery({
    queryKey: pilokeys.log,
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase.from("pilo_ai_log").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) return [];
      return (data ?? []) as LogRow[];
    },
  });
}

export function useSavePiloSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: PiloSettings) => {
      const { updated_at: _ignored, needs0090, needs0094, memory_indexed_at: _indexed, ...all } = settings;
      // Sin 0090 no existen las columnas nuevas: no se mandan.
      const rest: Record<string, unknown> = { ...all };
      if (needs0090) for (const k of ["provider", "speech_provider", "speech_base_url"]) delete rest[k];
      // Sin 0094, tampoco las de Pregúntele a Pilo.
      if (needs0094) for (const k of ["memory_sources", "pregunta_welcome"]) delete rest[k];
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pilo_ai_settings")
        .update({ ...rest, updated_by: user.user?.id ?? null, updated_at: new Date().toISOString() })
        .eq("id", 1);
      fail(error);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["pilo-ia"] });
    },
  });
}

export function useSetKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, which }: { key: string; which: KeySlot | "texto" }) => {
      const { data, error } = await supabase.rpc("pilo_ai_set_key", { p_key: key, p_which: which });
      fail(error);
      return data as string;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["pilo-ia"] });
    },
  });
}
