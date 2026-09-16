/* =============================================================================
   Rankings universitarios en la ficha.

   Cuatro vistas del mismo dato, con un selector:
   · Medallas: una tarjeta por ranking. La posición mundial en un anillo del
     color del ranking, Latinoamérica y Colombia al lado con su variación, las
     estrellas QS por categoría, los ODS, las áreas y los campos propios.
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
  latestEdition,
  parseRank,
  previousEdition,
  rankChange,
  rankOf,
} from "../data/rankings";
import type { ParsedRank, RankScope, RankingData, RankingEdition, RankingView } from "../data/rankings";
import { formatValue } from "../data/open-data";
import { ChartFrame, ViewSwitch } from "./ChartFrame";
import { useWidth } from "./motion";
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
            {withData.map((ranking) => (
              <RankingCard key={ranking.id} ranking={ranking} edition={at(ranking)} year={year} />
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

function RankingCard({ ranking, edition, year }: { ranking: RankingData; edition: RankingEdition | undefined; year: number | "ultima" }) {
  const system = RANKING_SYSTEMS[ranking.system];
  if (!edition) {
    return (
      <article className="od-rank" data-empty style={accentStyle(ranking.accent)}>
        <header className="od-rank__head">
          {system.publisher && <span className="od-rank__publisher">{system.publisher}</span>}
          <h3>{ranking.title}</h3>
        </header>
        <p className="od-rank__missing">Sin edición {year === "ultima" ? "publicada" : `${year} ni anterior`}.</p>
      </article>
    );
  }
  const previous = previousEdition(ranking, edition);
  const global = rankOf(edition, "global");
  const lead: RankScope = global ? "global" : rankOf(edition, "regional") ? "regional" : "national";
  const leadRank = rankOf(edition, lead);
  const others = (["global", "regional", "national"] as RankScope[]).filter((s) => s !== lead && rankOf(edition, s));
  const stale = year !== "ultima" && edition.year !== year;

  return (
    <article className="od-rank" style={accentStyle(ranking.accent)}>
      <header className="od-rank__head">
        {system.publisher && <span className="od-rank__publisher">{system.publisher}</span>}
        <div>
          <h3>{ranking.title}</h3>
          <small>
            Edición {edition.year}
            {stale ? ` · la más cercana a ${year}` : ""}
          </small>
        </div>
      </header>

      {leadRank && (
        <div className="od-rank__medal">
          <svg className="od-rank__ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" />
            <circle cx="60" cy="60" r="46" />
          </svg>
          <div className="od-rank__lead">
            <strong data-band={leadRank.band || undefined} data-long={leadRank.text.length > 7 || undefined}>
              <RankText rank={leadRank} />
            </strong>
            <span>{SCOPE_LABEL[lead]}</span>
          </div>
          <div className="od-rank__lead-change">
            <ChangeNote change={previous ? rankChange(leadRank, rankOf(previous, lead)) : null} />
            {previous && <small>frente a {previous.year}</small>}
            {edition.evaluated && <small>entre {formatValue(edition.evaluated, "entero")} instituciones</small>}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <dl className="od-rank__scopes">
          {others.map((scope) => (
            <div key={scope}>
              <dt>{SCOPE_LABEL[scope]}</dt>
              <dd>
                <b>
                  <RankText rank={rankOf(edition, scope)} />
                </b>
                <ChangeNote change={previous ? rankChange(rankOf(edition, scope), rankOf(previous, scope)) : null} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {edition.score !== null && (
        <p className="od-rank__score">
          Puntaje <b>{formatValue(edition.score, "decimal")}</b>
        </p>
      )}

      {edition.stars.length > 0 && (
        <div className="od-rank__section">
          <h4>Estrellas por categoría</h4>
          <ul className="od-rank__star-list">
            {edition.stars.map((s) => (
              <li key={s.category}>
                <span>{s.category}</span>
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
                <li key={s.sdg} style={{ "--sdg": sdg.color } as CSSProperties} title={`ODS ${s.sdg}: ${sdg.name}${rank ? ` · puesto ${rank.text} mundial` : ""}`}>
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
      <p className="od-rank__source">
        {system.label}
        {ranking.source ? ` · Reporta: ${ranking.source}` : ""}
      </p>
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

/* --- Evolución ------------------------------------------------------------------------ */

