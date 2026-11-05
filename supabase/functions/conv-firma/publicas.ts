/* =============================================================================
   conv-firma · acciones PÚBLICAS (sin sesión). El token del enlace identifica al firmante; tras verificar el
   código de 6 dígitos se entrega una sesión corta de un solo firmante. Ver CONTRATO.md.
   ========================================================================== */

import {
  aBase64, appUrl, BLOQUEO_FALLOS, BLOQUEO_MS, CODIGO_ESPERA_S, CODIGO_MAX_ENVIOS_DIA, CODIGO_MAX_INTENTOS, CODIGO_VIGENCIA_MS, codigoSeisDigitos, correoEnmascarado, deBase64,
  ErrorFirma, fechaBogota, hmac, iguales, MOVIL_VIGENCIA_MS, SESION_VIGENCIA_MS, TOKEN_FORMATO, tokenNuevo, zonaHorariaValida,
} from "./util.ts";
import {
  bajar, cargarConvenio, cargarFirma, cargarFirmantes, COLUMNAS_FIRMA, enviarSolicitud, eventoCtx, hashSesion, hashToken, limite, mensajeFirma, subir, urlFirmada,
} from "./comun.ts";
import type { Ctx, Firma, Firmante } from "./comun.ts";
import { base64DeImagen, prepararTrazo } from "./trazo.ts";
import { validarCertificadoFirmante } from "./certfirmante.ts";
import { configCorreo, enviarPlantilla, motivoCorreo } from "./correo.ts";
import { fechaLegible } from "./plantilla.ts";
import { finalizar } from "./finalizar.ts";

const ahoraMs = () => Date.now();
const IP = (ctx: Ctx) => ctx.ip || "sin-ip";

/* ---------- Búsqueda y comprobaciones ---------------------------------------------------------------- */

async function porToken(ctx: Ctx, permitirFirmada = false): Promise<{ fm: Firmante; firma: Firma }> {
  await limite(ctx, `tok:${IP(ctx)}`, 120, 60);
  const token = ctx.body.token;
  if (typeof token !== "string" || !TOKEN_FORMATO.test(token)) throw new ErrorFirma("enlace_invalido", "El enlace no es válido.", 404);
  const { data } = await ctx.admin.from("conv_firmantes").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!data) throw new ErrorFirma("enlace_invalido", "El enlace no es válido o ya no está vigente.", 404);
  const fm = data as Firmante;
  const firma = await cargarFirma(ctx.admin, fm.firma_id);
  if (firma.estado === "borrador") throw new ErrorFirma("enlace_invalido", "El enlace no es válido.", 404);
  if (firma.estado === "cancelada") throw new ErrorFirma("solicitud_cancelada", "Esta solicitud de firma fue cancelada. Si cree que es un error, comuníquese con Relaciones Internacionales.", 410);
  if (firma.estado === "firmada") {
    if (!permitirFirmada) throw new ErrorFirma("ya_finalizada", "Este convenio ya fue firmado por todas las partes.", 409, { codigo_verificacion: firma.codigo_verificacion });
    return { fm, firma };
  }
  if (firma.estado === "vencida" || new Date(firma.vence_en).getTime() < ahoraMs()) throw new ErrorFirma("enlace_vencido", "El enlace venció. Pida a Relaciones Internacionales que le envíen uno nuevo.", 410);
  return { fm, firma };
}

async function exigirSesion(ctx: Ctx, fm: Firmante): Promise<void> {
  const s = ctx.body.sesion;
  if (typeof s !== "string" || !TOKEN_FORMATO.test(s) || !fm.sesion_hash || !fm.sesion_vence) throw new ErrorFirma("sesion_invalida", "Primero verifique su código.", 401);
  if (new Date(fm.sesion_vence).getTime() < ahoraMs()) throw new ErrorFirma("sesion_vencida", "La sesión venció. Verifique un código nuevo.", 401);
  if (!iguales(fm.sesion_hash, await hashSesion(s))) throw new ErrorFirma("sesion_invalida", "La sesión no es válida.", 401);
}

/** En una solicitud secuencial, solo firma quien tiene el turno. */
async function exigirTurno(ctx: Ctx, firma: Firma, fm: Firmante): Promise<void> {
  if (!firma.secuencial) return;
  const fms = await cargarFirmantes(ctx.admin, firma.id);
  if (fms.some((x) => x.orden < fm.orden && x.estado !== "firmado")) throw new ErrorFirma("turno_pendiente", "Todavía no es su turno: otra persona debe firmar antes.", 409);
}

