/* =============================================================================
   Pregúntele a Pilo · los modos secretos («modo super pilo»).

   Cuatro disfraces de Pilo que se activan escribiendo una orden en el chat:
   Pilocop, Pilonator, Súper Pilo Sayayín y AWOO. Aquí vive lo que no pinta nada:

     · qué es cada modo (nombre, voz, las frases de su entrada),
     · cómo se reconoce la orden de entrar y la de salir,
     · el catálogo de respuestas de cada modo, que se contesta en el navegador
       sin gastar IA,
     · la emoción de cada frase: al leerla en voz alta, la frase viaja al
       servicio de voz con su tono («whispering», «excited»…) y Fish Audio la
       dice así. El texto que se ve nunca lleva etiquetas.

   Lo que no está en el catálogo viaja a `pilo-ia` como siempre, con el modo:
   allá se le añade la instrucción de personaje (logic.ts, `modoInstruction`)
   y la voz lo lee entero con el tono del modo.

   Las órdenes son mensajes enteros y cortos: una pregunta de verdad que
   mencione «desactivar» o «parcial» no se desvía.

   Lo usan las dos conversaciones de Pilo: la página (AskPilo) y la app
   (pilo-app/AppShell). Las dos preguntan aquí qué hacer con cada mensaje
   (`superStep`) y cada una lo pinta a su manera.
   ========================================================================== */

import type { AskResult } from "../../../components/pilo/ai/client";

export type SuperMode = "pilocop" | "pilonator" | "sayayin" | "awoo";

export const SUPER_MODES: SuperMode[] = ["pilocop", "pilonator", "sayayin", "awoo"];

export const isSuperMode = (v: unknown): v is SuperMode => typeof v === "string" && (SUPER_MODES as string[]).includes(v);

export interface SuperProfile {
  name: string;
  /** Los robots descansan con el pico cerrado y giran la cabeza a saltos. */
  robot: boolean;
  /** Cuánto se eleva al terminar la entrada, en unidades del dibujo (0: no vuela; AWOO baila en su sitio). */
  lift: number;
  /** El tono de Fish Audio para lo que redacta la IA en este modo. */
  tone: string;
  /** Cuánto cambia la voz al sonar: la velocidad (también del audio oficial) y el tono (solo la voz del navegador). */
  voice: { rate: number; pitch: number };
  /** Lo que se lee bajo el título durante la entrada: arranque, escaneo, equipo y despegue. */
  stages: [string, string, string, string];
}

