/* =============================================================================
   Indicadores de Impacto · lectura y escritura en Supabase.

   El patrón de Mis Tableros: una consulta por tabla, sin incrustaciones, y una
   envoltura de escritura que invalida todo lo de Impacto al terminar. Si las
   tablas aún no existen (0078 sin aplicar), las lecturas vuelven vacías y la
   pantalla lo dice, en vez de una pila de errores.

   RLS hace el recorte: lo que llega es exactamente lo que quien pregunta puede
   ver. La pantalla no filtra por permisos, solo por lo que se eligió mirar.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { describeDatabaseError } from "../../data/errors";
import type { DatabaseError } from "../../data/errors";
import { suggest, type Criterion } from "./motor";
import { mergeWeights, type PiloWeights } from "./pilo/recommend";
import { FUNCTION_LABEL } from "./model";
import type {
  Adoption,
  Alignment,
  CriterionRow,
  Dimension,
  ImpactUnit,
  Indicator,
  IndicatorRef,
  Pillar,
  SubstantiveFunction,
  Value,
} from "./model";

export const impactKeys = {
  all: ["impacto"] as const,
  base: ["impacto", "base"] as const,
  catalog: ["impacto", "catalogo"] as const,
  values: (filter: string) => ["impacto", "cifras", filter] as const,
  adoptions: (filter: string) => ["impacto", "adopciones", filter] as const,
  criteria: ["impacto", "criterios"] as const,
};

type Result<T> = { data: T | null; error: DatabaseError | null };

const MISSING = new Set(["PGRST205", "42P01", "42883"]);

/** true si la última lectura encontró las tablas sin crear. */
let schemaMissing = false;

function rows<T>({ data, error }: Result<T[]>): T[] {
  if (error) {
    if (MISSING.has(error.code ?? "")) {
      schemaMissing = true;
      return [];
    }
    throw describeDatabaseError(error);
  }
  return data ?? [];
}

function one<T>({ data, error }: Result<T>): T {
  if (error) throw describeDatabaseError(error);
  return data as T;
}

const read = <T>(query: PromiseLike<unknown>) => Promise.resolve(query).then((r) => rows<T>(r as Result<T[]>));
const run = async <T>(query: PromiseLike<unknown>) => one<T>((await query) as Result<T>);

function useImpactMutation<TInput, TOutput = unknown>(fn: (input: TInput) => Promise<TOutput>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: impactKeys.all });
    },
  });
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/* --- Lo de base: estructura, funciones, pertenencias, pilares, dimensiones ------- */

export interface Membership {
  unitId: string;
  role: "visor" | "editor" | "jefe";
  campusId: string | null;
  /** La da el rol de acceso (0154), no una fila de unit_members. */
  viaRole?: boolean;
}

interface MembershipRow {
  unit_id: string;
  role: Membership["role"];
  campus_id: string | null;
  via_role: boolean;
}

/**
 * Las pertenencias efectivas: las propias y las que da el rol de acceso
 * (imp_my_memberships). Es lo mismo que la base usa para decidir, así que
 * pantalla y permisos no se separan. Sin la migración 0154 la función no
 * existe y quedan las de unit_members, que es lo que había.
 */
async function myMemberships(profileId: string): Promise<MembershipRow[]> {
  const effective = await supabase.rpc("imp_my_memberships");
  if (!effective.error) return (effective.data ?? []) as MembershipRow[];
  const own = await read<{ unit_id: string; role: Membership["role"]; campus_id: string | null }>(
    supabase.from("unit_members").select("unit_id,role,campus_id").eq("profile_id", profileId),
  );
  return own.map((m) => ({ ...m, via_role: false }));
}

export interface ImpactBase {
  units: ImpactUnit[];
  campuses: { id: string; name: string; slug: string }[];
  offer: { programId: string; campusId: string }[];
  unitFunctions: { unitId: string; fn: SubstantiveFunction }[];
  memberships: Membership[];
  pillars: Pillar[];
  dimensions: Dimension[];
  /** La migración 0078 aún no está en la base. */
  missing: boolean;
}

