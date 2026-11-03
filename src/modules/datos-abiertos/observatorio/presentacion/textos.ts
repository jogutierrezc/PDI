/* =============================================================================
   Presentación Institucional · textos de la página, en español y en inglés.

   La página es fija y está hecha en código: estos son sus textos (los de la
   propuesta aprobada). El idioma lo elige LangSwitch con el mismo mecanismo
   del resto del portal (`?lang=` + localStorage, modules/sostenible/i18n.ts).
   `EN` se declara como `Textos`: si falta una clave, tsc lo dice.
   ========================================================================== */

export type Idioma = "es" | "en";

const ES = {
  titulo_pagina: "Presentación Institucional | Observatorio de Analítica Académica",
  idioma: "Idioma / Language",
  h1a: "Observatorio de Analítica Académica UDES",
  h1b: "Datos que transforman trayectorias en excelencia",
  lead: "Más que un repositorio estadístico, somos el motor de inteligencia académica de la Universidad de Santander. Articulamos el diagnóstico riguroso, la intervención oportuna y la mejora continua para acompañar cada etapa del estudiante —desde su perfil de ingreso hasta su impacto como graduado—, garantizando decisiones basadas en evidencia, transparencia y alta calidad multicampus.",
  cta1: "Explorar el ciclo de vida estudiantil",
  cta2: "Consultar cifras de calidad e informes PDI",
  firma: "Vicerrectoría de Enseñanza · Inteligencia Institucional y Buen Gobierno",
  tablero: "Pulso institucional en vivo",
  ilus: "Datos ilustrativos",
  ilus2: "Cifras de ejemplo del Observatorio; cada tablero publicará su corte y su procedencia.",
  ilus3: "Las cifras de esta página son de ejemplo y no tienen corte oficial. Con datos reales, cada tablero dirá de dónde sale y a qué corte corresponde.",
  pulso_aria: "Pulso UDES",
  p1t: "Alta calidad multicampus",
  p1: "Seguimiento integral alineado con el Plan de Desarrollo Institucional y estándares internacionales (QS / EQUAA).",
  p2t: "360° en el ciclo estudiantil",
  p2: "Monitoreo desde pruebas Saber 11 hasta inserción en el Observatorio Laboral (OLE).",
  p3t: "Éxito y permanencia",
  p3: "Sistemas de alertas tempranas y acompañamiento focalizado (Saber 50 % y 75 %).",
  mh: "De la medición estática a la inteligencia accionable",
  mp: "En la UDES entendemos que detrás de cada cifra hay un proyecto de vida. El Observatorio nace para integrar y articular los procesos de evaluación académica bajo un modelo cíclico de tres pilares que aseguran el buen gobierno universitario y la rendición de cuentas a la sociedad:",
  a1: "Comprender",
  a1t: "Diagnóstico preciso",
  a1p: "Caracterizamos las condiciones de entrada, el contexto socioeconómico y el perfil cognitivo de nuestra comunidad estudiantil y profesoral para establecer líneas base reales por cada campus y programa.",
  a2: "Actuar",
  a2t: "Intervención oportuna",
  a2p: "Convertimos los datos en alertas tempranas. Identificamos factores asociados al rendimiento y activamos rutas de acompañamiento académico, financiero y de bienestar antes de que el riesgo se convierta en deserción.",
  a3: "Transformar",
  a3t: "Mejora continua",
  a3p: "Evaluamos el valor agregado que la UDES aporta al aprendizaje de sus estudiantes, su éxito en pruebas de Estado (Saber Pro) y su competitividad laboral, retroalimentando la planeación curricular y el desarrollo profesoral.",
  jh: "Explora nuestro ecosistema de consulta analítica",
  jp: "Navega por nuestras líneas de estudio organizadas según la trayectoria real del estudiante y las capacidades institucionales que la soportan. Selecciona cualquier módulo para desplegar su tablero interactivo detallado.",
  dh: "Transparencia y cultura de datos para la toma de decisiones",
  dp: "Accede a nuestros boletines ejecutivos, estudios técnicos y documentos estratégicos que conectan la analítica académica con la ruta del Plan de Desarrollo Institucional (PDI 2024-2028).",
  credito: "Oficina de Planeación Institucional · Vicerrectoría de Enseñanza · Universidad de Santander",
  estacion: "Estación",
  ver: "Ver tablero",
  previo: "Corte anterior",
  sin_previo: "Sin corte anterior",
  ilustrativo: "Dato ilustrativo",
  pendiente: "Por cargar",
  sin_corte: "Aún sin corte",
  baja: "Por publicar",
} as const;

