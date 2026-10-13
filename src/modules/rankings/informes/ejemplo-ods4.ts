/* =============================================================================
   Informes ODS con Pilo · un informe de ejemplo del ODS 4 (2025), con textos
   reales de las notas de udes.edu.co. Solo lo usan las pruebas y las capturas:
   ninguna pantalla lo importa.
   ========================================================================== */

import type { Bloque, CifraNota, EleccionIndicador, Foto, ImagenNota, InformeCompleto, RegistroActividad } from "./tipos";

const R = "inf-4-2025";
const IMG = (k: string) => `https://udes.edu.co/images/noticias/2025/${k}.jpg`;

export const NOTAS_EJEMPLO = [
  {
    id: "recolector",
    url: "https://udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad",
    title: "«El Recolector» llevó la cultura del reciclaje a la Institución Educativa La Libertad",
    title_en: "“El Recolector” brought a recycling culture to the La Libertad school",
    excerpt_en: "More than 400 secondary students took part in workshops on recyclable waste.",
    excerpt: "Más de 400 estudiantes de bachillerato participaron en talleres sobre residuos reciclables.",
    body: "En los meses de febrero y marzo de 2025, la Institución Educativa La Libertad de Bucaramanga fue sede de jornadas de sensibilización y capacitación del proyecto El Recolector, liderada por el programa de Instrumentación Quirúrgica. A lo largo de los talleres, más de 400 estudiantes de bachillerato participaron junto con sus docentes, con el apoyo de un representante de la empresa Veolia.",
    image_url: IMG("recolector"),
    published_on: "2025-03-28",
    section: "Comunicaciones",
    campus: "Bucaramanga",
    score: 88,
    reason: "Divulgación educativa en un colegio",
  },
  {
    id: "mutis",
    url: "https://udes.edu.co/comunicaciones/noticias/medicina-familiar-mutis",
    title: "Residentes de Medicina Familiar llevan educación sexual al Colegio José Celestino Mutis",
    excerpt: "El proyecto ha vinculado a 271 personas entre profesores y estudiantes.",
    body: "Los residentes de la especialización de Medicina Familiar lideran un proyecto que ha vinculado a 271 personas, incluyendo profesores y estudiantes de pregrado de Medicina, para el acceso a información confiable sobre métodos de planificación familiar.",
    image_url: IMG("mutis"),
    published_on: "2025-09-10",
    section: "Salud",
    campus: "Bucaramanga",
    score: 74,
    reason: "Educación en salud en un colegio",
  },
  {
    id: "diplomado",
    url: "https://udes.edu.co/extension/noticias/diplomado-linfedema",
    title: "Tercera cohorte del Diplomado en Técnicas de Terapia Física para el Tratamiento del Linfedema",
    excerpt: "Profesionales de Costa Rica, El Salvador y Colombia, en modalidad híbrida.",
    body: "La Universidad de Santander (UDES), a través de la oficina de Educación Continua, realizó la tercera cohorte del diplomado, realizada entre el 15 de septiembre y el 25 de octubre, con profesionales de Costa Rica, El Salvador y diversas ciudades de Colombia, en modalidad híbrida y con una intensidad de 80 horas.",
    image_url: IMG("diplomado"),
    published_on: "2025-10-30",
    section: "Extensión",
    campus: "Bucaramanga",
    score: 70,
    reason: "Formación para profesionales",
  },
];

const bloque = (id: string, sec: Bloque["sec"], pos: number, origin: Bloque["origin"], text: string, sources: Bloque["sources"] = [], figs: Bloque["figs"] = [], extra: Partial<Bloque> = {}): Bloque => ({
  id,
  report_id: R,
  sec,
  pos,
  origin,
  text,
  orig: text,
  sources,
  figs,
  warn: null,
  enabled: true,
  spare: false,
  ...extra,
});

