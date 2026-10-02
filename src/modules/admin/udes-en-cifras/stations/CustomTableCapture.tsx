/* =============================================================================
   Tablas personalizadas en la intranet (Captura › Tablas personalizadas).

   Una tabla escrita por quien publica: columnas de texto, de número y de
   categoría en la misma tabla, con patrones de color. Por debajo es un conjunto
   libre con una vista de tabla que trae `view.table` (ver
   datos-abiertos/data/custom-table.ts): no hay migración ni tablas nuevas, y el
   bloque de la ficha, el boletín y la descarga en CSV son los de siempre.

   Todo se edita en un solo sitio:
   · la ficha de la tabla: título, corte o periodo (un rótulo: la tabla no se
     filtra sola con el selector de periodo), nota al pie, fuente;
   · la rejilla: nombres de columna arriba, casillas debajo. Flechas, Enter y
     Tab se mueven como en una hoja de cálculo; pegar un rango de Excel abre
     una vista previa antes de tocar nada;
   · cada columna tiene su tipo y sus reglas de color («Ajustar»);
   · la celda enfocada y cada fila admiten un color a mano, que manda sobre la
     regla;
   · debajo, la tabla tal como se verá en el portal, con su leyenda.

   Guardar reemplaza la definición y las filas de una vez. Borrar pide
   confirmar en el mismo sitio (ConfirmButton); aquí no hay modales.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdFreeSetRecordRow, OdFreeSetRow } from "../../../../types/database";
import { CustomTableView } from "../../../datos-abiertos/components/free/CustomTable";
import {
  cellTone,
  CUSTOM_KIND_LABEL,
  customViewOf,
  MAX_COLUMNS,
  MAX_ROWS,
  optionOf,
  parsePaste,
  TONE_ORDER,
  TONES,
} from "../../../datos-abiertos/data/custom-table";
import type { CustomKind, ManualTone, PastePlan, ToneId } from "../../../datos-abiertos/data/custom-table";
import type { FreeRow, FreeRowKind } from "../../../datos-abiertos/data/free-sets";
import type { StationProps } from "../OdAdmin";
import {
  applyPaste,
  buildOutput,
  cleanOptions,
  draftOf,
  emptyColumn,
  emptyRow,
  isBlankRow,
  looksLikeHeader,
  newId,
  previewPaste,
  STARTER_COLUMNS,
  starterView,
  toColumn,
} from "../custom-table-draft";
import type { Draft, DraftColumn, DraftRow, DraftRule, PasteRequest } from "../custom-table-draft";
import { useDeleteDataset, useSaveCustomTable } from "../od-data";
import { PasteMessages } from "../PasteTable";
import { ConfirmButton, Panel, SaveState, StageEmpty, slugify } from "../ui";
import "./custom-table-editor.css";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

const ROW_KIND_LABEL: Record<FreeRowKind, string> = {
  dato: "Dato",
  grupo: "Título",
  total: "Total (a mano)",
};

const OP_LABEL: Record<DraftRule["op"], string> = {
  menor: "Menor que",
  entre: "Entre (desde… hasta menos de…)",
  mayor_igual: "Mayor o igual que",
};

/** Resumen corto de un texto largo: para volver a montar la rejilla cuando cambia lo guardado. */
const signature = (text: string) => {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33) ^ text.charCodeAt(i);
  return `${text.length}-${(hash >>> 0).toString(36)}`;
};

