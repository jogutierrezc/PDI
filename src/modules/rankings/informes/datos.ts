/* =============================================================================
   Informes ODS con Pilo · datos (migraciones 0145 y 0146, función pilo-rankingsod).

   0146: español e inglés en cada párrafo, subtítulo temático, imágenes de las
   notas (Pilo solo elige; no crea), libro de cifras, ficha y pre-evaluación
   por indicador, otras fuentes (Impacto, UDES en Cifras, proyectos del PDI),
   registro de actividades con TODAS las notas y proveedor de IA propio de los
   rankings (igual que Pilo o Mistral). Las lecturas van por páginas: nada se
   trunca.

   · Intranet (Planeación o más): useInforme y las mutaciones de bloques,
     fotos, elecciones, ajustes y estado. Las políticas de la base deciden
     quién escribe; este archivo no lo vigila.
   · Pilo: piloInformeEstado, piloPlan, piloRedactar, piloIndicador, piloFotos
     (una llamada a la función; la clave del proveedor nunca llega aquí) y
     usePiloInforme, el ciclo imágenes → cifras → plan → párrafos (es+en) →
    fotos → indicadores (ficha) → evaluar → traducir.
   · Público: usePublicInforme y useEvidenciaPublica (solo lo publicado).
   · Funciones puras al final, con pruebas en datos.test.ts.

   Sin la migración 0145, la intranet recibe FaltaMigracion y el portal, null.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { ODS_LIST } from "../../sostenible/ods-data";
import { FaltaMigracion } from "../noticias";
import { ErrorPilo } from "../pilo-noticias";
import { fichaCompleta, idiomaPreferido, leerFicha, paginaEvidencia, textoEnIdioma, type FichaEvidencia, type Idioma, type PaginaEvidencia } from "./pagina";
import {
  SECCIONES,
  type CifraNota,
  type Evaluacion,
  type ImagenNota,
  type RegistroActividad,
  type AjustesInforme,
  type Bloque,
  type Candidata,
  type Cifra,
  type EleccionIndicador,
  type EstadoInforme,
  type Foto,
  type Fuente,
  type IndicadorTHE,
  type Informe,
  type InformeCompleto,
  type InformePublico,
  type Seccion,
} from "./tipos";
import { anioDeNoticias, rangoFechasDeAnio } from "./anios";

export { ErrorPilo, fichaCompleta, idiomaPreferido, paginaEvidencia, textoEnIdioma };
export type { FichaEvidencia, Idioma, PaginaEvidencia };

const MIGRACION_0145 = "Falta aplicar la migración 0145 (Informes ODS con Pilo).";
const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(e.message ?? "")));
const fallo = (e: { code?: string; message?: string }) => (noExiste(e) ? new FaltaMigracion(MIGRACION_0145) : new Error(e.message ?? "Error de la base."));

const tabla = (t: "ods_reports" | "ods_report_blocks" | "ods_report_photos" | "ods_report_indicators" | "news_ods" | "news_images" | "news_figures" | "news_items" | "news_settings") =>
  supabase.from(t as never);

const PAGINA = 1000;
/** Todas las filas de una consulta, por páginas de 1.000: nada se trunca. */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}
const trozos = <T>(xs: T[], n = 150): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function quienSoy(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/* ---------- Filas → tipos --------------------------------------------------- */

const AJUSTES_DE_PARTIDA: AjustesInforme = { tone: "cercano", person: "nosotros" };

/** Tono y persona (y, con 0146, `vision` solo si está encendida). */
export function leerAjustes(s: unknown): AjustesInforme {
  const o = (s ?? {}) as Record<string, unknown>;
  const base: AjustesInforme = { tone: o.tone === "institucional" ? "institucional" : "cercano", person: o.person === "tercera" ? "tercera" : "nosotros" };
  return o.vision === true ? { ...base, vision: true } : base;
}

const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const aInforme = (f: Record<string, unknown>): Informe => ({
  id: String(f.id),
  ods: Number(f.ods),
  edition: Number(f.edition),
  state: (f.state as EstadoInforme) ?? "borrador",
  settings: leerAjustes(f.settings),
  updated_at: String(f.updated_at ?? ""),
});

const aBloque = (f: Record<string, unknown>): Bloque => ({
  id: String(f.id),
  report_id: String(f.report_id),
  sec: f.sec as Seccion,
  pos: Number(f.pos ?? 0),
  origin: (f.origin as Bloque["origin"]) ?? "persona",
  text: String(f.text ?? ""),
  orig: String(f.orig ?? ""),
  sources: lista<Fuente>(f.sources),
  figs: lista<Cifra>(f.figs),
  warn: (f.warn as string | null) ?? null,
  enabled: f.enabled !== false,
  spare: f.spare === true,
  text_en: String(f.text_en ?? ""),
  orig_en: String(f.orig_en ?? ""),
  heading: String(f.heading ?? ""),
  heading_en: String(f.heading_en ?? ""),
});

const RECORTE: Foto["crop"] = { fx: 0.5, fy: 0.35, ratio: "16:9" };

const aFoto = (f: Record<string, unknown>): Foto => ({
  report_id: String(f.report_id),
  news_id: String(f.news_id),
  use: f.use === true,
  slot: (f.slot as Foto["slot"]) ?? "galeria",
  caption: String(f.caption ?? ""),
  alt: String(f.alt ?? ""),
  credit: String(f.credit ?? ""),
  kind: f.kind === "grafica" ? "grafica" : "foto",
  minors: f.minors === true,
  cleared: f.cleared === true,
  crop: { ...RECORTE, ...((f.crop as Partial<Foto["crop"]>) ?? {}) },
  image_id: (f.image_id as string | null) ?? null,
});

const aEleccion = (f: Record<string, unknown>): EleccionIndicador => ({
  report_id: String(f.report_id),
  indicator: String(f.indicator),
  news_id: (f.news_id as string | null) ?? null,
  candidates: lista<Candidata>(f.candidates),
  ask: (f.ask && typeof f.ask === "object" && !Array.isArray(f.ask) ? f.ask : {}) as Record<string, string>,
  page_es: lista<string>(f.page_es),
  page_en: String(f.page_en ?? ""),
  approved: f.approved === true,
  ficha: f.ficha && typeof f.ficha === "object" && Object.keys(f.ficha).length ? leerFicha(f.ficha) : {},
  eval: f.eval && typeof f.eval === "object" && (f.eval as Evaluacion).grade ? (f.eval as Evaluacion) : null,
});

/* ---------- Intranet: lectura --------------------------------------------- */

async function cargarCompleto(fila: Record<string, unknown>): Promise<InformeCompleto> {
  const id = String(fila.id);
  const leer = (t: "ods_report_blocks" | "ods_report_photos" | "ods_report_indicators") =>
    todas<Record<string, unknown>>((a, z) => tabla(t).select("*").eq("report_id", id).range(a, z)).catch((e) => {
      throw fallo(e as { code?: string; message?: string });
    });
  const [b, f, e] = await Promise.all([leer("ods_report_blocks"), leer("ods_report_photos"), leer("ods_report_indicators")]);
  return {
    informe: aInforme(fila),
    bloques: ordenarBloques(b.map(aBloque)),
    fotos: f.map(aFoto),
    elecciones: e.map(aEleccion).sort((x, y) => x.indicator.localeCompare(y.indicator, "es", { numeric: true })),
  };
}

async function completoPorId(id: string): Promise<InformeCompleto | null> {
  const r = await tabla("ods_reports").select("*").eq("id", id).maybeSingle();
  if (r.error) throw fallo(r.error);
  return r.data ? cargarCompleto(r.data as unknown as Record<string, unknown>) : null;
}

/** Todo un informe para la intranet; null si aún no existe. */
export function useInforme(ods: number, edition: number): UseQueryResult<InformeCompleto | null> {
  return useQuery({
    queryKey: ["informe", ods, edition],
    staleTime: 15_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17 && edition > 0,
    queryFn: async (): Promise<InformeCompleto | null> => {
      const r = await tabla("ods_reports").select("*").eq("ods", ods).eq("edition", edition).maybeSingle();
      if (r.error) throw fallo(r.error);
      return r.data ? cargarCompleto(r.data as unknown as Record<string, unknown>) : null;
    },
  });
}

/** Una noticia aprobada con el ODS, con su texto (solo la intranet la lee entera). */
export interface NoticiaOds {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  body: string;
  image_url: string | null;
  published_on: string | null;
  section: string;
  campus: string;
  /** Afinidad con el ODS (0 a 100). */
  score: number;
  reason: string;
  /** 0146: título y extracto en inglés ('' si aún no hay). */
  title_en?: string;
  excerpt_en?: string;
}

/**
 * Las notas aprobadas del ODS. Con `edicion`, solo las publicadas en su año de
 * noticias (la de 2025 va a la edición 2026); sin ella, todas (como antes).
 */
function notasDeOds(ods: number, columnas: string, edicion?: number) {
  const base = tabla("news_ods").select(`news_id, ${columnas}`).eq("ods", ods).eq("news_items.state", "ok");
  if (!edicion) return base;
  const { desde, hasta } = rangoFechasDeAnio(anioDeNoticias(edicion));
  return base.gte("news_items.published_on", desde).lt("news_items.published_on", hasta);
}

export function useNoticiasDeOds(ods: number, edicion?: number): UseQueryResult<NoticiaOds[]> {
  return useQuery({
    queryKey: ["informe", "noticias", ods, edicion ?? 0],
    staleTime: 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17,
    queryFn: async (): Promise<NoticiaOds[]> => {
      type Fila = { score: number; reason: string; news_items: Omit<NoticiaOds, "score" | "reason"> | null };
      const pedir = (columnas: string) =>
        todas<Fila>((a, z) => notasDeOds(ods, `score, reason, news_items!inner(${columnas})`, edicion).order("news_id").range(a, z));
      const BASE = "id, url, title, excerpt, body, image_url, published_on, section, campus, state";
      let filas: Fila[];
      try {
        filas = await pedir(`${BASE}, title_en, excerpt_en`);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        // Sin 0146 no hay inglés: las de siempre.
        if (err.code === "42703" || /title_en|excerpt_en/.test(err.message ?? "")) filas = await pedir(BASE);
        else throw noExiste(err) ? new FaltaMigracion("Falta aplicar la migración 0143 (recolector de noticias).") : new Error(err.message);
      }
      return filas
        .filter((f) => f.news_items)
        .map((f) => {
          const n = f.news_items!;
          return {
            id: n.id,
            url: n.url,
            title: n.title,
            excerpt: n.excerpt ?? "",
            body: n.body ?? "",
            image_url: n.image_url ?? null,
            published_on: n.published_on ?? null,
            section: n.section ?? "",
            campus: n.campus ?? "",
            score: Number(f.score ?? 0),
            reason: f.reason ?? "",
            title_en: n.title_en ?? "",
            excerpt_en: n.excerpt_en ?? "",
          };
        })
        .sort((a, b) => b.score - a.score || String(b.published_on ?? "").localeCompare(String(a.published_on ?? "")));
    },
  });
}

/* ---------- Intranet: escritura ------------------------------------------- */

function useRefrescar() {
  const cliente = useQueryClient();
  return useCallback(() => void cliente.invalidateQueries({ queryKey: ["informe"] }), [cliente]);
}

/** Los tres párrafos de partida, escritos por una persona (sin IA): tesis, cifras y lo que viene. */
export function bloquesDePartida(ods: number): Pick<Bloque, "sec" | "pos" | "origin" | "text" | "orig" | "sources" | "figs" | "warn">[] {
  const o = ODS_LIST[ods - 1];
  if (!o) return [];
  const [a, b] = o.figures;
  // Las cifras reales de ods-data salen de los informes 2025 publicados; las demás son de muestra.
  const src = o.real ? "Informe 2025" : "Dato ilustrativo (ods-data): reemplázalo";
  const cifras = `Dos cifras sostienen esta tesis: ${a.value} ${a.unit} ${a.label} y ${b.value} ${b.unit} ${b.label}.`;
  const base = { origin: "persona" as const, sources: [] as Fuente[] };
  return [
    { ...base, sec: "tesis", pos: 0, text: o.thesis, orig: o.thesis, figs: [], warn: null },
    {
      ...base,
      sec: "cifras",
      pos: 0,
      text: cifras,
      orig: cifras,
      figs: [
        { v: a.value, label: `${a.unit} ${a.label}`, src },
        { v: b.value, label: `${b.unit} ${b.label}`, src },
      ],
      warn: o.real ? null : "Estas cifras son ilustrativas: reemplázalas por las reales antes de publicar.",
    },
    { ...base, sec: "viene", pos: 0, text: `La UDES prevé ${o.next}`, orig: `La UDES prevé ${o.next}`, figs: [], warn: null },
  ];
}

export function useCrearInforme() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async ({ ods, edition }: { ods: number; edition: number }): Promise<Informe> => {
      const by = await quienSoy();
      const r = await tabla("ods_reports")
        .insert({ ods, edition, state: "borrador", settings: AJUSTES_DE_PARTIDA, updated_by: by } as never)
        .select("*")
        .single();
      if (r.error) {
        // Otra persona lo creó al mismo tiempo: se devuelve el que existe.
        if (r.error.code === "23505") {
          const ya = await tabla("ods_reports").select("*").eq("ods", ods).eq("edition", edition).single();
          if (ya.error) throw fallo(ya.error);
          return aInforme(ya.data as unknown as Record<string, unknown>);
        }
        throw fallo(r.error);
      }
      const informe = aInforme(r.data as unknown as Record<string, unknown>);
      const semillas = bloquesDePartida(ods).map((b) => ({ ...b, report_id: informe.id, updated_by: by }));
      if (semillas.length) {
        const s = await tabla("ods_report_blocks").insert(semillas as never);
        if (s.error) throw fallo(s.error);
      }
      return informe;
    },
    onSuccess: refrescar,
  });
}