export const BLOQUES_EJEMPLO: Bloque[] = [
  bloque("b1", "tesis", 1, "persona", "La UDES forma maestros y abre la universidad a quienes son los primeros de su familia en llegar."),
  bloque("b2", "cifras", 1, "persona", "Dos cifras del informe 2025 sostienen esta tesis.", [], [
    { v: "16.030", label: "personas beneficiadas por Proyección Social", src: "Informe 2025" },
    { v: "20,09 %", label: "de egresados calificados para la docencia", src: "Informe 2025" },
  ]),
  bloque(
    "b3",
    "cifras",
    2,
    "pilo",
    "Las noticias de 2025 aportan más cifras: más de 400 estudiantes de bachillerato y 271 personas vinculadas.",
    [
      { news_id: "recolector", quote: "más de 400 estudiantes de bachillerato" },
      { news_id: "mutis", quote: "ha vinculado a 271 personas" },
    ],
    [
      { v: "400", label: "estudiantes de bachillerato", src: "El Recolector" },
      { v: "271", label: "personas vinculadas", src: "Colegio Mutis" },
    ],
  ),
  bloque(
    "b4",
    "hicimos",
    1,
    "pilo",
    "Entre febrero y marzo, la Institución Educativa La Libertad, en Bucaramanga, se volvió un aula de reciclaje: más de 400 estudiantes de bachillerato aprendieron con el programa de Instrumentación Quirúrgica y con la empresa Veolia cómo clasificar y aprovechar los residuos.",
    [
      { news_id: "recolector", quote: "En los meses de febrero y marzo de 2025, la Institución Educativa La Libertad de Bucaramanga fue sede" },
      { news_id: "recolector", quote: "más de 400 estudiantes de bachillerato" },
      { news_id: "recolector", quote: "representante de la empresa Veolia" },
    ],
    [],
    {
      heading: "Educación en los colegios",
      heading_en: "Education in schools",
      text_en:
        "Between February and March, the La Libertad school in Bucaramanga became a recycling classroom: more than 400 secondary students learned with the Surgical Instrumentation programme and the company Veolia how to sort and reuse waste.",
    },
  ),
  bloque(
    "b5",
    "hicimos",
    2,
    "editado",
    "Los residentes de Medicina Familiar también salen a la escuela. En el Colegio José Celestino Mutis vincularon a 271 personas, entre profesores y estudiantes de pregrado de Medicina, para llevar información confiable sobre planificación familiar.",
    [
      { news_id: "mutis", quote: "ha vinculado a 271 personas, incluyendo profesores y estudiantes de pregrado de Medicina" },
      { news_id: "mutis", quote: "información confiable sobre métodos de planificación familiar" },
    ],
    [],
    { heading: "Educación en los colegios", heading_en: "Education in schools" },
  ),
  bloque(
    "b6",
    "hicimos",
    3,
    "pilo",
    "Para quienes ya ejercen, la UDES ofrece formación continua: la tercera cohorte del diplomado en linfedema, de 80 horas y modalidad híbrida, reunió a profesionales de Costa Rica, El Salvador y varias ciudades de Colombia.",
    [
      { news_id: "diplomado", quote: "modalidad híbrida y con una intensidad de 80 horas" },
      { news_id: "diplomado", quote: "profesionales de Costa Rica, El Salvador y diversas ciudades de Colombia" },
    ],
    [],
    { heading: "Formación continua" },
  ),
  bloque("b7", "hicimos", 4, "pilo", "Un párrafo de reserva que Pilo preparó con una nota sin usar.", [], [], { enabled: false, spare: true }),
  bloque("b10", "hicimos", 5, "persona", "Texto repetido del informe del ODS 1 que la importación dejó fuera.", [], [], { enabled: false, warn: "Texto repetido de otro ODS: revisa si corresponde a este." }),
  bloque("b8", "proyectos", 1, "pilo", "El Recolector. El programa de Instrumentación Quirúrgica enseña a la comunidad escolar a clasificar y aprovechar los residuos reciclables.", [
    { news_id: "recolector", quote: "El Recolector" },
  ]),
  bloque("b9", "viene", 1, "persona", "La UDES prevé seguir reduciendo las barreras de acceso para la primera generación."),
];

const foto = (news_id: string, slot: Foto["slot"], extra: Partial<Foto> = {}): Foto => ({
  report_id: R,
  news_id,
  use: true,
  slot,
  caption: `Pie de la foto de ${news_id}.`,
  alt: `Lo que se ve en la foto de ${news_id}.`,
  credit: "Oficina de Comunicaciones UDES",
  kind: "foto",
  minors: false,
  cleared: false,
  crop: { fx: 0.5, fy: 0.4, ratio: "16:9" },
  ...extra,
});

