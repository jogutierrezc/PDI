/* =============================================================================
   Observatorio · 1 Captura de datos.

   Las tablas de datos de cada tema. Arriba, la lista; debajo, la tabla abierta
   con sus dos lecturas —datos brutos y vista gráfica— y su ficha (título,
   fuente, tipo de dato, estado).

   Importar es un recorrido en tres pasos, en la misma página:
     Archivo   Excel, CSV o una tabla pegada.
     Análisis  cada columna con su papel y el motivo; lo sensible se quita
               solo y sus valores nunca se enseñan. Se elige contar registros
               (microdatos) o guardar la tabla como viene.
     Resultado la tabla anonimizada, el acta y los visores recomendados.
   Nada sale del navegador hasta Guardar, y lo que sale ya va agregado.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { downloadText } from "../../../datos-abiertos/data/open-data";
import { parseClipboardGrid, parseCsv, toCsv } from "../../udes-en-cifras/sheet";
import { Panel, SaveState } from "../../udes-en-cifras/ui";
import type { ObsStationProps } from "../ObsAdmin";
import { ChartThumb, ObsChart, RawTable } from "../ObsCharts";
import { ROLE_LABEL, SENSITIVE, analyzeGrid, buildDataset, defaultPlan, recommend } from "../analyze";
import type { Analysis, ColumnProfile, Plan } from "../analyze";
import { CHARTS, DATA_TYPE_LABEL, RESERVE, RESERVED_TEXT, newId, plural, topicInfo } from "../model";
import type { ObsDataType, ObsDataset, ObsSection, ObsView } from "../model";
import { useObsCommit } from "../store";

export function CaptureStation({ state, topic, canEdit, go }: ObsStationProps) {
  const [params, setParams] = useSearchParams();
  const info = topicInfo(topic)!;
  const datasets = state.datasets.filter((d) => d.topic === topic).sort((a, b) => a.position - b.position);
  const selectedId = params.get("tabla");
  const selected = datasets.find((d) => d.id === selectedId) ?? (params.get("importar") ? undefined : datasets[0]);
  const importing = params.get("importar") === "1";

  const pick = (id: string | null, importar = false) => {
    const next = new URLSearchParams();
    if (id) next.set("tabla", id);
    if (importar) next.set("importar", "1");
    setParams(next, { replace: true });
  };

  return (
    <>
      <Panel
        id="obs-tablas"
        title={`Tablas de datos · ${info.name}`}
        description={<>Cada tabla es un conjunto agregado y anonimizado. Fuente sugerida para este tema: {info.source}.</>}
        actions={
          canEdit && (
            <button type="button" className="button-primary" onClick={() => pick(null, true)} aria-pressed={importing}>
              <Icon name="upload" size={15} /> Importar datos
            </button>
          )
        }
      >
        {datasets.length === 0 ? (
          <div className="obs-empty">
            <strong>Este tema aún no tiene tablas</strong>
            <p>Importa un Excel o CSV (también microdatos: el taller quita identificadores y cuenta por categoría antes de guardar) o pega una tabla copiada.</p>
          </div>
        ) : (
          <ul className="obs-tables" role="list">
            {datasets.map((d) => {
              const views = state.views.filter((v) => v.datasetId === d.id).length;
              return (
                <li key={d.id}>
                  <button type="button" className="obs-tables__item" aria-current={d.id === selected?.id && !importing ? "true" : undefined} onClick={() => pick(d.id)}>
                    <Icon name="table" size={16} />
                    <span className="obs-tables__title">
                      {d.title}
                      <small>
                        {d.source || "Sin fuente"} · {DATA_TYPE_LABEL[d.dataType]}
                      </small>
                    </span>
                    <span className="obs-tables__meta">
                      {plural(d.rows.length, "fila", "filas")} × {d.columns.length}
                    </span>
                    <span className="obs-tables__meta">{plural(views, "visor", "visores")}</span>
                    <span className="obs-tables__tags">
                      {d.sample && <span className="oda-badge">Ejemplo</span>}
                      {d.anonymization && (
                        <span className="oda-badge" data-tone="ok">
                          <Icon name="shield" size={11} /> Anonimizada
                        </span>
                      )}
                      <span className="oda-badge" data-tone={d.status === "publicado" ? "ok" : undefined}>
                        {d.status === "publicado" ? "Publicada" : "Borrador"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {importing && canEdit ? (
        <ImportFlow
          topic={topic}
          position={datasets.length}
          onCancel={() => pick(selected?.id ?? null)}
          onSaved={(id) => pick(id)}
        />
      ) : (
        selected && <DatasetDetail key={selected.id} dataset={selected} views={state.views.filter((v) => v.datasetId === selected.id)} canEdit={canEdit} go={go} />
      )}
    </>
  );
}

/* --- Tabla abierta -------------------------------------------------------------------------- */

