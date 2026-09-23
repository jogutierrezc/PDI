/* =============================================================================
   La bandeja de revisión en hoja de cálculo.

   Una fila por registro que espera decisión, con la cuenta a la vista
   (numerador ÷ denominador, valor, valor anterior) y tres columnas para
   decidir: «Decisión» (aprobar o validar, o devolver), «Motivo» y
   «Comentario». Al aplicar, lo aprobado va junto en una llamada; lo devuelto,
   agrupado por motivo y comentario. Devolver sin motivo o sin comentario no
   sale de la hoja: la fila lo dice.

   Lo que la persona capturó o guardó no se decide aquí (la base lo impediría
   igual): su fila queda bloqueada y lo explica.
   ========================================================================== */

import { indicatorOf } from "../data/capture-db";
import type { CaptureRow } from "../data/capture-db";
import { formatValue } from "../data/lens";
import { isOwn, useReview } from "../data/review-db";
import { DataGrid, normalize } from "./DataGrid";
import type { GridColumn } from "./DataGrid";
import { RETURN_REASONS, STATE_LABEL } from "./store";
import type { ReturnReason } from "./store";

type Decision = "aprobar" | "devolver" | null;
type Draft = { decision: Decision; reason: ReturnReason | null; comment: string };

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: 4 }));
const REASON_LABEL = new Map<string, string>(RETURN_REASONS.map(([v, l]) => [v, l]));

export function ReviewSheet({ rows, isDean, me }: { rows: CaptureRow[]; isDean: boolean; me: string | undefined }) {
  const review = useReview();
  const approveLabel = isDean ? "Aprobar" : "Validar";

  const columns: GridColumn<CaptureRow, Draft>[] = [
    { key: "program", label: "Programa", width: 200, show: (r) => r.program_name },
    { key: "campus", label: "Sede", width: 110, show: (r) => r.campus_name ?? "Todas" },
    { key: "code", label: "Código", width: 72, show: (r) => r.code },
    { key: "name", label: "Indicador", width: 250, show: (r) => r.name },
    { key: "numerator", label: "Numerador", width: 105, numeric: true, show: (r) => num(r.numerator) },
    { key: "denominator", label: "Denominador", width: 105, numeric: true, show: (r) => num(r.denominator) },
    { key: "value", label: "Valor", width: 95, numeric: true, show: (r) => (r.value === null || r.value === undefined ? "" : formatValue(indicatorOf(r), r.value)) },
    {
      key: "previous",
      label: "Periodo anterior",
      width: 115,
      numeric: true,
      show: (r) => (r.previous_value === null || r.previous_value === undefined ? "" : formatValue(indicatorOf(r), r.previous_value)),
    },
    { key: "justification", label: "Justificación del programa", width: 220, show: (r) => r.justification ?? "" },
    { key: "state", label: "Estado", width: 160, show: (r) => STATE_LABEL[r.state] },
    {
      key: "decision",
      label: "Decisión",
      width: 110,
      choices: ["", approveLabel, "Devolver"],
      show: (_, d) => (d.decision === "aprobar" ? approveLabel : d.decision === "devolver" ? "Devolver" : ""),
      editable: (r) => !isOwn(r, me),
      write: (d, raw) => {
        const v = normalize(raw);
        if (!v) return { draft: { ...d, decision: null } };
        if (["aprobar", "validar", "aprobado", "validado", "si", "ok"].includes(v)) return { draft: { ...d, decision: "aprobar" } };
        if (["devolver", "devuelto", "no"].includes(v)) return { draft: { ...d, decision: "devolver" } };
        return { error: `Escriba «${approveLabel}» o «Devolver».` };
      },
    },
    {
      key: "reason",
      label: "Motivo de devolución",
      width: 200,
      choices: ["", ...RETURN_REASONS.map(([, l]) => l)],
      show: (_, d) => (d.reason ? REASON_LABEL.get(d.reason) ?? "" : ""),
      editable: (r, d) => !isOwn(r, me) && d.decision === "devolver",
      write: (d, raw) => {
        const v = normalize(raw);
        if (!v) return { draft: { ...d, reason: null } };
        const hit = RETURN_REASONS.find(([value, label]) => normalize(label) === v || value === v);
        return hit ? { draft: { ...d, reason: hit[0] } } : { error: "Elija un motivo de la lista." };
      },
    },
    {
      key: "comment",
      label: "Comentario",
      width: 240,
      show: (_, d) => d.comment,
      editable: (r, d) => !isOwn(r, me) && d.decision === "devolver",
      write: (d, raw) => ({ draft: { ...d, comment: raw } }),
    },
  ];

  return (
    <DataGrid<CaptureRow, Draft>
      label="Bandeja de revisión en hoja de cálculo"
      frozen={1}
      rows={rows}
      rowId={(r) => r.id}
      initial={() => ({ decision: null, reason: null, comment: "" })}
      columns={columns}
      saveLabel="Aplicar decisiones"
      empty="Nada espera su decisión."
      legend={`Escriba «${approveLabel}» o «Devolver» en la columna Decisión; devolver pide motivo y comentario.`}
      status={(r, d) => {
        if (isOwn(r, me)) return { text: "Lo capturó usted: lo decide otra persona", tone: "muted" };
        if (d.decision === "devolver" && (!d.reason || !d.comment.trim())) return { text: "Para devolver falta motivo y comentario", tone: "bad" };
        if (d.decision === "devolver") return { text: isDean ? "Vuelve al programa" : "Vuelve a la decanatura", tone: "warn" };
        if (d.decision === "aprobar") return { text: isDean ? "Pasa a la vicerrectoría" : "Queda validado", tone: "ok" };
        return null;
      }}
      onSave={async (changes) => {
        const saved: string[] = [];
        const problems: string[] = [];
        const approve = changes.filter((c) => c.draft.decision === "aprobar").map((c) => c.row);
        const back = changes.filter((c) => c.draft.decision === "devolver");
        const none = changes.filter((c) => c.draft.decision === null);
        saved.push(...none.map((c) => c.row.id));

        if (approve.length) {
          try {
            await review.mutateAsync({ ids: approve.map((r) => r.id), action: isDean ? "aprobar" : "validar" });
            saved.push(...approve.map((r) => r.id));
          } catch (failure) {
            problems.push(`${approveLabel}: ${failure instanceof Error ? failure.message : "no se pudo."}`);
          }
        }

        const groups = new Map<string, { reason: ReturnReason; comment: string; rows: CaptureRow[] }>();
        for (const { row, draft } of back) {
          if (!draft.reason || !draft.comment.trim()) {
            problems.push(`${row.code} · ${row.program_name}: para devolver falta motivo y comentario.`);
            continue;
          }
          const key = `${draft.reason}|${draft.comment.trim()}`;
          const group = groups.get(key) ?? { reason: draft.reason, comment: draft.comment.trim(), rows: [] };
          group.rows.push(row);
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          try {
            await review.mutateAsync({ ids: group.rows.map((r) => r.id), action: "devolver", reason: group.reason, comment: group.comment });
            saved.push(...group.rows.map((r) => r.id));
          } catch (failure) {
            problems.push(`Devolver: ${failure instanceof Error ? failure.message : "no se pudo."}`);
          }
        }
        const decided = saved.length - none.length;
        return { saved, problems, text: `Se aplicaron ${decided} ${decided === 1 ? "decisión" : "decisiones"}.` };
      }}
    />
  );
}
