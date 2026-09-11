/* =============================================================================
   Portada · contenido editorial.

   Aquí vive solo lo que el PDI dice, no lo que la base de datos mide. El avance,
   los indicadores y los documentos siguen llegando de Supabase; los lemas, la
   narrativa de cada pilar, la vocación de cada sede y las cifras del diagnóstico
   son texto del plan y se editan en este archivo.

   Los pilares se referencian por `slug`, el mismo que usa la tabla `pillars`:
   si la base cambia un nombre o un color, la narrativa lo sigue sin tocar nada.
   ========================================================================== */

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

/**
 * Cifras del documento aprobado, no del seguimiento: describen la forma del plan.
 *
 * Verificadas contra `Indicadores_Campus_Pilares_UDES_2025.xlsx`, que es la
 * fuente que las cuenta una a una: 21 áreas y 62 líneas, no 61. La suma por
 * pilar de la hoja 01 (10+9+13+4+12+14) da 62, y la hoja 11 lista las 62.
 */
export interface PlanFigure {
  value: string;
  label: string;
}

export const planFigures: PlanFigure[] = [
  { value: "6", label: "Pilares estratégicos" },
  { value: "21", label: "Áreas estratégicas" },
  { value: "62", label: "Líneas de acción" },
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
   Los siete perfiles, los siete intereses y el cruce entre ambos viven en
   `route-content.ts`: son con diferencia lo más largo de la portada y aquí
   habrían enterrado los lemas y las sedes.
   ========================================================================== */

export {
  routeProfiles,
  routeInterests,
  routeMatrix,
  type RouteProfile,
  type RouteInterest,
} from "./route-content";
