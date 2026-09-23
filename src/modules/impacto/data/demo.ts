/* =============================================================================
   Cifras ILUSTRATIVAS del prototipo.

   Tres periodos de reportes de los 13 indicadores del piloto, por programa y
   sede, generados con una semilla fija para que cada recarga muestre lo mismo.
   Toda vista que las use dice «Dato ilustrativo».
   ========================================================================== */

import { PILOT_INDICATORS, PROGRAMS, applies } from "./catalog";
import type { CampusId, Measure } from "./types";

export const PERIODS = ["2025-1", "2025-2", "2026-1"] as const;
export const CURRENT_PERIOD = "2026-2";

export interface DemoRecord extends Measure {
  codigo: string;
  program: string;
  campus: CampusId | null;
  period: string;
}

/** Número pseudoaleatorio estable a partir de un texto. */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const between = (key: string, min: number, max: number) => Math.round(min + seeded(key) * (max - min));

function measureFor(codigo: string, key: string, size: number, step: number): Measure {
  const drift = 1 + step * 0.04;
  switch (codigo) {
    case "I01":
      return { numerador: Math.round(size * (0.06 + seeded(key) * 0.08) * drift), denominador: null };
    case "I04":
    case "X04":
      return { numerador: Math.max(1, Math.round(size / between(key + "r", 45, 90) * drift)), denominador: null };
    case "I34": {
      const den = Math.max(8, Math.round(size * 0.1));
      const denComp = Math.round(den * 3.2);
      return {
        numerador: Math.round(den * (0.55 + seeded(key) * 0.25)),
        denominador: den,
        numComparacion: Math.round(denComp * (0.38 + seeded(key + "c") * 0.2)),
        denComparacion: denComp,
      };
    }
    case "E01": {
      const den = Math.max(6, Math.round(size / 22));
      return { numerador: Math.round(den * Math.min(0.95, 0.6 + seeded(key) * 0.25 + step * 0.02)), denominador: den };
    }
    case "E03":
      return { numerador: Math.round(size * (0.08 + seeded(key) * 0.12) * drift), denominador: null };
    case "E04": {
      const den = size;
      return { numerador: Math.round(den * (0.86 + seeded(key) * 0.1)), denominador: den };
    }
    case "E08": {
      const den = Math.max(6, Math.round(size / 22));
      return { numerador: Math.round(den * (12 + seeded(key) * 14) * drift), denominador: den };
    }
    case "E13":
      return { numerador: between(key, 0, 4), denominador: null };
    case "E10":
      return { numerador: between(key, 132, 164), denominador: null, n: Math.max(6, Math.round(size / 9)) };
    case "X07":
      return { numerador: between(key, 1, 6), denominador: null };
    case "X18":
      return { numerador: Math.round(between(key, 80, 520) * drift), denominador: null };
    case "X22": {
      const den = between(key + "n", 24, 140);
      return { numerador: Math.round(den * (0.58 + seeded(key) * 0.3)), denominador: den };
    }
    default:
      return { numerador: null, denominador: null };
  }
}

function build(): DemoRecord[] {
  const rows: DemoRecord[] = [];
  PERIODS.forEach((period, step) => {
    for (const indicator of PILOT_INDICATORS) {
      for (const program of PROGRAMS) {
        if (!applies(indicator, program, period)) continue;
        const bySite = indicator.ficha?.nivelReporte === "programa_sede";
        const sites: (CampusId | null)[] = bySite ? program.campus : [null];
        for (const campus of sites) {
          const base = program.degree === "pregrado" ? between(program.slug + campus, 180, 950) : between(program.slug + campus, 25, 90);
          const size = campus === null ? base * program.campus.length : base;
          const key = `${indicator.codigo}|${program.slug}|${campus}|${period}`;
          rows.push({ codigo: indicator.codigo, program: program.slug, campus, period, ...measureFor(indicator.codigo, key, size, step) });
        }
      }
    }
  });
  return rows;
}

export const DEMO_RECORDS: DemoRecord[] = build();