/** Tono y persona del informe. Conserva lo demás de settings (el plan de Pilo). */
export function useGuardarAjustes() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async ({ id, settings }: { id: string; settings: Partial<AjustesInforme> }) => {
      const actual = await tabla("ods_reports").select("settings").eq("id", id).single();
      if (actual.error) throw fallo(actual.error);
      const previos = ((actual.data as unknown as { settings: Record<string, unknown> | null })?.settings ?? {}) as Record<string, unknown>;
      const nuevos = { ...previos, ...leerAjustes({ ...previos, ...settings }) };
      const r = await tabla("ods_reports")
        .update({ settings: nuevos, updated_by: await quienSoy() } as never)
        .eq("id", id);
      if (r.error) throw fallo(r.error);
    },
    onSuccess: refrescar,
  });
}

const CAMPOS_BLOQUE = ["sec", "pos", "origin", "text", "orig", "sources", "figs", "warn", "enabled", "spare", "text_en", "orig_en", "heading", "heading_en"] as const;

export function useGuardarBloque() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async (b: Partial<Bloque> & { id: string }): Promise<Bloque> => {
      const cambios: Record<string, unknown> = { updated_by: await quienSoy() };
      for (const k of CAMPOS_BLOQUE) if (b[k] !== undefined) cambios[k] = b[k];
      const r = await tabla("ods_report_blocks")
        .update(cambios as never)
        .eq("id", b.id)
        .select("*")
        .single();
      if (r.error) throw fallo(r.error);
      return aBloque(r.data as unknown as Record<string, unknown>);
    },
    onSuccess: refrescar,
  });
}

