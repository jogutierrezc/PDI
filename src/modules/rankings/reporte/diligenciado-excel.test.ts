/* Excel de THE diligenciado: lectura (con un libro armado en memoria) y plan de importación idempotente. */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { aniosDelArchivo, caminoEstados, leerDiligenciado, planificarImportacion, siNoDe } from "./diligenciado-excel";
import type { EvidenciaExistente, RespuestaExistente } from "./diligenciado-excel";

/** Una hoja SDG con las columnas del Excel de UDES (fila 2 de encabezados, como el real). */
function libro(filas: (string | number | null | { text: string; hyperlink: string })[][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SDG4");
  ws.addRow(Array(10).fill("SDG4: Quality Education"));
  ws.addRow([
    "Type",
    "Metric and indicator reference",
    "Metric / Indicator",
    "Metrica / Indicador Este año solicitamos información del año académico 2024.",
    "Fuente datos",
    "Value \n(for continuous data)",
    "Yes/No",
    "Evidence1",
    "Public (Yes/No)",
    'Comentarios" con una longitud máxima de 1000 caracteres',
    "Tipo de requerimiento",
  ]);
  for (const f of filas) ws.addRow(f);
  const control = wb.addWorksheet("CONTROL UDES 2026");
  control.addRow(["Control UDES – Sustainability Impact Ratings 2027"]);
  return wb;
}

const FILAS = [
  ["Metric", "4.2", "Proportion of graduates", "Proporción", "", null, null, null, null, null, ""],
  ["Indicator", "4.2.1", "Graduates with teaching qualification", "Titulados", "", null, null, null, null, "Datos del SNIES 2024.", "Dato cuantitativo"],
  ["Indicator", "4.2.1", "Number of graduates", "Número de graduados", "", 5326, null, null, null, null, ""],
  ["Indicator", "4.2.1", "Number of graduates qualified to teach", "Con título docente", "", "doscientos", null, null, null, null, ""],
  ["Metric", "4.3", "Lifelong learning", "Aprendizaje", "", null, null, null, null, null, ""],
  ["Indicator", "4.3.1", "Public resources", "Recursos públicos", "", null, null, null, null, "La biblioteca abre al público.", "Evidencia"],
  ["Indicator", "4.3.1", "Free courses", "Cursos gratuitos", "", null, "Yes", { text: "Cursos", hyperlink: "https://udes.edu.co/cursos-2024" }, "Yes", null, ""],
  ["Indicator", "4.3.1", "Free access to facilities", "Instalaciones", "", null, "No", "Pedir el reglamento a Planta Física", null, null, ""],
  ["Indicator", "4.3.2", "Public events", "Eventos", "", null, "si", "http://udes.edu.co/evento", "no", null, "Evidencia"],
  ["Indicator", "4.3.3", "Executive education", "Educación ejecutiva", "", null, "tal vez", null, null, null, "Evidencia"],
  [null, "", "Orphan row", "Sin referencia", "", 12, null, null, null, null, ""],
];

describe("lectura del Excel diligenciado", () => {
  const leido = leerDiligenciado(libro(FILAS), "Impact_2026_UDES.xlsx");

  it("dice qué años trae el archivo (no decide el ciclo)", () => {
    // El nombre dice 2026 y la hoja de control 2027: manda el primero que aparece (el nombre), y se muestra para que Planeación decida.
    expect(leido.anioArchivo).toBe(2026);
    expect(leido.anioDatos).toBe(2024);
    expect(aniosDelArchivo(libro([]), "otro.xlsx").anioArchivo).toBe(2027);
  });

  it("las opciones heredan del indicador padre: cifras, sí/no, evidencias y comentarios", () => {
    const d421 = leido.datos.find((d) => d.indicador === "4.2.1")!;
    expect(d421.valores).toEqual({ "4.2.1/2": 5326 });
    expect(d421.comentario).toBe("Datos del SNIES 2024.");
    const d431 = leido.datos.find((d) => d.indicador === "4.3.1")!;
    expect(d431.siNo).toBe(true);
    expect(d431.evidencias).toEqual([
      { kind: "url", valor: "https://udes.edu.co/cursos-2024", publica: true },
      { kind: "nota", valor: "Pedir el reglamento a Planta Física", publica: false },
    ]);
    expect(d431.comentario).toBe("La biblioteca abre al público.");
  });

  it("explica en español cada problema", () => {
    const textos = leido.problemas.map((p) => `${p.tipo}: ${p.texto}`).join("\n");
    expect(textos).toMatch(/valor: .*«doscientos» no es un número/);
    expect(textos).toMatch(/url: .*http:\/\/udes.edu.co\/evento.* queda como nota/);
    expect(textos).toMatch(/si_no: .*«tal vez» no es Yes ni No/);
    expect(textos).toMatch(/sin_ref: .*no trae número de indicador/);
    expect(leido.datos.find((d) => d.indicador === "4.3.2")?.siNo).toBe(true);
  });

  it("acepta sí/no en inglés y español", () => {
    expect([siNoDe("Yes"), siNoDe("Sí"), siNoDe("NO"), siNoDe(""), siNoDe("quizá")]).toEqual([true, true, false, null, "invalido"]);
  });

  it("la hoja CONTROL completa lo que las hojas SDG no traen (sin duplicar)", () => {
    const wb = libro(FILAS);
    const control = wb.getWorksheet("CONTROL UDES 2026")!;
    control.addRow([]);
    control.addRow(["ODS", "Indicador", "Descripción", "Peso THE", "Tipo", "Coordinación", "Responsable", "Apoyo", "Prioridad", "Estado", "Dato / valor", "Respuesta", "Evidencia / URL", "Pública", "Comentarios"]);
    control.addRow(["ODS 4", "4.3.1", "x", 0.1, "", "", "", "", "", "", null, "No", "https://udes.edu.co/cursos-2024", "Sí", "Otro comentario"]);
    control.addRow(["ODS 4", "4.3.3", "x", 0.1, "", "", "", "", "", "", null, "Sí", "https://udes.edu.co/ejecutiva", "Sí", "Desde el control"]);
    control.addRow(["ODS 4", "4.4.1", "x", 0.1, "", "", "", "", "", "", "12,5", null, null, null, null]);
    const d = leerDiligenciado(wb);
    const d431 = d.datos.find((x) => x.indicador === "4.3.1")!;
    // Gana la hoja SDG; la URL repetida no se duplica.
    expect(d431.siNo).toBe(true);
    expect(d431.comentario).toBe("La biblioteca abre al público.");
    expect(d431.evidencias.filter((e) => e.kind === "url")).toHaveLength(1);
    const d433 = d.datos.find((x) => x.indicador === "4.3.3")!;
    expect(d433).toMatchObject({ siNo: true, comentario: "Desde el control", evidencias: [{ kind: "url", valor: "https://udes.edu.co/ejecutiva", publica: true }] });
    expect(d.datos.find((x) => x.indicador === "4.4.1")?.valores).toEqual({ "4.4.1": 12.5 });
    const plan = planificarImportacion({ leido: d, catalogo: [{ id: "4.3.1", nivel: "indicator" }], existentes: [], evidencias: [], modo: "borrador", pisarAprobadas: false });
    expect(plan.problemas.some((p) => p.tipo === "inexistente" && p.texto.startsWith("4.4.1"))).toBe(true);
  });

  it("recorta nada en silencio: un comentario de más de 1000 caracteres no se importa", () => {
    const largo = leerDiligenciado(libro([["Indicator", "4.3.1", "x", "x", "", null, "Yes", null, null, "a".repeat(1001), "Evidencia"]]));
    expect(largo.datos[0].comentario).toBe("");
    expect(largo.problemas[0].tipo).toBe("comentario");
  });
});

describe("plan de importación", () => {
  const leido = leerDiligenciado(libro(FILAS));
  const catalogo = [
    { id: "4.2", nivel: "metric" as const },
    { id: "4.2.1", nivel: "indicator" as const },
    { id: "4.2.1/2", nivel: "option" as const },
    { id: "4.3.1", nivel: "indicator" as const },
    { id: "4.3.2", nivel: "indicator" as const },
  ];

  it("crea lo nuevo y avisa de lo que no está en el catálogo", () => {
    const plan = planificarImportacion({ leido, catalogo, existentes: [], evidencias: [], modo: "borrador", pisarAprobadas: false });
    expect(plan.conteo).toMatchObject({ crear: 3, actualizar: 0, evidencias: 3 });
    expect(plan.acciones.every((a) => a.pasos.join() === "draft")).toBe(true);
    expect(plan.problemas.some((p) => p.tipo === "inexistente")).toBe(false);
    const sinCatalogo = planificarImportacion({ leido, catalogo: catalogo.slice(0, 3), existentes: [], evidencias: [], modo: "borrador", pisarAprobadas: false });
    expect(sinCatalogo.problemas.filter((p) => p.tipo === "inexistente").map((p) => p.texto.split(":")[0])).toEqual(["4.3.1", "4.3.2"]);
  });

  it("es idempotente: repetir no duplica evidencias", () => {
    const existentes: RespuestaExistente[] = [{ id: "r431", indicador: "4.3.1", estado: "draft", valores: {}, si_no: true, comentario_es: "" }];
    const evidencias: EvidenciaExistente[] = [
      { response_id: "r431", kind: "url", url: "https://www.udes.edu.co/cursos-2024/", nombre: "" },
      { response_id: "r431", kind: "nota", url: null, nombre: "pedir el reglamento a planta fisica" },
    ];
    const plan = planificarImportacion({ leido, catalogo, existentes, evidencias, modo: "borrador", pisarAprobadas: false });
    const a = plan.acciones.find((x) => x.indicador === "4.3.1")!;
    expect(a.respuestaId).toBe("r431");
    expect(a.evidencias).toEqual([]);
    expect(a.repetidas).toBe(2);
    expect(a.pasos).toEqual([]);
  });

  it("no pisa una aprobada sin confirmación; con confirmación sí, y cargar como aprobado recorre los estados", () => {
    const existentes: RespuestaExistente[] = [
      { id: "r421", indicador: "4.2.1", estado: "ok", valores: { "4.2.1/3": 10 }, si_no: null, comentario_es: "Viejo" },
      { id: "r431", indicador: "4.3.1", estado: "back", valores: {}, si_no: null, comentario_es: "" },
    ];
    const protegido = planificarImportacion({ leido, catalogo, existentes, evidencias: [], modo: "aprobado", pisarAprobadas: false });
    expect(protegido.aprobadasProtegidas).toEqual(["4.2.1"]);
    expect(protegido.acciones.find((a) => a.indicador === "4.3.1")!.pasos).toEqual(["draft", "sent", "ok"]);
    expect(protegido.acciones.find((a) => a.indicador === "4.3.2")!.pasos).toEqual(["ok"]);

    const pisado = planificarImportacion({ leido, catalogo, existentes, evidencias: [], modo: "aprobado", pisarAprobadas: true });
    const a = pisado.acciones.find((x) => x.indicador === "4.2.1")!;
    expect(a).toMatchObject({ pisaAprobada: true, pasos: [], comentario: "Datos del SNIES 2024." });
    // Completa, no borra: el campo que el Excel no trae se conserva.
    expect(a.valores).toEqual({ "4.2.1/3": 10, "4.2.1/2": 5326 });
    expect(pisado.conteo.aprobadasPisadas).toBe(1);

    const enBorrador = planificarImportacion({ leido, catalogo, existentes, evidencias: [], modo: "borrador", pisarAprobadas: true });
    expect(enBorrador.acciones.find((x) => x.indicador === "4.2.1")!.pasos).toEqual(["back", "draft"]);
  });

  it("el camino de estados es el que permite el flujo a Planeación", () => {
    expect(caminoEstados("none", "ok")).toEqual(["draft", "sent", "ok"]);
    expect(caminoEstados("sent", "draft")).toEqual(["back", "draft"]);
    expect(caminoEstados("ok", "ok")).toEqual([]);
  });
});
