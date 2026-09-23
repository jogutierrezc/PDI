/* =============================================================================
   La oferta de programas, filtrable por facultad, campus y nivel.

   Es la lente de programas de la portada. Los filtros viven en la dirección
   (?lente=programa&facultad=…&campus=…&nivel=…), así que un enlace lleva a la
   misma oferta filtrada. Cada opción dice cuántos programas quedarían y las
   que dejarían la lista vacía se ven, pero apagadas: se sabe de antemano que
   esa facultad no ofrece nada en esa sede.

   Cada programa muestra su nivel y sus sedes: la oferta se lee de un vistazo,
   sin entrar a cada uno.
   ========================================================================== */

import { useId } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { DEGREES } from "../data/catalog";
import type { PortalData } from "../data/lens";
import { campusNames, emptyMessage, facets, filterPrograms, readFilter, summary } from "../data/offer";
import type { FacetOption, OfferFilter } from "../data/offer";
import { pebbleShape } from "./shared";

export function ProgramOffer({ data, withData }: { data: PortalData; withData: (slug: string) => number }) {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params, data);
  const list = filterPrograms(data, filter);
  const options = facets(data, filter);
  const active = Boolean(filter.facultad || filter.campus || filter.nivel);

  const set = (change: Partial<OfferFilter>) => {
    const next = new URLSearchParams(params);
    next.set("lente", "programa");
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="imp-offer" id="lente-panel" role="tabpanel" aria-labelledby="lente-programa">
      <div className="imp-offer__filters" role="group" aria-label="Filtrar la oferta de programas">
        <Facet label="Facultad" all="Todas las facultades" value={filter.facultad} options={options.facultades} onChange={(v) => set({ facultad: v })} />
        <Facet label="Campus" all="Todos los campus" value={filter.campus} options={options.campus} onChange={(v) => set({ campus: v })} />
        <Facet
          label="Nivel de formación"
          all="Todos los niveles"
          value={filter.nivel}
          options={options.niveles}
          onChange={(v) => set({ nivel: v as OfferFilter["nivel"] })}
        />
        {active && (
          <button type="button" className="imp-offer__clear" onClick={() => set({ facultad: null, campus: null, nivel: null })}>
            <Icon name="close" size={14} /> Quitar filtros
          </button>
        )}
      </div>

      <p className="imp-offer__summary" aria-live="polite">
        <strong>{summary(data, filter, list.length)}</strong>
      </p>

      {list.length === 0 ? (
        <p className="imp-offer__empty">{emptyMessage(data, filter)}</p>
      ) : (
        <ul className="imp-stones">
          {list.map((program) => {
            const faculty = program.faculty ? data.facultyBySlug.get(program.faculty) : undefined;
            const sites = campusNames(data, program);
            const count = withData(program.slug);
            return (
              <li key={program.slug}>
                <Link
                  to={`/impacto/programa/${program.slug}`}
                  className="imp-stone imp-offer__program"
                  style={{ "--shape": pebbleShape(program.slug) } as CSSProperties}
                >
                  <span className="imp-stone__detail">
                    {faculty?.code ?? "Sin facultad"}
                    {program.degree && <span className="imp-offer__level">{DEGREES[program.degree]}</span>}
                  </span>
                  <strong>{program.name}</strong>
                  <span className="imp-offer__sites">
                    <Icon name="pin" size={13} />
                    {sites.length > 0 ? sites.join(" · ") : "Sin sede activa"}
                  </span>
                  <span className="imp-stone__count">
                    {count} {count === 1 ? "indicador con cifra" : "indicadores con cifra"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Facet({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string | null;
  options: FacetOption[];
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  return (
    <label className="imp-offer__facet" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.slug} value={o.slug} disabled={o.count === 0 && o.slug !== value}>
            {o.name} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}
