/* =============================================================================
   Pilo Publica · gráficos SVG (barras, línea y anillo), sin librería.

   Se usan igual en la intranet (vista previa en vivo) y en el informe público.
   Accesibles: el SVG lleva aria-label con la serie y una tabla equivalente
   queda oculta a la vista para lectores de pantalla. Los trazos llevan clases
   (pp-br, pp-ln, pp-ar, pp-dt, pp-dn, pp-lv) que animar.ts dibuja con GSAP;
   en reposo todo se ve completo.
   ========================================================================== */

import { Visual, esVisual } from "../../sostenible/OdsVisuales";
import { formato } from "./tipos";
import type { Idioma, PuntoSerie, TipoGrafico } from "./tipos";

const W = 520;
const H = 250;
const L = 46;
const R = 14;
const T = 18;
const B = 30;

/** Un tope «redondo» para el eje. */
function bonito(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const TEXTO = { fill: "var(--ink-secondary)", fontSize: 11, fontFamily: "inherit" } as const;

export interface GraficaProps {
  tipo: TipoGrafico;
  puntos: PuntoSerie[];
  unidad: string;
  titulo: string;
  idioma: Idioma;
  /** Identificador único para el degradado. */
  uid: string;
}

export function Grafica({ tipo, puntos, unidad, titulo, idioma, uid }: GraficaProps) {
  const validos = puntos.filter((p) => p.v !== null) as (PuntoSerie & { v: number })[];
  if (validos.length === 0) return null;
  const pct = unidad.trim() === "%";
  const sfx = pct ? " %" : "";
  const resumen = puntos.map((p) => `${p.x}: ${p.v === null ? (idioma === "en" ? "no data" : "sin dato") : formato(p.v, idioma) + sfx}`).join("; ");
  const alt = `${titulo}. ${resumen}`;

  // Los visuales de UDES en Cifras (antes y ahora, composición, mapa de calor) son HTML y comparten el dibujo con el informe ODS.
  if (esVisual(tipo)) return <Visual tipo={tipo} puntos={puntos} unidad={unidad} lang={idioma} fmt={(v) => formato(v, idioma)} />;

  const tabla = (
    <table className="pp-sr">
      <caption>{titulo}</caption>
      <thead>
        <tr>
          <th scope="col">{idioma === "en" ? "Period" : "Periodo"}</th>
          <th scope="col">{idioma === "en" ? "Value" : "Valor"}{unidad && !pct ? ` (${unidad})` : ""}</th>
        </tr>
      </thead>
      <tbody>
        {puntos.map((p) => (
          <tr key={p.key + p.x}>
            <th scope="row">{p.x}</th>
            <td>{p.v === null ? (idioma === "en" ? "no data" : "sin dato") : formato(p.v, idioma) + sfx}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (tipo === "donut") {
    const ultimo = validos[validos.length - 1];
    const v = Math.max(0, Math.min(100, ultimo.v));
    const r = 78;
    const cx = W / 2;
    const cy = H / 2 + 2;
    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} className="pp-svg">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={22} />
          <circle
            className="pp-dn"
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            style={{ stroke: "var(--pp-k)" }}
            strokeWidth={22}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${v} 100`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          <text x={cx} y={cy + 9} textAnchor="middle" fontWeight={800} fontSize={34} style={{ fill: "var(--ink)" }}>
            {formato(ultimo.v, idioma)}
            {pct ? " %" : ""}
          </text>
          <text x={cx} y={cy + 29} textAnchor="middle" {...TEXTO}>
            {ultimo.x}
          </text>
        </svg>
        {tabla}
      </>
    );
  }

  const n = puntos.length;
  const pw = W - L - R;
  const ph = H - T - B;
  const mn = Math.min(0, ...validos.map((p) => p.v));
  const mx = bonito(Math.max(...validos.map((p) => p.v)) * 1.05) || 1;
  const rango = mx - mn || 1;
  const X = (i: number) => L + (pw * (i + 0.5)) / n;
  const Y = (v: number) => T + ph * (1 - (v - mn) / rango);

  const rejilla = [0, 1, 2, 3, 4].map((k) => {
    const v = mn + (rango * k) / 4;
    const y = Y(v);
    return (
      <g key={k}>
        <line x1={L} x2={W - R} y1={y} y2={y} style={{ stroke: "var(--gridline)" }} strokeWidth={1} />
        <text x={L - 8} y={y + 4} textAnchor="end" {...TEXTO}>
          {formato(Number(v.toFixed(1)), idioma)}
        </text>
      </g>
    );
  });
  const ejeX = puntos.map((p, i) => (
    <text key={p.key + p.x} x={X(i)} y={H - 8} textAnchor="middle" {...TEXTO}>
      {p.x}
    </text>
  ));
  const ultimoIdx = puntos.reduce((a, p, i) => (p.v !== null ? i : a), 0);
  const ultimo = puntos[ultimoIdx];
  const etiqueta =
    ultimo.v !== null ? (
      <text className="pp-lv" x={X(ultimoIdx)} y={Y(ultimo.v) - 9} textAnchor="middle" fontWeight={700} fontSize={12.5} style={{ fill: "var(--ink)" }}>
        {formato(ultimo.v, idioma)}
        {sfx}
      </text>
    ) : null;

  if (tipo === "bar") {
    const bw = Math.min(54, (pw / n) * 0.56);
    const cero = Y(Math.max(0, mn));
    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} className="pp-svg">
          {rejilla}
          {puntos.map((p, i) =>
            p.v === null ? (
              <text key={p.key + p.x} x={X(i)} y={cero - 6} textAnchor="middle" {...TEXTO}>
                {idioma === "en" ? "n/a" : "s/d"}
              </text>
            ) : (
              <rect
                key={p.key + p.x}
                className="pp-br"
                x={X(i) - bw / 2}
                y={Math.min(Y(p.v), cero)}
                width={bw}
                height={Math.max(1, Math.abs(cero - Y(p.v)))}
                rx={4}
                style={{ fill: "var(--pp-k)", opacity: i === ultimoIdx ? 1 : 0.55, transformBox: "fill-box", transformOrigin: "bottom" }}
              />
            ),
          )}
          {ejeX}
          {etiqueta}
        </svg>
        {tabla}
      </>
    );
  }

  // línea: se corta donde falta el dato
  let d = "";
  let abierto = false;
  puntos.forEach((p, i) => {
    if (p.v === null) {
      abierto = false;
      return;
    }
    d += `${abierto ? " L" : d ? " M" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`;
    abierto = true;
  });
  const idxValidos = puntos.map((p, i) => (p.v !== null ? i : -1)).filter((i) => i >= 0);
  const primero = idxValidos[0];
  const area = `M${X(primero).toFixed(1)} ${Y(puntos[primero].v as number).toFixed(1)}${idxValidos
    .slice(1)
    .map((i) => ` L${X(i).toFixed(1)} ${Y(puntos[i].v as number).toFixed(1)}`)
    .join("")} L${X(ultimoIdx)} ${T + ph} L${X(primero)} ${T + ph} Z`;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} className="pp-svg">
        <defs>
          <linearGradient id={`pp-g-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--pp-k)" }} stopOpacity={0.22} />
            <stop offset="1" style={{ stopColor: "var(--pp-k)" }} stopOpacity={0} />
          </linearGradient>
        </defs>
        {rejilla}
        {idxValidos.length > 1 && <path className="pp-ar" d={area} fill={`url(#pp-g-${uid})`} />}
        <path className="pp-ln" d={d} fill="none" style={{ stroke: "var(--pp-k)" }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" />
        {idxValidos.map((i) => (
          <circle key={puntos[i].key + puntos[i].x} className="pp-dt" cx={X(i)} cy={Y(puntos[i].v as number)} r={i === ultimoIdx ? 5.5 : 3.5} strokeWidth={2} style={{ stroke: "var(--pp-k)", fill: i === ultimoIdx ? "var(--pp-k)" : "var(--surface)" }} />
        ))}
        {ejeX}
        {etiqueta}
      </svg>
      {tabla}
    </>
  );
}

/** Mini línea de tendencia para tablas. */
export function Tendencia({ valores }: { valores: number[] }) {
  if (valores.length < 2) return <span aria-hidden="true">—</span>;
  const mn = Math.min(...valores);
  const mx = Math.max(...valores);
  const pts = valores.map((v, i) => `${(i * 56) / (valores.length - 1)},${18 - (mx === mn ? 9 : ((v - mn) / (mx - mn)) * 16)}`).join(" ");
  return (
    <svg width={58} height={20} viewBox="-2 -2 60 22" aria-hidden="true">
      <polyline points={pts} fill="none" style={{ stroke: "var(--pp-k)" }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
