/* =============================================================================
   Edge Function · pilo-ia
   Mr. Pilo con IA: resumir, sintetizar, explicar y leer en voz alta.

   Existe para que las claves de los proveedores (Mistral o Free.ai para el
   texto; Free.ai u otro para la voz) nunca lleguen al navegador. Cada pedido pasa por aquí: se revisa quién pregunta, si Mr. Pilo
   está activo en ese portal y para esa audiencia, y cuánto se ha usado hoy;
   luego se llama al proveedor con el formato de OpenAI (/chat/completions
   para el texto, /audio/speech para la voz), se revisa que cada número del
   resumen esté en los datos y se anota en la bitácora.

   Pedido (POST, JSON):
     { action: "resumir" | "sintetizar" | "explicar", portal, page, sections: [{title, kind, text}] }
     { action: "voz", portal, text }            → audio (application/octet-stream)
     { action: "probar" }                        → { ok, ms } (solo administración)
     { action: "preguntar", portal: "pregunta", question, history? }
                                                 → { kind, text, sources, trail, answerId? }
     { action: "calificar", portal: "pregunta", answerId, vote: "up" | "down" }

   «Preguntar» (la página Pregúntele a Pilo) gasta lo menos posible: reglas,
   respuestas ya dadas y búsqueda en la memoria (0094) van primero; la IA
   solo redacta si hace falta, y si no hay IA o cupo, se responde con los
   pasajes tal cual. Funciona aunque la IA no esté conectada.

   Despliegue (un solo archivo: también se puede pegar en el editor de Supabase,
   con «Verify JWT» apagado):
     supabase functions deploy pilo-ia
   (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
   la plataforma. La clave del proveedor se guarda desde la intranet.)
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// --- lógica: copia exacta de src/components/pilo/ai/logic.ts (la prueba logic-sync lo vigila)
// Va dentro para que la función sea un solo archivo y se pueda desplegar
// también pegándola en el editor del panel de Supabase.
export type Action = "resumir" | "sintetizar" | "explicar" | "voz" | "probar" | "preguntar";
export type Fn = "leer" | "resumir" | "sintetizar" | "explicar" | "preguntar";
export type Audience = "admin" | "sesion" | "publico";
export type Portal = "cifras" | "pdi" | "observatorio" | "impacto" | "pregunta";
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

export const PORTALS: Portal[] = ["cifras", "pdi", "observatorio", "impacto", "pregunta"];
export const FN_OF: Record<Exclude<Action, "probar">, Fn> = { resumir: "resumir", sintetizar: "sintetizar", explicar: "explicar", voz: "leer", preguntar: "preguntar" };

/** ¿Puede esta persona (null = sin sesión) usar la acción en el portal? */
export function canUse(rules: Rules, portal: string, action: Action, role: Role | null): { ok: true } | { ok: false; reason: string } {
  if (action === "probar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la conexión." };
  // La muestra de voz de la configuración: solo la administración, en cualquier estado.
  if (portal === "prueba") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la voz." };
  // «Pregúntele a Pilo» tiene su propio interruptor: responde de memoria aunque la IA esté apagada.
  if (!rules.enabled && action !== "preguntar") return { ok: false, reason: "Mr. Pilo con IA está apagado." };
  const fn = FN_OF[action];
  if (!fn) return { ok: false, reason: "Acción desconocida." };
  // En «preguntar», la función apagada solo quita la IA: la página sigue respondiendo de memoria.
  if (rules.functions[fn] === false && action !== "preguntar") return { ok: false, reason: "Esa función de Mr. Pilo está apagada." };
  const rule = (PORTALS as string[]).includes(portal) ? rules.portals[portal as Portal] : undefined;
  if (!rule?.on) return { ok: false, reason: action === "preguntar" ? "Pregúntele a Pilo no está abierto por ahora." : "Mr. Pilo con IA no está activo en este portal." };
  if (!rule.fns.includes(fn)) return { ok: false, reason: "Esa función no está activa en este portal." };
  if (rule.aud === "admin" && role !== "admin") return { ok: false, reason: "Por ahora Mr. Pilo con IA es solo para la administración." };
  if (rule.aud === "sesion" && !role) return { ok: false, reason: action === "preguntar" ? "Inicie sesión para preguntarle a Pilo." : "Inicie sesión para usar a Mr. Pilo con IA." };
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

/* --- Pregúntele a Pilo ------------------------------------------------------------- */

/** Un pasaje de la memoria: lo que un portal público muestra, con su procedencia. */
export interface Passage {
  ref: string;
  source: string;
  title: string;
  section: string;
  body: string;
  path: string;
  cut: string;
  office: string;
}

/** La pregunta sin tildes, signos ni mayúsculas, para compararla con las ya respondidas. */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Rule = "saludo" | "gracias" | "quien" | "dinero" | "personas" | "futuro";

/**
 * Lo que se responde con una regla, sin buscar ni gastar créditos: saludos,
 * quién es Pilo, cifras de dinero (no son públicas), datos de personas y
 * años que aún no llegan.
 */
export function ruleFor(question: string, year = new Date().getFullYear()): { rule: Rule; year?: number } | null {
  const t = normalizeQuestion(question);
  if (!t) return null;
  if (/^(hola|buen[oa]s( dias| tardes| noches)?|hey|saludos|que tal)( pilo| mr pilo)?$/.test(t)) return { rule: "saludo" };
  if (/^(muchas )?gracias|^(listo|perfecto|genial|ok|vale)( gracias)?$/.test(t)) return { rule: "gracias" };
  if (/^(quien eres|quien es (mr )?pilo|que (puedes|sabes) hacer|que haces|como funcionas|de donde sacas)/.test(t)) return { rule: "quien" };
  if (/presupuest|dinero|\bplata\b|\bpesos\b|\bcop\b|cuanto (cuesta|costo|vale)|inversion|salari|sueldo|honorario|\bgasto/.test(t)) return { rule: "dinero" };
  if (/cedula|telefono|celular|correo de|direccion de (residencia|la casa)|notas? de [a-z]+ [a-z]+|codigo (del|de un) estudiante|datos personales/.test(t)) return { rule: "personas" };
  const future = (t.match(/\b(20[2-9]\d)\b/g) ?? []).map(Number).find((y) => y > year);
  if (future) return { rule: "futuro", year: future };
  return null;
}

export const RULE_TEXT: Record<Rule, string> = {
  saludo: "¡Hola! Soy Mr. Pilo. Pregúnteme por las cifras de la universidad, el Plan de Desarrollo, los boletines, el Observatorio o el impacto de los programas.",
  gracias: "Con gusto. Si quiere, siga preguntando: cada respuesta trae sus fuentes para que las revise.",
  quien:
    "Soy Mr. Pilo, el guía de la Oficina de Planeación Institucional de la UDES. Respondo con lo que la universidad publica en UDES en Cifras, los boletines, el Plan de Desarrollo, el Observatorio y el Portal de Impacto, y le digo de dónde sale cada dato. Si algo no está publicado, se lo digo en vez de adivinar.",
  dinero:
    "Esa cifra no se la puedo dar: los valores de presupuesto y dinero no se publican en los portales abiertos de la universidad, así que no están en lo que conozco. Sí le puedo contar cómo avanzan los pilares, proyectos e indicadores.",
  personas: "No doy datos de personas: ni nombres con notas, ni documentos, ni contactos. Puedo darle cifras agregadas, por programa, sede o periodo.",
  futuro: "Ese periodo aún no ha llegado, y yo no hago proyecciones que Planeación no haya publicado.",
};

const ASK_TASK = [
  "Responde la pregunta con los pasajes numerados, en 2 a 5 frases.",
  "Después de cada dato pon entre corchetes el número del pasaje de donde sale, por ejemplo [1] o [2].",
  "Di el corte o periodo de las cifras cuando el pasaje lo trae.",
  "Si los pasajes no alcanzan para responder, dilo y marca sin_datos en true.",
  'Formato: {"respuesta":"...","sin_datos":false}',
].join(" ");

export function buildAskMessages(question: string, passages: Passage[], history: { q: string; a: string }[] = []) {
  const body = passages
    .map((p, i) => `[${i + 1}] ${p.title}${p.section ? ` · ${p.section}` : ""}${p.cut ? ` (corte ${p.cut})` : ""}\n${p.body.slice(0, 1600)}`)
    .join("\n\n");
  const before = history
    .slice(-2)
    .map((h) => `Antes preguntaron: ${h.q.slice(0, 200)}\nY respondiste: ${h.a.slice(0, 400)}`)
    .join("\n");
  return [
    { role: "system", content: PERSONA },
    { role: "user", content: `${ASK_TASK}\n\n${before ? `${before}\n\n` : ""}Pasajes:\n${body}\n\nPregunta: ${question.slice(0, 500)}` },
  ];
}

/** Lee la respuesta del modelo y quita las citas a pasajes que no existen. */
export function parseAsk(raw: string, count: number): { text: string; noData: boolean } {
  const text = raw.trim();
  let answer = "";
  let noData = false;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as { respuesta?: unknown; sin_datos?: unknown };
      if (typeof data.respuesta === "string") answer = data.respuesta;
      noData = data.sin_datos === true;
    } catch {
      /* no era JSON */
    }
  }
  if (!answer) answer = text.replace(/```[a-z]*|```/g, "").trim();
  answer = answer.replace(/\[(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= count ? m : "")).replace(/\s+([.,;:])/g, "$1");
  return { text: answer.trim(), noData };
}

