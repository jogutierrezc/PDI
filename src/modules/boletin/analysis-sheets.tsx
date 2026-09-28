/* =============================================================================
   Boletín · páginas del Análisis de los datos.

   Convierte lo que escribió Pilo (settings.analysis) en unidades del boletín,
   que el documento reparte en páginas como las demás:
   · Hallazgos principales: una ficha por capítulo con su hallazgo, sus tres
     cifras clave con la variación y su alerta; al pie, la idea del cierre;
   · por informe: apertura con el hallazgo y sus cifras clave; el texto, un
     párrafo por unidad (así la paginación llena cada página); una franja de
     gráficas compactas tras el primer párrafo; alertas, recomendaciones y las
     fuentes citadas en el texto («[2]»);
   · cierre: conclusiones y recomendaciones.
   Los párrafos van «pegados» (tight): no entran al índice, que muestra solo
   capítulos. En el texto, las cifras van en negrita y las citas en voladita.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { changeBetween, valueOf } from "../datos-abiertos/data/open-data";
import { ALL_YEARS, cutLabel } from "../datos-abiertos/data/terms";
import type { Indicator, OpenDataCatalog, Report } from "../datos-abiertos/data/types";
import { analysisSources } from "./analysis";
import type { AnalysisChapter, AnalysisSource, BulletinAnalysis } from "./analysis";
import { EvolutionChart, figure, SERIES_COLORS } from "./figures";
import type { Series } from "./figures";
import type { Unit } from "./compose";
import type { BulletinSettings } from "./model";

const FORMAT_LABEL = { ejecutivo: "Informe ejecutivo", tecnico: "Informe técnico", sedes: "Comparativo por sede", tendencias: "Tendencias y alertas", libre: "Análisis" } as const;
/** Cuántas fuentes lee Pilo por capítulo (el mismo tope que usa la pestaña). */
const SOURCES = 24;

/** «Periodo 2021-2025» o «Corte 2025». */
const cutName = (catalog: OpenDataCatalog, cut: number) =>
  cut === ALL_YEARS ? `Periodo ${catalog.period?.label ?? cutLabel(ALL_YEARS, null)}` : `Corte ${cut}`;

const unitOf = (indicator: Indicator) => (indicator.format === "porcentaje" || indicator.unit === "%" ? "%" : indicator.unit);

/* --- El texto: cifras en negrita, citas en voladita ---------------------------------- */

