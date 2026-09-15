/* =============================================================================
   Estación 3 · Captura.

   Las cifras del informe, año por año y campus por campus, en rejillas que se
   llenan de tres formas:
   · escribiendo casilla por casilla;
   · pegando un rango copiado de Excel desde la casilla enfocada;
   · descargando la plantilla del informe, llenándola y subiéndola: antes de
     aplicar se ve cada cambio (antes → después) y cada fila que no se entendió.

   Nada se guarda hasta pulsar Guardar. Cada guardado deja rastro en od_imports
   con cuántas casillas cambió y por qué vía llegaron.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { downloadText, formatValue } from "../../../datos-abiertos/data/open-data";
import { DEPARTMENTS } from "../../../datos-abiertos/data/colombia-map";
import type { OdImportKind, OdIndicatorRow } from "../../../../types/database";
import type { StationProps } from "../OdAdmin";
import { DataGrid, cellKey } from "../DataGrid";
import type { CellKey, GridColumn, GridRow } from "../DataGrid";
import {
  useSaveBreakdownValues,
  useSaveHeatmapCells,
  useSaveMapValues,
  useSavePipelineValues,
  useSaveValues,
} from "../od-data";
import { Panel, SaveState, StageEmpty } from "../ui";
import { parseCsv, parseNumber, toCsv } from "../sheet";

type Tab = "indicadores" | "desgloses" | "calor" | "mapas" | "tuberia";
const TOTAL = "total";

export function CaptureStation(props: StationProps) {
  const { data, report } = props;
  const [tab, setTab] = useState<Tab>("indicadores");
  if (!report?.uuid) return <StageEmpty title="Elige un informe">Las cifras se cargan informe por informe.</StageEmpty>;

  const counts = {
    indicadores: data.rows.indicators.filter((i) => i.report_id === report.uuid).length,
    desgloses: data.rows.breakdowns.filter((b) => b.report_id === report.uuid).length,
    calor: data.rows.heatmaps.filter((h) => h.report_id === report.uuid).length,
    mapas: data.rows.maps.filter((m) => m.report_id === report.uuid).length,
    tuberia: data.rows.pipelines.filter((p) => p.report_id === report.uuid).length,
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "indicadores" as Tab, label: "Indicadores" },
    { id: "desgloses" as Tab, label: "Desgloses" },
    { id: "calor" as Tab, label: "Mapas de calor" },
    { id: "mapas" as Tab, label: "Mapas" },
    { id: "tuberia" as Tab, label: "Tubería" },
  ].filter((t) => t.id === "indicadores" || counts[t.id] > 0);

  return (
    <div className="oda-stack">
      {report.status === "publicado" && (
        <p className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          Este informe está publicado: lo que guardes se ve en el portal de inmediato. En Publicación puedes revisar los
          cambios o pasarlo a borrador mientras cargas.
        </p>
      )}

      <div className="oda-tabs" role="tablist" aria-label="Qué cifras cargar">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="oda-tab" onClick={() => setTab(t.id)}>
            {t.label}
            <span className="oda-tab__count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {tab === "indicadores" && <IndicatorCapture key={report.uuid} {...props} />}
      {tab === "desgloses" && <BreakdownCapture key={report.uuid} {...props} />}
      {tab === "calor" && <HeatmapCapture key={report.uuid} {...props} />}
      {tab === "mapas" && <MapCapture key={report.uuid} {...props} />}
      {tab === "tuberia" && <PipelineCapture key={report.uuid} {...props} />}
    </div>
  );
}

/* --- Indicadores ---------------------------------------------------------------- */

