/* =============================================================================
   Boletín · Resultados Saber PRO.

   Una entrada del boletín por competencia (puntaje global, lectura crítica,
   razonamiento cuantitativo, ciudadanas, comunicación escrita e inglés), cada
   una con dos hojas, las mismas dos lecturas de la ficha web:

   · Niveles: la escalera de toda la UDES por año, anclada en el umbral de
     desempeño alto (nivel 3; B1 en inglés), y debajo la participación en
     niveles altos por sede. El puntaje global no tiene niveles: su hoja dibuja
     el reparto del puntaje partido en el promedio nacional y la tabla da el
     promedio por sede.
   · Brecha con el país: sede y programa por año, en puntos sobre o bajo el
     promedio nacional. Es una tabla larga: sigue en páginas de continuación,
     sin dejar nunca una sede sola al pie de una página.

   Un programa es de su sede, con el nombre que trae la fuente; los evaluados
   sin código SNIES van en su propia fila. Nada se suma entre sedes.

   El papel no tiene tema: los tonos son --bol-div-*, fijos.
   ========================================================================== */

import type { CSSProperties, ReactNode } from "react";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import {
  SABER_COMPETENCIES,
  SABER_FEW_LEVELS,
  SABER_FEW_MEAN,
  SABER_GAP_LEGEND,
  competencyInfo,
  highShare,
  levelScale,
  saberCatalog,
  saberFigure,
  saberGapRows,
  saberGapTone,
  saberLevelTone,
  saberYears,
} from "../datos-abiertos/data/saber-pro";
import type { SaberCompetency, SaberFigure, SaberLevelScale, SaberProData } from "../datos-abiertos/data/saber-pro";
import { SwatchLegend } from "./figures";
import { saberPaisUnits } from "./saber-pais";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pct = (n: number) => `${integer.format(Math.round(n))} %`;
const signed = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};
const gapWords = (gap: number) => {
  const r = Math.abs(Math.round(gap));
  return r === 0 ? "igual al país" : `${r} ${r === 1 ? "punto" : "puntos"} ${gap > 0 ? "sobre" : "bajo"} el país`;
};

/**
 * Filas de la brecha en la primera hoja (con la franja de notas) y en cada
 * continuación. Una fila mide unos 3,4 mm: 44 caben bajo las notas y 62 en una
 * página entera, con aire para el encabezado repetido.
 */
const GAP_FIRST = 44;
const GAP_NEXT = 62;

type SheetComponent = (props: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) => ReactNode;

type ContinuationComponent = (props: { title: string; from: number; to: number; total: number; children: ReactNode }) => ReactNode;

/** Años del conjunto hasta el corte del boletín. */
function yearsUpTo(data: SaberProData, cut: number) {
  return saberYears(data).filter((y) => cut === ALL_YEARS || y <= cut);
}

const latest = (figures: (SaberFigure | null)[], test: (f: SaberFigure) => boolean = () => true) =>
  [...figures].reverse().find((f): f is SaberFigure => f !== null && test(f)) ?? null;

/** Separa "saber:<clave>:<competencia>" en sus dos partes. */
export function parseSaberKey(key: string): { id: string; competency: SaberCompetency | "pais" } | null {
  const at = key.lastIndexOf(":");
  if (at < 0) return null;
  const competency = key.slice(at + 1) as SaberCompetency | "pais";
  // «pais» es la entrada «Frente al país»: el resumen y una hoja por competencia.
  return competency === "pais" || SABER_COMPETENCIES.some((c) => c.key === competency) ? { id: key.slice(0, at), competency } : null;
}

/* --- Cifras clave de la hoja ------------------------------------------------------ */

function Keys({ data, competency, years }: { data: SaberProData; competency: SaberCompetency; years: number[] }) {
  const figures = years.map((y) => saberFigure(data, competency, y));
  const mean = latest(figures, (f) => f.shown !== null);
  const leveled = latest(figures, (f) => f.leveled > 0);
  const scale = levelScale(competency);
  const share = highShare(leveled, competency);
  const first = leveled ? figures.find((f) => f !== null && f.leveled > 0 && f.year < leveled.year) ?? null : null;
  const firstShare = highShare(first, competency);
  return (
    <dl className="bol-saber-keys">
      {mean && (
        <div>
          <dt>Promedio UDES · {mean.year}</dt>
          <dd>
            <b>{integer.format(Math.round(mean.shown!))}</b>
            {mean.national !== null && (
              <span>
                país {integer.format(Math.round(mean.national))} · {gapWords(mean.shown! - mean.national)}
              </span>
            )}
          </dd>
        </div>
      )}
      {scale && leveled && share !== null && (
        <div>
          <dt>
            En {scale.highLabel} · {leveled.year}
          </dt>
          <dd>
            <b>{pct(share)}</b>
            <span>
              de {integer.format(leveled.leveled)} evaluados
              {firstShare !== null && first ? ` · ${signed(share - firstShare)} p. p. desde ${first.year}` : ""}
            </span>
          </dd>
        </div>
      )}
    </dl>
  );
}

