/* =============================================================================
   Portales públicos · lo que lee y escribe la pantalla de administración.

   Las tres tablas (pub_portales, pub_menu, pub_bitacora; migración 0263) se
   leen y se escriben directo: las políticas RLS dejan pasar solo al rol admin,
   y los disparadores anotan en la bitácora quién cambió qué. Si la migración
   no está aplicada, cada lectura dice «falta» y la pantalla lo explica.
   ========================================================================== */

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { CLAVE_ESTADO } from "./estado";

export const MIGRACION = "0263";

export interface PortalFila {
  slug: string;
  nombre: string;
  descripcion: string;
  rutas: string[];
  orden: number;
  habilitado: boolean;
  mensaje: string;
  regreso: string | null;
  updated_at: string;
}

export interface MenuFila {
  clave: string;
  portal: string;
  etiqueta_original: string;
  oculto: boolean;
  etiqueta: string | null;
  destino: string | null;
  desde: string | null;
  hasta: string | null;
  nota: string;
  updated_at: string;
}

export interface BitacoraFila {
  id: number;
  actor_nombre: string;
  accion: string;
  clave: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  created_at: string;
}

/** Una lectura que puede decir «falta la migración». */
export type Leido<T> = { falta: true } | { falta: false; datos: T };

type DbError = { code?: string; message?: string };

function faltaMigracion(error: DbError | null): boolean {
  if (!error) return false;
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "") || /could not find the (table|function)|does not exist/i.test(error.message ?? "");
}

const fallo = (error: DbError, que: string): Error => {
  if (error.code === "42501") return new Error("Su rol no permite hacer esto: solo la administración puede cambiar los portales públicos.");
  if (error.code === "23514") return new Error("La base rechazó un valor: revise el destino (ruta interna que empiece con «/» o dirección https://), la etiqueta y las fechas.");
  return new Error(`${que}${error.message ? ` (${error.message})` : ""}`);
};

export const claves = {
  portales: ["pub", "admin", "portales"] as const,
  menu: ["pub", "admin", "menu"] as const,
  bitacora: ["pub", "admin", "bitacora"] as const,
};

export async function leerPortales(): Promise<Leido<PortalFila[]>> {
  const { data, error } = await supabase.from("pub_portales" as never).select("*").order("orden");
  if (error) {
    if (faltaMigracion(error)) return { falta: true };
    throw fallo(error, "No se pudieron leer los portales.");
  }
  return { falta: false, datos: (data ?? []) as unknown as PortalFila[] };
}

export async function leerMenu(): Promise<Leido<MenuFila[]>> {
  const { data, error } = await supabase.from("pub_menu" as never).select("*");
  if (error) {
    if (faltaMigracion(error)) return { falta: true };
    throw fallo(error, "No se pudo leer el menú.");
  }
  return { falta: false, datos: (data ?? []) as unknown as MenuFila[] };
}

export async function leerBitacora(): Promise<Leido<BitacoraFila[]>> {
  const { data, error } = await supabase.from("pub_bitacora" as never).select("*").order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (faltaMigracion(error)) return { falta: true };
    throw fallo(error, "No se pudo leer el historial.");
  }
  return { falta: false, datos: (data ?? []) as unknown as BitacoraFila[] };
}

/** Después de escribir: se refresca esta pantalla y también el estado que lee el sitio en esta misma pestaña. */
export function refrescar(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["pub"] });
  void queryClient.invalidateQueries({ queryKey: CLAVE_ESTADO });
}

export async function guardarPortal(slug: string, cambios: { habilitado: boolean; mensaje: string; regreso: string | null }): Promise<void> {
  const { data, error } = await supabase
    .from("pub_portales" as never)
    .update({ habilitado: cambios.habilitado, mensaje: cambios.mensaje.trim(), regreso: cambios.regreso } as never)
    .eq("slug", slug)
    .select("slug");
  if (error) throw fallo(error, "No se pudo guardar el portal.");
  if (!data || (data as unknown[]).length === 0) throw new Error("No se guardó nada: su rol no permite cambiar los portales o el portal ya no existe.");
}

export type CambioMenu = Pick<MenuFila, "clave" | "portal" | "etiqueta_original" | "oculto" | "etiqueta" | "destino" | "desde" | "hasta" | "nota">;

export async function guardarMenu(fila: CambioMenu): Promise<void> {
  const { error } = await supabase.from("pub_menu" as never).upsert(fila as never, { onConflict: "clave" });
  if (error) throw fallo(error, "No se pudo guardar el vínculo.");
}

export async function restaurarMenu(clave: string): Promise<void> {
  const { error } = await supabase.from("pub_menu" as never).delete().eq("clave", clave);
  if (error) throw fallo(error, "No se pudo restaurar el vínculo.");
}

/* --- Fechas ------------------------------------------------------------------------------ */

/** ISO → «2026-11-10T08:00» en hora local, para <input type="datetime-local">. */
export function aCampoFecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** «2026-11-10T08:00» (hora local) → ISO; vacío → null. */
export function deCampoFecha(valor: string): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type EstadoVinculo = "original" | "cambiado" | "oculto" | "programado" | "vencido";

/** Cómo está hoy un vínculo, según su fila (o su ausencia). */
export function estadoDe(fila: MenuFila | undefined, ahora = Date.now()): EstadoVinculo {
  if (!fila) return "original";
  if (!fila.oculto && !fila.etiqueta && !fila.destino) return "original";
  if (fila.desde && new Date(fila.desde).getTime() > ahora) return "programado";
  if (fila.hasta && new Date(fila.hasta).getTime() <= ahora) return "vencido";
  return fila.oculto ? "oculto" : "cambiado";
}
