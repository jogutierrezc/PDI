/* =============================================================================
   El periodo en hoja de cálculo.

     · Asignaciones: una fila por indicador × programa × sede. «Activa» se
       cambia a Sí o No y exige justificación, igual que en la vista sencilla
       (imp_set_assignment lo vuelve a exigir en la base).
     · Registros: lo que han reportado todos los programas, en solo lectura,
       con numerador, denominador, valor y estado. Para mirar, filtrar y
       llevarse a Excel con «Copiar la hoja»; no para corregir datos ajenos.
   ========================================================================== */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FUNCTIONS } from "../data/catalog";
import { indicatorOf } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { formatValue } from "../data/lens";
import { useSetAssignment } from "../data/period-db";
import type { Assignment, Period } from "../data/period-db";
import { DataGrid, yesNo } from "./DataGrid";
import type { GridColumn } from "./DataGrid";
import { STATE_LABEL } from "./store";

type Tab = "asignaciones" | "registros";
type AssignmentDraft = { active: boolean; reason: string };

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: 4 }));

export function PeriodSheet({ period, assignments }: { period: Period; assignments: Assignment[] }) {
  const [tab, setTab] = useState<Tab>("asignaciones");
  return (
    <section className="ia-dg__tabs-wrap" aria-label={`Periodo ${period.code} en hoja de cálculo`}>
      <div className="ia-views" role="tablist" aria-label="Qué hoja ver">
        <button type="button" role="tab" aria-selected={tab === "asignaciones"} className={tab === "asignaciones" ? "is-active" : undefined} onClick={() => setTab("asignaciones")}>
          Asignaciones
        </button>
        <button type="button" role="tab" aria-selected={tab === "registros"} className={tab === "registros" ? "is-active" : undefined} onClick={() => setTab("registros")}>
          Registros de todos los programas
        </button>
      </div>
      {tab === "asignaciones" ? <AssignmentsSheet period={period} rows={assignments} /> : <RecordsSheet period={period} />}
    </section>
  );
}

function AssignmentsSheet({ period, rows }: { period: Period; rows: Assignment[] }) {
  const set = useSetAssignment();
  const open = period.state === "abierto";
  const sorted = [...rows].sort(
    (a, b) =>
      (a.program.parent?.name ?? "").localeCompare(b.program.parent?.name ?? "", "es") ||
      a.program.name.localeCompare(b.program.name, "es") ||
      a.indicator.code.localeCompare(b.indicator.code) ||
      (a.campus?.name ?? "").localeCompare(b.campus?.name ?? ""),
  );

  const columns: GridColumn<Assignment, AssignmentDraft>[] = [
    { key: "faculty", label: "Facultad", width: 190, show: (a) => a.program.parent?.name ?? "Sin facultad" },
    { key: "program", label: "Programa", width: 210, show: (a) => a.program.name },
    { key: "snies", label: "SNIES", width: 80, show: (a) => a.program.snies_code ?? "" },
    { key: "code", label: "Código", width: 72, show: (a) => a.indicator.code },
    { key: "name", label: "Indicador", width: 260, show: (a) => a.indicator.name },
    { key: "campus", label: "Sede", width: 110, show: (a) => a.campus?.name ?? "Por programa" },
    { key: "record", label: "Registro", width: 150, show: (a) => (a.record?.[0] ? STATE_LABEL[a.record[0].state as keyof typeof STATE_LABEL] ?? a.record[0].state : "Sin registro") },
    {
      key: "active",
      label: "Activa",
      width: 80,
      choices: ["Sí", "No"],
      show: (_, d) => (d.active ? "Sí" : "No"),
      write: (d, raw) => {
        const v = yesNo(raw);
        return v === "error" || v === null ? { error: "Escriba «Sí» o «No»." } : { draft: { ...d, active: v } };
      },
    },
    {
      key: "reason",
      label: "Justificación del cambio",
      width: 260,
      show: (a, d) => (d.active !== a.active ? d.reason : a.justification),
      editable: (a, d) => d.active !== a.active,
      write: (d, raw) => ({ draft: { ...d, reason: raw } }),
    },
  ];

  return (
    <DataGrid<Assignment, AssignmentDraft>
      label="Asignaciones del periodo"
      rows={sorted}
      rowId={(a) => a.id}
      initial={(a) => ({ active: a.active, reason: "" })}
      columns={columns}
      readOnly={!open}
      legend={open ? "Cambie «Activa» y escriba la justificación en la misma fila." : "Periodo cerrado: las asignaciones ya no cambian."}
      saveLabel="Aplicar cambios"
      status={(a, d, dirty) => {
        if (!dirty || d.active === a.active) return a.manual ? { text: "Agregada a mano", tone: "muted" } : null;
        if (!d.reason.trim()) return { text: "Falta la justificación", tone: "bad" };
        return { text: d.active ? "Se devolverá" : "Se quitará", tone: "warn" };
      }}
      onSave={async (changes) => {
        const saved: string[] = [];
        const problems: string[] = [];
        for (const { row, draft } of changes) {
          if (draft.active === row.active) {
            saved.push(row.id);
            continue;
          }
          if (!draft.reason.trim()) {
            problems.push(`${row.indicator.code} · ${row.program.name}: falta la justificación.`);
            continue;
          }
          try {
            await set.mutateAsync({ id: row.id, active: draft.active, reason: draft.reason.trim() });
            saved.push(row.id);
          } catch (failure) {
            problems.push(`${row.indicator.code} · ${row.program.name}: ${failure instanceof Error ? failure.message : "no se pudo cambiar."}`);
          }
        }
        return { saved, problems, text: `Se aplicaron ${saved.length} cambios.` };
      }}
    />
  );
}

