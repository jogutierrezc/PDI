/* =============================================================================
   Datos requeridos por Planeación (migración 0253) · lógica pura.

   Planeación define, por plantilla, qué datos pide: dato, fuente y condición.
   La unidad los responde en Resultados por dimensión: cada respuesta es un
   IndicadorManual con `requerido: <clave>`. Aquí se decide cuáles están
   respondidos y cuáles faltan. Sin acceso a datos, sin lanzar.
   ========================================================================== */

import { idNuevo, normalizar } from "./indicadores-manual";
import type { IndicadorManual } from "./indicadores-manual";
import type { Condicion, Plantilla } from "./types";

export type FuenteTipoReq = "manual" | "excel" | "auto" | "pdi";

export const FUENTES_REQ: { id: FuenteTipoReq; texto: string }[] = [
  { id: "manual", texto: "Manual" },
  { id: "excel", texto: "Excel" },
  { id: "auto", texto: "UDES en Cifras" },
  { id: "pdi", texto: "PDI" },
];
export const textoFuenteReq = (t: string) => FUENTES_REQ.find((f) => f.id === t)?.texto ?? "Manual";

export interface DatoRequerido {
  id: string;
  ciclo_id: string;
  plantilla: Plantilla;
  clave: string;
  dato: string;
  fuente_tipo: FuenteTipoReq;
  fuente_nombre: string;
  criterio: string;
  unidad: string;
  mayor_mejor: boolean;
  condicion: Condicion;
  orden: number;
}

export const claveRequerido = () => `req_${idNuevo()}`;
export const NOTA_MINIMA = 10;

export function requeridoNuevo(ciclo_id: string, plantilla: Plantilla, orden: number): DatoRequerido {
  return { id: crypto.randomUUID(), ciclo_id, plantilla, clave: claveRequerido(), dato: "", fuente_tipo: "manual", fuente_nombre: "", criterio: "", unidad: "", mayor_mejor: true, condicion: "justificar", orden };
}

/** Lo que llega de la base, en forma segura. */
export function normalizarRequerido(x: Record<string, unknown>): DatoRequerido | null {
  if (typeof x.id !== "string" || typeof x.clave !== "string" || typeof x.ciclo_id !== "string") return null;
  const plantilla = x.plantilla as Plantilla;
  if (!["A", "B", "C", "D"].includes(plantilla)) return null;
  const fuente = FUENTES_REQ.some((f) => f.id === x.fuente_tipo) ? (x.fuente_tipo as FuenteTipoReq) : "manual";
  const condicion = (["justificar", "sugerido", "no"] as const).find((c) => c === x.condicion) ?? "justificar";
  return {
    id: x.id,
    ciclo_id: x.ciclo_id,
    plantilla,
    clave: x.clave,
    dato: typeof x.dato === "string" ? x.dato : "",
    fuente_tipo: fuente,
    fuente_nombre: typeof x.fuente_nombre === "string" ? x.fuente_nombre : "",
    criterio: typeof x.criterio === "string" ? x.criterio : "",
    unidad: typeof x.unidad === "string" ? x.unidad : "",
    mayor_mejor: x.mayor_mejor !== false,
    condicion,
    orden: typeof x.orden === "number" ? x.orden : 0,
  };
}

/** Los de una plantilla que se muestran a la unidad (sin los «no pedir»), en su orden. */
export const requeridosDePlantilla = (todos: DatoRequerido[], plantilla: Plantilla) =>
  todos.filter((r) => r.plantilla === plantilla && r.condicion !== "no" && r.dato.trim()).sort((a, b) => a.orden - b.orden);

/** Los requeridos que caen en una sección dim: por su criterio base; sin criterio o con uno aprobado, en la primera sección dim. */
export function requeridosDeSeccion(requeridos: DatoRequerido[], dimsDeSecciones: { clave: string; dims: string[] }[], seccion: string): DatoRequerido[] {
  const primera = dimsDeSecciones[0]?.clave;
  return requeridos.filter((r) => {
    const dueña = dimsDeSecciones.find((s) => s.dims.includes(r.criterio))?.clave ?? primera;
    return dueña === seccion;
  });
}

/** ¿Qué respondió la unidad para un requerido? */
export const respuestaDe = (indicadores: IndicadorManual[], clave: string) => indicadores.find((i) => i.requerido === clave);

/** Lo que falta a una respuesta de un requerido «justificar»; vacío si cumple o si no es obligatorio. */
export function faltaRequerido(r: DatoRequerido, resp: IndicadorManual | undefined): string[] {
  if (r.condicion !== "justificar") return [];
  const f: string[] = [];
  if (!resp || resp.actual === null) f.push("la cifra actual");
  if (!resp || resp.meta === null) f.push("la meta");
  if (!resp || resp.nota.trim().length < NOTA_MINIMA) f.push(`la justificación (mínimo ${NOTA_MINIMA} caracteres)`);
  return f;
}

