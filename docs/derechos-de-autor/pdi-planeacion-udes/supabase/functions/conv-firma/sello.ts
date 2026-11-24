/* =============================================================================
   conv-firma · certificado de la UDES para sellar los PDF.

   Origen del certificado (se elige solo por las variables de entorno; no hay que tocar código):
     · PKCS#12 en el secreto CONV_FIRMA_P12 (base64) con su clave en CONV_FIRMA_P12_CLAVE.
       Para pasar del certificado provisional al definitivo basta con REEMPLAZAR esos dos secretos y reiniciar.
     · PUNTO DE EXTENSIÓN, servicio de firma del emisor (HSM o nube, cuando el certificado no se puede exportar):
       CONV_FIRMA_SERVICIO_URL (+ CONV_FIRMA_SERVICIO_TOKEN opcional). El sellado le envía por POST los bytes
       que se deben firmar (application/octet-stream) y espera como respuesta la firma CMS/PKCS#7 desprendida
       en DER (application/pkcs7-signature). Descripción del certificado: CONV_FIRMA_SERVICIO_SUJETO,
       _EMISOR, _SERIE, _DESDE, _HASTA. Si está definida, tiene prioridad sobre el PKCS#12.
     · Sello de tiempo RFC 3161 opcional: CONV_TSA_URL.
   ========================================================================== */

import { Buffer } from "node:buffer";
// @deno-types="npm:@types/node-forge@1.3.11"
import forge from "npm:node-forge@1.3.3";
import { P12Signer } from "npm:@signpdf/signer-p12@3.3.0";
import * as utilsNs from "npm:@signpdf/utils@3.3.0";
import { deBase64, ENV, ErrorFirma } from "./util.ts";

export interface InfoCertificadoUdes {
  origen: "p12" | "servicio";
  p12: Uint8Array;
  clave: string;
  servicioUrl: string;
  servicioToken: string;
  tsaUrl: string | null;
  sujeto: string;
  emisor: string;
  serie: string;
  desde: string;
  hasta: string;
  autofirmado: boolean;
  vigente: boolean;
}

const nombreDe = (attrs: { shortName?: string; name?: string; value: unknown }[]): string =>
  attrs.map((a) => `${a.shortName ?? a.name ?? "?"}=${String(a.value)}`).join(", ");

let cache: { clave: string; info: InfoCertificadoUdes } | null = null;

