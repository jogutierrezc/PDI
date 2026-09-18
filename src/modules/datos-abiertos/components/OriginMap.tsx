/* =============================================================================
   Mapa de origen por municipio.

   De lejos es un mapa de calor: los departamentos se colorean en la escala
   azul según cuántos estudiantes aportan y, encima, un resplandor ámbar
   marca dónde se concentra la gente. Al acercarse (botones, doble clic, clic
   en un departamento, pellizco o Ctrl + rueda) el calor cede y aparece un
   punto por municipio de origen, del tamaño de su cifra; más cerca aún, cada
   punto lleva su nombre y su número.

   · La rueda sola no hace zoom: desplaza la página, como el resto del portal.
   · Un municipio con menos de 5 personas en una sede se dibuja como anillo
     hueco y se escribe «< 5»: su cifra exacta señalaría a alguien.
   · La lista «En esta vista» es la vía accesible: cuenta lo mismo que el mapa
     y sigue al encuadre; cada fila acerca el mapa a su municipio.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { ALL_YEARS } from "../data/terms";
import type { Campus, CampusId, MapDataset } from "../data/types";
import { ALL_CAMPUSES } from "../data/types";
import { CAMPUS_POINTS, DEPARTMENTS, MAP_HEIGHT, MAP_WIDTH } from "../data/colombia-map";
import { ARCHIPELAGO_BOX, MUNICIPIOS } from "../data/colombia-municipios";
import { ChartTooltip } from "./ChartFrame";
import { useInView, usePrefersReducedMotion } from "./motion";
import "./origin-map.css";

const MUNI = new Map(MUNICIPIOS.map(([code, name, x, y]) => [code, { code, name, x, y }]));
const DEPT_NAME = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d.name]));

const K_MIN = 1;
const K_MAX = 24;
/** Desde aquí aparecen los puntos; desde LABELS_AT, sus nombres. */
const DOTS_AT = 1.9;
const LABELS_AT = 3.6;
const BINS = 7;

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const count = (n: number) => integer.format(n);

interface View {
  k: number;
  x: number;
  y: number;
}

const HOME: View = { k: 1, x: 0, y: 0 };

