/* =============================================================================
   Portal Documentos · el tomo abierto.

   A la izquierda la tapa grande, sus secciones y los años que guarda; a la
   derecha el índice, numerado y agrupado por año. Cada entrada dice antes de
   pulsarla de qué tipo es, cuánto pesa y —si es un enlace— a qué sitio lleva:
   nadie debería descubrir que un documento son cuarenta megas, ni que sale del
   portal, después de haber pulsado.

   Las secciones son las divisorias del tomo. Con «Todas» se recorren una tras
   otra, cada una con su pestaña; eligiendo una, el índice se queda en ella. Los
   documentos que no están en ninguna sección van primero y sin pestaña: son
   del tomo, no de una divisoria.

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
  itemsUnder,
  sortEntries,
  useDocLibrary,
  yearRange,
  yearsOf,
} from "./data";
import type { DocCollection, DocEntry, DocItem } from "./data";
import "./documentos.css";

interface YearGroup {
  year: number | null;
  entries: DocEntry[];
}

/** Un tramo del índice: los documentos del tomo, o los de una de sus secciones. */
interface Part {
  section: DocCollection | null;
  groups: YearGroup[];
}

/** Agrupa por año conservando el orden ya calculado. */
function groupByYear(entries: DocEntry[]): YearGroup[] {
  const out: YearGroup[] = [];
  for (const entry of entries) {
    const key = entry.item.year;
    const last = out[out.length - 1];
    if (last && last.year === key) last.entries.push(entry);
    else out.push({ year: key, entries: [entry] });
  }
  return out;
}

