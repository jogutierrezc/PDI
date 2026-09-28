/* =============================================================================
   Indicadores de Impacto · el informe con Mr. Pilo, en papel.

   El mismo diseño del «Análisis de los datos» de UDES en Cifras (las clases
   bol-analysis de boletin.css y sus piezas: Head, Paragraph, Callout, Rich):
   · Hallazgos principales: una ficha por capítulo con su hallazgo, sus cifras
     clave y su primera alerta;
   · cada capítulo: apertura con el hallazgo y las cifras clave, el texto
     justificado (cifras en negrita, citas en voladita), la gráfica de avance
     tras el primer párrafo, alertas, recomendaciones y las fuentes;
   · conclusiones y recomendaciones.
   Cada pieza es un bloque: la ventana los pinta seguidos en una hoja y la
   página de impresión los reparte en páginas carta (PagedDocument).

   El papel es papel: como el boletín, no cambia con el tema oscuro.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { Callout, Head, Paragraph, Rich } from "../../boletin/analysis-sheets";
import { DEFAULT_THEME } from "../../boletin/model";
import type { AnalysisChapter } from "../../boletin/analysis";
import { FN_SHORT, isFunction } from "../portal/analysis";
import { STANDING_GLYPH, STANDING_LABEL } from "../portal/standing";
import type { ReportBar, ReportDoc, ReportFigure, ReportPart, ReportSource } from "./report";
import "../../boletin/boletin.css";
import "./informe.css";

const FORMAT_LABEL = { ejecutivo: "Informe ejecutivo", tecnico: "Informe técnico", sedes: "Comparativo", tendencias: "Tendencias y alertas", libre: "Informe" } as const;
const FN_LINE = { investigacion: 1, ensenanza: 2, extension: 3 } as const;

/** Las variables del papel: las de la plantilla por defecto del boletín, con la letra del portal. */
export const PAPER_STYLE = {
  "--bol-navy": DEFAULT_THEME.navy,
  "--bol-band": DEFAULT_THEME.band,
  "--bol-accent": DEFAULT_THEME.accent,
  "--bol-font": "var(--font-sans)",
} as CSSProperties;

const toneOf = (part: Pick<ReportPart, "key">, k: number) => `var(--bol-line-${isFunction(part.key) ? FN_LINE[part.key] : (k % 9) + 1})`;
const codeOf = (part: Pick<ReportPart, "key">, k: number) => (isFunction(part.key) ? FN_SHORT[part.key] : String(k + 1));

