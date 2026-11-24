/* =============================================================================
   Conjuntos libres en la intranet: el editor (Captura › Conjuntos libres).

   Quien crea un conjunto libre define su estructura mientras lo llena. Aquí
   está todo en una sola pantalla, para un conjunto nuevo o para uno guardado:
   · la ficha: título, descripción, oficina que reporta y el tiempo (por año,
     por periodo con su rótulo, o sin fecha);
   · la rejilla: el nombre de cada columna arriba, editable, y sus casillas
     debajo. Flechas, Enter y Tab se mueven como en una hoja de cálculo; pegar
     un rango de Excel abre una vista previa antes de tocar nada, y lo pegado
     crea las columnas que falten, con el tipo que se deduce;
   · «Ajustar» en cada columna: tipo, formato, mover, quitar. El tipo orienta,
     no bloquea: lo que no encaja se guarda tal cual y se avisa cuántas
     casillas son y en qué filas;
   · una fila de total se escribe o se calcula, casilla por casilla: la vacía
     enseña en gris lo que calculará el portal.

   Guardar escribe la definición y las filas de una vez. La lógica vive en
   free-set-draft.ts; aquí solo se pinta. La rejilla y sus piezas son las de las
   tablas personalizadas (clases `oda-ct*`); las gráficas del conjunto siguen
   debajo, en FreeViewsEditor.
   ========================================================================== */

import { useId, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdFreeSetRecordRow, OdFreeSetRow, OdValueFormat } from "../../../../types/database";
import { parsePaste } from "../../../datos-abiertos/data/custom-table";
import { COLUMN_KIND_LABEL, TEMPORALITY_LABEL } from "../../../datos-abiertos/data/free-sets";
import type { FreeColumnKind, FreeRowKind, FreeTemporality, FreeTerritory, FreeView } from "../../../datos-abiertos/data/free-sets";
import { formatValue } from "../../../datos-abiertos/data/open-data";
import type { StationProps } from "../OdAdmin";
import {
  applyFreePaste,
  blankFreeDraft,
  buildFreeOutput,
  emptyFreeColumn,
  emptyFreeRow,
  filledIn,
  fillYears,
  freeDraftOf,
  isBlankFreeRow,
  labelColumn,
  looksLikeFreeHeader,
  misfitsOf,
  moveFreeColumn,
  planFreePaste,
  removeFreeColumn,
  rowsText,
  rowsWithoutYear,
  totalPreview,
  viewImpacts,
  viewsUsing,
} from "../free-set-draft";
import type { FreeDraft, FreeDraftColumn, FreeDraftRow, FreePasteRequest } from "../free-set-draft";
import { useSaveFreeSetWithRows } from "../od-data";
import { PasteMessages } from "../PasteTable";
import { ConfirmButton, Panel, SaveState, slugify } from "../ui";
import "./custom-table-editor.css";

const FORMAT_LABEL: Record<OdValueFormat, string> = { entero: "Entero", decimal: "Decimal", porcentaje: "Porcentaje" };
const TERRITORY_LABEL: Record<FreeTerritory, string> = { departamento: "Departamento de Colombia", pais: "País" };
const ROW_KIND_LABEL: Record<FreeRowKind, string> = { dato: "Dato", grupo: "Título de grupo", total: "Total" };
const KINDS = Object.keys(COLUMN_KIND_LABEL) as FreeColumnKind[];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;
/** «Texto», «Cifra»… sin la aclaración entre paréntesis. */
const kindName = (kind: FreeColumnKind) => COLUMN_KIND_LABEL[kind].split(" ")[0];

