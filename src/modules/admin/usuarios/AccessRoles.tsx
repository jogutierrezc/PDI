/* =============================================================================
   Roles de acceso.

   Un rol dice tres cosas: qué capacidad tiene quien lo lleva (la escalera de
   siempre: consulta, responsable de pilar, planeación, administración), qué
   pantallas de la intranet ve y, dentro de UDES en Cifras, sobre qué informes
   escribe. Así una oficina carga y publica lo suyo sin ver lo demás.

   Los cuatro roles clásicos vienen de fábrica y no se borran: si desaparecieran,
   los perfiles que cuelgan de ellos se quedarían sin capacidad. Los demás se
   crean aquí y se pueden borrar cuando ya no quedan personas asignadas.

   Lo que se decide en esta pantalla no es decoración: las mismas reglas están
   en la base (has_screen, od_can_edit_report), así que un rol sin un informe no
   lo escribe aunque alguien llame a la API por su cuenta.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAccessRoles, useOdReportOptions } from "../../../data/queries";
import { useDeleteAccessRole, useSaveAccessRole } from "../../../data/mutations";
import { roleDescriptions, roleLabels } from "../../../lib/auth";
import type { AccessRole, AdminScreen, AppRole, Profile } from "../../../types/database";

const ROLES: AppRole[] = ["consulta", "responsable", "planeacion", "admin"];

/** Las pantallas del menú, en el orden en que aparecen en él. */
export const SCREEN_GROUPS: { label: string; screens: { id: AdminScreen; label: string }[] }[] = [
  {
    label: "Portal de Planeación",
    screens: [
      { id: "office", label: "Página de la oficina" },
      { id: "documents", label: "Documentos" },
    ],
  },
  {
    label: "Plan de Desarrollo",
    screens: [
      { id: "pillars", label: "Gestión de pilares" },
      { id: "projects", label: "Proyectos" },
      { id: "faculties", label: "PDI por facultad" },
      { id: "campus", label: "PDI por campus" },
      { id: "budget", label: "Presupuesto" },
      { id: "repository", label: "Repositorio" },
    ],
  },
  { label: "UDES en Cifras", screens: [{ id: "cifras", label: "Estaciones del periodo" }] },
  { label: "Observatorio de Analítica", screens: [{ id: "observatorio", label: "Taller del Observatorio" }] },
  { label: "Mis Tableros", screens: [{ id: "tableros", label: "Unidades y tableros" }] },
  {
    label: "Sistema",
    screens: [
      { id: "structure", label: "Normalizar estructura" },
      { id: "parameters", label: "Parámetros globales" },
      { id: "development", label: "Desarrollo tecnológico" },
      { id: "users", label: "Usuarios y roles" },
    ],
  },
];

export const SCREEN_LABELS: Record<AdminScreen, string> = Object.fromEntries(
  SCREEN_GROUPS.flatMap((group) => group.screens.map((screen) => [screen.id, screen.label])),
) as Record<AdminScreen, string>;

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Resumen legible del alcance de un rol, para la tabla. */
function scopeOf(role: AccessRole, reports: string[], reportNames: Map<string, string>) {
  const screens = role.all_screens
    ? "Todas las pantallas"
    : role.screens.length === 0
      ? "Ninguna pantalla"
      : role.screens.map((screen) => SCREEN_LABELS[screen] ?? screen).join(", ");
  const scope = role.all_reports
    ? "Todos los informes"
    : reports.length === 0
      ? "Ningún informe"
      : reports.map((slug) => reportNames.get(slug) ?? slug).join(", ");
  return { screens, scope };
}

