/* =============================================================================
   Escrituras.

   Tres fábricas genéricas (crear, actualizar, borrar) en vez de veinte hooks
   casi idénticos. Cada una recibe la tabla y las claves de caché a invalidar,
   así que después de guardar, el tablero y el visor público se refrescan solos:
   es lo que evita que la intranet muestre un dato ya editado y el portal el
   anterior.

   Ninguna de estas funciones comprueba permisos. No es un olvido: las
   políticas RLS lo hacen en la base de datos, y un fallo llega aquí como un
   error de Postgres que la interfaz muestra tal cual.
   ========================================================================== */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { callAdminUsers, readFunctionError, supabase } from "../lib/supabase";
import { keys } from "./queries";
import { describeDatabaseError as describe } from "./errors";
import type { AccessRole, AppRole, NormalizeResult, Profile } from "../types/database";

/** Tablas sobre las que escribe la intranet. */
export type WritableTable =
  | "pillars"
  | "strategic_areas"
  | "action_lines"
  | "indicators"
  | "projects"
  | "activities"
  | "project_links"
  | "activity_targets"
  | "pillar_observations"
  | "planning_items"
  | "documents"
  | "change_log"
  | "glossary_terms"
  | "parameters"
  | "pillar_owners"
  | "profiles"
  | "access_roles"
  | "access_role_reports"
  | "web_projects"
  | "project_budget_reports"
  | "faculties"
  | "faculty_actions";

function useInvalidate(invalidates: QueryKey[]) {
  const client = useQueryClient();
  return () => {
    for (const key of invalidates) void client.invalidateQueries({ queryKey: key });
  };
}

