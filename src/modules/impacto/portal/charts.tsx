/* =============================================================================
   Portal de Impacto · las gráficas.

   Todas dibujan con SVG o CSS y los tokens del proyecto, sin librería: el
   triángulo de lazos entre funciones, la matriz de cadena de valor, las
   barras por eslabón, el estado de las metas y la comparación por sede.
   Ningún estado se dice solo con color: siempre va la palabra al lado.
   ========================================================================== */

import type { CSSProperties } from "react";
import { FUNCTIONS, FUNCTION_LABEL, FUNCTION_TONE, STAGES, STAGE_LABEL, formatFigure } from "../model";
import type { Measure, SubstantiveFunction } from "../model";
import { FN_SHORT, GOAL_LABEL } from "./analysis";
import type { FunctionLink, GoalState, MatrixRow, ProgramChain, RiverCounts } from "./analysis";

const STAGE_TONE = ["var(--ipo-stage-1)", "var(--ipo-stage-2)", "var(--ipo-stage-3)", "var(--ipo-stage-4)"];

/* --- Lazos entre funciones ------------------------------------------------------------ */

const NODE: Record<SubstantiveFunction, { x: number; y: number }> = {
  investigacion: { x: 150, y: 140 },
  extension: { x: 440, y: 140 },
  ensenanza: { x: 295, y: 345 },
};