export function useImpactBase(profileId: string | undefined) {
  return useQuery({
    queryKey: [...impactKeys.base, profileId ?? "anon"],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ImpactBase> => {
      schemaMissing = false;
      const [units, campuses, offer, unitFunctions, memberships, pillars, dimensions] = await Promise.all([
        read<{ id: string; parent_id: string | null; kind: ImpactUnit["kind"]; code: string; name: string }>(
          supabase.from("units").select("id,parent_id,kind,code,name").order("position"),
        ),
        read<{ id: string; name: string; slug: string }>(supabase.from("campuses").select("id,name,slug").order("name")),
        read<{ program_id: string; campus_id: string; active: boolean | null }>(
          supabase.from("program_campuses").select("program_id,campus_id,active"),
        ),
        read<{ unit_id: string; fn: SubstantiveFunction }>(supabase.from("imp_unit_functions").select("unit_id,fn")),
        myMemberships(profileId!),
        read<{ id: string; position: number; numeral: string; name: string }>(
          supabase.from("pillars").select("id,position,numeral,name").order("position"),
        ),
        read<{ id: string; fn: SubstantiveFunction; name: string; position: number }>(
          supabase.from("imp_dimensions").select("id,fn,name,position").order("position"),
        ),
      ]);
      return {
        units: units.map((u) => ({ id: u.id, parentId: u.parent_id, kind: u.kind, code: u.code, name: u.name })),
        campuses,
        offer: offer.filter((o) => o.active !== false).map((o) => ({ programId: o.program_id, campusId: o.campus_id })),
        unitFunctions: unitFunctions.map((f) => ({ unitId: f.unit_id, fn: f.fn })),
        memberships: memberships.map((m) => ({ unitId: m.unit_id, role: m.role, campusId: m.campus_id, viaRole: m.via_role })),
        pillars,
        dimensions,
        missing: schemaMissing,
      };
    },
  });
}

/* --- El catálogo ---------------------------------------------------------------- */

interface IndicatorRow {
  id: string;
  code: string;
  fn: SubstantiveFunction;
  stage: Indicator["stage"];
  suggested: boolean;
  dimension_id: string | null;
  owner_unit_id: string;
  name: string;
  description: string;
  unit_label: string;
  measure: Indicator["measure"];
  numerator: string;
  denominator: string;
  direction: Indicator["direction"];
  baseline_year: number;
  baseline_text: string;
  baseline_num: number | string | null;
  target_2026: string;
  target_2026_num: number | string | null;
  target_2028: string;
  target_2028_num: number | string | null;
  source: string;
  responsible: string;
  projects_text: string;
  cesu: string[] | null;
  sheet: Record<string, unknown> | null;
  program_reports: boolean;
  status: Indicator["status"];
  position: number;
  updated_at: string;
  program_id?: string | null;
  campus_id?: string | null;
  parent_id?: string | null;
  mandatory?: boolean;
  legacy_id?: string | null;
}

const toIndicator = (r: IndicatorRow): Indicator => ({
  id: r.id,
  code: r.code,
  fn: r.fn,
  stage: r.stage,
  suggested: r.suggested,
  dimensionId: r.dimension_id,
  ownerUnitId: r.owner_unit_id,
  name: r.name,
  description: r.description,
  unitLabel: r.unit_label,
  measure: r.measure,
  numerator: r.numerator,
  denominator: r.denominator,
  direction: r.direction,
  baselineYear: r.baseline_year,
  baselineText: r.baseline_text,
  baselineNum: num(r.baseline_num),
  target2026: r.target_2026,
  target2026Num: num(r.target_2026_num),
  target2028: r.target_2028,
  target2028Num: num(r.target_2028_num),
  source: r.source,
  responsible: r.responsible,
  projectsText: r.projects_text,
  cesu: r.cesu ?? [],
  sheet: r.sheet ?? {},
  programReports: r.program_reports,
  programId: r.program_id ?? null,
  campusId: r.campus_id ?? null,
  parentId: r.parent_id ?? null,
  mandatory: Boolean(r.mandatory),
  legacyId: r.legacy_id ?? null,
  status: r.status,
  position: r.position,
  updatedAt: r.updated_at,
});

interface AlignmentRow {
  id: string;
  indicator_id: string;
  target: "pilar" | "ods";
  pillar_id: string | null;
  sdg: number | null;
  origin: Alignment["origin"];
  confirmed: boolean;
  score: number | string | null;
  matched_terms: string[] | null;
}

const toAlignment = (r: AlignmentRow): Alignment => ({
  id: r.id,
  indicatorId: r.indicator_id,
  target: r.target,
  pillarId: r.pillar_id,
  sdg: r.sdg,
  origin: r.origin,
  confirmed: r.confirmed,
  score: num(r.score),
  matchedTerms: r.matched_terms ?? [],
});

export interface Catalog {
  /** Las fichas institucionales. */
  indicators: Indicator[];
  /** Los indicadores propios de los programas que quien pregunta puede ver (0084). */
  programIndicators: Indicator[];
  refs: IndicatorRef[];
  alignments: Alignment[];
}

