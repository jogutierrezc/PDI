import { describe, expect, it } from "vitest";
import { cellTone, cellToneKey, legendOf, parsePaste, ROW_TONE_KEY } from "../../datos-abiertos/data/custom-table";
import type { FreeColumn, FreeRow, FreeView } from "../../datos-abiertos/data/free-sets";
import {
  applyPaste,
  buildOutput,
  draftOf,
  emptyColumn,
  emptyRow,
  isBlankRow,
  looksLikeHeader,
  previewPaste,
  STARTER_COLUMNS,
  starterView,
} from "./custom-table-draft";
import type { Draft } from "./custom-table-draft";

const columns: FreeColumn[] = [
  { key: "programa", label: "Programa", kind: "texto" },
  { key: "avance", label: "Avance", kind: "cifra", format: "porcentaje", decimals: 1, unit: "%" },
  { key: "estado", label: "Estado", kind: "texto", options: ["Cumple", "No cumple"] },
];

const view: FreeView = {
  key: "tabla",
  title: "Compromisos",
  type: "tabla",
  table: {
    cut: "2025-2",
    note: "Solo programas con registro vigente.",
    rowHeader: true,
    rules: {
      avance: [
        { op: "menor", value: 60, tone: "riesgo" },
        { op: "entre", min: 60, max: 80.5, tone: "atencion" },
        { op: "mayor_igual", value: 80.5, tone: "bien" },
      ],
      estado: [{ op: "es", option: "Cumple", tone: "bien" }],
    },
    labels: { bien: "Meta cumplida" },
  },
};

const stored = [
  { year: null, kind: "grupo" as const, label: "Salud", cells: {} },
  { year: null, kind: "dato" as const, label: "", cells: { programa: "Medicina", avance: 85.5, estado: "Cumple", [cellToneKey("programa")]: "seq-1" } },
  { year: null, kind: "dato" as const, label: "", cells: { programa: "Enfermería", avance: null, estado: "No cumple", [ROW_TONE_KEY]: "neutro" } },
  { year: null, kind: "total" as const, label: "Total", cells: { programa: "Total", avance: 70.25, estado: null } },
];

const set = { title: "Compromisos", description: "Avance por programa", office_id: "of-1", columns };
const draft = () => draftOf(set, view, stored);

