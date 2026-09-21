/* =============================================================================
   Mis Tableros · el taller de un tablero.

   El mismo recorrido del Observatorio —datos, visores, páginas, publicación—
   con sus mismas piezas: el analizador que lee un Excel y deja el acta de
   anonimización (`analyze.ts`), la gráfica (`ObsChart`) y la tabla cruda
   (`RawTable`). No se copia ese código: se usa.

   Lo que sí es propio de aquí es la escalera de visibilidad y la solicitud de
   publicación, porque el Observatorio es uno y de Planeación, y esto son
   muchos y de cada unidad.
   ========================================================================== */

import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import { parseClipboardGrid, parseCsv } from "../admin/udes-en-cifras/sheet";
import { analyzeGrid, buildDataset, defaultPlan, fitEncoding, recommend } from "../admin/observatorio/analyze";
import { ObsChart, RawTable } from "../admin/observatorio/ObsCharts";
import { ChartFrame } from "../datos-abiertos/components/ChartFrame";
import { CHARTS } from "../admin/observatorio/model";
import type { ObsChartType, ObsDataset, ObsView } from "../admin/observatorio/model";
import { VISIBILITY, atLeast, blockingProblems, boardPath, canLead, freeSlug, reviewChecks, roleAt } from "./model";
import type { BoardDataset, BoardView, BoardVisibility } from "./model";
import {
  useBoardContent,
  useBoards,
  useDeleteDataset,
  useDeleteView,
  useRequestReview,
  useReviews,
  useSaveBoard,
  useSaveDataset,
  useSaveView,
  useUnits,
  useWithdrawReview,
} from "./store";
import "../admin/udes-en-cifras/od-admin.css";
import "../datos-abiertos/datos-abiertos.css";
import "../datos-abiertos/components/free-sets.css";
import "../admin/observatorio/obs-admin.css";
import "./tableros.css";

type Station = "datos" | "visores" | "paginas" | "publicar";

const STATIONS: { id: Station; label: string; hint: string }[] = [
  { id: "datos", label: "Datos", hint: "Sube las tablas. El taller lee las columnas y deja el acta." },
  { id: "visores", label: "Visores", hint: "Dibuja cada tabla y colócala en una página." },
  { id: "paginas", label: "Páginas", hint: "Las pestañas con las que se recorre el tablero." },
  { id: "publicar", label: "Publicar", hint: "Quién lo ve, y el visto bueno de Planeación." },
];

