/* =============================================================================
   Edge Function · conv-avisos

   Avisos de vencimiento de los convenios de Internacionalización (migración 0256).

   POST, tres acciones:

     { action: "ejecutar" }                  LA LLAMA EL CRON (cada hora; ver la cabecera de 0256).
         Protegida por el encabezado x-conv-cron (secreto de función CONV_AVISOS_CRON) o por la
         clave de servicio. Con la fecha y la hora de Bogotá decide qué reglas se cumplen hoy:
           · solo convenios firmados, no terminados, con fecha de terminación (no indefinidos);
           · una regla vence el día (fecha de terminación − días); si ese día no corrió (fin de
             semana, hora, caída) se recupera hasta 7 días después, nunca más atrás;
           · por convenio sale una sola regla por ejecución (la más reciente que se cumpla);
           · no repite: el índice único de conv_aviso_envios lo impide aunque corra dos veces;
           · con «detener al registrar renovación», una renovación anotada después de abrirse la
             ventana de la regla la cancela;
           · tope de convenios por ejecución (config) y error por convenio sin detener el resto.
     { action: "enviar", convenio_id, regla_id? }   «Enviar ahora»: sesión + int_puede_crear().
     { action: "prueba", asunto, cuerpo, idioma, para, destino: "mailpit"|"smtp", convenio_id? }
         Un correo de prueba de una plantilla (aunque no esté guardada), con un convenio real o de ejemplo.

   Destinatarios por regla: responsable (quien creó el convenio), coordinación (coordinadores de
   Internacionalización del campus del convenio), contacto de la institución (Directorio de
   Relaciones, conv_contactos_de) y dirección de Internacionalización (config). El contacto recibe
   el correo en el idioma del convenio; los internos, en español. Sin contacto: se avisa solo a los
   internos y la bitácora lo marca «sin_contacto».

   Servidores de salida, igual que rel-correos: modo «prueba» → Mailpit (REL_MAILPIT_HOST,
   REL_MAILPIT_PORT); modo «real» → SMTP institucional (Sistema › Correos o SMTP_*).

   Variables: CONV_AVISOS_CRON, CONV_URL_APP, CONV_LOGO_URL (todas opcionales salvo la primera
   para el cron), ALLOWED_ORIGIN. Despliegue:  supabase functions deploy conv-avisos --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import nodemailer from "npm:nodemailer@6.9.16";
import { asuntoDe, fechaLegible, formatoCorreo, htmlDe, textoDe } from "./plantilla.ts";
import type { Idioma, Variables } from "./plantilla.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": ENV("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-conv-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
// deno-lint-ignore no-explicit-any
type Cliente = any;
const cliente = (url: string, key: string, authorization?: string): Cliente =>
  createClient(url, key, { ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VENTANA_RECUPERACION = 7;
const PAUSA_SMTP_MS = 1_500;
const PRESUPUESTO_MS = 110_000;
const MAX_CONTACTOS = 5;

/* ---------- Fechas (Bogotá) ----------------------------------------------------------------- */

function ahoraBogota(): { fecha: string; minutos: number; diaSemana: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { fecha: `${g("year")}-${g("month")}-${g("day")}`, minutos: Number(g("hour")) * 60 + Number(g("minute")), diaSemana: dias.indexOf(g("weekday")) };
}
const utc = (f: string) => {
  const [a, m, d] = f.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};
const diasEntre = (hasta: string, desde: string) => Math.round((utc(hasta) - utc(desde)) / 86_400_000);
const sumarDias = (f: string, n: number) => new Date(utc(f) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------- Servidores de salida (como rel-correos) ------------------------------------------- */

interface Conexion {
  host: string;
  port: number;
  seguridad: "none" | "ssl" | "starttls";
  user: string;
  pass: string;
}

const MAILPIT = (): Conexion | null => (ENV("REL_MAILPIT_HOST") ? { host: ENV("REL_MAILPIT_HOST"), port: Number(ENV("REL_MAILPIT_PORT")) || 1025, seguridad: "none", user: "", pass: "" } : null);

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
    socketTimeout: 12_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
}

