/* =============================================================================
   Mr. Pilo · Mis notas (beta) · los pedidos a la función `pilo-genesis`.

   Cada pedido lleva la sesión de la cuenta de Pilo (la función comprueba que
   sea de estudiante) y, salvo «conectar», el permiso firmado que guarda este
   dispositivo. La contraseña de Génesis pasa por aquí hacia la función una
   sola vez y no se guarda en ningún sitio. El código del estudiante no viaja
   después del ingreso: la función lo saca del permiso.

   Nada de lo que llega se escribe en el almacenamiento: las notas viven en la
   memoria de la pantalla mientras está abierta.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { failureOf, notasFailure, parseHead, parseHistory } from "./logic";
import type { History, NotasFailure, NotasHead } from "./logic";

export class NotasError extends Error {
  constructor(readonly failure: NotasFailure) {
    super(failure.message);
  }
}

export const asFailure = (error: unknown): NotasFailure => (error instanceof NotasError ? error.failure : failureOf("desconocido"));

async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";
  let session: string | undefined;
  try {
    session = (await supabase.auth.getSession()).data.session?.access_token;
  } catch {
    session = undefined;
  }
  if (!session) throw new NotasError(failureOf("sesion"));
  const address = `${base}/functions/v1/pilo-genesis`;
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
    throw new NotasError(failureOf(reachable ? "sin_funcion" : "sin_red"));
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* sin cuerpo, o no es JSON */
  }
  if (!response.ok) throw new NotasError(notasFailure(response.status, parsed));
  return parsed;
}

/** Entra a Génesis con el código y la contraseña de la persona y trae el permiso firmado. La contraseña no se guarda. */
export async function connectGenesis(code: string, password: string): Promise<{ permit: string; expires: number; head: NotasHead }> {
  const out = (await call({ action: "conectar", code: code.trim(), password })) as { permit?: unknown; expires?: unknown; head?: unknown } | null;
  const expires = Number(out?.expires);
  if (typeof out?.permit !== "string" || !out.permit || !Number.isInteger(expires) || expires <= 0) throw new NotasError(failureOf("desconocido"));
  return { permit: out.permit, expires, head: parseHead(out.head) };
}

/** El histórico: los periodos con sus promedios, sus créditos y sus materias. */
export async function loadHistory(permit: string, signal?: AbortSignal): Promise<History> {
  return parseHistory(await call({ action: "historico", permit }, signal));
}

/** El polígrafo oficial, tal como lo entrega Génesis: un PDF listo para descargar. */
export async function loadPolygraphPdf(permit: string): Promise<Blob> {
  const out = (await call({ action: "poligrafo_pdf", permit })) as { pdf?: unknown } | null;
  if (typeof out?.pdf !== "string" || !out.pdf) throw new NotasError(failureOf("pdf"));
  try {
    const raw = atob(out.pdf);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: "application/pdf" });
  } catch {
    throw new NotasError(failureOf("pdf"));
  }
}