function IndicatorCapture({ data, report, periodId, canEdit }: StationProps) {
  const save = useSaveValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  const [pasted, setPasted] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const indicators = data.rows.indicators.filter((i) => i.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const campuses = data.rows.campuses;
  const years = data.catalog.years;

  // Índice de lo guardado: indicador|año|campus → valor.
  const stored = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const v of data.rows.values) map.set(`${v.indicator_id}|${v.year}|${v.campus_id ?? TOTAL}`, v.value === null ? null : Number(v.value));
    return map;
  }, [data.rows.values]);

  // Una fila por indicador y campus; el total va primero cuando se captura aparte.
  const rows: GridRow[] = indicators.flatMap((indicator) => {
    const first: GridRow = {
      key: `${indicator.id}::${TOTAL}`,
      label: indicator.label,
      sub: `Total institucional · ${indicator.aggregation === "suma" ? "suma de campus" : "reportado"} · ${indicator.unit}`,
      groupStart: true,
      format: indicator.format,
    };
    return [
      first,
      ...campuses.map((c) => ({ key: `${indicator.id}::${c.campus_id}`, label: c.label, sub: indicator.label, format: indicator.format })),
    ];
  });
  const columns: GridColumn[] = years.map((y) => ({ key: String(y), label: String(y) }));

  const split = (rowKey: string) => {
    const [indicatorId, campus] = rowKey.split("::");
    return { indicator: indicators.find((i) => i.id === indicatorId)!, campus };
  };
  const storedValue = (rowKey: string, column: string) => {
    const { indicator, campus } = split(rowKey);
    return stored.get(`${indicator.id}|${column}|${campus}`) ?? null;
  };
  const sumFor = (indicator: OdIndicatorRow, year: string) => {
    const parts = campuses.map((c) => {
      const key = cellKey(`${indicator.id}::${c.campus_id}`, year);
      return key in draft ? draft[key] : stored.get(`${indicator.id}|${year}|${c.campus_id}`) ?? null;
    });
    return parts.every((p) => p !== null && p !== undefined) ? parts.reduce<number>((a, b) => a + (b as number), 0) : null;
  };

  const changes = Object.keys(draft).length;

  const commitSave = () => {
    const values = Object.entries(draft).map(([key, value]) => {
      const [rowKey, year] = key.split("|");
      const { indicator, campus } = split(rowKey);
      return { indicator_id: indicator.id, year: Number(year), campus_id: campus === TOTAL ? null : campus, value };
    });
    save.mutate(
      { periodId, reportId: report!.uuid!, kind: via, fileName: upload?.fileName, values },
      { onSuccess: () => { setDraft({}); setVia("rejilla"); setPasted(null); setUpload(null); } },
    );
  };

  /* Plantilla: una fila por indicador y campus, con claves para volver a leerla. */
  const downloadTemplate = () => {
    const header = ["clave", "indicador", "unidad", "campus", ...years.map(String)];
    const body = indicators.flatMap((indicator) =>
      [{ slug: "total", label: "Total institucional", id: TOTAL }, ...campuses.map((c) => ({ slug: c.slug, label: c.label, id: c.campus_id }))]
        .filter((c) => !(indicator.aggregation === "suma" && c.id === TOTAL))
        .map((c) => [
          indicator.key, indicator.label, indicator.unit, c.slug,
          ...years.map((y) => {
            const v = stored.get(`${indicator.id}|${y}|${c.id}`);
            return v === undefined || v === null ? "" : String(v).replace(".", ",");
          }),
        ]),
    );
    downloadText(`plantilla-${report!.slug}-${data.rows.period.label}.csv`, toCsv([header, ...body]));
  };

  const readUpload = async (file: File) => {
    const text = await file.text();
    const table = parseCsv(text);
    const [header, ...lines] = table;
    const errors: string[] = [];
    const next: Record<CellKey, number | null> = {};
    const diff: UploadPreview["diff"] = [];
    if (!header) {
      setUpload({ fileName: file.name, errors: ["El archivo está vacío."], diff: [], draft: {} });
      return;
    }
    const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
    const keyCol = col("clave");
    const campusCol = col("campus");
    const yearCols = years.map((y) => [y, header.findIndex((h) => h.trim() === String(y))] as const).filter(([, i]) => i >= 0);
    if (keyCol < 0 || campusCol < 0) errors.push('Faltan las columnas "clave" y "campus": usa la plantilla descargada.');
    if (yearCols.length === 0) errors.push(`No hay columnas de año del periodo ${data.rows.period.label}.`);

    lines.forEach((line, index) => {
      if (keyCol < 0 || campusCol < 0) return;
      const indicator = indicators.find((i) => i.key === line[keyCol]?.trim());
      const slug = line[campusCol]?.trim().toLowerCase();
      const campus = slug === "total" || slug === "todos" ? TOTAL : campuses.find((c) => c.slug === slug)?.campus_id;
      if (!indicator) return errors.push(`Fila ${index + 2}: la clave "${line[keyCol]}" no es un indicador de este informe.`);
      if (!campus) return errors.push(`Fila ${index + 2}: el campus "${line[campusCol]}" no está en el periodo.`);
      if (campus === TOTAL && indicator.aggregation === "suma") return;
      for (const [year, i] of yearCols) {
        const parsed = parseNumber(line[i] ?? "");
        if (!parsed.ok) {
          errors.push(`Fila ${index + 2}, ${year}: ${parsed.reason}.`);
          continue;
        }
        const before = stored.get(`${indicator.id}|${year}|${campus}`) ?? null;
        if (parsed.value !== before) {
          next[cellKey(`${indicator.id}::${campus}`, String(year))] = parsed.value;
          diff.push({ label: `${indicator.label} · ${campus === TOTAL ? "Total" : campuses.find((c) => c.campus_id === campus)?.label} · ${year}`, before, after: parsed.value, format: indicator.format });
        }
      }
    });
    setUpload({ fileName: file.name, errors, diff, draft: next });
  };

  return (
    <Panel
      id="oda-captura"
      title={`Cifras de ${report!.name}`}
      description={
        <>
          {indicators.length} indicadores × {campuses.length} campus × {years.length} años. Vacío es "sin reportar", nunca cero.
          Pega un rango de Excel desde la casilla donde empieza.
        </>
      }
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={changes ? `${changes} ${changes === 1 ? "casilla cambiada" : "casillas cambiadas"}` : undefined} />
          <button type="button" className="button-ghost" onClick={downloadTemplate}>
            <Icon name="download" size={15} /> <span>Plantilla<span className="oda-label-long"> CSV</span></span>
          </button>
          <button type="button" className="button-ghost" disabled={!canEdit} onClick={() => fileInput.current?.click()}>
            <Icon name="document" size={15} /> <span>Cargar<span className="oda-label-long"> plantilla</span></span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readUpload(file);
              event.target.value = "";
            }}
          />
          {changes > 0 && (
            <button type="button" className="button-ghost" onClick={() => { setDraft({}); setPasted(null); }}>
              Descartar
            </button>
          )}
          <button type="button" className="button-primary" disabled={!canEdit || changes === 0 || save.isPending} onClick={commitSave}>
            Guardar {changes > 0 ? changes : ""}
          </button>
        </>
      }
    >
      {pasted !== null && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={15} /> Se pegaron {pasted} casillas. Revisa las marcadas y guarda.
        </p>
      )}

      {upload && (
        <UploadReview
          preview={upload}
          onCancel={() => setUpload(null)}
          onApply={() => {
            setDraft({ ...draft, ...upload.draft });
            setVia("plantilla");
            setUpload({ ...upload, applied: true });
          }}
        />
      )}

      {indicators.length === 0 ? (
        <StageEmpty title="El informe no tiene indicadores">Créalos en Estructura y KPI.</StageEmpty>
      ) : (
        <DataGrid
          label={`Cifras de ${report!.name} por indicador, campus y año`}
          rows={rows}
          columns={columns}
          stored={storedValue}
          draft={draft}
          onDraft={(next) => {
            setDraft(next);
          }}
          onPasted={(count) => {
            setPasted(count);
            setVia("pegado");
          }}
          readOnly={!canEdit}
          lockedReason={(rowKey) => {
            const { indicator, campus } = split(rowKey);
            return campus === TOTAL && indicator.aggregation === "suma" ? "Se calcula sumando los campus" : null;
          }}
          lockedValue={(rowKey, column) => sumFor(split(rowKey).indicator, column)}
        />
      )}
    </Panel>
  );
}

