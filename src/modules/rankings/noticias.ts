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
import type { PerfilId } from "./perfiles";

export type NewsState = "pending" | "ok" | "no";

export interface NewsOds {
  ods: number;
  score: number;
  reason: string;
  manual: boolean;
  /** 0144: el indicador de THE que propuso Pilo («13.2») y si la fila es de Pilo. Solo en la intranet. */
  indicator?: string | null;
  by_ai?: boolean;
}

/**
 * 0242: un tema de la nota en un perfil de ranking: «ods13», un pilar («ens»), una
 * categoría («SI») o «propio» (una palabra propia del perfil). Las notas del perfil
 * ODS lo traen de news_ods; las demás, de news_temas.
 */
export interface NewsTema {
  tema: string;
  score: number;
  reason: string;
  manual: boolean;
  indicator?: string | null;
  by_ai?: boolean;
}

/** 0144: la lectura de Mr. Pilo (función noticias-pilo). Solo en la intranet; el público no recibe estas columnas. */
export type NewsAiStatus = "none" | "pendiente" | "hecho" | "error";

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
  /** 0242: los temas en el perfil que se mira. Sin esto (informes, pruebas), los de `ods`. */
  temas?: NewsTema[];
  ai_status?: NewsAiStatus;
  ai_decision?: "aprobar" | "revisar" | "descartar" | null;
  ai_summary?: string | null;
  ai_confidence?: number | null;
  ai_error?: string | null;
  ai_at?: string | null;
  decided_by?: "persona" | "pilo" | null;
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
/** Falta la migración 0242 (perfiles del recolector): lo de ODS sigue como siempre. */
export class FaltaPerfiles extends FaltaMigracion {}

/** Los temas de una nota: los del perfil que se mira o, si no los trae, sus ODS como «odsN». */
export const temasDe = (n: NewsItem): NewsTema[] =>
  n.temas ?? n.ods.map((o) => ({ tema: `ods${o.ods}`, score: o.score, reason: o.reason, manual: o.manual, indicator: o.indicator, by_ai: o.by_ai }));

const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const falta = () => new FaltaMigracion("Falta aplicar la migración 0143 (recolector de noticias).");

interface FilaNota extends Omit<NewsItem, "ods"> {
  news_ods?: NewsOds[] | null;
}

const COLUMNAS_PUBLICAS = "id, url, title, excerpt, image_url, published_on, section, campus, state, news_ods(ods, score, reason, manual)";

/** La intranet también lee la lectura de Pilo (0144). Sin esa migración, las de siempre. */
const COLUMNAS_INTRANET =
  "id, url, title, excerpt, image_url, published_on, section, campus, state, ai_status, ai_decision, ai_summary, ai_confidence, ai_error, ai_at, decided_by, news_ods(ods, score, reason, manual, indicator, by_ai)";
const faltaColumna = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === "42703" || /column .* does not exist/i.test(e.message ?? "")));

const aNota = (f: FilaNota): NewsItem => ({ ...f, ods: (f.news_ods ?? []).slice().sort((a, b) => b.score - a.score) });

/* ---------- Intranet ------------------------------------------------------- */

/** La llave de la bandeja de un perfil (la caché que la pantalla pinta al instante al decidir). */
export const llaveIntranet = (perfil: PerfilId = "ods") => ["noticias", "intranet", perfil];

const PAGINA_BASE = 1000;
const TOPE_NOTAS = 2000;

/** Lee por páginas de 1000 (el tope de filas de la API) hasta `tope` filas. */
async function paginar<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>, tope = TOPE_NOTAS): Promise<{ filas: T[]; error: { code?: string; message?: string } | null }> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA_BASE) {
    const r = await pedir(desde, Math.min(tope, desde + PAGINA_BASE) - 1);
    if (r.error) return { filas, error: r.error };
    const lote = (r.data as T[] | null) ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA_BASE) break;
  }
  return { filas, error: null };
}

interface FilaTema {
  news_id: string;
  tema: string;
  score: number;
  reason: string;
  manual: boolean;
  indicator: string | null;
  by_ai: boolean;
}

/** Los temas de un perfil guardados en news_temas, por nota. Sin la tabla (sin 0242), ninguno. */
async function temasDelPerfil(perfil: PerfilId, soloPropio: boolean): Promise<Map<string, NewsTema[]>> {
  const r = await paginar<FilaTema>((d, h) => {
    const q = supabase.from("news_temas" as never).select("news_id, tema, score, reason, manual, indicator, by_ai").eq("profile", perfil);
    return (soloPropio ? q.eq("tema", "propio") : q).range(d, h);
  }, 8000);
  const m = new Map<string, NewsTema[]>();
  if (r.error) return m;
  for (const f of r.filas) m.set(f.news_id, [...(m.get(f.news_id) ?? []), { tema: f.tema, score: f.score, reason: f.reason, manual: f.manual, indicator: f.indicator, by_ai: f.by_ai }]);
  return m;
}

