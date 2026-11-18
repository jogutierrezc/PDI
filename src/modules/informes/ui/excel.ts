/* Excel del navegador para el informe: plantillas que se descargan y libros que se leen.
   exceljs se carga solo al usarlo, para no pesar en el resto de la aplicación. */

import { downloadBlob } from "../../admin/traslado/transfer";

/** Cómo se diligencia una celda del libro del informe: azul claro, amarillo (obligatoria) o gris (la pone el sistema). */
export type TipoCelda = "diligenciar" | "obligatoria" | "bloqueada";

export interface HojaExcel {
  nombre: string;
  columnas: { titulo: string; ancho?: number }[];
  filas: (string | number | null)[][];
  /** Texto de ayuda sobre la tabla (no se lee al importar). */
  ayuda?: string;
  /**
   * Listas desplegables por columna (índice desde 0). Una lista de textos va escrita en la celda (cabe en 255
   * caracteres); `{ rango }` apunta a una columna de otra hoja («Criterios!$A$2:$A$9»), sin ese límite, y deja
   * escribir un valor que no está en la lista.
   */
  listas?: Record<number, string[] | { rango: string }>;
  /**
   * Banda de título sobre la tabla (el libro del informe): tres filas con el logo si se pasa en las opciones.
   * El encabezado queda en la fila 4 y los datos desde la 5. Sin banda, el encabezado es la fila 1.
   */
  banner?: { titulo: string; subtitulo?: string; ayuda?: string };
  /** La hoja no se ve (listas y control), pero está en el libro. */
  oculta?: boolean;
  /** Color por columna: diligenciar, obligatoria o bloqueada. Sin esto, las celdas no llevan color. */
  tipos?: TipoCelda[];
  /** Color de una celda puntual (fila de `filas` desde 0, columna desde 0); manda sobre `tipos`. */
  celdas?: { fila: number; columna: number; tipo: TipoCelda }[];
  /** Filas con color y lista bajo los datos (de esta hoja); manda sobre `OpcionesLibro.filasLibres`. */
  filasLibres?: number;
  /** Protege la hoja (sin contraseña): solo se pueden escribir las celdas que no son «bloqueada». */
  proteger?: boolean;
}

