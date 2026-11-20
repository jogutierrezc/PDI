/* Planeación y Seguimiento · helpers compartidos por las implementaciones Supabase (fases 2 y 3). */

import { supabase } from "../../../lib/supabase";
import type { PsNivel } from "../modelo";

export type Fila = Record<string, unknown>;
export const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const falla = (e: { message?: string } | null): Error => new Error(e?.message || "No se pudo completar la operación.");
export const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
export const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const numero = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function miId(): Promise<string | null> {
  const r = await supabase.auth.getUser();
  return r.data.user?.id ?? null;
}
export async function nivel(): Promise<PsNivel> {
  const r = await supabase.rpc("ps_nivel_actual");
  if (r.error) throw falla(r.error);
  return ((r.data as PsNivel | null) ?? "none") as PsNivel;
}
export async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw falla(r.error);
  return r.data as T;
}
/** Vacía la cola de correos al momento (si no, sale con el cron). No bloquea ni falla la acción. */
export const despacharAvisos = () => {
  void supabase.functions.invoke("planeacion-seguimiento", { body: { action: "avisos" } }).catch(() => undefined);
};