export function useAgregarBloque() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async (b: Pick<Bloque, "report_id" | "sec"> & Partial<Bloque>): Promise<Bloque> => {
      const ultimas = await tabla("ods_report_blocks").select("pos").eq("report_id", b.report_id).eq("sec", b.sec).order("pos", { ascending: false }).limit(1);
      if (ultimas.error) throw fallo(ultimas.error);
      const pos = (((ultimas.data as unknown as { pos: number }[]) ?? [])[0]?.pos ?? -1) + 1;
      const text = b.text ?? "";
      const r = await tabla("ods_report_blocks")
        .insert({
          report_id: b.report_id,
          sec: b.sec,
          pos,
          origin: "persona",
          text,
          orig: b.orig ?? text,
          sources: b.sources ?? [],
          figs: b.figs ?? [],
          warn: b.warn ?? null,
          enabled: b.enabled ?? true,
          spare: b.spare ?? false,
          ...(b.text_en !== undefined ? { text_en: b.text_en, orig_en: b.orig_en ?? b.text_en } : {}),
          ...(b.heading !== undefined ? { heading: b.heading, heading_en: b.heading_en ?? "" } : {}),
          updated_by: await quienSoy(),
        } as never)
        .select("*")
        .single();
      if (r.error) throw fallo(r.error);
      return aBloque(r.data as unknown as Record<string, unknown>);
    },
    onSuccess: refrescar,
  });
}

/** Quita un párrafo del informe (enabled = false); no lo borra. Acepta el id o el bloque. */
export function useQuitarBloque() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async (b: string | { id: string }) => {
      const id = typeof b === "string" ? b : b.id;
      const r = await tabla("ods_report_blocks")
        .update({ enabled: false, updated_by: await quienSoy() } as never)
        .eq("id", id);
      if (r.error) throw fallo(r.error);
    },
    onSuccess: refrescar,
  });
}

export function useGuardarFoto() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async (f: Foto) => {
      const fila = { report_id: f.report_id, news_id: f.news_id, use: f.use, slot: f.slot, caption: f.caption, alt: f.alt, credit: f.credit, kind: f.kind, minors: f.minors, cleared: f.cleared, crop: f.crop };
      // 0146: la clave es (report_id, photo_key = coalesce(image_id, news_id)). Sin 0146, la de 0145.
      let r = await tabla("ods_report_photos").upsert({ ...fila, image_id: f.image_id ?? null } as never, { onConflict: "report_id,photo_key" });
      if (r.error && /photo_key|image_id|42703|42P10/.test(`${r.error.code} ${r.error.message}`)) r = await tabla("ods_report_photos").upsert(fila as never, { onConflict: "report_id,news_id" });
      if (r.error) throw fallo(r.error);
    },
    onSuccess: refrescar,
  });
}

const CAMPOS_ELECCION = ["news_id", "candidates", "ask", "page_es", "page_en", "approved", "ficha", "eval"] as const;

export function useGuardarEleccion() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: async (e: Partial<EleccionIndicador> & { report_id: string; indicator: string }) => {
      const fila: Record<string, unknown> = { report_id: e.report_id, indicator: e.indicator };
      for (const k of CAMPOS_ELECCION) if (e[k] !== undefined) fila[k] = e[k];
      const r = await tabla("ods_report_indicators").upsert(fila as never, { onConflict: "report_id,indicator" });
      if (r.error) throw fallo(r.error);
    },
    onSuccess: refrescar,
  });
}

/**
 * Cambia el estado. Para publicar, primero verifica que no haya párrafos con
 * cifras sin fuente ni fotos con menores sin autorización: si los hay, no
 * cambia nada y devuelve los motivos (ok = false).
 */
export function useCambiarEstadoInforme() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, state }: { id: string; state: EstadoInforme }): Promise<{ ok: boolean; motivos: string[] }> => {
      if (state === "publicado") {
        const completo = await completoPorId(id);
        if (!completo) return { ok: false, motivos: ["El informe no existe."] };
        const v = puedePublicar(completo);
        if (!v.ok) return v;
      }
      const r = await tabla("ods_reports")
        .update({ state, updated_by: await quienSoy() } as never)
        .eq("id", id);
      if (r.error) throw fallo(r.error);
      return { ok: true, motivos: [] };
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["informe"] });
      void cliente.invalidateQueries({ queryKey: ["informe-publico"] });
    },
  });
}

/* ---------- Intranet: imágenes y cifras de las notas del ODS (0146) --------- */

/** Las imágenes de las notas aprobadas del ODS (news_images), por nota y posición. */
export function useImagenesDeOds(ods: number, edicion?: number): UseQueryResult<ImagenNota[]> {
  return useQuery({
    queryKey: ["informe", "imagenes", ods, edicion ?? 0],
    staleTime: 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17,
    queryFn: async (): Promise<ImagenNota[]> => {
      try {
        const ids = (await todas<{ news_id: string }>((a, z) => notasDeOds(ods, "news_items!inner(state)", edicion).order("news_id").range(a, z))).map((f) => f.news_id);
        const out: ImagenNota[] = [];
        for (const t of trozos(ids)) out.push(...(await todas<ImagenNota>((a, z) => tabla("news_images").select("id, news_id, url, width, height, caption, credit, pos, is_cover, kind, minors, alt").in("news_id", t).order("pos").range(a, z))));
        return out;
      } catch (e) {
        throw noExiste(e as { code?: string; message?: string }) ? new FaltaMigracion("Falta aplicar la migración 0146 (imágenes de las notas).") : e;
      }
    },
  });
}

/** El libro de cifras de las notas aprobadas del ODS (news_figures), de la mejor a la peor. */
export function useCifrasDeOds(ods: number, edicion?: number): UseQueryResult<CifraNota[]> {
  return useQuery({
    queryKey: ["informe", "cifras", ods, edicion ?? 0],
    staleTime: 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17,
    queryFn: async (): Promise<CifraNota[]> => {
      try {
        const ids = (await todas<{ news_id: string }>((a, z) => notasDeOds(ods, "news_items!inner(state)", edicion).order("news_id").range(a, z))).map((f) => f.news_id);
        const out: CifraNota[] = [];
        for (const t of trozos(ids)) out.push(...(await todas<CifraNota>((a, z) => tabla("news_figures").select("id, news_id, value, num, unit, label, quote, kind, score, checked").in("news_id", t).range(a, z))));
        return out.sort((a, b) => b.score - a.score);
      } catch (e) {
        throw noExiste(e as { code?: string; message?: string }) ? new FaltaMigracion("Falta aplicar la migración 0146 (libro de cifras).") : e;
      }
    },
  });
}

/* ---------- Proveedor de IA de los rankings (news_settings, 0146) ------------ */

