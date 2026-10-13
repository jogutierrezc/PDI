/* =============================================================================
   Analizador de posicionamiento · Colombia y la UDES.

   · País: THE da el país en `location` («Colombia»). Por si una carga futura
     no lo trae, se reconoce también por el nombre («Simón Bolívar University
     (Colombia)», «Saint Thomas University, Colombia») y por la lista de las 15
     de 2026, verificada contra la tabla.
   · La UDES aparece como «University of Santander».
   · La escalera nacional ordena por banda (lo único que THE publica); dentro
     de una banda nadie sabe quién va delante: se comparte el puesto («=2») y
     la posición esperada es el centro de los puestos empatados.
   ========================================================================== */

import { bandaSiguiente, centroFila, type Calibracion } from "./calibracion";
import type { FilaTHE } from "./tipos";

/** Las 15 universidades colombianas de THE Impact 2026, tal como las nombra THE. */
export const COLOMBIA_2026 = [
  "Simón Bolívar University (Colombia)",
  "CES University",
  "Pontificia Universidad Javeriana",
  "University of Santander",
  "EAFIT University",
  "EAN University",
  "Minuto de Dios University Corporation (UNIMINUTO)",
  "Universidad de Cartagena",
  "Antonio Nariño University",
  "La Salle University (Colombia)",
  "Saint Thomas University, Colombia",
  "Universidad Católica de Colombia",
  "Universidad de Ciencias Aplicadas y Ambientales",
  "Universidad Nacional Abierta y a Distancia (UNAD)",
  "University of La Sabana",
] as const;

const CONOCIDAS = new Set<string>(COLOMBIA_2026);

export function esDeColombia(f: Pick<FilaTHE, "country" | "name">): boolean {
  const pais = f.country.trim().toLowerCase();
  if (pais) return pais === "colombia" || pais.endsWith("(colombia)");
  return CONOCIDAS.has(f.name) || /\(colombia\)\s*$|,\s*colombia\s*$/i.test(f.name);
}

export const NOMBRE_UDES = "University of Santander";

export const esUdes = (f: Pick<FilaTHE, "name">) => f.name === NOMBRE_UDES || /^universidad de santander\b/i.test(f.name) || /\(UDES\)/.test(f.name);

export const filasDeColombia = (filas: FilaTHE[]) => filas.filter(esDeColombia);

export interface PeldanoNacional {
  fila: FilaTHE;
  /** Primer puesto que comparte en Colombia (1 + las que están en una banda mejor). */
  puesto: number;
  /** Último puesto posible (puesto + empatadas − 1). */
  puestoHasta: number;
  /** Cuántas comparten su banda (incluida ella). */
  empatadas: number;
  /** «1», «=2», «5–7»… */
  etiqueta: string;
  /** Centro de los puestos posibles. */
  esperado: number;
  esUdes: boolean;
}

/** Orden nacional por banda mundial; dentro de la banda, por nombre (no por mérito). */
export function escaleraNacional(filas: FilaTHE[]): PeldanoNacional[] {
  const col = filasDeColombia(filas)
    .slice()
    .sort((a, b) => a.rank_lo - b.rank_lo || centroFila(b) - centroFila(a) || a.name.localeCompare(b.name, "es"));
  return col.map((fila) => {
    const mejores = col.filter((o) => o.rank_lo < fila.rank_lo).length;
    const empatadas = col.filter((o) => o.rank_lo === fila.rank_lo).length;
    const puesto = mejores + 1;
    const puestoHasta = mejores + empatadas;
    return {
      fila,
      puesto,
      puestoHasta,
      empatadas,
      etiqueta: empatadas === 1 ? String(puesto) : `=${puesto}`,
      esperado: (puesto + puestoHasta) / 2,
      esUdes: esUdes(fila),
    };
  });
}

export interface Brecha {
  /** La banda que sigue (mejor). */
  banda: string;
  /** Puntos que faltan desde el techo del rango publicado (lo mínimo posible). */
  minimo: number;
  /** Desde el centro del rango. */
  desdeCentro: number;
  /** Desde el piso del rango (lo máximo posible). */
  maximo: number;
}

/** Cuántos puntos generales faltan para entrar a la banda siguiente. */
export function brechaHastaSiguiente(f: FilaTHE, general: Calibracion): Brecha | null {
  const sig = bandaSiguiente(general, f.rank_lo);
  if (!sig) return null;
  const r = (x: number) => Math.max(0, Math.round(x * 10) / 10);
  return { banda: sig.label, minimo: r(sig.lo - f.overall_hi), desdeCentro: r(sig.lo - centroFila(f)), maximo: r(sig.lo - f.overall_lo) };
}
