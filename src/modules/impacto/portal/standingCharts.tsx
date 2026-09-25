/* =============================================================================
   Portal de Impacto · las gráficas del cumplimiento.

   La barra de estados, la lista de indicadores con su avance, la cadena en
   números, las barras por programa o facultad, el mapa de calor, los puntos
   por programa y las cajas de reparto. CSS y SVG con los tokens del
   proyecto; cada estado lleva su signo y su palabra, nunca solo color.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, STAGES, STAGE_LABEL, formatFigure } from "../model";
import type { Measure, Stage, SubstantiveFunction } from "../model";
import { LAGGING_BELOW, STANDINGS, STANDING_GLYPH, STANDING_LABEL, metShare, standingOf, totalOf } from "./standing";
import type { Box, GridCell, IndicatorStanding, Spread, Standing, StandingCounts } from "./standing";

const pct = (n: number) => `${Math.round(n)} %`;
const figure = (value: number | null, measure: Measure) => (value === null ? "—" : formatFigure(Math.round(value * 100) / 100, measure));
/** Posición en una escala de 0 a `max` %, en %. */
const on = (value: number, max: number) => `${(Math.min(Math.max(value, 0), max) / max) * 100}%`;

export function StandingGlyph({ standing, size = "md" }: { standing: Standing; size?: "sm" | "md" }) {
  return (
    <span className="ist-glyph" data-standing={standing} data-size={size} aria-hidden="true">
      {STANDING_GLYPH[standing]}
    </span>
  );
}

export function StandingLegend({ counts }: { counts?: StandingCounts }) {
  return (
    <ul className="ist-legend">
      {STANDINGS.map((s) => (
        <li key={s}>
          <StandingGlyph standing={s} size="sm" />
          {counts && <strong>{counts[s]}</strong>}
          <span>{s === "rezagada" ? `${STANDING_LABEL[s]} (menos del ${LAGGING_BELOW} %)` : STANDING_LABEL[s]}</span>
        </li>
      ))}
    </ul>
  );
}

const describe = (c: StandingCounts) =>
  STANDINGS.filter((s) => c[s])
    .map((s) => `${c[s]} ${STANDING_LABEL[s].toLowerCase()}`)
    .join(", ");

/** La barra 100 %: un tramo por estado, con su signo y su cuenta. */
export function StandingBar({ counts, size = "md" }: { counts: StandingCounts; size?: "sm" | "md" | "lg" }) {
  const total = totalOf(counts);
  if (!total) return <div className="ist-bar" data-size={size} data-empty role="img" aria-label="Sin indicadores" />;
  return (
    <div className="ist-bar" data-size={size} role="img" aria-label={describe(counts)}>
      {STANDINGS.map((s) =>
        counts[s] ? (
          <span key={s} data-standing={s} style={{ flexGrow: counts[s] }}>
            {STANDING_GLYPH[s]}
            {size !== "sm" || counts[s] > 1 ? ` ${counts[s]}` : ""}
          </span>
        ) : null,
      )}
    </div>
  );
}

/* --- Un programa: indicador por indicador ------------------------------------------------ */

function Sparkline({ points, tone }: { points: { year: number; value: number }[]; tone: string }) {
  if (points.length < 2) return <span className="ist-muted">{points.length ? `solo ${points[0].year}` : "sin serie"}</span>;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = 80 / (points.length - 1);
  const xy = points.map((p, i) => [4 + i * step, hi === lo ? 15 : 26 - ((p.value - lo) / (hi - lo)) * 22]);
  const last = xy[xy.length - 1];
  return (
    <svg className="ist-spark" viewBox="0 0 88 30" role="img" aria-label={`Serie ${points.map((p) => `${p.year}: ${Math.round(p.value * 100) / 100}`).join(", ")}`} style={{ "--tone": tone } as CSSProperties}>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="3.5" />
    </svg>
  );
}

