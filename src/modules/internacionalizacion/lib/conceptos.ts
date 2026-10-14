/* =============================================================================
   Internacionalización · catálogo de conceptos y emparejamiento por nombre.

   CONCEPTOS_BASE es el espejo de la semilla de 0151 (int_conceptos): la
   prueba de base de datos comprueba que los ids coinciden. En la pantalla se
   usa el catálogo que devuelve la base (el Director puede añadir conceptos);
   aquí sirve para las pruebas y como respaldo.

   Emparejar: un encabezado («País destino», «PAÍS DE LA CONTRAPARTE») se
   compara sin acentos ni signos con el nombre, el id y los sinónimos de cada
   concepto. Primero igualdad exacta; si no, contención (el encabezado
   contiene el nombre del concepto o al revés) con al menos 4 letras, y gana
   la coincidencia más larga. Lo que no empareja es un «campo propio».
   ========================================================================== */

import { DOMINIOS } from "../../reportes/snies/dominios";
import type { Concepto } from "../tipos";

/** «País de la Contraparte » → «pais de la contraparte». Sin acentos ni signos. */
export function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Clave de un campo propio a partir de su encabezado: «Nº de créditos» → «propio_n_de_creditos». */
export function claveDePropio(encabezado: string, usadas: Iterable<string> = []): string {
  const base = `propio_${normalizar(encabezado).replace(/ /g, "_") || "campo"}`.slice(0, 60);
  const ocupadas = new Set(usadas);
  let clave = base;
  for (let n = 2; ocupadas.has(clave); n++) clave = `${base}_${n}`;
  return clave;
}

const nombres = (dominio: string) => (DOMINIOS[dominio]?.valores ?? []).map((v) => v.nombre);

/** Tipo de documento, sexo y estado civil usan las listas del manual SNIES: así el puente no traduce. */
export const CONCEPTOS_BASE: Concepto[] = [
  { id: "periodo", nombre: "Periodo", tipo: "texto", opciones: [], sinonimos: ["semestre", "periodo academico"], implicito: true },
  { id: "campus", nombre: "Campus", tipo: "lista", opciones: [], sinonimos: ["sede", "seccional"], implicito: true },
  { id: "programa", nombre: "Programa académico", tipo: "texto", opciones: [], sinonimos: ["programa", "programa academico", "carrera"] },
  {
    id: "tipo_persona",
    nombre: "Tipo de participante",
    tipo: "lista",
    opciones: ["Estudiante", "Docente", "Administrativo", "Egresado", "Investigador"],
    sinonimos: ["tipo de persona", "rol", "estamento", "participante"],
  },
  {
    id: "tipo_documento",
    nombre: "Tipo de documento",
    tipo: "lista",
    opciones: nombres("tipo_documento"),
    sinonimos: ["tipo doc", "tipo de identificacion", "tipo identificacion"],
    personal: true,
  },
  {
    id: "numero_documento",
    nombre: "Número de documento",
    tipo: "texto",
    opciones: [],
    sinonimos: ["documento", "numero de identificacion", "identificacion", "cedula", "no documento", "num documento", "nro documento"],
    personal: true,
  },
  { id: "primer_nombre", nombre: "Primer nombre", tipo: "texto", opciones: [], sinonimos: ["nombre", "nombres"], personal: true },
  { id: "segundo_nombre", nombre: "Segundo nombre", tipo: "texto", opciones: [], sinonimos: [], personal: true },
  { id: "primer_apellido", nombre: "Primer apellido", tipo: "texto", opciones: [], sinonimos: ["apellido", "apellidos"], personal: true },
  { id: "segundo_apellido", nombre: "Segundo apellido", tipo: "texto", opciones: [], sinonimos: [], personal: true },
  {
    id: "nombre_completo",
    nombre: "Nombre completo",
    tipo: "texto",
    opciones: [],
    sinonimos: ["nombres y apellidos", "nombre y apellido", "nombre del participante"],
    personal: true,
  },
  { id: "sexo_biologico", nombre: "Sexo biológico", tipo: "lista", opciones: nombres("sexo_biologico"), sinonimos: ["sexo", "genero"], personal: true },
  { id: "estado_civil", nombre: "Estado civil", tipo: "lista", opciones: nombres("estado_civil"), sinonimos: [], personal: true },
  { id: "fecha_nacimiento", nombre: "Fecha de nacimiento", tipo: "fecha", opciones: [], sinonimos: ["nacimiento"], personal: true },
  { id: "pais_nacimiento", nombre: "País de nacimiento", tipo: "texto", opciones: [], sinonimos: ["pais de origen"], personal: true },
  { id: "nacionalidad", nombre: "Nacionalidad", tipo: "texto", opciones: [], sinonimos: ["pais de nacionalidad"] },
  { id: "correo", nombre: "Correo electrónico", tipo: "texto", opciones: [], sinonimos: ["email", "correo electronico", "e mail", "mail"], personal: true },
  { id: "telefono", nombre: "Teléfono", tipo: "texto", opciones: [], sinonimos: ["celular", "telefono de contacto", "movil"], personal: true },
  {
    id: "sentido_movilidad",
    nombre: "Sentido de la movilidad",
    tipo: "lista",
    opciones: ["Saliente", "Entrante"],
    sinonimos: ["sentido", "tipo de movilidad saliente entrante", "direccion", "entrante saliente"],
  },
  {
    id: "tipo_movilidad",
    nombre: "Tipo de movilidad",
    tipo: "lista",
    opciones: [
      "Semestre académico",
      "Pasantía",
      "Curso corto",
      "Evento académico",
      "Doble titulación",
      "Estancia de investigación",
      "Rotación clínica",
      "Misión académica",
      "Otra",
    ],
    sinonimos: ["modalidad de intercambio", "actividad", "tipo de actividad"],
  },
  { id: "modalidad", nombre: "Modalidad", tipo: "lista", opciones: ["Presencial", "Virtual", "Mixta"], sinonimos: ["presencial o virtual"] },
  {
    id: "pais_contraparte",
    nombre: "País de la contraparte",
    tipo: "texto",
    opciones: [],
    sinonimos: ["pais", "pais destino", "pais de destino", "pais de procedencia", "pais origen"],
  },
  { id: "ciudad_contraparte", nombre: "Ciudad de la contraparte", tipo: "texto", opciones: [], sinonimos: ["ciudad", "ciudad destino", "ciudad de destino"] },
  {
    id: "institucion_contraparte",
    nombre: "Institución de la contraparte",
    tipo: "texto",
    opciones: [],
    sinonimos: [
      "institucion",
      "universidad",
      "institucion destino",
      "institucion de destino",
      "universidad destino",
      "institucion de origen",
      "entidad",
      "institucion aliada",
      "contraparte",
    ],
  },
  {
    id: "fecha_inicio",
    nombre: "Fecha de inicio",
    tipo: "fecha",
    opciones: [],
    sinonimos: ["inicio", "desde", "fecha inicial", "fecha de suscripcion", "fecha suscripcion"],
  },
  {
    id: "fecha_fin",
    nombre: "Fecha de fin",
    tipo: "fecha",
    opciones: [],
    sinonimos: ["fin", "hasta", "fecha final", "fecha de terminacion", "fecha terminacion", "fecha de finalizacion"],
  },
  { id: "duracion_dias", nombre: "Duración (días)", tipo: "calculado", opciones: [], sinonimos: ["duracion", "dias", "numero de dias"] },
  {
    id: "financiacion",
    nombre: "Financiación",
    tipo: "lista",
    opciones: ["Propia", "Beca UDES", "Convenio", "Externa"],
    sinonimos: ["fuente de financiacion", "financiamiento", "apoyo economico"],
  },
  { id: "valor_financiacion", nombre: "Valor de la financiación", tipo: "numero", opciones: [], sinonimos: ["valor", "monto", "valor apoyo"] },
  { id: "nombre_convenio", nombre: "Nombre del convenio", tipo: "texto", opciones: [], sinonimos: ["convenio", "objeto del convenio", "objeto"] },
  {
    id: "tipo_convenio",
    nombre: "Tipo de convenio",
    tipo: "lista",
    opciones: ["Marco", "Específico", "Doble titulación", "Movilidad", "Investigación", "Otro"],
    sinonimos: ["clase de convenio"],
  },
  {
    id: "vigencia_anios",
    nombre: "Vigencia del convenio (años)",
    tipo: "numero",
    opciones: [],
    sinonimos: ["vigencia", "vigencia anos", "duracion del convenio", "anos de vigencia"],
  },
  { id: "ods", nombre: "ODS asociado", tipo: "texto", opciones: [], sinonimos: ["objetivo de desarrollo sostenible", "ods"] },
];