const faltaDe = (fm: Firmante, firma: Firma, esTurno: boolean): string => {
  if (fm.estado === "firmado") return "nada";
  if (!esTurno) return "esperar_turno";
  if (fm.estado !== "verificado") return "codigo";
  if (!fm.leido_en) return "lectura";
  return firma.estado === "firmada" ? "nada" : "firma";
};

/* ---------- abrir ------------------------------------------------------------------------------------- */

export async function abrir(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx, true);
  const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
  const fms = await cargarFirmantes(ctx.admin, firma.id);
  const esTurno = !firma.secuencial || !fms.some((x) => x.orden < fm.orden && x.estado !== "firmado");
  const sesionViva = Boolean(fm.sesion_vence && new Date(fm.sesion_vence).getTime() > ahoraMs());
  if (fm.estado === "pendiente" && firma.estado !== "firmada") {
    await ctx.admin.from("conv_firmantes").update({ estado: "abierto", abierto_en: new Date().toISOString() }).eq("id", fm.id).eq("estado", "pendiente");
  }
  await eventoCtx(ctx, firma.id, fm.id, "abierto", {});
  const espera = fm.codigo_enviado_en ? Math.max(0, CODIGO_ESPERA_S - Math.floor((ahoraMs() - new Date(fm.codigo_enviado_en).getTime()) / 1000)) : 0;
  return {
    estado_firma: firma.estado,
    estado_firmante: fm.estado === "pendiente" ? "abierto" : fm.estado,
    idioma: fm.idioma,
    documento: { nombre: firma.nombre_documento, institucion: convenio.institucion, paginas: firma.pdf_paginas },
    firmante: { nombre: fm.nombre, correo_enmascarado: correoEnmascarado(fm.correo), rol: fm.rol, rol_texto: fm.rol_texto, codigo_identidad: fm.codigo_identidad },
    firmantes: fms.map((x) => ({ orden: x.orden, rol: x.rol, rol_texto: x.rol_texto, nombre: x.nombre, firmado: x.estado === "firmado" })),
    vence_en: firma.vence_en,
    turno: esTurno,
    falta: faltaDe(fm, firma, esTurno),
    codigo_vigente: Boolean(fm.codigo_hash && fm.codigo_vence && new Date(fm.codigo_vence).getTime() > ahoraMs() && fm.codigo_intentos < CODIGO_MAX_INTENTOS),
    espera_codigo_s: espera,
    sesion_vigente: sesionViva && fm.estado === "verificado",
    firmado_en: fm.firmado_en,
    codigo_verificacion: firma.estado === "firmada" || fm.estado === "firmado" ? firma.codigo_verificacion : null,
  };
}

/* ---------- código ------------------------------------------------------------------------------------ */

