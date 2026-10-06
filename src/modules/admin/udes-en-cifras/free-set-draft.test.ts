import { describe, expect, it } from "vitest";
import { parsePaste } from "../../datos-abiertos/data/custom-table";
import type { FreeColumn, FreeView } from "../../datos-abiertos/data/free-sets";
import {
  applyFreePaste,
  blankFreeDraft,
  buildFreeOutput,
  emptyFreeColumn,
  emptyFreeRow,
  fillYears,
  freeDraftOf,
  guessFreeColumn,
  looksLikeFreeHeader,
  misfitsOf,
  moveFreeColumn,
  planFreePaste,
  readFreeCell,
  removeFreeColumn,
  rowsText,
  rowsWithoutYear,
  totalPreview,
  viewImpacts,
  viewsUsing,
} from "./free-set-draft";
import type { StoredFreeRow } from "./free-set-draft";

const columns: FreeColumn[] = [
  { key: "sede", label: "Sede", kind: "texto" },
  { key: "docentes", label: "Docentes", kind: "cifra", format: "entero", unit: "docentes" },
  { key: "satisfaccion", label: "Satisfacción", kind: "cifra", format: "porcentaje" },
];

const stored: StoredFreeRow[] = [
  { year: 2024, kind: "grupo", label: "Oriente", cells: {} },
  { year: 2024, kind: "dato", label: "", cells: { sede: "Cúcuta", docentes: 10, satisfaccion: 50 } },
  { year: 2024, kind: "dato", label: "", cells: { sede: "Bucaramanga", docentes: 30, satisfaccion: 70 } },
  // Un total guardado antes de la regla nueva: sin casillas, lo calcula el portal.
  { year: 2024, kind: "total", label: "Total Oriente", cells: {} },
];

const set = { title: "Docentes por sede", description: "Planta", office_id: "of-1", temporality: "anual" as const, period_label: "", columns };
const draft = () => freeDraftOf(set, stored);

describe("borrador de un conjunto libre", () => {
  it("lo guardado vuelve igual después de pasar por el borrador, sin migrar los totales viejos", () => {
    const out = buildFreeOutput(draft());
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.columns).toEqual(columns);
    expect(out.rows).toEqual(stored);
  });

  it("renombrar una columna no cambia su clave; una columna nueva recibe la suya, sin repetir", () => {
    const d = draft();
    d.columns[1] = { ...d.columns[1], label: "Profesores de planta" };
    d.columns.push(emptyFreeColumn("cifra", "Sede"));
    const out = buildFreeOutput(d);
    expect(out.columns.map((c) => [c.key, c.label])).toEqual([
      ["sede", "Sede"],
      ["docentes", "Profesores de planta"],
      ["satisfaccion", "Satisfacción"],
      ["sede-2", "Sede"],
    ]);
    // Las casillas siguen colgadas de la clave de siempre.
    expect(out.rows[1].cells.docentes).toBe(10);
  });

  it("quitar una columna limpia sus casillas del borrador y de lo que se guarda", () => {
    const d = draft();
    const gone = d.columns[1].id;
    const next = removeFreeColumn(d, gone);
    expect(next.columns.map((c) => c.key)).toEqual(["sede", "satisfaccion"]);
    expect(next.rows.every((row) => !(gone in row.cells))).toBe(true);
    expect(buildFreeOutput(next).rows[1].cells).toEqual({ sede: "Cúcuta", satisfaccion: 50 });
  });

  it("reordenar columnas no toca las casillas", () => {
    const d = draft();
    const next = moveFreeColumn(d, d.columns[2].id, -1);
    expect(next.columns.map((c) => c.key)).toEqual(["sede", "satisfaccion", "docentes"]);
    expect(buildFreeOutput(next).rows[1].cells).toEqual({ sede: "Cúcuta", satisfaccion: 50, docentes: 10 });
    expect(moveFreeColumn(d, d.columns[0].id, -1)).toBe(d);
  });

  it("solo impide guardar lo que no tiene dónde guardarse", () => {
    const d = blankFreeDraft("pegar");
    expect(buildFreeOutput(d).errors).toEqual(["Ponle un título al conjunto.", "El conjunto necesita al menos una columna: pega una tabla de Excel o añade una."]);
    const named = { ...blankFreeDraft("blanco"), meta: { ...d.meta, title: "Convenios" } };
    expect(buildFreeOutput(named).errors).toEqual([]);
    named.columns[0] = { ...named.columns[0], label: " " };
    expect(buildFreeOutput(named).errors).toEqual(["La columna 1 necesita un nombre."]);
  });

  it("una fila de datos en blanco no se guarda", () => {
    const d = draft();
    d.rows.push(emptyFreeRow());
    expect(buildFreeOutput(d).rows).toHaveLength(4);
  });
});