export function FunctionLinks({ totals, links }: { totals: Record<SubstantiveFunction, number>; links: FunctionLink[] }) {
  const most = Math.max(1, ...Object.values(totals));
  const strongest = Math.max(1, ...links.map((l) => l.score));
  return (
    <svg className="ipo-links" viewBox="0 0 590 450" role="img" aria-label={`Vínculos entre funciones: ${links.map((l) => `${FUNCTION_LABEL[l.a]} y ${FUNCTION_LABEL[l.b]}, ${l.score}`).join("; ")}.`}>
      {links.map((l, i) => {
        const a = NODE[l.a];
        const b = NODE[l.b];
        return (
          <line
            key={`${l.a}-${l.b}`}
            className="ipo-links__line"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            pathLength={1}
            strokeWidth={l.score ? 6 + (l.score / strongest) * 22 : 2}
            style={{ "--delay": `${200 + i * 120}ms` } as CSSProperties}
          />
        );
      })}
      {FUNCTIONS.map((f) => {
        const { x, y } = NODE[f];
        const r = 44 + Math.sqrt(totals[f] / most) * 40;
        return (
          <g key={f} className="ipo-links__node" style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
            <circle cx={x} cy={y} r={r} />
            <text x={x} y={y - 4} textAnchor="middle" className="ipo-links__count">
              {totals[f]}
            </text>
            <text x={x} y={y + 20} textAnchor="middle" className="ipo-links__name">
              {FUNCTION_LABEL[f]}
            </text>
          </g>
        );
      })}
      {links.map((l) => {
        const a = NODE[l.a];
        const b = NODE[l.b];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 + (a.y === b.y ? -76 : 0);
        return (
          <g key={`t-${l.a}-${l.b}`} className="ipo-links__badge">
            <rect x={mx - 26} y={my - 15} width={52} height={30} rx={15} />
            <text x={mx} y={my + 5} textAnchor="middle">
              {l.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- La matriz de cadena de valor ---------------------------------------------------- */

export function ValueMatrixTable({ rows, caption }: { rows: MatrixRow[]; caption: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.count)));
  return (
    <div className="ipo-matrix" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Dimensión</th>
            {STAGES.map((s, i) => (
              <th scope="col" key={s}>
                <i style={{ background: STAGE_TONE[i] }} aria-hidden="true" />
                {STAGE_LABEL[s]}
              </th>
            ))}
            <th scope="col">Cadena</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dimensionId ?? "sin"} data-unassigned={r.unassigned || undefined}>
              <th scope="row">{r.name}</th>
              {r.cells.map((c, i) => {
                const empty = c.count + c.refs === 0;
                return (
                  <td key={c.stage} data-empty={(empty && !r.unassigned) || undefined} title={c.codes.join(" · ") || undefined}>
                    {empty ? (
                      <span className="ipo-matrix__gap">{r.unassigned ? "—" : "sin eslabón"}</span>
                    ) : (
                      <>
                        <strong>{c.count}</strong>
                        {c.refs > 0 && <small>+{c.refs} de otra dimensión</small>}
                        <span className="ipo-matrix__bar" aria-hidden="true">
                          <span style={{ width: `${Math.max(6, (c.count / max) * 100)}%`, background: STAGE_TONE[i] }} />
                        </span>
                      </>
                    )}
                  </td>
                );
              })}
              <td>
                {r.unassigned ? (
                  <span className="ipo-status" data-state="none">Sin cadena</span>
                ) : r.complete ? (
                  <span className="ipo-status" data-state="ok">Cadena completa</span>
                ) : (
                  <span className="ipo-status" data-state="gap">
                    Falta: {r.missing.map((s) => STAGE_LABEL[s].toLowerCase()).join(", ")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Indicadores por eslabón --------------------------------------------------------- */

export function StageBars({ counts }: { counts: RiverCounts }) {
  const totals = FUNCTIONS.map((f) => STAGES.reduce((t, s) => t + counts[f][s].total, 0));
  const most = Math.max(1, ...totals);
  return (
    <div className="ipo-stagebars">
      {FUNCTIONS.map((f, fi) => (
        <div key={f} className="ipo-stagebars__row">
          <span>{FUNCTION_LABEL[f]}</span>
          <div className="ipo-stagebars__bar" style={{ width: `${(totals[fi] / most) * 100}%` }} role="img"
            aria-label={`${FUNCTION_LABEL[f]}: ${STAGES.map((s) => `${counts[f][s].total} ${STAGE_LABEL[s].toLowerCase()}`).join(", ")}`}>
            {STAGES.map((s, i) =>
              counts[f][s].total ? (
                <span key={s} style={{ flexGrow: counts[f][s].total, background: STAGE_TONE[i], "--i": fi * 4 + i } as CSSProperties}>
                  {counts[f][s].total}
                </span>
              ) : null,
            )}
          </div>
          <strong>{totals[fi]}</strong>
        </div>
      ))}
      <div className="ipo-legend">
        {STAGES.map((s, i) => (
          <span key={s}>
            <i style={{ background: STAGE_TONE[i] }} aria-hidden="true" />
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- Metas ----------------------------------------------------------------------------- */

const GOAL_ORDER: GoalState[] = ["cumplida", "en_camino", "sin_cifra", "sin_meta"];

export function GoalBar({ states }: { states: Record<GoalState, number> }) {
  const total = GOAL_ORDER.reduce((t, s) => t + states[s], 0);
  return (
    <div className="ipo-goals">
      <div className="ipo-goals__bar" role="img" aria-label={GOAL_ORDER.map((s) => `${states[s]} ${GOAL_LABEL[s].toLowerCase()}`).join(", ")}>
        {GOAL_ORDER.map((s) => (states[s] ? <span key={s} data-state={s} style={{ flexGrow: states[s] }} /> : null))}
      </div>
      <dl>
        {GOAL_ORDER.map((s) => (
          <div key={s} data-state={s}>
            <dt>{GOAL_LABEL[s]}</dt>
            <dd>{states[s]}</dd>
          </div>
        ))}
      </dl>
      {total === 0 && <p className="ipo-muted">Aún no hay fichas publicadas.</p>}
    </div>
  );
}

/* --- La cadena de un programa ---------------------------------------------------------- */

export function ChainGrid({ chain, functions = FUNCTIONS }: { chain: ProgramChain; functions?: SubstantiveFunction[] }) {
  return (
    <div className="ipo-chain" role="table" aria-label="Cadena del programa por función y eslabón">
      <div role="row" className="ipo-chain__head">
        <span role="columnheader" />
        {STAGES.map((s) => (
          <span role="columnheader" key={s}>
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
      {functions.map((f) => (
        <div role="row" key={f} className="ipo-chain__row" style={{ "--tone": FUNCTION_TONE[f] } as CSSProperties}>
          <span role="rowheader">{FUNCTION_LABEL[f]}</span>
          {STAGES.map((s) =>
            chain[f][s].length ? (
              <span role="cell" key={s} className="ipo-chain__cell">
                {chain[f][s].join(" · ")}
              </span>
            ) : (
              <span role="cell" key={s} className="ipo-chain__cell" data-empty>
                Falta
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** Los cuatro cuadritos de una función: qué eslabones cubre. */
export function ChainDots({ chain, fn }: { chain: ProgramChain; fn: SubstantiveFunction }) {
  const covered = STAGES.filter((s) => chain[fn][s].length).length;
  return (
    <span className="ipo-dots" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties} data-none={covered === 0 || undefined}>
      <span aria-hidden="true">
        {STAGES.map((s) => (
          <i key={s} data-on={chain[fn][s].length > 0 || undefined} data-gap={(covered > 0 && !chain[fn][s].length) || undefined} />
        ))}
      </span>
      <em>{covered === 0 ? "Sin conexión" : covered === 4 ? "Completa" : `Faltan ${4 - covered}`}</em>
      <span className="sr-only">
        {FUNCTION_LABEL[fn]}: {covered} de 4 eslabones
      </span>
    </span>
  );
}

export function FnChip({ fn, text }: { fn: SubstantiveFunction; text: string }) {
  return (
    <span className="ipo-fnchip" style={{ "--tone": FUNCTION_TONE[fn] } as CSSProperties}>
      <i aria-hidden="true" />
      {FN_SHORT[fn]} {text}
    </span>
  );
}

/* --- Por sede -------------------------------------------------------------------------- */

export function CampusBars({
  rows,
  measure,
  target,
  tone,
}: {
  rows: { campus: { id: string; name: string }; value: number | null; year: number | null; from: string; programs: number }[];
  measure: Measure;
  target: number | null;
  tone: string;
}) {
  const most = Math.max(1, target ?? 0, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="ipo-campus" style={{ "--tone": tone } as CSSProperties}>
      {rows.map((r) => (
        <li key={r.campus.id}>
          <div className="ipo-campus__label">
            <span>{r.campus.name}</span>
            <strong>{r.value === null ? "Sin cifra" : formatFigure(Math.round(r.value * 10) / 10, measure)}</strong>
          </div>
          <div className="ipo-campus__track">
            {r.value !== null && <span style={{ width: `${(r.value / most) * 100}%` }} />}
            {target !== null && <i style={{ left: `${(target / most) * 100}%` }} title={`Meta 2026: ${formatFigure(target, measure)}`} />}
          </div>
          <small>
            {r.value === null
              ? "Nadie ha reportado esta cifra aquí."
              : r.from === "sede"
                ? `Cifra de la sede, ${r.year}`
                : `Promedio de ${r.programs} ${r.programs === 1 ? "programa" : "programas"}, ${r.year}`}
          </small>
        </li>
      ))}
    </ul>
  );
}
