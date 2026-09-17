/* =============================================================================
   Boletín · Motor Beta: de Saber 11 a Saber TyT.

   Una hoja por competencia con pareja de pruebas ("tyt:<conjunto>:<competencia>").
   Cada hoja responde las tres preguntas del motor en el orden en que se leen:
   con qué percentil entró y salió el grupo, cuánto agregó cada programa, y de
   qué cuarto de la distribución a cuál pasó la gente.

   Todo en milímetros, con la paleta fija del papel: azul cuando la posición
   sube, terracota cuando baja.
   ========================================================================== */

import type { ReactNode } from "react";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import {
  QUARTER_LABEL,
  TYT_COMPETENCIES,
  isPaired,
  transitionShares,
  tytFigure,
  tytInfo,
  tytPrograms,
  tytYears,
} from "../datos-abiertos/data/saber-tyt";
import type { SaberTytData, TytCompetency, TytFigure } from "../datos-abiertos/data/saber-tyt";
import type { Report } from "../datos-abiertos/data/types";
import { DataTable } from "./figures";

const integer = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${decimal.format(Math.abs(n))}`;
const pct = (n: number) => `${integer.format(Math.round(n))} %`;

/** Con menos pareados que esto, el promedio de un programa no se compara. */
const FEW = 10;

type SheetComponent = (props: {
  title: string;
  description?: string;
  source: string;
  notes?: [string, ReactNode][];
  cut?: string;
  wide?: boolean;
  children: ReactNode;
}) => ReactNode;

export const tytRef = (data: SaberTytData, competency: TytCompetency) => `tyt:${data.id}:${competency}`;

/** Las competencias publicables del conjunto: las que tienen las dos pruebas. */
export function tytRefs(report: Report): { ref: string; title: string }[] {
  return (report.saberTyt ?? []).flatMap((data) =>
    data.results.length
      ? TYT_COMPETENCIES.filter((c) => isPaired(c.key) && tytFigure(data, c.key, null)).map((c) => ({
          ref: tytRef(data, c.key),
          title: `Motor Beta · ${c.label}`,
        }))
      : [],
  );
}

export function parseTytKey(report: Report, key: string): { data: SaberTytData; competency: TytCompetency } | null {
  const at = key.lastIndexOf(":");
  if (at < 0) return null;
  const data = report.saberTyt?.find((t) => t.id === key.slice(0, at));
  const competency = key.slice(at + 1) as TytCompetency;
  return data && TYT_COMPETENCIES.some((c) => c.key === competency) ? { data, competency } : null;
}

const pairedOf = (figure: TytFigure) =>
  Object.values(figure.transitions).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);

/* --- Dibujos en milímetros --------------------------------------------------------- */

/** Valor agregado por programa: barras a lado y lado de la línea del cero. */
function ValueBars({ rows, width = 178 }: { rows: { name: string; delta: number; pairs: number }[]; width?: number }) {
  const L = 62;
  const R = 16;
  const plot = width - L - R;
  const max = Math.max(10, ...rows.map((r) => Math.abs(r.delta)));
  const ROW = 5.4;
  const height = rows.length * ROW + 6;
  const zero = L + plot / 2;
  const scale = (value: number) => (Math.abs(value) / max) * (plot / 2);

  return (
    <svg className="bol-chart bol-tyt-value" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Valor agregado por programa, en puntos de percentil">
      <line className="bol-chart__grid" x1={zero} x2={zero} y1={2} y2={rows.length * ROW + 2} />
      {rows.map((row, i) => {
        const y = 2 + i * ROW;
        const w = scale(row.delta);
        return (
          <g key={row.name} opacity={row.pairs < FEW ? 0.55 : undefined}>
            <text className="bol-chart__series" x={0} y={y + ROW - 1.8}>
              {row.name.length > 34 ? `${row.name.slice(0, 33)}…` : row.name}
            </text>
            <rect
              x={row.delta >= 0 ? zero : zero - w}
              y={y + 0.8}
              width={Math.max(0.3, w)}
              height={ROW - 2.4}
              rx={0.5}
              style={{ fill: row.delta >= 0 ? "var(--bol-div-pos-2)" : "var(--bol-div-neg-2)" }}
            />
            <text className="bol-chart__value" x={width} y={y + ROW - 1.8} textAnchor="end">
              {signed(row.delta)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tránsito: una barra al 100 % por cuarto de entrada. */
function TransitBars({ figure, width = 178 }: { figure: TytFigure; width?: number }) {
  const rows = transitionShares(figure).filter((r) => r.total > 0);
  const L = 34;
  const R = 22;
  const plot = width - L - R;
  const ROW = 8;
  const height = rows.length * ROW + 4;
  const tone = ["var(--bol-seq-1)", "var(--bol-seq-2)", "var(--bol-seq-3)", "var(--bol-seq-4)"];
  const ink = ["#ffffff", "#ffffff", "#16243a", "#16243a"];

  return (
    <svg className="bol-chart bol-tyt-transit" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tránsito entre cuartos de entrada y de salida">
      {rows.map((row, i) => {
        const y = 2 + i * ROW;
        let x = L;
        return (
          <g key={row.from}>
            <text className="bol-chart__series" x={0} y={y + 4.4}>
              {QUARTER_LABEL[row.from].replace("Cuarto ", "")}
            </text>
            {row.to.map((part, j) => {
              const w = ((part.share ?? 0) / 100) * plot;
              const at = x;
              x += w;
              if (w <= 0.2) return null;
              return (
                <g key={part.to}>
                  <rect x={at} y={y} width={Math.max(0.2, w - 0.3)} height={ROW - 2.4} style={{ fill: tone[j] }} />
                  {w > 11 && (
                    <text x={at + w / 2} y={y + 3.9} textAnchor="middle" className="bol-tyt-transit__pct" style={{ fill: ink[j] }}>
                      {pct(part.share ?? 0)}
                    </text>
                  )}
                </g>
              );
            })}
            <text className="bol-chart__tick" x={width} y={y + 4.2} textAnchor="end">
              {integer.format(row.total)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* --- La hoja ------------------------------------------------------------------------- */

export function tytUnits(data: SaberTytData, competency: TytCompetency, cut: number, Sheet: SheetComponent): { node: ReactNode; title: string }[] {
  const years = tytYears(data).filter((y) => cut === ALL_YEARS || y <= cut);
  if (!years.length) return [];
  const info = tytInfo(competency);
  const year = null;
  const figure = tytFigure(data, competency, year);
  if (!figure || figure.meanEntry === null || figure.meanExit === null) return [];
  const paired = pairedOf(figure);
  const span = `${years[0]}–${years[years.length - 1]}`;
  const title = `Motor Beta · ${info.label}`;

  const programs = tytPrograms(data)
    .map((p) => {
      const at = tytFigure(data, competency, year, { program: p.name });
      const pairs = at ? pairedOf(at) : 0;
      return at && at.meanDelta !== null && pairs > 0 ? { name: p.name, delta: at.meanDelta, pairs, entry: at.meanEntry, exit: at.meanExit } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.delta - a.delta);

  const low = transitionShares(figure).find((r) => r.from === "1");
  const lift = low && low.total ? ((low.to[2].count + low.to[3].count) / low.total) * 10 : null;

  return [
    {
      title,
      node: (
        <Sheet
          title={title}
          description={`Con qué percentil entraron los estudiantes de tecnología en ${info.entry.toLowerCase()} del Saber 11, con cuál salieron en ${info.exit.toLowerCase()} del Saber TyT y cuánto agregó cada programa.`}
          source={data.source}
          notes={[
            ["Cómo se lee", "Cada puntaje es su percentil dentro de la cohorte histórica de la UDES en esa prueba: las escalas de las dos pruebas no se pueden comparar en puntos."],
            ["Valor agregado", "Percentil de salida menos percentil de entrada, sobre quienes tienen las dos pruebas."],
            ["Cuidado", "La referencia es la propia cohorte: el promedio institucional queda siempre en la mitad y lo que se compara son los programas y los años entre sí, no la universidad frente al país."],
            ["Pocos evaluados", `En tinta tenue, los programas con menos de ${FEW} evaluados con las dos pruebas.`],
            ["Corte", cut === ALL_YEARS ? `Todos los años reportados (${span})` : `Hasta ${cut}`],
          ]}
          wide
        >
          <dl className="bol-saber-keys">
            <div>
              <dt>Entrada · {info.entry}</dt>
              <dd>
                <b>{decimal.format(figure.meanEntry)}</b>
                <span>percentil · {figure.rawEntry !== null ? `${decimal.format(figure.rawEntry)} puntos` : "sin puntaje"}</span>
              </dd>
            </div>
            <div>
              <dt>Salida · {info.exit}</dt>
              <dd>
                <b>{decimal.format(figure.meanExit)}</b>
                <span>percentil · {figure.rawExit !== null ? `${decimal.format(figure.rawExit)} puntos` : "sin puntaje"}</span>
              </dd>
            </div>
            <div>
              <dt>Valor agregado</dt>
              <dd>
                <b>{figure.meanDelta === null ? "—" : signed(figure.meanDelta)}</b>
                <span>
                  {figure.improvedShare === null ? "sin pareja de pruebas" : `${pct(figure.improvedShare)} de ${integer.format(paired)} evaluados subió`}
                </span>
              </dd>
            </div>
          </dl>

          {programs.length > 0 && (
            <figure className="bol-tyt-figure">
              <figcaption>Valor agregado por programa, en puntos de percentil</figcaption>
              <ValueBars rows={programs} />
            </figure>
          )}

          <figure className="bol-tyt-figure">
            <figcaption>
              De qué cuarto de la distribución de entrada salieron: cada barra suma 100 %{lift !== null ? `. De cada diez que entraron en el cuarto más bajo, ${decimal.format(lift)} salieron en los dos altos` : ""}
            </figcaption>
            <TransitBars figure={figure} />
          </figure>

          <DataTable
            caption="Percentil de entrada, de salida y valor agregado por programa"
            head={["Programa", "Entrada", "Salida", "Valor agregado", "Evaluados"]}
            rows={programs.map((p) => ({
              label: p.name,
              cells: [decimal.format(p.entry ?? 0), decimal.format(p.exit ?? 0), signed(p.delta), integer.format(p.pairs)],
            }))}
          />
        </Sheet>
      ),
    },
  ];
}

/** La cifra del Motor Beta para la ficha ejecutiva. */
export function tytHighlight(data: SaberTytData, competency: TytCompetency, cut: number) {
  const years = tytYears(data).filter((y) => cut === ALL_YEARS || y <= cut);
  if (!years.length) return null;
  const figure = tytFigure(data, competency, null);
  if (!figure || figure.meanDelta === null) return null;
  const info = tytInfo(competency);
  return {
    title: `Motor Beta · ${info.label}`,
    value: signed(figure.meanDelta),
    unit: "puntos de percentil",
    note: `${years[0]}–${years[years.length - 1]} · ${figure.improvedShare === null ? "" : `${pct(figure.improvedShare)} subió de percentil`}`,
  };
}
