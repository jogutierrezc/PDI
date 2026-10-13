/* =============================================================================
   Informes ODS con Pilo · datos (migración 0145, función pilo-rankingsod).

   · Intranet (Planeación o más): useInforme y las mutaciones de bloques,
     fotos, elecciones, ajustes y estado. Las políticas de la base deciden
     quién escribe; este archivo no lo vigila.
   · Pilo: piloInformeEstado, piloPlan, piloRedactar, piloIndicador, piloFotos
     (una llamada a la función; la clave del proveedor nunca llega aquí) y
     usePiloInforme, el ciclo plan → párrafos → indicadores → fotos.
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
import {
  SECCIONES,
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

export { ErrorPilo };

const MIGRACION_0145 = "Falta aplicar la migración 0145 (Informes ODS con Pilo).";
const noExiste = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(e.message ?? "")));
const fallo = (e: { code?: string; message?: string }) => (noExiste(e) ? new FaltaMigracion(MIGRACION_0145) : new Error(e.message ?? "Error de la base."));

const tabla = (t: "ods_reports" | "ods_report_blocks" | "ods_report_photos" | "ods_report_indicators" | "news_ods") => supabase.from(t as never);

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

export function leerAjustes(s: unknown): AjustesInforme {
  const o = (s ?? {}) as Record<string, unknown>;
  return { tone: o.tone === "institucional" ? "institucional" : "cercano", person: o.person === "tercera" ? "tercera" : "nosotros" };
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
});

const RECORTE: Foto["crop"] = { fx: 0.5, fy: 0.4, ratio: "16:9" };

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
});

/* ---------- Intranet: lectura --------------------------------------------- */

async function cargarCompleto(fila: Record<string, unknown>): Promise<InformeCompleto> {
  const id = String(fila.id);
  const [b, f, e] = await Promise.all([
    tabla("ods_report_blocks").select("*").eq("report_id", id),
    tabla("ods_report_photos").select("*").eq("report_id", id),
    tabla("ods_report_indicators").select("*").eq("report_id", id),
  ]);
  for (const r of [b, f, e]) if (r.error) throw fallo(r.error);
  return {
    informe: aInforme(fila),
    bloques: ordenarBloques(((b.data as unknown as Record<string, unknown>[]) ?? []).map(aBloque)),
    fotos: ((f.data as unknown as Record<string, unknown>[]) ?? []).map(aFoto),
    elecciones: ((e.data as unknown as Record<string, unknown>[]) ?? []).map(aEleccion).sort((x, y) => x.indicator.localeCompare(y.indicator, "es", { numeric: true })),
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
}

export function useNoticiasDeOds(ods: number): UseQueryResult<NoticiaOds[]> {
  return useQuery({
    queryKey: ["informe", "noticias", ods],
    staleTime: 60_000,
    retry: false,
    enabled: ods >= 1 && ods <= 17,
    queryFn: async (): Promise<NoticiaOds[]> => {
      const r = await tabla("news_ods")
        .select("score, reason, news_items!inner(id, url, title, excerpt, body, image_url, published_on, section, campus, state)")
        .eq("ods", ods)
        .eq("news_items.state", "ok")
        .limit(1000);
      if (r.error) throw noExiste(r.error) ? new FaltaMigracion("Falta aplicar la migración 0143 (recolector de noticias).") : new Error(r.error.message);
      type Fila = { score: number; reason: string; news_items: Omit<NoticiaOds, "score" | "reason"> | null };
      return ((r.data as unknown as Fila[]) ?? [])
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

const CAMPOS_BLOQUE = ["sec", "pos", "origin", "text", "orig", "sources", "figs", "warn", "enabled", "spare"] as const;

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
      const r = await tabla("ods_report_photos").upsert(fila as never, { onConflict: "report_id,news_id" });
      if (r.error) throw fallo(r.error);
    },
    onSuccess: refrescar,
  });
}

const CAMPOS_ELECCION = ["news_id", "candidates", "ask", "page_es", "page_en", "approved"] as const;

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

/* ---------- Pilo (función pilo-rankingsod) -------------------------------- */

export interface EstadoPiloInforme {
  ok: boolean;
  /** ¿Está Mr. Pilo con IA encendido y conectado? */
  ai: boolean;
  /** Lo mismo que `ai`, para las pantallas que preguntan «¿está lista?». */
  lista: boolean;
  motivo?: string;
  /** Con `ods`: los indicadores de THE de ese ODS que se arman con noticias. */
  indicadores?: string[];
}

export interface PlanPilo {
  hicimos: string[];
  proyectos: string[];
  cifras: string[];
  descartadas: { news_id: string; razon: string }[];
  fallidas?: string[];
  at?: string;
}
export interface RespuestaPlan {
  ok: boolean;
  plan: PlanPilo;
  indicadores: string[];
}
export interface RespuestaRedactar {
  ok: boolean;
  escritos: number;
  bloques: string[];
  /** Cuántos de los escritos quedaron de reserva. */
  reserva: number;
  /** Notas del plan que aún no usa ningún párrafo de la sección. */
  quedan: number;
  fallos: { notas: string[]; motivo: string }[];
  motivo?: string;
}
export interface RespuestaIndicador {
  ok: boolean;
  news_id: string | null;
  candidatas: number;
  page_es: string[];
  page_en: string;
  motivo?: string;
}
export interface RespuestaFotos {
  ok: boolean;
  propuestas: number;
  menores: number;
  graficas: number;
  /** «Pilo no ve las imágenes…». */
  aviso: string;
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("pilo-rankingsod", { body: { action: "informes", ...body } });
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
    if (!ctx && /failed to send|fetch/i.test(mensaje)) mensaje = "No se pudo llegar a la función pilo-rankingsod: ¿está desplegada?";
    throw new ErrorPilo(mensaje, code);
  }
  return r.data as T;
}

