/* =============================================================================
   Traspaso de Pilo a un agente · reglas puras (se prueban en node).

   Cuándo se ofrece el agente, qué resumen se le entrega y cuántos datos pide
   Pilo. Sin IA: todo por reglas, para que el pedido de un agente sea siempre
   el mismo, con cualquier modelo o sin él.
   ========================================================================== */

/** Normaliza para comparar: minúsculas, sin acentos, sin signos. */
export const plain = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const WANTS = [
  // «quiero hablar con un agente / una persona / un asesor»
  /\b(hablar|comunicar\w*|conectar\w*|pasar\w*|contactar\w*|comunico|escribir\w*|atender\w*|atienda)\b.*\b(agente|asesor\w*|persona|humano|funcionario|alguien|operador\w*|ejecutivo)\b/,
  /\b(agente|asesor|asesora|humano|operador|operadora)\b/,
  /\b(una|otra|alguna|real) persona\b/,
  /\bpersona (real|de verdad|de la udes)\b/,
  /\balguien (real|de verdad|de la udes|que me (atienda|ayude|escuche))\b/,
  /\bno (eres|es) (un )?(robot|bot|maquina)\b/,
  /\bquiero (hablar|que me atienda\w*)\b.*\b(con alguien|con una persona|con un humano)\b/,
];

const NEGATIVE = [/\bagente (de|del) (transito|policia|seguros?)\b/, /\bagentes? (inteligente|ia)\b/, /\bagente (a|ai)\b/];

/**
 * ¿La persona pide hablar con alguien de la UDES? Detección por reglas sobre el texto de la pregunta.
 * Una pregunta que solo menciona la palabra («agente de tránsito») no cuenta.
 */
export function wantsAgent(text: string): boolean {
  const t = plain(text);
  if (t.length < 4 || t.length > 200) return false;
  if (NEGATIVE.some((r) => r.test(t))) return false;
  return WANTS.some((r) => r.test(t));
}

interface Pair {
  q: string;
  a?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * El resumen que Pilo le deja al agente: qué preguntó la persona y qué le respondió Pilo, en orden.
 * Sin repetir lo que la persona pidió del agente, y sin pasar de 1 500 caracteres (se cortan los más viejos).
 */
export function summarizeTurns(turns: Pair[], max = 1500): string {
  const lines = turns
    .filter((t) => t.q && !wantsAgent(t.q))
    .map((t) => `• Preguntó: ${clip(oneLine(t.q), 240)}${t.a ? `\n  Pilo respondió: ${clip(oneLine(t.a), 260)}` : "\n  Pilo no alcanzó a responder."}`);
  if (!lines.length) return "La persona pidió hablar con un agente sin haber hecho otra pregunta a Pilo.";
  let out = "";
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = `${lines[i]}${out ? "\n" : ""}${out}`;
    if (next.length > max) break;
    out = next;
  }
  return out || clip(lines[lines.length - 1], max);
}

/** La pregunta que Pilo no supo responder: la última que no tuvo respuesta, o la última que se hizo. */
export function lastUnanswered(turns: Pair[]): string {
  const real = turns.filter((t) => t.q && !wantsAgent(t.q));
  const open = [...real].reverse().find((t) => !t.a?.trim());
  return clip(oneLine((open ?? real[real.length - 1])?.q ?? ""), 600);
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  city: string;
  authorized: boolean;
}

/** Qué le falta al formulario, o "" si se puede enviar. El mismo orden en que Pilo pide los datos. */
export function formProblem(f: FormData): string {
  const name = oneLine(f.name);
  if (name.length < 3 || name.split(" ").length < 2) return "Escribe tu nombre completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return "Escribe un correo válido.";
  if (f.phone.replace(/\D/g, "").length < 7) return "Escribe un teléfono de contacto.";
  if (oneLine(f.city).length < 2) return "Escribe la ciudad desde la que escribes.";
  if (!f.authorized) return "Para pasar con un agente necesito tu autorización para tratar tus datos personales.";
  return "";
}

/** El primer nombre, para que Pilo hable de tú. */
export const firstName = (name: string): string => oneLine(name).split(" ")[0] ?? "";

/** Las frases de Pilo. Las dos primeras son EXACTAS y no se cambian. */
export const FRASES = {
  esperar: "En un momento un Agente de la UDES te atenderá",
  despedida: "Hasta aquí termino yo, pero te dejo con un experto de la UDES que te puede ayudar. Recuerda que Pilo siempre está aquí cuando lo necesites.",
  oferta: "Puedo conectarte con un agente de la UDES. Antes necesito unos datos para que te atienda bien.",
  pedirDatos: "Claro. Escríbeme tus datos y te conecto con un agente de la UDES.",
  fueraDeHorario: "Ahora no hay agentes disponibles. Dejo tu solicitud en la fila con tus datos y te escribo a tu correo cuando un agente la tome.",
  ocupados: "En este momento todos nuestros agentes están ocupados. Quedas en la fila y te atienden en cuanto haya uno libre.",
  encuesta: "Antes de despedirme: ¿te sirvió la atención?",
  gracias: "¡Gracias por responder! Tu opinión nos ayuda a mejorar.",
} as const;

/** «Gracias, Camila. En un momento un Agente de la UDES te atenderá.» */
export const esperando = (name: string): string => `Gracias, ${firstName(name)}. ${FRASES.esperar}.`;
