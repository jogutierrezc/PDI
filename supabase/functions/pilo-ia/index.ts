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
                                                 → { kind, text, sources, trail, answerId?, mood?, graph? }
     { action: "calificar", portal: "pregunta", answerId, vote: "up" | "down" }
     { action: "analizar", portal: "cifras" | "impacto", analysis: {brief, part, title, facts, pdi, doc?, scope?} }
                                                 → { summary, paragraphs, alerts, recommendations, unknown, verified }

   «Preguntar» (la página Pregúntele a Pilo) gasta lo menos posible: el
   catálogo de Planeación (0096), reglas, respuestas ya dadas, búsqueda en la
   memoria (0094) y su malla (0097, para lo que es de estructura) van primero; la IA
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
export type Action = "resumir" | "sintetizar" | "explicar" | "voz" | "probar" | "preguntar" | "entender" | "analizar";
export type Fn = "leer" | "resumir" | "sintetizar" | "explicar" | "preguntar";
export type Audience = "admin" | "sesion" | "publico";
export type Portal = "cifras" | "pdi" | "observatorio" | "impacto" | "pregunta";
export type Role = "consulta" | "responsable" | "planeacion" | "admin";

export interface PortalRule {
  on: boolean;
  aud: Audience;
  fns: Fn[];
}

/** Los informes de Impacto con Pilo (0100): de un programa, una facultad o una vicerrectoría. */
export type ReportKind = "programa" | "facultad" | "vicerrectoria";
export const REPORT_KINDS: ReportKind[] = ["programa", "facultad", "vicerrectoria"];

export interface Rules {
  enabled: boolean;
  functions: Partial<Record<Fn, boolean>>;
  portals: Partial<Record<Portal, PortalRule>>;
  /** A quién más, además de la administración, se abren los informes de Impacto (0100). */
  impacto_report?: Partial<Record<ReportKind, boolean>>;
}

export interface Section {
  title: string;
  kind: "tabla" | "grafica" | "texto";
  text: string;
}

export const PORTALS: Portal[] = ["cifras", "pdi", "observatorio", "impacto", "pregunta"];
export const FN_OF: Record<Exclude<Action, "probar">, Fn> = { resumir: "resumir", sintetizar: "sintetizar", explicar: "explicar", voz: "leer", preguntar: "preguntar", entender: "sintetizar", analizar: "sintetizar" };

