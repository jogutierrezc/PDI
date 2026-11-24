/* =============================================================================
   PDI por facultad · administración

   Esta pantalla no captura nada. El plan lo escriben las facultades en su
   propia aplicación y el portal lo trae sincronizado; escribir aquí el texto de
   una acción sería tirar el trabajo, porque la corrida siguiente lo
   reescribiría.

   Lo que sí se decide aquí son las tres cosas que el origen no sabe:

     · **Traer.** Cuándo se sincroniza, y qué vino en la última corrida. El
       informe se enseña entero, incluidas las facultades que se quedaron fuera:
       una sincronización que falla en silencio es peor que una que no corre.

     · **Enganchar.** El pilar se resuelve solo, porque los textos del origen
       coinciden con los nombres de los pilares del PDI. Cuando alguno no casa,
       aparece arriba y en rojo: es lo único que bloquea la publicación, y es
       trabajo de Planeación resolverlo anclando la acción a una línea.

     · **Publicar.** Nada sale al portal por sincronizarse. Se publica la
       facultad —que es la unidad que tiene sentido para el público, porque un
       plan a medias no se entiende— y, dentro de ella, se puede retirar una
       acción suelta.
   ========================================================================== */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { CardSkeleton, EmptyBlock, ErrorBlock } from "../../../components/ui/QueryState";
import {
  useAdminFaculties,
  useAdminFacultyActions,
  usePillars,
  useStructure,
} from "../../../data/queries";
import { facultyScope, useSaveRow, useSyncFaculties } from "../../../data/mutations";
import type { SyncReport } from "../../../data/mutations";
import { accentFor, deadlineText, facultyActionStatus, formatDate } from "../../../data/pdi";
import { useAuth } from "../../../lib/auth";
import type { Faculty, FacultyActionAdminRow } from "../../../types/database";
import "./faculties.css";

/** Las vistas de la bandeja. "Sin pilar" es la que tiene trabajo. */
type Tray = "sin-pilar" | "sin-publicar" | "publicadas" | "todas";

const trayLabels: Record<Tray, string> = {
  "sin-pilar": "Sin pilar",
  "sin-publicar": "Sin publicar",
  publicadas: "Publicadas",
  todas: "Todas",
};

