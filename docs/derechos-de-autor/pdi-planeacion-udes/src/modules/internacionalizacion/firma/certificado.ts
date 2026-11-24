/* =============================================================================
   Firma de convenios · firma con el certificado digital del propio firmante.

   El archivo .p12/.pfx y su clave NUNCA salen del navegador. Se lee con node-forge (que solo se
   descarga al abrir esta pestaña, por import dinámico), se firma con WebCrypto el mensaje que
   entregó el servidor (`mensaje_firma`, bytes UTF-8) y se descarta la clave de memoria. Al
   servidor solo viajan la firma (base64) y la cadena PÚBLICA de certificados en PEM.

   Limitación: node-forge lee claves RSA; los certificados con clave de curva elíptica no se
   pueden abrir en el navegador y se dice con claridad. El servidor acepta RSA (≥ 2048 bits).
   ========================================================================== */

export interface InfoCertificado {
  sujeto: string;
  emisor: string;
  desde: Date;
  hasta: Date;
  vigente: boolean;
  bits: number;
}

export interface FirmaCertificado {
  firma_b64: string;
  algoritmo: "RSASSA-PKCS1-v1_5-SHA256";
  cadena_pem: string;
}

export interface CertificadoAbierto {
  info: InfoCertificado;
  /** Firma el mensaje y deja la clave sin usar. */
  firmar: (mensaje: string) => Promise<FirmaCertificado>;
  /** Borra la clave de la memoria. */
  descartar: () => void;
}

export type CausaP12 = "clave" | "formato" | "sin_clave" | "no_rsa" | "debil" | "vencido";

export class ErrorP12 extends Error {
  causa: CausaP12;
  constructor(causa: CausaP12) {
    super(causa);
    this.causa = causa;
  }
}

type Forge = typeof import("node-forge");

const aBase64 = (b: ArrayBuffer) => {
  const u = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

function nombre(forge: Forge, attrs: { shortName?: string; value?: unknown }[]) {
  const orden = ["CN", "O", "OU", "C"];
  const partes = attrs.filter((a) => a.shortName && orden.includes(a.shortName)).sort((a, b) => orden.indexOf(a.shortName!) - orden.indexOf(b.shortName!));
  void forge;
  return partes.map((a) => `${a.shortName}=${String(a.value)}`).join(", ") || "—";
}

export async function abrirP12(archivo: ArrayBuffer, clave: string): Promise<CertificadoAbierto> {
  const mod = await import("node-forge");
  const forge: Forge = (mod as unknown as { default?: Forge }).default ?? mod;
  let p12;
  try {
    const bin = Array.from(new Uint8Array(archivo), (b) => String.fromCharCode(b)).join("");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bin));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    throw new ErrorP12(/password|MAC|decrypt/i.test(m) ? "clave" : "formato");
  }
  const bolsasClave = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  if (!bolsasClave.length) throw new ErrorP12("sin_clave");
  const llave = bolsasClave[0].key as import("node-forge").pki.rsa.PrivateKey | undefined;
  if (!llave || !("n" in llave)) throw new ErrorP12("no_rsa");
  const bits = llave.n.bitLength();
  if (bits < 2048) throw new ErrorP12("debil");

  const todos = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter((c): c is import("node-forge").pki.Certificate => Boolean(c));
  const hoja = todos.find((c) => (c.publicKey as import("node-forge").pki.rsa.PublicKey).n.compareTo(llave.n) === 0);
  if (!hoja) throw new ErrorP12("sin_clave");
  const cadena = [hoja];
  while (cadena.length < 5) {
    const ultimo = cadena[cadena.length - 1];
    const sig = todos.find((c) => !cadena.includes(c) && c.subject.hash === ultimo.issuer.hash && ultimo.subject.hash !== ultimo.issuer.hash);
    if (!sig) break;
    cadena.push(sig);
  }
  const ahora = new Date();
  const vigente = hoja.validity.notBefore <= ahora && hoja.validity.notAfter >= ahora;
  if (!vigente) throw new ErrorP12("vencido");

  let pkcs8: Uint8Array<ArrayBuffer> | null = Uint8Array.from(forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(llave))).getBytes(), (c) => c.charCodeAt(0));
  const pem = cadena.map((c) => forge.pki.certificateToPem(c)).join("\n");

  return {
    info: { sujeto: nombre(forge, hoja.subject.attributes), emisor: nombre(forge, hoja.issuer.attributes), desde: hoja.validity.notBefore, hasta: hoja.validity.notAfter, vigente, bits },
    async firmar(mensaje: string) {
      if (!pkcs8) throw new ErrorP12("sin_clave");
      const k = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      const f = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(mensaje));
      return { firma_b64: aBase64(f), algoritmo: "RSASSA-PKCS1-v1_5-SHA256", cadena_pem: pem };
    },
    descartar() {
      if (pkcs8) pkcs8.fill(0);
      pkcs8 = null;
    },
  };
}

/** Un nombre corto del certificado para mostrar como «firma»: el CN del sujeto. */
export const nombreCorto = (sujeto: string) => sujeto.split(",").find((p) => p.trim().startsWith("CN="))?.trim().slice(3) ?? sujeto;
