/* =============================================================================
   conv-firma · acciones INTERNAS (requieren sesión; ver CONTRATO.md).
   ========================================================================== */

import { cargarCertificadoUdes, exigirCertificadoVigente } from "./sello.ts";
import { contarPaginas, docxAPdf, estadoGotenberg, htmlAPdf } from "./pdf.ts";
import { pieHtml, prepararHtmlGenerado } from "./documentos.ts";
import { configCorreo } from "./correo.ts";
import {
  bajar, BUCKET, cargarConvenio, cargarFirma, cargarFirmantes, COLUMNAS_FIRMA, COLUMNAS_FIRMANTE_PUBLICAS, enviarSolicitud, evento, eventoCtx, limite,
  subir, urlFirmada,
} from "./comun.ts";
import type { Ctx, Firma, Firmante } from "./comun.ts";
import { cliente, codigoIdentidad, ErrorFirma, esUuid, formatoCorreo, sha256Hex, VIGENCIA_ENLACE_DIAS } from "./util.ts";
import type { Idioma } from "./plantilla.ts";
import { finalizar } from "./finalizar.ts";

const ROLES = ["UDES", "contraparte", "testigo"];
const idiomaDe = (v: unknown, def: Idioma): Idioma => (v === "en" ? "en" : v === "es" ? "es" : def);

interface EntradaFirmante {
  orden: number;
  rol: string;
  rol_texto: string;
  nombre: string;
  correo: string;
  idioma?: unknown;
}

function validarFirmantes(v: unknown): EntradaFirmante[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 10) throw new ErrorFirma("firmantes_invalidos", "Indique entre 1 y 10 firmantes.", 400);
  const vistos = new Set<number>();
  return v.map((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const orden = Number(o.orden);
    const nombre = typeof o.nombre === "string" ? o.nombre.trim().replace(/\s+/g, " ") : "";
    const correo = typeof o.correo === "string" ? o.correo.trim().toLowerCase() : "";
    const rol = typeof o.rol === "string" ? o.rol : "";
    if (!Number.isInteger(orden) || orden < 1 || orden > 20 || vistos.has(orden)) throw new ErrorFirma("firmantes_invalidos", `El orden del firmante ${i + 1} no es válido o está repetido.`, 400);
    vistos.add(orden);
    if (!nombre || nombre.length > 160) throw new ErrorFirma("firmantes_invalidos", `Falta el nombre del firmante ${i + 1}.`, 400);
    if (!formatoCorreo(correo)) throw new ErrorFirma("firmantes_invalidos", `El correo de ${nombre} no es válido.`, 400);
    if (!ROLES.includes(rol)) throw new ErrorFirma("firmantes_invalidos", `El rol de ${nombre} debe ser UDES, contraparte o testigo.`, 400);
    const rol_texto = typeof o.rol_texto === "string" ? o.rol_texto.trim().slice(0, 120) : "";
    return { orden, rol, rol_texto, nombre, correo, idioma: o.idioma };
  });
}

/* ---------- crear ------------------------------------------------------------------------------------- */

