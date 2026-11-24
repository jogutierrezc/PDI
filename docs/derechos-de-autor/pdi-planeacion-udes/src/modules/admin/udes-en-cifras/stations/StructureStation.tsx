/* =============================================================================
   Estación 2 · Estructura y KPI.

   Tres cosas de un informe, en el orden en que se deciden:
   1. Qué es: nombre, código, línea, textos e imagen de la ficha.
   2. Qué mide: sus indicadores, con unidad, formato, si el total se suma o se
      reporta, y la oficina que responde por la cifra.
   3. Qué destaca: el tablero de KPI. Se marcan las cifras clave, se ordenan y
      se elige una titular, que es la que representa al informe en el tablero
      público.
   Y al final, sus conjuntos visuales (desgloses, evoluciones históricas,
   tuberías, mapas de calor, mapas, conjuntos libres), varios de cada tipo si hace falta: aquí se
   definen; sus cifras se cargan en Captura.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { CSSProperties } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type {
  OdAggregation,
  OdAnnualRule,
  OdChartKind,
  OdDirection,
  OdIndicatorRow,
  OdMapMode,
  OdMapReporting,
  OdPipelineMeasure,
  OdValueFormat,
} from "../../../../types/database";
import { ANNUAL_RULE_HINT, ANNUAL_RULE_LABEL, REPORTING_HINT, REPORTING_LABEL } from "../../../datos-abiertos/data/terms";
import type { Reporting } from "../../../datos-abiertos/data/terms";
import { totalAdvice } from "../../../datos-abiertos/data/breakdown-total";
import type { StationProps } from "../OdAdmin";
import {
  useDeleteDataset,
  useDeleteIndicator,
  useSaveBreakdown,
  useSaveHeatmap,
  useSaveHistory,
  useSaveIndicator,
  useSaveKpis,
  useSaveMap,
  useSavePipeline,
  useSaveRanking,
  useSaveMedalBoard,
  useSaveReport,
  useSaveSaberPro,
  useSaveSaberTyt,
} from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty, YearPicker, slugify } from "../ui";
import { RankingForm } from "./RankingCapture";
import { MedalBoardForm } from "./MedalCapture";
import { SaberProForm } from "./SaberProCapture";
import { SaberTytForm } from "./SaberTytCapture";
import { TEMPORALITY_LABEL } from "../../../datos-abiertos/data/free-sets";
import { customViewOf } from "../../../datos-abiertos/data/custom-table";
import { RANKING_SYSTEMS, RANKING_VIEWS } from "../../../datos-abiertos/data/rankings";
import { MEDAL_SORT, orderedTiers } from "../../../datos-abiertos/data/medals";

import { AGGREGATION_LABEL, DIRECTION_LABEL, FORMAT_LABEL } from "../indicator-labels";

export function StructureStation({ data, report, canEdit }: StationProps) {
  if (!report?.uuid) return <StageEmpty title="Elige un informe">La estructura se configura informe por informe.</StageEmpty>;
  const reportRow = data.rows.reports.find((r) => r.id === report.uuid)!;
  const indicators = data.rows.indicators.filter((i) => i.report_id === report.uuid).sort((a, b) => a.position - b.position);

  return (
    <div className="oda-stack">
      <ReportForm key={reportRow.id + reportRow.updated_at} row={reportRow} canEdit={canEdit} />
      <KpiBoardEditor key={`kpi-${reportRow.id}-${indicators.map((i) => `${i.id}${i.is_kpi}${i.kpi_position}${i.is_headline}`).join()}`} reportId={reportRow.id} indicators={indicators} canEdit={canEdit} />
      <IndicatorsEditor reportId={reportRow.id} indicators={indicators} offices={data.rows.offices} years={data.catalog.years} canEdit={canEdit} />
      <DatasetsEditor data={data} reportId={reportRow.id} years={data.catalog.years} canEdit={canEdit} />
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
        <div className="admin-field">
          <span>Orden en el tablero</span>
          <p className="oda-muted">
            Puesto <b>{form.position}</b>. Se cambia arrastrando en la lista de informes, con «Ordenar».
          </p>
        </div>
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

export type IndicatorDraft = Pick<
  OdIndicatorRow,
  "label" | "key" | "unit" | "format" | "direction" | "aggregation" | "reporting" | "annual_rule" | "years" | "definition" | "office_id"
>;

export const emptyIndicator: IndicatorDraft = {
  label: "", key: "", unit: "", format: "entero", direction: "sube", aggregation: "suma", reporting: "periodo", annual_rule: "suma", years: null,
  definition: "", office_id: null,
};

function IndicatorsEditor({
  reportId,
  indicators,
  offices,
  years,
  canEdit,
}: {
  reportId: string;
  indicators: OdIndicatorRow[];
  offices: StationProps["data"]["rows"]["offices"];
  years: number[];
  canEdit: boolean;
}) {
  const save = useSaveIndicator();
  const remove = useDeleteIndicator();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Panel
      id="oda-indicadores"
      title={`Indicadores (${indicators.length})`}
      description="Cada indicador dice cómo llega: por periodo (1 y 2, y la cifra del año sale de su regla) o con una sola cifra por año. El total institucional se suma de los campus o se captura aparte. Cada uno marca sus años con dato."
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
            <th scope="col">Total</th>
            <th scope="col">Cifra del año</th>
            <th scope="col">Reporta</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {open === "nuevo" && (
            <tr className="oda-table__editor">
              <td colSpan={5}>
                <IndicatorForm
                  initial={emptyIndicator}
                  offices={offices}
                  years={years}
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
                <td colSpan={5}>
                  <IndicatorForm
                    initial={indicator}
                    offices={offices}
                    years={years}
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
                  <small>
                    {indicator.unit || "sin unidad"} · {FORMAT_LABEL[indicator.format].toLowerCase()} · {indicator.key}
                    {indicator.is_kpi ? " · cifra clave" : ""}
                    {indicator.years && indicator.years.length ? ` · años ${indicator.years.join(", ")}` : ""}
                  </small>
                </th>
                <td>{AGGREGATION_LABEL[indicator.aggregation]}</td>
                <td>
                  {indicator.reporting === "anual" ? REPORTING_LABEL.anual : ANNUAL_RULE_LABEL[indicator.annual_rule]}
                  <small>{indicator.reporting === "anual" ? "una cifra por año" : "periodos 1 y 2"}</small>
                </td>
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
                    <ConfirmButton
                      label="Borrar"
                      subject={`el indicador «${indicator.label}»`}
                      confirmLabel="Se pierden todas sus cifras cargadas y sale del tablero y de las gráficas de la ficha. No se puede deshacer."
                      onConfirm={() => remove.mutate(indicator.id)}
                    />
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

export function IndicatorForm({
  initial,
  offices,
  years,
  submitLabel,
  onSubmit,
  onCancel,
  lockKey = false,
}: {
  initial: IndicatorDraft;
  offices: StationProps["data"]["rows"]["offices"];
  years: number[];
  submitLabel: string;
  onSubmit: (draft: IndicatorDraft) => void;
  onCancel: () => void;
  lockKey?: boolean;
}) {
  const [draft, setDraft] = useState<IndicatorDraft>({
    label: initial.label, key: initial.key, unit: initial.unit, format: initial.format, direction: initial.direction,
    aggregation: initial.aggregation, reporting: initial.reporting ?? "periodo", annual_rule: initial.annual_rule, years: initial.years, definition: initial.definition,
    office_id: initial.office_id,
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
          <span>Se reporta</span>
          <select
            value={draft.reporting ?? "periodo"}
            onChange={(e) => {
              const reporting = e.target.value as Reporting;
              setDraft({
                ...draft,
                reporting,
                // Por año, la cifra del año es la reportada; de vuelta a periodos, suma A y B.
                annual_rule: reporting === "anual" ? "reportado" : draft.annual_rule === "reportado" ? "suma" : draft.annual_rule,
              });
            }}
          >
            {Object.entries(REPORTING_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small className="oda-field-hint">{REPORTING_HINT[draft.reporting ?? "periodo"]}</small>
        </label>
        <label className="admin-field">
          <span>Cifra del año</span>
          <select
            value={draft.annual_rule}
            disabled={draft.reporting === "anual"}
            onChange={(e) => setDraft({ ...draft, annual_rule: e.target.value as OdAnnualRule })}
          >
            {Object.entries(ANNUAL_RULE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small className="oda-field-hint">
            {draft.reporting === "anual" ? "Es la cifra que se captura para el año." : ANNUAL_RULE_HINT[draft.annual_rule]}
          </small>
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
        <div className="admin-field--wide">
          <YearPicker years={years} value={draft.years} onChange={(next) => setDraft({ ...draft, years: next })} />
        </div>
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

export type DatasetKind = "desglose" | "calor" | "mapa" | "tuberia" | "historico" | "ranking" | "medallero" | "saber" | "tyt";

const MEASURE_LABEL: Record<OdPipelineMeasure, string> = {
  estudiantes: "Estudiantes que siguen en cada etapa (el portal lo muestra en %)",
  permanencia: "Permanencia: % de la cohorte que sigue en cada etapa",
  desercion: "Deserción acumulada: % de la cohorte que ya se retiró al llegar a cada etapa",
};

/** Clave legible y única dentro del informe: "tuberia", "tuberia-2"… */
const uniqueKey = (title: string, taken: string[]) => {
  const base = slugify(title) || "conjunto";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}-${n}`;
  return key;
};

const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);

/** Los guardados de cada familia de conjuntos. Quien pinta el formulario de alta los crea y muestra su estado. */
export function useDatasetSaves() {
  return {
    saveBreakdown: useSaveBreakdown(),
    saveHeatmap: useSaveHeatmap(),
    saveMap: useSaveMap(),
    savePipeline: useSavePipeline(),
    saveHistory: useSaveHistory(),
    saveRanking: useSaveRanking(),
    saveMedalBoard: useSaveMedalBoard(),
    saveSaberPro: useSaveSaberPro(),
    saveSaberTyt: useSaveSaberTyt(),
  };
}

/**
 * Alta de un conjunto visual: el formulario de definición de su familia y la
 * fila que crea, con su clave única dentro del informe. Lo usan «Conjuntos
 * visuales» (Estructura y KPI) y «Añadir algo a la ficha» (el taller): un
 * conjunto nace igual desde las dos vistas, y al crearse entra a la ficha como
 * bloque (ver `saveDataset` en od-data.ts).
 */
export function NewDatasetForm({
  data,
  reportId,
  years,
  kind,
  mode = "origen",
  saves,
  onCancel,
  onDone,
}: {
  data: StationProps["data"];
  reportId: string;
  years: number[];
  kind: DatasetKind;
  /** Mapas: por departamento o de movilidad internacional. */
  mode?: OdMapMode;
  saves: ReturnType<typeof useDatasetSaves>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { saveBreakdown, saveHeatmap, saveMap, savePipeline, saveHistory, saveRanking, saveMedalBoard, saveSaberPro, saveSaberTyt } = saves;
  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === reportId);
  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === reportId);
  const maps = data.rows.maps.filter((m) => m.report_id === reportId);
  const pipelines = data.rows.pipelines.filter((p) => p.report_id === reportId);
  const histories = data.rows.histories.filter((h) => h.report_id === reportId);
  const rankings = (data.rows.rankings ?? []).filter((r) => r.report_id === reportId);
  const medalBoards = (data.rows.medalBoards ?? []).filter((m) => m.report_id === reportId);
  const saberPro = (data.rows.saberPro ?? []).filter((sp) => sp.report_id === reportId);
  const saberTyt = (data.rows.saberTyt ?? []).filter((x) => x.report_id === reportId);
  const offices = data.rows.offices;
  const done = { onSuccess: onDone };

  const create = (f: DatasetFields) => {
    const base = { report_id: reportId, office_id: f.office_id || null };
    if (kind === "desglose") saveBreakdown.mutate({ ...base, key: uniqueKey(f.title, breakdowns.map((b) => b.key)), title: f.title, unit: f.unit, format: f.format, default_chart: f.chart, years: f.years, position: breakdowns.length + 1, ...(f.showTotal ? {} : { show_total: false }) }, done);
    if (kind === "calor") saveHeatmap.mutate({ ...base, key: uniqueKey(f.title, heatmaps.map((h) => h.key)), title: f.title, description: f.description, unit: f.unit, format: f.format, row_label: f.rowLabel, column_label: f.columnLabel, rows: lines(f.rows), columns: lines(f.columns), position: heatmaps.length + 1 }, done);
    if (kind === "mapa") saveMap.mutate({ ...base, key: uniqueKey(f.title, maps.map((m) => m.key)), title: f.title, description: f.description, unit: f.unit, mode: f.mode, reporting: reportingFor(f), years: reportingFor(f) === "global" ? null : f.years, position: maps.length + 1 }, done);
    if (kind === "tuberia") savePipeline.mutate({ ...base, key: uniqueKey(f.title, pipelines.map((p) => p.key)), title: f.title, description: f.description, measure: f.measure, stages: lines(f.rows), position: pipelines.length + 1 }, done);
    if (kind === "historico") saveHistory.mutate({ ...base, key: uniqueKey(f.title, histories.map((h) => h.key)), title: f.title, description: f.description, unit: f.unit, format: f.format, total_label: f.totalLabel || "Total", position: histories.length + 1 }, done);
  };

  if (kind === "ranking") {
    return (
      <RankingForm
        offices={offices}
        onCancel={onCancel}
        onSubmit={(f) =>
          saveRanking.mutate(
            { report_id: reportId, key: uniqueKey(f.title, rankings.map((r) => r.key)), title: f.title, description: f.description, system: f.system, accent: f.accent, view: f.view, office_id: f.office_id || null, position: rankings.length + 1 },
            done,
          )
        }
      />
    );
  }
  if (kind === "medallero") {
    return (
      <MedalBoardForm
        offices={offices}
        onCancel={onCancel}
        onSubmit={(f) =>
          saveMedalBoard.mutate(
            {
              report_id: reportId,
              key: uniqueKey(f.title, medalBoards.map((m) => m.key)),
              title: f.title, description: f.description, row_label: f.row_label,
              reporting: f.reporting, scope: f.scope,
              fixed_year: f.fixed_year ? Number(f.fixed_year) : null,
              sort: f.sort, tiers: f.tiers, note: f.note,
              office_id: f.office_id || null, position: medalBoards.length + 1,
            },
            done,
          )
        }
      />
    );
  }
  if (kind === "saber") {
    return (
      <SaberProForm
        offices={offices}
        onCancel={onCancel}
        onSubmit={(f) =>
          saveSaberPro.mutate(
            { report_id: reportId, key: uniqueKey("saber pro", saberPro.map((sp) => sp.key)), title: f.title, description: f.description, note: f.note, office_id: f.office_id || null, position: saberPro.length + 1 },
            done,
          )
        }
      />
    );
  }
  if (kind === "tyt") {
    return (
      <SaberTytForm
        offices={offices}
        onCancel={onCancel}
        onSubmit={(f) =>
          saveSaberTyt.mutate(
            { report_id: reportId, key: uniqueKey("saber tyt", saberTyt.map((x) => x.key)), title: f.title, description: f.description, note: f.note, office_id: f.office_id || null, position: saberTyt.length + 1 },
            done,
          )
        }
      />
    );
  }
  return (
    <DatasetForm
      kind={kind}
      offices={offices}
      years={years}
      initial={
        kind === "mapa"
          ? mode === "convenios"
            ? { mode, unit: "convenios", reporting: "global" }
            : { mode, unit: mode === "origen" ? "" : "participantes" }
          : undefined
      }
      onCancel={onCancel}
      onSubmit={create}
    />
  );
}

/**
 * Definición de un conjunto ya creado: el mismo formulario de su familia, con
 * lo guardado, y la fila que actualiza. Lo usan «Conjuntos visuales»
 * (Estructura y KPI) y el editor de cada bloque en el taller.
 */
export function EditDatasetForm({
  data,
  reportId,
  years,
  kind,
  id,
  saves,
  onCancel,
  onDone,
}: {
  data: StationProps["data"];
  reportId: string;
  years: number[];
  kind: DatasetKind;
  id: string;
  saves: ReturnType<typeof useDatasetSaves>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { saveBreakdown, saveHeatmap, saveMap, savePipeline, saveHistory, saveRanking, saveMedalBoard, saveSaberPro, saveSaberTyt } = saves;
  const offices = data.rows.offices;
  const done = { onSuccess: onDone };

  if (kind === "desglose") {
    const b = data.rows.breakdowns.find((x) => x.id === id);
    if (!b) return null;
    return (
      <DatasetForm kind="desglose" offices={offices} years={years} initial={{ title: b.title, unit: b.unit, format: b.format, chart: b.default_chart, years: b.years, office_id: b.office_id ?? "", showTotal: b.show_total ?? true }}
        annualRule={b.reporting === "anual" ? "reportado" : b.annual_rule}
        onCancel={onCancel} onSubmit={(f) => saveBreakdown.mutate({ id: b.id, report_id: reportId, title: f.title, unit: f.unit, format: f.format, default_chart: f.chart, years: f.years, office_id: f.office_id || null, ...(f.showTotal !== (b.show_total ?? true) ? { show_total: f.showTotal } : {}) }, done)} />
    );
  }
  if (kind === "historico") {
    const h = data.rows.histories.find((x) => x.id === id);
    if (!h) return null;
    return (
      <DatasetForm kind="historico" offices={offices} years={years} initial={{ title: h.title, description: h.description, unit: h.unit, format: h.format, totalLabel: h.total_label, office_id: h.office_id ?? "" }}
        onCancel={onCancel} onSubmit={(f) => saveHistory.mutate({ id: h.id, report_id: reportId, title: f.title, description: f.description, unit: f.unit, format: f.format, total_label: f.totalLabel || "Total", office_id: f.office_id || null }, done)} />
    );
  }
  if (kind === "tuberia") {
    const p = data.rows.pipelines.find((x) => x.id === id);
    if (!p) return null;
    return (
      <DatasetForm kind="tuberia" offices={offices} years={years} initial={{ title: p.title, description: p.description, measure: p.measure, rows: p.stages.join("\n"), office_id: p.office_id ?? "" }}
        onCancel={onCancel} onSubmit={(f) => savePipeline.mutate({ id: p.id, report_id: reportId, title: f.title, description: f.description, measure: f.measure, stages: lines(f.rows), office_id: f.office_id || null }, done)} />
    );
  }
  if (kind === "calor") {
    const h = data.rows.heatmaps.find((x) => x.id === id);
    if (!h) return null;
    return (
      <DatasetForm kind="calor" offices={offices} years={years}
        initial={{ title: h.title, description: h.description, unit: h.unit, format: h.format, rowLabel: h.row_label, columnLabel: h.column_label, rows: h.rows.join("\n"), columns: h.columns.join("\n"), office_id: h.office_id ?? "" }}
        onCancel={onCancel}
        onSubmit={(f) => saveHeatmap.mutate({ id: h.id, report_id: reportId, title: f.title, description: f.description, unit: f.unit, format: f.format, row_label: f.rowLabel, column_label: f.columnLabel, rows: lines(f.rows), columns: lines(f.columns), office_id: f.office_id || null }, done)} />
    );
  }
  if (kind === "mapa") {
    const m = data.rows.maps.find((x) => x.id === id);
    if (!m) return null;
    return (
      <DatasetForm kind="mapa" offices={offices} years={years} initial={{ title: m.title, description: m.description, unit: m.unit, mode: m.mode, reporting: m.reporting ?? "anual", years: m.years, office_id: m.office_id ?? "" }}
        onCancel={onCancel} onSubmit={(f) => saveMap.mutate({ id: m.id, report_id: reportId, title: f.title, description: f.description, unit: f.unit, mode: f.mode, reporting: reportingFor(f), years: reportingFor(f) === "global" ? null : f.years, office_id: f.office_id || null }, done)} />
    );
  }
  if (kind === "medallero") {
    const m = (data.rows.medalBoards ?? []).find((x) => x.id === id);
    if (!m) return null;
    return (
      <MedalBoardForm
        offices={offices}
        initial={{
          title: m.title, description: m.description, row_label: m.row_label,
          reporting: m.reporting, scope: m.scope,
          fixed_year: m.fixed_year ? String(m.fixed_year) : "",
          sort: m.sort, tiers: orderedTiers(m), note: m.note, office_id: m.office_id ?? "",
        }}
        onCancel={onCancel}
        onSubmit={(f) =>
          saveMedalBoard.mutate(
            {
              id: m.id, report_id: reportId,
              title: f.title, description: f.description, row_label: f.row_label,
              reporting: f.reporting, scope: f.scope,
              fixed_year: f.fixed_year ? Number(f.fixed_year) : null,
              sort: f.sort, tiers: f.tiers, note: f.note, office_id: f.office_id || null,
            },
            done,
          )
        }
      />
    );
  }
  if (kind === "ranking") {
    const r = (data.rows.rankings ?? []).find((x) => x.id === id);
    if (!r) return null;
    return (
      <RankingForm offices={offices} initial={{ title: r.title, description: r.description, system: r.system, accent: r.accent, view: r.view, office_id: r.office_id ?? "" }}
        onCancel={onCancel}
        onSubmit={(f) => saveRanking.mutate({ id: r.id, report_id: reportId, title: f.title, description: f.description, system: f.system, accent: f.accent, view: f.view, office_id: f.office_id || null }, done)} />
    );
  }
  if (kind === "saber") {
    const sp = (data.rows.saberPro ?? []).find((x) => x.id === id);
    if (!sp) return null;
    return (
      <SaberProForm offices={offices} initial={{ title: sp.title, description: sp.description, note: sp.note, office_id: sp.office_id ?? "" }}
        onCancel={onCancel}
        onSubmit={(f) => saveSaberPro.mutate({ id: sp.id, report_id: reportId, title: f.title, description: f.description, note: f.note, office_id: f.office_id || null }, done)} />
    );
  }
  const tyt = (data.rows.saberTyt ?? []).find((x) => x.id === id);
  if (!tyt) return null;
  return (
    <SaberTytForm offices={offices} initial={{ title: tyt.title, description: tyt.description, note: tyt.note, office_id: tyt.office_id ?? "" }}
      onCancel={onCancel}
      onSubmit={(f) => saveSaberTyt.mutate({ id: tyt.id, report_id: reportId, title: f.title, description: f.description, note: f.note, office_id: f.office_id || null }, done)} />
  );
}

function DatasetsEditor({ data, reportId, years, canEdit }: { data: StationProps["data"]; reportId: string; years: number[]; canEdit: boolean }) {
  const saves = useDatasetSaves();
  const { saveBreakdown, saveHeatmap, saveMap, savePipeline, saveHistory, saveRanking, saveMedalBoard, saveSaberPro, saveSaberTyt } = saves;
  const remove = useDeleteDataset();
  const location = useLocation();
  const [adding, setAdding] = useState<DatasetKind | null>(null);
  // Mapas: por departamento o de movilidad internacional, según la opción elegida.
  const [addingMode, setAddingMode] = useState<OdMapMode>("origen");
  const [editing, setEditing] = useState<string | null>(null);

  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === reportId);
  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === reportId);
  const maps = data.rows.maps.filter((m) => m.report_id === reportId);
  const pipelines = data.rows.pipelines.filter((p) => p.report_id === reportId);
  const histories = data.rows.histories.filter((h) => h.report_id === reportId);
  const rankings = (data.rows.rankings ?? []).filter((r) => r.report_id === reportId).sort((a, b) => a.position - b.position);
  const medalBoards = (data.rows.medalBoards ?? []).filter((m) => m.report_id === reportId).sort((a, b) => a.position - b.position);
  const saberPro = (data.rows.saberPro ?? []).filter((sp) => sp.report_id === reportId).sort((a, b) => a.position - b.position);
  const saberYears = (id: string) => new Set((data.rows.saberProResults ?? []).filter((r) => r.saber_id === id).map((r) => r.year)).size;
  const saberTyt = (data.rows.saberTyt ?? []).filter((t) => t.report_id === reportId).sort((a, b) => a.position - b.position);
  const tytYears = (id: string) => new Set((data.rows.saberTytResults ?? []).filter((r) => r.tyt_id === id).map((r) => r.year)).size;
  const freeSets = (data.rows.freeSets ?? []).filter((fs) => fs.report_id === reportId).sort((a, b) => a.position - b.position);
  // Las filas de datos; los títulos de grupo y los totales de 0034 no cuentan como cifras cargadas.
  const freeRows = (id: string) => (data.rows.freeSetRows ?? []).filter((r) => r.set_id === id && (r.kind ?? "dato") === "dato");
  const offices = data.rows.offices;
  const mutations = [saveBreakdown, saveHeatmap, saveMap, savePipeline, saveHistory, saveRanking, saveMedalBoard, saveSaberPro, saveSaberTyt, remove];
  const pending = mutations.some((m) => m.isPending);
  const error = mutations.find((m) => m.error)?.error ?? null;
  const success = mutations.some((m) => m.isSuccess);
  const done = { onSuccess: () => { setAdding(null); setEditing(null); } };
  const total = breakdowns.length + heatmaps.length + maps.length + pipelines.length + histories.length + rankings.length + medalBoards.length + saberPro.length + saberTyt.length + freeSets.length;

  const yearsDetail = (list: number[] | null) => (list && list.length ? list.join(", ") : "todos los años");

  return (
    <Panel
      id="oda-conjuntos"
      title="Conjuntos visuales"
      description="Desgloses, mapas de calor, mapas, tuberías y evoluciones históricas: los que quieras de cada tipo. Al crearlos entran a la ficha como bloque visible; sus cifras se cargan en Captura y su lugar se ajusta en Diseño visual. Los conjuntos libres y las tablas personalizadas no se definen aquí: quien los reporta los crea y arma sus columnas en Captura, en «Conjuntos libres» y «Tablas personalizadas»; aquí solo se listan y se pueden borrar."
      actions={
        <>
          <SaveState pending={pending} error={error} success={success} />
          <label className="oda-add-select">
            <span className="sr-only">Añadir conjunto</span>
            <select
              value=""
              disabled={!canEdit}
              onChange={(e) => {
                const [kind, mode] = e.target.value.split(":");
                setAddingMode((mode || "origen") as OdMapMode);
                setAdding((kind || null) as DatasetKind | null);
              }}
            >
              <option value="">Añadir conjunto…</option>
              <option value="desglose">Desglose (circular o barras)</option>
              <option value="historico">Evolución histórica (periodos y categorías)</option>
              <option value="tuberia">Tubería de permanencia o deserción</option>
              <option value="calor">Mapa de calor</option>
              <option value="mapa">Mapa por departamento</option>
              <option value="mapa:entrante">Mapa de movilidad entrante (país → campus)</option>
              <option value="mapa:saliente">Mapa de movilidad saliente (campus → país)</option>
              <option value="mapa:convenios">Mapa de convenios internacionales por país (mapa de calor)</option>
              <option value="ranking">Ranking universitario (QS, THE…)</option>
              <option value="medallero">Medallero (juegos, festivales, concursos)</option>
              {/* Un informe suele tener un solo conjunto Saber PRO: se ofrece mientras no lo tenga. */}
              {saberPro.length === 0 && <option value="saber">Resultados Saber PRO (ICFES)</option>}
              {/* El Motor Beta cruza dos pruebas de la misma persona: también uno por informe. */}
              {saberTyt.length === 0 && <option value="tyt">Saber TyT · Motor Beta (Saber 11 → Saber TyT)</option>}
            </select>
          </label>
        </>
      }
    >
      {adding && (
        <NewDatasetForm
          key={`${adding}-${addingMode}`}
          data={data}
          reportId={reportId}
          years={years}
          kind={adding}
          mode={addingMode}
          saves={saves}
          onCancel={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            setEditing(null);
          }}
        />
      )}

      <ul className="oda-datasets">
        {breakdowns.map((b) => (
          <DatasetItem key={b.id} kind="Desglose" title={b.title} detail={`${b.unit} · ${b.default_chart === "barras" ? "barras" : b.default_chart === "composicion" ? "composición" : "circular"} · ${yearsDetail(b.years)}${b.show_total === false ? " · sin total" : ""}`} canEdit={canEdit}
            editing={editing === b.id} onEdit={() => setEditing(b.id)} onDelete={() => remove.mutate({ table: "od_breakdowns", id: b.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="desglose" id={b.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {histories.map((h) => (
          <DatasetItem key={h.id} kind="Evolución histórica" title={h.title} detail={`${h.unit || "sin unidad"} · total: ${h.total_label}`} canEdit={canEdit}
            editing={editing === h.id} onEdit={() => setEditing(h.id)} onDelete={() => remove.mutate({ table: "od_histories", id: h.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="historico" id={h.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {pipelines.map((p) => (
          <DatasetItem key={p.id} kind="Tubería" title={p.title} detail={`${p.stages.length} etapas · ${MEASURE_LABEL[p.measure].split(":")[0].toLowerCase()}`} canEdit={canEdit}
            editing={editing === p.id} onEdit={() => setEditing(p.id)} onDelete={() => remove.mutate({ table: "od_pipelines", id: p.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="tuberia" id={p.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {heatmaps.map((h) => (
          <DatasetItem key={h.id} kind="Mapa de calor" title={h.title} detail={`${h.rows.length} × ${h.columns.length} · ${h.unit}`} canEdit={canEdit}
            editing={editing === h.id} onEdit={() => setEditing(h.id)} onDelete={() => remove.mutate({ table: "od_heatmaps", id: h.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="calor" id={h.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {maps.map((m) => (
          <DatasetItem key={m.id} kind="Mapa" title={m.title} detail={`${MAP_MODE_DETAIL[m.mode]} · ${m.unit} · ${m.reporting === "global" ? "dato global, sin año" : yearsDetail(m.years)}`} canEdit={canEdit}
            editing={editing === m.id} onEdit={() => setEditing(m.id)} onDelete={() => remove.mutate({ table: "od_maps", id: m.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="mapa" id={m.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {medalBoards.map((m) => (
          <DatasetItem
            key={m.id}
            kind="Medallero"
            title={m.title}
            detail={`${m.row_label} · ${orderedTiers(m).map((t) => t.label).join(", ")} · ${MEDAL_SORT[m.sort].label.toLowerCase()}`}
            canEdit={canEdit}
            editing={editing === m.id}
            onEdit={() => setEditing(m.id)}
            onDelete={() => remove.mutate({ table: "od_medal_boards", id: m.id })}
          >
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="medallero" id={m.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {rankings.map((r) => (
          <DatasetItem key={r.id} kind="Ranking" title={r.title} detail={`${RANKING_SYSTEMS[r.system].short} · abre en ${RANKING_VIEWS[r.view].toLowerCase()}`} canEdit={canEdit}
            editing={editing === r.id} onEdit={() => setEditing(r.id)} onDelete={() => remove.mutate({ table: "od_rankings", id: r.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="ranking" id={r.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {saberPro.map((sp) => (
          <DatasetItem key={sp.id} kind="Saber PRO" title={sp.title} detail={saberYears(sp.id) ? `${saberYears(sp.id)} años cargados` : "sin resultados: impórtalos en Captura"} canEdit={canEdit}
            editing={editing === sp.id} onEdit={() => setEditing(sp.id)} onDelete={() => remove.mutate({ table: "od_saber_pro", id: sp.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="saber" id={sp.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {saberTyt.map((t) => (
          <DatasetItem key={t.id} kind="Saber TyT (Motor Beta)" title={t.title} detail={tytYears(t.id) ? `${tytYears(t.id)} años cargados` : "sin resultados: impórtalos en Captura"} canEdit={canEdit}
            editing={editing === t.id} onEdit={() => setEditing(t.id)} onDelete={() => remove.mutate({ table: "od_saber_tyt", id: t.id })}>
            <EditDatasetForm data={data} reportId={reportId} years={years} kind="tyt" id={t.id} saves={saves} onCancel={() => setEditing(null)} onDone={done.onSuccess} />
          </DatasetItem>
        ))}
        {/* Los conjuntos libres se crean y se editan en Captura: aquí solo se listan y se borran. */}
        {freeSets.map((fs) => {
          const rowCount = freeRows(fs.id).length;
          const custom = Boolean(customViewOf(fs));
          const where = custom ? "Captura › Tablas personalizadas" : "Captura › Conjuntos libres";
          return (
            <li key={fs.id} className="oda-dataset">
              <div className="oda-dataset__row">
                <span className="oda-badge">{custom ? "Tabla personalizada" : "Conjunto libre"}</span>
                <strong>{fs.title}</strong>
                <small>
                  {custom
                    ? `${fs.columns.length} columnas · ${rowCount} filas`
                    : `${fs.columns.length} columnas · ${rowCount} filas · ${fs.views.length} gráficas · ${TEMPORALITY_LABEL[fs.temporality].split(":")[0].toLowerCase()}${fs.temporality === "periodo" && fs.period_label ? ` ${fs.period_label}` : ""}`}
                  {" · "}se edita en {where}
                </small>
                <span className="oda-table__actions">
                  <Link className="oda-link-button" to={{ pathname: location.pathname.replace("/estructura", "/captura"), search: location.search, hash: custom ? "personalizadas" : "libres" }}>
                    Editar en Captura
                  </Link>
                  {canEdit && (
                    <ConfirmButton
                      label="Borrar"
                      subject={`«${fs.title}» (${custom ? "tabla personalizada" : "conjunto libre"})`}
                      confirmLabel="Se pierden sus cifras cargadas y los bloques que lo muestran salen de la ficha. No se puede deshacer."
                      onConfirm={() => remove.mutate({ table: "od_free_sets", id: fs.id })}
                    />
                  )}
                </span>
              </div>
            </li>
          );
        })}
        {total === 0 && !adding && (
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
          {canEdit && (
            <ConfirmButton
              label="Borrar"
              subject={`«${title}» (${kind.toLowerCase()})`}
              confirmLabel="Se pierden sus cifras cargadas y los bloques que lo muestran salen de la ficha. No se puede deshacer."
              onConfirm={onDelete}
            />
          )}
        </span>
      </div>
      {editing && children}
    </li>
  );
}

const WORLD_MODES: OdMapMode[] = ["entrante", "saliente", "convenios"];

/** Solo los convenios pueden ser un dato global; los demás mapas van por año. */
const reportingFor = (f: { mode: OdMapMode; reporting: OdMapReporting }): OdMapReporting =>
  f.mode === "convenios" ? f.reporting : "anual";

const MAP_MODE_DETAIL: Record<OdMapMode, string> = {
  origen: "origen con flujos",
  cobertura: "cobertura",
  entrante: "movilidad entrante por país",
  saliente: "movilidad saliente por país",
  convenios: "convenios por país (mapa de calor)",
  municipio: "origen por municipio, con zoom",
};

export interface DatasetFields {
  title: string; description: string; unit: string; format: OdValueFormat; chart: OdChartKind; mode: OdMapMode; reporting: OdMapReporting;
  rowLabel: string; columnLabel: string; rows: string; columns: string; office_id: string;
  measure: OdPipelineMeasure; totalLabel: string; years: number[] | null;
  /** Desgloses: columna Total en «Ver datos por corte». Solo viaja al guardar si cambió (0124). */
  showTotal: boolean;
}

export function DatasetForm({ kind, offices, years, initial, annualRule, onSubmit, onCancel }: {
  kind: DatasetKind;
  /** Desgloses: cómo sale su cifra del año; solo para sugerir si conviene el total. */
  annualRule?: OdAnnualRule;
  offices: StationProps["data"]["rows"]["offices"];
  years: number[];
  initial?: Partial<DatasetFields>;
  onSubmit: (fields: DatasetFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<DatasetFields>({
    title: "", description: "", unit: kind === "historico" ? "estudiantes" : "", format: "entero", chart: "circular", mode: "origen", reporting: "anual",
    rowLabel: "", columnLabel: "", rows: kind === "tuberia" ? "Ingreso\n2.º semestre\n4.º semestre\n6.º semestre\n8.º semestre\n10.º semestre\nGrado" : "", columns: "", office_id: "",
    measure: "estudiantes", totalLabel: kind === "historico" ? "Total" : "", years: null, showTotal: true,
    ...initial,
  });
  const set = (patch: Partial<DatasetFields>) => setF({ ...f, ...patch });
  const advice = kind === "desglose" && f.showTotal ? totalAdvice({ unit: f.unit, format: f.format, annualRule }) : null;

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
        {(kind === "desglose" || kind === "calor" || kind === "historico") && (
          <label className="admin-field">
            <span>Formato</span>
            <select value={f.format} onChange={(e) => set({ format: e.target.value as OdValueFormat })}>
              {Object.entries(FORMAT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        {kind === "historico" && (
          <label className="admin-field">
            <span>Nombre del total <small>p. ej. Total de estudiantes</small></span>
            <input value={f.totalLabel} onChange={(e) => set({ totalLabel: e.target.value })} />
          </label>
        )}
        {kind === "desglose" && (
          <label className="admin-field">
            <span>Gráfica por defecto</span>
            <select value={f.chart} onChange={(e) => set({ chart: e.target.value as OdChartKind })}>
              <option value="circular">Circular</option>
              <option value="barras">Barras</option>
              <option value="composicion">Composición (varios cortes)</option>
            </select>
          </label>
        )}
        {kind === "desglose" && (
          <div className="admin-field--wide">
            <label className="oda-switch">
              <input type="checkbox" checked={f.showTotal} onChange={(e) => set({ showTotal: e.target.checked })} />
              <span>Mostrar total</span>
            </label>
            <div className="oda-field-hint">
              Suma las categorías de cada corte en «Ver datos por corte». Apáguelo cuando sumar las categorías no tenga sentido:
              porcentajes, promedios, tasas o categorías que se solapan.
            </div>
            {advice && <div className="oda-field-warning">{advice}</div>}
          </div>
        )}
        {kind === "mapa" && (
          <label className="admin-field">
            <span>Tipo de mapa</span>
            {/* Departamento y país no se mezclan: las cifras guardadas usan códigos distintos. */}
            <select value={f.mode} onChange={(e) => set({ mode: e.target.value as OdMapMode })}>
              {WORLD_MODES.includes(f.mode) ? (
                <>
                  <option value="entrante">Movilidad entrante: del país de origen al campus</option>
                  <option value="saliente">Movilidad saliente: del campus al país de destino</option>
                  <option value="convenios">Convenios: mapa de calor por país, sin rutas</option>
                </>
              ) : (
                <>
                  <option value="origen">Origen: con líneas de llegada a cada campus</option>
                  <option value="cobertura">Cobertura: solo color por departamento</option>
                  <option value="municipio">Origen por municipio: calor por departamento y puntos por ciudad, con zoom</option>
                </>
              )}
            </select>
          </label>
        )}
        {kind === "mapa" && f.mode === "convenios" && (
          <label className="admin-field">
            <span>Cómo se registra</span>
            <select value={f.reporting} onChange={(e) => set({ reporting: e.target.value as OdMapReporting })}>
              <option value="global">Dato global: una sola cifra por país, sin año</option>
              <option value="anual">Por año: convenios inscritos cada año (en "Todos" se suman)</option>
            </select>
            {initial?.reporting && initial.reporting !== f.reporting && (
              <small className="oda-field-warning">
                Las cifras ya cargadas {initial.reporting === "global" ? "como dato global" : "por año"} dejan de verse; quedan guardadas por si vuelves a la forma anterior.
              </small>
            )}
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
          <>
            <label className="admin-field admin-field--wide">
              <span>Qué se captura en cada etapa</span>
              <select value={f.measure} onChange={(e) => set({ measure: e.target.value as OdPipelineMeasure })}>
                {Object.entries(MEASURE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="admin-field admin-field--wide">
              <span>Etapas <small>una por línea, de la entrada al grado</small></span>
              <textarea rows={7} value={f.rows} onChange={(e) => set({ rows: e.target.value })} />
            </label>
          </>
        )}
        {(kind === "desglose" || (kind === "mapa" && reportingFor(f) === "anual")) && (
          <div className="admin-field--wide">
            <YearPicker years={years} value={f.years} onChange={(next) => set({ years: next })} />
          </div>
        )}
        <label className="admin-field">
          <span>Oficina que reporta</span>
          <select value={f.office_id} onChange={(e) => set({ office_id: e.target.value })}>
            <option value="">Sin oficina</option>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      {kind === "tuberia" && (
        <p className="oda-form-note">
          Cada tubería es un solo flujo de cohortes reportado junto (por ejemplo, 2014-1 a 2023-2), que se indica en Captura,
          también si es anterior al periodo del informe. El portal la muestra como deserción acumulada en %. Los porcentajes
          admiten decimales: 12,5.
        </p>
      )}
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary">{initial ? "Guardar conjunto" : "Crear conjunto"}</button>
      </div>
    </form>
  );
}
