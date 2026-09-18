/* =============================================================================
   Observatorio · el boletín en A4.

   La página se abre sola, sin el marco de la intranet, y se imprime o se
   guarda como PDF desde el navegador. Portada, resumen, un capítulo por tema
   con sus visores en el orden de sus secciones y, si se pidió, la tabla bajo
   cada visor y la metodología (fuente, anonimización y reserva) al cierre de
   cada tema. Siempre en tema claro: el papel no tiene modo oscuro.
   ========================================================================== */

import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { FreeChartEnv } from "../../datos-abiertos/components/free/FreeCharts";
import { ObsChart, RawTable } from "./ObsCharts";
import { bulletinContent, describeFilters } from "./bulletin";
import { DATA_TYPE_LABEL, RESERVED_TEXT, SECTION_LABEL, plural, topicInfo, yearsOfDataset } from "./model";
import { useObsState } from "./store";
import "../../datos-abiertos/datos-abiertos.css";
import "../../datos-abiertos/components/free-sets.css";
import "./obs-admin.css";

const longDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export function ObsBulletinPage() {
  const { id } = useParams();
  const query = useObsState();
  const bulletin = query.data?.bulletins.find((b) => b.id === id);
  const content = useMemo(() => (query.data && bulletin ? bulletinContent(query.data, bulletin.filters) : []), [query.data, bulletin]);

  // Papel: tema claro mientras la página esté abierta.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    const title = document.title;
    return () => {
      if (previous) root.setAttribute("data-theme", previous);
      else root.removeAttribute("data-theme");
      document.title = title;
    };
  }, []);
  useEffect(() => {
    if (bulletin) document.title = `${bulletin.title} | Observatorio de Analítica`;
  }, [bulletin]);

  if (query.isPending) return <div className="obs-doc-state"><LoadingBlock rows={4} label="Cargando el boletín" /></div>;
  if (query.isError) return <div className="obs-doc-state"><ErrorBlock error={query.error} /></div>;
  if (!bulletin) {
    return (
      <div className="obs-doc-state">
        <p>Ese boletín no existe o no tienes acceso a él.</p>
        <Link to="/admin/observatorio/boletin">Volver al Observatorio</Link>
      </div>
    );
  }

  const sample = content.some((t) => [...t.datasets.values()].some((d) => d.sample));
  const today = longDate.format(new Date());

  return (
    <div className="obs-doc-shell">
      <div className="obs-doc-toolbar">
        <Link to="/admin/observatorio/boletin" className="button-ghost">
          <Icon name="arrow-left" size={15} /> Intranet
        </Link>
        <span>{plural(content.length, "tema", "temas")} · {describeFilters(bulletin.filters)}</span>
        <button type="button" className="button-primary" onClick={() => window.print()}>
          <Icon name="download" size={15} /> Imprimir o guardar PDF
        </button>
      </div>

      <FreeChartEnv value={{ still: true, width: 640 }}>
        <article className="obs-doc">
          {bulletin.include.cover && (
            <section className="obs-doc__cover">
              <span className="obs-doc__brand">Universidad de Santander · Observatorio de Analítica Académica</span>
              <h1>{bulletin.title}</h1>
              {bulletin.subtitle && <p className="obs-doc__subtitle">{bulletin.subtitle}</p>}
              <dl className="obs-doc__cut">
                <div>
                  <dt>Recorte</dt>
                  <dd>{describeFilters(bulletin.filters)}</dd>
                </div>
                <div>
                  <dt>Contenido</dt>
                  <dd>
                    {plural(content.length, "tema", "temas")} · {plural(content.reduce((n, t) => n + t.views.length, 0), "visor", "visores")}
                  </dd>
                </div>
                <div>
                  <dt>Generado</dt>
                  <dd>{today}</dd>
                </div>
              </dl>
              {sample && <p className="obs-doc__sample">Contiene datos de ejemplo: las cifras marcadas así no son reales.</p>}
              <div className="obs-doc__strip" aria-hidden="true">
                {content.map((t) => (
                  <i key={t.config.slug} style={{ "--topic-line": `var(--od-line-${topicInfo(t.config.slug)!.line})` } as CSSProperties} />
                ))}
              </div>
            </section>
          )}

          {bulletin.include.summary && content.length > 0 && (
            <section className="obs-doc__summary">
              <h2>Resumen</h2>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tema</th>
                    <th scope="col">Años</th>
                    <th scope="col">Fuentes</th>
                    <th scope="col" data-numeric>
                      Tablas
                    </th>
                    <th scope="col" data-numeric>
                      Visores
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {content.map((t) => {
                    const info = topicInfo(t.config.slug)!;
                    const years = [...new Set([...t.datasets.values()].flatMap(yearsOfDataset))].sort();
                    const sources = [...new Set([...t.datasets.values()].map((d) => d.source).filter(Boolean))];
                    return (
                      <tr key={info.slug}>
                        <th scope="row">
                          <span className="oda-code" style={{ "--line": `var(--od-line-${info.line})` } as CSSProperties}>
                            {info.code}
                          </span>
                          <a href={`#tema-${info.slug}`}>{info.name}</a>
                        </th>
                        <td>{years.length ? (years.length > 2 ? `${years[0]}–${years[years.length - 1]}` : years.join(", ")) : "Sin año"}</td>
                        <td>{sources.join(", ") || "—"}</td>
                        <td data-numeric>{t.datasets.size}</td>
                        <td data-numeric>{t.views.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {content.map((t, index) => {
            const info = topicInfo(t.config.slug)!;
            const shown = new Set(t.views.map((v) => v.datasetId));
            const orphan = [...t.datasets.values()].filter((d) => !shown.has(d.id));
            return (
              <section key={info.slug} id={`tema-${info.slug}`} className="obs-doc__topic" data-first={index === 0 || undefined} style={{ "--topic-line": `var(--od-line-${info.line})` } as CSSProperties}>
                <header className="obs-doc__topic-head">
                  <span className="oda-code">{info.code}</span>
                  <div>
                    <h2>{info.name}</h2>
                    <p>{t.config.intro || info.question}</p>
                  </div>
                </header>
                {t.config.sections.map((section) => {
                  const inside = t.views.filter((v) => v.section === section);
                  if (!inside.length) return null;
                  return (
                    <div key={section} className="obs-doc__section">
                      {inside.map((v, i) => {
                        const d = t.datasets.get(v.datasetId)!;
                        return (
                          <figure key={v.id} className="obs-doc__figure">
                            {/* El rótulo de la sección va dentro del primer visor: nunca queda solo al pie de una página. */}
                            {i === 0 && <h3>{SECTION_LABEL[section]}</h3>}
                            <figcaption>
                              <b>{v.title}</b>
                              {v.description && <span>{v.description}</span>}
                            </figcaption>
                            <ObsChart dataset={d} view={v} />
                            {bulletin.include.tables && v.type !== "tabla" && <RawTable dataset={d} compact limit={25} />}
                            <small>
                              Fuente: {d.source || "sin fuente"}
                              {d.sample ? " · datos de ejemplo" : ""}
                            </small>
                          </figure>
                        );
                      })}
                    </div>
                  );
                })}
                {orphan.map((d) => (
                  <figure key={d.id} className="obs-doc__figure">
                    <figcaption>
                      <b>{d.title}</b>
                      {d.description && <span>{d.description}</span>}
                    </figcaption>
                    <RawTable dataset={d} compact limit={25} />
                  </figure>
                ))}
                {bulletin.include.method && (
                  <aside className="obs-doc__method">
                    <h3>Metodología</h3>
                    <ul>
                      {[...t.datasets.values()].map((d) => (
                        <li key={d.id}>
                          <b>{d.title}</b> · {DATA_TYPE_LABEL[d.dataType]} · fuente {d.source || "sin registrar"} · {plural(d.rows.length, "fila", "filas")}.{" "}
                          {d.anonymization
                            ? `Importada de «${d.anonymization.fileName}» (${plural(d.anonymization.sourceRows, "registro", "registros")}); ${
                                d.anonymization.groupedBy.length ? `contada por ${d.anonymization.groupedBy.join(", ")}; ` : ""
                              }${d.anonymization.removed.length ? `${plural(d.anonymization.removed.length, "columna retirada", "columnas retiradas")}; ` : ""}conteos menores que ${d.anonymization.threshold} publicados como ${RESERVED_TEXT}.`
                            : d.sample
                              ? "Datos de ejemplo de la maqueta."
                              : "Cargada como tabla agregada."}
                        </li>
                      ))}
                    </ul>
                  </aside>
                )}
              </section>
            );
          })}

          <footer className="obs-doc__foot">
            Observatorio de Analítica Académica · Planeación Institucional · Universidad de Santander · {today}
          </footer>
        </article>
      </FreeChartEnv>
    </div>
  );
}