export interface EstadoRequeridos {
  /** Pedidos a la unidad (justificar + sugerido). */
  total: number;
  respondidos: DatoRequerido[];
  /** Obligatorios con algo por llenar. */
  faltan: { dato: DatoRequerido; falta: string[] }[];
  /** Sugeridos sin cifra actual: no bloquean. */
  sugeridosVacios: number;
}

/** Dado el contenido de una sección dim y lo que pide Planeación, qué está respondido y qué falta. */
export function estadoRequeridos(contenidoIndicadores: unknown, requeridos: DatoRequerido[]): EstadoRequeridos {
  const inds = normalizar(contenidoIndicadores);
  const respondidos: DatoRequerido[] = [];
  const faltan: EstadoRequeridos["faltan"] = [];
  let sugeridosVacios = 0;
  for (const r of requeridos) {
    if (r.condicion === "no") continue;
    const resp = respuestaDe(inds, r.clave);
    const falta = faltaRequerido(r, resp);
    if (r.condicion === "justificar") {
      if (falta.length) faltan.push({ dato: r, falta });
      else respondidos.push(r);
    } else if (resp && resp.actual !== null) respondidos.push(r);
    else sugeridosVacios += 1;
  }
  return { total: requeridos.filter((r) => r.condicion !== "no").length, respondidos, faltan, sugeridosVacios };
}

/** Un IndicadorManual vacío que responde a un requerido (con sus datos fijos copiados). */
export function respuestaNueva(r: DatoRequerido, criterioNombre = ""): IndicadorManual {
  return { id: idNuevo(), criterio: r.criterio, criterio_nombre: criterioNombre, nombre: r.dato, unidad: r.unidad, mayorMejor: r.mayor_mejor, actual: null, anterior: null, meta: null, fuente: r.fuente_nombre, nota: "", requerido: r.clave };
}

/* ---------- Excel de la configuración ------------------------------------------------ */

export const COLUMNAS_REQ = ["Plantilla", "Dato", "Fuente (tipo)", "Fuente (nombre)", "Criterio", "Unidad", "Qué es mejor", "Condición"] as const;
const CONDICION_TEXTO: Record<Condicion, string> = { justificar: "Justificar", sugerido: "Sugerido", no: "No pedir" };

export function filasDeRequeridos(lista: DatoRequerido[], nombreCriterio: (id: string) => string): (string | number | null)[][] {
  return lista.map((r) => [r.plantilla, r.dato, textoFuenteReq(r.fuente_tipo), r.fuente_nombre, nombreCriterio(r.criterio), r.unidad.trim(), r.mayor_mejor ? "Más es mejor" : "Menos es mejor", CONDICION_TEXTO[r.condicion]]);
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Lee las filas del Excel (encabezado incluido). Los criterios se buscan por nombre. */
export function leerFilasRequeridos(filas: string[][], ciclo_id: string, criterios: { id: string; nombre: string }[], inicio: Record<Plantilla, number>): { datos: DatoRequerido[]; avisos: string[] } {
  const porNombre = new Map(criterios.map((c) => [sinTildes(c.nombre), c.id]));
  const orden = { ...inicio };
  const datos: DatoRequerido[] = [];
  const avisos: string[] = [];
  filas.slice(1).forEach((f, n) => {
    const c = COLUMNAS_REQ.map((_, k) => String(f[k] ?? "").trim());
    if (c.every((x) => !x)) return;
    const [pl, dato, ft, fn, crit, un, sentido, cond] = c;
    const plantilla = pl.toUpperCase().slice(0, 1) as Plantilla;
    if (!["A", "B", "C", "D"].includes(plantilla)) return void avisos.push(`Fila ${n + 2}: plantilla «${pl}» no es A, B, C ni D; se omitió.`);
    if (dato.length < 3 || dato.length > 120) return void avisos.push(`Fila ${n + 2}: el dato debe tener entre 3 y 120 caracteres; se omitió.`);
    const tipo = FUENTES_REQ.find((x) => sinTildes(x.texto) === sinTildes(ft))?.id ?? "manual";
    const condicion = (["justificar", "sugerido", "no"] as const).find((k) => sinTildes(CONDICION_TEXTO[k]) === sinTildes(cond)) ?? "justificar";
    const criterio = porNombre.get(sinTildes(crit)) ?? "";
    if (crit && !criterio) avisos.push(`Fila ${n + 2}: el criterio «${crit}» no existe; quedó sin criterio.`);
    orden[plantilla] += 1;
    datos.push({
      id: crypto.randomUUID(),
      ciclo_id,
      plantilla,
      clave: claveRequerido() + n,
      dato,
      fuente_tipo: tipo,
      fuente_nombre: fn.slice(0, 200),
      criterio,
      unidad: un ? (un.startsWith(" ") ? un : /^[%$]|^pp/i.test(un) ? ` ${un}` : "") : "",
      mayor_mejor: !/menos|bajar|baja|disminu/i.test(sentido),
      condicion,
      orden: orden[plantilla],
    });
  });
  return { datos, avisos };
}
