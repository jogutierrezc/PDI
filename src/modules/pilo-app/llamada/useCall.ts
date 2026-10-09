/* =============================================================================
   Mr. Pilo · la app · la llamada · el ciclo.

   escucha → piensa → habla → escucha. El oído es el reconocimiento de voz del
   navegador; el cerebro, el mismo pedido del chat (por eso sabe lo de la UDES);
   la voz, la oficial de Pilo, frase por frase: la primera suena cuando llega,
   sin esperar a que la respuesta termine, y la siguiente se pide mientras la
   anterior suena.

   Mientras Pilo habla, el micrófono se apaga: sin auriculares recogería su
   propia voz. Para interrumpirlo se toca a Pilo (interrupt).

   Quien usa esto pone lo que cambia entre el chat y la llamada: cómo se pregunta
   (ask) y cómo se dice una frase (speak), con la voz y el espacio del Pilo
   abierto.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { buildHistory } from "../../../components/pilo/ai/client";
import { callLanguage, spokenQuestion, spokenText, takeSentences } from "./logic";
import type { CallLang } from "./logic";

export type CallPhase = "conectando" | "escucha" | "piensa" | "habla" | "pausa" | "error" | "fin";

export interface CallLine {
  who: "yo" | "pilo";
  text: string;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Qué dice la persona cuando el navegador no la oye, en palabras y con salida. */
export const CALL_ERRORS: Record<string, string> = {
  "not-allowed": "El navegador no dejó usar el micrófono. Permítalo en el candado de la barra de direcciones y vuelva a llamar.",
  "service-not-allowed": "Este navegador no deja usar el reconocimiento de voz aquí. Pruebe con Chrome, Edge o Safari.",
  "audio-capture": "No encuentro un micrófono. Conecte uno y vuelva a llamar.",
  network: "El reconocimiento de voz perdió la conexión. Revise internet y vuelva a llamar.",
  sin_voz: "La voz de Pilo no está disponible ahora. Puede seguir por escrito en el chat.",
  pilo: "No pude hablar con Pilo ahora. Vuelva a intentarlo en un momento.",
};

export interface CallOptions {
  lang: CallLang;
  /** Pregunta al Pilo abierto. Llama a `onDelta` con cada pedazo que llega; se cumple con la respuesta entera. */
  ask: (question: string, history: { q: string; a: string }[], onDelta: (text: string) => void, signal: AbortSignal) => Promise<string>;
  /** Dice una frase con la voz oficial. `onSound` avisa cuando empieza y cuando deja de sonar. */
  speak: (text: string, onSound: (on: boolean) => void) => Promise<"sono" | "sin voz" | "cancelado">;
  /** Calla lo que suene ahora mismo. */
  hush: () => void;
  /** Pide por adelantado el audio de una frase que aún espera su turno: así no hay pausas entre una y otra. */
  prefetch?: (text: string) => void;
}