export function useCatalog(enabled = true) {
  return useQuery({
    queryKey: impactKeys.catalog,
    enabled,
    queryFn: async (): Promise<Catalog> => {
      const [indicators, refs, alignments] = await Promise.all([
        read<IndicatorRow>(supabase.from("imp_indicators").select("*").order("position")),
        read<{ indicator_id: string; dimension_id: string; stage: IndicatorRef["stage"]; note: string }>(
          supabase.from("imp_indicator_refs").select("*"),
        ),
        read<AlignmentRow>(supabase.from("imp_alignments").select("*")),
      ]);
      const all = indicators.map(toIndicator);
      return {
        indicators: all.filter((i) => !i.programId),
        programIndicators: all.filter((i) => i.programId),
        refs: refs.map((r) => ({ indicatorId: r.indicator_id, dimensionId: r.dimension_id, stage: r.stage, note: r.note })),
        alignments: alignments.map(toAlignment),
      };
    },
  });
}

/** Lo que se puede escribir de una ficha, en los nombres de la base. */
export type IndicatorPayload = Omit<IndicatorRow, "id" | "updated_at" | "cesu" | "sheet"> & {
  id?: string;
  cesu?: string[];
  sheet?: Record<string, unknown>;
};

export function toPayload(i: Indicator): IndicatorPayload {
  return {
    id: i.id,
    code: i.code,
    fn: i.fn,
    stage: i.stage,
    suggested: i.suggested,
    dimension_id: i.dimensionId,
    owner_unit_id: i.ownerUnitId,
    name: i.name,
    description: i.description,
    unit_label: i.unitLabel,
    measure: i.measure,
    numerator: i.numerator,
    denominator: i.denominator,
    direction: i.direction,
    baseline_year: i.baselineYear,
    baseline_text: i.baselineText,
    baseline_num: i.baselineNum,
    target_2026: i.target2026,
    target_2026_num: i.target2026Num,
    target_2028: i.target2028,
    target_2028_num: i.target2028Num,
    source: i.source,
    responsible: i.responsible,
    projects_text: i.projectsText,
    cesu: i.cesu,
    sheet: i.sheet,
    program_reports: i.programReports,
    status: i.status,
    position: i.position,
    // Solo los indicadores de programa llevan estos campos: así una ficha se
    // guarda igual aunque la 0084 aún no esté aplicada.
    ...(i.programId ? { program_id: i.programId, campus_id: i.campusId, parent_id: i.parentId } : {}),
  };
}

export function useSaveIndicator() {
  return useImpactMutation(async (payload: IndicatorPayload) => {
    const { id, ...fields } = payload;
    if (id) return run<{ id: string }>(supabase.from("imp_indicators").update(fields).eq("id", id).select("id").single());
    return run<{ id: string }>(supabase.from("imp_indicators").insert(fields).select("id").single());
  });
}

/* --- Las cifras ------------------------------------------------------------------ */

interface ValueRow {
  id: string;
  indicator_id: string;
  year: number;
  program_id: string | null;
  campus_id: string | null;
  value_num: number | string | null;
  numerator: number | string | null;
  denominator: number | string | null;
  value_text: string;
  not_applicable: boolean;
  evidence_url: string;
  note: string;
  updated_at: string;
}

const toValue = (r: ValueRow): Value => ({
  id: r.id,
  indicatorId: r.indicator_id,
  year: r.year,
  programId: r.program_id,
  campusId: r.campus_id,
  valueNum: num(r.value_num),
  numerator: num(r.numerator),
  denominator: num(r.denominator),
  valueText: r.value_text,
  notApplicable: r.not_applicable,
  evidenceUrl: r.evidence_url,
  note: r.note,
  updatedAt: r.updated_at,
});

/**
 * Las cifras que quien pregunta puede leer, de los indicadores dados. Con un
 * sitio, solo las globales y las de ese programa en esa sede; sin sitio,
 * todas (la vicerrectoría las ve por programa).
 */
export function useValues(indicatorIds: string[], site?: { programId: string; campusId: string } | null) {
  const filter = `${site ? `${site.programId}|${site.campusId}` : "todo"}:${indicatorIds.length}`;
  return useQuery({
    queryKey: impactKeys.values(filter),
    enabled: indicatorIds.length > 0,
    queryFn: async () => {
      let query = supabase.from("imp_values").select("*").in("indicator_id", indicatorIds);
      if (site) query = query.or(`program_id.is.null,and(program_id.eq.${site.programId},campus_id.eq.${site.campusId})`);
      return (await read<ValueRow>(query)).map(toValue);
    },
  });
}

