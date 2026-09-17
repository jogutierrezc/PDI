/* =============================================================================
   Rankings universitarios en la ficha.

   Cuatro vistas del mismo dato, con un selector:
   · Medallas: cada ranking es una placa del tablero. La posición principal
     llega volteando en paletas partidas, el corte anterior se lee en cian
     debajo, los otros ámbitos ocupan celdas de la rejilla del tablero y el
     boleto de origen cierra la placa. Estrellas QS, ODS, áreas y campos
     propios siguen debajo, en voz baja: solo la posición voltea.
   · Tabla comparativa: todos los rankings en filas, las posiciones en columnas.
   · Evolución: la posición por edición. Escala logarítmica e invertida (el
     puesto 1 arriba): QS World (puesto 800) y un ranking nacional (puesto 5)
     se leen en la misma gráfica sin aplastarse.
   · Rueda de ODS: los 17 objetivos en su color oficial; se encienden aquellos
     en los que la UDES participó y cada uno muestra su posición.

   Una banda ("801–1000") se muestra tal cual; para dibujar y comparar se usa su
   punto medio. Subir en un ranking es bajar el número: la variación lo dice en
   palabras ("sube 12 puestos") y no solo con una flecha.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  RANKING_SYSTEMS,
  RANKING_VIEWS,
  SCOPE_LABEL,
  SDGS,
  bandEnds,
  latestEdition,
  parseRank,
  preferredScope,
  previousEdition,
  rankChange,
  rankOf,
  rankScale,
  rankingShortLabel,
  rankSpan,
  stackLabels,
} from "../data/rankings";
import type { ParsedRank, RankScope, RankingData, RankingEdition, RankingView } from "../data/rankings";
import { formatValue } from "../data/open-data";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import { useWidth } from "./motion";
import { SplitFlap } from "./SplitFlap";
import "./rankings.css";

const accentStyle = (accent: string) => ({ "--rk-accent": accent }) as CSSProperties;

export function RankingsBlock({ rankings, title, anchor }: { rankings: RankingData[]; title?: string; anchor: string }) {
  const withData = rankings.filter((r) => latestEdition(r));
  const years = useMemo(
    () => Array.from(new Set(withData.flatMap((r) => r.editions.map((e) => e.year)))).sort((a, b) => b - a),
    [withData],
  );
  const hasEvolution = withData.some((r) => r.editions.filter((e) => rankOf(e, "global") || rankOf(e, "regional") || rankOf(e, "national")).length > 1);
  const hasSdgs = withData.some((r) => r.editions.some((e) => e.sdgs.length > 0));
  const views = (Object.keys(RANKING_VIEWS) as RankingView[]).filter((v) => (v === "evolucion" ? hasEvolution : v === "ods" ? hasSdgs : true));
  const preferred = withData[0]?.view;
  const [view, setView] = useState<RankingView>(preferred && views.includes(preferred) ? preferred : "medallas");
  const [year, setYear] = useState<number | "ultima">("ultima");
  if (withData.length === 0) return null;
  const shownView = views.includes(view) ? view : "medallas";
  const at = (ranking: RankingData) => latestEdition(ranking, year === "ultima" ? undefined : year);

  return (
    <section className="od-section od-rankings" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id={anchor}>{title || "Rankings"}</h2>
            <p>
              Cómo aparece la UDES en los rankings universitarios que sigue Planeación. En un ranking, subir es bajar el
              número: el puesto 1 es el primero.
            </p>
          </div>
          <div className="od-rankings__controls">
            <ViewSwitch label="Vista de los rankings" value={shownView} onChange={setView} options={views.map((v) => ({ value: v, label: RANKING_VIEWS[v] }))} />
            {shownView !== "evolucion" && years.length > 1 && (
              <label className="od-rankings__year">
                <span>Edición</span>
                <select value={String(year)} onChange={(e) => setYear(e.target.value === "ultima" ? "ultima" : Number(e.target.value))}>
                  <option value="ultima">La más reciente</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>

        {shownView === "medallas" && (
          <div className="od-rankings__grid">
            {withData.map((ranking, index) => (
              <RankingCard key={ranking.id} ranking={ranking} edition={at(ranking)} year={year} index={index} />
            ))}
          </div>
        )}
        {shownView === "tabla" && <RankingsTable rankings={withData} at={at} />}
        {shownView === "evolucion" && <RankingsEvolution rankings={withData} />}
        {shownView === "ods" && <SdgWheel rankings={withData.filter((r) => r.editions.some((e) => e.sdgs.length))} year={year} />}
      </div>
    </section>
  );
}

/* --- Medallas ------------------------------------------------------------------ */

