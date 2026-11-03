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

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { ChartFrame } from "../components/ChartFrame";
import type { CsvFile, CsvTable } from "../data/csv-export";
import { OpenDataLayout } from "../components/OpenDataLayout";
import { SplitFlap } from "../components/SplitFlap";
import { useInView, useWidth } from "../components/motion";
import type { ObsTable, ObsTopic } from "./data";
import { useCatalogo } from "./catalogo";
import type { TemaPublico } from "./catalogo";
import { summarize, useObservatoryLive } from "./live";
import { ContextBar } from "../../../components/layout/ContextBar";
import type { LiveSummary, LiveTopic } from "./live";
import { TEXTOS } from "./presentacion/textos";
import { Cartel, Franja, Mosaico, ObsClaro, ObsIntro, Pie, PortadaCabecera, PresentacionResumen, Seccion, introPendiente, rutaTema, useAlInicio, useMovimientoTema } from "./rediseno";
import type { MetaCartel } from "./rediseno";
import { datosTablero, obsIcono as obsIconoTablero } from "./tablero";

const LiveTopicBody = lazy(() => import("./LiveTopic"));
import "../datos-abiertos.css";
import "./observatorio.css";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const one = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: number) => (Number.isInteger(v) ? integer.format(v) : decimal.format(v));
const headlineText = (t: ObsTopic) =>
  t.headline.format === "porcentaje" ? `${decimal.format(t.headline.value)} %` : num(t.headline.value);
export const lineStyle = (line: number, color?: string | null) => ({ "--line": color || `var(--od-line-${line})` }) as CSSProperties;
export const liveText = (s: LiveSummary) => (s.format === "porcentaje" ? `${one.format(s.value)} %` : s.format === "entero" ? integer.format(s.value) : decimal.format(s.value));
const longDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

/** El CSV de un panel de la maqueta: su archivo y el nombre con que se anuncia. */
const sampleCsv = (slug: string, part: string, name: string, build: CsvFile["build"]) => ({
  files: [{ filename: `observatorio-${slug}-${part}datos-de-ejemplo.csv`, build }],
  name,
});

/** Los temas publicados, con su resumen para el tablero. */
export function useLive() {
  const query = useObservatoryLive();
  return useMemo(() => {
    const map = new Map<string, { live: LiveTopic; summary: LiveSummary | null }>();
    for (const [slug, live] of query.data ?? []) map.set(slug, { live, summary: summarize(live) });
    return map;
  }, [query.data]);
}

