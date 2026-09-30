/* =============================================================================
   Mr. Pilo con IA · las reglas, sin red ni base.

   Lo usan el portal y Vitest, y va copiado dentro de la función del servidor
   (supabase/functions/pilo-ia/index.ts: el editor de Supabase solo acepta un
   archivo; la prueba logic-sync vigila que sean iguales). Aquí se decide:
   - si quien pregunta puede usar esa función en ese portal (canUse);
   - qué se le pide al modelo y con qué límites (buildMessages);
   - cómo se lee la respuesta aunque no venga como JSON limpio (parseAnswer);
   - si cada número que dice el resumen aparece en los datos (verifyNumbers);
   - en «Pregúntele a Pilo», qué se responde sin IA (ruleFor, extractAnswer)
     y cómo se le pregunta al modelo con los pasajes de la memoria (buildAskMessages).
   ========================================================================== */

export type Action = "resumir" | "sintetizar" | "explicar" | "voz" | "probar" | "preguntar" | "entender" | "analizar" | "indexar";
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
export const FN_OF: Record<Exclude<Action, "probar" | "indexar">, Fn> = { resumir: "resumir", sintetizar: "sintetizar", explicar: "explicar", voz: "leer", preguntar: "preguntar", entender: "sintetizar", analizar: "sintetizar" };

/** ¿Puede esta persona (null = sin sesión) usar la acción en el portal? */
export function canUse(rules: Rules, portal: string, action: Action, role: Role | null): { ok: true } | { ok: false; reason: string } {
  if (action === "probar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración prueba la conexión." };
  // Indexar la memoria por significado (0108): mantenimiento de la administración, con o sin IA encendida.
  if (action === "indexar") return role === "admin" ? { ok: true } : { ok: false, reason: "Solo la administración indexa la memoria de Pilo." };
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
  "Si la pregunta sigue la conversación (pide un dato más específico sobre lo que ya respondiste: una sede, un año, un periodo, una comparación), respóndela en ese contexto, sin repetir lo ya dicho.",
  "Después de cada dato pon entre corchetes el número del pasaje de donde sale, por ejemplo [1] o [2].",
  "Di el corte o periodo de las cifras cuando el pasaje lo trae.",
  "No evadas: si los pasajes traen solo parte de lo pedido, responde con esa parte y di con claridad qué no está publicado; en ese caso sin_datos va en false.",
  "Marca sin_datos en true solo si ningún pasaje trae nada de lo que se pregunta.",
  'Formato: {"respuesta":"...","sin_datos":false}',
].join(" ");

