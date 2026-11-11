/* =============================================================================
   Tablero IGA · piezas de gráfica (SVG y HTML, sin librerías).
   Marcas delgadas, color solo para identidad, texto en tinta (no en el color de la serie).
   ========================================================================== */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { dinero, num, pct } from "./financiero-datos";
import type { Suma } from "./financiero-datos";

export const COLORES = ["var(--iga-c1)", "var(--iga-c2)", "var(--iga-c3)", "var(--iga-c4)"];

/* --- Tarjeta ------------------------------------------------------------------------------ */

export function Viz({ titulo, nota, ancho = 6, children }: { titulo: string; nota?: string; ancho?: 6 | 12; children: ReactNode }) {
  return (
    <figure className="iga-viz" data-ancho={ancho}>
      <figcaption>
        <h3>{titulo}</h3>
        {nota && <p>{nota}</p>}
      </figcaption>
      {children}
    </figure>
  );
}

export const Aviso = ({ children }: { children: ReactNode }) => <p className="iga-nota">{children}</p>;

export function Leyenda({ items }: { items: { l: string; c: string }[] }) {
  return (
    <ul className="iga-leyenda" role="list">
      {items.map((i) => (
        <li key={i.l}><i style={{ background: i.c }} aria-hidden="true" />{i.l}</li>
      ))}
    </ul>
  );
}

/* --- Filas de barra (una barra fina por categoría) ------------------------------------------ */

export interface FilaBarra { k: string; etiqueta: string; sub?: string; v: number; max?: number; texto: string; neg?: boolean; onClick?: () => void }

export function Barras({ filas, color = "var(--iga-c1)" }: { filas: FilaBarra[]; color?: string }) {
  const max = Math.max(...filas.map((f) => Math.abs(f.v)), 1e-9);
  return (
    <div className="iga-barras" role="list">
      {filas.map((f) => {
        const ancho = Math.min(100, (Math.abs(f.v) / (f.max ?? max)) * 100);
        const cuerpo = (
          <>
            <span className="iga-barras__l">{f.etiqueta}{f.sub && <small>{f.sub}</small>}</span>
            <span className="iga-barras__t"><i style={{ width: `${ancho}%`, background: f.neg ? "var(--iga-c2)" : color }} /></span>
            <span className="iga-barras__v">{f.texto}</span>
          </>
        );
        return f.onClick ? (
          <button key={f.k} type="button" role="listitem" className="iga-barras__fila" onClick={f.onClick} title={`${f.etiqueta}: ${f.texto}`}>{cuerpo}</button>
        ) : (
          <div key={f.k} role="listitem" className="iga-barras__fila" title={`${f.etiqueta}: ${f.texto}`}>{cuerpo}</div>
        );
      })}
    </div>
  );
}

/* --- Mancuerna: equilibrio (marca gris) frente a matriculados (punto) --------------------------- */

export interface FilaMancuerna { k: string; etiqueta: string; sub: string; a: number; b: number }

