/* =============================================================================
   Tablero de Diversidad, Equidad e Inclusión.

   Un tablero propio para el informe DE, armado con lo que el informe ya
   publica en la base: sus indicadores (grupo especial, étnico, discapacidad,
   víctimas, rural, estratos 1 y 2, cobertura del registro), sus desgloses
   (tipo de discapacidad, pueblo indígena, comunidad negra, estrato, género,
   zona) y su mapa de calor del INES. No trae cifras propias: si una pieza no
   está en el informe, su panel no sale.

   El corte y el campus son los de la ficha: el carril del tablero los mueve
   y todo se reescribe a la vez, como un tablero de llegadas. Sin corte
   elegido («todo el periodo»), el tablero se para en el último.

   · Los desgloses son institucionales. Con un campus elegido lo dicen.
   · Una celda reservada («< 5») no es un cero ni un vacío: se dibuja rayada
     y nunca se dimensiona por su valor.
   · Ningún dato va solo con color: cada tramo lleva su rótulo o su cifra.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { valueOf } from "../data/open-data";
import { ALL_YEARS } from "../data/terms";
import type { Breakdown, BreakdownItem, Campus, CampusId, HeatmapData, Indicator, MapDataset, Report } from "../data/types";
import { ALL_CAMPUSES } from "../data/types";
import { ChartFrame, ChartTooltip, ViewSwitch, niceCeil } from "./ChartFrame";
import { useInView, useWidth } from "./motion";
import { OriginMap } from "./OriginMap";
import { BD, IND, INES_KEY, TERM, cell, cut, familyOf, itemsOf, published, squarify, sumOf, toneOf } from "../data/dei";
import type { Family, Rect } from "../data/dei";
import { SplitFlap } from "./SplitFlap";
import "./diversity-board.css";

/** Las cinco llegadas bajo el titular, en este orden. */
const ARRIVALS: { key: string; short: string }[] = [
  { key: IND.etnico, short: "Pertenencia étnica" },
  { key: IND.victima, short: "Afectados por el conflicto armado" },
  { key: IND.rural, short: "Zona rural" },
  { key: IND.discapacidad, short: "Con discapacidad declarada" },
  { key: IND.estratoBajo, short: "Estratos 1 y 2" },
];

/* --- Formato ---------------------------------------------------------------------- */

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const count = (n: number) => integer.format(n);
const pct = (n: number) => `${decimal.format(n)} %`;
const pctRound = (n: number) => `${integer.format(Math.round(n))} %`;

/** Cifra de un indicador en el formato que declara. */
const figure = (ind: Indicator, value: number) => (ind.format === "porcentaje" ? pct(value) : count(value));

/** "1 de cada 4": solo cuando la fracción se lee redonda. */
function oneIn(share: number): string | null {
  if (share <= 0) return null;
  const n = Math.round(100 / share);
  return n >= 2 && n <= 20 ? `1 de cada ${n}` : null;
}

/* --- Bloque ----------------------------------------------------------------------- */

interface DiversityBoardProps {
  report: Report;
  campuses: Campus[];
  year: number;
  campus: CampusId;
  setYear: (year: number) => void;
  setCampus: (campus: CampusId) => void;
  anchor: string;
  title?: string;
}