describe("lectura permisiva de casillas", () => {
  const cifra = { kind: "cifra" as const };
  it("lo que encaja se guarda limpio", () => {
    expect(readFreeCell(cifra, " 1.234,5 ")).toEqual({ value: 1234.5 });
    expect(readFreeCell(cifra, "-3,2")).toEqual({ value: -3.2 });
    expect(readFreeCell(cifra, "45 %")).toEqual({ value: 45 });
    expect(readFreeCell(cifra, "")).toEqual({ value: null });
    expect(readFreeCell({ kind: "fecha" }, "01/03/2025")).toEqual({ value: "2025-03-01" });
    expect(readFreeCell({ kind: "fecha" }, "2025")).toEqual({ value: "2025" });
    expect(readFreeCell({ kind: "territorio", territory: "departamento" }, "Santander")).toEqual({ value: "Santander" });
  });

  it("lo que no encaja se guarda tal cual, con aviso: nunca se rechaza", () => {
    const text = readFreeCell(cifra, "N/D");
    expect(text.value).toBe("N/D");
    expect(text.warning).toContain("no es un número");
    const date = readFreeCell({ kind: "fecha" }, "31/02/2025");
    expect(date.value).toBe("31/02/2025");
    expect(date.warning).toContain("no es una fecha");
    const place = readFreeCell({ kind: "territorio", territory: "pais" }, "Narnia");
    expect(place.value).toBe("Narnia");
    expect(place.warning).toContain("no es un país conocido");
  });

  it("un texto en una columna de cifra se guarda y se avisa en una sola frase, con sus filas", () => {
    const d = draft();
    d.rows[1].cells[d.columns[1].id] = "en trámite";
    d.rows[2].cells[d.columns[1].id] = "< 5";
    const out = buildFreeOutput(d);
    expect(out.errors).toEqual([]);
    expect(out.rows[1].cells.docentes).toBe("en trámite");
    expect(out.rows[2].cells.docentes).toBe("< 5");
    expect(out.warnings).toEqual(["«Docentes»: 2 casillas (filas 2 y 3) no son números: se guardan como texto y las gráficas no las cuentan."]);
    expect(out.cellWarnings.has(`${d.rows[1].id}|${d.columns[1].id}`)).toBe(true);
  });

  it("dice las filas sin alargarse", () => {
    expect(rowsText([4])).toBe("fila 4");
    expect(rowsText([1, 2, 3])).toBe("filas 1, 2 y 3");
    expect(rowsText([1, 2, 3, 4, 5], 3)).toBe("filas 1, 2, 3… y 2 más");
  });
});

