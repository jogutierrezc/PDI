/* =============================================================================
   Modo hoja de cálculo · Mi reporte.

   Emula trabajar en Excel sin salir del portal:
     · una fila por registro, las columnas de la plantilla;
     · celdas editables en amarillo, bloqueadas en gris, con error en rojo;
     · flechas para moverse, Enter o F2 para editar, Tab para avanzar,
       Escape para cancelar, Supr para vaciar, escribir para reemplazar;
     · Ctrl+C copia la celda; Ctrl+V pega un bloque copiado de Excel desde la
       celda activa, saltando las bloqueadas;
     · los cambios se acumulan y se guardan juntos.

   Las reglas son las de la ficha (sheet-model.ts) y las validaciones, las del
   servicio único (validate.ts): los dos modos no pueden contradecirse.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from "react";
import { Icon } from "../../../components/ui/Icon";
import { computedValue } from "../data/validate";
import type { Issue } from "../data/validate";
import { draftOf, indicatorOf, issuesOf, useSaveMany } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { formatValue } from "../data/lens";
import { COLUMNS, display, isEditable, parseClipboard, paste, writeCell } from "../capture/sheet-model";
import type { ColumnKey, SheetDraft } from "../capture/sheet-model";
import { STATE_LABEL } from "./store";

const CALC_LABEL = { conteo: "Conteo", razon: "Razón", puntaje: "Puntaje", comparacion: "Comparación", texto: "Texto" } as const;

/** Qué columna señala cada campo de una validación. */
const FIELD_COLUMN: Partial<Record<Issue["field"], ColumnKey>> = {
  numerador: "numerator",
  valor: "numerator",
  denominador: "denominator",
  n: "n",
  numComparacion: "numComparison",
  denComparacion: "denComparison",
  justificacion: "justification",
  evidencias: "evidenceUrl",
  confirma: "confirm",
};

const initial = (row: CaptureRow): SheetDraft => ({ ...draftOf(row), observations: row.observations ?? "", evidenceUrl: "" });