export async function solicitarCodigo(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  if (fm.estado === "firmado") throw new ErrorFirma("ya_firmado", "Usted ya firmó este convenio.", 409);
  await limite(ctx, `codigo:${IP(ctx)}`, 20, 600);
  if (fm.bloqueado_hasta && new Date(fm.bloqueado_hasta).getTime() > ahoraMs()) {
    throw new ErrorFirma("bloqueado", "Por seguridad, la verificación está bloqueada por un rato. Intente más tarde.", 423, { retry_after: Math.ceil((new Date(fm.bloqueado_hasta).getTime() - ahoraMs()) / 1000) });
  }
  if (fm.codigo_enviado_en) {
    const falta = CODIGO_ESPERA_S - Math.floor((ahoraMs() - new Date(fm.codigo_enviado_en).getTime()) / 1000);
    if (falta > 0) throw new ErrorFirma("espera_codigo", `Podrá pedir otro código en ${falta} segundos.`, 429, { retry_after: falta });
  }
  const hoy = fechaBogota();
  const enviosHoy = fm.codigo_dia === hoy ? fm.codigo_envios_dia : 0;
  if (enviosHoy >= CODIGO_MAX_ENVIOS_DIA) throw new ErrorFirma("limite_diario", "Pidió demasiados códigos hoy. Intente mañana o escriba a Relaciones Internacionales.", 429, { retry_after: 3600 });
  const cfg = await configCorreo(ctx.admin);
  if (!cfg.conexion) throw new ErrorFirma("sin_correo", "No pudimos enviar el correo en este momento. Intente más tarde.", 503);
  const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
  const codigo = codigoSeisDigitos();
  const ahora = new Date();
  // El código anterior queda invalidado al reemplazar el hash.
  await ctx.admin
    .from("conv_firmantes")
    .update({
      codigo_hash: await hmac(`${fm.id}|${codigo}`),
      codigo_vence: new Date(ahora.getTime() + CODIGO_VIGENCIA_MS).toISOString(),
      codigo_intentos: 0,
      codigo_enviado_en: ahora.toISOString(),
      codigo_dia: hoy,
      codigo_envios_dia: enviosHoy + 1,
    })
    .eq("id", fm.id);
  try {
    await enviarPlantilla(ctx.admin, cfg, {
      clave: "firma_codigo",
      idioma: fm.idioma,
      para: fm.correo,
      exigirCodigo: true,
      variables: {
        nombre_firmante: fm.nombre,
        institucion: convenio.institucion,
        codigo_verificacion: codigo,
        enlace_firma: "",
        vence: fechaLegible(fechaBogota(new Date(firma.vence_en)), fm.idioma),
        codigo_certificado: firma.codigo_verificacion,
      },
    });
  } catch (e) {
    console.error("Código no enviado:", motivoCorreo(e));
    throw new ErrorFirma("correo_fallo", "No pudimos enviar el correo con el código. Intente de nuevo en un momento.", 502);
  }
  await eventoCtx(ctx, firma.id, fm.id, "codigo_reenviado", { envios_hoy: enviosHoy + 1 });
  return { enviado: true, correo_enmascarado: correoEnmascarado(fm.correo), espera_s: CODIGO_ESPERA_S, vence_en: new Date(ahora.getTime() + CODIGO_VIGENCIA_MS).toISOString(), invalida_anterior: true };
}

export async function verificarCodigo(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  if (fm.estado === "firmado") throw new ErrorFirma("ya_firmado", "Usted ya firmó este convenio.", 409);
  await limite(ctx, `verif:${IP(ctx)}`, 40, 600);
  await exigirTurno(ctx, firma, fm);
  const codigo = typeof ctx.body.codigo === "string" ? ctx.body.codigo.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(codigo)) throw new ErrorFirma("codigo_formato", "El código tiene 6 dígitos.", 400);
  if (fm.bloqueado_hasta && new Date(fm.bloqueado_hasta).getTime() > ahoraMs()) {
    throw new ErrorFirma("bloqueado", "Por seguridad, la verificación está bloqueada por un rato. Intente más tarde.", 423, { retry_after: Math.ceil((new Date(fm.bloqueado_hasta).getTime() - ahoraMs()) / 1000) });
  }
  if (!fm.codigo_hash || !fm.codigo_vence) throw new ErrorFirma("sin_codigo", "No hay un código vigente. Pida uno nuevo.", 409);
  if (new Date(fm.codigo_vence).getTime() < ahoraMs()) throw new ErrorFirma("codigo_vencido", "El código venció. Pida uno nuevo.", 410);
  if (fm.codigo_intentos >= CODIGO_MAX_INTENTOS) throw new ErrorFirma("codigo_bloqueado", "Demasiados intentos con este código. Pida uno nuevo.", 429, { intentos_restantes: 0 });

  // Se descuenta el intento ANTES de comparar y de forma atómica (condición sobre el contador leído): dos pedidos en
  // paralelo no pueden gastar menos de los 5 intentos.
  const gastado = await ctx.admin
    .from("conv_firmantes")
    .update({ codigo_intentos: fm.codigo_intentos + 1 })
    .eq("id", fm.id)
    .eq("codigo_intentos", fm.codigo_intentos)
    .select("codigo_hash, codigo_intentos");
  if (!gastado.data?.length) throw new ErrorFirma("reintente", "No se pudo comprobar el código. Intente de nuevo.", 409);
  const esperado = gastado.data[0].codigo_hash as string;
  const intento = gastado.data[0].codigo_intentos as number;
  const correcto = iguales(esperado, await hmac(`${fm.id}|${codigo}`));
  if (!correcto) {
    const fallos = fm.codigo_fallos + 1;
    const bloquear = fallos >= BLOQUEO_FALLOS;
    await ctx.admin.from("conv_firmantes").update({ codigo_fallos: fallos, ...(bloquear ? { bloqueado_hasta: new Date(ahoraMs() + BLOQUEO_MS).toISOString(), codigo_fallos: 0 } : {}) }).eq("id", fm.id);
    await eventoCtx(ctx, firma.id, fm.id, "codigo_fallido", { intento, intentos_restantes: CODIGO_MAX_INTENTOS - intento });
    if (bloquear) await eventoCtx(ctx, firma.id, fm.id, "bloqueado", { hasta_min: BLOQUEO_MS / 60000 });
    throw new ErrorFirma(intento >= CODIGO_MAX_INTENTOS ? "codigo_bloqueado" : "codigo_incorrecto", intento >= CODIGO_MAX_INTENTOS ? "Demasiados intentos con este código. Pida uno nuevo." : "Código incorrecto.", 401, {
      intentos_restantes: Math.max(0, CODIGO_MAX_INTENTOS - intento),
    });
  }
  const sesion = tokenNuevo();
  const vence = new Date(ahoraMs() + SESION_VIGENCIA_MS).toISOString();
  const ok = await ctx.admin
    .from("conv_firmantes")
    .update({ codigo_hash: null, codigo_vence: null, codigo_fallos: 0, estado: "verificado", verificado_en: new Date().toISOString(), sesion_hash: await hashSesion(sesion), sesion_vence: vence })
    .eq("id", fm.id)
    .eq("codigo_hash", esperado)
    .select("id");
  if (!ok.data?.length) throw new ErrorFirma("reintente", "No se pudo comprobar el código. Intente de nuevo.", 409);
  await eventoCtx(ctx, firma.id, fm.id, "codigo_verificado", {});
  return { sesion, sesion_vence_en: vence, mensaje_firma: mensajeFirma(firma, fm), huella: firma.pdf_base_hash, paginas: firma.pdf_paginas, algoritmos_certificado: ["RSASSA-PKCS1-v1_5-SHA256", "ECDSA-P256-SHA256"] };
}

