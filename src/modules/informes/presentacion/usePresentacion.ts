/* =============================================================================
   Presentación con Pilo · el hook que arma el pedido, lo envía y lleva el estado
   (pasos, razonamiento en vivo, resultado o error) con cancelación.
   ========================================================================== */

import { useCallback, useReducer, useRef } from "react";
import { crearPresentacion, ErrorPresentacionCliente } from "./presentaciones";
import type { PasoPresentacion, ResultadoPresentacion } from "./presentaciones";
import { informeParaPresentacion } from "./modelo";
import type { Tono } from "./modelo";

export type EstadoGeneracion =
  | { fase: "inactivo" }
  | { fase: "trabajando"; pasos: PasoPresentacion[]; pensamiento: string; desde: number; tono: Tono }
  | { fase: "listo"; resultado: ResultadoPresentacion; tono: Tono }
  | { fase: "error"; code: string; mensaje: string; detalle?: string[]; retryAfter?: number };

export type AccionGeneracion =
  | { t: "empezar"; tono: Tono; ahora: number }
  | { t: "paso"; paso: PasoPresentacion }
  | { t: "pensar"; texto: string }
  | { t: "listo"; resultado: ResultadoPresentacion }
  | { t: "error"; code: string; mensaje: string; detalle?: string[]; retryAfter?: number }
  | { t: "reiniciar" };

/** Lo que muestra el razonamiento: se conserva el final si es larguísimo. */
const MAX_PENSAMIENTO = 12_000;

export function reducirGeneracion(e: EstadoGeneracion, a: AccionGeneracion): EstadoGeneracion {
  switch (a.t) {
    case "empezar":
      return { fase: "trabajando", pasos: [], pensamiento: "", desde: a.ahora, tono: a.tono };
    case "paso":
      return e.fase === "trabajando" ? { ...e, pasos: e.pasos.some((p) => p.id === a.paso.id) ? e.pasos : [...e.pasos, a.paso] } : e;
    case "pensar":
      return e.fase === "trabajando" ? { ...e, pensamiento: (e.pensamiento + a.texto).slice(-MAX_PENSAMIENTO) } : e;
    case "listo":
      return { fase: "listo", resultado: a.resultado, tono: e.fase === "trabajando" ? e.tono : a.resultado.presentacion.tono };
    case "error":
      return { fase: "error", code: a.code, mensaje: a.mensaje, detalle: a.detalle, retryAfter: a.retryAfter };
    case "reiniciar":
      return { fase: "inactivo" };
  }
}

export interface OpcionesCrear {
  instancia_id: string;
  /** El JSON de `entradaLibro(m, pilares, anio)` ya resuelto con cifras. */
  entrada: unknown;
  tono: Tono;
  duracion_min?: number;
  enfoque?: string;
}

export function usePresentacion() {
  const [estado, enviar] = useReducer(reducirGeneracion, { fase: "inactivo" } as EstadoGeneracion);
  const control = useRef<AbortController | null>(null);

  const crear = useCallback(async (o: OpcionesCrear): Promise<ResultadoPresentacion | null> => {
    control.current?.abort();
    const c = new AbortController();
    control.current = c;
    enviar({ t: "empezar", tono: o.tono, ahora: Date.now() });
    try {
      const { informe } = informeParaPresentacion(o.entrada);
      const r = await crearPresentacion(
        { instancia_id: o.instancia_id, tono: o.tono, duracion_min: o.duracion_min, enfoque: o.enfoque?.trim() || undefined, informe },
        { signal: c.signal, onStep: (paso) => enviar({ t: "paso", paso }), onThinking: (texto) => enviar({ t: "pensar", texto }) },
      );
      if (c.signal.aborted) return null;
      enviar({ t: "listo", resultado: r });
      return r;
    } catch (e) {
      if (c.signal.aborted && !(e instanceof ErrorPresentacionCliente && e.code !== "cancelado")) {
        enviar({ t: "reiniciar" });
        return null;
      }
      if (e instanceof ErrorPresentacionCliente) enviar({ t: "error", code: e.code, mensaje: e.message, detalle: e.detalle, retryAfter: e.retryAfter });
      else enviar({ t: "error", code: "interno", mensaje: "No se pudo crear la presentación." });
      return null;
    }
  }, []);

  const cancelar = useCallback(() => {
    control.current?.abort();
    enviar({ t: "reiniciar" });
  }, []);
  const reiniciar = useCallback(() => enviar({ t: "reiniciar" }), []);

  return { estado, crear, cancelar, reiniciar };
}
