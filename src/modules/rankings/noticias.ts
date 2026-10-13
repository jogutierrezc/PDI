/* =============================================================================
   Recolector de noticias · datos (migración 0143, función noticias-ods).

   Dos lados:
   · La intranet (Planeación o más) lee y corrige todas las notas: estado y ODS.
   · El público lee solo las aprobadas, con título, extracto, imagen y enlace
     (las políticas de la base lo garantizan, no este archivo).

   Funciones puras al final (agrupar, ordenar, mezclar ODS): sin red, con pruebas.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

export type NewsState = "pending" | "ok" | "no";

export interface NewsOds {
  ods: number;
  score: number;
  reason: string;
  manual: boolean;
}

export interface NewsItem {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  image_url: string | null;
  published_on: string | null;
  section: string;
  campus: string;
  state: NewsState;
  ods: NewsOds[];
}

/** Las fuentes que recorre la función; la clave es la que entiende `noticias-ods`. */
export const NEWS_SOURCES: { key: string; label: string }[] = [
  { key: "comunicaciones", label: "Comunicaciones" },
  { key: "investigacion", label: "Investigación" },
  { key: "extension", label: "Extensión" },
  { key: "bucaramanga", label: "Sede Bucaramanga" },
  { key: "cucuta", label: "Sede Cúcuta" },
  { key: "valledupar", label: "Sede Valledupar" },
  { key: "bogota", label: "Sede Bogotá" },
];

export class FaltaMigracion extends Error {}

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const falta = () => new FaltaMigracion("Falta aplicar la migración 0143 (recolector de noticias).");

interface FilaNota extends Omit<NewsItem, "ods"> {
  news_ods?: NewsOds[] | null;
}

const COLUMNAS_PUBLICAS = "id, url, title, excerpt, image_url, published_on, section, campus, state, news_ods(ods, score, reason, manual)";

const aNota = (f: FilaNota): NewsItem => ({ ...f, ods: (f.news_ods ?? []).slice().sort((a, b) => b.score - a.score) });

/* ---------- Intranet ------------------------------------------------------- */

export function useNewsInbox() {
  return useQuery({
    queryKey: ["noticias", "intranet"],
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<NewsItem[]> => {
      const r = await supabase
        .from("news_items" as never)
        .select(COLUMNAS_PUBLICAS)
        .order("published_on", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (r.error) throw noExiste(r.error) ? falta() : new Error(r.error.message);
      return ((r.data as unknown as FilaNota[] | null) ?? []).map(aNota);
    },
  });
}

export function useSetNewsState() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, state, by }: { id: string; state: NewsState; by: string | null }) => {
      const r = await supabase
        .from("news_items" as never)
        .update({ state, reviewed_by: state === "pending" ? null : by, reviewed_at: state === "pending" ? null : new Date().toISOString() } as never)
        .eq("id", id);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["noticias"] }),
  });
}

/**
 * Cambia el estado de varias notas a la vez (una sola llamada). La bandeja ya
 * pintó el cambio en su caché: si sale bien no se vuelve a pedir la lista de la
 * intranet (son cientos de decisiones al día); si falla, sí, para no mentir.
 */
export function useSetNewsStates() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, state, by }: { ids: string[]; state: NewsState; by: string | null }) => {
      if (!ids.length) return;
      const r = await supabase
        .from("news_items" as never)
        .update({ state, reviewed_by: state === "pending" ? null : by, reviewed_at: state === "pending" ? null : new Date().toISOString() } as never)
        .in("id", ids);
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["noticias"], predicate: (q) => q.queryKey[1] !== "intranet" }),
    onError: () => void cliente.invalidateQueries({ queryKey: ["noticias"] }),
  });
}

