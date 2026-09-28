/* =============================================================================
   Boletín · pestaña «Análisis con Pilo».

   Mr. Pilo pregunta cuatro cosas y escribe:
     1. Formato: tipo de informe, público y tono.
     2. Fuentes: qué informes de UDES en Cifras lee, con su corte y campus, y
        si cruza con el Plan de Desarrollo.
     3. Longitud: breve, estándar o extensa, y qué incluye.
     4. Indicaciones: lo que quien encarga quiere que analice (con plantillas).
     5. Escribir: un capítulo por informe y un cierre, uno tras otro, con su
        avance. Luego se revisa: cifras «para revisar», editar el texto,
        volver a escribir un capítulo.
   Las cifras se calculan en el navegador (analysis.ts) y la IA solo escribe
   (acción «analizar» de pilo-ia). Lo escrito se guarda en el boletín.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { PiloAvatar } from "../../../../components/pilo/PiloAvatar";
import type { PiloMood } from "../../../../components/pilo/PiloAvatar";
import { analyzePart, PiloError } from "../../../../components/pilo/ai/client";
import { usePiloAiConfig } from "../../../../components/pilo/ai/config";
import { analysisText, verifyNumbers } from "../../../../components/pilo/ai/logic";
import type { AnalysisBrief } from "../../../../components/pilo/ai/logic";
import { ALL_YEARS, cutLabel } from "../../../datos-abiertos/data/terms";
import type { OpenDataCatalog } from "../../../datos-abiertos/data/types";
import {
  ANALYSIS_AUDIENCES,
  ANALYSIS_FORMATS,
  ANALYSIS_LENGTHS,
  ANALYSIS_TONES,
  analysisFacts,
  analysisIndicators,
  closingFacts,
  defaultAnalysis,
} from "../../../boletin/analysis";
import type { AnalysisChapter, BulletinAnalysis } from "../../../boletin/analysis";
import type { BulletinSettings } from "../../../boletin/model";
import { useAnalysisPrompts, useDeleteAnalysisPrompt, useSaveAnalysisPrompt } from "../../../boletin/prompts";
import "./analysis-tab.css";

const STEPS = ["Formato", "Fuentes", "Longitud", "Indicaciones", "Escribir"] as const;
const CLOSING = "__cierre__";

type RunState = { state: "espera" | "escribe" | "listo" | "error"; ms?: number; error?: string; cached?: boolean; truncated?: boolean };

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const blocks = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export function AnalysisTab({
  catalog,
  draft,
  setDraft,
  canEdit,
  onWritten,
}: {
  catalog: OpenDataCatalog;
  draft: BulletinSettings;
  setDraft: Dispatch<SetStateAction<BulletinSettings>>;
  canEdit: boolean;
  /** Al terminar de escribir: se guarda el boletín con lo escrito. */
  onWritten: (settings: BulletinSettings) => void;
}) {
  const analysis = draft.analysis ?? defaultAnalysis();
  const hasText = Object.keys(analysis.chapters).length > 0;
  const [step, setStep] = useState(hasText ? 4 : 0);
  const [run, setRun] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const stop = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;
  const config = usePiloAiConfig();
  const aiReady = config.data?.enabled ?? false;

  const patch = (next: Partial<BulletinAnalysis>) =>
    setDraft((d) => ({ ...d, analysis: { ...(d.analysis ?? defaultAnalysis()), ...next } }));
  const setBrief = (next: Partial<AnalysisBrief>) =>
    setDraft((d) => {
      const a = d.analysis ?? defaultAnalysis();
      return { ...d, analysis: { ...a, brief: { ...a.brief, ...next } } };
    });

  const length = ANALYSIS_LENGTHS.find((l) => l.id === analysis.brief.length) ?? ANALYSIS_LENGTHS[1];

  // Los informes que se pueden leer: los que tienen cifras.
  const readable = useMemo(
    () =>
      draft.reports
        .filter((entry) => !entry.removed)
        .map((entry) => {
          const report = catalog.reports.find((r) => r.slug === entry.slug);
          return report ? { entry, report, count: analysisIndicators(report, entry, catalog, length.indicators).length } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x && x.count > 0)),
    [draft.reports, catalog, length.indicators],
  );
  const chosen = readable.filter((x) => x.entry.include);
  const calls = chosen.length + (chosen.length ? 1 : 0);
  const estimate = chosen.length * length.seconds + (chosen.length ? 20 : 0);

  const toggleReport = (slug: string) =>
    setDraft((d) => ({ ...d, reports: d.reports.map((r) => (r.slug === slug ? { ...r, include: !r.include } : r)) }));

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const writeChapter = async (slug: string, fresh: boolean): Promise<AnalysisChapter | null> => {
    const d = latest.current;
    const a = d.analysis ?? defaultAnalysis();
    const entry = d.reports.find((r) => r.slug === slug);
    const report = catalog.reports.find((r) => r.slug === slug);
    if (!entry || !report) return null;
    const facts = analysisFacts(report, entry, catalog, d.cut, d.campus, length.indicators);
    setRun((r) => ({ ...r, [slug]: { state: "escribe" } }));
    const t0 = Date.now();
    try {
      const result = await analyzePart({ brief: a.brief, part: "capitulo", title: report.name, facts, pdi: a.pdi, fresh });
      const chapter: AnalysisChapter = {
        summary: result.summary,
        paragraphs: result.paragraphs,
        alerts: result.alerts,
        recommendations: result.recommendations,
        unknown: result.unknown ?? [],
        model: result.model ?? "",
        at: new Date().toISOString(),
      };
      setDraft((cur) => {
        const ca = cur.analysis ?? defaultAnalysis();
        return { ...cur, analysis: { ...ca, chapters: { ...ca.chapters, [slug]: chapter } } };
      });
      setRun((r) => ({ ...r, [slug]: { state: "listo", ms: Date.now() - t0, cached: result.cached, truncated: result.truncated } }));
      return chapter;
    } catch (error) {
      const text = error instanceof PiloError || error instanceof Error ? error.message : "No se pudo escribir este capítulo.";
      setRun((r) => ({ ...r, [slug]: { state: "error", ms: Date.now() - t0, error: text } }));
      return null;
    }
  };

  const writeClosing = async (written: { title: string; chapter: AnalysisChapter }[], fresh: boolean) => {
    const d = latest.current;
    const a = d.analysis ?? defaultAnalysis();
    if (!written.length) return;
    setRun((r) => ({ ...r, [CLOSING]: { state: "escribe" } }));
    const t0 = Date.now();
    try {
      const result = await analyzePart({ brief: a.brief, part: "cierre", title: d.texts.coverTitle, facts: closingFacts(written), pdi: a.pdi, fresh });
      const closing: AnalysisChapter = {
        summary: result.summary,
        paragraphs: result.paragraphs,
        alerts: result.alerts,
        recommendations: result.recommendations,
        unknown: result.unknown ?? [],
        model: result.model ?? "",
        at: new Date().toISOString(),
      };
      setDraft((cur) => ({ ...cur, analysis: { ...(cur.analysis ?? defaultAnalysis()), closing } }));
      setRun((r) => ({ ...r, [CLOSING]: { state: "listo", ms: Date.now() - t0, cached: result.cached, truncated: result.truncated } }));
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo escribir el cierre.";
      setRun((r) => ({ ...r, [CLOSING]: { state: "error", ms: Date.now() - t0, error: text } }));
    }
  };

  /** Escribe todo: un capítulo tras otro (el proveedor puede ser lento) y el cierre. */
  const writeAll = async () => {
    stop.current = false;
    setBusy(true);
    setElapsed(0);
    setStep(4);
    setRun(Object.fromEntries([...chosen.map((x) => [x.report.slug, { state: "espera" } as RunState]), [CLOSING, { state: "espera" } as RunState]]));
    const written: { title: string; chapter: AnalysisChapter }[] = [];
    for (const { report } of chosen) {
      if (stop.current) break;
      // Escribir de nuevo es escribir de nuevo: no se toma lo guardado de una prueba anterior.
      const chapter = await writeChapter(report.slug, true);
      if (chapter) written.push({ title: report.name, chapter });
    }
    if (!stop.current) await writeClosing(written, true);
    setBusy(false);
    // Lo escrito queda guardado: el estado ya tiene los capítulos al siguiente tick.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (written.length) onWritten(latest.current);
  };

  const rewrite = async (slug: string) => {
    setBusy(true);
    setElapsed(0);
    if (slug === CLOSING) {
      const d = latest.current.analysis ?? defaultAnalysis();
      const written = chosen
        .map((x) => ({ title: x.report.name, chapter: d.chapters[x.report.slug] }))
        .filter((x): x is { title: string; chapter: AnalysisChapter } => Boolean(x.chapter));
      await writeClosing(written, true);
    } else {
      await writeChapter(slug, true);
    }
    setBusy(false);
  };

  /** Al editar, las cifras se vuelven a comparar: lo corregido deja de estar «para revisar». */
  const editChapter = (slug: string, next: Partial<AnalysisChapter>) =>
    setDraft((cur) => {
      const a = cur.analysis ?? defaultAnalysis();
      const recheck = (chapter: AnalysisChapter, facts: string): AnalysisChapter => ({ ...chapter, unknown: verifyNumbers(analysisText(chapter), facts).unknown });
      if (slug === CLOSING) {
        if (!a.closing) return cur;
        const facts = Object.values(a.chapters).map((c) => [c.summary, ...c.paragraphs, ...c.alerts].join("\n")).join("\n");
        return { ...cur, analysis: { ...a, closing: recheck({ ...a.closing, ...next }, facts) } };
      }
      const prior = a.chapters[slug];
      const report = catalog.reports.find((r) => r.slug === slug);
      if (!prior || !report) return cur;
      const facts = analysisFacts(report, cur.reports.find((r) => r.slug === slug), catalog, cur.cut, cur.campus, length.indicators);
      return { ...cur, analysis: { ...a, chapters: { ...a.chapters, [slug]: recheck({ ...prior, ...next }, facts) } } };
    });

  const mood: PiloMood = busy ? "piensa" : Object.values(run).some((r) => r.state === "error") ? "duda" : hasText ? "excelente" : step === 3 ? "idea" : "feliz";
  const ask = [
    <>¿Qué tipo de informe necesita? Así sé <b>cómo escribir</b> y <b>qué destacar</b>.</>,
    <>¿Qué informes de UDES en Cifras leo? Con <b>tres o cuatro</b> el análisis queda más profundo.</>,
    <>¿Qué tan largo lo quiere? Escribo <b>un capítulo por informe</b>, así que el tiempo crece con las fuentes.</>,
    <>¿Algo en particular? Escriba <b>cómo quiere que analice</b> la información. Si lo deja vacío, sigo el formato que eligió.</>,
    busy ? (
      <>Estoy escribiendo. Voy capítulo por capítulo y reviso <b>cada número</b> contra las cifras.</>
    ) : hasText ? (
      <>Listo. Revise lo que marqué <b>para revisar</b>, ajuste el texto si hace falta y publíquelo desde «Publicación».</>
    ) : (
      <>Cuando quiera, <b>escribo el análisis</b>. Tardo unos {Math.max(1, Math.round(estimate / 60))} minutos.</>
    ),
  ];

  return (
    <div className="ana">
      <header className="ana-head">
        <PiloAvatar mood={mood} size={56} alive={busy} />
        <div>
          <b>Análisis de los datos con Mr. Pilo</b>
          <p>{ask[step]}</p>
        </div>
      </header>

      {!config.isPending && !aiReady && (
        <p className="ana-warn" role="status">
          <Icon name="alert" size={15} /> Mr. Pilo con IA está apagado o sin conectar. Puede preparar el encargo, pero para escribir hay que encenderlo en
          Mr. Pilo con IA › Conexión.
        </p>
      )}

      <ol className="ana-steps" aria-label="Pasos del análisis">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" aria-current={step === i ? "step" : undefined} data-done={i < step || undefined} onClick={() => setStep(i)} disabled={busy}>
              <i>{i + 1}</i>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <fieldset className="ana-body" disabled={!canEdit || busy}>
        {step === 0 && (
          <>
            <div className="ana-opts" role="radiogroup" aria-label="Tipo de informe">
              {ANALYSIS_FORMATS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={analysis.brief.format === f.id} className="ana-opt" onClick={() => setBrief({ format: f.id })}>
                  <em>{f.for}</em>
                  <b>{f.label}</b>
                  <span>{f.text}</span>
                </button>
              ))}
            </div>
            <p className="ana-label">¿Para quién es?</p>
            <div className="ana-chips" role="radiogroup" aria-label="Público">
              {ANALYSIS_AUDIENCES.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={analysis.brief.audience === a} onClick={() => setBrief({ audience: a })}>
                  {a}
                </button>
              ))}
            </div>
            <p className="ana-label">Tono</p>
            <div className="ana-chips" role="radiogroup" aria-label="Tono">
              {ANALYSIS_TONES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={analysis.brief.tone === t.id} onClick={() => setBrief({ tone: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {readable.length === 0 ? (
              <p className="ana-muted">Ningún informe de este periodo tiene cifras todavía.</p>
            ) : (
              <ul className="ana-sources" role="list">
                {readable.map(({ entry, report, count }) => (
                  <li key={report.slug}>
                    <label>
                      <input type="checkbox" checked={entry.include} onChange={() => toggleReport(report.slug)} />
                      <span className="ana-code" style={{ "--code": `var(--od-line-${report.line})` } as CSSProperties}>
                        {report.code}
                      </span>
                      <span>
                        <b>{report.name}</b>
                        <small>{report.summary}</small>
                      </span>
                      <span className="ana-count">
                        {count} {count === 1 ? "indicador" : "indicadores"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="ana-row">
              <label className="admin-field">
                <span>Corte</span>
                <select value={draft.cut} onChange={(e) => setDraft((d) => ({ ...d, cut: Number(e.target.value) }))}>
                  <option value={ALL_YEARS}>Periodo {cutLabel(ALL_YEARS, null)}</option>
                  {[...catalog.years].reverse().map((y) => (
                    <option key={y} value={y}>
                      Corte {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Campus</span>
                <select value={draft.campus} onChange={(e) => setDraft((d) => ({ ...d, campus: e.target.value }))}>
                  {catalog.campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id === "todas" ? "Todos los campus" : c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ana-check">
              <input type="checkbox" checked={analysis.pdi} onChange={(e) => patch({ pdi: e.target.checked })} />
              <span>
                Conectar con el Plan de Desarrollo <small>Pilo busca en su memoria los pilares y proyectos del PDI relacionados con cada capítulo.</small>
              </span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="ana-opts" role="radiogroup" aria-label="Longitud">
              {ANALYSIS_LENGTHS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={analysis.brief.length === l.id} className="ana-opt" onClick={() => setBrief({ length: l.id })}>
                  <em>{l.pages}</em>
                  <b>{l.label}</b>
                  <span>{l.text}</span>
                </button>
              ))}
            </div>
            <p className="ana-label">Incluir en el documento</p>
            <div className="ana-toggles">
              {(
                [
                  ["Resumen de hallazgos", analysis.summary, (v: boolean) => patch({ summary: v })],
                  ["Gráficas de las cifras", analysis.charts, (v: boolean) => patch({ charts: v })],
                  ["Alertas", analysis.brief.alerts, (v: boolean) => setBrief({ alerts: v })],
                  ["Recomendaciones", analysis.brief.recommendations, (v: boolean) => setBrief({ recommendations: v })],
                  ["Nota metodológica", analysis.brief.method, (v: boolean) => setBrief({ method: v })],
                ] as [string, boolean, (v: boolean) => void][]
              ).map(([label, on, set]) => (
                <button key={label} type="button" aria-pressed={on} onClick={() => set(!on)}>
                  {on && <Icon name="check" size={13} />}
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && <Instructions brief={analysis.brief} setBrief={setBrief} />}

        {step === 4 && (
          <Writing
            chosen={chosen.map((x) => ({ slug: x.report.slug, name: x.report.name, code: x.report.code, line: x.report.line }))}
            analysis={analysis}
            run={run}
            busy={busy}
            editing={editing}
            setEditing={setEditing}
            onRewrite={rewrite}
            onEdit={editChapter}
          />
        )}
      </fieldset>

      <footer className="ana-foot">
        <dl className="ana-summary">
          <div>
            <dt>Formato</dt>
            <dd>{ANALYSIS_FORMATS.find((f) => f.id === analysis.brief.format)?.label}</dd>
          </div>
          <div>
            <dt>Fuentes</dt>
            <dd>
              {chosen.length} {chosen.length === 1 ? "informe" : "informes"}
            </dd>
          </div>
          <div>
            <dt>Longitud</dt>
            <dd>{length.label}</dd>
          </div>
          <div>
            <dt>{busy ? "Tiempo" : "Estimado"}</dt>
            <dd>{busy ? seconds(elapsed) : `${calls} llamadas · ~${Math.max(1, Math.round(estimate / 60))} min`}</dd>
          </div>
        </dl>
        <div className="ana-nav">
          {step > 0 && step < 4 && (
            <button type="button" className="button-secondary" onClick={() => setStep(step - 1)}>
              Atrás
            </button>
          )}
          {step < 3 && (
            <button type="button" className="button-primary" onClick={() => setStep(step + 1)}>
              Siguiente
            </button>
          )}
          {step >= 3 && !busy && (
            <button type="button" className="button-primary ana-go" disabled={!canEdit || !aiReady || !chosen.length} onClick={() => void writeAll()}>
              <Icon name="spark" size={16} /> {hasText ? "Volver a escribir todo" : "Escribir el análisis"}
            </button>
          )}
          {busy && (
            <button type="button" className="button-secondary" onClick={() => (stop.current = true)}>
              Detener después de este capítulo
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* --- Paso 4: indicaciones y plantillas ------------------------------------------------ */

const IDEAS = ["Compara 2024 con 2025", "Enfócate en las sedes regionales", "Explícalo para público general", "Señala qué metas del PDI están en riesgo"];

function Instructions({ brief, setBrief }: { brief: AnalysisBrief; setBrief: (next: Partial<AnalysisBrief>) => void }) {
  const prompts = useAnalysisPrompts();
  const save = useSaveAnalysisPrompt();
  const remove = useDeleteAnalysisPrompt();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <label className="admin-field admin-field--wide">
        <span>
          Sus indicaciones para Pilo <small>{brief.prompt.length} / 1.200</small>
        </span>
        <textarea
          rows={6}
          maxLength={1200}
          value={brief.prompt}
          placeholder="Ejemplo: analiza la relación entre la deserción por periodo y los resultados de Saber Pro, compara las sedes y cierra con tres recomendaciones para Bienestar."
          onChange={(e) => setBrief({ prompt: e.target.value })}
        />
      </label>
      <div className="ana-chips" aria-label="Ideas">
        {IDEAS.map((idea) => (
          <button key={idea} type="button" onClick={() => setBrief({ prompt: brief.prompt ? `${brief.prompt.trim()} ${idea}.` : `${idea}.` })}>
            <Icon name="plus" size={12} /> {idea}
          </button>
        ))}
      </div>
      <p className="ana-label">Indicaciones guardadas</p>
      <div className="ana-chips">
        {(prompts.data?.list ?? []).map((p) => (
          <span key={p.id} className="ana-saved">
            <button type="button" onClick={() => setBrief({ ...p.brief, prompt: p.body })} title={p.body}>
              {p.name}
            </button>
            <button type="button" className="ana-saved__x" aria-label={`Borrar «${p.name}»`} onClick={() => remove.mutate(p.id)}>
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        {!naming ? (
          <button type="button" disabled={!brief.prompt.trim()} onClick={() => setNaming(true)}>
            <Icon name="plus" size={12} /> Guardar estas indicaciones
          </button>
        ) : (
          <form
            className="ana-name"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const { prompt, ...rest } = brief;
              save.mutate({ name: name.trim().slice(0, 80), body: prompt, brief: rest }, { onSuccess: () => { setNaming(false); setName(""); } });
            }}
          >
            <input autoFocus value={name} maxLength={80} placeholder="Nombre, p. ej. Informe al Consejo Superior" onChange={(e) => setName(e.target.value)} aria-label="Nombre de las indicaciones" />
            <button type="submit" className="button-primary" disabled={!name.trim() || save.isPending}>
              Guardar
            </button>
            <button type="button" className="button-secondary" onClick={() => setNaming(false)}>
              Cancelar
            </button>
          </form>
        )}
      </div>
      {save.error && <p className="ana-error" role="alert">{save.error instanceof Error ? save.error.message : "No se pudo guardar."}</p>}
      {prompts.data && !prompts.data.ready && <p className="ana-muted">Para guardar indicaciones falta aplicar la migración 0099.</p>}
    </>
  );
}

/* --- Paso 5: escribir y revisar -------------------------------------------------------- */

function Writing({
  chosen,
  analysis,
  run,
  busy,
  editing,
  setEditing,
  onRewrite,
  onEdit,
}: {
  chosen: { slug: string; name: string; code: string; line: number }[];
  analysis: BulletinAnalysis;
  run: Record<string, RunState>;
  busy: boolean;
  editing: string | null;
  setEditing: (slug: string | null) => void;
  onRewrite: (slug: string) => void;
  onEdit: (slug: string, next: Partial<AnalysisChapter>) => void;
}) {
  const rows = [
    ...chosen.map((c) => ({ ...c, chapter: analysis.chapters[c.slug] ?? null })),
    { slug: CLOSING, name: "Conclusiones y recomendaciones", code: "∑", line: 0, chapter: analysis.closing },
  ];
  const review = rows.reduce((n, r) => n + (r.chapter?.unknown.length ?? 0), 0);
  const written = rows.filter((r) => r.chapter).length;
  return (
    <div className="ana-write">
      {written > 0 && !busy && (
        <p className="ana-verify" data-ok={review === 0 || undefined}>
          <Icon name={review ? "alert" : "check"} size={15} />
          {review === 0
            ? "Cada número del texto está en las cifras de UDES en Cifras."
            : `${review} ${review === 1 ? "número no aparece" : "números no aparecen"} en las cifras: revíselos antes de publicar.`}
          <span>Borrador · nada se publica hasta que usted lo apruebe.</span>
        </p>
      )}
      <ul className="ana-chapters" role="list">
        {rows.map((row) => {
          const status = run[row.slug];
          const state = status?.state ?? (row.chapter ? "listo" : "espera");
          const open = editing === row.slug;
          return (
            <li key={row.slug} data-state={state}>
              <div className="ana-chapter">
                <span className="ana-state" aria-hidden="true" />
                <span className="ana-code" style={{ "--code": row.line ? `var(--od-line-${row.line})` : "var(--brand-navy)" } as CSSProperties}>
                  {row.code}
                </span>
                <span className="ana-chapter__name">
                  <b>{row.name}</b>
                  <small>
                    {state === "escribe"
                      ? "Pilo está escribiendo…"
                      : state === "error"
                        ? status?.error
                        : row.chapter
                          ? `${row.chapter.paragraphs.length} ${row.chapter.paragraphs.length === 1 ? "párrafo" : "párrafos"}${row.chapter.alerts.length ? ` · ${row.chapter.alerts.length} ${row.chapter.alerts.length === 1 ? "alerta" : "alertas"}` : ""}${status?.cached ? " · de lo guardado" : ""}${status?.truncated ? " · el final quedó corto: vuelva a escribirlo o edítelo" : ""}`
                          : "En espera"}
                  </small>
                </span>
                <span className="ana-time">{status?.ms ? seconds(status.ms) : ""}</span>
                {row.chapter && !busy && (
                  <span className="ana-actions">
                    <button type="button" className="button-ghost" aria-expanded={open} onClick={() => setEditing(open ? null : row.slug)}>
                      {open ? "Cerrar" : "Editar texto"}
                    </button>
                    <button type="button" className="button-ghost" onClick={() => onRewrite(row.slug)}>
                      Volver a escribir
                    </button>
                  </span>
                )}
              </div>
              {row.chapter && row.chapter.unknown.length > 0 && (
                <p className="ana-unknown">
                  Para revisar: {row.chapter.unknown.map((n) => <code key={n}>{n.replace(".", ",")}</code>)}
                </p>
              )}
              {row.chapter && open && <ChapterEditor chapter={row.chapter} onChange={(next) => onEdit(row.slug, next)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChapterEditor({ chapter, onChange }: { chapter: AnalysisChapter; onChange: (next: Partial<AnalysisChapter>) => void }) {
  // Se edita como texto y se guarda en su forma: un párrafo por bloque, una alerta por línea.
  const [paragraphs, setParagraphs] = useState(chapter.paragraphs.join("\n\n"));
  const [alerts, setAlerts] = useState(chapter.alerts.join("\n"));
  const [recs, setRecs] = useState(chapter.recommendations.join("\n"));
  return (
    <div className="ana-editor">
      <label className="admin-field admin-field--wide">
        <span>Hallazgo principal</span>
        <input value={chapter.summary} maxLength={600} onChange={(e) => onChange({ summary: e.target.value })} />
      </label>
      <label className="admin-field admin-field--wide">
        <span>
          Párrafos <small>una línea en blanco entre párrafos</small>
        </span>
        <textarea
          rows={10}
          value={paragraphs}
          onChange={(e) => {
            setParagraphs(e.target.value);
            onChange({ paragraphs: blocks(e.target.value) });
          }}
        />
      </label>
      <div className="ana-row">
        <label className="admin-field">
          <span>
            Alertas <small>una por línea</small>
          </span>
          <textarea
            rows={4}
            value={alerts}
            onChange={(e) => {
              setAlerts(e.target.value);
              onChange({ alerts: lines(e.target.value) });
            }}
          />
        </label>
        <label className="admin-field">
          <span>
            Recomendaciones <small>una por línea</small>
          </span>
          <textarea
            rows={4}
            value={recs}
            onChange={(e) => {
              setRecs(e.target.value);
              onChange({ recommendations: lines(e.target.value) });
            }}
          />
        </label>
      </div>
    </div>
  );
}
