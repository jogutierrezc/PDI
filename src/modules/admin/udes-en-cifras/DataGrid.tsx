/* =============================================================================
   Rejilla de captura.

   Se comporta como una hoja de cálculo sencilla:
   · Enter baja a la casilla siguiente, Mayús+Enter sube; las flechas arriba y
     abajo cambian de fila y Tab avanza de columna.
   · Pegar un rango copiado de Excel lo reparte desde la casilla enfocada,
     saltando las columnas calculadas de esa fila (la cifra del año que sale
     de A y B): un rango con columnas A y B cae en A y B.
   · Lo que cambió respecto a la base se marca, y un texto que no es número se
     queda en rojo sin guardarse, con el motivo al pasar el puntero.
   · Vacío es "sin reportar": la casilla vacía guarda NULL, no cero.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { formatValue } from "../../datos-abiertos/data/open-data";
import type { ValueFormat } from "../../datos-abiertos/data/types";
import { editableText, parseClipboardGrid, parseNumber } from "./sheet";

export interface GridRow {
  key: string;
  label: string;
  sub?: string;
  /** Primera fila de un grupo: se dibuja con separador. */
  groupStart?: boolean;
  format?: ValueFormat;
}

export interface GridColumn {
  key: string;
  label: string;
  /** Grupo de la cabecera (el año): las columnas seguidas del mismo grupo comparten rótulo. */
  group?: string;
  /** Rótulo completo para lectores de pantalla: "2024, periodo A". */
  ariaLabel?: string;
}

export type CellKey = `${string}|${string}`;
export const cellKey = (row: string, column: string): CellKey => `${row}|${column}`;

interface DataGridProps {
  label: string;
  rows: GridRow[];
  columns: GridColumn[];
  /** Valor guardado en la base. */
  stored: (row: string, column: string) => number | null;
  /** Cambios sin guardar. `undefined` = sin cambio. */
  draft: Record<CellKey, number | null>;
  onDraft: (changes: Record<CellKey, number | null>) => void;
  /** Casilla calculada o no aplicable: devuelve el motivo. */
  lockedReason?: (row: string, column: string) => string | null;
  /** Valor que se muestra en una casilla bloqueada (p. ej. la suma). */
  lockedValue?: (row: string, column: string) => number | null;
  readOnly?: boolean;
  onPasted?: (count: number) => void;
  rowHeader?: string;
}

