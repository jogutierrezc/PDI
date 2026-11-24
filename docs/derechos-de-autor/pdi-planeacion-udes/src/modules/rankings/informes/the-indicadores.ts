/* =============================================================================
   Mapa de indicadores de THE por ODS · lo que usa Pilo para armar el informe
   de cada indicador.

   Fuente: «Metodología de los Sustainability Impact Ratings 2027», versión 1.1
   (Times Higher Education), traducción al español, archivo
   Spanish_THE_Impact_Rankings_METHODOLOGY_2027.pdf en la raíz del repositorio.
   Año de los datos y de la evidencia: 2025 (las políticas, vigentes en 2025;
   la revisión que suma un punto, entre 2022 y 2026).

   Una entrada por indicador, con la numeración del documento. Tipos:
     · ev   existencia + evidencia (hasta 1) + evidencia pública (1). Una
            noticia puede ser la evidencia.
     · doc  pide un documento institucional (política, plan, informe…): una
            noticia no lo reemplaza. Las políticas suelen valer 4 puntos (el
            cuarto, si se creó o revisó entre 2022 y 2026).
     · dato una cifra que se envía en el portal (maximo = 0).
     · inv  investigación que THE calcula con Scopus (un registro por ODS).
   `peso` es el % del ODS que vale el indicador, tal como lo dice el documento.

   Este archivo se copia, tal cual, a supabase/functions/pilo-rankingsod/
   indicadores.ts con `node scripts/sync-the-indicadores.mjs` (la función de
   Deno no puede importar de src/). Después de editarlo, vuelva a generar la
   copia; la prueba tests/noticias/the-indicadores.test.ts falla si difieren.
   ========================================================================== */

import type { IndicadorTHE } from "./tipos";

type PreguntaPersona = NonNullable<IndicadorTHE["pregunta_persona"]>;

/** Versión de la metodología de la que sale este mapa. */
export const METODOLOGIA_THE = { edicion: 2027, version: "1.1", anio_datos: 2025 } as const;

const REVISION = " Suma 1 punto más si se creó o revisó entre 2022 y 2026.";
const CIFRA = "Cifra normalizada; THE calcula la puntuación con lo que se envía en el portal.";

function ind(
  id: string,
  tipo: IndicadorTHE["tipo"],
  peso: number | null,
  maximo: number,
  titulo: string,
  pregunta: string,
  regla: string,
  pregunta_persona?: PreguntaPersona,
): IndicadorTHE {
  const base: IndicadorTHE = { id, ods: Number(id.split(".")[0]), titulo, tipo, peso, pregunta, regla, maximo };
  return pregunta_persona ? { ...base, pregunta_persona } : base;
}

/** Investigación (Scopus): un registro por ODS. */
function inv(ods: number, peso: number, que: string, id = `${ods}.1`, titulo = "Investigación"): IndicadorTHE {
  return ind(id, "inv", peso, 0, titulo, que, "La calcula THE con datos de Scopus (Elsevier); no se envía evidencia.");
}

function gratuidad(texto: string, por_defecto = "1", pago = "0.25"): PreguntaPersona {
  return {
    clave: "gratuidad",
    texto,
    opciones: [
      { valor: "1", etiqueta: "Gratuito" },
      { valor: pago, etiqueta: "De pago" },
    ],
    por_defecto,
  };
}

const MEDICION_TOTAL: PreguntaPersona = {
  clave: "alcance",
  texto: "¿La medición cubre toda la universidad (todas las sedes)?",
  opciones: [
    { valor: "1", etiqueta: "Toda la universidad" },
    { valor: "0.5", etiqueta: "Solo una parte" },
  ],
  por_defecto: "0.5",
};

const RESTAURANTES: PreguntaPersona = {
  clave: "cobertura",
  texto: "¿Las opciones están en todos los restaurantes y cafeterías del campus?",
  opciones: [
    { valor: "1", etiqueta: "En todos" },
    { valor: "0.5", etiqueta: "Solo en algunos" },
  ],
  por_defecto: "0.5",
};

function programadosOFin(texto: string): PreguntaPersona {
  return {
    clave: "tipo",
    texto,
    opciones: [
      { valor: "1", etiqueta: "Programados y con un fin específico" },
      { valor: "0.75", etiqueta: "Solo programados" },
      { valor: "0.25", etiqueta: "Solo con un fin específico" },
    ],
    por_defecto: "1",
  };
}

function accesoGratuito(texto: string, todos: string, algunos: string, por_defecto: string): PreguntaPersona {
  return {
    clave: "acceso",
    texto,
    opciones: [
      { valor: "1", etiqueta: todos },
      { valor: "0.5", etiqueta: algunos },
      { valor: "0.25", etiqueta: "De pago" },
    ],
    por_defecto,
  };
}