function RankingsEvolution({ rankings }: { rankings: RankingData[] }) {
  const scopes = (["global", "regional", "national"] as RankScope[]).filter((scope) =>
    rankings.some((r) => r.editions.filter((e) => rankOf(e, scope)).length > 0),
  );
  const [scope, setScope] = useState<RankScope>(scopes[0] ?? "global");
  const wrap = useRef<HTMLDivElement>(null);
  const width = Math.max(320, useWidth(wrap, 860));
  const series = rankings
    .map((r) => ({ ranking: r, points: r.editions.map((e) => ({ year: e.year, rank: rankOf(e, scope) })).filter((p): p is { year: number; rank: ParsedRank } => p.rank !== null) }))
    .filter((s) => s.points.length > 0);
  const years = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.year)))).sort((a, b) => a - b);
  const ranks = series.flatMap((s) => s.points.map((p) => p.rank.value));
  const height = 320;
  const m = { top: 24, right: 150, bottom: 36, left: 56 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  // Escala logarítmica invertida: el puesto 1 arriba.
  // El dominio abarca los datos con margen: con QS World en 1000 y un ranking
  // nacional en 10, la escala va de ~5 a ~1150; sin nacionales, no baja a 1.
  const lo = Math.max(1, Math.min(...ranks) / 1.5);
  const hi = Math.max(lo * 3, ...ranks);
  const logLo = Math.log10(lo);
  const logHi = Math.log10(hi * 1.15);
  const x = (year: number) => m.left + (years.length === 1 ? innerW / 2 : ((year - years[0]) / (years[years.length - 1] - years[0])) * innerW);
  const y = (rank: number) => m.top + ((Math.log10(Math.max(1, rank)) - logLo) / (logHi - logLo || 1)) * innerH;
  // Marcas 1, 2, 5, 10, 20, 50… dentro del dominio.
  const ticks = [0, 1, 2, 3, 4].flatMap((k) => [1, 2, 5].map((m) => m * 10 ** k)).filter((t) => t >= lo && t <= hi * 1.15);

  return (
    <ChartFrame
      title="Evolución de la posición"
      subtitle={`Posición ${SCOPE_LABEL[scope].toLowerCase()} por edición · el puesto 1 arriba, escala logarítmica`}
      actions={scopes.length > 1 ? <ViewSwitch label="Ámbito de la posición" value={scope} onChange={setScope} options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} /> : undefined}
      source={Array.from(new Set(rankings.map((r) => r.source).filter(Boolean))).join(" · ")}
    >
      <div ref={wrap} className="od-rank-evo">
        {series.length === 0 ? (
          <p className="od-empty">Ningún ranking reporta posición {SCOPE_LABEL[scope].toLowerCase()}.</p>
        ) : (
          <svg width={width} height={height} role="img" aria-label={`Evolución de la posición ${SCOPE_LABEL[scope].toLowerCase()} en ${series.length} rankings`}>
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
            {series.map(({ ranking, points }) => {
              const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)} ${y(p.rank.value).toFixed(1)}`).join("");
              const last = points[points.length - 1];
              return (
                <g key={ranking.id} style={accentStyle(ranking.accent)}>
                  {points.length > 1 && <path className="od-rank-evo__line" d={d} />}
                  {points.map((p) => (
                    <g key={p.year}>
                      {p.rank.band && (
                        <line
                          className="od-rank-evo__band"
                          x1={x(p.year)}
                          x2={x(p.year)}
                          y1={y(Number(p.rank.text.split(/[–+]/)[0]))}
                          y2={y(Number(p.rank.text.split("–")[1] ?? p.rank.value))}
                        />
                      )}
                      <circle className="od-rank-evo__dot" cx={x(p.year)} cy={y(p.rank.value)} r={5}>
                        <title>{`${ranking.title} ${p.year}: ${p.rank.text}`}</title>
                      </circle>
                    </g>
                  ))}
                  <text className="od-rank-evo__label" x={x(last.year) + 12} y={y(last.rank.value)} dy="0.32em">
                    <tspan className="od-rank-evo__value">{last.rank.text}</tspan>
                    <tspan dx="6">{RANKING_SYSTEMS[ranking.system].short === "Ranking" ? ranking.title : RANKING_SYSTEMS[ranking.system].short}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </ChartFrame>
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
