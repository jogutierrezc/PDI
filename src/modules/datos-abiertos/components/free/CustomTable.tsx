/* =============================================================================
   Tabla personalizada en la ficha (contrato en data/custom-table.ts).

   Una tabla de verdad: `<table>` con `<caption>`, encabezados con `scope` y,
   si la tabla lo pide, la primera columna como encabezado de fila. Los números
   van a la derecha con cifras tabulares; los textos, a la izquierda y partiendo
   línea. En una pantalla angosta la tabla se desplaza dentro de su caja, con la
   primera columna fija: la página no se mueve.

   El color nunca va solo: cada celda con tono lleva su glifo a la vista y el
   nombre del tono para lectores de pantalla, y debajo va la leyenda, que sale
   de las reglas. Una celda sin dato dice «sin dato»; no se colorea ni vale 0.

   El corte es el que escribió quien publica: la tabla no se filtra con el
   selector de periodo de la ficha, y lo dice al pie.
   ========================================================================== */

import { cellTone, cellView, EMPTY_TEXT, legendOf, unitInCell, unitOf } from "../../data/custom-table";
import type { CustomTable } from "../../data/custom-table";
import type { FreeColumn, FreeRow } from "../../data/free-sets";
import "./custom-table.css";

export function CustomTableView({
  title,
  columns,
  rows,
  table,
  fallbackSource,
}: {
  title: string;
  columns: FreeColumn[];
  rows: FreeRow[];
  table: CustomTable;
  /** La oficina que reporta el conjunto, si la tabla no escribe su fuente. */
  fallbackSource?: string;
}) {
  const legend = legendOf(columns, table, rows);
  const cut = table.cut?.trim();
  const source = table.source?.trim() || fallbackSource;

  return (
    <div className="od-ctable od-tones">
      <div className="od-ctable__scroll" tabIndex={0} role="region" aria-label={`${title}, tabla desplazable`}>
        <table className="od-ctable__table">
          <caption className="sr-only">
            {title}
            {cut ? `. Corte: ${cut}` : ""}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const unit = unitOf(column);
                return (
                  <th key={column.key} scope="col" data-numeric={column.kind === "cifra" || undefined}>
                    {column.label}
                    {unit && !unitInCell(column) ? <small>{unit}</small> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (row.kind === "grupo") {
                return (
                  <tr key={ri} data-kind="grupo">
                    <th scope="colgroup" colSpan={columns.length}>
                      <span>{row.label || "Sin título"}</span>
                    </th>
                  </tr>
                );
              }
              return (
                <tr key={ri} data-kind={row.kind}>
                  {columns.map((column, ci) => {
                    const view = cellView(column, row.cells[column.key]);
                    const tone = cellTone(table, column, row);
                    // Una fila coloreada entera dice su tono una vez, en la primera celda.
                    const says = tone && (tone.by !== "fila" || ci === 0);
                    const Tag = ci === 0 && table.rowHeader ? "th" : "td";
                    return (
                      <Tag
                        key={column.key}
                        scope={Tag === "th" ? "row" : undefined}
                        data-numeric={view.numeric || undefined}
                        data-empty={view.empty || undefined}
                        data-tone={tone?.tone}
                      >
                        <span className="od-ctable__cell">
                          {says && (
                            <span className="od-ctable__glyph" aria-hidden="true">
                              {tone.glyph}
                            </span>
                          )}
                          <span className="od-ctable__value">{view.empty ? EMPTY_TEXT : view.text}</span>
                          {says && <span className="sr-only"> ({tone.label})</span>}
                        </span>
                      </Tag>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {legend.length > 0 && (
        <ul className="od-ctable__legend" aria-label="Qué significa cada color">
          {legend.map((item) => (
            <li key={item.tone}>
              <span className="od-ctable__swatch" data-tone={item.tone} aria-hidden="true">
                {item.glyph}
              </span>
              <span>
                <strong>{item.label}</strong>
                {item.detail.length > 0 && <span className="od-ctable__meaning">{item.detail.join(" · ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(table.note?.trim() || source || cut) && (
        <div className="od-ctable__foot">
          {table.note?.trim() && <p className="od-ctable__note">{table.note.trim()}</p>}
          <p className="od-ctable__origin">
            {source && <span>Fuente: {source}</span>}
            {cut && (
              <span>
                Corte: {cut}
                <small> · lo fija esta tabla; no cambia con el periodo elegido en la ficha</small>
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