/** Agrega o quita un ODS a mano. Una nota siempre conserva al menos uno. */
export function useToggleNewsOds() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ods, on }: { id: string; ods: number; on: boolean }) => {
      if (on) {
        const r = await supabase.from("news_ods" as never).upsert({ news_id: id, ods, score: 100, reason: "Agregado por Planeación", manual: true } as never, { onConflict: "news_id,ods" });
        if (r.error) throw new Error(r.error.message);
      } else {
        const r = await supabase.from("news_ods" as never).delete().eq("news_id", id).eq("ods", ods);
        if (r.error) throw new Error(r.error.message);
      }
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["noticias"] }),
  });
}

export interface RespuestaCarga {
  ok: boolean;
  seen: number;
  saved: number;
  skipped: number;
  next: number;
  fin: boolean;
  error?: string;
}

/** Una vuelta de la carga: la función procesa pocas páginas y dice dónde seguir. */
export async function cargarNoticias(fuente: string, start: number, year: number): Promise<RespuestaCarga> {
  const r = await supabase.functions.invoke("noticias-ods", { body: { action: "cargar", fuente, start, year, pages: 1 } });
  if (r.error) {
    // Un 4xx/5xx trae el mensaje en el cuerpo; sin él, el de la librería.
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string }) : null;
      if (j?.error) mensaje = j.error;
    } catch {
      /* se queda el mensaje general */
    }
    throw new Error(mensaje);
  }
  return r.data as RespuestaCarga;
}

export function useNewsRuns() {
  return useQuery({
    queryKey: ["noticias", "corridas"],
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const r = await supabase.from("news_runs" as never).select("id, started_at, source, seen, saved, skipped, error").order("started_at", { ascending: false }).limit(12);
      if (r.error) throw noExiste(r.error) ? falta() : new Error(r.error.message);
      return (r.data as unknown as { id: string; started_at: string; source: string; seen: number; saved: number; skipped: number; error: string | null }[] | null) ?? [];
    },
  });
}

/* ---------- Público -------------------------------------------------------- */

/** Las notas aprobadas de un ODS (o de todos), de la más reciente a la más antigua. */
export function useApprovedNews(ods?: number) {
  return useQuery({
    queryKey: ["noticias", "publico", ods ?? 0],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<NewsItem[]> => {
      const r = await supabase
        .from("news_items" as never)
        .select(COLUMNAS_PUBLICAS)
        .eq("state", "ok")
        .order("published_on", { ascending: false, nullsFirst: false })
        .limit(600);
      // Sin la migración, o sin red, el informe sigue siendo el mismo: simplemente no hay sección.
      if (r.error) return [];
      const todas = ((r.data as unknown as FilaNota[] | null) ?? []).map(aNota);
      return ods ? todas.filter((n) => n.ods.some((o) => o.ods === ods)) : todas;
    },
  });
}

/* ---------- Funciones puras ------------------------------------------------ */

/** Cuántas notas aprobadas tiene cada ODS. */
export function contarPorOds(notas: NewsItem[]): Record<number, number> {
  const c: Record<number, number> = {};
  for (const n of notas) if (n.state === "ok") for (const o of n.ods) c[o.ods] = (c[o.ods] ?? 0) + 1;
  return c;
}

/** La nota que abre la sección: la de mejor imagen y mayor afinidad con el ODS; el resto, por fecha. */
export function ordenarParaOds(notas: NewsItem[], ods: number): NewsItem[] {
  const afinidad = (n: NewsItem) => n.ods.find((o) => o.ods === ods)?.score ?? 0;
  const porFecha = (a: NewsItem, b: NewsItem) => (b.published_on ?? "").localeCompare(a.published_on ?? "");
  const lista = notas.slice().sort(porFecha);
  const mejor = lista.slice().sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)) || afinidad(b) - afinidad(a))[0];
  return mejor ? [mejor, ...lista.filter((n) => n.id !== mejor.id)] : lista;
}

export const NEWS_STATE_LABEL: Record<NewsState, string> = { pending: "Por revisar", ok: "Aprobadas", no: "Descartadas" };
