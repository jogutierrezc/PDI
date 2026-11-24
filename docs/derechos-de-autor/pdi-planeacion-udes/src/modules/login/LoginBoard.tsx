/* =============================================================================
   Acceso · piezas animadas de la zona de marca (GSAP).

   - ArrivalsBoard: el «tablero de llegadas». Cada letra gira como una paleta y
     aterriza con un destello ámbar. La fila grande responde al formulario.
   - FlowCanvas: líneas de ruta que ondulan despacio detrás del titular.
   - useZoneParallax: el fondo, el tablero y el titular se desplazan en
     distinta medida con el puntero (solo puntero fino).

   Con «reducir movimiento» el texto aparece directo y el fondo queda quieto.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import gsap from "gsap";

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./Ñ";
const CELLS = 16;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function pad(text: string): string {
  const upper = text.toUpperCase();
  return (upper + " ".repeat(CELLS)).slice(0, CELLS);
}

/** Una fila de paletas que se reacomoda cuando cambia el texto. */
function FlapRow({ text, flash = false, delay = 0 }: { text: string; flash?: boolean; delay?: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const shown = useRef<string[]>(Array(CELLS).fill(" "));

  useEffect(() => {
    const cells = Array.from(host.current?.children ?? []) as HTMLElement[];
    const target = pad(text);
    const reduce = prefersReducedMotion();
    const tweens: gsap.core.Tween[] = [];

    cells.forEach((cell, i) => {
      const ch = CHARS.includes(target[i]) ? target[i] : " ";
      if (shown.current[i] === ch) return;
      shown.current[i] = ch;
      if (reduce) {
        cell.textContent = ch;
        return;
      }
      const to = CHARS.indexOf(ch);
      const turns = 5 + Math.floor(Math.random() * 7);
      const progress = { t: 0 };
      tweens.push(
        gsap.to(progress, {
          t: 1,
          duration: 0.26 + turns * 0.028,
          delay: delay + i * 0.028,
          ease: "none",
          onUpdate: () => {
            cell.textContent = CHARS[(to - turns + Math.floor(progress.t * turns) + CHARS.length * 3) % CHARS.length];
          },
          onComplete: () => {
            cell.textContent = ch;
            gsap.fromTo(cell, { scaleY: 0.8 }, { scaleY: 1, duration: 0.2, ease: "expo.out", clearProps: "transform" });
            if (flash) gsap.fromTo(cell, { color: "#f6b93f" }, { color: "", duration: 0.7, ease: "power2.out", clearProps: "color" });
          },
        }),
      );
    });

    // Si el texto cambia a mitad de camino, cada paleta se queda en su letra de destino.
    return () => {
      tweens.forEach((tween) => tween.kill());
      cells.forEach((cell, i) => {
        cell.textContent = shown.current[i];
      });
    };
  }, [text, flash, delay]);

  return (
    <span className="lg-cells" ref={host}>
      {Array.from({ length: CELLS }, (_, i) => (
        <span className="lg-cell" key={i}>
          {" "}
        </span>
      ))}
    </span>
  );
}

const MODULES: Array<{ tag: string; a: string; b: string }> = [
  { tag: "PDI", a: "PLAN 2024-2028", b: "SEGUIMIENTO" },
  { tag: "UC", a: "UDES EN CIFRAS", b: "INFORMES" },
  { tag: "RK", a: "RANKINGS ODS", b: "THE IMPACT" },
  { tag: "MA", a: "MONITOR ALERTAS", b: "ALERTA TEMPRANA" },
];

export type BoardTone = "neutral" | "error" | "ok";

export function ArrivalsBoard({ text, tone, boardRef }: { text: string; tone: BoardTone; boardRef: RefObject<HTMLDivElement> }) {
  const [alt, setAlt] = useState(false);
  const [lap, setLap] = useState(0);

  // Una fila de módulos cambia de rótulo cada tanto: el tablero se siente vivo.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setLap((n) => n + 1);
      setAlt((v) => !v);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="lg-board" ref={boardRef} aria-hidden="true">
      <div className="lg-board__head">
        <span>
          <i />
          Planeación Institucional
        </span>
        <span>PDI 2024-2028</span>
      </div>
      <div className="lg-row lg-row--status" data-tone={tone}>
        <span className="lg-tag">ACC</span>
        <FlapRow text={text} flash />
      </div>
      {MODULES.map((mod, i) => {
        // Cada módulo cambia en su turno; el resto conserva su rótulo.
        const flipped = alt && lap % MODULES.length === i;
        return (
          <div className="lg-row lg-row--module" key={mod.tag}>
            <span className="lg-tag">{mod.tag}</span>
            <FlapRow text={flipped ? mod.b : mod.a} delay={0.2 + i * 0.12} />
          </div>
        );
      })}
    </div>
  );
}

/** Líneas de ruta: ondas lentas, pocas en verde azulado. */
export function FlowCanvas({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement> }) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const LINES = 16;
    let w = 0;
    let h = 0;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < LINES; i++) {
        const k = i / (LINES - 1);
        const base = h * (0.08 + k * 0.9);
        const amp = 14 + k * 30;
        const hot = i % 5 === 2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 10) {
          const y = base + Math.sin(x * 0.0042 + t * 0.00022 * (1 + k * 0.6) + i * 0.7) * amp + Math.sin(x * 0.012 - t * 0.00031 + i) * 5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hot ? "rgba(55,182,196,0.34)" : `rgba(92,155,242,${0.08 + k * 0.14})`;
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.stroke();
      }
    };

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const tick = (time: number) => {
      t = time * 1000;
      if (!document.hidden) draw();
    };
    if (!prefersReducedMotion()) gsap.ticker.add(tick);
    return () => {
      observer.disconnect();
      gsap.ticker.remove(tick);
    };
  }, [canvasRef]);

  return <canvas ref={canvasRef} className="lg-flow" />;
}

/** El fondo, el tablero y el titular se mueven distinto con el puntero. */
export function useZoneParallax(
  zone: RefObject<HTMLElement>,
  layers: Array<{ ref: RefObject<HTMLElement>; pull: number; invert?: boolean }>,
) {
  useEffect(() => {
    const host = zone.current;
    if (!host || prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const movers = layers
      .filter((layer) => layer.ref.current)
      .map((layer) => ({
        x: gsap.quickTo(layer.ref.current!, "x", { duration: 0.7, ease: "power3.out" }),
        y: gsap.quickTo(layer.ref.current!, "y", { duration: 0.7, ease: "power3.out" }),
        pull: layer.invert ? -layer.pull : layer.pull,
      }));
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      movers.forEach((m) => {
        m.x(nx * m.pull);
        m.y(ny * m.pull);
      });
    };
    const leave = () => movers.forEach((m) => {
      m.x(0);
      m.y(0);
    });
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
    // Las capas son refs estables: se enlazan una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);
}
