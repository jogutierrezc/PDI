/* =============================================================================
   Auditar Impacto · para Planeación.

   Cuánto va cada mano del reporte en un periodo, con los datos que de verdad
   hay en la base:

     Programas        capturaron y enviaron lo que les toca.
     Decanaturas      revisaron lo que les enviaron sus programas.
     Vicerrectorías   validaron lo que aprobó la decanatura en su función.
     Oficinas         por la oficina que la matriz nombra responsable de
                      cada indicador: cuánto de lo suyo ya está validado.
     Actividad        quién hizo qué y cuándo (la bitácora de transiciones).

   Lo de menos avance sale primero; lo que pasó su fecha de corte con cosas
   pendientes se marca «Atrasado» con texto y glifo, no solo con color. Cada
   porcentaje va con su cuenta (x de y). La vista sencilla y la hoja de
   cálculo muestran lo mismo: la hoja sirve para filtrar y llevarlo a Excel.

   Solo lee. Lo que se ve lo decide RLS: la administración de Impacto lee
   todos los programas (imp_can_see_program).
   ========================================================================== */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../../../components/ui/Icon";
import { supabase } from "../../../lib/supabase";
import { auditFaculties, auditOffices, auditPrograms, auditVices, formatRatio, headline } from "../data/audit";
import type { AuditRecord, AuditRow, AuditUnit, Pipeline, Ratio } from "../data/audit";
import { usePeriods } from "../data/period-db";
import type { Period } from "../data/period-db";
import { DataGrid } from "./DataGrid";
import type { GridColumn } from "./DataGrid";
import { RETURN_REASONS, STATE_LABEL } from "./store";
import type { WorkMode } from "./view-mode";

type Tab = "programas" | "decanaturas" | "vicerrectorias" | "oficinas" | "actividad";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "programas", label: "Programas", hint: "Avance = registros enviados a decanatura (o más allá) de los que tiene asignados." },
  { id: "decanaturas", label: "Decanaturas", hint: "Avance = registros aprobados de los que le enviaron sus programas." },
  { id: "vicerrectorias", label: "Vicerrectorías", hint: "Avance = registros validados de los que aprobó la decanatura en su función." },
  { id: "oficinas", label: "Oficinas responsables", hint: "Por la oficina que la matriz nombra responsable del indicador: registros validados de todos los suyos." },
  { id: "actividad", label: "Actividad", hint: "Las últimas decisiones del periodo: quién, cuándo, de qué estado a cuál y por qué." },
];

const STAGES: { key: keyof Pipeline; label: string; tone: string }[] = [
  { key: "validado", label: "Validado", tone: "var(--status-done)" },
  { key: "aprobado", label: "Aprobado por decanatura", tone: "var(--brand-teal)" },
  { key: "enviado", label: "Enviado", tone: "var(--brand-blue)" },
  { key: "devueltoDecanatura", label: "Devuelto a decanatura", tone: "var(--status-risk)" },
  { key: "devueltoPrograma", label: "Devuelto al programa", tone: "var(--status-risk)" },
  { key: "enCaptura", label: "En captura", tone: "var(--status-pending)" },
  { key: "sinDato", label: "Sin dato", tone: "var(--line-strong)" },
];

const REASON = new Map<string, string>(RETURN_REASONS.map(([v, l]) => [v, l]));
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);

interface Activity {
  id: number;
  at: string;
  from_state: string;
  to_state: string;
  reason: string | null;
  comment: string;
  actor: string;
  record: AuditRecord | undefined;
}

function useAuditData(period: Period | null) {
  return useQuery({
    queryKey: ["impacto", "auditar", period?.id],
    enabled: Boolean(period),
    queryFn: async () => {
      const [records, units, indicators] = await Promise.all([
        supabase.from("imp_capture_rows").select("*").eq("period_id", period!.id),
        supabase.from("units").select("id,parent_id,kind,code,name,substantive_function"),
        supabase.from("imp_indicators").select("code,responsible_original").eq("version_id", period!.catalog_version_id),
      ]);
      for (const r of [records, units, indicators]) if (r.error) throw new Error(r.error.message);
      const responsible = new Map(((indicators.data ?? []) as { code: string; responsible_original: string }[]).map((i) => [i.code, i.responsible_original]));
      const list = ((records.data ?? []) as AuditRecord[]).map((r) => ({ ...r, responsible: responsible.get(r.code) ?? null }));
      return { records: list, units: (units.data ?? []) as AuditUnit[] };
    },
  });
}

