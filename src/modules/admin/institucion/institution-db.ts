/* =============================================================================
   Estructura institucional · lectura y escritura.

   Lee el árbol de `units` con lo que Impacto le pide (0063, 0073), la oferta
   por sede, las sedes y quién trabaja en cada unidad. Escribe solo por las
   funciones de 0073 —admin_save_unit y admin_import_programs—, que hacen en
   una transacción la unidad y sus sedes y responden con un mensaje claro si
   quien pide no es administración.

   Mis Tableros usa las mismas unidades: toda escritura invalida también su
   caché, para que el árbol de allá no se quede viejo.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError, FriendlyError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import { boardKeys } from "../../tableros/store";
import type { UnitKind, UnitRole } from "../../tableros/model";

export * from "./institution-model";
import type {
  Campus,
  DegreeLevel,
  InstMember,
  InstUnit,
  Institution,
  Modality,
  ProgramCampus,
  SubstantiveFunction,
  UnitImportRow,
} from "./institution-model";

export const institutionKeys = {
  all: ["institucion"] as const,
};

type Result<T> = { data: T | null; error: DatabaseError | null };

/** Tabla o columna de una migración sin aplicar: la pantalla lo dice, no se rompe. */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

function rows<T>({ data, error }: Result<T[]>): T[] {
  if (error) {
    if (MISSING_TABLE.has(error.code ?? "")) return [];
    throw describeDatabaseError(error);
  }
  return data ?? [];
}

interface UnitRow {
  id: string;
  parent_id: string | null;
  kind: UnitKind;
  code: string;
  name: string;
  slug: string | null;
  description: string | null;
  position: number | null;
  snies_code?: string | null;
  degree_level?: DegreeLevel | null;
  modality?: Modality | null;
  substantive_function?: SubstantiveFunction | null;
  reports_to?: string | null;
}

interface MemberRow {
  id: string;
  unit_id: string;
  profile_id: string;
  role: UnitRole;
  access_role_id?: string | null;
  title?: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
}

const UNIT_BASE = "id,parent_id,kind,code,name,slug,description,position";
const UNIT_FULL = `${UNIT_BASE},snies_code,degree_level,modality,substantive_function,reports_to`;

const toUnit = (r: UnitRow): InstUnit => ({
  id: r.id,
  parentId: r.parent_id ?? null,
  kind: r.kind,
  code: r.code ?? "",
  name: r.name ?? "",
  slug: r.slug ?? r.id,
  description: r.description ?? "",
  position: r.position ?? 0,
  sniesCode: r.snies_code ?? null,
  degreeLevel: r.degree_level ?? null,
  modality: r.modality ?? null,
  substantiveFunction: r.substantive_function ?? null,
  reportsTo: r.reports_to ?? null,
});

async function loadUnits(): Promise<{ units: InstUnit[]; ready: boolean }> {
  const full = (await supabase.from("units").select(UNIT_FULL).order("position")) as Result<UnitRow[]>;
  if (!full.error) return { units: (full.data ?? []).map(toUnit), ready: true };
  if (!MISSING_COLUMN.has(full.error.code ?? "")) return { units: rows(full).map(toUnit), ready: true };
  // Sin la 0073 (o la 0063): se enseña el árbol, sin los campos nuevos.
  const base = (await supabase.from("units").select(UNIT_BASE).order("position")) as Result<UnitRow[]>;
  return { units: rows(base).map(toUnit), ready: false };
}

async function loadMembers(): Promise<InstMember[]> {
  // Con 0074 trae el cargo; sin ella, sin cargo; sin 0063, sin rol de Impacto.
  let result = (await supabase
    .from("unit_members")
    .select("id,unit_id,profile_id,role,access_role_id,title,profiles(full_name,email)")) as Result<MemberRow[]>;
  if (result.error && MISSING_COLUMN.has(result.error.code ?? "")) {
    result = (await supabase
      .from("unit_members")
      .select("id,unit_id,profile_id,role,access_role_id,profiles(full_name,email)")) as Result<MemberRow[]>;
  }
  if (result.error && MISSING_COLUMN.has(result.error.code ?? "")) {
    result = (await supabase.from("unit_members").select("id,unit_id,profile_id,role,profiles(full_name,email)")) as Result<MemberRow[]>;
  }
  return rows(result).map((m) => ({
    id: m.id,
    unitId: m.unit_id,
    profileId: m.profile_id,
    role: m.role,
    accessRoleId: m.access_role_id ?? null,
    title: m.title ?? null,
    name: m.profiles?.full_name?.trim() || m.profiles?.email || "Sin nombre",
    email: m.profiles?.email ?? "",
  }));
}

