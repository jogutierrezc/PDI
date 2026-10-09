/* =============================================================================
   Ruta del bus UDES · el mapa público.

   Dibuja en un lienzo la ruta, las paradas y los buses simulados, y maneja su
   propio panel: hoja inferior en el celular, dos paneles en pantallas amplias
   (Galaxy Z Fold desplegado, tabletas) y mapa arriba con panel abajo cuando el
   equipo está a medio plegar (Galaxy Z Flip). Se diseña por tamaño y relación
   de aspecto del contenedor, no por modelo; las API de pantallas plegables
   (segmentos de ventana, postura) solo mejoran, nunca son requisito.

   Privacidad: este archivo no sabe de estudiantes. Solo recibe ruta, paradas,
   trazado y horario (tiposPublico.ts). Los buses son una simulación según el
   horario publicado, no un GPS, y la pantalla lo dice.

   Nada se reinicia al plegar o cambiar de tamaño: el motor vive en un cierre
   que solo reacciona a ResizeObserver; la parada, la hoja, la cámara y la hora
   siguen donde estaban.
   ========================================================================== */

import { merc } from "./modelo";
import {
  DIA_S,
  aCampoHora,
  busesEnRuta,
  construirPerfil,
  estadoServicio,
  formatoEspera,
  formatoHora,
  horarioSeguro,
  proximasLlegadas,
  salidas,
  segundosDelDia,
} from "./horario";
import type { ApiPublico, DatosPublicos, EstadoPublico, Modo, OpcionesPublico, PuntoHoja } from "./tiposPublico";

const R2D = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const nb = " ";

const Z_MIN = 12.4;
const Z_MAX = 18.6;
const A0 = 7.103;
const L0 = -73.105;
const KX = 111320 * Math.cos(A0 * R2D);
const KY = 110574;
const toLocal = (lon: number, lat: number): [number, number] => [(lon - L0) * KX, (lat - A0) * KY];

interface Via {
  c: number;
  n: number;
  xy: Float64Array;
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}
interface Tesela {
  img: HTMLImageElement;
  ok: boolean;
}
interface ParadaMapa {
  i: number;
  numero: number | null;
  nombre: string;
  s: number;
  x: number;
  y: number;
  appear: number;
  terminal: boolean;
}

const ICONOS = {
  centrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>',
  jugar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
  menos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12h13"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/></svg>',
  bus: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="12.5" rx="3"/><path d="M4 11h16M8 20v-3M16 20v-3M8 14h.01M16 14h.01"/></svg>',
};

function esqueleto(op: OpcionesPublico, nombre: string): string {
  return `
<header class="rpub-cab">
  <a class="rpub-marca" href="${esc(op.inicioHref)}" data-inicio aria-label="Universidad de Santander, ir a la portada del portal">
    <img class="rpub-logo rpub-logo--claro" src="${esc(op.logoSrc)}" alt="" width="95" height="34" decoding="async" />
    <img class="rpub-logo rpub-logo--oscuro" src="${esc(op.logoOscuroSrc)}" alt="" width="89" height="34" decoding="async" />
  </a>
  <h1 class="rpub-titulo">${esc(nombre)}</h1>
</header>
<p class="rpub-aviso" role="note">${ICONOS.info}<span><strong>Simulación según el horario.</strong> No es la posición real de los buses.</span></p>
<div class="rpub-mapa">
  <canvas class="rpub-lienzo" role="img" aria-label="Mapa de la ruta del bus con sus paradas. La misma información está en la lista de paradas."></canvas>
  <a class="rpub-atrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© colaboradores de OpenStreetMap</a>
  <div class="rpub-ctl" role="group" aria-label="Controles del mapa">
    <button type="button" class="rpub-btn" data-ac="centrar" aria-label="Ver toda la ruta">${ICONOS.centrar}</button>
    <button type="button" class="rpub-btn" data-ac="jugar" aria-label="Pausar la simulación" aria-pressed="true">${ICONOS.pausa}</button>
    <button type="button" class="rpub-btn" data-ac="mas" aria-label="Acercar el mapa">${ICONOS.mas}</button>
    <button type="button" class="rpub-btn" data-ac="menos" aria-label="Alejar el mapa">${ICONOS.menos}</button>
  </div>
</div>
<section class="rpub-hoja" aria-label="Próximo bus, paradas y horario">
  <div class="rpub-arrastre">
    <button type="button" class="rpub-asa" aria-expanded="false" aria-label="Ampliar el panel"><span class="rpub-asa-barra" aria-hidden="true"></span></button>
    <div class="rpub-prox">
      <div class="rpub-prox-txt">
        <p class="rpub-prox-rotulo"></p>
        <p class="rpub-prox-hora num"></p>
        <p class="rpub-prox-sub"></p>
      </div>
      <button type="button" class="rpub-quitar" data-ac="quitar" hidden>Ver desde la UDES</button>
    </div>
  </div>
  <div class="rpub-resto">
    <div class="rpub-pestanas" role="tablist" aria-label="Contenido del panel">
      <button type="button" role="tab" id="rpub-t-paradas" aria-controls="rpub-p-paradas" aria-selected="true" data-pest="paradas">Paradas</button>
      <button type="button" role="tab" id="rpub-t-horario" aria-controls="rpub-p-horario" aria-selected="false" tabindex="-1" data-pest="horario">Horario</button>
    </div>
    <div class="rpub-cuerpo">
      <div role="tabpanel" id="rpub-p-paradas" aria-labelledby="rpub-t-paradas" class="rpub-panel">
        <ol class="rpub-lista"></ol>
      </div>
      <div role="tabpanel" id="rpub-p-horario" aria-labelledby="rpub-t-horario" class="rpub-panel" hidden>
        <dl class="rpub-datos"></dl>
        <div class="rpub-reloj">
          <p class="rpub-sub-t" id="rpub-reloj-t">Hora de la simulación</p>
          <div class="rpub-reloj-fila" role="group" aria-labelledby="rpub-reloj-t">
            <button type="button" class="rpub-chico" data-ac="menos15" aria-label="Quince minutos antes">−15${nb}min</button>
            <label class="rpub-hora-campo"><span class="sr">Hora</span><input type="time" class="rpub-hora" step="60" /></label>
            <button type="button" class="rpub-chico" data-ac="mas15" aria-label="Quince minutos después">+15${nb}min</button>
          </div>
          <div class="rpub-reloj-fila rpub-reloj-fila--2">
            <button type="button" class="rpub-chico rpub-chico--ahora" data-ac="ahora">Ahora</button>
            <button type="button" class="rpub-chico" data-ac="vel" aria-pressed="false">Rápido ×10</button>
          </div>
        </div>
        <p class="rpub-sub-t">Salidas desde la UDES</p>
        <ul class="rpub-salidas"></ul>
      </div>
      <footer class="rpub-pie"></footer>
    </div>
  </div>
</section>`;
}

