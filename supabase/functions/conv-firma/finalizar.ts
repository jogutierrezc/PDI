/* =============================================================================
   conv-firma · finalizar: cuando firma el último firmante.
     1. Verifica que el PDF base no cambió (huella) y arma el PDF final con los bloques de firma.
     2. Lo sella con el certificado de la UDES (firma digital de certificación, sello de tiempo si hay TSA).
     3. Emite el certificado de trazabilidad (otro PDF, también sellado).
     4. Guarda en el bucket y, si se puede, en la carpeta UDrive del convenio.
     5. Cierra la ruta de firma del convenio y envía el correo firma_certificado a TODAS las partes.
   Es seguro llamarla dos veces: un cerrojo en conv_firmas (finalizacion) evita que corran dos a la vez, y si falla
   queda en «error» para que el cron o la oficina la reintenten.
   ========================================================================== */

import { anexarPaginas, contarPaginas, htmlAPdf } from "./pdf.ts";
import { sellarPdf } from "./pdf.ts";
import { cargarCertificadoUdes, exigirCertificadoVigente } from "./sello.ts";
import { bloqueFirmaHtml, certificadoHtml, inyectarBloques, paginaFirmasHtml, pieHtml, prepararHtmlGenerado } from "./documentos.ts";
import type { FirmanteDoc } from "./documentos.ts";
import { configCorreo, enviarPlantilla, motivoCorreo } from "./correo.ts";
import type { Adjunto } from "./correo.ts";
import { fechaLegible } from "./plantilla.ts";
import type { Idioma } from "./plantilla.ts";
import { aBase64, ErrorFirma, fechaBogota, nombreSeguro, sha256Hex } from "./util.ts";
import type { Cliente } from "./util.ts";
import { bajar, cargarConvenio, cargarFirma, cargarFirmantes, evento, subir } from "./comun.ts";
import type { Firma } from "./comun.ts";

export interface ResultadoFinal {
  ok: boolean;
  omitido?: string;
  error?: string;
}

const CINCO_MIN = 5 * 60 * 1000;

export async function finalizar(admin: Cliente, firmaId: string): Promise<ResultadoFinal> {
  // Cerrojo: una sola finalización a la vez.
  const previa = await admin.from("conv_firmas").select("finalizacion, finalizacion_inicio, finalizacion_intentos, estado").eq("id", firmaId).maybeSingle();
  const p = previa.data as { finalizacion: string | null; finalizacion_inicio: string | null; finalizacion_intentos: number; estado: string } | null;
  if (!p) return { ok: false, error: "No existe la solicitud." };
  if (p.estado === "firmada") return { ok: true, omitido: "Ya estaba finalizada." };
  if (!["enviada", "en_firma"].includes(p.estado)) return { ok: false, omitido: `La solicitud está ${p.estado}.` };
  const enCurso = p.finalizacion === "en_proceso" && p.finalizacion_inicio && Date.now() - new Date(p.finalizacion_inicio).getTime() < CINCO_MIN;
  if (enCurso) return { ok: false, omitido: "Ya se está finalizando." };
  const tomada = await admin
    .from("conv_firmas")
    .update({ finalizacion: "en_proceso", finalizacion_inicio: new Date().toISOString(), finalizacion_intentos: p.finalizacion_intentos + 1, finalizacion_error: null })
    .eq("id", firmaId)
    .eq("finalizacion_intentos", p.finalizacion_intentos)
    .in("estado", ["enviada", "en_firma"])
    .select("id");
  if (!tomada.data?.length) return { ok: false, omitido: "Otra ejecución tomó la finalización." };

  try {
    await ejecutar(admin, firmaId);
    return { ok: true };
  } catch (e) {
    const mensaje = e instanceof ErrorFirma ? e.message : "Falló la finalización.";
    console.error("Finalización fallida", firmaId, e);
    await admin.from("conv_firmas").update({ finalizacion: "error", finalizacion_error: mensaje.slice(0, 500) }).eq("id", firmaId);
    await evento({ admin }, firmaId, null, "finalizacion_error", { motivo: mensaje.slice(0, 300) });
    return { ok: false, error: mensaje };
  }
}

