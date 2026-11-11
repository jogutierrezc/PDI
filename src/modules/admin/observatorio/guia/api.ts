/* =============================================================================
   Observatorio · guía de datos (migración 0277).

   Un indicador por fila, con su fuente, su estado y su ORIGEN: foto (nada
   conectado), tabla del taller, libro de UDrive o cifra viva del Warehouse.
   Leer lo puede hacer quien tenga algún panel del taller (Ver incluido);
   conectar un origen exige Editar en Captura y pasa por una función de la base
   que lo comprueba y deja el historial. Sin la migración, la lectura devuelve
   «falta» y la pantalla lo avisa sin romper nada.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";

export type OrigenTipo = "foto" | "tabla" | "libro" | "viva";
export type EstadoIndicador = "ok" | "dato" | "falta";
export type NivelIndicador = "programa" | "facultad" | "institucional";

export interface Indicador {
  id: string;
  observatorio_id: string;
  tema_slug: string;
  clave: string;
  orden: number;
  nombre: string;
  fuente: string;
  cobertura: string;
  nivel: NivelIndicador;
  estado: EstadoIndicador;
  hojas: string[];
  conjunto_vivo: string | null;
  libro_existente: string | null;
  vista: string | null;
  vista_pestana: string | null;
  origen_tipo: OrigenTipo;
  origen_ref: string | null;
  origen_version: number;
  origen_nota: string | null;
  origen_en: string | null;
}

export interface VersionIndicador {
  id: string;
  version: number;
  texto: string;
  created_at: string;
}

export const guiaKeys = {
  indicadores: (obs: string) => ["obs-guia", "indicadores", obs] as const,
  versiones: (id: string) => ["obs-guia", "versiones", id] as const,
};

/** Códigos de «la tabla o la función todavía no existe» (migración sin aplicar). */
const FALTA = new Set(["42P01", "42883", "PGRST200", "PGRST202", "PGRST205"]);

export const ORIGEN_TEXTO: Record<OrigenTipo, string> = {
  foto: "Foto estática",
  tabla: "Tabla del taller",
  libro: "Libro de UDrive",
  viva: "Cifra viva",
};

/** Qué cuenta como «actualizable»: lo que está conectado a algo que cambia solo. */
export const esActualizable = (i: Pick<Indicador, "origen_tipo">) => i.origen_tipo !== "foto";

/** Origen que ve la persona: lo conectado, o lo que dice el estado cuando no hay nada. */
export function origenVisible(i: Pick<Indicador, "origen_tipo" | "estado" | "origen_version">): { clave: "act" | "foto" | "dato" | "falta"; texto: string } {
  if (i.origen_tipo !== "foto") {
    const v = i.origen_tipo === "libro" || i.origen_tipo === "tabla" ? ` v${i.origen_version}` : "";
    return { clave: "act", texto: `${ORIGEN_TEXTO[i.origen_tipo]}${v}` };
  }
  if (i.estado === "ok") return { clave: "foto", texto: ORIGEN_TEXTO.foto };
  if (i.estado === "dato") return { clave: "dato", texto: "Archivo por adaptar" };
  return { clave: "falta", texto: "Sin archivo" };
}

export function useIndicadores(obs: string | null) {
  return useQuery({
    queryKey: guiaKeys.indicadores(obs ?? ""),
    enabled: !!obs,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<{ filas: Indicador[]; falta: boolean }> => {
      const r = await supabase.from("obs_indicadores").select("*").eq("observatorio_id", obs!).order("tema_slug").order("orden");
      if (r.error) {
        if (FALTA.has(r.error.code ?? "")) return { filas: [], falta: true };
        throw r.error;
      }
      return { filas: (r.data ?? []) as Indicador[], falta: false };
    },
  });
}

export function useVersionesIndicador(id: string | null) {
  return useQuery({
    queryKey: guiaKeys.versiones(id ?? ""),
    enabled: !!id,
    retry: false,
    queryFn: async (): Promise<VersionIndicador[]> => {
      const r = await supabase.from("obs_indicador_versiones").select("id, version, texto, created_at").eq("indicador_id", id!).order("created_at", { ascending: false }).limit(20);
      if (r.error) throw r.error;
      return (r.data ?? []) as VersionIndicador[];
    },
  });
}

export function useConectarIndicador(obs: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; tipo: OrigenTipo; ref: string | null; nota?: string }) => {
      const { data, error } = await supabase.rpc("obs_indicador_conectar", { p_indicador: a.id, p_tipo: a.tipo, p_ref: a.ref, p_nota: a.nota ?? null });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_v, a) => {
      void qc.invalidateQueries({ queryKey: guiaKeys.indicadores(obs) });
      void qc.invalidateQueries({ queryKey: guiaKeys.versiones(a.id) });
    },
  });
}
