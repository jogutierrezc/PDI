/* =============================================================================
   El taller · editor del tablero de indicadores, dentro de su bloque.

   Una rejilla por indicador con TODOS los años del periodo a la vez: el total
   institucional y cada campus por fila; por columna, cada año con sus periodos
   1 y 2 y la cifra del año, o una sola casilla por año si el dato se reporta
   por año. El corte de arriba («Así lo ve el público») no recorta nada aquí.

   Las reglas son las de Captura, por construcción: la misma rejilla (DataGrid),
   el mismo modelo (`indicatorGridModel`) y la misma cifra del año
   (`annualFigure`). Lo bloqueado dice por qué debajo de la rejilla, no solo al
   pasar el puntero. Vacío es «sin reportar», nunca cero.

   Junto al nombre de cada dato se elige cómo se reporta y su regla del año,
   con la mutación que usa Estructura. En modo completo se suman los campos de
   definición que hoy viven allí.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import type { OdAggregation, OdAnnualRule, OdDirection, OdIndicatorRow, OdOffice, OdPeriodCampus, OdValueFormat } from "../../../../types/database";
import { ANNUAL_RULE_HINT, ANNUAL_RULE_LABEL, REPORTING_HINT, REPORTING_LABEL } from "../../../datos-abiertos/data/terms";
import type { Reporting } from "../../../datos-abiertos/data/terms";
import { DataGrid } from "../DataGrid";
import type { GridColumn, GridRow } from "../DataGrid";
import { TOTAL, byYear, indicatorColumns, indicatorGridModel, rowKeyOf } from "../indicator-grid";
import type { LockKind, LockTexts } from "../indicator-grid";
import { AGGREGATION_LABEL, DIRECTION_LABEL, FORMAT_LABEL } from "../indicator-labels";
import type { CellKey } from "../sheet";
import { annualFiguresOf, reportingPatch, termFiguresOf } from "./draft";
import type { IndicatorPatch, TallerMode } from "./draft";

/** Los motivos de bloqueo, dichos a quien llena (de usted, y sin mandar a otra pantalla si se cambia aquí). */
const LOCK_TEXTS: LockTexts = {
  noYear: (_indicator, year) => `Este dato no se reporta en ${year}. Los años con dato se cambian en la vista clásica, en Captura.`,
  byYear: () => "Este dato se reporta por año: no tiene periodos 1 y 2.",
  annualRule: (indicator) => `Se calcula con la regla del año: ${ANNUAL_RULE_LABEL[indicator.annual_rule].toLowerCase()}.`,
  summed: "Se suma de los campus. Queda vacío si falta alguno.",
};

const LOCK_LEGEND: Record<LockKind, (indicator: OdIndicatorRow) => string> = {
  suma: () => "Total institucional: se suma de los campus y queda vacío si falta alguno. Usted escribe la cifra de cada campus.",
  regla: (indicator) => `Columna «Año»: se calcula con la regla de este dato (${ANNUAL_RULE_LABEL[indicator.annual_rule].toLowerCase()}). Se cambia arriba, en «Cifra del año».`,
  "por-ano": () => "Este dato se reporta por año: no tiene periodos 1 y 2.",
  "sin-ano": () => "Años sin dato: este indicador no se reporta en esos años. Se cambian en la vista clásica, en Captura › «Años con dato por indicador».",
};

const TERM_LABELS = { A: "Periodo 1", B: "Periodo 2", anual: "Año" } as const;

export interface KpiEditorProps {
  /** Los indicadores de este tablero, con sus ajustes pendientes ya puestos. */
  indicators: OdIndicatorRow[];
  campuses: OdPeriodCampus[];
  offices: OdOffice[];
  years: number[];
  stored: Map<string, number | null>;
  values: Record<CellKey, number | null>;
  mode: TallerMode;
  canEdit: boolean;
  onValues: (next: Record<CellKey, number | null>) => void;
  onPasted: (count: number) => void;
  onPatch: (indicatorId: string, patch: IndicatorPatch) => void;
  /** Enlace a Estructura y KPI de la vista clásica: crear o borrar indicadores. */
  structureHref: string;
}

