/* =============================================================================
   Paleta partida.

   Cada carácter vive en su propia celda con dos mitades y una bisagra. Para
   pasar de un carácter a otro la celda recorre los intermedios del juego de
   caracteres, como un tablero real: la hoja de arriba cae, la de abajo sube y
   se asienta con un rebote. Los primeros pasos van rápidos y el último lento:
   la masa de la paleta, no un contador que salta al valor.

   · El valor completo va en aria-label; las celdas son decorado.
   · Con prefers-reduced-motion la cifra se escribe directamente.
   · Nada voltea hasta que el tablero entra en pantalla: la llegada se ve.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useInView, usePrefersReducedMotion } from "./motion";

const CHARSET = " ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789.,%+−—·";
const DIGITS = " 0123456789.,%+−—";

/** Pasos máximos por celda: más largo aburre, más corto no se lee como tablero. */
const MAX_STEPS = 9;

function sequence(from: string, to: string, numeric: boolean, jitter: number): string[] {
  if (from === to) return [];
  const set = numeric && DIGITS.includes(to) && DIGITS.includes(from) ? DIGITS : CHARSET;
  const start = Math.max(0, set.indexOf(from));
  const end = set.indexOf(to);
  if (end < 0) return [to];

  const distance = (end - start + set.length) % set.length || set.length;
  const steps = Math.min(distance, MAX_STEPS - 2 + jitter);
  const out: string[] = [];
  for (let i = steps - 1; i >= 1; i -= 1) {
    out.push(set[(end - i + set.length) % set.length]);
  }
  out.push(to);
  return out;
}

/** Duración de cada paso: arranque, crucero y asentamiento. */
function stepDuration(index: number, total: number): number {
  if (total === 1) return 260;
  if (index === total - 1) return 240;
  if (index === 0) return 120;
  return 64;
}

interface CellState {
  shown: string;
  next: string;
  step: number;
  duration: number;
  /** Recién asentada: la tinta pasa un instante a ámbar, la señal de llegada. */
  arrived?: boolean;
}

function FlapCell({ char, delay, numeric, jitter }: { char: string; delay: number; numeric: boolean; jitter: number }) {
  const [state, setState] = useState<CellState>({ shown: " ", next: " ", step: -1, duration: 0 });
  const shownRef = useRef(" ");

  useEffect(() => {
    const steps = sequence(shownRef.current, char, numeric, jitter);
    if (steps.length === 0) return;

    const timers: number[] = [];
    let at = delay;
    let from = shownRef.current;

    steps.forEach((target, index) => {
      const duration = stepDuration(index, steps.length);
      const source = from;
      timers.push(
        window.setTimeout(() => {
          // Si se interrumpe aquí, la celda descansa en el carácter que ya cae.
          shownRef.current = target;
          setState({ shown: source, next: target, step: index, duration });
        }, at),
      );
      at += duration;
      from = target;
    });

    timers.push(
      window.setTimeout(() => {
        setState({ shown: char, next: char, step: -1, duration: 0, arrived: char.trim() !== "" });
      }, at),
      window.setTimeout(() => {
        setState((s) => (s.step === -1 ? { ...s, arrived: false } : s));
      }, at + 650),
    );

    // Si el valor cambia a mitad de camino, el siguiente recorrido sale de lo
    // que se está viendo, no del principio.
    return () => {
      timers.forEach(window.clearTimeout);
      const rest = shownRef.current;
      setState({ shown: rest, next: rest, step: -1, duration: 0 });
    };
  }, [char, delay, numeric, jitter]);

  const flipping = state.step >= 0;
  const style = { "--flap-dur": `${state.duration}ms` } as CSSProperties;

  return (
    <span className="flap" style={style} data-flipping={flipping || undefined} data-arrived={state.arrived || undefined}>
      <span className="flap__half flap__half--top">
        <span>{flipping ? state.next : state.shown}</span>
      </span>
      <span className="flap__half flap__half--bottom">
        <span>{state.shown}</span>
      </span>
      {flipping && (
        <>
          <span key={`t${state.step}${state.next}`} className="flap__leaf flap__leaf--top">
            <span>{state.shown}</span>
          </span>
          <span
            key={`b${state.step}${state.next}`}
            className={`flap__leaf flap__leaf--bottom${state.step >= 0 && state.duration >= 200 ? " is-settling" : ""}`}
          >
            <span>{state.next}</span>
          </span>
        </>
      )}
    </span>
  );
}

function StaticCell({ char }: { char: string }) {
  return (
    <span className="flap">
      <span className="flap__half flap__half--top">
        <span>{char}</span>
      </span>
      <span className="flap__half flap__half--bottom">
        <span>{char}</span>
      </span>
    </span>
  );
}

export type FlapSize = "xs" | "sm" | "md" | "lg" | "xl";

interface SplitFlapProps {
  value: string;
  /** Número de celdas. Si el valor es más corto se rellena con celdas vacías. */
  length?: number;
  align?: "start" | "end";
  size?: FlapSize;
  /** Retardo de arranque, para que filas distintas lleguen en ola. */
  delay?: number;
  /** Separación entre celdas consecutivas. */
  stagger?: number;
  /** Texto accesible. Por defecto, el propio valor. */
  label?: string;
  numeric?: boolean;
  className?: string;
}

export function SplitFlap({
  value,
  length,
  align = "start",
  size = "md",
  delay = 0,
  stagger = 38,
  label,
  numeric = false,
  className = "",
}: SplitFlapProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const armed = useInView(ref, "0px 0px -8% 0px");

  const text = value.toUpperCase();
  const cells = Math.max(length ?? text.length, text.length);
  const padded = align === "end" ? text.padStart(cells, " ") : text.padEnd(cells, " ");
  const chars = Array.from(padded);

  return (
    <span
      ref={ref}
      className={`split-flap split-flap--${size} ${className}`.trim()}
      role="img"
      aria-label={label ?? value}
    >
      {chars.map((char, index) =>
        reduced ? (
          <StaticCell key={index} char={char} />
        ) : (
          <FlapCell
            key={index}
            char={armed ? char : " "}
            delay={delay + index * stagger}
            numeric={numeric}
            jitter={(index * 7 + text.length) % 3}
          />
        ),
      )}
    </span>
  );
}
