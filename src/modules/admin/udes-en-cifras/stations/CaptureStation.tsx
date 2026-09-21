/* =============================================================================
   Estación 3 · Captura.

   Las cifras del informe, año por año (periodos A y B) y campus por campus, en
   rejillas que se llenan de tres formas:
   · escribiendo casilla por casilla;
   · pegando un rango copiado de Excel desde la casilla enfocada;
   · descargando la plantilla del informe, llenándola y subiéndola: antes de
     aplicar se ve cada cambio (antes → después) y cada fila que no se entendió.

   Un informe que llega como documento (Investigación: Word + CSV) se carga
   entero desde "Importar informe".

   Nada se guarda hasta pulsar Guardar. Cada guardado deja rastro en od_imports
   con cuántas casillas cambió y por qué vía llegaron.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { downloadText, formatValue } from "../../../datos-abiertos/data/open-data";
import { DEPARTMENTS } from "../../../datos-abiertos/data/colombia-map";
import type { OdAnnualRule, OdImportKind, OdIndicatorRow, OdTerm } from "../../../../types/database";
import { ANNUAL_RULE_LABEL, REPORTING_HINT, REPORTING_LABEL, annualFigure, cutLabel, periodText, termLabel } from "../../../datos-abiertos/data/terms";
import type { Reporting } from "../../../datos-abiertos/data/terms";
import type { StationProps } from "../OdAdmin";
import { DataGrid, cellKey } from "../DataGrid";
import type { CellKey, GridColumn, GridRow } from "../DataGrid";
import {
  useSaveBreakdown,
  useSaveBreakdownValues,
  useSaveHeatmapCells,
  useSaveHistoryValues,
  useSaveIndicator,
  useSaveMap,
  useSaveMapValues,
  useSavePipelineValues,
  useSaveValues,
} from "../od-data";
import { ConfirmButton, Panel, PeriodInput, SaveState, StageEmpty, YearPicker, periodRange } from "../ui";
import { parseCsv, parseNumber, toCsv } from "../sheet";
import { ImportReport, profileFor } from "./ImportReport";
import { MobilityCapture } from "./MobilityCapture";
import { OriginCapture } from "./OriginCapture";
import { RankingCapture } from "./RankingCapture";
import { SaberProCapture } from "./SaberProCapture";
import { SaberTytCapture } from "./SaberTytCapture";
import { FreeSetCapture } from "./FreeSetCapture";
import { MedalCapture } from "./MedalCapture";
import { PasteMessages, PasteTable, breakdownFromTable, heatmapFromTable } from "../PasteTable";
import { IMPORT_PROFILES } from "../import/investigacion";

type Tab = "importar" | "indicadores" | "desgloses" | "historico" | "calor" | "mapas" | "tuberia" | "rankings" | "saber" | "tyt" | "libres" | "medalleros";
const TOTAL = "total";

export function CaptureStation(props: StationProps) {
  const { data, report } = props;
  const [tab, setTab] = useState<Tab>("indicadores");
  if (!report?.uuid) return <StageEmpty title="Elige un informe">Las cifras se cargan informe por informe.</StageEmpty>;

  const importable = Boolean(profileFor(report.slug));
  const counts = {
    importar: data.rows.sections.filter((s) => s.report_id === report.uuid).length,
    indicadores: data.rows.indicators.filter((i) => i.report_id === report.uuid).length,
    desgloses: data.rows.breakdowns.filter((b) => b.report_id === report.uuid).length,
    historico: data.rows.histories.filter((h) => h.report_id === report.uuid).length,
    calor: data.rows.heatmaps.filter((h) => h.report_id === report.uuid).length,
    mapas: data.rows.maps.filter((m) => m.report_id === report.uuid).length,
    tuberia: data.rows.pipelines.filter((p) => p.report_id === report.uuid).length,
    rankings: (data.rows.rankings ?? []).filter((r) => r.report_id === report.uuid).length,
    saber: (data.rows.saberPro ?? []).filter((sp) => sp.report_id === report.uuid).length,
    tyt: (data.rows.saberTyt ?? []).filter((t) => t.report_id === report.uuid).length,
    libres: (data.rows.freeSets ?? []).filter((fs) => fs.report_id === report.uuid).length,
    medalleros: (data.rows.medalBoards ?? []).filter((m) => m.report_id === report.uuid).length,
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: "importar" as Tab, label: "Importar informe" },
    { id: "indicadores" as Tab, label: "Indicadores" },
    { id: "desgloses" as Tab, label: "Desgloses" },
    { id: "historico" as Tab, label: "Evolución histórica" },
    { id: "calor" as Tab, label: "Mapas de calor" },
    { id: "mapas" as Tab, label: "Mapas" },
    { id: "tuberia" as Tab, label: "Tuberías" },
    { id: "rankings" as Tab, label: "Rankings" },
    { id: "saber" as Tab, label: "Saber PRO" },
    { id: "tyt" as Tab, label: "Saber TyT" },
    { id: "libres" as Tab, label: "Conjuntos libres" },
    { id: "medalleros" as Tab, label: "Medalleros" },
  ].filter((t) => t.id === "indicadores" || t.id === "importar" || counts[t.id] > 0);

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

      {tab === "importar" &&
        (importable ? (
          <ImportReport key={report.uuid} {...props} />
        ) : (
          <StageEmpty title={`${report.name} todavía no tiene importador de informe`}>
            El importador lee el Word y los CSV con el formato de cada oficina. Hoy está listo para{" "}
            {IMPORT_PROFILES.map((p) => p.name).join(", ")}: elige ese informe en la lista de la izquierda. Las cifras de
            este informe se cargan en las otras pestañas, con la rejilla o la plantilla CSV.
          </StageEmpty>
        ))}
      {tab === "indicadores" && <IndicatorCapture key={report.uuid} {...props} />}
      {tab === "desgloses" && <BreakdownCapture key={report.uuid} {...props} />}
      {tab === "historico" && <HistoryCapture key={report.uuid} {...props} />}
      {tab === "calor" && <HeatmapCapture key={report.uuid} {...props} />}
      {tab === "mapas" && <MapCapture key={report.uuid} {...props} />}
      {tab === "tuberia" && <PipelineCapture key={report.uuid} {...props} />}
      {tab === "rankings" && <RankingCapture key={report.uuid} {...props} />}
      {tab === "saber" && <SaberProCapture key={report.uuid} {...props} />}
      {tab === "tyt" && <SaberTytCapture key={report.uuid} {...props} />}
      {tab === "libres" && <FreeSetCapture key={report.uuid} {...props} />}
      {tab === "medalleros" && <MedalCapture key={report.uuid} {...props} />}
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
  const [yearFilter, setYearFilter] = useState("todos");
  const [showAnnual, setShowAnnual] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const indicators = data.rows.indicators.filter((i) => i.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const campuses = data.rows.campuses;
  const years = data.catalog.years;
  const shownYears = yearFilter === "todos" ? years : years.filter((y) => String(y) === yearFilter);
  const byYear = (indicator: OdIndicatorRow) => indicator.reporting === "anual";
  const anyReported = indicators.some((i) => i.annual_rule === "reportado" || byYear(i));
  const anyByTerm = indicators.some((i) => !byYear(i));
  // Con indicadores por año, la columna del año se captura: no se oculta.
  const annualShown = showAnnual || indicators.some(byYear);

  // Índice de lo guardado: indicador|año|periodo|campus → valor.
  const stored = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const v of data.rows.values) {
      map.set(`${v.indicator_id}|${v.year}|${v.term}|${v.campus_id ?? TOTAL}`, v.value === null ? null : Number(v.value));
    }
    return map;
  }, [data.rows.values]);

  // Una fila por indicador y campus; el total va primero.
  const rows: GridRow[] = indicators.flatMap((indicator) => {
    const first: GridRow = {
      key: `${indicator.id}::${TOTAL}`,
      label: indicator.label,
      sub: `Total institucional · ${indicator.aggregation === "suma" ? "suma de campus" : "reportado"} · ${byYear(indicator) ? "se reporta por año" : `año: ${ANNUAL_RULE_LABEL[indicator.annual_rule].toLowerCase()}`} · ${indicator.unit}`,
      groupStart: true,
      format: indicator.format,
    };
    return [
      first,
      ...campuses.map((c) => ({ key: `${indicator.id}::${c.campus_id}`, label: c.label, sub: indicator.label, format: indicator.format })),
    ];
  });

  // Por año: periodo A, periodo B y la cifra del año (calculada, salvo en "reportado").
  // Si todos se reportan por año, la rejilla es una columna por año.
  const columns: GridColumn[] = shownYears.flatMap((y) => [
    ...(anyByTerm
      ? [
          { key: `${y}-A`, label: "1", group: String(y), ariaLabel: `${y}, periodo 1` },
          { key: `${y}-B`, label: "2", group: String(y), ariaLabel: `${y}, periodo 2` },
        ]
      : []),
    ...(annualShown ? [{ key: `${y}-anual`, label: "Año", group: String(y), ariaLabel: `${y}, cifra del año` }] : []),
  ]);

  const split = (rowKey: string) => {
    const [indicatorId, campus] = rowKey.split("::");
    return { indicator: indicators.find((i) => i.id === indicatorId)!, campus };
  };
  const parseColumn = (column: string) => {
    const [year, term] = column.split("-");
    return { year, term: term as OdTerm };
  };
  const storedValue = (rowKey: string, column: string) => {
    const { indicator, campus } = split(rowKey);
    const { year, term } = parseColumn(column);
    return stored.get(`${indicator.id}|${year}|${term}|${campus}`) ?? null;
  };
  /** Lo que se ve en la casilla: el cambio sin guardar o lo guardado. */
  const currentValue = (indicatorId: string, campus: string, year: string, term: OdTerm) => {
    const key = cellKey(`${indicatorId}::${campus}`, `${year}-${term}`);
    return key in draft ? draft[key] : stored.get(`${indicatorId}|${year}|${term}|${campus}`) ?? null;
  };
  /** Total institucional de lo que se suma: la suma de los campus, o nada si falta uno. */
  const sumFor = (indicator: OdIndicatorRow, year: string, term: OdTerm) => {
    const parts = campuses.map((c) => currentValue(indicator.id, c.campus_id, year, term));
    return parts.every((p) => p !== null && p !== undefined) ? parts.reduce<number>((a, b) => a + (b as number), 0) : null;
  };
  const cellValue = (indicator: OdIndicatorRow, campus: string, year: string, term: OdTerm) =>
    campus === TOTAL && indicator.aggregation === "suma" ? sumFor(indicator, year, term) : currentValue(indicator.id, campus, year, term);

  const lockedReason = (rowKey: string, column: string) => {
    const { indicator, campus } = split(rowKey);
    const { year, term } = parseColumn(column);
    if (indicator.years && indicator.years.length && !indicator.years.includes(Number(year))) {
      return `${indicator.label} no se reporta en ${year}. Cámbialo en "Años con dato".`;
    }
    if (byYear(indicator) && term !== "anual") {
      return `${indicator.label} se reporta por año: sin periodos 1 y 2. Se cambia en Estructura y KPI.`;
    }
    if (term === "anual" && indicator.annual_rule !== "reportado" && !byYear(indicator)) {
      return `Cifra del año: ${ANNUAL_RULE_LABEL[indicator.annual_rule].toLowerCase()}. Se cambia en Estructura y KPI.`;
    }
    return campus === TOTAL && indicator.aggregation === "suma" ? "Se calcula sumando los campus" : null;
  };
  const lockedValue = (rowKey: string, column: string) => {
    const { indicator, campus } = split(rowKey);
    const { year, term } = parseColumn(column);
    if (indicator.years && indicator.years.length && !indicator.years.includes(Number(year))) return null;
    if (byYear(indicator)) return term === "anual" ? cellValue(indicator, campus, year, "anual") : null;
    if (term !== "anual") return cellValue(indicator, campus, year, term);
    return annualFigure(
      indicator.annual_rule,
      cellValue(indicator, campus, year, "A"),
      cellValue(indicator, campus, year, "B"),
      cellValue(indicator, campus, year, "anual"),
    ).value;
  };

  const changes = Object.keys(draft).length;

  const commitSave = () => {
    const values = Object.entries(draft).map(([key, value]) => {
      const [rowKey, column] = key.split("|");
      const { indicator, campus } = split(rowKey);
      const { year, term } = parseColumn(column);
      return { indicator_id: indicator.id, year: Number(year), term, campus_id: campus === TOTAL ? null : campus, value };
    });
    save.mutate(
      { periodId, reportId: report!.uuid!, kind: via, fileName: upload?.fileName, values },
      { onSuccess: () => { setDraft({}); setVia("rejilla"); setPasted(null); setUpload(null); } },
    );
  };

  /* Plantilla: una fila por indicador y campus, una columna por año y periodo
     (2024-A, 2024-B y, si algún indicador la reporta aparte, 2024-anual). */
  const templateTerms: OdTerm[] = anyByTerm ? (anyReported ? ["A", "B", "anual"] : ["A", "B"]) : ["anual"];
  const downloadTemplate = () => {
    const header = ["clave", "indicador", "unidad", "cifra del año", "campus", ...years.flatMap((y) => templateTerms.map((term) => (term === "anual" ? `${y}-anual` : cutLabel(y, term))))];
    const body = indicators.flatMap((indicator) =>
      [{ slug: "total", label: "Total institucional", id: TOTAL }, ...campuses.map((c) => ({ slug: c.slug, label: c.label, id: c.campus_id }))]
        .filter((c) => !(indicator.aggregation === "suma" && c.id === TOTAL))
        .map((c) => [
          indicator.key, indicator.label, indicator.unit, ANNUAL_RULE_LABEL[indicator.annual_rule], c.slug,
          ...years.flatMap((y) =>
            templateTerms.map((term) => {
              const v = stored.get(`${indicator.id}|${y}|${term}|${c.id}`);
              return v === undefined || v === null ? "" : String(v).replace(".", ",");
            }),
          ),
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
    // Columnas "2024-A", "2024-B", "2024-anual" de los años del periodo.
    const cutCols = header
      .map((h, i) => {
        // "2024-1" y "2024-2"; también "2024-A" y "2024-B" de plantillas anteriores.
        const match = h.trim().match(/^(\d{4})-(1|2|a|b|anual)$/i);
        if (!match || !years.includes(Number(match[1]))) return null;
        const raw = match[2].toLowerCase();
        const term = (raw === "anual" ? "anual" : raw === "1" || raw === "a" ? "A" : "B") as OdTerm;
        return { year: Number(match[1]), term, index: i };
      })
      .filter((c): c is { year: number; term: OdTerm; index: number } => c !== null);
    if (keyCol < 0 || campusCol < 0) errors.push('Faltan las columnas "clave" y "campus": usa la plantilla descargada.');
    if (cutCols.length === 0) {
      errors.push(`No hay columnas de periodo del ${data.rows.period.label} (como "${years[0]}-1" y "${years[0]}-2"): descarga la plantilla de nuevo.`);
    }

    lines.forEach((line, index) => {
      if (keyCol < 0 || campusCol < 0) return;
      const indicator = indicators.find((i) => i.key === line[keyCol]?.trim());
      const slug = line[campusCol]?.trim().toLowerCase();
      const campus = slug === "total" || slug === "todos" ? TOTAL : campuses.find((c) => c.slug === slug)?.campus_id;
      if (!indicator) return errors.push(`Fila ${index + 2}: la clave "${line[keyCol]}" no es un indicador de este informe.`);
      if (!campus) return errors.push(`Fila ${index + 2}: el campus "${line[campusCol]}" no está en el periodo.`);
      if (campus === TOTAL && indicator.aggregation === "suma") return;
      for (const { year, term, index: i } of cutCols) {
        const parsed = parseNumber(line[i] ?? "");
        if (!parsed.ok) {
          errors.push(`Fila ${index + 2}, ${term === "anual" ? `${year}-anual` : cutLabel(year, term)}: ${parsed.reason}.`);
          continue;
        }
        if (byYear(indicator) && term !== "anual") {
          if (parsed.value !== null) errors.push(`Fila ${index + 2}, ${cutLabel(year, term)}: "${indicator.label}" se reporta por año; el valor se ignora.`);
          continue;
        }
        if (term === "anual" && indicator.annual_rule !== "reportado" && !byYear(indicator)) {
          if (parsed.value !== null) errors.push(`Fila ${index + 2}, ${year}-anual: "${indicator.label}" calcula el año con los periodos 1 y 2; el valor se ignora.`);
          continue;
        }
        const before = stored.get(`${indicator.id}|${year}|${term}|${campus}`) ?? null;
        if (parsed.value !== before) {
          next[cellKey(`${indicator.id}::${campus}`, `${year}-${term}`)] = parsed.value;
          diff.push({
            label: `${indicator.label} · ${campus === TOTAL ? "Total" : campuses.find((c) => c.campus_id === campus)?.label} · ${term === "anual" ? `${year}-año` : cutLabel(year, term)}`,
            before,
            after: parsed.value,
            format: indicator.format,
          });
        }
      }
    });
    setUpload({ fileName: file.name, errors, diff, draft: next });
  };

  const hiddenChanges = Object.keys(draft).filter((key) => !shownYears.some((y) => key.split("|")[1]?.startsWith(`${y}-`))).length;

  return (
    <Panel
      id="oda-captura"
      title={`Cifras de ${report!.name}`}
      description={
        <>
          {indicators.length} indicadores × {campuses.length} campus × {years.length} años. Los indicadores por periodo se
          capturan en los periodos 1 y 2 y la cifra del año sale de su regla; los que se reportan por año, en la columna Año. Vacío es "sin reportar", nunca cero. Pega un rango de Excel desde
          la casilla donde empieza.
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
          <Icon name="check" size={15} /> Se pegaron {pasted} casillas; las columnas calculadas se saltaron. Revisa las marcadas y guarda.
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
        <>
          <div className="oda-grid-toolbar">
            <label className="oda-grid-toolbar__field">
              <span>Años</span>
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="todos">Todos ({years[0]}-{years[years.length - 1]})</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </label>
            <label className="oda-check">
              <input type="checkbox" checked={annualShown} disabled={indicators.some(byYear)} onChange={(e) => setShowAnnual(e.target.checked)} />
              Mostrar la cifra del año
            </label>
            {hiddenChanges > 0 && (
              <span className="oda-badge" data-tone="warn">
                <Icon name="alert" size={12} /> {hiddenChanges} {hiddenChanges === 1 ? "cambio" : "cambios"} en años ocultos
              </span>
            )}
          </div>
          <IndicatorYears indicators={indicators} years={years} canEdit={canEdit} />
          <DataGrid
            label={`Cifras de ${report!.name} por indicador, campus, año y periodo`}
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
            lockedReason={lockedReason}
            lockedValue={lockedValue}
          />
        </>
      )}
    </Panel>
  );
}

/** Qué años reporta cada indicador. Se guarda al marcar: la rejilla y el portal lo siguen al instante. */
function IndicatorYears({ indicators, years, canEdit }: { indicators: OdIndicatorRow[]; years: number[]; canEdit: boolean }) {
  const save = useSaveIndicator();
  const partial = indicators.filter((i) => i.years && i.years.length).length;
  return (
    <details className="oda-years-panel">
      <summary>
        Años con dato por indicador
        <small>{partial ? `${partial} con años elegidos` : "todos los indicadores usan todos los años"}</small>
      </summary>
      <div className="oda-years-panel__body">
        <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
        <ul>
          {indicators.map((indicator) => (
            <li key={indicator.id}>
              <strong>{indicator.label}</strong>
              <YearPicker
                years={years}
                value={indicator.years}
                disabled={!canEdit || save.isPending}
                label={`Años con dato de ${indicator.label}`}
                onChange={(next) => save.mutate({ id: indicator.id, report_id: indicator.report_id, years: next })}
              />
            </li>
          ))}
        </ul>
      </div>
    </details>
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
  const saveBreakdown = useSaveBreakdown();
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
  const years = breakdown.years && breakdown.years.length
    ? data.catalog.years.filter((y) => breakdown.years!.includes(y))
    : data.catalog.years;
  const reporting: Reporting = breakdown.reporting ?? "periodo";
  const rule = reporting === "anual" ? "reportado" : breakdown.annual_rule ?? "reportado";
  const columns = years.flatMap((year) => ((reporting === "anual" ? ["anual"] : ["A", "B", "anual"]) as OdTerm[]).map((term) => ({
    key: `${year}-${term}`, label: term === "anual" ? "Año" : termLabel(term), group: String(year),
    ariaLabel: `${year}, ${term === "anual" ? "cifra del año" : `periodo ${termLabel(term)}`}`,
  })));
  const stored = (label: string, column: string) => {
    const [year, term] = column.split("-");
    const v = values.find((x) => x.label === label && String(x.year) === year && (x.term ?? "anual") === term);
    return v?.value === undefined || v?.value === null ? null : Number(v.value);
  };
  const current = (label: string, column: string) => {
    const key = cellKey(label, column);
    return key in draft ? draft[key] : stored(label, column);
  };
  const changes = Object.keys(draft).length + removed.length;

  return (
    <Panel
      id="oda-desgloses"
      title="Desgloses"
      description="Categorías para el total institucional, por periodo (1 y 2, el año sigue la regla del desglose) o con una cifra por año."
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
                columns.filter((c) => rule === "reportado" || !c.key.endsWith("-anual")).map((column) => {
                  const [year, term] = column.key.split("-");
                  return { breakdown_id: breakdown.id, year: Number(year), term: term as OdTerm, label, position: position + 1, value: current(label, column.key) };
                }),
              ).filter((r) => r.value !== null || values.some((v) => v.label === r.label && v.year === r.year && (v.term ?? "anual") === r.term));
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
      <div className="oda-form-grid">
      <label className="admin-field">
        <span>Se reporta</span>
        <select
          value={reporting}
          disabled={!canEdit || saveBreakdown.isPending || save.isPending || changes > 0}
          onChange={(e) => {
            const next = e.target.value as Reporting;
            saveBreakdown.mutate({
              id: breakdown.id, report_id: breakdown.report_id, reporting: next,
              annual_rule: next === "anual" ? "reportado" : breakdown.annual_rule === "reportado" ? "suma" : breakdown.annual_rule,
            });
          }}
        >
          {Object.entries(REPORTING_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <small>{REPORTING_HINT[reporting]} Las cifras ya capturadas se conservan al cambiar.</small>
      </label>
      {reporting === "periodo" && (
      <label className="admin-field">
        <span>Cifra del año por categoría</span>
        <select value={rule} disabled={!canEdit || saveBreakdown.isPending || save.isPending || changes > 0}
          onChange={(e) => saveBreakdown.mutate({ id: breakdown.id, report_id: breakdown.report_id, annual_rule: e.target.value as OdAnnualRule })}>
          {Object.entries(ANNUAL_RULE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <small>Guarda las cifras pendientes antes de cambiar la regla. Las cifras anuales capturadas se conservan al elegir una regla calculada.</small>
      </label>
      )}
      </div>
      <SaveState pending={saveBreakdown.isPending} error={saveBreakdown.error} success={saveBreakdown.isSuccess} />
      <YearPicker
        years={data.catalog.years}
        value={breakdown.years}
        disabled={!canEdit || saveBreakdown.isPending || save.isPending || changes > 0}
        onChange={(next) => saveBreakdown.mutate({ id: breakdown.id, report_id: breakdown.report_id, years: next })}
      />
      {canEdit && (
        <PasteTable
          hint={
            reporting === "anual"
              ? "Categorías en la primera columna y un año por columna (2023, 2024…). También sirve con los años hacia abajo y las categorías a lo ancho."
              : "Categorías en la primera columna y un corte por columna: 2024-1, 2024-2 y, si la cifra del año se reporta aparte, 2024. También sirve con los cortes hacia abajo."
          }
          render={(table, reset) => {
            const read = breakdownFromTable(table, { years, reporting, calculated: rule !== "reportado" });
            const fresh = read.labels.filter((l) => !labels.includes(l));
            const missing = labels.filter((l) => !read.labels.includes(l));
            const ok = read.errors.length === 0 && read.values.length > 0;
            return (
              <div className="oda-paste__preview">
                <p>
                  <strong>{read.labels.length} {read.labels.length === 1 ? "categoría" : "categorías"}</strong> · {read.values.filter((v) => v.value !== null).length} cifras
                  {read.transposed ? " · la tabla venía con los cortes hacia abajo y se giró" : ""}
                  {fresh.length > 0 ? ` · nuevas: ${fresh.join(", ")}` : ""}
                </p>
                <PasteMessages errors={read.errors} warnings={read.warnings} />
                <div className="oda-paste__actions">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!ok}
                    onClick={() => {
                      const next = { ...draft };
                      for (const { label, column, value } of read.values) {
                        // Una casilla vacía solo cuenta si borra algo guardado.
                        if (value === null && stored(label, column) === null) continue;
                        next[cellKey(label, column)] = value;
                      }
                      setExtraLabels([...extraLabels, ...fresh.filter((l) => !extraLabels.includes(l))]);
                      setRemoved(removed.filter((l) => !read.labels.includes(l)));
                      setDraft(next);
                      setVia("pegado");
                      reset();
                    }}
                  >
                    Pasar a la rejilla
                  </button>
                  {missing.length > 0 && ok && (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => {
                        const next = { ...draft };
                        for (const { label, column, value } of read.values) {
                          if (value === null && stored(label, column) === null) continue;
                          next[cellKey(label, column)] = value;
                        }
                        setExtraLabels([...extraLabels.filter((l) => read.labels.includes(l)), ...fresh.filter((l) => !extraLabels.includes(l))]);
                        setRemoved([...removed, ...missing.filter((l) => !removed.includes(l))]);
                        setDraft(next);
                        setVia("pegado");
                        reset();
                      }}
                    >
                      Pasar y quitar las {missing.length} que no están en la tabla
                    </button>
                  )}
                  <small>Revisa la rejilla y pulsa Guardar.</small>
                </div>
              </div>
            );
          }}
        />
      )}
      <DataGrid
        label={breakdown.title}
        rowHeader="Categoría"
        rows={labels.map((l) => ({ key: l, label: l, format: breakdown.format }))}
        columns={columns}
        lockedReason={(_label, column) => column.endsWith("-anual") && rule !== "reportado" ? ANNUAL_RULE_LABEL[rule] : null}
        lockedValue={(label, column) => {
          const year = column.split("-")[0];
          return annualFigure(rule, current(label, `${year}-A`), current(label, `${year}-B`), current(label, `${year}-anual`)).value;
        }}
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
      description={`Casilla vacía = ${heatmap.empty_meaning}. Filas y columnas se definen en Estructura y KPI, o pegando la tabla completa.`}
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
      {canEdit && (
        <PasteTable
          hint={`${heatmap.row_label || "Filas"} en la primera columna y ${(heatmap.column_label || "columnas").toLowerCase()} en la primera fila, con las cifras en el cruce. Si los rótulos coinciden con los de este mapa, las cifras pasan a la rejilla; si no, la tabla trae su propia estructura.`}
          disabled={save.isPending}
          render={(table, reset) => {
            const read = heatmapFromTable(table);
            const same =
              read.rows.length === heatmap.rows.length && read.rows.every((r, i) => r === heatmap.rows[i]) &&
              read.columns.length === heatmap.columns.length && read.columns.every((c, i) => c === heatmap.columns[i]);
            const ok = read.errors.length === 0 && read.rows.length > 0;
            const count = read.values.flat().filter((v) => v !== null).length;
            const cellsOf = () =>
              read.values.flatMap((row, r) => row.map((value, c) => ({ heatmap_id: heatmap.id, row_index: r, column_index: c, value })));
            return (
              <div className="oda-paste__preview">
                <p>
                  <strong>{read.rows.length} × {read.columns.length}</strong> · {count} cifras
                  {same ? " · mismas filas y columnas que el mapa" : ` · estructura nueva (antes ${heatmap.rows.length} × ${heatmap.columns.length})`}
                </p>
                {!same && ok && (
                  <p className="oda-paste__warning">
                    Filas: {read.rows.slice(0, 8).join(", ")}{read.rows.length > 8 ? "…" : ""}. Columnas: {read.columns.slice(0, 8).join(", ")}{read.columns.length > 8 ? "…" : ""}.
                    Al guardar se reemplazan las filas, las columnas y todas las cifras del mapa.
                  </p>
                )}
                <PasteMessages errors={read.errors} />
                <div className="oda-paste__actions">
                  {same ? (
                    <button
                      type="button"
                      className="button-primary"
                      disabled={!ok}
                      onClick={() => {
                        const next = { ...draft };
                        read.values.forEach((row, r) =>
                          row.forEach((value, c) => {
                            if (value === null && stored(String(r), String(c)) === null) return;
                            next[cellKey(String(r), String(c))] = value;
                          }),
                        );
                        setDraft(next);
                        setVia("pegado");
                        reset();
                      }}
                    >
                      Pasar a la rejilla
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-primary"
                      disabled={!ok || save.isPending}
                      onClick={() =>
                        save.mutate(
                          {
                            periodId, reportId: report!.uuid!, kind: "pegado",
                            structure: { heatmapId: heatmap.id, rows: read.rows, columns: read.columns },
                            cells: cellsOf().filter((cell) => cell.value !== null),
                          },
                          { onSuccess: () => { setDraft({}); reset(); } },
                        )
                      }
                    >
                      Guardar estructura y cifras
                    </button>
                  )}
                  <small>{same ? "Revisa la rejilla y pulsa Guardar." : "Se guarda de inmediato."}</small>
                </div>
              </div>
            );
          }}
        />
      )}
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

function MapCapture(props: StationProps) {
  const { data, report, periodId, canEdit } = props;
  const maps = data.rows.maps.filter((m) => m.report_id === report!.uuid);
  const [active, setActive] = useState(maps[0]?.id);
  const map = maps.find((m) => m.id === active) ?? maps[0];
  const years = map?.years && map.years.length ? data.catalog.years.filter((y) => map.years!.includes(y)) : data.catalog.years;
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear !== null && years.includes(pickedYear) ? pickedYear : years[years.length - 1];
  const save = useSaveMapValues();
  const saveMap = useSaveMap();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!map) return null;
  if (map.mode === "municipio") {
    // 1.122 municipios no se capturan en una rejilla: se cargan desde el archivo
    // de registros o una tabla contada, y se cuentan en el navegador.
    return <OriginCapture key={map.id} {...props} maps={maps} map={map} onPickMap={(id) => { setActive(id); setDraft({}); }} />;
  }
  if (map.mode === "entrante" || map.mode === "saliente" || map.mode === "convenios") {
    return (
      <MobilityCapture key={map.id} {...props} maps={maps} map={map} onPickMap={(id) => { setActive(id); setDraft({}); }} />
    );
  }

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
      title="Mapas"
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
      <YearPicker
        years={data.catalog.years}
        value={map.years}
        disabled={!canEdit || saveMap.isPending}
        onChange={(next) => saveMap.mutate({ id: map.id, report_id: map.report_id, years: next })}
      />
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

const PIPELINE_TOTAL = "total";

type PeriodValue = { year: number; term: "A" | "B" };

/** "2014-A a 2023-B" → desde y hasta; "2014-A" → el mismo periodo en los dos. */
function parseFlow(label: string | undefined, fallback: PeriodValue): { from: PeriodValue; to: PeriodValue } {
  const parse = (text: string | undefined): PeriodValue | null => {
    const match = text?.trim().match(/^(\d{4})-(A|B|1|2)$/);
    return match ? { year: Number(match[1]), term: match[2] === "A" || match[2] === "1" ? "A" : "B" } : null;
  };
  const [a, b] = (label ?? "").split(" a ");
  const from = parse(a) ?? fallback;
  return { from, to: parse(b) ?? from };
}

const flowLabel = (from: PeriodValue, to: PeriodValue) => {
  const [first, last] = periodRange(from, to).filter((_, i, list) => i === 0 || i === list.length - 1);
  return last && last !== first ? `${first} a ${last}` : first;
};

/**
 * Cada tubería es un solo flujo de cohortes, reportado junto: "2014-A a 2023-B".
 * Si una base antigua trae varias cohortes, se trabaja la que tiene más etapas
 * con dato y las demás se pueden quitar.
 */
function PipelineCapture({ data, report, periodId, canEdit }: StationProps) {
  const pipelines = data.rows.pipelines.filter((p) => p.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const [active, setActive] = useState(pipelines[0]?.id);
  const pipeline = pipelines.find((p) => p.id === active) ?? pipelines[0];
  const values = data.rows.pipelineValues.filter((v) => v.pipeline_id === pipeline?.id);
  const storedLabels = Array.from(new Set(values.map((v) => String(v.cohort))));
  const storedLabel = storedLabels
    .map((label) => ({ label, filled: values.filter((v) => String(v.cohort) === label && v.value !== null).length }))
    .sort((a, b) => b.filled - a.filled)[0]?.label;
  const legacy = storedLabels.filter((label) => label !== storedLabel);
  const period = data.rows.period;
  const initial = parseFlow(storedLabel, { year: period.start_year, term: "A" });
  const [from, setFrom] = useState<PeriodValue>(initial.from);
  const [to, setTo] = useState<PeriodValue>(initial.to);
  const save = useSavePipelineValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [dropLegacy, setDropLegacy] = useState(false);
  const [via, setVia] = useState<OdImportKind>("rejilla");
  if (!pipeline) return null;

  const measure = pipeline.measure ?? "estudiantes";
  const percent = measure !== "estudiantes";
  const format: "decimal" | "entero" = percent ? "decimal" : "entero";
  const campuses = data.rows.campuses;
  const label = flowLabel(from, to);
  // La base solo acepta cohortes "2014-A" o "2014-A a 2023-B" (od_pipeline_values_cohort):
  // un año borrado o a medio escribir se avisa aquí en vez de fallar al guardar.
  const validYear = (year: number) => Number.isInteger(year) && year >= 1900 && year <= 2100;
  const flowError = !validYear(from.year) || !validYear(to.year) ? "Escribe el año de las cohortes con cuatro cifras (por ejemplo, 2014)." : null;
  const renamed = Boolean(storedLabel) && label !== storedLabel;

  const rows: GridRow[] = [
    {
      key: PIPELINE_TOTAL,
      label: "Total institucional",
      sub: percent ? "se captura: los porcentajes no se suman" : "suma de campus",
      groupStart: true,
      format,
    },
    ...campuses.map((c) => ({ key: c.campus_id, label: c.label, format })),
  ];
  // Deserción: una columna por etapa después del ingreso (al ingreso es 0). Estudiantes y permanencia: una por etapa.
  const columns: GridColumn[] =
    measure === "desercion"
      ? pipeline.stages.slice(1).map((stage, i) => ({ key: String(i + 1), label: stage, ariaLabel: `${stage}, deserción acumulada en % de la cohorte` }))
      : pipeline.stages.map((stage, i) => ({ key: String(i), label: stage, ariaLabel: percent ? `${stage}, % del flujo que sigue` : `${stage}, estudiantes` }));

  const storedValue = (campus: string, stage: string) => {
    const v = values.find((x) => String(x.cohort) === storedLabel && (x.campus_id ?? PIPELINE_TOTAL) === campus && String(x.stage_index) === stage);
    return v?.value === undefined || v?.value === null ? null : Number(v.value);
  };
  const current = (campus: string, stage: string) => {
    const k = cellKey(campus, stage);
    return k in draft ? draft[k] : storedValue(campus, stage);
  };

  const invalid = percent ? Object.values(draft).filter((value) => value !== null && (value < 0 || value > 100)).length : 0;
  const changes = Object.keys(draft).length + (renamed ? 1 : 0) + (dropLegacy ? legacy.length : 0);

  const commit = () => {
    // Con el rango cambiado, el flujo entero se guarda con la etiqueta nueva y se
    // borra la anterior; si no, solo las casillas tocadas.
    const cells = renamed
      ? rows.flatMap((row) => columns.map((column) => ({ campus: row.key, stage: column.key, value: current(row.key, column.key) })))
          .filter((cell) => cell.value !== null)
      : Object.entries(draft).map(([key, value]) => {
          const [campus, stage] = key.split("|");
          return { campus, stage, value };
        });
    save.mutate(
      {
        periodId, reportId: report!.uuid!, kind: via, pipelineId: pipeline.id,
        removeCohorts: [...(renamed && storedLabel ? [storedLabel] : []), ...(dropLegacy ? legacy : [])],
        values: cells.map(({ campus, stage, value }) => {
          const campusId = campus === PIPELINE_TOTAL ? null : campus;
          const previous = values.find((x) => String(x.cohort) === storedLabel && x.campus_id === campusId && String(x.stage_index) === stage);
          return {
            pipeline_id: pipeline.id, cohort: label, campus_id: campusId, stage_index: Number(stage),
            value: value === null ? null : percent ? value : Math.round(value), main_cause: previous?.main_cause ?? "",
          };
        }),
      },
      { onSuccess: () => { setDraft({}); setDropLegacy(false); } },
    );
  };

  return (
    <Panel
      id="oda-tuberia"
      title="Tuberías"
      description={
        measure === "estudiantes"
          ? "Un solo flujo de cohortes, reportado junto. Estudiantes del flujo que siguen al llegar a cada etapa, por campus; el total se suma solo y el portal lo muestra como % del ingreso."
          : measure === "permanencia"
            ? "Un solo flujo de cohortes, reportado junto. Porcentaje del flujo que sigue en cada etapa (100 al ingreso), con decimales: 87,5. El total institucional se captura."
            : "Un solo flujo de cohortes, reportado junto. Deserción acumulada: porcentaje de la cohorte que ya se retiró al llegar a cada etapa, con decimales: 22,7. Se muestra tal cual, sin volver a acumular. El total institucional se captura."
      }
      actions={
        <>
          {pipelines.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Tubería</span>
              <select
                value={pipeline.id}
                onChange={(e) => {
                  const next = pipelines.find((p) => p.id === e.target.value);
                  const nextLabel = data.rows.pipelineValues.find((v) => v.pipeline_id === next?.id)?.cohort;
                  const range = parseFlow(nextLabel ? String(nextLabel) : undefined, { year: period.start_year, term: "A" });
                  setActive(e.target.value); setDraft({}); setDropLegacy(false); setFrom(range.from); setTo(range.to);
                }}
              >
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
          )}
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={flowError ? "Revisa las cohortes" : invalid ? `${invalid} fuera de 0-100` : undefined} />
          <button type="button" className="button-primary" disabled={!canEdit || changes === 0 || invalid > 0 || Boolean(flowError) || save.isPending} onClick={commit}>
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <div className="oda-grid-toolbar">
        <span className="oda-grid-toolbar__group" role="group" aria-label="Cohortes que analiza la tubería">
          <span className="oda-grid-toolbar__label">Cohortes</span>
          <PeriodInput label="Desde" value={from} onChange={setFrom} />
          <PeriodInput label="Hasta" value={to} onChange={setTo} />
        </span>
        <span className="oda-badge" data-tone={renamed || flowError ? "warn" : undefined}>
          {flowError ?? (renamed ? `Se guardará como ${periodText(label)} (antes ${periodText(storedLabel ?? "")})` : `Flujo ${periodText(label)}`)}
        </span>
      </div>

      {legacy.length > 0 && (
        <p className="oda-banner" role="note">
          <Icon name="alert" size={16} />
          <span>
            Esta tubería trae {legacy.length} {legacy.length === 1 ? "cohorte antigua" : "cohortes antiguas"} de cuando se capturaba
            una por periodo ({legacy.slice(0, 4).join(", ")}{legacy.length > 4 ? "…" : ""}). El portal usa el flujo {storedLabel}.
          </span>
          {canEdit && (
            <button type="button" className="oda-link-button" onClick={() => setDropLegacy(!dropLegacy)}>
              {dropLegacy ? "No quitarlas" : "Quitarlas al guardar"}
            </button>
          )}
        </p>
      )}

      <p className="oda-panel__lede"><strong>{pipeline.title}</strong> · flujo {label} · {percent ? "% del flujo" : "estudiantes"}</p>
      <DataGrid
        label={`${pipeline.title}, flujo ${label}`}
        rowHeader="Campus"
        rows={rows}
        columns={columns}
        stored={storedValue}
        draft={draft}
        onDraft={setDraft}
        onPasted={() => setVia("pegado")}
        readOnly={!canEdit}
        lockedReason={(campus) => (!percent && campus === PIPELINE_TOTAL ? "Se calcula sumando los campus" : null)}
        lockedValue={(_, stage) => {
          const parts = campuses.map((c) => current(c.campus_id, stage));
          return parts.every((p) => p !== null && p !== undefined) ? parts.reduce<number>((a, b) => a + (b as number), 0) : null;
        }}
      />
    </Panel>
  );
}

/* --- Evolución histórica ----------------------------------------------------------------------- */

const HISTORY_TOTAL = "__total";

function HistoryCapture({ data, report, periodId, canEdit }: StationProps) {
  const histories = data.rows.histories.filter((h) => h.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  const [active, setActive] = useState(histories[0]?.id);
  const history = histories.find((h) => h.id === active) ?? histories[0];
  const save = useSaveHistoryValues();
  const [draft, setDraft] = useState<Record<CellKey, number | null>>({});
  const [via, setVia] = useState<OdImportKind>("rejilla");
  const [extraPeriods, setExtraPeriods] = useState<string[]>([]);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [removedPeriods, setRemovedPeriods] = useState<string[]>([]);
  const [removedCategories, setRemovedCategories] = useState<string[]>([]);
  const [newPeriod, setNewPeriod] = useState<{ year: number; term: "A" | "B" | "anual" }>({ year: data.rows.period.end_year, term: "B" });
  const newLabel = newPeriod.term === "anual" ? String(newPeriod.year) : `${newPeriod.year}-${newPeriod.term}`;
  const [newCategory, setNewCategory] = useState("");
  if (!history) return null;

  const values = data.rows.historyValues.filter((v) => v.history_id === history.id);
  const storedPeriods = Array.from(new Set(values.map((v) => v.period_label))).sort();
  const storedCategories = Array.from(
    new Map(values.filter((v) => v.category !== "").sort((a, b) => a.position - b.position).map((v) => [v.category, v.category])).keys(),
  );
  const periods = Array.from(new Set([...storedPeriods, ...extraPeriods])).filter((p) => !removedPeriods.includes(p)).sort();
  const categories = [...storedCategories, ...extraCategories.filter((c) => !storedCategories.includes(c))].filter((c) => !removedCategories.includes(c));

  const stored = (row: string, period: string) => {
    const category = row === HISTORY_TOTAL ? "" : row;
    const v = values.find((x) => x.category === category && x.period_label === period);
    return v?.value === undefined || v?.value === null ? null : Number(v.value);
  };
  const changes =
    Object.keys(draft).length +
    removedPeriods.filter((p) => storedPeriods.includes(p)).length +
    removedCategories.filter((c) => storedCategories.includes(c)).length;

  const reset = () => {
    setDraft({}); setExtraPeriods([]); setExtraCategories([]); setRemovedPeriods([]); setRemovedCategories([]);
  };

  return (
    <Panel
      id="oda-historico"
      title="Evolución histórica"
      description={`La cifra de ${history.total_label.toLowerCase()} y de cada categoría en los periodos que elijas, también anteriores al informe. Si el total queda vacío, el portal suma las categorías. Un periodo o una categoría sin cifras no se guarda.`}
      actions={
        <>
          {histories.length > 1 && (
            <label className="oda-add-select">
              <span className="sr-only">Evolución histórica</span>
              <select value={history.id} onChange={(e) => { setActive(e.target.value); reset(); }}>
                {histories.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
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
                  periodId, reportId: report!.uuid!, historyId: history.id, kind: via,
                  removePeriods: removedPeriods.filter((p) => storedPeriods.includes(p)),
                  removeCategories: removedCategories.filter((c) => storedCategories.includes(c)),
                  values: Object.entries(draft)
                    .map(([key, value]) => {
                      const [row, period] = key.split("|");
                      const category = row === HISTORY_TOTAL ? "" : row;
                      return { history_id: history.id, period_label: period, category, position: category === "" ? 0 : categories.indexOf(category) + 1, value };
                    })
                    .filter((v) => periods.includes(v.period_label) && (v.category === "" || categories.includes(v.category))),
                },
                { onSuccess: reset },
              )
            }
          >
            Guardar {changes || ""}
          </button>
        </>
      }
    >
      <div className="oda-grid-toolbar">
        {canEdit && (
          <>
            <span className="oda-grid-toolbar__group">
              <PeriodInput label="Periodo" value={newPeriod} onChange={setNewPeriod} allowYear />
              <button
                type="button"
                className="button-secondary"
                disabled={periods.includes(newLabel)}
                onClick={() => {
                  const label = newLabel;
                  setExtraPeriods([...extraPeriods, label]);
                  setRemovedPeriods(removedPeriods.filter((p) => p !== label));
                }}
              >
                <Icon name="plus" size={15} /> Añadir periodo
              </button>
            </span>
            <span className="oda-grid-toolbar__group">
              <input aria-label="Nueva categoría" placeholder="Pregrado, Posgrado…" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <button
                type="button"
                className="button-secondary"
                disabled={!newCategory.trim() || categories.includes(newCategory.trim())}
                onClick={() => {
                  setExtraCategories([...extraCategories, newCategory.trim()]);
                  setRemovedCategories(removedCategories.filter((c) => c !== newCategory.trim()));
                  setNewCategory("");
                }}
              >
                <Icon name="plus" size={15} /> Añadir categoría
              </button>
            </span>
            {(periods.length > 0 || categories.length > 0) && (
              <label className="oda-add-select">
                <span className="sr-only">Quitar periodo o categoría</span>
                <select
                  value=""
                  onChange={(e) => {
                    const [kind, name] = e.target.value.split("::");
                    if (kind === "p") setRemovedPeriods([...removedPeriods, name]);
                    if (kind === "c") setRemovedCategories([...removedCategories, name]);
                  }}
                >
                  <option value="">Quitar…</option>
                  {periods.map((p) => <option key={`p-${p}`} value={`p::${p}`}>Periodo {periodText(p)}</option>)}
                  {categories.map((c) => <option key={`c-${c}`} value={`c::${c}`}>Categoría {c}</option>)}
                </select>
              </label>
            )}
          </>
        )}
      </div>

      {periods.length === 0 ? (
        <StageEmpty title="Añade los periodos que quieres comparar">
          Por ejemplo 2020-1 y 2025-2, o años completos como 2011 y 2025 (elige "Año" en el periodo). Luego escribe el total y, si quieres, categorías como pregrado y posgrado.
        </StageEmpty>
      ) : (
        <>
          <p className="oda-panel__lede"><strong>{history.title}</strong> · {periodText(periods[0] ?? "")} a {periodText(periods[periods.length - 1] ?? "")} · {history.unit}</p>
          <DataGrid
            label={history.title}
            rowHeader="Categoría"
            rows={[
              { key: HISTORY_TOTAL, label: history.total_label, sub: "vacío = suma de categorías", groupStart: true, format: history.format },
              ...categories.map((c) => ({ key: c, label: c, format: history.format })),
            ]}
            columns={periods.map((p) => ({ key: p, label: periodText(p) }))}
            stored={stored}
            draft={draft}
            onDraft={setDraft}
            onPasted={() => setVia("pegado")}
            readOnly={!canEdit}
          />
        </>
      )}
    </Panel>
  );
}
