/* =============================================================================
   Informes ODS con Pilo · lo que la pantalla lee de `settings` sin tocarlo.

   datos.ts entrega `settings` ya filtrado (tono, persona, visión). La pantalla
   necesita además, sin escribirlo nunca:
     · legacy (0147): el informe viene del informe 2025 original y sus notas
       de revisión («Texto repetido de otro ODS…»);
     · plan (0146): los temas y las notas que no lograron un párrafo
       verificable (`fallidas`), para «Reintentar fallidas».
   Una sola consulta por edición (los 17 informes) alimenta además la franja
   de los ODS con su estado: nada de 17 consultas.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { EstadoInforme } from "./tipos";

export interface Legado {
  /** El informe viene del informe 2025 original (0147). */
  importado: boolean;
  fuente: string;
  notas: string[];
}

export interface Fallida {
  news_id: string;
  motivo: string;
}

export interface ResumenInforme {
  id: string;
  ods: number;
  state: EstadoInforme;
  legado: Legado;
  fallidas: Fallida[];
  temas: number;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Lo de 0147 en settings: { legacy: true, source, revision_notas: [...] }. */
export function leerLegado(settings: unknown): Legado {
  const s = obj(settings);
  const l = obj(s.legacy);
  const importado = s.legacy === true || Object.keys(l).length > 0;
  const notas = (Array.isArray(s.revision_notas) ? s.revision_notas : Array.isArray(l.revision_notas) ? l.revision_notas : []).filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
  const fuente = typeof s.source === "string" ? s.source : typeof l.source === "string" ? l.source : "";
  return { importado, fuente, notas };
}

/** Las notas que no lograron un párrafo verificable, con su motivo (plan de 0146). */
export function leerFallidas(settings: unknown): { fallidas: Fallida[]; temas: number } {
  const plan = obj(obj(settings).plan);
  const fallidas = (Array.isArray(plan.fallidas) ? plan.fallidas : [])
    .map((f) => obj(f))
    .filter((f) => typeof f.news_id === "string")
    .map((f) => ({ news_id: String(f.news_id), motivo: typeof f.motivo === "string" ? f.motivo : "" }));
  return { fallidas, temas: Array.isArray(plan.temas) ? plan.temas.length : 0 };
}

/** Los informes de una edición (los 17 a la vez), con su estado, su origen y sus notas fallidas. */
export function useResumenInformes(edition: number) {
  return useQuery({
    queryKey: ["informe", "resumen", edition],
    staleTime: 15_000,
    retry: false,
    enabled: edition > 0,
    queryFn: async (): Promise<ResumenInforme[]> => {
      const r = await supabase
        .from("ods_reports" as never)
        .select("id, ods, state, settings")
        .eq("edition", edition);
      if (r.error) return [];
      return ((r.data as unknown as Record<string, unknown>[]) ?? []).map((f) => {
        const { fallidas, temas } = leerFallidas(f.settings);
        return { id: String(f.id), ods: Number(f.ods), state: (f.state as EstadoInforme) ?? "borrador", legado: leerLegado(f.settings), fallidas, temas };
      });
    },
  });
}
