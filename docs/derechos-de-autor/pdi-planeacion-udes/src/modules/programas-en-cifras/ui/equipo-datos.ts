/* Programas en Cifras · todos los nombramientos que la persona puede ver (pc_miembros).
   La base filtra: la administración los ve todos; un Director, los de sus programas. */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { errorDe } from "../datos";
import type { Miembro } from "../datos";
import type { PcMiembroRow } from "../tipos";

export const CLAVE_EQUIPO = ["pc", "miembros"] as const;

export function useTodosMiembros() {
  return useQuery({
    queryKey: [...CLAVE_EQUIPO, "todos"],
    retry: false,
    queryFn: async (): Promise<Miembro[]> => {
      const r = await supabase.from("pc_miembros").select("id, user_id, rol, programa_id, campus_id, created_at, profiles!pc_miembros_user_id_fkey(full_name, email)");
      if (r.error) throw errorDe(r.error);
      type Perfil = { full_name: string | null; email: string | null };
      return ((r.data as unknown as (PcMiembroRow & { profiles: Perfil | Perfil[] | null })[] | null) ?? []).map(({ profiles, ...m }) => {
        const p = Array.isArray(profiles) ? profiles[0] : profiles;
        return { ...m, nombre: p?.full_name ?? p?.email ?? "Persona", email: p?.email ?? "" };
      });
    },
  });
}
