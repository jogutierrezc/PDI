/* =============================================================================
   conv-firma · piezas comunes de las acciones: contexto, eventos, almacenamiento, límites y envío de la
   solicitud de firma a un firmante.
   ========================================================================== */

import { fechaLegible } from "./plantilla.ts";
import type { Idioma } from "./plantilla.ts";
import { configCorreo, enviarPlantilla, motivoCorreo } from "./correo.ts";
import {
  aHex, appUrl, CODIGO_VIGENCIA_MS, codigoSeisDigitos, ENV, ErrorFirma, fechaBogota, hmac, sha256Hex, tokenNuevo,
} from "./util.ts";
import type { Cliente } from "./util.ts";

export const BUCKET = "conv-firmas";

export interface Ctx {
  admin: Cliente;
  url: string;
  anon: string;
  service: string;
  body: Record<string, unknown>;
  ip: string;
  agente: string;
  pais: string;
  /** Solo en acciones internas. */
  usuario?: { id: string; authorization: string };
}

export interface Firma {
  id: string;
  convenio_id: string;
  generado_id: string;
  estado: string;
  idioma: Idioma;
  secuencial: boolean;
  codigo_verificacion: string;
  nombre_documento: string;
  formato_origen: string;
  pdf_base_ruta: string | null;
  pdf_base_hash: string | null;
  pdf_paginas: number | null;
  pdf_firmado_ruta: string | null;
  pdf_firmado_hash: string | null;
  certificado_ruta: string | null;
  certificado_hash: string | null;
  sellado: Record<string, unknown>;
  finalizacion: string | null;
  finalizacion_intentos: number;
  vence_en: string;
  enviada_en: string | null;
  firmada_en: string | null;
  created_by: string | null;
}

export interface Firmante {
  id: string;
  firma_id: string;
  orden: number;
  rol: string;
  rol_texto: string;
  nombre: string;
  correo: string;
  idioma: Idioma;
  estado: string;
  codigo_identidad: string;
  token_hash: string | null;
  enlace_enviado_en: string | null;
  recordatorios: number;
  codigo_hash: string | null;
  codigo_vence: string | null;
  codigo_intentos: number;
  codigo_enviado_en: string | null;
  codigo_envios_dia: number;
  codigo_dia: string | null;
  codigo_fallos: number;
  bloqueado_hasta: string | null;
  sesion_hash: string | null;
  sesion_vence: string | null;
  metodo: string | null;
  trazo_ruta: string | null;
  cert_sujeto: string | null;
  cert_emisor: string | null;
  cert_serie: string | null;
  cert_desde: string | null;
  cert_hasta: string | null;
  cert_cadena: string | null;
  ip: string | null;
  agente: string | null;
  pais: string | null;
  abierto_en: string | null;
  verificado_en: string | null;
  leido_en: string | null;
  firmado_en: string | null;
}

/** Columnas de conv_firmantes que nunca salen de la función (hashes y firma criptográfica en bruto). */
export const COLUMNAS_FIRMANTE_PUBLICAS =
  "id, firma_id, orden, rol, rol_texto, nombre, correo, idioma, estado, codigo_identidad, enlace_enviado_en, recordatorios, codigo_enviado_en, bloqueado_hasta, metodo, cert_sujeto, cert_emisor, cert_serie, cert_desde, cert_hasta, cert_cadena, acepta_firma, ip, agente, pais, zona_horaria, abierto_en, verificado_en, leido_en, firmado_en";

export const COLUMNAS_FIRMA =
  "id, convenio_id, generado_id, estado, idioma, secuencial, codigo_verificacion, nombre_documento, formato_origen, pdf_base_ruta, pdf_base_hash, pdf_paginas, pdf_firmado_ruta, pdf_firmado_hash, pdf_firmado_tamano, certificado_ruta, certificado_hash, sellado, udrive, finalizacion, finalizacion_intentos, finalizacion_error, vence_en, enviada_en, firmada_en, cancelada_en, cancelada_motivo, created_by, created_at";

/* ---------- Eventos --------------------------------------------------------------------------------- */

