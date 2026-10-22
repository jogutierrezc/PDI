/* =============================================================================
   Encuestas con Pilo · la Capa de Pilo (puro).

   La explicación que Pilo da de cada dato. El editor la escribe o pide una
   sugerencia a la IA (action «sugerir» de pilo-ia); la sugerencia llega como
   borrador y nunca pisa lo que la persona escribió. Si la IA está apagada o no
   responde, hay un texto de respaldo hecho con la propia pregunta: sin inventar
   cifras ni plazos.
   ========================================================================== */

import type { Pregunta, TipoPregunta } from "./estructura";

const AYUDA: Record<TipoPregunta, string> = {
  texto_corto: "Escriba la respuesta en una línea, con sus propias palabras.",
  parrafo: "Cuéntelo con sus palabras, en pocas líneas y con lo más importante primero.",
  opcion_unica: "Elija la opción que mejor describe su caso; solo se puede una.",
  opcion_multiple: "Marque todas las opciones que apliquen a su caso.",
  lista: "Abra la lista y elija la opción que corresponde.",
  escala: "Elija un número de la escala; los extremos indican el menor y el mayor acuerdo o valor.",
  cifra: "Escriba solo el número, sin letras. Use la unidad que se indica y revise que sea el dato real.",
  fecha: "Elija el día en el calendario o escríbalo con día, mes y año.",
  contacto: "Escriba el dato completo y revíselo antes de seguir, para que podamos comunicarnos.",
  archivo: "Adjunte el documento que se pide. Revise que sea el archivo correcto.",
  bloque_logro_reto: "Cada uno lleva una frase corta, una descripción y las cifras que lo respaldan. Puede agregar los que necesite.",
};

/** Un texto de respaldo hecho con la pregunta: se ofrece cuando no hay IA. */
export function respaldoExplicacion(p: Pick<Pregunta, "tipo" | "enunciado" | "apoyo" | "validaciones">): string {
  const apoyo = p.apoyo?.trim();
  const unidad = p.tipo === "cifra" && p.validaciones?.unidad ? ` Unidad: ${p.validaciones.unidad}.` : "";
  return `${p.enunciado.trim().replace(/[.:]+$/, "")}. ${AYUDA[p.tipo]}${unidad}${apoyo ? ` ${apoyo}` : ""}`.replace(/\s+/g, " ").trim();
}

export type DisponibleIA = "si" | "apagada" | "sin_sesion";

/**
 * Aplica una sugerencia sin pisar nada: si la explicación actual tiene texto, la
 * sugerencia queda aparte como borrador (devuelve null para «no tocar»); si está
 * vacía, también se ofrece como borrador, nunca se escribe sola.
 */
export function ofrecerBorrador(actual: string, sugerencia: string): { borrador: string; pisa: boolean } | null {
  const s = sugerencia.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return { borrador: s, pisa: actual.trim().length > 0 };
}

/** El mensaje claro cuando la IA no pudo sugerir. */
export function mensajeSinIA(motivo: DisponibleIA | "error", detalle = ""): string {
  if (motivo === "apagada") return "Mr. Pilo con IA está apagado. Puede escribir la explicación usted, o usar el texto de respaldo.";
  if (motivo === "sin_sesion") return "Inicie sesión de nuevo para pedirle una sugerencia a Pilo.";
  return `Pilo no pudo sugerir ahora${detalle ? ` (${detalle})` : ""}. Puede escribirla usted o usar el texto de respaldo.`;
}
