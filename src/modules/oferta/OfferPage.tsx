/* =============================================================================
   Oferta de programas, filtrable por facultad, campus y nivel.

   Los filtros viven en la dirección (?facultad=…&campus=…&nivel=…), así que
   un enlace lleva a la misma oferta filtrada. Cada opción dice cuántos
   programas quedarían y las que dejarían la lista vacía se ven, pero
   apagadas: se sabe de antemano que esa facultad no ofrece nada en esa sede.

   Cada programa muestra su facultad, su nivel y sus sedes: la oferta se lee de
   un vistazo. Se consulta con sesión, como antes dentro de Impacto.
   ========================================================================== */

import { useEffect, useId } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteHeader } from "../../components/layout/SiteHeader";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { DEGREE_LABEL } from "../admin/institucion/institution-model";
import { campusNames, emptyMessage, facets, filterPrograms, readFilter, summary, useOffer } from "./data";
import type { FacetOption, OfferData, OfferFilter } from "./data";
import "./oferta.css";

export function OfferPage() {
  const offer = useOffer();

  useEffect(() => {
    const previous = document.title;
    document.title = "Oferta de programas · UDES";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="ofe">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <SiteHeader />
      <main id="contenido">
        <header className="ofe-hero">
          <div className="u-container">
            <p className="ofe-hero__kicker">Universidad de Santander</p>
            <h1>Oferta de programas</h1>
            <p>Qué programas ofrece cada facultad, en qué campus y en qué nivel de formación.</p>
          </div>
        </header>
        <div className="u-container ofe-body">
          {offer.isPending ? (
            <LoadingBlock rows={4} label="Cargando la oferta de programas" />
          ) : offer.isError ? (
            <ErrorBlock error={offer.error} onRetry={() => offer.refetch()} title="No se pudo cargar la oferta de programas" />
          ) : (
            <ProgramOffer data={offer.data} />
          )}
        </div>
      </main>
    </div>
  );
}

const SHAPES = ["2.4rem 1.2rem 2.6rem 1.1rem", "1.3rem 2.6rem 1.2rem 2.4rem", "2.8rem 1.4rem 1.6rem 2.2rem", "1.6rem 2.2rem 2.8rem 1.2rem"];
/** Cada tarjeta con sus propios radios: ninguna igual a la de al lado. */
const pebbleShape = (seed: string) => SHAPES[[...seed].reduce((t, c) => t + c.charCodeAt(0), 0) % SHAPES.length];

export function ProgramOffer({ data }: { data: OfferData }) {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params, data);
  const list = filterPrograms(data, filter);
  const options = facets(data, filter);
  const active = Boolean(filter.facultad || filter.campus || filter.nivel);

  const set = (change: Partial<OfferFilter>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="ofe-offer">
      <div className="ofe-offer__filters" role="group" aria-label="Filtrar la oferta de programas">
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
          <button type="button" className="ofe-offer__clear" onClick={() => set({ facultad: null, campus: null, nivel: null })}>
            <Icon name="close" size={14} /> Quitar filtros
          </button>
        )}
      </div>

      <p className="ofe-offer__summary" aria-live="polite">
        <strong>{summary(data, filter, list.length)}</strong>
      </p>

      {list.length === 0 ? (
        <p className="ofe-offer__empty">{emptyMessage(data, filter)}</p>
      ) : (
        <ul className="ofe-programs">
          {list.map((program) => {
            const faculty = program.faculty ? data.facultyBySlug.get(program.faculty) : undefined;
            const sites = campusNames(data, program);
            return (
              <li key={program.slug} className="ofe-program" style={{ "--shape": pebbleShape(program.slug) } as CSSProperties}>
                <span className="ofe-program__detail">
                  {faculty?.code ?? "Sin facultad"}
                  {program.degree && <span className="ofe-program__level">{DEGREE_LABEL[program.degree]}</span>}
                </span>
                <strong>{program.name}</strong>
                <span className="ofe-program__sites">
                  <Icon name="pin" size={13} />
                  {sites.length > 0 ? sites.join(" · ") : "Sin sede activa"}
                </span>
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
    <label className="ofe-offer__facet" htmlFor={id}>
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