describe("borrador de una tabla personalizada", () => {
  it("lo guardado vuelve igual después de pasar por el borrador", () => {
    const out = buildOutput(draft(), "tabla");
    expect(out.errors).toEqual([]);
    expect(out.columns).toEqual(columns);
    expect(out.view).toEqual(view);
    expect(out.rows).toEqual(stored);
  });

  it("los números se editan con coma decimal y sin miles", () => {
    const d = draft();
    expect(d.rows[1].cells[d.columns[1].id]).toBe("85,5");
    expect(d.columns[1].rules.map((rule) => [rule.op, rule.a, rule.b])).toEqual([
      ["menor", "60", ""],
      ["entre", "60", "80,5"],
      ["mayor_igual", "80,5", ""],
    ]);
  });

  it("una casilla vacía se guarda como null, nunca como 0", () => {
    const d = draft();
    const out = buildOutput(d, "tabla");
    expect(out.rows[2].cells.avance).toBeNull();
    d.rows[1].cells[d.columns[1].id] = "0";
    expect(buildOutput(d, "tabla").rows[1].cells.avance).toBe(0);
  });

  it("la fila de totales conserva lo escrito a mano", () => {
    const out = buildOutput(draft(), "tabla");
    expect(out.rows[3]).toMatchObject({ kind: "total", label: "Total", cells: { programa: "Total", avance: 70.25 } });
  });

  it("una columna nueva recibe una clave única salida de su nombre", () => {
    const d = draft();
    d.columns.push({ ...emptyColumn("numero", "Avance"), decimals: 0 }, emptyColumn("texto", "Observación"));
    const out = buildOutput(d, "tabla");
    expect(out.columns.map((c) => c.key)).toEqual(["programa", "avance", "estado", "avance-2", "observacion"]);
    expect(out.columns[3]).toMatchObject({ kind: "cifra", format: "entero", decimals: 0 });
  });

  it("renombrar una columna no cambia su clave ni pierde sus casillas", () => {
    const d = draft();
    d.columns[1].label = "Avance del plan";
    const out = buildOutput(d, "tabla");
    expect(out.columns[1]).toMatchObject({ key: "avance", label: "Avance del plan" });
    expect(out.rows[1].cells.avance).toBe(85.5);
  });

  it("reordenar columnas conserva casillas, reglas y color a mano", () => {
    const d = draft();
    d.columns = [d.columns[1], d.columns[0], d.columns[2]];
    const out = buildOutput(d, "tabla");
    expect(out.columns.map((c) => c.key)).toEqual(["avance", "programa", "estado"]);
    expect(out.rows[1].cells).toEqual(stored[1].cells);
    expect(out.view.table!.rules!.avance).toHaveLength(3);
  });

  it("no deja guardar con lo que falta, y dice qué falta", () => {
    const d = draft();
    d.meta.title = " ";
    d.meta.cut = "";
    d.columns[0].label = "";
    d.columns[2].options = [];
    d.rows[0].label = "";
    d.rows[1].cells[d.columns[1].id] = "alto";
    const out = buildOutput(d, "tabla");
    expect(out.errors.join("\n")).toMatch(/Ponle un título/);
    expect(out.errors.join("\n")).toMatch(/corte o periodo/);
    expect(out.errors.join("\n")).toMatch(/La columna 1 necesita un nombre/);
    expect(out.errors.join("\n")).toMatch(/es de categoría: escribe al menos un valor/);
    expect(out.errors.join("\n")).toMatch(/Fila 1: un título necesita su texto/);
    expect(out.errors.join("\n")).toMatch(/Fila 2 · Avance: «alto» no es un número/);
    expect(out.cellErrors.get(`${d.rows[1].id}|${d.columns[1].id}`)).toMatch(/no es un número/);
  });

  it("una regla a medio escribir es un error, no una regla silenciosa", () => {
    const d = draft();
    d.columns[1].rules[1].b = "";
    expect(buildOutput(d, "tabla").errors.join("\n")).toMatch(/Regla 2 de «Avance»: escribe los dos valores/);
    d.columns[1].rules[1].b = "50";
    expect(buildOutput(d, "tabla").errors.join("\n")).toMatch(/menor que el segundo/);
  });

  it("las filas en blanco no se guardan; un título o una fila coloreada sí", () => {
    const d = draft();
    d.rows.push(emptyRow(), { ...emptyRow(), tone: "atencion" }, emptyRow("total"));
    expect(isBlankRow(d.rows[4])).toBe(true);
    const out = buildOutput(d, "tabla");
    expect(out.rows).toHaveLength(6);
    expect(out.rows[4].cells[ROW_TONE_KEY]).toBe("atencion");
    expect(out.rows[5].label).toBe("Total");
    expect(out.rowOf.has(d.rows[4].id)).toBe(false);
  });

  it("el color de la rejilla es el mismo que verá el portal", () => {
    const d = draft();
    const out = buildOutput(d, "tabla");
    const tones = out.rows.map((row) => cellTone(out.view.table, out.columns[1], row as FreeRow)?.tone ?? null);
    expect(tones).toEqual([null, "bien", "neutro", null]);
    expect(legendOf(out.columns, out.view.table, out.rows as FreeRow[]).map((item) => `${item.glyph} ${item.label}`)).toEqual([
      "✓ Meta cumplida", "▲ Atención", "✕ Riesgo", "◇ Neutro", "○ Bajo",
    ]);
  });

  it("la tabla recién creada nace sin corte: no se publica hasta escribirlo", () => {
    const fresh = draftOf({ title: "Nueva", description: "", office_id: null, columns: STARTER_COLUMNS }, starterView("Nueva"), []);
    expect(fresh.columns.map((c) => c.kind)).toEqual(["texto", "numero"]);
    expect(buildOutput(fresh, "tabla").errors).toEqual(["Escribe el corte o periodo de la tabla: una cifra sin corte no se publica."]);
  });
});

