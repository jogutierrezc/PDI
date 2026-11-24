import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../admin/udes-en-cifras/sheet";
import { customTableToTable, toCsvText } from "./csv-export";
import {
  cellTone,
  cellToneKey,
  cellView,
  customKind,
  customTableProblems,
  customViewOf,
  EMPTY_TEXT,
  formatNumber,
  guessColumn,
  legendOf,
  legendText,
  matchRule,
  MAX_COLUMNS,
  parseLocalNumber,
  parsePaste,
  planPaste,
  readCell,
  ROW_TONE_KEY,
  ruleProblems,
  ruleText,
  TONE_ORDER,
  TONES,
} from "./custom-table";
import type { CustomTable, ToneRule } from "./custom-table";
import { viewProblems } from "./free-sets";
import type { FreeColumn, FreeRow, FreeSet, FreeView } from "./free-sets";

const programa: FreeColumn = { key: "programa", label: "Programa", kind: "texto" };
const avance: FreeColumn = { key: "avance", label: "Avance", kind: "cifra", format: "porcentaje", decimals: 1, unit: "%" };
const matricula: FreeColumn = { key: "matricula", label: "Matriculados", kind: "cifra", format: "entero", decimals: 0, unit: "estudiantes" };
const estado: FreeColumn = { key: "estado", label: "Estado", kind: "texto", options: ["Cumple", "En proceso", "No cumple"] };
const columns = [programa, avance, matricula, estado];

const semaforo: ToneRule[] = [
  { op: "menor", value: 60, tone: "riesgo" },
  { op: "entre", min: 60, max: 80, tone: "atencion" },
  { op: "mayor_igual", value: 80, tone: "bien" },
];

const table: CustomTable = {
  cut: "2025-2",
  rowHeader: true,
  rules: {
    avance: semaforo,
    estado: [
      { op: "es", option: "Cumple", tone: "bien" },
      { op: "es", option: "No cumple", tone: "riesgo" },
    ],
  },
};

const row = (cells: FreeRow["cells"], kind: FreeRow["kind"] = "dato", label = ""): FreeRow => ({ year: null, kind, label, cells });

describe("tipo de cada celda y su formato", () => {
  it("distingue texto, número y categoría", () => {
    expect(columns.map(customKind)).toEqual(["texto", "numero", "numero", "categoria"]);
  });

  it("escribe los números a la colombiana, con los decimales de la columna", () => {
    expect(formatNumber(12345.5, 1)).toBe("12.345,5");
    expect(formatNumber(1234, 0)).toBe("1.234");
    expect(formatNumber(85, 2)).toBe("85,00");
    expect(formatNumber(-3.25, 1)).toMatch(/^-3,[23]$/);
  });

  it("una unidad corta acompaña a la cifra; una larga se queda en el encabezado", () => {
    expect(cellView(avance, 85.5)).toMatchObject({ empty: false, numeric: true, value: 85.5, text: "85,5 %" });
    expect(cellView(matricula, 1234)).toMatchObject({ text: "1.234", numeric: true });
  });

  it("un vacío no es un cero", () => {
    expect(cellView(avance, null)).toMatchObject({ empty: true, value: null });
    expect(cellView(avance, "")).toMatchObject({ empty: true });
    expect(cellView(programa, undefined)).toMatchObject({ empty: true, numeric: false });
    expect(cellView(avance, 0)).toMatchObject({ empty: false, value: 0, text: "0,0 %" });
    expect(EMPTY_TEXT).toBe("sin dato");
  });

  it("respeta un texto escrito en una columna de número", () => {
    expect(cellView(avance, "N/A")).toMatchObject({ empty: false, numeric: true, value: null, text: "N/A" });
  });

  it("los textos quedan a la izquierda", () => {
    expect(cellView(programa, " Medicina ")).toMatchObject({ numeric: false, text: "Medicina" });
    expect(cellView(estado, "Cumple")).toMatchObject({ numeric: false, text: "Cumple" });
  });
});

