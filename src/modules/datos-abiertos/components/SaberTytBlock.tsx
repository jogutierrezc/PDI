/* =============================================================================
   Motor Beta en la ficha: de Saber 11 a Saber TyT.

   El otro modelo de lectura del portal. El bloque de Saber PRO mira una prueba
   contra el promedio del país; este mira dos pruebas de la misma persona y
   pregunta cuánto se movió entre la entrada y la salida.

   Todo gira alrededor de una competencia, como en Saber PRO, pero aquí cada
   competencia tiene dos nombres —el de la prueba de entrada y el de la de
   salida— y las cifras van en percentil, no en puntos.

   Cuatro vistas:
   · Perfil: el polígono de entrada y el de salida superpuestos. Donde la
     salida sobresale, el grupo mejoró su posición.
   · Dispersión: entrada en el eje horizontal, salida en el vertical y la
     diagonal de 45°. Por encima de la diagonal está el valor agregado; por
     debajo, lo que pide intervención. Se ve por programa o como nube de
     evaluados (celdas de 5 percentiles: nunca una persona).
   · Tránsito: de cada cuarto de la distribución de entrada, a qué cuarto se
     salió.
   · Valor agregado: el VAI de cada programa, ordenado.

   Y debajo, la explicación del motor en palabras, porque un índice que nadie
   entiende no sirve para decidir.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Radar } from "@nivo/radar";
import {
  QUARTER_LABEL,
  TYT_COMPETENCIES,
  TYT_LEVEL_LABEL,
  isPaired,
  scatterPoints,
  transitionShares,
  tytFigure,
  tytInfo,
  tytPrograms,
  tytYears,
} from "../data/saber-tyt";
import type { SaberTytData, TytCompetency, TytFigure, TytFilter } from "../data/saber-tyt";
import { ChartFrame, ChartTooltip, ViewSwitch } from "./ChartFrame";
import { SplitFlap } from "./SplitFlap";
import { nivoTheme, useChartTokens } from "./free/chart-tokens";
import { usePrefersReducedMotion, useWidth } from "./motion";
import "./saber-tyt.css";

type TytView = "perfil" | "dispersion" | "transito" | "valor";

const VIEWS: { value: TytView; label: string }[] = [
  { value: "perfil", label: "Perfil" },
  { value: "dispersion", label: "Dispersión" },
  { value: "transito", label: "Tránsito" },
  { value: "valor", label: "Valor agregado" },
];

/** Con menos pareados que esto, un promedio de programa no dice nada. */
const FEW = 10;

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${decimal.format(Math.abs(n))}`;
const pct = (n: number) => `${integer.format(Math.round(n))} %`;

export function SaberTytBlock({ data, anchor, title }: { data: SaberTytData; anchor: string; title?: string }) {
  const [params, setParams] = useSearchParams();
  const years = useMemo(() => tytYears(data), [data]);
  const programs = useMemo(() => tytPrograms(data), [data]);

  const rawComp = params.get("tyt") as TytCompetency;
  const competency: TytCompetency = TYT_COMPETENCIES.some((c) => c.key === rawComp) ? rawComp : "lc";
  const rawView = params.get("tyt-vista") as TytView;
  const view: TytView = VIEWS.some((v) => v.value === rawView) ? rawView : "perfil";
  const program = programs.some((p) => p.name === params.get("tyt-programa")) ? params.get("tyt-programa")! : "";
  const yearParam = Number(params.get("tyt-anio"));
  const year = years.includes(yearParam) ? yearParam : null;

  const set = (patch: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  const filter: TytFilter = { program: program || undefined };
  const figure = tytFigure(data, competency, year, filter);
  const info = tytInfo(competency);
  const scope = program || "toda la UDES";
  const when = year === null ? `${years[0]}–${years[years.length - 1]}` : String(year);
  if (!years.length) return null;

  return (
    <section className="od-section od-tyt" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id={anchor}>{title || data.title}</h2>
            {data.description && <p>{data.description}</p>}
          </div>
          <ViewSwitch label="Vista del Motor Beta" value={view} onChange={(v) => set({ "tyt-vista": v === "perfil" ? "" : v })} options={VIEWS} />
        </header>

        <div className="od-tyt__board">
          <div className="od-tyt__rail" role="radiogroup" aria-label="Competencia">
            {TYT_COMPETENCIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={c.key === competency}
                className="od-tyt__competency"
                onClick={() => set({ tyt: c.key === "lc" ? "" : c.key })}
              >
                <span className="od-tyt__code" aria-hidden="true">
                  {c.code}
                </span>
                <span className="od-tyt__names">
                  <strong>{c.label}</strong>
                  <small>{isPaired(c.key) ? `${c.entry} → ${c.exit}` : c.entry ? "solo en Saber 11" : "solo en Saber TyT"}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="od-tyt__filters">
            <label className="od-select">
              <span>Programa</span>
              <select value={program} onChange={(e) => set({ "tyt-programa": e.target.value })}>
                <option value="">Todos los programas</option>
                {programs.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="od-select">
              <span>Año de la prueba</span>
              <select value={year ?? ""} onChange={(e) => set({ "tyt-anio": e.target.value })}>
                <option value="">Todos los años</option>
                {[...years].reverse().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <span className="od-tyt__level">{TYT_LEVEL_LABEL.tecnologico} · nivel SNIES</span>
          </div>

          <Arrivals figure={figure} competency={competency} scope={scope} when={when} />
        </div>

        {figure ? (
          <>
            {view === "perfil" && (
              <ChartFrame title={`Perfil de entrada y salida · ${scope}`} subtitle={`Percentil por competencia · ${when}`} source={data.source} exportName="motor-beta-perfil">
                <Profile data={data} year={year} filter={filter} />
              </ChartFrame>
            )}
            {view === "dispersion" && (
              <ChartFrame title={`Dispersión de valor agregado · ${info.label}`} subtitle={`Entrada frente a salida, en percentil · ${when}`} source={data.source} exportName="motor-beta-dispersion">
                <Scatter data={data} competency={competency} year={year} filter={filter} figure={figure} />
              </ChartFrame>
            )}
            {view === "transito" && (
              <ChartFrame title={`Tránsito entre cuartos · ${info.label}`} subtitle={`De dónde salieron los que entraron en cada cuarto · ${scope} · ${when}`} source={data.source} exportName="motor-beta-transito">
                <Transit figure={figure} />
              </ChartFrame>
            )}
            {view === "valor" && (
              <ChartFrame title={`Valor agregado por programa · ${info.label}`} subtitle={`Percentil de salida menos percentil de entrada · ${when}`} source={data.source} exportName="motor-beta-vai">
                <ValueBars data={data} competency={competency} year={year} />
              </ChartFrame>
            )}
          </>
        ) : (
          <p className="od-tyt__empty">Sin resultados de {info.label.toLowerCase()} para este corte.</p>
        )}

        <Method note={data.note} />
      </div>
    </section>
  );
}

/* --- Llegadas ------------------------------------------------------------------- */

function Arrivals({ figure, competency, scope, when }: { figure: TytFigure | null; competency: TytCompetency; scope: string; when: string }) {
  const info = tytInfo(competency);
  if (!figure) return <p className="od-tyt__empty">Sin resultados para este corte.</p>;
  const paired = Object.values(figure.transitions).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
  return (
    <dl className="od-tyt__arrivals">
      <div className="od-tyt__arrival">
        <dt>Entrada · {info.entry || "sin prueba de entrada"}</dt>
        <dd>
          <SplitFlap value={figure.meanEntry === null ? "—" : integer.format(Math.round(figure.meanEntry))} size="lg" numeric label={figure.meanEntry === null ? "Sin entrada" : `Percentil ${decimal.format(figure.meanEntry)}`} />
          <span className="od-tyt__unit" aria-hidden="true">
            pctl
          </span>
          <span className="od-tyt__sub">{figure.rawEntry !== null ? `${decimal.format(figure.rawEntry)} puntos en la escala del Saber 11` : "Sin puntaje de entrada"}</span>
        </dd>
      </div>
      <div className="od-tyt__arrival">
        <dt>Salida · {info.exit || "sin prueba de salida"}</dt>
        <dd>
          <SplitFlap value={figure.meanExit === null ? "—" : integer.format(Math.round(figure.meanExit))} size="lg" numeric delay={90} label={figure.meanExit === null ? "Sin salida" : `Percentil ${decimal.format(figure.meanExit)}`} />
          <span className="od-tyt__unit" aria-hidden="true">
            pctl
          </span>
          <span className="od-tyt__sub">{figure.rawExit !== null ? `${decimal.format(figure.rawExit)} puntos en la escala del Saber TyT` : "Sin puntaje de salida"}</span>
        </dd>
      </div>
      <div className="od-tyt__arrival" data-lead>
        <dt>Valor agregado · {scope}</dt>
        <dd>
          <SplitFlap
            value={figure.meanDelta === null ? "—" : `${figure.meanDelta > 0 ? "+" : figure.meanDelta < 0 ? "-" : ""}${integer.format(Math.abs(Math.round(figure.meanDelta)))}`}
            size="lg"
            numeric
            delay={180}
            label={figure.meanDelta === null ? "Sin valor agregado" : `${signed(figure.meanDelta)} puntos de percentil`}
          />
          <span className="od-tyt__sub">
            {figure.improvedShare === null
              ? `Sin pareja de pruebas en ${when}`
              : `${pct(figure.improvedShare)} de ${integer.format(paired)} evaluados subió de percentil`}
          </span>
        </dd>
      </div>
    </dl>
  );
}

/* --- Perfil: los dos polígonos ------------------------------------------------------ */

function Profile({ data, year, filter }: { data: SaberTytData; year: number | null; filter: TytFilter }) {
  const t = useChartTokens();
  const reduced = usePrefersReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap, 720);
  const axes = TYT_COMPETENCIES.filter((c) => isPaired(c.key))
    .map((c) => {
      const figure = tytFigure(data, c.key, year, filter);
      return figure && figure.meanEntry !== null && figure.meanExit !== null
        ? { eje: c.label, "Saber 11": figure.meanEntry, "Saber TyT": figure.meanExit, delta: figure.meanExit - figure.meanEntry }
        : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  if (axes.length < 3) return <p className="od-tyt__empty">Hacen falta al menos tres competencias con las dos pruebas para dibujar el perfil.</p>;

  return (
    <div className="od-tyt__profile" ref={wrap}>
      <div className="od-tyt__profile-plot">
        <ul className="od-tyt__legend" aria-label="Leyenda">
          <li>
            <i style={{ background: t.cats[3] }} aria-hidden="true" /> Entrada · Saber 11
          </li>
          <li>
            <i style={{ background: t.cats[0] }} aria-hidden="true" /> Salida · Saber TyT
          </li>
        </ul>
        <Radar
          width={Math.min(Math.max(320, width * 0.52), 520)}
          height={380}
          data={axes}
          keys={["Saber 11", "Saber TyT"]}
          indexBy="eje"
          maxValue={100}
          margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
          gridShape="circular"
          gridLevels={4}
          colors={[t.cats[3], t.cats[0]]}
          fillOpacity={0.16}
          borderWidth={2}
          dotSize={7}
          dotBorderWidth={2}
          dotColor={t.surface}
          dotBorderColor={{ from: "color" }}
          valueFormat={(v) => `percentil ${decimal.format(v)}`}
          theme={nivoTheme(t)}
          animate={!reduced}
        />
      </div>
      <table className="od-tyt__table">
        <caption>Percentil medio por competencia</caption>
        <thead>
          <tr>
            <th scope="col">Competencia</th>
            <th scope="col">Entrada</th>
            <th scope="col">Salida</th>
            <th scope="col">Valor agregado</th>
          </tr>
        </thead>
        <tbody>
          {axes.map((a) => (
            <tr key={a.eje}>
              <th scope="row">{a.eje}</th>
              <td>{decimal.format(a["Saber 11"])}</td>
              <td>{decimal.format(a["Saber TyT"])}</td>
              <td data-tone={a.delta > 0 ? "up" : a.delta < 0 ? "down" : undefined}>{signed(a.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Dispersión: la diagonal de 45° --------------------------------------------------- */

type ScatterMode = "programas" | "nube";

function Scatter({
  data,
  competency,
  year,
  filter,
  figure,
}: {
  data: SaberTytData;
  competency: TytCompetency;
  year: number | null;
  filter: TytFilter;
  figure: TytFigure;
}) {
  const t = useChartTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const width = Math.max(320, useWidth(wrap, 720));
  const [mode, setMode] = useState<ScatterMode>("programas");
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  const programs = tytPrograms(data)
    .map((p) => {
      const at = tytFigure(data, competency, year, { program: p.name });
      const pairs = at ? Object.values(at.transitions).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0) : 0;
      return at && at.meanEntry !== null && at.meanExit !== null && pairs > 0 ? { name: p.name, entry: at.meanEntry, exit: at.meanExit, pairs } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const cloud = scatterPoints(figure);
  const maxCount = Math.max(1, ...cloud.map((p) => p.count));
  const maxPairs = Math.max(1, ...programs.map((p) => p.pairs));

  const size = Math.min(width, 620);
  const M = { top: 16, right: 16, bottom: 44, left: 52 };
  const plot = size - M.left - M.right;
  const x = (v: number) => M.left + (v / 100) * plot;
  const y = (v: number) => M.top + plot - (v / 100) * plot;
  const height = M.top + plot + M.bottom;
  const ticks = [0, 25, 50, 75, 100];
  const show = (event: MouseEvent<SVGElement>, title: string, lines: string[]) => {
    const host = wrap.current?.getBoundingClientRect();
    const box = (event.currentTarget as SVGGraphicsElement).getBoundingClientRect();
    if (host) setTip({ x: box.left - host.left + box.width / 2, y: box.top - host.top, title, lines });
  };

  return (
    <div className="od-tyt__scatter" ref={wrap}>
      <div className="od-tyt__scatter-head">
        <ViewSwitch
          label="Qué se dibuja"
          value={mode}
          onChange={setMode}
          options={[
            { value: "programas", label: "Por programa" },
            { value: "nube", label: "Nube de evaluados" },
          ]}
        />
        <ul className="od-tyt__legend" aria-label="Leyenda">
          <li>
            <i style={{ background: t.pos }} aria-hidden="true" /> Sobre la diagonal: la salida supera a la entrada
          </li>
          <li>
            <i style={{ background: t.neg }} aria-hidden="true" /> Bajo la diagonal
          </li>
        </ul>
      </div>
      <div className="od-tyt__canvas">
        <svg width={size} height={height} role="img" aria-label="Dispersión de percentil de entrada frente a percentil de salida, con la diagonal de igualdad">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={M.top} y2={M.top + plot} style={{ stroke: t.line }} />
              <line x1={M.left} x2={M.left + plot} y1={y(v)} y2={y(v)} style={{ stroke: t.line }} />
              <text x={x(v)} y={M.top + plot + 18} textAnchor="middle" className="od-tyt__tick">
                {v}
              </text>
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="od-tyt__tick">
                {v}
              </text>
            </g>
          ))}
          <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} className="od-tyt__diagonal" style={{ stroke: t.ink }} />
          <text x={x(100) - 6} y={y(100) + 16} textAnchor="end" className="od-tyt__tick">
            igual posición
          </text>

          {mode === "nube" &&
            cloud.map((p) => (
              <circle
                key={`${p.entry}-${p.exit}`}
                cx={x(p.entry + 2.5)}
                cy={y(p.exit + 2.5)}
                r={4 + (p.count / maxCount) * 12}
                className="od-tyt__dot"
                style={{ fill: p.above ? t.pos : t.neg }}
                onMouseEnter={(e) => show(e, `Entrada ${p.entry}–${p.entry + 5} · salida ${p.exit}–${p.exit + 5}`, [`${integer.format(p.count)} ${p.count === 1 ? "evaluado" : "evaluados"}`])}
                onMouseLeave={() => setTip(null)}
              />
            ))}

          {mode === "programas" &&
            programs.map((p) => (
              <g key={p.name}>
                <circle
                  cx={x(p.entry)}
                  cy={y(p.exit)}
                  r={5 + (p.pairs / maxPairs) * 10}
                  className="od-tyt__dot"
                  data-few={p.pairs < FEW || undefined}
                  style={{ fill: p.exit > p.entry ? t.pos : t.neg }}
                  onMouseEnter={(e) =>
                    show(e, p.name, [
                      `Entrada percentil ${decimal.format(p.entry)}`,
                      `Salida percentil ${decimal.format(p.exit)}`,
                      `Valor agregado ${signed(p.exit - p.entry)}`,
                      `${integer.format(p.pairs)} evaluados con las dos pruebas${p.pairs < FEW ? " · pocos para comparar" : ""}`,
                    ])
                  }
                  onMouseLeave={() => setTip(null)}
                />
              </g>
            ))}
          <text x={M.left + plot / 2} y={height - 6} textAnchor="middle" className="od-tyt__axis">
            Percentil de entrada · Saber 11
          </text>
          <text transform={`rotate(-90 12 ${M.top + plot / 2})`} x={12} y={M.top + plot / 2} textAnchor="middle" className="od-tyt__axis">
            Percentil de salida · Saber TyT
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
      {mode === "programas" ? (
        <p className="od-tyt__note">
          Cada punto es un programa; su tamaño, cuántos evaluados tienen las dos pruebas. {filter.program ? "El filtro de programa no cambia esta vista: siempre muestra todos." : ""}
        </p>
      ) : (
        <p className="od-tyt__note">Cada burbuja reúne a los evaluados de una celda de 5 percentiles: la nube muestra la forma, nunca a una persona.</p>
      )}
    </div>
  );
}

/* --- Tránsito entre cuartos ------------------------------------------------------------ */

function Transit({ figure }: { figure: TytFigure }) {
  const rows = transitionShares(figure).filter((r) => r.total > 0);
  if (!rows.length) return <p className="od-tyt__empty">Sin evaluados con las dos pruebas en este corte.</p>;
  const tone = ["var(--od-seq-2)", "var(--od-seq-4)", "var(--od-seq-5)", "var(--od-seq-7)"];
  const ink = ["var(--od-seq-ink-light)", "var(--od-seq-ink-light)", "var(--od-seq-ink-dark)", "var(--od-seq-ink-dark)"];
  const low = rows.find((r) => r.from === "1");
  const lift = low ? (low.to[2].count + low.to[3].count) / (low.total || 1) : null;

  return (
    <div className="od-tyt__transit">
      <ul className="od-tyt__legend" aria-label="Cuarto de salida">
        {["1", "2", "3", "4"].map((q, i) => (
          <li key={q}>
            <i style={{ background: tone[i] }} aria-hidden="true" /> Salió en el {QUARTER_LABEL[q].toLowerCase()}
          </li>
        ))}
      </ul>
      <ol className="od-tyt__bars">
        {rows.map((row) => (
          <li key={row.from}>
            <span className="od-tyt__bar-label">
              {QUARTER_LABEL[row.from]}
              <small>{integer.format(row.total)} evaluados</small>
            </span>
            <span className="od-tyt__bar">
              {row.to.map((cellValue, i) =>
                cellValue.share && cellValue.share > 0 ? (
                  <span
                    key={cellValue.to}
                    style={{ width: `${cellValue.share}%`, background: tone[i], color: ink[i] } as CSSProperties}
                    title={`${QUARTER_LABEL[row.from]} → ${QUARTER_LABEL[cellValue.to]}: ${integer.format(cellValue.count)}`}
                  >
                    {cellValue.share >= 9 ? pct(cellValue.share) : ""}
                  </span>
                ) : null,
              )}
            </span>
          </li>
        ))}
      </ol>
      {lift !== null && (
        <p className="od-tyt__read">
          De cada diez que entraron en el cuarto más bajo, <strong>{decimal.format(lift * 10)}</strong> salieron en los dos cuartos altos.
        </p>
      )}
      <table className="od-tyt__table">
        <caption>Evaluados por cuarto de entrada y de salida</caption>
        <thead>
          <tr>
            <th scope="col">Entrada \ salida</th>
            {["1", "2", "3", "4"].map((q) => (
              <th key={q} scope="col">
                {QUARTER_LABEL[q]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.from}>
              <th scope="row">{QUARTER_LABEL[row.from]}</th>
              {row.to.map((cellValue) => (
                <td key={cellValue.to}>{integer.format(cellValue.count)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Valor agregado por programa -------------------------------------------------------- */

function ValueBars({ data, competency, year }: { data: SaberTytData; competency: TytCompetency; year: number | null }) {
  const t = useChartTokens();
  const rows = tytPrograms(data)
    .map((p) => {
      const figure = tytFigure(data, competency, year, { program: p.name });
      const pairs = figure ? Object.values(figure.transitions).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0) : 0;
      return figure && figure.meanDelta !== null && pairs > 0 ? { name: p.name, delta: figure.meanDelta, pairs } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.delta - a.delta);
  if (!rows.length) return <p className="od-tyt__empty">Sin programas con las dos pruebas en este corte.</p>;
  const max = Math.max(10, ...rows.map((r) => Math.abs(r.delta)));

  return (
    <div className="od-tyt__value">
      <ol className="od-tyt__value-rows">
        {rows.map((row) => {
          const half = (Math.abs(row.delta) / max) * 50;
          return (
            <li key={row.name} data-few={row.pairs < FEW || undefined}>
              <span className="od-tyt__value-name">{row.name}</span>
              <span className="od-tyt__value-track">
                <span
                  className="od-tyt__value-bar"
                  style={{
                    left: row.delta >= 0 ? "50%" : `${50 - half}%`,
                    width: `${half}%`,
                    background: row.delta >= 0 ? t.pos : t.neg,
                  }}
                />
              </span>
              <span className="od-tyt__value-figure">
                <strong>{signed(row.delta)}</strong>
                <small>{integer.format(row.pairs)} eval.</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="od-tyt__note">
        Puntos de percentil que gana o pierde cada programa entre la entrada y la salida. En tinta tenue, los programas con menos de {FEW} evaluados con las dos pruebas.
      </p>
    </div>
  );
}

/* --- Cómo funciona el motor --------------------------------------------------------------- */

function Method({ note }: { note: string }) {
  return (
    <section className="od-tyt__method" aria-labelledby="od-tyt-metodo">
      <h3 id="od-tyt-metodo">Cómo funciona el Motor Beta</h3>
      <ol>
        <li>
          <strong>Rango percentil.</strong> Las dos pruebas no se pueden comparar en puntos: Saber 11 califica cada módulo de 0 a 100 y su
          global de 0 a 500; Saber TyT, de 0 a 200. Cada puntaje se traduce a su percentil dentro de la cohorte histórica de la
          universidad en esa prueba: 0 es el resultado más bajo del grupo y 100 el más alto.
        </li>
        <li>
          <strong>Homologación de competencias.</strong> Se emparejan las que miden lo mismo: matemáticas con razonamiento cuantitativo,
          sociales y ciudadanas con competencias ciudadanas, y lectura crítica e inglés con su par. Comunicación escrita solo existe a la
          salida y ciencias naturales solo a la entrada: se muestran, pero no se comparan.
        </li>
        <li>
          <strong>Valor agregado.</strong> Es la resta: percentil de salida menos percentil de entrada. Quien entró en el percentil 30 y
          salió en el 60 aporta +30, aunque su puntaje no sea el más alto del país. El del grupo es el promedio de sus evaluados con las
          dos pruebas.
        </li>
        <li>
          <strong>Tránsito.</strong> Cada evaluado entra y sale en un cuarto de la distribución. La vista de tránsito cuenta cuántos
          pasaron de cada cuarto de entrada a cada uno de salida; la dispersión los sitúa frente a la diagonal de igualdad.
        </li>
      </ol>
      <p className="od-tyt__caveat">
        <strong>Cómo no leerlo.</strong> La referencia es la propia cohorte de la universidad, así que el promedio institucional siempre
        queda en la mitad de la escala y el valor agregado del conjunto ronda el cero: lo que el motor compara son los programas y los
        años entre sí, no la universidad frente al país. Tampoco es una equivalencia entre pruebas: dice en qué posición quedó cada quien
        dentro de cada una. Con las tablas de percentiles nacionales del ICFES, el mismo motor puede cambiar la referencia y responder
        también esa pregunta.
      </p>
      {note && <p className="od-tyt__note">{note}</p>}
    </section>
  );
}
