/* =============================================================================
   Recolector de noticias · clasificación por ODS (sin IA, sin red).

   Una noticia recibe los ODS cuyas palabras aparecen en su título y su texto.
   Cada ODS tiene frases y raíces (sin tildes, en minúscula): una raíz como
   «vacun» cubre vacuna, vacunación, vacunar. Una frase cuenta más que una raíz
   suelta y el título pesa el triple que el texto. Una raíz solo cuenta al
   principio de una palabra («paz» no se halla en «capaz»); una entrada que
   termina en espacio («rio ») es una palabra entera.

   El puntaje (0 a 100) crece rápido con las primeras coincidencias y se frena
   después: dos notas sobre el mismo tema no deben diferir por una repetición.
   Se proponen los ODS con 35 o más y, como mucho, los tres mejores. La razón
   dice qué palabras la sostienen, para que quien revisa decida rápido.

   Flujo con Pilo (0144): el léxico es el primer filtro, barato y sin IA. Una
   nota con CUALQUIER coincidencia (aunque no llegue a 35) es «candidata» y va a
   la fila de Pilo (ai_status = 'pendiente'), que la lee y la clasifica; una sin
   ninguna coincidencia se descarta sin gastar IA.

   Las palabras que salen en casi toda nota de una universidad («estudiante»,
   «docente», «curso», «egresado», «ciudad», «bienestar» a secas, «movilidad»
   a secas) no distinguen y no están.

   Este archivo no usa Deno ni el navegador: lo importan la función
   `noticias-ods` y las pruebas (tests/noticias).
   ========================================================================== */

export const UMBRAL = 35;
export const MAX_ODS = 3;
/** El título pesa el triple que el texto, y el puntaje se frena con esta constante (los valores de fábrica). */
export const PESO_TITULO = 3;
export const SATURACION = 14;

/** Raíces sueltas y frases de un tema (de un ODS, de un pilar, de una categoría). */
export interface Entrada {
  raices: string[];
  frases: string[];
}

/** Lo que un perfil de ranking puede ajustar (0242). Sin nada, los valores de fábrica de siempre. */
export interface OpcionesLectura {
  umbral?: number;
  max?: number;
  pesoTitulo?: number;
  saturacion?: number;
  /** Palabras propias del perfil: cada una cuenta como una frase y propone el tema «propio». */
  palabras?: string[];
  /** Solo estos ODS (los activos del perfil); sin esto, los 17. */
  capas?: number[];
}