describe("reglas de color", () => {
  it("umbrales: menor que, entre y mayor o igual que", () => {
    const tone = (value: number | null) => matchRule(avance, semaforo, value)?.tone ?? null;
    expect(tone(59.9)).toBe("riesgo");
    expect(tone(60)).toBe("atencion");
    expect(tone(79.99)).toBe("atencion");
    // «Entre» llega hasta menos del tope: 80 ya es de la regla siguiente.
    expect(tone(80)).toBe("bien");
    expect(tone(100)).toBe("bien");
    expect(tone(0)).toBe("riesgo");
  });

  it("una celda sin dato no se colorea", () => {
    expect(matchRule(avance, semaforo, null)).toBeNull();
    expect(matchRule(avance, semaforo, "")).toBeNull();
    expect(cellTone(table, avance, row({ avance: null }))).toBeNull();
  });

  it("gana la primera regla que se cumple", () => {
    const rules: ToneRule[] = [
      { op: "mayor_igual", value: 50, tone: "seq-2" },
      { op: "mayor_igual", value: 90, tone: "seq-3" },
    ];
    expect(matchRule(avance, rules, 95)?.tone).toBe("seq-2");
  });

  it("categorías: cada valor a su tono, sin fijarse en tildes ni mayúsculas", () => {
    expect(cellTone(table, estado, row({ estado: "Cumple" }))).toMatchObject({ tone: "bien", by: "regla", glyph: "✓", label: "Bien" });
    expect(cellTone(table, estado, row({ estado: "no cumple" }))?.tone).toBe("riesgo");
    expect(cellTone(table, estado, row({ estado: "En proceso" }))).toBeNull();
  });

  it("la celda a mano manda sobre la fila, y la fila sobre la regla", () => {
    const base = { avance: 95, estado: "Cumple" };
    expect(cellTone(table, avance, row(base))).toMatchObject({ tone: "bien", by: "regla" });
    expect(cellTone(table, avance, row({ ...base, [ROW_TONE_KEY]: "neutro" }))).toMatchObject({ tone: "neutro", by: "fila" });
    expect(cellTone(table, avance, row({ ...base, [ROW_TONE_KEY]: "neutro", [cellToneKey("avance")]: "riesgo" }))).toMatchObject({ tone: "riesgo", by: "celda" });
  });

  it("«sin color» a mano apaga la regla y el color de la fila", () => {
    expect(cellTone(table, avance, row({ avance: 95, [cellToneKey("avance")]: "ninguno" }))).toBeNull();
    expect(cellTone(table, avance, row({ avance: 95, [ROW_TONE_KEY]: "bien", [cellToneKey("avance")]: "ninguno" }))).toBeNull();
  });

  it("una celda de texto o vacía también se puede colorear a mano", () => {
    expect(cellTone(table, programa, row({ programa: "Medicina", [cellToneKey("programa")]: "atencion" }))?.tone).toBe("atencion");
    expect(cellTone(table, avance, row({ avance: null, [cellToneKey("avance")]: "neutro" }))?.tone).toBe("neutro");
  });

  it("las reglas no califican la fila de totales; el color a mano sí", () => {
    expect(cellTone(table, avance, row({ avance: 95 }, "total"))).toBeNull();
    expect(cellTone(table, avance, row({ avance: 95, [ROW_TONE_KEY]: "neutro" }, "total"))?.tone).toBe("neutro");
  });

  it("un tono desconocido guardado en la fila se ignora", () => {
    expect(cellTone(table, avance, row({ avance: null, [cellToneKey("avance")]: "fucsia" }))).toBeNull();
  });

  it("usa el nombre propio del tono cuando la tabla lo define", () => {
    const named: CustomTable = { ...table, labels: { bien: "Cumple la meta" } };
    expect(cellTone(named, avance, row({ avance: 90 }))?.label).toBe("Cumple la meta");
  });

  it("dice cada regla en palabras", () => {
    expect(semaforo.map((rule) => ruleText(avance, rule))).toEqual(["menos de 60,0 %", "de 60,0 a menos de 80,0 %", "80,0 % o más"]);
    expect(ruleText(matricula, { op: "mayor_igual", value: 1000, tone: "seq-3" })).toBe("1.000 estudiantes o más");
  });

  it("avisa de las reglas imposibles", () => {
    expect(ruleProblems(avance, semaforo)).toEqual([]);
    expect(ruleProblems(avance, [{ op: "entre", min: 80, max: 60, tone: "bien" }])[0]).toMatch(/menor que el segundo/);
    expect(ruleProblems(avance, [{ op: "menor", value: Number.NaN, tone: "bien" }])[0]).toMatch(/escribe el valor/);
    expect(ruleProblems(estado, [{ op: "es", option: "Aprobado", tone: "bien" }])[0]).toMatch(/ya no está en la lista/);
    expect(ruleProblems(programa, [{ op: "menor", value: 1, tone: "bien" }])[0]).toMatch(/la columna no lo es/);
  });
});