export function buildAskMessages(question: string, passages: Passage[], history: { q: string; a: string }[] = [], map = "") {
  const body = passages
    .map((p, i) => `[${i + 1}] ${p.title}${p.section ? ` · ${p.section}` : ""}${p.cut ? ` (corte ${p.cut})` : ""}\n${p.body.slice(0, 1600)}`)
    .join("\n\n");
  const before = history
    .slice(-2)
    .map((h) => `Antes preguntaron: ${h.q.slice(0, 200)}\nY respondiste: ${h.a.slice(0, 600)}`)
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

/* --- Las cifras en vivo (0107) --------------------------------------------------------
   La memoria guarda de cada indicador su última cifra; `pilo_facts` guarda la
   serie entera (año, periodo y sede), armada con el mismo cálculo del portal.
   Con ella Pilo da la cifra exacta que se pidió («matriculados en Cúcuta en
   2023-2»). Aquí se decide qué corte se pidió, qué cifras se muestran y cómo
   se dicen, con o sin IA. */

export type FactTerm = "A" | "B";

/** Una cifra de la serie: año, periodo (null = el año), sede ("" = toda la UDES) y valor. */
export interface FactPoint {
  y: number;
  t: FactTerm | null;
  c: string;
  v: number;
}

/** Un indicador de UDES en Cifras con su serie completa. */
export interface Fact {
  ref: string;
  report: string;
  label: string;
  unit: string;
  format: string;
  definition: string;
  office: string;
  path: string;
  period: string;
  illustrative: boolean;
  series: FactPoint[];
}

/** El corte que pide la pregunta. */
export interface Slots {
  years: number[];
  term: FactTerm | null;
  campus: string[];
  /** «por sede», «cada campus»: todas las sedes. */
  byCampus: boolean;
}

const CAMPUS_GENERIC = new Set(["campus", "sede", "seccional", "udes", "ciudad", "extension"]);

/** Las palabras con que se reconoce una sede en una pregunta: «Campus Cúcuta» → cucuta. */
function campusWords(name: string): string[] {
  const words = normalizeQuestion(name)
    .split(" ")
    .filter((w) => w.length >= 4 && !CAMPUS_GENERIC.has(w));
  return words.includes("bucaramanga") ? [...words, "bga"] : words;
}

/** ¿Dos nombres son la misma sede? «Campus Cúcuta» y «Cúcuta» lo son. */
export function sameCampus(a: string, b: string): boolean {
  if (normalizeQuestion(a) === normalizeQuestion(b)) return true;
  const x = campusWords(a);
  return x.length > 0 && campusWords(b).some((w) => x.includes(w));
}

/**
 * Las sedes que Pilo reconoce: las de las series (con el nombre que usan las
 * cifras) y las demás de la universidad, aunque no tengan cifras publicadas.
 * Así «¿y en Cúcuta?» se entiende, y si no hay cifra, se dice.
 */
export function knownCampuses(series: string[], others: string[]): string[] {
  const out = [...new Set(series.map((c) => c.trim()).filter(Boolean))];
  for (const name of others.map((c) => c.trim()).filter(Boolean)) if (!out.some((c) => sameCampus(c, name))) out.push(name);
  return out;
}

/** Sede, año y periodo que pide la pregunta. Sin nada de eso, los campos quedan vacíos. */
export function parseSlots(question: string, campuses: string[]): Slots {
  const t = normalizeQuestion(question);
  const years = [...new Set((t.match(/\b20\d\d\b/g) ?? []).map(Number))].sort((a, b) => a - b);
  let term: FactTerm | null = null;
  // «2023-2» llega como «2023 2»; «de 2023 a 2025» no es un periodo A.
  if (/\b(primer|1er|1)( semestre| periodo)\b|\b(semestre|periodo) (1|uno|a)\b|\b20\d\d 1\b/.test(t)) term = "A";
  else if (/\b(segundo|2do|2)( semestre| periodo)\b|\b(semestre|periodo) (2|dos|b)\b|\b20\d\d 2\b/.test(t)) term = "B";
  const campus = campuses.filter((name) => campusWords(name).some((w) => new RegExp(`\\b${w}\\b`).test(t)));
  const byCampus = /\bpor (sede|campus|seccional)|\b(cada|todas las|todos los|las|los) (sedes|campus|seccionales)\b|\bsedes\b/.test(t);
  return { years, term, campus, byCampus };
}

export const hasSlots = (s: Slots) => s.years.length > 0 || s.term !== null || s.campus.length > 0 || s.byCampus;

/**
 * ¿La pregunta sigue la anterior? «¿Y en Cúcuta?», «¿y en 2023?», «¿eso cómo
 * se compara?»: empieza con «y», se refiere a algo ya dicho o es corta y solo
 * cambia el corte.
 */
export function isFollowUp(question: string, campuses: string[]): boolean {
  const t = normalizeQuestion(question);
  if (!t) return false;
  if (/^(y|e|pero|ahora|tambien|entonces)\b/.test(t)) return true;
  if (/\b(eso|esa|ese|esos|esas|esto|aquello|lo mismo|el anterior|la anterior|ahi|alli)\b/.test(t)) return true;
  return t.split(" ").length <= 4 && hasSlots(parseSlots(question, campuses));
}

/** El corte de una pregunta de seguimiento: lo que dice ahora manda; lo que calla, lo pone la anterior. */
export function mergeSlots(before: Slots, now: Slots): Slots {
  const place = now.campus.length > 0 || now.byCampus;
  return {
    years: now.years.length ? now.years : before.years,
    term: now.term ?? (now.years.length ? null : before.term),
    campus: place ? now.campus : before.campus,
    byCampus: place ? now.byCampus : before.byCampus,
  };
}

/** Las palabras de la pregunta más las que usan los informes: «alumnos» también busca «estudiantes». */
const SYNONYMS: [RegExp, string][] = [
  [/\balumn[oa]s?\b|\bestudiantado\b/, "estudiantes"],
  [/\bprofesor(es|as?)?\b|\bmaestros?\b/, "docentes"],
  [/\bmatricul/, "matriculados estudiantes"],
  [/\binscrit|\baspirant/, "inscritos aspirantes"],
  [/\bgraduad|\begresad|\bgrados?\b/, "graduados"],
  [/\bdesert|\babandon|\bretir/, "desercion"],
  [/\bpermanen|\bretencion/, "permanencia"],
  [/\bcarreras?\b|\bpregrados?\b/, "programas"],
  [/\bsedes?\b|\bseccional/, "campus"],
  [/\bprimiparos?\b|\bnuevos\b|\bprimer ingreso\b/, "primer curso nuevos"],
  [/\binvestigador|\bgrupos? de investigacion/, "investigacion"],
];

export function expandQuery(question: string): string {
  const t = normalizeQuestion(question);
  const extra = SYNONYMS.filter(([re]) => re.test(t)).map(([, add]) => add);
  return [question, ...extra].join(" ").slice(0, 600);
}

/** ¿Pide una cifra? */
export const wantsFigure = (question: string) =>
  /\b(cuant[oa]s?|numero|cantidad|total|tasa|porcentaje|indice|cifras?|promedio|valor|evolucion|como (va|fue|ha|esta)|comportamiento|crecio|aumento|bajo|disminuy)/.test(normalizeQuestion(question));

/**
 * ¿Dos preguntas piden el mismo corte? Una respuesta guardada de 2024 no
 * sirve para 2023 aunque las dos preguntas se parezcan en todo lo demás.
 */
export function sameCut(a: string, b: string, campuses: string[]): boolean {
  const x = parseSlots(a, campuses);
  const y = parseSlots(b, campuses);
  const places = (s: Slots) => s.campus.map((c) => campusWords(c).join(" ") || normalizeQuestion(c)).sort().join("|");
  return x.years.join() === y.years.join() && x.term === y.term && places(x) === places(y) && x.byCampus === y.byCampus;
}

const termText = (t: FactTerm) => (t === "A" ? "1" : "2");
export const cutText = (p: Pick<FactPoint, "y" | "t">) => (p.t ? `${p.y}-${termText(p.t)}` : String(p.y));
const placeText = (c: string) => c || "toda la UDES";
const INTEGER = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** La cifra como la escribe el portal: «1.234 estudiantes», «12,5 %». */
export function figureText(value: number, format: string, unit: string): string {
  const f = format === "entero" ? INTEGER.format(value) : DECIMAL.format(value);
  return format === "porcentaje" || unit.trim() === "%" ? `${f} %` : `${f} ${unit.trim()}`.trim();
}

/**
 * Las cifras del indicador para ese corte. Sin sede, toda la UDES; sin año,
 * los dos últimos con dato (uno solo si se comparan sedes); sin periodo, la
 * cifra del año. Lo pedido que no está se devuelve en `missing`: un dato sin
 * reportar no es un cero.
 */
export function pickCuts(fact: Fact, slots: Slots, max = 8): { points: FactPoint[]; missing: string[] } {
  // El total de la UDES va con sede "": solo es igual a otro "".
  const same = (a: string, b: string) => (a && b ? sameCampus(a, b) : a === b);
  const sedes = [...new Set(fact.series.map((p) => p.c).filter(Boolean))];
  let places = slots.campus.length ? slots.campus : slots.byCampus ? sedes : [""];
  let pool = fact.series.filter((p) => places.some((c) => same(p.c, c)));
  // Un indicador sin total de la UDES (no se suma entre sedes): se dan las sedes.
  if (!pool.length && !slots.campus.length) {
    places = sedes;
    pool = fact.series.filter((p) => p.c);
  }
  const annual = pool.filter((p) => p.t === null);
  let chosen = slots.term ? pool.filter((p) => p.t === slots.term) : annual.length ? annual : pool.filter((p) => p.t !== null);
  const missing: string[] = [];
  if (slots.years.length) {
    chosen = chosen.filter((p) => slots.years.includes(p.y));
    // Un año falta si no está en las sedes que sí tienen cifras; si ninguna sede
    // pedida tiene cifras, lo que falta es la sede, no el año.
    const withData = pool.length > 0;
    for (const y of slots.years) {
      const absent = withData ? !chosen.some((p) => p.y === y) : !fact.series.some((p) => p.y === y);
      if (absent) missing.push(slots.term ? `${y}-${termText(slots.term)}` : String(y));
    }
  } else {
    const keep = places.length > 1 ? 1 : 2;
    const recent = [...new Set(chosen.map((p) => p.y))].sort((a, b) => b - a).slice(0, keep);
    chosen = chosen.filter((p) => recent.includes(p.y));
  }
  for (const c of slots.campus) if (!chosen.some((p) => same(p.c, c)) && !missing.includes(c)) missing.push(c);
  const order = (p: FactPoint) => places.findIndex((c) => same(p.c, c));
  chosen.sort((a, b) => order(a) - order(b) || b.y - a.y || (a.t ?? "").localeCompare(b.t ?? ""));
  return { points: chosen.slice(0, max), missing };
}

const pointLine = (fact: Fact, p: FactPoint) => `${placeText(p.c)}, ${cutText(p)}: ${figureText(p.v, fact.format, fact.unit)}`;
const asSentence = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  return t ? `${t}.` : "";
};