/** Conceptos implícitos: van en la fila (periodo_id, campus_id), no en una columna. */
export const IMPLICITOS = ["periodo", "campus"] as const;

/** Columna calculada de duración, si la hoja trae inicio y fin. */
export const CALCULO_DURACION = { tipo: "dias_entre", desde: "fecha_inicio", hasta: "fecha_fin" } as const;

export interface Emparejamiento {
  concepto: Concepto;
  /** exacto: igual al nombre, id o un sinónimo; parecido: uno contiene al otro. */
  como: "exacto" | "parecido";
}

/**
 * El concepto que corresponde a un encabezado, o nulo (campo propio).
 * `excluir`: ids ya usados en la misma hoja (dos columnas no pueden tener el mismo concepto).
 */
export function emparejarConcepto(encabezado: string, conceptos: readonly Concepto[], excluir: ReadonlySet<string> = new Set()): Emparejamiento | null {
  const h = normalizar(encabezado);
  if (!h) return null;
  const candidatos = conceptos.filter((c) => !excluir.has(c.id));
  const formas = (c: Concepto) => [c.nombre, c.id.replace(/_/g, " "), ...c.sinonimos].map(normalizar).filter(Boolean);

  const exacto = candidatos.find((c) => formas(c).includes(h));
  if (exacto) return { concepto: exacto, como: "exacto" };

  let mejor: { concepto: Concepto; largo: number } | null = null;
  for (const c of candidatos) {
    for (const f of formas(c)) {
      if (f.length < 4 || h.length < 4) continue;
      // El encabezado contiene la forma («Nombre de la institución aliada»), o —si
      // tiene al menos dos palabras— la forma contiene al encabezado.
      const contiene = new RegExp(`(^| )${f}( |$)`).test(h) || (h.includes(" ") && new RegExp(`(^| )${h}( |$)`).test(f));
      if (contiene && (!mejor || f.length > mejor.largo)) mejor = { concepto: c, largo: f.length };
    }
  }
  return mejor ? { concepto: mejor.concepto, como: "parecido" } : null;
}

/** La opción de la lista que corresponde a un valor sin mirar acentos ni mayúsculas, o nulo. */
export function opcionDe(valor: string, opciones: readonly string[]): string | null {
  const v = normalizar(valor);
  if (!v) return null;
  return opciones.find((o) => normalizar(o) === v) ?? null;
}