/** El motivo en palabras y si es del servidor (se reintenta) o del destinatario (rebote). */
function motivoDe(error: unknown): { texto: string; delServidor: boolean } {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  const n = Number(e.responseCode) || 0;
  if (code === "EAUTH" || [530, 534, 535].includes(n)) return { texto: "El servidor rechazó el usuario o la contraseña.", delServidor: true };
  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT", "ECONNREFUSED", "EDNS", "ENOTFOUND", "ETLS", "EAI_AGAIN"].includes(code)) return { texto: "No se pudo conectar con el servidor de salida.", delServidor: true };
  if (n === 553 || n === 550 || code === "EENVELOPE") return { texto: `Rechazado por el servidor (${n || "destinatario o remitente"}).`, delServidor: false };
  if (n >= 400 && n < 500) return { texto: `El servidor pidió esperar (${n}).`, delServidor: true };
  return { texto: n ? `El servidor no aceptó el mensaje (${n}).` : "El servidor no aceptó el mensaje.", delServidor: false };
}

const remitenteValido = (r: string) => r.length <= 254 && formatoCorreo((r.match(/<([^<>]+)>\s*$/)?.[1] ?? r).trim());

async function enviarUno(c: Conexion, remitente: string, para: string, asunto: string, html: string, texto: string) {
  const transporte = transporteDe(c);
  try {
    await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto, html, replyTo: (remitente.match(/<([^<>]+)>\s*$/)?.[1] ?? remitente).trim() });
  } finally {
    try {
      transporte.close();
    } catch {
      // ya estaba cerrada
    }
  }
}

/* ---------- Datos ------------------------------------------------------------------------------- */

interface Config {
  activo: boolean;
  hora: string;
  solo_habiles: boolean;
  detener_renovacion: boolean;
  modo: "prueba" | "real";
  remitente: string;
  correo_direccion: string;
  tope_ejecucion: number;
}
interface Regla {
  id: string;
  dias: number;
  activa: boolean;
  destinatarios: string[];
  plantilla_clave: string;
  orden: number;
}
interface Plantilla {
  clave: string;
  idioma: Idioma;
  audiencia: "interna" | "externa" | "ambas";
  asunto: string;
  cuerpo: string;
}
interface Convenio {
  id: string;
  codigo: string;
  institucion: string;
  pais: string;
  tipo: string;
  campus: string;
  fecha_terminacion: string | null;
  indefinido: boolean;
  pasos: number;
  cerrado: boolean;
  idioma: Idioma | null;
  created_by: string | null;
}
interface Destino {
  rol: "responsable" | "coordinacion" | "contacto" | "direccion";
  correo: string;
}
interface Contexto {
  admin: Cliente;
  cfg: Config;
  reglas: Regla[];
  plantillas: Map<string, Plantilla>;
  conexion: Conexion | null;
  errorConexion: string;
  coordinadores: { correo: string; campus: string }[] | null;
}

const COLUMNAS = "id, codigo, institucion, pais, tipo, campus, fecha_terminacion, indefinido, pasos, cerrado, idioma, created_by";
const norma = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase().trim();
const appUrl = () => (ENV("CONV_URL_APP") || "https://planeacion.udes.edu.co").replace(/\/+$/, "");
const logoUrl = () => ENV("CONV_LOGO_URL") || "https://planeacion.udes.edu.co/logo-udes-blanco.png";

async function leerConfig(admin: Cliente): Promise<Config | null> {
  const { data } = await admin.from("conv_aviso_config").select("activo, hora, solo_habiles, detener_renovacion, modo, remitente, correo_direccion, tope_ejecucion").eq("id", true).maybeSingle();
  return (data as Config | null) ?? null;
}

