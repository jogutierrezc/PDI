/* =============================================================================
   Presentación Institucional · estaciones, módulos y salidas (en ES y EN).

   Los textos son los de la propuesta aprobada. Las cifras NO están aquí: salen
   de OBS_TOPICS (data.ts) o, si el tema ya publicó, de lo publicado (live.ts).
   ========================================================================== */

import type { Idioma } from "./textos";

type Bi<T> = Record<Idioma, T>;

export interface Estacion {
  romano: string;
  textos: Bi<{ t: string; q: string; p: string }>;
}

export const ESTACIONES: Estacion[] = [
  {
    romano: "I",
    textos: {
      es: { t: "Acceso, identidad y territorio", q: "¿Quiénes somos y quiénes llegan?", p: "Comprendemos la diversidad de quienes eligen la UDES, analizando nuestra oferta educativa frente a las demandas de las regiones donde hacemos presencia." },
      en: { t: "Access, identity and territory", q: "Who are we, and who arrives?", p: "We understand the diversity of those who choose UDES by analyzing our educational offer against the demands of the regions where we are present." },
    },
  },
  {
    romano: "II",
    textos: {
      es: { t: "Permanencia, acompañamiento y éxito académico", q: "¿Cómo cuidamos su proceso?", p: "Ningún estudiante camina solo. Monitoreamos de cerca los factores que inciden en el desempeño para activar redes de apoyo académico, tutorías (Saber 50 %, Saber 75 %, FCEFN), bienestar y apoyos financieros." },
      en: { t: "Retention, support and academic success", q: "How do we look after their progress?", p: "No student walks alone. We closely monitor the factors that affect performance to activate networks of academic support, tutoring (Saber 50%, Saber 75%, FCEFN), wellbeing and financial aid." },
    },
  },
  {
    romano: "III",
    textos: {
      es: { t: "Capacidad institucional y entorno global", q: "¿Qué respalda su formación?", p: "La calidad académica se sostiene sobre un cuerpo profesoral de alto nivel, una cultura investigativa activa y una visión conectada con el mundo." },
      en: { t: "Institutional capacity and global context", q: "What stands behind their education?", p: "Academic quality rests on a high-level faculty, an active research culture and a vision connected to the world." },
    },
  },
  {
    romano: "IV",
    textos: {
      es: { t: "Logro educativo, valor agregado e impacto social", q: "¿Qué huella dejamos?", p: "Medimos la transformación real que vive el estudiante durante su paso por la universidad y su capacidad para liderar e insertarse con éxito en el mercado laboral." },
      en: { t: "Educational achievement, value added and social impact", q: "What mark do we leave?", p: "We measure the real transformation students experience during their time at the university and their ability to lead and enter the labor market successfully." },
    },
  },
];

export interface Modulo {
  /** Código de dos letras (el del tema en data.ts). */
  id: string;
  /** Slug del tema en el Observatorio; null: aún no tiene tema. */
  slug: string | null;
  estacion: number;
  /** Línea de color 1-11 (--od-line-N). */
  linea: number;
  /** Columnas del cartel en la rejilla de 12. */
  span: number;
  ancho?: boolean;
  textos: Bi<{ n: string; d: string; i: string }>;
}