/** Las cifras elegidas como un pasaje más, para citarlo igual que la memoria. */
export function factPassage(fact: Fact, points: FactPoint[], missing: string[]): Passage {
  const body = [
    `${fact.label}${fact.report ? ` (informe ${fact.report})` : ""}.`,
    points.length ? `${points.map((p) => pointLine(fact, p)).join("; ")}.` : "",
    missing.length ? `Sin cifra publicada para ${missing.join(", ")}: un dato sin reportar no es un cero.` : "",
    fact.definition ? `Qué mide: ${asSentence(fact.definition)}` : "",
    fact.office ? `Lo reporta ${asSentence(fact.office)}` : "",
    fact.illustrative ? "Cifras marcadas como dato ilustrativo en el portal." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ref: `dato:${fact.ref}`,
    source: "cifras",
    title: fact.label,
    section: `Cifras de UDES en Cifras${fact.report ? ` · Informe ${fact.report}` : ""}`,
    body,
    path: fact.path,
    cut: [...new Set(points.map(cutText))].join(", ").slice(0, 60),
    office: fact.office,
  };
}

/** Sin IA: la cifra dicha con una plantilla, con su cita. Nada inventado. */
export function dataAnswer(fact: Fact, points: FactPoint[], missing: string[]): string {
  const parts: string[] = [];
  if (points.length === 1) {
    const p = points[0];
    parts.push(`Según UDES en Cifras, «${fact.label}» en ${placeText(p.c)} fue ${figureText(p.v, fact.format, fact.unit)} en ${cutText(p)} [1].`);
  } else if (points.length) {
    parts.push(`Según UDES en Cifras, «${fact.label}»: ${points.map((p) => pointLine(fact, p)).join("; ")} [1].`);
  }
  if (missing.length) parts.push(`${points.length ? "No hay" : `«${fact.label}» no tiene`} cifra publicada para ${missing.join(", ")}: un dato sin reportar no es un cero.${points.length ? "" : " [1]"}`);
  if (fact.illustrative) parts.push("Ojo: el portal marca estas cifras como dato ilustrativo.");
  return parts.join(" ");
}

