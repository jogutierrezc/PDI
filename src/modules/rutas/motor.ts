/* =============================================================================
   Rutas UDES · motor del mapa.

   Port del prototipo aprobado (artifact «Rutas UDES», 2026-10-09). Dibuja en un
   lienzo la capa de OpenStreetMap (teselas), la ruta por carretera, las paradas,
   los estudiantes agregados por celda y los buses simulados; calcula la
   probabilidad de uso y propone paradas nuevas. No sabe de Supabase: recibe los
   datos ya cargados (datos.ts) y devuelve una función para desmontarse.

   Está escrito como el prototipo (un cierre grande); la lógica pura que sí se
   prueba vive en modelo.ts. // @ts-nocheck mientras se tipa por partes.
   ========================================================================== */
// @ts-nocheck
import { gsap } from "gsap";
import type { DatosRutas, OpcionesRutas } from "./tipos";
import { H_MAX, demandH, hourShare, merc, pUse, trafficH } from "./modelo";

export function montarRutas(root: HTMLElement, datos: DatosRutas, opciones: OpcionesRutas): () => void {
'use strict';
'use strict';
var $ = function (s, r) { return (r || root).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var HAS_GSAP = true;
var R2D = Math.PI / 180;
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
var fmt = function (n) { return Math.round(n).toLocaleString('es-CO'); };

/* ---------- proyección ---------- */
var A0 = 7.103, L0 = -73.105;
var KX = 111320 * Math.cos(A0 * R2D), KY = 110574;
function toLocal(lon, lat) { return [(lon - L0) * KX, (lat - A0) * KY]; }
function fromLocal(x, y) { return [L0 + x / KX, A0 + y / KY]; }

/* ---------- calles (OpenStreetMap) ---------- */
var ROADS = datos.vias.map(function (r) {
  var c = r[0], f = r[1], n = f.length / 2;
  var xy = new Float64Array(n * 2), lm = new Float32Array(n * 2);
  var x = f[0], y = f[1], minx = 9, miny = 9, maxx = -9, maxy = -9;
  for (var i = 0; i < n; i++) {
    if (i > 0) { x += f[2 * i]; y += f[2 * i + 1]; }
    var lon = x / 1e5, lat = y / 1e5, m = merc(lon, lat), l = toLocal(lon, lat);
    xy[2 * i] = m[0]; xy[2 * i + 1] = m[1]; lm[2 * i] = l[0]; lm[2 * i + 1] = l[1];
    if (m[0] < minx) minx = m[0]; if (m[0] > maxx) maxx = m[0];
    if (m[1] < miny) miny = m[1]; if (m[1] > maxy) maxy = m[1];
  }
  return { c: c, n: n, xy: xy, lm: lm, minx: minx, maxx: maxx, miny: miny, maxy: maxy };
});
var BYCLASS = [[], [], [], [], []];
ROADS.forEach(function (w) { BYCLASS[w.c].push(w); });

/* ---------- ruta por carretera (OSRM) ---------- */
var RT = (function () {
  var co = datos.ruta.coords, n = co.length, lon = [], lat = [], i;
  for (i = 0; i < n; i++) { lon.push(co[i][0]); lat.push(co[i][1]); }
  var mx = [], my = [], lx = [], ly = [], cum = [0];
  for (i = 0; i < n; i++) {
    var m = merc(lon[i], lat[i]), l = toLocal(lon[i], lat[i]);
    mx.push(m[0]); my.push(m[1]); lx.push(l[0]); ly.push(l[1]);
    if (i > 0) cum.push(cum[i - 1] + Math.hypot(lx[i] - lx[i - 1], ly[i] - ly[i - 1]));
  }
  return { n: n, lon: lon, lat: lat, mx: mx, my: my, lx: lx, ly: ly, cum: cum, total: cum[n - 1] };
})();
var STEP = 5; // remuestreo cada 5 m
var RS = (function () {
  var N = Math.floor(RT.total / STEP) + 1, X = new Float64Array(N), Y = new Float64Array(N), LX = new Float64Array(N), LY = new Float64Array(N), j = 0;
  for (var i = 0; i < N; i++) {
    var s = i * STEP;
    while (j < RT.n - 2 && RT.cum[j + 1] < s) j++;
    var seg = RT.cum[j + 1] - RT.cum[j] || 1, u = clamp((s - RT.cum[j]) / seg, 0, 1);
    X[i] = RT.mx[j] + (RT.mx[j + 1] - RT.mx[j]) * u; Y[i] = RT.my[j] + (RT.my[j + 1] - RT.my[j]) * u;
    LX[i] = RT.lx[j] + (RT.lx[j + 1] - RT.lx[j]) * u; LY[i] = RT.ly[j] + (RT.ly[j + 1] - RT.ly[j]) * u;
  }
  return { N: N, X: X, Y: Y, LX: LX, LY: LY };
})();
function posAt(s) {
  var f = clamp(s, 0, RT.total) / STEP, i = Math.min(RS.N - 2, Math.floor(f)), u = f - i;
  return { x: RS.X[i] + (RS.X[i + 1] - RS.X[i]) * u, y: RS.Y[i] + (RS.Y[i + 1] - RS.Y[i]) * u, lx: RS.LX[i] + (RS.LX[i + 1] - RS.LX[i]) * u, ly: RS.LY[i] + (RS.LY[i + 1] - RS.LY[i]) * u };
}
function headingAt(s) {
  var a = posAt(s - 9), b = posAt(s + 9);
  return Math.atan2(b.y - a.y, b.x - a.x);
}
// velocidad máxima por curvatura (a_lat = 1,5 m/s²), con frenado anticipado
var CURV = (function () {
  var N = RS.N, v = new Float64Array(N), k = 3, i;
  for (i = 0; i < N; i++) {
    if (i < k || i >= N - k) { v[i] = 30; continue; }
    var a1 = Math.atan2(RS.LY[i] - RS.LY[i - k], RS.LX[i] - RS.LX[i - k]), a2 = Math.atan2(RS.LY[i + k] - RS.LY[i], RS.LX[i + k] - RS.LX[i]);
    var d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    var kap = Math.abs(d) / (k * STEP);
    v[i] = clamp(Math.sqrt(1.5 / Math.max(kap, 1e-4)), 3.2, 30);
  }
  var w = new Float64Array(v);
  for (i = 0; i < N; i++) { var m = v[i]; for (var q = -5; q <= 5; q++) { var t = i + q; if (t >= 0 && t < N && v[t] < m) m = v[t]; } w[i] = m; }
  for (i = N - 2; i >= 0; i--) w[i] = Math.min(w[i], Math.sqrt(w[i + 1] * w[i + 1] + 2 * 1.6 * STEP));
  return w;
})();
function curvAt(s) { return CURV[clamp(Math.round(s / STEP), 0, RS.N - 1)]; }

/* ---------- paradas ---------- */
var LEGS = datos.ruta.legs, legSum = LEGS.reduce(function (a, l) { return a + l; }, 0);
var STOPS = (function () {
  var acc = 0;
  return datos.ruta.stops.map(function (p, i) {
    if (i > 0) acc += LEGS[i - 1];
    var s = i === 0 ? 0 : (i === datos.ruta.stops.length - 1 ? RT.total : acc * RT.total / legSum);
    var q = posAt(s);
    return { i: i, name: p.name, s: s, x: q.x, y: q.y, lx: q.lx, ly: q.ly, wait: 0, appear: 1, terminal: i === 0 || i === datos.ruta.stops.length - 1 };
  });
})();
var NST = STOPS.length;
var MS = STOPS.slice(0, NST - 1); // la parada final es el mismo campus

/* ---------- demanda ilustrativa ---------- */
function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
var R = rng(20261009);
var NSTU = 5200;
var VERTS = []; // vértices de calles residenciales y colectoras
ROADS.forEach(function (w) { if (w.c >= 2) for (var i = 0; i < w.n; i += 2) VERTS.push(w.lm[2 * i], w.lm[2 * i + 1]); });
var ILU = !datos.celdas || datos.celdas.length === 0;
var CELLS = (!ILU ? datos.celdas.map(function (c) { var m = merc(c.lon, c.lat), l = toLocal(c.lon, c.lat); return { n: c.n, lx: l[0], ly: l[1], x: m[0], y: m[1], cov: false, dmin: 9999, links: [], users: 0 }; }) : (function () {
  var NV = VERTS.length / 2, centers = [], i, tries = 0;
  while (centers.length < 15 && tries++ < 400) {
    var k = Math.floor(R() * NV), cx = VERTS[2 * k], cy = VERTS[2 * k + 1];
    if (Math.abs(cx) > 2300 || Math.abs(cy) > 1900) continue;
    if (Math.hypot(cx - 560, cy + 150) < 350) continue; // no dentro del campus
    // la mitad de las zonas nace cerca de la ruta, como pasa con una ruta que ya se ajustó a su demanda
    if (centers.length % 2 === 0) { var dm = 1e18; for (var jj = 0; jj < RS.N; jj += 8) { var ddx = RS.LX[jj] - cx, ddy = RS.LY[jj] - cy; if (ddx * ddx + ddy * ddy < dm) dm = ddx * ddx + ddy * ddy; } if (Math.sqrt(dm) > 450) continue; }
    centers.push({ x: cx, y: cy, w: 0.5 + R() * 1.1, sg: 230 + R() * 240 });
  }
  var tw = centers.reduce(function (a, c) { return a + c.w; }, 0), buckets = {};
  for (i = 0; i < NSTU; i++) {
    var r = R() * tw, c = centers[0];
    for (var q = 0; q < centers.length; q++) { r -= centers[q].w; if (r <= 0) { c = centers[q]; break; } }
    var u1 = Math.max(R(), 1e-6), u2 = R(), g = Math.sqrt(-2 * Math.log(u1));
    var px = c.x + g * Math.cos(2 * Math.PI * u2) * c.sg, py = c.y + g * Math.sin(2 * Math.PI * u2) * c.sg;
    var best = 1e18, bx = px, by = py;
    for (var v = 0; v < NV; v++) { var dx = VERTS[2 * v] - px, dy = VERTS[2 * v + 1] - py, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; bx = VERTS[2 * v]; by = VERTS[2 * v + 1]; } }
    var key = Math.floor(bx / 150) + '_' + Math.floor(by / 150), b = buckets[key] || (buckets[key] = { n: 0, sx: 0, sy: 0 });
    b.n++; b.sx += bx; b.sy += by;
  }
  return Object.keys(buckets).map(function (k) {
    var b = buckets[k], lx = b.sx / b.n, ly = b.sy / b.n, ll = fromLocal(lx, ly), m = merc(ll[0], ll[1]);
    return { n: b.n, lx: lx, ly: ly, x: m[0], y: m[1], cov: false, dmin: 9999, links: [], users: 0 };
  }).filter(function (c) { return c.n >= 5; });
})());
var TOTAL_STU = CELLS.reduce(function (a, c) { return a + c.n; }, 0);

/* ---------- modelo ---------- */
var P = { radius: 400, prop: 0.34 };
var EXTRAS = [];
function allStops() { return EXTRAS.length ? MS.concat(EXTRAS) : MS; }
function evaluate(list, r, prop, commit) {
  var out = { board: new Float64Array(list.length), catch_: new Float64Array(list.length), users: 0, covered: 0 };
  for (var ci = 0; ci < CELLS.length; ci++) {
    var c = CELLS[ci], ws = [], wsum = 0, wmax = 0, dmin = 1e9, si;
    for (si = 0; si < list.length; si++) {
      var d = Math.hypot(list[si].lx - c.lx, list[si].ly - c.ly);
      if (d < dmin) dmin = d;
      if (d <= r) out.catch_[si] += c.n;
      var w = pUse(d, r);
      if (w > 0.02) { ws.push(si, w, d); wsum += w; if (w > wmax) wmax = w; }
    }
    var users = c.n * prop * wmax; out.users += users;
    if (dmin <= r) out.covered += c.n;
    var links = commit ? [] : null;
    for (var q = 0; q < ws.length; q += 3) {
      var share = ws[q + 1] / wsum;
      out.board[ws[q]] += users * share;
      if (commit && share > 0.04) links.push({ si: ws[q], share: share, d: ws[q + 2], acc: R() });
    }
    if (commit) { c.links = links; c.users = users; c.dmin = dmin; c.cov = dmin <= r; }
  }
  return out;
}
var EV = null;
function recalc() { EV = evaluate(allStops(), P.radius, P.prop, true); }

/* curvas del día */
function dayLabel(h) {
  if (h >= 5.5 && h < 8.5) return 'Hora pico de la mañana';
  if (h >= 11.5 && h < 14) return 'Hora valle del mediodía';
  if (h >= 16.5 && h < 19.8) return 'Hora pico de la tarde';
  if (h < 5.5) return 'Antes del servicio';
  return h < 16.5 ? 'Jornada' : 'Cierre del servicio';
}
function trafficWord(v) { return v < 0.35 ? 'fluido' : v < 0.7 ? 'moderado' : 'denso'; }

/* ---------- estado y simulación ---------- */
var SIM = { T: 6.4 * 3600, now: 0, speed: 30, playing: !RM };
var LAYERS = { base: true, demanda: true, flujos: true, cobertura: false, paradas: true };
var view = { z: 14, cx: 0.5, cy: 0.5 };
var ST = { sel: -1, hover: -1, follow: false, reveal: RT.total, introDone: false, tab: 'ruta' };
var parts = [];
var T = {}; // colores del tema

/* --- Flota: un bus sale cada `intervalo` minutos desde la UDES, hace el recorrido y descansa
       `paradaCampus` minutos en la UDES antes de poder salir otra vez. Con pocos buses, las salidas se pierden. --- */
var CAP = datos.ruta.capacidad;
// Velocidad de crucero: parte de lo que el motor de rutas calcula para un carro (sin paradas ni tráfico), más KBUS % por ser bus.
var TRAF = 0.3, VC = 10.5, KBUS = 15;
function calibrar() {
  if (!datos.ruta.duracionS) return;
  var objetivo = datos.ruta.duracionS * (1 + KBUS / 100), lo = 5, hi = 22, m;
  for (var i = 0; i < 16; i++) { m = (lo + hi) / 2; if (estimateTrip(0, true, m) > objetivo) lo = m; else hi = m; }
  VC = clamp((lo + hi) / 2, 5, 22);
}
var FLEET = { n: clamp(datos.ruta.vehiculos, 1, 12), headway: clamp(datos.ruta.intervaloMin, 3, 120) * 60, term: clamp(datos.ruta.paradaCampusMin, 0, 30) * 60, first: 5.5 * 3600, last: 21 * 3600 };
var BUSES = [], TRIPS = [], nextJ = 0, missed = 0, FF = false, TT = null;
function Bus(id) {
  this.id = id; this.s = 0; this.v = 0; this.dwell = 0; this.occ = 0; this.h = headingAt(0); this.brake = false; this.next = 1; this.cap = CAP; this.at = -1;
  this.state = 'park'; this.dep = 0; this.free = 0; this.slot = 0;
}
function buildBuses() { BUSES.length = 0; for (var i = 0; i < FLEET.n; i++) BUSES.push(new Bus(i + 1)); }
calibrar();
buildBuses();
function depT(j) { return FLEET.first + j * FLEET.headway; }
function dispatch() {
  while (depT(nextJ) <= SIM.T && depT(nextJ) <= FLEET.last) {
    var pick = null;
    for (var i = 0; i < BUSES.length; i++) if (BUSES[i].state === 'park' && (!pick || BUSES[i].free < pick.free)) pick = BUSES[i];
    if (pick) { pick.state = 'run'; pick.s = 0; pick.v = 0; pick.next = 1; pick.occ = 0; pick.dwell = 0; pick.at = -1; pick.dep = depT(nextJ); } else missed++;
    nextJ++;
  }
}
function assignSlots() { var k = 0; BUSES.forEach(function (b) { b.slot = b.state === 'run' ? 0 : k++; }); }
function rebuildFleet(t) {
  buildBuses(); TRIPS.length = 0; nextJ = 0; missed = 0; FF = true;
  var keep = SIM.T;
  for (var tt = Math.min(FLEET.first, t); tt <= t; tt += 1) { SIM.T = tt; dispatch(); for (var i = 0; i < BUSES.length; i++) stepBus(BUSES[i], 1); }
  SIM.T = t; FF = false; assignSlots(); buildMarkers();
}

function stepBus(b, dt) {
  var hr = SIM.T / 3600;
  if (b.state === 'park') { b.v = 0; b.brake = false; return; }
  if (b.dwell > 0) {
    b.dwell -= dt; b.v = 0; b.brake = false;
    if (b.dwell <= 0) { b.dwell = 0; b.at = -1; if (b.state === 'term') { b.state = 'park'; b.free = SIM.T; assignSlots(); } }
    return;
  }
  var vmax = VC * (1 - TRAF * trafficH(hr)), tgt = STOPS[b.next].s, dist = tgt - b.s;
  var allowed = Math.sqrt(2 * 1.7 * Math.max(0, dist - 1.5));
  var target = Math.min(vmax, curvAt(b.s) * (1 - 0.12 * trafficH(hr)), allowed);
  var prev = b.v;
  if (b.v < target) b.v = Math.min(target, b.v + 1.1 * dt); else b.v = Math.max(target, b.v - 1.9 * dt);
  b.brake = b.v < prev - 1e-3;
  b.s += b.v * dt;
  if (dist < 3 && b.v < 1.2) arrive(b);
}
function arrive(b) {
  var st = STOPS[b.next], idx = b.next === NST - 1 ? 0 : b.next, boarders = 0, alight = 0;
  b.s = st.s; b.v = 0; b.at = idx;
  if (st.terminal) {
    alight = b.occ; b.occ = 0;
    TRIPS.push({ bus: b.id, dep: b.dep, arr: SIM.T, dur: SIM.T - b.dep }); if (TRIPS.length > 40) TRIPS.shift();
    b.s = 0; b.next = 1; b.state = 'term'; b.dwell = Math.max(1, FLEET.term); assignSlots();
    return;
  }
  alight = Math.min(b.occ, Math.round(b.occ * (0.08 + R() * 0.1))); b.occ -= alight;
  var ms = MS[idx];
  if (FF) boarders = Math.min(b.cap - b.occ, Math.round(EV.board[idx] * 2 * hourShare(SIM.T / 3600) * FLEET.headway / 3600));
  else { boarders = Math.min(ms.wait, b.cap - b.occ); ms.wait -= boarders; }
  b.occ += boarders; b.next = b.next + 1;
  b.dwell = 14 + 1.5 * (boarders + alight) * 0.5;
  if (!FF) bump(idx);
}

function spawn(c, l, simNow) {
  var dst = allStops()[l.si], dx = dst.x - c.x, dy = dst.y - c.y, off = (R() - 0.5) * 0.3;
  parts.push({ x0: c.x, y0: c.y, x1: dst.x, y1: dst.y, cx: (c.x + dst.x) / 2 - dy * off, cy: (c.y + dst.y) / 2 + dx * off, t0: simNow, dur: Math.max(25, (l.d / (1.25 + R() * 0.3))), si: l.si });
}
function emit(dt) {
  var hs = hourShare(SIM.T / 3600) * 2 / 3600;
  for (var i = 0; i < CELLS.length; i++) {
    var c = CELLS[i];
    for (var k = 0; k < c.links.length; k++) {
      var l = c.links[k];
      l.acc += c.users * l.share * hs * dt;
      while (l.acc >= 1) { l.acc -= 1; if (parts.length < 900 && LAYERS.flujos) spawn(c, l, SIM.now); else { var s = allStops()[l.si]; if (s) s.wait++; } }
    }
  }
}
function stepParts() {
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    if (SIM.now - p.t0 >= p.dur) {
      var st = allStops()[p.si]; if (st) st.wait++;
      parts[i] = parts[parts.length - 1]; parts.pop();
    }
  }
}
function resetFlow() { parts.length = 0; allStops().forEach(function (s) { s.wait = 0; }); }

