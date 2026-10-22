/* =============================================================================
   Encuestas con Pilo · la tabla de respuestas.

   Puro: de los aportes leídos saca las filas de cada vista («Por aporte» o «Por
   cifra»), las filtra, las ordena y arma lo que se copia a Excel o se descarga
   en CSV. La interfaz solo pinta lo que esto devuelve.
   ========================================================================== */

import { textoEstado, textoTipoAporte } from "../tipos";
import type { Aporte, Cifra, EstadoAporte, TipoAporte } from "../tipos";
import { formatearValor } from "./validacion";

export type Vista = "aporte" | "cifra";

export interface Filtros {
  q: string;
  tipo: TipoAporte | "";
  dependencia: string;
  estado: EstadoAporte | "";
}

export const SIN_FILTROS: Filtros = { q: "", tipo: "", dependencia: "", estado: "" };

export type ClaveColumna = "n" | "fecha" | "dependencia" | "correo" | "tipo" | "titulo" | "descripcion" | "cifras" | "estado" | "que" | "tipoCifra" | "valor";

export interface Columna {
  clave: ClaveColumna;
  titulo: string;
  numerica?: boolean;
}

export const COLUMNAS: Record<Vista, readonly Columna[]> = {
  aporte: [
    { clave: "n", titulo: "#", numerica: true },
    { clave: "fecha", titulo: "Recibido" },
    { clave: "dependencia", titulo: "Dependencia" },
    { clave: "correo", titulo: "Correo" },
    { clave: "tipo", titulo: "Tipo" },
    { clave: "titulo", titulo: "Logro o reto" },
    { clave: "descripcion", titulo: "Descripción" },
    { clave: "cifras", titulo: "Cifras", numerica: true },
    { clave: "estado", titulo: "Estado" },
  ],
  cifra: [
    { clave: "n", titulo: "#", numerica: true },
    { clave: "dependencia", titulo: "Dependencia" },
    { clave: "tipo", titulo: "Tipo" },
    { clave: "titulo", titulo: "Logro o reto" },
    { clave: "que", titulo: "Cifra" },
    { clave: "tipoCifra", titulo: "Tipo de cifra" },
    { clave: "valor", titulo: "Valor", numerica: true },
    { clave: "estado", titulo: "Estado" },
  ],
};

/** Una fila de la tabla: el aporte, y la cifra cuando la vista es «Por cifra». */
export interface Fila {
  /** Clave estable de la fila (aporte o aporte + cifra). */
  clave: string;
  aporte: Aporte;
  /** Número de orden de llegada del aporte (1 = el primero que llegó). */
  n: number;
  cifra: Cifra | null;
}

export interface Orden {
  clave: ClaveColumna;
  /** 1 ascendente, -1 descendente. */
  sentido: 1 | -1;
}

/** Texto de la unidad de una cifra: «Dinero», «Porcentaje» o la palabra elegida. */
export const textoTipoCifra = (c: Cifra): string =>
  c.tipo === "otro" ? (c.otro ?? "Otro") : c.tipo === "estudiantes" ? "Estudiantes" : c.tipo === "programas" ? "Programas" : c.tipo === "dinero" ? "Dinero" : "Porcentaje";

export const valorDeCifra = (c: Cifra): string => formatearValor(c.valor, c.tipo);

/** «2026-10-14 09:12», hora de Bogotá. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** ¿Sigue vigente (no está en la papelera)? */
export const vigente = (a: Aporte): boolean => !a.borrado_en;

export const DIAS_PAPELERA = 30;

/** Días que le quedan a una respuesta borrada antes de la purga (0 si ya venció). */
export function diasParaPurga(borradoEn: string, ahora: Date = new Date()): number {
  const t = new Date(borradoEn).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil(DIAS_PAPELERA - (ahora.getTime() - t) / 86_400_000));
}

/** Los aportes vigentes en orden de llegada, con su número. */
export function numerar(aportes: readonly Aporte[]): { aporte: Aporte; n: number }[] {
  return aportes
    .filter(vigente).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map((aporte, i) => ({ aporte, n: i + 1 }));
}

const cifrasOrdenadas = (a: Aporte): Cifra[] => [...a.cifras].sort((x, y) => x.orden - y.orden);

/** Lo que busca el cuadro de búsqueda: todo el texto de la fila, en minúsculas. */
function pajar(a: Aporte): string {
  return [a.dependencia, a.correo, textoTipoAporte(a.tipo), a.titulo, a.descripcion, textoEstado(a.estado), ...a.cifras.map((c) => `${c.que} ${textoTipoCifra(c)}`)].join(" ").toLowerCase();
}

export function pasaFiltros(a: Aporte, f: Filtros): boolean {
  const q = f.q.trim().toLowerCase();
  return (!f.tipo || a.tipo === f.tipo) && (!f.dependencia || a.dependencia === f.dependencia) && (!f.estado || a.estado === f.estado) && (!q || pajar(a).includes(q));
}

function valorOrden(f: Fila, clave: ClaveColumna): string | number {
  const a = f.aporte;
  switch (clave) {
    case "n":
      return f.n;
    case "fecha":
      return a.created_at;
    case "dependencia":
      return a.dependencia;
    case "correo":
      return a.correo;
    case "tipo":
      return textoTipoAporte(a.tipo);
    case "titulo":
      return a.titulo;
    case "descripcion":
      return a.descripcion;
    case "cifras":
      return a.cifras.length;
    case "estado":
      return textoEstado(a.estado);
    case "que":
      return f.cifra?.que ?? "";
    case "tipoCifra":
      return f.cifra ? textoTipoCifra(f.cifra) : "";
    case "valor":
      return f.cifra?.valor ?? 0;
  }
}

