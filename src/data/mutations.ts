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
import type { AppRole, Profile } from "../types/database";

/** Tablas sobre las que escribe la intranet. */
export type WritableTable =
  | "pillars"
  | "strategic_areas"
  | "action_lines"
  | "indicators"
  | "projects"
  | "activities"
  | "planning_items"
  | "documents"
  | "change_log"
  | "glossary_terms"
  | "parameters"
  | "pillar_owners"
  | "profiles";

/** Mensajes de Postgres traducidos a algo accionable para quien edita. */
function describe(error: { message: string; code?: string }): Error {
  const message = error.message ?? "";

  if (error.code === "23505" || /duplicate key/i.test(message)) {
    return new Error("Ya existe un registro con esos datos.");
  }
  if (error.code === "23503" || /violates foreign key/i.test(message)) {
    return new Error("No se puede eliminar: hay contenido que todavía lo usa.");
  }
  if (error.code === "42501" || /row-level security/i.test(message)) {
    return new Error("No tienes permiso para hacer este cambio.");
  }
  if (/pillars_slug_format/i.test(message)) {
    return new Error("El identificador solo admite minúsculas, números y guiones.");
  }
  if (/activities_done_is_complete/i.test(message)) {
    return new Error("Una actividad cumplida debe estar al 100 %.");
  }
  // Los mensajes de los disparadores (RAISE EXCEPTION) ya están en español.
  return new Error(message || "No se pudo guardar el cambio.");
}

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
