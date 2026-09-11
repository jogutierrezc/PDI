/* =============================================================================
   Portada · contenido editorial.

   Aquí vive solo lo que el PDI dice, no lo que la base de datos mide. El avance,
   los indicadores y los documentos siguen llegando de Supabase; los lemas, la
   narrativa de cada pilar, la vocación de cada sede y las cifras del diagnóstico
   son texto del plan y se editan en este archivo.

   Los pilares se referencian por `slug`, el mismo que usa la tabla `pillars`:
   si la base cambia un nombre o un color, la narrativa lo sigue sin tocar nada.
   ========================================================================== */

import type { IconName } from "../../components/ui/Icon";

/* =============================================================================
   A · Barra de contexto
   Cifras del diagnóstico que explican por qué el plan existe. Cada una viaja con
   la frase que la interpreta: ninguna cifra aparece sola.
   ========================================================================== */

export interface ContextFact {
  /** La cifra, en grande. Corta: es lo que se lee de reojo. */
  figure: string;
  /** Qué significa esa cifra. */
  text: string;
}

export const contextFacts: ContextFact[] = [
  {
    figure: "2024-2050",
    text: "Ventana demográfica decisiva en Colombia: innovar hoy para transformar el mañana.",
  },
  {
    figure: "Universidad en tu Territorio",
    text: "La política nacional de educación superior sitúa a la UDES como agente activo de la región.",
  },
  {
    figure: "28.000+",
    text: "Estudiantes que lideran el cambio en el nororiente colombiano.",
  },
  {
    figure: "3.200",
    text: "Docentes acompañando la transformación en las tres sedes.",
  },
  {
    figure: "2024-2028",
    text: "Horizonte del plan: cinco años de ejecución con seguimiento público.",
  },
  {
    figure: "17 ODS",
    text: "Cada proyecto declara a qué Objetivos de Desarrollo Sostenible aporta.",
  },
];

/* =============================================================================
   B · El gran salto
   El contraste entre el modelo que se supera y el que se construye: la cadena de
   valor del diagnóstico frente a la del capítulo estratégico.
   ========================================================================== */

export interface LeapDimension {
  id: string;
  dimension: string;
  /** Lo que se supera. */
  before: string;
  /** Hacia dónde va el PDI. */
  after: string;
}

export const leapDimensions: LeapDimension[] = [
  {
    id: "aula",
    dimension: "La experiencia en aula",
    before: "Clases magistrales unidireccionales, tablero acrílico y memorización.",
    after:
      "Metodologías activas: learning by doing, simulación virtual, inteligencia artificial y problemas reales de la industria.",
  },
  {
    id: "curriculo",
    dimension: "El currículo",
    before: "Planes rígidos de cinco años, estructuras monolíticas e inflexibles.",
    after:
      "Microcredenciales, ciclos secuenciales y complementarios, bancos de electivas y cursos ubícronos: a tu ritmo y en cualquier lugar.",
  },
  {
    id: "financiero",
    dimension: "El ecosistema financiero",
    before: "Matrícula semestral estándar y pagos rígidos.",
    after:
      "Pago por créditos, diferimiento de cuotas, alianzas con fondos educativos y pasarelas digitales de última generación.",
  },
  {
    id: "investigacion",
    dimension: "El rol de la investigación",
    before: "Conocimiento teórico publicado sin articulación con el entorno.",
    after:
      "Investigación contextualizada y transferencia tecnológica aplicada a salud, energías limpias y agroindustria local.",
  },
];

/** Cifras del documento aprobado, no del seguimiento: describen la forma del plan. */
export interface PlanFigure {
  value: string;
  label: string;
}

export const planFigures: PlanFigure[] = [
  { value: "6", label: "Pilares estratégicos" },
  { value: "21", label: "Áreas estratégicas" },
  { value: "61", label: "Líneas de acción" },
  { value: "3", label: "Sedes nacionales" },
];

/* =============================================================================
   C · Narrativa de los pilares
   Complementa —no repite— lo que la base de datos ya guarda de cada pilar: el
   nombre, la descripción y el avance siguen viniendo de `pillars`. La clave es
   el slug.
   ========================================================================== */