describe("pegar sobre el borrador", () => {
  const empty = (): Draft => draftOf({ title: "Nueva", description: "", office_id: null, columns: STARTER_COLUMNS }, starterView("Nueva"), []);

  it("reemplazar toda la tabla crea las columnas con su tipo y sus nombres", () => {
    const grid = parsePaste("Sede\tDocentes\tCobertura\tEstado\nBucaramanga\t1.320\t85,5 %\tAcreditada\nCúcuta\t\t70 %\tEn proceso\n");
    expect(looksLikeHeader(grid)).toBe(true);
    const request = { grid, atRow: 0, atColumn: 0, header: true, replace: true };
    expect(previewPaste(empty(), request).errors).toBe(0);
    const next = applyPaste(empty(), request);
    expect(next.columns.map((c) => [c.label, c.kind, c.decimals, c.unit])).toEqual([
      ["Sede", "texto", 0, ""],
      ["Docentes", "numero", 0, ""],
      ["Cobertura", "numero", 1, "%"],
      ["Estado", "texto", 0, ""],
    ]);
    next.meta.cut = "2026-1";
    const out = buildOutput(next, "tabla");
    expect(out.errors).toEqual([]);
    expect(out.rows.map((row) => row.cells)).toEqual([
      { sede: "Bucaramanga", docentes: 1320, cobertura: 85.5, estado: "Acreditada" },
      { sede: "Cúcuta", docentes: null, cobertura: 70, estado: "En proceso" },
    ]);
  });

  it("pegar desde una casilla llena desde ahí, crea lo que falte y salta los títulos", () => {
    const d = draftOf(set, view, stored);
    const grid = parsePaste("90\tCumple\tRenovado\n55,5\tNo cumple\tEn visita\n10\tcumple\t\n");
    const next = applyPaste(d, { grid, atRow: 0, atColumn: 1, header: false, replace: false });
    // Una columna nueva (texto) y ninguna fila nueva: la primera fila es un título y se salta.
    expect(next.columns).toHaveLength(4);
    expect(next.columns[3]).toMatchObject({ label: "Columna 4", kind: "texto" });
    expect(next.rows).toHaveLength(4);
    const out = buildOutput(next, "tabla");
    expect(out.errors).toEqual([]);
    expect(out.rows[0]).toMatchObject({ kind: "grupo", label: "Salud" });
    expect(out.rows[1].cells).toMatchObject({ programa: "Medicina", avance: 90, estado: "Cumple", "columna-4": "Renovado" });
    expect(out.rows[2].cells).toMatchObject({ programa: "Enfermería", avance: 55.5, estado: "No cumple", "columna-4": "En visita", [ROW_TONE_KEY]: "neutro" });
    // «cumple» se guarda con la ortografía de la lista; la celda vacía, como sin dato.
    expect(out.rows[3].cells).toMatchObject({ avance: 10, estado: "Cumple", "columna-4": null });
  });

  it("lo que no se puede leer se pega tal cual y queda marcado", () => {
    const d = draftOf(set, view, stored);
    const request = { grid: [["alto", "Aprobado"]], atRow: 1, atColumn: 1, header: false, replace: false };
    expect(previewPaste(d, request).errors).toBe(2);
    const out = buildOutput(applyPaste(d, request), "tabla");
    expect(out.cellErrors.size).toBe(2);
    expect(out.errors).toHaveLength(2);
  });

  it("pegar al final añade filas sin tocar las que hay", () => {
    const d = draftOf(set, view, stored);
    const next = applyPaste(d, { grid: [["Derecho", "40", "No cumple"]], atRow: d.rows.length, atColumn: 0, header: false, replace: false });
    expect(next.rows).toHaveLength(5);
    const out = buildOutput(next, "tabla");
    expect(out.rows.slice(0, 4)).toEqual(stored);
    expect(out.rows[4].cells).toEqual({ programa: "Derecho", avance: 40, estado: "No cumple" });
  });

  it("no toma por encabezado una primera fila con números", () => {
    expect(looksLikeHeader([["2024", "2025"], ["10", "20"]])).toBe(false);
    expect(looksLikeHeader([["Sede", "Docentes"]])).toBe(false);
  });
});
