/* =============================================================================
   Pilo documento · arma el Word y el Excel «con formato institucional».
   Las librerías (docx y exceljs) llegan por parámetro: aquí no se importa nada,
   así las pruebas usan las de node_modules y la función de borde, las de npm:.
   ========================================================================== */

import { type Bloque, bloques, plano, tramos } from "./markdown.ts";

export const AZUL = "0B4EA2";
const GRIS = "F2F5FA";

export interface EspecDocumento {
  titulo: string;
  texto: string;
  plantilla: "udes" | "simple";
  /** «18 de noviembre de 2026»: lo pone quien llama, para que las pruebas no dependan del reloj. */
  fecha: string;
}

// deno-lint-ignore no-explicit-any
type Lib = any;

/* --- Word -------------------------------------------------------------------------- */

export async function construirDocx(docx: Lib, e: EspecDocumento): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, Header, Footer, PageNumber, AlignmentType, LevelFormat, BorderStyle } = docx;
  const institucional = e.plantilla === "udes";
  let instanciaLista = 0;

  const corridas = (crudo: string, extra: Record<string, unknown> = {}) =>
    tramos(crudo).map((t) => new TextRun({ text: t.texto, bold: t.negrita || undefined, italics: t.cursiva || undefined, ...(t.codigo ? { font: "Consolas", shading: { type: ShadingType.CLEAR, fill: "EEF1F5", color: "auto" } } : {}), ...extra }));
  const parrafo = (crudo: string, extra: Record<string, unknown> = {}, run: Record<string, unknown> = {}) => new Paragraph({ children: corridas(crudo, run), ...extra });
  const nivel = (n: number) => (n <= 1 ? HeadingLevel.HEADING_1 : n === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3);

  // deno-lint-ignore no-explicit-any
  const hijos: any[] = [];
  if (institucional) {
    hijos.push(
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: e.titulo, bold: true, color: AZUL })] }),
      new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } }, children: [new TextRun({ text: `Universidad de Santander · ${e.fecha}`, color: "666666", size: 20 })] }),
    );
  }

  for (const b of bloques(e.texto) as Bloque[]) {
    switch (b.t) {
      case "parrafo":
        for (const l of b.texto.split("\n")) hijos.push(parrafo(l, { spacing: { after: 140 } }));
        break;
      case "titulo":
        hijos.push(new Paragraph({ heading: nivel(b.nivel), children: corridas(b.texto, institucional ? { color: AZUL } : {}) }));
        break;
      case "lista": {
        const instancia = b.ordenada ? ++instanciaLista : 0;
        for (const it of b.items) hijos.push(new Paragraph({ children: corridas(it.texto), numbering: { reference: b.ordenada ? "numeros" : "vinetas", level: 0, ...(b.ordenada ? { instance: instancia } : {}) } }));
        break;
      }
      case "codigo":
        for (const l of b.texto.split("\n")) hijos.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: "F4F5F7", color: "auto" }, spacing: { after: 0 }, children: [new TextRun({ text: l || " ", font: "Consolas", size: 19 })] }));
        hijos.push(new Paragraph({ children: [] }));
        break;
      case "formula":
        hijos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [new TextRun({ text: b.texto, italics: true, font: "Cambria Math", size: 26 })] }));
        break;
      case "cita":
        hijos.push(parrafo(b.texto, { indent: { left: 540 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: "C3C8D0", space: 8 } } }, { italics: true, color: "555555" }));
        break;
      case "tabla": {
        const columnas = Math.max(1, ...b.filas.map((f) => f.length));
        const ancho = Math.floor(9360 / columnas);
        const borde = { style: BorderStyle.SINGLE, size: 4, color: "C3C8D0" };
        hijos.push(
          new Table({
            width: { size: ancho * columnas, type: WidthType.DXA },
            columnWidths: Array(columnas).fill(ancho),
            rows: b.filas.map(
              (fila, i) =>
                new TableRow({
                  tableHeader: i === 0,
                  children: Array.from({ length: columnas }, (_, k) => {
                    const crudo = fila[k] ?? "";
                    const cab = i === 0 && institucional;
                    return new TableCell({
                      width: { size: ancho, type: WidthType.DXA },
                      borders: { top: borde, bottom: borde, left: borde, right: borde },
                      margins: { top: 60, bottom: 60, left: 100, right: 100 },
                      shading: cab ? { type: ShadingType.CLEAR, fill: AZUL, color: "auto" } : i % 2 === 0 && i > 0 ? { type: ShadingType.CLEAR, fill: GRIS, color: "auto" } : i === 0 ? { type: ShadingType.CLEAR, fill: "EEF1F5", color: "auto" } : undefined,
                      children: [new Paragraph({ children: corridas(crudo, { ...(i === 0 ? { bold: true } : {}), ...(cab ? { color: "FFFFFF" } : {}) }) })],
                    });
                  }),
                }),
            ),
          }),
          new Paragraph({ children: [] }),
        );
        break;
      }
    }
  }

  const pie = new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["Generado con Mr. Pilo · Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 18, color: "777777" })] })],
  });
  const cabecera = new Header({
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Universidad de Santander", bold: true, color: AZUL, size: 20 })] })],
  });

  const doc = new Document({
    creator: "Mr. Pilo · Universidad de Santander",
    title: e.titulo,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true }, paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: "numeros", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        ...(institucional ? { headers: { default: cabecera }, footers: { default: pie } } : {}),
        children: hijos,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

/* --- Excel ------------------------------------------------------------------------- */

export const nombreDeHoja = (n: string, usados: Set<string>): string => {
  let base = n.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Hoja";
  let k = 2;
  while (usados.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${k++}`;
  usados.add(base.toLowerCase());
  return base;
};

/** Una celda: «=…» es fórmula (la calcula Excel); un número queda número (con coma decimal también); el resto, texto. */
export function valorDeCelda(crudo: string, cabecera: boolean): string | number | { formula: string } {
  const t = plano(crudo).trim();
  if (t.startsWith("=") && t.length > 1) return { formula: t.slice(1) };
  if (cabecera) return t;
  const candidato = (t.match(/,/g) ?? []).length === 1 && !t.includes(".") ? t.replace(",", ".") : t;
  const cero = t.length > 1 && /^0(?![.,])/.test(t);
  const n = Number(candidato);
  return !cero && candidato !== "" && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(candidato) ? n : t;
}

export async function construirXlsx(excel: Lib, e: EspecDocumento): Promise<Uint8Array> {
  const wb = new excel.Workbook();
  wb.creator = "Mr. Pilo · Universidad de Santander";
  wb.created = new Date();
  const usados = new Set<string>();
  const tablas = (bloques(e.texto) as Bloque[]).flatMap((b, i) => (b.t === "tabla" ? [{ filas: b.filas, i }] : []));
  const hojas = tablas.length
    ? tablas.map((t, n) => ({ nombre: nombreDeHoja(`Tabla ${n + 1}`, usados), filas: t.filas, tabla: true }))
    : [{
        nombre: nombreDeHoja("Texto", usados),
        filas: (bloques(e.texto) as Bloque[]).flatMap((b) => (b.t === "parrafo" || b.t === "titulo" || b.t === "cita" ? b.texto.split("\n") : b.t === "lista" ? b.items.map((i) => `${i.marca} ${i.texto}`) : b.t === "codigo" || b.t === "formula" ? b.texto.split("\n") : [])).filter(Boolean).map((l) => [l]),
        tabla: false,
      }];

  for (const h of hojas) {
    const columnas = Math.max(1, ...h.filas.map((f: string[]) => f.length));
    const ws = wb.addWorksheet(h.nombre, { views: h.tabla ? [{ state: "frozen", ySplit: 1 }] : [] });
    h.filas.forEach((fila: string[], i: number) => {
      const r = ws.addRow(Array.from({ length: columnas }, (_, k) => valorDeCelda(fila[k] ?? "", i === 0 && h.tabla)));
      const borde = { style: "thin", color: { argb: "FFC3C8D0" } };
      r.eachCell({ includeEmpty: true }, (c: Lib) => {
        c.border = { top: borde, bottom: borde, left: borde, right: borde };
        c.alignment = { vertical: "top", wrapText: true };
        if (h.tabla && i === 0) {
          c.font = { bold: true, color: { argb: "FFFFFFFF" } };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${AZUL}` } };
        } else if (h.tabla && i % 2 === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GRIS}` } };
      });
    });
    for (let c = 1; c <= columnas; c++) {
      const mayor = Math.max(10, ...h.filas.map((f: string[]) => plano(f[c - 1] ?? "").length + 2));
      ws.getColumn(c).width = Math.min(60, mayor);
    }
    if (h.tabla && h.filas.length > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas } };
    ws.pageSetup = { orientation: columnas > 5 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
