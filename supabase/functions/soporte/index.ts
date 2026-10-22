/* =============================================================================
   Edge Function `soporte` · el Portal de agentes de la UDES.

   Dos públicos:
   · LA PERSONA que escribe desde Pilo (anónima). No tiene cuenta: al pedir un
     agente recibe un SECRETO de 256 bits que solo ella guarda; la base conserva
     únicamente su huella SHA-256. Cada pedido (estado, mensaje, archivo, leído,
     calificar) lleva el id de la conversación y el secreto, y la función los
     comprueba contra la huella. Nada de esto pasa por RLS anónima: las tablas
     no tienen acceso anónimo; esta función usa la clave de servicio.
   · LOS AGENTES (con su sesión de Supabase): ingreso por código al correo
     (sin contraseñas; el ingreso con Microsoft lo hace Supabase Auth), invitar
     a un agente nuevo y cerrar una conversación con la transcripción por correo.
     El reparto, aceptar, reasignar y escribir los hace el navegador del agente
     directo con las funciones de la base (RLS + security definer).

   Tiempo real hacia la persona: un canal Broadcast cuyo NOMBRE es un valor
   aleatorio de 128 bits (`soporte:<channel_key>`) que solo conocen la persona y
   los agentes que pueden leer la conversación. Por el canal viajan avisos
   mínimos («nuevo», «estado», «escribiendo»), nunca el texto: la persona lo
   pide a esta función con su secreto.

   Acciones (POST, JSON, campo `action`):
     portal      { space }                         → { agent_on, open, online, messages }
     crear       { space, nombre, correo, telefono, ciudad, politica, autoriza, resumen, pregunta }
                                                   → { id, secret, channel, after_hours }
     estado      { id, secret, despues? }          → la vista de la conversación
     mensaje     { id, secret, texto, archivos? }  → { id }
     subir       { id, secret, nombre, tipo, tamano } → { path, token }  (URL firmada de subida)
     descargar   { id, secret, ruta }              → { url }
     leer        { id, secret }
     calificar   { id, secret, puntaje, comentario }
     cancelar    { id, secret }
     ingreso_enviar    { correo }                  → { ok, ttl, wait }
     ingreso_verificar { correo, codigo }          → { session }
     invitar     { agente_id }                     (director)
     resolver    { id, transcripcion }             (agente)
     tomada      { id }                            (agente; avisa al correo si fue fuera de horario)
     reanudar    { token }                         → { id, secret, channel, space, nombre, correo }
                                                  (el enlace de un solo uso del correo de «vuelva a su conversación»)
     aviso_estudiante { id }                       (agente; correo con el enlace si la persona no está viendo el chat)
     push_clave  { }                               → { public } (la llave VAPID, o null si el push está apagado)
     push_guardar { endpoint, p256dh, auth }       (agente; guarda la suscripción de su navegador)
     push_quitar { endpoint }                      (agente; la borra)

   Tiempo real hacia el agente: el portal de agentes escucha postgres_changes
   (las tablas support_conversations, support_messages y support_agents están
   en la publicación supabase_realtime) y, para cuando el portal está cerrado,
   Web Push: la llave VAPID vive en support_push_config (la tabla) y las
   suscripciones en support_push_subscriptions.

   Si nadie toma una conversación que espera de más (reglas
   escalate_after_minutes y escalate_cooldown_hours), se avisa a los directores
   por correo y push. Eso lo disparan los pedidos de la persona (estado) y la
   función de tick que corre con los latidos de los agentes (0184).

   Variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (las
   pone la plataforma); opcionales: ALLOWED_ORIGIN, PILO_VISITOR_SALT,
   CORREOS_FUNCION_URL, SOPORTE_PORTAL_URL (por defecto https://planeacion.udes.edu.co/agentes),
   SOPORTE_ESTUDIANTE_URL (enlace del chat en Pilo, por defecto https://planeacion.udes.edu.co/app),
   SOPORTE_RESUME_KEY (una frase cualquiera que cifra el secreto de reanudación;
   sin ella se deriva una de la llave del servicio),
   TURNSTILE_SECRET_KEY (si está, el formulario público exige el captcha invisible de Cloudflare).

   El bloque «adjuntos» es una copia de src/modules/soporte/adjuntos.ts y el
   bloque «push» de src/modules/soporte/push.ts (el editor de Supabase solo
   acepta un archivo); una prueba falla si se separan.

   Despliegue:  supabase functions deploy soporte
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// --- inicio adjuntos
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;

/** extensión → tipo MIME. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map((e) => `.${e}`).join(",");

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** El tipo MIME que se sube: el del navegador si es de los permitidos; si no, el que dice la extensión. */
export function mimeFor(file: { name: string; type: string }): string {
  const allowed = Object.values(ATTACHMENT_TYPES);
  return allowed.includes(file.type) ? file.type : (ATTACHMENT_TYPES[extensionOf(file.name)] ?? "");
}

/** Qué le falta a un archivo para poder adjuntarse, o "" si sirve. */
export function attachmentProblem(file: { name: string; type: string; size: number }): string {
  if (!file.size) return "El archivo está vacío.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "El archivo pesa más de 10 MB.";
  if (!mimeFor(file)) return "Solo se admiten imágenes, PDF, Word y Excel.";
  return "";
}

/** Un nombre seguro para guardar en el bucket. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const known = ext in ATTACHMENT_TYPES;
  const stem = known ? name.slice(0, -(ext.length + 1)) : name;
  const base = stem
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || "archivo"}${known ? `.${ext}` : ""}`;
}
// --- fin adjuntos

// --- inicio push
export interface PushClaves {
  /** La pública (65 bytes: 0x04 ‖ x ‖ y, base64url). Va en el manifest del navegador y en el encabezado. */
  public: string;
  /** La privada (32 bytes, base64url). Nunca sale del servidor. */
  private: string;
  /** Un mailto: para que el servicio de push sepa quién responde por los avisos. */
  subject: string;
}