export async function piloInformeEstado(ods?: number): Promise<EstadoPiloInforme> {
  const r = await invocar<Omit<EstadoPiloInforme, "lista">>({ step: "estado", ...(ods ? { ods } : {}) });
  return { ...r, lista: r.ai === true };
}
export const piloPlan = (report_id: string) => invocar<RespuestaPlan>({ step: "plan", report_id });
export const piloRedactar = (o: { report_id: string; sec: Seccion; block_id?: string; count?: number }) => invocar<RespuestaRedactar>({ step: "redactar", ...o });
export const piloIndicador = (o: { report_id: string; indicator: string }) => invocar<RespuestaIndicador>({ step: "indicador", ...o });
export const piloFotos = (o: { report_id: string }) => invocar<RespuestaFotos>({ step: "fotos", ...o });

/* ---------- El ciclo de Pilo ---------------------------------------------- */

export type PasoPilo = "plan" | "redactar" | "indicadores" | "fotos" | "listo";

export interface ProgresoInforme {
  paso: PasoPilo | null;
  /** En palabras, para la pantalla. */
  mensaje: string;
  hechos: number;
  total: number;
  escritos: number;
  indicadores: number;
  fotos: number;
  /** Avisos que no detienen el ciclo (un párrafo que no pasó la verificación…). */
  avisos: string[];
}

export const PROGRESO_INFORME_CERO: ProgresoInforme = { paso: null, mensaje: "", hechos: 0, total: 0, escritos: 0, indicadores: 0, fotos: 0, avisos: [] };

