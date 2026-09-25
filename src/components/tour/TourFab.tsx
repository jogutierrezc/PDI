/* =============================================================================
   Recorridos guiados · el botón de Mr. Pilo en los portales públicos.

   En las portadas que tienen recorrido (Planeación, PDI, UDES en Cifras)
   aparece Mr. Pilo en la esquina. La primera visita, un globo pequeño
   ofrece el recorrido una sola vez; nunca arranca solo, para no interrumpir
   a quien llega de fuera. Se recuerda en el navegador.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PiloAvatar } from "../pilo/PiloAvatar";
import { useTour } from "./TourProvider";
import { publicTourFor } from "./tours";
import { usePiloAiHere } from "../pilo/ai/config";

const PEEK_KEY = "recorridos:ofrecido";

export function TourFab() {
  const { pathname } = useLocation();
  const { start, active, isDone } = useTour();
  const tour = publicTourFor(pathname);
  // Donde está Mr. Pilo con IA, él ofrece el recorrido desde su panel.
  const ai = usePiloAiHere();
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    setPeek(false);
    if (!tour) return;
    let offered: string[] = [];
    try {
      offered = JSON.parse(window.localStorage.getItem(PEEK_KEY) ?? "[]") as string[];
    } catch {
      /* sin almacenamiento: se ofrece igual, una vez por visita */
    }
    if (offered.includes(tour.id) || isDone(tour.id)) return;
    const timer = window.setTimeout(() => {
      setPeek(true);
      try {
        window.localStorage.setItem(PEEK_KEY, JSON.stringify([...offered, tour.id]));
      } catch {
        /* nada */
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [tour, isDone]);

  if (!tour || active || ai.active) return null;

  return (
    <div className="tour-fab">
      {peek && (
        <div className="tour-fab__peek" role="status">
          <strong>¿Primera vez aquí?</strong>
          <span>Le muestro cómo funciona este portal en un minuto.</span>
          <div>
            <button type="button" className="button-primary" onClick={() => start(tour.id)}>
              Mostrarme
            </button>
            <button type="button" className="button-ghost" onClick={() => setPeek(false)}>
              Ahora no
            </button>
          </div>
        </div>
      )}
      <button type="button" className="tour-fab__button" aria-label={tour.title} title={tour.title} onClick={() => start(tour.id)}>
        <PiloAvatar mood={peek ? "idea" : "feliz"} size={50} />
      </button>
    </div>
  );
}