interface UploadPreview {
  fileName: string;
  errors: string[];
  diff: { label: string; before: number | null; after: number | null; format: OdIndicatorRow["format"] }[];
  draft: Record<CellKey, number | null>;
  applied?: boolean;
}

function UploadReview({ preview, onApply, onCancel }: { preview: UploadPreview; onApply: () => void; onCancel: () => void }) {
  return (
    <div className="oda-upload" role="region" aria-label="Revisión de la plantilla">
      <div className="oda-upload__head">
        <strong>{preview.fileName}</strong>
        <span>
          {preview.diff.length} {preview.diff.length === 1 ? "cambio" : "cambios"} · {preview.errors.length} {preview.errors.length === 1 ? "aviso" : "avisos"}
        </span>
        <span className="oda-upload__actions">
          {preview.applied ? (
            <span className="oda-badge" data-tone="ok"><Icon name="check" size={12} /> Pasado a la rejilla: falta guardar</span>
          ) : (
            <>
              <button type="button" className="button-ghost" onClick={onCancel}>Descartar archivo</button>
              <button type="button" className="button-secondary" disabled={preview.diff.length === 0} onClick={onApply}>
                Pasar {preview.diff.length} cambios a la rejilla
              </button>
            </>
          )}
        </span>
      </div>
      {preview.errors.length > 0 && (
        <ul className="oda-upload__errors">
          {preview.errors.slice(0, 8).map((e) => <li key={e}><Icon name="alert" size={13} /> {e}</li>)}
          {preview.errors.length > 8 && <li>y {preview.errors.length - 8} más…</li>}
        </ul>
      )}
      {preview.diff.length > 0 && (
        <div className="oda-upload__diff">
          <table className="oda-table">
            <thead>
              <tr><th scope="col">Casilla</th><th scope="col">Antes</th><th scope="col">Después</th></tr>
            </thead>
            <tbody>
              {preview.diff.slice(0, 40).map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td data-empty={d.before === null || undefined}>{formatValue(d.before, d.format)}</td>
                  <td data-changed>{formatValue(d.after, d.format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.diff.length > 40 && <p className="oda-muted">y {preview.diff.length - 40} cambios más.</p>}
        </div>
      )}
    </div>
  );
}

/* --- Desgloses -------------------------------------------------------------------- */

function BreakdownCapture({ data, report, periodId, canEdit }: StationProps) {
  const breakdowns = data.rows.breakdowns.filter((b) => b.report_id === report!.uuid);
  const [active, setActive] = useState(breakdowns[0]?.id);
  const breakdown = breakdowns.find((b) => b.id === active) ?? breakdowns[0];
  const save = useSaveBreakdownValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [newLabel, setNewLabel] = useState("");
  const [extraLabels, setExtraLabels] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!breakdown) return null;

  const values = data.rows.breakdownValues.filter((v) => v.breakdown_id === breakdown.id);
  const labels = [
    ...Array.from(new Set(values.sort((a, b) => a.position - b.position).map((v) => v.label))),
    ...extraLabels,
  ].filter((l) => !removed.includes(l));
  const years = data.catalog.years;
  const stored = (label: string, year: string) => {
    const v = values.find((x) => x.label === label && String(x.year) === year);
    return v?.value === undefined || v?.value === null ? null : Number(v.value);
  };
  const changes = Object.keys(draft).length + removed.length;

  return (
    <Panel
      id="oda-desgloses"
      title="Desgloses"
      description="Categorías por año, para el total institucional. La ficha las muestra en circular o en barras."
      actions={
        <>
          {breakdowns.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Desglose</span>
              <select value={breakdown.id} onChange={(e) => { setActive(e.target.value); setDraft({}); setExtraLabels([]); setRemoved([]); }}>
                {breakdowns.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </label>
          )}
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button
            type="button"
            className="button-primary"
            disabled={!canEdit || changes === 0 || save.isPending}
            onClick={() => {
              const rows = labels.flatMap((label, position) =>
                years.map((year) => {
                  const key = cellKey(label, String(year));
                  const value = key in draft ? draft[key] : stored(label, String(year));
                  return { breakdown_id: breakdown.id, year, label, position: position + 1, value };
                }),
              ).filter((r) => r.value !== null || values.some((v) => v.label === r.label && v.year === r.year));
              save.mutate(
                { periodId, reportId: report!.uuid!, breakdownId: breakdown.id, values: rows, removeLabels: removed, kind: via },
                { onSuccess: () => { setDraft({}); setExtraLabels([]); setRemoved([]); } },
              );
            }}
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <p className="oda-panel__lede"><strong>{breakdown.title}</strong> · {breakdown.unit}</p>
      <DataGrid
        label={breakdown.title}
        rowHeader="Categoría"
        rows={labels.map((l) => ({ key: l, label: l, format: breakdown.format }))}
        columns={years.map((y) => ({ key: String(y), label: String(y) }))}
        stored={stored}
        draft={draft}
        onDraft={setDraft}
        onPasted={() => setVia("pegado")}
        readOnly={!canEdit}
      />
      {canEdit && (
        <div className="oda-add-row">
          <input aria-label="Nueva categoría" placeholder="Nueva categoría" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <button type="button" className="button-secondary" disabled={!newLabel.trim() || labels.includes(newLabel.trim())} onClick={() => { setExtraLabels([...extraLabels, newLabel.trim()]); setNewLabel(""); }}>
            <Icon name="plus" size={15} /> Añadir categoría
          </button>
          {labels.length > 0 && (
            <label className="oda-add-select">
              <span className="sr-only">Quitar categoría</span>
              <select value="" onChange={(e) => e.target.value && setRemoved([...removed, e.target.value])}>
                <option value="">Quitar categoría…</option>
                {labels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </Panel>
  );
}

/* --- Mapas de calor ------------------------------------------------------------------- */

function HeatmapCapture({ data, report, periodId, canEdit }: StationProps) {
  const heatmaps = data.rows.heatmaps.filter((h) => h.report_id === report!.uuid);
  const [active, setActive] = useState(heatmaps[0]?.id);
  const heatmap = heatmaps.find((h) => h.id === active) ?? heatmaps[0];
  const save = useSaveHeatmapCells();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!heatmap) return null;

  const cells = data.rows.heatmapCells.filter((c) => c.heatmap_id === heatmap.id);
  const stored = (row: string, column: string) => {
    const c = cells.find((x) => String(x.row_index) === row && String(x.column_index) === column);
    return c?.value === undefined || c?.value === null ? null : Number(c.value);
  };
  const changes = Object.keys(draft).length;

  return (
    <Panel
      id="oda-calor"
      title="Mapas de calor"
      description={`Casilla vacía = ${heatmap.empty_meaning}. Filas y columnas se definen en Estructura y KPI.`}
      actions={
        <>
          {heatmaps.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Mapa de calor</span>
              <select value={heatmap.id} onChange={(e) => { setActive(e.target.value); setDraft({}); }}>
                {heatmaps.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
              </select>
            </label>
          )}
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button
            type="button"
            className="button-primary"
            disabled={!canEdit || changes === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  periodId, reportId: report!.uuid!, kind: via,
                  cells: Object.entries(draft).map(([key, value]) => {
                    const [row, column] = key.split("|");
                    return { heatmap_id: heatmap.id, row_index: Number(row), column_index: Number(column), value };
                  }),
                },
                { onSuccess: () => setDraft({}) },
              )
            }
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <p className="oda-panel__lede"><strong>{heatmap.title}</strong> · {heatmap.row_label} × {heatmap.column_label} · {heatmap.unit}</p>
      <DataGrid
        label={heatmap.title}
        rowHeader={heatmap.row_label || "Fila"}
        rows={heatmap.rows.map((r, i) => ({ key: String(i), label: r, format: heatmap.format }))}
        columns={heatmap.columns.map((c, i) => ({ key: String(i), label: c }))}
        stored={stored}
        draft={draft}
        onDraft={setDraft}
        onPasted={() => setVia("pegado")}
        readOnly={!canEdit}
      />
    </Panel>
  );
}

/* --- Mapas ------------------------------------------------------------------------------ */

function MapCapture({ data, report, periodId, canEdit }: StationProps) {
  const maps = data.rows.maps.filter((m) => m.report_id === report!.uuid);
  const [active, setActive] = useState(maps[0]?.id);
  const map = maps.find((m) => m.id === active) ?? maps[0];
  const years = data.catalog.years;
  const [year, setYear] = useState(years[years.length - 1]);
  const save = useSaveMapValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!map) return null;

  const campuses = data.rows.campuses;
  const values = data.rows.mapValues.filter((v) => v.map_id === map.id && v.year === year);
  const stored = (dept: string, campus: string) => {
    const v = values.find((x) => x.department_code === dept && x.campus_id === campus);
    return v ? Number(v.value) : null;
  };
  const changes = Object.keys(draft).length;

  return (
    <Panel
      id="oda-mapas"
      title="Mapas por departamento"
      description="Personas por departamento de origen (o de cobertura) y campus. Una casilla vacía quita el departamento del mapa."
      actions={
        <>
          {maps.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Mapa</span>
              <select value={map.id} onChange={(e) => { setActive(e.target.value); setDraft({}); }}>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </label>
          )}
          <label className="oda-add-select">
            <span className="sr-only">Año</span>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setDraft({}); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button
            type="button"
            className="button-primary"
            disabled={!canEdit || changes === 0 || save.isPending}
            onClick={async () => {
              // Una escritura por campus: la base borra y actualiza por (mapa, año, campus).
              for (const campus of campuses) {
                const entries = Object.entries(draft).filter(([key]) => key.endsWith(`|${campus.campus_id}`));
                if (!entries.length) continue;
                await save.mutateAsync({
                  periodId, reportId: report!.uuid!, mapId: map.id, year, campusId: campus.campus_id, kind: via,
                  values: entries.filter(([, v]) => v !== null).map(([key, value]) => ({
                    map_id: map.id, year, campus_id: campus.campus_id, department_code: key.split("|")[0], value: value as number,
                  })),
                  remove: entries.filter(([, v]) => v === null).map(([key]) => key.split("|")[0]),
                });
              }
              setDraft({});
            }}
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <p className="oda-panel__lede"><strong>{map.title}</strong> · corte {year} · {map.unit}</p>
      <DataGrid
        label={`${map.title}, ${year}`}
        rowHeader="Departamento"
        rows={DEPARTMENTS.map((d) => ({ key: d.code, label: d.name, sub: `DANE ${d.code}` }))}
        columns={campuses.map((c) => ({ key: c.campus_id, label: c.label }))}
        stored={stored}
        draft={draft}
        onDraft={setDraft}
        onPasted={() => setVia("pegado")}
        readOnly={!canEdit}
      />
    </Panel>
  );
}

/* --- Tubería ------------------------------------------------------------------------------- */

function PipelineCapture({ data, report, periodId, canEdit }: StationProps) {
  const pipeline = data.rows.pipelines.find((p) => p.report_id === report!.uuid);
  const values = data.rows.pipelineValues.filter((v) => v.pipeline_id === pipeline?.id);
  const cohorts = Array.from(new Set(values.map((v) => v.cohort))).sort((a, b) => a - b);
  const [cohort, setCohort] = useState(cohorts[cohorts.length - 1] ?? data.rows.period.start_year);
  const [extraCohorts, setExtraCohorts] = useState<number[]>([]);
  const save = useSavePipelineValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!pipeline) return null;

  const campuses = data.rows.campuses;
  const allCohorts = Array.from(new Set([...cohorts, ...extraCohorts])).sort((a, b) => a - b);
  const stored = (campus: string, stage: string) => {
    const v = values.find((x) => x.cohort === cohort && (x.campus_id ?? TOTAL) === campus && String(x.stage_index) === stage);
    return v?.remaining ?? null;
  };
  const changes = Object.keys(draft).length;

  return (
    <Panel
      id="oda-tuberia"
      title="Tubería de permanencia"
      description="Estudiantes de la cohorte que siguen al llegar a cada etapa, por campus. El total se suma solo. Una etapa vacía es un tramo que la cohorte aún no cursa."
      actions={
        <>
          <label className="oda-add-select">
            <span className="sr-only">Cohorte</span>
            <select value={cohort} onChange={(e) => { setCohort(Number(e.target.value)); setDraft({}); }}>
              {allCohorts.map((c) => <option key={c} value={c}>Cohorte {c}</option>)}
            </select>
          </label>
          {canEdit && (
            <button type="button" className="button-ghost" onClick={() => {
              const next = (allCohorts[allCohorts.length - 1] ?? data.rows.period.start_year - 1) + 1;
              setExtraCohorts([...extraCohorts, next]);
              setCohort(next);
              setDraft({});
            }}>
              <Icon name="plus" size={15} /> Cohorte
            </button>
          )}
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button
            type="button"
            className="button-primary"
            disabled={!canEdit || changes === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  periodId, reportId: report!.uuid!, kind: via,
                  values: Object.entries(draft).map(([key, value]) => {
                    const [campus, stage] = key.split("|");
                    const previous = values.find((x) => x.cohort === cohort && x.campus_id === campus && String(x.stage_index) === stage);
                    return {
                      pipeline_id: pipeline.id, cohort, campus_id: campus, stage_index: Number(stage),
                      remaining: value === null ? null : Math.round(value), main_cause: previous?.main_cause ?? "",
                    };
                  }),
                },
                { onSuccess: () => setDraft({}) },
              )
            }
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <p className="oda-panel__lede"><strong>{pipeline.title}</strong> · cohorte {cohort}</p>
      <DataGrid
        label={`${pipeline.title}, cohorte ${cohort}`}
        rowHeader="Campus"
        rows={campuses.map((c) => ({ key: c.campus_id, label: c.label, format: "entero" as const }))}
        columns={pipeline.stages.map((s, i) => ({ key: String(i), label: s }))}
        stored={stored}
        draft={draft}
        onDraft={setDraft}
        onPasted={() => setVia("pegado")}
        readOnly={!canEdit}
      />
    </Panel>
  );
}
