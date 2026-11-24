/* =============================================================================
   Acceso con Microsoft: quién puede entrar y con qué rol.

   Tres partes, en orden de urgencia:
     1. Esperando habilitación: personas que entraron con Microsoft y no están
        en la lista. Habilitar es agregar su correo con un rol.
     2. Agregar un correo o un dominio entero.
     3. La lista: cambiar el rol que recibirá, activar o desactivar, quitar.

   Lo que dice la lista se aplica en la base (0162), no aquí: esta pantalla solo
   escribe en access_allowlist. El rol de la lista se asigna al primer ingreso;
   cambiarlo después no mueve a quien ya entró (se hace desde su ficha). Quitar
   o desactivar un correo exacto sí cierra la cuenta.
   ========================================================================== */

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { ErrorBlock, LoadingBlock } from "../../../components/ui/QueryState";
import { useAccessRoles } from "../../../data/queries";
import type { AccessRole, Profile } from "../../../types/database";
import {
  isDomainEntry,
  parseEntry,
  useAllowlist,
  useDeleteAllowEntry,
  useSaveAllowEntry,
  type AllowEntry,
} from "./allowlist-db";
import { reason } from "./summary";

export function MicrosoftAccess({ profiles }: { profiles: Profile[] }) {
  const access = useAccessRoles();
  const list = useAllowlist();
  const save = useSaveAllowEntry();
  const remove = useDeleteAllowEntry();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [waitingRole, setWaitingRole] = useState<Record<string, string>>({});

  if (access.isPending || list.isPending) return <LoadingBlock rows={4} label="Cargando la lista de acceso" />;
  if (access.isError) return <ErrorBlock error={access.error} onRetry={() => void access.refetch()} />;
  if (list.isError) return <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />;

  const roles = access.data.roles;
  const guest = roles.find((role) => role.key === "invitado");
  // «Invitado» es el estado de quien espera: no se concede desde la lista.
  const grantable = roles.filter((role) => role.key !== "invitado");
  const defaultRole = grantable.find((role) => role.key === "consulta") ?? grantable[0];
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const chosen = roleId || defaultRole?.id || "";
  const waiting = profiles.filter((person) => !person.is_active && guest && person.access_role_id === guest.id);

  async function run(work: () => Promise<unknown>, done: string, fail: string) {
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(done);
      return true;
    } catch (failure) {
      setError(reason(failure, fail));
      return false;
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const entry = parseEntry(email);
    if (!entry) {
      setError("Escriba un correo completo (ana@udes.edu.co) o un dominio con arroba (@udes.edu.co).");
      return;
    }
    const ok = await run(
      () => save.mutateAsync({ email: entry, full_name: name, note, access_role_id: chosen }),
      isDomainEntry(entry) ? `Todo ${entry} podrá entrar.` : `${entry} podrá entrar con Microsoft.`,
      "No se pudo agregar.",
    );
    if (ok) {
      setEmail("");
      setName("");
      setNote("");
    }
  }

  const enable = (person: Profile) =>
    run(
      () =>
        save.mutateAsync({
          email: person.email.toLowerCase(),
          full_name: person.full_name,
          note: "Habilitado desde la lista de espera.",
          access_role_id: waitingRole[person.id] || chosen,
        }),
      `${person.email} ya puede entrar.`,
      "No se pudo habilitar.",
    );

  return (
    <div className="us-allow">
      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}

      <section aria-labelledby="espera-titulo" className="us-allow__block">
        <header>
          <h3 id="espera-titulo">Esperando habilitación {waiting.length > 0 && <span className="us-state" data-state="actualiza">{waiting.length}</span>}</h3>
          <p>Entraron con Microsoft y su correo no está en la lista: solo ven lo público.</p>
        </header>
        {waiting.length === 0 ? (
          <p className="users-hint">Nadie está esperando.</p>
        ) : (
          <ul className="us-allow__rows">
            {waiting.map((person) => (
              <li key={person.id} className="us-allow__row">
                <span className="us-allow__who">
                  <strong>{person.full_name || "Sin nombre"}</strong>
                  <small>{person.email}</small>
                </span>
                <RoleSelect
                  roles={grantable}
                  value={waitingRole[person.id] || chosen}
                  onChange={(id) => setWaitingRole((prev) => ({ ...prev, [person.id]: id }))}
                  label={`Rol para ${person.email}`}
                />
                <button type="button" className="button-primary" disabled={save.isPending} onClick={() => void enable(person)}>
                  Habilitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="us-allow__block" onSubmit={(event) => void add(event)} aria-labelledby="agregar-titulo">
        <header>
          <h3 id="agregar-titulo">Agregar un correo o un dominio</h3>
          <p>Un dominio con arroba (@udes.edu.co) habilita a todas las cuentas de ese dominio; el correo exacto manda sobre él.</p>
        </header>
        <div className="us-allow__form">
          <label className="admin-field">
            <span>Correo o dominio</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ana.perez@udes.edu.co  ·  @udes.edu.co"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <label className="admin-field">
            <span>Rol que recibe</span>
            <RoleSelect roles={grantable} value={chosen} onChange={setRoleId} label="Rol que recibe" bare />
          </label>
          <label className="admin-field">
            <span>Nombre (opcional)</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="admin-field">
            <span>Nota (opcional)</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Para qué se habilita" />
          </label>
        </div>
        <div>
          <button type="submit" className="button-primary" disabled={save.isPending || !chosen} aria-busy={save.isPending}>
            <Icon name="plus" size={15} /> Agregar a la lista
          </button>
        </div>
      </form>

      <section aria-labelledby="lista-titulo" className="us-allow__block">
        <header>
          <h3 id="lista-titulo">Correos y dominios habilitados <span className="us-state" data-state="actualiza">{list.data.length}</span></h3>
          <p>
            El rol se asigna al primer ingreso. Para cambiar a quien ya entró, use su ficha en Personas. Quitar o
            desactivar un correo cierra su cuenta; con un dominio solo se dejan de admitir ingresos nuevos.
          </p>
        </header>
        {list.data.length === 0 ? (
          <p className="users-hint">La lista está vacía: nadie nuevo puede entrar con Microsoft.</p>
        ) : (
          <ul className="us-allow__rows">
            {list.data.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                role={roleById.get(entry.access_role_id)}
                roles={grantable}
                busy={save.isPending || remove.isPending}
                onChange={(patch, text) => void run(() => save.mutateAsync({ ...entry, ...patch }), text, "No se pudo guardar.")}
                onRemove={() => void run(() => remove.mutateAsync(entry.id), `${entry.email} salió de la lista.`, "No se pudo quitar.")}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RoleSelect({
  roles,
  value,
  onChange,
  label,
  bare,
}: {
  roles: AccessRole[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  bare?: boolean;
}) {
  const select = (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={bare ? undefined : label}>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
  return bare ? select : <label className="us-select">{select}</label>;
}

function EntryRow({
  entry,
  role,
  roles,
  busy,
  onChange,
  onRemove,
}: {
  entry: AllowEntry;
  role: AccessRole | undefined;
  roles: AccessRole[];
  busy: boolean;
  onChange: (patch: Partial<AllowEntry>, notice: string) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const domain = isDomainEntry(entry.email);
  return (
    <li className="us-allow__row" data-off={!entry.active || undefined}>
      <span className="us-allow__who">
        <strong>
          {entry.email} <span className="us-tag">{domain ? "Dominio" : "Correo"}</span>
        </strong>
        <small>{[entry.full_name, entry.note].filter(Boolean).join(" · ") || "Sin nota"}</small>
      </span>
      <RoleSelect
        roles={role && !roles.includes(role) ? [role, ...roles] : roles}
        value={entry.access_role_id}
        onChange={(id) => onChange({ access_role_id: id }, `El rol de ${entry.email} cambió para sus próximos ingresos.`)}
        label={`Rol de ${entry.email}`}
      />
      <label className="us-allow__switch">
        <input
          type="checkbox"
          checked={entry.active}
          disabled={busy}
          onChange={(event) =>
            onChange(
              { active: event.target.checked },
              event.target.checked ? `${entry.email} está activo.` : `${entry.email} quedó desactivado.`,
            )
          }
        />
        Activo
      </label>
      {confirm ? (
        <span className="us-allow__confirm">
          <button type="button" className="button-danger" disabled={busy} onClick={onRemove}>
            {domain ? "Quitar dominio" : "Quitar y cerrar su cuenta"}
          </button>
          <button type="button" className="button-ghost" onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </span>
      ) : (
        <button type="button" className="button-ghost" data-tone="danger" disabled={busy} onClick={() => setConfirm(true)}>
          Quitar
        </button>
      )}
    </li>
  );
}
