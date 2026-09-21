/* =============================================================================
   Repositorio documental · el dato.

   Dos tablas (migración 0051): colecciones y documentos. El portal las lee de
   una vez y deriva todo lo demás, porque casi todo lo que enseña la estantería
   —cuántos documentos guarda un tomo, de qué años es— no está guardado en
   ninguna columna: se calcula. Guardarlo abriría la puerta a que el lomo
   dijera una cosa y el índice otra, que es justo lo que un repositorio no
   puede permitirse.

   Las versiones tampoco son una columna: un documento apunta con `supersedes`
   a la edición que reemplaza, y la vigente es la que nadie reemplaza. Así
   añadir una versión nueva es una fila más, no reescribir la anterior.

   Una sección (migración 0052) es otra fila de la misma tabla con `parent_id`:
   hereda tapa, estado y permisos sin duplicar nada. Un documento cuelga de la
   colección o de una de sus secciones, y el lomo del tomo cuenta los dos.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { describeDatabaseError } from "../../data/errors";

export const DOC_BUCKET = "documentos";

/** Caché de lo publicado. La intranet la invalida al guardar. */
export const docPublicKey = ["documentos", "publicado"] as const;

/* --- El modelo ------------------------------------------------------------------------ */

export type DocStatus = "borrador" | "publicado";
export type DocKind = "archivo" | "enlace";

export interface DocCollection {
  id: string;
  /** Nulo en una colección de primer nivel; la madre en una sección. */
  parentId: string | null;
  slug: string;
  title: string;
  subtitle: string;
  cover: string;
  coverAlt: string;
  status: DocStatus;
  position: number;
  updatedAt: string;
}

export interface DocItem {
  id: string;
  collectionId: string;
  title: string;
  description: string;
  kind: DocKind;
  url: string | null;
  path: string | null;
  fileName: string;
  fileType: string;
  sizeBytes: number | null;
  year: number | null;
  yearTo: number | null;
  issuedOn: string | null;
  version: string;
  supersedes: string | null;
  status: DocStatus;
  position: number;
  updatedAt: string;
}

/** Un documento vigente con las ediciones que dejó atrás, de la más nueva a la más vieja. */
export interface DocEntry {
  item: DocItem;
  older: DocItem[];
}

/* --- Filas ⇄ modelo -------------------------------------------------------------------- */

export interface CollectionRow {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  subtitle: string;
  cover: string;
  cover_alt: string;
  status: DocStatus;
  position: number;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  collection_id: string;
  title: string;
  description: string;
  kind: DocKind;
  url: string | null;
  path: string | null;
  file_name: string;
  file_type: string;
  size_bytes: number | null;
  year: number | null;
  year_to: number | null;
  issued_on: string | null;
  version: string;
  supersedes: string | null;
  status: DocStatus;
  position: number;
  updated_at: string;
}

export const collectionFrom = (r: CollectionRow): DocCollection => ({
  id: r.id,
  parentId: r.parent_id ?? null,
  slug: r.slug,
  title: r.title,
  subtitle: r.subtitle ?? "",
  cover: r.cover ?? "",
  coverAlt: r.cover_alt ?? "",
  status: r.status,
  position: r.position,
  updatedAt: r.updated_at,
});

export const collectionTo = (c: Omit<DocCollection, "updatedAt">) => ({
  id: c.id,
  parent_id: c.parentId,
  slug: c.slug,
  title: c.title,
  subtitle: c.subtitle,
  cover: c.cover,
  cover_alt: c.coverAlt,
  status: c.status,
  position: c.position,
});

export const itemFrom = (r: ItemRow): DocItem => ({
  id: r.id,
  collectionId: r.collection_id,
  title: r.title,
  description: r.description ?? "",
  kind: r.kind,
  url: r.url,
  path: r.path,
  fileName: r.file_name ?? "",
  fileType: r.file_type ?? "",
  sizeBytes: r.size_bytes,
  year: r.year,
  yearTo: r.year_to,
  issuedOn: r.issued_on,
  version: r.version ?? "",
  supersedes: r.supersedes,
  status: r.status,
  position: r.position,
  updatedAt: r.updated_at,
});

export const itemTo = (i: Omit<DocItem, "updatedAt">) => ({
  id: i.id,
  collection_id: i.collectionId,
  title: i.title,
  description: i.description,
  kind: i.kind,
  // La restricción de la base exige que solo venga la fuente que toca.
  url: i.kind === "enlace" ? i.url : null,
  path: i.kind === "archivo" ? i.path : null,
  file_name: i.fileName,
  file_type: i.fileType,
  size_bytes: i.sizeBytes,
  year: i.year,
  year_to: i.yearTo,
  issued_on: i.issuedOn,
  version: i.version,
  supersedes: i.supersedes,
  status: i.status,
  position: i.position,
});

/* --- Derivados ------------------------------------------------------------------------- */

/** La dirección de un archivo del bucket, de una ruta de /public o de una URL. */
export function documentFileUrl(path: string | null | undefined): string | null {
  const value = (path ?? "").trim();
  if (!value) return null;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) return value;
  return supabase.storage.from(DOC_BUCKET).getPublicUrl(value).data.publicUrl;
}

/** A dónde lleva un documento: su enlace, o su archivo. */
export const documentHref = (item: DocItem): string | null =>
  item.kind === "enlace" ? (item.url ?? null) : documentFileUrl(item.path);

