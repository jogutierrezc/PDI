/* =============================================================================
   Conmutador tabla ↔ gráfica.

   La misma cifra admite dos lecturas y ninguna sustituye a la otra: la tabla es
   el dato exacto —y la lectura accesible de referencia, la que funciona con
   lector de pantalla, en papel y bajo cualquier daltonismo—; la gráfica es la
   comparación de un vistazo, que en una rejilla de cinco años cuesta hacer
   contando números.

   Va *encima* de lo que gobierna, nunca dentro de una tarjeta: una pantalla
   con varias tablas cambia entera, para que dos bloques contiguos no queden
   uno en cada modo.

   Dos opciones excluyentes: `radiogroup`, no dos botones sueltos. Las flechas
   recorren las opciones y el grupo entero es una sola parada del tabulador.
   ========================================================================== */

import { useId } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export type ResultView = "table" | "chart";

interface ViewToggleProps {
  value: ResultView;
  onChange: (value: ResultView) => void;
  label: string;
  /** Cuando no hay serie anual que dibujar, la gráfica no se ofrece. */
  chartDisabled?: boolean;
  disabledHint?: string;
}

const options: { id: ResultView; label: string; icon: IconName }[] = [
  { id: "table", label: "Tabla", icon: "table" },
  { id: "chart", label: "Gráfica", icon: "chart" },
];

export function ViewToggle({ value, onChange, label, chartDisabled, disabledHint }: ViewToggleProps) {
  const labelId = useId();

  function onKeyDown(event: React.KeyboardEvent) {
    const index = options.findIndex((option) => option.id === value);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    else return;

    event.preventDefault();
    const target = options[Math.min(Math.max(next, 0), options.length - 1)];
    if (target.id === "chart" && chartDisabled) return;
    onChange(target.id);
  }

  return (
    <div className="view-toggle">
      <span className="view-toggle__label" id={labelId}>
        {label}
      </span>

      <div className="view-toggle__group" role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}>
        {options.map((option) => {
          const active = option.id === value;
          const off = option.id === "chart" && chartDisabled;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={off}
              title={off ? disabledHint : undefined}
              tabIndex={active ? 0 : -1}
              className={`view-toggle__option${active ? " is-active" : ""}`}
              onClick={() => onChange(option.id)}
            >
              <Icon name={option.icon} size={15} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
