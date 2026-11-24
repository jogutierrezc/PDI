import { describe, expect, it } from "vitest";
import type { OdIndicatorRow, OdValueRow } from "../../../types/database";
import {
  CAPTURE_LOCK_TEXTS,
  TOTAL,
  columnKeyOf,
  draftToValues,
  indexValues,
  indicatorColumns,
  indicatorGridModel,
  rowKeyOf,
} from "./indicator-grid";
import { cellKey, parseClipboardGrid, pasteIntoGrid } from "./sheet";
import type { CellKey } from "./sheet";

const indicator = (patch: Partial<OdIndicatorRow> = {}): OdIndicatorRow => ({
  id: "mat",
  report_id: "r1",
  key: "matriculados",
  label: "Estudiantes matriculados",
  unit: "estudiantes",
  format: "entero",
  direction: "sube",
  aggregation: "suma",
  reporting: "periodo",
  annual_rule: "ultimo",
  years: null,
  definition: "",
  office_id: null,
  position: 1,
  is_kpi: true,
  kpi_position: 1,
  is_headline: true,
  ...patch,
});

const CAMPUSES = ["buc", "cuc", "val"];
const YEARS = [2023, 2024, 2025];

const value = (indicator_id: string, year: number, term: OdValueRow["term"], campus_id: string | null, v: number | null): OdValueRow => ({
  indicator_id,
  year,
  term,
  campus_id,
  value: v,
});

/** La rejilla de un indicador como la arma el taller: total y campus por fila, años por columna. */
function gridOf(ind: OdIndicatorRow, stored: Map<string, number | null>, draft: Record<CellKey, number | null>) {
  const model = indicatorGridModel({ indicators: [ind], campusIds: CAMPUSES, stored, draft });
  const rows = [TOTAL, ...CAMPUSES].map((c) => rowKeyOf(ind.id, c));
  const columns = indicatorColumns(YEARS, { byTerm: ind.reporting !== "anual", annual: true }).map((c) => c.key);
  const editable = rows.map((r) => columns.map((c) => !model.lockedReason(r, c)));
  return { model, rows, columns, editable };
}

describe("columnas de la rejilla", () => {
  it("por periodo: periodo 1, periodo 2 y año de cada año, agrupadas por año", () => {
    const columns = indicatorColumns(YEARS, { byTerm: true, annual: true });
    expect(columns.map((c) => c.key)).toEqual(["2023-A", "2023-B", "2023-anual", "2024-A", "2024-B", "2024-anual", "2025-A", "2025-B", "2025-anual"]);
    expect(columns.filter((c) => c.group === "2024")).toHaveLength(3);
  });

  it("por año: una sola columna por año", () => {
    expect(indicatorColumns(YEARS, { byTerm: false, annual: true }).map((c) => c.key)).toEqual(["2023-anual", "2024-anual", "2025-anual"]);
  });

  it("acepta rótulos propios sin cambiar las claves", () => {
    const columns = indicatorColumns([2025], { byTerm: true, annual: true, labels: { A: "Periodo 1", B: "Periodo 2", anual: "Año" } });
    expect(columns.map((c) => c.label)).toEqual(["Periodo 1", "Periodo 2", "Año"]);
    expect(columns[0].key).toBe(columnKeyOf(2025, "A"));
  });
});

