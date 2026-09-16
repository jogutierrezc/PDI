/* =============================================================================
   Mapa de calor del mundo: convenios internacionales por país.

   Cada país se pinta con la escala azul según cuántos convenios tiene. No hay
   rutas: el color es la cifra. Al entrar en pantalla el color se esparce desde
   Colombia hacia afuera, país por país según su distancia, y cambia con una
   transición suave cuando cambia el campus o el corte.

   Escala: con pocos convenios (hasta 7 en el país con más) cada cifra es su
   propio tramo, para que 1, 2 y 3 se distingan; con más, siete tramos
   logarítmicos si la cifra mayor pasa de 30 y lineales si no. La leyenda es
   interactiva: pasar por un tramo apaga los países que no están en él.

   Registro: "global" es una sola cifra sin año (convenios vigentes) y no cambia
   con el corte; "anual" muestra el año elegido o, en todo el periodo, la suma.

   Interacción: pasar por un país o por su fila del ranking lo resalta; un clic
   lo fija y muestra el reparto por campus. El ranking es la vía accesible.
   ========================================================================== */

import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { formatCount, formatValue } from "../data/open-data";
import { ALL_YEARS, cutLabel } from "../data/terms";
import type { Campus, CampusId, MapDataset } from "../data/types";
import { COUNTRIES } from "../data/world-map";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";
import { BY_CODE, HOME, WORLD_BOX, fitBox } from "./world-geo";

const MAX_BINS = 7;

interface AgreementsMapProps {
  dataset: MapDataset;
  year: number;
  years: number[];
  campus: CampusId;
  campuses: Campus[];
  onSelectCampus?: (campus: CampusId) => void;
  compact?: boolean;
}

/** Tramos de color: límite superior de cada uno y rótulo "3–5". */
function scaleFor(max: number) {
  if (max <= 0) return { bins: [] as { upper: number; label: string; tone: number }[] };
  let uppers: number[];
  if (max <= MAX_BINS && Number.isInteger(max)) {
    uppers = Array.from({ length: max }, (_, i) => i + 1);
  } else if (max > 30) {
    uppers = Array.from({ length: MAX_BINS }, (_, i) => Math.ceil(10 ** (((i + 1) / MAX_BINS) * Math.log10(max))));
  } else {
    uppers = Array.from({ length: MAX_BINS }, (_, i) => Math.ceil((max * (i + 1)) / MAX_BINS));
  }
  uppers = uppers.filter((u, i) => i === 0 || u > uppers[i - 1]);
  uppers[uppers.length - 1] = Math.max(uppers[uppers.length - 1], Math.ceil(max));
  const count = uppers.length;
  return {
    bins: uppers.map((upper, i) => {
      const lower = i === 0 ? 1 : uppers[i - 1] + 1;
      // Los tramos se reparten entre el tono 2 y el 7: el 1 se confunde con un
      // país sin convenios, y un convenio también tiene que verse.
      const tone = count === 1 ? 5 : Math.round(2 + (i * (MAX_BINS - 2)) / (count - 1));
      return { upper, label: lower >= upper ? formatValue(upper, "entero") : `${formatValue(lower, "entero")}–${formatValue(upper, "entero")}`, tone };
    }),
  };
}

