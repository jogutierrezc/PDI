/* =============================================================================
   Mr. Pilo · la app · la llamada · la pantalla.

   Una sola cosa en primer plano: Pilo. Alrededor de su cara, tres anillos que
   dicen en qué punto va el ciclo sin una palabra:

     escucha   respiran despacio, como quien espera
     piensa    se recogen y un anillo de trazos gira (único movimiento constante)
     habla     laten con la voz
     pausa     quietos y apagados

   Debajo, el estado en el idioma de la llamada, lo que se oyó y lo que Pilo va
   diciendo. Al pie, tres controles: micrófono, colgar y ver la conversación.
   Tocar a Pilo mientras habla lo interrumpe.

   Entra abriéndose desde el botón de la cabecera (de dónde vino) y sale más
   rápido de lo que entró. Con movimiento reducido, solo cambian la opacidad
   y el color.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Pilo } from "../../pregunta/Pilo";
import { useFocusTrap } from "../Layer";
import { Icon } from "../icons";
import { reducedMotion } from "../pwa";
import { CALL_LANGS, clock } from "./logic";
import type { CallLang } from "./logic";
import { useCall } from "./useCall";
import type { CallOptions, CallPhase } from "./useCall";
import "./llamada.css";

gsap.registerPlugin(useGSAP);

const TEXT: Record<CallLang, { phase: Record<CallPhase, string>; tap: string; mute: string; unmute: string; hangup: string; talk: string; log: string; you: string; pilo: string; retry: string; close: string; empty: string; live: string }> = {
  es: {
    phase: { conectando: "Conectando…", escucha: "Le escucho", piensa: "Pensando…", habla: "Pilo habla", pausa: "Micrófono en pausa", error: "Se cortó la llamada", fin: "Llamada terminada" },
    tap: "Toque a Pilo para interrumpir",
    mute: "Silenciar el micrófono",
    unmute: "Activar el micrófono",
    hangup: "Colgar",
    talk: "Ver la conversación",
    log: "La conversación",
    you: "Usted",
    pilo: "Pilo",
    retry: "Volver a llamar",
    close: "Cerrar",
    empty: "Aún no hay nada dicho.",
    live: "En llamada",
  },
  en: {
    phase: { conectando: "Connecting…", escucha: "Listening", piensa: "Thinking…", habla: "Pilo is speaking", pausa: "Microphone paused", error: "The call dropped", fin: "Call ended" },
    tap: "Tap Pilo to interrupt",
    mute: "Mute the microphone",
    unmute: "Unmute the microphone",
    hangup: "Hang up",
    talk: "Show the conversation",
    log: "The conversation",
    you: "You",
    pilo: "Pilo",
    retry: "Call again",
    close: "Close",
    empty: "Nothing said yet.",
    live: "On call",
  },
  pt: {
    phase: { conectando: "Conectando…", escucha: "Estou ouvindo", piensa: "Pensando…", habla: "O Pilo está falando", pausa: "Microfone em pausa", error: "A chamada caiu", fin: "Chamada encerrada" },
    tap: "Toque no Pilo para interromper",
    mute: "Silenciar o microfone",
    unmute: "Ativar o microfone",
    hangup: "Desligar",
    talk: "Ver a conversa",
    log: "A conversa",
    you: "Você",
    pilo: "Pilo",
    retry: "Ligar de novo",
    close: "Fechar",
    empty: "Ainda não foi dito nada.",
    live: "Em chamada",
  },
};

type Mood = "feliz" | "piensa" | "atento" | "duda";
const MOOD: Record<CallPhase, Mood> = { conectando: "atento", escucha: "atento", piensa: "piensa", habla: "feliz", pausa: "feliz", error: "duda", fin: "feliz" };

export function CallScreen({
  lang,
  onLang,
  ask,
  speak,
  hush,
  prefetch,
  onEnd,
  online,
}: CallOptions & {
  onLang: (lang: CallLang) => void;
  onEnd: () => void;
  online: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const rings = useRef<SVGSVGElement>(null);
  const call = useCall({ lang, ask, speak, hush, prefetch });
  const { phase, sounding } = call;
  const t = TEXT[lang];
  const [log, setLog] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useFocusTrap(root, true, call.end);

  // La llamada empieza al abrirse la pantalla.
  useEffect(() => {
    call.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sin internet no hay llamada que valga.
  useEffect(() => {
    if (!online) call.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (phase === "conectando" || phase === "error" || phase === "fin") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase === "conectando" || phase === "error" || phase === "fin"]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Entrar y salir ------------------------------------------------------------------------ */

  // Entra abriéndose desde el botón de la cabecera (arriba a la derecha), que es de donde vino.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.fromTo(root.current, { clipPath: "circle(0px at calc(100% - 44px) 44px)" }, { clipPath: "circle(160vmax at calc(100% - 44px) 44px)", duration: 0.55, ease: "power3.out", clearProps: "clipPath" });
      gsap.from(".pc-top, .pc-bar", { autoAlpha: 0, y: (i) => (i ? 12 : -8), duration: 0.35, ease: "power3.out", delay: 0.2 });
    },
    { scope: root },
  );

  // Colgar: sale más rápido de lo que entró.
  const left = useRef(false);
  useEffect(() => {
    if (phase !== "fin" || left.current) return;
    left.current = true;
    if (reducedMotion() || !root.current) return onEnd();
    gsap.to(root.current, { autoAlpha: 0, scale: 0.98, duration: 0.2, ease: "power2.out", onComplete: onEnd });
  }, [phase, onEnd]);

  /* --- Los anillos ----------------------------------------------------------------------------- */

  useGSAP(
    () => {
      const svg = rings.current;
      if (!svg || reducedMotion()) return;
      const circles = gsap.utils.toArray<SVGCircleElement>(".pc-ring:not(.pc-ring--think)", svg);
      const dashed = svg.querySelector<SVGCircleElement>(".pc-ring--think");
      gsap.set(circles, { scale: 1, opacity: (i) => 0.55 - i * 0.14, transformOrigin: "50% 50%" });
      if (phase === "escucha") {
        gsap.to(circles, { scale: (i) => 1.045 + i * 0.03, duration: 2.1, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.28 });
      } else if (phase === "piensa") {
        gsap.to(circles, { scale: 0.965, opacity: (i) => 0.3 - i * 0.06, duration: 0.45, ease: "power3.out" });
        if (dashed) gsap.fromTo(dashed, { rotation: 0, opacity: 0 }, { rotation: 360, opacity: 0.9, duration: 5, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
      } else if (phase === "habla") {
        // Late con la voz: tres frecuencias que no coinciden, para que no suene a metrónomo.
        const base = [0.034, 0.05, 0.068];
        const tick = () => {
          const now = gsap.ticker.time;
          const level = sounding ? 0.5 + 0.5 * Math.sin(now * 9.1) * Math.sin(now * 3.7 + 1.2) : 0.12;
          circles.forEach((c, i) => gsap.set(c, { scale: 1 + level * base[i] * (1 + 0.35 * Math.sin(now * (4.2 + i * 1.9))) + 0.012 * i, opacity: 0.62 - i * 0.12 }));
        };
        gsap.ticker.add(tick);
        return () => gsap.ticker.remove(tick);
      } else {
        gsap.to(circles, { opacity: (i) => 0.22 - i * 0.05, duration: 0.3 });
      }
    },
    { scope: root, dependencies: [phase, sounding], revertOnUpdate: true },
  );

  const orbLabel = phase === "habla" || phase === "piensa" ? t.tap : t.phase[phase];
  const failed = phase === "error";

  return (
    <div className="pc" ref={root} role="dialog" aria-modal="true" aria-label="Mr. Pilo" data-phase={phase} data-log={log || undefined} tabIndex={-1}>
      <header className="pc-top">
        <p className="pc-live">
          <i aria-hidden="true" />
          <span>{t.live}</span>
          <time dateTime={`PT${seconds}S`}>{clock(seconds)}</time>
        </p>
        <div className="pc-langs" role="radiogroup" aria-label="Idioma / Language / Idioma">
          {CALL_LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={l.id === lang} lang={l.id} title={l.name} onClick={() => onLang(l.id)}>
              {l.short}
            </button>
          ))}
        </div>
      </header>

      <main className="pc-stage">
        <button type="button" className="pc-orb" onClick={call.interrupt} disabled={phase !== "habla" && phase !== "piensa"} aria-label={orbLabel}>
          <svg ref={rings} className="pc-rings" viewBox="0 0 240 240" aria-hidden="true">
            <circle className="pc-ring" cx="120" cy="120" r="84" />
            <circle className="pc-ring" cx="120" cy="120" r="100" />
            <circle className="pc-ring" cx="120" cy="120" r="116" />
            <circle className="pc-ring pc-ring--think" cx="120" cy="120" r="108" />
          </svg>
          <span className="pc-face">
            <Pilo size="100%" mood={MOOD[phase]} talking={sounding} alive label="" />
          </span>
        </button>

        <h2 className="pc-state" lang={lang} aria-live="polite">
          {t.phase[phase]}
        </h2>
        <p className="pc-hint" aria-hidden="true" data-on={phase === "habla" || undefined}>
          {t.tap}
        </p>

        {failed ? (
          <div className="pc-fail" role="alert">
            <p>{call.error}</p>
            <div>
              <button type="button" className="pa-btn pc-btn" onClick={call.start}>
                {t.retry}
              </button>
              <button type="button" className="pa-btn pc-btn pc-btn--line" onClick={call.end}>
                {t.close}
              </button>
            </div>
          </div>
        ) : (
          <div className="pc-caption" lang={lang}>
            <p className="pc-heard" data-empty={!call.heard || undefined}>
              {call.heard}
            </p>
            <p className="pc-said" data-empty={!call.said || undefined}>
              {call.said}
            </p>
          </div>
        )}
      </main>

      <section className="pc-log" aria-label={t.log} hidden={!log}>
        {call.lines.length === 0 ? (
          <p className="pc-log__empty">{t.empty}</p>
        ) : (
          <ol>
            {call.lines.map((l, i) => (
              <li key={i} data-who={l.who}>
                <b>{l.who === "yo" ? t.you : t.pilo}</b>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="pc-bar">
        <button type="button" className="pc-ctl" aria-pressed={call.muted} onClick={() => call.mute(!call.muted)} aria-label={call.muted ? t.unmute : t.mute} disabled={failed}>
          {call.muted ? Icon.micOff : Icon.mic}
        </button>
        <button type="button" className="pc-ctl pc-ctl--end" onClick={call.end} aria-label={t.hangup}>
          {Icon.hangup}
        </button>
        <button type="button" className="pc-ctl" aria-pressed={log} onClick={() => setLog((v) => !v)} aria-label={t.talk}>
          {Icon.chat}
        </button>
      </footer>
    </div>
  );
}
