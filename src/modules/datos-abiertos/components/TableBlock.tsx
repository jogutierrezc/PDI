/* =============================================================================
   Tablas de un informe: tabla, ranking, fichas y cifras de un periodo.

   · Cifras: valores acumulados de un periodo (2021-2025), no de un año. Van en
     losetas con su unidad y su alcance a la vista, para que nadie las lea como
     la cifra de un corte.
   · Ranking: posición, las columnas del listado y una barra en la columna que
     ordena (la de mayor magnitud). Cualquier columna numérica reordena.
   · Fichas: una tarjeta por fila; la primera columna de texto es el título.
   · Tabla: filas y columnas, ordenables.
   Todo va dentro de un marco de gráfica, así también se descarga como imagen.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatValue } from "../data/open-data";
import type { TableData } from "../data/types";
import { ChartFrame } from "./ChartFrame";
import type { CsvSource } from "./CsvAction";
import "./report-sections.css";

type Cell = string | number | null;
type Column = TableData["columns"][number];

const numeric = (column: Column) => column.format === "entero" || column.format === "decimal" || column.format === "porcentaje";

function renderCell(column: Column, value: Cell) {
  if (value === null || value === undefined || value === "") return <span className="od-tableblock__empty">—</span>;
  if (numeric(column)) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return column.format === "porcentaje" ? `${formatValue(n, "porcentaje")} %` : formatValue(n, column.format === "decimal" ? "decimal" : "entero");
  }
  if (column.format === "enlace") {
    const href = String(value);
    return /^https?:\/\//i.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer">
        {href.replace(/^https?:\/\//i, "")}
      </a>
    ) : (
      href
    );
  }
  return String(value);
}

export function TableBlock({ table, title, csv }: { table: TableData; title?: string; csv?: CsvSource }) {
  const numericColumns = table.columns.filter(numeric);
  // La columna que manda en un ranking: la de mayor magnitud.
  const measure = useMemo(() => {
    let best: Column | undefined;
    let bestMax = -Infinity;
    for (const column of numericColumns) {
      const max = Math.max(...table.rows.map((row) => Number(row[column.key] ?? -Infinity)));
      if (max > bestMax) {
        bestMax = max;
        best = column;
      }
    }
    return best;
  }, [table, numericColumns]);
  const [sort, setSort] = useState<{ key: string; dir: "desc" | "asc" } | null>(table.display === "ranking" && measure ? { key: measure.key, dir: "desc" } : null);

  const rows = useMemo(() => {
    if (!sort) return table.rows;
    const column = table.columns.find((c) => c.key === sort.key);
    return [...table.rows].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = column && numeric(column) ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "es");
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [table, sort]);

  const toggle = (key: string) =>
    setSort((prev) => (prev?.key !== key ? { key, dir: "desc" } : prev.dir === "desc" ? { key, dir: "asc" } : null));

  const frameTitle = title || table.title;

  if (table.display === "cifras") {
    const labelCol = table.columns.find((c) => c.key === "etiqueta") ?? table.columns[0];
    const valueCol = table.columns.find((c) => c.key === "valor") ?? numericColumns[0];
    return (
      <ChartFrame title={frameTitle} subtitle={table.description} source={table.source} exportName={frameTitle} csv={csv}>
        <ul className="od-figures">
          {table.rows.map((row, index) => {
            const raw = valueCol ? row[valueCol.key] : null;
            const n = raw === null || raw === undefined ? null : Number(raw);
            return (
              <li key={index} className="od-figures__item">
                <span className="od-figures__label">{labelCol ? String(row[labelCol.key] ?? "") : ""}</span>
                <strong className="od-figures__value">
                  {n === null || !Number.isFinite(n) ? "—" : formatValue(n, Number.isInteger(n) ? "entero" : "decimal")}
                </strong>
                <span className="od-figures__meta">
                  {row.unidad ? String(row.unidad) : ""}
                  {row.alcance ? <em>{String(row.alcance)}</em> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </ChartFrame>
    );
  }

  if (table.display === "fichas") {
    const [titleCol, ...rest] = table.columns;
    return (
      <ChartFrame title={frameTitle} subtitle={table.description} source={table.source} exportName={frameTitle} csv={csv}>
        <ul className="od-cards">
          {table.rows.map((row, index) => (
            <li key={index} className="od-cards__item">
              <h4>{String(row[titleCol.key] ?? "")}</h4>
              <dl>
                {rest.map((column) =>
                  row[column.key] === null || row[column.key] === "" ? null : (
                    <div key={column.key} data-long={String(row[column.key]).length > 60 || undefined}>
                      <dt>{column.label}</dt>
                      <dd>{renderCell(column, row[column.key])}</dd>
                    </div>
                  ),
                )}
              </dl>
            </li>
          ))}
        </ul>
      </ChartFrame>
    );
  }

  const max = measure ? Math.max(1, ...table.rows.map((row) => Number(row[measure.key] ?? 0))) : 1;
  const ranking = table.display === "ranking";

  return (
    <ChartFrame
      title={frameTitle}
      subtitle={`${table.description}${table.description ? " · " : ""}${table.rows.length} filas`}
      source={table.source}
      exportName={frameTitle}
      csv={csv}
    >
      <div className="od-table-wrap" tabIndex={0} role="region" aria-label={`${frameTitle}, desplazable`}>
        <table className="od-table od-tableblock" data-display={table.display}>
          <caption className="sr-only">{frameTitle}</caption>
          <thead>
            <tr>
              {ranking && <th scope="col" className="od-tableblock__rank">#</th>}
              {table.columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    data-numeric={numeric(column) || undefined}
                    aria-sort={active ? (sort?.dir === "desc" ? "descending" : "ascending") : "none"}
                  >
                    <button type="button" className="od-pivot__sort" onClick={() => toggle(column.key)}>
                      {column.label}
                      <svg viewBox="0 0 10 12" aria-hidden="true" data-dir={active ? sort?.dir : undefined}>
                        <path d="M5 1 9 5H1zM5 11 1 7h8z" />
                      </svg>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {ranking && <td className="od-tableblock__rank">{index + 1}</td>}
                {table.columns.map((column, ci) => {
                  const value = row[column.key];
                  const isMeasure = ranking && measure?.key === column.key && value !== null && value !== undefined;
                  const Tag = ci === 0 ? "th" : "td";
                  return (
                    <Tag key={column.key} scope={ci === 0 ? "row" : undefined} data-numeric={numeric(column) || undefined}>
                      {isMeasure ? (
                        <span className="od-tableblock__bar" style={{ "--w": `${(Number(value) / max) * 100}%` } as CSSProperties}>
                          <span>{renderCell(column, value)}</span>
                        </span>
                      ) : (
                        renderCell(column, value)
                      )}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}
