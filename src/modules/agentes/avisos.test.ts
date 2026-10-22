/* =============================================================================
   Portal de agentes · qué avisar cuando la bandeja no está a la vista.

   La lógica es pura: entre dos instantes de la bandeja, qué le toca saber a
   este agente (una oferta nueva, la oferta por vencerse o un mensaje de la
   persona que aún no ha leído).
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { avisosNuevos, type ConvAviso, type Instante } from "./avisos";

const ME = "ana";
const conv = (id: string, sobre: Partial<ConvAviso> = {}): ConvAviso => ({ id, status: "offered", offered_to: ME, offer_expires_at: null, ...sobre });
const instante = (convs: ConvAviso[], unread: Record<string, number> = {}, now = 1_000_000): Instante => ({ convs, unread, now });

describe("avisosNuevos", () => {
  it("una oferta nueva para mí avisa con los segundos de la política", () => {
    const avisos = avisosNuevos(null, instante([conv("c1", { offer_expires_at: new Date(1_045_000).toISOString() })]), ME, 45);
    expect(avisos).toEqual([{ tipo: "oferta", id: "c1", segundos: 45 }]);
  });

  it("una oferta para otro agente no me avisa", () => {
    const avisos = avisosNuevos(null, instante([conv("c1", { offered_to: "otro" })]), ME, 45);
    expect(avisos).toEqual([]);
  });

  it("la misma oferta que cruza la línea de los 15 segundos avisa el apuro una sola vez", () => {
    const vence = 1_020_000;
    const antes = instante([conv("c1", { offer_expires_at: new Date(vence).toISOString() })], {}, 1_000_000);
    const despues = instante([conv("c1", { offer_expires_at: new Date(vence).toISOString() })], {}, 1_009_000);
    expect(avisosNuevos(antes, despues, ME, 45)).toEqual([{ tipo: "apuro", id: "c1", segundos: 11 }]);
    // El instante siguiente ya no vuelve a avisar.
    expect(avisosNuevos(despues, instante([conv("c1", { offer_expires_at: new Date(vence).toISOString() })], {}, 1_013_000), ME, 45)).toEqual([]);
  });

  it("una re-oferta (otra ventana) avisa otra vez", () => {
    const antes = instante([conv("c1", { offer_expires_at: new Date(1_020_000).toISOString() })]);
    const despues = instante([conv("c1", { offer_expires_at: new Date(2_020_000).toISOString() })], {}, 1_000_000);
    expect(avisosNuevos(antes, despues, ME, 45)).toEqual([{ tipo: "oferta", id: "c1", segundos: 45 }]);
  });

  it("un mensaje sin leer nuevo avisa; lo que ya estaba no", () => {
    const antes = instante([conv("c1", { status: "open", offered_to: null })], { c1: 2 });
    const despues = instante([conv("c1", { status: "open", offered_to: null })], { c1: 3 });
    expect(avisosNuevos(antes, despues, ME, 45)).toEqual([{ tipo: "mensaje", id: "c1", segundos: 0 }]);
    const igual = instante([conv("c1", { status: "open", offered_to: null })], { c1: 3 });
    expect(avisosNuevos(despues, igual, ME, 45)).toEqual([]);
  });

  it("nada nuevo no avisa nada", () => {
    const antes = instante([conv("c1", { offer_expires_at: new Date(1_060_000).toISOString() })], { c1: 1 });
    const igual = instante([conv("c1", { offer_expires_at: new Date(1_060_000).toISOString() })], { c1: 1 }, 1_010_000);
    expect(avisosNuevos(antes, igual, ME, 45)).toEqual([]);
  });
});
