/* =============================================================================
   Mr. Pilo · el Animoji dibujado.

   Las cuatro caras que dibujó Planeación (atrevido, emocionado, loco, pensar),
   separadas en capas por scripts/pilo-svg/build.mjs y servidas desde
   public/pilo-svg. El SVG se incrusta en la página (no como <img>) para que
   GSAP llegue a cada parte:
     · la cabeza gira en 3D hacia donde mira y las capas se desplazan a
       distinta profundidad (pelo atrás, pico y gafas delante); el brillo y
       la sombra del borde van al revés, como una luz fija, y dan volumen;
     · las pupilas siguen el puntero (`track`) o miran a donde se les diga
       (`look`); parpadea solo cada 2,2–5,4 s y mira alrededor si nadie lo
       mueve (`idle`); respira suave (`alive`);
     · habla con la mandíbula (el pico inferior y la lengua) con un ritmo
       desigual, como sílabas (`talk`);
     · cambiar de emoción es un «pop» corto entre dibujos (escala 0.92 → 1,
       giro leve, 260 ms, salida fuerte), y cada emoción tiene su gesto:
       atrevido levanta la ceja y ladea la cabeza, emocionado da un saltito
       con destellos, loco tiembla y da vueltas a los ojos, pensar mira
       arriba a la derecha con las marcas de pensamiento flotando.

   Misma API que PiloMoji. Con movimiento reducido: sin giros, saltos ni
   bucles; el parpadeo y el cambio de emoción quedan como fundidos.
   ========================================================================== */

import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import "./pilo-svg-moji.css";

export type PiloSvgMood = "atrevido" | "emocionado" | "loco" | "pensar";

export const PILO_SVG_MOODS: PiloSvgMood[] = ["atrevido", "emocionado", "loco", "pensar"];

export interface PiloSvgMojiHandle {
  /** Mira hacia nx, ny (−1 a 1). */
  look: (nx: number, ny: number) => void;
  talk: (on: boolean) => void;
  mood: (m: PiloSvgMood) => void;
  blink: () => void;
  /** Un asentimiento corto. */
  nod: () => void;
  /** El elemento, para medirlo o moverlo. */
  el: () => HTMLDivElement | null;
}

/* ── utilidades puras ─────────────────────────────────────────────────────── */

/**
 * Hace únicas las ids de un SVG incrustado: dos Pilos en la misma página
 * no pueden compartir el clipPath. Cambia id="x", url(#x) y href="#x".
 */
export function prefixSvgIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  if (!ids.size) return svg;
  const esc = [...ids].map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return svg
    .replace(new RegExp(`(\\sid=")(${esc})"`, "g"), `$1${prefix}$2"`)
    .replace(new RegExp(`url\\(#(${esc})\\)`, "g"), `url(#${prefix}$1)`)
    .replace(new RegExp(`(href=")#(${esc})"`, "g"), `$1#${prefix}$2"`);
}

export interface Syllable {
  /** Apertura de la mandíbula, en grados. */
  open: number;
  /** Duración de abrir (y de cerrar), en segundos. */
  dur: number;
  /** Pausa tras la sílaba, en segundos (a veces 0, a veces una coma). */
  rest: number;
}

/** Una frase de sílabas desiguales. `rnd` se inyecta para poder probarla. */
export function syllables(count: number, rnd: () => number = Math.random): Syllable[] {
  const out: Syllable[] = [];
  for (let i = 0; i < count; i++) {
    const stressed = rnd() < 0.3;
    out.push({
      open: stressed ? 9 + rnd() * 5 : 3 + rnd() * 6,
      dur: 0.055 + rnd() * 0.06,
      rest: rnd() < 0.18 ? 0.12 + rnd() * 0.14 : 0,
    });
  }
  return out;
}

/* ── el motor (sin React: también lo usa la vista previa) ─────────────────── */

const reducedQuery = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

/* Salida fuerte, equivalente a cubic-bezier(0.23, 1, 0.32, 1). */
const OUT = "power4.out";

