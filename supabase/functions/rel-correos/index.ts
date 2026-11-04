/* =============================================================================
   Edge Function · rel-correos

   «Relaciones» de Internacionalización (migración 0254): validar correos, enviar un
   lote de un envío masivo y probar una plantilla.

   POST con la sesión de quien puede crear en Internacionalización (int_puede_crear):

     { action: "validar", ids: [id de rel_directorio…] (máx. 25), plantilla?: {…} }
         Cuatro niveles por contacto:
           1 formato  2 dominio (registro MX)  3 buzón (sondeo SMTP sin enviar nada)
           4 Mailpit  (solo si llega `plantilla`: un envío de prueba a Mailpit)
         Guarda el resultado en rel_contactos y lo devuelve.
         «Verificado» (ok) exige pasar 1, 2 y 3. Si el puerto 25 está bloqueado o el
         servidor no responde (Microsoft 365, pasarelas anti-spam, servidores que
         aceptan todo), el buzón queda «No verificable» (nv), nunca «Rechazado».
     { action: "enviar", envio_id }
         Toma un lote (20) del envío con rel_tomar_lote, lo envía y anota cada resultado.
         En SMTP real la base exige 55 s entre lotes: si es pronto, responde `espera`.
         El navegador la vuelve a llamar hasta que no queden pendientes; si se cierra
         la pestaña, el envío queda guardado y se reanuda desde Relaciones.
     { action: "prueba", plantilla, destino: "mailpit" | "smtp", para, remitente, fila_id? }
         Un solo correo de prueba.

   GET ?baja=<token>  (público, sin sesión): el enlace «Dejar de recibir mensajes».

   Servidores de salida:
     · smtp    lo guardado en la intranet (Sistema › Correos) o las variables SMTP_*,
               igual que la función `correos` (conexionDe, copiada abajo en versión corta).
     · mailpit REL_MAILPIT_HOST y REL_MAILPIT_PORT (por omisión 1025), sin cifrado ni usuario.

   Variables opcionales: REL_URL_BAJA (base pública de esta función, para el enlace del
   correo; por omisión SUPABASE_URL/functions/v1/rel-correos), REL_SONDEO_REMITENTE
   (el MAIL FROM del sondeo SMTP; por omisión verificacion@udes.edu.co).

   Despliegue (sin verificación de JWT: la baja es pública; las demás acciones validan la sesión a mano):
     supabase functions deploy rel-correos --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import nodemailer from "npm:nodemailer@6.9.16";
import { asuntoDe, formatoCorreo, htmlDe, textoDe } from "./plantilla.ts";
import type { Destinatario, PlantillaCorreo } from "./plantilla.ts";

const ENV = (n: string) => Deno.env.get(n) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": ENV("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const cliente = (url: string, key: string, authorization?: string) =>
  createClient(url, key, { ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}), auth: { persistSession: false, autoRefreshToken: false } });

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_VALIDAR = 25;
const LOTE = 20;
const PAUSA_SMTP_MS = 2_500;

/* ---------- Servidores de salida ------------------------------------------------------------- */

interface Conexion {
  host: string;
  port: number;
  seguridad: "none" | "ssl" | "starttls";
  user: string;
  pass: string;
}

const MAILPIT = (): Conexion | null => (ENV("REL_MAILPIT_HOST") ? { host: ENV("REL_MAILPIT_HOST"), port: Number(ENV("REL_MAILPIT_PORT")) || 1025, seguridad: "none", user: "", pass: "" } : null);

/** Versión corta de conexionDe (correos/index.ts): lo guardado en la intranet y, si no hay servidor, SMTP_*. */
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

/** El motivo en palabras y si es del servidor (se reintenta) o del destinatario (queda como fallo). */
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
const direccionDe = (r: string) => (r.match(/<([^<>]+)>\s*$/)?.[1] ?? r).trim();

function urlBaja(token: string): string {
  const base = ENV("REL_URL_BAJA") || `${ENV("SUPABASE_URL")}/functions/v1/rel-correos`;
  return `${base}?baja=${encodeURIComponent(token)}`;
}