/** Los pasajes citados en un texto, en orden de aparición y sin repetir. */
export function citedIn(text: string): number[] {
  const seen: number[] = [];
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** Las primeras frases de un pasaje, hasta unos 260 caracteres. */
function lead(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= 260) return clean;
  const cut = clean.slice(0, 260);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/**
 * Sin IA (apagada, sin cupo o sin conexión): lo que dicen los pasajes más
 * cercanos, tal cual, con su cita. Nada inventado, nada reescrito.
 */
export function extractAnswer(passages: Passage[]): string {
  const top = passages.slice(0, 2);
  if (!top.length) return "";
  const parts = top.map((p, i) => `${p.title}${p.cut ? ` (corte ${p.cut})` : ""}: ${lead(p.body)} [${i + 1}]`);
  return `Esto es lo que encontré en lo publicado. ${parts.join(" ")}`;
}

export const NOTHING_TEXT =
  "No encontré eso en lo que conozco y prefiero no adivinar. Puedo responder sobre las cifras de UDES en Cifras, los boletines, el Plan de Desarrollo, el Observatorio y el Portal de Impacto.";

/** Parecido entre dos preguntas normalizadas, por trigramas (0 a 1), como pg_trgm. */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>();
    for (const w of s.split(" ").filter(Boolean)) {
      const padded = `  ${w} `;
      for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    }
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/**
 * La respuesta guardada que se puede repetir: casi la misma pregunta (0,78 o
 * más de parecido) y sus pasajes sin cambios desde que se respondió.
 */
export function pickSaved<T extends { qnorm: string; fresh: boolean }>(qnorm: string, candidates: T[] | null | undefined, min = 0.78): T | null {
  let best: T | null = null;
  let score = min;
  for (const c of candidates ?? []) {
    if (!c.fresh) continue;
    const s = similarity(qnorm, c.qnorm);
    if (s >= score) {
      best = c;
      score = s;
    }
  }
  return best;
}

/** Deja solo los pasajes citados y los numera de nuevo en orden de aparición. */
export function renumber<T>(text: string, passages: T[]): { text: string; passages: T[] } {
  const order = citedIn(text).filter((n) => n >= 1 && n <= passages.length);
  const map = new Map(order.map((n, i) => [n, i + 1]));
  return {
    text: text.replace(/\[(\d+)\]/g, (_m, n) => (map.has(Number(n)) ? `[${map.get(Number(n))}]` : "")),
    passages: order.map((n) => passages[n - 1]),
  };
}

/* --- El catálogo de Planeación (0096) ----------------------------------------------- */

/** Una entrada del catálogo: una respuesta oficial o una microexpresión para una capciosa. */
export interface CatalogEntry {
  key: string;
  kind: "respuesta" | "capciosa";
  question: string;
  variants: string[];
  triggers: string[];
  answer: string;
  mood: string;
  source_title: string;
  source_path: string;
  cut: string;
  office: string;
}

/**
 * ¿La pregunta trae el disparador? Todas sus palabras, sin tildes ni
 * mayúsculas y en cualquier orden, como comienzo de una palabra de la
 * pregunta («salario rector» dispara con «¿cuál es el salario del rector?»).
 */
export function hasTrigger(qnorm: string, trigger: string): boolean {
  const words = normalizeQuestion(trigger).split(" ").filter((w) => w.length >= 2);
  if (!words.length) return false;
  const padded = ` ${qnorm} `;
  return words.every((w) => padded.includes(` ${w}`));
}

/**
 * Lo que responde el catálogo, si responde. Primero las capciosas (gana el
 * disparador más largo, el más específico); luego las respuestas, por
 * parecido con la pregunta o alguna de sus variantes (0,72 o más).
 */
export function matchCatalog(question: string, entries: CatalogEntry[], min = 0.72): { entry: CatalogEntry; score: number } | null {
  const qnorm = normalizeQuestion(question);
  if (!qnorm) return null;
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const e of entries) {
    if (e.kind !== "capciosa") continue;
    for (const t of e.triggers) {
      if (!hasTrigger(qnorm, t)) continue;
      const score = normalizeQuestion(t).split(" ").length;
      if (!best || score > best.score) best = { entry: e, score };
    }
  }
  if (best) return best;
  for (const e of entries) {
    if (e.kind !== "respuesta") continue;
    for (const q of [e.question, ...e.variants]) {
      const score = similarity(qnorm, normalizeQuestion(q));
      if (score >= min && (!best || score > best.score)) best = { entry: e, score };
    }
  }
  return best;
}
// --- fin de la lógica -------------------------------------------------------------