const TOKENS = /(\[\d{1,2}(?:[,–-]\s?\d{1,2})*\])|(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(\s?(?:%|p\. ?p\.))?/g;

/** Una cifra que vale la pena resaltar: no un año ni un número suelto pequeño. */
const isFigure = (raw: string, suffix: string | undefined) => {
  if (suffix) return true;
  const v = Number(raw.replace(/\./g, "").replace(",", "."));
  if (Number.isInteger(v) && v >= 1900 && v <= 2100) return false;
  return raw.includes(",") || raw.includes(".") || v > 10;
};

export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  let m: RegExpExecArray | null;
  TOKENS.lastIndex = 0;
  while ((m = TOKENS.exec(text))) {
    if (m.index > at) parts.push(text.slice(at, m.index));
    if (m[1]) {
      parts.push(
        <sup key={m.index} className="bol-analysis__cite">
          {m[1]}
        </sup>,
      );
    } else if (isFigure(m[2], m[3])) {
      parts.push(
        <b key={m.index} className="bol-analysis__fig">
          {m[2]}
          {m[3] ? m[3].replace(/^\s/, " ") : ""}
        </b>,
      );
    } else {
      parts.push(m[0]);
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  // Un espacio fino antes de la cita no la despega de su cifra.
  return <>{parts}</>;
}

/* --- Cifras clave de un capítulo ---------------------------------------------------- */

interface Key {
  indicator: Indicator;
  value: number;
  year: number;
  change: ReturnType<typeof changeBetween>;
  prevYear: number | null;
}

function keysOf(sources: AnalysisSource[], limit: number): Key[] {
  return sources.slice(0, limit).map(({ indicator, series }) => {
    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    return { indicator, value: last.v, year: last.y, prevYear: prev?.y ?? null, change: prev ? changeBetween(indicator, last.v, prev.v) : null };
  });
}

function KeyFigures({ keys }: { keys: Key[] }) {
  return (
    <dl className="bol-analysis__keys">
      {keys.map(({ indicator, value, year, change, prevYear }) => (
        <div key={indicator.id}>
          <dt>{indicator.label}</dt>
          <dd>
            <b>{figure(value, indicator.format)}</b>
            <small> {unitOf(indicator)}</small>
          </dd>
          <dd className="bol-analysis__delta" data-reading={change?.reading}>
            {change ? `${change.label} frente a ${prevYear}` : year}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* --- Unidades ------------------------------------------------------------------------- */

/**
 * El encabezado de cada parte del documento, con el diseño de las conclusiones:
 * una línea de contexto, el título grande y un subtítulo contenido.
 */
export function Head({ kicker, title, subtitle, children }: { kicker?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <section className="bol-analysis__head">
      {kicker && <p className="bol-analysis__kicker">{kicker}</p>}
      <h2>{title}</h2>
      {subtitle && (
        <p className="bol-analysis__subtitle">
          <Rich text={subtitle} />
        </p>
      )}
      {children}
    </section>
  );
}

function Opener({ report, chapter, keys, number }: { report: Report; chapter: AnalysisChapter; keys: Key[]; number: number }) {
  return (
    <div style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <Head kicker={`Capítulo ${number} · ${report.code}`} title={report.name} subtitle={chapter.summary}>
        {keys.length > 0 && <KeyFigures keys={keys} />}
      </Head>
    </div>
  );
}

export const Paragraph = ({ text }: { text: string }) => (
  <p className="bol-analysis__prose">
    <Rich text={text} />
  </p>
);

export function Callout({ title, items, tone }: { title: string; items: string[]; tone: "alerta" | "idea" }) {
  return (
    <aside className="bol-analysis__callout" data-tone={tone}>
      <h4>{title}</h4>
      {items.length === 1 ? (
        <p>
          <Rich text={items[0]} />
        </p>
      ) : (
        <ol>
          {items.map((item, i) => (
            <li key={i}>
              <Rich text={item} />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/** Dos gráficas compactas lado a lado: la evolución del total y de cada sede. */
function ChartStrip({ sources, catalog, settings }: { sources: AnalysisSource[]; catalog: OpenDataCatalog; settings: BulletinSettings }) {
  const sites = catalog.campuses.filter((c) => c.id !== "todas");
  return (
    <div className="bol-analysis__charts">
      {sources.map(({ n, indicator, series }) => {
        const years = series.map((p) => p.y);
        const lines: Series[] =
          settings.campus === "todas"
            ? [
                { label: "Total", color: "var(--bol-navy)", values: series.map((p) => p.v) },
                ...sites
                  .map((s, i) => ({ label: s.name, color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length], values: years.map((y) => valueOf(indicator, y, s.id)), dashed: true }))
                  .filter((s) => s.values.some((v) => v !== null))
                  .slice(0, 4),
              ]
            : [{ label: catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Sede", color: "var(--bol-navy)", values: series.map((p) => p.v) }];
        return (
          <figure key={indicator.id}>
            <figcaption>
              <b>{indicator.label}</b> <sup className="bol-analysis__cite">[{n}]</sup>
              <small>{unitOf(indicator)}</small>
            </figcaption>
            <EvolutionChart years={years} series={lines} format={indicator.format} width={84} height={40} label={`Evolución de ${indicator.label}`} />
            {lines.length > 1 && (
              <ul className="bol-analysis__legend">
                {lines.map((l) => (
                  <li key={l.label}>
                    <i style={{ background: l.color }} data-dashed={l.dashed || undefined} />
                    {l.label}
                  </li>
                ))}
              </ul>
            )}
          </figure>
        );
      })}
    </div>
  );
}

function Sources({ sources, cited, catalog, settings, compact = false }: { sources: AnalysisSource[]; cited: Set<number>; catalog: OpenDataCatalog; settings: BulletinSettings; compact?: boolean }) {
  // Primero las citadas en el texto; si el texto no citó ninguna, todas las que leyó.
  const list = cited.size ? sources.filter((s) => cited.has(s.n)) : sources;
  const cut = cutName(catalog, settings.cut).toLowerCase();
  // Compacta: en un solo párrafo, para que quepa al pie del capítulo y no abra página sola.
  if (compact) {
    return (
      <p className="bol-analysis__sources bol-analysis__sources--compact">
        <b>Fuentes.</b>{" "}
        {list.map(({ n, indicator }, i) => (
          <span key={n}>
            [{n}] {indicator.label} ({indicator.source || "oficina responsable"}){i < list.length - 1 ? " · " : ""}
          </span>
        ))}
        . UDES en Cifras, {cut}.
      </p>
    );
  }
  return (
    <section className="bol-analysis__sources">
      <h4>Fuentes</h4>
      <ol>
        {list.map(({ n, indicator, series }) => (
          <li key={n}>
            <span>[{n}]</span>
            <p>
              <b>{indicator.label}</b> · {indicator.source || "Oficina responsable"} · UDES en Cifras, {cut}
              {settings.cut !== ALL_YEARS && series.length > 1 ? ` (${series[0].y}–${series[series.length - 1].y})` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FindingsHead({ analysis, settings, catalog }: { analysis: BulletinAnalysis; settings: BulletinSettings; catalog: OpenDataCatalog }) {
  const campusName = settings.campus === "todas" ? "Todos los campus" : catalog.campuses.find((c) => c.id === settings.campus)?.name ?? "Todos los campus";
  const cut = cutName(catalog, settings.cut);
  return (
    <Head
      kicker={`${FORMAT_LABEL[analysis.brief.format]} para ${analysis.brief.audience || "la dirección"} · ${cut} · ${campusName}`}
      title="Hallazgos principales"
      subtitle={analysis.closing?.summary}
    />
  );
}

/** Un hallazgo por capítulo: su idea, sus tres cifras clave con la variación y su alerta. */
function FindingCard({ report, chapter, keys }: { report: Report; chapter: AnalysisChapter; keys: Key[] }) {
  return (
    <article className="bol-analysis__card" style={{ "--line": `var(--bol-line-${report.line})` } as CSSProperties}>
      <a className="bol-summary__report" href={`#cap-${report.slug}`}>
        <span className="bol-chapter__code">{report.code}</span>
        <span>{report.name}</span>
      </a>
      <div>
        <p className="bol-analysis__finding">
          <Rich text={chapter.summary || chapter.paragraphs[0] || ""} />
        </p>
        {keys.length > 0 && <KeyFigures keys={keys} />}
        {chapter.alerts[0] && (
          <p className="bol-analysis__alert">
            <b>Alerta.</b> <Rich text={chapter.alerts[0]} />
          </p>
        )}
      </div>
    </article>
  );
}

function Pending() {
  return (
    <section className="bol-summary bol-analysis__pending">
      <h2>Análisis de los datos</h2>
      <p className="bol-summary__lede">
        Mr. Pilo aún no ha escrito este documento. En la pestaña «Análisis con Pilo», elija el formato, los informes y la longitud, y pulse «Escribir el análisis».
      </p>
    </section>
  );
}

const citedIn = (chapter: AnalysisChapter) => {
  const found = new Set<number>();
  const text = [chapter.summary, ...chapter.paragraphs, ...chapter.alerts, ...chapter.recommendations].join(" ");
  for (const m of text.matchAll(/\[(\d{1,2}(?:[,–-]\s?\d{1,2})*)\]/g)) {
    for (const piece of m[1].split(/,\s?/)) {
      const [a, b] = piece.split(/[–-]/).map(Number);
      for (let k = a; k <= (b || a); k += 1) found.add(k);
    }
  }
  return found;
};

/**
 * Las unidades del análisis. `credit` suma la oficina de cada cifra usada a la
 * contraportada.
 */
export function analysisUnits(catalog: OpenDataCatalog, settings: BulletinSettings, credit: (source: string, report: Report) => void): { units: Unit[]; chapters: Report[] } {
  const analysis = settings.analysis;
  const units: Unit[] = [];
  const chapters: Report[] = [];
  const pending = { units: [{ key: "analisis-pendiente", kind: "resumen" as const, title: "Análisis de los datos", breakBefore: true, node: <Pending /> }], chapters };
  if (!analysis) return pending;

  const written: { report: Report; chapter: AnalysisChapter; sources: AnalysisSource[]; keys: Key[] }[] = [];
  for (const entry of settings.reports) {
    if (!entry.include || entry.removed) continue;
    const report = catalog.reports.find((r) => r.slug === entry.slug);
    const chapter = analysis.chapters[entry.slug];
    if (!report || !chapter) continue;
    const sources = analysisSources(report, entry, catalog, settings.cut, settings.campus, SOURCES);
    written.push({ report, chapter, sources, keys: keysOf(sources, 3) });
  }
  if (!written.length) return pending;

  written.forEach(({ report, chapter, sources, keys }, n) => {
    chapters.push(report);
    sources.forEach(({ indicator }) => credit(indicator.source, report));
    const body = (key: string, node: ReactNode): Unit => ({ key: `${report.slug}-${key}`, kind: "conjunto", report, title: report.name, tight: true, node });
    units.push({ key: `${report.slug}-analisis`, kind: "capitulo", report, title: report.name, breakBefore: true, node: <Opener report={report} chapter={chapter} keys={keys} number={n + 1} /> });
    const cited = citedIn(chapter);
    // Las gráficas van tras el primer párrafo: primero la lectura, luego la cifra que la sostiene.
    const charted = analysis.charts ? [...sources.filter((s) => cited.has(s.n)), ...sources.filter((s) => !cited.has(s.n))].slice(0, 2) : [];
    chapter.paragraphs.forEach((text, i) => {
      units.push(body(`p${i}`, <Paragraph text={text} />));
      if (i === 0 && charted.length) units.push(body("graficas", <ChartStrip sources={charted} catalog={catalog} settings={settings} />));
    });
    if (chapter.alerts.length) units.push(body("alertas", <Callout title="Alertas" items={chapter.alerts} tone="alerta" />));
    if (chapter.recommendations.length) units.push(body("recomendaciones", <Callout title="Recomendaciones" items={chapter.recommendations} tone="idea" />));
    if (sources.length) {
      units.push({
        ...body("fuentes", <Sources sources={sources} cited={cited} catalog={catalog} settings={settings} />),
        compact: <Sources sources={sources} cited={cited} catalog={catalog} settings={settings} compact />,
      });
    }
  });

  if (analysis.closing) {
    const closing = analysis.closing;
    units.push({
      key: "analisis-cierre",
      kind: "seccion",
      title: "Conclusiones y recomendaciones",
      breakBefore: true,
      node: <Head kicker="Cierre" title="Conclusiones y recomendaciones" subtitle={closing.summary} />,
    });
    const tail = (key: string, node: ReactNode): Unit => ({ key: `analisis-cierre-${key}`, kind: "conjunto", title: "Conclusiones", tight: true, node });
    closing.paragraphs.forEach((text, i) => units.push(tail(`p${i}`, <Paragraph text={text} />)));
    if (closing.alerts.length) units.push(tail("alertas", <Callout title="Lo que preocupa" items={closing.alerts} tone="alerta" />));
    if (closing.recommendations.length) units.push(tail("rec", <Callout title="Qué conviene decidir" items={closing.recommendations} tone="idea" />));
  }

  if (analysis.summary) {
    // La apertura y una ficha por capítulo, cada una su unidad: la paginación las reparte sin cortar ninguna.
    units.unshift(
      { key: "resumen", kind: "resumen", title: "Hallazgos principales", breakBefore: true, node: <FindingsHead analysis={analysis} settings={settings} catalog={catalog} /> },
      ...written.map(({ report, chapter, keys }) => ({
        key: `resumen-${report.slug}`,
        kind: "tablero" as const,
        title: report.name,
        node: <FindingCard report={report} chapter={chapter} keys={keys} />,
      })),
    );
  }
  return { units, chapters };
}

