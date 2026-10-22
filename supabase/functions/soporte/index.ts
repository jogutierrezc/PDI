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

   Variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (las
   pone la plataforma); opcionales: ALLOWED_ORIGIN, PILO_VISITOR_SALT,
   CORREOS_FUNCION_URL, SOPORTE_PORTAL_URL (por defecto https://planeacion.udes.edu.co/agentes).

   El bloque «adjuntos» es una copia de src/modules/soporte/adjuntos.ts (el
   editor de Supabase solo acepta un archivo); una prueba falla si se separan.

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
      const { data, error } = await admin.rpc("support_student_send", { p_conv: conv.id, p_hash: conv.hash, p_body: multiline(body.texto, 4000), p_files: files });
      if (error) return fail(error, "No pude enviar su mensaje.");
      await ping(conv.channel, "nuevo", { from: "student" });
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

    return json({ error: "Acción desconocida." }, 400);
  } catch (error) {
    console.error("soporte", error);
    return json({ error: "Algo salió mal. Intente de nuevo.", code: "error" }, 500);
  }
});