/** Un cambio de celda. Sin `id`, se crea; con todo vacío, se borra. */
export interface ValueChange {
  id?: string;
  indicatorId: string;
  year: number;
  programId: string | null;
  campusId: string | null;
  valueNum?: number | null;
  valueText?: string;
  numerator?: number | null;
  denominator?: number | null;
  notApplicable?: boolean;
  evidenceUrl?: string;
  note?: string;
}

const isEmptyChange = (c: ValueChange) =>
  (c.valueNum ?? null) === null &&
  !c.valueText &&
  (c.numerator ?? null) === null &&
  (c.denominator ?? null) === null &&
  !c.notApplicable &&
  !c.evidenceUrl &&
  !c.note;

/**
 * Guarda un lote de celdas. El índice único de `imp_values` está sobre
 * expresiones (el alcance global no tiene programa), así que no sirve el
 * `upsert` de PostgREST: cada celda se actualiza por su id o se crea.
 */
export function useSaveValues() {
  return useImpactMutation(async (changes: ValueChange[]) => {
    for (const c of changes) {
      const fields = {
        value_num: c.valueNum ?? null,
        value_text: c.valueText ?? "",
        numerator: c.numerator ?? null,
        denominator: c.denominator ?? null,
        not_applicable: c.notApplicable ?? false,
        evidence_url: c.evidenceUrl ?? "",
        note: c.note ?? "",
      };
      if (c.id && isEmptyChange(c)) {
        await run(supabase.from("imp_values").delete().eq("id", c.id).select("id").maybeSingle());
      } else if (c.id) {
        await run(supabase.from("imp_values").update(fields).eq("id", c.id).select("id").single());
      } else if (!isEmptyChange(c)) {
        await run(
          supabase
            .from("imp_values")
            .insert({ indicator_id: c.indicatorId, year: c.year, program_id: c.programId, campus_id: c.campusId, ...fields })
            .select("id")
            .single(),
        );
      }
    }
  });
}

/* --- Lo que adopta cada programa en cada sede -------------------------------------- */

interface AdoptionRow {
  id: string;
  indicator_id: string;
  program_id: string;
  campus_id: string;
  baseline_year: number;
  baseline_text: string;
  baseline_num: number | string | null;
  target_2026: string;
  target_2026_num: number | string | null;
  target_2028: string;
  target_2028_num: number | string | null;
  active: boolean;
  updated_at: string;
}

const toAdoption = (r: AdoptionRow): Adoption => ({
  id: r.id,
  indicatorId: r.indicator_id,
  programId: r.program_id,
  campusId: r.campus_id,
  baselineYear: r.baseline_year,
  baselineText: r.baseline_text,
  baselineNum: num(r.baseline_num),
  target2026: r.target_2026,
  target2026Num: num(r.target_2026_num),
  target2028: r.target_2028,
  target2028Num: num(r.target_2028_num),
  active: r.active,
  updatedAt: r.updated_at,
});

/** Las adopciones de un sitio, o todas las que se pueden leer. */
export function useAdoptions(site?: { programId: string; campusId: string } | null, enabled = true) {
  return useQuery({
    queryKey: impactKeys.adoptions(site ? `${site.programId}|${site.campusId}` : "todas"),
    enabled,
    queryFn: async () => {
      let query = supabase.from("imp_adoptions").select("*");
      if (site) query = query.eq("program_id", site.programId).eq("campus_id", site.campusId);
      return (await read<AdoptionRow>(query)).map(toAdoption);
    },
  });
}

/** Adoptar o dejar de seguir. Dejar de seguir desactiva: lo reportado se queda. */
export function useToggleAdoption() {
  return useImpactMutation(
    async ({ indicatorId, programId, campusId, active }: { indicatorId: string; programId: string; campusId: string; active: boolean }) => {
      await run(
        supabase
          .from("imp_adoptions")
          .upsert(
            { indicator_id: indicatorId, program_id: programId, campus_id: campusId, active },
            { onConflict: "indicator_id,program_id,campus_id" },
          )
          .select("id")
          .single(),
      );
    },
  );
}

/** Prefijo de la «adopción» con la que un indicador propio del programa entra en la captura. */
export const OWN_PREFIX = "propio:";

