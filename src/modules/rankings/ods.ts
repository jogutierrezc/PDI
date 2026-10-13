/* =============================================================================
   Colores de los ODS en la intranet de rankings.
   Son los únicos colores escritos a mano del módulo: los oficiales de la ONU
   (SDG de sostenible/data.ts). Sobre el 7 y el 11 la tinta es oscura; sobre el
   resto, blanca.
   ========================================================================== */

import type { CSSProperties } from "react";
import { SDG } from "../sostenible/data";

const TINTA_OSCURA = "#17211b";
const TINTA_CLARA = "#ffffff";

export const ODS_NUMEROS = SDG.map((_, i) => i + 1);

export const odsNombre = (n: number) => SDG[n - 1]?.name ?? `ODS ${n}`;

/** Variables --k (fondo) y --ko (tinta) para pintar un elemento con el color del ODS. */
export function odsVars(n: number): CSSProperties {
  return {
    "--k": SDG[n - 1]?.color ?? "var(--ink-muted)",
    "--ko": n === 7 || n === 11 ? TINTA_OSCURA : TINTA_CLARA,
  } as CSSProperties;
}
