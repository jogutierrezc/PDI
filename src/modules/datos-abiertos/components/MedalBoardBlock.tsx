/* =============================================================================
   Medallero en la ficha.

   Un palmarés, no una gráfica de barras: lo que hace legible un medallero
   olímpico es que se lee sin leer cifras, porque un oro pesa más que cualquier
   montón de bronces. De ahí las tres decisiones del dibujo:

   · El recuento vive dentro de un disco del metal de su categoría, todos del
     mismo tamaño. Una columna de discos se lee como una columna de peso.
   · El orden es el del medallero —categoría por categoría, de la más alta a la
     más baja—, nunca por el total, y los puestos se comparten cuando hay
     empate, como en el olímpico: dos primeros y ningún segundo.
   · El podio dice la clasificación antes de que nadie lea una fila. Solo
     aparece cuando el orden es el del medallero: con el orden que dejó la
     oficina no hay clasificación que coronar.

   El metal nunca identifica solo: el nombre de cada categoría va en la
   cabecera de su columna y en la leyenda del podio. Y un cero no es un vacío:
   cero es «compitió y no ganó», vacío es «no compitió», y se dibujan distinto.
   ========================================================================== */

import { useMemo, useState } from "react";
import {
  MEDAL_SCOPE,
  hasMedals,
  medalTotals,
  medalsByYear,
  medalYears,
  openingYear,
  orderedTiers,
  standings,
  tierSlot,
} from "../data/medals";
import type { MedalBoard, MedalStanding, MedalTier } from "../data/medals";
import { ViewSwitch } from "./ChartFrame";
import "./medals.css";

export function MedalBoardBlock({
  boards,
  title,
  anchor,
}: {
  boards: MedalBoard[];
  title?: string;
  anchor: string;
}) {
  const withData = boards.filter(hasMedals);
  const [openId, setOpenId] = useState<string | null>(null);
  if (withData.length === 0) return null;

  const board = withData.find((b) => b.id === openId) ?? withData[0];

  return (
    <section className="od-section od-medals" aria-labelledby={anchor}>
      <div className="u-container">
        <header className="od-section__head od-section__head--split">
          <div>
            <h2 id={anchor}>{title || "Medallero"}</h2>
            <p>
              Lo que gana la universidad cuando compite. El orden es el del medallero: primero quien más medallas de la
              categoría más alta, no quien más medallas tiene en total.
            </p>
          </div>
          {withData.length > 1 && (
            <ViewSwitch
              label="Medallero"
              value={board.id}
              onChange={setOpenId}
              options={withData.map((b) => ({ value: b.id, label: b.title }))}
            />
          )}
        </header>

        <MedalTable key={board.id} board={board} />
      </div>
    </section>
  );
}

/* --- Un medallero -------------------------------------------------------------- */

