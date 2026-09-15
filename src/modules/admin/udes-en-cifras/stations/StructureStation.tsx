/* =============================================================================
   Estación 2 · Estructura y KPI.

   Tres cosas de un informe, en el orden en que se deciden:
   1. Qué es: nombre, código, línea, textos e imagen de la ficha.
   2. Qué mide: sus indicadores, con unidad, formato, si el total se suma o se
      reporta, y la oficina que responde por la cifra.
   3. Qué destaca: el tablero de KPI. Se marcan las cifras clave, se ordenan y
      se elige una titular, que es la que representa al informe en el tablero
      público.
   Y al final, sus conjuntos visuales (desgloses, mapas de calor, mapas,
   tubería): aquí se definen; sus cifras se cargan en Captura.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type {
  OdAggregation,
  OdChartKind,
  OdDirection,
  OdIndicatorRow,
  OdMapMode,
  OdValueFormat,
} from "../../../../types/database";
import type { StationProps } from "../OdAdmin";
import {
  useDeleteDataset,
  useDeleteIndicator,
  useSaveBreakdown,
  useSaveHeatmap,
  useSaveIndicator,
  useSaveKpis,
  useSaveMap,
  useSavePipeline,
  useSaveReport,
} from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty, slugify } from "../ui";

const FORMAT_LABEL: Record<OdValueFormat, string> = { entero: "Entero", porcentaje: "Porcentaje", decimal: "Decimal" };
const DIRECTION_LABEL: Record<OdDirection, string> = { sube: "Subir es mejor", baja: "Bajar es mejor", neutro: "Neutro" };
const AGGREGATION_LABEL: Record<OdAggregation, string> = {
  suma: "Suma de campus",
  reportado: "Total reportado aparte",
};

export function StructureStation({ data, report, canEdit }: StationProps) {
  if (!report?.uuid) return <StageEmpty title="Elige un informe">La estructura se configura informe por informe.</StageEmpty>;
  const reportRow = data.rows.reports.find((r) => r.id === report.uuid)!;
  const indicators = data.rows.indicators.filter((i) => i.report_id === report.uuid).sort((a, b) => a.position - b.position);

  return (
    <div className="oda-stack">
      <ReportForm key={reportRow.id + reportRow.updated_at} row={reportRow} canEdit={canEdit} />
      <KpiBoardEditor key={`kpi-${reportRow.id}-${indicators.map((i) => `${i.id}${i.is_kpi}${i.kpi_position}${i.is_headline}`).join()}`} reportId={reportRow.id} indicators={indicators} canEdit={canEdit} />
      <IndicatorsEditor reportId={reportRow.id} indicators={indicators} offices={data.rows.offices} canEdit={canEdit} />
      <DatasetsEditor data={data} reportId={reportRow.id} canEdit={canEdit} />
    </div>
  );
}

/* --- 1. Qué es ------------------------------------------------------------------ */

