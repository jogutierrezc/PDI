/* =============================================================================
   Biblioteca de evidencias · lecturas y escrituras contra Supabase (0152).

   El bucket es privado («ranking-biblioteca»); la ruta de cada archivo sale de
   su SHA-256 («<2 primeras>/<hash>.<ext>»): subir dos veces el mismo
   contenido escribe el mismo objeto, y la fila no se repite (sha256 único).
   Así una subida cortada se reanuda sin duplicar nada.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import type { RankingBibliotecaRow, RankingResponseRow } from "../../../types/database";
import { FaltaMigracion } from "../noticias";
import { CLAVES as CLAVES_REPORTE, errorDe as errorReporte } from "../reporte/datos";
import type { Clasificacion } from "./clasificar";
import { YaGuardado } from "./errores";

export const BUCKET_BIBLIOTECA = "ranking-biblioteca";
const PAGINA = 1000;
/** Columnas de la lista: sin el texto leído (hasta 20 000 caracteres por archivo). */
const COLUMNAS_LISTA =
  "id, ciclo, zip_nombre, ruta_zip, nombre, carpeta, ext, tamano, mime, sha256, storage_path, anio_detectado, estado_texto, nota_texto, ods_propuestos, propuestas, estado, indicador_aceptado, respuesta_aceptada, evidencia, subido_por, created_at, updated_at";

export type ArchivoBiblioteca = Omit<RankingBibliotecaRow, "texto">;

interface ErrorBase {
  code?: string;
  message?: string;
}

const MIGRACION = "Falta aplicar la migración 0152 (biblioteca de evidencias).";

export function errorDe(e: ErrorBase): Error {
  if (e.code === "42P01" || e.code === "PGRST205" || /ranking_biblioteca|biblioteca/i.test(e.message ?? "") && /does not exist|schema cache|column/i.test(e.message ?? "")) {
    return new FaltaMigracion(MIGRACION);
  }
  return errorReporte(e);
}

export const CLAVES = {
  lista: ["biblioteca", "lista"] as const,
  url: (ruta: string) => ["biblioteca", "url", ruta] as const,
};

export function useBiblioteca() {
  return useQuery({
    queryKey: CLAVES.lista,
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<ArchivoBiblioteca[]> => {
      const salida: ArchivoBiblioteca[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await supabase
          .from("ranking_biblioteca")
          .select(COLUMNAS_LISTA)
          .order("created_at", { ascending: false })
          .order("ruta_zip")
          .range(desde, desde + PAGINA - 1);
        if (r.error) throw errorDe(r.error);
        const filas = (r.data as unknown as ArchivoBiblioteca[] | null) ?? [];
        salida.push(...filas);
        if (filas.length < PAGINA) break;
      }
      return salida;
    },
  });
}

/** URL firmada (10 minutos) para ver o descargar un archivo privado. */
export function useUrlFirmada(ruta: string | null, bucket = BUCKET_BIBLIOTECA) {
  return useQuery({
    queryKey: [...CLAVES.url(ruta ?? ""), bucket],
    enabled: Boolean(ruta),
    retry: false,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const r = await supabase.storage.from(bucket).createSignedUrl(ruta ?? "", 600);
      if (r.error) throw new Error(`No se pudo abrir el archivo: ${r.error.message}`);
      return r.data.signedUrl;
    },
  });
}

/** Texto leído de un archivo (para reclasificar sin volver a leerlo). */
export async function textoDe(id: string): Promise<string> {
  const r = await supabase.from("ranking_biblioteca").select("texto").eq("id", id).single();
  if (r.error) throw errorDe(r.error);
  return (r.data as { texto: string }).texto;
}

/** Los SHA-256 ya guardados, para avisar antes de subir. */
export async function hashesGuardados(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let desde = 0; ; desde += PAGINA) {
    const r = await supabase.from("ranking_biblioteca").select("sha256, ruta_zip").range(desde, desde + PAGINA - 1);
    if (r.error) throw errorDe(r.error);
    const filas = (r.data as { sha256: string; ruta_zip: string }[] | null) ?? [];
    for (const f of filas) mapa.set(f.sha256, f.ruta_zip);
    if (filas.length < PAGINA) break;
  }
  return mapa;
}