export function useInstitution() {
  return useQuery({
    queryKey: institutionKeys.all,
    queryFn: async (): Promise<Institution> => {
      const [{ units, ready }, campuses, offer, members] = await Promise.all([
        loadUnits(),
        supabase
          .from("campuses")
          .select("id,slug,code,name,position")
          .order("position")
          .then((r) => rows<Campus>(r as Result<Campus[]>)),
        supabase
          .from("imp_program_campuses")
          .select("program_id,campus_id,active")
          .then((r) =>
            rows<{ program_id: string; campus_id: string; active: boolean | null }>(
              r as Result<{ program_id: string; campus_id: string; active: boolean | null }[]>,
            ).map((o) => ({ programId: o.program_id, campusId: o.campus_id, active: o.active !== false })),
          ),
        loadMembers(),
      ]);
      return { units, campuses, offer, members, ready };
    },
  });
}

/* --- Escritura -------------------------------------------------------------------- */

/** Lo que se manda a admin_save_unit. */
export interface UnitPayload {
  id?: string;
  parent_id: string | null;
  kind: UnitKind;
  code: string;
  name: string;
  slug: string;
  description: string;
  position: number;
  snies_code: string | null;
  degree_level: DegreeLevel | null;
  modality: Modality | null;
  substantive_function: SubstantiveFunction | null;
  reports_to: string | null;
}

/** El error de una RPC, dicho para quien administra. */
function rpcError(error: DatabaseError, migration = "0073_estructura_roles_usuarios.sql"): Error {
  if (error.code === "PGRST202" || error.code === "42883") {
    return new FriendlyError("La base aún no tiene las funciones de la estructura institucional.", {
      advice: `Aplique la migración ${migration} en el editor SQL de Supabase.`,
      original: error.message,
      retryable: false,
    });
  }
  // Los mensajes de 0073 ya vienen en español y dicen qué pasó.
  if (error.code === "P0001" || error.code === "23514" || error.code === "23503" || error.code === "42501" || error.code === "22023") {
    return new FriendlyError(error.message, { original: error.message, retryable: false });
  }
  if (error.code === "23505") {
    return new FriendlyError("Ya hay otra unidad con ese código, ese SNIES o esa dirección.", {
      advice: "Revise que el código y el SNIES no estén repetidos.",
      original: error.message,
      retryable: false,
    });
  }
  return describeDatabaseError(error);
}

function useInstitutionMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: institutionKeys.all }),
        client.invalidateQueries({ queryKey: boardKeys.all }),
        // El portal de Impacto y su intranet leen programas y sedes.
        client.invalidateQueries({ queryKey: ["impacto"] }),
      ]);
    },
  });
}

export function useSaveUnit() {
  return useInstitutionMutation(async ({ unit, campuses }: { unit: UnitPayload; campuses: string[] | null }) => {
    const { data, error } = await supabase.rpc("admin_save_unit", { p_unit: unit, p_campuses: campuses });
    if (error) throw rpcError(error as DatabaseError);
    return data as string;
  });
}

export function useDeleteUnit() {
  return useInstitutionMutation(async (unitId: string) => {
    const { error } = await supabase.from("units").delete().eq("id", unitId).select("id").maybeSingle();
    if (error) {
      if (error.code === "23503") {
        throw new FriendlyError("La unidad tiene datos que dependen de ella y no se puede borrar.", {
          advice: "Si ya no se usa, déjela sin personas y consérvela; los registros de Impacto la necesitan.",
          original: error.message,
          retryable: false,
        });
      }
      throw describeDatabaseError(error as DatabaseError);
    }
  });
}

/** Carga masiva de toda la estructura: todo o nada (admin_import_units, 0074). */
export function useImportUnits() {
  return useInstitutionMutation(async (rows: UnitImportRow[]) => {
    const { data, error } = await supabase.rpc("admin_import_units", { p_rows: rows });
    if (error) throw rpcError(error as DatabaseError, "0074_estructura_carga_y_personas.sql");
    return data as { created: number; updated: number };
  });
}

/* --- Personas de una unidad --------------------------------------------------------- */

export interface MembershipInput {
  profileId: string;
  unitId: string;
  role: UnitRole;
  accessRoleId: string | null;
  /** null conserva el que tenga; texto vacío lo borra. */
  title: string | null;
}

/**
 * Añade o cambia una pertenencia sin tocar las demás de la persona
 * (admin_set_memberships con p_replace = false).
 */
export function useSaveMembership() {
  return useInstitutionMutation(async (input: MembershipInput) => {
    const { error } = await supabase.rpc("admin_set_memberships", {
      p_profile: input.profileId,
      p_rows: [{ unit_id: input.unitId, role: input.role, access_role_id: input.accessRoleId, title: input.title }],
      p_replace: false,
    });
    if (error) throw rpcError(error as DatabaseError, "0074_estructura_carga_y_personas.sql");
  });
}

export function useRemoveMembership() {
  return useInstitutionMutation(async (memberId: string) => {
    const { error } = await supabase.from("unit_members").delete().eq("id", memberId).select("id").maybeSingle();
    if (error) throw describeDatabaseError(error as DatabaseError);
  });
}
