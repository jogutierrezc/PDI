/* =============================================================================
   Internacionalización · importador de Excel (en el navegador).

   Dos pasos, los dos puros (reciben un ExcelJS.Workbook ya cargado, como
   rankings/reporte/catalogo-excel.ts; no hacen red ni leen disco):

   1. analizarLibro(wb, conceptos)
      Detecta las hojas, la fila de encabezados (la de más textos entre las 15
      primeras), y por cada columna: el concepto del catálogo que le
      corresponde (por nombre normalizado y sinónimos) o «campo propio», y el
      tipo (el del concepto; si es propio, se infiere: fecha, número, lista si
      hay pocos valores distintos, o texto). Las columnas «Periodo» y «Campus»
      son implícitas: no son columnas de la tabla, van en la fila.
      → Para el Director: columnasParaCrear() da la estructura de la tabla.

   2. prepararCarga(hoja, columnasDestino, contexto)
      Lleva cada fila a los datos de la hoja de destino: lee y valida cada
      celda (tipos, obligatorios, listas, fin ≥ inicio), resuelve el campus
      (fijo para el Gestor; si el Excel trae columna de campus, solo se
      aceptan los permitidos) y comprueba el periodo. Devuelve una VISTA
      PREVIA con los errores por fila y celda en español; no guarda nada.
      → paraGuardar() arma el cuerpo de int_guardar_filas.
   ========================================================================== */

import type ExcelJS from "exceljs";
import { textoCelda } from "../../rankings/reporte/catalogo-excel";
import type { Campus, Columna, Concepto, Datos, ErrorCelda, IntCalculo, IntTipo } from "../tipos";
import { CALCULO_DURACION, claveDePropio, emparejarConcepto, normalizar } from "./conceptos";
import { aFechaIso, aNumero, calcular, leerValor, vacio, validarDatos } from "./validacion";

/** Cómo se emparejó una columna del Excel. */
export type ComoEmparejo = "exacto" | "parecido" | "propio" | "implicito";

export interface ColumnaDetectada {
  /** Columna de Excel (1 = A). */
  indice: number;
  encabezado: string;
  /** Clave en datos: el id del concepto, «propio_…», o «periodo» / «campus» si es implícita. */
  clave: string;
  etiqueta: string;
  tipo: IntTipo;
  concepto_id: string | null;
  como: ComoEmparejo;
  /** Solo para «periodo» y «campus». */
  implicito: "periodo" | "campus" | null;
  opciones: string[];
  calculo: IntCalculo | null;
}

export interface FilaCruda {
  /** Fila en el Excel (1 = primera). */
  fila: number;
  /** Valores crudos por clave de ColumnaDetectada. */
  celdas: Record<string, unknown>;
}

export interface HojaDetectada {
  nombre: string;
  /** Fila del Excel donde están los encabezados. */
  filaEncabezado: number;
  columnas: ColumnaDetectada[];
  filas: FilaCruda[];
  advertencias: string[];
}

export interface LibroDetectado {
  hojas: HojaDetectada[];
  advertencias: string[];
}

/** Valor útil de una celda de ExcelJS: número, Date, booleano o texto (fórmulas: su resultado). */
export function valorCelda(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" || typeof valor === "boolean" || valor instanceof Date) return valor;
  if (typeof valor === "string") return valor.replace(/\s+/g, " ").trim();
  if (typeof valor === "object" && "result" in (valor as Record<string, unknown>)) return valorCelda((valor as { result: unknown }).result);
  return textoCelda(valor);
}

const esFecha = (v: unknown) => v instanceof Date || (typeof v === "string" && aFechaIso(v) !== null);
const esNumero = (v: unknown) => typeof v === "number" || (typeof v === "string" && aNumero(v) !== null);
const esTextoDeEncabezado = (v: unknown) => typeof v === "string" && v.trim() !== "" && !esNumero(v) && !esFecha(v);

/** Máximo de valores distintos para proponer una lista. */
const MAX_OPCIONES = 8;

