/* =============================================================================
   Pregúntele a Pilo · los modos secretos («modo super pilo»).

   Tres disfraces de Pilo que se activan escribiendo una orden en el chat:
   Pilocop, Pilonator y Súper Pilo Sayayín. Aquí vive lo que no pinta nada:

     · qué es cada modo (nombre, voz, las frases de su entrada),
     · cómo se reconoce la orden de entrar y la de salir,
     · el catálogo de respuestas de cada modo, que se contesta en el navegador
       sin gastar IA, con su texto para Fish Audio (la etiqueta de tono al
       comienzo de cada frase, que es donde Fish Audio la respeta).

   Lo que no está en el catálogo viaja a `pilo-ia` como siempre, con el modo:
   allá se le añade la instrucción de personaje (logic.ts, `modoInstruction`).

   Las órdenes son mensajes enteros y cortos: una pregunta de verdad que
   mencione «desactivar» o «parcial» no se desvía.
   ========================================================================== */

export type SuperMode = "pilocop" | "pilonator" | "sayayin";

export const SUPER_MODES: SuperMode[] = ["pilocop", "pilonator", "sayayin"];

export const isSuperMode = (v: unknown): v is SuperMode => typeof v === "string" && (SUPER_MODES as string[]).includes(v);

export interface SuperProfile {
  name: string;
  /** Los robots descansan con el pico cerrado y giran la cabeza a saltos. */
  robot: boolean;
  /** Cuánto se eleva al terminar la entrada, en unidades del dibujo (0: no vuela). */
  lift: number;
  /** El tono de Fish Audio para lo que redacta la IA en este modo. */
  tone: string;
  /** Lo que se lee bajo el título durante la entrada: arranque, escaneo, equipo y despegue. */
  stages: [string, string, string, string];
}

export const SUPER: Record<SuperMode, SuperProfile> = {
  pilocop: {
    name: "Pilocop",
    robot: true,
    lift: -50,
    tone: "robotic monotone",
    stages: ["Iniciando protocolo…", "Escaneando plumaje…", "Instalando visor reglamentario…", "Propulsores en línea."],
  },
  pilonator: {
    name: "Pilonator",
    robot: true,
    lift: 0,
    tone: "deep serious voice",
    stages: ["Llegando desde el futuro…", "Escaneando plumaje…", "Descargando gafas oscuras…", "Objetivo: su semestre."],
  },
  sayayin: {
    name: "Súper Pilo Sayayín",
    robot: false,
    lift: -40,
    tone: "excited",
    stages: ["Reuniendo energía…", "Midiendo el nivel de pilera…", "¡Más de nueve mil!", "Transformación completa."],
  },
};

/* --- Las órdenes ---------------------------------------------------------------------- */

/** El texto sin tildes, signos ni mayúsculas, para comparar. */
export const plainText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type SuperCommand = { type: "on"; mode: SuperMode } | { type: "off" };

const ON = /^\/?(modo |activar? (el )?(modo )?)?(super ?pilo( sayayin)?|pilocop|pilonator|sayayin)( [1-3])?$/;
const OFF = /^(\/normal|modo normal|desactivar?( (el )?modo)?( super ?pilo)?|apagar?( (el )?modo)?|salir( del modo)?)$/;

/**
 * La orden que trae un mensaje, o null si es una pregunta como cualquiera.
 * Entrar: «modo super pilo», «/superpilo», «super pilo 2», «pilonator»… Sin
 * número ni nombre vuelve al último modo usado. Salir solo se entiende con un
 * modo activo: sin él, «desactivar» es una palabra más.
 */
export function superCommand(text: string, state: { active: SuperMode | null; last?: SuperMode } = { active: null }): SuperCommand | null {
  const q = plainText(text);
  if (state.active && OFF.test(q)) return { type: "off" };
  if (!ON.test(q)) return null;
  const n = q.match(/ ([1-3])$/);
  if (n) return { type: "on", mode: SUPER_MODES[Number(n[1]) - 1] };
  const named = SUPER_MODES.find((m) => q.includes(m));
  return { type: "on", mode: named ?? state.active ?? state.last ?? "pilocop" };
}

/* --- El catálogo ---------------------------------------------------------------------- */

