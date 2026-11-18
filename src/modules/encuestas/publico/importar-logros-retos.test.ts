import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { analizarLibro, importarArchivo, leerLibro, MAX_BYTES, planDeAgregado, resumenImportacion, todosLosProblemas } from "./importar-logros-retos";
import type { HojaCruda } from "./importar-logros-retos";
import { construirPlantilla, ENCABEZADOS_APORTES, ENCABEZADOS_CIFRAS, EJEMPLO_LOGRO, EJEMPLO_RETO, hojasPlantilla, MARCA_EJEMPLO } from "./plantilla-logros-retos";
import { construirLibro } from "../../informes/ui/excel";
import { COLUMNAS_CIFRAS, COLUMNAS_ENVIOS, hojasDeEnvios } from "./excel-envios";
import { LIMITES } from "../lib/validacion";
import type { EnvioHist } from "../tipos";

const LOGO = readFileSync(new URL("../../../../public/logo-udes-blanco.png", import.meta.url)).toString("base64");

/* ---------- Libros de mano (la capa pura) ---------- */

const cruda = (nombre: string, filas: string[][], oculta = false, formulas: string[] = []): HojaCruda => ({ nombre, oculta, filas, formulas: new Set(formulas) });
const CAB_A = [...ENCABEZADOS_APORTES];
const CAB_C = [...ENCABEZADOS_CIFRAS];
const control = (extra: Record<string, string> = {}) =>
  cruda("_Control", Object.entries({ formato: "pilo-encuestas-logros-retos", version: "1", origen: "plantilla", encuesta: "rendicion-2026", ...extra }).map(([k, v]) => [k, v]), true);
const libro = (aportes: string[][], cifras: string[][], c = control(), formulas: { a?: string[]; c?: string[] } = {}): HojaCruda[] => [
  cruda("Logros y retos", [["Banda"], [""], [""], CAB_A, ...aportes], false, formulas.a),
  cruda("Cifras", [["Banda"], [""], [""], CAB_C, ...cifras], false, formulas.c),
  c,
];
const DESC = "Se logró avanzar con el proyecto de la dependencia durante todo el año.";
const ap = (n: string, tipo: string, titulo: string, desc = DESC): string[] => [n, tipo, titulo, desc, ""];
const ci = (n: string, que: string, valor: string, tipoCifra: string, unidad = ""): string[] => [n, "", "", que, valor, unidad, tipoCifra];

