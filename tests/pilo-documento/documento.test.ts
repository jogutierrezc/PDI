import { describe, expect, it } from "vitest";
import * as docx from "docx";
import ExcelJS from "exceljs";
import { unzipSync, strFromU8 } from "fflate";
import { bloques, plano, tramos } from "../../supabase/functions/pilo-documento/markdown";
import { construirDocx, construirXlsx, nombreDeHoja, valorDeCelda } from "../../supabase/functions/pilo-documento/nucleo";
import { crearManejador, fechaLarga, nombreArchivo, MAX_TEXTO } from "../../supabase/functions/pilo-documento/handler";
import { revisarLimite } from "../../supabase/functions/pilo-documento/limite";

const MD = `## Rúbrica de **evaluación**

Texto con *cursiva* y \`código\`.

| Criterio | Peso |
|---|---|
| Claridad | 40 |
| Rigor | 60 |
| Total | =SUM(B2:B3) |

- Primer punto
- Segundo punto

1. Uno
2. Dos

\`\`\`python
def f(x):
    return x ** 2
\`\`\`

\`\`\`formula
x² + y² = r²
\`\`\`

> Una cita
`;
const espec = { titulo: "Rúbrica", texto: MD, plantilla: "udes" as const, fecha: "18 de noviembre de 2026" };

describe("markdown", () => {
  it("reparte los bloques", () => {
    const b = bloques(MD);
    expect(b.map((x) => x.t)).toEqual(["titulo", "parrafo", "tabla", "lista", "lista", "codigo", "formula", "cita"]);
    expect(b[2]).toEqual({ t: "tabla", filas: [["Criterio", "Peso"], ["Claridad", "40"], ["Rigor", "60"], ["Total", "=SUM(B2:B3)"]] });
    expect(b[4]).toMatchObject({ t: "lista", ordenada: true });
  });
  it("una cerca sin cerrar es código, y las marcas se quitan del texto plano", () => {
    expect(bloques("```py\nprint(1)")).toEqual([{ t: "codigo", lenguaje: "py", texto: "print(1)" }]);
    expect(plano("Es **clave** y *cum laude* con `x`")).toBe("Es clave y cum laude con x");
    expect(tramos("2 * 3 = 6").map((t) => t.texto).join("")).toBe("2 * 3 = 6");
  });
});

describe("Word institucional", () => {
  it("es un .docx válido con encabezado, pie con páginas, títulos, tablas y listas con numeración", async () => {
    const bytes = await construirDocx(docx, espec);
    const z = unzipSync(bytes);
    const nombres = Object.keys(z);
    expect(nombres).toContain("word/document.xml");
    expect(nombres.some((n) => /word\/header\d*\.xml/.test(n))).toBe(true);
    const doc = strFromU8(z["word/document.xml"]);
    expect(doc).toContain("Rúbrica de ");
    expect(doc).toContain("Claridad");
    expect(doc).toContain("w:tbl>");
    expect(doc).toContain("w:numPr");
    expect(doc).toContain("x² + y² = r²");
    expect(doc).toContain("Universidad de Santander · 18 de noviembre de 2026");
    const pie = strFromU8(z[nombres.find((n) => /word\/footer\d*\.xml/.test(n))!]);
    expect(pie).toMatch(/PAGE/); expect(pie).toMatch(/NUMPAGES/);
    expect(strFromU8(z[nombres.find((n) => /word\/header\d*\.xml/.test(n))!])).toContain("Universidad de Santander");
  });
  it("la plantilla simple no lleva portada ni encabezado", async () => {
    const z = unzipSync(await construirDocx(docx, { ...espec, plantilla: "simple" }));
    expect(Object.keys(z).some((n) => /header\d*\.xml/.test(n))).toBe(false);
    expect(strFromU8(z["word/document.xml"])).not.toContain("Universidad de Santander ·");
  });
});