/** El puente entre la tabla de un tablero y lo que dibujan las piezas del Observatorio. */
const asObsDataset = (d: BoardDataset): ObsDataset => ({
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

export function BoardWorkshop() {
  const { unidad, tablero, estacion } = useParams<{ unidad?: string; tablero?: string; estacion?: Station }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const units = useUnits();
  const boards = useBoards();

  const all = units.data?.units ?? [];
  const members = units.data?.members ?? [];
  const unit = all.find((u) => u.slug === unidad) ?? null;
  const board = (boards.data ?? []).find((b) => b.unitId === unit?.id && b.slug === tablero) ?? null;
  const content = useBoardContent(board?.id);

  const myRole = profile && unit ? roleAt(all, members, profile.id, unit.id) : null;
  const canEdit = atLeast(myRole, "editor");
  const leads = canLead(myRole, hasRole("admin"));
  const station: Station = estacion ?? "datos";
  const current = STATIONS.find((s) => s.id === station) ?? STATIONS[0];

  if (units.isPending || boards.isPending) {
    return (
      <AdminShell section="tableros" kicker="Mis Tableros" title="Cargando…" description="">
        <p className="admin-loading">Buscando el tablero…</p>
      </AdminShell>
    );
  }

  if (!unit || !board) {
    return (
      <AdminShell section="tableros" kicker="Mis Tableros" title="No encontrado" description="">
        <StageEmpty title="Ese tablero no está aquí">
          O no existe, o no te toca. <Link to="/admin/tableros">Volver a Mis Tableros</Link>.
        </StageEmpty>
      </AdminShell>
    );
  }

  const datasets = content.data?.datasets ?? [];
  const views = content.data?.views ?? [];

  return (
    <AdminShell
      section="tableros"
      kicker={`${unit.name} · ${board.title}`}
      title={current.label}
      description={current.hint}
      actions={
        <>
          <span className="tb-list__see" data-level={board.visibility}>
            <Icon name={board.visibility === "publico" ? "compass" : board.visibility === "universidad" ? "user" : "lock"} size={14} />
            {VISIBILITY[board.visibility].short}
          </span>
          <Link to={boardPath(unit.slug, board.slug)} className="button-secondary" target="_blank" rel="noreferrer">
            Verlo publicado
          </Link>
        </>
      }
    >
      {!canEdit && (
        <p className="oda-banner" role="note">
          <Icon name="eye" size={16} />
          {hasRole("planeacion") && !myRole
            ? "Entras como Planeación: lees el tablero entero, pero escribirlo es de su unidad."
            : "Eres visor en esta unidad: puedes abrir y descargar, no cambiar."}
        </p>
      )}

      <nav className="tb__views" aria-label="Estaciones del taller">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="tb__view"
            aria-current={station === s.id}
            onClick={() => navigate(`/admin/tableros/${unit.slug}/tablero/${board.slug}/${s.id}`)}
          >
            {s.label}
            {s.id === "datos" && datasets.length > 0 && <span className="tb__count">{datasets.length}</span>}
            {s.id === "visores" && views.length > 0 && <span className="tb__count">{views.length}</span>}
          </button>
        ))}
      </nav>

      {content.isPending ? (
        <p className="admin-loading">Cargando el tablero…</p>
      ) : station === "datos" ? (
        <DataStation boardId={board.id} datasets={datasets} views={views} canEdit={canEdit} />
      ) : station === "visores" ? (
        <ViewStation board={board} datasets={datasets} views={views} canEdit={canEdit} />
      ) : station === "paginas" ? (
        <PageStation board={board} views={views} canEdit={leads} />
      ) : (
        <PublishStation board={board} unitSlug={unit.slug} datasets={datasets} views={views} canLead={leads} />
      )}
    </AdminShell>
  );
}

/* --- 1 · Datos ----------------------------------------------------------------- */

