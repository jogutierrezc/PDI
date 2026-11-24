/* =============================================================================
   UDES Sostenible · muro de carteles del portal ODS: dónde va cada cartel.

   Cada ODS pide un tamaño (los que van a THE con cifras publicadas, 2×2; el
   resto de THE, 2×1; los demás, 1×1). Se colocan en orden, en el primer hueco
   donde caben, como `grid-auto-flow: dense`, y los huecos que quedan se tapan
   ensanchando el cartel vecino: el muro nunca queda mellado, filtre lo que
   filtre. Se calcula para 4 y 2 columnas; en una columna van uno tras otro.
   ========================================================================== */

export type WallSize = "s" | "w" | "xl";

export interface WallItem {
  id: number;
  size: WallSize;
}

/** Posición en la rejilla, en líneas CSS (empiezan en 1). */
export interface WallSlot {
  col: number;
  row: number;
  w: number;
  h: number;
}

const DIMS: Record<WallSize, [number, number]> = { s: [1, 1], w: [2, 1], xl: [2, 2] };

/** Coloca los carteles en `cols` columnas sin dejar huecos. */
export function wallLayout(items: WallItem[], cols: number): Map<number, WallSlot> {
  const taken: (number | undefined)[][] = [];
  const cell = (r: number, c: number) => taken[r]?.[c];
  const set = (r: number, c: number, id: number) => {
    (taken[r] ??= Array(cols).fill(undefined))[c] = id;
  };
  const fits = (r: number, c: number, w: number, h: number) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (cell(y, x) !== undefined) return false;
    return true;
  };

  const slots = new Map<number, { r: number; c: number; w: number; h: number }>();
  for (const it of items) {
    const [dw, h] = DIMS[it.size];
    const w = Math.min(dw, cols);
    let r = 0;
    let c = 0;
    for (;; r++) {
      c = Array.from({ length: cols }, (_, x) => x).find((x) => fits(r, x, w, h)) ?? -1;
      if (c >= 0) break;
    }
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) set(y, x, it.id);
    slots.set(it.id, { r, c, w, h });
  }

  /* Tapar huecos: primero ensancha al vecino de la izquierda, luego alarga al de arriba. */
  const rows = taken.length;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cell(r, c) !== undefined) continue;
        const left = c > 0 ? cell(r, c - 1) : undefined;
        const s = left !== undefined ? slots.get(left) : undefined;
        if (s && s.c + s.w === c && Array.from({ length: s.h }, (_, k) => s.r + k).every((y) => cell(y, c) === undefined)) {
          for (let y = s.r; y < s.r + s.h; y++) set(y, c, left!);
          s.w += 1;
          changed = true;
          continue;
        }
        const up = r > 0 ? cell(r - 1, c) : undefined;
        const u = up !== undefined ? slots.get(up) : undefined;
        if (u && u.r + u.h === r && Array.from({ length: u.w }, (_, k) => u.c + k).every((x) => cell(r, x) === undefined)) {
          for (let x = u.c; x < u.c + u.w; x++) set(r, x, up!);
          u.h += 1;
          changed = true;
        }
      }
    }
  }

  const out = new Map<number, WallSlot>();
  slots.forEach((s, id) => out.set(id, { col: s.c + 1, row: s.r + 1, w: s.w, h: s.h }));
  return out;
}

/** Huecos que quedan en la rejilla (para las pruebas). */
export function wallHoles(slots: Map<number, WallSlot>, cols: number): number {
  let area = 0;
  let rows = 0;
  slots.forEach((s) => {
    area += s.w * s.h;
    rows = Math.max(rows, s.row + s.h - 1);
  });
  return rows * cols - area;
}
