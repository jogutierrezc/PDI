/* =============================================================================
   Edge Function · conv-firma
   Firma electrónica de convenios de Internacionalización (migración 0258).

   UN SOLO PUNTO DE ENTRADA:  POST /functions/v1/conv-firma   con JSON { "action": "...", ... }
   Respuestas: 200 con JSON; errores { "error": "texto en español", "code": "codigo_maquina", ...extras } con el
   estado HTTP que corresponda. El contrato completo (entradas, salidas y códigos) está en CONTRATO.md.

   INTERNAS (cabecera Authorization: Bearer <sesión>; int_puede_crear(), y int_ve_modulo() para leer)
     crear · enviar · recordar · reenviar_enlace · cancelar · reintentar
     listar · detalle · estado_certificado_udes · descargar
   PÚBLICAS (sin sesión; el token del enlace identifica al firmante)
     abrir · solicitar_codigo · verificar_codigo · documento · marcar_leido
     iniciar_movil · estado_movil · movil_abrir · movil_enviar · firmar · verificar
   CRON
     vencer   (encabezado x-conv-firma-cron = CONV_FIRMA_CRON, o clave de servicio): marca vencidas las solicitudes
              de más de 15 días y reintenta las finalizaciones que fallaron. Llamarla cada hora.

   Variables: CONV_FIRMA_P12, CONV_FIRMA_P12_CLAVE (certificado de la UDES), GOTENBERG_URL, CONV_TSA_URL (opcional),
   CONV_URL_APP, CONV_FIRMA_CRON, CONV_FIRMA_PIMIENTA (opcional), más las de correo de conv-avisos
   (REL_MAILPIT_*, SMTP_*). Despliegue:  supabase functions deploy conv-firma --no-verify-jwt
   ========================================================================== */

import { cliente, CORS, ENV, ErrorFirma, iguales, json, MAX_CUERPO_BYTES, ipDe, agenteDe, paisDe } from "./util.ts";
import type { Ctx } from "./comun.ts";
import * as I from "./internas.ts";
import * as P from "./publicas.ts";

type Accion = (ctx: Ctx) => Promise<unknown>;

const PUBLICAS: Record<string, Accion> = {
  abrir: P.abrir,
  solicitar_codigo: P.solicitarCodigo,
  verificar_codigo: P.verificarCodigo,
  documento: P.documento,
  marcar_leido: P.marcarLeido,
  iniciar_movil: P.iniciarMovil,
  estado_movil: P.estadoMovil,
  movil_abrir: P.movilAbrir,
  movil_enviar: P.movilEnviar,
  firmar: P.firmar,
  verificar: P.verificar,
};

const ESCRIBE: Record<string, Accion> = {
  crear: I.crear,
  enviar: I.enviar,
  recordar: I.recordar,
  reenviar_enlace: I.reenviarEnlace,
  cancelar: I.cancelar,
  reintentar: I.reintentar,
};

const LEE: Record<string, Accion> = {
  listar: I.listar,
  detalle: I.detalle,
  estado_certificado_udes: I.estadoCertificadoUdes,
  descargar: I.descargar,
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido.", code: "metodo" }, 405);
  const url = ENV("SUPABASE_URL");
  const anon = ENV("SUPABASE_ANON_KEY");
  const service = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "La función no está configurada correctamente.", code: "config" }, 500);

  try {
    const largo = Number(request.headers.get("content-length") ?? "0");
    if (largo > MAX_CUERPO_BYTES) throw new ErrorFirma("cuerpo_grande", "La petición es demasiado grande.", 413);
    const texto = await request.text();
    if (texto.length > MAX_CUERPO_BYTES) throw new ErrorFirma("cuerpo_grande", "La petición es demasiado grande.", 413);
    let body: Record<string, unknown>;
    try {
      const v = JSON.parse(texto || "{}");
      body = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      throw new ErrorFirma("json_invalido", "El cuerpo debe ser JSON.", 400);
    }
    const action = typeof body.action === "string" ? body.action : "";
    const admin = cliente(url, service);
    const ctx: Ctx = { admin, url, anon, service, body, ip: ipDe(request), agente: agenteDe(request), pais: paisDe(request) };

    if (PUBLICAS[action]) return json(await PUBLICAS[action](ctx));

    const authorization = request.headers.get("Authorization") ?? "";
    if (action === "vencer") {
      const secreto = ENV("CONV_FIRMA_CRON");
      const esCron = (secreto !== "" && iguales(request.headers.get("x-conv-firma-cron") ?? "", secreto)) || (authorization.startsWith("Bearer ") && iguales(authorization.slice(7), service));
      if (!esCron) throw new ErrorFirma("no_autorizado", "No autorizado.", 401);
      return json(await I.vencer(admin));
    }

    const accion = ESCRIBE[action] ?? LEE[action];
    if (!accion) throw new ErrorFirma("accion_desconocida", "Acción desconocida.", 400);
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anon) throw new ErrorFirma("sin_sesion", "Falta la sesión.", 401);
    const caller = cliente(url, anon, authorization);
    const quien = await caller.auth.getUser();
    if (quien.error || !quien.data.user) throw new ErrorFirma("sesion_invalida", "Sesión inválida.", 401);
    const permiso = await caller.rpc(ESCRIBE[action] ? "int_puede_crear" : "int_ve_modulo");
    if (permiso.error || permiso.data !== true) throw new ErrorFirma("sin_permiso", ESCRIBE[action] ? "No tiene permiso para gestionar firmas de convenios." : "No tiene permiso para ver las firmas de convenios.", 403);
    ctx.usuario = { id: quien.data.user.id, authorization };
    return json(await accion(ctx));
  } catch (e) {
    if (e instanceof ErrorFirma) return json({ error: e.message, code: e.code, ...e.extra }, e.status);
    // Sin detalle al cliente: podría traer direcciones o datos de personas.
    console.error("conv-firma:", e instanceof Error ? `${e.name}: ${e.message}` : e);
    return json({ error: "Algo falló al atender el pedido.", code: "error_interno" }, 500);
  }
});
