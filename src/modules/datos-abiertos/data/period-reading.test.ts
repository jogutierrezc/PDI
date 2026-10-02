import { describe, expect, it } from "vitest";
import {
  comparisonText,
  cutForYear,
  cutFromParams,
  cutToParams,
  latestTermCut,
  latestTermOfYear,
  periodReading,
  previousTermCut,
  readingCutText,
  startingCut,
} from "./period-reading";
import { ALL_YEARS } from "./terms";
import type { Breakdown, Indicator } from "./types";

const YEARS = [2023, 2024, 2025];

/** Matrícula: existencias, por periodo; 2025-2 todavía sin reportar. */
const matricula: Indicator = {
  id: "matricula",
  label: "Matrícula",
  unit: "estudiantes",
  format: "entero",
  direction: "sube",
  definition: "",
  source: "Registro",
  reporting: "periodo",
  annualRule: "ultimo",
  values: { 2023: { todas: 900 }, 2024: { todas: 1000 }, 2025: { todas: 1100 } },
  terms: {
    2023: { A: { todas: 880 }, B: { todas: 900 } },
    2024: { A: { todas: 950 }, B: { todas: 1000 } },
    2025: { A: { todas: 1100 }, B: { todas: null } },
  },
};

/** Programas acreditados: una sola cifra por año, sin periodos. */
const acreditados: Indicator = {
  id: "acreditados",
  label: "Programas acreditados",
  unit: "programas",
  format: "entero",
  direction: "sube",
  definition: "",
  source: "Calidad",
  reporting: "anual",
  values: { 2023: { todas: 10 }, 2024: { todas: 12 }, 2025: { todas: 12 } },
};

const sexo: Breakdown = {
  id: "sexo",
  title: "Por sexo",
  unit: "estudiantes",
  format: "entero",
  source: "Registro",
  values: {},
  terms: { 2025: { A: [{ label: "Mujeres", value: 600 }], B: [{ label: "Mujeres", value: 610 }] } },
};

describe("el periodo de partida", () => {
  it("abre en el periodo más reciente con dato, no en el último del calendario", () => {
    expect(latestTermCut({ indicators: [matricula, acreditados] }, YEARS)).toEqual({ year: 2025, term: "A" });
    expect(startingCut({ indicators: [matricula, acreditados] }, YEARS)).toEqual({ year: 2025, term: "A" });
  });

  it("un periodo sin dato es un vacío: no cuenta como reportado aunque valga null", () => {
    expect(latestTermOfYear({ indicators: [matricula] }, 2025)).toBe("A");
    expect(latestTermOfYear({ indicators: [matricula] }, 2024)).toBe("B");
  });

  it("un cero sí es un dato", () => {
    const cero: Indicator = { ...matricula, terms: { 2025: { A: { todas: 5 }, B: { todas: 0 } } } };
    expect(latestTermCut({ indicators: [cero] }, YEARS)).toEqual({ year: 2025, term: "B" });
  });

  it("los desgloses también cuentan para encontrar el periodo", () => {
    expect(latestTermCut({ indicators: [matricula], breakdowns: [sexo] }, YEARS)).toEqual({ year: 2025, term: "B" });
  });

  it("con cifras solo anuales abre en el último año con dato, como año", () => {
    expect(latestTermCut({ indicators: [acreditados] }, YEARS)).toBeNull();
    expect(startingCut({ indicators: [acreditados] }, YEARS)).toEqual({ year: 2025, term: null });
  });

  it("sin ninguna cifra, todo el periodo", () => {
    expect(startingCut({ indicators: [] }, YEARS)).toEqual({ year: ALL_YEARS, term: null });
  });

  it("respeta los años con dato del indicador", () => {
    const recortado: Indicator = { ...matricula, years: [2023, 2024] };
    expect(latestTermCut({ indicators: [recortado] }, YEARS)).toEqual({ year: 2024, term: "B" });
  });
});