/** A quién le llega el aviso: la suscripción que guardó el navegador del agente. */
export interface PushDestino {
  endpoint: string;
  /** La llave pública de la suscripción (65 bytes, base64url). */
  p256dh: string;
  /** El secreto de autenticación (16 bytes, base64url). */
  auth: string;
}

/** El texto del aviso. El service worker decide cómo mostrarlo. */
export interface PushMensaje {
  titulo: string;
  cuerpo: string;
  /** Para agrupar avisos del mismo tema (p. ej. la conversación). */
  tag?: string;
  /** A dónde abre el aviso (una ruta del portal). */
  url?: string;
  /** Cuánto vale el aviso si el equipo está apagado (segundos). */
  ttl?: number;
}

/* --- base64url ------------------------------------------------------------------------------------ */

export function b64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlBytes(texto: string): Uint8Array {
  const limpio = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(limpio + "=".repeat((4 - (limpio.length % 4)) % 4));
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

/* --- HMAC y derivación, tal cual el RFC 8291 (pseudocódigo del apartado 3.4) ----------------------- */

const hmac = async (llave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey("raw", llave as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos as unknown as ArrayBuffer));
};

const juntar = (...pedazos: (Uint8Array | number[])[]): Uint8Array => {
  const partes = pedazos.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
};

/* --- Llaves VAPID ---------------------------------------------------------------------------------- */

/** Un par nuevo de llaves VAPID, en base64url como las guardamos en la base. */
export async function pushClaves(subject: string): Promise<PushClaves> {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  if (!jwk.d) throw new Error("La llave privada no salió.");
  return { public: b64url(publica), private: jwk.d, subject };
}

/** La llave pública de VAPID partida en x e y (para el JWK de la firma). */
const partir = (publica: string): { x: string; y: string } => {
  const bytes = b64urlBytes(publica);
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("La llave pública VAPID no sirve: se esperaba sin comprimir.");
  return { x: b64url(bytes.slice(1, 33)), y: b64url(bytes.slice(33, 65)) };
};

/** El JWT ES256 de VAPID (RFC 8292). */
export async function vapidJwt(claves: PushClaves, audiencia: string, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const codificar = (obj: Record<string, unknown>) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const cabeza = codificar({ typ: "JWT", alg: "ES256" });
  const cuerpo = codificar({ aud: audiencia, exp: ahora + 12 * 3600, sub: claves.subject });
  const privada = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", ...partir(claves.public), d: claves.private },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, new TextEncoder().encode(`${cabeza}.${cuerpo}`)));
  return `${cabeza}.${cuerpo}.${b64url(firma)}`;
}

/* --- El cuerpo cifrado (aes128gcm, RFC 8291) ------------------------------------------------------- */

/**
 * Cifra el mensaje como lo espera el navegador. Para las pruebas se pueden fijar
 * la sal y el par efímero del servidor (el RFC 8291 trae un ejemplo completo).
 */
export async function cifrarAes128gcm(
  destino: PushDestino,
  texto: string,
  fijar?: { salt?: Uint8Array; privada?: string; publica?: string },
): Promise<Uint8Array> {
  const uaPublica = b64urlBytes(destino.p256dh);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4) throw new Error("La llave de la suscripción no sirve.");
  const autenticacion = b64urlBytes(destino.auth);
  const textoBytes = new TextEncoder().encode(texto);

  // La llave efímera del servidor de aplicación.
  let privada: CryptoKey;
  let asPublica: Uint8Array;
  if (fijar?.privada && fijar.publica) {
    asPublica = b64urlBytes(fijar.publica);
    privada = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: b64url(asPublica.slice(1, 33)), y: b64url(asPublica.slice(33, 65)), d: fijar.privada },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    privada = par.privateKey;
    asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  }

  // 1. El secreto compartido con la suscripción.
  const uaJwk = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64url(uaPublica.slice(1, 33)), y: b64url(uaPublica.slice(33, 65)) }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaJwk }, privada, 256));

  // 2. Combinar con el secreto de autenticación (RFC 8291, 3.2).
  const prkLlave = await hmac(autenticacion, ecdh);
  const keyInfo = juntar(new TextEncoder().encode("WebPush: info"), [0], uaPublica, asPublica);
  const ikm = await hmac(prkLlave, juntar(keyInfo, [1]));

  // 3. El contenido (RFC 8188): una sal por mensaje.
  const salt = fijar?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, juntar(new TextEncoder().encode("Content-Encoding: aes128gcm"), [0], [1]))).slice(0, 16);
  const nonce = (await hmac(prk, juntar(new TextEncoder().encode("Content-Encoding: nonce"), [0], [1]))).slice(0, 12);

  // 4. Un solo registro: el texto y el delimitador final (0x02).
  const cekKey = await crypto.subtle.importKey("raw", cek as unknown as ArrayBuffer, { name: "AES-GCM", length: 128 }, false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as unknown as ArrayBuffer, tagLength: 128 }, cekKey, juntar(textoBytes, [2]) as unknown as ArrayBuffer),
  );

  // 5. El encabezado del cuerpo: sal ‖ tamaño del registro (4096) ‖ largo de la llave ‖ la llave efímera.
  const header = juntar(salt, [0x00, 0x00, 0x10, 0x00], [asPublica.length], asPublica);
  return juntar(header, cifrado);
}

/* --- El envío -------------------------------------------------------------------------------------- */

export interface PushResultado {
  ok: boolean;
  /** El endpoint respondió 404 o 410: la suscripción se murió, hay que borrarla. */
  gone?: boolean;
}

/** Despacha un aviso cifrado. Nunca lanza: un aviso que falla no debe tumbar lo demás. */
export async function pushEnviar(
  destino: PushDestino,
  mensaje: PushMensaje,
  claves: PushClaves,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResultado> {
  try {
    const cuerpo = await cifrarAes128gcm(destino, JSON.stringify(mensaje));
    const origen = new URL(destino.endpoint).origin;
    const jwt = await vapidJwt(claves, origen);
    const respuesta = await fetchImpl(destino.endpoint, {
      method: "POST",
      headers: {
        "TTL": String(mensaje.ttl ?? 60),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Urgency": "high",
        "Authorization": `vapid t=${jwt}, k=${claves.public}`,
      },
      body: cuerpo as unknown as BodyInit,
    });
    if (respuesta.status === 404 || respuesta.status === 410) return { ok: false, gone: true };
    return { ok: respuesta.status >= 200 && respuesta.status < 300 };
  } catch {
    return { ok: false };
  }
}
// --- fin push

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const multiline = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Para reconocer la misma pregunta en la bandeja de aprendizaje (como pilo-ia). */
const normalize = (q: string) =>
  q.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);

