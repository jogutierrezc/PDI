/* =============================================================================
   Mapa del mundo: movilidad internacional.

   Recibe uno o dos conjuntos:
   · "entrante": participantes que llegan de otro país a un campus de la UDES.
     Las rutas nacen en el país de origen y terminan en Colombia (ámbar).
   · "saliente": participantes que salen de un campus a otro país. Las rutas
     nacen en Colombia y terminan en el país de destino (magenta).
   Con los dos, el mapa es combinado: cada sentido con su color, un selector
   para ver ambos o uno solo, y el ranking con las dos cifras por país. Las
   rutas de ida y vuelta a un mismo país se abomban distinto para no pisarse.

   Cada país se colorea con la escala azul según sus participantes. Al entrar en
   pantalla las rutas se trazan de la más fuerte a la más débil; después un
   cometa con estela recorre cada una en el sentido del viaje y, al llegar,
   deja una onda en el destino. Con "menos movimiento" quedan quietas.

   Compacto: el mapa se encuadra a los países con datos (Colombia incluida), el
   panel pasa a un lado si cabe y el ranking se acorta a cinco filas. El
   encuadre sale de todos los campus y ambos sentidos, así no salta al filtrar.

   Interacción: pasar por un país o por su fila del ranking aísla su ruta; un
   clic lo fija y muestra el reparto por campus. El ranking es la vía accesible.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { formatCount, formatValue } from "../data/open-data";
import { ALL_YEARS, cutLabel } from "../data/terms";
import type { Campus, CampusId, MapDataset } from "../data/types";
import { COUNTRIES, WORLD_CAMPUS_POINTS, WORLD_HEIGHT, WORLD_WIDTH } from "../data/world-map";
import { BY_CODE, HOME, fitBox } from "./world-geo";
import type { Point } from "./world-geo";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

const BINS = 7;
/** La movilidad de todo el periodo es la suma de los años (ver withPeriodView). */
const GROUPED_AS = "total del periodo";

type Direction = "entrante" | "saliente";
type Show = "ambos" | Direction;

const DIRECTION_LABEL: Record<Direction, { total: string; short: string; route: string }> = {
  entrante: { total: "Participantes entrantes", short: "Entrantes", route: "Del país de origen a la UDES" },
  saliente: { total: "Participantes salientes", short: "Salientes", route: "De la UDES al país de destino" },
};

interface WorldMapProps {
  /** Uno o dos conjuntos de movilidad (entrante y/o saliente). */
  datasets: MapDataset[];
  year: number;
  years: number[];
  campus: CampusId;
  campuses: Campus[];
  onSelectCampus?: (campus: CampusId) => void;
  compact?: boolean;
}


/** Arco de `from` a `to`, abombado hacia el norte: se lee como un vuelo. */
function arc([x0, y0]: Point, [x1, y1]: Point, bend: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy) || 1;
  let nx = -dy / chord;
  let ny = dx / chord;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const lift = Math.min(150, chord * bend);
  const cx = (x0 + x1) / 2 + nx * lift;
  const cy = (y0 + y1) / 2 + ny * lift;
  const length = (chord + Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / 2;
  return { d: `M${x0} ${y0}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1} ${y1}`, length };
}

