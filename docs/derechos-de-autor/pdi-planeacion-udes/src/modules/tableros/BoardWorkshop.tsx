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
import { AdminRail, AdminRailTab, AdminShell } from "../admin/components/AdminShell";
import { Icon } from "../../components/ui/Icon";
import { useAuth } from "../../lib/auth";
import { ConfirmButton, Panel, SaveState, StageEmpty } from "../admin/udes-en-cifras/ui";
import { parseClipboardGrid, parseCsv } from "../admin/udes-en-cifras/sheet";
import { analyzeGrid, buildDataset, defaultPlan } from "../admin/observatorio/analyze";
import type { Analysis, Plan } from "../admin/observatorio/analyze";
import { AnalysisStep, Acta } from "../admin/observatorio/stations/CaptureStation";
import { RawTable } from "../admin/observatorio/ObsCharts";
import { plural } from "../admin/observatorio/model";
import type { ObsDataset } from "../admin/observatorio/model";
import { PAGE_TEMPLATES, VISIBILITY, atLeast, blockingProblems, boardPath, canLead, freeSlug, reviewChecks, roleAt } from "./model";
import type { BoardDataset, BoardPage, BoardTemplate, BoardView, BoardVisibility } from "./model";
import { DesignStudio, asObsDataset } from "./DesignStudio";
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
  { id: "paginas", label: "Páginas", hint: "Las pestañas del tablero: cómo se lee cada una y con qué texto." },
  { id: "publicar", label: "Publicar", hint: "Quién lo ve, y el visto bueno de Planeación." },
];

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
      rail={
        <AdminRail label="Estaciones del taller">
          {STATIONS.map((s) => (
            <AdminRailTab
              key={s.id}
              current={station === s.id}
              count={s.id === "datos" ? datasets.length : s.id === "visores" ? views.length : undefined}
              onSelect={() => navigate(`/admin/tableros/${unit.slug}/tablero/${board.slug}/${s.id}`)}
            >
              {s.label}
            </AdminRailTab>
          ))}
        </AdminRail>
      }
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

      {content.isPending ? (
        <p className="admin-loading">Cargando el tablero…</p>
      ) : station === "datos" ? (
        <DataStation boardId={board.id} datasets={datasets} views={views} canEdit={canEdit} />
      ) : station === "visores" ? (
        <DesignStudio board={board} unit={unit} datasets={datasets} views={views} canEdit={canEdit} />
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
  // Un libro de Excel puede traer varias hojas con datos: se elige cuál.
  const [book, setBook] = useState<{ name: string; sheets: { sheet: string; data: string[][] }[] } | null>(null);
  // La importación en marcha: el análisis del archivo y el plan que la unidad
  // está afinando, como en Captura del Observatorio.
  const [flow, setFlow] = useState<{ step: "analisis" | "resultado"; analysis: Analysis; plan: Plan } | null>(null);
  const [meta, setMeta] = useState({ title: "", source: "", description: "" });
  const result = useMemo(() => (flow ? buildDataset(flow.analysis, flow.plan) : null), [flow]);

  /**
   * Del archivo al análisis, con el mismo analizador del Observatorio. Aquí no
   * se guarda nada todavía: el taller abre el paso de análisis, donde la
   * unidad decide qué columnas entran, si se cuentan registros o se guarda
   * como viene, y con cuánta reserva. Lo que se hizo queda en el acta.
   */
  const adopt = (name: string, grid: string[][]) => {
    setProblem("");
    const analysis = analyzeGrid(name, grid);
    if (!analysis) {
      setProblem("No se reconoció una tabla: hace falta una fila de encabezados y al menos una de datos.");
      return;
    }
    setFlow({ step: "analisis", analysis, plan: defaultPlan(analysis) });
    setMeta({ title: name.replace(/\.(xlsx|csv)( · .*)?$/i, ""), source: "", description: "" });
  };

  const onFile = async (chosen: File | null) => {
    if (!chosen) return;
    setProblem("");
    try {
      if (/\.csv$/i.test(chosen.name) || chosen.type === "text/csv") {
        adopt(chosen.name, parseCsv(await chosen.text()));
      } else {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        // La versión 9 de read-excel-file devuelve las hojas del libro —
        // [{sheet, data}]—, no las filas de la primera. La misma lectura que
        // hace Captura del Observatorio.
        const raw = (await readXlsxFile(chosen)) as unknown as { sheet: string; data: unknown[][] }[];
        const sheets = raw
          .map((s) => ({
            sheet: s.sheet,
            data: s.data.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "")))),
          }))
          .filter((s) => s.data.length > 1);
        if (sheets.length > 1) setBook({ name: chosen.name, sheets });
        else if (sheets.length === 1) adopt(chosen.name, sheets[0].data);
        else setProblem(`«${chosen.name}» no trae una hoja con fila de títulos y al menos una fila de datos.`);
      }
    } catch (e) {
      setProblem(`No se pudo leer «${chosen.name}»: ${e instanceof Error ? e.message : "no parece un .xlsx o .csv válido"}.`);
    }
    if (file.current) file.current.value = "";
  };

  const dataset = datasets.find((d) => d.id === open) ?? datasets[0] ?? null;

  // La importación en marcha ocupa la estación, como en el Observatorio: el
  // paso de análisis y el de resultado, con el acta a la vista antes de guardar.
  if (flow && result) {
    const preview: ObsDataset = {
      id: "borrador",
      topic: "",
      title: meta.title || flow.analysis.fileName,
      description: meta.description,
      source: meta.source,
      dataType: "conteo",
      temporality: result.temporality,
      periodLabel: "",
      columns: result.columns,
      rows: result.rows,
      anonymization: result.anonymization,
      sample: false,
      status: "borrador",
      position: 0,
      updatedAt: "",
    };
    const commitTable = () =>
      save.mutate(
        {
          board_id: boardId,
          title: meta.title.trim() || "Tabla importada",
          source: meta.source.trim(),
          description: meta.description.trim(),
          temporality: result.temporality,
          columns: result.columns,
          rows: result.rows,
          anonymization: result.anonymization,
          position: datasets.length + 1,
        },
        { onSuccess: () => setFlow(null) },
      );

    return (
      <Panel
        title="Importar datos"
        description="El archivo se lee y se prepara en este navegador. La unidad decide qué columnas entran y con cuánta reserva; lo que se hizo queda escrito en el acta."
        actions={
          <button type="button" className="oda-link-button" onClick={() => setFlow(null)}>
            Cancelar
          </button>
        }
      >
        <ol className="obs-steps" aria-label="Pasos de la importación">
          {(["analisis", "resultado"] as const).map((step, i) => (
            <li key={step} aria-current={flow.step === step ? "step" : undefined} data-done={flow.step === "resultado" && i === 0 ? true : undefined}>
              <span aria-hidden="true">{flow.step === "resultado" && i === 0 ? <Icon name="check" size={12} /> : i + 1}</span>
              {step === "analisis" ? "Análisis" : "Resultado"}
            </li>
          ))}
        </ol>

        {flow.step === "analisis" ? (
          <AnalysisStep
            analysis={flow.analysis}
            plan={flow.plan}
            internal
            onPlan={(plan) => setFlow({ ...flow, plan })}
            onBack={() => setFlow(null)}
            onNext={() => setFlow({ ...flow, step: "resultado" })}
            canContinue={result.rows.length > 0}
          />
        ) : (
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

              {result.anonymization.sensitive && result.anonymization.sensitive.length > 0 && (
                <p className="oda-banner" role="note">
                  <Icon name="alert" size={16} /> Esta tabla conserva {plural(result.anonymization.sensitive.length, "columna de dato personal", "columnas de dato personal")} (
                  {result.anonymization.sensitive.join(", ")}). Sirve mientras el tablero es de la unidad o de la universidad; para publicarlo en el portal habrá que subirla de nuevo sin ellas.
                </p>
              )}

              <RawTable dataset={preview} limit={40} />
            </div>
            <aside className="obs-result__side">
              <label className="obs-field">
                <span>Título de la tabla</span>
                <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              </label>
              <label className="obs-field">
                <span>Quién la reporta</span>
                <input value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} placeholder="Decanatura, Registro Académico…" />
              </label>
              <label className="obs-field">
                <span>Qué contiene</span>
                <textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Matriculados por programa y año, todos los campus." />
              </label>
              <Acta act={result.anonymization} />
              <div className="obs-detail__actions">
                <button type="button" className="button-ghost" onClick={() => setFlow({ ...flow, step: "analisis" })}>
                  Volver al análisis
                </button>
                <button type="button" className="button-primary" disabled={!result.rows.length || save.isPending} onClick={commitTable}>
                  <Icon name="shield" size={15} /> Guardar tabla
                </button>
              </div>
              <SaveState pending={save.isPending} error={save.error} success={save.isSuccess} />
            </aside>
          </div>
        )}
      </Panel>
    );
  }

  return (
    <div className="oda-stack">
      <Panel
        title="Tablas de datos"
        description="Al subir, el taller perfila cada columna y abre el análisis: la unidad decide qué entra —contar registros o guardar como viene— y lo que se hizo queda en el acta."
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

        {book && (
          <div className="tb-sheets">
            <strong>
              «{book.name}» tiene {book.sheets.length} {book.sheets.length === 1 ? "hoja" : "hojas"} con datos. ¿Cuál se importa?
            </strong>
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
                  {s.sheet} <small>{s.data.length - 1} {s.data.length - 1 === 1 ? "fila" : "filas"}</small>
                </button>
              ))}
            </div>
          </div>
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