function MedalTable({ board }: { board: MedalBoard }) {
  const years = medalYears(board);
  const [chosen, setChosen] = useState<number | null>(null);
  const year = board.scope === "acumulado" ? null : (chosen ?? openingYear(board));
  const tiers = orderedTiers(board);
  const rows = useMemo(() => standings(board, year), [board, year]);
  const totals = medalTotals(board, rows);
  const byYear = useMemo(() => medalsByYear(board), [board]);
  const ranked = board.sort === "medallero";
  const podium = ranked ? rows.slice(0, 3) : [];

  return (
    <div className="md">
      <div className="md__head">
        <div className="md__title">
          <h3>{board.title}</h3>
          {board.description && <p>{board.description}</p>}
        </div>
        {board.scope === "acumulado" ? (
          <p className="md__stamp">
            {MEDAL_SCOPE.acumulado.label}
            {years.length > 1 && <span> · {years[0]}–{years[years.length - 1]}</span>}
          </p>
        ) : (
          years.length > 1 && (
            <label className="md__year">
              <span>Año</span>
              <select value={String(year ?? "")} onChange={(e) => setChosen(Number(e.target.value))}>
                {[...years].reverse().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )
        )}
      </div>

      {podium.length === 3 && <Podium rows={podium} tiers={tiers} />}

      <div className="md__scroll">
        <table className="md__table">
          <caption className="sr-only">
            {board.title}
            {year === null ? ", todo el periodo" : `, ${year}`}. Medallas por {board.rowLabel.toLowerCase()} y categoría.
          </caption>
          <thead>
            <tr>
              {ranked && <th scope="col" className="md__rank-h" title="Puesto en el medallero">#</th>}
              <th scope="col" className="md__row-h">{board.rowLabel}</th>
              {tiers.map((tier) => (
                <th key={tier.key} scope="col" className="md__tier-h">
                  <span className="md__tier-name">{tier.label}</span>
                </th>
              ))}
              <th scope="col" className="md__total-h">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                {ranked && <td className="md__rank">{row.rank}</td>}
                <th scope="row" className="md__row">
                  <span className="md__row-name">{row.label}</span>
                  {row.note && <span className="md__row-note">{row.note}</span>}
                </th>
                {tiers.map((tier) => (
                  <td key={tier.key} className="md__cell">
                    <Disc tier={tier} count={row.counts[tier.key]} />
                  </td>
                ))}
                <td className="md__total">{row.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {ranked && <td />}
              <th scope="row" className="md__row">Total</th>
              {tiers.map((tier) => (
                <td key={tier.key} className="md__cell md__cell--sum">
                  {totals.counts[tier.key]}
                </td>
              ))}
              <td className="md__total">{totals.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {board.scope === "por_ano" && byYear.length > 1 && <YearStrip years={byYear} tiers={tiers} chosen={year} onChoose={setChosen} />}

      <p className="md__legend">
        Un cero es <b>compitió y no ganó</b>; una casilla rayada, <b>no compitió</b>.
        {ranked && " Dos filas con las mismas medallas comparten puesto."}
      </p>

      {(board.source || board.note) && (
        <p className="md__ticket">
          {board.source && <span className="od-ticket__source">{board.source}</span>}
          {board.note && <span className="md__note">{board.note}</span>}
        </p>
      )}
    </div>
  );
}

/* --- El disco ------------------------------------------------------------------ */

function Disc({ tier, count }: { tier: MedalTier; count: number | null }) {
  if (count === null || count === undefined) {
    return (
      <span className="md__disc md__disc--none" role="img" aria-label={`Sin ${tier.label.toLowerCase()}: no compitió`}>
        <span aria-hidden="true">—</span>
      </span>
    );
  }
  return (
    <span className="md__disc" data-metal={tierSlot(tier.position)}>
      <span className="sr-only">{tier.label}: </span>
      {count}
    </span>
  );
}

/* --- El podio ------------------------------------------------------------------ */

/**
 * Los tres primeros, a las alturas de siempre: 2 · 1 · 3.
 *
 * Va oculto a los lectores de pantalla porque la tabla que viene justo debajo
 * dice lo mismo y lo dice entero; repetirlo sería ruido, no accesibilidad.
 */
function Podium({ rows, tiers }: { rows: MedalStanding[]; tiers: MedalTier[] }) {
  const order = [rows[1], rows[0], rows[2]];
  const steps = ["second", "first", "third"] as const;
  return (
    <ol className="md__podium" aria-hidden="true">
      {order.map((row, index) => (
        <li key={row.label} className="md__step" data-step={steps[index]}>
          <p className="md__step-name">{row.label}</p>
          <p className="md__step-medals">
            {tiers.map((tier) =>
              row.counts[tier.key] ? (
                <span key={tier.key} className="md__disc md__disc--sm" data-metal={tierSlot(tier.position)}>
                  {row.counts[tier.key]}
                </span>
              ) : null,
            )}
          </p>
          <p className="md__step-block">
            <span className="md__step-rank">{row.rank}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

/* --- La tira por año ----------------------------------------------------------- */

/**
 * Cuántas medallas cayeron en cada año, y de qué categoría.
 *
 * Es la lectura «año por año» que el selector de arriba no da: el selector
 * enseña un año, esta tira enseña la forma de todos. Cada barra se parte por
 * categoría en su metal, y el año elegido va marcado.
 */
function YearStrip({
  years,
  tiers,
  chosen,
  onChoose,
}: {
  years: { year: number; counts: Record<string, number>; total: number }[];
  tiers: MedalTier[];
  chosen: number | null;
  onChoose: (year: number) => void;
}) {
  const top = Math.max(...years.map((y) => y.total), 1);
  return (
    <div className="md__strip">
      <p className="md__strip-label">Medallas por año</p>
      <ol className="md__strip-list">
        {years.map((entry) => (
          <li key={entry.year} className="md__strip-item">
            <button
              type="button"
              className="md__strip-bar"
              aria-pressed={entry.year === chosen}
              onClick={() => onChoose(entry.year)}
            >
              <span className="sr-only">
                {entry.year}: {entry.total} {entry.total === 1 ? "medalla" : "medallas"}
              </span>
              {/* La pista tiene alto propio: dentro de una columna flexible, un
                  alto en porcentaje se calcula sobre toda la barra y luego el
                  reparto lo encoge, y las tres acaban midiendo lo mismo. */}
              <span className="md__strip-plot" aria-hidden="true">
                <span className="md__strip-stack" style={{ height: `${Math.round((entry.total / top) * 100)}%` }}>
                  {tiers.map((tier) =>
                    entry.counts[tier.key] ? (
                      <span
                        key={tier.key}
                        className="md__strip-slice"
                        data-metal={tierSlot(tier.position)}
                        style={{ flexGrow: entry.counts[tier.key] }}
                      />
                    ) : null,
                  )}
                </span>
              </span>
              <span className="md__strip-total" aria-hidden="true">{entry.total}</span>
              <span className="md__strip-year" aria-hidden="true">{entry.year}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
