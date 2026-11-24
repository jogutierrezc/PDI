/* =============================================================================
   UDrive · el árbol de carpetas.

   Migas de pan, descendientes, a dónde se puede mover una carpeta y qué se ve
   en la papelera. Lo que la base hace cumplir (drive_carpetas_sin_ciclos) se
   repite aquí para no ofrecer lo imposible.
   ========================================================================== */

import { DIAS_PAPELERA } from "../tipos";
import type { ArchivoRow, CarpetaRow } from "../tipos";

type Nodo = Pick<CarpetaRow, "id" | "padre_id" | "nombre">;

/** De la raíz hasta la carpeta, ambas incluidas. Corta si hay un ciclo. */
export function rutaDeCarpeta(carpetas: readonly Nodo[], id: string | null): Nodo[] {
  const porId = new Map(carpetas.map((c) => [c.id, c] as const));
  const ruta: Nodo[] = [];
  const vistos = new Set<string>();
  let actual = id ? porId.get(id) : undefined;
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    ruta.unshift(actual);
    actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
  }
  return ruta;
}

/** Los ids de una carpeta y de todo lo que tiene debajo. */
export function subarbol(carpetas: readonly Nodo[], id: string): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const c of carpetas) if (c.padre_id) hijos.set(c.padre_id, [...(hijos.get(c.padre_id) ?? []), c.id]);
  const salida = new Set<string>([id]);
  const pila = [id];
  while (pila.length) for (const h of hijos.get(pila.pop()!) ?? []) if (!salida.has(h)) (salida.add(h), pila.push(h));
  return salida;
}

/** ¿`candidata` está dentro de `ancestro` (o es la misma)? */
export const estaDentroDe = (carpetas: readonly Nodo[], candidata: string, ancestro: string): boolean => subarbol(carpetas, ancestro).has(candidata);

/** ¿Se puede soltar `mover` (una carpeta) dentro de `destino` (nulo = raíz)? No dentro de sí misma ni de sus descendientes, ni donde ya está. */
export function puedeMoverCarpeta(carpetas: readonly Nodo[], mover: string, destino: string | null): boolean {
  const c = carpetas.find((x) => x.id === mover);
  if (!c || c.padre_id === destino) return false;
  return destino === null || !estaDentroDe(carpetas, destino, mover);
}

/** ¿Se puede soltar un archivo en `destino`? No donde ya está. */
export const puedeMoverArchivo = (archivo: Pick<ArchivoRow, "carpeta_id">, destino: string | null): boolean => archivo.carpeta_id !== destino;

/** Cuántas carpetas y archivos directos tiene una carpeta, sin contar la papelera. */
export function contenidoDe(id: string | null, carpetas: readonly CarpetaRow[], archivos: readonly ArchivoRow[]): { carpetas: number; archivos: number } {
  return {
    carpetas: carpetas.filter((c) => c.padre_id === id && !c.borrado_en).length,
    archivos: archivos.filter((a) => a.carpeta_id === id && !a.borrado_en).length,
  };
}

export interface ItemPapelera {
  tipo: "carpeta" | "archivo";
  id: string;
  nombre: string;
  borrado_en: string;
  /** Días que le quedan antes de borrarse para siempre (0 = hoy). */
  dias: number;
}

/** Los días que le quedan a lo que está en la papelera, contando desde `ahora`. */
export function diasRestantes(borradoEn: string, ahora: number = Date.now()): number {
  const t = Date.parse(borradoEn);
  if (Number.isNaN(t)) return DIAS_PAPELERA;
  return Math.max(0, DIAS_PAPELERA - Math.floor((ahora - t) / 86_400_000));
}

/**
 * Lo que se muestra en la papelera: lo que se borró por sí mismo, no lo que
 * se fue dentro de una carpeta borrada en el mismo momento (vuelve con ella).
 */
export function elementosDePapelera(carpetas: readonly CarpetaRow[], archivos: readonly ArchivoRow[], ahora: number = Date.now()): ItemPapelera[] {
  const marca = new Map(carpetas.filter((c) => c.borrado_en).map((c) => [c.id, c.borrado_en!] as const));
  const dentroDeBorrada = (padre: string | null, borrado: string) => padre !== null && marca.get(padre) === borrado;
  const salida: ItemPapelera[] = [];
  for (const c of carpetas) if (c.borrado_en && !dentroDeBorrada(c.padre_id, c.borrado_en)) salida.push({ tipo: "carpeta", id: c.id, nombre: c.nombre, borrado_en: c.borrado_en, dias: diasRestantes(c.borrado_en, ahora) });
  for (const a of archivos) if (a.borrado_en && !dentroDeBorrada(a.carpeta_id, a.borrado_en)) salida.push({ tipo: "archivo", id: a.id, nombre: a.nombre, borrado_en: a.borrado_en, dias: diasRestantes(a.borrado_en, ahora) });
  return salida.sort((x, y) => y.borrado_en.localeCompare(x.borrado_en));
}
