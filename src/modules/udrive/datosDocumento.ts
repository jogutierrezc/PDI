/* =============================================================================
   UDrive · datos del documento (TanStack Query + Supabase, migración 0188).

   Mismo patrón que datos.ts: la base decide (RLS, guardias y funciones); estos
   hooks solo llaman. El contenido del documento se lee y se guarda con
   useContenido / useGuardarContenido de datos.ts; aquí están el estado y la
   aprobación, el turno de edición, las versiones, los comentarios y las
   cifras vivas. El cliente nunca manda updated_at, estado_doc ni el turno:
   esas columnas solo cambian con las funciones.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { UD_CLAVES, errorDe, rpc } from "./datos";

export type EstadoDocumento = "borrador" | "revision" | "aprobado";

export interface EstadoDeDocumento {
  estado_doc: EstadoDocumento;
  aprobado_por_nombre: string | null;
  aprobado_en: string | null;
}

const clave = {
  docEstado: (id: string) => ["ud", "doc-estado", id] as const,
  versiones: (id: string) => ["ud", "versiones", id] as const,
  comentarios: (id: string) => ["ud", "comentarios", id] as const,
  cifras: (claves: string) => ["ud", "cifras", claves] as const,
  catalogoCifras: ["ud", "cifras-catalogo"] as const,
};

/** Estado del documento y quién lo aprobó (la lista del explorador no trae esos datos). */
export function useEstadoDocumento(id: string | undefined) {
  return useQuery({
    queryKey: clave.docEstado(id ?? ""),
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<EstadoDeDocumento> => {
      const filas = await rpc<EstadoDeDocumento[]>("drive_doc_estado_de", { p_id: id });
      return filas?.[0] ?? { estado_doc: "borrador", aprobado_por_nombre: null, aprobado_en: null };
    },
  });
}

/* ---------- el turno de edición ---------------------------------------------------------- */

export interface Turno {
  tengo: boolean;
  por: string | null;
  por_nombre: string | null;
  hasta: string | null;
  pedido_por_nombre: string | null;
}

/** Toma o renueva el turno. El editor lo llama al abrir y cada minuto; el turno dura 3 minutos. */
export async function tomarTurno(id: string): Promise<Turno> {
  const filas = await rpc<Turno[]>("drive_doc_tomar_turno", { p_id: id });
  return filas?.[0] ?? { tengo: false, por: null, por_nombre: null, hasta: null, pedido_por_nombre: null };
}
export const soltarTurno = (id: string) => rpc<void>("drive_doc_soltar_turno", { p_id: id });
export const pedirTurno = (id: string) => rpc<void>("drive_doc_pedir_turno", { p_id: id });
export const cederTurno = (id: string) => rpc<void>("drive_doc_ceder_turno", { p_id: id });

/* ---------- estado y aprobación ---------------------------------------------------------- */

export function useCambiarEstadoDocumento() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; a: "borrador" | "revision" }) => rpc<void>("drive_doc_estado", { p_id: a.id, p_a: a.a }),
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: clave.docEstado(a.id) }),
  });
}

export function useAprobarDocumento() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; congeladas: unknown; datos: unknown; nota: string }) => rpc<void>("drive_doc_aprobar", { p_id: a.id, p_congeladas: a.congeladas, p_datos: a.datos, p_nota: a.nota }),
    onSuccess: (_x, a) => {
      void c.invalidateQueries({ queryKey: clave.docEstado(a.id) });
      void c.invalidateQueries({ queryKey: UD_CLAVES.contenido(a.id) });
      void c.invalidateQueries({ queryKey: clave.versiones(a.id) });
    },
  });
}

/* ---------- versiones ---------------------------------------------------------------------- */

/** El contenido de varios archivos a la vez (la instantánea que guarda una versión). */
export async function leerContenidos(ids: readonly string[]): Promise<Record<string, unknown>> {
  const salida: Record<string, unknown> = {};
  for (let i = 0; i < ids.length; i += 40) {
    const r = await supabase.from("drive_archivos").select("id, contenido").in("id", ids.slice(i, i + 40));
    if (r.error) throw errorDe(r.error);
    for (const f of (r.data ?? []) as { id: string; contenido: unknown }[]) salida[f.id] = f.contenido;
  }
  return salida;
}

