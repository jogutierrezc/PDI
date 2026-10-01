/* =============================================================================
   Observatorio de Analítica Académica.

   Vive en el mismo tablero de paletas que los informes de UDES en Cifras (el
   mismo mundo visual), con una diferencia de fondo: aquí no hay indicadores
   con meta y corte, sino conjuntos de datos para explorar. Por eso cada tema
   abre con una pregunta y ofrece tres vistas del dato: la serie, el reparto
   y la tabla que se ordena, se filtra y se descarga.

   · ObservatoryBoard: la sección del índice de /datos-abiertos, en filas de
     llegadas como el tablero de informes.
   · ObservatoryHub: /datos-abiertos/observatorio.
   · ObservatoryTopic: /datos-abiertos/observatorio/:tema.

   Los temas que Planeación publica desde el taller de la intranet se leen de
   Supabase (live.ts) y se dibujan con sus visores; los que aún no tienen nada
   publicado siguen con la maqueta de observatorio/data.ts, rotulada «Datos
   de ejemplo». Así el tablero pasa a datos reales tema por tema.
   ========================================================================== */

import { Suspense, lazy, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { ChartFrame } from "../components/ChartFrame";
import type { CsvFile, CsvTable } from "../data/csv-export";
import { OpenDataLayout } from "../components/OpenDataLayout";
import { SplitFlap } from "../components/SplitFlap";
import { useInView, useWidth } from "../components/motion";
import { OBS_TOPICS, findTopic } from "./data";
import type { ObsTable, ObsTopic } from "./data";
import { summarize, useObservatoryLive } from "./live";
import { ContextBar } from "../../../components/layout/ContextBar";
import type { LiveSummary, LiveTopic } from "./live";

const LiveTopicBody = lazy(() => import("./LiveTopic"));
import "../datos-abiertos.css";
import "./observatorio.css";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const one = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: number) => (Number.isInteger(v) ? integer.format(v) : decimal.format(v));
const headlineText = (t: ObsTopic) =>
  t.headline.format === "porcentaje" ? `${decimal.format(t.headline.value)} %` : num(t.headline.value);
const lineStyle = (line: number) => ({ "--line": `var(--od-line-${line})` }) as CSSProperties;
const liveText = (s: LiveSummary) => (s.format === "porcentaje" ? `${one.format(s.value)} %` : s.format === "entero" ? integer.format(s.value) : decimal.format(s.value));
const longDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

/** El CSV de un panel de la maqueta: su archivo y el nombre con que se anuncia. */
const sampleCsv = (slug: string, part: string, name: string, build: CsvFile["build"]) => ({
  files: [{ filename: `observatorio-${slug}-${part}datos-de-ejemplo.csv`, build }],
  name,
});

/** Los temas publicados, con su resumen para el tablero. */
function useLive() {
  const query = useObservatoryLive();
  return useMemo(() => {
    const map = new Map<string, { live: LiveTopic; summary: LiveSummary | null }>();
    for (const [slug, live] of query.data ?? []) map.set(slug, { live, summary: summarize(live) });
    return map;
  }, [query.data]);
}

/** El aviso que acompaña a toda cifra del Observatorio mientras sea maqueta. */
function ExampleNote({ compact = false, published = 0 }: { compact?: boolean; published?: number }) {
  if (published >= OBS_TOPICS.length) return null;
  const partial = published > 0;
  return (
    <p className="obs-note" data-compact={compact || undefined} role="note">
      <span className="od-stamp">{partial ? `${published} de ${OBS_TOPICS.length} con datos` : "Datos de ejemplo"}</span>
      <span>
        {partial
          ? compact
            ? "Las páginas marcadas «ejemplo» aún muestran datos de maqueta."
            : `${published === 1 ? "Una página ya publica" : `${published} páginas ya publican`} datos reales. Las demás siguen con datos de ejemplo, marcados así, mientras cada oficina carga los suyos.`
          : compact
            ? "Maqueta: ninguna cifra de esta sección es real."
            : "Esta es una maqueta del Observatorio. Ninguna cifra es real: sirven para diseñar las páginas mientras cada oficina define los conjuntos de datos que publicará."}
      </span>
    </p>
  );
}

/* --- Sección del índice y tablero del Observatorio ---------------------------------- */