/** ¿Puede esta persona (null = sin sesión) usar la acción en el portal? */
export function canUse(rules: Rules, portal: string, action: Action, role: Role | null): { ok: true } | { ok: false; reason: string } {
  if (action === "probar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la conexión." };
  // Entender la necesidad de un programa (Mr. Pilo Bot, en Impacto): con la IA encendida y sesión.
  if (action === "entender") {
    if (!rules.enabled) return { ok: false, reason: "Mr. Pilo con IA está apagado." };
    return role ? { ok: true } : { ok: false, reason: "Inicie sesión para que Pilo entienda su necesidad." };
  }
  // «Análisis de los datos» (boletines de UDES en Cifras): quien arma boletines, con la IA encendida.
  if (action === "analizar") {
    if (!rules.enabled) return { ok: false, reason: "Mr. Pilo con IA está apagado: enciéndalo en Mr. Pilo con IA › Conexión." };
    // Informes de Impacto: de la administración, salvo que ella los abra a programas,
    // decanaturas o vicerrectorías. Qué unidad le toca a cada quien lo decide la base.
    if (portal === "impacto") {
      if (role === "admin") return { ok: true };
      const open = REPORT_KINDS.some((k) => rules.impacto_report?.[k] === true);
      if (!open) return { ok: false, reason: "Por ahora los informes de impacto con Pilo son solo de la administración." };
      return role ? { ok: true } : { ok: false, reason: "Inicie sesión para escribir un informe de impacto." };
    }
    return role === "admin" || role === "planeacion" ? { ok: true } : { ok: false, reason: "El análisis de los datos es para Planeación y la administración." };
  }
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
  // NVIDIA: https://integrate.api.nvidia.com, formato de OpenAI.
  nvidia: { url: "https://integrate.api.nvidia.com/v1/chat/completions", model: "google/gemma-4-31b-it" },
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
  // Una ruta escrita dos veces («/chat/completions/chat/completions») se deja en una.
  const half = p.slice(0, p.length / 2);
  if (p.length > 2 && p.length % 2 === 0 && half + half === p) p = half;
  // Si pegaron la dirección completa («…/v1/chat/completions»), ya trae la ruta.
  if (p !== "/" && b.toLowerCase().endsWith(p.toLowerCase())) return b;
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

export function buildAskMessages(question: string, passages: Passage[], history: { q: string; a: string }[] = [], map = "") {
  const body = passages
    .map((p, i) => `[${i + 1}] ${p.title}${p.section ? ` · ${p.section}` : ""}${p.cut ? ` (corte ${p.cut})` : ""}\n${p.body.slice(0, 1600)}`)
    .join("\n\n");
  const before = history
    .slice(-2)
    .map((h) => `Antes preguntaron: ${h.q.slice(0, 200)}\nY respondiste: ${h.a.slice(0, 400)}`)
    .join("\n");
  return [
    { role: "system", content: PERSONA },
    {
      role: "user",
      content: `${ASK_TASK}\n\n${before ? `${before}\n\n` : ""}${map ? `Dónde queda cada cosa (la malla de la memoria):\n${map.slice(0, 1800)}\n\n` : ""}Pasajes:\n${body}\n\nPregunta: ${question.slice(0, 500)}`,
    },
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
    // «salario, sueldo; cuánto gana» son tres disparadores, no uno: así los escribe la gente.
    for (const t of e.triggers.flatMap((x) => x.split(/[,;]/))) {
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

/* --- La malla de la memoria (0097) ----------------------------------------------------- */

/**
 * Un nodo de la malla: un pilar, un área, una línea, un proyecto, un informe,
 * un indicador, un tema… Su id es el mismo del pasaje que lo describe, así la
 * búsqueda de texto y la malla se encuentran sin traducir nada.
 */
export interface MeshNode {
  id: string;
  source: string;
  type: string;
  code: string;
  label: string;
  path: string;
}

/** Una relación. «contiene» va de padre a hijo (pilar → área → línea → proyecto). */
export interface MeshEdge {
  from: string;
  to: string;
  rel: string;
}

export interface Mesh {
  nodes: MeshNode[];
  edges: MeshEdge[];
}

export const TYPE_LABEL: Record<string, [string, string, "m" | "f"]> = {
  fuente: ["fuente", "fuentes", "f"],
  pilar: ["pilar", "pilares", "m"],
  // «un área», «del área»: la a tónica pide el artículo masculino.
  area: ["área estratégica", "áreas estratégicas", "m"],
  linea: ["línea de acción", "líneas de acción", "f"],
  proyecto: ["proyecto", "proyectos", "m"],
  informe: ["informe", "informes", "m"],
  indicador: ["indicador", "indicadores", "m"],
  tema: ["tema", "temas", "m"],
  tabla: ["tabla de datos", "tablas de datos", "f"],
  boletin: ["boletín", "boletines", "m"],
  edicion: ["edición en PDF", "ediciones en PDF", "f"],
  programa: ["programa", "programas", "m"],
};

const typeName = (t: string, many = false) => (TYPE_LABEL[t] ? TYPE_LABEL[t][many ? 1 : 0] : t);
const article = (t: string) => (TYPE_LABEL[t]?.[2] === "f" ? "una" : "un");
/** «P1 · Personalización», o solo el nombre si no tiene número. */
export const nodeName = (n: MeshNode) => (n.code ? `${n.code} · ${n.label}` : n.label);

/** Los padres de un nodo por «contiene», del más cercano al más lejano (sin repetir). */
export function parentsOf(mesh: Mesh, id: string): MeshNode[] {
  const byId = new Map(mesh.nodes.map((n) => [n.id, n]));
  return mesh.edges.filter((e) => e.to === id && e.rel === "contiene").map((e) => byId.get(e.from)).filter(Boolean) as MeshNode[];
}

/** La ruta de un nodo hasta la raíz, subiendo por el primer padre: [raíz, …, nodo]. */
export function pathTo(mesh: Mesh, id: string): MeshNode[] {
  const byId = new Map(mesh.nodes.map((n) => [n.id, n]));
  const out: MeshNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.unshift(current);
    current = parentsOf(mesh, current.id)[0];
  }
  return out;
}

export function childrenOf(mesh: Mesh, id: string): MeshNode[] {
  const byId = new Map(mesh.nodes.map((n) => [n.id, n]));
  return mesh.edges.filter((e) => e.from === id && e.rel === "contiene").map((e) => byId.get(e.to)).filter(Boolean) as MeshNode[];
}

/** ¿La pregunta es sobre la estructura (qué contiene, de qué hace parte, cuántos hay)? */
export function isStructural(question: string): boolean {
  const t = normalizeQuestion(question);
  return (
    /\b(estructura|mapa|compone|componen|conforma|conforman|organiza|jerarquia)\b/.test(t) ||
    /\b(que|cuales|cuantos|cuantas) (son )?(los |las )?(pilares|areas|lineas|proyectos|informes|indicadores|temas|tablas|programas)\b/.test(t) ||
    /\b(tiene|tienen|incluye|incluyen|contiene|contienen|agrupa)\b.*\b(pilares|areas|lineas|proyectos|informes|indicadores|temas|tablas|programas)\b/.test(t) ||
    /\b(a|en) (que|cual) (pilar|area|linea|informe|tema)\b|\b(pertenece|hace parte|depende|cuelga)\b/.test(t)
  );
}

const listNames = (nodes: MeshNode[], max = 12) => {
  const names = nodes.slice(0, max).map(nodeName);
  const rest = nodes.length - names.length;
  if (rest > 0) return `${names.join(", ")} y ${rest} más`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0] ?? "";
};

/**
 * La respuesta de estructura, sin IA: dónde queda el nodo (su ruta), qué
 * contiene (por tipo) y, si cuelga de varios lados, con qué más se vincula.
 * El texto cita con [1] el pasaje del propio nodo.
 */
export function describeNode(mesh: Mesh, id: string): string {
  const node = mesh.nodes.find((n) => n.id === id);
  if (!node) return "";
  const route = pathTo(mesh, id).filter((n) => n.type !== "fuente");
  const up = route.slice(0, -1).reverse();
  const parts: string[] = [];
  if (node.type === "fuente") parts.push(`${node.label} [1].`);
  else if (up.length) {
    const chain = up.map((p) => `${TYPE_LABEL[p.type]?.[2] === "f" ? "de la" : "del"} ${typeName(p.type)} ${nodeName(p)}`).join(", ");
    parts.push(`«${nodeName(node)}» es ${article(node.type)} ${typeName(node.type)} ${chain} [1].`);
  }
  else parts.push(`«${nodeName(node)}» es ${article(node.type)} ${typeName(node.type)} [1].`);
  const kids = childrenOf(mesh, id);
  const byType = new Map<string, MeshNode[]>();
  for (const k of kids) byType.set(k.type, [...(byType.get(k.type) ?? []), k]);
  for (const [type, list] of byType) {
    parts.push(`${node.type === "fuente" ? "Tiene" : "Contiene"} ${list.length} ${typeName(type, list.length !== 1)}: ${listNames(list)}.`);
  }
  const others = parentsOf(mesh, id).slice(1);
  if (others.length) parts.push(`También se vincula con ${listNames(others)}.`);
  if (!kids.length && node.type !== "fuente" && !others.length && !up.length) parts.push("No tiene elementos por debajo en lo publicado.");
  return parts.join(" ");
}

/** La parte de la malla que se dibuja con una respuesta: la ruta del nodo y lo que contiene. */
export function focusMesh(mesh: Mesh, id: string, maxChildren = 24): Mesh & { focus: string } {
  const route = pathTo(mesh, id);
  const kids = childrenOf(mesh, id).slice(0, maxChildren);
  const extra = parentsOf(mesh, id).slice(1);
  const keep = new Map([...route, ...kids, ...extra].map((n) => [n.id, n]));
  return {
    focus: id,
    nodes: [...keep.values()],
    edges: mesh.edges.filter((e) => e.rel === "contiene" && keep.has(e.from) && keep.has(e.to)),
  };
}

/** Para la IA: la ruta de cada pasaje en la malla, una línea por pasaje. */
export function mapContext(mesh: Mesh, ids: string[]): string {
  return ids
    .map((id, i) => {
      const route = pathTo(mesh, id).filter((n) => n.type !== "fuente");
      return route.length > 1 ? `[${i + 1}] ${route.map(nodeName).join(" › ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/* --- Mr. Pilo Bot: entender la necesidad de un programa ------------------------------ */

/**
 * Lo que manda Mr. Pilo Bot: lo que escribió el programa y las listas
 * cerradas de donde la IA puede elegir (los impactos y las fichas ya
 * construidas que la búsqueda de palabras dejó como candidatas).
 */
export interface NeedInput {
  program: string;
  text: string;
  goals: { id: string; fn: string; title: string }[];
  indicators: { id: string; code: string; name: string; fn: string; stage: string }[];
}

export interface NeedAnswer {
  summary: string;
  goals: string[];
  indicators: { id: string; reason: string }[];
}

const NEED_TASK = [
  "Un director de programa académico te cuenta lo que su programa necesita o quiere lograr.",
  "Elige, solo de las listas que te doy, los impactos (máximo 4) y las fichas de indicador (máximo 6) que mejor responden a lo que pide.",
  "Para cada ficha, di en una frase corta por qué responde a lo que pidió.",
  "Resume en una o dos frases, en usted, lo que entendiste que necesita el programa.",
  "Si nada de las listas responde, deja las listas vacías y dilo en el resumen.",
  'Formato: {"resumen":"...","impactos":["id"],"fichas":[{"id":"...","porque":"..."}]}',
].join(" ");

export function buildNeedMessages(input: NeedInput) {
  const goals = input.goals.map((g) => `${g.id} · ${g.fn} · ${g.title}`).join("\n");
  const indicators = input.indicators
    .slice(0, 40)
    .map((i) => `${i.id} · ${i.code} · ${i.fn} · ${i.stage} · ${i.name.slice(0, 160)}`)
    .join("\n");
  return [
    { role: "system", content: PERSONA },
    {
      role: "user",
      content: `${NEED_TASK}\n\nPrograma: ${input.program.slice(0, 160)}\n\nImpactos (id · función · impacto):\n${goals}\n\nFichas ya construidas (id · código · función · eslabón · nombre):\n${indicators || "(ninguna)"}\n\nLo que escribió el programa: ${input.text.slice(0, 800)}`,
    },
  ];
}

/** Lee la respuesta y deja solo ids que estaban en las listas: la IA no puede inventar fichas. */
export function parseNeed(raw: string, goalIds: Set<string>, indicatorIds: Set<string>): NeedAnswer {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let data: { resumen?: unknown; impactos?: unknown; fichas?: unknown } = {};
  if (start >= 0 && end > start) {
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      /* no era JSON */
    }
  }
  const goals = (Array.isArray(data.impactos) ? data.impactos : []).filter((g): g is string => typeof g === "string" && goalIds.has(g)).slice(0, 4);
  const indicators = (Array.isArray(data.fichas) ? data.fichas : [])
    .map((f) => (f && typeof f === "object" ? (f as { id?: unknown; porque?: unknown }) : {}))
    .filter((f) => typeof f.id === "string" && indicatorIds.has(f.id))
    .map((f) => ({ id: f.id as string, reason: typeof f.porque === "string" ? f.porque.slice(0, 200) : "" }))
    .filter((f, i, all) => all.findIndex((x) => x.id === f.id) === i)
    .slice(0, 6);
  const summary = typeof data.resumen === "string" ? data.resumen.slice(0, 400) : "";
  return { summary, goals, indicators };
}

/* --- Análisis de los datos (boletín de UDES en Cifras) -------------------------------- */

export type AnalysisFormat = "ejecutivo" | "tecnico" | "sedes" | "tendencias" | "libre";
export type AnalysisLength = "breve" | "estandar" | "extenso";
export type AnalysisTone = "institucional" | "divulgativo" | "tecnico";

export interface AnalysisBrief {
  format: AnalysisFormat;
  /** Para quién es: «Consejo Superior», «Decanos y directores»… */
  audience: string;
  tone: AnalysisTone;
  length: AnalysisLength;
  alerts: boolean;
  recommendations: boolean;
  method: boolean;
  /** Las indicaciones propias de quien encarga el análisis. */
  prompt: string;
}

export interface AnalysisInput {
  brief: AnalysisBrief;
  /** Un capítulo por informe o el cierre del documento. */
  part: "capitulo" | "cierre";
  title: string;
  /** Las cifras, ya calculadas (sin IA): una línea por dato. En el cierre, lo dicho en cada capítulo. */
  facts: string;
  /** Pasajes del Plan de Desarrollo, si se pidió cruzar con el PDI. */
  context?: string;
  /** El nombre del documento; sin él, el análisis de UDES en Cifras. */
  doc?: string;
}

export interface AnalysisPart {
  summary: string;
  paragraphs: string[];
  alerts: string[];
  recommendations: string[];
}

const ANALYSIS_FORMAT: Record<AnalysisFormat, string> = {
  ejecutivo: "Informe ejecutivo: los hallazgos que importan para decidir, con sus cifras titulares, sin detalle metodológico.",
  tecnico: "Informe técnico: lectura completa de las series, variaciones entre años, diferencias entre sedes y límites de los datos.",
  sedes: "Comparativo por sede: pon las sedes lado a lado y señala la brecha de cada una frente al total institucional.",
  tendencias: "Tendencias y alertas: lo que sube, lo que cae y lo que se aleja de lo esperado según la dirección de cada indicador.",
  libre: "Sigue las indicaciones de quien encarga el análisis.",
};

const ANALYSIS_TONE: Record<AnalysisTone, string> = {
  institucional: "Tono institucional, sobrio y preciso.",
  divulgativo: "Tono divulgativo: explica cada cifra para quien no es experto.",
  tecnico: "Tono técnico: usa el vocabulario de planeación y estadística con precisión.",
};

/** Cuánto escribe cada llamada según la longitud pedida. */
export const ANALYSIS_SIZE: Record<AnalysisLength, { paragraphs: string; tokens: number }> = {
  breve: { paragraphs: "2 párrafos de 60 a 90 palabras", tokens: 1000 },
  estandar: { paragraphs: "3 o 4 párrafos de 80 a 120 palabras", tokens: 1800 },
  extenso: { paragraphs: "5 a 7 párrafos de 90 a 140 palabras", tokens: 2800 },
};

const ANALYST = [
  "Eres Mr. Pilo, analista de la Oficina de Planeación Institucional de la Universidad de Santander (UDES).",
  "Escribes como escribe un buen analista humano en un informe institucional: prosa natural y fluida, en español de Colombia y en tercera persona.",
  "Alterna frases cortas y largas, enlaza las ideas con conectores (además, en cambio, por eso, sin embargo) y no repitas la misma estructura en cada frase.",
  "Interpreta: no enumeres cifras una tras otra; elige las que importan y di qué significan.",
  "Evita frases de relleno y fórmulas como «cabe destacar», «es importante mencionar» o «en conclusión».",
  "Cada dato de la lista trae su número de fuente entre corchetes, como [2]: cuando uses una cifra, pon ese número justo después, así: «bajó a 9,6 % [2]».",
  "Solo usas las cifras que vienen en los datos: no inventes números, porcentajes, causas ni comparaciones que no estén.",
  "Puedes decir «subió» o «bajó», pero cada número que escribas debe estar en los datos, tal como aparece.",
  "Un dato vacío no es un cero: dilo como «sin reporte».",
  "Si una causa no se puede afirmar con los datos, preséntala como hipótesis a revisar.",
  "No menciones ni infieras datos de personas.",
  "Cada párrafo desarrolla una idea: la cifra, cómo cambió, qué la explica según los datos y qué significa para la universidad.",
  "Escribe texto corrido: sin Markdown, sin asteriscos, sin viñetas ni títulos dentro de los párrafos.",
  "Responde solo con el JSON que se pide, sin texto antes ni después.",
].join(" ");

export function buildAnalysisMessages(input: AnalysisInput) {
  const { brief } = input;
  const size = ANALYSIS_SIZE[brief.length];
  const wants = [
    `"resumen": una frase con el hallazgo principal`,
    `"parrafos": [${size.paragraphs} de análisis]`,
    brief.alerts ? `"alertas": [1 a 3 alertas cortas, lo que preocupa según los datos]` : `"alertas": []`,
    brief.recommendations ? `"recomendaciones": [2 a 4 recomendaciones concretas]` : `"recomendaciones": []`,
  ];
  const task =
    input.part === "cierre"
      ? `Escribe el cierre del documento «${input.title}»: integra lo que dicen los capítulos sin repetirlos uno por uno y termina con lo que conviene decidir.`
      : `Escribe el capítulo «${input.title}» del documento ${input.doc || "Análisis de los datos de UDES en Cifras"}.${brief.method ? " En el último párrafo, una nota breve de cómo se leyeron las cifras (corte, sedes, qué falta)." : ""}`;
  const lines = [
    task,
    ANALYSIS_FORMAT[brief.format],
    `Público: ${brief.audience.slice(0, 80) || "Directivos de la universidad"}. ${ANALYSIS_TONE[brief.tone]}`,
    brief.prompt.trim() ? `Indicaciones de quien encarga el análisis (síguelas si los datos lo permiten): ${brief.prompt.trim().slice(0, 1200)}` : "",
    `Formato: {${wants.join(", ")}}`,
    "",
    input.part === "cierre"
      ? "Lo que dice cada capítulo (en el cierre no pongas números de fuente entre corchetes):"
      : "Datos (ya calculados; son los únicos números que puedes usar; el número entre corchetes es la fuente):",
    input.facts.slice(0, 9000),
    input.context ? `\nPlan de Desarrollo Institucional (para conectar, no para sacar cifras):\n${input.context.slice(0, 2400)}` : "",
  ];
  return [
    { role: "system", content: ANALYST },
    { role: "user", content: lines.filter((l) => l !== "").join("\n") },
  ];
}

/** Quita el formato de Markdown que algunos modelos meten igual: negritas, viñetas, títulos. */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|[.,;:]|$)/g, "$1$2")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Una lista, venga como lista o como un texto con párrafos o líneas. */
function listOf(v: unknown, max: number, len: number, split: RegExp): string[] {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(split) : [];
  return items
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String(Object.values(x as Record<string, unknown>).find((y) => typeof y === "string") ?? "") : ""))
    .map((x) => plain(x).slice(0, len))
    .filter((x) => x.length > 0)
    .slice(0, max);
}

/** El valor de un campo con cualquiera de sus nombres (con o sin tilde, en inglés). */
function field(data: Record<string, unknown>, names: string[]): unknown {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const wanted = names.map(fold);
  const key = Object.keys(data).find((k) => wanted.includes(fold(k)));
  return key ? data[key] : undefined;
}

const PARAGRAPHS = ["parrafos", "paragraphs", "analisis", "texto", "desarrollo", "cuerpo"];
const SUMMARY = ["resumen", "summary", "hallazgo", "hallazgo_principal", "idea_principal"];
const ALERTS = ["alertas", "alerts", "alerta"];
const RECOMMENDATIONS = ["recomendaciones", "recommendations", "recomendacion"];

function fromData(data: Record<string, unknown>): AnalysisPart | null {
  const paragraphs = listOf(field(data, PARAGRAPHS), 10, 2400, /\n\s*\n/);
  const summaryRaw = field(data, SUMMARY);
  const summary = typeof summaryRaw === "string" ? plain(summaryRaw).slice(0, 400) : "";
  if (!paragraphs.length && !summary) return null;
  return {
    summary,
    paragraphs,
    alerts: listOf(field(data, ALERTS), 4, 400, /\n+/),
    recommendations: listOf(field(data, RECOMMENDATIONS), 6, 400, /\n+/),
  };
}

/**
 * JSON cortado (el modelo llegó al tope de palabras) o mal cerrado: se rescatan
 * los textos completos de cada campo, así no se pierde lo que sí escribió.
 */
function rescue(text: string): AnalysisPart | null {
  const strings = (from: number) => {
    const out: string[] = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    re.lastIndex = from;
    let m: RegExpExecArray | null;
    let last = from;
    let stopped = false;
    while ((m = re.exec(text))) {
      // Termina al llegar al siguiente campo («"alertas":»).
      if (/^\s*:/.test(text.slice(re.lastIndex))) {
        stopped = true;
        break;
      }
      last = re.lastIndex;
      try {
        out.push(JSON.parse(`"${m[1]}"`));
      } catch {
        out.push(m[1]);
      }
    }
    // Un texto que quedó abierto (la respuesta se cortó): lo escrito hasta ahí.
    const open = stopped ? null : /^[\s,[]*"((?:[^"\\]|\\.){40,})$/.exec(text.slice(last));
    if (open) out.push(open[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\s+\S*$/, "") + "…");
    return out;
  };
  const at = (names: string[]) => {
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const re = /"([^"]+)"\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (names.includes(fold(m[1]))) return re.lastIndex;
    return -1;
  };
  const read = (names: string[]) => {
    const i = at(names);
    return i < 0 ? [] : strings(i);
  };
  const paragraphs = read(PARAGRAPHS).map(plain).filter(Boolean).slice(0, 10);
  const summary = plain(read(SUMMARY)[0] ?? "").slice(0, 400);
  if (!paragraphs.length && !summary) return null;
  return {
    summary,
    paragraphs,
    alerts: read(ALERTS).map(plain).filter(Boolean).slice(0, 4),
    recommendations: read(RECOMMENDATIONS).map(plain).filter(Boolean).slice(0, 6),
  };
}

/**
 * Lee lo que escribió la IA, venga como venga: JSON limpio, JSON dentro de un
 * bloque de código, con los campos con tilde o en inglés, con listas como
 * texto, cortado a medias, o solo texto. Nunca deja llaves ni comillas del
 * JSON en el documento.
 */
export function parseAnalysis(raw: string): AnalysisPart {
  const text = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = fromData(JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>);
      if (parsed) return parsed;
    } catch {
      /* JSON mal formado o cortado: se rescata abajo */
    }
  }
  if (start >= 0) {
    const rescued = rescue(text.slice(start));
    if (rescued) return rescued;
  }
  const paragraphs = plain(text.replace(/[{}[\]]/g, ""))
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^"?\w+"?\s*:\s*$/.test(p))
    .slice(0, 10);
  return { summary: "", paragraphs, alerts: [], recommendations: [] };
}

/** Todo el texto de una parte, para verificar sus cifras. */
export const analysisText = (part: AnalysisPart) =>
  // Las citas («[2]») no son cifras: no se verifican.
  [part.summary, ...part.paragraphs, ...part.alerts, ...part.recommendations].join("\n").replace(/\[\d{1,2}\]/g, "");
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
    need?: NeedInput;
    analysis?: {
      brief?: Record<string, unknown>;
      part?: string;
      title?: string;
      facts?: string;
      pdi?: boolean;
      fresh?: boolean;
      /** El nombre del documento (los informes de Impacto). */
      doc?: string;
      /** Informes de Impacto: de qué unidad es (programa, facultad o vicerrectoría). */
      scope?: { kind?: string; ref?: string; campus?: string | null };
    };
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "El pedido no es JSON." }, 400);
  }
  const requested = body.action;
  if (!requested || !["resumir", "sintetizar", "explicar", "voz", "probar", "preguntar", "calificar", "entender", "analizar"].includes(requested)) {
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
  const rulesOf = settings as unknown as Rules;
  const allowed = canUse(rulesOf, portal, action, role);
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

  /** La malla alrededor de unos pasajes: su ruta hacia arriba y lo que contienen. Sin 0097, vacía. */
  async function meshAround(ids: string[], sources: string[]): Promise<Mesh> {
    if (!ids.length) return { nodes: [], edges: [] };
    const { data, error } = await admin.rpc("pilo_graph_around", { p_ids: ids, p_sources: sources, p_up: 6, p_down: 1, p_limit: 160 });
    if (error || !data) return { nodes: [], edges: [] };
    const raw = data as { nodes?: MeshNode[] | null; edges?: MeshEdge[] | null };
    return { nodes: raw.nodes ?? [], edges: raw.edges ?? [] };
  }

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

    // 3b. La malla (0097): dónde queda cada pasaje y qué contiene. Sin 0097, vacía.
    const mesh = await meshAround(passages.map((p) => p.ref), sources);
    const inMesh = passages.filter((p) => mesh.nodes.some((n) => n.id === p.ref));
    const drawFor = (ref: string | undefined) => (ref && mesh.nodes.some((n) => n.id === ref) ? { graph: focusMesh(mesh, ref) } : {});
    if (isStructural(question) && inMesh.length) {
      const focus = inMesh[0];
      const text = describeNode(mesh, focus.ref);
      if (text) {
        step("Malla", "ok", `La pregunta es de estructura: respondo con la malla de «${focus.title}».`);
        step("IA", "skip", "No hizo falta.");
        return reply("malla", text, [focus], drawFor(focus.ref));
      }
    }
    if (mesh.nodes.length) step("Malla", "ok", `Ubiqué ${inMesh.length} de los pasajes en la malla.`);

    // 4. La IA redacta, si está conectada y hay cupo; si no, los pasajes tal cual.
    const aiOn = connected && settings.enabled && (settings.functions ?? {}).preguntar !== false;
    const noAi = !aiOn ? "La IA está apagada: respondo con los pasajes tal cual." : (await overLimit()) ? "Se acabó el cupo de IA de hoy: respondo con los pasajes tal cual." : "";
    if (noAi) {
      step("IA", "skip", noAi);
      return reply("extracto", extractAnswer(passages), passages.slice(0, 2), drawFor(passages[0]?.ref));
    }
    const response = await callProvider(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: buildAskMessages(question, passages, history, mapContext(mesh, passages.map((p) => p.ref))),
        temperature: 0.2,
        max_tokens: 600,
        ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await providerDetail(response);
      await log(`error ${response.status}`, `${question} · ${detail}`);
      step("IA", "skip", `El proveedor no respondió (${response.status}): respondo con los pasajes tal cual.`);
      return reply("extracto", extractAnswer(passages), passages.slice(0, 2), drawFor(passages[0]?.ref));
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
    return json({ kind: "ia", text: cited.text, sources: cited.passages.map(shape), trail, answerId, verified: check.verified, unknown: check.unknown, ...drawFor(cited.passages[0]?.ref) });
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

    // --- Mr. Pilo Bot: entender lo que necesita un programa ------------------------------
    // --- Análisis de los datos: un capítulo del boletín a la vez ----------------------
    // Las cifras llegan ya calculadas desde el boletín (sin IA); aquí solo se
    // escribe y se verifica que cada número del texto esté en esas cifras.
    if (action === "analizar") {
      const a = body.analysis;
      const b = a?.brief;
      if (!a || typeof a.facts !== "string" || a.facts.trim().length < 10 || !b) {
        return json({ error: "No llegaron cifras para analizar." }, 400);
      }
      // Informes de Impacto (0100): fuera de la administración, solo si ella los
      // abrió para ese tipo de unidad y la persona pertenece a la unidad. Lo
      // decide la base con la sesión de quien pide (imp_report_allowed).
      if (portal === "impacto" && role !== "admin") {
        const scope = a.scope ?? {};
        const kind = String(scope.kind ?? "");
        if (!REPORT_KINDS.includes(kind as ReportKind) || !scope.ref) return json({ error: "Falta la unidad del informe." }, 400);
        if (rulesOf.impacto_report?.[kind as ReportKind] !== true) {
          return json({ error: "Ese tipo de informe es, por ahora, solo de la administración." }, 403);
        }
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!anonKey) return json({ error: "La función no está configurada correctamente." }, 500);
        const asUser = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: allowedHere, error: scopeError } = await asUser.rpc("imp_report_allowed", {
          p_kind: kind,
          p_ref: String(scope.ref).slice(0, 80),
          p_campus: scope.campus ? String(scope.campus) : null,
        });
        if (scopeError || allowedHere !== true) return json({ error: "Solo puede pedir informes de las unidades a las que pertenece." }, 403);
      }
      const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
      const brief: AnalysisBrief = {
        format: pick(b.format, ["ejecutivo", "tecnico", "sedes", "tendencias", "libre"] as const, "ejecutivo"),
        audience: String(b.audience ?? "").slice(0, 80),
        tone: pick(b.tone, ["institucional", "divulgativo", "tecnico"] as const, "institucional"),
        length: pick(b.length, ["breve", "estandar", "extenso"] as const, "estandar"),
        alerts: b.alerts !== false,
        recommendations: b.recommendations !== false,
        method: b.method === true,
        prompt: String(b.prompt ?? "").slice(0, 1200),
      };
      const input: AnalysisInput = {
        brief,
        part: a.part === "cierre" ? "cierre" : "capitulo",
        title: String(a.title ?? "").slice(0, 160),
        facts: String(a.facts).slice(0, 9000),
        ...(typeof a.doc === "string" && a.doc.trim() ? { doc: a.doc.trim().slice(0, 160) } : {}),
      };
      // Cruzar con el Plan de Desarrollo: los pasajes del PDI que más se parecen al capítulo.
      if (a.pdi === true) {
        const { data } = await admin.rpc("pilo_memory_search", { p_q: `${input.title} ${brief.prompt}`.slice(0, 300), p_sources: ["pdi"], p_limit: 4 });
        const rows = (data ?? []) as Passage[];
        if (rows.length) input.context = rows.map((r) => `· ${r.title}${r.section ? ` › ${r.section}` : ""}: ${r.body.slice(0, 500)}`).join("\n");
      }
      const key = await sha256(JSON.stringify(["analizar", target.model, input]));
      if (settings.cache_days > 0 && a.fresh !== true) {
        const { data: hit } = await admin.from("pilo_ai_cache").select("result, created_at").eq("key", key).maybeSingle();
        if (hit && Date.now() - new Date(hit.created_at).getTime() < settings.cache_days * 86400_000) {
          await log("listo", `analizar · ${input.title}`, true);
          return json({ ...hit.result, cached: true });
        }
      }
      const response = await callProvider(target.url, {
        method: "POST",
        headers,
        // Un capítulo largo en un proveedor lento puede tardar: se corta antes del límite de la función.
        signal: AbortSignal.timeout(130_000),
        body: JSON.stringify({
          model: target.model,
          messages: buildAnalysisMessages(input),
          temperature: 0.3,
          max_tokens: ANALYSIS_SIZE[brief.length].tokens,
          ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
        }),
      }).catch((error: unknown) => {
        if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) return null;
        throw error;
      });
      if (!response) {
        await log("error tiempo", `analizar · ${input.title}`);
        return json({ error: "El proveedor tardó demasiado en escribir este capítulo. Vuelva a intentarlo o elija una longitud más corta.", code: "tiempo" }, 504);
      }
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `analizar · ${detail}`);
        if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
        return json({ error: `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}.`, code: "proveedor" }, 502);
      }
      const data = await response.json();
      const part = parseAnalysis(String(data?.choices?.[0]?.message?.content ?? ""));
      if (!part.paragraphs.length) {
        await log("error vacio", `analizar · ${input.title}`);
        return json({ error: "La IA no devolvió texto para este capítulo. Vuelva a intentarlo.", code: "vacio" }, 502);
      }
      const check = verifyNumbers(analysisText(part), input.facts);
      const truncated = data?.choices?.[0]?.finish_reason === "length";
      const result = { ...part, verified: check.verified, unknown: check.unknown, model: target.model, truncated };
      if (settings.cache_days > 0) await admin.from("pilo_ai_cache").upsert({ key, result, created_at: new Date().toISOString() });
      await log("listo", `analizar · ${input.title}`);
      return json({ ...result, cached: false });
    }

    if (action === "entender") {
      const need = body.need;
      if (!need || typeof need.text !== "string" || need.text.trim().length < 3 || !Array.isArray(need.goals) || !Array.isArray(need.indicators)) {
        return json({ error: "Escriba lo que necesita el programa." }, 400);
      }
      const clean: NeedInput = {
        program: String(need.program ?? "").slice(0, 160),
        text: need.text.replace(/\s+/g, " ").trim().slice(0, 800),
        goals: need.goals.slice(0, 30).map((g) => ({ id: String(g.id).slice(0, 40), fn: String(g.fn).slice(0, 20), title: String(g.title).slice(0, 160) })),
        indicators: need.indicators.slice(0, 40).map((i) => ({ id: String(i.id).slice(0, 60), code: String(i.code).slice(0, 20), name: String(i.name).slice(0, 200), fn: String(i.fn).slice(0, 20), stage: String(i.stage).slice(0, 20) })),
      };
      const key = await sha256(JSON.stringify(["entender", target.model, clean]));
      if (settings.cache_days > 0) {
        const { data: hit } = await admin.from("pilo_ai_cache").select("result, created_at").eq("key", key).maybeSingle();
        if (hit && Date.now() - new Date(hit.created_at).getTime() < settings.cache_days * 86400_000) {
          await log("listo", `entender · ${clean.text}`, true);
          return json({ ...hit.result, cached: true });
        }
      }
      const response = await callProvider(target.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: target.model,
          messages: buildNeedMessages(clean),
          temperature: 0.1,
          max_tokens: 700,
          ...(settings.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) {
        const detail = await providerDetail(response);
        await log(`error ${response.status}`, `entender · ${detail}`);
        if (response.status === 429) return json({ error: LIMIT_429, code: "limite_proveedor" }, 429);
        return json({ error: `El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}.`, code: "proveedor" }, 502);
      }
      const data = await response.json();
      const result = parseNeed(String(data?.choices?.[0]?.message?.content ?? ""), new Set(clean.goals.map((g) => g.id)), new Set(clean.indicators.map((i) => i.id)));
      if (settings.cache_days > 0 && (result.goals.length || result.indicators.length)) {
        await admin.from("pilo_ai_cache").upsert({ key, result, created_at: new Date().toISOString() });
      }
      await log("listo", `entender · ${clean.text}`);
      return json({ ...result, cached: false });
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
