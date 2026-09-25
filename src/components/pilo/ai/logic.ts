/* =============================================================================
   Mr. Pilo con IA · las reglas, sin red ni base.

   Lo usan el portal y Vitest, y va copiado dentro de la función del servidor
   (supabase/functions/pilo-ia/index.ts: el editor de Supabase solo acepta un
   archivo; la prueba logic-sync vigila que sean iguales). Aquí se decide:
   - si quien pregunta puede usar esa función en ese portal (canUse);
   - qué se le pide al modelo y con qué límites (buildMessages);
   - cómo se lee la respuesta aunque no venga como JSON limpio (parseAnswer);
   - si cada número que dice el resumen aparece en los datos (verifyNumbers).
   ========================================================================== */

export type Action = "resumir" | "sintetizar" | "explicar" | "voz" | "probar";
export type Fn = "leer" | "resumir" | "sintetizar" | "explicar";
export type Audience = "admin" | "sesion" | "publico";
export type Portal = "cifras" | "pdi" | "observatorio" | "impacto";
export type Role = "consulta" | "responsable" | "planeacion" | "admin";

export interface PortalRule {
  on: boolean;
  aud: Audience;
  fns: Fn[];
}

export interface Rules {
  enabled: boolean;
  functions: Partial<Record<Fn, boolean>>;
  portals: Partial<Record<Portal, PortalRule>>;
}

export interface Section {
  title: string;
  kind: "tabla" | "grafica" | "texto";
  text: string;
}

export const PORTALS: Portal[] = ["cifras", "pdi", "observatorio", "impacto"];
export const FN_OF: Record<Exclude<Action, "probar">, Fn> = { resumir: "resumir", sintetizar: "sintetizar", explicar: "explicar", voz: "leer" };

/** ¿Puede esta persona (null = sin sesión) usar la acción en el portal? */
export function canUse(rules: Rules, portal: string, action: Action, role: Role | null): { ok: true } | { ok: false; reason: string } {
  if (action === "probar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la conexión." };
  // La muestra de voz de la configuración: solo la administración, en cualquier estado.
  if (portal === "prueba") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la voz." };
  if (!rules.enabled) return { ok: false, reason: "Mr. Pilo con IA está apagado." };
  const fn = FN_OF[action];
  if (!fn) return { ok: false, reason: "Acción desconocida." };
  if (rules.functions[fn] === false) return { ok: false, reason: "Esa función de Mr. Pilo está apagada." };
  const rule = (PORTALS as string[]).includes(portal) ? rules.portals[portal as Portal] : undefined;
  if (!rule?.on) return { ok: false, reason: "Mr. Pilo con IA no está activo en este portal." };
  if (!rule.fns.includes(fn)) return { ok: false, reason: "Esa función no está activa en este portal." };
  if (rule.aud === "admin" && role !== "admin") return { ok: false, reason: "Por ahora Mr. Pilo con IA es solo para la administración." };
  if (rule.aud === "sesion" && !role) return { ok: false, reason: "Inicie sesión para usar a Mr. Pilo con IA." };
  return { ok: true };
}

/** Recorta las secciones a un máximo de filas en total y de caracteres por sección. */
export function clipSections(sections: Section[], maxRows: number, maxChars = 6000): Section[] {
  let rows = 0;
  const out: Section[] = [];
  for (const s of sections.slice(0, 20)) {
    const lines = s.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const room = Math.max(0, maxRows - rows);
    if (!room) break;
    const kept = lines.slice(0, room);
    rows += kept.length;
    out.push({ title: s.title.slice(0, 160), kind: s.kind, text: kept.join("\n").slice(0, maxChars) });
  }
  return out;
}

const PERSONA = [
  "Eres Mr. Pilo, el guía de la Oficina de Planeación Institucional de la Universidad de Santander (UDES).",
  "Hablas en español de Colombia, en masculino, con frases cortas, claras y cercanas, sin tecnicismos.",
  "Solo usas las cifras y los datos que vienen en el contenido. No inventes números, causas ni comparaciones que no estén.",
  "Si algo no se puede afirmar con esos datos, dilo. Un dato vacío no es un cero.",
  "No menciones ni infieras datos de personas.",
  "Responde solo con el JSON que se pide, sin texto antes ni después.",
].join(" ");

const TASK: Record<"resumir" | "sintetizar" | "explicar", string> = {
  resumir:
    'Resume lo esencial en 3 a 5 puntos: lo más alto, lo más bajo y cómo cambió. Cada punto dice de qué sección sale. Formato: {"puntos":[{"texto":"...","fuente":"título de la sección"}]}',
  sintetizar:
    'Cruza las secciones y saca lo que dicen juntas: una idea principal, 2 a 4 hallazgos y 1 o 2 preguntas útiles para decidir. Formato: {"principal":"...","hallazgos":["..."],"preguntas":["..."]}',
  explicar:
    'Explica en 2 a 4 frases cómo se lee la sección y qué muestra, para alguien que la ve por primera vez. Formato: {"explicacion":"..."}',
};

export function buildMessages(action: "resumir" | "sintetizar" | "explicar", page: string, sections: Section[]) {
  const body = sections.map((s, i) => `### ${i + 1}. ${s.title} (${s.kind})\n${s.text}`).join("\n\n");
  return [
    { role: "system", content: PERSONA },
    { role: "user", content: `${TASK[action]}\n\nPágina: ${page}\n\nContenido:\n${body}` },
  ];
}

