/* =============================================================================
   Pilo at Work · acceso a datos y a las funciones del servidor.

   Las tablas pw_* se leen y escriben directo con RLS (la base decide quién puede).
   Las funciones (pilo-work, pw-microsoft, pw-avisos) llevan la sesión de la persona.
   Ninguna clave viaja al navegador.
   ========================================================================== */

import { supabase } from "../../lib/supabase";

export type Rol = "colaborador" | "colaborador_correo" | "coordinacion" | "admin";

export const ROL_ETIQUETA: Record<Rol, string> = {
  colaborador: "Colaborador",
  colaborador_correo: "Colaborador con correo",
  coordinacion: "Coordinación",
  admin: "Administración",
};

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
export const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";

export const functionUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

export async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? ANON_KEY;
  return { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${token}` };
}

export class WorkError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Un pedido JSON a una función; los errores llegan en español, tal como los dice el servidor. */
export async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(functionUrl(name), { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  } catch {
    throw new WorkError("No hay conexión con el servidor. Revise su red.", "red");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: string; advice?: string }) | null;
  if (!response.ok) throw new WorkError(data?.error ? `${data.error}${data.advice ? ` ${data.advice}` : ""}` : "El servidor no respondió como se esperaba.", data?.code, response.status);
  return data as T;
}

export const callWork = <T>(body: Record<string, unknown>) => callFn<T>("pilo-work", body);

/* --- Rol --------------------------------------------------------------------------------- */

export async function miRol(): Promise<Rol | null> {
  const { data, error } = await supabase.rpc("pw_mi_rol");
  if (error) return null;
  return (typeof data === "string" ? data : null) as Rol | null;
}

export interface Perfil {
  userId: string;
  nombre: string;
  correo: string;
  dependencia: string;
  rol: Rol;
}

export async function leerPerfil(rol: Rol): Promise<Perfil | null> {
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) return null;
  const [{ data: r }, { data: u }] = await Promise.all([
    supabase.from("pw_roles").select("nombre, dependencia, correo").eq("user_id", user.id).maybeSingle(),
    supabase.from("pilo_users").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);
  const nombre = (r?.nombre as string) || (u?.full_name as string) || (user.user_metadata?.full_name as string) || (user.email ?? "").split("@")[0];
  return { userId: user.id, nombre, correo: (r?.correo as string) || (u?.email as string) || user.email || "", dependencia: (r?.dependencia as string) ?? "", rol };
}

/* --- Tipos de las tablas ------------------------------------------------------------------- */

export interface Memoria {
  id: string;
  texto: string;
  origen: string;
  confianza: "alta" | "media" | "nueva";
  activa: boolean;
  estado: "propuesta" | "aceptada";
  nueva: boolean;
  creado_en: string;
}
export interface Colectiva {
  id: string;
  texto: string;
  activa: boolean;
  usos: number;
  creado_en: string;
}
export interface Propuesta {
  id: string;
  user_id: string;
  autor: string;
  texto: string;
  origen: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  creado_en: string;
}
export interface Skill {
  id: string;
  user_id: string | null;
  alcance: "personal" | "oficina";
  nombre: string;
  cuando: string;
  instrucciones: string;
  herramientas: string[];
  activa: boolean;
  usos: number;
  color: string;
  nueva: boolean;
}
export interface Bloque {
  k: "titulo" | "meta" | "h" | "p" | "fecha" | "dest" | "asunto" | "firma";
  t: string;
}
export interface Documento {
  id: string;
  titulo: string;
  tipo: string;
  bloques: Bloque[];
  equipo_id: string | null;
  actualizado_en: string;
}

export const HERRAMIENTAS: Record<string, string> = { mem: "Memoria", cow: "Cowork", datos: "Datos locales", mail: "Correo", agenda: "Agenda" };

/** Una cuenta de «hace un rato» legible. */
export function hace(fecha: string): string {
  const m = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return new Date(fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Una señal de tarea repetida (para que Pilo proponga una skill); devuelve el contador nuevo. */
export async function marcarSenal(userId: string, clave: string): Promise<number> {
  const { data } = await supabase.from("pw_senales").select("n").eq("user_id", userId).eq("clave", clave).maybeSingle();
  const n = ((data?.n as number) ?? 0) + 1;
  if (data) await supabase.from("pw_senales").update({ n, actualizado_en: new Date().toISOString() }).eq("user_id", userId).eq("clave", clave);
  else await supabase.from("pw_senales").insert({ user_id: userId, clave, n });
  return n;
}
