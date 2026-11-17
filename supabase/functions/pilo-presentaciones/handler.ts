/* =============================================================================
   Pilo presentaciones · el manejador del pedido, con sus dependencias por
   parámetro (sesión, acceso, configuración de Astra, contador, fetch). index.ts
   lo conecta con Supabase; las pruebas lo conectan con dobles.
   ========================================================================== */

import { ErrorAstra, llamarAstra } from "./astra.ts";
import type { DestinoAstra } from "./astra.ts";
import { revisarLimite } from "./limite.ts";
import { ErrorPresentacion, generar } from "./nucleo.ts";
import { MAX_INFORME_BYTES, leerPedido } from "./pedido.ts";

export const ASTRA_ETIQUETA = "Pilo Astra 1.0";

export interface ConfigAstra {
  /** Interruptor de Pilo Work (pw_config.astra_habilitado). */
  habilitado: boolean;
  /** Dirección, modelo y clave; null si falta alguno. */
  destino: DestinoAstra | null;
  effort: "low" | "medium" | "high" | "none";
  maxTokens: number;
  esperaMs: number;
  limiteHora: number;
}

export interface DepsManejador {
  configurado: boolean;
  anonKey: string;
  sal: string;
  /** Quién es el dueño del token; null si no vale. */
  usuarioDe: (token: string) => Promise<string | null>;
  /** ¿La base le deja ver esta instancia? (con SU token) */
  visible: (authorization: string, instanciaId: string) => Promise<boolean>;
  config: () => Promise<ConfigAstra>;
  golpe: (huella: string, ventanaInicio: string) => Promise<number | null>;
  fetchFn?: typeof fetch;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
const frame = (evento: string, datos: unknown) => `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;

export function crearManejador(d: DepsManejador) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
    if (!d.configurado) return json({ error: "La función no está configurada." }, 500);

    // Quién llama
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === d.anonKey) return json({ error: "Falta la sesión.", code: "sin_sesion" }, 401);
    const usuario = await d.usuarioDe(authorization.slice(7));
    if (!usuario) return json({ error: "Sesión inválida.", code: "sin_sesion" }, 401);

    // El pedido
    const texto = await request.text();
    if (texto.length > MAX_INFORME_BYTES * 1.5) return json({ error: "El pedido es demasiado grande.", code: "informe_grande" }, 413);
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto || "{}");
    } catch {
      return json({ error: "Cuerpo inválido.", code: "pedido" }, 400);
    }
    const lectura = leerPedido(cuerpo);
    if (!lectura.ok) return json({ error: lectura.error, code: lectura.code }, lectura.status);
    const pedido = lectura.pedido;

    // Acceso a la instancia: lo decide la base con SU sesión, no lo que mande el cliente
    if (!(await d.visible(authorization, pedido.instancia_id))) return json({ error: "No tiene acceso a este informe.", code: "sin_acceso" }, 403);

    // Astra: solo Astra, sin plan B
    const cfg = await d.config();
    const dest = cfg.habilitado ? cfg.destino : null;
    if (!dest) return json({ error: `${ASTRA_ETIQUETA} no está disponible: la administración debe encenderlo y configurarlo en Pilo Work. La presentación solo se crea con Astra.`, code: "astra_apagado" }, 503);

    // Límite por persona y hora
    const lim = await revisarLimite({ usuario, limite: cfg.limiteHora, sal: d.sal, golpe: d.golpe });
    if (!lim.ok) return json({ error: `Llegó al límite de ${ASTRA_ETIQUETA} por esta hora. Vuelva a intentar más tarde.`, code: "astra_limite", retry_after: lim.retry }, 429, { "Retry-After": String(lim.retry) });

    const enc = new TextEncoder();
    const flujo = new ReadableStream<Uint8Array>({
      async start(controller) {
        const mandar = (e: string, datos: unknown) => {
          try {
            controller.enqueue(enc.encode(frame(e, datos)));
          } catch {
            /* la persona cerró la página */
          }
        };
        try {
          const r = await generar(
            {
              emitir: (e, datos) => mandar(e, datos),
              llamar: (mensajes, onThinking) => llamarAstra({ dest, mensajes, effort: cfg.effort, maxTokens: cfg.maxTokens, esperaMs: cfg.esperaMs, signal: request.signal, onThinking, fetchFn: d.fetchFn }),
            },
            pedido,
          );
          mandar("done", { presentacion: r.presentacion, no_verificado: r.no_verificado, ajustes: r.ajustes, pensamiento_s: r.pensamiento_s, reintento: r.reintento, modelo: { id: "astra", label: ASTRA_ETIQUETA } });
        } catch (e) {
          if (e instanceof ErrorPresentacion) mandar("error", { code: e.code, message: e.message, ...(e.detalle ? { detalle: e.detalle } : {}) });
          else if (e instanceof ErrorAstra) mandar("error", { code: e.code === "cancelado" || e.code === "tiempo" ? e.code : "proveedor", message: e.message });
          else mandar("error", { code: "interno", message: "No se pudo crear la presentación." });
        } finally {
          try {
            controller.close();
          } catch {
            /* ya cerrado */
          }
        }
      },
    });
    return new Response(flujo, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  };
}
