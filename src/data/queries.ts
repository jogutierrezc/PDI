/* =============================================================================
   Consultas a Supabase.

   Un único lugar donde se declara qué columnas pide cada pantalla. Las claves
   de caché viven aquí también (`keys`), para que las mutaciones sepan qué
   invalidar sin adivinar cadenas de texto.

   Nota sobre RLS: estas consultas no filtran por estado de publicación. No hace
   falta: la base de datos ya devuelve solo lo que quien pregunta puede ver. El
   público recibe los pilares publicados; la intranet, todos.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type {
  ActionLineWithArea,
  Activity,
  ChangeLogWithTarget,
  GlossaryTerm,
  IndicatorWithLabels,
  Parameter,
  ParameterCategory,
  PdiDocument,
  PdiSummary,
  Pillar,
  PillarOwner,
  PillarProgress,
  PlanningItem,
  Profile,
  Project,
  ReportPeriod,
  StrategicArea,
} from "../types/database";
import { emptySummary } from "./pdi";
import { describeDatabaseError } from "./errors";
import type { DatabaseError } from "./errors";

/** Árbol de claves de caché. Invalidar `keys.pillars()` alcanza a sus hijas. */
export const keys = {
  all: ["pdi"] as const,
  pillars: () => [...keys.all, "pillars"] as const,
  pillar: (slug: string) => [...keys.pillars(), slug] as const,
  progress: () => [...keys.all, "progress"] as const,
  summary: () => [...keys.all, "summary"] as const,
  period: () => [...keys.all, "period"] as const,
  activities: () => [...keys.all, "activities"] as const,
  featured: () => [...keys.activities(), "featured"] as const,
  documents: (scope: string) => [...keys.all, "documents", scope] as const,
  parameters: () => [...keys.all, "parameters"] as const,
  profiles: () => [...keys.all, "profiles"] as const,
  owners: () => [...keys.all, "owners"] as const,
};

/** Convierte el error de PostgREST en algo que se pueda mostrar y accionar. */
function unwrap<T>({ data, error }: { data: T | null; error: DatabaseError | null }): T {
  if (error) throw describeDatabaseError(error);
  return data as T;
}

/* =============================================================================
   Portada y tablero
   ========================================================================== */

export interface PillarWithProgress extends Pillar {
  progress: PillarProgress;
}

/** Pilares con su avance. Son dos peticiones porque el avance es una vista y
 *  PostgREST no puede unir vistas y tablas sin clave foránea; a seis filas por
 *  lado, unirlas aquí sale más barato que crear una vista materializada. */
export function usePillars() {
  return useQuery({
    queryKey: keys.pillars(),
    queryFn: async (): Promise<PillarWithProgress[]> => {
      const [pillars, progress] = await Promise.all([
        supabase.from("pillars").select("*").order("position").then(unwrap<Pillar[]>),
        supabase.from("v_pillar_progress").select("*").then(unwrap<PillarProgress[]>),
      ]);

      const byId = new Map(progress.map((row) => [row.pillar_id, row]));
      return pillars.map((pillar) => ({
        ...pillar,
        progress: byId.get(pillar.id) ?? {
          pillar_id: pillar.id,
          slug: pillar.slug,
          done: 0,
          active: 0,
          pending: 0,
          risk: 0,
          total: 0,
          progress: 0,
        },
      }));
    },
  });
}

export function useSummary() {
  return useQuery({
    queryKey: keys.summary(),
    queryFn: async (): Promise<PdiSummary> => {
      const { data, error } = await supabase.from("v_pdi_summary").select("*").maybeSingle();
      if (error) throw describeDatabaseError(error);
      return data ?? emptySummary;
    },
  });
}

export function useCurrentPeriod() {
  return useQuery({
    queryKey: keys.period(),
    queryFn: async (): Promise<ReportPeriod | null> => {
      const { data, error } = await supabase.from("v_current_period").select("*").maybeSingle();
      if (error) throw describeDatabaseError(error);
      return data as ReportPeriod | null;
    },
    // El corte cambia una vez al mes: no tiene sentido revalidarlo al volver
    // a la pestaña.
    staleTime: 30 * 60 * 1000,
  });
}

export interface FeaturedActivity extends Activity {
  pillar: { slug: string; name: string; accent_slot: number } | null;
}

export function useFeaturedActivities() {
  return useQuery({
    queryKey: keys.featured(),
    queryFn: async (): Promise<FeaturedActivity[]> =>
      supabase
        .from("activities")
        .select("*, pillar:pillars(slug, name, accent_slot)")
        .eq("is_featured", true)
        .order("position")
        .then(unwrap<FeaturedActivity[]>),
  });
}

/* =============================================================================
   Repositorio
   ========================================================================== */

export function usePublicDocuments() {
  return useQuery({
    queryKey: keys.documents("public"),
    queryFn: async (): Promise<PdiDocument[]> =>
      supabase
        .from("documents")
        .select("*")
        .eq("is_public", true)
        .order("position")
        .then(unwrap<PdiDocument[]>),
  });
}

