/* Conjuntos libres: el total escrito o calculado, y la lectura de una casilla
   que no encaja con el tipo de su columna. La regla vive en free-sets.ts y la
   comparten la ficha, el boletín y el CSV. */

import { describe, expect, it } from "vitest";
import { freeSetToTable } from "./csv-export";
import { cellShown, freeTotalAt, freeTotalShown, viewLostColumns, viewProblems } from "./free-sets";
import type { FreeColumn, FreeRow, FreeSet, FreeView } from "./free-sets";

const columns: FreeColumn[] = [
  { key: "sede", label: "Sede", kind: "texto" },
  { key: "n", label: "Docentes", kind: "cifra", format: "entero" },
  { key: "pct", label: "Satisfacción", kind: "cifra", format: "porcentaje" },
];

const dato = (sede: string, n: FreeRow["cells"][string], pct: FreeRow["cells"][string], year: number | null = null): FreeRow => ({
  year, kind: "dato", label: "", cells: { sede, n, pct },
});
const total = (cells: FreeRow["cells"] = {}, label = "Total", year: number | null = null): FreeRow => ({ year, kind: "total", label, cells });

describe("total de un conjunto libre: escrito o calculado", () => {
  const rows = [dato("Cúcuta", 10, 50), dato("Bucaramanga", 30, 70)];

  it("sin casillas escritas se calcula como siempre: los conjuntos ya guardados no cambian", () => {
    const list = [...rows, total()];
    const shown = freeTotalShown(list, 2, columns);
    expect(shown.cells).toEqual(freeTotalAt(list, 2, columns).cells);
    expect(shown.cells).toEqual({ n: 40, pct: 60 });
    expect(shown.basis).toEqual({ n: "suma", pct: "promedio" });
    expect(shown.written).toEqual([]);
    expect(shown.count).toBe(2);
  });

  it("la casilla escrita manda; la vacía se sigue calculando", () => {
    const shown = freeTotalShown([...rows, total({ n: 45, pct: null })], 2, columns);
    expect(shown.cells).toEqual({ n: 45, pct: 60 });
    expect(shown.written).toEqual(["n"]);
    // Solo lo calculado dice cómo se calculó.
    expect(shown.basis).toEqual({ pct: "promedio" });
  });

  it("una casilla vacía como texto también cuenta como vacía", () => {
    expect(freeTotalShown([...rows, total({ n: "", pct: "  " })], 2, columns).written).toEqual([]);
  });

  it("lo escrito se respeta tal cual: un número como texto se lee, un texto se muestra", () => {
    const shown = freeTotalShown([...rows, total({ sede: "Total Oriente", n: "1.234", pct: "N/D" })], 2, columns);
    expect(shown.cells).toEqual({ sede: "Total Oriente", n: 1.234, pct: "N/D" });
    expect(shown.written).toEqual(["sede", "n", "pct"]);
    expect(shown.basis).toEqual({});
  });

  it("un total escrito sirve aunque no tenga filas encima", () => {
    const shown = freeTotalShown([total({ n: 99 })], 0, columns);
    expect(shown.cells.n).toBe(99);
    expect(shown.count).toBe(0);
  });

  it("freeTotalAt no mira lo escrito: es el cálculo puro que usan Observatorio y Tableros", () => {
    expect(freeTotalAt([...rows, total({ n: 45 })], 2, columns).cells).toEqual({ n: 40, pct: 60 });
  });
});

describe("lectura de una casilla que no encaja con su columna", () => {
  it("una cifra es un número; un texto en una cifra se muestra como está escrito", () => {
    expect(cellShown(columns[1], 12)).toBe(12);
    expect(cellShown(columns[1], "1.234,5")).toBe(1234.5);
    expect(cellShown(columns[1], "en trámite")).toBe("en trámite");
    expect(cellShown(columns[1], " < 5 ")).toBe("< 5");
  });

  it("vacío es vacío, nunca cero", () => {
    expect(cellShown(columns[1], null)).toBeNull();
    expect(cellShown(columns[1], "")).toBeNull();
    expect(cellShown(columns[1], undefined)).toBeNull();
    expect(cellShown(columns[0], "  ")).toBeNull();
    expect(cellShown(columns[1], 0)).toBe(0);
  });

  it("en una columna de texto un número no se convierte", () => {
    expect(cellShown(columns[0], "2024")).toBe("2024");
    expect(cellShown({ kind: "fecha" }, "sin fecha")).toBe("sin fecha");
  });
});

describe("el CSV de un conjunto libre de la ficha", () => {
  const set = { temporality: "sin_tiempo" as const, columns, rows: [dato("Cúcuta", 10, 50), dato("Bucaramanga", "en trámite", 70), total({ n: 45 }, "Total Oriente")] };

  it("con la regla de la ficha, el total escrito sale escrito y el vacío calculado", () => {
    const table = freeSetToTable(set, { writtenTotals: true });
    expect(table.header).toEqual(["Tipo de fila", "Rótulo", "Sede", "Docentes", "Satisfacción"]);
    expect(table.rows).toEqual([
      ["Dato", null, "Cúcuta", 10, 50],
      // El texto en la columna de cifra sale como está, no como un hueco.
      ["Dato", null, "Bucaramanga", "en trámite", 70],
      ["Total", "Total Oriente", null, 45, 60],
    ]);
  });

  it("sin la opción —Observatorio y Tableros— el total es siempre el calculado", () => {
    expect(freeSetToTable(set).rows[2]).toEqual(["Total", "Total Oriente", null, 10, 60]);
  });

  it("un total de una fuente anual escrito a mano sale en su año", () => {
    const table = freeSetToTable(
      { temporality: "anual", columns, rows: [dato("Cúcuta", 10, null, 2024), total({ n: 11 }, "Total", 2024), dato("Cúcuta", 12, null, 2025), total({}, "Total", 2025)] },
      { writtenTotals: true },
    );
    expect(table.rows.map((row) => row[4])).toEqual([10, 11, 12, 12]);
  });
});

describe("gráficas y columnas que ya no están", () => {
  const view: FreeView = { key: "barras", title: "Docentes", type: "barras", category: "sede", series: ["n", "pct"] };
  const asSet = (cols: FreeColumn[]): FreeSet => ({ id: "s", title: "", description: "", source: "", temporality: "sin_tiempo", periodLabel: "", columns: cols, rows: [], views: [view] });

  it("una gráfica completa no ha perdido nada", () => {
    expect(viewLostColumns(asSet(columns), view)).toEqual([]);
  });

  it("le quitan una de sus cifras: se sigue dibujando, pero se sabe cuál falta", () => {
    const set = asSet(columns.filter((c) => c.key !== "pct"));
    expect(viewProblems(set, view)).toEqual([]);
    expect(viewLostColumns(set, view)).toEqual(["pct"]);
  });

  it("le quitan la de categorías: no se dibuja y se dice", () => {
    const set = asSet(columns.filter((c) => c.key !== "sede"));
    expect(viewProblems(set, view)).toEqual(["Elige la columna de categorías."]);
    expect(viewLostColumns(set, view)).toEqual(["sede"]);
  });
});
