/* Lógica de las pantallas: el flujo de estados con sus rótulos, la cifra viva
   del lanzador, el periodo inicial, el siguiente periodo y la línea de tiempo. */

import { describe, expect, it } from "vitest";
import { accionesEnvio, escalaTiempo, faltantes, pendientesDe, periodoInicial, seccionDe } from "./logica";
import { siguienteCodigo } from "./Periodos";
import type { IntPeriodoRow } from "../tipos";

describe("flujo de envío por papel", () => {
  const rotulos = (...a: Parameters<typeof accionesEnvio>) => accionesEnvio(...a).map((x) => `${x.rotulo}${x.nota ? "*" : ""}`);

  it("el Gestor solo envía su borrador", () => {
    expect(rotulos("borrador", "gestor")).toEqual(["Enviar"]);
    expect(rotulos("enviado", "gestor")).toEqual([]);
  });

  it("el Coordinador valida o devuelve con nota; no aprueba", () => {
    expect(rotulos("enviado", "coordinador").sort()).toEqual(["Devolver*", "Validar"]);
    expect(rotulos("validado", "coordinador")).toEqual(["Devolver*"]);
  });

  it("el Director aprueba, devuelve y reabre con motivo", () => {
    expect(rotulos("validado", "director").sort()).toEqual(["Aprobar", "Devolver*"]);
    expect(rotulos("aprobado", "director")).toEqual(["Reabrir*"]);
    expect(rotulos("aprobado", "coordinador")).toEqual([]);
  });

  it("sin papel en el campus no hay acciones", () => {
    expect(rotulos("borrador", null)).toEqual([]);
  });
});

describe("lo pendiente (cifra viva del lanzador)", () => {
  const envios = [
    { campus_id: "a", estado: "validado" as const },
    { campus_id: "a", estado: "enviado" as const },
    { campus_id: "b", estado: "enviado" as const },
  ];
  it("Director: lo validado espera su aprobación", () => {
    expect(pendientesDe({ director: true, coordinador: [], gestor: [] }, envios)).toEqual({ total: 1, unidad: "hoja por aprobar" });
  });
  it("Coordinador: lo enviado de sus campus", () => {
    expect(pendientesDe({ director: false, coordinador: ["a"], gestor: [] }, envios)).toEqual({ total: 1, unidad: "hoja por validar" });
  });
  it("Gestor: nada que validar ni aprobar", () => {
    expect(pendientesDe({ director: false, coordinador: [], gestor: ["a"] }, envios).total).toBe(0);
  });
  it("lo más atrasado va primero en lo que falta", () => {
    const f = faltantes([
      { campus_id: "a", hoja_id: "h", estado: "validado", filas: 1 },
      { campus_id: "b", hoja_id: "h", estado: "borrador", filas: 0 },
      { campus_id: "c", hoja_id: "h", estado: "aprobado", filas: 3 },
    ]);
    expect(f.map((x) => x.estado)).toEqual(["borrador", "validado"]);
  });
});

describe("secciones y periodos", () => {
  const p = (codigo: string, estado: IntPeriodoRow["estado"]): IntPeriodoRow => ({ id: codigo, codigo, nombre: codigo, abre: null, cierra: null, estado });

  it("Accesos solo para el Director; una sección desconocida no existe", () => {
    expect(seccionDe("accesos", false)).toBeNull();
    expect(seccionDe("accesos", true)).toBe("accesos");
    expect(seccionDe(undefined, false)).toBe("resumen");
    expect(seccionDe("otra", true)).toBeNull();
  });

  it("abre el periodo pedido o, si no, el abierto más reciente", () => {
    const lista = [p("2026-1", "abierto"), p("2026-2", "cerrado"), p("2025-2", "abierto")];
    expect(periodoInicial(lista, "2025-2")?.codigo).toBe("2025-2");
    expect(periodoInicial(lista)?.codigo).toBe("2026-1");
    expect(periodoInicial([])).toBeNull();
  });

  it("el siguiente periodo sigue al último: 2026-1 → 2026-2 → 2027-1", () => {
    expect(siguienteCodigo([p("2026-1", "cerrado")])).toBe("2026-2");
    expect(siguienteCodigo([p("2026-1", "cerrado"), p("2026-2", "abierto")])).toBe("2027-1");
    expect(siguienteCodigo([], "2026-10-14")).toBe("2026-2");
  });

  it("la línea de tiempo cubre meses enteros e incluye hoy", () => {
    const e = escalaTiempo(["2026-08-03", "2026-09-30"], "2026-10-14");
    expect(e.desde).toBe("2026-08-01");
    expect(e.hasta).toBe("2026-10-31");
    expect(e.meses.map((m) => m.rotulo)).toEqual(["ago", "sep", "oct"]);
    expect(e.pos("2026-08-01")).toBe(0);
    expect(e.pos("2027-01-01")).toBe(100);
  });
});