/** La adopción que usa la captura para un indicador propio: sus metas son las del indicador. */
export const ownAdoption = (i: Indicator): Adoption => ({
  id: `${OWN_PREFIX}${i.id}`,
  indicatorId: i.id,
  programId: i.programId ?? "",
  campusId: i.campusId ?? "",
  active: i.status !== "retirado",
  baselineYear: i.baselineYear,
  baselineText: i.baselineText,
  baselineNum: i.baselineNum,
  target2026: i.target2026,
  target2026Num: i.target2026Num,
  target2028: i.target2028,
  target2028Num: i.target2028Num,
  updatedAt: i.updatedAt,
});

/** Línea base y metas de una adopción; si es un indicador propio, van al indicador. */
export function useSaveAdoptionTargets() {
  return useImpactMutation(async ({ id, ...t }: { id: string } & Partial<Record<keyof AdoptionRow, unknown>>) => {
    if (id.startsWith(OWN_PREFIX)) {
      await run(supabase.from("imp_indicators").update(t).eq("id", id.slice(OWN_PREFIX.length)).select("id").single());
      return;
    }
    await run(supabase.from("imp_adoptions").update(t).eq("id", id).select("id").single());
  });
}

/* --- Pilares y ODS ----------------------------------------------------------------- */

export function useCriteria() {
  return useQuery({
    queryKey: impactKeys.criteria,
    queryFn: async () =>
      (
        await read<{ id: string; target: "pilar" | "ods"; pillar_id: string | null; sdg: number | null; term: string; weight: number | string }>(
          supabase.from("imp_criteria").select("id,target,pillar_id,sdg,term,weight").order("term"),
        )
      ).map<CriterionRow>((c) => ({ id: c.id, target: c.target, pillarId: c.pillar_id, sdg: c.sdg, term: c.term, weight: Number(c.weight) })),
  });
}

/** Los criterios de la base, como los lee el motor: el pilar por su id, el ODS por su número. */
export const toMotorCriteria = (rows: CriterionRow[]): Criterion[] =>
  rows.map((c) => ({ target: c.target, key: c.target === "pilar" ? c.pillarId! : String(c.sdg), term: c.term, weight: c.weight }));

export function useSaveCriterion() {
  return useImpactMutation(async (c: Omit<CriterionRow, "id"> & { id?: string }) => {
    const fields = { target: c.target, pillar_id: c.target === "pilar" ? c.pillarId : null, sdg: c.target === "ods" ? c.sdg : null, term: c.term.trim(), weight: c.weight };
    if (c.id) await run(supabase.from("imp_criteria").update(fields).eq("id", c.id).select("id").single());
    else await run(supabase.from("imp_criteria").insert(fields).select("id").single());
  });
}

export function useDeleteCriterion() {
  return useImpactMutation(async (id: string) => {
    await run(supabase.from("imp_criteria").delete().eq("id", id).select("id").maybeSingle());
  });
}

/** Reemplaza el diccionario entero con el que se cargó desde Excel, en una sola transacción (0081). */
export function useReplaceCriteria() {
  return useImpactMutation(async (next: Omit<CriterionRow, "id">[]) => {
    const payload = next.map((c) => ({ target: c.target, pillar_id: c.pillarId, sdg: c.sdg, term: c.term.trim(), weight: c.weight }));
    return run<number>(supabase.rpc("imp_replace_criteria", { p_criteria: payload }));
  });
}

/** Confirmar, descartar o poner a mano un cruce con un pilar o un ODS. */
export function useSetAlignment() {
  return useImpactMutation(
    async (
      op:
        | { kind: "confirm"; id: string }
        | { kind: "discard"; id: string }
        | { kind: "add"; indicatorId: string; target: "pilar" | "ods"; pillarId?: string; sdg?: number },
    ) => {
      if (op.kind === "confirm") await run(supabase.from("imp_alignments").update({ confirmed: true }).eq("id", op.id).select("id").single());
      else if (op.kind === "discard") await run(supabase.from("imp_alignments").delete().eq("id", op.id).select("id").maybeSingle());
      else
        await run(
          supabase
            .from("imp_alignments")
            .insert({ indicator_id: op.indicatorId, target: op.target, pillar_id: op.pillarId ?? null, sdg: op.sdg ?? null, origin: "manual", confirmed: true })
            .select("id")
            .single(),
        );
    },
  );
}

/**
 * Corre el motor sobre unas fichas y deja sus sugerencias: borra las
 * sugerencias viejas sin confirmar y agrega las nuevas que no estén ya. Lo
 * confirmado, lo de la matriz y lo puesto a mano no se toca.
 */