/** Lee el certificado configurado. Lanza `sin_certificado` si no hay ninguno y `certificado_vencido` si ya caducó. */
export function cargarCertificadoUdes(): InfoCertificadoUdes {
  const tsa = ENV("CONV_TSA_URL").trim() || null;
  const servicio = ENV("CONV_FIRMA_SERVICIO_URL").trim();
  if (servicio) {
    const hasta = ENV("CONV_FIRMA_SERVICIO_HASTA");
    return {
      origen: "servicio",
      p12: new Uint8Array(),
      clave: "",
      servicioUrl: servicio,
      servicioToken: ENV("CONV_FIRMA_SERVICIO_TOKEN"),
      tsaUrl: tsa,
      sujeto: ENV("CONV_FIRMA_SERVICIO_SUJETO") || "Servicio de firma del emisor",
      emisor: ENV("CONV_FIRMA_SERVICIO_EMISOR"),
      serie: ENV("CONV_FIRMA_SERVICIO_SERIE"),
      desde: ENV("CONV_FIRMA_SERVICIO_DESDE"),
      hasta,
      autofirmado: false,
      vigente: !hasta || new Date(hasta).getTime() > Date.now(),
    };
  }
  const b64 = ENV("CONV_FIRMA_P12").replace(/\s+/g, "");
  if (!b64) throw new ErrorFirma("sin_certificado", "Falta el certificado de firma de la UDES (CONV_FIRMA_P12). Pida a quien administra el servidor que lo cargue.", 503);
  const clave = ENV("CONV_FIRMA_P12_CLAVE");
  if (cache && cache.clave === b64 + "|" + clave) return { ...cache.info, tsaUrl: tsa };
  let p12: Uint8Array;
  try {
    p12 = deBase64(b64);
  } catch {
    throw new ErrorFirma("certificado_ilegible", "El certificado de firma de la UDES no está en base64 válido.", 503);
  }
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(p12).toString("binary")));
    const bolsa = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
    const llaves = bolsa.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
    const certs = bolsa.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    // deno-lint-ignore no-explicit-any
    const llave = llaves[0]?.key as any;
    // deno-lint-ignore no-explicit-any
    const hoja = certs.map((c) => c.cert as any).find((c) => c && llave && c.publicKey.n.compareTo(llave.n) === 0);
    if (!hoja) throw new Error("sin hoja");
    const info: InfoCertificadoUdes = {
      origen: "p12",
      p12,
      clave,
      servicioUrl: "",
      servicioToken: "",
      tsaUrl: tsa,
      sujeto: nombreDe(hoja.subject.attributes),
      emisor: nombreDe(hoja.issuer.attributes),
      serie: String(hoja.serialNumber).toUpperCase(),
      desde: new Date(hoja.validity.notBefore).toISOString(),
      hasta: new Date(hoja.validity.notAfter).toISOString(),
      autofirmado: hoja.subject.hash === hoja.issuer.hash,
      vigente: new Date(hoja.validity.notBefore).getTime() <= Date.now() && new Date(hoja.validity.notAfter).getTime() > Date.now(),
    };
    cache = { clave: b64 + "|" + clave, info };
    return info;
  } catch {
    throw new ErrorFirma(
      "certificado_ilegible",
      "No se pudo leer el certificado de firma de la UDES. Revise la clave (CONV_FIRMA_P12_CLAVE) y que el archivo .p12 use cifrado compatible (ver README).",
      503,
    );
  }
}

export function exigirCertificadoVigente(info: InfoCertificadoUdes): void {
  if (!info.vigente) throw new ErrorFirma("certificado_vencido", "El certificado de firma de la UDES está vencido o aún no es válido.", 503);
}

/* ---------- Firmante CMS ------------------------------------------------------------------------------ */

// deno-lint-ignore no-explicit-any
const SignerBase = ((utilsNs as any).Signer ?? (utilsNs as any).default?.Signer) as new () => { sign(pdf: Buffer, t?: Date): Promise<Buffer> };

export interface FirmanteCms {
  sign(pdf: Buffer, t?: Date): Promise<Buffer>;
  tsaUsado: string | null;
  tsaError: string | null;
}

class SelloP12 extends P12Signer implements FirmanteCms {
  tsaUsado: string | null = null;
  tsaError: string | null = null;
  constructor(p12: Uint8Array, clave: string, private tsaUrl: string | null) {
    super(Buffer.from(p12), { passphrase: clave });
  }
  override async sign(pdf: Buffer, t?: Date): Promise<Buffer> {
    const cms = await super.sign(pdf, t);
    return await conSelloDeTiempo(this, cms, this.tsaUrl);
  }
}

class SelloServicio extends SignerBase implements FirmanteCms {
  tsaUsado: string | null = null;
  tsaError: string | null = null;
  constructor(private url: string, private token: string, private tsaUrl: string | null) {
    super();
  }
  override async sign(pdf: Buffer): Promise<Buffer> {
    let r: Response;
    try {
      r = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: new Uint8Array(pdf),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ErrorFirma("sello_servicio", "No se pudo conectar con el servicio de firma del emisor.", 503);
    }
    if (!r.ok) throw new ErrorFirma("sello_servicio", `El servicio de firma del emisor rechazó la solicitud (código ${r.status}).`, 502);
    return await conSelloDeTiempo(this, Buffer.from(await r.arrayBuffer()), this.tsaUrl);
  }
}

