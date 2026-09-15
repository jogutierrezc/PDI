/* =============================================================================
   Mapa de Colombia: población y origen.

   Cada departamento se colorea con la escala azul según la gente que aporta a
   la universidad (o que atiende, en cobertura). Al entrar en pantalla los
   departamentos se encienden de mayor a menor y, en modo origen, líneas de
   llegada corren desde cada departamento hasta el campus donde estudia su gente.
   El círculo de cada campus crece con su población y late suave.

   Interacción: pasar por un departamento o por su fila del ranking lo resalta
   y cuenta sus cifras; un clic lo fija y muestra el reparto por campus. El campus
   del filtro de la página aísla sus flujos. El ranking es la vía accesible:
   el mapa repite lo mismo en forma de figura.
   ========================================================================== */

import { useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { CSSProperties } from "react";
import { formatValue } from "../data/open-data";
import type { Campus, CampusId, MapDataset } from "../data/types";
import { CAMPUS_POINTS, DEPARTMENTS, MAP_HEIGHT, MAP_WIDTH } from "../data/colombia-map";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

const NAMES = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d.name]));
const CENTROIDS = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d.c]));
const BINS = 7;

interface ColombiaMapProps {
  dataset: MapDataset;
  year: number;
  years: number[];
  campus: CampusId;
  campuses: Campus[];
  onSelectCampus?: (campus: CampusId) => void;
}