export async function crear(ctx: Ctx) {
  const b = ctx.body;
  if (!esUuid(b.generado_id)) throw new ErrorFirma("solicitud_invalida", "Falta el documento generado.", 400);
  const entradas = validarFirmantes(b.firmantes);
  const cert = cargarCertificadoUdes();
  exigirCertificadoVigente(cert);

  const { data: g } = await ctx.admin.from("conv_generados").select("id, convenio_id, nombre, ruta, formato, hash_sha256, idioma, estado").eq("id", b.generado_id).maybeSingle();
  if (!g) throw new ErrorFirma("no_encontrado", "No encontré el documento generado.", 404);
  if (g.estado === "firmado") throw new ErrorFirma("ya_firmado", "Este documento ya está firmado.", 409);
  const convenio = await cargarConvenio(ctx.admin, g.convenio_id);
  const viva = await ctx.admin.from("conv_firmas").select("id, estado").eq("generado_id", g.id).in("estado", ["borrador", "enviada", "en_firma", "firmada"]).maybeSingle();
  if (viva.data) throw new ErrorFirma("ya_existe", "Este documento ya tiene una solicitud de firma en curso. Cancélela para crear otra.", 409, { firma_id: viva.data.id });

  const idioma = idiomaDe(b.idioma, convenio.idioma ?? (g.idioma === "en" ? "en" : "es"));
  const { data: fila, error: errFila } = await ctx.admin
    .from("conv_firmas")
    .insert({
      convenio_id: convenio.id,
      generado_id: g.id,
      idioma,
      secuencial: b.secuencial === true,
      nombre_documento: String(g.nombre).slice(0, 200),
      formato_origen: g.formato,
      created_by: ctx.usuario?.id ?? null,
    })
    .select(COLUMNAS_FIRMA)
    .single();
  if (errFila || !fila) throw new ErrorFirma("base_de_datos", "No se pudo crear la solicitud de firma.", 500);
  const firma = fila as Firma;

  try {
    // PDF a firmar: del .docx (LibreOffice) o del HTML (Chromium), con la huella del archivo generado verificada antes.
    const origen = await bajar(ctx.admin, g.ruta, "conv-modelos");
    if ((await sha256Hex(origen)) !== g.hash_sha256) throw new ErrorFirma("documento_alterado", "El documento generado no coincide con su huella. Genérelo de nuevo.", 409);
    const pdf =
      g.formato === "docx"
        ? await docxAPdf(origen)
        : await htmlAPdf(prepararHtmlGenerado(new TextDecoder().decode(origen)), { pie: pieHtml(firma.codigo_verificacion, idioma) });
    const huella = await sha256Hex(pdf);
    const paginas = await contarPaginas(pdf);
    const ruta = `firmas/${firma.id}/base.pdf`;
    await subir(ctx.admin, ruta, pdf, "application/pdf");
    await ctx.admin.from("conv_firmas").update({ pdf_base_ruta: ruta, pdf_base_hash: huella, pdf_paginas: paginas }).eq("id", firma.id);

    const filas = [];
    for (const e of entradas) {
      filas.push({
        firma_id: firma.id,
        orden: e.orden,
        rol: e.rol,
        rol_texto: e.rol_texto,
        nombre: e.nombre,
        correo: e.correo,
        idioma: idiomaDe(e.idioma, e.rol === "contraparte" ? (convenio.idioma ?? idioma) : "es"),
        codigo_identidad: codigoIdentidad(),
      });
    }
    let ins = await ctx.admin.from("conv_firmantes").insert(filas);
    if (ins.error?.code === "23505") {
      for (const f of filas) f.codigo_identidad = codigoIdentidad();
      ins = await ctx.admin.from("conv_firmantes").insert(filas);
    }
    if (ins.error) throw new ErrorFirma("base_de_datos", "No se pudieron guardar los firmantes.", 500);
  } catch (e) {
    // Sin eventos todavía: la fila provisional se puede quitar sin dejar rastro a medias.
    await ctx.admin.from("conv_firmas").delete().eq("id", firma.id);
    throw e;
  }

  await eventoCtx(ctx, firma.id, null, "creado", { generado: g.id, formato: g.formato, firmantes: entradas.length, secuencial: b.secuencial === true });
  await eventoCtx(ctx, firma.id, null, "pdf_generado", { fase: "base" });
  await ctx.admin.from("conv_historial").insert({ convenio_id: convenio.id, texto: `Se creó la solicitud de firma electrónica ${firma.codigo_verificacion} con ${entradas.length} ${entradas.length === 1 ? "firmante" : "firmantes"}.`, autor: ctx.usuario?.id ?? null });
  // La carpeta de UDrive del convenio se asegura ahora, con la sesión de quien crea (la firma pública no tiene sesión).
  if (ctx.usuario) {
    const caller = cliente(ctx.url, ctx.anon, ctx.usuario.authorization);
    await caller.rpc("conv_asegurar_carpeta", { p_convenio: convenio.id }).then(() => null, () => null);
  }

  if (b.enviar === true) return await enviar({ ...ctx, body: { firma_id: firma.id } });
  return await resumen(ctx, firma.id);
}

/* ---------- enviar / recordar / reenviar --------------------------------------------------------------- */

/** Firmantes a los que les toca recibir el enlace ahora (todos, o solo el siguiente si es secuencial). */
function aNotificar(firma: Firma, fms: Firmante[], soloSinEnviar: boolean): Firmante[] {
  const pend = fms.filter((f) => f.estado !== "firmado" && (!soloSinEnviar || !f.enlace_enviado_en));
  if (!firma.secuencial) return pend;
  const turno = fms.filter((f) => f.estado !== "firmado").sort((a, b) => a.orden - b.orden)[0];
  return turno && pend.some((p) => p.id === turno.id) ? [turno] : [];
}

