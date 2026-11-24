/* =============================================================================
   Encuestas con Pilo · la despedida.

   Pilo agradece, dice el mensaje de despedida de la encuesta y se va volando.
   Luego queda la pantalla de gracias con lo que se recibió. La voz es la oficial
   (si no hay audio, todo sigue en texto); «Saltar» lleva directo a las gracias.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { PiloFace } from "../../../components/pilo/PiloFace";
import type { PiloFaceHandle } from "../../../components/pilo/PiloFace";
import { useFocusTrap } from "../../pilo-app/Layer";
import { frasesDespedida } from "./frases";
import { precargarVoz, sinMovimiento, stopOfficial, useHabla } from "./habla";

export interface ResumenEnvio {
  dependencia: string;
  aportes: number;
  logros: number;
  retos: number;
  cifras: number;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function Despedida({ despedida, resumen, onOtro }: { despedida: string; resumen: ResumenEnvio; onOtro: () => void }) {
  const escena = useRef<HTMLDivElement>(null);
  const vuelo = useRef<HTMLDivElement>(null);
  const cara = useRef<PiloFaceHandle>(null);
  const [paso, setPaso] = useState(0);
  const [fase, setFase] = useState<"habla" | "vuelo" | "gracias">("habla");
  const [sinVoz, setSinVoz] = useState(false);
  const pausa = useRef<gsap.core.Tween | null>(null);

  const frases = useMemo(() => frasesDespedida(despedida), [despedida]);
  const actual = frases[Math.min(paso, frases.length - 1)];

  useLayoutEffect(() => {
    precargarVoz(frases.map((f) => f.say));
    const ctx = gsap.context(() => {
      gsap.fromTo(escena.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: sinMovimiento() ? 0.01 : 0.3, ease: "power2.out" });
      if (!sinMovimiento()) gsap.from(vuelo.current, { y: 90, scale: 0.86, autoAlpha: 0, duration: 0.7, ease: "back.out(1.5)", delay: 0.15 });
    }, escena);
    return () => {
      ctx.revert();
      pausa.current?.kill();
      stopOfficial();
    };
  }, [frases]);

  // Cada frase: su gesto y su mirada.
  useLayoutEffect(() => {
    if (fase !== "habla") return;
    cara.current?.expression(actual.face);
    cara.current?.look(...actual.look);
    cara.current?.blink();
    if (paso !== 1) cara.current?.nod();
  }, [paso, fase, actual]);

  const despegar = () => {
    pausa.current?.kill();
    stopOfficial();
    cara.current?.talk(false);
    if (sinMovimiento()) return setFase("gracias");
    setFase("vuelo");
    cara.current?.expression("emocionado");
    cara.current?.look(0.9, -0.8);
    gsap
      .timeline({ onComplete: () => setFase("gracias") })
      .to(".ep-d-dice", { autoAlpha: 0, duration: 0.3 }, 0)
      .to(vuelo.current, { y: 14, scaleY: 0.94, duration: 0.22, ease: "power2.out" }, 0)
      .to(".ep-d-brillo", { scale: 0.4, autoAlpha: 0, duration: 0.9, ease: "power2.in" }, 0.2)
      .to(vuelo.current, { y: -window.innerHeight * 0.9, x: window.innerWidth * 0.18, scale: 0.55, rotation: 14, scaleY: 1, duration: 1.15, ease: "power2.in" }, 0.22);
  };

  useHabla({
    raiz: escena,
    cara,
    id: fase === "habla" ? `${paso}:${actual.id}` : null,
    texto: actual.say,
    conVoz: !sinVoz,
    onSinVoz: () => setSinVoz(true),
    onFin: () => {
      pausa.current = gsap.delayedCall(sinMovimiento() ? 0.2 : paso + 1 >= frases.length ? 0.5 : 1.2, () => {
        if (paso + 1 >= frases.length) despegar();
        else setPaso(paso + 1);
      });
    },
  });

  // Enfocar el botón de las gracias cuando aparecen.
  useLayoutEffect(() => {
    if (fase !== "gracias") return;
    const ctx = gsap.context(() => {
      const hijos = gsap.utils.toArray<HTMLElement>(".ep-d-gracias > *");
      gsap.from(hijos, { autoAlpha: 0, y: sinMovimiento() ? 0 : 16, duration: sinMovimiento() ? 0.01 : 0.5, stagger: 0.08, ease: "power3.out" });
    }, escena);
    escena.current?.querySelector<HTMLButtonElement>(".ep-d-otro")?.focus();
    return () => ctx.revert();
  }, [fase]);

  useFocusTrap(escena, true, () => {
    if (fase === "habla") despegar();
  });

  return (
    <div className="ep-d" ref={escena} role="dialog" aria-modal="true" aria-label="Despedida de Mr. Pilo" tabIndex={-1}>
      <div className="ep-w-fondo">
        <div className="ep-w-brillo ep-d-brillo" />
      </div>

      {fase !== "gracias" && (
        <>
          <div className="ep-d-arriba">
            <button type="button" className="ep-btn ep-btn--suave" onClick={despegar} disabled={fase === "vuelo"}>
              Saltar
            </button>
          </div>
          <div className="ep-d-centro">
            <div className="ep-d-hueco">
              <div ref={vuelo} className="ep-w-vuelo">
                <PiloFace ref={cara} size="100%" alive label="Mr. Pilo" />
              </div>
            </div>
            <p className="ep-sr" aria-live="polite">
              {actual.say}
            </p>
            <p className="ep-w-dice ep-d-dice ep-dice" aria-hidden="true">
              {fase === "habla" &&
                actual.say.split(" ").map((w, i) => (
                  <span key={`${paso}:${i}`} className="wd">
                    {w}{" "}
                  </span>
                ))}
            </p>
          </div>
        </>
      )}

      {fase === "gracias" && (
        <div className="ep-d-gracias">
          <img src="/logo-udes.svg" alt="Universidad de Santander" />
          <h1>Gracias por construir con nosotros</h1>
          <p>
            Recibimos {plural(resumen.aportes, "aporte", "aportes")} de {resumen.dependencia}. El equipo de Planeación Institucional los revisará.
          </p>
          <div className="ep-d-resumen">
            <span className="ep-tag ep-tag--logro">{plural(resumen.logros, "logro", "logros")}</span>
            <span className="ep-tag ep-tag--reto">{plural(resumen.retos, "reto", "retos")}</span>
            <span className="ep-tag ep-tag--logro">{plural(resumen.cifras, "cifra", "cifras")}</span>
          </div>
          <button type="button" className="ep-btn ep-d-otro" onClick={onOtro}>
            Enviar otro aporte
          </button>
        </div>
      )}
    </div>
  );
}
