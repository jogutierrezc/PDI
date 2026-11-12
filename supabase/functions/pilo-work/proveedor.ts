/* =============================================================================
   Pilo at Work · el proveedor de texto y el enrutador por tarea.

   Lee la misma configuración (pilo_ai_settings) y las mismas claves (pilo_ai_secret)
   que supabase/functions/pilo-ia, con las mismas direcciones y reglas. No se importa
   desde pilo-ia/index.ts porque ese archivo arranca su propio servidor al cargarse;
   aquí va lo mínimo (textTarget y endpoint de ese archivo, copiados tal cual).
   Las claves se quedan en el servidor: nunca viajan al navegador.

   POLÍTICA DE MODELOS (pedida por la dueña): la preferencia SIEMPRE es Mistral; NVIDIA
   solo cuando hace falta más capacidad o Mistral no responde; se prioriza la velocidad.
     · nivel «rapido»    → Mistral (text_model), siempre en streaming, tope de espera al
                           primer fragmento; si no empieza a tiempo, se aborta y se usa NVIDIA.
     · nivel «capacidad» → NVIDIA (nvidia_text_model, o su preajuste) para lo pesado; sin
                           clave de NVIDIA cae al Mistral más capaz configurado
                           (mistral_large_model, o text_model si no hay otro).
   Proveedor y modelo de cada nivel, los umbrales y los límites salen de pw_config (panel
   /admin/pilo-work); vacío o ausente = el modelo configurado en Pilo y los valores por
   defecto de CONFIG_BASE. La clasificación del nivel es por reglas simples en código
   (elegirNivel), nunca con IA.
   Un modelo que responde 404/410 se trata como «retirado»: se anota (sin contenidos) y
   se cae al siguiente. Ningún id de modelo nuevo está fijado aquí: solo los preajustes que
   Pilo ya usa o lo que la administración escribió en pw_config.
   ========================================================================== */

// deno-lint-ignore no-explicit-any
type Admin = any;

export const TEXT_PRESETS: Record<string, { url: string; model: string }> = {
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  freeai: { url: "https://api.free.ai/v1/chat/", model: "qwen7b" },
  nvidia: { url: "https://integrate.api.nvidia.com/v1/chat/completions", model: "google/gemma-4-31b-it" },
};

const looksLikeModel = (model: string) => /^[\w.:-][\w.:/-]*$/.test(model) && !/^https?:/.test(model);

export function endpoint(provider: string, base: string, path: string): string {
  let b = base.trim().replace(/\/+$/, "");
  let p = "/" + path.trim().replace(/^\/+/, "");
  const half = p.slice(0, p.length / 2);
  if (p.length > 2 && p.length % 2 === 0 && half + half === p) p = half;
  if (p !== "/" && b.toLowerCase().endsWith(p.toLowerCase())) return b;
  if (/\/v1$/.test(b) && p.startsWith("/v1/")) p = p.slice(3);
  if (provider === "mistral" && !/\/v1$/.test(b) && !p.startsWith("/v1/")) b = `${b}/v1`;
  return `${b}${p}`;
}

export function textTarget(provider: string, base: string, path: string, model: string): { url: string; model: string } {
  const preset = TEXT_PRESETS[provider];
  if (preset) return { url: preset.url, model: looksLikeModel(model) ? model : preset.model };
  return { url: endpoint(provider, base, path || "/chat/completions"), model };
}