/** [raíces sueltas, frases]. Se normalizan al usarse: tildes, mayúsculas y signos no importan. */
export const LEXICO: Record<number, Entrada> = {
  1: {
    raices: ["pobreza", "vulnerab", "subsidio", "mendic", "gratuidad", "habitante de calle", "habitantes de calle", "asistencia humanitaria"],
    frases: ["bajos recursos", "estratos 1", "estrato 1", "estrato 2", "capital semilla", "poblacion vulnerable", "comunidades vulnerables", "sin hogar", "inclusion social", "familias en accion", "jovenes en accion", "renta ciudadana", "ingreso solidario", "pobreza multidimensional", "matricula cero", "auxilio economico", "kits escolares", "pobreza extrema"],
  },
  2: {
    raices: ["hambre", "nutric", "desnutric", "alimentari", "agricult", "agropecuar", "agroecolog", "agroindustri", "cultivo", "campesin", "cosecha", "huerta", "ganader", "pecuari", "zootecn", "piscicultur", "apicultur"],
    frases: ["seguridad alimentaria", "soberania alimentaria", "produccion agricola", "programa de alimentacion escolar", "pae ", "banco de alimentos", "bancos de alimentos", "comedor comunitario", "comedores comunitarios", "mercados campesinos"],
  },
  3: {
    raices: ["salud", "vacun", "enfermer", "medicin", "clinic", "hospital", "psicolog", "tamizaje", "epidemi", "odontolog", "fisioterap", "terapia", "bacteriolog", "suicid", "cancer", "diabetes", "hipertens", "telemedicina", "telesalud", "dengue", "tuberculosis", "covid", "vih "],
    frases: ["salud mental", "salud publica", "atencion materno", "estilos de vida saludable", "prevencion de", "promocion de la salud", "donacion de sangre", "donantes de sangre", "primeros auxilios", "sustancias psicoactivas", "consumo de sustancias", "seguridad vial", "accidentes de transito", "siniestros viales", "actividad fisica", "salud sexual", "embarazo adolescente", "atencion primaria", "instrumentacion quirurgica", "bienestar emocional", "pausas activas"],
  },
  // «estudiante», «docente» o «curso» salen en casi toda nota de una universidad: no distinguen y no cuentan.
  4: {
    raices: ["beca", "aprendizaje", "pedagog", "semillero", "colegio", "bachiller", "diplomado", "alfabetiz", "educacion", "lectoescritura", "licenciatura", "icetex", "escuela", "desercion", "tutoria", "mentoria", "sena "],
    frases: ["educacion superior", "calidad educativa", "acceso a la educacion", "pruebas saber", "saber pro", "saber 11", "formacion docente", "movilidad academica", "primera infancia", "educacion inclusiva", "educacion rural", "educacion continua", "permanencia estudiantil", "generacion e", "ser pilo paga", "educacion para el trabajo", "colegios publicos", "maestros rurales"],
  },
  5: {
    raices: ["mujer", "genero", "equidad", "feminis", "feminicid", "gestante", "sororidad", "empoderamiento", "lgbti"],
    frases: ["violencia de genero", "violencia contra la mujer", "igualdad de genero", "liderazgo femenino", "mujeres emprendedoras", "mujeres lideres", "mujeres en la ciencia", "ninas en la ciencia", "diversidad sexual", "acoso sexual", "violencia intrafamiliar", "madres cabeza de familia", "madre cabeza de familia", "dia de la mujer", "brecha de genero"],
  },
  6: {
    raices: ["agua", "acueducto", "saneamiento", "potabiliz", "cuenca", "rio ", "hidric", "alcantarill", "humedal", "acuifero", "ptar "],
    frases: ["agua potable", "calidad del agua", "recurso hidrico", "aguas residuales", "tratamiento de aguas", "ahorro de agua", "uso eficiente del agua", "dia del agua", "cuencas hidrograficas", "rio de oro", "rio surata", "rio lebrija", "rio frio", "paramo de santurban"],
  },
  7: {
    raices: ["energia", "solar", "fotovolta", "renovable", "eolic", "hidrogeno", "biocombustible", "biogas", "biomasa"],
    frases: ["eficiencia energetica", "energia limpia", "energia solar", "paneles solares", "transicion energetica", "fusion nuclear", "movilidad electrica", "vehiculo electrico", "vehiculos electricos", "ahorro de energia", "consumo energetico", "consejo mundial de energia"],
  },
  8: {
    raices: ["empleo", "desempleo", "emprend", "empresari", "productividad", "laboral", "economia", "mipyme", "pyme", "cooperativ", "empleabilidad", "startup", "incubadora", "aceleradora", "turismo", "informalidad", "innpulsa"],
    frases: ["trabajo decente", "crecimiento economico", "yo emprendo", "plan de negocio", "economia solidaria", "economia popular", "feria de empleo", "bolsa de empleo", "camara de comercio", "unidades productivas", "negocios verdes", "fondo emprender", "trabajo infantil", "formalizacion empresarial"],
  },
  9: {
    raices: ["innovacion", "tecnolog", "investigacion", "prototipo", "infraestructura", "industria", "laboratorio", "patente", "ingenieri", "robotic", "software", "minciencias", "colciencias", "regalias", "manufactura", "conectividad"],
    frases: ["desarrollo tecnologico", "ciencia y tecnologia", "investigacion e innovacion", "semana de la ciencia", "transferencia tecnologica", "spin off", "registro de software", "propiedad intelectual", "inteligencia artificial", "transformacion digital", "centro de investigacion", "grupos de investigacion", "articulo cientifico", "revista indexada", "parque tecnologico", "impresion 3d"],
  },
  10: {
    raices: ["desigualdad", "inclusion", "discapacidad", "migrante", "indigena", "afrodescend", "afrocolombian", "brecha", "diversidad", "accesibilidad", "venezolan", "refugiad", "retornad", "raizal", "palenquer", "neurodivers", "autismo", "reincorporad", "excombatiente", "envejecimiento"],
    frases: ["poblacion vulnerable", "personas con discapacidad", "reduccion de brechas", "poblacion rural", "adulto mayor", "adultos mayores", "personas mayores", "poblacion migrante", "comunidades indigenas", "lengua de senas", "lenguaje de senas", "diversidad funcional", "victimas del conflicto", "zona de frontera"],
  },
  11: {
    raices: ["urban", "patrimonio", "vivienda", "residuos", "reciclaj", "ciclovia", "bicicleta", "metrolinea", "desastres", "sismo", "inundacion", "deslizamiento", "barrio"],
    frases: ["ciudades sostenibles", "ciudad sostenible", "ciudad inteligente", "gestion de residuos", "transporte sostenible", "transporte publico", "espacio publico", "area metropolitana", "movilidad urbana", "movilidad sostenible", "seguridad vial", "dia sin carro", "gestion del riesgo", "riesgo de desastres", "ordenamiento territorial", "renovacion urbana"],
  },
  12: {
    raices: ["reciclaj", "residuos", "sostenib", "compost", "reutiliz", "plastico", "ecoladrillo", "posconsumo", "raee ", "ecodiseno", "aprovechamiento"],
    frases: ["economia circular", "produccion limpia", "consumo responsable", "gestion de residuos", "residuos solidos", "residuos peligrosos", "punto ecologico", "puntos ecologicos", "un solo uso", "residuos electronicos", "produccion sostenible", "compras sostenibles", "desperdicio de alimentos", "huella hidrica"],
  },
  13: {
    raices: ["clima", "climatic", "ambiental", "carbono", "emision", "calentamiento", "siembra", "arbol", "reforest", "huella de", "contaminacion", "calidad del aire", "biodiversidad", "co2 ", "mitigacion", "cop16", "cop 16"],
    frases: ["cambio climatico", "huella de carbono", "calidad del aire", "gestion ambiental", "arboles nativos", "adaptacion climatica", "accion climatica", "carbono neutro", "carbono neutral", "neutralidad de carbono", "efecto invernadero", "gases de efecto invernadero", "dia sin carro y sin moto", "udes verde", "educacion ambiental", "conciencia ambiental", "jornada de siembra", "medio ambiente", "fenomeno de el nino", "fenomeno de la nina", "ola de calor"],
  },
  14: {
    raices: ["oceano", "marin", "pesca", "costero", "arrecife", "manglar", "acuicultur", "microplastico", "playa"],
    frases: ["vida submarina", "recursos marinos", "mar caribe", "pesca artesanal", "ecosistemas marinos", "biologia marina"],
  },
  15: {
    raices: ["bosque", "ecosistema", "fauna", "flora", "deforest", "biodivers", "paramo", "conservacion", "santurban", "herbario", "polinizador", "abejas", "erosion", "chicamocha", "aves "],
    frases: ["vida de ecosistemas terrestres", "especies nativas", "areas protegidas", "paramo de santurban", "reserva natural", "parque natural", "parques nacionales", "especies amenazadas", "trafico de fauna", "avistamiento de aves", "jardin botanico", "restauracion ecologica", "corredor biologico", "bosque seco"],
  },
  16: {
    raices: ["justicia", "paz", "derecho", "victima", "juridic", "consultorio", "conflicto", "transparencia", "democracia", "conciliacion", "reconciliacion", "posconflicto", "corrupcion", "anticorrupcion", "convivencia", "veeduria", "jep "],
    frases: ["acceso a la justicia", "derechos humanos", "consultorio juridico", "construccion de paz", "victimas del conflicto", "centro de conciliacion", "comision de la verdad", "memoria historica", "acuerdo de paz", "catedra de la paz", "restitucion de tierras", "participacion ciudadana", "rendicion de cuentas", "seguridad ciudadana", "lideres sociales", "justicia restaurativa", "casa de justicia", "institucion solida"],
  },
  17: {
    raices: ["alianza", "convenio", "cooperacion", "red de", "internacionaliz", "intercambio", "aliado", "fundacion", "unesco", "unicef", "pnud", "usaid", "embajada"],
    frases: ["alianza estrategica", "trabajo en red", "firma de convenio", "cooperacion internacional", "movilidad internacional", "memorando de entendimiento", "acuerdo de cooperacion", "naciones unidas", "agenda 2030", "objetivos de desarrollo sostenible", "gobernacion de santander"],
  },
};

