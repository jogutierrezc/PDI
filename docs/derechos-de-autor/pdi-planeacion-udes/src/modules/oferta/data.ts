/* =============================================================================
   Oferta de programas: qué programas ofrece cada facultad y cada sede, y en
   qué nivel.

   Sale de la estructura institucional, sin intermediarios: los programas y
   facultades de `units`, y en qué sedes se ofrece cada programa de
   `program_campuses` (solo las activas). Antes vivía dentro del portal de
   Impacto; se separó cuando ese módulo se retiró (0077).

   Filtros combinables por facultad, campus y nivel de formación. Cada opción
   dice cuántos programas quedarían si se eligiera, contando los otros filtros
   ya puestos (facetas): así se ve de antemano que una facultad no ofrece nada
   en una sede, en vez de descubrirlo con una lista vacía.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { DEGREE_LABEL } from "../admin/institucion/institution-model";
import type { DegreeLevel } from "../admin/institucion/institution-model";

export interface OfferFaculty {
  slug: string;
  code: string;
  name: string;
}

export interface OfferProgram {
  slug: string;
  name: string;
  /** slug de la facultad, o null si el programa no cuelga de una. */
  faculty: string | null;
  degree: DegreeLevel | null;
  /** slugs de las sedes donde se ofrece hoy, en el orden de las sedes. */
  campus: string[];
}

export interface OfferCampus {
  slug: string;
  name: string;
}

export interface OfferData {
  faculties: OfferFaculty[];
  programs: OfferProgram[];
  campuses: OfferCampus[];
  facultyBySlug: Map<string, OfferFaculty>;
}

/* --- Lectura --------------------------------------------------------------------- */

interface UnitRow {
  id: string;
  parent_id: string | null;
  kind: "facultad" | "programa";
  slug: string;
  code: string;
  name: string;
  degree_level: DegreeLevel | null;
  position: number;
}

interface CampusRow {
  id: string;
  slug: string;
  name: string;
  position: number;
}

interface OfferRow {
  program_id: string;
  campus_id: string;
}

/** Arma la oferta con las filas de la base. Aparte de la consulta para poder probarlo. */
export function buildOffer(units: UnitRow[], campuses: CampusRow[], offer: OfferRow[]): OfferData {
  const byOrder = <T extends { position: number; name: string }>(a: T, b: T) => a.position - b.position || a.name.localeCompare(b.name, "es");
  const sites = [...campuses].sort(byOrder);
  const facultyRows = units.filter((u) => u.kind === "facultad").sort(byOrder);
  const facultySlug = new Map(facultyRows.map((f) => [f.id, f.slug]));
  const faculties = facultyRows.map((f) => ({ slug: f.slug, code: f.code, name: f.name }));

  const programs = units
    .filter((u) => u.kind === "programa")
    .sort(byOrder)
    .map((p) => {
      const here = new Set(offer.filter((o) => o.program_id === p.id).map((o) => o.campus_id));
      return {
        slug: p.slug,
        name: p.name,
        faculty: (p.parent_id && facultySlug.get(p.parent_id)) || null,
        degree: p.degree_level,
        campus: sites.filter((c) => here.has(c.id)).map((c) => c.slug),
      };
    });

  // Solo las sedes con algún programa: una sede sin oferta no es una opción.
  const used = new Set(programs.flatMap((p) => p.campus));
  return {
    faculties,
    programs,
    campuses: sites.filter((c) => used.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name })),
    facultyBySlug: new Map(faculties.map((f) => [f.slug, f])),
  };
}

async function fetchOffer(): Promise<OfferData> {
  const [units, campuses, offer] = await Promise.all([
    supabase.from("units").select("id, parent_id, kind, slug, code, name, degree_level, position").in("kind", ["facultad", "programa"]),
    supabase.from("campuses").select("id, slug, name, position"),
    supabase.from("program_campuses").select("program_id, campus_id").eq("active", true),
  ]);
  for (const result of [units, campuses, offer]) if (result.error) throw result.error;
  return buildOffer((units.data ?? []) as UnitRow[], (campuses.data ?? []) as CampusRow[], (offer.data ?? []) as OfferRow[]);
}

export function useOffer() {
  return useQuery({ queryKey: ["oferta"], queryFn: fetchOffer, staleTime: 5 * 60_000 });
}

/* --- Filtros ----------------------------------------------------------------------- */