export function crearFirmanteCms(info: InfoCertificadoUdes): FirmanteCms {
  return info.origen === "servicio" ? new SelloServicio(info.servicioUrl, info.servicioToken, info.tsaUrl) : new SelloP12(info.p12, info.clave, info.tsaUrl);
}

/* ---------- Sello de tiempo RFC 3161 ----------------------------------------------------------------- */

async function conSelloDeTiempo(estado: FirmanteCms, cms: Buffer, tsaUrl: string | null): Promise<Buffer> {
  if (!tsaUrl) return cms;
  try {
    const salida = await agregarSelloDeTiempo(cms, tsaUrl);
    estado.tsaUsado = new URL(tsaUrl).host;
    return salida;
  } catch (e) {
    estado.tsaError = e instanceof Error ? e.message : "fallo";
    console.error("Sello de tiempo no obtenido:", estado.tsaError);
    return cms;
  }
}

/**
 * Pide a la autoridad un sello RFC 3161 sobre la firma del CMS y lo agrega como atributo no firmado
 * (id-aa-timeStampToken, 1.2.840.113549.1.9.16.2.14). La firma del PDF sigue siendo válida.
 */
async function agregarSelloDeTiempo(cms: Buffer, tsaUrl: string): Promise<Buffer> {
  const asn1 = forge.asn1;
  const raiz = asn1.fromDer(forge.util.createBuffer(cms.toString("binary")));
  // deno-lint-ignore no-explicit-any
  const signedData = (raiz.value as any)[1].value[0];
  const infos = signedData.value[signedData.value.length - 1];
  const si = infos.value[0];
  const firma = si.value[si.value.length - 1];
  const md = forge.md.sha256.create();
  md.update(firma.value as string);
  const huella = md.digest().getBytes();
  const nonce = forge.random.getBytesSync(8);
  const nonceBytes = String.fromCharCode(nonce.charCodeAt(0) & 0x7f) + nonce.slice(1);
  const U = asn1.Class.UNIVERSAL;
  const T = asn1.Type;
  const peticion = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(U, T.SEQUENCE, true, [
      asn1.create(U, T.SEQUENCE, true, [asn1.create(U, T.OID, false, asn1.oidToDer("2.16.840.1.101.3.4.2.1").getBytes()), asn1.create(U, T.NULL, false, "")]),
      asn1.create(U, T.OCTETSTRING, false, huella),
    ]),
    asn1.create(U, T.INTEGER, false, nonceBytes),
    asn1.create(U, T.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);
  const cuerpo = Buffer.from(asn1.toDer(peticion).getBytes(), "binary");
  const r = await fetch(tsaUrl, { method: "POST", headers: { "Content-Type": "application/timestamp-query", Accept: "application/timestamp-reply" }, body: cuerpo, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`La autoridad de sello de tiempo respondió ${r.status}.`);
  const respuesta = Buffer.from(await r.arrayBuffer());
  const resp = asn1.fromDer(forge.util.createBuffer(respuesta.toString("binary")));
  // deno-lint-ignore no-explicit-any
  const estadoResp = (resp.value as any)[0].value[0].value.charCodeAt(0);
  // deno-lint-ignore no-explicit-any
  const token = (resp.value as any)[1];
  if ((estadoResp !== 0 && estadoResp !== 1) || !token) throw new Error("La autoridad de sello de tiempo no concedió el sello.");
  // Comprobación mínima: la huella pedida debe aparecer en el sello devuelto.
  if (!asn1.toDer(token).getBytes().includes(huella)) throw new Error("El sello de tiempo devuelto no corresponde a la firma.");
  const atributo = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.OID, false, asn1.oidToDer("1.2.840.113549.1.9.16.2.14").getBytes()),
    asn1.create(U, T.SET, true, [token]),
  ]);
  si.value.push(asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [atributo]));
  return Buffer.from(asn1.toDer(raiz).getBytes(), "binary");
}
