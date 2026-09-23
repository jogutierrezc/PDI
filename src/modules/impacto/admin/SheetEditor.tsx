/* =============================================================================
   Ficha técnica de un indicador · Catálogo.

   Arriba, lo que trajo la matriz (solo lectura). Debajo, lo que completa
   Planeación. En una versión publicada todo queda en solo lectura: para
   cambiarlo se abre la versión siguiente. Lo que le falta a la ficha se dice
   con palabras, no con un semáforo.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import { FUNCTIONS, LEVELS, functionById } from "../data/catalog";
import { useIndicatorDetail, useResolveFinding, useSaveSheet } from "../data/catalog-db";
import type { DbFinding, DbIndicator, SheetPatch } from "../data/catalog-db";
import { FINDING_LABEL } from "../import/matrix";
import type { FindingKind } from "../import/matrix";

const UNITS = [
  ["numero", "Número"],
  ["porcentaje", "Porcentaje"],
  ["razon", "Razón"],
  ["puntaje", "Puntaje"],
  ["moneda_cop", "Pesos (COP)"],
  ["horas", "Horas"],
] as const;
const CALC = [
  ["conteo", "Conteo"],
  ["razon", "Razón"],
  ["puntaje", "Puntaje"],
  ["comparacion", "Comparación"],
  ["texto", "Texto"],
] as const;
const AGG = [
  ["suma", "Suma"],
  ["razon_de_sumas", "Razón de sumas"],
  ["promedio_ponderado", "Promedio ponderado"],
  ["no_agregable", "No agregable"],
] as const;
const REPORT = [
  ["programa_sede", "Programa y sede"],
  ["programa", "Programa"],
  ["facultad", "Facultad"],
  ["institucional", "Institución"],
] as const;
const MODE = [
  ["manual", "Manual"],
  ["precargado", "Precargado"],
  ["encuesta", "Encuesta"],
  ["calculado", "Calculado"],
] as const;
const DEGREES = [
  ["pregrado", "Pregrado"],
  ["especializacion", "Especialización"],
  ["maestria", "Maestría"],
  ["doctorado", "Doctorado"],
] as const;
const MODALITIES = [
  ["presencial", "Presencial"],
  ["virtual", "Virtual"],
  ["distancia", "A distancia"],
  ["dual", "Dual"],
  ["hibrida", "Híbrida"],
] as const;

type Form = Required<SheetPatch>;

function formOf(i: DbIndicator): Form {
  return {
    code: i.code,
    unit: i.unit as Form["unit"],
    calc_type: i.calc_type as Form["calc_type"],
    numerator_def: i.numerator_def ?? "",
    denominator_def: i.denominator_def ?? "",
    factor: i.factor as Form["factor"],
    aggregation: i.aggregation as Form["aggregation"],
    direction: i.direction as Form["direction"],
    periodicity: i.periodicity as Form["periodicity"],
    report_level: i.report_level as Form["report_level"],
    applies_degrees: i.applies_degrees,
    applies_modalities: i.applies_modalities,
    capture_mode: i.capture_mode as Form["capture_mode"],
    evidence_type: i.evidence_type ?? "",
    evidence_required: i.evidence_required,
    variation_threshold: Number(i.variation_threshold),
    range_min: i.range_min === null ? null : Number(i.range_min),
    range_max: i.range_max === null ? null : Number(i.range_max),
    n_minimum: i.n_minimum,
    allows_over_one: i.allows_over_one,
    validator_function: i.validator_function as Form["validator_function"],
    in_pilot: i.in_pilot,
  };
}

/** Solo lo que cambió, con vacíos como nulos. */
function diff(before: Form, after: Form): SheetPatch {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Form)[]) {
    const a = after[key];
    const b = before[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    patch[key] = typeof a === "string" && a.trim() === "" && key !== "code" ? null : a;
  }
  return patch as SheetPatch;
}

const num = (text: string) => (text.trim() === "" ? null : Number(text.replace(",", ".")));

