/* =============================================================================
   Controles del tablero: corte y campus.

   Viven en la URL (?corte=2024&campus=cucuta), así que un enlace compartido
   abre el tablero exactamente como lo vio quien lo envió. Cambiar cualquiera
   de los dos re-voltea todas las cifras a la vez: un control, todo el tablero.
   ========================================================================== */

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { CampusId, OpenDataCatalog } from "../data/types";

export function useBoardFilters(data: OpenDataCatalog | undefined) {
  const [params, setParams] = useSearchParams();

  const rawYear = Number(params.get("corte"));
  const year = data?.years.includes(rawYear) ? rawYear : (data?.currentYear ?? 0);
  // ?sede= era el nombre anterior del parámetro: los enlaces viejos siguen abriendo.
  const rawCampus = (params.get("campus") ?? params.get("sede")) as CampusId | null;
  const campus: CampusId = data?.campuses.some((c) => c.id === rawCampus) && rawCampus ? rawCampus : "todas";

  const update = useCallback(
    (key: "corte" | "campus", value: string, fallback: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("sede");
          if (value === fallback) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  const setYear = useCallback(
    (value: number) => update("corte", String(value), String(data?.currentYear)),
    [update, data?.currentYear],
  );
  const setCampus = useCallback((value: CampusId) => update("campus", value, "todas"), [update]);

  return { year, campus, setYear, setCampus, search: params.toString() };
}

interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Grupo de opciones con flechas, como un radio nativo. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="od-segmented">
      <span className="od-segmented__label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="od-segmented__track" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={String(option.value)}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="od-segmented__option"
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BoardControls({
  data,
  year,
  campus,
  setYear,
  setCampus,
}: {
  data: OpenDataCatalog;
  year: number;
  campus: CampusId;
  setYear: (year: number) => void;
  setCampus: (campus: CampusId) => void;
}) {
  return (
    <div className="od-controls">
      <Segmented
        label="Corte"
        options={data.years.map((y) => ({ value: y, label: String(y) }))}
        value={year}
        onChange={setYear}
      />
      <Segmented
        label="Campus"
        options={data.campuses.map((c) => ({ value: c.id, label: c.id === "todas" ? "Todos" : c.name }))}
        value={campus}
        onChange={setCampus}
      />
    </div>
  );
}
