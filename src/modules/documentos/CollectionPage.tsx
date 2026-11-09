/* =============================================================================
   Portal Documentos · una colección.

   Cabecera baja; a la izquierda, una columna pegajosa con las secciones, los
   tipos y los años; a la derecha, el índice agrupado por año. Cada fila trae
   miniatura, resumen de dos líneas (con «Leer más» para el resto), y las
   acciones que le tocan a su tipo: «Ver» abre la página a pantalla completa
   del documento; los enlaces salen al sitio de destino.

   Tipo y año viven en la URL (?tipo=pdf&anio=2025) y la sección en la ruta:
   al volver del documento, la vista queda como estaba.

   Las ediciones anteriores siguen plegadas bajo la vigente.
   ========================================================================== */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import gsap from "gsap";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { formatBytes } from "../../data/storage";
import { NotFound } from "../../routes/NotFound";
import { PlanLayout } from "../planeacion/PlanLayout";
import { contarPorTipo, iniciadoConTeclado, pasa, useEntrada, useFiltros } from "./DocumentPortal";
import { DocThumb } from "./DocThumb";
import { TipoDoc } from "./TipoDoc";
import {
  documentHref,
  entriesOf,
  itemsUnder,
  sortEntries,
  useDocLibrary,
  yearRange,
  yearsOf,
} from "./data";
import type { DocCollection, DocEntry, DocItem } from "./data";
import { FORMAT_LABEL, FORMAT_ORDER, formatOf, hasMore, hostOf, isPreviewableFormat, shortDescription, viewerPath } from "./tipos";
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
  const { search } = useLocation();
  const library = useDocLibrary();
  const { tipo, anio, setTipo, setAnio, limpiar } = useFiltros();
  const raiz = useRef<HTMLDivElement>(null);

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
  /** Lo que de verdad se está mirando: el tomo entero o una sola sección. */
  const scope = useMemo(
    () => (section && data ? (data.byCollection.get(section.id) ?? []) : everything),
    [section, data, everything],
  );
  const years = useMemo(() => yearsOf(scope), [scope]);
  const scopeEntries = useMemo(() => entriesOf(scope), [scope]);
  const typeCounts = useMemo(() => contarPorTipo(scopeEntries), [scopeEntries]);
  const types = FORMAT_ORDER.filter((f) => (typeCounts.get(f) ?? 0) > 0);

  const parts = useMemo(() => {
    if (!collection || !data) return [];
    // Se filtra sobre las entradas vigentes, no sobre los documentos: una
    // edición nueva de otro tipo no debe resucitar a la vieja.
    const indexOf = (items: DocItem[]) =>
      groupByYear(sortEntries(entriesOf(items).filter((e) => pasa(e.item, tipo, anio))));

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
  }, [collection, data, sections, section, tipo, anio]);

  const shown = parts.reduce(
    (sum, part) => sum + part.groups.reduce((n, group) => n + group.entries.length, 0),
    0,
  );

  useEntrada(raiz, ".dc-row", `${collection?.id}|${section?.id}|${tipo}|${anio}`, Boolean(collection));

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

  const range = yearRange(scope);
  const total = scopeEntries.length;
  const collectionTotal = entriesOf(everything).length;
  const heading = section ? section.title : collection.title;
  const lede = section ? section.subtitle : collection.subtitle;
  const base = `/documentos/${collection.slug}`;
  const filtrando = tipo !== null || anio !== null;

  return (
    <PlanLayout
      title={`${section ? `${section.title} · ${collection.title}` : collection.title} · Repositorio documental`}
    >
      <section className="pl-hero pl-hero--compact dc-hero" aria-labelledby="dc-coleccion">
        <div className="pl-container dc-hero__inner">
          <div className="dc-hero__text">
            <Link className="pl-back" to={section ? `${base}${search}` : `/documentos${search}`}>
              <Icon name="arrow-left" size={16} />
              {section ? collection.title : "Repositorio documental"}
            </Link>
            <h1 id="dc-coleccion">{heading}</h1>
            {lede && <p className="pl-hero__lede">{lede}</p>}
          </div>
          <dl className="dc-facts">
            <div>
              <dt>Documentos</dt>
              <dd>{total}</dd>
            </div>
            {range && (
              <div>
                <dt>Cubre años</dt>
                <dd>{range}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <section className="pl-section dc-open" ref={raiz}>
        <div className="pl-container dc-open__grid">
          <aside className="dc-rail" aria-label="Filtros de la colección">
            {sections.length > 0 && (
              <nav className="dc-rail__block" aria-label="Secciones de la colección">
                <h2>Secciones</h2>
                <ul>
                  <li>
                    <Link to={`${base}${search}`} aria-current={section ? undefined : "page"}>
                      <span>Todas</span>
                      <b>{collectionTotal}</b>
                    </Link>
                  </li>
                  {sections.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={`${base}/${item.slug}${search}`}
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

            {types.length > 1 && (
              <div className="dc-rail__block" role="group" aria-label="Filtrar por tipo de documento">
                <h2>Tipo de documento</h2>
                <ul>
                  {types.map((f) => (
                    <li key={f}>
                      <button type="button" aria-pressed={tipo === f} onClick={() => setTipo(tipo === f ? null : f)}>
                        <span>{FORMAT_LABEL[f]}</span>
                        <b>{typeCounts.get(f)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {years.length > 1 && (
              <div className="dc-rail__block" role="group" aria-label="Filtrar por año">
                <h2>Año</h2>
                <div className="dc-chips">
                  <button type="button" className="dc-chip" aria-pressed={anio === null} onClick={() => setAnio(null)}>
                    Todos
                  </button>
                  {years.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="dc-chip"
                      aria-pressed={anio === value}
                      onClick={() => setAnio(anio === value ? null : value)}
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
                    : filtrando
                      ? "No hay documentos con estos filtros."
                      : "Esta sección todavía no tiene documentos publicados."}
                </strong>
                {everything.length > 0 && filtrando && (
                  <button type="button" className="pl-link dc-linkbtn" onClick={limpiar}>
                    Ver los {total} documentos
                  </button>
                )}
              </p>
            ) : (
              parts.map((part) => (
                <section className="dc-part" key={part.section?.id ?? "sueltos"}>
                  {part.section && !section && (
                    <h2 className="dc-part__tab">
                      <Link to={`${base}/${part.section.slug}${search}`}>{part.section.title}</Link>
                    </h2>
                  )}
                  {part.groups.map((group) => (
                    <div className="dc-group" key={group.year ?? "sin-ano"}>
                      <h3 className="dc-group__year">{group.year ?? "Sin año declarado"}</h3>
                      <ol className="dc-rows">
                        {group.entries.map((entry) => (
                          <Row
                            key={entry.item.id}
                            entry={entry}
                            sectionName={part.section?.title ?? ""}
                          />
                        ))}
                      </ol>
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      </section>
    </PlanLayout>
  );
}

/* --- Una fila del índice ------------------------------------------------------------------ */

function Row({ entry, sectionName }: { entry: DocEntry; sectionName: string }) {
  const { item, older } = entry;
  const format = formatOf(item);
  const href = documentHref(item);
  const preview = isPreviewableFormat(format);
  const host = item.kind === "enlace" ? hostOf(item.url) : "";
  const more = hasMore(item);

  const [open, setOpen] = useState(false);
  const desc = useRef<HTMLDivElement>(null);
  /** Alto antes del cambio; nulo si no hay que animar (teclado o movimiento reducido). */
  const antes = useRef<number | null>(null);

  const alternar = (event: React.MouseEvent) => {
    const quiere =
      event.detail > 0 &&
      !iniciadoConTeclado() &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    antes.current = quiere && desc.current ? desc.current.offsetHeight : null;
    setOpen((v) => !v);
  };

  useLayoutEffect(() => {
    const el = desc.current;
    const from = antes.current;
    antes.current = null;
    if (!el || from === null) return;
    const to = el.offsetHeight;
    if (from === to) return;
    const tween = gsap.fromTo(
      el,
      { height: from, overflow: "hidden" },
      { height: to, duration: 0.24, ease: "power2.out", clearProps: "height,overflow" },
    );
    return () => {
      tween.kill();
      gsap.set(el, { clearProps: "height,overflow" });
    };
  }, [open]);

  const title = item.title;

  return (
    <li className="dc-row">
      <div className="dc-row__thumb">
        <DocThumb item={item} size="md" />
      </div>

      <div className="dc-row__body">
        <h4>
          {preview ? (
            <Link to={viewerPath(item.id)}>{title}</Link>
          ) : href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {title}
              <span className="sr-only">, se abre en una pestaña nueva</span>
            </a>
          ) : (
            title
          )}
        </h4>

        <div className="dc-row__desc" ref={desc} data-open={open || undefined}>
          <p id={`desc-${item.id}`}>{open ? item.description.trim() : shortDescription(item)}</p>
        </div>
        {more && (
          <button
            type="button"
            className="dc-more"
            aria-expanded={open}
            aria-controls={`desc-${item.id}`}
            onClick={alternar}
          >
            {open ? "Leer menos" : "Leer más"}
          </button>
        )}

        <p className="dc-row__meta">
          <TipoDoc format={format} />
          {item.version && <span>{item.version}</span>}
          {item.kind === "archivo" && item.sizeBytes ? <span>{formatBytes(item.sizeBytes)}</span> : null}
          {host && (
            <span>
              <Icon name="external" size={12} />
              {host}
            </span>
          )}
          {sectionName && <span>{sectionName}</span>}
          {item.visibility === "intranet" && (
            <span className="dc-chip-intranet">
              <Icon name="lock" size={12} />
              Solo intranet
            </span>
          )}
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

      <div className="dc-row__acts">
        {preview ? (
          <>
            <Link className="dc-btn dc-btn--pri" to={viewerPath(item.id)}>
              <Icon name="eye" size={16} />
              Ver
            </Link>
            {item.kind === "archivo" && href && (
              <a
                className="dc-btn"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Descargar ${title}`}
              >
                <Icon name="download" size={16} />
                Descargar
              </a>
            )}
          </>
        ) : href ? (
          format === "file" ? (
            <a className="dc-btn dc-btn--pri" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Descargar ${title}`}>
              <Icon name="download" size={16} />
              Descargar
            </a>
          ) : (
            <a className="dc-btn dc-btn--pri" href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={16} />
              {format === "repo" ? "Abrir en el repositorio" : "Abrir enlace"}
              <span className="sr-only">, se abre en una pestaña nueva</span>
            </a>
          )
        ) : null}
        {!preview && host && <small className="dc-row__dest">{host}</small>}
      </div>
    </li>
  );
}

/** Una edición retirada: se puede consultar, pero se dibuja como lo que es. */
function OlderVersion({ item }: { item: DocItem }) {
  const format = formatOf(item);
  const label = `${item.version || "Edición anterior"}${item.year !== null ? ` · ${item.year}` : ""}`;
  const meta = [FORMAT_LABEL[format], item.kind === "archivo" && item.sizeBytes ? formatBytes(item.sizeBytes) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      {isPreviewableFormat(format) ? (
        <Link to={viewerPath(item.id)}>{label}</Link>
      ) : documentHref(item) ? (
        <a href={documentHref(item) ?? undefined} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <small>{meta}</small>
    </li>
  );
}
