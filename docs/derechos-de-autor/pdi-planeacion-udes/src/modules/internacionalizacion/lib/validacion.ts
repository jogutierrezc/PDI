/* =============================================================================
   Internacionalización · leer y validar los valores de una fila.

   Una celda llega cruda (de Excel: texto, número, Date, serial de fecha; de la
   grilla: texto) y se guarda tipada: número, fecha «AAAA-MM-DD», opción de la
   lista tal como está escrita en la lista, o texto. La base vuelve a revisar
   la forma (int_validar_datos, 0151); los obligatorios y «fin ≥ inicio» se
   revisan aquí y, los obligatorios, también al enviar (int_cambiar_estado).
   ========================================================================== */

import type { Columna, Datos, ErrorCelda, IntTipo, IntValor } from "../tipos";
import { opcionDe } from "./conceptos";

const pad = (n: number) => String(n).padStart(2, "0");

/** ¿Existe esa fecha? 2026-02-30 no. */
function fechaValida(anio: number, mes: number, dia: number): boolean {
  if (anio < 1900 || anio > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const iso = (anio: number, mes: number, dia: number) => `${anio}-${pad(mes)}-${pad(dia)}`;

/**
 * Fecha de una celda → «AAAA-MM-DD», o nulo. Acepta Date (ExcelJS las da en
 * UTC), el número de serie de Excel, «AAAA-MM-DD», «DD/MM/AAAA» y «DD-MM-AAAA».
 */
export function aFechaIso(valor: unknown): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return iso(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  }
  if (typeof valor === "number") {
    // Serie de Excel: días desde 1899-12-30. Entre 1950 y 2150, más o menos.
    if (!Number.isFinite(valor) || valor < 18264 || valor > 91311) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = String(valor ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return fechaValida(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(t);
  if (m) return fechaValida(+m[4], +m[3], +m[1]) ? iso(+m[4], +m[3], +m[1]) : null;
  return null;
}

/** Número de una celda, o nulo. Acepta coma decimal («2,5») y espacios. */
export function aNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const t = String(valor ?? "").replace(/\s/g, "");
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

/** ¿Está vacía? null, undefined o solo espacios. */
export function vacio(valor: unknown): boolean {
  return valor === null || valor === undefined || String(valor).trim() === "";
}

export interface Lectura {
  valor: IntValor;
  /** Qué está mal, en español; ausente si se leyó bien. */
  error?: string;
}

/**
 * Lee un valor crudo para una columna. Vacío → null. Un valor que no se puede
 * leer vuelve como texto con su error (la vista previa lo muestra tal cual).
 */
export function leerValor(columna: Pick<Columna, "etiqueta" | "tipo" | "opciones">, crudo: unknown): Lectura {
  if (vacio(crudo)) return { valor: null };
  const texto = crudo instanceof Date ? (aFechaIso(crudo) ?? "") : String(crudo).trim();
  const tipo: IntTipo = columna.tipo;
  switch (tipo) {
    case "calculado":
      return { valor: null };
    case "numero": {
      const n = aNumero(crudo);
      return n === null ? { valor: texto, error: `«${texto}» no es un número válido para «${columna.etiqueta}».` } : { valor: n };
    }
    case "fecha": {
      const f = aFechaIso(crudo);
      return f === null
        ? { valor: texto, error: `«${texto}» no es una fecha válida para «${columna.etiqueta}». Use AAAA-MM-DD o DD/MM/AAAA.` }
        : { valor: f };
    }
    case "lista": {
      if (columna.opciones.length === 0) return { valor: texto };
      const o = opcionDe(texto, columna.opciones);
      return o === null
        ? { valor: texto, error: `«${texto}» no es una opción de «${columna.etiqueta}». Opciones: ${columna.opciones.join(", ")}.` }
        : { valor: o };
    }
    case "texto":
      return { valor: texto };
  }
}

/** Días entre dos fechas ISO (fin − inicio), o nulo si falta alguna. */
export function diasEntre(desde: IntValor | undefined, hasta: IntValor | undefined): number | null {
  const a = aFechaIso(desde);
  const b = aFechaIso(hasta);
  if (!a || !b) return null;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Llena las columnas calculadas de una fila (hoy: días entre dos fechas). Devuelve una copia. */
export function calcular(columnas: readonly Columna[], datos: Datos): Datos {
  const salida: Datos = { ...datos };
  for (const c of columnas) {
    if (c.tipo !== "calculado" || !c.calculo) continue;
    if (c.calculo.tipo === "dias_entre") salida[c.clave] = diasEntre(datos[c.calculo.desde], datos[c.calculo.hasta]);
  }
  return salida;
}

/** Pares (inicio, fin) que deben ir en orden: los conceptos fecha_inicio/fecha_fin y los de cada cálculo. */
function paresDeFechas(columnas: readonly Columna[]): [Columna, Columna][] {
  const porClave = new Map(columnas.map((c) => [c.clave, c]));
  const pares: [Columna, Columna][] = [];
  const agregar = (a?: Columna, b?: Columna) => {
    if (a && b && !pares.some(([x, y]) => x.clave === a.clave && y.clave === b.clave)) pares.push([a, b]);
  };
  agregar(porClave.get("fecha_inicio"), porClave.get("fecha_fin"));
  for (const c of columnas) if (c.calculo?.tipo === "dias_entre") agregar(porClave.get(c.calculo.desde), porClave.get(c.calculo.hasta));
  return pares;
}

/**
 * Errores de una fila ya leída: obligatorios, tipos, opciones de lista,
 * claves que la hoja no tiene y fecha de fin anterior a la de inicio.
 * `fila` es el número que se muestra (fila del Excel o de la grilla).
 */
export function validarDatos(columnas: readonly Columna[], datos: Datos, fila: number): ErrorCelda[] {
  const errores: ErrorCelda[] = [];
  const claves = new Set(columnas.map((c) => c.clave));
  for (const clave of Object.keys(datos)) {
    if (!claves.has(clave)) errores.push({ fila, columna: clave, mensaje: `La columna «${clave}» no existe en esta hoja.` });
  }
  for (const c of columnas) {
    if (c.tipo === "calculado") continue;
    const v = datos[c.clave];
    if (vacio(v)) {
      if (c.obligatorio) errores.push({ fila, columna: c.clave, mensaje: `Falta «${c.etiqueta}»: es obligatorio.` });
      continue;
    }
    if (c.tipo === "numero" && typeof v !== "number") {
      errores.push({ fila, columna: c.clave, mensaje: `«${v}» no es un número válido para «${c.etiqueta}».` });
    } else if (c.tipo === "fecha" && (typeof v !== "string" || aFechaIso(v) !== v)) {
      errores.push({ fila, columna: c.clave, mensaje: `«${v}» no es una fecha válida para «${c.etiqueta}». Use AAAA-MM-DD.` });
    } else if (c.tipo === "lista" && c.opciones.length > 0 && !c.opciones.includes(String(v))) {
      errores.push({ fila, columna: c.clave, mensaje: `«${v}» no es una opción de «${c.etiqueta}». Opciones: ${c.opciones.join(", ")}.` });
    }
  }
  for (const [ini, fin] of paresDeFechas(columnas)) {
    const d = diasEntre(datos[ini.clave], datos[fin.clave]);
    if (d !== null && d < 0) {
      errores.push({
        fila,
        columna: fin.clave,
        mensaje: `«${fin.etiqueta}» (${datos[fin.clave]}) es anterior a «${ini.etiqueta}» (${datos[ini.clave]}).`,
      });
    }
  }
  return errores;
}