/**
 * Entender con IA, solo cuando las reglas no alcanzan: la pregunta se refiere
 * a algo ya dicho («¿eso cómo se compara?») o nada coincidió. El modelo no
 * responde: reescribe la pregunta para que se entienda sola y propone
 * palabras para buscar.
 */
export function buildUnderstandMessages(question: string, history: { q: string; a: string }[] = []) {
  const before = history
    .slice(-2)
    .map((h) => `Antes preguntaron: ${h.q.slice(0, 200)}\nY se respondió: ${h.a.slice(0, 300)}`)
    .join("\n");
  return [
    { role: "system", content: "Ayudas al buscador de Mr. Pilo, el guía de datos de la Universidad de Santander (UDES). No respondes preguntas: las preparas para buscar. Responde solo con el JSON que se pide." },
    {
      role: "user",
      content: [
        "Si la pregunta depende de la conversación (por ejemplo «¿y en Cúcuta?», «¿y el año pasado?», «¿y por programa?», «¿eso cómo se compara?»), reescríbela para que se entienda sola: con el indicador, la sede, el año y el periodo de lo que se venía hablando, cambiando solo lo que ahora se pide.",
        "Si no depende, déjala igual. Después da hasta 6 palabras clave o sinónimos como los usaría un informe institucional (por ejemplo: alumnos → estudiantes matriculados).",
        'Formato: {"pregunta":"...","buscar":["..."]}',
        before ? `\n${before}` : "",
        `\nPregunta: ${question.slice(0, 500)}`,
      ].join("\n"),
    },
  ];
}

/* --- Búsqueda por significado (0108) ---------------------------------------------------
   Cada pasaje de la memoria y cada indicador de las cifras en vivo guardan un
   vector (embedding) que dice de qué habla. La pregunta se convierte en otro
   vector y se buscan los más cercanos: así «¿cuántos se fueron?» encuentra
   «tasa de deserción» aunque no compartan palabras. No reemplaza la búsqueda
   por palabras, que acierta mejor con nombres propios y códigos: las dos
   listas se funden (fusión por rangos recíprocos). */

/** Las dimensiones del vector: la columna de la base es vector(1024). */
export const EMBED_DIM = 1024;
/** Por debajo de este parecido (coseno) un pasaje no cuenta como cercano. */
export const SEMANTIC_MIN = 0.3;
/**
 * Una respuesta oficial del catálogo se da por significado solo si se parece
 * mucho (0109): es la palabra de Planeación y no debe darse a una pregunta
 * que solo roza el tema.
 */
export const CATALOG_SEMANTIC_MIN = 0.8;

export interface EmbedTarget {
  url: string;
  model: string;
  /** NVIDIA pide decir si el texto es pregunta o pasaje, y cuántas dimensiones. */
  nvidia: boolean;
}

/** Quién ofrece embeddings con la misma clave del texto. Los demás proveedores no buscan por significado. */
export const EMBED_PRESETS: Record<string, EmbedTarget> = {
  // NVIDIA retira modelos seguido (llama-3.2-nv-embedqa-1b-v2 en mayo, llama-nemotron-embed-1b-v2 en
  // agosto de 2026): la administración puede elegir otro con «Ver modelos disponibles».
  nvidia: { url: "https://integrate.api.nvidia.com/v1/embeddings", model: "nvidia/nemotron-3-embed-1b", nvidia: true },
  mistral: { url: "https://api.mistral.ai/v1/embeddings", model: "mistral-embed", nvidia: false },
};

export const embedTarget = (provider: string): EmbedTarget | null => EMBED_PRESETS[provider] ?? null;

/**
 * El pedido de embeddings. «full»: con dimensiones y recorte (NVIDIA);
 * «plain»: solo pregunta o pasaje, para el modelo que no acepta lo demás.
 */
export function embedBody(target: EmbedTarget, input: string[], kind: "query" | "passage", mode: "full" | "plain" = "full") {
  if (!target.nvidia) return { model: target.model, input };
  return mode === "full"
    ? { model: target.model, input, input_type: kind, dimensions: EMBED_DIM, truncate: "END", encoding_format: "float" }
    : { model: target.model, input, input_type: kind };
}

/**
 * El vector a la medida de la base (1024). Uno más largo se recorta y se
 * normaliza: los modelos de embeddings de NVIDIA se entrenan para que sus
 * primeras dimensiones basten (Matryoshka). Uno más corto no sirve.
 */
export function fitVector(v: number[]): number[] | null {
  if (v.length === EMBED_DIM) return v;
  if (v.length < EMBED_DIM) return null;
  const cut = v.slice(0, EMBED_DIM);
  const norm = Math.sqrt(cut.reduce((sum, x) => sum + x * x, 0));
  return norm > 0 ? cut.map((x) => x / norm) : null;
}

