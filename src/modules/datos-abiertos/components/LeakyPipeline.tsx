/* =============================================================================
   Tubería que gotea: deserción acumulada por cohorte.

   La cohorte entra al 100 % por la boquilla de la izquierda y baja por una
   tubería metálica escalonada: cada tramo desciende en proporción a la
   deserción acumulada. En cada unión gotea lo que se perdió en ese tramo; las
   gotas son más grandes y caen más seguido donde la fuga es mayor. La salida
   de la derecha sigue goteando.

   Además de cada cohorte se puede ver el promedio de las cohortes, calculado en
   cada etapa con las que tienen dato hasta ahí (referencia SPADIES).

   Pasar por una unión cuenta la historia en cifras; un clic la fija. Los tramos
   que la cohorte aún no cursa quedan en contorno, "en curso". Con movimiento
   reducido no caen gotas: queda la tubería quieta con una gota colgando.

   Recibe las mismas props que Pipeline, así se intercambian sin tocar el
   informe.
   ========================================================================== */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { formatValue } from "../data/open-data";
import type { CampusId, PipelineCohort, PipelineData } from "../data/types";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";
import "./leaky-pipeline.css";

interface LeakyPipelineProps {
  data: PipelineData;
  campus: CampusId;
  campusName: string;
}

const AVERAGE = "__promedio__";

const H = 480;
const R = 16; // radio del tubo
const INLET_X = 66;
const BADGE_Y = 70;
const BADGE_R = 50;
const LEVEL_TOP = 172;
const LEVEL_BOTTOM = H - 124;
const FALL = 38; // caída de una gota de unión
const EXIT_FALL = 74;

type Focus = { kind: "stage"; index: number } | null;

interface StagePoint {
  /** Deserción acumulada: % de la cohorte que ya se retiró al llegar a la etapa. */
  cumulative: number | null;
  /** Puntos de la cohorte que se pierden en el tramo que termina aquí. */
  lost: number | null;
  /** % de los que llegaron al tramo que se retira en él. */
  shareOfStage: number | null;
  /** Solo cohorte en estudiantes: cuántos siguen y cuántos se fueron. */
  students: number | null;
  studentsLost: number | null;
  cause: string | null;
  /** Solo promedio: cuántas cohortes tienen dato en esta etapa. */
  sample: number | null;
}

const pct = (v: number | null) => `${formatValue(v, "decimal")} %`;

/** "Semestre 3", "2.º semestre", "4° semestre" → "S3", "S2", "S4"; cualquier otro nombre queda igual. */
function shortStage(name: string) {
  const match = /^\s*(?:semestre\s*(\d+)|(\d+)\s*(?:\.?\s*(?:º|°|o|er|ro|do|to|vo|no))?\s*semestre)\s*$/i.exec(name);
  return match ? `S${match[1] ?? match[2]}` : name;
}

/** Ancho mínimo del dibujo: por debajo, la tubería se recorre deslizando. */
const MIN_WIDTH = 860;
const CALLOUT_W = 244;
const CALLOUT_TOP = 12;

