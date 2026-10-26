/* =============================================================================
   UDrive · nombres.

   Nombres únicos dentro de una carpeta (la base lo exige sin importar las
   mayúsculas), nombres limpios y la ruta segura de Storage: el nombre de un
   archivo que sube una persona nunca se usa tal cual como ruta.
   ========================================================================== */

import { MAX_BYTES } from "../tipos";

export const MAX_NOMBRE = 160;

/** Un nombre limpio: sin barras ni caracteres de control, espacios simples, recortado al máximo. */
export function limpiarNombre(nombre: string, max = MAX_NOMBRE): string {
  return nombre
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const mismo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const nombreEnUso = (nombre: string, existentes: readonly string[]): boolean => existentes.some((e) => mismo(e, nombre));

/** Si «Informe» ya existe, «Informe (2)»; si también, «Informe (3)». Respeta la extensión: «foto.png» → «foto (2).png». */
export function nombreUnico(nombre: string, existentes: readonly string[]): string {
  const base = limpiarNombre(nombre) || "Sin nombre";
  if (!nombreEnUso(base, existentes)) return base;
  const punto = base.lastIndexOf(".");
  const [cuerpo, ext] = punto > 0 && base.length - punto <= 8 ? [base.slice(0, punto), base.slice(punto)] : [base, ""];
  for (let n = 2; ; n++) {
    const candidato = `${cuerpo} (${n})${ext}`;
    if (!nombreEnUso(candidato, existentes)) return candidato;
  }
}

/**
 * La última parte de la ruta en Storage: solo letras, números, punto, guion y
 * guion bajo (como exige la base), sin tildes, sin punto al comienzo y con la
 * extensión conservada. «Informe final (v2).PDF» → «Informe_final_v2.pdf».
 */
export function nombreSeguroStorage(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "")
    .replace(/\.{2,}/g, ".");
  const punto = limpio.lastIndexOf(".");
  const cuerpo = punto > 0 ? limpio.slice(0, punto) : limpio;
  const ext = punto > 0 ? limpio.slice(punto).toLowerCase() : "";
  const recortado = `${cuerpo.replace(/[_-]+$/, "").slice(0, 150 - ext.length)}${ext.slice(0, 12)}`;
  return recortado && recortado !== ext ? recortado : `archivo${ext.slice(0, 12)}`;
}

/** La ruta completa en el bucket: «<persona>/<archivo>/<nombre seguro>». Las dos primeras partes deben ser uuid. */
export function rutaStorage(persona: string, archivo: string, nombre: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(persona) || !uuid.test(archivo)) throw new Error("Identificador no válido para la ruta.");
  return `${persona}/${archivo}/${nombreSeguroStorage(nombre)}`;
}

/** La ruta de un archivo de una unidad de trabajo: «unidades/<unidad>/<archivo>/<nombre seguro>» (0191). */
export function rutaStorageUnidad(unidad: string, archivo: string, nombre: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(unidad) || !uuid.test(archivo)) throw new Error("Identificador no válido para la ruta.");
  return `unidades/${unidad}/${archivo}/${nombreSeguroStorage(nombre)}`;
}

/** Lo que está mal en un archivo antes de subirlo, en español; «» si se puede subir. */
export function errorDeSubida(archivo: { name: string; size: number }): string {
  if (!limpiarNombre(archivo.name)) return "El archivo no tiene un nombre válido.";
  if (archivo.size <= 0) return `«${archivo.name}» está vacío.`;
  if (archivo.size > MAX_BYTES) return `«${archivo.name}» pesa ${textoTamano(archivo.size)}; el máximo es 100 MB.`;
  return "";
}

/** «1,2 MB», «830 KB», «12 B». */
export function textoTamano(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
}
