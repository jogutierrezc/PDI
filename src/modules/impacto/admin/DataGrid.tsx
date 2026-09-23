/* =============================================================================
   Hoja de cálculo genérica de Impacto.

   La misma mecánica de «Mi reporte» en hoja (CaptureSheet), para cualquier
   tabla de datos: el catálogo, las asignaciones del periodo, los registros
   de todos los programas y la bandeja de revisión.

     · flechas para moverse, Enter o F2 para editar, Tab para avanzar,
       Escape para cancelar, Supr para vaciar, escribir para reemplazar;
     · Ctrl+C copia la celda; Ctrl+V pega un bloque de Excel desde la celda
       activa, saltando las bloqueadas; Ctrl+S guarda;
     · un filtro que busca en todo lo visible, y «Copiar la hoja» para
       llevarse lo filtrado a Excel;
     · los cambios se acumulan por fila y se guardan juntos.

   Quién decide qué se edita y cómo se escribe es la vista, por columna: la
   hoja no sabe de indicadores ni de registros. Las reglas de negocio siguen
   donde estaban (la base y el servicio de validación).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { parseClipboard } from "../capture/sheet-model";

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
}: {
  label: string;
  rows: R[];
  rowId: (row: R) => string;
  initial: (row: R) => D;
  columns: GridColumn<R, D>[];
  onSave?: (changes: { row: R; draft: D }[]) => Promise<SaveOutcome>;
  saveLabel?: string;
  /** Última columna: qué le falta o qué pasa con la fila. */
  status?: (row: R, draft: D, dirty: boolean) => { text: string; tone: "ok" | "warn" | "bad" | "muted" } | null;
  legend?: ReactNode;
  toolbar?: ReactNode;
  empty?: string;
  readOnly?: boolean;
}) {
  const [drafts, setDrafts] = useState<Map<string, D>>(() => new Map(rows.map((r) => [rowId(r), initial(r)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const [cellError, setCellError] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Lo que llega de la base reemplaza las filas sin cambios; las editadas se respetan.
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

  const canEdit = (r: R, d: D, c: GridColumn<R, D>) => !readOnly && Boolean(c.write) && (c.editable?.(r, d) ?? true);
  const cellKey = (id: string, key: string) => `${id}|${key}`;
  const focusGrid = () => requestAnimationFrame(() => gridRef.current?.focus());

  function commit(rowIndex: number, colIndex: number, raw: string) {
    const row = visible[rowIndex];
    const column = columns[colIndex];
    if (!row || !column?.write) return;
    const id = rowId(row);
    const result = column.write(draftOf(row), raw, row);
    const errors = new Map(cellError);
    if ("error" in result) errors.set(cellKey(id, column.key), result.error);
    else {
      errors.delete(cellKey(id, column.key));
      setDrafts((current) => new Map(current).set(id, result.draft));
      setDirty((current) => new Set(current).add(id));
    }
    setCellError(errors);
    setEditing(null);
  }

  function move(dr: number, dc: number) {
    setActive((a) => ({
      row: Math.min(visible.length - 1, Math.max(0, a.row + dr)),
      col: Math.min(columns.length - 1, Math.max(0, a.col + dc)),
    }));
  }

  const activeRow = visible[active.row];
  const activeColumn = columns[active.col];
  const activeDraft = activeRow ? draftOf(activeRow) : undefined;
  const activeEditable = Boolean(activeRow && activeDraft && activeColumn && canEdit(activeRow, activeDraft, activeColumn));

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing !== null) return;
    const k = e.key;
    if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "Home") setActive((a) => ({ ...a, col: 0 }));
    else if (k === "End") setActive((a) => ({ ...a, col: columns.length - 1 }));
    else if (k === "Tab") move(0, e.shiftKey ? -1 : 1);
    else if ((k === "Enter" || k === "F2") && activeEditable) setEditing(activeColumn.show(activeRow, activeDraft!));
    else if (k === "Enter") move(1, 0);
    else if ((k === "Delete" || k === "Backspace") && activeEditable) commit(active.row, active.col, "");
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "c" && activeRow && activeColumn) {
      void navigator.clipboard?.writeText(activeColumn.show(activeRow, activeDraft!));
      return;
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "s") {
      void saveAll();
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && activeEditable) {
      setEditing(k);
    } else return;
    e.preventDefault();
  }

  function onPaste(text: string) {
    if (readOnly) return;
    const block = parseClipboard(text);
    const next = new Map(drafts);
    const touched = new Set(dirty);
    let written = 0;
    let skipped = 0;
    const errors: string[] = [];
    block.forEach((cells, dr) => {
      const row = visible[active.row + dr];
      if (!row) return;
      const id = rowId(row);
      cells.forEach((raw, dc) => {
        const column = columns[active.col + dc];
        if (!column) return;
        const current = next.get(id) ?? initial(row);
        if (!canEdit(row, current, column)) {
          if (raw.trim()) skipped += 1;
          return;
        }
        const result = column.write!(current, raw, row);
        if ("error" in result) errors.push(`Fila ${active.row + dr + 1}, ${column.label}: ${result.error}`);
        else {
          next.set(id, result.draft);
          touched.add(id);
          written += 1;
        }
      });
    });
    setDrafts(next);
    setDirty(touched);
    setMessage({
      ok: errors.length === 0,
      text:
        `Se pegaron ${written} celdas` +
        (skipped ? `; ${skipped} cayeron en celdas bloqueadas y no se escribieron` : "") +
        (errors.length ? `. Con error: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}` : "") +
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
    setDrafts(new Map(rows.map((r) => [rowId(r), initial(r)])));
    setDirty(new Set());
    setCellError(new Map());
    setMessage(null);
  }

  function copySheet() {
    const lines = [columns.map((c) => c.label).join("\t")].concat(
      visible.map((r) => columns.map((c) => c.show(r, draftOf(r)).replace(/[\t\n]+/g, " ")).join("\t")),
    );
    void navigator.clipboard?.writeText(lines.join("\n"));
    setMessage({ ok: true, text: `Se copiaron ${visible.length} filas: péguelas en Excel.` });
  }

  return (
    <section className="admin-card ia-sheetmode" aria-label={label}>
      <div className="ia-sheetmode__bar">
        <div className="ia-dg__tools">
          <label className="ia-dg__filter">
            <Icon name="search" size={14} />
            <span className="sr-only">Filtrar la hoja</span>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar filas…" />
          </label>
          {toolbar}
          <button type="button" className="button-ghost" onClick={copySheet} disabled={visible.length === 0}>
            <Icon name="table" size={14} /> Copiar la hoja
          </button>
        </div>
        {!readOnly && onSave && (
          <div className="ia-actions">
            <span className="ia-muted">
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
      <p className="ia-muted ia-dg__legend">
        {!readOnly && (
          <>
            <span className="ia-swatch ia-swatch--edit" /> editable <span className="ia-swatch ia-swatch--lock" /> bloqueada{" "}
            <span className="ia-swatch ia-swatch--error" /> con error ·{" "}
          </>
        )}
        {readOnly ? "Solo lectura · flechas para moverse, Ctrl+C copia la celda." : "Enter edita, Tab avanza, Ctrl+V pega desde Excel, Ctrl+S guarda."}
        {legend && <> · {legend}</>}
      </p>
      {message && (
        <p className={message.ok ? "admin-notice" : "ia-error"} role="status">
          <Icon name={message.ok ? "check" : "alert"} size={15} />
          {message.text}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="ia-muted ia-dg__empty">{filter ? "Ninguna fila coincide con el filtro." : empty}</p>
      ) : (
        <div
          ref={gridRef}
          className="ia-grid"
          role="grid"
          aria-label={label}
          aria-rowcount={visible.length + 1}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (editing !== null) return;
            e.preventDefault();
            onPaste(e.clipboardData.getData("text/plain"));
          }}
        >
          <table>
            <colgroup>
              <col style={{ width: 44 }} />
              {columns.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
              {status && <col style={{ width: 220 }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" aria-label="Fila" />
                {columns.map((c) => (
                  <th key={c.key} scope="col" data-numeric={c.numeric || undefined}>
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
                  <tr key={id} data-dirty={dirty.has(id) || undefined}>
                    <th scope="row" className="ia-grid__rownum">
                      {ri + 1}
                    </th>
                    {columns.map((c, ci) => {
                      const isActive = active.row === ri && active.col === ci;
                      const can = canEdit(row, draft, c);
                      const err = cellError.get(cellKey(id, c.key));
                      return (
                        <td
                          key={c.key}
                          role="gridcell"
                          aria-selected={isActive}
                          aria-readonly={!can}
                          data-editable={can || undefined}
                          data-active={isActive || undefined}
                          data-error={err ? true : undefined}
                          data-numeric={c.numeric || undefined}
                          title={err}
                          onMouseDown={() => {
                            if (editing !== null && !isActive) setEditing(null);
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
                            <span className="ia-grid__text">{c.show(row, draft)}</span>
                          )}
                        </td>
                      );
                    })}
                    {status && (
                      <td className="ia-grid__issues">
                        {note && (
                          <span
                            className={
                              note.tone === "ok" ? "ia-ready" : note.tone === "bad" ? "ia-grid__bad" : note.tone === "warn" ? "ia-grid__warn" : "ia-muted"
                            }
                            data-ready={note.tone === "ok" || undefined}
                            title={note.text}
                          >
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
        <p className="ia-grid__status" aria-live="polite">
          <strong>
            Fila {active.row + 1} · {activeColumn.label}
          </strong>
          {readOnly ? "" : activeEditable ? " — editable" : " — bloqueada"}
          {cellError.get(cellKey(rowId(activeRow), activeColumn.key)) ? ` — ${cellError.get(cellKey(rowId(activeRow), activeColumn.key))}` : ""}
          {` — ${activeColumn.show(activeRow, activeDraft!)}`}
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
    if (e.key === "Enter") onCommit(value, 1, 0);
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
        className="ia-grid__input"
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
      className="ia-grid__input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCommit(value, 0, 0)}
    />
  );
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
