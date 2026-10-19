/* =============================================================================
   Internacionalización · el adaptador del espacio de archivos.

   Traduce lo de Internacionalización a lo que pide components/espacio:
   cada LIBRO es un archivo del explorador (dentro de la carpeta que le puso quien lo creó, 0166);
   cada columna por concepto es una EspColumna; y las reglas de lectura,
   validación, columnas calculadas y datos personales de lib/validacion se
   ofrecen como `Reglas`. Sin React ni red, para probarlo aparte.
   ========================================================================== */

import type { EspColumna, Reglas, Valor } from "../../../components/espacio/tipos";
import { calcular, leerValor, validarDatos } from "../lib/validacion";
import type { Datos, ErrorCelda, IntColumnaRow, IntEnvioRow, LibroCompleto } from "../tipos";
import { enmascarar, textoDe } from "./logica";

/** Una columna del libro como la entiende la hoja: la calculada no se escribe y el concepto va en la ayuda. */
export function columnaEsp(c: IntColumnaRow): EspColumna {
  return {
    clave: c.clave,
    etiqueta: c.etiqueta,
    tipo: c.tipo === "calculado" ? "numero" : c.tipo,
    obligatorio: c.obligatorio,
    opciones: c.opciones,
    solo_lectura: c.tipo === "calculado" ? "calculada" : null,
    ayuda: c.concepto_id ? `Concepto del catálogo: ${c.concepto_id}` : "Campo propio de esta hoja",
  };
}

/**
 * Las reglas de una hoja: cómo se lee lo escrito, qué está mal en cada celda
 * (tipos, listas, obligatorios, fin ≥ inicio), cómo se rellenan las
 * calculadas y que los datos personales se ven ocultos en filas de solo lectura.
 */
export function reglasInt(columnas: readonly IntColumnaRow[], personales: ReadonlySet<string>): Reglas {
  const porClave = new Map(columnas.map((c) => [c.clave, c] as const));
  const cache = new WeakMap<object, ErrorCelda[]>();
  const errores = (datos: Datos): ErrorCelda[] => {
    let e = cache.get(datos);
    if (!e) {
      e = validarDatos(columnas, datos, 1);
      cache.set(datos, e);
    }
    return e;
  };
  return {
    leer: (c, escrito): Valor => {
      const col = porClave.get(c.clave);
      return col ? leerValor(col, escrito).valor : escrito;
    },
    error: (_columnas, datos, c) => errores(datos).find((e) => e.columna === c.clave)?.mensaje ?? "",
    completar: (_columnas, datos) => calcular(columnas, datos),
    textoBloqueado: (c, valor) => (personales.has(c.clave) ? enmascarar(textoDe(valor)) : textoDe(valor)),
  };
}

/* ---------- avance de una tabla ----------------------------------------------------- */

/** Hojas aprobadas sobre hojas × campus que se ven: «3 de 8 aprobadas». */
export function avanceLibro(libro: Pick<LibroCompleto, "hojas">, envios: readonly Pick<IntEnvioRow, "hoja_id" | "campus_id" | "estado">[], campusVisibles: readonly string[]): { aprobadas: number; total: number } {
  const ids = new Set(libro.hojas.map((h) => h.id));
  const vistos = new Set(campusVisibles);
  return {
    total: libro.hojas.length * campusVisibles.length,
    aprobadas: envios.filter((e) => e.estado === "aprobado" && ids.has(e.hoja_id) && vistos.has(e.campus_id)).length,
  };
}

/**
 * Multicampus (0166): cada campus envía su parte y la tabla queda aprobada cuando lo están todos
 * los que aportan. Aportan los campus que tienen un envío en alguna de sus hojas; los que nunca
 * enviaron no cuentan (no hay forma de saber si les toca). Sin ningún envío: 0 de 0.
 */
export function avanceMulticampus(libro: Pick<LibroCompleto, "hojas">, envios: readonly Pick<IntEnvioRow, "hoja_id" | "campus_id" | "estado">[]): { aprobadas: number; total: number } {
  const ids = new Set(libro.hojas.map((h) => h.id));
  const propios = envios.filter((e) => ids.has(e.hoja_id));
  return { total: propios.length, aprobadas: propios.filter((e) => e.estado === "aprobado").length };
}

/** El avance de una tabla en las tarjetas y el resumen, según cómo se captura. */
export function avanceDeLibro(
  libro: Pick<LibroCompleto, "hojas" | "captura">,
  envios: readonly Pick<IntEnvioRow, "hoja_id" | "campus_id" | "estado">[],
  campusVisibles: readonly string[],
): { aprobadas: number; total: number } {
  return libro.captura === "multicampus" ? avanceMulticampus(libro, envios) : avanceLibro(libro, envios, campusVisibles);
}
