/* =============================================================================
   Página de la oficina · dónde vive lo que se edita.

   Dos filas en `office_page` (migración 0050): «borrador», que solo ve la
   intranet, y «publicado», que ve cualquiera. Guardar escribe el borrador;
   publicar copia el borrador sobre el publicado. El portal no se entera de
   nada hasta ese segundo paso.

   Las fotografías no van en el documento: se suben al bucket «oficina» y en el
   documento queda su ruta. Una foto de equipo en base64 dentro de un jsonb
   engorda cada lectura del portal para siempre.

   Sin la migración aplicada la pantalla no se rompe: lo dice en un aviso y
   deja mirar, no guardar. Un borrador local aquí sería peor que nada —se
   escribe una página entera creyendo que está a salvo y vive en un navegador—.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import { FriendlyError } from "../../../data/errors";
import { DEFAULT_PAGE, OFFICE_BUCKET, normalizePage, officePageKey } from "../../planeacion/page";
import type { OfficePage } from "../../planeacion/page";

export const officeAdminKey = ["office-admin"] as const;

/** La base todavía sin la migración 0050. */
const MISSING = new Set(["PGRST205", "42P01"]);

export interface OfficeAdminState {
  draft: OfficePage;
  /** Nulo mientras la oficina no haya publicado nunca. */
  published: OfficePage | null;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  /** Falta la migración: se puede mirar, no guardar. */
  missing: boolean;
}

interface Row {
  state: "borrador" | "publicado";
  content: unknown;
  updated_at: string;
}

async function fetchState(): Promise<OfficeAdminState> {
  const { data, error } = await supabase.from("office_page").select("state,content,updated_at");

  if (error) {
    if (MISSING.has(error.code ?? "")) {
      return {
        draft: DEFAULT_PAGE,
        published: null,
        publishedAt: null,
        draftUpdatedAt: null,
        missing: true,
      };
    }
    throw describeDatabaseError(error);
  }

  const rows = (data ?? []) as Row[];
  const draftRow = rows.find((row) => row.state === "borrador");
  const publishedRow = rows.find((row) => row.state === "publicado");

  return {
    // Sin borrador todavía, se empieza por lo publicado; y sin nada publicado,
    // por el contenido del archivo. Así la primera visita ya encuentra la
    // página escrita en lugar de una pantalla de campos vacíos.
    draft: draftRow
      ? normalizePage(draftRow.content)
      : publishedRow
        ? normalizePage(publishedRow.content)
        : DEFAULT_PAGE,
    published: publishedRow ? normalizePage(publishedRow.content) : null,
    publishedAt: publishedRow?.updated_at ?? null,
    draftUpdatedAt: draftRow?.updated_at ?? null,
    missing: false,
  };
}

export function useOfficeAdmin() {
  return useQuery({
    queryKey: officeAdminKey,
    queryFn: fetchState,
    // La pantalla lleva su propio borrador en memoria mientras se escribe: un
    // refresco de fondo que lo reemplazara borraría lo tecleado.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id;
}

async function write(state: "borrador" | "publicado", content: OfficePage) {
  const { error } = await supabase
    .from("office_page")
    .upsert({ state, content, updated_by: await currentUserId() }, { onConflict: "state" });
  if (error) throw describeDatabaseError(error);
}

/** Guarda el borrador. No toca lo que ve el público. */
export function useOfficeSave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: OfficePage) => write("borrador", draft),
    onSuccess: (_result, draft) => {
      client.setQueryData<OfficeAdminState>(officeAdminKey, (current) =>
        current ? { ...current, draft, draftUpdatedAt: new Date().toISOString() } : current,
      );
    },
  });
}

/** Publica: el borrador pasa a ser lo que ve el portal. */
export function useOfficePublish() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draft: OfficePage) => {
      // El borrador se guarda primero: publicar lo que está en pantalla sin
      // dejarlo escrito dejaría las dos filas distintas y la comparación
      // siguiente mentiría.
      await write("borrador", draft);
      await write("publicado", draft);
    },
    onSuccess: (_result, draft) => {
      const now = new Date().toISOString();
      client.setQueryData<OfficeAdminState>(officeAdminKey, (current) =>
        current ? { ...current, draft, published: draft, publishedAt: now, draftUpdatedAt: now } : current,
      );
      // El portal público relee: la portada no puede quedarse con lo anterior.
      void client.invalidateQueries({ queryKey: officePageKey });
    },
  });
}

/* --- Fotografías ---------------------------------------------------------------------- */

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`
    : `${Math.round(bytes / 1024)} KB`;

/** Nombre sin tildes ni espacios: forma parte de una URL pública. */
function safeName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "foto"
  );
}

/**
 * Sube una fotografía al bucket y devuelve su ruta.
 *
 * El sello de tiempo delante evita que subir dos veces «equipo.jpg»
 * sobrescriba la primera, y que el navegador siga enseñando la foto vieja
 * desde su caché.
 */
export async function uploadOfficePhoto(folder: "galeria" | "equipo" | "cms", file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new FriendlyError(
      `«${file.name}» no es una imagen admitida. Sube un JPG, PNG, WebP o AVIF.`,
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new FriendlyError(
      `«${file.name}» pesa ${formatBytes(file.size)} y el máximo son ${formatBytes(MAX_PHOTO_BYTES)}. Redúcela antes de subirla.`,
    );
  }

  const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(OFFICE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new FriendlyError(
      /bucket/i.test(error.message)
        ? 'No existe el bucket "oficina" en Storage. Aplica la migración 0050 o créalo a mano: público en lectura, 8 MB por archivo.'
        : `No se pudo subir la fotografía: ${error.message}`,
    );
  }
  return path;
}

/** Borra una foto del bucket. Un fallo aquí no debe tumbar la edición. */
export async function removeOfficePhoto(path: string | null | undefined) {
  const value = (path ?? "").trim();
  // Solo se borra lo que vive en el bucket: una ruta de /public o una URL
  // externa no es nuestra.
  if (!value || value.startsWith("/") || /^(https?:)?\/\//i.test(value)) return;
  const { error } = await supabase.storage.from(OFFICE_BUCKET).remove([value]);
  if (error) console.warn("No se pudo borrar la fotografía anterior:", error.message);
}
