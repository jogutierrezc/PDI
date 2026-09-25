/* =============================================================================
   Mr. Pilo con IA · los pedidos a la función del servidor `pilo-ia`.

   askPilo: resumir, sintetizar o explicar unas secciones.
   sayWithPilo: leer un texto con la voz avanzada del proveedor; si no se
   puede (apagada, sin cupo, sin red), con la voz del navegador, y lo dice.
   ========================================================================== */

import { supabase, readFunctionError } from "../../../lib/supabase";
import { speak, stopSpeaking } from "../voice";
import type { Answer, Section } from "./logic";
import type { Portal } from "./config";

export type { Answer };

export interface PiloResult {
  answer: Answer;
  verified: boolean;
  unknown: string[];
  sections: string[];
  cached: boolean;
}

export class PiloError extends Error {
  constructor(message: string, readonly code: string = "") {
    super(message);
  }
}

async function failure(error: unknown): Promise<PiloError> {
  const response = (error as { context?: Response })?.context;
  let code = "";
  try {
    code = ((await response?.clone().json()) as { code?: string })?.code ?? "";
  } catch {
    /* sin cuerpo */
  }
  const detail = await readFunctionError(error);
  return new PiloError(detail ?? "No pude hablar con Mr. Pilo ahora.", code || "red");
}

export async function askPilo(action: "resumir" | "sintetizar" | "explicar", portal: Portal, page: string, sections: Section[]): Promise<PiloResult> {
  const { data, error } = await supabase.functions.invoke<PiloResult>("pilo-ia", {
    body: { action, portal, page, sections: sections.map(({ title, kind, text }) => ({ title, kind, text })) },
  });
  if (error) throw await failure(error);
  return data as PiloResult;
}

export async function testPilo(): Promise<{ ok: boolean; ms?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; ms?: number; error?: string }>("pilo-ia", { body: { action: "probar" } });
  if (error) throw await failure(error);
  return data as { ok: boolean; ms?: number; error?: string };
}

/* --- Voz ------------------------------------------------------------------------ */

let audio: HTMLAudioElement | null = null;
let token = 0;

export function stopPilo() {
  token += 1;
  audio?.pause();
  audio = null;
  stopSpeaking();
}

/**
 * Lee el texto y se cumple al terminar. Devuelve qué voz sonó; con otra
 * lectura de por medio (stopPilo), se cumple sin sonar.
 */
export async function sayWithPilo(
  text: string,
  options: { portal: Portal | null; advanced: boolean; rate?: number; pitch?: number },
): Promise<"proveedor" | "navegador" | "cancelado"> {
  stopPilo();
  const mine = ++token;
  if (options.advanced && options.portal) {
    const { data, error } = await supabase.functions.invoke<Blob>("pilo-ia", { body: { action: "voz", portal: options.portal, text } });
    if (mine !== token) return "cancelado";
    if (!error && data instanceof Blob && data.size > 0) {
      const url = URL.createObjectURL(data);
      const player = new Audio(url);
      player.playbackRate = options.rate ?? 1;
      audio = player;
      const done = await new Promise<boolean>((resolve) => {
        player.onended = () => resolve(true);
        player.onerror = () => resolve(false);
        player.play().catch(() => resolve(false));
      });
      URL.revokeObjectURL(url);
      if (mine !== token) return "cancelado";
      if (done) return "proveedor";
    }
  }
  if (mine !== token) return "cancelado";
  await speak(text, { force: true, rate: options.rate, pitch: options.pitch });
  return mine === token ? "navegador" : "cancelado";
}
