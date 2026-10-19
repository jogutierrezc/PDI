/* =============================================================================
   Internacionalización · carpetas con subcarpetas (0166). Lógica pura: el árbol,
   la ruta de una carpeta, qué tablas caen en una carpeta y sus subcarpetas, y si
   una carpeta puede moverse a otra. La base vuelve a comprobar los ciclos y los
   5 niveles (int_carpetas_guard).
   ========================================================================== */

import type { IntCarpetaRow, IntLibroRow } from "../tipos";

export const NIVELES_MAX = 5;

export type CarpetaRef = Pick<IntCarpetaRow, "id" | "nombre" | "parent_id"> & Partial<Pick<IntCarpetaRow, "orden">>;

export interface NodoCarpeta<C extends CarpetaRef = CarpetaRef> {
  carpeta: C;
  nivel: number;
  hijas: NodoCarpeta<C>[];
}

const porNombre = (a: CarpetaRef, b: CarpetaRef) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, "es");

/** El árbol de carpetas, ordenado por `orden` y nombre. Una carpeta cuyo padre no existe cuelga de la raíz. */
export function armarArbol<C extends CarpetaRef>(carpetas: readonly C[]): NodoCarpeta<C>[] {
  const ids = new Set(carpetas.map((c) => c.id));
  const hijasDe = (padre: string | null, nivel: number): NodoCarpeta<C>[] =>
    carpetas
      .filter((c) => (padre === null ? c.parent_id === null || !ids.has(c.parent_id) : c.parent_id === padre))
      .sort(porNombre)
      .map((carpeta) => ({ carpeta, nivel, hijas: nivel < NIVELES_MAX ? hijasDe(carpeta.id, nivel + 1) : [] }));
  return hijasDe(null, 1);
}

/** Las carpetas en orden de lectura (cada una seguida de sus subcarpetas), con su nivel. */
export function aplanar<C extends CarpetaRef>(arbol: readonly NodoCarpeta<C>[]): { carpeta: C; nivel: number }[] {
  return arbol.flatMap((n) => [{ carpeta: n.carpeta, nivel: n.nivel }, ...aplanar(n.hijas)]);
}

/** De la raíz a la carpeta pedida (incluida). Vacío si no existe o es nula. */
export function rutaDe<C extends CarpetaRef>(carpetas: readonly C[], id: string | null | undefined): C[] {
  const ruta: C[] = [];
  let actual = id ? carpetas.find((c) => c.id === id) : undefined;
  while (actual && ruta.length < NIVELES_MAX + 1) {
    ruta.unshift(actual);
    const padre: string | null = actual.parent_id;
    actual = padre ? carpetas.find((c) => c.id === padre) : undefined;
  }
  return ruta;
}

/** El id de la carpeta y los de todas sus subcarpetas, a cualquier profundidad. */
export function conDescendientes(carpetas: readonly CarpetaRef[], id: string): string[] {
  const salida = [id];
  for (let i = 0; i < salida.length; i++) for (const c of carpetas) if (c.parent_id === salida[i] && !salida.includes(c.id)) salida.push(c.id);
  return salida;
}

/** Cuántos niveles tiene la rama que cuelga de esta carpeta (ella incluida). */
function alturaDe(carpetas: readonly CarpetaRef[], id: string): number {
  const hijas = carpetas.filter((c) => c.parent_id === id);
  return 1 + (hijas.length ? Math.max(...hijas.map((h) => alturaDe(carpetas, h.id))) : 0);
}

/**
 * ¿Puede ponerse `id` dentro de `destino` (nulo = raíz)? No dentro de sí misma ni de
 * sus subcarpetas, y sin pasar de 5 niveles.
 */
export function puedeMoverCarpeta(carpetas: readonly CarpetaRef[], id: string, destino: string | null): boolean {
  if (destino === null) return true;
  if (conDescendientes(carpetas, id).includes(destino)) return false;
  return rutaDe(carpetas, destino).length + alturaDe(carpetas, id) <= NIVELES_MAX;
}

/** ¿Puede crearse una subcarpeta dentro de esta (nula = raíz)? */
export const puedeCrearDentro = (carpetas: readonly CarpetaRef[], id: string | null) => id === null || rutaDe(carpetas, id).length < NIVELES_MAX;

export type LibroEnCarpeta = Pick<IntLibroRow, "id" | "carpeta_id">;

/** Tablas que están directamente en la carpeta (`null` = «Sin carpeta»). */
export const librosDe = <L extends LibroEnCarpeta>(libros: readonly L[], carpeta: string | null) =>
  libros.filter((l) => (l.carpeta_id ?? null) === carpeta);

/** Tablas en la carpeta y en todas sus subcarpetas. */
export function librosEnRama<L extends LibroEnCarpeta>(libros: readonly L[], carpetas: readonly CarpetaRef[], id: string): L[] {
  const ramas = new Set(conDescendientes(carpetas, id));
  return libros.filter((l) => l.carpeta_id && ramas.has(l.carpeta_id));
}

/** Una carpeta sin tablas ni subcarpetas: la única que se puede borrar. */
export function carpetaVacia(libros: readonly LibroEnCarpeta[], carpetas: readonly CarpetaRef[], id: string): boolean {
  return !libros.some((l) => l.carpeta_id === id) && !carpetas.some((c) => c.parent_id === id);
}

/** Un nombre de carpeta limpio, o nulo si queda vacío o ya existe entre sus hermanas. */
export function nombreCarpetaValido(carpetas: readonly CarpetaRef[], parent: string | null, nombre: string, ignorar?: string): string | null {
  const limpio = nombre.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!limpio) return null;
  const igual = carpetas.some((c) => c.id !== ignorar && c.parent_id === parent && c.nombre.trim().toLowerCase() === limpio.toLowerCase());
  return igual ? null : limpio;
}
