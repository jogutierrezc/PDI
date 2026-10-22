/* =============================================================================
   Portal de agentes · los pedidos a la función `soporte`.

   Van con `fetch` directo y la clave anónima: quien escribe desde Pilo no tiene
   sesión (prueba que la conversación es suya con un secreto) y quien aún no
   entró al portal tampoco. Los agentes pasan `session: true` y llevan su token.
   Cada fallo llega como SoporteError con un texto que la persona entiende.
   ========================================================================== */

import { supabase } from "../../lib/supabase";

export class SoporteError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const asSoporteError = (error: unknown): SoporteError => (error instanceof SoporteError ? error : new SoporteError("Algo salió mal. Intente de nuevo.", "error"));

export async function soporte<T>(body: Record<string, unknown>, options: { session?: boolean } = {}): Promise<T> {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";
  let token = anonKey;
  if (options.session) {
    try {
      token = (await supabase.auth.getSession()).data.session?.access_token ?? anonKey;
    } catch {
      /* sin sesión: la función lo dirá */
    }
  }
  let response: Response;
  try {
    response = await fetch(`${base}/functions/v1/soporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SoporteError("Sin conexión. Seguimos intentando.", "red");
  }
  let parsed: { error?: unknown; code?: unknown; retry_after?: unknown } | null = null;
  try {
    parsed = await response.json();
  } catch {
    /* sin cuerpo, o no es JSON */
  }
  if (!response.ok) {
    const message = typeof parsed?.error === "string" ? parsed.error : response.status === 404 ? "El servicio de soporte todavía no está instalado." : "Algo salió mal. Intente de nuevo.";
    throw new SoporteError(message, typeof parsed?.code === "string" ? parsed.code : "error", Number(parsed?.retry_after) > 0 ? Number(parsed?.retry_after) : undefined);
  }
  return parsed as T;
}
