/* =============================================================================
   Mr. Pilo · la app móvil · un turno: la pregunta y lo que responde Pilo.

   La cara de Pilo va junto a cada respuesta. Mientras piensa, se lee el paso
   en el que va, en palabras (los que reporta el servidor, nunca inventados);
   la respuesta se escribe a medida que llega; al terminar aparecen sus
   fuentes, «Escuchar», «Copiar» y los votos, como en la página.

   La lectura es con la voz oficial o no es (official-voice.ts): frase por
   frase, con la que suena resaltada. Si la voz no está disponible, avisa una
   vez y queda el texto.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { AskKind, AskMeta, AskSource } from "../../components/pilo/ai/client";
import { enrichSpokenSentences } from "../../components/pilo/ai/voice-expressions";
import { Pilo } from "../pregunta/Pilo";
import type { MojiMood } from "../pregunta/Pilo";
import type { Turn } from "../pregunta/store";
import { AnswerText, parseAnswer, useTypewriter } from "../pregunta/AnswerText";
import { toPlain } from "../pregunta/markdown";
import { notesOf, showsSources, waitingLine } from "../pregunta/answer-state";
import type { ThinkStep } from "../pregunta/answer-state";
import type { AppVoice } from "./access";
import { prefetchOfficial, sayOfficial, stopOfficial } from "./official-voice";
import { reducedMotion } from "./pwa";
import { Icon } from "./icons";

/** Lo que se ve de una respuesta mientras el servidor la escribe. No se guarda. */
export interface Live {
  turnId: string;
  text: string;
  meta: AskMeta | null;
  steps: ThinkStep[];
  startedAt: number;
}

export interface TurnVoice extends AppVoice {
  rol?: string;
  mood?: string;
}

const MOOD_OF: Record<AskKind, MojiMood> = { memoria: "feliz", extracto: "atento", ia: "feliz", regla: "cuidado", nada: "duda", curada: "feliz", capciosa: "cuidado", malla: "feliz", dato: "feliz" };

/** Una entrada corta: termina visible aunque algo la interrumpa. */
function useEnter(ref: React.RefObject<HTMLElement>, run: boolean, key: unknown = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!run || !el || reducedMotion()) return;
    const tween = gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.22, ease: "expo.out", clearProps: "opacity,transform" });
    return () => {
      tween.progress(1).kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, key]);
}

/** Los segundos que lleva pensando; solo corre mientras `on`. */
function useElapsed(startedAt: number | undefined, on: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return startedAt ? (Date.now() - startedAt) / 1000 : 0;
}