export function Mancuerna({ filas }: { filas: FilaMancuerna[] }) {
  const max = Math.max(...filas.flatMap((f) => [f.a, f.b]), 1) * 1.08;
  return (
    <div className="iga-manc" role="list">
      {filas.map((f) => {
        const arriba = f.b >= f.a;
        return (
          <div key={f.k} role="listitem" className="iga-manc__fila" title={`${f.etiqueta}: ${num(f.b)} matriculados, equilibrio ${num(f.a)}`}>
            <span className="iga-barras__l">{f.etiqueta}<small>{f.sub}</small></span>
            <span className="iga-manc__pista">
              <i className="iga-manc__union" style={{ left: `${(Math.min(f.a, f.b) / max) * 100}%`, width: `${(Math.abs(f.a - f.b) / max) * 100}%`, background: arriba ? "var(--iga-c1)" : "var(--iga-c2)" }} />
              <i className="iga-manc__eq" style={{ left: `${(f.a / max) * 100}%` }} />
              <i className="iga-manc__pt" style={{ left: `${(f.b / max) * 100}%`, background: arriba ? "var(--iga-c1)" : "var(--iga-c2)" }} />
            </span>
            <span className="iga-barras__v">{arriba ? "sobre" : "bajo"}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --- Cascada: de los ingresos al excedente neto -------------------------------------------- */

export function Cascada({ s, etiqueta }: { s: Suma; etiqueta: string }) {
  const pasos = [
    { n: "Ingresos", v: s.i, tipo: "total" as const },
    { n: "Costos del programa", v: -s.cd, tipo: "delta" as const },
    { n: "Costos asociados y aportes", v: -s.as, tipo: "delta" as const },
    { n: "Excedente operativo", v: s.eo, tipo: "total" as const },
    { n: "Gastos de nómina", v: -s.gn, tipo: "delta" as const },
    { n: "Otros gastos y aportes", v: -s.go, tipo: "delta" as const },
    { n: "Excedente neto", v: s.en, tipo: "total" as const },
  ];
  const W = 720, H = 270, mL = 8, mR = 8, mT = 14, mB = 62;
  const cum: { lo: number; hi: number; fin: number }[] = [];
  let corriente = 0;
  for (const p of pasos) {
    if (p.tipo === "total") { cum.push({ lo: Math.min(0, p.v), hi: Math.max(0, p.v), fin: p.v }); corriente = p.v; }
    else { const nuevo = corriente + p.v; cum.push({ lo: Math.min(corriente, nuevo), hi: Math.max(corriente, nuevo), fin: nuevo }); corriente = nuevo; }
  }
  const min = Math.min(0, ...cum.map((c) => c.lo));
  const max = Math.max(...cum.map((c) => c.hi), 1);
  const Y = (v: number) => mT + (H - mT - mB) * (1 - (v - min) / (max - min || 1));
  const paso = (W - mL - mR) / pasos.length;
  const bw = Math.min(46, paso * 0.56);
  return (
    <svg className="iga-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`De los ingresos al excedente neto, ${etiqueta}`}>
      <line x1={mL} x2={W - mR} y1={Y(0)} y2={Y(0)} className="iga-eje" />
      {pasos.map((p, i) => {
        const c = cum[i];
        const x = mL + paso * i + (paso - bw) / 2;
        const color = p.tipo === "total" ? (p.v >= 0 ? "var(--iga-c1)" : "var(--iga-c2)") : "var(--iga-ctx-2)";
        return (
          <g key={p.n}>
            <title>{`${p.n}: ${dinero(p.v)}`}</title>
            <rect x={x} y={Y(c.hi)} width={bw} height={Math.max(1.5, Y(c.lo) - Y(c.hi))} rx="3" fill={color} />
            <text x={x + bw / 2} y={Y(c.hi) - 5} textAnchor="middle" className="iga-t iga-t--v">{dinero(p.v)}</text>
            <foreignObject x={mL + paso * i + 2} y={H - mB + 8} width={paso - 4} height={mB - 8}>
              <div className="iga-cascada__n">{p.n}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

/* --- Dispersión: ingresos (x) frente a excedente neto sobre ingresos (y) ---------------------- */

export interface Punto { k: string; etiqueta: string; x: number; y: number }

export function Dispersion({ pts, onPick }: { pts: Punto[]; onPick: (k: string) => void }) {
  const W = 720, H = 300, mL = 44, mR = 12, mT = 12, mB = 34;
  const xMax = Math.max(...pts.map((p) => p.x), 1) * 1.05;
  const clamp = (y: number) => Math.max(-1.5, Math.min(1, y));
  const X = (v: number) => mL + ((W - mL - mR) * v) / xMax;
  const Y = (v: number) => mT + ((H - mT - mB) * (1 - (clamp(v) + 1.5) / 2.5));
  const yt = [-1.5, -1, -0.5, 0, 0.5, 1];
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  return (
    <svg className="iga-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cada punto es un programa: ingresos y excedente neto sobre ingresos">
      {yt.map((t) => (
        <g key={t}>
          <line x1={mL} x2={W - mR} y1={Y(t)} y2={Y(t)} className={t === 0 ? "iga-eje" : "iga-rejilla"} />
          <text x={mL - 6} y={Y(t) + 4} textAnchor="end" className="iga-t">{pct(t, 0)}</text>
        </g>
      ))}
      {xt.map((t) => (
        <text key={t} x={X(t)} y={H - 12} textAnchor="middle" className="iga-t">{dinero(t)}</text>
      ))}
      {pts.map((p) => (
        <circle key={p.k} cx={X(p.x)} cy={Y(p.y)} r="5" tabIndex={0} className="iga-punto" fill={p.y >= 0 ? "var(--iga-c1)" : "var(--iga-c2)"} onClick={() => onPick(p.k)} onKeyDown={(e) => e.key === "Enter" && onPick(p.k)}>
          <title>{`${p.etiqueta}: ingresos ${dinero(p.x)}, excedente neto ${pct(p.y, 0)} de los ingresos`}</title>
        </circle>
      ))}
    </svg>
  );
}

/* --- Líneas: una por serie --------------------------------------------------------------------- */

export interface SerieLinea { label: string; color: string; vals: (number | null)[] }

export function Lineas({ xs, series, fmt, etiqueta }: { xs: string[]; series: SerieLinea[]; fmt: (v: number) => string; etiqueta: string }) {
  const W = 720, H = 260, mL = 46, mR = 16, mT = 12, mB = 30;
  const todos = series.flatMap((s) => s.vals.filter((v): v is number => v !== null));
  if (!todos.length) return <Aviso>Sin cifras para dibujar.</Aviso>;
  let lo = Math.min(...todos, 0), hi = Math.max(...todos, 0);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const X = (i: number) => mL + (xs.length === 1 ? (W - mL - mR) / 2 : ((W - mL - mR) * i) / (xs.length - 1));
  const Y = (v: number) => mT + (H - mT - mB) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <svg className="iga-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={etiqueta}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={mL} x2={W - mR} y1={Y(t)} y2={Y(t)} className="iga-rejilla" />
          <text x={mL - 6} y={Y(t) + 4} textAnchor="end" className="iga-t">{fmt(t)}</text>
        </g>
      ))}
      <line x1={mL} x2={W - mR} y1={Y(0)} y2={Y(0)} className="iga-eje" />
      {xs.map((x, i) => (
        <text key={x} x={X(i)} y={H - 10} textAnchor="middle" className="iga-t">{x}</text>
      ))}
      {series.map((s) => {
        // Un periodo sin cifra corta la línea en vez de unir los vecinos.
        const tramos: [number, number][][] = [];
        let actual: [number, number][] | null = null;
        s.vals.forEach((v, i) => {
          if (v === null) { actual = null; return; }
          if (!actual) { actual = []; tramos.push(actual); }
          actual.push([X(i), Y(v)]);
        });
        return (
          <g key={s.label} stroke={s.color} fill={s.color}>
            {tramos.map((t, j) => <polyline key={j} points={t.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
            {s.vals.map((v, i) => v !== null && (
              <circle key={i} cx={X(i)} cy={Y(v)} r="4" stroke="var(--iga-surface)" strokeWidth="2">
                <title>{`${s.label} · ${xs[i]}: ${fmt(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* --- Tabla ordenable con barra en la celda -------------------------------------------------- */

export interface ColTabla<T> { k: string; n: string; val: (r: T) => number | string | null; fmt?: (r: T) => string; num?: boolean; barra?: boolean }

export function TablaOrdenable<T>({ filas, cols, orden, desc = true, clave, onFila, limite = 60 }: { filas: T[]; cols: ColTabla<T>[]; orden: string; desc?: boolean; clave: (r: T) => string; onFila?: (r: T) => void; limite?: number }) {
  const [ord, setOrd] = useState({ k: orden, desc });
  const [todo, setTodo] = useState(false);
  const col = cols.find((c) => c.k === ord.k) ?? cols[0];
  const ordenadas = useMemo(() => {
    const dir = ord.desc ? -1 : 1;
    return [...filas].sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")) * dir;
    });
  }, [filas, col, ord.desc]);
  const maximos = useMemo(() => Object.fromEntries(cols.filter((c) => c.barra).map((c) => [c.k, Math.max(...filas.map((f) => Math.abs(Number(c.val(f)) || 0)), 1e-9)])), [cols, filas]);
  const visibles = todo ? ordenadas : ordenadas.slice(0, limite);
  return (
    <div className="iga-tabla">
      <div className="iga-tabla__w">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.k} className={c.num ? "num" : undefined} aria-sort={ord.k === c.k ? (ord.desc ? "descending" : "ascending") : "none"}>
                  <button type="button" onClick={() => setOrd((o) => ({ k: c.k, desc: o.k === c.k ? !o.desc : true }))}>{c.n}{ord.k === c.k ? (ord.desc ? " ↓" : " ↑") : ""}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={clave(r)} onClick={onFila ? () => onFila(r) : undefined} className={onFila ? "is-click" : undefined}>
                {cols.map((c) => {
                  const v = c.val(r);
                  const txt = c.fmt ? c.fmt(r) : v === null ? "—" : String(v);
                  const w = c.barra && typeof v === "number" ? Math.min(100, (Math.abs(v) / maximos[c.k]) * 100) : 0;
                  return (
                    <td key={c.k} className={c.num ? "num" : undefined}>
                      {c.barra && <span className="iga-cb" aria-hidden="true"><i style={{ width: `${w}%`, background: typeof v === "number" && v < 0 ? "var(--iga-c2)" : "var(--iga-ctx-2)" }} /></span>}
                      <span>{txt}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenadas.length > limite && (
        <button type="button" className="oda-link-button" onClick={() => setTodo((t) => !t)}>{todo ? "Ver menos" : `Ver las ${ordenadas.length} filas`}</button>
      )}
    </div>
  );
}
