/* =============================================================================
   Rutas UDES · modelo.

   La parte del cálculo que no toca el lienzo: la proyección del mapa, la
   probabilidad de que un estudiante camine hasta una parada y las curvas del
   día (demanda y tráfico simulado). El motor las usa; las pruebas las vigilan.
   ========================================================================== */

const R2D = Math.PI / 180;

/** Mercator normalizado: [0,1] en x e y (y crece hacia el sur). */
export function merc(lon: number, lat: number): [number, number] {
  const s = Math.sin(lat * R2D);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** Probabilidad de caminar d metros hasta una parada: 0,5 justo a la distancia r. */
export function pUse(d: number, r: number): number {
  return 1 / (1 + Math.exp((d - r) / (0.22 * r)));
}

const gauss = (t: number, m: number, s: number) => {
  const z = (t - m) / s;
  return Math.exp(-0.5 * z * z);
};

/** Volumen relativo de viajes a la hora h (5 a 22): tres picos, mañana, mediodía y tarde. */
export function demandH(h: number): number {
  return h < 5 || h > 22 ? 0 : 0.06 + 1.0 * gauss(h, 6.5, 0.9) + 0.55 * gauss(h, 12.5, 0.8) + 0.8 * gauss(h, 18.5, 1.0);
}

/** Congestión simulada (0 fluido, 1 denso). OpenStreetMap no trae tráfico en vivo. */
export function trafficH(h: number): number {
  return Math.min(1, Math.max(0, 0.12 + 1.0 * gauss(h, 7.0, 0.8) + 0.5 * gauss(h, 12.5, 1.0) + 0.95 * gauss(h, 18.0, 1.2)));
}

export const H_INT = (() => {
  let a = 0;
  for (let h = 5; h <= 22; h += 0.01) a += demandH(h) * 0.01;
  return a;
})();

export const H_MAX = (() => {
  let m = 0;
  for (let h = 5; h <= 22; h += 0.01) m = Math.max(m, demandH(h));
  return m;
})();

/** Fracción de los viajes del día que cae en la hora h. */
export const hourShare = (h: number) => demandH(h) / H_INT;