export function ColombiaMap({ dataset, year, years, campus, campuses, onSelectCampus }: ColombiaMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const width = useWidth(wrap, 520);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const focus = hover ?? pinned;

  // Si el corte no tiene datos, se usa el último que sí los tenga y se dice.
  const available = years.filter((y) => dataset.values[y] && Object.keys(dataset.values[y]!).length > 0);
  const shownYear = available.includes(year) ? year : available[available.length - 1];
  const bySite: Record<string, Record<string, number>> = (dataset.values[shownYear] ?? {}) as Record<string, Record<string, number>>;
  // Los campus salen del periodo, no de una lista fija. Solo se dibujan los que
  // tienen ubicación conocida en el mapa.
  const SITES = campuses.map((c) => c.id).filter((id) => id !== "todas" && CAMPUS_POINTS[id]);
  const activeSites = campus === "todas" ? SITES : SITES.filter((s) => s === campus);
  // El departamento "de casa" de cada campus es el que más gente le aporta: sus
  // estudiantes no viajan, así que no dibujan línea de llegada.
  const homeOf = (site: string) =>
    Object.entries(bySite[site] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];

  const totals: Record<string, number> = {};
  for (const site of activeSites) {
    for (const [code, value] of Object.entries(bySite[site] ?? {})) {
      totals[code] = (totals[code] ?? 0) + value;
    }
  }

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = ranking[0]?.[1] ?? 1;

  // Escala logarítmica en siete tramos: un departamento con 30 personas tiene
  // que distinguirse del que no aporta ninguna, aunque el campus sume diez mil.
  const binOf = (value: number | undefined) => {
    if (!value) return 0;
    const t = Math.log10(value) / Math.log10(Math.max(10, max));
    return Math.max(1, Math.min(BINS, Math.ceil(t * BINS)));
  };
  const thresholds = Array.from({ length: BINS }, (_, i) => Math.round(10 ** (((i + 1) / BINS) * Math.log10(Math.max(10, max)))));

  const scale = width / MAP_WIDTH;
  const siteTotals = SITES.map((site) => ({
    site,
    total: Object.values(bySite[site] ?? {}).reduce((a, b) => a + b, 0),
  }));
  const maxSite = Math.max(1, ...siteTotals.map((s) => s.total));

  const flows =
    dataset.mode === "origen"
      ? activeSites.flatMap((site) =>
          Object.entries(bySite[site] ?? {})
            .filter(([code]) => code !== homeOf(site) && CENTROIDS[code])
            .sort((a, b) => b[1] - a[1])
            .slice(0, campus === "todas" ? 6 : 10)
            .map(([code, value]) => ({ site, code, value })),
        )
      : [];
  const maxFlow = Math.max(1, ...flows.map((f) => f.value));

  const rank = new Map(ranking.map(([code], index) => [code, index]));
  const focusValue = focus ? totals[focus] ?? 0 : 0;

  return (
    <div className="od-map" data-seen={seen || undefined} data-motion={!reduced || undefined}>
      <div ref={wrap} className="od-map__canvas">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`${dataset.title}, ${shownYear}. El detalle está en el ranking de departamentos.`}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        >
          <g className="od-map__departments">
            {DEPARTMENTS.map((dept) => {
              const value = totals[dept.code];
              const order = rank.get(dept.code) ?? 40;
              return (
                <path
                  key={dept.code}
                  d={dept.d}
                  className="od-map__dept"
                  data-active={focus === dept.code || undefined}
                  data-dim={focus !== null && focus !== dept.code ? true : undefined}
                  style={{ fill: `var(--od-seq-${binOf(value)})`, "--i": Math.min(order, 34) } as CSSProperties}
                  onPointerMove={(event) => {
                    const box = wrap.current?.getBoundingClientRect();
                    if (!box) return;
                    setHover(dept.code);
                    setTip({ x: event.clientX - box.left, y: event.clientY - box.top - 12 });
                  }}
                  onClick={() => setPinned((p) => (p === dept.code ? null : dept.code))}
                />
              );
            })}
          </g>

          {flows.map((flow, index) => {
            const [x0, y0] = CENTROIDS[flow.code];
            const [x1, y1] = CAMPUS_POINTS[flow.site];
            const mx = (x0 + x1) / 2;
            const my = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * 0.28;
            const strength = flow.value / maxFlow;
            return (
              <path
                key={`${flow.site}-${flow.code}`}
                className="od-map__flow"
                data-dim={focus !== null && focus !== flow.code ? true : undefined}
                d={`M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`}
                style={
                  {
                    strokeWidth: (1.2 + strength * 4.5) / Math.max(scale, 0.6),
                    "--i": index,
                    "--speed": `${2.6 - strength * 1.2}s`,
                  } as CSSProperties
                }
              />
            );
          })}

          {SITES.map((site) => {
            const [cx, cy] = CAMPUS_POINTS[site];
            const total = siteTotals.find((s) => s.site === site)?.total ?? 0;
            const r = 6 + Math.sqrt(total / maxSite) * 22;
            const dimmed = campus !== "todas" && campus !== site;
            const name = campuses.find((c) => c.id === site)?.name ?? site;
            return (
              <g
                key={site}
                className="od-map__site"
                data-dim={dimmed || undefined}
                onClick={() => onSelectCampus?.(campus === site ? "todas" : site)}
              >
                <circle className="od-map__pulse" cx={cx} cy={cy} r={r} />
                <circle className="od-map__site-dot" cx={cx} cy={cy} r={r}>
                  <title>{name}</title>
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Rótulos de campus en HTML: mantienen su tamaño de letra aunque el mapa
            se encoja en el móvil. Si otro campus queda cerca a la derecha, el
            rótulo se va a la izquierda para no pisarlo. */}
        {SITES.map((site) => {
          const [cx, cy] = CAMPUS_POINTS[site];
          const total = siteTotals.find((s) => s.site === site)?.total ?? 0;
          const r = 6 + Math.sqrt(total / maxSite) * 22;
          const crowded = SITES.some((other) => {
            if (other === site) return false;
            const [ox, oy] = CAMPUS_POINTS[other];
            return ox > cx && ox - cx < 70 && Math.abs(oy - cy) < 70;
          });
          const name = campuses.find((c) => c.id === site)?.name ?? site;
          return (
            <button
              key={`label-${site}`}
              type="button"
              className="od-map__label"
              data-side={crowded ? "left" : "right"}
              data-dim={(campus !== "todas" && campus !== site) || undefined}
              aria-pressed={campus === site}
              style={
                {
                  left: `${(cx / MAP_WIDTH) * 100}%`,
                  top: `${(cy / MAP_HEIGHT) * 100}%`,
                  "--offset": `${r * scale + 8}px`,
                } as CSSProperties
              }
              onClick={() => onSelectCampus?.(campus === site ? "todas" : site)}
            >
              <strong>{name}</strong>
              <span>{formatValue(total, "entero")}</span>
            </button>
          );
        })}

        {hover && tip && (
          <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 140 ? "start" : tip.x > width - 140 ? "end" : "center"}>
            <strong>{NAMES[hover]}</strong>
            {focusValue > 0 ? (
              <>
                <span>
                  {formatValue(focusValue, "entero")} {dataset.unit} · {formatValue((focusValue / grand) * 100, "decimal")} %
                </span>
                <span>Puesto {(rank.get(hover) ?? 0) + 1} de {ranking.length}</span>
              </>
            ) : (
              <span>Sin {dataset.unit} en {shownYear}</span>
            )}
          </ChartTooltip>
        )}
      </div>

      <aside className="od-map__panel">
        <div className="od-map__total">
          <span>{dataset.mode === "origen" ? "Estudiantes" : "Personas"} · {shownYear}</span>
          <strong>{formatValue(grand, "entero")}</strong>
          <small>
            {campus === "todas" ? "Todos los campus" : campuses.find((c) => c.id === campus)?.name} · {ranking.length} departamentos
          </small>
          {shownYear !== year && <small className="od-map__note">El corte {year} no tiene este mapa: se muestra {shownYear}.</small>}
        </div>

        {pinned && (
          <div className="od-map__pinned">
            <div className="od-map__pinned-head">
              <strong>{NAMES[pinned]}</strong>
              <button type="button" onClick={() => setPinned(null)} aria-label="Quitar selección">
                <Icon name="close" size={14} />
              </button>
            </div>
            <ul>
              {SITES.map((site) => {
                const v = bySite[site]?.[pinned] ?? 0;
                return (
                  <li key={site}>
                    <span>{campuses.find((c) => c.id === site)?.name}</span>
                    <b>{formatValue(v, "entero")}</b>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ol className="od-map__ranking" aria-label="Departamentos con más personas">
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
                onClick={() => setPinned((p) => (p === code ? null : code))}
              >
                <span className="od-map__rank-name">{NAMES[code] ?? code}</span>
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
          {dataset.mode === "origen" && (
            <p>
              <i className="od-map__flow-key" /> Llegadas a cada campus desde fuera de su departamento
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
