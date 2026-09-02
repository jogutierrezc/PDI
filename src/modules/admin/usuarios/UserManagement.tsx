/* =============================================================================
   Usuarios y roles.

   El alta pasa por la Edge Function admin-users porque crear una cuenta exige
   la clave de servicio, que no puede estar en el navegador. El cambio de rol,
   en cambio, es un UPDATE normal: las políticas RLS ya lo limitan a
   administradores y un disparador impide dejar el portal sin ninguno.
   ========================================================================== */

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { Icon } from "../../../components/ui/Icon";
import { Modal, ModalActions } from "../../../components/ui/Modal";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { usePillarOwners, usePillars, useProfiles } from "../../../data/queries";
import {
  useCreateUser,
  useDeleteUser,
  useSendPasswordReset,
  useUpdateProfile,
} from "../../../data/mutations";
import { roleDescriptions, roleLabels, useAuth } from "../../../lib/auth";
import { formatDate } from "../../../data/pdi";
import type { AppRole, Profile } from "../../../types/database";

const ROLES: AppRole[] = ["consulta", "responsable", "planeacion", "admin"];

export function UserManagement() {
  const profiles = useProfiles();
  const pillars = usePillars();
  const owners = usePillarOwners();
  const { profile: me } = useAuth();

  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const updateProfile = useUpdateProfile();
  const sendReset = useSendPasswordReset();

  const rows = useMemo(() => {
    const list = profiles.data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((person) =>
      `${person.full_name} ${person.email} ${person.unit ?? ""}`.toLowerCase().includes(needle),
    );
  }, [profiles.data, query]);

  const activeAdmins = (profiles.data ?? []).filter(
    (person) => person.role === "admin" && person.is_active,
  ).length;

  function pillarsOf(profileId: string) {
    const ids = (owners.data ?? [])
      .filter((row) => row.profile_id === profileId)
      .map((row) => row.pillar_id);
    return (pillars.data ?? []).filter((pillar) => ids.includes(pillar.id));
  }

  async function changeRole(person: Profile, role: AppRole) {
    setError("");
    setNotice("");
    try {
      await updateProfile.mutateAsync({ id: person.id, values: { role } });
      setNotice(`${person.full_name || person.email} ahora es ${roleLabels[role]}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo cambiar el rol.");
    }
  }

  async function toggleActive(person: Profile) {
    setError("");
    setNotice("");
    try {
      await updateProfile.mutateAsync({ id: person.id, values: { is_active: !person.is_active } });
      setNotice(
        `${person.full_name || person.email} quedó ${person.is_active ? "desactivado" : "activo"}.`,
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo cambiar el estado.");
    }
  }

  async function resetPassword(person: Profile) {
    setError("");
    setNotice("");
    try {
      await sendReset.mutateAsync(person.email);
      setNotice(`Se envió un enlace de acceso a ${person.email}.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "No se pudo enviar el enlace.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setError("");
    try {
      await deleteUser.mutateAsync(pendingDelete.id);
      setNotice(`Se eliminó la cuenta de ${pendingDelete.email}.`);
      setPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el usuario.");
      setPendingDelete(null);
    }
  }

  return (
    <AdminShell
      section="users"
      kicker="Administración · Personas"
      title="Usuarios y roles"
      description="Quién entra a la intranet, con qué permisos y de qué pilares responde."
      actions={
        <button className="button-primary" type="button" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Crear usuario
        </button>
      }
    >
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

      <section className="role-legend" aria-label="Qué puede hacer cada rol">
        {ROLES.map((role) => (
          <div key={role}>
            <strong>{roleLabels[role]}</strong>
            <small>{roleDescriptions[role]}</small>
          </div>
        ))}
      </section>

      <div className="users-toolbar">
        <label className="users-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Buscar usuarios</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, correo o dependencia…"
          />
        </label>
        <span className="users-count">
          {rows.length} de {profiles.data?.length ?? 0} personas
        </span>
      </div>

      {profiles.isPending ? (
        <LoadingBlock rows={5} label="Cargando usuarios" />
      ) : profiles.isError ? (
        <ErrorBlock error={profiles.error} onRetry={() => void profiles.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          title="Sin usuarios que coincidan"
          hint={query ? "Prueba con otro término de búsqueda." : "Crea el primer usuario del portal."}
        />
      ) : (
        <div className="table-scroll">
          <table className="users-table">
            <caption className="sr-only">Usuarios de la intranet con su rol, estado y pilares asignados</caption>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Rol</th>
                <th scope="col">Pilares asignados</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const isMe = person.id === me?.id;
                // Un administrador no puede degradarse ni desactivarse si es el
                // último: el disparador lo rechazaría, así que se desactiva el
                // control en vez de dejar que falle.
                const isLastAdmin = person.role === "admin" && person.is_active && activeAdmins <= 1;
                const assigned = pillarsOf(person.id);

                return (
                  <tr key={person.id} className={person.is_active ? undefined : "is-inactive"}>
                    <th scope="row">
                      <strong>
                        {person.full_name || "Sin nombre"}
                        {isMe && <span className="record-flag">Tú</span>}
                      </strong>
                      <small>{person.email}</small>
                      {person.unit && <small>{person.unit}</small>}
                    </th>

                    <td>
                      <label className="sr-only" htmlFor={`role-${person.id}`}>
                        Rol de {person.full_name || person.email}
                      </label>
                      <select
                        id={`role-${person.id}`}
                        value={person.role}
                        disabled={isLastAdmin || updateProfile.isPending}
                        onChange={(event) => void changeRole(person, event.target.value as AppRole)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                      {isLastAdmin && <small className="users-hint">Único administrador activo</small>}
                    </td>

                    <td>
                      {person.role === "responsable" ? (
                        assigned.length > 0 ? (
                          <span className="users-pillars">
                            {assigned.map((pillar) => (
                              <span key={pillar.id}>{pillar.name}</span>
                            ))}
                          </span>
                        ) : (
                          <small className="users-hint">
                            Sin pilares · asígnalos en Gestión de pilares
                          </small>
                        )
                      ) : (
                        <small className="users-hint">
                          {person.role === "consulta" ? "Solo lectura" : "Todos los pilares"}
                        </small>
                      )}
                    </td>

                    <td>
                      <span className={`status-badge status-badge--${person.is_active ? "cumplida" : "pendiente"}`}>
                        <span className="status-badge__glyph" aria-hidden="true">
                          {person.is_active ? "✓" : "○"}
                        </span>
                        {person.is_active ? "Activo" : "Inactivo"}
                      </span>
                      <small className="users-hint">Desde {formatDate(person.created_at)}</small>
                    </td>

                    <td>
                      <div className="users-actions">
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => void resetPassword(person)}
                          disabled={sendReset.isPending}
                        >
                          Enviar acceso
                        </button>
                        <button
                          type="button"
                          className="button-ghost"
                          onClick={() => void toggleActive(person)}
                          disabled={isLastAdmin || isMe}
                        >
                          {person.is_active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          className="icon-button managed-card__delete"
                          onClick={() => setPendingDelete(person)}
                          disabled={isMe || isLastAdmin}
                          aria-label={`Eliminar la cuenta de ${person.email}`}
                        >
                          <Icon name="close" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateUserModal
          pending={createUser.isPending}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            setError("");
            try {
              const result = await createUser.mutateAsync(input);
              setNotice(
                result.invited
                  ? `Se envió una invitación a ${input.email}.`
                  : `Se creó la cuenta de ${input.email}.`,
              );
              setCreating(false);
            } catch (createError) {
              setError(createError instanceof Error ? createError.message : "No se pudo crear el usuario.");
            }
          }}
        />
      )}

      {pendingDelete && (
        <Modal
          title="Eliminar usuario"
          description={`La cuenta de ${pendingDelete.email} se eliminará por completo, junto con sus asignaciones de pilar. Si solo quieres retirarle el acceso temporalmente, desactívala en su lugar.`}
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
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Eliminando…" : "Eliminar cuenta"}
            </button>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

function CreateUserModal({
  pending,
  onSubmit,
  onClose,
}: {
  pending: boolean;
  onSubmit: (input: {
    email: string;
    full_name: string;
    role: AppRole;
    unit?: string;
    password?: string;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState<AppRole>("consulta");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void onSubmit({
      email,
      full_name: fullName,
      role,
      unit: unit.trim() || undefined,
      password: mode === "password" ? password : undefined,
    });
  }

  return (
    <Modal
      title="Crear usuario"
      description="La cuenta se crea en Supabase y su perfil queda con el rol elegido."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="admin-field">
          <span>Nombre completo</span>
          <input required value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>

        <label className="admin-field">
          <span>Correo institucional</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre.apellido@udes.edu.co"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>

        <label className="admin-field">
          <span>Dependencia</span>
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="Ej. Dirección TIC"
          />
        </label>

        <label className="admin-field">
          <span>Rol</span>
          <select value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabels[option]}
              </option>
            ))}
          </select>
          <small>{roleDescriptions[role]}</small>
        </label>

        <fieldset className="admin-field">
          <legend>Cómo entra por primera vez</legend>
          <label className="radio-row">
            <input
              type="radio"
              name="mode"
              checked={mode === "invite"}
              onChange={() => setMode("invite")}
            />
            <span>
              <strong>Enviar invitación</strong>
              <small>Recibe un correo y elige su propia contraseña. Recomendado.</small>
            </span>
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="mode"
              checked={mode === "password"}
              onChange={() => setMode("password")}
            />
            <span>
              <strong>Fijar una contraseña ahora</strong>
              <small>Útil si no hay correo saliente configurado todavía.</small>
            </span>
          </label>
        </fieldset>

        {mode === "password" && (
          <label className="admin-field">
            <span>Contraseña inicial</span>
            <input
              required
              type="text"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
            <small>Compártela por un canal seguro y pide que la cambie al entrar.</small>
          </label>
        )}

        <ModalActions onCancel={onClose} submitLabel={pending ? "Creando…" : "Crear usuario"} />
      </form>
    </Modal>
  );
}