export interface PillarNarrative {
  /** Frase oficial del pilar en el PDI. */
  motto: string;
  /** Líneas clave, en corto. El detalle completo vive en la ficha del pilar. */
  tags: string[];
}

export const pillarNarratives: Record<string, PillarNarrative> = {
  personalizacion: {
    motto:
      "Personalizar no es individualizar; es reconocer la singularidad dentro de una comunidad en evolución.",
    tags: ["Flexibilidad curricular y administrativa", "Life-long learning", "Escucha del sector real"],
  },
  "ambiente-tecnologico": {
    motto: "Que la experiencia tecnológica sea el eje que transforme cada interacción en la universidad.",
    tags: ["Smart campus", "Aulas del siglo XXI", "Virtualización 360°"],
  },
  "entorno-emprendedor": {
    motto: "El emprendimiento no es un acto, sino una forma de ser: un comportamiento que define el futuro.",
    tags: ["Incubación y aceleración", "Fondos de capital semilla", "Innovación abierta"],
  },
  gobernanza: {
    motto: "La transparencia es la clave del buen gobierno y el ingrediente del éxito compartido.",
    tags: ["Rendición de cuentas continua", "Representatividad y participación", "Modernización institucional"],
  },
  sostenibilidad: {
    motto: "Sembramos acciones conscientes para que el futuro herede oportunidades sostenibles.",
    tags: ["Ruta a la carbono neutralidad", "Sostenibilidad financiera", "Alianzas verdes"],
  },
  "apropiacion-social": {
    motto: "El puente que une el conocimiento con la comunidad, convirtiendo la educación en motor colectivo.",
    tags: ["Salud comunitaria en territorio", "Extensión con impacto real", "Vínculo con graduados"],
  },
};

/* =============================================================================
   D · Regionalización
   La vocación productiva de cada territorio y lo que la UDES hace frente a ella.
   ========================================================================== */

export interface CampusHighlight {
  value: string;
  label: string;
}

export interface Campus {
  id: string;
  city: string;
  /** Cómo se define la sede en una línea. */
  role: string;
  /** Qué hace el territorio. */
  vocation: string;
  /** Qué hace la UDES frente a eso. */
  response: string;
  /** Cifras del territorio: siempre con su unidad y su significado al lado. */
  highlights: CampusHighlight[];
  /** Frentes de trabajo de la sede. */
  fronts: string[];
}

export const campuses: Campus[] = [
  {
    id: "bucaramanga",
    city: "Bucaramanga",
    role: "Hub de alta tecnología, salud y sostenibilidad",
    vocation:
      "Referente de turismo médico internacional, con auge de la Industria 4.0 —inteligencia artificial, software y analítica— y una agroindustria de exportación construida sobre el café y el cacao.",
    response:
      "Acreditación de excelencia, modernización de laboratorios biomédicos e itinerarios en ingeniería de software y construcción sostenible.",
    highlights: [
      { value: "Turismo médico", label: "Destino internacional de referencia" },
      { value: "Industria 4.0", label: "IA, software y analítica" },
      { value: "Café y cacao", label: "Agroindustria de exportación" },
    ],
    fronts: ["Salud de clase mundial", "Ingeniería de software", "Construcción sostenible"],
  },
  {
    id: "cucuta",
    city: "Cúcuta",
    role: "Plataforma de integración fronteriza y transición energética",
    vocation:
      "Nodo estratégico del comercio binacional con Venezuela, con un potencial solar superior a 300 MW y una industria textil que concentra el 41 % del sector moda del departamento.",
    response:
      "Formación en comercio exterior y logística aduanera, centros de innovación en energías limpias y programas de salud para población vulnerable y migrante.",
    highlights: [
      { value: "300+ MW", label: "Potencial de generación solar" },
      { value: "41 %", label: "Del sector moda departamental" },
      { value: "Binacional", label: "Comercio de frontera" },
    ],
    fronts: ["Comercio exterior y logística", "Energías limpias", "Salud para población migrante"],
  },
  {
    id: "valledupar",
    city: "Valledupar",
    role: "Epicentro cultural, agropecuario y de energías renovables",
    vocation:
      "Potencia ganadera y agrícola —arroz y maíz—, capital mundial del vallenato y territorio con una radiación solar que alcanza los 500 MW de potencial.",
    response:
      "Agricultura y ganadería de precisión, incubadora de industrias creativas y musicales, e investigación en transición energética solar y ecoturismo en la Sierra Nevada.",
    highlights: [
      { value: "1,5 M", label: "Cabezas de ganado" },
      { value: "500 MW", label: "Potencial solar" },
      { value: "Vallenato", label: "Capital mundial y turismo cultural" },
    ],
    fronts: ["Agroindustria de precisión", "Industrias creativas", "Transición solar y ecoturismo"],
  },
];