export function CollectionPage() {
  const { slug, section: sectionSlug } = useParams();
  const library = useDocLibrary();
  const [year, setYear] = useState<number | null>(null);

  const data = library.data;
  const collection = data?.collections.find((c) => c.slug === slug);
  const sections = useMemo(
    () => (collection && data ? (data.sections.get(collection.id) ?? []) : []),
    [collection, data],
  );
  const section = sections.find((s) => s.slug === sectionSlug) ?? null;

  /** Todo lo del tomo, secciones incluidas: es lo que cuenta la fila «Todas». */
  const everything = useMemo(
    () => (collection && data ? itemsUnder(collection, data) : []),
    [collection, data],
  );
  /** Lo que de verdad se está mirando: el tomo entero, o solo una divisoria.
   *  Las cifras y los años de la columna se cuentan de aquí, porque decir
   *  «6 documentos, 2018-2025» dentro de una sección de dos es mentir. */
  const scope = useMemo(
    () => (section && data ? (data.byCollection.get(section.id) ?? []) : everything),
    [section, data, everything],
  );
  const years = useMemo(() => yearsOf(scope), [scope]);

  const parts = useMemo(() => {
    if (!collection || !data) return [];
    const inYear = (items: DocItem[]) =>
      year === null ? items : items.filter((item) => coversYear(item, year));
    const indexOf = (items: DocItem[]) => groupByYear(sortEntries(entriesOf(inYear(items))));

    // Con una sección elegida, el índice es solo suyo.
    if (section) {
      const groups = indexOf(data.byCollection.get(section.id) ?? []);
      return groups.length ? [{ section, groups }] : [];
    }

    const out: Part[] = [];
    const loose = indexOf(data.byCollection.get(collection.id) ?? []);
    if (loose.length) out.push({ section: null, groups: loose });
    for (const item of sections) {
      const groups = indexOf(data.byCollection.get(item.id) ?? []);
      if (groups.length) out.push({ section: item, groups });
    }
    return out;
  }, [collection, data, sections, section, year]);

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

  // Una colección en borrador, inexistente, o una sección que no es de este
  // tomo responden lo mismo: no está publicada, y el portal no confirma que
  // exista.
  if (!collection || (sectionSlug && !section)) return <NotFound />;

  const cover = documentFileUrl(collection.cover);
  const range = yearRange(scope);
  const total = entriesOf(scope).length;
  /** El total del tomo, para la fila «Todas» de la lista de secciones. */
  const collectionTotal = entriesOf(everything).length;
  const shown = parts.reduce(
    (sum, part) => sum + part.groups.reduce((n, group) => n + group.entries.length, 0),
    0,
  );
  const heading = section ? section.title : collection.title;
  const lede = section ? section.subtitle : collection.subtitle;

  return (
    <PlanLayout
      title={`${section ? `${section.title} · ${collection.title}` : collection.title} · Repositorio documental`}
    >
      <section className="pl-hero pl-hero--compact dc-hero" aria-labelledby="dc-coleccion">
        <div className="pl-container pl-hero__inner">
          <Link className="pl-back" to={section ? `/documentos/${collection.slug}` : "/documentos"}>
            <Icon name="arrow-left" size={16} />
            {section ? collection.title : "Repositorio documental"}
          </Link>
          <h1 id="dc-coleccion">{heading}</h1>
          {lede && <p className="pl-hero__lede">{lede}</p>}
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

            {sections.length > 0 && (
              <nav className="dc-parts" aria-label="Secciones de la colección">
                <h2>Secciones</h2>
                <ul>
                  <li>
                    <Link to={`/documentos/${collection.slug}`} aria-current={section ? undefined : "page"}>
                      <span>Todas</span>
                      <b>{collectionTotal}</b>
                    </Link>
                  </li>
                  {sections.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={`/documentos/${collection.slug}/${item.slug}`}
                        aria-current={section?.id === item.id ? "page" : undefined}
                      >
                        <span>{item.title}</span>
                        <b>{entriesOf(data?.byCollection.get(item.id) ?? []).length}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {years.length > 1 && (
              <div className="dc-open__years">
                <h2>Años</h2>
                <div className="dc-years" role="group" aria-label="Filtrar por año">
                  <button type="button" aria-pressed={year === null} onClick={() => setYear(null)}>
                    Todos
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
              </div>
            )}
          </aside>

          <div className="dc-index">
            {shown === 0 ? (
              <p className="dc-empty">
                <strong>
                  {everything.length === 0
                    ? "Esta colección todavía no tiene documentos publicados."
                    : year !== null
                      ? `Aquí no hay documentos de ${year}.`
                      : "Esta sección todavía no tiene documentos publicados."}
                </strong>
                {everything.length > 0 && year !== null && (
                  <button type="button" className="pl-link" onClick={() => setYear(null)}>
                    Ver los {total} documentos
                  </button>
                )}
              </p>
            ) : (
              (() => {
                // La numeración corre a lo largo de todo el índice, secciones
                // incluidas: es un índice, no una lista por tramo.
                let number = 0;
                return parts.map((part) => (
                  <section className="dc-part" key={part.section?.id ?? "sueltos"}>
                    {part.section && !section && (
                      <h2 className="dc-part__tab">
                        <Link to={`/documentos/${collection.slug}/${part.section.slug}`}>
                          {part.section.title}
                        </Link>
                      </h2>
                    )}
                    {part.groups.map((group) => (
                      <div className="dc-group" key={group.year ?? "sin-ano"}>
                        <h3 className="dc-group__year">{group.year ?? "Sin año declarado"}</h3>
                        <ol className="dc-entries">
                          {group.entries.map((entry) => {
                            number += 1;
                            return (
                              <Entry
                                key={entry.item.id}
                                entry={entry}
                                number={number}
                                groupYear={group.year}
                              />
                            );
                          })}
                        </ol>
                      </div>
                    ))}
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

function Entry({
  entry,
  number,
  groupYear,
}: {
  entry: DocEntry;
  number: number;
  groupYear: number | null;
}) {
  const { item, older } = entry;
  const href = documentHref(item);

  return (
    <li className="dc-entry">
      <span className="dc-entry__number" aria-hidden="true">
        {String(number).padStart(2, "0")}
      </span>

      <div className="dc-entry__body">
        <h4>
          {href ? (
            // Todo abre en una pestaña nueva, también el archivo: vive en otro
            // dominio y el atributo `download` no manda ahí, así que prometer
            // una descarga sería mentir.
            <a href={href} className="pl-stretch" target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {item.version && <span className="dc-entry__version">{item.version}</span>}
        </h4>

        {item.description && <p>{item.description}</p>}

        <p className="dc-entry__meta">
          <Meta item={item} groupYear={groupYear} />
        </p>

        {older.length > 0 && (
          <details className="dc-versions">
            <summary>
              <Icon name="chevron-down" size={14} />
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
        <Icon name={item.kind === "enlace" ? "external" : "download"} size={18} />
      </span>
    </li>
  );
}

/** El sitio al que lleva un enlace, para poder decidir antes de pulsarlo. */
function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** El año solo se repite cuando dice algo que la pestaña del grupo no dice:
 *  un rango, o una edición retirada que cuelga de otro año. */
function Meta({ item, groupYear }: { item: DocItem; groupYear?: number | null }) {
  const bits: string[] = [documentType(item)];
  if (item.kind === "enlace") {
    const host = hostOf(item.url);
    if (host) bits.push(host);
  } else if (item.sizeBytes) {
    bits.push(formatBytes(item.sizeBytes));
  }
  const range = item.yearTo !== null && item.yearTo !== item.year;
  if (item.year !== null && (range || groupYear === undefined || groupYear !== item.year)) {
    bits.push(range ? `${item.year}-${item.yearTo}` : `${item.year}`);
  }
  return (
    <>
      {bits.join(" · ")}
      <span className="sr-only">
        {item.kind === "enlace"
          ? ", enlace externo, se abre en una pestaña nueva"
          : ", se abre en una pestaña nueva"}
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
