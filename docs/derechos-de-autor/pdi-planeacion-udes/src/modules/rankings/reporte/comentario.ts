/* =============================================================================
   Comentario en español de una respuesta · máximo 1000 caracteres (lo que
   THE acepta en el portal). Pilo lo traduce a inglés; el español es el
   original y siempre existe.

   Se cuentan caracteres (puntos de código, como char_length de Postgres), no
   bytes ni unidades de código de JavaScript: una «ñ» o un emoji cuentan como
   uno. Antes de contar se normalizan los saltos de línea y se quitan los
   espacios de los extremos, igual que lo guarda la pantalla.
   ========================================================================== */

export const LIMITE_COMENTARIO = 1000;
/** Desde aquí, la pantalla avisa de que se acerca el tope. */
export const UMBRAL_CERCA = 900;

export type EstadoComentario = "ok" | "near" | "over";

export interface ConteoComentario {
  caracteres: number;
  limite: number;
  /** Lo que queda (negativo si se pasó). */
  restantes: number;
  /** ok: hay sitio; near: a menos de 100 del tope; over: pasa del tope. */
  estado: EstadoComentario;
}

/** Quita el ruido de la captura: saltos de Windows, espacios de los extremos. */
export function normalizarComentario(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").trim();
}

/** Cuenta caracteres (puntos de código) tras normalizar. */
export function contarComentario(texto: string): ConteoComentario {
  const caracteres = Array.from(normalizarComentario(texto)).length;
  const restantes = LIMITE_COMENTARIO - caracteres;
  const estado: EstadoComentario = caracteres > LIMITE_COMENTARIO ? "over" : caracteres >= UMBRAL_CERCA ? "near" : "ok";
  return { caracteres, limite: LIMITE_COMENTARIO, restantes, estado };
}

/** Mensaje para la persona, o nulo si el comentario puede guardarse. */
export function errorComentario(texto: string): string | null {
  const c = contarComentario(texto);
  if (c.estado === "over") {
    return `El comentario tiene ${c.caracteres} caracteres; el máximo es ${LIMITE_COMENTARIO}. Quite ${-c.restantes}.`;
  }
  return null;
}

/** Recorta al límite, contando caracteres y sin partir un punto de código. */
export function recortarComentario(texto: string): string {
  return Array.from(normalizarComentario(texto)).slice(0, LIMITE_COMENTARIO).join("");
}
