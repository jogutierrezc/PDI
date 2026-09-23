/* =============================================================================
   Hoja de cálculo de la intranet.

   Una tabla que se trabaja como Excel, para cualquier dato: el catálogo y el
   periodo de Impacto, la bandeja de revisión, la auditoría, y las vistas
   previas de las cargas masivas (estructura institucional, usuarios), donde
   los errores se corrigen en la celda en vez de volver al archivo.

   Moverse
     · flechas, Tab y Mayús+Tab, Inicio/Fin (fila), Ctrl+Inicio/Ctrl+Fin
       (hoja), Re Pág/Av Pág; la celda activa siempre queda a la vista;
     · encabezado y primeras columnas fijos al desplazarse (`frozen`).
   Editar
     · Enter o F2 edita, escribir reemplaza, Escape cancela, Supr vacía (también
       un rango), Ctrl+D rellena hacia abajo desde la primera fila del rango;
     · Ctrl+V pega un bloque de Excel desde la celda activa, saltando las
       bloqueadas; Ctrl+S guarda.
   Seleccionar y copiar
     · Mayús+flechas o Mayús+clic arma un rango; Ctrl+A, toda la hoja;
       Ctrl+C copia el rango como lo espera Excel.
   Errores
     · los de la validación de quien usa la hoja (`cellError`) y los de escribir
       mal una celda se ven en la celda y en la barra de estado; F8 o «Siguiente
       error» salta al próximo.

   Qué se edita y cómo se escribe lo decide quien usa la hoja, por columna. La
   hoja no sabe de indicadores ni de unidades.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Icon } from "../ui/Icon";
import "./data-grid.css";

export type WriteResult<D> = { draft: D } | { error: string };

export interface GridColumn<R, D> {
  key: string;
  label: string;
  width: number;
  numeric?: boolean;
  /** Lista cerrada: el editor es un desplegable. */
  choices?: readonly string[];
  /** Lo que se ve en la celda. */
  show: (row: R, draft: D) => string;
  /** Si la celda se escribe en esta fila. */
  editable?: (row: R, draft: D) => boolean;
  /** Escribe el texto en el borrador de la fila. */
  write?: (draft: D, raw: string, row: R) => WriteResult<D>;
}

export interface SaveOutcome {
  /** Filas que quedaron guardadas (dejan de estar sucias). */
  saved: string[];
  problems: string[];
  /** Mensaje de éxito; si no viene, se arma con el número de filas. */
  text?: string;
}

type Cell = { row: number; col: number };
type Tone = "ok" | "warn" | "bad" | "muted";