export function DiversityBoard({ report, campuses, year, campus, setYear, setCampus, anchor, title }: DiversityBoardProps) {
  const ind = useMemo(() => new Map(report.indicators.map((i) => [i.id, i])), [report]);
  const bd = useMemo(() => new Map(report.breakdowns.map((b) => [b.id, b])), [report]);
  const grupo = ind.get(IND.grupo);

  // Cortes con dato institucional, en orden.
  const years = useMemo(
    () => (grupo?.years ?? []).filter((y) => cell(grupo, y, ALL_CAMPUSES) !== null).sort((a, b) => a - b),
    [grupo],
  );
  if (!grupo || years.length === 0) return null;

  const active = year !== ALL_YEARS && years.includes(year) ? year : years[years.length - 1];
  const previous = years[years.indexOf(active) - 1];
  const sites = campuses.filter((c) => c.id !== ALL_CAMPUSES);
  const siteName = (id: CampusId) => sites.find((c) => c.id === id)?.name ?? id;
  const lens = campus !== ALL_CAMPUSES && sites.some((c) => c.id === campus) ? campus : ALL_CAMPUSES;

  // Base de la proporción: todos los estudiantes con género registrado en el corte.
  const baseOf = (y: number) => {
    const total = sumOf(itemsOf(bd.get(BD.genero), y));
    return total > 0 ? total : null;
  };

  const ines = report.heatmaps?.find((h) => h.id === INES_KEY);
  // Mapa de origen: el primero del informe que va por municipio.
  const origin = report.maps?.find((m) => m.mode === "municipio");
  const originYears = origin ? Object.keys(origin.values).map(Number).filter((y) => y !== ALL_YEARS).sort((a, b) => a - b) : [];

  return (
    <section className="od-section od-dei" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-dei__head">
          <div>
            <h2 id={anchor}>{title || "Tablero de la diversidad"}</h2>
            <p>
              Quiénes integran los grupos de protección constitucional en el segundo periodo de cada año, campus a
              campus. Elige un corte o un campus y el tablero entero se reescribe.
            </p>
          </div>
        </header>

        <div className="od-dei__console">
          <Rail
            label="Corte"
            options={years.map((y) => ({ value: String(y), label: cut(y) }))}
            value={String(active)}
            onChange={(v) => setYear(Number(v))}
          />
          <Rail
            label="Campus"
            options={[{ value: ALL_CAMPUSES, label: "Todos" }, ...sites.map((c) => ({ value: c.id, label: c.name }))]}
            value={lens}
            onChange={(v) => setCampus(v)}
          />
        </div>

        <Arrivals
          grupo={grupo}
          ind={ind}
          year={active}
          previous={previous}
          lens={lens}
          sites={sites}
          siteName={siteName}
          base={baseOf(active)}
        />

        <div className="od-dei__grid">
          <CutColumns
            grupo={grupo}
            years={years}
            active={active}
            lens={lens}
            siteName={siteName}
            baseOf={baseOf}
            onPick={setYear}
          />

          <EthnicMosaic indigena={bd.get(BD.indigena)} negra={bd.get(BD.negra)} year={active} lens={lens} siteName={siteName} />

          <ChartFrame
            className="od-dei__panel od-dei__panel--origin"
            title={origin?.title ?? "De dónde vienen los estudiantes"}
            subtitle={origin?.description || "Calor por departamento de origen y, al acercarse, un punto por municipio con su cifra"}
            source={origin?.source || grupo.source}
            exportName="dei-mapa-origen"
            exportable={originYears.length > 0}
          >
            <OriginMap dataset={origin ?? PENDING_ORIGIN} year={active} years={originYears} campus={lens} campuses={campuses} />
          </ChartFrame>

          <Disability
            tipo={bd.get(BD.tipoDiscapacidad)}
            cobertura={ind.get(IND.cobertura)}
            years={years}
            year={active}
            lens={lens}
            siteName={siteName}
          />

          <StrataSpectrum estrato={bd.get(BD.estrato)} bajo={ind.get(IND.estratoBajo)} years={years} year={active} lens={lens} sites={sites} siteName={siteName} />

          <Splits genero={bd.get(BD.genero)} zona={bd.get(BD.zona)} years={years} year={active} lens={lens} siteName={siteName} />

          {ines && <InesDots data={ines} />}
        </div>
      </div>
    </section>
  );
}

/** Mapa sin cifras: el panel se dibuja igual y dice que está pendiente. */
const PENDING_ORIGIN: MapDataset = {
  id: "origen-municipio",
  title: "De dónde vienen los estudiantes",
  description: "",
  mode: "municipio",
  unit: "estudiantes",
  source: "",
  values: {},
};

/* --- Carril de corte y campus ----------------------------------------------------- */

