/* =============================================================================
   E · Encuentra tu ruta — contenido.

   Vive aparte del resto de la portada porque es lo más largo que hay aquí: son
   siete perfiles por siete intereses, y mezclarlo con los lemas y las sedes
   convertiría `content.ts` en un archivo que nadie abre.

   Tres piezas, y cada una responde una pregunta distinta:

     · `routeInterests`  qué pone en marcha el plan sobre ese tema — es igual
                         para todo el mundo, porque el plan es uno solo.
     · `routeMatrix`     qué significa eso para *este* perfil. Es el cruce, y es
                         donde está el contenido que de verdad se busca:
                         "emprender" no quiere decir lo mismo para un aspirante
                         que para una directiva que tiene que sostenerlo.
     · `routeProfiles`   con qué lente se le habla, qué paso le sigue y a dónde
                         se le manda.

   Los siete intereses cubren los seis pilares: cualquier respuesta aterriza en
   un pilar publicado, ninguno se queda sin puerta de entrada.

   Lo que NO está aquí: los pilares y los ODS del resultado. Esos salen de la
   base —de los proyectos publicados— porque son datos, no redacción.
   ========================================================================== */

import type { IconName } from "../../components/ui/Icon";

/* --- Quién pregunta -------------------------------------------------------- */

export interface RouteProfile {
  id: string;
  label: string;
  /** Con qué lente se le habla a ese perfil en el resultado. */
  lens: string;
  /** Qué hacer después, en una línea. Va junto al botón. */
  nextStep: string;
  cta: { label: string; to: string };
}

/* El orden va de fuera hacia dentro y termina en el aliado externo: quien
   todavía no ha entrado, quien está, quien salió, quien enseña, quien opera,
   quien decide, y quien acompaña desde fuera. */
export const routeProfiles: RouteProfile[] = [
  {
    id: "aspirante",
    label: "Aspirante",
    lens: "Lo que encontrarás al entrar",
    nextStep: "El plan completo está publicado: puedes leerlo antes de decidir.",
    cta: { label: "Conocer la implementación", to: "/implementacion" },
  },
  {
    id: "estudiante",
    label: "Estudiante",
    lens: "Lo que ya está cambiando en tu semestre",
    nextStep: "Lo que aquí se promete se mide. Revisa el avance real de cada compromiso.",
    cta: { label: "Ver el avance del plan", to: "/tablero" },
  },
  {
    id: "graduado",
    label: "Graduado",
    lens: "Cómo sigue acompañándote la universidad",
    nextStep: "El plan se reporta por cortes públicos: mira en qué va el que te interesa.",
    cta: { label: "Ver el avance del plan", to: "/tablero" },
  },
  {
    id: "docente",
    label: "Docente",
    lens: "Lo que el plan pone en tus manos",
    nextStep: "Cada pilar tiene su ficha, con indicadores, metas y responsable de cálculo.",
    cta: { label: "Explorar los pilares", to: "/implementacion" },
  },
  {
    id: "administrativo",
    label: "Personal administrativo",
    lens: "Lo que cambia en tu día a día de trabajo",
    nextStep: "Si operas alguno de estos procesos, la ficha del pilar dice quién lo gestiona.",
    cta: { label: "Ver cómo se implementa", to: "/implementacion" },
  },
  {
    id: "directivo",
    label: "Directivo",
    lens: "Lo que hay que decidir y sostener",
    nextStep: "El tablero trae el mismo corte que usa el comité de planeación.",
    cta: { label: "Ir al tablero PDI", to: "/tablero" },
  },
  {
    id: "empresa",
    label: "Empresa o aliado",
    lens: "Dónde se conecta tu organización con la UDES",
    nextStep: "Cada pilar publica su impulsor y a qué contribuye: por ahí se entra.",
    cta: { label: "Explorar los pilares", to: "/implementacion" },
  },
];

/* --- Qué se busca ---------------------------------------------------------- */

