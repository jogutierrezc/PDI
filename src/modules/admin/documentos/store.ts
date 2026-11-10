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

      const { data } = await supabase.from("doc_items").select("path,source_path,thumb_path,site_dir").in("collection_id", ids);
      const rows = (data ?? []) as { path: string | null; source_path: string | null; thumb_path: string | null; site_dir: string | null }[];
      const siteDirs = rows.map((row) => row.site_dir).filter((dir): dir is string => Boolean(dir));
      const paths = rows
        .flatMap((row) => [row.site_dir ? null : row.path, row.source_path, row.thumb_path])
        .filter((path): path is string => Boolean(path));
      for (const node of nodes) if (node.cover) paths.push(node.cover);
      if (collection.cover) paths.push(collection.cover);

      const { error } = await supabase.from("doc_collections").delete().eq("id", collection.id);
      if (error) throw describeDatabaseError(error);
      await removeDocFiles(paths);
      for (const dir of siteDirs) await removePortalDir(dir);
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
      await removeDocFiles([item.siteDir ? null : item.path, item.sourcePath, item.thumbPath]);
      await removePortalDir(item.siteDir);
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
  // Resultados de Quarto y R Markdown (ya renderizados), HTML y Markdown.
  ".html", ".htm", ".md",
];

/** Código fuente que acompaña a un .html de Quarto o R: se muestra como texto, no se ejecuta. */
const SOURCE_EXTENSIONS = [".qmd", ".rmd", ".r"];
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

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

