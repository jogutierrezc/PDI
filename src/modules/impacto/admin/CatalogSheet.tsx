/* =============================================================================
   El catálogo en hoja de cálculo.

   Una fila por indicador y las columnas de la ficha técnica: completar las
   fichas de muchos indicadores se parece a llenar la matriz en Excel, y se
   puede pegar un bloque copiado de ella. Solo se escribe en una versión en
   borrador; una publicada se ve igual, bloqueada.

   Lo que la matriz trae (código de origen, función, nivel, nombre, estado)
   no se toca aquí: se corrige reimportando, no en silencio.
   ========================================================================== */

import { FUNCTIONS, LEVELS } from "../data/catalog";
import { useSaveSheets } from "../data/catalog-db";
import type { DbIndicator, SheetPatch } from "../data/catalog-db";
import { DataGrid, choiceCell, normalize, numberCell, yesNo } from "./DataGrid";
import type { GridColumn, WriteResult } from "./DataGrid";
import { AGG, CALC, DEGREES, DIRECTION, FACTOR, MODE, PERIODICITY, REPORT, UNITS } from "./labels";

type Draft = Required<
  Pick<
    SheetPatch,
    | "calc_type"
    | "unit"
    | "numerator_def"
    | "denominator_def"
    | "aggregation"
    | "direction"
    | "periodicity"
    | "report_level"
    | "capture_mode"
    | "evidence_type"
    | "evidence_required"
    | "variation_threshold"
    | "range_min"
    | "range_max"
    | "n_minimum"
    | "in_pilot"
  >
> & { factor: "1" | "100" | null; applies_degrees: string[] };

const FIELDS: (keyof Draft)[] = [
  "calc_type",
  "unit",
  "numerator_def",
  "denominator_def",
  "factor",
  "aggregation",
  "direction",
  "periodicity",
  "report_level",
  "capture_mode",
  "evidence_type",
  "evidence_required",
  "variation_threshold",
  "range_min",
  "range_max",
  "n_minimum",
  "in_pilot",
  "applies_degrees",
];

const initial = (i: DbIndicator): Draft => ({
  calc_type: i.calc_type,
  unit: i.unit,
  numerator_def: i.numerator_def,
  denominator_def: i.denominator_def,
  factor: i.factor === null ? null : (String(i.factor) as "1" | "100"),
  aggregation: i.aggregation,
  direction: i.direction,
  periodicity: i.periodicity,
  report_level: i.report_level,
  capture_mode: i.capture_mode,
  evidence_type: i.evidence_type,
  evidence_required: i.evidence_required,
  variation_threshold: i.variation_threshold,
  range_min: i.range_min,
  range_max: i.range_max,
  n_minimum: i.n_minimum,
  in_pilot: i.in_pilot,
  applies_degrees: [...(i.applies_degrees ?? [])],
});

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: 4 }));

function text(field: "numerator_def" | "denominator_def" | "evidence_type") {
  return {
    show: (_: DbIndicator, d: Draft) => d[field] ?? "",
    write: (d: Draft, raw: string): WriteResult<Draft> => ({ draft: { ...d, [field]: raw.trim() || null } }),
  };
}

function num(field: "variation_threshold" | "range_min" | "range_max" | "n_minimum", required = false) {
  return {
    numeric: true,
    show: (_: DbIndicator, d: Draft) => fmt(d[field]),
    write: (d: Draft, raw: string): WriteResult<Draft> => {
      const v = numberCell(raw);
      if (v === "error") return { error: `«${raw.trim()}» no es un número.` };
      if (v === null && required) return { error: "Este campo no se deja vacío." };
      if (v !== null && v < 0) return { error: "No puede ser negativo." };
      return { draft: { ...d, [field]: v } };
    },
  };
}