/* ---------- lienzo ---------- */
var cv = $('#map'), ctx = cv.getContext('2d'), stage = $('.stage');
var W = 0, H = 0, DPR = 1;
function ws() { return 256 * Math.pow(2, view.z); }
function SX(nx) { return (nx - view.cx) * ws() + W / 2; }
function SY(ny) { return (ny - view.cy) * ws() + H / 2; }
function MPP() { return 156543.03392 * Math.cos(A0 * R2D) / Math.pow(2, view.z); }
function readTheme() {
  var cs = getComputedStyle(root), keys = ['map-ground', 'map-road', 'map-case', 'map-minor', 'map-minor-case', 'map-route', 'map-route-case', 'flow', 'gap', 'bus-body', 'bus-roof', 'bus-glass', 'navy', 'signal', 'surface', 'ink', 'board'];
  keys.forEach(function (k) { T[k] = cs.getPropertyValue('--' + k).trim(); });
  T.dark = parseInt(T['map-ground'].slice(1, 3), 16) < 90;
}
function rgba(hex, a) {
  if (hex[0] !== '#') return hex;
  if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
}
function resize() {
  var r = stage.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function fitView(animate) {
  var minx = 9, miny = 9, maxx = -9, maxy = -9;
  for (var i = 0; i < RT.n; i++) { minx = Math.min(minx, RT.mx[i]); maxx = Math.max(maxx, RT.mx[i]); miny = Math.min(miny, RT.my[i]); maxy = Math.max(maxy, RT.my[i]); }
  var narrow = W < 700, padT = narrow ? 96 : 70, padB = narrow ? 200 : 150, padX = 56;
  var z = Math.log2(Math.min((W - padX * 2) / ((maxx - minx) * 256), (H - padT - padB) / ((maxy - miny) * 256)));
  z = clamp(z, 12, 17);
  var ws2 = 256 * Math.pow(2, z), midx = (minx + maxx) / 2, midy = (miny + maxy) / 2;
  var cx = midx, cy = midy - ((padT + (H - padB)) / 2 - H / 2) / ws2;
  if (animate && HAS_GSAP && !RM) gsap.to(view, { z: z, cx: cx, cy: cy, duration: 0.9, ease: 'power4.out', overwrite: true });
  else { view.z = z; view.cx = cx; view.cy = cy; }
}
function flyTo(nx, ny, z) {
  ST.follow = false; syncFollow();
  if (HAS_GSAP && !RM) gsap.to(view, { z: z, cx: nx, cy: ny, duration: 0.8, ease: 'power4.out', overwrite: true });
  else { view.z = z; view.cx = nx; view.cy = ny; }
}

var TILES = new Map(), tileOk = 0, tileBad = 0;
function tile(z, x, y) {
  var k = z + '/' + x + '/' + y, t = TILES.get(k);
  if (!t) {
    var img = new Image(); t = { img: img, ok: false };
    img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = function () { t.ok = true; tileOk++; };
    img.onerror = function () { tileBad++; };
    img.src = 'https://tile.openstreetmap.org/' + k + '.png';
    TILES.set(k, t);
    if (TILES.size > 700) { var first = TILES.keys().next().value; if (first !== undefined) TILES.delete(first); }
  }
  return t;
}
function tilesReady() { return !(tileBad >= 6 && tileOk === 0); }
function drawTiles() {
  var zt = clamp(Math.round(view.z), 12, 19), n = Math.pow(2, zt), w2 = ws(), sz = w2 / n;
  var x0 = Math.floor((view.cx - W / 2 / w2) * n), x1 = Math.floor((view.cx + W / 2 / w2) * n), y0 = Math.floor((view.cy - H / 2 / w2) * n), y1 = Math.floor((view.cy + H / 2 / w2) * n);
  for (var ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
    for (var tx = Math.max(0, x0); tx <= Math.min(n - 1, x1); tx++) {
      var t = tile(zt, tx, ty), px = SX(tx / n), py = SY(ty / n);
      if (t.ok) { ctx.drawImage(t.img, px, py, sz + 0.6, sz + 0.6); continue; }
      var par = TILES.get((zt - 1) + '/' + (tx >> 1) + '/' + (ty >> 1));
      if (par && par.ok) ctx.drawImage(par.img, (tx & 1) * 128, (ty & 1) * 128, 128, 128, px, py, sz + 0.6, sz + 0.6);
    }
  }
  // un velo blanco deja respirar las capas de datos sobre el mapa
  ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.fillRect(0, 0, W, H);
}
var WIDTH = [[3.6, 0], [3.0, 0], [2.4, 0], [1.8, 0], [1.0, 0]];
function drawRoads() {
  var sc = Math.pow(2, (view.z - 14) * 0.62), w2 = ws();
  var x0 = view.cx - W / 2 / w2 - 0.002, x1 = view.cx + W / 2 / w2 + 0.002, y0 = view.cy - H / 2 / w2 - 0.002, y1 = view.cy + H / 2 / w2 + 0.002;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var pass = 0; pass < 2; pass++) {
    for (var c = 4; c >= 0; c--) {
      if (c === 4 && view.z < 13.4) continue;
      var list = BYCLASS[c];
      ctx.beginPath();
      for (var k = 0; k < list.length; k++) {
        var w = list[k];
        if (w.maxx < x0 || w.minx > x1 || w.maxy < y0 || w.miny > y1) continue;
        ctx.moveTo(SX(w.xy[0]), SY(w.xy[1]));
        for (var i = 1; i < w.n; i++) ctx.lineTo(SX(w.xy[2 * i]), SY(w.xy[2 * i + 1]));
      }
      var base = Math.max(0.7, WIDTH[c][0] * sc), minor = c >= 3;
      if (pass === 0) { ctx.strokeStyle = minor ? T['map-minor-case'] : T['map-case']; ctx.lineWidth = base + (T.dark ? 0.6 : 1.8); }
      else { ctx.strokeStyle = minor ? T['map-minor'] : T['map-road']; ctx.lineWidth = base; }
      ctx.stroke();
    }
  }
}
function routePath(upTo) {
  ctx.beginPath();
  ctx.moveTo(SX(RT.mx[0]), SY(RT.my[0]));
  for (var i = 1; i < RT.n; i++) {
    if (RT.cum[i] > upTo) { var u = (upTo - RT.cum[i - 1]) / (RT.cum[i] - RT.cum[i - 1]); ctx.lineTo(SX(RT.mx[i - 1] + (RT.mx[i] - RT.mx[i - 1]) * u), SY(RT.my[i - 1] + (RT.my[i] - RT.my[i - 1]) * u)); break; }
    ctx.lineTo(SX(RT.mx[i]), SY(RT.my[i]));
  }
}
function subPath(s0, s1) {
  var a = Math.max(0, s0), b = Math.min(RT.total, s1);
  ctx.beginPath(); var first = true;
  for (var s = a; s <= b; s += 6) { var p = posAt(s); if (first) { ctx.moveTo(SX(p.x), SY(p.y)); first = false; } else ctx.lineTo(SX(p.x), SY(p.y)); }
}
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