export const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Sin tildes, en minúscula y sin signos: «¡Día del Agua!» → «dia del agua». */
const normalizar = (s: string) => sinTildes(s).replace(/[^a-z0-9]+/g, " ").trim();

/** La aguja de una entrada del léxico: empieza en una palabra y, si la entrada termina en espacio, termina en una. */
const aguja = (entrada: string) => ` ${normalizar(entrada)}${/\s$/.test(entrada) ? " " : ""}`;

function contar(texto: string, buscada: string): number {
  let n = 0;
  let i = texto.indexOf(buscada);
  while (i !== -1 && n < 6) {
    n++;
    i = texto.indexOf(buscada, i + buscada.length);
  }
  return n;
}

export interface Afinidad {
  ods: number;
  score: number;
  reason: string;
}

export interface Lectura {
  /** Lo que el léxico propone: ODS con 35 o más, como mucho tres. */
  afinidad: Afinidad[];
  /** Todo ODS con alguna coincidencia, del más al menos afín (pistas para Pilo). */
  pistas: Afinidad[];
  /** ¿Tiene alguna coincidencia? Entonces Pilo la lee. */
  candidata: boolean;
  /** La coincidencia con las palabras propias del perfil, si las hay y llega al umbral. */
  propia?: AfinidadTema | null;
}