describe("cambiar el tipo de una columna con datos", () => {
  it("cuenta las casillas que no encajarían y dice en qué filas, antes de cambiar", () => {
    const d = draft();
    const sede = d.columns[0].id;
    expect(misfitsOf(d, sede)).toEqual([]);
    expect(misfitsOf(d, sede, { kind: "cifra" })).toEqual([
      { row: 2, text: "Cúcuta" },
      { row: 3, text: "Bucaramanga" },
    ]);
    // Los títulos no tienen casillas y no cuentan.
    expect(misfitsOf(d, d.columns[1].id, { kind: "texto" })).toEqual([]);
  });

  it("deja continuar: el cambio se guarda con las casillas tal cual", () => {
    const d = draft();
    d.columns[0] = { ...d.columns[0], kind: "territorio", territory: "pais" };
    const out = buildFreeOutput(d);
    expect(out.errors).toEqual([]);
    expect(out.columns[0]).toEqual({ key: "sede", label: "Sede", kind: "territorio", territory: "pais" });
    expect(out.rows[1].cells.sede).toBe("Cúcuta");
    expect(out.warnings[0]).toContain("«Sede»: 2 casillas (filas 2 y 3) no se reconocen");
  });

  it("una cifra que pasa a texto y vuelve conserva su formato y su unidad", () => {
    const d = draft();
    d.columns[1] = { ...d.columns[1], kind: "texto" };
    expect(buildFreeOutput(d).columns[1]).toEqual({ key: "docentes", label: "Docentes", kind: "texto" });
    d.columns[1] = { ...d.columns[1], kind: "cifra" };
    expect(buildFreeOutput(d).columns[1]).toEqual(columns[1]);
  });

  it("dice qué gráficas usan la columna y cuáles quedan incompletas", () => {
    const views: FreeView[] = [
      { key: "barras", title: "Docentes por sede", type: "barras", category: "sede", series: ["docentes", "satisfaccion"] },
      { key: "tabla", title: "Tabla", type: "tabla" },
    ];
    expect(viewsUsing(views, "docentes").map((v) => v.key)).toEqual(["barras"]);
    expect(viewImpacts({ temporality: "anual", columns }, views)).toEqual([]);

    // Quitar una de las dos cifras: se sigue dibujando, pero se dice que le falta.
    const sinDocentes = columns.filter((c) => c.key !== "docentes");
    expect(viewImpacts({ temporality: "anual", columns: sinDocentes }, views, { docentes: "Docentes" })).toEqual([
      { view: views[0], problems: ["Ya no está la columna «Docentes»."] },
    ]);
    // La de categorías pasa a cifra: ya no se puede dibujar.
    const sedeCifra = columns.map((c) => (c.key === "sede" ? { ...c, kind: "cifra" as const } : c));
    expect(viewImpacts({ temporality: "anual", columns: sedeCifra }, views)[0].problems).toEqual(["Elige la columna de categorías."]);
  });
});

describe("cambiar el tiempo con datos", () => {
  it("de anual a otro: las filas conservan su año guardado, sin mostrarlo", () => {
    const d = draft();
    d.meta = { ...d.meta, temporality: "sin_tiempo" };
    const out = buildFreeOutput(d);
    expect(out.rows.map((row) => row.year)).toEqual([2024, 2024, 2024, 2024]);
    expect(out.warnings).toEqual([]);
  });

  it("a anual: las filas sin año se guardan con aviso, y no impiden guardar", () => {
    const d = freeDraftOf({ ...set, temporality: "sin_tiempo" }, stored.map((row) => ({ ...row, year: null })));
    d.meta = { ...d.meta, temporality: "anual" };
    expect(rowsWithoutYear(d)).toEqual([1, 2, 3, 4]);
    const out = buildFreeOutput(d);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual(["4 filas no tienen año (filas 1, 2, 3 y 4): se guardan, pero no se ven en el portal al elegir un año."]);

    const filled = fillYears(d, "2025");
    expect(rowsWithoutYear(filled)).toEqual([]);
    expect(buildFreeOutput(filled).rows.map((row) => row.year)).toEqual([2025, 2025, 2025, 2025]);
    // Un año que no lo es no se pone.
    expect(fillYears(d, "25")).toBe(d);
  });

  it("poner el año no toca las filas que ya lo tienen", () => {
    const d = draft();
    d.rows[2] = { ...d.rows[2], year: "" };
    expect(buildFreeOutput(fillYears(d, "2023")).rows.map((row) => row.year)).toEqual([2024, 2024, 2023, 2024]);
  });

  it("un año que no es un año es lo único de una casilla que impide guardar", () => {
    const d = draft();
    d.rows[1] = { ...d.rows[1], year: "veinte" };
    expect(buildFreeOutput(d).errors).toEqual(["Fila 2 · Año: «veinte» no es un año."]);
  });

  it("una gráfica que deja de servir con el tiempo nuevo se nombra", () => {
    const views: FreeView[] = [{ key: "comparadas", title: "Docentes por año", type: "barras_comparadas", series: ["docentes"] }];
    const solo = columns.filter((c) => c.kind === "cifra");
    expect(viewImpacts({ temporality: "anual", columns: solo }, views)).toEqual([]);
    expect(viewImpacts({ temporality: "sin_tiempo", columns: solo }, views)[0].view.key).toBe("comparadas");
  });
});

