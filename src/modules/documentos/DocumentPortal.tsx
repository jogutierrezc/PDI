/* =============================================================================
   Portal Documentos · la estantería.

   Cada colección es un tomo encuadernado: el lomo a la izquierda dice de qué
   años es, la tapa es su fotografía y la banda lleva el nombre y cuántos
   documentos guarda. La idea es que se pueda descartar un tomo sin abrirlo,
   que es lo que un repositorio le debe a quien busca algo concreto.

   El buscador no mira solo los nombres de las colecciones: entra en los
   documentos. Quien escribe «acta 014» no está buscando una colección, está
   buscando un papel, y el tomo que lo guarda se lo dice en la banda.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { PlanLayout } from "../planeacion/PlanLayout";
import {
  coversYear,
  documentFileUrl,
  entriesOf,
  fold,
  useDocLibrary,
  yearRange,
  yearsOf,
} from "./data";
import type { DocCollection, DocItem } from "./data";
import "./documentos.css";

export function DocumentPortal() {
  const library = useDocLibrary();
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<number | null>(null);

  const data = library.data;

  const allItems = useMemo(
    () => (data ? [...data.byCollection.values()].flat() : []),
    [data],
  );
  const years = useMemo(() => yearsOf(allItems), [allItems]);

  const shelf = useMemo(() => {
    if (!data) return [];
    const needle = fold(query.trim());
    return data.collections
      .map((collection) => {
        const items = data.byCollection.get(collection.id) ?? [];
        const inYear = year === null ? items : items.filter((item) => coversYear(item, year));
        const matches = needle
          ? inYear.filter((item) => fold(`${item.title} ${item.description}`).includes(needle))
          : [];
        const titleHit = needle
          ? fold(`${collection.title} ${collection.subtitle}`).includes(needle)
          : false;
        return { collection, items: inYear, matches, titleHit };
      })
      .filter((row) => {
        if (year !== null && row.items.length === 0) return false;
        if (!needle) return true;
        return row.titleHit || row.matches.length > 0;
      });
  }, [data, query, year]);

  return (
    <PlanLayout title="Repositorio documental · Planeación Institucional">
      <section className="pl-hero pl-hero--compact dc-hero" aria-labelledby="dc-titulo">
        <div className="pl-container pl-hero__inner">
          <Link className="pl-back" to="/">
            <Icon name="arrow-left" size={16} /> Planeación Institucional
          </Link>
          <h1 id="dc-titulo">Repositorio documental</h1>
          <p className="pl-hero__lede">
            La memoria documental de la oficina: actas, normativa, informes y soportes históricos, cada uno con
            su año y su versión vigente.
          </p>

          <search className="dc-search">
            <label className="dc-search__field">
              <Icon name="search" size={18} />
              <span className="sr-only">Buscar en el repositorio</span>
              <input
                type="search"
                value={query}
                placeholder="Buscar un documento, una norma, un año…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </search>
        </div>
      </section>

      <section className="pl-section dc-shelf" aria-labelledby="dc-tomos">
        <div className="pl-container">
          <div className="pl-section__head dc-shelf__head">
            <h2 id="dc-tomos">{query || year !== null ? "Resultados" : "Las colecciones"}</h2>
            {years.length > 1 && (
              <div className="dc-years" role="group" aria-label="Filtrar por año">
                <button type="button" aria-pressed={year === null} onClick={() => setYear(null)}>
                  Todos los años
                </button>
                {years.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={year === value}
                    onClick={() => setYear(year === value ? null : value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>

          {library.isPending ? (
            <LoadingBlock rows={3} label="Cargando el repositorio" />
          ) : library.isError ? (
            <ErrorBlock error={library.error} onRetry={() => void library.refetch()} />
          ) : data?.missing ? (
            <p className="dc-note" role="note">
              <Icon name="alert" size={16} />
              <span>
                El repositorio todavía no está montado en la base de datos. Falta aplicar la migración{" "}
                <code>0051_repositorio_documental.sql</code>.
              </span>
            </p>
          ) : data && data.collections.length === 0 ? (
            <p className="dc-empty">
              <strong>Todavía no hay colecciones publicadas.</strong>
              La oficina las arma desde la intranet: una portada, un nombre y los documentos que guarda.
            </p>
          ) : shelf.length === 0 ? (
            <p className="dc-empty">
              <strong>Ningún tomo responde a esa búsqueda.</strong>
              {year !== null && query
                ? `No hay documentos de ${year} que digan «${query}».`
                : year !== null
                  ? `Ninguna colección guarda documentos de ${year}.`
                  : `Ningún documento ni colección dice «${query}».`}{" "}
              <button
                type="button"
                className="pl-link"
                onClick={() => {
                  setQuery("");
                  setYear(null);
                }}
              >
                Ver todo el repositorio
              </button>
            </p>
          ) : (
            <ul className="dc-grid">
              {shelf.map(({ collection, items, matches }) => (
                <li key={collection.id}>
                  <Volume collection={collection} items={items} matches={matches.length} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PlanLayout>
  );
}

/* --- Un tomo ---------------------------------------------------------------------------- */

function Volume({
  collection,
  items,
  matches,
}: {
  collection: DocCollection;
  items: DocItem[];
  matches: number;
}) {
  const cover = documentFileUrl(collection.cover);
  const range = yearRange(items);
  const count = entriesOf(items).length;

  return (
    <article className="dc-volume">
      <span className="dc-volume__spine" aria-hidden="true">
        <b>{range || "—"}</b>
      </span>

      <span className="dc-volume__cover">
        {cover ? (
          <img src={cover} alt={collection.coverAlt} loading="lazy" decoding="async" />
        ) : (
          <span aria-hidden="true">{collection.title.trim().charAt(0).toUpperCase()}</span>
        )}
      </span>

      <span className="dc-volume__band">
        <h3>
          <Link className="pl-stretch" to={`/documentos/${collection.slug}`}>
            {collection.title}
          </Link>
        </h3>
        {collection.subtitle && <p>{collection.subtitle}</p>}
        <span className="dc-volume__foot">
          <span className="dc-volume__count">
            <b>{count}</b> {count === 1 ? "documento" : "documentos"}
            {range && <span className="dc-volume__range"> · {range}</span>}
          </span>
          {matches > 0 && (
            <span className="dc-volume__match">
              {matches} {matches === 1 ? "coincidencia" : "coincidencias"}
            </span>
          )}
        </span>
      </span>
    </article>
  );
}
