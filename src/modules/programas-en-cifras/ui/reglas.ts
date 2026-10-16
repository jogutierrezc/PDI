/* Programas en Cifras · cómo se lee y se valida una celda (lib/validacion) para la hoja compartida. */

import type { Reglas } from "../../../components/espacio/tipos";
import { errorDeCelda, leerValor } from "../lib/validacion";
import type { Columna } from "../tipos";

// Las columnas que llegan a la hoja son las de la base (PcColumnaRow): llevan también `posterior_a` y `personal`.
export const reglasPc: Reglas = {
  leer: (c, escrito) => leerValor(c as Columna, escrito).valor,
  error: (columnas, datos, c) => errorDeCelda(columnas as readonly Columna[], datos, c as Columna),
};
