/* =============================================================================
   Las llamadas al proveedor de IA (el mismo de pilo-rankingsod: proveedor.ts).
   No se empieza otra llamada pasados 50 s; tope de 95 s por llamada. Un 429
   espera hasta 3 s y reintenta una vez; 401/403, 5xx o un segundo 429 detienen
   con un mensaje claro. La clave nunca sale de aquí.
   ========================================================================== */

import { foldSystem, roleRejected } from "../noticias-pilo/logica.ts";
import { esperaTras429, type DestinoIA } from "../pilo-rankingsod/proveedor.ts";
import { mensajesReintento, type Lectura, type Mensaje } from "./redaccion.ts";

export const PRESUPUESTO_MS = 50_000;
export const TOPE_LLAMADA_MS = 95_000;
const FIN_MS = 140_000;

/** El proveedor falló: se detiene todo y se dice por qué. */
export class AltoProveedor extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function detalle(r: Response): Promise<string> {
  try {
    const t = await r.text();
    if (/^\s*</.test(t)) return "respondió una página web, no la API";
    try {
      const d = JSON.parse(t);
      return String(d?.message ?? d?.error?.message ?? d?.error ?? d?.detail ?? t).slice(0, 200);
    } catch {
      return t.slice(0, 200);
    }
  } catch {
    return "";
  }
}

export function crearIA(destino: DestinoIA, plegar: boolean) {
  const inicio = Date.now();
  let llamadas = 0;
  const hayTiempo = () => Date.now() - inicio < PRESUPUESTO_MS;

  const enviar = async (cuerpo: Record<string, unknown>): Promise<Response> => {
    const init = (): RequestInit => ({
      method: "POST",
      headers: { Authorization: `Bearer ${destino.clave}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(Math.max(10_000, Math.min(TOPE_LLAMADA_MS, FIN_MS - (Date.now() - inicio)))),
      body: JSON.stringify(cuerpo),
    });
    llamadas++;
    const primera = await fetch(destino.url, init());
    if (primera.status !== 429) return primera;
    const espera = esperaTras429(primera.headers.get("retry-after"));
    await primera.body?.cancel();
    await dormir(espera);
    return fetch(destino.url, init());
  };

  const llamar = async (mensajes: Mensaje[], maxTokens: number): Promise<string> => {
    const cuerpo = (doblar: boolean) => ({
      model: destino.model,
      messages: doblar ? foldSystem(mensajes) : mensajes,
      temperature: 0.3,
      max_tokens: maxTokens,
      ...(destino.json ? { response_format: { type: "json_object" } } : {}),
    });
    let r: Response;
    try {
      r = await enviar(cuerpo(plegar));
      if (!r.ok && !plegar && (r.status === 400 || r.status === 422) && roleRejected(r.status, await detalle(r.clone()))) {
        await r.body?.cancel();
        r = await enviar(cuerpo(true));
      }
    } catch (e) {
      const tiempo = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new AltoProveedor(tiempo ? "El proveedor de IA tardó demasiado en responder. Intenta de nuevo." : "No se pudo llegar al proveedor de IA.", "proveedor", 502);
    }
    if (!r.ok) {
      const d = await detalle(r);
      if (r.status === 429) throw new AltoProveedor("El proveedor limitó los pedidos (429) aun después de esperar: espera un minuto y sigue.", "limite_proveedor", 429);
      if (r.status === 401 || r.status === 403) throw new AltoProveedor(`El proveedor rechazó la clave (${r.status}): la administración debe revisarla en Mr. Pilo con IA › Conexión.`, "clave", 502);
      throw new AltoProveedor(`El proveedor respondió ${r.status}${d ? `: ${d}` : ""}.`, "proveedor", 502);
    }
    try {
      return String((await r.json())?.choices?.[0]?.message?.content ?? "");
    } catch {
      return "";
    }
  };

  /** Una llamada, su lectura y, si no pasa, un reintento con el error (si hay tiempo). */
  const llamarVerificado = async <T>(mensajes: Mensaje[], maxTokens: number, leer: (crudo: string) => Lectura<T>): Promise<Lectura<T>> => {
    const crudo = await llamar(mensajes, maxTokens);
    const primera = leer(crudo);
    if (primera.ok) return primera;
    if (!hayTiempo()) return { ok: false, error: `${primera.error} No hubo tiempo de reintentar.` };
    const segunda = leer(await llamar(mensajesReintento(mensajes, crudo, primera.error), maxTokens));
    return segunda.ok ? segunda : { ok: false, error: segunda.error };
  };

  return { llamarVerificado, inicio, llamadas: () => llamadas };
}