function drawDemand(t, mp) {
  var gapPulse = RM ? 0 : Math.sin(t * 2.2) * 0.07;
  for (var i = 0; i < CELLS.length; i++) {
    var c = CELLS[i], x = SX(c.x), y = SY(c.y);
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    var rad = Math.max(3, (22 + 8 * Math.sqrt(c.n)) / mp * 0.55);
    if (c.cov) {
      ctx.fillStyle = rgba(T.flow, 0.14); ctx.beginPath(); ctx.arc(x, y, rad * 1.7, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(T.flow, 0.38); ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = rgba(T.gap, 0.2 + gapPulse); ctx.beginPath(); ctx.arc(x, y, rad * 1.7, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(T.gap, 0.5); ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = T.gap; ctx.beginPath(); ctx.arc(x, y, rad * 1.7, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}
function drawCoverage(mp) {
  var rpx = P.radius / mp, list = allStops();
  ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
  for (var i = 0; i < list.length; i++) {
    var x = SX(list[i].x), y = SY(list[i].y);
    if (x < -rpx || y < -rpx || x > W + rpx || y > H + rpx) continue;
    ctx.fillStyle = rgba(T['map-route'], 0.05); ctx.strokeStyle = rgba(T['map-route'], 0.55);
    ctx.beginPath(); ctx.arc(x, y, rpx, 0, 6.2832); ctx.fill(); ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawRoute(t, mp) {
  var up = ST.reveal;
  routePath(up); ctx.lineWidth = 8 * Math.pow(2, (view.z - 14) * 0.3); ctx.strokeStyle = T['map-route-case']; ctx.globalAlpha = T.dark ? 0.85 : 1; ctx.stroke(); ctx.globalAlpha = 1;
  routePath(up); ctx.lineWidth = 4.2 * Math.pow(2, (view.z - 14) * 0.3); ctx.strokeStyle = T['map-route']; ctx.stroke();
  // pulso que avanza en el sentido de la marcha
  if (!RM) { routePath(up); ctx.lineWidth = 2; ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.setLineDash([2, 22]); ctx.lineDashOffset = -t * 22; ctx.stroke(); ctx.setLineDash([]); }
  // estela de los buses
  BUSES.forEach(function (b) { if (b.state !== 'run') return; subPath(b.s - 260, b.s); ctx.lineWidth = 4.2 * Math.pow(2, (view.z - 14) * 0.3); ctx.strokeStyle = rgba(T.signal, 0.9); ctx.stroke(); });
  // flechas de sentido
  if (view.z >= 14.2) {
    ctx.fillStyle = rgba('#ffffff', 0.9);
    for (var s = 250; s < Math.min(up, RT.total); s += 520) {
      var p = posAt(s), a = headingAt(s), x = SX(p.x), y = SY(p.y);
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(3.6, 0); ctx.lineTo(-2.4, 3); ctx.lineTo(-1, 0); ctx.lineTo(-2.4, -3); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
}
function drawFlows() {
  ctx.fillStyle = T.flow;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], u = clamp((SIM.now - p.t0) / p.dur, 0, 1), e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
    var a = 1 - e, x = a * a * p.x0 + 2 * a * e * p.cx + e * e * p.x1, y = a * a * p.y0 + 2 * a * e * p.cy + e * e * p.y1;
    var sx = SX(x), sy = SY(y);
    if (sx < -6 || sy < -6 || sx > W + 6 || sy > H + 6) continue;
    for (var k = 3; k >= 1; k--) {
      var e2 = Math.max(0, e - k * 0.018), a2 = 1 - e2, x2 = a2 * a2 * p.x0 + 2 * a2 * e2 * p.cx + e2 * e2 * p.x1, y2 = a2 * a2 * p.y0 + 2 * a2 * e2 * p.cy + e2 * e2 * p.y1;
      ctx.globalAlpha = 0.16 * (4 - k); ctx.beginPath(); ctx.arc(SX(x2), SY(y2), 1.5, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, 1.6 * (1 - u) + 0.35); ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawStops(t, mp) {
  var showLabel = view.z >= 15.4;
  for (var pass = 0; pass < 2; pass++) {
    var list = allStops();
    for (var i = 0; i < list.length; i++) {
      var s = list[i], ext = i >= MS.length, x = SX(s.x), y = SY(s.y);
      if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      var k = s.appear == null ? 1 : s.appear, r = (s.terminal ? 8.5 : 6) * clamp(Math.pow(2, (view.z - 14.5) * 0.18), 0.85, 1.5) * k;
      if (pass === 0) {
        if (ext) { ctx.setLineDash([3, 2.5]); ctx.lineWidth = 1.5; ctx.strokeStyle = T.gap; var q = nearestRoute(s); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(SX(q.x), SY(q.y)); ctx.stroke(); ctx.setLineDash([]); }
        continue;
      }
      if (i === ST.sel) { var pr = RM ? 0 : (t * 1.4) % 1; ctx.strokeStyle = rgba(T['map-route'], 0.5 * (1 - pr)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4 + pr * 14, 0, 6.2832); ctx.stroke(); }
      ctx.fillStyle = ext ? T.gap : T.surface; ctx.strokeStyle = ext ? T.surface : (s.terminal ? T.board : T.navy); ctx.lineWidth = s.terminal ? 3.5 : 3;
      if (ext) { ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 6.2832); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#1d1402'; ctx.fillRect(x - 3, y - 0.8, 6, 1.6); ctx.fillRect(x - 0.8, y - 3, 1.6, 6); }
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.stroke(); if (s.terminal) { ctx.fillStyle = T.signal; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.2832); ctx.fill(); } }
      if (s.wait > 0 && view.z >= 14.6) {
        var txt = String(s.wait), tw = ctx.measureText(txt).width + 10;
        ctx.font = '700 11px "Barlow Condensed", sans-serif'; tw = ctx.measureText(txt).width + 10;
        rr(x - tw / 2, y - r - 21, tw, 15, 7.5); ctx.fillStyle = T.board; ctx.fill();
        ctx.fillStyle = '#f6b93f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - r - 13.5);
      }
      if (showLabel || i === ST.sel || i === ST.hover) label(x, y + r + 6, s.name || ('Parada nueva'), i === ST.sel);
    }
  }
}
function drawPicks(t) {
  if (ST.tab !== 'nueva') return;
  ctx.font = '700 11px "Barlow Condensed", sans-serif';
  PICKS.forEach(function (p, i) {
    var x = SX(p.x), y = SY(p.y), on = ghost === p, pr = RM ? 0 : (t * 1.1 + i * 0.3) % 1, r = on ? 11 : 8;
    ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = T.gap; ctx.beginPath(); ctx.arc(x, y, r + (on ? pr * 9 : 0), 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.gap; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#1d1402'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 0.5);
  });
}
function label(x, y, text, strong) {
  ctx.font = '700 11.5px Manrope, sans-serif'; var w = ctx.measureText(text).width + 14;
  rr(x - w / 2, y, w, 20, 10); ctx.fillStyle = strong ? T.board : T.surface; ctx.globalAlpha = 0.96; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = strong ? '#f6f9ff' : T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 10.5);
}
function nearestRoute(s) {
  var best = 1e18, q = null;
  for (var i = 0; i < RS.N; i += 2) { var d = (RS.LX[i] - s.lx) * (RS.LX[i] - s.lx) + (RS.LY[i] - s.ly) * (RS.LY[i] - s.ly); if (d < best) { best = d; q = { x: RS.X[i], y: RS.Y[i] }; } }
  return q;
}
function drawBus(b, t, mp) {
  var p = posAt(b.s), L = clamp(12 / mp, 15, 46), Wd = L * 0.38, x = SX(p.x), y = SY(p.y);
  if (x < -60 || y < -60 || x > W + 60 || y > H + 60) return;
  // carril derecho
  var off = Wd * 0.55, ox = -Math.sin(b.h) * off, oy = Math.cos(b.h) * off;
  if (b.state !== 'run') { var back = b.slot * L * 1.25, side = Wd * 1.35; ox += -Math.sin(b.h) * side - Math.cos(b.h) * back; oy += Math.cos(b.h) * side - Math.sin(b.h) * back; }
  ctx.save(); ctx.translate(x + ox, y + oy); ctx.rotate(b.h);
  var night = T.dark || SIM.T / 3600 < 6.2 || SIM.T / 3600 > 17.8;
  // luces
  var g1 = ctx.createLinearGradient(L / 2, 0, L / 2 + L * 1.5, 0);
  g1.addColorStop(0, 'rgba(255,244,200,' + (night ? 0.5 : 0.16) + ')'); g1.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = g1; ctx.beginPath(); ctx.moveTo(L / 2, -Wd * 0.3); ctx.lineTo(L / 2 + L * 1.5, -Wd * 1.05); ctx.lineTo(L / 2 + L * 1.5, Wd * 1.05); ctx.lineTo(L / 2, Wd * 0.3); ctx.closePath(); ctx.fill();
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(-L / 2 + 1.2, -Wd / 2 + 2, L, Wd, Wd * 0.3); ctx.fill();
  // carrocería
  rr(-L / 2, -Wd / 2, L, Wd, Wd * 0.3); ctx.fillStyle = T['bus-body']; ctx.fill();
  ctx.lineWidth = 0.8; ctx.strokeStyle = rgba('#000000', 0.35); ctx.stroke();
  // techo y ventanas
  rr(-L / 2 + L * 0.06, -Wd / 2 + Wd * 0.14, L * 0.7, Wd * 0.72, Wd * 0.18); ctx.fillStyle = T['bus-roof']; ctx.fill();
  ctx.fillStyle = T['bus-glass']; for (var i = 0; i < 5; i++) { ctx.fillRect(-L / 2 + L * (0.1 + i * 0.135), -Wd * 0.28, L * 0.095, Wd * 0.56); }
  // parabrisas
  ctx.fillStyle = T['bus-glass']; rr(L / 2 - L * 0.2, -Wd / 2 + Wd * 0.12, L * 0.16, Wd * 0.76, Wd * 0.14); ctx.fill();
  // franja
  ctx.fillStyle = T.signal; ctx.fillRect(-L / 2 + L * 0.04, -Wd / 2 + Wd * 0.46, L * 0.92, Wd * 0.08);
  // frenos
  ctx.fillStyle = b.brake || b.dwell > 0 ? '#ff4b3e' : '#7a2620'; ctx.fillRect(-L / 2 - 0.4, -Wd / 2 + Wd * 0.14, 1.6, Wd * 0.2); ctx.fillRect(-L / 2 - 0.4, Wd / 2 - Wd * 0.34, 1.6, Wd * 0.2);
  // intermitentes en parada
  if (b.dwell > 0 && Math.floor(t * 3) % 2 === 0) { ctx.fillStyle = T.signal; ctx.beginPath(); ctx.arc(L / 2 - 1, -Wd / 2, 1.5, 0, 6.2832); ctx.arc(L / 2 - 1, Wd / 2, 1.5, 0, 6.2832); ctx.arc(-L / 2 + 1, -Wd / 2, 1.5, 0, 6.2832); ctx.arc(-L / 2 + 1, Wd / 2, 1.5, 0, 6.2832); ctx.fill(); }
  ctx.restore();
  if (view.z >= 14.8) {
    var txt = 'Bus ' + b.id + (b.state === 'run' ? ' · ' + Math.round(b.occ) + '/' + b.cap : b.state === 'term' ? ' · descansa' : ' · espera');
    ctx.font = '700 11px Manrope, sans-serif'; var w = ctx.measureText(txt).width + 14;
    rr(x - w / 2, y - L * 0.5 - 28, w, 19, 9.5); ctx.fillStyle = T.board; ctx.fill();
    ctx.fillStyle = '#f6b93f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - L * 0.5 - 18);
  }
}
function drawCampus(mp) {
  var s = STOPS[0], x = SX(s.x), y = SY(s.y);
  if (view.z < 13) return;
  ctx.font = '800 12px Manrope, sans-serif'; var w = ctx.measureText('UDES').width + 18;
  rr(x - w / 2, y - 40, w, 22, 11); ctx.fillStyle = T.board; ctx.fill();
  ctx.fillStyle = '#f6b93f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('UDES', x, y - 28.5);
}

var tPrev = 0, clockAcc = 0, uiAcc = 0, wasDrag = false;
function frame(timeMs) {
  var t = timeMs / 1000, dt = Math.min(0.1, t - tPrev || 0.016); tPrev = t;
  if (SIM.playing) {
    var ds = dt * SIM.speed; SIM.T += ds; SIM.now += ds;
    if (SIM.T >= 22 * 3600) { SIM.T = 5 * 3600; resetFlow(); rebuildFleet(SIM.T); }
    var n = Math.max(1, Math.ceil(ds / 0.5));
    dispatch();
    for (var k = 0; k < n; k++) BUSES.forEach(function (b) { stepBus(b, ds / n); });
    emit(ds); stepParts();
  }
  BUSES.forEach(function (b) { var th = headingAt(b.s), d = th - b.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; b.h += d * Math.min(1, dt * 9); });
  if (ST.follow) { var fb = BUSES.filter(function (x) { return x.state === 'run'; })[0] || BUSES[0], p = posAt(fb.s), f = 1 - Math.pow(0.0015, dt); view.cx += (p.x - view.cx) * f; view.cy += (p.y - view.cy) * f; view.z += (16.7 - view.z) * f * 0.6; }
  var mp = MPP();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = T['map-ground']; ctx.fillRect(0, 0, W, H);
  if (LAYERS.base && tilesReady()) drawTiles(); else drawRoads();
  if (LAYERS.cobertura) drawCoverage(mp);
  if (LAYERS.demanda) drawDemand(t, mp);
  drawRoute(t, mp);
  if (LAYERS.flujos) drawFlows();
  if (LAYERS.paradas) drawStops(t, mp);
  if (LAYERS.paradas) drawPicks(t);
  drawCampus(mp);
  BUSES.forEach(function (b) { drawBus(b, t, mp); });
  uiAcc += dt; clockAcc += dt;
  if (uiAcc > 0.2) { uiAcc = 0; updateLive(); }
}

/* ---------- interacción del mapa ---------- */
var ptrs = {}, drag = null, pinch = null;
function worldAt(px, py) { return [view.cx + (px - W / 2) / ws(), view.cy + (py - H / 2) / ws()]; }
function zoomAt(px, py, nz) {
  nz = clamp(nz, 12, 18.5); var w0 = worldAt(px, py); view.z = nz;
  view.cx = w0[0] - (px - W / 2) / ws(); view.cy = w0[1] - (py - H / 2) / ws();
}
function stopAtPx(px, py) {
  var list = allStops(), best = -1, bd = 16;
  for (var i = 0; i < list.length; i++) { var d = Math.hypot(SX(list[i].x) - px, SY(list[i].y) - py); if (d < bd) { bd = d; best = i; } }
  return best;
}
function stopOrBusAt(px, py) {
  if (!LAYERS.paradas) return -1;
  return stopAtPx(px, py);
}
cv.addEventListener('pointerdown', function (e) {
  cv.setPointerCapture(e.pointerId);
  var r = cv.getBoundingClientRect(); ptrs[e.pointerId] = { x: e.clientX - r.left, y: e.clientY - r.top };
  var ids = Object.keys(ptrs);
  if (ids.length === 1) { drag = { x: ptrs[e.pointerId].x, y: ptrs[e.pointerId].y, moved: 0 }; cv.classList.add('is-drag'); if (HAS_GSAP) gsap.killTweensOf(view); }
  if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; drag = null; }
});
cv.addEventListener('pointermove', function (e) {
  var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (ptrs[e.pointerId]) {
    ptrs[e.pointerId] = { x: px, y: py };
    var ids = Object.keys(ptrs);
    if (ids.length >= 2 && pinch) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z + Math.log2(Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); ST.follow = false; syncFollow(); return; }
    if (drag) {
      var dx = px - drag.x, dy = py - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 3) { if (ST.follow) { ST.follow = false; syncFollow(); } view.cx -= dx / ws(); view.cy -= dy / ws(); }
      drag.x = px; drag.y = py;
    }
    return;
  }
  var h = stopOrBusAt(px, py);
  if (h !== ST.hover) { ST.hover = h; cv.classList.toggle('is-hot', h >= 0); showTip(h, px, py); }
  else if (h >= 0) moveTip(px, py);
});
function endPtr(e) {
  var was = drag && drag.moved <= 3; delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null;
  if (!Object.keys(ptrs).length) { cv.classList.remove('is-drag'); if (was) { var r = cv.getBoundingClientRect(), i = stopOrBusAt(e.clientX - r.left, e.clientY - r.top); if (i >= 0) selectStop(i, true); } drag = null; }
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', function () { if (!Object.keys(ptrs).length) { ST.hover = -1; hideTip(); } });
cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); ST.follow = false; syncFollow(); zoomAt(e.clientX - r.left, e.clientY - r.top, view.z - e.deltaY * 0.0016); }, { passive: false });
cv.addEventListener('dblclick', function (e) { var r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, view.z + 1); });
cv.addEventListener('keydown', function (e) {
  var st = 60 / ws(), k = e.key, used = true;
  if (k === 'ArrowLeft') view.cx -= st; else if (k === 'ArrowRight') view.cx += st; else if (k === 'ArrowUp') view.cy -= st; else if (k === 'ArrowDown') view.cy += st;
  else if (k === '+' || k === '=') view.z = clamp(view.z + 0.5, 12, 18.5); else if (k === '-') view.z = clamp(view.z - 0.5, 12, 18.5); else used = false;
  if (used) { e.preventDefault(); ST.follow = false; syncFollow(); }
});

/* tooltip */
var tip = $('#tip');
function showTip(i, px, py) {
  if (i < 0) { hideTip(); return; }
  var s = allStops()[i], bph = EV ? EV.board[i] * 2 * hourShare(SIM.T / 3600) : 0;
  tip.innerHTML = esc(s.name || 'Parada nueva') + '<b>' + (bph < 10 ? bph.toFixed(1).replace('.', ',') : Math.round(bph)) + '/h</b>';
  tip.classList.add('on'); moveTip(px, py);
}
function moveTip(px, py) { var x = clamp(px + 14, 8, W - 250), y = clamp(py + 14, 56, H - 160); tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
function hideTip() { tip.classList.remove('on'); cv.classList.remove('is-hot'); }

/* ---------- panel ---------- */
var lineEl = $('#line'), boardEl = $('#board');
function buildLine() {
  var html = '';
  for (var i = 0; i < NST; i++) {
    var s = STOPS[i], end = i === 0 || i === NST - 1;
    html += '<li><button type="button" class="stop' + (end ? ' stop--end' : '') + '" data-i="' + (i === NST - 1 ? 0 : i) + '"><span class="node"></span><span class="sname">' + esc(i === NST - 1 ? 'Regreso al campus' : s.name) +
      '<small><span class="sbar"><i data-bar="' + i + '"></i></span><span data-wait="' + i + '"></span></small></span><span class="sp"><span data-bph="' + i + '">–</span><small>por hora</small></span></button></li>';
  }
  lineEl.innerHTML = html; buildMarkers();
  $$('.stop', lineEl).forEach(function (b) { b.addEventListener('click', function () { selectStop(+b.dataset.i, true); }); });
}
function buildMarkers() {
  var wrap = $('#linewrap'); if (!wrap) return;
  $$('.sw8', wrap).forEach(function (m) { m.remove(); });
  wrap.insertAdjacentHTML('beforeend', BUSES.map(function (b) { return '<div class="sw8" data-bus="' + b.id + '" aria-hidden="true" style="display:none"><span>' + b.id + '</span></div>'; }).join(''));
}
function selectStop(i, fly) {
  ST.sel = i;
  $$('.stop', lineEl).forEach(function (b, k) { b.setAttribute('aria-current', String(+b.dataset.i === i && k < NST - 1)); });
  var s = allStops()[i];
  if (fly && s) flyTo(s.x, s.y, Math.max(view.z, 16.2));
  if (s && ST.tab === 'ruta') { var row = $$('.stop', lineEl)[i]; if (row && fly) row.scrollIntoView({ block: 'nearest', behavior: RM ? 'auto' : 'smooth' }); }
}
function bump(idx) {
  if (!HAS_GSAP || RM) return;
  var el = $('[data-wait="' + idx + '"]'); if (el) { var base = getComputedStyle(el).color; gsap.fromTo(el, { color: '#d98a00' }, { color: base, duration: 0.7, ease: 'power2.out', clearProps: 'color' }); }
}
function fmtMin(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60); return m; }
function updateLive() {
  var hr = SIM.T / 3600, hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
  $('#clockTxt').firstChild.nodeValue = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  $('#clockSub').textContent = dayLabel(hr) + ' · tráfico ' + trafficWord(trafficH(hr)) + ' (simulado)';
  moveHead(SIM.T / 60);
  // tablero
  var live = BUSES.filter(function (b) { return b.state !== 'park'; }), parked = BUSES.length - live.length;
  var rows = live.map(function (b) {
    if (b.state === 'term') {
      return '<div class="brow"><span class="bid">BUS ' + b.id + '</span><span class="bto">Parada en la UDES<small>Descansa antes de volver a salir</small></span><span class="beta">' + Math.max(1, Math.ceil(b.dwell / 60)) + '<small>min</small></span></div>';
    }
    var st = STOPS[b.next], eta = (st.s - b.s) / Math.max(4.5, 8.2 * (1 - 0.4 * trafficH(hr))), kmh = Math.round(b.v * 3.6);
    return '<div class="brow"><span class="bid">BUS ' + b.id + '</span><span class="bto">' + (b.dwell > 0 ? 'En parada · ' : 'Hacia ') + esc(b.dwell > 0 ? STOPS[b.at < 0 ? 0 : b.at].name : st.name) + '<small>' + (b.dwell > 0 ? 'Subiendo estudiantes' : 'Siguiente: ' + esc(st.name)) + '</small></span>' +
      '<span class="beta">' + (b.dwell > 0 ? '—' : fmtMin(eta)) + '<small>min</small></span><span class="bmeta"><span>' + Math.round(b.occ) + ' / ' + b.cap + ' a bordo</span><span class="occ"><i style="width:' + Math.round(b.occ / b.cap * 100) + '%"></i></span><span>' + kmh + ' km/h</span></span></div>';
  });
  if (parked > 0) {
    var nd = depT(nextJ), has = nd <= FLEET.last;
    rows.push('<div class="brow"><span class="bid">UDES</span><span class="bto">' + parked + (parked === 1 ? ' bus espera' : ' buses esperan') + '<small>' + (has ? 'Próxima salida ' + hhmm(nd) : 'Sin más salidas hoy') + '</small></span>' + (has ? '<span class="beta">' + Math.max(0, Math.ceil((nd - SIM.T) / 60)) + '<small>min</small></span>' : '') + '</div>');
  }
  if (!rows.length) rows.push('<div class="brow"><span class="bid">UDES</span><span class="bto">Sin buses en servicio<small>El servicio sale entre las ' + hhmm(FLEET.first) + ' y las ' + hhmm(FLEET.last) + '</small></span></div>');
  rows = rows.join('');
  if (boardEl._last !== rows) { boardEl.innerHTML = rows; boardEl._last = rows; }
  // línea
  var share = hourShare(hr) * 2, mx = 0, i;
  if (EV) for (i = 0; i < MS.length; i++) mx = Math.max(mx, EV.board[i]);
  for (i = 0; i < NST; i++) {
    var mi = i === NST - 1 ? 0 : i, b = EV ? EV.board[mi] * share : 0;
    var el = lineEl.querySelector('[data-bph="' + i + '"]'); if (el) el.textContent = b < 10 ? b.toFixed(1).replace('.', ',') : Math.round(b);
    var bar = lineEl.querySelector('[data-bar="' + i + '"]'); if (bar) bar.style.width = (mx ? clamp(EV.board[mi] / mx, 0, 1) * 100 : 0) + '%';
    var w = lineEl.querySelector('[data-wait="' + i + '"]'); if (w) w.textContent = MS[mi].wait > 0 ? MS[mi].wait + ' esperando' : 'sin espera';
  }
  BUSES.forEach(function (b) {
    var k = 0; for (var j = 0; j < NST - 1; j++) if (STOPS[j + 1].s > b.s) { k = j + (b.s - STOPS[j].s) / (STOPS[j + 1].s - STOPS[j].s); break; }
    var el = $('#linewrap [data-bus="' + b.id + '"]'); if (el) { el.style.display = b.state === 'run' ? '' : 'none'; el.style.transform = 'translate(0px,' + (k * 46 + 23) + 'px)'; }
  });
  if (ST.tab === 'demanda') renderStats(true);
  if (ST.tab === 'flota') renderFlota();
}

/* flota: tiempos de recorrido y salidas del día */
function pad2(n) { return String(n).padStart(2, '0'); }
function hhmm(sec) { sec = Math.round(sec / 60) * 60; return pad2(Math.floor(sec / 3600) % 24) + ':' + pad2(Math.floor(sec % 3600 / 60)); }
// El recorrido de un bus que sale a la hora dep, con la misma física del mapa y el tráfico simulado de esa hora.
function estimateTrip(dep, libre, vc) {
  var sPos = 0, v = 0, next = 1, t = dep, dwell = 0, guard = 0;
  while (guard++ < 14000) {
    var hh = t / 3600, tr = libre ? 0 : trafficH(hh);
    if (dwell > 0) { dwell -= 1; t += 1; continue; }
    var vmax = (vc || VC) * (1 - TRAF * tr), dist = STOPS[next].s - sPos, allowed = Math.sqrt(2 * 1.7 * Math.max(0, dist - 1.5));
    var target = Math.min(vmax, curvAt(sPos) * (1 - 0.12 * tr), allowed);
    if (v < target) v = Math.min(target, v + 1.1); else v = Math.max(target, v - 1.9);
    sPos += v; t += 1;
    if (dist < 3 && v < 1.2) {
      if (next === NST - 1) return t - dep;
      var b = EV ? EV.board[next] * 2 * hourShare(hh) * FLEET.headway / 3600 : 0;
      dwell = libre ? 0 : 14 + 1.5 * (b + b * 0.12) * 0.5; sPos = STOPS[next].s; v = 0; next++;
    }
  }
  return t - dep;
}
function buildTimetable() {
  var rows = [], free = [], i, j;
  for (i = 0; i < FLEET.n; i++) free.push(-1e9);
  for (j = 0; depT(j) <= FLEET.last; j++) {
    var dep = depT(j), dur = estimateTrip(dep), k = -1, best = 1e18;
    for (i = 0; i < FLEET.n; i++) if (free[i] <= dep && free[i] < best) { best = free[i]; k = i; }
    if (k >= 0) free[k] = dep + dur + FLEET.term;
    rows.push({ dep: dep, arr: dep + dur, dur: dur, bus: k + 1 });
  }
  var mean = rows.reduce(function (a, r) { return a + r.dur; }, 0) / (rows.length || 1), mx = 0, mn = 1e9;
  rows.forEach(function (r) { mx = Math.max(mx, r.dur); mn = Math.min(mn, r.dur); });
  return { rows: rows, mean: mean, max: mx, min: mn, cycle: mean + FLEET.term, need: Math.ceil((mx + FLEET.term) / FLEET.headway), lost: rows.filter(function (r) { return !r.bus; }).length, sig: 0 };
}
function refreshFleet() { TT = buildTimetable(); TT.sig = (TT.sig || 0) + 1; ttSig = ''; renderFlota(); }
var ttSig = '';
function mins(sec) { return Math.round(sec / 60); }
function renderFlota() {
  if (!TT || ST.tab !== 'flota') return;
  var cur = 0; while (cur < TT.rows.length && TT.rows[cur].arr <= SIM.T) cur++;
  var sig = [TT.need, TT.lost, FLEET.n, FLEET.headway, FLEET.term, cur].join('|');
  if (sig === ttSig) return; ttSig = sig;
  var ok = FLEET.n >= TT.need, perBus = Math.ceil(TT.cycle / FLEET.n);
  $('#fleetStats').innerHTML =
    '<div class="stat"><b class="num">' + mins(TT.mean) + '<small>min</small></b><span>de recorrido medio, de ' + mins(TT.min) + ' a ' + mins(TT.max) + ' según el tráfico</span></div>' +
    '<div class="stat"><b class="num">' + mins(TT.cycle) + '<small>min</small></b><span>por vuelta, con ' + mins(FLEET.term) + ' min de parada en la UDES</span></div>' +
    '<div class="stat"><b class="num">' + TT.need + '</b><span>buses para salir cada ' + mins(FLEET.headway) + ' min</span></div>' +
    '<div class="stat"><b class="num">' + TT.lost + '</b><span>salidas del día sin bus disponible</span></div>';
  $('#fleetMsg').className = 'callout' + (ok ? ' callout--ok' : '');
  $('#fleetMsg').innerHTML = ok
    ? '<b>La flota alcanza</b><span>' + FLEET.n + ' ' + (FLEET.n === 1 ? 'bus cubre' : 'buses cubren') + ' una salida cada ' + mins(FLEET.headway) + ' min.' + (FLEET.n > TT.need ? ' Sobran ' + (FLEET.n - TT.need) + '.' : '') + '</span>'
    : '<b>Faltan ' + (TT.need - FLEET.n) + ' ' + (TT.need - FLEET.n === 1 ? 'bus' : 'buses') + '</b><span>Con ' + FLEET.n + ' solo hay un bus libre cada ' + perBus + ' min. Se pierden ' + TT.lost + ' de ' + TT.rows.length + ' salidas.</span>';
  var html = TT.rows.map(function (r, i) {
    var state = r.arr <= SIM.T ? 'done' : r.dep <= SIM.T ? 'run' : i === cur ? 'next' : '';
    return '<li data-state="' + state + '"' + (r.bus ? '' : ' data-lost="true"') + '><span class="tt-bus">' + (r.bus ? 'Bus ' + r.bus : 'Sin bus') + '</span><span class="tt-time num">' + hhmm(r.dep) + ' → ' + hhmm(r.arr) + '</span><span class="tt-dur num">' + mins(r.dur) + ' min</span></li>';
  }).join('');
  var list = $('#timetable'); list.innerHTML = html;
  var now = list.querySelector('[data-state="run"], [data-state="next"]'); if (now) list.scrollTop = Math.max(0, now.offsetTop - 70);
}
function applyFleet() {
  FLEET.n = +$('#fN').value; FLEET.headway = +$('#fH').value * 60; FLEET.term = +$('#fT').value * 60; KBUS = +$('#fK').value; calibrar();
  $('#fNOut').textContent = FLEET.n; $('#fHOut').textContent = (FLEET.headway / 60) + ' min'; $('#fTOut').textContent = (FLEET.term / 60) + ' min'; $('#fKOut').textContent = KBUS + ' %';
  ['#fN', '#fH', '#fT', '#fK'].forEach(function (id) { paintRng($(id)); });
  clearTimeout(fdeb); fdeb = setTimeout(function () { rebuildFleet(SIM.T); refreshFleet(); updateLive(); }, 80);
}
var fdeb = null;
['#fN', '#fH', '#fT', '#fK'].forEach(function (id) { $(id).addEventListener('input', applyFleet); });
$('#saveFleet').addEventListener('click', function () {
  var msg = $('#fleetSave'); msg.textContent = 'Guardando…';
  opciones.guardarFlota({ vehiculos: FLEET.n, intervaloMin: FLEET.headway / 60, paradaCampusMin: FLEET.term / 60 })
    .then(function () { msg.textContent = 'Guardado en la ruta.'; }, function (e) { msg.textContent = 'No se pudo guardar: ' + (e && e.message ? e.message : 'error desconocido'); });
});

/* demanda */
var statsEl = $('#stats');
function renderStats(soft) {
  var cov = EV.covered / TOTAL_STU * 100, use = EV.users / TOTAL_STU * 100, trips = EV.users * 2, bph = EV.users * 2 * hourShare(SIM.T / 3600);
  var items = [
    ['n-cov', Math.round(cov), '%', 'de los estudiantes tiene una parada al alcance'],
    ['n-use', use, '%', 'usaría la ruta, según el modelo'],
    ['n-trips', Math.round(trips), '', 'viajes al día, ida y vuelta'],
    ['n-bph', bph, '', 'abordajes por hora a esta hora']
  ];
  if (!statsEl.children.length) {
    statsEl.innerHTML = items.map(function (it) { return '<div class="stat"><b class="num" id="' + it[0] + '"></b><span>' + it[3] + '</span></div>'; }).join('');
  }
  items.forEach(function (it) {
    var el = $('#' + it[0]); if (!el) return;
    var v = it[1], txt = (it[0] === 'n-use' || it[0] === 'n-bph') ? (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v))) : fmt(v);
    if (el.dataset.v === txt) return; el.dataset.v = txt;
    el.innerHTML = txt + (it[2] ? '<small>' + it[2] + '</small>' : '');
  });
  if (!soft) renderRank();
}
function renderRank() {
  var arr = []; for (var i = 0; i < MS.length; i++) arr.push([i, EV.board[i]]);
  arr.sort(function (a, b) { return b[1] - a[1]; }); var top = arr.slice(0, 7), mx = top[0] ? top[0][1] : 1;
  $('#rank').innerHTML = top.map(function (a) {
    var pu = EV.catch_[a[0]] ? Math.min(99, a[1] / EV.catch_[a[0]] * 100) : 0;
    return '<li data-i="' + a[0] + '"><span title="' + esc(MS[a[0]].name) + '">' + esc(MS[a[0]].name) + '</span><span class="bar"><i style="width:' + (a[1] / mx * 100) + '%"></i></span><em>' + Math.round(pu) + ' %</em></li>';
  }).join('');
  $$('#rank li').forEach(function (li) { li.addEventListener('click', function () { selectStop(+li.dataset.i, true); }); });
}