export type Textos = { [K in keyof typeof ES]: string };

const EN: Textos = {
  titulo_pagina: "Institutional Presentation | Academic Analytics Observatory",
  idioma: "Idioma / Language",
  h1a: "UDES Academic Analytics Observatory",
  h1b: "Data that turns trajectories into excellence",
  lead: "More than a statistical repository, we are the academic intelligence engine of the Universidad de Santander. We connect rigorous diagnosis, timely intervention and continuous improvement to accompany every stage of the student's journey, from entry profile to impact as a graduate, ensuring evidence-based decisions, transparency and high multicampus quality.",
  cta1: "Explore the student life cycle",
  cta2: "See quality figures and PDI reports",
  firma: "Vice-Rectorate of Teaching · Institutional Intelligence and Good Governance",
  tablero: "Live institutional pulse",
  ilus: "Illustrative data",
  ilus2: "Sample figures from the Observatory; each dashboard will publish its cut and its source.",
  ilus3: "The figures on this page are samples with no official cut. With real data, each dashboard will say where it comes from and which cut it belongs to.",
  pulso_aria: "UDES pulse",
  p1t: "Multicampus high quality",
  p1: "Comprehensive follow-up aligned with the Institutional Development Plan and international standards (QS / EQUAA).",
  p2t: "360° of the student cycle",
  p2: "Monitoring from Saber 11 tests to labor-market insertion tracked by the Labor Observatory (OLE).",
  p3t: "Success and retention",
  p3: "Early-warning systems and targeted support (Saber 50% and 75%).",
  mh: "From static measurement to actionable intelligence",
  mp: "At UDES we understand that behind every figure there is a life project. The Observatory was created to integrate and articulate academic evaluation processes under a cyclical model of three pillars that ensure good university governance and accountability to society:",
  a1: "Understand",
  a1t: "Precise diagnosis",
  a1p: "We characterize entry conditions, socioeconomic context and the cognitive profile of our student and faculty community to set real baselines for each campus and program.",
  a2: "Act",
  a2t: "Timely intervention",
  a2p: "We turn data into early warnings. We identify factors associated with performance and activate academic, financial and wellbeing support routes before risk becomes dropout.",
  a3: "Transform",
  a3t: "Continuous improvement",
  a3p: "We evaluate the value UDES adds to student learning, success in state exams (Saber Pro) and labor competitiveness, feeding back into curricular planning and faculty development.",
  jh: "Explore our analytical query ecosystem",
  jp: "Browse our lines of study, organized by the real student trajectory and the institutional capabilities that support it. Select any module to open its detailed interactive dashboard.",
  dh: "Transparency and a data culture for decision-making",
  dp: "Access our executive bulletins, technical studies and strategic documents that connect academic analytics with the roadmap of the Institutional Development Plan (PDI 2024-2028).",
  credito: "Institutional Planning Office · Vice-Rectorate of Teaching · Universidad de Santander",
  estacion: "Station",
  ver: "View dashboard",
  previo: "Previous cut",
  sin_previo: "No previous cut",
  ilustrativo: "Illustrative data",
  pendiente: "To be loaded",
  sin_corte: "No cut yet",
  baja: "To be published",
};

const ES_T: Textos = ES;

export const TEXTOS: Record<Idioma, Textos> = { es: ES_T, en: EN };
