/* =============================================================================
   Encuestas con Pilo · lo que dice Mr. Pilo.

   Las frases fijas de la bienvenida, la guía y la despedida. Lo que depende de
   la encuesta (el título, la introducción y la despedida) sale de ella y se
   intercala aquí; si falta, esa frase simplemente no se dice.
   ========================================================================== */

import type { PiloExpression } from "../../../components/pilo/PiloFace";

export interface Frase {
  id: string;
  say: string;
  face: PiloExpression;
  /** Hacia dónde mira (−1 a 1). */
  look: [number, number];
  chips: string[];
  /** Cómo suena la voz oficial. */
  voz: "emocionado" | "atrevido" | "atento";
}

/** La bienvenida: saludo, el propósito de la encuesta (suyo) y cómo se recorre el formulario. */
export function frasesBienvenida(intro: string): Frase[] {
  const propio = intro.trim();
  return [
    { id: "hola", say: "¡Hola! Soy Mr. Pilo, la Inteligencia Artificial de la Universidad de Santander. Gracias por acompañarnos.", face: "feliz", look: [0, -0.1], chips: ["Universidad de Santander"], voz: "emocionado" },
    ...(propio ? [{ id: "intro", say: propio, face: "atrevido" as const, look: [0.35, 0.15] as [number, number], chips: [], voz: "atrevido" as const }] : []),
    { id: "importa", say: "Su aporte es muy significativo, y nos importa de verdad. Ahora le explico cómo funciona este formulario, para que lo recorramos juntos.", face: "emocionado", look: [0, -0.2], chips: ["Su aporte importa"], voz: "emocionado" },
    { id: "ingreso", say: "Primero se identifica con su correo institucional de la UDES, a través de Microsoft. Solo ingresan los correos autorizados.", face: "feliz", look: [-0.3, 0.3], chips: ["Correo institucional", "Ingreso con Microsoft"], voz: "atento" },
    { id: "elegir", say: "Después elige qué quiere contar: un logro o un reto. Puede registrar varios, de uno en uno.", face: "atrevido", look: [0.3, 0.2], chips: ["Un logro", "Un reto"], voz: "atrevido" },
    { id: "detalle", say: "De cada uno me cuenta cuál es, lo describe en máximo quinientos caracteres y agrega las cifras que lo respaldan: qué es la cifra, de qué tipo es y su valor.", face: "feliz", look: [-0.2, 0.3], chips: ["Descripción, 500 caracteres", "Qué es la cifra", "Tipo de cifra", "Valor"], voz: "atento" },
    { id: "envio", say: "Cuando termine, lo envía y yo me despido. ¡Empecemos!", face: "emocionado", look: [0, 0], chips: ["Enviar", "Despedida de Pilo"], voz: "emocionado" },
  ];
}

/** La despedida: agradece, dice lo que dice la encuesta (suyo) y se va volando. */
export function frasesDespedida(despedida: string): Frase[] {
  const propia = despedida.trim();
  return [
    { id: "listo", say: "¡Listo! Sus aportes ya están enviados. Muchas gracias por tomarse este tiempo.", face: "emocionado", look: [0, -0.2], chips: [], voz: "emocionado" },
    ...(propia ? [{ id: "propia", say: propia, face: "feliz" as const, look: [0, -0.2] as [number, number], chips: [], voz: "atento" as const }] : []),
    { id: "vuelo", say: "Yo se lo agradezco de corazón, pero ya es el momento de volar. ¡Hasta pronto!", face: "atrevido", look: [0.8, -0.2], chips: [], voz: "atrevido" },
  ];
}

/** Lo que Pilo dice en la guía, por paso. */
export const GUIA = {
  identificar: "Para empezar, necesito saber quién es usted. Escriba su dependencia y continúe con Microsoft con su correo de la UDES.",
  revisar: "Revise la dependencia. Necesito el nombre de su dependencia para continuar.",
  verificando: "Estoy confirmando su cuenta con Microsoft, un momento.",
  confirmada: "Ya lo reconozco. Ahora cuénteme qué quiere enviar: un logro o un reto.",
  microsoftFalla: "No pude confirmar su cuenta con Microsoft. Pruebe de nuevo con su correo de la UDES.",
  elegir: "¿Qué quiere contar? Elija un logro o un reto.",
  sinPrisa: "Sin problema. ¿Qué quiere contar?",
  guardado: "Guardado. Puede registrar otro logro, otro reto, o enviar todo cuando esté listo.",
  otraCifra: "Perfecto, otra cifra. Recuerde: qué es, el tipo y su valor.",
  faltaAlgo: "Falta algo por completar. Revise lo marcado en rojo.",
  enviando: "Un momento, estoy enviando sus aportes.",
  reintento: "No pude enviarlos, pero no se perdió nada de lo que escribió. Revise su conexión y pruebe de nuevo.",
  vencida: "La confirmación de Microsoft venció. Confírmela de nuevo; sus aportes siguen guardados.",
  cerrada: "Lo siento, esta encuesta ya no recibe respuestas.",
  otroMas: "¿Quiere contarme algo más? Elija un logro o un reto.",
} as const;

export const guiaDetalle = (sub: 1 | 2 | 3, tipo: "logro" | "reto"): [string, PiloExpression] =>
  sub === 1
    ? [`Dígame ${tipo === "logro" ? "cuál es el logro que quiere destacar" : "cuál es el reto"}. Una frase corta, como el título en el video.`, "feliz"]
    : sub === 2
      ? ["Ahora descríbalo en máximo quinientos caracteres. Lo concreto ayuda: qué se hizo, para quién y qué cambió.", "atrevido"]
      : ["Estas son las cifras que lo respaldan. Cada una lleva qué es, de qué tipo y su valor. Puede agregar varias.", "emocionado"];

/** Los correos que admite Microsoft aquí (para que la persona sepa con cuál entrar). */
export const DOMINIOS_VISIBLES = ["udes.edu.co", "mail.udes.edu.co", "bucaramanga.udes.edu.co", "bogota.udes.edu.co", "cucuta.udes.edu.co", "valledupar.udes.edu.co"] as const;
