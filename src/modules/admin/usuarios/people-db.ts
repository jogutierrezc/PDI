/* =============================================================================
   Personas: dónde trabaja cada una y con qué rol.

   Las pertenencias (`unit_members`) son las de Mis Tableros; desde 0063 llevan
   además un rol de unidad (`access_role_id`) que da las acciones de Impacto.
   Se escriben todas juntas por persona con `admin_set_memberships` (0073), en
   una transacción: el paso 3 del asistente y la ficha de la persona enseñan la
   lista entera, y lo que se guarda es lo que queda.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { keys } from "../../../data/queries";
import { describeDatabaseError } from "../../../data/errors";
import { boardKeys } from "../../tableros/store";
import type { UnitKind, UnitRole } from "../../tableros/model";

export interface UnitOption {
  id: string;
  parentId: string | null;
  kind: UnitKind;
  code: string;
  name: string;
  slug: string;
}

export interface Membership {
  id: string;
  unitId: string;
  profileId: string;
  accessRoleId: string | null;
  role: UnitRole;
  /** Cargo (0074); vacío si la base aún no lo tiene. */
  title: string;
}

/** Lo que se envía para una persona: unidad, rol de unidad y, si se elige, papel en Mis Tableros. */
export interface MembershipInput {
  unit_id: string;
  access_role_id: string | null;
  role?: UnitRole | null;
  /** Cargo; nulo conserva el que tenga (0074). */
  title?: string | null;
}

export const peopleKeys = {
  all: [...keys.all, "personas"] as const,
  units: () => [...peopleKeys.all, "unidades"] as const,
  memberships: () => [...peopleKeys.all, "pertenencias"] as const,
};

type Row<T> = { data: T | null; error: { message: string; code?: string; details?: string; hint?: string } | null };

function unwrap<T>(result: Row<T>): T {
  if (result.error) throw describeDatabaseError(result.error as never);
  return (result.data ?? []) as T;
}

/** El organigrama en corto, para elegir unidades. */
export function useUnitOptions() {
  return useQuery({
    queryKey: peopleKeys.units(),
    queryFn: async (): Promise<UnitOption[]> => {
      const rows = unwrap(
        (await supabase.from("units").select("id,parent_id,kind,code,name,slug").order("position")) as Row<
          { id: string; parent_id: string | null; kind: UnitKind; code: string; name: string; slug: string }[]
        >,
      );
      return rows.map((u) => ({ id: u.id, parentId: u.parent_id, kind: u.kind, code: u.code, name: u.name, slug: u.slug }));
    },
    staleTime: 60 * 1000,
  });
}

/** Todas las pertenencias. La administración las lee todas (unit_can_view). */
export function useMemberships() {
  return useQuery({
    queryKey: peopleKeys.memberships(),
    queryFn: async (): Promise<Membership[]> => {
      const rows = unwrap(
        (await supabase.from("unit_members").select("*")) as Row<
          { id: string; unit_id: string; profile_id: string; access_role_id: string | null; role: UnitRole; title?: string | null }[]
        >,
      );
      return rows.map((m) => ({
        id: m.id,
        unitId: m.unit_id,
        profileId: m.profile_id,
        accessRoleId: m.access_role_id,
        role: m.role,
        title: m.title ?? "",
      }));
    },
  });
}

export async function setMemberships(profileId: string, rows: MembershipInput[], replace = true) {
  const { error } = await supabase.rpc("admin_set_memberships", {
    p_profile: profileId,
    p_rows: rows,
    p_replace: replace,
  });
  if (error) throw describeDatabaseError(error as never);
}

export function useSetMemberships() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, rows, replace = true }: { profileId: string; rows: MembershipInput[]; replace?: boolean }) =>
      setMemberships(profileId, rows, replace),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: peopleKeys.all });
      void client.invalidateQueries({ queryKey: boardKeys.units });
    },
  });
}

/** Nombre de la unidad con su código, para listas. */
export const unitLabel = (unit: Pick<UnitOption, "code" | "name"> | undefined) =>
  unit ? `${unit.name} · ${unit.code}` : "Unidad retirada";
