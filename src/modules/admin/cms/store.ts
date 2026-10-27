/* =============================================================================
   CMS Portales · acceso a datos.

   Todo pasa por Supabase con las políticas de la migración 0174. Publicar es
   una función de la base (cms_publicar), no dos escrituras desde aquí: así la
   versión y el borrador no pueden quedar a medias.

   Sin la migración aplicada la pantalla lo dice y no escribe nada.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError, FriendlyError } from "../../../data/errors";
import type { CmsBloque, CmsPagina, CmsPortal, CmsVersion, PortalSlug } from "./tipos";
import { planImportacion, planSincronizacion, rutaHija, rutaOcupada, slugify, type BloqueExistente, type LineaBloque } from "./logica";
import type { NodoMicrositio } from "./plantillas";

/** Tabla o función ausente: PostgREST (PGRST205, PGRST202) o Postgres (42P01, 42883). */
const MISSING = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);
const DUPLICADA = "23505";

export const cmsKeys = {
  portales: ["cms", "portales"] as const,
  paginas: (portal: PortalSlug) => ["cms", "paginas", portal] as const,
  bloques: (paginaId: string) => ["cms", "bloques", paginaId] as const,
  versiones: (paginaId: string) => ["cms", "versiones", paginaId] as const,
};

/** Un error de «falta la migración» que la pantalla sabe leer. */
export class FaltaMigracionCms extends Error {}

function fallo(error: { code?: string; message?: string }): Error {
  if (MISSING.has(error.code ?? "")) return new FaltaMigracionCms("La migración 0174 no está aplicada.");
  return describeDatabaseError(error as Parameters<typeof describeDatabaseError>[0]);
}

export async function listarPortales(): Promise<CmsPortal[]> {
  const { data, error } = await supabase.from("cms_portales").select("slug,nombre,orden").order("orden");
  if (error) throw fallo(error);
  return (data ?? []) as CmsPortal[];
}

export async function listarPaginas(portal: PortalSlug): Promise<CmsPagina[]> {
  const { data, error } = await supabase
    .from("cms_paginas")
    .select("id,portal,padre_id,ruta,titulo,publicada_version,publicada_en,creado_en,actualizado_en")
    .eq("portal", portal);
  if (error) throw fallo(error);
  return (data ?? []) as CmsPagina[];
}

export async function listarBloques(paginaId: string): Promise<CmsBloque[]> {
  const { data, error } = await supabase
    .from("cms_bloques")
    .select("id,pagina_id,orden,tipo,ancho,props,actualizado_en")
    .eq("pagina_id", paginaId)
    .order("orden");
  if (error) throw fallo(error);
  return (data ?? []) as CmsBloque[];
}

/** Las últimas publicaciones de una página, de la más reciente a la más antigua. Solo lectura. */
export async function listarVersiones(paginaId: string, limite = 20): Promise<CmsVersion[]> {
  const { data, error } = await supabase
    .from("cms_versiones")
    .select("version,publicado_en")
    .eq("pagina_id", paginaId)
    .order("version", { ascending: false })
    .limit(limite);
  if (error) throw fallo(error);
  return (data ?? []) as CmsVersion[];
}

/** Lista de bloques para el lienzo: ids, tipo, ancho y props tal como están en la base. */
export function aLineas(bloques: CmsBloque[]): LineaBloque[] {
  return bloques.map((b) => ({ id: b.id, tipo: b.tipo, ancho: b.ancho, props: b.props }));
}

export interface NuevaPagina {
  portal: PortalSlug;
  /** Si es un micrositio, la página de la que cuelga. */
  padre?: CmsPagina;
  titulo: string;
  /** Opcional: si no viene, sale del título. */
  slug?: string;
  /** Las páginas del portal, para no repetir una ruta. */
  existentes: CmsPagina[];
}