async function conexionPara(admin: Cliente, modo: "prueba" | "real"): Promise<{ conexion: Conexion | null; error: string }> {
  if (modo === "prueba") {
    const m = MAILPIT();
    return m ? { conexion: m, error: "" } : { conexion: null, error: "Falta configurar Mailpit en la función (REL_MAILPIT_HOST)." };
  }
  const { data: ctx } = await admin.rpc("correo_context", { p_hash: "", p_hook: "" });
  const c = (ctx && typeof ctx === "object" ? ctx : null) as { settings?: Record<string, unknown> | null; password?: string } | null;
  if (c?.settings && c.settings.enabled === false) return { conexion: null, error: "El envío de correos está apagado en la intranet (Correos)." };
  const s = smtpInstitucional(c);
  return s ? { conexion: s, error: "" } : { conexion: null, error: "Falta configurar el servidor de correo en la intranet (Correos › Remitentes y conexión)." };
}

async function armarContexto(admin: Cliente, cfg: Config): Promise<Contexto> {
  const [r, p] = await Promise.all([
    admin.from("conv_aviso_reglas").select("id, dias, activa, destinatarios, plantilla_clave, orden").order("orden"),
    admin.from("conv_correo_plantillas").select("clave, idioma, audiencia, asunto, cuerpo"),
  ]);
  const plantillas = new Map<string, Plantilla>();
  for (const x of (p.data ?? []) as Plantilla[]) plantillas.set(`${x.clave}:${x.idioma}`, x);
  const { conexion, error } = await conexionPara(admin, cfg.modo);
  return { admin, cfg, reglas: (r.data ?? []) as Regla[], plantillas, conexion, errorConexion: error, coordinadores: null };
}

async function coordinadoresDe(ctx: Contexto): Promise<{ correo: string; campus: string }[]> {
  if (ctx.coordinadores) return ctx.coordinadores;
  const { data } = await ctx.admin.from("int_miembros").select("campuses(name), profiles(email, is_active)").eq("rol", "coordinador");
  type Fila = { campuses: { name: string } | null; profiles: { email: string; is_active: boolean } | null };
  ctx.coordinadores = ((data ?? []) as unknown as Fila[]).filter((f) => f.profiles?.is_active && f.profiles.email).map((f) => ({ correo: f.profiles!.email.toLowerCase(), campus: f.campuses?.name ?? "" }));
  return ctx.coordinadores;
}

async function destinosDe(ctx: Contexto, c: Convenio, regla: Regla): Promise<{ lista: Destino[]; sinContacto: boolean }> {
  const lista: Destino[] = [];
  const poner = (rol: Destino["rol"], correo: string) => {
    const k = correo.trim().toLowerCase();
    if (formatoCorreo(k) && !lista.some((d) => d.correo === k)) lista.push({ rol, correo: k });
  };
  let sinContacto = false;
  for (const rol of regla.destinatarios) {
    if (rol === "responsable") {
      let correo = "";
      if (c.created_by) {
        const { data } = await ctx.admin.from("profiles").select("email, is_active").eq("id", c.created_by).maybeSingle();
        if (data?.is_active) correo = data.email;
      }
      poner("responsable", correo || ctx.cfg.correo_direccion);
    } else if (rol === "coordinacion") {
      const todos = await coordinadoresDe(ctx);
      const campus = norma(c.campus || "");
      const propios = campus && campus !== "todos" ? todos.filter((x) => norma(x.campus) === campus) : todos;
      if (propios.length) for (const x of propios) poner("coordinacion", x.correo);
      else poner("coordinacion", ctx.cfg.correo_direccion);
    } else if (rol === "contacto") {
      const { data } = await ctx.admin.rpc("conv_contactos_de", { p_institucion: c.institucion });
      const contactos = ((data ?? []) as { correo: string }[]).slice(0, MAX_CONTACTOS);
      if (!contactos.length) sinContacto = true;
      for (const x of contactos) poner("contacto", x.correo);
    } else if (rol === "direccion") poner("direccion", ctx.cfg.correo_direccion);
  }
  return { lista, sinContacto };
}