export interface Config {
  rapido_proveedor: string;
  rapido_modelo: string;
  capacidad_proveedor: string;
  capacidad_modelo: string;
  primer_fragmento_s: number;
  umbral_capacidad: number;
  max_tokens: number;
  max_pasos: number;
  limite_hora: number;
  limite_hora_invitado: number;
  subida_max_mb: number;
  retencion_dias: number;
  funciones: Record<string, boolean>;
  /* Pilo Astra 1.0 (0278): motor más potente en el servidor propio, elegido a mano en el chat. */
  astra_habilitado: boolean;
  astra_modelo: string;
  astra_base_url: string;
  astra_razonamiento: "auto" | "profundo" | "apagado";
  astra_max_tokens: number;
  astra_espera_s: number;
  astra_limite_hora: number;
  astra_subida_max_mb: number;
  astra_roles: string[];
  astra_formatos: Record<string, boolean>;
  astra_aviso: boolean;
}
/** Los valores que se usan si pw_config no existe o le falta algo (los mismos por defecto de la migración 0247). */
export const CONFIG_BASE: Config = {
  rapido_proveedor: "",
  rapido_modelo: "",
  capacidad_proveedor: "",
  capacidad_modelo: "",
  primer_fragmento_s: 7,
  umbral_capacidad: 12000,
  max_tokens: 1500,
  max_pasos: 5,
  limite_hora: 60,
  limite_hora_invitado: 10,
  subida_max_mb: 100,
  retencion_dias: 180,
  funciones: { chat: true, cowork: true, datos: true, correo: true, agenda: true, archivos: true, equipos: true, perfil: true },
  astra_habilitado: false,
  astra_modelo: "pilo-astra:1.0",
  astra_base_url: "",
  astra_razonamiento: "auto",
  astra_max_tokens: 4000,
  astra_espera_s: 120,
  astra_limite_hora: 20,
  astra_subida_max_mb: 25,
  astra_roles: ["colaborador", "colaborador_correo", "coordinacion", "admin"],
  astra_formatos: { xlsx: true, docx: true, pdf: true, csv: true, codigo: true },
  astra_aviso: true,
};

/** pw_config con respaldo: si la tabla no existe (migración sin aplicar) o falla, valores por defecto. */
export async function leerConfig(admin: Admin): Promise<Config> {
  try {
    const { data, error } = await admin.from("pw_config").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return CONFIG_BASE;
    const num = (v: unknown, def: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);
    return {
      rapido_proveedor: String(data.rapido_proveedor ?? ""),
      rapido_modelo: String(data.rapido_modelo ?? ""),
      capacidad_proveedor: String(data.capacidad_proveedor ?? ""),
      capacidad_modelo: String(data.capacidad_modelo ?? ""),
      primer_fragmento_s: num(data.primer_fragmento_s, CONFIG_BASE.primer_fragmento_s),
      umbral_capacidad: num(data.umbral_capacidad, CONFIG_BASE.umbral_capacidad),
      max_tokens: num(data.max_tokens, CONFIG_BASE.max_tokens),
      max_pasos: num(data.max_pasos, CONFIG_BASE.max_pasos),
      limite_hora: num(data.limite_hora, CONFIG_BASE.limite_hora),
      limite_hora_invitado: num(data.limite_hora_invitado, CONFIG_BASE.limite_hora_invitado),
      subida_max_mb: num(data.subida_max_mb, CONFIG_BASE.subida_max_mb),
      retencion_dias: num(data.retencion_dias, CONFIG_BASE.retencion_dias),
      funciones: { ...CONFIG_BASE.funciones, ...((data.funciones && typeof data.funciones === "object" ? data.funciones : {}) as Record<string, boolean>) },
      // Astra (0278): si la migración aún no se aplicó, estas columnas faltan y Astra queda apagado.
      astra_habilitado: data.astra_habilitado === true,
      astra_modelo: String(data.astra_modelo ?? CONFIG_BASE.astra_modelo).trim() || CONFIG_BASE.astra_modelo,
      astra_base_url: String(data.astra_base_url ?? "").trim(),
      astra_razonamiento: ["auto", "profundo", "apagado"].includes(String(data.astra_razonamiento)) ? (data.astra_razonamiento as Config["astra_razonamiento"]) : "auto",
      astra_max_tokens: num(data.astra_max_tokens, CONFIG_BASE.astra_max_tokens),
      astra_espera_s: num(data.astra_espera_s, CONFIG_BASE.astra_espera_s),
      astra_limite_hora: num(data.astra_limite_hora, CONFIG_BASE.astra_limite_hora),
      astra_subida_max_mb: num(data.astra_subida_max_mb, CONFIG_BASE.astra_subida_max_mb),
      astra_roles: Array.isArray(data.astra_roles) ? data.astra_roles.map(String) : CONFIG_BASE.astra_roles,
      astra_formatos: { ...CONFIG_BASE.astra_formatos, ...((data.astra_formatos && typeof data.astra_formatos === "object" ? data.astra_formatos : {}) as Record<string, boolean>) },
      astra_aviso: data.astra_aviso !== false,
    };
  } catch {
    return CONFIG_BASE;
  }
}