describe("el corte en la URL", () => {
  const scope = { indicators: [matricula, acreditados] };
  const start = startingCut(scope, YEARS);

  it("sin parámetros, el periodo de partida", () => {
    expect(cutFromParams({ corte: null, periodo: null }, scope, YEARS)).toEqual(start);
  });

  it("un año sin periodo abre en su periodo más reciente con dato", () => {
    expect(cutFromParams({ corte: "2024", periodo: null }, scope, YEARS)).toEqual({ year: 2024, term: "B" });
  });

  it("la cifra del año y todo el periodo siguen disponibles, pedidos de forma explícita", () => {
    expect(cutFromParams({ corte: "2024", periodo: "anual" }, scope, YEARS)).toEqual({ year: 2024, term: null });
    expect(cutFromParams({ corte: "todos", periodo: "B" }, scope, YEARS)).toEqual({ year: ALL_YEARS, term: null });
  });

  it("acepta A y B, y 1 y 2", () => {
    expect(cutFromParams({ corte: "2024", periodo: "a" }, scope, YEARS)).toEqual({ year: 2024, term: "A" });
    expect(cutFromParams({ corte: "2024", periodo: "2" }, scope, YEARS)).toEqual({ year: 2024, term: "B" });
  });

  it("un año que no existe cae en el periodo de partida", () => {
    expect(cutFromParams({ corte: "1999", periodo: "A" }, scope, YEARS)).toEqual(start);
  });

  it("escribe y vuelve a leer el mismo corte; el de partida deja la URL limpia", () => {
    expect(cutToParams(start, start)).toEqual({ corte: null, periodo: null });
    for (const cut of [{ year: 2024, term: "A" as const }, { year: 2025, term: null }, { year: ALL_YEARS, term: null }]) {
      expect(cutFromParams(cutToParams(cut, start), scope, YEARS)).toEqual(cut);
    }
  });

  it("al cambiar de año conserva la lectura", () => {
    // Del periodo 1 de 2025 al mismo periodo de 2024.
    expect(cutForYear(scope, 2024, { year: 2025, term: "A" })).toEqual({ year: 2024, term: "A" });
    // El periodo 2 de 2025 no tiene dato: cae en el más reciente de ese año.
    expect(cutForYear(scope, 2025, { year: 2024, term: "B" })).toEqual({ year: 2025, term: "A" });
    // Quien lee por año sigue por año.
    expect(cutForYear(scope, 2023, { year: 2024, term: null })).toEqual({ year: 2023, term: null });
    // Desde «Todos» se entra por periodo.
    expect(cutForYear(scope, 2024, { year: ALL_YEARS, term: null })).toEqual({ year: 2024, term: "B" });
    expect(cutForYear(scope, ALL_YEARS, { year: 2024, term: "B" })).toEqual({ year: ALL_YEARS, term: null });
  });
});

describe("la lectura por periodo", () => {
  it("el periodo anterior cruza el año", () => {
    expect(previousTermCut({ year: 2025, term: "B" })).toEqual({ year: 2025, term: "A" });
    expect(previousTermCut({ year: 2025, term: "A" })).toEqual({ year: 2024, term: "B" });
  });

  it("compara primero con el periodo anterior y después con el mismo periodo del año anterior", () => {
    const reading = periodReading(matricula, 2025, "A", "todas");
    expect(reading.kind).toBe("periodo");
    expect(reading.value).toBe(1100);
    expect(reading.label).toBe("2025-1");
    expect(reading.comparisons).toEqual([
      { kind: "periodo-anterior", label: "2024-2", value: 1000 },
      { kind: "mismo-periodo", label: "2024-1", value: 950 },
    ]);
    expect(readingCutText(reading)).toBe("periodo 2025-1");
    expect(comparisonText(reading.comparisons[1])).toBe("2024-1, mismo periodo del año anterior");
  });

  it("un periodo sin reportar se queda vacío: ni cero ni la cifra del año", () => {
    const reading = periodReading(matricula, 2025, "B", "todas");
    expect(reading.kind).toBe("periodo");
    expect(reading.value).toBeNull();
    expect(reading.annualOnly).toBe(false);
  });

  it("en el primer año no inventa el mismo periodo del año anterior", () => {
    const reading = periodReading(matricula, 2023, "A", "todas");
    expect(reading.comparisons).toEqual([]);
    expect(periodReading(matricula, 2023, "B", "todas").comparisons).toEqual([{ kind: "periodo-anterior", label: "2023-1", value: 880 }]);
  });

  it("un indicador solo anual lee su año aunque se pida un periodo, y lo dice", () => {
    const reading = periodReading(acreditados, 2025, "B", "todas");
    expect(reading.kind).toBe("anual");
    expect(reading.annualOnly).toBe(true);
    expect(reading.cut).toEqual({ year: 2025, term: null });
    expect(reading.value).toBe(12);
    expect(reading.comparisons).toEqual([{ kind: "anio-anterior", label: "2024", value: 12 }]);
    expect(readingCutText(reading)).toBe("año 2025");
  });

  it("la lectura anual sigue disponible y no cambia: sale de la regla del indicador", () => {
    const reading = periodReading(matricula, 2024, null, "todas");
    expect(reading.kind).toBe("anual");
    expect(reading.annualOnly).toBe(false);
    expect(reading.value).toBe(1000);
    expect(reading.comparisons).toEqual([{ kind: "anio-anterior", label: "2023", value: 900 }]);
  });

  it("todo el periodo no se compara con nada", () => {
    const grouped: Indicator = { ...matricula, values: { ...matricula.values, [ALL_YEARS]: { todas: 1100 } } };
    const reading = periodReading(grouped, ALL_YEARS, null, "todas");
    expect(reading.kind).toBe("todo");
    expect(reading.value).toBe(1100);
    expect(reading.comparisons).toEqual([]);
  });

  it("un campus sin cifra queda sin reportar", () => {
    expect(periodReading(matricula, 2025, "A", "cucuta").value).toBeNull();
  });
});