describe("totales escritos o calculados", () => {
  it("la casilla vacía de un total sugiere lo que calculará el portal", () => {
    const d = draft();
    const out = buildFreeOutput(d);
    const total = totalPreview({ ...out, anual: true }, 3);
    expect(total.cells).toEqual({ docentes: 40, satisfaccion: 60 });
    expect(total.basis).toEqual({ docentes: "suma", satisfaccion: "promedio" });
    expect(total.count).toBe(2);
  });

  it("solo se guarda lo escrito: la casilla vacía sigue calculándose", () => {
    const d = draft();
    d.rows[3].cells[d.columns[1].id] = "45";
    const out = buildFreeOutput(d);
    expect(out.rows[3]).toEqual({ year: 2024, kind: "total", label: "Total Oriente", cells: { docentes: 45 } });
    // Borrar lo escrito vuelve al total calculado.
    d.rows[3].cells[d.columns[1].id] = "";
    expect(buildFreeOutput(d).rows[3].cells).toEqual({});
  });

  it("el rótulo del total vive en la primera columna de texto; sin texto, dice «Total»", () => {
    const d = draft();
    d.rows.push({ ...emptyFreeRow("total"), year: "2024" });
    const out = buildFreeOutput(d);
    expect(out.rows[4]).toEqual({ year: 2024, kind: "total", label: "Total", cells: {} });
  });

  it("un total en un conjunto anual se calcula con las filas de su año", () => {
    const d = draft();
    d.rows.push({ ...emptyFreeRow(), year: "2025", cells: { [d.columns[1].id]: "7" } }, { ...emptyFreeRow("total"), year: "2025" });
    const out = buildFreeOutput(d);
    expect(totalPreview({ ...out, anual: true }, 5).cells.docentes).toBe(7);
  });

  it("avisa de un total sin filas encima ni cifras escritas, sin impedir guardar", () => {
    const d = blankFreeDraft("blanco");
    d.meta = { ...d.meta, title: "Convenios" };
    d.rows = [emptyFreeRow("total")];
    const out = buildFreeOutput(d);
    expect(out.errors).toEqual([]);
    expect(out.warnings).toEqual(["Fila 1: el total no tiene filas de datos encima ni cifras escritas; saldrá vacío."]);
  });
});

