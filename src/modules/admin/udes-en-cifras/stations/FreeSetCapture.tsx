/* =============================================================================
   Conjuntos libres en la intranet (0033): Captura › Conjuntos libres.

   Un conjunto libre se crea y se edita aquí, en un solo sitio, por quien lo
   reporta: la estructura la define él mientras lo llena, no otra pantalla ni
   otra persona.

   · FreeSetCapture: elige el conjunto o abre uno nuevo, con dos arranques
     —pegar desde Excel o empezar en blanco—.
   · FreeSetEditor (FreeSetEditor.tsx): título, tiempo, columnas y filas en la
     misma rejilla; guarda la definición y las filas de una vez.
   · FreeViewsEditor: las gráficas del conjunto. Viven aquí, junto a los datos,
     y no en Diseño visual: una vista es parte de la fuente (qué columnas
     dibuja) y se guarda con ella; Diseño visual solo elige qué bloque la
     muestra. Si se quita o cambia de tipo una columna que una gráfica usa, la
     gráfica no se borra: queda marcada con lo que le falta.

   Estructura solo lista los conjuntos libres y permite borrarlos. Las tablas
   personalizadas (un conjunto libre con `view.table`) tienen su propia pestaña.
   ========================================================================== */

import { useState } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { OdFreeSetRow, OdReportBlockRow } from "../../../../types/database";
import { CHART_TYPES, compareSource, viewLostColumns, viewProblems } from "../../../datos-abiertos/data/free-sets";
import type { FreeChartType, FreeSet, FreeView } from "../../../datos-abiertos/data/free-sets";
import type { StationProps } from "../OdAdmin";
import { useSaveFreeSet } from "../od-data";
import { ConfirmButton, Panel, SaveState, StageEmpty, slugify } from "../ui";
import { customViewOf } from "../../../datos-abiertos/data/custom-table";
import { FreeSetEditor } from "./FreeSetEditor";

