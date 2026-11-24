/* =============================================================================
   conv-firma · envío de correos. Mismo camino que conv-avisos y rel-correos:
   modo «prueba» → Mailpit (REL_MAILPIT_HOST / REL_MAILPIT_PORT);
   modo «real»   → SMTP institucional (Sistema › Correos, o SMTP_*).
   El modo y el remitente salen de conv_aviso_config (0256): una sola perilla para todo el módulo.
   ========================================================================== */

import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";
import { asuntoDe, htmlDe, textoDe } from "./plantilla.ts";
import type { Idioma, Variables } from "./plantilla.ts";
import { appUrl, ENV, formatoCorreo } from "./util.ts";
import type { Cliente } from "./util.ts";

interface Conexion {
  host: string;
  port: number;
  seguridad: "none" | "ssl" | "starttls";
  user: string;
  pass: string;
}

export interface ConfigCorreo {
  modo: "prueba" | "real";
  remitente: string;
  conexion: Conexion | null;
  error: string;
}

export interface Adjunto {
  nombre: string;
  contenido: Uint8Array;
  tipo: string;
}

const MAILPIT = (): Conexion | null =>
  ENV("REL_MAILPIT_HOST") ? { host: ENV("REL_MAILPIT_HOST"), port: Number(ENV("REL_MAILPIT_PORT")) || 1025, seguridad: "none", user: "", pass: "" } : null;

function smtpInstitucional(ctx: { settings?: Record<string, unknown> | null; password?: string } | null): Conexion | null {
  const a = ctx?.settings ?? {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const puerto = (v: unknown, def: number) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? Number(v) : def);
  if (s(a.smtp_host)) {
    const seg = a.smtp_security === "ssl" ? "ssl" : a.smtp_security === "none" ? "none" : "starttls";
    return { host: s(a.smtp_host), port: puerto(a.smtp_port, 587), seguridad: seg, user: s(a.smtp_user), pass: (typeof ctx?.password === "string" && ctx.password) || ENV("SMTP_PASS") };
  }
  if (!ENV("SMTP_HOST")) return null;
  const port = puerto(ENV("SMTP_PORT"), 587);
  const modo = ENV("SMTP_SECURE").toLowerCase();
  const ssl = modo ? ["ssl", "tls", "true", "1"].includes(modo) : port === 465;
  return { host: ENV("SMTP_HOST"), port, seguridad: ["none", "no", "false", "0", "plain"].includes(modo) ? "none" : ssl ? "ssl" : "starttls", user: ENV("SMTP_USER"), pass: ENV("SMTP_PASS") };
}

function transporteDe(c: Conexion) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.seguridad === "ssl",
    requireTLS: c.seguridad === "starttls",
    ...(c.seguridad === "none" ? { ignoreTLS: true } : {}),
    ...(c.user ? { auth: { user: c.user, pass: c.pass } } : {}),
    connectionTimeout: 4_000,
    greetingTimeout: 4_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
}

/** Lee el modo (prueba | real) y el remitente de la configuración de avisos y resuelve el servidor de salida. */
export async function configCorreo(admin: Cliente): Promise<ConfigCorreo> {
  const { data } = await admin.from("conv_aviso_config").select("modo, remitente").eq("id", true).maybeSingle();
  const modo: "prueba" | "real" = data?.modo === "real" ? "real" : "prueba";
  const remitente = typeof data?.remitente === "string" && data.remitente.length >= 5 ? data.remitente : "Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>";
  if (modo === "prueba") {
    const m = MAILPIT();
    return { modo, remitente, conexion: m, error: m ? "" : "Falta configurar Mailpit en la función (REL_MAILPIT_HOST)." };
  }
  const { data: ctx } = await admin.rpc("correo_context", { p_hash: "", p_hook: "" });
  const c = (ctx && typeof ctx === "object" ? ctx : null) as { settings?: Record<string, unknown> | null; password?: string } | null;
  if (c?.settings && c.settings.enabled === false) return { modo, remitente, conexion: null, error: "El envío de correos está apagado en la intranet (Correos)." };
  const s = smtpInstitucional(c);
  return { modo, remitente, conexion: s, error: s ? "" : "Falta configurar el servidor de correo en la intranet (Correos › Remitentes y conexión)." };
}

