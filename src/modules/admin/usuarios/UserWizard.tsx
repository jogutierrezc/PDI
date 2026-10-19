/* =============================================================================
   Crear un usuario: un formulario corto.

     Correo · nombre · rol de acceso · unidades (opcional) · cómo entra.

   Crear = agregar el correo a la lista de acceso + la cuenta + el perfil
   (Edge Function admin-users, que necesita la clave de servicio). Por omisión
   la persona entra con su cuenta de Microsoft y no hay contraseña ni correo
   que enviar; la contraseña queda como alternativa. Las unidades las escribe
   admin_set_memberships con el id que devuelve la función; si eso fallara, la
   cuenta ya existe: se dice así y se abre su ficha para completarla.
   ========================================================================== */

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useCreateUser } from "../../../data/mutations";
import { useOdReportOptions } from "../../../data/queries";
import type { AccessRole } from "../../../types/database";
import { MembershipEditor, membershipProblem, toInput, type MembershipDraft } from "./MembershipEditor";
import { setMemberships, syncProgramasEnCifras, useProgramOffer, type UnitOption } from "./people-db";
import { describe, templateOf } from "./role-matrix";
import { personSummary, reason, roleMatrix } from "./summary";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UDES = /@([a-z0-9-]+\.)*udes\.edu\.co$/i;

export function UserWizard({
  units,
  roles,
  reports,
  roleUnits = [],
  informeUnits = [],
  existing = [],
  onCancel,
  onCreated,
}: {
  units: UnitOption[];
  roles: AccessRole[];
  reports: { access_role_id: string; report_slug: string }[];
  /** Alcance de los roles en Impacto (access_role_units). */
  roleUnits?: { access_role_id: string; unit_id: string }[];
  informeUnits?: { access_role_id: string; unit_id: string }[];
  /** Correos que ya tienen perfil, para avisar de un duplicado antes de enviar. */
  existing?: string[];
  onCancel: () => void;
  onCreated: (id: string, notice: string) => void;
}) {
  const createUser = useCreateUser();
  const reportOptions = useOdReportOptions();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"microsoft" | "password">("microsoft");
  const [password, setPassword] = useState("");
  // «Invitado» es el rol de quien aún no está habilitado: no se asigna a mano.
  const globalRoles = roles.filter((role) => role.key !== "invitado");
  const [roleId, setRoleId] = useState(globalRoles.find((role) => role.key === "consulta")?.id ?? globalRoles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<MembershipDraft[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const offer = useProgramOffer().data;
  const role = globalRoles.find((item) => item.id === roleId);
  const unitById = new Map(units.map((item) => [item.id, item]));
  const summary = personSummary(
    role,
    reports,
    drafts.filter((d) => d.unitId).map((d) => ({ unit: unitById.get(d.unitId), board: d.boardRole, title: d.title })),
    new Map((reportOptions.data ?? []).map((report) => [report.slug, report.name])),
    roleUnits,
    new Map(units.map((item) => [item.id, item.name])),
    informeUnits,
  );
  const problem = membershipProblem(drafts);

  const mail = email.trim().toLowerCase();
  const mailProblem = !mail
    ? ""
    : !EMAIL.test(mail)
      ? "Escriba el correo completo, como nombre@udes.edu.co."
      : existing.some((item) => item.toLowerCase() === mail)
        ? "Esa persona ya tiene cuenta: cambie su rol desde su ficha."
        : "";
  const outside = EMAIL.test(mail) && !UDES.test(mail);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mailProblem || problem) {
      setError(mailProblem || problem || "");
      return;
    }
    setSaving(true);
    let createdId: string | null = null;
    try {
      const result = await createUser.mutateAsync({
        email: mail,
        full_name: fullName.trim(),
        role: role?.base_role ?? "consulta",
        access_role_id: roleId || null,
        password: mode === "password" ? password : undefined,
      });
      createdId = result.user.id;
      if (drafts.length > 0) {
        await setMemberships(createdId, toInput(drafts));
        await syncProgramasEnCifras(createdId, drafts, offer);
      }
      onCreated(
        createdId,
        mode === "password"
          ? `Se creó la cuenta de ${mail} con contraseña.`
          : `${mail} quedó habilitado: entra con su cuenta de Microsoft.`,
      );
    } catch (failure) {
      const message = reason(failure, "No se pudo crear el usuario.");
      if (createdId) onCreated(createdId, `Se creó la cuenta, pero no sus unidades: ${message} Complételas en su ficha.`);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="us-wizard" onSubmit={(event) => void create(event)} aria-labelledby="asistente-titulo">
      <header className="us-detail__head">
        <div>
          <h2 id="asistente-titulo">Crear usuario</h2>
          <p>Se agrega a la lista de acceso con el rol que elija.</p>
        </div>
      </header>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <div className="us-fields">
        <label className="admin-field">
          <span>Correo</span>
          <input
            required
            autoFocus
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre.apellido@udes.edu.co"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(mailProblem)}
          />
          {mailProblem ? (
            <small className="us-raised">{mailProblem}</small>
          ) : outside ? (
            <small className="users-hint">No es un correo de UDES: no podrá entrar con Microsoft, solo con contraseña.</small>
          ) : null}
        </label>
        <label className="admin-field">
          <span>Nombre completo</span>
          <input required value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
      </div>

      <fieldset className="us-rolepick">
        <legend>Rol de acceso</legend>
        {globalRoles.map((item) => {
          const matrix = roleMatrix(item, reports, roleUnits, informeUnits);
          const template = templateOf(matrix);
          return (
            <label key={item.id} className="us-option us-option--card">
              <input type="radio" name="rol" checked={roleId === item.id} onChange={() => setRoleId(item.id)} />
              <span>
                <strong>
                  {item.name}
                  <span className="us-chip" data-template={template}>
                    {template === "personalizada" ? "Personalizada" : template.charAt(0).toUpperCase() + template.slice(1)}
                  </span>
                </strong>
                <small>{item.description || describe(matrix)[0]}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <details className="us-more">
        <summary>Unidades donde trabaja (opcional)</summary>
        <p className="users-hint">
          En cada programa, facultad u oficina: su función con los datos (Gestor, Contribuyente o Consulta) y su cargo.
          También puede hacerlo después desde su ficha.
        </p>
        <MembershipEditor value={drafts} onChange={setDrafts} units={units} disabled={saving} />
      </details>

      <fieldset className="us-scope">
        <legend>Cómo entra</legend>
        <label className="us-option">
          <input type="radio" name="modo" checked={mode === "microsoft"} onChange={() => setMode("microsoft")} />
          <span>
            <strong>Con su cuenta de Microsoft</strong>
            <small>Sin contraseña ni correo de invitación. Recomendado.</small>
          </span>
        </label>
        <label className="us-option">
          <input type="radio" name="modo" checked={mode === "password"} onChange={() => setMode("password")} />
          <span>
            <strong>Con correo y contraseña</strong>
            <small>Para quien no tiene cuenta de Microsoft de UDES.</small>
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
            autoComplete="off"
          />
          <small>Compártala por un canal seguro y pida que la cambie al entrar.</small>
        </label>
      )}

      <aside className="us-summary" aria-label="Lo que podrá hacer">
        <h3>{fullName.trim() || "La persona"} podrá</h3>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </aside>

      <footer className="us-wizard__foot">
        <button type="button" className="button-ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="button-primary" disabled={saving || Boolean(mailProblem || problem)} aria-busy={saving}>
          {saving ? "Creando…" : "Crear usuario"}
        </button>
      </footer>
    </form>
  );
}
