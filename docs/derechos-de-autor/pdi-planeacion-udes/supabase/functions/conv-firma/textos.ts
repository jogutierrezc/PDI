/* =============================================================================
   conv-firma · textos del PDF (bloque de firma, página de firmas y certificado de trazabilidad),
   en español e inglés. Las claves del certificado son las del diseño aprobado (artifact «firmante»).
   ========================================================================== */

import type { Idioma } from "./plantilla.ts";

export interface TextosPdf {
  // Bloque de firma
  firmaDe: string;
  ver2: string;
  dNom: string;
  dMail: string;
  dId: string;
  dTipo: string;
  dFecha: string;
  dHuella: string;
  tDibu: string;
  tCertif: string;
  tMovil: string;
  certSujeto: string;
  certEmisor: string;
  certSerie: string;
  certVigencia: string;
  pagFirmas: string;
  pagFirmasD: string;
  universidad: string;
  // Certificado
  cT: string;
  cCod: string;
  cEm: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  c5: string;
  c6: string;
  cNom: string;
  cPag: string;
  cAlg: string;
  cAlgFinal: string;
  cConv: string;
  cInt: string;
  cIntNo: string;
  cSello: string;
  cSelloV: string;
  cSelloTsa: string;
  cSelloSin: string;
  cSelloFallo: string;
  cSelloCert: string;
  cSelloFirma: string;
  cRegistro: string;
  cRol: string;
  cMet: string;
  cIp: string;
  cDisp: string;
  cPais: string;
  cDet: string;
  cNoDet: string;
  cNormCo: string;
  cNormInt: string;
  cNormPais: string;
  cAviso: string;
  cVer: string;
  cEmi: string;
  cCadena: Record<string, string>;
  cPag2: string;
  roles: Record<string, string>;
}

export const TEXTOS: Record<Idioma, TextosPdf> = {
  es: {
    firmaDe: "Firma de",
    ver2: "Escanee el código para validar este documento",
    dNom: "Firmante",
    dMail: "Correo",
    dId: "Identidad",
    dTipo: "Tipo de firma",
    dFecha: "Fecha y hora",
    dHuella: "Huella",
    tDibu: "Manuscrita en pantalla",
    tCertif: "Certificado digital del firmante",
    tMovil: "Manuscrita desde el móvil",
    certSujeto: "Titular",
    certEmisor: "Emisor",
    certSerie: "Serie",
    certVigencia: "Vigencia",
    pagFirmas: "Página de firmas",
    pagFirmasD: "Las partes firmaron electrónicamente este documento. Cada bloque lleva un código QR con el que se puede comprobar la firma.",
    universidad: "Universidad de Santander",
    cT: "Certificado de trazabilidad de firmas digitales",
    cCod: "Código",
    cEm: "Emitido",
    c1: "Documento",
    c2: "Firmantes",
    c3: "Registro de eventos",
    c4: "Integridad",
    c5: "Marco normativo",
    c6: "Verificación",
    cNom: "Nombre del documento",
    cPag: "Páginas",
    cAlg: "Huella SHA-256 del documento firmado por las partes",
    cAlgFinal: "Huella SHA-256 del PDF final sellado",
    cConv: "Convenio",
    cInt: "El documento no ha cambiado desde la última firma.",
    cIntNo: "Atención: no se pudo comprobar la integridad del documento.",
    cSello: "Sello de tiempo",
    cSelloV: "Hora UTC del servidor de la UDES",
    cSelloTsa: "Sello de tiempo RFC 3161 de la autoridad",
    cSelloSin: "No hay sello de tiempo de una autoridad externa: la hora del sellado es la del servidor de la UDES.",
    cSelloFallo: "La autoridad de sello de tiempo no respondió; la hora es la del servidor de la UDES.",
    cSelloCert: "Sello digital del PDF",
    cSelloFirma: "Firma digital PDF (CMS adbe.pkcs7.detached, certificación sin cambios permitidos) con el certificado de la UDES",
    cRegistro: "Huella del registro de eventos (encadenada)",
    cRol: "Rol",
    cMet: "Método",
    cIp: "IP y ubicación",
    cDisp: "Dispositivo",
    cPais: "País desde el que se firma",
    cDet: "detectado por la dirección IP",
    cNoDet: "No determinado",
    cNormCo: "Colombia (entidad que emite el certificado)",
    cNormInt: "Normas internacionales",
    cNormPais: "País desde el que se firma",
    cAviso: "Referencia informativa de las normas que respaldan la firma electrónica. La validez en cada jurisdicción la determina su autoridad. Secretaría General confirma el nivel exigido para cada país.",
    cVer: "Para comprobar este certificado escanee el código o ingrese el código de validación en",
    cEmi: "Emitido por la Universidad de Santander · Relaciones Internacionales",
    cCadena: {
      lista_confianza: "Cadena verificada contra la lista de confianza de la UDES",
      no_verificada_acreditada: "Cadena no verificada contra una entidad acreditada",
    },
    cPag2: "Página",
    roles: { UDES: "UDES", contraparte: "Contraparte", testigo: "Testigo" },
  },
  en: {
    firmaDe: "Signature of",
    ver2: "Scan the code to validate this document",
    dNom: "Signer",
    dMail: "Email",
    dId: "Identity",
    dTipo: "Signature type",
    dFecha: "Date and time",
    dHuella: "Fingerprint",
    tDibu: "Handwritten on screen",
    tCertif: "Signer's digital certificate",
    tMovil: "Handwritten from phone",
    certSujeto: "Holder",
    certEmisor: "Issuer",
    certSerie: "Serial",
    certVigencia: "Validity",
    pagFirmas: "Signature page",
    pagFirmasD: "The parties signed this document electronically. Each block carries a QR code that can be used to check the signature.",
    universidad: "Universidad de Santander",
    cT: "Digital signature traceability certificate",
    cCod: "Code",
    cEm: "Issued",
    c1: "Document",
    c2: "Signers",
    c3: "Event log",
    c4: "Integrity",
    c5: "Legal framework",
    c6: "Verification",
    cNom: "Document name",
    cPag: "Pages",
    cAlg: "SHA-256 fingerprint of the document signed by the parties",
    cAlgFinal: "SHA-256 fingerprint of the final sealed PDF",
    cConv: "Agreement",
    cInt: "The document has not changed since the last signature.",
    cIntNo: "Warning: the integrity of the document could not be checked.",
    cSello: "Time stamp",
    cSelloV: "UTC time from the UDES server",
    cSelloTsa: "RFC 3161 time stamp from the authority",
    cSelloSin: "There is no time stamp from an external authority: the sealing time is the UDES server's time.",
    cSelloFallo: "The time stamp authority did not answer; the time is the UDES server's time.",
    cSelloCert: "PDF digital seal",
    cSelloFirma: "PDF digital signature (CMS adbe.pkcs7.detached, certification with no changes allowed) with the UDES certificate",
    cRegistro: "Event log fingerprint (chained)",
    cRol: "Role",
    cMet: "Method",
    cIp: "IP and location",
    cDisp: "Device",
    cPais: "Country the signature was made from",
    cDet: "detected from the IP address",
    cNoDet: "Not determined",
    cNormCo: "Colombia (issuing entity)",
    cNormInt: "International rules",
    cNormPais: "Country of signature",
    cAviso: "Informational reference to the rules that support electronic signatures. Validity in each jurisdiction is determined by its authority. The General Secretariat confirms the level required for each country.",
    cVer: "To check this certificate scan the code or enter the validation code at",
    cEmi: "Issued by Universidad de Santander · International Relations",
    cCadena: {
      lista_confianza: "Chain verified against the UDES trust list",
      no_verificada_acreditada: "Chain not verified against an accredited entity",
    },
    cPag2: "Page",
    roles: { UDES: "UDES", contraparte: "Counterparty", testigo: "Witness" },
  },
};