/** El motivo en palabras de un fallo de envío. */
export function motivoCorreo(error: unknown): string {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  const n = Number(e.responseCode) || 0;
  if (code === "EAUTH" || [530, 534, 535].includes(n)) return "El servidor rechazó el usuario o la contraseña.";
  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT", "ECONNREFUSED", "EDNS", "ENOTFOUND", "ETLS", "EAI_AGAIN"].includes(code)) return "No se pudo conectar con el servidor de salida.";
  if (n === 553 || n === 550 || code === "EENVELOPE") return `Rechazado por el servidor (${n || "destinatario o remitente"}).`;
  if (n >= 400 && n < 500) return `El servidor pidió esperar (${n}).`;
  return n ? `El servidor no aceptó el mensaje (${n}).` : "El servidor no aceptó el mensaje.";
}

const logoCorreo = (): string => ENV("CONV_LOGO_URL") || `${appUrl()}/logo-udes-blanco.png`;

export interface Plantilla {
  clave: string;
  idioma: Idioma;
  asunto: string;
  cuerpo: string;
}

/** La plantilla (clave, idioma); si falta en ese idioma, la de español. */
export async function plantillaDe(admin: Cliente, clave: string, idioma: Idioma): Promise<Plantilla | null> {
  const { data } = await admin.from("conv_correo_plantillas").select("clave, idioma, asunto, cuerpo").eq("clave", clave).in("idioma", idioma === "es" ? ["es"] : [idioma, "es"]);
  const filas = (data ?? []) as Plantilla[];
  return filas.find((f) => f.idioma === idioma) ?? filas.find((f) => f.idioma === "es") ?? null;
}

const AVISO_CODIGO: Record<Idioma, string> = {
  es: "<p>Su código de verificación es <b>{{codigo_verificacion}}</b>. Vale por 10 minutos.</p>",
  en: "<p>Your verification code is <b>{{codigo_verificacion}}</b>. It is valid for 10 minutes.</p>",
};

/**
 * Envía una plantilla a una persona. Si la plantilla menciona el código de verificación en la plantilla
 * pero la oficina la editó y ya no lo trae, el código se agrega solo: el código SIEMPRE va en el correo.
 */
export async function enviarPlantilla(
  admin: Cliente,
  cfg: ConfigCorreo,
  p: { clave: string; idioma: Idioma; para: string; variables: Variables; exigirCodigo?: boolean; adjuntos?: Adjunto[] },
): Promise<void> {
  if (!formatoCorreo(p.para)) throw new Error("La dirección de correo no es válida.");
  if (!cfg.conexion) throw new Error(cfg.error || "No hay servidor de correo configurado.");
  const plantilla = await plantillaDe(admin, p.clave, p.idioma);
  if (!plantilla) throw new Error(`Falta la plantilla de correo «${p.clave}».`);
  let cuerpo = plantilla.cuerpo;
  if (p.exigirCodigo && !cuerpo.includes("{{codigo_verificacion}}")) cuerpo += AVISO_CODIGO[plantilla.idioma];
  const op = { idioma: plantilla.idioma, logo: logoCorreo(), prueba: cfg.modo === "prueba" };
  const asunto = `${op.prueba ? "[Prueba] " : ""}${asuntoDe(plantilla.asunto, p.variables)}`;
  const transporte = transporteDe(cfg.conexion);
  try {
    await transporte.sendMail({
      from: cfg.remitente,
      to: p.para,
      subject: asunto,
      text: textoDe(cuerpo, p.variables, op),
      html: htmlDe(cuerpo, p.variables, op),
      replyTo: (cfg.remitente.match(/<([^<>]+)>\s*$/)?.[1] ?? cfg.remitente).trim(),
      attachments: (p.adjuntos ?? []).map((a) => ({ filename: a.nombre, content: Buffer.from(a.contenido), contentType: a.tipo })),
    });
  } finally {
    try {
      transporte.close();
    } catch {
      // ya estaba cerrada
    }
  }
}