/** Las filas de la vista, filtradas y ordenadas. */
export function filasDe(aportes: readonly Aporte[], vista: Vista, filtros: Filtros, orden: Orden): Fila[] {
  const filas: Fila[] = [];
  for (const { aporte, n } of numerar(aportes)) {
    if (!pasaFiltros(aporte, filtros)) continue;
    if (vista === "aporte") filas.push({ clave: aporte.id, aporte, n, cifra: null });
    else for (const c of cifrasOrdenadas(aporte)) filas.push({ clave: `${aporte.id}:${c.id}`, aporte, n, cifra: c });
  }
  return filas.sort((x, y) => {
    const a = valorOrden(x, orden.clave);
    const b = valorOrden(y, orden.clave);
    const c = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");
    return c * orden.sentido || x.n - y.n || x.clave.localeCompare(y.clave);
  });
}

/** Las dependencias que hay, en orden alfabético, para el filtro. */
export const dependenciasDe = (aportes: readonly Aporte[]): string[] => [...new Set(aportes.filter(vigente).map((a) => a.dependencia))].sort((a, b) => a.localeCompare(b, "es"));

export interface Resumen {
  recibidas: number;
  logros: number;
  retos: number;
  dependencias: number;
  cifras: number;
}

export function resumir(todos: readonly Aporte[]): Resumen {
  const vivos = todos.filter(vigente);
  return {
    recibidas: vivos.length,
    logros: vivos.filter((a) => a.tipo === "logro").length,
    retos: vivos.filter((a) => a.tipo === "reto").length,
    dependencias: new Set(vivos.map((a) => a.dependencia)).size,
    cifras: vivos.reduce((s, a) => s + a.cifras.length, 0),
  };
}

/* ---------- Exportar ---------- */

/** Encabezados y filas de texto de lo que se ve en pantalla (para copiar y descargar). */
export function matrizDe(filas: readonly Fila[], vista: Vista): { encabezados: string[]; filas: (string | number)[][] } {
  if (vista === "cifra") {
    return {
      encabezados: ["#", "Recibido", "Dependencia", "Correo", "Tipo", "Logro o reto", "Cifra", "Tipo de cifra", "Valor", "Estado"],
      filas: filas.map((f) => [f.n, fechaCorta(f.aporte.created_at), f.aporte.dependencia, f.aporte.correo, textoTipoAporte(f.aporte.tipo), f.aporte.titulo, f.cifra?.que ?? "", f.cifra ? textoTipoCifra(f.cifra) : "", f.cifra?.valor ?? "", textoEstado(f.aporte.estado)]),
    };
  }
  return {
    encabezados: ["#", "Recibido", "Dependencia", "Correo", "Tipo", "Logro o reto", "Descripción", "Cifras", "Estado"],
    filas: filas.map((f) => [f.n, fechaCorta(f.aporte.created_at), f.aporte.dependencia, f.aporte.correo, textoTipoAporte(f.aporte.tipo), f.aporte.titulo, f.aporte.descripcion, cifrasEnTexto(f.aporte), textoEstado(f.aporte.estado)]),
  };
}

/** «Graduados: 412 | Aumento: 18 %» */
export const cifrasEnTexto = (a: Aporte): string => cifrasOrdenadas(a).map((c) => `${c.que}: ${valorDeCifra(c)}`).join(" | ");

/**
 * Una celda de texto a salvo de que Excel la tome por fórmula: lo que escribe quien
 * responde puede empezar por = + - @ (o tabulador / retorno). Los números pasan tal cual.
 */
export function celdaSegura(v: string | number): string {
  if (typeof v === "number") return String(v);
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Texto para pegar en Excel: tabuladores entre columnas, sin saltos dentro de una celda. */
export function aTsv(m: { encabezados: string[]; filas: (string | number)[][] }): string {
  const celda = (v: string | number) => celdaSegura(v).replace(/[\t\r\n]+/g, " ");
  return [m.encabezados, ...m.filas].map((f) => f.map(celda).join("\t")).join("\n");
}

/** CSV para Excel en español: punto y coma, comillas dobles y marca de orden de bytes UTF-8. */
export function aCsv(m: { encabezados: string[]; filas: (string | number)[][] }): string {
  const celda = (v: string | number) => `"${celdaSegura(v).replace(/"/g, '""')}"`;
  return `﻿${[m.encabezados, ...m.filas].map((f) => f.map(celda).join(";")).join("\r\n")}`;
}

/* ---------- Fecha de cierre ---------- */

/** La fecha de cierre como «AAAA-MM-DD» para el campo de fecha (en hora de Bogotá si viene un instante). */
export function cierreAFecha(valor: string | null): string {
  if (!valor) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Lo que se guarda: el último segundo de ese día en Bogotá (sirve para una columna de fecha o de instante). */
export const fechaACierre = (fecha: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59-05:00` : null);

/** ¿La encuesta ya no recibe aportes? Cerrada a mano, o pasada la fecha de cierre (el día de cierre cuenta completo, hora de Bogotá). */
export function estaCerrada(e: { abierta: boolean; cierra_el: string | null }, ahora: Date = new Date()): boolean {
  if (!e.abierta) return true;
  const fin = cierreAFecha(e.cierra_el);
  if (!fin) return false;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  return hoy > fin;
}