function useActivity(records: AuditRecord[] | undefined) {
  const ids = records?.map((r) => r.id) ?? [];
  return useQuery({
    queryKey: ["impacto", "auditar", "actividad", ids.length, ids[0]],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Activity[]> => {
      const byId = new Map(records!.map((r) => [r.id, r]));
      const out: Activity[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase
          .from("imp_transitions")
          .select("id, record_id, at, from_state, to_state, reason, comment, actor:profiles(full_name, email)")
          .in("record_id", ids.slice(i, i + 150))
          .order("at", { ascending: false })
          .limit(300);
        if (error) throw new Error(error.message);
        for (const t of (data ?? []) as unknown as { id: number; record_id: string; at: string; from_state: string; to_state: string; reason: string | null; comment: string; actor: { full_name: string; email: string } | null }[]) {
          out.push({ ...t, actor: t.actor ? t.actor.full_name || t.actor.email : "Sistema", record: byId.get(t.record_id) });
        }
      }
      return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
    },
  });
}

export function AuditView({ mode }: { mode: WorkMode }) {
  const periods = usePeriods();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("programas");
  const list = periods.data ?? [];
  const period = list.find((p) => p.id === periodId) ?? list.find((p) => p.state === "abierto") ?? list[0] ?? null;
  const data = useAuditData(period);
  const activity = useActivity(tab === "actividad" ? data.data?.records : undefined);
  const now = today();

  const rows = useMemo(() => {
    if (!data.data || !period) return [];
    const cutoffs = { program: period.cutoff_program, faculty: period.cutoff_faculty, vice: period.cutoff_vice };
    const { records, units } = data.data;
    if (tab === "programas") return auditPrograms(records, units, cutoffs, now);
    if (tab === "decanaturas") return auditFaculties(records, units, cutoffs, now);
    if (tab === "vicerrectorias") return auditVices(records, units, cutoffs, now);
    if (tab === "oficinas") return auditOffices(records);
    return [];
  }, [data.data, period, tab, now]);

  if (periods.isPending) return <p className="ia-muted">Cargando…</p>;
  if (periods.error) return <p className="ia-error">{periods.error.message}</p>;
  if (!period) {
    return (
      <section className="admin-card ia-empty-state">
        <h2>Todavía no hay periodos</h2>
        <p>Cuando se abra el primer periodo en «Periodo», aquí se verá cuánto va cada programa, decanatura y vicerrectoría.</p>
      </section>
    );
  }

  const records = data.data?.records ?? [];
  const h = headline(records);
  const current = TABS.find((t) => t.id === tab)!;
  const late = rows.filter((r) => r.overdue).length;

  return (
    <>
      <section className="admin-card ia-audit__head" aria-labelledby="auditar-titulo">
        <div className="ia-audit__title">
          <div>
            <h2 id="auditar-titulo">Periodo {period.code}</h2>
            <p className="ia-muted">
              Cortes: programas {day(`${period.cutoff_program}T12:00:00`)}, decanaturas {day(`${period.cutoff_faculty}T12:00:00`)},
              vicerrectorías {day(`${period.cutoff_vice}T12:00:00`)} · {period.state === "abierto" ? "abierto" : "cerrado"}
            </p>
          </div>
          {list.length > 1 && (
            <label className="admin-field ia-audit__period">
              <span>Periodo</span>
              <select value={period.id} onChange={(e) => setPeriodId(e.target.value)}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.state === "abierto" ? "abierto" : "cerrado"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {data.isPending ? (
          <p className="ia-muted">Cargando los registros…</p>
        ) : data.error ? (
          <p className="ia-error">{data.error.message}</p>
        ) : (
          <>
            <dl className="ia-counts">
              <Count label="Registros" value={String(h.pipeline.total)} />
              <Count label="Con dato" ratio={h.withData} />
              <Count label="Enviados" ratio={h.sent} />
              <Count label="Aprobados" ratio={h.approved} />
              <Count label="Validados" ratio={h.validated} />
            </dl>
            <PipelineBar pipeline={h.pipeline} />
          </>
        )}
      </section>

      <div className="ia-views" role="tablist" aria-label="Qué auditar">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="ia-muted ia-audit__hint">
        {current.hint}
        {tab !== "actividad" && tab !== "oficinas" && late > 0 && (
          <strong className="ia-audit__late">
            {" "}
            · <Icon name="clock" size={12} /> {late} con atraso
          </strong>
        )}
      </p>

      {tab === "actividad" ? (
        <ActivityList activity={activity.data ?? []} pending={activity.isPending && records.length > 0} mode={mode} />
      ) : mode === "hoja" ? (
        <AuditSheet rows={rows} tab={tab} />
      ) : (
        <AuditList rows={rows} />
      )}
    </>
  );
}

function Count({ label, value, ratio }: { label: string; value?: string; ratio?: Ratio }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{ratio ? formatRatio(ratio) : value}</dd>
      {ratio && (
        <small className="ia-audit__of">
          {ratio.num} de {ratio.den}
        </small>
      )}
    </div>
  );
}

function PipelineBar({ pipeline }: { pipeline: Pipeline }) {
  if (pipeline.total === 0) return <p className="ia-muted">Este periodo todavía no tiene registros.</p>;
  return (
    <figure className="ia-audit__pipe">
      <div className="ia-audit__bar" role="img" aria-label="Dónde está cada registro del periodo">
        {STAGES.map((s) =>
          pipeline[s.key] ? <i key={s.key} style={{ flexGrow: pipeline[s.key] as number, background: s.tone }} title={`${s.label}: ${pipeline[s.key]}`} /> : null,
        )}
      </div>
      <figcaption>
        <ul className="ia-audit__legend">
          {STAGES.map((s) => (
            <li key={s.key}>
              <span className="ia-audit__dot" style={{ background: s.tone }} aria-hidden="true" />
              {s.label} <strong>{pipeline[s.key]}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

function AuditList({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <p className="ia-muted">No hay registros en este periodo.</p>;
  return (
    <ul className="ia-audit__list">
      {rows.map((r) => {
        const expanded = open === r.id;
        return (
          <li key={r.id} data-late={r.overdue || undefined}>
            <button type="button" className="ia-audit__row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.id)}>
              <span className="ia-audit__who">
                <strong>{r.name}</strong>
                <small>{r.context}</small>
              </span>
              <span className="ia-audit__meter">
                <span className="ia-audit__pct">{formatRatio(r.progress)}</span>
                <span className="ia-progress" aria-hidden="true">
                  <i style={{ transform: `scaleX(${(r.progress.pct ?? 0) / 100})` }} />
                </span>
                <small>
                  {r.progress.num} de {r.progress.den}
                </small>
              </span>
              <span className="ia-audit__facts">
                <span>{r.pending} pendientes</span>
                {r.returned > 0 && <span>{r.returned} devueltos</span>}
                {r.overdue && (
                  <span className="ia-audit__late">
                    <Icon name="clock" size={12} /> Atrasado
                  </span>
                )}
                <small>Últ. movimiento {day(r.lastActivity)}</small>
              </span>
            </button>
            {expanded && (
              <table className="ia-table ia-audit__records">
                <thead>
                  <tr>
                    <th scope="col">Indicador</th>
                    <th scope="col">Programa · sede</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.records
                    .slice()
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          <span className="ia-code">{rec.code}</span> {rec.name}
                        </td>
                        <td>
                          {rec.program_name}
                          {rec.campus_name ? ` · ${rec.campus_name}` : ""}
                        </td>
                        <td>{rec.state === "borrador" && rec.numerator === null && !rec.text_value ? "Sin dato" : STATE_LABEL[rec.state]}</td>
                        <td>{day(rec.updated_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AuditSheet({ rows, tab }: { rows: AuditRow[]; tab: Tab }) {
  const unit = { programas: "Programa", decanaturas: "Facultad", vicerrectorias: "Vicerrectoría", oficinas: "Oficina responsable", actividad: "" }[tab];
  const columns: GridColumn<AuditRow, null>[] = [
    { key: "name", label: unit, width: 250, show: (r) => r.name },
    { key: "context", label: "Contexto", width: 260, show: (r) => r.context },
    { key: "num", label: "Hecho", width: 80, numeric: true, show: (r) => String(r.progress.num) },
    { key: "den", label: "De", width: 80, numeric: true, show: (r) => String(r.progress.den) },
    { key: "pct", label: "Avance", width: 90, numeric: true, show: (r) => formatRatio(r.progress) },
    { key: "pending", label: "Pendientes", width: 100, numeric: true, show: (r) => String(r.pending) },
    { key: "returned", label: "Devueltos", width: 100, numeric: true, show: (r) => String(r.returned) },
    { key: "late", label: "Atrasado", width: 90, show: (r) => (r.overdue ? "Sí" : "No") },
    { key: "validated", label: "Validados", width: 95, numeric: true, show: (r) => String(r.pipeline.validado) },
    { key: "last", label: "Últ. movimiento", width: 130, show: (r) => day(r.lastActivity) },
  ];
  return (
    <DataGrid<AuditRow, null>
      label={`Auditoría por ${unit.toLowerCase()}`}
      rows={rows}
      rowId={(r) => r.id}
      initial={() => null}
      columns={columns}
      readOnly
      empty="No hay registros en este periodo."
    />
  );
}

function ActivityList({ activity, pending, mode }: { activity: Activity[]; pending: boolean; mode: WorkMode }) {
  if (pending) return <p className="ia-muted">Cargando la actividad…</p>;
  if (activity.length === 0) return <p className="ia-muted">Todavía nadie ha enviado, aprobado, validado ni devuelto nada en este periodo.</p>;
  const label = (s: string) => STATE_LABEL[s as keyof typeof STATE_LABEL] ?? s;
  if (mode === "hoja") {
    const columns: GridColumn<Activity, null>[] = [
      { key: "at", label: "Fecha", width: 150, show: (a) => new Date(a.at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) },
      { key: "actor", label: "Persona", width: 190, show: (a) => a.actor },
      { key: "program", label: "Programa", width: 190, show: (a) => a.record?.program_name ?? "" },
      { key: "code", label: "Indicador", width: 80, show: (a) => a.record?.code ?? "" },
      { key: "from", label: "De", width: 160, show: (a) => label(a.from_state) },
      { key: "to", label: "A", width: 160, show: (a) => label(a.to_state) },
      { key: "reason", label: "Motivo", width: 180, show: (a) => (a.reason ? REASON.get(a.reason) ?? a.reason : "") },
      { key: "comment", label: "Comentario", width: 260, show: (a) => a.comment },
    ];
    return <DataGrid<Activity, null> label="Actividad del periodo" rows={activity} rowId={(a) => String(a.id)} initial={() => null} columns={columns} readOnly />;
  }
  return (
    <ol className="ia-audit__activity">
      {activity.map((a) => (
        <li key={a.id} data-returned={a.to_state.startsWith("devuelto") || undefined}>
          <time dateTime={a.at}>{new Date(a.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</time>
          <p>
            <strong>{a.actor}</strong> pasó <span className="ia-code">{a.record?.code ?? "?"}</span> de {a.record?.program_name ?? "un programa"} de{" "}
            <em>{label(a.from_state)}</em> a <em>{label(a.to_state)}</em>
            {a.reason && (
              <>
                {" "}
                · {REASON.get(a.reason) ?? a.reason}: «{a.comment}»
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