async function ejecutar(admin: Cliente, firmaId: string): Promise<void> {
  const firma = await cargarFirma(admin, firmaId);
  const idioma = firma.idioma;
  const firmantes = await cargarFirmantes(admin, firmaId);
  if (!firmantes.length || firmantes.some((f) => f.estado !== "firmado")) throw new ErrorFirma("faltan_firmas", "Todavía faltan firmas.", 409);
  const certUdes = cargarCertificadoUdes();
  exigirCertificadoVigente(certUdes);
  const convenio = await cargarConvenio(admin, firma.convenio_id);
  const { data: generado } = await admin.from("conv_generados").select("ruta, formato, hash_sha256").eq("id", firma.generado_id).maybeSingle();
  if (!generado || !firma.pdf_base_ruta || !firma.pdf_base_hash) throw new ErrorFirma("faltan_datos", "Faltan datos de la solicitud.", 500);

  // 1. Integridad del PDF que firmaron las partes.
  const base = await bajar(admin, firma.pdf_base_ruta);
  if ((await sha256Hex(base)) !== firma.pdf_base_hash) throw new ErrorFirma("documento_alterado", "El PDF guardado no coincide con la huella que firmaron las partes.", 409);

  // 2. Bloques de firma.
  const huella = firma.pdf_base_hash;
  const docs: (FirmanteDoc & { id: string })[] = [];
  for (const f of firmantes) {
    const trazo = f.metodo === "certificado" || !f.trazo_ruta ? undefined : `data:image/png;base64,${aBase64(await bajar(admin, f.trazo_ruta))}`;
    docs.push({
      id: f.id,
      orden: f.orden,
      rol: f.rol,
      rolTexto: f.rol_texto,
      parte: f.rol === "UDES" ? "Universidad de Santander" : f.rol === "contraparte" ? convenio.institucion : f.rol_texto || f.nombre,
      nombre: f.nombre,
      correo: f.correo,
      codigoIdentidad: f.codigo_identidad,
      metodo: f.metodo ?? "dibujo",
      firmadoEn: f.firmado_en as string,
      certSujeto: f.cert_sujeto,
      certEmisor: f.cert_emisor,
      certSerie: f.cert_serie,
      certDesde: f.cert_desde,
      certHasta: f.cert_hasta,
      certCadena: f.cert_cadena,
      ip: f.ip,
      pais: f.pais,
      agente: f.agente,
      trazo,
    });
  }
  const bloques = new Map(docs.map((d) => [d.orden, bloqueFirmaHtml(d, { codigo: firma.codigo_verificacion, huella, idioma })]));

  // 3. PDF final: HTML con las cajas del modelo reemplazadas; si no hay cajas (o es un Word), página de firmas al final.
  let final: Uint8Array;
  const pie = pieHtml(firma.codigo_verificacion, idioma);
  let usados = new Set<number>();
  let htmlFinal: string | null = null;
  if (generado.formato === "html") {
    const bytesHtml = await bajar(admin, generado.ruta, "conv-modelos");
    if ((await sha256Hex(bytesHtml)) !== generado.hash_sha256) throw new ErrorFirma("documento_alterado", "El documento generado no coincide con su huella.", 409);
    const r = inyectarBloques(prepararHtmlGenerado(new TextDecoder().decode(bytesHtml)), bloques);
    usados = r.usados;
    htmlFinal = r.html;
  }
  if (htmlFinal && usados.size > 0) {
    final = await htmlAPdf(htmlFinal, { pie });
  } else {
    final = base;
  }
  const faltantes = docs.filter((d) => !usados.has(d.orden));
  if (faltantes.length) {
    const pagina = paginaFirmasHtml({
      idioma,
      titulo: firma.nombre_documento,
      codigo: firma.codigo_verificacion,
      bloques: faltantes.map((d) => bloques.get(d.orden) as string),
    });
    final = await anexarPaginas(final, await htmlAPdf(pagina, { pie, tamanoCss: true }));
  }
  await evento({ admin }, firmaId, null, "pdf_generado", { fase: "final", paginas: await contarPaginas(final), firmas_en_cajas: usados.size, firmas_en_pagina: faltantes.length });

  // 4. Sello digital del PDF final.
  const sello1 = await sellarPdf(final, certUdes, {
    titulo: firma.nombre_documento,
    autor: "Universidad de Santander",
    asunto: `${convenio.codigo.toUpperCase()} · ${convenio.institucion}`,
    razon: idioma === "es" ? "Convenio firmado electrónicamente por las partes" : "Agreement electronically signed by the parties",
    ubicacion: "Bucaramanga, Colombia",
    contacto: "relaciones.internacionales@udes.edu.co",
  });
  const huellaFinal = await sha256Hex(sello1.pdf);
  await evento({ admin }, firmaId, null, "pdf_sellado", { huella: huellaFinal, tsa: sello1.tsa, tsa_error: sello1.tsaError, certificado: certUdes.serie });

  // 5. Certificado de trazabilidad.
  await evento({ admin }, firmaId, null, "certificado_emitido", { idioma });
  const { data: evs } = await admin.from("conv_firma_eventos").select("ocurrio_en, tipo, firmante_id, hash").eq("firma_id", firmaId).order("id");
  const eventos = (evs ?? []) as { ocurrio_en: string; tipo: string; firmante_id: string | null; hash: string }[];
  const emitido = new Date();
  const htmlCert = certificadoHtml({
    idioma,
    codigo: firma.codigo_verificacion,
    emitido,
    nombreDocumento: firma.nombre_documento,
    convenio: convenio.codigo.toUpperCase(),
    institucion: convenio.institucion,
    paginas: firma.pdf_paginas ?? 0,
    huellaDocumento: huella,
    huellaFinal,
    huellaRegistro: eventos[eventos.length - 1]?.hash ?? "",
    integridadOk: true,
    firmantes: docs,
    eventos,
    sello: {
      modo: "real",
      prueba: certUdes.autofirmado,
      sujeto: certUdes.sujeto,
      emisor: certUdes.emisor,
      serie: certUdes.serie,
      desde: certUdes.desde,
      hasta: certUdes.hasta,
      horaUtc: sello1.horaUtc,
      tsa: sello1.tsa,
      tsaError: sello1.tsaError,
    },
  });
  const certPdf = await htmlAPdf(htmlCert, { pie: pieHtml(firma.codigo_verificacion, idioma), tamanoCss: true });
  const sello2 = await sellarPdf(certPdf, certUdes, {
    titulo: idioma === "es" ? `Certificado de trazabilidad ${firma.codigo_verificacion}` : `Traceability certificate ${firma.codigo_verificacion}`,
    autor: "Universidad de Santander",
    asunto: firma.nombre_documento,
    razon: idioma === "es" ? "Certificado de trazabilidad de la firma electrónica" : "Electronic signature traceability certificate",
    ubicacion: "Bucaramanga, Colombia",
    contacto: "relaciones.internacionales@udes.edu.co",
  });
  const huellaCert = await sha256Hex(sello2.pdf);

  // 6. Guardar.
  const rutaFirmado = `firmas/${firmaId}/firmado.pdf`;
  const rutaCert = `firmas/${firmaId}/certificado.pdf`;
  await subir(admin, rutaFirmado, sello1.pdf, "application/pdf");
  await subir(admin, rutaCert, sello2.pdf, "application/pdf");
  const ahora = new Date().toISOString();
  const { error: errUpd } = await admin
    .from("conv_firmas")
    .update({
      estado: "firmada",
      firmada_en: ahora,
      pdf_firmado_ruta: rutaFirmado,
      pdf_firmado_hash: huellaFinal,
      pdf_firmado_tamano: sello1.pdf.length,
      certificado_ruta: rutaCert,
      certificado_hash: huellaCert,
      sellado: {
        origen: certUdes.origen,
        sujeto: certUdes.sujeto,
        emisor: certUdes.emisor,
        serie: certUdes.serie,
        desde: certUdes.desde,
        hasta: certUdes.hasta,
        autofirmado: certUdes.autofirmado,
        hora_utc: sello1.horaUtc,
        tsa: sello1.tsa,
        tsa_error: sello1.tsaError,
      },
      finalizacion: "lista",
      finalizacion_error: null,
    })
    .eq("id", firmaId);
  if (errUpd) throw new ErrorFirma("base_de_datos", "No se pudo guardar el resultado de la firma.", 500);

  // 7. UDrive (mejor esfuerzo) y ruta de firma del convenio.
  const archivado = await archivarEnUdrive(admin, firma, convenio.codigo, sello1.pdf, sello2.pdf, idioma);
  const { error: errConv } = await admin.rpc("conv_firma_cerrar_convenio", { p_firma: firmaId, p_archivado: archivado });
  if (errConv) console.error("No se pudo cerrar el convenio", errConv.message);

  // 8. Correos a todas las partes.
  await enviarCopias(admin, firma, firmantes, convenio, sello1.pdf, sello2.pdf);
}