async function enviarUno(c: Conexion, remitente: string, para: string, plantilla: PlantillaCorreo, d: Destinatario, token: string, prefijo = "") {
  const op = { urlBaja: urlBaja(token), responderA: direccionDe(remitente) };
  const transporte = transporteDe(c);
  try {
    await transporte.sendMail({
      from: remitente,
      to: para,
      subject: prefijo + asuntoDe(plantilla, d),
      text: textoDe(plantilla, d, op),
      html: htmlDe(plantilla, d, op),
      headers: { "List-Unsubscribe": `<${op.urlBaja}>` },
    });
  } finally {
    try {
      transporte.close();
    } catch {
      // ya estaba cerrada
    }
  }
}

/* ---------- Niveles 2 y 3: dominio y buzón ---------------------------------------------------- */

type Nivel = "ok" | "bad" | "nv" | "na";

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rej) => {
    reloj = setTimeout(() => rej(new Error("tiempo")), ms);
  });
  return Promise.race([p, tope]).finally(() => clearTimeout(reloj));
}

/** Los servidores de correo del dominio (MX; si no hay, el propio dominio si existe). bad = el dominio no recibe correo. */
async function servidoresDe(dominio: string): Promise<{ nivel: Nivel; hosts: string[] }> {
  try {
    const mx = await conTope(Deno.resolveDns(dominio, "MX"), 4_000);
    const hosts = mx.sort((a, b) => a.preference - b.preference).map((m) => m.exchange.replace(/\.$/, "")).filter((h) => h && h !== ".");
    if (hosts.length) return { nivel: "ok", hosts };
    return { nivel: "bad", hosts: [] }; // «MX nulo»: el dominio declara que no recibe correo
  } catch (e) {
    const m = String((e as Error)?.name ?? "") + String((e as Error)?.message ?? "");
    if (!/NotFound|NXDOMAIN|no records|NoData/i.test(m)) return { nivel: "nv", hosts: [] }; // tiempo o fallo del DNS: no se sabe
  }
  try {
    const a = await conTope(Deno.resolveDns(dominio, "A"), 4_000);
    return a.length ? { nivel: "ok", hosts: [dominio] } : { nivel: "bad", hosts: [] };
  } catch (e) {
    return /NotFound|NXDOMAIN|no records|NoData/i.test(String((e as Error)?.name ?? "") + String((e as Error)?.message ?? "")) ? { nivel: "bad", hosts: [] } : { nivel: "nv", hosts: [] };
  }
}

// Pasarelas que aceptan cualquier destinatario o no contestan al sondeo: no vale la pena preguntar.
const NO_SONDEABLES = /outlook\.com|protection\.outlook|pphosted|mimecast|messagelabs|barracuda|proofpoint|iphmx|trendmicro/i;

async function leerRespuesta(conn: Deno.Conn): Promise<{ codigo: number; texto: string }> {
  const dec = new TextDecoder();
  let acumulado = "";
  const buf = new Uint8Array(2048);
  for (;;) {
    const n = await conTope(conn.read(buf), 6_000);
    if (n === null) break;
    acumulado += dec.decode(buf.subarray(0, n));
    const lineas = acumulado.split(/\r?\n/).filter(Boolean);
    const ultima = lineas[lineas.length - 1] ?? "";
    if (/\r?\n$/.test(acumulado) && /^\d{3}( |$)/.test(ultima)) break;
  }
  return { codigo: Number(acumulado.slice(0, 3)) || 0, texto: acumulado };
}

const USUARIO_INEXISTENTE = /user|mailbox|recipient|exist|unknown|no such|invalid|not found|5\.1\.1|5\.1\.10|rejected/i;