/* --- Escalera en papel ------------------------------------------------------------ */

function PaperLadder({ figures, scale, width = 178 }: { figures: SaberFigure[]; scale: SaberLevelScale; width?: number }) {
  const rows = figures.map((f) => {
    const shares = scale.keys.map((key) => ((f.levels[key] ?? 0) / f.leveled) * 100);
    const low = shares.slice(0, scale.high).reduce((a, b) => a + b, 0);
    return { f, shares, low, high: 100 - low };
  });
  const maxLow = Math.max(1, ...rows.map((r) => r.low));
  const maxHigh = Math.max(1, ...rows.map((r) => r.high));
  const L = 12;
  const R = 26;
  const plot = width - L - R;
  const axis = L + (plot * maxLow) / (maxLow + maxHigh);
  const lowSpan = axis - L - 0.3;
  const highSpan = L + plot - axis - 0.3;
  const ROW = 6.4;
  const BAR = 4.6;
  const TOP = 5;
  const height = TOP + rows.length * ROW + 1;

  return (
    <svg className="bol-chart bol-saber-ladder" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Reparto por niveles de desempeño, ${figures[0]?.year}–${figures[figures.length - 1]?.year}`}>
      <text className="bol-chart__tick" x={axis - 1.2} y={3} textAnchor="end">
        ← bajo {scale.labels[scale.high]}
      </text>
      <text className="bol-chart__tick" x={axis + 1.2} y={3}>
        {scale.highLabel} →
      </text>
      <text className="bol-chart__tick" x={width} y={3} textAnchor="end">
        en {scale.highLabel}
      </text>
      {rows.map((row, r) => {
        const y = TOP + r * ROW;
        const prev = r > 0 ? rows[r - 1] : null;
        let left = axis - 0.3;
        let right = axis + 0.3;
        const segs: ReactNode[] = [];
        for (let i = scale.high - 1; i >= 0; i -= 1) {
          const w = (row.shares[i] / maxLow) * lowSpan;
          left -= w;
          segs.push(<Seg key={`l${i}`} x={left} y={y} w={w} h={BAR} tone={saberLevelTone(i, scale)} share={row.shares[i]} />);
        }
        for (let i = scale.high; i < scale.keys.length; i += 1) {
          const w = (row.shares[i] / maxHigh) * highSpan;
          segs.push(<Seg key={`h${i}`} x={right} y={y} w={w} h={BAR} tone={saberLevelTone(i, scale)} share={row.shares[i]} />);
          right += w;
        }
        const few = row.f.leveled < SABER_FEW_LEVELS;
        return (
          <g key={row.f.year} opacity={few ? 0.55 : undefined}>
            <text className="bol-chart__year" x={0} y={y + BAR - 1.2} fontWeight={700}>
              {row.f.year}
            </text>
            {segs}
            <text className="bol-chart__value" x={width - 9} y={y + BAR - 1.1} textAnchor="end">
              {pct(row.high)}
            </text>
            {prev && (
              <text className="bol-chart__tick" x={width} y={y + BAR - 1.1} textAnchor="end">
                {signed(row.high - prev.high)}
              </text>
            )}
          </g>
        );
      })}
      <line className="bol-saber-ladder__axis" x1={axis} x2={axis} y1={TOP - 0.8} y2={TOP + rows.length * ROW - ROW + BAR + 0.8} />
    </svg>
  );
}

function Seg({ x, y, w, h, tone, share }: { x: number; y: number; w: number; h: number; tone: string; share: number }) {
  if (w <= 0.05) return null;
  return (
    <g>
      <rect x={x} y={y} width={Math.max(0.05, w - 0.25)} height={h} style={{ fill: `var(--bol-div-${tone})` } as CSSProperties} />
      {w >= 5 && (
        <text x={x + w / 2} y={y + h - 1.3} textAnchor="middle" className="bol-saber-ladder__pct" style={{ fill: `var(--bol-div-${tone}-ink)` } as CSSProperties}>
          {integer.format(Math.round(share))}
        </text>
      )}
    </g>
  );
}

/* --- Reparto del puntaje global en papel ------------------------------------------- */

function PaperRidges({ figures, width = 178 }: { figures: SaberFigure[]; width?: number }) {
  const bins = figures.flatMap((f) => Object.entries(f.histogram).filter(([, n]) => n > 0).map(([b]) => Number(b)));
  const lo = Math.max(0, Math.min(...bins) - 10);
  const hi = Math.min(300, Math.max(...bins) + 20);
  const L = 12;
  const R = 34;
  const plot = width - L - R;
  const at = (score: number) => L + ((score - lo) / (hi - lo)) * plot;
  const ROW = 9;
  const H = 7;
  const TOP = 2;
  const height = TOP + figures.length * ROW + 5;
  const ticks = [50, 100, 150, 200, 250].filter((t) => t >= lo && t <= hi);

  return (
    <svg className="bol-chart bol-saber-ridges" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reparto del puntaje global por año frente al promedio nacional">
      {figures.map((f, r) => {
        const base = TOP + r * ROW + H;
        const counts = Object.entries(f.histogram).map(([b, n]) => [Number(b), n] as const);
        const peak = Math.max(1, ...counts.map(([, n]) => n));
        const total = counts.reduce((s, [, n]) => s + n, 0);
        const national = f.national;
        const above = national === null ? null : counts.filter(([b]) => b >= national).reduce((s, [, n]) => s + n, 0);
        return (
          <g key={f.year} opacity={f.evaluated < SABER_FEW_LEVELS ? 0.55 : undefined}>
            <text className="bol-chart__year" x={0} y={base - 1.5} fontWeight={700}>
              {f.year}
            </text>
            <line className="bol-chart__grid" x1={L} x2={L + plot} y1={base} y2={base} />
            {counts.map(([b, n]) => {
              const h = Math.max(0.3, (n / peak) * H);
              const tone = national === null ? "mid" : b + 10 <= national ? "neg-1" : "pos-1";
              return <rect key={b} x={at(b)} y={base - h} width={Math.max(0.1, at(b + 10) - at(b) - 0.2)} height={h} style={{ fill: `var(--bol-div-${tone})` } as CSSProperties} />;
            })}
            {f.shown !== null && <line className="bol-saber-ridges__mark" x1={at(f.shown)} x2={at(f.shown)} y1={base - H - 0.6} y2={base + 0.6} />}
            {national !== null && <line className="bol-saber-ridges__mark" data-national x1={at(national)} x2={at(national)} y1={base - H - 0.6} y2={base + 0.6} />}
            <text className="bol-chart__value" x={width} y={base - 3.6} textAnchor="end">
              {f.shown === null ? "—" : integer.format(Math.round(f.shown))}
            </text>
            {above !== null && total > 0 && (
              <text className="bol-chart__tick" x={width} y={base - 0.6} textAnchor="end">
                {pct((above / total) * 100)} sobre el país
              </text>
            )}
          </g>
        );
      })}
      {ticks.map((t) => (
        <text key={t} className="bol-chart__tick" x={at(t)} y={height - 0.6} textAnchor="middle">
          {t}
        </text>
      ))}
    </svg>
  );
}

/* --- Hojas ------------------------------------------------------------------------ */

export function saberUnits(
  data: SaberProData,
  entry: SaberCompetency | "pais",
  cut: number,
  Sheet: SheetComponent,
  Continuation: ContinuationComponent,
): { node: ReactNode; title: string; tight?: boolean }[] {
  if (entry === "pais") return saberPaisUnits(data, cut, Sheet);
  const competency = entry;
  const info = competencyInfo(competency);
  const scale = levelScale(competency);
  const years = yearsUpTo(data, cut);
  if (!years.length) return [];
  const span = `${years[0]}–${years[years.length - 1]}`;
  const cutNote = cut === ALL_YEARS ? `Todos los años publicados (${span})` : `Hasta ${cut}`;
  const campuses = saberCatalog(data).campuses;
  const units: { node: ReactNode; title: string; tight?: boolean }[] = [];

  // Hoja 1: niveles (o reparto del puntaje global) de toda la UDES.
  const all = years.map((y) => saberFigure(data, competency, y));
  const perStudent = all.filter((f): f is SaberFigure => f !== null && (scale ? f.leveled > 0 : f.evaluated > 0));
  if (perStudent.length) {
    const title = scale ? `Saber PRO · ${info.label} · niveles de desempeño` : `Saber PRO · ${info.label} · reparto del puntaje`;
    const bySite = (campus: string) => years.map((y) => saberFigure(data, competency, y, { campus }));
    units.push({
      title,
      node: (
        <Sheet
          title={title}
          description={
            scale
              ? `Cómo se reparten los evaluados de la UDES entre los niveles de desempeño de ${info.label.toLowerCase()}, año por año, y cuántos llegan a ${scale.highLabel} en cada sede.`
              : "Cómo se reparte el puntaje global de los evaluados de la UDES, año por año, frente al promedio nacional, y el promedio de cada sede."
          }
          source={data.source}
          notes={[
            [
              "Lectura",
              scale
                ? `Cada barra suma 100 %. A la izquierda de la línea, lo que queda bajo ${scale.labels[scale.high]}; a la derecha, ${scale.highLabel}. La columna final dice el % alto y su cambio frente al año anterior.`
                : "Barras: evaluados por tramo de 10 puntos, en terracota bajo el promedio nacional y en azul sobre él. Línea continua: promedio de la UDES; punteada: nacional.",
            ],
            ["Umbral", scale ? (competency === "ing" ? "B1 o B2: la meta de inglés para un profesional." : "Nivel 3 o 4: desempeño alto.") : "El puntaje global no tiene niveles de desempeño."],
            ["Pocos evaluados", `Los años con menos de ${SABER_FEW_LEVELS} evaluados van atenuados.`],
            ["Método", data.note],
            ["Corte", cutNote],
          ]}
          wide
        >
          <Keys data={data} competency={competency} years={years} />
          {scale ? (
            <>
              <SwatchLegend labels={scale.labels} colors={scale.keys.map((_, i) => `var(--bol-div-${saberLevelTone(i, scale)})`)} />
              <PaperLadder figures={perStudent} scale={scale} />
            </>
          ) : (
            <PaperRidges figures={perStudent} />
          )}
          <SiteTable
            caption={scale ? `En ${scale.highLabel}, por sede y año` : "Promedio del puntaje global por sede y año"}
            years={years}
            rows={[
              { label: "Toda la UDES", strong: true, figures: all },
              ...campuses.map((campus) => ({ label: campus, figures: bySite(campus) })),
              ...(scale ? [] : [{ label: "Promedio nacional", national: true, figures: all }]),
            ]}
            competency={competency}
          />
        </Sheet>
      ),
    });
  }

  // Hoja 2 y continuaciones: brecha con el país por sede y programa.
  const rows = saberGapRows(data);
  const national = years.map((y) => saberFigure(data, competency, y)?.national ?? null);
  if (national.every((n) => n === null)) return units;

  const chunks: { from: number; rows: typeof rows }[] = [];
  for (let i = 0; i < rows.length; ) {
    let size = chunks.length === 0 ? GAP_FIRST : GAP_NEXT;
    // Una sede no queda sola al pie: su encabezado baja con sus programas.
    while (size > 1 && i + size < rows.length && rows[i + size - 1].level === "sede") size -= 1;
    chunks.push({ from: i, rows: rows.slice(i, i + size) });
    i += size;
  }
  const gapTitle = `Saber PRO · ${info.label} · brecha con el país`;
  const table = (list: typeof rows) => <GapTable rows={list} data={data} competency={competency} years={years} national={national} />;

  chunks.forEach((chunk, index) => {
    units.push(
      index === 0
        ? {
            title: gapTitle,
            node: (
              <Sheet
                title={gapTitle}
                description={`Diferencia en puntos entre el promedio de ${info.label.toLowerCase()} de cada sede y programa y el promedio nacional de ese año.`}
                source={data.source}
                notes={[
                  ["Lectura", SABER_GAP_LEGEND.map((s) => s.label).join(" · ")],
                  ["Pocos evaluados", `Con menos de ${SABER_FEW_MEAN} evaluados la cifra va entre paréntesis y sin color: un promedio así no se compara con el país.`],
                  ["Programas", "Cada programa es de su sede, con el nombre de la fuente; los evaluados sin código SNIES van en su propia fila."],
                  ...(chunks.length > 1 ? ([["Filas", `1 a ${chunk.rows.length} de ${rows.length} · continúa`]] as [string, ReactNode][]) : []),
                  ["Corte", cutNote],
                ]}
                wide
              >
                <SwatchLegend labels={SABER_GAP_LEGEND.map((s) => s.label)} colors={SABER_GAP_LEGEND.map((s) => `var(--bol-div-${s.tone})`)} />
                {table(chunk.rows)}
              </Sheet>
            ),
          }
        : {
            title: gapTitle,
            tight: true,
            node: (
              <Continuation title={gapTitle} from={chunk.from + 1} to={chunk.from + chunk.rows.length} total={rows.length}>
                {table(chunk.rows)}
              </Continuation>
            ),
          },
    );
  });
  return units;
}

function SiteTable({
  caption,
  years,
  rows,
  competency,
}: {
  caption: string;
  years: number[];
  rows: { label: string; figures: (SaberFigure | null)[]; strong?: boolean; national?: boolean }[];
  competency: SaberCompetency;
}) {
  const scale = levelScale(competency);
  const cell = (f: SaberFigure | null, national?: boolean) => {
    if (!f) return "—";
    if (national) return f.national === null ? "—" : integer.format(Math.round(f.national));
    if (scale) {
      const share = highShare(f, competency);
      return share === null ? "—" : pct(share);
    }
    return f.shown === null ? "—" : integer.format(Math.round(f.shown));
  };
  return (
    <div className="bol-table-fit">
      <table className="bol-table" data-density="max">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Sede</th>
            {years.map((y) => (
              <th key={y} scope="col">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} data-strong={row.strong || undefined}>
              <th scope="row">{row.label}</th>
              {row.figures.map((f, i) => {
                const text = cell(f, row.national);
                return (
                  <td key={years[i]} data-empty={text === "—" || undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapTable({
  rows,
  data,
  competency,
  years,
  national,
}: {
  rows: ReturnType<typeof saberGapRows>;
  data: SaberProData;
  competency: SaberCompetency;
  years: number[];
  national: (number | null)[];
}) {
  return (
    <div className="bol-table-fit">
      <table className="bol-table bol-saber-gap" data-density="max">
        <thead>
          <tr>
            <th scope="col">Sede y programa</th>
            {years.map((y, i) => (
              <th key={y} scope="col">
                {y}
                <small>{national[i] === null ? "país —" : `país ${integer.format(Math.round(national[i]!))}`}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-level={row.level}>
              <th scope="row">{row.label}</th>
              {years.map((y, i) => {
                const f = saberFigure(data, competency, y, row.filter);
                const nat = national[i];
                if (!f || f.shown === null || nat === null) {
                  return (
                    <td key={y} data-empty>
                      —
                    </td>
                  );
                }
                const gap = f.shown - nat;
                if (row.level !== "udes" && f.evaluated < SABER_FEW_MEAN) {
                  return (
                    <td key={y} data-few>
                      ({signed(gap)})
                    </td>
                  );
                }
                return (
                  <td key={y} data-tone={saberGapTone(gap)}>
                    {signed(gap)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Formato ejecutivo ------------------------------------------------------------ */

/** La cifra de una competencia para la ficha ejecutiva y el resumen. */
export function saberHighlight(data: SaberProData, entry: SaberCompetency | "pais", cut: number) {
  if (entry === "pais") return null;
  const competency = entry;
  const info = competencyInfo(competency);
  const years = yearsUpTo(data, cut);
  const figures = years.map((y) => saberFigure(data, competency, y));
  const scale = levelScale(competency);
  if (!scale) {
    const mean = latest(figures, (f) => f.shown !== null);
    if (!mean) return null;
    return {
      title: `Saber PRO · ${info.label}`,
      value: integer.format(Math.round(mean.shown!)),
      unit: "puntos, promedio UDES",
      note: `${mean.year}${mean.national !== null ? ` · país ${integer.format(Math.round(mean.national))}, ${gapWords(mean.shown! - mean.national)}` : ""}`,
    };
  }
  const leveled = latest(figures, (f) => f.leveled > 0);
  const share = highShare(leveled, competency);
  if (!leveled || share === null) return null;
  return {
    title: `Saber PRO · ${info.label}`,
    value: pct(share),
    unit: `en ${scale.highLabel}`,
    note: `${leveled.year} · ${integer.format(leveled.leveled)} evaluados`,
  };
}