export interface SuperLine {
  /** Lo que se lee en pantalla. */
  text: string;
  /** Lo que viaja a Fish Audio: cada frase con su etiqueta. */
  fish: string;
}

const TAG: Record<string, string> = { R: "robotic monotone", D: "deep serious voice", C: "cold calm voice", W: "whispering", P: "short pause", E: "excited", S: "shouting" };

/** Una línea escrita frase por frase: «etiquetas|frase». Las etiquetas van separadas por coma. */
export function line(...sentences: string[]): SuperLine {
  const parts = sentences.map((s) => {
    const cut = s.indexOf("|");
    return { tags: s.slice(0, cut).split(",").map((t) => TAG[t] ?? t), text: s.slice(cut + 1) };
  });
  return { text: parts.map((p) => p.text).join(" "), fish: parts.map((p) => `${p.tags.map((t) => `[${t}]`).join(" ")} ${p.text}`).join(" ") };
}

export interface SuperIntent {
  id: string;
  /** Cuándo se dice, para quien revisa el catálogo. */
  when: string;
  /** Lo que dispara la línea. Sin patrón, la dice la página (entrar, salir, ya activo). */
  test?: RegExp;
  lines: Record<SuperMode, SuperLine>;
}

export const SUPER_INTENTS: SuperIntent[] = [
  {
    id: "activar",
    when: "Al entrar al modo",
    lines: {
      pilocop: line("R|Protocolo Pilocop activado.", "R|Sistemas en línea.", "D|Vivo o reprobado, usted viene conmigo.", "P,W|A la biblioteca."),
      pilonator: line("D|Modo Pilonator.", "P,C|Hasta la vista, parcial.", "D|Volveré.", "P,amused|Con el taller terminado."),
      sayayin: line("S|¡Súper Pilo Sayayín!", "P,E|Mi nivel de pilera es de más de nueve mil."),
    },
  },
  {
    id: "activo",
    when: "Al pedir el modo que ya está puesto",
    lines: {
      pilocop: line("R|Ese modo ya está activo.", "R|Indique su consulta."),
      pilonator: line("C|Ya estoy aquí.", "D|No me he ido."),
      sayayin: line("E|¡Ya estoy transformado!", "playful|¿Entrenamos?"),
    },
  },
  {
    id: "saludo",
    when: "Saludo",
    test: /^(hola|buenas|buenos|hey|que mas|saludos)/,
    lines: {
      pilocop: line("R|Saludos, ciudadano estudiante.", "R|Indique su consulta y conserve la calma."),
      pilonator: line("C|Hola.", "D|Busco a quien dejó el taller para última hora.", "P,amused|Tranquilo, hoy no es usted."),
      sayayin: line("E|¡Hola!", "E|¡Siento una energía de estudio increíble!", "playful|¿Entrenamos esa materia?"),
    },
  },
  {
    id: "quien",
    when: "Quién es",
    test: /quien eres|que eres|como te llamas|presentate/,
    lines: {
      pilocop: line("D|Soy Pilocop.", "R|Mitad ave, mitad máquina.", "P,proud|Cien por ciento Pensador UDES."),
      pilonator: line("C|Soy un Pilonator, modelo UDES ochocientos.", "D|Fui enviado para proteger su semestre."),
      sayayin: line("E|¡Soy Pilo, un Pensador criado en la UDES!", "S|¡Y este es mi modo Súper Sayayín!"),
    },
  },
  {
    id: "mision",
    when: "Su misión",
    test: /directiva|orden|mision|objetivo|entrenamiento/,
    lines: {
      pilocop: line("R|Directiva uno: servir al estudiante.", "R|Directiva dos: proteger el promedio.", "R|Directiva tres: defender el reglamento estudiantil.", "R|Directiva cuatro: clasificada.", "P,W|Tiene que ver con el tinto."),
      pilonator: line("D|Misión: que usted apruebe.", "C|Objetivo secundario: que entregue a tiempo.", "P,D|No hay destino escrito, solo el cronograma del curso."),
      sayayin: line("E|¡Mi misión es superar mis límites!", "E|Primero, repasar.", "E|Segundo, practicar.", "P,S|¡Tercero, volver a repasar con más fuerza!"),
    },
  },
  {
    id: "parcial",
    when: "Parciales",
    test: /parcial|examen|quiz|evaluacion/,
    lines: {
      pilocop: line("alarmed|Amenaza detectada: parcial.", "R|Nivel de peligro: nueve mil uno.", "D|Solicito refuerzos.", "P,W|Y un tutor."),
      pilonator: line("C|El parcial no siente lástima ni remordimiento.", "D|Pero usted tiene algo que él no.", "P,confident|Apuntes."),
      sayayin: line("S|¡Un parcial!", "E|¡Qué emoción, un rival fuerte!", "confident|Con disciplina y repaso, su poder de estudio va a subir."),
    },
  },
  {
    id: "tinto",
    when: "Cansancio",
    test: /tinto|cafe|sueno|cansad|dormir/,
    lines: {
      pilocop: line("R|Nivel de tinto: doce por ciento.", "worried|Recarga recomendada de inmediato."),
      pilonator: line("C|Mi fuente de energía dura ciento veinte años.", "P,amused|La suya necesita un tinto."),
      sayayin: line("E|¡El tinto es mi semilla del ermitaño!", "P,warm|Uno solo y a seguir entrenando."),
    },
  },
  {
    id: "taller",
    when: "Entregas",
    test: /tarea|trabajo|taller|entrega|proyecto/,
    lines: {
      pilocop: line("D|Tiene veinte segundos para entregar el taller.", "P,laughing|Tranquilo.", "amused|Solo estoy calibrando el sentido del humor."),
      pilonator: line("C|Necesito su taller, su portada y su bibliografía.", "P,amused|En normas APA, por favor."),
      sayayin: line("E|¡Reunamos energía entre todos!", "S|¡Levanten las manos y compartan sus apuntes!", "P,playful|El trabajo en grupo es la técnica más poderosa del semestre."),
    },
  },
  {
    id: "biblioteca",
    when: "Dónde estudiar",
    test: /biblioteca|libro|estudiar|leer/,
    lines: {
      pilocop: line("R|Zona segura localizada: biblioteca.", "R|Proceda en silencio.", "W|Es una orden amable."),
      pilonator: line("C|He escaneado la biblioteca.", "D|Hay libros, silencio y enchufes.", "P,confident|Es el lugar perfecto."),
      sayayin: line("E|¡La biblioteca es mi sala de entrenamiento!", "E|Allí una hora de estudio rinde como un año.", "P,amused|Bueno, casi."),
    },
  },
  {
    id: "promedio",
    when: "Notas",
    test: /promedio|nota|calificacion|perdi|perder|reprob/,
    lines: {
      pilocop: line("R|Directiva dos en ejecución: proteger el promedio.", "helpful|Revise sus notas a tiempo y hable con su profesor."),
      pilonator: line("D|El promedio no está escrito.", "confident|Todavía puede cambiarlo, una entrega a la vez."),
      sayayin: line("warm|Una nota baja no es una derrota.", "E|¡Es el entrenamiento antes de la transformación!", "confident|Levántese y vuelva a intentarlo."),
    },
  },
  {
    id: "profesor",
    when: "Pedir ayuda",
    test: /profe|docente|tutor|asesor/,
    lines: {
      pilocop: line("R|Aliado identificado: profesor.", "helpful|Recomendación táctica: pregunte en clase.", "amused|Las dudas no se arrestan."),
      pilonator: line("C|Venga conmigo si quiere aprobar.", "P,helpful|Y pase por la tutoría de su profesor."),
      sayayin: line("E|¡Todo guerrero necesita un maestro!", "warm|Su profesor ya recorrió ese camino.", "helpful|Pregúntele."),
    },
  },
  {
    id: "chiste",
    when: "Humor",
    test: /chiste|risa|gracios|humor/,
    lines: {
      pilocop: line("R|Iniciando módulo de humor.", "R|¿Por qué el estudiante llevó una escalera a clase?", "P,R|Porque quería subir la nota.", "P,R|Ja, ja, ja."),
      pilonator: line("C|No fui programado para el humor.", "D|Pero el wifi del salón y yo tenemos algo en común.", "P,amused|Los dos volveremos."),
      sayayin: line("playful|¿Sabe cuál es mi técnica secreta?", "P,E|¡Empezar el trabajo el mismo día que lo dejan!", "laughing|Casi nadie la domina."),
    },
  },
  {
    id: "gracias",
    when: "Agradecimiento",
    test: /gracias/,
    lines: {
      pilocop: line("R|Su gratitud ha sido registrada en el expediente.", "P,laughing|Es broma.", "warm|De nada."),
      pilonator: line("C|De nada.", "D|Ahora entiendo por qué los humanos dan las gracias.", "P,amused|Es algo que yo nunca podré facturar."),
      sayayin: line("cheerful|¡De nada!", "E|Ayudar también me hace más fuerte."),
    },
  },
  {
    id: "ayuda",
    when: "Qué sabe hacer",
    test: /ayuda|que puedes|que sabes|comandos|que haces/,
    lines: {
      pilocop: line("R|Funciones disponibles: misión, parcial, tinto, taller, biblioteca, promedio y chiste.", "helpful|Para lo demás, pregunte: respondo con las fuentes de la UDES."),
      pilonator: line("C|Puedo hablar de mi misión, de parciales, talleres, tinto y promedio.", "D|Y de cualquier dato de la UDES.", "helpful|Pregunte."),
      sayayin: line("E|¡Pregúnteme por el parcial, el taller, la biblioteca o el promedio!", "E|¡O por cualquier dato de la UDES!", "playful|También cuento chistes."),
    },
  },
  {
    id: "escanear",
    when: "Escaneo",
    test: /escan|analiza|revisa/,
    lines: {
      pilocop: line("R|Escaneo completo.", "R|Gafas: naranjas.", "R|Suéter: azul.", "P,E|Actitud: imparable."),
      pilonator: line("C|Análisis visual completo.", "D|Talla de suéter: la suya.", "P,amused|Solo observaba."),
      sayayin: line("E|¡Mi rastreador dice que su nivel de pilera es altísimo!", "S|¡Es de más de nueve mil!"),
    },
  },
  {
    id: "adios",
    when: "Despedida",
    test: /adios|chao|hasta luego|nos vemos|bye/,
    lines: {
      pilocop: line("R|Fin de la patrulla.", "D|Manténgase lejos de los problemas.", "P,W|Y cerca de la biblioteca."),
      pilonator: line("D|Volveré.", "P,amused|Usted también, espero.", "C|El semestre no ha terminado."),
      sayayin: line("cheerful|¡Hasta la próxima!", "E|Siga entrenando.", "P,playful|Y no se salte el almuerzo."),
    },
  },
  {
    id: "desactivar",
    when: "Al salir del modo",
    lines: {
      pilocop: line("R|Modo Pilocop desactivado.", "sighing|Uf, qué descanso.", "cheerful|¡Hola otra vez!"),
      pilonator: line("D|Hasta la vista.", "P,sighing|Listo, me quité las gafas.", "cheerful|¡Hola otra vez!"),
      sayayin: line("sighing|Uf, se me bajó el copete.", "cheerful|¡Hola otra vez!", "playful|Entrenar cansa."),
    },
  },
];

/** Una línea del catálogo por su nombre (las que dice la página: «activar», «activo», «desactivar»). */
export function superLine(mode: SuperMode, id: string): SuperLine {
  const intent = SUPER_INTENTS.find((i) => i.id === id);
  if (!intent) throw new Error(`No hay línea «${id}» en el catálogo de los modos.`);
  return intent.lines[mode];
}

/** Hasta cuántas palabras tiene un mensaje que responde el catálogo: lo más largo es una pregunta de verdad. */
export const SUPER_REPLY_WORDS = 5;

/**
 * Lo que responde el catálogo del modo a un mensaje corto, o null si le toca a
 * la IA. «Tengo parcial» es charla; «¿cuándo son los parciales del segundo
 * corte?» es una pregunta y va a `pilo-ia` con el personaje.
 */
export function superReply(mode: SuperMode, text: string): (SuperLine & { id: string }) | null {
  const q = plainText(text);
  if (!q || q.split(" ").length > SUPER_REPLY_WORDS) return null;
  const hit = SUPER_INTENTS.find((i) => i.test?.test(q));
  return hit ? { id: hit.id, ...hit.lines[mode] } : null;
}
