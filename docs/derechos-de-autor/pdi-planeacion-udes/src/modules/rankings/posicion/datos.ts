/* =============================================================================
   Analizador de posicionamiento · datos.

   · useFilasTHE(year): la tabla pública de THE Impact de ese año (0148), en
     páginas de 1.000 (el tope de PostgREST), con su captura. Sin la migración,
     FaltaMigracion.
   · useCoberturaTodos(ediciones): las elecciones de evidencia de los 17
     informes de cada edición en DOS consultas (informes + indicadores), en vez
     de 17 useInforme con cuatro consultas cada uno. No toca informes/datos.ts.
   · Los escenarios se guardan en el navegador (localStorage, por persona): son
     supuestos de trabajo, no datos de la universidad; no hace falta tabla.
   ========================================================================== */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../noticias";
import type { Candidata } from "../informes/tipos";
import type { EleccionMin } from "./evidencia";
import type { CapturaTHE, FilaTHE, MejorOds } from "./tipos";

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));

const tabla = (t: string) => supabase.from(t as never);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function aFila(f: Record<string, unknown>): FilaTHE {
  return {
    rank_label: String(f.rank_label ?? ""),
    rank_lo: Number(f.rank_lo),
    rank_hi: num(f.rank_hi),
    overall_lo: Number(f.overall_lo),
    overall_hi: Number(f.overall_hi),
    name: String(f.name ?? ""),
    country: String(f.country ?? ""),
    students: num(f.students),
    sdg17_lo: num(f.sdg17_lo),
    sdg17_hi: num(f.sdg17_hi),
    sdg17_rank_label: (f.sdg17_rank_label as string | null) ?? null,
    sdg17_rank_lo: num(f.sdg17_rank_lo),
    sdg17_rank_hi: num(f.sdg17_rank_hi),
    best: (Array.isArray(f.best) ? (f.best as MejorOds[]) : []).map((b) => ({ ...b, sdg: Number(b.sdg), lo: Number(b.lo), hi: Number(b.hi), rank_lo: Number(b.rank_lo), rank_hi: num(b.rank_hi) })),
    iid: String(f.iid ?? ""),
    nid: num(f.nid),
  };
}

export interface TablaTHE {
  filas: FilaTHE[];
  captura: CapturaTHE | null;
}

const PAGINA = 1000;

/** La tabla general de un año. Vacía si ese año no se ha importado. */
export function useFilasTHE(year: number): UseQueryResult<TablaTHE> {
  return useQuery({
    queryKey: ["the-impact", year],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<TablaTHE> => {
      const filas: FilaTHE[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await tabla("the_impact_rows")
          .select("*")
          .eq("year", year)
          .eq("scope", "overall")
          .order("rank_lo", { ascending: true })
          .order("iid", { ascending: true })
          .range(desde, desde + PAGINA - 1);
        if (r.error) throw noExiste(r.error) ? new FaltaMigracion("Falta aplicar la migración 0148 (THE Impact Rankings).") : new Error(r.error.message);
        const pagina = (r.data as unknown as Record<string, unknown>[]) ?? [];
        filas.push(...pagina.map(aFila));
        if (pagina.length < PAGINA) break;
      }
      const c = await tabla("the_impact_snapshots").select("*").eq("year", year).eq("scope", "overall").maybeSingle();
      const captura = c.error || !c.data ? null : (c.data as unknown as CapturaTHE);
      return { filas, captura };
    },
  });
}

/** Solo la fila de la UDES (para la línea del tablero, sin bajar la tabla entera). */
export function useUdesTHE(year: number): UseQueryResult<FilaTHE | null> {
  return useQuery({
    queryKey: ["the-impact", year, "udes"],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<FilaTHE | null> => {
      const r = await tabla("the_impact_rows").select("*").eq("year", year).eq("scope", "overall").eq("name", "University of Santander").maybeSingle();
      if (r.error) throw noExiste(r.error) ? new FaltaMigracion("Falta aplicar la migración 0148 (THE Impact Rankings).") : new Error(r.error.message);
      return r.data ? aFila(r.data as unknown as Record<string, unknown>) : null;
    },
  });
}

/** edición → ods → elecciones (null = no hay informe de ese ODS en esa edición). */
export type CoberturaEdiciones = Record<number, Record<number, EleccionMin[] | null>>;

export function useCoberturaTodos(ediciones: number[]): UseQueryResult<CoberturaEdiciones> {
  const lista = [...new Set(ediciones.filter((e) => e > 0))].sort();
  return useQuery({
    queryKey: ["the-impact", "cobertura", lista],
    staleTime: 30_000,
    retry: false,
    enabled: lista.length > 0,
    queryFn: async (): Promise<CoberturaEdiciones> => {
      const falta = new FaltaMigracion("Falta aplicar la migración 0145 (Informes ODS con Pilo).");
      const inf = await tabla("ods_reports").select("id, ods, edition").in("edition", lista);
      if (inf.error) throw noExiste(inf.error) ? falta : new Error(inf.error.message);
      const informes = (inf.data as unknown as { id: string; ods: number; edition: number }[]) ?? [];
      const out: CoberturaEdiciones = {};
      for (const e of lista) out[e] = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, null]));
      for (const i of informes) out[i.edition][i.ods] = [];
      if (!informes.length) return out;
      const sel = await tabla("ods_report_indicators")
        .select("report_id, indicator, news_id, candidates, ask, approved")
        .in(
          "report_id",
          informes.map((i) => i.id),
        );
      if (sel.error) throw noExiste(sel.error) ? falta : new Error(sel.error.message);
      const porId = new Map(informes.map((i) => [i.id, i]));
      for (const f of (sel.data as unknown as Record<string, unknown>[]) ?? []) {
        const i = porId.get(String(f.report_id));
        if (!i) continue;
        out[i.edition][i.ods]!.push({
          indicator: String(f.indicator),
          news_id: (f.news_id as string | null) ?? null,
          candidates: Array.isArray(f.candidates) ? (f.candidates as Candidata[]) : [],
          ask: f.ask && typeof f.ask === "object" && !Array.isArray(f.ask) ? (f.ask as Record<string, string>) : {},
          approved: f.approved === true,
        });
      }
      return out;
    },
  });
}

/* ---------- Escenarios en el navegador ------------------------------------- */

const CLAVE = "rankings.posicion.escenario.v1";

export function leerGuardado<T>(porDefecto: T): T {
  try {
    const t = globalThis.localStorage?.getItem(CLAVE);
    return t ? { ...porDefecto, ...(JSON.parse(t) as Partial<T>) } : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardar<T>(v: T): void {
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: el escenario vive solo en la pestaña */
  }
}
