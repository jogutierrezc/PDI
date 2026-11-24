/* =============================================================================
   UDrive · lógica pura de una tabla.

   Crear, leer sin miedo (el JSON viene de la base y puede estar a medias),
   aplicar el guardado que pide el editor, pegar desde Excel, importar una hoja
   y sacar la matriz para exportar. Sin React ni DOM.
   ========================================================================== */

import { normalizar } from "../../internacionalizacion/lib/conceptos";
import { claveDeEncabezado, filaDeEncabezado, inferirTipo, textoDeCelda } from "../../programas-en-cifras/lib/inferencia";
import type { ColumnaUd, ContenidoTabla, FilaUd, Presentacion, TablaDatos, TipoColumna, TramoCalor, Valor } from "../tipos";
import { aNumeroEs, leerValor, textoNumero, vacio } from "./valores";

export const MAX_FILAS = 50000;
export const MAX_COLUMNAS = 60;

export const PRESENTACION_VACIA: Presentacion = { titulo: "", nota: "", enIndice: true, repetirEncabezado: true };

export function columnaNueva(etiqueta: string, usadas: Iterable<string> = [], tipo: TipoColumna = "texto"): ColumnaUd {
  return { clave: claveDeEncabezado(etiqueta, usadas), etiqueta, tipo, obligatorio: false, opciones: [], min: null, max: null, calor: null };
}

/** Una tabla recién creada: dos columnas de texto y tres filas para empezar a escribir. */
export function tablaVacia(nuevoId: () => string): ContenidoTabla {
  const a = columnaNueva("Columna 1");
  const b = columnaNueva("Columna 2", [a.clave]);
  return {
    version: 1,
    columnas: [a, b],
    filas: [0, 1, 2].map(() => ({ id: nuevoId(), datos: {} })),
    presentacion: { ...PRESENTACION_VACIA },
    mapaCalor: false,
  };
}

const TIPOS: readonly TipoColumna[] = ["texto", "numero", "porcentaje", "fecha", "lista"];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function leerTramos(v: unknown): TramoCalor[] | null {
  if (!Array.isArray(v)) return null;
  const t = v
    .filter((x): x is { hasta: unknown; color: unknown } => typeof x === "object" && x !== null)
    .map((x) => ({ hasta: num(x.hasta), color: typeof x.color === "string" ? x.color : "#ffffff" }));
  return t.length >= 2 ? t : null;
}

/** El contenido de una tabla tal como lo guarda la base, saneado: nunca lanza ni devuelve campos faltantes. */
export function normalizarContenido(crudo: unknown, nuevoId: () => string = () => `f${Math.random().toString(36).slice(2, 10)}`): ContenidoTabla {
  const o = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const usadas = new Set<string>();
  const columnas: ColumnaUd[] = (Array.isArray(o.columnas) ? o.columnas : []).slice(0, MAX_COLUMNAS).flatMap((c) => {
    if (typeof c !== "object" || c === null) return [];
    const x = c as Record<string, unknown>;
    const etiqueta = typeof x.etiqueta === "string" && x.etiqueta.trim() ? x.etiqueta : "Columna";
    const clave = typeof x.clave === "string" && x.clave && !usadas.has(x.clave) ? x.clave : claveDeEncabezado(etiqueta, usadas);
    usadas.add(clave);
    const tipo = TIPOS.includes(x.tipo as TipoColumna) ? (x.tipo as TipoColumna) : "texto";
    return [{ clave, etiqueta, tipo, obligatorio: x.obligatorio === true, opciones: Array.isArray(x.opciones) ? x.opciones.filter((s): s is string => typeof s === "string") : [], min: num(x.min), max: num(x.max), calor: leerTramos(x.calor) }];
  });
  const filas: FilaUd[] = (Array.isArray(o.filas) ? o.filas : []).slice(0, MAX_FILAS).map((f) => {
    const x = (typeof f === "object" && f !== null ? f : {}) as Record<string, unknown>;
    const datos: Record<string, Valor> = {};
    const d = (typeof x.datos === "object" && x.datos !== null ? x.datos : {}) as Record<string, unknown>;
    for (const c of columnas) {
      const v = d[c.clave];
      datos[c.clave] = typeof v === "number" || typeof v === "string" ? v : null;
    }
    return { id: typeof x.id === "string" && x.id ? x.id : nuevoId(), datos };
  });
  const p = (typeof o.presentacion === "object" && o.presentacion !== null ? o.presentacion : {}) as Record<string, unknown>;
  return {
    version: 1,
    columnas,
    filas,
    presentacion: {
      titulo: typeof p.titulo === "string" ? p.titulo : "",
      nota: typeof p.nota === "string" ? p.nota : "",
      enIndice: p.enIndice !== false,
      repetirEncabezado: p.repetirEncabezado !== false,
    },
    mapaCalor: o.mapaCalor === true,
  };
}