export interface Destino {
  url: string;
  model: string;
  key: string;
  provider: string;
}
export type Nivel = "rapido" | "capacidad";

export interface Destinos {
  /** El proveedor configurado en Pilo (normalmente Mistral, modelo rápido). */
  principal: Destino | null;
  /** NVIDIA de apoyo (solo si hay clave y el principal no es NVIDIA). */
  apoyo: Destino | null;
  /** Orden de intento por nivel. */
  orden: Record<Nivel, Destino[]>;
}

/** El proveedor de texto de Pilo, NVIDIA de apoyo y el orden de intento de cada nivel. */
export async function leerProveedores(admin: Admin, cfg: Config = CONFIG_BASE): Promise<Destinos> {
  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
  ]);
  const vacio: Destinos = { principal: null, apoyo: null, orden: { rapido: [], capacidad: [] } };
  if (!settings) return vacio;
  const keyOf = (provider: string) => String(secret?.[`${provider}_key`] ?? "");
  const provider = String(settings.provider ?? "mistral");
  const key = keyOf(provider) || String(secret?.api_key ?? "");
  const target = textTarget(provider, String(settings.base_url ?? ""), String(settings.chat_path ?? ""), String(settings.text_model ?? ""));
  const principal: Destino | null = target.url.startsWith("https://") && target.model && key ? { ...target, key, provider } : null;
  const nvKey = keyOf("nvidia");
  const mistralKey = keyOf("mistral") || (provider === "mistral" ? key : "");

  /** Un destino explícito de pw_config (proveedor y, si se quiere, modelo); null si falta la clave. */
  const elegido = (prov: string, modelo: string): Destino | null => {
    const m = modelo.trim();
    if (prov === "nvidia") return nvKey ? { url: TEXT_PRESETS.nvidia.url, model: looksLikeModel(m) ? m : TEXT_PRESETS.nvidia.model, key: nvKey, provider: "nvidia" } : null;
    if (prov === "mistral") {
      if (!mistralKey) return null;
      const base = provider === "mistral" && principal ? principal.model : TEXT_PRESETS.mistral.model;
      return { url: TEXT_PRESETS.mistral.url, model: looksLikeModel(m) ? m : base, key: mistralKey, provider: "mistral" };
    }
    return null;
  };
  const nvidiaAuto = elegido("nvidia", "");

  // Rápido: lo configurado en pw_config o el proveedor de Pilo. Apoyo: NVIDIA (si hay clave y no es el mismo).
  const rapido = elegido(cfg.rapido_proveedor, cfg.rapido_modelo) ?? (cfg.rapido_modelo && principal && looksLikeModel(cfg.rapido_modelo.trim()) ? { ...principal, model: cfg.rapido_modelo.trim() } : principal);
  const apoyo = nvidiaAuto && rapido?.provider !== "nvidia" ? nvidiaAuto : null;
  // Capacidad: lo configurado, o NVIDIA si hay clave; sin clave de NVIDIA, el Mistral configurado.
  const capaz = elegido(cfg.capacidad_proveedor, cfg.capacidad_modelo) ?? nvidiaAuto ?? rapido;

  const unico = (l: (Destino | null)[]) => l.filter((d, i, a): d is Destino => Boolean(d) && a.findIndex((x) => x && d && x.provider === d.provider && x.model === d.model) === i);
  return {
    principal: rapido,
    apoyo,
    orden: {
      rapido: unico([rapido, apoyo]),
      capacidad: unico([capaz, rapido]),
    },
  };
}

/* --- Pilo Astra 1.0: el servidor propio ------------------------------------------------------ */

/** Nombre público del motor: las personas nunca ven el modelo que hay debajo. */
export const ASTRA_NOMBRE = "Pilo Astra 1.0";

/**
 * El destino de Astra: el servidor propio de la universidad (el de la voz de Pilo), que habla el
 * formato de OpenAI. Dirección: la de pw_config, o la del servidor de voz, o la del texto de Pilo.
 * Clave: la del servidor propio (voz u «otro»). null si falta la dirección https, el modelo o la clave.
 */
