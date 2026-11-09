/* =============================================================================
   Portal Documentos · la portada.

   Cabecera baja con el buscador en la misma franja, una barra de filtros por
   tipo y por año, las colecciones como tarjetas horizontales y, al lado, lo
   último que se puede abrir en el visor.

   Los filtros viven en la URL (?tipo=pdf&anio=2025): así «Volver» desde un
   documento regresa a la misma vista. Los dos afectan los conteos de las
   colecciones; una colección sin nada que mostrar se apaga, no desaparece.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { Icon } from "../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../components/ui/QueryState";
import { formatBytes } from "../../data/storage";
import { PlanLayout } from "../planeacion/PlanLayout";
import { DocThumb } from "./DocThumb";
import { TipoDoc } from "./TipoDoc";
import {
  coversYear,
  documentFileUrl,
  documentHref,
  entriesOf,
  fold,
  itemsUnder,
  useDocLibrary,
  yearRange,
  yearsOf,
} from "./data";
import type { DocCollection, DocEntry, DocItem } from "./data";
import { FORMAT_LABEL, FORMAT_ORDER, formatOf, isPreviewableFormat, viewerPath } from "./tipos";
import type { DocFormat } from "./tipos";
import "./documentos.css";

/* --- Movimiento compartido con la página de colección ------------------------------------ */

const reducido = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Lo último que hizo la persona fue teclear: entonces no se anima nada. */
let tecladoReciente = false;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", () => (tecladoReciente = true), true);
  window.addEventListener("pointerdown", () => (tecladoReciente = false), true);
}
export const iniciadoConTeclado = () => tecladoReciente;