describe("pegar desde Excel", () => {
  const excel = "País\tConvenios\tVigencia\tCobertura\nColombia\t12\t2025-03-01\t45,5 %\nMéxico\t1.250\t2026-01-15\t80 %\n";

  it("propone el tipo de cada columna a partir de lo pegado", () => {
    expect(guessFreeColumn(["12", "1.250", ""]).kind).toBe("cifra");
    expect(guessFreeColumn(["45,5 %", "80 %"])).toMatchObject({ kind: "cifra", format: "porcentaje" });
    expect(guessFreeColumn(["2025-03-01", "15/01/2026"]).kind).toBe("fecha");
    expect(guessFreeColumn(["Colombia", "México"])).toMatchObject({ kind: "territorio", territory: "pais" });
    expect(guessFreeColumn(["Santander", "Cesar"])).toMatchObject({ kind: "territorio", territory: "departamento" });
    expect(guessFreeColumn(["Santander", "Santander"]).kind).toBe("texto");
    expect(guessFreeColumn(["Medicina", "12"]).kind).toBe("texto");
    expect(guessFreeColumn([]).kind).toBe("texto");
  });

  it("en un conjunto nuevo, pegar crea las columnas con el nombre del encabezado", () => {
    const d = blankFreeDraft("pegar");
    const grid = parsePaste(excel);
    expect(looksLikeFreeHeader(d, grid)).toBe(true);
    const request = { grid, atRow: 0, atField: 0, header: true, replace: true };
    const plan = planFreePaste(d, request);
    expect(plan.targets.map((t) => [t.to, t.label])).toEqual([["nueva", "País"], ["nueva", "Convenios"], ["nueva", "Vigencia"], ["nueva", "Cobertura"]]);
    expect(plan.misfits).toEqual([0, 0, 0, 0]);

    const next = { ...applyFreePaste(d, request), meta: { ...d.meta, title: "Convenios" } };
    const out = buildFreeOutput(next);
    expect(out.errors).toEqual([]);
    expect(out.columns).toEqual([
      { key: "pais", label: "País", kind: "territorio", territory: "pais" },
      { key: "convenios", label: "Convenios", kind: "cifra", format: "entero" },
      { key: "vigencia", label: "Vigencia", kind: "fecha" },
      { key: "cobertura", label: "Cobertura", kind: "cifra", format: "porcentaje" },
    ]);
    expect(out.rows).toEqual([
      { year: null, kind: "dato", label: "", cells: { pais: "Colombia", convenios: 12, vigencia: "2025-03-01", cobertura: 45.5 } },
      { year: null, kind: "dato", label: "", cells: { pais: "México", convenios: 1250, vigencia: "2026-01-15", cobertura: 80 } },
    ]);
  });

  it("sin encabezados, las columnas nuevas se numeran y se pueden renombrar después", () => {
    const d = blankFreeDraft("pegar");
    const next = applyFreePaste(d, { grid: parsePaste("Cúcuta\t10\nBogotá\t20"), atRow: 0, atField: 0, header: false, replace: true });
    expect(next.columns.map((c) => [c.label, c.kind])).toEqual([["Columna 1", "texto"], ["Columna 2", "cifra"]]);
  });

  it("una columna «Año» con años vuelve anual el conjunto nuevo y va al año de cada fila", () => {
    const d = blankFreeDraft("pegar");
    const request = { grid: parsePaste("Año\tSede\tDocentes\n2024\tCúcuta\t10\n2025\tCúcuta\t12"), atRow: 0, atField: 0, header: true, replace: true };
    expect(planFreePaste(d, request).becomesAnnual).toBe(true);
    const next = applyFreePaste(d, request);
    expect(next.meta.temporality).toBe("anual");
    expect(next.columns.map((c) => c.label)).toEqual(["Sede", "Docentes"]);
    expect(next.rows.map((row) => row.year)).toEqual(["2024", "2025"]);
  });

  it("en un conjunto guardado, cada columna pegada va a la que se llama igual y las claves no cambian", () => {
    const d = draft();
    const request = { grid: parsePaste("DOCENTES\tsede\tSedes propias\n15\tValledupar\tsí"), atRow: 0, atField: 0, header: true, replace: true };
    const plan = planFreePaste(d, request);
    expect(plan.targets.map((t) => t.to)).toEqual(["columna", "columna", "nueva"]);
    const out = buildFreeOutput(applyFreePaste(d, request));
    expect(out.columns.map((c) => c.key)).toEqual(["sede", "docentes", "satisfaccion", "sedes-propias"]);
    expect(out.rows).toEqual([{ year: null, kind: "dato", label: "", cells: { sede: "Valledupar", docentes: 15, satisfaccion: null, "sedes-propias": "sí" } }]);
  });

  it("pegar sobre una casilla llena desde ahí, salta títulos y totales y crea las columnas que falten", () => {
    const d = draft();
    // Campo 2 de un conjunto anual: el año es el 0, «Sede» el 1 y «Docentes» el 2.
    const request = { grid: parsePaste("11\t55\tnota\n31\t75\t"), atRow: 0, atField: 2, header: false, replace: false };
    const plan = planFreePaste(d, request);
    expect(plan.targets.map((t) => t.label)).toEqual(["Docentes", "Satisfacción", "Columna 4"]);
    const out = buildFreeOutput(applyFreePaste(d, request));
    expect(out.rows[0].kind).toBe("grupo");
    expect(out.rows[1].cells).toEqual({ sede: "Cúcuta", docentes: 11, satisfaccion: 55, "columna-4": "nota" });
    expect(out.rows[2].cells).toEqual({ sede: "Bucaramanga", docentes: 31, satisfaccion: 75, "columna-4": null });
    expect(out.rows[3].kind).toBe("total");
  });

  it("lo pegado que no encaja con la columna se cuenta en la vista previa y se pega igual", () => {
    const d = draft();
    const request = { grid: parsePaste("Sede\tDocentes\nPamplona\tpendiente"), atRow: 4, atField: 0, header: true, replace: false };
    expect(planFreePaste(d, request).misfits).toEqual([0, 1]);
    const out = buildFreeOutput(applyFreePaste(d, request));
    expect(out.errors).toEqual([]);
    expect(out.rows[4].cells.docentes).toBe("pendiente");
  });
});