export function useCall({ lang, ask, speak, hush, prefetch }: CallOptions) {
  const [phase, setPhase] = useState<CallPhase>("conectando");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [lines, setLines] = useState<CallLine[]>([]);
  const [sounding, setSounding] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  // Todo lo que cambia sin que la pantalla tenga que pintarse vive aquí.
  const live = useRef({
    epoch: 0,
    phase: "conectando" as CallPhase,
    rec: null as Recognition | null,
    ctl: null as AbortController | null,
    history: [] as { q: string; a: string }[],
    muted: false,
    lang,
    ask,
    speak,
    hush,
    prefetch,
  });
  live.current.lang = lang;
  live.current.ask = ask;
  live.current.speak = speak;
  live.current.hush = hush;
  live.current.prefetch = prefetch;

  const go = useCallback((next: CallPhase) => {
    live.current.phase = next;
    setPhase(next);
  }, []);

  const closeEar = useCallback(() => {
    const rec = live.current.rec;
    live.current.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* ya estaba cerrado */
    }
  }, []);

  const fail = useCallback(
    (code: string) => {
      live.current.epoch += 1;
      closeEar();
      live.current.ctl?.abort();
      live.current.hush();
      setSounding(false);
      setError(CALL_ERRORS[code] ?? CALL_ERRORS.pilo);
      go("error");
    },
    [closeEar, go],
  );

  /** Pilo piensa y habla. Termina cuando dijo la última frase, y entonces vuelve a escuchar. */
  const answer = useCallback(
    async (heardText: string, listen: () => void) => {
      const run = live.current;
      const mine = ++run.epoch;
      const alive = () => run.epoch === mine;
      const ctl = new AbortController();
      run.ctl = ctl;
      closeEar();
      go("piensa");
      setHeard(heardText);
      setSaid("");
      setLines((l) => [...l, { who: "yo", text: heardText }]);

      let pending = "";
      let raw = "";
      let finished = false;
      let spoken = "";
      const queue: string[] = [];
      let waiting: (() => void) | null = null;
      const wake = () => waiting?.();

      // La voz: una frase tras otra, sin dejar silencios entre ellas.
      const talker = (async () => {
        for (;;) {
          while (!queue.length) {
            if (finished || !alive()) return;
            await new Promise<void>((resolve) => {
              waiting = resolve;
            });
            waiting = null;
          }
          if (!alive()) return;
          const sentence = queue.shift() as string;
          if (run.phase !== "habla") go("habla");
          spoken = spoken ? `${spoken} ${sentence}` : sentence;
          setSaid(spoken);
          const outcome = await run.speak(sentence, (on) => alive() && setSounding(on));
          if (!alive()) return;
          if (outcome === "sin voz") {
            // Sin voz no hay llamada: lo que queda se lee en pantalla.
            queue.length = 0;
            fail("sin_voz");
            return;
          }
        }
      })();

      try {
        const full = await run.ask(
          spokenQuestion(heardText, run.lang),
          run.history,
          (piece) => {
            if (!alive()) return;
            raw += piece;
            pending += piece;
            // El espacio del final se conserva: el pedazo siguiente empieza donde este terminó.
            const out = takeSentences(spokenText(pending) + (/\s$/.test(pending) ? " " : ""), false);
            pending = out.rest;
            if (out.sentences.length) {
              queue.push(...out.sentences);
              out.sentences.forEach((s) => run.prefetch?.(s));
              wake();
            }
          },
          ctl.signal,
        );
        if (!alive()) return;
        // Si la respuesta llegó entera de una vez (sin pedazos), todo está aún por decir.
        if (!raw && full) pending = full;
        raw = raw || full;
        const tail = takeSentences(spokenText(pending), true).sentences;
        queue.push(...tail);
        tail.forEach((s) => run.prefetch?.(s));
        finished = true;
        wake();
        run.history = buildHistory([...run.history, { q: heardText, a: raw }]);
        await talker;
        if (!alive()) return;
        setLines((l) => [...l, { who: "pilo", text: spokenText(raw) }]);
        setSounding(false);
        if (run.muted) go("pausa");
        else listen();
      } catch (e) {
        finished = true;
        wake();
        if (!alive() || (e as { code?: string }).code === "cancelado" || (e as Error).name === "AbortError") return;
        fail("pilo");
      }
    },
    [closeEar, fail, go],
  );

  /** Abre el oído: una frase de la persona, y se pasa al cerebro. */
  const listen = useCallback(() => {
    const run = live.current;
    const Ctor = recognitionCtor();
    if (!Ctor) return fail("service-not-allowed");
    closeEar();
    const rec = new Ctor();
    rec.lang = callLanguage(run.lang).speech;
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    let restarts = 0;
    run.rec = rec;
    go("escucha");
    setHeard("");
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText += `${piece} `;
        else interim += piece;
      }
      setHeard((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      // Silencio o nada que oír: se vuelve a abrir el oído, sin molestar.
      if (e.error === "no-speech" || e.error === "aborted") return;
      fail(e.error);
    };
    rec.onend = () => {
      if (run.rec !== rec) return;
      const text = finalText.replace(/\s+/g, " ").trim();
      run.rec = null;
      if (text) return void answer(text, listen);
      // Nadie habló: se vuelve a escuchar, con un tope para no girar en falso si el navegador cierra en seco.
      if (run.phase === "escucha" && !run.muted && restarts++ < 50) window.setTimeout(() => run.phase === "escucha" && !run.rec && listen(), 250);
    };
    try {
      rec.start();
    } catch {
      /* ya estaba abierto */
    }
  }, [answer, closeEar, fail, go]);

  /** Empezar: el primer turno es de la persona. */
  const start = useCallback(() => {
    live.current.muted = false;
    setMuted(false);
    setError("");
    setLines([]);
    live.current.history = [];
    listen();
  }, [listen]);

  /** Tocar a Pilo mientras habla o piensa: se calla y escucha. */
  const interrupt = useCallback(() => {
    const run = live.current;
    if (run.phase !== "habla" && run.phase !== "piensa") return;
    run.epoch += 1;
    run.ctl?.abort();
    run.hush();
    setSounding(false);
    if (run.muted) go("pausa");
    else listen();
  }, [go, listen]);

  const mute = useCallback(
    (on: boolean) => {
      const run = live.current;
      run.muted = on;
      setMuted(on);
      if (on) {
        if (run.phase === "escucha") {
          closeEar();
          go("pausa");
        }
      } else if (run.phase === "pausa") listen();
    },
    [closeEar, go, listen],
  );

  const end = useCallback(() => {
    const run = live.current;
    run.epoch += 1;
    closeEar();
    run.ctl?.abort();
    run.hush();
    setSounding(false);
    go("fin");
  }, [closeEar, go]);

  // Si la pantalla se cierra por cualquier camino, todo se calla.
  useEffect(
    () => () => {
      const run = live.current;
      run.epoch += 1;
      closeEar();
      run.ctl?.abort();
      run.hush();
    },
    [closeEar],
  );

  // Cambiar de idioma en plena llamada: el oído se vuelve a abrir en el nuevo.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (firstLang.current === lang) return;
    firstLang.current = lang;
    if (live.current.phase === "escucha") listen();
  }, [lang, listen]);

  return { phase, heard, said, lines, sounding, error, muted, start, interrupt, mute, end };
}