export const FOTOS_EJEMPLO: Foto[] = [
  foto("recolector", "portada", { crop: { fx: 0.3, fy: 0.25, ratio: "3:1" } }),
  foto("mutis", "n1", { crop: { fx: 0.62, fy: 0.4, ratio: "4:3" } }),
  foto("diplomado", "galeria", { minors: true, cleared: false, use: false }),
];

export const ELECCIONES_EJEMPLO: EleccionIndicador[] = [
  {
    report_id: R,
    indicator: "4.3.4",
    news_id: "recolector",
    candidates: [
      { news_id: "recolector", rel: "s", why: "Más de 400 estudiantes, dos meses de talleres, aliado externo y objetivo claro.", flags: [] },
      { news_id: "mutis", rel: "g", why: "Educación en salud en un colegio; no queda claro que sea divulgación programada.", flags: ["Revisa la fecha de la actividad."] },
    ],
    ask: {},
    page_es: [
      "En los meses de febrero y marzo de 2025, la Institución Educativa La Libertad de Bucaramanga fue sede de jornadas de sensibilización y capacitación del proyecto El Recolector.",
      "A lo largo de los talleres, más de 400 estudiantes de bachillerato participaron junto con sus docentes.",
    ],
    page_en:
      "From February to March 2025, the Institución Educativa La Libertad in Bucaramanga hosted awareness and training sessions under the project “El Recolector” of the Universidad de Santander (UDES). More than 400 secondary students took part.",
    approved: false,
  },
];

export const INFORME_EJEMPLO: InformeCompleto = {
  informe: { id: R, ods: 4, edition: 2025, state: "borrador", settings: { tone: "cercano", person: "tercera" }, updated_at: "2026-10-13T15:00:00Z" },
  bloques: BLOQUES_EJEMPLO,
  fotos: FOTOS_EJEMPLO,
  elecciones: ELECCIONES_EJEMPLO,
};

export const IMAGENES_EJEMPLO: ImagenNota[] = [
  { id: "img-rec-1", news_id: "recolector", url: IMG("recolector"), width: 1200, height: 400, caption: "Jornada en La Libertad.", credit: "Comunicaciones UDES", pos: 0, is_cover: true, kind: "foto", minors: false, alt: "Estudiantes con uniforme gris." },
  { id: "img-rec-2", news_id: "recolector", url: IMG("recolector-2"), width: 800, height: 1100, caption: "Afiche del taller.", credit: "Comunicaciones UDES", pos: 1, is_cover: false, kind: "grafica", minors: false, alt: "Afiche con el texto «El Recolector»." },
  { id: "img-mutis-1", news_id: "mutis", url: IMG("mutis"), width: 1200, height: 400, caption: "", credit: "", pos: 0, is_cover: true, kind: "foto", minors: false, alt: "" },
  { id: "img-dip-1", news_id: "diplomado", url: IMG("diplomado"), width: 1200, height: 400, caption: "", credit: "Educación Continua", pos: 0, is_cover: true, kind: "foto", minors: true, alt: "" },
];

export const CIFRAS_EJEMPLO: CifraNota[] = [
  { id: "c1", news_id: "recolector", value: "400", num: 400, unit: "estudiantes", label: "estudiantes de bachillerato", quote: "más de 400 estudiantes de bachillerato", kind: "personas", score: 0.9, checked: true },
  { id: "c2", news_id: "mutis", value: "271", num: 271, unit: "personas", label: "personas vinculadas", quote: "ha vinculado a 271 personas", kind: "personas", score: 0.8, checked: true },
  { id: "c3", news_id: "diplomado", value: "80 horas", num: 80, unit: "horas", label: "de formación", quote: "con una intensidad de 80 horas", kind: "horas", score: 0, checked: false },
];

export const REGISTRO_EJEMPLO: RegistroActividad[] = [
  { news_id: "recolector", published_on: "2025-03-28", campus: "Bucaramanga", section: "Comunicaciones", title: NOTAS_EJEMPLO[0].title, title_en: NOTAS_EJEMPLO[0].title_en ?? "", url: NOTAS_EJEMPLO[0].url, figure_value: "400", figure_label: "estudiantes de bachillerato", en_narrativa: true },
  { news_id: "otra", published_on: "2025-06-02", campus: "Cúcuta", section: "Extensión", title: "Nota que solo está en el registro", title_en: "", url: "https://udes.edu.co/x", figure_value: null, figure_label: null, en_narrativa: false },
];