async function archivarEnUdrive(admin: Cliente, firma: Firma, codigoConvenio: string, firmado: Uint8Array, cert: Uint8Array, idioma: Idioma): Promise<boolean> {
  try {
    const { data } = await admin.rpc("conv_firma_udrive_destino", { p_firma: firma.id });
    const destino = (Array.isArray(data) ? data[0] : data) as { creada_por: string; carpeta_id: string } | undefined;
    if (!destino?.creada_por) {
      await evento({ admin }, firma.id, null, "udrive_fallo", { motivo: "El convenio no tiene carpeta en UDrive." });
      return false;
    }
    const archivos: { clave: string; nombre: string; bytes: Uint8Array }[] = [
      { clave: "firmado", nombre: `${idioma === "es" ? "Convenio firmado" : "Signed agreement"} ${codigoConvenio.toUpperCase()} ${firma.codigo_verificacion}.pdf`, bytes: firmado },
      { clave: "certificado", nombre: `${idioma === "es" ? "Certificado de trazabilidad" : "Traceability certificate"} ${firma.codigo_verificacion}.pdf`, bytes: cert },
    ];
    const ids: Record<string, string> = {};
    for (const a of archivos) {
      const id = crypto.randomUUID();
      const ruta = `${destino.creada_por}/${id}/${nombreSeguro(a.nombre.replace(/\.pdf$/, ""))}.pdf`;
      await subir(admin, ruta, a.bytes, "application/pdf", "udrive");
      const r = await admin.rpc("conv_firma_udrive_registrar", { p_firma: firma.id, p_id: id, p_nombre: a.nombre, p_ruta: ruta, p_tamano: a.bytes.length });
      if (r.error) {
        await admin.storage.from("udrive").remove([ruta]);
        throw new Error(r.error.message);
      }
      ids[a.clave] = id;
    }
    await admin.from("conv_firmas").update({ udrive: ids }).eq("id", firma.id);
    await evento({ admin }, firma.id, null, "udrive_archivado", ids);
    return true;
  } catch (e) {
    const motivo = e instanceof Error ? e.message.slice(0, 300) : "desconocido";
    await admin.from("conv_firmas").update({ udrive: { error: motivo } }).eq("id", firma.id);
    await evento({ admin }, firma.id, null, "udrive_fallo", { motivo });
    return false;
  }
}

