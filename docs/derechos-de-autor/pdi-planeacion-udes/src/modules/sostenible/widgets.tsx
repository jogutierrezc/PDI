/* =============================================================================
   UDES Sostenible · piezas compartidas: gráfica de línea, anillo de puntaje,
   indicadores con campus y año, hoja del informe (vista y PDF) y la rueda de ODS.

   Movimiento (GSAP): solo transform, opacidad y trazos. Con movimiento
   reducido todo aparece ya en su valor final.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Modal } from "../../components/ui/Modal";
import { CAMPUSES, INDICATORS, SDG, YEARS, fmt, indicatorChange, indicatorValue } from "./data";
import type { Campus, IndKey } from "./data";
import { cifraReal, seriesReal, useCifrasReales, useIndicadoresNuevos } from "./cifras-reales";
import type { IndicadorNuevo } from "./cifras-reales";
import type { CifraReal, CifrasReales } from "./cifras-reales";

gsap.registerPlugin(useGSAP);

export const reduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/* --- Número que sube ------------------------------------------------------------------------- */

/** Muestra un número y, cuando cambia, lo lleva del valor anterior al nuevo. */
export function Num({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) {
      el.textContent = fmt(value, decimals);
      from.current = value;
      return;
    }
    const state = { v: from.current };
    const tween = gsap.to(state, {
      v: value,
      duration: 0.75,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = fmt(state.v, decimals);
      },
      onComplete: () => {
        from.current = value;
      },
    });
    return () => {
      from.current = state.v;
      tween.kill();
    };
  }, [value, decimals]);
  return <span ref={ref}>{fmt(value, decimals)}</span>;
}

/* --- Gráfica de línea ------------------------------------------------------------------------- */

interface LineChartProps {
  values: number[];
  labels?: readonly (string | number)[];
  /** Texto sobre cada punto (por ejemplo, la banda del ranking). */
  tags?: string[];
  min: number;
  max: number;
  /** Posiciones: el puesto 1 va arriba, así que el valor menor se dibuja más alto. */
  rank?: boolean;
  label: string;
  width?: number;
  height?: number;
  /** Color de la serie; por defecto el acento de la página. */
  color?: string;
  /** La hoja del informe va sobre papel blanco: texto y rejilla propios. */
  paper?: boolean;
}

