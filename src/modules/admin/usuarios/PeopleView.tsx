/* =============================================================================
   Personas: la lista a la izquierda y, a la derecha, la persona abierta o el
   asistente para crear una.

   La ficha responde tres preguntas en el mismo orden que el asistente —quién
   es, qué hace en toda la universidad, dónde trabaja— y termina con lo que
   podrá hacer, en palabras. El cambio de rol global es un UPDATE normal (RLS
   y el guardián del último administrador lo limitan); las unidades se guardan
   juntas con admin_set_memberships.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/ui/Icon";
import { Modal } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAccessRoles, useOdReportOptions, usePillarOwners, usePillars } from "../../../data/queries";
import { useDeleteUser, useSendPasswordReset, useUpdateProfile } from "../../../data/mutations";
import { formatDate } from "../../../data/pdi";
import { roleLabels, useAuth } from "../../../lib/auth";
import type { AccessRole, Profile } from "../../../types/database";
import {
  MembershipEditor,
  membershipProblem,
  toInput,
  newDraft,
  type MembershipDraft,
} from "./MembershipEditor";
import { UNIT_ROLE } from "../../tableros/model";
import { useSetMemberships, type Membership, type UnitOption } from "./people-db";
import { initials, personSummary } from "./summary";
import { UserWizard } from "./UserWizard";

type Filter = "todas" | "activas" | "inactivas" | "sin-unidad";

export function PeopleView({
  profiles,
  memberships,
  units,
  onNotice,
}: {
  profiles: { data?: Profile[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  memberships: Membership[];
  units: UnitOption[];
  onNotice: (text: string) => void;
}) {
  const access = useAccessRoles();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [roleFilter, setRoleFilter] = useState("");
  const selected = params.get("persona");
  const creating = params.get("nueva") === "1";

  const roles = access.data?.roles ?? [];
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const membershipsOf = (id: string) => memberships.filter((m) => m.profileId === id);

  const list = profiles.data ?? [];
  const rows = useMemo(() => {
    const needle = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return list.filter((person) => {
      if (filter === "activas" && !person.is_active) return false;
      if (filter === "inactivas" && person.is_active) return false;
      const mine = memberships.filter((m) => m.profileId === person.id);
      if (filter === "sin-unidad" && mine.length > 0) return false;
      if (roleFilter && person.access_role_id !== roleFilter && !mine.some((m) => m.accessRoleId === roleFilter)) {
        return false;
      }
      if (!needle) return true;
      const units = mine.map((m) => unitById.get(m.unitId)?.name ?? "").join(" ");
      return `${person.full_name} ${person.email} ${person.unit ?? ""} ${units}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .includes(needle);
    });
  }, [list, query, filter, roleFilter, memberships, unitById]);

  const open = (change: { persona?: string | null; nueva?: boolean }) => {
    const next = new URLSearchParams(params);
    next.delete("persona");
    next.delete("nueva");
    if (change.persona) next.set("persona", change.persona);
    if (change.nueva) next.set("nueva", "1");
    setParams(next, { replace: true });
  };

  const current = list.find((person) => person.id === selected);
  const counts = {
    todas: list.length,
    activas: list.filter((p) => p.is_active).length,
    inactivas: list.filter((p) => !p.is_active).length,
    "sin-unidad": list.filter((p) => !memberships.some((m) => m.profileId === p.id)).length,
  };
  const FILTERS: { id: Filter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "activas", label: "Activas" },
    { id: "inactivas", label: "Inactivas" },
    { id: "sin-unidad", label: "Sin unidad" },
  ];

  return (
    <div className="us-split">
      <aside className="us-list" aria-label="Personas">
        <label className="users-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Buscar personas</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre, correo o unidad…"
          />
        </label>
        <div className="us-filters">
          <div className="us-segment" role="group" aria-label="Filtrar por estado">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label} <span>{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <label className="us-select">
            <span className="sr-only">Filtrar por rol</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">Cualquier rol</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {profiles.isPending ? (
          <LoadingBlock rows={6} label="Cargando personas" />
        ) : profiles.isError ? (
          <ErrorBlock error={profiles.error} onRetry={() => void profiles.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            title="Nadie coincide"
            hint={query || filter !== "todas" || roleFilter ? "Pruebe con otro filtro." : "Cree la primera persona."}
          />
        ) : (
          <ul className="us-people" aria-label={`${rows.length} personas`}>
            {rows.map((person) => {
              const mine = membershipsOf(person.id);
              const global = person.access_role_id ? roleById.get(person.access_role_id) : undefined;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    className="us-item us-person"
                    data-inactive={!person.is_active || undefined}
                    aria-current={person.id === selected ? "true" : undefined}
                    onClick={() => open({ persona: person.id })}
                  >
                    <span className="us-avatar" aria-hidden="true">
                      {initials(person.full_name || person.email)}
                    </span>
                    <span className="us-item__main">
                      <strong>{person.full_name || "Sin nombre"}</strong>
                      <small>{person.email}</small>
                      <span className="us-tags">
                        <span className="us-tag">{global?.name ?? roleLabels[person.role]}</span>
                        {mine.slice(0, 2).map((m) => (
                          <span key={m.id} className="us-tag us-tag--unit">
                            {unitById.get(m.unitId)?.code ?? "?"} · {UNIT_ROLE[m.role].label}
                          </span>
                        ))}
                        {mine.length > 2 && <span className="us-tag us-tag--unit">+{mine.length - 2}</span>}
                        {!person.is_active && <span className="us-tag us-tag--off">Inactiva</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="us-detail">
        {creating ? (
          <UserWizard
            units={units}
            reports={access.data?.reports ?? []}
            roles={roles}
            onCancel={() => open({})}
            onCreated={(id, text) => {
              onNotice(text);
              open({ persona: id });
            }}
          />
        ) : current ? (
          <PersonDetail
            key={current.id}
            person={current}
            profiles={list}
            roles={roles}
            reports={access.data?.reports ?? []}
            memberships={membershipsOf(current.id)}
            units={units}
            onNotice={onNotice}
            onDeleted={() => open({})}
          />
        ) : (
          <div className="us-empty">
            <Icon name="user" size={22} />
            <h3>{selected ? "Esa persona ya no está" : "Elija una persona"}</h3>
            <p>Verá qué hace en toda la universidad, dónde trabaja y qué podrá hacer, en palabras.</p>
            <button type="button" className="button-primary" onClick={() => open({ nueva: true })}>
              <Icon name="plus" size={15} /> Crear usuario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonDetail({
  person,
  profiles,
  roles,
  reports,
  memberships,
  units,
  onNotice,
  onDeleted,
}: {
  person: Profile;
  profiles: Profile[];
  roles: AccessRole[];
  reports: { access_role_id: string; report_slug: string }[];
  memberships: Membership[];
  units: UnitOption[];
  onNotice: (text: string) => void;
  onDeleted: () => void;
}) {
  const { profile: me } = useAuth();
  const pillars = usePillars();
  const reportOptions = useOdReportOptions();
  const owners = usePillarOwners();
  const updateProfile = useUpdateProfile();
  const sendReset = useSendPasswordReset();
  const deleteUser = useDeleteUser();
  const saveMemberships = useSetMemberships();
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = useMemo(
    () =>
      memberships.map((m) =>
        newDraft({ unitId: m.unitId, accessRoleId: m.accessRoleId, boardRole: m.role, title: m.title }),
      ),
    [memberships],
  );
  const [drafts, setDrafts] = useState<MembershipDraft[]>(initial);
  // Tras guardar, la lista vuelve de la base: se toma como punto de partida.
  // Solo si cambió de verdad, para no borrar lo que se está editando cuando
  // la consulta se repite al volver a la pestaña.
  const signature = JSON.stringify(memberships.map((m) => [m.unitId, m.accessRoleId, m.role, m.title]));
  useEffect(() => setDrafts(initial), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const globalRoles = roles.filter((role) => (role.scope ?? "global") === "global");
  const systemRoleId = (key: string) => roles.find((role) => role.is_system && role.key === key)?.id;
  const globalId = person.access_role_id ?? systemRoleId(person.role) ?? "";
  const global = roles.find((role) => role.id === globalId);
  const isMe = person.id === me?.id;
  const activeAdmins = profiles.filter((p) => p.role === "admin" && p.is_active).length;
  const isLastAdmin = person.role === "admin" && person.is_active && activeAdmins <= 1;
  const dirty =
    JSON.stringify(toInput(drafts)) !==
    JSON.stringify(toInput(initial));
  const problem = membershipProblem(drafts);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const summary = personSummary(
    global,
    reports,
    drafts.filter((d) => d.unitId).map((d) => ({ unit: unitById.get(d.unitId), role: roles.find((r) => r.id === d.accessRoleId), board: d.boardRole, title: d.title })),
    new Map((reportOptions.data ?? []).map((report) => [report.slug, report.name])),
  );
  const myPillars = (pillars.data ?? []).filter((pillar) =>
    (owners.data ?? []).some((row) => row.profile_id === person.id && row.pillar_id === pillar.id),
  );
  const name = person.full_name || person.email;

  async function run(work: () => Promise<unknown>, done: string) {
    setError("");
    try {
      await work();
      onNotice(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo completar.");
    }
  }

  return (
    <article className="us-person-detail" aria-labelledby="persona-nombre">
      <header className="us-detail__head">
        <div className="us-detail__who">
          <span className="us-avatar us-avatar--lg" aria-hidden="true">
            {initials(name)}
          </span>
          <div>
            <h2 id="persona-nombre">
              {person.full_name || "Sin nombre"}
              {isMe && <span className="record-flag">Usted</span>}
            </h2>
            <p>
              {person.email}
              {person.unit ? ` · ${person.unit}` : ""}
            </p>
            <p className="us-status" data-active={person.is_active}>
              <Icon name={person.is_active ? "check" : "clock"} size={13} />
              {person.is_active ? "Activa" : "Inactiva"} · desde {formatDate(person.created_at)}
            </p>
          </div>
        </div>
        <div className="us-detail__actions">
          <button
            type="button"
            className="button-ghost"
            disabled={sendReset.isPending}
            onClick={() => void run(() => sendReset.mutateAsync(person.email), `Se envió un enlace de acceso a ${person.email}.`)}
          >
            Enviar acceso
          </button>
          <button
            type="button"
            className="button-ghost"
            disabled={isLastAdmin || isMe || updateProfile.isPending}
            onClick={() =>
              void run(
                () => updateProfile.mutateAsync({ id: person.id, values: { is_active: !person.is_active } }),
                `${name} quedó ${person.is_active ? "inactiva" : "activa"}.`,
              )
            }
          >
            {person.is_active ? "Desactivar" : "Activar"}
          </button>
          <button
            type="button"
            className="button-ghost"
            data-tone="danger"
            disabled={isMe || isLastAdmin}
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar
          </button>
        </div>
      </header>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <section className="us-block" aria-labelledby="que-hace">
        <header>
          <h3 id="que-hace">Qué hace en toda la universidad</h3>
          <Link to={`/admin/usuarios/roles?rol=${globalId}`} className="us-link">
            Ver el rol
          </Link>
        </header>
        <label className="admin-field">
          <span className="sr-only">Rol de toda la intranet</span>
          <select
            value={globalId}
            disabled={isLastAdmin || updateProfile.isPending}
            onChange={(event) => {
              const role = roles.find((item) => item.id === event.target.value);
              void run(
                () => updateProfile.mutateAsync({ id: person.id, values: { access_role_id: event.target.value } }),
                `${name} ahora entra como ${role?.name ?? "otro rol"}.`,
              );
            }}
          >
            {globalRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <small>{global?.description}</small>
          {isLastAdmin && <small className="us-raised">Es el único administrador activo: su rol no se puede cambiar.</small>}
        </label>
        {person.role === "responsable" && (
          <small className="users-hint">
            {myPillars.length > 0
              ? `Pilares: ${myPillars.map((pillar) => pillar.name).join(", ")}`
              : "Sin pilares: asígnelos en Gestión de pilares."}
          </small>
        )}
      </section>

      <section className="us-block" aria-labelledby="donde-trabaja">
        <header>
          <h3 id="donde-trabaja">Dónde trabaja</h3>
          <small>
            En cada unidad: su función con los datos (Gestor, Contribuyente o Consulta), su cargo y, si reporta o
            revisa en Impacto, su rol. Lo que se guarda es exactamente esta lista.
          </small>
        </header>
        <MembershipEditor value={drafts} onChange={setDrafts} units={units} roles={roles} disabled={saveMemberships.isPending} />
        {dirty && (
          <div className="us-savebar">
            {problem && <small className="us-raised">{problem}</small>}
            <button type="button" className="button-ghost" onClick={() => setDrafts(initial)}>
              Descartar
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={Boolean(problem) || saveMemberships.isPending}
              onClick={() =>
                void run(
                  () => saveMemberships.mutateAsync({ profileId: person.id, rows: toInput(drafts) }),
                  `Se guardaron las unidades de ${name}.`,
                )
              }
            >
              {saveMemberships.isPending ? "Guardando…" : "Guardar unidades"}
            </button>
          </div>
        )}
      </section>

      <aside className="us-summary" aria-label="Lo que podrá hacer">
        <h3>Lo que podrá hacer</h3>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </aside>

      {confirmDelete && (
        <Modal
          title="Eliminar usuario"
          description={`La cuenta de ${person.email} se eliminará por completo, con sus unidades y pilares. Si solo quiere retirarle el acceso, desactívela.`}
          onClose={() => setConfirmDelete(false)}
        >
          <div className="modal-actions">
            <button className="button-ghost" type="button" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
            <button
              className="button-danger"
              type="button"
              disabled={deleteUser.isPending}
              onClick={async () => {
                setError("");
                try {
                  await deleteUser.mutateAsync(person.id);
                  setConfirmDelete(false);
                  onNotice(`Se eliminó la cuenta de ${person.email}.`);
                  onDeleted();
                } catch (deleteError) {
                  setConfirmDelete(false);
                  setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el usuario.");
                }
              }}
            >
              {deleteUser.isPending ? "Eliminando…" : "Eliminar cuenta"}
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