export function SheetEditor({ indicator, editable, findings }: { indicator: DbIndicator; editable: boolean; findings: DbFinding[] }) {
  const initial = useMemo(() => formOf(indicator), [indicator]);
  const [form, setForm] = useState<Form>(initial);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const detail = useIndicatorDetail(indicator.id);
  const save = useSaveSheet();
  const fn = functionById[indicator.function_id];
  const patch = diff(initial, form);
  const dirty = Object.keys(patch).length > 0;
  const ratio = form.calc_type === "razon" || form.calc_type === "comparacion";

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setNotice("");
  };
  const toggle = (key: "applies_degrees" | "applies_modalities", value: string) =>
    set(key, form[key].includes(value) ? form[key].filter((v) => v !== value) : [...form[key], value]);

  async function submit() {
    setError("");
    try {
      await save.mutateAsync({ id: indicator.id, patch });
      setNotice("Ficha guardada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la ficha.");
    }
  }

  const own = findings.filter((f) => f.sheet === indicator.matrix_sheet && f.row_number === indicator.matrix_row);

  return (
    <aside className="admin-card ia-sheet" style={{ "--tone": fn.tone } as CSSProperties} aria-label={`Ficha de ${indicator.code}`}>
      <header>
        <h2>
          <span className="ia-code">{indicator.code}</span> {indicator.name}
        </h2>
        <p>
          {fn.name} · {LEVELS.find((l) => l.id === indicator.level)?.name} · {indicator.catalog_state}
          {indicator.matrix_sheet && ` · ${indicator.matrix_sheet}, fila ${indicator.matrix_row}`}
        </p>
      </header>

      <dl className="ia-matrix">
        <div>
          <dt>Unidad en la matriz</dt>
          <dd>{indicator.unit_original || "—"}</dd>
        </div>
        <div>
          <dt>Línea base</dt>
          <dd>{detail.data?.baselines.map((b) => `${b.value} (${b.year})`).join(" · ") || "—"}</dd>
        </div>
        <div>
          <dt>Metas</dt>
          <dd>{detail.data?.targets.map((t) => `${t.year}: ${t.numeric_value ?? t.text_value}`).join(" · ") || "—"}</dd>
        </div>
        <div>
          <dt>Responsable en la matriz</dt>
          <dd>{indicator.responsible_original || "—"}</dd>
        </div>
      </dl>
      {detail.data && detail.data.alignments.length > 0 && (
        <ul className="ia-aligns">
          {detail.data.alignments.map((a) => (
            <li key={`${a.kind}-${a.code}`}>
              {a.kind === "pilar" ? `Pilar ${a.code}` : a.kind === "ods" ? `ODS ${a.code}` : a.kind === "cesu" ? `CESU ${a.code}` : a.code}
            </li>
          ))}
        </ul>
      )}

      {own.length > 0 && (
        <div className="ia-sheet__findings">
          <p>Hallazgos de esta fila</p>
          <ul>
            {own.map((f) => (
              // Los hallazgos se resuelven en cualquier versión: son notas del importador, no del catálogo.
              <FindingRow key={f.id} finding={f} editable />
            ))}
          </ul>
        </div>
      )}

      {detail.data && detail.data.missing.length > 0 ? (
        <p className="ia-warning">
          <Icon name="alert" size={14} />
          Ficha incompleta. Falta: {detail.data.missing.join(", ")}.
        </p>
      ) : detail.data ? (
        <p className="ia-ok">
          <Icon name="check" size={14} /> Ficha completa.
        </p>
      ) : null}

      <fieldset className="ia-sheet__form" disabled={!editable || save.isPending}>
        <legend>Ficha técnica {!editable && <small>· versión publicada, solo lectura</small>}</legend>

        <Field label="Código">
          <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} pattern="[IEX][0-9]{2,3}" />
        </Field>
        <label className="ia-check ia-sheet__pilot">
          <input type="checkbox" checked={form.in_pilot} onChange={(e) => set("in_pilot", e.target.checked)} />
          En piloto: se asigna al abrir un periodo y bloquea la publicación si su ficha está incompleta.
        </label>

        <Field label="Tipo de cálculo">
          <Select value={form.calc_type} options={CALC} onChange={(v) => set("calc_type", v as Form["calc_type"])} />
        </Field>
        <Field label="Unidad">
          <Select value={form.unit} options={UNITS} onChange={(v) => set("unit", v as Form["unit"])} />
        </Field>
        <Field label={ratio ? "Qué va en el numerador" : "Qué se cuenta o se mide"} wide>
          <input value={form.numerator_def ?? ""} onChange={(e) => set("numerator_def", e.target.value)} />
        </Field>
        {ratio && (
          <Field label="Qué va en el denominador" wide>
            <input value={form.denominator_def ?? ""} onChange={(e) => set("denominator_def", e.target.value)} />
          </Field>
        )}
        <Field label="Factor">
          <Select
            value={form.factor === null ? null : String(form.factor)}
            options={[
              ["1", "1"],
              ["100", "100 (porcentaje)"],
            ]}
            onChange={(v) => set("factor", v === null ? null : (Number(v) as 1 | 100))}
          />
        </Field>
        <Field label="Consolidación">
          <Select value={form.aggregation} options={AGG} onChange={(v) => set("aggregation", v as Form["aggregation"])} />
        </Field>
        <Field label="Sentido">
          <Select
            value={form.direction}
            options={[
              ["mayor_mejor", "Mayor es mejor"],
              ["menor_mejor", "Menor es mejor"],
            ]}
            onChange={(v) => set("direction", v as Form["direction"])}
          />
        </Field>
        <Field label="Periodicidad">
          <Select
            value={form.periodicity}
            options={[
              ["semestral", "Semestral"],
              ["anual", "Anual (solo segundo semestre)"],
            ]}
            onChange={(v) => set("periodicity", v as Form["periodicity"])}
          />
        </Field>
        <Field label="Se reporta por">
          <Select value={form.report_level} options={REPORT} onChange={(v) => set("report_level", v as Form["report_level"])} />
        </Field>
        <Field label="Modo de captura">
          <Select value={form.capture_mode} options={MODE} onChange={(v) => set("capture_mode", v as Form["capture_mode"])} />
        </Field>
        <Field label="Vicerrectoría que valida">
          <Select
            value={form.validator_function}
            options={FUNCTIONS.map((f) => [f.id, f.vice] as const)}
            onChange={(v) => set("validator_function", v as Form["validator_function"])}
          />
        </Field>
        <Field label="Umbral de variación (%)">
          <input inputMode="decimal" value={String(form.variation_threshold)} onChange={(e) => set("variation_threshold", num(e.target.value) ?? 0)} />
        </Field>

        <fieldset className="ia-choices admin-field--wide">
          <legend>Aplica a</legend>
          {DEGREES.map(([value, label]) => (
            <label key={value}>
              <input type="checkbox" checked={form.applies_degrees.includes(value)} onChange={() => toggle("applies_degrees", value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="ia-choices admin-field--wide">
          <legend>Modalidades (ninguna marcada = todas)</legend>
          {MODALITIES.map(([value, label]) => (
            <label key={value}>
              <input type="checkbox" checked={form.applies_modalities.includes(value)} onChange={() => toggle("applies_modalities", value)} />
              {label}
            </label>
          ))}
        </fieldset>

        <Field label="Valor mínimo válido">
          <input inputMode="decimal" value={form.range_min ?? ""} onChange={(e) => set("range_min", num(e.target.value))} />
        </Field>
        <Field label="Valor máximo válido">
          <input inputMode="decimal" value={form.range_max ?? ""} onChange={(e) => set("range_max", num(e.target.value))} />
        </Field>
        {form.calc_type === "puntaje" && (
          <Field label="Respuestas mínimas (n)">
            <input inputMode="numeric" value={form.n_minimum ?? ""} onChange={(e) => set("n_minimum", num(e.target.value))} />
          </Field>
        )}
        {ratio && (
          <label className="ia-check admin-field--wide">
            <input type="checkbox" checked={form.allows_over_one} onChange={(e) => set("allows_over_one", e.target.checked)} />
            La razón puede pasar de 1 (por ejemplo, horas ÷ profesores)
          </label>
        )}
        <label className="ia-check admin-field--wide">
          <input type="checkbox" checked={form.evidence_required} onChange={(e) => set("evidence_required", e.target.checked)} />
          Exige evidencia
        </label>
        {form.evidence_required && (
          <Field label="Tipo de soporte" wide>
            <input value={form.evidence_type ?? ""} onChange={(e) => set("evidence_type", e.target.value)} placeholder="Acta, informe, listado…" />
          </Field>
        )}
      </fieldset>

      {error && (
        <p className="ia-error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {editable && (
        <div className="ia-actions">
          {notice && (
            <span className="ia-saved" role="status">
              <Icon name="check" size={14} /> {notice}
            </span>
          )}
          <button type="button" className="button-ghost" disabled={!dirty} onClick={() => setForm(initial)}>
            Deshacer cambios
          </button>
          <button type="button" className="button-primary" disabled={!dirty || save.isPending} onClick={() => void submit()}>
            {save.isPending ? "Guardando…" : "Guardar ficha"}
          </button>
        </div>
      )}
    </aside>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`admin-field${wide ? " admin-field--wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string | null; options: readonly (readonly [string, string])[]; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin definir</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Un hallazgo con sus dos salidas: resuelto o aceptado, con nota. */
export function FindingRow({ finding, editable }: { finding: DbFinding; editable: boolean }) {
  const resolve = useResolveFinding();
  const [note, setNote] = useState(finding.note);
  const [error, setError] = useState("");
  const label = FINDING_LABEL[finding.kind as FindingKind] ?? finding.kind;

  const go = async (state: DbFinding["state"]) => {
    setError("");
    try {
      await resolve.mutateAsync({ id: finding.id, state, note });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el hallazgo.");
    }
  };

  return (
    <li className="ia-finding" data-state={finding.state}>
      <div className="ia-finding__head">
        <strong>{label}</strong>
        <span>
          {finding.sheet}
          {finding.row_number !== null && `, fila ${finding.row_number}`}
          {finding.column_name && `, columna ${finding.column_name}`}
        </span>
        <em className={`ia-pill ${finding.state === "abierto" ? "ia-pill--pending" : "ia-pill--done"}`}>
          {finding.state === "abierto" ? "Abierto" : finding.state === "resuelto" ? "Resuelto" : "Aceptado"}
        </em>
      </div>
      {finding.value && <p className="ia-finding__value">{finding.value}</p>}
      {finding.suggestion && <p className="ia-muted">{finding.suggestion}</p>}
      {editable && (
        <div className="ia-finding__actions">
          <input aria-label="Nota" placeholder="Nota (qué se hizo o por qué se acepta)" value={note} onChange={(e) => setNote(e.target.value)} />
          {finding.state === "abierto" ? (
            <>
              <button type="button" className="button-ghost" disabled={resolve.isPending} onClick={() => void go("aceptado")}>
                Aceptar
              </button>
              <button type="button" className="button-secondary" disabled={resolve.isPending} onClick={() => void go("resuelto")}>
                Resuelto
              </button>
            </>
          ) : (
            <button type="button" className="button-ghost" disabled={resolve.isPending} onClick={() => void go("abierto")}>
              Reabrir
            </button>
          )}
        </div>
      )}
      {!editable && finding.note && <p className="ia-muted">Nota: {finding.note}</p>}
      {error && <p className="ia-error">{error}</p>}
    </li>
  );
}