/** Tipo de una columna propia según sus valores. */
export function inferirTipo(valores: readonly unknown[]): { tipo: IntTipo; opciones: string[] } {
  const llenos = valores.filter((v) => !vacio(v));
  if (llenos.length === 0) return { tipo: "texto", opciones: [] };
  if (llenos.every(esFecha)) return { tipo: "fecha", opciones: [] };
  if (llenos.every(esNumero)) return { tipo: "numero", opciones: [] };
  const distintos = new Map<string, string>();
  for (const v of llenos) {
    const t = String(v).trim();
    if (!distintos.has(normalizar(t))) distintos.set(normalizar(t), t);
  }
  if (llenos.length >= 5 && distintos.size <= MAX_OPCIONES && distintos.size * 2 <= llenos.length) {
    return { tipo: "lista", opciones: [...distintos.values()].sort((a, b) => a.localeCompare(b, "es")) };
  }
  return { tipo: "texto", opciones: [] };
}

/** La fila de encabezados: la que tiene más textos (al menos 2) entre las 15 primeras. */
function filaDeEncabezados(ws: ExcelJS.Worksheet): number | null {
  let mejor: { fila: number; n: number } | null = null;
  for (let fila = 1; fila <= Math.min(15, ws.rowCount); fila++) {
    let n = 0;
    ws.getRow(fila).eachCell({ includeEmpty: false }, (cell) => {
      if (esTextoDeEncabezado(valorCelda(cell.value))) n++;
    });
    if (n >= 2 && (!mejor || n > mejor.n)) mejor = { fila, n };
  }
  return mejor?.fila ?? null;
}

function analizarHoja(ws: ExcelJS.Worksheet, conceptos: readonly Concepto[]): HojaDetectada | null {
  const filaEncabezado = filaDeEncabezados(ws);
  if (filaEncabezado === null) return null;
  const advertencias: string[] = [];

  const encabezados: { indice: number; texto: string }[] = [];
  ws.getRow(filaEncabezado).eachCell({ includeEmpty: false }, (cell, indice) => {
    const texto = textoCelda(cell.value);
    if (texto) encabezados.push({ indice, texto });
  });

  // Valores crudos por columna, para inferir tipos.
  const filas: { fila: number; valores: Map<number, unknown> }[] = [];
  for (let fila = filaEncabezado + 1; fila <= ws.rowCount; fila++) {
    const valores = new Map<number, unknown>();
    const row = ws.getRow(fila);
    for (const e of encabezados) {
      const v = valorCelda(row.getCell(e.indice).value);
      if (!vacio(v)) valores.set(e.indice, v);
    }
    if (valores.size > 0) filas.push({ fila, valores });
  }

  const usados = new Set<string>();
  const columnas: ColumnaDetectada[] = [];
  for (const e of encabezados) {
    const par = emparejarConcepto(e.texto, conceptos, usados);
    const valores = filas.map((f) => f.valores.get(e.indice));
    if (par && (par.concepto.id === "periodo" || par.concepto.id === "campus")) {
      usados.add(par.concepto.id);
      columnas.push({
        indice: e.indice,
        encabezado: e.texto,
        clave: par.concepto.id,
        etiqueta: par.concepto.nombre,
        tipo: "texto",
        concepto_id: null,
        como: "implicito",
        implicito: par.concepto.id,
        opciones: [],
        calculo: null,
      });
      continue;
    }
    if (par) {
      usados.add(par.concepto.id);
      const tipo = par.concepto.tipo;
      columnas.push({
        indice: e.indice,
        encabezado: e.texto,
        clave: par.concepto.id,
        etiqueta: par.concepto.nombre,
        tipo,
        concepto_id: par.concepto.id,
        como: par.como,
        implicito: null,
        opciones: [...par.concepto.opciones],
        calculo: null,
      });
      continue;
    }
    const inferido = inferirTipo(valores);
    const clave = claveDePropio(e.texto, columnas.map((c) => c.clave));
    columnas.push({
      indice: e.indice,
      encabezado: e.texto,
      clave,
      etiqueta: e.texto,
      tipo: inferido.tipo,
      concepto_id: null,
      como: "propio",
      implicito: null,
      opciones: inferido.opciones,
      calculo: null,
    });
  }

  // La duración se calcula si están las dos fechas; si no, es un número capturado.
  const duracion = columnas.find((c) => c.concepto_id === "duracion_dias");
  if (duracion) {
    const hayFechas = columnas.some((c) => c.clave === "fecha_inicio") && columnas.some((c) => c.clave === "fecha_fin");
    duracion.tipo = hayFechas ? "calculado" : "numero";
    duracion.calculo = hayFechas ? { ...CALCULO_DURACION } : null;
  }

  for (const c of columnas) {
    if (c.como === "parecido") advertencias.push(`«${c.encabezado}» se emparejó con «${c.etiqueta}» por parecido: revíselo.`);
  }
  const repetidos = encabezados.length - new Set(encabezados.map((e) => normalizar(e.texto))).size;
  if (repetidos > 0) advertencias.push(`La hoja tiene ${repetidos} encabezado(s) repetido(s).`);

  return {
    nombre: ws.name,
    filaEncabezado,
    columnas,
    filas: filas.map((f) => ({
      fila: f.fila,
      celdas: Object.fromEntries(columnas.filter((c) => f.valores.has(c.indice)).map((c) => [c.clave, f.valores.get(c.indice)])),
    })),
    advertencias,
  };
}