describe("leyenda", () => {
  it("sale de las reglas, en el orden de la paleta y con su glifo", () => {
    const legend = legendOf(columns, table, []);
    expect(legend.map((item) => item.tone)).toEqual(["bien", "atencion", "riesgo"]);
    expect(legend[0]).toMatchObject({ glyph: "✓", label: "Bien", detail: ["Avance: 80,0 % o más", "Estado: Cumple"] });
    expect(legend[1].detail).toEqual(["Avance: de 60,0 a menos de 80,0 %"]);
    expect(legend[2].detail).toEqual(["Avance: menos de 60,0 %", "Estado: No cumple"]);
  });

  it("con una sola columna con reglas no repite su nombre", () => {
    const legend = legendOf(columns, { cut: "2025", rules: { avance: semaforo } }, []);
    expect(legend[0].detail).toEqual(["80,0 % o más"]);
  });

  it("lo coloreado a mano entra, y dice que fue a mano", () => {
    const rows = [row({ programa: "Medicina", [ROW_TONE_KEY]: "neutro" }), row({ programa: "Derecho", [cellToneKey("programa")]: "seq-3" })];
    const legend = legendOf(columns, { cut: "2025" }, rows);
    expect(legend).toEqual([
      { tone: "neutro", glyph: "◇", label: "Neutro", detail: ["marcado a mano"] },
      { tone: "seq-3", glyph: "●", label: "Alto", detail: ["marcado a mano"] },
    ]);
  });

  it("no inventa leyenda para columnas que ya no existen ni para «sin color»", () => {
    const rows = [row({ [cellToneKey("borrada")]: "riesgo", [cellToneKey("avance")]: "ninguno" })];
    expect(legendOf(columns, { cut: "2025", rules: { borrada: semaforo } }, rows)).toEqual([]);
  });

  it("sin reglas ni color no hay leyenda", () => {
    expect(legendOf(columns, { cut: "2025" }, [row({ programa: "Medicina" })])).toEqual([]);
  });

  it("se escribe en una línea para el papel", () => {
    expect(legendText(legendOf(columns, { cut: "2025", rules: { avance: semaforo.slice(2) }, labels: { bien: "Meta cumplida" } }, []))).toBe("✓ Meta cumplida (80,0 % o más)");
  });

  it("cada tono tiene un glifo distinto: el color nunca va solo", () => {
    const glyphs = TONE_ORDER.map((tone) => TONES[tone].glyph);
    expect(new Set(glyphs).size).toBe(TONE_ORDER.length);
    expect(glyphs.every((glyph) => glyph.trim().length > 0)).toBe(true);
  });
});

