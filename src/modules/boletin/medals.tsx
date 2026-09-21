/* =============================================================================
   Boletín · medallero.

   Una hoja por medallero ("medallero:<clave>"), con la columna de notas que
   dice qué compara cada fila, cómo se ordena y a qué corte pertenece.

   En papel no hay selector de año: se toma el corte del boletín —o el último
   año con dato anterior a él— y se dice cuál es. Y no hay podio: el podio de
   la ficha existe para que la clasificación se lea antes de leer la tabla, y
   en una hoja impresa la tabla ya está toda a la vista. Lo que sí viaja es el
   metal, porque es lo que distingue un medallero de una tabla de tres
   columnas; los colores son los del papel, fijos en los dos temas.

   Una fila más de once sigue en continuación, como el resto de las tablas
   largas del boletín.
   ========================================================================== */

import type { ReactNode } from "react";
import { ALL_YEARS } from "../datos-abiertos/data/terms";
import {
  MEDAL_REPORTING,
  medalYears,
  medalsByYear,
  medalTotals,
  orderedTiers,
  standings,
} from "../datos-abiertos/data/medals";
import type { MedalBoard, MedalStanding, MedalTier } from "../datos-abiertos/data/medals";
import { DataTable } from "./figures";

/** Los metales del papel: los del portal en claro, sin tema. */
const PAPER_METAL: Record<string, { fill: string; ink: string }> = {
  "1": { fill: "#8f660e", ink: "#ffffff" },
  "2": { fill: "#657183", ink: "#ffffff" },
  "3": { fill: "#a2542a", ink: "#ffffff" },
  rest: { fill: "transparent", ink: "#16243a" },
};

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

/** Cuántas filas caben en la hoja antes de pasar a continuación. */
const FIRST_ROWS = 11;
const NEXT_ROWS = 16;

/** El año que dibuja el medallero con el corte del boletín. */
function yearFor(board: MedalBoard, cut: number): number | null {
  if (board.scope === "acumulado") return null;
  const years = medalYears(board);
  if (!years.length) return null;
  if (cut === ALL_YEARS) return years[years.length - 1];
  const upTo = years.filter((y) => y <= cut);
  return upTo.length ? upTo[upTo.length - 1] : years[0];
}

function Disc({ tier, count }: { tier: MedalTier; count: number | null }) {
  const slot = tier.position <= 3 ? String(tier.position) : "rest";
  const metal = PAPER_METAL[slot];
  if (count === null || count === undefined) return <span className="bol-medal__none">—</span>;
  return (
    <span
      className="bol-medal__disc"
      style={{
        background: metal.fill,
        color: metal.ink,
        border: slot === "rest" ? "0.3mm solid #c3ccd8" : "none",
      }}
    >
      {count}
    </span>
  );
}

/** Las filas de un tramo, en la forma que pide la tabla del boletín. */
function medalRows(rows: MedalStanding[], tiers: MedalTier[], ranked: boolean) {
  return rows.map((row) => ({
    label: (
      <>
        {ranked && <span className="bol-medal__rank">{row.rank}</span>}
        {row.label}
        {row.note && <small className="bol-medal__note"> · {row.note}</small>}
      </>
    ),
    cells: [
      ...tiers.map((tier) => <Disc key={tier.key} tier={tier} count={row.counts[tier.key]} />),
      row.total,
    ] as ReactNode[],
  }));
}

