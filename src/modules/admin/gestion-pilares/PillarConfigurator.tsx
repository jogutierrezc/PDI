import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePillarDetail, usePillarOwners } from "../../../data/queries";
import { keys } from "../../../data/queries";
import { pillarScope, useCreateRow, useDeleteRow } from "../../../data/mutations";
import { accentFor, formatDate, formatMonth, statusMeta, statusOrder } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type { ActivityStatus, ChangeType } from "../../../types/database";

type ModalType = "area" | "line" | "project" | "activity" | "document" | "change" | "glossary" | null;

const CHANGE_TYPES: ChangeType[] = ["creacion", "modificacion", "reforma", "eliminacion"];
const DOC_KINDS = ["PDF", "XLSX", "DOCX", "CSV", "HTML", "Enlace"];

export function PillarConfigurator() {
  const { slug } = useParams<{ slug: string }>();
  const detail = usePillarDetail(slug);
  const owners = usePillarOwners();
  const { profile, hasRole } = useAuth();

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [error, setError] = useState("");

  const pillarId = detail.data?.pillar.id;

  // Escrituras. Todas invalidan el mismo ámbito: al guardar cualquier cosa, el
  // tablero público y el visor del pilar se refrescan solos.
  const scope = [...pillarScope(), keys.documents(pillarId ?? "none")];
  const createArea = useCreateRow("strategic_areas", scope);
  const createLine = useCreateRow("action_lines", scope);
  const createProject = useCreateRow("projects", scope);
  const createActivity = useCreateRow("activities", scope);
  const createDocument = useCreateRow("documents", scope);
  const createChange = useCreateRow("change_log", scope);
  const createTerm = useCreateRow("glossary_terms", scope);

  const removeArea = useDeleteRow("strategic_areas", scope);
  const removeLine = useDeleteRow("action_lines", scope);
  const removeProject = useDeleteRow("projects", scope);
  const removeActivity = useDeleteRow("activities", scope);
  const removeDocument = useDeleteRow("documents", scope);
  const removeChange = useDeleteRow("change_log", scope);
  const removeTerm = useDeleteRow("glossary_terms", scope);

  const canEdit = useMemo(() => {
    if (hasRole("planeacion")) return true;
    if (!pillarId || !profile) return false;
    return (owners.data ?? []).some(
      (row) => row.pillar_id === pillarId && row.profile_id === profile.id,
    );
  }, [hasRole, owners.data, pillarId, profile]);

  if (detail.isPending) {
    return (
      <AdminShell section="pillars" kicker="Administración" title="Configuración del pilar">
        <LoadingBlock rows={6} />
      </AdminShell>
    );
  }

  if (detail.isError) {
    return (
      <AdminShell section="pillars" kicker="Administración" title="Configuración del pilar">
        <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
      </AdminShell>
    );
  }

  if (!detail.data) {
    return (
      <AdminShell section="pillars" kicker="Administración" title="Pilar no encontrado">
        <p className="admin-empty">
          No existe un pilar con el identificador <code>{slug}</code>.{" "}
          <Link to="/admin/pilares">Volver a la gestión de pilares</Link>.
        </p>
      </AdminShell>
    );
  }

  const { pillar, areas, lines, projects, activities, changes, glossary, documents, indicators } =
    detail.data;
  // v_action_lines trae el área ya resuelta: basta un índice para saber de qué
  // línea y de qué área cuelga cada proyecto.
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const activeArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];

  /** Envuelve una mutación para mostrar el error en la cabecera, no en consola. */
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      setModal(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "No se pudo guardar.");
    }
  }

  return (
    <AdminShell
      section="pillars"
      kicker="Administración · Configuración del pilar"
      title={pillar.name}
      description="Estructura, proyectos, actividades, soportes y trazabilidad del pilar."
      actions={
        <Link className="button-ghost" to="/admin/pilares">
          <span aria-hidden="true">←</span> Volver a pilares
        </Link>
      }
    >
      {!canEdit && <ReadOnlyNotice />}

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}

      <div className="config-layout" style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}>
        <div className="config-main">
          {/* --- Áreas --------------------------------------------------- */}
          <Section
            title="Áreas estratégicas"
            hint="Segundo nivel de la estructura: cada área agrupa sus líneas de acción."
            action={canEdit ? { label: "Nueva área", onClick: () => setModal("area") } : undefined}
          >
            {areas.length === 0 ? (
              <EmptyBlock title="Sin áreas configuradas." />
            ) : (
              <div className="area-grid" role="radiogroup" aria-label="Áreas estratégicas">
                {areas.map((area) => (
                  // El botón de borrar va fuera del selectable: un <button>
                  // dentro de otro <button> no es HTML válido y los lectores de
                  // pantalla no saben cuál anunciar.
                  <div
                    className={`area-card-wrap${activeArea?.id === area.id ? " is-active" : ""}`}
                    key={area.id}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeArea?.id === area.id}
                      className="area-card"
                      onClick={() => setSelectedAreaId(area.id)}
                    >
                      <strong>
                        {area.code ? `${area.code} · ` : ""}
                        {area.name}
                      </strong>
                      <small>{area.description}</small>
                      <em>
                        {area.action_lines.length}{" "}
                        {area.action_lines.length === 1 ? "línea" : "líneas"}
                      </em>
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        className="area-card__remove"
                        aria-label={`Eliminar el área ${area.name} y sus líneas`}
                        onClick={() => void run(() => removeArea.mutateAsync(area.id))}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* --- Líneas -------------------------------------------------- */}
          <Section
            title="Líneas de acción"
            hint={activeArea ? `Dependen de: ${activeArea.name}` : "Crea un área para añadir líneas."}
            action={
              canEdit && activeArea ? { label: "Nueva línea", onClick: () => setModal("line") } : undefined
            }
          >
            {!activeArea || activeArea.action_lines.length === 0 ? (
              <EmptyBlock title="Sin líneas relacionadas todavía." />
            ) : (
              <ul className="record-list">
                {[...activeArea.action_lines]
                  .sort((a, b) => a.position - b.position)
                  .map((line) => (
                    <li key={line.id}>
                      <div>
                        <strong>
                          {line.code ? `${line.code} · ` : ""}
                          {line.name}
                        </strong>
                        <small>{line.progress}% de cumplimiento reportado</small>
                      </div>
                      <span className="progress-track" aria-hidden="true">
                        <span className="progress-track__fill" style={{ width: `${line.progress}%` }} />
                      </span>
                      {canEdit && (
                        <RemoveButton
                          label={`Eliminar ${line.name}`}
                          onClick={() => void run(() => removeLine.mutateAsync(line.id))}
                        />
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          {/* --- Proyectos ----------------------------------------------- */}
          <Section
            title="Proyectos estratégicos"
            hint="Los proyectos responden a las líneas de acción definidas."
            action={canEdit ? { label: "Nuevo proyecto", onClick: () => setModal("project") } : undefined}
          >
            {projects.length === 0 ? (
              <EmptyBlock title="Sin proyectos registrados." />
            ) : (
              <ul className="record-list">
                {projects.map((project) => {
                  const line = project.action_line_id ? lineById.get(project.action_line_id) : undefined;
                  return (
                  <li key={project.id}>
                    <div>
                      <strong>{project.name}</strong>
                      <small>
                        {project.owner || "Sin responsable"} · {formatMonth(project.due_date)} ·{" "}
                        {statusMeta[project.status].label}
                      </small>
                      {/* Sin la línea a la vista no hay forma de detectar en la
                          intranet un proyecto que quedó fuera de la estructura. */}
                      {line ? (
                        <small className="record-lineage">
                          {line.area_name} › {line.code ? `${line.code} · ` : ""}
                          {line.name}
                        </small>
                      ) : (
                        <small className="record-lineage record-lineage--empty">
                          Sin línea de acción · no aparecerá al filtrar por área
                        </small>
                      )}
                    </div>
                    <span className="progress-track" aria-hidden="true">
                      <span
                        className="progress-track__fill"
                        style={{
                          width: `${project.progress}%`,
                          background: statusMeta[project.status].color,
                        }}
                      />
                    </span>
                    {canEdit && (
                      <RemoveButton
                        label={`Eliminar ${project.name}`}
                        onClick={() => void run(() => removeProject.mutateAsync(project.id))}
                      />
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* --- Actividades --------------------------------------------- */}
          <Section
            title="Actividades"
            hint="El avance del pilar sale de contar estas filas: una actividad cumplida suma al porcentaje."
            action={canEdit ? { label: "Nueva actividad", onClick: () => setModal("activity") } : undefined}
          >
            {activities.length === 0 ? (
              <EmptyBlock
                title="Sin actividades"
                hint="Mientras no haya actividades, el pilar aparecerá al 0 % en el tablero."
              />
            ) : (
              <ul className="record-list">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <div>
                      <strong>
                        {activity.title}
                        {activity.is_featured && <span className="record-flag">Destacada</span>}
                      </strong>
                      <small>
                        {activity.owner || "Sin responsable"} · vence {formatMonth(activity.due_date)}
                      </small>
                    </div>
                    <span className={`status-badge status-badge--${activity.status}`}>
                      <span className="status-badge__glyph" aria-hidden="true">
                        {statusMeta[activity.status].glyph}
                      </span>
                      {statusMeta[activity.status].label}
                    </span>
                    {canEdit && (
                      <RemoveButton
                        label={`Eliminar ${activity.title}`}
                        onClick={() => void run(() => removeActivity.mutateAsync(activity.id))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* --- Soportes ------------------------------------------------ */}
          <Section
            title="Soportes y documentos"
            hint="Enlaces a los archivos que respaldan el seguimiento. Los marcados como públicos salen en el repositorio."
            action={canEdit ? { label: "Añadir documento", onClick: () => setModal("document") } : undefined}
          >
            {documents.length === 0 ? (
              <EmptyBlock title="Sin documentos de soporte." />
            ) : (
              <ul className="record-list">
                {documents.map((document) => (
                  <li key={document.id}>
                    <div>
                      <strong>
                        {document.title}
                        {document.is_public && <span className="record-flag">Público</span>}
                      </strong>
                      <small>
                        <a href={document.url} target="_blank" rel="noopener noreferrer">
                          {document.kind} · abrir enlace
                        </a>
                      </small>
                    </div>
                    <span />
                    {canEdit && (
                      <RemoveButton
                        label={`Eliminar ${document.title}`}
                        onClick={() => void run(() => removeDocument.mutateAsync(document.id))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* --- Columna lateral ------------------------------------------- */}
        <aside className="config-side">
          <section className="admin-card">
            <h2>Metadatos del pilar</h2>
            <dl className="meta-list">
              <Meta label="Impulsador" value={pillar.impulsor} />
              <Meta label="Aporta a" value={pillar.contributes} />
              <Meta label="Responsable" value={pillar.management_owner} />
              <Meta label="Cálculo" value={pillar.calculation_owner} />
              <Meta label="Indicadores" value={`${indicators.length} protocolo(s)`} />
            </dl>
            <Link className="button-ghost" to="/admin/pilares">
              Editar identidad del pilar
            </Link>
          </section>

          <Section
            title="Control de cambios"
            action={canEdit ? { label: "Registrar", onClick: () => setModal("change") } : undefined}
            compact
          >
            {changes.length === 0 ? (
              <EmptyBlock title="Sin cambios registrados." />
            ) : (
              <ol className="timeline">
                {changes.map((change) => (
                  <li key={change.id}>
                    <b>
                      {change.change_type} · v{change.version}
                    </b>
                    <time dateTime={change.changed_on}>{formatDate(change.changed_on)}</time>
                    <p>
                      {change.area_code ? `${change.area_code} · ` : ""}
                      {change.description}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        className="timeline__remove"
                        onClick={() => void run(() => removeChange.mutateAsync(change.id))}
                        aria-label={`Eliminar el cambio v${change.version}`}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title="Glosario"
            action={canEdit ? { label: "Término", onClick: () => setModal("glossary") } : undefined}
            compact
          >
            {glossary.length === 0 ? (
              <EmptyBlock title="Sin términos." />
            ) : (
              <dl className="meta-list">
                {glossary.map((item) => (
                  <div key={item.id}>
                    <dt>
                      {item.term}
                      {item.pillar_id === null && <span className="record-flag">Común</span>}
                    </dt>
                    <dd>
                      {item.description}
                      {item.source && <small>Fuente: {item.source}</small>}
                      {canEdit && item.pillar_id !== null && (
                        <button
                          type="button"
                          className="meta-list__remove"
                          onClick={() => void run(() => removeTerm.mutateAsync(item.id))}
                        >
                          Eliminar
                        </button>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </aside>
      </div>

      {/* --- Modales ---------------------------------------------------- */}
      {modal === "area" && pillarId && (
        <FormModal
          title="Nueva área estratégica"
          submitLabel="Crear área"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createArea.mutateAsync({
                pillar_id: pillarId,
                code: values.code || null,
                name: values.name,
                description: values.description ?? "",
                position: areas.length + 1,
              }),
            )
          }
          fields={[
            { name: "name", label: "Nombre del área", required: true, placeholder: "Ej. Infraestructura tecnológica" },
            { name: "code", label: "Código", placeholder: "Ej. AE-04" },
            { name: "description", label: "Descripción", type: "textarea" },
          ]}
        />
      )}

      {modal === "line" && activeArea && (
        <FormModal
          title={`Nueva línea para ${activeArea.name}`}
          submitLabel="Vincular línea"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createLine.mutateAsync({
                area_id: activeArea.id,
                code: values.code || null,
                name: values.name,
                progress: Number(values.progress ?? 0),
                position: activeArea.action_lines.length + 1,
              }),
            )
          }
          fields={[
            { name: "name", label: "Nombre de la línea", required: true, placeholder: "Ej. Modernización de infraestructura" },
            { name: "code", label: "Código", placeholder: "Ej. LA-4.1" },
            { name: "progress", label: "Cumplimiento reportado", type: "range", defaultValue: "0" },
          ]}
        />
      )}

      {modal === "project" && pillarId && (
        <FormModal
          title="Nuevo proyecto estratégico"
          submitLabel="Crear proyecto"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createProject.mutateAsync({
                pillar_id: pillarId,
                action_line_id: values.action_line_id || null,
                name: values.name,
                owner: values.owner ?? "",
                description: values.description ?? "",
                due_date: values.due_date || null,
                progress: Number(values.progress ?? 0),
                status: (values.status as ActivityStatus) ?? "pendiente",
                position: projects.length + 1,
              }),
            )
          }
          fields={[
            { name: "name", label: "Nombre del proyecto", required: true },
            { name: "owner", label: "Responsable", placeholder: "Persona o dependencia" },
            {
              name: "action_line_id",
              label: "Línea de acción",
              type: "select",
              options: [
                { value: "", label: "Sin línea asociada" },
                ...areas.flatMap((area) =>
                  area.action_lines.map((line) => ({
                    value: line.id,
                    label: `${area.name} · ${line.name}`,
                  })),
                ),
              ],
            },
            { name: "description", label: "Descripción", type: "textarea" },
            { name: "due_date", label: "Fecha objetivo", type: "date" },
            {
              name: "status",
              label: "Estado",
              type: "select",
              defaultValue: "pendiente",
              options: statusOrder.map((status) => ({ value: status, label: statusMeta[status].label })),
            },
            { name: "progress", label: "Porcentaje de avance", type: "range", defaultValue: "0" },
          ]}
        />
      )}

      {modal === "activity" && pillarId && (
        <FormModal
          title="Nueva actividad"
          description="El avance del pilar se calcula contando actividades cumplidas sobre el total."
          submitLabel="Crear actividad"
          onClose={() => setModal(null)}
          onSubmit={(values) => {
            const status = (values.status as ActivityStatus) ?? "pendiente";
            return run(() =>
              createActivity.mutateAsync({
                pillar_id: pillarId,
                title: values.title,
                owner: values.owner ?? "",
                due_date: values.due_date || null,
                // La base de datos rechaza "cumplida al 60 %"; se ajusta aquí
                // para que el formulario no falle por una combinación imposible.
                progress: status === "cumplida" ? 100 : Number(values.progress ?? 0),
                status,
                is_featured: values.is_featured === "on",
                position: activities.length + 1,
              }),
            );
          }}
          fields={[
            { name: "title", label: "Título de la actividad", required: true },
            { name: "owner", label: "Responsable" },
            { name: "due_date", label: "Fecha de vencimiento", type: "date" },
            {
              name: "status",
              label: "Estado",
              type: "select",
              defaultValue: "pendiente",
              options: statusOrder.map((status) => ({ value: status, label: statusMeta[status].label })),
            },
            { name: "progress", label: "Porcentaje de avance", type: "range", defaultValue: "0" },
            {
              name: "is_featured",
              label: "Destacar en el tablero público",
              type: "checkbox",
            },
          ]}
        />
      )}

      {modal === "document" && pillarId && (
        <FormModal
          title="Añadir documento de soporte"
          description="El portal guarda el enlace, no el archivo. Sube el documento a la unidad institucional y pega aquí su dirección."
          submitLabel="Añadir documento"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createDocument.mutateAsync({
                pillar_id: pillarId,
                title: values.title,
                description: values.description ?? "",
                kind: values.kind ?? "PDF",
                url: values.url,
                size_label: values.size_label || null,
                is_public: values.is_public === "on",
                published_at: values.is_public === "on" ? new Date().toISOString() : null,
                position: documents.length + 1,
              }),
            )
          }
          fields={[
            { name: "title", label: "Título del documento", required: true },
            {
              name: "url",
              label: "Enlace",
              required: true,
              type: "url",
              placeholder: "https://…",
              hint: "Debe empezar por http:// o https://",
            },
            { name: "description", label: "Descripción", type: "textarea" },
            {
              name: "kind",
              label: "Tipo",
              type: "select",
              defaultValue: "PDF",
              options: DOC_KINDS.map((kind) => ({ value: kind, label: kind })),
            },
            { name: "size_label", label: "Tamaño (informativo)", placeholder: "Ej. 4,2 MB" },
            { name: "is_public", label: "Publicar en el repositorio público", type: "checkbox" },
          ]}
        />
      )}

      {modal === "change" && pillarId && (
        <FormModal
          title="Registrar control de cambios"
          submitLabel="Registrar cambio"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createChange.mutateAsync({
                pillar_id: pillarId,
                indicator_id: values.indicator_id || null,
                area_code: values.area_code ?? "",
                version: values.version,
                approved_by: values.approved_by ?? "",
                changed_on: values.changed_on || new Date().toISOString().slice(0, 10),
                description: values.description ?? "",
                change_type: (values.change_type as ChangeType) ?? "modificacion",
              }),
            )
          }
          fields={[
            { name: "version", label: "Número de versión", required: true, placeholder: "Ej. 1.1" },
            { name: "area_code", label: "Código del área", placeholder: "Ej. AE-04" },
            { name: "approved_by", label: "Aval del cambio", placeholder: "Comité de Planeación" },
            { name: "changed_on", label: "Fecha de modificación", type: "date" },
            { name: "description", label: "Descripción del ajuste", type: "textarea", required: true },
            {
              name: "change_type",
              label: "Tipo de cambio",
              type: "select",
              defaultValue: "modificacion",
              options: CHANGE_TYPES.map((type) => ({ value: type, label: type })),
            },
            {
              name: "indicator_id",
              label: "Indicador relacionado",
              type: "select",
              options: [
                { value: "", label: "Ninguno" },
                ...indicators.map((indicator) => ({
                  value: indicator.id,
                  label: `${indicator.code} · ${indicator.name}`,
                })),
              ],
            },
          ]}
        />
      )}

      {modal === "glossary" && pillarId && (
        <FormModal
          title="Nuevo término del glosario"
          submitLabel="Guardar término"
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(() =>
              createTerm.mutateAsync({
                pillar_id: pillarId,
                term: values.term,
                definition: values.definition ?? "",
                description: values.description ?? "",
                source: values.source || null,
                position: glossary.length + 1,
              }),
            )
          }
          fields={[
            { name: "term", label: "Término", required: true },
            { name: "definition", label: "Definición corta" },
            { name: "description", label: "Descripción", type: "textarea", required: true },
            { name: "source", label: "Fuente (opcional)", placeholder: "Ej. NIST SP 800-207" },
          ]}
        />
      )}
    </AdminShell>
  );
}

/* --- Piezas ---------------------------------------------------------------- */

function Section({
  title,
  hint,
  action,
  compact = false,
  children,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`admin-card${compact ? " admin-card--compact" : ""}`}>
      <header className="admin-card__head">
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {action && (
          <button className="button-ghost" type="button" onClick={action.onClick}>
            <Icon name="plus" size={15} /> {action.label}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label={label}>
      <Icon name="close" size={15} />
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

/* --- Modal de formulario genérico ------------------------------------------
   Los siete diálogos de esta pantalla tenían el mismo esqueleto repetido siete
   veces. Aquí se declara qué campos tiene cada uno y el resto es común: la
   trampa de foco, el cierre con Escape y el bloqueo del fondo vienen de Modal.
   -------------------------------------------------------------------------- */

interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "date" | "range" | "checkbox" | "url";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
}

function FormModal({
  title,
  description,
  submitLabel,
  fields,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  fields: FieldSpec[];
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ""])),
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  return (
    <Modal title={title} description={description} onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        {fields.map((field) => (
          <label className="admin-field" key={field.name}>
            <span>
              {field.label}
              {field.type === "range" && <output>{values[field.name] || 0}%</output>}
            </span>

            {field.type === "textarea" ? (
              <textarea
                rows={3}
                required={field.required}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={(event) => set(field.name, event.target.value)}
              />
            ) : field.type === "select" ? (
              <select value={values[field.name]} onChange={(event) => set(field.name, event.target.value)}>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={values[field.name] === "on"}
                onChange={(event) => set(field.name, event.target.checked ? "on" : "")}
              />
            ) : (
              <input
                type={field.type === "range" ? "range" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
                min={field.type === "range" ? 0 : undefined}
                max={field.type === "range" ? 100 : undefined}
                required={field.required}
                placeholder={field.placeholder}
                value={values[field.name]}
                onChange={(event) => set(field.name, event.target.value)}
              />
            )}

            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}

        <ModalActions onCancel={onClose} submitLabel={saving ? "Guardando…" : submitLabel} />
      </form>
    </Modal>
  );
}
