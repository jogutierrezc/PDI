/* =============================================================================
   UI GreenMetric · ayudas sobre el catálogo (puras).

   El catálogo base está en ../data/catalogo.ts; el del ciclo viene de la base
   (ugm_preguntas) con la misma forma. Estas funciones sirven para los dos.
   ========================================================================== */

import { CATALOGO_2026, CATEGORIAS } from "../data/catalogo";
import type { CategoriaCatalogo, CategoriaId, PreguntaCatalogo } from "./tipos";

export { CATALOGO_2026, CATEGORIAS };

export const IDS_CATEGORIA: readonly CategoriaId[] = ["SI", "EC", "WS", "WR", "TR", "ED", "GD"];

/** Orden numérico de «1.10» frente a «1.9». */
export const compararQ = (a: string, b: string): number => {
  const [a1, a2] = a.split(".").map(Number);
  const [b1, b2] = b.split(".").map(Number);
  return a1 - b1 || a2 - b2;
};

export function indexarPreguntas<T extends { q: string }>(preguntas: readonly T[]): Map<string, T> {
  return new Map(preguntas.map((p) => [p.q, p]));
}

export const preguntaBase = (q: string): PreguntaCatalogo | undefined => CATALOGO_2026.find((p) => p.q === q);

export function preguntasDe<T extends { categoria: CategoriaId; orden: number }>(preguntas: readonly T[], categoria: CategoriaId): T[] {
  return preguntas.filter((p) => p.categoria === categoria).sort((a, b) => a.orden - b.orden);
}

export const categoriaDe = (id: CategoriaId, categorias: readonly CategoriaCatalogo[] = CATEGORIAS): CategoriaCatalogo | undefined => categorias.find((c) => c.categoria === id);

/** «1.10 · SI3» o «1.10». */
export const etiquetaPregunta = (p: { q: string; indicador: string | null }): string => (p.indicador ? `${p.q} · ${p.indicador}` : p.q);

/** El código con el punto que usa la guía en los títulos: «SI3» → «SI.3». */
export const codigoConPunto = (indicador: string | null): string => (indicador ? indicador.replace(/^([A-Z]{2})(\d+)$/, "$1.$2") : "");

/** Preguntas que cuentan como «indicador publicable» (plantilla o calculada): son las 93 de la guía 2026. */
export const cuentaComoIndicador = (p: { plantilla: string | null; calculada: boolean }): boolean => p.plantilla !== null || p.calculada;

export const INDICADORES_CALCULADOS = ["SI4", "EC4", "EC8", "TR4", "ED1", "ED2", "GD1"] as const;

/** Nombre de archivo de la plantilla oficial con el prefijo de la universidad (por omisión el literal «University_Country»). */
export function nombreArchivoPlantilla(p: Pick<PreguntaCatalogo, "plantilla">, prefijo = "University_Country"): string | null {
  if (!p.plantilla) return null;
  return p.plantilla.replace(/^University_Country/, prefijo);
}

/** Las preguntas SIN plantilla: se capturan, pero van a la hoja de datos para el sistema en línea, no a un .docx. */
export const sinPlantilla = <T extends { plantilla: string | null }>(preguntas: readonly T[]): T[] => preguntas.filter((p) => p.plantilla === null);

export function slugArchivo(texto: string, max = 60): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}
