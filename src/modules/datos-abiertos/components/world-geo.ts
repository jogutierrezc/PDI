/* =============================================================================
   Geometría compartida de los mapas del mundo (movilidad y convenios).
   ========================================================================== */

import { COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH } from "../data/world-map";

export type Point = [number, number];

export const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

/** Colombia: la casa, no un país de destino. */
export const HOME = "COL";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WORLD_BOX: Box = { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };

/** Recuadro que contiene los puntos, con margen y proporción apaisada, dentro del mundo. */
export function fitBox(points: Point[]): Box {
  if (points.length < 2) return WORLD_BOX;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const ratio = 0.52;
  let w = Math.max(420, Math.max(...xs) - Math.min(...xs) + 140);
  let h = Math.max(...ys) - Math.min(...ys) + 110;
  if (h > w * ratio) w = h / ratio;
  h = w * ratio;
  if (w >= WORLD_WIDTH || h >= WORLD_HEIGHT) return WORLD_BOX;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x = Math.min(WORLD_WIDTH - w, Math.max(0, cx - w / 2));
  const y = Math.min(WORLD_HEIGHT - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}