/* ---------- guardado del editor ---------------------------------------------------- */

export interface CambiosFilas {
  filas: { id?: string; datos: Record<string, Valor>; orden?: number }[];
  borrar: string[];
}

/**
 * Aplica lo que el editor pide guardar: quita las borradas, cambia las que
 * existen y mete las nuevas (sin id) en el lugar `orden` que tenían en pantalla.
 */
export function aplicarGuardado(filas: readonly FilaUd[], cambios: CambiosFilas, nuevoId: () => string): FilaUd[] {
  const fuera = new Set(cambios.borrar);
  const nuevos = new Map(cambios.filas.filter((f) => f.id).map((f) => [f.id!, f.datos] as const));
  const salida = filas.filter((f) => !fuera.has(f.id)).map((f) => (nuevos.has(f.id) ? { id: f.id, datos: nuevos.get(f.id)! } : f));
  const nuevas = cambios.filas.filter((f) => !f.id).sort((a, b) => (a.orden ?? Infinity) - (b.orden ?? Infinity));
  for (const f of nuevas) salida.splice(Math.min(f.orden ?? salida.length, salida.length), 0, { id: nuevoId(), datos: f.datos });
  return salida;
}

/** Si se quita una columna, sus valores se van de las filas; si se agrega, queda vacía. */
export function ajustarFilasAColumnas(filas: readonly FilaUd[], columnas: readonly ColumnaUd[]): FilaUd[] {
  const claves = new Set(columnas.map((c) => c.clave));
  return filas.map((f) => {
    const datos: Record<string, Valor> = {};
    for (const c of columnas) datos[c.clave] = f.datos[c.clave] ?? null;
    return Object.keys(f.datos).every((k) => claves.has(k)) && Object.keys(datos).length === Object.keys(f.datos).length ? f : { id: f.id, datos };
  });
}

/** Cambiar el tipo de una columna vuelve a leer sus valores con el tipo nuevo (lo que no se lee se conserva como texto para corregirlo). */
export function releerColumna(filas: readonly FilaUd[], antes: ColumnaUd, despues: ColumnaUd): FilaUd[] {
  if (antes.tipo === despues.tipo && antes.opciones.join("|") === despues.opciones.join("|")) return filas as FilaUd[];
  return filas.map((f) => {
    const v = f.datos[despues.clave];
    return vacio(v) ? f : { id: f.id, datos: { ...f.datos, [despues.clave]: leerValor(despues, v).valor } };
  });
}

/* ---------- pegar e importar ------------------------------------------------------------- */

/** Texto copiado de Excel (tabulaciones y saltos de línea) a una matriz. Las celdas entre comillas con saltos se respetan. */
export function matrizDeTexto(texto: string): string[][] {
  const limpio = texto.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!limpio) return [];
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entre = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entre) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entre = false;
      else celda += c;
    } else if (c === '"' && celda === "") entre = true;
    else if (c === "\t") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  fila.push(celda);
  filas.push(fila);
  return filas;
}

export interface FilasPegadas {
  filas: FilaUd[];
  /** Mensajes de lo que no se pudo leer (la celda queda con el texto para corregirlo). */
  errores: string[];
  /** Cómo se alinearon las columnas pegadas con las de la tabla: clave, o nulo si sobró. */
  columnas: (string | null)[];
}

/**
 * Convierte lo pegado en filas de la tabla. Con encabezado, las columnas se
 * buscan por rótulo (sin tildes ni mayúsculas) y las que no se reconocen se
 * ignoran; sin él, se asignan por posición. Las filas completamente vacías se
 * descartan.
 */