export interface OpcionesLibro {
  /** Logo PNG en base64 (sin prefijo): va en la banda de las hojas que la tienen. */
  logo?: string;
  /** Filas con color y lista desplegable bajo los datos en las hojas con `tipos`. Por defecto 30. */
  filasLibres?: number;
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Azul institucional de la banda y colores de las celdas del libro del informe. */
export const COLORES_LIBRO = {
  azul: "FF014898",
  azulSuave: "FF1F5FAE",
  diligenciar: "FFE6F0FB",
  obligatoria: "FFFFF1B8",
  bloqueada: "FFE3E6EA",
  textoBloqueado: "FF5B6573",
} as const;

/** Ancho y alto de un PNG en base64 (de su cabecera); nulo si no lo es. */
function medidasPng(base64: string): { ancho: number; alto: number } | null {
  try {
    const bin = atob(base64.slice(0, 48));
    if (bin.slice(1, 4) !== "PNG") return null;
    const n = (i: number) => (bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16) | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
    const ancho = n(16);
    const alto = n(20);
    return ancho > 0 && alto > 0 ? { ancho, alto } : null;
  } catch {
    return null;
  }
}

/** Arma el libro en memoria (sin descargarlo). Sirve a `descargarLibro` y a las pruebas. */
export async function construirLibro(hojas: HojaExcel[], opciones: OpcionesLibro = {}): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const logoId = opciones.logo ? libro.addImage({ base64: opciones.logo, extension: "png" }) : null;
  const medidas = opciones.logo ? medidasPng(opciones.logo) : null;
  for (const h of hojas) {
    const hoja = libro.addWorksheet(h.nombre, h.oculta ? { state: "hidden" } : undefined);
    const nCol = h.columnas.length;
    const banda = h.banner ?? null;
    const filaCab = banda ? 4 : 1;
    const primera = filaCab + 1;
    if (banda) {
      hoja.columns = h.columnas.map((c) => ({ width: c.ancho ?? 22 }));
      const relleno = (n: number, argb: string) => {
        for (let c = 1; c <= Math.max(nCol, 1); c++) hoja.getCell(n, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      };
      relleno(1, COLORES_LIBRO.azul);
      relleno(2, COLORES_LIBRO.azul);
      hoja.getRow(1).height = 40;
      hoja.getRow(2).height = 20;
      hoja.getCell(1, 1).value = banda.titulo;
      hoja.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      hoja.getCell(1, 1).alignment = { vertical: "middle", indent: logoId !== null ? 18 : 1 };
      hoja.getCell(2, 1).value = banda.subtitulo ?? "";
      hoja.getCell(2, 1).font = { size: 11, color: { argb: "FFDCE8F8" } };
      hoja.getCell(2, 1).alignment = { vertical: "middle", indent: logoId !== null ? 18 : 1 };
      hoja.getCell(3, 1).value = banda.ayuda ?? "";
      hoja.getCell(3, 1).font = { italic: true, size: 10, color: { argb: "FF3A4656" } };
      hoja.getCell(3, 1).alignment = { vertical: "top", wrapText: true };
      hoja.getRow(3).height = banda.ayuda ? Math.min(90, 16 + 14 * Math.ceil(banda.ayuda.length / Math.max(60, nCol * 22))) : 6;
      if (nCol > 1) for (const f of [1, 2, 3]) hoja.mergeCells(f, 1, f, nCol);
      if (logoId !== null) {
        const alto = 34;
        const ancho = medidas ? Math.round((alto * medidas.ancho) / medidas.alto) : 95;
        hoja.addImage(logoId, { tl: { col: 0.08, row: 0.1 }, ext: { width: ancho, height: alto } });
      }
      h.columnas.forEach((c, i) => {
        const cel = hoja.getCell(filaCab, i + 1);
        cel.value = c.titulo;
        cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORES_LIBRO.azulSuave } };
        cel.alignment = { vertical: "middle", wrapText: true };
        cel.protection = { locked: true };
      });
      hoja.getRow(filaCab).height = 30;
    } else {
      hoja.columns = h.columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? 22 }));
      const cab = hoja.getRow(1);
      cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A4A" } };
      cab.alignment = { vertical: "middle", wrapText: true };
    }
    h.filas.forEach((f, i) => {
      const fila = hoja.getRow(primera + i);
      f.forEach((v, c) => {
        fila.getCell(c + 1).value = v;
      });
    });
    const conTipos = Boolean(h.tipos?.length || h.celdas?.length);
    const libres = h.filasLibres ?? opciones.filasLibres ?? 30;
    const total = h.tipos?.length ? h.filas.length + libres : h.filas.length;
    if (conTipos) {
      const tipoDe = (fila: number, col: number): TipoCelda | undefined => h.celdas?.find((x) => x.fila === fila && x.columna === col)?.tipo ?? h.tipos?.[col];
      for (let i = 0; i < Math.max(total, h.filas.length); i++) {
        for (let c = 0; c < nCol; c++) {
          const tipo = tipoDe(i, c);
          if (!tipo) continue;
          // Una columna bloqueada solo se pinta donde hay datos; las libres se pintan también debajo.
          if (tipo === "bloqueada" && i >= h.filas.length) continue;
          const cel = hoja.getCell(primera + i, c + 1);
          cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORES_LIBRO[tipo] } };
          cel.alignment = { vertical: "top", wrapText: true };
          if (tipo === "bloqueada") cel.font = { color: { argb: COLORES_LIBRO.textoBloqueado } };
          if (h.proteger) cel.protection = { locked: tipo === "bloqueada" };
        }
      }
    }
    hoja.views = [{ state: "frozen", ySplit: filaCab }];
    for (const [col, lista] of Object.entries(h.listas ?? {})) {
      const porRango = !Array.isArray(lista);
      const texto = porRango ? lista.rango : `"${lista.join(",")}"`;
      if (!porRango && texto.length > 255) continue;
      for (let r = primera; r <= Math.max(primera + 58, primera + Math.max(total, h.filas.length) - 1); r++) {
        hoja.getCell(r, Number(col) + 1).dataValidation = { type: "list", allowBlank: true, formulae: [texto], ...(porRango ? { showErrorMessage: false } : {}) };
      }
    }
    if (h.proteger) {
      // Sin contraseña: quien la necesite la quita desde Revisar. Las celdas azules y amarillas siguen escribibles.
      await hoja.protect("", {});
    }
    if (h.ayuda) {
      const nota = libro.addWorksheet(`Cómo llenar ${h.nombre}`.slice(0, 31));
      nota.getColumn(1).width = 110;
      for (const linea of h.ayuda.split("\n")) nota.addRow([linea]).alignment = { wrapText: true, vertical: "top" };
    }
  }
  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function descargarLibro(archivo: string, hojas: HojaExcel[], opciones: OpcionesLibro = {}): Promise<void> {
  const buffer = await construirLibro(hojas, opciones);
  downloadBlob(new Blob([buffer], { type: XLSX }), archivo);
}