function DatasetDetail({ dataset, views, canEdit, go }: { dataset: ObsDataset; views: ObsView[]; canEdit: boolean; go: ObsStationProps["go"] }) {
  const [mode, setMode] = useState<"tabla" | "grafica">("tabla");
  const recs = useMemo(() => recommend(dataset), [dataset]);
  const [recIndex, setRecIndex] = useState(0);
  const rec = recs[Math.min(recIndex, recs.length - 1)];
  const [draft, setDraft] = useState(() => ({ title: dataset.title, description: dataset.description, source: dataset.source, dataType: dataset.dataType, status: dataset.status }));
  const [confirming, setConfirming] = useState(false);
  const commit = useObsCommit();
  const dirty =
    draft.title !== dataset.title || draft.description !== dataset.description || draft.source !== dataset.source || draft.dataType !== dataset.dataType || draft.status !== dataset.status;
  const reserved = dataset.rows.reduce((n, r) => n + Object.values(r.cells).filter((c) => c === RESERVED_TEXT).length, 0);

  return (
    <Panel
      id="obs-tabla-abierta"
      title={dataset.title}
      description={
        <>
          {plural(dataset.rows.length, "fila", "filas")} · {plural(dataset.columns.length, "columna", "columnas")}
          {reserved > 0 && ` · ${plural(reserved, "casilla", "casillas")} en reserva (${RESERVED_TEXT})`}
          {dataset.sample && " · datos de ejemplo"}
        </>
      }
      actions={
        <div className="obs-toolbar">
          <div className="obs-segment" role="group" aria-label="Lectura de la tabla">
            <button type="button" aria-pressed={mode === "tabla"} onClick={() => setMode("tabla")}>
              <Icon name="table" size={14} /> Datos brutos
            </button>
            <button type="button" aria-pressed={mode === "grafica"} onClick={() => setMode("grafica")}>
              <Icon name="chart" size={14} /> Vista gráfica
            </button>
          </div>
          <button
            type="button"
            className="button-ghost"
            onClick={() =>
              downloadText(
                `observatorio-${dataset.title}.csv`,
                toCsv([dataset.columns.map((c) => c.label), ...dataset.rows.map((r) => dataset.columns.map((c) => (r.cells[c.key] ?? "") as string | number))]),
              )
            }
          >
            <Icon name="download" size={14} /> CSV
          </button>
          <button type="button" className="button-secondary" onClick={() => go("diseno", dataset.topic, `tabla=${dataset.id}`)}>
            <Icon name="spark-chart" size={14} /> Diseñar visor
          </button>
        </div>
      }
    >
      <div className="obs-detail">
        <div className="obs-detail__main">
          {mode === "tabla" ? (
            <RawTable dataset={dataset} />
          ) : rec ? (
            <div className="obs-quickview">
              <div className="obs-quickview__recs" role="group" aria-label="Visores recomendados">
                {recs.slice(0, 5).map((r, i) => (
                  <button key={r.type} type="button" aria-pressed={i === recIndex} onClick={() => setRecIndex(i)} title={r.why}>
                    <ChartThumb type={r.type} />
                    {CHARTS[r.type].label}
                  </button>
                ))}
              </div>
              <p className="obs-quickview__why">
                <Icon name="spark" size={14} /> {rec.why}
              </p>
              <ObsChart dataset={dataset} view={{ ...rec.encoding, title: dataset.title }} />
            </div>
          ) : (
            <p className="obs-empty">Sin cifras que dibujar: la tabla solo trae texto.</p>
          )}
        </div>

        <aside className="obs-detail__side" aria-label="Ficha de la tabla">
          <label className="obs-field">
            <span>Título</span>
            <input value={draft.title} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="obs-field">
            <span>Qué contiene</span>
            <textarea rows={3} value={draft.description} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <label className="obs-field">
            <span>Fuente</span>
            <input value={draft.source} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="Oficina o sistema de origen" />
          </label>
          <label className="obs-field">
            <span>Tipo de dato</span>
            <select value={draft.dataType} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, dataType: e.target.value as ObsDataType })}>
              {(Object.keys(DATA_TYPE_LABEL) as ObsDataType[]).map((k) => (
                <option key={k} value={k}>
                  {DATA_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="obs-field">
            <span>Estado</span>
            <select value={draft.status} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, status: e.target.value as ObsDataset["status"] })}>
              <option value="borrador">Borrador · solo en la intranet</option>
              <option value="publicado">Publicada · visible en el portal</option>
            </select>
          </label>
          {canEdit && (
            <div className="obs-detail__actions">
              <button type="button" className="button-primary" disabled={!dirty || !draft.title.trim() || commit.isPending} onClick={() => commit.mutate({ kind: "dataset", value: { ...dataset, ...draft, title: draft.title.trim() } })}>
                Guardar ficha
              </button>
              <SaveState pending={commit.isPending} error={commit.error} success={commit.isSuccess} />
            </div>
          )}

          {dataset.anonymization && <Acta act={dataset.anonymization} />}

          {canEdit &&
            (confirming ? (
              <span className="oda-confirm" role="group" aria-label="Confirmar el borrado">
                <span>
                  Se borra la tabla{views.length ? ` y ${plural(views.length, "visor", "visores")}` : ""}.
                </span>
                <button type="button" className="oda-link-button" data-tone="danger" onClick={() => commit.mutate({ kind: "dataset-delete", id: dataset.id })}>
                  Sí, borrar
                </button>
                <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setConfirming(true)}>
                Borrar la tabla
              </button>
            ))}
        </aside>
      </div>
    </Panel>
  );
}