export function KpiEditor({ indicators, campuses, offices, years, stored, values, mode, canEdit, onValues, onPasted, onPatch, structureHref }: KpiEditorProps) {
  const campusIds = useMemo(() => campuses.map((c) => c.campus_id), [campuses]);
  const period = years.length ? (years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`) : "";

  if (!indicators.length) {
    return (
      <div className="odt-editor">
        <p className="odt-empty">
          Este tablero todavía no tiene indicadores. Elija cuáles muestra en «Indicadores de este tablero», más abajo, o{" "}
          <Link to={structureHref}>cree un indicador en la vista clásica (Estructura y KPI)</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="odt-editor">
      <p className="odt-tip">
        <strong>Está llenando todos los años del periodo {period}.</strong> Escriba en cada casilla o pegue desde Excel: copie el
        rango en Excel, toque aquí la primera casilla y pegue (Ctrl+V). Se llenan todas desde ahí, hacia la derecha y hacia
        abajo. Deje vacía la casilla que no se ha reportado: no escriba cero.
      </p>
      {indicators.map((indicator) => (
        <IndicatorEditor
          key={indicator.id}
          indicator={indicator}
          campuses={campuses}
          campusIds={campusIds}
          offices={offices}
          years={years}
          stored={stored}
          values={values}
          mode={mode}
          canEdit={canEdit}
          onValues={onValues}
          onPasted={onPasted}
          onPatch={(patch) => onPatch(indicator.id, patch)}
        />
      ))}
      <p className="odt-note">
        Para crear un indicador nuevo, borrar uno o cambiar sus años con dato, use la{" "}
        <Link to={structureHref}>vista clásica (Estructura y KPI)</Link>.
      </p>
    </div>
  );
}

function IndicatorEditor({
  indicator,
  campuses,
  campusIds,
  offices,
  years,
  stored,
  values,
  mode,
  canEdit,
  onValues,
  onPasted,
  onPatch,
}: {
  indicator: OdIndicatorRow;
  campuses: OdPeriodCampus[];
  campusIds: string[];
  offices: OdOffice[];
  years: number[];
  stored: Map<string, number | null>;
  values: Record<CellKey, number | null>;
  mode: TallerMode;
  canEdit: boolean;
  onValues: (next: Record<CellKey, number | null>) => void;
  onPasted: (count: number) => void;
  onPatch: (patch: IndicatorPatch) => void;
}) {
  const annual = byYear(indicator);
  /** Cambio de «cómo se reporta» que espera confirmación porque esconde cifras ya cargadas. */
  const [asking, setAsking] = useState<{ to: Reporting; figures: number } | null>(null);
  const id = `odt-ind-${indicator.id}`;

  const model = useMemo(
    () => indicatorGridModel({ indicators: [indicator], campusIds, stored, draft: values, texts: LOCK_TEXTS }),
    [indicator, campusIds, stored, values],
  );

  const rows: GridRow[] = useMemo(
    () => [
      { key: rowKeyOf(indicator.id, TOTAL), label: "Total institucional", format: indicator.format, groupStart: true },
      ...campuses.map((c) => ({ key: rowKeyOf(indicator.id, c.campus_id), label: c.label, format: indicator.format })),
    ],
    [indicator.id, indicator.format, campuses],
  );

  const columns: GridColumn[] = useMemo(() => {
    const base = indicatorColumns(years, { byTerm: !annual, annual: true, labels: TERM_LABELS });
    // Por año: una sola casilla por año, con el año como rótulo y sin segunda fila de cabecera.
    return annual ? base.map((c) => ({ key: c.key, label: c.group ?? c.label, ariaLabel: c.ariaLabel })) : base;
  }, [years, annual]);

  // Los motivos de bloqueo que de verdad aparecen en esta rejilla, para decirlos a la vista.
  const locks = useMemo(() => {
    const found = new Set<LockKind>();
    for (const row of rows) for (const column of columns) {
      const kind = model.lockKind(row.key, column.key);
      if (kind) found.add(kind);
    }
    return (["suma", "regla", "por-ano", "sin-ano"] as LockKind[]).filter((k) => found.has(k));
  }, [rows, columns, model]);

  const chooseReporting = (to: Reporting) => {
    if (to === (annual ? "anual" : "periodo")) return;
    // Lo que deja de verse: por año, las cifras de los periodos 1 y 2; por periodo, las del año cuando la regla las calcula.
    const figures = to === "anual" ? termFiguresOf(indicator.id, stored, values) : annualFiguresOf(indicator.id, stored, values);
    if (figures > 0) setAsking({ to, figures });
    else onPatch(reportingPatch(indicator, to));
  };

  return (
    <section className="odt-indicator" aria-labelledby={`${id}-nombre`}>
      <header className="odt-indicator__head">
        <h4 id={`${id}-nombre`}>
          {indicator.label || "Indicador sin nombre"}
          <small>{indicator.unit || "sin unidad"}</small>
        </h4>

        <div className="odt-field" role="group" aria-labelledby={`${id}-reporta`}>
          <span className="odt-field__label" id={`${id}-reporta`}>Este dato se reporta</span>
          <span className="odt-seg">
            {(["periodo", "anual"] as Reporting[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={(annual ? "anual" : "periodo") === option}
                disabled={!canEdit}
                onClick={() => chooseReporting(option)}
              >
                {REPORTING_LABEL[option]}
              </button>
            ))}
          </span>
          <small className="odt-field__hint">{REPORTING_HINT[annual ? "anual" : "periodo"]}</small>
        </div>

        {!annual && (
          <label className="odt-field">
            <span className="odt-field__label">Cifra del año</span>
            <select value={indicator.annual_rule} disabled={!canEdit} onChange={(e) => onPatch({ annual_rule: e.target.value as OdAnnualRule })}>
              {Object.entries(ANNUAL_RULE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <small className="odt-field__hint">{ANNUAL_RULE_HINT[indicator.annual_rule]}</small>
          </label>
        )}
      </header>

      {asking && (
        <div className="odt-ask" role="alertdialog" aria-labelledby={`${id}-pregunta`} aria-describedby={`${id}-consecuencia`}>
          <p>
            <strong id={`${id}-pregunta`}>
              <Icon name="alert" size={15} /> ¿Reportar «{indicator.label}» {asking.to === "anual" ? "por año" : "por periodo"}?
            </strong>
            <span id={`${id}-consecuencia`}>
              {asking.to === "anual"
                ? `Este dato tiene ${asking.figures} ${asking.figures === 1 ? "cifra cargada" : "cifras cargadas"} en los periodos 1 y 2. No se borran: quedan guardadas, pero dejan de verse en la ficha y en esta rejilla mientras el dato se reporte por año. La cifra de cada año se escribe en su casilla. Si vuelve a «Por periodo», reaparecen.`
                : `Este dato tiene ${asking.figures} ${asking.figures === 1 ? "cifra cargada" : "cifras cargadas"} por año. No se borran: quedan guardadas, pero la cifra del año pasa a calcularse con los periodos 1 y 2 y las cargadas dejan de verse, salvo que elija la regla «Se reporta aparte».`}
            </span>
          </p>
          <div className="odt-ask__actions">
            <button type="button" className="button-ghost" autoFocus onClick={() => setAsking(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                onPatch(reportingPatch(indicator, asking.to));
                setAsking(null);
              }}
            >
              Sí, reportar {asking.to === "anual" ? "por año" : "por periodo"}
            </button>
          </div>
        </div>
      )}

      <div className="odt-grid">
        <DataGrid
          label={`Cifras de ${indicator.label} por campus${annual ? " y año" : ", año y periodo"}`}
          rows={rows}
          columns={columns}
          stored={model.storedValue}
          draft={values}
          onDraft={onValues}
          onPasted={onPasted}
          readOnly={!canEdit}
          lockedReason={model.lockedReason}
          lockedValue={model.lockedValue}
          rowHeader="Campus"
          liveCommit
          describeLocked
        />
      </div>

      {locks.length > 0 && (
        <ul className="odt-locks" aria-label="Por qué algunas casillas no se escriben">
          {locks.map((kind) => (
            <li key={kind}>
              <span className="odt-locks__swatch" aria-hidden="true" />
              {LOCK_LEGEND[kind](indicator)}
            </li>
          ))}
        </ul>
      )}

      {mode === "completo" && (
        <fieldset className="odt-definition" disabled={!canEdit}>
          <legend>Definición de este dato</legend>
          <NameField key={indicator.id} value={indicator.label} onChange={(label) => onPatch({ label })} />
          <label className="admin-field">
            <span>Unidad</span>
            <input value={indicator.unit} placeholder="estudiantes, %, m²…" onChange={(e) => onPatch({ unit: e.target.value })} />
          </label>
          <label className="admin-field">
            <span>Formato</span>
            <select value={indicator.format} onChange={(e) => onPatch({ format: e.target.value as OdValueFormat })}>
              {Object.entries(FORMAT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Lectura de la variación</span>
            <select value={indicator.direction} onChange={(e) => onPatch({ direction: e.target.value as OdDirection })}>
              {Object.entries(DIRECTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Total institucional</span>
            <select value={indicator.aggregation} onChange={(e) => onPatch({ aggregation: e.target.value as OdAggregation })}>
              {Object.entries(AGGREGATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Oficina que reporta</span>
            <select value={indicator.office_id ?? ""} onChange={(e) => onPatch({ office_id: e.target.value || null })}>
              <option value="">Sin oficina</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {!indicator.office_id && <small className="odt-field__hint">Toda cifra dice quién la reporta: elija la oficina antes de publicar.</small>}
          </label>
          <label className="admin-field admin-field--wide">
            <span>Qué mide y cómo</span>
            <textarea rows={2} value={indicator.definition} onChange={(e) => onPatch({ definition: e.target.value })} />
          </label>
          <p className="odt-note admin-field--wide">
            La clave «{indicator.key}» no se cambia: enlaza las cifras ya cargadas.
          </p>
        </fieldset>
      )}
    </section>
  );
}

/** El nombre no puede quedar vacío: mientras lo esté, se avisa y no se guarda. */
function NameField({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const [text, setText] = useState(value);
  const empty = !text.trim();
  return (
    <label className="admin-field admin-field--wide">
      <span>Nombre del indicador</span>
      <input
        value={text}
        aria-invalid={empty || undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim()) onChange(e.target.value);
        }}
        onBlur={() => {
          if (empty) setText(value);
        }}
      />
      {empty && (
        <small className="odt-field__hint" data-tone="risk">
          El nombre no puede quedar vacío: se conserva «{value}».
        </small>
      )}
    </label>
  );
}