export interface AjustesRankingsIA {
  /** «pilo»: el mismo de Mr. Pilo. «mistral»: Mistral con la clave guardada para Mr. Pilo. */
  ai_provider: "pilo" | "mistral";
  /** '' = el del proveedor («mistral-small-latest» con Mistral; también «mistral-large-latest»). */
  ai_model: string;
  /** '' = sin visión; con Mistral, «pixtral-12b-2409». */
  ai_vision_model: string;
  /** Notas o párrafos por llamada; 0 = automático (5 con Mistral, 2 con NVIDIA y los demás). */
  ai_batch: number;
}

export const AJUSTES_IA_DE_PARTIDA: AjustesRankingsIA = { ai_provider: "pilo", ai_model: "", ai_vision_model: "", ai_batch: 0 };
export const MODELOS_MISTRAL = ["mistral-small-latest", "mistral-large-latest"];
export const VISION_MISTRAL = "pixtral-12b-2409";

/** Los ajustes, leídos con cuidado (lo mismo que hace la función). */
export function leerAjustesRankingsIA(f: Record<string, unknown> | null | undefined): AjustesRankingsIA {
  const lote = Math.floor(Number(f?.ai_batch));
  return {
    ai_provider: f?.ai_provider === "mistral" ? "mistral" : "pilo",
    ai_model: typeof f?.ai_model === "string" ? f.ai_model.trim() : "",
    ai_vision_model: typeof f?.ai_vision_model === "string" ? f.ai_vision_model.trim() : "",
    ai_batch: Number.isFinite(lote) && lote >= 0 && lote <= 8 ? lote : 0,
  };
}

/** Planeación los lee; la base solo deja cambiarlos a la administración. */
export function useAjustesRankingsIA(): UseQueryResult<AjustesRankingsIA> {
  return useQuery({
    queryKey: ["informe", "ajustes-ia"],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const r = await tabla("news_settings").select("ai_provider, ai_model, ai_vision_model, ai_batch").eq("id", 1).maybeSingle();
      if (r.error) {
        if (noExiste(r.error)) return AJUSTES_IA_DE_PARTIDA;
        throw new Error(r.error.message);
      }
      return leerAjustesRankingsIA(r.data as unknown as Record<string, unknown> | null);
    },
  });
}

export function useGuardarAjustesRankingsIA() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: Partial<AjustesRankingsIA>) => {
      const v = leerAjustesRankingsIA({ ...AJUSTES_IA_DE_PARTIDA, ...a });
      const r = await tabla("news_settings").update(v as never).eq("id", 1);
      if (r.error) {
        if (r.error.code === "42501" || /Solo la administración/.test(r.error.message)) throw new Error("Solo la administración cambia el proveedor de IA de los rankings.");
        throw noExiste(r.error) ? new FaltaMigracion("Falta aplicar la migración 0146 (proveedor de IA de los rankings).") : new Error(r.error.message);
      }
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["informe", "ajustes-ia"] });
      void cliente.invalidateQueries({ queryKey: ["pilo-rankingsod"] });
      void cliente.invalidateQueries({ queryKey: ["noticias"] });
    },
  });
}

/* ---------- Pilo (función pilo-rankingsod) -------------------------------- */

export interface EstadoFuente {
  conectada: boolean;
  nota: string;
}

export interface EstadoPiloInforme {
  ok: boolean;
  /** ¿Está lista la IA de los rankings? */
  ai: boolean;
  /** Lo mismo que `ai`, para las pantallas que preguntan «¿está lista?». */
  lista: boolean;
  motivo?: string;
  /** Con `ods`: los indicadores de THE de ese ODS que se arman con noticias. */
  indicadores?: string[];
  /** 0146: lo que se usa: «pilo» o «mistral», el proveedor real, el modelo, el de visión y el lote. */
  eleccion?: "pilo" | "mistral";
  proveedor?: string;
  modelo?: string;
  vision?: string | null;
  lote?: number;
  /** 0146: qué fuentes están conectadas (noticia, impacto, cifras, proyecto, documento). */
  fuentes?: Record<string, EstadoFuente>;
}

export interface TemaPlan {
  id: string;
  heading: string;
  heading_en: string;
  indicador: string | null;
  notas: string[];
  grupos: string[][];
  nombrado: boolean;
}

export interface PlanPilo {
  /** 0146: todas las notas en temas. */
  temas?: TemaPlan[];
  hicimos: string[];
  proyectos: string[];
  cifras: string[];
  /** Siempre vacío desde 0146: ninguna nota se descarta. */
  descartadas: { news_id: string; razon: string }[];
  /** Notas que no lograron un párrafo verificable, con el motivo (siguen en el registro). */
  fallidas?: { news_id: string; motivo: string }[];
  at?: string;
}
export interface RespuestaPlan {
  ok: boolean;
  plan: PlanPilo;
  indicadores: string[];
  temas?: number;
  notas?: number;
  /** Lotes de temas que Pilo aún no nombra. */
  quedan?: number;
  avisos?: string[];
}
export interface RespuestaRedactar {
  ok: boolean;
  escritos: number;
  bloques: string[];
  /** Siempre 0 desde 0146 (solo los duplicados quedan de reserva). */
  reserva: number;
  /** Grupos (o fuentes) de la sección que aún faltan. */
  quedan: number;
  fallos: { notas: string[]; motivo: string }[];
  motivo?: string;
  /** 0146: el tema del último párrafo («tema 3 de 11»). */
  tema?: { indice: number; total: number; heading: string } | null;
  cubiertas?: number;
  total_notas?: number;
  fallidas?: number;
  avisos?: string[];
}
export interface RespuestaIndicador {
  ok: boolean;
  news_id: string | null;
  candidatas: number;
  page_es: string[];
  page_en: string;
  ficha?: FichaEvidencia | null;
  motivo?: string;
}
export interface RespuestaFotos {
  ok: boolean;
  propuestas: number;
  /** 0146 */
  en_uso?: number;
  menores: number;
  graficas: number;
  vision?: boolean;
  /** «Pilo no ve las imágenes…» o el aviso de visión. */
  aviso: string;
  avisos?: string[];
}
export interface RespuestaCifras {
  ok: boolean;
  extraidas: number;
  confirmadas: number;
  /** Cifras que Pilo aún no revisa. */
  quedan: number;
  motivo?: string;
}
export interface RespuestaEvaluar {
  ok: boolean;
  eval: Evaluacion;
}
export interface RespuestaMejorar {
  ok: boolean;
  antes: { ficha: Partial<FichaEvidencia>; eval: Evaluacion | null };
  despues: { ficha: FichaEvidencia; eval: Evaluacion | null };
}
export interface RespuestaTraducir {
  ok: boolean;
  bloques: number;
  noticias: number;
  fallos: { ref: string; error: string }[];
  quedan: number;
}
export interface RespuestaImagenes {
  ok: boolean;
  seen: number;
  saved: number;
  next: number;
  fin: boolean;
}

async function invocarEn<T>(funcion: string, body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke(funcion, { body });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = r.error.message;
    let code = "";
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      code = j?.code ?? "";
    } catch {
      /* se queda el mensaje general */
    }
    if (code === "migracion") throw new FaltaMigracion(mensaje || MIGRACION_0145);
    if (!ctx && /failed to send|fetch/i.test(mensaje)) mensaje = `No se pudo llegar a la función ${funcion}: ¿está desplegada?`;
    throw new ErrorPilo(mensaje, code);
  }
  return r.data as T;
}
const invocar = <T>(body: Record<string, unknown>) => invocarEn<T>("pilo-rankingsod", { action: "informes", ...body });