describe("importar logros y retos · análisis", () => {
  it("lee un aporte bueno con sus cifras, y las cifras en el orden del libro", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Acreditación de tres programas")], [ci("1", "Programas acreditados", "3", "Programas"), ci("1", "Cumplimiento", "72", "Porcentaje")]));
    expect(r.error).toBeNull();
    expect(r.origen).toBe("plantilla");
    expect(r.aportes).toHaveLength(1);
    expect(r.aportes[0].aporte).toEqual({
      tipo: "logro",
      titulo: "Acreditación de tres programas",
      descripcion: DESC,
      cifras: [
        { que: "Programas acreditados", tipo: "programas", valor: 3 },
        { que: "Cumplimiento", tipo: "porcentaje", valor: 72 },
      ],
    });
  });

  it("ignora la fila de ejemplo y las filas vacías (también las que solo traen su N.º)", () => {
    const r = analizarLibro(libro([[MARCA_EJEMPLO, "Logro", "Un ejemplo de título", DESC, ""], ["1", "", "", "", ""], ["2", "", "", "", ""], ap("3", "Reto", "Más aulas para clase")], [[MARCA_EJEMPLO, "Logro", "x", "Ej", "1", "", "Programas"], ci("3", "Aulas nuevas", "4", "Otro", "Aulas")]));
    expect(r.aportes.map((a) => a.numero)).toEqual(["3"]);
    expect(r.aportes[0].aporte?.cifras[0]).toEqual({ que: "Aulas nuevas", tipo: "otro", otro: "Aulas", valor: 4 });
    expect(r.generales).toEqual([]);
  });

  it("valida cada fila con las reglas del formulario y dice dónde y cómo arreglar", () => {
    const r = analizarLibro(
      libro(
        [ap("1", "Logro", "Hola"), ap("2", "Premio", "Un título válido"), ap("3", "Reto", "Un título válido", "corta"), ap("4", "Reto", "Reto válido de prueba")],
        [ci("1", "Cifra", "3", "Programas"), ci("2", "Cifra", "3", "Programas"), ci("3", "Cifra", "3", "Programas"), ci("4", "Aulas", "mucho", "Estudiantes")],
      ),
    );
    const [a1, a2, a3, a4] = r.aportes;
    expect(a1.aporte).toBeNull();
    expect(a1.problemas[0]).toMatchObject({ nivel: "error", hoja: "Logros y retos", fila: 5, columna: "Título" });
    expect(a1.problemas[0].mensaje).toMatch(/5 a 120/);
    expect(a2.problemas.find((p) => p.columna === "Tipo")?.mensaje).toMatch(/Logro o Reto/);
    expect(a3.problemas.find((p) => p.columna === "Descripción")?.mensaje).toMatch(/al menos 20/);
    expect(a4.problemas).toEqual([expect.objectContaining({ hoja: "Cifras", fila: 8, columna: "Valor" })]);
    expect(a4.problemas[0].mensaje).toMatch(/mucho/);
    expect(resumenImportacion(r)).toEqual({ total: 4, listos: 0, conProblemas: 4 });
  });

  it("las filas válidas no se pierden por las inválidas", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito"), ap("2", "Logro", "x"), ap("3", "Reto", "Un reto bien escrito")], [ci("1", "Cifra", "10", "Estudiantes"), ci("2", "Cifra", "1", "Dinero"), ci("3", "Cifra", "1,5", "Dinero")]));
    expect(resumenImportacion(r)).toEqual({ total: 3, listos: 2, conProblemas: 1 });
    expect(planDeAgregado(r, []).filter((p) => p.incluir)).toHaveLength(2);
  });

  it("un porcentaje mayor a 100, un tipo de cifra inválido y «Otro» sin palabra se reportan", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito")], [ci("1", "Cifra uno", "120", "Porcentaje"), ci("1", "Cifra dos", "1", "Cosas"), ci("1", "Cifra tres", "1", "Otro", "")]));
    const cols = r.aportes[0].problemas.map((p) => `${p.fila}:${p.columna}`);
    expect(cols).toEqual(["5:Valor", "6:Tipo de cifra", "7:Unidad"]);
  });

  it("normaliza los números en formato colombiano", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito")], [ci("1", "Mil doscientos", "1.200", "Estudiantes"), ci("1", "Con decimal", "1.200,5", "Dinero"), ci("1", "Coma", "12,5", "Porcentaje"), ci("1", "Con signo", "$ 2.500", "Dinero")]));
    expect(r.aportes[0].aporte?.cifras.map((c) => c.valor)).toEqual([1200, 1200.5, 12.5, 2500]);
  });

  it("una fórmula no se lee: su celda queda vacía y se avisa", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito")], [["1", "", "", "Cifra", "", "", "Programas"]], control(), { c: ["4:4"] }));
    const ps = r.aportes[0].problemas;
    expect(ps.map((p) => `${p.nivel}:${p.columna}`)).toEqual(["aviso:Valor", "error:Valor"]);
    expect(r.aportes[0].aporte).toBeNull();
    // Un texto que empieza con «=» es solo texto y se importa tal cual.
    const t = analizarLibro(libro([ap("1", "Logro", "=SUMA(A1:A9) y más texto")], [ci("1", "Cifra", "2", "Programas")]));
    expect(t.aportes[0].aporte?.titulo).toBe("=SUMA(A1:A9) y más texto");
  });

  it("N.º repetido, cifra con N.º inexistente y aporte sin cifras", () => {
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito"), ap("1", "Reto", "Otro reto bien escrito"), ap("2", "Reto", "Un tercero bien escrito")], [ci("1", "Cifra", "2", "Programas"), ci("9", "Huérfana", "2", "Programas")]));
    expect(r.aportes[0].aporte).not.toBeNull();
    expect(r.aportes[1].problemas.map((p) => p.columna)).toContain("N.º");
    expect(r.aportes[2].problemas.find((p) => p.columna === "Cifras")?.mensaje).toMatch(/N\.º 2/);
    expect(r.generales).toEqual([expect.objectContaining({ nivel: "error", hoja: "Cifras", fila: 6, columna: "N.º" })]);
  });

  it("más de 12 cifras en un aporte es un error", () => {
    const cifras = Array.from({ length: LIMITES.cifras + 1 }, (_, i) => ci("1", `Cifra número ${i}`, "1", "Programas"));
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito")], cifras));
    expect(r.aportes[0].aporte).toBeNull();
    expect(r.aportes[0].problemas.some((p) => /máximo es 12/.test(p.mensaje))).toBe(true);
  });

  it("el plan respeta el máximo de aportes y no repite lo que ya escribió la persona", () => {
    const filas = Array.from({ length: 5 }, (_, i) => ap(String(i + 1), "Logro", `Logro número ${i + 1} del año`));
    const cifras = filas.map((f) => ci(f[0], "Cifra", "1", "Programas"));
    const r = analizarLibro(libro(filas, cifras));
    const yaHay = [{ tipo: "logro" as const, titulo: "LOGRO número 2 del año", descripcion: DESC, cifras: [] }];
    const plan = planDeAgregado(r, yaHay, 4);
    expect(plan.map((p) => p.motivo ?? "ok")).toEqual(["ok", "repetido", "ok", "ok", "no-cabe"]);
    expect(plan.filter((p) => p.incluir)).toHaveLength(3);
  });

  it("rechaza lo ajeno: sin control, otro formato, otra versión", () => {
    expect(analizarLibro([cruda("Hoja1", [["a"]])]).error).toMatch(/no es de la plantilla/);
    expect(analizarLibro(libro([], [], control({ formato: "otra-cosa" }))).error).toMatch(/otro formato/);
    expect(analizarLibro(libro([], [], control({ version: "2" }))).error).toMatch(/más nueva/);
    expect(analizarLibro(libro([], [], control({ version: "0" }))).error).toMatch(/anterior/);
    expect(analizarLibro([control()]).error).toMatch(/No encuentro la hoja/);
  });

  it("una plantilla sin nada escrito lo dice; otra encuesta se avisa sin bloquear", () => {
    expect(analizarLibro(libro([["1", "", "", "", ""]], [])).error).toMatch(/ningún logro ni reto/);
    const r = analizarLibro(libro([ap("1", "Logro", "Un logro bien escrito")], [ci("1", "Cifra", "2", "Programas")], control({ encuesta: "otra" })), { slug: "rendicion-2026" });
    expect(r.error).toBeNull();
    expect(r.generales[0]).toMatchObject({ nivel: "aviso" });
  });

  it("texto con caracteres de control y espacios de más sale limpio", () => {
    const r = analizarLibro(libro([ap("1", "  logro ", "  Un   logro\u0000 bien\nescrito ")], [ci("1", "  Cifra  larga ", "2", " programas ")]));
    expect(r.aportes[0].aporte?.titulo).toBe("Un logro bien escrito");
    expect(r.aportes[0].aporte?.cifras[0].que).toBe("Cifra larga");
  });
});