export function useRunMotor() {
  return useImpactMutation(
    async ({
      indicators,
      alignments,
      criteria,
      dimensions,
    }: {
      indicators: Indicator[];
      alignments: Alignment[];
      criteria: Criterion[];
      dimensions: Dimension[];
    }) => {
      let added = 0;
      for (const indicator of indicators) {
        const stale = alignments.filter((a) => a.indicatorId === indicator.id && a.origin === "motor" && !a.confirmed);
        if (stale.length) {
          await run(supabase.from("imp_alignments").delete().in("id", stale.map((a) => a.id)).select("id"));
        }
        const kept = alignments.filter((a) => a.indicatorId === indicator.id && !(a.origin === "motor" && !a.confirmed));
        const suggestions = suggest(
          {
            name: indicator.name,
            description: indicator.description,
            dimension: dimensions.find((d) => d.id === indicator.dimensionId)?.name ?? null,
            objective: typeof indicator.sheet.objetivo === "string" ? indicator.sheet.objetivo : undefined,
            functionLabel: FUNCTION_LABEL[indicator.fn],
          },
          criteria,
        ).filter((s) => !kept.some((a) => (s.target === "pilar" ? a.pillarId === s.key : String(a.sdg) === s.key)));
        if (!suggestions.length) continue;
        await run(
          supabase
            .from("imp_alignments")
            .insert(
              suggestions.map((s) => ({
                indicator_id: indicator.id,
                target: s.target,
                pillar_id: s.target === "pilar" ? s.key : null,
                sdg: s.target === "ods" ? Number(s.key) : null,
                origin: "motor",
                confirmed: false,
                score: s.score,
                matched_terms: s.terms,
              })),
            )
            .select("id"),
        );
        added += suggestions.length;
      }
      return added;
    },
  );
}

/* --- Varias adopciones de una vez (Mr. Pilo Bot) ------------------------------------ */

/** Adopta varias fichas para un programa en una sede. No desactiva nada. */
export function useAdoptMany() {
  return useImpactMutation(async ({ indicatorIds, programId, campusId }: { indicatorIds: string[]; programId: string; campusId: string }) => {
    if (!indicatorIds.length) return 0;
    await run(
      supabase
        .from("imp_adoptions")
        .upsert(
          indicatorIds.map((id) => ({ indicator_id: id, program_id: programId, campus_id: campusId, active: true })),
          { onConflict: "indicator_id,program_id,campus_id" },
        )
        .select("id"),
    );
    return indicatorIds.length;
  });
}

export interface PeerRow {
  indicatorId: string;
  faculty: number;
  totalFaculty: number;
  all: number;
  totalAll: number;
}

/** Cuántos programas parecidos siguen cada ficha (0083). Sin la migración, vacío. */
export function usePeerAdoptions(site: { programId: string; campusId: string } | null, enabled = true) {
  return useQuery({
    queryKey: ["impacto", "parecidos", site ? `${site.programId}|${site.campusId}` : "ninguno"],
    enabled: Boolean(site) && enabled,
    queryFn: async (): Promise<PeerRow[]> => {
      const { data, error } = await supabase.rpc("imp_peer_adoptions", { p_program: site!.programId, p_campus: site!.campusId });
      if (error) {
        if (MISSING.has(error.code ?? "") || error.code === "PGRST202") return [];
        throw describeDatabaseError(error as DatabaseError);
      }
      return ((data ?? []) as { indicator_id: string; peers_faculty: number; total_faculty: number; peers_all: number; total_all: number }[]).map(
        (r) => ({ indicatorId: r.indicator_id, faculty: r.peers_faculty, totalFaculty: r.total_faculty, all: r.peers_all, totalAll: r.total_all }),
      );
    },
  });
}

/* --- Sincronización con la hoja anterior (solo administración) --------------------- */

