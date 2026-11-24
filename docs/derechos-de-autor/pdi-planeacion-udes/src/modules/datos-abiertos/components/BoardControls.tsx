/* =============================================================================
   Controles del tablero: corte, periodo académico y campus.

   Viven en la URL (?corte=2024&periodo=B&campus=cucuta), así que un enlace
   compartido abre el tablero exactamente como lo vio quien lo envió. Cambiar
   cualquiera de ellos re-voltea todas las cifras a la vez: un control, todo el
   tablero.

   La lectura es primero por periodo: sin ?corte, el tablero abre en el periodo
   más reciente con dato (ver `startingCut` en data/period-reading.ts). Un año
   sin ?periodo abre en su periodo más reciente; ?periodo=anual pide la cifra
   del año y ?corte=todos, todo el periodo agrupado. Las dos siguen ahí, como
   lecturas secundarias.

   Elegir un corte no es navegar: la URL se reemplaza sin mover la página
   (ScrollManager solo reposiciona cuando cambia la ruta o el ancla) y el ancla
   que hubiera se conserva.
   ========================================================================== */

import { useCallback, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { CampusId, OpenDataCatalog, Report, Term } from "../data/types";
import { ALL_YEARS, termLabel } from "../data/terms";
import { cutForYear, cutFromParams, cutToParams, startingCut } from "../data/period-reading";
import type { Cut, CutScope } from "../data/period-reading";

const EMPTY_SCOPE: CutScope = { indicators: [], breakdowns: [] };

/**
 * `report`: la ficha de un informe abre en el periodo más reciente de *sus*
 * cifras; sin informe (la portada), en el del catálogo entero.
 */
export function useBoardFilters(data: OpenDataCatalog | undefined, report?: Report) {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const scope = useMemo<CutScope>(() => {
    if (report) return report;
    if (!data) return EMPTY_SCOPE;
    return { indicators: data.reports.flatMap((r) => r.indicators), breakdowns: data.reports.flatMap((r) => r.breakdowns) };
  }, [data, report]);
  const years = data?.years;
  const start = useMemo<Cut>(() => (years ? startingCut(scope, years) : { year: ALL_YEARS, term: null }), [scope, years]);

  const rawCorte = params.get("corte");
  const rawPeriodo = params.get("periodo");
  const cut = useMemo<Cut>(
    () => (years ? cutFromParams({ corte: rawCorte, periodo: rawPeriodo }, scope, years) : { year: ALL_YEARS, term: null }),
    [rawCorte, rawPeriodo, scope, years],
  );
  const { year, term } = cut;
  // ?sede= era el nombre anterior del parámetro: los enlaces viejos siguen abriendo.
  const rawCampus = (params.get("campus") ?? params.get("sede")) as CampusId | null;
  const campus: CampusId = data?.campuses.some((c) => c.id === rawCampus) && rawCampus ? rawCampus : "todas";

  /** Una sola escritura por cambio: dos seguidas se pisarían (la segunda no ve la primera). */
  const write = useCallback(
    (change: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      next.delete("sede");
      change(next);
      const search = next.toString();
      // Reemplaza la entrada (no apila historial) y conserva el ancla de la URL.
      navigate({ search: search ? `?${search}` : "", hash }, { replace: true, preventScrollReset: true });
    },
    [params, navigate, hash],
  );

  const setCut = useCallback(
    (nextCut: Cut) =>
      write((next) => {
        const { corte, periodo } = cutToParams(nextCut, start);
        if (corte === null) next.delete("corte");
        else next.set("corte", corte);
        if (periodo === null) next.delete("periodo");
        else next.set("periodo", periodo);
      }),
    [write, start],
  );
  const setYear = useCallback((value: number) => setCut(cutForYear(scope, value, cut)), [setCut, scope, cut]);
  const setTerm = useCallback((value: Term | null) => setCut({ year: cut.year, term: cut.year === ALL_YEARS ? null : value }), [setCut, cut]);
  const setCampus = useCallback(
    (value: CampusId) =>
      write((next) => {
        if (value === "todas") next.delete("campus");
        else next.set("campus", value);
      }),
    [write],
  );

  return { year, term, campus, setYear, setTerm, setCut, setCampus, search: params.toString() };
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
      {/* Los años primero y «Todos» al final: la lectura agrupada es la secundaria. */}
      <Segmented
        label="Corte"
        options={[
          ...data.years.map((y) => ({ value: y, label: String(y) })),
          { value: ALL_YEARS, label: "Todos" },
        ]}
        value={year}
        onChange={setYear}
      />
      {year !== ALL_YEARS && (
        <Segmented
          label="Periodo"
          options={[
            { value: "A", label: termLabel("A") },
            { value: "B", label: termLabel("B") },
            { value: "anual", label: "Año" },
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