/* ---------- La lectura real del archivo (exceljs) ---------- */

async function llenarPlantilla(f: (hojas: { aportes: ExcelJS.Worksheet; cifras: ExcelJS.Worksheet }) => void): Promise<ArrayBuffer> {
  const base = await construirPlantilla({ slug: "rendicion-2026", titulo: "Rendición de Cuentas 2026", logo: LOGO, ahora: new Date("2026-06-01T00:00:00Z") });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base);
  f({ aportes: wb.getWorksheet("Logros y retos")!, cifras: wb.getWorksheet("Cifras")! });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("ida y vuelta con archivos reales", () => {
  it("la plantilla vacía se genera con sus hojas, ocultas y ejemplos, y no trae nada que importar", async () => {
    const buf = await construirPlantilla({ slug: "rendicion-2026", titulo: "Rendición", logo: LOGO });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((h) => `${h.name}:${h.state}`)).toEqual(["Instrucciones:visible", "Logros y retos:visible", "Cifras:visible", "Listas:hidden", "_Control:hidden"]);
    const r = await importarArchivo(buf, { slug: "rendicion-2026" });
    expect(r.error).toMatch(/ningún logro ni reto/);
    // Los ejemplos están, pero marcados.
    expect(wb.getWorksheet("Logros y retos")!.getCell("A5").value).toBe(MARCA_EJEMPLO);
    // La lista desplegable de Tipo y la validación de largo del título.
    expect(wb.getWorksheet("Logros y retos")!.getCell("B8").dataValidation).toMatchObject({ type: "list", formulae: ['"Logro,Reto"'] });
    expect(wb.getWorksheet("Logros y retos")!.getCell("C8").dataValidation).toMatchObject({ type: "textLength", formulae: [5, 120] });
    expect(wb.getWorksheet("Cifras")!.getCell("G9").dataValidation).toMatchObject({ type: "list" });
  });

  it("plantilla llena → importar → aportes válidos para enviar", async () => {
    const buf = await llenarPlantilla(({ aportes, cifras }) => {
      aportes.getCell("B7").value = "Logro";
      aportes.getCell("C7").value = "Mil estudiantes graduados con honores";
      aportes.getCell("D7").value = "La facultad graduó a más de mil estudiantes este año, con una mejora clara en la tasa de graduación oportuna.";
      aportes.getCell("B8").value = "Reto";
      aportes.getCell("C8").value = "Más laboratorios para ingeniería";
      aportes.getCell("D8").value = "Se necesitan laboratorios adicionales para atender los grupos de primer semestre el próximo año.";
      cifras.getCell("A8").value = 1;
      cifras.getCell("D8").value = "Graduados en 2025";
      cifras.getCell("E8").value = 1200.5; // número de Excel
      cifras.getCell("G8").value = "Estudiantes";
      cifras.getCell("A9").value = 1;
      cifras.getCell("D9").value = "Tasa de graduación";
      cifras.getCell("E9").value = "72,5"; // texto colombiano
      cifras.getCell("G9").value = "Porcentaje";
      cifras.getCell("A10").value = 2;
      cifras.getCell("D10").value = "Laboratorios nuevos";
      cifras.getCell("E10").value = "1.234";
      cifras.getCell("F10").value = "Laboratorios";
      cifras.getCell("G10").value = "Otro";
    });
    const r = await importarArchivo(buf, { slug: "rendicion-2026" });
    expect(r.error).toBeNull();
    expect(todosLosProblemas(r)).toEqual([]);
    expect(r.aportes.map((a) => a.aporte)).toEqual([
      { tipo: "logro", titulo: "Mil estudiantes graduados con honores", descripcion: expect.stringContaining("más de mil"), cifras: [{ que: "Graduados en 2025", tipo: "estudiantes", valor: 1200.5 }, { que: "Tasa de graduación", tipo: "porcentaje", valor: 72.5 }] },
      { tipo: "reto", titulo: "Más laboratorios para ingeniería", descripcion: expect.stringContaining("laboratorios adicionales"), cifras: [{ que: "Laboratorios nuevos", tipo: "otro", otro: "Laboratorios", valor: 1234 }] },
    ]);
  });

  it("un valor 1,234 escrito como número de Excel es 1,234, no mil doscientos treinta y cuatro; un porcentaje con formato de % se lee como se ve", async () => {
    const buf = await llenarPlantilla(({ aportes, cifras }) => {
      aportes.getCell("B7").value = "Logro";
      aportes.getCell("C7").value = "Un logro bien escrito aquí";
      aportes.getCell("D7").value = "Descripción suficientemente larga para pasar la validación del formulario.";
      cifras.getCell("A8").value = 1;
      cifras.getCell("D8").value = "Cifra con decimales";
      cifras.getCell("E8").value = 1.234;
      cifras.getCell("G8").value = "Dinero";
      cifras.getCell("A9").value = 1;
      cifras.getCell("D9").value = "Cumplimiento";
      cifras.getCell("E9").value = 0.72;
      cifras.getCell("E9").style = { ...cifras.getCell("E9").style, numFmt: "0%" }; // copia: exceljs comparte el estilo entre celdas iguales
      cifras.getCell("G9").value = "Porcentaje";
      // Una fórmula real: se ignora (y lo dice).
      cifras.getCell("A10").value = 1;
      cifras.getCell("D10").value = "Con fórmula";
      cifras.getCell("E10").value = { formula: "1+1", result: 2 };
      cifras.getCell("G10").value = "Programas";
    });
    const r = await importarArchivo(buf);
    expect(r.aportes[0].aporte).toBeNull(); // la cifra con fórmula bloquea ese aporte
    expect(r.aportes[0].problemas.map((p) => `${p.nivel}:${p.fila}:${p.columna}`)).toEqual(["aviso:10:Valor", "error:10:Valor"]);
    const sin = await llenarPlantilla(({ aportes, cifras }) => {
      aportes.getCell("B7").value = "Logro";
      aportes.getCell("C7").value = "Un logro bien escrito aquí";
      aportes.getCell("D7").value = "Descripción suficientemente larga para pasar la validación del formulario.";
      cifras.getCell("A8").value = 1;
      cifras.getCell("D8").value = "Cifra con decimales";
      cifras.getCell("E8").value = 1.234;
      cifras.getCell("G8").value = "Dinero";
      cifras.getCell("A9").value = 1;
      cifras.getCell("D9").value = "Cumplimiento";
      cifras.getCell("E9").value = 0.72;
      cifras.getCell("E9").style = { ...cifras.getCell("E9").style, numFmt: "0%" }; // copia: exceljs comparte el estilo entre celdas iguales
      cifras.getCell("G9").value = "Porcentaje";
    });
    const r2 = await importarArchivo(sin);
    expect(r2.aportes[0].aporte?.cifras.map((c) => c.valor)).toEqual([1.234, 72]);
  });

  it("un libro bajado de «Mis envíos» se reconoce, se importa y avisa que son copias", async () => {
    const envio: EnvioHist = {
      id: "a", origen: "aporte", encuesta: { slug: "rendicion-2026", titulo: "Rendición" }, creado: "2026-04-01T15:00:00Z", etapa: 2, quitable: false, tipos: ["logro", "reto"], titulo: "t", lineas: [], copiable: null,
      items: [
        { tipo: "logro", titulo: "Acreditación de tres programas", descripcion: "Se renovó la acreditación de alta calidad de tres programas de la facultad este año.", cifras: [{ que: "Programas", valor: 3, unidad: "programas" }, { que: "Avance", valor: 72.5, unidad: "%" }, { que: "Inversión", valor: 1500000, unidad: "$" }, { que: "Convenios", valor: 4, unidad: "convenios" }] },
        { tipo: "reto", titulo: "Más aulas para clase", descripcion: "Faltan aulas.", cifras: [{ que: "Aulas", valor: 4, unidad: "aulas" }] },
        { tipo: "reto", titulo: "Un reto sin cifras registradas", descripcion: "Un reto que se envió sin ninguna cifra de respaldo, por ejemplo.", cifras: [] },
      ],
    };
    const hojas = hojasDeEnvios([envio], { slug: "rendicion-2026", alcance: "esta", ahora: new Date("2026-06-01T00:00:00Z") });
    expect(hojas[0].columnas.map((c) => c.titulo)).toEqual([...COLUMNAS_ENVIOS]);
    expect(hojas[1].columnas.map((c) => c.titulo)).toEqual([...COLUMNAS_CIFRAS]);
    const buf = await construirLibro(hojas, { logo: LOGO, filasLibres: 0 });
    const r = await importarArchivo(buf, { slug: "rendicion-2026" });
    expect(r.error).toBeNull();
    expect(r.origen).toBe("descarga");
    expect(r.generales[0].mensaje).toMatch(/Mis envíos/);
    const [a, b, c] = r.aportes;
    expect(a.aporte?.cifras).toEqual([
      { que: "Programas", tipo: "programas", valor: 3 },
      { que: "Avance", tipo: "porcentaje", valor: 72.5 },
      { que: "Inversión", tipo: "dinero", valor: 1500000 },
      { que: "Convenios", tipo: "otro", otro: "convenios", valor: 4 },
    ]);
    expect(a.problemas.map((p) => p.nivel)).toEqual(["aviso"]); // «ya se envió»: copia
    expect(a.problemas[0].mensaje).toMatch(/ya se envió/);
    // Descripción corta: se reporta como en el formulario; el reto sin cifras también.
    expect(b.aporte).toBeNull();
    expect(b.problemas.find((p) => p.columna === "Descripción")).toBeDefined();
    expect(c.problemas.find((p) => p.columna === "Cifras")?.mensaje).toMatch(/No tiene cifras/);
  });

  it("rechaza un archivo que no es un libro, uno muy pesado y uno ajeno", async () => {
    expect((await importarArchivo(new TextEncoder().encode("nombre,valor\n1,2"))).error).toMatch(/no es un libro de Excel/);
    expect((await importarArchivo(new Uint8Array(MAX_BYTES + 1))).error).toMatch(/máximo es 2 MB/);
    expect((await importarArchivo(new Uint8Array([0x50, 0x4b, 1, 2, 3, 4]))).error).toMatch(/dañado/);
    const ajeno = new ExcelJS.Workbook();
    ajeno.addWorksheet("Ventas").addRow(["a", "b"]);
    const r = await importarArchivo((await ajeno.xlsx.writeBuffer()) as ArrayBuffer);
    expect(r.error).toMatch(/no es de la plantilla/);
  });

  it("demasiadas filas: entran las que caben y el resto se avisa; el tope de lectura se respeta", async () => {
    const buf = await llenarPlantilla(({ aportes, cifras }) => {
      for (let i = 0; i < LIMITES.aportes; i++) {
        aportes.getCell(`B${7 + i}`).value = "Logro";
        aportes.getCell(`C${7 + i}`).value = `Logro de prueba número ${i + 1}`;
        aportes.getCell(`D${7 + i}`).value = "Descripción de prueba suficientemente larga para pasar la validación.";
        cifras.getCell(`A${8 + i}`).value = i + 1;
        cifras.getCell(`D${8 + i}`).value = "Una cifra";
        cifras.getCell(`E${8 + i}`).value = i;
        cifras.getCell(`G${8 + i}`).value = "Programas";
      }
    });
    const r = await importarArchivo(buf);
    expect(r.aportes).toHaveLength(LIMITES.aportes);
    const plan = planDeAgregado(r, Array.from({ length: 5 }, (_, i) => ({ tipo: "reto" as const, titulo: `Ya escrito ${i}`, descripcion: DESC, cifras: [] })));
    expect(plan.filter((p) => p.incluir)).toHaveLength(LIMITES.aportes - 5);
    expect(plan.filter((p) => p.motivo === "no-cabe")).toHaveLength(5);
    const hojas = await leerLibro(buf);
    expect(hojas.find((h) => h.nombre === "Logros y retos")!.filas.length).toBeLessThanOrEqual(1000);
  });
});

