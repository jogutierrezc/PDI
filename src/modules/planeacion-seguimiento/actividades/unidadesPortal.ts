/* Planeación y Seguimiento · Fase 2 · el árbol de unidades y las pertenencias, con las MISMAS consultas que Mis Tableros
   (`useUnits` en tableros/store.ts: units + unit_members con su perfil). El árbol viene completo y las pertenencias,
   filtradas por RLS; la pantalla no recorta nada. Aquí es una función (no un hook) para usarla desde la capa de datos. */

import { supabase } from "../../../lib/supabase";
import type { Unit, UnitMember } from "../../tableros/model";

type Fila = Record<string, unknown>;

export async function leerUnidades(): Promise<{ unidades: Unit[]; miembros: UnitMember[] }> {
  const [u, m] = await Promise.all([
    supabase.from("units").select("*").order("position"),
    supabase.from("unit_members").select("id,unit_id,profile_id,role,profiles(full_name,email)"),
  ]);
  if (u.error) throw new Error(u.error.message);
  if (m.error) throw new Error(m.error.message);
  const unidades = ((u.data ?? []) as Fila[]).map((r): Unit => ({ id: String(r.id), parentId: (r.parent_id as string | null) ?? null, kind: r.kind as Unit["kind"], code: String(r.code ?? ""), name: String(r.name ?? ""), slug: String(r.slug ?? ""), description: String(r.description ?? ""), position: Number(r.position ?? 0) }));
  const miembros = ((m.data ?? []) as Fila[]).map((r): UnitMember => {
    const p = r.profiles as { full_name: string | null; email: string | null } | null;
    return { id: String(r.id), unitId: String(r.unit_id), profileId: String(r.profile_id), role: r.role as UnitMember["role"], name: p?.full_name?.trim() || p?.email || "Sin nombre", email: p?.email ?? "" };
  });
  return { unidades, miembros };
}
