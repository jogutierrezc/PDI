/* =============================================================================
   Observatorio · tablas agregadas desde el UDES Warehouse (migración 0249).

   Toda la lectura y la agregación pasan por funciones de la base que validan
   permisos y política de privacidad: el navegador nunca recibe filas
   individuales del almacén, solo columnas permitidas y resultados agregados
   (los grupos de menos de 5 registros ya vienen descartados).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { ObsColumn } from "./model";
import type { FreeRow } from "../../datos-abiertos/data/free-sets";
import { obsKeys, obsPublicKey } from "./store";

export interface CargaVigente {
  carga: string;
  conjunto: string;
  periodo: string;
  sede: string;
  corte: string;
  version: number;
  filas: number;
  huella: string;
  terminada_en: string | null;
}

export interface ColumnaWh {
  key: string;
  tipo: "numero" | "texto";
  distintos: number;
  llenos: number;
}

export interface ColumnasWh {
  columnas: ColumnaWh[];
  excluidas: { key: string; motivo: string }[];
  filas: number;
}

export type OperacionWh = "contar" | "sumar" | "promediar";
export interface MedidaWh {
  op: OperacionWh;
  col?: string;
}
export interface DefinicionWh {
  dims: string[];
  medidas: MedidaWh[];
}

export interface ResultadoWh {
  columns: ObsColumn[];
  rows: FreeRow[];
  grupos: number;
  grupos_descartados: number;
  registros_descartados: number;
  registros: number;
}

export interface OrigenWh {
  dataset_id: string;
  conjunto: string;
  sede: string;
  periodo: string;
  corte: string;
  version: number;
  carga: string;
  vivo: boolean;
  materializado_en: string;
  spec: DefinicionWh;
  vigente_version: number | null;
  vigente_en: string | null;
  desactualizado: boolean;
  sin_vigente: boolean;
}

/** Las funciones de la base responden «codigo: mensaje»; a la persona solo le sirve el mensaje. */
export function mensajeWh(error: unknown): string {
  const m = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return m.replace(/^[a-z_]+: /, "");
}

const FALTA = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (FALTA.has(error.code ?? "")) throw new Error("Falta aplicar la migración 0249 del Observatorio (fuentes del Warehouse).");
    throw new Error(mensajeWh(error));
  }
  return data as T;
}

export const whObsKeys = {
  catalogo: (obs: string) => ["obs-wh", "catalogo", obs] as const,
  columnas: (obs: string, carga: string) => ["obs-wh", "columnas", obs, carga] as const,
  origenes: (obs: string) => ["obs-wh", "origenes", obs] as const,
};

/** Observatorio al que pertenece un tema (null si la base aún no tiene los observatorios). */
export function useObsDeTema(topic: string) {
  return useQuery({
    queryKey: ["obs-wh", "obs-de-tema", topic],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await supabase.from("obs_topics").select("observatorio_id").eq("slug", topic).maybeSingle();
      return r.error ? null : ((r.data as { observatorio_id: string | null } | null)?.observatorio_id ?? null);
    },
  });
}

export const useCatalogoWh = (obs: string | null, activo: boolean) =>
  useQuery({ queryKey: whObsKeys.catalogo(obs ?? ""), enabled: !!obs && activo, retry: false, queryFn: () => rpc<CargaVigente[]>("obs_wh_catalogo", { p_obs: obs }) });

export const useColumnasWh = (obs: string | null, carga: string | null) =>
  useQuery({ queryKey: whObsKeys.columnas(obs ?? "", carga ?? ""), enabled: !!obs && !!carga, retry: false, queryFn: () => rpc<ColumnasWh>("obs_wh_columnas", { p_obs: obs, p_carga: carga }) });

export const useOrigenesWh = (obs: string | null) =>
  useQuery({ queryKey: whObsKeys.origenes(obs ?? ""), enabled: !!obs, retry: false, staleTime: 30_000, queryFn: () => rpc<OrigenWh[]>("obs_wh_origenes", { p_obs: obs }) });

export const usePrevisualizarWh = () =>
  useMutation({ mutationFn: (a: { obs: string; carga: string } & DefinicionWh) => rpc<ResultadoWh>("obs_wh_previsualizar", { p_obs: a.obs, p_carga: a.carga, p_dims: a.dims, p_medidas: a.medidas }) });

export interface MaterializarArgs extends DefinicionWh {
  obs: string;
  tema: string;
  carga: string;
  titulo: string;
  descripcion?: string;
  fuente?: string;
  vivo?: boolean;
  dataset?: string | null;
}

function useInvalidarObs() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: obsKeys.all });
    void client.invalidateQueries({ queryKey: ["obs-wh", "origenes"] });
    void client.invalidateQueries({ queryKey: obsPublicKey });
  };
}

export function useMaterializarWh() {
  const invalidar = useInvalidarObs();
  return useMutation({
    mutationFn: (a: MaterializarArgs) =>
      rpc<{ dataset_id: string; filas: number; grupos_descartados: number; registros_descartados: number }>("obs_wh_materializar", {
        p_obs: a.obs, p_tema: a.tema, p_carga: a.carga, p_dims: a.dims, p_medidas: a.medidas, p_titulo: a.titulo,
        p_dataset: a.dataset ?? null, p_vivo: a.vivo ?? false, p_descripcion: a.descripcion ?? "", p_fuente: a.fuente ?? "",
      }),
    onSuccess: invalidar,
  });
}

export function useRefrescarWh() {
  const invalidar = useInvalidarObs();
  return useMutation({ mutationFn: (dataset: string) => rpc<{ cambio: boolean; version: number; filas?: number }>("obs_wh_refrescar", { p_dataset: dataset }), onSuccess: invalidar });
}
