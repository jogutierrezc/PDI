/* =============================================================================
   Pilo Publica · acceso a datos (migración 0262).

   Intranet: Planeación o más lee y escribe todo (la base decide quién).
   Público: solo informes publicados, sus bloques activos y las cifras que esos
   bloques citan (función pp_cifras_publicas). Sin la migración, la intranet
   recibe FaltaMigracion y la vista pública, null.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../noticias";
import type { BloquePP, CifraPP, CifraPub, CorridaPP, EstadoInforme, FuentePP, ImagenPub, InformePP, NoticiaPub, RankingPP } from "./tipos";

/* La tabla pp_* no está en los tipos generados: se habla con ella sin tipos. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ErrBD {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}
const noExiste = (e: ErrBD | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(e.message ?? "")));
const MIGRACION = "Falta aplicar la migración 0262 (Pilo Publica).";
/** El error de la base dicho en español claro: qué pasó y qué hacer. */
export function mensajeBD(e: ErrBD): string {
  const crudo = [e.message, e.details, e.hint].filter(Boolean).join(" · ");
  switch (e.code) {
    case "42501":
      return "No tienes permiso para guardar aquí (hace falta el rol de Planeación o administración). Lo que escribiste sigue en pantalla.";
    case "23503":
      return `La base no encontró un dato al que este bloque se refiere (por ejemplo, tu perfil o el informe). Detalle: ${crudo}`;
    case "23514":
      return `La base rechazó el bloque porque no cumple una regla (tipo, origen o estado). Detalle: ${crudo}`;
    case "23505":
      return "Ya existe un registro igual. Recarga la pantalla y vuelve a intentarlo.";
    case "PGRST301":
    case "PGRST303":
      return "Tu sesión venció. Vuelve a entrar y repite el guardado.";
    default:
      return /jwt|token/i.test(crudo) ? "Tu sesión venció. Vuelve a entrar y repite el guardado." : crudo || "Error de la base de datos.";
  }
}
const lanzar = (e: ErrBD): never => {
  throw noExiste(e) ? new FaltaMigracion(MIGRACION) : new Error(mensajeBD(e));
};

/** La siguiente posición libre entre los bloques de un informe. */
export const siguientePos = (bloques: { pos: number }[] | undefined): number => (bloques ?? []).reduce((m, b) => Math.max(m, b.pos || 0), 0) + 1;

async function quienSoy(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

const COLS_INFORME = "id, ranking, unit_key, edition, state, settings, title_es, title_en, lead_es, lead_en, published_at, updated_at";

/* ---------- Intranet ------------------------------------------------------ */

export function useInformes() {
  return useQuery({
    queryKey: ["pp", "informes"],
    staleTime: 15_000,
    retry: false,
    queryFn: async (): Promise<InformePP[]> => {
      const { data, error } = await db.from("pp_informes").select(COLS_INFORME).order("updated_at", { ascending: false }).limit(500);
      if (error) lanzar(error);
      return (data ?? []) as InformePP[];
    },
  });
}

export function useCrearInforme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { ranking: RankingPP; unit_key: string; edition: number; title_es: string; title_en: string }): Promise<InformePP> => {
      const by = await quienSoy();
      const { data, error } = await db
        .from("pp_informes")
        .insert({ ...o, ...(by ? { updated_by: by } : {}) })
        .select(COLS_INFORME)
        .single();
      if (error) lanzar(error);
      return data as InformePP;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "informes"] }),
  });
}

export function useActualizarInforme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { id: string; patch: Partial<Omit<InformePP, "id">>; bitacora?: { accion: string; detalle?: Record<string, unknown> } }) => {
      const by = await quienSoy();
      const { error } = await db
        .from("pp_informes")
        .update({ ...o.patch, ...(by ? { updated_by: by } : {}) })
        .eq("id", o.id);
      if (error) lanzar(error);
      if (o.bitacora) {
        await db.from("pp_corridas").insert({ informe_id: o.id, accion: o.bitacora.accion, detalle: o.bitacora.detalle ?? {}, ...(by ? { actor: by } : {}) });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp"] }),
  });
}

