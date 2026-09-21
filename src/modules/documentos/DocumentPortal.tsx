/* =============================================================================
   Portal Documentos · la estantería.

   Cada colección es un tomo encuadernado: el lomo a la izquierda dice de qué
   años es, la tapa es su fotografía y la banda lleva el nombre y cuántos
   documentos guarda. La idea es que se pueda descartar un tomo sin abrirlo,
   que es lo que un repositorio le debe a quien busca algo concreto.

   El buscador no mira solo los nombres de las colecciones: entra en los
   documentos —y en los de sus secciones—. Quien escribe «acta 014» no está
   buscando una colección, está buscando un papel, y el tomo que lo guarda se
   lo dice en la banda.

   Los dos filtros se comportan distinto a propósito. Buscar deja fuera lo que
   no responde: es una consulta, y la respuesta es una lista corta. Acotar por
   año no borra ningún tomo, los apaga: la estantería conserva su forma y se ve
   de un vistazo cuáles no guardan nada de ese año, que también es información.
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
  itemsUnder,
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
        const sections = data.sections.get(collection.id) ?? [];
        const items = itemsUnder(collection, data);
        const inYear = year === null ? items : items.filter((item) => coversYear(item, year));
        const matches = needle
          ? inYear.filter((item) => fold(`${item.title} ${item.description}`).includes(needle))
          : [];
        // El nombre de una sección también responde: quien escribe «acuerdos»
        // busca esa divisoria, no el tomo que la guarda.
        const titleHit = needle
          ? [collection, ...sections].some((node) => fold(`${node.title} ${node.subtitle}`).includes(needle))
          : false;
        return { collection, sections, items: inYear, range: yearRange(items), matches, titleHit };
      })
      // La búsqueda descarta; el año no. Quien acota por año sigue viendo la
      // estantería entera, con los tomos vacíos apagados.
      .filter((row) => !needle || row.titleHit || row.matches.length > 0);
  }, [data, query, year]);

  const withSomething = shelf.filter((row) => row.items.length > 0).length;

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
            <h2 id="dc-tomos">{query ? "Resultados" : "Las colecciones"}</h2>
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
              {`Ningún documento, sección ni colección dice «${query}».`}{" "}
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
            <>
              {year !== null && withSomething === 0 && (
                <p className="dc-note" role="status">
                  <Icon name="alert" size={16} />
                  <span>Ningún tomo guarda documentos de {year}. Todos quedan apagados.</span>
                </p>
              )}
              <ul className="dc-grid">
                {shelf.map(({ collection, sections, items, range, matches }) => (
                  <li key={collection.id}>
                    <Volume
                      collection={collection}
                      sections={sections}
                      items={items}
                      range={range}
                      matches={matches.length}
                      dimmed={year !== null && items.length === 0}
                      year={year}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </PlanLayout>
  );
}

/* --- Un tomo ---------------------------------------------------------------------------- */

function Volume({
  collection,
  sections,
  items,
  range,
  matches,
  dimmed,
  year,
}: {
  collection: DocCollection;
  sections: DocCollection[];
  /** Los documentos que pasan el filtro de año: de ahí sale el conteo. */
  items: DocItem[];
  /** El rango del tomo entero, sin filtrar: el lomo no cambia con el filtro. */
  range: string;
  matches: number;
  /** El año elegido no encuentra nada aquí: el tomo se queda, apagado. */
  dimmed: boolean;
  year: number | null;
}) {
  const cover = documentFileUrl(collection.cover);
  const count = entriesOf(items).length;

  return (
    <article className="dc-volume" data-dimmed={dimmed || undefined}>
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
          {/* Un tomo apagado no se enlaza: el clic no llevaría a nada de ese año. */}
          {dimmed ? (
            collection.title
          ) : (
            <Link className="pl-stretch" to={`/documentos/${collection.slug}`}>
              {collection.title}
            </Link>
          )}
        </h3>
        {collection.subtitle && <p>{collection.subtitle}</p>}
        <span className="dc-volume__foot">
          {/* El lomo ya dice los años: la banda cuenta lo que el lomo no puede. */}
          <span className="dc-volume__count">
            <b>{count}</b> {count === 1 ? "documento" : "documentos"}
            {dimmed && year !== null && <span className="dc-volume__off"> de {year}</span>}
            {sections.length > 0 && (
              <span className="dc-volume__sections">
                {" en "}
                <b>{sections.length}</b> {sections.length === 1 ? "sección" : "secciones"}
              </span>
            )}
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