export interface OpcionesPilo {
  /** Rehacer el plan aunque ya exista. */
  replanear?: boolean;
  /** Secciones que redacta (por defecto, las tres de Pilo). */
  secciones?: ("hicimos" | "proyectos" | "cifras")[];
  /** Indicadores que arma (por defecto, los «ev» del ODS que aún no tienen evidencia). */
  indicadores?: string[];
  /** Saltar las fotos. */
  sinFotos?: boolean;
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

/**
 * Pilo arma el informe sin bloquear la pantalla: plan (si no hay), párrafos
 * de cada sección hasta que no queden notas, la evidencia de cada indicador
 * «ev» sin elegir y las fichas de las fotos. Cada paso refresca el informe.
 * Es reanudable: lo hecho vive en la base y no se repite. Ante el límite del
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
      const avisar = (a: string) => vivo.current && setProgreso((p) => ({ ...p, avisos: [...p.avisos, a].slice(-20) }));

      /** Una llamada con espera ante el 429. */
      const conEspera = async <T>(f: () => Promise<T>): Promise<T> => {
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
          if (!estado.ai) throw new ErrorPilo(`La IA de Pilo no está lista${estado.motivo ? `: ${estado.motivo}` : "."}`, "sin_ia");

          // 1. Plan
          let indicadores = opciones.indicadores ?? estado.indicadores ?? [];
          if (opciones.replanear || !settings?.plan) {
            avanzar({ paso: "plan", mensaje: "Pilo lee las notas aprobadas y arma el plan…" });
            const p = await conEspera(() => piloPlan(report_id));
            if (!opciones.indicadores) indicadores = p.indicadores;
            refrescar();
          }

          // 2. Párrafos, sección por sección, hasta que no queden notas del plan.
          const secciones = opciones.secciones ?? ["hicimos", "proyectos", "cifras"];
          for (const sec of secciones) {
            const etiqueta = SECCIONES.find((s) => s.id === sec)?.label ?? sec;
            for (let vuelta = 0; vuelta < 30 && !parar.current; vuelta++) {
              avanzar({ paso: "redactar", mensaje: `Pilo redacta «${etiqueta}»…` });
              let r: RespuestaRedactar;
              try {
                r = await conEspera(() => piloRedactar({ report_id, sec, count: 2 }));
              } catch (e) {
                // Un párrafo que no pasó la verificación no detiene el ciclo: esas notas quedan marcadas y se sigue.
                if (e instanceof ErrorPilo && e.code === "verificacion") {
                  avisar(`«${etiqueta}»: ${e.message}`);
                  refrescar();
                  continue;
                }
                throw e;
              }
              for (const f of r.fallos ?? []) avisar(`«${etiqueta}»: ${f.motivo}`);
              if (r.escritos) setProgreso((p) => ({ ...p, escritos: p.escritos + r.escritos }));
              refrescar();
              if (!r.escritos || !r.quedan) break;
            }
            if (parar.current) break;
          }

          // 3. Indicadores «ev» sin evidencia elegida.
          if (!parar.current && indicadores.length) {
            const hechas = await tabla("ods_report_indicators").select("indicator, news_id, approved").eq("report_id", report_id);
            if (hechas.error) throw fallo(hechas.error);
            const listos = new Set(
              ((hechas.data as unknown as { indicator: string; news_id: string | null; approved: boolean }[]) ?? []).filter((x) => x.approved || x.news_id).map((x) => x.indicator),
            );
            const pendientes = indicadores.filter((i) => !listos.has(i));
            avanzar({ paso: "indicadores", hechos: 0, total: pendientes.length });
            for (const [i, ind] of pendientes.entries()) {
              if (parar.current) break;
              avanzar({ mensaje: `Pilo busca la evidencia del indicador ${ind}…`, hechos: i, total: pendientes.length });
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

          // 4. Fotos (sin IA: Pilo no ve las imágenes).
          if (!parar.current && !opciones.sinFotos) {
            avanzar({ paso: "fotos", mensaje: "Pilo prepara las fichas de las fotografías…" });
            const f = await piloFotos({ report_id });
            setProgreso((p) => ({ ...p, fotos: p.fotos + f.propuestas }));
            if (f.propuestas) avisar(f.aviso);
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

/* ---------- Público -------------------------------------------------------- */

/** El informe publicado de un ODS y una edición; null si no hay (o sin la migración). */
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
      const [b, f] = await Promise.all([
        tabla("ods_report_blocks").select("id, sec, pos, text, sources, figs").eq("report_id", inf.id),
        tabla("ods_report_photos").select("news_id, slot, caption, alt, credit, crop").eq("report_id", inf.id),
      ]);
      if (b.error || f.error) return null;
      const bloques = ordenarBloques(
        ((b.data as unknown as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), sec: x.sec as Seccion, pos: Number(x.pos ?? 0), text: String(x.text ?? ""), sources: lista<Fuente>(x.sources), figs: lista<Cifra>(x.figs) })),
      );
      const fotos = ((f.data as unknown as Record<string, unknown>[]) ?? []).map((x) => ({
        news_id: String(x.news_id),
        slot: (x.slot as Foto["slot"]) ?? "galeria",
        caption: String(x.caption ?? ""),
        alt: String(x.alt ?? ""),
        credit: String(x.credit ?? ""),
        crop: { ...RECORTE, ...((x.crop as Partial<Foto["crop"]>) ?? {}) },
      }));
      return { informe: { id: inf.id, ods: Number(inf.ods), edition: Number(inf.edition), updated_at: String(inf.updated_at ?? "") }, bloques, fotos };
    },
  });
}

/** Lo que muestra la página de evidencia limpia de un indicador. */
export interface EvidenciaPublica {
  indicator: string;
  ods: number;
  title: string;
  date: string | null;
  section: string;
  campus: string;
  image_url: string | null;
  url: string;
  page_es: string[];
  page_en: string;
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
      return {
        indicator: String(f.indicator),
        ods: Number(f.ods),
        title: String(f.title ?? ""),
        date: (f.published_on as string | null) ?? null,
        section: String(f.section ?? ""),
        campus: String(f.campus ?? ""),
        image_url: (f.image_url as string | null) ?? null,
        url: String(f.url ?? ""),
        page_es: lista<string>(f.page_es),
        page_en: String(f.page_en ?? ""),
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
}

/** Cuánto del ODS cubre el informe: evidencias propuestas y aprobadas por indicador. */
export function resumenCobertura(completo: InformeCompleto, indicadores: IndicadorTHE[]): ResumenCobertura {
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
  return {
    total: delOds.length,
    conNoticias: ev.length,
    propuestas: ev.filter((x) => x.estado === "propuesta" || x.estado === "aprobada").length,
    aprobadas: porIndicador.filter((x) => x.estado === "aprobada").length,
    faltan: ev.filter((x) => x.estado === "falta").map((x) => x.id),
    documentos: porIndicador.filter((x) => x.estado === "documento").map((x) => x.id),
    porIndicador,
  };
}
