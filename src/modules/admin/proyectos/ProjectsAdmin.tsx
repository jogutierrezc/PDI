/* =============================================================================
   Módulo de proyectos · administración

   Los proyectos son lo único transversal del plan: uno puede aportar al pilar
   de ambiente tecnológico y al de apropiación social a la vez. Por eso se
   administran aquí y no dentro de "Configurar pilar", que siempre habla de uno.

   El formulario es propio y no el genérico de forms.ts por tres razones que
   aquel no contempla: campos repetibles (vínculos, unidades académicas,
   impactos), una selección múltiple (los ODS) y un archivo que sube a Storage.

   Orden de guardado, que importa: primero la fila —hasta que existe no hay id
   con el que nombrar el archivo ni al que colgar los vínculos—, después los
   vínculos, y al final el archivo. Si el archivo falla, el proyecto ya está
   guardado y se puede reintentar solo la carga.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import { keys, usePillars, useProjects, useStructure } from "../../../data/queries";
import { pillarScope, useRemoveRow, useSaveRow } from "../../../data/mutations";
import {
  accentFor,
  formatCurrency,
  formatRange,
  impactKinds,
  impactTerms,
  sdgById,
  sdgGoals,
  statusMeta,
} from "../../../data/pdi";
import {
  formatBytes,
  projectFileUrl,
  removeProjectFile,
  uploadProjectFile,
} from "../../../data/storage";
import { useAuth } from "../../../lib/auth";
import type { AreaWithLines, PillarWithProgress } from "../../../data/queries";
import type {
  ActivityStatus,
  ProjectImpact,
  ProjectLink,
  ProjectWithLinks,
} from "../../../types/database";
import "./projects.css";

/** Un vínculo mientras se edita: los tres niveles, sin id todavía. */
interface DraftLink {
  pillar_id: string;
  area_id: string;
  action_line_id: string;
}

interface Draft {
  name: string;
  owner: string;
  description: string;
  start_date: string;
  end_date: string;
  academic_units: string[];
  sdg_goals: number[];
  total_value: string;
  status: ActivityStatus;
  progress: string;
  /* Meta en valor absoluto: "28 de 40 convenios". La editaba el formulario
     antiguo del pilar; al mudarse el proyecto aquí, se muda con él. */
  target_value: string;
  achieved_value: string;
  measure_unit: string;
  links: DraftLink[];
  impacts: ProjectImpact[];
}

const emptyLink: DraftLink = { pillar_id: "", area_id: "", action_line_id: "" };

/**
 * La clave por la que dos vínculos son el mismo.
 *
 * Es exactamente el índice único de `project_links` —(project_id, pillar_id,
 * area_id, action_line_id), con `nulls not distinct`—, así que dos filas con la
 * misma terna chocan en la base. El formulario deja añadir cuantas filas se
 * quiera y nada impide elegir dos veces el mismo pilar dejando área y línea en
 * blanco: al guardar, el `upsert` mandaba las dos y Postgres respondía
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" con un 500,
 * porque una sola sentencia no puede tocar la misma fila dos veces.
 *
 * Las cadenas vacías del borrador se normalizan a null, que es como viajan.
 */
function linkKey(link: DraftLink): string {
  return [link.pillar_id, link.area_id || "", link.action_line_id || ""].join("|");
}

/** Los vínculos sin repetir, conservando el primero de cada terna —y con él el
 *  principal, que es el que hereda `projects.pillar_id`—. */
function dedupeLinks(links: DraftLink[]): DraftLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = linkKey(link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const emptyImpact: ProjectImpact = { kind: impactKinds[0], term: impactTerms[0], justification: "" };

function draftFrom(project?: ProjectWithLinks): Draft {
  return {
    name: project?.name ?? "",
    owner: project?.owner ?? "",
    description: project?.description ?? "",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    // Siempre una fila para escribir: un formulario que empieza con la lista
    // vacía obliga a descubrir el botón de "añadir" antes de poder teclear.
    academic_units: project?.academic_units?.length ? project.academic_units : [""],
    sdg_goals: project?.sdg_goals ?? [],
    total_value: project?.total_value != null ? String(project.total_value) : "",
    status: project?.status ?? "pendiente",
    progress: String(project?.progress ?? 0),
    target_value: project?.target_value != null ? String(project.target_value) : "",
    achieved_value: project?.achieved_value != null ? String(project.achieved_value) : "",
    measure_unit: project?.measure_unit ?? "",
    links: project?.links?.length
      ? [...project.links]
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)
          .map((link) => ({
            pillar_id: link.pillar_id,
            area_id: link.area_id ?? "",
            action_line_id: link.action_line_id ?? "",
          }))
      : [{ ...emptyLink }],
    impacts: project?.impacts?.length ? project.impacts : [{ ...emptyImpact }],
  };
}