export function medalUnits(
  board: MedalBoard,
  cut: number,
  Sheet: SheetComponent,
  Continuation: ContinuationComponent,
): { node: ReactNode; title: string; tight?: boolean }[] {
  const year = yearFor(board, cut);
  const rows = standings(board, year);
  if (!rows.length) return [];

  const tiers = orderedTiers(board);
  const ranked = board.sort === "medallero";
  const totals = medalTotals(board, rows);
  const years = medalYears(board);
  const byYear = medalsByYear(board);

  const cutText =
    board.scope === "acumulado"
      ? years.length > 1
        ? `Todo el periodo · ${years[0]}–${years[years.length - 1]}`
        : `Todo el periodo · ${years[0] ?? "sin dato"}`
      : cut !== ALL_YEARS && year !== null && year !== cut
        ? `${year} (el último con dato hasta ${cut})`
        : String(year ?? "sin dato");

  const notes: [string, ReactNode][] = [
    ["Qué compara", board.rowLabel],
    ["Categorías", tiers.map((t) => t.label).join(" · ")],
    ["Orden", ranked ? "Por medallero: manda la categoría más alta, no el total" : "El que fijó la oficina"],
    ["Reporta", MEDAL_REPORTING[board.reporting]],
    ["Corte", cutText],
  ];

  // El puesto viaja dentro de la primera columna y no como una columna suya:
  // en A4 cada columna cuesta milímetros, y un número de una cifra no merece
  // una. En pantalla sí la tiene, porque allí sobra el ancho.
  const head: ReactNode[] = [board.rowLabel, ...tiers.map((t) => t.label), "Total"];
  const totalRow = {
    label: <strong>Total</strong>,
    strong: true,
    cells: [...tiers.map((t) => totals.counts[t.key]), totals.total] as ReactNode[],
  };

  const first = rows.slice(0, FIRST_ROWS);
  const rest = rows.slice(FIRST_ROWS);

  const units: { node: ReactNode; title: string; tight?: boolean }[] = [
    {
      title: board.title,
      node: (
        <Sheet title={board.title} description={board.description} source={board.source} notes={notes} wide>
          <div className="bol-medal">
            <DataTable head={head} rows={rest.length === 0 ? [...medalRows(first, tiers, ranked), totalRow] : medalRows(first, tiers, ranked)} />

            {/* La forma de todos los años, que el corte de una hoja no da. */}
            {board.scope === "por_ano" && byYear.length > 1 && (
              <div className="bol-medal__years">
                <DataTable
                  head={["Año", ...tiers.map((t) => t.label), "Total"]}
                  rows={byYear.map((entry) => ({
                    label: String(entry.year),
                    strong: entry.year === year,
                    cells: [...tiers.map((t) => entry.counts[t.key]), entry.total] as ReactNode[],
                  }))}
                  caption="Medallas por año"
                />
              </div>
            )}

            <p className="bol-medal__legend">
              Un cero es «compitió y no ganó»; un guion, «no compitió».
              {ranked && " Dos filas con las mismas medallas comparten puesto."}
            </p>
          </div>
        </Sheet>
      ),
    },
  ];

  // Las filas que no caben siguen pegadas a la hoja, con la cabecera repetida.
  for (let from = 0; from < rest.length; from += NEXT_ROWS) {
    const slice = rest.slice(from, from + NEXT_ROWS);
    const last = from + NEXT_ROWS >= rest.length;
    units.push({
      title: board.title,
      tight: true,
      node: (
        <Continuation title={board.title} from={FIRST_ROWS + from + 1} to={FIRST_ROWS + from + slice.length} total={rows.length}>
          <div className="bol-medal">
            <DataTable head={head} rows={last ? [...medalRows(slice, tiers, ranked), totalRow] : medalRows(slice, tiers, ranked)} />
          </div>
        </Continuation>
      ),
    });
  }

  return units;
}

/** Cuánto suma un medallero, para la ficha del formato ejecutivo. */
export function medalHeadline(board: MedalBoard, cut: number) {
  const year = yearFor(board, cut);
  const rows = standings(board, year);
  if (!rows.length) return null;
  const tiers = orderedTiers(board);
  const totals = medalTotals(board, rows);
  const top = tiers[0];
  return {
    title: board.title,
    value: String(totals.total),
    unit: totals.total === 1 ? "medalla" : "medallas",
    note: `${totals.counts[top.key] ?? 0} de ${top.label.toLowerCase()} · ${year === null ? "todo el periodo" : year}`,
  };
}