export function LeakyPipeline({ data, campus, campusName }: LeakyPipelineProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLElement>(null);
  const available = useWidth(wrap, 980);
  const width = Math.max(MIN_WIDTH, available);
  const narrow = available < MIN_WIDTH;
  const seen = useInView(wrap);
  // Ids propios: puede haber varias tuberías en la misma página.
  const uid = useId().replace(/:/g, "");
  const ringId = `lp-ring-${uid}`;
  const dropId = `lp-drop-${uid}`;
  const [calloutH, setCalloutH] = useState(150);
  const [atEnd, setAtEnd] = useState(false);

  useLayoutEffect(() => {
    const node = calloutRef.current;
    if (!node) return;
    const measure = () => setCalloutH(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [narrow]);
  const reduced = usePrefersReducedMotion();
  const stages = data.stages;
  const students = (data.measure ?? "estudiantes") === "estudiantes";

  const cohorts = useMemo(
    () => Array.from(new Set(data.cohorts.map((c) => String(c.cohort)))).sort((a, b) => a.localeCompare(b)),
    [data.cohorts],
  );

  /** La fila de una cohorte: el campus elegido, si no el total, si no la primera que haya. */
  const rowOf = (cohort: string): PipelineCohort | undefined => {
    const ofCohort = data.cohorts.filter((c) => String(c.cohort) === cohort);
    return ofCohort.find((c) => c.campus === campus) ?? ofCohort.find((c) => c.campus === "todas") ?? ofCohort[0];
  };

  const [cohort, setCohort] = useState(() => (cohorts.length > 1 ? AVERAGE : (cohorts[0] ?? AVERAGE)));
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const focus = hover ?? pinned;
  const average = cohort === AVERAGE;

  const rows = (average ? cohorts : [cohort]).map(rowOf).filter((r): r is PipelineCohort => Boolean(r));
  if (!rows.length || stages.length < 2) {
    return <p className="od-empty">Esta tubería todavía no tiene cifras cargadas. Se cargan en la intranet, en Captura.</p>;
  }

  /** Deserción acumulada de una fila en cada etapa. */
  const cumulativeOf = (row: PipelineCohort) => {
    const intake = row.remaining[0];
    return row.remaining.map((v) => (v === null || !intake ? null : (1 - v / intake) * 100));
  };

  const points: StagePoint[] = (() => {
    if (average) {
      const series = rows.map(cumulativeOf);
      const cumulative = stages.map((_, i) => {
        const values = series.map((s) => s[i]).filter((v): v is number => v !== null);
        return { value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, sample: values.length };
      });
      return cumulative.map((c, i) => {
        const before = i > 0 ? cumulative[i - 1].value : null;
        const lost = i > 0 && c.value !== null && before !== null ? c.value - before : null;
        return {
          cumulative: c.value,
          lost,
          shareOfStage: lost !== null && before !== null && before < 100 ? (lost / (100 - before)) * 100 : null,
          students: null,
          studentsLost: null,
          cause: null,
          sample: c.sample,
        };
      });
    }
    const row = rows[0];
    const cumulative = cumulativeOf(row);
    return cumulative.map((value, i) => {
      const before = i > 0 ? cumulative[i - 1] : null;
      const lost = i > 0 && value !== null && before !== null ? value - before : null;
      const prev = i > 0 ? row.remaining[i - 1] : null;
      const now = row.remaining[i];
      return {
        cumulative: value,
        lost,
        shareOfStage:
          row.dropout?.[i] ?? (lost !== null && before !== null && before < 100 ? (lost / (100 - before)) * 100 : null),
        students: students ? now : null,
        studentsLost: students && i > 0 && prev !== null && now !== null ? prev - now : null,
        cause: i > 0 ? row.mainCause[i - 1] || "Sin causa declarada" : null,
        sample: null,
      };
    });
  })();

  const intakeStudents = !average && students ? rows[0].remaining[0] : null;
  let lastKnown = 0;
  points.forEach((p, i) => {
    if (p.cumulative !== null) lastKnown = i;
  });
  const final = points[lastKnown].cumulative ?? 0;
  const complete = lastKnown === stages.length - 1;

  // --- Geometría ------------------------------------------------------------
  const joints = stages.length - 1; // etapas 1..n-1; la 0 es la boquilla
  const firstX = INLET_X + 118;
  const exitX = width - 36;
  const lastX = exitX - 76;
  const xAt = (i: number) => (joints === 1 ? (firstX + lastX) / 2 : firstX + ((i - 1) / (joints - 1)) * (lastX - firstX));
  const step = joints > 1 ? (lastX - firstX) / (joints - 1) : lastX - firstX;

  const maxLost = Math.max(0.01, ...points.slice(1).map((p) => p.lost ?? 0));
  const strengthOf = (i: number) => Math.max(0, (points[i].lost ?? 0) / maxLost);

  // La tubería siempre desciende: cada unión queda más abajo que la anterior y
  // el escalón es más hondo donde la fuga es mayor. Así un dato ruidoso (una
  // cohorte que "recupera" estudiantes) no hace subir el tubo; la cifra real
  // queda en la etiqueta. Los tramos en curso bajan con el escalón mínimo.
  const weights = points.map((_, i) => (i < 2 ? 0 : 1 + strengthOf(i) * 2));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const drop = Math.min(LEVEL_BOTTOM - LEVEL_TOP, Math.max(0, joints - 1) * 46);
  const levels = weights.map((_, i) => {
    const before = weights.slice(0, i + 1).reduce((a, b) => a + b, 0);
    return LEVEL_TOP + (totalWeight ? (before / totalWeight) * drop : 0);
  });
  const yAt = (i: number) => levels[Math.max(1, Math.min(i, stages.length - 1))];

  /** Tramo que llega a la etapa i: de la unión i-1 (o la boquilla) a la unión i. */
  const piecePath = (i: number) => {
    const y1 = yAt(i);
    if (i === 1) {
      const bend = 26;
      return `M${INLET_X} ${BADGE_Y + BADGE_R - 4} L${INLET_X} ${y1 - bend} Q${INLET_X} ${y1} ${INLET_X + bend} ${y1} L${xAt(1)} ${y1}`;
    }
    const x0 = xAt(i - 1);
    const x1 = xAt(i);
    const y0 = yAt(i - 1);
    const b0 = x0 + step * 0.3;
    const b1 = x1 - step * 0.3;
    const mid = (b0 + b1) / 2;
    return `M${x0} ${y0} L${b0} ${y0} C${mid} ${y0} ${mid} ${y1} ${b1} ${y1} L${x1} ${y1}`;
  };
  const exitY = yAt(stages.length - 1);
  const exitPath = `M${xAt(stages.length - 1)} ${exitY} L${exitX} ${exitY}`;

  // Llaves de paso en las dos fugas mayores con etiqueta abajo (arriba queda libre).
  const valves = new Set(
    points
      .map((p, i) => ({ i, lost: p.lost ?? -1 }))
      .filter(({ i }) => i > 0 && i % 2 === 0)
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 2)
      .filter(({ lost }) => lost > 0)
      .map(({ i }) => i),
  );

  // En pantalla ancha el recuadro va arriba a la derecha, dentro del dibujo; si
  // taparía una cifra, todo el dibujo baja lo necesario. En pantalla angosta va
  // encima de la tubería.
  const calloutLeft = width - CALLOUT_W - 18;
  const shift = (() => {
    if (narrow) return 0;
    const tops = stages.slice(1).map((_, k) => {
      const i = k + 1;
      if (xAt(i) + 44 < calloutLeft) return Infinity;
      return i % 2 === 1 ? yAt(i) - R - 54 : yAt(i) - R - (valves.has(i) ? 22 : 8);
    });
    const exitTop = exitY - R - 8;
    return Math.max(0, Math.ceil(CALLOUT_TOP + calloutH + 14 - Math.min(exitTop, ...tops)));
  })();

  const cohortLabel = average
    ? cohorts.length > 1
      ? `Cohortes ${cohorts[0]} a ${cohorts[cohorts.length - 1]}`
      : `Cohorte ${cohorts[0]}`
    : `Cohorte ${cohort}`;
  const shownCampus = (() => {
    const c = rows[0].campus;
    return c === "todas" ? "todos los campus" : c === campus ? campusName : String(c);
  })();

  const tip = (() => {
    if (!focus) return null;
    const i = focus.index;
    const p = points[i];
    const body =
      i === 0 ? (
        <>
          <strong>{stages[0]}</strong>
          <span>
            Entra el 100 % de la cohorte
            {intakeStudents !== null && <> · {formatValue(intakeStudents, "entero")} estudiantes</>}
          </span>
          {average && <span>Promedio de {rows.length} cohortes</span>}
        </>
      ) : (
        <>
          <strong>{stages[i]}</strong>
          {p.cumulative === null ? (
            <span>{cohortLabel} todavía no llega a esta etapa.</span>
          ) : (
            <>
              <span>
                Deserción acumulada: <b>{pct(p.cumulative)}</b>
                {average && <> en promedio</>}
              </span>
              {p.lost !== null && (
                <span>
                  En este tramo se pierden {formatValue(p.lost, "decimal")} puntos
                  {p.shareOfStage !== null && <> · {pct(p.shareOfStage)} de los que llegaron</>}
                </span>
              )}
              {p.students !== null && (
                <span>
                  Siguen {formatValue(p.students, "entero")} estudiantes
                  {p.studentsLost !== null && <> · se retiraron {formatValue(p.studentsLost, "entero")}</>}
                </span>
              )}
              {p.cause && <span>Causa principal declarada: {p.cause}</span>}
              {p.sample !== null && (
                <em>
                  Con {p.sample} {p.sample === 1 ? "cohorte" : "cohortes"} que tienen dato hasta aquí
                </em>
              )}
            </>
          )}
        </>
      );
    const x = i === 0 ? INLET_X : xAt(i);
    const y = i === 0 ? BADGE_Y - BADGE_R : i % 2 === 1 ? yAt(i) - R - 52 : yAt(i) - R - 10;
    return { x, y: y + shift, body };
  })();

  const toggle = (index: number) => setPinned((p) => (p?.index === index ? null : { kind: "stage", index }));

  const callout = (
    <aside
      ref={calloutRef}
      className="lp__callout"
      data-docked={narrow || undefined}
      style={narrow ? undefined : { left: calloutLeft, width: CALLOUT_W, top: CALLOUT_TOP }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="lp__callout-icon">
        <path d="M12 3 1.5 8.5 12 14l8.5-4.45V16h2V8.5L12 3Z" />
        <path d="M5.5 12.2v3.6c0 1.9 2.9 3.7 6.5 3.7s6.5-1.8 6.5-3.7v-3.6L12 15.6l-6.5-3.4Z" />
      </svg>
      <p>
        {complete ? <>Al llegar a {stages[lastKnown].toLowerCase()},</> : <>Hasta {stages[lastKnown].toLowerCase()},</>}
        {average ? " en promedio" : ""}
        <b>{pct(final)}</b>
        {average ? "de los estudiantes de las cohortes analizadas ha desertado." : "de la cohorte ha desertado."}
      </p>
    </aside>
  );

  return (
    <div className="lp" data-seen={seen || undefined} data-motion={!reduced || undefined}>
      <div className="lp__bar">
        {cohorts.length > 1 && (
          <label className="od-select">
            <span>Cohorte</span>
            <select
              value={cohort}
              onChange={(event) => {
                setCohort(event.target.value);
                setPinned(null);
              }}
            >
              <option value={AVERAGE}>Promedio de cohortes</option>
              {cohorts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="lp__meta">
          {cohortLabel}
          {campus !== "todas" && rows[0].campus !== campus && (
            <small> · {campusName} no reporta {average ? "estas cohortes" : "esta cohorte"}; se muestra {shownCampus}.</small>
          )}
        </p>
      </div>

      {narrow && callout}

      <div className="lp__viewport" data-narrow={narrow || undefined} data-end={atEnd || undefined}>
      <div
        ref={wrap}
        className="lp__scroll"
        tabIndex={0}
        role="region"
        aria-label="Tubería de deserción, desplazable"
        onScroll={(event) => {
          const el = event.currentTarget;
          setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
        }}
      >
        {!narrow && callout}

        <svg
          width={width}
          height={H + shift}
          role="img"
          aria-label={`${data.title}. ${cohortLabel}, ${shownCampus}. Deserción acumulada al llegar a ${stages[lastKnown]}: ${pct(final)}.`}
        >
          <defs>
            <linearGradient id={ringId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--lp-metal-hi)" }} />
              <stop offset="0.45" style={{ stopColor: "var(--lp-metal)" }} />
              <stop offset="1" style={{ stopColor: "var(--lp-metal-lo)" }} />
            </linearGradient>
            <radialGradient id={dropId} cx="0.35" cy="0.55" r="0.75">
              <stop offset="0" style={{ stopColor: "var(--lp-water-hi)" }} />
              <stop offset="1" style={{ stopColor: "var(--lp-water)" }} />
            </radialGradient>
          </defs>

          <g transform={`translate(0 ${shift})`} style={{ "--ring": `url(#${ringId})` } as CSSProperties}>

          {/* Tubo, tramo por tramo */}
          {stages.slice(1).map((_, k) => {
            const i = k + 1;
            const inProgress = points[i].cumulative === null;
            const d = piecePath(i);
            return (
              <g
                key={`piece-${i}`}
                className="lp__piece"
                data-progress={inProgress || undefined}
                style={{ "--i": i } as CSSProperties}
              >
                <path className="lp__shadow" d={d} />
                <path className="lp__edge" d={d} />
                <path className="lp__body" d={d} />
                <path className="lp__shade" d={d} />
                <path className="lp__light" d={d} />
                <path className="lp__gloss" d={d} />
                {!inProgress && <path className="lp__glint" d={d} pathLength={100} style={{ "--g": i } as CSSProperties} />}
              </g>
            );
          })}
          <g className="lp__piece" data-progress={!complete || undefined} style={{ "--i": stages.length } as CSSProperties}>
            <path className="lp__shadow" d={exitPath} />
            <path className="lp__edge" d={exitPath} />
            <path className="lp__body" d={exitPath} />
            <path className="lp__shade" d={exitPath} />
            <path className="lp__light" d={exitPath} />
            <path className="lp__gloss" d={exitPath} />
            <rect className="lp__ring" x={exitX - 20} y={exitY - R - 5} width={14} height={(R + 5) * 2} rx={3} />
            <ellipse className="lp__mouth-rim" cx={exitX} cy={exitY} rx={7} ry={R + 3} />
            <ellipse className="lp__mouth" cx={exitX + 1} cy={exitY} rx={4} ry={R - 3} />
          </g>

          {/* Boquilla: cohorte de ingreso, encima del codo del tubo */}
          <g
            className="lp__badge"
            data-active={focus?.index === 0 || undefined}
            tabIndex={0}
            role="button"
            aria-label={`${stages[0]}: entra el 100 % de la cohorte`}
            onPointerEnter={() => setHover({ kind: "stage", index: 0 })}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover({ kind: "stage", index: 0 })}
            onBlur={() => setHover(null)}
            onClick={() => toggle(0)}
          >
            <rect className="lp__ring" x={INLET_X - R - 5} y={BADGE_Y + BADGE_R - 2} width={(R + 5) * 2} height={12} rx={3} />
            <circle className="lp__badge-disc" cx={INLET_X} cy={BADGE_Y} r={BADGE_R} />
            <text className="lp__badge-value" x={INLET_X} y={BADGE_Y - 2} textAnchor="middle">
              100 %
            </text>
            <text className="lp__badge-label" x={INLET_X} y={BADGE_Y + 16} textAnchor="middle">
              Cohorte de
            </text>
            <text className="lp__badge-label" x={INLET_X} y={BADGE_Y + 30} textAnchor="middle">
              ingreso
            </text>
          </g>

          {/* Salida: sigue goteando */}
          {complete && (
            <g className="lp__drips lp__drips--exit" transform={`translate(${exitX + 2} ${exitY + R - 2})`}>
              {[0, 1, 2].map((d) => (
                <Drip key={d} fill={dropId} index={d} size={1.5} fall={EXIT_FALL} speed={1.7} offset={(d - 1) * 7} />
              ))}
            </g>
          )}

          {/* Uniones: fugas, cifras y llaves */}
          {stages.slice(1).map((stage, k) => {
            const i = k + 1;
            const p = points[i];
            const x = xAt(i);
            const y = yAt(i);
            const above = i % 2 === 1;
            const active = focus?.index === i;
            const strength = strengthOf(i);
            const drops = p.lost === null || p.lost <= 0 ? 0 : 1 + Math.round(strength * 2);
            const speed = 2.6 - strength * 1.1;
            const size = 0.8 + strength * 0.7;
            return (
              <g
                key={`joint-${i}`}
                className="lp__joint"
                data-active={active || undefined}
                data-pinned={pinned?.index === i || undefined}
                data-progress={p.cumulative === null || undefined}
                style={{ "--i": i } as CSSProperties}
                tabIndex={0}
                role="button"
                aria-label={
                  p.cumulative === null
                    ? `${stage}: en curso`
                    : `${stage}: deserción acumulada ${pct(p.cumulative)}${p.lost !== null ? `, ${formatValue(p.lost, "decimal")} puntos en el tramo` : ""}`
                }
                onPointerEnter={() => setHover({ kind: "stage", index: i })}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ kind: "stage", index: i })}
                onBlur={() => setHover(null)}
                onClick={() => toggle(i)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(i);
                  }
                }}
              >
                <rect x={x - step / 2} y={y - R - 64} width={step} height={R * 2 + 136} fill="transparent" />

                {drops > 0 && (
                  <g className="lp__drips" transform={`translate(${x} ${y + R + 3})`}>
                    {Array.from({ length: drops }, (_, d) => (
                      <Drip key={d} fill={dropId} index={d} count={drops} size={size} fall={FALL} speed={speed} offset={(d - (drops - 1) / 2) * 6} />
                    ))}
                  </g>
                )}

                {valves.has(i) && (
                  <g className="lp__valve">
                    <rect className="lp__valve-stem" x={x - 2.5} y={y - R - 12} width={5} height={12} />
                    <ellipse className="lp__valve-wheel" cx={x} cy={y - R - 14} rx={13} ry={4.5} />
                    <circle className="lp__valve-cap" cx={x} cy={y - R - 15} r={2.5} />
                  </g>
                )}
                <rect className="lp__ring" x={x - 8} y={y - R - 5} width={16} height={(R + 5) * 2} rx={3} />
                {valves.has(i) && <rect className="lp__valve-body" x={x - 10} y={y - 9} width={20} height={18} rx={3} />}

                <g className="lp__label">
                  <text className="lp__stage" x={x} y={above ? y - R - 34 : y + R + FALL + 34} textAnchor="middle">
                    {shortStage(stage)}
                  </text>
                  <text className="lp__value" x={x} y={above ? y - R - 12 : y + R + FALL + 56} textAnchor="middle">
                    {p.cumulative === null ? "en curso" : pct(p.cumulative)}
                  </text>
                </g>
              </g>
            );
          })}
          </g>
        </svg>

        {tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 180 ? "start" : tip.x > width - 200 ? "end" : "center"}>
            {tip.body}
          </ChartTooltip>
        )}
      </div>
      {narrow && (
        <span className="lp__hint" aria-hidden="true">
          Desliza para recorrer la tubería →
        </span>
      )}
      </div>

      {average && (
        <p className="lp__note">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 10.5v6M12 7.2v.1" />
          </svg>
          Los valores son porcentajes (%) y corresponden al promedio acumulado por etapa, calculado con las cohortes que
          tienen dato disponible hasta cada etapa.
        </p>
      )}
    </div>
  );
}

