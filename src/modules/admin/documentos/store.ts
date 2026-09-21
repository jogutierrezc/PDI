/* =============================================================================
   Repositorio documental · lo que escribe la intranet.

   Las colecciones y sus documentos viven en la base (migración 0051) y los
   archivos en el bucket «documentos». A diferencia de la página de la oficina,
   aquí no hay borrador global: cada fila lleva su propio estado, así que una
   colección puede estar publicada mientras uno de sus documentos todavía se
   revisa, que es como se trabaja un repositorio de verdad.

   El archivo se sube en cuanto se elige, no al guardar: así la fila nace con
   su peso y su tipo ya medidos, y quien carga escribe el título mirando el
   documento, no recordándolo.

   La intranet ve el árbol entero —colecciones, sus secciones y los borradores
   de ambas—, a diferencia del portal, que solo recibe lo publicado.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError, FriendlyError } from "../../../data/errors";
import {
  DOC_BUCKET,
  collectionFrom,
  collectionTo,
  docPublicKey,
  itemFrom,
  itemTo,
} from "../../documentos/data";
import type { CollectionRow, DocCollection, DocItem, ItemRow } from "../../documentos/data";

export const docAdminKey = ["documentos-admin"] as const;

const MISSING = new Set(["PGRST205", "42P01"]);

export interface DocAdminState {
  /** Las colecciones de primer nivel. */
  collections: DocCollection[];
  /** Las secciones de cada colección, en su orden. */
  sections: Map<string, DocCollection[]>;
  /** Documentos por nodo, sea colección o sección. */
  byCollection: Map<string, DocItem[]>;
  /** Falta la migración 0051: se puede mirar, no guardar. */
  missing: boolean;
}

async function fetchAdmin(): Promise<DocAdminState> {
  const [collections, items] = await Promise.all([
    supabase.from("doc_collections").select("*").order("position").order("title"),
    supabase.from("doc_items").select("*").order("position").order("created_at"),
  ]);

  const failure = collections.error ?? items.error;
  if (failure) {
    if (MISSING.has(failure.code ?? "")) {
      return { collections: [], sections: new Map(), byCollection: new Map(), missing: true };
    }
    throw describeDatabaseError(failure);
  }

  const byCollection = new Map<string, DocItem[]>();
  for (const row of items.data as ItemRow[]) {
    const item = itemFrom(row);
    const list = byCollection.get(item.collectionId);
    if (list) list.push(item);
    else byCollection.set(item.collectionId, [item]);
  }

  const all = (collections.data as CollectionRow[]).map(collectionFrom);
  const sections = new Map<string, DocCollection[]>();
  for (const node of all) {
    if (node.parentId === null) continue;
    const list = sections.get(node.parentId);
    if (list) list.push(node);
    else sections.set(node.parentId, [node]);
  }

  return {
    collections: all.filter((node) => node.parentId === null),
    sections,
    byCollection,
    missing: false,
  };
}

export function useDocAdmin() {
  return useQuery({ queryKey: docAdminKey, queryFn: fetchAdmin, staleTime: 15_000 });
}

/** Tras cualquier escritura se refrescan las dos caras: la intranet y el portal. */
function useRefresh() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: docAdminKey });
    void client.invalidateQueries({ queryKey: docPublicKey });
  };
}

/* --- Colecciones ----------------------------------------------------------------------- */

export function useSaveCollection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (collection: Omit<DocCollection, "updatedAt">) => {
      const { error } = await supabase.from("doc_collections").upsert(collectionTo(collection));
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: refresh,
  });
}

export function useRemoveCollection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (collection: DocCollection) => {
      // Las secciones y los documentos caen con la colección (on delete
      // cascade); sus archivos no, así que se recogen aquí antes de perder las
      // rutas —los de la colección y los de cada una de sus secciones—.
      const { data: children } = await supabase
        .from("doc_collections")
        .select("id,cover")
        .eq("parent_id", collection.id);
      const nodes = (children ?? []) as { id: string; cover: string | null }[];
      const ids = [collection.id, ...nodes.map((node) => node.id)];

      const { data } = await supabase.from("doc_items").select("path").in("collection_id", ids);
      const paths = ((data ?? []) as { path: string | null }[])
        .map((row) => row.path)
        .filter((path): path is string => Boolean(path));
      for (const node of nodes) if (node.cover) paths.push(node.cover);
      if (collection.cover) paths.push(collection.cover);

      const { error } = await supabase.from("doc_collections").delete().eq("id", collection.id);
      if (error) throw describeDatabaseError(error);
      await removeDocFiles(paths);
    },
    onSuccess: refresh,
  });
}