const uniqueSlug = (text: string, taken: string[]) => {
  const base = slugify(text) || "tabla";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}-${n}`;
  return key;
};

function ToneOptions({ labels }: { labels: Draft["meta"]["labels"] }) {
  return (
    <>
      {TONE_ORDER.map((tone) => (
        <option key={tone} value={tone}>
          {TONES[tone].glyph} {labels[tone]?.trim() || TONES[tone].label}
        </option>
      ))}
    </>
  );
}

/* --- La pestaña ------------------------------------------------------------------------ */

export function CustomTableCapture({ data, report, periodId, canEdit }: StationProps) {
  const all = (data.rows.freeSets ?? []).filter((fs) => fs.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const sets = all.filter((fs) => customViewOf(fs));
  const create = useSaveCustomTable();
  const [chosen, setChosen] = useState("");
  /** La clave de la tabla recién creada: se abre sola cuando llega de la base. */
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const set = sets.find((s) => s.key === createdKey) ?? sets.find((s) => s.id === chosen) ?? sets[0];
  const published = report!.status === "publicado";

  const submit = () => {
    const name = title.trim();
    if (!name) return;
    const key = uniqueSlug(name, all.map((s) => s.key));
    create.mutate(
      {
        periodId,
        set: {
          report_id: report!.uuid!, key, title: name, description: "", temporality: "sin_tiempo", period_label: "",
          columns: STARTER_COLUMNS, views: [starterView(name)], office_id: null, position: all.length + 1,
        },
      },
      {
        onSuccess: () => {
          setCreatedKey(key);
          setCreating(false);
          setTitle("");
        },
      },
    );
  };

  return (
    <div className="oda-stack">
      <div className="oda-grid-toolbar">
        {sets.length > 1 && set && (
          <label className="oda-grid-toolbar__field">
            <span>Tabla</span>
            <select
              value={set.id}
              onChange={(e) => {
                setCreatedKey(null);
                setChosen(e.target.value);
              }}
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!creating && (
          <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> Nueva tabla personalizada
          </button>
        )}
        <SaveState pending={create.isPending} error={create.error} success={false} />
      </div>

      {creating && (
        <form
          className="oda-inline-form oda-ct__new"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="admin-field admin-field--wide">
            <span>Título de la tabla nueva</span>
            <input autoFocus required value={title} placeholder="Estado de los compromisos de acreditación" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <p className="oda-form-note">
            Nace con dos columnas (un texto y un número) para empezar a escribir, y entra a la ficha como bloque. No se ve en
            el portal hasta que le escribas su corte y al menos una fila.
          </p>
          <div className="oda-inline-form__actions">
            <button type="button" className="button-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button type="submit" className="button-primary" disabled={!title.trim() || create.isPending}>
              Crear tabla
            </button>
          </div>
        </form>
      )}

      {!set ? (
        !creating && (
          <StageEmpty title="Este informe no tiene tablas personalizadas">
            Una tabla personalizada mezcla textos y cifras, con color por reglas o a mano. Créala con «Nueva tabla
            personalizada».
          </StageEmpty>
        )
      ) : (
        <CustomTableEditor
          key={`${set.id}-${signature(JSON.stringify([set.title, set.description, set.office_id, set.columns, set.views, (data.rows.freeSetRows ?? []).filter((r) => r.set_id === set.id)]))}`}
          set={set}
          rows={(data.rows.freeSetRows ?? []).filter((r) => r.set_id === set.id).sort((a, b) => a.position - b.position)}
          offices={data.rows.offices}
          periodId={periodId}
          published={published}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

/* --- El editor -------------------------------------------------------------------------- */

interface Active {
  row: string;
  column: string;
}

function CustomTableEditor({ set, rows, offices, periodId, published, canEdit }: {
  set: OdFreeSetRow;
  rows: OdFreeSetRecordRow[];
  offices: StationProps["data"]["rows"]["offices"];
  periodId: string;
  published: boolean;
  canEdit: boolean;
}) {
  const save = useSaveCustomTable();
  const remove = useDeleteDataset();
  const view = customViewOf(set);
  const viewKey = view?.key ?? "tabla";

  // Sin dependencias: el editor se monta de nuevo (key) cuando cambia lo guardado.
  const initial = useMemo<Draft>(() => {
    const stored = draftOf(set, view, rows);
    return stored.rows.length ? stored : { ...stored, rows: [emptyRow(), emptyRow(), emptyRow()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [draft, setDraft] = useState<Draft>(initial);
  const [active, setActive] = useState<Active | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [paste, setPaste] = useState<PasteRequest | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasted, setPasted] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const refs = useRef(new Map<string, HTMLInputElement>());

  const fingerprint = (d: Draft) => {
    const out = buildOutput(d, viewKey);
    return JSON.stringify([out.columns, out.view, out.rows, d.meta.description.trim(), d.meta.officeId]);
  };
  const baseline = useMemo(() => fingerprint(initial), [initial]);
  const output = useMemo(() => buildOutput(draft, viewKey), [draft, viewKey]);
  const dirty = fingerprint(draft) !== baseline;
  const canSave = canEdit && dirty && output.errors.length === 0 && !save.isPending;
  const labels = draft.meta.labels;

  const change = (next: Draft) => {
    setDraft(next);
    setConfirming(false);
  };
  const patchMeta = (patch: Partial<Draft["meta"]>) => change({ ...draft, meta: { ...draft.meta, ...patch } });
  const patchColumn = (id: string, patch: Partial<DraftColumn>) =>
    change({ ...draft, columns: draft.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const patchRow = (id: string, patch: Partial<DraftRow>) => change({ ...draft, rows: draft.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const setCell = (rowId: string, columnId: string, text: string) =>
    change({ ...draft, rows: draft.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: text } } : r)) });

  const moveColumn = (index: number, delta: number) => {
    const next = [...draft.columns];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    change({ ...draft, columns: next });
  };
  const removeColumn = (id: string) => {
    change({
      ...draft,
      columns: draft.columns.filter((c) => c.id !== id),
      rows: draft.rows.map((r) => {
        const { [id]: _cell, ...cells } = r.cells;
        const { [id]: _tone, ...tones } = r.tones;
        void _cell;
        void _tone;
        return { ...r, cells, tones };
      }),
    });
    setAdjusting(null);
    setActive(null);
  };
  const addColumn = (kind: CustomKind) => {
    const column = emptyColumn(kind);
    change({ ...draft, columns: [...draft.columns, column] });
    setAdjusting(column.id);
    requestAnimationFrame(() => refs.current.get(`col|${column.id}`)?.focus());
  };
  const moveRow = (index: number, delta: number) => {
    const next = [...draft.rows];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    change({ ...draft, rows: next });
  };
  const addRow = (kind: FreeRowKind) => {
    const row = emptyRow(kind);
    change({ ...draft, rows: [...draft.rows, row] });
    requestAnimationFrame(() => refs.current.get(kind === "grupo" ? `${row.id}|label` : `${row.id}|${draft.columns[0]?.id}`)?.focus());
  };

  /* Teclado: como una hoja de cálculo. Tab y Mayús+Tab ya recorren las casillas en orden. */
  const focusCell = (rowIndex: number, columnIndex: number) => {
    const row = draft.rows[rowIndex];
    const column = draft.columns[Math.max(0, Math.min(draft.columns.length - 1, columnIndex))];
    if (!row || !column) return false;
    const node = refs.current.get(row.kind === "grupo" ? `${row.id}|label` : `${row.id}|${column.id}`);
    node?.focus();
    node?.select();
    return Boolean(node);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    const input = event.currentTarget;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
      event.preventDefault();
      const up = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey);
      const target = ri + (up ? -1 : 1);
      if (target < 0) return;
      if (target >= draft.rows.length) {
        // Enter en la última fila abre otra, como en Excel.
        if (event.key !== "Enter" || !canEdit || draft.rows.length >= MAX_ROWS) return;
        const row = emptyRow();
        change({ ...draft, rows: [...draft.rows, row] });
        requestAnimationFrame(() => refs.current.get(`${row.id}|${draft.columns[ci]?.id}`)?.focus());
        return;
      }
      focusCell(target, ci);
      return;
    }
    // Izquierda y derecha cambian de casilla solo desde el borde del texto.
    const collapsed = input.selectionStart === input.selectionEnd;
    if (event.key === "ArrowLeft" && collapsed && input.selectionStart === 0 && ci > 0) {
      event.preventDefault();
      focusCell(ri, ci - 1);
    } else if (event.key === "ArrowRight" && collapsed && input.selectionStart === input.value.length && ci < draft.columns.length - 1) {
      event.preventDefault();
      focusCell(ri, ci + 1);
    }
  };

  /* Pegar: nunca directo. Primero la vista previa de lo que se va a pegar. */
  const onCellPaste = (event: ClipboardEvent<HTMLInputElement>, ri: number, ci: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
    event.preventDefault();
    const grid = parsePaste(text);
    if (!grid.length) return;
    setPaste({ grid, atRow: ri, atColumn: ci, header: false, replace: false });
  };
  const openPasteFromText = (replace: boolean) => {
    const grid = parsePaste(pasteText);
    if (!grid.length) return;
    const kept = draft.rows.filter((row) => !isBlankRow(row));
    if (!replace) change({ ...draft, rows: kept });
    setPaste({ grid, atRow: replace ? 0 : kept.length, atColumn: 0, header: replace && looksLikeHeader(grid), replace });
  };
  const confirmPaste = () => {
    if (!paste) return;
    const next = applyPaste(draft, paste);
    change(next);
    setPasted(`${plural(paste.grid.length - (paste.header ? 1 : 0), "fila pegada", "filas pegadas")}. Nada se guarda hasta pulsar Guardar.`);
    setPaste(null);
    setPasteText("");
    setActive(null);
    setAdjusting(null);
  };

  const apply = () => {
    setConfirming(false);
    save.mutate({
      periodId,
      kind: pasted ? "pegado" : "rejilla",
      set: {
        id: set.id,
        report_id: set.report_id,
        title: draft.meta.title.trim(),
        description: draft.meta.description.trim(),
        office_id: draft.meta.officeId || null,
        columns: output.columns,
        views: set.views.some((v) => v.key === viewKey) ? set.views.map((v) => (v.key === viewKey ? output.view : v)) : [...set.views, output.view],
      },
      rows: output.rows,
    });
  };

  const activeRow = active ? draft.rows.find((r) => r.id === active.row) : undefined;
  const activeColumnIndex = active ? draft.columns.findIndex((c) => c.id === active.column) : -1;
  const activeColumn = activeColumnIndex >= 0 ? draft.columns[activeColumnIndex] : undefined;
  const adjustingIndex = draft.columns.findIndex((c) => c.id === adjusting);
  const toneAt = (row: DraftRow, ci: number) => {
    const stored = output.rowOf.get(row.id);
    return stored ? cellTone(output.view.table, output.columns[ci], stored as FreeRow) : null;
  };
  const previewRows = output.rows as FreeRow[];
  const kept = draft.rows.filter((row) => !isBlankRow(row));
  const filledIn = (column: DraftColumn) => draft.rows.filter((r) => (r.cells[column.id] ?? "").trim()).length;

  return (
    <>
      <Panel
        id="oda-tabla-personalizada"
        title={draft.meta.title.trim() || "Tabla personalizada"}
        description="Textos, cifras y categorías en la misma tabla, con color por reglas o a mano. Lo que escribas aquí es lo que se ve: el portal no calcula ni filtra nada de esta tabla."
        actions={
          <>
            <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />
            {dirty && (
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  change(initial);
                  setPasted(null);
                  setPaste(null);
                  setActive(null);
                  setAdjusting(null);
                }}
              >
                Descartar
              </button>
            )}
            {canEdit && (
              <ConfirmButton
                label="Borrar tabla"
                subject={`la tabla «${set.title}»`}
                confirmLabel={`Se borran sus ${plural(rows.length, "fila", "filas")} y su bloque sale de ${published ? "la ficha publicada" : "la ficha"}.`}
                onConfirm={() => remove.mutate({ table: "od_free_sets", id: set.id })}
              />
            )}
          </>
        }
      >
        <div className="oda-ct od-tones">
          {/* --- Ficha de la tabla --- */}
          <div className="oda-form-grid">
            <label className="admin-field">
              <span>Título</span>
              <input value={draft.meta.title} readOnly={!canEdit} onChange={(e) => patchMeta({ title: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>Corte o periodo de la tabla</span>
              <input
                value={draft.meta.cut}
                readOnly={!canEdit}
                placeholder="2025-2 · Corte a 30 de junio de 2026"
                aria-describedby="oda-ct-corte"
                aria-invalid={!draft.meta.cut.trim() || undefined}
                onChange={(e) => patchMeta({ cut: e.target.value })}
              />
              <small id="oda-ct-corte" className="oda-field-hint">
                Es un rótulo que escribes tú. Esta tabla no se filtra sola: cuando alguien elige otro periodo en la ficha,
                la tabla sigue mostrando lo mismo, con este corte a la vista. Para actualizarla, edítala y cambia el corte.
              </small>
            </label>
            <label className="admin-field admin-field--wide">
              <span>
                Descripción <small>opcional</small>
              </span>
              <input value={draft.meta.description} readOnly={!canEdit} placeholder="Qué reúne la tabla" onChange={(e) => patchMeta({ description: e.target.value })} />
            </label>
            <label className="admin-field admin-field--wide">
              <span>
                Nota al pie <small>opcional</small>
              </span>
              <textarea rows={2} value={draft.meta.note} readOnly={!canEdit} placeholder="Cómo se lee, qué no incluye" onChange={(e) => patchMeta({ note: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>
                Fuente <small>opcional</small>
              </span>
              <input value={draft.meta.source} readOnly={!canEdit} placeholder="SNIES · Registro y Control" onChange={(e) => patchMeta({ source: e.target.value })} />
              <small className="oda-field-hint">Si la dejas vacía, la tabla dice la oficina que reporta.</small>
            </label>
            <label className="admin-field">
              <span>Oficina que reporta</span>
              <select value={draft.meta.officeId} disabled={!canEdit} onChange={(e) => patchMeta({ officeId: e.target.value })}>
                <option value="">Sin oficina</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="oda-inline-check admin-field--wide">
              <input type="checkbox" checked={draft.meta.rowHeader} disabled={!canEdit} onChange={(e) => patchMeta({ rowHeader: e.target.checked })} />
              <span>
                La primera columna rotula cada fila <small>va en negrita y los lectores de pantalla la anuncian con cada celda</small>
              </span>
            </label>
          </div>

          {/* --- Pegar desde Excel --- */}
          <details className="oda-paste">
            <summary>
              <Icon name="table" size={15} /> Pegar una tabla de Excel
            </summary>
            <div className="oda-paste__body">
              <p className="oda-muted">
                Copia el rango en Excel y pégalo aquí para llenar la tabla de una vez, o pega directamente sobre una casilla
                de la rejilla para llenar desde ahí. En los dos casos verás primero cómo se va a leer cada celda.
              </p>
              <textarea
                className="oda-paste__area"
                aria-label="Rango copiado de Excel"
                placeholder="Pega aquí (Ctrl+V)."
                value={pasteText}
                disabled={!canEdit}
                rows={pasteText ? 4 : 3}
                spellCheck={false}
                onChange={(e) => setPasteText(e.target.value)}
              />
              {pasteText.trim() && (
                <div className="oda-paste__actions">
                  <button type="button" className="button-secondary" onClick={() => openPasteFromText(true)}>
                    Ver cómo queda: reemplazar toda la tabla
                  </button>
                  <button type="button" className="button-ghost" onClick={() => openPasteFromText(false)}>
                    Ver cómo queda: añadir al final
                  </button>
                </div>
              )}
            </div>
          </details>

          {paste && <PastePreview draft={draft} request={paste} onChange={setPaste} onCancel={() => setPaste(null)} onConfirm={confirmPaste} />}
          {pasted && !paste && (
            <p className="oda-import__ok" role="status">
              <Icon name="check" size={14} /> {pasted}
            </p>
          )}

          {/* --- La celda enfocada: color a mano y valores de la lista --- */}
          <div className="oda-ct__bar" aria-live="polite">
            {activeRow && activeColumn && activeRow.kind !== "grupo" ? (
              <>
                <strong>
                  Fila {draft.rows.indexOf(activeRow) + 1} · {activeColumn.label.trim() || `Columna ${activeColumnIndex + 1}`}
                </strong>
                <label className="oda-grid-toolbar__field">
                  <span>Color de la celda</span>
                  <select
                    value={activeRow.tones[activeColumn.id] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const { [activeColumn.id]: _old, ...rest } = activeRow.tones;
                      void _old;
                      patchRow(activeRow.id, { tones: e.target.value ? { ...rest, [activeColumn.id]: e.target.value as ManualTone } : rest });
                    }}
                  >
                    <option value="">Según la regla o la fila</option>
                    <option value="ninguno">Sin color (aunque haya regla)</option>
                    <ToneOptions labels={labels} />
                  </select>
                </label>
                {(() => {
                  const tone = toneAt(activeRow, activeColumnIndex);
                  return (
                    <span className="oda-muted">
                      {tone
                        ? `Ahora: ${tone.glyph} ${tone.label} (${tone.by === "celda" ? "puesto a mano en la celda" : tone.by === "fila" ? "por el color de la fila" : "por la regla de la columna"})`
                        : "Ahora: sin color"}
                    </span>
                  );
                })()}
                {activeColumn.kind === "categoria" && cleanOptions(activeColumn.options).length > 0 && (
                  <span className="oda-ct__options" role="group" aria-label={`Valores de ${activeColumn.label}`}>
                    {cleanOptions(activeColumn.options).map((option) => (
                      <button key={option} type="button" className="oda-ct__option" disabled={!canEdit} onClick={() => setCell(activeRow.id, activeColumn.id, option)}>
                        {option}
                      </button>
                    ))}
                  </span>
                )}
              </>
            ) : (
              <span className="oda-muted">
                Haz clic en una casilla para escribir. Flechas, Enter y Tab se mueven como en Excel; con una casilla enfocada
                puedes darle un color a mano, que manda sobre la regla de su columna.
              </span>
            )}
          </div>

          {adjustingIndex >= 0 && (
            <ColumnPanel
              key={draft.columns[adjustingIndex].id}
              column={draft.columns[adjustingIndex]}
              index={adjustingIndex}
              count={draft.columns.length}
              filled={filledIn(draft.columns[adjustingIndex])}
              used={Array.from(new Set(draft.rows.filter((r) => r.kind !== "grupo").map((r) => (r.cells[draft.columns[adjustingIndex].id] ?? "").trim()).filter(Boolean)))}
              labels={labels}
              canEdit={canEdit}
              onPatch={(patch) => patchColumn(draft.columns[adjustingIndex].id, patch)}
              onMove={(delta) => moveColumn(adjustingIndex, delta)}
              onRemove={() => removeColumn(draft.columns[adjustingIndex].id)}
              onClose={() => setAdjusting(null)}
            />
          )}

          {/* --- La rejilla --- */}
          <div className="oda-grid-wrap" data-overflow role="region" aria-label={`Rejilla de ${draft.meta.title || "la tabla"}, desplazable`} tabIndex={-1}>
            <table className="oda-grid oda-free-grid oda-ct__grid">
              <caption className="sr-only">Rejilla de edición de {draft.meta.title || "la tabla"}</caption>
              <thead>
                <tr>
                  <th scope="col">Fila</th>
                  {draft.columns.map((column, ci) => (
                    <th key={column.id} scope="col" data-kind={column.kind === "numero" ? "cifra" : "texto"} data-adjusting={adjusting === column.id || undefined}>
                      <input
                        ref={(node) => {
                          if (node) refs.current.set(`col|${column.id}`, node);
                          else refs.current.delete(`col|${column.id}`);
                        }}
                        className="oda-ct__colname"
                        value={column.label}
                        readOnly={!canEdit}
                        placeholder={`Columna ${ci + 1}`}
                        aria-label={`Nombre de la columna ${ci + 1}`}
                        aria-invalid={!column.label.trim() || undefined}
                        onChange={(e) => patchColumn(column.id, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        className="oda-link-button"
                        aria-expanded={adjusting === column.id}
                        onClick={() => setAdjusting(adjusting === column.id ? null : column.id)}
                      >
                        <span className="sr-only">Ajustar la columna {column.label || ci + 1}: </span>
                        {CUSTOM_KIND_LABEL[column.kind].split(" ")[0]}
                        {column.kind === "numero" && column.unit.trim() ? ` · ${column.unit.trim()}` : ""}
                        {(column.kind === "numero" ? column.rules.length : Object.keys(column.optionTones).length) > 0 ? " · con color" : ""}
                        <span aria-hidden="true"> · Ajustar</span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Color, orden y borrado de la fila</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, ri) => {
                  const named = `la fila ${ri + 1}`;
                  return (
                    <tr key={row.id} data-row-kind={row.kind}>
                      <th scope="row">
                        <span className="oda-free-grid__pos">{ri + 1}</span>
                        <select
                          className="oda-free-grid__kind"
                          value={row.kind}
                          disabled={!canEdit}
                          aria-label={`Tipo de la fila ${ri + 1}`}
                          onChange={(e) => patchRow(row.id, { kind: e.target.value as FreeRowKind })}
                        >
                          {(Object.keys(ROW_KIND_LABEL) as FreeRowKind[]).map((kind) => (
                            <option key={kind} value={kind}>
                              {ROW_KIND_LABEL[kind]}
                            </option>
                          ))}
                        </select>
                      </th>
                      {row.kind === "grupo" ? (
                        <td className="oda-free-grid__label" colSpan={draft.columns.length} data-error={!row.label.trim() || undefined}>
                          <input
                            ref={(node) => {
                              if (node) refs.current.set(`${row.id}|label`, node);
                              else refs.current.delete(`${row.id}|label`);
                            }}
                            value={row.label}
                            readOnly={!canEdit}
                            aria-label={`Fila ${ri + 1}, título`}
                            aria-invalid={!row.label.trim() || undefined}
                            placeholder="Ciencias de la Salud"
                            onChange={(e) => patchRow(row.id, { label: e.target.value })}
                            onKeyDown={(e) => onKeyDown(e, ri, 0)}
                          />
                          <small>Título: abre un tramo de la tabla, a todo el ancho.</small>
                        </td>
                      ) : (
                        draft.columns.map((column, ci) => {
                          const text = row.cells[column.id] ?? "";
                          const error = output.cellErrors.get(`${row.id}|${column.id}`);
                          const tone = toneAt(row, ci);
                          const refKey = `${row.id}|${column.id}`;
                          return (
                            <td
                              key={refKey}
                              data-kind={column.kind === "numero" ? "cifra" : "texto"}
                              data-empty={!text.trim() || undefined}
                              data-error={error ? true : undefined}
                              data-tone={error ? undefined : tone?.tone}
                              data-active={(active?.row === row.id && active.column === column.id) || undefined}
                              title={error}
                            >
                              {tone && !error && (tone.by !== "fila" || ci === 0) && (
                                <span className="oda-ct__glyph" aria-hidden="true">
                                  {tone.glyph}
                                </span>
                              )}
                              <input
                                ref={(node) => {
                                  if (node) refs.current.set(refKey, node);
                                  else refs.current.delete(refKey);
                                }}
                                value={text}
                                readOnly={!canEdit}
                                inputMode={column.kind === "numero" ? "decimal" : undefined}
                                aria-label={`Fila ${ri + 1}${row.kind === "total" ? " (total)" : ""}, ${column.label || `columna ${ci + 1}`}${tone ? `, ${tone.label}` : ""}`}
                                aria-invalid={error ? true : undefined}
                                placeholder="sin dato"
                                onFocus={() => setActive({ row: row.id, column: column.id })}
                                onChange={(e) => setCell(row.id, column.id, e.target.value)}
                                onBlur={(e) => {
                                  // La lista manda la ortografía: «cumple» pasa a «Cumple».
                                  if (column.kind !== "categoria") return;
                                  const option = optionOf(toColumn(column), e.target.value);
                                  if (option && option !== e.target.value) setCell(row.id, column.id, option);
                                }}
                                onKeyDown={(e) => onKeyDown(e, ri, ci)}
                                onPaste={(e) => onCellPaste(e, ri, ci)}
                              />
                            </td>
                          );
                        })
                      )}
                      <td className="oda-free-grid__tools oda-ct__tools">
                        {row.kind !== "grupo" && (
                          <select
                            className="oda-free-grid__kind"
                            value={row.tone ?? ""}
                            disabled={!canEdit}
                            aria-label={`Color de ${named}`}
                            onChange={(e) => patchRow(row.id, { tone: (e.target.value || null) as ToneId | null })}
                          >
                            <option value="">Fila sin color</option>
                            <ToneOptions labels={labels} />
                          </select>
                        )}
                        <button type="button" className="icon-button" aria-label={`Subir ${named}`} disabled={!canEdit || ri === 0} onClick={() => moveRow(ri, -1)}>
                          <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Bajar ${named}`} disabled={!canEdit || ri === draft.rows.length - 1} onClick={() => moveRow(ri, 1)}>
                          <Icon name="chevron-down" size={14} />
                        </button>
                        <button
                          type="button"
                          className="oda-link-button"
                          disabled={!canEdit || draft.rows.length >= MAX_ROWS}
                          onClick={() => {
                            const next = [...draft.rows];
                            next.splice(ri + 1, 0, { ...row, id: newId("fila"), cells: { ...row.cells }, tones: { ...row.tones } });
                            change({ ...draft, rows: next });
                          }}
                        >
                          <span className="sr-only">Duplicar {named}</span>
                          <span aria-hidden="true">Duplicar</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Quitar ${named}`}
                          disabled={!canEdit}
                          onClick={() => change({ ...draft, rows: draft.rows.length > 1 ? draft.rows.filter((r) => r.id !== row.id) : [emptyRow()] })}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="oda-grid-toolbar">
            <button type="button" className="button-secondary" disabled={!canEdit || draft.rows.length >= MAX_ROWS} onClick={() => addRow("dato")}>
              <Icon name="plus" size={15} /> Añadir fila
            </button>
            <button type="button" className="button-ghost" disabled={!canEdit || draft.rows.length >= MAX_ROWS} onClick={() => addRow("grupo")}>
              <Icon name="plus" size={15} /> Añadir título
            </button>
            <button type="button" className="button-ghost" disabled={!canEdit || draft.rows.length >= MAX_ROWS} onClick={() => addRow("total")}>
              <Icon name="plus" size={15} /> Añadir fila de totales
            </button>
            <span className="oda-grid-toolbar__group">
              <span className="oda-grid-toolbar__label">Añadir columna:</span>
              {(Object.keys(CUSTOM_KIND_LABEL) as CustomKind[]).map((kind) => (
                <button key={kind} type="button" className="button-ghost" disabled={!canEdit || draft.columns.length >= MAX_COLUMNS} onClick={() => addColumn(kind)}>
                  {CUSTOM_KIND_LABEL[kind].split(" ")[0]}
                </button>
              ))}
            </span>
            <span className="oda-muted">
              {plural(kept.length, "fila", "filas")} · {plural(draft.columns.length, "columna", "columnas")} · máximo {MAX_ROWS} × {MAX_COLUMNS}
            </span>
          </div>
          <p className="oda-form-note">
            Una casilla vacía se publica como «sin dato», nunca como 0. La fila de totales se escribe a mano: el portal no
            suma ni promedia nada de esta tabla.
          </p>

          <ToneNames labels={labels} canEdit={canEdit} onChange={(next) => patchMeta({ labels: next })} />

          <PasteMessages errors={output.errors} warnings={[]} />

          <footer className="oda-import__apply">
            <p>
              <Icon name="alert" size={15} />
              <span>
                Guardar <strong>reemplaza la tabla entera</strong> por lo que hay en la rejilla.
                {output.errors.length > 0 ? " Corrige lo marcado para poder guardar." : ""}
                {published ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
              </span>
            </p>
            <div className="oda-import__actions">
              {!published || !confirming || !canSave ? (
                <button type="button" className="button-primary" disabled={!canSave} onClick={() => (published ? setConfirming(true) : apply())}>
                  Guardar la tabla
                </button>
              ) : (
                <span className="oda-confirm" role="group" aria-label="Confirmar el cambio en el portal">
                  <span>«{draft.meta.title.trim()}» cambia en el portal ahora mismo.</span>
                  <button type="button" className="button-primary" onClick={apply}>
                    Sí, publicar el cambio
                  </button>
                  <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                    Cancelar
                  </button>
                </span>
              )}
            </div>
          </footer>
        </div>
      </Panel>

      <Panel
        id="oda-tabla-personalizada-vista"
        title="Así se verá en el portal"
        description="La misma tabla que pinta la ficha, con lo que hay ahora en la rejilla (guardado o no). La leyenda sale sola de las reglas y de lo coloreado a mano."
        tone="quiet"
      >
        {previewRows.length && output.columns.length ? (
          <div className="oda-ct__preview">
            <CustomTableView
              title={draft.meta.title.trim() || "Tabla personalizada"}
              columns={output.columns}
              rows={previewRows}
              table={output.view.table!}
              fallbackSource={offices.find((o) => o.id === draft.meta.officeId)?.name}
            />
          </div>
        ) : (
          <p className="oda-muted">Escribe al menos una fila para ver la tabla.</p>
        )}
      </Panel>
    </>
  );
}

/* --- Ajustes de una columna: tipo, formato y reglas de color ---------------------------- */

function ColumnPanel({ column, index, count, filled, used, labels, canEdit, onPatch, onMove, onRemove, onClose }: {
  column: DraftColumn;
  index: number;
  count: number;
  /** Casillas con algo escrito en la columna. */
  filled: number;
  /** Lo escrito en la columna, sin repetir. */
  used: string[];
  labels: Draft["meta"]["labels"];
  canEdit: boolean;
  onPatch: (patch: Partial<DraftColumn>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const name = column.label.trim() || `Columna ${index + 1}`;
  const options = cleanOptions(column.options);
  const stored = toColumn(column);
  const missing = column.kind === "categoria" ? used.filter((text) => !optionOf(stored, text)) : [];
  const patchRule = (id: string, patch: Partial<DraftRule>) => onPatch({ rules: column.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const addRule = (op: DraftRule["op"], tone: ToneId) => ({ id: newId("regla"), op, a: "", b: "", tone });

  return (
    <section className="oda-ct__column" aria-label={`Ajustes de la columna ${name}`}>
      <header>
        <strong>Columna «{name}»</strong>
        <span className="oda-ct__column-tools">
          <button type="button" className="oda-link-button" disabled={!canEdit || index === 0} onClick={() => onMove(-1)}>
            ← Mover a la izquierda
          </button>
          <button type="button" className="oda-link-button" disabled={!canEdit || index === count - 1} onClick={() => onMove(1)}>
            Mover a la derecha →
          </button>
          {canEdit &&
            (filled > 0 ? (
              <ConfirmButton
                label="Quitar columna"
                subject={`la columna «${name}»`}
                confirmLabel={`Se ${filled === 1 ? "pierde su casilla" : `pierden sus ${filled} casillas`} con dato y sus reglas de color. Nada cambia en el portal hasta guardar.`}
                onConfirm={onRemove}
              />
            ) : (
              <button type="button" className="oda-link-button" data-tone="danger" disabled={count === 1} onClick={onRemove}>
                Quitar columna
              </button>
            ))}
          <button type="button" className="oda-link-button" onClick={onClose}>
            Cerrar
          </button>
        </span>
      </header>

      <div className="oda-ct__column-fields">
        <label className="oda-inline-field">
          <span>Tipo</span>
          <select value={column.kind} disabled={!canEdit} onChange={(e) => onPatch({ kind: e.target.value as CustomKind })}>
            {(Object.keys(CUSTOM_KIND_LABEL) as CustomKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {CUSTOM_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        {column.kind === "numero" && (
          <>
            <label className="oda-inline-field">
              <span>Decimales</span>
              <select value={column.decimals} disabled={!canEdit} onChange={(e) => onPatch({ decimals: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="oda-inline-field">
              <span>Unidad o sufijo</span>
              <input value={column.unit} readOnly={!canEdit} placeholder="%, estudiantes, puntos" onChange={(e) => onPatch({ unit: e.target.value })} />
            </label>
          </>
        )}
        {column.kind === "categoria" && (
          <label className="oda-inline-field oda-inline-field--wide">
            <span>Valores de la lista, uno por línea</span>
            <textarea
              rows={Math.max(3, column.options.length + 1)}
              value={column.options.join("\n")}
              readOnly={!canEdit}
              placeholder={"Cumple\nEn proceso\nNo cumple"}
              onChange={(e) => onPatch({ options: e.target.value.split("\n") })}
            />
          </label>
        )}
      </div>
      {column.kind === "numero" && (
        <p className="oda-field-hint">
          Una unidad corta («%», «pp») acompaña a cada cifra; una larga («estudiantes») va una vez, bajo el nombre de la columna.
        </p>
      )}
      {missing.length > 0 && (
        <p className="oda-paste__warning" role="note">
          En la tabla hay {missing.length === 1 ? "un valor que no está" : "valores que no están"} en la lista:{" "}
          {missing.map((m) => `«${m}»`).join(", ")}.{" "}
          <button type="button" className="oda-link-button" disabled={!canEdit} onClick={() => onPatch({ options: [...options, ...missing] })}>
            Añadirlos a la lista
          </button>
        </p>
      )}

      <fieldset className="oda-free-fieldset oda-ct__rules">
        <legend>Reglas de color de la columna</legend>
        {column.kind === "texto" && (
          <p className="oda-muted">
            Una columna de texto no tiene reglas: colorea a mano la celda (enfócala y elige su color) o toda la fila.
          </p>
        )}
        {column.kind === "numero" && (
          <>
            {column.rules.length === 0 && <p className="oda-muted">Sin reglas: los números de esta columna no llevan color.</p>}
            <ol>
              {column.rules.map((rule, ri) => (
                <li key={rule.id}>
                  <label className="oda-inline-field">
                    <span>Regla {ri + 1}</span>
                    <select value={rule.op} disabled={!canEdit} onChange={(e) => patchRule(rule.id, { op: e.target.value as DraftRule["op"] })}>
                      {(Object.keys(OP_LABEL) as DraftRule["op"][]).map((op) => (
                        <option key={op} value={op}>
                          {OP_LABEL[op]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="oda-inline-field">
                    <span>{rule.op === "entre" ? "Desde" : "Valor"}</span>
                    <input value={rule.a} inputMode="decimal" readOnly={!canEdit} placeholder="60" onChange={(e) => patchRule(rule.id, { a: e.target.value })} />
                  </label>
                  {rule.op === "entre" && (
                    <label className="oda-inline-field">
                      <span>Hasta menos de</span>
                      <input value={rule.b} inputMode="decimal" readOnly={!canEdit} placeholder="80" onChange={(e) => patchRule(rule.id, { b: e.target.value })} />
                    </label>
                  )}
                  <label className="oda-inline-field">
                    <span>Tono</span>
                    <select value={rule.tone} disabled={!canEdit} onChange={(e) => patchRule(rule.id, { tone: e.target.value as ToneId })}>
                      <ToneOptions labels={labels} />
                    </select>
                  </label>
                  <span className="oda-ct__swatch" data-tone={rule.tone} aria-hidden="true">
                    {TONES[rule.tone].glyph}
                  </span>
                  <button type="button" className="icon-button" aria-label={`Quitar la regla ${ri + 1}`} disabled={!canEdit} onClick={() => onPatch({ rules: column.rules.filter((r) => r.id !== rule.id) })}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ol>
            <div className="oda-paste__actions">
              <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => onPatch({ rules: [...column.rules, addRule("mayor_igual", "bien")] })}>
                <Icon name="plus" size={15} /> Añadir regla
              </button>
              {column.rules.length === 0 && (
                <>
                  <button
                    type="button"
                    className="button-ghost"
                    disabled={!canEdit}
                    onClick={() => onPatch({ rules: [addRule("menor", "riesgo"), addRule("entre", "atencion"), addRule("mayor_igual", "bien")] })}
                  >
                    Semáforo: riesgo, atención, bien
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    disabled={!canEdit}
                    onClick={() => onPatch({ rules: [addRule("menor", "seq-1"), addRule("entre", "seq-2"), addRule("mayor_igual", "seq-3")] })}
                  >
                    Escala: bajo, medio, alto
                  </button>
                </>
              )}
              <small>Se leen en orden: gana la primera que se cumple. Una casilla sin dato no se colorea.</small>
            </div>
          </>
        )}
        {column.kind === "categoria" &&
          (options.length === 0 ? (
            <p className="oda-muted">Escribe primero los valores de la lista.</p>
          ) : (
            <ol>
              {options.map((option) => {
                const tone = Object.entries(column.optionTones).find(([text]) => text.trim().toLowerCase() === option.toLowerCase())?.[1];
                return (
                  <li key={option}>
                    <label className="oda-inline-field">
                      <span>«{option}»</span>
                      <select
                        value={tone ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const rest = Object.fromEntries(Object.entries(column.optionTones).filter(([text]) => text.trim().toLowerCase() !== option.toLowerCase()));
                          onPatch({ optionTones: e.target.value ? { ...rest, [option]: e.target.value as ToneId } : rest });
                        }}
                      >
                        <option value="">Sin color</option>
                        <ToneOptions labels={labels} />
                      </select>
                    </label>
                    {tone && (
                      <span className="oda-ct__swatch" data-tone={tone} aria-hidden="true">
                        {TONES[tone].glyph}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ))}
      </fieldset>
    </section>
  );
}

/* --- Nombres de los tonos ------------------------------------------------------------------ */

function ToneNames({ labels, canEdit, onChange }: { labels: Draft["meta"]["labels"]; canEdit: boolean; onChange: (next: Draft["meta"]["labels"]) => void }) {
  return (
    <details className="oda-paste oda-ct__tones">
      <summary>La paleta y el nombre de cada tono</summary>
      <div className="oda-paste__body">
        <p className="oda-muted">
          Siete tonos fijos, tomados del sistema: se ven igual en claro y en oscuro y pasan contraste. Cada uno lleva su
          glifo, porque ningún dato se comunica solo con color. Aquí puedes darles el nombre que significan en esta tabla
          («Cumple la meta» en vez de «Bien»): es el que sale en la leyenda y en el CSV.
        </p>
        <ul className="oda-ct__tone-list">
          {TONE_ORDER.map((tone) => (
            <li key={tone}>
              <span className="oda-ct__swatch" data-tone={tone} aria-hidden="true">
                {TONES[tone].glyph}
              </span>
              <label className="oda-inline-field">
                <span className="sr-only">Nombre del tono {TONES[tone].label}</span>
                <input value={labels[tone] ?? ""} readOnly={!canEdit} placeholder={TONES[tone].label} onChange={(e) => onChange({ ...labels, [tone]: e.target.value })} />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* --- Vista previa del pegado ---------------------------------------------------------------- */

const PREVIEW_ROWS = 12;

function PastePreview({ draft, request, onChange, onCancel, onConfirm }: {
  draft: Draft;
  request: PasteRequest;
  onChange: (next: PasteRequest) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const plan: PastePlan = previewPaste(draft, request);
  const after = applyPaste(draft, request);
  const base = request.replace ? { columns: [] as DraftColumn[], rows: [] as DraftRow[] } : draft;
  const newColumns = after.columns.length - base.columns.length;
  const newRows = after.rows.length - base.rows.length;
  const nameOf = (target: number) => after.columns[target]?.label.trim() || `Columna ${target + 1}`;
  const from = request.replace ? "desde la primera casilla" : `desde la fila ${request.atRow + 1}, columna «${nameOf(request.atColumn)}»`;

  return (
    <section className="oda-ct__paste" role="region" aria-label="Vista previa de lo que se va a pegar">
      <header>
        <strong>
          {request.replace ? "Reemplazar toda la tabla" : "Pegar"}: {plural(plan.rows.length, "fila", "filas")} × {plural(plan.targets.length, "columna", "columnas")}, {from}
        </strong>
        <label className="oda-inline-check">
          <input type="checkbox" checked={request.header} onChange={(e) => onChange({ ...request, header: e.target.checked })} />
          <span>
            La primera fila trae los nombres de las columnas <small>solo nombra las columnas nuevas; las que ya existen conservan el suyo</small>
          </span>
        </label>
      </header>

      <div className="oda-grid-wrap" data-overflow tabIndex={0} role="region" aria-label="Celdas que se van a pegar, desplazable">
        <table className="oda-grid oda-ct__paste-table">
          <caption className="sr-only">Celdas que se van a pegar, como se leerán</caption>
          <thead>
            <tr>
              <th scope="col">Fila</th>
              {plan.targets.map((target) => (
                <th key={target} scope="col">
                  {nameOf(target)}
                  <small>{target >= base.columns.length ? "columna nueva · " : ""}{CUSTOM_KIND_LABEL[after.columns[target]?.kind ?? "texto"].split(" ")[0].toLowerCase()}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.rows.slice(0, PREVIEW_ROWS).map((line, li) => (
              <tr key={li}>
                <th scope="row">{li + 1}</th>
                {plan.targets.map((target, offset) => {
                  const cell = line[offset];
                  return (
                    <td key={target} data-error={cell.error ? true : undefined} data-blank={cell.raw === "" || undefined} title={cell.error}>
                      {cell.raw === "" ? "sin dato" : cell.raw}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.rows.length > PREVIEW_ROWS && <p className="oda-muted">…y {plural(plan.rows.length - PREVIEW_ROWS, "fila más", "filas más")}.</p>}

      <ul className="oda-ct__paste-notes">
        {newColumns > 0 && <li>Se {newColumns === 1 ? "crea 1 columna" : `crean ${newColumns} columnas`}; su tipo se dedujo de lo pegado y se puede cambiar en «Ajustar».</li>}
        {newRows > 0 && <li>Se {newRows === 1 ? "añade 1 fila" : `añaden ${newRows} filas`} al final.</li>}
        {!request.replace && <li>Lo que ya había en esas casillas se reemplaza; los títulos se saltan.</li>}
        <li>Una celda vacía queda «sin dato», no en 0.</li>
        {plan.errors > 0 && (
          <li data-tone="error">
            {plural(plan.errors, "celda no se pudo leer", "celdas no se pudieron leer")} con el tipo de su columna (en rojo): se pegan tal cual y
            quedan marcadas para corregir antes de guardar.
          </li>
        )}
        {(plan.droppedRows > 0 || plan.droppedColumns > 0) && (
          <li data-tone="error">
            No cabe todo: se {plan.droppedRows + plan.droppedColumns === 1 ? "queda" : "quedan"} fuera{" "}
            {[plan.droppedRows > 0 ? plural(plan.droppedRows, "fila", "filas") : "", plan.droppedColumns > 0 ? plural(plan.droppedColumns, "columna", "columnas") : ""].filter(Boolean).join(" y ")}{" "}
            (el máximo es {MAX_ROWS} × {MAX_COLUMNS}).
          </li>
        )}
      </ul>

      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="button-primary" autoFocus disabled={plan.rows.length === 0} onClick={onConfirm}>
          {request.replace ? "Reemplazar la tabla" : "Pegar"}
        </button>
      </div>
    </section>
  );
}
