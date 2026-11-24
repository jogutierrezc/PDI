/* =============================================================================
   Encuestas con Pilo · la guía: Pilo al lado del formulario con su globo.
   Aquí Pilo solo escribe (la voz es de la bienvenida y la despedida): cada paso
   cambia lo que dice, su gesto y, a veces, asiente.
   ========================================================================== */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import type { PiloExpression, PiloFaceHandle } from "../../../components/pilo/PiloFace";
import { useHabla } from "./habla";

export interface MensajeGuia {
  id: number;
  texto: string;
  gesto: PiloExpression;
  asiente?: boolean;
}

export const Guia = forwardRef<HTMLDivElement, { mensaje: MensajeGuia; oculta: boolean }>(function Guia({ mensaje, oculta }, ref) {
  const raiz = useRef<HTMLElement>(null);
  const cara = useRef<PiloFaceHandle>(null);
  const hueco = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => hueco.current as HTMLDivElement);

  useEffect(() => {
    cara.current?.expression(mensaje.gesto);
    if (mensaje.asiente) cara.current?.nod();
  }, [mensaje.id, mensaje.gesto, mensaje.asiente]);

  useHabla({ raiz, cara, id: mensaje.id, texto: mensaje.texto, conVoz: false });

  return (
    <aside className="ep-guia" aria-label="Mr. Pilo, su guía" ref={raiz}>
      <div className="ep-guia__pilo" ref={hueco} style={oculta ? { visibility: "hidden" } : undefined}>
        <PiloFace ref={cara} size="100%" alive label="Mr. Pilo" />
      </div>
      <p className="ep-globo ep-dice" aria-hidden="true">
        {mensaje.texto.split(" ").map((w, i) => (
          <span key={`${mensaje.id}:${i}`} className="wd">
            {w}{" "}
          </span>
        ))}
      </p>
      <p className="ep-sr" aria-live="polite">
        {mensaje.texto}
      </p>
    </aside>
  );
});