export const MODULOS: Modulo[] = [
  { id: "OA", slug: "oferta-academica", estacion: 0, linea: 2, span: 7, textos: {
    es: { n: "Oferta Académica", d: "Evolución y pertinencia de nuestros programas de pregrado, posgrado y formación tecnológica en modalidad presencial y virtual.", i: "Programas con registro vigente" },
    en: { n: "Academic Offering", d: "Evolution and relevance of our undergraduate, postgraduate and technological programs, in-person and virtual.", i: "Programs with current registration" } } },
  { id: "PB", slug: "poblacion-estudiantil", estacion: 0, linea: 3, span: 5, textos: {
    es: { n: "Población Estudiantil UDES", d: "Dinámica histórica de inscritos, admitidos, matriculados de primer curso y población total activa por campus.", i: "Estudiantes matriculados" },
    en: { n: "UDES Student Population", d: "Historical dynamics of applicants, admitted students, first-year enrollees and total active population by campus.", i: "Enrolled students" } } },
  { id: "CE", slug: "caracterizacion-estudiante", estacion: 0, linea: 11, span: 5, textos: {
    es: { n: "Caracterización del Estudiante", d: "Perfil de acceso, análisis de puntajes de ingreso (Saber 11) y variables sociodemográficas de nuestra comunidad.", i: "Respuestas a la caracterización" },
    en: { n: "Student Characterization", d: "Access profile, analysis of entry scores (Saber 11) and sociodemographic variables of our community.", i: "Characterization responses" } } },
  { id: "DE", slug: "diversidad-equidad-inclusion", estacion: 0, linea: 10, span: 7, textos: {
    es: { n: "Diversidad, Equidad e Inclusión", d: "Medición del Índice de Educación Inclusiva (INES-SNIES), cierre de brechas y participación de poblaciones de especial protección.", i: "Estudiantes de grupos especiales" },
    en: { n: "Diversity, Equity and Inclusion", d: "Measurement of the Inclusive Education Index (INES-SNIES), gap closing and participation of specially protected populations.", i: "Students in special groups" } } },
  { id: "AT", slug: "alertas-tempranas", estacion: 1, linea: 6, span: 5, textos: {
    es: { n: "Alertas Tempranas", d: "Identificación predictiva y seguimiento de riesgos académicos, socioeconómicos y biopsicosociales en tiempo real.", i: "Alertas activas en el periodo" },
    en: { n: "Early Warnings", d: "Predictive identification and follow-up of academic, socioeconomic and biopsychosocial risks in real time.", i: "Active alerts this term" } } },
  { id: "FR", slug: "factores-rendimiento", estacion: 1, linea: 9, span: 7, textos: {
    es: { n: "Factores Asociados con el Rendimiento", d: "Cruce analítico de variables que impulsan o frenan el desempeño estudiantil, el uso de biblioteca y los apoyos institucionales.", i: "Estudiantes con promedio de 3,8 o más" },
    en: { n: "Factors Associated with Performance", d: "Analytical crossing of variables that drive or hold back student performance, library use and institutional support.", i: "Students with an average of 3.8 or higher" } } },
  { id: "DA", slug: "desercion-academica", estacion: 1, linea: 3, span: 12, ancho: true, textos: {
    es: { n: "Deserción Académica (SPADIES)", d: "Análisis de cohortes, tasas de retención y causas de abandono escolar para el diseño de políticas de permanencia.", i: "Deserción por periodo" },
    en: { n: "Academic Dropout (SPADIES)", d: "Cohort analysis, retention rates and causes of dropout to design retention policies.", i: "Dropout per term" } } },
  { id: "PR", slug: "profesores", estacion: 2, linea: 4, span: 12, ancho: true, textos: {
    es: { n: "Profesores", d: "Composición del cuerpo docente según modalidad de contratación, máximo nivel de formación, escalafón y dedicación.", i: "Profesores" },
    en: { n: "Faculty", d: "Composition of the teaching staff by contract type, highest level of education, rank and dedication.", i: "Faculty members" } } },
  { id: "IX", slug: "internacionalizacion", estacion: 2, linea: 1, span: 6, textos: {
    es: { n: "Internacionalización", d: "Indicadores de movilidad entrante y saliente, convenios activos, currículo global y cooperación académica internacional.", i: "Personas en movilidad" },
    en: { n: "Internationalization", d: "Indicators of incoming and outgoing mobility, active agreements, global curriculum and international academic cooperation.", i: "People in mobility" } } },
  { id: "CC", slug: "calidad-institucional", estacion: 2, linea: 5, span: 6, textos: {
    es: { n: "Cifras de Calidad Institucional", d: "Síntesis ejecutiva de indicadores de acreditación, semilleros de investigación, planeación académica y estándares de buen gobierno.", i: "Programas acreditados en alta calidad" },
    en: { n: "Institutional Quality Figures", d: "Executive summary of accreditation indicators, research seedbeds, academic planning and good-governance standards.", i: "Programs with high-quality accreditation" } } },
  { id: "VA", slug: "valor-agregado", estacion: 3, linea: 2, span: 5, textos: {
    es: { n: "Valor Agregado Académico", d: "Medición cuantitativa del progreso real del estudiante comparando sus competencias de ingreso (Saber 11) frente a las de egreso (Saber Pro).", i: "Programas con valor agregado positivo" },
    en: { n: "Academic Value Added", d: "Quantitative measure of real student progress, comparing entry competencies (Saber 11) with exit competencies (Saber Pro).", i: "Programs with positive value added" } } },
  // Sin tema todavía en el Observatorio: va sin enlace, «Por cargar».
  { id: "TG", slug: null, estacion: 3, linea: 4, span: 7, textos: {
    es: { n: "Tasa de Graduación UDES", d: "Eficiencia terminal y éxito en la titulación oportuna desagregada por cohorte, campus y programa académico.", i: "Tasa de graduación oportuna" },
    en: { n: "UDES Graduation Rate", d: "Terminal efficiency and on-time graduation success, broken down by cohort, campus and academic program.", i: "On-time graduation rate" } } },
  { id: "SG", slug: "seguimiento-graduados", estacion: 3, linea: 7, span: 7, textos: {
    es: { n: "Seguimiento de Graduados UDES", d: "Vínculo continuo con nuestros egresados, trayectoria posgradual y participación en la vida institucional.", i: "Graduados en el año" },
    en: { n: "UDES Graduate Follow-up", d: "Continuous link with our alumni, postgraduate trajectory and participation in institutional life.", i: "Graduates this year" } } },
  { id: "VL", slug: "vinculacion-laboral", estacion: 3, linea: 8, span: 5, textos: {
    es: { n: "Vinculación Laboral de Egresados (OLE)", d: "Tasas de empleabilidad, cotización e ingreso salarial de recién graduados según el Observatorio Laboral para la Educación.", i: "Tasa de vinculación formal" },
    en: { n: "Graduate Labor Linkage (OLE)", d: "Employability, contribution and salary rates of recent graduates according to the Labor Observatory for Education.", i: "Formal employment rate" } } },
];