function flag(field: "evidence_required" | "in_pilot") {
  return {
    choices: ["Sí", "No"] as const,
    show: (_: DbIndicator, d: Draft) => (d[field] ? "Sí" : "No"),
    write: (d: Draft, raw: string): WriteResult<Draft> => {
      const v = yesNo(raw);
      if (v === "error" || v === null) return { error: "Escriba «Sí» o «No»." };
      return { draft: { ...d, [field]: v } };
    },
  };
}

/**
 * «Aplica a»: niveles separados por coma o punto y coma, o «Todos». Se leen
 * sin tildes y con los nombres cortos que usa la gente (técnico, tecnólogo,
 * universitario, médico-quirúrgica…).
 */
const DEGREE_ALIASES: Record<string, string> = {
  tecnico: "tecnico",
  tecnica: "tecnico",
  tecnologico: "tecnologico",
  tecnologo: "tecnologico",
  tecnologia: "tecnologico",
  pregrado: "pregrado",
  universitario: "pregrado",
  profesional: "pregrado",
  especializacion: "especializacion",
  "medico-quirurgica": "especializacion_medicoquirurgica",
  medicoquirurgica: "especializacion_medicoquirurgica",
  "especializacion medico-quirurgica": "especializacion_medicoquirurgica",
  "especializacion medicoquirurgica": "especializacion_medicoquirurgica",
  maestria: "maestria",
  doctorado: "doctorado",
};
for (const [value, label] of DEGREES) DEGREE_ALIASES[normalize(label)] = value;

const degreesCell = {
  show: (_: DbIndicator, d: Draft) =>
    d.applies_degrees.length === DEGREES.length
      ? "Todos"
      : DEGREES.filter(([v]) => d.applies_degrees.includes(v))
          .map(([, l]) => l)
          .join(", "),
  write: (d: Draft, raw: string): WriteResult<Draft> => {
    const text = normalize(raw);
    if (!text) return { draft: { ...d, applies_degrees: [] } };
    if (text === "todos" || text === "todas") return { draft: { ...d, applies_degrees: DEGREES.map(([v]) => v) } };
    const picked: string[] = [];
    for (const part of text.split(/[;,]/).map((p) => p.trim()).filter(Boolean)) {
      const value = DEGREE_ALIASES[part];
      if (!value) return { error: `«${part}» no es un nivel. Use ${DEGREES.map(([, l]) => l).join(", ")} o «Todos».` };
      if (!picked.includes(value)) picked.push(value);
    }
    return { draft: { ...d, applies_degrees: DEGREES.map(([v]) => v as string).filter((v) => picked.includes(v)) } };
  },
};

function choice<V extends string>(pairs: readonly (readonly [V, string])[], field: keyof Draft) {
  const cell = choiceCell<Draft, V>(pairs, field);
  return { choices: cell.choices, show: (_: DbIndicator, d: Draft) => cell.show(d), write: (d: Draft, raw: string) => cell.write(d, raw) };
}