/** RCPT TO sin enviar DATA. ok = acepta, bad = el buzón no existe, nv = no se puede saber. */
async function sondear(host: string, correo: string): Promise<{ nivel: Nivel; nota: string }> {
  if (NO_SONDEABLES.test(host)) return { nivel: "nv", nota: "Ese servidor (Microsoft 365 o una pasarela) no dice si el buzón existe." };
  const enc = new TextEncoder();
  let conn: Deno.Conn | undefined;
  try {
    const p = Deno.connect({ hostname: host, port: 25 });
    try {
      conn = await conTope(p, 5_000);
    } catch (e) {
      p.then((c) => c.close(), () => undefined);
      throw e;
    }
    const decir = async (linea: string) => {
      await conn!.write(enc.encode(`${linea}\r\n`));
      return await leerRespuesta(conn!);
    };
    if ((await leerRespuesta(conn)).codigo !== 220) return { nivel: "nv", nota: "El servidor no saludó." };
    if ((await decir("EHLO relaciones.udes.edu.co")).codigo !== 250) return { nivel: "nv", nota: "El servidor no aceptó el saludo." };
    if ((await decir(`MAIL FROM:<${ENV("REL_SONDEO_REMITENTE") || "verificacion@udes.edu.co"}>`)).codigo !== 250) return { nivel: "nv", nota: "El servidor no aceptó el sondeo." };
    const real = await decir(`RCPT TO:<${correo}>`);
    if (real.codigo >= 500 && real.codigo < 600) {
      return USUARIO_INEXISTENTE.test(real.texto) ? { nivel: "bad", nota: "El servidor dice que el buzón no existe." } : { nivel: "nv", nota: "El servidor bloqueó el sondeo." };
    }
    if (real.codigo !== 250 && real.codigo !== 251) return { nivel: "nv", nota: "El servidor pidió esperar o no respondió claro." };
    // ¿Acepta cualquier dirección? Entonces «acepta» no prueba nada.
    const dominio = correo.slice(correo.indexOf("@") + 1);
    const falso = await decir(`RCPT TO:<zz-no-existe-${crypto.randomUUID().slice(0, 8)}@${dominio}>`);
    if (falso.codigo === 250 || falso.codigo === 251) return { nivel: "nv", nota: "El servidor acepta cualquier dirección: no se puede confirmar el buzón." };
    return { nivel: "ok", nota: "" };
  } catch {
    return { nivel: "nv", nota: "No se pudo consultar al servidor (puerto 25 cerrado o sin respuesta)." };
  } finally {
    try {
      await conn?.write(enc.encode("QUIT\r\n"));
    } catch {
      // ya cerrada
    }
    try {
      conn?.close();
    } catch {
      // ya cerrada
    }
  }
}

interface Contacto extends Destinatario {
  id: string;
  correo: string;
}

interface Resultado {
  id: string;
  correo: string;
  f: Nivel;
  d: Nivel;
  b: Nivel;
  m: Nivel;
  estado: "ok" | "dom" | "bad" | "nv";
  nota: string;
}

async function validarDominio(dominio: string, contactos: Contacto[], plantilla: PlantillaCorreo | null, mailpit: Conexion | null, remitente: string): Promise<Resultado[]> {
  const sal: Resultado[] = [];
  const srv = await servidoresDe(dominio);
  let primera = true;
  for (const c of contactos) {
    const r: Resultado = { id: c.id, correo: c.correo, f: "ok", d: srv.nivel, b: "na", m: "na", estado: "nv", nota: "" };
    if (srv.nivel === "bad") {
      r.estado = "dom";
      r.nota = "El dominio no existe o no recibe correo.";
    } else if (srv.nivel === "nv") {
      r.nota = "No se pudo consultar el DNS del dominio.";
    } else {
      if (!primera) await dormir(1_000); // nunca en ráfaga contra el mismo dominio
      primera = false;
      let s = { nivel: "nv" as Nivel, nota: "" };
      for (const h of srv.hosts.slice(0, 2)) {
        s = await sondear(h, c.correo);
        if (s.nivel !== "nv" || NO_SONDEABLES.test(h)) break;
      }
      r.b = s.nivel;
      r.nota = s.nota;
      r.estado = s.nivel === "ok" ? "ok" : s.nivel === "bad" ? "bad" : "nv";
    }
    if (plantilla && mailpit) {
      try {
        await enviarUno(mailpit, remitente, c.correo, plantilla, c, "prueba", "[Prueba] ");
        r.m = "ok";
      } catch {
        r.m = "bad";
      }
    }
    sal.push(r);
  }
  return sal;
}

