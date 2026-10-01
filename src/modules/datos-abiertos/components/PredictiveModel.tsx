/* =============================================================================
   Modelo predictivo del rendimiento académico.

   El resultado de una regresión logística, para leerlo sin saber estadística
   y para explorarlo:
   · Un perfil que se arma: cada variable del modelo es un carril; la
     probabilidad del perfil voltea en paletas y una cascada muestra cuánto
     empuja cada factor desde el punto de partida (el perfil de referencia).
   · Los factores: razones de probabilidades con su intervalo del 95 % en
     escala logarítmica. Lleno si es significativo al 5 %, hueco si no;
     pasar por una fila la dice en palabras.
   · La calidad: tabla de clasificación y bondad de ajuste.
   · La muestra: de quiénes sale el modelo.

   Una probabilidad del modelo es la de un perfil en las cohortes estudiadas,
   no el pronóstico de una persona: se dice junto a la cifra.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  classificationOf,
  extremeProfile,
  fmtB,
  fmtOr,
  fmtP,
  fmtPct,
  fmtPctRound,
  predict,
  readOr,
  readReference,
  referenceProfile,
  significant,
  termRows,
} from "../data/model";
import type { Profile } from "../data/model";
import type { ModelData, ModelVariable } from "../data/types";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import type { CsvSource } from "./CsvAction";
import { useInView, useWidth } from "./motion";
import { SplitFlap } from "./SplitFlap";
import "./predictive-model.css";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const count = (n: number) => integer.format(n);
const three = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function PredictiveModel({ model, anchor, title, csv }: { model: ModelData; anchor: string; title?: string; csv?: CsvSource }) {
  const spec = model.spec;
  const [profile, setProfile] = useState<Profile>(() => referenceProfile(spec));
  const quality = classificationOf(spec);

  return (
    <section className="od-section od-model" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head">
          <h2 id={anchor}>{title || model.title}</h2>
          <p>{spec.question}</p>
        </header>

        <ul className="od-model__facts" aria-label="Ficha del modelo">
          <li>
            <b>{count(spec.sample.n)}</b> estudiantes
          </li>
          <li>
            <b>{spec.sample.cohorts}</b> cohortes
          </li>
          <li>
            <b>{fmtPct(quality.overall)}</b> bien clasificados
          </li>
          <li>
            <b>{three.format(spec.fit.nagelkerke)}</b> R² de Nagelkerke
          </li>
          <li className="od-model__method">{spec.method}</li>
        </ul>

        <Simulator model={model} profile={profile} setProfile={setProfile} />

        <div className="od-model__grid">
          <Forest model={model} csv={csv} />
          {/* El modelo es un solo archivo: la acción «CSV» va una vez, en el primer marco. */}
          <Quality model={model} />
          <Sample model={model} />
        </div>

        {model.note && <p className="od-model__note">{model.note}</p>}
      </div>
    </section>
  );
}

/* --- Simulador ---------------------------------------------------------------------- */