export function WorldMap({ datasets, year, years, campus, campuses, onSelectCampus, compact = false }: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const width = useWidth(wrap, 720);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [show, setShow] = useState<Show>("ambos");
  const focus = hover ?? pinned;

  const layers = (["entrante", "saliente"] as Direction[])
    .map((mode) => datasets.find((d) => d.mode === mode))
    .filter((d): d is MapDataset => Boolean(d));
  const combined = layers.length === 2;
  const visible = combined && show !== "ambos" ? layers.filter((l) => l.mode === show) : layers;
  const dirOf = (d: MapDataset) => d.mode as Direction;
  const unit = layers[0]?.unit || "participantes";

  // Si el corte no tiene datos, se usa el último que sí los tenga y se dice.
  const hasYear = (y: number) => layers.some((d) => d.values[y] && Object.keys(d.values[y]!).length > 0);
  const available = years.filter(hasYear);
  // Todo el periodo se muestra agrupado si el mapa tiene cifras; si no, el último año con dato.
  const groupedReady = year === ALL_YEARS && available.length > 0;
  const shownYear = groupedReady ? ALL_YEARS : available.includes(year) ? year : available[available.length - 1];
  const shownLabel = shownYear === ALL_YEARS ? `${cutLabel(ALL_YEARS, null)} · ${GROUPED_AS}` : shownYear === undefined ? "" : String(shownYear);
  const SITES = campuses.map((c) => c.id).filter((id) => id !== "todas");
  const activeSites = campus === "todas" ? SITES : SITES.filter((s) => s === campus);
  const campusName = (site: string) => campuses.find((c) => c.id === site)?.name ?? site;
  const siteValues = (d: MapDataset) => (d.values[shownYear] ?? {}) as Record<string, Record<string, number>>;

  /** totales[sentido][país] para los campus activos. */
  const byDir: Record<Direction, Record<string, number>> = { entrante: {}, saliente: {} };
  for (const d of layers) {
    for (const site of activeSites) {
      for (const [code, value] of Object.entries(siteValues(d)[site] ?? {})) {
        if (code === HOME) continue;
        byDir[dirOf(d)][code] = (byDir[dirOf(d)][code] ?? 0) + value;
      }
    }
  }
  const totals: Record<string, number> = {};
  for (const d of visible) {
    for (const [code, value] of Object.entries(byDir[dirOf(d)])) totals[code] = (totals[code] ?? 0) + value;
  }
  const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
  const grand = sum(totals);
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = ranking[0]?.[1] ?? 1;
  const rank = new Map(ranking.map(([code], index) => [code, index]));
  const maxByDir = Math.max(1, ...visible.flatMap((d) => Object.values(byDir[dirOf(d)])));

  // Escala logarítmica en siete tramos: el país con 2 participantes tiene que
  // distinguirse del que no tiene ninguno, aunque otro sume doscientos.
  const top = Math.log10(Math.max(10, max));
  const binOf = (value: number | undefined) => (value ? Math.max(1, Math.min(BINS, Math.ceil((Math.log10(value) / top) * BINS))) : 0);
  const thresholds = Array.from({ length: BINS }, (_, i) => Math.round(10 ** (((i + 1) / BINS) * top)));

  const siteTotal = (site: string, dir?: Direction) =>
    visible
      .filter((d) => !dir || dirOf(d) === dir)
      .reduce((acc, d) => acc + Object.entries(siteValues(d)[site] ?? {}).reduce((s, [code, v]) => (code === HOME ? s : s + v), 0), 0);

  // Las ciudades de los campus quedan a pocos píxeles entre sí a escala mundial:
  // las rutas llegan al centro de los campus activos, no a cada uno.
  const sitePoints = activeSites.map((s) => WORLD_CAMPUS_POINTS[s]).filter(Boolean);
  const hub: Point = sitePoints.length
    ? [
        Math.round((sitePoints.reduce((a, p) => a + p[0], 0) / sitePoints.length) * 10) / 10,
        Math.round((sitePoints.reduce((a, p) => a + p[1], 0) / sitePoints.length) * 10) / 10,
      ]
    : BY_CODE[HOME].c;

  // Encuadre compacto: todos los países con dato en el periodo mostrado, de
  // cualquier campus y sentido, para que el filtro no mueva la cámara.
  const framed = new Set<string>();
  for (const d of layers) for (const site of SITES) for (const code of Object.keys(siteValues(d)[site] ?? {})) framed.add(code);
  const box = compact
    ? fitBox([hub, ...[...framed].filter((c) => BY_CODE[c]).map((c) => BY_CODE[c].c)])
    : { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };

  const scale = width / box.w;
  const stroke = (px: number) => px / Math.max(scale, 0.45);
  const perLayer = combined && show === "ambos" ? (compact ? 10 : 14) : compact ? 14 : 24;
  const routes = visible.flatMap((d, layerIndex) => {
    const dir = dirOf(d);
    const incoming = dir === "entrante";
    // Ida y vuelta al mismo país: la entrante se abomba más que la saliente.
    const bend = combined ? (incoming ? 0.32 : 0.12) : 0.26;
    return Object.entries(byDir[dir])
      .filter(([code]) => BY_CODE[code])
      .sort((a, b) => b[1] - a[1])
      .slice(0, perLayer)
      .map(([code, value], index) => {
        const place = BY_CODE[code].c;
        const shape = incoming ? arc(place, hub, bend) : arc(hub, place, bend);
        const strength = Math.sqrt(value / maxByDir);
        const duration = 2.2 + shape.length / 260 - strength * 0.9;
        return {
          key: `${dir}-${code}`,
          dir,
          code,
          index,
          strength,
          d: shape.d,
          end: incoming ? hub : place,
          duration,
          // Desfase determinista: los cometas no salen todos a la vez.
          delay: (((index + layerIndex * 0.5) * 0.618) % 1) * duration,
        };
      });
  });

  const hubLeft = ((hub[0] - box.x) / box.w) * 100;
  const hubTop = ((hub[1] - box.y) / box.h) * 100;
  const rankRows = ranking.slice(0, compact ? 5 : 8);
  const soleDir = visible.length === 1 ? dirOf(visible[0]) : null;

  const pointer = (code: string) => (event: PointerEvent) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(code);
    setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 12 });
  };
  const toggle = (code: string) => setPinned((p) => (p === code ? null : code));
  const pct = (value: number) => formatValue((value / (grand || 1)) * 100, "decimal");
  const title = layers.map((l) => l.title).join(" y ");

  return (
    <div
      className="od-world"
      data-seen={seen || undefined}
      data-motion={!reduced || undefined}
      data-compact={compact || undefined}
      data-combined={combined || undefined}
    >
      <div className="od-world__layout">
      <div ref={wrap} className="od-world__canvas">
        <svg
          viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
          role="img"
          data-framed={box.w < WORLD_WIDTH || undefined}
          aria-label={`${title}, ${shownLabel}. El detalle está en el ranking de países.`}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        >
          <g className="od-world__countries">
            {COUNTRIES.filter((c) => c.d).map((country) => {
              const value = totals[country.code];
              const home = country.code === HOME;
              return (
                <path
                  key={country.code}
                  d={country.d}
                  className="od-world__country"
                  data-home={home || undefined}
                  data-value={value ? true : undefined}
                  data-active={focus === country.code || undefined}
                  data-dim={focus !== null && focus !== country.code && !home ? true : undefined}
                  style={{ fill: home ? undefined : `var(--od-seq-${binOf(value)})`, "--i": Math.min(rank.get(country.code) ?? 30, 30) } as CSSProperties}
                  onPointerMove={value ? pointer(country.code) : () => { setHover(null); setTip(null); }}
                  onClick={value ? () => toggle(country.code) : undefined}
                />
              );
            })}
          </g>

          {/* Países sin silueta a esta escala (Singapur, Malta…): un punto. */}
          {ranking
            .filter(([code]) => BY_CODE[code] && !BY_CODE[code].d)
            .map(([code, value]) => {
              const [cx, cy] = BY_CODE[code].c;
              return (
                <g key={code} className="od-world__islet" data-dim={focus !== null && focus !== code ? true : undefined}
                  onPointerMove={pointer(code)} onClick={() => toggle(code)}>
                  <circle cx={cx} cy={cy} r={stroke(9)} fill="transparent" />
                  <circle cx={cx} cy={cy} r={stroke(3.2)} style={{ fill: `var(--od-seq-${Math.max(3, binOf(value))})` }} />
                </g>
              );
            })}

          <g className="od-world__routes" aria-hidden="true">
            {routes.map((route) => {
              const base = 0.9 + route.strength * 2.6;
              const vars = {
                "--i": route.index,
                "--dur": `${route.duration.toFixed(2)}s`,
                "--delay": `${route.delay.toFixed(2)}s`,
              } as CSSProperties;
              return (
                <g
                  key={route.key}
                  className="od-world__route"
                  data-dir={route.dir}
                  data-dim={(focus !== null && focus !== route.code) || undefined}
                  data-active={focus === route.code || undefined}
                  style={vars}
                >
                  <path className="od-world__track" d={route.d} pathLength={1} style={{ strokeWidth: stroke(base) }} />
                  {!reduced && (
                    <>
                      <path className="od-world__trail" d={route.d} pathLength={1} style={{ strokeWidth: stroke(base * 1.5 + 0.6) }} />
                      <path className="od-world__comet" d={route.d} pathLength={1} style={{ strokeWidth: stroke(base * 1.6 + 2.6) }} />
                      <circle className="od-world__ripple" cx={route.end[0]} cy={route.end[1]} r={stroke(4 + route.strength * 5)} style={{ strokeWidth: stroke(1.4) }} />
                    </>
                  )}
                </g>
              );
            })}
          </g>

          <g className="od-world__hub">
            <circle className="od-world__hub-pulse" cx={hub[0]} cy={hub[1]} r={stroke(7)} />
            {sitePoints.map(([x, y], i) => (
              <circle key={i} className="od-world__site" cx={x} cy={y} r={stroke(2.4)} />
            ))}
            <circle className="od-world__hub-dot" cx={hub[0]} cy={hub[1]} r={stroke(5)} style={{ strokeWidth: stroke(2) }}>
              <title>UDES · Colombia</title>
            </circle>
          </g>
        </svg>

        <div
          className="od-world__hub-label"
          data-side={hubLeft > 60 ? "left" : "right"}
          style={{ left: `${hubLeft}%`, top: `${hubTop}%` } as CSSProperties}
        >
          <strong>UDES</strong>
          <span>
            {campus === "todas" ? "Colombia" : campusName(campus)} · {formatCount(grand)}
          </span>
        </div>

        {hover && tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 140 ? "start" : tip.x > width - 140 ? "end" : "center"}>
            <strong>{BY_CODE[hover]?.name ?? hover}</strong>
            {(totals[hover] ?? 0) > 0 ? (
              <>
                {visible.map((d) => (
                  <span key={d.mode}>
                    {visible.length > 1 && <i className="od-world__dot" data-dir={dirOf(d)} />}
                    {formatCount(byDir[dirOf(d)][hover] ?? 0)} {visible.length > 1 ? DIRECTION_LABEL[dirOf(d)].short.toLowerCase() : unit}
                  </span>
                ))}
                <span>{pct(totals[hover])} % · puesto {(rank.get(hover) ?? 0) + 1} de {ranking.length}</span>
              </>
            ) : (
              <span>Sin {unit} en {shownLabel}</span>
            )}
          </ChartTooltip>
        )}

        {ranking.length === 0 && (
          <p className="od-world__empty">Sin participantes reportados {shownLabel ? `en ${shownLabel}` : "todavía"}.</p>
        )}
      </div>

      <div className="od-world__panel">
        <div className="od-world__summary">
          {combined && (
            <div className="od-world__show" role="group" aria-label="Sentido de la movilidad">
              {(["ambos", "entrante", "saliente"] as Show[]).map((option) => (
                <button key={option} type="button" aria-pressed={show === option} data-dir={option} onClick={() => setShow(option)}>
                  {option !== "ambos" && <i className="od-world__dot" data-dir={option} />}
                  {option === "ambos" ? "Ambos" : DIRECTION_LABEL[option].short}
                </button>
              ))}
            </div>
          )}
          <div className="od-map__total">
            <span>
              {soleDir ? DIRECTION_LABEL[soleDir].total : "Participantes en movilidad"}
              {shownLabel ? ` · ${shownLabel}` : ""}
            </span>
            <strong>{formatCount(grand)}</strong>
            {visible.length > 1 && (
              <span className="od-world__split">
                {visible.map((d) => (
                  <b key={d.mode}>
                    <i className="od-world__dot" data-dir={dirOf(d)} />
                    {formatCount(sum(byDir[dirOf(d)]))} {DIRECTION_LABEL[dirOf(d)].short.toLowerCase()}
                  </b>
                ))}
              </span>
            )}
            <small>
              {campus === "todas" ? "Todos los campus" : campusName(campus)} · {ranking.length} {ranking.length === 1 ? "país" : "países"}
            </small>
            {shownYear !== undefined && shownYear !== year && (
              <small className="od-map__note">El corte {cutLabel(year, null)} no tiene este mapa: se muestra {shownLabel}.</small>
            )}
          </div>
          {SITES.length > 1 && (
            <ul className="od-world__campuses" aria-label="Campus">
              {SITES.map((site) => (
                <li key={site}>
                  <button
                    type="button"
                    aria-pressed={campus === site}
                    data-dim={(campus !== "todas" && campus !== site) || undefined}
                    onClick={() => onSelectCampus?.(campus === site ? "todas" : site)}
                  >
                    <span>{campusName(site)}</span>
                    <b>{formatCount(siteTotal(site))}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="od-world__ranking-wrap">
          {pinned && (
            <div className="od-map__pinned">
              <div className="od-map__pinned-head">
                <strong>{BY_CODE[pinned]?.name ?? pinned}</strong>
                <button type="button" onClick={() => setPinned(null)} aria-label="Quitar selección">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <ul>
                {SITES.map((site) => (
                  <li key={site}>
                    <span>{campusName(site)}</span>
                    <span className="od-world__pinned-values">
                      {visible.map((d) => (
                        <b key={d.mode}>
                          {visible.length > 1 && <i className="od-world__dot" data-dir={dirOf(d)} />}
                          {formatCount(siteValues(d)[site]?.[pinned] ?? 0)}
                        </b>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="od-world__ranking" aria-label="Participantes por país">
            {rankRows.map(([code, value]) => (
              <li key={code}>
                <button
                  type="button"
                  data-active={focus === code || undefined}
                  aria-pressed={pinned === code}
                  onPointerEnter={() => setHover(code)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(code)}
                  onBlur={() => setHover(null)}
                  onClick={() => toggle(code)}
                >
                  <span className="od-world__rank-name">{BY_CODE[code]?.name ?? code}</span>
                  <span className="od-world__rank-value">
                    {formatCount(value)}
                    {!compact && <small> · {pct(value)} %</small>}
                  </span>
                  <span className="od-world__rank-bars" aria-hidden="true">
                    {visible.map((d) => (
                      <i key={d.mode} data-dir={dirOf(d)} style={{ width: `${((byDir[dirOf(d)][code] ?? 0) / max) * 100}%` }} />
                    ))}
                  </span>
                  {visible.length > 1 && (
                    <span className="sr-only">
                      {visible.map((d) => `${formatCount(byDir[dirOf(d)][code] ?? 0)} ${DIRECTION_LABEL[dirOf(d)].short.toLowerCase()}`).join(", ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          {ranking.length > rankRows.length && (
            <small className="od-world__more">y {ranking.length - rankRows.length} {ranking.length - rankRows.length === 1 ? "país más" : "países más"} en el mapa</small>
          )}
        </div>

        <div className="od-world__legend" aria-hidden="true">
          <div>
            <div className="od-map__ramp">
              {Array.from({ length: BINS }, (_, i) => (
                <i key={i} style={{ background: `var(--od-seq-${i + 1})` }} />
              ))}
            </div>
            <div className="od-map__ramp-labels">
              <span>1</span>
              <span>{formatValue(thresholds[3], "entero")}</span>
              <span>{formatValue(thresholds[BINS - 1], "entero")}</span>
            </div>
          </div>
          {visible.map((d) => (
            <p key={d.mode}>
              <i className="od-world__route-key" data-dir={dirOf(d)} />
              {DIRECTION_LABEL[dirOf(d)].route}
            </p>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}