/* candidatas */
var CAND = (function () {
  var seen = {}, out = [];
  ROADS.forEach(function (w) {
    if (w.c < 2) return;
    for (var i = 0; i < w.n; i += 3) {
      var lx = w.lm[2 * i], ly = w.lm[2 * i + 1], k = Math.floor(lx / 110) + '_' + Math.floor(ly / 110);
      if (seen[k]) continue; seen[k] = 1;
      var best = 1e18; for (var j = 0; j < RS.N; j += 4) { var d = (RS.LX[j] - lx) * (RS.LX[j] - lx) + (RS.LY[j] - ly) * (RS.LY[j] - ly); if (d < best) best = d; }
      var dist = Math.sqrt(best); if (dist > 1200) continue;
      var ll = fromLocal(lx, ly), m = merc(ll[0], ll[1]); out.push({ lx: lx, ly: ly, x: m[0], y: m[1], d2r: dist });
    }
  });
  return out;
})();
var PICKS = [];
function suggest() {
  var r = P.radius, list = allStops(), remaining = CELLS.filter(function (c) { return !c.cov; }), picks = [], base = evaluate(list, r, P.prop, false), cur = list.slice();
  for (var k = 0; k < 3; k++) {
    var best = null, bg = 0;
    for (var ci = 0; ci < CAND.length; ci++) {
      var c = CAND[ci], bad = false, q;
      for (q = 0; q < cur.length; q++) if (Math.hypot(cur[q].lx - c.lx, cur[q].ly - c.ly) < 260) { bad = true; break; }
      if (bad) continue;
      for (q = 0; q < picks.length; q++) if (Math.hypot(picks[q].lx - c.lx, picks[q].ly - c.ly) < 380) { bad = true; break; }
      if (bad) continue;
      var gsum = 0; for (q = 0; q < remaining.length; q++) if (Math.hypot(remaining[q].lx - c.lx, remaining[q].ly - c.ly) <= r) gsum += remaining[q].n;
      if (gsum > bg) { bg = gsum; best = c; }
    }
    if (!best || bg < 25) break;
    var pick = { lx: best.lx, ly: best.ly, x: best.x, y: best.y, d2r: best.d2r, gain: bg, name: null, wait: 0, terminal: false, appear: 1 };
    var ev = evaluate(cur.concat(pick), r, P.prop, false);
    pick.dTrips = (ev.users - base.users) * 2; pick.dCov = (ev.covered - base.covered) / TOTAL_STU * 100;
    base = ev; cur = cur.concat(pick); picks.push(pick);
    remaining = remaining.filter(function (c2) { return Math.hypot(c2.lx - pick.lx, c2.ly - pick.ly) > r; });
  }
  PICKS = picks;
}
function renderNueva() {
  var unc = CELLS.filter(function (c) { return !c.cov; }), uncN = unc.reduce(function (a, c) { return a + c.n; }, 0);
  $('#gapStats').innerHTML = '<div class="stat"><b class="num">' + fmt(uncN) + '</b><span>estudiantes sin parada al alcance</span></div><div class="stat"><b class="num">' + (100 - EV.covered / TOTAL_STU * 100).toFixed(0) + '<small>%</small></b><span>del total queda sin cobertura</span></div>';
  var host = $('#cands'), html = '';
  EXTRAS.forEach(function (e, i) {
    html += '<div class="cand" data-on="true"><header><h3>Parada nueva ' + (i + 1) + '</h3><button class="btn" type="button" data-rm="' + i + '">Quitar</button></header><dl><div><dt>Desvío</dt><dd>' + fmt(e.d2r * 2) + ' m</dd></div><div><dt>Cubre</dt><dd>' + fmt(e.gain) + '</dd></div><div><dt>Estado</dt><dd>En el modelo</dd></div></dl></div>';
  });
  PICKS.forEach(function (p, i) {
    var mins = Math.round((p.d2r * 2 / 6.5 + 25) / 60);
    html += '<div class="cand" data-on="false"><header><h3>Candidata ' + (i + 1) + '</h3><span class="gain">+' + p.dCov.toFixed(1).replace('.', ',') + ' pts</span></header><dl><div><dt>Cubriría</dt><dd>' + fmt(p.gain) + ' est.</dd></div><div><dt>Viajes al día</dt><dd>+' + fmt(p.dTrips) + '</dd></div><div><dt>Desvío</dt><dd>' + fmt(p.d2r * 2) + ' m · ' + mins + ' min</dd></div></dl><div style="display:flex;gap:8px"><button class="btn btn--pri" type="button" data-add="' + i + '">Añadir al modelo</button><button class="btn" type="button" data-see="' + i + '">Ver en el mapa</button></div></div>';
  });
  if (!html) html = '<div class="empty">Con este radio no quedan zonas relevantes sin cobertura.</div>';
  host.innerHTML = html;
  $$('[data-add]', host).forEach(function (b) { b.addEventListener('click', function () { addExtra(PICKS[+b.dataset.add]); }); });
  $$('[data-rm]', host).forEach(function (b) { b.addEventListener('click', function () { EXTRAS.splice(+b.dataset.rm, 1); refreshAll(); }); });
  $$('[data-see]', host).forEach(function (b) { b.addEventListener('click', function () { var p = PICKS[+b.dataset.see]; flyTo(p.x, p.y, 15.6); showGhost(p); }); });
  if (HAS_GSAP && !RM) gsap.from('#cands .cand', { opacity: 0, y: 8, duration: 0.35, stagger: 0.05, ease: 'power3.out', clearProps: 'all' });
}
var ghost = null;
function showGhost(p) { ghost = p; }
function addExtra(p) {
  var e = { lx: p.lx, ly: p.ly, x: p.x, y: p.y, d2r: p.d2r, gain: p.gain, name: null, wait: 0, terminal: false, appear: RM ? 1 : 0 };
  EXTRAS.push(e);
  if (HAS_GSAP && !RM) gsap.to(e, { appear: 1, duration: 0.6, ease: 'back.out(2)' });
  LAYERS.cobertura = true; syncLayers(); refreshAll();
}
function refreshAll() { recalc(); suggest(); renderStats(false); renderNueva(); renderRank(); refreshFleet(); updateLive(); }

