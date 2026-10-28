/// <reference lib="webworker" />
/* =============================================================================
   Pilo at Work · lectura de archivos EN ESTE EQUIPO (Web Worker).

   Abre un Excel (.xlsx) o un CSV, detecta tipos y columnas sensibles y calcula
   agregados. Las filas viven SOLO aquí, en la memoria de este worker: nunca se
   envían a ningún sitio. Hacia la página solo salen el esquema, una muestra con
   las columnas sensibles tapadas y los agregados que la persona pida.
   ========================================================================== */

import ExcelJS from "exceljs";

type Celda = string | number | boolean | null;
export type Tipo = "numero" | "texto" | "fecha";
export interface Columna {
  nombre: string;
  tipo: Tipo;
  sensible: boolean;
  motivo: string;
}
export type Entrada =
  | { id: number; accion: "abrir"; nombre: string; buffer: ArrayBuffer }
  | { id: number; accion: "agregar"; op: string; columna: string; agrupar: string; limite: number }
  | { id: number; accion: "cerrar" };

let columnas: Columna[] = [];
let filas: Celda[][] = [];

const SENSIBLE_NOMBRE = /(documento|c[eé]dula|identific|\bcc\b|\bti\b|correo|e-?mail|mail|tel[eé]fono|celular|m[oó]vil|direcci[oó]n|nombre|apellido|c[oó]digo.*estudiante|n[uú]mero.*(doc|id)|nit|pasaporte|fecha.*nacimiento|nacimiento|eps|salario|sueldo|contrase)/i;

function csv(texto: string): string[][] {
  const sep = (texto.split("\n", 1)[0].match(/;/g) ?? []).length > (texto.split("\n", 1)[0].match(/,/g) ?? []).length ? ";" : ",";
  const out: string[][] = [];
  let fila: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) {
      if (c === '"' && texto[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      fila.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(cur);
      cur = "";
      if (fila.some((x) => x !== "")) out.push(fila);
      fila = [];
    } else cur += c;
  }
  fila.push(cur);
  if (fila.some((x) => x !== "")) out.push(fila);
  return out;
}

function aCelda(v: unknown): Celda {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return aCelda(o.result);
    return null;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v).trim();
  if (s === "") return null;
  return /^-?\d+([.,]\d+)?$/.test(s) && !/^0\d+/.test(s) ? Number(s.replace(",", ".")) : s;
}

function perfilar(cabecera: string[], datos: Celda[][]): Columna[] {
  return cabecera.map((nombre, j) => {
    const muestra = datos.slice(0, 400).map((r) => r[j]).filter((v) => v != null);
    const nums = muestra.filter((v) => typeof v === "number").length;
    const fechas = muestra.filter((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)).length;
    const tipo: Tipo = muestra.length && nums / muestra.length > 0.9 ? "numero" : muestra.length && fechas / muestra.length > 0.9 ? "fecha" : "texto";
    let motivo = "";
    if (SENSIBLE_NOMBRE.test(nombre)) motivo = "El nombre de la columna parece un dato personal";
    else if (muestra.some((v) => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v))) motivo = "Contiene correos";
    else if (muestra.length > 5 && muestra.filter((v) => typeof v === "number" && v >= 1e6 && v < 1e11 && Number.isInteger(v)).length / muestra.length > 0.8) motivo = "Parece un número de identificación";
    else if (muestra.length > 5 && tipo === "texto" && new Set(muestra).size / muestra.length > 0.95 && muestra.every((v) => String(v).length > 5)) motivo = "Casi todos los valores son distintos (puede identificar personas)";
    return { nombre: nombre || `Columna ${j + 1}`, tipo, sensible: Boolean(motivo), motivo };
  });
}

async function abrir(nombre: string, buffer: ArrayBuffer) {
  let tabla: Celda[][] = [];
  if (/\.csv$|\.txt$/i.test(nombre)) tabla = csv(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "")).map((f) => f.map((c) => aCelda(c)));
  else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const hoja = wb.worksheets[0];
    if (!hoja) throw new Error("El libro no tiene hojas.");
    hoja.eachRow({ includeEmpty: false }, (fila) => {
      const v = fila.values as unknown[];
      tabla.push(Array.from({ length: Math.max(0, v.length - 1) }, (_, i) => aCelda(v[i + 1])));
    });
  }
  if (tabla.length < 2) throw new Error("El archivo no tiene filas para leer.");
  const ancho = Math.max(...tabla.slice(0, 50).map((f) => f.length));
  const cabecera = Array.from({ length: ancho }, (_, j) => String(tabla[0][j] ?? "").trim());
  filas = tabla.slice(1).map((f) => Array.from({ length: ancho }, (_, j) => f[j] ?? null));
  columnas = perfilar(cabecera, filas);
  return {
    columnas,
    total: filas.length,
    // Una muestra con lo sensible tapado: así la persona ve el archivo sin que nada salga.
    muestra: filas.slice(0, 5).map((f) => f.map((v, j) => (columnas[j].sensible ? "•••••" : v))),
  };
}

function agregar(op: string, columna: string, agrupar: string, limite: number) {
  const ic = columnas.findIndex((c) => c.nombre === columna);
  const ig = columnas.findIndex((c) => c.nombre === agrupar);
  if (agrupar && ig < 0) throw new Error(`No existe la columna «${agrupar}».`);
  if (op !== "contar" && ic < 0) throw new Error(`Falta la columna a calcular.`);
  for (const c of [ic >= 0 ? columnas[ic] : null, ig >= 0 ? columnas[ig] : null]) if (c?.sensible) throw new Error(`La columna «${c.nombre}» es sensible y está cerrada.`);
  if (op !== "contar" && columnas[ic].tipo !== "numero") throw new Error(`«${columnas[ic].nombre}» no es numérica.`);
  const grupos = new Map<string, number[]>();
  for (const f of filas) {
    const g = ig >= 0 ? String(f[ig] ?? "(vacío)") : "Total";
    const v = ic >= 0 ? f[ic] : 1;
    if (op !== "contar" && typeof v !== "number") continue;
    let a = grupos.get(g);
    if (!a) grupos.set(g, (a = []));
    a.push(typeof v === "number" ? v : 1);
  }
  const calc = (a: number[]) => (op === "contar" ? a.length : op === "suma" ? a.reduce((x, y) => x + y, 0) : op === "promedio" ? a.reduce((x, y) => x + y, 0) / a.length : op === "maximo" ? Math.max(...a) : Math.min(...a));
  const res = [...grupos.entries()].map(([grupo, a]) => ({ grupo, valor: Math.round(calc(a) * 1000) / 1000, n: a.length })).sort((x, y) => y.valor - x.valor);
  return { total: filas.length, grupos: res.length, resultado: res.slice(0, Math.max(1, limite)) };
}

self.onmessage = async (e: MessageEvent<Entrada>) => {
  const m = e.data;
  try {
    if (m.accion === "abrir") self.postMessage({ id: m.id, ok: true, datos: await abrir(m.nombre, m.buffer) });
    else if (m.accion === "agregar") self.postMessage({ id: m.id, ok: true, datos: agregar(m.op, m.columna, m.agrupar, m.limite) });
    else {
      filas = [];
      columnas = [];
      self.postMessage({ id: m.id, ok: true, datos: null });
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: err instanceof Error ? err.message : "No se pudo leer el archivo." });
  }
};
