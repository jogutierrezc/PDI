/* =============================================================================
   Controles del tablero: corte, periodo académico y campus.

   Viven en la URL (?corte=2024&periodo=B&campus=cucuta), así que un enlace compartido
   abre el tablero exactamente como lo vio quien lo envió. Cambiar cualquiera
   de ellos re-voltea todas las cifras a la vez: un control, todo el tablero.
   Sin ?corte, el tablero abre en "Todos": todo el periodo agrupado (promedio
   anual, o el último dato en las existencias). Sin ?periodo, las cifras son del
   año completo (calculadas de A y B).
   ========================================================================== */

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { CampusId, OpenDataCatalog, Term } from "../data/types";
import { ALL_YEARS } from "../data/terms";

export function useBoardFilters(data: OpenDataCatalog | undefined) {
  const [params, setParams] = useSearchParams();

  // Sin ?corte= se ve todo el periodo agrupado; ?corte=2024 abre ese año.
  const rawYear = Number(params.get("corte"));
  const year = data?.years.includes(rawYear) ? rawYear : ALL_YEARS;
  // ?sede= era el nombre anterior del parámetro: los enlaces viejos siguen abriendo.
  const rawCampus = (params.get("campus") ?? params.get("sede")) as CampusId | null;
  const campus: CampusId = data?.campuses.some((c) => c.id === rawCampus) && rawCampus ? rawCampus : "todas";
  const rawTerm = params.get("periodo")?.toUpperCase();
  // Los periodos A y B son de un año: con todo el periodo no aplican.
  const term: Term | null = year !== ALL_YEARS && (rawTerm === "A" || rawTerm === "B") ? rawTerm : null;

  const update = useCallback(
    (key: "corte" | "campus" | "periodo", value: string, fallback: string) => {
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
    (value: number) => update("corte", String(value), String(ALL_YEARS)),
    [update],
  );
  const setCampus = useCallback((value: CampusId) => update("campus", value, "todas"), [update]);
  const setTerm = useCallback((value: Term | null) => update("periodo", value ?? "", ""), [update]);

  return { year, term, campus, setYear, setTerm, setCampus, search: params.toString() };
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
  term,
  campus,
  setYear,
  setTerm,
  setCampus,
}: {
  data: OpenDataCatalog;
  year: number;
  term: Term | null;
  campus: CampusId;
  setYear: (year: number) => void;
  setTerm: (term: Term | null) => void;
  setCampus: (campus: CampusId) => void;
}) {
  return (
    <div className="od-controls">
      <Segmented
        label="Corte"
        options={[
          { value: ALL_YEARS, label: "Todos" },
          ...data.years.map((y) => ({ value: y, label: String(y) })),
        ]}
        value={year}
        onChange={(value) => {
          if (value === ALL_YEARS) setTerm(null);
          setYear(value);
        }}
      />
      {year !== ALL_YEARS && (
        <Segmented
          label="Periodo"
          options={[
            { value: "anual", label: "Año" },
            { value: "A", label: "A" },
            { value: "B", label: "B" },
          ]}
          value={term ?? "anual"}
          onChange={(value) => setTerm(value === "anual" ? null : (value as Term))}
        />
      )}
      <Segmented
        label="Campus"
        options={data.campuses.map((c) => ({ value: c.id, label: c.id === "todas" ? "Todos" : c.name }))}
        value={campus}
        onChange={setCampus}
      />
    </div>
  );
}