/* ---------- documento y lectura ------------------------------------------------------------------------ */

export async function documento(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  await exigirSesion(ctx, fm);
  if (fm.estado === "pendiente" || fm.estado === "abierto") throw new ErrorFirma("sin_verificar", "Primero verifique su código.", 401);
  await exigirTurno(ctx, firma, fm);
  if (!firma.pdf_base_ruta) throw new ErrorFirma("no_disponible", "El documento todavía no está listo.", 404);
  await limite(ctx, `doc:${fm.id}`, 30, 600);
  const segundos = 90;
  const url = await urlFirmada(ctx.admin, firma.pdf_base_ruta, segundos);
  await eventoCtx(ctx, firma.id, fm.id, "documento_visto", {});
  return { url, vence_en_s: segundos, nombre: firma.nombre_documento, paginas: firma.pdf_paginas, huella: firma.pdf_base_hash, mensaje_firma: mensajeFirma(firma, fm) };
}

export async function marcarLeido(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  await exigirSesion(ctx, fm);
  if (!fm.leido_en) {
    await ctx.admin.from("conv_firmantes").update({ leido_en: new Date().toISOString() }).eq("id", fm.id).is("leido_en", null);
    await eventoCtx(ctx, firma.id, fm.id, "documento_leido", {});
  }
  return { leido: true };
}

/* ---------- móvil -------------------------------------------------------------------------------------- */

export async function iniciarMovil(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  await exigirSesion(ctx, fm);
  if (fm.estado !== "verificado") throw new ErrorFirma("sin_verificar", "Primero verifique su código.", 401);
  await exigirTurno(ctx, firma, fm);
  await limite(ctx, `movil:${fm.id}`, 10, 3600);
  await ctx.admin.from("conv_firma_moviles").update({ estado: "vencido" }).eq("firmante_id", fm.id).eq("estado", "pendiente");
  const token = tokenNuevo();
  const vence = new Date(ahoraMs() + MOVIL_VIGENCIA_MS).toISOString();
  const { error } = await ctx.admin.from("conv_firma_moviles").insert({ firma_id: firma.id, firmante_id: fm.id, token_hash: await hashToken(token), vence_en: vence, ip: ctx.ip || null, agente: ctx.agente || null });
  if (error) throw new ErrorFirma("base_de_datos", "No se pudo iniciar la firma desde el móvil.", 500);
  await eventoCtx(ctx, firma.id, fm.id, "movil_iniciado", {});
  return { movil_token: token, url: `${appUrl()}/firma/movil/${token}`, vence_en: vence, vigencia_s: MOVIL_VIGENCIA_MS / 1000 };
}