export async function enviar(ctx: Ctx) {
  const firma = await cargarFirma(ctx.admin, ctx.body.firma_id);
  if (firma.estado !== "borrador") throw new ErrorFirma("estado_invalido", "Esta solicitud ya se envió. Use «recordar» o «reenviar_enlace».", 409);
  exigirCertificadoVigente(cargarCertificadoUdes());
  const cfg = await configCorreo(ctx.admin);
  if (!cfg.conexion) throw new ErrorFirma("sin_correo", cfg.error, 503);
  const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
  const vence = new Date(Date.now() + VIGENCIA_ENLACE_DIAS * 86_400_000).toISOString();
  await ctx.admin.from("conv_firmas").update({ estado: "enviada", enviada_en: new Date().toISOString(), vence_en: vence }).eq("id", firma.id);
  await ctx.admin.from("conv_generados").update({ estado: "en_firma" }).eq("id", firma.generado_id);
  const actual: Firma = { ...firma, estado: "enviada", vence_en: vence };
  const fms = await cargarFirmantes(ctx.admin, firma.id);
  const enviados: string[] = [];
  const fallidos: { firmante_id: string; error: string }[] = [];
  for (const f of aNotificar(actual, fms, true)) {
    try {
      await enviarSolicitud(ctx, actual, f, convenio, "enviado");
      enviados.push(f.id);
    } catch (e) {
      fallidos.push({ firmante_id: f.id, error: e instanceof ErrorFirma ? e.message : "No se pudo enviar." });
    }
  }
  if (!enviados.length) {
    // Nada salió: la solicitud vuelve a borrador para poder reintentar.
    await ctx.admin.from("conv_firmas").update({ estado: "borrador", enviada_en: null }).eq("id", firma.id);
    await ctx.admin.from("conv_generados").update({ estado: "listo_firma" }).eq("id", firma.generado_id);
    throw new ErrorFirma("correo_fallo", fallidos[0]?.error ?? "No se pudo enviar ningún correo.", 502, { fallidos });
  }
  await ctx.admin.from("conv_historial").insert({ convenio_id: convenio.id, texto: `Se envió a firma electrónica (${firma.codigo_verificacion}); el enlace vence a los ${VIGENCIA_ENLACE_DIAS} días.`, autor: ctx.usuario?.id ?? null });
  return { ...(await resumen(ctx, firma.id)), enviados, fallidos };
}

async function reenvio(ctx: Ctx, motivo: "recordatorio" | "enlace_reenviado") {
  const firma = await cargarFirma(ctx.admin, ctx.body.firma_id);
  if (!["enviada", "en_firma", "vencida"].includes(firma.estado)) throw new ErrorFirma("estado_invalido", "Solo se puede reenviar en una solicitud enviada o vencida.", 409);
  const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
  let actual = firma;
  // Un enlace nuevo reactiva una solicitud vencida y extiende el plazo (por omisión; extender: false lo evita).
  if (ctx.body.extender !== false || firma.estado === "vencida") {
    const vence = new Date(Date.now() + VIGENCIA_ENLACE_DIAS * 86_400_000).toISOString();
    const estado = (await cargarFirmantes(ctx.admin, firma.id)).some((f) => f.estado === "firmado") ? "en_firma" : "enviada";
    await ctx.admin.from("conv_firmas").update({ estado, vence_en: vence }).eq("id", firma.id);
    if (firma.estado === "vencida") await ctx.admin.from("conv_generados").update({ estado: "en_firma" }).eq("id", firma.generado_id);
    actual = { ...firma, estado, vence_en: vence };
  }
  const fms = await cargarFirmantes(ctx.admin, firma.id);
  let objetivo: Firmante[];
  if (esUuid(ctx.body.firmante_id)) {
    const f = fms.find((x) => x.id === ctx.body.firmante_id);
    if (!f) throw new ErrorFirma("no_encontrado", "No encontré ese firmante.", 404);
    if (f.estado === "firmado") throw new ErrorFirma("ya_firmado", "Esa persona ya firmó.", 409);
    objetivo = [f];
  } else {
    objetivo = aNotificar(actual, fms, false);
  }
  if (!objetivo.length) throw new ErrorFirma("sin_pendientes", "No hay firmantes pendientes.", 409);
  const enviados: string[] = [];
  const fallidos: { firmante_id: string; error: string }[] = [];
  for (const f of objetivo) {
    try {
      await limite(ctx, `reenvio:${f.id}`, 6, 3600);
      await enviarSolicitud(ctx, actual, f, convenio, motivo);
      enviados.push(f.id);
    } catch (e) {
      fallidos.push({ firmante_id: f.id, error: e instanceof ErrorFirma ? e.message : "No se pudo enviar." });
    }
  }
  if (!enviados.length) throw new ErrorFirma("correo_fallo", fallidos[0]?.error ?? "No se pudo enviar.", 502, { fallidos });
  return { ...(await resumen(ctx, firma.id)), enviados, fallidos };
}