/** La plantilla que lee cada tipo de destinatario (ver la cabecera de 0256: audiencia). */
function plantillaPara(ctx: Contexto, regla: Regla, rol: Destino["rol"], idioma: Idioma): Plantilla | null {
  const buscar = (clave: string) => ctx.plantillas.get(`${clave}:${idioma}`) ?? ctx.plantillas.get(`${clave}:es`) ?? null;
  const p = buscar(regla.plantilla_clave);
  if (rol === "contacto") {
    if (p && p.audiencia !== "interna") return p;
    return regla.dias >= 31 ? buscar("invitacion_renovar") : regla.dias >= 1 ? buscar("ultima_llamada") : null;
  }
  if (p && p.audiencia !== "externa") return p;
  return buscar(regla.dias > 0 ? "aviso_interno" : regla.dias === 0 ? "vencido_hoy" : "seguimiento");
}

function variablesDe(c: Convenio, hoy: string, idioma: Idioma): Variables {
  const dias = c.fecha_terminacion ? Math.abs(diasEntre(c.fecha_terminacion, hoy)) : 0;
  return {
    institucion: c.institucion,
    pais: c.pais,
    codigo: c.codigo.toUpperCase(),
    fecha_termino: fechaLegible(c.fecha_terminacion, idioma),
    dias: String(dias),
    tipo: c.tipo,
    enlace_renovacion: `${appUrl()}/admin/internacionalizacion/gestion?tab=modelos&convenio=${c.id}`,
  };
}

interface ResultadoAviso {
  convenio: string;
  institucion: string;
  estado: "enviado" | "error" | "rebote" | "sin_contacto" | "omitido";
  enviados: number;
  detalle?: string;
}

/** Envía el aviso de una regla a un convenio, deja la bitácora y la línea del historial. */
async function procesar(ctx: Contexto, c: Convenio, regla: Regla, hoy: string, origen: "automatico" | "manual", usuario: string | null): Promise<ResultadoAviso> {
  const base = { convenio: c.codigo, institucion: c.institucion };
  const idioma: Idioma = c.idioma === "en" ? "en" : "es";
  const fila = {
    convenio_id: c.id,
    regla_id: regla.id,
    regla_dias: regla.dias,
    fecha_vencimiento: c.fecha_terminacion,
    idioma,
    estado: "pendiente",
    modo: ctx.cfg.modo,
    origen,
    creado_por: usuario,
  };
  // Se reserva el aviso ANTES de enviar: si otra ejecución llega a la vez, el índice único la frena.
  const ins = await ctx.admin.from("conv_aviso_envios").insert(fila).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") return { ...base, estado: "omitido", enviados: 0, detalle: "Ese aviso ya se envió." };
    return { ...base, estado: "error", enviados: 0, detalle: "No se pudo reservar el aviso en la bitácora." };
  }
  const envioId = (ins.data as { id: string }).id;
  const cerrar = async (estado: string, destinatarios: unknown[], error: string | null) => {
    await ctx.admin.from("conv_aviso_envios").update({ estado, destinatarios, error }).eq("id", envioId);
  };

  if (!ctx.conexion) {
    await cerrar("error", [], ctx.errorConexion);
    return { ...base, estado: "error", enviados: 0, detalle: ctx.errorConexion };
  }
  const { lista, sinContacto } = await destinosDe(ctx, c, regla);
  const resultados: { rol: string; correo: string; idioma: Idioma; ok: boolean; error?: string; rebote?: boolean }[] = [];
  for (const [i, d] of lista.entries()) {
    const idiomaDest: Idioma = d.rol === "contacto" ? idioma : "es";
    const plantilla = plantillaPara(ctx, regla, d.rol, idiomaDest);
    if (!plantilla) {
      resultados.push({ rol: d.rol, correo: d.correo, idioma: idiomaDest, ok: false, error: "No hay plantilla para este destinatario." });
      continue;
    }
    const v = variablesDe(c, hoy, plantilla.idioma);
    const op = { idioma: plantilla.idioma, logo: logoUrl(), prueba: ctx.cfg.modo === "prueba" };
    try {
      await enviarUno(ctx.conexion, ctx.cfg.remitente, d.correo, `${op.prueba ? "[Prueba] " : ""}${asuntoDe(plantilla.asunto, v)}`, htmlDe(plantilla.cuerpo, v, op), textoDe(plantilla.cuerpo, v, op));
      resultados.push({ rol: d.rol, correo: d.correo, idioma: plantilla.idioma, ok: true });
    } catch (e) {
      const m = motivoDe(e);
      resultados.push({ rol: d.rol, correo: d.correo, idioma: plantilla.idioma, ok: false, error: m.texto, rebote: !m.delServidor });
    }
    if (ctx.cfg.modo === "real" && i < lista.length - 1) await dormir(PAUSA_SMTP_MS);
  }

  const enviados = resultados.filter((r) => r.ok).length;
  const fallos = resultados.filter((r) => !r.ok);
  let estado: ResultadoAviso["estado"];
  let error: string | null = fallos[0]?.error ?? null;
  if (!resultados.length) {
    estado = "error";
    error = "La regla no tiene destinatarios con correo.";
  } else if (!enviados) estado = fallos.every((f) => f.rebote) ? "rebote" : "error";
  else if (sinContacto) estado = "sin_contacto";
  else estado = "enviado";
  if (estado === "enviado" && fallos.length) error = `${fallos.length} de ${resultados.length} correos no salieron: ${fallos[0].error}`;
  await cerrar(estado, resultados, error);

  if (enviados) {
    const cuando = regla.dias > 0 ? `${regla.dias} días antes` : regla.dias === 0 ? "el día del vencimiento" : `${-regla.dias} días después`;
    const texto = `Aviso de vencimiento (${cuando}) enviado a ${enviados} ${enviados === 1 ? "destinatario" : "destinatarios"}${ctx.cfg.modo === "prueba" ? " en modo de prueba" : ""}${sinContacto ? "; la institución no tiene contacto en el Directorio" : ""}.`;
    await ctx.admin.from("conv_historial").insert({ convenio_id: c.id, fecha: hoy, texto: texto.slice(0, 1000), autor: usuario });
  }
  return { ...base, estado, enviados, ...(error ? { detalle: error } : {}) };
}