describe("pegar desde Excel", () => {
  it("lee los números a la colombiana", () => {
    const value = (text: string) => {
      const parsed = parseLocalNumber(text);
      return parsed.ok ? parsed.value : "error";
    };
    expect(value("1.234,5")).toBe(1234.5);
    expect(value("12.345")).toBe(12345);
    expect(value("1.234.567,89")).toBe(1234567.89);
    expect(value("0,75")).toBe(0.75);
    expect(value("85,5 %")).toBe(85.5);
    expect(value("45%")).toBe(45);
    expect(value("-3,2")).toBe(-3.2);
    expect(value("(1.200)")).toBe(-1200);
    expect(value("$ 2.500")).toBe(2500);
    expect(value("1234.5")).toBe(1234.5);
    expect(value("1,234,567.8")).toBe(1234567.8);
    expect(value("1 234")).toBe(1234);
  });

  it("vacío y raya son «sin dato», no cero; un texto es un error", () => {
    expect(parseLocalNumber("")).toEqual({ ok: true, value: null });
    expect(parseLocalNumber("—")).toEqual({ ok: true, value: null });
    expect(parseLocalNumber("-")).toEqual({ ok: true, value: null });
    expect(parseLocalNumber("0")).toEqual({ ok: true, value: 0 });
    expect(parseLocalNumber("N/A")).toEqual({ ok: false });
    expect(parseLocalNumber("1.2.3,4,5")).toEqual({ ok: false });
  });

  it("separa por tabuladores y saltos de línea, conservando las celdas vacías", () => {
    expect(parsePaste("Programa\tAvance\tEstado\r\nMedicina\t85,5\tCumple\r\nDerecho\t\tEn proceso\r\n")).toEqual([
      ["Programa", "Avance", "Estado"],
      ["Medicina", "85,5", "Cumple"],
      ["Derecho", "", "En proceso"],
    ]);
  });

  it("iguala el ancho de las filas y conserva una fila vacía en medio", () => {
    expect(parsePaste("a\tb\tc\n\nd")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
      ["d", "", ""],
    ]);
  });

  it("una celda de Excel con salto de línea llega entre comillas y no parte la fila", () => {
    expect(parsePaste('Medicina\t"Registro calificado\nrenovado ""2025"""\t90\n')).toEqual([["Medicina", 'Registro calificado\nrenovado "2025"', "90"]]);
  });

  it("lee cada celda con el tipo de su columna", () => {
    expect(readCell(avance, "85,5 %")).toEqual({ value: 85.5 });
    expect(readCell(avance, "")).toEqual({ value: null });
    expect(readCell(avance, "alto").error).toMatch(/no es un número/);
    expect(readCell(estado, "cumple")).toEqual({ value: "Cumple" });
    expect(readCell(estado, "Aprobado").error).toMatch(/no está en la lista/);
    expect(readCell(programa, " Medicina ")).toEqual({ value: "Medicina" });
  });

  it("adivina el tipo de una columna nueva", () => {
    expect(guessColumn(["Medicina", "Derecho"])).toEqual({ kind: "texto" });
    expect(guessColumn(["1.234", "", "2.500"])).toEqual({ kind: "cifra", format: "entero", decimals: 0 });
    expect(guessColumn(["85,5 %", "70 %"])).toEqual({ kind: "cifra", format: "porcentaje", decimals: 1, unit: "%" });
    expect(guessColumn(["3,25", "4"])).toEqual({ kind: "cifra", format: "decimal", decimals: 2 });
    expect(guessColumn(["12", "N/A"])).toEqual({ kind: "texto" });
    expect(guessColumn(["", ""])).toEqual({ kind: "texto" });
  });

  it("la vista previa dice cómo se lee cada celda y qué hace falta crear", () => {
    const grid = parsePaste("Medicina\t85,5\t1.234\tCumple\tAcreditado\nDerecho\tpendiente\t\tAprobado\tEn trámite\n");
    const plan = planPaste({ columns, grid, atRow: 0, atColumn: 0, rowCount: 1 });
    expect(plan.targets).toEqual([0, 1, 2, 3, 4]);
    expect(plan.newColumns).toEqual([{ kind: "texto" }]);
    expect(plan.newRows).toBe(1);
    expect(plan.rows[0].map((cell) => cell.value)).toEqual(["Medicina", 85.5, 1234, "Cumple", "Acreditado"]);
    // «pendiente» no es un número y «Aprobado» no está en la lista: dos errores, a la vista.
    expect(plan.errors).toBe(2);
    expect(plan.rows[1][1].error).toMatch(/no es un número/);
    expect(plan.rows[1][3].error).toMatch(/no está en la lista/);
    // La celda vacía es «sin dato».
    expect(plan.rows[1][2]).toMatchObject({ raw: "", value: null });
  });

  it("con encabezados, la primera fila no es dato", () => {
    const grid = parsePaste("Sede\tDocentes\nBucaramanga\t320\nCúcuta\t110");
    const plan = planPaste({ columns: [], grid, atRow: 0, atColumn: 0, rowCount: 0, header: true });
    expect(plan.headers).toEqual(["Sede", "Docentes"]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.newColumns).toEqual([{ kind: "texto" }, { kind: "cifra", format: "entero", decimals: 0 }]);
  });

  it("pegar desde una casilla del medio cae desde ahí", () => {
    const plan = planPaste({ columns, grid: [["70", "900"]], atRow: 4, atColumn: 1, rowCount: 5 });
    expect(plan.targets).toEqual([1, 2]);
    expect(plan.newColumns).toEqual([]);
    expect(plan.newRows).toBe(0);
    expect(plan.rows[0].map((cell) => cell.value)).toEqual([70, 900]);
  });

  it("avisa de lo que no cabe en el máximo", () => {
    const wide = [Array.from({ length: MAX_COLUMNS + 3 }, (_, i) => String(i))];
    const plan = planPaste({ columns: [], grid: wide, atRow: 0, atColumn: 0, rowCount: 0 });
    expect(plan.targets).toHaveLength(MAX_COLUMNS);
    expect(plan.droppedColumns).toBe(3);
    expect(plan.rows[0].filter((cell) => cell.dropped)).toHaveLength(3);
  });
});

