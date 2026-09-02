import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { keys, usePillarDetail, usePillarOwners } from "../../../data/queries";
import { pillarScope, useRemoveRow, useSaveRow } from "../../../data/mutations";
import { accentFor, formatDate, formatMonth, statusMeta } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import { buildForm, tableFor } from "./forms";
import type { EntityKind, FieldSpec, FormConfig, Values } from "./forms";
import type { WritableTable } from "../../../data/mutations";

/** Qué diálogo está abierto y sobre qué fila. Sin fila = alta. */
type ModalState = { kind: EntityKind; entity?: Record<string, unknown> } | null;

export function PillarConfigurator() {
  const { slug } = useParams<{ slug: string }>();
  const detail = usePillarDetail(slug);
  const owners = usePillarOwners();
  const { profile, hasRole } = useAuth();

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pillarId = detail.data?.pillar.id;

  // Al guardar cualquier cosa se refrescan el tablero público, el visor del
  // pilar y esta misma pantalla: el control de cambios lo rellena la base de
  // datos y hay que volver a leerlo.
  const scope = [...pillarScope(), keys.documents(pillarId ?? "none")];
  const save = useSaveRow(scope);
  const remove = useRemoveRow(scope);

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

  const { pillar, areas, lines, projectProgress, projects, activities, changes, glossary, documents, indicators } =
    detail.data;
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const activeArea = areas.find((area) => area.id === selectedAreaId) ?? areas[0];
  // Las líneas se leen de la vista, no del embebido de la tabla: la vista trae
  // el avance en cascada, que es el que se publica.
  const areaLines = activeArea
    ? lines.filter((line) => line.area_id === activeArea.id).sort((a, b) => a.position - b.position)
    : [];
  const projectStats = new Map(projectProgress.map((row) => [row.project_id, row]));

  /** Envuelve una escritura para mostrar el resultado en la cabecera. */
  async function run(action: () => Promise<unknown>, message: string) {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      setModal(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "No se pudo guardar.");
    }
  }

  function open(kind: EntityKind, entity?: Record<string, unknown>) {
    setError("");
    setModal({ kind, entity });
  }

  function removeRow(kind: EntityKind, id: string, message: string) {
    return run(() => remove.mutateAsync({ table: tableFor[kind] as WritableTable, id }), message);
  }

  const formConfig: FormConfig | null = modal
    ? buildForm(modal.kind, {
        pillarId: pillar.id,
        pillarName: pillar.name,
        areas,
        lines,
        indicators,
        projects,
        activities,
        documents,
        activeAreaId: activeArea?.id,
        entity: modal.entity,
      })
    : null;

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

      <div
        className="config-layout"
        style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
      >
        <div className="config-main">
          {/* --- Áreas --------------------------------------------------- */}
          <Section
            title="Áreas estratégicas"
            hint="Segundo nivel de la estructura: cada área agrupa sus líneas de acción."
            action={canEdit ? { label: "Nueva área", onClick: () => open("area") } : undefined}
          >
            {areas.length === 0 ? (
              <EmptyBlock title="Sin áreas configuradas." />
            ) : (
              <div className="area-grid" role="radiogroup" aria-label="Áreas estratégicas">
                {areas.map((area) => (
                  // El botón de seleccionar y los de editar/borrar van
                  // separados: un <button> dentro de otro no es HTML válido.
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
                      <span className="area-card__actions">
                        <IconAction
                          icon="settings"
                          label={`Editar el área ${area.name}`}
                          onClick={() => open("area", area as unknown as Record<string, unknown>)}
                        />
                        <IconAction
                          icon="close"
                          danger
                          label={`Eliminar el área ${area.name} y sus líneas`}
                          onClick={() =>
                            void removeRow("area", area.id, `Se eliminó el área “${area.name}”.`)
                          }
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* --- Líneas -------------------------------------------------- */}
          <Section
            title="Líneas de acción"
            hint={
              activeArea
                ? `Dependen de: ${activeArea.name}. El avance del área es el promedio de sus líneas.`
                : "Crea un área para añadir líneas."
            }
            action={
              canEdit && activeArea ? { label: "Nueva línea", onClick: () => open("line") } : undefined
            }
          >
            {!activeArea || areaLines.length === 0 ? (
              <EmptyBlock title="Sin líneas relacionadas todavía." />
            ) : (
              <ul className="record-list">
                {areaLines.map((line) => (
                    <li key={line.id}>
                      <div>
                        <strong>
                          {line.code ? `${line.code} · ` : ""}
                          {line.name}
                        </strong>
                        {/* Se muestra el valor en cascada, que es el que ve el
                            portal, y se aclara de dónde sale: si no, alguien
                            edita el reporte y no entiende por qué no cambia. */}
                        <small>
                          {line.progress}%{" "}
                          {line.is_derived
                            ? `· promedio de ${line.project_count} ${line.project_count === 1 ? "proyecto" : "proyectos"}`
                            : "· cumplimiento reportado"}
                        </small>
                      </div>
                      <span className="progress-track" aria-hidden="true">
                        <span className="progress-track__fill" style={{ width: `${line.progress}%` }} />
                      </span>
                      {canEdit && (
                        <RowActions
                          onEdit={() =>
                            open("line", {
                              ...line,
                              area_id: activeArea.id,
                            } as unknown as Record<string, unknown>)
                          }
                          editLabel={`Editar la línea ${line.name}`}
                          onRemove={() =>
                            void removeRow("line", line.id, `Se eliminó la línea “${line.name}”.`)
                          }
                          removeLabel={`Eliminar la línea ${line.name}`}
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
            hint="Cada alta y cada actualización deja su registro en el control de cambios."
            action={canEdit ? { label: "Nuevo proyecto", onClick: () => open("project") } : undefined}
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
                          {statusMeta[project.status].label} ·{" "}
                          {projectStats.get(project.id)?.progress ?? project.progress}%
                          {projectStats.get(project.id)?.is_derived
                            ? ` (promedio de ${projectStats.get(project.id)?.activity_count} actividades)`
                            : ""}
                        </small>
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
                            width: `${projectStats.get(project.id)?.progress ?? project.progress}%`,
                            background: statusMeta[project.status].color,
                          }}
                        />
                      </span>
                      {canEdit && (
                        <RowActions
                          onEdit={() => open("project", project as unknown as Record<string, unknown>)}
                          editLabel={`Editar el proyecto ${project.name}`}
                          onRemove={() =>
                            void removeRow("project", project.id, `Se eliminó “${project.name}”.`)
                          }
                          removeLabel={`Eliminar el proyecto ${project.name}`}
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
            action={canEdit ? { label: "Nueva actividad", onClick: () => open("activity") } : undefined}
          >
            {activities.length === 0 ? (
              <EmptyBlock
                title="Sin actividades"
                hint="Mientras no haya actividades, el pilar aparecerá al 0 % en el tablero."
              />
            ) : (
              <ul className="record-list">
                {activities.map((activity) => {
                  const line = activity.action_line_id
                    ? lineById.get(activity.action_line_id)
                    : undefined;
                  return (
                    <li key={activity.id}>
                      <div>
                        <strong>
                          {activity.title}
                          {activity.is_featured && <span className="record-flag">Destacada</span>}
                        </strong>
                        <small>
                          {activity.owner || "Sin responsable"} · vence {formatMonth(activity.due_date)}{" "}
                          · {activity.progress}%
                        </small>
                        {line && (
                          <small className="record-lineage">
                            {line.area_name} › {line.code ? `${line.code} · ` : ""}
                            {line.name}
                          </small>
                        )}
                      </div>
                      <span className={`status-badge status-badge--${activity.status}`}>
                        <span className="status-badge__glyph" aria-hidden="true">
                          {statusMeta[activity.status].glyph}
                        </span>
                        {statusMeta[activity.status].label}
                      </span>
                      {canEdit && (
                        <RowActions
                          onEdit={() => open("activity", activity as unknown as Record<string, unknown>)}
                          editLabel={`Editar la actividad ${activity.title}`}
                          onRemove={() =>
                            void removeRow("activity", activity.id, `Se eliminó “${activity.title}”.`)
                          }
                          removeLabel={`Eliminar la actividad ${activity.title}`}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* --- Soportes ------------------------------------------------ */}
          <Section
            title="Soportes y documentos"
            hint="Enlaces a los archivos que respaldan el seguimiento, ubicados en su área y su línea."
            action={canEdit ? { label: "Añadir documento", onClick: () => open("document") } : undefined}
          >
            {documents.length === 0 ? (
              <EmptyBlock title="Sin documentos de soporte." />
            ) : (
              <ul className="record-list">
                {documents.map((document) => {
                  const line = document.action_line_id
                    ? lineById.get(document.action_line_id)
                    : undefined;
                  const area = areas.find((item) => item.id === document.area_id);
                  return (
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
                        {(area || line) && (
                          <small className="record-lineage">
                            {area?.name ?? line?.area_name}
                            {line ? ` › ${line.code ? `${line.code} · ` : ""}${line.name}` : ""}
                          </small>
                        )}
                      </div>
                      <span />
                      {canEdit && (
                        <RowActions
                          onEdit={() => open("document", document as unknown as Record<string, unknown>)}
                          editLabel={`Editar el documento ${document.title}`}
                          onRemove={() =>
                            void removeRow("document", document.id, `Se eliminó “${document.title}”.`)
                          }
                          removeLabel={`Eliminar el documento ${document.title}`}
                        />
                      )}
                    </li>
                  );
                })}
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
            hint="Las entradas de proyectos y actividades se escriben solas al guardar."
            action={canEdit ? { label: "Registrar", onClick: () => open("change") } : undefined}
            compact
          >
            {changes.length === 0 ? (
              <EmptyBlock title="Sin cambios registrados." />
            ) : (
              <ol className="timeline">
                {changes.map((change) => {
                  const target =
                    change.project_name ?? change.activity_title ?? change.indicator_code ?? null;
                  // Solo se editan las entradas manuales: reescribir una traza
                  // automática destruiría el registro de lo que pasó.
                  const isAutomatic = Boolean(change.project_id || change.activity_id);

                  return (
                    <li key={change.id}>
                      <b>
                        {change.change_type} · v{change.version}
                      </b>
                      <time dateTime={change.changed_on}>{formatDate(change.changed_on)}</time>
                      {target && <span className="timeline__target">{target}</span>}
                      <p>
                        {change.area_code ? `${change.area_code} · ` : ""}
                        {change.description}
                      </p>
                      <small className="timeline__actor">
                        {change.approved_by}
                        {isAutomatic ? " · registro automático" : ""}
                      </small>
                      {canEdit && !isAutomatic && (
                        <span className="timeline__actions">
                          <IconAction
                            icon="settings"
                            label={`Editar el registro v${change.version}`}
                            onClick={() => open("change", change as unknown as Record<string, unknown>)}
                          />
                          <IconAction
                            icon="close"
                            danger
                            label={`Eliminar el registro v${change.version}`}
                            onClick={() =>
                              void removeRow("change", change.id, "Se eliminó el registro de cambio.")
                            }
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          <Section
            title="Glosario"
            action={canEdit ? { label: "Término", onClick: () => open("glossary") } : undefined}
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
                        <span className="meta-list__actions">
                          <button
                            type="button"
                            onClick={() => open("glossary", item as unknown as Record<string, unknown>)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void removeRow("glossary", item.id, `Se eliminó “${item.term}”.`)
                            }
                          >
                            Eliminar
                          </button>
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </aside>
      </div>

      {modal && formConfig && (
        <EntityForm
          config={formConfig}
          pending={save.isPending}
          onClose={() => setModal(null)}
          onSubmit={(values) =>
            run(
              () =>
                save.mutateAsync({
                  table: tableFor[modal.kind] as WritableTable,
                  id: modal.entity?.id as string | undefined,
                  values: formConfig.toRow(values),
                }),
              modal.entity ? "Cambios guardados." : "Registro creado.",
            )
          }
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

function IconAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button${danger ? " icon-button--danger" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function RowActions({
  onEdit,
  editLabel,
  onRemove,
  removeLabel,
}: {
  onEdit: () => void;
  editLabel: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="row-actions">
      <IconAction icon="settings" label={editLabel} onClick={onEdit} />
      <IconAction icon="close" danger label={removeLabel} onClick={onRemove} />
    </span>
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

/* --- Formulario genérico ----------------------------------------------------
   Los siete diálogos comparten esqueleto; forms.ts declara sus campos y cómo se
   arma la fila. La trampa de foco, el cierre con Escape y el bloqueo del fondo
   vienen de Modal.
   -------------------------------------------------------------------------- */

function EntityForm({
  config,
  pending,
  onSubmit,
  onClose,
}: {
  config: FormConfig;
  pending: boolean;
  onSubmit: (values: Values) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(config.initial);

  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(values);
  }

  return (
    <Modal title={config.title} description={config.description} onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        {config.fields.map((field) => (
          <Field key={field.name} field={field} value={values[field.name] ?? ""} onChange={set} />
        ))}
        <ModalActions onCancel={onClose} submitLabel={pending ? "Guardando…" : config.submitLabel} />
      </form>
    </Modal>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const grouped = field.options?.some((option) => option.group);

  return (
    <label className="admin-field">
      <span>
        {field.label}
        {field.type === "range" && <output>{value || 0}%</output>}
      </span>

      {field.type === "textarea" ? (
        <textarea
          rows={3}
          required={field.required}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          required={field.required}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
        >
          {grouped ? renderGrouped(field.options ?? []) : renderFlat(field.options ?? [])}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={value === "on"}
          onChange={(event) => onChange(field.name, event.target.checked ? "on" : "")}
        />
      ) : (
        <input
          type={
            field.type === "range"
              ? "range"
              : field.type === "date"
                ? "date"
                : field.type === "url"
                  ? "url"
                  : "text"
          }
          min={field.type === "range" ? 0 : undefined}
          max={field.type === "range" ? 100 : undefined}
          required={field.required}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      )}

      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}

function renderFlat(options: { value: string; label: string }[]) {
  return options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));
}

/** Las líneas se agrupan por su área: así se ve de dónde cuelga cada una. */
function renderGrouped(options: { value: string; label: string; group?: string }[]) {
  const loose = options.filter((option) => !option.group);
  const groups = new Map<string, { value: string; label: string }[]>();

  for (const option of options) {
    if (!option.group) continue;
    const bucket = groups.get(option.group) ?? [];
    bucket.push(option);
    groups.set(option.group, bucket);
  }

  return (
    <>
      {renderFlat(loose)}
      {[...groups.entries()].map(([group, items]) => (
        <optgroup key={group} label={group}>
          {renderFlat(items)}
        </optgroup>
      ))}
    </>
  );
}
