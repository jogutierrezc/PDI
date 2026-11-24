/* La tabla de un conjunto libre en el boletín: el total escrito o calculado
   (la misma regla de la ficha, `freeTotalShown`) y el texto que alguien escribió
   en una columna de cifra, que se imprime como está y no como un hueco. */

import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { freeUnits } from "./free";
import type { FreeRow, FreeSet } from "../datos-abiertos/data/free-sets";

const set = (rows: FreeRow[], over: Partial<FreeSet> = {}): FreeSet => ({
  id: "docentes",
  title: "Docentes por sede",
  description: "",
  source: "Talento Humano",
  temporality: "sin_tiempo",
  periodLabel: "",
  columns: [
    { key: "sede", label: "Sede", kind: "texto" },
    { key: "n", label: "Docentes", kind: "cifra", format: "entero" },
    { key: "pct", label: "Satisfacción", kind: "cifra", format: "porcentaje" },
  ],
  views: [{ key: "tabla", type: "tabla", title: "Tabla" }],
  rows,
  ...over,
});

const dato = (sede: string, n: FreeRow["cells"][string], pct: FreeRow["cells"][string]): FreeRow => ({ year: null, kind: "dato", label: "", cells: { sede, n, pct } });

interface PrintedRow {
  label: string;
  cells: string[];
  strong?: boolean;
}

/** Las filas que llegan a la tabla impresa, sin dibujar nada. */
function printed(source: FreeSet): PrintedRow[] {
  const Sheet = () => null;
  const [unit] = freeUnits(source, source.views[0], 2025, Sheet as never, (() => null) as never);
  const sheet = unit.node as ReactElement<{ children: ReactElement<{ rows: PrintedRow[] }> }>;
  return sheet.props.children.props.rows;
}

describe("la tabla de un conjunto libre en el boletín", () => {
  it("un total sin casillas se imprime calculado, como antes", () => {
    const rows = printed(set([dato("Cúcuta", 10, 50), dato("Bucaramanga", 30, 70), { year: null, kind: "total", label: "Total Oriente", cells: {} }]));
    expect(rows[2].label).toBe("Total Oriente");
    expect(rows[2].cells).toEqual(["40", "60,0"]);
    expect(rows[2].strong).toBe(true);
  });

  it("la casilla escrita del total manda; la vacía se calcula", () => {
    const rows = printed(set([dato("Cúcuta", 10, 50), dato("Bucaramanga", 30, 70), { year: null, kind: "total", label: "Total Oriente", cells: { n: 45, pct: "N/D" } }]));
    expect(rows[2].label).toBe("Total Oriente");
    expect(rows[2].cells).toEqual(["45", "N/D"]);
  });

  it("un texto en una columna de cifra se imprime como está escrito", () => {
    const rows = printed(set([dato("Cúcuta", "en trámite", 50), dato("Bucaramanga", null, 70)]));
    expect(rows[0].cells[0]).toBe("en trámite");
    expect(rows[1].cells[0]).toBe("—");
  });
});
