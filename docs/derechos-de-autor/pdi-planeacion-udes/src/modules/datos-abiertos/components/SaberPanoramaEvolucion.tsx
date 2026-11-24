/* =============================================================================
   Frente al país, evolución: seis pequeños múltiplos de la brecha.

   Cada fila es una competencia; el eje horizontal son los años y el vertical,
   los puntos de diferencia entre la UDES (o el campus resaltado) y el promedio
   nacional. La línea del cero es el país. El área entre la línea y el cero va
   en azul cuando la UDES está arriba y en terracota cuando está abajo. Un año
   sin dato interrumpe la línea: nunca se une ni se proyecta.

   Las seis filas comparten dominio vertical. A la derecha, la cifra de cierre:
   cambio de la brecha, lectura en palabras, años seguidos y mejor y peor año.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { SABER_COMPETENCIES, SABER_FEW_LEVELS, SABER_FEW_MEAN, saberPanoGapDomain } from "../data/saber-pro";
import type { SaberCompetency, SaberPanoPoint, SaberPanoRow, SaberPanoVariation, SaberPanorama } from "../data/saber-pro";
import { useInView, usePrefersReducedMotion, useWidth } from "./motion";

/* --- Texto y marcas que comparten las dos vistas ---------------------------------- */

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const panoSigned = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};
export const panoDir = (n: number): "up" | "down" | "same" => (Math.round(n) > 0 ? "up" : Math.round(n) < 0 ? "down" : "same");
export const panoWords = (gap: number) => {
  const r = Math.abs(Math.round(gap));
  return r === 0 ? "igual al promedio del país" : `${r} ${r === 1 ? "punto" : "puntos"} ${gap > 0 ? "sobre" : "bajo"} el país`;
};
const sideWords = (sign: number) => (sign > 0 ? "sobre" : sign < 0 ? "bajo" : "igual que");
export const panoTone = (gap: number) => {
  const size = Math.abs(Math.round(gap));
  return size < 3 ? "mid" : `${gap > 0 ? "pos" : "neg"}-${size >= 10 ? 2 : 1}`;
};

export function PanoGlyph({ dir }: { dir: "up" | "down" | "same" }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d={dir === "up" ? "M5 1.5 9 7.5H1z" : dir === "down" ? "M5 8.5 9 2.5H1z" : "M1 4.2h8v1.6H1z"} />
    </svg>
  );
}

const competencyLabel = (key: SaberCompetency) => SABER_COMPETENCIES.find((c) => c.key === key)!.label;

/** La frase de una fila de evolución, para el lector de pantalla y la línea de lectura. */
export function panoEvolutionSentence(row: SaberPanoRow): string {
  const v = row.variacion;
  const name = `${competencyLabel(row.competency)}, ${row.scope.label}`;
  if (!v) return `${name}: sin dato frente al país.`;
  let text = `${name}: en ${v.first.year}, ${panoWords(v.first.gap!)}; en ${v.last.year}, ${panoWords(v.last.gap!)}. `;
  text += v.count < 2 ? "Solo hay un año con dato. " : `${v.label}: la brecha cambia ${panoSigned(v.delta)} puntos. `;
  text += `${v.streak} ${v.streak === 1 ? "año seguido" : "años seguidos"} ${sideWords(v.sign)} el país. `;
  text += `La mejor brecha fue ${panoSigned(v.best.gap)} (${v.best.year}) y la peor ${panoSigned(v.worst.gap)} (${v.worst.year}).`;
  const missing = row.serie.filter((p) => p.gap === null && p.year > v.first.year).map((p) => p.year);
  if (missing.length) text += ` Sin dato: ${missing.join(", ")}.`;
  if (v.few) text += ` Con menos de ${SABER_FEW_MEAN} evaluados en un extremo, la cifra no se compara.`;
  else if (v.low) text += ` Algunos años tienen menos de ${SABER_FEW_LEVELS} evaluados.`;
  return text;
}

/** Las cifras de cierre de una serie. */
export function PanoClose({ variacion }: { variacion: SaberPanoVariation | null }) {
  if (!variacion) return <span className="od-pano__cl">Sin dato frente al país</span>;
  const v = variacion;
  const dir = panoDir(v.delta);
  return (
    <>
      <span className="od-pano__gap" data-tone={dir} data-few={v.few || undefined}>
        <PanoGlyph dir={dir} />
        {v.few ? `(${panoSigned(v.delta)})` : panoSigned(v.delta)} puntos desde {v.first.year}
      </span>
      <span className="od-pano__cl">
        <b>{v.label}</b>
      </span>
      <span className="od-pano__cl">
        {v.streak} {v.streak === 1 ? "año seguido" : "años seguidos"} {sideWords(v.sign)} el país
      </span>
      <span className="od-pano__cl">
        Mejor {panoSigned(v.best.gap)} ({v.best.year}) · peor {panoSigned(v.worst.gap)} ({v.worst.year})
      </span>
      {v.low && <span className="od-pano__cl">Pocos evaluados en algún año</span>}
    </>
  );
}