/** Clave legible y única: "sede", "sede-2"… */
const uniqueSlug = (text: string, taken: Iterable<string>, fallback: string) => {
  const used = new Set(taken);
  const base = slugify(text) || fallback;
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`;
  return key;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

/** Resumen corto de un texto largo: para la clave de la rejilla, no para seguridad. */
const signature = (text: string) => {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33) ^ text.charCodeAt(i);
  return `${text.length}-${(hash >>> 0).toString(36)}`;
};

export function FreeSetCapture({ data, report, periodId, canEdit }: StationProps) {
  const all = (data.rows.freeSets ?? []).filter((fs) => fs.report_id === report!.uuid).sort((a, b) => a.position - b.position);
  // Las tablas personalizadas se editan en su pestaña: allá el total se escribe entero y hay color.
  const sets = all.filter((fs) => !customViewOf(fs));
  const [chosen, setChosen] = useState("");
  /** La clave del conjunto recién creado: se abre solo cuando llega de la base. */
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  /** Conjunto nuevo: primero se elige cómo arrancar, después se abre el editor. */
  const [creating, setCreating] = useState<"elegir" | "pegar" | "blanco" | null>(null);

  const set = sets.find((s) => s.key === createdKey) ?? sets.find((s) => s.id === chosen) ?? sets[0];
  const published = report!.status === "publicado";
  const editingNew = creating === "pegar" || creating === "blanco";

  return (
    <div className="oda-stack">
      <div className="oda-grid-toolbar">
        {sets.length > 1 && set && !editingNew && (
          <label className="oda-grid-toolbar__field">
            <span>Conjunto</span>
            <select
              value={set.id}
              onChange={(e) => {
                setCreatedKey(null);
                setChosen(e.target.value);
              }}
            >
              {sets.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
        )}
        {!creating && (
          <button type="button" className="button-secondary" disabled={!canEdit} onClick={() => setCreating("elegir")}>
            <Icon name="plus" size={15} /> Nuevo conjunto libre
          </button>
        )}
      </div>

      {creating === "elegir" && (
        <div className="oda-inline-form oda-ct__new" role="group" aria-label="Cómo empezar el conjunto nuevo">
          <p className="oda-form-note">
            Tú defines la estructura: las columnas y sus tipos se arman en la misma pantalla donde escribes los datos, y se
            pueden cambiar después sin perder nada.
          </p>
          <div className="oda-inline-form__actions">
            <button type="button" className="button-primary" autoFocus onClick={() => setCreating("pegar")}>
              <Icon name="table" size={15} /> Pegar desde Excel
            </button>
            <button type="button" className="button-secondary" onClick={() => setCreating("blanco")}>
              Empezar en blanco
            </button>
            <button type="button" className="button-ghost" onClick={() => setCreating(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editingNew ? (
        <FreeSetEditor
          key={`nuevo-${creating}`}
          set={null}
          rows={[]}
          start={creating}
          views={[]}
          takenKeys={all.map((s) => s.key)}
          position={all.length + 1}
          reportId={report!.uuid!}
          offices={data.rows.offices}
          periodId={periodId}
          published={published}
          canEdit={canEdit}
          onCancel={() => setCreating(null)}
          onCreated={(key) => {
            setCreatedKey(key);
            setCreating(null);
          }}
        />
      ) : !set ? (
        !creating && (
          <StageEmpty title="Este informe no tiene conjuntos libres">
            Un conjunto libre es una fuente con las columnas que tú definas y las gráficas que quieras armar sobre ella.
            Créalo con «Nuevo conjunto libre»: pegando una tabla de Excel o empezando en blanco.
          </StageEmpty>
        )
      ) : (
        <SetEditors key={set.id} set={set} data={data} reportId={report!.uuid!} periodId={periodId} published={published} canEdit={canEdit} takenKeys={all.map((s) => s.key)} />
      )}
    </div>
  );
}

/** Un conjunto guardado: su editor de datos y, debajo, sus gráficas. */
function SetEditors({ set, data, reportId, periodId, published, canEdit, takenKeys }: {
  set: OdFreeSetRow; data: StationProps["data"]; reportId: string; periodId: string; published: boolean; canEdit: boolean; takenKeys: string[];
}) {
  const rows = (data.rows.freeSetRows ?? []).filter((r) => r.set_id === set.id).sort((a, b) => a.position - b.position);
  const blocks = data.rows.blocks.filter((b) => b.report_id === reportId && b.kind === "libre" && b.ref_id === set.id);
  return (
    <>
      <FreeSetEditor
        // Se monta de nuevo cuando cambia lo guardado; las gráficas no cuentan, para no perder lo escrito al guardar una.
        key={signature(JSON.stringify([set.title, set.description, set.office_id, set.temporality, set.period_label, set.columns, rows]))}
        set={set}
        rows={rows}
        views={set.views}
        takenKeys={takenKeys}
        position={set.position}
        reportId={reportId}
        offices={data.rows.offices}
        periodId={periodId}
        published={published}
        canEdit={canEdit}
      />
      <FreeViewsEditor key={signature(JSON.stringify(set.views))} set={set} blocks={blocks} published={published} canEdit={canEdit} />
    </>
  );
}

/* --- 2. Gráficas (vistas) ------------------------------------------------------------------ */

const TYPE_GROUPS: { label: string; types: FreeChartType[] }[] = [
  { label: "Comparar", types: ["barras", "barras_comparadas", "barras_apiladas", "barras_100", "radar"] },
  { label: "Reparto", types: ["circular", "dona", "cascada"] },
  { label: "Distribución", types: ["histograma", "caja"] },
  { label: "Tiempo", types: ["lineas", "area", "barras_linea", "gantt"] },
  { label: "Territorio", types: ["mapa"] },
  { label: "Otros", types: ["cifras", "tabla"] },
];

const BARS: FreeChartType[] = ["barras", "barras_comparadas", "barras_apiladas", "barras_100"];
const SORTABLE: FreeChartType[] = ["barras", "barras_comparadas", "barras_apiladas", "barras_100", "circular", "dona"];
const SORT_LABEL: Record<NonNullable<FreeView["sort"]>, string> = {
  fuente: "Como vienen en la fuente",
  desc: "De mayor a menor",
  asc: "De menor a mayor",
};

/** Solo los campos que usa el tipo de gráfica: cambiar de tipo no deja restos. */
function cleanView(v: FreeView): FreeView {
  const spec = CHART_TYPES[v.type];
  const out: FreeView = { key: v.key, title: v.title.trim(), type: v.type };
  if (v.description?.trim()) out.description = v.description.trim();
  if (spec.category !== "ninguna" && v.category) out.category = v.category;
  if (spec.series !== "ninguna" && v.series?.length) out.series = spec.series === "una" ? v.series.slice(0, 1) : spec.series === "dos" ? v.series.slice(0, 2) : v.series;
  if (BARS.includes(v.type)) out.orientation = v.orientation ?? "vertical";
  if (SORTABLE.includes(v.type) && v.sort && v.sort !== "fuente") out.sort = v.sort;
  if (v.type === "histograma" && v.bins) out.bins = v.bins;
  if (spec.compare) {
    if (v.compare) out.compare = v.compare;
    if (v.compareAll) out.compareAll = true;
  }
  if (spec.dates) {
    if (v.start) out.start = v.start;
    if (v.end) out.end = v.end;
  }
  if (v.type === "cascada") out.total = Boolean(v.total);
  return out;
}

const asFreeSet = (set: OdFreeSetRow): FreeSet => ({
  id: set.key, uuid: set.id, title: set.title, description: set.description, source: "", officeId: set.office_id,
  temporality: set.temporality, periodLabel: set.period_label, columns: set.columns, rows: [], views: set.views,
});

function FreeViewsEditor({ set, blocks, published, canEdit }: {
  set: OdFreeSetRow; blocks: OdReportBlockRow[]; published: boolean; canEdit: boolean;
}) {
  const save = useSaveFreeSet();
  const [editing, setEditing] = useState<string | null>(null);
  const views = set.views;
  const freeSet = asFreeSet(set);
  const saveViews = (next: FreeView[]) => save.mutate({ id: set.id, report_id: set.report_id, views: next }, { onSuccess: () => setEditing(null) });
  const showing = (key: string) => blocks.filter((b) => b.settings.view === key).length;

  return (
    <Panel
      id="oda-libre-vistas"
      title={`Gráficas de «${set.title}» (${views.length})`}
      description="Cada gráfica lee las columnas de este conjunto. En Diseño visual se decide qué bloque muestra una gráfica o todas; un bloque sin gráfica elegida las muestra todas, en este orden."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
          <button type="button" className="button-secondary" disabled={!canEdit || set.columns.length === 0} onClick={() => setEditing("nueva")}>
            <Icon name="plus" size={15} /> Nueva gráfica
          </button>
        </>
      }
    >
      {editing === "nueva" && (
        <ViewForm set={freeSet} takenKeys={views.map((v) => v.key)} onCancel={() => setEditing(null)} onSubmit={(view) => saveViews([...views, view])} />
      )}
      <ul className="oda-datasets">
        {views.map((view, index) => {
          // Lo que impide dibujarla y, aparte, las columnas que nombra y ya no están (se dibuja sin ellas).
          const lost = viewLostColumns(freeSet, view);
          const problems = [...viewProblems(freeSet, view), ...lost.map((key) => `Le falta la columna «${key}», que ya no está en el conjunto: edítala.`)];
          const used = showing(view.key);
          return (
            <li key={view.key} className="oda-dataset" data-editing={editing === view.key || undefined}>
              <div className="oda-dataset__row">
                <span className="oda-badge">{CHART_TYPES[view.type]?.label ?? view.type}</span>
                <strong>{view.title}</strong>
                <small>
                  {problems.length ? (
                    <span className="oda-badge" data-tone="warn"><Icon name="alert" size={12} /> {problems[0]}</span>
                  ) : used ? (
                    `en ${plural(used, "bloque propio", "bloques propios")}`
                  ) : (
                    "lista"
                  )}
                </small>
                <span className="oda-table__actions">
                  <button type="button" className="icon-button" aria-label={`Subir ${view.title}`} disabled={!canEdit || index === 0 || save.isPending}
                    onClick={() => { const next = [...views]; next.splice(index - 1, 0, next.splice(index, 1)[0]); saveViews(next); }}>
                    <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button type="button" className="oda-link-button" disabled={!canEdit} onClick={() => setEditing(view.key)}>Editar</button>
                  {canEdit && (
                    <ConfirmButton
                      label="Borrar"
                      subject={`la gráfica «${view.title}»`}
                      confirmLabel={
                        !used
                          ? "No está en ningún bloque de la ficha: sus datos de origen se conservan."
                          : used === blocks.length
                            ? `«${view.title}» sale de ${published ? "la ficha publicada" : "la ficha"}: ${used === 1 ? "su bloque pasa" : "uno de sus bloques pasa"} a mostrar todas las gráficas del conjunto${used > 1 ? " y los demás se quitan" : ""}.`
                            : `«${view.title}» sale de ${published ? "la ficha publicada" : "la ficha"}: ${used === 1 ? "su bloque se quita" : `sus ${used} bloques se quitan`}.`
                      }
                      onConfirm={() => saveViews(views.filter((v) => v.key !== view.key))}
                    />
                  )}
                </span>
              </div>
              {editing === view.key && (
                <ViewForm
                  set={freeSet}
                  initial={view}
                  takenKeys={views.map((v) => v.key)}
                  onCancel={() => setEditing(null)}
                  onSubmit={(next) => saveViews(views.map((v) => (v.key === view.key ? next : v)))}
                />
              )}
            </li>
          );
        })}
        {views.length === 0 && editing !== "nueva" && (
          <li className="oda-muted">Este conjunto todavía no tiene gráficas: la ficha no muestra nada de él hasta crear una.</li>
        )}
      </ul>
    </Panel>
  );
}

function ViewForm({ set, initial, takenKeys, onSubmit, onCancel }: {
  set: FreeSet; initial?: FreeView; takenKeys: string[]; onSubmit: (view: FreeView) => void; onCancel: () => void;
}) {
  // Una columna que la gráfica nombraba y ya no está se suelta al abrirla: guardar la deja limpia.
  const [v, setV] = useState<FreeView>(() => {
    if (!initial) return { key: "", title: "", type: "barras" };
    const known = (key: string | undefined) => (key && set.columns.some((c) => c.key === key) ? key : undefined);
    return {
      ...initial,
      category: known(initial.category),
      compare: known(initial.compare),
      start: known(initial.start),
      end: known(initial.end),
      ...(initial.series ? { series: initial.series.filter((key) => known(key)) } : {}),
    };
  });
  const patch = (change: Partial<FreeView>) => setV({ ...v, ...change });
  const spec = CHART_TYPES[v.type];
  const view = cleanView(v);
  const problems = [...(view.title ? [] : ["Ponle un título."]), ...viewProblems(set, view)];

  const numbers = set.columns.filter((c) => c.kind === "cifra");
  const dates = set.columns.filter((c) => c.kind === "fecha");
  const categories = set.columns.filter((c) => (spec.category === "territorio" ? c.kind === "territorio" : c.kind === "texto" || c.kind === "territorio"));
  /** Lo que la gráfica comparada deduciría ahora mismo, para decirlo en la pista. */
  const compareNow = spec.compare ? compareSource(set, view) : null;
  const otherTexts = set.columns.filter((c) => (c.kind === "texto" || c.kind === "territorio") && c.key !== v.category);
  const series = v.series ?? [];

  const submit = () => {
    if (problems.length) return;
    onSubmit({ ...view, key: initial?.key ?? uniqueSlug(view.title, takenKeys, "grafica") });
  };

  return (
    <form className="oda-inline-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="oda-form-grid">
        <label className="admin-field admin-field--wide">
          <span>Título de la gráfica</span>
          <input autoFocus value={v.title} placeholder="Estudiantes y docentes por sede" onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Descripción <small>opcional</small></span>
          <input value={v.description ?? ""} placeholder="Qué se lee en ella" onChange={(e) => patch({ description: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Tipo</span>
          <select value={v.type} onChange={(e) => patch({ type: e.target.value as FreeChartType })}>
            {TYPE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map((type) => <option key={type} value={type}>{CHART_TYPES[type].label}</option>)}
              </optgroup>
            ))}
          </select>
          <small className="oda-field-hint">{spec.hint}</small>
        </label>

        {spec.category !== "ninguna" && (
          <label className="admin-field">
            <span>{v.type === "gantt" ? "Tareas" : v.type === "mapa" ? "Territorio" : v.type === "caja" ? "Grupos" : "Categorías"}</span>
            <select value={v.category ?? ""} onChange={(e) => patch({ category: e.target.value || undefined })}>
              <option value="">
                {spec.category === "opcional"
                  ? v.type === "caja"
                    ? "Sin grupos: una sola caja"
                    : v.type === "barras_comparadas"
                      ? "Sin categorías: una barra por periodo"
                      : "Sin categoría"
                  : "Elige una columna…"}
              </option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}

        {spec.compare && (
          <>
            <label className="admin-field">
              <span>Periodos</span>
              <select
                value={v.compareAll ? "todos" : "dos"}
                onChange={(e) => patch({ compareAll: e.target.value === "todos" || undefined })}
              >
                <option value="dos">Los dos últimos</option>
                <option value="todos">Todos los que tenga la fuente</option>
              </select>
              <small className="oda-field-hint">
                {compareNow
                  ? compareNow.kind === "anual"
                    ? "Se comparan los años de la fuente."
                    : `Se comparan los valores de «${compareNow.label}».`
                  : "Esta fuente todavía no tiene con qué comparar."}
                {" "}Con dos, la gráfica dice además cuánto varió.
              </small>
            </label>
            {otherTexts.length > 0 && (
              <label className="admin-field">
                <span>Comparar por <small>opcional</small></span>
                <select value={v.compare ?? ""} onChange={(e) => patch({ compare: e.target.value || undefined })}>
                  <option value="">Automático</option>
                  {otherTexts.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <small className="oda-field-hint">Solo si quieres separar las barras por otra cosa.</small>
              </label>
            )}
          </>
        )}

        {spec.series === "una" && (
          <label className="admin-field">
            <span>Cifra</span>
            <select value={series[0] ?? ""} onChange={(e) => patch({ series: e.target.value ? [e.target.value] : [] })}>
              <option value="">Elige una columna…</option>
              {numbers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}

        {spec.series === "dos" && (
          <>
            <label className="admin-field">
              <span>Barras <small>eje izquierdo</small></span>
              <select value={series[0] ?? ""} onChange={(e) => patch({ series: [e.target.value, series[1] ?? ""].filter(Boolean) })}>
                <option value="">Elige una columna…</option>
                {numbers.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <small className="oda-field-hint">P. ej. presupuesto ejecutado.</small>
            </label>
            <label className="admin-field">
              <span>Línea <small>eje derecho</small></span>
              <select
                value={series[1] ?? ""}
                disabled={!series[0]}
                onChange={(e) => patch({ series: [series[0], e.target.value].filter(Boolean) })}
              >
                <option value="">Elige una columna…</option>
                {numbers.filter((c) => c.key !== series[0]).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <small className="oda-field-hint">P. ej. número de proyectos.</small>
            </label>
          </>
        )}

        {spec.series === "varias" && (
          <fieldset className="admin-field--wide oda-free-fieldset oda-free-series">
            <legend>Cifras{v.type === "radar" ? " (una por eje, al menos tres)" : ""}</legend>
            {numbers.length === 0 && <small className="oda-muted">El conjunto no tiene columnas de cifra.</small>}
            {numbers.map((c) => (
              <label key={c.key} className="oda-check">
                <input
                  type="checkbox"
                  checked={series.includes(c.key)}
                  onChange={(e) =>
                    patch({ series: e.target.checked ? numbers.map((n) => n.key).filter((k) => k === c.key || series.includes(k)) : series.filter((k) => k !== c.key) })
                  }
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        )}

        {BARS.includes(v.type) && (
          <label className="admin-field">
            <span>Orientación</span>
            <select value={v.orientation ?? "vertical"} onChange={(e) => patch({ orientation: e.target.value as FreeView["orientation"] })}>
              <option value="vertical">Barras verticales</option>
              <option value="horizontal">Barras horizontales</option>
            </select>
          </label>
        )}

        {SORTABLE.includes(v.type) && (
          <label className="admin-field">
            <span>Orden</span>
            <select value={v.sort ?? "fuente"} onChange={(e) => patch({ sort: e.target.value as FreeView["sort"] })}>
              {(Object.keys(SORT_LABEL) as NonNullable<FreeView["sort"]>[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
        )}

        {v.type === "histograma" && (
          <label className="admin-field">
            <span>Tramos <small>vacío: se calculan solos</small></span>
            <input type="number" min={1} max={40} value={v.bins ?? ""} onChange={(e) => patch({ bins: e.target.value ? Math.max(1, Math.min(40, Number(e.target.value))) : undefined })} />
          </label>
        )}

        {spec.dates && (
          <>
            <label className="admin-field">
              <span>Inicio</span>
              <select value={v.start ?? ""} onChange={(e) => patch({ start: e.target.value || undefined })}>
                <option value="">Elige una columna de fecha…</option>
                {dates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Fin</span>
              <select value={v.end ?? ""} onChange={(e) => patch({ end: e.target.value || undefined })}>
                <option value="">Elige una columna de fecha…</option>
                {dates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </>
        )}

        {v.type === "cascada" && (
          <label className="oda-inline-check admin-field--wide">
            <input type="checkbox" checked={Boolean(v.total)} onChange={(e) => patch({ total: e.target.checked })} />
            <span>Añadir la barra del total al final</span>
          </label>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="oda-paste__warning oda-free__problems" aria-live="polite">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="oda-inline-form__actions">
        <button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={problems.length > 0}>{initial ? "Guardar gráfica" : "Crear gráfica"}</button>
      </div>
    </form>
  );
}
