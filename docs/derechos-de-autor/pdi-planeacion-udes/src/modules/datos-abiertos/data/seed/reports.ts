/* =============================================================================
   Datos Abiertos · cifras de ejemplo.

   TODAS LAS CIFRAS DE ESTE ARCHIVO SON ILUSTRATIVAS. Sirven para diseñar y
   probar el portal mientras se define la alimentación real; la interfaz las
   marca como "Dato ilustrativo" mientras `illustrative` sea true.

   Lo que sí es real: los nombres de los nueve informes, los tres campus y la
   estructura del PDI (seis pilares). Las imágenes son fotogramas del vídeo
   institucional, provisionales hasta tener fotografía oficial por informe.

   Ya no lo importa la aplicación: es la fuente de la semilla SQL de UDES en
   Cifras (scripts/build-od-seed.mjs). El portal lee de la base. Las series van
   en el orden de `YEARS`; el generador añade 2020 para completar el periodo.
   ========================================================================== */

import type { Breakdown, BreakdownItem, Indicator, OpenDataCatalog, YearCampusValues } from "../types";

const YEARS = [2021, 2022, 2023, 2024, 2025];

type Series = (number | null)[];

const CREDIT = "Fotograma del vídeo institucional UDES · imagen provisional";

/** Cifras que se suman: el total es la suma de los campus, y no existe si falta alguna. */
function summed(campus: { bucaramanga: Series; cucuta: Series; valledupar: Series }): YearCampusValues {
  const values: YearCampusValues = {};
  YEARS.forEach((year, i) => {
    const b = campus.bucaramanga[i] ?? null;
    const c = campus.cucuta[i] ?? null;
    const v = campus.valledupar[i] ?? null;
    values[year] = {
      bucaramanga: b,
      cucuta: c,
      valledupar: v,
      todas: b === null || c === null || v === null ? null : b + c + v,
    };
  });
  return values;
}

/** Tasas y promedios: el total institucional se reporta, no se suma. */
function reported(series: {
  todas: Series;
  bucaramanga?: Series;
  cucuta?: Series;
  valledupar?: Series;
}): YearCampusValues {
  const values: YearCampusValues = {};
  YEARS.forEach((year, i) => {
    values[year] = {
      todas: series.todas[i] ?? null,
      bucaramanga: series.bucaramanga?.[i] ?? null,
      cucuta: series.cucuta?.[i] ?? null,
      valledupar: series.valledupar?.[i] ?? null,
    };
  });
  return values;
}

/** Desglose por años: una fila de etiquetas y una serie por año. */
function byYear(labels: string[], rows: Record<number, (number | null)[]>): Record<number, BreakdownItem[]> {
  const out: Record<number, BreakdownItem[]> = {};
  for (const [year, row] of Object.entries(rows)) {
    out[Number(year)] = labels.map((label, i) => ({ label, value: row[i] ?? null }));
  }
  return out;
}

function indicator(def: Indicator): Indicator {
  return def;
}

function breakdown(def: Breakdown): Breakdown {
  return def;
}

