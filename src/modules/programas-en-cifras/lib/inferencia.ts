/* =============================================================================
   Programas en Cifras · armar un archivo desde un Excel.

   «Subir plantilla»: una matriz (la primera hoja del Excel, ya leída en el
   navegador) se vuelve columnas con tipo y filas. Es pura: no lee archivos.
   Quien lee el Excel (ExcelJS o read-excel-file) entrega una matriz de celdas
   crudas: texto, número o Date.

   Reglas de inferencia (las del prototipo aprobado):
     · una columna cuyo nombre habla de códigos, cédulas, documentos, NIT o
       teléfonos es TEXTO (los ceros a la izquierda no se pierden);
     · todo fechas → fecha; todo números → número (porcentaje si el nombre
       lo dice y van de 0 a 100);
     · pocos valores distintos y repetidos (≥ 5 filas, ≤ 6 valores, menos del
       70 % distintos) → lista con esos valores;
     · si no, texto.
   ========================================================================== */

import { normalizar } from "../../internacionalizacion/lib/conceptos";
import type { Columna, Datos, ErrorCelda, PcTipo } from "../tipos";
import { leerFila, vacio } from "./validacion";

/** El texto de una celda cruda; una fecha de Excel se vuelve «AAAA-MM-DD». */
export function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).trim();
}

const ES_FECHA = /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/;
const ES_NUMERO = /^-?\d+([.,]\d+)?$/;
const PIDE_TEXTO = /(codigo|cedula|documento|nit|telefono|celular)/;

export interface Inferido {
  tipo: PcTipo;
  opciones: string[];
}

/** El tipo que mejor describe una columna del Excel, por su nombre y sus valores. */
export function inferirTipo(etiqueta: string, valores: readonly unknown[]): Inferido {
  const v = valores.filter((x) => !vacio(x));
  if (!v.length) return { tipo: "texto", opciones: [] };
  const nombre = normalizar(etiqueta);
  if (PIDE_TEXTO.test(nombre)) return { tipo: "texto", opciones: [] };
  const textos = v.map(textoDeCelda);
  if (v.every((x, i) => x instanceof Date || (typeof x !== "number" && ES_FECHA.test(textos[i])))) return { tipo: "fecha", opciones: [] };
  if (textos.every((t) => ES_NUMERO.test(t))) {
    const ns = textos.map((t) => parseFloat(t.replace(",", ".")));
    if (/(porcentaje|%)/.test(`${nombre} ${etiqueta}`) && ns.every((n) => n >= 0 && n <= 100)) return { tipo: "porcentaje", opciones: [] };
    return { tipo: "numero", opciones: [] };
  }
  const unicos = [...new Set(textos)];
  if (textos.length >= 5 && unicos.length <= 6 && unicos.length < textos.length * 0.7 && textos.every((t) => t.length < 40)) return { tipo: "lista", opciones: unicos };
  return { tipo: "texto", opciones: [] };
}

/** Clave de columna a partir de su encabezado, única entre `usadas`: «Nº de créditos» → «n_de_creditos». */
export function claveDeEncabezado(encabezado: string, usadas: Iterable<string> = []): string {
  const tomadas = new Set(usadas);
  let base = normalizar(encabezado).replace(/ /g, "_").slice(0, 56) || "columna";
  if (!/^[a-z]/.test(base)) base = `c_${base}`;
  let clave = base;
  for (let i = 2; tomadas.has(clave); i++) clave = `${base}_${i}`;
  return clave;
}

/** La fila de encabezados: la de más celdas con texto entre las 15 primeras (la primera si empatan). */
export function filaDeEncabezado(matriz: readonly (readonly unknown[])[]): number {
  let mejor = 0;
  let cuenta = -1;
  matriz.slice(0, 15).forEach((fila, i) => {
    const n = fila.filter((c) => !vacio(c)).length;
    if (n > cuenta) {
      cuenta = n;
      mejor = i;
    }
  });
  return mejor;
}

export interface ArchivoDesdeMatriz {
  columnas: (Columna & { orden: number })[];
  /** Filas ya tipadas, con las claves de `columnas`. */
  filas: Datos[];
  /** Errores de lectura de las celdas (fila = número de fila del archivo de origen, 1 = primera). */
  errores: ErrorCelda[];
  /** Fila (desde 0) de la matriz donde estaban los encabezados. */
  encabezado: number;
}

/**
 * Columnas con tipo y filas tipadas desde la matriz de una hoja. Los
 * encabezados vacíos se ignoran, y las filas completamente vacías también.
 */
export function columnasDesdeMatriz(matriz: readonly (readonly unknown[])[]): ArchivoDesdeMatriz {
  const h = filaDeEncabezado(matriz);
  const encabezados = (matriz[h] ?? []).map(textoDeCelda);
  const cuerpo = matriz.slice(h + 1).filter((f) => f.some((c) => !vacio(c)));
  const usadas: string[] = [];
  const columnas: (Columna & { orden: number })[] = [];
  const indices: number[] = [];
  encabezados.forEach((etiqueta, i) => {
    if (!etiqueta) return;
    const clave = claveDeEncabezado(etiqueta, usadas);
    usadas.push(clave);
    const inf = inferirTipo(etiqueta, cuerpo.map((f) => f[i]));
    columnas.push({ clave, etiqueta, tipo: inf.tipo, obligatorio: false, opciones: inf.opciones, orden: columnas.length + 1 });
    indices.push(i);
  });
  const filas: Datos[] = [];
  const errores: ErrorCelda[] = [];
  cuerpo.forEach((f, n) => {
    const cruda: Record<string, unknown> = {};
    columnas.forEach((c, k) => {
      cruda[c.clave] = textoDeCelda(f[indices[k]]);
    });
    const { datos, errores: e } = leerFila(columnas, cruda);
    filas.push(datos);
    for (const x of e) errores.push({ ...x, fila: h + 2 + n });
  });
  return { columnas, filas, errores, encabezado: h };
}

/** Amplía las opciones de una columna de lista con los valores nuevos que aparezcan (sin repetir). */
export function ampliarOpciones(opciones: readonly string[], valores: readonly unknown[]): string[] {
  const salida = [...opciones];
  for (const v of valores) {
    const t = textoDeCelda(v);
    if (t && !salida.includes(t)) salida.push(t);
  }
  return salida;
}
