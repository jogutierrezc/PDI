/* =============================================================================
   Encuestas con Pilo · la bienvenida.

   Pilo salta a escena, se sorprende y mira a los lados; el título de la encuesta
   llega letra por letra y cada frase palabra por palabra mientras habla, con la
   voz oficial. Al salir, el escenario se cierra en círculo sobre la guía mientras
   Pilo vuela hasta ella. Es la misma bienvenida de la app de Pilo
   (PiloWelcomeSpeaker) a la medida de esta página.

   Voz: suena solo después de un toque o una tecla (cuando el navegador deja); si
   no hay audio, la bienvenida sigue en texto. Con movimiento reducido, fundidos.
   ========================================================================== */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import gsap from "gsap";
import { PiloFace } from "../../../components/pilo/PiloFace";
import type { PiloFaceHandle } from "../../../components/pilo/PiloFace";
import { useFocusTrap } from "../../pilo-app/Layer";
import { frasesBienvenida } from "./frases";
import { precargarVoz, sinMovimiento, stopOfficial, useHabla, yaTocado } from "./habla";

const IconoVoz = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8v4h3l4 3V5L6 8H3z" />
    {on ? <path d="M13 7.5a3.5 3.5 0 010 5M15.5 5a7 7 0 010 10" /> : <path d="M13.5 8l4 4M17.5 8l-4 4" />}
  </svg>
);