/** El aviso que acompaña a toda cifra del Observatorio mientras sea maqueta. */
function ExampleNote({ compact = false, published = 0 }: { compact?: boolean; published?: number }) {
  const total = useCatalogo().principal.length;
  if (published >= total) return null;
  const partial = published > 0;
  return (
    <p className="obs-note" data-compact={compact || undefined} role="note">
      <span className="od-stamp">{partial ? `${published} de ${total} con datos` : "Datos de ejemplo"}</span>
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
  const catalogo = useCatalogo();
  const lista = catalogo.principal;
  const [active, setActive] = useState(lista[0].slug);
  const topic = lista.find((t) => t.slug === active) ?? lista[0];
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
                : `${lista.length} páginas para explorar los datos de la vida académica de la universidad: de la oferta y la población a las alertas tempranas, la deserción y lo que pasa con los graduados. Cada página parte de una pregunta y deja ver, ordenar y descargar el dato.`}
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
              {lista.map((t, index) => {
                const real = live.get(t.slug);
                const summary = real?.summary;
                const figure = summary ? liveText(summary) : real || t.vacio ? "—" : headlineText(t);
                const label = summary ? summary.label : real ? "Datos publicados" : t.vacio ? "Sin datos publicados" : t.headline.label;
                return (
                <li key={t.slug}>
                  <Link
                    className="od-row"
                    to={`/datos-abiertos/observatorio/${t.slug}`}
                    data-active={t.slug === topic.slug || undefined}
                    onMouseEnter={() => setActive(t.slug)}
                    onFocus={() => setActive(t.slug)}
                  >
                    <span className="od-row__code od-line" style={lineStyle(t.line, (t as { color?: string | null }).color)}>
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
                        {!real && !t.vacio && <span className="obs-sample-tag">ejemplo</span>}
                      </span>
                    </span>
                    <span className="od-row__previous obs-spark">
                      {real ? summary?.spark && summary.spark.length > 1 ? <Spark values={summary.spark} /> : null : t.vacio ? null : <Spark values={t.series.points.map(([, v]) => v)} />}
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
                <span className="od-line" style={lineStyle(topic.line, (topic as { color?: string | null }).color)}>
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
              ) : topic.vacio ? (
                <p className="obs-live-count">Aún sin datos publicados</p>
              ) : (
                <MiniShare title={topic.share.title} items={topic.share.items} />
              )}
              <Link className="od-button od-button--signal" to={`/datos-abiertos/observatorio/${topic.slug}`}>
                Abrir la página <Icon name="arrow-right" size={17} />
              </Link>
              <small className="od-platform__credit">
                {current
                  ? `Fuente: ${current.live.sources.join(", ") || topic.source}${current.live.updatedAt ? ` · actualizado el ${longDate.format(new Date(current.live.updatedAt))}` : ""}`
                  : topic.vacio ? `Fuente prevista: ${topic.source || "por definir"}` : `Alimentará este conjunto: ${topic.source} · datos de ejemplo`}
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

/* --- Portada del Observatorio ------------------------------------------------------------- */

export function ObservatoryHub() {
  const live = useLive();
  const catalogo = useCatalogo();
  const lista = catalogo.principal;
  const tableros = lista.map((t) => ({ datos: datosTablero(t), pregunta: t.question }));
  const calidad = lista.find((t) => t.slug === "calidad-institucional");
  return (
    <OpenDataLayout title="Observatorio de Analítica Académica | UDES en Cifras" className="obs-page">
      <ObsBar current={null} published={live} temas={lista} />
      <ObsClaro>
        <div className="obsr-wrap">
          <PortadaCabecera
            id="obs-hub"
            lineas={["Observatorio de", "Analítica Académica"]}
            lede="Los datos de la vida académica de la Universidad de Santander, del primer contacto al graduado. Cada página parte de una pregunta y deja ver, ordenar y descargar el dato."
            cita={{ texto: TEXTOS.es.h1b, firma: TEXTOS.es.firma }}
            cifras={[
              { valor: lista.length, texto: "páginas en el tablero del Observatorio" },
              { valor: live.size, texto: "páginas con datos publicados" },
              { valor: 3, texto: "pilares: comprender, actuar y transformar" },
              { valor: 4, texto: "campus en la misma lectura" },
            ]}
            atras={
              <>
                <Link to="/datos-abiertos">
                  <Icon name="arrow-left" size={16} /> UDES en Cifras
                </Link>
                <span>Observatorio</span>
              </>
            }
          />
          <div className="obsr-tools">
            <div>
              <h2>Los tableros</h2>
              <p>Elige un tablero para explorar su serie, su reparto y su tabla.</p>
            </div>
          </div>
          <Mosaico tableros={tableros} etiqueta="Tableros del Observatorio" />
          <ExampleNote published={live.size} />
          <PresentacionResumen rutaPresentacion="/datos-abiertos/observatorio/presentacion-institucional" rutaCalidad={calidad ? rutaTema(calidad.slug) : null} />
          <OtrosObservatorios />
        </div>
      </ObsClaro>
    </OpenDataLayout>
  );
}

/* --- Página de un tema -------------------------------------------------------------------- */

/** Se monta cuando el cuerpo (cargado aparte) ya está en pantalla: avisa para animar sus títulos. */
function Montado({ onMontado }: { onMontado: () => void }) {
  useEffect(onMontado, [onMontado]);
  return null;
}

export function ObservatoryTopic() {
  const { tema } = useParams();
  const catalogo = useCatalogo();
  const topic = catalogo.buscar(tema);
  const liveMap = useLive();
  const raiz = useRef<HTMLDivElement>(null);
  const slug = topic?.slug ?? "";
  // El efecto de carga: una vez por sesión y por tablero, y nunca con movimiento reducido.
  const [intro, setIntro] = useState<{ slug: string; fase: "intro" | "listo" | "fin" }>(() => ({ slug, fase: introPendiente(slug) ? "intro" : "fin" }));
  if (intro.slug !== slug) setIntro({ slug, fase: introPendiente(slug) ? "intro" : "fin" });
  const [cuerpo, setCuerpo] = useState(false);
  const alMontar = useCallback(() => setCuerpo(true), []);
  const real = liveMap.get(slug);
  useMovimientoTema(raiz, slug, intro.fase !== "intro", cuerpo || !real);
  useAlInicio(slug);

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
  const lista = catalogo.listaDe(topic);
  const index = Math.max(0, lista.findIndex((t) => t.slug === topic.slug));
  const prev = lista[(index - 1 + lista.length) % lista.length];
  const next = lista[(index + 1) % lista.length];
  const datos = datosTablero(topic);
  const obs = catalogo.observatorios.find((o) => o.id === topic.obsId);
  const atras = { to: obs && !obs.principal ? `/datos-abiertos/observatorio/o/${obs.slug}` : "/datos-abiertos/observatorio", texto: `Volver a las ${lista.length} páginas` };

  const meta: MetaCartel[] = real
    ? [
        { rotulo: "Fuente", valor: real.live.sources.join(", ") || topic.source },
        ...(real.summary ? [{ rotulo: real.summary.label, valor: `${liveText(real.summary)} ${real.summary.format === "porcentaje" ? "" : real.summary.unit}`.trim() }] : []),
        ...(real.live.updatedAt ? [{ rotulo: "Actualizado", valor: longDate.format(new Date(real.live.updatedAt)) }] : []),
      ]
    : topic.vacio
      ? [{ rotulo: "Fuente prevista", valor: topic.source || "Por definir" }]
      : [
          { rotulo: "Alimentará este conjunto", valor: topic.source },
          { rotulo: topic.headline.label, valor: `${headlineText(topic)} ${topic.headline.format === "porcentaje" ? "" : topic.headline.unit}`.trim() },
        ];

  return (
    <OpenDataLayout title={`${topic.name} · Observatorio | UDES en Cifras`} className="obs-page">
      <ObsBar current={topic.slug} published={liveMap} temas={lista} />
      <ObsClaro innerRef={raiz}>
        {intro.fase !== "fin" && (
          <ObsIntro
            key={topic.slug}
            slug={topic.slug}
            n={index + 1}
            color={datos.color}
            nombre={topic.name}
            tiras={lista.map((t) => datosTablero(t).color)}
            onReady={() => setIntro((x) => (x.fase === "intro" ? { ...x, fase: "listo" } : x))}
            onGone={() => setIntro((x) => ({ ...x, fase: "fin" }))}
          />
        )}
        <Cartel d={datos} indice={index} total={lista.length} atras={atras} pregunta={real?.live.config.intro || topic.question} meta={meta} ilustrativo={!real && !topic.vacio} />
        <Franja d={datos} />
        <div className="obsr-wrap">
          {real ? (
            <Suspense fallback={<div className="obs-live__loading" aria-busy="true" />}>
              <LiveTopicBody live={real.live} slug={topic.slug} />
              <Montado onMontado={alMontar} />
            </Suspense>
          ) : topic.vacio ? (
            <section className="obs-views" aria-label={`Datos de ${topic.name}`}>
              <p className="obs-note" role="note">
                <span className="od-stamp">Sin datos publicados</span>
                <span>Esta página aún no publica tablas ni visores. Aparecerán aquí cuando se publiquen.</span>
              </p>
            </section>
          ) : (
            <>
              <ExampleNote />
              <Seccion id="serie" titulo="Serie en el tiempo">
                <div className="obs-grid">
                  <SeriesPanel topic={topic} />
                </div>
              </Seccion>
              <Seccion id="reparto" titulo="Reparto">
                <div className="obs-grid">
                  <SharePanel topic={topic} />
                </div>
              </Seccion>
              <Seccion id="tabla" titulo="La tabla completa">
                <div className="obs-grid">
                  <TablePanel topic={topic} table={topic.table} />
                </div>
              </Seccion>
            </>
          )}
          {lista.length > 1 && <Pie anterior={datosTablero(prev)} siguiente={datosTablero(next)} />}
        </div>
      </ObsClaro>
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

export function ObsBar({ current, published, temas }: { current: string | null; published: Map<string, unknown>; temas: TemaPublico[] }) {
  return (
    <ContextBar
      label="Navegación del Observatorio"
      back={current ? { to: "/datos-abiertos/observatorio", label: "Todas las páginas" } : { to: "/", label: "Planeación Institucional" }}
      links={[{ label: "Boletines", to: "/datos-abiertos/boletines" }]}
      itemsLabel="Temas del Observatorio"
      items={temas.map((t) => {
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

/* --- Otros observatorios (solo si hay más de uno publicado) ------------------------- */

export const obsIcono = obsIconoTablero;

function OtrosObservatorios() {
  const catalogo = useCatalogo();
  if (catalogo.observatorios.length < 2) return null;
  return (
    <section className="od-section obs-otros" aria-labelledby="obs-otros">
      <div className="u-container">
        <h2 id="obs-otros">Observatorios</h2>
        <ul className="obs-otros__lista">
          {catalogo.observatorios.map((o) => (
            <li key={o.id}>
              <Link to={o.principal ? "/datos-abiertos/observatorio" : `/datos-abiertos/observatorio/o/${o.slug}`} className="obs-otros__item" style={{ "--obs-color": o.color } as CSSProperties} aria-current={o.principal ? "page" : undefined}>
                <span className="obs-otros__icono" aria-hidden="true">
                  <Icon name={obsIcono(o.icono)} size={20} />
                </span>
                <span>
                  <strong>{o.nombre}</strong>
                  <small>{o.descripcion || `${catalogo.porObs.get(o.id)?.length ?? 0} páginas`}</small>
                </span>
                <Icon name="arrow-right" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