export async function destinoAstra(admin: Admin, cfg: Config): Promise<Destino | null> {
  const [{ data: settings }, { data: secret }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
  ]);
  const base = cfg.astra_base_url || String(settings?.speech_base_url ?? "") || String(settings?.base_url ?? "");
  const key = String(secret?.speech_key ?? "") || String(secret?.otro_key ?? "");
  if (!base || !key || !cfg.astra_modelo) return null;
  const url = endpoint("otro", base, "/chat/completions");
  if (!url.startsWith("https://")) return null;
  return { url, model: cfg.astra_modelo, key, provider: "otro" };
}

/** El razonamiento que se pide al servidor (Ollama: reasoning_effort). El proxy apaga el razonamiento si no se pide. */
export function esfuerzoAstra(modo: string): "low" | "medium" | "high" | "none" {
  return modo === "profundo" ? "high" : modo === "apagado" ? "none" : "medium";
}

/* --- Elegir el nivel por reglas simples ---------------------------------------------------- */

/** Umbral por defecto de «documento largo»: ~12 000 caracteres (≈ 3 000 tokens): lo que un modelo rápido resume mal de una vez. */
export const UMBRAL_LARGO = CONFIG_BASE.umbral_capacidad;

export function elegirNivel(t: { caracteres?: number; codigo?: boolean; varios?: boolean; profunda?: boolean }, umbral = UMBRAL_LARGO): Nivel {
  if (t.codigo || t.varios || t.profunda || (t.caracteres ?? 0) > umbral) return "capacidad";
  return "rapido";
}

/* --- Llamadas -------------------------------------------------------------------------------- */