const OTP_PURPOSE = "soporte_ingreso";
const OTP_TTL = 600;
const OTP_WAIT = 60;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada correctamente." }, 500);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "El pedido no es JSON." }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "El pedido no es JSON." }, 400);
  const action = String(body.action ?? "");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const visitor = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const origin = request.headers.get("Origin") ?? "";
  const site = /^https?:\/\/[^/]+$/.test(origin) ? origin : "";
  const portalUrl = Deno.env.get("SOPORTE_PORTAL_URL") || "https://planeacion.udes.edu.co/agentes";
  const salt = Deno.env.get("PILO_VISITOR_SALT") || serviceKey;

  // --- El límite por dirección (como pilo-cuentas): solo queda una huella con sal diaria. ---
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-direccion";
  const limited = async (scope: string, limit: number, windowSeconds: number, key = ip): Promise<number | null> => {
    const now = Date.now();
    const start = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
    const visitorId = (await sha256(`${salt}|${new Date().toISOString().slice(0, 10)}|soporte:${scope}|${key}`)).slice(0, 40);
    const { data, error } = await admin.rpc("pilo_visitor_hit", { p_visitor: visitorId, p_window_start: new Date(start).toISOString() });
    // Sin la tabla del límite no se limita: mejor atender que dejar a todos fuera.
    if (error) return null;
    return Number(data ?? 0) > limit ? Math.max(1, Math.ceil((start + windowSeconds * 1000 - now) / 1000)) : null;
  };
  const tooFast = (retry: number) => json({ error: "Va muy rápido: espere un momento antes de volver a intentarlo.", code: "limite", retry_after: retry }, 429, { "Retry-After": String(retry) });

  /** Un error de la base: los mensajes de sus funciones ya están en español para la persona. */
  const fail = (error: { message?: string; code?: string } | null, fallback = "No pude completar la acción.") => {
    const m = error?.message ?? "";
    if (/could not find the function|schema cache|does not exist/i.test(m)) return json({ error: "Falta instalar las migraciones 0181 y 0182.", code: "migracion" }, 500);
    if (error?.code === "42501") return json({ error: m || "No tiene acceso.", code: "acceso" }, 403);
    if (error?.code === "23514" || error?.code === "22023" || error?.code === "23505") return json({ error: m || fallback, code: "regla" }, 409);
    return json({ error: fallback, code: "error" }, 500);
  };

  /** Avisa por Broadcast (mínimo, sin texto) a quienes tienen el canal de la conversación. */
  const ping = async (channel: string, event: string, payload: Record<string, unknown> = {}) => {
    try {
      await fetch(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ messages: [{ topic: `soporte:${channel}`, event, payload, private: false }] }),
      });
    } catch {
      /* el aviso es un atajo: la persona también consulta cada pocos segundos */
    }
  };

  /** Le pide a la función `correos` que envíe un aviso. Solo ella tiene el servidor de correo. */
  const mail = async (to: string, fields: { asunto: string; titulo?: string; mensaje: string; nombre?: string; boton?: string; enlace?: string; nota?: string }): Promise<boolean> => {
    try {
      const reply = await fetch(Deno.env.get("CORREOS_FUNCION_URL") || `${url.replace(/\/+$/, "")}/functions/v1/correos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({ action: "soporte", to, sitio: site, ...fields }),
      });
      const out = (await reply.json().catch(() => null)) as { ok?: boolean } | null;
      return Boolean(reply.ok && out?.ok);
    } catch {
      return false;
    }
  };

  /** El secreto de reanudación, cifrado con la llave del entorno (o una derivada). */
  const llaveResume = async (): Promise<CryptoKey> => {
    const frase = Deno.env.get("SOPORTE_RESUME_KEY") || serviceKey;
    const semilla = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(frase)));
    return crypto.subtle.importKey("raw", semilla as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
  };
  const cifrarSecreto = async (texto: string): Promise<string> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, await llaveResume(), new TextEncoder().encode(texto) as unknown as ArrayBuffer));
    return b64url(juntar(iv, datos));
  };
  const descifrarSecreto = async (cifrado: string): Promise<string> => {
    const todo = b64urlBytes(cifrado);
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: todo.slice(0, 12) as unknown as ArrayBuffer }, await llaveResume(), todo.slice(12) as unknown as ArrayBuffer);
    return new TextDecoder().decode(claro);
  };

  /** Las llaves VAPID de Web Push (0184), si el director las ha puesto. */
  const pushConfig = async (): Promise<PushClaves | null> => {
    const { data } = await admin.from("support_push_config").select("public_key, private_key, subject").eq("id", 1).maybeSingle();
    const c = data as { public_key: string | null; private_key: string | null; subject: string } | null;
    return c?.public_key && c.private_key ? { public: c.public_key, private: c.private_key, subject: c.subject } : null;
  };

  /** Le avisa a un agente por todos los navegadores donde aceptó avisos. */
  const pushAgente = async (agentId: string, mensaje: PushMensaje): Promise<void> => {
    try {
      const claves = await pushConfig();
      if (!claves) return;
      const { data } = await admin.from("support_push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("agent_id", agentId).limit(20);
      for (const sub of (data ?? []) as { id: string; endpoint: string; p256dh: string; auth_key: string }[]) {
        const salida = await pushEnviar({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth_key }, mensaje, claves);
        if (salida.gone) await admin.from("support_push_subscriptions").delete().eq("id", sub.id);
        else if (salida.ok) await admin.from("support_push_subscriptions").update({ last_seen_at: new Date().toISOString() }).eq("id", sub.id);
      }
    } catch {
      /* un aviso que falla no frena nada */
    }
  };

  /** Tras el tick: una oferta nueva se avisa por push, una por ventana de aceptación. */
  const avisarOfertas = async (): Promise<void> => {
    try {
      const pol = (await admin.from("support_assignment_policy").select("accept_seconds").eq("id", 1).maybeSingle()).data as { accept_seconds?: number } | null;
      const acepta = Number(pol?.accept_seconds) || 45;
      const { data } = await admin.from("support_conversations").select("id, offered_to, offer_expires_at, offered_push_at").eq("status", "offered").not("offered_to", "is", null).limit(10);
      for (const c of (data ?? []) as { id: string; offered_to: string | null; offer_expires_at: string | null; offered_push_at: string | null }[]) {
        const vence = Date.parse(c.offer_expires_at ?? "");
        if (!vence || !c.offered_to) continue;
        if (c.offered_push_at && Date.parse(c.offered_push_at) >= vence - acepta * 1000) continue;
        const { data: tomada } = await admin.from("support_conversations").update({ offered_push_at: new Date().toISOString() }).eq("id", c.id)
          .or(`offered_push_at.is.null,offered_push_at.lt.${new Date(vence - acepta * 1000).toISOString()}`).select("id");
        if (!tomada?.length) continue;
        await pushAgente(c.offered_to, { titulo: "Nueva conversación para ti", cuerpo: `Tiene ${acepta} segundos para aceptarla.`, tag: c.id, url: "/agentes", ttl: Math.max(30, acepta) });
      }
    } catch {
      /* el aviso es un atajo */
    }
  };

  /** Lo que nadie toma se escala al director, con calma entre avisos (0184). */
  const avisarEscalado = async (): Promise<void> => {
    try {
      const pol = (await admin.from("support_assignment_policy").select("escalate_after_minutes, escalate_cooldown_hours").eq("id", 1).maybeSingle()).data as { escalate_after_minutes?: number; escalate_cooldown_hours?: number } | null;
      const despues = Number(pol?.escalate_after_minutes) || 15;
      const calma = Number(pol?.escalate_cooldown_hours) || 2;
      const hace = new Date(Date.now() - despues * 60000).toISOString();
      const { data: filas } = await admin.from("support_conversations").select("id, space, contact_id")
        .in("status", ["queued", "offered"])
        .or(`waiting_since.lt.${hace},and(queued_at.lt.${hace},waiting_since.is.null)`)
        .or(`escalated_at.is.null,escalated_at.lt.${new Date().toISOString()}`)
        .limit(4);
      if (!filas?.length) return;
      const directores = (await admin.from("support_agents").select("id, name, email").eq("role", "director").eq("active", true).order("last_seen_at", { ascending: false, nullsFirst: false }).limit(3)).data as { id: string; name: string; email: string }[] | null;
      if (!directores?.length) return;
      for (const c of filas as { id: string; space: string; contact_id: string }[]) {
        const { data: tomada } = await admin.from("support_conversations").update({ escalated_at: new Date(Date.now() + calma * 3600000).toISOString() })
          .eq("id", c.id).or(`escalated_at.is.null,escalated_at.lt.${new Date().toISOString()}`).select("id");
        if (!tomada?.length) continue;
        const nombre = ((await admin.from("support_contacts").select("name").eq("id", c.contact_id).maybeSingle()).data as { name: string } | null)?.name ?? "";
        for (const d of directores) {
          await mail(d.email, {
            asunto: "Nadie ha tomado una conversación",
            titulo: "Una conversación sigue esperando",
            nombre: d.name,
            mensaje: `Lleva más de ${despues} minutos en la fila y nadie la ha aceptado. La persona escribió desde ${c.space === "planeacion" ? "Pilo" : "Pilo Académico"}${nombre ? ` y se llama ${nombre}` : ""}.`,
            boton: "Ver la cola",
            enlace: `${portalUrl.replace(/\/+$/, "")}/director`,
          });
          void pushAgente(d.id, { titulo: "Nadie ha tomado una conversación", cuerpo: "Lleva rato en la fila. Revise la cola.", tag: c.id, url: "/agentes/director", ttl: 600 });
        }
      }
    } catch {
      /* el aviso es un atajo */
    }
  };

  /** Qué debe traer un archivo según su extensión: los primeros bytes (el «tipo real»). */
  const MAGICOS: Record<string, number[]> = {
    jpg: [0xff, 0xd8, 0xff],
    png: [0x89, 0x50, 0x4e, 0x47],
    gif: [0x47, 0x49, 0x46, 0x38],
    webp: [0x52, 0x49, 0x46, 0x46],
    pdf: [0x25, 0x50, 0x44, 0x46],
    doc: [0xd0, 0xcf, 0x11, 0xe0],
    docx: [0x50, 0x4b, 0x03, 0x04],
    xls: [0xd0, 0xcf, 0x11, 0xe0],
    xlsx: [0x50, 0x4b, 0x03, 0x04],
  };
  /** Mira los primeros bytes del archivo subido: la extensión puede mentir. */
  const archivoReal = async (ruta: string, nombre: string): Promise<boolean> => {
    try {
      const ext = extensionOf(nombre);
      const firma = MAGICOS[ext];
      if (!firma) return true;
      const url = await admin.storage.from("support-attachments").createSignedUrl(ruta, 30);
      if (!url.data?.signedUrl) return false;
      const cabeza = await fetch(url.data.signedUrl, { headers: { Range: "bytes=0-15" } });
      if (!cabeza.ok) return false;
      const bytes = new Uint8Array(await cabeza.arrayBuffer());
      const webp = ext === "webp" && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
      return webp || firma.every((b, i) => bytes[i] === b);
    } catch {
      return false;
    }
  };

  /** La conversación de la persona, si el secreto coincide con la huella guardada. */
  const mine = async () => {
    const id = text(body.id, 40);
    const secret = text(body.secret, 80);
    if (!UUID.test(id) || secret.length < 32) return null;
    const hash = await sha256(secret);
    const { data } = await admin.from("support_conversations").select("channel_key, contact_id, space, status").eq("id", id).eq("secret_hash", hash).maybeSingle();
    const row = data as { channel_key: string; contact_id: string; space: string; status: string } | null;
    return row ? { id, hash, channel: row.channel_key, contactId: row.contact_id, space: row.space, status: row.status } : null;
  };
  const denied = () => json({ error: "No encontramos esa conversación.", code: "acceso" }, 403);

  /** Quien llama como agente: su sesión. Devuelve el cliente con esa sesión y su fila. */
  const agent = async () => {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return null;
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await caller.rpc("support_claim");
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string; name?: string; role?: string } | null;
    if (error || !row?.id) return null;
    return { caller, id: row.id, name: String(row.name ?? ""), role: String(row.role ?? "agent") };
  };
  const noAgent = () => json({ error: "No tiene acceso al portal de agentes.", code: "acceso" }, 403);

  try {
    /* --- La persona ------------------------------------------------------------------------- */
    if (action === "portal") {
      const { data, error } = await admin.rpc("support_portal_state", { p_space: text(body.space, 20) });
      if (error) return json({ agent_on: false, open: false, online: 0, messages: {} });
      return json(data);
    }

    if (action === "crear") {
      const retry = await limited("c", 6, 3600);
      if (retry) return tooFast(retry);
      // El campo escondido que solo un formulario de verdad deja vacío.
      if (text(body.web, 40)) return json({ ok: true, id: crypto.randomUUID(), secret: hex(32), channel: hex(16), after_hours: false });
      // El captcha invisible de Cloudflare, solo si la universidad lo configuró.
      const turnstile = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (turnstile) {
        const token = text(body.turnstile, 4000);
        if (!token) return json({ error: "Confirme que no es un robot.", code: "captcha" }, 400);
        try {
          const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret: turnstile, response: token, remoteip: ip }),
          });
          const out = (await r.json()) as { success?: boolean } | null;
          if (!out?.success) return json({ error: "Confirme que no es un robot.", code: "captcha" }, 400);
        } catch {
          return json({ error: "Confirme que no es un robot.", code: "captcha" }, 400);
        }
      }
      const space = text(body.space, 20);
      const name = text(body.nombre, 120);
      const email = text(body.correo, 160).toLowerCase();
      const phone = text(body.telefono, 30);
      const city = text(body.ciudad, 80);
      const policy = text(body.politica, 40);
      if (name.length < 3 || name.split(" ").length < 2) return json({ error: "Escriba su nombre completo.", code: "datos" }, 400);
      if (!EMAIL.test(email)) return json({ error: "Escriba un correo válido.", code: "datos" }, 400);
      if (phone.replace(/\D/g, "").length < 7) return json({ error: "Escriba un teléfono de contacto.", code: "datos" }, 400);
      if (city.length < 2) return json({ error: "Escriba su ciudad.", code: "datos" }, 400);
      if (body.autoriza !== true || !policy) return json({ error: "Para pasar con un agente debe autorizar el tratamiento de sus datos personales.", code: "consentimiento" }, 400);

      const secret = hex(32);
      const channel = hex(16);
      const question = text(body.pregunta, 600);
      const { data, error } = await admin.rpc("support_open", {
        p_space: space,
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_city: city,
        p_policy: policy,
        p_summary: multiline(body.resumen, 3900),
        p_question: question,
        p_secret_hash: await sha256(secret),
        p_channel_key: channel,
        p_ip_hash: (await sha256(`${salt}|${ip}`)).slice(0, 32),
      });
      if (error) return fail(error, "No pude pasar su solicitud a un agente.");
      const out = data as { id: string; after_hours: boolean };
      // El secreto, cifrado, para que el enlace de reanudación pueda traer de vuelta la conversación (0184).
      try {
        await admin.from("support_resume_secrets").upsert({ conversation_id: out.id, crypt: await cifrarSecreto(secret) });
      } catch {
        /* sin él solo falta el «vuelva a su conversación» */
      }
      // Lo que Pilo no supo responder alimenta la bandeja de aprendizaje.
      if (question.length >= 2) await admin.rpc("pilo_inbox_add", { p_question: question, p_qnorm: normalize(question), p_reason: "sin_respuesta", p_kind: "agente" });
      if (out.after_hours) {
        await mail(email, {
          asunto: "Recibimos su solicitud",
          titulo: "Ya tenemos sus datos",
          nombre: name,
          mensaje: "Ahora no hay agentes disponibles. Dejamos su solicitud en la fila con el resumen de lo que conversó con Pilo.\nCuando un agente de la UDES la tome, le avisaremos a este correo.",
          nota: "Si usted no hizo esta solicitud, ignore este mensaje.",
        });
      }
      return json({ ok: true, id: out.id, secret, channel, after_hours: out.after_hours });
    }

    if (action === "estado") {
      const conv = await mine();
      if (!conv) return denied();
      await admin.rpc("support_tick");
      // De paso: las ofertas nuevas se avisan por push y lo que nadie toma se escala (0184).
      await Promise.all([avisarOfertas(), avisarEscalado()]);
      const after = Number(body.despues) > 0 ? Number(body.despues) : 0;
      const { data, error } = await admin.rpc("support_student_view", { p_conv: conv.id, p_hash: conv.hash, p_after: after });
      if (error) return fail(error);
      return json(data);
    }

    if (action === "mensaje") {
      const conv = await mine();
      if (!conv) return denied();
      const retry = await limited("m", 60, 300, conv.id);
      if (retry) return tooFast(retry);
      const files = (Array.isArray(body.archivos) ? body.archivos : [])
        .slice(0, MAX_FILES_PER_MESSAGE)
        .map((f) => ({ path: text((f as { ruta?: unknown }).ruta, 200), name: text((f as { nombre?: unknown }).nombre, 120) }));
      // El tipo real del archivo: la extensión puede mentir (0184). El que no pasa, se borra.
      for (const f of files) {
        if (!f.path.startsWith(`${conv.id}/`)) return json({ error: "Un archivo no pasó la revisión de seguridad.", code: "archivo" }, 400);
        if (f.name && !(await archivoReal(f.path, f.name))) {
          await admin.storage.from("support-attachments").remove([f.path]);
          return json({ error: `«${f.name}» no es lo que dice ser. Conviértalo a PDF o imagen y vuelva a subirlo.`, code: "archivo" }, 400);
        }
      }
      const { data, error } = await admin.rpc("support_student_send", { p_conv: conv.id, p_hash: conv.hash, p_body: multiline(body.texto, 4000), p_files: files });
      if (error) return fail(error, "No pude enviar su mensaje.");
      await ping(conv.channel, "nuevo", { from: "student" });
      // Si el agente tiene el portal cerrado, le llega el aviso (0184).
      const abierta = (await admin.from("support_conversations").select("assignee_id, status").eq("id", conv.id).maybeSingle()).data as { assignee_id: string | null; status: string } | null;
      if (abierta?.assignee_id && abierta.status === "open") await pushAgente(abierta.assignee_id, { titulo: "La persona le escribió", cuerpo: "Hay un mensaje nuevo en su conversación.", tag: conv.id, url: "/agentes", ttl: 120 });
      return json({ ok: true, id: data });
    }

    if (action === "subir") {
      const conv = await mine();
      if (!conv) return denied();
      const retry = await limited("u", 30, 600, conv.id);
      if (retry) return tooFast(retry);
      const name = text(body.nombre, 120);
      const problem = attachmentProblem({ name, type: text(body.tipo, 120), size: Number(body.tamano) || 0 });
      if (problem) return json({ error: problem, code: "archivo" }, 400);
      const path = `${conv.id}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`;
      const { data, error } = await admin.storage.from("support-attachments").createSignedUploadUrl(path);
      if (error || !data) return json({ error: "No pude preparar la subida del archivo.", code: "error" }, 500);
      return json({ ok: true, path, token: data.token });
    }

    if (action === "descargar") {
      const conv = await mine();
      if (!conv) return denied();
      const path = text(body.ruta, 220);
      // Solo archivos de mensajes que la persona puede ver (no de notas privadas).
      const file = await admin.from("support_attachments").select("path, support_messages!inner(kind, staff_only)").eq("conversation_id", conv.id).eq("path", path).maybeSingle();
      const m = (file.data as { support_messages?: { kind: string; staff_only: boolean } } | null)?.support_messages;
      if (!file.data || !m || m.kind === "private_note" || m.staff_only) return denied();
      const signed = await admin.storage.from("support-attachments").createSignedUrl(path, 120);
      if (signed.error || !signed.data) return json({ error: "No pude abrir el archivo.", code: "error" }, 500);
      return json({ ok: true, url: signed.data.signedUrl });
    }

    if (action === "leer") {
      const conv = await mine();
      if (!conv) return denied();
      const { error } = await admin.rpc("support_student_read", { p_conv: conv.id, p_hash: conv.hash });
      if (error) return fail(error);
      await ping(conv.channel, "leido");
      return json({ ok: true });
    }

    if (action === "calificar") {
      const conv = await mine();
      if (!conv) return denied();
      const { error } = await admin.rpc("support_student_rate", { p_conv: conv.id, p_hash: conv.hash, p_score: Number(body.puntaje), p_comment: text(body.comentario, 500) });
      if (error) return fail(error, "No pude guardar su calificación.");
      return json({ ok: true });
    }

    if (action === "cancelar") {
      const conv = await mine();
      if (!conv) return denied();
      const { error } = await admin.rpc("support_student_cancel", { p_conv: conv.id, p_hash: conv.hash });
      if (error) return fail(error);
      await ping(conv.channel, "estado");
      return json({ ok: true });
    }

    /* --- El ingreso de los agentes: un código al correo, sin contraseñas ---------------------- */
    if (action === "ingreso_enviar") {
      const retry = await limited("i", 10, 3600);
      if (retry) return tooFast(retry);
      const email = text(body.correo, 160).toLowerCase();
      if (!EMAIL.test(email)) return json({ error: "Escriba un correo válido.", code: "datos" }, 400);
      const reply = { ok: true, ttl: OTP_TTL, wait: OTP_WAIT };
      // Responde igual exista o no el agente: así nadie averigua quién está en el equipo.
      const found = await admin.from("support_agents").select("id").eq("email", email).eq("active", true).maybeSingle();
      if (!found.data) return json(reply);
      const code = [...crypto.getRandomValues(new Uint32Array(6))].map((n) => String(n % 10)).join("");
      const emailHash = await sha256(`otp|${salt}|${email}`);
      const issued = await admin.rpc("correo_codigo_emitir", {
        p_purpose: OTP_PURPOSE,
        p_email: emailHash,
        p_code: await sha256(`otp|${salt}|${email}|${code}`),
        p_ttl: OTP_TTL,
        p_wait: OTP_WAIT,
        p_tries: 5,
        p_hourly: 6,
      });
      if (issued.error) return json({ error: "Falta instalar la migración 0175 para pedir el código.", code: "migracion" }, 500);
      const out = issued.data as { ok?: boolean; reason?: string; wait?: number } | null;
      if (!out?.ok) {
        const wait = Math.max(1, Number(out?.wait) || OTP_WAIT);
        const message = out?.reason === "limite" ? "Ya se pidieron varios códigos. Intente de nuevo en una hora." : `Espere ${wait} segundos antes de pedir otro código.`;
        return json({ error: message, code: "espera", retry_after: wait }, 429, { "Retry-After": String(wait) });
      }
      const sent = await mail(email, {
        asunto: "Su código del Portal de agentes",
        titulo: "Su código para entrar",
        mensaje: `Su código es ${code}.\nEscríbalo en el Portal de agentes. Vale por 10 minutos y sirve una sola vez.`,
        nota: "Nadie de la universidad le pedirá este código por teléfono ni por mensaje. Si usted no lo pidió, ignore este correo.",
      });
      if (!sent) {
        // Un código que no salió no debe frenar el siguiente intento.
        await admin.from("correo_codigos").update({ used_at: new Date().toISOString() }).eq("purpose", OTP_PURPOSE).eq("email_hash", emailHash).is("used_at", null);
        return json({ error: "No pudimos enviarle el código. Intente de nuevo en un momento.", code: "correos" }, 502);
      }
      return json(reply);
    }

    if (action === "ingreso_verificar") {
      const retry = await limited("v", 30, 3600);
      if (retry) return tooFast(retry);
      const email = text(body.correo, 160).toLowerCase();
      const code = text(body.codigo, 12).replace(/\s/g, "");
      if (!EMAIL.test(email) || !/^[0-9]{6}$/.test(code)) return json({ error: "Escriba el código de 6 cifras.", code: "codigo" }, 400);
      const ticket = hex(24);
      const emailHash = await sha256(`otp|${salt}|${email}`);
      const checked = await admin.rpc("correo_codigo_verificar", {
        p_purpose: OTP_PURPOSE,
        p_email: emailHash,
        p_code: await sha256(`otp|${salt}|${email}|${code}`),
        p_ticket: await sha256(ticket),
      });
      if (checked.error) return json({ error: "No pude comprobar el código.", code: "error" }, 500);
      const out = checked.data as { ok?: boolean; reason?: string; left?: number } | null;
      if (!out?.ok) {
        if (out?.reason === "vencido") return json({ error: "El código venció o no hay uno pendiente. Pida uno nuevo.", code: "codigo" }, 400);
        if (out?.reason === "bloqueado") return json({ error: "Agotó los intentos. Pida un código nuevo.", code: "codigo" }, 400);
        const left = Number(out?.left) || 0;
        return json({ error: `No coincide. Le ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.`, code: "codigo" }, 400);
      }
      // El código sirve una sola vez.
      await admin.rpc("correo_codigo_ticket", { p_purpose: OTP_PURPOSE, p_email: emailHash, p_ticket: await sha256(ticket), p_consume: true });
      const found = await admin.from("support_agents").select("id").eq("email", email).eq("active", true).maybeSingle();
      if (!found.data) return json({ error: "No tiene acceso al portal de agentes.", code: "acceso" }, 403);
      // La cuenta de Auth se crea la primera vez (sin contraseña); luego se abre la sesión con un enlace de un solo uso.
      await admin.auth.admin.createUser({ email, email_confirm: true });
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = link.data?.properties?.hashed_token;
      if (link.error || !tokenHash) return json({ error: "No pude abrir su sesión. Intente de nuevo.", code: "error" }, 500);
      const session = await visitor().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (session.error || !session.data.session) return json({ error: "No pude abrir su sesión. Intente de nuevo.", code: "error" }, 500);
      return json({ ok: true, session: { access_token: session.data.session.access_token, refresh_token: session.data.session.refresh_token } });
    }

    /* --- Los agentes ---------------------------------------------------------------------- */
    if (action === "invitar") {
      const me = await agent();
      if (!me || me.role !== "director") return json({ error: "Solo el director invita agentes.", code: "acceso" }, 403);
      const id = text(body.agente_id, 40);
      const { data } = UUID.test(id) ? await admin.from("support_agents").select("id, name, email, role").eq("id", id).maybeSingle() : { data: null };
      const target = data as { id: string; name: string; email: string; role: string } | null;
      if (!target) return json({ error: "No encontré a ese agente.", code: "datos" }, 404);
      const sent = await mail(target.email, {
        asunto: "Le dieron acceso al Portal de agentes de la UDES",
        titulo: "Bienvenido al Portal de agentes",
        nombre: target.name,
        mensaje: `${me.name} le dio acceso como ${target.role === "director" ? "director de agentes" : "agente"}.\nEntre con su cuenta institucional de Microsoft o pida un código a este correo. No hay contraseñas que recordar.`,
        boton: "Entrar al portal",
        enlace: `${portalUrl.replace(/\/+$/, "")}/ingreso`,
      });
      if (!sent) return json({ error: "No pude enviar la invitación. Revise la conexión de correos.", code: "correos" }, 502);
      await admin.from("support_agents").update({ invited_at: new Date().toISOString() }).eq("id", target.id);
      return json({ ok: true });
    }

    if (action === "resolver") {
      const me = await agent();
      if (!me) return noAgent();
      const id = text(body.id, 40);
      if (!UUID.test(id)) return json({ error: "Conversación desconocida.", code: "datos" }, 400);
      const closed = await me.caller.rpc("support_resolve", { p_conv: id });
      if (closed.error) return fail(closed.error, "No pude cerrar la conversación.");
      const conv = await admin.from("support_conversations").select("channel_key, contact_id").eq("id", id).maybeSingle();
      const c = conv.data as { channel_key: string; contact_id: string } | null;
      if (c) await ping(c.channel_key, "estado");
      let transcript = false;
      if (c && body.transcripcion === true) {
        const [contact, msgs] = await Promise.all([
          admin.from("support_contacts").select("name, email").eq("id", c.contact_id).maybeSingle(),
          admin.from("support_messages").select("kind, author_name, body, created_at").eq("conversation_id", id).in("kind", ["incoming", "outgoing"]).eq("staff_only", false).order("id"),
        ]);
        const to = contact.data as { name: string; email: string } | null;
        if (to && msgs.data?.length) {
          const when = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
          const lines = (msgs.data as { author_name: string; body: string; created_at: string }[]).map((m) => `[${when(m.created_at)}] ${m.author_name || "UDES"}: ${m.body}`.slice(0, 1200));
          transcript = await mail(to.email, {
            asunto: "Transcripción de su conversación con la UDES",
            titulo: "Esta fue su conversación",
            nombre: to.name,
            mensaje: lines.join("\n").slice(0, 11000),
            nota: "Guárdela por si la necesita. Pilo siempre está aquí cuando lo necesite.",
          });
        }
      }
      return json({ ok: true, transcript });
    }

    if (action === "tomada") {
      const me = await agent();
      if (!me) return noAgent();
      const id = text(body.id, 40);
      const conv = UUID.test(id) ? await admin.from("support_conversations").select("assignee_id, after_hours, notified_at, contact_id, channel_key").eq("id", id).maybeSingle() : { data: null };
      const c = conv.data as { assignee_id: string | null; after_hours: boolean; notified_at: string | null; contact_id: string; channel_key: string } | null;
      if (!c || c.assignee_id !== me.id) return json({ error: "Conversación desconocida.", code: "datos" }, 400);
      await ping(c.channel_key, "estado");
      if (c.after_hours && !c.notified_at) {
        const contact = await admin.from("support_contacts").select("name, email").eq("id", c.contact_id).maybeSingle();
        const to = contact.data as { name: string; email: string } | null;
        if (to) {
          const sent = await mail(to.email, {
            asunto: "Un agente de la UDES ya atiende su solicitud",
            titulo: "Ya lo atiende un agente",
            nombre: to.name,
            mensaje: `${me.name} tomó su solicitud. Vuelva a Pilo en el portal donde nos escribió para continuar la conversación.`,
          });
          if (sent) await admin.from("support_conversations").update({ notified_at: new Date().toISOString() }).eq("id", id);
        }
      }
      return json({ ok: true });
    }

    /* --- Reanudación y avisos (0184) --------------------------------------------------------- */
    if (action === "reanudar") {
      const retry = await limited("r", 30, 3600);
      if (retry) return tooFast(retry);
      const token = text(body.token, 120);
      if (token.length < 32) return json({ error: "El enlace no sirve: pida otro desde su conversación.", code: "datos" }, 400);
      const { data: tomado } = await admin.from("support_resume_tokens").update({ used_at: new Date().toISOString() })
        .eq("token_hash", await sha256(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).select("conversation_id");
      const fila = (tomado as { conversation_id: string }[] | null)?.[0];
      if (!fila) return denied();
      const par = (await admin.from("support_resume_secrets").select("crypt").eq("conversation_id", fila.conversation_id).maybeSingle()).data as { crypt: string } | null;
      const conv = (await admin.from("support_conversations").select("id, channel_key, space, contact_id").eq("id", fila.conversation_id).maybeSingle()).data as { id: string; channel_key: string; space: string; contact_id: string } | null;
      if (!par || !conv) return denied();
      let secreto = "";
      try {
        secreto = await descifrarSecreto(par.crypt);
      } catch {
        return denied();
      }
      const contacto = (await admin.from("support_contacts").select("name, email").eq("id", conv.contact_id).maybeSingle()).data as { name: string; email: string } | null;
      return json({ ok: true, id: conv.id, secret: secreto, channel: conv.channel_key, space: conv.space, nombre: contacto?.name ?? "", correo: contacto?.email ?? "" });
    }

    if (action === "aviso_estudiante") {
      const me = await agent();
      if (!me) return noAgent();
      const id = text(body.id, 40);
      const conv = UUID.test(id) ? await admin.from("support_conversations").select("id, status, assignee_id, contact_id, student_last_seen_at").eq("id", id).maybeSingle() : { data: null };
      const c = conv.data as { id: string; status: string; assignee_id: string | null; contact_id: string; student_last_seen_at: string | null } | null;
      if (!c || c.status !== "open" || (me.role !== "director" && c.assignee_id !== me.id)) return json({ error: "Conversación desconocida.", code: "datos" }, 400);
      const hace5 = new Date(Date.now() - 5 * 60000).toISOString();
      if (c.student_last_seen_at && c.student_last_seen_at > hace5) return json({ ok: true, mensaje: "La persona está viendo la conversación." });
      const hace30 = new Date(Date.now() - 30 * 60000).toISOString();
      const { data: tomada } = await admin.from("support_conversations").update({ aviso_at: new Date().toISOString() })
        .eq("id", c.id).or(`aviso_at.is.null,aviso_at.lt.${hace30}`).select("id");
      if (!tomada?.length) return json({ ok: true, mensaje: "Ya se avisó hace poco." });
      const token = hex(32);
      await admin.from("support_resume_tokens").insert({ conversation_id: c.id, token_hash: await sha256(token), expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
      const contacto = (await admin.from("support_contacts").select("name, email").eq("id", c.contact_id).maybeSingle()).data as { name: string; email: string } | null;
      if (!contacto) return json({ ok: true });
      const estudianteUrl = (Deno.env.get("SOPORTE_ESTUDIANTE_URL") || "https://planeacion.udes.edu.co/app").replace(/\/+$/, "");
      const enviado = await mail(contacto.email, {
        asunto: "Su agente de la UDES le respondió",
        titulo: "Vuelva a su conversación",
        nombre: contacto.name,
        mensaje: "Hay una respuesta nueva de su agente. Entre por el botón y siga donde lo dejó.",
        boton: "Volver a la conversación",
        enlace: `${estudianteUrl}?reanudar=${token}`,
      });
      return json({ ok: true, enviado });
    }

    /* --- Web Push: el navegador del agente pide avisos (0184) --------------------------------- */
    if (action === "push_clave") {
      const claves = await pushConfig();
      return json({ ok: true, public: claves?.public ?? null });
    }

    if (action === "push_guardar") {
      const me = await agent();
      if (!me) return noAgent();
      const retry = await limited("p", 40, 3600, me.id);
      if (retry) return tooFast(retry);
      const endpoint = text(body.endpoint, 600);
      const p256dh = text(body.p256dh, 200);
      const auth = text(body.auth, 200);
      if (!/^https:\/\//.test(endpoint) || p256dh.length < 40 || auth.length < 10) return json({ error: "Esa suscripción no sirve.", code: "datos" }, 400);
      const { error } = await admin.from("support_push_subscriptions").upsert({ agent_id: me.id, endpoint, p256dh, auth_key: auth }, { onConflict: "endpoint" });
      if (error) return json({ error: "No pude guardar el aviso.", code: "error" }, 500);
      return json({ ok: true });
    }

    if (action === "push_quitar") {
      const me = await agent();
      if (!me) return noAgent();
      await admin.from("support_push_subscriptions").delete().eq("agent_id", me.id).eq("endpoint", text(body.endpoint, 600));
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("soporte", error);
    return json({ error: "Algo salió mal. Intente de nuevo.", code: "error" }, 500);
  }
});