export async function evento(
  c: Ctx | { admin: Cliente },
  firmaId: string,
  firmanteId: string | null,
  tipo: string,
  detalle: Record<string, unknown> = {},
  quien: { ip?: string; agente?: string; actor?: string | null } = {},
): Promise<void> {
  const { error } = await c.admin.from("conv_firma_eventos").insert({
    firma_id: firmaId,
    firmante_id: firmanteId,
    tipo,
    ip: quien.ip || null,
    agente: quien.agente || null,
    actor: quien.actor ?? null,
    detalle,
  });
  if (error) console.error("No se pudo registrar el evento", tipo, error.message);
}

/** Evento a nombre de quien llama (IP y agente del contexto). */
export const eventoCtx = (ctx: Ctx, firmaId: string, firmanteId: string | null, tipo: string, detalle: Record<string, unknown> = {}) =>
  evento(ctx, firmaId, firmanteId, tipo, { ...detalle, ...(ctx.pais ? { pais_encabezado: ctx.pais } : {}) }, { ip: ctx.ip, agente: ctx.agente, actor: ctx.usuario?.id ?? null });

/* ---------- Límites -------------------------------------------------------------------------------- */

export async function limite(ctx: Ctx, clave: string, max: number, segundos: number): Promise<void> {
  const { data, error } = await ctx.admin.rpc("conv_firma_limite", { p_clave: clave, p_max: max, p_segundos: segundos });
  if (error) throw new ErrorFirma("limite_no_disponible", "No se pudo comprobar el límite de intentos. Intente de nuevo.", 503);
  if (data !== true) throw new ErrorFirma("demasiadas_peticiones", "Demasiadas peticiones seguidas. Espere un momento e intente de nuevo.", 429, { retry_after: segundos });
}

/* ---------- Almacenamiento ---------------------------------------------------------------------------- */

export async function subir(admin: Cliente, ruta: string, bytes: Uint8Array, tipo: string, bucket = BUCKET): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(ruta, bytes, { contentType: tipo, upsert: true });
  if (error) throw new ErrorFirma("almacenamiento", "No se pudo guardar el archivo.", 502);
}

export async function bajar(admin: Cliente, ruta: string, bucket = BUCKET): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).download(ruta);
  if (error || !data) throw new ErrorFirma("almacenamiento", "No se pudo leer un archivo guardado.", 502);
  return new Uint8Array(await data.arrayBuffer());
}

/** URL firmada de corta vida; el origen se cambia por el público (la función ve el servidor por su red interna). */
export async function urlFirmada(admin: Cliente, ruta: string, segundos: number, descarga?: string): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(ruta, segundos, descarga ? { download: descarga } : undefined);
  if (error || !data?.signedUrl) throw new ErrorFirma("almacenamiento", "No se pudo preparar la descarga.", 502);
  const u = new URL(data.signedUrl);
  const base = (ENV("CONV_URL_SUPABASE_PUBLICA") || appUrl()).replace(/\/+$/, "");
  return `${base}${u.pathname}${u.search}`;
}

/* ---------- Cargas ------------------------------------------------------------------------------------- */

export async function cargarFirma(admin: Cliente, id: unknown): Promise<Firma> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorFirma("solicitud_invalida", "Falta la solicitud de firma.", 400);
  const { data } = await admin.from("conv_firmas").select(COLUMNAS_FIRMA).eq("id", id).maybeSingle();
  if (!data) throw new ErrorFirma("no_encontrada", "No encontré esa solicitud de firma.", 404);
  return data as Firma;
}

export async function cargarFirmantes(admin: Cliente, firmaId: string): Promise<Firmante[]> {
  const { data } = await admin.from("conv_firmantes").select("*").eq("firma_id", firmaId).order("orden");
  return (data ?? []) as Firmante[];
}

export async function cargarConvenio(admin: Cliente, id: string): Promise<{ id: string; codigo: string; institucion: string; pais: string; idioma: Idioma | null }> {
  const { data } = await admin.from("conv_convenios").select("id, codigo, institucion, pais, idioma").eq("id", id).maybeSingle();
  if (!data) throw new ErrorFirma("no_encontrado", "No encontré el convenio.", 404);
  return data;
}