export function IndicatorStandingList({ rows }: { rows: IndicatorStanding[] }) {
  return (
    <div className="ist-list" role="table" aria-label="Cumplimiento por indicador">
      <div role="row" className="ist-list__head">
        <span role="columnheader">
          <span className="sr-only">Estado</span>
        </span>
        <span role="columnheader">Indicador</span>
        <span role="columnheader">Avance · la raya es la meta</span>
        <span role="columnheader">Cifra / meta 2026</span>
        <span role="columnheader" className="ist-num">
          Avance
        </span>
        <span role="columnheader">Serie</span>
      </div>
      {rows.map((r) => (
        <div role="row" key={r.indicator.id} className="ist-list__row" data-standing={r.standing}>
          <span role="cell">
            <StandingGlyph standing={r.standing} />
          </span>
          <span role="cell" className="ist-list__name">
            <strong>{r.indicator.name}</strong>
            <span>
              <b>{r.indicator.code}</b>
              <em style={{ "--tone": FUNCTION_TONE[r.indicator.fn] } as CSSProperties}>{FUNCTION_LABEL[r.indicator.fn]}</em>
              <span>{STAGE_LABEL[r.indicator.stage]}</span>
              <span className="ist-list__state">{STANDING_LABEL[r.standing]}</span>
              {r.indicator.direction === "baja" && <span>debe bajar</span>}
            </span>
          </span>
          <span role="cell" className="ist-bullet" aria-hidden="true">
            {r.pct !== null ? <span style={{ width: on(r.pct, 125) }} /> : <span data-hatch />}
            <i />
          </span>
          <span role="cell" className="ist-list__figure">
            <strong>{r.value === null ? "Sin cifra" : figure(r.value, r.indicator.measure)}</strong>
            <small>{r.target === null ? `meta ${r.indicator.target2026 || "sin número"}` : `meta ${figure(r.target, r.indicator.measure)}`}</small>
          </span>
          <span role="cell" className="ist-num ist-list__pct">
            {r.pct === null ? "—" : pct(r.pct)}
          </span>
          <span role="cell">
            <Sparkline points={r.trend} tone={FUNCTION_TONE[r.indicator.fn]} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Cuántos indicadores hay en cada función y eslabón; el eslabón vacío se marca. */
export function StageCountGrid({ counts, functions = FUNCTIONS }: { counts: Record<SubstantiveFunction, Record<Stage, number>>; functions?: SubstantiveFunction[] }) {
  return (
    <div className="ist-stages" role="table" aria-label="Indicadores por función y eslabón">
      <div role="row">
        <span role="columnheader" />
        {STAGES.map((s) => (
          <span role="columnheader" key={s}>
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
      {functions.map((f) => (
        <div role="row" key={f} style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
          <span role="rowheader">{FUNCTION_LABEL[f]}</span>
          {STAGES.map((s) => (
            <span role="cell" key={s}>
              {counts[f][s] ? <b>{counts[f][s]}</b> : <b data-empty>falta</b>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* --- Varios programas o facultades --------------------------------------------------------- */

export interface StackedRow {
  key: string;
  name: string;
  to?: string;
  detail: string;
  counts: StandingCounts;
  total?: boolean;
}

export function StandingRows({ rows, label, unit }: { rows: StackedRow[]; label: string; unit: string }) {
  return (
    <div className="ist-rows" role="table" aria-label={label}>
      <div role="row" className="ist-rows__head">
        <span role="columnheader">{unit}</span>
        <span role="columnheader" className="ist-num">
          Indicadores
        </span>
        <span role="columnheader">Estados</span>
        <span role="columnheader" className="ist-num">
          Cumplen
        </span>
      </div>
      {rows.map((r) => {
        const share = metShare(r.counts);
        return (
          <div role="row" key={r.key} className="ist-rows__row" data-total={r.total || undefined}>
            <span role="rowheader">{r.to ? <Link to={r.to}>{r.name}</Link> : <strong>{r.name}</strong>}</span>
            <span role="cell" className="ist-num">
              {r.detail}
            </span>
            <span role="cell">
              <StandingBar counts={r.counts} size="sm" />
            </span>
            <span role="cell" className="ist-num ist-rows__share" data-level={share === null ? undefined : share >= 40 ? "alto" : share >= 25 ? "medio" : "bajo"}>
              {share === null ? "—" : `${share} %`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --- Mapa de calor ------------------------------------------------------------------------ */

export function StandingHeatmap({
  caption,
  rows,
  cols,
  cells,
}: {
  caption: string;
  rows: { key: string; name: ReactNode }[];
  cols: { key: string; code: string; name: string; fn: SubstantiveFunction }[];
  cells: GridCell[][];
}) {
  return (
    <div className="ist-heat-wrap">
      <table className="ist-heat">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td />
            {cols.map((c) => (
              <th key={c.key} scope="col" style={{ "--tone": FUNCTION_TONE[c.fn] } as CSSProperties}>
                {c.code && <b>{c.code}</b>}
                <span>{c.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <th scope="row">{r.name}</th>
              {cells[i].map((cell, j) => {
                if (!cell.adopted) {
                  return (
                    <td key={cols[j].key} data-cell="none">
                      <span aria-hidden="true">·</span>
                      <span className="sr-only">No lo eligió</span>
                    </td>
                  );
                }
                const standing = standingOf(cell.pct, true);
                return (
                  <td key={cols[j].key} data-standing={standing}>
                    <span aria-hidden="true">{STANDING_GLYPH[standing]}</span> {cell.pct === null ? "sin cifra" : pct(cell.pct)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Qué tan parejos van: un punto por programa --------------------------------------------- */

const STRIP_MAX = 150;

export function DotStrips({ rows }: { rows: Spread[] }) {
  return (
    <div className="ist-strips">
      <div className="ist-strips__axis" aria-hidden="true">
        <span />
        <span className="ist-strips__scale">
          <i style={{ left: "0%" }}>0 %</i>
          <i style={{ left: on(50, STRIP_MAX) }}>50 %</i>
          <i style={{ left: on(100, STRIP_MAX) }}>meta</i>
          <i style={{ left: "100%" }}>{STRIP_MAX} %+</i>
        </span>
        <span className="ist-num">Mediana</span>
      </div>
      <ul>
        {rows.map((s) => (
          <li key={s.indicator.id}>
            <span className="ist-strips__name">
              <b style={{ "--tone": FUNCTION_TONE[s.indicator.fn] } as CSSProperties}>{s.indicator.code}</b>
              {s.indicator.name}
            </span>
            <span className="ist-strips__track" role="img" aria-label={`${s.indicator.name}: ${s.points.map((p) => `${p.name} ${pct(p.pct)}`).join(", ") || "sin cifras"}`}>
              <i className="ist-strips__goal" style={{ left: on(100, STRIP_MAX) }} />
              {s.box && <i className="ist-strips__median" style={{ left: on(s.box.median, STRIP_MAX) }} />}
              {s.points.map((p) => (
                <span key={p.programId} className="ist-dot" data-standing={p.standing} style={{ left: on(p.pct, STRIP_MAX) }} title={`${p.name} · ${pct(p.pct)}`} />
              ))}
            </span>
            <span className="ist-num ist-strips__med" data-standing={s.box ? standingOf(s.box.median, true) : "sin_cifra"}>
              {s.box ? pct(s.box.median) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- Vicerrectoría: la UDES y el reparto de sus programas ------------------------------------ */

const BOX_MAX = 160;

function BoxPlot({ box }: { box: Box }) {
  return (
    <>
      <i className="ist-box__whisker" style={{ left: on(box.min, BOX_MAX), right: `calc(100% - ${on(box.max, BOX_MAX)})` }} />
      <i className="ist-box__box" style={{ left: on(box.q1, BOX_MAX), right: `calc(100% - ${on(box.q3, BOX_MAX)})` }} />
      <i className="ist-box__median" style={{ left: on(box.median, BOX_MAX) }} />
    </>
  );
}

export interface InstitutionRow {
  spread: Spread;
  udes: { value: number | null; target: number | null; pct: number | null };
}

export function InstitutionRows({ rows }: { rows: InstitutionRow[] }) {
  return (
    <div className="ist-inst" role="table" aria-label="Cada indicador: la cifra de la UDES y el reparto de sus programas">
      <div role="row" className="ist-inst__head">
        <span role="columnheader">Indicador</span>
        <span role="columnheader">Cifra UDES / meta</span>
        <span role="columnheader" className="ist-num">
          Programas
        </span>
        <span role="columnheader" className="ist-inst__scale" aria-hidden="true">
          <i style={{ left: "0%" }}>0 %</i>
          <i style={{ left: on(50, BOX_MAX) }}>50 %</i>
          <i style={{ left: on(100, BOX_MAX) }}>meta</i>
          <i style={{ left: "100%" }}>{BOX_MAX} %+</i>
        </span>
        <span role="columnheader" className="ist-num">
          Cumplen
        </span>
      </div>
      {rows.map(({ spread: s, udes }) => {
        const standing = standingOf(udes.pct, udes.target !== null);
        const share = s.withTarget ? Math.round((s.met / s.withTarget) * 100) : null;
        return (
          <div role="row" key={s.indicator.id} className="ist-inst__row" style={{ "--tone": FUNCTION_TONE[s.indicator.fn] } as CSSProperties}>
            <span role="rowheader" className="ist-list__name">
              <strong>{s.indicator.name}</strong>
              <span>
                <b>{s.indicator.code}</b>
                <span>{STAGE_LABEL[s.indicator.stage]}</span>
              </span>
            </span>
            <span role="cell" className="ist-inst__udes" data-standing={standing}>
              <span>
                <strong>
                  <span aria-hidden="true">{STANDING_GLYPH[standing]}</span> {udes.value === null ? "Sin cifra" : figure(udes.value, s.indicator.measure)}
                </strong>
                <small>meta {udes.target === null ? s.indicator.target2026 || "sin número" : figure(udes.target, s.indicator.measure)}</small>
              </span>
              <span className="ist-bullet" data-size="sm" aria-hidden="true">
                {udes.pct !== null ? <span style={{ width: on(udes.pct, 125) }} /> : <span data-hatch />}
                <i />
              </span>
            </span>
            <span role="cell" className="ist-num ist-inst__n">
              {s.adopters}
            </span>
            <span
              role="cell"
              className="ist-box"
              aria-label={
                s.box
                  ? `De ${s.reported} programas con cifra: el más bajo ${pct(s.box.min)}, mediana ${pct(s.box.median)}, el más alto ${pct(s.box.max)}`
                  : `Solo ${s.reported} de ${s.adopters} programas reportan`
              }
            >
              <i className="ist-box__goal" style={{ left: on(100, BOX_MAX) }} />
              {s.box && s.reported >= 2 ? <BoxPlot box={s.box} /> : <em className="ist-muted">○ {s.reported} de {s.adopters} con cifra: sin reparto</em>}
            </span>
            <span role="cell" className="ist-num ist-rows__share" data-level={share === null ? undefined : share >= 50 ? "alto" : share >= 30 ? "medio" : "bajo"}>
              {share === null ? "—" : `${share} %`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --- Las cifras de arriba --------------------------------------------------------------- */

export function Pebbles({ children }: { children: ReactNode }) {
  return <div className="ist-pebbles">{children}</div>;
}

export function Pebble({ label, value, of, note, tone }: { label: string; value: ReactNode; of?: string; note?: string; tone?: "bien" }) {
  return (
    <div className="ist-pebble" data-tone={tone}>
      <span>{label}</span>
      <strong>
        {value}
        {of && <small> {of}</small>}
      </strong>
      {note && <em>{note}</em>}
    </div>
  );
}