/* ---------- Las acciones ------------------------------------------------------------------------ */

const textoPlantilla = (x: unknown): PlantillaCorreo | null => {
  const p = (x && typeof x === "object" ? x : null) as Record<string, unknown> | null;
  if (!p || typeof p.asunto !== "string" || typeof p.cuerpo !== "string") return null;
  return { asunto: p.asunto.slice(0, 200), cuerpo: p.cuerpo.slice(0, 20_000), usa_actividad: Boolean(p.usa_actividad), actividad: (p.actividad && typeof p.actividad === "object" ? p.actividad : {}) as PlantillaCorreo["actividad"] };
};

async function validar(url: string, anon: string, service: string, authorization: string, body: Record<string, unknown>): Promise<Response> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string").slice(0, MAX_VALIDAR);
  if (!ids.length) return json({ error: "No hay contactos para validar." }, 400);
  const caller = cliente(url, anon, authorization);
  const { data, error } = await caller.from("rel_directorio").select("id, correo, nombre, cargo, institucion, pais").in("id", ids);
  if (error) return json({ error: "No se pudieron leer los contactos." }, 500);
  const plantilla = textoPlantilla(body.plantilla);
  const mailpit = plantilla ? MAILPIT() : null;
  const remitente = typeof body.remitente === "string" && remitenteValido(body.remitente) ? body.remitente : "Relaciones Internacionales UDES <relaciones.internacionales@udes.edu.co>";

  const resultados: Resultado[] = [];
  const porDominio = new Map<string, Contacto[]>();
  for (const f of (data ?? []) as Contacto[]) {
    if (!formatoCorreo(f.correo)) {
      resultados.push({ id: f.id, correo: f.correo, f: "bad", d: "na", b: "na", m: "na", estado: "bad", nota: "El correo no tiene forma de correo." });
      continue;
    }
    const dom = f.correo.slice(f.correo.indexOf("@") + 1);
    porDominio.set(dom, [...(porDominio.get(dom) ?? []), f]);
  }
  // Pocos dominios a la vez; dentro de uno, de a uno y con pausa.
  const cola = [...porDominio.entries()];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let t = cola.shift(); t; t = cola.shift()) resultados.push(...(await validarDominio(t[0], t[1], plantilla, mailpit, remitente)));
    }),
  );

  const admin = cliente(url, service);
  const ahora = new Date().toISOString();
  const guardado = await admin.from("rel_contactos").upsert(
    resultados.map((r) => ({ fila_id: r.id, correo_estado: r.estado, correo_detalle: { f: r.f, d: r.d, b: r.b, m: r.m, nota: r.nota }, correo_fecha: ahora })),
    { onConflict: "fila_id" },
  );
  if (guardado.error) return json({ error: "Se validó, pero no se pudo guardar el resultado." }, 500);
  return json({ resultados, mailpit: plantilla ? Boolean(mailpit) : null });
}

