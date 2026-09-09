import { Fragment, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { keys, useParameters, usePillarDetail, usePillarOwners } from "../../../data/queries";
import { pillarScope, useRemoveRow, useSaveRow } from "../../../data/mutations";
import {
  accentFor,
  bandFor,
  computeCompliance,
  formatDate,
  formatMonth,
  formatValue,
  indexYearProgress,
  latestTarget,
  shortYear,
  statusMeta,
  yearsInPlay,
} from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import { buildForm, tableFor, yearField } from "./forms";
import { Link as RouterLink } from "react-router-dom";
import type { EntityKind, FieldSpec, FormConfig, Values } from "./forms";
import type { ActivityWithTargets, ProgressScope } from "../../../types/database";
import type { YearIndex } from "../../../data/pdi";
import type { WritableTable } from "../../../data/mutations";

/** Qué diálogo está abierto y sobre qué fila. Sin fila = alta. */
type ModalState = { kind: EntityKind; entity?: Record<string, unknown> } | null;

export function PillarConfigurator() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const detail = usePillarDetail(slug);
  const owners = usePillarOwners();
  // El desplegable de unidad del indicador sale del catálogo global, no de
  // texto libre: así "convenios" se escribe una vez y no de cinco maneras.
  const units = useParameters("unidad");
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

  const {
    pillar,
    areas,
    areaProgress,
    lines,
    projectProgress,
    projects,
    activities,
    observations,
    yearProgress,
    changes,
    glossary,
    documents,
    indicators,
  } = detail.data;

  // Las columnas de la tabla son los años que alguien haya capturado en
  // cualquier indicador del pilar, más los del plan: si un pilar todavía no
  // reporta 2027, esa columna no ocupa sitio en pantalla.
  const years = yearsInPlay(activities.flatMap((activity) => activity.targets));
  // El avance año a año de áreas y líneas, para configurar viendo lo mismo
  // que se publica en el cuadro de mando.
  const yearIndex = indexYearProgress(yearProgress);
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
        units: units.data ?? [],
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
      description="Estructura, proyectos, indicadores de resultado, soportes y trazabilidad del pilar."
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

          {/* --- Metas y cumplimiento -----------------------------------------
              Los tres campos de meta viven en los formularios de área y de
              línea, pero ahí no se ven: había que abrir cada uno para saber si
              estaban puestos. Esta tabla los reúne y usa el mismo aspecto que
              el cuadro de mando público, así se ve configurado lo que se va a
              publicar. ---------------------------------------------------- */}
          <Section
            title="Metas y cumplimiento"
            hint="La meta es opcional y en valor absoluto. El cumplimiento no se escribe: el del área sale de sus líneas, y el de la línea, de sus proyectos y de los indicadores que cuelgan de ella sin proyecto."
          >
            {areas.length === 0 ? (
              <EmptyBlock title="Crea un área para poder fijar metas." />
            ) : (
              <div className="table-scroll">
                <table className="result-table">
                  <caption className="sr-only">
                    Metas y cumplimiento de las áreas estratégicas y sus líneas de acción
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Código</th>
                      <th scope="col">Área o línea</th>
                      <th scope="col">Meta</th>
                      <th scope="col">Avance</th>
                      {yearIndex.years.map((year) => (
                        <th scope="col" key={year} className="result-table__year">
                          Cumpl. {shortYear(year)}
                        </th>
                      ))}
                      <th scope="col">Acumulado</th>
                      {canEdit && (
                        <th scope="col">
                          <span className="sr-only">Acciones</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {areas.flatMap((area) => {
                      const stats = areaProgress.find((row) => row.area_id === area.id);
                      const ownLines = lines
                        .filter((line) => line.area_id === area.id)
                        .sort((a, b) => a.position - b.position);

                      return [
                        <TargetRow
                          key={area.id}
                          scope="area"
                          entityId={area.id}
                          years={yearIndex.years}
                          yearIndex={yearIndex}
                          code={area.code}
                          name={area.name}
                          target={stats?.target_value ?? null}
                          achieved={stats?.achieved_value ?? null}
                          unit={stats?.measure_unit ?? null}
                          progress={stats?.progress ?? 0}
                          source={
                            (stats?.line_count ?? 0) > 0
                              ? `promedio de ${stats?.line_count} ${stats?.line_count === 1 ? "línea" : "líneas"}`
                              : "sin líneas"
                          }
                          onEdit={
                            canEdit
                              ? () => open("area", area as unknown as Record<string, unknown>)
                              : undefined
                          }
                          editLabel={`Editar la meta del área ${area.name}`}
                        />,
                        ...ownLines.map((line) => (
                          <TargetRow
                            key={line.id}
                            nested
                            scope="line"
                            entityId={line.id}
                            years={yearIndex.years}
                            yearIndex={yearIndex}
                            code={line.code}
                            name={line.name}
                            target={line.target_value}
                            achieved={line.achieved_value}
                            unit={line.measure_unit}
                            progress={line.progress}
                            source={lineSource(line)}
                            onEdit={
                              canEdit
                                ? () =>
                                    open("line", {
                                      ...line,
                                      area_id: area.id,
                                    } as unknown as Record<string, unknown>)
                                : undefined
                            }
                            editLabel={`Editar la meta de la línea ${line.name}`}
                          />
                        )),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* --- Proyectos -----------------------------------------------
              Solo lectura. Los proyectos se administran en su propio módulo
              porque uno puede apuntar a varios pilares: creado desde aquí
              nacería atado a este y sin manera de vincularlo a otro. --- */}
          <Section
            title="Proyectos"
            hint="Los que aportan a este pilar, propios o vinculados desde otro. Se crean y se editan en el módulo de Proyectos."
            action={
              canEdit ? { label: "Ir a Proyectos", onClick: () => navigate("/admin/proyectos") } : undefined
            }
          >
            {projects.length === 0 ? (
              <EmptyBlock
                title="Sin proyectos vinculados."
                hint="Se vinculan desde el módulo de Proyectos, eligiendo este pilar."
              />
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
                            ? ` (promedio de ${projectStats.get(project.id)?.activity_count} indicadores)`
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
                        {project.pillar_id !== pillar.id && (
                          <small className="record-flag">Vinculado desde otro pilar</small>
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
                        <RouterLink
                          className="icon-button"
                          to="/admin/proyectos"
                          aria-label={`Editar el proyecto ${project.name} en el módulo de Proyectos`}
                          title="Editar en Proyectos"
                        >
                          <Icon name="settings" size={15} />
                        </RouterLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* --- Indicadores de resultado --------------------------------
              La tabla es la del reporte institucional: una fila por indicador y
              tres columnas por año. Se configura viendo exactamente lo que se
              va a publicar. ------------------------------------------------ */}
          <Section
            title="Indicadores de resultado"
            hint="Meta, resultado y cumplimiento de cada año. El avance del pilar sale de aquí: cada indicador aporta el cumplimiento de su año más reciente."
            action={canEdit ? { label: "Nuevo indicador", onClick: () => open("activity") } : undefined}
          >
            {activities.length === 0 ? (
              <EmptyBlock
                title="Sin indicadores de resultado"
                hint="Mientras no haya indicadores, el pilar aparecerá al 0 % en el tablero."
              />
            ) : (
              <div className="table-scroll">
                <table className="result-table indicator-table">
                  <caption className="sr-only">
                    Indicadores de resultado del pilar: unidad, línea base y, por cada año, meta,
                    resultado y cumplimiento
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Indicador</th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Base</th>
                      {years.map((year) => (
                        <th scope="col" key={year} colSpan={3} className="indicator-table__year">
                          {year}
                        </th>
                      ))}
                      <th scope="col">Avance</th>
                      {canEdit && (
                        <th scope="col">
                          {/* La celda tiene que ocupar su sitio en la cabecera; lo
                              que se oculta es el texto, no la columna. */}
                          <span className="sr-only">Acciones</span>
                        </th>
                      )}
                    </tr>
                    <tr className="indicator-table__subhead">
                      <th scope="col" />
                      <th scope="col" />
                      <th scope="col" />
                      {years.map((year) => (
                        <Fragment key={year}>
                          <th scope="col">Meta {shortYear(year)}</th>
                          <th scope="col">Result.</th>
                          <th scope="col">Cumpl.</th>
                        </Fragment>
                      ))}
                      <th scope="col" />
                      {canEdit && <th scope="col" />}
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <IndicatorRow
                        key={activity.id}
                        activity={activity}
                        years={years}
                        line={
                          activity.action_line_id ? lineById.get(activity.action_line_id) : undefined
                        }
                        actions={
                          canEdit ? (
                            <RowActions
                              onEdit={() =>
                                open("activity", activity as unknown as Record<string, unknown>)
                              }
                              editLabel={`Editar el indicador ${activity.title}`}
                              onRemove={() =>
                                void removeRow(
                                  "activity",
                                  activity.id,
                                  `Se eliminó “${activity.title}”.`,
                                )
                              }
                              removeLabel={`Eliminar el indicador ${activity.title}`}
                            />
                          ) : null
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* --- Observaciones -------------------------------------------- */}
          <Section
            title="Observaciones del pilar"
            hint="La lectura del avance: por qué un indicador se quedó corto, qué se decidió, de qué depende lo que falta. Se publica bajo la tabla."
            action={canEdit ? { label: "Nueva observación", onClick: () => open("observation") } : undefined}
          >
            {observations.length === 0 ? (
              <EmptyBlock
                title="Sin observaciones"
                hint="La tabla dice cuánto se cumplió; la observación, por qué."
              />
            ) : (
              <ul className="record-list">
                {observations.map((observation) => (
                  <li key={observation.id}>
                    <div>
                      <strong>
                        {observation.title || "Observación"}
                        <span className="record-flag">
                          {observation.year ? `Corte ${observation.year}` : "Vigente"}
                        </span>
                      </strong>
                      <small className="observation-preview">{observation.body}</small>
                      {observation.author && (
                        <small className="record-lineage">{observation.author}</small>
                      )}
                    </div>
                    <span />
                    {canEdit && (
                      <RowActions
                        onEdit={() =>
                          open("observation", observation as unknown as Record<string, unknown>)
                        }
                        editLabel={`Editar la observación ${observation.title || observation.year || ""}`}
                        onRemove={() =>
                          void removeRow("observation", observation.id, "Se eliminó la observación.")
                        }
                        removeLabel={`Eliminar la observación ${observation.title || observation.year || ""}`}
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
              <Meta label="Protocolos de medición" value={`${indicators.length} protocolo(s)`} />
            </dl>
            <Link className="button-ghost" to="/admin/pilares">
              Editar identidad del pilar
            </Link>
          </section>

          <Section
            title="Control de cambios"
            hint="Las entradas de proyectos e indicadores se escriben solas al guardar."
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
                  // La serie anual del indicador vive en otra tabla y necesita el
                  // id del padre, que al crear no existe hasta después del INSERT.
                  children: formConfig.childRows
                    ? (parentId) => formConfig.childRows!(values, parentId)
                    : undefined,
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

/** De dónde sale el porcentaje de una línea. Se dice en la propia fila para
 *  que nadie edite el cumplimiento reportado cuando ya no se está usando. */
function lineSource(line: { is_derived: boolean; project_count: number; loose_activity_count: number }) {
  if (!line.is_derived) return "cumplimiento reportado";

  const piezas: string[] = [];
  if (line.project_count > 0) {
    piezas.push(`${line.project_count} ${line.project_count === 1 ? "proyecto" : "proyectos"}`);
  }
  if (line.loose_activity_count > 0) {
    piezas.push(
      `${line.loose_activity_count} ${line.loose_activity_count === 1 ? "indicador" : "indicadores"}`,
    );
  }
  return `promedio de ${piezas.join(" y ")}`;
}

/** Una fila de la tabla de metas: área o línea, con su meta y su cumplimiento. */
function TargetRow({
  scope,
  entityId,
  years,
  yearIndex,
  code,
  name,
  target,
  achieved,
  unit,
  progress,
  source,
  onEdit,
  editLabel,
  nested = false,
}: {
  scope: ProgressScope;
  entityId: string;
  years: number[];
  yearIndex: YearIndex;
  code: string | null;
  name: string;
  target: number | null;
  achieved: number | null;
  unit: string | null;
  progress: number;
  /** De dónde sale el porcentaje, para que no parezca escrito a mano. */
  source: string;
  onEdit?: () => void;
  editLabel: string;
  nested?: boolean;
}) {
  const band = bandFor(progress);
  const suffix = unit ? ` ${unit}` : "";

  return (
    <tr className={nested ? "is-nested" : undefined}>
      <td className="result-table__code">{code || "—"}</td>
      <th scope="row">
        <strong>{name}</strong>
        <small>{source}</small>
      </th>
      <td className="result-table__number">
        {target === null ? <span className="target-empty">Sin meta</span> : `${target}${suffix}`}
      </td>
      <td className="result-table__number">
        {achieved === null ? <span className="target-empty">—</span> : `${achieved}${suffix}`}
      </td>

      {/* Un año que esta fila no ha reportado se deja vacío: escribir un cero
          diría "no se cumplió" donde solo hay silencio. */}
      {years.map((year) => {
        const value = yearIndex.at(scope, entityId, year);
        return (
          <td className="result-table__number" key={year}>
            {value === null ? (
              <span className="target-empty">—</span>
            ) : (
              <span
                className="year-cell"
                style={{ "--band": bandFor(value).color } as React.CSSProperties}
                title={`${bandFor(value).label} en ${year}`}
              >
                {value} %
              </span>
            )}
          </td>
        );
      })}

      <td>
        <span className="band-chip" style={{ "--band": band.color } as React.CSSProperties}>
          <span className="band-chip__value">{progress} %</span>
          <span className="band-chip__label">{band.label}</span>
        </span>
      </td>
      {onEdit && (
        <td>
          <IconAction icon="settings" label={editLabel} onClick={onEdit} />
        </td>
      )}
    </tr>
  );
}

/** Una fila de la tabla de indicadores: la unidad, la base y los tres datos de
 *  cada año. El año que fija el avance se marca, porque de los cinco solo uno
 *  llega al pilar y sin señalarlo la tabla no lo dice. */
function IndicatorRow({
  activity,
  years,
  line,
  actions,
}: {
  activity: ActivityWithTargets;
  years: number[];
  line?: { area_name: string; code: string | null; name: string };
  actions: React.ReactNode;
}) {
  const byYear = new Map(activity.targets.map((row) => [row.year, row]));
  const driver = latestTarget(activity.targets);
  const band = bandFor(activity.progress);
  const unit = activity.unit?.label ?? null;

  return (
    <tr>
      <th scope="row">
        <strong>
          {activity.title}
          {activity.is_featured && <span className="record-flag">Destacado</span>}
        </strong>
        <small>
          {line
            ? `${line.area_name} › ${line.code ? `${line.code} · ` : ""}${line.name}`
            : "Sin línea de acción"}
        </small>
      </th>

      <td>{unit ?? <span className="target-empty">Sin unidad</span>}</td>

      <td className="result-table__number">
        {activity.baseline_value === null ? (
          <span className="target-empty">—</span>
        ) : (
          <>
            {formatValue(activity.baseline_value)}
            {activity.baseline_year && <small> ({activity.baseline_year})</small>}
          </>
        )}
      </td>

      {years.map((year) => {
        const row = byYear.get(year);
        const isDriver = driver?.year === year;
        return (
          <Fragment key={year}>
            <td className="result-table__number">{formatValue(row?.target_value)}</td>
            <td className="result-table__number">{formatValue(row?.result_value)}</td>
            <td
              className={`result-table__number${isDriver ? " indicator-table__driver" : ""}`}
              title={isDriver ? "Este es el año que fija el avance del indicador" : undefined}
            >
              {row?.compliance === null || row?.compliance === undefined
                ? "—"
                : `${formatValue(row.compliance)} %`}
              {row?.compliance_override !== null && row?.compliance_override !== undefined && (
                <small title="Cumplimiento decidido a mano"> ·</small>
              )}
            </td>
          </Fragment>
        );
      })}

      <td>
        <span className="band-chip" style={{ "--band": band.color } as React.CSSProperties}>
          <span className="band-chip__value">{activity.progress} %</span>
          <span className="band-chip__label">
            {driver ? `Año ${driver.year}` : statusMeta[activity.status].label}
          </span>
        </span>
      </td>

      {actions && <td>{actions}</td>}
    </tr>
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
        {config.fields.map((field) =>
          // La rejilla de años no es un campo con un valor: son tres por año, y
          // necesita ver el estado entero para calcular el cumplimiento mientras
          // se escribe.
          field.type === "years" ? (
            <YearGrid key={field.name} field={field} values={values} onChange={set} />
          ) : (
            <Field key={field.name} field={field} value={values[field.name] ?? ""} onChange={set} />
          ),
        )}
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
                  : field.type === "number"
                    ? "number"
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

/* --- Rejilla de metas por año -----------------------------------------------
   La captura reproduce la tabla del reporte: una fila por año, y la meta y el
   resultado uno al lado del otro. El cumplimiento no se escribe —se calcula
   mientras se teclea— salvo que se abra el campo de ajuste, que es lo que se
   usa en los indicadores de reducción o con tope.
   -------------------------------------------------------------------------- */

function YearGrid({
  field,
  values,
  onChange,
}: {
  field: FieldSpec;
  values: Values;
  onChange: (name: string, value: string) => void;
}) {
  const years = field.years ?? [];
  const [showOverride, setShowOverride] = useState(() =>
    years.some((year) => (values[yearField(year, "override")] ?? "") !== ""),
  );

  const parse = (raw: string): number | null => {
    const value = raw.trim();
    if (value === "") return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };

  return (
    <fieldset className="year-grid">
      <legend>{field.label}</legend>

      <table>
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col">Meta</th>
            <th scope="col">Resultado</th>
            <th scope="col">Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const target = parse(values[yearField(year, "target")] ?? "");
            const result = parse(values[yearField(year, "result")] ?? "");
            const override = values[yearField(year, "override")] ?? "";
            const computed = computeCompliance(target, result);

            return (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Meta ${year}`}
                    value={values[yearField(year, "target")] ?? ""}
                    onChange={(event) => onChange(yearField(year, "target"), event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    aria-label={`Resultado ${year}`}
                    value={values[yearField(year, "result")] ?? ""}
                    onChange={(event) => onChange(yearField(year, "result"), event.target.value)}
                  />
                </td>
                <td>
                  {showOverride ? (
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      aria-label={`Cumplimiento ${year}`}
                      placeholder={computed === null ? "—" : String(computed)}
                      value={override}
                      onChange={(event) =>
                        onChange(yearField(year, "override"), event.target.value)
                      }
                    />
                  ) : (
                    <output className="year-grid__computed">
                      {computed === null ? "—" : `${computed} %`}
                    </output>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <label className="year-grid__toggle">
        <input
          type="checkbox"
          checked={showOverride}
          onChange={(event) => {
            const next = event.target.checked;
            setShowOverride(next);
            // Desmarcar devuelve el control al cálculo: dejar los valores
            // escritos y ocultarlos publicaría un número que ya nadie ve.
            if (!next) for (const year of years) onChange(yearField(year, "override"), "");
          }}
        />
        <span>
          Ajustar el cumplimiento a mano
          <small>
            Para indicadores que no se miden dividiendo resultado entre meta: los de reducción, los
            que tienen tope, los que ajusta el comité.
          </small>
        </span>
      </label>

      {field.hint && <p className="year-grid__hint">{field.hint}</p>}
    </fieldset>
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