/* --- 3 · Páginas ---------------------------------------------------------------- */

function PageStation({
  board,
  views,
  canEdit,
}: {
  board: { id: string; unitId: string; title: string; slug: string; pages: BoardPage[] };
  views: BoardView[];
  canEdit: boolean;
}) {
  const save = useSaveBoard();
  const [pages, setPages] = useState<BoardPage[]>(board.pages);
  const [adding, setAdding] = useState("");
  const dirty = JSON.stringify(pages) !== JSON.stringify(board.pages);

  const rename = (slug: string, title: string) => setPages(pages.map((p) => (p.slug === slug ? { ...p, title } : p)));
  const setTemplate = (slug: string, template: BoardTemplate) => setPages(pages.map((p) => (p.slug === slug ? { ...p, template } : p)));
  const setIntro = (slug: string, intro: string) => setPages(pages.map((p) => (p.slug === slug ? { ...p, intro } : p)));
  const drop = (slug: string) => setPages(pages.filter((p) => p.slug !== slug));

  return (
    <Panel
      title="Páginas del tablero"
      description="Las pestañas con las que se recorre, cada una con su manera de leerse: la rejilla densa del tablero, la columna del narrativo, el contraste del comparativo o la ficha que abre con sus tablas. Un visor vive en una de ellas; si se borra la página, sus visores se quedan sin sitio y dejan de verse."
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
          const template = PAGE_TEMPLATES.find((t) => t.id === page.template);
          return (
            <li key={page.slug}>
              <div className="tb-pages__row">
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
              </div>
              <div className="tb-pages__extra">
                <label className="admin-field">
                  <span>Cómo se lee</span>
                  <select value={page.template} disabled={!canEdit} onChange={(e) => setTemplate(page.slug, e.target.value as BoardTemplate)}>
                    {PAGE_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {template && <small className="oda-field-hint">{template.hint}</small>}
                </label>
                <label className="admin-field admin-field--wide">
                  <span>El texto que la abre <small>opcional</small></span>
                  <input
                    value={page.intro}
                    disabled={!canEdit}
                    onChange={(e) => setIntro(page.slug, e.target.value)}
                    placeholder={page.template === "narrativo" ? "La página se lee de arriba abajo: este texto es la guía." : "Qué se va a encontrar quien la abra."}
                  />
                </label>
              </div>
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
            setPages([...pages, { slug: freeSlug(title, pages.map((p) => p.slug)), title, template: "tablero", intro: "" }]);
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