export function useFuentes(id: string | undefined) {
  return useQuery({
    queryKey: ["pp", "fuentes", id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<FuentePP[]> => {
      const { data, error } = await db.from("pp_fuentes").select("id, informe_id, kind, ref, label, include, meta").eq("informe_id", id).order("created_at").limit(2000);
      if (error) lanzar(error);
      return (data ?? []) as FuentePP[];
    },
  });
}

export function useIncluirFuentes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { ids: string[]; include: boolean }) => {
      for (let i = 0; i < o.ids.length; i += 100) {
        const { error } = await db.from("pp_fuentes").update({ include: o.include }).in("id", o.ids.slice(i, i + 100));
        if (error) lanzar(error);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "fuentes"] }),
  });
}

export function useCifras(id: string | undefined) {
  return useQuery({
    queryKey: ["pp", "cifras", id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<CifraPP[]> => {
      const { data, error } = await db
        .from("pp_cifras")
        .select("id, informe_id, key, label, label_en, unit, year, value, derived, formula, source, indicator")
        .eq("informe_id", id)
        .order("key")
        .limit(5000);
      if (error) lanzar(error);
      return ((data ?? []) as CifraPP[]).map((c) => ({ ...c, value: c.value === null ? null : Number(c.value) }));
    },
  });
}

/** Edita una cifra a mano: conserva el resto de `source` y marca que la descripción es de una persona (Pilo no la pisa). */
export function useEditarCifra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { cifra: CifraPP; label: string; label_en: string; descripcion: string; descripcion_en: string }) => {
      const base = o.cifra.source && typeof o.cifra.source === "object" ? o.cifra.source : {};
      const source = { ...base, descripcion: o.descripcion.trim(), descripcion_en: o.descripcion_en.trim(), descrito: o.descripcion.trim() || o.descripcion_en.trim() ? "persona" : (base as Record<string, unknown>).descrito };
      const label = o.label.trim() || o.cifra.label;
      const { error } = await db.from("pp_cifras").update({ label, label_en: o.label_en.trim(), source }).eq("id", o.cifra.id);
      if (error) lanzar(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "cifras"] }),
  });
}

const COLS_BLOQUE = "id, informe_id, kind, sec, pos, origin, enabled, spec, heading_es, heading_en, text_es, text_en, orig_es, orig_en, sources, figs, warn, updated_at";

export function useBloques(id: string | undefined) {
  return useQuery({
    queryKey: ["pp", "bloques", id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<BloquePP[]> => {
      const { data, error } = await db.from("pp_bloques").select(COLS_BLOQUE).eq("informe_id", id).order("pos").order("created_at").limit(2000);
      if (error) lanzar(error);
      return (data ?? []) as BloquePP[];
    },
  });
}

export type NuevoBloque = Pick<BloquePP, "kind"> & Partial<Omit<BloquePP, "id" | "informe_id" | "kind">>;

export function useGuardarBloque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { informe_id: string; id?: string; patch: NuevoBloque | Partial<BloquePP> }) => {
      const by = await quienSoy();
      if (o.id) {
        const { error } = await db
          .from("pp_bloques")
          .update({ ...o.patch, ...(by ? { updated_by: by } : {}) })
          .eq("id", o.id);
        if (error) lanzar(error);
        return o.id;
      }
      const { data, error } = await db
        .from("pp_bloques")
        .insert({ informe_id: o.informe_id, origin: "persona", ...o.patch, ...(by ? { updated_by: by } : {}) })
        .select("id")
        .single();
      if (error) lanzar(error);
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "bloques"] }),
  });
}

export function useBorrarBloque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("pp_bloques").delete().eq("id", id);
      if (error) lanzar(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "bloques"] }),
  });
}

/** Fija `pos` = índice para los bloques dados, en ese orden. */
export function useOrdenarBloques() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const rs = await Promise.all(ids.map((id, i) => db.from("pp_bloques").update({ pos: i + 1 }).eq("id", id)));
      const mal = rs.find((r: { error: ErrBD | null }) => r.error);
      if (mal?.error) lanzar(mal.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pp", "bloques"] }),
  });
}

