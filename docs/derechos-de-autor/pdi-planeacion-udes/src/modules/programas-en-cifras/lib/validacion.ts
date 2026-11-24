/* =============================================================================
   Programas en Cifras · leer y validar los valores de un archivo.

   Espejo de las funciones SQL de 0164 (si cambia uno, cambia el otro):
     errorDeValor     ↔ pc_error_valor
     errorDeCelda     ↔ pc_errores_archivo (una celda, con la regla fin ≥ inicio)
     validarForma     ↔ pc_validar_forma (lo que el disparador exige al guardar)

   Un borrador conserva lo que la persona escribió, aunque tenga errores: la
   celda se pinta en rojo y se corrige (como al pegar desde Excel). Los
   errores de tipo, de lista y de «fin ≥ inicio», y los obligatorios vacíos,
   solo impiden marcar el archivo como listo (pc_marcar_listo). Lo que la base
   rechaza siempre es la FORMA: columnas que no existen, valores que no son
   texto ni número, columnas de solo lectura.

   Las columnas de solo lectura (origen de sistema, p. ej. Warehouse) no se
   validan aquí: la persona no puede corregirlas.
   ========================================================================== */

import { opcionDe } from "../../internacionalizacion/lib/conceptos";
import { aFechaIso, aNumero, vacio } from "../../internacionalizacion/lib/validacion";
import type { Columna, Datos, ErrorCelda, PcTipo, PcValor } from "../tipos";

export { aFechaIso, aNumero, vacio };

export const ETIQUETA_TIPO: Record<PcTipo, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  lista: "Lista",
  porcentaje: "Porcentaje",
};

/** Máximo de caracteres de una celda de texto (el mismo tope que la base). */
export const MAX_TEXTO = 4000;

/** ¿Es «AAAA-MM-DD» y existe ese día? 2026-02-30 no. */
export function fechaIsoValida(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const enTexto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/**
 * Lo que está mal en un valor ya guardado (o escrito), o «» si está bien.
 * Mismos mensajes que pc_error_valor.
 */
export function errorDeValor(c: Pick<Columna, "tipo" | "opciones" | "obligatorio">, valor: unknown): string {
  const v = enTexto(valor);
  if (!v) return c.obligatorio ? "Obligatorio" : "";
  switch (c.tipo) {
    case "numero":
      return /^\d+([.,]\d+)?$/.test(v) ? "" : "Escriba un número";
    case "porcentaje": {
      if (!/^\d+([.,]\d+)?$/.test(v)) return "Entre 0 y 100";
      const n = parseFloat(v.replace(",", "."));
      return n >= 0 && n <= 100 ? "" : "Entre 0 y 100";
    }
    case "fecha":
      return fechaIsoValida(v) ? "" : "Use AAAA-MM-DD";
    case "lista":
      return c.opciones.length === 0 || c.opciones.includes(v) ? "" : "Elija de la lista";
    case "texto":
      return "";
  }
}

/**
 * El error de una celda de una fila: el de su valor y, en una fecha que debe
 * igualar o superar a otra (`posterior_a`), el orden. Vacío si está bien o si
 * la columna es de solo lectura.
 */
export function errorDeCelda(columnas: readonly Columna[], datos: Datos, columna: Columna): string {
  if (columna.solo_lectura) return "";
  const propio = errorDeValor(columna, datos[columna.clave]);
  if (propio) return propio;
  if (columna.tipo === "fecha" && columna.posterior_a) {
    const inicio = columnas.find((c) => c.clave === columna.posterior_a);
    const fin = enTexto(datos[columna.clave]);
    const ini = enTexto(datos[columna.posterior_a]);
    if (inicio && fin && ini && fechaIsoValida(fin) && fechaIsoValida(ini) && fin < ini) return `Es anterior a «${inicio.etiqueta}»`;
  }
  return "";
}

/** Errores de una fila. `fila` es el número que se muestra (índice de la grilla o fila del Excel). */
export function validarFila(columnas: readonly Columna[], datos: Datos, fila: number): ErrorCelda[] {
  const errores: ErrorCelda[] = [];
  const claves = new Set(columnas.map((c) => c.clave));
  for (const k of Object.keys(datos)) if (!claves.has(k)) errores.push({ fila, columna: k, mensaje: `La columna «${k}» no existe en este archivo.` });
  for (const c of columnas) {
    const m = errorDeCelda(columnas, datos, c);
    if (m) errores.push({ fila, columna: c.clave, mensaje: m });
  }
  return errores;
}

export interface ResultadoArchivo {
  errores: ErrorCelda[];
  /** Cuántas celdas con error. */
  total: number;
  /** Cuántas filas tienen al menos un error. */
  filasConError: number;
}

/** Valida todas las filas de un archivo. Es lo que cuenta pc_cuenta_errores y lo que exige «Marcar como listo». */
export function validarArchivo(columnas: readonly Columna[], filas: readonly Datos[]): ResultadoArchivo {
  const errores = filas.flatMap((d, i) => validarFila(columnas, d, i + 1));
  const conError = new Set(errores.map((e) => e.fila));
  return { errores, total: errores.length, filasConError: conError.size };
}

export function contarErrores(columnas: readonly Columna[], filas: readonly Datos[]): number {
  return validarArchivo(columnas, filas).total;
}

/** ¿Puede marcarse como listo? Sin errores de validación. */
export function puedeMarcarseListo(columnas: readonly Columna[], filas: readonly Datos[]): boolean {
  return contarErrores(columnas, filas) === 0;
}

/**
 * La forma que la base exige siempre al guardar: objeto, columnas que existen,
 * valores de texto o número (o vacíos), texto de hasta MAX_TEXTO y nada
 * nuevo en las columnas de solo lectura. Devuelve el mensaje, o nulo si está
 * bien (como pc_validar_forma).
 */
export function validarForma(columnas: readonly Columna[], datos: unknown): string | null {
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) return "Los datos de la fila deben ser un objeto.";
  for (const [k, v] of Object.entries(datos as Record<string, unknown>)) {
    const c = columnas.find((x) => x.clave === k);
    if (!c) return `La columna «${k}» no existe en este archivo.`;
    if (v === null) continue;
    if (typeof v !== "string" && typeof v !== "number") return `«${c.etiqueta}»: el valor debe ser texto o número.`;
    if (String(v).length > MAX_TEXTO) return `«${c.etiqueta}»: el texto es demasiado largo (máximo ${MAX_TEXTO} caracteres).`;
  }
  return null;
}