function RecordsSheet({ period }: { period: Period }) {
  const records = useQuery({
    queryKey: ["impacto", "periodo", "registros", period.id],
    queryFn: async (): Promise<CaptureRow[]> => {
      const { data, error } = await supabase
        .from("imp_capture_rows")
        .select("*")
        .eq("period_id", period.id)
        .order("program_name")
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as CaptureRow[];
    },
  });

  if (records.isPending) return <p className="ia-muted">Cargando…</p>;
  if (records.error) return <p className="ia-error">{records.error.message}</p>;

  const columns: GridColumn<CaptureRow, null>[] = [
    { key: "program", label: "Programa", width: 210, show: (r) => r.program_name },
    { key: "campus", label: "Sede", width: 110, show: (r) => r.campus_name ?? "Todas" },
    { key: "fn", label: "Función", width: 110, show: (r) => FUNCTIONS.find((f) => f.id === r.function_id)?.name ?? "" },
    { key: "code", label: "Código", width: 72, show: (r) => r.code },
    { key: "name", label: "Indicador", width: 260, show: (r) => r.name },
    { key: "numerator", label: "Numerador", width: 110, numeric: true, show: (r) => num(r.numerator) },
    { key: "denominator", label: "Denominador", width: 110, numeric: true, show: (r) => num(r.denominator) },
    { key: "value", label: "Valor", width: 100, numeric: true, show: (r) => (r.value === null || r.value === undefined ? "" : formatValue(indicatorOf(r), r.value)) },
    { key: "state", label: "Estado", width: 170, show: (r) => STATE_LABEL[r.state] },
    { key: "updated", label: "Actualizado", width: 110, show: (r) => new Date(r.updated_at).toLocaleDateString("es-CO") },
  ];

  return (
    <DataGrid<CaptureRow, null>
      label="Registros de todos los programas"
      rows={records.data ?? []}
      rowId={(r) => r.id}
      initial={() => null}
      columns={columns}
      readOnly
      legend="Los datos los corrige el programa: aquí se miran, se filtran y se copian a Excel."
      empty="Todavía no hay registros en este periodo."
    />
  );
}
