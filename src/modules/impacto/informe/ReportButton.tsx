/* =============================================================================
   Indicadores de Impacto · «Informe con Pilo»: el botón y su ventana.

   La versión sencilla del «Análisis de los datos» de UDES en Cifras:
     1. En la ventana se elige la unidad (programa y sede, facultad o
        vicerrectoría, entre las que le tocan a quien mira) y un encargo
        corto: formato, longitud, público e indicaciones.
     2. «Escribir el informe»: las cifras se calculan aquí (report.ts, sin IA)
        y la IA escribe un capítulo tras otro y el cierre (acción «analizar»
        de pilo-ia, portal «impacto»), con su avance y la opción de detener.
     3. El documento se ve en la ventana con el diseño del análisis, se guarda
        solo al terminar (imp_ai_reports) y se descarga en PDF desde su página
        de impresión.
   Lo que se escribe vive en el botón, no en la ventana: cerrarla no detiene
   ni pierde nada, y el botón muestra el avance.

   Por defecto es de la administración; ella lo abre por tipo de unidad en
   Mr. Pilo con IA › Dónde aparece. La base y la función del servidor lo
   vuelven a revisar.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { PiloAvatar } from "../../../components/pilo/PiloAvatar";
import { analyzePart } from "../../../components/pilo/ai/client";
import type { AnalysisResult } from "../../../components/pilo/ai/client";
import type { AnalysisBrief, AnalysisFormat, AnalysisLength } from "../../../components/pilo/ai/logic";
import { ANALYSIS_LENGTHS, DEFAULT_BRIEF, closingFacts } from "../../boletin/analysis";
import type { AnalysisChapter } from "../../boletin/analysis";
import { FUNCTION_LABEL } from "../model";
import type { SubstantiveFunction } from "../model";
import { usePortalData } from "../portal/data";
import type { ImpactBase } from "../store";
import { KIND_LABEL, docName, hasChoices, reportChoices, reportPlan } from "./report";
import type { ReportChoices, ReportDoc, ReportKind, ReportPlan, ReportScope } from "./report";
import { ReportPaper } from "./ReportSheets";
import { useDeleteReport, useReport, useReportSwitches, useSaveReport, useSavedReports } from "./store";
import "./informe.css";

const CLOSING = "__cierre__";

const FORMATS: { id: AnalysisFormat; label: string; text: string }[] = [
  { id: "ejecutivo", label: "Ejecutivo", text: "Cumplimiento, hallazgos y recomendaciones para decidir." },
  { id: "tecnico", label: "Técnico", text: "Cada indicador: serie, meta, avance y comparación." },
  { id: "tendencias", label: "Alertas", text: "Lo rezagado, lo que falta reportar y lo que mejora." },
  { id: "libre", label: "Libre", text: "Solo con sus indicaciones." },
];

const AUDIENCE: Record<ReportKind, string[]> = {
  programa: ["Dirección del programa", "Comité curricular", "Decanatura", "Consejo Superior"],
  facultad: ["Decanatura", "Consejo de facultad", "Rectoría y vicerrectorías", "Consejo Superior"],
  vicerrectoria: ["Vicerrectoría", "Rectoría y vicerrectorías", "Decanos y directores", "Consejo Superior"],
};

const IDEAS = ["Enfócate en lo rezagado", "Compara con la mediana de los demás programas", "Señala qué falta reportar", "Explícalo para quien no es experto"];

type RunState = { state: "espera" | "escribe" | "listo" | "error"; ms?: number; error?: string };

const seconds = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

const chapterOf = (r: AnalysisResult): AnalysisChapter => ({
  summary: r.summary,
  paragraphs: r.paragraphs,
  alerts: r.alerts,
  recommendations: r.recommendations,
  unknown: r.unknown ?? [],
  model: r.model ?? "",
  at: new Date().toISOString(),
});

/* --- Quien escribe: vive en el botón, así cerrar la ventana no pierde nada ---------------- */

