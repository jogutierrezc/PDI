/* =============================================================================
   Mr. Pilo en Alexa · de la respuesta escrita a lo que se dice.

   Pilo responde en Markdown, con citas «[1]» y a veces con enlaces o código.
   Nada de eso se puede leer en voz alta: aquí se limpia, se recorta en una
   frase completa y se deja listo para SSML. Funciones puras: se prueban en
   tests/alexa.
   ========================================================================== */

/** Lo más largo que Pilo dice de una vez: más que esto, por un parlante, cansa. */
export const SPEECH_MAX = 900;

/** El texto como se dice: sin Markdown, sin citas, sin enlaces ni código. */
export function toPlain(text) {
  return String(text ?? "")
    // Los bloques de código no se leen.
    .replace(/```[\s\S]*?(```|$)/g, " ")
    // [texto](enlace) → texto; las citas [1] y los enlaces sueltos se van.
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    // Títulos, viñetas, numeración y filas de tabla, al comienzo de la línea.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, "")
    .replace(/\s*\|\s*/g, ", ")
    // Negritas, cursivas y código en línea.
    .replace(/(\*\*|__|\*|_|`)/g, "")
    // Cada línea que no cierra con puntuación se cierra con punto: así una lista se oye como frases.
    .split(/\n+/)
    .map((line) => line.replace(/^[,\s]+|[,\s]+$/g, ""))
    .filter(Boolean)
    .map((line) => (/[.!?:;…]$/.test(line) ? line : `${line}.`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las frases completas de un texto que aún se está escribiendo: hasta el último cierre de frase. */
export function completeSentences(text) {
  const plain = toPlain(text);
  // toPlain cierra la última línea con un punto aunque el modelo no la haya terminado: ese no cuenta.
  const raw = String(text ?? "").trimEnd();
  const open = raw && !/[.!?…]["»)]?$/.test(raw.replace(/\s*\[\d+\]$/g, ""));
  const body = open ? plain.replace(/\.$/, "") : plain;
  const end = Math.max(body.lastIndexOf(". "), body.lastIndexOf("? "), body.lastIndexOf("! "));
  if (!open) return body;
  return end < 0 ? "" : body.slice(0, end + 1);
}

/** Recorta en una frase completa. `cut` dice si quedó algo por fuera. */
export function clip(text, max = SPEECH_MAX) {
  if (text.length <= max) return { text, cut: false };
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  return { text: end > max * 0.4 ? head.slice(0, end + 1) : `${head.slice(0, head.lastIndexOf(" "))}…`, cut: true };
}

/** Los caracteres que SSML no admite sueltos. */
export const escapeSsml = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Lo que Alexa dice de una respuesta de Pilo: limpio, recortado y listo para SSML. */
export function toSpeech(text, max = SPEECH_MAX) {
  const { text: said, cut } = clip(toPlain(text), max);
  return { speech: escapeSsml(said), cut };
}

/** Lo más que dura una pausa en SSML son 10 segundos. */
const PAUSE_S = 9;
const STILL = ["Sigo buscando.", "Ya casi.", "Un momento más.", "Estoy terminando."];

/**
 * Lo que Alexa dice mientras Pilo redacta: la frase de entrada y, hasta
 * completar `seconds`, pausas con un aviso corto entre una y otra, para que
 * la espera no parezca que se cortó. Ya es SSML: no se escapa.
 */
export function waitSpeech(opening, seconds) {
  const parts = [opening];
  let left = Math.max(0, Math.round(seconds));
  for (let i = 0; left > 0; i++) {
    const pause = Math.min(PAUSE_S, left);
    parts.push(`<break time="${pause}s"/>`);
    // Cada aviso dura cerca de un segundo.
    left -= pause + 1;
    if (left > 0) parts.push(STILL[i % STILL.length]);
  }
  return parts.join(" ");
}

/** La tarjeta de la app de Alexa: la respuesta entera y de dónde salió. */
export function cardText(text, sources = []) {
  const titles = [...new Set(sources.map((s) => (typeof s?.title === "string" ? s.title.trim() : "")).filter(Boolean))].slice(0, 3);
  const body = toPlain(text).slice(0, 7000);
  return titles.length ? `${body}\n\nFuentes: ${titles.join("; ")}.` : body;
}