function ReportForm({ row, canEdit }: { row: StationProps["data"]["rows"]["reports"][number]; canEdit: boolean }) {
  const save = useSaveReport();
  const initial = {
    name: row.name, code: row.code, line: row.line, summary: row.summary, description: row.description,
    image_url: row.image_url, image_alt: row.image_alt, image_credit: row.image_credit, note: row.note, position: row.position,
  };
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const codeValid = /^[A-Z]{2}$/.test(form.code);

  return (
    <Panel
      id="oda-informe"
      title="Ficha del informe"
      description="Lo que el portal muestra en el tablero de informes y en la cabecera de la ficha."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-primary" disabled={!canEdit || !dirty || !codeValid || save.isPending} onClick={() => save.mutate({ id: row.id, patch: form })}>
            Guardar ficha
          </button>
        </>
      }
    >
      <div className="oda-form-grid">
        <label className="admin-field">
          <span>Nombre</span>
          <input value={form.name} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>
            Código <small>2 letras</small>
          </span>
          <input value={form.code} maxLength={2} disabled={!canEdit} aria-invalid={!codeValid} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
        </label>
        <fieldset className="admin-field oda-lines">
          <legend>Color de línea</legend>
          <div role="radiogroup" aria-label="Color de línea">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((line) => (
              <label key={line} className="oda-line-swatch" style={{ "--line": `var(--od-line-${line})` } as CSSProperties}>
                <input type="radio" name="linea" value={line} checked={form.line === line} disabled={!canEdit} onChange={() => setForm({ ...form, line })} />
                <span aria-hidden="true">{form.code || "··"}</span>
                <span className="sr-only">Línea {line}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="admin-field">
          <span>Orden en el tablero</span>
          <input type="number" min={1} value={form.position} disabled={!canEdit} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>
            Resumen <small>{form.summary.length}/140</small>
          </span>
          <input value={form.summary} maxLength={140} disabled={!canEdit} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción de la ficha</span>
          <textarea rows={3} value={form.description} disabled={!canEdit} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Imagen (ruta o URL)</span>
          <input value={form.image_url} disabled={!canEdit} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Texto alternativo</span>
          <input value={form.image_alt} disabled={!canEdit} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Crédito de la imagen</span>
          <input value={form.image_credit} disabled={!canEdit} onChange={(e) => setForm({ ...form, image_credit: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Nota metodológica</span>
          <textarea rows={2} value={form.note} disabled={!canEdit} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
    </Panel>
  );
}

/* --- 3. Tablero de KPI ------------------------------------------------------------- */

function KpiBoardEditor({ reportId, indicators, canEdit }: { reportId: string; indicators: OdIndicatorRow[]; canEdit: boolean }) {
  const save = useSaveKpis();
  const ordered = () =>
    indicators
      .filter((i) => i.is_kpi)
      .sort((a, b) => Number(b.is_headline) - Number(a.is_headline) || (a.kpi_position ?? 99) - (b.kpi_position ?? 99))
      .map((i) => i.id);
  const [kpis, setKpis] = useState<string[]>(ordered);
  const [headline, setHeadline] = useState<string | null>(() => indicators.find((i) => i.is_headline)?.id ?? null);
  useEffect(() => {
    if (headline && !kpis.includes(headline)) setHeadline(kpis[0] ?? null);
  }, [kpis, headline]);

  const label = (id: string) => indicators.find((i) => i.id === id)?.label ?? id;
  const available = indicators.filter((i) => !kpis.includes(i.id));
  const dirty =
    JSON.stringify(kpis) !== JSON.stringify(ordered()) || headline !== (indicators.find((i) => i.is_headline)?.id ?? null);

  const move = (index: number, delta: number) => {
    const next = [...kpis];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setKpis(next);
  };

  const submit = () =>
    save.mutate({
      reportId,
      kpis: indicators.map((i) => {
        const position = kpis.indexOf(i.id);
        return { id: i.id, is_kpi: position >= 0, kpi_position: position >= 0 ? position + 1 : null, is_headline: i.id === headline };
      }),
    });

  return (
    <Panel
      id="oda-kpi"
      title="Tablero de KPI"
      description="Las cifras clave de la ficha, en este orden. La titular representa al informe en el tablero público y en la fila de llegadas."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-primary" disabled={!canEdit || !dirty || save.isPending || (kpis.length > 0 && !headline)} onClick={submit}>
            Guardar KPI
          </button>
        </>
      }
    >
      <div className="oda-kpi-editor">
        <ol className="oda-kpi-list" aria-label="Cifras clave en orden">
          {kpis.length === 0 && <li className="oda-kpi-list__empty">Todavía no hay cifras clave. Añádelas desde la lista de la derecha.</li>}
          {kpis.map((id, index) => (
            <li key={id} data-headline={headline === id || undefined}>
              <span className="oda-kpi-list__pos" aria-hidden="true">{index + 1}</span>
              <span className="oda-kpi-list__name">{label(id)}</span>
              <label className="oda-kpi-list__headline">
                <input type="radio" name={`titular-${reportId}`} checked={headline === id} disabled={!canEdit} onChange={() => setHeadline(id)} />
                Titular
              </label>
              <span className="oda-kpi-list__tools">
                <button type="button" className="icon-button" aria-label={`Subir ${label(id)}`} disabled={!canEdit || index === 0} onClick={() => move(index, -1)}>
                  <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button type="button" className="icon-button" aria-label={`Bajar ${label(id)}`} disabled={!canEdit || index === kpis.length - 1} onClick={() => move(index, 1)}>
                  <Icon name="chevron-down" size={15} />
                </button>
                <button type="button" className="icon-button" aria-label={`Quitar ${label(id)} de las cifras clave`} disabled={!canEdit} onClick={() => setKpis(kpis.filter((k) => k !== id))}>
                  <Icon name="close" size={15} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="oda-kpi-available">
          <span className="oda-kpi-available__label">Indicadores del informe</span>
          {available.length === 0 ? (
            <p className="oda-muted">Todos son cifra clave.</p>
          ) : (
            <ul>
              {available.map((i) => (
                <li key={i.id}>
                  <button type="button" className="oda-chip" disabled={!canEdit} onClick={() => setKpis([...kpis, i.id])}>
                    <Icon name="plus" size={13} /> {i.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* --- 2. Indicadores -------------------------------------------------------------------- */

type IndicatorDraft = Pick<OdIndicatorRow, "label" | "key" | "unit" | "format" | "direction" | "aggregation" | "definition" | "office_id">;

const emptyIndicator: IndicatorDraft = {
  label: "", key: "", unit: "", format: "entero", direction: "sube", aggregation: "suma", definition: "", office_id: null,
};

function IndicatorsEditor({
  reportId,
  indicators,
  offices,
  canEdit,
}: {
  reportId: string;
  indicators: OdIndicatorRow[];
  offices: StationProps["data"]["rows"]["offices"];
  canEdit: boolean;
}) {
  const save = useSaveIndicator();
  const remove = useDeleteIndicator();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      id="oda-indicadores"
      title={`Indicadores (${indicators.length})`}
      description="Cada indicador es una fila de captura. Si el total institucional es la suma de los campus, se calcula; si es una tasa o un promedio, se captura aparte."
      actions={
        <>
          <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess || remove.isSuccess} />
          <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => setOpen("nuevo")}>
            <Icon name="plus" size={15} /> Nuevo indicador
          </button>
        </>
      }
    >
      <table className="oda-table oda-table--indicators">
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col">Unidad</th>
            <th scope="col">Formato</th>
            <th scope="col">Total</th>
            <th scope="col">Reporta</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {open === "nuevo" && (
            <tr className="oda-table__editor">
              <td colSpan={6}>
                <IndicatorForm
                  initial={emptyIndicator}
                  offices={offices}
                  submitLabel="Crear indicador"
                  onCancel={() => setOpen(null)}
                  onSubmit={(draft) =>
                    save.mutate(
                      { ...draft, report_id: reportId, key: draft.key || slugify(draft.label), position: indicators.length + 1 },
                      { onSuccess: () => setOpen(null) },
                    )
                  }
                />
              </td>
            </tr>
          )}
          {indicators.map((indicator) =>
            open === indicator.id ? (
              <tr key={indicator.id} className="oda-table__editor">
                <td colSpan={6}>
                  <IndicatorForm
                    initial={indicator}
                    offices={offices}
                    submitLabel="Guardar indicador"
                    lockKey
                    onCancel={() => setOpen(null)}
                    onSubmit={(draft) => save.mutate({ ...draft, id: indicator.id, report_id: reportId }, { onSuccess: () => setOpen(null) })}
                  />
                </td>
              </tr>
            ) : (
              <tr key={indicator.id}>
                <th scope="row">
                  {indicator.label}
                  <small>{indicator.key}{indicator.is_kpi ? " · cifra clave" : ""}</small>
                </th>
                <td>{indicator.unit || "—"}</td>
                <td>{FORMAT_LABEL[indicator.format]}</td>
                <td>{AGGREGATION_LABEL[indicator.aggregation]}</td>
                <td>
                  {offices.find((o) => o.id === indicator.office_id)?.name ?? (
                    <span className="oda-badge" data-tone="warn">
                      <Icon name="alert" size={12} /> Sin oficina
                    </span>
                  )}
                </td>
                <td className="oda-table__actions">
                  <button type="button" className="oda-link-button" disabled={!canEdit} onClick={() => setOpen(indicator.id)}>
                    Editar
                  </button>
                  {canEdit && (
                    <ConfirmButton label="Borrar" confirmLabel="¿Borrar con sus cifras?" onConfirm={() => remove.mutate(indicator.id)} />
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function IndicatorForm({
  initial,
  offices,
  submitLabel,
  onSubmit,
  onCancel,
  lockKey = false,
}: {
  initial: IndicatorDraft;
  offices: StationProps["data"]["rows"]["offices"];
  submitLabel: string;
  onSubmit: (draft: IndicatorDraft) => void;
  onCancel: () => void;
  lockKey?: boolean;
}) {
  const [draft, setDraft] = useState<IndicatorDraft>({
    label: initial.label, key: initial.key, unit: initial.unit, format: initial.format, direction: initial.direction,
    aggregation: initial.aggregation, definition: initial.definition, office_id: initial.office_id,
  });
  const key = draft.key || slugify(draft.label);

  return (
    <form
      className="oda-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.label.trim()) return;
        onSubmit({ ...draft, key });
      }}
    >
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Nombre del indicador</span>
          <input autoFocus value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required />
        </label>
        <label className="admin-field">
          <span>
            Clave <small>{lockKey ? "no se cambia: enlaza las cifras" : "se genera del nombre"}</small>
          </span>
          <input value={key} disabled={lockKey} onChange={(e) => setDraft({ ...draft, key: slugify(e.target.value) })} />
        </label>
        <label className="admin-field">
          <span>Unidad</span>
          <input value={draft.unit} placeholder="estudiantes, %, m²…" onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Formato</span>
          <select value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as OdValueFormat })}>
            {Object.entries(FORMAT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Lectura de la variación</span>
          <select value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as OdDirection })}>
            {Object.entries(DIRECTION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Total institucional</span>
          <select value={draft.aggregation} onChange={(e) => setDraft({ ...draft, aggregation: e.target.value as OdAggregation })}>
            {Object.entries(AGGREGATION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={draft.office_id ?? ""} onChange={(e) => setDraft({ ...draft, office_id: e.target.value || null })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label className="admin-field admin-field--wide">
          <span>Qué mide y cómo</span>
          <textarea rows={2} value={draft.definition} onChange={(e) => setDraft({ ...draft, definition: e.target.value })} />
        </label>
      </div>
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={!draft.label.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

/* --- Conjuntos visuales --------------------------------------------------------------------- */

function DatasetsEditor({ data, reportId, canEdit }: { data: StationProps["data"]; reportId: string; canEdit: boolean }) {
  const saveBreakdown = useSaveBreakdown();
  const saveHeatmap = useSaveHeatmap();
  const saveMap = useSaveMap();
  const savePipeline = useSavePipeline();
  const remove = useDeleteDataset();
  const [adding, setAdding] = useState<"desglose" | "calor" | "mapa" | "tuberia" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === reportId);
  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === reportId);
  const maps = data.rows.maps.filter((m) => m.report_id === reportId);
  const pipeline = data.rows.pipelines.find((p) => p.report_id === reportId);
  const offices = data.rows.offices;
  const pending = saveBreakdown.isPending || saveHeatmap.isPending || saveMap.isPending || savePipeline.isPending || remove.isPending;
  const error = saveBreakdown.error ?? saveHeatmap.error ?? saveMap.error ?? savePipeline.error ?? remove.error;
  const success = saveBreakdown.isSuccess || saveHeatmap.isSuccess || saveMap.isSuccess || savePipeline.isSuccess || remove.isSuccess;
  const done = { onSuccess: () => { setAdding(null); setEditing(null); } };

  const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <Panel
      id="oda-conjuntos"
      title="Conjuntos visuales"
      description="Desgloses, mapas de calor, mapas y tubería del informe. Aquí se definen; sus cifras se cargan en Captura y su lugar en la ficha se decide en Diseño visual."
      actions={
        <>
          <SaveState pending={pending} error={error} success={success} />
          <label className="oda-add-select">
            <span className="sr-only">Añadir conjunto</span>
            <select value="" disabled={!canEdit} onChange={(e) => setAdding((e.target.value || null) as typeof adding)}>
              <option value="">Añadir conjunto…</option>
              <option value="desglose">Desglose (circular o barras)</option>
              <option value="calor">Mapa de calor</option>
              <option value="mapa">Mapa por departamento</option>
              {!pipeline && <option value="tuberia">Tubería de permanencia</option>}
            </select>
          </label>
        </>
      }
    >
      {adding && (
        <DatasetForm
          kind={adding}
          offices={offices}
          onCancel={() => setAdding(null)}
          onSubmit={(f) => {
            const base = { report_id: reportId, office_id: f.office_id || null };
            if (adding === "desglose") saveBreakdown.mutate({ ...base, key: slugify(f.title), title: f.title, unit: f.unit, format: f.format, default_chart: f.chart, position: breakdowns.length + 1 }, done);
            if (adding === "calor") saveHeatmap.mutate({ ...base, key: slugify(f.title), title: f.title, description: f.description, unit: f.unit, format: f.format, row_label: f.rowLabel, column_label: f.columnLabel, rows: lines(f.rows), columns: lines(f.columns), position: heatmaps.length + 1 }, done);
            if (adding === "mapa") saveMap.mutate({ ...base, key: slugify(f.title), title: f.title, description: f.description, unit: f.unit, mode: f.mode, position: maps.length + 1 }, done);
            if (adding === "tuberia") savePipeline.mutate({ ...base, title: f.title, description: f.description, stages: lines(f.rows) }, done);
          }}
        />
      )}

      <ul className="oda-datasets">
        {breakdowns.map((b) => (
          <DatasetItem key={b.id} kind="Desglose" title={b.title} detail={`${b.unit} · ${b.default_chart === "barras" ? "barras" : "circular"} por defecto`} canEdit={canEdit}
            editing={editing === b.id} onEdit={() => setEditing(b.id)} onDelete={() => remove.mutate({ table: "od_breakdowns", id: b.id })}>
            <DatasetForm kind="desglose" offices={offices} initial={{ title: b.title, unit: b.unit, format: b.format, chart: b.default_chart, office_id: b.office_id ?? "" }}
              onCancel={() => setEditing(null)} onSubmit={(f) => saveBreakdown.mutate({ id: b.id, report_id: reportId, title: f.title, unit: f.unit, format: f.format, default_chart: f.chart, office_id: f.office_id || null }, done)} />
          </DatasetItem>
        ))}
        {heatmaps.map((h) => (
          <DatasetItem key={h.id} kind="Mapa de calor" title={h.title} detail={`${h.rows.length} × ${h.columns.length} · ${h.unit}`} canEdit={canEdit}
            editing={editing === h.id} onEdit={() => setEditing(h.id)} onDelete={() => remove.mutate({ table: "od_heatmaps", id: h.id })}>
            <DatasetForm kind="calor" offices={offices}
              initial={{ title: h.title, description: h.description, unit: h.unit, format: h.format, rowLabel: h.row_label, columnLabel: h.column_label, rows: h.rows.join("\n"), columns: h.columns.join("\n"), office_id: h.office_id ?? "" }}
              onCancel={() => setEditing(null)}
              onSubmit={(f) => saveHeatmap.mutate({ id: h.id, report_id: reportId, title: f.title, description: f.description, unit: f.unit, format: f.format, row_label: f.rowLabel, column_label: f.columnLabel, rows: lines(f.rows), columns: lines(f.columns), office_id: f.office_id || null }, done)} />
          </DatasetItem>
        ))}
        {maps.map((m) => (
          <DatasetItem key={m.id} kind="Mapa" title={m.title} detail={`${m.mode === "origen" ? "origen con flujos" : "cobertura"} · ${m.unit}`} canEdit={canEdit}
            editing={editing === m.id} onEdit={() => setEditing(m.id)} onDelete={() => remove.mutate({ table: "od_maps", id: m.id })}>
            <DatasetForm kind="mapa" offices={offices} initial={{ title: m.title, description: m.description, unit: m.unit, mode: m.mode, office_id: m.office_id ?? "" }}
              onCancel={() => setEditing(null)} onSubmit={(f) => saveMap.mutate({ id: m.id, report_id: reportId, title: f.title, description: f.description, unit: f.unit, mode: f.mode, office_id: f.office_id || null }, done)} />
          </DatasetItem>
        ))}
        {pipeline && (
          <DatasetItem kind="Tubería" title={pipeline.title} detail={`${pipeline.stages.length} etapas`} canEdit={canEdit}
            editing={editing === pipeline.id} onEdit={() => setEditing(pipeline.id)} onDelete={() => remove.mutate({ table: "od_pipelines", id: pipeline.id })}>
            <DatasetForm kind="tuberia" offices={offices} initial={{ title: pipeline.title, description: pipeline.description, rows: pipeline.stages.join("\n"), office_id: pipeline.office_id ?? "" }}
              onCancel={() => setEditing(null)} onSubmit={(f) => savePipeline.mutate({ id: pipeline.id, report_id: reportId, title: f.title, description: f.description, stages: lines(f.rows), office_id: f.office_id || null }, done)} />
          </DatasetItem>
        )}
        {breakdowns.length + heatmaps.length + maps.length === 0 && !pipeline && !adding && (
          <li className="oda-muted">Este informe no tiene conjuntos visuales. La ficha mostrará los indicadores, su evolución y la tabla dinámica.</li>
        )}
      </ul>
    </Panel>
  );
}

function DatasetItem({ kind, title, detail, canEdit, editing, onEdit, onDelete, children }: {
  kind: string; title: string; detail: string; canEdit: boolean; editing: boolean; onEdit: () => void; onDelete: () => void; children: React.ReactNode;
}) {
  return (
    <li className="oda-dataset" data-editing={editing || undefined}>
      <div className="oda-dataset__row">
        <span className="oda-badge">{kind}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
        <span className="oda-table__actions">
          <button type="button" className="oda-link-button" disabled={!canEdit} onClick={onEdit}>Editar</button>
          {canEdit && <ConfirmButton label="Borrar" confirmLabel="¿Borrar con sus cifras?" onConfirm={onDelete} />}
        </span>
      </div>
      {editing && children}
    </li>
  );
}

interface DatasetFields {
  title: string; description: string; unit: string; format: OdValueFormat; chart: OdChartKind; mode: OdMapMode;
  rowLabel: string; columnLabel: string; rows: string; columns: string; office_id: string;
}

function DatasetForm({ kind, offices, initial, onSubmit, onCancel }: {
  kind: "desglose" | "calor" | "mapa" | "tuberia";
  offices: StationProps["data"]["rows"]["offices"];
  initial?: Partial<DatasetFields>;
  onSubmit: (fields: DatasetFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<DatasetFields>({
    title: "", description: "", unit: "", format: "entero", chart: "circular", mode: "origen",
    rowLabel: "", columnLabel: "", rows: kind === "tuberia" ? "Ingreso\n2.º semestre\n4.º semestre\n6.º semestre\n8.º semestre\n10.º semestre\nGrado" : "", columns: "", office_id: "",
    ...initial,
  });
  const set = (patch: Partial<DatasetFields>) => setF({ ...f, ...patch });

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) onSubmit(f); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título</span>
          <input autoFocus required value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        {kind !== "desglose" && (
          <label className="admin-field admin-field--wide">
            <span>Descripción</span>
            <textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
        )}
        {kind !== "tuberia" && (
          <label className="admin-field">
            <span>Unidad</span>
            <input value={f.unit} onChange={(e) => set({ unit: e.target.value })} />
          </label>
        )}
        {(kind === "desglose" || kind === "calor") && (
          <label className="admin-field">
            <span>Formato</span>
            <select value={f.format} onChange={(e) => set({ format: e.target.value as OdValueFormat })}>
              {Object.entries(FORMAT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        {kind === "desglose" && (
          <label className="admin-field">
            <span>Gráfica por defecto</span>
            <select value={f.chart} onChange={(e) => set({ chart: e.target.value as OdChartKind })}>
              <option value="circular">Circular</option>
              <option value="barras">Barras</option>
            </select>
          </label>
        )}
        {kind === "mapa" && (
          <label className="admin-field">
            <span>Tipo de mapa</span>
            <select value={f.mode} onChange={(e) => set({ mode: e.target.value as OdMapMode })}>
              <option value="origen">Origen: con líneas de llegada a cada campus</option>
              <option value="cobertura">Cobertura: solo color por departamento</option>
            </select>
          </label>
        )}
        {kind === "calor" && (
          <>
            <label className="admin-field">
              <span>Nombre de las filas</span>
              <input value={f.rowLabel} placeholder="Cohorte, Día…" onChange={(e) => set({ rowLabel: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>Nombre de las columnas</span>
              <input value={f.columnLabel} placeholder="Semestre, Mes…" onChange={(e) => set({ columnLabel: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>Filas <small>una por línea</small></span>
              <textarea rows={5} value={f.rows} onChange={(e) => set({ rows: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>Columnas <small>una por línea</small></span>
              <textarea rows={5} value={f.columns} onChange={(e) => set({ columns: e.target.value })} />
            </label>
          </>
        )}
        {kind === "tuberia" && (
          <label className="admin-field admin-field--wide">
            <span>Etapas <small>una por línea, de la entrada al grado</small></span>
            <textarea rows={7} value={f.rows} onChange={(e) => set({ rows: e.target.value })} />
          </label>
        )}
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary">{initial ? "Guardar conjunto" : "Crear conjunto"}</button>
      </div>
    </form>
  );
}
