/* =============================================================================
   Mr. Pilo · Mis clases (beta) · los pedidos a la función `pilo-clases`.

   Cada pedido lleva la sesión de la cuenta de Pilo (la función comprueba que
   sea de estudiante o de profesor) y, salvo «conectar», el permiso de Moodle
   que guarda este dispositivo. La contraseña de Moodle pasa por aquí hacia la
   función una sola vez y no se guarda en ningún sitio.

   Nada de lo que llega se escribe en el almacenamiento: los cursos y las
   fechas viven en la memoria de la pantalla mientras está abierta.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { clasesFailure, failureOf, parseAgenda, parseCourse } from "./logic";
import type { Agenda, ClasesFailure, CourseDetail, SiteInfo } from "./logic";

export class ClasesError extends Error {
  constructor(readonly failure: ClasesFailure) {
    super(failure.message);
  }
}

export const asFailure = (error: unknown): ClasesFailure => (error instanceof ClasesError ? error.failure : failureOf("desconocido"));

async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";
  let session: string | undefined;
  try {
    session = (await supabase.auth.getSession()).data.session?.access_token;
  } catch {
    session = undefined;
  }
  if (!session) throw new ClasesError(failureOf("sesion"));
  const address = `${base}/functions/v1/pilo-clases`;
  let response: Response;
  try {
    response = await fetch(address, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${session}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    // El navegador no deja leer la respuesta: o no hay red, o la función no está desplegada (la plataforma
    // responde sin las cabeceras que el navegador pide). Una consulta sin leer la respuesta distingue las dos.
    const reachable = await fetch(address, { method: "GET", mode: "no-cors", cache: "no-store" }).then(
      () => true,
      () => false,
    );
    throw new ClasesError(failureOf(reachable ? "sin_funcion" : "sin_red"));
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* sin cuerpo, o no es JSON */
  }
  if (!response.ok) throw new ClasesError(clasesFailure(response.status, parsed));
  return parsed;
}

/** Pide a Moodle un permiso de lectura con el usuario y la contraseña de la persona. La contraseña no se guarda. */
export async function connectMoodle(username: string, password: string): Promise<{ token: string; site: SiteInfo }> {
  const out = (await call({ action: "conectar", username: username.trim(), password })) as { token?: unknown; site?: { name?: unknown; user?: unknown } } | null;
  if (typeof out?.token !== "string" || !out.token) throw new ClasesError(failureOf("desconocido"));
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");
  return { token: out.token, site: { name: text(out.site?.name), user: text(out.site?.user) } };
}

/** Los cursos de la persona y sus próximas entregas. */
export async function loadAgenda(token: string, signal?: AbortSignal): Promise<Agenda> {
  return parseAgenda(await call({ action: "agenda", token }, signal));
}

/** Las secciones, actividades y materiales de un curso. */
export async function loadCourse(token: string, course: number, signal?: AbortSignal): Promise<CourseDetail> {
  return parseCourse(await call({ action: "curso", token, course }, signal));
}