describe("total institucional y cifra del año", () => {
  const stored = indexValues([
    value("mat", 2025, "A", "buc", 100),
    value("mat", 2025, "A", "cuc", 40),
    value("mat", 2025, "A", "val", 10),
    value("mat", 2025, "B", "buc", 110),
    value("mat", 2025, "B", "cuc", 45),
  ]);

  it("el total se suma de los campus y queda vacío si falta uno", () => {
    const { model } = gridOf(indicator(), stored, {});
    expect(model.lockedValue(rowKeyOf("mat", TOTAL), "2025-A")).toBe(150);
    // Falta Valledupar en 2025-2: no hay total, y no es cero.
    expect(model.lockedValue(rowKeyOf("mat", TOTAL), "2025-B")).toBeNull();
    expect(model.lockedReason(rowKeyOf("mat", TOTAL), "2025-A")).toBe(CAPTURE_LOCK_TEXTS.summed);
  });

  it("lo que se está escribiendo entra al total sin guardar", () => {
    const draft = { [cellKey(rowKeyOf("mat", "val"), "2025-B")]: 12 } as Record<CellKey, number | null>;
    const { model } = gridOf(indicator(), stored, draft);
    expect(model.lockedValue(rowKeyOf("mat", TOTAL), "2025-B")).toBe(167);
  });

  it("la cifra del año sale de la regla del indicador: último, suma y promedio", () => {
    const row = rowKeyOf("mat", "buc");
    expect(gridOf(indicator({ annual_rule: "ultimo" }), stored, {}).model.lockedValue(row, "2025-anual")).toBe(110);
    expect(gridOf(indicator({ annual_rule: "suma" }), stored, {}).model.lockedValue(row, "2025-anual")).toBe(210);
    expect(gridOf(indicator({ annual_rule: "promedio" }), stored, {}).model.lockedValue(row, "2025-anual")).toBe(105);
  });

  it("«último» toma el periodo 1 si falta el 2; «suma» no inventa el que falta", () => {
    const row = rowKeyOf("mat", "val");
    expect(gridOf(indicator({ annual_rule: "ultimo" }), stored, {}).model.lockedValue(row, "2025-anual")).toBe(10);
    expect(gridOf(indicator({ annual_rule: "suma" }), stored, {}).model.lockedValue(row, "2025-anual")).toBeNull();
  });

  it("la columna Año está bloqueada cuando se calcula, y se escribe cuando «se reporta aparte»", () => {
    const row = rowKeyOf("mat", "buc");
    expect(gridOf(indicator(), stored, {}).model.lockKind(row, "2025-anual")).toBe("regla");
    expect(gridOf(indicator({ annual_rule: "reportado" }), stored, {}).model.lockKind(row, "2025-anual")).toBeNull();
  });

  it("un año sin dato del indicador queda bloqueado y sin cifra", () => {
    const { model } = gridOf(indicator({ years: [2024, 2025] }), stored, {});
    expect(model.lockKind(rowKeyOf("mat", "buc"), "2023-A")).toBe("sin-ano");
    expect(model.lockedValue(rowKeyOf("mat", "buc"), "2023-A")).toBeNull();
    expect(model.lockKind(rowKeyOf("mat", "buc"), "2024-A")).toBeNull();
  });

  it("un total «reportado» se escribe: no se suma", () => {
    const { model } = gridOf(indicator({ aggregation: "reportado" }), stored, {});
    expect(model.lockKind(rowKeyOf("mat", TOTAL), "2025-A")).toBeNull();
  });
});

