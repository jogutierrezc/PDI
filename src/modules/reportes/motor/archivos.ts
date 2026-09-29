/* =============================================================================
   Reportes Institucionales · archivos: leer, importar, exportar, descargar.

   Todo corre en el navegador: los microdatos no salen del equipo. exceljs se
   carga con import dinámico (como en el resto del repo) para no inflar el
   paquete inicial.
   ========================================================================== */

import type { Campo, Contexto, Fila, PeriodoCodigo, PlantillaSpec, ResultadoImportacion } from "../tipos";
import { canonizar, resolver } from "./nombres";
import { documento, encabezado, vacio } from "./texto";

/* ---------- leer ---------- */

const dos = (n: number) => String(n).padStart(2, "0");

/** Valor de una celda de exceljs → texto. Fechas → dd/mm/aaaa; enteros sin «.0». */
export function celdaATexto(valor: unknown): string {
  if (valor == null) return "";
  if (valor instanceof Date) {
    // exceljs entrega las fechas en UTC (medianoche del día de la hoja).
    if (Number.isNaN(valor.getTime())) return "";
    return `${dos(valor.getUTCDate())}/${dos(valor.getUTCMonth() + 1)}/${valor.getUTCFullYear()}`;
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    if (Number.isInteger(valor)) return Math.abs(valor) < 1e21 ? valor.toFixed(0) : String(valor);
    // Quita el ruido de coma flotante (0.1+0.2) sin perder decimales reales.
    return String(Number(valor.toPrecision(15)));
  }
  if (typeof valor === "boolean") return valor ? "VERDADERO" : "FALSO";
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    if ("result" in o) return celdaATexto(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((p) => p.text).join("");
    if ("text" in o) return celdaATexto(o.text);
    if ("error" in o) return "";
    return "";
  }
  return String(valor).trim();
}

/** CSV → matriz. Detecta «;» o «,» en la primera línea (fuera de comillas) y respeta comillas y "" escapadas. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  let pc = 0;
  let comas = 0;
  let dentro = false;
  for (const ch of t) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro && (ch === "\n" || ch === "\r")) break;
    else if (!dentro && ch === ";") pc++;
    else if (!dentro && ch === ",") comas++;
  }
  const sep = pc >= comas && pc > 0 ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else comillas = false;
      } else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.map((f) => f.map((c) => c.trim()));
}

/** Excel (.xlsx) o CSV (; o ,) → matriz de texto. Lee la primera hoja. */
export async function leerArchivo(archivo: File): Promise<string[][]> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) return leerCsv(await archivo.text());
  if (!nombre.endsWith(".xlsx")) throw new Error("El archivo tiene que ser un Excel (.xlsx) o un CSV.");

  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  const matriz: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (row, n) => {
    const valores: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      valores[col - 1] = celdaATexto(cell.value);
    });
    matriz[n - 1] = Array.from(valores, (v) => v ?? "");
  });
  return Array.from(matriz, (f) => f ?? []);
}

/* ---------- importar ---------- */

const filaVacia = (f: string[] | undefined) => !f || f.every((c) => vacio(c));

export function importar(spec: PlantillaSpec, matriz: string[][], ctx: Contexto): ResultadoImportacion {
  const inicio = matriz.findIndex((f) => !filaVacia(f));
  if (inicio < 0) {
    return { filas: [], reconocidas: [], faltantes: spec.campos.filter((c) => c.obligatorio).map((c) => c.codigo), ignoradas: [], convertidos: 0 };
  }

  // Encabezado normalizado → campo (código y alias).
  const porEncabezado = new Map<string, Campo>();
  for (const campo of spec.campos) {
    for (const nombre of [campo.codigo, ...(campo.alias ?? [])]) {
      const clave = encabezado(nombre);
      if (!porEncabezado.has(clave)) porEncabezado.set(clave, campo);
    }
  }

  const columnas: { indice: number; campo: Campo }[] = [];
  const reconocidas: string[] = [];
  const ignoradas: string[] = [];
  matriz[inicio].forEach((titulo, indice) => {
    if (vacio(titulo)) return;
    const campo = porEncabezado.get(encabezado(titulo));
    if (!campo || reconocidas.includes(campo.codigo)) {
      ignoradas.push(String(titulo).trim());
      return;
    }
    reconocidas.push(campo.codigo);
    columnas.push({ indice, campo });
  });

  let convertidos = 0;
  const filas: Fila[] = [];
  for (const cruda of matriz.slice(inicio + 1)) {
    if (filaVacia(cruda)) continue;
    const fila: Fila = Object.fromEntries(spec.campos.map((c) => [c.codigo, ""]));
    for (const { indice, campo } of columnas) {
      const valor = String(cruda[indice] ?? "").trim();
      const canon = canonizar(campo, valor, ctx);
      if (canon !== valor) convertidos++;
      fila[campo.codigo] = canon;
    }
    filas.push(fila);
  }

  const faltantes = spec.campos.filter((c) => c.obligatorio && !reconocidas.includes(c.codigo)).map((c) => c.codigo);
  return { filas, reconocidas, faltantes, ignoradas, convertidos };
}

/* ---------- exportar ---------- */

/** Filas con códigos, en el orden de la plantilla, con encabezado. Lo que no resuelve sale tal cual. */
export function exportar(spec: PlantillaSpec, filas: Fila[], ctx: Contexto): string[][] {
  const cabeza = spec.campos.map((c) => c.codigo);
  const cuerpo = filas.map((fila) =>
    spec.campos.map((campo) => {
      const v = String(fila[campo.codigo] ?? "").trim();
      if (v === "") return "";
      if (campo.fuente) return resolver(campo.fuente, v, ctx)?.codigo ?? v;
      if (campo.formato === "documento") return documento(v);
      return v;
    }),
  );
  return [cabeza, ...cuerpo];
}

/* ---------- descargar ---------- */

/** Nombre de hoja válido para Excel: sin []:*?/\ y máximo 31 caracteres. */
const nombreHoja = (t: string) => t.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Plantilla";

/** Nombre de archivo sin tildes ni caracteres raros: «Primer curso» → «Primer_curso». */
const nombreArchivo = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");

export async function descargarXlsx(spec: PlantillaSpec, periodo: PeriodoCodigo, filas: Fila[], ctx: Contexto): Promise<void> {
  const matriz = exportar(spec, filas, ctx);
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja(spec.nombre));
  // Todo va como texto: los códigos («05001») y documentos no pierden ceros.
  for (const fila of matriz) hoja.addRow(fila);
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((col, i) => {
    col.numFmt = "@";
    col.width = spec.campos[i]?.ancho ? 40 : Math.max(12, (spec.campos[i]?.codigo.length ?? 10) + 2);
  });
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo(spec.nombre)}_${periodo}.xlsx`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