/** Ruta del objeto en el bucket, por su contenido. */
export function rutaPorHash(sha: string, ext: string): string {
  const e = /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
  return `${sha.slice(0, 2)}/${sha}${e}`;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface ArchivoNuevo {
  ciclo: string | null;
  zipNombre: string;
  ruta: string;
  nombre: string;
  carpeta: string;
  ext: string;
  sha256: string;
  bytes: Uint8Array;
  texto: string;
  estadoTexto: RankingBibliotecaRow["estado_texto"];
  notaTexto: string | null;
  clasificacion: Clasificacion;
}

export { YaGuardado };

/** Sube un archivo y registra su fila. Mismo contenido = mismo objeto; si la fila ya existe, YaGuardado. */
export async function guardarArchivo(a: ArchivoNuevo): Promise<void> {
  const ruta = rutaPorHash(a.sha256, a.ext);
  const mime = MIME[a.ext] ?? "application/octet-stream";
  const subida = await supabase.storage.from(BUCKET_BIBLIOTECA).upload(ruta, new Blob([a.bytes as Uint8Array<ArrayBuffer>], { type: mime }), { contentType: mime, upsert: true });
  if (subida.error) throw new Error(`No se pudo subir «${a.ruta}»: ${subida.error.message}`);
  const c = a.clasificacion;
  const r = await supabase.from("ranking_biblioteca").insert({
    ciclo: a.ciclo,
    zip_nombre: a.zipNombre,
    ruta_zip: a.ruta,
    nombre: a.nombre,
    carpeta: a.carpeta,
    ext: a.ext,
    tamano: a.bytes.length,
    mime,
    sha256: a.sha256,
    storage_path: ruta,
    anio_detectado: c.anio,
    texto: a.texto,
    estado_texto: a.estadoTexto,
    nota_texto: a.notaTexto,
    ods_propuestos: c.ods,
    propuestas: c.propuestas,
    estado: c.estado === "sin_coincidencia" ? "sin_clasificar" : "propuesta",
  });
  if (r.error) {
    if (r.error.code === "23505") throw new YaGuardado(`«${a.ruta}» ya estaba en la biblioteca.`);
    throw errorDe(r.error);
  }
}

/** Cambia estado o propuestas de archivos (descartar, volver a proponer, reclasificar). */
export function useActualizarArchivos() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, cambios }: { ids: string[]; cambios: Partial<Pick<RankingBibliotecaRow, "estado" | "propuestas" | "ods_propuestos" | "anio_detectado">> }) => {
      for (let i = 0; i < ids.length; i += 200) {
        const r = await supabase.from("ranking_biblioteca").update(cambios).in("id", ids.slice(i, i + 200));
        if (r.error) throw errorDe(r.error);
      }
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVES.lista }),
  });
}

/** Borra archivos de la biblioteca (fila y objeto). Los ya ligados como evidencia pierden el enlace. */
export function useBorrarArchivos() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ archivos }: { archivos: ArchivoBiblioteca[] }) => {
      for (const a of archivos) {
        const r = await supabase.from("ranking_biblioteca").delete().eq("id", a.id);
        if (r.error) throw errorDe(r.error);
        await supabase.storage.from(BUCKET_BIBLIOTECA).remove([a.storage_path]);
      }
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: CLAVES.lista }),
  });
}

export const AVISO_PRIVADA = "Archivo privado de la biblioteca: THE solo da el punto de «pública» con un enlace público. Pegue el enlace cuando lo tenga.";

export interface Aceptacion {
  archivo: ArchivoBiblioteca;
  ciclo: string;
  indicador: string;
  unidad: string;
  /** Enlace público opcional (https) que se agrega junto con el archivo. */
  enlacePublico?: string;
}

