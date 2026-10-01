import { describe, expect, it } from "vitest";
import { parseCsv } from "../../admin/udes-en-cifras/sheet";
import {
  breakdownToTable,
  countryName,
  csvFilename,
  csvZipName,
  departmentName,
  freeSetToTable,
  heatmapToTable,
  historyToTable,
  indicatorsToTable,
  mapToTable,
  medalBoardToTable,
  modelToTable,
  municipioName,
  pipelineToTable,
  rankingToTable,
  saberProToTable,
  saberTytCurvesToTable,
  saberTytModelsToTable,
  saberTytResultsToTable,
  tableToTable,
  toCsvText,
  uniqueLabels,
} from "./csv-export";
import type { CsvTable, FreeTable } from "./csv-export";
import type { MedalBoard } from "./medals";
import type { RankingData, RankingEdition } from "./rankings";
import { formatReserved, RESERVE_DEFAULT, valueOf } from "./reserve";
import type { SaberProData, SaberResult } from "./saber-pro";
import type { SaberTytData, TytResult } from "./saber-tyt";
import { slugify } from "./slug";
import { ALL_YEARS } from "./terms";
import type { Breakdown, HeatmapData, HistoryData, Indicator, MapDataset, ModelData, PipelineData, TableData } from "./types";

const BOM = "\uFEFF";
const campuses = [
  { id: "todas", name: "Total institucional" },
  { id: "bucaramanga", name: "Bucaramanga" },
  { id: "cucuta", name: "Cúcuta" },
];

/** El texto de una sola celda, tal como queda escrito. */
const written = (cell: string | number | null) => toCsvText({ header: ["c"], rows: [[cell]] }).slice(`${BOM}c\n`.length);
/** Las celdas del CSV ya escrito, sin el BOM: para buscar un número que no debe estar. */
const cellsOf = (table: CsvTable) => toCsvText(table).replace(BOM, "").split("\n").flatMap((line) => line.split(";"));
const column = (table: CsvTable, label: string) => table.rows.map((row) => row[table.header.indexOf(label)]);

