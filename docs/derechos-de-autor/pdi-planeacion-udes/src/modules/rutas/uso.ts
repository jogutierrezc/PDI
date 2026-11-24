/* =============================================================================
   Ruta del bus UDES · uso que se muestra al público (lógica pura).

   Todo sale de conteos reales (bus_ridership), ya agregados por la base
   (migración 0142). Aquí solo se ordena y se interpreta. No hay modelo de
   demanda ni estudiantes sintéticos: sin conteos, no hay cifras.
   ========================================================================== */

export interface UsoHora {
  /** Hora del día en Colombia, 0 a 23. */
  hora: number;
  /** Promedio de abordajes en esa hora por día de servicio. */
  promedio: number;
  abordajes: number;
}

export interface UsoParada {
  routeId: string;
  stopId: string;
  /** Posición de la parada en su ruta (0 es la UDES). */
  seq: number;
  nombre: string;
  abordajes: number;
  /** Porcentaje del total de abordajes del periodo. */
  participacion: number;
}

export interface UsoRuta {
  routeId: string;
  codigo: string;
  nombre: string;
  abordajes: number;
}

export interface UsoPublico {
  /** Días del periodo que se consultó. */
  dias: number;
  /** Abordajes contados en el periodo (todas las rutas públicas). */
  total: number;
  horas: UsoHora[];
  paradas: UsoParada[];
  rutas: UsoRuta[];
  /** Verdadero solo en las demostraciones del diseño: los números no son conteos reales. */
  ejemplo?: boolean;
}

/** El servicio va de las 5 a. m. a las 10 p. m.: es el rango del gráfico. */
export const HORA_PRIMERA = 5;
export const HORA_ULTIMA = 22;

export type Nivel = "tranquilo" | "moderado" | "concurrido";

/**
 * Umbrales de la lectura en palabras, contra el pico de la propia ruta
 * (la hora con más abordajes promedio):
 *   menos de un tercio del pico   → tranquilo
 *   entre un tercio y dos tercios → moderado
 *   dos tercios o más             → concurrido
 */
export const UMBRAL_TRANQUILO = 1 / 3;
export const UMBRAL_CONCURRIDO = 2 / 3;

export interface Barra {
  hora: number;
  /** Promedio de abordajes; null si no hay conteos suficientes en esa hora (un vacío no es un cero). */
  promedio: number | null;
  /** Altura relativa al pico, 0 a 1. */
  alto: number;
}

/** Las barras de 5 a 22, a escala del pico. */
export function barrasPorHora(horas: UsoHora[]): { barras: Barra[]; pico: UsoHora | null } {
  const en = horas.filter((h) => h.hora >= HORA_PRIMERA && h.hora <= HORA_ULTIMA);
  const pico = en.reduce<UsoHora | null>((m, h) => (m === null || h.promedio > m.promedio ? h : m), null);
  const barras: Barra[] = [];
  for (let h = HORA_PRIMERA; h <= HORA_ULTIMA; h++) {
    const f = en.find((x) => x.hora === h);
    barras.push({ hora: h, promedio: f ? f.promedio : null, alto: f && pico && pico.promedio > 0 ? f.promedio / pico.promedio : 0 });
  }
  return { barras, pico };
}

export interface Lectura {
  /** Null si no hay conteos suficientes en esa hora. */
  nivel: Nivel | null;
  /** La proporción del pico, 0 a 1, si hay dato. */
  proporcion: number | null;
}

/** «Tranquilo, moderado o concurrido» para una hora, comparada con el pico de la ruta. */
export function lecturaDeHora(horas: UsoHora[], hora: number): Lectura {
  const { barras, pico } = barrasPorHora(horas);
  const b = barras.find((x) => x.hora === hora);
  if (!b || b.promedio === null || !pico || pico.promedio <= 0) return { nivel: null, proporcion: null };
  const p = b.promedio / pico.promedio;
  return { nivel: p < UMBRAL_TRANQUILO ? "tranquilo" : p < UMBRAL_CONCURRIDO ? "moderado" : "concurrido", proporcion: p };
}

/** Las paradas de una ruta, de la más a la menos usada. */
export function paradasDeRuta(paradas: UsoParada[], routeId: string): UsoParada[] {
  return paradas.filter((p) => p.routeId === routeId).sort((a, b) => b.abordajes - a.abordajes || a.seq - b.seq);
}

/** Suma por ruta los abordajes de sus paradas. Solo se muestra si más de una ruta tiene datos. */
export function rutasMasUsadas(paradas: UsoParada[], nombres: Map<string, { codigo: string; nombre: string }>): UsoRuta[] {
  const m = new Map<string, number>();
  for (const p of paradas) m.set(p.routeId, (m.get(p.routeId) ?? 0) + p.abordajes);
  return [...m.entries()]
    .map(([routeId, abordajes]) => ({ routeId, abordajes, codigo: nombres.get(routeId)?.codigo ?? "", nombre: nombres.get(routeId)?.nombre ?? "Ruta" }))
    .sort((a, b) => b.abordajes - a.abordajes);
}

/** Hay algo que mostrar: conteos suficientes de horas o de paradas. */
export const hayUso = (u: UsoPublico | null | undefined): u is UsoPublico => Boolean(u && (u.horas.length > 0 || u.paradas.length > 0));

/** El número con separador de miles a la colombiana. */
export const miles = (n: number) => Math.round(n).toLocaleString("es-CO");