function Simulator({ model, profile, setProfile }: { model: ModelData; profile: Profile; setProfile: (p: Profile) => void }) {
  const spec = model.spec;
  const result = useMemo(() => predict(spec, profile), [spec, profile]);
  const base = predict(spec, referenceProfile(spec)).probability;
  const pct = result.probability * 100;
  const key = Object.values(profile).join("");
  const maxAbs = Math.max(0.5, ...spec.variables.flatMap((v) => v.levels.map((l) => Math.abs(l.term.b))), Math.abs(spec.intercept.b));

  const presets: { label: string; profile: Profile }[] = [
    { label: "Perfil de referencia", profile: referenceProfile(spec) },
    { label: "El más probable", profile: extremeProfile(spec, true) },
    { label: "El menos probable", profile: extremeProfile(spec, false) },
  ];
  const same = (a: Profile, b: Profile) => spec.variables.every((v) => (a[v.key] ?? -1) === (b[v.key] ?? -1));

  return (
    <div className="od-model__sim">
      <div className="od-model__controls">
        <p className="od-model__controls-head">Arma un perfil al ingresar</p>
        {spec.variables.map((v) => (
          <div key={v.key} className="od-model__rail" role="radiogroup" aria-label={v.label}>
            <span className="od-model__rail-label">{v.label}</span>
            <span className="od-model__rail-track">
              {[{ label: v.reference, i: -1 }, ...v.levels.map((l, i) => ({ label: l.label, i }))].map((o) => (
                <button
                  key={o.i}
                  type="button"
                  role="radio"
                  aria-checked={(profile[v.key] ?? -1) === o.i}
                  className="od-model__stop"
                  onClick={() => setProfile({ ...profile, [v.key]: o.i })}
                >
                  {o.label}
                </button>
              ))}
            </span>
          </div>
        ))}
        <div className="od-model__presets" role="group" aria-label="Perfiles de ejemplo">
          {presets.map((p) => (
            <button key={p.label} type="button" className="od-model__preset" aria-pressed={same(profile, p.profile)} onClick={() => setProfile(p.profile)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="od-model__result" aria-live="polite">
        <p className="od-model__result-label">Probabilidad estimada de {spec.response.label.toLowerCase()} de {spec.response.positive}</p>
        <div className="od-model__result-figure">
          <SplitFlap value={fmtPctRound(pct).replace(" ", "")} size="xl" numeric key={key} label={`${fmtPctRound(pct)}`} />
        </div>
        <div className="od-model__gauge" aria-hidden="true">
          <span className="od-model__gauge-fill" style={{ "--p": `${pct}%` } as CSSProperties} />
          <span className="od-model__gauge-cut" style={{ "--p": `${spec.fit.cutoff * 100}%` } as CSSProperties}>
            <em>corte {fmtPctRound(spec.fit.cutoff * 100)}</em>
          </span>
          <span className="od-model__gauge-base" style={{ "--p": `${base * 100}%` } as CSSProperties} title="Perfil de referencia" />
        </div>
        <p className="od-model__verdict">
          El modelo lo clasificaría con{" "}
          <b>{result.probability >= spec.fit.cutoff ? `promedio de ${spec.response.positive}` : `promedio de ${spec.response.negative}`}</b>
          {" "}· perfil de referencia: {fmtPctRound(base * 100)}
        </p>

        <ol className="od-model__cascade" aria-label="Lo que aporta cada factor, en escala logit">
          <li className="od-model__step" data-kind="base">
            <span className="od-model__step-label">Punto de partida</span>
            <span className="od-model__step-bar">
              <i style={{ "--w": `${(Math.abs(spec.intercept.b) / maxAbs) * 50}%` } as CSSProperties} data-neg={spec.intercept.b < 0 || undefined} />
            </span>
            <span className="od-model__step-value">{fmtB(spec.intercept.b)}</span>
          </li>
          {result.parts.map((p) => (
            <li key={p.variable.key} className="od-model__step" data-ref={p.reference || undefined}>
              <span className="od-model__step-label">
                {p.variable.label} <em>{p.label}</em>
              </span>
              <span className="od-model__step-bar">
                <i style={{ "--w": `${(Math.abs(p.b) / maxAbs) * 50}%` } as CSSProperties} data-neg={p.b < 0 || undefined} />
              </span>
              <span className="od-model__step-value">{p.reference ? "0" : fmtB(p.b)}</span>
            </li>
          ))}
          <li className="od-model__step" data-kind="sum">
            <span className="od-model__step-label">Suma (log-odds)</span>
            <span className="od-model__step-bar">
              <i style={{ "--w": `${Math.min(50, (Math.abs(result.logit) / maxAbs) * 50)}%` } as CSSProperties} data-neg={result.logit < 0 || undefined} />
            </span>
            <span className="od-model__step-value">{fmtB(result.logit)}</span>
          </li>
        </ol>
        <p className="od-model__caveat">
          Es la probabilidad de un perfil en las cohortes {spec.sample.cohorts}, no el pronóstico de una persona. A la izquierda
          del centro, el factor resta; a la derecha, suma.
        </p>
      </div>
    </div>
  );
}

/* --- Factores (bosque) -------------------------------------------------------------- */

const TICKS = [0.1, 0.25, 0.5, 1, 2, 4, 8];

function Forest({ model, csv }: { model: ModelData; csv?: CsvSource }) {
  const spec = model.spec;
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 720);
  const seen = useInView(box);
  const [order, setOrder] = useState<"modelo" | "efecto">("modelo");
  const [focus, setFocus] = useState<{ v: ModelVariable; i: number } | null>(null);

  // Cada variable muestra su referencia (Exp(B) = 1) y luego sus niveles.
  const rows = useMemo(() => {
    const list = termRows(spec);
    return order === "modelo" ? list : [...list].sort((a, b) => (b.term?.or ?? 1) - (a.term?.or ?? 1));
  }, [spec, order]);

  const narrow = width < 620;
  // Rótulo en dos líneas (variable arriba, nivel abajo): así ninguno se sale
  // del recuadro, por largo que sea.
  const labelW = narrow ? 0 : Math.min(210, Math.max(150, width * 0.26));
  const valueW = narrow ? 0 : 118;
  const rowH = narrow ? 46 : 36;
  const top = 26;
  const lo = Math.log(0.05);
  const hi = Math.log(10);
  const plotX = labelW + 10;
  const plotW = Math.max(160, width - labelW - valueW - 20);
  const x = (v: number) => plotX + ((Math.log(Math.min(10, Math.max(0.05, v))) - lo) / (hi - lo)) * plotW;
  const height = top + rows.length * rowH + 30;
  const shown = focus ?? { v: rows.find((r) => r.term)!.v, i: rows.find((r) => r.term)!.i };

  return (
    <ChartFrame
      className="od-model__panel od-model__panel--forest"
      title="Factores asociados"
      subtitle="Razón de probabilidades (Exp(B)) con su intervalo del 95 % · escala logarítmica"
      source={model.source}
      exportName="modelo-factores"
      csv={csv}
      actions={
        <ViewSwitch
          label="Orden de los factores"
          value={order}
          onChange={setOrder}
          options={[
            { value: "modelo", label: "Por variable" },
            { value: "efecto", label: "Por efecto" },
          ]}
        />
      }
    >
      <p className="od-model__reading" aria-live="polite">
        <b>{shown.v.label}.</b>{" "}
        {shown.i < 0 ? readReference(spec, shown.v) : readOr(spec, shown.v, shown.v.levels[shown.i].label, shown.v.levels[shown.i].term)}
      </p>
      <div ref={box} className="od-model__forest" data-seen={seen || undefined} onMouseLeave={() => setFocus(null)}>
        <svg width={width} height={height} role="img" aria-label={rows.map((r) => `${r.v.label}, ${r.label}: ${r.term ? `${fmtOr(r.term.or)} (${fmtOr(r.term.lo)} a ${fmtOr(r.term.hi)})` : "referencia"}`).join("; ")}>
          <rect className="od-model__side" x={plotX} y={top - 6} width={x(1) - plotX} height={height - top - 18} />
          {TICKS.map((t) => (
            <g key={t} className="od-model__tick" data-one={t === 1 || undefined}>
              <line x1={x(t)} x2={x(t)} y1={top - 6} y2={height - 24} />
              <text x={x(t)} y={height - 8} textAnchor="middle">
                {String(t).replace(".", ",")}
              </text>
            </g>
          ))}
          <text className="od-model__dir" x={x(1) - 8} y={top - 12} textAnchor="end">
            ← menos posibilidades
          </text>
          <text className="od-model__dir" x={x(1) + 8} y={top - 12}>
            más posibilidades →
          </text>
          {rows.map((r, k) => {
            const y = top + k * rowH + (narrow ? 30 : rowH / 2);
            const t = r.term;
            const sig = t ? significant(t, spec.fit.significance) : false;
            const on = focus?.v === r.v && focus?.i === r.i;
            return (
              <g
                key={`${r.v.key}-${r.i}`}
                className="od-model__row"
                data-ref={!t || undefined}
                data-sig={sig || undefined}
                data-up={(t?.or ?? 1) >= 1 || undefined}
                data-on={on || undefined}
                tabIndex={0}
                style={{ "--k": k } as CSSProperties}
                onMouseEnter={() => setFocus({ v: r.v, i: r.i })}
                onFocus={() => setFocus({ v: r.v, i: r.i })}
              >
                <rect className="od-model__hit" x={0} y={y - rowH / 2 - (narrow ? 12 : 0)} width={width} height={rowH} />
                <text className="od-model__label" x={narrow ? 0 : labelW} y={narrow ? y - 22 : y - 3} textAnchor={narrow ? "start" : "end"}>
                  <tspan className="od-model__label-var">{r.v.label}</tspan>
                  <tspan x={narrow ? 0 : labelW} dy={13}>
                    {r.label}
                  </tspan>
                </text>
                {t ? (
                  <>
                    <line className="od-model__ci" x1={x(t.lo)} x2={x(t.hi)} y1={y} y2={y} />
                    <line className="od-model__cap" x1={x(t.lo)} x2={x(t.lo)} y1={y - 4} y2={y + 4} />
                    <line className="od-model__cap" x1={x(t.hi)} x2={x(t.hi)} y1={y - 4} y2={y + 4} />
                    <rect className="od-model__mark" x={x(t.or) - 5.5} y={y - 5.5} width={11} height={11} rx={2} />
                  </>
                ) : (
                  <path className="od-model__refmark" d={`M${x(1)} ${y - 6} L${x(1) + 6} ${y} L${x(1)} ${y + 6} L${x(1) - 6} ${y}Z`} />
                )}
                {!narrow && (
                  <text className="od-model__value" x={width - 4} y={y + 4} textAnchor="end">
                    {t ? (
                      <>
                        {fmtOr(t.or)} <tspan>({fmtOr(t.lo)}–{fmtOr(t.hi)})</tspan>
                      </>
                    ) : (
                      <tspan>referencia · 1,00</tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="od-model__legend">
        <span data-kind="sig">Significativo al 5 %</span>
        <span data-kind="ns">No significativo</span>
        <span data-kind="ref">Referencia: la categoría con la que se comparan las demás de su variable (Exp(B) = 1)</span>
      </p>
    </ChartFrame>
  );
}

/* --- Calidad ------------------------------------------------------------------------ */

function Quality({ model }: { model: ModelData }) {
  const spec = model.spec;
  const q = classificationOf(spec);
  const c = spec.classification;
  const cells = [
    { obs: spec.response.negative, pred: spec.response.negative, n: c.negative.negative, ok: true, row: q.negTotal },
    { obs: spec.response.negative, pred: spec.response.positive, n: c.negative.positive, ok: false, row: q.negTotal },
    { obs: spec.response.positive, pred: spec.response.negative, n: c.positive.negative, ok: false, row: q.posTotal },
    { obs: spec.response.positive, pred: spec.response.positive, n: c.positive.positive, ok: true, row: q.posTotal },
  ];
  return (
    <ChartFrame
      className="od-model__panel od-model__panel--quality"
      title="¿Qué tan bien clasifica?"
      subtitle={`Tabla de clasificación · punto de corte ${fmtPctRound(spec.fit.cutoff * 100)}`}
      source={model.source}
      exportName="modelo-calidad"
    >
      <div className="od-model__howto">
        <p>
          <b>Cómo leer esta tabla.</b> Con lo que se sabe de cada estudiante al ingresar, el modelo intenta adivinar si
          terminará el primer semestre con promedio de {spec.response.positive}. Cada fila es lo que <em>de verdad</em> pasó;
          cada columna, lo que el modelo <em>pronosticó</em>. Las casillas marcadas ✓ son aciertos; las ✗, errores.
        </p>
        <ul>
          <li>
            De los <b>{count(q.negTotal)}</b> estudiantes que terminaron con {spec.response.negative}, el modelo acertó con{" "}
            <b>{count(c.negative.negative)}</b>: {fmtPctRound(q.negCorrect)} de cada 100.
          </li>
          <li>
            De los <b>{count(q.posTotal)}</b> que terminaron con {spec.response.positive}, acertó con <b>{count(c.positive.positive)}</b>:{" "}
            {fmtPctRound(q.posCorrect)} de cada 100.
          </li>
          <li>
            En total acierta en <b>{count(c.negative.negative + c.positive.positive)}</b> de {count(q.total)} casos: cerca de{" "}
            {Math.round(q.overall / 10)} de cada 10.
          </li>
        </ul>
      </div>
      <div className="od-model__matrix" role="table" aria-label="Observado frente a pronosticado">
        <span className="od-model__matrix-corner" role="columnheader">
          Observado ↓ · Pronosticado →
        </span>
        <span className="od-model__matrix-head" role="columnheader">
          {spec.response.negative}
        </span>
        <span className="od-model__matrix-head" role="columnheader">
          {spec.response.positive}
        </span>
        {[0, 1].map((r) => (
          <div key={r} className="od-model__matrix-row" role="row">
            <span className="od-model__matrix-head" role="rowheader">
              {r === 0 ? spec.response.negative : spec.response.positive}
            </span>
            {cells.slice(r * 2, r * 2 + 2).map((cell) => (
              <span key={cell.pred} className="od-model__cell" role="cell" data-ok={cell.ok || undefined} style={{ "--share": cell.n / cell.row } as CSSProperties}>
                <span className="od-model__cell-tag">{cell.ok ? "✓ Acierto" : "✗ Error"}</span>
                <b>{count(cell.n)}</b>
                <em>{fmtPctRound((cell.n / cell.row) * 100)} de los que de verdad terminaron con {cell.obs}</em>
              </span>
            ))}
          </div>
        ))}
      </div>
      <dl className="od-model__fit">
        <div>
          <dt>Bien clasificados</dt>
          <dd>
            <b>{fmtPct(q.overall)}</b> · {fmtPct(q.negCorrect)} de los de {spec.response.negative} y {fmtPct(q.posCorrect)} de los de {spec.response.positive}
          </dd>
        </div>
        <div>
          <dt>R² de Nagelkerke</dt>
          <dd>
            <b>{three.format(spec.fit.nagelkerke)}</b> · los factores del modelo explican cerca de {fmtPctRound(spec.fit.nagelkerke * 100)} de lo que hace
            variar el promedio; el resto depende de cosas que el modelo no mide.
          </dd>
        </div>
        <div>
          <dt>Hosmer y Lemeshow</dt>
          <dd>
            <b>p = {fmtP(spec.fit.hosmerLemeshowSig)}</b> · compara lo que el modelo espera con lo que pasó.{" "}
            {spec.fit.hosmerLemeshowSig > 0.05 ? "Como p es mayor que 0,05, coinciden razonablemente: el modelo se ajusta a los datos." : "Como p no supera 0,05, el ajuste es dudoso."}
          </dd>
        </div>
        <div>
          <dt>Otros</dt>
          <dd>
            −2 log de verosimilitud {spec.fit.m2ll.toLocaleString("es-CO")} · R² de Cox y Snell {three.format(spec.fit.coxSnell)}
          </dd>
        </div>
      </dl>
    </ChartFrame>
  );
}

/* --- Muestra ------------------------------------------------------------------------ */


function Sample({ model }: { model: ModelData }) {
  const spec = model.spec;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <ChartFrame
      className="od-model__panel od-model__panel--sample"
      title="De quiénes sale el modelo"
      subtitle={`${count(spec.sample.n)} estudiantes · cohortes ${spec.sample.cohorts} · ${spec.sample.source}`}
      source={model.source}
      exportName="modelo-muestra"
    >
      <p className="od-model__population">{spec.sample.population}</p>
      <div ref={ref} className="od-model__sample" data-seen={seen || undefined}>
        {spec.composition.map((group) => {
          const total = group.items.reduce((s, [, n]) => s + n, 0);
          return (
            <div key={group.label} className="od-model__comp" role="img" aria-label={`${group.label}: ${group.items.map(([l, n]) => `${l} ${count(n)}`).join(", ")}`}>
              <span className="od-model__comp-label">{group.label}</span>
              <span className="od-model__comp-bar">
                {group.items.map(([label, n], k) => (
                  <span key={label} style={{ "--w": `${(n / total) * 100}%`, "--tone": `var(--od-inst-${(k % 6) + 1})`, "--k": k } as CSSProperties} title={`${label}: ${count(n)}`} />
                ))}
              </span>
              <span className="od-model__comp-legend">
                {group.items.map(([label, n], k) => (
                  <span key={label} style={{ "--tone": `var(--od-inst-${(k % 6) + 1})` } as CSSProperties}>
                    {label} <b>{fmtPctRound((n / total) * 100)}</b> <em>· {count(n)}</em>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
