/* =============================================================================
   Informes Institucionales · el catálogo de indicadores que una unidad puede
   conectar a su informe, sin React ni Supabase.

   Antes cada cifra de la plantilla dependía de una fila de `informe_fuentes`
   que nadie llenaba. Ahora la unidad elige cualquier indicador publicado de
   UDES en Cifras; la elección viaja en `informe_cifras.consulta`
   ({indicador, informe, sede?, dim}), que la base mezcla sobre el catálogo
   (informe_vivas_de) y por eso funciona sin tocar `informe_fuentes`.
   ========================================================================== */

import type { CifraRow, DimId } from "./types";

export interface IndicadorOd {
  /** `od_indicators.key`. */
  clave: string;
  nombre: string;
  unidad: string;
  direccion: "sube" | "baja" | "neutro";
  /** `od_reports.slug` y nombre: el informe temático de UDES en Cifras. */
  informe: string;
  informeNombre: string;
}

export interface SedeRef {
  slug: string;
  nombre: string;
}

/**
 * Qué informes de UDES en Cifras suelen alimentar cada dimensión. Solo ordena y
 * preselecciona el filtro del buscador: si el nombre del informe no coincide,
 * el buscador muestra todo y no se pierde nada.
 */
export const INFORMES_SUGERIDOS: Record<DimId, string[]> = {
  acad: ["poblac", "perman", "ensen"],
  prof: ["ensen", "poblac"],
  cal: ["ensen", "oferta", "calidad"],
  inv: ["investig"],
  ext: ["extens", "visib", "internac"],
  fin: ["infra", "finan", "plan"],
};

export const esSugerido = (dim: DimId, informe: string): boolean => INFORMES_SUGERIDOS[dim].some((p) => informe.toLowerCase().includes(p));

/** Una clave de cifra válida para el texto ([[clave]] solo admite a-z, 0-9 y _). Máximo 60 caracteres. */
export function claveAgregada(indicador: string, sede: string): string {
  const base = `ind_${indicador}${sede ? `_${sede}` : ""}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return base.slice(0, 60);
}

/** La consulta que se guarda con la cifra. */
export function consultaDe(i: IndicadorOd, sede: string, dim: DimId): Record<string, unknown> {
  return { indicador: i.clave, informe: i.informe, ...(sede ? { sede } : {}), ...(i.direccion === "baja" ? { baja: true } : {}), dim };
}

/** La dimensión a la que se agregó una cifra, si la trae. */
export function dimDeConsulta(consulta: CifraRow["consulta"]): DimId | null {
  const d = consulta?.dim;
  return d === "acad" || d === "prof" || d === "cal" || d === "inv" || d === "ext" || d === "fin" ? d : null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Indicadores que contienen todas las palabras del texto (en nombre, informe o clave), los sugeridos primero. */
export function filtrarCatalogo(lista: IndicadorOd[], texto: string, informe: string, dim: DimId): IndicadorOd[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  return lista
    .filter((i) => (!informe || i.informe === informe) && palabras.every((p) => sinTildes(`${i.nombre} ${i.informeNombre} ${i.clave}`).includes(p)))
    .sort((a, b) => Number(esSugerido(dim, b.informe)) - Number(esSugerido(dim, a.informe)) || a.informeNombre.localeCompare(b.informeNombre, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

/** Los informes del catálogo, sin repetir, para el filtro. */
export function informesDe(lista: IndicadorOd[]): { slug: string; nombre: string }[] {
  const vistos = new Map<string, string>();
  for (const i of lista) if (!vistos.has(i.informe)) vistos.set(i.informe, i.informeNombre);
  return [...vistos].map(([slug, nombre]) => ({ slug, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Formatos de la unidad que usa `formatoCifra`: «%» pegado con espacio, lo demás se deja. */
export const unidadDe = (u: string): string => (u.trim() === "%" ? " %" : "");
