/* =============================================================================
   Contactos · público · paso 4, «Recibido».

   Pilo celebra: el titular («¡Felicidades! Los datos compartidos fueron recibidos
   con éxito.») lo pone la página; aquí va el resumen y las dos salidas. Sale cada
   vez que un envío termina bien (uno a uno al terminar, y al importar un archivo).

   Movimiento: chispas sutiles alrededor de la cara (10 puntos, 300 ms, expo.out,
   dentro de un contexto de GSAP que se revierte al salir). Con movimiento reducido,
   solo un fundido.
   ========================================================================== */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { movimientoReducido } from "../../ui/movimiento";
import { CaraPilo, useDecir } from "./GuiaPilo";

const CHISPAS = 10;

export function Recibido({
  contactos,
  campus,
  periodo,
  nombre,
  onMas,
  onMis,
}: {
  contactos: number;
  campus: string;
  periodo: string;
  nombre: string;
  onMas: () => void;
  onMis: () => void;
}) {
  const decir = useDecir();
  const aro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    decir("Lo logró. Sus contactos ya están con Planeación Institucional. Si recuerda más, puede enviarlos cuando quiera con este mismo enlace.", "excelente");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar
  }, []);

  useEffect(() => {
    const nodo = aro.current;
    if (!nodo) return;
    const ctx = gsap.context(() => {
      const cara = nodo.querySelector("img");
      if (movimientoReducido()) {
        gsap.fromTo(nodo, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "power2.out", clearProps: "opacity" });
        return;
      }
      if (cara) gsap.fromTo(cara, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: "expo.out", clearProps: "transform" });
      nodo.querySelectorAll<HTMLElement>("[data-chispa]").forEach((el, i, todas) => {
        const angulo = (i / todas.length) * Math.PI * 2;
        const radio = 70 + (i % 3) * 8;
        gsap.fromTo(el, { x: 0, y: 0, opacity: 0, scale: 0.6 }, { x: Math.cos(angulo) * radio, y: Math.sin(angulo) * radio, opacity: 1, scale: 1, duration: 0.3, ease: "expo.out", delay: 0.08 + i * 0.02 });
        gsap.to(el, { opacity: 0, duration: 0.25, ease: "power2.out", delay: 0.6 });
      });
    }, nodo);
    return () => ctx.revert();
  }, []);

  const terminar = () => decir(`Gracias, ${nombre.split(" ")[0]}. Ya puede cerrar esta página. ¡Hasta pronto!`, "feliz");

  return (
    <section className="cp-panel cp-recibido" aria-label="Contactos recibidos">
      <div className="cp-aro" ref={aro}>
        <CaraPilo gesto="excelente" tamano={104} />
        {Array.from({ length: CHISPAS }, (_, i) => (
          <i className="cp-chispa" data-chispa aria-hidden="true" key={i} />
        ))}
      </div>
      <div data-entra>
        <h2>Recibido con éxito</h2>
        <p className="cp-sub">Planeación Institucional ya tiene sus contactos.</p>
      </div>
      <dl className="cp-resumen" data-entra>
        <div>
          <dt>{contactos === 1 ? "Contacto recibido" : "Contactos recibidos"}</dt>
          <dd>{contactos}</dd>
        </div>
        {campus && (
          <div>
            <dt>Campus</dt>
            <dd>{campus}</dd>
          </div>
        )}
        <div>
          <dt>Periodo</dt>
          <dd>{periodo}</dd>
        </div>
      </dl>
      <div className="cp-acciones cp-centro" data-entra>
        <button type="button" className="cp-btn cp-btn--suave" onClick={onMas}>
          Enviar más contactos
        </button>
        <button type="button" className="cp-btn cp-btn--pri" onClick={terminar}>
          Terminar
        </button>
      </div>
      <button type="button" className="cp-enlace" onClick={onMis} data-entra>
        Ver lo que he enviado
      </button>
    </section>
  );
}