function DataStation({
  boardId,
  datasets,
  views,
  canEdit,
}: {
  boardId: string;
  datasets: BoardDataset[];
  views: BoardView[];
  canEdit: boolean;
}) {
  const save = useSaveDataset();
  const remove = useDeleteDataset();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>(datasets[0]?.id ?? null);
  const [problem, setProblem] = useState("");
  const [pasted, setPasted] = useState("");

  /**
   * Del archivo a la tabla guardada, con el mismo analizador del Observatorio.
   *
   * Se usa el plan que propone por defecto: agrega los microdatos, descarta lo
   * que parece identificar a una persona y aplica la reserva por debajo del
   * umbral. Afinar ese plan es cosa del Observatorio, que tiene la pantalla
   * para hacerlo; aquí lo que importa es que nada personal llegue a la base.
   */
  const adopt = (name: string, grid: string[][]) => {
    setProblem("");
    const analysis = analyzeGrid(name, grid);
    if (!analysis) {
      setProblem("No se reconoció una tabla: hace falta una fila de encabezados y al menos una de datos.");
      return;
    }
    const built = buildDataset(analysis, defaultPlan(analysis));
    save.mutate({
      board_id: boardId,
      title: name.replace(/\.[^.]+$/, ""),
      source: "",
      temporality: built.temporality,
      columns: built.columns,
      rows: built.rows,
      anonymization: built.anonymization,
      position: datasets.length + 1,
    });
  };

  const onFile = async (chosen: File | null) => {
    if (!chosen) return;
    try {
      if (chosen.name.toLowerCase().endsWith(".csv")) {
        adopt(chosen.name, parseCsv(await chosen.text()));
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const grid = (await readXlsxFile(chosen)) as unknown as unknown[][];
        adopt(chosen.name, grid.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))));
      }
    } catch {
      setProblem("No se pudo leer el archivo. Prueba con un .xlsx de una sola hoja o con un .csv.");
    }
    if (file.current) file.current.value = "";
  };

  const dataset = datasets.find((d) => d.id === open) ?? datasets[0] ?? null;

  return (
    <div className="oda-stack">
      <Panel
        title="Tablas de datos"
        description="Al subir, el taller lee las columnas, propone el tipo de cada una y deja el acta de anonimización. Nada personal llega a la base."
        actions={
          <>
            <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />
            {canEdit && (
              <button type="button" className="button-primary" onClick={() => file.current?.click()}>
                <Icon name="upload" size={15} /> Subir Excel o CSV
              </button>
            )}
          </>
        }
      >
        <input
          ref={file}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />

        {problem && (
          <p className="oda-banner" role="alert">
            <Icon name="alert" size={16} /> {problem}
          </p>
        )}

        {canEdit && (
          <details className="tb-paste">
            <summary>O pega una tabla desde el portapapeles</summary>
            <textarea
              rows={4}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Pega aquí las celdas copiadas de Excel"
            />
            <button
              type="button"
              className="button-secondary"
              disabled={!pasted.trim()}
              onClick={() => {
                adopt("tabla pegada", pasted.includes("\t") ? parseClipboardGrid(pasted) : parseCsv(pasted));
                setPasted("");
              }}
            >
              Leerla
            </button>
          </details>
        )}

        {datasets.length === 0 ? (
          <StageEmpty title="Sin tablas todavía">
            Un tablero empieza por sus datos. Sube un Excel o un CSV: una fila de encabezados y las filas de datos
            debajo.
          </StageEmpty>
        ) : (
          <ul className="tb-list">
            {datasets.map((d) => {
              const used = views.filter((v) => v.datasetId === d.id).length;
              return (
                <li key={d.id}>
                  <button type="button" className="tb-list__row" aria-current={d.id === dataset?.id || undefined} onClick={() => setOpen(d.id)}>
                    <span className="tb-list__main">
                      <strong>{d.title}</strong>
                      <small>
                        {d.rows.length} {d.rows.length === 1 ? "fila" : "filas"} · {d.columns.length} columnas
                        {d.source ? ` · ${d.source}` : ""}
                      </small>
                    </span>
                    <span className="tb-list__meta">{used} {used === 1 ? "visor" : "visores"}</span>
                    <span className="tb-list__see" data-level={d.anonymization ? "publico" : "unidad"}>
                      <Icon name={d.anonymization ? "check" : "alert"} size={14} />
                      {d.anonymization ? "Con acta" : "Sin acta"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {dataset && <DatasetDetail dataset={dataset} canEdit={canEdit} onDelete={() => remove.mutate(dataset.id)} />}
    </div>
  );
}

function DatasetDetail({ dataset, canEdit, onDelete }: { dataset: BoardDataset; canEdit: boolean; onDelete: () => void }) {
  const save = useSaveDataset();
  const [title, setTitle] = useState(dataset.title);
  const [source, setSource] = useState(dataset.source);
  const [description, setDescription] = useState(dataset.description);
  const dirty = title !== dataset.title || source !== dataset.source || description !== dataset.description;

  return (
    <Panel
      title={dataset.title}
      description="Quién la reporta viaja con cada cifra publicada: sin eso, lo que salga no se puede citar."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={dirty ? "Sin guardar" : undefined} />
          {canEdit && (
            <>
              <button
                type="button"
                className="button-primary"
                disabled={!dirty || !title.trim()}
                onClick={() => save.mutate({ id: dataset.id, board_id: dataset.boardId, title: title.trim(), source: source.trim(), description: description.trim() })}
              >
                Guardar
              </button>
              <ConfirmButton label="Borrar tabla" confirmLabel="Borrar la tabla y sus visores" onConfirm={onDelete} />
            </>
          )}
        </>
      }
    >
      <div className="oda-form-grid">
        <label className="admin-field">
          <span>Cómo se llama</span>
          <input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>Quién la reporta</span>
          <input value={source} disabled={!canEdit} onChange={(e) => setSource(e.target.value)} placeholder="Decanatura, Registro Académico…" />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Qué muestra <small>opcional</small></span>
          <input value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      {dataset.anonymization && (
        <p className="tb-act">
          <Icon name="check" size={16} />
          <span>
            <strong>Acta de anonimización.</strong> {dataset.anonymization.sourceRows} filas de origen,{" "}
            {dataset.anonymization.removed.length} columnas fuera
            {dataset.anonymization.groupedBy.length > 0 && `, agregadas por ${dataset.anonymization.groupedBy.join(", ")}`}
            {dataset.anonymization.reservedCells > 0
              ? `. ${dataset.anonymization.reservedCells} celdas con menos de ${dataset.anonymization.threshold} registros se publican como «< ${dataset.anonymization.threshold}».`
              : ". Ninguna celda quedó por debajo del umbral."}
          </span>
        </p>
      )}

      <div className="tb-scroll">
        <RawTable dataset={asObsDataset(dataset)} compact limit={8} />
      </div>
    </Panel>
  );
}

/* --- 2 · Visores ---------------------------------------------------------------- */

function ViewStation({
  board,
  datasets,
  views,
  canEdit,
}: {
  board: { id: string; pages: { slug: string; title: string }[] };
  datasets: BoardDataset[];
  views: BoardView[];
  canEdit: boolean;
}) {
  const save = useSaveView();
  const remove = useDeleteView();
  const [picked, setPicked] = useState<string | null>(null);

  if (datasets.length === 0) {
    return (
      <StageEmpty title="Primero hacen falta datos">
        Un visor dibuja una tabla. Sube una en la estación anterior y vuelve.
      </StageEmpty>
    );
  }

  const add = (datasetId: string) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    if (!dataset) return;
    const obs = asObsDataset(dataset);
    // El primer consejo del analizador es el punto de partida: casi siempre es
    // la gráfica que esa tabla pedía.
    const advice = recommend(obs)[0];
    const type: ObsChartType = advice?.type ?? "barras";
    const encoding = fitEncoding(obs, type, advice?.encoding ?? {});
    save.mutate(
      {
        board_id: board.id,
        dataset_id: datasetId,
        page: board.pages[0]?.slug ?? "panorama",
        spec: { title: dataset.title, ...encoding, type } as Record<string, unknown>,
        size: "media",
        visible: true,
        position: views.length + 1,
      },
      { onSuccess: () => setPicked(null) },
    );
  };

  return (
    <div className="oda-stack">
      <Panel
        title="Visores"
        description="Cada visor dibuja una tabla y vive en una página. Lo que se ve aquí es lo que verá quien abra el tablero."
        actions={
          <>
            <SaveState pending={save.isPending || remove.isPending} error={save.error ?? remove.error} success={save.isSuccess} />
            {canEdit && (
              <label className="oda-add-select">
                <span className="sr-only">Añadir visor</span>
                <select
                  value={picked ?? ""}
                  onChange={(e) => {
                    setPicked(e.target.value || null);
                    if (e.target.value) add(e.target.value);
                  }}
                >
                  <option value="">Dibujar una tabla…</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        }
      >
        {views.length === 0 ? (
          <StageEmpty title="Ninguna tabla dibujada todavía">
            Elige una arriba: el taller propone la gráfica que esa tabla pedía, y desde ahí se afina.
          </StageEmpty>
        ) : (
          <div className="tb-views">
            {views.map((view) => {
              const dataset = datasets.find((d) => d.id === view.datasetId);
              if (!dataset) return null;
              return (
                <ViewCard
                  key={view.id}
                  view={view}
                  dataset={dataset}
                  pages={board.pages}
                  canEdit={canEdit}
                  onPatch={(patch) => save.mutate({ id: view.id, board_id: view.boardId, dataset_id: view.datasetId, ...patch })}
                  onDelete={() => remove.mutate(view.id)}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ViewCard({
  view,
  dataset,
  pages,
  canEdit,
  onPatch,
  onDelete,
}: {
  view: BoardView;
  dataset: BoardDataset;
  pages: { slug: string; title: string }[];
  canEdit: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const obs = useMemo(() => asObsDataset(dataset), [dataset]);
  const spec = view.spec as Partial<ObsView> & { type?: ObsChartType };
  const type = (spec.type ?? "barras") as ObsChartType;

  const drawable = { ...spec, type, title: spec.title ?? dataset.title } as Parameters<typeof ObsChart>[0]["view"];

  return (
    <article className="tb-view" data-size={view.size}>
      <header className="tb-view__head">
        <input
          className="tb-view__title"
          value={(spec.title as string) ?? dataset.title}
          disabled={!canEdit}
          onChange={(e) => onPatch({ spec: { ...spec, title: e.target.value } })}
          aria-label="Título del visor"
        />
        {canEdit && <ConfirmButton label="Quitar" confirmLabel="Quitar el visor" onConfirm={onDelete} />}
      </header>

      <div className="tb-view__canvas">
        <ChartFrame title={(spec.title as string) ?? dataset.title} source={dataset.source || undefined}>
          <ObsChart dataset={obs} view={drawable} />
        </ChartFrame>
      </div>

      {canEdit && (
        <div className="tb-view__controls">
          <label className="admin-field">
            <span>Gráfica</span>
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as ObsChartType;
                onPatch({ spec: { ...spec, ...fitEncoding(obs, next, spec), type: next } });
              }}
            >
              {(Object.keys(CHARTS) as ObsChartType[]).map((kind) => (
                <option key={kind} value={kind}>
                  {CHARTS[kind].label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Página</span>
            <select value={view.page} onChange={(e) => onPatch({ page: e.target.value })}>
              {pages.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Ancho</span>
            <select value={view.size} onChange={(e) => onPatch({ size: e.target.value })}>
              <option value="media">Media fila</option>
              <option value="completa">Fila entera</option>
            </select>
          </label>
          <label className="tb-view__toggle">
            <input type="checkbox" checked={view.visible} onChange={(e) => onPatch({ visible: e.target.checked })} />
            <span>A la vista</span>
          </label>
        </div>
      )}
    </article>
  );
}

/* --- 3 · Páginas ---------------------------------------------------------------- */

function PageStation({
  board,
  views,
  canEdit,
}: {
  board: { id: string; unitId: string; title: string; slug: string; pages: { slug: string; title: string }[] };
  views: BoardView[];
  canEdit: boolean;
}) {
  const save = useSaveBoard();
  const [pages, setPages] = useState(board.pages);
  const [adding, setAdding] = useState("");
  const dirty = JSON.stringify(pages) !== JSON.stringify(board.pages);

  const rename = (slug: string, title: string) => setPages(pages.map((p) => (p.slug === slug ? { ...p, title } : p)));
  const drop = (slug: string) => setPages(pages.filter((p) => p.slug !== slug));

  return (
    <Panel
      title="Páginas del tablero"
      description="Las pestañas con las que se recorre. Un visor vive en una de ellas; si se borra la página, sus visores se quedan sin sitio y dejan de verse."
      actions={
        <>
          <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} idle={dirty ? "Sin guardar" : undefined} />
          {canEdit && (
            <button
              type="button"
              className="button-primary"
              disabled={!dirty || pages.length === 0}
              onClick={() => save.mutate({ id: board.id, unit_id: board.unitId, title: board.title, slug: board.slug, pages })}
            >
              Guardar
            </button>
          )}
        </>
      }
    >
      <ul className="tb-pages">
        {pages.map((page) => {
          const count = views.filter((v) => v.page === page.slug).length;
          return (
            <li key={page.slug}>
              <input
                value={page.title}
                disabled={!canEdit}
                onChange={(e) => rename(page.slug, e.target.value)}
                aria-label={`Nombre de la página ${page.title}`}
              />
              <span className="tb-pages__count">
                {count} {count === 1 ? "visor" : "visores"}
              </span>
              {canEdit && pages.length > 1 && (
                <ConfirmButton
                  label="Quitar"
                  confirmLabel={count > 0 ? `Quitar y dejar ${count} sin sitio` : "Quitar la página"}
                  onConfirm={() => drop(page.slug)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <form
          className="tb-invite"
          onSubmit={(e) => {
            e.preventDefault();
            const title = adding.trim();
            if (!title || pages.length >= 12) return;
            setPages([...pages, { slug: freeSlug(title, pages.map((p) => p.slug)), title }]);
            setAdding("");
          }}
        >
          <label className="admin-field">
            <span>Otra página</span>
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Permanencia" />
          </label>
          <button type="submit" className="button-secondary" disabled={!adding.trim() || pages.length >= 12}>
            Añadir
          </button>
        </form>
      )}
    </Panel>
  );
}

/* --- 4 · Publicar --------------------------------------------------------------- */

function PublishStation({
  board,
  unitSlug,
  datasets,
  views,
  canLead,
}: {
  board: Parameters<typeof reviewChecks>[0] & { id: string; unitId: string; title: string; slug: string; visibility: BoardVisibility };
  unitSlug: string;
  datasets: BoardDataset[];
  views: BoardView[];
  canLead: boolean;
}) {
  const save = useSaveBoard();
  const request = useRequestReview();
  const withdraw = useWithdrawReview();
  const reviews = useReviews();
  const [note, setNote] = useState("");

  const checks = useMemo(() => reviewChecks(board, datasets, views), [board, datasets, views]);
  const blocking = blockingProblems(checks);
  const open = (reviews.data ?? []).find((r) => r.boardId === board.id && r.state === "pendiente");
  const last = (reviews.data ?? []).find((r) => r.boardId === board.id && r.state !== "pendiente");

  const setVisibility = (visibility: BoardVisibility) =>
    save.mutate({ id: board.id, unit_id: board.unitId, title: board.title, slug: board.slug, visibility });

  return (
    <div className="oda-stack">
      <Panel
        title="Quién lo ve"
        description="Los dos primeros peldaños los decide la jefatura de la unidad. El tercero saca el nombre de la universidad a la calle, y ese no lo decide quien lo escribe."
        actions={<SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />}
      >
        <ul className="tb-ladder">
          {(["unidad", "universidad", "publico"] as BoardVisibility[]).map((level) => {
            const chosen = board.visibility === level;
            const locked = level === "publico" && !chosen;
            return (
              <li key={level} data-chosen={chosen || undefined}>
                <label>
                  <input
                    type="radio"
                    name="visibilidad"
                    checked={chosen}
                    disabled={!canLead || locked}
                    onChange={() => setVisibility(level)}
                  />
                  <span>
                    <strong>{VISIBILITY[level].label}</strong>
                    <small>{VISIBILITY[level].hint}</small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="tb-prose tb-prose--aside">
          La dirección no cambia al subir de peldaño: el tablero vive siempre en{" "}
          <code>{boardPath(unitSlug, board.slug)}</code>. Lo que cambia es a quién le responde la base, así que lo
          que alguien citó cuando era interno sigue sirviendo cuando es público.
        </p>
      </Panel>

      <Panel
        title="Sacarlo al portal"
        description="Al pedirlo, esto es lo que Planeación va a leer. Se guarda tal como está hoy."
        actions={<SaveState pending={request.isPending || withdraw.isPending} error={request.error ?? withdraw.error} success={request.isSuccess} />}
      >
        <ul className="tb-checks">
          {checks.map((check) => (
            <li key={check.key} data-ok={check.ok || undefined}>
              <Icon name={check.ok ? "check" : "alert"} size={16} />
              <span>
                <strong>{check.label}</strong>
                {check.detail && <small>{check.detail}</small>}
              </span>
            </li>
          ))}
        </ul>

        {board.visibility === "publico" ? (
          <p className="tb-prose">
            Ya está publicado. Para retirarlo, baja de peldaño arriba: deja de responder sin sesión al instante.
          </p>
        ) : open ? (
          <div className="tb-queue__actions">
            <p className="tb-prose">
              Pedido el{" "}
              {new Date(open.requestedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}. Planeación
              lo está revisando.
            </p>
            {canLead && (
              <ConfirmButton label="Retirar la solicitud" confirmLabel="Retirarla" onConfirm={() => withdraw.mutate(open.id)} />
            )}
          </div>
        ) : (
          <>
            {last && (
              <p className="tb-prose tb-prose--aside">
                La vez anterior se {last.state === "aprobada" ? "aprobó" : "devolvió"}
                {last.resolution ? `: «${last.resolution}»` : "."}
              </p>
            )}
            {blocking.length > 0 ? (
              <p className="oda-banner" role="note">
                <Icon name="alert" size={16} />
                No se puede pedir todavía: {blocking.join("; ").toLowerCase()}.
              </p>
            ) : (
              <form
                className="tb-invite"
                onSubmit={(e) => {
                  e.preventDefault();
                  request.mutate({ boardId: board.id, checks, note: note.trim() }, { onSuccess: () => setNote("") });
                }}
              >
                <label className="admin-field admin-field--wide">
                  <span>Algo que quieras decirle a Planeación <small>opcional</small></span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Para el informe de acreditación de marzo" />
                </label>
                <button type="submit" className="button-primary" disabled={!canLead || request.isPending}>
                  Pedir publicación
                </button>
              </form>
            )}
            {!canLead && <p className="tb-prose tb-prose--aside">Pedir la publicación es de la jefatura de la unidad.</p>}
          </>
        )}
      </Panel>
    </div>
  );
}