/** Texto de cada evento en el certificado. `{n}` es el nombre del firmante. */
export const EVENTOS: Record<Idioma, Record<string, string>> = {
  es: {
    creado: "Solicitud de firma creada",
    enviado: "Solicitud de firma y código de verificación enviados a {n}",
    entregado: "Correo aceptado por el servidor de correo ({n})",
    abierto: "Enlace de firma abierto ({n})",
    codigo_enviado: "Código de verificación enviado a {n}",
    codigo_reenviado: "Código de verificación nuevo enviado a {n}",
    codigo_verificado: "Código de verificación validado ({n})",
    codigo_fallido: "Código de verificación incorrecto ({n})",
    documento_visto: "Documento abierto ({n})",
    documento_leido: "Documento revisado hasta el final ({n})",
    firma_adoptada: "Firma adoptada ({n})",
    firma_aplicada: "Firma aplicada ({n})",
    movil_iniciado: "Sesión de firma desde el móvil iniciada ({n})",
    movil_recibido: "Firma recibida desde el móvil ({n})",
    pdf_generado: "Documento generado con su huella",
    pdf_sellado: "Documento final con las firmas, sellado con el certificado de la UDES",
    certificado_emitido: "Certificado de trazabilidad emitido",
    correos_enviados: "Copias enviadas a las partes",
    cancelado: "Solicitud cancelada",
    vencido: "Solicitud vencida",
    recordatorio: "Recordatorio enviado a {n}",
    enlace_reenviado: "Enlace de firma nuevo enviado a {n}",
    bloqueado: "Verificación bloqueada por intentos fallidos ({n})",
  },
  en: {
    creado: "Signature request created",
    enviado: "Signature request and verification code sent to {n}",
    entregado: "Email accepted by the mail server ({n})",
    abierto: "Signing link opened ({n})",
    codigo_enviado: "Verification code sent to {n}",
    codigo_reenviado: "New verification code sent to {n}",
    codigo_verificado: "Verification code validated ({n})",
    codigo_fallido: "Wrong verification code ({n})",
    documento_visto: "Document opened ({n})",
    documento_leido: "Document reviewed to the end ({n})",
    firma_adoptada: "Signature adopted ({n})",
    firma_aplicada: "Signature applied ({n})",
    movil_iniciado: "Phone signing session started ({n})",
    movil_recibido: "Signature received from the phone ({n})",
    pdf_generado: "Document generated with its fingerprint",
    pdf_sellado: "Final document with the signatures, sealed with the UDES certificate",
    certificado_emitido: "Traceability certificate issued",
    correos_enviados: "Copies sent to the parties",
    cancelado: "Request cancelled",
    vencido: "Request expired",
    recordatorio: "Reminder sent to {n}",
    enlace_reenviado: "New signing link sent to {n}",
    bloqueado: "Verification locked after failed attempts ({n})",
  },
};
