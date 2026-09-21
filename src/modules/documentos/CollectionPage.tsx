/* =============================================================================
   Portal Documentos · el tomo abierto.

   A la izquierda la tapa grande y los años que guarda; a la derecha el índice,
   numerado y agrupado por año. Cada entrada dice antes de pulsarla de qué tipo
   es y cuánto pesa: nadie debería descubrir que un documento son cuarenta
   megas después de haberlo empezado a bajar.

   Las ediciones anteriores no se ocultan ni compiten: viven plegadas bajo la
   vigente, y se despliegan donde están. En un repositorio histórico la versión
   vieja es dato, no ruido, pero la que hay que descargar hoy es una sola.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { formatBytes } from "../../data/storage";
import { NotFound } from "../../routes/NotFound";
import { PlanLayout } from "../planeacion/PlanLayout";
import {
  coversYear,
  documentFileUrl,
  documentHref,
  documentType,
  entriesOf,
  sortEntries,
  useDocLibrary,
  yearRange,
  yearsOf,
} from "./data";
import type { DocEntry, DocItem } from "./data";
import "./documentos.css";

export function CollectionPage() {
  const { slug } = useParams();
  const library = useDocLibrary();
  const [year, setYear] = useState<number | null>(null);

  const data = library.data;
  const collection = data?.collections.find((c) => c.slug === slug);
  const items = collection ? (data?.byCollection.get(collection.id) ?? []) : [];

  const years = useMemo(() => yearsOf(items), [items]);
  const entries = useMemo(() => {
    const visible = year === null ? items : items.filter((item) => coversYear(item, year));
    return sortEntries(entriesOf(visible));
  }, [items, year]);

  // El índice va agrupado por año, que es como se busca en un repositorio
  // histórico: primero el año, después el documento.
  const groups = useMemo(() => {
    const out: { year: number | null; entries: DocEntry[] }[] = [];
    for (const entry of entries) {
      const key = entry.item.year;
      const last = out[out.length - 1];
      if (last && last.year === key) last.entries.push(entry);
      else out.push({ year: key, entries: [entry] });
    }
    return out;
  }, [entries]);

  if (library.isPending) {
    return (
      <PlanLayout title="Repositorio documental · Planeación Institucional">
        <div className="pl-container pl-section">
          <LoadingBlock rows={4} label="Cargando la colección" />
        </div>
      </PlanLayout>
    );
  }

  if (library.isError) {
    return (
      <PlanLayout title="Repositorio documental · Planeación Institucional">
        <div className="pl-container pl-section">
          <ErrorBlock error={library.error} onRetry={() => void library.refetch()} />
        </div>
      </PlanLayout>
    );
  }

  // Una colección en borrador o inexistente responde lo mismo: no está
  // publicada, y el portal no debe confirmar que existe.
  if (!collection) return <NotFound />;

  const cover = documentFileUrl(collection.cover);
  const range = yearRange(items);
  const total = entriesOf(items).length;

  return (
    <PlanLayout title={`${collection.title} · Repositorio documental`}>
      <section className="pl-hero pl-hero--compact dc-hero" aria-labelledby="dc-coleccion">
        <div className="pl-container pl-hero__inner">
          <Link className="pl-back" to="/documentos">
            <Icon name="arrow-left" size={16} /> Repositorio documental
          </Link>
          <h1 id="dc-coleccion">{collection.title}</h1>
          {collection.subtitle && <p className="pl-hero__lede">{collection.subtitle}</p>}
        </div>
      </section>

      <section className="pl-section dc-open">
        <div className="pl-container dc-open__grid">
          <aside className="dc-open__plate" aria-label="La colección">
            <span className="dc-open__cover">
              {cover ? (
                <img src={cover} alt={collection.coverAlt} decoding="async" />
              ) : (
                <span aria-hidden="true">{collection.title.trim().charAt(0).toUpperCase()}</span>
              )}
            </span>

            <dl className="dc-open__facts">
              <div>
                <dt>Documentos</dt>
                <dd>{total}</dd>
              </div>
              {range && (
                <div>
                  <dt>Cubre</dt>
                  <dd>{range}</dd>
                </div>
              )}
            </dl>

            {years.length > 1 && (
              <div className="dc-years dc-years--column" role="group" aria-label="Filtrar por año">
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
          </aside>

          <div className="dc-index">
            {entries.length === 0 ? (
              <p className="dc-empty">
                <strong>
                  {items.length === 0
                    ? "Esta colección todavía no tiene documentos publicados."
                    : `Esta colección no guarda documentos de ${year}.`}
                </strong>
                {items.length > 0 && (
                  <button type="button" className="pl-link" onClick={() => setYear(null)}>
                    Ver los {total} documentos
                  </button>
                )}
              </p>
            ) : (
              (() => {
                // La numeración corre a lo largo de todo el índice, no se
                // reinicia en cada año: es un índice, no una lista por año.
                let number = 0;
                return groups.map((group) => (
                  <section className="dc-group" key={group.year ?? "sin-ano"}>
                    <h2 className="dc-group__year">{group.year ?? "Sin año declarado"}</h2>
                    <ol className="dc-entries">
                      {group.entries.map((entry) => {
                        number += 1;
                        return <Entry key={entry.item.id} entry={entry} number={number} groupYear={group.year} />;
                      })}
                    </ol>
                  </section>
                ));
              })()
            )}
          </div>
        </div>
      </section>
    </PlanLayout>
  );
}

/* --- Una entrada del índice -------------------------------------------------------------- */

