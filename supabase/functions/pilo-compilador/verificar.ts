/* =============================================================================
   Pilo compilador · verificación del texto (puro).

   Un token [[clave]] debe ser de un indicador que tenga valor y no esté en conflicto; una cifra escrita con
   dígitos fuera de un token no pasa (salvo años y marcadores de lista) y se avisa.
   ========================================================================== */

import type { Indicador } from "./pedido.ts";

const TOKEN = /\[\[([a-z0-9_]+)\]\]/gi;
const ANIO = /\b(19|20)\d{2}\b/g;
const NUMERO = /\d[\d.,]*/g;

export interface Verificacion {
  /** Errores que obligan a reescribir (tokens que no existen o de datos pendientes). */
  errores: string[];
  /** Cifras escritas con dígitos fuera de un token. */
  aMano: string[];
  usados: string[];
}

export function verificarTexto(texto: string, indicadores: Indicador[]): Verificacion {
  const porClave = new Map(indicadores.map((i) => [i.clave.toLowerCase(), i]));
  const errores: string[] = [];
  const usados: string[] = [];
  for (const m of texto.matchAll(TOKEN)) {
    const k = m[1].toLowerCase();
    const i = porClave.get(k);
    if (!i) errores.push(`el token [[${m[1]}]] no existe.`);
    else if (i.valor === null || i.conflicto) errores.push(`el indicador «${i.nombre}» está pendiente (sin valor o en conflicto) y no se cita con token.`);
    else if (!usados.includes(k)) usados.push(k);
  }
  const sinTokens = texto.replace(TOKEN, " ").replace(ANIO, " ").replace(/^\s*\d+[.)]\s/gm, " ");
  const aMano = sinTokens.match(NUMERO) ?? [];
  return { errores: [...new Set(errores)], aMano, usados };
}

export const textoDeErrores = (v: Verificacion): string => (v.errores.length ? `${v.errores.slice(0, 6).join(" ")}` : "");