async function enviar(url: string, anon: string, service: string, authorization: string, body: Record<string, unknown>): Promise<Response> {
  const inicio = Date.now();
  const envioId = typeof body.envio_id === "string" ? body.envio_id : "";
  const caller = cliente(url, anon, authorization);
  const { data: envio } = await caller.from("rel_envios").select("id, destino, remitente, asunto, cuerpo, usa_actividad, actividad, estado").eq("id", envioId).maybeSingle();
  if (!envio) return json({ error: "No encontré ese envío." }, 404);

  const admin = cliente(url, service);
  let conexion: Conexion | null;
  if (envio.destino === "mailpit") conexion = MAILPIT();
  else {
    const { data: ctx } = await admin.rpc("correo_context", { p_hash: "", p_hook: "" });
    const c = (ctx && typeof ctx === "object" ? ctx : null) as { settings?: Record<string, unknown> | null; password?: string } | null;
    if (c?.settings && c.settings.enabled === false) return json({ error: "El envío de correos está apagado en la intranet (Correos).", code: "config" }, 409);
    conexion = smtpInstitucional(c);
  }
  if (!conexion) return json({ error: envio.destino === "mailpit" ? "Falta configurar Mailpit en la función (REL_MAILPIT_HOST)." : "Falta configurar el servidor de correo en la intranet (Correos › Remitentes y conexión).", code: "config" }, 503);

  const tomado = await admin.rpc("rel_tomar_lote", { p_envio: envioId, p_max: LOTE });
  if (tomado.error) return json({ error: "No se pudo tomar el siguiente lote." }, 500);
  const lote = tomado.data as { estado: string; espera: number; pendientes: number; destinos: { id: string; correo: string; nombre: string; token: string }[] };
  if (lote.espera > 0 || !lote.destinos.length) return json({ estado: lote.estado, espera: lote.espera, pendientes: lote.pendientes, enviados: 0, fallidos: 0 });

  const plantilla: PlantillaCorreo = { asunto: envio.asunto, cuerpo: envio.cuerpo, usa_actividad: envio.usa_actividad, actividad: envio.actividad ?? {} };
  const filas = await caller.from("rel_envio_destinos").select("id, fila_id").in("id", lote.destinos.map((d) => d.id));
  const contactoDe = new Map<string, string>(((filas.data ?? []) as { id: string; fila_id: string | null }[]).filter((f) => f.fila_id).map((f) => [f.id, f.fila_id as string]));
  const dir = await caller.from("rel_directorio").select("id, nombre, cargo, institucion, pais").in("id", [...contactoDe.values()]);
  const datos = new Map<string, Destinatario>(((dir.data ?? []) as (Destinatario & { id: string })[]).map((d) => [d.id, d]));

  let enviados = 0;
  let fallidos = 0;
  let aviso = "";
  const liberar = (ids: string[]) => admin.from("rel_envio_destinos").update({ estado: "pendiente" }).in("id", ids).then(() => undefined, () => undefined);
  for (const [i, d] of lote.destinos.entries()) {
    if (aviso || Date.now() - inicio > 100_000) {
      await liberar(lote.destinos.slice(i).map((x) => x.id));
      break;
    }
    const persona = datos.get(contactoDe.get(d.id) ?? "") ?? { nombre: d.nombre, cargo: "", institucion: "", pais: "" };
    try {
      await enviarUno(conexion, envio.remitente, d.correo, plantilla, { ...persona, nombre: persona.nombre || d.nombre }, d.token);
      await admin.rpc("rel_resultado", { p_destino: d.id, p_estado: "enviado", p_motivo: "" });
      enviados++;
    } catch (e) {
      const m = motivoDe(e);
      if (m.delServidor) {
        aviso = m.texto;
        await liberar(lote.destinos.slice(i).map((x) => x.id));
        break;
      }
      await admin.rpc("rel_resultado", { p_destino: d.id, p_estado: "fallo", p_motivo: m.texto });
      fallidos++;
    }
    if (envio.destino === "smtp" && i < lote.destinos.length - 1) await dormir(PAUSA_SMTP_MS);
  }
  const { data: resumen } = await admin.from("rel_envios").select("estado, enviados, fallidos, total").eq("id", envioId).maybeSingle();
  const { count } = await admin.from("rel_envio_destinos").select("id", { count: "exact", head: true }).eq("envio_id", envioId).in("estado", ["pendiente", "enviando"]);
  return json({ estado: resumen?.estado ?? lote.estado, espera: envio.destino === "smtp" && (count ?? 0) > 0 ? 55 : 0, pendientes: count ?? 0, enviados, fallidos, ...(aviso ? { error: aviso, code: "servidor" } : {}) });
}

