/* =============================================================================
   Observatorio · 2 Diseño visual.

   El estudio, a la manera de Tableau o Power BI, con el vocabulario del
   portal:

   · Datos (izquierda): el tema, la tabla y sus campos por papel —tiempo,
     categorías, territorio y cifras—. Un campo se lleva a un estante
     arrastrándolo o con un clic.
   · Lienzo (centro): los estantes (Categoría, Columnas, Cifras) y el visor
     dibujado con los datos reales; conmuta a la tabla de datos brutos. Abajo,
     cómo se clasifica el visor en la página del tema y su ancho.
   · Mostrarme (derecha): los veintidós tipos —los quince de los conjuntos
     libres y los siete de los informes— con su minivista. Los que la tabla
     no puede dibujar se apagan con el motivo; los recomendados van primero,
     con el porqué.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../../../../components/ui/Icon";
import { SaveState } from "../../udes-en-cifras/ui";
import { TopicSelect } from "../ObsAdmin";
import type { ObsStationProps } from "../ObsAdmin";
import { ChartThumb, ObsChart, RawTable } from "../ObsCharts";
import { fieldsOf, fitEncoding, recommend } from "../analyze";
import { CHARTS, FAMILIES, SECTIONS, SECTION_HINT, SECTION_LABEL, newId, obsViewProblems, plural, topicInfo } from "../model";
import type { ObsChartType, ObsColumn, ObsDataset, ObsSection, ObsView } from "../model";
import { useObsCommit } from "../store";

type Draft = Omit<ObsView, "id" | "datasetId" | "topic" | "position" | "key">;

const EMPTY: Draft = { type: "barras", title: "", section: "detalle", size: "media", visible: true };

function sectionFor(type: ObsChartType): ObsSection {
  if (type === "lineas" || type === "area" || type === "gantt") return "tendencia";
  if (type === "mapa" || type === "mapa_municipal") return "territorio";
  if (type === "cifras") return "panorama";
  if (["dona", "circular", "mosaico", "barras_100", "cascada"].includes(type)) return "composicion";
  return "detalle";
}

function draftFrom(dataset: ObsDataset, view: ObsView | undefined): Draft {
  if (view) {
    const { id: _id, datasetId: _d, topic: _t, position: _p, key: _k, ...rest } = view;
    return rest;
  }
  const top = recommend(dataset).find((r) => r.type !== "tabla");
  if (!top) return { ...EMPTY, type: "tabla", title: dataset.title };
  return { ...EMPTY, ...top.encoding, title: dataset.title, section: sectionFor(top.type), size: top.type === "tabla" || top.type === "mapa_calor" ? "completa" : "media" };
}

export function DesignStation({ state, topic, canEdit, go }: ObsStationProps) {
  const [params, setParams] = useSearchParams();
  const info = topicInfo(topic)!;
  const datasets = state.datasets.filter((d) => d.topic === topic).sort((a, b) => a.position - b.position);
  const topicViews = state.views.filter((v) => v.topic === topic).sort((a, b) => a.position - b.position);
  const editing = topicViews.find((v) => v.id === params.get("visor"));
  const dataset = datasets.find((d) => d.id === (editing?.datasetId ?? params.get("tabla"))) ?? datasets[0];
  const [draft, setDraft] = useState<Draft>(() => (dataset ? draftFrom(dataset, editing) : EMPTY));
  const [mode, setMode] = useState<"grafica" | "tabla">("grafica");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const commit = useObsCommit();

  // Otra tabla u otro visor: el lienzo arranca de lo guardado o de la recomendación.
  useEffect(() => {
    if (dataset) setDraft(draftFrom(dataset, editing));
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, editing?.id]);

  const recs = useMemo(() => (dataset ? recommend(dataset) : []), [dataset]);
  const fields = useMemo(() => (dataset ? fieldsOf(dataset) : null), [dataset]);

  const setQuery = (entries: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(entries)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  if (!dataset || !fields) {
    return (
      <div className="obs-studio-empty">
        <TopicSelect value={topic} onChange={(slug) => go("diseno", slug)} />
        <div className="obs-empty">
          <strong>{info.name} no tiene tablas de datos todavía</strong>
          <p>Los visores se arman sobre una tabla. Impórtala primero en Captura de datos.</p>
          <button type="button" className="button-primary" onClick={() => go("captura", topic, "importar=1")}>
            <Icon name="upload" size={15} /> Importar datos
          </button>
        </div>
      </div>
    );
  }

  const spec = CHARTS[draft.type];
  const problems = obsViewProblems(dataset, draft);
  const column = (key: string | undefined) => dataset.columns.find((c) => c.key === key);

  const pickType = (type: ObsChartType) => {
    const enc = fitEncoding(dataset, type, draft);
    setDraft((d) => ({ ...d, ...enc, section: d.section === sectionFor(d.type) ? sectionFor(type) : d.section, size: type === "tabla" || type === "mapa_calor" ? "completa" : d.size }));
  };

  const place = (key: string, shelf: "category" | "category2" | "series") => {
    const c = column(key);
    if (!c) return;
    setDraft((d) => {
      if (shelf === "series") {
        if (c.kind !== "cifra") return d;
        const current = d.series ?? [];
        if (current.includes(key)) return d;
        const one = spec.series === "una";
        return { ...d, series: one ? [key] : spec.series === "tres" ? [...current, key].slice(-3) : [...current, key] };
      }
      if (c.kind === "cifra") return d;
      return { ...d, [shelf]: key };
    });
  };

  const clickField = (c: ObsColumn) => {
    if (c.kind === "cifra") {
      if ((draft.series ?? []).includes(c.key)) setDraft((d) => ({ ...d, series: (d.series ?? []).filter((k) => k !== c.key) }));
      else place(c.key, "series");
      return;
    }
    if (spec.category2 && draft.category && draft.category !== c.key) place(c.key, "category2");
    else place(c.key, "category");
  };

  const onDrop = (shelf: "category" | "category2" | "series") => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const key = e.dataTransfer.getData("text/obs-field");
    if (key) place(key, shelf);
  };
  const dragOver = (shelf: string) => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(shelf);
  };

  const save = (asNew: boolean) => {
    const id = asNew || !editing ? newId() : editing.id;
    const position = editing && !asNew ? editing.position : Math.max(-1, ...topicViews.map((v) => v.position)) + 1;
    const value: ObsView = { ...draft, title: draft.title.trim() || dataset.title, id, key: editing?.key ?? "v1", datasetId: dataset.id, topic, position };
    commit.mutate({ kind: "view", value }, { onSuccess: () => setQuery({ visor: id, tabla: dataset.id }) });
  };

  const fieldGroup = (label: string, list: ObsColumn[]) =>
    list.length ? (
      <div className="obs-fields__group">
        <span className="obs-fields__label">{label}</span>
        <ul>
          {list.map((c) => {
            const used = draft.category === c.key || draft.category2 === c.key || (draft.series ?? []).includes(c.key);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  className="obs-field-pill"
                  data-kind={c.kind === "cifra" ? "cifra" : "dimension"}
                  aria-pressed={used}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/obs-field", c.key);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => clickField(c)}
                  title={c.kind === "cifra" ? "Clic: añadir o quitar de Cifras. También se arrastra." : "Clic: usar como categoría. También se arrastra."}
                >
                  <span className="obs-field-pill__kind" aria-hidden="true">
                    {c.kind === "cifra" ? "123" : c.kind === "territorio" ? "Geo" : "Abc"}
                  </span>
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const shelf = (id: "category" | "category2" | "series", label: string, value: string[], multiple = false) => (
    <div key={id} className="obs-shelf" data-over={dropTarget === id || undefined} onDragOver={dragOver(id)} onDragLeave={() => setDropTarget(null)} onDrop={onDrop(id)}>
      <span className="obs-shelf__label">{label}</span>
      <div className="obs-shelf__slot">
        {value.length ? (
          value.map((key) => (
            <span key={key} className="obs-shelf__chip" data-kind={id === "series" ? "cifra" : "dimension"}>
              {column(key)?.label ?? key}
              <button
                type="button"
                aria-label={`Quitar ${column(key)?.label ?? key}`}
                onClick={() => setDraft((d) => (id === "series" ? { ...d, series: (d.series ?? []).filter((k) => k !== key) } : { ...d, [id]: undefined }))}
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))
        ) : (
          <span className="obs-shelf__hint">{multiple ? "Arrastra cifras aquí" : "Arrastra un campo aquí"}</span>
        )}
      </div>
    </div>
  );

  const typesByFamily = FAMILIES.map((family) => ({
    family,
    types: (Object.keys(CHARTS) as ObsChartType[]).filter((t) => CHARTS[t].family === family),
  }));

  return (
    <div className="obs-studio">
      {/* --- Datos --- */}
      <aside className="obs-studio__data" aria-label="Datos">
        <TopicSelect value={topic} onChange={(slug) => go("diseno", slug)} />
        <label className="obs-select">
          <span>Tabla</span>
          <select value={dataset.id} onChange={(e) => setQuery({ tabla: e.target.value, visor: null })}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <p className="obs-studio__meta">
          {plural(dataset.rows.length, "fila", "filas")} · {dataset.source || "sin fuente"}
          {dataset.sample && " · ejemplo"}
        </p>
        <div className="obs-fields">
          {fieldGroup("Tiempo", fields.time)}
          {fieldGroup("Categorías", fields.dims)}
          {fieldGroup("Territorio", fields.places)}
          {fieldGroup("Fechas", fields.dates)}
          {fieldGroup("Cifras", fields.nums)}
        </div>
        <button type="button" className="oda-link-button" onClick={() => go("captura", topic, `tabla=${dataset.id}`)}>
          Ver la tabla en Captura
        </button>
      </aside>

      {/* --- Lienzo --- */}
      <div className="obs-studio__center">
        <div className="obs-shelves">
          {spec.category !== "ninguna" && (
            shelf("category", spec.category === "territorio" || spec.category === "municipio" ? "Territorio" : spec.category2 ? "Filas" : "Categoría", draft.category ? [draft.category] : [])
          )}
          {spec.category2 && shelf("category2", "Columnas", draft.category2 ? [draft.category2] : [])}
          {spec.series !== "ninguna" && shelf("series", spec.series === "tres" ? "Estimación · inferior · superior" : "Cifras", draft.series ?? [], spec.series !== "una")}
          <div className="obs-shelf-options">
            {["barras", "barras_apiladas", "barras_100"].includes(draft.type) && (
              <div className="obs-segment obs-segment--small" role="group" aria-label="Orientación">
                <button type="button" aria-pressed={draft.orientation !== "horizontal"} onClick={() => setDraft((d) => ({ ...d, orientation: "vertical" }))}>
                  Vertical
                </button>
                <button type="button" aria-pressed={draft.orientation === "horizontal"} onClick={() => setDraft((d) => ({ ...d, orientation: "horizontal" }))}>
                  Horizontal
                </button>
              </div>
            )}
            {["barras", "barras_apiladas", "barras_100", "circular", "dona"].includes(draft.type) && (
              <label className="obs-select obs-select--inline">
                <span>Orden</span>
                <select value={draft.sort ?? "fuente"} onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value as Draft["sort"] }))}>
                  <option value="fuente">Como en la tabla</option>
                  <option value="desc">De mayor a menor</option>
                  <option value="asc">De menor a mayor</option>
                </select>
              </label>
            )}
            {draft.type === "ranking" && (
              <label className="obs-select obs-select--inline">
                <span>Muestra</span>
                <select value={draft.limit ?? 15} onChange={(e) => setDraft((d) => ({ ...d, limit: Number(e.target.value) }))}>
                  {[5, 10, 15, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} primeros
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.type === "bosque" && (
              <label className="obs-select obs-select--inline">
                <span>Referencia</span>
                <select value={draft.reference ?? 1} onChange={(e) => setDraft((d) => ({ ...d, reference: Number(e.target.value) }))}>
                  <option value={1}>1 · razones (escala log)</option>
                  <option value={0}>0 · coeficientes</option>
                </select>
              </label>
            )}
          </div>
        </div>

        <section className="obs-canvas-card" aria-label="Lienzo del visor">
          <header className="obs-canvas-card__head">
            <div className="obs-canvas-card__titles">
              <label className="sr-only" htmlFor="obs-visor-titulo">
                Título del visor
              </label>
              <input id="obs-visor-titulo" className="obs-canvas-card__title" value={draft.title} placeholder="Título del visor" disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <label className="sr-only" htmlFor="obs-visor-descripcion">
                Qué muestra
              </label>
              <input
                id="obs-visor-descripcion"
                className="obs-canvas-card__desc"
                value={draft.description ?? ""}
                placeholder="Qué muestra, en una línea (opcional)"
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="obs-segment" role="group" aria-label="Vista">
              <button type="button" aria-pressed={mode === "grafica"} onClick={() => setMode("grafica")}>
                <Icon name="chart" size={14} /> Gráfica
              </button>
              <button type="button" aria-pressed={mode === "tabla"} onClick={() => setMode("tabla")}>
                <Icon name="table" size={14} /> Tabla
              </button>
            </div>
          </header>
          <div className="obs-canvas-card__body" data-size={draft.size}>
            {mode === "tabla" ? <RawTable dataset={dataset} /> : <ObsChart dataset={dataset} view={draft} />}
          </div>
          <footer className="obs-canvas-card__foot">
            <span className="obs-canvas-card__type">
              <ChartThumb type={draft.type} />
              <span>
                <b>{spec.label}</b>
                <small>{spec.hint}</small>
              </span>
            </span>
          </footer>
        </section>

        <div className="obs-classify" role="group" aria-label="Clasificación en la página del tema">
          <label className="obs-select">
            <span>Sección de la página</span>
            <select value={draft.section} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value as ObsSection }))}>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABEL[s]} · {SECTION_HINT[s].toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <div className="obs-segment" role="group" aria-label="Ancho en el tablero">
            <button type="button" disabled={!canEdit} aria-pressed={draft.size === "media"} onClick={() => setDraft((d) => ({ ...d, size: "media" }))}>
              Media columna
            </button>
            <button type="button" disabled={!canEdit} aria-pressed={draft.size === "completa"} onClick={() => setDraft((d) => ({ ...d, size: "completa" }))}>
              Ancho completo
            </button>
          </div>
          <label className="oda-check">
            <input type="checkbox" checked={draft.visible} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, visible: e.target.checked }))} />
            <span>Visible en el tablero</span>
          </label>
          {canEdit && (
            <div className="obs-classify__actions">
              {editing && (
                <button type="button" className="button-ghost" disabled={problems.length > 0 || commit.isPending} onClick={() => save(true)}>
                  Guardar como nuevo
                </button>
              )}
              <button type="button" className="button-primary" disabled={problems.length > 0 || commit.isPending} onClick={() => save(false)}>
                {editing ? "Guardar visor" : "Crear visor"}
              </button>
              <SaveState pending={commit.isPending} error={commit.error} success={commit.isSuccess} />
            </div>
          )}
        </div>

        <section className="obs-views-strip" aria-label={`Visores de ${info.name}`}>
          <header>
            <strong>Visores de {info.name}</strong>
            <button type="button" className="oda-chip" onClick={() => setQuery({ visor: null })} aria-pressed={!editing}>
              <Icon name="plus" size={13} /> Nuevo visor
            </button>
          </header>
          {topicViews.length ? (
            <ul>
              {topicViews.map((v) => (
                <li key={v.id}>
                  <button type="button" aria-current={v.id === editing?.id ? "true" : undefined} onClick={() => setQuery({ visor: v.id, tabla: v.datasetId })} data-hidden={!v.visible || undefined}>
                    <ChartThumb type={v.type} />
                    <span>
                      {v.title}
                      <small>
                        {SECTION_LABEL[v.section]} · {CHARTS[v.type].label}
                        {!v.visible && " · oculto"}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="obs-studio__meta">Aún no hay visores guardados en este tema.</p>
          )}
          {editing && canEdit && (
            <div className="obs-views-strip__delete">
              {confirming ? (
                <span className="oda-confirm" role="group" aria-label="Confirmar el borrado">
                  <span>Se borra «{editing.title}».</span>
                  <button
                    type="button"
                    className="oda-link-button"
                    data-tone="danger"
                    onClick={() => commit.mutate({ kind: "view-delete", id: editing.id }, { onSuccess: () => setQuery({ visor: null }) })}
                  >
                    Sí, borrar
                  </button>
                  <button type="button" className="oda-link-button" onClick={() => setConfirming(false)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setConfirming(true)}>
                  Borrar este visor
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* --- Mostrarme --- */}
      <aside className="obs-studio__gallery" aria-label="Tipos de gráfica">
        <div className="obs-gallery__recs">
          <span className="obs-fields__label">Recomendados para esta tabla</span>
          <ol>
            {recs.slice(0, 4).map((r, i) => (
              <li key={r.type}>
                <button type="button" aria-pressed={draft.type === r.type} onClick={() => pickType(r.type)}>
                  <span className="obs-gallery__rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <ChartThumb type={r.type} />
                  <span>
                    <b>{CHARTS[r.type].label}</b>
                    <small>{r.why}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        {typesByFamily.map(({ family, types }) => (
          <div key={family} className="obs-gallery__family">
            <span className="obs-fields__label">{family}</span>
            <ul>
              {types.map((type) => {
                const blocked = obsViewProblems(dataset, fitEncoding(dataset, type, {}));
                const recommended = recs.some((r) => r.type === type);
                return (
                  <li key={type}>
                    <button
                      type="button"
                      className="obs-gallery__tile"
                      aria-pressed={draft.type === type}
                      aria-disabled={blocked.length > 0 || undefined}
                      data-recommended={recommended || undefined}
                      title={blocked.length ? `${CHARTS[type].label}: ${blocked.join(" ")}` : `${CHARTS[type].label}: ${CHARTS[type].hint}`}
                      onClick={() => {
                        if (!blocked.length) pickType(type);
                      }}
                    >
                      <ChartThumb type={type} />
                      <span>{CHARTS[type].label}</span>
                      {CHARTS[type].origin === "Informes" && <small>de informes</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