export async function piloInformeEstado(ods?: number): Promise<EstadoPiloInforme> {
  const r = await invocar<Omit<EstadoPiloInforme, "lista">>({ step: "estado", ...(ods ? { ods } : {}) });
  return { ...r, lista: r.ai === true };
}
export const piloPlan = (report_id: string, opciones: { rehacer?: boolean; reintentar?: boolean } = {}) => invocar<RespuestaPlan>({ step: "plan", report_id, ...opciones });
export const piloRedactar = (o: { report_id: string; sec: Seccion; block_id?: string; count?: number }) => invocar<RespuestaRedactar>({ step: "redactar", ...o });
export const piloIndicador = (o: { report_id: string; indicator: string }) => invocar<RespuestaIndicador>({ step: "indicador", ...o });
export const piloFotos = (o: { report_id: string }) => invocar<RespuestaFotos>({ step: "fotos", ...o });
/** 0146: libro de cifras: paso 1 sin IA (extraer con cita literal) y paso 2 con IA (¿es logro de la UDES?). */
export const piloCifras = (o: { report_id: string } | { ods: number }) => invocar<RespuestaCifras>({ step: "cifras", ...o });
/** 0146: completa el inglés de los párrafos y de las notas del informe (nunca cambia el español). */
export const piloTraducir = (o: { report_id: string; news_ids?: string[] }) => invocar<RespuestaTraducir>({ step: "traducir", ...o });
/** 0146: Pilo como evaluador de THE (solo la pregunta y el texto de la página). Nunca aprueba. */
export const piloEvaluar = (o: { report_id: string; indicator: string }) => invocar<RespuestaEvaluar>({ step: "evaluar", ...o });
/** 0146: reescribe la ficha con datos de la nota que faltaban y vuelve a evaluar (antes/después). */
export const piloMejorar = (o: { report_id: string; indicator: string }) => invocar<RespuestaMejorar>({ step: "mejorar", ...o });
/** 0146: trae las imágenes de las notas aprobadas ya cargadas (función noticias-ods), por lotes. */
export const piloImagenes = (o: { start?: number; limite?: number; ods?: number } = {}) => invocarEn<RespuestaImagenes>("noticias-ods", { action: "imagenes", ...o });

/* ---------- El ciclo de Pilo ---------------------------------------------- */

export type PasoPilo = "imagenes" | "cifras" | "plan" | "redactar" | "fotos" | "indicadores" | "evaluar" | "traducir" | "listo";

export interface ProgresoInforme {
  paso: PasoPilo | null;
  /** En palabras, para la pantalla («Tema 3 de 11 · 24 de 61 notas cubiertas»). */
  mensaje: string;
  hechos: number;
  total: number;
  escritos: number;
  indicadores: number;
  fotos: number;
  /** 0146: el tema en curso y la cobertura de la narrativa. */
  tema?: { indice: number; total: number; heading: string } | null;
  cubiertas?: number;
  totalNotas?: number;
  /** Avisos que no detienen el ciclo (un párrafo que no pasó la verificación…). */
  avisos: string[];
}

export const PROGRESO_INFORME_CERO: ProgresoInforme = { paso: null, mensaje: "", hechos: 0, total: 0, escritos: 0, indicadores: 0, fotos: 0, tema: null, avisos: [] };

export interface OpcionesPilo {
  /** Rehacer el plan aunque ya exista. */
  replanear?: boolean;
  /** Volver a intentar las notas que fallaron la verificación. */
  reintentarFallidas?: boolean;
  /** Secciones que redacta (por defecto, las tres de Pilo). */
  secciones?: ("hicimos" | "proyectos" | "cifras")[];
  /** Indicadores que arma (por defecto, los «ev» del ODS que aún no tienen evidencia). */
  indicadores?: string[];
  /** Saltar pasos. */
  sinImagenes?: boolean;
  sinFotos?: boolean;
  sinEvaluar?: boolean;
  sinTraducir?: boolean;
}