export function ObservatoryBoard({ standalone = false }: { standalone?: boolean }) {
  const [active, setActive] = useState(OBS_TOPICS[0].slug);
  const topic = findTopic(active) ?? OBS_TOPICS[0];
  const live = useLive();
  const current = live.get(topic.slug);

  return (
    <section className="od-board obs-board" id="observatorio" aria-labelledby="obs-titulo">
      <div className="u-container">
        <div className="od-board__head">
          <div className="od-board__intro">
            <h2 id="obs-titulo">{standalone ? "Páginas del Observatorio" : "Observatorio de Analítica Académica"}</h2>
            <p>
              {standalone
                ? "Pasa sobre una página para ver de qué trata; ábrela para explorar su serie, su reparto y su tabla."
                : `${OBS_TOPICS.length} páginas para explorar los datos de la vida académica de la universidad: de la oferta y la población a las alertas tempranas, la deserción y lo que pasa con los graduados. Cada página parte de una pregunta y deja ver, ordenar y descargar el dato.`}
            </p>
            {!standalone && (
              <p className="od-board__downloads">
                <Link className="od-button od-button--signal" to="/datos-abiertos/observatorio">
                  Entrar al Observatorio <Icon name="arrow-right" size={17} />
                </Link>
              </p>
            )}
          </div>
          {!standalone && <ExampleNote compact published={live.size} />}
        </div>

        <div className="od-board__grid">
          <div className="od-departures">
            <div className="od-departures__columns" aria-hidden="true">
              <span>Página</span>
              <span>Cifra</span>
              <span>Tendencia</span>
            </div>
            <ol className="od-departures__list">
              {OBS_TOPICS.map((t, index) => {
                const real = live.get(t.slug);
                const summary = real?.summary;
                const figure = summary ? liveText(summary) : real ? "—" : headlineText(t);
                const label = summary ? summary.label : real ? "Datos publicados" : t.headline.label;
                return (
                <li key={t.slug}>
                  <Link
                    className="od-row"
                    to={`/datos-abiertos/observatorio/${t.slug}`}
                    data-active={t.slug === topic.slug || undefined}
                    onMouseEnter={() => setActive(t.slug)}
                    onFocus={() => setActive(t.slug)}
                  >
                    <span className="od-row__code od-line" style={lineStyle(t.line)}>
                      <SplitFlap value={t.code} size="sm" delay={index * 70} />
                    </span>
                    <span className="od-row__name">
                      <strong>
                        <span className="obs-index">{String(index + 1).padStart(2, "0")}</span> {t.name}
                      </strong>
                      <span>{t.summary}</span>
                    </span>
                    <span className="od-row__figure">
                      <span className="od-row__digits">
                        <SplitFlap value={figure} align="end" size="sm" delay={index * 70 + 140} numeric label={`${label}: ${figure}${real ? "" : " (dato de ejemplo)"}`} />
                      </span>
                      <span className="od-row__indicator">
                        {label}
                        {!real && <span className="obs-sample-tag">ejemplo</span>}
                      </span>
                    </span>
                    <span className="od-row__previous obs-spark">
                      {real ? summary?.spark && summary.spark.length > 1 ? <Spark values={summary.spark} /> : null : <Spark values={t.series.points.map(([, v]) => v)} />}
                    </span>
                    <span className="od-row__go" aria-hidden="true">
                      <Icon name="arrow-right" size={20} />
                    </span>
                  </Link>
                </li>
                );
              })}
            </ol>
          </div>

          <aside className="od-platform obs-platform" aria-label={`Vista previa: ${topic.name}`}>
            <div className="od-platform__body">
              <div className="od-platform__title">
                <span className="od-line" style={lineStyle(topic.line)}>
                  <SplitFlap value={topic.code} size="md" key={topic.slug} />
                </span>
                <h3>{topic.name}</h3>
              </div>
              <p className="obs-question">{current?.live.config.intro || topic.question}</p>
              {current ? (
                current.summary?.share ? (
                  <MiniShare title={current.summary.share.title} items={current.summary.share.items} />
                ) : (
                  <p className="obs-live-count">
                    {current.live.views.length} {current.live.views.length === 1 ? "visor publicado" : "visores publicados"}
                  </p>
                )
              ) : (
                <MiniShare title={topic.share.title} items={topic.share.items} />
              )}
              <Link className="od-button od-button--signal" to={`/datos-abiertos/observatorio/${topic.slug}`}>
                Abrir la página <Icon name="arrow-right" size={17} />
              </Link>
              <small className="od-platform__credit">
                {current
                  ? `Fuente: ${current.live.sources.join(", ") || topic.source}${current.live.updatedAt ? ` · actualizado el ${longDate.format(new Date(current.live.updatedAt))}` : ""}`
                  : `Alimentará este conjunto: ${topic.source} · datos de ejemplo`}
              </small>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 110;
  const h = 30;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={pts[pts.length - 1].split(",")[1]} r="3" fill="var(--od-signal)" />
    </svg>
  );
}

