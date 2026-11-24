/* =============================================================================
   Barra de contexto.

   Movimiento constante, así que curva `linear`: cualquier otra cosa haría que el
   cintillo acelerara y frenara sin motivo. Se detiene al pasar el cursor y
   mientras algo dentro tenga el foco — si no, leer una frase sería perseguirla.

   La segunda copia de la lista existe solo para que el bucle no tenga costura:
   va oculta para lectores de pantalla, que reciben la primera una sola vez.
   ========================================================================== */

import { contextFacts } from "./content";

export function ContextTicker() {
  return (
    <section className="context-ticker" aria-label="El PDI en contexto">
      <div className="context-ticker__viewport">
        <div className="context-ticker__rail">
          <TickerLane />
          <TickerLane duplicate />
        </div>
      </div>
    </section>
  );
}

function TickerLane({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <ul className="context-ticker__lane" aria-hidden={duplicate || undefined}>
      {contextFacts.map((fact) => (
        <li className="context-ticker__item" key={fact.figure}>
          <strong>{fact.figure}</strong>
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}