/** Lee todas las hojas visibles del libro. No guarda nada. */
export function analizarLibro(wb: ExcelJS.Workbook, conceptos: readonly Concepto[]): LibroDetectado {
  const hojas: HojaDetectada[] = [];
  const advertencias: string[] = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== "visible") {
      advertencias.push(`La hoja «${ws.name}» está oculta: no se leyó.`);
      return;
    }
    const hoja = analizarHoja(ws, conceptos);
    if (hoja) hojas.push(hoja);
    else advertencias.push(`La hoja «${ws.name}» no tiene una fila de encabezados: no se leyó.`);
  });
  if (hojas.length === 0) advertencias.push("El archivo no tiene hojas con encabezados y datos.");
  return { hojas, advertencias };
}

/** Las columnas de la tabla nueva (sin periodo ni campus, que van en la fila). Para «Crear tabla desde Excel». */
export function columnasParaCrear(hoja: HojaDetectada): (Columna & { orden: number })[] {
  return hoja.columnas
    .filter((c) => c.implicito === null)
    .map((c, i) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      tipo: c.tipo,
      concepto_id: c.concepto_id,
      obligatorio: false,
      opciones: c.opciones,
      calculo: c.calculo,
      orden: i + 1,
    }));
}

/** La hoja de Excel que corresponde a una hoja del repositorio, por nombre. */
export function hojaPorNombre<T extends { nombre: string }>(nombre: string, hojas: readonly T[]): T | null {
  const n = normalizar(nombre);
  return hojas.find((h) => normalizar(h.nombre) === n) ?? null;
}

/* ---------- Paso 2: preparar la carga en una hoja existente ---------- */

export interface ContextoCarga {
  /** Todos los campus (public.campuses), para leer la columna «Campus». */
  campus: readonly Campus[];
  /** Campus donde quien carga puede escribir. Gestor: los suyos; Director: todos. */
  permitidos: readonly string[];
  /** Campus de las filas cuando el Excel no trae columna de campus (o la celda viene vacía). */
  campusFijo?: string | null;
  /** Código del periodo de la carga («2026-2»). */
  periodo: string;
}

export interface FilaPreparada {
  /** Fila en el Excel. */
  fila: number;
  campus_id: string | null;
  datos: Datos;
  errores: ErrorCelda[];
}

export interface CargaPreparada {
  filas: FilaPreparada[];
  /** Filas sin errores: las que se guardan. */
  validas: FilaPreparada[];
  /** Todos los errores, por fila y celda. */
  errores: ErrorCelda[];
  /** Encabezados del Excel que la hoja de destino no tiene (se ignoran). */
  ignoradas: string[];
  /** Columnas obligatorias de la hoja que el Excel no trae. */
  faltantes: string[];
  /** Filas válidas por campus. */
  porCampus: Record<string, number>;
}

/** El campus que nombra una celda (nombre, slug o código, sin acentos), o nulo. */
export function campusDe(valor: unknown, campus: readonly Campus[]): Campus | null {
  const v = normalizar(valor);
  if (!v) return null;
  return campus.find((c) => [c.name, c.slug, c.code].some((x) => normalizar(x) === v)) ?? null;
}

const nombreCampus = (id: string, campus: readonly Campus[]) => campus.find((c) => c.id === id)?.name ?? "otro campus";

/**
 * Lleva las filas de una hoja de Excel a la hoja de destino. No guarda: es la
 * vista previa. Las columnas se emparejan por clave (concepto o campo propio)
 * y, si no, por etiqueta.
 */