export function pegarEnFilas(columnas: readonly ColumnaUd[], matriz: readonly (readonly unknown[])[], opciones: { conEncabezado: boolean }, nuevoId: () => string): FilasPegadas {
  let cuerpo = matriz;
  let mapa: (string | null)[];
  if (opciones.conEncabezado && matriz.length) {
    const rotulos = new Map(columnas.map((c) => [normalizar(c.etiqueta), c.clave] as const));
    mapa = matriz[0].map((h) => rotulos.get(normalizar(textoDeCelda(h))) ?? null);
    cuerpo = matriz.slice(1);
  } else {
    mapa = (matriz[0] ?? []).map((_, i) => columnas[i]?.clave ?? null);
  }
  const porClave = new Map(columnas.map((c) => [c.clave, c] as const));
  const errores: string[] = [];
  const filas: FilaUd[] = [];
  cuerpo.forEach((linea, n) => {
    if (linea.every((c) => vacio(c))) return;
    const datos: Record<string, Valor> = Object.fromEntries(columnas.map((c) => [c.clave, null]));
    linea.forEach((crudo, i) => {
      const clave = mapa[i];
      const col = clave ? porClave.get(clave) : undefined;
      if (!col) return;
      const r = leerValor(col, crudo);
      datos[col.clave] = r.valor;
      if (r.error) errores.push(`Fila ${n + 1}: ${r.error}`);
    });
    filas.push({ id: nuevoId(), datos });
  });
  return { filas, errores, columnas: mapa };
}

export interface TablaImportada {
  columnas: ColumnaUd[];
  filas: FilaUd[];
  errores: string[];
  /** Fila (desde 1) donde estaban los encabezados. */
  encabezado: number;
}

/** De la primera hoja de un Excel o CSV a una tabla con columnas tipadas. */
export function tablaDesdeMatriz(matriz: readonly (readonly unknown[])[], nuevoId: () => string): TablaImportada {
  const h = filaDeEncabezado(matriz);
  const encabezados = (matriz[h] ?? []).map(textoDeCelda);
  const cuerpo = matriz.slice(h + 1).filter((f) => f.some((c) => !vacio(c))).slice(0, MAX_FILAS);
  const usadas: string[] = [];
  const columnas: ColumnaUd[] = [];
  const indices: number[] = [];
  encabezados.forEach((etiqueta, i) => {
    if (!etiqueta || columnas.length >= MAX_COLUMNAS) return;
    const col = columnaNueva(etiqueta, usadas);
    usadas.push(col.clave);
    const inf = inferirTipo(etiqueta, cuerpo.map((f) => f[i]));
    col.tipo = inf.tipo;
    col.opciones = inf.opciones;
    columnas.push(col);
    indices.push(i);
  });
  const errores: string[] = [];
  const filas = cuerpo.map((f, n) => {
    const datos: Record<string, Valor> = {};
    columnas.forEach((c, k) => {
      const r = leerValor(c, f[indices[k]]);
      datos[c.clave] = r.valor;
      if (r.error) errores.push(`Fila ${h + 2 + n}: ${r.error}`);
    });
    return { id: nuevoId(), datos };
  });
  return { columnas, filas, errores, encabezado: h + 1 };
}

/* ---------- exportar ------------------------------------------------------------------- */

/** Encabezados y valores listos para Excel o CSV: los números salen como números. */
export function matrizParaExportar(t: TablaDatos): (string | number | null)[][] {
  return [t.columnas.map((c) => c.etiqueta), ...t.filas.map((f) => t.columnas.map((c) => (f.datos[c.clave] ?? null)))];
}

/** CSV con punto y coma y coma decimal, para abrirlo en Excel en español (con BOM). */
export function aCsv(t: TablaDatos): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : typeof v === "number" ? textoNumero(v) : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Una celda que empieza con = + - @ se leería como fórmula en Excel: se antepone un apóstrofo.
  const seguro = (v: string | number | null) => (typeof v === "string" && /^[=+\-@]/.test(v) && aNumeroEs(v) === null ? `'${v}` : v);
  return `﻿${matrizParaExportar(t).map((f) => f.map((c) => esc(seguro(c))).join(";")).join("\r\n")}`;
}