/** Lee una tabla entera en páginas de 1000 (el tope de PostgREST). */
async function readAll<T>(table: string, columns = "*"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await read<T>(supabase.from(table).select(columns).range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export interface SyncRun {
  id: string;
  createdAt: string;
  runBy: string | null;
  summary: Record<string, unknown>;
}

export interface SyncState {
  sourceUrl: string;
  runs: SyncRun[];
  legacyMap: { code: string; programId: string; campusId: string }[];
  /** La 0083 aún no está en la base. */
  missing: boolean;
}

export function useSyncState(enabled: boolean) {
  return useQuery({
    queryKey: ["impacto", "sincronizacion"],
    enabled,
    queryFn: async (): Promise<SyncState> => {
      schemaMissing = false;
      const [settings, runs, legacy] = await Promise.all([
        read<{ source_url: string }>(supabase.from("imp_sync_settings").select("source_url").eq("id", 1)),
        read<{ id: string; created_at: string; run_by: string | null; summary: Record<string, unknown> }>(
          supabase.from("imp_sync_runs").select("id,created_at,run_by,summary").order("created_at", { ascending: false }).limit(12),
        ),
        read<{ code: string; program_id: string; campus_id: string }>(supabase.from("imp_legacy_programs").select("code,program_id,campus_id")),
      ]);
      return {
        sourceUrl: settings[0]?.source_url ?? "",
        runs: runs.map((r) => ({ id: r.id, createdAt: r.created_at, runBy: r.run_by, summary: r.summary ?? {} })),
        legacyMap: legacy.map((l) => ({ code: l.code, programId: l.program_id, campusId: l.campus_id })),
        missing: schemaMissing,
      };
    },
  });
}

/** Todo lo adoptado y todas las cifras, para comparar con la hoja. */
export async function loadSyncSnapshot() {
  const [adoptions, values] = await Promise.all([readAll<AdoptionRow>("imp_adoptions"), readAll<ValueRow>("imp_values")]);
  return { adoptions: adoptions.map(toAdoption), values: values.map(toValue) };
}

export function useSaveSyncUrl() {
  return useImpactMutation(async (url: string) => {
    await run(
      supabase.from("imp_sync_settings").upsert({ id: 1, source_url: url.trim() }, { onConflict: "id" }).select("id").single(),
    );
  });
}

export function useApplySync() {
  return useImpactMutation(async (batch: object) =>
    run<Record<string, number>>(supabase.rpc("imp_sync_apply", { p_batch: batch })),
  );
}

/* --- Indicadores propios de los programas (0084) ------------------------------------ */

/** Retirar un indicador del programa: deja de verse; lo reportado se conserva. */
export function useRetireProgramIndicator() {
  return useImpactMutation(async ({ id, retired }: { id: string; retired: boolean }) => {
    await run(supabase.from("imp_indicators").update({ status: retired ? "retirado" : "publicado" }).eq("id", id).select("id").single());
  });
}

/** La vicerrectoría (o el programa) relaciona un indicador de programa con una ficha. */
export function useLinkProgramIndicator() {
  return useImpactMutation(async ({ id, parentId }: { id: string; parentId: string | null }) => {
    const { error } = await supabase.rpc("imp_link_program_indicator", { p_indicator: id, p_parent: parentId });
    if (error) throw describeDatabaseError(error as DatabaseError);
  });
}

/* --- El importador de las vicerrectorías (0084) ------------------------------------- */

export interface ImportRow {
  indicator_code: string;
  year: number;
  program_id: string | null;
  campus_id: string | null;
  value_num: number | null;
  numerator: number | null;
  denominator: number | null;
  value_text: string;
  not_applicable: boolean;
  note: string;
  evidence_url: string;
}

export function useImportValues() {
  return useImpactMutation(async (rows: ImportRow[]) =>
    run<{ creadas: number; actualizadas: number }>(supabase.rpc("imp_import_values", { p_rows: rows })),
  );
}

/* --- Mr. Pilo para las vicerrectorías ---------------------------------------------- */

/** Crea una ficha en borrador a partir de lo que proponen los programas, y les relaciona esas propuestas. */
export function useCreateDraftFicha() {
  return useImpactMutation(
    async (input: { fn: Indicator["fn"]; ownerUnitId: string; code: string; name: string; description: string; stage: Indicator["stage"]; link: string[] }) => {
      const created = await run<{ id: string }>(
        supabase
          .from("imp_indicators")
          .insert({
            code: input.code,
            fn: input.fn,
            stage: input.stage,
            owner_unit_id: input.ownerUnitId,
            name: input.name.trim(),
            description: input.description.trim(),
            status: "borrador",
          })
          .select("id")
          .single(),
      );
      for (const id of input.link) {
        const { error } = await supabase.rpc("imp_link_program_indicator", { p_indicator: id, p_parent: created.id });
        if (error) throw describeDatabaseError(error as DatabaseError);
      }
      return created.id;
    },
  );
}

/** Una ficha obligatoria entra siempre en la propuesta de Mr. Pilo a los programas (0085). */
export function useSetMandatory() {
  return useImpactMutation(async ({ id, mandatory }: { id: string; mandatory: boolean }) => {
    await run(supabase.from("imp_indicators").update({ mandatory }).eq("id", id).select("id").single());
  });
}

/* --- Mr. Pilo: pesos y fuentes de datos (0085) ---------------------------------------- */

export interface PiloSettings {
  weights: PiloWeights;
  /** Guardados tal cual, para saber qué cambió Planeación. */
  savedWeights: Record<string, unknown>;
  /** Por fuente, los códigos de ficha que alimenta. */
  sourceMap: Record<string, string[]>;
  missing: boolean;
}

export function usePiloSettings() {
  return useQuery({
    queryKey: ["impacto", "pilo", "ajustes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PiloSettings> => {
      schemaMissing = false;
      const rows = await read<{ weights: Record<string, unknown> | null; source_map: Record<string, string[]> | null }>(
        supabase.from("imp_pilo_settings").select("weights,source_map").eq("id", 1),
      );
      const saved = rows[0]?.weights ?? {};
      return {
        weights: mergeWeights(saved),
        savedWeights: saved,
        sourceMap: rows[0]?.source_map ?? { p1p2p3: [] },
        missing: schemaMissing,
      };
    },
  });
}

export function useSavePiloSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { weights: Record<string, number>; sourceMap: Record<string, string[]> }) => {
      await run(
        supabase
          .from("imp_pilo_settings")
          .upsert({ id: 1, weights: input.weights, source_map: input.sourceMap }, { onConflict: "id" })
          .select("id")
          .single(),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["impacto", "pilo"] }),
  });
}