/** El código fuente (.qmd, .Rmd, .R) de un documento de Quarto o R. */
export async function uploadSourceFile(collectionId: string, file: File): Promise<{ path: string; name: string }> {
  const extension = extensionOf(file.name);
  if (!SOURCE_EXTENSIONS.includes(extension)) {
    throw new FriendlyError(`«${file.name}» no es código fuente de Quarto ni de R. Sube un archivo ${SOURCE_EXTENSIONS.join(", ")}.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new FriendlyError(`«${file.name}» pesa ${formatBytes(file.size)} y el máximo del código fuente son ${formatBytes(MAX_SOURCE_BYTES)}.`);
  }
  const path = `${collectionId}/fuente-${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: "text/plain", upsert: false });
  if (error) throw uploadError(error.message);
  return { path, name: file.name };
}

/** La miniatura de un documento (ya reducida por miniatura.ts). */
export async function uploadThumb(collectionId: string, blob: Blob): Promise<string> {
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `miniaturas/${collectionId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
  if (error) throw uploadError(error.message);
  return path;
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

/* --- Microportales ---------------------------------------------------------------------- */

export const MAX_PORTAL_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_PORTAL_FILES = 4000;
const MAX_PORTAL_FILE_BYTES = MAX_DOC_BYTES;

/** El tipo con que se entrega cada archivo; sin él un navegador no ejecuta el sitio. */
const PORTAL_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json", geojson: "application/geo+json", map: "application/json", webmanifest: "application/manifest+json",
  xml: "application/xml", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", md: "text/markdown; charset=utf-8",
  bib: "text/plain; charset=utf-8", yml: "text/plain; charset=utf-8", yaml: "text/plain; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm",
  pdf: "application/pdf", wasm: "application/wasm", zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Lo que Storage acepta en el nombre de un archivo. Los acentos y la «ñ» no. */
const PORTAL_NAME = /^[A-Za-z0-9_\-./ ()+,=@]+$/;

export interface UploadedPortal {
  /** portales/<id>-<sello> */
  dir: string;
  /** portales/<id>-<sello>/index.html */
  entryPath: string;
  fileCount: number;
  totalBytes: number;
  /** La página de entrada, para medirla y sacarle la miniatura. */
  entryFile: File;
}

const mimeOf = (name: string) => PORTAL_TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

/**
 * Descomprime un .zip con un sitio ya renderizado y sube cada archivo a
 * portales/<id>-<sello>/. Si el .zip trae una carpeta madre (docs/, _site/, el
 * nombre del proyecto…), se toma como raíz la carpeta que contiene el index.html
 * más cercano a la superficie.
 */
export async function uploadPortalZip(
  itemId: string,
  zip: File,
  onProgress: (done: number, total: number) => void,
): Promise<UploadedPortal> {
  if (extensionOf(zip.name) !== ".zip") throw new FriendlyError(`«${zip.name}» no es un .zip. Comprime la carpeta del sitio (la que tiene el index.html) y vuelve a elegirla.`);
  if (zip.size > MAX_PORTAL_ZIP_BYTES) throw new FriendlyError(`«${zip.name}» pesa ${formatBytes(zip.size)} y el máximo son ${formatBytes(MAX_PORTAL_ZIP_BYTES)}.`);

  const { unzipSync } = await import("fflate");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
      // Lo que nunca es parte del sitio: no se descomprime siquiera.
      filter: (info) => !/(^|\/)(__MACOSX\/|\.[^/]*$|Thumbs\.db$)/i.test(info.name) && !info.name.endsWith("/"),
    });
  } catch {
    throw new FriendlyError("No se pudo abrir el .zip. Puede estar dañado o protegido con contraseña.");
  }

  const names = Object.keys(entries);
  const indexes = names.filter((name) => /(^|\/)index\.html$/i.test(name)).sort((a, b) => a.split("/").length - b.split("/").length);
  if (!indexes.length) throw new FriendlyError("El .zip no trae ningún index.html. Comprime la carpeta que lo contiene (en Quarto, la carpeta docs/ o _site/).");
  const rootDir = indexes[0].slice(0, indexes[0].length - "index.html".length);
  const files = names.filter((name) => name.startsWith(rootDir)).map((name) => ({ name: name.slice(rootDir.length), data: entries[name] }));

  if (files.length > MAX_PORTAL_FILES) throw new FriendlyError(`El sitio trae ${files.length} archivos y el máximo son ${MAX_PORTAL_FILES}.`);
  const big = files.find((file) => file.data.length > MAX_PORTAL_FILE_BYTES);
  if (big) throw new FriendlyError(`«${big.name}» pesa ${formatBytes(big.data.length)} y el máximo por archivo son ${formatBytes(MAX_PORTAL_FILE_BYTES)}. Quítalo del sitio o enlázalo desde otro lado.`);
  const badNames = files.filter((file) => !PORTAL_NAME.test(file.name)).map((file) => file.name);
  if (badNames.length) {
    throw new FriendlyError(
      `Hay ${badNames.length} archivo(s) con acentos, «ñ» o símbolos que el almacenamiento no admite: ${badNames.slice(0, 4).join(", ")}${badNames.length > 4 ? "…" : ""}. Renómbralos sin esos caracteres (y corrige los enlaces que los usan) y vuelve a comprimir.`,
    );
  }

  const dir = `portales/${itemId}-${Date.now().toString(36)}`;
  const total = files.length;
  let done = 0;
  let next = 0;
  let failure = null as FriendlyError | null;

  // Seis a la vez: suficiente para ir rápido sin saturar al servidor.
  async function worker() {
    while (!failure) {
      const index = next++;
      if (index >= total) return;
      const file = files[index];
      const { error } = await supabase.storage.from(DOC_BUCKET).upload(`${dir}/${file.name}`, new Blob([file.data as BlobPart], { type: mimeOf(file.name) }), {
        contentType: mimeOf(file.name),
        upsert: true,
      });
      if (error) {
        failure = uploadError(`${file.name}: ${error.message}`);
        return;
      }
      done += 1;
      onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failure) {
    await removePortalDir(dir);
    throw failure;
  }

  const entry = files.find((file) => file.name === "index.html")!;
  return {
    dir,
    entryPath: `${dir}/index.html`,
    fileCount: total,
    totalBytes: files.reduce((sum, file) => sum + file.data.length, 0),
    entryFile: new File([entry.data as BlobPart], "index.html", { type: "text/html" }),
  };
}

/**
 * ¿El servidor entrega la página de entrada como una página web? Algunos
 * almacenamientos la devuelven como texto o con una política que impide
 * ejecutarla. Devuelve el motivo si no, o nulo si todo está bien.
 */
export async function checkPortalServed(entryPath: string): Promise<string | null> {
  try {
    const url = supabase.storage.from(DOC_BUCKET).getPublicUrl(entryPath).data.publicUrl;
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!response.ok) return `El servidor respondió ${response.status} al pedir la página de entrada.`;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("text/html")) return `El servidor entrega la página como «${type || "tipo desconocido"}» y no como página web, así que el navegador la mostraría como texto.`;
    const policy = response.headers.get("content-security-policy") ?? "";
    if (/default-src\s+'none'|script-src\s+'none'/i.test(policy)) return "El servidor añade una política de seguridad que impide ejecutar los scripts y estilos del sitio.";
    return null;
  } catch {
    return null;
  }
}

/** Todos los archivos bajo una carpeta del bucket, bajando por las subcarpetas. */
async function listPortalFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const pending = [dir];
  while (pending.length) {
    const folder = pending.pop() as string;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(DOC_BUCKET).list(folder, { limit: 1000, offset });
      if (error || !data?.length) break;
      for (const entry of data) {
        // Una carpeta no trae id ni metadatos.
        if (entry.id) out.push(`${folder}/${entry.name}`);
        else pending.push(`${folder}/${entry.name}`);
      }
      if (data.length < 1000) break;
    }
  }
  return out;
}

/** Borra la carpeta entera de un microportal. Un fallo no tumba la edición. */
export async function removePortalDir(dir: string | null | undefined) {
  if (!dir || !/^portales\/[A-Za-z0-9_-]+$/.test(dir)) return;
  const files = await listPortalFiles(dir);
  for (let i = 0; i < files.length; i += 200) {
    const { error } = await supabase.storage.from(DOC_BUCKET).remove(files.slice(i, i + 200));
    if (error) console.warn("No se pudo borrar parte del microportal:", error.message);
  }
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