/** Orden por ODS y luego por cada tramo del número («4.3.10» después de «4.3.9»). */
function compararId(a: IndicadorTHE, b: IndicadorTHE): number {
  const pa = a.id.split(".").map(Number);
  const pb = b.id.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

const LISTA: IndicadorTHE[] = [
  /* ── ODS 1 · Fin de la pobreza ─────────────────────────────────────────── */
  inv(1, 27, "Artículos con coautores de países de ingresos bajos y medianos bajos (7 %), FWCI (10 %) y número de publicaciones (10 %) sobre pobreza."),
  ind("1.2.1", "dato", 27, 0, "Estudiantes con bajos recursos que reciben ayuda económica",
    "Número de estudiantes (EJC) y cuántos de ellos, con ingresos bajos, reciben una ayuda económica importante debido a la pobreza en 2025.", CIFRA),
  ind("1.3.1", "ev", 4.6, 3, "Objetivo de admisión del quintil inferior",
    "¿Tiene la universidad objetivos para admitir estudiantes del 20 % de hogares con menor renta del país (o un grupo definido con más rigor)?",
    "1 si existen los objetivos."),
  ind("1.3.2", "ev", 4.6, 3, "Éxito de estudiantes del quintil inferior",
    "¿Tiene objetivos de graduación o finalización para los estudiantes del 20 % de hogares con menor renta del país?",
    "1 si existen los objetivos."),
  ind("1.3.3", "ev", 4.6, 3, "Ayuda a estudiantes con ingresos bajos",
    "¿Ofrece ayuda (alimentos, vivienda, transporte, servicios jurídicos) a estudiantes de familias de renta baja para que terminen sus estudios?",
    "1 si la ayuda es gratuita; 0,25 si es subvencionada.",
    gratuidad("¿La ayuda es gratuita para el estudiante (no subvencionada en parte)?")),
  ind("1.3.4", "ev", 4.6, 3, "Ayuda a estudiantes del quintil inferior",
    "¿Tiene programas o iniciativas continuos para que los estudiantes del 20 % de hogares con menor renta terminen con éxito sus estudios?",
    "1 si existen los programas."),
  ind("1.3.5", "ev", 4.6, 3, "Ayuda a estudiantes de países de ingresos bajos",
    "¿Tiene programas (educación gratuita, becas) para estudiantes pobres de países de ingresos bajos o medianos bajos?",
    "1 si existen los programas."),
  ind("1.4.1", "ev", 5.75, 3, "Ayuda a la creación de empresas locales",
    "¿Apoya en la comunidad local la creación de negocios sostenibles financiera y socialmente con educación o recursos (mentorías, talleres, acceso a instalaciones)?",
    "1 si la ayuda es gratuita; 0,25 si es subvencionada.",
    gratuidad("¿El apoyo a los emprendedores es gratuito?")),
  // numeración por confirmar contra el portal de envío
  ind("1.4.2", "ev", 5.75, 3, "Ayuda económica a empresas locales",
    "¿Da ayuda económica a la comunidad local para crear negocios sostenibles financiera y socialmente?",
    "1 si existe la ayuda."),
  // numeración por confirmar contra el portal de envío
  ind("1.4.3", "ev", 5.75, 3, "Programas de acceso a servicios básicos",
    "¿Organiza formación o programas que mejoren el acceso de todos a los servicios básicos (salud, nutrición, agua potable, saneamiento, vivienda)?",
    "1 si la universidad los ofrece directamente; 0,25 si son indirectos."),
  // numeración por confirmar contra el portal de envío
  ind("1.4.4", "ev", 5.75, 3, "Políticas para acabar con la pobreza",
    "¿Participa en la elaboración de políticas locales, regionales, nacionales o globales para acabar con la pobreza en todas sus dimensiones?",
    "0,25 por cada nivel con participación: local, regional, nacional y global."),

  /* ── ODS 2 · Hambre cero ───────────────────────────────────────────────── */
  inv(2, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre hambre."),
  ind("2.2.1", "ev", 7.7, 3, "Seguimiento del desperdicio de alimentos",
    "¿Mide la universidad la cantidad de alimentos que se desperdician de las comidas que sirve en el campus (también si el servicio está contratado)?",
    "1 si la medición cubre toda la universidad; 0,5 si es parcial.", MEDICION_TOTAL),
  ind("2.2.2", "dato", 7.7, 0, "Desperdicio de alimentos por persona",
    "Toneladas de alimentos desechados en los servicios de comida del campus en 2025 y población del campus (estudiantes y empleados EJC).",
    "Solo puntúa si en 2.2.1 la medición cubre toda la universidad. " + CIFRA),
  ind("2.3.1", "ev", 4.8, 3, "Programa contra la inseguridad alimentaria",
    "¿Tiene un programa continuo sobre la inseguridad alimentaria de los estudiantes?",
    "1 si existe el programa."),
  ind("2.3.2", "ev", 2.4, 3, "Intervenciones contra el hambre de estudiantes",
    "¿Hace intervenciones para prevenir o aliviar el hambre de los estudiantes (bancos de alimentos, despensas)?",
    "1 si hay intervención; puede ser puntual, pero directa y práctica."),
  ind("2.3.3", "ev", 4.8, 3, "Opciones de alimentos sostenibles",
    "¿Ofrece opciones de alimentos sostenibles para todos en el campus, incluidas vegetarianas y veganas?",
    "1 si están en todos los restaurantes; 0,5 si solo en algunos.", RESTAURANTES),
  ind("2.3.4", "ev", 4.8, 3, "Alimentos saludables y asequibles",
    "¿Ofrece opciones de alimentos saludables y asequibles para todos en el campus?",
    "1 si están en todos los restaurantes; 0,5 si solo en algunos.", RESTAURANTES),
  ind("2.3.5", "ev", 2.4, 3, "Intervenciones contra el hambre del personal",
    "¿Hace intervenciones para prevenir o aliviar el hambre del personal (bancos de alimentos, despensas)?",
    "1 si hay intervención."),
  ind("2.4.1", "dato", 19.2, 0, "Graduados en agricultura y acuicultura sostenibles",
    "Graduados totales de 2025 y cuántos terminaron un programa de agricultura o acuicultura que incluye la sostenibilidad alimentaria.", CIFRA),
  ind("2.5.1", "ev", 4.8, 3, "Conocimientos sobre seguridad alimentaria",
    "¿Da a agricultores y productores locales acceso a conocimientos, habilidades y tecnologías sobre seguridad alimentaria y agricultura y acuicultura sostenibles?",
    "1 si es gratuito; 0,25 si es de pago.", gratuidad("¿El acceso para los productores es gratuito?")),
  ind("2.5.2", "ev", 4.8, 3, "Eventos para agricultores y productores locales",
    "¿Organiza eventos para agricultores y productores locales que creen relaciones y transfieran conocimiento?",
    "1 si son gratuitos; 0,25 si son de pago.", gratuidad("¿Los eventos son gratuitos para los productores?")),
  // numeración por confirmar contra el portal de envío
  ind("2.5.3", "ev", 4.8, 3, "Instalaciones abiertas a productores locales",
    "¿Abre sus instalaciones (laboratorios, tecnología, material) a agricultores y productores locales para mejorar las prácticas agrícolas sostenibles?",
    "1 si es gratuito; 0,25 si es de pago.", gratuidad("¿El uso de las instalaciones es gratuito para los productores?")),
  // numeración por confirmar contra el portal de envío
  ind("2.5.4", "ev", 4.8, 3, "Compra de alimentos sostenibles",
    "¿Prioriza la compra de productos de origen local y sostenible?",
    "1 si existe la priorización."),

  /* ── ODS 3 · Salud y bienestar ─────────────────────────────────────────── */
  inv(3, 27, "Consultas de los artículos (10 %), citas en guías clínicas (10 %) y número de publicaciones (7 %) sobre salud."),
  ind("3.2.1", "dato", 34.6, 0, "Graduados en profesiones sanitarias",
    "Graduados totales de 2025 y cuántos obtuvieron un título en una profesión sanitaria (medicina, enfermería, psicología, salud pública…).", CIFRA),
  // numeración por confirmar contra el portal de envío
  ind("3.3.1", "ev", 7, 3, "Colaboraciones con instituciones de salud",
    "¿Tiene colaboraciones vigentes con instituciones de salud locales, nacionales o globales para mejorar la salud y el bienestar?",
    "1 con tres colaboraciones; 0,66 con dos; 0,33 con una."),
  // numeración por confirmar contra el portal de envío
  ind("3.3.2", "ev", 7, 3, "Programas de promoción de la salud en la comunidad",
    "¿Ofrece a la comunidad local programas y proyectos (también de voluntariado estudiantil) para promover la salud: higiene, nutrición, planificación familiar, deporte, envejecimiento saludable?",
    "0,5 por comunidades locales, 0,25 por personas desfavorecidas y 0,25 por comunidades de refugiados o migrantes."),
  ind("3.3.3", "ev", 2.4, 3, "Instalaciones deportivas para la comunidad",
    "¿Cede sus instalaciones deportivas a la comunidad local (colegios, público general) de forma regular, no en un solo evento?",
    "1 si el acceso es gratuito a todas; 0,66 gratuito a algunas; 0,33 solo de pago.",
    {
      clave: "acceso",
      texto: "¿La comunidad entra gratis a todas las instalaciones deportivas, a algunas, o solo pagando?",
      opciones: [
        { valor: "1", etiqueta: "Gratis a todas" },
        { valor: "0.66", etiqueta: "Gratis a algunas" },
        { valor: "0.33", etiqueta: "Solo de pago" },
      ],
      por_defecto: "0.66",
    }),
  ind("3.3.4", "ev", 7, 3, "Salud sexual y reproductiva para estudiantes",
    "¿Ofrece a los estudiantes servicios de salud sexual y reproductiva, incluidos información y educación?",
    "1 si son gratuitos; 0,25 si son de pago.", gratuidad("¿Los servicios son gratuitos para los estudiantes?")),
  ind("3.3.5", "ev", 3.5, 3, "Salud mental de los estudiantes",
    "¿Ofrece a los estudiantes acceso a apoyo en salud mental?",
    "1 si promueve activamente la buena salud mental; 0,66 si da acceso (o deriva) a apoyo gratuito; 0,33 si es de pago."),
  ind("3.3.6", "doc", 8, 4, "Política antitabaco",
    "¿Tiene una política antitabaco?",
    "1 si el campus es totalmente libre de humo; 0,5 si es parcial (con zonas de fumadores)." + REVISION,
    {
      clave: "sin_humo",
      texto: "¿La política prohíbe fumar en todo el campus, interiores y exteriores, sin zonas de fumadores?",
      opciones: [
        { valor: "1", etiqueta: "Todo el campus" },
        { valor: "0.5", etiqueta: "Parcial, con zonas de fumadores" },
      ],
      por_defecto: "0.5",
    }),
  ind("3.3.7", "ev", 3.5, 3, "Salud mental del personal",
    "¿Ofrece al personal acceso a apoyo en salud mental?",
    "1 si promueve activamente la buena salud mental; 0,66 si da acceso (o deriva) a apoyo gratuito; 0,33 si es de pago."),

  /* ── ODS 4 · Educación de calidad ──────────────────────────────────────── */
  inv(4, 27, "Consultas de los artículos (10 %), CiteScore (10 %) y número de publicaciones (7 %) sobre educación."),
  ind("4.2.1", "dato", 15.4, 0, "Graduados con cualificación docente",
    "Graduados totales de 2025 y cuántos obtuvieron una cualificación que les permite ser maestros de primaria en el país.", CIFRA),
  // numeración por confirmar contra el portal de envío
  ind("4.3.1", "ev", 5, 3, "Recursos educativos abiertos al público",
    "¿Da acceso gratuito a recursos educativos a quienes no estudian en la universidad: computadores, biblioteca, cursos en línea, clases?",
    "0,4 por cursos gratuitos con certificado o reconocimiento; 0,4 por acceso gratuito a instalaciones y equipos; 0,2 por recursos en línea gratuitos."),
  // numeración por confirmar contra el portal de envío
  ind("4.3.2", "ev", 5, 3, "Actos educativos abiertos al público",
    "¿Organiza actos educativos abiertos al público general, como clases públicas o actos en la comunidad?",
    "1 si todos son gratuitos; 0,5 si hay gratuitos y de pago; 0,25 si solo son de pago.",
    {
      clave: "gratuidad",
      texto: "¿Los actos son gratuitos?",
      opciones: [
        { valor: "1", etiqueta: "Todos gratuitos" },
        { valor: "0.5", etiqueta: "Gratuitos y de pago" },
        { valor: "0.25", etiqueta: "Solo de pago" },
      ],
      por_defecto: "1",
    }),
  // numeración por confirmar contra el portal de envío
  ind("4.3.3", "ev", 5, 3, "Educación ejecutiva abierta al público",
    "¿Organiza cursos breves de educación ejecutiva abiertos a personas que no estudian en la universidad (no cuentan MBA ni programas de formación profesional)?",
    "1 si son programados y con un fin específico; 0,75 solo programados; 0,25 solo con un fin específico.",
    programadosOFin("¿Los cursos hacen parte de una oferta programada, responden a un fin específico o ambas cosas?")),
  // numeración por confirmar contra el portal de envío
  ind("4.3.4", "ev", 5, 3, "Divulgación educativa fuera del campus",
    "¿Organiza actividades de divulgación educativa fuera del campus (clases o demostraciones en colegios y en la comunidad), incluso a cargo de estudiantes voluntarios?",
    "1 si son programadas y con un fin específico; 0,75 solo programadas; 0,25 solo con un fin específico.",
    programadosOFin("¿Las actividades hacen parte de una programación regular, responden a un fin específico o ambas cosas?")),
  // numeración por confirmar contra el portal de envío
  ind("4.3.5", "doc", 6.8, 4, "Política de acceso al aprendizaje permanente",
    "¿Tiene una política que garantice a todos el acceso a estas actividades, sin importar raza, religión, discapacidad, situación migratoria o género?",
    "1 si existe la política." + REVISION),
  ind("4.4.1", "dato", 30.8, 0, "Estudiantes de primera generación",
    "Estudiantes (EJC) que empezaron un pregrado en 2025 y cuántos son los primeros de su familia inmediata en ir a la universidad.", CIFRA),

  /* ── ODS 5 · Igualdad de género ────────────────────────────────────────── */
  inv(5, 27, "Proporción de autoras (10 %), CiteScore (10 %) y número de publicaciones (7 %) sobre igualdad de género."),
  ind("5.2.1", "dato", 15.4, 0, "Mujeres de primera generación",
    "Mujeres (EJC) que empezaron un pregrado en 2025 y cuántas son las primeras de su familia inmediata en ir a la universidad.", CIFRA),
  ind("5.3.1", "ev", 1.6, 3, "Seguimiento del acceso de las mujeres",
    "¿Mide y sigue de forma sistemática las solicitudes, la admisión y la matrícula de mujeres?",
    "1 si hay medición y seguimiento sistemáticos."),
  ind("5.3.2", "doc", 4.6, 4, "Política de acceso de las mujeres",
    "¿Tiene una política (p. ej., un plan de acceso y participación) sobre solicitudes, admisión, matrícula y participación de las mujeres?",
    "1 si existe la política." + REVISION),
  ind("5.3.3", "ev", 4.6, 3, "Programas de matrícula para mujeres",
    "¿Ofrece a las mujeres programas de matrícula como asesoría, becas u otras medidas?",
    "Hasta 1: 0,4 por asesoría, 0,4 por becas y 0,2 por otras medidas."),
  ind("5.3.4", "ev", 4.6, 3, "Mujeres en áreas donde están infrarrepresentadas",
    "¿Fomenta que las mujeres se inscriban en áreas donde están infrarrepresentadas, con acercamiento propio o en campañas con otras universidades, la comunidad, el gobierno u ONG?",
    "0,5 por acercamiento de la universidad y 0,5 por colaboraciones; 1 con ambas."),
  ind("5.4.1", "dato", 15.4, 0, "Académicas sénior",
    "Personal académico sénior (EJC) en 2025 y cuántas son mujeres.", CIFRA),
  ind("5.5.1", "dato", 11.5, 0, "Grados obtenidos por mujeres",
    "Graduados de 2025 por área (CTIM, Medicina, Artes, Humanidades y Ciencias Sociales) y cuántas son mujeres.", CIFRA),
  ind("5.6.1", "doc", 1.95, 4, "Política contra la discriminación de las mujeres",
    "¿Tiene una política contra la discriminación de las mujeres, que incluya conductas sexuales inapropiadas?",
    "1 si existe la política." + REVISION),
  ind("5.6.2", "doc", 1.95, 4, "Política contra la discriminación de personas trans",
    "¿Tiene una política contra la discriminación de las personas transgénero?",
    "1 si existe la política." + REVISION),
  ind("5.6.3", "doc", 0.95, 4, "Política de maternidad",
    "¿Tiene una política de maternidad que apoye la participación de las mujeres?",
    "1 si existe la política." + REVISION),
  // numeración por confirmar contra el portal de envío
  ind("5.6.4", "ev", 1.9, 3, "Cuidado infantil para estudiantes",
    "¿Tiene un servicio de guardería que permita a las estudiantes que acaban de ser madres asistir a clase?",
    "1 si es gratuito; 0,25 si es de pago.", gratuidad("¿El servicio de guardería es gratuito para las estudiantes?")),
  // numeración por confirmar contra el portal de envío
  ind("5.6.5", "ev", 1.9, 3, "Cuidado infantil para el personal",
    "¿Tiene servicios de guardería para el personal y el cuerpo docente?",
    "1 si es gratuito; 0,25 si es de pago.", gratuidad("¿El servicio de guardería es gratuito para el personal?")),
  // numeración por confirmar contra el portal de envío
  ind("5.6.6", "ev", 1.9, 3, "Mentoría para mujeres",
    "¿Tiene programas de mentoría para mujeres en los que participe al menos el 10 % de las estudiantes?",
    "1 si existen los programas con esa participación.",
    {
      clave: "participacion",
      texto: "¿Participa en los programas de mentoría al menos el 10 % de las estudiantes?",
      opciones: [
        { valor: "1", etiqueta: "Sí, al menos el 10 %" },
        { valor: "0", etiqueta: "No, menos del 10 %" },
      ],
      por_defecto: "0",
    }),
  // numeración por confirmar contra el portal de envío
  ind("5.6.7", "ev", 1.9, 3, "Seguimiento de la graduación de las mujeres",
    "¿Mide la probabilidad de graduación de las mujeres frente a la de los hombres y tiene programas para cerrar la brecha?",
    "1 si existe la medición o el seguimiento."),
  ind("5.6.8", "doc", 1.9, 4, "Política de protección a quien denuncia",
    "¿Tiene una política que proteja contra represalias académicas o laborales a quienes denuncian una discriminación?",
    "1 si existe la política." + REVISION),
  ind("5.6.9", "doc", 0.95, 4, "Política de paternidad",
    "¿Tiene una política de paternidad que apoye la participación de las mujeres permitiendo que los padres asuman el cuidado de los hijos?",
    "1 si existe la política." + REVISION),

  /* ── ODS 6 · Agua limpia y saneamiento ─────────────────────────────────── */
  inv(6, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre agua y saneamiento."),
  ind("6.2.1", "ev", 9.5, 3, "Seguimiento del consumo de agua",
    "¿Mide el volumen total de agua que usa la universidad, tomada de la red, desalinizada o extraída de ríos, lagos o acuíferos?",
    "1 si la medición cubre toda la universidad; 0,5 si es parcial.", MEDICION_TOTAL),
  ind("6.2.2", "dato", 9.5, 0, "Consumo de agua por persona",
    "Metros cúbicos de agua tratada o extraída usados en 2025 y población del campus (estudiantes y empleados EJC).",
    "Solo puntúa si en 6.2.1 la medición cubre toda la universidad. " + CIFRA),
  ind("6.3.1", "ev", 4.6, 3, "Tratamiento de aguas residuales",
    "¿Tiene un proceso para tratar las aguas residuales?", "1 si existe el proceso."),
  ind("6.3.2", "ev", 4.6, 3, "Prevención de la contaminación del agua",
    "¿Tiene procesos para evitar que agua contaminada llegue al sistema hídrico, incluida la que causan accidentes o incidentes en la universidad?",
    "1 si existen los procesos."),
  ind("6.3.3", "ev", 4.6, 3, "Agua potable gratuita",
    "¿Ofrece agua potable gratuita a estudiantes, personal o visitantes (por ejemplo, fuentes o bebederos)?",
    "1 si existe el abastecimiento."),
  ind("6.3.4", "ev", 4.6, 3, "Construcción que ahorra agua",
    "¿Aplica estándares de construcción para reducir el uso de agua?", "1 si se aplican los estándares."),
  ind("6.3.5", "ev", 4.6, 3, "Paisajismo que ahorra agua",
    "¿Usa un paisajismo que reduce el uso de agua (por ejemplo, plantas resistentes a la sequía)?", "1 si existe ese paisajismo."),
  ind("6.4.1", "doc", 6, 4, "Política de reutilización del agua",
    "¿Tiene una política para maximizar la reutilización del agua en la universidad?", "1 si existe la política." + REVISION),
  ind("6.4.2", "ev", 6, 3, "Medición de la reutilización del agua",
    "¿Mide la reutilización del agua en la universidad?", "1 si existe la medición."),
  ind("6.5.1", "ev", 3.8, 3, "Educación a la comunidad sobre gestión del agua",
    "¿Ofrece a las comunidades locales oportunidades educativas para aprender a gestionar bien el agua?",
    "1 si hay oportunidades gratuitas (solas o junto a otras de pago); 0,25 si solo son de pago.",
    gratuidad("¿Hay oportunidades gratuitas para la comunidad?")),
  // La metodología no tiene 6.5.2: pasa de 6.5.1 a 6.5.3.
  ind("6.5.3", "ev", 3.8, 3, "Conservación del agua fuera del campus",
    "¿Apoya la conservación del agua fuera del campus, en la comunidad local u otro lugar?", "1 si existe el apoyo."),
  ind("6.5.4", "ev", 3.8, 3, "Extracción sostenible de agua",
    "Donde la universidad extrae agua (acuíferos, lagos, ríos), dentro o fuera del campus, ¿usa tecnologías de extracción sostenibles?",
    "1 si existen tecnologías aplicables."),
  ind("6.5.5", "ev", 3.8, 3, "Cooperación en seguridad hídrica",
    "¿Coopera con gobiernos locales, regionales, nacionales o globales en la seguridad del agua?",
    "0,25 por cada cooperación: local, regional, nacional y global."),
  ind("6.5.6", "ev", 1.9, 3, "Uso consciente del agua en el campus",
    "¿Fomenta activamente el uso consciente del agua en el campus?", "1 si existen las campañas."),
  ind("6.5.7", "ev", 1.9, 3, "Uso consciente del agua en la comunidad",
    "¿Fomenta activamente el uso consciente del agua en la comunidad en general?", "1 si existen las campañas."),

  /* ── ODS 7 · Energía asequible y no contaminante ───────────────────────── */
  inv(7, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre energía y eficiencia energética."),
  ind("7.2.1", "doc", 3.85, 4, "Política de construcción eficiente",
    "¿Tiene una política que obligue a que toda renovación o construcción nueva siga estándares de eficiencia energética?",
    "1 si existe la política." + REVISION),
  // numeración por confirmar contra el portal de envío
  ind("7.2.2", "doc", 3.85, 3, "Plan para modernizar edificios",
    "¿Tiene planes para actualizar los edificios existentes y hacerlos más eficientes energéticamente?",
    "1 si existen los planes."),
  // numeración por confirmar contra el portal de envío
  ind("7.2.3", "ev", 3.85, 3, "Proceso de reducción de emisiones",
    "¿Tiene un proceso para gestionar el carbono y reducir las emisiones de dióxido de carbono?",
    "1 si existe el proceso."),
  ind("7.2.4", "doc", 3.85, 3, "Plan para reducir el consumo de energía",
    "¿Tiene un plan de eficiencia energética para reducir el consumo general de energía?",
    "1 si existe el plan."),
  ind("7.2.5", "ev", 3.8, 3, "Revisión del malgasto de energía",
    "¿Hace revisiones del uso de la energía para identificar dónde se desperdicia más?",
    "1 si existen las revisiones."),
  ind("7.2.6", "doc", 3.8, 4, "Política de desinversión",
    "¿Tiene una política de desinversión en industrias energéticas intensivas en carbono, sobre todo carbón y petróleo?",
    "1 si existe la política." + REVISION),
  ind("7.3.1", "dato", 17, 0, "Energía por metro cuadrado",
    "Energía total usada en 2025 (GJ) y superficie de los edificios de la universidad (m²).", CIFRA),
  ind("7.4.1", "ev", 4.6, 3, "Divulgación sobre eficiencia energética",
    "¿Ofrece programas a la comunidad local sobre la importancia de la eficiencia energética y la energía limpia?",
    "1 si existen los programas."),
  ind("7.4.2", "ev", 4.6, 3, "Compromiso con energía 100 % renovable",
    "¿Promueve, más allá de la universidad, un compromiso público con la energía 100 % renovable?",
    "1 si existe la promoción."),
  ind("7.4.3", "ev", 4.6, 3, "Servicios de eficiencia energética a la industria",
    "¿Presta servicios directos a la industria local para mejorar la eficiencia energética y la energía limpia (auditorías, talleres, estudios de renovables)?",
    "1 si hay servicios gratuitos (solos o junto a otros de pago); 0,25 si solo son de pago.",
    gratuidad("¿Hay servicios gratuitos para la industria?")),
  ind("7.4.4", "ev", 4.6, 3, "Políticas de energía limpia con el gobierno",
    "¿Informa y apoya a los gobiernos en políticas sobre tecnologías de energía limpia y eficiencia energética?",
    "0,25 por cada cooperación: local, regional, nacional y global."),
  ind("7.4.5", "ev", 4.6, 3, "Apoyo a la innovación baja en carbono",
    "¿Ayuda a empresas nuevas que promueven una economía o tecnología baja en carbono?",
    "1 si existe la ayuda."),
  ind("7.5.1", "dato", 10, 0, "Uso de energía baja en carbono",
    "Energía total usada en 2025 (GJ) y cuánta proviene de fuentes bajas en carbono (sin biomasa forestal).", CIFRA),

  /* ── ODS 8 · Trabajo decente y crecimiento económico ───────────────────── */
  inv(8, 27, "CiteScore (14 %) y número de publicaciones (13 %) sobre trabajo decente y crecimiento económico."),
  ind("8.2.1", "ev", 2.45, 3, "Salario digno",
    "¿Paga a todo el personal y cuerpo docente al menos el salario digno (el local, si el gobierno lo fija, o el umbral de pobreza de una familia de cuatro, por hora)?",
    "1 si se paga el salario digno."),
  ind("8.2.2", "ev", 1.22, 3, "Reconocimiento de sindicatos",
    "¿Reconoce los sindicatos para todas las personas, incluidas las mujeres y el personal internacional?",
    "1 si existe el reconocimiento."),
  ind("8.2.3", "doc", 2.45, 4, "Política contra la discriminación laboral",
    "¿Tiene una política contra la discriminación en el trabajo (religión, orientación sexual, género, edad, condición de refugiado…)?",
    "1 si existe la política." + REVISION),
  // numeración por confirmar contra el portal de envío
  ind("8.2.4", "doc", 2.45, 4, "Política contra la esclavitud moderna",
    "¿Tiene una política que prohíba el trabajo forzado, la esclavitud moderna, la trata de personas y el trabajo infantil?",
    "1 si existe la política." + REVISION),
  // numeración por confirmar contra el portal de envío
  ind("8.2.5", "doc", 2.45, 4, "Derechos de los trabajadores contratados",
    "¿Tiene una política que garantice derechos equivalentes a los trabajadores cuando se contratan actividades con terceros?",
    "1 si existe la política." + REVISION),
  ind("8.2.6", "doc", 2.45, 4, "Política de equidad salarial",
    "¿Tiene una política de equidad salarial, con el compromiso de medir y eliminar la brecha salarial de género?",
    "1 si existe la política." + REVISION),
  ind("8.2.7", "ev", 2.45, 3, "Seguimiento de la brecha salarial de género",
    "¿Mide o hace seguimiento de la igualdad de género en los salarios?",
    "1 si existen las mediciones."),
  ind("8.2.8", "ev", 2.45, 3, "Proceso de apelación",
    "¿Tiene un proceso para que los empleados apelen decisiones sobre su remuneración, sus derechos laborales o sus evaluaciones de desempeño?",
    "1 si existe el proceso."),
  ind("8.2.9", "ev", 1.22, 3, "Derechos laborales",
    "¿Reconoce los derechos laborales (libertad de asociación y negociación colectiva) para todas las personas, incluidas las mujeres y el personal internacional?",
    "1 si existe el reconocimiento."),
  ind("8.3.1", "dato", 15.4, 0, "Gasto por empleado",
    "Gasto total de la universidad en 2025 y número de empleados (EJC, incluidos los servicios contratados).", CIFRA),
  ind("8.4.1", "dato", 19, 0, "Estudiantes con prácticas laborales",
    "Estudiantes (EJC) en 2025 y cuántos hicieron prácticas obligatorias de más de un mes.", CIFRA),
  ind("8.5.1", "dato", 19, 0, "Empleados con contratos estables",
    "Empleados (EJC) en 2025 y cuántos tienen contratos de más de 24 meses.", CIFRA),

  /* ── ODS 9 · Industria, innovación e infraestructura ───────────────────── */
  inv(9, 11.6, "Número de publicaciones sobre industria, innovación e infraestructura."),
  inv(9, 15.4, "Número de patentes (OMPI, Oficina Europea, EE. UU., Reino Unido, Japón) que citan investigación de la universidad.", "9.2.1", "Patentes que citan la investigación"),
  ind("9.3", "dato", 34.6, 0, "Empresas derivadas",
    "Número de empresas derivadas (spin-off) activas, creadas para explotar propiedad intelectual de la universidad y con al menos tres años.", CIFRA),
  ind("9.4.1", "dato", 38.4, 0, "Ingresos de investigación de la industria",
    "Ingresos de investigación de la industria y el comercio en 2025 y personal académico (EJC), por área (CTIM, Medicina, Artes y Ciencias Sociales).", CIFRA),

  /* ── ODS 10 · Reducción de las desigualdades ───────────────────────────── */
  inv(10, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre reducción de las desigualdades."),
  ind("10.2.1", "dato", 15.5, 0, "Estudiantes de primera generación",
    "Estudiantes (EJC) que empezaron un pregrado en 2025 y cuántos son los primeros de su familia inmediata en ir a la universidad.", CIFRA),
  ind("10.3.1", "dato", 15.5, 0, "Estudiantes de países en desarrollo",
    "Estudiantes (EJC) en 2025 y cuántos son internacionales de países de ingresos bajos o medianos bajos con ayuda económica importante.", CIFRA),
  ind("10.4.1", "dato", 11.5, 0, "Estudiantes con discapacidad",
    "Estudiantes (EJC) en 2025 y cuántos tienen una discapacidad.", CIFRA),
  ind("10.5.1", "dato", 11.5, 0, "Empleados con discapacidad",
    "Empleados (EJC) en 2025 y cuántos tienen una discapacidad.", CIFRA),
  ind("10.6.1", "doc", 1.9, 4, "Política de admisión no discriminatoria",
    "¿Tiene una política de admisión no discriminatoria, o que explique la lógica de cualquier acción afirmativa en la admisión?",
    "1 si existe la política." + REVISION),
  ind("10.6.2", "ev", 1.9, 3, "Seguimiento de solicitudes de grupos infrarrepresentados",
    "¿Mide y sigue las solicitudes y admisiones de grupos infrarrepresentados (minorías étnicas, bajos ingresos, mujeres, LGBT, discapacidad, refugiados…)?",
    "1 si existen las mediciones."),
  ind("10.6.3", "ev", 1.9, 3, "Vinculación de grupos infrarrepresentados",
    "¿Tiene programas para atraer y vincular a estudiantes, personal y docentes de grupos infrarrepresentados?",
    "1 si existe el programa."),
  ind("10.6.4", "doc", 0.95, 4, "Política contra la discriminación",
    "¿Tiene una política contra la discriminación que cubra la institución y sus operaciones?",
    "1 si existe la política." + REVISION),
  ind("10.6.5", "ev", 1.9, 3, "Responsable de diversidad",
    "¿Tiene un comité, oficina o responsable de diversidad e igualdad, encargado por el órgano de gobierno, que asesore e implemente políticas, programas y formación en diversidad, inclusión y derechos humanos?",
    "1 si existe el comité o responsable."),
  ind("10.6.6", "ev", 1.9, 3, "Apoyo a grupos infrarrepresentados",
    "¿Ofrece mentoría, asesoría o apoyo entre pares a estudiantes, personal y docentes de grupos infrarrepresentados?",
    "1 si existen los programas."),
  ind("10.6.7", "ev", 1.9, 3, "Instalaciones accesibles",
    "¿Tiene instalaciones accesibles para personas con discapacidad?", "1 si existen las instalaciones."),
  ind("10.6.8", "ev", 1.9, 3, "Servicios de apoyo a la discapacidad",
    "¿Tiene servicios de apoyo para personas con discapacidad?", "1 si existen los servicios."),
  ind("10.6.9", "ev", 1.9, 3, "Programas de acceso para personas con discapacidad",
    "¿Ofrece programas de acceso a personas con discapacidad, como asesoría y otro apoyo dirigido?",
    "1 con asesoría, con otro apoyo dirigido o con ambos (máximo 1)."),
  ind("10.6.10", "doc", 1.9, 3, "Política de ajustes razonables",
    "¿Tiene una política o estrategia de ajustes razonables para personas con discapacidad, con financiación adecuada?",
    "1 si existe la política o estrategia."),
  ind("10.6.11", "doc", 0.95, 4, "Política contra el acoso",
    "¿Tiene una política contra el acoso que cubra la institución y sus operaciones?",
    "1 si existe la política." + REVISION),

  /* ── ODS 11 · Ciudades y comunidades sostenibles ───────────────────────── */
  inv(11, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre ciudades y comunidades sostenibles."),
  ind("11.2.1", "ev", 3.75, 3, "Acceso público a edificios patrimoniales",
    "¿Da acceso público a edificios, monumentos o paisajes naturales de importancia cultural?",
    "1 si el acceso es gratuito a todos los importantes; 0,5 gratuito a algunos; 0,25 de pago.",
    accesoGratuito("¿El público entra gratis a todos los edificios patrimoniales, a algunos, o pagando?", "Gratis a todos", "Gratis a algunos", "0.5")),
  ind("11.2.2", "ev", 3.75, 3, "Acceso público a bibliotecas",
    "¿Da acceso público a sus bibliotecas, incluidos libros y publicaciones?",
    "1 si el acceso público y gratuito es automático; 0,75 si es a todas las bibliotecas previa solicitud; 0,25 solo en ciertas circunstancias.",
    {
      clave: "acceso",
      texto: "¿Cómo entra el público a las bibliotecas?",
      opciones: [
        { valor: "1", etiqueta: "Libre y gratuito, sin trámite" },
        { valor: "0.75", etiqueta: "A todas, previa solicitud" },
        { valor: "0.25", etiqueta: "Solo en ciertas circunstancias" },
      ],
      por_defecto: "0.75",
    }),
  ind("11.2.3", "ev", 3.75, 3, "Acceso público a museos",
    "¿Da acceso público a museos, salas de exposición, galerías y obras de arte?",
    "1 si el acceso es gratuito a todos los museos y galerías; 0,5 a algunos; 0,25 de pago.",
    accesoGratuito("¿El público entra gratis a todos los museos y galerías, a algunos, o pagando?", "Gratis a todos", "Gratis a algunos", "1")),
  ind("11.2.4", "ev", 3.75, 3, "Acceso público a zonas verdes",
    "¿Da acceso público gratuito a espacios abiertos y zonas verdes?",
    "1 si el acceso gratuito es permanente; 0,5 si es ocasional; 0,25 de pago.",
    accesoGratuito("¿El público entra gratis a las zonas verdes siempre, solo en ocasiones, o pagando?", "Gratis, siempre", "Gratis, en ocasiones", "0.5")),
  ind("11.2.5", "ev", 3.8, 3, "Contribución a las artes locales",
    "¿Contribuye al arte local con presentaciones públicas de coros, grupos de teatro, orquestas u otros grupos de la universidad?",
    "1 con más de 30 presentaciones al año; 0,75 con más de 15; 0,25 solo presentaciones puntuales.",
    {
      clave: "presentaciones",
      texto: "¿Cuántas presentaciones públicas hicieron los grupos artísticos en el año?",
      opciones: [
        { valor: "1", etiqueta: "Más de 30" },
        { valor: "0.75", etiqueta: "Más de 15" },
        { valor: "0.25", etiqueta: "Solo algunas puntuales" },
      ],
      por_defecto: "0.75",
    }),
  ind("11.2.6", "ev", 3.8, 3, "Patrimonio cultural inmaterial",
    "¿Tiene proyectos para documentar y conservar el patrimonio cultural inmaterial (folclor, tradiciones, lenguas, saberes locales), incluido el de comunidades desplazadas?",
    "0,33 por patrimonio local o regional, 0,33 por nacional y 0,33 por el de comunidades desplazadas; 1 con los tres."),
  ind("11.3.1", "dato", 15.3, 0, "Gasto en arte y patrimonio",
    "Gasto total de la universidad en 2025 y cuánto se dedicó al arte y al patrimonio (sin instalaciones deportivas).", CIFRA),
  ind("11.4.1", "ev", 3.9, 3, "Metas de transporte sostenible",
    "¿Mide y fija metas para un transporte más sostenible (a pie, bicicleta, vehículo compartido, transporte público, vehículos eléctricos)?",
    "1 si existen las mediciones y metas."),
  ind("11.4.2", "ev", 3.9, 3, "Promoción del transporte sostenible",
    "¿Hace acciones para promover un transporte más sostenible?", "1 si existen las acciones."),
  ind("11.4.3", "ev", 3.9, 3, "Teletrabajo",
    "¿Promueve o permite el teletrabajo como práctica o por política, u ofrece semana laboral comprimida para reducir los desplazamientos?",
    "1 si existe el teletrabajo."),
  ind("11.4.4", "ev", 3.9, 3, "Vivienda asequible para empleados",
    "¿Ofrece vivienda asequible a sus empleados?",
    "0,33 por evaluar la asequibilidad, 0,33 por dar vivienda directamente y 0,33 por ayuda económica; 1 con las tres."),
  ind("11.4.5", "ev", 3.9, 3, "Vivienda asequible para estudiantes",
    "¿Ofrece vivienda asequible a sus estudiantes?",
    "0,33 por evaluar la asequibilidad, 0,33 por dar vivienda directamente y 0,33 por ayuda económica; 1 con las tres."),
  ind("11.4.6", "ev", 3.9, 3, "Prioridad al peatón en el campus",
    "¿Da prioridad al acceso peatonal en el campus?", "1 si existe la priorización."),
  ind("11.4.7", "ev", 3.9, 3, "Planificación urbana con autoridades locales",
    "¿Colabora con las autoridades locales en planificación y desarrollo urbano, incluido el acceso de los residentes a vivienda asequible?",
    "1 si existe la colaboración."),
  ind("11.4.8", "ev", 3.9, 3, "Estándares sostenibles en obras nuevas",
    "¿Construye los edificios nuevos con estándares sostenibles (por ejemplo, certificación LEED)?", "1 si existen los estándares."),
  ind("11.4.9", "ev", 3.9, 3, "Construcción en terrenos ya edificados",
    "¿Construye, siempre que es posible, en terrenos ya edificados o infrautilizados?", "1 si existe esa práctica."),

  /* ── ODS 12 · Producción y consumo responsables ────────────────────────── */
  inv(12, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre producción y consumo responsables."),
  ind("12.2.1", "doc", 4.8, 4, "Política de compras éticas",
    "¿Tiene una política de abastecimiento ético de alimentos y suministros?", "1 si existe la política." + REVISION),
  // 12.2.2 fue eliminado de la metodología.
  ind("12.2.3", "doc", 4.8, 4, "Residuos peligrosos",
    "¿Tiene una política, un proceso o una práctica para eliminar los residuos que cubra los materiales peligrosos?",
    "1 si existe la política." + REVISION),
  ind("12.2.4", "doc", 4.8, 4, "Residuos que van al relleno sanitario",
    "¿Tiene una política de eliminación de residuos que mida cuánto va al relleno sanitario y cuánto se recicla?",
    "1 si existe la política." + REVISION),
  ind("12.2.5", "doc", 4.8, 4, "Política para reducir plásticos",
    "¿Tiene políticas para reducir el uso de plásticos?", "1 si existen las políticas." + REVISION),
  // peso leído por la suma de la métrica (26,7 %): la extracción descoloca las columnas de 12.2.5 a 12.2.8.
  ind("12.2.6", "doc", 4.8, 4, "Política para reducir desechables",
    "¿Tiene políticas para reducir el uso de artículos desechables (de un solo uso)?", "1 si existen las políticas." + REVISION),
  ind("12.2.7", "ev", 1.35, 3, "Políticas extendidas a servicios contratados",
    "¿Garantiza que estas políticas se apliquen a los servicios contratados en el campus (cafeterías, aseo, vigilancia) y a la cadena de suministro?",
    "1 si existe la extensión."),
  ind("12.2.8", "ev", 1.35, 3, "Políticas extendidas a proveedores",
    "¿Garantiza que estas políticas se apliquen a los proveedores (equipos, papelería, contratos de construcción)?",
    "1 si existe la extensión."),
  ind("12.3.1", "ev", 13.5, 3, "Seguimiento de residuos",
    "¿Mide la cantidad de residuos que se generan y se reciclan en la universidad?",
    "1 si la medición cubre toda la universidad; 0,5 si es parcial.", MEDICION_TOTAL),
  ind("12.3.2", "dato", 13.5, 0, "Residuos reciclados",
    "Toneladas de residuos generados en 2025, cuántas se reciclaron y cuántas fueron al relleno sanitario.",
    "Solo puntúa si en 12.3.1 la medición cubre toda la universidad. " + CIFRA),
  ind("12.4.1", "doc", 19.3, 3, "Informe de sostenibilidad",
    "¿Publicó la universidad un informe de sostenibilidad (independiente o dentro del informe anual) entre 2024 y 2026?",
    "1 si es anual; 0,6 si es cada dos años; 0,3 si es menos frecuente.",
    {
      clave: "frecuencia",
      texto: "¿Cada cuánto se publica el informe de sostenibilidad?",
      opciones: [
        { valor: "1", etiqueta: "Cada año" },
        { valor: "0.6", etiqueta: "Cada dos años" },
        { valor: "0.3", etiqueta: "Con menos frecuencia" },
      ],
      por_defecto: "1",
    }),

  /* ── ODS 13 · Acción por el clima ──────────────────────────────────────── */
  inv(13, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre acción por el clima."),
  ind("13.2.1", "ev", 13.5, 3, "Seguimiento de la energía baja en carbono",
    "¿Mide la cantidad de energía baja en carbono que usa la universidad?",
    "1 si la medición cubre toda la universidad; 0,5 si es parcial.", MEDICION_TOTAL),
  ind("13.2.2", "dato", 13.5, 0, "Uso de energía baja en carbono",
    "Energía total usada en 2025 (GJ) y cuánta proviene de fuentes bajas en carbono (sin biomasa forestal).",
    "Solo puntúa si en 13.2.1 hay medición. " + CIFRA),
  ind("13.3.1", "ev", 4.6, 3, "Educación local sobre el clima",
    "¿Ofrece programas o campañas de educación local sobre riesgos, impactos, mitigación, adaptación y alerta temprana del cambio climático?",
    "1 si existen los programas o campañas."),
  ind("13.3.2", "doc", 4.6, 3, "Plan de acción climática compartido",
    "¿Tiene un plan de acción por el clima compartido con el gobierno local y grupos comunitarios?",
    "1 si existe el plan."),
  ind("13.3.3", "ev", 4.6, 3, "Planificación conjunta ante desastres climáticos",
    "¿Participa con el gobierno en la planificación cooperativa para desastres por el cambio climático, incluido el desplazamiento de personas?",
    "1 si es local y regional; 0,5 si solo es local o solo regional."),
  ind("13.3.4", "ev", 4.6, 3, "Apoyo al gobierno en alerta temprana",
    "¿Informa y apoya al gobierno local o regional en la alerta temprana y el monitoreo de riesgos y desastres climáticos?",
    "1 si existe el apoyo."),
  ind("13.3.5", "ev", 4.6, 3, "Colaboración con ONG en adaptación climática",
    "¿Colabora con ONG en la adaptación al cambio climático?", "1 si existen las colaboraciones."),
  ind("13.4.1", "doc", 11.5, 5, "Compromiso de neutralidad de carbono",
    "¿Tiene una fecha meta para ser neutral en carbono según el protocolo de gases de efecto invernadero?",
    "Existencia de la meta (sin puntaje aparte); por alcances, hasta 3: 0 solo alcance 1 o desconocido, 1 alcances 1 y 2, 2 alcances 1, 2 y 3 parcial, 3 los tres completos. Solo cuentan créditos de carbono de remoción permanente."),
  ind("13.4.2", "dato", 11.5, 0, "Fecha de la neutralidad de carbono",
    "Año en que se logró, o se logrará, la neutralidad de carbono de los alcances 1 y 2.",
    "4 si se logró antes de 2025; 3 en 2025-2029; 2 en 2030-2039; 1 en 2040-2049; 0,5 en 2050 o después."),

  /* ── ODS 14 · Vida submarina ───────────────────────────────────────────── */
  inv(14, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre océanos, mares y recursos marinos."),
  ind("14.2.1", "ev", 5.1, 3, "Educación sobre ecosistemas de agua dulce",
    "¿Ofrece a comunidades locales o nacionales programas educativos sobre ecosistemas de agua dulce (riego, gestión y conservación del agua)?",
    "1 si son gratuitos; 0,25 si son de pago.", gratuidad("¿Los programas son gratuitos?")),
  ind("14.2.2", "ev", 5.1, 3, "Educación sobre pesca sostenible",
    "¿Ofrece a comunidades locales o nacionales un programa educativo o de divulgación sobre la gestión sostenible de la pesca, la acuicultura y el turismo?",
    "1 si es gratuito; 0,25 si es de pago.", gratuidad("¿El programa es gratuito?")),
  ind("14.2.3", "ev", 5.1, 3, "Divulgación sobre la sobrepesca",
    "¿Hace divulgación educativa en comunidades locales o nacionales sobre la sobrepesca, la pesca ilegal o no regulada y las prácticas destructivas?",
    "1 si es gratuita; 0,25 si es de pago.", gratuidad("¿Las actividades son gratuitas?")),
  ind("14.3.1", "ev", 4.85, 3, "Eventos por la conservación acuática",
    "¿Apoya u organiza eventos para promover la conservación y el uso sostenible de océanos, mares, lagos, ríos y recursos marinos?",
    "1 si existen los eventos."),
  ind("14.3.2", "doc", 4.85, 4, "Política de alimentos acuáticos sostenibles",
    "¿Tiene una política para que los alimentos del campus que vienen de ecosistemas acuáticos se obtengan de forma sostenible?",
    "1 si existe la política." + REVISION),
  ind("14.3.3", "ev", 4.85, 3, "Trabajo directo por los ecosistemas acuáticos",
    "¿Trabaja directamente (investigación o trabajo con la industria) para mantener y ampliar los ecosistemas acuáticos y su biodiversidad, sobre todo los amenazados?",
    "1 si existe el trabajo directo."),
  ind("14.3.4", "ev", 4.85, 3, "Tecnologías contra el daño acuático",
    "¿Trabaja directamente (investigación o trabajo con la industria) en tecnologías o prácticas que reduzcan o eviten el daño del sector marino a los ecosistemas acuáticos?",
    "1 si existe el trabajo directo."),
  ind("14.4.1", "doc", 6.45, 3, "Estándares para el vertimiento de agua",
    "¿Tiene pautas y estándares de calidad del agua para sus vertimientos, que protejan ecosistemas, fauna y salud humana?",
    "1 si existen las pautas y estándares."),
  ind("14.4.2", "doc", 6.45, 3, "Plan para reducir residuos plásticos",
    "¿Tiene un plan de acción para reducir los residuos plásticos en el campus?", "1 si existe el plan."),
  ind("14.4.3", "doc", 6.4, 4, "Política contra la contaminación marina",
    "¿Tiene una política para prevenir y reducir la contaminación marina de todo tipo, en especial la que viene de actividades en tierra?",
    "1 si existe la política." + REVISION),
  ind("14.5.1", "doc", 3.8, 3, "Plan para minimizar alteraciones acuáticas",
    "¿Tiene un plan para minimizar los cambios físicos, químicos y biológicos de los ecosistemas acuáticos relacionados con la universidad?",
    "1 si existe el plan."),
  ind("14.5.2", "ev", 3.8, 3, "Monitoreo de ecosistemas acuáticos",
    "¿Monitorea la salud de los ecosistemas acuáticos locales?", "1 si existe el monitoreo."),
  ind("14.5.3", "ev", 3.8, 3, "Programas de buenas prácticas acuáticas",
    "¿Desarrolla y apoya programas e incentivos que fomenten buenas prácticas de gestión del agua?",
    "1 si son continuos; 0,25 si son puntuales.",
    {
      clave: "continuidad",
      texto: "¿Los programas son continuos o fueron actividades puntuales?",
      opciones: [
        { valor: "1", etiqueta: "Continuos" },
        { valor: "0.25", etiqueta: "Puntuales" },
      ],
      por_defecto: "1",
    }),
  ind("14.5.4", "ev", 3.8, 3, "Colaboración por ecosistemas acuáticos compartidos",
    "¿Colabora con la comunidad local para mantener ecosistemas acuáticos compartidos?", "1 si existe la colaboración."),
  ind("14.5.5", "doc", 3.8, 3, "Estrategia de gestión de cuencas",
    "¿Aplica estrategias de gestión de cuencas según la diversidad de especies acuáticas del lugar?", "1 si existe la estrategia."),

  /* ── ODS 15 · Vida de ecosistemas terrestres ───────────────────────────── */
  inv(15, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre ecosistemas terrestres y biodiversidad."),
  ind("15.2.1", "ev", 4.6, 3, "Eventos por el uso sostenible de la tierra",
    "¿Apoya u organiza eventos para promover la conservación y el uso sostenible de la tierra, incluidos bosques y zonas silvestres?",
    "1 si existen los eventos."),
  ind("15.2.2", "doc", 4.6, 4, "Política de alimentos de cultivo sostenible",
    "¿Tiene políticas para que los alimentos del campus se cultiven de forma sostenible?", "1 si existen las políticas." + REVISION),
  ind("15.2.3", "ev", 4.6, 3, "Biodiversidad de los ecosistemas existentes",
    "¿Trabaja directamente para mantener y ampliar los ecosistemas existentes y su biodiversidad, sobre todo los amenazados?",
    "1 si existe el trabajo directo."),
  ind("15.2.4", "ev", 4.6, 3, "Educación sobre ecosistemas",
    "¿Ofrece a comunidades locales o nacionales programas educativos sobre ecosistemas (flora y fauna)?",
    "1 si el acceso es gratuito; 0,25 si es de pago.", gratuidad("¿El acceso a los programas es gratuito?")),
  ind("15.2.5", "ev", 2.3, 3, "Gestión sostenible de la tierra para la agricultura",
    "¿Ofrece a comunidades locales o nacionales programas educativos o de divulgación sobre gestión sostenible de la tierra para la agricultura?",
    "1 si el acceso es gratuito; 0,25 si es de pago.", gratuidad("¿El acceso a los programas es gratuito?")),
  ind("15.2.6", "ev", 2.3, 3, "Gestión sostenible de la tierra para el turismo",
    "¿Ofrece a comunidades locales o nacionales programas educativos o de divulgación sobre gestión sostenible de la tierra para el turismo?",
    "1 si el acceso es gratuito; 0,25 si es de pago.", gratuidad("¿El acceso a los programas es gratuito?")),
  ind("15.3.1", "doc", 5.4, 4, "Política de uso sostenible de la tierra",
    "¿Tiene una política para conservar, restaurar y usar de forma sostenible los ecosistemas terrestres asociados a la universidad (bosques, montañas, zonas áridas)?",
    "1 si existe la política." + REVISION),
  ind("15.3.2", "doc", 5.4, 4, "Política de especies amenazadas",
    "¿Tiene una política para identificar, monitorear y proteger especies de la Lista Roja de la UICN y de listas nacionales cuyos hábitats estén en zonas afectadas por la universidad?",
    "1 si existe la política." + REVISION),
  ind("15.3.3", "ev", 5.4, 3, "Biodiversidad en la planificación",
    "¿Incluye la biodiversidad local en la planificación y el desarrollo (por ejemplo, en edificios nuevos)?",
    "1 si existe la inclusión."),
  ind("15.3.4", "doc", 5.4, 4, "Política de especies exóticas",
    "¿Tiene una política para reducir el impacto de especies exóticas (foráneas) en el campus?", "1 si existe la política." + REVISION),
  ind("15.3.5", "ev", 5.4, 3, "Colaboración por ecosistemas terrestres compartidos",
    "¿Colabora con la comunidad local para mantener ecosistemas terrestres compartidos?", "1 si existe la colaboración."),
  ind("15.4.1", "doc", 7.7, 3, "Estándares para el vertimiento de agua",
    "¿Tiene pautas y estándares de calidad del agua para sus vertimientos, que protejan ecosistemas, fauna y salud humana?",
    "1 si existen las pautas y estándares."),
  ind("15.4.2", "doc", 7.65, 4, "Política de residuos plásticos",
    "¿Tiene una política para reducir los residuos plásticos en el campus?", "1 si existe la política." + REVISION),
  ind("15.4.3", "doc", 7.65, 4, "Residuos peligrosos",
    "¿Tiene una política, un proceso o una práctica para eliminar los residuos que cubra los materiales peligrosos?",
    "1 si existe la política." + REVISION),

  /* ── ODS 16 · Paz, justicia e instituciones sólidas ────────────────────── */
  inv(16, 27, "CiteScore (10 %), FWCI (10 %) y número de publicaciones (7 %) sobre paz y justicia."),
  ind("16.2.1", "ev", 3.35, 3, "Representación elegida",
    "¿Hay representantes elegidos de estudiantes, docentes y personal no docente en el máximo órgano de gobierno de la universidad?",
    "0,33 por cada grupo con representación elegida (no designada por la universidad)."),
  ind("16.2.2", "ev", 3.35, 3, "Organización estudiantil independiente",
    "¿Reconoce una organización estudiantil independiente (sindicato o unión de estudiantes)?",
    "0,33 si aporta a la gobernanza, 0,33 si apoya a los estudiantes y 0,33 si organiza actividades sociales."),
  ind("16.2.3", "doc", 3.35, 4, "Identificación de actores locales",
    "¿Tiene políticas y procedimientos escritos para identificar a los actores locales externos a la universidad e interactuar con ellos?",
    "1 si existen las políticas." + REVISION),
  ind("16.2.4", "ev", 3.35, 3, "Órganos de participación de actores locales",
    "¿Tienen los actores locales (residentes, gobierno local, sociedad civil) un mecanismo real de participación en las decisiones de la universidad?",
    "1 si existen los órganos de participación."),
  ind("16.2.5", "doc", 3.35, 3, "Principios contra la corrupción",
    "¿Publica sus principios y compromisos frente al crimen organizado, la corrupción y el soborno?",
    "1 si existe la publicación."),
  ind("16.2.6", "doc", 6.6, 4, "Política de libertad académica",
    "¿Tiene una política que respalde la libertad académica (elegir temas de investigación y hablar y enseñar públicamente sobre ellos)?",
    "0,25 por cada área cubierta: investigación de sénior, investigación de júnior, enseñanza de sénior, enseñanza de júnior." + REVISION),
  ind("16.2.7", "doc", 3.25, 3, "Publicación de estados financieros",
    "¿Publica los datos financieros de la universidad, suficientes para analizar su probidad y viabilidad?",
    "1 si existe la publicación."),
  ind("16.3.1", "ev", 6.4, 3, "Asesoría experta al gobierno",
    "¿Brinda asesoría experta específica a gobiernos locales, regionales o nacionales (orientación de políticas, comités, aporte de evidencia)?",
    "0,33 por cada nivel de gobierno asesorado; máximo 1."),
  ind("16.3.2", "ev", 6.4, 3, "Formación para quienes hacen políticas y leyes",
    "¿Ofrece divulgación, educación o desarrollo de capacidades a quienes elaboran políticas y leyes en temas como economía, derecho, tecnología, migración o cambio climático?",
    "1 si existe la oferta."),
  ind("16.3.3", "ev", 6.4, 3, "Investigación con el gobierno",
    "¿Hace investigación orientada a políticas en colaboración con entidades del gobierno?", "1 si existe la investigación."),
  ind("16.3.4", "ev", 4, 3, "Espacio neutral de diálogo",
    "¿Ofrece una plataforma neutral y un espacio seguro para que actores políticos distintos debatan con franqueza los desafíos?",
    "1 si existe la plataforma."),
  ind("16.4.1", "dato", 23.2, 0, "Graduados en derecho",
    "Graduados totales de 2025 y cuántos terminaron programas centrados en el derecho o la aplicación de la ley.", CIFRA),

  /* ── ODS 17 · Alianzas para lograr los objetivos ───────────────────────── */
  inv(17, 27.1, "Artículos con coautores de países de ingresos bajos y medianos bajos (13,55 %) y número de publicaciones sobre los ODS 1 a 17 (13,55 %)."),
  ind("17.2.1", "ev", 3.7, 3, "Políticas de los ODS con gobierno y ONG",
    "¿Participa o aporta directamente en políticas de los ODS del gobierno nacional o de ONG regionales (diagnóstico, estrategias, modelación, monitoreo)?",
    "1 si existe la participación."),
  ind("17.2.2", "ev", 3.7, 3, "Diálogo intersectorial sobre los ODS",
    "¿Inicia o participa en diálogos intersectoriales sobre los ODS, por ejemplo conferencias con gobierno u ONG?",
    "1 si existe el diálogo."),
  ind("17.2.3", "ev", 3.7, 3, "Colaboración internacional en datos de los ODS",
    "¿Participa en colaboraciones internacionales para recoger o medir datos de los ODS?",
    "1 si existe la participación."),
  ind("17.2.4", "ev", 3.7, 3, "Buenas prácticas internacionales en los ODS",
    "¿Revisa, con colaboración e investigación internacionales, enfoques comparados y construye buenas prácticas para los ODS?",
    "1 si existe la revisión."),
  ind("17.2.5", "ev", 3.7, 3, "Colaboración con ONG por los ODS",
    "¿Colabora con ONG por los ODS mediante voluntariado estudiantil, programas de investigación o recursos educativos?",
    "0,33 por cada vía: voluntariado de estudiantes, investigación y recursos educativos."),
  // 17.3.1 a 17.3.17: un indicador por ODS, con el mismo peso (1,6 % cada uno).
  ...Array.from({ length: 17 }, (_, i) =>
    ind(`17.3.${i + 1}`, "doc", 1.6, 3, `Informe sobre el ODS ${i + 1}`,
      `¿Publica datos concretos de su desempeño en el ODS ${i + 1}, en un informe propio o dentro del informe anual?`,
      "1 si existe el informe. El envío previo a THE no cuenta como informe.")),
  ind("17.4.1", "ev", 9.06, 3, "Educación significativa en los ODS",
    "¿Tiene un compromiso con una educación significativa sobre los ODS en toda la universidad?",
    "1 si está integrada en todo el plan de estudios; 0,66 si es obligatoria para todos; 0,25 si es optativa para todos.",
    {
      clave: "alcance",
      texto: "¿Cómo llega la formación en ODS a los estudiantes?",
      opciones: [
        { valor: "1", etiqueta: "Integrada en todos los planes de estudio" },
        { valor: "0.66", etiqueta: "Obligatoria para todos" },
        { valor: "0.25", etiqueta: "Optativa para todos" },
      ],
      por_defecto: "0.25",
    }),
  ind("17.4.2", "ev", 9.06, 3, "Cursos dedicados a la sostenibilidad",
    "¿Tiene cursos dedicados (programas completos o electivas) a la sostenibilidad y los ODS?",
    "1 si existen los cursos."),
  ind("17.4.3", "ev", 9.06, 3, "Educación en ODS para la comunidad",
    "¿Tiene actividades educativas de divulgación sobre los ODS para la comunidad en general (egresados, residentes locales, personas desplazadas)?",
    "0,33 por egresados, 0,33 por comunidad local y 0,33 por personas desplazadas o refugiadas."),
  ind("17.4.4", "dato", 0, 0, "Alfabetización en sostenibilidad",
    "¿Mide los conocimientos de sus estudiantes sobre sostenibilidad (por ejemplo, con Sulitest TASK)?",
    "No puntúa en esta edición (0 %); THE la usa para decidir ediciones futuras."),
];

/** Todos los indicadores de la metodología, ordenados por ODS y número. */
export const INDICADORES_THE: IndicadorTHE[] = [...LISTA].sort(compararId);

/** Los indicadores de un ODS, en orden. */
export function indicadoresDe(ods: number): IndicadorTHE[] {
  return INDICADORES_THE.filter((x) => x.ods === ods);
}

const POR_ID = new Map(INDICADORES_THE.map((x) => [x.id, x]));

/** Un indicador por su número («4.3.2»), o undefined si no existe. */
export function indicadorPorId(id: string): IndicadorTHE | undefined {
  return POR_ID.get(id.trim());
}

/** Los que se responden con evidencia o con un documento (los que arma Pilo). */
export const INDICADORES_EVIDENCIA: IndicadorTHE[] = INDICADORES_THE.filter((x) => x.tipo === "ev" || x.tipo === "doc");

/** ODS que tienen al menos un indicador de evidencia («ev»). */
export const ODS_CON_EVIDENCIA: number[] = [...new Set(INDICADORES_THE.filter((x) => x.tipo === "ev").map((x) => x.ods))].sort((a, b) => a - b);
