/* =============================================================================
   Observatorio · filtros que ofrece el tablero y observatorio por enlace (0277).

   Leer lo hace quien tenga algún panel del taller (Ver incluido); guardar pide
   Editar en Tableros, y la base lo comprueba. Sin la migración se usan los
   valores de siempre (los cuatro filtros encendidos).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";

export interface FiltrosTablero {
  vicerrectoria: boolean;
  facultad: boolean;
  programa: boolean;
  sede: boolean;
  responsable: string;
  publicado_en: string | null;
}

export const FILTROS_BASE: FiltrosTablero = { vicerrectoria: true, facultad: true, programa: true, sede: true, responsable: "", publicado_en: null };

const FALTA = new Set(["42P01", "PGRST205"]);

export const tableroKeys = {
  filtros: (obs: string) => ["obs-guia", "filtros", obs] as const,
  obs: (slug: string) => ["obs-guia", "obs", slug] as const,
  temas: (obs: string) => ["obs-guia", "temas", obs] as const,
};

export function useFiltrosTablero(obs: string | null) {
  return useQuery({
    queryKey: tableroKeys.filtros(obs ?? ""),
    enabled: !!obs,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<FiltrosTablero> => {
      const r = await supabase.from("obs_tablero_filtros").select("vicerrectoria,facultad,programa,sede,responsable,publicado_en").eq("observatorio_id", obs!).maybeSingle();
      if (r.error) {
        if (FALTA.has(r.error.code ?? "")) return FILTROS_BASE;
        throw r.error;
      }
      return r.data ? (r.data as FiltrosTablero) : FILTROS_BASE;
    },
  });
}

export function useGuardarFiltros(obs: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: Omit<FiltrosTablero, "publicado_en">) => {
      const { error } = await supabase.from("obs_tablero_filtros").upsert({ observatorio_id: obs, ...f, updated_at: new Date().toISOString() }, { onConflict: "observatorio_id" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableroKeys.filtros(obs) }),
  });
}

export interface ObservatorioBasico { id: string; nombre: string; slug: string; descripcion: string; estado: string }
export interface TemaBasico { slug: string; nombre: string | null; resumen: string | null; pregunta: string | null; linea_id: string | null; orden: number; archivado: boolean }
export interface LineaBasica { id: string; nombre: string; orden: number }

/** El observatorio por su enlace, y su estructura de líneas y temas. */
export function useObservatorioPorEnlace(slug: string | undefined) {
  return useQuery({
    queryKey: tableroKeys.obs(slug ?? ""),
    enabled: !!slug,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<{ obs: ObservatorioBasico; lineas: LineaBasica[]; temas: TemaBasico[] } | null> => {
      const o = await supabase.from("obs_observatorios").select("id,nombre,slug,descripcion,estado").eq("slug", slug!).maybeSingle();
      if (o.error) {
        if (FALTA.has(o.error.code ?? "")) return null;
        throw o.error;
      }
      if (!o.data) return null;
      const obs = o.data as ObservatorioBasico;
      const [l, t] = await Promise.all([
        supabase.from("obs_lineas").select("id,nombre,orden").eq("observatorio_id", obs.id).order("orden"),
        supabase.from("obs_topics").select("slug,nombre,resumen,pregunta,linea_id,orden,archivado").eq("observatorio_id", obs.id).order("orden"),
      ]);
      if (l.error) throw l.error;
      if (t.error) throw t.error;
      return { obs, lineas: (l.data ?? []) as LineaBasica[], temas: ((t.data ?? []) as TemaBasico[]).filter((x) => !x.archivado) };
    },
  });
}