export function DataGrid<R, D>({
  label,
  rows,
  rowId,
  initial,
  columns,
  onSave,
  saveLabel = "Guardar cambios",
  status,
  legend,
  toolbar,
  empty = "No hay filas.",
  readOnly = false,
  frozen = 0,
  cellError,
  onDraftChange,
  rowLabel,
  showFilter = true,
}: {
  label: string;
  rows: R[];
  rowId: (row: R) => string;
  initial: (row: R) => D;
  columns: GridColumn<R, D>[];
  onSave?: (changes: { row: R; draft: D }[]) => Promise<SaveOutcome>;
  saveLabel?: string;
  /** Última columna: qué le falta o qué pasa con la fila. */
  status?: (row: R, draft: D, dirty: boolean) => { text: string; tone: Tone } | null;
  legend?: ReactNode;
  toolbar?: ReactNode;
  empty?: string;
  readOnly?: boolean;
  /** Cuántas columnas de datos quedan fijas a la izquierda al desplazarse. */
  frozen?: number;
  /** Error de validación de una celda, dicho por quien usa la hoja. */
  cellError?: (row: R, draft: D, key: string) => string | undefined;
  /** Cada vez que una fila cambia (para revalidar al instante). */
  onDraftChange?: (row: R, draft: D) => void;
  /** Lo que dice la columna de número de fila (p. ej. la fila del Excel). */
  rowLabel?: (row: R, index: number) => string;
  showFilter?: boolean;
}) {
  const [drafts, setDrafts] = useState<Map<string, D>>(() => new Map(rows.map((r) => [rowId(r), initial(r)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Cell>({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [writeErrors, setWriteErrors] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Lo que llega de afuera reemplaza las filas sin cambios; las editadas se respetan.
  useEffect(() => {
    setDrafts((current) => {
      const next = new Map(current);
      for (const r of rows) if (!dirty.has(rowId(r))) next.set(rowId(r), initial(r));
      return next;
    });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftOf = (r: R) => drafts.get(rowId(r)) ?? initial(r);

  const visible = useMemo(() => {
    const needle = normalize(filter);
    if (!needle) return rows;
    return rows.filter((r) => {
      const d = drafts.get(rowId(r)) ?? initial(r);
      return normalize(columns.map((c) => c.show(r, d)).join(" ")).includes(needle);
    });
  }, [rows, drafts, filter, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActive((a) => ({ row: Math.min(a.row, Math.max(0, visible.length - 1)), col: a.col }));
  }, [visible.length]);

  // La celda activa siempre a la vista, como en Excel.
  useEffect(() => {
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${active.row}-${active.col}"]`);
    cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  const canEdit = (r: R, d: D, c: GridColumn<R, D>) => !readOnly && Boolean(c.write) && (c.editable?.(r, d) ?? true);
  const cellKey = (id: string, key: string) => `${id}|${key}`;
  const focusGrid = () => requestAnimationFrame(() => gridRef.current?.focus());
  const errorAt = (r: R, d: D, c: GridColumn<R, D>) => writeErrors.get(cellKey(rowId(r), c.key)) ?? cellError?.(r, d, c.key);

  /** El rango seleccionado, normalizado. Sin ancla, la celda activa. */
  const range = useMemo(() => {
    const a = anchor ?? active;
    return {
      top: Math.min(a.row, active.row),
      bottom: Math.max(a.row, active.row),
      left: Math.min(a.col, active.col),
      right: Math.max(a.col, active.col),
    };
  }, [anchor, active]);
  const inRange = (r: number, c: number) => r >= range.top && r <= range.bottom && c >= range.left && c <= range.right;
  const isRange = range.top !== range.bottom || range.left !== range.right;

  function applyDraft(row: R, draft: D) {
    const id = rowId(row);
    setDrafts((current) => new Map(current).set(id, draft));
    setDirty((current) => new Set(current).add(id));
    onDraftChange?.(row, draft);
  }

  function writeOne(row: R, column: GridColumn<R, D>, raw: string, base?: D): D | null {
    const id = rowId(row);
    const result = column.write!(base ?? draftOf(row), raw, row);
    setWriteErrors((current) => {
      const next = new Map(current);
      if ("error" in result) next.set(cellKey(id, column.key), result.error);
      else next.delete(cellKey(id, column.key));
      return next;
    });
    return "error" in result ? null : result.draft;
  }

  function commit(rowIndex: number, colIndex: number, raw: string) {
    const row = visible[rowIndex];
    const column = columns[colIndex];
    setEditing(null);
    if (!row || !column?.write) return;
    const next = writeOne(row, column, raw);
    if (next) applyDraft(row, next);
  }

  /** Escribe en todas las celdas editables del rango: vaciar o rellenar hacia abajo. */
  function fillRange(value: (colIndex: number) => string | null) {
    for (let ri = range.top; ri <= range.bottom; ri += 1) {
      const row = visible[ri];
      if (!row) continue;
      let draft = draftOf(row);
      let changed = false;
      for (let ci = range.left; ci <= range.right; ci += 1) {
        const column = columns[ci];
        const raw = value(ci);
        if (raw === null || !column || !canEdit(row, draft, column)) continue;
        const next = writeOne(row, column, raw, draft);
        if (next) {
          draft = next;
          changed = true;
        }
      }
      if (changed) applyDraft(row, draft);
    }
  }

  function move(dr: number, dc: number, extend = false) {
    if (extend && !anchor) setAnchor(active);
    if (!extend) setAnchor(null);
    setActive((a) => ({
      row: Math.min(visible.length - 1, Math.max(0, a.row + dr)),
      col: Math.min(columns.length - 1, Math.max(0, a.col + dc)),
    }));
  }

  const activeRow = visible[active.row];
  const activeColumn = columns[active.col];
  const activeDraft = activeRow ? draftOf(activeRow) : undefined;
  const activeEditable = Boolean(activeRow && activeDraft && activeColumn && canEdit(activeRow, activeDraft, activeColumn));
  const activeError = activeRow && activeColumn ? errorAt(activeRow, activeDraft!, activeColumn) : undefined;

  /** Las celdas con error, en orden de lectura. */
  const errorCells = useMemo(() => {
    const out: Cell[] = [];
    visible.forEach((r, ri) => {
      const d = drafts.get(rowId(r)) ?? initial(r);
      columns.forEach((c, ci) => {
        if (writeErrors.get(cellKey(rowId(r), c.key)) ?? cellError?.(r, d, c.key)) out.push({ row: ri, col: ci });
      });
    });
    return out;
  }, [visible, drafts, columns, writeErrors, cellError]); // eslint-disable-line react-hooks/exhaustive-deps

  function nextError() {
    if (errorCells.length === 0) return;
    const after = errorCells.find((c) => c.row > active.row || (c.row === active.row && c.col > active.col)) ?? errorCells[0];
    setAnchor(null);
    setActive(after);
    focusGrid();
  }

  function copyRange() {
    const lines: string[] = [];
    for (let ri = range.top; ri <= range.bottom; ri += 1) {
      const row = visible[ri];
      if (!row) continue;
      const d = draftOf(row);
      const cells: string[] = [];
      for (let ci = range.left; ci <= range.right; ci += 1) cells.push(columns[ci].show(row, d).replace(/[\t\n]+/g, " "));
      lines.push(cells.join("\t"));
    }
    void navigator.clipboard?.writeText(lines.join("\n"));
    if (isRange) setMessage({ ok: true, text: `Se copiaron ${range.bottom - range.top + 1} × ${range.right - range.left + 1} celdas.` });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing !== null) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const page = Math.max(1, Math.floor((gridRef.current?.clientHeight ?? 400) / 34) - 1);
    if (k === "ArrowDown") move(ctrl ? visible.length : 1, 0, e.shiftKey);
    else if (k === "ArrowUp") move(ctrl ? -visible.length : -1, 0, e.shiftKey);
    else if (k === "ArrowRight") move(0, ctrl ? columns.length : 1, e.shiftKey);
    else if (k === "ArrowLeft") move(0, ctrl ? -columns.length : -1, e.shiftKey);
    else if (k === "PageDown") move(page, 0, e.shiftKey);
    else if (k === "PageUp") move(-page, 0, e.shiftKey);
    else if (k === "Home") ctrl ? move(-visible.length, -columns.length) : move(0, -columns.length);
    else if (k === "End") ctrl ? move(visible.length, columns.length) : move(0, columns.length);
    else if (k === "Tab") move(0, e.shiftKey ? -1 : 1);
    else if (k === "F8") nextError();
    else if ((k === "Enter" || k === "F2") && activeEditable) setEditing(activeColumn.show(activeRow, activeDraft!));
    else if (k === "Enter") move(e.shiftKey ? -1 : 1, 0);
    else if (k === "Escape") setAnchor(null);
    else if ((k === "Delete" || k === "Backspace") && !readOnly) fillRange(() => "");
    else if (ctrl && k.toLowerCase() === "a") {
      setAnchor({ row: 0, col: 0 });
      setActive({ row: visible.length - 1, col: columns.length - 1 });
    } else if (ctrl && k.toLowerCase() === "c") {
      copyRange();
      return;
    } else if (ctrl && k.toLowerCase() === "d" && !readOnly) {
      const source = visible[range.top];
      if (source) {
        const d = draftOf(source);
        const values = columns.map((c) => c.show(source, d));
        const top = range.top;
        // La primera fila del rango es la fuente: se rellenan las de abajo.
        for (let ri = top + 1; ri <= range.bottom; ri += 1) {
          const row = visible[ri];
          if (!row) continue;
          let draft = draftOf(row);
          let changed = false;
          for (let ci = range.left; ci <= range.right; ci += 1) {
            const column = columns[ci];
            if (!canEdit(row, draft, column)) continue;
            const next = writeOne(row, column, values[ci], draft);
            if (next) {
              draft = next;
              changed = true;
            }
          }
          if (changed) applyDraft(row, draft);
        }
      }
    } else if (ctrl && k.toLowerCase() === "s") {
      void saveAll();
    } else if (k.length === 1 && !ctrl && !e.altKey && activeEditable) {
      setAnchor(null);
      setEditing(k);
    } else return;
    e.preventDefault();
  }

  function onPaste(text: string) {
    if (readOnly) return;
    const block = parseClipboard(text);
    let written = 0;
    let skipped = 0;
    const errors: string[] = [];
    block.forEach((cells, dr) => {
      const row = visible[active.row + dr];
      if (!row) return;
      let draft = draftOf(row);
      let changed = false;
      cells.forEach((raw, dc) => {
        const column = columns[active.col + dc];
        if (!column) return;
        if (!canEdit(row, draft, column)) {
          if (raw.trim()) skipped += 1;
          return;
        }
        const next = writeOne(row, column, raw, draft);
        if (!next) errors.push(`fila ${active.row + dr + 1}, ${column.label}`);
        else {
          draft = next;
          changed = true;
          written += 1;
        }
      });
      if (changed) applyDraft(row, draft);
    });
    setMessage({
      ok: errors.length === 0,
      text:
        `Se pegaron ${written} celdas` +
        (skipped ? `; ${skipped} cayeron en celdas bloqueadas y no se escribieron` : "") +
        (errors.length ? `. No se pudieron escribir: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}` : "") +
        ".",
    });
  }

  async function saveAll() {
    if (!onSave || dirty.size === 0 || saving) return;
    const changes = rows.filter((r) => dirty.has(rowId(r))).map((r) => ({ row: r, draft: draftOf(r) }));
    setSaving(true);
    try {
      const outcome = await onSave(changes);
      setDirty((current) => {
        const next = new Set(current);
        outcome.saved.forEach((id) => next.delete(id));
        return next;
      });
      setMessage({
        ok: outcome.problems.length === 0,
        text:
          (outcome.text ?? `Se guardaron ${outcome.saved.length} ${outcome.saved.length === 1 ? "fila" : "filas"}.`) +
          (outcome.problems.length ? ` ${outcome.problems.join(" ")}` : ""),
      });
    } catch (failure) {
      setMessage({ ok: false, text: failure instanceof Error ? failure.message : "No se pudo guardar." });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    const fresh = new Map(rows.map((r) => [rowId(r), initial(r)]));
    setDrafts(fresh);
    setDirty(new Set());
    setWriteErrors(new Map());
    setMessage(null);
    if (onDraftChange) rows.forEach((r) => onDraftChange(r, fresh.get(rowId(r))!));
  }

  function copySheet() {
    const lines = [columns.map((c) => c.label).join("\t")].concat(
      visible.map((r) => columns.map((c) => c.show(r, draftOf(r)).replace(/[\t\n]+/g, " ")).join("\t")),
    );
    void navigator.clipboard?.writeText(lines.join("\n"));
    setMessage({ ok: true, text: `Se copiaron ${visible.length} filas: péguelas en Excel.` });
  }

  // Columnas fijas: cada una a la izquierda de la anterior, después del número de fila.
  const ROWNUM = 52;
  const frozenLeft = useMemo(() => {
    const out: number[] = [];
    let left = ROWNUM;
    for (let i = 0; i < Math.min(frozen, columns.length); i += 1) {
      out.push(left);
      left += columns[i].width;
    }
    return out;
  }, [frozen, columns]);
  const stick = (ci: number): CSSProperties | undefined => (ci < frozenLeft.length ? { left: frozenLeft[ci] } : undefined);
  const frozenWidth = frozenLeft.length ? frozenLeft[frozenLeft.length - 1] + columns[frozenLeft.length - 1].width : ROWNUM;

  return (
    <section className="admin-card dg" aria-label={label}>
      <div className="dg__bar">
        <div className="dg__tools">
          {showFilter && (
            <label className="dg__filter">
              <Icon name="search" size={14} />
              <span className="sr-only">Filtrar la hoja</span>
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar filas…" />
            </label>
          )}
          {toolbar}
          {errorCells.length > 0 && (
            <button type="button" className="button-ghost dg__errors" onClick={nextError}>
              <Icon name="alert" size={14} /> {errorCells.length} {errorCells.length === 1 ? "celda con error" : "celdas con error"} · Siguiente (F8)
            </button>
          )}
          <button type="button" className="button-ghost" onClick={copySheet} disabled={visible.length === 0}>
            <Icon name="table" size={14} /> Copiar la hoja
          </button>
        </div>
        {!readOnly && onSave && (
          <div className="dg__save">
            <span className="dg__muted">
              {dirty.size ? `${dirty.size} ${dirty.size === 1 ? "fila con cambios" : "filas con cambios"}` : "Sin cambios"}
            </span>
            <button type="button" className="button-ghost" disabled={dirty.size === 0} onClick={discard}>
              Descartar
            </button>
            <button type="button" className="button-primary" disabled={dirty.size === 0 || saving} onClick={() => void saveAll()}>
              {saving ? "Guardando…" : saveLabel}
            </button>
          </div>
        )}
      </div>
      <p className="dg__legend">
        {!readOnly && (
          <>
            <span className="dg__swatch dg__swatch--edit" /> editable <span className="dg__swatch dg__swatch--lock" /> bloqueada{" "}
            <span className="dg__swatch dg__swatch--error" /> con error ·{" "}
          </>
        )}
        {readOnly
          ? "Solo lectura · flechas y Re Pág/Av Pág para moverse, Mayús para seleccionar, Ctrl+C copia."
          : "Enter edita · Tab avanza · Mayús+flechas selecciona · Ctrl+V pega desde Excel · Supr vacía · Ctrl+D rellena abajo · Ctrl+S guarda."}
        {legend && <> · {legend}</>}
      </p>
      {message && (
        <p className={message.ok ? "admin-notice" : "dg__error"} role="status">
          <Icon name={message.ok ? "check" : "alert"} size={15} />
          {message.text}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="dg__muted dg__empty">{filter ? "Ninguna fila coincide con el filtro." : empty}</p>
      ) : (
        <div
          ref={gridRef}
          className="dg__grid"
          role="grid"
          aria-label={label}
          aria-rowcount={visible.length + 1}
          aria-colcount={columns.length}
          aria-multiselectable="true"
          tabIndex={0}
          style={{ scrollPaddingLeft: frozenWidth, scrollPaddingTop: 40 } as CSSProperties}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (editing !== null) return;
            e.preventDefault();
            onPaste(e.clipboardData.getData("text/plain"));
          }}
        >
          <table>
            <colgroup>
              <col style={{ width: ROWNUM }} />
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
              {status && <col style={{ width: 240 }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" aria-label="Fila" className="dg__rownum" />
                {columns.map((c, ci) => (
                  <th
                    key={c.key}
                    scope="col"
                    data-numeric={c.numeric || undefined}
                    data-frozen={ci < frozenLeft.length || undefined}
                    data-frozen-last={ci === frozenLeft.length - 1 || undefined}
                    data-colactive={ci === active.col || undefined}
                    style={stick(ci)}
                  >
                    {c.label}
                  </th>
                ))}
                {status && <th scope="col">Estado de la fila</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, ri) => {
                const id = rowId(row);
                const draft = draftOf(row);
                const note = status?.(row, draft, dirty.has(id));
                return (
                  <tr key={id} data-dirty={dirty.has(id) || undefined} data-rowactive={ri === active.row || undefined}>
                    <th
                      scope="row"
                      className="dg__rownum"
                      onMouseDown={() => {
                        setAnchor({ row: ri, col: 0 });
                        setActive({ row: ri, col: columns.length - 1 });
                      }}
                    >
                      {rowLabel ? rowLabel(row, ri) : ri + 1}
                    </th>
                    {columns.map((c, ci) => {
                      const isActive = active.row === ri && active.col === ci;
                      const can = canEdit(row, draft, c);
                      const err = errorAt(row, draft, c);
                      return (
                        <td
                          key={c.key}
                          role="gridcell"
                          data-cell={`${ri}-${ci}`}
                          aria-selected={inRange(ri, ci)}
                          aria-readonly={!can}
                          aria-invalid={err ? true : undefined}
                          data-editable={can || undefined}
                          data-active={isActive || undefined}
                          data-inrange={(isRange && inRange(ri, ci)) || undefined}
                          data-error={err ? true : undefined}
                          data-numeric={c.numeric || undefined}
                          data-frozen={ci < frozenLeft.length || undefined}
                          data-frozen-last={ci === frozenLeft.length - 1 || undefined}
                          style={stick(ci)}
                          title={err}
                          onMouseDown={(event) => {
                            if (editing !== null && !isActive) setEditing(null);
                            if (event.shiftKey) {
                              if (!anchor) setAnchor(active);
                            } else setAnchor(null);
                            setActive({ row: ri, col: ci });
                          }}
                          onDoubleClick={() => can && setEditing(c.show(row, draft))}
                        >
                          {isActive && editing !== null && can ? (
                            <Editor
                              choices={c.choices}
                              initial={editing}
                              onCommit={(value, dr, dc) => {
                                commit(ri, ci, value);
                                move(dr, dc);
                                focusGrid();
                              }}
                              onCancel={() => {
                                setEditing(null);
                                focusGrid();
                              }}
                            />
                          ) : (
                            <span className="dg__text">{c.show(row, draft)}</span>
                          )}
                        </td>
                      );
                    })}
                    {status && (
                      <td className="dg__issues">
                        {note && (
                          <span className={`dg__note dg__note--${note.tone}`} title={note.text}>
                            {note.tone === "ok" && <Icon name="check" size={12} />} {note.text}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {activeRow && activeColumn && (
        <p className="dg__status" aria-live="polite" data-error={activeError ? true : undefined}>
          <strong>
            {rowLabel ? `Fila ${rowLabel(activeRow, active.row)}` : `Fila ${active.row + 1}`} · {activeColumn.label}
          </strong>
          {isRange ? ` — rango de ${range.bottom - range.top + 1} × ${range.right - range.left + 1}` : ""}
          {readOnly ? "" : activeEditable ? " — editable" : " — bloqueada"}
          {activeError ? ` — ${activeError}` : ` — ${activeColumn.show(activeRow, activeDraft!) || "vacía"}`}
        </p>
      )}
    </section>
  );
}

function Editor({
  choices,
  initial,
  onCommit,
  onCancel,
}: {
  choices?: readonly string[];
  initial: string;
  onCommit: (value: string, dr: number, dc: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    el?.focus();
    if (el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") onCommit(value, e.shiftKey ? -1 : 1, 0);
    else if (e.key === "Tab") onCommit(value, 0, e.shiftKey ? -1 : 1);
    else if (e.key === "Escape") onCancel();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (choices) {
    return (
      <select
        ref={(el) => {
          ref.current = el;
        }}
        className="dg__input"
        value={choices.includes(value) ? value : ""}
        onChange={(e) => onCommit(e.target.value, 0, 0)}
        onKeyDown={onKey}
        onBlur={() => onCommit(value, 0, 0)}
      >
        {!choices.includes("") && <option value="" disabled>Elija…</option>}
        {choices.map((c) => (
          <option key={c} value={c}>
            {c || "—"}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      ref={(el) => {
        ref.current = el;
      }}
      className="dg__input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCommit(value, 0, 0)}
    />
  );
}

/** Texto del portapapeles (Excel copia en TSV) como matriz de celdas. */
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((line) => line.split("\t"));
}

export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/* --- Ayudas para escribir celdas ------------------------------------------------ */

/** Una lista de pares [valor, etiqueta] como columna de desplegable. */
export function choiceCell<D, V extends string>(
  pairs: readonly (readonly [V, string])[],
  field: keyof D,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
) {
  const byLabel = new Map(pairs.map(([v, l]) => [normalize(l), v]));
  const byValue = new Map(pairs.map(([v, l]) => [v as string, l]));
  pairs.forEach(([v]) => byLabel.set(normalize(v), v));
  return {
    choices: [...(allowEmpty ? [""] : []), ...pairs.map(([, l]) => l)] as readonly string[],
    show: (draft: D) => byValue.get((draft[field] as unknown as string) ?? "") ?? "",
    write: (draft: D, raw: string): WriteResult<D> => {
      const key = normalize(raw);
      if (!key) return allowEmpty ? { draft: { ...draft, [field]: null } } : { error: "Elija un valor de la lista." };
      const value = byLabel.get(key);
      return value ? { draft: { ...draft, [field]: value } } : { error: `«${raw.trim()}» no está en la lista.` };
    },
  };
}

export function yesNo(raw: string): boolean | null | "error" {
  const v = normalize(raw);
  if (!v) return null;
  if (["si", "s", "x", "1", "verdadero"].includes(v)) return true;
  if (["no", "n", "0", "falso"].includes(v)) return false;
  return "error";
}

export function numberCell(raw: string): number | null | "error" {
  const text = raw.trim();
  if (!text) return null;
  const cleaned = text.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : "error";
}
