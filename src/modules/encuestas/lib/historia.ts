/* =============================================================================
   Encuestas con Pilo · deshacer y rehacer del editor (puro).

   Una pila de estados de la estructura. Los cambios seguidos sobre el mismo
   campo (cada tecla) se juntan en un solo paso con la misma `clave`.
   ========================================================================== */

export interface Historia<T> {
  pasado: T[];
  presente: T;
  futuro: T[];
  /** Clave del último cambio, para juntar los siguientes. */
  clave: string | null;
}

export const LIMITE_HISTORIA = 100;

export const iniciar = <T>(valor: T): Historia<T> => ({ pasado: [], presente: valor, futuro: [], clave: null });

/** Un cambio nuevo. Con la misma `clave` que el anterior, reemplaza el presente sin abrir otro paso. */
export function cambiar<T>(h: Historia<T>, valor: T, clave: string | null = null): Historia<T> {
  if (Object.is(valor, h.presente)) return h;
  if (clave !== null && clave === h.clave) return { ...h, presente: valor, futuro: [] };
  return { pasado: [...h.pasado, h.presente].slice(-LIMITE_HISTORIA), presente: valor, futuro: [], clave };
}

export function deshacer<T>(h: Historia<T>): Historia<T> {
  if (!h.pasado.length) return h;
  return { pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro], clave: null };
}

export function rehacer<T>(h: Historia<T>): Historia<T> {
  if (!h.futuro.length) return h;
  return { pasado: [...h.pasado, h.presente], presente: h.futuro[0], futuro: h.futuro.slice(1), clave: null };
}

export const puedeDeshacer = <T>(h: Historia<T>): boolean => h.pasado.length > 0;
export const puedeRehacer = <T>(h: Historia<T>): boolean => h.futuro.length > 0;
