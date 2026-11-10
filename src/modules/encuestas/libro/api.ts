/* =============================================================================
   Libro de la Rendición de Cuentas · acceso a datos.

     · enc_libros (0274): la configuración del libro de cada encuesta.
     · bucket «enc-libro» (0274): las imágenes de portada y contraportada.
     · función Edge «pilo-libro»: la narrativa y los ODS que redacta Pilo. La
       respuesta nunca trae proveedor ni modelo.

   Mientras database.ts no traiga enc_libros el cliente se usa sin tipos aquí y solo aquí.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readFunctionError, supabase } from "../../../lib/supabase";
import { leerConfigLibro } from "./modelo";
import type { ConfigLibro, DatoPagina, IdPagina } from "./modelo";

const sb = supabase as unknown as SupabaseClient;
const BUCKET = "enc-libro";

export class FaltaMigracionLibro extends Error {
  constructor() {
    super("Falta aplicar la migración 0274 (Libro de la Rendición de Cuentas).");
  }
}

const faltaTabla = (e: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(e.code ?? "") || /enc_libros.*(does not exist|schema cache)/i.test(e.message ?? "");

export async function leerLibro(encuestaId: string): Promise<{ config: ConfigLibro; guardado: boolean }> {
  const r = await sb.from("enc_libros").select("config").eq("encuesta_id", encuestaId).maybeSingle();
  if (r.error) throw faltaTabla(r.error) ? new FaltaMigracionLibro() : new Error(r.error.message);
  return { config: leerConfigLibro(r.data?.config), guardado: Boolean(r.data) };
}

export async function guardarLibro(encuestaId: string, config: ConfigLibro): Promise<void> {
  const r = await sb.from("enc_libros").upsert({ encuesta_id: encuestaId, config }, { onConflict: "encuesta_id" });
  if (r.error) throw faltaTabla(r.error) ? new FaltaMigracionLibro() : new Error(r.error.message);
}

/* ---------- imágenes ---------- */

export const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGEN = 8 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function validarImagen(f: File): string | null {
  if (!(TIPOS_IMAGEN as readonly string[]).includes(f.type)) return "Use una imagen JPG, PNG o WebP.";
  if (f.size > MAX_IMAGEN) return "La imagen pesa más de 8 MB. Reduzca su tamaño y vuelva a intentarlo.";
  return null;
}

/** Sube la imagen a <encuesta>/<cara>-<sello>.<ext> y devuelve la ruta. */
export async function subirImagen(encuestaId: string, cara: "portada" | "contra", f: File): Promise<string> {
  const mal = validarImagen(f);
  if (mal) throw new Error(mal);
  const ruta = `${encuestaId}/${cara}-${Date.now().toString(36)}.${EXT[f.type]}`;
  const r = await sb.storage.from(BUCKET).upload(ruta, f, { contentType: f.type, upsert: false, cacheControl: "3600" });
  if (r.error) throw new Error(/bucket not found/i.test(r.error.message) ? "Falta el bucket «enc-libro»: aplique la migración 0274." : r.error.message);
  return ruta;
}

export async function quitarImagen(ruta: string): Promise<void> {
  await sb.storage.from(BUCKET).remove([ruta]);
}

/** Una URL firmada de una hora para ver la imagen (el bucket es privado). */
export async function urlImagen(ruta: string): Promise<string | null> {
  const r = await sb.storage.from(BUCKET).createSignedUrl(ruta, 3600);
  return r.error ? null : r.data.signedUrl;
}

/* ---------- Pilo ---------- */

async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("pilo-libro", { body: cuerpo });
  if (r.error) {
    const contexto = (r.error as { context?: Response }).context;
    if (!contexto) throw new Error("No se pudo llegar a Pilo: la función «pilo-libro» puede no estar desplegada.");
    const detalle = await readFunctionError(r.error);
    throw new Error(detalle || `Pilo respondió ${contexto.status}.`);
  }
  return r.data as T;
}

export const estadoPilo = (encuestaId: string) => invocar<{ ok: boolean; ai: boolean; motivo?: string }>({ action: "estado", encuesta_id: encuestaId });

export async function narrarConPilo(encuestaId: string, paginas: { clave: IdPagina; pagina: string; datos: DatoPagina[] }[], tono: "i" | "c", largo: 1 | 2): Promise<Record<string, string>> {
  const r = await invocar<{ ok: boolean; textos: Record<string, string> }>({ action: "narrar", encuesta_id: encuestaId, paginas, tono, largo });
  return r.textos;
}

export async function clasificarOds(encuestaId: string, aportes: { id: string; tipo: "logro" | "reto"; titulo: string; descripcion: string; dependencia: string }[]): Promise<Record<string, number[]>> {
  const salida: Record<string, number[]> = {};
  for (let i = 0; i < aportes.length; i += 25) {
    const r = await invocar<{ ok: boolean; ods: Record<string, number[]> }>({ action: "ods", encuesta_id: encuestaId, aportes: aportes.slice(i, i + 25) });
    Object.assign(salida, r.ods);
  }
  return salida;
}
