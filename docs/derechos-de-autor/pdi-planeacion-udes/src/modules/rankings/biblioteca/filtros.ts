/* =============================================================================
   Biblioteca de evidencias · filtros, conteos y aceptación en lote. Puro: lo
   usan la pantalla y las pruebas.
   ========================================================================== */

import { UMBRAL_ALTO, normal } from "./clasificar";

export type EstadoBiblioteca = "sin_clasificar" | "propuesta" | "aceptada" | "descartada";

/** Lo mínimo de una fila de la biblioteca que necesitan los filtros. */
export interface FilaFiltrable {
  id: string;
  nombre: string;
  carpeta: string;
  ruta_zip: string;
  estado: EstadoBiblioteca;
  ods_propuestos: number[];
  propuestas: { indicador: string; ods: number; puntaje: number }[];
  indicador_aceptado: string | null;
}

export interface Filtro {
  estado: EstadoBiblioteca | "todos";
  ods: number | null;
  carpeta: string;
  texto: string;
}

export const FILTRO_INICIAL: Filtro = { estado: "propuesta", ods: null, carpeta: "", texto: "" };

export const ETIQUETA_BIBLIOTECA: Record<EstadoBiblioteca, string> = {
  sin_clasificar: "Sin clasificar",
  propuesta: "Propuestas",
  aceptada: "Aceptadas",
  descartada: "Descartadas",
};

/** ODS de un archivo: el del indicador aceptado, o los que Pilo le ve. */
export function odsDe(f: FilaFiltrable): number[] {
  if (f.indicador_aceptado) return [Number(f.indicador_aceptado.split(".")[0])];
  return f.ods_propuestos;
}

export function filtrar<T extends FilaFiltrable>(filas: T[], f: Filtro): T[] {
  const q = normal(f.texto);
  return filas.filter(
    (x) =>
      (f.estado === "todos" || x.estado === f.estado) &&
      (f.ods === null || odsDe(x).includes(f.ods)) &&
      (!f.carpeta || x.carpeta === f.carpeta || x.carpeta.startsWith(`${f.carpeta}/`)) &&
      (!q || normal(`${x.ruta_zip} ${x.indicador_aceptado ?? ""} ${x.propuestas[0]?.indicador ?? ""}`).includes(q)),
  );
}

export function contarEstados(filas: FilaFiltrable[]): Record<EstadoBiblioteca, number> {
  const c: Record<EstadoBiblioteca, number> = { sin_clasificar: 0, propuesta: 0, aceptada: 0, descartada: 0 };
  for (const f of filas) c[f.estado]++;
  return c;
}

/** Carpetas de primer y segundo nivel, para el filtro. */
export function carpetasDe(filas: FilaFiltrable[]): string[] {
  const s = new Set<string>();
  for (const f of filas) {
    if (!f.carpeta) continue;
    const partes = f.carpeta.split("/");
    s.add(partes[0]);
    if (partes.length > 1) s.add(partes.slice(0, 2).join("/"));
  }
  return [...s].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/** Propuestas que se pueden aceptar en lote: estado «propuesta» y la primera con puntaje alto. */
export function aceptablesEnLote<T extends FilaFiltrable>(filas: T[], umbral = UMBRAL_ALTO): T[] {
  return filas.filter((f) => f.estado === "propuesta" && (f.propuestas[0]?.puntaje ?? 0) >= umbral);
}

/** ¿Está esa dirección publicada (https y no un enlace firmado o privado)? */
export function esEnlacePublico(url: string): boolean {
  const u = url.trim();
  if (!/^https:\/\/[^\s.]+\.\S+$/i.test(u)) return false;
  return !/(token=|X-Amz-Signature|\/object\/sign\/|\/storage\/v1\/object\/authenticated)/i.test(u);
}
