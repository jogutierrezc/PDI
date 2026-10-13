/* =============================================================================
   Colores de los ODS en la intranet de rankings.
   Son los únicos colores escritos a mano del módulo: los oficiales de la ONU
   (SDG de sostenible/data.ts). La tinta sobre cada color es la de mayor contraste
   (odsOn de los informes): oscura sobre el 2, 6, 7, 9, 11, 12, 14 y 15 cuando
   la blanca no llega a 4,5:1.
   ========================================================================== */

import type { CSSProperties } from "react";
import { SDG } from "../sostenible/data";
import { odsOn } from "../sostenible/OdsArt";

export const ODS_NUMEROS = SDG.map((_, i) => i + 1);

const CORTOS = [
  "Pobreza",
  "Hambre",
  "Salud",
  "Educación",
  "Género",
  "Agua",
  "Energía",
  "Trabajo",
  "Industria",
  "Desigualdad",
  "Ciudades",
  "Consumo",
  "Clima",
  "Vida submarina",
  "Ecosistemas",
  "Paz y justicia",
  "Alianzas",
];

/** Nombre corto para el riel. */
export const odsCorto = (n: number) => CORTOS[n - 1] ?? `ODS ${n}`;

export const odsNombre = (n: number) => SDG[n - 1]?.name ?? `ODS ${n}`;

/** Variables --k (fondo) y --ko (tinta) para pintar un elemento con el color del ODS. */
export function odsVars(n: number): CSSProperties {
  return {
    "--k": SDG[n - 1]?.color ?? "var(--ink-muted)",
    "--ko": SDG[n - 1] ? odsOn(SDG[n - 1].color) : "#fff",
  } as CSSProperties;
}
