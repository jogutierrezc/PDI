/* =============================================================================
   Pilo presentaciones · el recorrido de una presentación.

   leer el informe → organizar → redactar (Astra) → validar (esquema y
   anti-invención). Sin red ni base: el modelo y el emisor de eventos llegan por
   parámetro, así se prueba de punta a punta con un Astra falso. Si el JSON viene
   roto o fuera de esquema, UN reintento con el error; si falla, `presentacion_invalida`.
   ========================================================================== */

import { leerJson, validarPresentacion } from "./esquema.ts";
import type { Presentacion } from "./esquema.ts";
import { mensajesPresentacion, mensajesReintento } from "./prompt.ts";
import type { Mensaje } from "./prompt.ts";
import type { Tono } from "./tonos.ts";
import { verificarPresentacion } from "./verificar.ts";
import type { NoVerificado } from "./verificar.ts";

export class ErrorPresentacion extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly detalle?: string[]) {
    super(message);
  }
}

export interface Dependencias {
  /** Una llamada al modelo: devuelve el texto y el razonamiento; avisa el razonamiento por el camino. */
  llamar: (mensajes: Mensaje[], onThinking: (t: string) => void) => Promise<{ texto: string; pensamiento: string }>;
  emitir: (evento: "step" | "thinking", datos: Record<string, unknown>) => void;
  ahora?: () => number;
}

export interface Pedido {
  tono: Tono;
  duracion_min?: number;
  enfoque?: string;
  informe: unknown;
}

export interface Resultado {
  presentacion: Presentacion;
  no_verificado: NoVerificado[];
  ajustes: string[];
  pensamiento_s: number;
  reintento: boolean;
}

export const PASOS = {
  leyendo: "Leyendo el informe",
  organizando: "Organizando las diapositivas",
  redactando: "Redactando con Pilo Astra 1.0",
  validando: "Revisando cifras y enlaces",
} as const;

export async function generar(d: Dependencias, p: Pedido): Promise<Resultado> {
  const ahora = d.ahora ?? Date.now;
  const t0 = ahora();
  const paso = (id: keyof typeof PASOS) => d.emitir("step", { id, texto: PASOS[id] });
  const pensar = (t: string) => d.emitir("thinking", { text: t });

  paso("leyendo");
  const mensajes = mensajesPresentacion(p.tono, { informe: p.informe, duracion_min: p.duracion_min, enfoque: p.enfoque });
  paso("organizando");
  paso("redactando");

  let r = await d.llamar(mensajes, pensar);
  let lectura = leerJson(r.texto);
  let v = lectura.ok ? validarPresentacion(lectura.valor, p.tono) : null;
  let errores = lectura.ok ? (v && !v.ok ? v.errores : []) : [lectura.error];
  let reintento = false;
  if (!lectura.ok || (v && !v.ok)) {
    reintento = true;
    r = await d.llamar(mensajesReintento(mensajes, r.texto, errores), pensar);
    lectura = leerJson(r.texto);
    v = lectura.ok ? validarPresentacion(lectura.valor, p.tono) : null;
    errores = lectura.ok ? (v && !v.ok ? v.errores : []) : [lectura.error];
  }
  if (!v || !v.ok) throw new ErrorPresentacion("Pilo no logró una presentación válida. Intente de nuevo o cambie el tono.", "presentacion_invalida", 422, errores);

  paso("validando");
  const { presentacion, no_verificado } = verificarPresentacion(v.presentacion, p.informe);
  if (presentacion.diapositivas.length < 3) throw new ErrorPresentacion("Tras quitar lo que el informe no respalda quedaron muy pocas diapositivas.", "presentacion_invalida", 422, ["Menos de 3 diapositivas tras la verificación."]);
  return { presentacion, no_verificado, ajustes: v.ajustes, pensamiento_s: Math.round(Math.max(0, ahora() - t0) / 100) / 10, reintento };
}
