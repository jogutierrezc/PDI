/* =============================================================================
   UDrive · tendencia lineal (mínimos cuadrados) para las gráficas de línea.

   Sobre categorías (periodos) la posición es el índice 0, 1, 2…; los huecos
   (valores faltantes) no entran al ajuste pero conservan su lugar.
   ========================================================================== */

export interface Recta {
  pendiente: number;
  intercepto: number;
  /** Coeficiente de determinación (0 a 1). */
  r2: number;
  n: number;
}

/** Ajusta y = a + b·x con los pares válidos; nulo si hay menos de dos o x no varía. */
export function regresionLineal(x: readonly (number | null)[], y: readonly (number | null)[]): Recta | null {
  const pares: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i];
    const b = y[i];
    if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) pares.push([a, b]);
  }
  const n = pares.length;
  if (n < 2) return null;
  const mx = pares.reduce((s, p) => s + p[0], 0) / n;
  const my = pares.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [a, b] of pares) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  if (sxx === 0) return null;
  const pendiente = sxy / sxx;
  return { pendiente, intercepto: my - pendiente * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy), n };
}

/** La tendencia de una serie por posición: un valor por cada lugar, nulo si no se puede ajustar. */
export function tendenciaPorPosicion(y: readonly (number | null)[]): (number | null)[] {
  const r = regresionLineal(y.map((_, i) => i), y);
  return y.map((_, i) => (r ? r.intercepto + r.pendiente * i : null));
}