/* ---------- Acciones ------------------------------------------------------------------------------ */

const iguales = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

async function ejecutar(url: string, service: string): Promise<Response> {
  const admin = cliente(url, service);
  const cfg = await leerConfig(admin);
  if (!cfg) return json({ error: "Falta la configuración de avisos (¿se aplicó la migración 0256?)." }, 503);
  if (!cfg.activo) return json({ omitido: "Los avisos automáticos están apagados." });
  const ahora = ahoraBogota();
  if (cfg.solo_habiles && (ahora.diaSemana === 0 || ahora.diaSemana === 6)) return json({ omitido: "Hoy no es día hábil." });
  const [h, m] = cfg.hora.split(":").map(Number);
  if (ahora.minutos < h * 60 + (m || 0)) return json({ omitido: "Todavía no es la hora de envío." });

  const hoy = ahora.fecha;
  const ctx = await armarContexto(admin, cfg);
  const reglas = ctx.reglas.filter((r) => r.activa);
  if (!reglas.length) return json({ omitido: "No hay reglas activas." });

  const { data, error } = await admin
    .from("conv_convenios")
    .select(COLUMNAS)
    .eq("cerrado", false)
    .eq("indefinido", false)
    .gte("pasos", 5)
    .gte("fecha_terminacion", sumarDias(hoy, -(365 + VENTANA_RECUPERACION)))
    .lte("fecha_terminacion", sumarDias(hoy, 366))
    .limit(3000);
  if (error) return json({ error: "No se pudieron leer los convenios." }, 500);
  const convenios = (data ?? []) as Convenio[];

  // Qué regla se cumple hoy en cada convenio (la más reciente de las que están en su ventana de recuperación).
  const candidatos: { c: Convenio; regla: Regla; faltan: number }[] = [];
  for (const c of convenios) {
    if (!c.fecha_terminacion) continue;
    const faltan = diasEntre(c.fecha_terminacion, hoy);
    const vigentes = reglas.filter((r) => faltan <= r.dias && r.dias - faltan <= VENTANA_RECUPERACION).sort((a, b) => a.dias - b.dias);
    if (vigentes.length) candidatos.push({ c, regla: vigentes[0], faltan });
  }
  if (!candidatos.length) return json({ procesados: 0, enviados: 0, resumen: [] });

  // Lo ya enviado (de cualquier origen) y las renovaciones registradas.
  const ids = candidatos.map((x) => x.c.id);
  const hechos = new Set<string>();
  const renovados = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const trozo = ids.slice(i, i + 150);
    const e = await admin.from("conv_aviso_envios").select("convenio_id, regla_id, fecha_vencimiento").in("convenio_id", trozo).in("estado", ["pendiente", "enviado", "sin_contacto", "rebote"]);
    for (const x of (e.data ?? []) as { convenio_id: string; regla_id: string | null; fecha_vencimiento: string }[]) hechos.add(`${x.convenio_id}|${x.regla_id}|${x.fecha_vencimiento}`);
    if (cfg.detener_renovacion) {
      const h2 = await admin.from("conv_historial").select("convenio_id, fecha").in("convenio_id", trozo).or("texto.ilike.Prórroga:%,texto.ilike.Renovación automática:%,texto.ilike.Nuevo convenio:%");
      for (const x of (h2.data ?? []) as { convenio_id: string; fecha: string }[]) renovados.set(x.convenio_id, [...(renovados.get(x.convenio_id) ?? []), x.fecha]);
    }
  }
  const pendientes = candidatos
    .filter(({ c, regla }) => {
      if (hechos.has(`${c.id}|${regla.id}|${c.fecha_terminacion}`)) return false;
      const apertura = sumarDias(c.fecha_terminacion as string, -regla.dias);
      return !(renovados.get(c.id) ?? []).some((f) => f >= apertura);
    })
    .sort((a, b) => a.faltan - b.faltan);

  const inicio = Date.now();
  const resumen: ResultadoAviso[] = [];
  for (const { c, regla } of pendientes.slice(0, cfg.tope_ejecucion)) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break;
    try {
      resumen.push(await procesar(ctx, c, regla, hoy, "automatico", null));
    } catch {
      resumen.push({ convenio: c.codigo, institucion: c.institucion, estado: "error", enviados: 0, detalle: "Falló este convenio; se siguió con los demás." });
    }
    if (ctx.cfg.modo === "real") await dormir(PAUSA_SMTP_MS);
  }
  return json({
    procesados: resumen.length,
    enviados: resumen.reduce((n, r) => n + r.enviados, 0),
    pendientes: Math.max(0, pendientes.length - resumen.length),
    resumen,
  });
}