async function prueba(url: string, anon: string, authorization: string, body: Record<string, unknown>): Promise<Response> {
  const plantilla = textoPlantilla(body.plantilla);
  const para = typeof body.para === "string" ? body.para.trim().toLowerCase() : "";
  const remitente = typeof body.remitente === "string" ? body.remitente.trim() : "";
  if (!plantilla || !formatoCorreo(para) || !remitenteValido(remitente)) return json({ error: "Revise la plantilla, el remitente y el correo de destino." }, 400);
  let conexion: Conexion | null;
  if (body.destino === "smtp") {
    const admin = cliente(url, ENV("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: ctx } = await admin.rpc("correo_context", { p_hash: "", p_hook: "" });
    conexion = smtpInstitucional((ctx && typeof ctx === "object" ? ctx : null) as { settings?: Record<string, unknown> | null; password?: string } | null);
  } else conexion = MAILPIT();
  if (!conexion) return json({ error: "Ese servidor de salida no está configurado.", code: "config" }, 503);
  let persona: Destinatario = { nombre: "Persona de ejemplo", cargo: "Cargo de ejemplo", institucion: "Institución de ejemplo", pais: "Colombia" };
  if (typeof body.fila_id === "string") {
    const { data } = await cliente(url, anon, authorization).from("rel_directorio").select("nombre, cargo, institucion, pais").eq("id", body.fila_id).maybeSingle();
    if (data) persona = data as Destinatario;
  }
  try {
    await enviarUno(conexion, remitente, para, plantilla, persona, "prueba", "[Prueba] ");
    return json({ ok: true });
  } catch (e) {
    return json({ error: motivoDe(e).texto, code: "servidor" }, 502);
  }
}

/* ---------- La baja pública -------------------------------------------------------------------------- */

const PAGINA = (titulo: string, texto: string) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head><body style="margin:0;background:#f4f7fb;font:16px/1.6 Arial,Helvetica,sans-serif;color:#0d1c31"><main style="max-width:480px;margin:12vh auto;padding:0 20px"><h1 style="font-size:22px;color:#0a2d63">${titulo}</h1><p>${texto}</p></main></body></html>`,
    { status: 200, headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

async function baja(url: string, service: string, token: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{8,60}$/.test(token)) return PAGINA("Enlace no válido", "El enlace no es válido o ya caducó.");
  const r = await cliente(url, service).rpc("rel_dar_baja", { p_token: token });
  if (r.error) return PAGINA("No pudimos registrar su solicitud", "Intente de nuevo en unos minutos o responda al mensaje que recibió.");
  return r.data ? PAGINA("Listo, ya no recibirá mensajes", "Registramos su solicitud. La Oficina de Relaciones Internacionales de la Universidad de Santander no volverá a escribirle a esta dirección.") : PAGINA("Enlace no válido", "El enlace no es válido o ya caducó.");
}

/* ---------- Entrada ------------------------------------------------------------------------------------ */

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = ENV("SUPABASE_URL");
  const anon = ENV("SUPABASE_ANON_KEY");
  const service = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "La función no está configurada correctamente." }, 500);

  try {
    if (request.method === "GET") {
      const token = new URL(request.url).searchParams.get("baja");
      return token ? await baja(url, service, token) : json({ error: "Método no permitido." }, 405);
    }
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anon) return json({ error: "Falta la sesión." }, 401);
    const caller = cliente(url, anon, authorization);
    const quien = await caller.auth.getUser();
    if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);
    const permiso = await caller.rpc("int_puede_crear");
    if (permiso.error || permiso.data !== true) return json({ error: "No tiene permiso para Relaciones." }, 403);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "validar") return await validar(url, anon, service, authorization, body);
    if (body.action === "enviar") return await enviar(url, anon, service, authorization, body);
    if (body.action === "prueba") return await prueba(url, anon, authorization, body);
    return json({ error: "Acción desconocida." }, 400);
  } catch {
    // Sin detalle: podría traer una dirección.
    return json({ error: "Algo falló al atender el pedido." }, 500);
  }
});
