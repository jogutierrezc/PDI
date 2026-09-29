/* =============================================================================
   Reportes Institucionales · el motor (Diego).

   Implementa `Motor` y `Ayudas` de ../tipos. Las pantallas usan `motor`; las
   reglas de cada plantilla reciben `ayudas`.
   ========================================================================== */

import type { Motor } from "../tipos";
import { descargarXlsx, exportar, importar, leerArchivo } from "./archivos";
import { canonizar, etiqueta, opciones } from "./nombres";
import { validarCeldas, validarPlantilla } from "./validar";

export { ayudas } from "./validar";
export { normalizar, vacio, documento } from "./texto";

export const motor: Motor = {
  etiqueta,
  opciones,
  canonizar,
  validarCeldas,
  validarPlantilla,
  leerArchivo,
  importar,
  exportar,
  descargarXlsx,
};
