/* =============================================================================
   Observatorio de Analítica Académica · MAQUETA CON DATOS DE EJEMPLO.

   Vive en el mismo tablero de paletas que los informes de UDES en Cifras (el
   mismo mundo visual), con una diferencia de fondo: aquí no hay indicadores
   con meta y corte, sino conjuntos de datos para explorar. Por eso cada tema
   abre con una pregunta y ofrece tres vistas del dato: la serie, el reparto
   y la tabla que se ordena, se filtra y se descarga.

   · ObservatoryBoard: la sección del índice de /datos-abiertos, en filas de
     llegadas como el tablero de informes.
   · ObservatoryHub: /datos-abiertos/observatorio.
   · ObservatoryTopic: /datos-abiertos/observatorio/:tema.

   Toda cifra sale de observatorio/data.ts y se rotula «Datos de ejemplo».
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { downloadText } from "../data/open-data";
import { ChartFrame } from "../components/ChartFrame";
import { OpenDataLayout } from "../components/OpenDataLayout";
import { SplitFlap } from "../components/SplitFlap";
import { useInView, useWidth } from "../components/motion";
import { OBS_TOPICS, findTopic } from "./data";
import type { ObsTable, ObsTopic } from "./data";
import "../datos-abiertos.css";
import "./observatorio.css";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const one = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: number) => (Number.isInteger(v) ? integer.format(v) : decimal.format(v));
const headlineText = (t: ObsTopic) =>
  t.headline.format === "porcentaje" ? `${decimal.format(t.headline.value)} %` : num(t.headline.value);
const lineStyle = (line: number) => ({ "--line": `var(--od-line-${line})` }) as CSSProperties;

/** El aviso que acompaña a toda cifra del Observatorio mientras sea maqueta. */
function ExampleNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className="obs-note" data-compact={compact || undefined} role="note">
      <span className="od-stamp">Datos de ejemplo</span>
      <span>
        {compact
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
          {!standalone && <ExampleNote compact />}
        </div>

        <div className="od-board__grid">
          <div className="od-departures">
            <div className="od-departures__columns" aria-hidden="true">
              <span>Página</span>
              <span>Dato de ejemplo</span>
              <span>Tendencia</span>
            </div>
            <ol className="od-departures__list">
              {OBS_TOPICS.map((t, index) => (
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
                        <SplitFlap value={headlineText(t)} align="end" size="sm" delay={index * 70 + 140} numeric label={`${t.headline.label}: ${headlineText(t)} (dato de ejemplo)`} />
                      </span>
                      <span className="od-row__indicator">{t.headline.label}</span>
                    </span>
                    <span className="od-row__previous obs-spark">
                      <Spark values={t.series.points.map(([, v]) => v)} />
                    </span>
                    <span className="od-row__go" aria-hidden="true">
                      <Icon name="arrow-right" size={20} />
                    </span>
                  </Link>
                </li>
              ))}
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
              <p className="obs-question">{topic.question}</p>
              <MiniShare topic={topic} />
              <Link className="od-button od-button--signal" to={`/datos-abiertos/observatorio/${topic.slug}`}>
                Abrir la página <Icon name="arrow-right" size={17} />
              </Link>
              <small className="od-platform__credit">Alimentará este conjunto: {topic.source} · datos de ejemplo</small>
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

function MiniShare({ topic }: { topic: ObsTopic }) {
  const total = topic.share.items.reduce((s, [, v]) => s + v, 0);
  return (
    <figure className="obs-mini">
      <figcaption>{topic.share.title}</figcaption>
      <span className="obs-mini__bar">
        {topic.share.items.map(([label, v], k) => (
          <i key={label} style={{ "--w": `${(v / total) * 100}%`, "--tone": `var(--od-inst-${(k % 6) + 1})` } as CSSProperties} title={`${label}: ${num(v)}`} />
        ))}
      </span>
      <span className="obs-mini__legend">
        {topic.share.items.slice(0, 4).map(([label, v], k) => (
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
  return (
    <OpenDataLayout title="Observatorio de Analítica Académica | UDES en Cifras" className="obs-page">
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
          <ExampleNote />
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

  return (
    <OpenDataLayout title={`${topic.name} · Observatorio | UDES en Cifras`} className="obs-page">
      <div className="od-report-bar obs-bar">
        <nav className="od-strip" aria-label="Cambiar de página del Observatorio">
          {OBS_TOPICS.map((t) => {
            const current = t.slug === topic.slug;
            const label = current ? `Estás leyendo · ${t.name}` : `Abrir · ${t.name}`;
            return (
              <Link
                key={t.slug}
                to={`/datos-abiertos/observatorio/${t.slug}`}
                className="od-strip__seg"
                aria-current={current ? "page" : undefined}
                aria-label={label}
                data-label={label}
                style={lineStyle(t.line)}
              >
                <span aria-hidden="true">{t.code}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <section className="od-report-head obs-head" aria-labelledby="obs-tema">
        <div className="u-container">
          <Link className="od-back" to="/datos-abiertos/observatorio">
            <Icon name="arrow-left" size={16} /> Observatorio de Analítica Académica
          </Link>
          <div className="obs-head__row">
            <span className="od-report-head__code od-line" style={lineStyle(topic.line)}>
              <SplitFlap key={topic.slug} value={topic.code} size="lg" delay={80} />
            </span>
            <span className="obs-head__count">
              Página {index + 1} de {OBS_TOPICS.length}
            </span>
          </div>
          <h1 id="obs-tema">{topic.name}</h1>
          <p className="obs-head__question">{topic.question}</p>
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
        </div>
      </section>

      <section className="od-section obs-views" aria-label={`Datos de ${topic.name}`}>
        <div className="u-container obs-grid">
          <SeriesPanel topic={topic} />
          <SharePanel topic={topic} />
          <TablePanel topic={topic} table={topic.table} />
        </div>
      </section>

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
    <ChartFrame className="obs-panel obs-panel--series" title={topic.series.title} subtitle={`${topic.series.unit} · ${points[0][0]}–${points[points.length - 1][0]} · datos de ejemplo`} source={topic.source} exportName={`observatorio-${topic.slug}-serie`}>
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
    <ChartFrame className="obs-panel obs-panel--share" title={topic.share.title} subtitle={`${num(total)} ${topic.share.unit} · datos de ejemplo`} source={topic.source} exportName={`observatorio-${topic.slug}-reparto`}>
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

  const csv = () => {
    const head = table.columns.map((c) => c.label).join(";");
    const body = table.rows.map((r) => table.columns.map((c) => String(r[c.key] ?? "")).join(";")).join("\n");
    downloadText(`observatorio-${topic.slug}-datos-de-ejemplo.csv`, `${head}\n${body}\n`);
  };

  return (
    <ChartFrame
      className="obs-panel obs-panel--table"
      title={table.title}
      subtitle={`${table.rows.length} filas · clic en una columna para ordenar · datos de ejemplo`}
      source={topic.source}
      exportable={false}
      actions={
        <>
          <label className="obs-search">
            <span className="sr-only">Filtrar la tabla</span>
            <input type="search" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="button" className="od-button od-button--ghost obs-csv" onClick={csv}>
            <Icon name="download" size={15} /> CSV
          </button>
        </>
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
