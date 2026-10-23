/* =============================================================================
   Del Saber 11 al Saber PRO, por programa y sede.

   Los datos salen de scripts/saber-trayectoria.py: percentil de entrada
   (Saber 11) y de salida (Saber PRO) dentro de la cohorte UDES del periodo.
   Solo hay agregados; los programas con menos de 10 evaluados no se publican.
   ========================================================================== */

import raw from "./saber-trayectoria.data.json";
import type { SaberCompetency } from "./saber-pro";

export interface TrayectoriaCuarto {
  n: number;
  salida: number;
}

export interface TrayectoriaCifra {
  n: number;
  entrada: number;
  salida: number;
  pEntrada: number;
  pSalida: number;
  cuartos: (TrayectoriaCuarto | null)[];
}

export type TrayectoriaPrograma = { programa: string; sede: string } & Partial<Record<SaberCompetency, TrayectoriaCifra>>;

const DATA = raw as unknown as { periodos: string[]; programas: Record<string, TrayectoriaPrograma> };

export const TRAYECTORIA_PERIODOS = DATA.periodos;

/** Comunicación escrita no tiene área equivalente en Saber 11. */
export const TRAYECTORIA_COMPETENCIAS: SaberCompetency[] = ["global", "lc", "rc", "cc", "ing"];

export interface TrayectoriaFila {
  key: string;
  programa: string;
  sede: string;
  cifra: TrayectoriaCifra;
  /** Salida menos entrada, en puntos de percentil. */
  cambio: number;
}

export function trayectoriaFilas(competency: SaberCompetency, sede = ""): TrayectoriaFila[] {
  const filas: TrayectoriaFila[] = [];
  for (const [key, p] of Object.entries(DATA.programas)) {
    const cifra = p[competency];
    if (!cifra || (sede && p.sede !== sede)) continue;
    filas.push({ key, programa: p.programa, sede: p.sede, cifra, cambio: cifra.pSalida - cifra.pEntrada });
  }
  return filas.sort((a, b) => b.cambio - a.cambio);
}
