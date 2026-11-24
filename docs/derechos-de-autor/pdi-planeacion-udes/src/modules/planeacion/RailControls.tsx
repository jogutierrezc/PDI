/* =============================================================================
   Portal de Planeación · los mandos de un carril.

   La escala graduada y el contador nacieron en la galería —el lenguaje del
   plano del encabezado en lugar de los puntitos de siempre— y valen igual para
   el equipo, que es la lista larga: con siete personas y cinco a la vista, las
   flechas solas no dicen cuántas quedan.

   La escala no recibe el tabulador: es un duplicado de las flechas, que sí lo
   reciben y llevan su rótulo. Quien navega con el teclado no tiene por qué
   recorrer siete marcas para llegar al siguiente bloque.
   ========================================================================== */

import { Icon } from "../../components/ui/Icon";
import type { Rail } from "./rail";

interface RailProps {
  rail: Rail<HTMLUListElement>;
  count: number;
}

/** En qué punto de la serie va: la escala y la cifra. */
export function RailPosition({ rail, count, goToLabel }: RailProps & { goToLabel: (position: number) => string }) {
  if (count < 2) return null;
  return (
    <>
      <span className="pl-scale" aria-hidden="true">
        {Array.from({ length: count }, (_, position) => (
          <button
            key={position}
            type="button"
            tabIndex={-1}
            title={goToLabel(position)}
            data-on={position <= rail.index || undefined}
            data-here={position === rail.index || undefined}
            onClick={() => rail.goTo(position)}
          />
        ))}
      </span>
      <span className="pl-rail-count">
        <b>{rail.index + 1}</b>
        <span aria-hidden="true">/</span>
        <span className="sr-only">de</span>
        {count}
      </span>
    </>
  );
}

/** Anterior y siguiente. Se apagan en los extremos de verdad del carril. */
export function RailArrows({
  rail,
  count,
  previousLabel,
  nextLabel,
}: RailProps & { previousLabel: string; nextLabel: string }) {
  if (count < 2) return null;
  return (
    <span className="pl-rail-arrows">
      <button type="button" onClick={rail.previous} disabled={rail.atStart} aria-label={previousLabel}>
        <Icon name="arrow-left" size={18} />
      </button>
      <button type="button" onClick={rail.next} disabled={rail.atEnd} aria-label={nextLabel}>
        <Icon name="arrow-right" size={18} />
      </button>
    </span>
  );
}