describe("escritor de CSV", () => {
  it("empieza con BOM, separa con punto y coma y una fila por línea", () => {
    const text = toCsvText({ header: ["a", "b"], rows: [["x", 1], ["y", 2]] });
    expect(text).toBe(`${BOM}a;b\nx;1\ny;2`);
  });

  it("escribe los números con coma decimal, sin comillas ni apóstrofo", () => {
    expect(written(1.5)).toBe("1,5");
    expect(written(-3)).toBe("-3");
    expect(written(-0.25)).toBe("-0,25");
    expect(written(0)).toBe("0");
    expect(written(1234567)).toBe("1234567");
  });

  it("no escribe ruido de coma flotante: redondea a seis decimales", () => {
    expect(written(0.1 + 0.2)).toBe("0,3");
    expect(written(1.005 * 1000)).toBe("1005");
    expect(written(1 / 3)).toBe("0,333333");
    expect(written(2 / 3)).toBe("0,666667");
    expect(written(123456789.125)).toBe("123456789,125");
    expect(written(0.000025)).toBe("0,000025");
  });

  it("nunca usa notación científica, ni en lo muy grande ni en lo muy pequeño", () => {
    expect(written(1e21)).toBe("1000000000000000000000");
    expect(written(-1.5e22)).toBe("-15000000000000000000000");
    expect(written(1.5e-7)).toBe("0");
    expect(written(-1e-9)).toBe("0");
    for (const value of [1e21, 1e-7, 6.02e23, -3e-10, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE]) {
      expect(written(value)).toMatch(/^-?\d+(,\d{1,6})?$/);
    }
  });

  it("deja vacío lo nulo y lo que no es un número finito", () => {
    expect(written(null)).toBe("");
    expect(written(Number.NaN)).toBe("");
    expect(written(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("pone entre comillas el separador, las comillas, los saltos y los espacios de los bordes", () => {
    expect(written("a;b")).toBe('"a;b"');
    expect(written('dijo "sí"')).toBe('"dijo ""sí"""');
    expect(written("dos\nlíneas")).toBe('"dos\nlíneas"');
    expect(written("retorno\rde carro")).toBe('"retorno\rde carro"');
    expect(written(" con borde ")).toBe('" con borde "');
    expect(written("sin nada raro")).toBe("sin nada raro");
  });

  it("desactiva con un apóstrofo el texto que una hoja de cálculo leería como fórmula", () => {
    expect(written("=1+1")).toBe("'=1+1");
    expect(written("+x")).toBe("'+x");
    expect(written("-x")).toBe("'-x");
    expect(written("@x")).toBe("'@x");
    expect(written("=145")).toBe("'=145");
    expect(written("\tx")).toBe("'\tx");
    expect(written("\rx")).toBe("\"'\rx\"");
    expect(written('=HYPERLINK("http://x";"y")')).toBe('"\'=HYPERLINK(""http://x"";""y"")"');
  });

  it("no toca el techo de reserva ni un guion que no va al principio", () => {
    expect(written("< 5")).toBe("< 5");
    expect(written("2020-1")).toBe("2020-1");
    expect(written("801–1000")).toBe("801–1000");
  });

  it("aplica la misma regla al encabezado", () => {
    expect(toCsvText({ header: ["=SUM(A1)", "a;b"], rows: [] })).toBe(`${BOM}'=SUM(A1);"a;b"`);
  });

  it("va y vuelve por el lector de las plantillas de captura", () => {
    const table: CsvTable = {
      header: ["Texto", "Cifra", "Nota"],
      rows: [
        ["a;b", 1.5, 'dijo "sí"'],
        ["dos\nlíneas", -3, null],
        ["< 5", 0, " borde "],
      ],
    };
    expect(parseCsv(toCsvText(table))).toEqual([
      ["Texto", "Cifra", "Nota"],
      ["a;b", "1,5", 'dijo "sí"'],
      ["dos\nlíneas", "-3", ""],
      ["< 5", "0", " borde "],
    ]);
  });

  it("numera los rótulos repetidos", () => {
    expect(uniqueLabels(["Sede", "Total", "Sede", "Sede", "Sede (2)"])).toEqual(["Sede", "Total", "Sede (2)", "Sede (3)", "Sede (2) (2)"]);
  });
});

describe("nombres de archivo", () => {
  it("quita tildes, espacios y signos", () => {
    expect(slugify("Matrícula por género (2024)")).toBe("matricula-por-genero-2024");
    expect(slugify("  Ñandú   y  pingüino ")).toBe("nandu-y-pinguino");
  });

  it("corta los textos largos sin dejar un guion colgando", () => {
    const slug = slugify("palabra ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slugify(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
  });

  it("usa el nombre de reserva si no queda nada", () => {
    expect(slugify("")).toBe("grafica");
    expect(slugify("¿¡!?")).toBe("grafica");
    expect(slugify("—", "datos")).toBe("datos");
  });

  it("arma el nombre del zip y el del archivo suelto", () => {
    expect(csvZipName("Población Estudiantil")).toBe("udes-en-cifras-poblacion-estudiantil.zip");
    expect(csvFilename("Población Estudiantil", "mapa", "origen")).toBe("udes-en-cifras-poblacion-estudiantil-mapa-origen.csv");
    expect(csvFilename("", "", "")).toBe("udes-en-cifras-informe-conjunto-datos.csv");
  });
});

describe("lectura de una cifra y reserva", () => {
  it("escribe el techo de reserva", () => {
    expect(formatReserved()).toBe(`< ${RESERVE_DEFAULT}`);
    expect(formatReserved(10)).toBe("< 10");
  });

  it("no lee una cifra fuera de los años declarados", () => {
    const indicator = { years: [2024], values: { 2023: { todas: 9 }, 2024: { todas: 4 } } } as unknown as Indicator;
    expect(valueOf(indicator, 2023, "todas")).toBeNull();
    expect(valueOf(indicator, 2024, "todas")).toBe(4);
    expect(valueOf(indicator, 2024, "cucuta")).toBeNull();
  });
});

describe("nombres de territorio", () => {
  it("encuentra departamento, país y municipio por su código", () => {
    expect(departmentName("05")).toBe("Antioquia");
    expect(countryName("AFG")).toBe("Afganistán");
    expect(municipioName("05001")).toBe("Medellín");
  });

  it("devuelve vacío si el código no existe", () => {
    expect(departmentName("00")).toBe("");
    expect(countryName("ZZZ")).toBe("");
    expect(municipioName("99999")).toBe("");
  });
});

/* --- Indicadores ---------------------------------------------------------------------- */

const indicator = (over: Partial<Indicator>): Indicator => ({
  id: "matricula",
  label: "Matrícula",
  unit: "estudiantes",
  format: "entero",
  direction: "sube",
  definition: "",
  source: "Registro",
  values: {},
  ...over,
});

describe("indicadores", () => {
  const matricula = indicator({
    annualRule: "ultimo",
    values: { [ALL_YEARS]: { todas: 999 }, 2023: { todas: 100 }, 2024: { todas: 120, cucuta: 30.5 } },
    terms: { 2024: { A: { todas: 110 }, B: { todas: 120 } } },
  });

  it("pone una fila por indicador y campus, con los periodos y la cifra del año", () => {
    const table = indicatorsToTable({ reportName: "Población", indicators: [matricula], years: [2023, 2024], campuses });
    expect(table.header).toEqual([
      "Informe", "Clave", "Indicador", "Unidad", "Campus",
      "2023-1", "2023-2", "2023 (año)", "2024-1", "2024-2", "2024 (año)",
      "Regla anual", "Fuente",
    ]);
    expect(table.rows).toEqual([
      ["Población", "matricula", "Matrícula", "estudiantes", "Total institucional", null, null, 100, 110, 120, 120, "Último periodo reportado", "Registro"],
      ["Población", "matricula", "Matrícula", "estudiantes", "Cúcuta", null, null, null, null, null, 30.5, "Último periodo reportado", "Registro"],
    ]);
  });

  it("no exporta el corte «todo el periodo» aunque llegue entre los años", () => {
    const table = indicatorsToTable({ reportName: "Población", indicators: [matricula], years: [ALL_YEARS, 2024], campuses });
    expect(table.header).not.toContain("0 (año)");
    expect(cellsOf(table)).not.toContain("999");
  });

  it("respeta los años declarados del indicador", () => {
    const parcial = indicator({ years: [2024], values: { 2023: { todas: 777 }, 2024: { todas: 5 } } });
    const table = indicatorsToTable({ reportName: "Población", indicators: [parcial], years: [2023, 2024], campuses });
    expect(column(table, "2023 (año)")).toEqual([null]);
    expect(cellsOf(table)).not.toContain("777");
  });

  it("deja vacío lo que no se reportó y escribe el cero", () => {
    const tasa = indicator({ values: { 2024: { todas: 0, cucuta: null } } });
    const table = indicatorsToTable({ reportName: "Población", indicators: [tasa], years: [2024], campuses });
    expect(table.rows).toHaveLength(1);
    expect(column(table, "2024 (año)")).toEqual([0]);
    expect(column(table, "Regla anual")).toEqual([null]);
  });
});

/* --- Desgloses ------------------------------------------------------------------------ */

const breakdown = (over: Partial<Breakdown>): Breakdown => ({
  id: "pueblo",
  title: "Pueblo indígena",
  unit: "estudiantes",
  format: "entero",
  source: "Bienestar",
  values: {},
  ...over,
});

describe("desgloses", () => {
  it("pone una fila por corte y categoría, sin total", () => {
    const table = breakdownToTable(
      breakdown({ values: { 2024: [{ label: "Wayuu", value: 40 }, { label: "Kogui", value: null }] } }),
    );
    expect(table.header).toEqual(["Desglose", "Año", "Periodo", "Categoría", "Valor", "Reservado", "Unidad", "Fuente"]);
    expect(table.rows).toEqual([
      ["Pueblo indígena", 2024, "Anual", "Wayuu", 40, null, "estudiantes", "Bienestar"],
      ["Pueblo indígena", 2024, "Anual", "Kogui", null, null, "estudiantes", "Bienestar"],
    ]);
    expect(table.rows.some((row) => row.includes("Total"))).toBe(false);
  });

  it("nunca escribe el número de una celda reservada", () => {
    const table = breakdownToTable(
      breakdown({
        reserveThreshold: 5,
        values: { 2024: [{ label: "Wayuu", value: 40 }, { label: "Kogui", value: 7, reserved: true }] },
      }),
    );
    expect(table.rows[1]).toEqual(["Pueblo indígena", 2024, "Anual", "Kogui", null, "< 5", "estudiantes", "Bienestar"]);
    expect(cellsOf(table)).not.toContain("7");
    expect(toCsvText(table)).toContain("Kogui;;< 5");
  });

  it("tampoco lo escribe cuando la celda reservada viene por periodo", () => {
    const table = breakdownToTable(
      breakdown({
        reserveThreshold: 10,
        annualRule: "suma",
        values: { 2024: [{ label: "Kogui", value: 47 }] },
        terms: { 2024: { A: [{ label: "Kogui", value: 7, reserved: true }], B: [{ label: "Kogui", value: 40 }] } },
      }),
    );
    expect(table.rows.map((row) => row.slice(1, 6))).toEqual([
      [2024, "1", "Kogui", null, "< 10"],
      [2024, "2", "Kogui", 40, null],
    ]);
    // La cifra del año es la suma de los periodos: con ella, la reservada se despeja por resta.
    expect(cellsOf(table)).not.toContain("7");
    expect(cellsOf(table)).not.toContain("47");
  });

  it("omite el corte «todo el periodo» y los años no declarados", () => {
    const table = breakdownToTable(
      breakdown({
        years: [2024],
        values: {
          [ALL_YEARS]: [{ label: "Wayuu", value: 888 }],
          2023: [{ label: "Wayuu", value: 333 }],
          2024: [{ label: "Wayuu", value: 40 }],
        },
      }),
    );
    expect(column(table, "Año")).toEqual([2024]);
    expect(cellsOf(table)).not.toContain("888");
    expect(cellsOf(table)).not.toContain("333");
  });

  it("exporta la cifra del año cuando se reporta aparte de los periodos", () => {
    const table = breakdownToTable(
      breakdown({
        annualRule: "reportado",
        values: { 2024: [{ label: "Wayuu", value: 50 }] },
        terms: { 2024: { A: [{ label: "Wayuu", value: 20 }] } },
      }),
    );
    expect(table.rows.map((row) => [row[2], row[4]])).toEqual([["1", 20], ["Anual", 50]]);
  });

  it("con periodo preferido lee un solo corte por año, como el tablero de la diversidad", () => {
    const table = breakdownToTable(
      breakdown({
        annualRule: "ultimo",
        values: { 2023: [{ label: "Wayuu", value: 30 }], 2024: [{ label: "Wayuu", value: 41 }] },
        terms: { 2024: { A: [{ label: "Wayuu", value: 39 }], B: [{ label: "Wayuu", value: 41 }, { label: "Kogui", value: 2, reserved: true }] } },
      }),
      { preferTerm: "B" },
    );
    expect(table.rows.map((row) => row.slice(1, 6))).toEqual([
      [2023, "Anual", "Wayuu", 30, null],
      [2024, "2", "Wayuu", 41, null],
      [2024, "2", "Kogui", null, "< 5"],
    ]);
  });

  it("no tiene ninguna columna de total", () => {
    expect(breakdownToTable(breakdown({})).header.some((label) => /total/i.test(label))).toBe(false);
  });
});

/* --- Mapas ---------------------------------------------------------------------------- */

const map = (over: Partial<MapDataset>): MapDataset => ({
  id: "origen",
  title: "Origen",
  description: "",
  mode: "origen",
  unit: "estudiantes",
  source: "Registro",
  values: {},
  ...over,
});

describe("mapas por departamento y por país", () => {
  it("pone una fila por año, campus y territorio con dato", () => {
    const table = mapToTable(
      map({ values: { 2024: { cucuta: { "54": 10 }, bucaramanga: { "68": 200, "05": 12.5 } } } }),
      { campuses },
    );
    expect(table.header).toEqual(["Mapa", "Año", "Campus", "Código", "Nombre", "Valor", "Unidad", "Fuente"]);
    expect(table.rows).toEqual([
      ["Origen", 2024, "Bucaramanga", "05", "Antioquia", 12.5, "estudiantes", "Registro"],
      ["Origen", 2024, "Bucaramanga", "68", "Santander", 200, "estudiantes", "Registro"],
      ["Origen", 2024, "Cúcuta", "54", "Norte de Santander", 10, "estudiantes", "Registro"],
    ]);
  });

  it("conserva la fila de un código desconocido, con el nombre vacío", () => {
    const table = mapToTable(map({ values: { 2024: { todas: { "00": 3 } } } }), { campuses });
    expect(table.rows).toEqual([["Origen", 2024, "Total institucional", "00", null, 3, "estudiantes", "Registro"]]);
  });

  it("omite el corte derivado, los años no declarados y las reservadas que la ficha no pinta", () => {
    const table = mapToTable(
      map({
        years: [2024],
        values: { [ALL_YEARS]: { todas: { "68": 555 } }, 2023: { todas: { "68": 444 } }, 2024: { todas: { "68": 200 } } },
        reserved: { 2024: { todas: ["54"] } },
      }),
      { campuses },
    );
    expect(table.rows).toEqual([["Origen", 2024, "Total institucional", "68", "Santander", 200, "estudiantes", "Registro"]]);
    expect(table.header).not.toContain("Reservado");
    expect(toCsvText(table)).not.toContain("< 5");
    expect(cellsOf(table)).not.toContain("555");
    expect(cellsOf(table)).not.toContain("444");
  });

  it("exporta un dato global con su rótulo en vez del año", () => {
    const table = mapToTable(
      map({ mode: "convenios", title: "Convenios", reporting: "global", unit: "convenios", values: { [ALL_YEARS]: { todas: { AFG: 2 } } } }),
      { campuses },
    );
    expect(table.rows).toEqual([["Convenios", "Dato global", "Total institucional", "AFG", "Afganistán", 2, "convenios", "Registro"]]);
  });

  it("junta entrante y saliente y dice el sentido", () => {
    const table = mapToTable(
      [
        map({ mode: "entrante", title: "Entrante", values: { 2024: { cucuta: { AFG: 1 } } } }),
        map({ mode: "saliente", title: "Saliente", values: { 2024: { cucuta: { AFG: 4 } } } }),
      ],
      { campuses },
    );
    expect(table.header).toEqual(["Mapa", "Sentido", "Año", "Campus", "Código", "Nombre", "Valor", "Unidad", "Fuente"]);
    expect(table.rows.map((row) => [row[1], row[6]])).toEqual([["Entrante", 1], ["Saliente", 4]]);
  });

  it("no inventa filas para los territorios sin dato", () => {
    expect(mapToTable(map({ values: { 2024: {} } }), { campuses }).rows).toEqual([]);
  });
});

describe("mapa por municipio", () => {
  const municipios = map({
    mode: "municipio",
    title: "Origen por municipio",
    values: {
      [ALL_YEARS]: { bucaramanga: { "05001": 666 } },
      2024: { bucaramanga: { "05": 90, "68": 300, "05001": 80, "05002": 7, "00999": 6 } },
    },
    reserved: { 2024: { bucaramanga: ["05002", "05004", "05"] } },
  });
  const table = mapToTable(municipios, { campuses });

  it("pone solo filas de municipio, con su departamento al lado", () => {
    expect(table.header).toEqual(["Mapa", "Año", "Campus", "DIVIPOLA", "Municipio", "Depto", "Valor", "Reservado", "Unidad", "Fuente"]);
    expect(table.rows).toEqual([
      ["Origen por municipio", 2024, "Bucaramanga", "00999", null, null, 6, null, "estudiantes", "Registro"],
      ["Origen por municipio", 2024, "Bucaramanga", "05001", "Medellín", "Antioquia", 80, null, "estudiantes", "Registro"],
      ["Origen por municipio", 2024, "Bucaramanga", "05002", "Abejorral", "Antioquia", null, "< 5", "estudiantes", "Registro"],
      ["Origen por municipio", 2024, "Bucaramanga", "05004", "Abriaquí", "Antioquia", null, "< 5", "estudiantes", "Registro"],
    ]);
  });

  it("nunca escribe una fila de departamento: contiene a los municipios reservados", () => {
    expect(column(table, "DIVIPOLA").every((code) => /^\d{5}$/.test(String(code)))).toBe(true);
    expect(cellsOf(table)).not.toContain("90");
    expect(cellsOf(table)).not.toContain("300");
  });

  it("nunca escribe el número de un municipio reservado, ni el corte derivado", () => {
    expect(cellsOf(table)).not.toContain("7");
    expect(cellsOf(table)).not.toContain("666");
  });

  it("exporta un año que solo tiene municipios reservados", () => {
    const solo = mapToTable(map({ mode: "municipio", values: {}, reserved: { 2023: { cucuta: ["54001"] } } }), { campuses });
    expect(solo.rows.map((row) => row.slice(1, 8))).toEqual([[2023, "Cúcuta", "54001", municipioName("54001"), "Norte de Santander", null, "< 5"]]);
  });

  it("no escribe el total institucional: con un campus reservado, lo despejaría por resta", () => {
    const conTotal = mapToTable(
      map({
        mode: "municipio",
        values: { 2024: { todas: { "54001": 12, "54003": 40 }, bucaramanga: { "54001": 9 }, cucuta: { "54001": 3 } } },
        reserved: { 2024: { cucuta: ["54001"], todas: ["54003"] } },
      }),
      { campuses },
    );
    expect(conTotal.rows.map((row) => row.slice(1, 8))).toEqual([
      [2024, "Bucaramanga", "54001", municipioName("54001"), "Norte de Santander", 9, null],
      [2024, "Cúcuta", "54001", municipioName("54001"), "Norte de Santander", null, "< 5"],
    ]);
    expect(column(conTotal, "Campus")).not.toContain("Total institucional");
    // Ni el total (12), ni lo que daría la resta (3), ni nada de lo que solo tenía el total.
    expect(cellsOf(conTotal)).not.toContain("12");
    expect(cellsOf(conTotal)).not.toContain("3");
    expect(cellsOf(conTotal)).not.toContain("40");
    expect(cellsOf(conTotal)).not.toContain("54003");
    // Un mapa que solo trae el total no deja filas.
    expect(mapToTable(map({ mode: "municipio", values: { 2024: { todas: { "54001": 12 } } } }), { campuses }).rows).toEqual([]);
  });
});

/* --- Tubería, histórico, mapa de calor y tabla ------------------------------------------ */

describe("tubería", () => {
  const pipeline: PipelineData = {
    id: "t",
    title: "Permanencia",
    description: "",
    stages: ["Ingreso", "Semestre 2", "Grado"],
    cohorts: [{ cohort: "2014-A", campus: "cucuta", remaining: [100, 80, null], dropout: [null, 20], mainCause: ["Económica", ""] }],
    source: "Registro",
  };

  it("pone una fila por cohorte y etapa, sin deducir el retiro", () => {
    const table = pipelineToTable(pipeline, { campuses });
    expect(table.header).toEqual(["Cohorte", "Campus", "N.º etapa", "Etapa", "Valor", "Retiro del tramo", "Causa principal", "Medida"]);
    expect(table.rows).toEqual([
      ["2014-1", "Cúcuta", 1, "Ingreso", 100, null, null, "Estudiantes"],
      ["2014-1", "Cúcuta", 2, "Semestre 2", 80, 20, "Económica", "Estudiantes"],
      ["2014-1", "Cúcuta", 3, "Grado", null, null, null, "Estudiantes"],
    ]);
  });
});

describe("histórico", () => {
  const history: HistoryData = {
    id: "h",
    title: "Matrícula",
    description: "",
    unit: "estudiantes",
    format: "entero",
    totalLabel: "Total UDES",
    source: "",
    periods: ["2020-A", "2020-B"],
    categories: ["Pregrado", "Posgrado"],
    total: { "2020-A": 110, "2020-B": null },
    values: { Pregrado: { "2020-A": 100, "2020-B": 90 }, Posgrado: { "2020-A": 10 } },
  };

  it("pone una fila por periodo y categoría, y el total capturado como una categoría más", () => {
    const table = historyToTable(history);
    expect(table.header).toEqual(["Periodo", "Categoría", "Valor", "Unidad"]);
    expect(table.rows).toEqual([
      ["2020-1", "Pregrado", 100, "estudiantes"],
      ["2020-1", "Posgrado", 10, "estudiantes"],
      ["2020-1", "Total UDES", 110, "estudiantes"],
      ["2020-2", "Pregrado", 90, "estudiantes"],
      ["2020-2", "Posgrado", null, "estudiantes"],
      ["2020-2", "Total UDES", null, "estudiantes"],
    ]);
  });

  it("no suma las categorías cuando el total no se capturó", () => {
    const table = historyToTable({ ...history, total: {} });
    expect(column(table, "Categoría")).not.toContain("Total UDES");
    expect(cellsOf(table)).not.toContain("110");
  });
});

describe("mapa de calor", () => {
  const heatmap: HeatmapData = {
    id: "h",
    title: "Matrícula",
    description: "",
    rowLabel: "Facultad",
    columnLabel: "Años",
    rows: ["Ingeniería", "Salud"],
    columns: ["2020", "2021"],
    values: [[120, 150.5], [90, null]],
    unit: "estudiantes",
    format: "entero",
    source: "",
    emptyMeaning: "Sin reporte",
  };

  it("escribe la matriz que se ve, sin fila ni columna de total", () => {
    expect(heatmapToTable(heatmap)).toEqual({
      header: ["Facultad", "2020", "2021"],
      rows: [["Ingeniería", 120, 150.5], ["Salud", 90, null]],
    });
  });
});

describe("tabla", () => {
  const table: TableData = {
    id: "t",
    title: "Convenios",
    description: "",
    display: "tabla",
    columns: [
      { key: "pais", label: "País", format: "texto" },
      { key: "n", label: "Cifra", format: "entero" },
      { key: "pct", label: "Cifra", format: "porcentaje" },
      { key: "url", label: "Enlace", format: "enlace" },
    ],
    rows: [
      { pais: "=Perú", n: 3, pct: "1.234,5", url: "https://udes.edu.co" },
      { pais: "Chile", n: null, pct: "n. d." },
    ],
    source: "",
  };

  it("conserva las columnas en su orden y numera los rótulos repetidos", () => {
    expect(tableToTable(table)).toEqual({
      header: ["País", "Cifra", "Cifra (2)", "Enlace"],
      rows: [
        ["=Perú", 3, 1234.5, "https://udes.edu.co"],
        ["Chile", null, "n. d.", null],
      ],
    });
  });

  it("desactiva las fórmulas del texto capturado", () => {
    expect(toCsvText(tableToTable(table))).toContain("\n'=Perú;3;1234,5;");
  });
});

/* --- Rankings y medallero --------------------------------------------------------------- */

const edition = (over: Partial<RankingEdition>): RankingEdition => ({
  year: 2025,
  global_rank: "",
  regional_rank: "",
  national_rank: "",
  evaluated: null,
  score: null,
  stars: [],
  sdgs: [],
  subjects: [],
  custom: [],
  note: "",
  ...over,
});

const ranking = (editions: RankingEdition[]): RankingData => ({
  id: "qs",
  title: "QS Mundial",
  description: "",
  system: "qs_world",
  accent: "#000",
  view: "tabla",
  source: "QS",
  editions,
});

describe("rankings", () => {
  it("pone por edición su fila general y debajo estrellas, ODS, materias y datos", () => {
    const table = rankingToTable(
      ranking([
        edition({
          global_rank: "1001+",
          regional_rank: "801-1000",
          national_rank: "=145",
          evaluated: 1500,
          score: 23.4,
          stars: [{ category: "Teaching", stars: 4 }],
          sdgs: [{ sdg: 4, global_rank: "301-400", national_rank: "12", score: 61.2 }],
          subjects: [{ subject: "Medicina", global_rank: "601+", national_rank: "" }],
          custom: [{ label: "Edición", value: "=2025" }],
          note: "Primera participación",
        }),
      ]),
    );
    expect(table.header).toEqual([
      "Ranking", "Sistema", "Año", "Sección", "Ítem",
      "Puesto mundial", "Puesto regional", "Puesto nacional", "Instituciones evaluadas", "Puntaje", "Estrellas", "Valor", "Nota",
    ]);
    const system = "QS World University Rankings";
    expect(table.rows).toEqual([
      ["QS Mundial", system, 2025, "General", null, "1001+", "801–1000", "=145", 1500, 23.4, null, null, "Primera participación"],
      ["QS Mundial", system, 2025, "Estrellas", "Teaching", null, null, null, null, null, 4, null, null],
      ["QS Mundial", system, 2025, "ODS", "ODS 4 · Educación de calidad", "301–400", null, "12", null, 61.2, null, null, null],
      ["QS Mundial", system, 2025, "Materia", "Medicina", "601+", null, null, null, null, null, null, null],
      ["QS Mundial", system, 2025, "Dato", "Edición", null, null, null, null, null, null, "=2025", null],
    ]);
  });

  it("escribe los puestos como texto y desactiva el empate «=145»", () => {
    const text = toCsvText(rankingToTable(ranking([edition({ global_rank: "1001+", regional_rank: "801–1000", national_rank: "=145" })])));
    expect(text).toContain(";1001+;801–1000;'=145;");
  });

  it("deja como se capturó una posición que no reconoce y vacía la que falta", () => {
    const table = rankingToTable(ranking([edition({ global_rank: " Top 50 ", national_rank: "" })]));
    expect(table.rows[0].slice(5, 8)).toEqual(["Top 50", null, null]);
  });

  it("junta varios rankings en un solo archivo", () => {
    const table = rankingToTable([ranking([edition({ year: 2024 })]), { ...ranking([edition({})]), title: "THE", system: "the_latam" }]);
    expect(table.rows.map((row) => row.slice(0, 3))).toEqual([
      ["QS Mundial", "QS World University Rankings", 2024],
      ["THE", "THE Latin America University Rankings", 2025],
    ]);
  });
});

describe("medallero", () => {
  const board: MedalBoard = {
    id: "m",
    uuid: "u",
    title: "Juegos",
    description: "",
    rowLabel: "Deporte",
    reporting: "periodo",
    scope: "acumulado",
    fixedYear: null,
    sort: "medallero",
    tiers: [
      { key: "plata", label: "Plata", position: 2 },
      { key: "oro", label: "Oro", position: 1 },
    ],
    note: "",
    source: "Bienestar",
    officeId: null,
    entries: [
      { year: 2025, term: "B", label: "Natación", counts: { oro: 2, plata: 1 }, note: "", position: 1 },
      { year: 2025, term: "A", label: "Ajedrez", counts: { oro: 0 }, note: "Sede Cúcuta", position: 2 },
      { year: 2024, term: null, label: "Natación", counts: { plata: null }, note: "", position: 1 },
    ],
  };

  it("pone una fila por corte capturado y un nivel por columna, sin total ni puesto", () => {
    expect(medalBoardToTable(board)).toEqual({
      header: ["Año", "Periodo", "Deporte", "Oro", "Plata", "Nota"],
      rows: [
        [2024, null, "Natación", null, null, null],
        [2025, "1", "Ajedrez", 0, null, "Sede Cúcuta"],
        [2025, "2", "Natación", 2, 1, null],
      ],
    });
  });

  it("no suma las medallas", () => {
    const table = medalBoardToTable(board);
    expect(table.header.some((label) => /total|puesto/i.test(label))).toBe(false);
    expect(cellsOf(table)).not.toContain("3");
  });
});

/* --- Saber PRO y Saber TyT -------------------------------------------------------------- */

const saberResult = (over: Partial<SaberResult>): SaberResult => ({
  year: 2024,
  scope: "programa",
  campus: "Bucaramanga",
  faculty: "Salud",
  program: "Enfermería",
  competency: "lc",
  evaluated: 40,
  mean: 150.5,
  levels: {},
  histogram: {},
  ...over,
});

describe("Saber PRO", () => {
  const data: SaberProData = {
    id: "s",
    title: "Saber PRO",
    description: "",
    note: "",
    source: "ICFES",
    results: [
      saberResult({ evaluated: 8, mean: 141, levels: { "1": 2, "3": 6 }, histogram: { "140": 8 } }),
      saberResult({ competency: "ing", evaluated: 35, mean: 160, levels: { "-A1": 5, B1: 30 }, histogram: { "160": 35 } }),
      saberResult({ competency: "global", evaluated: 9, mean: 139, histogram: { "130": 9 } }),
      saberResult({ competency: "global", evaluated: 12, mean: 148 }),
      saberResult({ scope: "nacional", campus: "", faculty: "", program: "", competency: "global", evaluated: null, mean: 147 }),
    ],
  };
  const table = saberProToTable(data);

  it("pone promedio, evaluados y un nivel por columna", () => {
    expect(table.header).toEqual([
      "Año", "Ámbito", "Sede", "Facultad", "Programa", "Competencia", "Evaluados", "Promedio",
      "Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4", "Pre A1", "A1", "A2", "B1", "B2",
      "Pocos evaluados",
    ]);
    const tail = ["Bucaramanga", "Salud", "Enfermería"];
    expect(table.rows).toEqual([
      [2024, "Nacional", null, null, null, "Puntaje global", null, 147, null, null, null, null, null, null, null, null, null, null],
      [2024, "Programa", ...tail, "Puntaje global", 9, 139, null, null, null, null, null, null, null, null, null, "sí"],
      [2024, "Programa", ...tail, "Puntaje global", 12, 148, null, null, null, null, null, null, null, null, null, null],
      [2024, "Programa", ...tail, "Lectura crítica", 8, 141, 2, null, 6, null, null, null, null, null, null, "sí"],
      [2024, "Programa", ...tail, "Inglés", 35, 160, null, null, null, null, 5, null, null, 30, null, null],
    ]);
  });

  it("advierte los repartos por nivel con menos de 30 evaluados", () => {
    const leveled = saberProToTable({ ...data, results: [saberResult({ evaluated: 29, levels: { "2": 29 } }), saberResult({ year: 2025, evaluated: 30, levels: { "2": 30 } })] });
    expect(column(leveled, "Pocos evaluados")).toEqual(["sí", null]);
  });

  it("no exporta el histograma de puntajes", () => {
    expect(table.header.some((label) => /histograma|tramo/i.test(label))).toBe(false);
    // Los tramos del fixture son 130, 140 y 160: ninguno aparece como celda.
    expect(cellsOf(table)).not.toContain("130");
    expect(cellsOf(table)).not.toContain("140");
  });
});

const tytResult = (over: Partial<TytResult>): TytResult => ({
  year: 2024,
  level: "tecnologico",
  program: "Tecnología en Sistemas",
  competency: "lc",
  evaluated: 20,
  meanExit: 55.5,
  paired: 18,
  meanEntry: 48,
  meanDelta: 7.5,
  improved: 11,
  rawEntry: 52,
  rawExit: 101,
  transitions: {},
  histogram: {},
  scatter: {},
  alphaN: null,
  alphaExpected: null,
  alphaActual: null,
  alphaVa: null,
  alphaPositive: null,
  plane: {},
  quadrants: {},
  quadPlane: {},
  ...over,
});

describe("Saber TyT", () => {
  const data: SaberTytData = {
    id: "t",
    title: "Saber TyT",
    description: "",
    note: "",
    source: "ICFES",
    benchmarks: { lc: { entrada: [30, 35.5], salida: [80] } },
    alpha: {
      nacional: { saber11: { lc: 58, global: 285 }, tyt: { lc: 97 } },
      modelos: { lc: { ampliado: { coef: { intercepto: 12.345, m: 0.5, lc: 0.25 }, r2: 0.41, n: 300, rmse: 9.87 } } },
    },
    results: [
      tytResult({
        transitions: { "1": { "2": 4 }, "4": { "4": 3 } },
        histogram: { "-5": 711 },
        scatter: { "30|55": 722 },
        plane: { "90|95": 733 },
        quadPlane: { "50|100": 744 },
        alphaN: 15,
        alphaExpected: 99.1,
        alphaActual: 101,
        alphaVa: 1.9,
        alphaPositive: 9,
        quadrants: { "1": 6, "3": 9 },
      }),
      tytResult({ year: 2025, competency: "ce", evaluated: 6, paired: 0, meanEntry: null, meanDelta: null, improved: 0, rawEntry: null }),
      tytResult({ year: 2025, program: "", competency: "global", evaluated: 60, paired: 50 }),
    ],
  };

  it("exporta los escalares, el tránsito y los cuadrantes de cada fila", () => {
    const table = saberTytResultsToTable(data);
    expect(table.header).toHaveLength(12 + 16 + 5 + 4 + 1);
    expect(table.header.slice(0, 5)).toEqual(["Año", "Nivel", "Programa", "Competencia", "Evaluados"]);
    expect(table.header[table.header.length - 1]).toBe("Pocos evaluados");
    const first = table.rows[0];
    expect(first.slice(0, 12)).toEqual([2024, "Tecnológico", "Tecnología en Sistemas", "Lectura crítica", 20, 55.5, 18, 48, 7.5, 11, 52, 101]);
    expect(first[table.header.indexOf("Tránsito del cuarto 1 al 2")]).toBe(4);
    expect(first[table.header.indexOf("Tránsito del cuarto 4 al 4")]).toBe(3);
    expect(first[table.header.indexOf("Tránsito del cuarto 1 al 1")]).toBeNull();
    expect(first.slice(28, 33)).toEqual([15, 99.1, 101, 1.9, 9]);
    expect(first.slice(33)).toEqual([6, null, 9, null, null]);
  });

  it("advierte con menos de 10 evaluados y nombra la fila de todo el nivel", () => {
    const table = saberTytResultsToTable(data);
    expect(table.rows.map((row) => [row[0], row[2], row[3], row[row.length - 1]])).toEqual([
      [2024, "Tecnología en Sistemas", "Lectura crítica", null],
      [2025, "Todo el nivel", "Puntaje global", null],
      [2025, "Tecnología en Sistemas", "Comunicación escrita", "sí"],
    ]);
  });

  it("no exporta las nubes ni el histograma", () => {
    const cells = cellsOf(saberTytResultsToTable(data));
    for (const hidden of ["711", "722", "733", "744", "30|55", "90|95", "50|100"]) expect(cells).not.toContain(hidden);
  });

  it("exporta las curvas de referencia, un percentil por fila", () => {
    expect(saberTytCurvesToTable(data)).toEqual({
      header: ["Competencia", "Prueba", "Percentil", "Puntaje"],
      rows: [
        ["Lectura crítica", "Entrada (Saber 11)", 0, 30],
        ["Lectura crítica", "Entrada (Saber 11)", 5, 35.5],
        ["Lectura crítica", "Salida (Saber TyT)", 0, 80],
      ],
    });
  });

  it("exporta los modelos Alpha con sus coeficientes y los promedios del país", () => {
    const table = saberTytModelsToTable(data);
    expect(table.header).toEqual([
      "Competencia", "Ajuste", "Intercepto",
      "Coeficiente · Matemáticas", "Coeficiente · Lectura crítica", "Coeficiente · Ciencias naturales",
      "Coeficiente · Sociales y ciudadanas", "Coeficiente · Inglés",
      "R²", "Casos", "Error típico", "Promedio nacional Saber 11", "Promedio nacional Saber TyT",
    ]);
    expect(table.rows).toEqual([
      ["Lectura crítica", "Sin ciencias naturales · más estudiantes", 12.345, 0.5, 0.25, null, null, null, 0.41, 300, 9.87, 58, 97],
    ]);
  });
});

/* --- Conjuntos libres --------------------------------------------------------------------- */

describe("conjunto libre", () => {
  const columns: FreeTable["columns"] = [
    { key: "sede", label: "Sede", kind: "texto" },
    { key: "n", label: "Docentes", kind: "cifra", format: "entero" },
    { key: "pct", label: "Docentes", kind: "cifra", format: "porcentaje" },
  ];
  const dato = (year: number | null, sede: string, n: string | number | null, pct: number | null) =>
    ({ year, kind: "dato", label: "", cells: { sede, n, pct } }) as const;

  it("escribe sus columnas en orden y convierte las cifras capturadas como texto", () => {
    const table = freeSetToTable({ temporality: "sin_tiempo", columns, rows: [dato(null, "Cúcuta", "1.234,5", 12.5), dato(null, "=Bogotá", null, null)] });
    expect(table).toEqual({
      header: ["Sede", "Docentes", "Docentes (2)"],
      rows: [["Cúcuta", 1234.5, 12.5], ["=Bogotá", null, null]],
    });
    expect(toCsvText(table)).toContain("\n'=Bogotá;;");
  });

  it("añade el año cuando la fuente es anual", () => {
    const table = freeSetToTable({ temporality: "anual", columns, rows: [dato(2024, "Cúcuta", 10, 50), dato(2025, "Cúcuta", 12, 60)] });
    expect(table.header).toEqual(["Año", "Sede", "Docentes", "Docentes (2)"]);
    expect(table.rows).toEqual([[2024, "Cúcuta", 10, 50], [2025, "Cúcuta", 12, 60]]);
  });

  it("marca títulos y totales, con el total que imprime la ficha (suma en enteros, promedio en tasas)", () => {
    const table = freeSetToTable({
      temporality: "sin_tiempo",
      columns,
      rows: [
        { year: null, kind: "grupo", label: "Oriente", cells: {} },
        dato(null, "Cúcuta", 10, 50),
        dato(null, "Bucaramanga", 30, 70),
        { year: null, kind: "total", label: "Total Oriente", cells: {} },
      ],
    });
    expect(table).toEqual({
      header: ["Tipo de fila", "Rótulo", "Sede", "Docentes", "Docentes (2)"],
      rows: [
        ["Grupo", "Oriente", null, null, null],
        ["Dato", null, "Cúcuta", 10, 50],
        ["Dato", null, "Bucaramanga", 30, 70],
        ["Total", "Total Oriente", null, 40, 60],
      ],
    });
  });

  it("calcula el total de una fuente anual solo con las filas de su año", () => {
    const table = freeSetToTable({
      temporality: "anual",
      columns,
      rows: [
        dato(2024, "Cúcuta", 10, null),
        { year: 2024, kind: "total", label: "Total", cells: {} },
        dato(2025, "Cúcuta", 12, null),
        { year: 2025, kind: "total", label: "Total", cells: {} },
      ],
    });
    expect(column(table, "Docentes")).toEqual([10, 10, 12, 12]);
  });

  it("escribe la reserva que viene como texto en una columna de cifra, no una celda vacía", () => {
    const table = freeSetToTable({
      temporality: "sin_tiempo",
      columns,
      rows: [dato(null, "Cúcuta", "< 5", 12.5), dato(null, "Bogotá", " < 5 ", null), dato(null, "Valledupar", "", null), dato(null, "Bucaramanga", "1.234,5", null)],
    });
    expect(column(table, "Docentes")).toEqual(["< 5", "< 5", null, 1234.5]);
    expect(toCsvText(table)).toContain("\nCúcuta;< 5;12,5\nBogotá;< 5;\nValledupar;;\nBucaramanga;1234,5;");
  });

  it("un total nunca expone una celda reservada: lo que no es número no entra en la suma, y el texto de la fila no sale", () => {
    const table = freeSetToTable({
      temporality: "sin_tiempo",
      columns,
      rows: [
        dato(null, "Cúcuta", "< 5", null),
        dato(null, "Bucaramanga", 30, null),
        { year: null, kind: "total", label: "Total", cells: { sede: "oculto", n: 33, pct: "< 5" } },
      ],
    });
    // El total es el de las celdas publicadas: restarle las demás da cero, no la reservada.
    expect(column(table, "Docentes")).toEqual(["< 5", 30, 30]);
    expect(column(table, "Docentes (2)")).toEqual([null, null, null]);
    expect(column(table, "Sede")).toEqual(["Cúcuta", "Bucaramanga", null]);
    expect(toCsvText(table)).not.toContain("oculto");
    expect(cellsOf(table)).not.toContain("33");
    // Con todo el grupo en reserva no hay total que escribir.
    const todo = freeSetToTable({
      temporality: "sin_tiempo",
      columns,
      rows: [dato(null, "Cúcuta", "< 5", null), dato(null, "Bucaramanga", "< 5", null), { year: null, kind: "total", label: "Total", cells: {} }],
    });
    expect(column(todo, "Docentes")).toEqual(["< 5", "< 5", null]);
  });
});

/* --- Modelo ------------------------------------------------------------------------------- */

describe("modelo", () => {
  const model: ModelData = {
    id: "m",
    title: "Deserción",
    description: "",
    note: "",
    source: "Planeación",
    spec: {
      kind: "logistica",
      question: "¿Quién deserta?",
      response: { label: "Estado", positive: "Desertor", negative: "Activo" },
      method: "Por pasos",
      sample: { n: 500, cohorts: "2014-A a 2019-B", population: "Pregrado", source: "SPADIES" },
      fit: { m2ll: 410.2, coxSnell: 0.21, nagelkerke: 0.3, hosmerLemeshowSig: 0.44, cutoff: 0.5, significance: 0.05 },
      classification: { negative: { negative: 300, positive: 40 }, positive: { negative: 60, positive: 100 } },
      intercept: { b: -1.2, se: 0.3, wald: 16, sig: 0.001, or: 0.301 },
      variables: [
        {
          key: "sexo",
          label: "Sexo",
          reference: "Mujer",
          overall: { wald: 5.1, df: 1, sig: 0.02 },
          levels: [{ label: "Hombre", term: { b: 0.4, se: 0.18, wald: 5.1, df: 1, sig: 0.02, or: 1.49, lo: 1.05, hi: 2.12 } }],
        },
      ],
      composition: [{ label: "Sexo", items: [["Mujer", 280], ["Hombre", 220]] }],
    },
  };

  it("pone cada parte del modelo en su sección, en un solo archivo", () => {
    const table = modelToTable(model);
    expect(table.header).toEqual([
      "Sección", "Variable", "Categoría", "Referencia",
      "B", "Error estándar", "Wald", "gl", "Sig.", "Exp(B)", "IC 95 % inferior", "IC 95 % superior", "Valor",
    ]);
    expect(table.rows.every((row) => row.length === table.header.length)).toBe(true);
    expect(table.rows.slice(0, 3)).toEqual([
      ["Coeficiente", "Sexo", "Hombre", "Mujer", 0.4, 0.18, 5.1, 1, 0.02, 1.49, 1.05, 2.12, null],
      ["Coeficiente", "Constante", null, null, -1.2, 0.3, 16, null, 0.001, 0.301, null, null, null],
      ["Prueba conjunta", "Sexo", null, "Mujer", null, null, 5.1, 1, 0.02, null, null, null, null],
    ]);
    expect(Array.from(new Set(column(table, "Sección")))).toEqual(["Coeficiente", "Prueba conjunta", "Ajuste", "Clasificación", "Muestra", "Ficha"]);
  });

  it("escribe la clasificación, la muestra y la ficha como dato y valor", () => {
    const facts = modelToTable(model).rows.map((row) => [row[0], row[1], row[2], row[12]]);
    expect(facts).toContainEqual(["Ajuste", "R² de Nagelkerke", null, 0.3]);
    expect(facts).toContainEqual(["Clasificación", "Observado: Desertor", "Pronosticado: Activo", 60]);
    expect(facts).toContainEqual(["Muestra", "Sexo", "Hombre", 220]);
    expect(facts).toContainEqual(["Ficha", "Cohortes", null, "2014-1 a 2019-2"]);
  });

  it("no pone apóstrofo a un coeficiente negativo", () => {
    expect(toCsvText(modelToTable(model))).toContain("Constante;;;-1,2;0,3;16;");
  });
});
