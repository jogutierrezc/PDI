/* =============================================================================
   Pregúntele a Pilo · las plantillas del catálogo en Excel.

   Escribe public/plantillas/pilo/pilo-respuestas.xlsx y pilo-capciosas.xlsx
   con la misma definición que usa la intranet (catalog-sheet.ts), así el
   archivo del repositorio y el que se descarga desde la intranet son iguales.

   Ejecutar con: node scripts/pilo-catalogo-plantillas.mjs
   ========================================================================== */

import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { fillCatalogTemplate } from "../src/modules/admin/pilo/catalog-sheet.ts";

const out = "public/plantillas/pilo";
mkdirSync(out, { recursive: true });
for (const [kind, file] of [
  ["respuesta", "pilo-respuestas.xlsx"],
  ["capciosa", "pilo-capciosas.xlsx"],
]) {
  const book = new ExcelJS.Workbook();
  book.creator = "Planeación Institucional · UDES";
  fillCatalogTemplate(book, kind);
  await book.xlsx.writeFile(`${out}/${file}`);
  console.log(`${out}/${file}`);
}