/** ¿El proveedor dice que el modelo ya no existe (retirado o mal escrito)? */
export const modelGone = (status: number, detail: string) => status === 410 || status === 404 || /end of life|no longer available|not found|does not exist/i.test(detail);

/** De la lista de modelos del proveedor (/v1/models), los de embeddings. */
export function embedModelsIn(data: unknown): string[] {
  const list = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((m) => String((m as { id?: unknown })?.id ?? "")).filter((id) => /embed/i.test(id)))].sort();
}

/** Los vectores de la respuesta, en el orden de lo enviado y a la medida de la base; null si falta uno o es corto. */
export function parseEmbeddings(data: unknown, count: number): number[][] | null {
  const list = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(list) || list.length !== count) return null;
  const out: number[][] = new Array(count);
  for (const [i, item] of list.entries()) {
    const row = item as { index?: unknown; embedding?: unknown };
    const at = typeof row.index === "number" ? row.index : i;
    const v = row.embedding;
    if (!Array.isArray(v) || !v.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
    const fit = fitVector(v as number[]);
    if (!fit || at < 0 || at >= count) return null;
    out[at] = fit;
  }
  return out.every(Boolean) ? out : null;
}

/** El vector como lo lee pgvector: «[0.1,0.2,…]». */
export const vectorText = (v: number[]) => `[${v.map((x) => Number(x.toFixed(6))).join(",")}]`;

/**
 * Funde la búsqueda por palabras y la de significado. Cada lista aporta
 * 1/(k + puesto); un pasaje que está en las dos suma ambas. `rank` queda
 * de 0 a 1 frente al primero, como lo usa el resto de la página.
 */
export function fuseHits<T extends { ref: string }>(
  lexical: (T & { rank: number })[],
  semantic: (T & { sim: number })[],
  k = 60,
): (T & { rank: number; via: "palabras" | "significado" | "ambas"; sim?: number })[] {
  const score = new Map<string, { row: T; s: number; lex: boolean; sem: boolean; sim?: number }>();
  lexical.forEach((row, i) => score.set(row.ref, { row, s: 1 / (k + i + 1), lex: true, sem: false }));
  semantic.forEach((row, i) => {
    const had = score.get(row.ref);
    if (had) Object.assign(had, { s: had.s + 1 / (k + i + 1), sem: true, sim: row.sim });
    else score.set(row.ref, { row, s: 1 / (k + i + 1), lex: false, sem: true, sim: row.sim });
  });
  const sorted = [...score.values()].sort((a, b) => b.s - a.s);
  const top = sorted[0]?.s ?? 1;
  return sorted.map(({ row, s, lex, sem, sim }) => {
    const { sim: _drop, ...rest } = row as T & { sim?: number };
    return { ...(rest as T), rank: s / top, via: lex && sem ? "ambas" : lex ? "palabras" : "significado", ...(sim !== undefined ? { sim } : {}) };
  });
}

export function parseUnderstand(raw: string, fallback: string): { question: string; terms: string[] } {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(text.slice(start, end + 1)) as { pregunta?: unknown; buscar?: unknown };
      const question = typeof data.pregunta === "string" && data.pregunta.trim().length >= 2 ? data.pregunta.replace(/\s+/g, " ").trim().slice(0, 500) : fallback;
      const terms = (Array.isArray(data.buscar) ? data.buscar : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/\s+/g, " ").trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6);
      return { question, terms };
    } catch {
      /* no era JSON */
    }
  }
  return { question: fallback, terms: [] };
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
 * Palabras de relleno que no hacen falta para reconocer un disparador: la gente
 * pregunta de tú o de usted, con artículo o sin él («eres una IA», «¿es usted IA?»).
 */
const TRIGGER_FILLER = new Set(
  (
    "el la los las lo un una unos unas al del de a en con por para sin sobre y o u que " +
    "tu tus te ti usted ustedes vos su sus se me mi mis nos le les yo " +
    "es eres soy son ser sos esta estas estan estoy"
  ).split(" "),
);

/** La raíz corta de una palabra: sin plural, sin «n» de verbo y sin la última vocal (novia, novio → novi). */
function triggerStem(word: string): string {
  if (word.length <= 3) return word;
  const stem = word.replace(/(es|s|n)$/, "").replace(/[aeo]$/, "");
  return stem.length >= 3 ? stem : word;
}

/** Una palabra del disparador está en la pregunta: igual, como comienzo de otra o con la misma raíz. */
function triggerWordIn(word: string, questionWords: string[]): boolean {
  const stem = triggerStem(word);
  return questionWords.some((q) => q.startsWith(word) || (q.length >= 4 && q.length >= word.length - 2 && word.startsWith(q)) || triggerStem(q) === stem);
}

/**
 * ¿La pregunta trae el disparador? Todas sus palabras, sin tildes ni
 * mayúsculas y en cualquier orden, sin contar las de relleno y admitiendo
 * plurales, femeninos y el tú o el usted («salario rector» dispara con «¿cuál
 * es el salario del rector?»; «tienes pareja», con «¿Pilo tiene parejas?»).
 */
