/* =============================================================================
   Presentación con Pilo · cliente de la función de borde `pilo-presentaciones`.

   `fetch` + SSE (patrón de components/pilo/ai/client.ts: la clave anónima y el
   token de la sesión). Entrega los pasos, el razonamiento de Astra en vivo y la
   presentación. Los fallos conocidos llegan como ErrorPresentacionCliente con su
   código (astra_apagado, astra_limite, presentacion_invalida, sin_acceso…).
   ========================================================================== */

import { createSseParser } from "../../../components/pilo/ai/client";
import { supabase } from "../../../lib/supabase";
import { leerPresentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { Presentacion } from "../../../../supabase/functions/pilo-presentaciones/esquema";
import type { NoVerificado } from "../../../../supabase/functions/pilo-presentaciones/verificar";
import type { Tono } from "../../../../supabase/functions/pilo-presentaciones/tonos";

export type { NoVerificado };

export class ErrorPresentacionCliente extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryAfter?: number,
    readonly detalle?: string[],
  ) {
    super(message);
  }
}

export interface PedidoPresentacion {
  instancia_id: string;
  tono: Tono;
  duracion_min?: number;
  enfoque?: string;
  informe: Record<string, unknown>;
}

export interface PasoPresentacion {
  id: "leyendo" | "organizando" | "redactando" | "validando";
  texto: string;
}

export interface ResultadoPresentacion {
  presentacion: Presentacion;
  no_verificado: NoVerificado[];
  ajustes: string[];
  pensamiento_s: number;
  reintento: boolean;
}

export interface ManejadoresPresentacion {
  onStep?: (p: PasoPresentacion) => void;
  onThinking?: (texto: string) => void;
  signal?: AbortSignal;
}

const MENSAJES: Record<string, string> = {
  astra_apagado: "Pilo Astra 1.0 no está encendido. La presentación solo se crea con Astra: la administración debe activarlo.",
  astra_limite: "Llegó al límite de presentaciones con Astra por esta hora. Vuelva a intentar más tarde.",
  sin_acceso: "No tiene acceso a este informe.",
  sin_sesion: "Su sesión venció. Entre de nuevo.",
  informe_grande: "El informe es demasiado grande para armar una presentación de una vez.",
  presentacion_invalida: "Pilo no logró una presentación válida. Intente de nuevo o cambie el tono.",
  tiempo: "Astra tardó más de lo que se puede esperar. Intente de nuevo.",
  cancelado: "Se canceló la presentación.",
};
export const mensajeDeCodigo = (code: string, fallback = "No se pudo crear la presentación.") => MENSAJES[code] ?? fallback;

/** Un error HTTP (JSON) de la función, antes de abrir el flujo. */
export function errorHttp(status: number, cuerpo: unknown, retryAfter?: string | null): ErrorPresentacionCliente {
  const o = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { error?: unknown; code?: unknown; retry_after?: unknown };
  const code = typeof o.code === "string" ? o.code : status === 429 ? "astra_limite" : status === 401 ? "sin_sesion" : status === 403 ? "sin_acceso" : "proveedor";
  const espera = Number(retryAfter ?? o.retry_after);
  return new ErrorPresentacionCliente(typeof o.error === "string" && o.error ? o.error : mensajeDeCodigo(code), code, Number.isFinite(espera) && espera > 0 ? espera : undefined);
}

/** Lee el flujo SSE por partes. Cumple con el resultado, o falla con el `error` del flujo. Pura: se prueba sin red. */
export async function consumirFlujo(chunks: AsyncIterable<string>, h: ManejadoresPresentacion = {}): Promise<ResultadoPresentacion> {
  const sse = createSseParser();
  let resultado: ResultadoPresentacion | null = null;
  let fallo: ErrorPresentacionCliente | null = null;
  const atender = (m: { event: string; data: string }) => {
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(m.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (m.event === "step") h.onStep?.({ id: d.id as PasoPresentacion["id"], texto: String(d.texto ?? "") });
    else if (m.event === "thinking") h.onThinking?.(String(d.text ?? ""));
    else if (m.event === "done") {
      const p = leerPresentacion(d.presentacion, (d.presentacion as { tono?: Tono })?.tono ?? "institucional");
      if (!p) fallo = new ErrorPresentacionCliente("La presentación llegó incompleta. Intente de nuevo.", "presentacion_invalida");
      else
        resultado = {
          presentacion: p,
          no_verificado: Array.isArray(d.no_verificado) ? (d.no_verificado as NoVerificado[]) : [],
          ajustes: Array.isArray(d.ajustes) ? (d.ajustes as string[]) : [],
          pensamiento_s: Number(d.pensamiento_s) || 0,
          reintento: d.reintento === true,
        };
    } else if (m.event === "error") {
      const code = String(d.code ?? "proveedor");
      fallo = new ErrorPresentacionCliente(String(d.message ?? mensajeDeCodigo(code)), code, undefined, Array.isArray(d.detalle) ? (d.detalle as string[]) : undefined);
    }
  };
  for await (const c of chunks) for (const m of sse.push(c)) atender(m);
  for (const m of sse.flush()) atender(m);
  if (fallo) throw fallo;
  if (!resultado) throw new ErrorPresentacionCliente("El flujo terminó sin presentación. Intente de nuevo.", "proveedor");
  return resultado;
}

async function* trozos(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lector = body.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      yield dec.decode(value, { stream: true });
    }
  } finally {
    lector.releaseLock?.();
  }
}

export async function crearPresentacion(pedido: PedidoPresentacion, h: ManejadoresPresentacion = {}): Promise<ResultadoPresentacion> {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";
  let token = anonKey;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token ?? anonKey;
  } catch {
    /* sin sesión: la función responde 401 */
  }
  let r: Response;
  try {
    r = await fetch(`${base}/functions/v1/pilo-presentaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(pedido),
      signal: h.signal,
    });
  } catch (e) {
    if (h.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new ErrorPresentacionCliente(mensajeDeCodigo("cancelado"), "cancelado");
    throw new ErrorPresentacionCliente("No pude conectarme con Pilo. Revise su conexión e intente de nuevo.", "red");
  }
  if (!r.ok) throw errorHttp(r.status, await r.json().catch(() => null), r.headers.get("Retry-After"));
  if (!r.body) throw new ErrorPresentacionCliente("El servidor no mandó el flujo.", "proveedor");
  try {
    return await consumirFlujo(trozos(r.body), h);
  } catch (e) {
    if (h.signal?.aborted) throw new ErrorPresentacionCliente(mensajeDeCodigo("cancelado"), "cancelado");
    throw e;
  }
}