/** Celdas grandes mientras la posición quepa; una banda ("201–250") pide paleta menor. */
const flapSize = (text: string) => (text.length <= 5 ? "lg" : text.length <= 7 ? "md" : "sm");

/**
 * ¿La variación ya nombra la edición anterior? Con bandas de por medio,
 * `rankChange` dice "sube desde 1201–1400", y repetir el corte anterior al lado
 * es decir dos veces lo mismo. Con un número de puestos, no.
 */
const namesPrevious = (change: ReturnType<typeof rankChange>) => Boolean(change && change.label.includes("desde"));

function ChangeNote({ change }: { change: ReturnType<typeof rankChange> }) {
  if (!change) return null;
  const tone = change.places > 0 ? "up" : change.places < 0 ? "down" : "same";
  return (
    <span className="od-rank__change" data-tone={tone}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={tone === "up" ? "M5 1.5 9 7.5H1z" : tone === "down" ? "M5 8.5 9 2.5H1z" : "M1 4.2h8v1.6H1z"} />
      </svg>
      {change.label}
    </span>
  );
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="od-rank__stars" role="img" aria-label={`${label}: ${value} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" data-on={i < value || undefined} aria-hidden="true">
          <path d="M10 1.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" />
        </svg>
      ))}
    </span>
  );
}

function RankText({ rank }: { rank: ParsedRank | null }) {
  if (!rank) return <span className="od-rank__none">—</span>;
  return <>{rank.band ? rank.text : `#${rank.text.replace("=", "")}`}</>;
}

/**
 * La posición principal llega como cualquier cifra del tablero: carácter a
 * carácter, en su celda. El signo (# de puesto, = de empate) no es cifra y se
 * queda fuera de las paletas.
 */
function LeadFlap({ rank, delay }: { rank: ParsedRank; delay: number }) {
  const tied = !rank.band && rank.text.startsWith("=");
  const digits = rank.band ? rank.text : rank.text.replace("=", "");
  return (
    <span className="od-rank__figure">
      {!rank.band && (
        <span className="od-rank__sigil" aria-hidden="true">
          {tied ? "=" : "#"}
        </span>
      )}
      <SplitFlap
        value={digits}
        size={flapSize(digits)}
        delay={delay}
        numeric
        label={rank.band ? `Banda ${rank.text}` : `Puesto ${digits}${tied ? ", empatado" : ""}`}
      />
    </span>
  );
}

/**
 * Dónde cae la posición dentro de las instituciones que el ranking evaluó. Sin
 * ese universo un puesto no se puede leer: el 325 de una lista de 1.500 no es
 * el 325 de una lista de 400. Una banda ocupa su tramo, no un punto inventado.
 */
function RankScale({ rank, evaluated }: { rank: ParsedRank; evaluated: number }) {
  const total = Math.max(evaluated, Math.ceil(rank.value));
  const at = (n: number) => Math.min(100, Math.max(0, ((n - 1) / Math.max(1, total - 1)) * 100));
  const low = rank.band ? Number(rank.text.split(/[–+]/)[0]) || rank.value : rank.value;
  const highRaw = rank.band ? Number(rank.text.split("–")[1]) : rank.value;
  const high = Number.isFinite(highRaw) ? highRaw : total;
  const style = { "--from": `${at(low)}%`, "--to": `${at(high)}%` } as CSSProperties;
  const shown = formatValue(total, "entero");
  return (
    <div className="od-rank__scale" style={style}>
      <span className="od-rank__scale-track" aria-hidden="true">
        <span className="od-rank__scale-mark" />
      </span>
      <span className="od-rank__scale-note">
        <span aria-hidden="true">1</span>
        <em>
          {rank.band ? "dentro de" : "de"} {shown} instituciones evaluadas
        </em>
        <span aria-hidden="true">{shown}</span>
      </span>
    </div>
  );
}

function RankingCard({
  ranking,
  edition,
  year,
  index,
}: {
  ranking: RankingData;
  edition: RankingEdition | undefined;
  year: number | "ultima";
  index: number;
}) {
  const system = RANKING_SYSTEMS[ranking.system];
  const code = system.publisher || ranking.title.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase() || "RK";
  const head = (
    <header className="od-rank__head">
      <span className="od-rank__badge" aria-hidden="true">
        {code}
      </span>
      <div className="od-rank__ident">
        <h3>{ranking.title}</h3>
        {edition && (
          <span className="od-rank__edition">
            Edición {edition.year}
            {year !== "ultima" && edition.year !== year ? ` · la más cercana a ${year}` : ""}
          </span>
        )}
      </div>
    </header>
  );

  if (!edition) {
    return (
      <article className="od-rank" data-empty style={accentStyle(ranking.accent)}>
        {head}
        <div className="od-rank__body">
          <p className="od-rank__missing">Sin edición {year === "ultima" ? "publicada" : `${year} ni anterior`}.</p>
        </div>
      </article>
    );
  }

  const previous = previousEdition(ranking, edition);
  const global = rankOf(edition, "global");
  const lead: RankScope = global ? "global" : rankOf(edition, "regional") ? "regional" : "national";
  const leadRank = rankOf(edition, lead);
  const leadBefore = previous ? rankOf(previous, lead) : null;
  const leadChange = leadBefore ? rankChange(leadRank, leadBefore) : null;
  const others = (["global", "regional", "national"] as RankScope[]).filter((s) => s !== lead && rankOf(edition, s));

  return (
    <article className="od-rank" style={accentStyle(ranking.accent)}>
      {head}

      <div className="od-rank__body">
        {leadRank && (
          <div className="od-rank__lead">
            <span className="od-rank__scope">{SCOPE_LABEL[lead]}</span>
            <LeadFlap rank={leadRank} delay={220 + index * 170} />
            <div className="od-rank__trend">
              <ChangeNote change={leadChange} />
              {!leadBefore ? (
                <span className="od-rank__previous">Primera edición con posición publicada</span>
              ) : (
                !namesPrevious(leadChange) && (
                  <span className="od-rank__previous">
                    {previous!.year}: <RankText rank={leadBefore} />
                  </span>
                )
              )}
            </div>
            {edition.evaluated ? <RankScale rank={leadRank} evaluated={edition.evaluated} /> : null}
          </div>
        )}

        {(others.length > 0 || edition.score !== null) && (
          <dl className="od-rank__scopes">
            {others.map((scope) => {
              const rank = rankOf(edition, scope);
              const before = previous ? rankOf(previous, scope) : null;
              const change = before ? rankChange(rank, before) : null;
              return (
                <div key={scope}>
                  <dt>{SCOPE_LABEL[scope]}</dt>
                  <dd>
                    <b>
                      <RankText rank={rank} />
                    </b>
                    <ChangeNote change={change} />
                    {before && !namesPrevious(change) && (
                      <span className="od-rank__previous">
                        {previous!.year}: <RankText rank={before} />
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
            {edition.score !== null && (
              <div>
                <dt>Puntaje</dt>
                <dd>
                  <b>{formatValue(edition.score, "decimal")}</b>
                </dd>
              </div>
            )}
          </dl>
        )}

        {edition.stars.length > 0 && (
          <div className="od-rank__section">
            <h4>Estrellas por categoría</h4>
            <ul className="od-rank__star-list">
              {edition.stars.map((s) => (
                <li key={s.category}>
                  <span>{s.category}</span>
                  <i aria-hidden="true" />
                  <Stars value={s.stars} label={s.category} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {edition.sdgs.length > 0 && (
          <div className="od-rank__section">
            <h4>ODS en los que participa</h4>
            <ul className="od-rank__sdgs">
              {edition.sdgs.map((s) => {
                const sdg = SDGS[s.sdg - 1];
                const rank = parseRank(s.global_rank);
                return (
                  <li
                    key={s.sdg}
                    style={{ "--sdg": sdg.color } as CSSProperties}
                    title={`ODS ${s.sdg}: ${sdg.name}${rank ? ` · puesto ${rank.text} mundial` : ""}`}
                  >
                    <b>{s.sdg}</b>
                    {rank && <span>{rank.text}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {edition.subjects.length > 0 && (
          <details className="od-rank__section od-rank__subjects">
            <summary>
              <h4>
                {edition.subjects.length} {edition.subjects.length === 1 ? "área" : "áreas"} en el ranking
              </h4>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 4.25 6 7.75l3.5-3.5" />
              </svg>
            </summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Área</th>
                  <th scope="col">Mundial</th>
                  <th scope="col">Colombia</th>
                </tr>
              </thead>
              <tbody>
                {edition.subjects.map((s) => (
                  <tr key={s.subject}>
                    <th scope="row">{s.subject}</th>
                    <td>{parseRank(s.global_rank)?.text ?? "—"}</td>
                    <td>{parseRank(s.national_rank)?.text ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {edition.custom.length > 0 && (
          <dl className="od-rank__custom">
            {edition.custom.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {edition.note && <p className="od-rank__note">{edition.note}</p>}

        <p className="od-rank__ticket">
          <span className="od-ticket">
            <span className="od-ticket__source">{ranking.source || system.label}</span>
            <span className="od-ticket__meta">
              {ranking.source ? `${system.label} · ` : ""}Edición {edition.year}
            </span>
          </span>
        </p>
      </div>
    </article>
  );
}

/* --- Tabla comparativa ------------------------------------------------------------ */

function RankingsTable({ rankings, at }: { rankings: RankingData[]; at: (r: RankingData) => RankingEdition | undefined }) {
  const cell = (ranking: RankingData, edition: RankingEdition | undefined, scope: RankScope) => {
    const rank = rankOf(edition, scope);
    const previous = edition ? previousEdition(ranking, edition) : undefined;
    const change = rankChange(rank, rankOf(previous, scope));
    return (
      <td>
        <b>{rank ? rank.text : "—"}</b>
        {change && change.places !== 0 && (
          <small data-tone={change.places > 0 ? "up" : "down"}>
            {change.places > 0 ? "▲" : "▼"} {rank?.band || rankOf(previous, scope)?.band ? `desde ${rankOf(previous, scope)!.text}` : Math.abs(change.places)}
          </small>
        )}
      </td>
    );
  };
  return (
    <ChartFrame title="Posición en cada ranking" subtitle="Edición elegida · variación frente a la edición anterior" source={Array.from(new Set(rankings.map((r) => r.source).filter(Boolean))).join(" · ")}>
      <div className="od-rank-table__scroll">
        <table className="od-rank-table">
          <thead>
            <tr>
              <th scope="col">Ranking</th>
              <th scope="col">Edición</th>
              <th scope="col">{SCOPE_LABEL.global}</th>
              <th scope="col">{SCOPE_LABEL.regional}</th>
              <th scope="col">{SCOPE_LABEL.national}</th>
              <th scope="col">Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((ranking) => {
              const edition = at(ranking);
              return (
                <tr key={ranking.id} style={accentStyle(ranking.accent)}>
                  <th scope="row">
                    <span className="od-rank-table__name">
                      <i aria-hidden="true" />
                      {ranking.title}
                    </span>
                  </th>
                  <td>{edition?.year ?? "—"}</td>
                  {cell(ranking, edition, "global")}
                  {cell(ranking, edition, "regional")}
                  {cell(ranking, edition, "national")}
                  <td>{edition?.score !== null && edition?.score !== undefined ? formatValue(edition.score, "decimal") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}

/* --- Evolución ------------------------------------------------------------------------

   Dos formas de leer lo mismo, con un selector:
   · Cada ranking: una tira por ranking, con su nombre, su escala y su última
     posición rotulada. Nada se cruza, por muchos rankings que haya.
   · Todos juntos: un solo lienzo. Los rótulos viven en una columna a la derecha,
     se separan cuando chocan y cada uno lleva un hilo hasta su punto.

   En los dos casos la escala es logarítmica e invertida (el puesto 1 arriba):
   QS World en el puesto 1400 y un ranking nacional en el 16 se leen sin que
   ninguno se aplaste contra el borde.
   ------------------------------------------------------------------------------------ */

type EvoMode = "separado" | "junto";

interface EvoPoint {
  year: number;
  rank: ParsedRank;
}

interface EvoSeries {
  ranking: RankingData;
  points: EvoPoint[];
}

function RankingsEvolution({ rankings }: { rankings: RankingData[] }) {
  const scopes = (["global", "regional", "national"] as RankScope[]).filter((scope) =>
    rankings.some((r) => r.editions.filter((e) => rankOf(e, scope)).length > 0),
  );
  // Los botones conservan el orden de la tabla (mundial, Latinoamérica, Colombia),
  // pero el que se abre es el más cercano que haya: el puesto en Colombia.
  const [scope, setScope] = useState<RankScope>(preferredScope((sc) => scopes.includes(sc)) ?? scopes[0] ?? "global");
  const [mode, setMode] = useState<EvoMode>("separado");

  const series: EvoSeries[] = rankings
    .map((r) => ({
      ranking: r,
      points: r.editions
        .map((e) => ({ year: e.year, rank: rankOf(e, scope) }))
        .filter((p): p is EvoPoint => p.rank !== null),
    }))
    .filter((s) => s.points.length > 0);

  const source = Array.from(new Set(rankings.map((r) => r.source).filter(Boolean))).join(" · ");

  return (
    <ChartFrame
      title="Evolución de la posición"
      subtitle={`Posición ${SCOPE_LABEL[scope].toLowerCase()} por edición · el puesto 1 arriba, escala logarítmica`}
      actions={
        <>
          <ViewSwitch
            label="Forma de la evolución"
            value={mode}
            onChange={setMode}
            options={[
              { value: "separado" as EvoMode, label: "Cada ranking" },
              { value: "junto" as EvoMode, label: "Todos juntos" },
            ]}
          />
          {scopes.length > 1 && (
            <ViewSwitch
              label="Ámbito de la posición"
              value={scope}
              onChange={setScope}
              options={scopes.map((sc) => ({ value: sc, label: SCOPE_LABEL[sc] }))}
            />
          )}
        </>
      }
      source={source}
    >
      {series.length === 0 ? (
        <p className="od-empty">Ningún ranking reporta posición {SCOPE_LABEL[scope].toLowerCase()}.</p>
      ) : mode === "separado" ? (
        <div className="od-evo-grid">
          {series.map((s) => (
            <EvoTrace key={s.ranking.id} series={s} scope={scope} />
          ))}
        </div>
      ) : (
        <EvoTogether series={series} scope={scope} />
      )}
    </ChartFrame>
  );
}

/* --- Cada ranking en su tira --- */

function EvoTrace({ series, scope }: { series: EvoSeries; scope: RankScope }) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = Math.max(240, useWidth(wrap, 320));
  const { ranking, points } = series;
  const system = RANKING_SYSTEMS[ranking.system];
  const code = system.publisher || ranking.title.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase() || "RK";

  const height = 132;
  const m = { top: 18, right: 72, bottom: 26, left: 46 };
  const innerW = Math.max(40, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const years = points.map((p) => p.year);
  const first = years[0];
  const last = years[years.length - 1];
  // Cada tira tiene su propia escala: es lo que deja leer un ranking nacional
  // (#16) y uno mundial (#1401) con el mismo detalle.
  const { y, ticks } = rankScale(
    points.flatMap((p) => rankSpan(p.rank)),
    m.top,
    innerH,
    { pad: 1.15, minRatio: 2.2, dense: true },
  );
  // Con una sola edición el punto va centrado: no hay recorrido que dibujar.
  const x = (year: number) => m.left + (last === first ? innerW / 2 : ((year - first) / (last - first)) * innerW);
  const shown = ticks.length > 3 ? ticks.filter((_, i) => i % Math.ceil(ticks.length / 3) === 0) : ticks;

  const lastPoint = points[points.length - 1];
  const beforeLast = points.length > 1 ? points[points.length - 2] : null;
  const change = beforeLast ? rankChange(lastPoint.rank, beforeLast.rank) : null;

  return (
    <article className="od-evo" style={accentStyle(ranking.accent)}>
      <header className="od-evo__head">
        <span className="od-evo__badge" aria-hidden="true">
          {code}
        </span>
        <h4>{ranking.title}</h4>
      </header>

      <div ref={wrap} className="od-evo__plot">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${ranking.title}, posición ${SCOPE_LABEL[scope].toLowerCase()}: ${points
            .map((p) => `${p.year}, ${p.rank.band ? `banda ${p.rank.text}` : `puesto ${p.rank.text}`}`)
            .join("; ")}`}
        >
          {shown.map((t) => (
            <g key={t}>
              <line className="od-rank-evo__grid" x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} />
              <text className="od-rank-evo__tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                #{t}
              </text>
            </g>
          ))}

          {points.length > 1 && (
            <path
              className="od-rank-evo__line"
              d={points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)} ${y(p.rank.value).toFixed(1)}`).join("")}
            />
          )}

          {points.map((p) => {
            const [from, to] = p.rank.band ? bandEnds(p.rank, p.rank.value) : [p.rank.value, p.rank.value];
            return (
              <g key={p.year}>
                {p.rank.band && <line className="od-rank-evo__band" x1={x(p.year)} x2={x(p.year)} y1={y(from)} y2={y(to)} />}
                <circle className="od-rank-evo__dot" cx={x(p.year)} cy={y(p.rank.value)} r={4.5}>
                  <title>{`${p.year}: ${p.rank.text}`}</title>
                </circle>
                <text className="od-rank-evo__tick" x={x(p.year)} y={height - 8} textAnchor="middle">
                  {p.year}
                </text>
              </g>
            );
          })}

          <text
            className="od-rank-evo__value"
            x={Math.min(x(lastPoint.year) + 10, width - 2)}
            y={y(lastPoint.rank.value)}
            dy="0.32em"
            textAnchor={x(lastPoint.year) + 10 > width - 2 ? "end" : "start"}
          >
            {lastPoint.rank.text}
          </text>
        </svg>
      </div>

      <footer className="od-evo__foot">
        {change ? <ChangeNote change={change} /> : <span className="od-evo__single">Una sola edición publicada</span>}
        {beforeLast && !namesPrevious(change) && (
          <span className="od-rank__previous">
            {beforeLast.year}: <RankText rank={beforeLast.rank} />
          </span>
        )}
      </footer>
    </article>
  );
}

/* --- Todos juntos en un lienzo --- */

function EvoTogether({ series, scope }: { series: EvoSeries[]; scope: RankScope }) {
  const wrap = useRef<HTMLDivElement>(null);
  // Por debajo de este ancho el lienzo no se aplasta: se desplaza dentro de su
  // marco, como el resto de gráficas anchas del portal.
  const width = Math.max(460, useWidth(wrap, 860));

  const years = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.year)))).sort((a, b) => a - b);
  const ranks = series.flatMap((s) => s.points.flatMap((p) => rankSpan(p.rank)));
  // La columna de rótulos crece con el nombre más largo, hasta un tope: un
  // nombre cortado por el borde es justo lo que esta vista viene a evitar.
  const longest = Math.max(...series.map((s) => rankingShortLabel(s.ranking).length));
  const gutter = Math.min(210, Math.max(120, 26 + longest * 7.4));
  const height = Math.max(320, 86 + series.length * 46);
  const m = { top: 20, right: gutter, bottom: 34, left: 56 };
  const innerW = Math.max(60, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const { y, ticks } = rankScale(ranks, m.top, innerH, { pad: 1.25 });
  const x = (year: number) =>
    m.left + (years.length === 1 ? innerW / 2 : ((year - years[0]) / (years[years.length - 1] - years[0])) * innerW);

  // Dos líneas por rótulo: la cifra y el nombre del ranking.
  const labelX = m.left + innerW + 14;
  const placed = stackLabels(
    series.map((s) => y(s.points[s.points.length - 1].rank.value)),
    30,
    m.top + 12,
    m.top + innerH - 10,
  );

  return (
    <div ref={wrap} className="od-rank-evo">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Evolución de la posición ${SCOPE_LABEL[scope].toLowerCase()} en ${series.length} rankings`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="od-rank-evo__grid" x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} />
            <text className="od-rank-evo__tick" x={m.left - 10} y={y(t)} dy="0.32em" textAnchor="end">
              #{t}
            </text>
          </g>
        ))}
        {years.map((yr) => (
          <text key={yr} className="od-rank-evo__tick" x={x(yr)} y={height - 12} textAnchor="middle">
            {yr}
          </text>
        ))}

        {series.map(({ ranking, points }, index) => {
          const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)} ${y(p.rank.value).toFixed(1)}`).join("");
          const last = points[points.length - 1];
          const lastX = x(last.year);
          const lastY = y(last.rank.value);
          const labelY = placed[index];
          return (
            <g key={ranking.id} style={accentStyle(ranking.accent)}>
              {points.length > 1 && <path className="od-rank-evo__line" d={d} />}
              {points.map((p) => {
                const [from, to] = p.rank.band ? bandEnds(p.rank, p.rank.value) : [p.rank.value, p.rank.value];
                return (
                  <g key={p.year}>
                    {p.rank.band && <line className="od-rank-evo__band" x1={x(p.year)} x2={x(p.year)} y1={y(from)} y2={y(to)} />}
                    <circle className="od-rank-evo__dot" cx={x(p.year)} cy={y(p.rank.value)} r={5}>
                      <title>{`${ranking.title} ${p.year}: ${p.rank.text}`}</title>
                    </circle>
                  </g>
                );
              })}
              {/* El hilo lleva del último punto a su rótulo, aunque el ranking deje de reportar antes. */}
              <path
                className="od-rank-evo__leader"
                d={`M${(lastX + 7).toFixed(1)} ${lastY.toFixed(1)}H${(labelX - 24).toFixed(1)}L${(labelX - 8).toFixed(1)} ${labelY.toFixed(1)}H${labelX.toFixed(1)}`}
              />
              <text className="od-rank-evo__label" x={labelX} y={labelY} dy="0.32em">
                <tspan className="od-rank-evo__value" x={labelX} dy="-0.32em">
                  {last.rank.text}
                </tspan>
                <tspan x={labelX} dy="1.25em">
                  {rankingShortLabel(ranking)}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* --- Rueda de ODS ----------------------------------------------------------------------- */

function SdgWheel({ rankings, year }: { rankings: RankingData[]; year: number | "ultima" }) {
  const [rankingId, setRankingId] = useState(rankings[0]?.id);
  const ranking = rankings.find((r) => r.id === rankingId) ?? rankings[0];
  const edition = ranking ? latestEdition(ranking, year === "ultima" ? undefined : year) : undefined;
  const results = new Map((edition?.sdgs ?? []).map((s) => [s.sdg, s]));
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected !== null && results.has(selected) ? selected : (edition?.sdgs[0]?.sdg ?? null);
  if (!ranking) return null;

  const size = 340;
  const c = size / 2;
  const outer = 158;
  const inner = 96;
  const gap = 0.012;
  const arc = (i: number, r1: number, r2: number) => {
    const a0 = (i / 17) * Math.PI * 2 - Math.PI / 2 + gap;
    const a1 = ((i + 1) / 17) * Math.PI * 2 - Math.PI / 2 - gap;
    const p = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(r2, a0)}A${r2} ${r2} 0 0 1 ${p(r2, a1)}L${p(r1, a1)}A${r1} ${r1} 0 0 0 ${p(r1, a0)}Z`;
  };
  const labelAt = (i: number) => {
    const a = ((i + 0.5) / 17) * Math.PI * 2 - Math.PI / 2;
    const r = (outer + inner) / 2;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const focus = active !== null ? results.get(active) : undefined;
  const focusSdg = active !== null ? SDGS[active - 1] : undefined;

  return (
    <ChartFrame
      title="Objetivos de Desarrollo Sostenible"
      subtitle={edition ? `${ranking.title} · edición ${edition.year} · ${results.size} de 17 ODS` : `${ranking.title} · sin edición`}
      actions={
        rankings.length > 1 ? (
          <ViewSwitch label="Ranking de ODS" value={ranking.id} onChange={(id) => { setRankingId(id); setSelected(null); }} options={rankings.map((r) => ({ value: r.id, label: RANKING_SYSTEMS[r.system].short === "Ranking" ? r.title : RANKING_SYSTEMS[r.system].short }))} />
        ) : undefined
      }
      source={ranking.source}
    >
      <div className="od-sdg">
        <svg className="od-sdg__wheel" viewBox={`0 0 ${size} ${size}`} role="group" aria-label="Rueda de los 17 ODS">
          {SDGS.map((sdg, i) => {
            const on = results.has(sdg.n);
            const pos = labelAt(i);
            return (
              <g
                key={sdg.n}
                className="od-sdg__segment"
                data-on={on || undefined}
                data-active={active === sdg.n || undefined}
                style={{ "--sdg": sdg.color } as CSSProperties}
                role={on ? "button" : undefined}
                tabIndex={on ? 0 : undefined}
                aria-pressed={on ? active === sdg.n : undefined}
                aria-label={`ODS ${sdg.n}: ${sdg.name}${on ? "" : ", no participa"}`}
                onClick={() => on && setSelected(sdg.n)}
                onKeyDown={(e) => {
                  if (on && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelected(sdg.n);
                  }
                }}
              >
                <path d={arc(i, inner, outer)} />
                <text x={pos.x} y={pos.y} dy="0.35em" textAnchor="middle">
                  {sdg.n}
                </text>
              </g>
            );
          })}
          <circle className="od-sdg__hub" cx={c} cy={c} r={inner - 8} />
          {focus && focusSdg ? (
            <g className="od-sdg__center">
              <text x={c} y={c - 30} textAnchor="middle" className="od-sdg__center-kicker">
                ODS {focusSdg.n}
              </text>
              <text x={c} y={c + 8} textAnchor="middle" className="od-sdg__center-rank">
                {parseRank(focus.global_rank)?.text ?? "—"}
              </text>
              <text x={c} y={c + 30} textAnchor="middle" className="od-sdg__center-scope">
                mundial
              </text>
            </g>
          ) : (
            <text x={c} y={c} dy="0.35em" textAnchor="middle" className="od-sdg__center-scope">
              Sin ODS en esta edición
            </text>
          )}
        </svg>

        <div className="od-sdg__detail">
          {focus && focusSdg && (
            <div className="od-sdg__focus" style={{ "--sdg": focusSdg.color } as CSSProperties}>
              <span className="od-sdg__tile">{focusSdg.n}</span>
              <div>
                <h3>{focusSdg.name}</h3>
                <dl>
                  <div>
                    <dt>Mundial</dt>
                    <dd>{parseRank(focus.global_rank)?.text ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Colombia</dt>
                    <dd>{parseRank(focus.national_rank)?.text ?? "—"}</dd>
                  </div>
                  {focus.score !== null && focus.score !== undefined && (
                    <div>
                      <dt>Puntaje</dt>
                      <dd>{formatValue(Number(focus.score), "decimal")}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}
          <ul className="od-sdg__list">
            {(edition?.sdgs ?? []).map((s) => {
              const sdg = SDGS[s.sdg - 1];
              return (
                <li key={s.sdg} style={{ "--sdg": sdg.color } as CSSProperties}>
                  <button type="button" aria-pressed={active === s.sdg} onClick={() => setSelected(s.sdg)}>
                    <b>{s.sdg}</b>
                    <span>{sdg.name}</span>
                    <small>{parseRank(s.global_rank)?.text ?? "—"}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ChartFrame>
  );
}
