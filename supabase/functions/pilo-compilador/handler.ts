/* =============================================================================
   Pilo compilador · el manejador del pedido, con dependencias por parámetro
   (sesión, acceso, configuración de Astra, contador, fetch). index.ts lo conecta
   con Supabase; las pruebas lo conectan con dobles. Misma forma que pilo-presentaciones.
   ========================================================================== */

import { ErrorAstra, llamarAstra } from "../pilo-presentaciones/astra.ts";
import type { DestinoAstra } from "../pilo-presentaciones/astra.ts";
import { revisarLimite } from "../pilo-presentaciones/limite.ts";
import { ErrorCompilador, generar } from "./nucleo.ts";
import { leerPedido, MAX_DATOS_BYTES } from "./pedido.ts";
import { ESFUERZO } from "./prompt.ts";

export const ASTRA_ETIQUETA = "Pilo Astra 1.0";

export interface ConfigAstra {
  habilitado: boolean;
  destino: DestinoAstra | null;
  /** 0 = sin tope (la llamada no manda max_tokens). */
  maxTokens: number;
  esperaMs: number;
  limiteHora: number;
}

export interface DepsManejador {
  configurado: boolean;
  anonKey: string;
  sal: string;
  usuarioDe: (token: string) => Promise<string | null>;
  /** ¿La base le deja ver esta instancia? (con SU token) */
  visible: (authorization: string, instanciaId: string) => Promise<boolean>;
  config: () => Promise<ConfigAstra>;
  golpe: (huella: string, ventanaInicio: string) => Promise<number | null>;
  fetchFn?: typeof fetch;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
const frame = (evento: string, datos: unknown) => `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;

export function crearManejador(d: DepsManejador) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
    if (!d.configurado) return json({ error: "La función no está configurada." }, 500);

    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === d.anonKey) return json({ error: "Falta la sesión.", code: "sin_sesion" }, 401);
    const usuario = await d.usuarioDe(authorization.slice(7));
    if (!usuario) return json({ error: "Sesión inválida.", code: "sin_sesion" }, 401);

    const texto = await request.text();
    if (texto.length > MAX_DATOS_BYTES * 1.5) return json({ error: "El pedido es demasiado grande.", code: "datos_grandes" }, 413);
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto || "{}");
    } catch {
      return json({ error: "Cuerpo inválido.", code: "pedido" }, 400);
    }
    const lectura = leerPedido(cuerpo);
    if (!lectura.ok) return json({ error: lectura.error, code: lectura.code }, lectura.status);
    const pedido = lectura.pedido;

    if (!(await d.visible(authorization, pedido.instancia_id))) return json({ error: "No tiene acceso a este informe.", code: "sin_acceso" }, 403);

    const cfg = await d.config();
    const dest = cfg.habilitado ? cfg.destino : null;
    if (!dest) return json({ error: `${ASTRA_ETIQUETA} no está disponible: la administración debe encenderlo y configurarlo en Pilo Work. El compilador solo trabaja con Astra.`, code: "astra_apagado" }, 503);

    const lim = await revisarLimite({ usuario, limite: cfg.limiteHora, sal: `${d.sal}|compilador`, golpe: d.golpe });
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
              emitir: mandar,
              llamar: (mensajes, onThinking) => llamarAstra({ dest, mensajes, effort: ESFUERZO[pedido.nivel], maxTokens: cfg.maxTokens, esperaMs: cfg.esperaMs, signal: request.signal, onThinking, fetchFn: d.fetchFn }),
            },
            pedido,
          );
          mandar("done", { seccion: pedido.datos.seccion.clave, ...r, modelo: { id: "astra", label: ASTRA_ETIQUETA } });
        } catch (e) {
          if (e instanceof ErrorCompilador) mandar("error", { code: e.code, message: e.message, ...(e.detalle ? { detalle: e.detalle } : {}) });
          else if (e instanceof ErrorAstra) mandar("error", { code: e.code === "cancelado" || e.code === "tiempo" ? e.code : "proveedor", message: e.message });
          else mandar("error", { code: "interno", message: "No se pudo redactar la sección." });
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
