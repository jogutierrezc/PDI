/* =============================================================================
   Mapa del mundo: movilidad internacional.

   Dos lecturas del mismo dibujo, según el modo del conjunto:
   · "entrante": participantes que llegan de otro país a un campus de la UDES.
     Las rutas nacen en el país de origen y terminan en Colombia.
   · "saliente": participantes que salen de un campus a otro país. Las rutas
     nacen en Colombia y terminan en el país de destino.

   Cada país se colorea con la escala azul según sus participantes. Al entrar en
   pantalla las rutas se trazan de la más fuerte a la más débil; después un
   cometa con estela recorre cada una en el sentido del viaje y, al llegar,
   deja una onda en el destino. Las rutas con más gente van más rápido y más
   gruesas. Con "menos movimiento" las rutas quedan dibujadas y quietas.

   Interacción: pasar por un país o por su fila del ranking lo resalta y aísla
   su ruta; un clic lo fija y muestra el reparto por campus. El campus del
   filtro de la página aísla sus cifras. El ranking es la vía accesible.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { formatValue } from "../data/open-data";
import type { Campus, CampusId, MapDataset } from "../data/types";
import { COUNTRIES, WORLD_CAMPUS_POINTS, WORLD_HEIGHT, WORLD_WIDTH } from "../data/world-map";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));
const HOME = "COL";
const BINS = 7;
const MAX_ROUTES = 24;

interface WorldMapProps {
  dataset: MapDataset;
  year: number;
  years: number[];
  campus: CampusId;
  campuses: Campus[];
  onSelectCampus?: (campus: CampusId) => void;
}

/** Arco de `from` a `to`, abombado hacia el norte: se lee como un vuelo. */
function arc([x0, y0]: [number, number], [x1, y1]: [number, number]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy) || 1;
  let nx = -dy / chord;
  let ny = dx / chord;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const lift = Math.min(150, chord * 0.26);
  const cx = (x0 + x1) / 2 + nx * lift;
  const cy = (y0 + y1) / 2 + ny * lift;
  // Longitud aproximada de la curva: decide la duración del viaje.
  const length = (chord + Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) / 2;
  return { d: `M${x0} ${y0}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1} ${y1}`, length };
}