export function ProjectsAdmin() {
  const projects = useProjects();
  const pillars = usePillars();
  const structure = useStructure();
  const { hasRole } = useAuth();
  const canEdit = hasRole("responsable");

  const [editing, setEditing] = useState<{ project?: ProjectWithLinks } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectWithLinks | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Un proyecto toca varios pilares, así que guardarlo puede mover el avance de
  // cualquiera de ellos: se invalida el ámbito entero, no un pilar.
  const scope = [...pillarScope(), keys.structure()];
  const save = useSaveRow(scope);
  const remove = useRemoveRow(scope);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pillarById = useMemo(
    () => new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar])),
    [pillars.data],
  );

  async function submit(draft: Draft, file: File | null, dropFile: boolean) {
    setError("");

    // El primer vínculo con pilar manda: hereda projects.pillar_id, que es lo
    // que decide quién puede editar el proyecto.
    //
    // Y sin repetidos: dos filas con el mismo pilar, área y línea son el mismo
    // vínculo para la base, y mandarlas juntas hacía fallar el guardado entero.
    const links = dedupeLinks(draft.links.filter((link) => link.pillar_id !== ""));
    if (links.length === 0) {
      setError("Un proyecto necesita al menos un pilar. Añade un vínculo antes de guardar.");
      return;
    }

    const primary = links[0];
    const previous = editing?.project;

    try {
      const row = (await save.mutateAsync({
        table: "projects",
        id: previous?.id,
        values: {
          pillar_id: primary.pillar_id,
          action_line_id: primary.action_line_id || null,
          name: draft.name.trim(),
          owner: draft.owner.trim(),
          description: draft.description.trim(),
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          // La fecha objetivo del modelo anterior es la de finalización: se
          // mantiene sincronizada para que las listas que ya la muestran no se
          // queden en blanco.
          due_date: draft.end_date || null,
          target_value: draft.target_value.trim() === "" ? null : Number(draft.target_value),
          achieved_value: draft.achieved_value.trim() === "" ? null : Number(draft.achieved_value),
          measure_unit: draft.measure_unit.trim() || null,
          academic_units: draft.academic_units.map((unit) => unit.trim()).filter(Boolean),
          sdg_goals: [...draft.sdg_goals].sort((a, b) => a - b),
          total_value: draft.total_value.trim() === "" ? null : Number(draft.total_value),
          status: draft.status,
          progress: draft.status === "cumplida" ? 100 : Number(draft.progress || 0),
          // Las filas sin justificación son el andamio del formulario.
          impacts: draft.impacts.filter((impact) => impact.justification.trim() !== ""),
          position: previous?.position ?? (projects.data?.length ?? 0) + 1,
          ...(dropFile
            ? { attachment_path: null, attachment_name: null, attachment_size: null }
            : {}),
        },
        // Los vínculos se rehacen enteros: son cuatro filas y compararlas una a
        // una costaría más código del que ahorra.
        children: (projectId) => ({
          table: "project_links" as const,
          onConflict: "project_id,pillar_id,area_id,action_line_id",
          removeIds: (previous?.links ?? []).map((link) => link.id),
          upsert: links.map((link, index) => ({
            project_id: projectId,
            pillar_id: link.pillar_id,
            area_id: link.area_id || null,
            action_line_id: link.action_line_id || null,
            is_primary: index === 0,
            position: index + 1,
          })),
        }),
      })) as { id: string };

      if (dropFile && previous?.attachment_path) {
        await removeProjectFile(previous.attachment_path);
      }

      if (file) {
        const stored = await uploadProjectFile(row.id, file);
        await save.mutateAsync({
          table: "projects",
          id: row.id,
          values: {
            attachment_path: stored.path,
            attachment_name: stored.name,
            attachment_size: stored.size,
          },
        });
        // El anterior deja de estar referenciado: sin este borrado el bucket
        // acumula archivos que ya no encuentra nadie.
        if (previous?.attachment_path && previous.attachment_path !== stored.path) {
          await removeProjectFile(previous.attachment_path);
        }
      }

      setNotice(previous ? `Se guardó “${draft.name}”.` : `Se creó “${draft.name}”.`);
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el proyecto.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError("");
    try {
      await remove.mutateAsync({ table: "projects", id: pendingDelete.id });
      await removeProjectFile(pendingDelete.attachment_path);
      setNotice(`Se eliminó “${pendingDelete.name}”.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AdminShell
      section="projects"
      kicker="Administración · Portafolio"
      title="Proyectos"
      description="Proyectos del plan, con sus pilares, sus impactos y su documento de formulación. Un proyecto puede aportar a varios pilares."
      actions={
        canEdit ? (
          <button className="button-primary" type="button" onClick={() => setEditing({})}>
            <Icon name="plus" size={16} /> Nuevo proyecto
          </button>
        ) : undefined
      }
    >
      {!canEdit && <ReadOnlyNotice />}

      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} />
          {notice}
        </p>
      )}

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      {projects.isPending ? (
        <CardSkeleton count={3} />
      ) : projects.isError ? (
        <ErrorBlock error={projects.error} onRetry={() => void projects.refetch()} />
      ) : projects.data.length === 0 ? (
        <EmptyBlock
          title="Todavía no hay proyectos"
          hint="Un proyecto reúne su formulación —fechas, valor, ODS e impactos— y los pilares a los que aporta."
        />
      ) : (
        <ul className="project-list">
          {projects.data.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              pillarById={pillarById}
              structure={structure.data ?? []}
              onEdit={canEdit ? () => setEditing({ project }) : undefined}
              onRemove={canEdit ? () => setPendingDelete(project) : undefined}
            />
          ))}
        </ul>
      )}

      {editing && (
        <ProjectForm
          project={editing.project}
          pillars={pillars.data ?? []}
          structure={structure.data ?? []}
          pending={save.isPending}
          onSubmit={submit}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <Modal
          title="Eliminar proyecto"
          description={`“${pendingDelete.name}” se eliminará junto con sus vínculos y su archivo. Los indicadores que cuelgan de él quedarán sin proyecto, no se borran.`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="modal-actions">
            <button className="button-ghost" type="button" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button
              className="button-danger"
              type="button"
              onClick={confirmDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar proyecto"}
            </button>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

/* --- Ficha de la lista ------------------------------------------------------ */

function ProjectCard({
  project,
  pillarById,
  structure,
  onEdit,
  onRemove,
}: {
  project: ProjectWithLinks;
  pillarById: Map<string, PillarWithProgress>;
  structure: AreaWithLines[];
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const meta = statusMeta[project.status];
  const fileUrl = projectFileUrl(project.attachment_path);

  return (
    <li className="project-card card">
      <header className="project-card__head">
        <div>
          <h2>{project.name}</h2>
          <p>{project.description || "Sin descripción."}</p>
        </div>
        <span className={`status-badge status-badge--${project.status}`}>
          <span className="status-badge__glyph" aria-hidden="true">
            {meta.glyph}
          </span>
          {meta.label}
        </span>
      </header>

      <dl className="project-card__facts">
        <div>
          <dt>Vigencia</dt>
          <dd>{formatRange(project.start_date, project.end_date)}</dd>
        </div>
        <div>
          <dt>Valor total</dt>
          <dd>{formatCurrency(project.total_value)}</dd>
        </div>
        <div>
          <dt>Responsable</dt>
          <dd>{project.owner || "—"}</dd>
        </div>
        <div>
          <dt>Avance</dt>
          <dd>{project.progress} %</dd>
        </div>
      </dl>

      {project.academic_units && project.academic_units.length > 0 && (
        <p className="project-card__units">
          <Icon name="user" size={14} />
          {project.academic_units.join(" · ")}
        </p>
      )}

      <LinkTrail links={project.links} pillarById={pillarById} structure={structure} />

      {project.sdg_goals && project.sdg_goals.length > 0 && <SdgRow goals={project.sdg_goals} />}

      {project.impacts.length > 0 && (
        <div className="table-scroll">
          <table className="result-table project-impacts">
            <caption className="sr-only">Impactos declarados de {project.name}</caption>
            <thead>
              <tr>
                <th scope="col">Tipo de impacto</th>
                <th scope="col">Plazo</th>
                <th scope="col">Justificación</th>
              </tr>
            </thead>
            <tbody>
              {project.impacts.map((impact, index) => (
                <tr key={index}>
                  <th scope="row">{impact.kind}</th>
                  <td>{impact.term}</td>
                  <td>{impact.justification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="project-card__foot">
        {fileUrl ? (
          <a className="button-ghost" href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="document" size={15} />
            {project.attachment_name ?? "Documento"}
            {project.attachment_size ? ` · ${formatBytes(project.attachment_size)}` : ""}
          </a>
        ) : (
          <span className="project-card__nofile">Sin documento cargado</span>
        )}

        {(onEdit || onRemove) && (
          <span className="row-actions">
            {onEdit && (
              <button className="button-ghost" type="button" onClick={onEdit}>
                <Icon name="settings" size={15} /> Editar
              </button>
            )}
            {onRemove && (
              <button
                className="icon-button icon-button--danger"
                type="button"
                onClick={onRemove}
                aria-label={`Eliminar el proyecto ${project.name}`}
                title="Eliminar"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </span>
        )}
      </footer>
    </li>
  );
}

/** Los vínculos como cadenas pilar › área › línea. Es lo que hace visible que
 *  un proyecto aporta a varios frentes sin abrir el formulario. */
function LinkTrail({
  links,
  pillarById,
  structure,
}: {
  links: ProjectLink[];
  pillarById: Map<string, PillarWithProgress>;
  structure: AreaWithLines[];
}) {
  if (links.length === 0) {
    return <p className="project-card__nofile">Sin pilares vinculados.</p>;
  }

  const areaById = new Map(structure.map((area) => [area.id, area]));
  const lineById = new Map(
    structure.flatMap((area) => area.action_lines.map((line) => [line.id, line] as const)),
  );

  return (
    <ul className="link-trail">
      {links.map((link) => {
        const pillar = pillarById.get(link.pillar_id);
        const area = link.area_id ? areaById.get(link.area_id) : undefined;
        const line = link.action_line_id ? lineById.get(link.action_line_id) : undefined;

        return (
          <li
            key={link.id}
            style={{ "--accent": accentFor(pillar?.accent_slot) } as React.CSSProperties}
          >
            <strong>{pillar?.name ?? "Pilar"}</strong>
            {area && (
              <>
                <i aria-hidden="true">›</i>
                <span>
                  {area.code ? `${area.code} · ` : ""}
                  {area.name}
                </span>
              </>
            )}
            {line && (
              <>
                <i aria-hidden="true">›</i>
                <span>
                  {line.code ? `${line.code} · ` : ""}
                  {line.name}
                </span>
              </>
            )}
            {link.is_primary && <em title="Pilar desde el que se administra">principal</em>}
          </li>
        );
      })}
    </ul>
  );
}

function SdgRow({ goals }: { goals: number[] }) {
  return (
    <ul className="sdg-row" aria-label="Objetivos de Desarrollo Sostenible">
      {goals.map((id) => {
        const goal = sdgById.get(id);
        if (!goal) return null;
        return (
          <li key={id} style={{ "--sdg": goal.color } as React.CSSProperties}>
            <b>{id}</b>
            <span>{goal.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* --- Formulario ------------------------------------------------------------- */

function ProjectForm({
  project,
  pillars,
  structure,
  pending,
  onSubmit,
  onClose,
}: {
  project?: ProjectWithLinks;
  pillars: PillarWithProgress[];
  structure: AreaWithLines[];
  pending: boolean;
  onSubmit: (draft: Draft, file: File | null, dropFile: boolean) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(project));
  const [file, setFile] = useState<File | null>(null);
  const [dropFile, setDropFile] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /* --- Vínculos ---------------------------------------------------------- */

  function setLink(index: number, patch: Partial<DraftLink>) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((link, i) => {
        if (i !== index) return link;
        const next = { ...link, ...patch };
        // Cambiar de pilar invalida el área, y cambiar de área invalida la
        // línea: dejarlas puestas guardaría una pareja imposible.
        if (patch.pillar_id !== undefined) return { ...next, area_id: "", action_line_id: "" };
        if (patch.area_id !== undefined) return { ...next, action_line_id: "" };
        return next;
      }),
    }));
  }

  const areasOf = (pillarId: string) => structure.filter((area) => area.pillar_id === pillarId);
  const linesOf = (areaId: string) =>
    (structure.find((area) => area.id === areaId)?.action_lines ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(draft, file, dropFile);
  }

  const currentFile = project?.attachment_name && !dropFile ? project : null;

  return (
    <Modal
      size="wide"
      title={project ? "Editar proyecto" : "Nuevo proyecto"}
      description="Un proyecto puede apuntar a varios pilares. El primer vínculo es el principal: desde ese pilar se administra."
      onClose={onClose}
    >
      <form className="modal-form modal-form--wide" onSubmit={handleSubmit}>
        <label className="admin-field admin-field--wide">
          <span>Título del proyecto</span>
          <input required value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </label>

        <div className="field-pair">
          <label className="admin-field">
            <span>Fecha de inicio</span>
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Fecha de finalización</span>
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => set("end_date", e.target.value)}
            />
          </label>
        </div>

        {/* --- Unidades académicas ----------------------------------------- */}
        <Repeatable
          legend="Programas o unidades académicas"
          hint="Quién responde por el proyecto. Puedes registrar uno o varios."
          addLabel="Añadir unidad"
          rows={draft.academic_units}
          onAdd={() => set("academic_units", [...draft.academic_units, ""])}
          onRemove={(index) =>
            set(
              "academic_units",
              draft.academic_units.length === 1
                ? [""]
                : draft.academic_units.filter((_, i) => i !== index),
            )
          }
          render={(unit, index) => (
            <label>
              <span className="sr-only">Unidad académica {index + 1}</span>
              <input
                value={unit}
                placeholder="Ej. Facultad de Ingeniería · Programa de Sistemas"
                onChange={(e) =>
                  set(
                    "academic_units",
                    draft.academic_units.map((value, i) => (i === index ? e.target.value : value)),
                  )
                }
              />
            </label>
          )}
        />

        {/* --- ODS: selección múltiple -------------------------------------
             La casilla nativa se oculta (`sr-only`, sigue existiendo para el
             teclado y el lector de pantalla) porque `.admin-field input` la
             estiraba al ancho del campo y tapaba el número y el nombre del
             objetivo: solo se veían recuadros. Lo que marca el estado es la
             tarjeta entera —borde, fondo y palomita—, no la casilla. -------- */}
        <fieldset className="admin-field sdg-picker">
          <legend>Objetivos de Desarrollo Sostenible</legend>
          <div className="sdg-picker__head">
            <small>Marca todos a los que aporta el proyecto.</small>
            <span className="sdg-picker__count" aria-live="polite">
              {draft.sdg_goals.length === 0
                ? "Ninguno seleccionado"
                : `${draft.sdg_goals.length} de ${sdgGoals.length} seleccionados`}
            </span>
            {draft.sdg_goals.length > 0 && (
              <button type="button" className="button-ghost" onClick={() => set("sdg_goals", [])}>
                Limpiar selección
              </button>
            )}
          </div>

          <div className="sdg-picker__grid">
            {sdgGoals.map((goal) => {
              const checked = draft.sdg_goals.includes(goal.id);
              return (
                <label
                  key={goal.id}
                  className={`sdg-chip${checked ? " is-on" : ""}`}
                  style={{ "--sdg": goal.color } as React.CSSProperties}
                >
                  <input
                    className="sr-only"
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      set(
                        "sdg_goals",
                        checked
                          ? draft.sdg_goals.filter((id) => id !== goal.id)
                          : [...draft.sdg_goals, goal.id].sort((a, b) => a - b),
                      )
                    }
                  />
                  <b aria-hidden="true">{goal.id}</b>
                  <span className="sdg-chip__label">
                    <span className="sr-only">ODS {goal.id}: </span>
                    {goal.label}
                  </span>
                  <span className="sdg-chip__mark" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                </label>
              );
            })}
          </div>

          {draft.sdg_goals.length > 0 && (
            <p className="sdg-picker__summary">
              Aporta a: {draft.sdg_goals.map((id) => sdgById.get(id)?.label ?? `ODS ${id}`).join(" · ")}
            </p>
          )}
        </fieldset>

        <label className="admin-field">
          <span>Valor total del proyecto</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={draft.total_value}
            onChange={(e) => set("total_value", e.target.value)}
            placeholder="Ej. 120000000"
          />
          <small>En pesos. Se muestra formateado en la ficha.</small>
        </label>

        {/* --- Vínculos ---------------------------------------------------- */}
        <fieldset className="admin-field link-fields">
          <legend>Pilares, áreas estratégicas y líneas de acción</legend>
          <small>
            El primero es el principal. El avance del proyecto cuenta en todas las líneas que
            vincules, así que vincula solo aquellas a las que aporta de verdad.
          </small>

          {draft.links.map((link, index) => {
            // ¿Esta fila repite una anterior? Se marca aquí en vez de dejar que
            // el guardado la descarte en silencio: quien la capturó cree que
            // añadió un aporte más y merece saber que no lo es.
            const repeated =
              link.pillar_id !== "" &&
              draft.links.slice(0, index).some((other) => linkKey(other) === linkKey(link));

            return (
            <div className={`link-row${repeated ? " is-repeated" : ""}`} key={index}>
              <label>
                <span>Pilar {index === 0 ? "(principal)" : ""}</span>
                <select
                  value={link.pillar_id}
                  onChange={(e) => setLink(index, { pillar_id: e.target.value })}
                >
                  <option value="">Selecciona un pilar…</option>
                  {pillars.map((pillar) => (
                    <option key={pillar.id} value={pillar.id}>
                      {pillar.numeral ? `${pillar.numeral} · ` : ""}
                      {pillar.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Acción estratégica</span>
                <select
                  value={link.area_id}
                  disabled={!link.pillar_id}
                  onChange={(e) => setLink(index, { area_id: e.target.value })}
                >
                  <option value="">Todo el pilar</option>
                  {areasOf(link.pillar_id).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.code ? `${area.code} · ` : ""}
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Línea de acción</span>
                <select
                  value={link.action_line_id}
                  disabled={!link.area_id}
                  onChange={(e) => setLink(index, { action_line_id: e.target.value })}
                >
                  <option value="">Toda el área</option>
                  {linesOf(link.area_id).map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.code ? `${line.code} · ` : ""}
                      {line.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="icon-button icon-button--danger"
                onClick={() =>
                  set(
                    "links",
                    draft.links.length === 1
                      ? [{ ...emptyLink }]
                      : draft.links.filter((_, i) => i !== index),
                  )
                }
                aria-label={`Quitar el vínculo ${index + 1}`}
                title="Quitar"
              >
                <Icon name="close" size={14} />
              </button>

              {repeated && (
                <p className="link-row__repeated">
                  <Icon name="alert" size={13} />
                  Repite un vínculo de más arriba. Al guardar se conserva uno solo: elige otra
                  línea de acción o quita esta fila.
                </p>
              )}
            </div>
            );
          })}

          <button
            className="button-ghost author-add"
            type="button"
            onClick={() => set("links", [...draft.links, { ...emptyLink }])}
          >
            <Icon name="plus" size={15} /> Añadir pilar
          </button>
        </fieldset>

        <label className="admin-field">
          <span>Descripción corta</span>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Qué hace el proyecto y para quién, en dos o tres líneas."
          />
        </label>

        <label className="admin-field">
          <span>Responsable</span>
          <input
            value={draft.owner}
            onChange={(e) => set("owner", e.target.value)}
            placeholder="Persona o dependencia"
          />
        </label>

        {/* --- Impactos ---------------------------------------------------- */}
        <fieldset className="admin-field impact-fields">
          <legend>Impactos del proyecto</legend>
          <small>Una fila por impacto declarado. Sin justificación, la fila no se guarda.</small>

          {draft.impacts.map((impact, index) => (
            <div className="impact-row" key={index}>
              <label>
                <span>Tipo de impacto</span>
                <select
                  value={impact.kind}
                  onChange={(e) =>
                    set(
                      "impacts",
                      draft.impacts.map((row, i) =>
                        i === index ? { ...row, kind: e.target.value } : row,
                      ),
                    )
                  }
                >
                  {impactKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Tipo de plazo</span>
                <select
                  value={impact.term}
                  onChange={(e) =>
                    set(
                      "impacts",
                      draft.impacts.map((row, i) =>
                        i === index ? { ...row, term: e.target.value } : row,
                      ),
                    )
                  }
                >
                  {impactTerms.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </label>

              <label className="impact-row__why">
                <span>Justificación</span>
                <textarea
                  rows={2}
                  value={impact.justification}
                  onChange={(e) =>
                    set(
                      "impacts",
                      draft.impacts.map((row, i) =>
                        i === index ? { ...row, justification: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Por qué se espera ese impacto y en qué se notará."
                />
              </label>

              <button
                type="button"
                className="icon-button icon-button--danger"
                onClick={() =>
                  set(
                    "impacts",
                    draft.impacts.length === 1
                      ? [{ ...emptyImpact }]
                      : draft.impacts.filter((_, i) => i !== index),
                  )
                }
                aria-label={`Quitar el impacto ${index + 1}`}
                title="Quitar"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}

          <button
            className="button-ghost author-add"
            type="button"
            onClick={() => set("impacts", [...draft.impacts, { ...emptyImpact }])}
          >
            <Icon name="plus" size={15} /> Añadir impacto
          </button>
        </fieldset>

        {/* --- Archivo ------------------------------------------------------ */}
        <fieldset className="admin-field file-field">
          <legend>Documento del proyecto</legend>

          {currentFile && (
            <p className="file-field__current">
              <Icon name="document" size={15} />
              <a
                href={projectFileUrl(currentFile.attachment_path) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                {currentFile.attachment_name}
              </a>
              <small>{formatBytes(currentFile.attachment_size)}</small>
              <button type="button" className="button-ghost" onClick={() => setDropFile(true)}>
                Quitar
              </button>
            </p>
          )}

          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <small>
            {currentFile
              ? "Si eliges otro, reemplaza al actual."
              : "PDF, Office, ZIP o imagen. Máximo 25 MB."}
          </small>
        </fieldset>

        {/* --- Meta en valor absoluto --------------------------------------
            Opcional. Mientras esté vacía, el cuadro de mando cuenta
            indicadores en su lugar. --------------------------------------- */}
        <fieldset className="admin-field target-fields">
          <legend>Meta del proyecto</legend>
          <small>
            Opcional y en valor absoluto: “28 de 40 convenios”. Sin ella, el cuadro de mando cuenta
            indicadores.
          </small>
          <div className="target-row">
            <label>
              <span>Meta</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={draft.target_value}
                onChange={(e) => set("target_value", e.target.value)}
                placeholder="40"
              />
            </label>
            <label>
              <span>Alcanzado</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={draft.achieved_value}
                onChange={(e) => set("achieved_value", e.target.value)}
                placeholder="28"
              />
            </label>
            <label>
              <span>Unidad</span>
              <input
                value={draft.measure_unit}
                onChange={(e) => set("measure_unit", e.target.value)}
                placeholder="convenios"
              />
            </label>
          </div>
        </fieldset>

        <div className="field-pair">
          <label className="admin-field">
            <span>Estado</span>
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value as ActivityStatus)}
            >
              {(Object.keys(statusMeta) as ActivityStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusMeta[status].label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>
              Avance reportado <output>{draft.progress || 0}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.progress}
              onChange={(e) => set("progress", e.target.value)}
            />
            <small>Se usa mientras el proyecto no tenga indicadores propios.</small>
          </label>
        </div>

        <ModalActions onCancel={onClose} submitLabel={pending ? "Guardando…" : "Guardar proyecto"} />
      </form>
    </Modal>
  );
}

/** Lista de filas con "añadir" y "quitar", que aquí se repite tres veces. */
function Repeatable<T>({
  legend,
  hint,
  addLabel,
  rows,
  onAdd,
  onRemove,
  render,
}: {
  legend: string;
  hint: string;
  addLabel: string;
  rows: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  render: (row: T, index: number) => React.ReactNode;
}) {
  return (
    <fieldset className="admin-field author-fields">
      <legend>{legend}</legend>
      <small>{hint}</small>

      {rows.map((row, index) => (
        <div className="author-row" key={index}>
          {render(row, index)}
          <button
            type="button"
            className="icon-button icon-button--danger"
            onClick={() => onRemove(index)}
            aria-label={`Quitar la fila ${index + 1}`}
            title="Quitar"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}

      <button className="button-ghost author-add" type="button" onClick={onAdd}>
        <Icon name="plus" size={15} /> {addLabel}
      </button>
    </fieldset>
  );
}