/** Entrada escalonada corta: el contenido queda siempre visible en reposo. */
export function useEntrada(ref: RefObject<HTMLElement>, selector: string, clave: string, activo = true) {
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz || !activo || reducido() || tecladoReciente) return;
    const nodos = Array.from(raiz.querySelectorAll<HTMLElement>(selector)).slice(0, 24);
    if (!nodos.length) return;
    const tween = gsap.fromTo(
      nodos,
      { opacity: 0, y: 9 },
      { opacity: 1, y: 0, duration: 0.28, ease: "power3.out", stagger: 0.03, clearProps: "opacity,transform" },
    );
    return () => {
      tween.kill();
      gsap.set(nodos, { clearProps: "opacity,transform" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);
}

/* --- Filtros en la URL ------------------------------------------------------------------- */

export function useFiltros() {
  const [params, setParams] = useSearchParams();
  const rawTipo = params.get("tipo");
  const tipo = FORMAT_ORDER.find((f) => f === rawTipo) ?? null;
  const rawAnio = Number(params.get("anio"));
  const anio = Number.isInteger(rawAnio) && rawAnio > 1000 ? rawAnio : null;

  const cambiar = useCallback(
    (clave: string, valor: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (valor === null) next.delete(clave);
          else next.set(clave, valor);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    tipo,
    anio,
    setTipo: (valor: DocFormat | null) => cambiar("tipo", valor),
    setAnio: (valor: number | null) => cambiar("anio", valor === null ? null : String(valor)),
    limpiar: () => setParams({}, { replace: true }),
  };
}

/** ¿Pasa este documento los filtros de tipo y año? */
export const pasa = (item: DocItem, tipo: DocFormat | null, anio: number | null) =>
  (tipo === null || formatOf(item) === tipo) && (anio === null || coversYear(item, anio));

/** Cuenta de documentos vigentes por tipo. */
export function contarPorTipo(entries: DocEntry[]): Map<DocFormat, number> {
  const out = new Map<DocFormat, number>();
  for (const { item } of entries) {
    const f = formatOf(item);
    out.set(f, (out.get(f) ?? 0) + 1);
  }
  return out;
}

/* --- La portada -------------------------------------------------------------------------- */

export function DocumentPortal() {
  const library = useDocLibrary();
  const { tipo, anio, setTipo, setAnio, limpiar } = useFiltros();
  const data = library.data;
  const raiz = useRef<HTMLDivElement>(null);

  const allItems = useMemo(
    () => (data ? [...data.byCollection.values()].flat() : []),
    [data],
  );
  const allEntries = useMemo(() => entriesOf(allItems), [allItems]);
  const years = useMemo(() => yearsOf(allItems), [allItems]);
  const typeCounts = useMemo(() => contarPorTipo(allEntries), [allEntries]);
  const types = FORMAT_ORDER.filter((f) => (typeCounts.get(f) ?? 0) > 0);

  const shelf = useMemo(() => {
    if (!data) return [];
    return data.collections.map((collection) => {
      const sections = data.sections.get(collection.id) ?? [];
      const items = itemsUnder(collection, data);
      const entries = entriesOf(items);
      const filtered = entries.filter((e) => pasa(e.item, tipo, anio));
      return { collection, sections, entries, count: filtered.length, range: yearRange(items), mix: contarPorTipo(entries) };
    });
  }, [data, tipo, anio]);

  const recent = useMemo(
    () =>
      allEntries
        .map((e) => e.item)
        .filter((item) => isPreviewableFormat(formatOf(item)) && pasa(item, tipo, anio))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [allEntries, tipo, anio],
  );

  const ready = Boolean(data && !data.missing && data.collections.length > 0);
  useEntrada(raiz, ".dc-card, .dc-recent__item", `${ready}|${tipo}|${anio}`, ready);

  const filtrando = tipo !== null || anio !== null;
  const withSomething = shelf.filter((row) => row.count > 0).length;
  const search = new URLSearchParams();
  if (tipo) search.set("tipo", tipo);
  if (anio) search.set("anio", String(anio));
  const query = search.toString() ? `?${search.toString()}` : "";

  return (
    <PlanLayout title="Repositorio documental · Planeación Institucional">
      <section className="pl-hero pl-hero--compact dc-hero" aria-labelledby="dc-titulo">
        <div className="pl-container dc-hero__inner">
          <div className="dc-hero__text">
            <Link className="pl-back" to="/">
              <Icon name="arrow-left" size={16} /> Planeación Institucional
            </Link>
            <h1 id="dc-titulo">Repositorio documental</h1>
            <p className="pl-hero__lede">
              Actas, normativa, informes y estudios, cada uno con su año y su versión vigente.
            </p>
          </div>
          <Buscador items={allItems} />
        </div>
      </section>

      <div ref={raiz}>
        {ready && (
          <div className="pl-container dc-bar" role="region" aria-label="Filtros del repositorio">
            <div className="dc-bar__group" role="group" aria-label="Filtrar por tipo">
              <span className="dc-bar__label">Tipo</span>
              {types.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="dc-chip"
                  aria-pressed={tipo === f}
                  onClick={() => setTipo(tipo === f ? null : f)}
                >
                  {FORMAT_LABEL[f]} <b>{typeCounts.get(f)}</b>
                </button>
              ))}
            </div>
            {years.length > 1 && (
              <div className="dc-bar__group" role="group" aria-label="Filtrar por año">
                <span className="dc-bar__label">Año</span>
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
            )}
          </div>
        )}

        <section className="pl-section dc-shelf" aria-labelledby="dc-tomos">
          <div className="pl-container">
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
            ) : (
              <div className="dc-home">
                <div>
                  <h2 id="dc-tomos" className="dc-h2">
                    Colecciones
                  </h2>
                  {filtrando && withSomething === 0 && (
                    <p className="dc-note" role="status">
                      <Icon name="alert" size={16} />
                      <span>
                        Ninguna colección guarda documentos con ese filtro.{" "}
                        <button type="button" className="pl-link dc-linkbtn" onClick={limpiar}>
                          Quitar filtros
                        </button>
                      </span>
                    </p>
                  )}
                  <ul className="dc-grid">
                    {shelf.map((row) => (
                      <li key={row.collection.id}>
                        <Card
                          collection={row.collection}
                          sectionCount={row.sections.length}
                          count={row.count}
                          range={row.range}
                          mix={row.mix}
                          total={row.entries.length}
                          dimmed={filtrando && row.count === 0}
                          query={query}
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                <aside aria-labelledby="dc-recientes">
                  <h2 id="dc-recientes" className="dc-h2">
                    Recién publicados
                  </h2>
                  {recent.length === 0 ? (
                    <p className="dc-muted">Nada que abrir aquí con ese filtro.</p>
                  ) : (
                    <ul className="dc-recent">
                      {recent.map((item) => (
                        <li key={item.id} className="dc-recent__item">
                          <Link to={viewerPath(item.id)}>
                            <DocThumb item={item} size="sm" />
                            <span className="dc-recent__text">
                              <span className="dc-recent__title">{item.title}</span>
                              <small>
                                {[item.year, item.version, item.sizeBytes ? formatBytes(item.sizeBytes) : ""]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            )}
          </div>
        </section>
      </div>
    </PlanLayout>
  );
}

/* --- El buscador ------------------------------------------------------------------------- */

function Buscador({ items }: { items: DocItem[] }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  // «/» enfoca el buscador, salvo que ya se esté escribiendo en otro campo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = fold(query.trim());
  const results = useMemo(() => {
    if (!needle) return [];
    return items
      .filter((item) => fold(`${item.title} ${item.description} ${item.summary} ${item.year ?? ""}`).includes(needle))
      .slice(0, 5);
  }, [items, needle]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      setQuery("");
      input.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(caja.current?.querySelectorAll<HTMLElement>("[data-result]") ?? []);
    if (!links.length) return;
    event.preventDefault();
    const at = links.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    if (next < 0) input.current?.focus();
    else links[Math.min(next, links.length - 1)]?.focus();
  };

  return (
    <search className="dc-search" onKeyDown={onKeyDown}>
      <label className="dc-search__field">
        <Icon name="search" size={18} />
        <span className="sr-only">Buscar en el repositorio</span>
        <input
          ref={input}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Buscar un documento, una norma, un año…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>

      {needle && (
        <div className="dc-results" ref={caja} role="region" aria-label="Resultados de la búsqueda" aria-live="polite">
          {results.length === 0 ? (
            <p className="dc-results__none">{`Nada dice «${query.trim()}».`}</p>
          ) : (
            <ul>
              {results.map((item) => {
                const format = formatOf(item);
                const inner = (
                  <>
                    <TipoDoc format={format} />
                    <span className="dc-results__title">{item.title}</span>
                    {item.year !== null && <small>{item.year}</small>}
                  </>
                );
                return (
                  <li key={item.id}>
                    {isPreviewableFormat(format) ? (
                      <Link data-result to={viewerPath(item.id)}>
                        {inner}
                      </Link>
                    ) : (
                      <a data-result href={documentHref(item) ?? undefined} target="_blank" rel="noopener noreferrer">
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </search>
  );
}

/* --- Una colección ----------------------------------------------------------------------- */

function Card({
  collection,
  sectionCount,
  count,
  total,
  range,
  mix,
  dimmed,
  query,
}: {
  collection: DocCollection;
  sectionCount: number;
  /** Los documentos que pasan los filtros. */
  count: number;
  /** Todos los vigentes de la colección, para la mezcla de tipos. */
  total: number;
  range: string;
  mix: Map<DocFormat, number>;
  dimmed: boolean;
  query: string;
}) {
  const cover = documentFileUrl(collection.cover);
  const segments = FORMAT_ORDER.filter((f) => (mix.get(f) ?? 0) > 0);

  return (
    <article className="dc-card" data-dimmed={dimmed || undefined}>
      <span className="dc-card__cover">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="dc-card__initial" aria-hidden="true">
            {collection.title.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <b className="dc-card__years" aria-hidden="true">
          {range || "—"}
        </b>
      </span>

      <span className="dc-card__body">
        <h3>
          {dimmed ? (
            collection.title
          ) : (
            <Link className="pl-stretch" to={`/documentos/${collection.slug}${query}`}>
              {collection.title}
            </Link>
          )}
        </h3>
        <p className="dc-card__count">
          <b>{count}</b> {count === 1 ? "documento" : "documentos"}
          {sectionCount > 0 && ` · ${sectionCount} ${sectionCount === 1 ? "sección" : "secciones"}`}
        </p>
        {range && <span className="sr-only">Años {range}.</span>}
        {total > 0 && (
          <span className="dc-mix" role="img" aria-label={`Tipos: ${segments.map((f) => `${FORMAT_LABEL[f]} ${mix.get(f)}`).join(", ")}`}>
            {segments.map((f) => (
              <i key={f} data-format={f} style={{ flexGrow: mix.get(f) }} />
            ))}
          </span>
        )}
      </span>
    </article>
  );
}