export const baseCatalog: OpenDataCatalog = {
  years: YEARS,
  currentYear: 2025,
  illustrative: true,
  cutoffDate: "2025-12-15",
  campuses: [
    { id: "todas", name: "Todos los campus" },
    { id: "bucaramanga", name: "Bucaramanga" },
    { id: "cucuta", name: "Cúcuta" },
    { id: "valledupar", name: "Valledupar" },
  ],
  reports: [
    /* ----------------------------------------------------------------- PO */
    {
      slug: "poblacional",
      code: "PO",
      name: "Poblacional",
      summary: "Quiénes forman la universidad: estudiantes, docentes, administrativos y graduados.",
      description:
        "La comunidad universitaria contada por campus y por año: matrícula de pregrado y posgrado, primer ingreso, cuerpo docente, personal administrativo y graduados de cada corte.",
      image: {
        src: "/datos-abiertos/poblacional.webp",
        alt: "Grupo de estudiantes y profesores caminando por la plazoleta del campus",
        credit: CREDIT,
      },
      line: 1,
      keyIndicators: ["matricula", "primer-ingreso", "docentes", "graduados"],
      indicators: [
        indicator({
          id: "matricula",
          label: "Estudiantes matriculados",
          unit: "estudiantes",
          format: "entero",
          direction: "sube",
          definition: "Estudiantes con matrícula académica y financiera en el segundo periodo del año, pregrado y posgrado.",
          source: "Admisiones y Registro Académico",
          values: summed({
            bucaramanga: [12184, 12530, 12902, 13188, 13412],
            cucuta: [4211, 4390, 4588, 4702, 4893],
            valledupar: [2106, 2254, 2398, 2561, 2729],
          }),
        }),
        indicator({
          id: "primer-ingreso",
          label: "Estudiantes de primer ingreso",
          unit: "estudiantes",
          format: "entero",
          direction: "sube",
          definition: "Estudiantes que se matriculan por primera vez en un programa durante el año.",
          source: "Admisiones y Registro Académico",
          values: summed({
            bucaramanga: [2410, 2502, 2618, 2655, 2731],
            cucuta: [862, 905, 948, 972, 1011],
            valledupar: [455, 488, 512, 547, 590],
          }),
        }),
        indicator({
          id: "docentes",
          label: "Docentes",
          unit: "docentes",
          format: "entero",
          direction: "neutro",
          definition: "Docentes vinculados en cualquier modalidad de contratación al cierre del año.",
          source: "Talento Humano",
          values: summed({
            bucaramanga: [702, 718, 731, 744, 758],
            cucuta: [262, 270, 281, 289, 297],
            valledupar: [141, 150, 162, 171, 183],
          }),
        }),
        indicator({
          id: "administrativos",
          label: "Personal administrativo",
          unit: "personas",
          format: "entero",
          direction: "neutro",
          definition: "Personas con vínculo administrativo vigente al cierre del año.",
          source: "Talento Humano",
          values: summed({
            bucaramanga: [540, 548, 556, 561, 569],
            cucuta: [168, 172, 179, 183, 188],
            valledupar: [98, 104, 111, 118, 124],
          }),
        }),
        indicator({
          id: "graduados",
          label: "Graduados en el año",
          unit: "graduados",
          format: "entero",
          direction: "sube",
          definition: "Títulos otorgados en las ceremonias de grado del año, pregrado y posgrado.",
          source: "Secretaría General",
          values: summed({
            bucaramanga: [2014, 2106, 2188, 2240, 2302],
            cucuta: [598, 640, 671, 702, 733],
            valledupar: [254, 281, 309, 338, 362],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "nivel",
          title: "Matrícula por nivel de formación",
          unit: "estudiantes",
          format: "entero",
          source: "Admisiones y Registro Académico",
          values: byYear(
            ["Técnico y tecnológico", "Universitario", "Especialización", "Maestría", "Doctorado"],
            {
              2024: [1804, 15122, 1851, 1590, 84],
              2025: [1911, 15408, 1932, 1688, 95],
            },
          ),
        }),
        breakdown({
          id: "modalidad",
          title: "Matrícula por modalidad",
          unit: "estudiantes",
          format: "entero",
          source: "Admisiones y Registro Académico",
          values: byYear(["Presencial", "Virtual", "A distancia"], {
            2024: [16180, 3522, 749],
            2025: [16402, 3884, 748],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- PE */
    {
      slug: "permanencia",
      code: "PE",
      name: "Permanencia",
      summary: "Cuántos se quedan, cuántos se van y cuántos llegan al grado.",
      description:
        "Retención, deserción y graduación por cohorte, con la cobertura de los programas de acompañamiento que buscan que quien entra a la universidad salga con su título.",
      image: {
        src: "/datos-abiertos/permanencia.webp",
        alt: "Estudiantes de salud en una sesión de estudio en grupo con su docente",
        credit: CREDIT,
      },
      line: 2,
      keyIndicators: ["retencion", "desercion", "graduacion-cohorte", "acompanamiento"],
      indicators: [
        indicator({
          id: "retencion",
          label: "Tasa de retención anual",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Estudiantes matriculados en un año que vuelven a matricularse al siguiente o se gradúan.",
          source: "Bienestar Universitario",
          values: reported({
            todas: [82.1, 83.4, 84.6, 85.5, 86.4],
            bucaramanga: [83.0, 84.2, 85.3, 86.1, 87.0],
            cucuta: [80.9, 82.5, 83.8, 84.9, 85.6],
            valledupar: [79.4, 80.8, 82.6, 83.7, 84.9],
          }),
        }),
        indicator({
          id: "desercion",
          label: "Deserción por periodo",
          unit: "%",
          format: "porcentaje",
          direction: "baja",
          definition: "Estudiantes que no renuevan matrícula en dos periodos consecutivos sin haberse graduado.",
          source: "Bienestar Universitario",
          values: reported({
            todas: [10.4, 9.8, 9.1, 8.6, 8.1],
            bucaramanga: [9.9, 9.3, 8.7, 8.2, 7.7],
            cucuta: [11.0, 10.3, 9.6, 9.1, 8.6],
            valledupar: [11.8, 11.2, 10.2, 9.5, 8.9],
          }),
        }),
        indicator({
          id: "graduacion-cohorte",
          label: "Graduación por cohorte",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Estudiantes de una cohorte que se gradúan en el tiempo previsto del programa más dos periodos.",
          source: "Vicerrectoría Académica",
          values: reported({
            todas: [41.8, 43.0, 44.6, 45.9, 47.2],
            bucaramanga: [43.1, 44.2, 45.8, 47.0, 48.3],
            cucuta: [40.2, 41.6, 43.2, 44.5, 45.9],
            valledupar: [null, 38.9, 40.7, 42.4, 44.1],
          }),
        }),
        indicator({
          id: "acompanamiento",
          label: "Estudiantes en acompañamiento",
          unit: "estudiantes",
          format: "entero",
          direction: "sube",
          definition: "Estudiantes atendidos por tutorías, monitorías, apoyo psicosocial o financiero durante el año.",
          source: "Bienestar Universitario",
          values: summed({
            bucaramanga: [2810, 3022, 3240, 3395, 3518],
            cucuta: [940, 1012, 1105, 1180, 1244],
            valledupar: [512, 580, 648, 731, 802],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "semestre",
          title: "Deserción según semestre cursado",
          unit: "%",
          format: "porcentaje",
          source: "Bienestar Universitario",
          values: byYear(["1.º", "2.º", "3.º", "4.º", "5.º", "6.º o más"], {
            2024: [18.2, 12.4, 9.1, 6.8, 5.2, 3.1],
            2025: [17.1, 11.6, 8.7, 6.4, 4.9, 2.9],
          }),
        }),
        breakdown({
          id: "causas",
          title: "Causas de retiro declaradas",
          unit: "estudiantes",
          format: "entero",
          source: "Bienestar Universitario",
          values: byYear(["Económicas", "Académicas", "Laborales", "Personales o familiares", "Cambio de institución"], {
            2024: [612, 388, 241, 205, 132],
            2025: [571, 352, 236, 198, 121],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- VI */
    {
      slug: "visibilidad",
      code: "VI",
      name: "Visibilidad",
      summary: "La universidad hacia fuera: convenios, movilidad y presencia en medios.",
      description:
        "Relaciones internacionales y nacionales, movilidad de estudiantes y docentes, y el alcance de la comunicación institucional.",
      image: {
        src: "/datos-abiertos/visibilidad.webp",
        alt: "Directivas de la universidad reunidas con un aliado junto a un ventanal",
        credit: CREDIT,
      },
      line: 3,
      keyIndicators: ["convenios", "movilidad", "medios", "eventos"],
      indicators: [
        indicator({
          id: "convenios",
          label: "Convenios vigentes",
          unit: "convenios",
          format: "entero",
          direction: "sube",
          definition: "Convenios nacionales e internacionales firmados y vigentes al cierre del año.",
          source: "Relaciones Internacionales",
          values: reported({ todas: [168, 181, 196, 214, 229] }),
        }),
        indicator({
          id: "movilidad",
          label: "Movilidad académica",
          unit: "personas",
          format: "entero",
          direction: "sube",
          definition: "Estudiantes y docentes en movilidad entrante y saliente, presencial o virtual.",
          source: "Relaciones Internacionales",
          values: summed({
            bucaramanga: [212, 288, 341, 392, 421],
            cucuta: [64, 90, 112, 128, 141],
            valledupar: [21, 34, 46, 58, 66],
          }),
        }),
        indicator({
          id: "medios",
          label: "Apariciones en medios",
          unit: "notas",
          format: "entero",
          direction: "sube",
          definition: "Notas en medios regionales y nacionales que citan a la universidad o a su comunidad.",
          source: "Comunicaciones",
          values: reported({ todas: [712, 804, 936, 1102, 1240] }),
        }),
        indicator({
          id: "eventos",
          label: "Eventos académicos abiertos",
          unit: "eventos",
          format: "entero",
          direction: "sube",
          definition: "Congresos, foros y cátedras abiertas organizados por la universidad.",
          source: "Comunicaciones",
          values: summed({
            bucaramanga: [96, 118, 131, 140, 152],
            cucuta: [31, 38, 44, 49, 55],
            valledupar: [14, 19, 23, 27, 31],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "tipo-movilidad",
          title: "Movilidad por tipo",
          unit: "personas",
          format: "entero",
          source: "Relaciones Internacionales",
          values: byYear(["Estudiantes salientes", "Estudiantes entrantes", "Docentes salientes", "Docentes entrantes"], {
            2024: [251, 148, 102, 77],
            2025: [272, 161, 110, 85],
          }),
        }),
        breakdown({
          id: "region",
          title: "Convenios por región",
          unit: "convenios",
          format: "entero",
          source: "Relaciones Internacionales",
          values: byYear(["Colombia", "América Latina", "Europa", "Norteamérica", "Otras regiones"], {
            2024: [98, 61, 36, 13, 6],
            2025: [104, 66, 40, 13, 6],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- EN */
    {
      slug: "ensenanza",
      code: "EN",
      name: "Enseñanza",
      summary: "La oferta académica y quién enseña: programas, calidad y formación docente.",
      description:
        "Programas activos por nivel, programas con acreditación, formación de los docentes y relación entre estudiantes y profesores.",
      image: {
        src: "/datos-abiertos/ensenanza.webp",
        alt: "Docente explicando frente a una sala de cómputo con estudiantes",
        credit: CREDIT,
      },
      line: 4,
      keyIndicators: ["programas", "acreditados", "docentes-posgrado", "relacion"],
      indicators: [
        indicator({
          id: "programas",
          label: "Programas académicos activos",
          unit: "programas",
          format: "entero",
          direction: "neutro",
          definition: "Programas con registro calificado vigente y estudiantes matriculados.",
          source: "Vicerrectoría Académica",
          values: summed({
            bucaramanga: [58, 60, 62, 64, 65],
            cucuta: [17, 18, 19, 20, 21],
            valledupar: [8, 9, 10, 11, 12],
          }),
        }),
        indicator({
          id: "acreditados",
          label: "Programas acreditados",
          unit: "programas",
          format: "entero",
          direction: "sube",
          definition: "Programas con acreditación en alta calidad vigente al cierre del año.",
          source: "Aseguramiento de la Calidad",
          values: summed({
            bucaramanga: [7, 8, 9, 10, 11],
            cucuta: [1, 1, 2, 2, 3],
            valledupar: [0, 0, 0, 1, 1],
          }),
        }),
        indicator({
          id: "docentes-posgrado",
          label: "Docentes con posgrado",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Docentes cuyo máximo nivel de formación es especialización, maestría o doctorado.",
          source: "Talento Humano",
          values: reported({
            todas: [71.2, 73.0, 74.8, 76.5, 78.1],
            bucaramanga: [74.0, 75.6, 77.1, 78.6, 80.2],
            cucuta: [67.3, 69.4, 71.5, 73.4, 75.0],
            valledupar: [61.8, 64.0, 66.9, 69.8, 72.3],
          }),
        }),
        indicator({
          id: "relacion",
          label: "Estudiantes por docente",
          unit: "estudiantes",
          format: "decimal",
          direction: "neutro",
          definition: "Estudiantes matriculados divididos entre docentes equivalentes de tiempo completo.",
          source: "Vicerrectoría Académica",
          values: reported({
            todas: [17.8, 17.5, 17.2, 17.0, 16.8],
            bucaramanga: [17.4, 17.1, 16.9, 16.7, 16.5],
            cucuta: [18.2, 18.0, 17.6, 17.3, 17.1],
            valledupar: [19.1, 18.6, 18.0, 17.8, 17.4],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "docentes-nivel",
          title: "Docentes por máximo nivel de formación",
          unit: "docentes",
          format: "entero",
          source: "Talento Humano",
          values: byYear(["Doctorado", "Maestría", "Especialización", "Profesional"], {
            2024: [118, 574, 245, 248],
            2025: [134, 598, 249, 227],
          }),
        }),
        breakdown({
          id: "programas-nivel",
          title: "Programas por nivel",
          unit: "programas",
          format: "entero",
          source: "Vicerrectoría Académica",
          values: byYear(["Técnico y tecnológico", "Universitario", "Especialización", "Maestría", "Doctorado"], {
            2024: [9, 38, 30, 16, 2],
            2025: [9, 39, 31, 17, 2],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- EX */
    {
      slug: "extension",
      code: "EX",
      name: "Extensión y Proyección Social",
      summary: "Lo que la universidad hace con y para su región.",
      description:
        "Personas beneficiadas por los proyectos sociales, la educación continua, las prácticas y los servicios que la universidad presta a comunidades, empresas y entidades públicas.",
      image: {
        src: "/datos-abiertos/extension.webp",
        alt: "Estudiante de terapia ocupacional trabajando con una niña en una actividad",
        credit: CREDIT,
      },
      line: 5,
      keyIndicators: ["beneficiarios", "educacion-continua", "proyectos-sociales", "servicios"],
      indicators: [
        indicator({
          id: "beneficiarios",
          label: "Personas beneficiadas",
          unit: "personas",
          format: "entero",
          direction: "sube",
          definition: "Personas atendidas por proyectos sociales, consultorios, jornadas y prácticas con comunidad.",
          source: "Extensión y Proyección Social",
          values: summed({
            bucaramanga: [21400, 24850, 27210, 29880, 31620],
            cucuta: [7120, 8340, 9410, 10380, 11050],
            valledupar: [2890, 3510, 4120, 4760, 5390],
          }),
        }),
        indicator({
          id: "educacion-continua",
          label: "Cursos de educación continua",
          unit: "cursos",
          format: "entero",
          direction: "sube",
          definition: "Diplomados, cursos y seminarios abiertos al público realizados en el año.",
          source: "Educación Continua",
          values: summed({
            bucaramanga: [102, 118, 127, 136, 144],
            cucuta: [31, 36, 41, 44, 48],
            valledupar: [9, 12, 15, 17, 19],
          }),
        }),
        indicator({
          id: "proyectos-sociales",
          label: "Proyectos sociales",
          unit: "proyectos",
          format: "entero",
          direction: "sube",
          definition: "Proyectos de proyección social en ejecución durante el año.",
          source: "Extensión y Proyección Social",
          values: summed({
            bucaramanga: [41, 46, 50, 53, 57],
            cucuta: [12, 14, 16, 17, 19],
            valledupar: [5, 6, 8, 9, 10],
          }),
        }),
        indicator({
          id: "servicios",
          label: "Consultorías y servicios",
          unit: "contratos",
          format: "entero",
          direction: "sube",
          definition: "Consultorías, asesorías y servicios técnicos contratados por empresas y entidades.",
          source: "Extensión y Proyección Social",
          values: reported({ todas: [38, 44, 51, 58, 64] }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "poblacion",
          title: "Personas beneficiadas por población",
          unit: "personas",
          format: "entero",
          source: "Extensión y Proyección Social",
          values: byYear(["Comunidades vulnerables", "Instituciones educativas", "Sector empresarial", "Entidades públicas"], {
            2024: [22640, 12310, 5980, 4090],
            2025: [24010, 13120, 6420, 4510],
          }),
        }),
        breakdown({
          id: "area",
          title: "Participantes en educación continua por área",
          unit: "participantes",
          format: "entero",
          source: "Educación Continua",
          values: byYear(["Salud", "Ingeniería y tecnología", "Economía y negocios", "Educación", "Ciencias sociales"], {
            2024: [3210, 1980, 1740, 1150, 820],
            2025: [3390, 2210, 1810, 1220, 870],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- IN */
    {
      slug: "investigacion",
      code: "IN",
      name: "Investigación",
      summary: "Grupos, investigadores, semilleros y lo que producen.",
      description:
        "La capacidad de investigación de la universidad: grupos e investigadores reconocidos, semilleros de estudiantes y productos de nuevo conocimiento.",
      image: {
        src: "/datos-abiertos/investigacion.webp",
        alt: "Investigador observando una muestra en el microscopio",
        credit: CREDIT,
      },
      line: 6,
      keyIndicators: ["grupos", "investigadores", "productos", "semilleros"],
      indicators: [
        indicator({
          id: "grupos",
          label: "Grupos de investigación reconocidos",
          unit: "grupos",
          format: "entero",
          direction: "sube",
          definition: "Grupos con reconocimiento vigente en la convocatoria nacional de medición.",
          source: "Vicerrectoría de Investigaciones",
          values: summed({
            bucaramanga: [29, 30, 31, 33, 34],
            cucuta: [5, 6, 6, 7, 7],
            valledupar: [null, 1, 2, 2, 3],
          }),
        }),
        indicator({
          id: "investigadores",
          label: "Investigadores reconocidos",
          unit: "investigadores",
          format: "entero",
          direction: "sube",
          definition: "Docentes con categoría de investigador vigente.",
          source: "Vicerrectoría de Investigaciones",
          values: summed({
            bucaramanga: [118, 126, 134, 141, 149],
            cucuta: [17, 20, 22, 25, 28],
            valledupar: [null, 3, 5, 7, 9],
          }),
        }),
        indicator({
          id: "productos",
          label: "Productos de nuevo conocimiento",
          unit: "productos",
          format: "entero",
          direction: "sube",
          definition: "Artículos, libros, capítulos, patentes y software registrados en el año.",
          source: "Vicerrectoría de Investigaciones",
          values: summed({
            bucaramanga: [318, 342, 371, 398, 421],
            cucuta: [44, 52, 61, 69, 76],
            valledupar: [6, 9, 13, 17, 23],
          }),
        }),
        indicator({
          id: "semilleros",
          label: "Semilleros de investigación",
          unit: "semilleros",
          format: "entero",
          direction: "sube",
          definition: "Semilleros activos con estudiantes inscritos y plan de trabajo aprobado.",
          source: "Vicerrectoría de Investigaciones",
          values: summed({
            bucaramanga: [78, 84, 89, 93, 98],
            cucuta: [16, 18, 21, 23, 25],
            valledupar: [4, 5, 7, 8, 9],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "categoria",
          title: "Grupos por categoría",
          unit: "grupos",
          format: "entero",
          source: "Vicerrectoría de Investigaciones",
          values: byYear(["A1", "A", "B", "C", "Reconocido"], {
            2024: [3, 7, 12, 14, 6],
            2025: [4, 8, 13, 14, 5],
          }),
        }),
        breakdown({
          id: "tipo-producto",
          title: "Productos por tipo",
          unit: "productos",
          format: "entero",
          source: "Vicerrectoría de Investigaciones",
          values: byYear(["Artículos", "Libros y capítulos", "Ponencias", "Software y registros", "Patentes"], {
            2024: [252, 71, 132, 23, 6],
            2025: [271, 78, 139, 29, 3],
          }),
        }),
      ],
      note: "Valledupar no tenía grupos reconocidos antes de 2022: la casilla de 2021 queda sin reportar, no en cero.",
    },

    /* ----------------------------------------------------------------- IF */
    {
      slug: "infraestructura",
      code: "IF",
      name: "Infraestructura Física y Tecnológica",
      summary: "Los espacios y la tecnología donde ocurre la universidad.",
      description:
        "Área construida, laboratorios y talleres, aulas equipadas, conectividad y equipos de cómputo disponibles para la comunidad.",
      image: {
        src: "/datos-abiertos/infraestructura.webp",
        alt: "Edificio de aulas de la universidad rodeado de vegetación",
        credit: CREDIT,
      },
      line: 7,
      keyIndicators: ["area", "laboratorios", "aulas-tic", "ancho-banda"],
      indicators: [
        indicator({
          id: "area",
          label: "Área construida",
          unit: "m²",
          format: "entero",
          direction: "sube",
          definition: "Metros cuadrados construidos en uso académico y administrativo.",
          source: "Planta Física",
          values: summed({
            bucaramanga: [96400, 98200, 101300, 103900, 106200],
            cucuta: [21800, 22400, 23900, 24600, 25300],
            valledupar: [8200, 8900, 9600, 10400, 11100],
          }),
        }),
        indicator({
          id: "laboratorios",
          label: "Laboratorios y talleres",
          unit: "espacios",
          format: "entero",
          direction: "sube",
          definition: "Laboratorios, talleres y centros de simulación en funcionamiento.",
          source: "Planta Física",
          values: summed({
            bucaramanga: [112, 116, 121, 126, 129],
            cucuta: [28, 30, 32, 34, 36],
            valledupar: [11, 13, 16, 18, 21],
          }),
        }),
        indicator({
          id: "aulas-tic",
          label: "Aulas con tecnología audiovisual",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Aulas con proyección, audio y conexión para clase híbrida sobre el total de aulas.",
          source: "Dirección TIC",
          values: reported({
            todas: [74.0, 79.5, 84.2, 88.1, 91.3],
            bucaramanga: [78.2, 83.0, 87.4, 90.6, 93.1],
            cucuta: [69.5, 75.1, 80.3, 85.2, 89.4],
            valledupar: [58.3, 66.0, 72.8, 79.5, 85.0],
          }),
        }),
        indicator({
          id: "ancho-banda",
          label: "Ancho de banda contratado",
          unit: "Mbps",
          format: "entero",
          direction: "sube",
          definition: "Capacidad de conexión a internet contratada por la universidad.",
          source: "Dirección TIC",
          values: summed({
            bucaramanga: [1200, 1500, 1800, 2000, 2200],
            cucuta: [300, 400, 500, 600, 650],
            valledupar: [100, 150, 200, 300, 350],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "espacios",
          title: "Espacios por uso",
          unit: "espacios",
          format: "entero",
          source: "Planta Física",
          values: byYear(["Aulas", "Laboratorios y talleres", "Salas de cómputo", "Auditorios", "Escenarios deportivos", "Bibliotecas"], {
            2024: [312, 178, 46, 14, 11, 4],
            2025: [318, 186, 48, 14, 12, 4],
          }),
        }),
        breakdown({
          id: "equipos",
          title: "Equipos de cómputo por uso",
          unit: "equipos",
          format: "entero",
          source: "Dirección TIC",
          values: byYear(["Salas y laboratorios", "Docentes", "Administrativos", "Bibliotecas"], {
            2024: [2140, 810, 690, 160],
            2025: [2290, 860, 705, 170],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- SO */
    {
      slug: "sostenible",
      code: "SO",
      name: "UDES Sostenible",
      summary: "Energía, agua, residuos y áreas verdes de los campus.",
      description:
        "La gestión ambiental de la universidad en cifras: consumo de energía y agua, fuentes renovables, residuos aprovechados y conservación de áreas verdes.",
      image: {
        src: "/datos-abiertos/sostenible.webp",
        alt: "Ladera del campus con el letrero UDES Verde formado por vegetación",
        credit: CREDIT,
      },
      line: 8,
      keyIndicators: ["renovable", "residuos", "agua", "areas-verdes"],
      indicators: [
        indicator({
          id: "renovable",
          label: "Energía de fuentes renovables",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Energía consumida que proviene de generación solar propia sobre el consumo total.",
          source: "Sistema de Gestión Ambiental",
          values: reported({
            todas: [4.2, 7.8, 11.5, 15.1, 18.4],
            bucaramanga: [5.1, 9.2, 13.0, 16.8, 20.1],
            cucuta: [2.0, 5.4, 9.8, 13.2, 16.9],
            valledupar: [null, null, 4.1, 8.6, 12.7],
          }),
        }),
        indicator({
          id: "residuos",
          label: "Residuos aprovechados",
          unit: "toneladas",
          format: "entero",
          direction: "sube",
          definition: "Toneladas de residuos entregadas a reciclaje o compostaje.",
          source: "Sistema de Gestión Ambiental",
          values: summed({
            bucaramanga: [41, 48, 55, 62, 68],
            cucuta: [9, 12, 14, 16, 19],
            valledupar: [2, 4, 6, 7, 9],
          }),
        }),
        indicator({
          id: "agua",
          label: "Consumo de agua por persona",
          unit: "m³ al año",
          format: "decimal",
          direction: "baja",
          definition: "Metros cúbicos de agua consumidos en los campus divididos entre la comunidad universitaria.",
          source: "Sistema de Gestión Ambiental",
          values: reported({
            todas: [5.3, 5.0, 4.7, 4.4, 4.2],
            bucaramanga: [5.1, 4.8, 4.5, 4.3, 4.1],
            cucuta: [5.6, 5.3, 5.0, 4.6, 4.4],
            valledupar: [6.0, 5.7, 5.2, 4.9, 4.6],
          }),
        }),
        indicator({
          id: "areas-verdes",
          label: "Áreas verdes conservadas",
          unit: "hectáreas",
          format: "decimal",
          direction: "sube",
          definition: "Hectáreas de bosque, ladera y zonas verdes bajo manejo de conservación.",
          source: "Sistema de Gestión Ambiental",
          values: summed({
            bucaramanga: [24.5, 24.5, 26.0, 27.2, 28.1],
            cucuta: [2.1, 2.1, 2.4, 2.6, 2.8],
            valledupar: [0.8, 0.9, 1.1, 1.3, 1.5],
          }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "tipo-residuo",
          title: "Residuos aprovechados por tipo",
          unit: "toneladas",
          format: "entero",
          source: "Sistema de Gestión Ambiental",
          values: byYear(["Papel y cartón", "Orgánicos para compostaje", "Plásticos", "Vidrio", "Metales"], {
            2024: [31, 26, 16, 8, 4],
            2025: [33, 31, 18, 9, 5],
          }),
        }),
        breakdown({
          id: "emisiones",
          title: "Emisiones por fuente",
          unit: "t CO₂e",
          format: "entero",
          source: "Sistema de Gestión Ambiental",
          values: byYear(["Energía eléctrica", "Transporte", "Combustibles en campus", "Residuos"], {
            2024: [1840, 1210, 320, 140],
            2025: [1690, 1180, 295, 128],
          }),
        }),
      ],
    },

    /* ----------------------------------------------------------------- PD */
    {
      slug: "plan-desarrollo",
      code: "PD",
      name: "Plan de Desarrollo Institucional",
      summary: "Cómo avanza el PDI 2024-2028 en sus seis pilares.",
      description:
        "El avance del Plan de Desarrollo Institucional 2024-2028: cumplimiento por pilar, indicadores cumplidos y proyectos en ejecución. El detalle completo vive en el Portal PDI.",
      image: {
        src: "/datos-abiertos/plan-desarrollo.webp",
        alt: "Dos estudiantes de ingeniería revisando planos frente a un tablero",
        credit: CREDIT,
      },
      line: 9,
      keyIndicators: ["avance-plan", "indicadores-cumplidos", "proyectos", "lineas"],
      indicators: [
        indicator({
          id: "avance-plan",
          label: "Avance del plan",
          unit: "%",
          format: "porcentaje",
          direction: "sube",
          definition: "Cumplimiento acumulado ponderado sobre los cinco años del horizonte del plan.",
          source: "Planeación Institucional",
          values: reported({
            todas: [null, null, null, 17.0, 31.4],
            bucaramanga: [null, null, null, 17.8, 32.6],
            cucuta: [null, null, null, 16.1, 30.2],
            valledupar: [null, null, null, 15.2, 28.9],
          }),
        }),
        indicator({
          id: "indicadores-cumplidos",
          label: "Indicadores cumplidos",
          unit: "indicadores",
          format: "entero",
          direction: "sube",
          definition: "Indicadores de resultado que alcanzaron su meta del año.",
          source: "Planeación Institucional",
          values: reported({ todas: [null, null, null, 38, 61] }),
        }),
        indicator({
          id: "proyectos",
          label: "Proyectos en ejecución",
          unit: "proyectos",
          format: "entero",
          direction: "neutro",
          definition: "Proyectos del plan con actividades en curso durante el año.",
          source: "Planeación Institucional",
          values: reported({ todas: [null, null, null, 42, 57] }),
        }),
        indicator({
          id: "lineas",
          label: "Líneas de acción",
          unit: "líneas",
          format: "entero",
          direction: "neutro",
          definition: "Líneas de acción del documento aprobado del plan.",
          source: "Planeación Institucional",
          values: reported({ todas: [null, null, null, 61, 61] }),
        }),
      ],
      breakdowns: [
        breakdown({
          id: "pilar",
          title: "Avance por pilar",
          unit: "%",
          format: "porcentaje",
          source: "Planeación Institucional",
          values: byYear(
            ["Personalización", "Ambiente tecnológico", "Entorno emprendedor", "Gobernanza para el buen gobierno", "Sostenibilidad", "Apropiación social"],
            {
              2024: [18.2, 15.6, 12.4, 21.0, 16.8, 17.9],
              2025: [34.1, 29.8, 24.6, 36.2, 31.0, 32.5],
            },
          ),
        }),
      ],
      note: "El plan empezó en 2024: los años anteriores no existen para este informe y se muestran sin reportar. Las cifras reales se conectarán al avance en cascada del Portal PDI.",
    },
  ],
};