/* =============================================================================
   E · Encuentra tu ruta

   Tres piezas, y cada una responde una pregunta distinta:

     · `routeInterests`  qué pone en marcha el plan sobre ese tema — es igual
                         para todo el mundo, porque el plan es uno solo.
     · `routeMatrix`     qué significa eso para *este* perfil. Es el cruce, y
                         es donde está el contenido que de verdad se busca:
                         "emprender" no quiere decir lo mismo para un aspirante
                         que para una empresa.
     · `routeProfiles`   con qué lente se le habla y a dónde se le manda.

   Lo que no está aquí: los pilares y los ODS del resultado. Esos salen de la
   base —de los proyectos publicados— porque son datos, no redacción.
   ========================================================================== */

export interface RouteProfile {
  id: string;
  label: string;
  /** Con qué lente se le habla a ese perfil en el resultado. */
  lens: string;
  cta: { label: string; to: string };
}

export const routeProfiles: RouteProfile[] = [
  {
    id: "aspirante",
    label: "Aspirante",
    lens: "Lo que encontrarás al entrar",
    cta: { label: "Conocer la implementación", to: "/implementacion" },
  },
  {
    id: "estudiante",
    label: "Estudiante",
    lens: "Lo que ya está cambiando en tu semestre",
    cta: { label: "Ver el avance del plan", to: "/tablero" },
  },
  {
    id: "graduado",
    label: "Graduado",
    lens: "Cómo sigue acompañándote la universidad",
    cta: { label: "Ver el avance del plan", to: "/tablero" },
  },
  {
    id: "empresa",
    label: "Empresa",
    lens: "Dónde se conecta tu organización con la UDES",
    cta: { label: "Explorar los pilares", to: "/implementacion" },
  },
  {
    id: "docente",
    label: "Docente",
    lens: "Lo que el plan pone en tus manos",
    cta: { label: "Ver el avance del plan", to: "/tablero" },
  },
];

export interface RouteInterest {
  id: string;
  label: string;
  icon: IconName;
  /** Qué responde el PDI a ese interés. */
  answer: string;
  /** Lo que el plan pone en marcha, en corto. Rótulos, no enlaces. */
  moves: string[];
  /** Pilares del plan que lo sostienen. Slugs de `pillars`. */
  pillars: string[];
}