export interface UsoPiloInforme {
  corriendo: boolean;
  progreso: ProgresoInforme;
  error: string | null;
  faltaMigracion: boolean;
  iniciar: (opciones?: OpcionesPilo) => void;
  detener: () => void;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CORTE_IA = new Set(["sin_ia", "clave", "proveedor", "publicado", "migracion"]);

/** El progreso en palabras: «Tema 3 de 11 («Formación continua») · 24 de 61 notas cubiertas». */
export function textoProgresoTema(r: Pick<RespuestaRedactar, "tema" | "cubiertas" | "total_notas">): string {
  const partes: string[] = [];
  if (r.tema) partes.push(`Tema ${r.tema.indice} de ${r.tema.total}${r.tema.heading ? ` («${r.tema.heading}»)` : ""}`);
  if (typeof r.cubiertas === "number" && typeof r.total_notas === "number") partes.push(`${r.cubiertas} de ${r.total_notas} notas cubiertas`);
  return partes.join(" · ");
}

/**
 * Pilo arma el informe sin bloquear la pantalla, en este orden: imágenes de
 * las notas (solo si faltan) → libro de cifras → plan por temas → párrafos en
 * español e inglés, tema por tema → fotos (elegir) → evidencia por indicador
 * (ficha) → evaluar → traducir lo que falte. Cada paso refresca el informe.
 * Reanudable: lo hecho vive en la base y no se repite. Ante el límite del
 * proveedor (429) espera 30 s y reintenta hasta 3 veces.
 */
export function usePiloInforme(report_id: string): UsoPiloInforme {
  const cliente = useQueryClient();
  const [progreso, setProgreso] = useState<ProgresoInforme>(PROGRESO_INFORME_CERO);
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const parar = useRef(false);
  const vivo = useRef(true);
  const enCurso = useRef(false);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      parar.current = true;
    };
  }, []);

  const refrescar = useCallback(() => void cliente.invalidateQueries({ queryKey: ["informe"] }), [cliente]);

  const iniciar = useCallback(
    (opciones: OpcionesPilo = {}) => {
      if (enCurso.current || !report_id) return;
      enCurso.current = true;
      parar.current = false;
      setError(null);
      setFaltaMigracion(false);
      setProgreso(PROGRESO_INFORME_CERO);
      setCorriendo(true);
      const avanzar = (c: Partial<ProgresoInforme>) => vivo.current && setProgreso((p) => ({ ...p, ...c }));
      const avisar = (a: string) => vivo.current && setProgreso((p) => ({ ...p, avisos: [...p.avisos, a].slice(-30) }));

      const conEspera = async <T,>(f: () => Promise<T>): Promise<T> => {
        for (let esperas = 0; ; esperas++) {
          try {
            return await f();
          } catch (e) {
            if (e instanceof ErrorPilo && e.code === "limite_proveedor" && esperas < 3 && !parar.current) {
              avanzar({ mensaje: "El proveedor pidió esperar: sigo en 30 segundos…" });
              await dormir(30_000);
              continue;
            }
            throw e;
          }
        }
      };

      void (async () => {
        try {
          const fila = await tabla("ods_reports").select("ods, settings").eq("id", report_id).single();
          if (fila.error) throw fallo(fila.error);
          const { ods, settings } = fila.data as unknown as { ods: number; settings: Record<string, unknown> | null };

          const estado = await piloInformeEstado(ods);

          // 1. Imágenes de las notas (sin IA), solo las que faltan.
          if (!opciones.sinImagenes) {
            avanzar({ paso: "imagenes", mensaje: "Pilo trae las imágenes de las notas que aún no las tienen…" });
            try {
              for (let start = 0, vueltas = 0; !parar.current && vueltas < 200; vueltas++) {
                const r = await piloImagenes({ start, ods });
                start = r.next;
                if (r.fin) break;
              }
            } catch (e) {
              avisar(`Imágenes: ${e instanceof Error ? e.message : String(e)}`);
            }
            refrescar();
          }

          // 2. Libro de cifras (paso 1 sin IA; paso 2 con IA si está lista).
          if (!parar.current) {
            avanzar({ paso: "cifras", mensaje: "Pilo arma el libro de cifras de las notas…" });
            for (let vueltas = 0; vueltas < 40 && !parar.current; vueltas++) {
              const r = await conEspera(() => piloCifras({ report_id }));
              if (r.motivo) avisar(r.motivo);
              if (!r.quedan || !estado.ai || (!r.confirmadas && !r.extraidas)) break;
            }
            refrescar();
          }

          if (!estado.ai) throw new ErrorPilo(`La IA de los rankings no está lista${estado.motivo ? `: ${estado.motivo}` : "."} Las imágenes y el libro de cifras quedaron listos.`, "sin_ia");

          // 3. Plan: todas las notas en temas; Pilo los nombra por lotes.
          let indicadores = opciones.indicadores ?? estado.indicadores ?? [];
          if (!parar.current) {
            avanzar({ paso: "plan", mensaje: "Pilo agrupa todas las notas por tema…" });
            let primera = true;
            for (let vueltas = 0; vueltas < 30 && !parar.current; vueltas++) {
              const p = await conEspera(() => piloPlan(report_id, primera ? { rehacer: Boolean(opciones.replanear || !settings?.plan), reintentar: opciones.reintentarFallidas } : {}));
              primera = false;
              if (!opciones.indicadores) indicadores = p.indicadores;
              for (const a of p.avisos ?? []) avisar(a);
              avanzar({ mensaje: `Plan: ${p.temas ?? p.plan.temas?.length ?? 0} temas con ${p.notas ?? p.plan.hicimos.length} notas.` });
              refrescar();
              if (!p.quedan) break;
            }
          }

          // 4. Párrafos, tema por tema, hasta cubrir todas las notas.
          const secciones = opciones.secciones ?? ["hicimos", "proyectos", "cifras"];
          for (const sec of secciones) {
            const etiqueta = SECCIONES.find((s) => s.id === sec)?.label ?? sec;
            for (let vuelta = 0; vuelta < 200 && !parar.current; vuelta++) {
              avanzar({ paso: "redactar", mensaje: progresoTexto(etiqueta) });
              let r: RespuestaRedactar;
              try {
                r = await conEspera(() => piloRedactar({ report_id, sec, count: Math.max(2, estado.lote ?? 2) }));
              } catch (e) {
                // Un grupo que no pasó la verificación queda en «fallidas» (y en el registro): se sigue.
                if (e instanceof ErrorPilo && e.code === "verificacion") {
                  avisar(`«${etiqueta}»: ${e.message}`);
                  refrescar();
                  continue;
                }
                throw e;
              }
              for (const f of r.fallos ?? []) avisar(`«${etiqueta}»: ${f.motivo}`);
              for (const a of r.avisos ?? []) avisar(a);
              setProgreso((p) => ({
                ...p,
                escritos: p.escritos + (r.escritos || 0),
                tema: r.tema ?? p.tema,
                cubiertas: r.cubiertas ?? p.cubiertas,
                totalNotas: r.total_notas ?? p.totalNotas,
                mensaje: textoProgresoTema(r) || p.mensaje,
              }));
              refrescar();
              if (!r.quedan || (!r.escritos && !(r.fallos ?? []).length)) break;
            }
            if (parar.current) break;
          }

          // 5. Fotos: elegir y organizar entre las de las notas (Pilo no crea imágenes).
          if (!parar.current && !opciones.sinFotos) {
            avanzar({ paso: "fotos", mensaje: "Pilo elige y organiza las fotos de las notas…" });
            const f = await piloFotos({ report_id });
            setProgreso((p) => ({ ...p, fotos: p.fotos + f.propuestas }));
            if (f.propuestas) avisar(f.aviso);
            for (const a of f.avisos ?? []) avisar(a);
            refrescar();
          }

          // 6. Indicadores «ev» sin evidencia elegida: UNA por indicador, con su ficha.
          const hechas = async () => {
            const r = await tabla("ods_report_indicators").select("indicator, news_id, approved, eval").eq("report_id", report_id);
            if (r.error) throw fallo(r.error);
            return (r.data as unknown as { indicator: string; news_id: string | null; approved: boolean; eval: { grade?: string } | null }[]) ?? [];
          };
          if (!parar.current && indicadores.length) {
            const listos = new Set((await hechas()).filter((x) => x.approved || x.news_id).map((x) => x.indicator));
            const pendientes = indicadores.filter((i) => !listos.has(i));
            avanzar({ paso: "indicadores", hechos: 0, total: pendientes.length });
            for (const [i, ind] of pendientes.entries()) {
              if (parar.current) break;
              avanzar({ mensaje: `Pilo busca la evidencia del indicador ${ind} (${i + 1} de ${pendientes.length})…`, hechos: i, total: pendientes.length });
              try {
                const r = await conEspera(() => piloIndicador({ report_id, indicator: ind }));
                if (r.news_id) setProgreso((p) => ({ ...p, indicadores: p.indicadores + 1 }));
                else if (r.motivo) avisar(`${ind}: ${r.motivo}`);
              } catch (e) {
                if (e instanceof ErrorPilo && (e.code === "verificacion" || e.code === "aprobada")) {
                  avisar(`${ind}: ${e.message}`);
                  continue;
                }
                throw e;
              }
              refrescar();
            }
          }

          // 7. Evaluar las evidencias sin evaluación (nunca aprueba).
          if (!parar.current && !opciones.sinEvaluar) {
            const sinEval = (await hechas()).filter((x) => x.news_id && !x.approved && !x.eval?.grade).map((x) => x.indicator);
            avanzar({ paso: "evaluar", hechos: 0, total: sinEval.length });
            for (const [i, ind] of sinEval.entries()) {
              if (parar.current) break;
              avanzar({ mensaje: `Pilo evalúa la evidencia de ${ind} como lo haría THE (${i + 1} de ${sinEval.length})…`, hechos: i });
              try {
                await conEspera(() => piloEvaluar({ report_id, indicator: ind }));
              } catch (e) {
                if (e instanceof ErrorPilo && e.code === "verificacion") {
                  avisar(`${ind}: ${e.message}`);
                  continue;
                }
                throw e;
              }
              refrescar();
            }
          }

          // 8. Traducir lo que falte.
          if (!parar.current && !opciones.sinTraducir) {
            avanzar({ paso: "traducir", mensaje: "Pilo completa el inglés que falta…" });
            for (let vueltas = 0; vueltas < 30 && !parar.current; vueltas++) {
              const r = await conEspera(() => piloTraducir({ report_id }));
              for (const f of r.fallos) avisar(`Traducción: ${f.error}`);
              refrescar();
              if (!r.quedan || (!r.bloques && !r.noticias)) break;
            }
          }
          avanzar(parar.current ? { mensaje: "Detenido. Al volver a iniciar, Pilo sigue donde iba." } : { paso: "listo", mensaje: "Listo: revisa lo que escribió Pilo." });
        } catch (e) {
          if (vivo.current) {
            setFaltaMigracion(e instanceof FaltaMigracion);
            setError(e instanceof Error ? e.message : String(e));
            if (e instanceof ErrorPilo && CORTE_IA.has(e.code)) avanzar({ mensaje: e.message });
          }
        } finally {
          enCurso.current = false;
          refrescar();
          if (vivo.current) setCorriendo(false);
        }
      })();
    },
    [report_id, refrescar],
  );

  const detener = useCallback(() => {
    parar.current = true;
  }, []);

  return { corriendo, progreso, error, faltaMigracion, iniciar, detener };
}

