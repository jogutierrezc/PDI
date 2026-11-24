/* =============================================================================
   Mr. Pilo en SVG · utilidades puras del separador de capas.

   Los cuatro dibujos (public/datos-abiertos/pilosvg) salen de un calco
   automático por colores: cada <path> es UN color y reúne decenas de
   polígonos sueltos (M … L … Z) con agujeros por par-impar. Aquí se parte
   cada color en «formas» (un contorno exterior con sus agujeros), se mide
   cada forma (caja, área, centro) y se escribe de nuevo en coordenadas
   relativas y enteras, que pesan mucho menos.
   ========================================================================== */

/** Lee los polígonos de un atributo d hecho solo de M, L y Z. */
export function parseRings(d) {
  const rings = [];
  for (const chunk of d.split(/[Zz]/)) {
    const nums = chunk.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 6) continue;
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
    rings.push(pts);
  }
  return rings;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Área con signo (fórmula del cordón). */
export function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
}

/** Centro de masa del polígono (o el promedio de puntos si es degenerado). */
export function centroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    cx += (pts[j][0] + pts[i][0]) * f;
    cy += (pts[j][1] + pts[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Agrupa los polígonos de un mismo color en formas: cada contorno a
 * profundidad par es una forma y se lleva sus agujeros (profundidad impar
 * inmediatamente dentro). Así una forma se puede mover sola sin romper el
 * par-impar de las demás.
 */
export function ringsToShapes(rings) {
  const boxes = rings.map(bbox);
  const inside = (a, b) => {
    const A = boxes[a], B = boxes[b];
    if (A[0] < B[0] || A[1] < B[1] || A[2] > B[2] || A[3] > B[3]) return false;
    // El calco comparte vértices en los bordes: decide la mayoría de puntos.
    const step = Math.max(1, Math.floor(rings[a].length / 9));
    let yes = 0, all = 0;
    for (let i = 0; i < rings[a].length; i += step, all++) if (pointInRing(rings[a][i], rings[b])) yes++;
    return yes * 2 > all;
  };
  const parents = rings.map((_, a) => rings.map((_, b) => b).filter((b) => b !== a && inside(a, b)));
  const depth = parents.map((p) => p.length);
  const shapes = [];
  const byRing = new Map();
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 0) {
      byRing.set(i, shapes.length);
      shapes.push({ outer: r, holes: [] });
    }
  });
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 1) {
      // El padre directo es el contenedor con profundidad justo una menos.
      const parent = parents[i].find((p) => depth[p] === depth[i] - 1);
      if (parent !== undefined && byRing.has(parent)) shapes[byRing.get(parent)].holes.push(r);
      else shapes.push({ outer: r, holes: [] });
    }
  });
  for (const s of shapes) {
    s.box = bbox(s.outer);
    s.area = Math.abs(area(s.outer)) - s.holes.reduce((t, h) => t + Math.abs(area(h)), 0);
    s.center = centroid(s.outer);
  }
  return shapes;
}

/** Ramer–Douglas–Peucker sobre un anillo cerrado. */
export function simplify(pts, eps) {
  if (pts.length < 5 || eps <= 0) return pts;
  const sq = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return x * x + y * y;
  };
  const rdp = (s, e, keep) => {
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = sq(pts[i], pts[s], pts[e]);
      if (d > max) (max = d), (idx = i);
    }
    if (max > eps * eps && idx > 0) {
      keep[idx] = true;
      rdp(s, idx, keep);
      rdp(idx, e, keep);
    }
  };
  // Parte el anillo por el punto más lejano del primero.
  let far = 1, fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) (fd = d), (far = i);
  }
  const keep = pts.map(() => false);
  keep[0] = keep[far] = true;
  rdp(0, far, keep);
  const tail = [...pts.slice(far), pts[0]];
  const keep2 = tail.map(() => false);
  const sub = (s, e) => {
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = sq(tail[i], tail[s], tail[e]);
      if (d > max) (max = d), (idx = i);
    }
    if (max > eps * eps && idx > 0) {
      keep2[idx] = true;
      sub(s, idx);
      sub(idx, e);
    }
  };
  sub(0, tail.length - 1);
  const out = pts.filter((_, i) => keep[i] && i <= far);
  for (let i = 1; i < tail.length - 1; i++) if (keep2[i]) out.push(tail[i]);
  return out.length >= 3 ? out : pts;
}

/** Un anillo en comandos relativos, enteros y sin espacios de sobra. */
export function ringToD(pts, scale = 1) {
  const r = pts.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
  // Quita puntos repetidos seguidos.
  const q = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
  if (q.length < 3) return "";
  const num = (n, first) => (n < 0 || first ? `${n}` : ` ${n}`);
  let d = `M${q[0][0]} ${q[0][1]}l`;
  let first = true;
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0];
    const dy = q[i][1] - q[i - 1][1];
    d += num(dx, first) + (dy < 0 ? `${dy}` : ` ${dy}`);
    first = false;
  }
  return d + "z";
}

export function shapeToD(s, eps, scale) {
  return [s.outer, ...s.holes].map((r) => ringToD(simplify(r, eps), scale)).join("");
}

/** Color #rrggbb → [h (0–360), s (0–1), l (0–1)]. */
export function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * Familia de color de un relleno del calco:
 *   ink   contornos y pupilas (casi negro)
 *   white blancos de ojos y brillos
 *   grey  pico y mano (grises, poco saturados)
 *   vivid naranja intenso (gafas, pelo, lengua)
 *   red   rojos y marrones oscuros (pelo en sombra, boca)
 *   skin  piel y sus sombras (melocotón)
 */
export function family(hex) {
  const [h, s, l] = hsl(hex);
  if (l < 0.13) return "ink";
  if (l > 0.9 && (s < 0.5 || l > 0.96)) return "white";
  if (s < 0.2 || (s < 0.32 && l > 0.6 && (h > 300 || h < 20))) return "grey";
  if (l < 0.42) return "red";
  if (s > 0.8 && l < 0.62 && h < 36) return "vivid";
  return "skin";
}

export const inEllipse = ([x, y], [cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
export const inBox = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
export const boxInEllipse = (b, e) => [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].every((p) => inEllipse(p, e));
export const boxInBox = (b, o) => b[0] >= o[0] && b[1] >= o[1] && b[2] <= o[2] && b[3] <= o[3];