const porAfinidad = (a: NewsTema, b: NewsTema) => b.score - a.score;

/**
 * La bandeja de un perfil. El de ODS es la de siempre (news_items y news_ods) más las
 * coincidencias con sus palabras propias; los demás leen la decisión de cada nota de
 * news_profile_notes (0242) y sus temas de news_temas.
 */
export function useNewsInbox(perfil: PerfilId = "ods", { activo = true }: { activo?: boolean } = {}) {
  return useQuery({
    queryKey: llaveIntranet(perfil),
    enabled: activo,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<NewsItem[]> => {
      if (perfil !== "ods") {
        const r = await paginar<{ news_id: string; state: NewsState; decided_by: NewsItem["decided_by"]; ai_status: NewsAiStatus; ai_decision: NewsItem["ai_decision"]; ai_summary: string | null; ai_confidence: number | null; ai_error: string | null; ai_at: string | null; news_items: Omit<NewsItem, "ods" | "state"> }>((d, h) =>
          supabase
            .from("news_profile_notes" as never)
            .select("news_id, state, decided_by, ai_status, ai_decision, ai_summary, ai_confidence, ai_error, ai_at, news_items!inner(id, url, title, excerpt, image_url, published_on, section, campus)")
            .eq("profile", perfil)
            .order("created_at", { ascending: false })
            .range(d, h),
        );
        if (r.error) throw noExiste(r.error) ? new FaltaPerfiles("Falta aplicar la migración 0242 (perfiles del recolector).") : new Error(r.error.message);
        const temas = await temasDelPerfil(perfil, false);
        return r.filas.map((f) => ({
          ...f.news_items,
          state: f.state,
          decided_by: f.decided_by,
          ai_status: f.ai_status,
          ai_decision: f.ai_decision,
          ai_summary: f.ai_summary,
          ai_confidence: f.ai_confidence,
          ai_error: f.ai_error,
          ai_at: f.ai_at,
          ods: [],
          temas: (temas.get(f.news_id) ?? []).sort(porAfinidad),
        }));
      }
      const pedir = (columnas: string) =>
        supabase
          .from("news_items" as never)
          .select(columnas)
          .order("published_on", { ascending: false, nullsFirst: false })
          .limit(2000);
      let r = await pedir(COLUMNAS_INTRANET);
      if (r.error && faltaColumna(r.error)) r = await pedir(COLUMNAS_PUBLICAS);
      if (r.error) throw noExiste(r.error) ? falta() : new Error(r.error.message);
      const notas = ((r.data as unknown as FilaNota[] | null) ?? []).map(aNota);
      const propias = await temasDelPerfil("ods", true);
      return notas.map((n) => ({ ...n, temas: [...temasDe(n), ...(propias.get(n.id) ?? [])].sort(porAfinidad) }));
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
    mutationFn: async ({ ids, state, by, perfil = "ods" }: { ids: string[]; state: NewsState; by: string | null; perfil?: PerfilId }) => {
      if (!ids.length) return;
      const cambio = { state, reviewed_by: state === "pending" ? null : by, reviewed_at: state === "pending" ? null : new Date().toISOString() } as never;
      // La decisión es de cada perfil: en los demás, vive en news_profile_notes (0242).
      const r =
        perfil === "ods"
          ? await supabase.from("news_items" as never).update(cambio).in("id", ids)
          : await supabase.from("news_profile_notes" as never).update(cambio).eq("profile", perfil).in("news_id", ids);
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

/** Agrega o quita un tema a mano en un perfil. En ODS es un ODS; en los demás, una fila de news_temas (0242). */
export function useToggleNewsTema() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, perfil, tema, on }: { id: string; perfil: PerfilId; tema: string; on: boolean }) => {
      if (perfil === "ods" && /^ods\d+$/.test(tema)) {
        const ods = Number(tema.slice(3));
        if (on) {
          const r = await supabase.from("news_ods" as never).upsert({ news_id: id, ods, score: 100, reason: "Agregado por Planeación", manual: true } as never, { onConflict: "news_id,ods" });
          if (r.error) throw new Error(r.error.message);
        } else {
          const r = await supabase.from("news_ods" as never).delete().eq("news_id", id).eq("ods", ods);
          if (r.error) throw new Error(r.error.message);
        }
        return;
      }
      if (on) {
        const r = await supabase.from("news_temas" as never).upsert({ news_id: id, profile: perfil, tema, score: 100, reason: "Agregado por Planeación", manual: true } as never, { onConflict: "news_id,profile,tema" });
        if (r.error) throw new Error(r.error.message);
      } else {
        const r = await supabase.from("news_temas" as never).delete().eq("news_id", id).eq("profile", perfil).eq("tema", tema);
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