export async function crearPagina(nueva: NuevaPagina): Promise<CmsPagina> {
  const titulo = nueva.titulo.trim();
  const slug = slugify(nueva.slug ?? titulo);
  if (!titulo) throw new FriendlyError("Escriba un título para la página.");
  if (!slug) throw new FriendlyError("El título no deja una dirección válida. Escriba una palabra con letras o números.");

  const ruta = rutaHija(nueva.padre?.ruta ?? "", slug);
  if (rutaOcupada(nueva.existentes, nueva.portal, ruta)) {
    throw new FriendlyError(`Ya existe una página en /${ruta}. Cambie el título o la dirección.`);
  }

  const { data, error } = await supabase
    .from("cms_paginas")
    .insert({ portal: nueva.portal, padre_id: nueva.padre?.id ?? null, ruta, titulo })
    .select("id,portal,padre_id,ruta,titulo,publicada_version,publicada_en,creado_en,actualizado_en")
    .single();
  if (error) {
    if (error.code === DUPLICADA) throw new FriendlyError(`Ya existe una página en /${ruta}.`);
    throw fallo(error);
  }
  return data as CmsPagina;
}

export async function renombrarPagina(id: string, titulo: string): Promise<void> {
  const limpio = titulo.trim();
  if (!limpio) throw new FriendlyError("El título no puede quedar vacío.");
  const { error } = await supabase
    .from("cms_paginas")
    .update({ titulo: limpio, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw fallo(error);
}

/**
 * Guarda el borrador completo de una página: borra los bloques quitados,
 * escribe los demás con su posición y marca la página como editada una sola
 * vez. El lienzo es la fuente; la base queda igual que lo que se ve en pantalla.
 */
export async function sincronizarBloques(paginaId: string, lista: LineaBloque[], existentes: BloqueExistente[]): Promise<void> {
  const plan = planSincronizacion(existentes, lista);
  const ahora = new Date().toISOString();
  if (plan.borrar.length > 0) {
    const { error } = await supabase.from("cms_bloques").delete().eq("pagina_id", paginaId).in("id", plan.borrar);
    if (error) throw fallo(error);
  }
  if (plan.guardar.length > 0) {
    const filas = plan.guardar.map((b) => ({ ...b, pagina_id: paginaId, actualizado_en: ahora }));
    const { error } = await supabase.from("cms_bloques").upsert(filas, { onConflict: "id" });
    if (error) throw fallo(error);
  }
  if (plan.borrar.length > 0 || plan.guardar.length > 0) await tocarPagina(paginaId, ahora);
}

/** Marca la página como editada: así la lista muestra «con cambios». */
async function tocarPagina(paginaId: string, cuando = new Date().toISOString()): Promise<void> {
  const { error } = await supabase.from("cms_paginas").update({ actualizado_en: cuando }).eq("id", paginaId);
  if (error) throw fallo(error);
}

/** Resultado de importar un árbol de micrositios: qué se creó, qué ya existía y qué falló (con motivo). */
export interface ResultadoImportacion {
  creadas: string[];
  omitidas: string[];
  fallidas: { ruta: string; motivo: string }[];
}

const motivoDe = (e: unknown): string => (e instanceof Error ? e.message : "error desconocido");

/**
 * Crea las páginas del árbol que faltan en el portal, con sus bloques. Las que
 * ya existen (misma ruta) no se tocan, así que repetir la importación no duplica
 * nada. Cada página se crea con su padre resuelto por ruta: la portada si el
 * padre es null. Si sus bloques no se pueden escribir, la página se retira para
 * que la siguiente importación la vuelva a crear. Nunca publica.
 */
export async function importarArbol(portal: PortalSlug, nodos: NodoMicrositio[], existentes: CmsPagina[]): Promise<ResultadoImportacion> {
  const plan = planImportacion(existentes, nodos);
  const resultado: ResultadoImportacion = { creadas: [], omitidas: plan.omitir, fallidas: [] };
  const porRuta = new Map(existentes.map((p) => [p.ruta, p]));
  const conocidas = [...existentes];
  if (plan.crear.some((c) => c.padreRuta === "") && !porRuta.has("")) {
    throw new FriendlyError("Este portal todavía no tiene su portada (la página con ruta vacía). Cree la portada y vuelva a importar.");
  }

  for (const { nodo, ruta, padreRuta } of plan.crear) {
    const padre = porRuta.get(padreRuta);
    if (!padre) {
      resultado.fallidas.push({ ruta, motivo: `Falta la página padre «/${padreRuta}».` });
      continue;
    }
    let nueva: CmsPagina;
    try {
      nueva = await crearPagina({ portal, padre, titulo: nodo.titulo, slug: nodo.slug, existentes: conocidas });
    } catch (e) {
      resultado.fallidas.push({ ruta, motivo: motivoDe(e) });
      continue;
    }
    try {
      const lineas: LineaBloque[] = nodo.bloques.map((b) => ({ id: crypto.randomUUID(), tipo: b.tipo, ancho: b.ancho, props: b.props }));
      await sincronizarBloques(nueva.id, lineas, []);
    } catch (e) {
      // Sin bloques la página quedaría vacía y la siguiente importación la daría por hecha: se retira.
      const { error: retiro } = await supabase.from("cms_paginas").delete().eq("id", nueva.id);
      const aviso = retiro ? " La página quedó vacía y no se pudo retirar: bórrela a mano antes de volver a importar." : "";
      resultado.fallidas.push({ ruta, motivo: `No se escribieron sus bloques: ${motivoDe(e)}${aviso}` });
      continue;
    }
    conocidas.push(nueva);
    porRuta.set(nueva.ruta, nueva);
    resultado.creadas.push(nueva.ruta);
  }
  return resultado;
}

export async function publicarPagina(paginaId: string): Promise<number> {
  const { data, error } = await supabase.rpc("cms_publicar", { p_pagina: paginaId });
  if (error) throw fallo(error);
  return Number(data);
}

/** Un hook por lectura para que la pantalla no repita claves ni opciones. */
export function usePortales() {
  return useQuery({ queryKey: cmsKeys.portales, queryFn: listarPortales, staleTime: 5 * 60_000 });
}

export function usePaginas(portal: PortalSlug) {
  return useQuery({ queryKey: cmsKeys.paginas(portal), queryFn: () => listarPaginas(portal) });
}

export function useBloques(paginaId: string | null) {
  return useQuery({
    queryKey: cmsKeys.bloques(paginaId ?? ""),
    queryFn: () => listarBloques(paginaId as string),
    enabled: Boolean(paginaId),
    // Sin copia en caché: el editor parte de lo que hay en la base al abrir la página,
    // no de una lectura vieja que luego se guardaría encima.
    gcTime: 0,
  });
}

export function useVersiones(paginaId: string | null) {
  return useQuery({
    queryKey: cmsKeys.versiones(paginaId ?? ""),
    queryFn: () => listarVersiones(paginaId as string),
    enabled: Boolean(paginaId),
    // Sin la migración no hay nada que reintentar: la pestaña lo dice y ya.
    retry: false,
  });
}

export function useInvalidarCms() {
  const qc = useQueryClient();
  return (portal?: PortalSlug, paginaId?: string) => {
    if (portal) void qc.invalidateQueries({ queryKey: cmsKeys.paginas(portal) });
    if (paginaId) {
      void qc.invalidateQueries({ queryKey: cmsKeys.bloques(paginaId) });
      void qc.invalidateQueries({ queryKey: cmsKeys.versiones(paginaId) });
    }
  };
}

export function usePublicar() {
  return useMutation({ mutationFn: publicarPagina });
}

/* ---------------------------------------------------------------------------
   Editores por portal (cms_editores, 0199). Los nombra solo la administración.
   ------------------------------------------------------------------------ */

export interface CmsEditor {
  id: string;
  user_id: string;
  portal: PortalSlug;
}

const clavesEditores = ["cms", "editores"] as const;

export function useEditores(activo: boolean) {
  return useQuery({
    queryKey: clavesEditores,
    enabled: activo,
    queryFn: async (): Promise<CmsEditor[]> => {
      const { data, error } = await supabase.from("cms_editores").select("id,user_id,portal").order("created_at");
      if (error) throw fallo(error);
      return (data ?? []) as CmsEditor[];
    },
  });
}

export function useGuardarEditor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { user_id: string; portal: PortalSlug }) => {
      const { error } = await supabase.from("cms_editores").insert(v);
      if (error) throw fallo(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEditores }),
  });
}

export function useQuitarEditor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cms_editores").delete().eq("id", id);
      if (error) throw fallo(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEditores }),
  });
}