async function enviarAhora(url: string, service: string, usuario: string, body: Record<string, unknown>): Promise<Response> {
  const admin = cliente(url, service);
  const cfg = await leerConfig(admin);
  if (!cfg) return json({ error: "Falta la configuración de avisos (¿se aplicó la migración 0256?)." }, 503);
  const convenioId = typeof body.convenio_id === "string" ? body.convenio_id : "";
  const { data } = await admin.from("conv_convenios").select(COLUMNAS).eq("id", convenioId).maybeSingle();
  const c = data as Convenio | null;
  if (!c) return json({ error: "No encontré ese convenio." }, 404);
  if (c.cerrado || c.indefinido || !c.fecha_terminacion) return json({ error: "Este convenio no tiene una fecha de terminación vigente para avisar." }, 409);
  const ctx = await armarContexto(admin, cfg);
  const activas = ctx.reglas.filter((r) => r.activa);
  const hoy = ahoraBogota().fecha;
  const faltan = diasEntre(c.fecha_terminacion, hoy);
  let regla: Regla | undefined = typeof body.regla_id === "string" ? ctx.reglas.find((r) => r.id === body.regla_id) : undefined;
  regla ??= activas.filter((r) => faltan <= r.dias).sort((a, b) => a.dias - b.dias)[0] ?? activas.sort((a, b) => b.dias - a.dias).find((r) => r.dias < faltan) ?? activas[0];
  if (!regla) return json({ error: "No hay reglas de aviso activas." }, 409);
  const r = await procesar(ctx, c, regla, hoy, "manual", usuario);
  if (r.estado === "error" || r.estado === "rebote") return json({ error: r.detalle ?? "No se pudo enviar el aviso.", resultado: r }, 502);
  return json({ resultado: r, modo: cfg.modo });
}

