import { describe, expect, it } from "vitest";
import { toPortalData } from "./data";
import { edgePath, layoutNetwork, neighbours, programNetwork } from "./network";
import { indicatorSheet } from "./sheet";

const data = toPortalData({
  indicators: [
    { id: "i1", code: "I01", fn: "investigacion", stage: "insumos", name: "Semilleros", sheet: { objetivo: "Contar semilleros.", fichaBorrador: true } },
    { id: "e1", code: "E01", fn: "ensenanza", stage: "procesos", name: "Tutorías", source: "SIGA", numerator: "Tutorados", denominator: "Matriculados", measure: "porcentaje" },
    { id: "x1", code: "X01", fn: "extension", stage: "impacto", name: "Egresados empleados", direction: "baja" },
    { id: "x2", code: "X02", fn: "extension", stage: "productos", name: "No elegido" },
  ],
  program_indicators: [
    { id: "p1", code: "P-ENF-BGA-001", fn: "ensenanza", stage: "productos", name: "Tutorías entre pares", program_id: "enf", campus_id: "bga", parent_id: "e1" },
  ],
  alignments: [
    { indicator_id: "i1", target: "pilar", pillar_id: "pl1" },
    { indicator_id: "e1", target: "pilar", pillar_id: "pl1" },
    { indicator_id: "e1", target: "ods", sdg: 4 },
    { indicator_id: "x1", target: "ods", sdg: 4 },
  ],
  pillars: [{ id: "pl1", numeral: "1", name: "Formación integral" }],
  dimensions: [],
  units: [{ id: "enf", parent_id: null, kind: "programa", code: "ENF", name: "Enfermería", slug: "enfermeria" }],
  campuses: [{ id: "bga", slug: "bucaramanga", name: "Bucaramanga" }],
  adoptions: [
    { indicator_id: "i1", program_id: "enf", campus_id: "bga" },
    { indicator_id: "e1", program_id: "enf", campus_id: "bga", baseline_text: "40%", target_2026: "55%" },
    { indicator_id: "x1", program_id: "enf", campus_id: "bga" },
  ],
});

describe("el mapa de red de un programa", () => {
  const net = programNetwork(data, "enf");

  it("tiene las fichas que eligió y, aparte, sus propios", () => {
    expect(net.nodes.map((n) => [n.label, n.own])).toEqual([
      ["E01", false],
      ["I01", false],
      ["X01", false],
      ["P-001", true],
    ]);
  });

  it("une lo que comparte un pilar u ODS, y el propio con su ficha", () => {
    const pairs = net.edges.map((e) => `${e.a}-${e.b}:${e.keys.join("+")}:${e.cross ? "cruce" : "dentro"}`);
    expect(pairs).toEqual(["e1-i1:pilar:pl1:cruce", "e1-x1:ods:4:cruce", "e1-p1:ficha:dentro"]);
    expect([...neighbours(net.edges, "e1")].sort()).toEqual(["i1", "p1", "x1"]);
  });

  it("la leyenda nombra los pilares primero y cuenta sus hilos", () => {
    expect(net.themes).toEqual([
      { key: "pilar:pl1", label: "Pilar 1", hint: "Formación integral", edges: 1 },
      { key: "ods:4", label: "ODS 4", hint: "", edges: 1 },
    ]);
  });

  it("dibuja el triángulo: Investigación arriba, el programa en el centro, todo dentro del marco", () => {
    const layout = layoutNetwork(net.nodes);
    const inv = layout.nodes.get("i1")!;
    const ens = layout.nodes.get("e1")!;
    const ext = layout.nodes.get("x1")!;
    expect(inv.y).toBeLessThan(layout.hub.y);
    expect(ens.x).toBeLessThan(layout.hub.x);
    expect(ext.x).toBeGreaterThan(layout.hub.x);
    const { x, y, w, h } = layout.viewBox;
    for (const p of layout.nodes.values()) {
      expect(p.x).toBeGreaterThan(x);
      expect(p.x).toBeLessThan(x + w);
      expect(p.y).toBeGreaterThan(y);
      expect(p.y).toBeLessThan(y + h);
    }
    expect(edgePath(inv, ens, true, layout.hub)).toMatch(/^M.* C.*$/);
    expect(edgePath(ens, ens, false, layout.hub)).toMatch(/^M.* Q.*$/);
  });
});

describe("la ficha de un indicador", () => {
  const line = (sheet: ReturnType<typeof indicatorSheet>, key: string) => sheet.sections.flatMap((s) => s.lines).find((l) => l.key === key)!;

  it("usa el texto de la ficha y dice si es preliminar", () => {
    const sheet = indicatorSheet(data, data.indicators[0]);
    expect(line(sheet, "obj")).toMatchObject({ value: "Contar semilleros.", generated: false });
    expect(sheet.preliminary).toBe(true);
    expect(line(sheet, "pil").value).toBe("Pilar 1 · Formación integral");
  });

  it("sin texto, arma el método con numerador y denominador, y las metas del programa por sede", () => {
    const sheet = indicatorSheet(data, data.indicators[1], "enf");
    expect(line(sheet, "met")).toMatchObject({ value: "(Tutorados) ÷ (Matriculados) × 100. Unidad de medida: Porcentaje. Fuente de datos: SIGA.", generated: true });
    expect(line(sheet, "sede-bga")).toMatchObject({ label: "El programa en Bucaramanga", value: "LB 40% · 2026 55%" });
  });

  it("lee al revés lo que debe bajar, y un propio dice con qué ficha se relaciona", () => {
    expect(line(indicatorSheet(data, data.indicators[2]), "int").value).toMatch(/Mejora cuando baja/);
    expect(line(indicatorSheet(data, data.programIndicators[0]), "tipo").value).toBe("Indicador propio del programa, relacionado con E01 · Tutorías");
  });
});