export function LineChart({ values, labels = YEARS, tags, min, max, rank, label, width = 720, height = 300, color = "var(--sos-accent)", paper }: LineChartProps) {
  const pad = { l: 46, r: 22, t: 24, b: 30 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = values.length;
  const x = (i: number) => pad.l + (iw * i) / (n - 1);
  const y = (v: number) => {
    const f = (v - min) / (max - min);
    return pad.t + ih * (rank ? f : 1 - f);
  };
  const text = paper ? "#45566d" : "var(--ink-muted)";
  const grid = paper ? "#d8e1ee" : "var(--line)";
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="sos-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = min + ((max - min) * k) / 4;
        return (
          <g key={k}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={grid} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fill={text} fontSize="11" fontWeight="600">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <polygon points={`${pad.l},${pad.t + ih} ${points} ${x(n - 1)},${pad.t + ih}`} fill={color} opacity="0.1" />
      <polyline className="sos-ln" points={points} fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="5" fill={color} />
          <text x={x(i)} y={height - 8} textAnchor="middle" fill={text} fontSize="11" fontWeight="700">
            {labels[i]}
          </text>
          <text x={x(i)} y={y(v) - 12} textAnchor="middle" fill={text} fontSize="11" fontWeight="700">
            {tags ? tags[i] : v}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Dibuja de izquierda a derecha todas las líneas `.sos-ln` de un contenedor cuando cambia `deps`. */
export function useDrawLines(scope: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useGSAP(
    () => {
      if (reduced()) return;
      const lines = scope.current?.querySelectorAll<SVGGeometryElement>(".sos-ln") ?? [];
      lines.forEach((line) => {
        const length = line.getTotalLength?.() ?? 400;
        gsap.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" });
      });
    },
    { scope, dependencies: deps },
  );
}

/* --- Anillo de puntaje -------------------------------------------------------------------------- */

export function Ring({ value, color, size = "md" }: { value: number; color: string; size?: "md" | "xl" }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const label = el.querySelector("b");
      if (reduced()) {
        el.style.setProperty("--p", String(value));
        return;
      }
      const s = { v: 0 };
      gsap.to(s, {
        v: value,
        duration: 1,
        delay: 0.1,
        ease: "power3.out",
        onUpdate: () => {
          el.style.setProperty("--p", String(s.v));
          if (label) label.textContent = String(Math.round(s.v));
        },
      });
    },
    { scope: ref, dependencies: [value] },
  );
  return (
    <div ref={ref} className={`sos-ring sos-ring--${size}`} style={{ "--ring": color, "--p": value } as CSSProperties} role="img" aria-label={`Puntaje ${value} de 100`}>
      <b>{value}</b>
    </div>
  );
}

/* --- Indicadores con campus y año ------------------------------------------------------------- */

function Spark({ values }: { values: number[] }) {
  const w = 200;
  const h = 46;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const points = values.map((v, i) => `${((i * w) / (values.length - 1)).toFixed(1)},${(h - 6 - ((v - lo) / span) * (h - 14)).toFixed(1)}`).join(" ");
  return (
    <svg className="sos-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline className="sos-ln" points={points} fill="none" stroke="var(--sos-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Lo que una tarjeta necesita para dibujarse; la arman Tile (tarjeta del portal) y TileNuevo (indicador sin tarjeta). */
export interface TileDatos {
  name: string;
  unit: string;
  decimals: number;
  value: number;
  series: number[];
  pct: number;
  good: boolean;
  desde: number;
  /** Porcentaje de la barra de avance, si la magnitud es un porcentaje. */
  bar: number | null;
  real: CifraReal | undefined;
  /** Con cifra real y un solo punto no hay cambio que mostrar. */
  sinCambio: boolean;
}

export function TileCuerpo({ d }: { d: TileDatos }) {
  const { real } = d;
  return (
    <div className="sos-tile" data-real={real ? "si" : "no"}>
      <span className="sos-tile__name">{d.name}</span>
      <span className="sos-tile__value">
        <Num value={d.value} decimals={d.decimals} />
        <small>{d.unit}</small>
      </span>
      {d.sinCambio ? null : (
        <span className="sos-delta" data-good={d.good}>
          {d.pct >= 0 ? "▲" : "▼"} {fmt(Math.abs(d.pct))}% desde {d.desde}
        </span>
      )}
      {d.bar !== null && (
        <div className="sos-bar" aria-hidden="true">
          <i style={{ width: `${d.bar}%` }} />
        </div>
      )}
      {d.series.length > 1 && <Spark values={d.series} />}
      {real ? (
        (real.fuente || real.evidencia) && (
          <small className="sos-tile__src">
            {real.fuente ? `Fuente: ${real.fuente}` : ""}
            {real.fuente && real.evidencia ? " · " : ""}
            {real.evidencia && /^https?:\/\//i.test(real.evidencia) ? (
              <a href={real.evidencia} target="_blank" rel="noreferrer">
                Evidencia
              </a>
            ) : (
              real.evidencia
            )}
          </small>
        )
      ) : (
        <small className="sos-tile__src sos-tile__ilus">Dato ilustrativo</small>
      )}
    </div>
  );
}

/** La tarjeta usa la cifra real del campus y año elegidos si existe; si no, la de muestra (y lo dice). */
function Tile({ k, campus, yearIndex, reales }: { k: IndKey; campus: Campus; yearIndex: number; reales: CifrasReales }) {
  const ind = INDICATORS[k];
  const real = cifraReal(reales, k, campus, yearIndex);
  const puntos = seriesReal(reales, k, campus);
  const sample = YEARS.map((_, i) => indicatorValue(k, campus, i));
  const series = real ? puntos.map((p) => p.valor) : sample;
  const value = real ? real.valor : sample[yearIndex];
  // Con cifra real, el cambio es frente a la primera edición que tenga cifra real.
  const first = real ? puntos[0].valor : 0;
  const pct = real ? (first ? ((value - first) / first) * 100 : 0) : indicatorChange(k, campus, yearIndex).pct;
  const good = real ? (ind.higherIsBetter ? pct >= 0 : pct <= 0) : indicatorChange(k, campus, yearIndex).good;
  const desde = real ? YEARS[puntos[0].yearIndex] : YEARS[0];
  const bar = ind.max ? Math.min(100, (value / ind.max) * 100) : null;
  return <TileCuerpo d={{ name: ind.name, unit: ind.unit, decimals: ind.decimals, value, series, pct, good, desde, bar, real, sinCambio: Boolean(real) && puntos.length < 2 }} />;
}

/** Tarjeta de un indicador publicado sin tarjeta propia: solo existe con cifra real (no hay muestra que inventar). */
function TileNuevo({ ind, campus, yearIndex }: { ind: IndicadorNuevo; campus: Campus; yearIndex: number }) {
  const real = ind.valores.get(`${campus}|${yearIndex}`);
  if (!real) return null;
  const puntos = YEARS.map((_, i) => ind.valores.get(`${campus}|${i}`)?.valor).flatMap((v, i) => (typeof v === "number" ? [{ i, v }] : []));
  const first = puntos[0].v;
  const pct = first ? ((real.valor - first) / first) * 100 : 0;
  const good = ind.higherIsBetter ? pct >= 0 : pct <= 0;
  const bar = ind.max ? Math.min(100, (real.valor / ind.max) * 100) : null;
  return (
    <TileCuerpo
      d={{ name: ind.nombre, unit: ind.unidad, decimals: ind.decimales, value: real.valor, series: puntos.map((p) => p.v), pct, good, desde: YEARS[puntos[0].i], bar, real, sinCambio: puntos.length < 2 }}
    />
  );
}

function Chips<T extends string | number>({ label, options, value, onPick }: { label: string; options: { id: T; text: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="sos-chips" role="group" aria-label={label}>
      <span className="sos-chips__label">{label}</span>
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={o.id === value} onClick={() => onPick(o.id)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** El tablero de indicadores: elige un campus y una edición y las cifras se recalculan. */
export function IndicatorBoard({ keys, nuevos = false }: { keys: IndKey[]; nuevos?: boolean }) {
  const [campus, setCampus] = useState<Campus>("Todos");
  const [yearIndex, setYearIndex] = useState(YEARS.length - 1);
  const scope = useRef<HTMLDivElement>(null);
  const reales = useCifrasReales();
  // «Indicadores en vivo» suma las tarjetas de los indicadores nuevos publicados (0202).
  const nuevas = useIndicadoresNuevos();
  const todasReales = keys.every((k) => cifraReal(reales, k, campus, yearIndex));
  useDrawLines(scope, [campus, keys.join()]);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".sos-bar i", { width: 0, duration: 0.8, ease: "power3.out", clearProps: "width" });
    },
    { scope, dependencies: [campus, yearIndex] },
  );
  return (
    <div ref={scope}>
      <div className="sos-ctrl">
        <Chips label="Campus" options={CAMPUSES.map((c) => ({ id: c, text: c }))} value={campus} onPick={setCampus} />
        <Chips label="Año" options={YEARS.map((y, i) => ({ id: i, text: String(y) }))} value={yearIndex} onPick={setYearIndex} />
      </div>
      <div className="sos-ind">
        {keys.map((k) => (
          <Tile key={k} k={k} campus={campus} yearIndex={yearIndex} reales={reales} />
        ))}
        {nuevos && nuevas.map((n) => <TileNuevo key={n.id} ind={n} campus={campus} yearIndex={yearIndex} />)}
      </div>
      {!todasReales && (
        <p className="sos-note">
          <i aria-hidden="true" />
          Dato ilustrativo: las tarjetas marcadas son valores de muestra hasta cargar los oficiales de cada oficina.
        </p>
      )}
    </div>
  );
}

/* --- Hoja del informe: vista previa y PDF ----------------------------------------------------- */

export interface SheetData {
  title: string;
  publisher: string;
  stats: [string, string][];
  chart: ReactNode;
}

function Sheet({ data }: { data: SheetData }) {
  return (
    <article className="sos-sheet">
      <header>
        <span>Universidad de Santander · Planeación Institucional</span>
        <span>{data.publisher}</span>
      </header>
      <h4>{data.title}</h4>
      <div className="sos-sheet__stats">
        {data.stats.map(([v, l]) => (
          <div key={l}>
            <b>{v}</b>
            {l}
          </div>
        ))}
      </div>
      <div className="sos-sheet__chart">{data.chart}</div>
      <footer>
        <span>Fuente: {data.publisher} · Dato ilustrativo</span>
        <span>Página 1 de 1</span>
      </footer>
    </article>
  );
}

/** Vista previa del informe. «Descargar PDF» imprime solo la hoja: el navegador la guarda como PDF tamaño carta. */
export function SheetDialog({ data, onClose }: { data: SheetData; onClose: () => void }) {
  return (
    <Modal title="Informe individual" description="Vista previa tamaño carta. Descárgalo en PDF o ciérralo." onClose={onClose} size="reader">
      <div className="sos-sheet-wrap">
        <Sheet data={data} />
      </div>
      <div className="sos-sheet-actions">
        <button type="button" className="sos-btn" onClick={() => window.print()}>
          Descargar PDF
        </button>
        <button type="button" className="sos-btn sos-btn--ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {createPortal(
        <div className="sos-print-root">
          <Sheet data={data} />
        </div>,
        document.body,
      )}
    </Modal>
  );
}

/* --- Rueda de ODS ----------------------------------------------------------------------------- */

export function SdgWheel() {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".sos-seg", { opacity: 0, scale: 0.6, transformOrigin: "50% 50%", duration: 0.6, ease: "back.out(1.3)", stagger: 0.035, delay: 0.2, clearProps: "opacity,transform" });
      gsap.to(svg.current, { rotation: 360, duration: 160, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
    },
    { scope: svg },
  );
  const outer = 104;
  const inner = 62;
  const gap = 0.018;
  const pt = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return (
    <div className="sos-wheel">
      <svg ref={svg} viewBox="-110 -110 220 220" role="img" aria-label="Los 17 Objetivos de Desarrollo Sostenible" onPointerLeave={() => setHover(null)}>
        {SDG.map((s, i) => {
          const a0 = (i / 17) * Math.PI * 2 - Math.PI / 2 + gap;
          const a1 = ((i + 1) / 17) * Math.PI * 2 - Math.PI / 2 - gap;
          const mid = (a0 + a1) / 2;
          return (
            <g key={s.name} className="sos-seg" onPointerEnter={() => setHover(i)}>
              <path d={`M${pt(outer, a0)}A${outer} ${outer} 0 0 1 ${pt(outer, a1)}L${pt(inner, a1)}A${inner} ${inner} 0 0 0 ${pt(inner, a0)}Z`} fill={s.color} />
              <text x={Math.cos(mid) * 83} y={Math.sin(mid) * 83 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="sos-wheel__core" aria-live="polite">
        <b>{hover === null ? 17 : hover + 1}</b>
        <span>{hover === null ? "ODS que orientan a la UDES" : SDG[hover].name}</span>
      </div>
    </div>
  );
}