export function AppTurn({
  turn,
  stream,
  fresh,
  animate,
  autoRead,
  voice,
  expression,
  onTyped,
  onRetry,
  onVote,
  onSources,
  onSound,
  onVoiceLost,
}: {
  turn: Turn;
  /** Lo que el servidor va mandando de este turno, mientras lo escribe. */
  stream: Live | null;
  fresh: "entera" | "en vivo" | undefined;
  /** Nació en esta visita: entra animado. Lo guardado, no. */
  animate: boolean;
  autoRead: boolean;
  voice: TurnVoice;
  /** La cara de partida del rol (Enseñanza). */
  expression?: string;
  onTyped: () => void;
  onRetry: () => void;
  onVote: (vote: "up" | "down") => void;
  onSources: (sources: AskSource[], focus: number | null, trigger: HTMLElement) => void;
  /** Pilo suena o calla: la cara de la cabecera mueve el pico con el audio. */
  onSound: (on: boolean) => void;
  onVoiceLost: () => void;
}) {
  const a = turn.answer;
  const pending = !a && !turn.error;
  const streaming = pending && Boolean(stream?.text);
  const working = pending && !streaming;
  const incomplete = Boolean(a && turn.incomplete);
  const text = a?.text ?? stream?.text ?? "";
  const sources = useMemo(() => a?.sources ?? stream?.meta?.sources ?? [], [a, stream?.meta]);
  const parsed = useMemo(() => parseAnswer(text, { streaming }), [text, streaming]);
  const elapsed = useElapsed(stream?.startedAt, working);
  const step = working ? waitingLine({ steps: stream?.steps ?? [], meta: stream?.meta ?? null, seconds: elapsed }) : "";

  const question = useRef<HTMLDivElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const stepText = useRef<HTMLSpanElement>(null);
  useEnter(question, animate);
  useEnter(answer, animate);
  // Cada paso releva al anterior con un fundido corto.
  useLayoutEffect(() => {
    const el = stepText.current;
    if (!step || !el || reducedMotion()) return;
    const tween = gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: "expo.out", clearProps: "opacity,transform" });
    return () => {
      tween.progress(1).kill();
    };
  }, [step]);

  /* --- La voz: frase por frase, la que suena se resalta ----------------------------------- */

  const [reading, setReading] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const readRun = useRef(0);
  const enriched = useMemo(
    () =>
      enrichSpokenSentences(
        parsed.sentences.map((x) => x.spoken),
        { mood: a?.mood ?? voice.mood, expressionsEnabled: voice.expressions, patterns: voice.patterns, modulationEnabled: voice.modulation, baseRate: voice.rate, basePitch: voice.pitch },
      ),
    [parsed, a?.mood, voice.mood, voice.expressions, voice.patterns, voice.modulation, voice.rate, voice.pitch],
  );
  const spoken = enriched.sentences;
  const said = { portal: voice.portal, advanced: voice.advanced, rol: voice.rol };

  // Con la voz encendida, el audio de las primeras frases se pide en cuanto la respuesta está completa.
  useEffect(() => {
    if (a && fresh && autoRead && !incomplete) prefetchOfficial(spoken.slice(0, 2), { portal: voice.portal, advanced: voice.advanced, rol: voice.rol });
  }, [a, fresh, autoRead, incomplete, spoken, voice.advanced, voice.portal, voice.rol]);

  const read = async () => {
    if (reading !== null) {
      readRun.current += 1;
      stopOfficial();
      setReading(null);
      onSound(false);
      return;
    }
    const mine = ++readRun.current;
    for (let k = 0; k < parsed.sentences.length; k++) {
      if (mine !== readRun.current) return;
      if (!spoken[k]?.trim()) continue;
      setReading(k);
      // Mientras suena esta frase, se piden las dos que siguen: así no hay pausas.
      prefetchOfficial(spoken.slice(k + 1, k + 3), said);
      const result = await sayOfficial(spoken[k], { ...said, rate: enriched.rate, onSound: (on) => mine === readRun.current && onSound(on) });
      if (result === "cancelado") break;
      if (result === "sin voz") {
        // Nunca otra voz: se avisa y queda el texto.
        if (mine === readRun.current) onVoiceLost();
        break;
      }
    }
    if (mine === readRun.current) {
      setReading(null);
      onSound(false);
    }
  };

  // Al quitar el turno, su lectura se suelta.
  useEffect(
    () => () => {
      if (readRun.current > 0) onSound(false);
      readRun.current += 1;
    },
    // Solo al desmontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Una respuesta que llega entera se escribe sola, breve; la que se vio escribir en vivo, no.
  const { shown, typing, finish } = useTypewriter(parsed.count, Boolean(a) && fresh === "entera", () => {
    onTyped();
    if (autoRead && !incomplete) void read();
  });

  // La que se escribió en vivo se lee una sola vez, ya completa.
  const readLive = useRef(read);
  readLive.current = read;
  useEffect(() => {
    if (!a || fresh !== "en vivo") return;
    onTyped();
    if (autoRead && !incomplete) void readLive.current();
    // Solo al llegar la respuesta final.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(a), fresh]);

  const copy = async () => {
    try {
      const listed = a && showsSources(a) ? a.sources.map((s) => `[${s.n}] ${s.title}${s.path ? ` · ${/^https?:/i.test(s.path) ? s.path : `${window.location.origin}${s.path}`}` : ""}`) : [];
      await navigator.clipboard.writeText([toPlain(parsed), listed.join("\n")].filter(Boolean).join("\n\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles */
    }
  };

  const notes = a && !incomplete ? notesOf(a) : [];
  const listed = a && showsSources(a) ? a.sources : [];
  const mood: MojiMood = pending ? "piensa" : a ? (incomplete ? "duda" : MOOD_OF[a.kind]) : "cuidado";

  return (
    <>
      <div className="pa-me" ref={question}>
        <span className="pa-sr">Usted: </span>
        {turn.q}
      </div>

      <div className="pa-msg" ref={answer}>
        <div className="pa-msg__face">
          <Pilo size="100%" mood={mood} emotion={pending ? undefined : a?.expression || a?.mood || expression} talking={reading !== null} />
        </div>
        <div className="pa-msg__body">
          <span className="pa-sr">Mr. Pilo: </span>
          {working && (
            <div className="pa-steps">
              <span ref={stepText}>{step}</span>
              <span className="ap-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}

          {text && (
            <div className="pa-bubble" aria-busy={pending}>
              <AnswerText
                parsed={parsed}
                shown={shown}
                typing={typing}
                streaming={streaming}
                reading={reading}
                sources={sources}
                active={null}
                onSource={(n, trigger) => onSources(sources, n, trigger)}
                onFinish={finish}
              />
            </div>
          )}

          {turn.error && (
            <div className="pa-warn" role="alert">
              <span>{a ? `${turn.error} Lo que alcanzó a escribir quedó incompleto.` : turn.error}</span>
              <button type="button" onClick={onRetry}>
                Preguntar de nuevo
              </button>
            </div>
          )}

          {a && incomplete && !turn.error && (
            <div className="pa-warn">
              <span>Detuvo la respuesta: lo escrito quedó incompleto.</span>
              <button type="button" onClick={onRetry}>
                Preguntar de nuevo
              </button>
            </div>
          )}

          {a && !typing && (
            <>
              {notes.map((note) => (
                <p key={note} className="pa-note">
                  {note}
                </p>
              ))}
              {a.unknown && a.unknown.length > 0 && <p className="pa-note">Revise estos números antes de citarlos: no los encontré en las fuentes ({a.unknown.join(", ")}).</p>}
              <div className="pa-after">
                {listed.length > 0 && (
                  <button type="button" className="pa-src" onClick={(e) => onSources(listed, null, e.currentTarget)}>
                    Fuentes ({listed.length})
                  </button>
                )}
                {voice.advanced && text.trim() && (
                  <button type="button" className="pa-act" aria-pressed={reading !== null} aria-label={reading !== null ? "Dejar de leer" : "Escuchar la respuesta con la voz de Pilo"} onClick={() => void read()}>
                    {reading !== null ? Icon.stop : Icon.listen}
                  </button>
                )}
                <button type="button" className="pa-act" aria-label={copied ? "Copiada" : "Copiar la respuesta con sus fuentes"} aria-pressed={copied} onClick={copy}>
                  {copied ? Icon.check : Icon.copy}
                </button>
                {a.kind !== "regla" && !incomplete && (
                  <>
                    <button type="button" className="pa-act" aria-pressed={turn.vote === "up"} aria-label="Me sirvió" onClick={() => onVote("up")}>
                      {Icon.up}
                    </button>
                    <button type="button" className="pa-act" aria-pressed={turn.vote === "down"} aria-label="No me sirvió" onClick={() => onVote("down")}>
                      {Icon.down}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