function MiniShare({ title, items }: { title: string; items: [string, number][] }) {
  const total = items.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <figure className="obs-mini">
      <figcaption>{title}</figcaption>
      <span className="obs-mini__bar">
        {items.map(([label, v], k) => (
          <i key={label} style={{ "--w": `${(v / total) * 100}%`, "--tone": `var(--od-inst-${(k % 6) + 1})` } as CSSProperties} title={`${label}: ${num(v)}`} />
        ))}
      </span>
      <span className="obs-mini__legend">
        {items.slice(0, 4).map(([label, v], k) => (
          <span key={label} style={{ "--tone": `var(--od-inst-${(k % 6) + 1})` } as CSSProperties}>
            {label} <b>{Math.round((v / total) * 100)} %</b>
          </span>
        ))}
      </span>
    </figure>
  );
}

/* --- Portada del Observatorio ------------------------------------------------------- */

export function ObservatoryHub() {
  const live = useLive();
  return (
    <OpenDataLayout title="Observatorio de Analítica Académica | UDES en Cifras" className="obs-page">
      <ObsBar current={null} published={live} />
      <section className="od-report-head obs-head" aria-labelledby="obs-hub">
        <div className="u-container">
          <Link className="od-back" to="/datos-abiertos">
            <Icon name="arrow-left" size={16} /> UDES en Cifras
          </Link>
          <h1 id="obs-hub" className="obs-head__title">
            <span>Observatorio de</span>
            <SplitFlap value="Analítica Académica" size="lg" delay={200} stagger={46} />
          </h1>
          <p className="obs-head__lede">
            Los datos de la vida académica de la Universidad de Santander, para explorarlos más allá de los indicadores: cada página responde una pregunta con
            su serie en el tiempo, su reparto y la tabla completa para ordenar, filtrar y descargar.
          </p>
          <ExampleNote published={live.size} />
        </div>
      </section>
      <ObservatoryBoard standalone />
    </OpenDataLayout>
  );
}

/* --- Página de un tema -------------------------------------------------------------- */

