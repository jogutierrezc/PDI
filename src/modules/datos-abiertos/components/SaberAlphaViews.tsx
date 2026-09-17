/* =============================================================================
   Motor Alpha: el plano de valor agregado.

   Segunda lectura del mismo conjunto Saber 11 → Saber TyT. El Motor Beta
   compara posiciones; este estima lo que se esperaba de cada estudiante con
   una regresión sobre sus resultados del Saber 11 y mide la distancia con lo
   que de verdad obtuvo.

   El modelo es de una investigación publicada y la ficha la cita con nombres,
   revista y licencia: León, Tobar Sánchez, González Calderón y Suárez Arias,
   Innovaciencia 2025; 13(1): e4589.

   Cuatro vistas:
   · Plano: esperado en el eje horizontal, real en el vertical, con la diagonal
     de igualdad. Por encima, la universidad aportó más de lo previsto.
   · Cuadrantes: los cuatro cuadrantes del artículo frente a los promedios
     nacionales de las dos pruebas.
   · Modelo: qué pesa cada competencia del Saber 11 en la predicción y cuánto
     explica el ajuste.
   · Valor agregado: la diferencia media por programa, en puntos de la prueba.
   ========================================================================== */

import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  ALPHA_CITATION,
  ALPHA_FIT_LABEL,
  ALPHA_PREDICTORS,
  QUADRANT_LABEL,
  fitPredictors,
  planePoints,
} from "../data/saber-alpha";
import type { AlphaFit, AlphaModel, AlphaPredictor } from "../data/saber-alpha";
import { tytFigure, tytInfo, tytPrograms } from "../data/saber-tyt";
import type { SaberTytData, TytCompetency, TytFigure } from "../data/saber-tyt";
import { ChartTooltip } from "./ChartFrame";
import { useChartTokens } from "./free/chart-tokens";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${decimal.format(Math.abs(n))}`;
const pct = (n: number) => `${integer.format(Math.round(n))} %`;

/** Con menos evaluados que esto, el promedio de un programa no se compara. */
const FEW = 10;

/** El ajuste con el que se calcularon las cifras por programa. */
export const STORED_FIT: AlphaFit = "ampliado";

export const alphaModelOf = (data: SaberTytData, competency: TytCompetency, fit: AlphaFit = STORED_FIT) =>
  data.alpha?.modelos?.[competency]?.[fit];

/* --- Plano de valor agregado --------------------------------------------------------- */

export function AlphaPlane({
  data,
  competency,
  year,
  figure,
  program,
}: {
  data: SaberTytData;
  competency: TytCompetency;
  year: number | null;
  figure: TytFigure;
  program: string;
}) {
  const t = useChartTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const width = Math.max(320, useWidth(wrap, 720));
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const armed = seen || reduced;
  const [mode, setMode] = useState<"programas" | "nube">("programas");
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  const cloud = planePoints(figure.alpha.plane);
  const programs = tytPrograms(data)
    .map((p) => {
      const at = tytFigure(data, competency, year, { program: p.name });
      return at && at.alpha.alphaN && at.alpha.alphaExpected !== null && at.alpha.alphaActual !== null
        ? { name: p.name, expected: at.alpha.alphaExpected, actual: at.alpha.alphaActual, n: at.alpha.alphaN }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const points = mode === "nube" ? cloud.map((p) => ({ x: p.expected + 2.5, y: p.actual + 2.5, n: p.count, name: "" })) : programs.map((p) => ({ x: p.expected, y: p.actual, n: p.n, name: p.name }));
  if (!points.length) return <p className="od-tyt__empty">Sin evaluados con las dos pruebas completas en este corte.</p>;

  const all = [...points.map((p) => p.x), ...points.map((p) => p.y)];
  const lo = Math.max(0, Math.floor((Math.min(...all) - 10) / 10) * 10);
  const hi = Math.ceil((Math.max(...all) + 10) / 10) * 10;
  const size = Math.min(width, 620);
  const M = { top: 16, right: 16, bottom: 46, left: 54 };
  const plot = size - M.left - M.right;
  const at = (v: number) => ((v - lo) / (hi - lo)) * plot;
  const x = (v: number) => M.left + at(v);
  const y = (v: number) => M.top + plot - at(v);
  const height = M.top + plot + M.bottom;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) / 4) * i);
  const maxN = Math.max(1, ...points.map((p) => p.n));
  const show = (event: MouseEvent<SVGElement>, title: string, lines: string[]) => {
    const host = wrap.current?.getBoundingClientRect();
    const box = (event.currentTarget as SVGGraphicsElement).getBoundingClientRect();
    if (host) setTip({ x: box.left - host.left + box.width / 2, y: box.top - host.top, title, lines });
  };

  return (
    <div className="od-tyt__scatter" ref={wrap}>
      <div className="od-tyt__scatter-head">
        <span className="od-switch" role="group" aria-label="Qué se dibuja">
          {(["programas", "nube"] as const).map((value) => (
            <button key={value} type="button" className="od-switch__option" aria-pressed={mode === value} onClick={() => setMode(value)}>
              {value === "programas" ? "Por programa" : "Nube de evaluados"}
            </button>
          ))}
        </span>
        <ul className="od-tyt__legend" aria-label="Leyenda">
          <li>
            <i style={{ background: t.pos }} aria-hidden="true" /> Por encima de lo esperado
          </li>
          <li>
            <i style={{ background: t.neg }} aria-hidden="true" /> Por debajo
          </li>
        </ul>
      </div>
      <div className="od-tyt__canvas" data-armed={armed || undefined}>
        <svg width={size} height={height} role="img" aria-label="Plano de valor agregado: puntaje esperado frente al real">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={M.top} y2={M.top + plot} style={{ stroke: t.line }} />
              <line x1={M.left} x2={M.left + plot} y1={y(v)} y2={y(v)} style={{ stroke: t.line }} />
              <text x={x(v)} y={M.top + plot + 18} textAnchor="middle" className="od-tyt__tick">
                {integer.format(Math.round(v))}
              </text>
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="od-tyt__tick">
                {integer.format(Math.round(v))}
              </text>
            </g>
          ))}
          <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} className="od-tyt__diagonal" style={{ stroke: t.ink }} />
          {points.map((p, i) => (
            <circle
              key={`${p.name}-${p.x}-${p.y}`}
              cx={x(p.x)}
              cy={y(p.y)}
              r={(mode === "nube" ? 3 : 5) + (p.n / maxN) * (mode === "nube" ? 11 : 10)}
              className="od-tyt__dot od-tyt__dot--pop"
              data-few={(mode === "programas" && p.n < FEW) || undefined}
              style={{ fill: p.y > p.x ? t.pos : t.neg, animationDelay: `${Math.min(600, i * 22)}ms` }}
              onMouseEnter={(e) =>
                show(e, p.name || `Esperado ${integer.format(Math.round(p.x))} · real ${integer.format(Math.round(p.y))}`, [
                  `Esperado ${decimal.format(p.x)} puntos`,
                  `Real ${decimal.format(p.y)} puntos`,
                  `Valor agregado ${signed(p.y - p.x)}`,
                  `${integer.format(p.n)} ${p.n === 1 ? "evaluado" : "evaluados"}${mode === "programas" && p.n < FEW ? " · pocos para comparar" : ""}`,
                ])
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}
          <text x={M.left + plot / 2} y={height - 6} textAnchor="middle" className="od-tyt__axis">
            Puntaje esperado según el Saber 11
          </text>
          <text transform={`rotate(-90 12 ${M.top + plot / 2})`} x={12} y={M.top + plot / 2} textAnchor="middle" className="od-tyt__axis">
            Puntaje real en el Saber TyT
          </text>
        </svg>
        {tip && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <strong>{tip.title}</strong>
            {tip.lines.map((line) => (
              <em key={line}>{line}</em>
            ))}
          </ChartTooltip>
        )}
      </div>
      <p className="od-tyt__note">
        {mode === "programas"
          ? `Cada punto es un programa${program ? "; el filtro de programa no cambia esta vista" : ""}: su tamaño, cuántos evaluados lo sostienen. Sobre la diagonal, el resultado superó lo que el modelo esperaba.`
          : "Cada burbuja reúne a los evaluados de una celda de 5 puntos: la nube muestra la forma, nunca a una persona."}
      </p>
    </div>
  );
}

/* --- Cuadrantes frente al país ------------------------------------------------------- */

export function AlphaQuadrants({ data, competency, figure }: { data: SaberTytData; competency: TytCompetency; figure: TytFigure }) {
  const t = useChartTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const armed = seen || reduced;
  const info = tytInfo(competency);
  const counts = figure.alpha.quadrants;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <p className="od-tyt__empty">Sin promedios nacionales de referencia para {info.label.toLowerCase()}.</p>;
  const entryMean = data.alpha.nacional.saber11[competency === "rc" ? "m" : competency === "cc" ? "sc" : competency === "lc" ? "lc" : competency === "ing" ? "ing" : "global"];
  const exitMean = data.alpha.nacional.tyt[competency];
  const tone: Record<string, string> = { "1": t.pos, "2": t.posSoft, "3": t.neg, "4": t.negSoft };
  const order = ["2", "1", "3", "4"];

  return (
    <div className="od-tyt__quadrants" ref={wrap} data-armed={armed || undefined}>
      <div className="od-tyt__quad-grid">
        {order.map((q, i) => {
          const share = ((counts[q] ?? 0) / total) * 100;
          return (
            <div key={q} className="od-tyt__quad" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="od-tyt__quad-bar" style={{ background: tone[q], height: `${Math.max(4, share)}%` }} aria-hidden="true" />
              <strong>{pct(share)}</strong>
              <span>{QUADRANT_LABEL[q]}</span>
              <small>{integer.format(counts[q] ?? 0)} evaluados</small>
            </div>
          );
        })}
      </div>
      <p className="od-tyt__note">
        Cuadrantes del artículo, frente a los promedios nacionales: {entryMean !== undefined ? `${integer.format(entryMean)} en el Saber 11` : "sin referencia de entrada"} y{" "}
        {exitMean !== undefined ? `${integer.format(exitMean)} en el Saber TyT` : "sin referencia de salida"}. Quien está en «sobre el país solo al salir» entró por debajo del
        promedio nacional y salió por encima.
      </p>
    </div>
  );
}

/* --- El modelo: qué pesa cada competencia -------------------------------------------- */

export function AlphaCoefficients({ data, competency }: { data: SaberTytData; competency: TytCompetency }) {
  const t = useChartTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const armed = seen || reduced;
  const info = tytInfo(competency);
  const fits: AlphaFit[] = ["completo", "ampliado"];
  const models = fits.map((fit) => ({ fit, model: alphaModelOf(data, competency, fit) })).filter((m): m is { fit: AlphaFit; model: AlphaModel } => Boolean(m.model));
  if (!models.length) return <p className="od-tyt__empty">Sin modelo ajustado para {info.label.toLowerCase()}.</p>;
  const max = Math.max(0.1, ...models.flatMap((m) => ALPHA_PREDICTORS.map((p) => Math.abs(m.model.coef[p.key] ?? 0))));

  return (
    <div className="od-tyt__models" ref={wrap} data-armed={armed || undefined}>
      {models.map(({ fit, model }) => (
        <article key={fit} className="od-tyt__model" data-stored={fit === STORED_FIT || undefined}>
          <header>
            <h4>{ALPHA_FIT_LABEL[fit]}</h4>
            <dl>
              <div>
                <dt>Explica</dt>
                <dd>{pct(model.r2 * 100)}</dd>
              </div>
              <div>
                <dt>Estudiantes</dt>
                <dd>{integer.format(model.n)}</dd>
              </div>
              <div>
                <dt>Error típico</dt>
                <dd>{decimal.format(model.rmse)}</dd>
              </div>
            </dl>
          </header>
          <ol className="od-tyt__coefs">
            {ALPHA_PREDICTORS.filter((p) => fitPredictors(fit).includes(p.key as AlphaPredictor)).map((p, i) => {
              const beta = model.coef[p.key] ?? 0;
              const half = (Math.abs(beta) / max) * 50;
              return (
                <li key={p.key}>
                  <span className="od-tyt__coef-name">{p.label}</span>
                  <span className="od-tyt__value-track">
                    <span
                      className="od-tyt__value-bar od-tyt__value-bar--grow"
                      data-neg={beta < 0 || undefined}
                      style={{
                        left: beta >= 0 ? "50%" : `${50 - half}%`,
                        width: `${half}%`,
                        background: beta >= 0 ? t.pos : t.neg,
                        animationDelay: `${i * 70}ms`,
                      }}
                    />
                  </span>
                  <span className="od-tyt__coef-value">{signed(beta)}</span>
                </li>
              );
            })}
          </ol>
          <p className="od-tyt__note">
            Por cada punto más en {ALPHA_PREDICTORS.find((p) => Math.abs(model.coef[p.key] ?? 0) === Math.max(...fitPredictors(fit).map((k) => Math.abs(model.coef[k] ?? 0))))?.label.toLowerCase()}, el
            modelo espera {decimal.format(Math.max(...fitPredictors(fit).map((k) => Math.abs(model.coef[k] ?? 0))))} puntos más en {info.exit.toLowerCase()}, con lo demás igual.
          </p>
        </article>
      ))}
      <p className="od-tyt__note">
        Las cifras por programa de las otras vistas usan el ajuste <strong>{ALPHA_FIT_LABEL[STORED_FIT].toLowerCase()}</strong>, porque cubre a más estudiantes; el del artículo
        se muestra al lado para comparar.
      </p>
    </div>
  );
}

/* --- Valor agregado por programa, en puntos de la prueba ------------------------------ */

export function AlphaValueBars({ data, competency, year }: { data: SaberTytData; competency: TytCompetency; year: number | null }) {
  const t = useChartTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const armed = seen || reduced;
  const rows = tytPrograms(data)
    .map((p) => {
      const at = tytFigure(data, competency, year, { program: p.name });
      return at && at.alpha.alphaVa !== null && at.alpha.alphaN
        ? { name: p.name, va: at.alpha.alphaVa, n: at.alpha.alphaN, positive: at.alpha.alphaPositive ?? 0 }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.va - a.va);
  if (!rows.length) return <p className="od-tyt__empty">Sin programas con las dos pruebas completas en este corte.</p>;
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.va)));

  return (
    <div className="od-tyt__value" ref={wrap} data-armed={armed || undefined}>
      <ol className="od-tyt__value-rows">
        {rows.map((row, i) => {
          const half = (Math.abs(row.va) / max) * 50;
          return (
            <li key={row.name} data-few={row.n < FEW || undefined}>
              <span className="od-tyt__value-name">{row.name}</span>
              <span className="od-tyt__value-track">
                <span
                  className="od-tyt__value-bar od-tyt__value-bar--grow"
                  data-neg={row.va < 0 || undefined}
                  style={{
                    left: row.va >= 0 ? "50%" : `${50 - half}%`,
                    width: `${half}%`,
                    background: row.va >= 0 ? t.pos : t.neg,
                    animationDelay: `${Math.min(500, i * 45)}ms`,
                  }}
                />
              </span>
              <span className="od-tyt__value-figure">
                <strong>{signed(row.va)}</strong>
                <small>
                  {integer.format(row.n)} eval. · {pct((row.positive / row.n) * 100)} sobre lo esperado
                </small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="od-tyt__note">
        Puntos de la prueba de salida por encima o por debajo de lo que el modelo esperaba. En tinta tenue, los programas con menos de {FEW} evaluados con las dos pruebas
        completas.
      </p>
    </div>
  );
}

/* --- Cómo funciona, y de quién es --------------------------------------------------- */

export function AlphaMethod({ data, competency }: { data: SaberTytData; competency: TytCompetency }) {
  const model = alphaModelOf(data, competency);
  const info = tytInfo(competency);
  return (
    <section className="od-tyt__method" aria-labelledby="od-alpha-metodo">
      <h3 id="od-alpha-metodo">Cómo funciona el Motor Alpha</h3>
      <ol className="od-tyt__steps">
        <li>
          <figure className="od-tyt__step-figure">
            <AlphaDiagram step={1} />
          </figure>
          <h4>
            <span aria-hidden="true">1</span>
            Lo que se esperaba
          </h4>
          <p className="od-tyt__step-text">
            Una regresión lineal múltiple aprende, con los estudiantes que tienen las dos pruebas, cuánto pesa cada competencia del Saber 11 en el resultado del Saber TyT. Con
            esos pesos el modelo calcula, para cada estudiante, el puntaje que cabía esperar de él: su valor esperado.
          </p>
        </li>
        <li>
          <figure className="od-tyt__step-figure">
            <AlphaDiagram step={2} />
          </figure>
          <h4>
            <span aria-hidden="true">2</span>
            La distancia con lo real
          </h4>
          <p className="od-tyt__step-text">
            El valor agregado es la resta entre lo que obtuvo y lo que se esperaba, en puntos de la propia prueba. Positivo, la universidad aportó por encima de lo previsto;
            negativo, por debajo. A diferencia del Motor Beta, aquí la cuenta no está atada a la cohorte: un programa entero puede quedar por encima.
          </p>
        </li>
        <li>
          <figure className="od-tyt__step-figure">
            <AlphaDiagram step={3} />
          </figure>
          <h4>
            <span aria-hidden="true">3</span>
            El plano
          </h4>
          <p className="od-tyt__step-text">
            Cada punto se dibuja con lo esperado en el eje horizontal y lo real en el vertical. La diagonal marca la igualdad: por encima está el aporte de la universidad, por
            debajo lo que pide intervención académica.
          </p>
        </li>
        <li>
          <figure className="od-tyt__step-figure">
            <AlphaDiagram step={4} />
          </figure>
          <h4>
            <span aria-hidden="true">4</span>
            Los cuadrantes
          </h4>
          <p className="od-tyt__step-text">
            Con los promedios nacionales de las dos pruebas, cada estudiante cae en uno de cuatro cuadrantes. El más revelador es el de quienes entraron por debajo del promedio
            del país y salieron por encima: ahí se ve el efecto de la formación, no el punto de partida.
          </p>
        </li>
      </ol>
      <p className="od-tyt__caveat">
        <strong>Cuánto creerle.</strong> {model ? `Para ${info.label.toLowerCase()}, el ajuste explica el ${pct(model.r2 * 100)} de la variación con ${integer.format(model.n)} estudiantes y se equivoca en promedio ${decimal.format(model.rmse)} puntos.` : "Este ajuste aún no tiene modelo para esta competencia."}{" "}
        Cuanto más bajo ese porcentaje, más pesa lo que el Saber 11 no mide y menos se le puede pedir al valor esperado. Y, como en el Motor Beta, un programa con pocos
        estudiantes pareados puede moverse por una sola persona.
      </p>
      <p className="od-tyt__credit">
        <strong>El modelo no es nuestro.</strong> Es el de {ALPHA_CITATION.authors} en «{ALPHA_CITATION.title}», {ALPHA_CITATION.journal} ({ALPHA_CITATION.institution}),
        publicado con licencia {ALPHA_CITATION.license}. Aquí se aplica a los datos de la UDES tal como lo describen sus autores:{" "}
        <a href={ALPHA_CITATION.doi} target="_blank" rel="noreferrer noopener">
          {ALPHA_CITATION.doi}
        </a>
        .
      </p>
      {data.note && <p className="od-tyt__note">{data.note}</p>}
    </section>
  );
}

function AlphaDiagram({ step }: { step: 1 | 2 | 3 | 4 }) {
  if (step === 1) {
    return (
      <svg viewBox="0 0 200 118" role="img" aria-label="Las competencias del Saber 11 entran en una fórmula que estima el resultado esperado" className="od-tyt__diagram">
        {["Matemáticas", "Lectura crítica", "Ciencias nat.", "Sociales", "Inglés"].map((label, i) => (
          <g key={label}>
            <text x={0} y={14 + i * 17} className="od-tyt__diagram-chip">
              {label}
            </text>
            <path d={`M78 ${10 + i * 17} L104 56`} className="od-tyt__diagram-arrow" />
          </g>
        ))}
        <circle cx={116} cy={56} r={13} className="od-tyt__diagram-plot" />
        <text x={116} y={60} textAnchor="middle" className="od-tyt__diagram-value">
          β
        </text>
        <path d="M132 56 L158 56" className="od-tyt__diagram-arrow" markerEnd="url(#od-alpha-arrow)" />
        <text x={200} y={52} textAnchor="end" className="od-tyt__diagram-label">
          esperado
        </text>
        <text x={200} y={64} textAnchor="end" className="od-tyt__diagram-value">
          Ŷ
        </text>
        <defs>
          <marker id="od-alpha-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" className="od-tyt__diagram-arrowhead" />
          </marker>
        </defs>
      </svg>
    );
  }
  if (step === 2) {
    return (
      <svg viewBox="0 0 200 118" role="img" aria-label="El valor agregado es la diferencia entre el puntaje real y el esperado" className="od-tyt__diagram">
        <rect x={20} y={70} width={52} height={34} rx={2} className="od-tyt__diagram-bar" data-kind="esperado" />
        <text x={46} y={64} textAnchor="middle" className="od-tyt__diagram-label">
          esperado
        </text>
        <text x={46} y={92} textAnchor="middle" className="od-tyt__diagram-value">
          96
        </text>
        <rect x={110} y={44} width={52} height={60} rx={2} className="od-tyt__diagram-bar" data-kind="real" />
        <text x={136} y={38} textAnchor="middle" className="od-tyt__diagram-label">
          real
        </text>
        <text x={136} y={78} textAnchor="middle" className="od-tyt__diagram-value" data-on="dark">
          108
        </text>
        <path d="M168 44 L168 70" className="od-tyt__diagram-arrow" markerEnd="url(#od-alpha-arrow-2)" />
        <text x={176} y={60} className="od-tyt__diagram-gain">
          +12
        </text>
        <defs>
          <marker id="od-alpha-arrow-2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" className="od-tyt__diagram-arrowhead" data-kind="gain" />
          </marker>
        </defs>
      </svg>
    );
  }
  if (step === 3) {
    return (
      <svg viewBox="0 0 200 118" role="img" aria-label="El plano de valor agregado con su diagonal" className="od-tyt__diagram">
        <rect x={30} y={8} width={100} height={100} rx={3} className="od-tyt__diagram-plot" />
        <path d="M30 108 L130 8" className="od-tyt__diagram-diagonal" />
        <circle cx={66} cy={40} r={6} className="od-tyt__diagram-dot" data-kind="salida" />
        <circle cx={98} cy={88} r={6} className="od-tyt__diagram-dot" data-kind="baja" />
        <text x={138} y={42} className="od-tyt__diagram-value">
          aportó
        </text>
        <text x={138} y={92} className="od-tyt__diagram-value">
          quedó corto
        </text>
        <text x={80} y={117} textAnchor="middle" className="od-tyt__diagram-label">
          esperado
        </text>
        <text x={18} y={58} textAnchor="middle" transform="rotate(-90 18 58)" className="od-tyt__diagram-label">
          real
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 118" role="img" aria-label="Los cuatro cuadrantes frente a los promedios nacionales" className="od-tyt__diagram">
      <rect x={34} y={8} width={100} height={100} rx={3} className="od-tyt__diagram-plot" />
      <path d="M84 8 L84 108 M34 58 L134 58" className="od-tyt__diagram-link" />
      <text x={58} y={34} textAnchor="middle" className="od-tyt__diagram-quad" data-kind="2">
        2
      </text>
      <text x={110} y={34} textAnchor="middle" className="od-tyt__diagram-quad" data-kind="1">
        1
      </text>
      <text x={58} y={88} textAnchor="middle" className="od-tyt__diagram-quad" data-kind="3">
        3
      </text>
      <text x={110} y={88} textAnchor="middle" className="od-tyt__diagram-quad" data-kind="4">
        4
      </text>
      <text x={140} y={30} className="od-tyt__diagram-label">
        2 sube
      </text>
      <text x={140} y={44} className="od-tyt__diagram-label">
        1 alto
      </text>
      <text x={140} y={86} className="od-tyt__diagram-label">
        3 bajo
      </text>
      <text x={140} y={100} className="od-tyt__diagram-label">
        4 baja
      </text>
      <text x={84} y={117} textAnchor="middle" className="od-tyt__diagram-label">
        promedio nacional
      </text>
    </svg>
  );
}