/** «2018-2025», «2025», o vacío si ninguno declara año. */
export function yearRange(items: DocItem[]): string {
  const years: number[] = [];
  for (const item of items) {
    if (item.year !== null) years.push(item.year);
    if (item.yearTo !== null) years.push(item.yearTo);
  }
  if (!years.length) return "";
  const from = Math.min(...years);
  const to = Math.max(...years);
  return from === to ? `${from}` : `${from}-${to}`;
}

/** Los años con algo dentro, del más reciente al más antiguo. */
export function yearsOf(items: DocItem[]): number[] {
  const years = new Set<number>();
  for (const item of items) {
    if (item.year === null) continue;
    const to = item.yearTo ?? item.year;
    for (let y = item.year; y <= to; y += 1) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** ¿Este documento cubre este año? */
export const coversYear = (item: DocItem, year: number) =>
  item.year !== null && year >= item.year && year <= (item.yearTo ?? item.year);

/**
 * Los documentos vigentes, cada uno con su historia.
 *
 * Una edición vigente es la que ninguna otra reemplaza. Se sigue la cadena
 * hacia atrás con un tope de vueltas: un ciclo mal capturado (A reemplaza a B
 * y B a A) dejaría esto girando para siempre, y el portal se quedaría en
 * blanco por un dato mal escrito.
 */
export function entriesOf(items: DocItem[]): DocEntry[] {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const superseded = new Set(items.map((item) => item.supersedes).filter((id): id is string => Boolean(id)));

  return items
    .filter((item) => !superseded.has(item.id))
    .map((item) => {
      const older: DocItem[] = [];
      const seen = new Set<string>([item.id]);
      let cursor = item.supersedes;
      while (cursor && !seen.has(cursor) && older.length < 24) {
        const previous = byId.get(cursor);
        if (!previous) break;
        older.push(previous);
        seen.add(previous.id);
        cursor = previous.supersedes;
      }
      return { item, older };
    });
}

/** Orden del índice: el año más reciente arriba; dentro del año, la posición. */
export function sortEntries(entries: DocEntry[]): DocEntry[] {
  return [...entries].sort((a, b) => {
    const ay = a.item.year ?? -1;
    const by = b.item.year ?? -1;
    if (ay !== by) return by - ay;
    if (a.item.position !== b.item.position) return a.item.position - b.item.position;
    return a.item.title.localeCompare(b.item.title, "es");
  });
}

/** Tipo legible: lo declarado, o lo que diga la extensión del archivo. */
export function documentType(item: DocItem): string {
  if (item.fileType.trim()) return item.fileType.trim().toUpperCase();
  if (item.kind === "enlace") return "Enlace";
  const name = item.fileName || item.path || "";
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "Archivo" : name.slice(dot + 1).toUpperCase();
}

/* --- Lectura pública ------------------------------------------------------------------- */

/** La base todavía sin la migración 0051: el portal lo dice, no falla. */
const MISSING = new Set(["PGRST205", "42P01"]);

export interface DocLibrary {
  /** Las colecciones de primer nivel: lo que se ve en la estantería. */
  collections: DocCollection[];
  /** Las secciones de cada colección, en su orden. */
  sections: Map<string, DocCollection[]>;
  /** Documentos por nodo, sea colección o sección. */
  byCollection: Map<string, DocItem[]>;
  /** Falta la migración: no hay repositorio que enseñar todavía. */
  missing: boolean;
}

/** Los documentos de una colección y de todas sus secciones. */
export function itemsUnder(
  collection: DocCollection,
  library: { sections: Map<string, DocCollection[]>; byCollection: Map<string, DocItem[]> },
): DocItem[] {
  const own = library.byCollection.get(collection.id) ?? [];
  const nested = (library.sections.get(collection.id) ?? []).flatMap(
    (section) => library.byCollection.get(section.id) ?? [],
  );
  return [...own, ...nested];
}



async function fetchLibrary(): Promise<DocLibrary> {
  const [collections, items] = await Promise.all([
    supabase.from("doc_collections").select("*").order("position").order("title"),
    supabase.from("doc_items").select("*").order("position"),
  ]);

  const failure = collections.error ?? items.error;
  if (failure) {
    if (MISSING.has(failure.code ?? "")) {
      return { collections: [], sections: new Map(), byCollection: new Map(), missing: true };
    }
    throw describeDatabaseError(failure);
  }

  // Los filtros van explícitos: una sesión de intranet también puede leer los
  // borradores, y el portal público no debe enseñárselos.
  const all = (collections.data as CollectionRow[]).map(collectionFrom).filter((c) => c.status === "publicado");
  const roots = all.filter((c) => c.parentId === null);
  const rootIds = new Set(roots.map((c) => c.id));

  const sections = new Map<string, DocCollection[]>();
  for (const node of all) {
    // Una sección cuya madre no esté publicada no entra, aunque ella lo esté.
    if (node.parentId === null || !rootIds.has(node.parentId)) continue;
    const list = sections.get(node.parentId);
    if (list) list.push(node);
    else sections.set(node.parentId, [node]);
  }

  const allowed = new Set([...rootIds, ...[...sections.values()].flat().map((s) => s.id)]);
  const byCollection = new Map<string, DocItem[]>();
  for (const row of items.data as ItemRow[]) {
    const item = itemFrom(row);
    if (item.status !== "publicado" || !allowed.has(item.collectionId)) continue;
    const list = byCollection.get(item.collectionId);
    if (list) list.push(item);
    else byCollection.set(item.collectionId, [item]);
  }

  return { collections: roots, sections, byCollection, missing: false };
}

export function useDocLibrary() {
  return useQuery({ queryKey: docPublicKey, queryFn: fetchLibrary, staleTime: 60_000 });
}

/** Normaliza para que «resolucion» encuentre «Resolución». */
export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