export function AccessRolesPanel({ profiles }: { profiles: Profile[] }) {
  const access = useAccessRoles();
  const reportOptions = useOdReportOptions();
  const save = useSaveAccessRole();
  const remove = useDeleteAccessRole();
  const [editing, setEditing] = useState<AccessRole | "nuevo" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccessRole | null>(null);
  const [error, setError] = useState("");

  const reportNames = useMemo(
    () => new Map((reportOptions.data ?? []).map((report) => [report.slug, report.name])),
    [reportOptions.data],
  );
  const reportsOf = (roleId: string) =>
    (access.data?.reports ?? []).filter((row) => row.access_role_id === roleId).map((row) => row.report_slug);
  const peopleOf = (roleId: string) => profiles.filter((person) => person.access_role_id === roleId).length;

  return (
    <section className="admin-panel" aria-labelledby="roles-acceso">
      <header className="admin-panel__head">
        <div>
          <h2 id="roles-acceso">Roles de acceso</h2>
          <p>
            Qué puede hacer cada rol, qué pantallas ve y, en UDES en Cifras, sobre qué informes escribe. Un rol con
            informes propios no ve los ajenos ni siquiera escribiendo la dirección a mano.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={() => setEditing("nuevo")}>
          <Icon name="plus" size={15} /> Nuevo rol
        </button>
      </header>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {access.isPending ? (
        <LoadingBlock rows={3} label="Cargando roles de acceso" />
      ) : access.isError ? (
        <ErrorBlock error={access.error} onRetry={() => void access.refetch()} />
      ) : (
        <div className="table-scroll">
          <table className="users-table">
            <caption className="sr-only">Roles de acceso con su capacidad, pantallas e informes</caption>
            <thead>
              <tr>
                <th scope="col">Rol</th>
                <th scope="col">Capacidad</th>
                <th scope="col">Pantallas</th>
                <th scope="col">Informes</th>
                <th scope="col">Personas</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(access.data?.roles ?? []).map((role) => {
                const reports = reportsOf(role.id);
                const { screens, scope } = scopeOf(role, reports, reportNames);
                const people = peopleOf(role.id);
                return (
                  <tr key={role.id}>
                    <th scope="row">
                      <strong>
                        {role.name}
                        {role.is_system && <span className="record-flag">De fábrica</span>}
                      </strong>
                      {role.description && <small>{role.description}</small>}
                    </th>
                    <td>{roleLabels[role.base_role]}</td>
                    <td>{screens}</td>
                    <td>{scope}</td>
                    <td>{people}</td>
                    <td className="users-actions">
                      <button type="button" className="oda-link-button" onClick={() => setEditing(role)}>
                        Editar
                      </button>
                      {!role.is_system && (
                        <button
                          type="button"
                          className="oda-link-button"
                          data-tone="danger"
                          disabled={people > 0}
                          title={people > 0 ? "Reasigna primero a quienes lo llevan" : undefined}
                          onClick={() => setPendingDelete(role)}
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AccessRoleForm
          role={editing === "nuevo" ? null : editing}
          reports={editing === "nuevo" ? [] : reportsOf(editing.id)}
          reportOptions={reportOptions.data ?? []}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSubmit={async (role, reportSlugs) => {
            setError("");
            try {
              await save.mutateAsync({ role, reports: reportSlugs });
              setEditing(null);
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el rol.");
            }
          }}
        />
      )}

      {pendingDelete && (
        <Modal
          title={`Borrar el rol ${pendingDelete.name}`}
          description="El rol desaparece de la lista. Las personas que lo llevaban tendrían que recibir otro, así que solo se puede borrar cuando ya no queda nadie con él."
          onClose={() => setPendingDelete(null)}
        >
          <div className="modal-actions">
            <button type="button" className="button-ghost" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={remove.isPending}
              onClick={async () => {
                setError("");
                try {
                  await remove.mutateAsync(pendingDelete.id);
                } catch (deleteError) {
                  setError(deleteError instanceof Error ? deleteError.message : "No se pudo borrar el rol.");
                }
                setPendingDelete(null);
              }}
            >
              {remove.isPending ? "Borrando…" : "Borrar rol"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function AccessRoleForm({
  role,
  reports,
  reportOptions,
  pending,
  onSubmit,
  onClose,
}: {
  role: AccessRole | null;
  reports: string[];
  reportOptions: { slug: string; name: string }[];
  pending: boolean;
  onSubmit: (
    role: Partial<AccessRole> & { key: string; name: string; base_role: AppRole },
    reports: string[],
  ) => void | Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [baseRole, setBaseRole] = useState<AppRole>(role?.base_role ?? "planeacion");
  const [allScreens, setAllScreens] = useState(role?.all_screens ?? false);
  const [screens, setScreens] = useState<AdminScreen[]>(role?.screens ?? ["cifras"]);
  const [allReports, setAllReports] = useState(role?.all_reports ?? false);
  const [picked, setPicked] = useState<string[]>(reports);
  const system = role?.is_system ?? false;

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void onSubmit(
      {
        ...(role ? { id: role.id } : {}),
        key: role?.key ?? slugify(name),
        name: name.trim(),
        description: description.trim(),
        base_role: baseRole,
        screens: allScreens ? [] : screens,
        all_screens: allScreens,
        all_reports: allReports,
        ...(role ? {} : { position: 50 }),
      },
      allReports ? [] : picked,
    );
  }

  return (
    <Modal
      title={role ? `Editar ${role.name}` : "Nuevo rol de acceso"}
      description={
        system
          ? "Es un rol de fábrica: su capacidad no se cambia, pero sí puedes ajustar qué pantallas e informes alcanza."
          : "Nombra el rol por lo que hace la persona, por ejemplo “Editor de Investigación”."
      }
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="admin-field">
          <span>Nombre del rol</span>
          <input required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Editor de Investigación" />
        </label>

        <label className="admin-field">
          <span>Para qué es</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Carga y publica el informe de Investigación."
          />
        </label>

        <label className="admin-field">
          <span>Capacidad</span>
          <select value={baseRole} disabled={system} onChange={(event) => setBaseRole(event.target.value as AppRole)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabels[option]}
              </option>
            ))}
          </select>
          <small>{roleDescriptions[baseRole]}</small>
          {(baseRole === "consulta" || baseRole === "responsable") && (allScreens || screens.includes("cifras")) && (
            <small className="users-warning">
              En UDES en Cifras esta capacidad solo consulta. Para cargar y publicar informes, elige Planeación.
            </small>
          )}
        </label>

        <fieldset className="admin-field">
          <legend>Pantallas de la intranet</legend>
          <label className="radio-row">
            <input type="checkbox" checked={allScreens} onChange={(event) => setAllScreens(event.target.checked)} />
            <span>
              <strong>Todas</strong>
              <small>Ve el menú completo, con el permiso que le dé su capacidad.</small>
            </span>
          </label>
          {!allScreens &&
            SCREEN_GROUPS.map((group) => (
              <div key={group.label} className="users-screens">
                <strong>{group.label}</strong>
                {group.screens.map((screen) => (
                  <label key={screen.id} className="oda-check">
                    <input
                      type="checkbox"
                      checked={screens.includes(screen.id)}
                      onChange={() => setScreens((list) => toggle(list, screen.id))}
                    />
                    {screen.label}
                    {screen.id === "users" && <small> · solo tiene efecto con capacidad de administración</small>}
                    {screen.id === "tableros" && (
                      <small> · quien pertenece a una unidad lo ve aunque no se marque aquí</small>
                    )}
                  </label>
                ))}
              </div>
            ))}
        </fieldset>

        <fieldset className="admin-field">
          <legend>Informes de UDES en Cifras</legend>
          <label className="radio-row">
            <input type="radio" name="reports" checked={allReports} onChange={() => setAllReports(true)} />
            <span>
              <strong>Todos los informes</strong>
              <small>También el periodo, sus campus y la creación de informes.</small>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="reports" checked={!allReports} onChange={() => setAllReports(false)} />
            <span>
              <strong>Solo estos informes</strong>
              <small>Los demás no aparecen en la intranet. El periodo queda en consulta.</small>
            </span>
          </label>
          {!allReports && baseRole !== "admin" && picked.length === 0 && (
            <small className="users-warning">Sin informes marcados, este rol no ve ni edita ningún informe.</small>
          )}
          {!allReports && (
            <div className="users-screens">
              {reportOptions.length === 0 ? (
                <small>Todavía no hay informes en UDES en Cifras.</small>
              ) : (
                reportOptions.map((report) => (
                  <label key={report.slug} className="oda-check">
                    <input
                      type="checkbox"
                      checked={picked.includes(report.slug)}
                      onChange={() => setPicked((list) => toggle(list, report.slug))}
                    />
                    {report.name}
                  </label>
                ))
              )}
            </div>
          )}
        </fieldset>

        <ModalActions onCancel={onClose} submitLabel={pending ? "Guardando…" : role ? "Guardar rol" : "Crear rol"} />
      </form>
    </Modal>
  );
}