export interface VersionFila {
  id: string;
  numero: number;
  nota: string;
  autor_nombre: string | null;
  created_at: string;
  bloques: number;
}

export function useVersiones(id: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: clave.versiones(id ?? ""),
    enabled: Boolean(id) && activo,
    retry: false,
    queryFn: async () => (await rpc<VersionFila[]>("drive_doc_versiones", { p_id: id })) ?? [],
  });
}

/** El contenido y la instantánea de una versión (pesan: solo al abrirla o compararla). */
export async function leerVersion(id: string): Promise<{ contenido: unknown; datos: Record<string, unknown> }> {
  const r = await supabase.from("drive_versiones").select("contenido, datos").eq("id", id).maybeSingle();
  if (r.error) throw errorDe(r.error);
  if (!r.data) throw new Error("Esa versión ya no existe.");
  return r.data as { contenido: unknown; datos: Record<string, unknown> };
}

export function useGuardarVersion() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; nota: string; datos: unknown }) => rpc<{ id: string; numero: number }[]>("drive_doc_guardar_version", { p_id: a.id, p_nota: a.nota, p_datos: a.datos }),
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: clave.versiones(a.id) }),
  });
}

export function useRestaurarVersion() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; version: string }) => rpc<void>("drive_doc_restaurar_version", { p_id: a.id, p_version: a.version }),
    onSuccess: (_x, a) => {
      void c.invalidateQueries({ queryKey: clave.versiones(a.id) });
      void c.invalidateQueries({ queryKey: UD_CLAVES.contenido(a.id) });
    },
  });
}

/* ---------- comentarios -------------------------------------------------------------------- */

export interface ComentarioFila {
  id: string;
  bloque_id: string;
  texto: string;
  resuelto: boolean;
  autor: string;
  autor_nombre: string | null;
  created_at: string;
}

export function useComentarios(id: string | undefined) {
  return useQuery({
    queryKey: clave.comentarios(id ?? ""),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => (await rpc<ComentarioFila[]>("drive_doc_comentarios", { p_id: id })) ?? [],
  });
}

export function useComentar() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { documento: string; bloque: string; texto: string }) => {
      const r = await supabase.from("drive_comentarios").insert({ id: crypto.randomUUID(), documento_id: a.documento, bloque_id: a.bloque, texto: a.texto });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: clave.comentarios(a.documento) }),
  });
}

export function useResolverComentario() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { documento: string; id: string; resuelto: boolean }) => {
      const r = await supabase.from("drive_comentarios").update({ resuelto: a.resuelto }).eq("id", a.id).select("id");
      if (r.error) throw errorDe(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para resolver este comentario.");
    },
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: clave.comentarios(a.documento) }),
  });
}

export function useBorrarComentario() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { documento: string; id: string }) => {
      const r = await supabase.from("drive_comentarios").delete().eq("id", a.id).select("id");
      if (r.error) throw errorDe(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para borrar este comentario.");
    },
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: clave.comentarios(a.documento) }),
  });
}

/* ---------- cifras vivas -------------------------------------------------------------------- */

export interface CifraCatalogo {
  clave: string;
  nombre: string;
}

/** Las cifras de UDES en Cifras que se pueden insertar en un texto. */
export function useCatalogoCifras() {
  return useQuery({
    queryKey: clave.catalogoCifras,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => (await rpc<CifraCatalogo[]>("drive_cifras_catalogo", {})) ?? [],
  });
}

export interface LecturaDeCifra {
  clave: string;
  valor: number | string | null;
  fuente: string | null;
  corte: string | null;
}

/** El valor vivo de las cifras pedidas; se refresca cada minuto mientras el documento está abierto. */
export function useLecturasCifras(claves: readonly string[], activo: boolean) {
  const lista = [...claves].sort();
  return useQuery({
    queryKey: clave.cifras(lista.join(",")),
    enabled: activo && lista.length > 0,
    retry: false,
    staleTime: 30_000,
    refetchInterval: activo ? 60_000 : false,
    queryFn: async () => (await rpc<LecturaDeCifra[]>("drive_cifras_vivas", { p_claves: lista, p_anio: null })) ?? [],
  });
}