const progresoTexto = (etiqueta: string) => `Pilo redacta «${etiqueta}»…`;

/* ---------- Público -------------------------------------------------------- */

/** El informe publicado de un ODS y una edición, con el inglés, las fotos con su imagen y el registro; null si no hay. */
export function usePublicInforme(ods: number, edition: number): UseQueryResult<InformePublico | null> {
  return useQuery({
    queryKey: ["informe-publico", ods, edition],
    staleTime: 5 * 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17 && edition > 0,
    queryFn: async (): Promise<InformePublico | null> => {
      const r = await tabla("ods_reports").select("id, ods, edition, updated_at").eq("ods", ods).eq("edition", edition).eq("state", "publicado").maybeSingle();
      if (r.error || !r.data) return null;
      const inf = r.data as unknown as InformePublico["informe"];
      const leerBloques = async (columnas: string) => todas<Record<string, unknown>>((a, z) => tabla("ods_report_blocks").select(columnas).eq("report_id", inf.id).order("pos").range(a, z));
      const leerFotos = async (columnas: string) => todas<Record<string, unknown>>((a, z) => tabla("ods_report_photos").select(columnas).eq("report_id", inf.id).range(a, z));
      let b: Record<string, unknown>[];
      let f: Record<string, unknown>[];
      try {
        [b, f] = await Promise.all([leerBloques("id, sec, pos, text, sources, figs, text_en, heading, heading_en"), leerFotos("news_id, image_id, slot, caption, alt, credit, crop")]);
      } catch {
        // Sin 0146: lo de 0145.
        try {
          [b, f] = await Promise.all([leerBloques("id, sec, pos, text, sources, figs"), leerFotos("news_id, slot, caption, alt, credit, crop")]);
        } catch {
          return null;
        }
      }
      // La URL de cada foto: la imagen elegida o la portada de la nota.
      const imageIds = [...new Set(f.map((x) => x.image_id).filter((x): x is string => typeof x === "string"))];
      const newsIds = [...new Set(f.map((x) => String(x.news_id)))];
      const urlImagen = new Map<string, string>();
      const urlNota = new Map<string, string | null>();
      try {
        for (const t of trozos(imageIds)) {
          const im = await tabla("news_images").select("id, url").in("id", t);
          for (const x of (im.data as unknown as { id: string; url: string }[]) ?? []) urlImagen.set(x.id, x.url);
        }
        for (const t of trozos(newsIds)) {
          const n = await tabla("news_items").select("id, image_url").in("id", t);
          for (const x of (n.data as unknown as { id: string; image_url: string | null }[]) ?? []) urlNota.set(x.id, x.image_url);
        }
      } catch {
        /* sin imágenes: el portal muestra la ficha sin foto */
      }
      let registro: RegistroActividad[] = [];
      try {
        const rg = await supabase.rpc("ods_registro" as never, { p_ods: ods, p_edition: edition } as never);
        if (!rg.error) registro = ((rg.data as unknown as RegistroActividad[]) ?? []).map((x) => ({ ...x, title_en: x.title_en ?? "", campus: x.campus ?? "", section: x.section ?? "" }));
      } catch {
        /* sin 0146: sin registro */
      }
      const bloques = ordenarBloques(
        b.map((x) => ({
          id: String(x.id),
          sec: x.sec as Seccion,
          pos: Number(x.pos ?? 0),
          text: String(x.text ?? ""),
          sources: lista<Fuente>(x.sources),
          figs: lista<Cifra>(x.figs),
          text_en: String(x.text_en ?? ""),
          heading: String(x.heading ?? ""),
          heading_en: String(x.heading_en ?? ""),
        })),
      );
      const fotos = f.map((x) => {
        const imageId = typeof x.image_id === "string" ? x.image_id : null;
        return {
          news_id: String(x.news_id),
          image_id: imageId,
          url: (imageId && urlImagen.get(imageId)) || urlNota.get(String(x.news_id)) || null,
          slot: (x.slot as Foto["slot"]) ?? "galeria",
          caption: String(x.caption ?? ""),
          alt: String(x.alt ?? ""),
          credit: String(x.credit ?? ""),
          crop: { ...RECORTE, ...((x.crop as Partial<Foto["crop"]>) ?? {}) },
        };
      });
      return { informe: { id: inf.id, ods: Number(inf.ods), edition: Number(inf.edition), updated_at: String(inf.updated_at ?? "") }, bloques, fotos, registro };
    },
  });
}

/** Lo que muestra la página de evidencia limpia de un indicador. */
export interface EvidenciaPublica {
  indicator: string;
  ods: number;
  title: string;
  /** 0146 */
  title_en?: string;
  date: string | null;
  section: string;
  campus: string;
  image_url: string | null;
  url: string;
  page_es: string[];
  page_en: string;
  /** 0146: la ficha de hechos (vacía si la evidencia es de antes de 0146). */
  ficha?: FichaEvidencia | null;
}

export function useEvidenciaPublica(ods: number, indicator: string): UseQueryResult<EvidenciaPublica | null> {
  return useQuery({
    queryKey: ["informe-publico", "evidencia", ods, indicator],
    staleTime: 5 * 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17 && Boolean(indicator),
    queryFn: async (): Promise<EvidenciaPublica | null> => {
      const r = await supabase.rpc("ods_evidencia" as never, { p_ods: ods, p_indicator: indicator } as never);
      if (r.error) return null;
      const f = ((r.data as unknown as Record<string, unknown>[]) ?? [])[0];
      if (!f) return null;
      const ficha = f.ficha && typeof f.ficha === "object" && Object.keys(f.ficha).length ? leerFicha(f.ficha) : null;
      return {
        indicator: String(f.indicator),
        ods: Number(f.ods),
        title: String(f.title ?? ""),
        title_en: String(f.title_en ?? ""),
        date: (f.published_on as string | null) ?? null,
        section: String(f.section ?? ""),
        campus: String(f.campus ?? ""),
        image_url: (f.image_url as string | null) ?? null,
        url: String(f.url ?? ""),
        page_es: lista<string>(f.page_es),
        page_en: String(f.page_en ?? ""),
        ficha,
      };
    },
  });
}

/* ---------- Funciones puras ------------------------------------------------ */

const RE_NUMERO = /\d[\d.,]*\d|\d/g;
const normalizarNumero = (n: string) => n.replace(/[.,]+$/, "").replace(/\.(?=\d{3}(?!\d))/g, "");
const numerosDe = (t: string) => (String(t ?? "").match(RE_NUMERO) ?? []).map(normalizarNumero);
const esAnio = (n: string) => /^(19|20)\d{2}$/.test(n);

/**
 * Las cifras del texto que no están en ninguna cita ni en las cifras del
 * párrafo (sin contar los años 19xx/20xx). Tal como aparecen en el texto.
 */