async function prueba(url: string, service: string, anon: string, authorization: string, body: Record<string, unknown>): Promise<Response> {
  const asunto = typeof body.asunto === "string" ? body.asunto.slice(0, 200) : "";
  const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo.slice(0, 20_000) : "";
  const idioma: Idioma = body.idioma === "en" ? "en" : "es";
  const para = typeof body.para === "string" ? body.para.trim().toLowerCase() : "";
  if (!asunto || !cuerpo || !formatoCorreo(para)) return json({ error: "Revise el asunto, el mensaje y el correo de destino." }, 400);
  const admin = cliente(url, service);
  const cfg = await leerConfig(admin);
  const remitente = cfg?.remitente && remitenteValido(cfg.remitente) ? cfg.remitente : "Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>";
  const { conexion, error } = await conexionPara(admin, body.destino === "smtp" ? "real" : "prueba");
  if (!conexion) return json({ error, code: "config" }, 503);
  const hoy = ahoraBogota().fecha;
  let v: Variables = {
    institucion: idioma === "es" ? "Universidad de Ejemplo" : "Example University",
    pais: idioma === "es" ? "España" : "Spain",
    codigo: "CI-01-000",
    fecha_termino: fechaLegible(sumarDias(hoy, 60), idioma),
    dias: "60",
    tipo: "Marco",
    enlace_renovacion: `${appUrl()}/admin/internacionalizacion/gestion?tab=modelos`,
    enlace_firma: `${appUrl()}/firmar/ejemplo`,
    vence: fechaLegible(sumarDias(hoy, 7), idioma),
    nombre_firmante: idioma === "es" ? "Persona de ejemplo" : "Sample Person",
    codigo_certificado: "UDES-0000-0000",
  };
  if (typeof body.convenio_id === "string") {
    const { data } = await cliente(url, anon, authorization).from("conv_convenios").select(COLUMNAS).eq("id", body.convenio_id).maybeSingle();
    if (data) v = { ...v, ...variablesDe(data as Convenio, hoy, idioma) };
  }
  const op = { idioma, logo: logoUrl(), prueba: true };
  try {
    await enviarUno(conexion, remitente, para, `[Prueba] ${asuntoDe(asunto, v)}`, htmlDe(cuerpo, v, op), textoDe(cuerpo, v, op));
    return json({ ok: true });
  } catch (e) {
    return json({ error: motivoDe(e).texto, code: "servidor" }, 502);
  }
}

/* ---------- Entrada --------------------------------------------------------------------------------- */

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const url = ENV("SUPABASE_URL");
  const anon = ENV("SUPABASE_ANON_KEY");
  const service = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "La función no está configurada correctamente." }, 500);

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const authorization = request.headers.get("Authorization") ?? "";
    const secreto = ENV("CONV_AVISOS_CRON");
    const esCron = (secreto !== "" && iguales(request.headers.get("x-conv-cron") ?? "", secreto)) || (authorization.startsWith("Bearer ") && iguales(authorization.slice(7), service));
    if (body.action === "ejecutar") {
      if (!esCron) return json({ error: "No autorizado." }, 401);
      return await ejecutar(url, service);
    }

    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anon) return json({ error: "Falta la sesión." }, 401);
    const caller = cliente(url, anon, authorization);
    const quien = await caller.auth.getUser();
    if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);
    const permiso = await caller.rpc("int_puede_crear");
    if (permiso.error || permiso.data !== true) return json({ error: "No tiene permiso para enviar avisos de convenios." }, 403);

    if (body.action === "enviar") return await enviarAhora(url, service, quien.data.user.id, body);
    if (body.action === "prueba") return await prueba(url, service, anon, authorization, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch {
    // Sin detalle: podría traer una dirección.
    return json({ error: "Algo falló al atender el pedido." }, 500);
  }
});
