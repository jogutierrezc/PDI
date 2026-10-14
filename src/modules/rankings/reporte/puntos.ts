/* =============================================================================
   Estimación de puntos de un indicador del reporte por oficinas · una cifra
   orientativa para Planeación, no la puntuación de THE.

   Reutiliza la regla de puntosEvidencia (informes/tipos.ts): existencia (0–1)
   + relevancia de la evidencia (específica 1, general 0,5, no pertinente 0) +
   evidencia pública (1). Total máximo 3; la fracción es total / 3, y el aporte
   al ODS es peso × fracción × 100.

   Qué evidencia cuenta: la primera tras ordenar, con la pública antes que la
   no pública (y, a igual visibilidad, la específica antes que la general).
   Solo ev y doc puntúan así. dato e inv los calcula THE con cifras y Scopus:
   aquí no aplican.
   ========================================================================== */

import { puntosEvidencia } from "../informes/tipos";
import type { Relevancia, TipoIndicador } from "./tipos";

/** Lo que hace falta de una evidencia para puntuar. */
export interface EvidenciaPuntos {
  id: string;
  publica: boolean;
  /** Sin valorar, cuenta como general (0,5), igual que en el analizador de posicionamiento. */
  relevancia?: Relevancia | null;
}

export interface EntradaPuntos {
  tipo: TipoIndicador;
  /** Lo que respondió la oficina: sí, no, o sin responder. */
  si_no: boolean | null;
  /** ¿Hay alguna cifra escrita en los campos del indicador? */
  tieneCifra: boolean;
  evidencias: EvidenciaPuntos[];
}

export interface EstimacionPuntos {
  /** false para dato e inv: THE los calcula con cifras y Scopus. */
  aplica: boolean;
  /** Por qué no aplica, cuando no aplica. */
  motivo: string | null;
  existencia: number;
  relevancia: number;
  publica: number;
  /** Suma de los tres anteriores, de 0 a 3. */
  total: number;
  /** total / 3. */
  fraccion: number;
  /** La evidencia que cuenta para la estimación, o nulo. */
  evidenciaElegida: string | null;
}

const RANGO_RELEVANCIA: Record<Relevancia, number> = { s: 0, g: 1, n: 2 };

/**
 * Orden de las evidencias para elegir la que cuenta: primero las públicas,
 * luego la relevancia (específica, general, no pertinente). Estable: a igual
 * rango, se conserva el orden de llegada.
 */
export function ordenarEvidencias(evidencias: EvidenciaPuntos[]): EvidenciaPuntos[] {
  const rango = (e: EvidenciaPuntos) => RANGO_RELEVANCIA[e.relevancia ?? "g"];
  return evidencias
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.publica !== b.e.publica) return a.e.publica ? -1 : 1;
      const r = rango(a.e) - rango(b.e);
      return r !== 0 ? r : a.i - b.i;
    })
    .map(({ e }) => e);
}

/** Estimación de puntos de un indicador con su respuesta y sus evidencias. */
export function estimarPuntos(entrada: EntradaPuntos): EstimacionPuntos {
  if (entrada.tipo === "dato" || entrada.tipo === "inv") {
    return {
      aplica: false,
      motivo: entrada.tipo === "dato" ? "Es una cifra: THE la puntúa con lo que se envía en el portal." : "Investigación: THE la calcula con Scopus.",
      existencia: 0,
      relevancia: 0,
      publica: 0,
      total: 0,
      fraccion: 0,
      evidenciaElegida: null,
    };
  }

  const elegida = ordenarEvidencias(entrada.evidencias)[0] ?? null;
  // Existe si lo dice la respuesta, o si hay evidencia o cifra que lo sostenga.
  const existe = entrada.si_no === false ? false : entrada.si_no === true || elegida !== null || entrada.tieneCifra;
  const existencia = existe ? 1 : 0;
  // Sin existencia no hay evidencia que valga: relevancia y pública quedan en 0.
  const cuenta = existe && elegida !== null;
  const rel: Relevancia = cuenta ? (elegida.relevancia ?? "g") : "n";
  const p = puntosEvidencia(existencia, rel, cuenta && elegida.publica);

  return {
    aplica: true,
    motivo: null,
    existencia: p.existencia,
    relevancia: p.relevancia,
    publica: p.publica,
    total: p.total,
    fraccion: p.total / 3,
    evidenciaElegida: existe && elegida !== null ? elegida.id : null,
  };
}

/** Aporte del indicador a los puntos del ODS (0–100): peso × fracción × 100. */
export function aportePuntosOds(peso: number | null, fraccion: number): number {
  if (peso === null || !Number.isFinite(peso)) return 0;
  return peso * fraccion * 100;
}