/** Encuadre que deja el mapa siempre a la vista. */
function clamp(v: View): View {
  const k = Math.max(K_MIN, Math.min(K_MAX, v.k));
  const minX = MAP_WIDTH - MAP_WIDTH * k;
  const minY = MAP_HEIGHT - MAP_HEIGHT * k;
  return { k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

/** Acercar alrededor de un punto del lienzo (coordenadas del viewBox). */
function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = Math.max(K_MIN, Math.min(K_MAX, v.k * factor));
  const f = k / v.k;
  return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
}

/** Encuadrar un punto del mapa a un zoom dado. */
function centerOn(mx: number, my: number, k: number): View {
  return clamp({ k, x: MAP_WIDTH / 2 - mx * k, y: MAP_HEIGHT / 2 - my * k });
}

interface Place {
  code: string;
  name: string;
  dept: string;
  x: number;
  y: number;
  total: number;
  /** Alguna sede tiene aquí menos de 5 personas: el total es un piso. */
  partial: boolean;
  /** Solo hay celdas reservadas: no hay cifra que mostrar. */
  reservedOnly: boolean;
  bySite: { site: CampusId; value: number | null }[];
}

interface OriginMapProps {
  dataset: MapDataset;
  year: number;
  years: number[];
  campus: CampusId;
  campuses: Campus[];
}

export function OriginMap({ dataset, year, years, campus, campuses }: OriginMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const seen = useInView(wrap);
  const reduced = usePrefersReducedMotion();
  const [view, setView] = useState<View>(HOME);
  const [glide, setGlide] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; v: View; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ d: number; v: View; cx: number; cy: number } | null>(null);

  // Corte: el elegido si tiene cifras; si no (o «todo el periodo»), el último con cifras.
  const available = years.filter((y) => dataset.values[y] && Object.keys(dataset.values[y]!).length > 0);
  const shown = year !== ALL_YEARS && available.includes(year) ? year : available[available.length - 1];

  const sites = campuses.map((c) => c.id).filter((id) => id !== ALL_CAMPUSES);
  const active = campus === ALL_CAMPUSES ? sites : sites.filter((s) => s === campus);
  const siteName = (id: CampusId) => campuses.find((c) => c.id === id)?.name ?? id;

  const { depts, places, maxDept, maxPlace, grand } = useMemo(() => {
    const byYear = shown === undefined ? {} : dataset.values[shown] ?? {};
    const reservedYear = shown === undefined ? {} : dataset.reserved?.[shown] ?? {};
    const depts: Record<string, number> = {};
    const acc = new Map<string, Place>();
    for (const site of active) {
      for (const [code, value] of Object.entries(byYear[site] ?? {})) {
        if (code.length === 2) depts[code] = (depts[code] ?? 0) + value;
        else if (code.length === 5) {
          const m = MUNI.get(code);
          if (!m) continue;
          const p = acc.get(code) ?? { ...m, dept: code.slice(0, 2), total: 0, partial: false, reservedOnly: true, bySite: [] };
          p.total += value;
          p.reservedOnly = false;
          p.bySite.push({ site, value });
          acc.set(code, p);
        }
      }
      for (const code of reservedYear[site] ?? []) {
        const m = MUNI.get(code);
        if (code.length !== 5 || !m) continue;
        const p = acc.get(code) ?? { ...m, dept: code.slice(0, 2), total: 0, partial: false, reservedOnly: true, bySite: [] };
        p.partial = true;
        p.bySite.push({ site, value: null });
        acc.set(code, p);
      }
    }
    const places = Array.from(acc.values()).sort((a, b) => b.total - a.total);
    // Sin filas de departamento, el departamento es la suma de sus municipios publicados.
    if (Object.keys(depts).length === 0) {
      for (const p of places) depts[p.dept] = (depts[p.dept] ?? 0) + p.total;
    }
    return {
      depts,
      places,
      maxDept: Math.max(1, ...Object.values(depts)),
      maxPlace: Math.max(1, ...places.map((p) => p.total)),
      grand: Object.values(depts).reduce((a, b) => a + b, 0),
    };
  }, [dataset, shown, active.join("|")]);

  // Sin cifras publicadas el mapa igual se dibuja (país y campus) y lo dice:
  // un vacío se muestra como no reportado, no se esconde.
  const pending = shown === undefined;

  const binOf = (v: number | undefined) => {
    if (!v) return 0;
    const t = Math.log10(v + 1) / Math.log10(maxDept + 1);
    return Math.max(1, Math.min(BINS, Math.ceil(t * BINS)));
  };

  const k = view.k;
  const dotsOn = k >= DOTS_AT;
  const labelsOn = k >= LABELS_AT;
  const radius = (p: Place) => (p.reservedOnly ? 2.6 : 2.2 + Math.sqrt(p.total / maxPlace) * 11);

  // Lo que está en el encuadre, en coordenadas del mapa.
  const box = { x0: -view.x / k, y0: -view.y / k, x1: (MAP_WIDTH - view.x) / k, y1: (MAP_HEIGHT - view.y) / k };
  const inView = places.filter((p) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1);
  // Nombres: de mayor a menor, sin pisarse. Cada etiqueta ocupa su caja en
  // pantalla; la que choca con una ya puesta se calla (su punto sigue ahí).
  // Cerca del borde derecho la etiqueta se escribe a la izquierda del punto.
  const labels = new Map<string, "start" | "end">();
  if (labelsOn) {
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const p of inView) {
      if (p.reservedOnly || labels.size >= 14 + k * 2) continue;
      const sx = p.x * k + view.x;
      const sy = p.y * k + view.y;
      const r = radius(p);
      const w = (p.name.length + placeText(p).length + 1) * 5.3;
      const side = sx + r + 4 + w > MAP_WIDTH - 8 ? "end" : "start";
      const bx = side === "start" ? { x0: sx + r + 2, x1: sx + r + 6 + w } : { x0: sx - r - 6 - w, x1: sx - r - 2 };
      const b = { ...bx, y0: sy - 7, y1: sy + 7 };
      if (taken.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0)) continue;
      taken.push(b);
      labels.set(p.code, side);
    }
  }
  const focus = hover ? places.find((p) => p.code === hover) : undefined;

  function placeText(p: Place) {
    return p.reservedOnly ? "< 5" : p.partial ? `${count(p.total)} o más` : count(p.total);
  }

  /* --- Gestos -------------------------------------------------------------------- */

  const toMap = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * MAP_WIDTH, y: ((clientY - r.top) / r.height) * MAP_HEIGHT };
  };
  const go = (next: View, animate = true) => {
    setGlide(animate && !reduced);
    setView(clamp(next));
  };

  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = toMap(e.clientX, e.clientY);
    go(zoomAt(view, e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y), false);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = Array.from(pinch.current.values());
      const c = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), v: view, cx: c.x, cy: c.y };
      drag.current = null;
      return;
    }
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, v: view, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart.current && pinch.current.size === 2) {
      const [a, b] = Array.from(pinch.current.values());
      const s = pinchStart.current;
      go(zoomAt(s.v, Math.hypot(a.x - b.x, a.y - b.y) / s.d, s.cx, s.cy), false);
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = svg.current!.getBoundingClientRect();
    const dx = ((e.clientX - d.sx) / r.width) * MAP_WIDTH;
    const dy = ((e.clientY - d.sy) / r.height) * MAP_HEIGHT;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svg.current!.setPointerCapture(e.pointerId);
    d.moved = true;
    setTip(null);
    go({ k: d.v.k, x: d.v.x + dx, y: d.v.y + dy }, false);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    // Un arrastre no es un clic: el departamento bajo el puntero no se encuadra.
    if (drag.current?.moved) {
      e.preventDefault();
      window.setTimeout(() => (drag.current = null), 0);
    } else drag.current = null;
  };

  const zoomButton = (factor: number) => go(zoomAt(view, factor, MAP_WIDTH / 2, MAP_HEIGHT / 2));

  const zoomToDept = (code: string) => {
    if (drag.current?.moved) return;
    const d = DEPARTMENTS.find((x) => x.code === code);
    if (!d) return;
    go(centerOn(d.c[0], d.c[1], Math.max(k, 3.2)));
  };

  const zoomToPlace = (p: Place) => go(centerOn(p.x, p.y, Math.max(k, 6)));

  const tipAt = (p: Place) => {
    const r = svg.current?.getBoundingClientRect();
    const w = wrap.current?.getBoundingClientRect();
    if (!r || !w) return;
    const sx = r.left - w.left + ((p.x * k + view.x) / MAP_WIDTH) * r.width;
    const sy = r.top - w.top + ((p.y * k + view.y) / MAP_HEIGHT) * r.height;
    setHover(p.code);
    setTip({ x: sx, y: sy - (radius(p) * r.width) / MAP_WIDTH - 4 });
  };

  const heat = places.filter((p) => !p.reservedOnly).slice(0, 160);

  return (
    <div className="od-omap" data-seen={seen || undefined} data-dots={dotsOn || undefined} data-labels={labelsOn || undefined} data-pending={pending || undefined}>
      <div ref={wrap} className="od-omap__stage">
        <svg
          ref={svg}
          className="od-omap__svg"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label={`${dataset.title}. Mapa con zoom; el detalle por municipio está en la lista «En esta vista».`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
          onDoubleClick={(e) => {
            const p = toMap(e.clientX, e.clientY);
            go(zoomAt(view, e.shiftKey ? 0.5 : 2, p.x, p.y));
          }}
          style={{ "--k": k } as CSSProperties}
        >
          <defs>
            <radialGradient id="od-omap-hot">
              <stop offset="0%" className="od-omap__hot-core" />
              <stop offset="45%" className="od-omap__hot-mid" />
              <stop offset="100%" className="od-omap__hot-edge" />
            </radialGradient>
          </defs>
          <g
            className="od-omap__world"
            data-glide={glide || undefined}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${k})` }}
          >
            <g className="od-omap__depts">
              {DEPARTMENTS.map((d) => {
                const v = depts[d.code];
                return (
                  <path
                    key={d.code}
                    d={d.d}
                    className="od-omap__dept"
                    data-bin={binOf(v)}
                    style={{ strokeWidth: 0.8 / k } as CSSProperties}
                    onClick={() => zoomToDept(d.code)}
                  >
                    <title>{`${d.name}: ${v ? `${count(v)} estudiantes` : "sin estudiantes registrados"}`}</title>
                  </path>
                );
              })}
            </g>

            <g className="od-omap__heat" aria-hidden="true">
              {heat.map((p) => (
                <circle key={p.code} cx={p.x} cy={p.y} r={(6 + Math.sqrt(p.total / maxPlace) * 30) / Math.sqrt(k)} fill="url(#od-omap-hot)" />
              ))}
            </g>

            <rect
              className="od-omap__inset"
              x={ARCHIPELAGO_BOX.x}
              y={ARCHIPELAGO_BOX.y}
              width={ARCHIPELAGO_BOX.w}
              height={ARCHIPELAGO_BOX.h}
              rx={4}
              style={{ strokeWidth: 0.8 / k } as CSSProperties}
            />
            <text className="od-omap__inset-label" x={ARCHIPELAGO_BOX.x + 4} y={ARCHIPELAGO_BOX.y + ARCHIPELAGO_BOX.h - 5}>
              San Andrés y Providencia
            </text>

            <g className="od-omap__dots">
              {places
                .slice()
                .reverse()
                .map((p) => (
                  <g
                    key={p.code}
                    className="od-omap__dot"
                    data-reserved={p.reservedOnly || undefined}
                    data-hover={hover === p.code || undefined}
                    transform={`translate(${p.x} ${p.y}) scale(${1 / k})`}
                    onPointerEnter={() => dotsOn && tipAt(p)}
                    onPointerLeave={() => {
                      setHover(null);
                      setTip(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dotsOn) zoomToPlace(p);
                    }}
                  >
                    <circle r={radius(p)} />
                    {labels.has(p.code) && (
                      <text
                        className="od-omap__label"
                        x={labels.get(p.code) === "start" ? radius(p) + 4 : -radius(p) - 4}
                        y={3.5}
                        textAnchor={labels.get(p.code)}
                      >
                        {p.name} <tspan>{placeText(p)}</tspan>
                      </text>
                    )}
                  </g>
                ))}
            </g>

            <g className="od-omap__sites" aria-hidden="true">
              {sites
                .filter((s) => CAMPUS_POINTS[s])
                .map((s) => {
                  const [x, y] = CAMPUS_POINTS[s];
                  return (
                    <g key={s} transform={`translate(${x} ${y}) scale(${1 / k})`} data-off={!active.includes(s) || undefined}>
                      <path d="M0 -8 L8 0 L0 8 L-8 0Z" />
                      <text x={11} y={-8}>
                        {siteName(s)}
                      </text>
                    </g>
                  );
                })}
            </g>
          </g>
        </svg>

        <div className="od-omap__controls" role="group" aria-label="Zoom del mapa">
          <button type="button" onClick={() => zoomButton(2)} aria-label="Acercar" disabled={k >= K_MAX}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button type="button" onClick={() => zoomButton(0.5)} aria-label="Alejar" disabled={k <= K_MIN}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10" />
            </svg>
          </button>
          <button type="button" onClick={() => go(HOME)} aria-label="Ver todo el país" disabled={k === 1 && view.x === 0 && view.y === 0}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
          </button>
        </div>

        <p className="od-omap__hint" aria-hidden="true">
          {dotsOn ? "Arrastra para moverte · toca un punto para acercarte" : "Doble clic, un departamento o Ctrl + rueda para acercarte"}
        </p>

        {pending && (
          <div className="od-omap__pending" role="status">
            <strong>Pendiente de carga</strong>
            <span>
              Las cifras por municipio de origen se publican cuando Planeación cargue la caracterización estudiantil con la
              ciudad de cada estudiante. Hasta entonces el mapa no muestra datos.
            </span>
          </div>
        )}

        {focus && tip && (
          <ChartTooltip x={tip.x} y={tip.y}>
            <strong>
              {focus.name} · {DEPT_NAME[focus.dept] ?? focus.dept}
            </strong>
            <span>{focus.reservedOnly ? "Menos de 5 estudiantes" : `${placeText(focus)} estudiantes`}</span>
            {focus.bySite.length > 1 &&
              focus.bySite.map((b) => (
                <em key={b.site}>
                  {siteName(b.site)}: {b.value === null ? "< 5" : count(b.value)}
                </em>
              ))}
          </ChartTooltip>
        )}
      </div>

      <aside className="od-omap__side">
        <div className="od-omap__scale" aria-hidden="true">
          <span>Estudiantes por departamento</span>
          <span className="od-omap__ramp">
            {Array.from({ length: BINS }, (_, i) => (
              <i key={i} data-bin={i + 1} />
            ))}
          </span>
          <span className="od-omap__ramp-ends">
            <span>1</span>
            <span>{count(maxDept)}</span>
          </span>
          <span className="od-omap__keys">
            <span>
              <i className="od-omap__key-dot" /> Municipio, por tamaño
            </span>
            <span>
              <i className="od-omap__key-ring" /> Menos de 5
            </span>
            <span>
              <i className="od-omap__key-site" /> Campus
            </span>
          </span>
        </div>

        <p className="od-omap__count">
          <b>{pending ? "—" : count(grand)}</b> estudiantes con municipio de origen registrado{pending ? "" : ` · ${shown}`}
          {campus !== ALL_CAMPUSES && ` · ${siteName(campus)}`}
        </p>

        <h4 className="od-omap__list-title">
          {k > 1.05 ? "En esta vista" : "Municipios que más aportan"} <span>{count(inView.length)}</span>
        </h4>
        <ol className="od-omap__list">
          {inView.slice(0, 10).map((p) => (
            <li key={p.code}>
              <button
                type="button"
                onClick={() => zoomToPlace(p)}
                onPointerEnter={() => dotsOn && tipAt(p)}
                onPointerLeave={() => {
                  setHover(null);
                  setTip(null);
                }}
                style={{ "--w": `${p.reservedOnly ? 0 : (p.total / maxPlace) * 100}%` } as CSSProperties}
              >
                <span className="od-omap__list-name">
                  {p.name}
                  <em>{DEPT_NAME[p.dept] ?? ""}</em>
                </span>
                <span className="od-omap__list-value">{placeText(p)}</span>
              </button>
            </li>
          ))}
        </ol>
        {inView.length === 0 && (
          <p className="od-omap__none">{pending ? "Sin cifras publicadas todavía." : "Nadie registra origen en esta parte del mapa."}</p>
        )}
      </aside>
    </div>
  );
}