/* ---------- reloj del día ---------- */
var chart = $('#chart'), tRange = $('#tRange');
function drawChart() {
  var Wd = 600, Hd = 62, pad = 2, x = function (m) { return (m / 60 - 5) / 17 * Wd; }, yy = function (v) { return Hd - 14 - v * (Hd - 24); };
  var d = '', t = '', i;
  for (i = 0; i <= 170; i++) { var h = 5 + i * 0.1; d += (i ? 'L' : 'M') + (x(h * 60)).toFixed(1) + ' ' + yy(demandH(h) / H_MAX).toFixed(1); t += (i ? 'L' : 'M') + (x(h * 60)).toFixed(1) + ' ' + yy(trafficH(h) * 0.55).toFixed(1); }
  var ticks = '';
  [6, 9, 12, 15, 18, 21].forEach(function (h) { ticks += '<text x="' + x(h * 60).toFixed(1) + '" y="' + (Hd - 1) + '" text-anchor="middle" font-size="10" font-weight="600" fill="var(--ink-3)" font-family="Manrope,sans-serif">' + h + ':00</text><line x1="' + x(h * 60).toFixed(1) + '" x2="' + x(h * 60).toFixed(1) + '" y1="' + (Hd - 13) + '" y2="' + (Hd - 10) + '" stroke="var(--line-2)"/>'; });
  chart.innerHTML = '<defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--flow)" stop-opacity=".42"/><stop offset="1" stop-color="var(--flow)" stop-opacity=".03"/></linearGradient></defs>' +
    '<line x1="0" x2="' + Wd + '" y1="' + (Hd - 14) + '" y2="' + (Hd - 14) + '" stroke="var(--line-2)"/>' +
    '<path d="' + d + 'L' + Wd + ' ' + (Hd - 14) + 'L0 ' + (Hd - 14) + 'Z" fill="url(#gf)"/><path d="' + d + '" fill="none" stroke="var(--flow)" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
    '<path d="' + t + '" fill="none" stroke="var(--gap)" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>' + ticks +
    '<g id="head"><line id="hl" x1="0" x2="0" y1="2" y2="' + (Hd - 14) + '" stroke="var(--ink)" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle id="hc" cx="0" cy="' + (Hd - 14) + '" r="5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/></g>';
}
function moveHead(min) {
  var hl = $('#hl'), hc = $('#hc'); if (!hl) return; var xx = ((min / 60 - 5) / 17 * 600).toFixed(1);
  hl.setAttribute('x1', xx); hl.setAttribute('x2', xx); hc.setAttribute('cx', xx); tRange.value = Math.round(min);
}
function setTime(min) { SIM.T = clamp(min, 300, 1320) * 60; resetFlow(); rebuildFleet(SIM.T); updateLive(); }
tRange.addEventListener('input', function () { setTime(+tRange.value); });
(function () {
  var wrap = $('#chartWrap'), on = false;
  function at(e) { var r = wrap.getBoundingClientRect(); setTime(300 + clamp((e.clientX - r.left) / r.width, 0, 1) * 1020); }
  wrap.addEventListener('pointerdown', function (e) { on = true; wrap.setPointerCapture(e.pointerId); at(e); });
  wrap.addEventListener('pointermove', function (e) { if (on) at(e); });
  wrap.addEventListener('pointerup', function () { on = false; });
})();