export function useCorridas(id: string | undefined) {
  return useQuery({
    queryKey: ["pp", "corridas", id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<CorridaPP[]> => {
      const { data, error } = await db.from("pp_corridas").select("id, accion, detalle, created_at").eq("informe_id", id).order("created_at", { ascending: false }).limit(40);
      if (error) lanzar(error);
      return (data ?? []) as CorridaPP[];
    },
  });
}


/* ---------- Noticias e imágenes (candidatas y vista) ---------------------- */

export interface Medios {
  noticias: Map<string, NoticiaPub>;
  imagenes: Map<string, ImagenPub>;
  /** Imágenes de cada noticia, en orden. */
  deNoticia: Map<string, ImagenPub[]>;
}
const MEDIOS_VACIOS = (): Medios => ({ noticias: new Map(), imagenes: new Map(), deNoticia: new Map() });

const COLS_NOTICIA = "id, url, title, title_en, excerpt, excerpt_en, image_url, published_on";
const COLS_IMAGEN = "id, news_id, url, caption, credit, alt, minors, pos";

/** Las noticias y sus imágenes (columnas públicas), por id de noticia. */
export async function cargarMedios(newsIds: string[]): Promise<Medios> {
  const m = MEDIOS_VACIOS();
  const ids = Array.from(new Set(newsIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const [n, im] = await Promise.all([db.from("news_items").select(COLS_NOTICIA).in("id", lote), db.from("news_images").select(COLS_IMAGEN).in("news_id", lote).order("pos")]);
    for (const x of (n.data ?? []) as NoticiaPub[]) m.noticias.set(x.id, x);
    for (const x of (im.data ?? []) as ImagenPub[]) {
      m.imagenes.set(x.id, x);
      m.deNoticia.set(x.news_id, [...(m.deNoticia.get(x.news_id) ?? []), x]);
    }
  }
  return m;
}

export function useMedios(newsIds: string[]) {
  const clave = Array.from(new Set(newsIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["pp", "medios", clave.join(",")],
    enabled: clave.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: () => cargarMedios(clave),
  });
}

/* ---------- Público ------------------------------------------------------- */

export interface InformePublicoCompleto {
  informe: InformePP;
  bloques: BloquePP[];
  cifras: Map<string, CifraPub>;
  medios: Medios;
}

const COLS_BLOQUE_PUB = "id, informe_id, kind, sec, pos, origin, spec, heading_es, heading_en, text_es, text_en, figs, enabled, updated_at";

/** El informe publicado de una unidad. Sin edición, el más reciente. Null si no hay (o falta la migración). */
export function useInformePublico(ranking: string | undefined, unidad: string | undefined, edicion: number | null) {
  return useQuery({
    queryKey: ["pp", "publico", ranking, unidad, edicion],
    enabled: Boolean(ranking && unidad),
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<InformePublicoCompleto | null> => {
      let q = db.from("pp_informes").select(COLS_INFORME).eq("ranking", ranking).eq("unit_key", unidad).eq("state", "publicado");
      if (edicion) q = q.eq("edition", edicion);
      const { data, error } = await q.order("edition", { ascending: false }).limit(1);
      if (error) {
        if (noExiste(error)) return null;
        throw new Error(error.message);
      }
      const informe = (data ?? [])[0] as InformePP | undefined;
      if (!informe) return null;
      const [b, c] = await Promise.all([
        db.from("pp_bloques").select(COLS_BLOQUE_PUB).eq("informe_id", informe.id).eq("enabled", true).order("pos").limit(2000),
        db.rpc("pp_cifras_publicas", { p_informe: informe.id }),
      ]);
      if (b.error) throw new Error(b.error.message);
      const bloques = (b.data ?? []) as BloquePP[];
      const cifras = new Map<string, CifraPub>();
      for (const x of (c.data ?? []) as CifraPub[]) cifras.set(x.key, { ...x, value: x.value === null ? null : Number(x.value) });
      const medios = await cargarMedios(bloques.filter((x) => x.kind === "imagen" && x.spec.news_id).map((x) => x.spec.news_id as string)).catch(MEDIOS_VACIOS);
      return { informe, bloques, cifras, medios };
    },
  });
}