describe("la plantilla", () => {
  it("sus ejemplos pasan las mismas validaciones que el formulario", () => {
    const h = hojasPlantilla({ slug: "x", titulo: "Encuesta de prueba" });
    // Se arma un libro con los ejemplos quitando la marca: deben salir válidos.
    const aportes = h[1].filas.slice(0, 2).map((f, i) => [String(i + 1), String(f[1]), String(f[2]), String(f[3]), ""]);
    const cifras = h[2].filas.slice(0, 3).map((f, i) => [i < 2 ? "1" : "2", "", "", String(f[3]), String(f[4]), "", String(f[6])]);
    const r = analizarLibro(libro(aportes, cifras));
    expect(todosLosProblemas(r)).toEqual([]);
    expect(r.aportes.map((a) => a.aporte?.tipo)).toEqual(["logro", "reto"]);
    expect(EJEMPLO_LOGRO.cifras.length + EJEMPLO_RETO.cifras.length).toBe(3);
  });

  it("explica los límites reales y lo que no hace", () => {
    const [ins, aportes, cifras, listas, ctl] = hojasPlantilla({ slug: "x", titulo: "Encuesta de prueba" });
    const texto = ins.filas.flat().join("\n");
    expect(texto).toContain(`${LIMITES.titulo.min} a ${LIMITES.titulo.max} caracteres`);
    expect(texto).toContain(`${LIMITES.descripcion.min} a ${LIMITES.descripcion.max} caracteres`);
    expect(texto).toContain(`${LIMITES.aportes} aportes`);
    expect(texto).toContain(`${LIMITES.cifras} cifras`);
    expect(texto).toMatch(/no envía nada/i);
    expect(texto).toMatch(/Paso 4 · Importar/);
    expect(aportes.filas.filter((f) => typeof f[0] === "number")).toHaveLength(LIMITES.aportes);
    expect(cifras.listas?.[6]).toEqual(["Estudiantes", "Programas", "Porcentaje", "Dinero", "Otro"]);
    expect(listas.oculta && ctl.oculta).toBe(true);
    expect(ctl.filas).toContainEqual(["formato", "pilo-encuestas-logros-retos"]);
    expect(ctl.filas).toContainEqual(["encuesta", "x"]);
  });
});