export const recordar = (ctx: Ctx) => reenvio(ctx, "recordatorio");
export const reenviarEnlace = (ctx: Ctx) => reenvio(ctx, "enlace_reenviado");

/* ---------- cancelar --------------------------------------------------------------------------------- */

export async function cancelar(ctx: Ctx) {
  const firma = await cargarFirma(ctx.admin, ctx.body.firma_id);
  if (["firmada", "cancelada"].includes(firma.estado)) throw new ErrorFirma("estado_invalido", `La solicitud ya está ${firma.estado}.`, 409);
  const motivo = typeof ctx.body.motivo === "string" ? ctx.body.motivo.trim().slice(0, 300) : "";
  await ctx.admin.from("conv_firmas").update({ estado: "cancelada", cancelada_en: new Date().toISOString(), cancelada_motivo: motivo || null }).eq("id", firma.id);
  await ctx.admin.from("conv_firmantes").update({ token_hash: null, codigo_hash: null, sesion_hash: null }).eq("firma_id", firma.id);
  await ctx.admin.from("conv_firma_moviles").update({ estado: "vencido" }).eq("firma_id", firma.id).eq("estado", "pendiente");
  await ctx.admin.from("conv_generados").update({ estado: "listo_firma" }).eq("id", firma.generado_id);
  await eventoCtx(ctx, firma.id, null, "cancelado", { motivo });
  await ctx.admin.from("conv_historial").insert({ convenio_id: firma.convenio_id, texto: `Se canceló la solicitud de firma ${firma.codigo_verificacion}${motivo ? `: ${motivo}` : "."}`.slice(0, 1000), autor: ctx.usuario?.id ?? null });
  return await resumen(ctx, firma.id);
}

/* ---------- lectura ---------------------------------------------------------------------------------- */

async function resumen(ctx: Ctx, firmaId: string) {
  const firma = await cargarFirma(ctx.admin, firmaId);
  const { data } = await ctx.admin.from("conv_firmantes").select(COLUMNAS_FIRMANTE_PUBLICAS).eq("firma_id", firmaId).order("orden");
  return { firma, firmantes: data ?? [] };
}

export async function listar(ctx: Ctx) {
  let q = ctx.admin.from("conv_firmas").select(COLUMNAS_FIRMA).order("created_at", { ascending: false }).limit(Math.min(Number(ctx.body.limite) || 50, 200));
  if (esUuid(ctx.body.convenio_id)) q = q.eq("convenio_id", ctx.body.convenio_id);
  if (esUuid(ctx.body.generado_id)) q = q.eq("generado_id", ctx.body.generado_id);
  if (typeof ctx.body.estado === "string") q = q.eq("estado", ctx.body.estado);
  const { data, error } = await q;
  if (error) throw new ErrorFirma("base_de_datos", "No se pudo leer la lista.", 500);
  const firmas = (data ?? []) as Firma[];
  const ids = firmas.map((f) => f.id);
  const fms = ids.length ? (await ctx.admin.from("conv_firmantes").select("id, firma_id, orden, rol, rol_texto, nombre, correo, estado, metodo, firmado_en").in("firma_id", ids).order("orden")).data ?? [] : [];
  return { firmas: firmas.map((f) => ({ ...f, firmantes: fms.filter((x: { firma_id: string }) => x.firma_id === f.id) })) };
}

export async function detalle(ctx: Ctx) {
  const base = await resumen(ctx, String((ctx.body as { firma_id?: unknown }).firma_id));
  const { data } = await ctx.admin.from("conv_firma_eventos").select("id, firmante_id, tipo, ocurrio_en, ip, agente, detalle, hash").eq("firma_id", base.firma.id).order("id");
  return { ...base, eventos: data ?? [] };
}