export function Acta({ act }: { act: NonNullable<ObsDataset["anonymization"]> }) {
  return (
    <section className="obs-acta" aria-label="Acta de anonimización">
      <strong>
        <Icon name="shield" size={14} /> Acta de anonimización
      </strong>
      <dl>
        <div>
          <dt>Archivo</dt>
          <dd>{act.fileName}</dd>
        </div>
        <div>
          <dt>Entraron</dt>
          <dd>
            {plural(act.sourceRows, "fila", "filas")} × {act.sourceColumns}
          </dd>
        </div>
        {act.groupedBy.length > 0 && (
          <div>
            <dt>Contado por</dt>
            <dd>{act.groupedBy.join(", ")}</dd>
          </div>
        )}
        <div>
          <dt>Reserva</dt>
          <dd>
            {act.threshold === 0
              ? "sin reserva"
              : act.reservedCells
                ? `${plural(act.reservedCells, "casilla", "casillas")} con menos de ${act.threshold}`
                : `ninguna casilla con menos de ${act.threshold}`}
          </dd>
        </div>
        {act.sensitive && act.sensitive.length > 0 && (
          <div>
            <dt>Conserva</dt>
            <dd>{act.sensitive.join(", ")} — marcadas como dato personal. Solo para tableros internos.</dd>
          </div>
        )}
      </dl>
      {act.removed.length > 0 && (
        <ul>
          {act.removed.map((r) => (
            <li key={r.column}>
              <s>{r.column}</s> <small>{r.reason}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --- Importar ------------------------------------------------------------------------------ */

type Step = "archivo" | "analisis" | "resultado";

function ImportFlow({ topic, position, onCancel, onSaved }: { topic: string; position: number; onCancel: () => void; onSaved: (id: string) => void }) {
  const info = topicInfo(topic)!;
  const [step, setStep] = useState<Step>("archivo");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [book, setBook] = useState<{ name: string; sheets: { sheet: string; data: string[][] }[] } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState({ title: "", description: "", source: info.source, dataType: "conteo" as ObsDataType, withView: true });
  const commit = useObsCommit();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), [step]);

  const adopt = (name: string, grid: string[][]) => {
    const result = analyzeGrid(name, grid);
    if (!result) {
      setError(`«${name}» no trae filas de datos bajo una fila de títulos.`);
      return;
    }
    setError("");
    setAnalysis(result);
    setPlan(defaultPlan(result));
    setMeta((m) => ({ ...m, title: m.title || name.replace(/\.(xlsx|csv)$/i, "").replace(/[_-]+/g, " ") }));
    setStep("analisis");
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        adopt(file.name, parseCsv(await file.text()));
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const raw = (await readXlsxFile(file)) as unknown as { sheet: string; data: unknown[][] }[];
        const sheets = raw
          .map((s) => ({ sheet: s.sheet, data: s.data.map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "")))) }))
          .filter((s) => s.data.length > 1);
        if (sheets.length > 1) setBook({ name: file.name, sheets });
        else if (sheets.length === 1) adopt(file.name, sheets[0].data);
        else setError(`«${file.name}» no tiene hojas con datos.`);
      }
    } catch (e) {
      setError(`No se pudo leer «${file.name}»: ${e instanceof Error ? e.message : "no parece un .xlsx o .csv válido"}.`);
    } finally {
      setReading(false);
    }
  };

  const result = useMemo(() => (analysis && plan ? buildDataset(analysis, plan) : null), [analysis, plan]);
  const draft: ObsDataset | null = useMemo(
    () =>
      result
        ? {
            id: "borrador",
            topic,
            title: meta.title || "Tabla importada",
            description: meta.description,
            source: meta.source,
            dataType: meta.dataType,
            temporality: result.temporality,
            periodLabel: "",
            columns: result.columns,
            rows: result.rows,
            anonymization: result.anonymization,
            sample: false,
            status: "borrador",
            position,
            updatedAt: new Date().toISOString(),
          }
        : null,
    [result, meta, topic, position],
  );
  const recs = useMemo(() => (draft ? recommend(draft) : []), [draft]);

  // El tipo de dato se sugiere por la forma del resultado, mientras nadie lo toque.
  const [typeTouched, setTypeTouched] = useState(false);
  useEffect(() => {
    if (typeTouched || !draft || !recs.length) return;
    const lead = recs[0].type;
    const guess: ObsDataType = lead === "mapa" || lead === "mapa_municipal" ? "georreferenciado" : lead === "lineas" ? "serie" : lead === "bosque" ? "modelo" : lead === "histograma" ? "distribucion" : draft.columns.some((c) => c.format === "porcentaje") ? "tasa" : "conteo";
    if (guess !== meta.dataType) setMeta((m) => ({ ...m, dataType: guess }));
  }, [recs, draft, typeTouched, meta.dataType]);

  const save = () => {
    if (!draft || !result) return;
    const id = newId();
    const dataset: ObsDataset = { ...draft, id, title: meta.title.trim() || "Tabla importada" };
    commit.mutate(
      { kind: "dataset", value: dataset },
      {
        onSuccess: () => {
          const top = recs.find((r) => r.type !== "tabla");
          if (meta.withView && top) {
            const section: ObsSection =
              top.type === "lineas" || top.type === "area" ? "tendencia" : top.type.startsWith("mapa") && top.type !== "mapa_calor" ? "territorio" : top.type === "cifras" ? "panorama" : ["dona", "circular", "mosaico", "barras_100"].includes(top.type) ? "composicion" : "detalle";
            commit.mutate({
              kind: "view",
              value: { ...top.encoding, id: newId(), datasetId: id, topic, key: "v1", title: dataset.title, section, size: "media", visible: true, position: 99 },
            });
          }
          onSaved(id);
        },
      },
    );
  };

  const steps: { id: Step; label: string }[] = [
    { id: "archivo", label: "Archivo" },
    { id: "analisis", label: "Análisis" },
    { id: "resultado", label: "Resultado" },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <section className="oda-panel obs-import" aria-labelledby="obs-importar-titulo">
      <header className="oda-panel__head">
        <div>
          <h2 id="obs-importar-titulo" ref={heading} tabIndex={-1}>
            Importar datos · {info.name}
          </h2>
          <p>El archivo se lee y se anonimiza en este navegador. A la base solo llega la tabla agregada.</p>
        </div>
        <button type="button" className="oda-link-button" onClick={onCancel}>
          Cancelar
        </button>
      </header>

      <ol className="obs-steps" aria-label="Pasos de la importación">
        {steps.map((s, i) => (
          <li key={s.id} aria-current={s.id === step ? "step" : undefined} data-done={i < stepIndex || undefined}>
            <span aria-hidden="true">{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="oda-panel__body">
        {error && (
          <p className="oda-import__error" role="alert">
            {error}
          </p>
        )}

        {step === "archivo" && (
          <div className="obs-drop-wrap">
            {book ? (
              <div className="obs-sheets">
                <strong>«{book.name}» tiene {book.sheets.length} hojas con datos. ¿Cuál se importa?</strong>
                <div>
                  {book.sheets.map((s) => (
                    <button
                      key={s.sheet}
                      type="button"
                      className="oda-chip"
                      onClick={() => {
                        adopt(`${book.name} · ${s.sheet}`, s.data);
                        setBook(null);
                      }}
                    >
                      {s.sheet} <small>{plural(s.data.length - 1, "fila", "filas")}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="obs-drop"
                data-dragging={dragging || undefined}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void load(e.dataTransfer.files[0]);
                }}
              >
                <Icon name="upload" size={26} />
                <strong>{reading ? "Leyendo el archivo…" : "Suelta aquí un Excel o CSV"}</strong>
                <span>Microdatos o tabla agregada. Las columnas con documentos, nombres, correos o teléfonos se detectan y se quitan.</span>
                <div className="obs-drop__actions">
                  <button type="button" className="button-secondary" disabled={reading} onClick={() => fileInput.current?.click()}>
                    <Icon name="document" size={15} /> Elegir archivo
                  </button>
                  <button type="button" className="button-ghost" onClick={() => setPasting((p) => !p)} aria-expanded={pasting}>
                    Pegar una tabla
                  </button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    void load(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            {pasting && (
              <div className="obs-paste">
                <label className="obs-field">
                  <span>Tabla copiada de Excel (con la fila de títulos)</span>
                  <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Programa\tAño\tMatriculados\nDerecho\t2024\t812"} />
                </label>
                <button type="button" className="button-secondary" disabled={!pasted.trim()} onClick={() => adopt("tabla pegada", pasted.includes("\t") ? parseClipboardGrid(pasted) : parseCsv(pasted))}>
                  Analizar la tabla
                </button>
              </div>
            )}
          </div>
        )}

        {step === "analisis" && analysis && plan && (
          <AnalysisStep analysis={analysis} plan={plan} onPlan={setPlan} onBack={() => setStep("archivo")} onNext={() => setStep("resultado")} canContinue={Boolean(result?.rows.length)} />
        )}

        {step === "resultado" && draft && result && (
          <div className="obs-result">
            <div className="obs-result__main">
              <div className="obs-result__facts">
                <span>
                  <b>{plural(result.anonymization.sourceRows, "fila", "filas")}</b> entraron
                </span>
                <Icon name="arrow-right" size={14} />
                <span>
                  <b>{plural(result.rows.length, "fila", "filas")}</b> se guardan
                </span>
                <span>
                  <b>{result.anonymization.removed.length}</b> columnas fuera
                </span>
                <span>
                  <b>{result.anonymization.reservedCells}</b> casillas en reserva
                </span>
              </div>
              <RawTable dataset={draft} limit={40} />
              {recs.length > 0 && (
                <div className="obs-result__recs">
                  <strong>Con estos datos, los visores que mejor se leen</strong>
                  <ul>
                    {recs.slice(0, 4).map((r, i) => (
                      <li key={r.type} data-lead={i === 0 || undefined}>
                        <ChartThumb type={r.type} />
                        <span>
                          <b>{CHARTS[r.type].label}</b>
                          <small>{r.why}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <aside className="obs-result__side">
              <label className="obs-field">
                <span>Título de la tabla</span>
                <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              </label>
              <label className="obs-field">
                <span>Qué contiene</span>
                <textarea rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Matriculados por programa y año, todos los campus." />
              </label>
              <label className="obs-field">
                <span>Fuente</span>
                <input value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
              </label>
              <label className="obs-field">
                <span>Tipo de dato</span>
                <select
                  value={meta.dataType}
                  onChange={(e) => {
                    setTypeTouched(true);
                    setMeta({ ...meta, dataType: e.target.value as ObsDataType });
                  }}
                >
                  {(Object.keys(DATA_TYPE_LABEL) as ObsDataType[]).map((k) => (
                    <option key={k} value={k}>
                      {DATA_TYPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {recs.some((r) => r.type !== "tabla") && (
                <label className="oda-check">
                  <input type="checkbox" checked={meta.withView} onChange={(e) => setMeta({ ...meta, withView: e.target.checked })} />
                  <span>
                    Crear también el visor recomendado
                    <small>{CHARTS[recs.find((r) => r.type !== "tabla")!.type].label}, en borrador. Se ajusta en Diseño visual.</small>
                  </span>
                </label>
              )}
              <Acta act={result.anonymization} />
              <div className="obs-detail__actions">
                <button type="button" className="button-ghost" onClick={() => setStep("analisis")}>
                  Volver al análisis
                </button>
                <button type="button" className="button-primary" disabled={!result.rows.length || commit.isPending} onClick={save}>
                  <Icon name="shield" size={15} /> Guardar tabla anonimizada
                </button>
              </div>
              <SaveState pending={commit.isPending} error={commit.error} success={false} />
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

/* --- Paso de análisis ---------------------------------------------------------------------- */

const ROLE_TONE: Record<string, string> = {
  identificador: "risk",
  personal: "risk",
  texto_libre: "risk",
  tiempo: "time",
  territorio: "place",
  categoria: "cat",
  cifra: "num",
  vacia: "muted",
};

export function AnalysisStep({
  analysis,
  plan,
  onPlan,
  onBack,
  onNext,
  canContinue,
  internal = false,
}: {
  analysis: Analysis;
  plan: Plan;
  onPlan: (plan: Plan) => void;
  onBack: () => void;
  onNext: () => void;
  canContinue: boolean;
  /** Mis Tableros: el tablero es de una unidad y su escalera de visibilidad decide quién lo ve; aquí lo sensible se puede conservar a mano y la reserva se afina. */
  internal?: boolean;
}) {
  const sensitive = analysis.profiles.filter((p) => SENSITIVE.includes(p.role));
  const sensitiveKeys = new Set(sensitive.map((p) => p.key));
  const aggregate = plan.mode === "agregar";
  const threshold = plan.threshold ?? RESERVE;
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  // Marca el plan como «con sensibles» cuando alguna columna marcada entra a
  // la tabla; sin eso, buildDataset las volvería a quitar.
  const patch = (next: Plan) =>
    onPlan({ ...next, allowSensitive: next.keep.some((k) => sensitiveKeys.has(k)) || next.groupBy.some((k) => sensitiveKeys.has(k)) ? true : next.allowSensitive });

  const setMode = (mode: Plan["mode"]) => {
    if (mode === plan.mode) return;
    const base = defaultPlan({ ...analysis, shape: mode === "agregar" ? "microdatos" : "agregada" });
    patch({ ...base, mode, threshold: plan.threshold, allowSensitive: plan.allowSensitive });
  };

  const control = (p: ColumnProfile) => {
    if (SENSITIVE.includes(p.role) && !internal)
      return (
        <span className="obs-profile__out">
          <Icon name="shield" size={13} /> Se quita
        </span>
      );
    if (p.role === "vacia") return <span className="obs-profile__muted">Se ignora</span>;
    if (aggregate) {
      if (p.role === "cifra")
        return (
          <select
            aria-label={`Cómo resumir «${p.header}»`}
            value={plan.measures[p.key] ?? ""}
            onChange={(e) => {
              const measures = { ...plan.measures };
              if (e.target.value) measures[p.key] = e.target.value as "suma" | "promedio";
              else delete measures[p.key];
              patch({ ...plan, measures, keep: e.target.value ? [...new Set([...plan.keep, p.key])] : plan.keep.filter((k) => k !== p.key || plan.groupBy.includes(k)) });
            }}
          >
            <option value="">No usar</option>
            <option value="suma">Sumar</option>
            <option value="promedio">Promediar</option>
          </select>
        );
      const on = plan.groupBy.includes(p.key);
      return (
        <label className="obs-toggle">
          <input type="checkbox" checked={on} onChange={() => patch({ ...plan, groupBy: toggle(plan.groupBy, p.key), keep: toggle(plan.keep, p.key) })} />
          Contar por
        </label>
      );
    }
    const kept = plan.keep.includes(p.key);
    return (
      <span className="obs-profile__controls">
        <label className="obs-toggle">
          <input type="checkbox" checked={kept} onChange={() => patch({ ...plan, keep: toggle(plan.keep, p.key) })} />
          Conservar
        </label>
        {p.role === "cifra" && p.format === "entero" && kept && (
          <label className="obs-toggle" title={threshold > 0 ? `Los valores entre 1 y ${threshold - 1} se guardan como ${RESERVED_TEXT}` : "La reserva está apagada: los valores se guardan como vienen"}>
            <input type="checkbox" checked={plan.reserveColumns.includes(p.key)} onChange={() => patch({ ...plan, reserveColumns: toggle(plan.reserveColumns, p.key) })} />
            Reserva {RESERVED_TEXT}
          </label>
        )}
      </span>
    );
  };

  return (
    <div className="obs-analysis">
      <div className="obs-analysis__head">
        <p>
          <b>{analysis.fileName}</b>: {plural(analysis.body.length, "fila", "filas")} × {plural(analysis.header.length, "columna", "columnas")}. {analysis.shapeReason}
        </p>
        <div className="obs-segment" role="group" aria-label="Cómo se guarda">
          <button type="button" aria-pressed={aggregate} onClick={() => setMode("agregar")}>
            Contar registros
          </button>
          <button type="button" aria-pressed={!aggregate} onClick={() => setMode("tal_cual")}>
            Guardar como viene
          </button>
        </div>
        {internal && (
          <label className="obs-select obs-select--inline">
            <span>Reserva</span>
            <select value={plan.threshold ?? RESERVE} onChange={(e) => patch({ ...plan, threshold: Number(e.target.value) })}>
              <option value={5}>Menos de 5, como «&lt; 5»</option>
              <option value={3}>Menos de 3, como «&lt; 3»</option>
              <option value={0}>Sin reserva</option>
            </select>
          </label>
        )}
      </div>
      {sensitive.length > 0 &&
        (internal ? (
          <p className="obs-guard" role="note">
            <Icon name="shield" size={16} />
            El perfil marcó {plural(sensitive.length, "columna como dato personal", "columnas como dato personal")}: {sensitive.map((p) => `«${p.header}»`).join(", ")}. En un tablero de unidad se pueden conservar —se dice en el acta—; para publicarlo en el portal habrá que subirla sin ellas.
          </p>
        ) : (
          <p className="obs-guard" role="note">
            <Icon name="shield" size={16} />
            {plural(sensitive.length, "columna sensible se quita", "columnas sensibles se quitan")} antes de guardar: {sensitive.map((p) => `«${p.header}»`).join(", ")}. Sus valores no se muestran aquí.
            {!aggregate && " Aun sin ellas, una fila por persona puede identificar a alguien: conviene contar registros."}
          </p>
        ))}

      <div className="obs-profile" role="region" aria-label="Perfil de las columnas" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Columna</th>
              <th scope="col">Papel</th>
              <th scope="col">Por qué</th>
              <th scope="col">Ejemplos</th>
              <th scope="col" data-numeric>
                Distintos
              </th>
              <th scope="col">{aggregate ? "En el conteo" : "En la tabla"}</th>
            </tr>
          </thead>
          <tbody>
            {analysis.profiles.map((p) => {
              const hidden = SENSITIVE.includes(p.role);
              return (
                <tr key={p.key} data-sensitive={hidden || undefined}>
                  <th scope="row">{p.header}</th>
                  <td>
                    <span className="obs-role" data-tone={ROLE_TONE[p.role]}>
                      {ROLE_LABEL[p.role]}
                      {p.territory ? ` · ${p.territory}` : p.time ? ` · ${p.time === "anio" ? "año" : p.time}` : ""}
                    </span>
                  </td>
                  <td className="obs-profile__why">{p.reason}</td>
                  <td className="obs-profile__sample">{hidden ? <span className="obs-masked">oculto</span> : p.sample.slice(0, 3).join(" · ")}</td>
                  <td data-numeric>{p.distinct.toLocaleString("es-CO")}</td>
                  <td>{control(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aggregate && (
        <p className="obs-analysis__note">
          Cada fila del resultado es una combinación de {plan.groupBy.length ? plan.groupBy.map((k) => `«${analysis.profiles.find((p) => p.key === k)?.header}»`).join(" × ") : "—"} con su número de registros.{" "}
          {threshold > 0 ? (
            <>
              Las combinaciones con menos de {threshold} registros se publican como {RESERVED_TEXT}
              {Object.keys(plan.measures).length ? ", y también sus promedios o sumas" : ""}.
            </>
          ) : (
            <>La reserva está apagada: toda combinación sale con su cuenta.</>
          )}
        </p>
      )}

      <div className="obs-detail__actions">
        <button type="button" className="button-ghost" onClick={onBack}>
          Otro archivo
        </button>
        <button type="button" className="button-primary" disabled={!canContinue || (aggregate && plan.groupBy.length === 0)} onClick={onNext}>
          Ver el resultado <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  );
}