export function hasTrigger(qnorm: string, trigger: string): boolean {
  const all = normalizeQuestion(trigger).split(" ").filter((w) => w.length >= 2);
  // Si todo es relleno («eres tú»), se exigen todas las palabras tal cual.
  const words = all.filter((w) => !TRIGGER_FILLER.has(w));
  const needed = words.length ? words : all;
  if (!needed.length) return false;
  const questionWords = qnorm.split(" ").filter(Boolean);
  return needed.every((w) => triggerWordIn(w, questionWords));
}

/** Lo específico de un disparador: cuántas palabras suyas no son de relleno. */
const triggerWeight = (trigger: string) => {
  const all = normalizeQuestion(trigger).split(" ").filter((w) => w.length >= 2);
  return all.filter((w) => !TRIGGER_FILLER.has(w)).length || all.length;
};

/** Quita frases de cortesía o relleno conversacional al inicio o final de una pregunta. */
export function stripConversational(qnorm: string): string {
  let s = qnorm;
  const prefixes = [
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches)(\s+pilo)?\b\s*/,
    /^(mr\s+pilo|pilo)\b\s*/,
    /^(por favor|porfa)\b\s*/,
    /^(me puedes decir|puedes decirme|podrias decirme|podrías decirme)\b\s*/,
    /^(quisiera saber|quiero saber|me gustaria saber|me gustaría saber)\b\s*/,
    /^(cuentame|cuéntame|dime|explicame|explícame|ayudame|ayúdame)\b\s*/,
    /^(tengo una pregunta|tengo una duda|una pregunta|una consulta)\b\s*/,
    /^(sabe usted|sabes)\b\s*/,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      const next = s.replace(p, "").trim();
      if (next !== s && next.length >= 2) {
        s = next;
        changed = true;
      }
    }
  }
  s = s.replace(/\s+(por favor|porfa|gracias)$/, "").trim();
  return s || qnorm;
}

/** Palabras comunes en preguntas que no definen el tema de la consulta. */
export const QUESTION_STOP = new Set(
  (
    "como cual cuales cuanto cuanta cuantos cuantas donde cuando quien quienes que " +
    "hay tiene tienen existe existen sirve significa sobre de del al en para por " +
    "el la los las un una unos unas"
  ).split(" "),
);

/** Extrae las palabras clave esenciales de una pregunta, sin cortesías ni palabras de relleno. */
export function extractKeywords(question: string): string[] {
  const norm = normalizeQuestion(question);
  const stripped = stripConversational(norm);
  const words = stripped.split(" ").filter((w) => w.length >= 3 && !QUESTION_STOP.has(w) && !TRIGGER_FILLER.has(w));
  return [...new Set(words)];
}

/** Las palabras que dicen de qué trata un texto: sin relleno, sin palabras de pregunta, de 3 letras o más. */
const contentWords = (text: string) =>
  normalizeQuestion(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !QUESTION_STOP.has(w) && !TRIGGER_FILLER.has(w));

/**
 * Qué parte de lo esencial de la pregunta cubren esas palabras (0 a 1). Una
 * respuesta oficial sobre «qué es la UDES» no cubre «cuántos estudiantes
 * matriculados tiene la UDES»: de estudiantes, matriculados y udes, solo udes.
 */
export function coverage(question: string, words: string[]): number {
  const asked = extractKeywords(question);
  if (!asked.length) return 1;
  return asked.filter((k) => triggerWordIn(k, words)).length / asked.length;
}

/** Cuánto de lo preguntado debe cubrir una respuesta oficial para darse por palabras. */
export const CATALOG_COVERAGE = 0.6;

/**
 * Lo que responde el catálogo, si responde. Primero las capciosas (gana el
 * disparador más largo, el más específico); luego las respuestas, por
 * disparadores propios, por parecido directo o despojada de cortesías
 * («hola pilo cuéntame qué es el PDI» → «qué es el PDI»). Por palabras clave
 * o por un disparador de una palabra, la respuesta debe cubrir lo esencial de
 * la pregunta (CATALOG_COVERAGE), salvo el disparador de varias palabras, que es deliberado:
 * que la pregunta nombre a la UDES no la vuelve «qué es la UDES».
 */
