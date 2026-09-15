/* =============================================================================
   Tubería con fugas: la deserción de una cohorte.

   La cohorte entra por la izquierda y el agua corre hacia el grado. El tubo
   adelgaza en proporción a la gente que sigue y en cada unión hay una fuga que
   gotea hacia un charco con la cantidad de retirados en ese tramo. Las gotas
   caen más rápido donde la fuga es mayor.

   La tubería habla en estudiantes o en porcentaje, según lo que se capturó:
   estudiantes que siguen, % de la cohorte que sigue (permanencia) o % que se
   retira en cada tramo (deserción). Las cohortes son periodos de ingreso,
   también históricos (2014-A).

   Pasar por un tramo o por una fuga cuenta la historia en cifras; un clic fija
   la fuga. Los tramos que la cohorte aún no cursa se dibujan en contorno,
   "en curso", nunca como una fuga total. Con movimiento reducido no corre el
   agua ni caen gotas: queda la tubería quieta con todas sus cifras.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatValue } from "../data/open-data";
import type { CampusId, PipelineData } from "../data/types";
import { ChartTooltip, ViewSwitch } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

interface PipelineProps {
  data: PipelineData;
  campus: CampusId;
  campusName: string;
}

const H = 400;
const PIPE_Y = 150;
const MAX_HALF = 50;
const MIN_HALF = 8;
const POOL_Y = 330;

type Focus = { kind: "stage" | "leak"; index: number } | null;

export function Pipeline({ data, campus, campusName }: PipelineProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = Math.max(760, useWidth(wrap, 980));
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();

  const measure = data.measure ?? "estudiantes";
  const percent = measure !== "estudiantes";
  /** Cifra de una etapa: estudiantes, o % de la cohorte. */
  const fmt = (v: number) => (percent ? `${formatValue(v, "decimal")} %` : formatValue(v, "entero"));

  const cohorts = useMemo(
    () => Array.from(new Set(data.cohorts.map((c) => String(c.cohort)))).sort((a, b) => a.localeCompare(b)),
    [data.cohorts],
  );
  const [cohort, setCohort] = useState(() => {
    const complete = data.cohorts.filter((c) => c.campus === "todas" && c.remaining.every((v) => v !== null));
    return complete.length ? String(complete[complete.length - 1].cohort) : cohorts[cohorts.length - 1];
  });
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const focus = hover ?? pinned;

  // El campus elegido; si no reportó esta cohorte, el total; si tampoco hay
  // total (un porcentaje capturado solo para un campus), el primero que tenga.
  const ofCohort = data.cohorts.filter((c) => String(c.cohort) === cohort);
  const row = ofCohort.find((c) => c.campus === campus) ?? ofCohort.find((c) => c.campus === "todas") ?? ofCohort[0];
  if (!row) {
    return <p className="od-empty">Esta tubería todavía no tiene cifras cargadas. Se cargan en la intranet, en Captura.</p>;
  }
  const shownCampus = row.campus === "todas" ? "todos los campus" : row.campus === campus ? campusName : String(row.campus);
  const fellBack = row.campus !== campus;

  const stages = data.stages;
  const intake = row.remaining[0] ?? 0;
  const left = 70;
  const right = width - 70;
  const xAt = (i: number) => left + (i / (stages.length - 1)) * (right - left);
  const halfAt = (v: number | null) => (v === null || intake === 0 ? MIN_HALF : Math.max(MIN_HALF, (v / intake) * MAX_HALF));

  let lastKnown = 0;
  row.remaining.forEach((v, i) => {
    if (v !== null) lastKnown = i;
  });
  const graduates = row.remaining[stages.length - 1];

  const leaks = stages.slice(1).map((_, k) => {
    const i = k + 1;
    const before = row.remaining[i - 1];
    const after = row.remaining[i];
    const lost = before !== null && after !== null ? before - after : null;
    return {
      index: i,
      lost,
      shareOfStage: row.dropout?.[i] ?? (lost !== null && before ? (lost / before) * 100 : null),
      shareOfIntake: lost !== null && intake ? (lost / intake) * 100 : null,
      cause: row.mainCause[i - 1] ?? "Sin causa declarada",
    };
  });
  const maxLost = Math.max(1, ...leaks.map((l) => l.lost ?? 0));

  const tip = (() => {
    if (!focus) return null;
    if (focus.kind === "stage") {
      const v = row.remaining[focus.index];
      return {
        x: xAt(focus.index),
        y: PIPE_Y - MAX_HALF - 40,
        body: (
          <>
            <strong>{stages[focus.index]}</strong>
            {v === null ? (
              <span>La cohorte {cohort} todavía no llega a esta etapa.</span>
            ) : (
              <span>
                {percent ? (
                  <>Sigue el {fmt(v)} de la cohorte</>
                ) : (
                  <>
                    Siguen {formatValue(v, "entero")} de {formatValue(intake, "entero")} ·{" "}
                    {formatValue((v / intake) * 100, "decimal")} % del ingreso
                  </>
                )}
              </span>
            )}
          </>
        ),
      };
    }
    const leak = leaks[focus.index - 1];
    return {
      x: (xAt(focus.index - 1) + xAt(focus.index)) / 2,
      y: POOL_Y - 70,
      body: (
        <>
          <strong>
            Entre {stages[focus.index - 1].toLowerCase()} y {stages[focus.index].toLowerCase()}
          </strong>
          {leak.lost === null ? (
            <span>Tramo en curso: aún no se sabe cuántos se retiran.</span>
          ) : (
            <>
              <span>
                {percent ? (
                  <>
                    Se retira el {formatValue(leak.shareOfStage, "decimal")} % de los que llegaron al tramo · la cohorte
                    pierde {formatValue(leak.lost, "decimal")} puntos
                  </>
                ) : (
                  <>
                    Se retiraron {formatValue(leak.lost, "entero")} estudiantes ·{" "}
                    {formatValue(leak.shareOfStage, "decimal")} % de los que llegaron al tramo
                  </>
                )}
              </span>
              <span>Causa principal declarada: {leak.cause}</span>
            </>
          )}
        </>
      ),
    };
  })();

  const pipePath = (i: number) => {
    const x0 = xAt(i);
    const x1 = xAt(i + 1);
    const h0 = halfAt(row.remaining[i]);
    const h1 = halfAt(row.remaining[i + 1] ?? row.remaining[i]);
    return `M${x0} ${PIPE_Y - h0} L${x1} ${PIPE_Y - h1} L${x1} ${PIPE_Y + h1} L${x0} ${PIPE_Y + h0} Z`;
  };

  return (
    <div className="od-pipe" data-seen={seen || undefined} data-motion={!reduced || undefined}>
      <div className="od-pipe__bar">
        {cohorts.length <= 6 ? (
          <ViewSwitch
            label="Cohorte"
            options={cohorts.map((c) => ({ value: c, label: `Cohorte ${c}` }))}
            value={cohort}
            onChange={(v) => {
              setCohort(v);
              setPinned(null);
            }}
          />
        ) : (
          <label className="od-select">
            <span>Cohorte</span>
            <select
              value={cohort}
              onChange={(event) => {
                setCohort(event.target.value);
                setPinned(null);
              }}
            >
              {cohorts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="od-pipe__summary">
          {percent ? (
            graduates !== null ? (
              <>
                De la cohorte {cohort} ({shownCampus}) llegó al final el <b>{fmt(graduates)}</b>.
              </>
            ) : (
              <>
                La cohorte {cohort} ({shownCampus}) sigue en curso: continúa el <b>{fmt(row.remaining[lastKnown] ?? 0)}</b> en{" "}
                {stages[lastKnown].toLowerCase()}.
              </>
            )
          ) : graduates !== null ? (
            <>
              De <b>{formatValue(intake, "entero")}</b> estudiantes que entraron en {cohort} ({shownCampus}),
              se graduaron <b>{formatValue(graduates, "entero")}</b> ({formatValue((graduates / intake) * 100, "decimal")} %).
            </>
          ) : (
            <>
              La cohorte {cohort} sigue en curso: de <b>{formatValue(intake, "entero")}</b> que entraron, continúan{" "}
              <b>{formatValue(row.remaining[lastKnown] ?? 0, "entero")}</b> en {stages[lastKnown].toLowerCase()}.
            </>
          )}
          {fellBack && campus !== "todas" && <small className="od-pipe__note"> {campusName} no reporta esta cohorte.</small>}
        </p>
      </div>

      <div ref={wrap} className="od-pipe__scroll" tabIndex={0} role="region" aria-label="Tubería de permanencia, desplazable">
        <svg width={width} height={H} role="img" aria-label={`${data.title}, cohorte ${cohort}, ${campusName}`}>
          <defs>
            <linearGradient id="od-pipe-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--od-seq-3)" }} />
              <stop offset="0.5" style={{ stopColor: "var(--od-seq-5)" }} />
              <stop offset="1" style={{ stopColor: "var(--od-seq-6)" }} />
            </linearGradient>
            <pattern id="od-pipe-flow" width="36" height="20" patternUnits="userSpaceOnUse">
              <path d="M-4 20 L14 0 M14 20 L32 0 M32 20 L50 0" stroke="rgba(255,255,255,0.22)" strokeWidth="6" />
              {!reduced && (
                <animateTransform attributeName="patternTransform" type="translate" from="0 0" to="36 0" dur="1.1s" repeatCount="indefinite" />
              )}
            </pattern>
          </defs>

          {/* Tubo */}
          {stages.slice(0, -1).map((_, i) => {
            const inProgress = row.remaining[i + 1] === null;
            return (
              <g
                key={`seg-${i}`}
                className="od-pipe__segment"
                data-progress={inProgress || undefined}
                style={{ "--i": i } as CSSProperties}
              >
                <path className="od-pipe__water" d={pipePath(i)} fill={inProgress ? "none" : "url(#od-pipe-water)"} />
                {!inProgress && <path className="od-pipe__stream" d={pipePath(i)} fill="url(#od-pipe-flow)" />}
                <path className="od-pipe__wall" d={pipePath(i)} />
              </g>
            );
          })}

          {/* Uniones y etiquetas de etapa */}
          {stages.map((stage, i) => {
            const v = row.remaining[i];
            const half = halfAt(v ?? row.remaining[lastKnown]);
            const active = focus?.kind === "stage" && focus.index === i;
            return (
              <g
                key={stage}
                className="od-pipe__stage"
                data-active={active || undefined}
                onPointerEnter={() => setHover({ kind: "stage", index: i })}
                onPointerLeave={() => setHover(null)}
              >
                <rect className="od-pipe__flange" x={xAt(i) - 6} y={PIPE_Y - half - 8} width={12} height={half * 2 + 16} rx={3} />
                <text className="od-pipe__stage-name" x={xAt(i)} y={PIPE_Y - MAX_HALF - 44} textAnchor="middle">
                  {stage}
                </text>
                <text className="od-pipe__stage-value" x={xAt(i)} y={PIPE_Y - MAX_HALF - 22} textAnchor="middle">
                  {v === null ? "en curso" : fmt(v)}
                </text>
                <rect x={xAt(i) - 44} y={PIPE_Y - MAX_HALF - 64} width={88} height={MAX_HALF * 2 + 90} fill="transparent" />
              </g>
            );
          })}

          {/* Fugas */}
          {leaks.map((leak) => {
            const xm = xAt(leak.index);
            const yLeak = PIPE_Y + halfAt(row.remaining[leak.index] ?? row.remaining[leak.index - 1]) + 8;
            const strength = leak.lost === null ? 0 : leak.lost / maxLost;
            const active = focus?.kind === "leak" && focus.index === leak.index;
            const poolW = 20 + strength * 70;
            return (
              <g
                key={`leak-${leak.index}`}
                className="od-pipe__leak"
                data-active={active || undefined}
                data-pinned={pinned?.kind === "leak" && pinned.index === leak.index ? true : undefined}
                style={{ "--fall": `${POOL_Y - yLeak - 6}px`, "--speed": `${1.9 - strength * 0.9}s` } as CSSProperties}
                tabIndex={0}
                role="button"
                aria-label={
                  leak.lost === null
                    ? `Tramo hacia ${stages[leak.index]}: en curso`
                    : percent
                      ? `Hacia ${stages[leak.index]} se retira el ${formatValue(leak.shareOfStage, "decimal")} % del tramo. Causa principal: ${leak.cause}`
                      : `Hacia ${stages[leak.index]} se retiraron ${formatValue(leak.lost, "entero")} estudiantes. Causa principal: ${leak.cause}`
                }
                onPointerEnter={() => setHover({ kind: "leak", index: leak.index })}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ kind: "leak", index: leak.index })}
                onBlur={() => setHover(null)}
                onClick={() =>
                  setPinned((p) => (p?.kind === "leak" && p.index === leak.index ? null : { kind: "leak", index: leak.index }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPinned((p) => (p?.kind === "leak" && p.index === leak.index ? null : { kind: "leak", index: leak.index }));
                  }
                }}
              >
                <rect x={xm - 48} y={yLeak - 10} width={96} height={POOL_Y - yLeak + 70} fill="transparent" />
                {leak.lost !== null && (
                  <>
                    {[0, 1, 2].map((d) => (
                      <path
                        key={d}
                        className="od-pipe__drop"
                        d={`M${xm} ${yLeak} q -${3 + strength * 3} ${6 + strength * 4} 0 ${9 + strength * 5} q ${3 + strength * 3} -${3 + strength * 1} 0 -${9 + strength * 5}`}
                        style={{ "--d": d } as CSSProperties}
                      />
                    ))}
                    <ellipse className="od-pipe__pool" cx={xm} cy={POOL_Y} rx={poolW / 2} ry={5 + strength * 5} />
                    <text className="od-pipe__lost" x={xm} y={POOL_Y + 34} textAnchor="middle">
                      {percent ? `−${formatValue(leak.shareOfStage, "decimal")} %` : `−${formatValue(leak.lost, "entero")}`}
                    </text>
                    <text className="od-pipe__lost-share" x={xm} y={POOL_Y + 52} textAnchor="middle">
                      {percent ? "del tramo" : `${formatValue(leak.shareOfStage, "decimal")} % del tramo`}
                    </text>
                  </>
                )}
                {leak.lost === null && (
                  <text className="od-pipe__lost-share" x={xm} y={POOL_Y + 34} textAnchor="middle">
                    en curso
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 180 ? "start" : tip.x > width - 180 ? "end" : "center"}>
            {tip.body}
          </ChartTooltip>
        )}
      </div>
    </div>
  );
}