describe("la tabla como vista de un conjunto libre", () => {
  const view: FreeView = { key: "tabla", title: "Compromisos", type: "tabla", table };
  const set: FreeSet = {
    id: "compromisos", title: "Compromisos", description: "", source: "Planeación", temporality: "sin_tiempo", periodLabel: "",
    columns, views: [view], rows: [row({ programa: "Medicina", avance: 90 })],
  };

  it("se reconoce por `view.table`", () => {
    expect(customViewOf(set)).toBe(view);
    expect(customViewOf({ views: [{ key: "t", title: "Tabla", type: "tabla" }] })).toBeUndefined();
  });

  it("sin corte no se publica", () => {
    expect(viewProblems(set, view)).toEqual([]);
    const noCut: FreeView = { ...view, table: { ...table, cut: "  " } };
    expect(viewProblems(set, noCut)).toHaveLength(1);
    expect(customTableProblems(set, noCut)[0]).toMatch(/corte/);
  });
});

describe("CSV", () => {
  const rows: FreeRow[] = [
    row({}, "grupo", "Ciencias de la Salud"),
    row({ programa: "Medicina", avance: 85.5, matricula: 1234, estado: "Cumple" }),
    row({ programa: "Enfermería", avance: null, matricula: 410, estado: "En proceso", [cellToneKey("matricula")]: "seq-3" }),
    row({ programa: "Derecho", avance: 40, matricula: null, estado: "No cumple", [ROW_TONE_KEY]: "neutro" }),
    row({ programa: "Total", avance: 62.8, matricula: 1644 }, "total", "Total"),
  ];
  const csv = customTableToTable({ columns, rows }, { ...table, labels: { bien: "Meta cumplida" } });

  it("lleva los textos y las cifras; el color viaja como el nombre del tono", () => {
    expect(csv.header).toEqual([
      "Tipo de fila", "Programa", "Avance (%)", "Tono · Avance", "Matriculados (estudiantes)", "Tono · Matriculados", "Estado", "Tono · Estado", "Tono de la fila", "Corte",
    ]);
    expect(csv.rows[1]).toEqual(["Dato", "Medicina", 85.5, "Meta cumplida", 1234, null, "Cumple", "Meta cumplida", null, "2025-2"]);
    expect(csv.rows[2]).toEqual(["Dato", "Enfermería", null, null, 410, "Alto", "En proceso", null, null, "2025-2"]);
    // La fila coloreada a mano manda sobre las reglas de sus columnas.
    expect(csv.rows[3]).toEqual(["Dato", "Derecho", 40, "Neutro", null, "Neutro", "No cumple", "Neutro", "Neutro", "2025-2"]);
  });

  it("el título va en la primera columna y el total es el que se escribió, sin calcular", () => {
    expect(csv.rows[0]).toEqual(["Grupo", "Ciencias de la Salud", null, null, null, null, null, null, null, "2025-2"]);
    expect(csv.rows[4]).toEqual(["Total", "Total", 62.8, null, 1644, null, null, null, null, "2025-2"]);
  });

  it("una celda sin dato sale vacía, no en cero; los números, con coma decimal", () => {
    const text = toCsvText(csv);
    const parsed = parseCsv(text);
    expect(parsed[0][2]).toBe("Avance (%)");
    expect(parsed[2].slice(0, 5)).toEqual(["Dato", "Medicina", "85,5", "Meta cumplida", "1234"]);
    expect(parsed[3][2]).toBe("");
    expect(parsed[4][4]).toBe("");
  });

  it("sin reglas, sin color y sin tipos de fila queda la tabla limpia", () => {
    const plain = customTableToTable({ columns: [programa, matricula], rows: [row({ programa: "Medicina", matricula: 10 })] }, { cut: "" });
    expect(plain).toEqual({ header: ["Programa", "Matriculados (estudiantes)"], rows: [["Medicina", 10]] });
  });
});

