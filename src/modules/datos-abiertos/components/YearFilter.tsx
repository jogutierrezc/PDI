import { useState } from "react";

/** Filtro de consulta; no modifica los años habilitados en la captura. */
export function useVisibleYears(available: number[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; years: number[] | null }>({ scope, years: null });
  const requested = selection.scope === scope ? selection.years : null;
  const matches = requested?.filter((year) => available.includes(year));
  const selected = matches?.length ? matches : null;
  return { years: selected ?? available, selected, select: (years: number[] | null) => setSelection({ scope, years }) };
}

export function YearFilter({ available, selected, onChange }: {
  available: number[]; selected: number[] | null; onChange: (years: number[] | null) => void;
}) {
  return (
    <fieldset className="od-year-filter">
      <legend>Años visibles</legend>
      <label><input type="checkbox" checked={selected === null} onChange={(e) => onChange(e.target.checked ? null : available.slice(-1))} /> Todos los años</label>
      {available.map((year) => {
        const chosen = selected ?? available;
        const checked = chosen.includes(year);
        return <label key={year}><input type="checkbox" checked={checked} disabled={checked && chosen.length === 1}
          onChange={() => { const next = checked ? chosen.filter((y) => y !== year) : [...chosen, year].sort((a, b) => a - b); onChange(next.length === available.length ? null : next); }} /> {year}</label>;
      })}
    </fieldset>
  );
}