function Rail({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="od-dei__rail" role="radiogroup" aria-label={label}>
      <span className="od-dei__rail-label" aria-hidden="true">
        {label}
      </span>
      <span className="od-dei__rail-track">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className="od-dei__stop"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Cómo se dice el ámbito en los subtítulos. */
const scope = (lens: CampusId, siteName: (id: CampusId) => string) => (lens === ALL_CAMPUSES ? "Todos los campus" : siteName(lens));

/** Aviso de los desgloses, que solo existen para la institución. */
function InstitutionalNote({ lens, siteName }: { lens: CampusId; siteName: (id: CampusId) => string }) {
  if (lens === ALL_CAMPUSES) return null;
  return (
    <p className="od-dei__note" role="note">
      Este desglose se publica para el total institucional; no se desagrega para {siteName(lens)}.
    </p>
  );
}

/* --- Llegadas: titular + cinco grupos --------------------------------------------- */

function Arrivals({
  grupo,
  ind,
  year,
  previous,
  lens,
  sites,
  siteName,
  base,
}: {
  grupo: Indicator;
  ind: Map<string, Indicator>;
  year: number;
  previous: number | undefined;
  lens: CampusId;
  sites: Campus[];
  siteName: (id: CampusId) => string;
  base: number | null;
}) {
  const total = cell(grupo, year, ALL_CAMPUSES);
  const headline = cell(grupo, year, lens);

  // Institucional: sobre la matrícula del corte. Con un campus: su peso en el total.
  const share =
    lens === ALL_CAMPUSES
      ? total !== null && base
        ? (total / base) * 100
        : null
      : headline !== null && total
        ? (headline / total) * 100
        : null;

  return (
    <div className="od-dei__arrivals">
      <div className="od-dei__lead">
        <p className="od-dei__lead-cut">
          Corte {cut(year)} · {scope(lens, siteName)}
        </p>
        {headline === null ? (
          <p className="od-dei__lead-missing">Sin reportar</p>
        ) : (
          <SplitFlap value={count(headline)} size="xl" numeric key={`${year}-${lens}`} label={`${count(headline)} estudiantes`} />
        )}
        <p className="od-dei__lead-label">estudiantes de grupos de protección constitucional</p>
        {share !== null && (
          <div className="od-dei__lead-share">
            <Waffle share={share} key={`${year}-${lens}`} />
            <p>
              {lens === ALL_CAMPUSES ? (
                <>
                  <strong>{pctRound(share)}</strong> de los {count(base as number)} estudiantes del corte
                  {oneIn(share) && <span className="od-dei__lead-oneIn">{oneIn(share)}</span>}
                </>
              ) : (
                <>
                  <strong>{pctRound(share)}</strong> de los {count(total as number)} estudiantes de estos grupos en la
                  universidad están en {siteName(lens)}
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <ul className="od-dei__groups">
        {ARRIVALS.map(({ key, short }, index) => {
          const i = ind.get(key);
          if (!i) return null;
          const now = cell(i, year, lens);
          const before = previous === undefined ? null : cell(i, previous, lens);
          const additive = i.format !== "porcentaje";
          const parts = sites.map((s) => ({ id: s.id, name: s.name, value: cell(i, year, s.id) }));
          const partsTotal = parts.reduce((s, p) => s + (p.value ?? 0), 0);
          return (
            <li key={key} className="od-dei__group" style={{ "--i": index } as CSSProperties}>
              <div className="od-dei__group-head">
                <span className="od-dei__group-name" title={i.label}>
                  {short}
                </span>
                <Delta now={now} before={before} previous={previous} percent={!additive} />
              </div>
              <div className="od-dei__group-figure">
                {now === null ? (
                  <span className="od-dei__missing">Sin reportar</span>
                ) : (
                  <SplitFlap value={figure(i, now)} size="md" numeric delay={120 + index * 90} key={`${year}-${lens}`} />
                )}
                <span className="od-dei__unit">{i.unit === "%" ? "de los estudiantes con estrato registrado" : i.unit}</span>
              </div>
              {additive && partsTotal > 0 ? (
                <div className="od-dei__split" role="img" aria-label={`Por campus: ${parts.map((p) => `${p.name} ${p.value === null ? "sin reportar" : count(p.value)}`).join(", ")}`}>
                  <span className="od-dei__split-bars">
                    {parts.map((p, k) => (
                      <span
                        key={p.id}
                        className="od-dei__split-bar"
                        data-dim={lens !== ALL_CAMPUSES && lens !== p.id ? "" : undefined}
                        style={{ "--w": `${((p.value ?? 0) / partsTotal) * 100}%`, "--tone": `var(--od-series-${k + 1})` } as CSSProperties}
                      />
                    ))}
                  </span>
                  <span className="od-dei__split-legend">
                    {parts.map((p, k) => (
                      <span
                        key={p.id}
                        data-dim={lens !== ALL_CAMPUSES && lens !== p.id ? "" : undefined}
                        style={{ "--tone": `var(--od-series-${k + 1})` } as CSSProperties}
                      >
                        {p.name} <b>{p.value === null ? "—" : count(p.value)}</b>
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <div className="od-dei__pills" aria-label="Por campus">
                  {parts.map((p) => (
                    <span key={p.id} className="od-dei__pill" data-dim={lens !== ALL_CAMPUSES && lens !== p.id ? "" : undefined}>
                      {p.name} <b>{p.value === null ? "—" : figure(i, p.value)}</b>
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Delta({ now, before, previous, percent }: { now: number | null; before: number | null; previous: number | undefined; percent: boolean }) {
  if (now === null || before === null || previous === undefined) return null;
  const diff = now - before;
  const text =
    diff === 0
      ? "igual"
      : percent
        ? `${diff > 0 ? "+" : "−"}${decimal.format(Math.abs(diff))} p. p.`
        : `${diff > 0 ? "+" : "−"}${count(Math.abs(diff))}`;
  return (
    <span className="od-dei__delta" data-dir={diff > 0 ? "up" : diff < 0 ? "down" : "flat"}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        {diff === 0 ? <path d="M1 5h8" /> : <path d={diff > 0 ? "M5 1.5 9 8H1z" : "M5 8.5 1 2h8z"} />}
      </svg>
      {text} <span>frente a {cut(previous)}</span>
    </span>
  );
}

/** Cien casillas: cada una es un punto porcentual. */
function Waffle({ share }: { share: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref);
  const lit = Math.max(0, Math.min(100, Math.round(share)));
  return (
    <span ref={ref} className="od-dei__waffle" data-seen={seen || undefined} aria-hidden="true">
      {Array.from({ length: 100 }, (_, k) => (
        <i key={k} data-on={k < lit ? "" : undefined} style={{ "--k": k } as CSSProperties} />
      ))}
    </span>
  );
}

/* --- Corte a corte ---------------------------------------------------------------- */

function CutColumns({
  grupo,
  years,
  active,
  lens,
  siteName,
  baseOf,
  onPick,
}: {
  grupo: Indicator;
  years: number[];
  active: number;
  lens: CampusId;
  siteName: (id: CampusId) => string;
  baseOf: (y: number) => number | null;
  onPick: (y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const institutional = lens === ALL_CAMPUSES;

  const cols = years.map((y) => {
    const n = cell(grupo, y, lens);
    const base = baseOf(y);
    const share = institutional && n !== null && base ? (n / base) * 100 : null;
    return { y, n, share, base };
  });
  const metric = (c: (typeof cols)[number]) => (institutional ? c.share : c.n);
  const top = niceCeil(Math.max(...cols.map((c) => metric(c) ?? 0)));

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--cuts"
      title="Corte a corte"
      subtitle={
        institutional
          ? "Proporción de estudiantes de grupos de protección constitucional sobre la matrícula del corte"
          : `Estudiantes de grupos de protección constitucional · ${siteName(lens)}`
      }
      source={grupo.source}
      exportName="dei-corte-a-corte"
    >
      <div ref={ref} className="od-dei__cols" data-seen={seen || undefined}>
        <span className="od-dei__cols-top" aria-hidden="true">
          {institutional ? `${integer.format(top)} %` : count(top)}
        </span>
        {cols.map((c, k) => {
          const m = metric(c);
          return (
            <button
              key={c.y}
              type="button"
              className="od-dei__col"
              aria-pressed={c.y === active}
              onClick={() => onPick(c.y)}
              aria-label={`${cut(c.y)}: ${c.n === null ? "sin reportar" : `${count(c.n)} estudiantes`}${c.share !== null ? `, ${pct(c.share)} de la matrícula` : ""}. Ver este corte.`}
              style={{ "--h": m === null ? "0" : String(m / top), "--k": k } as CSSProperties}
            >
              <span className="od-dei__col-track">
                <span className="od-dei__col-fill">
                  <span className="od-dei__col-value">{m === null ? "—" : institutional ? pct(m) : count(m)}</span>
                </span>
              </span>
              <span className="od-dei__col-cut">{cut(c.y)}</span>
              <span className="od-dei__col-count">
                {c.n === null ? "Sin reportar" : institutional && c.base ? `${count(c.n)} de ${count(c.base)}` : `${count(c.n)} est.`}
              </span>
            </button>
          );
        })}
      </div>
    </ChartFrame>
  );
}

/* --- Mosaico étnico --------------------------------------------------------------- */

function EthnicMosaic({
  indigena,
  negra,
  year,
  lens,
  siteName,
}: {
  indigena: Breakdown | undefined;
  negra: Breakdown | undefined;
  year: number;
  lens: CampusId;
  siteName: (id: CampusId) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 1080);
  const seen = useInView(box);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);

  const families = [
    familyOf(indigena, year, "Pueblos indígenas", "var(--od-dei-indigena)"),
    familyOf(negra, year, "Comunidades negras, afrocolombianas, raizales y palenqueras", "var(--od-dei-negra)"),
  ].filter((f): f is Family => Boolean(f && f.total > 0));
  if (families.length === 0) return null;

  const narrow = width < 640;
  const height = narrow ? 620 : 440;
  const gap = 10;
  const sum = families.reduce((s, f) => s + f.total, 0);
  // Cada familia recibe su parte del espacio, sin bajar de un tercio para que se lea.
  const shares = families.map((f) => Math.max(f.total / sum, families.length > 1 ? 0.3 : 1));
  const norm = shares.reduce((s, v) => s + v, 0);
  let offset = 0;
  const laid = families.map((f, k) => {
    const part = shares[k] / norm;
    const region: Rect = narrow
      ? { x: 0, y: offset, w: width, h: (height - gap * (families.length - 1)) * part }
      : { x: offset, y: 0, w: (width - gap * (families.length - 1)) * part, h: height };
    offset += (narrow ? region.h : region.w) + gap;
    const header = 34;
    const inner = { x: region.x, y: region.y + header, w: region.w, h: region.h - header };
    return { family: f, region, tiles: squarify(f.items.map((i) => i.value as number), inner) };
  });

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--mosaic"
      title="Mosaico de pueblos y comunidades"
      subtitle={`Estudiantes por pueblo o comunidad declarada · corte ${cut(year)} · total institucional`}
      source={indigena?.source ?? negra?.source}
      exportName="dei-mosaico-etnico"
    >
      <InstitutionalNote lens={lens} siteName={siteName} />
      <div
        ref={box}
        className="od-dei__mosaic"
        data-seen={seen || undefined}
        style={{ height }}
        onMouseLeave={() => setTip(null)}
        key={year}
      >
        {laid.map(({ family, region, tiles }) => (
          <div key={family.key} role="list" aria-label={`${family.name}: ${count(family.total)} estudiantes en categorías publicadas`}>
            <span
              className="od-dei__family"
              style={{ left: region.x, top: region.y, width: region.w, "--tone": family.tone } as CSSProperties}
              aria-hidden="true"
            >
              <b>{family.name}</b>
              <span>{count(family.total)}</span>
            </span>
            {tiles.map((t, k) => {
              const item = family.items[k];
              const value = item.value as number;
              const share = (value / family.total) * 100;
              const roomy = t.w >= 92 && t.h >= 46;
              const small = t.w >= 38 && t.h >= 24;
              const body = (
                <>
                  <strong>{item.label}</strong>
                  <span>
                    {count(value)} estudiantes · {pct(share)} de {family.name.split(",")[0].toLowerCase()}
                  </span>
                </>
              );
              return (
                <div
                  key={item.label}
                  role="listitem"
                  tabIndex={0}
                  className="od-dei__tile"
                  aria-label={`${item.label}: ${count(value)} estudiantes`}
                  style={
                    {
                      left: t.x + 1,
                      top: t.y + 1,
                      width: Math.max(0, t.w - 2),
                      height: Math.max(0, t.h - 2),
                      "--tone": toneOf(item.label),
                      "--k": k,
                    } as CSSProperties
                  }
                  onMouseMove={(e) => {
                    const r = box.current?.getBoundingClientRect();
                    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body });
                  }}
                  onFocus={() => setTip({ x: t.x + t.w / 2, y: t.y + 8, body })}
                  onBlur={() => setTip(null)}
                >
                  {roomy ? (
                    <>
                      <span className="od-dei__tile-label">{item.label}</span>
                      <span className="od-dei__tile-value">{count(value)}</span>
                    </>
                  ) : small ? (
                    <span className="od-dei__tile-value od-dei__tile-value--solo">{count(value)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
        {tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 140 ? "start" : tip.x > width - 140 ? "end" : "center"}>
            {tip.body}
          </ChartTooltip>
        )}
      </div>

      <div className="od-dei__reserve">
        {families.map((f) =>
          f.reserved.length || f.zero ? (
            <p key={f.key}>
              <b>{f.name}</b>
              {f.reserved.length > 0 && (
                <>
                  {" "}
                  · con menos de 5 estudiantes, sin cifra exacta:{" "}
                  {f.reserved.map((r) => (
                    <span key={r} className="od-dei__chip" style={{ "--tone": toneOf(r) } as CSSProperties}>
                      {r}
                    </span>
                  ))}
                </>
              )}
              {f.zero > 0 && (
                <span className="od-dei__zero">
                  {" "}
                  · {f.zero} {f.zero === 1 ? "categoría" : "categorías"} sin estudiantes en este corte
                </span>
              )}
            </p>
          ) : null,
        )}
      </div>

      <details className="od-dei__table">
        <summary>Ver todas las cifras</summary>
        {families.map((f) => (
          <table key={f.key}>
            <caption>{f.name}</caption>
            <tbody>
              {itemsOf(f.key === BD.indigena ? indigena : negra, year).map((i) => (
                <tr key={i.label}>
                  <th scope="row">{i.label}</th>
                  <td>{i.reserved ? "< 5" : i.value === null ? "Sin reportar" : count(i.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </details>
    </ChartFrame>
  );
}

/* --- Discapacidad y su registro --------------------------------------------------- */

function Disability({
  tipo,
  cobertura,
  years,
  year,
  lens,
  siteName,
}: {
  tipo: Breakdown | undefined;
  cobertura: Indicator | undefined;
  years: number[];
  year: number;
  lens: CampusId;
  siteName: (id: CampusId) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const items = itemsOf(tipo, year);
  if (!tipo || items.length === 0) return null;
  const rows = [...items].sort((a, b) => {
    const va = a.reserved ? -1 : (a.value ?? -2);
    const vb = b.reserved ? -1 : (b.value ?? -2);
    return vb - va;
  });
  const max = Math.max(1, ...rows.filter(published).map((i) => i.value as number));
  const threshold = tipo.reserveThreshold ?? 5;

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--disability"
      title="Discapacidad declarada"
      subtitle={`Estudiantes por tipo · corte ${cut(year)} · total institucional`}
      source={tipo.source}
      exportName="dei-discapacidad"
    >
      <InstitutionalNote lens={lens} siteName={siteName} />
      <div ref={ref} className="od-dei__bars" data-seen={seen || undefined} key={year}>
        {rows.map((i, k) => (
          <div key={i.label} className="od-dei__bar" style={{ "--k": k } as CSSProperties}>
            <span className="od-dei__bar-label">{i.label}</span>
            <span className="od-dei__bar-track">
              {i.reserved ? (
                <span className="od-dei__bar-fill od-dei__bar-fill--reserved" />
              ) : (
                <span className="od-dei__bar-fill" style={{ "--w": `${((i.value ?? 0) / max) * 100}%` } as CSSProperties} />
              )}
            </span>
            <span className="od-dei__bar-value">{i.reserved ? `< ${threshold}` : i.value === null ? "—" : count(i.value)}</span>
          </div>
        ))}
      </div>

      {cobertura && (
        <div className="od-dei__coverage">
          <p className="od-dei__coverage-title">
            <b>Cobertura del registro</b> {cobertura.definition}
          </p>
          <ol className="od-dei__coverage-cuts">
            {years.map((y) => {
              const v = cell(cobertura, y, lens);
              return (
                <li key={y} aria-current={y === year ? "true" : undefined}>
                  <span className="od-dei__coverage-meter" style={{ "--w": `${v ?? 0}%` } as CSSProperties} />
                  <span className="od-dei__coverage-value">{v === null ? "—" : pctRound(v)}</span>
                  <span className="od-dei__coverage-cut">{cut(y)}</span>
                </li>
              );
            })}
          </ol>
          <p className="od-dei__coverage-hint">Compara los cortes con cuidado: una cifra con poca cobertura se queda corta.</p>
        </div>
      )}
    </ChartFrame>
  );
}

/* --- Espectro de estratos --------------------------------------------------------- */

function StrataSpectrum({
  estrato,
  bajo,
  years,
  year,
  lens,
  sites,
  siteName,
}: {
  estrato: Breakdown | undefined;
  bajo: Indicator | undefined;
  years: number[];
  year: number;
  lens: CampusId;
  sites: Campus[];
  siteName: (id: CampusId) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  if (!estrato) return null;
  const levels = ["Estrato 1", "Estrato 2", "Estrato 3", "Estrato 4", "Estrato 5", "Estrato 6"];
  const rows = years
    .map((y) => {
      const items = itemsOf(estrato, y);
      const total = sumOf(items);
      const parts = levels.map((l) => items.find((i) => i.label === l)?.value ?? 0);
      return { y, total, parts };
    })
    .filter((r) => r.total > 0);
  if (rows.length === 0) return null;
  const lensValue = cell(bajo, year, lens);

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--strata"
      title="Estrato socioeconómico"
      subtitle="Reparto de los estudiantes con estrato registrado, del 1 al 6"
      source={estrato.source}
      exportName="dei-estratos"
    >
      <div ref={ref} className="od-dei__strata" data-seen={seen || undefined}>
        <div className="od-dei__strata-legend" aria-hidden="true">
          {levels.map((l, k) => (
            <span key={l} style={{ "--tone": `var(--od-dei-e${k + 1})` } as CSSProperties}>
              {k + 1}
            </span>
          ))}
          <em>Estrato</em>
        </div>
        {rows.map((r) => {
          const low = ((r.parts[0] + r.parts[1]) / r.total) * 100;
          return (
            <div
              key={r.y}
              className="od-dei__strata-row"
              aria-current={r.y === year ? "true" : undefined}
              role="img"
              aria-label={`${cut(r.y)}: ${levels.map((l, k) => `${l} ${pct((r.parts[k] / r.total) * 100)}`).join(", ")}`}
            >
              <span className="od-dei__strata-cut">{cut(r.y)}</span>
              <span className="od-dei__strata-bar">
                {r.parts.map((p, k) => {
                  const share = (p / r.total) * 100;
                  return (
                    <span
                      key={k}
                      className="od-dei__strata-part"
                      style={{ "--w": `${share}%`, "--tone": `var(--od-dei-e${k + 1})`, "--seg-ink": k < 3 ? "var(--od-dei-e-ink-deep)" : "var(--od-dei-e-ink-pale)" } as CSSProperties}
                    >
                      {share >= 7 && <span>{pctRound(share)}</span>}
                    </span>
                  );
                })}
                <span className="od-dei__strata-bracket" style={{ "--w": `${low}%` } as CSSProperties} aria-hidden="true" />
              </span>
              <span className="od-dei__strata-low">
                <b>{pct(low)}</b> en 1 y 2
              </span>
            </div>
          );
        })}
      </div>
      {bajo && sites.length > 0 && (
        <table className="od-dei__lowgrid">
          <caption>Estratos 1 y 2 por campus</caption>
          <thead>
            <tr>
              <th scope="col" aria-label="Campus" />
              {years.map((y) => (
                <th key={y} scope="col" aria-current={y === year ? "true" : undefined}>
                  {cut(y)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((c) => (
              <tr key={c.id} data-dim={lens !== ALL_CAMPUSES && lens !== c.id ? "" : undefined}>
                <th scope="row">{c.name}</th>
                {years.map((y) => {
                  const v = cell(bajo, y, c.id);
                  return (
                    <td key={y} aria-current={y === year ? "true" : undefined} style={{ "--w": `${v ?? 0}%` } as CSSProperties}>
                      <span>{v === null ? "—" : pct(v)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lens !== ALL_CAMPUSES && (
        <p className="od-dei__note" role="note">
          El reparto por estrato es institucional. En {siteName(lens)}, los estratos 1 y 2 reúnen{" "}
          <b>{lensValue === null ? "una cifra sin reportar" : pct(lensValue)}</b> de los estudiantes en {cut(year)}.
        </p>
      )}
    </ChartFrame>
  );
}

/* --- Género y zona ---------------------------------------------------------------- */

function Splits({
  genero,
  zona,
  years,
  year,
  lens,
  siteName,
}: {
  genero: Breakdown | undefined;
  zona: Breakdown | undefined;
  years: number[];
  year: number;
  lens: CampusId;
  siteName: (id: CampusId) => string;
}) {
  const pairs = [
    { b: genero, title: "Género registrado", tones: ["var(--od-dei-f)", "var(--od-dei-m)"] },
    { b: zona, title: "Zona de residencia", tones: ["var(--od-dei-urbano)", "var(--od-dei-rural)"] },
  ].filter((p) => p.b && itemsOf(p.b, year).length);
  if (pairs.length === 0) return null;

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--splits"
      title="Género y zona"
      subtitle={`Corte ${cut(year)} · total institucional`}
      source={pairs[0].b?.source}
      exportName="dei-genero-zona"
    >
      <InstitutionalNote lens={lens} siteName={siteName} />
      <div className="od-dei__splits">
        {pairs.map(({ b, title, tones }) => {
          const items = itemsOf(b, year).filter(published);
          const total = sumOf(items);
          const trail = years
            .map((y) => {
              const its = itemsOf(b, y).filter(published);
              const t = sumOf(its);
              const first = its.find((i) => i.label === items[0]?.label);
              return t > 0 && first ? { y, share: ((first.value as number) / t) * 100 } : null;
            })
            .filter((x): x is { y: number; share: number } => Boolean(x));
          return (
            <div key={title} className="od-dei__pair">
              <p className="od-dei__pair-title">{title}</p>
              <div className="od-dei__pair-figures">
                {items.map((i, k) => (
                  <p key={i.label} style={{ "--tone": tones[k] } as CSSProperties} data-side={k === 0 ? "start" : "end"}>
                    <span className="od-dei__pair-share">{pctRound(((i.value as number) / total) * 100)}</span>
                    <span className="od-dei__pair-name">
                      {i.label} · {count(i.value as number)}
                    </span>
                  </p>
                ))}
              </div>
              <div className="od-dei__pair-bar" aria-hidden="true">
                {items.map((i, k) => (
                  <span key={i.label} style={{ "--w": `${((i.value as number) / total) * 100}%`, "--tone": tones[k] } as CSSProperties} />
                ))}
              </div>
              {trail.length > 1 && (
                <p className="od-dei__trail">
                  {items[0].label}, corte a corte:{" "}
                  {trail.map((t) => (
                    <span key={t.y} aria-current={t.y === year ? "true" : undefined}>
                      {cut(t.y)} <b>{pctRound(t.share)}</b>
                    </span>
                  ))}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}

/* --- INES ------------------------------------------------------------------------- */

const INES_MARKS = ["circle", "square", "diamond"] as const;

function Mark({ shape, x, y, r = 6 }: { shape: (typeof INES_MARKS)[number]; x: number; y: number; r?: number }) {
  if (shape === "circle") return <circle cx={x} cy={y} r={r} />;
  if (shape === "square") return <rect x={x - r * 0.88} y={y - r * 0.88} width={r * 1.76} height={r * 1.76} rx={1.5} />;
  return <path d={`M${x} ${y - r * 1.15} L${x + r * 1.15} ${y} L${x} ${y + r * 1.15} L${x - r * 1.15} ${y}Z`} />;
}

function InesDots({ data }: { data: HeatmapData }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 1080);
  const seen = useInView(box);
  const [order, setOrder] = useState<"factor" | "puntaje">("factor");
  const [hover, setHover] = useState<number | null>(null);

  const rows = data.rows.map((label, r) => {
    const values = data.columns.map((_, c) => data.values[r]?.[c] ?? null);
    const known = values.filter((v): v is number => v !== null);
    return { label, r, values, min: known.length ? Math.min(...known) : null, max: known.length ? Math.max(...known) : null };
  });
  const sorted = order === "factor" ? rows : [...rows].sort((a, b) => (a.min ?? 101) - (b.min ?? 101));
  const all = rows.flatMap((r) => r.values).filter((v): v is number => v !== null);
  if (all.length === 0) return null;
  const lo = Math.max(0, Math.floor((Math.min(...all) - 1) / 5) * 5);
  const hi = 100;

  const narrow = width < 700;
  const labelW = narrow ? 0 : 290;
  const valuesW = narrow ? 0 : 190;
  const rowH = narrow ? 58 : 36;
  const top = 30;
  const plotX = labelW + 12;
  const plotW = Math.max(120, width - labelW - valuesW - 36);
  const x = (v: number) => plotX + ((v - lo) / (hi - lo)) * plotW;
  const height = top + sorted.length * rowH + 8;
  const ticks = Array.from({ length: Math.floor((hi - lo) / 5) + 1 }, (_, k) => lo + k * 5);

  return (
    <ChartFrame
      className="od-dei__panel od-dei__panel--ines"
      title="Índice de Inclusión para la Educación Superior"
      subtitle={`INES · puntaje 0-100 de los doce factores según quién responde · la escala empieza en ${lo}`}
      source={data.source}
      exportName="dei-ines"
      actions={
        <ViewSwitch
          label="Orden de los factores"
          value={order}
          onChange={setOrder}
          options={[
            { value: "factor", label: "Por factor" },
            { value: "puntaje", label: "Más bajo primero" },
          ]}
        />
      }
    >
      <ul className="od-dei__ines-legend">
        {data.columns.map((c, k) => (
          <li key={c} style={{ "--tone": `var(--od-series-${k + 1})` } as CSSProperties}>
            <svg viewBox="-8 -8 16 16" aria-hidden="true">
              <Mark shape={INES_MARKS[k % 3]} x={0} y={0} />
            </svg>
            {c}
          </li>
        ))}
      </ul>
      <div ref={box} className="od-dei__ines" data-seen={seen || undefined}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`INES por factor: ${rows.map((r) => `${r.label}, ${data.columns.map((c, k) => `${c} ${r.values[k] === null ? "sin respuestas" : decimal.format(r.values[k] as number)}`).join(", ")}`).join("; ")}`}
          onMouseLeave={() => setHover(null)}
        >
          {!narrow && (
            <text className="od-dei__ines-head" x={width - 8} y={top - 12} textAnchor="end">
              {data.columns.map((c, k) => (
                <tspan key={c} dx={k ? 10 : 0}>
                  {c.slice(0, 4)}.
                </tspan>
              ))}
            </text>
          )}
          {ticks.map((t) => (
            <g key={t} className="od-dei__ines-tick">
              <line x1={x(t)} x2={x(t)} y1={top - 6} y2={height - 4} />
              <text x={x(t)} y={top - 12} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {sorted.map((row, k) => {
            const y = top + k * rowH + (narrow ? 38 : rowH / 2);
            return (
              <g
                key={row.label}
                className="od-dei__ines-row"
                data-hover={hover === row.r || undefined}
                style={{ "--k": k, transform: `translateY(${y}px)` } as CSSProperties}
                onMouseEnter={() => setHover(row.r)}
              >
                <rect className="od-dei__ines-hit" x={0} y={-rowH / 2 - (narrow ? 12 : 0)} width={width} height={rowH} />
                <text className="od-dei__ines-label" x={narrow ? 0 : labelW} y={narrow ? -20 : 4} textAnchor={narrow ? "start" : "end"}>
                  {row.label}
                </text>
                {row.min !== null && row.max !== null && <line className="od-dei__ines-range" x1={x(row.min)} x2={x(row.max)} y1={0} y2={0} />}
                {row.values.map((v, c) =>
                  v === null ? null : (
                    <g key={c} className="od-dei__ines-mark" style={{ "--tone": `var(--od-series-${c + 1})`, "--x": `${x(v)}px` } as CSSProperties}>
                      <Mark shape={INES_MARKS[c % 3]} x={0} y={0} />
                    </g>
                  ),
                )}
                {!narrow && (
                  <text className="od-dei__ines-values" x={width - 8} y={4} textAnchor="end">
                    {row.values.map((v, c) => (
                      <tspan key={c} dx={c ? 10 : 0}>
                        {v === null ? "—" : decimal.format(v)}
                      </tspan>
                    ))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="od-dei__ines-foot">
        {data.description} {!narrow && `Cifras a la derecha, en orden: ${data.columns.join(", ").toLowerCase()}.`}
      </p>
    </ChartFrame>
  );
}