export function montarPublico(root: HTMLElement, datos: DatosPublicos, op: OpcionesPublico): ApiPublico {
  const gsap = op.gsap;
  const doc = root.ownerDocument;
  const win = doc.defaultView as Window & typeof globalThis;
  const q = <T extends Element = HTMLElement>(s: string): T => root.querySelector(s) as T;
  const qa = <T extends Element = HTMLElement>(s: string): T[] => Array.from(root.querySelectorAll(s)) as T[];

  root.classList.add("rpub");
  root.innerHTML = esqueleto(op, datos.ruta.nombre);

  const cv = q<HTMLCanvasElement>(".rpub-lienzo");
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const mapaEl = q(".rpub-mapa");
  const hojaEl = q(".rpub-hoja");
  const arrastreEl = q(".rpub-arrastre");
  const asaEl = q<HTMLButtonElement>(".rpub-asa");
  const restoEl = q(".rpub-resto");

  const mqRM = win.matchMedia("(prefers-reduced-motion: reduce)");
  let RM = mqRM.matches;
  const mqSeg = win.matchMedia("(vertical-viewport-segments: 2)");
  const mqPostura = win.matchMedia("(device-posture: folded)");
  const mqOscuro = win.matchMedia("(prefers-color-scheme: dark)");

  /* ------------------------------------------------------------------ datos */
  const horario = horarioSeguro(datos.ruta.horario);
  const perfil = construirPerfil(datos.ruta.legs, datos.ruta.duracionS);
  const SALIDAS = salidas(horario);

  const VIAS: Via[] = datos.vias.map((r) => {
    const c = r[0];
    const f = r[1];
    const n = f.length / 2;
    const xy = new Float64Array(n * 2);
    let x = f[0];
    let y = f[1];
    let minx = 9;
    let miny = 9;
    let maxx = -9;
    let maxy = -9;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        x += f[2 * i];
        y += f[2 * i + 1];
      }
      const m = merc(x / 1e5, y / 1e5);
      xy[2 * i] = m[0];
      xy[2 * i + 1] = m[1];
      if (m[0] < minx) minx = m[0];
      if (m[0] > maxx) maxx = m[0];
      if (m[1] < miny) miny = m[1];
      if (m[1] > maxy) maxy = m[1];
    }
    return { c, n, xy, minx, maxx, miny, maxy };
  });
  const POR_CLASE: Via[][] = [[], [], [], [], []];
  VIAS.forEach((w) => POR_CLASE[clamp(w.c, 0, 4)].push(w));

  // El trazado, remuestreado cada 5 m para colocar buses y flechas.
  const co = datos.ruta.coords;
  const RN = co.length;
  const mx: number[] = [];
  const my: number[] = [];
  const cum: number[] = [0];
  for (let i = 0; i < RN; i++) {
    const m = merc(co[i][0], co[i][1]);
    mx.push(m[0]);
    my.push(m[1]);
    if (i > 0) {
      const a = toLocal(co[i - 1][0], co[i - 1][1]);
      const b = toLocal(co[i][0], co[i][1]);
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }
  const TOTAL = cum[RN - 1] || 1;
  const PASO = 5;
  const NS = Math.floor(TOTAL / PASO) + 1;
  const SX_ = new Float64Array(NS);
  const SY_ = new Float64Array(NS);
  {
    let j = 0;
    for (let i = 0; i < NS; i++) {
      const s = i * PASO;
      while (j < RN - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const u = clamp((s - cum[j]) / seg, 0, 1);
      SX_[i] = mx[j] + (mx[j + 1] - mx[j]) * u;
      SY_[i] = my[j] + (my[j + 1] - my[j]) * u;
    }
  }
  const posEn = (s: number): [number, number] => {
    const f = clamp(s, 0, TOTAL) / PASO;
    const i = Math.min(NS - 2, Math.floor(f));
    const u = f - i;
    return [SX_[i] + (SX_[i + 1] - SX_[i]) * u, SY_[i] + (SY_[i + 1] - SY_[i]) * u];
  };
  const rumboEn = (s: number): number => {
    const a = posEn(s - 9);
    const b = posEn(s + 9);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };

  const NPAR = datos.ruta.stops.length;
  const PARADAS: ParadaMapa[] = datos.ruta.stops.map((p, i) => {
    const s = perfil.frac[i] * TOTAL;
    const [x, y] = posEn(s);
    const terminal = i === 0 || i === NPAR - 1;
    return { i, numero: terminal ? null : i, nombre: p.name, s, x, y, appear: 1, terminal };
  });
  // La última parada es la misma UDES: el recorrido es circular.
  const VISIBLES = PARADAS.slice(0, NPAR - 1);
  const NOMBRE_UDES = "UDES";

  /* ----------------------------------------------------------------- estado */
  const view = { cx: 0, cy: 0, z: 14 };
  const ST = {
    sel: null as number | null,
    reveal: 0,
    busAlpha: 0,
    hoja: "asomada" as PuntoHoja,
    pestana: "paradas" as "paradas" | "horario",
    modo: "hoja" as Modo,
    modoForzado: null as Modo | null,
    tocoMapa: false,
    entrada: true,
  };
  const reloj = { base: segundosDelDia(Date.now()), ancla: performance.now(), juega: !RM, vel: 1, vivo: true };
  const nowT = (): number => {
    if (!reloj.juega) return reloj.base;
    if (reloj.vivo && reloj.vel === 1) return segundosDelDia(Date.now());
    return reloj.base + ((performance.now() - reloj.ancla) / 1000) * reloj.vel;
  };
  const diaT = (t: number) => ((t % DIA_S) + DIA_S) % DIA_S;
  if (!reloj.juega) reloj.vivo = false;

  let W = 1;
  let H = 1;
  let DPR = 1;
  let pintar = true;
  let raf = 0;
  let temporizador = 0;
  let ultimoTexto = 0;
  let visibleEnPantalla = true;
  let destruido = false;
  const T: Record<string, string> = {};
  let oscuro = false;

  /* ------------------------------------------------------------------- tema */
  function temaActual(): boolean {
    const t = doc.documentElement.getAttribute("data-theme");
    if (t === "dark") return true;
    if (t === "light") return false;
    return mqOscuro.matches;
  }
  function leerTema() {
    oscuro = temaActual();
    root.setAttribute("data-tema", oscuro ? "oscuro" : "claro");
    const cs = win.getComputedStyle(mapaEl);
    for (const k of ["suelo", "via", "via-borde", "menor", "menor-borde", "ruta", "ruta-borde", "bus", "bus-vidrio", "parada", "parada-borde", "tinta", "halo", "senal", "velo"]) {
      T[k] = cs.getPropertyValue("--m-" + k).trim() || "#888";
    }
    pedir();
  }

  /* ----------------------------------------------------------------- cámara */
  const ws = () => 256 * Math.pow(2, view.z);
  const sx = (nx: number) => (nx - view.cx) * ws() + W / 2;
  const sy = (ny: number) => (ny - view.cy) * ws() + H / 2;

  let bbox = { minx: 9, miny: 9, maxx: -9, maxy: -9 };
  for (let i = 0; i < RN; i++) {
    bbox = { minx: Math.min(bbox.minx, mx[i]), maxx: Math.max(bbox.maxx, mx[i]), miny: Math.min(bbox.miny, my[i]), maxy: Math.max(bbox.maxy, my[i]) };
  }

  /** Cuánto del mapa tapa la hoja inferior cuando está en reposo, para centrar lo importante en lo que se ve. */
  function tapado(): number {
    if (ST.modo !== "hoja") return 0;
    const alto = hojaMedidas.visible[ST.hoja === "abierta" ? "media" : ST.hoja];
    return Math.min(alto, H * 0.62);
  }
  function encuadre(): { cx: number; cy: number; z: number } {
    const padX = 28;
    const padT = 56;
    const padB = tapado() + 36;
    const libreH = Math.max(80, H - padT - padB);
    const z = clamp(Math.log2(Math.min((W - padX * 2) / ((bbox.maxx - bbox.minx) * 256), libreH / ((bbox.maxy - bbox.miny) * 256))), 12, 17);
    const w2 = 256 * Math.pow(2, z);
    const centroY = padT + libreH / 2;
    return { cx: (bbox.minx + bbox.maxx) / 2, cy: (bbox.miny + bbox.maxy) / 2 + (H / 2 - centroY) / w2, z };
  }
  function ajustar(animar: boolean) {
    const e = encuadre();
    ST.tocoMapa = false;
    if (animar && !RM) {
      gsap.to(view, { ...e, duration: 0.7, ease: "power4.out", overwrite: true, onUpdate: pedir });
    } else {
      gsap.killTweensOf(view);
      Object.assign(view, e);
      pedir();
    }
  }
  function volarA(nx: number, ny: number, z: number) {
    ST.tocoMapa = true;
    const libreC = (H - tapado()) / 2;
    const w2 = 256 * Math.pow(2, z);
    const dest = { cx: nx, cy: ny + (H / 2 - libreC) / w2, z };
    if (RM) {
      gsap.killTweensOf(view);
      Object.assign(view, dest);
      pedir();
    } else {
      gsap.to(view, { ...dest, duration: 0.75, ease: "power4.out", overwrite: true, onUpdate: pedir });
    }
  }
  function acotar() {
    view.z = clamp(view.z, Z_MIN, Z_MAX);
    const m = 0.02;
    view.cx = clamp(view.cx, bbox.minx - m, bbox.maxx + m);
    view.cy = clamp(view.cy, bbox.miny - m, bbox.maxy + m);
  }
  function zoomEn(px: number, py: number, nz: number) {
    const z2 = clamp(nz, Z_MIN, Z_MAX);
    const wx = view.cx + (px - W / 2) / ws();
    const wy = view.cy + (py - H / 2) / ws();
    view.z = z2;
    view.cx = wx - (px - W / 2) / ws();
    view.cy = wy - (py - H / 2) / ws();
    acotar();
    ST.tocoMapa = true;
    pedir();
  }

  /* ----------------------------------------------------------------- teselas */
  const TESELAS = new Map<string, Tesela>();
  let faltan = 0;
  let tOk = 0;
  let tMal = 0;
  function tesela(z: number, x: number, y: number): Tesela {
    const k = `${z}/${x}/${y}`;
    let t = TESELAS.get(k);
    if (!t) {
      const img = new Image();
      const nueva: Tesela = { img, ok: false };
      t = nueva;
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        nueva.ok = true;
        tOk++;
        pedir();
      };
      img.onerror = () => {
        tMal++;
      };
      img.src = `https://tile.openstreetmap.org/${k}.png`;
      TESELAS.set(k, nueva);
      if (TESELAS.size > 420) {
        const primera = TESELAS.keys().next().value;
        if (primera !== undefined) TESELAS.delete(primera);
      }
    }
    return t;
  }
  function dibujarTeselas() {
    faltan = 0;
    const zt = clamp(Math.round(view.z), 12, 19);
    const n = Math.pow(2, zt);
    const w2 = ws();
    const sz = w2 / n;
    const x0 = Math.floor((view.cx - W / 2 / w2) * n);
    const x1 = Math.floor((view.cx + W / 2 / w2) * n);
    const y0 = Math.floor((view.cy - H / 2 / w2) * n);
    const y1 = Math.floor((view.cy + H / 2 / w2) * n);
    for (let ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(n - 1, x1); tx++) {
        const t = tesela(zt, tx, ty);
        const px = sx(tx / n);
        const py = sy(ty / n);
        if (t.ok) {
          ctx.drawImage(t.img, px, py, sz + 0.6, sz + 0.6);
          continue;
        }
        faltan++;
        const par = TESELAS.get(`${zt - 1}/${tx >> 1}/${ty >> 1}`);
        if (par && par.ok) ctx.drawImage(par.img, (tx & 1) * 128, (ty & 1) * 128, 128, 128, px, py, sz + 0.6, sz + 0.6);
      }
    }
    // Un velo deja respirar la ruta sobre el mapa (y oscurece las teselas en el tema oscuro).
    ctx.fillStyle = T.velo;
    ctx.fillRect(0, 0, W, H);
  }

  const ANCHO_VIA = [3.6, 3.0, 2.4, 1.8, 1.0];
  function dibujarVias() {
    const sc = Math.pow(2, (view.z - 14) * 0.62);
    const w2 = ws();
    const x0 = view.cx - W / 2 / w2 - 0.002;
    const x1 = view.cx + W / 2 / w2 + 0.002;
    const y0 = view.cy - H / 2 / w2 - 0.002;
    const y1 = view.cy + H / 2 / w2 + 0.002;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let pasada = 0; pasada < 2; pasada++) {
      for (let c = 4; c >= 0; c--) {
        if (c === 4 && view.z < 13.4) continue;
        ctx.beginPath();
        for (const w of POR_CLASE[c]) {
          if (w.maxx < x0 || w.minx > x1 || w.maxy < y0 || w.miny > y1) continue;
          ctx.moveTo(sx(w.xy[0]), sy(w.xy[1]));
          for (let i = 1; i < w.n; i++) ctx.lineTo(sx(w.xy[2 * i]), sy(w.xy[2 * i + 1]));
        }
        const base = Math.max(0.7, ANCHO_VIA[c] * sc);
        const menor = c >= 3;
        if (pasada === 0) {
          ctx.strokeStyle = menor ? T["menor-borde"] : T["via-borde"];
          ctx.lineWidth = base + (oscuro ? 0.6 : 1.8);
        } else {
          ctx.strokeStyle = menor ? T.menor : T.via;
          ctx.lineWidth = base;
        }
        ctx.stroke();
      }
    }
  }

  /* ----------------------------------------------------------------- dibujo */
  function trazoRuta(hasta: number) {
    ctx.beginPath();
    ctx.moveTo(sx(mx[0]), sy(my[0]));
    for (let i = 1; i < RN; i++) {
      if (cum[i] > hasta) {
        const u = (hasta - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        ctx.lineTo(sx(mx[i - 1] + (mx[i] - mx[i - 1]) * u), sy(my[i - 1] + (my[i] - my[i - 1]) * u));
        return;
      }
      ctx.lineTo(sx(mx[i]), sy(my[i]));
    }
  }
  const escala = () => clamp(Math.pow(2, (view.z - 15) * 0.32), 0.72, 1.45);
  function dibujarRuta() {
    const hasta = ST.reveal * TOTAL;
    if (hasta <= 0) return;
    const k = escala();
    trazoRuta(hasta);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 9 * k;
    ctx.strokeStyle = T["ruta-borde"];
    ctx.stroke();
    trazoRuta(hasta);
    ctx.lineWidth = 5 * k;
    ctx.strokeStyle = T.ruta;
    ctx.stroke();
    // Flechas de sentido: la dirección no depende del color.
    if (view.z >= 14.6) {
      ctx.fillStyle = "#ffffff";
      for (let s = 260; s < Math.min(hasta, TOTAL - 120); s += 480) {
        const p = posEn(s);
        const x = sx(p[0]);
        const y = sy(p[1]);
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rumboEn(s));
        ctx.beginPath();
        ctx.moveTo(4 * k, 0);
        ctx.lineTo(-2.6 * k, 3.2 * k);
        ctx.lineTo(-1 * k, 0);
        ctx.lineTo(-2.6 * k, -3.2 * k);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
  function rr(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function rotulo(x: number, y: number, texto: string, fuerte: boolean) {
    ctx.font = `${fuerte ? 700 : 600} ${fuerte ? 13 : 11.5}px "Open Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = T.halo;
    ctx.strokeText(texto, x, y);
    ctx.fillStyle = T.tinta;
    ctx.fillText(texto, x, y);
  }
  function dibujarParadas(t: number) {
    const k = escala();
    const mostrarNombres = view.z >= 16.1;
    for (const s of VISIBLES) {
      const x = sx(s.x);
      const y = sy(s.y);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const a = s.appear;
      if (a <= 0.01) continue;
      const sel = ST.sel === s.i;
      const r = (s.terminal ? 11.5 : sel ? 11.5 : 9.2) * k * (0.5 + 0.5 * a);
      ctx.globalAlpha = clamp(a * 1.4, 0, 1);
      if (sel) {
        const pr = RM ? 0 : (t * 0.9) % 1;
        ctx.strokeStyle = T.ruta;
        ctx.globalAlpha = (RM ? 0.45 : 0.55 * (1 - pr)) * clamp(a * 1.4, 0, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 5 + (RM ? 4 : pr * 14), 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = clamp(a * 1.4, 0, 1);
      }
      ctx.fillStyle = sel || s.terminal ? T["parada-borde"] : T.parada;
      ctx.strokeStyle = sel || s.terminal ? T.parada : T["parada-borde"];
      ctx.lineWidth = 3 * k;
      if (s.terminal) {
        // La UDES es un cuadrado redondeado: se distingue por la forma, no por el color.
        rr(x - r, y - r, r * 2, r * 2, r * 0.38);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = T.parada;
        ctx.font = `800 ${Math.round(10 * k + 2)}px "Open Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("U", x, y + 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        if (view.z >= 14.9 || sel) {
          ctx.fillStyle = sel ? T.parada : T["parada-borde"];
          ctx.font = `700 ${Math.round(9.5 * k + 1)}px "Open Sans", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(s.numero), x, y + 0.5);
        }
      }
      ctx.globalAlpha = 1;
      if (mostrarNombres || sel) rotulo(x, y + r + 5, s.terminal ? `${NOMBRE_UDES}` : s.nombre, sel);
      else if (s.terminal && view.z >= 13) rotulo(x, y + r + 5, NOMBRE_UDES, true);
    }
    ctx.globalAlpha = 1;
  }

  const rumbos = new Map<number, number>();
  function dibujarBuses(t: number, dt: number, buses: ReturnType<typeof busesEnRuta>) {
    if (ST.busAlpha <= 0.01) return;
    const k = escala();
    const L = 21 * k;
    const Wd = 9.6 * k;
    const vivos = new Set<number>();
    for (const b of buses) {
      vivos.add(b.salio);
      const s = b.frac * TOTAL;
      const p = posEn(s);
      const objetivo = rumboEn(s);
      let h = rumbos.get(b.salio);
      if (h === undefined || dt > 0.5) h = objetivo;
      else {
        let d = objetivo - h;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        h += d * Math.min(1, dt * 9);
      }
      rumbos.set(b.salio, h);
      const x = sx(p[0]);
      const y = sy(p[1]);
      if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
      // Por el carril derecho de la calle.
      const off = Wd * 0.5;
      ctx.save();
      ctx.globalAlpha = ST.busAlpha;
      ctx.translate(x - Math.sin(h) * off, y + Math.cos(h) * off);
      ctx.rotate(h);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      rr(-L / 2 + 1, -Wd / 2 + 1.8, L, Wd, Wd * 0.3);
      ctx.fill();
      rr(-L / 2, -Wd / 2, L, Wd, Wd * 0.3);
      ctx.fillStyle = T.bus;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = T.halo;
      ctx.stroke();
      ctx.fillStyle = T["bus-vidrio"];
      for (let i = 0; i < 4; i++) ctx.fillRect(-L / 2 + L * (0.1 + i * 0.17), -Wd * 0.28, L * 0.11, Wd * 0.56);
      ctx.fillRect(L / 2 - L * 0.2, -Wd * 0.34, L * 0.13, Wd * 0.68);
      ctx.fillStyle = T.senal;
      ctx.fillRect(-L / 2 + L * 0.04, -Wd * 0.04, L * 0.92, Wd * 0.1);
      if (b.estado === "parada" && !RM && Math.floor(t * 2.5) % 2 === 0) {
        ctx.fillStyle = T.senal;
        ctx.beginPath();
        ctx.arc(L / 2 - 1, -Wd / 2, 1.6, 0, 6.2832);
        ctx.arc(L / 2 - 1, Wd / 2, 1.6, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const id of rumbos.keys()) if (!vivos.has(id)) rumbos.delete(id);
  }

  let tPrev = 0;
  function dibujar(ms: number) {
    const t = ms / 1000;
    const dt = Math.min(1, t - tPrev || 0.016);
    tPrev = t;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = T.suelo;
    ctx.fillRect(0, 0, W, H);
    const usaTeselas = op.teselas && !(tMal >= 8 && tOk === 0);
    // Las calles vectoriales van debajo: si una tesela no llega, el mapa no queda en blanco.
    if (!usaTeselas || faltan > 0 || tOk === 0) dibujarVias();
    if (usaTeselas) dibujarTeselas();
    dibujarRuta();
    dibujarParadas(t);
    const buses = busesEnRuta(horario, perfil, diaT(nowT()));
    dibujarBuses(t, dt, buses);
  }

  /* ---------------------------------------------------------------- el bucle */
  const activo = () => !destruido && !doc.hidden && visibleEnPantalla;
  function pedir() {
    pintar = true;
    if (!raf && activo()) raf = win.requestAnimationFrame(bucle);
  }
  function bucle(ms: number) {
    raf = 0;
    if (!activo()) return;
    if (pintar) {
      pintar = false;
      dibujar(ms);
    }
    if (reloj.juega) {
      if (ms - ultimoTexto > (reloj.vel > 1 ? 250 : 1000)) {
        ultimoTexto = ms;
        saltarSinServicio();
        refrescarTextos();
      }
      // En reposo la simulación se dibuja 15 veces por segundo (30 si va rápida), no 60: ahorra batería.
      if (temporizador) return;
      temporizador = win.setTimeout(() => {
        temporizador = 0;
        pedir();
      }, reloj.vel > 1 ? 1000 / 30 : 1000 / 15);
    }
  }
  /** A velocidad rápida, la noche sin servicio no se espera: salta a poco antes de la primera salida. */
  function saltarSinServicio() {
    if (reloj.vel <= 1 || reloj.vivo) return;
    const t = diaT(nowT());
    if (estadoServicio(horario, perfil, t) === "despues") fijarHora(horario.primeraMin * 60 - 120, false);
  }

  function fijarHora(seg: number, sigueJugando = reloj.juega) {
    reloj.base = diaT(seg);
    reloj.ancla = performance.now();
    reloj.vivo = false;
    reloj.juega = sigueJugando;
    refrescarTextos(true);
    pedir();
  }
  function ponerJuega(j: boolean) {
    if (j === reloj.juega) return;
    if (!j) {
      reloj.base = diaT(nowT());
      reloj.juega = false;
      reloj.vivo = false;
    } else {
      reloj.ancla = performance.now();
      reloj.juega = true;
    }
    sincronizarControles();
    refrescarTextos(true);
    pedir();
  }
  function irAhora() {
    reloj.vel = 1;
    reloj.base = segundosDelDia(Date.now());
    reloj.ancla = performance.now();
    reloj.vivo = true;
    if (RM) {
      reloj.juega = false;
      reloj.vivo = false;
    }
    sincronizarControles();
    refrescarTextos(true);
    pedir();
  }

  /* ------------------------------------------------------------------ textos */
  const rotuloEl = q(".rpub-prox-rotulo");
  const horaEl = q(".rpub-prox-hora");
  const subEl = q(".rpub-prox-sub");
  const quitarEl = q<HTMLButtonElement>(".rpub-quitar");
  const listaEl = q(".rpub-lista");
  const datosEl = q(".rpub-datos");
  const salidasEl = q(".rpub-salidas");
  const pieEl = q(".rpub-pie");
  const horaInput = q<HTMLInputElement>(".rpub-hora");
  const velBtn = q<HTMLButtonElement>('[data-ac="vel"]');
  const jugarBtn = q<HTMLButtonElement>('[data-ac="jugar"]');
  const vivoEl = doc.createElement("div");
  vivoEl.className = "sr";
  vivoEl.setAttribute("aria-live", "polite");
  root.appendChild(vivoEl);

  const setTxt = (el: Element, txt: string) => {
    if (el.textContent !== txt) el.textContent = txt;
  };
  const minutosRecorrido = Math.round(perfil.total / 60);

  const itemsLista: { li: HTMLElement; btn: HTMLButtonElement; hora: HTMLElement }[] = [];
  VISIBLES.forEach((s) => {
    const li = doc.createElement("li");
    const nombre = s.terminal ? "UDES · salida" : s.nombre;
    li.innerHTML = `<button type="button" class="rpub-parada" data-par="${s.i}" aria-pressed="false">
      <span class="rpub-num ${s.terminal ? "rpub-num--udes" : ""}" aria-hidden="true">${s.terminal ? "U" : s.numero}</span>
      <span class="rpub-par-nombre">${s.terminal ? "Parqueadero UDES" : esc(nombre)}${s.terminal ? '<span class="rpub-par-nota">Salida y regreso</span>' : ""}</span>
      <span class="rpub-par-hora num"></span>
      <span class="rpub-elegida" aria-hidden="true">Elegida</span>
    </button>`;
    listaEl.appendChild(li);
    itemsLista.push({ li, btn: li.firstElementChild as HTMLButtonElement, hora: li.querySelector(".rpub-par-hora") as HTMLElement });
  });
  const chips = SALIDAS.map((s) => {
    const li = doc.createElement("li");
    li.textContent = formatoHora(s);
    salidasEl.appendChild(li);
    return { li, s };
  });
  datosEl.innerHTML = `
    <div><dt>Primera salida</dt><dd class="num">${formatoHora(horario.primeraMin * 60)}</dd></div>
    <div><dt>Última salida</dt><dd class="num">${formatoHora(horario.ultimaMin * 60)}</dd></div>
    <div><dt>Sale un bus cada</dt><dd class="num">${horario.intervaloMin}${nb}min</dd></div>
    <div><dt>Un recorrido dura</dt><dd class="num">unos ${minutosRecorrido}${nb}min</dd></div>
    <div><dt>Paradas</dt><dd class="num">${NPAR - 2} y la UDES</dd></div>
    <div><dt>Longitud</dt><dd class="num">${(TOTAL / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}${nb}km</dd></div>`;
  {
    const f = datos.ruta.actualizado ? new Date(datos.ruta.actualizado) : null;
    const fecha = f && !Number.isNaN(f.getTime()) ? f.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : null;
    pieEl.innerHTML = `
      <p><strong>Simulación según el horario.</strong> Los buses del mapa se calculan con la primera y la última salida y el intervalo publicados. No son la posición real y no hay GPS: un bus real puede llevar otra hora.</p>
      <p>Fuente: Oficina de Planeación Institucional, Universidad de Santander. ${fecha ? `Horario actualizado el ${esc(fecha)}.` : ""} Trazado y paradas de la ruta ${esc(datos.ruta.codigo)}.</p>
      ${op.etiquetaDatos ? `<p>${esc(op.etiquetaDatos)}</p>` : ""}
      <p>Mapa © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>.</p>`;
  }

  let minutoPrevio = -1;
  function refrescarTextos(forzar = false) {
    const t = diaT(nowT());
    const minuto = Math.floor(t / 60);
    const sel = ST.sel ?? 0;
    const prox = proximasLlegadas(horario, perfil, sel, t, 3);
    const primera = prox[0];
    const esUdes = sel === 0 || sel === NPAR - 1;
    const nombre = esUdes ? "la UDES" : `«${PARADAS[sel].nombre}»`;
    setTxt(rotuloEl, ST.sel === null ? "Próximo bus desde la UDES" : esUdes ? "Próximo bus desde la UDES" : `Próximo bus en ${nombre}`);
    if (primera === undefined) {
      setTxt(horaEl, "Sin salidas");
      setTxt(subEl, "El horario no tiene salidas.");
    } else {
      setTxt(horaEl, formatoHora(primera));
      const servicio = estadoServicio(horario, perfil, t);
      const espera = formatoEspera(primera - t);
      const cuando = primera >= DIA_S ? `Mañana, ${espera}` : espera[0].toUpperCase() + espera.slice(1);
      const enRuta = busesEnRuta(horario, perfil, t).length;
      const extra =
        servicio === "servicio"
          ? `${enRuta} ${enRuta === 1 ? "bus" : "buses"} en recorrido (simulados)`
          : servicio === "antes"
            ? "Aún no empieza el servicio"
            : "El servicio de hoy terminó";
      setTxt(subEl, `${cuando} · ${extra}`);
    }
    quitarEl.hidden = ST.sel === null || esUdes;
    // Solo lo que cambia por minuto se toca una vez por minuto.
    if (!forzar && minuto === minutoPrevio) return;
    minutoPrevio = minuto;
    VISIBLES.forEach((s, n) => {
      const p = proximasLlegadas(horario, perfil, s.i, t, 1)[0];
      setTxt(itemsLista[n].hora, p === undefined ? "—" : `${p >= DIA_S ? "mañana " : ""}${formatoHora(p)}`);
    });
    const siguiente = SALIDAS.find((s) => s >= t);
    chips.forEach((c) => {
      const pasada = c.s < t - 0 && c.s !== siguiente;
      c.li.className = c.s === siguiente ? "es-proxima" : pasada ? "es-pasada" : "";
    });
    if (doc.activeElement !== horaInput) horaInput.value = aCampoHora(t);
  }

  /* ------------------------------------------------------------- selección */
  function elegir(i: number | null, volar: boolean, desdeMapa = false) {
    const mismo = ST.sel === i;
    ST.sel = i === NPAR - 1 ? 0 : i;
    itemsLista.forEach((it, n) => {
      const on = VISIBLES[n].i === ST.sel;
      it.btn.setAttribute("aria-pressed", String(on));
      it.li.classList.toggle("es-elegida", on);
    });
    refrescarTextos(true);
    pedir();
    if (ST.sel === null) return;
    const p = PARADAS[ST.sel];
    const prox = proximasLlegadas(horario, perfil, ST.sel, diaT(nowT()), 1)[0];
    vivoEl.textContent = `${p.terminal ? "UDES" : `Parada ${p.numero}, ${p.nombre}`}. ${prox === undefined ? "" : `Próximo bus ${formatoHora(prox)}.`}`;
    if (volar && !mismo) volarA(p.x, p.y, Math.max(view.z, 16.2));
    if (ST.modo === "hoja") {
      if (ST.hoja === "abierta" || (desdeMapa && ST.hoja === "asomada")) irAHoja("media", true);
    }
  }

  /* ------------------------------------------------------------ la hoja */
  const hojaMedidas = { alto: 0, visible: { asomada: 150, media: 300, abierta: 520 } as Record<PuntoHoja, number> };
  const hoja = { y: 0, v: 0, anim: 0, drag: null as null | { id: number; y0: number; yIni: number; muestras: [number, number][]; movido: boolean } };
  const offset = (p: PuntoHoja) => hojaMedidas.alto - hojaMedidas.visible[p];

  function medirHoja() {
    const Hr = root.clientHeight;
    const cab = q(".rpub-cab").offsetHeight + q(".rpub-aviso").offsetHeight;
    hojaMedidas.alto = Math.max(200, Hr - cab - 6);
    const picoMin = arrastreEl.offsetHeight; // incluye el margen seguro de abajo
    hojaMedidas.visible = {
      asomada: picoMin,
      media: Math.max(picoMin + 150, Math.round(Hr * 0.5)),
      abierta: hojaMedidas.alto,
    };
    hojaEl.style.height = ST.modo === "hoja" ? `${hojaMedidas.alto}px` : "";
  }
  function aplicarY(y: number) {
    hoja.y = y;
    hojaEl.style.transform = ST.modo === "hoja" ? `translate3d(0,${y.toFixed(1)}px,0)` : "";
  }
  function detenerResorte() {
    if (hoja.anim) win.cancelAnimationFrame(hoja.anim);
    hoja.anim = 0;
  }
  /** Resorte con velocidad heredada: se puede interrumpir y volver a empujar sin saltos. */
  function resorte(destino: number, v0: number) {
    detenerResorte();
    if (RM) {
      aplicarY(destino);
      return;
    }
    let v = v0;
    let previo = performance.now();
    const K = 420;
    const C = 34;
    const paso = (ahora: number) => {
      const dt = Math.min(0.032, (ahora - previo) / 1000 || 0.016);
      previo = ahora;
      const a = -K * (hoja.y - destino) - C * v;
      v += a * dt;
      aplicarY(hoja.y + v * dt);
      if (Math.abs(hoja.y - destino) < 0.4 && Math.abs(v) < 6) {
        aplicarY(destino);
        hoja.anim = 0;
        return;
      }
      hoja.anim = win.requestAnimationFrame(paso);
    };
    hoja.anim = win.requestAnimationFrame(paso);
  }
  function marcarHoja(p: PuntoHoja) {
    ST.hoja = p;
    root.setAttribute("data-hoja", p);
    asaEl.setAttribute("aria-expanded", String(p !== "asomada"));
    asaEl.setAttribute("aria-label", p === "abierta" ? "Reducir el panel" : "Ampliar el panel");
    (restoEl as HTMLElement & { inert: boolean }).inert = ST.modo === "hoja" && p === "asomada";
  }
  function irAHoja(p: PuntoHoja, animar: boolean, v0 = 0) {
    marcarHoja(p);
    if (ST.modo !== "hoja") return;
    if (animar) resorte(offset(p), v0);
    else {
      detenerResorte();
      aplicarY(offset(p));
    }
  }
  const amortiguar = (d: number) => 64 * (1 - Math.exp(-d / 96));
  function alArrastrar(y: number): number {
    const lo = offset("abierta");
    const hi = offset("asomada");
    if (y < lo) return lo - amortiguar(lo - y);
    if (y > hi) return hi + amortiguar(y - hi);
    return y;
  }
  arrastreEl.addEventListener("pointerdown", (e) => {
    if (ST.modo !== "hoja" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (hoja.drag) return; // un solo dedo manda hasta que suelte
    if ((e.target as Element).closest("button:not(.rpub-asa)")) return;
    detenerResorte();
    const k0 = kEsc();
    hoja.drag = { id: e.pointerId, y0: e.clientY / k0, yIni: hoja.y, muestras: [[performance.now(), e.clientY / k0]], movido: false };
    if (ST.entrada) saltarEntrada();
    arrastreEl.setPointerCapture(e.pointerId);
    root.setAttribute("data-arrastra", "");
  });
  arrastreEl.addEventListener("pointermove", (e) => {
    const d = hoja.drag;
    if (!d || e.pointerId !== d.id) return;
    const cy = e.clientY / kEsc();
    const dy = cy - d.y0;
    if (Math.abs(dy) > 4) d.movido = true;
    d.muestras.push([performance.now(), cy]);
    if (d.muestras.length > 6) d.muestras.shift();
    aplicarY(alArrastrar(d.yIni + dy));
  });
  function soltar(e: PointerEvent) {
    const d = hoja.drag;
    if (!d || e.pointerId !== d.id) return;
    hoja.drag = null;
    root.removeAttribute("data-arrastra");
    const m = d.muestras;
    const a = m[0];
    const b = m[m.length - 1];
    const v = b[0] > a[0] ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0; // px/s, positivo hacia abajo
    if (!d.movido) return; // un toque: lo atiende el clic del botón
    const proyectado = hoja.y + v * 0.16;
    let mejor: PuntoHoja = "asomada";
    let dist = Infinity;
    (["asomada", "media", "abierta"] as PuntoHoja[]).forEach((p) => {
      const dd = Math.abs(offset(p) - proyectado);
      if (dd < dist) {
        dist = dd;
        mejor = p;
      }
    });
    // Un gesto rápido avanza al menos un punto, aunque haya recorrido poco.
    const orden: PuntoHoja[] = ["abierta", "media", "asomada"];
    const actual = ST.hoja;
    if (Math.abs(v) > 700 && mejor === actual) {
      const i = orden.indexOf(actual);
      mejor = orden[clamp(i + (v > 0 ? 1 : -1), 0, 2)];
    }
    marcarHoja(mejor);
    resorte(offset(mejor), v);
    ignorarClic = true;
    win.setTimeout(() => (ignorarClic = false), 0);
  }
  let ignorarClic = false;
  arrastreEl.addEventListener("pointerup", soltar);
  arrastreEl.addEventListener("pointercancel", soltar);
  asaEl.addEventListener("click", () => {
    if (ignorarClic) return;
    // Un toque sube un punto; desde arriba vuelve a asomarse.
    irAHoja(ST.hoja === "asomada" ? "media" : ST.hoja === "media" ? "abierta" : "asomada", true);
  });
  asaEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      irAHoja(ST.hoja === "asomada" ? "media" : "abierta", true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      irAHoja(ST.hoja === "abierta" ? "media" : "asomada", true);
    }
  });

  /* ------------------------------------------------------------- composición */
  function calcularModo(): Modo {
    if (ST.modoForzado) return ST.modoForzado;
    if (mqSeg.matches || mqPostura.matches) return "partido";
    const w = root.clientWidth;
    const h = root.clientHeight;
    return w >= 600 && w / h >= 0.62 ? "panel" : "hoja";
  }
  function acomodar() {
    if (destruido) return;
    ST.modo = calcularModo();
    root.setAttribute("data-modo", ST.modo);
    medirHoja();
    marcarHoja(ST.hoja);
    if (ST.modo !== "hoja") {
      detenerResorte();
      aplicarY(0);
    } else if (!ST.entrada) aplicarY(offset(ST.hoja)); // durante la entrada manda la animación
    // El lienzo toma el tamaño de su caja; si nadie movió el mapa, se vuelve a encuadrar la ruta,
    // y si lo movieron, la cámara conserva su centro y su zoom.
    const w = Math.max(1, mapaEl.offsetWidth);
    const h = Math.max(1, mapaEl.offsetHeight);
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    const tope = w * h * dpr * dpr > 2_600_000 ? Math.sqrt(2_600_000 / (w * h)) : dpr;
    if (w !== W || h !== H || Math.max(1, tope) !== DPR) {
      W = w;
      H = h;
      DPR = Math.max(1, tope);
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      if (!ST.tocoMapa) ajustar(false);
    }
    pedir();
  }

  /* -------------------------------------------------------------- interacción */
  const ptrs = new Map<number, { x: number; y: number }>();
  let pin: { d: number; z: number } | null = null;
  let toque: { x: number; y: number; t: number; mov: boolean } | null = null;
  /** Escala visual del contenedor (1 salvo que alguien lo reduzca con transform, como el simulador de dispositivos). */
  const kEsc = () => (root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1) || 1;
  const punto = (e: { clientX: number; clientY: number }) => {
    const r = cv.getBoundingClientRect();
    const k = kEsc();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  function paradaEn(px: number, py: number): number | null {
    let mejor: number | null = null;
    let d2 = 28 * 28;
    for (const s of VISIBLES) {
      if (s.appear < 0.5) continue;
      const dx = sx(s.x) - px;
      const dy = sy(s.y) - py;
      const d = dx * dx + dy * dy;
      if (d < d2) {
        d2 = d;
        mejor = s.i;
      }
    }
    return mejor;
  }
  cv.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (ST.entrada) saltarEntrada();
    gsap.killTweensOf(view);
    cv.setPointerCapture(e.pointerId);
    const p = punto(e);
    ptrs.set(e.pointerId, p);
    toque = ptrs.size === 1 ? { x: p.x, y: p.y, t: performance.now(), mov: false } : null;
    if (ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      pin = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: view.z };
    }
  });
  cv.addEventListener("pointermove", (e) => {
    const previo = ptrs.get(e.pointerId);
    if (!previo) return;
    const p = punto(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) {
      if (toque && Math.hypot(p.x - toque.x, p.y - toque.y) > 7) toque.mov = true;
      if (toque?.mov) {
        view.cx -= (p.x - previo.x) / ws();
        view.cy -= (p.y - previo.y) / ws();
        acotar();
        ST.tocoMapa = true;
        pedir();
      }
    } else if (ptrs.size === 2 && pin) {
      const [a, b] = Array.from(ptrs.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, pin.z + Math.log2(d / pin.d));
    }
  });
  function terminarToque(e: PointerEvent) {
    if (!ptrs.has(e.pointerId)) return;
    const p = punto(e);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pin = null;
    if (toque && !toque.mov && e.type === "pointerup" && performance.now() - toque.t < 500) {
      const i = paradaEn(p.x, p.y);
      if (i !== null) elegir(i, true, true);
    }
    toque = null;
  }
  cv.addEventListener("pointerup", terminarToque);
  cv.addEventListener("pointercancel", terminarToque);
  cv.addEventListener("dblclick", (e) => {
    const p = punto(e);
    zoomEn(p.x, p.y, view.z + 1);
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = punto(e);
      zoomEn(p.x, p.y, view.z - e.deltaY * 0.0022);
    },
    { passive: false },
  );

  function sincronizarControles() {
    const j = reloj.juega;
    jugarBtn.innerHTML = j ? ICONOS.pausa : ICONOS.jugar;
    jugarBtn.setAttribute("aria-label", j ? "Pausar la simulación" : "Reproducir la simulación");
    jugarBtn.setAttribute("aria-pressed", String(!j));
    jugarBtn.title = j ? "Pausar la simulación" : "Reproducir la simulación";
    velBtn.setAttribute("aria-pressed", String(reloj.vel > 1));
    root.setAttribute("data-juega", String(j));
  }
  function seleccionarPestana(p: "paradas" | "horario", enfocar = false) {
    ST.pestana = p;
    qa("[data-pest]").forEach((b) => {
      const on = b.getAttribute("data-pest") === p;
      b.setAttribute("aria-selected", String(on));
      b.setAttribute("tabindex", on ? "0" : "-1");
      if (on && enfocar) (b as HTMLElement).focus();
    });
    q("#rpub-p-paradas").hidden = p !== "paradas";
    q("#rpub-p-horario").hidden = p !== "horario";
  }

  root.addEventListener("click", (e) => {
    const el = e.target as Element;
    const inicio = el.closest("[data-inicio]");
    if (inicio && op.alIr && !(e as MouseEvent).metaKey && !(e as MouseEvent).ctrlKey && (e as MouseEvent).button === 0) {
      e.preventDefault();
      op.alIr();
      return;
    }
    const par = el.closest<HTMLElement>("[data-par]");
    if (par) {
      const i = Number(par.dataset.par);
      elegir(ST.sel === i && i !== 0 ? null : i, true);
      return;
    }
    const pest = el.closest<HTMLElement>("[data-pest]");
    if (pest) {
      seleccionarPestana(pest.dataset.pest as "paradas" | "horario");
      return;
    }
    const ac = el.closest<HTMLElement>("[data-ac]")?.dataset.ac;
    if (!ac) return;
    const hora = diaT(nowT());
    if (ac === "centrar") ajustar(true);
    else if (ac === "jugar") ponerJuega(!reloj.juega);
    else if (ac === "mas") zoomEn(W / 2, H / 2 - tapado() / 2, view.z + 0.8);
    else if (ac === "menos") zoomEn(W / 2, H / 2 - tapado() / 2, view.z - 0.8);
    else if (ac === "quitar") elegir(null, false);
    else if (ac === "menos15") fijarHora(hora - 15 * 60);
    else if (ac === "mas15") fijarHora(hora + 15 * 60);
    else if (ac === "ahora") irAhora();
    else if (ac === "vel") {
      reloj.base = hora;
      reloj.ancla = performance.now();
      reloj.vivo = false;
      reloj.vel = reloj.vel > 1 ? 1 : 10;
      if (!reloj.juega) reloj.juega = true;
      sincronizarControles();
      refrescarTextos(true);
      pedir();
    }
  });
  horaInput.addEventListener("change", () => {
    const m = /^(\d{2}):(\d{2})/.exec(horaInput.value);
    if (m) fijarHora(Number(m[1]) * 3600 + Number(m[2]) * 60);
  });
  q(".rpub-pestanas").addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === "ArrowRight" || k === "ArrowLeft" || k === "Home" || k === "End") {
      e.preventDefault();
      seleccionarPestana(ST.pestana === "paradas" ? "horario" : "paradas", true);
    }
  });

  /* ----------------------------------------------------- vida y observadores */
  const ro = new win.ResizeObserver(() => acomodar());
  ro.observe(root);
  const io = new win.IntersectionObserver((en) => {
    const v = en[en.length - 1].isIntersecting;
    if (v === visibleEnPantalla) return;
    visibleEnPantalla = v;
    if (v) {
      resincronizar();
      pedir();
    }
  });
  io.observe(root);
  const alVisibilidad = () => {
    if (!doc.hidden) {
      resincronizar();
      pedir();
    } else if (reloj.juega && !reloj.vivo) {
      // Oculta, la simulación se congela donde iba: al volver continúa desde ahí.
      reloj.base = diaT(nowT());
      reloj.ancla = performance.now();
    }
  };
  /** Al volver a mostrarse, el reloj vivo se alinea con la hora real y el otro sigue donde quedó. */
  function resincronizar() {
    if (reloj.vivo && reloj.juega) reloj.base = segundosDelDia(Date.now());
    else if (reloj.juega) reloj.ancla = performance.now();
    refrescarTextos(true);
  }
  doc.addEventListener("visibilitychange", alVisibilidad);
  const alTema = () => leerTema();
  mqOscuro.addEventListener("change", alTema);
  const mo = new win.MutationObserver(alTema);
  mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const alRM = () => {
    RM = mqRM.matches;
    if (RM) ponerJuega(false);
  };
  mqRM.addEventListener("change", alRM);
  const alModoMedia = () => acomodar();
  mqSeg.addEventListener("change", alModoMedia);
  mqPostura.addEventListener("change", alModoMedia);

  /* ------------------------------------------------------------------ entrada */
  let linea: { progress(p?: number): unknown; kill(): unknown } | null = null;
  function saltarEntrada() {
    if (!ST.entrada) return;
    linea?.progress(1);
    linea?.kill();
    ST.entrada = false;
    ST.reveal = 1;
    ST.busAlpha = 1;
    PARADAS.forEach((s) => (s.appear = 1));
    acomodar();
  }
  function entrada() {
    leerTema();
    seleccionarPestana("paradas");
    sincronizarControles();
    refrescarTextos(true);
    acomodar();
    ajustar(false);
    if (RM) {
      ST.reveal = 1;
      ST.busAlpha = 1;
      ST.entrada = false;
      irAHoja("asomada", false);
      pedir();
      return;
    }
    // Una sola secuencia: la hoja sube, la ruta se traza, las paradas aparecen
    // en cascada siguiendo el trazo y por último entran los buses.
    PARADAS.forEach((s) => (s.appear = 0));
    ST.reveal = 0;
    ST.busAlpha = 0;
    if (ST.modo === "hoja") aplicarY(hojaMedidas.alto + 12);
    pedir();
    const tl = gsap.timeline({
      defaults: { overwrite: false },
      onComplete: () => {
        ST.entrada = false;
        acomodar();
      },
      onUpdate: pedir,
    });
    linea = tl;
    if (ST.modo === "hoja") {
      const dest = offset("asomada");
      tl.to(hoja, { y: dest, duration: 0.6, ease: "power4.out", onUpdate: () => aplicarY(hoja.y) }, 0.05);
    }
    tl.to(ST, { reveal: 1, duration: 1.5, ease: "power2.inOut" }, 0.15);
    PARADAS.forEach((s) => {
      const f = TOTAL > 0 ? s.s / TOTAL : 0;
      tl.to(s, { appear: 1, duration: 0.36, ease: "back.out(2.2)" }, 0.15 + 1.5 * f * 0.92);
    });
    tl.to(ST, { busAlpha: 1, duration: 0.45, ease: "power3.out" }, 1.55);
  }

  /* ------------------------------------------------------------------- API */
  const api: ApiPublico = {
    destruir() {
      if (destruido) return;
      destruido = true;
      detenerResorte();
      gsap.killTweensOf(view);
      gsap.killTweensOf(ST);
      PARADAS.forEach((s) => gsap.killTweensOf(s));
      linea?.kill();
      if (raf) win.cancelAnimationFrame(raf);
      if (temporizador) win.clearTimeout(temporizador);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      doc.removeEventListener("visibilitychange", alVisibilidad);
      mqOscuro.removeEventListener("change", alTema);
      mqRM.removeEventListener("change", alRM);
      mqSeg.removeEventListener("change", alModoMedia);
      mqPostura.removeEventListener("change", alModoMedia);
      TESELAS.clear();
      root.innerHTML = "";
      root.classList.remove("rpub");
    },
    forzarModo(m) {
      ST.modoForzado = m;
      acomodar();
    },
    estado(): EstadoPublico {
      return {
        parada: ST.sel,
        hoja: ST.hoja,
        pestana: ST.pestana,
        hora: diaT(nowT()),
        jugando: reloj.juega,
        camara: { cx: view.cx, cy: view.cy, z: view.z },
        modo: ST.modo,
      };
    },
    saltarEntrada,
    elegirParada(i) {
      elegir(i, true);
    },
  };

  entrada();
  return api;
}