export function useCreateRow<TInput extends object, TRow = unknown>(
  table: WritableTable,
  invalidates: QueryKey[],
) {
  const invalidate = useInvalidate(invalidates);
  return useMutation({
    mutationFn: async (values: TInput): Promise<TRow> => {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      if (error) throw describe(error);
      return data as TRow;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateRow<TInput extends object, TRow = unknown>(
  table: WritableTable,
  invalidates: QueryKey[],
) {
  const invalidate = useInvalidate(invalidates);
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TInput }): Promise<TRow> => {
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select().single();
      if (error) throw describe(error);
      return data as TRow;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRow(table: WritableTable, invalidates: QueryKey[]) {
  const invalidate = useInvalidate(invalidates);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

/* =============================================================================
   Escritura genérica por tabla

   La configuración de un pilar escribe en siete tablas y cada una necesita
   crear, actualizar y borrar. Con las fábricas de arriba harían falta veintiún
   hooks en una sola pantalla; aquí la tabla es un argumento de la llamada, no
   del hook.
   ========================================================================== */

/**
 * Filas de otra tabla que se guardan con el padre. Existe por la serie anual de
 * un indicador: meta, resultado y cumplimiento de cada año viven en
 * `activity_targets`, pero se capturan en el mismo formulario que el indicador
 * y no tendría sentido pedir dos guardados.
 *
 * `upsert` escribe los años con algo capturado y `removeIds` borra los que se
 * vaciaron: sin esa segunda mitad, quitar una cifra la dejaría publicada.
 */
export interface ChildRowPlan {
  table: WritableTable;
  /** Columnas que identifican la fila, para que reguardar no duplique. */
  onConflict: string;
  upsert: Record<string, unknown>[];
  removeIds: string[];
}

export interface SaveRowArgs {
  table: WritableTable;
  /** Con id actualiza; sin id inserta. */
  id?: string;
  values: Record<string, unknown>;
  /** Se resuelve con el id del padre, que al crear no se conoce hasta después. */
  children?: (parentId: string) => ChildRowPlan | null;
}

export function useSaveRow(invalidates: QueryKey[]) {
  const invalidate = useInvalidate(invalidates);
  return useMutation({
    mutationFn: async ({ table, id, values, children }: SaveRowArgs) => {
      const query = id
        ? supabase.from(table).update(values).eq("id", id)
        : supabase.from(table).insert(values);

      const { data, error } = await query.select().single();
      if (error) throw describe(error);

      const parentId = (data as { id?: string } | null)?.id;
      const plan = children && parentId ? children(parentId) : null;

      if (plan) {
        // Primero el borrado: si un año cambia de sitio, dejar el upsert para
        // el final evita que el borrado se lleve por delante lo recién escrito.
        if (plan.removeIds.length > 0) {
          const { error: removeError } = await supabase
            .from(plan.table)
            .delete()
            .in("id", plan.removeIds);
          if (removeError) throw describe(removeError);
        }

        if (plan.upsert.length > 0) {
          const { error: upsertError } = await supabase
            .from(plan.table)
            .upsert(plan.upsert, { onConflict: plan.onConflict });
          if (upsertError) throw describe(upsertError);
        }
      }

      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveRow(invalidates: QueryKey[]) {
  const invalidate = useInvalidate(invalidates);
  return useMutation({
    mutationFn: async ({ table, id }: { table: WritableTable; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

/* --- Claves que toca cada zona -------------------------------------------- */

/**
 * Todo lo que depende del contenido de un pilar. `keys.pillars()` es prefijo de
 * `keys.pillar(slug)`, y la invalidación de TanStack Query es por prefijo: con
 * una sola clave se refrescan la lista y el detalle de cada pilar.
 */
/** Lo que cambia al reportar un año de presupuesto. */
export const budgetScope = (): QueryKey[] => [keys.budget(), keys.adminProjects()];

/** Publicar o retirar una acción cambia lo que ve el portal público, así que
 *  `keys.faculties()` —que es la raíz del índice, la matriz y cada ficha— entra
 *  entera, no solo la bandeja de la intranet. */
export const facultyScope = (): QueryKey[] => [keys.faculties()];

export const pillarScope = (): QueryKey[] => [
  keys.pillars(),
  keys.adminProjects(),
  keys.budget(),
  keys.progress(),
  keys.summary(),
  keys.featured(),
  keys.pillarYears(),
  keys.projects(),
  keys.structure(),
];

/* =============================================================================
   Asignación de responsables
   ========================================================================== */

export function useAssignPillarOwner() {
  const invalidate = useInvalidate([keys.owners()]);
  return useMutation({
    mutationFn: async ({ pillarId, profileId }: { pillarId: string; profileId: string }) => {
      const { error } = await supabase
        .from("pillar_owners")
        .insert({ pillar_id: pillarId, profile_id: profileId });
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

export function useRemovePillarOwner() {
  const invalidate = useInvalidate([keys.owners()]);
  return useMutation({
    mutationFn: async ({ pillarId, profileId }: { pillarId: string; profileId: string }) => {
      const { error } = await supabase
        .from("pillar_owners")
        .delete()
        .eq("pillar_id", pillarId)
        .eq("profile_id", profileId);
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

/* =============================================================================
   Usuarios
   ========================================================================== */

export interface CreateUserInput {
  email: string;
  full_name: string;
  role: AppRole;
  /** Rol de acceso: pantallas e informes que alcanzará. */
  access_role_id?: string | null;
  unit?: string;
  /** Vacío = se envía una invitación por correo en vez de fijar contraseña. */
  password?: string;
}

/** Alta de usuario. Pasa por la Edge Function porque exige la clave de servicio. */
export function useCreateUser() {
  const invalidate = useInvalidate([keys.profiles()]);
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      callAdminUsers<{ user: Profile; invited: boolean }>({ action: "create", ...input }),
    onSuccess: invalidate,
  });
}

/** Baja definitiva: elimina la cuenta de auth y, en cascada, su perfil. */
export function useDeleteUser() {
  const invalidate = useInvalidate([keys.profiles(), keys.owners()]);
  return useMutation({
    mutationFn: (userId: string) => callAdminUsers<{ ok: true }>({ action: "delete", user_id: userId }),
    onSuccess: invalidate,
  });
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (email: string) =>
      callAdminUsers<{ ok: true }>({
        action: "reset",
        email,
        redirect_to: `${window.location.origin}/acceso-intranet`,
      }),
  });
}

/** Crea o actualiza un rol de acceso con sus informes. Los informes se
 *  reemplazan enteros: la lista que se guarda es la que queda. */
export function useSaveAccessRole() {
  const invalidate = useInvalidate([keys.accessRoles(), keys.profiles()]);
  return useMutation({
    mutationFn: async ({
      role,
      reports,
    }: {
      role: Partial<AccessRole> & { key: string; name: string; base_role: AppRole };
      reports: string[];
    }): Promise<AccessRole> => {
      const { id, ...fields } = role;
      const saved = id
        ? await supabase.from("access_roles").update(fields).eq("id", id).select().single()
        : await supabase.from("access_roles").insert(fields).select().single();
      if (saved.error) throw describe(saved.error);
      const roleId = (saved.data as AccessRole).id;

      const remove = await supabase.from("access_role_reports").delete().eq("access_role_id", roleId);
      if (remove.error) throw describe(remove.error);
      if (reports.length > 0) {
        const insert = await supabase
          .from("access_role_reports")
          .insert(reports.map((report_slug) => ({ access_role_id: roleId, report_slug })));
        if (insert.error) throw describe(insert.error);
      }
      return saved.data as AccessRole;
    },
    onSuccess: invalidate,
  });
}

/** Borra un rol propio. Los de sistema los protege un disparador de la base. */
export function useDeleteAccessRole() {
  const invalidate = useInvalidate([keys.accessRoles(), keys.profiles()]);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("access_roles").delete().eq("id", id);
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

/** Cambio de rol o de estado. Va por PostgREST: las políticas ya lo limitan a
 *  administradores, y el disparador impide dejar el portal sin ninguno. */
export function useUpdateProfile() {
  const invalidate = useInvalidate([keys.profiles()]);
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<Pick<Profile, "full_name" | "unit" | "role" | "is_active" | "access_role_id">>;
    }) => {
      const { data, error } = await supabase.from("profiles").update(values).eq("id", id).select().single();
      if (error) throw describe(error);
      return data as Profile;
    },
    onSuccess: invalidate,
  });
}

/* =============================================================================
   PDI por facultad · sincronización con el origen
   ========================================================================== */

/**
 * Trae los planes desde la aplicación de las facultades.
 *
 * Va por la Edge Function y no por una consulta directa: escribir en las tablas
 * del módulo con la sesión de quien pulsa el botón exigiría concederle permiso
 * de escritura sobre filas que él no redacta, y la función además guarda la URL
 * del origen fuera del navegador.
 */
export function useSyncFaculties() {
  const invalidate = useInvalidate(facultyScope());

  return useMutation({
    mutationFn: async (): Promise<SyncReport> => {
      const { data, error } = await supabase.functions.invoke<SyncReport>("sync-facultades", {
        body: {},
      });
      if (error) {
        // `describe` no sirve aquí: traduce errores de PostgREST, y esto es una
        // Edge Function. Su mensaje útil está en el cuerpo de la respuesta.
        const detail = await readFunctionError(error);
        throw new Error(detail ?? error.message);
      }
      return data as SyncReport;
    },
    onSuccess: invalidate,
  });
}

/** Lo que devuelve la sincronización. Se enseña tal cual: si una facultad se
 *  quedó fuera, quien pulsó el botón tiene que verlo. */
export interface SyncReport {
  ok: boolean;
  source: number;
  faculties: number;
  actions: { created: number; updated: number };
  activities: number;
  followups: number;
  orphans: { faculty: string; source_id: string; title: string }[];
  skipped: { faculty: string; reason: string }[];
}

/* =============================================================================
   Normalizar la estructura

   Las tres escrituras van por funciones de la base y no por `update`: mover una
   línea toca siete tablas y borrar la duplicada tiene que pasar en el mismo
   momento. Hecho desde el cliente, una petición que falle a mitad dejaría la
   estructura peor que al empezar.
   ========================================================================== */

/** Fusionar toda la estructura duplicada de una vez. Es el botón. */
export function useNormalizeStructure() {
  const invalidate = useInvalidate(structureScope());

  return useMutation({
    mutationFn: async (onlyExact: boolean): Promise<NormalizeResult[]> => {
      const { data, error } = await supabase.rpc("normalize_structure", {
        only_exact: onlyExact,
      });
      if (error) throw describe(error);
      return (data ?? []) as NormalizeResult[];
    },
    onSuccess: invalidate,
  });
}

/** Fusionar una sola pareja, cuando se quiere ir una a una. */
export function useMergeStructure() {
  const invalidate = useInvalidate(structureScope());

  return useMutation({
    mutationFn: async ({
      kind,
      keepId,
      dropId,
    }: {
      kind: "area" | "line";
      keepId: string;
      dropId: string;
    }): Promise<number> => {
      const { data, error } = await supabase.rpc(
        kind === "area" ? "merge_strategic_areas" : "merge_action_lines",
        { keep_id: keepId, drop_id: dropId },
      );
      if (error) throw describe(error);
      return (data ?? 0) as number;
    },
    onSuccess: invalidate,
  });
}

/** Retirar de una vez toda la estructura de ejemplo que no sostiene nada. */
export function useDropEmptyStructure() {
  const invalidate = useInvalidate(structureScope());

  return useMutation({
    mutationFn: async (): Promise<{ kind: "area" | "line"; code: string | null; name: string }[]> => {
      const { data, error } = await supabase.rpc("drop_empty_structure");
      if (error) throw describe(error);
      return (data ?? []) as { kind: "area" | "line"; code: string | null; name: string }[];
    },
    onSuccess: invalidate,
  });
}

/** Retirar una sola. La base se niega —con la cuenta— si sostiene algo. */
export function useDropStructureOrphan() {
  const invalidate = useInvalidate(structureScope());

  return useMutation({
    mutationFn: async ({ kind, id }: { kind: "area" | "line"; id: string }) => {
      const { error } = await supabase.rpc("drop_structure_orphan", { kind, target: id });
      if (error) throw describe(error);
    },
    onSuccess: invalidate,
  });
}

/**
 * Fusionar estructura cambia dónde cuelga casi todo, así que invalida casi
 * todo: el avance en cascada, los proyectos, el presupuesto, las facultades y
 * los campus leen áreas y líneas.
 */
export const structureScope = (): QueryKey[] => [
  keys.structureAudit(),
  keys.structure(),
  keys.pillars(),
  keys.progress(),
  keys.summary(),
  keys.pillarYears(),
  keys.projects(),
  keys.adminProjects(),
  keys.budget(),
  keys.faculties(),
  keys.campuses(),
];
