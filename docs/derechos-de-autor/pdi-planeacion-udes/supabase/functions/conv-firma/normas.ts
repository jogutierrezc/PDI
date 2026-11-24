/* =============================================================================
   conv-firma · marco normativo del certificado de trazabilidad.
   El contenido (leyes por país, normas colombianas e internacionales y su texto en español e inglés) es el
   del diseño aprobado (artifact «firmante») tal cual. Es una referencia informativa: la validez en cada
   jurisdicción la determina su autoridad y Secretaría General confirma el nivel exigido para cada país.

   PUNTO DE EXTENSIÓN: para añadir un país, agregue una entrada con su código ISO 3166-1 alfa-2. Cada norma
   es [nombre, descripción en español, descripción en inglés].
   ========================================================================== */

export type Norma = readonly [string, string, string];
export interface MarcoPais {
  nombre: string;
  normas: readonly Norma[];
}

export const PAISES: Record<string, MarcoPais> = {
  CO: { nombre: "Colombia", normas: [] },
  ES: {
    nombre: "España (Unión Europea)",
    normas: [
      ["Reglamento (UE) n.º 910/2014 (eIDAS)", "Art. 25: no se niegan efectos jurídicos ni admisibilidad como prueba a una firma electrónica por el solo hecho de ser electrónica.", "Art. 25: an electronic signature cannot be denied legal effect or admissibility as evidence solely because it is electronic."],
      ["Reglamento (UE) 2024/1183", "Modifica eIDAS y crea el marco europeo de identidad digital.", "Amends eIDAS and creates the European digital identity framework."],
      ["Ley 6/2020 (España)", "Regula determinados aspectos de los servicios electrónicos de confianza.", "Regulates certain aspects of electronic trust services."],
    ],
  },
  US: {
    nombre: "Estados Unidos",
    normas: [
      ["ESIGN Act (15 U.S.C. §§ 7001 y ss.)", "Un contrato o firma no pierde efectos jurídicos solo por estar en forma electrónica.", "A contract or signature cannot be denied legal effect solely because it is electronic."],
      ["UETA", "Ley uniforme sobre transacciones electrónicas, adoptada por la mayoría de los estados.", "Uniform act on electronic transactions, adopted by most states."],
    ],
  },
  MX: {
    nombre: "México",
    normas: [
      ["Código de Comercio, arts. 89 a 114", "Reconoce los mensajes de datos y la firma electrónica en actos de comercio.", "Recognizes data messages and electronic signatures in commercial acts."],
      ["Ley de Firma Electrónica Avanzada (2012)", "Regula la firma electrónica avanzada y sus certificados.", "Regulates the advanced electronic signature and its certificates."],
    ],
  },
  CL: { nombre: "Chile", normas: [["Ley 19.799", "Sobre documentos electrónicos, firma electrónica y servicios de certificación.", "On electronic documents, electronic signatures and certification services."]] },
  AR: { nombre: "Argentina", normas: [["Ley 25.506", "Ley de Firma Digital.", "Digital Signature Law."]] },
  BR: {
    nombre: "Brasil",
    normas: [
      ["Medida Provisória 2.200-2/2001 (ICP-Brasil)", "Infraestructura de claves públicas brasileña.", "Brazilian public key infrastructure."],
      ["Ley 14.063/2020", "Firmas electrónicas en interacciones con entes públicos.", "Electronic signatures in interactions with public bodies."],
    ],
  },
  PE: { nombre: "Perú", normas: [["Ley 27269", "Ley de Firmas y Certificados Digitales.", "Digital Signatures and Certificates Law."]] },
};

/** Colombia (entidad que emite el certificado): se muestra siempre. */
export const NORMAS_COLOMBIA: readonly Norma[] = [
  ["Ley 527 de 1999", "Reconoce fuerza probatoria a los mensajes de datos y valida la firma electrónica y digital (arts. 5, 7 y 28).", "Gives evidentiary force to data messages and validates electronic and digital signatures (arts. 5, 7 and 28)."],
  ["Decreto 2364 de 2012", "Reglamenta la firma electrónica y sus requisitos de confiabilidad.", "Regulates electronic signatures and their reliability requirements."],
  ["Decreto 333 de 2014", "Regula las entidades de certificación digital y los certificados.", "Regulates digital certification entities and certificates."],
  ["Código General del Proceso, arts. 243 a 247", "Documentos y mensajes de datos como prueba.", "Documents and data messages as evidence."],
];

/** Normas internacionales: se muestran siempre. */
export const NORMAS_INTERNACIONALES: readonly Norma[] = [
  ["Ley Modelo de la CNUDMI sobre Firmas Electrónicas (2001)", "Criterios de equivalencia funcional entre firma manuscrita y electrónica.", "Functional-equivalence criteria between handwritten and electronic signatures."],
  ["Convención de las Naciones Unidas sobre Comunicaciones Electrónicas en los Contratos Internacionales (2005)", "Reconoce el uso de comunicaciones electrónicas en contratos internacionales.", "Recognizes the use of electronic communications in international contracts."],
];

/** Nombre del país en el idioma pedido (ISO alfa-2 → «Colombia» / «Spain»). */
export function nombrePais(iso2: string, idioma: "es" | "en"): string {
  if (PAISES[iso2] && idioma === "es") return PAISES[iso2].nombre;
  try {
    return new Intl.DisplayNames([idioma], { type: "region" }).of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}