/* --- Documentos ------------------------------------------------------------------------ */

export function useSaveItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (item: Omit<DocItem, "updatedAt">) => {
      const { error } = await supabase.from("doc_items").upsert(itemTo(item));
      if (error) throw describeDatabaseError(error);
    },
    onSuccess: refresh,
  });
}

export function useRemoveItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (item: DocItem) => {
      const { error } = await supabase.from("doc_items").delete().eq("id", item.id);
      if (error) throw describeDatabaseError(error);
      await removeDocFiles(item.path ? [item.path] : []);
    },
    onSuccess: refresh,
  });
}

/* --- Archivos -------------------------------------------------------------------------- */

export const MAX_DOC_BYTES = 50 * 1024 * 1024;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

const COVER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Extensiones que el portal sabe nombrar y que un navegador abre o descarga sin sorpresas. */
const DOC_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".csv", ".txt", ".zip", ".jpg", ".jpeg", ".png", ".webp",
];

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`
    : `${Math.round(bytes / 1024)} KB`;

function safeName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "documento"
  );
}

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

export interface UploadedDoc {
  path: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
}

/**
 * Sube un documento y devuelve lo que la fila necesita saber de él.
 *
 * La ruta lleva delante la colección y un sello de tiempo: subir dos veces
 * «acta.pdf» no sobrescribe la primera, y el navegador no sigue enseñando la
 * anterior desde su caché.
 */
export async function uploadDocFile(collectionId: string, file: File): Promise<UploadedDoc> {
  const extension = extensionOf(file.name);
  if (extension && !DOC_EXTENSIONS.includes(extension)) {
    throw new FriendlyError(
      `No se admiten archivos ${extension}. Formatos aceptados: ${DOC_EXTENSIONS.join(", ")}.`,
    );
  }
  if (file.size > MAX_DOC_BYTES) {
    throw new FriendlyError(
      `«${file.name}» pesa ${formatBytes(file.size)} y el máximo son ${formatBytes(MAX_DOC_BYTES)}. Si es un documento grande, súbelo a otro sitio y añádelo como enlace.`,
    );
  }

  const path = `${collectionId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw uploadError(error.message);

  return {
    path,
    fileName: file.name,
    fileType: extension.replace(".", "").toUpperCase(),
    sizeBytes: file.size,
  };
}

/** La tapa de una colección. */
export async function uploadDocCover(file: File): Promise<string> {
  if (!COVER_TYPES.includes(file.type)) {
    throw new FriendlyError(`«${file.name}» no es una imagen admitida. Sube un JPG, PNG, WebP o AVIF.`);
  }
  if (file.size > MAX_COVER_BYTES) {
    throw new FriendlyError(
      `«${file.name}» pesa ${formatBytes(file.size)} y el máximo son ${formatBytes(MAX_COVER_BYTES)}.`,
    );
  }
  const path = `tapas/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw uploadError(error.message);
  return path;
}

function uploadError(message: string) {
  return new FriendlyError(
    /bucket/i.test(message)
      ? 'No existe el bucket "documentos" en Storage. Aplica la migración 0051 o créalo a mano: público en lectura, 50 MB por archivo.'
      : `No se pudo subir el archivo: ${message}`,
  );
}

/** Borra archivos del bucket. Un fallo aquí no debe tumbar la edición. */
export async function removeDocFiles(paths: (string | null | undefined)[]) {
  const own = paths
    .map((path) => (path ?? "").trim())
    // Solo lo que vive en el bucket: una ruta de /public o una URL no es nuestra.
    .filter((path) => path && !path.startsWith("/") && !/^(https?:)?\/\//i.test(path));
  if (!own.length) return;
  const { error } = await supabase.storage.from(DOC_BUCKET).remove(own);
  if (error) console.warn("No se pudieron borrar los archivos:", error.message);
}