function Entry({ entry, number, groupYear }: { entry: DocEntry; number: number; groupYear: number | null }) {
  const { item, older } = entry;
  const href = documentHref(item);
  const external = item.kind === "enlace";

  return (
    <li className="dc-entry">
      <span className="dc-entry__number" aria-hidden="true">
        {String(number).padStart(2, "0")}
      </span>

      <div className="dc-entry__body">
        <h3>
          {href ? (
            <a
              href={href}
              className="pl-stretch"
              target="_blank"
              rel="noopener noreferrer"
              download={external ? undefined : item.fileName || undefined}
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {item.version && <span className="dc-entry__version">{item.version}</span>}
        </h3>

        {item.description && <p>{item.description}</p>}

        <p className="dc-entry__meta">
          <Meta item={item} groupYear={groupYear} />
        </p>

        {older.length > 0 && (
          <details className="dc-versions">
            <summary>
              {older.length === 1 ? "1 edición anterior" : `${older.length} ediciones anteriores`}
            </summary>
            <ul>
              {older.map((old) => (
                <OlderVersion key={old.id} item={old} />
              ))}
            </ul>
          </details>
        )}
      </div>

      <span className="dc-entry__go" aria-hidden="true">
        <Icon name={external ? "external" : "download"} size={18} />
      </span>
    </li>
  );
}

/** El año solo se repite cuando dice algo que la pestaña del grupo no dice:
 *  un rango, o una edición retirada que cuelga de otro año. */
function Meta({ item, groupYear }: { item: DocItem; groupYear?: number | null }) {
  const bits: string[] = [documentType(item)];
  if (item.kind === "archivo" && item.sizeBytes) bits.push(formatBytes(item.sizeBytes));
  const range = item.yearTo !== null && item.yearTo !== item.year;
  if (item.year !== null && (range || groupYear === undefined || groupYear !== item.year)) {
    bits.push(range ? `${item.year}-${item.yearTo}` : `${item.year}`);
  }
  return (
    <>
      {bits.join(" · ")}
      <span className="sr-only">
        {item.kind === "enlace" ? ", enlace externo, se abre en una pestaña nueva" : ", se descarga"}
      </span>
    </>
  );
}

/** Una edición retirada: se puede consultar, pero se dibuja como lo que es. */
function OlderVersion({ item }: { item: DocItem }) {
  const href = documentHref(item);
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {item.version || "Edición anterior"}
          {item.year !== null && ` · ${item.year}`}
        </a>
      ) : (
        <span>
          {item.version || "Edición anterior"}
          {item.year !== null && ` · ${item.year}`}
        </span>
      )}
      <small>
        <Meta item={item} />
      </small>
    </li>
  );
}