function useReportWriter() {
  const planRef = useRef<ReportPlan | null>(null);
  const docRef = useRef<ReportDoc | null>(null);
  const savedRef = useRef<string | null>(null);
  const stop = useRef(false);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [steps, setSteps] = useState<Record<string, RunState>>({});
  const [running, setRunning] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const save = useSaveReport();

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const put = (next: ReportDoc | null) => {
    docRef.current = next;
    setDoc(next);
  };
  const step = (key: string, value: RunState) => setSteps((s) => ({ ...s, [key]: value }));
  const failure = (error: unknown) => (error instanceof Error ? error.message : "No se pudo escribir esta parte.");

  const scopeOf = (plan: ReportPlan) => ({ kind: plan.scope.kind, ref: plan.scope.ref, campus: plan.scope.campusId });

  const writePart = async (key: string) => {
    const plan = planRef.current;
    const d = docRef.current;
    const part = plan?.parts.find((p) => p.key === key);
    if (!plan || !d || !part) return;
    step(key, { state: "escribe" });
    const t0 = Date.now();
    try {
      const result = await analyzePart(
        { brief: d.brief, part: "capitulo", title: part.title, facts: part.facts, pdi: d.pdi, fresh: true, doc: docName(plan), scope: scopeOf(plan) },
        "impacto",
      );
      const chapter = chapterOf(result);
      const cur = docRef.current!;
      put({ ...cur, parts: cur.parts.map((p) => (p.key === key ? { ...p, chapter } : p)) });
      step(key, { state: "listo", ms: Date.now() - t0 });
    } catch (error) {
      step(key, { state: "error", ms: Date.now() - t0, error: failure(error) });
    }
  };

  const writeClosing = async () => {
    const plan = planRef.current;
    const d = docRef.current;
    if (!plan || !d) return;
    const written = d.parts.filter((p) => p.chapter).map((p) => ({ title: p.title, chapter: p.chapter as AnalysisChapter }));
    if (!written.length) return;
    step(CLOSING, { state: "escribe" });
    const t0 = Date.now();
    try {
      const result = await analyzePart(
        { brief: d.brief, part: "cierre", title: d.title, facts: closingFacts(written), pdi: d.pdi, fresh: true, doc: docName(plan), scope: scopeOf(plan) },
        "impacto",
      );
      put({ ...docRef.current!, closing: chapterOf(result) });
      step(CLOSING, { state: "listo", ms: Date.now() - t0 });
    } catch (error) {
      step(CLOSING, { state: "error", ms: Date.now() - t0, error: failure(error) });
    }
  };

  /** Guarda lo escrito (o lo completa, si ya estaba guardado). Si falla, sigue en pantalla. */
  const persist = async () => {
    const d = docRef.current;
    if (!d || !d.parts.some((p) => p.chapter)) return;
    setSaveError("");
    try {
      const id = await save.mutateAsync({ doc: d, id: savedRef.current });
      savedRef.current = id;
      setSavedId(id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el informe.");
    }
  };

  const start = async (plan: ReportPlan, brief: AnalysisBrief, pdi: boolean) => {
    planRef.current = plan;
    stop.current = false;
    savedRef.current = null;
    setSavedId(null);
    setSaveError("");
    put({
      version: 1,
      scope: plan.scope,
      unitName: plan.unitName,
      title: plan.title,
      subtitle: plan.subtitle,
      cut: plan.cut,
      brief,
      pdi,
      parts: plan.parts.map(({ facts: _facts, ...p }) => ({ ...p, chapter: null })),
      closing: null,
      createdAt: new Date().toISOString(),
    });
    setSteps(Object.fromEntries([...plan.parts.map((p) => [p.key, { state: "espera" } as RunState]), [CLOSING, { state: "espera" } as RunState]]));
    setRunning(true);
    // Uno tras otro: el proveedor puede tardar hasta un minuto y medio por capítulo.
    for (const part of plan.parts) {
      if (stop.current) break;
      await writePart(part.key);
    }
    if (!stop.current) await writeClosing();
    setRunning(false);
    await persist();
  };

  const retry = async (key: string) => {
    setRunning(true);
    if (key === CLOSING) await writeClosing();
    else await writePart(key);
    setRunning(false);
    await persist();
  };

  const load = (saved: ReportDoc, id: string) => {
    planRef.current = null;
    savedRef.current = id;
    setSavedId(id);
    setSaveError("");
    setSteps({});
    put(saved);
  };

  const reset = () => {
    planRef.current = null;
    savedRef.current = null;
    setSavedId(null);
    setSaveError("");
    setSteps({});
    put(null);
  };

  return {
    doc,
    steps,
    running,
    elapsed,
    savedId,
    saving: save.isPending,
    saveError,
    /** Se puede volver a escribir una parte mientras se tengan sus cifras (en esta sesión). */
    canRetry: () => Boolean(planRef.current),
    plan: () => planRef.current,
    start,
    stop: () => (stop.current = true),
    retry,
    persist,
    load,
    reset,
  };
}

type Writer = ReturnType<typeof useReportWriter>;

/* --- El botón ------------------------------------------------------------------------------ */

export function ReportButton({ base, admin }: { base: ImpactBase; admin: boolean }) {
  const switches = useReportSwitches();
  const open = switches.data ?? { enabled: false, programa: false, facultad: false, vicerrectoria: false };
  const choices = useMemo(() => reportChoices(base, admin, open), [base, admin, open.programa, open.facultad, open.vicerrectoria]); // eslint-disable-line react-hooks/exhaustive-deps
  const writer = useReportWriter();
  const [shown, setShown] = useState(false);
  const close = useCallback(() => setShown(false), []);

  // La administración siempre lo ve; los demás, si la IA está encendida y se abrió para su unidad.
  const visible = admin || (open.enabled && hasChoices(choices));
  if (!visible) return null;

  const total = Object.keys(writer.steps).length;
  const done = Object.values(writer.steps).filter((s) => s.state === "listo" || s.state === "error").length;
  return (
    <>
      <button type="button" className="imp-rep-trigger" onClick={() => setShown(true)} data-busy={writer.running || undefined}>
        <PiloAvatar mood={writer.running ? "piensa" : "idea"} size={26} alive={writer.running} />
        <span>{writer.running ? `Pilo escribe · ${done} de ${total}` : "Informe con Pilo"}</span>
      </button>
      {/* Al cuerpo del documento: la cabecera de la intranet tiene desenfoque de fondo y
          atraparía la ventana en su caja (sin desplazamiento ni botones a la vista). */}
      {shown &&
        createPortal(
          <Modal
            title="Informe de impacto con Mr. Pilo"
            description="Pilo lee las cifras de la unidad que elija, frente a sus metas 2026 y 2028, y escribe un informe con hallazgos, alertas y recomendaciones."
            size="wide"
            onClose={close}
          >
            <div className="imp-rep-root">
              <ReportDialog choices={choices} admin={admin} aiOn={open.enabled || (admin && !switches.data)} writer={writer} />
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

/* --- La ventana ---------------------------------------------------------------------------- */

function ReportDialog({ choices, admin, aiOn, writer }: { choices: ReportChoices; admin: boolean; aiOn: boolean; writer: Writer }) {
  if (writer.doc) return <ReportResult writer={writer} />;
  return <ReportForm choices={choices} admin={admin} aiOn={aiOn} writer={writer} />;
}

const firstKind = (c: ReportChoices): ReportKind => (c.programs.length ? "programa" : c.faculties.length ? "facultad" : "vicerrectoria");

function ReportForm({ choices, admin, aiOn, writer }: { choices: ReportChoices; admin: boolean; aiOn: boolean; writer: Writer }) {
  const portal = usePortalData();
  const kinds = (["programa", "facultad", "vicerrectoria"] as ReportKind[]).filter((k) =>
    k === "programa" ? choices.programs.length : k === "facultad" ? choices.faculties.length : choices.functions.length,
  );
  const [kind, setKind] = useState<ReportKind>(firstKind(choices));
  const [programId, setProgramId] = useState(choices.programs[0]?.id ?? "");
  const program = choices.programs.find((p) => p.id === programId) ?? choices.programs[0];
  const [campusId, setCampusId] = useState<string>(program && !program.allCampuses ? program.campuses[0]?.id ?? "" : "");
  const [facultyId, setFacultyId] = useState(choices.faculties[0]?.id ?? "");
  const [fn, setFn] = useState<SubstantiveFunction>(choices.functions[0] ?? "investigacion");
  const [format, setFormat] = useState<AnalysisFormat>("ejecutivo");
  const [length, setLength] = useState<AnalysisLength>("breve");
  const [audience, setAudience] = useState(AUDIENCE[firstKind(choices)][0]);
  const [prompt, setPrompt] = useState("");
  const [pdi, setPdi] = useState(true);

  const pickKind = (k: ReportKind) => {
    setKind(k);
    setAudience(AUDIENCE[k][0]);
  };
  const pickProgram = (id: string) => {
    setProgramId(id);
    const p = choices.programs.find((x) => x.id === id);
    setCampusId(p && !p.allCampuses ? p.campuses[0]?.id ?? "" : "");
  };

  const scope: ReportScope | null =
    kind === "programa" ? (program ? { kind, ref: program.id, campusId: campusId || null } : null) : kind === "facultad" ? (facultyId ? { kind, ref: facultyId, campusId: null } : null) : { kind, ref: fn, campusId: null };
  const size = ANALYSIS_LENGTHS.find((l) => l.id === length) ?? ANALYSIS_LENGTHS[0];
  const plan = useMemo(() => (portal.data && scope ? reportPlan(portal.data, scope, size.indicators) : null), [portal.data, scope?.kind, scope?.ref, scope?.campusId, size.indicators]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = plan ? plan.parts.length + 1 : 0;
  const estimate = plan ? plan.parts.length * size.seconds + 20 : 0;

  const brief: AnalysisBrief = { ...DEFAULT_BRIEF, format, length, audience, prompt: prompt.trim() };
  const ready = Boolean(plan && plan.parts.length && aiOn);

  if (!kinds.length) {
    return <p className="imp-rep-empty">Todavía no tiene unidades de las que pueda pedir un informe. La administración los abre por tipo de unidad.</p>;
  }

  return (
    <div className="imp-rep-form">
      <div className="imp-rep-form__main">
        <fieldset className="imp-rep-group">
          <legend>¿De qué unidad?</legend>
          {kinds.length > 1 && (
            <div className="imp-seg imp-seg--block" role="group" aria-label="Tipo de unidad">
              {kinds.map((k) => (
                <button key={k} type="button" aria-pressed={k === kind} onClick={() => pickKind(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {kind === "programa" && program && (
            <div className="imp-rep-row">
              <label className="admin-field">
                <span>Programa</span>
                <select value={program.id} onChange={(e) => pickProgram(e.target.value)}>
                  {choices.programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {admin && p.faculty ? ` · ${p.faculty}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Sede</span>
                <select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
                  {program.allCampuses && <option value="">Todas sus sedes</option>}
                  {program.campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {kind === "facultad" && (
            <label className="admin-field">
              <span>Facultad</span>
              <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                {choices.faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "vicerrectoria" && (
            <div className="imp-seg" role="group" aria-label="Función sustantiva">
              {choices.functions.map((f) => (
                <button key={f} type="button" aria-pressed={f === fn} onClick={() => setFn(f)}>
                  {FUNCTION_LABEL[f]}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="imp-rep-group">
          <legend>¿Qué tipo de informe?</legend>
          <div className="imp-rep-cards" role="radiogroup" aria-label="Formato">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={f.id === format} onClick={() => setFormat(f.id)}>
                <strong>{f.label}</strong>
                <small>{f.text}</small>
              </button>
            ))}
          </div>
          <div className="imp-rep-row">
            <div className="admin-field">
              <span>Longitud</span>
              <div className="imp-seg" role="radiogroup" aria-label="Longitud">
                {ANALYSIS_LENGTHS.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={l.id === length} aria-pressed={l.id === length} onClick={() => setLength(l.id)}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="admin-field">
              <span>Para quién</span>
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCE[kind].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="admin-field">
            <span>
              Indicaciones para Pilo <small>(opcional · {prompt.length} / 1.200)</small>
            </span>
            <textarea rows={3} maxLength={1200} value={prompt} placeholder="Por ejemplo: céntrese en los indicadores de impacto real y en lo que falta reportar." onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <div className="imp-rep-ideas" aria-label="Ideas">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setPrompt((p) => (p ? `${p.replace(/\s+$/, "")} ${idea}.` : `${idea}.`).slice(0, 1200))}>
                <Icon name="plus" size={12} /> {idea}
              </button>
            ))}
          </div>
          <label className="imp-rep-check">
            <input type="checkbox" checked={pdi} onChange={(e) => setPdi(e.target.checked)} />
            <span>Conectar con el Plan de Desarrollo (pilares y proyectos)</span>
          </label>
        </fieldset>
      </div>

      <aside className="imp-rep-plan" aria-live="polite">
        <div className="imp-rep-plan__head">
          <PiloAvatar mood={ready ? "idea" : "duda"} size={56} />
          <div>
            <strong>{plan ? plan.unitName : "Elija la unidad"}</strong>
            <span>{plan?.subtitle ?? (portal.isPending ? "Leyendo las cifras de Impacto…" : "")}</span>
          </div>
        </div>
        {portal.error ? (
          <p className="imp-rep-plan__note">No pude leer las cifras del portal: {portal.error.message}</p>
        ) : plan && !plan.parts.length ? (
          <p className="imp-rep-plan__note">Esta unidad todavía no sigue indicadores con cifras que leer. Elija otra, o vuelva cuando haya reportado.</p>
        ) : plan ? (
          <>
            <p className="imp-rep-plan__note">Pilo escribirá, uno tras otro:</p>
            <ol className="imp-rep-plan__list">
              {plan.parts.map((p) => (
                <li key={p.key}>
                  {p.title} <small>{p.sources.length} {p.sources.length === 1 ? "indicador" : "indicadores"}</small>
                </li>
              ))}
              <li>Conclusiones y recomendaciones</li>
            </ol>
            <p className="imp-rep-plan__time">
              <Icon name="clock" size={14} /> {calls} llamadas · unos {Math.max(1, Math.round(estimate / 60))} min
            </p>
          </>
        ) : null}
        {!aiOn && <p className="imp-rep-plan__warn">Mr. Pilo con IA está apagado: enciéndalo en Mr. Pilo con IA › Conexión.</p>}
        <button type="button" className="button-primary imp-rep-go" disabled={!ready || writer.running} onClick={() => plan && void writer.start(plan, brief, pdi)}>
          <Icon name="spark" size={16} /> Escribir el informe
        </button>
        <p className="imp-rep-plan__fine">Las cifras se calculan sin IA; cada número que escriba Pilo se compara con ellas y los que no estén quedan para revisar.</p>
      </aside>

      <SavedList writer={writer} />

      {/* En pantallas estrechas el plan queda abajo: la acción, siempre a la vista. */}
      <div className="imp-rep-footer">
        <span>{plan && plan.parts.length ? `${calls} llamadas · unos ${Math.max(1, Math.round(estimate / 60))} min` : "Elija una unidad con cifras"}</span>
        <button type="button" className="button-primary imp-rep-go" disabled={!ready || writer.running} onClick={() => plan && void writer.start(plan, brief, pdi)}>
          <Icon name="spark" size={16} /> Escribir el informe
        </button>
      </div>
    </div>
  );
}

function SavedList({ writer }: { writer: Writer }) {
  const saved = useSavedReports(true);
  const remove = useDeleteReport();
  const [openId, setOpenId] = useState<string | null>(null);
  const report = useReport(openId ?? undefined);
  useEffect(() => {
    if (openId && report.data) {
      writer.load(report.data.doc, openId);
      setOpenId(null);
    }
  }, [openId, report.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!saved.data?.length) return null;
  const date = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  return (
    <section className="imp-rep-saved" aria-label="Informes guardados">
      <h3>Informes guardados</h3>
      <ul>
        {saved.data.map((r) => (
          <li key={r.id}>
            <button type="button" className="imp-rep-saved__open" onClick={() => setOpenId(r.id)} disabled={openId === r.id}>
              <Icon name="document" size={16} />
              <span>
                <strong>{r.title}</strong>
                <small>
                  {KIND_LABEL[r.kind]} · {date(r.createdAt)}
                </small>
              </span>
            </button>
            <a className="imp-rep-icon" href={`/admin/impacto-informe/${r.id}`} target="_blank" rel="noreferrer" aria-label={`Descargar en PDF: ${r.title}`} title="Descargar PDF">
              <Icon name="download" size={16} />
            </a>
            <button
              type="button"
              className="imp-rep-icon"
              aria-label={`Borrar ${r.title}`}
              title="Borrar"
              disabled={remove.isPending}
              onClick={() => window.confirm(`¿Borrar «${r.title}»? No se puede deshacer.`) && remove.mutate(r.id)}
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {report.error && <p className="imp-rep-plan__warn">{report.error.message}</p>}
    </section>
  );
}

/* --- El resultado: avance y documento ------------------------------------------------------ */

function ReportResult({ writer }: { writer: Writer }) {
  const doc = writer.doc!;
  const entries = [...doc.parts.map((p) => ({ key: p.key, title: p.title })), { key: CLOSING, title: "Conclusiones" }];
  const written = doc.parts.filter((p) => p.chapter).length;
  const toReview = [...doc.parts.map((p) => p.chapter?.unknown.length ?? 0), doc.closing?.unknown.length ?? 0].reduce((t, n) => t + n, 0);
  const anySteps = Object.keys(writer.steps).length > 0;

  return (
    <div className="imp-rep-result">
      <div className="imp-rep-bar">
        <div className="imp-rep-bar__status" aria-live="polite">
          <PiloAvatar mood={writer.running ? "piensa" : written ? "excelente" : "cuidado"} size={44} alive={writer.running} />
          <div>
            <strong>
              {writer.running
                ? "Pilo está escribiendo…"
                : written
                  ? writer.savedId
                    ? "Informe listo y guardado"
                    : writer.saving
                      ? "Guardando el informe…"
                      : "Informe listo"
                  : "No se escribió ningún capítulo"}
            </strong>
            <span>
              {writer.running ? `${seconds(writer.elapsed)} · cada capítulo tarda de 10 a 90 segundos` : doc.subtitle}
              {!writer.running && toReview > 0 ? ` · ${toReview} ${toReview === 1 ? "cifra" : "cifras"} para revisar` : ""}
            </span>
          </div>
        </div>
        <div className="imp-rep-bar__actions">
          {writer.running ? (
            <button type="button" className="button-secondary" onClick={writer.stop}>
              Detener después de esta parte
            </button>
          ) : (
            <>
              <button type="button" className="button-secondary" onClick={writer.reset}>
                <Icon name="plus" size={16} /> Nuevo informe
              </button>
              {writer.saveError ? (
                <button type="button" className="button-secondary" onClick={() => void writer.persist()}>
                  Reintentar guardar
                </button>
              ) : null}
              <a
                className="button-primary imp-rep-pdf"
                href={writer.savedId ? `/admin/impacto-informe/${writer.savedId}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!writer.savedId || undefined}
                onClick={(e) => !writer.savedId && e.preventDefault()}
              >
                <Icon name="download" size={16} /> Descargar PDF
              </a>
            </>
          )}
        </div>
      </div>

      {writer.saveError && (
        <p className="imp-rep-plan__warn" role="alert">
          No se pudo guardar: {writer.saveError}. El informe sigue aquí mientras no cierre la página.
        </p>
      )}

      {anySteps && (
        <ol className="imp-rep-steps">
          {entries.map((e) => {
            const s = writer.steps[e.key] ?? { state: "espera" };
            return (
              <li key={e.key} data-state={s.state}>
                <span className="imp-rep-steps__dot" aria-hidden="true" />
                <span className="imp-rep-steps__name">{e.title}</span>
                <small>
                  {s.state === "espera" ? "En espera" : s.state === "escribe" ? "Escribiendo…" : s.state === "listo" ? `Listo · ${seconds(s.ms ?? 0)}` : "No se escribió"}
                </small>
                {s.state === "error" && (
                  <>
                    <span className="imp-rep-steps__error">{s.error}</span>
                    {!writer.running && writer.canRetry() && (
                      <button type="button" className="imp-rep-steps__retry" onClick={() => void writer.retry(e.key)}>
                        Volver a intentar
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {written > 0 ? (
        <div className="imp-rep-sheet">
          <ReportPaper doc={doc} />
        </div>
      ) : writer.running ? (
        <p className="imp-rep-waiting">El documento aparece aquí en cuanto Pilo termine el primer capítulo. Puede cerrar esta ventana: el informe sigue escribiéndose.</p>
      ) : null}
    </div>
  );
}