export function FacultyAdmin() {
  const actions = useAdminFacultyActions();
  const faculties = useAdminFaculties();
  const pillars = usePillars();
  const structure = useStructure();
  const { hasRole } = useAuth();
  const canEdit = hasRole("planeacion");

  const [tray, setTray] = useState<Tray>("sin-pilar");
  const [facultyFilter, setFacultyFilter] = useState<string>("");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState("");

  const save = useSaveRow(facultyScope());
  const sync = useSyncFaculties();

  const rows = useMemo(() => actions.data ?? [], [actions.data]);
  const facultyRows = useMemo(() => faculties.data ?? [], [faculties.data]);

  /** Las líneas de acción agrupadas por pilar y área, como se eligen. */
  const lineGroups = useMemo(() => {
    const pillarById = new Map((pillars.data ?? []).map((p) => [p.id, p]));
    return (structure.data ?? [])
      .map((area) => {
        const pillar = pillarById.get(area.pillar_id);
        return {
          id: area.id,
          label: `P-${pillar?.numeral ?? "?"} ${pillar?.name ?? "Sin pilar"} — ${area.code ?? ""} ${area.name}`.trim(),
          lines: [...(area.action_lines ?? [])].sort((a, b) => a.position - b.position),
        };
      })
      .filter((group) => group.lines.length > 0);
  }, [structure.data, pillars.data]);

  /** Cuántas acciones trajo cada facultad, y cuántas quedaron sin enganchar. */
  const byFaculty = useMemo(() => {
    const map = new Map<string, { total: number; unresolved: number; published: number }>();
    for (const row of rows) {
      const entry = map.get(row.faculty_id) ?? { total: 0, unresolved: 0, published: 0 };
      entry.total += 1;
      if (!row.pillar_id) entry.unresolved += 1;
      if (row.status === "publicado") entry.published += 1;
      map.set(row.faculty_id, entry);
    }
    return map;
  }, [rows]);

  const counts = useMemo(
    () => ({
      "sin-pilar": rows.filter((row) => !row.pillar_id).length,
      "sin-publicar": rows.filter((row) => row.status !== "publicado").length,
      publicadas: rows.filter((row) => row.status === "publicado").length,
      todas: rows.length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const byTray = rows.filter((row) => {
      if (tray === "todas") return true;
      if (tray === "sin-pilar") return !row.pillar_id;
      if (tray === "publicadas") return row.status === "publicado";
      return row.status !== "publicado";
    });
    return facultyFilter ? byTray.filter((row) => row.faculty_id === facultyFilter) : byTray;
  }, [rows, tray, facultyFilter]);

  const lastSync = useMemo(
    () =>
      facultyRows
        .map((row) => row.synced_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    [facultyRows],
  );

  async function runSync() {
    setError("");
    setReport(null);
    try {
      setReport(await sync.mutateAsync());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo sincronizar con el origen.");
    }
  }

  async function setFacultyStatus(faculty: Faculty, status: "publicado" | "borrador") {
    setError("");
    try {
      await save.mutateAsync({ table: "faculties", id: faculty.id, values: { status } });

      // Publicar la facultad publica su plan: tenerla visible con las acciones
      // en borrador dejaría una ficha vacía, que es peor que no tenerla.
      const mine = rows.filter((row) => row.faculty_id === faculty.id);
      for (const row of mine) {
        if (status === "publicado" && !row.pillar_id) continue; // la base lo rechazaría
        if (row.status === status) continue;
        await save.mutateAsync({ table: "faculty_actions", id: row.id, values: { status } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.");
    }
  }

  async function setActionStatus(row: FacultyActionAdminRow, status: "publicado" | "borrador") {
    setError("");
    try {
      await save.mutateAsync({ table: "faculty_actions", id: row.id, values: { status } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.");
    }
  }

  async function anchor(row: FacultyActionAdminRow, lineId: string) {
    setError("");
    try {
      await save.mutateAsync({
        table: "faculty_actions",
        id: row.id,
        values: { action_line_id: lineId || null },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo anclar la acción.");
    }
  }

  const loading = actions.isPending || faculties.isPending || structure.isPending;

  return (
    <AdminShell
      section="faculties"
      kicker="Origen externo"
      title="PDI por facultad"
      description="Los planes los escriben las facultades en su propia aplicación. Aquí se traen, se comprueba que cada acción enganche con un pilar del PDI y se decide qué sale al portal."
      actions={
        <Link className="button-secondary" to="/facultades">
          <Icon name="external" size={15} />
          Ver la página pública
        </Link>
      }
    >
      {!canEdit && <ReadOnlyNotice />}

      {error && (
        <p className="admin-notice admin-notice--error" role="alert">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      {actions.error && <ErrorBlock error={actions.error} onRetry={() => void actions.refetch()} />}

      {loading && !actions.error && <CardSkeleton count={2} />}

      {!loading && !actions.error && (
        <>
          {/* --- El origen --------------------------------------------------- */}
          <section className="admin-card">
            <div className="admin-card__head">
              <div className="faculties-head">
                <h2>Aplicación de planes de facultad</h2>
                <p>
                  Cada corrida actualiza lo que la facultad escribió y deja intactos el anclaje, el
                  estado de publicación y las notas. Nunca borra: una acción que desaparece del
                  origen se avisa y se queda.
                </p>
              </div>

              {canEdit && (
                <button
                  className="button-primary"
                  type="button"
                  disabled={sync.isPending}
                  onClick={() => void runSync()}
                >
                  <Icon name="arrow-right" size={15} />
                  {sync.isPending ? "Sincronizando…" : "Sincronizar ahora"}
                </button>
              )}
            </div>

            <dl className="inbox">
              <div>
                <dt>Última sincronización</dt>
                <dd>{lastSync ? formatDate(lastSync) : "Nunca"}</dd>
                <small>{lastSync ? "De la corrida más reciente" : "El plan aún no se ha traído"}</small>
              </div>
              <div>
                <dt>Acciones traídas</dt>
                <dd>{counts.todas}</dd>
                <small>De {facultyRows.length} facultades registradas</small>
              </div>
              <div>
                <dt>Sin pilar resuelto</dt>
                <dd className={counts["sin-pilar"] > 0 ? "is-risk" : undefined}>
                  {counts["sin-pilar"]}
                </dd>
                <small>No se pueden publicar todavía</small>
              </div>
              <div>
                <dt>Publicadas</dt>
                <dd className={counts.publicadas > 0 ? "is-done" : undefined}>
                  {counts.publicadas}
                </dd>
                <small>Visibles en el portal público</small>
              </div>
            </dl>

            {report && <SyncSummary report={report} />}
          </section>

          {/* --- Las facultades ---------------------------------------------- */}
          <section className="admin-card">
            <div className="admin-card__head">
              <div className="faculties-head">
                <h2>Qué se publica</h2>
                <p>
                  Se publica la facultad entera: una ficha con la mitad del plan no se entiende.
                  Después se puede retirar una acción suelta desde la bandeja.
                </p>
              </div>
            </div>

            <ul className="faculty-rows">
              {facultyRows.map((faculty) => {
                const stats = byFaculty.get(faculty.id) ?? {
                  total: 0,
                  unresolved: 0,
                  published: 0,
                };
                const published = faculty.status === "publicado";

                return (
                  <li key={faculty.id} className="faculty-row">
                    <div className="faculty-row__name">
                      <b>{faculty.name}</b>
                      <span>
                        {faculty.code}
                        {faculty.phase && ` · ${faculty.phase}`}
                        {faculty.synced_at && ` · traída el ${formatDate(faculty.synced_at)}`}
                      </span>
                    </div>

                    <div className="faculty-row__stats">
                      <span>
                        <b>{stats.total}</b> {stats.total === 1 ? "acción" : "acciones"}
                      </span>
                      <span>
                        <b>{stats.published}</b> publicadas
                      </span>
                      {stats.unresolved > 0 && (
                        <span className="is-risk">
                          <b>{stats.unresolved}</b> sin pilar
                        </span>
                      )}
                    </div>

                    <span className={`state-pill state-pill--${published ? "done" : "neutral"}`}>
                      <i aria-hidden="true" />
                      {published ? "Publicada" : "En borrador"}
                    </span>

                    {canEdit && (
                      <button
                        className={published ? "tray-act" : "tray-act tray-act--primary"}
                        type="button"
                        disabled={save.isPending || stats.total === 0}
                        title={
                          stats.total === 0 ? "Todavía no se ha traído su plan" : undefined
                        }
                        onClick={() =>
                          void setFacultyStatus(faculty, published ? "borrador" : "publicado")
                        }
                      >
                        {published ? "Retirar" : "Publicar plan"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* --- La bandeja de acciones -------------------------------------- */}
          <section className="admin-card">
            <div className="admin-card__head">
              <div className="faculties-head">
                <h2>Acciones</h2>
                <p>
                  El pilar se resuelve solo a partir del texto que declaró la facultad. Lo que no
                  case aparece aquí y se ancla a mano a una línea del plan.
                </p>
              </div>

              <div className="tray-tabs" role="group" aria-label="Filtrar las acciones">
                {(Object.keys(trayLabels) as Tray[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="tray-tab"
                    aria-pressed={tray === id}
                    onClick={() => setTray(id)}
                  >
                    {trayLabels[id]} <b>{counts[id]}</b>
                  </button>
                ))}
              </div>
            </div>

            <label className="tray-faculty">
              <span>Facultad</span>
              <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
                <option value="">Todas las facultades</option>
                {facultyRows.map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>
                    {faculty.code} · {faculty.name}
                  </option>
                ))}
              </select>
            </label>

            {visible.length === 0 ? (
              <EmptyBlock
                title={
                  tray === "sin-pilar"
                    ? "Todas las acciones engancharon con un pilar"
                    : "No hay acciones en esta vista"
                }
                hint={
                  counts.todas === 0
                    ? "Sincroniza con el origen para traer los planes de las facultades."
                    : "Prueba con otra pestaña o con otra facultad."
                }
              />
            ) : (
              <ul className="tray">
                {visible.map((row) => (
                  <li key={row.id}>
                    <ActionRow
                      row={row}
                      lineGroups={lineGroups}
                      canEdit={canEdit}
                      busy={save.isPending}
                      onAnchor={(lineId) => void anchor(row, lineId)}
                      onPublish={() => void setActionStatus(row, "publicado")}
                      onUnpublish={() => void setActionStatus(row, "borrador")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}

/* --- El informe de la última corrida ---------------------------------------- */

function SyncSummary({ report }: { report: SyncReport }) {
  const problems = report.skipped.length + report.orphans.length;

  return (
    <div className={`sync-report${problems > 0 ? " has-problems" : ""}`} role="status">
      <p className="sync-report__line">
        <Icon name={problems > 0 ? "alert" : "check"} size={15} />
        {report.faculties} {report.faculties === 1 ? "facultad" : "facultades"} ·{" "}
        {report.actions.created} {report.actions.created === 1 ? "acción nueva" : "acciones nuevas"} ·{" "}
        {report.actions.updated} actualizadas · {report.activities} actividades ·{" "}
        {report.followups} seguimientos
      </p>

      {report.skipped.length > 0 && (
        <ul className="sync-report__list">
          {report.skipped.map((row, index) => (
            <li key={`${row.faculty}-${index}`}>
              <b>{row.faculty}</b> se quedó fuera: {row.reason}
            </li>
          ))}
        </ul>
      )}

      {report.orphans.length > 0 && (
        <ul className="sync-report__list">
          {report.orphans.map((row) => (
            <li key={`${row.faculty}-${row.source_id}`}>
              <b>{row.faculty} · {row.source_id}</b> ya no viene del origen: «{row.title}». No se
              ha borrado.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --- Una fila de la bandeja -------------------------------------------------- */

interface LineGroup {
  id: string;
  label: string;
  lines: { id: string; code: string | null; name: string }[];
}

function ActionRow({
  row,
  lineGroups,
  canEdit,
  busy,
  onAnchor,
  onPublish,
  onUnpublish,
}: {
  row: FacultyActionAdminRow;
  lineGroups: LineGroup[];
  canEdit: boolean;
  busy: boolean;
  onAnchor: (lineId: string) => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const published = row.status === "publicado";
  const resolved = Boolean(row.pillar_id);
  const state = facultyActionStatus[row.initial_status];

  return (
    <article className={`tray-row${resolved ? "" : " tray-row--warn"}`}>
      <div className="tray-row__title">
        <b>{row.title}</b>
        <span>
          {row.faculty_code} · {row.dimension.toUpperCase()} {row.dimension_name} ·{" "}
          {deadlineText(row.deadline, row.deadline_label)}
        </span>
      </div>

      {/* Lo declarado frente a lo resuelto: la columna que importa. */}
      <div className="tray-row__map">
        <p className="tray-row__declared">
          <i>Declaró:</i> «{row.declared_pillar || "nada"}»
        </p>

        {resolved ? (
          <p className="tray-row__anchor">
            <i style={{ background: accentFor(row.pillar_accent) }} aria-hidden="true" />
            {row.pillar_numeral} · {row.pillar_name}
            {row.line_code && ` › ${row.line_code} ${row.line_name}`}
          </p>
        ) : canEdit ? (
          <label className="tray-row__select">
            <span className="sr-only">Línea de acción para {row.title}</span>
            <select value="" disabled={busy} onChange={(event) => onAnchor(event.target.value)}>
              <option value="">Anclar a una línea del PDI…</option>
              {lineGroups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.code} {line.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : (
          <p className="tray-row__declared">Sin pilar resuelto.</p>
        )}
      </div>

      <div className="tray-row__state">
        <span className={`state-pill state-pill--${published ? "done" : resolved ? "pending" : "risk"}`}>
          <i aria-hidden="true" />
          {published ? "Publicada" : resolved ? "Sin publicar" : "Sin pilar"}
        </span>
        <small>
          {state.label}
          {row.activity_count > 0 &&
            ` · ${row.activity_count} ${row.activity_count === 1 ? "actividad" : "actividades"}`}
          {row.last_progress !== null && ` · ${row.last_progress}%`}
        </small>
      </div>

      <div className="tray-row__actions">
        {canEdit &&
          (published ? (
            <button className="tray-act" type="button" onClick={onUnpublish} disabled={busy}>
              Retirar
            </button>
          ) : (
            <button
              className="tray-act tray-act--primary"
              type="button"
              onClick={onPublish}
              disabled={busy || !resolved}
              title={resolved ? undefined : "Hace falta que enganche con un pilar"}
            >
              Publicar
            </button>
          ))}
      </div>
    </article>
  );
}