/* ---------- controles ---------- */
var playBtn = $('#play');
var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>';
var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/></svg>';
function syncPlay() { playBtn.innerHTML = SIM.playing ? ICON_PAUSE : ICON_PLAY; playBtn.setAttribute('aria-label', SIM.playing ? 'Pausar la simulación' : 'Reanudar la simulación'); }
playBtn.addEventListener('click', function () { SIM.playing = !SIM.playing; syncPlay(); });
$$('.speed button').forEach(function (b) { b.addEventListener('click', function () { SIM.speed = +b.dataset.speed; $$('.speed button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
function syncLayers() { $$('[data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', String(!!LAYERS[b.dataset.layer])); }); }
$$('[data-layer]').forEach(function (b) { b.addEventListener('click', function () { LAYERS[b.dataset.layer] = !LAYERS[b.dataset.layer]; syncLayers(); }); });
function syncFollow() { $('#follow').setAttribute('aria-pressed', String(ST.follow)); }
$('#follow').addEventListener('click', function () { ST.follow = !ST.follow; if (HAS_GSAP) gsap.killTweensOf(view); syncFollow(); });
$('#zin').addEventListener('click', function () { zoomAt(W / 2, H / 2, view.z + 0.8); });
$('#zout').addEventListener('click', function () { zoomAt(W / 2, H / 2, view.z - 0.8); });
$('#fit').addEventListener('click', function () { ST.follow = false; syncFollow(); fitView(true); });

var rad = $('#rad'), prop = $('#prop');
function paintRng(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
var deb = null;
function onParams() {
  P.radius = +rad.value; P.prop = +prop.value / 100; $('#radOut').textContent = P.radius + ' m'; $('#propOut').textContent = prop.value + ' %'; paintRng(rad); paintRng(prop);
  clearTimeout(deb); deb = setTimeout(function () { PICKS = []; refreshAll(); }, 60);
  recalc(); renderStats(true);
}
rad.addEventListener('input', onParams); prop.addEventListener('input', onParams);
$('#saveProp').addEventListener('click', function () {
  var msg = $('#saveMsg');
  if (!EXTRAS.length) { msg.textContent = 'Añada al menos una parada candidata al modelo.'; return; }
  var base = evaluate(MS, P.radius, P.prop, false), now = EV;
  msg.textContent = 'Guardando…';
  opciones.guardarPropuesta({ params: { radio_m: P.radius, disposicion: P.prop, ilustrativo: ILU }, stops: EXTRAS.map(function (e) { var ll = fromLocal(e.lx, e.ly); return { lon: +ll[0].toFixed(5), lat: +ll[1].toFixed(5), desvio_m: Math.round(e.d2r * 2), estudiantes: e.gain }; }), coverage_gain: +((now.covered - base.covered) / TOTAL_STU * 100).toFixed(2), trips_gain: Math.round((now.users - base.users) * 2) })
    .then(function () { msg.textContent = 'Propuesta guardada.'; }, function (e) { msg.textContent = 'No se pudo guardar: ' + (e && e.message ? e.message : 'error desconocido'); });
});
$('#resetExtras').addEventListener('click', function () { EXTRAS.length = 0; ghost = null; refreshAll(); });

/* pestañas */
var tabs = $$('.tab'), ind = $('#tabInd');
function moveInd(animate) {
  var cur = $('.tab[aria-selected="true"]'), nav = $('#tabs'); if (!cur) return;
  var x = cur.offsetLeft + 8, w = cur.offsetWidth - 16;
  if (animate && HAS_GSAP && !RM) gsap.to(ind, { x: x, width: w, duration: 0.28, ease: 'power4.out' }); else { ind.style.transform = 'translateX(' + x + 'px)'; ind.style.width = w + 'px'; if (HAS_GSAP) gsap.set(ind, { x: x, width: w }); }
}
function openTab(name, focus) {
  if (name === ST.tab) return;
  var from = $('#p-' + ST.tab), to = $('#p-' + name);
  ST.tab = name;
  tabs.forEach(function (t) { var on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  moveInd(true);
  function show() {
    from.hidden = true; to.hidden = false; $('#panels').scrollTop = 0;
    if (name === 'demanda') renderStats(false); if (name === 'nueva') renderNueva(); if (name === 'flota') { ttSig = ''; renderFlota(); }
    if (HAS_GSAP && !RM) gsap.fromTo(to, { opacity: 0, y: 8, filter: 'blur(3px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.22, ease: 'power3.out', clearProps: 'filter,transform,opacity' });
  }
  if (HAS_GSAP && !RM) gsap.to(from, { opacity: 0, duration: 0.08, ease: 'power1.in', onComplete: function () { gsap.set(from, { clearProps: 'opacity' }); show(); } }); else show();
  LAYERS.cobertura = name === 'demanda' || name === 'nueva' ? true : LAYERS.cobertura; syncLayers();
}
tabs.forEach(function (t) {
  t.addEventListener('click', function () { openTab(t.dataset.tab); });
  t.addEventListener('keydown', function (e) { var i = tabs.indexOf(t), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1; if (n >= 0) { e.preventDefault(); openTab(tabs[(n + tabs.length) % tabs.length].dataset.tab, true); } });
});

/* Pilo (vista previa con las cifras del mapa) */
var QA = [
  { q: '¿Qué parada se usa más ahora?', k: /usa.*m[aá]s|m[aá]s usad|concurrid|abord/i, f: function () {
    var best = 0, i; for (i = 1; i < MS.length; i++) if (EV.board[i] > EV.board[best]) best = i;
    var b = EV.board[best] * 2 * hourShare(SIM.T / 3600); return 'A las ' + clockStr() + ' la parada más usada es ' + MS[best].name + ', con unos ' + (b < 10 ? b.toFixed(1).replace('.', ',') : Math.round(b)) + ' abordajes por hora. Concentra el ' + Math.round(EV.board[best] / EV.users * 100) + ' % de quienes usarían la ruta.'; } },
  { q: '¿Cuántos estudiantes quedan sin parada?', k: /sin (parada|cobertura)|cobertura|descubiert/i, f: function () {
    var unc = CELLS.filter(function (c) { return !c.cov; }).reduce(function (a, c) { return a + c.n; }, 0);
    return 'Con ' + P.radius + ' m de caminata, ' + fmt(unc) + ' de ' + fmt(TOTAL_STU) + ' estudiantes (' + Math.round(unc / TOTAL_STU * 100) + ' %) no tienen una parada al alcance.' + (ILU ? ' Son datos ilustrativos.' : ''); } },
  { q: '¿Dónde conviene la próxima parada?', k: /pr[oó]xima|nueva|d[oó]nde conviene|agregar|a[ñn]adir/i, f: function () {
    if (!PICKS.length) return 'Con este radio no encuentro una zona sin cobertura que justifique una parada nueva.';
    var p = PICKS[0]; return 'La mejor candidata está a ' + fmt(p.d2r) + ' m de la ruta. Cubriría ' + fmt(p.gain) + ' estudiantes más (+' + p.dCov.toFixed(1).replace('.', ',') + ' puntos de cobertura) y sumaría unos ' + fmt(p.dTrips) + ' viajes al día. Está en la pestaña Nueva ruta.'; } },
  { q: '¿A qué hora se llena el bus?', k: /llena|ocupaci|pico|hora/i, f: function () {
    var pk = 5, mv = 0, h; for (h = 5; h <= 22; h += 0.1) { if (demandH(h) > mv) { mv = demandH(h); pk = h; } }
    var perH = EV.users * 2 * hourShare(pk), hh = Math.floor(pk), mm = Math.round((pk - hh) * 60);
    return 'El pico es hacia las ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ', con unos ' + Math.round(perH) + ' abordajes por hora en toda la ruta. Con ' + BUSES.length + ' buses de ' + BUSES[0].cap + ' puestos, ' + (perH > BUSES.length * BUSES[0].cap * 1.8 ? 'la ocupación se acerca al límite.' : 'hay holgura en ese momento.'); } }
];
function clockStr() { var h = SIM.T / 3600, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }
var ans = $('#ans');
function say(text) {
  ans.hidden = false; ans.innerHTML = text.split(' ').map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
  if (HAS_GSAP && !RM) gsap.from('#ans .w', { opacity: 0, duration: 0.2, stagger: 0.018, ease: 'power1.out', clearProps: 'opacity' });
}
$('#qchips').innerHTML = QA.map(function (a, i) { return '<button type="button" class="qchip" data-q="' + i + '">' + a.q + '</button>'; }).join('');
$$('.qchip').forEach(function (b) { b.addEventListener('click', function () { say(QA[+b.dataset.q].f()); }); });
$('#askForm').addEventListener('submit', function (e) {
  e.preventDefault(); var v = $('#askIn').value.trim(); if (!v) return;
  var hit = QA.filter(function (a) { return a.k.test(v); })[0];
  say(hit ? hit.f() : 'Por ahora entiendo cuatro preguntas: la parada más usada, los estudiantes sin cobertura, dónde poner la próxima parada y a qué hora se llena el bus.');
});

/* ---------- arranque ---------- */
readTheme(); resize(); recalc(); suggest(); rebuildFleet(SIM.T); buildLine(); drawChart(); syncPlay();
paintRng(rad); paintRng(prop);
renderStats(false); renderNueva(); TT = buildTimetable(); fitView(false); moveInd(false); updateLive();
$('#fN').value = FLEET.n; $('#fH').value = FLEET.headway / 60; $('#fT').value = FLEET.term / 60; $('#fK').value = KBUS; ['#fN', '#fH', '#fT', '#fK'].forEach(function (id) { paintRng($(id)); }); $('#fKOut').textContent = KBUS + ' %';
$('#fNOut').textContent = FLEET.n; $('#fHOut').textContent = (FLEET.headway / 60) + ' min'; $('#fTOut').textContent = (FLEET.term / 60) + ' min';
$('#badge').textContent = ILU ? 'Datos ilustrativos' : 'Datos reales · ' + fmt(CELLS.length) + ' celdas';
$('#badge').title = ILU ? 'Aún no hay estudiantes cargados en bus_origin_cells: el mapa usa una muestra inventada.' : 'Estudiantes agregados por celda; nunca direcciones.';
$('#dataState').innerHTML = ILU
  ? '<b>Estudiantes: muestra ilustrativa</b><span>La tabla bus_origin_cells está vacía. Para medir un flujo real hay que geocodificar la dirección completa de cada estudiante y cargar solo celdas agregadas (mínimo 5 por celda), nunca la dirección. El archivo direcciones.csv del prototipo no sirve: 374 de 376 filas caen en solo 3 coordenadas.</span>'
  : '<b>Estudiantes: ' + fmt(TOTAL_STU) + ' en ' + fmt(CELLS.length) + ' celdas</b><span>Datos agregados desde bus_origin_cells. No se guarda ninguna dirección.</span>';
var ro = new ResizeObserver(function () { var wasFit = !ST.introDone; resize(); if (wasFit) fitView(false); moveInd(false); }).observe(stage);
var onLoad = function () { moveInd(false); };
window.addEventListener('load', onLoad);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveInd(false); });

if (HAS_GSAP && !RM) {
  var fz = view.z, fcx = view.cx, fcy = view.cy;
  view.z = fz - 0.9; ST.reveal = 0; STOPS.forEach(function (s) { s.appear = 0; });
  var tl = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: function () { ST.introDone = true; } });
  tl.to(view, { z: fz, duration: 1.6 }, 0)
    .to(ST, { reveal: RT.total, duration: 2.2, ease: 'power2.inOut' }, 0.15)
    .to(STOPS, { appear: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: { each: 2.0 / NST, from: 'start' } }, 0.25)
    .from('#dockHead, #tabs, #p-ruta .board, #p-ruta > div:last-child, #pilo', { opacity: 0, y: 10, duration: 0.55, stagger: 0.07, clearProps: 'all' }, 0.1)
    .from('.layers .chip, .tools > *', { opacity: 0, y: -6, duration: 0.4, stagger: 0.04, clearProps: 'all' }, 0.2)
    .from('.clock', { opacity: 0, y: 14, duration: 0.5, clearProps: 'all' }, 0.35);
} else { ST.introDone = true; }

var tick = function (time) { frame(time * 1000); };
gsap.ticker.add(tick);
function destruir() { gsap.ticker.remove(tick); gsap.killTweensOf(view); gsap.killTweensOf(ST); gsap.killTweensOf(STOPS); ro.disconnect(); window.removeEventListener('load', onLoad); clearTimeout(deb); TILES.clear(); }
return destruir;
}