export function CatalogSheet({ rows, editable }: { rows: DbIndicator[]; editable: boolean }) {
  const save = useSaveSheets();
  const ratio = (d: Draft) => d.calc_type === "razon" || d.calc_type === "comparacion";

  const columns: GridColumn<DbIndicator, Draft>[] = [
    { key: "code", label: "Código", width: 72, show: (i) => i.code },
    { key: "fn", label: "Función", width: 110, show: (i) => FUNCTIONS.find((f) => f.id === i.function_id)?.name ?? "" },
    { key: "level", label: "Nivel", width: 90, show: (i) => LEVELS.find((l) => l.id === i.level)?.name ?? "" },
    { key: "name", label: "Indicador", width: 280, show: (i) => i.name },
    { key: "calc_type", label: "Tipo de cálculo", width: 120, ...choice(CALC, "calc_type") },
    { key: "unit", label: "Unidad", width: 110, ...choice(UNITS, "unit") },
    { key: "numerator_def", label: "Numerador", width: 220, ...text("numerator_def") },
    {
      key: "denominator_def",
      label: "Denominador",
      width: 220,
      ...text("denominator_def"),
      editable: (_, d) => ratio(d),
    },
    { key: "factor", label: "Factor", width: 110, ...choice(FACTOR, "factor") },
    { key: "aggregation", label: "Agregación", width: 150, ...choice(AGG, "aggregation") },
    { key: "direction", label: "Sentido", width: 130, ...choice(DIRECTION, "direction") },
    { key: "periodicity", label: "Periodicidad", width: 110, ...choice(PERIODICITY, "periodicity") },
    { key: "report_level", label: "Nivel de reporte", width: 140, ...choice(REPORT, "report_level") },
    { key: "applies_degrees", label: "Aplica a", width: 260, ...degreesCell },
    { key: "capture_mode", label: "Modo de captura", width: 120, ...choice(MODE, "capture_mode") },
    { key: "evidence_type", label: "Evidencia", width: 180, ...text("evidence_type") },
    { key: "evidence_required", label: "Evidencia obligatoria", width: 110, ...flag("evidence_required") },
    { key: "variation_threshold", label: "Umbral de variación %", width: 120, ...num("variation_threshold", true) },
    { key: "range_min", label: "Mínimo", width: 90, ...num("range_min") },
    { key: "range_max", label: "Máximo", width: 90, ...num("range_max") },
    { key: "n_minimum", label: "n mínimo", width: 90, ...num("n_minimum") },
    { key: "in_pilot", label: "En piloto", width: 90, ...flag("in_pilot") },
  ];
  // En una versión publicada nada se escribe; la matriz de origen, nunca.
  const locked = ["code", "fn", "level", "name"];
  for (const c of columns) if (locked.includes(c.key)) delete c.write;

  return (
    <DataGrid<DbIndicator, Draft>
      label="Catálogo en hoja de cálculo"
      rows={rows}
      rowId={(i) => i.id}
      initial={initial}
      columns={columns}
      readOnly={!editable}
      legend={editable ? "Código, función, nivel y nombre vienen de la matriz: se corrigen reimportándola." : "Versión publicada: no se modifica. Cree un borrador para cambiarla."}
      status={(i, d, dirty) => {
        if (dirty) return { text: "Cambios sin guardar", tone: "warn" };
        if (Number(i.open_findings) > 0) return { text: `${i.open_findings} hallazgos abiertos`, tone: "bad" };
        if (i.sheet_complete) return { text: "Ficha completa", tone: "ok" };
        return { text: d.calc_type ? "Ficha incompleta" : "Falta el tipo de cálculo", tone: "muted" };
      }}
      onSave={async (changes) => {
        const items = changes
          .map(({ row, draft }) => {
            const before = initial(row);
            const patch: SheetPatch = {};
            for (const field of FIELDS) {
              if (field === "applies_degrees") {
                if (before.applies_degrees.join() !== draft.applies_degrees.join()) patch.applies_degrees = draft.applies_degrees;
                continue;
              }
              if (before[field] === draft[field]) continue;
              if (field === "factor") patch.factor = draft.factor === null ? null : (Number(draft.factor) as 1 | 100);
              else (patch as Record<string, unknown>)[field] = draft[field];
            }
            if (!ratio(draft) && row.denominator_def && patch.calc_type) patch.denominator_def = null;
            return { id: row.id, code: row.code, patch };
          })
          .filter((item) => Object.keys(item.patch).length > 0);
        const problems: string[] = [];
        const saved: string[] = changes.filter(({ row }) => !items.some((i) => i.id === row.id)).map(({ row }) => row.id);
        for (const item of items) {
          try {
            await save.mutateAsync([{ id: item.id, patch: item.patch }]);
            saved.push(item.id);
          } catch (failure) {
            problems.push(`${item.code}: ${failure instanceof Error ? failure.message : "no se pudo guardar."}`);
          }
        }
        return { saved, problems, text: `Se guardaron ${saved.length} fichas.` };
      }}
    />
  );
}
