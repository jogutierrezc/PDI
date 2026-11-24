/* =============================================================================
   Ruta del bus UDES · horario y posición simulada.

   Lógica pura de la página pública. Los buses NO se leen de un GPS: salen de la
   UDES según el horario publicado (primera salida, última salida e intervalo) y
   su posición se calcula con el reloj. Es una simulación, y así se dice en
   pantalla. Como la posición es una función de la hora, plegar el celular,
   cambiar el tamaño o pausar no la altera.
   ========================================================================== */

export const DIA_S = 86400;
/** Colombia no cambia de hora en el año: UTC-5 todo el año. */
const OFFSET_BOGOTA_S = -5 * 3600;

export interface Horario {
  /** Minutos desde la medianoche. */
  primeraMin: number;
  ultimaMin: number;
  intervaloMin: number;
  /** Minutos que el bus descansa en la UDES antes de volver a salir. */
  paradaCampusMin: number;
}

/** «05:30» o «05:30:00» a minutos desde la medianoche. */
export function aMinutos(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora no válida: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Lo que llega de la base se acota a valores que tengan sentido. */
export function horarioSeguro(h: Horario): Horario {
  const ac = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const primera = ac(Math.round(h.primeraMin), 0, 23 * 60 + 59);
  return {
    primeraMin: primera,
    ultimaMin: ac(Math.round(h.ultimaMin), primera, 23 * 60 + 59),
    intervaloMin: ac(Math.round(h.intervaloMin), 3, 120),
    paradaCampusMin: ac(Math.round(h.paradaCampusMin), 0, 30),
  };
}

/** Segundos desde la medianoche en Bogotá para un instante (ms desde 1970). */
export function segundosDelDia(ms: number): number {
  const s = ms / 1000 + OFFSET_BOGOTA_S;
  return ((s % DIA_S) + DIA_S) % DIA_S;
}

/** Las salidas del día desde la UDES, en segundos desde la medianoche. */
export function salidas(h: Horario): number[] {
  const out: number[] = [];
  for (let m = h.primeraMin; m <= h.ultimaMin; m += h.intervaloMin) out.push(m * 60);
  return out;
}

/* --- Perfil del recorrido: en qué segundo, contado desde la salida, pasa por cada parada --- */

export interface Perfil {
  /** Segundos desde la salida hasta llegar a cada parada. */
  llega: number[];
  /** Segundos desde la salida hasta partir de cada parada (hay descanso en las intermedias). */
  sale: number[];
  /** Fracción del trazado (0 a 1) donde queda cada parada. */
  frac: number[];
  /** Duración total del recorrido, hasta volver a la UDES. */
  total: number;
}

const VEL_POR_DEFECTO = 7.5; // m/s si no hay duración calculada
const MARGEN_BUS = 0.15; // un bus es más lento que un carro
export const DESCANSO_PARADA_S = 20;

/** legs: metros entre paradas consecutivas. duracionS: lo que tarda un carro sin paradas. */
export function construirPerfil(legs: number[], duracionS: number | null, descansoS = DESCANSO_PARADA_S): Perfil {
  const suma = legs.reduce((a, l) => a + l, 0) || 1;
  const conduccion = duracionS && duracionS > 0 ? duracionS * (1 + MARGEN_BUS) : suma / VEL_POR_DEFECTO;
  const n = legs.length + 1;
  const llega: number[] = [0];
  const sale: number[] = [0];
  const frac: number[] = [0];
  let acc = 0;
  let t = 0;
  for (let i = 1; i < n; i++) {
    acc += legs[i - 1];
    t += (legs[i - 1] / suma) * conduccion;
    llega.push(t);
    const ultima = i === n - 1;
    t += ultima ? 0 : descansoS;
    sale.push(t);
    frac.push(acc / suma);
  }
  return { llega, sale, frac, total: t };
}

export interface PosicionBus {
  /** Fracción del trazado, 0 a 1. */
  frac: number;
  estado: "marcha" | "parada";
  /** Parada en la que está (si está detenido) o la siguiente (si va en marcha). */
  parada: number;
}

const suave = (u: number) => u * u * (3 - 2 * u);

/** Dónde va un bus que salió hace `e` segundos. Null si aún no salió o ya terminó. */
export function posicionBus(p: Perfil, e: number): PosicionBus | null {
  if (e < 0 || e > p.total) return null;
  const n = p.llega.length;
  for (let k = 0; k < n - 1; k++) {
    if (e <= p.sale[k]) return { frac: p.frac[k], estado: "parada", parada: k };
    if (e < p.llega[k + 1]) {
      const u = (e - p.sale[k]) / (p.llega[k + 1] - p.sale[k] || 1);
      return { frac: p.frac[k] + (p.frac[k + 1] - p.frac[k]) * suave(u), estado: "marcha", parada: k + 1 };
    }
  }
  return { frac: 1, estado: "parada", parada: n - 1 };
}

export interface BusEnRuta extends PosicionBus {
  /** Segundo del día en que salió. */
  salio: number;
}

/** Los buses que están en el recorrido a la hora t (segundos del día). */
export function busesEnRuta(h: Horario, p: Perfil, t: number): BusEnRuta[] {
  const out: BusEnRuta[] = [];
  const ultima = p.llega.length - 1;
  for (const d of salidas(h)) {
    const pos = posicionBus(p, t - d);
    // Al volver a la UDES el bus descansa y sale del mapa.
    if (pos && pos.parada !== ultima) out.push({ ...pos, salio: d });
  }
  return out;
}

export type Servicio = "antes" | "servicio" | "despues";

/** Hay servicio desde la primera salida hasta que la última salida termina su recorrido. */
export function estadoServicio(h: Horario, p: Perfil, t: number): Servicio {
  if (t < h.primeraMin * 60) return "antes";
  if (t > h.ultimaMin * 60 + p.total) return "despues";
  return "servicio";
}

/**
 * Las próximas `cuantas` llegadas a una parada (0 es la UDES: la salida), en segundos del día.
 * Pasada la última, sigue con las de mañana (sumando un día).
 */
export function proximasLlegadas(h: Horario, p: Perfil, parada: number, t: number, cuantas = 3): number[] {
  const sal = salidas(h);
  const i = Math.min(Math.max(parada, 0), p.llega.length - 1);
  const out: number[] = [];
  for (let dia = 0; dia < 2 && out.length < cuantas; dia++) {
    for (const d of sal) {
      const arribo = d + p.llega[i] + dia * DIA_S;
      // Si el bus está detenido en la parada ahora mismo, todavía cuenta.
      if (d + p.sale[i] + dia * DIA_S >= t) {
        out.push(arribo);
        if (out.length >= cuantas) break;
      }
    }
  }
  return out;
}

/* --- Textos --- */

const nb = " ";

/** 7:45 a. m., 12:00 m., 9:05 p. m. (hora de 12 con a. m. y p. m., como se dice en Colombia). */
export function formatoHora(seg: number): string {
  const s = (((Math.round(seg / 60) * 60) % DIA_S) + DIA_S) % DIA_S;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const sufijo = h === 12 && m === 0 ? "m." : h < 12 ? `a.${nb}m.` : `p.${nb}m.`;
  return `${h12}:${String(m).padStart(2, "0")}${nb}${sufijo}`;
}

/** «ahora», «en 6 min», «en 1 h 05 min». Para segundos de espera. */
export function formatoEspera(seg: number): string {
  if (seg <= 30) return "ahora";
  if (seg < 60) return "en menos de 1 min";
  const min = Math.ceil(seg / 60);
  if (min < 60) return `en ${min}${nb}min`;
  const h = Math.floor(min / 60);
  return `en ${h}${nb}h ${String(min % 60).padStart(2, "0")}${nb}min`;
}

/** La hora para un campo de hora: «07:45». */
export function aCampoHora(seg: number): string {
  const s = (((Math.round(seg / 60) * 60) % DIA_S) + DIA_S) % DIA_S;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}