/** El valor visible de una celda de exceljs (texto, número, fecha, fórmula o texto con formato). */
function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return textoDeCelda(o.result);
    if (o.text !== undefined) return textoDeCelda(o.text);
    if (o.hyperlink) return o.hyperlink;
  }
  return "";
}

/** Lee la hoja indicada (por nombre; si no está, la primera) como filas de texto. */
export async function leerHoja(archivo: File, nombre: string): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.getWorksheet(nombre) ?? libro.worksheets[0];
  if (!hoja) return [];
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, (c, n) => {
      celdas[n - 1] = textoDeCelda(c.value);
    });
    filas.push(Array.from(celdas, (c) => c ?? ""));
  });
  return filas;
}

/** Los nombres de las hojas de un .xlsx. */
export async function nombresDeHojas(archivo: File): Promise<string[]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  return libro.worksheets.map((h) => h.name);
}

/** La hoja con sus posiciones (las filas y columnas vacías se conservan, para leer un rango tipo «B2:E20»). Tope: 2000 filas y 60 columnas. */
export async function leerHojaPosicional(archivo: File, nombre: string): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.getWorksheet(nombre) ?? libro.worksheets[0];
  if (!hoja) return [];
  const filas: string[][] = [];
  const nf = Math.min(hoja.rowCount, 2000);
  const nc = Math.min(hoja.columnCount, 60);
  for (let i = 1; i <= nf; i++) {
    const fila = hoja.getRow(i);
    filas.push(Array.from({ length: nc }, (_, j) => textoDeCelda(fila.getCell(j + 1).value)));
  }
  return filas;
}

/** Una hoja leída tal como viene en el archivo: todas sus filas de texto, con su nombre y si está oculta. */
export interface HojaLeida {
  nombre: string;
  oculta: boolean;
  filas: string[][];
}

/**
 * Lee todas las hojas de un libro (en memoria o en un archivo): visibles y ocultas, en orden. Las celdas
 * combinadas dejan su texto solo en la primera (una banda de título combinada es una sola celda con texto).
 * Tope: 2000 filas y 60 columnas por hoja.
 */
export async function leerLibroCompleto(origen: File | ArrayBuffer | Uint8Array): Promise<HojaLeida[]> {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load("arrayBuffer" in origen && typeof origen.arrayBuffer === "function" ? await origen.arrayBuffer() : (origen as ArrayBuffer));
  return libro.worksheets.map((hoja) => {
    const filas: string[][] = [];
    const nf = Math.min(hoja.rowCount, 2000);
    const nc = Math.min(hoja.columnCount, 60);
    for (let i = 1; i <= nf; i++) {
      const fila = hoja.getRow(i);
      filas.push(
        Array.from({ length: nc }, (_, j) => {
          const c = fila.getCell(j + 1);
          return c.type === ExcelJS.ValueType.Merge && c.master !== c ? "" : textoDeCelda(c.value);
        }),
      );
    }
    return { nombre: hoja.name, oculta: hoja.state !== "visible", filas };
  });
}