export interface OfferFilter {
  facultad: string | null;
  campus: string | null;
  nivel: DegreeLevel | null;
}

export const NO_FILTER: OfferFilter = { facultad: null, campus: null, nivel: null };

/** Del orden de la formación: técnico → doctorado. */
export const DEGREE_ORDER = Object.keys(DEGREE_LABEL) as DegreeLevel[];

export function matches(program: OfferProgram, filter: OfferFilter): boolean {
  if (filter.facultad && program.faculty !== filter.facultad) return false;
  if (filter.campus && !program.campus.includes(filter.campus)) return false;
  if (filter.nivel && program.degree !== filter.nivel) return false;
  return true;
}

/** Los programas que cumplen el filtro, por nivel y luego por nombre. */
export function filterPrograms(data: OfferData, filter: OfferFilter): OfferProgram[] {
  const rank = (p: OfferProgram) => (p.degree ? DEGREE_ORDER.indexOf(p.degree) : DEGREE_ORDER.length);
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

export function facets(data: OfferData, filter: OfferFilter): Facets {
  const count = (change: Partial<OfferFilter>) => data.programs.filter((p) => matches(p, { ...filter, ...change })).length;
  return {
    facultades: data.faculties
      .map((f) => ({ slug: f.slug, name: f.name, count: count({ facultad: f.slug }) }))
      // Una facultad sin ningún programa en la estructura no es oferta.
      .filter((f) => data.programs.some((p) => p.faculty === f.slug)),
    campus: data.campuses.map((c) => ({ slug: c.slug, name: c.name, count: count({ campus: c.slug }) })),
    niveles: DEGREE_ORDER.filter((d) => data.programs.some((p) => p.degree === d)).map((d) => ({
      slug: d,
      name: DEGREE_LABEL[d],
      count: count({ nivel: d }),
    })),
  };
}

const plural = (n: number) => `${n} ${n === 1 ? "programa" : "programas"}`;

/** «12 programas · Facultad de Ingenierías · Bucaramanga». */
export function summary(data: OfferData, filter: OfferFilter, total: number): string {
  const parts = [plural(total)];
  if (filter.facultad) parts.push(data.facultyBySlug.get(filter.facultad)?.name ?? filter.facultad);
  if (filter.nivel) parts.push(DEGREE_LABEL[filter.nivel]);
  if (filter.campus) parts.push(data.campuses.find((c) => c.slug === filter.campus)?.name ?? filter.campus);
  if (parts.length === 1) parts.push("toda la universidad");
  return parts.join(" · ");
}

/** Por qué no hay nada, en palabras de quien filtró. */
export function emptyMessage(data: OfferData, filter: OfferFilter): string {
  const campus = filter.campus ? data.campuses.find((c) => c.slug === filter.campus)?.name ?? filter.campus : null;
  const faculty = filter.facultad ? data.facultyBySlug.get(filter.facultad)?.name ?? filter.facultad : null;
  const level = filter.nivel ? DEGREE_LABEL[filter.nivel].toLowerCase() : null;
  if (faculty && campus) return `${faculty} no ofrece programas${level ? ` de nivel ${level}` : ""} en ${campus} todavía.`;
  if (campus) return `Ninguna facultad ofrece programas${level ? ` de nivel ${level}` : ""} en ${campus} todavía.`;
  if (faculty) return `${faculty} no tiene programas${level ? ` de nivel ${level}` : ""} en la estructura todavía.`;
  if (level) return `No hay programas de nivel ${level} en la estructura todavía.`;
  return "Aún no hay programas en la estructura institucional.";
}

/** El filtro que dice la dirección, sin valores que no existen. */
export function readFilter(params: URLSearchParams, data: OfferData): OfferFilter {
  const facultad = params.get("facultad");
  const campus = params.get("campus");
  const nivel = params.get("nivel") as DegreeLevel | null;
  return {
    facultad: facultad && data.facultyBySlug.has(facultad) ? facultad : null,
    campus: campus && data.campuses.some((c) => c.slug === campus) ? campus : null,
    nivel: nivel && DEGREE_ORDER.includes(nivel) ? nivel : null,
  };
}

/** Las sedes de un programa, con su nombre. */
export const campusNames = (data: OfferData, program: OfferProgram) =>
  program.campus.map((slug) => data.campuses.find((c) => c.slug === slug)?.name ?? slug);
