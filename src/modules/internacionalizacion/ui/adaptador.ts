/* =============================================================================
   Internacionalización · el adaptador del espacio de archivos.

   Traduce lo de Internacionalización a lo que pide components/espacio:
   cada LIBRO es un archivo del explorador, agrupado por la clase de sus hojas;
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

/* ---------- carpetas: la clase de las hojas -------------------------------------- */

export type CarpetaId = "movilidad" | "convenio" | "general" | "varias";

export const CARPETAS_INT: { id: CarpetaId; nombre: string; subtitulo: string }[] = [
  { id: "movilidad", nombre: "Movilidad", subtitulo: "Entrantes y salientes" },
  { id: "convenio", nombre: "Convenios", subtitulo: "Convenios con otras instituciones" },
  { id: "general", nombre: "General", subtitulo: "Otras tablas del repositorio" },
  { id: "varias", nombre: "Varias clases", subtitulo: "Tablas con hojas de distinta clase" },
];

/** La carpeta de un libro: la clase de sus hojas, o «varias» si mezcla; sin hojas, general. */
export function carpetaDeLibro(libro: Pick<LibroCompleto, "hojas">): CarpetaId {
  const clases = new Set(libro.hojas.map((h) => h.clase));
  if (clases.size === 0) return "general";
  return clases.size === 1 ? [...clases][0] : "varias";
}

/** Hojas aprobadas sobre hojas × campus que se ven: «3 de 8 aprobadas». */
export function avanceLibro(libro: Pick<LibroCompleto, "hojas">, envios: readonly Pick<IntEnvioRow, "hoja_id" | "campus_id" | "estado">[], campusVisibles: readonly string[]): { aprobadas: number; total: number } {
  const ids = new Set(libro.hojas.map((h) => h.id));
  const vistos = new Set(campusVisibles);
  return {
    total: libro.hojas.length * campusVisibles.length,
    aprobadas: envios.filter((e) => e.estado === "aprobado" && ids.has(e.hoja_id) && vistos.has(e.campus_id)).length,
  };
}