describe("pegar un rango de Excel", () => {
  it("con varios años: salta la columna calculada del año y sigue en el año siguiente", () => {
    const ind = indicator();
    const { rows, columns, editable, model } = gridOf(ind, new Map(), {});
    // Tres campus, periodos 1 y 2 de 2023, 2024 y 2025: seis columnas.
    const text = "100\t110\t120\t130\t140\t150\r\n40\t44\t48\t52\t56\t60\r\n10\t11\t12\t13\t14\t15\r\n";
    const result = pasteIntoGrid({
      grid: parseClipboardGrid(text),
      rows,
      columns,
      editable,
      start: { row: 1, column: 0 },
      stored: model.storedValue,
      draft: {},
    });
    expect(result.count).toBe(18);
    expect(result.draft[cellKey(rowKeyOf("mat", "buc"), "2023-A")]).toBe(100);
    expect(result.draft[cellKey(rowKeyOf("mat", "buc"), "2024-A")]).toBe(120);
    expect(result.draft[cellKey(rowKeyOf("mat", "val"), "2025-B")]).toBe(15);
    // La columna Año no recibió nada: se calcula.
    expect(Object.keys(result.draft).some((k) => k.endsWith("-anual"))).toBe(false);
    // Con lo pegado, el total y el año se calculan a la vista.
    const after = indicatorGridModel({ indicators: [ind], campusIds: CAMPUSES, stored: new Map(), draft: result.draft });
    expect(after.lockedValue(rowKeyOf("mat", TOTAL), "2025-B")).toBe(225);
    expect(after.lockedValue(rowKeyOf("mat", "cuc"), "2024-anual")).toBe(52);
  });

  it("desde una casilla del medio: cae a la derecha y hacia abajo, y lo que sobra se descarta", () => {
    const { rows, columns, editable, model } = gridOf(indicator(), new Map(), {});
    const result = pasteIntoGrid({
      grid: [["1", "2", "3", "4"], ["5", "6", "7", "8"], ["9", "9", "9", "9"]],
      rows,
      columns,
      editable,
      start: { row: 2, column: columns.indexOf("2024-B") },
      stored: model.storedValue,
      draft: {},
    });
    // Desde 2024-2 quedan tres casillas editables (2024-2, 2025-1, 2025-2) y dos campus (Cúcuta, Valledupar).
    expect(result.count).toBe(6);
    expect(result.draft[cellKey(rowKeyOf("mat", "cuc"), "2024-B")]).toBe(1);
    expect(result.draft[cellKey(rowKeyOf("mat", "cuc"), "2025-B")]).toBe(3);
    expect(result.draft[cellKey(rowKeyOf("mat", "val"), "2025-A")]).toBe(6);
  });

  it("indicador por año: una casilla por año", () => {
    const ind = indicator({ reporting: "anual", annual_rule: "reportado" });
    const { rows, columns, editable, model } = gridOf(ind, new Map(), {});
    expect(columns).toEqual(["2023-anual", "2024-anual", "2025-anual"]);
    const result = pasteIntoGrid({
      grid: parseClipboardGrid("1.200\t1.250\t1.300\n400\t\t420\n90\t95\t99"),
      rows,
      columns,
      editable,
      start: { row: 1, column: 0 },
      stored: model.storedValue,
      draft: {},
    });
    expect(result.draft[cellKey(rowKeyOf("mat", "buc"), "2023-anual")]).toBe(1200);
    expect(result.draft[cellKey(rowKeyOf("mat", "val"), "2025-anual")]).toBe(99);
    // Una casilla vacía en lo pegado es «sin reportar»: igual a lo guardado, no es un cambio ni un cero.
    expect(cellKey(rowKeyOf("mat", "cuc"), "2024-anual") in result.draft).toBe(false);
    expect(draftToValues(result.draft).every((v) => v.term === "anual")).toBe(true);
  });

  it("un vacío pegado sobre una cifra guardada la deja sin reportar (null), nunca en cero", () => {
    const stored = indexValues([value("mat", 2023, "A", "buc", 100)]);
    const { rows, columns, editable, model } = gridOf(indicator(), stored, {});
    const result = pasteIntoGrid({ grid: [["", "5"]], rows, columns, editable, start: { row: 1, column: 0 }, stored: model.storedValue, draft: {} });
    expect(result.draft[cellKey(rowKeyOf("mat", "buc"), "2023-A")]).toBeNull();
  });

  it("lo que no es número queda como error de su casilla y no entra al borrador", () => {
    const { rows, columns, editable, model } = gridOf(indicator(), new Map(), {});
    const result = pasteIntoGrid({ grid: [["abc", "7"]], rows, columns, editable, start: { row: 1, column: 0 }, stored: model.storedValue, draft: {} });
    expect(result.count).toBe(1);
    expect(result.errors[cellKey(rowKeyOf("mat", "buc"), "2023-A")]).toContain("no es un número");
    expect(cellKey(rowKeyOf("mat", "buc"), "2023-A") in result.draft).toBe(false);
  });

  it("pegar lo mismo que ya está guardado no deja cambios", () => {
    const stored = indexValues([value("mat", 2023, "A", "buc", 100), value("mat", 2023, "B", "buc", 110)]);
    const { rows, columns, editable, model } = gridOf(indicator(), stored, {});
    const result = pasteIntoGrid({ grid: [["100", "110"]], rows, columns, editable, start: { row: 1, column: 0 }, stored: model.storedValue, draft: {} });
    expect(result.draft).toEqual({});
  });

  it("el pegado no escribe en la fila del total que se suma", () => {
    const { rows, columns, editable, model } = gridOf(indicator(), new Map(), {});
    // Enfocada la primera fila editable (Bucaramanga); un rango de cuatro filas no se sale de los campus.
    const result = pasteIntoGrid({ grid: [["1"], ["2"], ["3"], ["4"]], rows, columns, editable, start: { row: 1, column: 0 }, stored: model.storedValue, draft: {} });
    expect(result.count).toBe(3);
    expect(Object.keys(result.draft).some((k) => k.startsWith(`mat::${TOTAL}`))).toBe(false);
  });
});

describe("del borrador a la base", () => {
  it("cada casilla es una fila de od_values; el total va con campus nulo", () => {
    const draft = {
      [cellKey(rowKeyOf("mat", "buc"), "2025-A")]: 100,
      [cellKey(rowKeyOf("mat", TOTAL), "2024-anual")]: null,
    } as Record<CellKey, number | null>;
    expect(draftToValues(draft)).toEqual([
      { indicator_id: "mat", year: 2025, term: "A", campus_id: "buc", value: 100 },
      { indicator_id: "mat", year: 2024, term: "anual", campus_id: null, value: null },
    ]);
  });
});