export function Bienvenida({ titulo, intro, destino, onFin }: { titulo: string; intro: string; destino: RefObject<HTMLElement>; onFin: () => void }) {
  const escena = useRef<HTMLDivElement>(null);
  const vuelo = useRef<HTMLDivElement>(null);
  const cara = useRef<PiloFaceHandle>(null);
  const espera = useRef<gsap.core.Tween | null>(null);
  const entrada = useRef<gsap.core.Timeline | null>(null);
  const saliendo = useRef(false);
  const [paso, setPaso] = useState(-1);
  const [vozOn, setVozOn] = useState(true);
  const [armada, setArmada] = useState(yaTocado);
  const [sinVoz, setSinVoz] = useState(false);

  const frases = useMemo(() => frasesBienvenida(intro), [intro]);
  const actual = paso >= 0 ? frases[Math.min(paso, frases.length - 1)] : null;
  const ultima = paso >= frases.length - 1;
  const suena = vozOn && armada && !sinVoz;

  useEffect(() => {
    precargarVoz(frases.map((f) => f.say));
  }, [frases]);

  // El primer toque (o tecla) estrena el audio. Al soltar, no al tocar: si fue en «Siguiente», suena ya la frase nueva.
  useEffect(() => {
    if (armada) return;
    const armar = () => setArmada(true);
    window.addEventListener("pointerup", armar, { once: true });
    window.addEventListener("keyup", armar, { once: true });
    return () => {
      window.removeEventListener("pointerup", armar);
      window.removeEventListener("keyup", armar);
    };
  }, [armada]);

  // La entrada.
  useLayoutEffect(() => {
    const raiz = escena.current!;
    const ctx = gsap.context(() => {
      if (sinMovimiento()) {
        gsap.from(raiz, { autoAlpha: 0, duration: 0.3 });
        gsap.delayedCall(0.4, () => setPaso((p) => (p < 0 ? 0 : p)));
        return;
      }
      entrada.current = gsap
        .timeline()
        .from(".ep-w-brillo", { scale: 0.4, autoAlpha: 0, duration: 1.2, ease: "power2.out" }, 0)
        .from(".ep-w-anillos i", { scale: 0.6, autoAlpha: 0, duration: 1.1, stagger: 0.12, ease: "power3.out" }, 0.1)
        .from(vuelo.current, { y: 160, scale: 0.82, rotation: -10, autoAlpha: 0, duration: 0.95, ease: "back.out(1.5)" }, 0.3)
        .add(() => {
          cara.current?.expression("emocionado");
          cara.current?.blink();
        }, 0.95)
        .add(() => cara.current?.look(-0.9, -0.1), 1.2)
        .add(() => cara.current?.look(0.9, -0.1), 1.6)
        .add(() => {
          cara.current?.look(0, 0);
          cara.current?.expression("feliz");
        }, 1.95)
        .from(".ep-w-titulo .ch", { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.02, ease: "power3.out" }, 1.0)
        .from(".ep-w-arriba > *", { autoAlpha: 0, y: -8, duration: 0.5, stagger: 0.06, ease: "power3.out" }, 1.3)
        .from([".ep-w-estado", ".ep-w-pie"], { autoAlpha: 0, y: 14, duration: 0.6, ease: "power3.out" }, 1.6)
        .add(() => setPaso((p) => (p < 0 ? 0 : p)), 2.3);
    }, raiz);
    return () => {
      ctx.revert();
      espera.current?.kill();
      stopOfficial();
    };
  }, []);

  // Cada frase: su cara, su mirada y sus muestras; al terminar de hablar, la barra marca la pausa y pasa a la siguiente.
  useLayoutEffect(() => {
    if (!actual || saliendo.current) return;
    const raiz = escena.current!;
    const i = paso;
    cara.current?.expression(actual.face);
    cara.current?.look(...actual.look);
    cara.current?.blink();
    if (i % 2 === 0) cara.current?.nod();
    const ctx = gsap.context(() => {
      const segmentos = raiz.querySelectorAll(".ep-w-segs span i");
      gsap.set(segmentos, { scaleX: (k: number) => (k < i ? 1 : 0) });
      const muestras = raiz.querySelectorAll(".ep-w-muestras > *");
      if (muestras.length) {
        if (sinMovimiento()) gsap.fromTo(muestras, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
        else gsap.fromTo(muestras, { autoAlpha: 0, y: 16, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: "back.out(1.6)", delay: 0.2 });
      }
    }, raiz);
    return () => {
      espera.current?.kill();
      espera.current = null;
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  useHabla({
    raiz: escena,
    cara,
    id: actual ? `${paso}:${actual.id}` : null,
    texto: actual?.say ?? "",
    conVoz: suena,
    onSinVoz: () => setSinVoz(true),
    onFin: () => {
      // La última frase espera a quien presenta: «Comenzar».
      if (saliendo.current || paso >= frases.length - 1) return;
      const seg = escena.current?.querySelectorAll(".ep-w-segs span i")[paso];
      espera.current = gsap.to(seg ?? {}, { scaleX: 1, duration: sinMovimiento() ? 0.2 : 1.8, ease: "none", onComplete: () => setPaso(paso + 1) });
    },
  });

  // La salida: Pilo vuela a la guía y el escenario se cierra sobre él.
  const salir = () => {
    if (saliendo.current) return;
    saliendo.current = true;
    espera.current?.kill();
    stopOfficial();
    cara.current?.talk(false);
    const raiz = escena.current;
    const hueco = destino.current;
    const pilo = vuelo.current;
    if (!raiz || !pilo) return onFin();
    entrada.current?.progress(1);
    if (sinMovimiento() || !hueco) {
      gsap.to(raiz, { autoAlpha: 0, duration: 0.3, onComplete: onFin });
      return;
    }
    const marco = raiz.getBoundingClientRect();
    const desde = pilo.getBoundingClientRect();
    const hasta = hueco.getBoundingClientRect();
    const cx = hasta.left + hasta.width / 2 - marco.left;
    const cy = hasta.top + hasta.height / 2 - marco.top;
    const R = Math.hypot(marco.width, marco.height);
    gsap.killTweensOf([pilo, raiz.querySelectorAll(".ep-w-centro > *, .ep-w-arriba, .ep-w-pie, .ep-dice .wd, .ep-w-segs span i")]);
    gsap.set(pilo, { transformOrigin: "0 0" });
    gsap
      .timeline({ onComplete: onFin })
      .to(raiz.querySelectorAll(".ep-w-centro > :not(.ep-w-hueco), .ep-w-arriba, .ep-w-pie, .ep-w-anillos"), { autoAlpha: 0, y: -8, duration: 0.25, ease: "power2.out" }, 0)
      .fromTo(raiz.querySelector(".ep-w-fondo"), { clipPath: `circle(${R}px at ${cx}px ${cy}px)` }, { clipPath: `circle(0px at ${cx}px ${cy}px)`, duration: 0.75, ease: "power3.inOut" }, 0.12)
      .to(pilo, { x: hasta.left - desde.left, y: hasta.top - desde.top, scale: hasta.width / desde.width, rotation: 0, duration: 0.85, ease: "power3.inOut" }, 0.08);
  };

  const avanzar = () => {
    if (paso < 0) setPaso(0);
    else if (ultima) salir();
    else setPaso(paso + 1);
  };

  // Escape salta la bienvenida; el foco no sale de ella mientras está.
  useFocusTrap(escena, true, salir);

  const teclas = useRef({ avanzar, atras: () => {} });
  teclas.current = {
    avanzar,
    atras: () => {
      if (paso > 0) setPaso(paso - 1);
    },
  };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        teclas.current.avanzar();
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        teclas.current.atras();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  const mostrada = Math.min(paso < 0 ? 0 : paso, frases.length - 1) + 1;
  const estado = sinVoz ? "La voz de Pilo no está disponible: lea a Pilo" : !vozOn ? "Voz apagada" : !armada ? "Toque la pantalla para oír a Pilo" : "Voz oficial de Pilo";
  const etiquetaVoz = sinVoz ? "La voz de Pilo no está disponible ahora" : vozOn ? "Voz de Pilo activada. Apagar" : "Voz de Pilo apagada. Activar";

  return (
    <div className="ep-w" ref={escena} role="dialog" aria-modal="true" aria-label="Bienvenida de Mr. Pilo" tabIndex={-1}>
      <div className="ep-w-fondo">
        <div className="ep-w-brillo" />
        <div className="ep-w-anillos" aria-hidden="true">
          <i style={{ width: 260, height: 260 }} />
          <i style={{ width: 420, height: 420 }} />
          <i style={{ width: 600, height: 600 }} />
        </div>
      </div>

      <header className="ep-w-arriba">
        <img src="/logo-udes.svg" alt="Universidad de Santander" />
        <button type="button" className="ep-btn ep-btn--suave" aria-pressed={!sinVoz && vozOn} aria-disabled={sinVoz || undefined} aria-label={etiquetaVoz} title={etiquetaVoz} onClick={() => {
          if (sinVoz) return;
          if (vozOn) stopOfficial();
          setVozOn(!vozOn);
        }}>
          <IconoVoz on={!sinVoz && vozOn} />
        </button>
        <button type="button" className="ep-btn ep-btn--suave" onClick={salir}>
          Saltar
        </button>
      </header>

      <div className="ep-w-centro">
        <div className="ep-w-hueco">
          <div className="ep-w-vuelo" ref={vuelo}>
            <PiloFace ref={cara} size="100%" alive label="Mr. Pilo" />
          </div>
        </div>
        <h1 className="ep-w-titulo" aria-label={titulo}>
          {titulo.split(" ").map((palabra, i) => (
            <span key={i} className="w" aria-hidden="true">
              {[...palabra].map((c, j) => (
                <span key={j} className="ch">
                  {c}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <span className="ep-w-estado">
          <i aria-hidden="true" />
          <span>{estado}</span>
        </span>
        {/* Lo que se ve aparece palabra por palabra; lo que se anuncia, la frase entera de una vez. */}
        <p className="ep-sr" aria-live="polite">
          {actual?.say}
        </p>
        <p className="ep-w-dice ep-dice" aria-hidden="true">
          {actual?.say.split(" ").map((w, i) => (
            <span key={`${actual.id}:${i}`} className="wd">
              {w}{" "}
            </span>
          ))}
        </p>
        <div className="ep-w-muestras">
          {actual?.chips.map((c) => (
            <span key={`${actual.id}:${c}`}>{c}</span>
          ))}
        </div>
      </div>

      <footer className="ep-w-pie">
        <div className="ep-w-segs">
          {frases.map((f) => (
            <span key={f.id} aria-hidden="true">
              <i />
            </span>
          ))}
          <small aria-label={`Parte ${mostrada} de ${frases.length}`}>
            {mostrada} de {frases.length}
          </small>
        </div>
        <button type="button" className="ep-btn ep-btn--pri" onClick={avanzar}>
          {ultima ? "Comenzar" : "Siguiente"}
        </button>
      </footer>
    </div>
  );
}