function Figures({ figures }: { figures: ReportFigure[] }) {
  return (
    <dl className="bol-analysis__keys">
      {figures.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd>
            <b>{f.value}</b>
          </dd>
          <dd className="bol-analysis__delta" data-reading={f.tone === "bien" ? "mejora" : f.tone === "mal" ? "empeora" : undefined}>
            {f.note}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** El avance de cada indicador frente a su meta 2026, con las marcas del 70 % y del 100 %. */
function Bars({ bars, group }: { bars: ReportBar[]; group: boolean }) {
  const MAX = 150;
  const at = (v: number) => `${(Math.min(Math.max(v, 0), MAX) / MAX) * 100}%`;
  return (
    <figure className="imp-rep-bars">
      <figcaption>
        <b>{group ? "Avance mediano de los programas frente a la meta 2026" : "Avance frente a la meta 2026"}</b>
        <small>Rezagada por debajo del 70 %, cumplida desde el 100 %</small>
      </figcaption>
      <ul>
        {bars.map((b) => (
          <li key={b.code} data-standing={b.standing}>
            <span className="imp-rep-bars__name">
              <b>{b.code}</b> {b.name}
            </span>
            <span className="imp-rep-bars__track" aria-hidden="true">
              {b.pct !== null && <i style={{ width: at(b.pct) }} />}
              <em style={{ left: at(70) }} />
              <em style={{ left: at(100) }} />
            </span>
            <span className="imp-rep-bars__value">
              <span aria-hidden="true">{STANDING_GLYPH[b.standing]}</span> {b.pct === null ? STANDING_LABEL[b.standing] : `${Math.round(b.pct)} %`}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Sources({ sources, cited, cut }: { sources: ReportSource[]; cited: Set<number>; cut: number | null }) {
  const list = cited.size ? sources.filter((s) => cited.has(s.n)) : sources;
  if (!list.length) return null;
  return (
    <section className="bol-analysis__sources">
      <h4>Fuentes</h4>
      <ol>
        {list.map((s) => (
          <li key={s.n}>
            <span>[{s.n}]</span>
            <p>
              <b>
                {s.code} · {s.name}
              </b>{" "}
              · {s.source} · Indicadores de Impacto{cut ? `, corte ${cut}` : ""}
              {s.years ? ` (${s.years})` : ""}
            </p>
          </li>
        ))}
      </ol>
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

/** Las cifras que la IA escribió y no están en los datos: solo en pantalla, para revisar. */
function Review({ unknown }: { unknown: string[] }) {
  return (
    <p className="imp-rep-review" role="note">
      <b>Para revisar.</b> Estas cifras no están en los datos que leyó Pilo: {unknown.join(", ")}.
    </p>
  );
}

export interface ReportBlock {
  key: string;
  node: ReactNode;
}

/**
 * Los bloques del documento, en orden. `review` agrega las notas de cifras
 * para revisar (la ventana sí, el PDF no).
 */
export function reportBlocks(doc: ReportDoc, review = false): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const written = doc.parts.map((part, k) => ({ part, k })).filter((x): x is { part: ReportDoc["parts"][number] & { chapter: AnalysisChapter }; k: number } => Boolean(x.part.chapter));
  const group = doc.scope.kind !== "programa";
  const audience = doc.brief.audience ? ` para ${doc.brief.audience}` : "";

  blocks.push({
    key: "hallazgos",
    node: <Head kicker={`${FORMAT_LABEL[doc.brief.format]}${audience} · ${doc.subtitle}`} title="Hallazgos principales" subtitle={doc.closing?.summary} />,
  });
  for (const { part, k } of written) {
    blocks.push({
      key: `ficha-${part.key}`,
      node: (
        <article className="bol-analysis__card" style={{ "--line": toneOf(part, k) } as CSSProperties}>
          <p className="bol-summary__report">
            <span className="bol-chapter__code">{codeOf(part, k)}</span>
            <span>{part.title}</span>
          </p>
          <div>
            <p className="bol-analysis__finding">
              <Rich text={part.chapter.summary || part.chapter.paragraphs[0] || ""} />
            </p>
            {part.figures.length > 0 && <Figures figures={part.figures} />}
            {part.chapter.alerts[0] && (
              <p className="bol-analysis__alert">
                <b>Alerta.</b> <Rich text={part.chapter.alerts[0]} />
              </p>
            )}
          </div>
        </article>
      ),
    });
  }

  for (const { part, k } of written) {
    const chapter = part.chapter;
    const id = `cap-${part.key}`;
    blocks.push({
      key: id,
      node: (
        <div className="imp-rep-opener" style={{ "--line": toneOf(part, k) } as CSSProperties}>
          <Head kicker={part.kicker} title={part.title} subtitle={chapter.summary}>
            {part.figures.length > 0 && <Figures figures={part.figures} />}
          </Head>
        </div>
      ),
    });
    if (review && chapter.unknown.length) blocks.push({ key: `${id}-revisar`, node: <Review unknown={chapter.unknown} /> });
    chapter.paragraphs.forEach((text, i) => {
      blocks.push({ key: `${id}-p${i}`, node: <Paragraph text={text} /> });
      if (i === 0 && part.bars.length) blocks.push({ key: `${id}-barras`, node: <Bars bars={part.bars} group={group} /> });
    });
    if (chapter.alerts.length) blocks.push({ key: `${id}-alertas`, node: <Callout title="Alertas" items={chapter.alerts} tone="alerta" /> });
    if (chapter.recommendations.length) blocks.push({ key: `${id}-rec`, node: <Callout title="Recomendaciones" items={chapter.recommendations} tone="idea" /> });
    if (part.sources.length) blocks.push({ key: `${id}-fuentes`, node: <Sources sources={part.sources} cited={citedIn(chapter)} cut={doc.cut} /> });
  }

  if (doc.closing) {
    const closing = doc.closing;
    blocks.push({ key: "cierre", node: <Head kicker="Cierre" title="Conclusiones y recomendaciones" subtitle={closing.summary} /> });
    if (review && closing.unknown.length) blocks.push({ key: "cierre-revisar", node: <Review unknown={closing.unknown} /> });
    closing.paragraphs.forEach((text, i) => blocks.push({ key: `cierre-p${i}`, node: <Paragraph text={text} /> }));
    if (closing.alerts.length) blocks.push({ key: "cierre-alertas", node: <Callout title="Lo que preocupa" items={closing.alerts} tone="alerta" /> });
    if (closing.recommendations.length) blocks.push({ key: "cierre-rec", node: <Callout title="Qué conviene decidir" items={closing.recommendations} tone="idea" /> });
  }
  return blocks;
}

/** La hoja de la ventana: la portada breve y todos los bloques seguidos. */
export function ReportPaper({ doc, review = true }: { doc: ReportDoc; review?: boolean }) {
  return (
    <article className="bol-doc imp-rep-paper" style={PAPER_STYLE} aria-label={doc.title}>
      <header className="imp-rep-paper__cover">
        <img src="/logo-udes.svg" alt="Universidad de Santander UDES" />
        <p className="bol-analysis__kicker">Oficina de Planeación Institucional · Indicadores de Impacto</p>
        <h1>{doc.title}</h1>
        <p>{doc.subtitle}</p>
      </header>
      {reportBlocks(doc, review).map((b) => (
        <div key={b.key} className="imp-rep-paper__block">
          {b.node}
        </div>
      ))}
    </article>
  );
}