export function cifrasSinFuente(bloque: Pick<Bloque, "text" | "sources" | "figs">): string[] {
  const fuentes = new Set([...(bloque.sources ?? []).flatMap((s) => numerosDe(s.quote)), ...(bloque.figs ?? []).flatMap((f) => numerosDe(f.v))]);
  const fuera: string[] = [];
  for (const crudo of String(bloque.text ?? "").match(RE_NUMERO) ?? []) {
    const visto = crudo.replace(/[.,]+$/, "");
    const n = normalizarNumero(crudo);
    if (esAnio(n) || fuentes.has(n) || fuera.includes(visto)) continue;
    fuera.push(visto);
  }
  return fuera;
}

const activo = (b: Pick<Bloque, "enabled" | "spare">) => b.enabled && !b.spare;
const corto = (t: string) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** ¿Se puede publicar? Sin cifras sin fuente, sin cifras ilustrativas, sin párrafos vacíos y sin menores sin autorización. */
export function puedePublicar(completo: InformeCompleto): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  const activos = completo.bloques.filter(activo);
  if (!activos.length) motivos.push("El informe no tiene párrafos.");
  for (const b of activos) {
    if (!b.text.trim()) {
      motivos.push(`Hay un párrafo vacío en «${SECCIONES.find((s) => s.id === b.sec)?.label ?? b.sec}».`);
      continue;
    }
    const sin = cifrasSinFuente(b);
    if (sin.length) motivos.push(`El párrafo «${corto(b.text)}» tiene cifras sin fuente: ${sin.join(", ")}.`);
    if (b.figs.some((f) => /ilustrativ/i.test(f.src))) motivos.push(`El párrafo «${corto(b.text)}» usa cifras ilustrativas: reemplázalas por las reales.`);
  }
  for (const f of completo.fotos) {
    if (f.use && f.minors && !f.cleared) motivos.push(`Una fotografía en uso muestra menores sin autorización de imagen${f.caption ? ` («${corto(f.caption)}»)` : ""}.`);
  }
  return { ok: motivos.length === 0, motivos };
}

const ORDEN_SECCION = new Map(SECCIONES.map((s, i) => [s.id, i]));

/** Por sección (en el orden del informe), luego por posición. */
export function ordenarBloques<T extends Pick<Bloque, "sec" | "pos" | "id">>(bloques: T[]): T[] {
  return bloques.slice().sort((a, b) => (ORDEN_SECCION.get(a.sec) ?? 99) - (ORDEN_SECCION.get(b.sec) ?? 99) || a.pos - b.pos || a.id.localeCompare(b.id));
}

/** Las noticias que cita la narrativa (párrafos activos, no de reserva). */
export function notasEnNarrativa(bloques: Pick<Bloque, "sources" | "enabled" | "spare">[]): Set<string> {
  return new Set(bloques.filter(activo).flatMap((b) => (b.sources ?? []).map((s) => s.news_id).filter(Boolean)));
}

/**
 * El «Registro de actividades» en la intranet (el mismo que da ods_registro al
 * público): TODAS las notas, en orden cronológico, con su cifra principal y si
 * la narrativa la cita. Ninguna nota queda fuera.
 */
export function registroActividades(
  notas: Pick<NoticiaOds, "id" | "published_on" | "campus" | "section" | "title" | "title_en" | "url">[],
  cifras: Pick<CifraNota, "news_id" | "value" | "label" | "score">[],
  bloques: Pick<Bloque, "sources" | "enabled" | "spare">[],
): RegistroActividad[] {
  const citadas = notasEnNarrativa(bloques);
  const mejor = new Map<string, Pick<CifraNota, "value" | "label" | "score">>();
  for (const c of cifras) if (c.score > 0 && (!mejor.has(c.news_id) || c.score > mejor.get(c.news_id)!.score)) mejor.set(c.news_id, c);
  return notas
    .map((n) => ({
      news_id: n.id,
      published_on: n.published_on ?? null,
      campus: n.campus ?? "",
      section: n.section ?? "",
      title: n.title,
      title_en: n.title_en ?? "",
      url: n.url,
      figure_value: mejor.get(n.id)?.value ?? null,
      figure_label: mejor.get(n.id)?.label ?? null,
      en_narrativa: citadas.has(n.id),
    }))
    .sort((a, b) => String(a.published_on ?? "9999").localeCompare(String(b.published_on ?? "9999")) || a.title.localeCompare(b.title, "es"));
}

export type EstadoIndicador = "aprobada" | "propuesta" | "falta" | "documento" | "dato" | "investigacion";

export interface ResumenCobertura {
  /** Indicadores del ODS del informe. */
  total: number;
  /** Los que se arman con noticias (tipo «ev»). */
  conNoticias: number;
  /** De esos, con una nota propuesta (aprobada o no). */
  propuestas: number;
  aprobadas: number;
  /** «ev» sin evidencia. */
  faltan: string[];
  /** Los que piden un documento institucional. */
  documentos: string[];
  porIndicador: { id: string; tipo: IndicadorTHE["tipo"]; estado: EstadoIndicador }[];
  /** 0146 (con `notas`): cuántas notas aprobadas tiene el ODS, cuántas cita la narrativa y cuántas están solo en el registro. */
  notasTotal?: number;
  notasEnNarrativa?: number;
  notasSoloRegistro?: number;
}

/** Cuánto del ODS cubre el informe: evidencias por indicador y, si se dan las notas, cobertura de la narrativa. */
export function resumenCobertura(completo: InformeCompleto, indicadores: IndicadorTHE[], notas?: Pick<NoticiaOds, "id">[]): ResumenCobertura {
  const delOds = indicadores.filter((i) => Number(i.ods) === completo.informe.ods);
  const porId = new Map(completo.elecciones.map((e) => [e.indicator, e]));
  const porIndicador = delOds.map((i) => {
    const e = porId.get(i.id);
    let estado: EstadoIndicador;
    if (i.tipo === "dato") estado = "dato";
    else if (i.tipo === "inv") estado = "investigacion";
    else if (e?.approved && (e.news_id || i.tipo === "doc")) estado = "aprobada";
    else if (i.tipo === "doc") estado = "documento";
    else if (e?.news_id) estado = "propuesta";
    else estado = "falta";
    return { id: i.id, tipo: i.tipo, estado };
  });
  const ev = porIndicador.filter((x) => x.tipo === "ev");
  const base: ResumenCobertura = {
    total: delOds.length,
    conNoticias: ev.length,
    propuestas: ev.filter((x) => x.estado === "propuesta" || x.estado === "aprobada").length,
    aprobadas: porIndicador.filter((x) => x.estado === "aprobada").length,
    faltan: ev.filter((x) => x.estado === "falta").map((x) => x.id),
    documentos: porIndicador.filter((x) => x.estado === "documento").map((x) => x.id),
    porIndicador,
  };
  if (!notas) return base;
  const citadas = notasEnNarrativa(completo.bloques);
  const enNarrativa = notas.filter((n) => citadas.has(n.id)).length;
  return { ...base, notasTotal: notas.length, notasEnNarrativa: enNarrativa, notasSoloRegistro: notas.length - enNarrativa };
}

/** La página de evidencia de una elección, en el idioma pedido (inglés por defecto). */
export function paginaDeEleccion(e: Pick<EleccionIndicador, "indicator" | "ficha" | "page_es" | "page_en">, ind: Pick<IndicadorTHE, "id" | "titulo" | "pregunta"> | undefined, idioma: Idioma = "en"): PaginaEvidencia {
  return paginaEvidencia({ id: e.indicator, titulo: ind?.titulo, pregunta: ind?.pregunta }, e.ficha ?? null, e.page_es, e.page_en, idioma);
}
