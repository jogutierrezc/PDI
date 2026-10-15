/* =============================================================================
   Lista de acceso (access_allowlist, 0162): qué correos o dominios entran con
   Microsoft y con qué rol. Solo administración la lee y la escribe (RLS).

   Agregar un correo habilita de inmediato a quien ya estaba esperando con ese
   correo; quitarlo o desactivarlo cierra su cuenta (lo hace un disparador de la
   base, no esta pantalla). Un dominio ("@udes.edu.co") solo admite ingresos
   nuevos.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeDatabaseError } from "../../../data/errors";
import { keys } from "../../../data/queries";
import { supabase } from "../../../lib/supabase";

export interface AllowEntry {
  id: string;
  /** Un correo o un dominio con arroba delante («@udes.edu.co»), en minúsculas. */
  email: string;
  full_name: string;
  note: string;
  access_role_id: string;
  active: boolean;
  created_at: string;
}

const allowKey = [...keys.all, "lista-de-acceso"] as const;

export const isDomainEntry = (email: string) => email.startsWith("@");

/** Lo escrito → «correo@dominio» o «@dominio», o null si no es ninguno. */
export function parseEntry(text: string): string | null {
  const value = text.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || /^@[^@\s]+\.[^@\s]+$/.test(value) ? value : null;
}

export function useAllowlist() {
  return useQuery({
    queryKey: allowKey,
    queryFn: async (): Promise<AllowEntry[]> => {
      const { data, error } = await supabase.from("access_allowlist").select("*").order("created_at", { ascending: false });
      if (error) throw describeDatabaseError(error);
      return (data ?? []) as AllowEntry[];
    },
  });
}

function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: allowKey });
    void client.invalidateQueries({ queryKey: keys.profiles() });
  };
}

export function useSaveAllowEntry() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (entry: Partial<AllowEntry> & { email: string; access_role_id: string }) => {
      const { id, ...fields } = entry;
      const { error } = id
        ? await supabase.from("access_allowlist").update(fields).eq("id", id)
        : await supabase.from("access_allowlist").insert(fields);
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: refresh,
  });
}

export function useDeleteAllowEntry() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("access_allowlist").delete().eq("id", id);
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: refresh,
  });
}
