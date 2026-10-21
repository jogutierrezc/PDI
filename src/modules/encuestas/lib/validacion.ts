/* =============================================================================
   Encuestas con Pilo · validación de lo que escribe la persona.

   Puro. Los límites son los de la función `encuestas` (que vuelve a comprobarlos
   en el servidor): la interfaz solo evita el viaje de ida y vuelta.
   ========================================================================== */

import type { AporteEnvio, CifraEnvio, TipoAporte, TipoCifra } from "../tipos";

export const LIMITES = {
  dependencia: { min: 3, max: 90 },
  titulo: { min: 5, max: 120 },
  descripcion: { min: 20, max: 500 },
  que: { min: 2, max: 80 },
  otro: { min: 2, max: 20 },
  aportes: 30,
  cifras: 12,
  porcentajeMax: 100,
} as const;

const ENTRE = (s: string, l: { min: number; max: number }) => s.length >= l.min && s.length <= l.max;
/** Una sola palabra de letras, de 2 a 20 (igual que el servidor). */
const esPalabra = (s: string) => s.length >= LIMITES.otro.min && s.length <= LIMITES.otro.max && /^\p{L}+$/u.test(s);
const compacto = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Lee un número como se escribe en Colombia: el punto separa miles y la coma, decimales.
 * «1.250» es 1250; «1.250,75» es 1250.75; «12,5» es 12.5; y «12.5» (un solo punto y uno
 * o dos dígitos detrás) es decimal. Acepta un «$» al inicio y un «%» al final.
 * null si no es un número (también los negativos: una cifra no baja de cero).
 */
export function leerNumero(texto: string): number | null {
  let s = texto.trim().replace(/\s/g, "").replace(/^\$/, "").replace(/%$/, "");
  if (!s || /[^0-9.,]/.test(s) || !/\d/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!((s.match(/\./g) ?? []).length === 1 && /\.\d{1,2}$/.test(s))) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** El número como se lee en Colombia, con su unidad: «$ 1.250», «22,5 %», «412». */
export function formatearValor(n: number, tipo: TipoCifra): string {
  const f = n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  return tipo === "dinero" ? `$ ${f}` : tipo === "porcentaje" ? `${f} %` : f;
}

export interface CifraBorrador {
  id: number;
  que: string;
  tipo: TipoCifra | "";
  otro: string;
  valor: string;
}

export type CampoCifra = "que" | "tipo" | "otro" | "valor";
export interface ErrorCifra {
  campo: CampoCifra;
  mensaje: string;
}

export function validarDependencia(v: string): string | null {
  return ENTRE(compacto(v), LIMITES.dependencia) ? null : `Escriba el nombre de su dependencia (de ${LIMITES.dependencia.min} a ${LIMITES.dependencia.max} caracteres).`;
}

export function validarTitulo(v: string, tipo: TipoAporte): string | null {
  return ENTRE(v.trim(), LIMITES.titulo) ? null : `Escriba ${tipo === "logro" ? "el logro" : "el reto"} en una frase de ${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres.`;
}

export function validarDescripcion(v: string): string | null {
  const n = v.trim().length;
  if (n < LIMITES.descripcion.min) return `Cuéntenos un poco más: la descripción necesita al menos ${LIMITES.descripcion.min} caracteres.`;
  return n > LIMITES.descripcion.max ? `La descripción no puede pasar de ${LIMITES.descripcion.max} caracteres.` : null;
}

/** El primer problema de una cifra, o la cifra ya lista para enviar. */
export function validarCifra(c: CifraBorrador): { error: ErrorCifra } | { cifra: CifraEnvio } {
  const que = compacto(c.que);
  if (!ENTRE(que, LIMITES.que)) return { error: { campo: "que", mensaje: `Diga qué es la cifra (de ${LIMITES.que.min} a ${LIMITES.que.max} caracteres).` } };
  if (!c.tipo) return { error: { campo: "tipo", mensaje: "Elija el tipo de cifra." } };
  const otro = c.otro.trim();
  if (c.tipo === "otro" && !esPalabra(otro)) {
    return { error: { campo: "otro", mensaje: `Defina el tipo en una sola palabra, de ${LIMITES.otro.min} a ${LIMITES.otro.max} letras, sin números ni símbolos.` } };
  }
  const valor = leerNumero(c.valor);
  if (valor === null) return { error: { campo: "valor", mensaje: "Escriba un valor numérico, por ejemplo 1.250 o 12,5." } };
  if (c.tipo === "porcentaje" && valor > LIMITES.porcentajeMax) return { error: { campo: "valor", mensaje: "Un porcentaje no puede pasar de 100." } };
  return { cifra: { que, tipo: c.tipo, ...(c.tipo === "otro" ? { otro } : {}), valor } };
}

/** Valida todas las cifras de un aporte: las que sirven y el error de cada una que no. */
export function validarCifras(cifras: readonly CifraBorrador[]): { errores: Map<number, ErrorCifra>; listas: CifraEnvio[]; general: string | null } {
  const errores = new Map<number, ErrorCifra>();
  const listas: CifraEnvio[] = [];
  if (cifras.length < 1) return { errores, listas, general: "Agregue al menos una cifra." };
  if (cifras.length > LIMITES.cifras) return { errores, listas, general: `Un aporte lleva hasta ${LIMITES.cifras} cifras.` };
  for (const c of cifras) {
    const r = validarCifra(c);
    if ("error" in r) errores.set(c.id, r.error);
    else listas.push(r.cifra);
  }
  return { errores, listas, general: null };
}

/** El cuerpo de `enviar` para la función, ya limpio. */
export function cuerpoEnvio(slug: string, dependencia: string, aportes: readonly AporteEnvio[]) {
  return {
    slug,
    dependencia: compacto(dependencia),
    aportes: aportes.map((a) => ({ tipo: a.tipo, titulo: a.titulo.trim(), descripcion: a.descripcion.trim(), cifras: a.cifras })),
    web: "",
  };
}

/** ¿Queda lugar para otro aporte en este envío? */
export const caben = (n: number): boolean => n < LIMITES.aportes;