export interface PiloSvgRigOptions {
  /** Devuelve el SVG en capas de una emoción. */
  load: (m: PiloSvgMood) => Promise<string>;
  prefix: string;
  track: boolean;
  idle: boolean;
  reduced?: boolean;
}

export interface PiloSvgRig {
  look: (nx: number, ny: number, hold?: boolean) => void;
  talk: (on: boolean) => void;
  mood: (m: PiloSvgMood) => void;
  blink: () => void;
  nod: () => void;
  breathe: (on: boolean) => void;
  destroy: () => void;
}

interface Parts {
  layer: HTMLElement;
  /** Brillo y sombra de volumen: van al revés de la mirada. */
  light: SVGGElement | null;
  hair: SVGGElement | null;
  eyes: SVGGElement | null;
  eyeL: SVGGElement | null;
  eyeR: SVGGElement | null;
  pupils: SVGGElement[];
  brows: SVGGElement | null;
  browL: SVGGElement | null;
  browR: SVGGElement | null;
  beak: SVGGElement | null;
  jaw: SVGGElement | null;
  /** La boca que habla: garganta y mandíbula, que se estiran juntas. */
  mouth: SVGElement[];
  glasses: SVGGElement | null;
  extra: SVGGElement | null;
  thought: SVGElement[];
  /** Bisagra de la mandíbula (x, y) y signo del giro que abre la boca. */
  hinge: [number, number, number];
}

/*
 * Profundidad de cada capa, en unidades del dibujo (1254 de lado) por unidad
 * de mirada. El pelo va detrás (se mueve al revés); pico y gafas delante.
 */
const DEPTH = { light: [-70, -50], hair: [-16, -10], brows: [14, 9], eyes: [14, 10], pupils: [24, 18], glasses: [26, 16], beak: [36, 16], extra: [32, 14] } as const;
const LAYERS = ["light", "hair", "brows", "eyes", "glasses", "beak", "extra"] as const;