export function CaptureSheet({ rows }: { rows: CaptureRow[] }) {
  const [drafts, setDrafts] = useState<Map<string, SheetDraft>>(() => new Map(rows.map((r) => [r.id, initial(r)])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [active, setActive] = useState({ row: 0, col: 4 });
  const [editing, setEditing] = useState<string | null>(null);
  const [cellError, setCellError] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useSaveMany();
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Lo que llega de la base reemplaza las filas sin cambios; las editadas se respetan.
  useEffect(() => {
    setDrafts((current) => {
      const next = new Map(current);
      for (const r of rows) if (!dirty.has(r.id)) next.set(r.id, initial(r));
      return next;
    });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo las columnas que algún registro usa: sin comparación ni n si nadie los pide.
  const columns = useMemo(() => {
    const uses = {
      denominator: rows.some((r) => r.calc_type === "razon" || r.calc_type === "comparacion"),
      n: rows.some((r) => r.calc_type === "puntaje"),
      numComparison: rows.some((r) => r.calc_type === "comparacion"),
      denComparison: rows.some((r) => r.calc_type === "comparacion"),
      confirm: rows.some((r) => r.capture_mode === "precargado"),
    } as Partial<Record<ColumnKey, boolean>>;
    return COLUMNS.filter((c) => uses[c.key] !== false);
  }, [rows]);
  const keys = columns.map((c) => c.key);

  const issuesByRow = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const r of rows) {
      const d = drafts.get(r.id);
      if (d) map.set(r.id, issuesOf(r, { ...d, evidencias: [...d.evidencias, ...(d.evidenceUrl ? [{ nombre: d.evidenceUrl, url: d.evidenceUrl }] : [])] }, true));
    }
    return map;
  }, [rows, drafts]);

  const cellKey = (rowId: string, key: ColumnKey) => `${rowId}|${key}`;
  const focusGrid = () => requestAnimationFrame(() => gridRef.current?.focus());

  function commit(rowIndex: number, key: ColumnKey, raw: string) {
    const row = rows[rowIndex];
    const draft = drafts.get(row.id)!;
    const result = writeCell(draft, key, raw);
    const errors = new Map(cellError);
    if ("error" in result) {
      errors.set(cellKey(row.id, key), result.error);
    } else {
      errors.delete(cellKey(row.id, key));
      setDrafts(new Map(drafts).set(row.id, result.draft));
      setDirty(new Set(dirty).add(row.id));
    }
    setCellError(errors);
    setEditing(null);
  }

  function move(dr: number, dc: number) {
    setActive((a) => ({
      row: Math.min(rows.length - 1, Math.max(0, a.row + dr)),
      col: Math.min(keys.length - 1, Math.max(0, a.col + dc)),
    }));
  }

  const activeRow = rows[active.row];
  const activeKey = keys[active.col];
  const activeDraft = activeRow ? drafts.get(activeRow.id) : undefined;
  const activeEditable = Boolean(activeRow && activeDraft && isEditable(activeRow, activeDraft, activeKey));

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Mientras se edita, el teclado es del editor ("" también es editar: Enter abre la celda vacía).
    if (editing !== null) return;
    const k = e.key;
    if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "Tab") move(0, e.shiftKey ? -1 : 1);
    else if ((k === "Enter" || k === "F2") && activeEditable) setEditing("");
    else if (k === "Enter") move(1, 0);
    else if ((k === "Delete" || k === "Backspace") && activeEditable) commit(active.row, activeKey, "");
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "c" && activeDraft) {
      void navigator.clipboard?.writeText(display(activeDraft, activeKey));
      return;
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "s") {
      void saveAll();
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && activeEditable) {
      setEditing(k);
    } else return;
    e.preventDefault();
  }

  function onPaste(text: string) {
    const block = parseClipboard(text);
    const r = paste(rows, drafts, keys, active, block);
    setDrafts(r.drafts);
    const touched = new Set(dirty);
    block.forEach((_, i) => rows[active.row + i] && touched.add(rows[active.row + i].id));
    setDirty(touched);
    setMessage({
      ok: r.errors.length === 0,
      text:
        `Se pegaron ${r.written} celdas` +
        (r.skipped ? `; ${r.skipped} cayeron en celdas bloqueadas y no se escribieron` : "") +
        (r.errors.length ? `. Con error: ${r.errors.slice(0, 3).join(" · ")}${r.errors.length > 3 ? "…" : ""}` : "") +
        ".",
    });
  }

  async function saveAll() {
    const items = rows
      .filter((r) => dirty.has(r.id))
      .map((r) => {
        const d = drafts.get(r.id)!;
        return { row: r, draft: { ...d, evidencias: [] }, evidenceUrl: d.evidenceUrl || undefined };
      });
    if (items.length === 0) return;
    const bad = items.find((i) => i.evidenceUrl && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(i.evidenceUrl));
    if (bad) {
      setMessage({ ok: false, text: `${bad.row.code}: el enlace de evidencia no es una URL válida.` });
      return;
    }
    const result = await save.mutateAsync(items);
    const saved = new Set(dirty);
    items.forEach((i) => !result.problems.some((p) => p.startsWith(i.row.code)) && saved.delete(i.row.id));
    setDirty(saved);
    setMessage({
      ok: result.problems.length === 0,
      text: `Se guardaron ${result.saved} registros en borrador.${result.problems.length ? ` ${result.problems.join(" ")}` : ""}`,
    });
  }

  function discard() {
    setDrafts(new Map(rows.map((r) => [r.id, initial(r)])));
    setDirty(new Set());
    setCellError(new Map());
    setMessage(null);
  }

  const errorsTotal = [...issuesByRow.values()].filter((list) => list.some((i) => i.level === "error")).length;

  return (
    <section className="admin-card ia-sheetmode" aria-label="Registros en hoja de cálculo">
      <div className="ia-sheetmode__bar">
        <p className="ia-muted">
          <span className="ia-swatch ia-swatch--edit" /> editable <span className="ia-swatch ia-swatch--lock" /> bloqueada{" "}
          <span className="ia-swatch ia-swatch--error" /> con error · Enter edita, Tab avanza, Ctrl+V pega desde Excel, Ctrl+S guarda.
        </p>
        <div className="ia-actions">
          <span className="ia-muted">
            {dirty.size ? `${dirty.size} ${dirty.size === 1 ? "fila con cambios" : "filas con cambios"}` : "Sin cambios"} · {errorsTotal} con algo pendiente
          </span>
          <button type="button" className="button-ghost" disabled={dirty.size === 0} onClick={discard}>
            Descartar
          </button>
          <button type="button" className="button-primary" disabled={dirty.size === 0 || save.isPending} onClick={() => void saveAll()}>
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
      {message && (
        <p className={message.ok ? "admin-notice" : "ia-error"} role="status">
          <Icon name={message.ok ? "check" : "alert"} size={15} />
          {message.text}
        </p>
      )}

      <div
        ref={gridRef}
        className="ia-grid"
        role="grid"
        aria-label="Registros del periodo"
        aria-rowcount={rows.length + 1}
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
            <col style={{ width: 36 }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" aria-label="Fila" />
              {columns.map((c) => (
                <th key={c.key} scope="col" data-numeric={c.numeric || undefined}>
                  {c.label}
                </th>
              ))}
              <th scope="col">Validación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const draft = drafts.get(row.id)!;
              if (!draft) return null;
              const issues = issuesByRow.get(row.id) ?? [];
              const flagged = new Set(issues.filter((i) => i.level === "error").map((i) => FIELD_COLUMN[i.field]).filter(Boolean));
              const value = draft.noAplica ? null : computedValue(indicatorOf(row), draft);
              return (
                <tr key={row.id} data-dirty={dirty.has(row.id) || undefined}>
                  <th scope="row" className="ia-grid__rownum">
                    {ri + 1}
                  </th>
                  {columns.map((c, ci) => {
                    const isActive = active.row === ri && active.col === ci;
                    const can = isEditable(row, draft, c.key);
                    const err = cellError.get(cellKey(row.id, c.key)) ?? (flagged.has(c.key) ? issues.find((i) => FIELD_COLUMN[i.field] === c.key)?.message : undefined);
                    let content: string;
                    if (c.key === "code") content = row.code;
                    else if (c.key === "name") content = row.name;
                    else if (c.key === "campus") content = row.campus_name ?? "Todas";
                    else if (c.key === "type") content = `${CALC_LABEL[row.calc_type]}${row.capture_mode === "precargado" ? " · precargado" : ""}`;
                    else if (c.key === "value") content = draft.noAplica ? (draft.noAplica === "no_aplica" ? "No aplica" : "Sin dato") : formatValue(indicatorOf(row), value);
                    else if (c.key === "state") content = STATE_LABEL[row.state];
                    else content = display(draft, c.key);
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
                        onDoubleClick={() => can && setEditing(display(draft, c.key))}
                      >
                        {isActive && editing !== null && can ? (
                          <CellEditor
                            column={c.key}
                            initial={editing}
                            inputRef={inputRef}
                            onCommit={(value, dr, dc) => {
                              commit(ri, c.key, value);
                              move(dr, dc);
                              focusGrid();
                            }}
                            onCancel={() => {
                              setEditing(null);
                              focusGrid();
                            }}
                          />
                        ) : (
                          <span className="ia-grid__text">{content}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="ia-grid__issues">
                    {issues.length === 0 ? (
                      <span className="ia-ready" data-ready>
                        <Icon name="check" size={12} /> Listo para enviar
                      </span>
                    ) : (
                      <span title={issues.map((i) => i.message).join("\n")} className={issues.some((i) => i.level === "error") ? "ia-grid__bad" : "ia-grid__warn"}>
                        {issues[0].message}
                        {issues.length > 1 ? ` (+${issues.length - 1})` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {activeRow && (
        <p className="ia-grid__status" aria-live="polite">
          <strong>
            {activeRow.code} · {columns[active.col]?.label}
          </strong>
          {activeEditable ? " — editable" : " — bloqueada"}
          {cellError.get(cellKey(activeRow.id, activeKey)) ? ` — ${cellError.get(cellKey(activeRow.id, activeKey))}` : ""}
          {activeKey === "name" && ` — ${activeRow.numerator_def ?? ""}${activeRow.denominator_def ? ` ÷ ${activeRow.denominator_def}` : ""}`}
        </p>
      )}
    </section>
  );
}

function CellEditor({
  column,
  initial,
  inputRef,
  onCommit,
  onCancel,
}: {
  column: ColumnKey;
  initial: string;
  inputRef: MutableRefObject<HTMLInputElement | HTMLSelectElement | null>;
  onCommit: (value: string, dr: number, dc: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const choices = COLUMNS.find((c) => c.key === column)?.choices;

  useEffect(() => {
    const el = inputRef.current;
    el?.focus();
    if (el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
  }, [inputRef]);

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
          inputRef.current = el;
        }}
        className="ia-grid__input"
        value={choices.includes(value) ? value : ""}
        onChange={(e) => onCommit(e.target.value, 0, 0)}
        onKeyDown={onKey}
        onBlur={() => onCommit(value, 0, 0)}
      >
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
        inputRef.current = el;
      }}
      className="ia-grid__input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCommit(value, 0, 0)}
    />
  );
}