const uniqueSlug = (text: string, taken: string[]) => {
  const base = slugify(text) || "conjunto";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}-${n}`;
  return key;
};

/** El año es el primer campo de la rejilla en un conjunto anual. */
const YEAR = "anio";

export function FreeSetEditor({ set, rows, start = "blanco", views, takenKeys, position, reportId, offices, periodId, published, canEdit, onCreated, onCancel }: {
  /** El conjunto guardado, o null si se está creando. */
  set: OdFreeSetRow | null;
  rows: OdFreeSetRecordRow[];
  /** Al crear: con una rejilla en blanco o con la caja de pegado abierta. */
  start?: "blanco" | "pegar";
  /** Las gráficas guardadas del conjunto: para decir cuáles toca un cambio de columnas. */
  views: FreeView[];
  /** Claves de los conjuntos del informe: la del nuevo no puede repetir ninguna. */
  takenKeys: string[];
  /** Posición del conjunto nuevo en el informe. */
  position: number;
  reportId: string;
  offices: StationProps["data"]["rows"]["offices"];
  periodId: string;
  published: boolean;
  canEdit: boolean;
  onCreated?: (key: string) => void;
  onCancel?: () => void;
}) {
  const save = useSaveFreeSetWithRows();
  const radioName = useId();

  // Sin dependencias: el editor se monta de nuevo (key) cuando cambia lo guardado.
  const initial = useMemo<FreeDraft>(() => {
    if (!set) return blankFreeDraft(start);
    const stored = freeDraftOf(set, rows);
    return stored.rows.length ? stored : { ...stored, rows: [emptyFreeRow()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [draft, setDraft] = useState<FreeDraft>(initial);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [paste, setPaste] = useState<FreePasteRequest | null>(null);
  const [pasteOpen, setPasteOpen] = useState(!set && start === "pegar");
  const [pasteText, setPasteText] = useState("");
  const [pasted, setPasted] = useState<string | null>(null);
  const [yearToFill, setYearToFill] = useState("");
  const [confirming, setConfirming] = useState(false);
  const refs = useRef(new Map<string, HTMLInputElement>());

  const anual = draft.meta.temporality === "anual";
  const fields = [...(anual ? [YEAR] : []), ...draft.columns.map((column) => column.id)];
  const labelId = labelColumn(draft.columns);

  // Lo que se guardaría, en una cadena: para saber si hay cambios sin guardar. Un conjunto libre puede
  // traer miles de filas, así que el borrador se convierte una sola vez por cambio.
  const fingerprint = (d: FreeDraft, out: ReturnType<typeof buildFreeOutput>) =>
    JSON.stringify([d.meta.title.trim(), d.meta.description.trim(), d.meta.officeId, d.meta.temporality, d.meta.temporality === "periodo" ? d.meta.periodLabel.trim() : "", out.columns, out.rows]);
  const baseline = useMemo(() => fingerprint(initial, buildFreeOutput(initial)), [initial]);
  const output = useMemo(() => buildFreeOutput(draft), [draft]);
  const dirty = useMemo(() => fingerprint(draft, output) !== baseline, [draft, output, baseline]);
  const canSave = canEdit && (dirty || !set) && output.errors.length === 0 && !save.isPending;

  /** Gráficas a las que el cambio les quita algo: las que ya estaban incompletas no se repiten aquí. */
  const impacts = useMemo(() => {
    if (!set) return [];
    const already = new Set(viewImpacts(set, views).map((impact) => impact.view.key));
    const labels = Object.fromEntries(set.columns.map((column) => [column.key, column.label]));
    return viewImpacts({ temporality: draft.meta.temporality, columns: output.columns }, views, labels).filter((impact) => !already.has(impact.view.key));
  }, [set, views, draft.meta.temporality, output.columns]);

  const change = (next: FreeDraft) => {
    setDraft(next);
    setConfirming(false);
  };
  const patchMeta = (patch: Partial<FreeDraft["meta"]>) => change({ ...draft, meta: { ...draft.meta, ...patch } });
  const patchColumn = (id: string, patch: Partial<FreeDraftColumn>) => change({ ...draft, columns: draft.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const patchRow = (id: string, patch: Partial<FreeDraftRow>) => change({ ...draft, rows: draft.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const setField = (row: FreeDraftRow, field: string, text: string) =>
    patchRow(row.id, field === YEAR ? { year: text } : row.kind === "total" && field === labelId ? { label: text } : { cells: { ...row.cells, [field]: text } });

  const addColumn = (kind: FreeColumnKind) => {
    const column = emptyFreeColumn(kind);
    change({ ...draft, columns: [...draft.columns, column], rows: draft.rows.length ? draft.rows : [emptyFreeRow()] });
    setAdjusting(column.id);
    requestAnimationFrame(() => refs.current.get(`col|${column.id}`)?.focus());
  };
  const addRow = (kind: FreeRowKind) => {
    const row = emptyFreeRow(kind);
    change({ ...draft, rows: [...draft.rows, row] });
    requestAnimationFrame(() => refs.current.get(kind === "grupo" ? `${row.id}|label` : `${row.id}|${fields[0]}`)?.focus());
  };
  const moveRow = (index: number, delta: number) => {
    const next = [...draft.rows];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    change({ ...draft, rows: next });
  };

  /* Teclado: como una hoja de cálculo. Tab y Mayús+Tab ya recorren las casillas en orden. */
  const focusCell = (rowIndex: number, fieldIndex: number) => {
    const row = draft.rows[rowIndex];
    const field = fields[Math.max(0, Math.min(fields.length - 1, fieldIndex))];
    if (!row || !field) return;
    const node = refs.current.get(row.kind === "grupo" && field !== YEAR ? `${row.id}|label` : `${row.id}|${field}`);
    node?.focus();
    node?.select();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, ri: number, fi: number) => {
    const input = event.currentTarget;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
      event.preventDefault();
      const up = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey);
      const target = ri + (up ? -1 : 1);
      if (target < 0) return;
      if (target >= draft.rows.length) {
        // Enter en la última fila abre otra, como en Excel.
        if (event.key !== "Enter" || !canEdit) return;
        const row = emptyFreeRow();
        change({ ...draft, rows: [...draft.rows, row] });
        requestAnimationFrame(() => refs.current.get(`${row.id}|${fields[fi]}`)?.focus());
        return;
      }
      focusCell(target, fi);
      return;
    }
    // Izquierda y derecha cambian de casilla solo desde el borde del texto.
    const collapsed = input.selectionStart === input.selectionEnd;
    if (event.key === "ArrowLeft" && collapsed && input.selectionStart === 0 && fi > 0) {
      event.preventDefault();
      focusCell(ri, fi - 1);
    } else if (event.key === "ArrowRight" && collapsed && input.selectionStart === input.value.length && fi < fields.length - 1) {
      event.preventDefault();
      focusCell(ri, fi + 1);
    }
  };

  /* Pegar: nunca directo. Primero la vista previa de lo que se va a pegar. */
  const onCellPaste = (event: ClipboardEvent<HTMLInputElement>, ri: number, fi: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
    event.preventDefault();
    const grid = parsePaste(text);
    if (!grid.length) return;
    setPaste({ grid, atRow: ri, atField: fi, header: false, replace: false });
  };
  const kept = draft.rows.filter((row) => !isBlankFreeRow(row, anual));
  const openPasteFromText = (replace: boolean) => {
    const grid = parsePaste(pasteText);
    if (!grid.length) return;
    if (!replace) change({ ...draft, rows: kept });
    setPaste({ grid, atRow: replace ? 0 : kept.length, atField: 0, header: looksLikeFreeHeader(draft, grid), replace });
  };
  const confirmPaste = () => {
    if (!paste) return;
    const plan = planFreePaste(draft, paste);
    change(applyFreePaste(draft, paste));
    setPasted(`${plural(plan.body.length, "fila pegada", "filas pegadas")}. Revisa los nombres y los tipos de las columnas en la rejilla; nada se guarda hasta pulsar Guardar.`);
    setPaste(null);
    setPasteText("");
    setPasteOpen(false);
    setAdjusting(null);
  };

  const apply = () => {
    setConfirming(false);
    const title = draft.meta.title.trim();
    const key = set ? set.key : uniqueSlug(title, takenKeys);
    save.mutate(
      {
        periodId,
        kind: pasted ? "pegado" : "rejilla",
        set: {
          ...(set ? { id: set.id } : { key, views: [], position }),
          report_id: reportId,
          title,
          description: draft.meta.description.trim(),
          office_id: draft.meta.officeId || null,
          temporality: draft.meta.temporality,
          period_label: draft.meta.temporality === "periodo" ? draft.meta.periodLabel.trim() : "",
          columns: output.columns,
        },
        rows: output.rows,
      },
      { onSuccess: () => { if (!set) onCreated?.(key); } },
    );
  };

  const adjustingIndex = draft.columns.findIndex((c) => c.id === adjusting);
  const adjustingColumn = adjustingIndex >= 0 ? draft.columns[adjustingIndex] : null;
  const missingYears = anual ? rowsWithoutYear(draft) : [];
  const storedRows = set ? rows.length : 0;
  const wasAnnual = set?.temporality === "anual";
  const dataRows = kept.filter((row) => row.kind === "dato").length;

  /** La sugerencia de una casilla vacía de un total: lo que calculará el portal. */
  const computed = (ri: number, ci: number) => {
    const total = totalPreview({ ...output, anual }, ri);
    const column = output.columns[ci];
    const value = total.cells[column.key];
    if (column.kind !== "cifra" || typeof value !== "number") return null;
    return { text: formatValue(value, column.format ?? "entero"), how: `${total.basis[column.key] === "promedio" ? "promedio" : "suma"} de ${plural(total.count, "fila", "filas")}` };
  };

  return (
    <Panel
      id="oda-libre-filas"
      title={set ? draft.meta.title.trim() || set.title : "Nuevo conjunto libre"}
      description="El conjunto y su estructura se definen aquí mismo: ponle título, di cómo lleva el tiempo y arma las columnas mientras escribes o pegas los datos. Puedes agregar, quitar, renombrar, reordenar o cambiar el tipo de una columna cuando quieras, sin perder lo cargado. Vacío es «sin dato», nunca cero."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          {set && dirty && (
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                change(initial);
                setPasted(null);
                setPaste(null);
                setAdjusting(null);
              }}
            >
              Descartar
            </button>
          )}
          {!set && (
            <button type="button" className="button-ghost" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </>
      }
    >
      <div className="oda-ct">
        {/* --- Ficha del conjunto --- */}
        <div className="oda-form-grid">
          <label className="admin-field admin-field--wide">
            <span>Título</span>
            <input
              autoFocus={!set && start === "blanco"}
              value={draft.meta.title}
              readOnly={!canEdit}
              placeholder="Oferta y satisfacción por sede"
              aria-invalid={!draft.meta.title.trim() || undefined}
              onChange={(e) => patchMeta({ title: e.target.value })}
            />
          </label>
          <label className="admin-field admin-field--wide">
            <span>
              Descripción <small>opcional</small>
            </span>
            <input value={draft.meta.description} readOnly={!canEdit} placeholder="Qué reúne la fuente y de dónde sale" onChange={(e) => patchMeta({ description: e.target.value })} />
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
          {draft.meta.temporality === "periodo" && (
            <label className="admin-field">
              <span>Periodo que cubre</span>
              <input value={draft.meta.periodLabel} readOnly={!canEdit} placeholder="2020–2025" onChange={(e) => patchMeta({ periodLabel: e.target.value })} />
            </label>
          )}
          <fieldset className="admin-field--wide oda-free-fieldset oda-free-temporality">
            <legend>Tiempo</legend>
            <div role="radiogroup" aria-label="Cómo lleva el tiempo el conjunto">
              {(Object.keys(TEMPORALITY_LABEL) as FreeTemporality[]).map((value) => (
                <label key={value} className="oda-check">
                  <input type="radio" name={radioName} value={value} checked={draft.meta.temporality === value} disabled={!canEdit} onChange={() => patchMeta({ temporality: value })} />
                  {TEMPORALITY_LABEL[value]}
                </label>
              ))}
            </div>
            {set && storedRows > 0 && set.temporality !== draft.meta.temporality && (
              <small className="oda-field-warning" role="note">
                {wasAnnual
                  ? `Las filas conservan su año guardado, pero el portal deja de usarlo: la ficha ya no filtra ni recorre los años. Si vuelves a «Por año», ahí siguen.`
                  : anual
                    ? "Ahora cada fila lleva su año, en la primera columna de la rejilla. Las que no lo tengan se guardan igual, pero no se ven en el portal al elegir un año."
                    : "Las filas no cambian; solo cambia cómo se rotula el conjunto en el portal."}
              </small>
            )}
            {anual && missingYears.length > 0 && (
              <div className="oda-paste__actions">
                <label className="oda-inline-field">
                  <span>
                    Año para {missingYears.length === 1 ? "la fila que no lo tiene" : `las ${missingYears.length.toLocaleString("es-CO")} filas que no lo tienen`}
                  </span>
                  <input value={yearToFill} inputMode="numeric" placeholder="2025" readOnly={!canEdit} onChange={(e) => setYearToFill(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="button-ghost"
                  disabled={!canEdit || fillYears(draft, yearToFill) === draft}
                  onClick={() => {
                    change(fillYears(draft, yearToFill));
                    setYearToFill("");
                  }}
                >
                  Poner ese año
                </button>
                <small>Las filas que ya tienen año no se tocan.</small>
              </div>
            )}
          </fieldset>
        </div>

        {/* --- Pegar desde Excel --- */}
        <details className="oda-paste" open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
          <summary>
            <Icon name="table" size={15} /> Pegar desde Excel
          </summary>
          <div className="oda-paste__body">
            <p className="oda-muted">
              Copia el rango en Excel, con su fila de encabezados si la tiene, y pégalo aquí. Las columnas que falten se
              crean con el nombre del encabezado y el tipo que se deduce de lo pegado; las que ya existen reciben lo suyo
              por nombre. Antes de aplicar verás cómo queda, y después puedes corregir nombres y tipos en la rejilla.
              También puedes pegar directamente sobre una casilla.
            </p>
            <textarea
              className="oda-paste__area"
              aria-label="Rango copiado de Excel"
              placeholder="Pega aquí (Ctrl+V)."
              value={pasteText}
              disabled={!canEdit}
              autoFocus={!set && start === "pegar"}
              rows={pasteText ? 4 : 3}
              spellCheck={false}
              onChange={(e) => setPasteText(e.target.value)}
            />
            {pasteText.trim() && (
              <div className="oda-paste__actions">
                <button type="button" className="button-secondary" onClick={() => openPasteFromText(true)}>
                  {kept.length ? "Ver cómo queda: reemplazar las filas" : "Ver cómo queda"}
                </button>
                {kept.length > 0 && (
                  <button type="button" className="button-ghost" onClick={() => openPasteFromText(false)}>
                    Ver cómo queda: añadir al final
                  </button>
                )}
              </div>
            )}
          </div>
        </details>

        {paste && <FreePastePreview draft={draft} request={paste} onChange={setPaste} onCancel={() => setPaste(null)} onConfirm={confirmPaste} />}
        {pasted && !paste && (
          <p className="oda-import__ok" role="status">
            <Icon name="check" size={14} /> {pasted}
          </p>
        )}

        {adjustingColumn && (
          <FreeColumnPanel
            key={adjustingColumn.id}
            draft={draft}
            column={adjustingColumn}
            index={adjustingIndex}
            views={views}
            canEdit={canEdit}
            onPatch={(patch) => patchColumn(adjustingColumn.id, patch)}
            onMove={(delta) => change(moveFreeColumn(draft, adjustingColumn.id, delta))}
            onRemove={() => {
              change(removeFreeColumn(draft, adjustingColumn.id));
              setAdjusting(null);
            }}
            onClose={() => setAdjusting(null)}
          />
        )}

        {/* --- La rejilla --- */}
        {draft.columns.length === 0 ? (
          <p className="oda-muted">
            Todavía no hay columnas. Pega una tabla de Excel en la caja de arriba, o añade la primera columna con los botones
            de abajo.
          </p>
        ) : (
          <div className="oda-grid-wrap" data-overflow role="region" aria-label={`Rejilla de ${draft.meta.title || "el conjunto"}, desplazable`} tabIndex={-1}>
            <table className="oda-grid oda-free-grid oda-ct__grid">
              <caption className="sr-only">Rejilla de edición de {draft.meta.title || "el conjunto"}</caption>
              <thead>
                <tr>
                  <th scope="col">Fila</th>
                  {anual && (
                    <th scope="col" data-kind="anio">
                      Año
                    </th>
                  )}
                  {draft.columns.map((column, ci) => (
                    <th key={column.id} scope="col" data-kind={column.kind} data-adjusting={adjusting === column.id || undefined}>
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
                      <button type="button" className="oda-link-button" aria-expanded={adjusting === column.id} onClick={() => setAdjusting(adjusting === column.id ? null : column.id)}>
                        <span className="sr-only">Ajustar la columna {column.label || ci + 1}: </span>
                        {kindName(column.kind)}
                        {column.kind === "cifra" ? ` · ${column.unit.trim() || FORMAT_LABEL[column.format].toLowerCase()}` : ""}
                        <span aria-hidden="true"> · Ajustar</span>
                      </button>
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Mover, duplicar o quitar la fila</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, ri) => {
                  const named = row.label.trim() || `la fila ${ri + 1}`;
                  const blank = isBlankFreeRow(row, anual);
                  const cell = (field: string, fi: number, column: FreeDraftColumn | null, ci: number) => {
                    const refKey = `${row.id}|${field}`;
                    const isLabel = row.kind === "total" && field === labelId;
                    const text = field === YEAR ? row.year : isLabel ? row.label : row.cells[field] ?? "";
                    const error = blank ? undefined : output.cellErrors.get(refKey);
                    const warning = blank || isLabel ? undefined : output.cellWarnings.get(refKey);
                    const hint = row.kind === "total" && column && !isLabel && !text.trim() ? computed(ri, ci) : null;
                    const name = column ? column.label || `columna ${ci + 1}` : "Año";
                    return (
                      <td
                        key={refKey}
                        data-kind={column ? column.kind : "anio"}
                        data-empty={!text.trim() || undefined}
                        data-error={error ? true : undefined}
                        data-warning={!error && warning ? true : undefined}
                        title={error ?? warning ?? (hint ? `Calculado por el portal: ${hint.how}. Escribe aquí para poner tu propia cifra.` : undefined)}
                      >
                        <input
                          ref={(node) => {
                            if (node) refs.current.set(refKey, node);
                            else refs.current.delete(refKey);
                          }}
                          value={text}
                          readOnly={!canEdit}
                          inputMode={field === YEAR ? "numeric" : column?.kind === "cifra" ? "decimal" : undefined}
                          aria-label={`Fila ${ri + 1}${row.kind === "total" ? " (total)" : ""}, ${isLabel ? "rótulo del total" : name}${hint ? `, vacía: el portal calcula ${hint.text}, ${hint.how}` : ""}${warning ? `, aviso: ${warning}` : ""}`}
                          aria-invalid={error ? true : undefined}
                          placeholder={isLabel ? "Total" : hint ? `${hint.text} · calculado` : "—"}
                          onChange={(e) => setField(row, field, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, ri, fi)}
                          onPaste={(e) => onCellPaste(e, ri, fi)}
                        />
                      </td>
                    );
                  };
                  return (
                    <tr key={row.id} data-row-kind={row.kind}>
                      <th scope="row">
                        <span className="oda-free-grid__pos">{ri + 1}</span>
                        <select className="oda-free-grid__kind" value={row.kind} disabled={!canEdit} aria-label={`Tipo de la fila ${ri + 1}`} onChange={(e) => patchRow(row.id, { kind: e.target.value as FreeRowKind })}>
                          {(Object.keys(ROW_KIND_LABEL) as FreeRowKind[]).map((kind) => (
                            <option key={kind} value={kind}>
                              {ROW_KIND_LABEL[kind]}
                            </option>
                          ))}
                        </select>
                      </th>
                      {anual && cell(YEAR, 0, null, -1)}
                      {row.kind === "grupo" ? (
                        <td className="oda-free-grid__label" colSpan={draft.columns.length}>
                          <input
                            ref={(node) => {
                              if (node) refs.current.set(`${row.id}|label`, node);
                              else refs.current.delete(`${row.id}|label`);
                            }}
                            value={row.label}
                            readOnly={!canEdit}
                            aria-label={`Fila ${ri + 1}, título de grupo`}
                            placeholder="Ciencias de la Salud"
                            onChange={(e) => patchRow(row.id, { label: e.target.value })}
                            onKeyDown={(e) => onKeyDown(e, ri, anual ? 1 : 0)}
                          />
                          <small>Título: agrupa las filas que siguen, hasta el próximo título. No entra en las gráficas.</small>
                        </td>
                      ) : (
                        draft.columns.map((column, ci) => cell(column.id, ci + (anual ? 1 : 0), column, ci))
                      )}
                      <td className="oda-free-grid__tools oda-ct__tools">
                        <span className="oda-ct__tools-row">
                          <button type="button" className="icon-button" aria-label={`Subir ${named}`} disabled={!canEdit || ri === 0} onClick={() => moveRow(ri, -1)}>
                            <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                          </button>
                          <button type="button" className="icon-button" aria-label={`Bajar ${named}`} disabled={!canEdit || ri === draft.rows.length - 1} onClick={() => moveRow(ri, 1)}>
                            <Icon name="chevron-down" size={14} />
                          </button>
                          <button
                            type="button"
                            className="oda-link-button"
                            disabled={!canEdit}
                            onClick={() => {
                              const next = [...draft.rows];
                              next.splice(ri + 1, 0, { ...emptyFreeRow(row.kind), year: row.year, label: row.label, cells: { ...row.cells } });
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
                            onClick={() => change({ ...draft, rows: draft.rows.length > 1 ? draft.rows.filter((r) => r.id !== row.id) : [emptyFreeRow()] })}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="oda-grid-toolbar">
          {draft.columns.length > 0 && (
            <>
              <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => addRow("dato")}>
                <Icon name="plus" size={15} /> Añadir fila
              </button>
              <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => addRow("grupo")}>
                <Icon name="plus" size={15} /> Añadir título de grupo
              </button>
              <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => addRow("total")}>
                <Icon name="plus" size={15} /> Añadir total
              </button>
            </>
          )}
          <span className="oda-grid-toolbar__group">
            <span className="oda-grid-toolbar__label">Añadir columna:</span>
            {KINDS.map((kind) => (
              <button key={kind} type="button" className="button-ghost" disabled={!canEdit} onClick={() => addColumn(kind)}>
                {kindName(kind)}
              </button>
            ))}
          </span>
          <span className="oda-muted">
            {plural(dataRows, "fila con datos", "filas con datos")}
            {kept.length > dataRows ? ` · ${plural(kept.length - dataRows, "título o total", "títulos y totales")}` : ""} · {plural(draft.columns.length, "columna", "columnas")}
          </span>
        </div>
        <p className="oda-form-note">
          El tipo de una columna orienta, no bloquea: lo que no encaje se guarda como lo escribiste y queda marcado en
          ámbar. En una fila de total, la casilla vacía muestra en gris lo que calculará el portal (suma en enteros,
          promedio en decimales y porcentajes); escribe encima para poner tu propia cifra, y bórrala para volver a la
          calculada.
        </p>

        {impacts.length > 0 && (
          <ul className="oda-paste__warning" aria-live="polite">
            {impacts.map(({ view, problems }) => (
              <li key={view.key}>
                La gráfica «{view.title}» queda incompleta con este cambio: {problems.join(" ")} No se borra: queda marcada abajo, en las gráficas del conjunto, hasta que la ajustes.
              </li>
            ))}
          </ul>
        )}

        <PasteMessages errors={output.errors} warnings={output.warnings} />

        <footer className="oda-import__apply">
          <p>
            <Icon name="alert" size={15} />
            <span>
              {set ? (
                <>
                  Guardar escribe el conjunto entero: su título, su tiempo, sus columnas y <strong>todas sus filas</strong>, como están en la rejilla.
                </>
              ) : (
                "El conjunto se crea con lo que hay en la rejilla y entra a la ficha como bloque. No muestra nada en el portal hasta que le crees una gráfica, aquí debajo."
              )}
              {output.errors.length > 0 ? " Corrige lo marcado en rojo para poder guardar." : output.warnings.length > 0 ? " Los avisos en ámbar no impiden guardar." : ""}
              {published && set ? " El informe está publicado: el cambio se ve en el portal de inmediato." : ""}
            </span>
          </p>
          <div className="oda-import__actions">
            {!set || !published || !confirming || !canSave ? (
              <button type="button" className="button-primary" disabled={!canSave} onClick={() => (set && published ? setConfirming(true) : apply())}>
                {set ? `Guardar ${plural(output.rows.length, "fila", "filas")}` : "Crear conjunto libre"}
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
  );
}

/* --- Ajustes de una columna: tipo, formato, orden y borrado ------------------------------ */

function FreeColumnPanel({ draft, column, index, views, canEdit, onPatch, onMove, onRemove, onClose }: {
  draft: FreeDraft;
  column: FreeDraftColumn;
  index: number;
  views: FreeView[];
  canEdit: boolean;
  onPatch: (patch: Partial<FreeDraftColumn>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const name = column.label.trim() || `Columna ${index + 1}`;
  const filled = filledIn(draft, column.id);
  const using = viewsUsing(views, column.key);
  const misfits = misfitsOf(draft, column.id);
  const usingText = using.map((v) => `«${v.title}»`).join(", ");

  return (
    <section className="oda-ct__column" aria-label={`Ajustes de la columna ${name}`}>
      <header>
        <strong>Columna «{name}»</strong>
        <span className="oda-ct__column-tools">
          <button type="button" className="oda-link-button" disabled={!canEdit || index === 0} onClick={() => onMove(-1)}>
            ← Mover a la izquierda
          </button>
          <button type="button" className="oda-link-button" disabled={!canEdit || index === draft.columns.length - 1} onClick={() => onMove(1)}>
            Mover a la derecha →
          </button>
          {canEdit &&
            (filled > 0 || using.length > 0 ? (
              <ConfirmButton
                label="Quitar columna"
                subject={`la columna «${name}»`}
                confirmLabel={[
                  filled > 0 ? `Se ${filled === 1 ? "pierde su casilla" : `pierden sus ${filled.toLocaleString("es-CO")} casillas`} con dato.` : "",
                  using.length > 0 ? `${using.length === 1 ? "La gráfica" : "Las gráficas"} ${usingText} ${using.length === 1 ? "queda" : "quedan"} sin ella: no se ${using.length === 1 ? "borra" : "borran"}, ${using.length === 1 ? "queda marcada" : "quedan marcadas"} con lo que les falta.` : "",
                  "Nada cambia en el portal hasta guardar.",
                ].filter(Boolean).join(" ")}
                onConfirm={onRemove}
              />
            ) : (
              <button type="button" className="oda-link-button" data-tone="danger" onClick={onRemove}>
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
          <select value={column.kind} disabled={!canEdit} onChange={(e) => onPatch({ kind: e.target.value as FreeColumnKind })}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {COLUMN_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        {column.kind === "cifra" && (
          <>
            <label className="oda-inline-field">
              <span>Formato</span>
              <select value={column.format} disabled={!canEdit} onChange={(e) => onPatch({ format: e.target.value as OdValueFormat })}>
                {(Object.keys(FORMAT_LABEL) as OdValueFormat[]).map((format) => (
                  <option key={format} value={format}>
                    {FORMAT_LABEL[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="oda-inline-field">
              <span>Unidad</span>
              <input value={column.unit} readOnly={!canEdit} placeholder="estudiantes, %, puntos" onChange={(e) => onPatch({ unit: e.target.value })} />
            </label>
          </>
        )}
        {column.kind === "territorio" && (
          <label className="oda-inline-field">
            <span>Territorio</span>
            <select value={column.territory} disabled={!canEdit} onChange={(e) => onPatch({ territory: e.target.value as FreeTerritory })}>
              {(Object.keys(TERRITORY_LABEL) as FreeTerritory[]).map((t) => (
                <option key={t} value={t}>
                  {TERRITORY_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="oda-field-hint">
        Texto da las categorías (sede, programa); cifra, los números que se dibujan; fecha, el inicio y el fin de un Gantt;
        territorio, el departamento o el país de un mapa. El nombre se cambia arriba, en la rejilla
        {column.key ? `: renombrarla no rompe nada, porque sus casillas y sus gráficas la siguen por su clave («${column.key}»)` : ""}.
      </p>
      {misfits.length > 0 ? (
        <p className="oda-paste__warning" role="status">
          {plural(misfits.length, "casilla no encaja", "casillas no encajan")} con «{kindName(column.kind)}» ({rowsText(misfits.map((m) => m.row))}
          ): {misfits.slice(0, 4).map((m) => `«${m.text}»`).join(", ")}
          {misfits.length > 4 ? "…" : ""}. Se {misfits.length === 1 ? "guarda" : "guardan"} tal cual y {misfits.length === 1 ? "queda marcada" : "quedan marcadas"} en ámbar; puedes seguir.
        </p>
      ) : (
        filled > 0 && (
          <p className="oda-field-hint" role="status">
            Sus {plural(filled, "casilla con dato encaja", "casillas con dato encajan")} con «{kindName(column.kind)}».
          </p>
        )
      )}
      {using.length > 0 && (
        <p className="oda-field-hint">
          La {using.length === 1 ? "usa la gráfica" : "usan las gráficas"} {usingText}: si le cambias el tipo, puede que {using.length === 1 ? "quede" : "queden"} incompleta{using.length === 1 ? "" : "s"}; se avisa antes de guardar.
        </p>
      )}
    </section>
  );
}

/* --- Vista previa del pegado ---------------------------------------------------------------- */

const PREVIEW_ROWS = 12;

function FreePastePreview({ draft, request, onChange, onCancel, onConfirm }: {
  draft: FreeDraft;
  request: FreePasteRequest;
  onChange: (next: FreePasteRequest) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const plan = planFreePaste(draft, request);
  const created = plan.targets.filter((target) => target.to === "nueva").length;
  const misfits = plan.misfits.reduce((a, b) => a + b, 0);
  const kindOf = (target: (typeof plan.targets)[number]) => (target.to === "anio" ? "año" : kindName(target.to === "columna" ? target.kind : target.column.kind).toLowerCase());

  return (
    <section className="oda-ct__paste" role="region" aria-label="Vista previa de lo que se va a pegar">
      <header>
        <strong>
          {request.replace ? "Reemplazar las filas" : "Pegar"}: {plural(plan.body.length, "fila", "filas")} × {plural(plan.targets.length, "columna", "columnas")}
          {request.replace ? "" : `, desde la fila ${request.atRow + 1}`}
        </strong>
        <label className="oda-inline-check">
          <input type="checkbox" checked={request.header} onChange={(e) => onChange({ ...request, header: e.target.checked })} />
          <span>
            La primera fila trae los nombres de las columnas <small>cada una va a la columna que se llama igual; las que no existen se crean</small>
          </span>
        </label>
      </header>

      <div className="oda-grid-wrap" data-overflow tabIndex={0} role="region" aria-label="Celdas que se van a pegar, desplazable">
        <table className="oda-grid oda-ct__paste-table">
          <caption className="sr-only">Celdas que se van a pegar, con la columna a la que va cada una</caption>
          <thead>
            <tr>
              <th scope="col">Fila</th>
              {plan.targets.map((target, i) => (
                <th key={i} scope="col">
                  {target.label}
                  <small>
                    {target.to === "nueva" ? "columna nueva · " : ""}
                    {kindOf(target)}
                    {plan.misfits[i] > 0 ? ` · ${plan.misfits[i]} no ${plan.misfits[i] === 1 ? "encaja" : "encajan"}` : ""}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.body.slice(0, PREVIEW_ROWS).map((line, li) => (
              <tr key={li}>
                <th scope="row">{li + 1}</th>
                {plan.targets.map((_, i) => {
                  const raw = (line[i] ?? "").trim();
                  return (
                    <td key={i} data-blank={raw === "" || undefined}>
                      {raw === "" ? "sin dato" : raw}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plan.body.length > PREVIEW_ROWS && <p className="oda-muted">…y {plural(plan.body.length - PREVIEW_ROWS, "fila más", "filas más")}.</p>}

      <ul className="oda-ct__paste-notes">
        {created > 0 && <li>Se {created === 1 ? "crea 1 columna" : `crean ${created} columnas`}; su tipo se dedujo de lo pegado y se cambia en la rejilla, en «Ajustar».</li>}
        {plan.becomesAnnual && <li>Lo pegado trae la columna «Año»: el conjunto queda «Por año» y cada fila toma el suyo. Puedes cambiarlo en «Tiempo».</li>}
        {request.replace && draft.rows.some((row) => !isBlankFreeRow(row, draft.meta.temporality === "anual")) && (
          <li>Las filas que hay ahora en la rejilla se reemplazan por estas, también sus títulos y totales. Las columnas que ya existen se conservan.</li>
        )}
        {!request.replace && <li>Lo que ya había en esas casillas se reemplaza; los títulos y los totales se saltan.</li>}
        <li>Una celda vacía queda «sin dato», no en 0.</li>
        {misfits > 0 && (
          <li data-tone="error">
            {plural(misfits, "celda no encaja", "celdas no encajan")} con el tipo de su columna: se {misfits === 1 ? "pega" : "pegan"} tal cual y {misfits === 1 ? "queda marcada" : "quedan marcadas"}; no impide guardar.
          </li>
        )}
      </ul>

      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="button-primary" autoFocus disabled={plan.body.length === 0} onClick={onConfirm}>
          {request.replace ? "Reemplazar las filas" : "Pegar"}
        </button>
      </div>
    </section>
  );
}