export function prepararCarga(hoja: HojaDetectada, destino: readonly Columna[], ctx: ContextoCarga): CargaPreparada {
  const porClave = new Map(destino.map((c) => [c.clave, c]));
  const porEtiqueta = new Map(destino.map((c) => [normalizar(c.etiqueta), c]));
  /** Columna del Excel → columna de destino. */
  const mapa = new Map<string, Columna>();
  const ignoradas: string[] = [];
  for (const c of hoja.columnas) {
    if (c.implicito) continue;
    const d = porClave.get(c.clave) ?? porEtiqueta.get(normalizar(c.encabezado)) ?? porEtiqueta.get(normalizar(c.etiqueta));
    if (d && d.tipo !== "calculado" && ![...mapa.values()].includes(d)) mapa.set(c.clave, d);
    else if (!d || d.tipo !== "calculado") ignoradas.push(c.encabezado);
  }
  const traidas = new Set([...mapa.values()].map((d) => d.clave));
  const faltantes = destino.filter((d) => d.obligatorio && d.tipo !== "calculado" && !traidas.has(d.clave)).map((d) => d.etiqueta);

  const conCampus = hoja.columnas.some((c) => c.implicito === "campus");
  const conPeriodo = hoja.columnas.some((c) => c.implicito === "periodo");
  const permitidos = new Set(ctx.permitidos);
  const fijo = ctx.campusFijo ?? (ctx.permitidos.length === 1 ? ctx.permitidos[0] : null);
  const nombresPermitidos = ctx.permitidos.map((id) => nombreCampus(id, ctx.campus)).join(", ");

  const filas: FilaPreparada[] = hoja.filas.map((cruda) => {
    const errores: ErrorCelda[] = [];
    let datos: Datos = {};
    for (const [claveExcel, d] of mapa) {
      const lectura = leerValor(d, cruda.celdas[claveExcel]);
      datos[d.clave] = lectura.valor;
      if (lectura.error) errores.push({ fila: cruda.fila, columna: d.clave, mensaje: lectura.error });
    }
    datos = calcular(destino, datos);
    // Los de tipo ya se marcaron al leer; aquí, obligatorios, listas y fechas en orden.
    const marcadas = new Set(errores.map((e) => e.columna));
    for (const e of validarDatos(destino, datos, cruda.fila)) if (!marcadas.has(e.columna)) errores.push(e);

    let campus_id: string | null = null;
    const celdaCampus = conCampus ? cruda.celdas.campus : undefined;
    if (!vacio(celdaCampus)) {
      const c = campusDe(celdaCampus, ctx.campus);
      if (!c) errores.push({ fila: cruda.fila, columna: "campus", mensaje: `«${String(celdaCampus)}» no es un campus conocido.` });
      else if (!permitidos.has(c.id)) {
        errores.push({ fila: cruda.fila, columna: "campus", mensaje: `La fila es de ${c.name}: usted solo puede cargar ${nombresPermitidos || "ningún campus"}.` });
      } else campus_id = c.id;
    } else if (fijo && permitidos.has(fijo)) {
      campus_id = fijo;
    } else {
      errores.push({ fila: cruda.fila, columna: "campus", mensaje: "Falta el campus: elija uno para la carga o agregue la columna «Campus»." });
    }

    const celdaPeriodo = conPeriodo ? cruda.celdas.periodo : undefined;
    if (!vacio(celdaPeriodo) && normalizar(celdaPeriodo) !== normalizar(ctx.periodo)) {
      errores.push({ fila: cruda.fila, columna: "periodo", mensaje: `La fila es del periodo «${String(celdaPeriodo)}» y la carga es de ${ctx.periodo}.` });
    }
    return { fila: cruda.fila, campus_id, datos, errores };
  });

  const validas = filas.filter((f) => f.errores.length === 0 && f.campus_id);
  const porCampus: Record<string, number> = {};
  for (const f of validas) porCampus[f.campus_id!] = (porCampus[f.campus_id!] ?? 0) + 1;
  return { filas, validas, errores: filas.flatMap((f) => f.errores), ignoradas, faltantes, porCampus };
}

/** Cuerpo de int_guardar_filas: solo las filas válidas, en su orden. */
export function paraGuardar(carga: CargaPreparada): { campus_id: string; datos: Datos; orden: number }[] {
  return carga.validas.map((f, i) => ({ campus_id: f.campus_id!, datos: f.datos, orden: i }));
}
