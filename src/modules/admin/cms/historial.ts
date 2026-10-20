/* =============================================================================
   CMS Portales · pila de deshacer y rehacer del lienzo.

   Funciones puras sobre un valor inmutable (la lista de bloques). Cada cambio
   guarda el estado anterior; con un máximo de 60 pasos. Los cambios de texto
   que llegan con la misma «clave» (p. ej. escribir en un campo) se fusionan en
   un solo paso, para que deshacer no retroceda letra por letra.
   ========================================================================== */

export const LIMITE_HISTORIAL = 60;

export interface Historial<T> {
  actual: T;
  pasado: T[];
  futuro: T[];
  /** Clave del último cambio fusionable; null si el siguiente cambio abre paso nuevo. */
  clave: string | null;
}

/** Solo guarda los últimos pasos. */
function acotar<T>(pasado: T[]): T[] {
  return pasado.length > LIMITE_HISTORIAL ? pasado.slice(pasado.length - LIMITE_HISTORIAL) : pasado;
}

export function nuevoHistorial<T>(actual: T): Historial<T> {
  return { actual, pasado: [], futuro: [], clave: null };
}

/**
 * Registra un cambio. Con una clave igual a la del cambio anterior, reemplaza
 * el valor actual sin abrir un paso nuevo. Cualquier cambio anula lo que se
 * podía rehacer.
 */
export function cambiar<T>(h: Historial<T>, siguiente: T, clave?: string): Historial<T> {
  if (siguiente === h.actual) return h;
  if (clave && clave === h.clave) return { ...h, actual: siguiente, futuro: [] };
  return { actual: siguiente, pasado: acotar([...h.pasado, h.actual]), futuro: [], clave: clave ?? null };
}

/** Corta la fusión: el siguiente cambio abrirá un paso nuevo aunque tenga la misma clave. */
export function cortarFusion<T>(h: Historial<T>): Historial<T> {
  return h.clave === null ? h : { ...h, clave: null };
}

export function deshacer<T>(h: Historial<T>): Historial<T> {
  if (h.pasado.length === 0) return h;
  const anterior = h.pasado[h.pasado.length - 1];
  return { actual: anterior, pasado: h.pasado.slice(0, -1), futuro: [h.actual, ...h.futuro], clave: null };
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
  if (h.futuro.length === 0) return h;
  const [siguiente, ...resto] = h.futuro;
  return { actual: siguiente, pasado: acotar([...h.pasado, h.actual]), futuro: resto, clave: null };
}