/** Un tema cualquiera con su puntaje: el id de un ODS («ods13»), de un pilar o de una categoría. */
export interface AfinidadTema {
  tema: string;
  score: number;
  reason: string;
}

export const TEMA_PROPIO = "propio";

/**
 * El motor: puntúa un texto contra los léxicos dados, del más al menos afín.
 * Es el cálculo de siempre; el título pesa `pesoTitulo` veces y el puntaje se
 * frena con `saturacion`.
 */
export function puntuarTemas(titulo: string, texto: string, entradas: [string, Entrada][], op: OpcionesLectura = {}): AfinidadTema[] {
  const pesoTitulo = op.pesoTitulo ?? PESO_TITULO;
  const saturacion = op.saturacion ?? SATURACION;
  const t = ` ${normalizar(titulo)} `;
  const x = ` ${normalizar(texto).slice(0, 6000)} `;
  const pistas: AfinidadTema[] = [];
  for (const [clave, lex] of entradas) {
    let peso = 0;
    const pruebas: string[] = [];
    const sumar = (entrada: string, valor: number) => {
      const a = aguja(entrada);
      const enT = contar(t, a);
      const enX = contar(x, a);
      if (!enT && !enX) return;
      peso += valor * (enT * pesoTitulo + Math.min(enX, 3));
      pruebas.push(a.trim());
    };
    lex.frases.forEach((f) => sumar(f, 4));
    lex.raices.forEach((r) => sumar(r, 1.5));
    if (!peso) continue;
    const score = Math.round(100 * (1 - Math.exp(-peso / saturacion)));
    const unicas = [...new Set(pruebas)].slice(0, 4);
    pistas.push({ tema: clave, score, reason: (clave === TEMA_PROPIO ? "Palabra propia: " : "Menciona ") + unicas.join(", ") });
  }
  return pistas.sort((a, b) => b.score - a.score);
}

/** Las palabras propias como un léxico de frases (cada una cuenta como frase), o null si no hay. */
export function lexicoPropio(palabras: string[] | undefined): Entrada | null {
  const lista = (palabras ?? []).map((p) => p.trim()).filter(Boolean);
  return lista.length ? { raices: [], frases: lista } : null;
}

/** El léxico completo sobre una nota: lo que propone y las pistas que encontró. */
export function leer(titulo: string, texto: string, op: OpcionesLectura = {}): Lectura {
  const umbral = op.umbral ?? UMBRAL;
  const max = op.max ?? MAX_ODS;
  const activos = op.capas ? new Set(op.capas) : null;
  const entradas = Object.entries(LEXICO)
    .filter(([clave]) => !activos || activos.has(Number(clave)))
    .map(([clave, lex]) => [clave, lex] as [string, Entrada]);
  const pistas: Afinidad[] = puntuarTemas(titulo, texto, entradas, op).map((p) => ({ ods: Number(p.tema), score: p.score, reason: p.reason }));
  const propio = lexicoPropio(op.palabras);
  const propia = propio ? (puntuarTemas(titulo, texto, [[TEMA_PROPIO, propio]], op)[0] ?? null) : null;
  return {
    afinidad: pistas.filter((p) => p.score >= umbral).slice(0, max),
    pistas,
    candidata: pistas.length > 0 || Boolean(propia),
    propia: propia && propia.score >= umbral ? propia : null,
  };
}

/** Los ODS de una noticia, del más al menos afín. Vacío si ninguno llega al umbral. */
export function clasificar(titulo: string, texto: string, op: OpcionesLectura = {}): Afinidad[] {
  return leer(titulo, texto, op).afinidad;
}

/** Un extracto de unas 40 palabras, cortado en el final de una frase si cabe. */
export function extracto(texto: string, palabras = 40): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const trozos = limpio.split(" ");
  if (trozos.length <= palabras) return limpio;
  const corte = trozos.slice(0, palabras).join(" ");
  const punto = corte.lastIndexOf(". ");
  return punto > corte.length * 0.55 ? corte.slice(0, punto + 1) : corte.replace(/[,;:\s]+$/, "") + "…";
}