async function enviarCopias(
  admin: Cliente,
  firma: Firma,
  firmantes: { id: string; nombre: string; correo: string; idioma: Idioma }[],
  convenio: { codigo: string; institucion: string },
  firmado: Uint8Array,
  cert: Uint8Array,
): Promise<void> {
  const cfg = await configCorreo(admin);
  let enviados = 0;
  const fallos: string[] = [];
  for (const f of firmantes) {
    const en = f.idioma === "en";
    const adjuntos: Adjunto[] = [
      { nombre: `${en ? "Signed_agreement" : "Convenio_firmado"}_${nombreSeguro(convenio.codigo)}.pdf`, contenido: firmado, tipo: "application/pdf" },
      { nombre: `${en ? "Traceability_certificate" : "Certificado_de_trazabilidad"}_${firma.codigo_verificacion}.pdf`, contenido: cert, tipo: "application/pdf" },
    ];
    try {
      await enviarPlantilla(admin, cfg, {
        clave: "firma_certificado",
        idioma: f.idioma,
        para: f.correo,
        adjuntos,
        variables: {
          nombre_firmante: f.nombre,
          institucion: convenio.institucion,
          codigo_certificado: firma.codigo_verificacion,
          vence: fechaLegible(fechaBogota(new Date(firma.vence_en)), f.idioma),
          enlace_firma: "",
          codigo_verificacion: "",
        },
      });
      enviados++;
    } catch (e) {
      fallos.push(`${f.nombre}: ${motivoCorreo(e)}`);
    }
  }
  await evento({ admin }, firma.id, null, "correos_enviados", { enviados, fallidos: fallos.length, ...(fallos.length ? { detalle_fallos: fallos.slice(0, 5) } : {}), correo_modo: cfg.modo });
}
