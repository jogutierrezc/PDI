/* =============================================================================
   Resultados Saber PRO en la ficha.

   Todo gira alrededor de una competencia. El carril de arriba la elige (global,
   lectura crítica, razonamiento cuantitativo, ciudadanas, comunicación escrita,
   inglés) y al cambiarla las cifras de llegada voltean en ola; los filtros de
   sede, facultad y programa recortan todo lo de abajo. Competencia, vista y
   filtros viajan en la URL: el enlace comparte exactamente lo que se ve.

   Tres vistas del mismo corte:
   · Niveles (escalera): por año, cuántos evaluados quedaron en cada nivel de
     desempeño. Las barras se anclan en el umbral de desempeño alto (nivel 3;
     B1 en inglés): lo que queda por debajo crece a la izquierda en terracota,
     lo que lo supera a la derecha en azul. Si la masa se corre a la derecha
     año tras año, más estudiantes llegan arriba. El puntaje global no tiene
     niveles: la vista muestra el reparto del puntaje, partido en la línea del
     promedio nacional.
   · Brecha con el país: sede y programa por año, cada casilla es la distancia
     en puntos al promedio nacional de esa competencia.
   · Evolución: el promedio del corte frente al nacional.

   Un vacío no es un cero: un año sin evaluados se dibuja rayado. Con pocos
   evaluados la cifra se muestra, pero se advierte que cambia mucho de un año
   a otro.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SABER_COMPETENCIES,
  SABER_FEW_LEVELS,
  SABER_FEW_MEAN,
  SABER_GAP_LEGEND,
  competencyInfo,
  highShare,
  levelScale,
  saberCatalog,
  saberFigure,
  saberGapRows,
  saberGapTone,
  saberLevelTone,
  saberYears,
} from "../data/saber-pro";
import type { SaberCompetency, SaberFigure, SaberFilter, SaberLevelScale, SaberProData } from "../data/saber-pro";
import { ChartFrame, ChartTooltip, ViewSwitch } from "./ChartFrame";
import type { CsvSource } from "./CsvAction";
import { LineChart } from "./LineChart";
import { useInView, usePrefersReducedMotion } from "./motion";
import { SplitFlap } from "./SplitFlap";
import "./saber-pro.css";

type SaberView = "niveles" | "brecha" | "evolucion";

const VIEWS: { value: SaberView; label: string }[] = [
  { value: "niveles", label: "Niveles" },
  { value: "brecha", label: "Brecha con el país" },
  { value: "evolucion", label: "Evolución" },
];

const FEW = SABER_FEW_LEVELS;
const FEW_MEAN = SABER_FEW_MEAN;

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = (share: number) => `${integer.format(Math.round(share))} %`;
const points = (n: number) => `${integer.format(Math.abs(Math.round(n)))} ${Math.abs(Math.round(n)) === 1 ? "punto" : "puntos"}`;
const signed = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};

/** Diferencia con el país dicha en palabras. */
const gapWords = (gap: number) =>
  Math.round(gap) === 0 ? "igual al promedio del país" : `${points(gap)} ${gap > 0 ? "sobre" : "bajo"} el país`;

/* --- Estado en la URL ----------------------------------------------------------- */

