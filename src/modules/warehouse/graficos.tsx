/* =============================================================================
   Warehouse UDES · gráficos.

   SVG a mano, sin librería: seis gráficos que sirven a los datos del almacén.
   Los colores salen de los tokens (--od-line-N, --od-seq-N, --status-*), que
   ya cambian de tema; ningún color va a mano. Cada gráfico lleva un <title>
   y la cifra exacta en el texto, para que no dependa de leer un color.
   ========================================================================== */

import { useId, useMemo, useState } from "react";

const SERIE = (i: number) => `var(--od-line-${(i % 8) + 1})`;

export interface Barra {
  etiqueta: string;
  valor: number;
  /** El valor del periodo (o corte) anterior, si se compara. */
  previo?: number | null;
  detalle?: string;
}

const numero = (n: number, dec = 0) => n.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/* --- Barras horizontales -------------------------------------------------------- */

export function Barras({ datos, sufijo = "", decimales = 0, titulo }: { datos: Barra[]; sufijo?: string; decimales?: number; titulo: string }) {
  const max = Math.max(1, ...datos.map((d) => Math.max(d.valor, d.previo ?? 0)));
  return (
    <ul className="wh-barras" aria-label={titulo}>
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <span className="wh-barras__nombre" title={d.etiqueta}>
            {d.etiqueta}
          </span>
          <span className="wh-barras__pista" aria-hidden="true">
            {d.previo != null && <i className="wh-barras__previo" style={{ width: `${(100 * d.previo) / max}%` }} />}
            <i className="wh-barras__valor" style={{ width: `${(100 * d.valor) / max}%` }} />
          </span>
          <span className="wh-barras__cifra">
            {numero(d.valor, decimales)}
            {sufijo}
            {d.previo != null && (
              <small>
                {" "}
                antes {numero(d.previo, decimales)}
                {sufijo}
              </small>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --- Barras apiladas (alertas por nivel) ------------------------------------------ */

export interface Apilada {
  etiqueta: string;
  partes: { nombre: string; valor: number; color: string }[];
}

export function Apiladas({ datos, titulo }: { datos: Apilada[]; titulo: string }) {
  const max = Math.max(1, ...datos.map((d) => d.partes.reduce((s, p) => s + p.valor, 0)));
  return (
    <ul className="wh-barras" aria-label={titulo}>
      {datos.map((d) => {
        const total = d.partes.reduce((s, p) => s + p.valor, 0);
        return (
          <li key={d.etiqueta}>
            <span className="wh-barras__nombre" title={d.etiqueta}>
              {d.etiqueta}
            </span>
            <span className="wh-barras__pista wh-barras__pista--pila" aria-hidden="true">
              {d.partes.map((p) => (
                <i key={p.nombre} style={{ width: `${(100 * p.valor) / max}%`, background: p.color }} />
              ))}
            </span>
            <span className="wh-barras__cifra">{numero(total)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* --- Anillo ---------------------------------------------------------------------- */

export function Anillo({ datos, titulo, total: totalFijo }: { datos: { etiqueta: string; valor: number }[]; titulo: string; total?: number }) {
  const total = totalFijo ?? datos.reduce((s, d) => s + d.valor, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div className="wh-anillo">
      <svg viewBox="0 0 200 200" role="img" aria-label={titulo}>
        <title>{titulo}</title>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="26" />
        {datos.map((d, i) => {
          const largo = total ? (d.valor / total) * C : 0;
          const el = (
            <circle
              key={d.etiqueta}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={SERIE(i)}
              strokeWidth="26"
              strokeDasharray={`${Math.max(largo - 1.5, 0)} ${C}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 100 100)"
            />
          );
          acumulado += largo;
          return el;
        })}
        <text x="100" y="98" textAnchor="middle" className="wh-anillo__total">
          {numero(total)}
        </text>
        <text x="100" y="118" textAnchor="middle" className="wh-ct">
          en total
        </text>
      </svg>
      <table className="wh-leyenda">
        <tbody>
          {datos.map((d, i) => (
            <tr key={d.etiqueta}>
              <td>
                <i style={{ background: SERIE(i) }} aria-hidden="true" />
                {d.etiqueta}
              </td>
              <td className="wh-num">{numero(d.valor)}</td>
              <td className="wh-num">{total ? numero((100 * d.valor) / total, 1) : "0"} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Líneas ---------------------------------------------------------------------- */

export interface SerieLinea {
  nombre: string;
  /** Un valor por categoría del eje; null = no se cargó. */
  valores: (number | null)[];
}

export function Lineas({
  categorias,
  series,
  titulo,
  sufijo = "",
  decimales = 0,
  minimo,
}: {
  categorias: string[];
  series: SerieLinea[];
  titulo: string;
  sufijo?: string;
  decimales?: number;
  minimo?: number;
}) {
  const W = 640;
  const H = 260;
  const m = { t: 14, r: 16, b: 34, l: 46 };
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v !== null);
  const lo = minimo ?? Math.min(0, ...todos);
  const hi = Math.max(1, ...todos) * 1.08;
  const x = (i: number) => m.l + (categorias.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (categorias.length - 1));
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} className="wh-svg">
        <title>{titulo}</title>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="wh-rejilla" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="wh-ct">
              {numero(v, decimales)}
              {sufijo}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => (
          <text key={c} x={x(i)} y={H - 12} textAnchor="middle" className="wh-ct">
            {c}
          </text>
        ))}
        {series.map((s, si) => {
          // Un hueco (periodo sin cargar) corta la línea en vez de inventar un punto.
          const trazos: string[] = [];
          let actual = "";
          s.valores.forEach((v, i) => {
            if (v === null) {
              if (actual) trazos.push(actual);
              actual = "";
            } else actual += `${actual ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
          });
          if (actual) trazos.push(actual);
          return (
            <g key={s.nombre} style={{ color: SERIE(si) }}>
              {trazos.map((d, k) => (
                <path key={k} d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {s.valores.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r="3.6" fill="var(--surface)" stroke="currentColor" strokeWidth="2">
                    <title>
                      {s.nombre} · {categorias[i]}: {numero(v, decimales)}
                      {sufijo}
                    </title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <p className="wh-leyenda-fila">
        {series.map((s, i) => (
          <span key={s.nombre}>
            <i style={{ background: SERIE(i) }} aria-hidden="true" />
            {s.nombre}
          </span>
        ))}
      </p>
    </div>
  );
}

/* --- Mapa de calor ----------------------------------------------------------------- */

export function MapaCalor({
  filas,
  columnas,
  valores,
  titulo,
  sufijo = "",
  decimales = 0,
}: {
  filas: string[];
  columnas: string[];
  /** valores[fila][columna]; null = sin dato. */
  valores: (number | null)[][];
  titulo: string;
  sufijo?: string;
  decimales?: number;
}) {
  const todos = valores.flat().filter((v): v is number => v !== null);
  const lo = Math.min(...todos, 0);
  const hi = Math.max(1, ...todos);
  const tono = (v: number) => Math.min(7, Math.max(0, Math.round(((v - lo) / (hi - lo || 1)) * 7)));
  return (
    <div className="wh-tabla-envuelta">
      <table className="wh-calor" aria-label={titulo}>
        <thead>
          <tr>
            <th scope="col" />
            {columnas.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f}>
              <th scope="row" title={f}>
                {f}
              </th>
              {valores[i].map((v, j) =>
                v === null ? (
                  <td key={j} className="wh-calor__vacio" title="Sin dato">
                    ·
                  </td>
                ) : (
                  <td
                    key={j}
                    style={{ background: `var(--od-seq-${tono(v)})`, color: tono(v) >= 4 ? "var(--od-seq-ink-dark)" : "var(--od-seq-ink-light)" }}
                  >
                    {numero(v, decimales)}
                    {sufijo}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Dispersión -------------------------------------------------------------------- */

export interface Punto {
  x: number;
  y: number;
  etiqueta: string;
}

export function Dispersion({ puntos, ejeX, ejeY, titulo }: { puntos: Punto[]; ejeX: string; ejeY: string; titulo: string }) {
  const idFoco = useId();
  const [foco, setFoco] = useState<Punto | null>(null);
  const W = 640;
  const H = 300;
  const m = { t: 14, r: 16, b: 40, l: 52 };
  const limites = useMemo(() => {
    const xs = puntos.map((p) => p.x);
    const ys = puntos.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, [puntos]);
  const sx = (v: number) => m.l + ((v - limites.x0) / (limites.x1 - limites.x0 || 1)) * (W - m.l - m.r);
  const sy = (v: number) => m.t + (1 - (v - limites.y0) / (limites.y1 - limites.y0 || 1)) * (H - m.t - m.b);
  const marcas = [0, 0.5, 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} className="wh-svg" aria-describedby={idFoco}>
        <title>{titulo}</title>
        {marcas.map((f) => {
          const vy = limites.y0 + f * (limites.y1 - limites.y0);
          const vx = limites.x0 + f * (limites.x1 - limites.x0);
          return (
            <g key={f}>
              <line x1={m.l} x2={W - m.r} y1={sy(vy)} y2={sy(vy)} className="wh-rejilla" />
              <text x={m.l - 8} y={sy(vy) + 4} textAnchor="end" className="wh-ct">
                {numero(vy, 1)}
              </text>
              <text x={sx(vx)} y={H - 20} textAnchor="middle" className="wh-ct">
                {numero(vx, 1)}
              </text>
            </g>
          );
        })}
        <text x={(W + m.l) / 2} y={H - 4} textAnchor="middle" className="wh-ct wh-ct--eje">
          {ejeX}
        </text>
        <text transform={`translate(12 ${H / 2}) rotate(-90)`} textAnchor="middle" className="wh-ct wh-ct--eje">
          {ejeY}
        </text>
        {puntos.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r="3.4"
            fill="var(--od-line-1)"
            fillOpacity="0.5"
            stroke="var(--od-line-1)"
            strokeWidth="1"
            onMouseEnter={() => setFoco(p)}
            onMouseLeave={() => setFoco(null)}
          />
        ))}
      </svg>
      <p id={idFoco} className="wh-nota-chica" aria-live="polite">
        {foco ? `${foco.etiqueta}: ${ejeX} ${numero(foco.x, 2)} · ${ejeY} ${numero(foco.y, 2)}` : `${numero(puntos.length)} puntos. Acerque el cursor a uno para ver su detalle.`}
      </p>
    </div>
  );
}

export { SERIE as colorSerie };