/* --- Contraste de la paleta ------------------------------------------------------------
   Los tonos son tokens. Aquí se mide, con los valores reales de tokens.css y en
   los dos temas, que el texto de una celda con tono llega a 4.5:1 y su glifo a
   3:1 sobre el fondo ya compuesto (los tonos suaves del tema oscuro son
   translúcidos). Las parejas son las de custom-table.css. */

type Rgb = [number, number, number, number];

function readTheme(css: string, open: string): Map<string, string> {
  const start = css.indexOf(open);
  if (start < 0) throw new Error(`No está el bloque ${open}`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const tokens = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
  return tokens;
}

function color(value: string): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgb;
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => Number(p.trim()));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  throw new Error(`Color no reconocido: ${value}`);
}

const over = (top: Rgb, bottom: Rgb): Rgb => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1) as Rgb;

const luminance = ([r, g, b]: Rgb) => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("contraste de los tonos", () => {
  const css = readFileSync(resolve(__dirname, "../../../styles/tokens.css"), "utf8");
  const light = readTheme(css, ":root {");
  const dark = new Map([...light, ...readTheme(css, ':root[data-theme="dark"] {')]);

  // Las parejas de custom-table.css: fondo, tinta del texto y color del glifo.
  const PAIRS: Record<string, [string, string, string]> = {
    bien: ["--status-done-soft", "--ink", "--status-done"],
    atencion: ["--status-pending-soft", "--ink", "--status-pending"],
    riesgo: ["--status-risk-soft", "--ink", "--status-risk"],
    neutro: ["--od-board-raised", "--ink", "--ink-secondary"],
    "seq-1": ["--od-seq-1", "--od-seq-ink-light", "--od-seq-ink-light"],
    "seq-2": ["--od-seq-3", "--od-seq-ink-light", "--od-seq-ink-light"],
    "seq-3": ["--od-seq-6", "--od-seq-ink-dark", "--od-seq-ink-dark"],
  };

  for (const [name, theme] of [["claro", light], ["oscuro", dark]] as const) {
    for (const tone of TONE_ORDER) {
      it(`${tone} en tema ${name}: texto ≥ 4.5:1 y glifo ≥ 3:1`, () => {
        const [background, ink, mark] = PAIRS[tone].map((token) => color(theme.get(token)!));
        // La celda pinta el tono sobre la superficie del portal y, en la intranet, sobre la suya.
        for (const surface of ["--od-surface", "--surface"]) {
          const ground = over(background, color(theme.get(surface)!));
          expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(mark, ground)).toBeGreaterThanOrEqual(3);
        }
      });
    }

    it(`«sin dato» se lee en tema ${name}`, () => {
      expect(contrast(color(theme.get("--ink-secondary")!), color(theme.get("--od-surface")!))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
