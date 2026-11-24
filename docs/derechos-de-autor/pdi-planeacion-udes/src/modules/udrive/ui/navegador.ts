/* =============================================================================
   UDrive · lo que necesita el navegador: comprimir imágenes antes de subirlas,
   bajar un archivo y exportar una tabla a Excel o CSV.

   La lógica que se puede probar sin navegador está en lib/ (imagen.ts, tabla.ts).
   ========================================================================== */

import type { TablaDatos } from "../tipos";
import { dimensionesComprimidas, conviene, esImagenComprimible, formatoDeSalida } from "../lib/imagen";
import { aCsv, matrizParaExportar } from "../lib/tabla";
import { limpiarNombre } from "../lib/nombres";

/**
 * Las fotos grandes se reducen a 2000 px de lado antes de subirlas (canvas).
 * Si algo falla, o la comprimida no pesa menos, se sube la original: nunca se
 * pierde un archivo por comprimirlo.
 */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!esImagenComprimible(archivo.type) || typeof createImageBitmap !== "function") return archivo;
  try {
    const mapa = await createImageBitmap(archivo);
    const d = dimensionesComprimidas(mapa.width, mapa.height);
    const sale = formatoDeSalida(archivo.type);
    // Una foto que ya cabe solo se recomprime si pesa mucho; así no se degrada una imagen pequeña.
    if (!d.cambia && archivo.size < 1.5 * 1024 * 1024) {
      mapa.close();
      return archivo;
    }
    const lienzo = document.createElement("canvas");
    lienzo.width = d.ancho;
    lienzo.height = d.alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) {
      mapa.close();
      return archivo;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mapa, 0, 0, d.ancho, d.alto);
    mapa.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, sale.mime, sale.calidad));
    if (!blob || !conviene(archivo.size, blob.size)) return archivo;
    const base = archivo.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}${sale.extension}`, { type: sale.mime, lastModified: archivo.lastModified });
  } catch {
    return archivo;
  }
}

/** Baja un archivo desde la memoria. */
export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = limpiarNombre(nombre) || "archivo";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Una tabla a .xlsx con ExcelJS (se carga solo cuando se pide): encabezado en negrita, números como números. */
export async function exportarExcel(t: TablaDatos, nombre: string) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(limpiarNombre(nombre, 31).replace(/[[\]*?:]/g, "") || "Tabla");
  const matriz = matrizParaExportar(t);
  hoja.addRows(matriz);
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  t.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    const ancho = Math.max(c.etiqueta.length, ...t.filas.slice(0, 200).map((f) => String(f.datos[c.clave] ?? "").length));
    col.width = Math.min(48, Math.max(10, ancho + 2));
    if (c.tipo === "porcentaje") col.numFmt = '0.0"%"';
    else if (c.tipo === "numero") col.numFmt = "#,##0.##";
  });
  const bytes = await libro.xlsx.writeBuffer();
  descargarBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${limpiarNombre(nombre) || "Tabla"}.xlsx`);
}

export function exportarCsv(t: TablaDatos, nombre: string) {
  descargarBlob(new Blob([aCsv(t)], { type: "text/csv;charset=utf-8" }), `${limpiarNombre(nombre) || "Tabla"}.csv`);
}