export function DataGrid({
  label,
  rows,
  columns,
  stored,
  draft,
  onDraft,
  lockedReason,
  lockedValue,
  readOnly = false,
  onPasted,
  rowHeader = "Indicador",
}: DataGridProps) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLInputElement>());
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // La cabecera de la rejilla se pega bajo la cabecera de la intranet, y eso
  // solo funciona si la rejilla no es su propio contenedor de desplazamiento.
  // Cuando no cabe (pantalla angosta, periodo largo) se marca y pasa a
  // desplazarse a lo ancho dentro de su marco.
  useEffect(() => {
    const wrap = wrapRef.current;
    const table = tableRef.current;
    if (!wrap || !table || typeof ResizeObserver === "undefined") return;
    const check = () => {
      if (table.offsetWidth > wrap.clientWidth + 1) wrap.dataset.overflow = "";
      else delete wrap.dataset.overflow;
    };
    const observer = new ResizeObserver(check);
    observer.observe(wrap);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  const editable = useMemo(
    () => rows.map((r) => columns.map((c) => !readOnly && !lockedReason?.(r.key, c.key))),
    [rows, columns, readOnly, lockedReason],
  );

  // Cabecera en dos filas cuando las columnas se agrupan (año → A, B, año).
  const groups: { label: string; span: number }[] = [];
  const groupStarts = columns.map((c, index) => {
    if (!c.group) return false;
    const starts = index === 0 || columns[index - 1].group !== c.group;
    if (starts) groups.push({ label: c.group, span: 1 });
    else groups[groups.length - 1].span += 1;
    return starts;
  });

  const current = (row: string, column: string) => {
    const key = cellKey(row, column);
    return key in draft ? draft[key] : stored(row, column);
  };

  const focusCell = (ri: number, ci: number) => {
    const row = rows[ri];
    const column = columns[ci];
    if (!row || !column) return;
    refs.current.get(cellKey(row.key, column.key))?.focus();
  };

  const commit = (row: string, column: string, text: string) => {
    const key = cellKey(row, column);
    const parsed = parseNumber(text);
    if (!parsed.ok) {
      setErrors((e) => ({ ...e, [key]: parsed.reason }));
      return;
    }
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    const original = stored(row, column);
    const next = { ...draft };
    if (parsed.value === original) delete next[key];
    else next[key] = parsed.value;
    onDraft(next);
    setTexts((t) => {
      const copy = { ...t };
      delete copy[key];
      return copy;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const target = event.currentTarget;
      commit(rows[ri].key, columns[ci].key, target.value);
      const up = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey);
      focusCell(ri + (up ? -1 : 1), ci);
    } else if (event.key === "Escape") {
      const key = cellKey(rows[ri].key, columns[ci].key);
      setTexts((t) => {
        const copy = { ...t };
        delete copy[key];
        return copy;
      });
      event.currentTarget.blur();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return; // Un solo valor: pegado normal.
    event.preventDefault();
    const grid = parseClipboardGrid(text);
    const next = { ...draft };
    const nextErrors = { ...errors };
    let count = 0;
    // Las columnas de destino son las editables de la fila donde empieza el
    // pegado, desde la casilla enfocada: las calculadas no consumen valores.
    const targets = columns.map((_, index) => index).filter((index) => index >= ci && editable[ri][index]);
    grid.forEach((line, dr) => {
      const row = rows[ri + dr];
      if (!row) return;
      line.forEach((raw, dc) => {
        const columnIndex = targets[dc];
        const column = columnIndex === undefined ? undefined : columns[columnIndex];
        if (!column || !editable[ri + dr][columnIndex]) return;
        const key = cellKey(row.key, column.key);
        const parsed = parseNumber(raw);
        if (!parsed.ok) {
          nextErrors[key] = parsed.reason;
          return;
        }
        delete nextErrors[key];
        if (parsed.value === stored(row.key, column.key)) delete next[key];
        else next[key] = parsed.value;
        count += 1;
      });
    });
    setErrors(nextErrors);
    setTexts({});
    onDraft(next);
    onPasted?.(count);
  };

  return (
    <div ref={wrapRef} className="oda-grid-wrap" role="region" aria-label={`${label}, desplazable`} tabIndex={-1}>
      <table ref={tableRef} className="oda-grid">
        <caption className="sr-only">{label}</caption>
        <thead>
          {groups.length > 0 ? (
            <>
              <tr className="oda-grid__groups">
                <th scope="col" rowSpan={2}>{rowHeader}</th>
                {groups.map((g) => (
                  <th key={g.label} scope="colgroup" colSpan={g.span} data-group-start>
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="oda-grid__subheads">
                {columns.map((c, index) => (
                  <th key={c.key} scope="col" data-group-start={groupStarts[index] || undefined} aria-label={c.ariaLabel}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </>
          ) : (
            <tr>
              <th scope="col">{rowHeader}</th>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.key} data-group-start={row.groupStart || undefined}>
              <th scope="row">
                <span>{row.label}</span>
                {row.sub && <small>{row.sub}</small>}
              </th>
              {columns.map((column, ci) => {
                const key = cellKey(row.key, column.key);
                const locked = lockedReason?.(row.key, column.key) ?? null;
                if (locked) {
                  const shown = lockedValue?.(row.key, column.key) ?? null;
                  return (
                    <td key={column.key} data-locked data-group-start={groupStarts[ci] || undefined} title={locked}>
                      <span>{shown === null ? "—" : formatValue(shown, row.format ?? "entero")}</span>
                    </td>
                  );
                }
                const value = current(row.key, column.key);
                const changed = key in draft;
                const error = errors[key];
                return (
                  <td
                    key={column.key}
                    data-group-start={groupStarts[ci] || undefined}
                    data-changed={changed || undefined}
                    data-empty={value === null || undefined}
                    data-error={error ? true : undefined}
                    title={error ?? undefined}
                  >
                    <input
                      ref={(node) => {
                        if (node) refs.current.set(key, node);
                        else refs.current.delete(key);
                      }}
                      value={texts[key] ?? (focused === key || value === null ? editableText(value) : formatValue(value, row.format ?? "entero"))}
                      inputMode="decimal"
                      readOnly={readOnly}
                      aria-label={`${row.label}, ${column.ariaLabel ?? column.label}`}
                      aria-invalid={error ? true : undefined}
                      placeholder="—"
                      onChange={(event) => setTexts((t) => ({ ...t, [key]: event.target.value }))}
                      onBlur={(event) => {
                        setFocused(null);
                        if (key in texts) commit(row.key, column.key, event.target.value);
                      }}
                      onKeyDown={(event) => onKeyDown(event, ri, ci)}
                      onPaste={(event) => onPaste(event, ri, ci)}
                      onFocus={(event) => {
                        setFocused(key);
                        const input = event.currentTarget;
                        requestAnimationFrame(() => input.select());
                      }}
                    />
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
