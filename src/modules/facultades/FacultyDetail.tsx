/* =============================================================================
   PDI por facultad · ficha de una facultad

   El plan de la facultad tal y como ella lo escribió: las acciones agrupadas
   por dimensión, en el orden en que las numeró.

   Agrupar por dimensión y no por pilar es deliberado, aunque el pilar sea el
   enganche con el PDI. La dimensión es el índice mental de quien escribió el
   plan —"Gestión de calidad", "Gestión profesoral"—, y reordenarlo por pilar
   convertiría el plan de la facultad en una lista que ella no reconoce. El
   pilar viaja en cada acción, como ficha de color, y el filtro de arriba deja
   mirar el plan desde ese otro eje cuando hace falta.

   Cada acción se abre para enseñar lo que la facultad se comprometió a hacer:
   su meta, sus recursos, sus actividades y el último corte reportado. Cerrada
   ocupa tres líneas, que es lo que permite recorrer treinta y una acciones sin
   perderse.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { FilterChips } from "../../components/ui/FilterChips";
import { Icon } from "../../components/ui/Icon";
import { LoadingBlock, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { NotFound } from "../../routes/NotFound";
import { useFacultyDetail, useFacultyMatrix } from "../../data/queries";
import {
  accentFor,
  deadlineText,
  facultyActionStatus,
  formatDate,
  groupByDimension,
  pillarsMissedBy,
  tallyActionsByPillar,
} from "../../data/pdi";
import type { FacultyAction } from "../../types/database";
import "./facultades.css";

export function FacultyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useFacultyDetail(slug);
  const matrix = useFacultyMatrix();

  // Qué acción está abierta. Null al entrar: abrir una por defecto diría que
  // esa importa más que las demás.
  const [openId, setOpenId] = useState<string | null>(null);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);

  // Cambiar de facultad reinicia las dos selecciones: el filtro de la anterior
  // no significa nada aquí, y la acción abierta ya no existe.
  useEffect(() => {
    setOpenId(null);
    setPillarFilter(null);
  }, [slug]);

  const actions = useMemo(() => detail.data?.actions ?? [], [detail.data]);
  const byPillar = useMemo(() => tallyActionsByPillar(actions), [actions]);

  const visible = useMemo(
    () => (pillarFilter ? actions.filter((row) => row.pillar_id === pillarFilter) : actions),
    [actions, pillarFilter],
  );

  const dimensions = useMemo(() => groupByDimension(visible), [visible]);

  const missed = useMemo(
    () => (detail.data ? pillarsMissedBy(matrix.data ?? [], detail.data.faculty.faculty_id) : []),
    [matrix.data, detail.data],
  );

  if (detail.isPending) {
    return (
      <PublicLayout className="faculty-page">
        <div className="u-container faculty-shell">
          <LoadingBlock rows={5} label="Cargando el plan de la facultad" />
        </div>
      </PublicLayout>
    );
  }

  if (detail.error) {
    return (
      <PublicLayout className="faculty-page">
        <div className="u-container faculty-shell">
          <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
        </div>
      </PublicLayout>
    );
  }

  // Slug inventado o facultad sin publicar: la misma respuesta en los dos
  // casos, porque desde fuera son indistinguibles y deben serlo.
  if (!detail.data) return <NotFound />;

  const { faculty } = detail.data;

  return (
    <PublicLayout className="faculty-page">
      <div className="u-container faculty-shell">
        <nav className="faculty-crumbs" aria-label="Ruta de navegación">
          <Link to="/facultades">PDI por facultad</Link>
          <Icon name="arrow-right" size={14} />
          <span aria-current="page">{faculty.name}</span>
        </nav>

        <header className="faculty-intro">
          <div className="faculty-intro__copy">
            <span className="eyebrow">{faculty.code} · Plan de acción</span>
            <h1>{faculty.name}</h1>
            {faculty.description && <p className="lede">{faculty.description}</p>}
            <p className="faculty-intro__dean">
              {[faculty.dean, faculty.period && `Periodo ${faculty.period}`]
                .filter(Boolean)
                .join(" · ")}
              {faculty.plan_date && ` · Elaborado el ${formatDate(faculty.plan_date)}`}
            </p>
          </div>

          <ul className="faculty-intro__figures" aria-label="Resumen del plan">
            <li>
              <strong>{faculty.action_count}</strong>
              <small>{faculty.action_count === 1 ? "Acción" : "Acciones"}</small>
            </li>
            <li>
              <strong>{faculty.activity_count}</strong>
              <small>{faculty.activity_count === 1 ? "Actividad" : "Actividades"}</small>
            </li>
            <li>
              <strong>{faculty.dimension_count}</strong>
              <small>{faculty.dimension_count === 1 ? "Dimensión" : "Dimensiones"}</small>
            </li>
            <li>
              {/* Nulo no es cero: mientras nadie reporte, la cifra no existe, y
                  escribir un 0 % diría que el plan va mal en vez de decir que
                  todavía no se ha medido. */}
              <strong>
                {faculty.reported_progress === null ? "—" : `${faculty.reported_progress}%`}
              </strong>
              <small>
                {faculty.reported_progress === null
                  ? "Sin cortes reportados"
                  : `Avance medio de ${faculty.reported_count} ${
                      faculty.reported_count === 1 ? "acción reportada" : "acciones reportadas"
                    }`}
              </small>
            </li>
          </ul>
        </header>

        {actions.length === 0 ? (
          <EmptyBlock
            title="Esta facultad todavía no tiene plan publicado"
            hint="Cuando su plan se sincronice y la Oficina de Planeación lo publique, aparecerá aquí."
            action={
              <Link className="button-secondary" to="/facultades">
                Volver a las facultades
              </Link>
            }
          />
        ) : (
          <>
            {byPillar.length > 1 && (
              <div className="faculty-filter">
                <span className="eyebrow">Filtrar por pilar del PDI</span>
                <FilterChips
                  label="Filtrar las acciones por pilar"
                  value={pillarFilter}
                  onChange={setPillarFilter}
                  options={[
                    { id: null, label: `Todas · ${actions.length}` },
                    ...byPillar.map((row) => ({
                      id: row.id,
                      label: `${row.numeral} · ${row.name} · ${row.count}`,
                      accent: accentFor(row.accent),
                    })),
                  ]}
                />
              </div>
            )}

            <div className="faculty-plan">
              {dimensions.map((dimension) => (
                <section
                  key={dimension.id}
                  className="dimension"
                  aria-labelledby={`dim-${dimension.id}`}
                >
                  <div className="dimension__head">
                    <span className="dimension__code">{dimension.id.toUpperCase()}</span>
                    <h2 id={`dim-${dimension.id}`}>{dimension.name}</h2>
                    <span className="dimension__count">
                      {dimension.actions.length}{" "}
                      {dimension.actions.length === 1 ? "acción" : "acciones"}
                    </span>
                  </div>

                  <ul className="action-list">
                    {dimension.actions.map((action) => (
                      <li key={action.id}>
                        <ActionCard
                          action={action}
                          isOpen={action.id === openId}
                          onToggle={() => setOpenId(action.id === openId ? null : action.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {missed.length > 0 && (
                <div className="faculty-gap">
                  <strong>
                    {missed.length === 1
                      ? "Un pilar sin acciones de esta facultad"
                      : `${missed.length} pilares sin acciones de esta facultad`}
                  </strong>
                  <p>
                    Ninguna acción del plan de {faculty.name} apunta a <b>{missed.join(", ")}</b>. No
                    es un error de captura: es el estado actual del plan, y se muestra tal cual.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  );
}

/* --- Una acción ------------------------------------------------------------- */

function ActionCard({
  action,
  isOpen,
  onToggle,
}: {
  action: FacultyAction;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const state = facultyActionStatus[action.initial_status];
  const reported = action.last_progress !== null;

  return (
    <article className={`action${isOpen ? " is-open" : ""}`}>
      <button type="button" className="action__head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="action__title">
          <b>{action.title}</b>
          <span className="action__meta">
            {action.owner || "Sin responsable"} ·{" "}
            {deadlineText(action.deadline, action.deadline_label)}
          </span>
        </span>

        <span className="action__tags">
          {action.pillar_numeral && (
            <span className="pillar-tag">
              <i style={{ background: accentFor(action.pillar_accent) }} aria-hidden="true" />
              {action.pillar_numeral} · {action.pillar_name}
            </span>
          )}
          <span className={`state-pill state-pill--${state.tone}`}>
            <i aria-hidden="true" />
            {state.label}
          </span>
          <Icon name="chevron-down" size={16} />
        </span>
      </button>

      {isOpen && (
        <div className="action__body">
          {action.goal && (
            <div className="action__field">
              <span>Meta e indicador</span>
              {/* El origen guarda la meta y su indicador en el mismo campo, con
                  saltos de línea. Se respetan: partirlos aquí sería adivinar
                  dónde acaba una y empieza el otro. */}
              <p className="action__prewrap">{action.goal}</p>
            </div>
          )}

          {action.resources && (
            <div className="action__field">
              <span>Recursos</span>
              <p>{action.resources}</p>
            </div>
          )}

          {(action.budget_ordinary || action.budget_improvement) && (
            <div className="action__field">
              <span>Financiación declarada</span>
              {/* De qué bolsa sale, no cuánto: el portal no publica cifras de
                  dinero, y esto son dos casillas marcadas, no un presupuesto. */}
              <p className="budget-flags">
                {action.budget_ordinary && (
                  <span>
                    <Icon name="check" size={13} />
                    Presupuesto ordinario
                  </span>
                )}
                {action.budget_improvement && (
                  <span>
                    <Icon name="check" size={13} />
                    Plan de mejoramiento
                  </span>
                )}
              </p>
            </div>
          )}

          {action.activities.length > 0 && (
            <div className="action__field">
              <span>
                {action.activities.length === 1
                  ? "1 actividad"
                  : `${action.activities.length} actividades`}
              </span>
              <ul className="activity-list">
                {action.activities.map((activity) => (
                  <li key={activity.id}>
                    <p>{activity.description}</p>
                    <span>
                      {[activity.owner, deadlineText(activity.due_date, activity.due_label)]
                        .filter(Boolean)
                        .join(" · ")}
                      {activity.status_label && ` · ${activity.status_label}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="action__field">
            <span>Seguimiento</span>
            {reported ? (
              <div className="followup">
                <div
                  className="progress-track"
                  role="img"
                  aria-label={`Avance reportado: ${action.last_progress}%`}
                >
                  <span className="progress-track__fill" style={{ width: `${action.last_progress}%` }} />
                </div>
                <p>
                  <b>{action.last_progress}%</b> · {action.last_cut}
                  {action.last_status && ` · ${action.last_status}`}
                  {action.last_reported_on &&
                    ` · reportado el ${formatDate(action.last_reported_on)}`}
                </p>
              </div>
            ) : (
              // "Sin reportar" y "cero por ciento" son afirmaciones distintas.
              <p className="action__muted">Esta acción todavía no tiene ningún corte reportado.</p>
            )}
          </div>

          {/* La trazabilidad del enganche. Se enseña porque el pilar es lo único
              que el portal añade al plan, y quien lo lee tiene derecho a saber
              que salió de lo que escribió la facultad. */}
          {action.declared_pillar && (
            <p className="action__source">
              <Icon name="document" size={13} />
              La facultad declaró este aporte como «{action.declared_pillar}»
              {action.line_code &&
                ` · anclado por Planeación a ${action.line_code} ${action.line_name}`}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
