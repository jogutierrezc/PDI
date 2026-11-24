/* =============================================================================
   UDrive · mapa de calor de una columna.

   Cada columna numérica puede llevar sus tramos: «hasta 20», «hasta 40»… y un
   último «de ahí en adelante». Un valor cae en el primer tramo cuyo `hasta` es
   mayor que él (el límite pertenece al tramo siguiente: 20 está en 20–40). Los
   colores son tonos claros: el texto de la celda sigue oscuro (contraste ≥ 4,5).
   ========================================================================== */

import type { TramoCalor } from "../tipos";

/** Los cinco tonos del diseño aprobado, del más bajo al más alto. */
export const COLORES_CALOR = ["#f4b9b0", "#f9dba6", "#f6f0a8", "#cde6a8", "#9ed49b"] as const;

/** Los tramos del diseño aprobado para porcentajes: 0–20, 20–40, 40–55, 55–70 y más de 70. */
export const TRAMOS_PORCENTAJE: TramoCalor[] = [
  { hasta: 20, color: COLORES_CALOR[0] },
  { hasta: 40, color: COLORES_CALOR[1] },
  { hasta: 55, color: COLORES_CALOR[2] },
  { hasta: 70, color: COLORES_CALOR[3] },
  { hasta: null, color: COLORES_CALOR[4] },
];

/** Tramos iguales entre el mínimo y el máximo de los datos (de 2 a 5). */
export function tramosAutomaticos(valores: readonly number[], cuantos = 5): TramoCalor[] {
  const v = valores.filter((x) => Number.isFinite(x));
  const n = Math.max(2, Math.min(cuantos, COLORES_CALOR.length));
  const color = (i: number) => COLORES_CALOR[Math.round((i * (COLORES_CALOR.length - 1)) / (n - 1))];
  if (!v.length) return Array.from({ length: n }, (_, i) => ({ hasta: i < n - 1 ? (i + 1) * 20 : null, color: color(i) }));
  const min = Math.min(...v);
  const max = Math.max(...v);
  const paso = (max - min) / n || 1;
  return Array.from({ length: n }, (_, i) => ({ hasta: i < n - 1 ? Math.round((min + paso * (i + 1)) * 100) / 100 : null, color: color(i) }));
}

/** ¿Los tramos están bien armados? Límites crecientes y solo el último sin límite. Vacío si sí. */
export function erroresDeTramos(tramos: readonly TramoCalor[]): string {
  if (tramos.length < 2) return "Se necesitan al menos dos tramos.";
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i];
    const ultimo = i === tramos.length - 1;
    if (ultimo && t.hasta !== null) return "El último tramo no lleva límite.";
    if (!ultimo) {
      if (t.hasta === null || !Number.isFinite(t.hasta)) return "Cada tramo, menos el último, lleva un límite.";
      if (i > 0 && (tramos[i - 1].hasta ?? -Infinity) >= t.hasta) return "Los límites deben ir de menor a mayor.";
    }
  }
  return "";
}

/** El color del tramo donde cae un valor; nulo si no hay valor o los tramos no sirven. */
export function colorDeTramo(valor: number | null, tramos: readonly TramoCalor[] | null | undefined): string | null {
  if (valor === null || !Number.isFinite(valor) || !tramos?.length || erroresDeTramos(tramos)) return null;
  for (const t of tramos) if (t.hasta === null || valor < t.hasta) return t.color;
  return tramos[tramos.length - 1].color;
}

/** «0–20, 20–40, 40–55, 55–70 y más de 70». */
export function describirTramos(tramos: readonly TramoCalor[], formato: (n: number) => string = (n) => String(n).replace(".", ",")): string {
  const partes: string[] = [];
  let desde: number | null = null;
  for (const t of tramos) {
    if (t.hasta === null) partes.push(desde === null ? "todo" : `más de ${formato(desde)}`);
    else partes.push(desde === null ? `hasta ${formato(t.hasta)}` : `${formato(desde)}–${formato(t.hasta)}`);
    desde = t.hasta;
  }
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
}