/**
 * Liga un archivo de la biblioteca como evidencia del indicador para la oficina
 * elegida (por defecto Planeación Institucional). Crea la respuesta si no
 * existe. Repetirlo no duplica: el índice único (respuesta, biblioteca) lo impide.
 */
export async function aceptarArchivo(p: Aceptacion): Promise<RankingResponseRow> {
  const up = await supabase.from("ranking_responses").upsert({ ciclo: p.ciclo, indicador: p.indicador, unidad: p.unidad }, { onConflict: "ciclo,indicador,unidad", ignoreDuplicates: true });
  if (up.error) throw errorReporte(up.error);
  const sel = await supabase.from("ranking_responses").select("*").eq("ciclo", p.ciclo).eq("indicador", p.indicador).eq("unidad", p.unidad).single();
  if (sel.error) throw errorReporte(sel.error);
  let respuesta = sel.data as RankingResponseRow;
  if (respuesta.estado === "none") {
    const d = await supabase.from("ranking_responses").update({ estado: "draft" }).eq("id", respuesta.id).select("*").single();
    if (!d.error) respuesta = d.data as RankingResponseRow;
  }

  let evidencia: string | null = null;
  const ins = await supabase
    .from("ranking_evidence")
    .insert({
      response_id: respuesta.id,
      kind: "file",
      storage_path: p.archivo.storage_path,
      nombre: p.archivo.nombre,
      mime: p.archivo.mime,
      // ranking_evidence admite hasta 15 MB; el tamaño real queda en la biblioteca.
      tamano: p.archivo.tamano <= 15 * 1024 * 1024 ? p.archivo.tamano : null,
      publica: false,
      analisis: [{ nivel: "warn", texto: AVISO_PRIVADA }],
      optimizada: false,
      biblioteca: p.archivo.id,
    })
    .select("id")
    .single();
  if (ins.error && ins.error.code !== "23505") throw errorDe(ins.error);
  if (ins.data) evidencia = (ins.data as { id: string }).id;
  else {
    const ya = await supabase.from("ranking_evidence").select("id").eq("response_id", respuesta.id).eq("biblioteca", p.archivo.id).maybeSingle();
    evidencia = (ya.data as { id: string } | null)?.id ?? null;
  }

  const enlace = p.enlacePublico?.trim();
  if (enlace) {
    const existe = await supabase.from("ranking_evidence").select("id").eq("response_id", respuesta.id).eq("url", enlace).maybeSingle();
    if (!existe.data) {
      const e = await supabase.from("ranking_evidence").insert({ response_id: respuesta.id, kind: "url", url: enlace, nombre: p.archivo.nombre, publica: true, analisis: [], optimizada: false });
      if (e.error) throw errorReporte(e.error);
    }
  }

  const u = await supabase
    .from("ranking_biblioteca")
    .update({ estado: "aceptada", indicador_aceptado: p.indicador, respuesta_aceptada: respuesta.id, evidencia, ciclo: p.ciclo })
    .eq("id", p.archivo.id);
  if (u.error) throw errorDe(u.error);
  return respuesta;
}

export function useAceptarArchivos() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (lista: Aceptacion[]) => {
      const errores: string[] = [];
      let ciclo = "";
      for (const a of lista) {
        ciclo = a.ciclo;
        try {
          await aceptarArchivo(a);
        } catch (e) {
          errores.push(`${a.archivo.nombre}: ${e instanceof Error ? e.message : "no se pudo aceptar"}`);
        }
      }
      return { aceptados: lista.length - errores.length, errores, ciclo };
    },
    onSuccess: ({ ciclo }) => {
      void cliente.invalidateQueries({ queryKey: CLAVES.lista });
      if (ciclo) {
        void cliente.invalidateQueries({ queryKey: CLAVES_REPORTE.respuestas(ciclo) });
        void cliente.invalidateQueries({ queryKey: CLAVES_REPORTE.aportes(ciclo) });
      }
      void cliente.invalidateQueries({ queryKey: ["reporte", "evidencias"] });
    },
  });
}