/* --- Un múltiplo ---------------------------------------------------------------------- */

const HEIGHT = 84;
const PAD = 12;

const runsOf = (serie: SaberPanoPoint[]) => {
  const runs: { i: number; p: SaberPanoPoint }[][] = [];
  let current: { i: number; p: SaberPanoPoint }[] | null = null;
  serie.forEach((p, i) => {
    if (p.gap === null) {
      current = null;
      return;
    }
    if (!current) {
      current = [];
      runs.push(current);
    }
    current.push({ i, p });
  });
  return runs;
};

function EvoChart({
  row,
  others,
  domain,
  play,
}: {
  row: SaberPanoRow;
  others: SaberPanoRow[];
  domain: [number, number];
  play: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 520);
  const uid = useId().replace(/:/g, "");
  const [lo, hi] = domain;
  const n = row.serie.length;
  const step = n > 1 ? (width - 2 * PAD) / (n - 1) : 0;
  const X = (i: number) => PAD + i * step;
  const Y = (g: number) => 4 + ((HEIGHT - 8) * (hi - Math.max(lo, Math.min(hi, g)))) / (hi - lo);
  const zero = Y(0);
  const pathOf = (run: { i: number; p: SaberPanoPoint }[]) => run.map((r, j) => `${j ? "L" : "M"}${X(r.i).toFixed(1)} ${Y(r.p.gap!).toFixed(1)}`).join(" ");
  const lastIndex = row.serie.reduce((acc, p, i) => (p.gap !== null ? i : acc), -1);
  const grid: number[] = [];
  for (let g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) if (g !== 0) grid.push(g);

  return (
    <div className="od-pano__evo-chart" ref={box} data-play={play || undefined}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`h${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--od-board-line-strong)" }} strokeWidth="1" />
          </pattern>
          <clipPath id={`a${uid}`}>
            <rect x="0" y="0" width={width} height={zero} />
          </clipPath>
          <clipPath id={`b${uid}`}>
            <rect x="0" y={zero} width={width} height={HEIGHT - zero} />
          </clipPath>
        </defs>
        {row.serie.map((p, i) =>
          p.gap === null ? (
            <rect key={p.year} x={Math.max(0, X(i) - step / 2)} y={0} width={Math.min(width, X(i) + step / 2) - Math.max(0, X(i) - step / 2)} height={HEIGHT} fill={`url(#h${uid})`} />
          ) : null,
        )}
        {grid.map((g) => (
          <g key={g}>
            <line x1={0} x2={width} y1={Y(g)} y2={Y(g)} style={{ stroke: "var(--od-board-line)" }} strokeDasharray="2 4" />
            {g % 10 === 0 && (
              <text x={2} y={Y(g) - 2} fontSize={10} style={{ fill: "var(--od-board-muted)" }}>
                {g > 0 ? `+${g}` : `−${Math.abs(g)}`}
              </text>
            )}
          </g>
        ))}
        {others.map((o) =>
          runsOf(o.serie).map((run, k) =>
            run.length > 1 ? (
              <path key={`${o.key}-${k}`} d={pathOf(run)} fill="none" style={{ stroke: "var(--od-board-muted)" }} strokeWidth={1.25} opacity={0.55} strokeLinejoin="round" />
            ) : null,
          ),
        )}
        {runsOf(row.serie).map((run, k) => {
          if (run.length < 2) return null;
          const d = `${pathOf(run)} L${X(run[run.length - 1].i).toFixed(1)} ${zero.toFixed(1)} L${X(run[0].i).toFixed(1)} ${zero.toFixed(1)} Z`;
          return (
            <g key={k} className="od-pano__area">
              <path d={d} clipPath={`url(#a${uid})`} style={{ fill: "var(--od-div-pos-1)" }} opacity={0.5} />
              <path d={d} clipPath={`url(#b${uid})`} style={{ fill: "var(--od-div-neg-1)" }} opacity={0.5} />
            </g>
          );
        })}
        <line x1={0} x2={width} y1={zero} y2={zero} style={{ stroke: "var(--od-board-ink)" }} strokeWidth={1.5} />
        <text x={2} y={zero - 3} fontSize={10} fontWeight={700} style={{ fill: "var(--od-board-ink)" }}>
          0
        </text>
        {runsOf(row.serie).map((run, k) =>
          run.length > 1 ? (
            <path key={k} className="od-pano__line" pathLength={1} d={pathOf(run)} fill="none" style={{ stroke: "var(--od-series-1)" }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          ) : null,
        )}
        {row.serie.map((p, i) => {
          if (p.gap === null) return null;
          const hollow = p.low || p.kind === "few";
          return (
            <circle
              key={p.year}
              className="od-pano__pt"
              cx={X(i)}
              cy={Y(p.gap)}
              r={i === lastIndex ? 4.6 : 3.2}
              strokeWidth={hollow ? 2 : 1.5}
              strokeDasharray={p.kind === "few" ? "2 2" : undefined}
              style={{ fill: hollow ? "var(--od-board)" : "var(--od-series-1)", stroke: hollow ? "var(--od-series-1)" : "var(--od-board)", "--i": i } as CSSProperties}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* --- Las seis filas --------------------------------------------------------------------- */

let evolutionPlayed = false;

export function SaberPanoramaEvolucion({
  pano,
  focusKey,
  competency,
  onCompetency,
  onRead,
}: {
  pano: SaberPanorama;
  focusKey: string;
  competency: SaberCompetency;
  onCompetency: (c: SaberCompetency) => void;
  onRead: (text: string | null) => void;
}) {
  const host = useRef<HTMLOListElement>(null);
  const seen = useInView(host);
  const reduced = usePrefersReducedMotion();
  // La línea se dibuja la primera vez que se abre; después solo cambia.
  const [first] = useState(() => !evolutionPlayed);
  useEffect(() => {
    evolutionPlayed = true;
  }, []);
  const play = first && !reduced;
  const armed = seen || reduced;

  const domain = saberPanoGapDomain(pano.rows, focusKey);
  const rows = SABER_COMPETENCIES.map((c) => ({
    info: c,
    row: pano.rows.find((r) => r.scope.key === focusKey && r.competency === c.key),
    others: pano.rows.filter((r) => r.scope.key !== focusKey && r.competency === c.key),
  }));

  return (
    <>
      <div className="od-pano__axis od-pano__axis--evo" aria-hidden="true">
        <span>Brecha, en puntos</span>
        <div className="od-pano__years">
          {pano.years.map((y) => (
            <span key={y}>{y}</span>
          ))}
        </div>
        <span>Cómo cambió</span>
      </div>
      <ol className="od-pano__rows" ref={host} data-armed={armed || undefined} data-play={play || undefined} aria-label="Brecha con el país por competencia y año">
        {rows.map(({ info, row, others }, index) =>
          row ? (
            <li
              key={info.key}
              className="od-pano__row od-pano__row--evo"
              data-active={info.key === competency || undefined}
              style={{ "--delay": `${index * 90}ms` } as CSSProperties}
              tabIndex={0}
              role="group"
              aria-label={panoEvolutionSentence(row)}
              onPointerEnter={() => onRead(panoEvolutionSentence(row))}
              onPointerLeave={() => onRead(null)}
              onFocus={() => onRead(panoEvolutionSentence(row))}
              onBlur={() => onRead(null)}
            >
              <button type="button" className="od-pano__lab" aria-pressed={info.key === competency} aria-label={`${info.label}, elegir competencia`} onClick={() => onCompetency(info.key)}>
                <span className="od-pano__code" aria-hidden="true">
                  {info.code}
                </span>
                <span>{info.label}</span>
              </button>
              <EvoChart row={row} others={others} domain={domain} play={play} />
              <div className="od-pano__close">
                <PanoClose variacion={row.variacion} />
              </div>
            </li>
          ) : null,
        )}
      </ol>
    </>
  );
}

/** Tabla equivalente de la evolución: la serie de brecha de un ámbito, por competencia y año. */
export function SaberPanoramaEvolucionTable({ pano, focusKey }: { pano: SaberPanorama; focusKey: string }) {
  const scope = pano.scopes.find((s) => s.key === focusKey);
  return (
    <table>
      <caption>
        Brecha con el país por año, {scope?.label ?? ""}: promedio menos promedio nacional, en puntos. Entre paréntesis, menos de {SABER_FEW_MEAN} evaluados.
      </caption>
      <thead>
        <tr>
          <th scope="col">Competencia</th>
          {pano.years.map((y) => (
            <th key={y} scope="col" className="num">
              {y}
            </th>
          ))}
          <th scope="col" className="num">
            Variación
          </th>
          <th scope="col" className="num">
            Años seguidos
          </th>
          <th scope="col">Mejor y peor</th>
          <th scope="col">Nota</th>
        </tr>
      </thead>
      <tbody>
        {SABER_COMPETENCIES.map((c) => {
          const row = pano.rows.find((r) => r.scope.key === focusKey && r.competency === c.key);
          if (!row) return null;
          const v = row.variacion;
          return (
            <tr key={c.key}>
              <th scope="row">{c.label}</th>
              {row.serie.map((p) => (
                <td key={p.year} className="num">
                  {p.gap === null ? "Sin dato" : p.kind === "few" ? `(${panoSigned(p.gap)})` : panoSigned(p.gap)}
                </td>
              ))}
              {v ? (
                <>
                  <td className="num">
                    {panoSigned(v.delta)} desde {v.first.year}
                  </td>
                  <td className="num">
                    {v.streak} {v.sign > 0 ? "sobre" : v.sign < 0 ? "bajo" : "igual"}
                  </td>
                  <td>
                    Mejor {panoSigned(v.best.gap)} ({v.best.year}); peor {panoSigned(v.worst.gap)} ({v.worst.year})
                  </td>
                  <td>
                    {v.label}
                    {v.low ? ". Pocos evaluados en algún año" : ""}
                  </td>
                </>
              ) : (
                <>
                  <td className="num" />
                  <td className="num" />
                  <td />
                  <td>Sin dato</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const panoInteger = integer;