export function AgreementsMap({ dataset, year, years, campus, campuses, onSelectCampus, compact = false }: AgreementsMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const width = useWidth(wrap, 720);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [binFocus, setBinFocus] = useState<number | null>(null);
  const focus = hover ?? pinned;
  const global = dataset.reporting === "global";
  const unit = dataset.unit || "convenios";

  const hasData = (key: number) => Object.values(dataset.values[key] ?? {}).some((codes) => codes && Object.keys(codes).length > 0);
  // Global: siempre la clave ALL_YEARS. Por año: el corte elegido, todo el
  // periodo sumado o, si el año no tiene cifras, el último que sí.
  const available = years.filter(hasData);
  const shownKey = global || (year === ALL_YEARS && hasData(ALL_YEARS)) ? ALL_YEARS : available.includes(year) ? year : available[available.length - 1];
  const shownLabel = global
    ? "dato global"
    : shownKey === ALL_YEARS
      ? `${cutLabel(ALL_YEARS, null)} · total`
      : shownKey === undefined
        ? ""
        : String(shownKey);
  const bySite = (shownKey === undefined ? {} : dataset.values[shownKey] ?? {}) as Record<string, Record<string, number>>;

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
  const max = ranking[0]?.[1] ?? 0;
  const rank = new Map(ranking.map(([code], index) => [code, index]));
  const { bins } = scaleFor(max);
  const binOf = (value: number | undefined) => (value ? Math.max(0, bins.findIndex((b) => value <= b.upper)) : -1);
  const toneOf = (value: number | undefined) => (value ? bins[binOf(value)]?.tone ?? MAX_BINS : 0);
  const siteTotal = (site: string) => Object.entries(bySite[site] ?? {}).reduce((s, [code, v]) => (code === HOME ? s : s + v), 0);
  const sitesWithData = SITES.filter((s) => siteTotal(s) > 0);

  // Encuadre compacto: todos los países con cifra en el corte, de cualquier campus.
  const framed = new Set<string>();
  for (const site of SITES) for (const code of Object.keys(bySite[site] ?? {})) framed.add(code);
  const home = BY_CODE[HOME].c;
  const box = compact ? fitBox([home, ...[...framed].filter((c) => BY_CODE[c]).map((c) => BY_CODE[c].c)]) : WORLD_BOX;
  const scale = width / box.w;
  const stroke = (px: number) => px / Math.max(scale, 0.45);
  // Retardo de la ola de color: distancia a Colombia en coordenadas del mapa.
  const waveOf = (c: [number, number]) => Math.round(Math.hypot(c[0] - home[0], c[1] - home[1]) * 1.6);

  const dimmed = (code: string) => {
    if (focus !== null) return focus !== code;
    if (binFocus !== null) return binOf(totals[code]) !== binFocus;
    return false;
  };
  const pointer = (code: string) => (event: PointerEvent) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(code);
    setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 12 });
  };
  const toggle = (code: string) => setPinned((p) => (p === code ? null : code));
  const pct = (value: number) => formatValue((value / (grand || 1)) * 100, "decimal");
  const rankRows = ranking.slice(0, compact ? 5 : 8);

  return (
    <div
      className="od-world od-agreements"
      data-seen={seen || undefined}
      data-motion={!reduced || undefined}
      data-compact={compact || undefined}
    >
      <div className="od-world__layout">
        <div ref={wrap} className="od-world__canvas">
          <svg
            viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
            role="img"
            data-framed={box.w < WORLD_BOX.w || undefined}
            aria-label={`${dataset.title}, ${shownLabel}. El detalle está en el ranking de países.`}
            onPointerLeave={() => {
              setHover(null);
              setTip(null);
            }}
          >
            <g className="od-world__countries">
              {COUNTRIES.filter((c) => c.d).map((country) => {
                const value = totals[country.code];
                const isHome = country.code === HOME;
                return (
                  <path
                    key={country.code}
                    d={country.d}
                    className="od-world__country od-agreements__country"
                    data-home={isHome || undefined}
                    data-value={value ? true : undefined}
                    data-active={focus === country.code || undefined}
                    data-dim={value && dimmed(country.code) ? true : undefined}
                    style={{ fill: isHome ? undefined : `var(--od-seq-${toneOf(value)})`, "--wave": `${waveOf(country.c)}ms` } as CSSProperties}
                    onPointerMove={value ? pointer(country.code) : () => { setHover(null); setTip(null); }}
                    onClick={value ? () => toggle(country.code) : undefined}
                  />
                );
              })}
            </g>

            {ranking
              .filter(([code]) => BY_CODE[code] && !BY_CODE[code].d)
              .map(([code, value]) => {
                const [cx, cy] = BY_CODE[code].c;
                return (
                  <g key={code} className="od-world__islet" data-dim={dimmed(code) || undefined} onPointerMove={pointer(code)} onClick={() => toggle(code)}>
                    <circle cx={cx} cy={cy} r={stroke(9)} fill="transparent" />
                    <circle cx={cx} cy={cy} r={stroke(3.4)} style={{ fill: `var(--od-seq-${Math.max(3, toneOf(value))})` }} />
                  </g>
                );
              })}

            <circle className="od-world__hub-dot" cx={home[0]} cy={home[1]} r={stroke(4)} style={{ strokeWidth: stroke(1.6) }}>
              <title>UDES · Colombia</title>
            </circle>
          </svg>

          {hover && tip && (
            <ChartTooltip x={tip.x} y={tip.y} align={tip.x < 140 ? "start" : tip.x > width - 140 ? "end" : "center"}>
              <strong>{BY_CODE[hover]?.name ?? hover}</strong>
              {(totals[hover] ?? 0) > 0 ? (
                <>
                  <span>
                    {formatCount(totals[hover])} {unit} · {pct(totals[hover])} %
                  </span>
                  <span>Puesto {(rank.get(hover) ?? 0) + 1} de {ranking.length}</span>
                </>
              ) : (
                <span>Sin {unit}</span>
              )}
            </ChartTooltip>
          )}

          {ranking.length === 0 && <p className="od-world__empty">Sin convenios reportados{shownLabel ? ` (${shownLabel})` : ""}.</p>}
        </div>

        <div className="od-world__panel">
          <div className="od-world__summary">
            <div className="od-map__total">
              <span>
                Convenios internacionales{shownLabel ? ` · ${shownLabel}` : ""}
              </span>
              <strong>{formatCount(grand)}</strong>
              <small>
                {campus === "todas" ? "Todos los campus" : campusName(campus)} · {ranking.length} {ranking.length === 1 ? "país" : "países"}
              </small>
              {global && year !== ALL_YEARS && <small className="od-map__note">Es un dato global: no cambia con el corte {year}.</small>}
              {!global && shownKey !== undefined && shownKey !== year && (
                <small className="od-map__note">El corte {cutLabel(year, null)} no tiene este mapa: se muestra {shownLabel}.</small>
              )}
            </div>
            {sitesWithData.length > 1 && (
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
                      <b>{formatCount(bySite[site]?.[pinned] ?? 0)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="od-world__ranking" aria-label="Convenios por país">
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
                      <i style={{ width: `${(value / (max || 1)) * 100}%`, background: `var(--od-seq-${Math.max(3, toneOf(value))})` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {ranking.length > rankRows.length && (
              <small className="od-world__more">
                y {ranking.length - rankRows.length} {ranking.length - rankRows.length === 1 ? "país más" : "países más"} en el mapa
              </small>
            )}
          </div>

          {bins.length > 0 && (
            <div className="od-agreements__legend" role="group" aria-label={`Tramos de ${unit}`}>
              <span className="od-agreements__legend-title">{unit[0].toUpperCase() + unit.slice(1)} por país</span>
              <div className="od-agreements__bins">
                {bins.map((bin, index) => {
                  const count = ranking.filter(([, v]) => binOf(v) === index).length;
                  return (
                    <button
                      key={bin.label}
                      type="button"
                      aria-pressed={binFocus === index}
                      data-empty={count === 0 || undefined}
                      title={`${bin.label} ${unit}: ${count} ${count === 1 ? "país" : "países"}`}
                      onPointerEnter={() => setBinFocus(index)}
                      onPointerLeave={() => setBinFocus(null)}
                      onFocus={() => setBinFocus(index)}
                      onBlur={() => setBinFocus(null)}
                    >
                      <i style={{ background: `var(--od-seq-${bin.tone})` }} />
                      <span>{bin.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
