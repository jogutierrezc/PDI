import { describe, expect, it } from "vitest";
import { accionesPermitidas, bloqueadaParaOficina, ETIQUETA_ESTADO, ESTADOS, puedeEditar, transicionPermitida } from "./estados";
import type { EstadoRespuesta } from "./tipos";

describe("transiciones", () => {
  it("el camino feliz: none → draft → sent → ok", () => {
    expect(transicionPermitida("none", "draft", "editor")).toBe(true);
    expect(transicionPermitida("draft", "sent", "jefe")).toBe(true);
    expect(transicionPermitida("sent", "ok", "planeacion")).toBe(true);
  });

  it("la devolución: sent → back → draft, y ok → back al reabrir", () => {
    expect(transicionPermitida("sent", "back", "planeacion")).toBe(true);
    expect(transicionPermitida("back", "draft", "editor")).toBe(true);
    expect(transicionPermitida("ok", "back", "planeacion")).toBe(true);
  });

  it("el editor no envía: draft → sent es del jefe o de Planeación", () => {
    expect(transicionPermitida("draft", "sent", "editor")).toBe(false);
    expect(transicionPermitida("draft", "sent", "jefe")).toBe(true);
    expect(transicionPermitida("draft", "sent", "planeacion")).toBe(true);
  });

  it("aprobar o devolver es solo de Planeación, aunque la oficina sea jefa", () => {
    for (const [de, a] of [["sent", "ok"], ["sent", "back"], ["ok", "back"]] as const) {
      expect(transicionPermitida(de, a, "jefe")).toBe(false);
      expect(transicionPermitida(de, a, "editor")).toBe(false);
      expect(transicionPermitida(de, a, "planeacion")).toBe(true);
    }
  });

  it("no hay saltos ni vueltas atrás no previstas", () => {
    expect(transicionPermitida("none", "sent", "planeacion")).toBe(false);
    expect(transicionPermitida("draft", "ok", "planeacion")).toBe(false);
    expect(transicionPermitida("back", "sent", "jefe")).toBe(false);
    expect(transicionPermitida("ok", "draft", "planeacion")).toBe(false);
    expect(transicionPermitida("sent", "draft", "planeacion")).toBe(false);
    expect(transicionPermitida("ok", "ok", "planeacion")).toBe(false);
  });

  it("el visor y quien no tiene papel no mueven nada", () => {
    for (const de of ESTADOS) for (const a of ESTADOS) {
      expect(transicionPermitida(de, a, "visor")).toBe(false);
      expect(transicionPermitida(de, a, null)).toBe(false);
    }
  });
});

describe("acciones permitidas", () => {
  it("el jefe en borrador puede enviar, y nada más", () => {
    expect(accionesPermitidas("draft", "jefe")).toEqual(["sent"]);
  });

  it("el editor en borrador no puede enviar: no tiene acciones", () => {
    expect(accionesPermitidas("draft", "editor")).toEqual([]);
  });

  it("Planeación enviada puede aprobar o devolver", () => {
    expect(accionesPermitidas("sent", "planeacion")).toEqual(["back", "ok"]);
  });

  it("la oficina devuelta vuelve a borrador", () => {
    expect(accionesPermitidas("back", "editor")).toEqual(["draft"]);
  });
});

describe("quién puede editar el contenido", () => {
  it("Planeación siempre; la oficina en none, draft y back", () => {
    for (const estado of ESTADOS as readonly EstadoRespuesta[]) {
      expect(puedeEditar(estado, "planeacion")).toBe(true);
      expect(puedeEditar(estado, "visor")).toBe(false);
      expect(puedeEditar(estado, null)).toBe(false);
      const abierta = estado === "none" || estado === "draft" || estado === "back";
      expect(puedeEditar(estado, "editor")).toBe(abierta);
      expect(puedeEditar(estado, "jefe")).toBe(abierta);
    }
  });

  it("enviada o aprobada: la oficina no la cambia", () => {
    expect(bloqueadaParaOficina("sent")).toBe(true);
    expect(bloqueadaParaOficina("ok")).toBe(true);
    expect(bloqueadaParaOficina("draft")).toBe(false);
  });

  it("cada estado tiene su etiqueta en español", () => {
    expect(Object.keys(ETIQUETA_ESTADO).sort()).toEqual([...ESTADOS].sort());
    expect(ETIQUETA_ESTADO.sent).toBe("Enviada a Planeación");
  });
});
