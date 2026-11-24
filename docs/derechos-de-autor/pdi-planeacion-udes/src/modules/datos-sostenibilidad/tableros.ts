/* =============================================================================
   Datos de Sostenibilidad · tableros personalizados (TanStack Query + Supabase, migración 0204).

   Un tablero es una cuadrícula de 12 columnas con indicadores del catálogo,
   gráficas de la unidad, títulos, textos y separadores. La base decide quién lo
   ve, lo edita y lo publica (RLS y disparador); estos hooks no repiten permisos.
   Sin la migración, las lecturas de la intranet fallan con FaltaMigracion y las
   públicas (useTableroPublico, useTablerosPublicos) devuelven vacío: el portal
   queda como estaba. El contrato completo, en README.md → «Tableros».
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { errorSos, invalidar, sosKeys } from "./sos";
import type { CifraPublicaSos, ConfigTablero, ElementoTablero, TableroPublicoResumen, TableroPublicoSos, TableroSos, TableroSosEntrada } from "./tipos";

const COLUMNAS_TABLERO = "id,nombre,slug,descripcion,config,publicado,publicado_por,publicado_en,archivado,creado_por,created_at,updated_at";

export const tablerosKeys = {
  publicos: ["sos", "tableros-publicos"] as const,
  publico: (slug: string) => ["sos", "tablero-publico", slug] as const,
  indicadoresPublicados: ["sos", "indicadores-publicados"] as const,
};

/** La configuración que se guarda siempre trae versión y una lista de elementos, venga lo que venga. */
export function configDe(crudo: unknown): ConfigTablero {
  const c = (crudo && typeof crudo === "object" ? crudo : {}) as Partial<ConfigTablero>;
  return {
    version: 1,
    campus: typeof c.campus === "string" ? c.campus : null,
    selector: c.selector === true,
    elementos: Array.isArray(c.elementos) ? (c.elementos as ElementoTablero[]) : [],
  };
}

/** Un enlace a partir de un nombre: minúsculas, sin tildes, con guiones (2 a 60 caracteres). */
export function slugDe(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : "tablero";
}

/** La dirección pública de un tablero. */
export const urlTablero = (slug: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/sostenible/tablero/${slug}`;

/* --- Lecturas ---------------------------------------------------------------------------- */

/** Todos los tableros que ve la persona (los archivados incluidos; la pantalla filtra). */
export function useTableros() {
  return useQuery({
    queryKey: sosKeys.tableros,
    queryFn: async (): Promise<TableroSos[]> => {
      const r = await supabase.from("sos_tableros").select(COLUMNAS_TABLERO).order("updated_at", { ascending: false });
      if (r.error) throw errorSos(r.error);
      return (r.data ?? []).map((t) => ({ ...(t as unknown as TableroSos), config: configDe(t.config) }));
    },
  });
}

/** Los indicadores que hoy ve el público, con su nombre, para elegirlos en el CMS. Falla visible si falta la migración. */
export function useIndicadoresPublicados() {
  return useQuery({
    queryKey: tablerosKeys.indicadoresPublicados,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<CifraPublicaSos[]> => {
      const r = await supabase.rpc("sos_cifras_publicas");
      if (r.error) throw errorSos(r.error);
      return Array.isArray(r.data) ? (r.data as CifraPublicaSos[]) : [];
    },
  });
}

/** Un tablero publicado con los datos públicos de lo que nombra. Pública; sin migración, sin red o sin tablero, `null`. */
export function useTableroPublico(slug: string | undefined) {
  return useQuery({
    queryKey: tablerosKeys.publico(slug ?? ""),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<TableroPublicoSos | null> => {
      const r = await supabase.rpc("sos_tablero_publico", { p_slug: slug });
      if (r.error || !r.data || typeof r.data !== "object") return null;
      return r.data as TableroPublicoSos;
    },
  });
}

/** La lista de tableros publicados. Pública; el CMS la usa para elegir uno. Falla visible si falta la migración. */
export function useTablerosPublicos() {
  return useQuery({
    queryKey: tablerosKeys.publicos,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<TableroPublicoResumen[]> => {
      const r = await supabase.rpc("sos_tableros_publicos");
      if (r.error) throw errorSos(r.error);
      return Array.isArray(r.data) ? (r.data as TableroPublicoResumen[]) : [];
    },
  });
}

/* --- Escrituras -------------------------------------------------------------------------- */

/** Lo que cambia cuando un tablero se guarda o se publica: la lista, lo público y el CMS. */
function refrescar(client: ReturnType<typeof useQueryClient>) {
  invalidar(client);
  void client.invalidateQueries({ queryKey: tablerosKeys.publicos });
  void client.invalidateQueries({ queryKey: ["sos", "tablero-publico"] });
}

/** Crea (sin `id`) o edita un tablero. No toca `publicado` ni `archivado`: usa usePublicarTablero y useArchivarTablero. El enlace repetido se avisa. */
export function useGuardarTablero() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (t: TableroSosEntrada): Promise<TableroSos> => {
      const fila = { nombre: t.nombre.trim(), slug: t.slug.trim(), descripcion: t.descripcion.trim(), config: configDe(t.config) };
      const r = t.id
        ? await supabase.from("sos_tableros").update(fila).eq("id", t.id).select(COLUMNAS_TABLERO).single()
        : await supabase.from("sos_tableros").insert(fila).select(COLUMNAS_TABLERO).single();
      if (r.error) {
        if (r.error.code === "23505") throw new Error(`Ya existe un tablero con el enlace «${fila.slug}». Elija otro.`);
        throw errorSos(r.error);
      }
      return { ...(r.data as unknown as TableroSos), config: configDe(r.data.config) };
    },
    onSuccess: () => refrescar(client),
  });
}

/** Publica o retira un tablero (papel Crea o más en la unidad; la base lo hace cumplir). */
export function usePublicarTablero() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; publicado: boolean }) => {
      const r = await supabase.from("sos_tableros").update({ publicado: v.publicado }).eq("id", v.id).select("id").single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => refrescar(client),
  });
}

/** Archiva o restaura un tablero (quien lo creó o Administra). Archivar lo retira del portal. */
export function useArchivarTablero() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; archivado: boolean }) => {
      const r = await supabase.from("sos_tableros").update({ archivado: v.archivado }).eq("id", v.id).select("id").single();
      if (r.error) throw errorSos(r.error);
      return r.data;
    },
    onSuccess: () => refrescar(client),
  });
}

/** Borra un tablero para siempre (quien lo creó o Administra). La pantalla solo lo ofrece con los archivados. */
export function useBorrarTablero() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("sos_tableros").delete().eq("id", id);
      if (r.error) throw errorSos(r.error);
    },
    onSuccess: () => refrescar(client),
  });
}
