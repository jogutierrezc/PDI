/* =============================================================================
   Pregúntele a Pilo · el texto de una respuesta.

   Se parte en párrafos, frases y piezas (palabras, espacios y citas [n]) para
   dos cosas:
     · la escritura: una respuesta nueva aparece palabra por palabra, con un
       cursor, en a lo sumo 2,4 s (más corta, más rápida por palabra); un clic
       sobre el texto la completa. Con movimiento reducido llega entera;
     · la lectura: Pilo lee frase por frase y la frase que suena se resalta.
   Las citas se escriben como botones que abren su fuente, igual que antes.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { AskSource } from "../../components/pilo/ai/client";

export interface Piece {
  kind: "word" | "space" | "cite";
  value: string;
  /** Orden entre las piezas visibles (palabras y citas), para la escritura. */
  order: number;
}

export interface Sentence {
  pieces: Piece[];
  /** El texto que se lee en voz alta: sin las citas. */
  spoken: string;
}

export interface Parsed {
  paragraphs: Sentence[][];
  sentences: Sentence[];
  /** Cuántas piezas visibles tiene (palabras y citas). */
  count: number;
}

/** Parte la respuesta. Las citas [n] se quedan en la frase que las lleva. */
export function parseAnswer(text: string): Parsed {
  let order = 0;
  const sentences: Sentence[] = [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((para) => {
      // Una frase termina en . ! ? … (tras una cita, si la hay) seguidos de espacio.
      const chunks = para.split(/(?<=[.!?…])\s+(?=[^\s[])/);
      return chunks.map((chunk) => {
        const pieces: Piece[] = [];
        for (const m of chunk.matchAll(/(\[\d+\])|(\s+)|([^\s[]+|\[(?!\d+\]))/g)) {
          if (m[1]) pieces.push({ kind: "cite", value: m[1].slice(1, -1), order: order++ });
          else if (m[2]) pieces.push({ kind: "space", value: " ", order: -1 });
          else pieces.push({ kind: "word", value: m[0], order: order++ });
        }
        const sentence: Sentence = {
          pieces,
          spoken: pieces
            .filter((p) => p.kind !== "cite")
            .map((p) => p.value)
            .join("")
            .replace(/\s+([.,;:])/g, "$1")
            .trim(),
        };
        sentences.push(sentence);
        return sentence;
      });
    });
  return { paragraphs, sentences, count: order };
}

/** La escritura: cuántas piezas se ven. `run` false = todo visible. */
export function useTypewriter(count: number, run: boolean, onDone?: () => void) {
  const [shown, setShown] = useState(run ? 0 : count);
  const tween = useRef<gsap.core.Tween | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!run) {
      setShown(count);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || count === 0) {
      setShown(count);
      done.current?.();
      return;
    }
    const state = { n: 0 };
    setShown(0);
    tween.current = gsap.to(state, {
      n: count,
      duration: Math.min(2.4, Math.max(0.5, count * 0.034)),
      ease: "none",
      onUpdate: () => setShown(Math.floor(state.n)),
      onComplete: () => {
        setShown(count);
        done.current?.();
      },
    });
    return () => {
      tween.current?.kill();
      tween.current = null;
    };
  }, [count, run]);
  const finish = () => {
    if (!tween.current?.isActive()) return;
    tween.current.progress(1);
  };
  return { shown, typing: shown < count, finish };
}

export function AnswerText({
  parsed,
  shown,
  typing,
  reading,
  sources,
  active,
  onSource,
  onFinish,
}: {
  parsed: Parsed;
  shown: number;
  typing: boolean;
  /** La frase que suena, o null. */
  reading: number | null;
  sources: AskSource[];
  active: number | null;
  onSource: (n: number, trigger: HTMLElement) => void;
  onFinish: () => void;
}) {
  const index = useMemo(() => new Map(parsed.sentences.map((s, i) => [s, i])), [parsed]);
  let caretPlaced = false;
  return (
    <div className="ap-a__text" data-typing={typing || undefined} onClick={typing ? onFinish : undefined}>
      {parsed.paragraphs.map((sentences, pi) => {
        const visible = sentences.some((s) => s.pieces.some((p) => p.order >= 0 && p.order < shown));
        if (!visible) return null;
        return (
          <p key={pi}>
            {sentences.map((s, si) => {
              const k = index.get(s)!;
              const nodes = s.pieces.map((p, j) => {
                if (p.kind === "space") {
                  // Un espacio se ve si la pieza anterior ya se ve.
                  const prev = s.pieces[j - 1];
                  return prev && prev.order < shown ? " " : null;
                }
                if (p.order >= shown) return null;
                if (p.kind === "word") return <span key={j}>{p.value}</span>;
                const n = Number(p.value);
                const src = sources.find((x) => x.n === n);
                if (!src) return null;
                return (
                  <button key={j} type="button" className="ap-cite" aria-pressed={active === n} aria-label={`Fuente ${n}: ${src.title}`} onClick={(e) => { e.stopPropagation(); onSource(n, e.currentTarget); }}>
                    {n}
                  </button>
                );
              });
              // El cursor va justo después de la última pieza escrita.
              const endsHere = typing && !caretPlaced && s.pieces.some((p) => p.order === shown - 1);
              if (endsHere) caretPlaced = true;
              return (
                <span key={si} className="ap-sent" data-reading={reading === k || undefined}>
                  {nodes}
                  {endsHere && <i className="ap-caret" aria-hidden="true" />}
                  {si < sentences.length - 1 ? " " : null}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