/** Mensaje exacto que el navegador firma con su certificado (ver CONTRATO.md). */
export const mensajeFirma = (f: Pick<Firma, "codigo_verificacion" | "pdf_base_hash">, fm: Pick<Firmante, "codigo_identidad">): string =>
  `UDES-FIRMA-V1\n${f.codigo_verificacion}\n${fm.codigo_identidad}\n${f.pdf_base_hash ?? ""}`;

/* ---------- Enlace y código por firmante --------------------------------------------------------------- */

export type Motivo = "enviado" | "recordatorio" | "enlace_reenviado";

const PLANTILLA: Record<Motivo, string> = { enviado: "firma_solicitud", recordatorio: "firma_recordatorio", enlace_reenviado: "firma_solicitud" };

/**
 * Genera un enlace nuevo y un código nuevo para el firmante (los anteriores dejan de servir), y le manda el
 * correo con el enlace Y el código de 6 dígitos. El token y el código se guardan solo como hash.
 */
export async function enviarSolicitud(ctx: Ctx, firma: Firma, fm: Firmante, convenio: { institucion: string }, motivo: Motivo): Promise<void> {
  const cfg = await configCorreo(ctx.admin);
  if (!cfg.conexion) throw new ErrorFirma("sin_correo", cfg.error || "No hay servidor de correo configurado.", 503);
  const token = tokenNuevo();
  const codigo = codigoSeisDigitos();
  const ahora = new Date();
  const hoy = fechaBogota(ahora);
  const cambios = {
    token_hash: await sha256Hex(token),
    enlace_enviado_en: ahora.toISOString(),
    codigo_hash: await hmac(`${fm.id}|${codigo}`),
    codigo_vence: new Date(ahora.getTime() + CODIGO_VIGENCIA_MS).toISOString(),
    codigo_intentos: 0,
    codigo_enviado_en: ahora.toISOString(),
    codigo_dia: hoy,
    codigo_envios_dia: fm.codigo_dia === hoy ? fm.codigo_envios_dia + 1 : 1,
    sesion_hash: null,
    sesion_vence: null,
    ...(motivo === "recordatorio" ? { recordatorios: fm.recordatorios + 1 } : {}),
  };
  const { error } = await ctx.admin.from("conv_firmantes").update(cambios).eq("id", fm.id);
  if (error) throw new ErrorFirma("base_de_datos", "No se pudo preparar el enlace de firma.", 500);
  try {
    await enviarPlantilla(ctx.admin, cfg, {
      clave: PLANTILLA[motivo],
      idioma: fm.idioma,
      para: fm.correo,
      exigirCodigo: true,
      variables: {
        nombre_firmante: fm.nombre,
        institucion: convenio.institucion,
        enlace_firma: `${appUrl()}/firma/${token}`,
        vence: fechaLegible(fechaBogota(new Date(firma.vence_en)), fm.idioma),
        codigo_certificado: firma.codigo_verificacion,
        codigo_verificacion: codigo,
      },
    });
  } catch (e) {
    await eventoCtx(ctx, firma.id, fm.id, "enviado", { ok: false, motivo: motivoCorreo(e) });
    throw new ErrorFirma("correo_fallo", `No se pudo enviar el correo a ${fm.nombre}: ${e instanceof Error && e.message && !("code" in e) ? e.message : motivoCorreo(e)}`, 502);
  }
  await eventoCtx(ctx, firma.id, fm.id, motivo, { correo_modo: cfg.modo, codigo_incluido: true, vence_codigo_min: 10 });
  if (motivo === "enviado") await eventoCtx(ctx, firma.id, fm.id, "codigo_enviado", { en_el_mismo_correo: true });
  await eventoCtx(ctx, firma.id, fm.id, "entregado", { nivel: "aceptado_por_el_servidor_de_correo" });
}

/** Hash del token del enlace (para buscar al firmante). */
export const hashToken = (t: string): Promise<string> => sha256Hex(t);
export const hashSesion = (s: string): Promise<string> => sha256Hex(`sesion|${s}`);
export { aHex };