export async function descargar(ctx: Ctx) {
  const firma = await cargarFirma(ctx.admin, ctx.body.firma_id);
  const cual = ctx.body.archivo;
  const ruta = cual === "base" ? firma.pdf_base_ruta : cual === "firmado" ? firma.pdf_firmado_ruta : cual === "certificado" ? firma.certificado_ruta : null;
  if (!["base", "firmado", "certificado"].includes(String(cual))) throw new ErrorFirma("solicitud_invalida", "Indique archivo: base, firmado o certificado.", 400);
  if (!ruta) throw new ErrorFirma("no_disponible", "Ese archivo todavía no existe.", 404);
  const nombre = `${cual}-${firma.codigo_verificacion}.pdf`;
  await evento(ctx, firma.id, null, "documento_visto", { descarga_interna: String(cual) }, { ip: ctx.ip, agente: ctx.agente, actor: ctx.usuario?.id ?? null });
  return { url: await urlFirmada(ctx.admin, ruta, 120, nombre), vence_en_s: 120, nombre, bucket: BUCKET };
}

export async function estadoCertificadoUdes(ctx: Ctx) {
  const gotenberg = await estadoGotenberg();
  const correo = await configCorreo(ctx.admin);
  const comun = { gotenberg, correo: { modo: correo.modo, disponible: Boolean(correo.conexion), error: correo.error || null } };
  try {
    const c = cargarCertificadoUdes();
    return {
      configurado: true,
      origen: c.origen,
      sujeto: c.sujeto,
      emisor: c.emisor,
      serie: c.serie,
      desde: c.desde,
      hasta: c.hasta,
      vigente: c.vigente,
      autofirmado: c.autofirmado,
      sello_de_tiempo: { configurado: Boolean(c.tsaUrl), servidor: c.tsaUrl ? new URL(c.tsaUrl).host : null },
      nota: c.autofirmado
        ? "Certificado autofirmado (provisional). Para usar el definitivo reemplace los secretos CONV_FIRMA_P12 y CONV_FIRMA_P12_CLAVE; no hay que cambiar código."
        : null,
      ...comun,
    };
  } catch (e) {
    if (e instanceof ErrorFirma && (e.code === "sin_certificado" || e.code === "certificado_ilegible")) {
      return { configurado: false, codigo: e.code, mensaje: e.message, ...comun };
    }
    throw e;
  }
}

export async function reintentar(ctx: Ctx) {
  const firma = await cargarFirma(ctx.admin, ctx.body.firma_id);
  const r = await finalizar(ctx.admin, firma.id);
  return { ...r, ...(await resumen(ctx, firma.id)) };
}

/* ---------- vencer (cron) ----------------------------------------------------------------------------- */

export async function vencer(admin: Ctx["admin"]) {
  const ahora = new Date().toISOString();
  const { data } = await admin.from("conv_firmas").select("id, generado_id, convenio_id, codigo_verificacion").in("estado", ["enviada", "en_firma"]).is("finalizacion", null).lt("vence_en", ahora).limit(200);
  let vencidas = 0;
  for (const f of (data ?? []) as { id: string; generado_id: string; convenio_id: string; codigo_verificacion: string }[]) {
    const { data: upd } = await admin.from("conv_firmas").update({ estado: "vencida" }).eq("id", f.id).in("estado", ["enviada", "en_firma"]).select("id");
    if (!upd?.length) continue;
    await admin.from("conv_firmantes").update({ sesion_hash: null }).eq("firma_id", f.id);
    await admin.from("conv_generados").update({ estado: "listo_firma" }).eq("id", f.generado_id).neq("estado", "firmado");
    await evento({ admin }, f.id, null, "vencido", {});
    await admin.from("conv_historial").insert({ convenio_id: f.convenio_id, texto: `Venció la solicitud de firma ${f.codigo_verificacion} sin completarse.`, autor: null });
    vencidas++;
  }
  await admin.from("conv_firma_moviles").update({ estado: "vencido" }).eq("estado", "pendiente").lt("vence_en", ahora);
  // Finalizaciones que fallaron o quedaron a medias.
  const rezago = await admin
    .from("conv_firmas")
    .select("id, finalizacion, finalizacion_inicio, finalizacion_intentos")
    .in("estado", ["enviada", "en_firma"])
    .in("finalizacion", ["pendiente", "error", "en_proceso"])
    .lt("finalizacion_intentos", 5)
    .limit(10);
  let reintentos = 0;
  let recuperadas = 0;
  for (const r of (rezago.data ?? []) as { id: string }[]) {
    reintentos++;
    const res = await finalizar(admin, r.id);
    if (res.ok && !res.omitido) recuperadas++;
  }
  return { vencidas, reintentos, finalizaciones_recuperadas: recuperadas };
}
