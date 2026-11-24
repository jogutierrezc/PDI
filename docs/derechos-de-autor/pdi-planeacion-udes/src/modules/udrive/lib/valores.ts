/* =============================================================================
   UDrive · leer y validar los valores de una tabla.

   Una celda se escribe como en Excel en español: «1.234,5» es mil doscientos
   treinta y cuatro coma cinco. Un borrador conserva lo escrito aunque tenga
   errores (la celda se pinta en rojo con el motivo). Las reglas de cada columna
   son su tipo, mínimo y máximo, y si es obligatoria.
   ========================================================================== */

import { aFechaIso } from "../../internacionalizacion/lib/validacion";
import { normalizar } from "../../internacionalizacion/lib/conceptos";
import type { ColumnaUd, TablaDatos, TipoColumna, Valor } from "../tipos";

export const ETIQUETA_TIPO: Record<TipoColumna, string> = {
  texto: "Texto",
  numero: "Número",
  porcentaje: "Porcentaje",
  fecha: "Fecha",
  lista: "Lista",
};

/** Máximo de caracteres de una celda de texto. */
export const MAX_TEXTO = 4000;

export const vacio = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === "";

/** Un número escrito en español, con o sin miles: «1.234,5», «1234,5», «12.345», «3.5», «-2». Nulo si no lo es. */
export function aNumeroEs(crudo: unknown): number | null {
  if (typeof crudo === "number") return Number.isFinite(crudo) ? crudo : null;
  const t = String(crudo ?? "").replace(/\s|%/g, "");
  if (!t) return null;
  let normal = t;
  if (t.includes(",")) {
    // Coma decimal: los puntos son de miles.
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // «12.345» sin coma: punto de miles.
    normal = t.replace(/\./g, "");
  } else if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return null;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Cómo se muestra un número: coma decimal, sin separador de miles (se edita igual que se ve). */
export const textoNumero = (n: number): string => String(n).replace(".", ",");

export interface Lectura {
  valor: Valor;
  /** Qué está mal al leer, en español; ausente si se leyó bien. */
  error?: string;
}

/** Lleva lo escrito (o pegado, o importado) al valor que se guarda según el tipo de la columna. */
export function leerValor(c: Pick<ColumnaUd, "tipo" | "opciones" | "etiqueta">, crudo: unknown): Lectura {
  if (vacio(crudo)) return { valor: null };
  const texto = crudo instanceof Date ? (aFechaIso(crudo) ?? "") : String(crudo).trim();
  switch (c.tipo) {
    case "numero":
    case "porcentaje": {
      const n = aNumeroEs(crudo);
      return n === null ? { valor: texto, error: `«${texto}» no es un número para «${c.etiqueta}».` } : { valor: n };
    }
    case "fecha": {
      const f = aFechaIso(crudo);
      return f === null ? { valor: texto, error: `«${texto}» no es una fecha para «${c.etiqueta}». Use AAAA-MM-DD.` } : { valor: f };
    }
    case "lista": {
      if (!c.opciones.length) return { valor: texto };
      const v = normalizar(texto);
      const o = c.opciones.find((x) => normalizar(x) === v);
      return o === undefined ? { valor: texto, error: `«${texto}» no es una opción de «${c.etiqueta}».` } : { valor: o };
    }
    case "texto":
      return { valor: texto.slice(0, MAX_TEXTO) };
  }
}

const esc = (n: number) => String(n).replace(".", ",");

/** Lo que está mal en una celda, o «» si está bien. Mismos textos que el diseño aprobado. */
export function errorDeCelda(c: ColumnaUd, valor: unknown): string {
  if (vacio(valor)) return c.obligatorio ? "Obligatorio" : "";
  switch (c.tipo) {
    case "numero":
    case "porcentaje": {
      const n = aNumeroEs(valor);
      if (n === null) return "Escriba un número";
      const min = c.tipo === "porcentaje" ? Math.max(c.min ?? 0, 0) : c.min;
      const max = c.tipo === "porcentaje" ? Math.min(c.max ?? 100, 100) : c.max;
      if (min !== null && n < min) return `${esc(n)} es menor que el mínimo, ${esc(min)}`;
      if (max !== null && n > max) return `${esc(n)} pasa del máximo, ${esc(max)}`;
      return "";
    }
    case "fecha":
      return aFechaIso(valor) === String(valor).trim() ? "" : "Use AAAA-MM-DD";
    case "lista":
      return !c.opciones.length || c.opciones.includes(String(valor)) ? "" : "Elija de la lista";
    case "texto":
      return String(valor).length > MAX_TEXTO ? `Máximo ${MAX_TEXTO} caracteres` : "";
  }
}

export interface ErrorDeTabla {
  fila: number;
  clave: string;
  etiqueta: string;
  mensaje: string;
}

/** Todos los errores de una tabla; `fila` empieza en 1. */
export function erroresDeTabla(t: TablaDatos): ErrorDeTabla[] {
  const salida: ErrorDeTabla[] = [];
  t.filas.forEach((f, i) => {
    for (const c of t.columnas) {
      const m = errorDeCelda(c, f.datos[c.clave]);
      if (m) salida.push({ fila: i + 1, clave: c.clave, etiqueta: c.etiqueta, mensaje: m });
    }
  });
  return salida;
}

/** El resumen del pie: «1 valor con error: «% de uso sábado», fila 2 (150 pasa del máximo, 100)». */
export function resumenDeErrores(errores: readonly ErrorDeTabla[]): string {
  if (!errores.length) return "";
  const e = errores[0];
  const cuenta = errores.length === 1 ? "1 valor con error" : `${errores.length} valores con error`;
  return `${cuenta}: «${e.etiqueta}», fila ${e.fila} (${e.mensaje})`;
}

/** ¿Es la columna de un número que se puede graficar? */
export const esNumerica = (c: Pick<ColumnaUd, "tipo">): boolean => c.tipo === "numero" || c.tipo === "porcentaje";

/** El número de una celda para graficar o promediar; nulo si no hay. */
export function numeroDe(v: Valor | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return v === null || v === undefined ? null : aNumeroEs(v);
}

export function promedio(valores: readonly (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