function useSaberState(data: SaberProData) {
  const [params, setParams] = useSearchParams();
  const catalog = useMemo(() => saberCatalog(data), [data]);
  const read = (key: string) => params.get(key) ?? "";

  const rawCompetency = read("sp") as SaberCompetency;
  const competency = SABER_COMPETENCIES.some((c) => c.key === rawCompetency) ? rawCompetency : "global";
  const rawView = read("sp-vista") as SaberView;
  const view = VIEWS.some((v) => v.value === rawView) ? rawView : "niveles";

  const campus = catalog.campuses.includes(read("sp-sede")) ? read("sp-sede") : "";
  const faculties = catalog.faculties.filter((f) => !campus || f.programs.some((p) => p.campuses.includes(campus)));
  const faculty = faculties.some((f) => f.name === read("sp-facultad")) ? read("sp-facultad") : "";
  // Un programa es de una sede: Derecho de Cúcuta y Derecho de Valledupar son
  // programas distintos (otro código SNIES) y nunca se suman entre sí.
  const programs = faculties
    .filter((f) => !faculty || f.name === faculty)
    .flatMap((f) =>
      f.programs.flatMap((p) =>
        p.campuses.filter((c) => !campus || c === campus).map((c) => ({ name: p.name, campus: c, faculty: f.name })),
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.campus.localeCompare(b.campus, "es"));
  const program = campus && programs.some((p) => p.name === read("sp-programa")) ? read("sp-programa") : "";

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

  const filter: SaberFilter = { campus: campus || undefined, faculty: faculty || undefined, program: program || undefined };
  return { catalog, competency, view, campus, faculty, program, faculties, programs, filter, set };
}

/** Cómo se llama el corte: "Medicina · Cúcuta", "Ciencias Sociales", "UDES". */
function scopeName(filter: SaberFilter) {
  if (filter.program) return filter.campus ? `${filter.program} · ${filter.campus}` : filter.program;
  if (filter.faculty) return filter.campus ? `${filter.faculty} · ${filter.campus}` : filter.faculty;
  if (filter.campus) return `UDES ${filter.campus}`;
  return "UDES";
}

/* --- Bloque --------------------------------------------------------------------- */

export function SaberProBlock({ data, anchor, title, csv }: { data: SaberProData; anchor: string; title?: string; csv?: CsvSource }) {
  const state = useSaberState(data);
  const { competency, view, filter, set } = state;
  const years = useMemo(() => saberYears(data), [data]);
  const info = competencyInfo(competency);

  const figures = useMemo(
    () => years.map((year) => saberFigure(data, competency, year, filter)),
    // El filtro se reconstruye en cada render; sus tres cadenas son la identidad real.
    [data, competency, years, filter.campus, filter.faculty, filter.program],
  );
  const latest = [...figures].reverse().find((f): f is SaberFigure => f !== null) ?? null;
  const name = scopeName(filter);
  const filtered = Boolean(filter.campus || filter.faculty || filter.program);

  if (years.length === 0) return null;

  return (
    <section className="od-section od-saber" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id={anchor}>{title || data.title}</h2>
            {data.description && <p>{data.description}</p>}
          </div>
          <ViewSwitch label="Vista de los resultados" value={view} onChange={(v) => set({ "sp-vista": v === "niveles" ? "" : v })} options={VIEWS} />
        </header>

        <div className="od-saber__board">
          <div className="od-saber__rail" role="radiogroup" aria-label="Competencia">
            {SABER_COMPETENCIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={c.key === competency}
                className="od-saber__competency"
                onClick={() => set({ sp: c.key === "global" ? "" : c.key })}
              >
                <span className="od-saber__code" aria-hidden="true">
                  {c.code}
                </span>
                <span className="od-saber__label">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="od-saber__filters">
            <label className="od-select">
              <span>Sede</span>
              <select value={state.campus} onChange={(e) => set({ "sp-sede": e.target.value, "sp-programa": "" })}>
                <option value="">Todas las sedes</option>
                {state.catalog.campuses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="od-select">
              <span>Facultad</span>
              <select value={state.faculty} onChange={(e) => set({ "sp-facultad": e.target.value, "sp-programa": "" })}>
                <option value="">Todas las facultades</option>
                {state.faculties.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="od-select">
              <span>Programa</span>
              <select
                value={state.program ? `${state.campus}|${state.program}` : ""}
                onChange={(e) => {
                  const [campus, ...name] = e.target.value.split("|");
                  set(e.target.value ? { "sp-sede": campus, "sp-programa": name.join("|") } : { "sp-programa": "" });
                }}
              >
                <option value="">Todos los programas</option>
                {state.programs.map((p) => (
                  <option key={`${p.campus}|${p.faculty}|${p.name}`} value={`${p.campus}|${p.name}`}>
                    {state.campus ? p.name : `${p.name} · ${p.campus}`}
                  </option>
                ))}
              </select>
            </label>
            {filtered && (
              <button type="button" className="od-saber__clear" onClick={() => set({ "sp-sede": "", "sp-facultad": "", "sp-programa": "" })}>
                Ver toda la UDES
              </button>
            )}
          </div>

          <Arrivals figure={latest} figures={figures} competency={competency} name={name} />
        </div>

        {view === "niveles" && (
          <ChartFrame
            title={levelScale(competency) ? `Niveles de desempeño · ${info.label}` : "Reparto del puntaje global"}
            subtitle={`${name} · ${years[0]}–${years[years.length - 1]}`}
            source={data.source}
            exportName={`saber-pro-niveles-${competency}`}
            csv={csv}
          >
            {levelScale(competency) ? (
              <LevelLadder key={competency} figures={figures} scale={levelScale(competency)!} competency={competency} years={years} />
            ) : (
              <ScoreRidges figures={figures} years={years} />
            )}
          </ChartFrame>
        )}
        {view === "brecha" && (
          <ChartFrame
            title={`Brecha con el promedio nacional · ${info.label}`}
            subtitle="Puntos sobre o bajo el país, por sede y programa"
            source={data.source}
            exportName={`saber-pro-brecha-${competency}`}
            csv={csv}
          >
            <GapMatrix data={data} competency={competency} years={years} filter={filter} />
          </ChartFrame>
        )}
        {view === "evolucion" && (
          <ChartFrame title={`Promedio · ${info.label}`} subtitle={`${name} frente al país`} source={data.source} exportName={`saber-pro-evolucion-${competency}`} csv={csv}>
            <LineChart
              label={`Promedio de ${info.label} de ${name} y promedio nacional por año`}
              years={years}
              format="decimal"
              unit="puntos"
              selectedYear={latest?.year ?? years[years.length - 1]}
              series={[
                { id: "udes", label: name, color: "var(--od-series-1)", values: figures.map((f) => f?.shown ?? null) },
                { id: "nacional", label: "Promedio nacional", color: "var(--od-series-total)", dashed: true, values: figures.map((f) => f?.national ?? null) },
              ]}
            />
          </ChartFrame>
        )}

        {data.note && <p className="od-saber__note">{data.note}</p>}
      </div>
    </section>
  );
}

/* --- Llegadas: las cifras del último corte --------------------------------------- */

function Arrivals({
  figure,
  figures,
  competency,
  name,
}: {
  figure: SaberFigure | null;
  figures: (SaberFigure | null)[];
  competency: SaberCompetency;
  name: string;
}) {
  if (!figure) {
    return <p className="od-saber__empty">Sin evaluados de {name} en {competencyInfo(competency).label.toLowerCase()}.</p>;
  }
  const scale = levelScale(competency);
  const gap = figure.shown !== null && figure.national !== null ? figure.shown - figure.national : null;
  // Un año puede traer solo el promedio oficial, sin resultados por evaluado:
  // los niveles salen del último año que sí los tiene.
  const leveled = [...figures].reverse().find((f): f is SaberFigure => f !== null && f.leveled > 0) ?? null;
  const share = highShare(leveled, competency);
  const first = leveled ? figures.find((f) => f !== null && highShare(f, competency) !== null && f.year < leveled.year) ?? null : null;
  const firstShare = highShare(first, competency);
  const drift = share !== null && firstShare !== null ? share - firstShare : null;
  const tone = (n: number) => (Math.round(n) > 0 ? "up" : Math.round(n) < 0 ? "down" : "same");

  return (
    <dl className="od-saber__arrivals">
      <div className="od-saber__arrival">
        <dt>
          Promedio {name} · {figure.year}
        </dt>
        <dd>
          <SplitFlap value={figure.shown === null ? "—" : integer.format(Math.round(figure.shown))} size="lg" numeric label={figure.shown === null ? "Sin promedio" : `${decimal.format(figure.shown)} puntos`} />
          <span className="od-saber__sub">
            {figure.official !== null
              ? "Promedio oficial del ICFES"
              : `${integer.format(figure.evaluated)} evaluados${figure.evaluated < FEW ? " · pocos para comparar" : ""}`}
          </span>
        </dd>
      </div>
      <div className="od-saber__arrival">
        <dt>Promedio nacional · {figure.year}</dt>
        <dd>
          <SplitFlap value={figure.national === null ? "—" : integer.format(Math.round(figure.national))} size="lg" numeric delay={90} label={figure.national === null ? "Sin referencia nacional" : `${integer.format(figure.national)} puntos`} />
          {gap !== null ? (
            <span className="od-saber__gap" data-tone={tone(gap)}>
              <Glyph tone={tone(gap)} />
              {gapWords(gap)}
            </span>
          ) : (
            <span className="od-saber__sub">Sin referencia nacional ese año</span>
          )}
        </dd>
      </div>
      {scale && leveled && (
        <div className="od-saber__arrival">
          <dt>En {scale.highLabel} · {leveled.year}</dt>
          <dd>
            <SplitFlap value={share === null ? "—" : String(Math.round(share))} size="lg" numeric delay={180} label={share === null ? "Sin niveles" : percent(share)} />
            {share !== null && <span className="od-saber__unit" aria-hidden="true">%</span>}
            {drift !== null && first ? (
              <span className="od-saber__gap" data-tone={tone(drift)}>
                <Glyph tone={tone(drift)} />
                {Math.round(drift) === 0
                  ? `igual que en ${first.year}`
                  : `${Math.round(drift) > 0 ? "sube" : "baja"} ${integer.format(Math.abs(Math.round(drift)))} p. p. desde ${first.year}`}
              </span>
            ) : (
              <span className="od-saber__sub">de {integer.format(leveled.leveled)} evaluados con nivel</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Glyph({ tone }: { tone: "up" | "down" | "same" }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d={tone === "up" ? "M5 1.5 9 7.5H1z" : tone === "down" ? "M5 8.5 9 2.5H1z" : "M1 4.2h8v1.6H1z"} />
    </svg>
  );
}

/* --- Tooltip compartido ---------------------------------------------------------- */

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function useTip<T extends HTMLElement>() {
  const box = useRef<T>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, title: string, lines: string[]) => {
    const host = box.current?.getBoundingClientRect();
    const target = event.currentTarget.getBoundingClientRect();
    if (!host) return;
    setTip({ x: target.left - host.left + target.width / 2, y: target.top - host.top, title, lines });
  };
  const hide = () => setTip(null);
  const view = tip && (
    <ChartTooltip x={tip.x} y={tip.y}>
      <strong>{tip.title}</strong>
      {tip.lines.map((line) => (
        <em key={line}>{line}</em>
      ))}
    </ChartTooltip>
  );
  return { box, show, hide, view };
}

/* --- Niveles: la escalera ----------------------------------------------------------- */

const levelTone = saberLevelTone;

function LevelLadder({
  figures,
  scale,
  competency,
  years,
}: {
  figures: (SaberFigure | null)[];
  scale: SaberLevelScale;
  competency: SaberCompetency;
  years: number[];
}) {
  const { box, show, hide, view } = useTip<HTMLDivElement>();
  const seen = useInView(box);
  const reduced = usePrefersReducedMotion();

  const rows = years.flatMap((year, i) => {
    const figure = figures[i];
    // Un año con solo el promedio oficial no tiene reparto que dibujar.
    if (figure && figure.evaluated === 0) return [];
    const total = figure?.leveled ?? 0;
    const shares = scale.keys.map((key) => (total ? ((figure!.levels[key] ?? 0) / total) * 100 : 0));
    const low = shares.slice(0, scale.high).reduce((a, b) => a + b, 0);
    return [{ year, figure: total ? figure : null, total, shares, low, high: total ? 100 - low : 0 }];
  });
  const withData = rows.filter((r) => r.figure);
  if (withData.length === 0) return <p className="od-saber__empty">Sin niveles de desempeño reportados para este corte.</p>;

  // El eje (umbral) se ubica donde quepan la mayor parte baja y la mayor alta de todos los años.
  const maxLow = Math.max(...withData.map((r) => r.low), 1);
  const maxHigh = Math.max(...withData.map((r) => r.high), 1);
  const axis = (maxLow / (maxLow + maxHigh)) * 100;
  // Cada lado mide lo suyo: el tramo es su parte del lado más largo de todos los años.
  const lowWidth = (share: number) => (share / maxLow) * 100;
  const highWidth = (share: number) => (share / maxHigh) * 100;
  const armed = seen || reduced;

  return (
    <div className="od-ladder" ref={box} data-armed={armed || undefined} style={{ "--axis": `${axis}%` } as CSSProperties}>
      <ul className="od-ladder__legend" aria-label="Niveles de desempeño">
        {scale.keys.map((key, i) => (
          <li key={key} data-side={i < scale.high ? "low" : "high"}>
            <i style={{ background: `var(--od-div-${levelTone(i, scale)})` }} aria-hidden="true" />
            {scale.labels[i]}
          </li>
        ))}
      </ul>

      <div className="od-ladder__scale" aria-hidden="true">
        <span>← Bajo {scale.labels[scale.high]}</span>
        <span>{scale.highLabel.charAt(0).toUpperCase() + scale.highLabel.slice(1)} →</span>
      </div>

      <ol className="od-ladder__rows">
        {rows.map((row, rowIndex) => {
          const prev = rows.slice(0, rowIndex).reverse().find((r) => r.figure);
          const change = row.figure && prev ? row.high - prev.high : null;
          return (
            <li key={row.year} className="od-ladder__row" data-empty={!row.figure || undefined} data-few={(row.figure && row.total < FEW) || undefined}>
              <span className="od-ladder__year">{row.year}</span>
              {row.figure ? (
                <span className="od-ladder__bar" style={{ "--delay": `${rowIndex * 45}ms` } as CSSProperties}>
                  <span className="od-ladder__side od-ladder__side--low">
                    {scale.keys.slice(0, scale.high).map((key, i) => ({ key, i })).reverse().map(({ key, i }) => (
                      <Segment key={key} share={row.shares[i]} width={lowWidth(row.shares[i])} tone={levelTone(i, scale)}
                        label={scale.labels[i]} year={row.year} count={row.figure!.levels[key] ?? 0} show={show} hide={hide} />
                    ))}
                  </span>
                  <span className="od-ladder__side od-ladder__side--high">
                    {scale.keys.slice(scale.high).map((key, j) => {
                      const i = j + scale.high;
                      return (
                        <Segment key={key} share={row.shares[i]} width={highWidth(row.shares[i])} tone={levelTone(i, scale)}
                          label={scale.labels[i]} year={row.year} count={row.figure!.levels[key] ?? 0} show={show} hide={hide} />
                      );
                    })}
                  </span>
                </span>
              ) : (
                <span className="od-ladder__none">Sin evaluados con nivel</span>
              )}
              <span className="od-ladder__share">
                {row.figure && (
                  <>
                    <strong>{percent(row.high)}</strong>
                    <small>
                      {change !== null && Math.round(change) !== 0
                        ? `${signed(change)} p. p.`
                        : `${integer.format(row.total)} eval.`}
                    </small>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {view}
      {rows.some((r) => r.figure && r.total < FEW) && (
        <p className="od-ladder__few">Los años en tinta tenue tienen menos de {FEW} evaluados: su reparto cambia mucho de un año a otro.</p>
      )}

      <table className="sr-only">
        <caption>Evaluados por nivel de desempeño en {competencyInfo(competency).label}, por año</caption>
        <thead>
          <tr>
            <th scope="col">Año</th>
            {scale.labels.map((l) => (
              <th key={l} scope="col">
                {l}
              </th>
            ))}
            <th scope="col">En {scale.highLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.figure).map((r) => (
            <tr key={r.year}>
              <th scope="row">{r.year}</th>
              {scale.keys.map((key, i) => (
                <td key={key}>
                  {integer.format(r.figure!.levels[key] ?? 0)} ({percent(r.shares[i])})
                </td>
              ))}
              <td>{percent(r.high)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Segment({
  share,
  width,
  tone,
  label,
  year,
  count,
  show,
  hide,
}: {
  share: number;
  width: number;
  tone: string;
  label: string;
  year: number;
  count: number;
  show: (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, title: string, lines: string[]) => void;
  hide: () => void;
}) {
  if (share <= 0) return null;
  const lines = [`${integer.format(count)} evaluados · ${percent(share)}`];
  return (
    <span
      className="od-ladder__seg"
      style={{ width: `${width}%`, background: `var(--od-div-${tone})`, color: `var(--od-div-${tone}-ink)` } as CSSProperties}
      onMouseEnter={(e) => show(e, `${label} · ${year}`, lines)}
      onMouseLeave={hide}
    >
      {share >= 6 && <span>{integer.format(Math.round(share))}</span>}
    </span>
  );
}

/* --- Puntaje global: el reparto partido en el promedio nacional ------------------------ */

function ScoreRidges({ figures, years }: { figures: (SaberFigure | null)[]; years: number[] }) {
  const { box, show, hide, view } = useTip<HTMLDivElement>();
  const bins = figures.flatMap((f) => (f ? Object.entries(f.histogram).filter(([, n]) => n > 0).map(([b]) => Number(b)) : []));
  if (bins.length === 0) return <p className="od-saber__empty">Sin puntajes reportados para este corte.</p>;
  const lo = Math.max(0, Math.min(...bins) - 10);
  const hi = Math.min(300, Math.max(...bins) + 20);
  const span = hi - lo;
  const at = (score: number) => ((score - lo) / span) * 100;
  const ticks = Array.from({ length: Math.floor(hi / 50) - Math.ceil(lo / 50) + 1 }, (_, i) => (Math.ceil(lo / 50) + i) * 50).filter((t) => t >= lo && t <= hi);

  return (
    <div className="od-ridges" ref={box}>
      <ul className="od-ladder__legend" aria-label="Lectura">
        <li>
          <i style={{ background: "var(--od-div-neg-1)" }} aria-hidden="true" />
          Bajo el promedio nacional
        </li>
        <li>
          <i style={{ background: "var(--od-div-pos-1)" }} aria-hidden="true" />
          Sobre el promedio nacional
        </li>
        <li className="od-ridges__key">
          <i data-mark="udes" aria-hidden="true" />
          Promedio del corte
        </li>
      </ul>
      <ol className="od-ladder__rows">
        {years.map((year, i) => {
          const f = figures[i];
          if (f && f.evaluated === 0) return null;
          const counts = f ? Object.entries(f.histogram).map(([b, n]) => [Number(b), n] as const) : [];
          const peak = Math.max(1, ...counts.map(([, n]) => n));
          const total = counts.reduce((sum, [, n]) => sum + n, 0);
          const national = f?.national ?? null;
          const above = national === null ? null : counts.filter(([b]) => b >= national).reduce((s, [, n]) => s + n, 0);
          return (
            <li key={year} className="od-ladder__row" data-empty={!total || undefined} data-few={(total > 0 && total < FEW) || undefined}>
              <span className="od-ladder__year">{year}</span>
              {total ? (
                <span className="od-ridge">
                  {counts.map(([b, n]) => (
                    <span
                      key={b}
                      className="od-ridge__bin"
                      data-side={national === null ? undefined : b + 10 <= national ? "low" : "high"}
                      style={{ left: `${at(b)}%`, width: `${(10 / span) * 100}%`, height: `${Math.max(4, (n / peak) * 100)}%` }}
                      onMouseEnter={(e) => show(e, `${year} · ${b}–${b + 9} puntos`, [`${integer.format(n)} evaluados`])}
                      onMouseLeave={hide}
                    />
                  ))}
                  {f?.shown !== null && f?.shown !== undefined && <span className="od-ridge__mark" data-mark="udes" style={{ left: `${at(f.shown)}%` }} />}
                  {national !== null && <span className="od-ridge__mark" data-mark="nacional" style={{ left: `${at(national)}%` }} />}
                </span>
              ) : (
                <span className="od-ladder__none">Sin evaluados</span>
              )}
              <span className="od-ladder__share">
                {f && total > 0 && (
                  <>
                    <strong>{f.shown === null ? "—" : integer.format(Math.round(f.shown))}</strong>
                    <small>
                      {above !== null ? `${percent((above / total) * 100)} sobre el país` : `${integer.format(total)} eval.`}
                    </small>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="od-ridges__axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${at(t)}%` }}>
            {t}
          </span>
        ))}
      </div>
      <p className="od-ladder__few">
        Barras: evaluados por tramo de 10 puntos. La línea continua es el promedio del corte; la punteada, el nacional.
        {figures.some((f) => f && f.evaluated > 0 && f.evaluated < FEW) ? ` Los años en tinta tenue tienen menos de ${FEW} evaluados.` : ""}
      </p>
      {view}
      <table className="sr-only">
        <caption>Puntaje global por año: promedio, promedio nacional y evaluados</caption>
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col">Promedio</th>
            <th scope="col">Nacional</th>
            <th scope="col">Evaluados</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year, i) =>
            figures[i] ? (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td>{figures[i]!.shown === null ? "Sin reportar" : decimal.format(figures[i]!.shown!)}</td>
                <td>{figures[i]!.national === null ? "Sin reportar" : decimal.format(figures[i]!.national!)}</td>
                <td>{integer.format(figures[i]!.evaluated)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}

/* --- Brecha con el país ------------------------------------------------------------ */

function gapStyle(gap: number): CSSProperties {
  const tone = saberGapTone(gap);
  return { background: `var(--od-div-${tone})`, color: `var(--od-div-${tone}-ink)` };
}

function GapMatrix({ data, competency, years, filter }: { data: SaberProData; competency: SaberCompetency; years: number[]; filter: SaberFilter }) {
  const { box, show, hide, view } = useTip<HTMLDivElement>();
  const rows = useMemo(() => saberGapRows(data, filter), [data, filter]);

  const nationalByYear = years.map((year) => saberFigure(data, competency, year)?.national ?? null);
  const info = competencyInfo(competency);

  return (
    <div className="od-gap" ref={box}>
      <ul className="od-gap__legend" aria-label="Lectura de la brecha">
        {SABER_GAP_LEGEND.map((step) => (
          <li key={step.tone}>
            <i style={{ background: `var(--od-div-${step.tone})` }} aria-hidden="true" />
            {step.label}
          </li>
        ))}
        <li className="od-gap__legend-few">
          <b aria-hidden="true">12</b> menos de {FEW_MEAN} evaluados
        </li>
        <li className="od-gap__legend-none">
          <b aria-hidden="true" /> sin evaluados
        </li>
      </ul>
      <div className="od-gap__scroll" tabIndex={0} role="region" aria-label={`Brecha con el promedio nacional en ${info.label}, por sede y programa`}>
        <table className="od-gap__table">
          <caption className="sr-only">
            Diferencia en puntos entre el promedio de cada sede y programa y el promedio nacional de {info.label}, por año
          </caption>
          <thead>
            <tr>
              <th scope="col">Sede y programa</th>
              {years.map((year, i) => (
                <th scope="col" key={year}>
                  {year}
                  <small>{nationalByYear[i] === null ? "país —" : `país ${integer.format(Math.round(nationalByYear[i]!))}`}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => [
              row.level === "sede" && index > 0 ? (
                <tr key={`${row.key}-aire`} className="od-gap__spacer" aria-hidden="true">
                  <td colSpan={years.length + 1} />
                </tr>
              ) : null,
              <tr key={row.key} data-level={row.level}>
                <th scope="row">{row.label}</th>
                {years.map((year, i) => {
                  const f = saberFigure(data, competency, year, row.filter);
                  const national = nationalByYear[i];
                  if (!f || f.shown === null || national === null) {
                    const why = !f || f.shown === null ? "Sin evaluados" : "Sin promedio nacional";
                    return (
                      <td key={year} data-empty>
                        <span className="sr-only">{why}</span>
                      </td>
                    );
                  }
                  const gap = f.shown - national;
                  const few = row.level !== "udes" && f.evaluated < FEW_MEAN;
                  const lines = [
                    `Promedio ${decimal.format(f.shown)}${f.official !== null ? " (oficial ICFES)" : ` · ${integer.format(f.evaluated)} evaluados`}`,
                    `País ${integer.format(Math.round(national))} · ${gapWords(gap)}`,
                  ];
                  return (
                    <td
                      key={year}
                      data-few={few || undefined}
                      style={few ? undefined : gapStyle(gap)}
                      onMouseEnter={(e) => show(e, `${row.label} · ${year}`, lines)}
                      onMouseLeave={hide}
                    >
                      <span aria-hidden="true">{signed(gap)}</span>
                      <span className="sr-only">{`${gapWords(gap)}; ${lines[0]}`}</span>
                    </td>
                  );
                })}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      {view}
    </div>
  );
}
