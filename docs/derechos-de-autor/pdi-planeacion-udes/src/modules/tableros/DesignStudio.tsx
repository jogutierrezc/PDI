/* =============================================================================
   Mis Tableros · el estudio de visores.

   El mismo estudio del Observatorio —campos a la izquierda, estantes y lienzo
   al centro, galería a la derecha— sobre las tablas de un tablero. No se copia
   su código: se usan sus mismas piezas (el analizador, la galería, la gráfica)
   y solo cambia quién guarda: aquí cada visor es una fila de `board_views`,
   con su página y su sección, y lo publica la unidad, no Planeación.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ConfirmButton, SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import { ChartThumb, ObsChart, RawTable } from "../admin/observatorio/ObsCharts";
import { fieldsOf, fitEncoding, recommend } from "../admin/observatorio/analyze";
import { CHARTS, FAMILIES, SECTIONS, SECTION_HINT, SECTION_LABEL, obsViewProblems, plural } from "../admin/observatorio/model";
import type { ObsChartType, ObsColumn, ObsSection, ObsView } from "../admin/observatorio/model";
import type { ObsDataset } from "../admin/observatorio/model";
import { useDeleteView, useSaveView } from "./store";
import type { Board, BoardDataset, BoardPage, BoardView, Unit } from "./model";

/** El visor en obras: todo menos lo que vive en columnas de `board_views`. */
type Draft = Omit<ObsView, "id" | "datasetId" | "topic" | "position" | "key">;

/** El lienzo sin tabla detrás: lo que se dibuja hasta que haya datos. */
const EMPTY_DRAFT: Draft = { type: "tabla", title: "", section: "detalle", size: "completa", visible: true };

/** En qué sección nace un visor, según lo que dibuja. La misma regla del Observatorio. */
function sectionFor(type: ObsChartType): ObsSection {
  if (type === "lineas" || type === "area" || type === "gantt") return "tendencia";
  if (type === "mapa" || type === "mapa_municipal") return "territorio";
  if (type === "cifras") return "panorama";
  if (["dona", "circular", "mosaico", "barras_100", "cascada"].includes(type)) return "composicion";
  return "detalle";
}

/** De la fila guardada al visor en obras. */
function draftFrom(view: BoardView, dataset: BoardDataset): Draft {
  const spec = view.spec as Partial<ObsView> & { type?: ObsChartType };
  return {
    type: (spec.type ?? "barras") as ObsChartType,
    title: (spec.title as string) ?? dataset.title,
    description: spec.description as string | undefined,
    category: spec.category,
    category2: spec.category2,
    series: spec.series,
    orientation: spec.orientation,
    sort: spec.sort,
    limit: spec.limit,
    reference: spec.reference,
    start: spec.start,
    end: spec.end,
    section: view.section,
    size: view.size,
    visible: view.visible,
  };
}

/** Del visor en obras al `spec` que guarda la fila. */
function specOf(draft: Draft, fallbackTitle: string): Record<string, unknown> {
  const spec: Record<string, unknown> = { title: draft.title.trim() || fallbackTitle, type: draft.type };
  if (draft.description?.trim()) spec.description = draft.description.trim();
  const encoding: (keyof Draft)[] = ["category", "category2", "series", "orientation", "sort", "limit", "reference", "start", "end"];
  for (const key of encoding) {
    const value = draft[key];
    if (value !== undefined && value !== null && !(Array.isArray(value) && !value.length)) spec[key] = value;
  }
  return spec;
}

/** La tabla de un tablero, en la forma que dibujan las piezas del Observatorio. */
export const asObsDataset = (d: BoardDataset): ObsDataset => ({
  id: d.id,
  topic: "",
  title: d.title,
  description: d.description,
  source: d.source,
  dataType: d.dataType,
  temporality: d.temporality,
  periodLabel: d.periodLabel,
  columns: d.columns,
  rows: d.rows,
  anonymization: d.anonymization,
  sample: false,
  status: "publicado",
  position: d.position,
  updatedAt: d.updatedAt,
});