describe("Excel con formato", () => {
  it("una hoja por tabla, encabezado con color, panel fijo, filtro, números y fórmulas", async () => {
    const bytes = await construirXlsx(ExcelJS, espec);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tabla 1"]);
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe("Criterio");
    expect(ws.getCell("A1").font?.bold).toBe(true);
    expect((ws.getCell("A1").fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FF0B4EA2");
    expect(ws.getCell("B2").value).toBe(40);                         // número, no texto
    expect(ws.getCell("B4").value).toMatchObject({ formula: "SUM(B2:B3)" });
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });
  it("sin tablas, una hoja «Texto»; con varias tablas, varias hojas con nombres únicos", async () => {
    const a = new ExcelJS.Workbook(); await a.xlsx.load(await construirXlsx(ExcelJS, { ...espec, texto: "Hola\n\nMundo" }));
    expect(a.worksheets.map((w) => w.name)).toEqual(["Texto"]);
    const dos = "| a | b |\n|-|-|\n| 1 | 2 |\n\ntexto\n\n| c |\n|-|\n| x |";
    const b = new ExcelJS.Workbook(); await b.xlsx.load(await construirXlsx(ExcelJS, { ...espec, texto: dos }));
    expect(b.worksheets.map((w) => w.name)).toEqual(["Tabla 1", "Tabla 2"]);
    expect(nombreDeHoja("Hoja", new Set(["hoja"]))).toBe("Hoja 2");
    expect(nombreDeHoja("a/b:c*d?[e]", new Set())).toBe("a b c d  e");
  });
  it("valorDeCelda: coma decimal, ceros iniciales y fórmulas", () => {
    expect(valorDeCelda("3,5", false)).toBe(3.5);
    expect(valorDeCelda("00123", false)).toBe("00123");
    expect(valorDeCelda("1.234", false)).toBe(1.234);
    expect(valorDeCelda("**=A1+B1**", false)).toEqual({ formula: "A1+B1" });
    expect(valorDeCelda("Peso", true)).toBe("Peso");
    expect(valorDeCelda("40", true)).toBe("40");
  });
});

describe("el manejador", () => {
  const base = { configurado: true, anonKey: "ANON", sal: "s", usuarioDe: async (t: string) => (t === "bueno" ? "u1" : null), golpe: async () => 1, limiteHora: 30, docx, excel: ExcelJS, ahora: () => new Date("2026-11-18T12:00:00Z") };
  const pedir = (h: ReturnType<typeof crearManejador>, cuerpo: unknown, token: string | null = "bueno", metodo = "POST") =>
    h(new Request("https://x/f", { method: metodo, headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined }));
  const h = crearManejador(base);

  it("exige sesión: sin ella, con la clave anónima o con un token falso, 401", async () => {
    for (const t of [null, "ANON", "malo"]) expect((await pedir(h, { formato: "docx", texto: "x" }, t)).status).toBe(401);
  });
  it("valida el pedido", async () => {
    expect((await pedir(h, "no es json")).status).toBe(400);
    expect((await pedir(h, { formato: "pdf", texto: "x" })).status).toBe(400);
    expect((await pedir(h, { formato: "docx", texto: "   " })).status).toBe(400);
    expect((await pedir(h, { formato: "docx", texto: "a".repeat(MAX_TEXTO + 1) })).status).toBe(413);
    expect((await pedir(h, {}, "bueno", "GET")).status).toBe(405);
    expect((await pedir(h, {}, null, "OPTIONS")).status).toBe(204);
  });
  it("respeta el límite por hora", async () => {
    const r = await pedir(crearManejador({ ...base, golpe: async () => 31 }), { formato: "docx", texto: "Hola" });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect((await pedir(crearManejador({ ...base, golpe: async () => null }), { formato: "docx", texto: "Hola" })).status).toBe(200);   // si el contador falla, no bloquea
  });
  it("devuelve el archivo con su tipo y nombre", async () => {
    const r = await pedir(h, { formato: "docx", titulo: "Plan: 2026/1", texto: "## Plan\n\nHola" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("wordprocessingml");
    expect(decodeURIComponent(r.headers.get("X-Pilo-Archivo")!)).toBe("Plan 2026 1.docx");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);               // «PK»: un ZIP
    const x = await pedir(h, { formato: "xlsx", texto: "| a |\n|-|\n| 1 |" });
    expect(x.headers.get("Content-Type")).toContain("spreadsheetml");
  });
  it("utilidades", async () => {
    expect(fechaLarga(new Date("2026-11-18T12:00:00Z"))).toBe("18 de noviembre de 2026");
    expect(nombreArchivo("  ", "docx")).toBe("Pilo.docx");
    expect(await revisarLimite({ golpe: async () => 5, sal: "s", usuario: "u", limite: 0 })).toEqual({ ok: true });
  });
});
