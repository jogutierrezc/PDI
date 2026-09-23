/* =============================================================================
   Oferta de programas del portal: qué programas ofrece cada facultad y cada
   sede, y en qué nivel.

   Filtros combinables por facultad, campus y nivel de formación. Cada opción
   dice cuántos programas quedarían si se eligiera, contando los otros
   filtros ya puestos (facetas): así se ve de antemano que una facultad no
   ofrece nada en una sede, en vez de descubrirlo con una lista vacía.

   La oferta es la de la base (imp_portal_structure, 0072): las sedes activas
   de cada programa. Aquí no hay cifras de indicadores; solo quién ofrece qué
   y dónde.
   ========================================================================== */

import { DEGREES } from "./catalog";
import type { PortalData, PortalProgram } from "./lens";
import type { Degree } from "./types";

export interface OfferFilter {
  facultad: string | null;
  campus: string | null;
  nivel: Degree | null;
}

export const NO_FILTER: OfferFilter = { facultad: null, campus: null, nivel: null };

/** Del orden de la formación: técnico → doctorado. */
export const DEGREE_ORDER = Object.keys(DEGREES) as Degree[];

export function matches(program: PortalProgram, filter: OfferFilter): boolean {
  if (filter.facultad && program.faculty !== filter.facultad) return false;
  if (filter.campus && !program.campus.includes(filter.campus)) return false;
  if (filter.nivel && program.degree !== filter.nivel) return false;
  return true;
}

/** Los programas que cumplen el filtro, por nivel y luego por nombre. */
export function filterPrograms(data: PortalData, filter: OfferFilter): PortalProgram[] {
  const rank = (p: PortalProgram) => (p.degree ? DEGREE_ORDER.indexOf(p.degree) : DEGREE_ORDER.length);
  return data.programs.filter((p) => matches(p, filter)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "es"));
}

export interface FacetOption {
  slug: string;
  name: string;
  /** Programas si se eligiera esta opción, con los demás filtros puestos. */
  count: number;
}

export interface Facets {
  facultades: FacetOption[];
  campus: FacetOption[];
  niveles: FacetOption[];
}

export function facets(data: PortalData, filter: OfferFilter): Facets {
  const count = (change: Partial<OfferFilter>) => data.programs.filter((p) => matches(p, { ...filter, ...change })).length;
  return {
    facultades: data.faculties
      .map((f) => ({ slug: f.slug, name: f.name, count: count({ facultad: f.slug }) }))
      // Una facultad sin ningún programa en la estructura no es oferta.
      .filter((f) => data.programs.some((p) => p.faculty === f.slug)),
    campus: data.campuses
      .map((c) => ({ slug: c.slug, name: c.name, count: count({ campus: c.slug }) }))
      .filter((c) => data.programs.some((p) => p.campus.includes(c.slug))),
    niveles: DEGREE_ORDER.filter((d) => data.programs.some((p) => p.degree === d)).map((d) => ({
      slug: d,
      name: DEGREES[d],
      count: count({ nivel: d }),
    })),
  };
}

const plural = (n: number) => `${n} ${n === 1 ? "programa" : "programas"}`;

/** «12 programas · Facultad de Ingenierías · Bucaramanga». */
export function summary(data: PortalData, filter: OfferFilter, total: number): string {
  const parts = [plural(total)];
  if (filter.facultad) parts.push(data.facultyBySlug.get(filter.facultad)?.name ?? filter.facultad);
  if (filter.nivel) parts.push(DEGREES[filter.nivel]);
  if (filter.campus) parts.push(data.campuses.find((c) => c.slug === filter.campus)?.name ?? filter.campus);
  if (parts.length === 1) parts.push("toda la universidad");
  return parts.join(" · ");
}

/** Por qué no hay nada, en palabras de quien filtró. */
export function emptyMessage(data: PortalData, filter: OfferFilter): string {
  const campus = filter.campus ? data.campuses.find((c) => c.slug === filter.campus)?.name ?? filter.campus : null;
  const faculty = filter.facultad ? data.facultyBySlug.get(filter.facultad)?.name ?? filter.facultad : null;
  const level = filter.nivel ? DEGREES[filter.nivel].toLowerCase() : null;
  if (faculty && campus) return `${faculty} no ofrece programas${level ? ` de nivel ${level}` : ""} en ${campus} todavía.`;
  if (campus) return `Ninguna facultad ofrece programas${level ? ` de nivel ${level}` : ""} en ${campus} todavía.`;
  if (faculty) return `${faculty} no tiene programas${level ? ` de nivel ${level}` : ""} en la estructura todavía.`;
  if (level) return `No hay programas de nivel ${level} en la estructura todavía.`;
  return "Aún no hay programas en la estructura de Impacto.";
}

/** El filtro que dice la dirección, sin valores que no existen. */
export function readFilter(params: URLSearchParams, data: PortalData): OfferFilter {
  const facultad = params.get("facultad");
  const campus = params.get("campus");
  const nivel = params.get("nivel") as Degree | null;
  return {
    facultad: facultad && data.facultyBySlug.has(facultad) ? facultad : null,
    campus: campus && data.campuses.some((c) => c.slug === campus) ? campus : null,
    nivel: nivel && DEGREE_ORDER.includes(nivel) ? nivel : null,
  };
}

/** Las sedes de un programa, con su nombre. */
export const campusNames = (data: PortalData, program: PortalProgram) =>
  program.campus.map((slug) => data.campuses.find((c) => c.slug === slug)?.name ?? slug);
