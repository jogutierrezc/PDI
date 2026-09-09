/* =============================================================================
   Archivos en Supabase Storage.

   El portal guardaba solo enlaces: el repositorio documental apunta a archivos
   que viven fuera. El módulo de proyectos es la primera pantalla que recibe un
   archivo del navegador, así que aquí queda lo que hace falta para subirlo,
   nombrarlo y volver a encontrarlo, y en ningún otro sitio.

   El bucket es público en lectura —lo crea la migración 0013— porque el
   documento que formula un proyecto es del mismo tipo que lo que ya se publica
   en el repositorio. Lo que exige sesión es escribir.
   ========================================================================== */

import { supabase } from "../lib/supabase";
import { FriendlyError } from "./errors";

export const PROJECT_BUCKET = "proyectos";

/** 25 MB, el mismo tope que declara el bucket. Se comprueba antes de subir
 *  para dar un mensaje en vez de un error de red a mitad de la carga. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".png", ".jpg", ".jpeg"];

export interface StoredFile {
  path: string;
  name: string;
  size: number;
}

/**
 * Un nombre seguro y único dentro del bucket.
 *
 * El nombre original se conserva aparte, en `attachment_name`: es el que ve la
 * persona. El de Storage lleva delante el id del proyecto y un sello de tiempo
 * para que subir dos veces "Proyecto.pdf" no sobrescriba el primero, y va sin
 * tildes ni espacios porque forma parte de una URL.
 */
function safePath(projectId: string, fileName: string): string {
  const clean = fileName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${projectId}/${Date.now()}-${clean || "archivo"}`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/** 1048576 → "1 MB". Para decir qué pesa antes de que alguien lo descargue. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export async function uploadProjectFile(projectId: string, file: File): Promise<StoredFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FriendlyError(
      `El archivo pesa ${formatBytes(file.size)} y el máximo son ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  const extension = fileExtension(file.name);
  if (extension && !ALLOWED.includes(extension)) {
    throw new FriendlyError(
      `No se admiten archivos ${extension}. Formatos aceptados: ${ALLOWED.join(", ")}.`,
    );
  }

  const path = safePath(projectId, file.name);
  const { error } = await supabase.storage.from(PROJECT_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) {
    // El error de Storage no es un error de PostgREST y no pasa por
    // describeDatabaseError; el más frecuente con diferencia es el bucket sin
    // crear, así que se nombra.
    throw new FriendlyError(
      /bucket/i.test(error.message)
        ? 'No existe el bucket "proyectos" en Storage. Aplica la migración 0013 o créalo a mano.'
        : `No se pudo subir el archivo: ${error.message}`,
    );
  }

  return { path, name: file.name, size: file.size };
}

/** Se borra el anterior al reemplazarlo: un archivo huérfano en el bucket no lo
 *  encuentra nadie y sigue ocupando la cuota. Un fallo aquí no debe tumbar el
 *  guardado, que es lo que de verdad importa. */
export async function removeProjectFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(PROJECT_BUCKET).remove([path]);
  if (error) console.warn("No se pudo borrar el archivo anterior:", error.message);
}

export function projectFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(PROJECT_BUCKET).getPublicUrl(path).data.publicUrl;
}