/** Una gota que se forma bajo la unión, cae y salpica. */
function Drip({
  fill,
  index,
  count = 3,
  size,
  fall,
  speed,
  offset,
}: {
  /** Id del degradado de agua de esta tubería. */
  fill: string;
  index: number;
  count?: number;
  size: number;
  fall: number;
  speed: number;
  offset: number;
}) {
  const style = {
    // La gota vive dentro del grupo escalado: la caída se expresa en su escala.
    "--fall": `${(fall / size).toFixed(1)}px`,
    "--speed": `${speed.toFixed(2)}s`,
    "--delay": `${((index * speed) / count + index * 0.17).toFixed(2)}s`,
  } as CSSProperties;
  return (
    <g transform={`translate(${offset} 0)`} style={style}>
      {/* La escala va en un grupo aparte: la animación CSS reemplaza el transform de la gota. */}
      <g transform={`scale(${size.toFixed(2)})`}>
        <path className="lp__drop" d="M0 0 C1.6 3 4 5.6 4 8.4 A4 4 0 0 1 -4 8.4 C-4 5.6 -1.6 3 0 0Z" fill={`url(#${fill})`} />
      </g>
      <ellipse className="lp__splash" cx={0} cy={fall + 12 * size} rx={5 * size} ry={1.6 * size} />
    </g>
  );
}