export interface Mensaje {
  role: string;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export interface Uso {
  proveedor: string;
  modelo: string;
  nivel: Nivel | "astra";
  conmutado: boolean;
  motivo: string;
  ms: number;
}

/** Cuánto se espera el primer fragmento antes de pasar al siguiente. El primero del nivel rápido es corto a propósito. */
export const ESPERA_PRIMER_FRAGMENTO_MS = { rapidoPrimero: CONFIG_BASE.primer_fragmento_s * 1000, otros: 20000 };
/** Silencio máximo entre fragmentos ya empezado el flujo, y tope de una respuesta completa sin streaming. */
const SILENCIO_MS = 15_000;
const TOTAL_SIN_STREAM_MS = 40_000;

const conTope = <T>(p: Promise<T>, ms: number, mensaje: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(mensaje)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

interface Intento {
  response: Response | null;
  status: number;
  motivo: string;
  ms: number;
}

async function intento(d: Destino, cuerpo: Parameters<typeof llamar>[1], signal: AbortSignal | undefined, esperaMs: number, silencioMs = SILENCIO_MS): Promise<Intento> {
  const ctl = new AbortController();
  const alAbortar = () => ctl.abort();
  signal?.addEventListener("abort", alAbortar);
  let lento = false;
  const t0 = Date.now();
  const timer = setTimeout(() => {
    lento = true;
    ctl.abort();
  }, cuerpo.stream ? esperaMs : Math.max(esperaMs, TOTAL_SIN_STREAM_MS));
  const limpiar = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", alAbortar);
  };
  try {
    const response = await fetch(d.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${d.key}`, "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        model: d.model,
        messages: cuerpo.messages,
        temperature: cuerpo.temperature ?? 0.3,
        max_tokens: cuerpo.max_tokens ?? 1500,
        ...(cuerpo.stream ? { stream: true } : {}),
        ...(cuerpo.reasoning ? { reasoning_effort: cuerpo.reasoning } : {}),
        ...(cuerpo.tools?.length ? { tools: cuerpo.tools, tool_choice: "auto" } : {}),
        ...(cuerpo.json && d.provider === "mistral" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      limpiar();
      const retirado = response.status === 404 || response.status === 410;
      if (retirado) console.error(`[pilo-work] modelo retirado o inexistente: ${d.provider}/${d.model} (${response.status})`);
      return { response: null, status: response.status, motivo: retirado ? "modelo retirado" : `error ${response.status}`, ms: Date.now() - t0 };
    }
    if (!cuerpo.stream) {
      const texto = await response.text();
      limpiar();
      return { response: new Response(texto, { status: 200 }), status: 200, motivo: "", ms: Date.now() - t0 };
    }
    // Streaming: se espera el primer fragmento; luego, silencio máximo entre fragmentos.
    const lector = response.body!.getReader();
    const primero = await lector.read();
    clearTimeout(timer);
    if (primero.done) {
      limpiar();
      return { response: null, status: 200, motivo: "respuesta vacía", ms: Date.now() - t0 };
    }
    const ms = Date.now() - t0;
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(primero.value);
      },
      async pull(c) {
        try {
          const r = await conTope(lector.read(), silencioMs, "El modelo dejó de responder.");
          if (r.done) {
            limpiar();
            c.close();
          } else c.enqueue(r.value);
        } catch (e) {
          limpiar();
          ctl.abort();
          c.error(e);
        }
      },
      cancel() {
        limpiar();
        ctl.abort();
      },
    });
    return { response: new Response(flujo, { status: 200 }), status: 200, motivo: "", ms };
  } catch (e) {
    limpiar();
    if (signal?.aborted) return { response: null, status: 0, motivo: "cancelado", ms: Date.now() - t0 };
    return { response: null, status: 0, motivo: lento ? "tardó demasiado" : e instanceof Error && e.name === "AbortError" ? "cancelado" : "sin conexión", ms: Date.now() - t0 };
  }
}

/**
 * Un pedido de chat por nivel. Prueba los destinos del nivel en orden; si el primero no
 * responde a tiempo (o falla: red, 429, 5xx, modelo retirado, vacío) pasa al siguiente.
 * Devuelve la respuesta, qué modelo respondió y si hubo conmutación (para la bitácora y el chip).
 */
export async function llamar(
  destinos: Destinos,
  cuerpo: { messages: Mensaje[]; temperature?: number; max_tokens?: number; stream?: boolean; json?: boolean; tools?: unknown[]; reasoning?: string },
  opciones: { signal?: AbortSignal; nivel?: Nivel; primerMs?: number; esperaMs?: number } = {},
): Promise<{ response: Response | null; error: string; uso: Uso | null }> {
  const nivel = opciones.nivel ?? "rapido";
  const lista = destinos.orden[nivel].length ? destinos.orden[nivel] : destinos.orden.rapido;
  let error = "Pilo at Work aún no tiene proveedor de IA conectado.";
  let primerMotivo = "";
  for (let i = 0; i < lista.length; i++) {
    const d = lista[i];
    const espera = opciones.esperaMs ?? (nivel === "rapido" && i === 0 && lista.length > 1 ? (opciones.primerMs ?? ESPERA_PRIMER_FRAGMENTO_MS.rapidoPrimero) : ESPERA_PRIMER_FRAGMENTO_MS.otros);
    // Con espera explícita (Astra razona en silencio), el silencio entre fragmentos usa esa misma espera.
    const r = await intento(d, cuerpo, opciones.signal, espera, opciones.esperaMs ? Math.max(SILENCIO_MS, opciones.esperaMs) : SILENCIO_MS);
    console.log(`[pilo-work] ia ${d.provider}/${d.model} nivel=${nivel} ${r.response ? "ok" : `falla: ${r.motivo}`} ${r.ms}ms`);
    if (r.response) return { response: r.response, error: "", uso: { proveedor: d.provider, modelo: d.model, nivel, conmutado: i > 0, motivo: i > 0 ? primerMotivo : "", ms: r.ms } };
    if (!primerMotivo) primerMotivo = r.motivo;
    error = r.status ? `El proveedor respondió ${r.status}.` : r.motivo === "cancelado" ? "Se canceló." : r.motivo === "tardó demasiado" ? "El modelo tardó demasiado en responder." : "No se pudo hablar con el proveedor de IA.";
    if (opciones.signal?.aborted) break;
    // Un 4xx distinto de 404/410/429 es un pedido malo: otro modelo no lo arreglará.
    if (r.status >= 400 && r.status < 500 && ![404, 410, 429].includes(r.status)) break;
  }
  return { response: null, error, uso: null };
}