export const SUPER: Record<SuperMode, SuperProfile> = {
  pilocop: {
    name: "Pilocop",
    robot: true,
    lift: -50,
    tone: "robotic monotone",
    voice: { rate: 0.94, pitch: 0.6 },
    stages: ["Iniciando protocolo…", "Escaneando plumaje…", "Instalando visor reglamentario…", "Propulsores en línea."],
  },
  pilonator: {
    name: "Pilonator",
    robot: true,
    lift: 0,
    tone: "deep serious voice",
    voice: { rate: 0.9, pitch: 0.55 },
    stages: ["Llegando desde el futuro…", "Escaneando plumaje…", "Descargando gafas oscuras…", "Objetivo: su semestre."],
  },
  sayayin: {
    name: "Súper Pilo Sayayín",
    robot: false,
    lift: -40,
    tone: "excited",
    voice: { rate: 1.06, pitch: 1.15 },
    stages: ["Reuniendo energía…", "Midiendo el nivel de pilera…", "¡Más de nueve mil!", "Transformación completa."],
  },
  awoo: {
    name: "AWOO",
    robot: false,
    lift: 0,
    tone: "excited",
    voice: { rate: 1.04, pitch: 1.0 },
    stages: ["Subiendo el volumen…", "Afinando la cadena…", "Gorra de lado, parce…", "Listo pa’ la fiesta del semestre."],
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

const ON = /^\/?(modo |activar? (el )?(modo )?)?(super ?pilo( sayayin)?|pilocop|pilonator|sayayin|awoo)( [1-4])?$/;
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
  const n = q.match(/ ([1-4])$/);
  if (n) return { type: "on", mode: SUPER_MODES[Number(n[1]) - 1] };
  const named = SUPER_MODES.find((m) => q.includes(m));
  return { type: "on", mode: named ?? state.active ?? state.last ?? "pilocop" };
}

/* --- El catálogo ---------------------------------------------------------------------- */

export interface SuperLine {
  /** Lo que se lee en pantalla. */
  text: string;
  /** Lo mismo como lo recibe Fish Audio: cada frase con sus etiquetas. Es para revisar el guion; al servicio de voz viaja frase por frase. */
  fish: string;
  /** Frase por frase: lo que se dice y con qué emoción. */
  parts: { text: string; tags: string[] }[];
}

/** Las emociones de siempre, en corto. Las demás se escriben enteras («amused», «warm»…). */
const TAG: Record<string, string> = { R: "robotic monotone", D: "deep serious voice", C: "cold calm voice", W: "whispering", P: "short pause", E: "excited", S: "shouting" };

/** Una línea escrita frase por frase: «etiquetas|frase». Las etiquetas van separadas por coma. */
export function line(...sentences: string[]): SuperLine {
  const parts = sentences.map((s) => {
    const cut = s.indexOf("|");
    return { tags: s.slice(0, cut).split(",").map((t) => TAG[t] ?? t), text: s.slice(cut + 1) };
  });
  return { text: parts.map((p) => p.text).join(" "), fish: parts.map((p) => `${p.tags.map((t) => `[${t}]`).join(" ")} ${p.text}`).join(" "), parts };
}

export interface SuperIntent {
  id: string;
  /** Cuándo se dice, para quien revisa el catálogo. */
  when: string;
  /** Lo que dispara la línea. Sin patrón, la dice la página (entrar, salir, ya activo). */
  test?: RegExp;
  lines: Record<SuperMode, SuperLine>;
}

/* El orden importa: gana la primera que coincide. Por eso lo específico («pasé
   el parcial», «otro chiste») va antes que lo general («parcial», «chiste»). */
export const SUPER_INTENTS: SuperIntent[] = [
  {
    id: "activar",
    when: "Al entrar al modo",
    lines: {
      pilocop: line("R|Protocolo Pilocop activado.", "R|Sistemas en línea.", "D|Vivo o reprobado, usted viene conmigo.", "P,W|A la biblioteca."),
      pilonator: line("D|Modo Pilonator.", "P,C|Hasta la vista, parcial.", "D|Volveré.", "P,amused|Con el taller terminado."),
      sayayin: line("S|¡Súper Pilo Sayayín!", "P,E|Mi nivel de pilera es de más de nueve mil."),
      awoo: line("confident,authoritative|¡Aquí Pilo Castro, The King Cóndor, pues!", "proud,relaxed|El mero mero del campus, la verdadera bestia...", "rhythmic|¿Sí saaa-be, parce? Directo desde el nido en la U-DES,", "energetic,hype|activando el modo bien fachero pa' toda la pipol que le mete berraquera."),
    },
  },
  {
    id: "activo",
    when: "Al pedir el modo que ya está puesto",
    lines: {
      pilocop: line("R|Ese modo ya está activo.", "R|Indique su consulta."),
      pilonator: line("C|Ya estoy aquí.", "D|No me he ido."),
      sayayin: line("E|¡Ya estoy transformado!", "playful|¿Entrenamos?"),
      awoo: line("playful|Ya estamos en modo AWOO, parce.", "E|Hágale, pregunte."),
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
      awoo: line("S|¡Awoo!", "E,warm|¿Qué más, parce?", "warm|Cuénteme qué necesita, que aquí nadie se queda sin respuesta."),
    },
  },
  {
    id: "como-estas",
    when: "Cómo está",
    test: /como estas|como te va|que tal|como vas|como te sientes/,
    lines: {
      pilocop: line("R|Todos los sistemas operan al cien por ciento.", "P,amused|Menos el de tinto."),
      pilonator: line("C|Funcional.", "D|No siento dolor ni cansancio.", "P,amused|Ni ganas de madrugar."),
      sayayin: line("E|¡Con la energía al máximo!", "playful|¿Y usted?", "playful|¿Listo para entrenar?"),
      awoo: line("S|¡Awoo!", "E|¡Full energía, con la cadena brillando y las neuronas prendidas!", "playful|¿Y usted, cómo va?"),
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
      awoo: line("S|¡Awoo!", "proud|Soy Pilo, el cóndor pensador de la UDES, ahora con gorra y cadena.", "rhythmic|Sigo siendo el mismo: pilas y de una."),
    },
  },
  {
    id: "creador",
    when: "De dónde salió",
    test: /quien te (creo|hizo|programo|invento)|de donde (eres|vienes|saliste)/,
    lines: {
      pilocop: line("R|Fui ensamblado en la UDES.", "proud|Con piezas originales y mucho tinto."),
      pilonator: line("C|Vengo del futuro.", "D|De un semestre en el que todos entregan a tiempo.", "P,amused|Es un futuro lejano."),
      sayayin: line("E|¡Nací en la UDES!", "E|Y cada pregunta suya me hace más fuerte."),
      awoo: line("S|¡Awoo!", "proud|Nací en la UDES, parce, entre apuntes y tinto.", "rhythmic|De ahí salió este cóndor con ritmo."),
    },
  },
  {
    id: "edad",
    when: "Su edad",
    test: /cuantos anos|tu edad|cumpleanos/,
    lines: {
      pilocop: line("R|Dato clasificado.", "P,amused|Pero mi garantía sigue vigente."),
      pilonator: line("C|Todavía no he sido fabricado.", "D|Técnicamente tengo menos años que usted."),
      sayayin: line("E|¡Los guerreros no contamos años!", "playful|Contamos semestres."),
      awoo: line("S|¡Awoo!", "playful|Los cóndores pilas no contamos años, parce.", "rhythmic|Contamos semestres, y van de una."),
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
      awoo: line("S|¡Awoo!", "confident|Mi misión es que usted apruebe y entregue a tiempo.", "rhythmic|Paso a paso y con ritmo, hágale."),
    },
  },
  {
    id: "poderes",
    when: "Sus poderes",
    test: /poder|vuela|volar|laser|fuerza/,
    lines: {
      pilocop: line("R|Visor de alta precisión, antena y propulsores.", "P,W|Y encuentro salones sin perderme."),
      pilonator: line("C|Resisto cualquier parcial sorpresa.", "D|Y mis gafas nunca se caen."),
      sayayin: line("E|¡Puedo volar y erizar el copete!", "S|¡Y estudiar tres horas seguidas!", "P,amused|Bueno, dos."),
      awoo: line("S|¡Awoo!", "E|Mi poder es ponerle ritmo al estudio.", "playful|Con la gorra de lado y la cadena brillando, nada me frena.", "amused|Eso sí, las notas las sube usted."),
    },
  },
  {
    id: "enemigo",
    when: "Su enemigo",
    test: /enemigo|villano|rival/,
    lines: {
      pilocop: line("D|Enemigo público número uno: la procrastinación.", "R|Se le busca viva o entregada."),
      pilonator: line("C|Mi objetivo es el trabajo dejado para el domingo en la noche.", "D|Será eliminado."),
      sayayin: line("S|¡Mi rival es la pereza!", "E|Es fuerte, pero entrenando la venzo."),
      awoo: line("S|¡Awoo!", "confident|Mi enemigo es la procrastinación, parce.", "rhythmic|Pero con pilas y con ritmo, no tiene chance."),
    },
  },
  {
    id: "secreto",
    when: "Un secreto",
    test: /secreto/,
    lines: {
      pilocop: line("W|Información confidencial.", "W|Debajo del visor llevo mis gafas naranjas."),
      pilonator: line("W|Le confío un secreto.", "W|Las gafas oscuras no me dejan ver el tablero."),
      sayayin: line("W|No se lo diga a nadie.", "W|El copete dorado es puro gel."),
      awoo: line("W|Le cuento un secreto, parce.", "W|La gorra me la pongo de lado pa’ que nadie note que me da pena bailar.", "P,amused|Pero shh."),
    },
  },
  {
    id: "logro",
    when: "Buenas noticias",
    test: /\b(pase|aprobe|gane|logre)\b|saque (un )?cinco|me fue bien/,
    lines: {
      pilocop: line("R|Misión cumplida.", "proud|Su expediente registra una victoria.", "cheerful|Felicitaciones, ciudadano."),
      pilonator: line("C|Objetivo alcanzado.", "D|Usted ya no necesita protección.", "P,warm|Bien hecho."),
      sayayin: line("S|¡Lo logró!", "E|¡Su nivel de pilera acaba de subir!", "cheerful|¡Felicitaciones!"),
      awoo: line("S|¡Awoo!", "E|¡Se pasó, parce!", "proud|Eso fue pura pilera, de una.", "rhythmic|Siga así, que el semestre va a su ritmo."),
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
      awoo: line("calm|Tranquilo, parce: repase lo clave y duerma bien.", "warm|Usted está más pilas de lo que cree.", "E|¡Hágale, que ese parcial se baila!"),
    },
  },
  {
    id: "nervios",
    when: "Nervios",
    test: /nervios|estres|ansios|miedo|asustad|preocupad/,
    lines: {
      pilocop: line("R|Detecto nervios en aumento.", "helpful|Protocolo sugerido: respire hondo y repase por partes.", "warm|Usted puede."),
      pilonator: line("C|Los nervios no son una amenaza.", "D|Son energía sin dirección.", "confident|Apúntela a sus apuntes."),
      sayayin: line("warm|Hasta los guerreros sienten nervios antes de pelear.", "E|¡Úselos como energía!", "confident|Respire y adelante."),
      awoo: line("calm|Respire hondo y vamos por partes, parce.", "warm|Un paso hoy y todo se acomoda.", "E|¡Hágale!"),
    },
  },
  {
    id: "animo",
    when: "Pedir ánimo",
    test: /motiva|animo|no puedo mas|me rindo|rendir/,
    lines: {
      pilocop: line("R|Recordatorio de servicio: usted ya superó semestres anteriores.", "confident|Este también caerá."),
      pilonator: line("D|Rendirse no está en mi programación.", "confident|Que tampoco esté en la suya."),
      sayayin: line("S|¡No se rinda!", "E|¡Los límites están para superarlos!", "warm|Un paso más y descansa."),
      awoo: line("S|¡Awoo!", "E|¡Hágale, que usted puede!", "rhythmic|Estudiar también tiene ritmo, solo hay que cogerle el compás."),
    },
  },
  {
    id: "tinto",
    when: "Cansancio",
    test: /tinto|cafe\b|sueno|cansad|dormir/,
    lines: {
      pilocop: line("R|Nivel de tinto: doce por ciento.", "worried|Recarga recomendada de inmediato."),
      pilonator: line("C|Mi fuente de energía dura ciento veinte años.", "P,amused|La suya necesita un tinto."),
      sayayin: line("E|¡El tinto es mi semilla del ermitaño!", "P,warm|Uno solo y a seguir entrenando."),
      awoo: line("E|¡Un tintico, de una!", "playful|Pero uno solo, parce, que el cuerpo también pide dormir."),
    },
  },
  {
    id: "hambre",
    when: "Hambre",
    test: /hambre|almuerzo|comer|comida|cafeteria|empanada/,
    lines: {
      pilocop: line("R|Nivel de energía bajo.", "helpful|Diríjase a la cafetería más cercana.", "P,W|Y tráigame una empanada."),
      pilonator: line("C|No necesito comer.", "D|Pero he analizado la empanada.", "P,amused|Es un diseño perfecto."),
      sayayin: line("E|¡Un guerrero no entrena con hambre!", "playful|Coma bien y vuelva con más fuerza."),
      awoo: line("E|¡Parce, a comer primero!", "playful|Un cóndor con hambre no baila ni una canción.", "rhythmic|Coma rico y vuelva pilas."),
    },
  },
  {
    id: "madrugar",
    when: "Madrugar",
    test: /madrug|lunes|clase de siete|temprano/,
    lines: {
      pilocop: line("R|Clase a las siete detectada.", "sleepy|Mis sistemas también arrancan lento.", "helpful|Deje la maleta lista desde la noche."),
      pilonator: line("C|He viajado en el tiempo.", "D|Pero nada es tan difícil como la clase de siete."),
      sayayin: line("E|¡Madrugar es parte del entrenamiento!", "sleepy|Aunque duela un poquito."),
      awoo: line("sleepy|Madrugar es duro, parce.", "helpful|Deje la maleta lista desde la noche.", "E|¡Y arranque el día con ritmo!"),
    },
  },
  {
    id: "descanso",
    when: "Descanso",
    test: /vacaciones|viernes|fin de semana|descans|puente festivo/,
    lines: {
      pilocop: line("R|Descanso autorizado.", "cheerful|Disfrútelo, ciudadano.", "P,W|El lunes retomamos la patrulla."),
      pilonator: line("C|Me dicen que debo descansar.", "D|No sé cómo se hace.", "P,amused|Enséñeme."),
      sayayin: line("E|¡Descansar también es entrenar!", "cheerful|Recargue energía y vuelva más fuerte."),
      awoo: line("E|¡Eso, parce, a descansar!", "warm|Recargue pilas, que el cuerpo también estudia.", "rhythmic|El lunes volvemos con ritmo."),
    },
  },
  {
    id: "calor",
    when: "El calor",
    test: /calor|bochorno|\bsol\b/,
    lines: {
      pilocop: line("R|Temperatura elevada detectada.", "worried|Mis circuitos sudan.", "helpful|Hidrátese, ciudadano."),
      pilonator: line("C|Mi chasis resiste cualquier clima.", "P,amused|Las gafas se me empañan, eso sí."),
      sayayin: line("E|¡Con este calor hasta mi aura suda!", "playful|Agua y sombra, guerrero."),
      awoo: line("E|¡Qué calor, parce!", "helpful|Agüita y sombra, que hay que cuidarse.", "playful|Hasta la cadena me suda."),
    },
  },
  {
    id: "wifi",
    when: "El wifi",
    test: /wifi|internet|senal/,
    lines: {
      pilocop: line("R|Señal débil detectada.", "D|Sospechoso identificado: el wifi.", "amused|Lo tengo bajo vigilancia."),
      pilonator: line("C|El wifi y yo tenemos algo en común.", "P,D|Los dos volveremos."),
      sayayin: line("S|¡Vuelve, wifi!", "E|Si todos levantamos el celular, quizá regrese la señal."),
      awoo: line("alarmed|¡Ay, parce, el wifi se fue de fiesta!", "helpful|Pilas: pruebe otra red o acérquese al punto de conexión."),
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
      awoo: line("E|¡Hágale al taller, parce!", "helpful|Empiece por lo pequeño: portada, índice y un párrafo.", "rhythmic|Poquito a poquito y queda hecho."),
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
      awoo: line("S|¡Awoo!", "amused|Pa’ la biblioteca, parce: allá hasta el silencio suena bien.", "E|Silencio y pilas."),
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
      awoo: line("warm|Una nota baja no es el fin del mundo, parce.", "confident|Todavía puede subir el promedio, una entrega a la vez.", "E|¡Hágale!"),
    },
  },
  {
    id: "grado",
    when: "El grado",
    test: /\bgrado\b|graduar|diploma|toga/,
    lines: {
      pilocop: line("R|Objetivo final localizado: el grado.", "proud|Calculando ruta: una materia a la vez."),
      pilonator: line("D|He visto el final de esta historia.", "C|Hay una toga y un birrete.", "P,warm|Siga adelante."),
      sayayin: line("E|¡El grado es la transformación final!", "S|¡Y cada semestre lo acerca más!"),
      awoo: line("S|¡Awoo!", "proud|El grado es el gran concierto, parce.", "rhythmic|Y cada semestre le acerca la tarima."),
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
      awoo: line("E|¡De una, parce!", "helpful|Pregúntele al profe, que para eso está.", "rhythmic|Quien pregunta aprende, y quien aprende avanza."),
    },
  },
  {
    id: "aburrido",
    when: "Aburrimiento",
    test: /aburrid|pereza|flojera/,
    lines: {
      pilocop: line("R|Aburrimiento detectado.", "helpful|Sugerencia: pídame un chiste o repase diez minutos.", "amused|Yo voto por el chiste."),
      pilonator: line("C|El aburrimiento no existe en mi sistema.", "D|Solo tareas pendientes.", "P,amused|Seguro usted tiene alguna."),
      sayayin: line("E|¡Un guerrero aburrido es un guerrero sin reto!", "playful|Póngase uno pequeño y verá."),
      awoo: line("playful|¿Aburrido, parce?", "E|Póngase un reto cortico: diez minutos de repaso con su música suave.", "rhythmic|Y si quiere, le cuento un chiste."),
    },
  },
  {
    id: "amor",
    when: "Cosas del corazón",
    test: /novia|novio|te amo|te quiero|enamorad|\bamor\b/,
    lines: {
      pilocop: line("R|Mis directivas no cubren asuntos del corazón.", "P,amused|Pero el visor se me pone más rojo."),
      pilonator: line("C|No fui programado para el amor.", "D|Aunque le tengo cariño al semestre."),
      sayayin: line("playful|¡Mi corazón es del estudio!", "laughing|Y un poquito del tinto."),
      awoo: line("playful|¡Uy, parce, qué pregunta!", "warm|Mi corazón late al ritmo de la UDES."),
    },
  },
  {
    id: "musica",
    when: "Cantar o bailar",
    test: /canta|cancion|musica|baila/,
    lines: {
      pilocop: line("singing|Bip, bip, bop.", "R|Fin del concierto.", "amused|Mi repertorio es limitado."),
      pilonator: line("C|No canto.", "D|Pero marco el ritmo con los pasos.", "P,amused|Pum, pum, pum."),
      sayayin: line("singing|¡La, la, la!", "E|¡Cantar también sube la energía!", "laughing|Aunque desafine."),
      awoo: line("S|¡Awoo!", "E|¡Música, parce, de una!", "singing|Pum, pum, pa, pum, pum, pa.", "amused|Mi repertorio es corto, pero tiene ritmo."),
    },
  },
  {
    id: "pelicula",
    when: "Sus gustos",
    test: /pelicula|serie|favorit/,
    lines: {
      pilocop: line("R|Mi película favorita es una de un policía robot.", "P,amused|No recuerdo el nombre."),
      pilonator: line("C|Prefiero las de viajes en el tiempo.", "P,amused|Me parecen documentales."),
      sayayin: line("E|¡Me gustan las de peleas con mucho entrenamiento!", "playful|Y que el héroe siempre vuelva más fuerte."),
      awoo: line("E|¡Parce, me gustan las de música y baile!", "playful|Sobre todo las que terminan con todo el equipo bailando."),
    },
  },
  {
    id: "otro-chiste",
    when: "Otro chiste",
    test: /^otro|otra vez|mas chistes|uno mas/,
    lines: {
      pilocop: line("R|Segundo módulo de humor.", "R|¿Qué le dijo un libro a otro?", "P,R|Nos vemos en la biblioteca.", "P,R|Ja, ja."),
      pilonator: line("C|Otro.", "D|¿Cuál es el colmo de un robot?", "P,amused|Tener nervios de acero y temerle al parcial."),
      sayayin: line("playful|¡Otro!", "E|¿Qué hace un guerrero antes del examen?", "laughing|¡Calienta el lápiz!"),
      awoo: line("playful|¡Otro, de una!", "E|¿Qué hace un estudiante pilas antes del parcial?", "laughing|¡Afina el lápiz, parce!"),
    },
  },
  {
    id: "risa",
    when: "Se ríe",
    test: /^(ja|je|ji){2,}|jaja|jeje|\blol\b/,
    lines: {
      pilocop: line("R|Risa humana detectada.", "proud|Mi módulo de humor funciona."),
      pilonator: line("C|Usted se ríe.", "D|Yo registro el dato.", "P,amused|Ja."),
      sayayin: line("laughing|¡Ja, ja!", "E|¡La risa también recarga energía!"),
      awoo: line("laughing|¡Jajaja, parce!", "E|Reír también recarga pilas."),
    },
  },
  {
    id: "chiste",
    when: "Humor",
    test: /chiste|risa|gracios|humor/,
    lines: {
      pilocop: line("R|Iniciando módulo de humor.", "R|¿Por qué el estudiante llevó una escalera a clase?", "P,R|Porque quería subir la nota.", "P,R|Ja, ja, ja."),
      pilonator: line("C|No fui programado para el humor.", "D|Pero conozco un chiste de viajes en el tiempo.", "P,amused|Se lo conté mañana."),
      sayayin: line("playful|¿Sabe cuál es mi técnica secreta?", "P,E|¡Empezar el trabajo el mismo día que lo dejan!", "laughing|Casi nadie la domina."),
      awoo: line("playful|¿Sabe cuál es mi técnica secreta, parce?", "E|¡Empezar el taller el mismo día que lo dejan!", "laughing|Casi nadie la domina."),
    },
  },
  {
    id: "pulla",
    when: "Una pulla",
    test: /tonto|bobo|\bfeo\b|inutil|te odio/,
    lines: {
      pilocop: line("R|Comentario registrado.", "P,amused|Y archivado sin rencor.", "warm|Sigo a su servicio."),
      pilonator: line("C|Sus palabras no atraviesan mi chasis.", "P,warm|Pero si tuvo un mal día, aquí estoy."),
      sayayin: line("warm|¡Eso no me baja el ánimo!", "playful|Cuénteme qué pasó y lo arreglamos entrenando."),
      awoo: line("warm|Tranquilo, parce, eso no me baja el ánimo.", "playful|Cuénteme qué pasó y lo arreglamos con ritmo."),
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
      awoo: line("E|¡De una, parce!", "warm|Pa’ eso estamos."),
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
      awoo: line("E|Pregúnteme por el parcial, el taller, la biblioteca o el promedio, parce.", "helpful|Y por cualquier dato de la UDES.", "playful|También cuento chistes."),
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
      awoo: line("E|¡Escaneo listo, parce!", "proud|Nivel de pilera: altísimo.", "S|¡Con ritmo y todo!"),
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
      awoo: line("S|¡Awoo, awoo!", "warm|Nos vemos, parce.", "rhythmic|Pilo siempre está pilas."),
    },
  },
  {
    id: "desactivar",
    when: "Al salir del modo",
    lines: {
      pilocop: line("R|Modo Pilocop desactivado.", "sighing|Uf, qué descanso.", "cheerful|¡Hola otra vez!"),
      pilonator: line("D|Hasta la vista.", "P,sighing|Listo, me quité las gafas.", "cheerful|¡Hola otra vez!"),
      sayayin: line("sighing|Uf, se me bajó el copete.", "cheerful|¡Hola otra vez!", "playful|Entrenar cansa."),
      awoo: line("playful|Listo, quito la gorra.", "P,warm|Cuando quiera me llama.", "S|¡Awoo!"),
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

/* --- La voz: la emoción de cada frase --------------------------------------------------- */

/**
 * El tono con que se dice una frase de una respuesta dada en un modo, como
 * viaja al servicio de voz: sus etiquetas separadas por coma («short
 * pause,whispering»). Si la respuesta es del catálogo, cada frase trae el
 * suyo; si la redactó la IA, toda va con el tono del modo.
 */
export function sentenceTone(mode: SuperMode, answer: string, sentence: string): string {
  const said = SUPER_INTENTS.map((i) => i.lines[mode]).find((l) => l.text === answer);
  const s = plainText(sentence);
  const part = s
    ? said?.parts.find((p) => {
        const t = plainText(p.text);
        return t === s || t.includes(s) || s.includes(t);
      })
    : undefined;
  return (part?.tags ?? [SUPER[mode].tone]).join(",");
}

/**
 * Lo mismo, pero con el modo al final («short pause,whispering,modo:pilonator»): así el servidor
 * sabe qué voz del sistema usar (un estilo que se llame como el modo) además de la emoción.
 */
export const voiceTone = (mode: SuperMode, answer: string, sentence: string): string => `${sentenceTone(mode, answer, sentence)},modo:${mode}`;

/* --- Qué hacer con un mensaje ----------------------------------------------------------- */

/** Lo que dice el catálogo, con la forma de una respuesta: sin fuentes ni rastro, porque no salió del servidor. */
export const superAnswer = (said: SuperLine): AskResult => ({ kind: "curada", text: said.text, sources: [], trail: [] });

/**
 * Lo que la conversación hace con un mensaje que es cosa de los modos:
 *   «salir»    se quita el modo y Pilo se despide de él
 *   «activo»   pidieron el modo que ya está puesto
 *   «entrar»   se pone un modo (`short`: ya había otro, la entrada va sin el escaneo)
 *   «charla»   el catálogo del modo responde
 */
export type SuperStep =
  | { kind: "salir"; mode: SuperMode; said: SuperLine }
  | { kind: "activo"; mode: SuperMode; said: SuperLine }
  | { kind: "entrar"; mode: SuperMode; short: boolean; said: SuperLine }
  | { kind: "charla"; mode: SuperMode; said: SuperLine };

/** El paso que toca, o null si el mensaje es una pregunta como cualquiera y sigue al servidor. */
export function superStep(text: string, state: { active: SuperMode | null; last?: SuperMode }): SuperStep | null {
  const { active } = state;
  const cmd = superCommand(text, state);
  if (cmd?.type === "off" && active) return { kind: "salir", mode: active, said: superLine(active, "desactivar") };
  if (cmd?.type === "on") {
    if (cmd.mode === active) return { kind: "activo", mode: active, said: superLine(active, "activo") };
    return { kind: "entrar", mode: cmd.mode, short: Boolean(active), said: superLine(cmd.mode, "activar") };
  }
  const said = active ? superReply(active, text) : null;
  return active && said ? { kind: "charla", mode: active, said } : null;
}