export interface Answer {
  puntos?: { texto: string; fuente?: string }[];
  principal?: string;
  hallazgos?: string[];
  preguntas?: string[];
  explicacion?: string;
}

/** Lee la respuesta del modelo: JSON (aunque venga envuelto en ```), o texto suelto. */
export function parseAnswer(action: "resumir" | "sintetizar" | "explicar", raw: string): Answer {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as Answer;
      if (action === "resumir" && Array.isArray(data.puntos)) {
        return { puntos: data.puntos.filter((p) => p && typeof p.texto === "string").slice(0, 6) };
      }
      if (action === "sintetizar" && typeof data.principal === "string") {
        return {
          principal: data.principal,
          hallazgos: (data.hallazgos ?? []).filter((h) => typeof h === "string").slice(0, 5),
          preguntas: (data.preguntas ?? []).filter((q) => typeof q === "string").slice(0, 3),
        };
      }
      if (action === "explicar" && typeof data.explicacion === "string") return { explicacion: data.explicacion };
    } catch {
      /* no era JSON: se usa como texto */
    }
  }
  const plain = text.replace(/```[a-z]*|```/g, "").trim();
  if (action === "resumir") return { puntos: plain.split(/\n+/).filter(Boolean).slice(0, 5).map((texto) => ({ texto: texto.replace(/^[-*•\d.)\s]+/, "") })) };
  if (action === "sintetizar") return { principal: plain, hallazgos: [], preguntas: [] };
  return { explicacion: plain };
}

/** El texto de una respuesta, para leerlo en voz alta o para revisar sus números. */
export function answerText(a: Answer): string {
  return [a.principal, a.explicacion, ...(a.puntos ?? []).map((p) => p.texto), ...(a.hallazgos ?? []), ...(a.preguntas ?? [])]
    .filter(Boolean)
    .join(" ");
}

/** Los números de un texto, normalizados: "1.234,5" y "1234.5" son el mismo. */
export function numbersIn(text: string): string[] {
  const found = text.match(/\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
  return found.map((n) => {
    let v = n.replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(",", ".");
    return String(Number(v));
  });
}

/**
 * ¿Cada número del resumen está en los datos? Los años y los números muy
 * pequeños (1 a 10, que suelen ser conteos de la propia frase) no cuentan.
 */
export function verifyNumbers(answer: string, source: string): { verified: boolean; unknown: string[] } {
  const known = new Set(numbersIn(source));
  const unknown = [...new Set(numbersIn(answer))].filter((n) => {
    const v = Number(n);
    if (known.has(n)) return false;
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return false;
    if (Number.isInteger(v) && v >= 0 && v <= 10) return false;
    return true;
  });
  return { verified: unknown.length === 0, unknown };
}

/* --- La dirección del proveedor ---------------------------------------------------- */

/**
 * Los proveedores conocidos traen todo puesto: quien configura solo elige y
 * pega la clave. Sus direcciones no se toman de la configuración (así un dato
 * mal escrito no rompe nada); el modelo sí se puede cambiar.
 */
export const TEXT_PRESETS: Record<string, { url: string; model: string }> = {
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  // Free.ai: https://api.free.ai, POST /v1/chat/ (respuesta como la de OpenAI).
  freeai: { url: "https://api.free.ai/v1/chat/", model: "qwen7b" },
};

/** Voz de Free.ai: POST /v1/tts/ {text, model, voice} → {audio_url}. em_alex es masculina en español. */
export const SPEECH_PRESETS: Record<string, { url: string; model: string; voice: string; format: "freeai" | "openai" }> = {
  freeai: { url: "https://api.free.ai/v1/tts/", model: "kokoro", voice: "em_alex", format: "freeai" },
};

/** Un nombre de modelo, no una ruta ni una dirección pegada por error. */
const looksLikeModel = (model: string) => /^[\w.:-][\w.:/-]*$/.test(model) && !/^https?:/.test(model);

/** La dirección y el modelo de texto que se usan de verdad. */
export function textTarget(provider: string, base: string, path: string, model: string): { url: string; model: string } {
  const preset = TEXT_PRESETS[provider];
  if (preset) return { url: preset.url, model: looksLikeModel(model) ? model : preset.model };
  return { url: endpoint(provider, base, path || "/chat/completions"), model };
}

/** La dirección, el modelo, la voz y el formato de la voz avanzada. */
export function speechTarget(provider: string, base: string, path: string, model: string, voice: string) {
  const preset = SPEECH_PRESETS[provider];
  if (preset) {
    return { url: preset.url, model: looksLikeModel(model) ? model : preset.model, voice: looksLikeModel(voice) ? voice : preset.voice, format: preset.format };
  }
  return { url: endpoint(provider, base, path || "/audio/speech"), model, voice, format: "openai" as const };
}

/**
 * Une la dirección del servicio y la ruta sin duplicar ni perder la versión:
 * "https://api.mistral.ai" + "/chat/completions" → ".../v1/chat/completions";
 * "…/v1" + "/v1/chat/completions" → ".../v1/chat/completions".
 */
export function endpoint(provider: string, base: string, path: string): string {
  let b = base.trim().replace(/\/+$/, "");
  let p = "/" + path.trim().replace(/^\/+/, "");
  if (/\/v1$/.test(b) && p.startsWith("/v1/")) p = p.slice(3);
  if (provider === "mistral" && !/\/v1$/.test(b) && !p.startsWith("/v1/")) b = `${b}/v1`;
  return `${b}${p}`;
}
