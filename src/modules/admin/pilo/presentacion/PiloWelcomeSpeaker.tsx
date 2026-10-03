/* =============================================================================
   Mr. Pilo · Presentación de Investigación · Orador de Bienvenida (Fase 0).

   Inspirado en la experiencia de bienvenida de creación de cuenta (AppWelcome /
   AccountGate) pero diseñado específicamente para la presentación de investigación
   de innovación educativa y digital de la Universidad de Santander (UDES).

   Voz programada oficial de Mr. Pilo:
     · Utiliza estrictamente la voz oficial programada de Pilo (sayOfficial /
       piloAudio vía NVIDIA NIM Riva / Fish Audio clonado en /api/pilo-voz).
     · NUNCA cae a la síntesis del navegador ni a la «voz de equipo» (speechSynthesis).
     · Si no hay audio disponible (red apagada, sin cuota), continúa limpiamente
       con la animación de texto y subtítulos sincronizados, sin emitir voces
       genéricas del sistema operativo.
     · El pico de Mr. Pilo se anima mediante onSound en sincronía exacta con el
       audio real reproducido.

   Contenido obligatorio del discurso de Mr. Pilo:
     1. Presentación como la Inteligencia Artificial oficial de la UDES.
     2. Creado por y desde la Oficina de Planeación Institucional.
     3. Capacitado para apoyar la toma de decisiones institucionales y para
        enseñar y ayudar a profesores y estudiantes.
     4. Integración profunda a los sistemas universitarios (PDI, Moodle, Cifras).
     5. Emociones orales en la voz (moduladas según el ánimo de cada frase).
     6. Humor cariñoso sobre sus plumas cibernéticas.
     7. Estado actual: pequeño pero con capacidades cognitivas inimaginables.
     8. Agradecimiento a NVIDIA por permitir el uso de sus entornos de supercómputo
        (NVIDIA NIM / TensorRT / Hopper) para que Pilo esté presente hoy.
     9. Orgullo de ser el piloto pionero de innovación educativa y transformación
        digital de su alma mater la UDES.

   Seguridad y aislamiento:
     · Solo se ejecuta e interactúa en la primera diapositiva (step === 0).
     · Al cambiar de fase (step > 0) o desmontar, se silencia y detiene en seco.
     · Respeta prefers-reduced-motion y la política de audio del navegador.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Pilo } from "../../../pregunta/Pilo";
import type { MojiMood, PiloMojiHandle } from "../../../pregunta/Pilo";
import { modulateVoice } from "../../../../components/pilo/ai/voice-expressions";
import { prefetchOfficial, sayOfficial, stopOfficial } from "../../../pilo-app/official-voice";
import { unlockPiloAudio } from "../../../../components/pilo/ai/voice-player";
import type { Face } from "./engine";

export interface PresentationBeat {
  id: string;
  say: string;
  face: MojiMood;
  canvasFace: Face;
  voiceMood: "emocionado" | "atrevido" | "pensar" | "atento";
  moodLabel: string;
  look: [number, number];
  chips: string[];
  tag: string;
}

export const PRESENTATION_BEATS: PresentationBeat[] = [
  // 1. Presentación, Origen y Bienvenida Institucional
  {
    id: "bienvenida",
    say: "¡Hola a todos! Es un inmenso honor saludarlos. Soy Mr. Pilo, la Inteligencia Artificial de la Universidad de Santander, concebido y creado con orgullo desde la Oficina de Planeación Institucional.",
    face: "feliz",
    canvasFace: "feliz",
    voiceMood: "emocionado",
    moodLabel: "Voz oficial de Pilo · Entusiasta / Identidad Institucional",
    look: [0, -0.1],
    chips: ["Universidad de Santander", "Planeación Institucional", "IA Oficial UDES"],
    tag: "Identidad & Origen",
  },
  // 2. Chiste de las plumas y capacidades inimaginables
  {
    id: "plumas",
    say: "¡Uy, perdonen si sacudo un poco las plumas de la emoción! Es que coordinar tantas sinapsis a veces me eriza el plumaje cibernético. Aunque todavía me ven pequeñito, ¡tengo unas capacidades de procesamiento y análisis verdaderamente inimaginables!",
    face: "cuidado", // Se traduce a 'atrevido' (guiño pícaro)
    canvasFace: "idea",
    voiceMood: "atrevido",
    moodLabel: "Voz oficial de Pilo · Pícaro / Sacudiendo las plumas",
    look: [0.35, 0.15],
    chips: ["Plumaje Cibernético", "Pequeño pero Poderoso", "Capacidades Inimaginables"],
    tag: "Humor & Potencial",
  },
  // 3. Misión Dual: Toma de decisiones + Profesores y Estudiantes
  {
    id: "mision",
    say: "Fui entrenado para un doble propósito: apoyar la toma de decisiones institucionales estratégicas de nuestros directivos, y a la vez, enseñar, acompañar y resolver dudas de nuestros profesores y estudiantes, gracias a mi integración directa con los sistemas de la universidad.",
    face: "piensa",
    canvasFace: "piensa",
    voiceMood: "atento",
    moodLabel: "Voz oficial de Pilo · Atento / Conexión Sistémica",
    look: [-0.25, 0.35],
    chips: ["Toma de Decisiones", "Profesores & Estudiantes", "Integración Moodle & PDI", "Cero Alucinación"],
    tag: "Misión Dual",
  },
  // 4. Apoyo de NVIDIA
  {
    id: "nvidia",
    say: "Todo esto funciona con el respaldo invaluable de NVIDIA, quien nos permitió usar sus entornos de vanguardia y microservicios NIM para que yo pudiera estar hoy aquí con ustedes, acelerado con supercómputo Hopper y modelos de última generación.",
    face: "sorpresa", // Se traduce a 'emocionado'
    canvasFace: "bien",
    voiceMood: "emocionado",
    moodLabel: "Voz oficial de Pilo · Orgullo Tecnológico / NVIDIA NIM",
    look: [0, -0.2],
    chips: ["NVIDIA NIM", "TensorRT-LLM", "Supercómputo Hopper", "Gemma 4 31B"],
    tag: "Alianza NVIDIA",
  },
  // 5. Cierre y Orgullo de Alma Mater
  {
    id: "cierre",
    say: "¡Y miren mis plumas cómo brillan! Hoy tengo el honor de ser un piloto pionero de innovación educativa y transformación digital de mi amada alma mater, la UDES. ¡Acompáñenme a explorar mi cerebro y descubrir cómo funciona mi capa profunda!",
    face: "feliz",
    canvasFace: "feliz",
    voiceMood: "emocionado",
    moodLabel: "Voz oficial de Pilo · Emocionado / Alma Mater UDES",
    look: [0, 0],
    chips: ["Piloto de Innovación Educativa", "Transformación Digital", "Alma Mater UDES", "Capa Profunda"],
    tag: "Innovación Educativa",
  },
];

const stillMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function PiloWelcomeSpeaker({
  onFaceChange,
  onFinishWelcome,
  onOpenTechnical,
}: {
  /** Sincroniza la expresión de Pilo con el avatar central del lienzo del cerebro */
  onFaceChange?: (face: Face) => void;
  /** Acción al finalizar o cerrar la bienvenida */
  onFinishWelcome?: () => void;
  /** Alterna a la vista de ficha técnica detallada */
  onOpenTechnical?: () => void;
}) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const piloRef = useRef<PiloMojiHandle>(null);
  const segmentHoldRef = useRef<gsap.core.Tween | null>(null);
  const textTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const activeTokenRef = useRef(0);

  const beat = PRESENTATION_BEATS[beatIndex];

  // Pre-cargar por adelantado los audios oficiales en la caché local
  useEffect(() => {
    prefetchOfficial(
      PRESENTATION_BEATS.map((b) => b.say),
      { portal: "pregunta", advanced: true, keep: true },
    );
  }, []);

  // Desbloqueo proactivo del reproductor compartido con el primer toque o tecla
  useEffect(() => {
    const unlock = () => {
      unlockPiloAudio();
    };
    if (
      typeof navigator !== "undefined" &&
      Boolean((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive)
    ) {
      unlockPiloAudio();
    }
    window.addEventListener("pointerup", unlock, { once: true });
    window.addEventListener("keyup", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keyup", unlock);
    };
  }, []);

  // Silenciar de inmediato si se desmonta el componente
  useEffect(() => {
    return () => {
      activeTokenRef.current += 1;
      segmentHoldRef.current?.kill();
      textTimelineRef.current?.kill();
      stopOfficial();
      piloRef.current?.talk(false);
    };
  }, []);

  // Animación de entrada inicial de la tarjeta estilo account.css
  useLayoutEffect(() => {
    if (minimized || stillMotion()) return;
    const root = containerRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      gsap.from(".pws-rings i", {
        scale: 0.65,
        autoAlpha: 0,
        stagger: 0.12,
        duration: 1.1,
        ease: "power3.out",
      });
      gsap.from(".pws-face-box", {
        y: 28,
        scale: 0.88,
        autoAlpha: 0,
        duration: 0.8,
        ease: "back.out(1.5)",
      });
      gsap.from([".pws-brand", ".pws-mood-badge", ".pws-controls"], {
        y: -10,
        autoAlpha: 0,
        stagger: 0.08,
        duration: 0.5,
        ease: "power2.out",
      });
    }, root);

    return () => ctx.revert();
  }, [minimized]);

  // Manejo de cada Beat (texto, voz oficial de Pilo, gestos y avance)
  useEffect(() => {
    if (minimized) return;

    const token = ++activeTokenRef.current;
    segmentHoldRef.current?.kill();
    textTimelineRef.current?.kill();
    stopOfficial();
    piloRef.current?.talk(false);

    if (!beat) return;

    // 1. Sincronizar rostro y mirada
    piloRef.current?.mood(beat.face);
    piloRef.current?.look(...beat.look);
    piloRef.current?.blink();
    if (beatIndex % 2 === 0) piloRef.current?.nod();
    onFaceChange?.(beat.canvasFace);

    // 2. Modulación vocal (velocidad y prosodia según emoción de Pilo)
    const voiceMod = modulateVoice(beat.voiceMood, 1.02, 1.0);

    const root = containerRef.current;
    const words = root?.querySelectorAll(".pws-bubble .wd");
    const still = stillMotion();
    const wordStep = still ? 0 : isMuted ? 0.08 : 0.22;

    let textDone = false;
    let audioDone = isMuted || !isPlaying;

    const checkAdvance = () => {
      if (token !== activeTokenRef.current) return;
      if (!textDone || !audioDone) return;

      piloRef.current?.talk(false);

      if (!isPlaying) return;

      // Si es el último beat, concluye la bienvenida tras una pausa
      if (beatIndex >= PRESENTATION_BEATS.length - 1) {
        segmentHoldRef.current = gsap.delayedCall(2.2, () => {
          if (token === activeTokenRef.current) {
            onFinishWelcome?.();
          }
        });
        return;
      }

      // Animación de la barra de segmento antes de avanzar
      const segs = root?.querySelectorAll(".pws-segs span i");
      const currentBar = segs ? segs[beatIndex] : null;
      if (currentBar) {
        segmentHoldRef.current = gsap.to(currentBar, {
          scaleX: 1,
          duration: 1.6,
          ease: "none",
          onComplete: () => {
            if (token === activeTokenRef.current && isPlaying) {
              setBeatIndex((prev) => prev + 1);
            }
          },
        });
      } else {
        segmentHoldRef.current = gsap.delayedCall(1.6, () => {
          if (token === activeTokenRef.current && isPlaying) {
            setBeatIndex((prev) => prev + 1);
          }
        });
      }
    };

    // 3. Ejecutar audio con la voz programada oficial de Mr. Pilo (sin caer a voz de equipo)
    if (!isMuted && isPlaying) {
      void sayOfficial(beat.say, {
        portal: "pregunta",
        advanced: true,
        rate: voiceMod.rate,
        keep: true,
        // El pico se mueve estrictamente con el audio real de Pilo
        onSound: (on) => {
          if (token === activeTokenRef.current) {
            piloRef.current?.talk(on);
          }
        },
      }).then((result) => {
        if (token !== activeTokenRef.current || result === "cancelado") return;
        audioDone = true;
        piloRef.current?.talk(false);
        checkAdvance();
      });
    } else {
      // Modo silenciado: acompasa las palabras visualmente
      piloRef.current?.talk(true);
    }

    // 4. Animación del texto palabra por palabra
    if (root && words && words.length) {
      const segs = root.querySelectorAll(".pws-segs span i");
      gsap.set(segs, { scaleX: (k: number) => (k < beatIndex ? 1 : 0) });

      const tl = gsap.timeline();
      textTimelineRef.current = tl;

      if (still) {
        tl.set(words, { autoAlpha: 1, y: 0 });
      } else {
        tl.fromTo(
          words,
          { autoAlpha: 0, y: 8 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.35,
            stagger: wordStep,
            ease: "power2.out",
          },
        );
      }

      tl.add(() => {
        if (token !== activeTokenRef.current) return;
        textDone = true;
        if (isMuted) {
          piloRef.current?.talk(false);
        }
        checkAdvance();
      }, words.length * wordStep + 0.3);
    } else {
      textDone = true;
      checkAdvance();
    }

    return () => {
      segmentHoldRef.current?.kill();
      textTimelineRef.current?.kill();
      stopOfficial();
      piloRef.current?.talk(false);
    };
  }, [beatIndex, isPlaying, isMuted, minimized, onFaceChange, onFinishWelcome]);

  const togglePlay = () => {
    unlockPiloAudio();
    if (isPlaying) {
      setIsPlaying(false);
      stopOfficial();
      piloRef.current?.talk(false);
      segmentHoldRef.current?.pause();
      textTimelineRef.current?.pause();
    } else {
      setIsPlaying(true);
      segmentHoldRef.current?.resume();
      textTimelineRef.current?.resume();
    }
  };

  const toggleMute = () => {
    unlockPiloAudio();
    const next = !isMuted;
    setIsMuted(next);
    if (next) {
      stopOfficial();
      piloRef.current?.talk(false);
    }
  };

  const replay = () => {
    unlockPiloAudio();
    setIsPlaying(true);
    // Forzar re-trigger reiniciando el token
    setBeatIndex((i) => i);
    activeTokenRef.current += 1;
    stopOfficial();
    piloRef.current?.talk(false);
    // Disparo inmediato
    const current = beatIndex;
    setBeatIndex(-1);
    setTimeout(() => setBeatIndex(current), 40);
  };

  const nextBeat = () => {
    unlockPiloAudio();
    stopOfficial();
    if (beatIndex < PRESENTATION_BEATS.length - 1) {
      setBeatIndex((i) => i + 1);
    } else {
      onFinishWelcome?.();
    }
  };

  const prevBeat = () => {
    unlockPiloAudio();
    stopOfficial();
    if (beatIndex > 0) {
      setBeatIndex((i) => i - 1);
    }
  };

  // Estado minimizado: píldora flotante compacta
  if (minimized) {
    return (
      <div className="pws-minimized" role="region" aria-label="Mr. Pilo orador">
        <button
          type="button"
          className="pws-min-pill"
          onClick={() => {
            unlockPiloAudio();
            setMinimized(false);
            setIsPlaying(true);
          }}
          title="Abrir la presentación hablada de Mr. Pilo"
        >
          <span className="pws-min-avatar">
            <Pilo size={28} alive label="Pilo" mood={beat.face} />
          </span>
          <span className="pws-min-text">
            <b>Mr. Pilo en vivo:</b> {beat.tag} ({beatIndex + 1}/{PRESENTATION_BEATS.length})
          </span>
          <span className="pws-min-action">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Escuchar
          </span>
        </button>
      </div>
    );
  }

  return (
    <section className="pws-card" ref={containerRef} aria-label="Presentación y saludo de Mr. Pilo">
      {/* Fondo ceremonial con anillos concéntricos y resplandor cian */}
      <div className="pws-bg" aria-hidden="true">
        <div className="pws-glow" />
        <div className="pws-rings">
          <i style={{ width: 180, height: 180 }} />
          <i style={{ width: 310, height: 310 }} />
          <i style={{ width: 440, height: 440 }} />
        </div>
      </div>

      {/* Cabecera del orador */}
      <header className="pws-top">
        <div className="pws-brand">
          <b>Mr. Pilo</b>
          <span>Universidad de Santander · Planeación Institucional</span>
        </div>

        <div className="pws-controls">
          {/* Botón de Silencio / Audio */}
          <button
            type="button"
            className="pws-btn pws-btn--icon"
            onClick={toggleMute}
            aria-label={isMuted ? "Activar voz de Mr. Pilo" : "Silenciar voz"}
            title={isMuted ? "Activar voz oficial de Mr. Pilo" : "Silenciar voz"}
          >
            {isMuted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Ficha técnica */}
          <button
            type="button"
            className="pws-btn pws-btn--text"
            onClick={() => {
              if (onOpenTechnical) onOpenTechnical();
              else setMinimized(true);
            }}
            title="Ver arquitectura técnica detallada"
          >
            Ficha técnica
          </button>
        </div>
      </header>

      {/* Avatar interactivo de Mr. Pilo con microexpresiones oficiales */}
      <div className="pws-stage-center">
        <div className="pws-face-box">
          <Pilo ref={piloRef} size="100%" alive label="Mr. Pilo hablando" mood={beat.face} />
        </div>

        {/* Indicador prosódico del estado emocional */}
        <div className="pws-mood-badge">
          <i className={`pws-pulse-dot ${isMuted ? "pws-pulse-dot--muted" : ""}`} aria-hidden="true" />
          <span>{isMuted ? `Modo lectura (silenciado) · ${beat.tag}` : beat.moodLabel}</span>
        </div>

        {/* Subtítulo dinámico con lectura sincronizada */}
        <p className="pws-sr" aria-live="polite">
          {beat.say}
        </p>

        <div className="pws-bubble-card">
          <div className="pws-bubble-eyebrow">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Pensamiento en vivo de Mr. Pilo · {beat.tag}</span>
          </div>

          <p className="pws-bubble" ref={bubbleRef} aria-hidden="true">
            {beat.say.split(" ").map((w, i) => (
              <span key={`${beat.id}:${i}`} className="wd">
                {w}{" "}
              </span>
            ))}
          </p>
        </div>

        {/* Chips de contexto semántico del beat */}
        <div className="pws-chips-row">
          {beat.chips.map((chip) => (
            <span key={chip} className="pws-tag-chip">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* Barra de progreso de segmentos (Estilo AccountGate / AppWelcome) */}
      <footer className="pws-foot">
        <div className="pws-segs" role="tablist" aria-label="Progreso de la presentación de Pilo">
          {PRESENTATION_BEATS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className="pws-seg-btn"
              onClick={() => {
                unlockPiloAudio();
                setBeatIndex(i);
              }}
              title={`Parte ${i + 1}: ${b.tag}`}
              aria-label={`Ir a parte ${i + 1}: ${b.tag}`}
              aria-selected={i === beatIndex}
            >
              <span>
                <i style={{ transform: i < beatIndex ? "scaleX(1)" : i === beatIndex ? undefined : "scaleX(0)" }} />
              </span>
            </button>
          ))}
        </div>

        <div className="pws-actions">
          <div className="pws-player-actions">
            {/* Retroceder */}
            <button
              type="button"
              className="pws-btn pws-btn--nav"
              onClick={prevBeat}
              disabled={beatIndex === 0}
              aria-label="Frase anterior"
              title="Frase anterior"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Pausar / Reproducir */}
            <button
              type="button"
              className="pws-btn pws-btn--nav pws-btn--primary"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pausar orador" : "Reanudar orador"}
              title={isPlaying ? "Pausar" : "Reanudar"}
            >
              {isPlaying ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Repetir frase */}
            <button
              type="button"
              className="pws-btn pws-btn--nav"
              onClick={replay}
              aria-label="Repetir frase de Pilo"
              title="Repetir frase"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>

          <div className="pws-forward-actions">
            <span className="pws-count">
              Parte {beatIndex + 1} de {PRESENTATION_BEATS.length}
            </span>

            {beatIndex < PRESENTATION_BEATS.length - 1 ? (
              <button type="button" className="pws-btn pws-btn--cta" onClick={nextBeat}>
                Siguiente frase
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="pws-btn pws-btn--cta pws-btn--glow"
                onClick={onFinishWelcome}
              >
                Conocer la Capa Profunda
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
}