export function DesignStudio({
  board,
  unit,
  datasets,
  views,
  canEdit,
}: {
  board: Board;
  unit: Unit;
  datasets: BoardDataset[];
  views: BoardView[];
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const save = useSaveView();
  const remove = useDeleteView();

  const ordered = [...views].sort((a, b) => a.position - b.position);
  const editing = ordered.find((v) => v.id === params.get("visor"));
  const dataset = datasets.find((d) => d.id === (editing?.datasetId ?? params.get("tabla"))) ?? datasets[0];
  // Puede no haber tablas todavía: el useState corre antes que cualquier
  // guard, así que el lienzo en blanco también tiene que poder nacer.
  const [draft, setDraft] = useState<Draft>(() => (dataset ? newDraft(dataset) : EMPTY_DRAFT));
  const [page, setPage] = useState<string>(editing?.page ?? board.pages[0]?.slug ?? "panorama");
  const [mode, setMode] = useState<"grafica" | "tabla">("grafica");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Otra tabla u otro visor: el lienzo arranca de lo guardado o de la recomendación.
  useEffect(() => {
    if (!dataset) return;
    setDraft(editing ? draftFrom(editing, dataset) : newDraft(dataset));
    if (editing) setPage(editing.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id, editing?.id]);

  const setQuery = (entries: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(entries)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  if (!dataset) {
    return (
      <StageEmpty title="Primero hacen falta datos">
        Un visor dibuja una tabla. Sube una en la estación de Datos y vuelve.{" "}
        <button type="button" className="oda-link-button" onClick={() => navigate(`/admin/tableros/${unit.slug}/tablero/${board.slug}/datos`)}>
          Ir a Datos
        </button>
      </StageEmpty>
    );
  }

  const obs = asObsDataset(dataset);
  const spec = CHARTS[draft.type];
  const problems = obsViewProblems(obs, draft);
  const recs = recommend(obs);
  const fields = fieldsOf(obs);
  const column = (key: string | undefined) => dataset.columns.find((c) => c.key === key);

  const pickType = (type: ObsChartType) => {
    const enc = fitEncoding(obs, type, draft);
    setDraft((d) => ({
      ...d,
      ...enc,
      section: d.section === sectionFor(d.type) ? sectionFor(type) : d.section,
      size: type === "tabla" || type === "mapa_calor" ? "completa" : d.size,
    }));
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
        return { ...d, series: one ? [key] : spec.series === "tres" ? [...current, key].slice(-3) : spec.series === "dos" ? [...current, key].slice(-2) : [...current, key] };
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

  const commit = (asNew: boolean) => {
    save.mutate(
      {
        id: editing && !asNew ? editing.id : undefined,
        board_id: board.id,
        dataset_id: dataset.id,
        page,
        section: draft.section,
        spec: specOf(draft, dataset.title),
        size: draft.size,
        visible: draft.visible,
        position: editing && !asNew ? editing.position : ordered.length + 1,
      },
      { onSuccess: () => setQuery({ visor: null }) },
    );
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

  const drawable = { ...draft, title: draft.title.trim() || dataset.title } as Parameters<typeof ObsChart>[0]["view"];

  return (
    <div className="obs-studio">
      {/* --- Datos --- */}
      <aside className="obs-studio__data" aria-label="Datos">
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
        </p>
        <div className="obs-fields">
          {fieldGroup("Tiempo", fields.time)}
          {fieldGroup("Categorías", fields.dims)}
          {fieldGroup("Territorio", fields.places)}
          {fieldGroup("Fechas", fields.dates)}
          {fieldGroup("Cifras", fields.nums)}
        </div>
        <button
          type="button"
          className="oda-link-button"
          onClick={() => navigate(`/admin/tableros/${unit.slug}/tablero/${board.slug}/datos`)}
        >
          Subir otra tabla
        </button>
      </aside>

      {/* --- Lienzo --- */}
      <div className="obs-studio__center">
        <div className="obs-shelves">
          {spec.category !== "ninguna" && (
            shelf("category", spec.category === "territorio" || spec.category === "municipio" ? "Territorio" : spec.category2 ? "Filas" : "Categoría", draft.category ? [draft.category] : [])
          )}
          {spec.category2 && shelf("category2", "Columnas", draft.category2 ? [draft.category2] : [])}
          {spec.series !== "ninguna" && shelf("series", spec.series === "tres" ? "Estimación · inferior · superior" : spec.series === "dos" ? "Barras · línea" : "Cifras", draft.series ?? [], spec.series !== "una")}
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
              <label className="sr-only" htmlFor="tb-visor-titulo">
                Título del visor
              </label>
              <input id="tb-visor-titulo" className="obs-canvas-card__title" value={draft.title} placeholder="Título del visor" disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <label className="sr-only" htmlFor="tb-visor-descripcion">
                Qué muestra
              </label>
              <input
                id="tb-visor-descripcion"
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
            {mode === "tabla" ? <RawTable dataset={obs} /> : <ObsChart dataset={obs} view={drawable} />}
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

        <div className="obs-classify" role="group" aria-label="Clasificación en el tablero">
          <label className="obs-select">
            <span>Página</span>
            <select value={page} disabled={!canEdit} onChange={(e) => setPage(e.target.value)}>
              {board.pages.map((p: BoardPage) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
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
            <span>A la vista</span>
          </label>
          {canEdit && (
            <div className="obs-classify__actions">
              {editing && (
                <button type="button" className="button-ghost" disabled={problems.length > 0 || save.isPending} onClick={() => commit(true)}>
                  Guardar como nuevo
                </button>
              )}
              <button type="button" className="button-primary" disabled={problems.length > 0 || save.isPending} onClick={() => commit(false)}>
                {editing ? "Guardar visor" : "Crear visor"}
              </button>
              <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />
            </div>
          )}
        </div>

        <section className="obs-views-strip" aria-label={`Visores de ${board.title}`}>
          <header>
            <strong>Visores de {board.title}</strong>
            <button type="button" className="oda-chip" onClick={() => setQuery({ visor: null })} aria-pressed={!editing}>
              <Icon name="plus" size={13} /> Nuevo visor
            </button>
          </header>
          {ordered.length ? (
            <ul>
              {ordered.map((v) => {
                const d = datasets.find((x) => x.id === v.datasetId);
                if (!d) return null;
                const type = ((v.spec as Partial<ObsView> & { type?: ObsChartType }).type ?? "barras") as ObsChartType;
                return (
                  <li key={v.id}>
                    <button type="button" aria-current={v.id === editing?.id ? "true" : undefined} onClick={() => setQuery({ visor: v.id, tabla: v.datasetId })} data-hidden={!v.visible || undefined}>
                      <ChartThumb type={type} />
                      <span>
                        {(v.spec as Partial<ObsView>).title as string}
                        <small>
                          {board.pages.find((p) => p.slug === v.page)?.title ?? v.page} · {SECTION_LABEL[v.section]} · {CHARTS[type].label}
                          {!v.visible && " · oculto"}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="obs-studio__meta">Aún no hay visores en este tablero.</p>
          )}
          {editing && canEdit && <ConfirmButton label="Borrar este visor" confirmLabel={`Borrar «${(editing.spec as Partial<ObsView>).title ?? "visor"}»`} onConfirm={() => remove.mutate(editing.id, { onSuccess: () => setQuery({ visor: null }) })} />}
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
        {FAMILIES.map((family) => ({
          family,
          types: (Object.keys(CHARTS) as ObsChartType[]).filter((t) => CHARTS[t].family === family),
        })).map(({ family, types }) => (
          <div key={family} className="obs-gallery__family">
            <span className="obs-fields__label">{family}</span>
            <ul>
              {types.map((type) => {
                const blocked = obsViewProblems(obs, fitEncoding(obs, type, {}));
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

/** El lienzo en blanco: la gráfica que esa tabla pedía, clasificada como manda su tipo. */
function newDraft(dataset: BoardDataset): Draft {
  const obs = asObsDataset(dataset);
  const top = recommend(obs).find((r) => r.type !== "tabla");
  if (!top) {
    return { type: "tabla", title: dataset.title, section: "detalle", size: "completa", visible: true };
  }
  return {
    ...top.encoding,
    type: top.type,
    title: dataset.title,
    section: sectionFor(top.type),
    size: top.type === "tabla" || top.type === "mapa_calor" ? "completa" : "media",
    visible: true,
  };
}
