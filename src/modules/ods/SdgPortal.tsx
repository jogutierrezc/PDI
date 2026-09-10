/* =============================================================================
   El PDI y los Objetivos de Desarrollo Sostenible

   Una página pública que responde a tres preguntas y a ninguna más:

     1. ¿A qué ODS aporta la UDES, y con cuánto?
     2. ¿Qué pilar del plan aporta a cada objetivo?
     3. ¿Qué proyectos concretos hay detrás de cada uno?

   Nada de esto está declarado en la base de datos: se deduce de los proyectos,
   que son los únicos que marcan ODS. Por eso el recuento vive en `tallySdg()`
   —en el dominio, junto al resto de la aritmética del plan— y aquí solo queda
   cómo se mira.

   Los diecisiete objetivos se pintan siempre, también los que nadie toca. Un
   objetivo sin proyectos es información: dice dónde el plan no llega. Filtrar
   la rejilla a los que tienen aporte la dejaría más bonita y menos honesta.

   El color oficial de cada ODS entra como `--sdg` y decora; el estado —cuántos
   proyectos, cuál está seleccionado— nunca se comunica solo con el matiz,
   porque diecisiete colores a la vez no distinguen nada.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PublicLayout } from "../../components/layout/PublicLayout";
import { Icon } from "../../components/ui/Icon";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../components/ui/QueryState";
import { usePillars, useProjects } from "../../data/queries";
import {
  accentFor,
  budgetedCount,
  estimatedBudget,
  formatBudget,
  formatCurrency,
  formatRange,
  pillarsOfProject,
  sdgGoals,
  tallySdg,
} from "../../data/pdi";
import { projectFileUrl } from "../../data/storage";
import type { ProjectWithLinks } from "../../types/database";
import "./ods.css";

export function SdgPortal() {
  // Qué objetivo se está mirando. Null = ninguno, y el panel de detalle no
  // existe todavía: abrir la página con uno elegido daría a entender que ese
  // objetivo es más importante que los otros dieciséis.
  const [activeGoal, setActiveGoal] = useState<number | null>(null);

  const pillars = usePillars();
  const projects = useProjects();

  const rows = useMemo(() => projects.data ?? [], [projects.data]);
  const pillarRows = useMemo(() => pillars.data ?? [], [pillars.data]);
  const pillarById = useMemo(() => new Map(pillarRows.map((p) => [p.id, p])), [pillarRows]);

  const contributions = useMemo(() => tallySdg(rows), [rows]);
  const byGoal = useMemo(
    () => new Map(contributions.map((row) => [row.goal.id, row])),
    [contributions],
  );

  // El aporte más alto marca la escala de las barras. Sin esto, con un objetivo
  // de doce proyectos y el resto de uno, todas las barras cortas serían
  // indistinguibles entre sí.
  const peak = Math.max(1, ...contributions.map((row) => row.projects.length));

  const withSdg = rows.filter((project) => (project.sdg_goals ?? []).length > 0);
  const reached = contributions.filter((row) => row.projects.length > 0);
  const selected = activeGoal ? byGoal.get(activeGoal) : undefined;

  const loading = projects.isPending || pillars.isPending;

  return (
    <PublicLayout className="sdg-page">
      <div className="u-container sdg-shell">
        <header className="sdg-intro">
          <div className="sdg-intro__copy">
            <span className="eyebrow">Agenda 2030 · Naciones Unidas</span>
            <h1>El PDI y los Objetivos de Desarrollo Sostenible</h1>
            <p className="lede">
              Cada proyecto del Plan de Desarrollo Institucional declara a qué objetivos globales
              aporta. Esta página reúne esas declaraciones: qué objetivos toca la Universidad de
              Santander, desde qué pilar y con qué proyectos.
            </p>
          </div>

          <ul className="sdg-intro__figures" aria-label="Resumen del aporte">
            <li>
              <strong>
                {reached.length}
                <span>/{sdgGoals.length}</span>
              </strong>
              <small>Objetivos con aporte declarado</small>
            </li>
            <li>
              <strong>{withSdg.length}</strong>
              <small>
                {withSdg.length === 1 ? "Proyecto orientado" : "Proyectos orientados"} a la Agenda
                2030
              </small>
            </li>
            <li>
              <strong>{formatBudget(estimatedBudget(withSdg))}</strong>
              <small>
                Valor estimado de esos proyectos · {budgetedCount(withSdg)} con cifra declarada
              </small>
            </li>
          </ul>
        </header>

        {/* --- La rejilla de los diecisiete ------------------------------- */}
        <section className="sdg-section" aria-labelledby="objetivos-title">
          <div className="section-heading">
            <span className="eyebrow">Los diecisiete objetivos</span>
            <h2 id="objetivos-title">Dónde aporta el plan</h2>
            <p>
              El tamaño de la barra compara cuántos proyectos apuntan a cada objetivo. Elige uno
              para ver los pilares y los proyectos que hay detrás.
            </p>
          </div>

          {projects.isError ? (
            <ErrorBlock error={projects.error} onRetry={() => void projects.refetch()} />
          ) : loading ? (
            <CardSkeleton count={6} />
          ) : (
            <ul className="sdg-grid stagger">
              {contributions.map((row) => {
                const count = row.projects.length;
                const isOn = activeGoal === row.goal.id;
                return (
                  <li key={row.goal.id}>
                    <button
                      type="button"
                      className={`sdg-card${isOn ? " is-on" : ""}${count === 0 ? " is-empty" : ""}`}
                      style={{ "--sdg": row.goal.color } as React.CSSProperties}
                      // El botón es un interruptor: volver a pulsarlo cierra el
                      // detalle, que es lo que espera quien acaba de abrirlo.
                      aria-pressed={isOn}
                      onClick={() => setActiveGoal(isOn ? null : row.goal.id)}
                    >
                      <span className="sdg-card__number" aria-hidden="true">
                        {row.goal.id}
                      </span>
                      <span className="sdg-card__label">
                        <span className="sr-only">Objetivo {row.goal.id}: </span>
                        {row.goal.label}
                      </span>
                      <span className="sdg-card__meter">
                        <span
                          className="sdg-card__meter-fill"
                          style={{ width: `${(count / peak) * 100}%` }}
                        />
                      </span>
                      <span className="sdg-card__count">
                        {count === 0
                          ? "Sin proyectos"
                          : `${count} ${count === 1 ? "proyecto" : "proyectos"}`}
                        {row.pillarIds.length > 0 && (
                          <em>
                            {" · "}
                            {row.pillarIds.length}{" "}
                            {row.pillarIds.length === 1 ? "pilar" : "pilares"}
                          </em>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* --- Detalle del objetivo elegido -------------------------------- */}
        {selected && (
          <section
            className="sdg-detail"
            style={{ "--sdg": selected.goal.color } as React.CSSProperties}
            aria-labelledby="detalle-title"
            // El panel aparece por debajo de la rejilla, así que se anuncia:
            // con lector de pantalla, pulsar una tarjeta no movería el foco y
            // el cambio pasaría desapercibido.
            aria-live="polite"
          >
            <header className="sdg-detail__head">
              <span className="sdg-detail__number" aria-hidden="true">
                {selected.goal.id}
              </span>
              <div>
                <span className="eyebrow">Objetivo {selected.goal.id}</span>
                <h2 id="detalle-title">{selected.goal.label}</h2>
                <p>
                  {selected.projects.length === 0
                    ? "Ningún proyecto del plan declara aportar a este objetivo todavía."
                    : `${selected.projects.length} ${selected.projects.length === 1 ? "proyecto declara" : "proyectos declaran"} aportar a este objetivo · ${formatBudget(selected.value)} de valor estimado.`}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setActiveGoal(null)}
                aria-label="Cerrar el detalle del objetivo"
              >
                <Icon name="close" size={16} />
              </button>
            </header>

            {selected.pillarIds.length > 0 && (
              <div className="sdg-detail__pillars">
                <h3>Pilares que aportan</h3>
                <ul>
                  {selected.pillarIds.map((id) => {
                    const pillar = pillarById.get(id);
                    if (!pillar) return null;
                    const count = selected.projects.filter((project) =>
                      pillarsOfProject(project).includes(id),
                    ).length;
                    return (
                      <li key={id} style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}>
                        <Icon name={pillar.icon} size={16} />
                        <Link to={`/implementacion/pilar/${pillar.slug}`}>{pillar.name}</Link>
                        <span>
                          {count} {count === 1 ? "proyecto" : "proyectos"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {selected.projects.length === 0 ? (
              <EmptyBlock
                title="Sin proyectos orientados a este objetivo"
                hint="Los proyectos declaran sus ODS al formularse, desde la intranet."
              />
            ) : (
              <ul className="sdg-project-list">
                {selected.projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    pillarNames={pillarsOfProject(project)
                      .map((id) => pillarById.get(id)?.name)
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* --- Aporte de cada pilar ---------------------------------------- */}
        <section className="sdg-section" aria-labelledby="pilares-title">
          <div className="section-heading">
            <span className="eyebrow">Lectura por pilar</span>
            <h2 id="pilares-title">A qué objetivos aporta cada pilar</h2>
            <p>
              Un pilar aporta a un objetivo cuando alguno de sus proyectos lo declara. Los números
              apagados son los objetivos que ese pilar todavía no toca.
            </p>
          </div>

          {loading ? (
            <CardSkeleton count={3} />
          ) : pillarRows.length === 0 ? (
            <EmptyBlock title="Todavía no hay pilares publicados." />
          ) : (
            <ul className="sdg-pillar-list">
              {pillarRows.map((pillar) => {
                const own = rows.filter((project) => pillarsOfProject(project).includes(pillar.id));
                const goals = new Set(own.flatMap((project) => project.sdg_goals ?? []));

                return (
                  <li
                    key={pillar.id}
                    className="sdg-pillar card"
                    style={{ "--accent": accentFor(pillar.accent_slot) } as React.CSSProperties}
                  >
                    <header>
                      <span className="sdg-pillar__icon">
                        <Icon name={pillar.icon} size={19} />
                      </span>
                      <div>
                        <span className="eyebrow">Pilar {pillar.numeral}</span>
                        <h3>
                          <Link to={`/implementacion/pilar/${pillar.slug}`}>{pillar.name}</Link>
                        </h3>
                      </div>
                      <strong>
                        {goals.size}
                        <span>/{sdgGoals.length}</span>
                      </strong>
                    </header>

                    {/* Los diecisiete siempre, encendidos o apagados: así las
                        seis filas se comparan de un vistazo en la misma
                        posición, que es lo que una matriz tiene que permitir. */}
                    <ul className="sdg-dots" aria-label={`Objetivos a los que aporta ${pillar.name}`}>
                      {sdgGoals.map((goal) => {
                        const on = goals.has(goal.id);
                        return (
                          <li key={goal.id}>
                            <button
                              type="button"
                              className={`sdg-dot${on ? " is-on" : ""}`}
                              style={{ "--sdg": goal.color } as React.CSSProperties}
                              onClick={() => setActiveGoal(goal.id)}
                              aria-label={`Objetivo ${goal.id}, ${goal.label}${on ? "" : " · sin aporte de este pilar"}`}
                              title={`${goal.id} · ${goal.label}`}
                            >
                              <span aria-hidden="true">{goal.id}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <small>
                      {own.length === 0
                        ? "Sin proyectos formulados"
                        : `${own.length} ${own.length === 1 ? "proyecto" : "proyectos"} · ${formatBudget(estimatedBudget(own))} estimados`}
                    </small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="sdg-note">
          Los objetivos y sus colores son los oficiales de Naciones Unidas. El aporte lo declara
          cada proyecto al formularse; para corregir o añadir uno, escribe a{" "}
          <a href="mailto:planeacion@udes.edu.co">planeacion@udes.edu.co</a>.
        </p>
      </div>
    </PublicLayout>
  );
}

/** Un proyecto dentro del detalle de un objetivo. */
function ProjectRow({ project, pillarNames }: { project: ProjectWithLinks; pillarNames: string }) {
  const fileUrl = projectFileUrl(project.attachment_path);

  const facts = [
    formatRange(project.start_date, project.end_date),
    project.total_value !== null ? formatCurrency(project.total_value) : null,
    project.academic_units?.length ? project.academic_units.join(" · ") : null,
  ].filter(Boolean) as string[];

  return (
    <li className="sdg-project card">
      <div className="sdg-project__body">
        <h4>{project.name}</h4>
        {pillarNames && <span className="sdg-project__pillars">{pillarNames}</span>}
        {project.description && <p>{project.description}</p>}
        {facts.length > 0 && <small>{facts.join(" · ")}</small>}
      </div>

      {/* Los otros ODS del proyecto: casi ninguno aporta a uno solo, y verlos
          juntos es lo que muestra que el trabajo cruza objetivos. */}
      {(project.sdg_goals ?? []).length > 1 && (
        <ul className="sdg-project__goals" aria-label="Otros objetivos del proyecto">
          {(project.sdg_goals ?? []).map((id) => {
            const goal = sdgGoals.find((item) => item.id === id);
            if (!goal) return null;
            return (
              <li
                key={id}
                style={{ "--sdg": goal.color } as React.CSSProperties}
                title={`${id} · ${goal.label}`}
              >
                <span aria-hidden="true">{id}</span>
                <span className="sr-only">
                  Objetivo {id}: {goal.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {fileUrl && (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="sdg-project__file">
          <Icon name="document" size={14} />
          {project.attachment_name ?? "Documento"}
          <Icon name="external" size={13} />
        </a>
      )}
    </li>
  );
}
