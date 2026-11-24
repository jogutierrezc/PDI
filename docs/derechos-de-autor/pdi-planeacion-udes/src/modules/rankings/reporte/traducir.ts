/* =============================================================================
   Traducción del comentario al inglés con Pilo.

   Llama a la acción «traducir-texto» de la función pilo-rankingsod, que usa el
   mismo proveedor de IA y la misma verificación de cifras y siglas que los
   informes. Solo devuelve la traducción: el español se guarda aparte y no se
   toca aquí.

   TraduccionNoDisponible es solo para un fallo real (sin sesión, sin IA,
   proveedor caído o respuesta que no pasa la verificación).
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { errorComentario, normalizarComentario } from "./comentario";

export class TraduccionNoDisponible extends Error {}

export const MENSAJE_TRADUCCION_NO_DISPONIBLE =
  "Pilo no pudo traducir el comentario. El español se guarda igual; intenta de nuevo en un momento.";

/** Devuelve el texto en inglés. Vacío devuelve vacío; más de 1000 caracteres se rechaza sin llamar a la IA. */
export async function traducir(texto: string): Promise<string> {
  const limpio = normalizarComentario(texto);
  if (!limpio) return "";
  const exceso = errorComentario(limpio);
  if (exceso) throw new Error(exceso);

  const { data, error } = await supabase.functions.invoke("pilo-rankingsod", {
    body: { action: "traducir-texto", texto: limpio },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensaje = MENSAJE_TRADUCCION_NO_DISPONIBLE;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string }) : null;
      if (j?.error) mensaje = j.error;
    } catch {
      /* se queda el mensaje general */
    }
    throw new TraduccionNoDisponible(mensaje);
  }
  const en = (data as { en?: unknown } | null)?.en;
  if (typeof en !== "string" || !en.trim()) throw new TraduccionNoDisponible(MENSAJE_TRADUCCION_NO_DISPONIBLE);
  return en;
}
