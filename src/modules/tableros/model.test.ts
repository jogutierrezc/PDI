import { describe, expect, it } from "vitest";
import { analyzeGrid, buildDataset } from "../admin/observatorio/analyze";
import type { Plan } from "../admin/observatorio/analyze";
import { PAGE_TEMPLATES, blockingProblems, pageOrDefault, reviewChecks, slugify } from "./model";
import type { Board, BoardDataset, BoardView } from "./model";

describe("Mis Tableros · plantillas", () => {
  it("las cuatro plantillas del Observatorio están, con sus nombres", () => {
    expect(PAGE_TEMPLATES.map((t) => t.id)).toEqual(["tablero", "narrativo", "comparativo", "ficha"]);
  });

  it("una página guardada antes de la migración se lee como tablero sin texto", () => {
    expect(pageOrDefault({ slug: "panorama", title: "Panorama" })).toEqual({
      slug: "panorama",
      title: "Panorama",
      template: "tablero",
      intro: "",
    });
  });

  it("una página con plantilla e intro no se toca", () => {
    const page = { slug: "permanencia", title: "Permanencia", template: "narrativo" as const, intro: "Cómo se lee." };
    expect(pageOrDefault(page)).toEqual(page);
  });

  it("el slug de una página nueva no choca con las que ya hay", () => {
    expect(slugify("Ficha Técnica 2026")).toBe("ficha-tecnica-2026");
  });
});

/* La importación de tableros: la unidad decide qué columnas entran, y el acta
   lo dice. Un tablero interno puede conservar lo marcado como dato personal;
   la revisión de publicación no lo deja salir al portal así.            */

const GRID = [
  ["Programa", "Correo", "Estudiantes"],
  ["Derecho", "a@udes.edu.co", "3"],
  ["Medicina", "b@udes.edu.co", "12"],
];

const basePlan = (over: Partial<Plan>): Plan => ({
  mode: "tal_cual",
  keep: ["programa", "correo", "estudiantes"],
  groupBy: [],
  measures: {},
  reserveColumns: [],
  ...over,
});

describe("Mis Tableros · importación con columnas sensibles", () => {
  it("sin permiso, lo marcado como dato personal se quita como siempre", () => {
    const analysis = analyzeGrid("libro.xlsx", GRID)!;
    const result = buildDataset(analysis, basePlan({}));
    expect(result.columns.map((c) => c.key)).toEqual(["programa", "estudiantes"]);
    expect(result.anonymization.sensitive).toBeUndefined();
    expect(result.anonymization.removed.map((r) => r.column)).toContain("Correo");
  });

  it("un tablero interno puede conservar lo sensible, y el acta lo declara", () => {
    const analysis = analyzeGrid("libro.xlsx", GRID)!;
    const result = buildDataset(analysis, basePlan({ allowSensitive: true }));
    expect(result.columns.map((c) => c.key)).toEqual(["programa", "correo", "estudiantes"]);
    expect(result.anonymization.sensitive).toEqual(["Correo"]);
  });

  it("la reserva umbral 5 esconde el 3; apagada (0), se guarda como viene", () => {
    const analysis = analyzeGrid("libro.xlsx", GRID)!;
    const withReserve = buildDataset(analysis, basePlan({ keep: ["programa", "estudiantes"], reserveColumns: ["estudiantes"], threshold: 5 }));
    expect(withReserve.rows[0].cells.estudiantes).toBe("< 5");
    expect(withReserve.anonymization.reservedCells).toBe(1);

    const without = buildDataset(analysis, basePlan({ keep: ["programa", "estudiantes"], reserveColumns: ["estudiantes"], threshold: 0 }));
    expect(without.rows[0].cells.estudiantes).toBe(3);
    expect(without.anonymization.reservedCells).toBe(0);
  });
});

describe("Mis Tableros · publicación con datos personales", () => {
  const board: Board = {
    id: "b1",
    unitId: "u1",
    slug: "tablero",
    title: "Tablero",
    description: "",
    visibility: "unidad",
    pages: [{ slug: "panorama", title: "Panorama", template: "tablero", intro: "" }],
    position: 0,
    updatedAt: new Date(0).toISOString(),
  };

  const dataset = (sensitive?: string[]): BoardDataset => ({
    id: "d1",
    boardId: "b1",
    title: "Tabla",
    description: "",
    source: "Decanatura",
    dataType: "conteo",
    temporality: "sin_tiempo",
    periodLabel: "",
    columns: [{ key: "programa", label: "Programa", kind: "texto" }],
    rows: [{ year: null, kind: "dato", label: "", cells: { programa: "Derecho" } }],
    anonymization: { fileName: "libro.xlsx", sourceRows: 2, sourceColumns: 3, removed: [], groupedBy: [], reservedCells: 0, threshold: 5, sensitive, at: new Date(0).toISOString() },
    position: 0,
    updatedAt: new Date(0).toISOString(),
  });

  const view: BoardView = {
    id: "v1",
    boardId: "b1",
    datasetId: "d1",
    page: "panorama",
    section: "detalle",
    spec: { type: "barras", category: "programa" },
    size: "media",
    visible: true,
    position: 1,
  };

  it("una tabla sin datos personales pasa", () => {
    const checks = reviewChecks(board, [dataset()], [view]);
    expect(checks.find((c) => c.key === "personales")?.ok).toBe(true);
    expect(blockingProblems(checks)).toEqual([]);
  });

  it("una tabla que conserva datos personales bloquea la publicación", () => {
    const checks = reviewChecks(board, [dataset(["Correo"])], [view]);
    expect(checks.find((c) => c.key === "personales")?.ok).toBe(false);
    expect(blockingProblems(checks).length).toBeGreaterThan(0);
  });
});