export async function estadoMovil(ctx: Ctx) {
  const { fm } = await porToken(ctx);
  await exigirSesion(ctx, fm);
  await limite(ctx, `estmov:${fm.id}`, 400, 600);
  const { data } = await ctx.admin.from("conv_firma_moviles").select("id, estado, vence_en, trazo_ruta").eq("firmante_id", fm.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return { estado: "ninguna" };
  let estado = data.estado as string;
  if (estado === "pendiente" && new Date(data.vence_en).getTime() < ahoraMs()) {
    await ctx.admin.from("conv_firma_moviles").update({ estado: "vencido" }).eq("id", data.id).eq("estado", "pendiente");
    estado = "vencido";
  }
  if (estado === "recibido" && data.trazo_ruta) {
    return { estado, vence_en: data.vence_en, imagen: `data:image/png;base64,${aBase64(await bajar(ctx.admin, data.trazo_ruta))}` };
  }
  return { estado, vence_en: data.vence_en };
}

async function movilPorToken(ctx: Ctx) {
  await limite(ctx, `movtok:${IP(ctx)}`, 60, 600);
  const t = ctx.body.movil_token;
  if (typeof t !== "string" || !TOKEN_FORMATO.test(t)) throw new ErrorFirma("movil_invalido", "El código de la pantalla no es válido.", 404);
  const { data } = await ctx.admin.from("conv_firma_moviles").select("*").eq("token_hash", await hashToken(t)).maybeSingle();
  if (!data) throw new ErrorFirma("movil_invalido", "El código de la pantalla no es válido.", 404);
  if (data.estado === "pendiente" && new Date(data.vence_en).getTime() < ahoraMs()) {
    await ctx.admin.from("conv_firma_moviles").update({ estado: "vencido" }).eq("id", data.id).eq("estado", "pendiente");
    data.estado = "vencido";
  }
  const { data: fm } = await ctx.admin.from("conv_firmantes").select("id, nombre, idioma, estado").eq("id", data.firmante_id).maybeSingle();
  return { mov: data as { id: string; firma_id: string; firmante_id: string; estado: string; vence_en: string }, fm: fm as { id: string; nombre: string; idioma: string; estado: string } };
}

export async function movilAbrir(ctx: Ctx) {
  const { mov, fm } = await movilPorToken(ctx);
  if (mov.estado === "vencido") throw new ErrorFirma("movil_vencido", "El código venció. Genere otro en el computador.", 410);
  if (mov.estado !== "pendiente") throw new ErrorFirma("movil_usado", "Esta firma ya se envió desde el teléfono.", 409);
  return { valido: true, idioma: fm.idioma, nombre: fm.nombre, vence_en: mov.vence_en };
}

export async function movilEnviar(ctx: Ctx) {
  const { mov, fm } = await movilPorToken(ctx);
  if (mov.estado === "vencido") throw new ErrorFirma("movil_vencido", "El código venció. Genere otro en el computador.", 410);
  if (mov.estado !== "pendiente") throw new ErrorFirma("movil_usado", "Esta firma ya se envió desde el teléfono.", 409);
  if (fm.estado !== "verificado") throw new ErrorFirma("sin_verificar", "La sesión del computador ya no está activa.", 409);
  const png = prepararTrazo(deBase64(base64DeImagen(ctx.body.imagen)));
  const ruta = `firmas/${mov.firma_id}/moviles/${mov.id}.png`;
  await subir(ctx.admin, ruta, png, "image/png");
  const r = await ctx.admin.from("conv_firma_moviles").update({ estado: "recibido", trazo_ruta: ruta, recibido_en: new Date().toISOString(), ip: ctx.ip || null, agente: ctx.agente || null }).eq("id", mov.id).eq("estado", "pendiente").select("id");
  if (!r.data?.length) throw new ErrorFirma("movil_usado", "Esta firma ya se envió desde el teléfono.", 409);
  await eventoCtx(ctx, mov.firma_id, mov.firmante_id, "movil_recibido", {});
  return { recibido: true };
}

/* ---------- firmar ------------------------------------------------------------------------------------- */

export async function firmar(ctx: Ctx) {
  const { fm, firma } = await porToken(ctx);
  await exigirSesion(ctx, fm);
  if (fm.estado === "firmado") throw new ErrorFirma("ya_firmado", "Usted ya firmó este convenio.", 409);
  if (fm.estado !== "verificado") throw new ErrorFirma("sin_verificar", "Primero verifique su código.", 401);
  await exigirTurno(ctx, firma, fm);
  await limite(ctx, `firmar:${fm.id}`, 15, 600);
  const b = ctx.body;
  if (b.acepta !== true) throw new ErrorFirma("sin_aceptacion", "Debe aceptar el uso de la firma electrónica para firmar.", 400);
  const metodo = b.metodo;
  if (metodo !== "dibujo" && metodo !== "movil" && metodo !== "certificado") throw new ErrorFirma("metodo_invalido", "El método de firma debe ser dibujo, movil o certificado.", 400);

  let trazoRuta: string | null = null;
  const cert: Record<string, unknown> = {};
  if (metodo === "dibujo") {
    const png = prepararTrazo(deBase64(base64DeImagen(b.imagen)));
    trazoRuta = `firmas/${firma.id}/trazos/${fm.id}.png`;
    await subir(ctx.admin, trazoRuta, png, "image/png");
  } else if (metodo === "movil") {
    const { data: mov } = await ctx.admin.from("conv_firma_moviles").select("id, trazo_ruta, recibido_en").eq("firmante_id", fm.id).eq("estado", "recibido").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!mov?.trazo_ruta || !mov.recibido_en || ahoraMs() - new Date(mov.recibido_en).getTime() > 15 * 60_000) throw new ErrorFirma("sin_trazo_movil", "No hay una firma reciente enviada desde el teléfono. Genere un código nuevo.", 409);
    trazoRuta = `firmas/${firma.id}/trazos/${fm.id}.png`;
    await subir(ctx.admin, trazoRuta, await bajar(ctx.admin, mov.trazo_ruta), "image/png");
    await ctx.admin.from("conv_firma_moviles").update({ estado: "usado" }).eq("id", mov.id);
  } else {
    const c = (b.certificado && typeof b.certificado === "object" ? b.certificado : {}) as Record<string, unknown>;
    const mensaje = mensajeFirma(firma, fm);
    const r = await validarCertificadoFirmante({ cadenaPem: c.cadena_pem, firmaB64: c.firma_b64, algoritmo: c.algoritmo, mensaje });
    Object.assign(cert, {
      firma_b64: c.firma_b64,
      firma_algoritmo: c.algoritmo,
      firma_mensaje: mensaje,
      cert_cadena_pem: c.cadena_pem,
      cert_sujeto: r.sujeto,
      cert_emisor: r.emisor,
      cert_serie: r.serie,
      cert_desde: r.desde.toISOString(),
      cert_hasta: r.hasta.toISOString(),
      cert_cadena: r.cadena,
    });
  }

  const ahora = new Date().toISOString();
  const ganada = await ctx.admin
    .from("conv_firmantes")
    .update({
      estado: "firmado",
      metodo,
      trazo_ruta: trazoRuta,
      acepta_firma: true,
      ip: ctx.ip || null,
      agente: ctx.agente || null,
      pais: ctx.pais || null,
      zona_horaria: zonaHorariaValida(b.zona_horaria) || null,
      firmado_en: ahora,
      sesion_hash: null,
      sesion_vence: null,
      ...cert,
    })
    .eq("id", fm.id)
    .eq("estado", "verificado")
    .select("id");
  if (!ganada.data?.length) throw new ErrorFirma("ya_firmado", "Usted ya firmó este convenio.", 409);
  await eventoCtx(ctx, firma.id, fm.id, "firma_adoptada", { metodo });
  await eventoCtx(ctx, firma.id, fm.id, "firma_aplicada", { metodo, ...(metodo === "certificado" ? { serie: cert.cert_serie, cadena: cert.cert_cadena } : {}) });
  if (firma.estado === "enviada") await ctx.admin.from("conv_firmas").update({ estado: "en_firma" }).eq("id", firma.id).eq("estado", "enviada");
  await ctx.admin.rpc("conv_firma_avance", { p_firma: firma.id });

  const fms = await cargarFirmantes(ctx.admin, firma.id);
  const pendientes = fms.filter((x) => x.estado !== "firmado");
  let finalizado = false;
  let errorFinal: string | null = null;
  if (!pendientes.length) {
    await ctx.admin.from("conv_firmas").update({ finalizacion: "pendiente" }).eq("id", firma.id).is("finalizacion", null);
    const r = await finalizar(ctx.admin, firma.id);
    finalizado = r.ok;
    if (!r.ok && !r.omitido) errorFinal = r.error ?? "No se pudo terminar el documento.";
  } else if (firma.secuencial) {
    // Le toca al siguiente: se le envía su enlace y su código.
    const siguiente = pendientes.sort((a, c) => a.orden - c.orden)[0];
    if (!siguiente.enlace_enviado_en) {
      try {
        const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
        await enviarSolicitud(ctx, { ...firma, estado: "en_firma" }, siguiente, convenio, "enviado");
      } catch (e) {
        console.error("No se pudo avisar al siguiente firmante:", e instanceof Error ? e.message : e);
      }
    }
  }
  return {
    firmado: true,
    firmado_en: ahora,
    codigo_identidad: fm.codigo_identidad,
    codigo_verificacion: firma.codigo_verificacion,
    pendientes: pendientes.length,
    finalizado,
    // Si la finalización falló, la firma de esta persona ya quedó registrada y el cron reintenta el cierre.
    finalizacion_pendiente: !pendientes.length && !finalizado,
    ...(errorFinal ? { aviso: "Su firma quedó registrada. El documento final se está terminando y le llegará por correo." } : {}),
  };
}