/* ---------- de lo que se escribe a lo que se guarda ------------------------------------------- */

export interface Lectura {
  valor: PcValor;
  /** Qué está mal, en español; ausente si se leyó bien. */
  error?: string;
}

/**
 * Lleva un valor crudo (de Excel o de la grilla) al valor que se guarda:
 * número para número y porcentaje, «AAAA-MM-DD» para fecha, la opción tal
 * como está en la lista, texto recortado. Lo que no se puede leer vuelve
 * como texto, con su error, para que la persona lo vea y lo corrija.
 */
export function leerValor(c: Pick<Columna, "tipo" | "opciones" | "etiqueta">, crudo: unknown): Lectura {
  if (vacio(crudo)) return { valor: null };
  const texto = crudo instanceof Date ? (aFechaIso(crudo) ?? "") : String(crudo).trim();
  switch (c.tipo) {
    case "numero": {
      const n = aNumero(crudo);
      return n === null || n < 0 ? { valor: texto, error: `«${texto}» no es un número válido para «${c.etiqueta}».` } : { valor: n };
    }
    case "porcentaje": {
      const n = aNumero(crudo);
      return n === null || n < 0 || n > 100 ? { valor: texto, error: `«${texto}» no es un porcentaje válido (entre 0 y 100) para «${c.etiqueta}».` } : { valor: n };
    }
    case "fecha": {
      const f = aFechaIso(crudo);
      return f === null ? { valor: texto, error: `«${texto}» no es una fecha válida para «${c.etiqueta}». Use AAAA-MM-DD.` } : { valor: f };
    }
    case "lista": {
      if (c.opciones.length === 0) return { valor: texto };
      const o = opcionDe(texto, c.opciones);
      return o === null ? { valor: texto, error: `«${texto}» no es una opción de «${c.etiqueta}».` } : { valor: o };
    }
    case "texto":
      return { valor: texto };
  }
}

/** Lleva una fila cruda ({clave: valor}) a datos tipados; ignora las claves que el archivo no tiene. */
export function leerFila(columnas: readonly Columna[], cruda: Record<string, unknown>): { datos: Datos; errores: ErrorCelda[] } {
  const datos: Datos = {};
  const errores: ErrorCelda[] = [];
  for (const c of columnas) {
    if (!(c.clave in cruda)) continue;
    const r = leerValor(c, cruda[c.clave]);
    datos[c.clave] = r.valor;
    if (r.error) errores.push({ fila: 0, columna: c.clave, mensaje: r.error });
  }
  return { datos, errores };
}