export function ObservatoryTopic() {
  const { tema } = useParams();
  const topic = findTopic(tema);
  const liveMap = useLive();
  if (!topic) {
    return (
      <OpenDataLayout title="Observatorio | UDES en Cifras" className="obs-page">
        <section className="od-missing">
          <div className="u-container">
            <h1>Esta página del Observatorio no existe</h1>
            <Link className="od-button od-button--signal" to="/datos-abiertos/observatorio">
              Ver las páginas del Observatorio
            </Link>
          </div>
        </section>
      </OpenDataLayout>
    );
  }
  const index = OBS_TOPICS.indexOf(topic);
  const prev = OBS_TOPICS[(index - 1 + OBS_TOPICS.length) % OBS_TOPICS.length];
  const next = OBS_TOPICS[(index + 1) % OBS_TOPICS.length];
  const real = liveMap.get(topic.slug);

  return (
    <OpenDataLayout title={`${topic.name} · Observatorio | UDES en Cifras`} className="obs-page">
      <ObsBar current={topic.slug} published={liveMap} />

      <section className="od-report-head obs-head" aria-labelledby="obs-tema">
        <div className="u-container">
          <div className="obs-head__row">
            <span className="od-report-head__code od-line" style={lineStyle(topic.line)}>
              <SplitFlap key={topic.slug} value={topic.code} size="lg" delay={80} />
            </span>
            <span className="obs-head__count">
              Página {index + 1} de {OBS_TOPICS.length}
            </span>
          </div>
          <h1 id="obs-tema">{topic.name}</h1>
          <p className="obs-head__question">{real?.live.config.intro || topic.question}</p>
          {real ? (
            <dl className="od-report-head__facts">
              <div>
                <dt>Fuente</dt>
                <dd>{real.live.sources.join(", ") || topic.source}</dd>
              </div>
              {real.summary && (
                <div>
                  <dt>{real.summary.label}</dt>
                  <dd>
                    {liveText(real.summary)} {real.summary.format === "porcentaje" ? "" : real.summary.unit}
                  </dd>
                </div>
              )}
              {real.live.updatedAt && (
                <div>
                  <dt>Actualizado</dt>
                  <dd>{longDate.format(new Date(real.live.updatedAt))}</dd>
                </div>
              )}
            </dl>
          ) : (
            <>
              <dl className="od-report-head__facts">
                <div>
                  <dt>Alimentará este conjunto</dt>
                  <dd>{topic.source}</dd>
                </div>
                <div>
                  <dt>{topic.headline.label}</dt>
                  <dd>
                    {headlineText(topic)} {topic.headline.format === "porcentaje" ? "" : topic.headline.unit}
                  </dd>
                </div>
              </dl>
              <ExampleNote />
            </>
          )}
        </div>
      </section>

      {real ? (
        <Suspense fallback={<div className="u-container obs-live__loading" aria-busy="true" />}>
          <LiveTopicBody live={real.live} slug={topic.slug} />
        </Suspense>
      ) : (
        <section className="od-section obs-views" aria-label={`Datos de ${topic.name}`}>
          <div className="u-container obs-grid">
            <SeriesPanel topic={topic} />
            <SharePanel topic={topic} />
            <TablePanel topic={topic} table={topic.table} />
          </div>
        </section>
      )}

      <nav className="obs-pager u-container" aria-label="Otras páginas del Observatorio">
        <Link to={`/datos-abiertos/observatorio/${prev.slug}`} style={lineStyle(prev.line)}>
          <Icon name="arrow-left" size={16} />
          <span>
            <small>Anterior</small> {prev.name}
          </span>
        </Link>
        <Link to={`/datos-abiertos/observatorio/${next.slug}`} style={lineStyle(next.line)}>
          <span>
            <small>Siguiente</small> {next.name}
          </span>
          <Icon name="arrow-right" size={16} />
        </Link>
      </nav>
    </OpenDataLayout>
  );
}

/* --- Vistas ------------------------------------------------------------------------- */

