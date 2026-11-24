import { describe, expect, it } from "vitest";
import { aportePuntosOds, estimarPuntos, ordenarEvidencias } from "./puntos";

describe("orden de las evidencias", () => {
  it("la pública va primero, luego la específica, luego la general", () => {
    const orden = ordenarEvidencias([
      { id: "priv-s", publica: false, relevancia: "s" },
      { id: "pub-g", publica: true, relevancia: "g" },
      { id: "pub-s", publica: true, relevancia: "s" },
      { id: "priv-sin", publica: false },
    ]);
    expect(orden.map((e) => e.id)).toEqual(["pub-s", "pub-g", "priv-s", "priv-sin"]);
  });

  it("es estable: a igual rango, conserva el orden de llegada", () => {
    const orden = ordenarEvidencias([
      { id: "a", publica: true, relevancia: "g" },
      { id: "b", publica: true, relevancia: "g" },
    ]);
    expect(orden.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("no modifica la lista original", () => {
    const original = [{ id: "x", publica: false }, { id: "y", publica: true }];
    ordenarEvidencias(original);
    expect(original.map((e) => e.id)).toEqual(["x", "y"]);
  });
});

describe("estimación de puntos", () => {
  it("evidencia pública específica con respuesta sí: 3 de 3", () => {
    const r = estimarPuntos({
      tipo: "ev",
      si_no: true,
      tieneCifra: false,
      evidencias: [{ id: "e1", publica: true, relevancia: "s" }],
    });
    expect(r).toMatchObject({ aplica: true, existencia: 1, relevancia: 1, publica: 1, total: 3, fraccion: 1, evidenciaElegida: "e1" });
  });

  it("evidencia general no pública: existencia 1 + relevancia 0,5 = 1,5", () => {
    const r = estimarPuntos({
      tipo: "ev",
      si_no: null,
      tieneCifra: false,
      evidencias: [{ id: "e1", publica: false, relevancia: "g" }],
    });
    expect(r.total).toBeCloseTo(1.5);
    expect(r.publica).toBe(0);
    expect(r.fraccion).toBeCloseTo(0.5);
  });

  it("sin valorar la relevancia cuenta como general", () => {
    const r = estimarPuntos({ tipo: "doc", si_no: true, tieneCifra: false, evidencias: [{ id: "e1", publica: false }] });
    expect(r.relevancia).toBe(0.5);
  });

  it("si la respuesta es no, la evidencia no cuenta aunque exista", () => {
    const r = estimarPuntos({
      tipo: "ev",
      si_no: false,
      tieneCifra: false,
      evidencias: [{ id: "e1", publica: true, relevancia: "s" }],
    });
    expect(r.total).toBe(0);
    expect(r.evidenciaElegida).toBeNull();
  });

  it("sin respuesta ni evidencia, 0", () => {
    const r = estimarPuntos({ tipo: "ev", si_no: null, tieneCifra: false, evidencias: [] });
    expect(r.total).toBe(0);
    expect(r.evidenciaElegida).toBeNull();
  });

  it("una cifra escrita cuenta como existencia aunque no haya evidencia", () => {
    const r = estimarPuntos({ tipo: "doc", si_no: null, tieneCifra: true, evidencias: [] });
    expect(r.existencia).toBe(1);
    expect(r.total).toBe(1);
  });

  it("elige la pública aunque haya una específica no pública", () => {
    const r = estimarPuntos({
      tipo: "ev",
      si_no: true,
      tieneCifra: false,
      evidencias: [
        { id: "priv", publica: false, relevancia: "s" },
        { id: "pub", publica: true, relevancia: "n" },
      ],
    });
    expect(r.evidenciaElegida).toBe("pub");
    expect(r.publica).toBe(1);
    expect(r.relevancia).toBe(0);
    expect(r.total).toBe(2);
  });

  it("dato e inv no aplican: los puntúa THE", () => {
    for (const tipo of ["dato", "inv"] as const) {
      const r = estimarPuntos({ tipo, si_no: true, tieneCifra: true, evidencias: [{ id: "e", publica: true, relevancia: "s" }] });
      expect(r.aplica).toBe(false);
      expect(r.motivo).toBeTruthy();
      expect(r.total).toBe(0);
    }
  });
});

describe("aporte al ODS", () => {
  it("peso × fracción × 100", () => {
    expect(aportePuntosOds(0.154, 1)).toBeCloseTo(15.4);
    expect(aportePuntosOds(0.05, 0.5)).toBeCloseTo(2.5);
  });

  it("sin peso, 0", () => {
    expect(aportePuntosOds(null, 1)).toBe(0);
  });
});