export function createPiloSvgRig(root: HTMLElement, rig: HTMLElement, stage: HTMLElement, fx: HTMLElement | null, o: PiloSvgRigOptions): PiloSvgRig {
  const reduced = o.reduced ?? reducedQuery();
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  let dead = false;
  let parts: Parts | null = null;
  let current: PiloSvgMood | null = null;
  let wanted: PiloSvgMood | null = null;
  let serial = 0;
  let gaze: [number, number] = [0, 0];
  let hold = 0;
  let lastMove = 0;
  let talking = false;
  let talkTl: gsap.core.Timeline | null = null;
  let signature: gsap.core.Timeline | null = null;
  let loop: gsap.core.Tween | null = null;
  let breath: gsap.core.Tween | null = null;
  let quick: Record<string, (v: number) => void> = {};

  // Perspectiva proporcional al tamaño: igual de profunda a 96 px que a 440 px.
  gsap.set(rig, { transformPerspective: Math.max(300, rig.offsetWidth * 2.6), transformOrigin: "50% 58%" });
  const T = (d: number) => ({ duration: d, ease: "power3.out" });
  const tilt = {
    ry: gsap.quickTo(rig, "rotationY", T(0.7)),
    rx: gsap.quickTo(rig, "rotationX", T(0.7)),
  };

  const bind = (layer: HTMLElement): Parts => {
    const q = <T extends Element>(s: string) => layer.querySelector<T>(s);
    const beak = q<SVGGElement>(".pm-beak");
    const h = (beak?.dataset.hinge ?? "0 0 -1").split(" ").map(Number) as [number, number, number];
    return {
      layer,
      light: q(".pm-light"),
      hair: q(".pm-hair"),
      eyes: q(".pm-eyes"),
      eyeL: q(".pm-eye-l"),
      eyeR: q(".pm-eye-r"),
      pupils: [...layer.querySelectorAll<SVGGElement>(".pm-pupil")],
      brows: q(".pm-brows"),
      browL: q(".pm-brow-l"),
      browR: q(".pm-brow-r"),
      beak,
      jaw: q(".pm-jaw"),
      mouth: [q<SVGElement>(".pm-throat"), q<SVGElement>(".pm-jaw")].filter(Boolean) as SVGElement[],
      glasses: q(".pm-glasses"),
      extra: q(".pm-extra"),
      thought: [...layer.querySelectorAll<SVGElement>(".pm-thought circle")],
      hinge: h,
    };
  };

  /** Las funciones rápidas de parallax para la capa activa. */
  const wire = (p: Parts) => {
    quick = {};
    const add = (key: string, el: Element | null, prop: "x" | "y", d: number) => {
      if (el) quick[key] = gsap.quickTo(el, prop, T(d));
    };
    const layers: [keyof typeof DEPTH, Element | null, number][] = [
      ["light", p.light, 0.9],
      ["hair", p.hair, 0.8],
      ["brows", p.brows, 0.7],
      ["eyes", p.eyes, 0.6],
      ["glasses", p.glasses, 0.6],
      ["beak", p.beak, 0.6],
      ["extra", p.extra, 0.7],
    ];
    for (const [k, el, d] of layers) {
      add(`${k}X`, el, "x", d);
      add(`${k}Y`, el, "y", d);
    }
    p.pupils.forEach((el, i) => {
      quick[`pu${i}X`] = gsap.quickTo(el, "x", { duration: 0.25, ease: "power3.out" });
      quick[`pu${i}Y`] = gsap.quickTo(el, "y", { duration: 0.25, ease: "power3.out" });
    });
    gsap.set([p.eyeL, p.eyeR].filter(Boolean), { transformOrigin: "50% 50%" });
    // La boca se estira desde el borde de arriba de la mandíbula (la línea
    // del pico): así crece hacia abajo sin despegarse del pico.
    if (p.jaw && p.mouth.length) {
      const b = p.jaw.getBBox();
      gsap.set(p.mouth, { svgOrigin: `${b.x + b.width / 2} ${b.y}` });
    }
  };

  const apply = (nx: number, ny: number, instant = false) => {
    gaze = [nx, ny];
    const turn = reduced ? 0 : 1;
    const set = (key: string, v: number, el?: Element | null, prop?: "x" | "y") => {
      if (instant && el && prop) gsap.set(el, { [prop]: v });
      else quick[key]?.(v);
    };
    if (!instant) {
      tilt.ry(nx * 18 * turn);
      tilt.rx(-ny * 11 * turn);
    }
    const p = parts;
    if (!p) return;
    for (const k of LAYERS) {
      const el = p[k];
      set(`${k}X`, nx * DEPTH[k][0] * turn, el, "x");
      set(`${k}Y`, ny * DEPTH[k][1] * turn, el, "y");
    }
    p.pupils.forEach((el, i) => {
      set(`pu${i}X`, nx * DEPTH.pupils[0], el, "x");
      set(`pu${i}Y`, ny * DEPTH.pupils[1], el, "y");
    });
  };

  const look = (nx: number, ny: number, held = false) => {
    nx = Math.max(-1, Math.min(1, nx));
    ny = Math.max(-1, Math.min(1, ny));
    if (held) hold = performance.now() + 2200;
    apply(nx, ny);
  };

  const blink = () => {
    const p = parts;
    if (!p) return;
    const eyes = [p.eyeL, p.eyeR].filter(Boolean);
    if (reduced) {
      // Un fundido corto en lugar del cierre.
      gsap.to(eyes, { opacity: 0.15, duration: 0.08, ease: "power2.out", yoyo: true, repeat: 1 });
      return;
    }
    gsap.to(eyes, { scaleY: 0.08, duration: 0.07, ease: "power2.in", yoyo: true, repeat: 1 });
  };

  /*
   * Hablar: frases de sílabas desiguales. La boca no gira sobre una bisagra
   * (en un dibujo vectorizado eso abre grietas y despega el contorno): se
   * estira hacia abajo desde la línea del pico, más en las sílabas fuertes,
   * y entre sílabas casi se cierra, como en una «m» o una «p». En las sílabas
   * fuertes la cabeza acompaña con un golpe mínimo.
   */
  const MOUTH_OPEN = (deg: number) => 1 + Math.min(0.15, deg / 95);
  const MOUTH_SHUT = 0.95;
  const speak = () => {
    const p = parts;
    talkTl?.kill();
    talkTl = null;
    if (!p?.mouth.length) return;
    const tl = gsap.timeline({ onComplete: () => talking && speak() });
    for (const s of syllables(5 + Math.floor(Math.random() * 4))) {
      const open = MOUTH_OPEN(s.open);
      const at = tl.duration();
      tl.to(p.mouth, { scaleY: open, scaleX: 1 + (open - 1) * 0.25, duration: s.dur, ease: "power2.out" }).to(p.mouth, {
        scaleY: MOUTH_SHUT,
        scaleX: 1,
        duration: s.dur * 1.15,
        ease: "power2.inOut",
      });
      if (!reduced && s.open > 9) tl.to(rig, { y: "+=1.5", duration: s.dur, ease: "power2.out", yoyo: true, repeat: 1 }, at);
      if (s.rest) tl.to(p.mouth, { scaleY: 1, scaleX: 1, duration: s.rest, ease: "power2.out" });
    }
    talkTl = tl;
  };
  const talk = (on: boolean) => {
    talking = on;
    if (on) speak();
    else {
      talkTl?.kill();
      talkTl = null;
      if (parts?.mouth.length) gsap.to(parts.mouth, { scaleY: 1, scaleX: 1, duration: 0.16, ease: "power2.out" });
    }
  };

  const nod = () => {
    if (reduced) return;
    gsap.to(rig, { rotationX: "+=12", duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 });
  };

  /* Los destellos de «emocionado»: tres estrellas que aparecen y se van. */
  const sparkle = () => {
    if (!fx || reduced) return;
    const stars = [...fx.querySelectorAll<SVGElement>(".pilo-svg-moji__star")];
    gsap.killTweensOf(stars);
    gsap.set(stars, { opacity: 0, scale: 0.6, rotation: -20, transformOrigin: "50% 50%" });
    gsap.to(stars, {
      keyframes: [
        { opacity: 1, scale: 1, rotation: 0, duration: 0.22, ease: OUT },
        { opacity: 0, scale: 0.85, duration: 0.3, ease: "power2.in", delay: 0.18 },
      ],
      stagger: 0.07,
    });
  };

  /* El gesto propio de cada emoción. */
  const gesture = (m: PiloSvgMood) => {
    signature?.kill();
    loop?.kill();
    loop = null;
    const p = parts;
    if (!p || reduced) return;
    const tl = gsap.timeline({ delay: 0.12 });
    signature = tl;
    if (m === "atrevido") {
      const brow = p.browR ?? p.brows;
      if (brow) tl.to(brow, { y: -30, rotation: -5, transformOrigin: "50% 100%", duration: 0.22, ease: OUT }, 0).to(brow, { y: 0, rotation: 0, duration: 0.4, ease: "power2.inOut" }, 0.9);
      tl.to(rig, { rotation: 6, duration: 0.32, ease: "back.out(2)" }, 0).to(rig, { rotation: 0, duration: 0.6, ease: "power2.inOut" }, 1.0);
    } else if (m === "emocionado") {
      tl.to(rig, { yPercent: -7, duration: 0.16, ease: "power2.out" })
        .to(rig, { yPercent: 0, duration: 0.18, ease: "power2.in" })
        .to(rig, { yPercent: -3, duration: 0.12, ease: "power2.out" })
        .to(rig, { yPercent: 0, duration: 0.14, ease: "power2.in" });
      if (p.pupils.length) tl.to(p.pupils, { scale: 1.12, transformOrigin: "50% 50%", duration: 0.18, ease: OUT, yoyo: true, repeat: 1 }, 0.05);
      tl.call(sparkle, [], 0.1);
    } else if (m === "loco") {
      tl.to(rig, { keyframes: { rotation: [0, -8, 7, -5, 3, 0] }, duration: 0.5, ease: "none" }, 0);
      // Los ojos dan una vuelta, cada uno hacia su lado.
      p.pupils.forEach((el, i) => {
        const dir = i === 0 ? 1 : -1;
        const r = 16;
        tl.to(el, { keyframes: { x: [0, r, 0, -r, 0].map((v) => v * dir), y: [-r, 0, r, 0, -r * 0.3] }, duration: 0.55, ease: "none" }, 0.05);
      });
      tl.call(() => apply(gaze[0], gaze[1]));
    } else if (m === "pensar") {
      hold = performance.now() + 1800;
      apply(0.75, -0.85);
      tl.to(rig, { rotation: -5, duration: 1.1, ease: "sine.inOut" }, 0).to(rig, { rotation: 0, duration: 1.2, ease: "sine.inOut" }, 1.6);
      if (p.thought.length) {
        gsap.set(p.thought, { opacity: 0, y: 10 });
        tl.to(p.thought, { opacity: 1, y: 0, duration: 0.4, ease: OUT, stagger: 0.14 }, 0.1);
        // Las marcas flotan mientras dure la emoción.
        loop = gsap.to(p.thought, { y: -12, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.25, delay: 0.7 });
      }
    }
  };

  /* Cambio de emoción: la nueva capa «aparece» y la anterior se funde. */
  const swap = async (m: PiloSvgMood) => {
    wanted = m;
    if (m === current) return;
    let svg: string;
    try {
      svg = await o.load(m);
    } catch {
      return;
    }
    if (dead || wanted !== m || m === current) return;
    const layer = document.createElement("div");
    layer.className = "pilo-svg-moji__layer";
    layer.dataset.mood = m;
    layer.innerHTML = prefixSvgIds(svg, `${o.prefix}${++serial}-`);
    const prev = [...stage.children] as HTMLElement[];
    stage.appendChild(layer);
    const first = current === null;
    current = m;
    signature?.kill();
    loop?.kill();
    loop = null;
    talkTl?.kill();
    parts = bind(layer);
    wire(parts);
    apply(gaze[0], gaze[1], true);
    for (const old of prev) {
      gsap.killTweensOf(old);
      gsap.to(old, { opacity: 0, duration: reduced ? 0.2 : 0.16, ease: "power2.out", onComplete: () => old.remove() });
    }
    if (first) {
      gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    } else if (reduced) {
      gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    } else {
      gsap.fromTo(layer, { opacity: 0, scale: 0.92, rotation: -4 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.26, ease: OUT, transformOrigin: "50% 60%" });
    }
    if (talking) speak();
    if (!first || m === "pensar") gesture(m);
  };

  /* Parpadeo propio, cada 2,2–5,4 s (a veces doble). */
  const blinkLoop = () =>
    later(() => {
      blink();
      if (Math.random() < 0.15) later(blink, 220);
      blinkLoop();
    }, 2200 + Math.random() * 3200);
  blinkLoop();

  const onMove = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    if (!r.width) return;
    lastMove = performance.now();
    if (lastMove < hold) return;
    look((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45), (e.clientY - (r.top + r.height * 0.45)) / (window.innerHeight * 0.5));
  };
  const tracking = o.track && finePointer();
  if (tracking) window.addEventListener("pointermove", onMove, { passive: true });

  /* Mirar alrededor solo; «pensar» mira sobre todo arriba a la derecha. */
  const idleLoop = () =>
    later(() => {
      const now = performance.now();
      if (now > hold && now - lastMove > 2500) {
        if (current === "pensar" && Math.random() < 0.6) look(0.5 + Math.random() * 0.4, -0.6 - Math.random() * 0.3);
        else look(Math.random() * 1.4 - 0.7, Math.random() * 0.8 - 0.4);
      }
      idleLoop();
    }, 1800 + Math.random() * 1600);
  if (o.idle) idleLoop();

  const breathe = (on: boolean) => {
    breath?.kill();
    breath = null;
    if (!on || reduced) {
      gsap.set(stage, { yPercent: 0, scale: 1 });
      return;
    }
    breath = gsap.to(stage, { yPercent: -1, scale: 1.012, transformOrigin: "50% 100%", duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
  };

  return {
    look,
    talk,
    mood: (m) => void swap(m),
    blink,
    nod,
    breathe,
    destroy: () => {
      dead = true;
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      window.removeEventListener("pointermove", onMove);
      talkTl?.kill();
      signature?.kill();
      loop?.kill();
      breath?.kill();
      const all = [rig, stage, ...stage.querySelectorAll("*"), ...(fx ? fx.querySelectorAll("*") : [])];
      gsap.killTweensOf(all);
      gsap.set(rig, { clearProps: "transform" });
      stage.replaceChildren();
      parts = null;
      current = null;
    },
  };
}

/* ── carga de los dibujos ─────────────────────────────────────────────────── */

const cache = new Map<PiloSvgMood, Promise<string>>();

/** El SVG en capas de una emoción (una sola descarga por sesión). */
export function loadPiloSvg(m: PiloSvgMood): Promise<string> {
  let p = cache.get(m);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}pilo-svg/${m}.svg`).then((r) => {
      if (!r.ok) throw new Error(`pilo-svg ${m}: ${r.status}`);
      return r.text();
    });
    p.catch(() => cache.delete(m));
    cache.set(m, p);
  }
  return p;
}

/* ── el componente ────────────────────────────────────────────────────────── */

export const PiloSvgMoji = forwardRef<
  PiloSvgMojiHandle,
  {
    size?: number | string;
    /** Sigue el puntero con la mirada. */
    track?: boolean;
    /** Mira alrededor sola cuando nadie mueve el puntero. */
    idle?: boolean;
    /** Respira suave. */
    alive?: boolean;
    mood?: PiloSvgMood;
    talking?: boolean;
    label?: string;
    className?: string;
  }
>(function PiloSvgMoji({ size = 96, track = false, idle = false, alive = false, mood = "emocionado", talking = false, label, className }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const rigEl = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const api = useRef<PiloSvgRig | null>(null);
  const props = useRef({ mood, talking, alive });
  props.current = { mood, talking, alive };
  const prefix = `pm${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;

  useLayoutEffect(() => {
    if (!root.current || !rigEl.current || !stage.current) return;
    const rig = createPiloSvgRig(root.current, rigEl.current, stage.current, fx.current, { load: loadPiloSvg, prefix, track, idle });
    api.current = rig;
    rig.mood(props.current.mood);
    rig.talk(props.current.talking);
    rig.breathe(props.current.alive);
    // Las demás emociones se descargan en segundo plano: el primer cambio no espera.
    const warm = window.setTimeout(() => PILO_SVG_MOODS.forEach((m) => void loadPiloSvg(m).catch(() => undefined)), 1200);
    return () => {
      window.clearTimeout(warm);
      rig.destroy();
      api.current = null;
    };
  }, [track, idle, prefix]);

  useImperativeHandle(ref, () => ({
    look: (nx, ny) => api.current?.look(nx, ny, true),
    talk: (on) => api.current?.talk(on),
    mood: (m) => api.current?.mood(m),
    blink: () => api.current?.blink(),
    nod: () => api.current?.nod(),
    el: () => root.current,
  }));

  useEffect(() => {
    api.current?.mood(mood);
  }, [mood]);

  useEffect(() => {
    api.current?.talk(talking);
  }, [talking]);

  useEffect(() => {
    api.current?.breathe(alive);
  }, [alive]);

  return (
    <div
      ref={root}
      className={className ? `pilo-svg-moji ${className}` : "pilo-svg-moji"}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="pilo-svg-moji__shadow" />
      <div ref={rigEl} className="pilo-svg-moji__rig">
        <div ref={stage} className="pilo-svg-moji__stage" />
      </div>
      <div ref={fx} className="pilo-svg-moji__fx">
        {STARS.map(([x, y, s], i) => (
          <svg key={i} className="pilo-svg-moji__star" viewBox="-10 -10 20 20" style={{ left: `${x}%`, top: `${y}%`, width: `${s}%`, height: `${s}%` }} focusable="false">
            <path d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z" />
          </svg>
        ))}
      </div>
    </div>
  );
});

/* Dónde salen los destellos (x %, y %, tamaño %). */
const STARS: [number, number, number][] = [
  [4, 14, 12],
  [84, 6, 10],
  [90, 42, 8],
];