function SeriesPanel({ topic }: { topic: ObsTopic }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 640);
  const seen = useInView(box);
  const [hover, setHover] = useState<number | null>(null);
  const points = topic.series.points;
  const max = Math.max(...points.map(([, v]) => v));
  const h = 240;
  const top = 26;
  const bottom = 28;
  const col = width / points.length;
  const shown = hover ?? points.length - 1;
  const first = points[0][1];
  const last = points[points.length - 1][1];
  const change = ((last - first) / (first || 1)) * 100;

  return (
    <ChartFrame className="obs-panel obs-panel--series" title={topic.series.title} subtitle={`${topic.series.unit} · ${points[0][0]}–${points[points.length - 1][0]} · datos de ejemplo`} source={topic.source} exportName={`observatorio-${topic.slug}-serie`} csv={sampleCsv(topic.slug, "serie-", topic.series.title, () => ({ header: ["Periodo", "Valor", "Unidad"], rows: points.map(([label, v]) => [label, v, topic.series.unit]) }))}>
      <p className="obs-reading" aria-live="polite">
        <b>{points[shown][0]}:</b> {num(points[shown][1])} {topic.series.unit}
        <span>
          · de {points[0][0]} a {points[points.length - 1][0]}, {change >= 0 ? "sube" : "baja"} {decimal.format(Math.abs(change))} %
        </span>
      </p>
      <div ref={box} className="obs-series" data-seen={seen || undefined} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={h} role="img" aria-label={points.map(([l, v]) => `${l}: ${num(v)}`).join(", ")}>
          {points.map(([label, v], i) => {
            const bh = ((h - top - bottom) * v) / (max || 1);
            const x = i * col + col * 0.18;
            const bw = col * 0.64;
            return (
              <g key={label} className="obs-series__col" data-on={i === shown || undefined} style={{ "--k": i } as CSSProperties} onMouseEnter={() => setHover(i)}>
                <rect className="obs-series__hit" x={i * col} y={0} width={col} height={h} />
                <rect className="obs-series__bar" x={x} y={h - bottom - bh} width={bw} height={bh} rx={4} />
                <text className="obs-series__value" x={x + bw / 2} y={h - bottom - bh - 8} textAnchor="middle">
                  {num(v)}
                </text>
                <text className="obs-series__label" x={x + bw / 2} y={h - 8} textAnchor="middle">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}

function SharePanel({ topic }: { topic: ObsTopic }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const total = topic.share.items.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(...topic.share.items.map(([, v]) => v));
  return (
    <ChartFrame className="obs-panel obs-panel--share" title={topic.share.title} subtitle={`${num(total)} ${topic.share.unit} · datos de ejemplo`} source={topic.source} exportName={`observatorio-${topic.slug}-reparto`} csv={sampleCsv(topic.slug, "reparto-", topic.share.title, () => ({ header: ["Categoría", "Valor", "Unidad"], rows: topic.share.items.map(([label, v]) => [label, v, topic.share.unit]) }))}>
      <div ref={ref} className="obs-share" data-seen={seen || undefined}>
        {topic.share.items.map(([label, v], k) => (
          <div key={label} className="obs-share__row" style={{ "--w": `${(v / max) * 100}%`, "--tone": `var(--od-inst-${(k % 6) + 1})`, "--k": k } as CSSProperties}>
            <span className="obs-share__label">{label}</span>
            <span className="obs-share__track">
              <i />
            </span>
            <span className="obs-share__value">
              {num(v)} <em>{one.format((v / total) * 100)} %</em>
            </span>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

function TablePanel({ topic, table }: { topic: ObsTopic; table: ObsTable }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? table.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q))) : [...table.rows];
    if (sort) {
      list = [...list].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
        return c * sort.dir;
      });
    }
    return list;
  }, [table, query, sort]);

  const cell = (v: string | number | undefined, unit?: string) =>
    typeof v === "number" ? `${num(v)}${unit === "%" ? " %" : unit ? ` ${unit}` : ""}` : v ?? "—";

  // Toda la tabla, no el filtro: números como números, texto como texto y lo que falta, vacío.
  const csvTable = (): CsvTable => ({
    header: table.columns.map((c) => c.label),
    rows: table.rows.map((r) => table.columns.map((c) => r[c.key] ?? null)),
  });

  return (
    <ChartFrame
      className="obs-panel obs-panel--table"
      title={table.title}
      subtitle={`${table.rows.length} filas · clic en una columna para ordenar · datos de ejemplo`}
      source={topic.source}
      exportable={false}
      csv={sampleCsv(topic.slug, "", table.title, csvTable)}
      actions={
        <label className="obs-search">
          <span className="sr-only">Filtrar la tabla</span>
          <input type="search" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      }
    >
      <div className="obs-table-wrap">
        <table className="obs-table">
          <thead>
            <tr>
              {table.columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" data-numeric={c.numeric || undefined} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => setSort(on ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.numeric ? -1 : 1 })}>
                      {c.label}
                      <span aria-hidden="true">{on ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {table.columns.map((c, k) =>
                  k === 0 ? (
                    <th key={c.key} scope="row">
                      {cell(r[c.key], c.unit)}
                    </th>
                  ) : (
                    <td key={c.key} data-numeric={c.numeric || undefined}>
                      {cell(r[c.key], c.unit)}
                    </td>
                  ),
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={table.columns.length} className="obs-table__empty">
                  Ninguna fila coincide con «{query}».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}

/* --- Barra de contexto del Observatorio ---------------------------------------------
   La misma del Plan de Desarrollo: regresar, ir a los boletines y saltar
   entre los catorce temas. Un punto ámbar
   marca los temas que ya publican datos reales. */

function ObsBar({ current, published }: { current: string | null; published: Map<string, unknown> }) {
  return (
    <ContextBar
      label="Navegación del Observatorio"
      back={current ? { to: "/datos-abiertos/observatorio", label: "Todas las páginas" } : { to: "/", label: "Planeación Institucional" }}
      links={[{ label: "Boletines", to: "/datos-abiertos/boletines" }]}
      itemsLabel="Temas del Observatorio"
      items={OBS_TOPICS.map((t) => {
        const here = t.slug === current;
        const live = published.has(t.slug);
        return {
          key: t.slug,
          to: `/datos-abiertos/observatorio/${t.slug}`,
          code: t.code,
          name: t.name,
          tone: `var(--od-line-${t.line})`,
          current: here,
          flag: live,
          label: `${here ? "Estás leyendo" : "Abrir"} · ${t.name} · ${live ? "datos publicados" : "datos de ejemplo"}`,
        };
      })}
    />
  );
}