export const routeInterests: RouteInterest[] = [
  {
    id: "emprender",
    label: "Emprender",
    icon: "spark",
    answer:
      "El centro de emprendimiento acompaña la idea desde la asesoría legal hasta la aceleración, con fondos de capital semilla para prototipar y validar el modelo de negocio.",
    moves: ["Incubación y aceleración", "Capital semilla", "Innovación abierta"],
    pillars: ["entorno-emprendedor", "ambiente-tecnologico"],
  },
  {
    id: "flexibilidad",
    label: "Flexibilidad de horarios",
    icon: "clock",
    answer:
      "Microcredenciales, bancos de electivas, cursos ubícronos y pago por créditos: la formación se ajusta a tu tiempo y a tu bolsillo, no al revés.",
    moves: ["Microcredenciales", "Pago por créditos", "Cursos ubícronos"],
    pillars: ["personalizacion", "ambiente-tecnologico"],
  },
  {
    id: "investigacion",
    label: "Investigación y tecnología",
    icon: "chip",
    answer:
      "Laboratorios modernizados, analítica de aprendizaje y transferencia tecnológica aplicada a salud, energías limpias y agroindustria del territorio.",
    moves: ["Laboratorios modernizados", "Analítica e IA en el aula", "Transferencia tecnológica"],
    pillars: ["ambiente-tecnologico", "entorno-emprendedor"],
  },
  {
    id: "comunidad",
    label: "Impacto en mi comunidad",
    icon: "community",
    answer:
      "Brigadas de salud, telemedicina, consultorías comunitarias y proyectos de extensión multidisciplinarios, con datos abiertos sobre cómo avanza cada compromiso.",
    moves: ["Salud en territorio", "Consultorías comunitarias", "Datos abiertos"],
    pillars: ["apropiacion-social", "gobernanza", "sostenibilidad"],
  },
];

/**
 * El cruce perfil × interés: qué significa ese tema para quien pregunta.
 *
 * Se busca como `routeMatrix[perfil][interés]`. Si faltara una casilla el
 * resultado se muestra igual, solo que sin esta línea: el componente no da por
 * hecho que la tabla esté completa.
 */
export const routeMatrix: Record<string, Record<string, string>> = {
  aspirante: {
    emprender:
      "Entras a una universidad donde tu idea puede empezar en primer semestre, no el día que te gradúas.",
    flexibilidad:
      "Eliges cuántos créditos tomas y cómo los pagas: la matrícula deja de ser un bloque único e inamovible.",
    investigacion:
      "Desde pregrado puedes vincularte a un semillero y usar los laboratorios que el plan está modernizando.",
    comunidad:
      "Tu práctica no será un trámite: se hace dentro de proyectos de extensión con comunidades reales del territorio.",
  },
  estudiante: {
    emprender:
      "El centro de emprendimiento ya recibe ideas de estudiantes activos, con mentoría y ruta de incubación.",
    flexibilidad:
      "Las microcredenciales y el banco de electivas te dejan armar el semestre alrededor de tu horario, y no al revés.",
    investigacion:
      "Puedes sumarte a los grupos que están firmando transferencia tecnológica con empresas de la región.",
    comunidad:
      "Las brigadas y las consultorías comunitarias cuentan en tu formación y se reportan como avance del plan.",
  },
  graduado: {
    emprender:
      "La incubadora y el capital semilla siguen abiertos para ti después del grado, no solo mientras estudias.",
    flexibilidad:
      "La formación continua y los posgrados modulares están pensados para volver sin dejar el trabajo.",
    investigacion:
      "Puedes volver como investigador asociado o traer un problema de tu empresa para resolverlo con la UDES.",
    comunidad:
      "El seguimiento a graduados es una línea del plan: tu trayectoria alimenta las redes de impacto regional.",
  },
  empresa: {
    emprender:
      "La innovación abierta conecta tus retos con los grupos de investigación y con los emprendimientos incubados.",
    flexibilidad:
      "Puedes formar a tu equipo con microcredenciales y cursos ubícronos, sin sacarlo de la operación.",
    investigacion:
      "La transferencia en salud, energías limpias y agroindustria busca contraparte empresarial para aterrizarse.",
    comunidad:
      "Los proyectos de extensión admiten alianzas: tu organización puede sumarse a un impacto que se mide y se publica.",
  },
  docente: {
    emprender:
      "Tu grupo puede convertir resultados de investigación en patentes y spin-offs, con acompañamiento legal.",
    flexibilidad:
      "El diseño modular y los cursos ubícronos cambian cómo se programa tu carga y cómo se evalúa el curso.",
    investigacion:
      "Simuladores, analítica de aprendizaje e IA entran al aula como herramientas de enseñanza, no como adorno.",
    comunidad:
      "La extensión multidisciplinaria te permite llevar tu asignatura a problemas concretos de la comunidad.",
  },
};
