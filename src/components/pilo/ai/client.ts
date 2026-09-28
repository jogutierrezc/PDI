/* =============================================================================
   Mr. Pilo con IA · los pedidos a la función del servidor `pilo-ia`.

   askPilo: resumir, sintetizar o explicar unas secciones.
   sayWithPilo: leer un texto con la voz avanzada del proveedor; si no se
   puede (apagada, sin cupo, sin red), con la voz del navegador, y lo dice.
   ========================================================================== */

import { supabase, readFunctionError } from "../../../lib/supabase";
import { speak, stopSpeaking } from "../voice";
import type { AnalysisBrief, AnalysisPart, Answer, Mesh, NeedAnswer, NeedInput, ReportKind, Section } from "./logic";
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

/* --- Pregúntele a Pilo ------------------------------------------------------------ */

export type AskKind = "regla" | "memoria" | "extracto" | "ia" | "nada" | "curada" | "capciosa" | "malla";

export interface AskSource {
  n: number;
  ref: string;
  source: string;
  title: string;
  section: string;
  path: string;
  cut: string;
  office: string;
  excerpt: string;
}

export interface AskStep {
  step: string;
  status: "ok" | "skip" | "ai";
  detail: string;
  ms: number;
}

export interface AskResult {
  kind: AskKind;
  text: string;
  sources: AskSource[];
  trail: AskStep[];
  answerId?: number | null;
  /** La emoción de Pilo que pide el catálogo (atrevido, emocionado, loco, pensar). */
  mood?: string;
  /** El tramo de la malla de la memoria que se dibuja con la respuesta (0097). */
  graph?: Mesh & { focus: string };
  verified?: boolean;
  unknown?: string[];
}

export async function askQuestion(question: string, history: { q: string; a: string }[] = []): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke<AskResult>("pilo-ia", {
    body: { action: "preguntar", portal: "pregunta", question, history },
  });
  if (error) throw await failure(error);
  return data as AskResult;
}

/** «Me sirvió» / «No me sirvió». Si falla, no pasa nada: es una opinión, no un dato. */
export async function rateAnswer(answerId: number, vote: "up" | "down") {
  await supabase.functions.invoke("pilo-ia", { body: { action: "calificar", portal: "pregunta", answerId, vote } }).catch(() => undefined);
}

/* --- Mr. Pilo Bot: entender la necesidad de un programa ------------------------------ */

export async function interpretNeed(need: NeedInput): Promise<NeedAnswer & { cached?: boolean }> {
  const { data, error } = await supabase.functions.invoke<NeedAnswer & { cached?: boolean }>("pilo-ia", {
    body: { action: "entender", portal: "impacto", need },
  });
  if (error) throw await failure(error);
  return data as NeedAnswer & { cached?: boolean };
}

/* --- Análisis de los datos (boletines de UDES en Cifras) ------------------------------- */

export interface AnalysisResult extends AnalysisPart {
  /** Números del texto que no están en las cifras: quedan para revisar. */
  unknown: string[];
  verified: boolean;
  model: string;
  /** La IA llegó al tope de palabras: el final puede quedar corto. */
  truncated?: boolean;
  cached?: boolean;
}

/**
 * Escribe un capítulo (o el cierre) con las cifras ya calculadas. Por defecto,
 * para los boletines de UDES en Cifras; los informes de Impacto mandan
 * `portal: "impacto"`, el nombre del documento y la unidad (`scope`).
 */
export async function analyzePart(
  input: {
    brief: AnalysisBrief;
    part: "capitulo" | "cierre";
    title: string;
    facts: string;
    pdi: boolean;
    /** Sin lo guardado: para «Volver a escribir». */
    fresh?: boolean;
    doc?: string;
    scope?: { kind: ReportKind; ref: string; campus: string | null };
  },
  portal: "cifras" | "impacto" = "cifras",
): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke<AnalysisResult>("pilo-ia", {
    body: { action: "analizar", portal, analysis: input },
  });
  if (error) throw await failure(error);
  return data as AnalysisResult;
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
