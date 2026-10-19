/* =============================================================================
   Personas: dónde trabaja cada una y qué hace allí.

   Las pertenencias (`unit_members`) son las de Mis Tableros: la unidad, la
   función de la persona en ella (Gestor, Contribuyente o Consulta) y su cargo.
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
  role: UnitRole;
  /** Cargo (0074); vacío si la base aún no lo tiene. */
  title: string;
  /** Sede a la que se limita (0078); null = todas. */
  campusId: string | null;
}

/** Lo que se envía para una persona: unidad y, si se elige, su función en ella. */
export interface MembershipInput {
  unit_id: string;
  role?: UnitRole | null;
  /** Cargo; nulo conserva el que tenga (0074). */
  title?: string | null;
  /** Sede (0082); null = todas. Sin la clave, conserva la que tenga. */
  campus_id?: string | null;
}

/** En qué sedes se ofrece cada programa, con el nombre de la sede. */
export interface ProgramOffer {
  campuses: { id: string; name: string }[];
  /** Programa → sedes activas donde se ofrece. */
  byProgram: Map<string, string[]>;
}

/** Papel en Programas en Cifras (pc_miembros, 0164): quién edita los archivos de un programa en un campus. */
export type PcRol = "director" | "coordinador";

export interface PcNombramiento {
  programaId: string;
  campusId: string;
  rol: PcRol;
}

export const peopleKeys = {
  pc: (profileId: string) => [...keys.all, "personas", "pc", profileId] as const,
  all: [...keys.all, "personas"] as const,
  units: () => [...peopleKeys.all, "unidades"] as const,
  memberships: () => [...peopleKeys.all, "pertenencias"] as const,
  offer: () => [...peopleKeys.all, "oferta"] as const,
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
          { id: string; unit_id: string; profile_id: string; role: UnitRole; title?: string | null; campus_id?: string | null }[]
        >,
      );
      return rows.map((m) => ({
        id: m.id,
        unitId: m.unit_id,
        profileId: m.profile_id,
        role: m.role,
        title: m.title ?? "",
        campusId: m.campus_id ?? null,
      }));
    },
  });
}

/** Las sedes y la oferta por sede, para limitar una pertenencia a un programa. */
export function useProgramOffer() {
  return useQuery({
    queryKey: peopleKeys.offer(),
    queryFn: async (): Promise<ProgramOffer> => {
      const [campuses, offer] = await Promise.all([
        supabase.from("campuses").select("id,name").order("position"),
        supabase.from("program_campuses").select("program_id,campus_id,active"),
      ]);
      const byProgram = new Map<string, string[]>();
      for (const row of unwrap(offer as Row<{ program_id: string; campus_id: string; active: boolean | null }[]>)) {
        if (row.active === false) continue;
        byProgram.set(row.program_id, [...(byProgram.get(row.program_id) ?? []), row.campus_id]);
      }
      return { campuses: unwrap(campuses as Row<{ id: string; name: string }[]>), byProgram };
    },
    staleTime: 60 * 1000,
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

/** Los nombramientos de la persona en Programas en Cifras. Sin la migración 0164, ninguno. */
export function usePcNombramientos(profileId: string | undefined) {
  return useQuery({
    queryKey: peopleKeys.pc(profileId ?? ""),
    enabled: Boolean(profileId),
    retry: false,
    queryFn: async (): Promise<PcNombramiento[]> => {
      const r = await supabase.from("pc_miembros").select("programa_id,campus_id,rol").eq("user_id", profileId ?? "");
      if (r.error) return [];
      return ((r.data ?? []) as { programa_id: string; campus_id: string; rol: PcRol }[]).map((m) => ({
        programaId: m.programa_id,
        campusId: m.campus_id,
        rol: m.rol,
      }));
    },
  });
}

/**
 * El papel de una fila (programa y sede elegida) en Programas en Cifras. «Todas
 * las sedes» vale si en cada sede donde se ofrece tiene el mismo papel.
 */
export function pcRolDe(
  nombramientos: PcNombramiento[],
  programaId: string,
  campusId: string | null,
  offer: ProgramOffer | undefined,
): PcRol | null {
  const sedes = campusId ? [campusId] : (offer?.byProgram.get(programaId) ?? []);
  if (sedes.length === 0) return null;
  const roles = sedes.map((sede) => nombramientos.find((n) => n.programaId === programaId && n.campusId === sede)?.rol ?? null);
  return roles.every((rol) => rol && rol === roles[0]) ? roles[0] : null;
}

/**
 * Deja los nombramientos de la persona como los dicen sus filas de programa.
 * Solo toca los programas que están en la lista: lo que alguien le dio en el
 * Equipo de otro programa no se borra. Los escribe la administración (RLS).
 */
export async function syncProgramasEnCifras(
  profileId: string,
  rows: { unitId: string; campusId: string | null; pcRol: PcRol | null }[],
  offer: ProgramOffer | undefined,
) {
  const queremos = new Map<string, PcRol>();
  for (const row of rows) {
    if (!row.pcRol) continue;
    const sedes = row.campusId ? [row.campusId] : (offer?.byProgram.get(row.unitId) ?? []);
    for (const sede of sedes) queremos.set(`${row.unitId}|${sede}`, row.pcRol);
  }
  const actuales = await supabase.from("pc_miembros").select("id,programa_id,campus_id,rol").eq("user_id", profileId);
  if (actuales.error) {
    if (queremos.size === 0) return;
    throw describeDatabaseError(actuales.error as never);
  }
  const lista = (actuales.data ?? []) as { id: string; programa_id: string; campus_id: string; rol: PcRol }[];
  const tocados = new Set(rows.map((row) => row.unitId));
  const sobran = lista.filter((m) => tocados.has(m.programa_id) && !queremos.has(`${m.programa_id}|${m.campus_id}`)).map((m) => m.id);
  if (sobran.length > 0) {
    const del = await supabase.from("pc_miembros").delete().in("id", sobran);
    if (del.error) throw describeDatabaseError(del.error as never);
  }
  const nuevos = [...queremos.entries()]
    .filter(([clave, rol]) => {
      const [programa, sede] = clave.split("|");
      return lista.find((m) => m.programa_id === programa && m.campus_id === sede)?.rol !== rol;
    })
    .map(([clave, rol]) => {
      const [programa_id, campus_id] = clave.split("|");
      return { user_id: profileId, programa_id, campus_id, rol };
    });
  if (nuevos.length > 0) {
    const up = await supabase.from("pc_miembros").upsert(nuevos, { onConflict: "user_id,programa_id,campus_id" });
    if (up.error) throw describeDatabaseError(up.error as never);
  }
}

/** Nombre de la unidad con su código, para listas. */
export const unitLabel = (unit: Pick<UnitOption, "code" | "name"> | undefined) =>
  unit ? `${unit.name} · ${unit.code}` : "Unidad retirada";