// El origen permitido se pone en cada respuesta, según quién llama (allowOrigin).
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Llama al proveedor. Si responde 429 (límite de pedidos por segundo, muy
 * bajo en el plan gratuito de Mistral), espera lo que pida —hasta 3 s— y
 * reintenta una sola vez.
 */
async function callProvider(url: string, init: RequestInit): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 429) return first;
  const wait = Math.min(3, Math.max(1, Number(first.headers.get("retry-after")) || 1.2));
  await first.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  return fetch(url, init);
}

/** El 429 dicho en palabras: es el límite del proveedor, no el de la intranet. */
const LIMIT_429 =
  "El proveedor limitó los pedidos (429). Es el límite de su cuenta, no el de la intranet: espere un minuto y, si sigue, revise el plan y los límites de la cuenta en la consola del proveedor.";

/** Lo que respondió el proveedor cuando falla, corto y sin romper nada. */
async function providerDetail(response: Response) {
  try {
    const text = await response.text();
    // Una página web en vez de una respuesta de API: la dirección no es la del servicio.
    if (/^\s*</.test(text)) return "respondió una página web, no la API (la dirección no es la del servicio)";
    try {
      const data = JSON.parse(text);
      return String(data?.message ?? data?.error?.message ?? data?.error ?? data?.detail ?? text).slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return "";
  }
}

/**
 * Qué origen puede leer la respuesta. ALLOWED_ORIGIN admite uno o varios,
 * separados por coma («https://www.udesplanea.com,https://udesplanea.com»);
 * sin él, cualquiera. Además, siempre localhost: así se prueba en desarrollo
 * (npm run dev) sin tocar la configuración del proyecto. El permiso de verdad
 * lo da la sesión (JWT), no el origen.
 */
/** El catálogo se lee a lo sumo una vez por minuto en cada instancia de la función. */
let catalogCache: { at: number; rows: CatalogEntry[] } | null = null;

function allowOrigin(origin: string | null): string {
  const list = (Deno.env.get("ALLOWED_ORIGIN") ?? "*")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (!origin) return list[0] ?? "*";
  if (list.includes("*") || list.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return list[0] ?? "*";
}

Deno.serve(async (request) => {
  const response = await handle(request);
  response.headers.set("Access-Control-Allow-Origin", allowOrigin(request.headers.get("Origin")));
  response.headers.append("Vary", "Origin");
  return response;
});

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada correctamente." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: {
    action?: Action | "calificar";
    portal?: string;
    page?: string;
    sections?: Section[];
    text?: string;
    question?: string;
    history?: { q: string; a: string }[];
    answerId?: number;
    vote?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "El pedido no es JSON." }, 400);
  }
  const requested = body.action;
  if (!requested || !["resumir", "sintetizar", "explicar", "voz", "probar", "preguntar", "calificar"].includes(requested)) {
    return json({ error: "Acción desconocida." }, 400);
  }
  // Calificar una respuesta pide los mismos permisos que preguntar.
  const action: Action = requested === "calificar" ? "preguntar" : requested;
  const asking = action === "preguntar";

  // Quién pregunta: sin sesión, o una persona con su rol (si su perfil está activo).
  let profileId: string | null = null;
  let role: Role | null = null;
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user) {
      const { data: profile } = await admin.from("profiles").select("id, role, is_active").eq("id", data.user.id).maybeSingle();
      if (profile?.is_active) {
        profileId = profile.id;
        role = profile.role as Role;
      }
    }
  }

  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    // «*»: si la base aún no tiene 0090, speech_key no existe y no debe fallar.
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!settings) return json({ error: "Falta la migración 0089 de Mr. Pilo con IA." }, 500);
  // Cada proveedor guarda su clave (0091); antes había una sola (api_key).
  const keyOf = (provider: string) => String(secret?.[`${provider}_key`] ?? "");
  const textKey = keyOf(settings.provider ?? "mistral") || String(secret?.api_key ?? "");
  const speechKey =
    String(secret?.speech_key ?? "") ||
    (settings.speech_provider === "freeai" || settings.speech_provider === "otro" ? keyOf(settings.speech_provider) : "") ||
    textKey;
  const target = textTarget(settings.provider ?? "mistral", settings.base_url ?? "", settings.chat_path ?? "", settings.text_model ?? "");
  const connected = target.url.startsWith("https://") && Boolean(target.model) && Boolean(textKey);
  // Preguntar funciona sin IA: responde de memoria.
  if (!connected && !asking) {
    return json({ error: "Mr. Pilo con IA aún no está conectado.", advice: "La administración debe poner la dirección y la clave del proveedor." }, 503);
  }

  const portal = String(body.portal ?? "");
  const allowed = canUse(settings as unknown as Rules, portal, action, role);
  if (!allowed.ok) return json({ error: allowed.reason }, 403);

  const started = Date.now();
  const log = (status: string, subject: string, cached = false) =>
    admin.from("pilo_ai_log").insert({ profile_id: profileId, portal, action, subject: subject.slice(0, 200), status, cached, ms: Date.now() - started });

  // Cupo del día (los pedidos atendidos desde lo guardado no cuentan).
  const overLimit = async () => {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("pilo_ai_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString())
      .eq("cached", false);
    return (count ?? 0) >= settings.daily_limit;
  };
  // Preguntar revisa el cupo solo antes de llamar a la IA: la memoria no gasta.
  if (action !== "probar" && !asking && (await overLimit())) {
    await log("limite", body.page ?? "");
    return json({ error: "Mr. Pilo llegó al límite de pedidos de hoy.", advice: "Mañana vuelve; mientras tanto puede leer con la voz del navegador.", code: "limite" }, 429);
  }

  const headers = { Authorization: `Bearer ${textKey}`, "Content-Type": "application/json" };

  /** El catálogo activo. Sin 0096, vacío: la página sigue funcionando. */
  async function loadCatalog(): Promise<CatalogEntry[]> {
    if (catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.rows;
    const { data, error } = await admin.rpc("pilo_catalog_active");
    const rows = error ? [] : ((data ?? []) as CatalogEntry[]);
    catalogCache = { at: Date.now(), rows };
    return rows;
  }

  /**
   * Pregúntele a Pilo, por capas: catálogo → reglas → respuestas guardadas → memoria →
   * IA. Cada capa deja su paso en `trail`, que la página muestra en «Cómo
   * respondí». Solo la IA cuenta para el cupo del día.
   */
  async function answerQuestion(): Promise<Response> {
    const question = String(body.question ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (question.length < 2) return json({ error: "Escriba su pregunta." }, 400);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
      .slice(-2);
    type Step = { step: string; status: "ok" | "skip" | "ai"; detail: string; ms: number };
    const trail: Step[] = [];
    let t0 = Date.now();
    const step = (name: string, status: Step["status"], detail: string) => {
      trail.push({ step: name, status, detail, ms: Date.now() - t0 });
      t0 = Date.now();
    };
    // Qué memorias se usan: las encendidas; Impacto pide sesión, como su portal.
    const on = (settings.memory_sources ?? {}) as Record<string, boolean>;
    const sources = ["cifras", "boletines", "pdi", "observatorio", "impacto"].filter((s) => on[s] !== false && (s !== "impacto" || role));
    type Hit = Passage & { rank: number; updated_at: string };
    const shape = (p: Passage, i: number) => ({
      n: i + 1,
      ref: p.ref,
      source: p.source,
      title: p.title,
      section: p.section,
      path: p.path,
      cut: p.cut,
      office: p.office,
      excerpt: p.body.slice(0, 900),
    });
    const reply = async (kind: string, text: string, passages: Passage[], extra: Record<string, unknown> = {}) => {
      await log(kind === "ia" ? "listo" : `listo · ${kind}`, question, kind !== "ia");
      return json({ kind, text, sources: passages.map(shape), trail, ...extra });
    };
    const search = async (): Promise<Hit[]> => {
      const { data, error } = await admin.rpc("pilo_memory_search", { p_q: question, p_sources: sources, p_limit: 8 });
      if (error) throw new Error(`memoria: ${error.message}`);
      return (data ?? []) as Hit[];
    };

    // 0. El catálogo de Planeación (0096): respuestas oficiales y microexpresiones
    //    para capciosas. Va primero: lo que Planeación escribió manda.
    const catalog = await loadCatalog();
    const hit = matchCatalog(question, catalog);
    if (hit) {
      const e = hit.entry;
      void admin.rpc("pilo_catalog_hit", { p_key: e.key });
      if (e.kind === "capciosa") {
        step("Catálogo", "ok", `Pregunta capciosa: respondo con la microexpresión ${e.key}.`);
        return reply("capciosa", e.answer, [], { mood: e.mood });
      }
      const source: Passage[] = e.source_title
        ? [{ ref: `catalogo:${e.key}`, source: "catalogo", title: e.source_title, section: "Respuesta de Planeación", body: e.answer, path: e.source_path, cut: e.cut, office: e.office }]
        : [];
      step("Catálogo", "ok", `Respuesta oficial de Planeación (${e.key}), parecida en ${Math.round(hit.score * 100)} %.`);
      const text = source.length && !/\[1\]/.test(e.answer) ? `${e.answer} [1]` : e.answer;
      return reply("curada", text, source, { mood: e.mood });
    }
    step("Catálogo", "skip", catalog.length ? "Nada del catálogo coincide." : "El catálogo está vacío.");

    // 1. Reglas: saludos, quién es Pilo, dinero, datos de personas, el futuro.
    const rule = ruleFor(question);
    if (rule && rule.rule !== "futuro") {
      step("Reglas", "ok", "La pregunta se responde con una regla fija de Pilo.");
      return reply("regla", RULE_TEXT[rule.rule], []);
    }
    if (rule?.rule === "futuro") {
      const found = (await search()).slice(0, 1);
      step("Reglas", "ok", `Pide un dato de ${rule.year}, que aún no existe: se responde con lo último publicado.`);
      const text = `${RULE_TEXT.futuro}${found.length ? ` Lo más reciente publicado sobre eso está en «${found[0].title}»${found[0].cut ? ` (corte ${found[0].cut})` : ""} [1].` : ""}`;
      return reply("regla", text, found);
    }
    step("Reglas", "skip", "Ninguna regla aplica.");

    // 2. Respuestas guardadas: casi la misma pregunta, con sus fuentes sin cambios.
    const qnorm = normalizeQuestion(question);
    const { data: candidates } = await admin.rpc("pilo_answer_candidates", { p_qnorm: qnorm });
    const saved = pickSaved(qnorm, (candidates ?? []) as { id: number; question: string; qnorm: string; answer: string; refs: string[]; fresh: boolean }[]);
    if (saved) {
      const { data: rows } = await admin.from("pilo_memory").select("ref, source, title, section, body, path, cut, office").in("ref", saved.refs);
      const byRef = new Map(((rows ?? []) as Passage[]).map((r) => [r.ref, r]));
      const passages = saved.refs.map((r) => byRef.get(r)).filter(Boolean) as Passage[];
      await admin.from("pilo_answers").update({ last_hit_at: new Date().toISOString() }).eq("id", saved.id);
      step("Respuestas guardadas", "ok", `Ya se había respondido «${saved.question}», y sus fuentes no han cambiado.`);
      step("IA", "skip", "No hizo falta.");
      return reply("memoria", saved.answer, passages, { answerId: saved.id });
    }
    step("Respuestas guardadas", "skip", (candidates ?? []).length ? "Había preguntas parecidas, pero no iguales o sus fuentes cambiaron." : "No había una pregunta igual guardada.");

    // 3. La memoria: los pasajes más cercanos de lo publicado.
    const found = await search();
    if (!found.length) {
      step("Fuentes", "skip", "Ningún pasaje de lo publicado responde la pregunta.");
      step("IA", "skip", "Sin fuentes no se redacta.");
      return reply("nada", NOTHING_TEXT, []);
    }
    const passages = found.filter((p) => p.rank >= found[0].rank * 0.3).slice(0, 5);
    const names: Record<string, string> = { cifras: "UDES en Cifras", boletines: "Boletines", pdi: "Plan de Desarrollo", observatorio: "Observatorio", impacto: "Portal de Impacto" };
    const where = [...new Set(passages.map((p) => names[p.source] ?? p.source))].join(", ");
    step("Fuentes", "ok", `${passages.length} ${passages.length === 1 ? "pasaje" : "pasajes"} en ${where}.`);

    // 4. La IA redacta, si está conectada y hay cupo; si no, los pasajes tal cual.
    const aiOn = connected && settings.enabled && (settings.functions ?? {}).preguntar !== false;
    const noAi = !aiOn ? "La IA está apagada: respondo con los pasajes tal cual." : (await overLimit()) ? "Se acabó el cupo de IA de hoy: respondo con los pasajes tal cual." : "";
    if (noAi) {
      step("IA", "skip", noAi);
      return reply("extracto", extractAnswer(passages), passages.slice(0, 2));
    }
    const response = await callProvider(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: buildAskMessages(question, passages, history),
        temperature: 0.2,
        max_tokens: 600,
        ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await providerDetail(response);
      await log(`error ${response.status}`, `${question} · ${detail}`);
      step("IA", "skip", `El proveedor no respondió (${response.status}): respondo con los pasajes tal cual.`);
      return reply("extracto", extractAnswer(passages), passages.slice(0, 2));
    }
    const data = await response.json();
    const parsed = parseAsk(String(data?.choices?.[0]?.message?.content ?? ""), passages.length);
    if (parsed.noData || !parsed.text) {
      step("IA", "ai", "Leyó los pasajes y no alcanzan para responder.");
      await log("listo · sin datos", question);
      return json({ kind: "nada", text: parsed.text || NOTHING_TEXT, sources: [], trail });
    }
    const cited = renumber(parsed.text, passages);
    const plain = cited.text.replace(/\[\d+\]/g, " ");
    const check = verifyNumbers(plain, passages.map((p) => `${p.title} ${p.section} ${p.cut} ${p.body}`).join("\n"));
    step("IA", "ai", check.verified ? `Redactó con ${passages.length} pasajes. Cada número está en las fuentes.` : `Redactó con ${passages.length} pasajes. Revise: ${check.unknown.join(", ")}.`);
    let answerId: number | null = null;
    if (check.verified && cited.passages.length) {
      const { data: row } = await admin
        .from("pilo_answers")
        .insert({ question, qnorm, kind: "ia", answer: cited.text, refs: cited.passages.map((p) => p.ref) })
        .select("id")
        .maybeSingle();
      answerId = (row as { id: number } | null)?.id ?? null;
    }
    await log(check.verified ? "listo" : "revisar", question);
    return json({ kind: "ia", text: cited.text, sources: cited.passages.map(shape), trail, answerId, verified: check.verified, unknown: check.unknown });
  }

  try {
    // --- Pregúntele a Pilo ---------------------------------------------------------
    if (requested === "calificar") {
      const id = Number(body.answerId);
      if (Number.isInteger(id) && id > 0 && (body.vote === "up" || body.vote === "down")) {
        await admin.rpc("pilo_answer_vote", { p_id: id, p_vote: body.vote });
      }
      return json({ ok: true });
    }
    if (asking) return await answerQuestion();

    // --- Voz -------------------------------------------------------------------
    if (action === "voz") {
      const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
      if (!text) return json({ error: "No hay texto para leer." }, 400);
      const provider = settings.speech_provider ?? "navegador";
      const voice = speechTarget(provider, settings.speech_base_url || settings.base_url || "", settings.speech_path ?? "", settings.speech_model ?? "", settings.speech_voice ?? "");
      const testing = portal === "prueba";
      if ((!testing && settings.voice_engine !== "proveedor") || provider === "navegador" || !voice.model || !voice.url.startsWith("https://") || !speechKey) {
        return json({ error: "La voz avanzada no está configurada; se usa la del navegador.", code: "sin_voz" }, 503);
      }
      const init = {
        method: "POST",
        headers: { Authorization: `Bearer ${speechKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          voice.format === "freeai"
            ? { text, model: voice.model, voice: voice.voice }
            : { model: voice.model, input: text, voice: voice.voice || undefined, response_format: "mp3", speed: Number(settings.voice_rate) || 1 },
        ),
      };
      const response = await callProvider(voice.url, init);
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `${detail} · ${text}`);
        if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
        return json({ error: `El servicio de voz respondió ${response.status}${detail ? `: ${detail}` : ""}. Se llamó a ${voice.url}.`, code: "proveedor" }, 502);
      }
      let audio: Response = response;
      // Free.ai devuelve {audio_url}: se descarga aquí para no depender de su CORS.
      if (voice.format === "freeai") {
        const data = await response.json().catch(() => null);
        const link = typeof data?.audio_url === "string" ? new URL(data.audio_url, voice.url).toString() : "";
        if (!link) {
          await log("error sin audio", text);
          return json({ error: "El servicio de voz no devolvió el audio.", code: "proveedor" }, 502);
        }
        audio = await fetch(link);
        if (!audio.ok) {
          await log(`error audio ${audio.status}`, text);
          return json({ error: `No se pudo descargar el audio (${audio.status}).`, code: "proveedor" }, 502);
        }
      }
      await log("listo", text);
      return new Response(audio.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
    }

    // --- Probar la conexión -------------------------------------------------------
    if (action === "probar") {
      const response = await callProvider(target.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: target.model, messages: [{ role: "user", content: "Responde solo: OK" }], max_tokens: 5 }),
      });
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `Prueba de conexión · ${detail}`);
        return json({
          ok: false,
          status: response.status,
          error:
            response.status === 429
              ? `${LIMIT_429} (La conexión sí funciona: ${target.url}, modelo «${target.model}».)`
              : `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}. Se llamó a ${target.url} con el modelo «${target.model}».`,
        });
      }
      await log("listo", "Prueba de conexión");
      return json({ ok: true, ms: Date.now() - started, url: target.url, model: target.model });
    }

    // --- Resumir, sintetizar, explicar ------------------------------------------------
    const sections = clipSections(Array.isArray(body.sections) ? body.sections : [], settings.max_rows);
    if (!sections.length) return json({ error: "No encontré cifras que leer en esta página." }, 400);
    const page = String(body.page ?? "").slice(0, 160);
    const source = sections.map((s) => `${s.title}\n${s.text}`).join("\n");
    const key = await sha256(JSON.stringify([action, target.model, page, sections]));

    if (settings.cache_days > 0) {
      const { data: hit } = await admin.from("pilo_ai_cache").select("result, created_at").eq("key", key).maybeSingle();
      if (hit && Date.now() - new Date(hit.created_at).getTime() < settings.cache_days * 86400_000) {
        await log("listo", page, true);
        return json({ ...hit.result, cached: true });
      }
    }

    const response = await callProvider(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: buildMessages(action, page, sections),
        temperature: 0.2,
        max_tokens: 700,
        // Mistral (y los compatibles que lo aceptan) devuelven JSON limpio.
        ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await providerDetail(response);
      await log(`error ${response.status}`, `${page} · ${detail}`);
      if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
      return json({ error: `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}.`, code: "proveedor" }, 502);
    }
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "");
    const answer = parseAnswer(action, raw);
    const check = verifyNumbers(answerText(answer), source);
    const result = { answer, verified: check.verified, unknown: check.unknown, sections: sections.map((s) => s.title) };
    if (settings.cache_days > 0 && check.verified) {
      await admin.from("pilo_ai_cache").upsert({ key, result, created_at: new Date().toISOString() });
    }
    await log(check.verified ? "listo" : "revisar", page);
    return json({ ...result, cached: false });
  } catch (error) {
    if (asking) {
      const missing = /pilo_memory|pilo_answer/.test(String(error));
      await log(missing ? "error · falta 0094" : "error", String(body.question ?? "").slice(0, 200));
      return json({ error: missing ? "La memoria de Pilo aún no está lista (falta la migración 0094)." : "No pude buscar en la memoria ahora.", detail: String(error), code: "memoria" }, 502);
    }
    await log("sin conexión", body.page ?? "");
    return json({ error: "No pude hablar con el proveedor.", detail: String(error), code: "red" }, 502);
  }
}
