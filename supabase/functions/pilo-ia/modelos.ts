/* =============================================================================
   Pilo IA · qué modelos puede elegir quien pregunta («Pilo» o «Pilo Astra 1.0»).

   Funciones puras (sin red ni base): el servidor les da lo que leyó y ellas deciden.
   Astra solo sale si el interruptor `astra_chat` (0283) está encendido, hay a dónde
   mandarlo (destinoAstra de pilo-work) y quien pregunta tiene sesión (perfil de
   intranet o cuenta de Pilo). Un visitante solo ve «Pilo». Un pedido que no se puede
   atender cae a «Pilo» y lo dice, sin fallar.
   ========================================================================== */

import { ASTRA_NOMBRE, esfuerzoAstra } from "../pilo-work/proveedor.ts";

export type ModeloId = "pilo" | "astra";
export interface ModeloInfo {
  id: ModeloId;
  label: string;
  razona: boolean;
}

export const MODELO_PILO: ModeloInfo = { id: "pilo", label: "Pilo", razona: false };
export const MODELO_ASTRA: ModeloInfo = { id: "astra", label: ASTRA_NOMBRE, razona: true };

export interface CatalogoModelos {
  modelos: ModeloInfo[];
  defecto: ModeloId;
}

export function modelosDisponibles(i: { astraChat: boolean; hayDestino: boolean; sesion: boolean; defecto?: unknown }): CatalogoModelos {
  const astra = i.astraChat === true && i.hayDestino && i.sesion;
  const modelos = astra ? [MODELO_PILO, MODELO_ASTRA] : [MODELO_PILO];
  return { modelos, defecto: astra && i.defecto === "astra" ? "astra" : "pilo" };
}

export interface Eleccion {
  modelo: ModeloInfo;
  /** Pidió otro y no se pudo: se usa «Pilo». */
  caido: boolean;
  pedido: string;
}

/** El modelo de este pedido. Lo no válido o no disponible cae a «Pilo». */
export function elegirModelo(pedido: unknown, catalogo: CatalogoModelos): Eleccion {
  const id = typeof pedido === "string" ? pedido.trim().toLowerCase() : "";
  const hallado = catalogo.modelos.find((m) => m.id === id);
  if (hallado) return { modelo: hallado, caido: false, pedido: id };
  return { modelo: MODELO_PILO, caido: id === "astra", pedido: id };
}

/** El `modelo` del evento `meta`. */
export function metaModelo(e: Eleccion): { modelo: { id: ModeloId; label: string; caido?: true }; razona: boolean } {
  return { modelo: { id: e.modelo.id, label: e.modelo.label, ...(e.caido ? { caido: true as const } : {}) }, razona: e.modelo.razona };
}

export interface AjustesAstra {
  astra_razonamiento: string;
  astra_max_tokens: number;
  astra_espera_s: number;
}

/** Las opciones de la llamada con Astra: razonamiento, tope de tokens (el razonamiento gasta tope) y espera. */
export function opcionesAstra(pw: AjustesAstra, maxPedido: number, topeEspera: number): { reasoning_effort: "low" | "medium" | "high" | "none"; max_tokens: number; esperaMs: number } {
  return {
    reasoning_effort: esfuerzoAstra(pw.astra_razonamiento),
    // 0 = sin tope: no se manda `max_tokens` y el servidor deja pensar y responder hasta donde necesite.
    max_tokens: pw.astra_max_tokens === 0 ? 0 : Math.max(maxPedido, pw.astra_max_tokens),
    esperaMs: Math.min(topeEspera, Math.max(1, pw.astra_espera_s) * 1000),
  };
}

/** Segundos pensando, con un decimal. */
export const segundosPensando = (ms: number): number => Math.round(Math.max(0, ms) / 100) / 10;

/** Cuánto razona Astra, según lo que la persona elige en la app: Respuestas rápidas, Trabajo complejo o Investigaciones. */
export type NivelAstra = "rapida" | "compleja" | "investigacion";

export const parseNivel = (v: unknown): NivelAstra | null => (v === "rapida" || v === "compleja" || v === "investigacion" ? v : null);

/**
 * El esfuerzo de razonamiento para ese nivel. Sin nivel, el que fijó la administración; y si la administración
 * lo apagó («none»), sigue apagado: el nivel no lo enciende.
 */
export function esfuerzoPorNivel(base: "low" | "medium" | "high" | "none", nivel: NivelAstra | null): "low" | "medium" | "high" | "none" {
  if (base === "none" || !nivel) return base;
  return nivel === "rapida" ? "low" : nivel === "compleja" ? "medium" : "high";
}