/* ---------- verificar (página pública de validación) ---------------------------------------------------- */

export async function verificar(ctx: Ctx) {
  await limite(ctx, `ver:${IP(ctx)}`, 60, 60);
  const codigo = typeof ctx.body.codigo === "string" ? ctx.body.codigo.trim().toUpperCase() : "";
  if (!/^UDES-CV-\d{4}-\d{6}$/.test(codigo)) throw new ErrorFirma("codigo_formato", "El código de verificación no tiene el formato UDES-CV-AAAA-NNNNNN.", 400);
  const { data } = await ctx.admin.from("conv_firmas").select(COLUMNAS_FIRMA).eq("codigo_verificacion", codigo).maybeSingle();
  // Misma respuesta para «no existe» y «aún no está firmada»: no se confirma la existencia de solicitudes en curso.
  if (!data || (data as Firma).estado !== "firmada") return { encontrado: false, codigo };
  const firma = data as Firma;
  const h = typeof ctx.body.h === "string" ? ctx.body.h.trim().toLowerCase() : "";
  const huellaValida = /^[0-9a-f]{64}$/.test(h);
  const coincide = huellaValida ? iguales(h, firma.pdf_base_hash ?? "") || iguales(h, firma.pdf_firmado_hash ?? "") : null;
  const convenio = await cargarConvenio(ctx.admin, firma.convenio_id);
  const base = {
    encontrado: true,
    codigo,
    estado: firma.estado,
    firmada_en: firma.firmada_en,
    huella_coincide: coincide,
    documento: { nombre: firma.nombre_documento, institucion: convenio.institucion, convenio: convenio.codigo.toUpperCase() },
  };
  if (!coincide) {
    // Sin la huella del documento no se muestran datos de las personas (la huella viaja en el QR del documento).
    return { ...base, firmantes_total: (await cargarFirmantes(ctx.admin, firma.id)).length };
  }
  const fms = await cargarFirmantes(ctx.admin, firma.id);
  const clave = typeof ctx.body.f === "string" ? ctx.body.f.trim().toUpperCase() : "";
  const sellado = firma.sellado as { sujeto?: string; emisor?: string; serie?: string; hora_utc?: string; tsa?: string | null };
  return {
    ...base,
    huella_documento: firma.pdf_base_hash,
    huella_pdf_firmado: firma.pdf_firmado_hash,
    sello: { sujeto: sellado.sujeto ?? null, emisor: sellado.emisor ?? null, serie: sellado.serie ?? null, hora_utc: sellado.hora_utc ?? null, sello_de_tiempo: sellado.tsa ?? null },
    firmantes: fms.map((f) => ({
      orden: f.orden,
      rol: f.rol,
      rol_texto: f.rol_texto,
      nombre: f.nombre,
      correo_enmascarado: correoEnmascarado(f.correo),
      codigo_identidad: f.codigo_identidad,
      metodo: f.metodo,
      firmado_en: f.firmado_en,
      pais: f.pais,
      cert: f.metodo === "certificado" ? { sujeto: f.cert_sujeto, emisor: f.cert_emisor, serie: f.cert_serie, cadena: f.cert_cadena } : null,
      es_el_consultado: clave !== "" && clave === f.codigo_identidad,
    })),
  };
}
