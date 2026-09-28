/* =============================================================================
   Mr. Pilo · el Animoji.

   La misma cara de siempre, dibujada por capas (pelo, cejas, ojos, gafas y
   pico con la mandíbula aparte) para que cada parte se mueva por su cuenta,
   como un Animoji:
     · gira la cabeza en 3D hacia donde mira, y las capas se desplazan a
       distinta profundidad (parallax); el brillo de la piel va al revés,
       como si hubiera una luz fija;
     · las pupilas siguen el puntero (con `track`) o miran a donde se les
       diga (`look`); parpadea sola cada pocos segundos;
     · abre y cierra el pico mientras habla (`talk`), con un ritmo desigual,
       como sílabas;
     · cambia de gesto con las cejas y el tamaño de las pupilas (`mood`).

   Lo mueve GSAP. Con movimiento reducido: sin respiración ni giros amplios;
   el parpadeo y el pico se quedan, que no desplazan nada.

   Hoy lo usa «Pregúntele a Pilo». Las expresiones de siempre (PiloAvatar,
   public/pilo-moods) siguen en el resto de los portales.
   ========================================================================== */

import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import "./pilo-moji.css";

export type MojiMood = "feliz" | "atento" | "piensa" | "sorpresa" | "duda" | "cuidado";

export interface PiloMojiHandle {
  /** Mira hacia nx, ny (−1 a 1). */
  look: (nx: number, ny: number) => void;
  talk: (on: boolean) => void;
  mood: (m: MojiMood) => void;
  blink: () => void;
  /** Un asentimiento corto. */
  nod: () => void;
  /** El elemento, para medirlo o moverlo. */
  el: () => HTMLDivElement | null;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

/* Cejas (y izquierda, y derecha, giro) y escala de las pupilas por gesto. */
const MOODS: Record<MojiMood, [number, number, number, number]> = {
  feliz: [-6, -6, 0, 1],
  atento: [0, 0, 0, 1],
  piensa: [-12, 2, -6, 1],
  sorpresa: [-14, -14, 0, 0.8],
  duda: [4, -10, 4, 1],
  cuidado: [6, 6, 10, 0.9],
};

export const PiloMoji = forwardRef<
  PiloMojiHandle,
  {
    size?: number | string;
    /** Sigue el puntero con la mirada. */
    track?: boolean;
    /** Mira alrededor sola cuando nadie mueve el puntero. */
    idle?: boolean;
    /** Respira suave. */
    alive?: boolean;
    mood?: MojiMood;
    talking?: boolean;
    label?: string;
    className?: string;
  }
>(function PiloMoji({ size = 96, track = false, idle = false, alive = false, mood = "feliz", talking = false, label, className }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  const api = useRef<PiloMojiHandle | null>(null);
  const hold = useRef(false);
  const raw = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${raw}`;

  useLayoutEffect(() => {
    const node = root.current;
    const rigEl = rig.current;
    if (!node || !rigEl) return;
    const q = <T extends Element>(s: string) => node.querySelector<T>(s)!;
    const parts = {
      hair: q(".pm-hair"),
      glasses: q(".pm-glasses"),
      eyes: q(".pm-eyes"),
      brows: q(".pm-brows"),
      beak: q(".pm-beak"),
      spec: q(".pm-spec"),
      pupils: node.querySelectorAll(".pm-pupil"),
      eyeL: q(".pm-eye-l"),
      eyeR: q(".pm-eye-r"),
      jaw: q(".pm-jaw"),
      browL: q(".pm-brow-l"),
      browR: q(".pm-brow-r"),
    };
    let talkTl: gsap.core.Timeline | null = null;
    const timers: number[] = [];
    let lastMove = 0;

    const ctx = gsap.context(() => {
      gsap.set(rigEl, { transformPerspective: 900, transformOrigin: "50% 55%" });
      gsap.set([parts.eyeL, parts.eyeR], { transformOrigin: "50% 50%" });
    }, node);

    const T = (d: number) => ({ duration: d, ease: "power3.out" });
    const to = {
      ry: gsap.quickTo(rigEl, "rotationY", T(0.7)),
      rx: gsap.quickTo(rigEl, "rotationX", T(0.7)),
      hairX: gsap.quickTo(parts.hair, "x", T(0.8)),
      hairY: gsap.quickTo(parts.hair, "y", T(0.8)),
      glX: gsap.quickTo(parts.glasses, "x", T(0.6)),
      glY: gsap.quickTo(parts.glasses, "y", T(0.6)),
      eyX: gsap.quickTo(parts.eyes, "x", T(0.6)),
      eyY: gsap.quickTo(parts.eyes, "y", T(0.6)),
      bkX: gsap.quickTo(parts.beak, "x", T(0.6)),
      bkY: gsap.quickTo(parts.beak, "y", T(0.6)),
      brX: gsap.quickTo(parts.brows, "x", T(0.7)),
      spX: gsap.quickTo(parts.spec, "x", T(0.9)),
      spY: gsap.quickTo(parts.spec, "y", T(0.9)),
      puX: [...parts.pupils].map((p) => gsap.quickTo(p, "x", { duration: 0.25, ease: "power3.out" })),
      puY: [...parts.pupils].map((p) => gsap.quickTo(p, "y", { duration: 0.25, ease: "power3.out" })),
    };

    const look = (nx: number, ny: number) => {
      nx = Math.max(-1, Math.min(1, nx));
      ny = Math.max(-1, Math.min(1, ny));
      const turn = reduced() ? 0.35 : 1;
      to.ry(nx * 16 * turn);
      to.rx(-ny * 10 * turn);
      to.hairX(-nx * 6);
      to.hairY(-ny * 4);
      to.glX(nx * 9);
      to.glY(ny * 6);
      to.eyX(nx * 7);
      to.eyY(ny * 5);
      to.bkX(nx * 12);
      to.bkY(ny * 6);
      to.brX(nx * 7);
      to.spX(-nx * 26);
      to.spY(-ny * 18);
      to.puX.forEach((f) => f(nx * 9));
      to.puY.forEach((f) => f(ny * 8));
    };
    const blink = () => gsap.to([parts.eyeL, parts.eyeR], { scaleY: 0.08, duration: 0.07, ease: "power2.in", yoyo: true, repeat: 1 });
    const talk = (on: boolean) => {
      talkTl?.kill();
      talkTl = null;
      if (!on) {
        gsap.to(parts.jaw, { rotation: 0, svgOrigin: "272 296", duration: 0.12, ease: "power2.out" });
        return;
      }
      talkTl = gsap.timeline({ repeat: -1 });
      for (let i = 0; i < 6; i++) {
        const a = 6 + Math.random() * 16;
        const d = 0.06 + Math.random() * 0.06;
        talkTl
          .to(parts.jaw, { rotation: a, svgOrigin: "272 296", duration: d, ease: "power2.out" })
          .to(parts.jaw, { rotation: 1, svgOrigin: "272 296", duration: d, ease: "power2.in" });
      }
    };
    const setMood = (m: MojiMood) => {
      const [l, r, rot, pupil] = MOODS[m];
      gsap.to(parts.browL, { y: l, rotation: rot, svgOrigin: "150 150", duration: 0.35, ease: "back.out(2)" });
      gsap.to(parts.browR, { y: r, rotation: -rot, svgOrigin: "280 150", duration: 0.35, ease: "back.out(2)" });
      gsap.to(parts.pupils, { scale: pupil, transformOrigin: "50% 50%", duration: 0.3 });
    };
    const nod = () => {
      if (reduced()) return;
      gsap.to(rigEl, { rotationX: 14, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1 });
    };

    api.current = {
      look: (nx, ny) => {
        hold.current = true;
        look(nx, ny);
        window.setTimeout(() => (hold.current = false), 2200);
      },
      talk,
      mood: setMood,
      blink,
      nod,
      el: () => root.current,
    };

    // Parpadeo propio.
    const blinkLoop = () => {
      timers.push(
        window.setTimeout(() => {
          blink();
          blinkLoop();
        }, 2200 + Math.random() * 3200),
      );
    };
    blinkLoop();

    // Seguir el puntero.
    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      if (!r.width) return;
      lastMove = performance.now();
      if (hold.current) return;
      look((e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.45), (e.clientY - (r.top + r.height * 0.45)) / (window.innerHeight * 0.5));
    };
    if (track && finePointer()) window.addEventListener("pointermove", onMove, { passive: true });

    // Mirar alrededor sola.
    const idleLoop = () => {
      timers.push(
        window.setTimeout(() => {
          if (!hold.current && performance.now() - lastMove > 2500) look(Math.random() * 1.4 - 0.7, Math.random() * 0.8 - 0.4);
          idleLoop();
        }, 1800 + Math.random() * 1600),
      );
    };
    if (idle) idleLoop();

    return () => {
      window.removeEventListener("pointermove", onMove);
      timers.forEach((t) => window.clearTimeout(t));
      talkTl?.kill();
      gsap.killTweensOf([rigEl, ...Object.values(parts).flatMap((p) => (p instanceof NodeList ? [...p] : [p]))]);
      ctx.revert();
      api.current = null;
    };
  }, [track, idle]);

  useImperativeHandle(ref, () => ({
    look: (nx, ny) => api.current?.look(nx, ny),
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
    const el = rig.current;
    if (!el || !alive || reduced()) return;
    const tween = gsap.to(el, { y: -4, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return () => {
      tween.kill();
      gsap.set(el, { y: 0 });
    };
  }, [alive]);

  return (
    <div
      ref={root}
      className={className ? `pilo-moji ${className}` : "pilo-moji"}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="pilo-moji__shadow" />
      <div ref={rig} className="pilo-moji__rig">
        <svg viewBox="0 0 400 400" focusable="false">
          <defs>
            <radialGradient id={id("skin")} cx="38%" cy="32%" r="78%">
              <stop offset="0" stopColor="#fbd9b8" />
              <stop offset=".55" stopColor="#f0b98d" />
              <stop offset="1" stopColor="#d98c5f" />
            </radialGradient>
            <radialGradient id={id("hair")} cx="35%" cy="30%" r="80%">
              <stop offset="0" stopColor="#d9733d" />
              <stop offset=".6" stopColor="#b3521f" />
              <stop offset="1" stopColor="#7f3412" />
            </radialGradient>
            <linearGradient id={id("beak")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6f7f9" />
              <stop offset=".55" stopColor="#cfd4da" />
              <stop offset="1" stopColor="#9aa2ab" />
            </linearGradient>
            <linearGradient id={id("jaw")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c7cdd4" />
              <stop offset="1" stopColor="#8e969f" />
            </linearGradient>
            <radialGradient id={id("iris")} cx="40%" cy="35%" r="70%">
              <stop offset="0" stopColor="#8a5a36" />
              <stop offset="1" stopColor="#3b2214" />
            </radialGradient>
            <linearGradient id={id("frame")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff9a3c" />
              <stop offset="1" stopColor="#e5680f" />
            </linearGradient>
            <filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
            <clipPath id={id("head")}>
              <circle cx="205" cy="215" r="146" />
            </clipPath>
          </defs>
          <g>
            <circle cx="205" cy="215" r="148" fill={`url(#${id("skin")})`} stroke="#3a1f14" strokeWidth="7" />
            <g clipPath={`url(#${id("head")})`}>
              <ellipse className="pm-spec" cx="150" cy="150" rx="70" ry="44" fill="#fff" opacity=".35" filter={`url(#${id("soft")})`} />
              <ellipse cx="322" cy="292" rx="26" ry="14" fill="#f2877a" opacity=".45" filter={`url(#${id("soft")})`} />
            </g>
          </g>
          <g className="pm-hair" stroke="#3a1f14" strokeWidth="6" fill={`url(#${id("hair")})`}>
            <circle cx="112" cy="140" r="38" />
            <circle cx="300" cy="104" r="40" />
            <circle cx="148" cy="96" r="44" />
            <circle cx="258" cy="74" r="46" />
            <circle cx="204" cy="64" r="50" />
            <circle cx="178" cy="122" r="36" />
            <circle cx="238" cy="116" r="38" />
            <path d="M150 84 q14 -12 30 -4 M232 58 q16 -8 30 4 M96 130 q10 -12 24 -8" fill="none" stroke="#f0a070" strokeWidth="5" strokeLinecap="round" opacity=".7" />
          </g>
          <g className="pm-brows" fill="none" stroke="#6d2c10" strokeWidth="12" strokeLinecap="round">
            <path className="pm-brow-l" d="M114 156 Q150 138 186 152" />
            <path className="pm-brow-r" d="M244 152 Q282 138 316 156" />
          </g>
          <g className="pm-eyes">
            {[150, 282].map((cx) => (
              <g key={cx} className={cx === 150 ? "pm-eye pm-eye-l" : "pm-eye pm-eye-r"}>
                <ellipse cx={cx} cy="218" rx="31" ry="34" fill="#fff" stroke="#3a1f14" strokeWidth="5" />
                <g className="pm-pupil">
                  <circle cx={cx} cy="222" r="18" fill={`url(#${id("iris")})`} />
                  <circle cx={cx} cy="222" r="10" fill="#150b06" />
                  <circle cx={cx - 7} cy="214" r="6" fill="#fff" />
                  <circle cx={cx + 7} cy="229" r="2.6" fill="#fff" opacity=".8" />
                </g>
              </g>
            ))}
          </g>
          <g className="pm-glasses">
            <rect x="92" y="172" width="116" height="92" rx="32" fill="rgba(255,255,255,.12)" stroke={`url(#${id("frame")})`} strokeWidth="13" />
            <rect x="224" y="172" width="116" height="92" rx="32" fill="rgba(255,255,255,.12)" stroke={`url(#${id("frame")})`} strokeWidth="13" />
            <path d="M208 206 Q216 196 224 206" fill="none" stroke="#ec7418" strokeWidth="12" strokeLinecap="round" />
            <path d="M340 200 L352 196" stroke="#ec7418" strokeWidth="12" strokeLinecap="round" />
            <path d="M110 196 L130 184 M236 196 L256 184" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".55" />
          </g>
          <g className="pm-beak">
            <path d="M186 322 C220 318 252 314 272 296 C278 332 244 366 204 366 C184 366 176 346 186 322 Z" fill="#9c2f14" stroke="#3a1f14" strokeWidth="6" />
            <ellipse cx="226" cy="348" rx="24" ry="9" fill="#ef7a4f" />
            <path className="pm-jaw" d="M186 322 C220 318 252 314 272 296 C272 322 242 350 206 352 C188 352 180 340 186 322 Z" fill={`url(#${id("jaw")})`} stroke="#3a1f14" strokeWidth="6" strokeLinejoin="round" />
            <path d="M272 292 C250 262 190 256 150 272 C112 288 96 326 108 364 C111 374 122 374 124 364 C128 338 150 322 182 318 C218 313 250 310 272 292 Z" fill={`url(#${id("beak")})`} stroke="#3a1f14" strokeWidth="7" strokeLinejoin="round" />
            <path d="M150 284 C172 272 206 270 236 278" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".7" />
            <circle cx="238" cy="288" r="3.5" fill="#6b727a" />
          </g>
        </svg>
      </div>
    </div>
  );
});