/** Las seis filas del tablero «Pulso». */
export const PULSO = ["PB", "OA", "CC", "AT", "DA", "SG"] as const;

export interface Salida {
  /** Ruta real del portal; null donde aún no hay destino (se muestra sin enlace). */
  ruta: string | null;
  textos: Bi<{ t: string; d: string; a: string }>;
}

export const SALIDAS: Salida[] = [
  { ruta: "/datos-abiertos/boletines", textos: {
    es: { t: "Informes y documentos técnicos", d: "Estudios detallados de caracterización, informes de autoevaluación y boletines estadísticos periódicos listos para consulta y descarga.", a: "Abrir informes" },
    en: { t: "Technical reports and documents", d: "Detailed characterization studies, self-assessment reports and periodic statistical bulletins ready to consult and download.", a: "Open reports" } } },
  { ruta: null, textos: {
    es: { t: "Infografías y presentaciones ejecutivas", d: "Síntesis visuales de alto impacto diseñadas para consejos de facultad, comités curriculares y socialización con la comunidad universitaria.", a: "Ver infografías" },
    en: { t: "Infographics and executive presentations", d: "High-impact visual summaries designed for faculty councils, curriculum committees and outreach to the university community.", a: "See infographics" } } },
  { ruta: "/pdi", textos: {
    es: { t: "Articulación con el Plan de Desarrollo Institucional (PDI)", d: "Acceso directo a la versión ejecutiva y al seguimiento de metas estratégicas de enseñanza y calidad institucional.", a: "Ir al PDI 2024-2028" },
    en: { t: "Alignment with the Institutional Development Plan (PDI)", d: "Direct access to the executive version and to the tracking of strategic teaching and institutional quality goals.", a: "Go to PDI 2024-2028" } } },
];