export interface RouteInterest {
  id: string;
  label: string;
  icon: IconName;
  /** Qué responde el PDI a ese interés. Igual para todos los perfiles. */
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
    id: "tramites",
    label: "Trámites y vida digital",
    icon: "settings",
    answer:
      "Smart campus, oficinas virtuales, carné digital y tableros de avance en tiempo real: el plan rediseña el proceso antes de automatizarlo, no solo la pantalla.",
    moves: ["Oficinas virtuales", "Carné digital", "Avance académico en vivo"],
    pillars: ["ambiente-tecnologico", "personalizacion"],
  },
  {
    id: "gobierno",
    label: "Transparencia y buen gobierno",
    icon: "columns",
    answer:
      "Rendición de cuentas continua, datos abiertos y vocería real de estudiantes, docentes y graduados en los órganos de dirección.",
    moves: ["Rendición de cuentas continua", "Datos abiertos", "Representatividad"],
    pillars: ["gobernanza", "ambiente-tecnologico"],
  },
  {
    id: "sostenibilidad",
    label: "Sostenibilidad y ambiente",
    icon: "leaf",
    answer:
      "Ruta declarada hacia la carbono neutralidad, gestión integral de residuos, eficiencia hídrica y energética, y alianzas en bioeconomía y energías limpias.",
    moves: ["Carbono neutralidad", "Gestión de residuos", "Alianzas verdes"],
    pillars: ["sostenibilidad", "apropiacion-social"],
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

/* --- El cruce -------------------------------------------------------------- */

/**
 * Qué significa cada tema para quien pregunta.
 *
 * Se busca como `routeMatrix[perfil][interés]`. Si faltara una casilla el
 * resultado se muestra igual, solo que sin esta línea: el componente no da por
 * hecho que la tabla esté completa, y así añadir un perfil no obliga a escribir
 * las siete casillas antes de poder publicarlo.
 */
export const routeMatrix: Record<string, Record<string, string>> = {
  aspirante: {
    emprender:
      "Entras a una universidad donde tu idea puede empezar en primer semestre, no el día que te gradúas.",
    flexibilidad:
      "Eliges cuántos créditos tomas y cómo los pagas: la matrícula deja de ser un bloque único e inamovible.",
    investigacion:
      "Desde pregrado puedes vincularte a un semillero y usar los laboratorios que el plan está modernizando.",
    tramites:
      "Inscripción, matrícula y carné digital: lo que antes era hacer fila empieza a resolverse desde el móvil.",
    gobierno:
      "Puedes ver cómo avanza el plan antes de matricularte: el tablero es público y no hace falta ser estudiante.",
    sostenibilidad:
      "Estudiarás en un campus con ruta declarada hacia la carbono neutralidad, y puedes comprobar por dónde va.",
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
    tramites:
      "Oficinas virtuales, carné digital y un tablero con tu avance académico en tiempo real, sin pedir cita.",
    gobierno:
      "La representación estudiantil tiene vocería en los órganos de dirección, y lo que allí se decide se publica.",
    sostenibilidad:
      "Residuos, agua y energía del campus donde pasas el día dejan de ser invisibles: se miden y se publican.",
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
    tramites:
      "Certificados, actas y constancias dejan de pedirse en ventanilla y pasan a emitirse en línea.",
    gobierno:
      "Los graduados tienen silla en la conversación institucional, no solo en la ceremonia de grado.",
    sostenibilidad:
      "Las alianzas en bioeconomía y energías limpias son una puerta de entrada profesional en la región.",
    comunidad:
      "El seguimiento a graduados es una línea del plan: tu trayectoria alimenta las redes de impacto regional.",
  },
  docente: {
    emprender:
      "Tu grupo puede convertir resultados de investigación en patentes y spin-offs, con acompañamiento legal.",
    flexibilidad:
      "El diseño modular y los cursos ubícronos cambian cómo se programa tu carga y cómo se evalúa el curso.",
    investigacion:
      "Simuladores, analítica de aprendizaje e IA entran al aula como herramientas de enseñanza, no como adorno.",
    tramites:
      "Menos formatos y más tiempo de clase: el plan ataca la carga administrativa que hoy se lleva tus horas.",
    gobierno:
      "El marco normativo se actualiza y se consulta: escalafón, evaluación y participación dejan de ser reglas tácitas.",
    sostenibilidad:
      "Bioeconomía y transición energética son líneas con financiación y contraparte buscando equipo investigador.",
    comunidad:
      "La extensión multidisciplinaria te permite llevar tu asignatura a problemas concretos de la comunidad.",
  },
  administrativo: {
    emprender:
      "Constituir una spin-off, registrar propiedad intelectual o firmar un convenio deja de improvisarse: el plan le pone ruta y responsable.",
    flexibilidad:
      "Pago por créditos y diferimiento de cuotas obligan a que registro, cartera y matrícula trabajen sobre el mismo dato.",
    investigacion:
      "La compra de equipo científico y la gestión de convenios entran al mismo ciclo de seguimiento que el resto del plan.",
    tramites:
      "Es tu pilar: el smart campus y las oficinas virtuales rediseñan el proceso que hoy operas, no solo su pantalla.",
    gobierno:
      "Rendición de cuentas continua significa que el dato que tú cargas es el que se publica: la calidad del reporte es la del gobierno.",
    sostenibilidad:
      "Compras responsables, residuos y consumo energético dejan de ser buenas intenciones y pasan a ser criterio en el pliego.",
    comunidad:
      "Las brigadas y las jornadas en territorio viven de logística, contratación y transporte: ahí es donde el impacto se hace o se cae.",
  },
  directivo: {
    emprender:
      "El emprendimiento deja de medirse por eventos realizados y pasa a medirse por empresas creadas y patentes en uso.",
    flexibilidad:
      "La flexibilidad es una decisión de modelo, no de calendario: toca reglamento, oferta y flujo de caja a la vez.",
    investigacion:
      "La pregunta deja de ser cuántos artículos se publican y pasa a ser cuánto de eso llega a salud, energía o agroindustria.",
    tramites:
      "Digitalizar no es comprar software: el plan pide rediseñar el proceso antes de automatizarlo, y esa decisión es tuya.",
    gobierno:
      "Datos abiertos y rendición continua cambian el costo de decidir tarde: lo que no se reporta, se nota.",
    sostenibilidad:
      "Aquí sostenibilidad son tres cosas a la vez —ambiental, social y financiera— y la tercera es la que sostiene a las otras dos.",
    comunidad:
      "El impacto social deja de contarse en asistentes y pasa a contarse en necesidades atendidas y comunidades con seguimiento.",
  },
  empresa: {
    emprender:
      "La innovación abierta conecta tus retos con los grupos de investigación y con los emprendimientos incubados.",
    flexibilidad:
      "Puedes formar a tu equipo con microcredenciales y cursos ubícronos, sin sacarlo de la operación.",
    investigacion:
      "La transferencia en salud, energías limpias y agroindustria busca contraparte empresarial para aterrizarse.",
    tramites:
      "Convenios, contratación y facturación con la universidad entran a pasarelas digitales con trazabilidad en línea.",
    gobierno:
      "Puedes verificar con qué avanza cada compromiso antes de firmar: el seguimiento del plan es público.",
    sostenibilidad:
      "Los proyectos de bioeconomía y energías limpias buscan aliado industrial con presencia en el territorio.",
    comunidad:
      "Los proyectos de extensión admiten alianzas: tu organización puede sumarse a un impacto que se mide y se publica.",
  },
};