export function WorldMap({ dataset, year, years, campus, campuses, onSelectCampus }: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const width = useWidth(wrap, 720);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const focus = hover ?? pinned;
  const incoming = dataset.mode === "entrante";

  // Si el corte no tiene datos, se usa el último que sí los tenga y se dice.
  const available = years.filter((y) => dataset.values[y] && Object.keys(dataset.values[y]!).length > 0);
  const shownYear = available.includes(year) ? year : available[available.length - 1];
  const bySite = (dataset.values[shownYear] ?? {}) as Record<string, Record<string, number>>;
  const SITES = campuses.map((c) => c.id).filter((id) => id !== "todas");
  const activeSites = campus === "todas" ? SITES : SITES.filter((s) => s === campus);
  const campusName = (site: string) => campuses.find((c) => c.id === site)?.name ?? site;

  const totals: Record<string, number> = {};
  for (const site of activeSites) {
    for (const [code, value] of Object.entries(bySite[site] ?? {})) {
      if (code === HOME) continue;
      totals[code] = (totals[code] ?? 0) + value;
    }
  }
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = ranking[0]?.[1] ?? 1;
  const rank = new Map(ranking.map(([code], index) => [code, index]));

  // Escala logarítmica en siete tramos: el país con 2 participantes tiene que
  // distinguirse del que no tiene ninguno, aunque otro sume doscientos.
  const top = Math.log10(Math.max(10, max));
  const binOf = (value: number | undefined) => (value ? Math.max(1, Math.min(BINS, Math.ceil((Math.log10(value) / top) * BINS))) : 0);
  const thresholds = Array.from({ length: BINS }, (_, i) => Math.round(10 ** (((i + 1) / BINS) * top)));

  const siteTotals = SITES.map((site) => ({
    site,
    total: Object.entries(bySite[site] ?? {}).reduce((sum, [code, v]) => (code === HOME ? sum : sum + v), 0),
  }));

  // Las ciudades de los campus quedan a pocos píxeles entre sí a escala mundial:
  // las rutas llegan al centro de los campus activos, no a cada uno.
  const sitePoints = activeSites.map((s) => WORLD_CAMPUS_POINTS[s]).filter(Boolean);
  const hub: [number, number] = sitePoints.length
    ? [
        Math.round((sitePoints.reduce((a, p) => a + p[0], 0) / sitePoints.length) * 10) / 10,
        Math.round((sitePoints.reduce((a, p) => a + p[1], 0) / sitePoints.length) * 10) / 10,
      ]
    : BY_CODE[HOME].c;

  const scale = width / WORLD_WIDTH;
  const stroke = (px: number) => px / Math.max(scale, 0.45);
  const routes = ranking
    .filter(([code]) => BY_CODE[code])
    .slice(0, MAX_ROUTES)
    .map(([code, value], index) => {
      const place = BY_CODE[code].c;
      const shape = incoming ? arc(place, hub) : arc(hub, place);
      const strength = Math.sqrt(value / max);
      // Más gente, viaje más ágil; más distancia, viaje más largo.
      const duration = 2.2 + shape.length / 260 - strength * 0.9;
      return {
        code,
        value,
        index,
        strength,
        d: shape.d,
        end: incoming ? hub : place,
        duration,
        // Desfase determinista: los cometas no salen todos a la vez.
        delay: ((index * 0.618) % 1) * duration,
      };
    });

  const focusValue = focus ? totals[focus] ?? 0 : 0;
  const hubLeft = (hub[0] / WORLD_WIDTH) * 100;
  const hubTop = (hub[1] / WORLD_HEIGHT) * 100;
  const countryLabel = incoming ? "país de origen" : "país de destino";

  const pointer = (code: string) => (event: PointerEvent) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    setHover(code);
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top - 12 });
  };
  const toggle = (code: string) => setPinned((p) => (p === code ? null : code));

  return (
    <div className="od-world" data-seen={seen || undefined} data-motion={!reduced || undefined} data-mode={dataset.mode}>
      <div ref={wrap} className="od-world__canvas">
        <svg
          viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
          role="img"
          aria-label={`${dataset.title}, ${shownYear}. El detalle está en el ranking de países.`}
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
              const dim = focus !== null && focus !== route.code;
              const base = 0.9 + route.strength * 2.6;
              const vars = {
                "--i": route.index,
                "--dur": `${route.duration.toFixed(2)}s`,
                "--delay": `${route.delay.toFixed(2)}s`,
              } as CSSProperties;
              return (
                <g key={route.code} className="od-world__route" data-dim={dim || undefined} data-active={focus === route.code || undefined} style={vars}>
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
            {campus === "todas" ? "Colombia" : campusName(campus)} · {formatValue(grand, "entero")}
          </span>
        </div>

        {hover && tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 140 ? "start" : tip.x > width - 140 ? "end" : "center"}>
            <strong>{BY_CODE[hover]?.name ?? hover}</strong>
            {focusValue > 0 ? (
              <>
                <span>
                  {formatValue(focusValue, "entero")} {dataset.unit} · {formatValue((focusValue / grand) * 100, "decimal")} %
                </span>
                <span>{incoming ? "Hacia" : "Desde"} {campus === "todas" ? "la UDES" : campusName(campus)} · puesto {(rank.get(hover) ?? 0) + 1} de {ranking.length}</span>
              </>
            ) : (
              <span>Sin {dataset.unit} en {shownYear}</span>
            )}
          </ChartTooltip>
        )}

        {ranking.length === 0 && (
          <p className="od-world__empty">Sin participantes reportados {shownYear ? `en ${shownYear}` : "todavía"}.</p>
        )}
      </div>

      <div className="od-world__panel">
        <div className="od-map__total">
          <span>
            {incoming ? "Participantes entrantes" : "Participantes salientes"}
            {shownYear ? ` · ${shownYear}` : ""}
          </span>
          <strong>{formatValue(grand, "entero")}</strong>
          <small>
            {campus === "todas" ? "Todos los campus" : campusName(campus)} · {ranking.length} {ranking.length === 1 ? "país" : "países"}
          </small>
          {shownYear !== undefined && shownYear !== year && (
            <small className="od-map__note">El corte {year} no tiene este mapa: se muestra {shownYear}.</small>
          )}
          {SITES.length > 1 && (
            <ul className="od-world__campuses" aria-label={incoming ? "Campus de llegada" : "Campus de salida"}>
              {siteTotals.map(({ site, total }) => (
                <li key={site}>
                  <button
                    type="button"
                    aria-pressed={campus === site}
                    data-dim={(campus !== "todas" && campus !== site) || undefined}
                    onClick={() => onSelectCampus?.(campus === site ? "todas" : site)}
                  >
                    <span>{campusName(site)}</span>
                    <b>{formatValue(total, "entero")}</b>
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
                    <b>{formatValue(bySite[site]?.[pinned] ?? 0, "entero")}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="od-map__ranking" aria-label={`Participantes por ${countryLabel}`}>
            {ranking.slice(0, 8).map(([code, value]) => (
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
                  <span className="od-map__rank-name">{BY_CODE[code]?.name ?? code}</span>
                  <span className="od-map__rank-value">
                    {formatValue(value, "entero")}
                    <small> · {formatValue((value / grand) * 100, "decimal")} %</small>
                  </span>
                  <span className="od-map__rank-bar" aria-hidden="true">
                    <i style={{ width: `${(value / max) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="od-map__legend" aria-hidden="true">
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
          <p>
            <i className="od-world__route-key" data-reverse={incoming || undefined} />
            {incoming ? "Del país de origen a la UDES" : "De la UDES al país de destino"}
          </p>
        </div>
      </div>
    </div>
  );
}