/** Soportes de un pilar (internos y públicos). */
export function usePillarDocuments(pillarId: string | undefined) {
  return useQuery({
    queryKey: keys.documents(pillarId ?? "none"),
    enabled: Boolean(pillarId),
    queryFn: async (): Promise<PdiDocument[]> =>
      supabase
        .from("documents")
        .select("*")
        .eq("pillar_id", pillarId!)
        .order("position")
        .then(unwrap<PdiDocument[]>),
  });
}

/* =============================================================================
   Detalle de un pilar
   ========================================================================== */

export interface AreaWithLines extends StrategicArea {
  action_lines: { id: string; code: string | null; name: string; progress: number; position: number }[];
}

export interface PillarDetail {
  pillar: Pillar;
  progress: PillarProgress;
  areas: AreaWithLines[];
  lines: ActionLineWithArea[];
  indicators: IndicatorWithLabels[];
  projects: Project[];
  activities: Activity[];
  planning: PlanningItem[];
  changes: ChangeLogWithTarget[];
  glossary: GlossaryTerm[];
  documents: PdiDocument[];
}

/**
 * Todo lo que necesita el visor de un pilar. Se piden en paralelo porque son
 * independientes: siete peticiones simultáneas tardan lo que la más lenta, no
 * lo que la suma.
 */
export function usePillarDetail(slug: string | undefined) {
  return useQuery({
    queryKey: keys.pillar(slug ?? "none"),
    enabled: Boolean(slug),
    queryFn: async (): Promise<PillarDetail | null> => {
      const { data: pillar, error } = await supabase
        .from("pillars")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();

      if (error) throw describeDatabaseError(error);
      if (!pillar) return null;

      const id = (pillar as Pillar).id;

      const [progress, areas, lines, indicators, projects, activities, planning, changes, glossary, documents] =
        await Promise.all([
          supabase.from("v_pillar_progress").select("*").eq("pillar_id", id).maybeSingle(),
          supabase
            .from("strategic_areas")
            .select("*, action_lines(id, code, name, progress, position)")
            .eq("pillar_id", id)
            .order("position")
            .then(unwrap<AreaWithLines[]>),
          supabase
            .from("v_action_lines")
            .select("*")
            .eq("pillar_id", id)
            .order("position")
            .then(unwrap<ActionLineWithArea[]>),
          supabase
            .from("v_indicators")
            .select("*")
            .eq("pillar_id", id)
            .order("position")
            .then(unwrap<IndicatorWithLabels[]>),
          supabase.from("projects").select("*").eq("pillar_id", id).order("position").then(unwrap<Project[]>),
          supabase.from("activities").select("*").eq("pillar_id", id).order("position").then(unwrap<Activity[]>),
          supabase.from("planning_items").select("*").eq("pillar_id", id).order("position").then(unwrap<PlanningItem[]>),
          // v_change_log añade el nombre del proyecto, la actividad o el
          // indicador: sin eso, una entrada automática sería un id suelto.
          supabase
            .from("v_change_log")
            .select("*")
            .eq("pillar_id", id)
            .order("changed_on", { ascending: false })
            .order("version", { ascending: false })
            .then(unwrap<ChangeLogWithTarget[]>),
          // Los términos sin pilar son comunes a todo el PDI y salen en el
          // glosario de cualquiera.
          supabase
            .from("glossary_terms")
            .select("*")
            .or(`pillar_id.eq.${id},pillar_id.is.null`)
            .order("position")
            .then(unwrap<GlossaryTerm[]>),
          supabase.from("documents").select("*").eq("pillar_id", id).order("position").then(unwrap<PdiDocument[]>),
        ]);

      return {
        pillar: pillar as Pillar,
        progress: (progress.data as PillarProgress) ?? {
          pillar_id: id,
          slug: (pillar as Pillar).slug,
          done: 0,
          active: 0,
          pending: 0,
          risk: 0,
          total: 0,
          progress: 0,
        },
        areas,
        lines,
        indicators,
        projects,
        activities,
        planning,
        changes,
        glossary,
        documents,
      };
    },
  });
}

/* =============================================================================
   Intranet
   ========================================================================== */

export function useParameters(category?: ParameterCategory) {
  return useQuery({
    queryKey: [...keys.parameters(), category ?? "all"],
    queryFn: async (): Promise<Parameter[]> => {
      let query = supabase.from("parameters").select("*").order("category").order("position");
      if (category) query = query.eq("category", category);
      return query.then(unwrap<Parameter[]>);
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles(),
    queryFn: async (): Promise<Profile[]> =>
      supabase.from("profiles").select("*").order("full_name").then(unwrap<Profile[]>),
  });
}

export function usePillarOwners() {
  return useQuery({
    queryKey: keys.owners(),
    queryFn: async (): Promise<PillarOwner[]> =>
      supabase.from("pillar_owners").select("*").then(unwrap<PillarOwner[]>),
  });
}