export interface SourceFigure {
  source: "p1p2p3";
  period: string;
  year: number;
  programId: string;
  campusId: string;
  students: number;
  enrollments: number;
  approvedRate: number | null;
  averageGrade: number | null;
  atRiskRate: number | null;
  loadedAt: string;
}

/** Los agregados de fuentes institucionales de un programa en una sede, o todos los visibles. */
export function useSourceFigures(site?: { programId: string; campusId: string } | null) {
  return useQuery({
    queryKey: ["impacto", "pilo", "fuentes", site ? `${site.programId}|${site.campusId}` : "todas"],
    queryFn: async (): Promise<SourceFigure[]> => {
      let query = supabase.from("imp_source_figures").select("*").order("period");
      if (site) query = query.eq("program_id", site.programId).eq("campus_id", site.campusId);
      const rows = await read<{
        source: "p1p2p3"; period: string; year: number; program_id: string; campus_id: string; students: number;
        enrollments: number; approved_rate: number | string | null; average_grade: number | string | null;
        at_risk_rate: number | string | null; loaded_at: string;
      }>(query);
      return rows.map((r) => ({
        source: r.source,
        period: r.period,
        year: r.year,
        programId: r.program_id,
        campusId: r.campus_id,
        students: r.students,
        enrollments: r.enrollments,
        approvedRate: num(r.approved_rate),
        averageGrade: num(r.average_grade),
        atRiskRate: num(r.at_risk_rate),
        loadedAt: r.loaded_at,
      }));
    },
  });
}

/** Guarda los agregados de un periodo (reemplaza los de ese programa, sede y periodo). */
export function useSaveSourceFigures() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<SourceFigure, "loadedAt">[]) => {
      if (!rows.length) return 0;
      await run(
        supabase
          .from("imp_source_figures")
          .upsert(
            rows.map((r) => ({
              source: r.source,
              period: r.period,
              year: r.year,
              program_id: r.programId,
              campus_id: r.campusId,
              students: r.students,
              enrollments: r.enrollments,
              approved_rate: r.approvedRate,
              average_grade: r.averageGrade,
              at_risk_rate: r.atRiskRate,
              loaded_at: new Date().toISOString(),
            })),
            { onConflict: "source,period,program_id,campus_id" },
          )
          .select("id"),
      );
      return rows.length;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["impacto", "pilo"] }),
  });
}

/** Varios cruces con pilares y ODS de una vez, puestos a mano (el asistente de ficha nueva). */
export function useAddAlignments() {
  return useImpactMutation(
    async (rows: { indicatorId: string; target: "pilar" | "ods"; pillarId?: string; sdg?: number }[]) => {
      if (!rows.length) return;
      await run(
        supabase
          .from("imp_alignments")
          .insert(
            rows.map((r) => ({
              indicator_id: r.indicatorId,
              target: r.target,
              pillar_id: r.pillarId ?? null,
              sdg: r.sdg ?? null,
              origin: "manual",
              confirmed: true,
            })),
          )
          .select("id"),
      );
    },
  );
}

/** Quita cruces con pilares y ODS por su id (al editar un indicador en el asistente). */
export function useRemoveAlignments() {
  return useImpactMutation(async (ids: string[]) => {
    if (!ids.length) return;
    await run(supabase.from("imp_alignments").delete().in("id", ids).select("id"));
  });
}