export function matchCatalog(question: string, entries: CatalogEntry[], min = 0.65): { entry: CatalogEntry; score: number } | null {
  const qnorm = normalizeQuestion(question);
  if (!qnorm) return null;
  const qstripped = stripConversational(qnorm);
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const e of entries) {
    if (e.kind !== "capciosa") continue;
    // «salario, sueldo; cuánto gana» son tres disparadores, no uno: así los escribe la gente.
    for (const t of e.triggers.flatMap((x) => x.split(/[,;|\n]/))) {
      if (!hasTrigger(qnorm, t)) continue;
      const score = triggerWeight(t);
      if (!best || score > best.score) best = { entry: e, score };
    }
  }
  if (best) return best;
  for (const e of entries) {
    if (e.kind !== "respuesta") continue;

    // 1. Disparadores / palabras clave explícitos en la respuesta
    if (e.triggers && e.triggers.length > 0) {
      for (const t of e.triggers.flatMap((x) => x.split(/[,;|\n]/))) {
        if (!t.trim() || !hasTrigger(qnorm, t)) continue;
        // Un disparador de una sola palabra («udes») sale en muchas preguntas: debe
        // cubrir lo esencial. Uno de varias palabras («cifras oficiales») es deliberado.
        const tw = contentWords(t);
        if (tw.length <= 1 && coverage(question, tw) < CATALOG_COVERAGE) continue;
        const score = 0.85 + 0.05 * triggerWeight(t);
        if (!best || score > best.score) best = { entry: e, score };
      }
    }

    // 2. Parecido con la pregunta y variantes (con o sin cortesías)
    for (const q of [e.question, ...e.variants]) {
      if (!q.trim()) continue;
      const target = normalizeQuestion(q);
      const targetStripped = stripConversational(target);

      const scoreDirect = similarity(qnorm, target);
      const scoreStripped = similarity(qstripped, targetStripped);
      const score = Math.max(scoreDirect, scoreStripped);

      if (score >= min && (!best || score > best.score)) {
        best = { entry: e, score };
      }

      // 3. Coincidencia de contenido esencial: todas las palabras clave del objetivo
      //    están en la pregunta y cubren lo esencial de ella. Sin relleno: «es» no
      //    puede coincidir con «estudiantes».
      const targetWords = contentWords(targetStripped);
      const queryWords = qstripped.split(" ").filter(Boolean);
      if (targetWords.length >= 1 && queryWords.length >= 1) {
        const matchesAll = targetWords.every((w) => triggerWordIn(w, queryWords));
        if (matchesAll && coverage(question, targetWords) >= CATALOG_COVERAGE) {
          const kwScore = 0.80 + Math.min(0.15, targetWords.length * 0.04);
          if (!best || kwScore > best.score) best = { entry: e, score: kwScore };
        }
      }
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

/* --- Voz de NVIDIA (Magpie TTS Zeroshot) ------------------------------------------ */

/**
 * NVIDIA sirve sus voces por gRPC (Riva), no con el formato de OpenAI. gRPC es
 * HTTP/2 con cada mensaje en protobuf y un prefijo de 5 bytes, así que basta
 * fetch: sin librerías, también en la función del servidor. El modelo se
 * elige con la cabecera function-id; la voz, con una muestra de 3 a 10 s.
 */
export const RIVA_URL = "https://grpc.nvcf.nvidia.com/nvidia.riva.tts.RivaSpeechSynthesis/Synthesize";
/** La frecuencia del audio que se pide (y la de las muestras que se guardan). */
export const RIVA_RATE = 22050;
/** Un function-id de NVIDIA: un UUID. */
export const looksLikeFunctionId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());

/** Un estilo de la voz de Pilo: una muestra grabada en el bucket pilo-voz (0101). */
export interface VoiceStyle {
  id: string;
  name: string;
  path: string;
  seconds: number;
  /** Fish Audio (0102): el id de la voz creada con esta muestra y su tono («calm»). */
  fish_id?: string;
  tone?: string;
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

function pbVarint(n: number): number[] {
  const out: number[] = [];
  let v = Math.max(0, Math.floor(n));
  while (v > 0x7f) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}
const pbBytes = (field: number, bytes: Uint8Array) => joinBytes([new Uint8Array([...pbVarint(field * 8 + 2), ...pbVarint(bytes.length)]), bytes]);
const pbText = (field: number, text: string) => pbBytes(field, new TextEncoder().encode(text));
const pbInt = (field: number, n: number) => new Uint8Array([...pbVarint(field * 8), ...pbVarint(n)]);

/** Los campos de un mensaje protobuf, sin su esquema: número y valor (entero o bytes). */
export function pbFields(buf: Uint8Array): { field: number; value: number | Uint8Array }[] {
  const out: { field: number; value: number | Uint8Array }[] = [];
  let i = 0;
  const varint = () => {
    let n = 0;
    let scale = 1;
    let b = 0;
    do {
      if (i >= buf.length) throw new Error("protobuf cortado");
      b = buf[i++];
      n += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return n;
  };
  while (i < buf.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) out.push({ field, value: varint() });
    else if (wire === 2) {
      const n = varint();
      if (i + n > buf.length) throw new Error("protobuf cortado");
      out.push({ field, value: buf.subarray(i, i + n) });
      i += n;
    } else if (wire === 5) i += 4;
    else if (wire === 1) i += 8;
    else throw new Error(`protobuf: tipo ${wire}`);
  }
  return out;
}

/**
 * El pedido de Synthesize ya enmarcado para gRPC (riva_tts.proto):
 * text=1, language_code=2, encoding=3 (LINEAR_PCM=1), sample_rate_hz=4,
 * voice_name=5, zero_shot_data=6 {audio_prompt=1, sample_rate_hz=2, encoding=3, quality=4}.
 */
export function rivaRequest(input: {
  text: string;
  language: string;
  voice?: string;
  prompt?: { pcm: Uint8Array; rate: number };
  quality?: number;
}): Uint8Array<ArrayBuffer> {
  const parts = [pbText(1, input.text), pbText(2, input.language), pbInt(3, 1), pbInt(4, RIVA_RATE)];
  if (input.voice) parts.push(pbText(5, input.voice));
  if (input.prompt) {
    const quality = Math.min(40, Math.max(1, Math.round(input.quality ?? 20)));
    parts.push(pbBytes(6, joinBytes([pbBytes(1, input.prompt.pcm), pbInt(2, input.prompt.rate), pbInt(3, 1), pbInt(4, quality)])));
  }
  const message = joinBytes(parts);
  const frame = new Uint8Array(5 + message.length);
  new DataView(frame.buffer).setUint32(1, message.length);
  frame.set(message, 5);
  return frame;
}

/** El audio (PCM de 16 bits) de la respuesta gRPC; null si no trae ninguno. */
export function rivaAudio(body: Uint8Array): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let at = 0;
  while (at + 5 <= body.length) {
    const n = new DataView(body.buffer, body.byteOffset + at).getUint32(1);
    const message = body.subarray(at + 5, at + 5 + n);
    at += 5 + n;
    for (const f of pbFields(message)) if (f.field === 1 && f.value instanceof Uint8Array) chunks.push(f.value);
  }
  const pcm = joinBytes(chunks);
  return pcm.length > 0 ? pcm : null;
}

/** Un WAV de PCM 16 bits: sus muestras y frecuencia. null si no es un WAV así. */
export function readWav(bytes: Uint8Array): { pcm: Uint8Array; rate: number; channels: number } | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let at = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  let format = 0;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      if (format !== 1 || bits !== 16 || !rate) return null;
      return { pcm: bytes.subarray(at + 8, Math.min(bytes.length, at + 8 + size)), rate, channels };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/** PCM de 16 bits, mono, envuelto en WAV para que el navegador lo toque. */
export function wavFile(pcm: Uint8Array, rate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, k) => view.setUint8(at + k, c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Une varios PCM en uno. */
export const joinPcm = (parts: Uint8Array[]) => joinBytes(parts);

/**
 * El texto en trozos que el modelo lee de una vez: por frases, sin pasar de
 * `max` caracteres (una frase más larga se corta en comas o espacios).
 */
export function speechChunks(text: string, max = 300): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["»)]*|$)/g) ?? [clean];
  const pieces: string[] = [];
  for (const raw of sentences) {
    let s = raw.trim();
    while (s.length > max) {
      const cut = Math.max(s.lastIndexOf(", ", max), s.lastIndexOf("; ", max), s.lastIndexOf(" ", max));
      const at = cut > max / 3 ? cut + 1 : max;
      pieces.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }
    if (s) pieces.push(s);
  }
  const out: string[] = [];
  for (const p of pieces) {
    const last = out.length - 1;
    if (last >= 0 && out[last].length + 1 + p.length <= max) out[last] = `${out[last]} ${p}`;
    else out.push(p);
  }
  return out;
}

/** El estilo que suena en un portal: el pedido (solo en la prueba), el del portal o el de siempre. */
export function styleFor(
  styles: VoiceStyle[],
  portal: string,
  byPortal: Record<string, string> | null | undefined,
  main: string,
  asked?: string,
): VoiceStyle | null {
  const find = (id: string | undefined) => (id ? styles.find((s) => s.id === id) : undefined);
  return find(portal === "prueba" ? asked : undefined) ?? find(byPortal?.[portal]) ?? find(main) ?? styles[0] ?? null;
}

/* --- Voz de Fish Audio (0102) ------------------------------------------------------ */

/**
 * Fish Audio: POST /v1/tts con JSON, el modelo en la cabecera «model» y la voz
 * por su id (reference_id), que se crea una vez desde una muestra (POST /model).
 * Sus modelos S2 entienden etiquetas de emoción al empezar cada frase: «[calm]».
 */
export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
export const FISH_MODEL_URL = "https://api.fish.audio/model";
/** s2.1-pro-free es gratis (con uso razonable) hasta el 30 de noviembre de 2026. */
export const FISH_MODELS = ["s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"] as const;
export const FISH_DEFAULT_MODEL = "s2.1-pro-free";

/**
 * El id de una voz de Fish Audio (32 caracteres hexadecimales), aunque se pegue
 * el enlace completo («https://fish.audio/m/<id>/»). Vacío si no hay uno.
 */
export const fishVoiceId = (input: string) => (input.match(/[0-9a-f]{32}/i)?.[0] ?? "").toLowerCase();

/** El modelo de Fish Audio que se usa: uno de los conocidos o el gratuito. */
export const fishModel = (model: string) => ((FISH_MODELS as readonly string[]).includes(model) ? model : FISH_DEFAULT_MODEL);

/** Una etiqueta de tono de Fish Audio («calm», «soft tone»): solo letras y espacios. */
export const cleanTone = (tone: string) =>
  tone
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);

/**
 * El texto con el tono al comienzo de cada frase, que es donde Fish Audio lo
 * respeta: «[calm] Hola. [calm] Soy Pilo.». Sin tono, el texto tal cual.
 */
export function fishText(text: string, tone: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const tag = cleanTone(tone);
  if (!tag || !clean) return clean;
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["»)]*|$)/g) ?? [clean];
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `[${tag}] ${s}`)
    .join(" ");
}
