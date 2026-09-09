/* =============================================================================
   Barra de años del plan.

   Seis paradas —el plan entero y sus cinco cortes— sobre un mismo raíl. No es
   solo un filtro: cada parada lleva su cifra y su barrita, de modo que la
   propia barra es ya la lectura del quinquenio. Mover el selector cambia lo que
   se mira; no hace falta moverlo para ver cómo fue cada año.

   Se hace con botones y no con un <input type="range"> aunque "deslizar" sea la
   metáfora: un rango nativo no puede llevar una cifra y una banda de color en
   cada tope, no anuncia a un lector de pantalla qué significa cada posición, y
   el salto a un año concreto exige apuntar en píxeles en vez de pulsar. El
   resaltado que se desplaza da la sensación de recorrido; el marcado dice la
   verdad: son seis opciones excluyentes.

   Igual que en FilterChips, el resaltado es un único elemento que se mueve con
   una transición de CSS sobre transform y width: corre fuera del hilo
   principal y es interrumpible a media animación.
   ========================================================================== */

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { bandFor, planYears } from "../../data/pdi";
import type { YearScope, YearStop } from "../../data/pdi";

interface YearScrubberProps {
  value: YearScope;
  onChange: (value: YearScope) => void;
  /** Los cinco años del plan, con hueco donde no hay dato. */
  series: YearStop[];
  /** Avance del plan, ponderado hasta el último año del horizonte. */
  plan: number;
  label: string;
  /** Nota bajo la barra: de dónde sale la cifra que se está mirando. */
  hint?: string;
}

interface Rect {
  x: number;
  width: number;
}

export function YearScrubber({ value, onChange, series, plan, label, hint }: YearScrubberProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const labelId = useId();

  const stops: { id: YearScope; caption: string; progress: number | null }[] = [
    { id: "plan", caption: `Plan ${planYears[0]}-${planYears[planYears.length - 1]}`, progress: plan },
    ...series.map((stop) => ({
      id: stop.year as YearScope,
      caption: String(stop.year),
      progress: stop.progress,
    })),
  ];

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>("[data-active='true']");
    if (!active) {
      setRect(null);
      return;
    }
    setRect({ x: active.offsetLeft, width: active.offsetWidth });
  }, []);

  // Medir antes del pintado: si no, el resaltado se ve saltar al montar.
  useLayoutEffect(measure, [measure, value, series.length]);

  /** Flechas y Inicio/Fin recorren las paradas, como en cualquier grupo de
   *  opciones. Es lo que hace que la barra se pueda "deslizar" sin ratón. */
  function onKeyDown(event: React.KeyboardEvent) {
    const index = stops.findIndex((stop) => stop.id === value);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stops.length - 1;
    else return;

    event.preventDefault();
    const target = stops[Math.min(Math.max(next, 0), stops.length - 1)];
    onChange(target.id);
  }

  return (
    <div className="year-scrubber">
      <span className="year-scrubber__label" id={labelId}>
        {label}
      </span>

      <div
        ref={railRef}
        className="year-scrubber__rail"
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
      >
        {rect && (
          <span
            className="year-scrubber__marker"
            aria-hidden="true"
            style={{ transform: `translateX(${rect.x}px)`, width: `${rect.width}px` }}
          />
        )}

        {stops.map((stop) => {
          const active = stop.id === value;
          const band = stop.progress === null ? null : bandFor(stop.progress);

          return (
            <button
              key={String(stop.id)}
              type="button"
              role="radio"
              aria-checked={active}
              data-active={active}
              // Tabulación itinerante: el grupo entero es una sola parada del
              // tabulador y dentro se navega con las flechas.
              tabIndex={active ? 0 : -1}
              className={`year-scrubber__stop${stop.id === "plan" ? " is-plan" : ""}`}
              onClick={() => onChange(stop.id)}
            >
              <span className="year-scrubber__caption">{stop.caption}</span>
              <strong className="year-scrubber__value">
                {stop.progress === null ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">sin reportar</span>
                  </>
                ) : (
                  `${stop.progress} %`
                )}
              </strong>
              {/* La barrita es refuerzo: la cifra y el nombre de la banda van
                  siempre, porque la escala naranja→verde no se distingue bajo
                  daltonismo. */}
              <span className="year-scrubber__meter" aria-hidden="true">
                {band && (
                  <span style={{ width: `${stop.progress}%`, background: band.color }} />
                )}
              </span>
              {band && <span className="sr-only">{band.label}</span>}
            </button>
          );
        })}
      </div>

      {hint && <p className="year-scrubber__hint">{hint}</p>}
    </div>
  );
}
