/* =============================================================================
   Programas en Cifras · la ventana de observación y la ruta de periodos.

   El CNA pide los datos de los últimos 5 años (programas que se presentan por
   primera vez o renuevan con 4 años de acreditación) o de 6, 8 o 10 según la
   acreditación previa. Cada año tiene dos periodos, «AAAA-01» y «AAAA-02».
   La ventana va hasta un periodo (`hasta`) y retrocede `anios` años.

   Los periodos se CIERRAN EN ORDEN, año por año y semestre a semestre: nunca
   se cierra uno si el anterior sigue abierto. Emitir exige la ventana
   completa (todos cerrados).

   Espejo de las funciones SQL de 0164 (si cambia uno, cambia el otro):
     periodosDeVentana   ↔ pc_codigos_ventana
     estadoPeriodos      ↔ pc_estado_periodos
     puedeCerrar         ↔ pc_cerrar_periodo
     ventanaCompatible   ↔ pc_definir_ventana
   ========================================================================== */

import type { EstadoPeriodos } from "../tipos";

export const ANIOS_VENTANA = [5, 6, 8, 10] as const;
export type AniosVentana = (typeof ANIOS_VENTANA)[number];

export interface Ventana {
  anios: AniosVentana;
  /** Último periodo de la ventana, «AAAA-01» o «AAAA-02». */
  hasta: string;
}

const CODIGO = /^(\d{4})-0([12])$/;

export function esCodigoPeriodo(codigo: string): boolean {
  return CODIGO.test(codigo);
}

export function codigoPeriodo(anio: number, semestre: 1 | 2): string {
  return `${anio}-0${semestre}`;
}

export function analizarPeriodo(codigo: string): { anio: number; semestre: 1 | 2 } | null {
  const m = CODIGO.exec(codigo);
  return m ? { anio: Number(m[1]), semestre: Number(m[2]) as 1 | 2 } : null;
}

/** «2025-02» → «2025 · II» (como lo escribe el Cuadro 02 del CNA). */
export function etiquetaPeriodo(codigo: string): string {
  const p = analizarPeriodo(codigo);
  return p ? `${p.anio} · ${p.semestre === 1 ? "I" : "II"}` : codigo;
}

/** Todos los periodos de la ventana, del más antiguo al más reciente (10 para 5 años). */
export function periodosDeVentana(v: Ventana): string[] {
  const fin = analizarPeriodo(v.hasta);
  if (!fin) return [];
  const indiceFin = fin.anio * 2 + (fin.semestre - 1);
  const salida: string[] = [];
  for (let i = indiceFin - v.anios * 2 + 1; i <= indiceFin; i++) salida.push(codigoPeriodo(Math.floor(i / 2), ((i % 2) + 1) as 1 | 2));
  return salida;
}

/** El último semestre ya terminado en la fecha dada (enero–junio es el 01, julio–diciembre el 02): la ventana que se propone por defecto. */
export function ultimoSemestreTerminado(hoy: Date | string = new Date()): string {
  const d = typeof hoy === "string" ? new Date(`${hoy}T00:00:00Z`) : hoy;
  const anio = d.getUTCFullYear();
  const mes = d.getUTCMonth() + 1;
  return mes <= 6 ? codigoPeriodo(anio - 1, 2) : codigoPeriodo(anio, 1);
}

export function ventanaPorDefecto(hoy: Date | string = new Date(), anios: AniosVentana = 5): Ventana {
  return { anios, hasta: ultimoSemestreTerminado(hoy) };
}

/** El próximo periodo que se puede cerrar: el primero de la ventana que no está cerrado. Nulo si están todos. */
export function siguientePorCerrar(periodos: readonly string[], cerrados: Iterable<string>): string | null {
  const c = new Set(cerrados);
  return periodos.find((p) => !c.has(p)) ?? null;
}

/** Estado de la ventana, igual que lo devuelve pc_estado_periodos. */
export function estadoPeriodos(ventana: Ventana | null, cerrados: readonly { codigo: string; cerrado_en?: string | null }[]): EstadoPeriodos {
  if (!ventana) return { ventana: null, periodos: [], siguiente: null, completa: false, cerrados: 0, total: 0 };
  const codigos = periodosDeVentana(ventana);
  const hechos = new Map(cerrados.map((c) => [c.codigo, c.cerrado_en ?? null]));
  const periodos = codigos.map((codigo) => ({ codigo, cerrado: hechos.has(codigo), cerrado_en: hechos.get(codigo) ?? null }));
  const n = periodos.filter((p) => p.cerrado).length;
  return {
    ventana,
    periodos,
    siguiente: siguientePorCerrar(codigos, hechos.keys()),
    completa: codigos.length > 0 && n === codigos.length,
    cerrados: n,
    total: codigos.length,
  };
}

export interface ResultadoCierre {
  ok: boolean;
  /** Por qué no, en español; nulo si ok. */
  motivo: string | null;
}

/**
 * ¿Se puede cerrar este periodo? Solo el que sigue en el orden; los archivos
 * del Cuadro Maestro no pueden tener errores de validación (`erroresCna`).
 */
export function puedeCerrar(codigo: string, estado: Pick<EstadoPeriodos, "ventana" | "periodos" | "siguiente">, erroresCna = 0): ResultadoCierre {
  if (!estado.ventana) return { ok: false, motivo: "Defina primero la ventana de observación." };
  const p = estado.periodos.find((x) => x.codigo === codigo);
  if (!p) return { ok: false, motivo: `El periodo ${codigo} no está en la ventana de observación.` };
  if (p.cerrado) return { ok: false, motivo: `El periodo ${codigo} ya está cerrado.` };
  if (estado.siguiente !== codigo) return { ok: false, motivo: `Hay que cerrar primero el periodo ${estado.siguiente}: se cierran en orden.` };
  if (erroresCna > 0) return { ok: false, motivo: `Corrija los ${erroresCna} errores de los archivos del Cuadro Maestro para cerrar el periodo.` };
  return { ok: true, motivo: null };
}

/**
 * Cambiar la ventana es posible si lo ya cerrado sigue siendo el comienzo de
 * la nueva ruta (los mismos primeros periodos, sin huecos). Con nada cerrado
 * siempre se puede.
 */
export function ventanaCompatible(nueva: Ventana, cerrados: readonly string[]): ResultadoCierre {
  const ruta = periodosDeVentana(nueva);
  const n = cerrados.length;
  const ordenados = [...cerrados].sort();
  if (ordenados.every((c, i) => ruta[i] === c) && n <= ruta.length) return { ok: true, motivo: null };
  return { ok: false, motivo: "Hay periodos cerrados que no encajan en la nueva ventana: reabra los últimos o elija otra." };
}

/** Años de la ventana que muestra la ruta: {2021: [2021-01, 2021-02], …}. */
export function porAnio(periodos: readonly string[]): { anio: number; periodos: string[] }[] {
  const salida: { anio: number; periodos: string[] }[] = [];
  for (const p of periodos) {
    const a = analizarPeriodo(p)?.anio;
    if (a === undefined) continue;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.anio === a) ultimo.periodos.push(p);
    else salida.push({ anio: a, periodos: [p] });
  }
  return salida;
}
