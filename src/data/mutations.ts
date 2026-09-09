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
import { callAdminUsers, supabase } from "../lib/supabase";
import { keys } from "./queries";
import { describeDatabaseError as describe } from "./errors";
import type { AppRole, Profile } from "../types/database";

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
  | "web_projects";

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
export const pillarScope = (): QueryKey[] => [
  keys.pillars(),
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
      values: Partial<Pick<Profile, "full_name" | "unit" | "role" | "is_active">>;
    }) => {
      const { data, error } = await supabase.from("profiles").update(values).eq("id", id).select().single();
      if (error) throw describe(error);
      return data as Profile;
    },
    onSuccess: invalidate,
  });
}
