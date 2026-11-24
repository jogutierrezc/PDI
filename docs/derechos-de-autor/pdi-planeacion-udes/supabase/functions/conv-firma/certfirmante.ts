/* =============================================================================
   conv-firma · verificar el certificado propio del firmante (método «certificado»).

   El navegador firma con la clave privada del firmante (el .p12 y la clave NUNCA llegan al servidor) el mensaje
   que le entrega la función (ver CONTRATO.md: «mensaje_firma») y manda la firma + la cadena de certificados en PEM.
   Aquí se comprueba que: (1) la firma corresponde al mensaje y a la clave pública del certificado, (2) el
   certificado está vigente, no es de una CA y sirve para firmar, (3) cada certificado de la cadena está firmado
   por el siguiente. NO se consulta revocación (CRL/OCSP) ni se valida contra ONAC: la cadena queda como
   «no verificada contra una entidad acreditada», salvo que sea una de las raíces de CONV_FIRMA_RAICES_PEM
   (punto de extensión: lista de confianza, uno o varios certificados raíz en PEM).
   ========================================================================== */

import * as x509 from "npm:@peculiar/x509@1.14.3";
import { ENV, ErrorFirma } from "./util.ts";

export interface ResultadoCert {
  sujeto: string;
  emisor: string;
  serie: string;
  desde: Date;
  hasta: Date;
  cadena: "lista_confianza" | "no_verificada_acreditada";
}

const MAX_PEM = 60_000;

function bloquesPem(pem: string): string[] {
  return pem.match(/-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----/g) ?? [];
}

const iguales = (a: ArrayBuffer, b: ArrayBuffer) => {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

export const ALGORITMOS = ["RSASSA-PKCS1-v1_5-SHA256", "ECDSA-P256-SHA256"] as const;

export async function validarCertificadoFirmante(p: { cadenaPem: unknown; firmaB64: unknown; algoritmo: unknown; mensaje: string }): Promise<ResultadoCert> {
  const malo = (m: string) => new ErrorFirma("certificado_invalido", m, 422);
  if (typeof p.cadenaPem !== "string" || p.cadenaPem.length > MAX_PEM) throw malo("La cadena de certificados no es válida.");
  if (typeof p.firmaB64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(p.firmaB64) || p.firmaB64.length > 2000) throw malo("La firma del certificado no es válida.");
  if (typeof p.algoritmo !== "string" || !(ALGORITMOS as readonly string[]).includes(p.algoritmo)) throw malo("El algoritmo de firma no es compatible.");
  const pems = bloquesPem(p.cadenaPem);
  if (pems.length < 1 || pems.length > 5) throw malo("La cadena debe traer entre 1 y 5 certificados en PEM.");
  let certs: x509.X509Certificate[];
  try {
    certs = pems.map((b) => new x509.X509Certificate(b));
  } catch {
    throw malo("No se pudo leer un certificado de la cadena.");
  }
  const hoja = certs[0];
  const ahora = new Date();
  for (const c of certs) {
    if (c.notBefore > ahora || c.notAfter < ahora) throw malo("Un certificado de la cadena no está vigente.");
  }
  const bc = hoja.getExtension(x509.BasicConstraintsExtension);
  if (bc?.ca) throw malo("El primer certificado de la cadena debe ser el del firmante, no el de una autoridad.");
  const ku = hoja.getExtension(x509.KeyUsagesExtension);
  if (ku && !(ku.usages & (x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation))) {
    throw malo("El certificado no está habilitado para firmar.");
  }
  // Cada certificado debe estar firmado por el siguiente.
  for (let i = 0; i < certs.length - 1; i++) {
    const ok = certs[i].issuer === certs[i + 1].subject && (await certs[i].verify({ publicKey: certs[i + 1].publicKey, signatureOnly: true }));
    if (!ok) throw malo("La cadena de certificados no está bien encadenada.");
  }
  // Firma sobre el mensaje.
  const firma = Uint8Array.from(atob(p.firmaB64), (c) => c.charCodeAt(0));
  const spki = hoja.publicKey.rawData;
  const ecdsa = p.algoritmo === "ECDSA-P256-SHA256";
  let valida = false;
  try {
    if (ecdsa) {
      const k = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      valida = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, firma, new TextEncoder().encode(p.mensaje));
    } else {
      const alg = hoja.publicKey.algorithm as { modulusLength?: number };
      if ((alg.modulusLength ?? 0) < 2048) throw malo("La clave RSA del certificado debe ser de 2048 bits o más.");
      const k = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      valida = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, firma, new TextEncoder().encode(p.mensaje));
    }
  } catch (e) {
    if (e instanceof ErrorFirma) throw e;
    throw malo("El algoritmo no corresponde a la clave del certificado.");
  }
  if (!valida) throw new ErrorFirma("firma_no_coincide", "La firma no corresponde al documento y al certificado presentados.", 422);

  // Lista de confianza opcional.
  let cadena: ResultadoCert["cadena"] = "no_verificada_acreditada";
  const raices = bloquesPem(ENV("CONV_FIRMA_RAICES_PEM"));
  if (raices.length) {
    const cima = certs[certs.length - 1];
    for (const r of raices) {
      try {
        const raiz = new x509.X509Certificate(r);
        if (iguales(raiz.rawData, cima.rawData) || (cima.issuer === raiz.subject && (await cima.verify({ publicKey: raiz.publicKey, signatureOnly: true })))) {
          cadena = "lista_confianza";
          break;
        }
      } catch {
        // raíz ilegible: se ignora
      }
    }
  }
  return { sujeto: hoja.subject, emisor: hoja.issuer, serie: hoja.serialNumber.toUpperCase(), desde: hoja.notBefore, hasta: hoja.notAfter, cadena };
}
