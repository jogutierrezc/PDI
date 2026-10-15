/* =============================================================================
   Crear un usuario en tres pasos.

     1. Quién es: nombre, correo y cómo entra por primera vez.
     2. Qué hace en toda la universidad: su rol global.
     3. Dónde trabaja: unidades con su rol en cada una (opcional).

   Cierra con lo que podrá hacer, en palabras, antes de crear nada. La cuenta
   la crea la Edge Function admin-users (necesita la clave de servicio); las
   unidades, admin_set_memberships con el id que devuelve. Si lo segundo
   fallara, la cuenta ya existe: se dice así y se abre su ficha para
   completarla, en vez de fingir que no pasó nada.
   ========================================================================== */

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useCreateUser } from "../../../data/mutations";
import { useOdReportOptions } from "../../../data/queries";
import type { AccessRole } from "../../../types/database";
import { MembershipEditor, membershipProblem, toInput, type MembershipDraft } from "./MembershipEditor";
import { setMemberships, type UnitOption } from "./people-db";
import { describe, templateOf } from "./role-matrix";
import { personSummary, roleMatrix } from "./summary";

const STEPS = ["Quién es", "Qué hace en toda la universidad", "Dónde trabaja"];

export function UserWizard({
  units,
  roles,
  reports,
  roleUnits = [],
  onCancel,
  onCreated,
}: {
  units: UnitOption[];
  roles: AccessRole[];
  reports: { access_role_id: string; report_slug: string }[];
  /** Alcance de los roles en Impacto (access_role_units). */
  roleUnits?: { access_role_id: string; unit_id: string }[];
  onCancel: () => void;
  onCreated: (id: string, notice: string) => void;
}) {
  const createUser = useCreateUser();
  const reportOptions = useOdReportOptions();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [unit, setUnit] = useState("");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const globalRoles = roles;
  const [roleId, setRoleId] = useState(globalRoles.find((role) => role.key === "consulta")?.id ?? globalRoles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<MembershipDraft[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const role = globalRoles.find((item) => item.id === roleId);
  const unitById = new Map(units.map((item) => [item.id, item]));
  const summary = personSummary(
    role,
    reports,
    drafts.filter((d) => d.unitId).map((d) => ({ unit: unitById.get(d.unitId), board: d.boardRole, title: d.title })),
    new Map((reportOptions.data ?? []).map((report) => [report.slug, report.name])),
    roleUnits,
    new Map(units.map((item) => [item.id, item.name])),
  );
  const problem = membershipProblem(drafts);

  function next(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    void create();
  }

  async function create() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    let createdId: string | null = null;
    try {
      const result = await createUser.mutateAsync({
        email: email.trim(),
        full_name: fullName.trim(),
        role: role?.base_role ?? "consulta",
        access_role_id: roleId || null,
        unit: unit.trim() || undefined,
        password: mode === "password" ? password : undefined,
      });
      createdId = result.user.id;
      if (drafts.length > 0) await setMemberships(createdId, toInput(drafts));
      onCreated(
        createdId,
        result.invited ? `Se envió una invitación a ${email.trim()}.` : `Se creó la cuenta de ${email.trim()}.`,
      );
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "No se pudo crear el usuario.";
      if (createdId) {
        onCreated(createdId, `Se creó la cuenta, pero no sus unidades: ${message} Complételas en su ficha.`);
      } else setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="us-wizard" onSubmit={next} aria-labelledby="asistente-titulo">
      <header className="us-detail__head">
        <div>
          <h2 id="asistente-titulo">Crear usuario</h2>
          <p>Tres pasos. Nada se crea hasta el último.</p>
        </div>
      </header>

      <ol className="us-steps">
        {STEPS.map((label, index) => (
          <li key={label} data-state={index < step ? "hecho" : index === step ? "actual" : "pendiente"}>
            <button
              type="button"
              disabled={index > step || saving}
              aria-current={index === step ? "step" : undefined}
              onClick={() => setStep(index)}
            >
              <span className="us-steps__dot" aria-hidden="true">
                {index < step ? <Icon name="check" size={12} /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p className="admin-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      {step === 0 && (
        <div className="us-fields">
          <label className="admin-field">
            <span>Nombre completo</span>
            <input required autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} />
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
            <span>Dependencia (opcional)</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Ej. Dirección TIC" />
          </label>
          <fieldset className="us-scope">
            <legend>Cómo entra por primera vez</legend>
            <label className="us-option">
              <input type="radio" name="modo" checked={mode === "invite"} onChange={() => setMode("invite")} />
              <span>
                <strong>Enviar invitación</strong>
                <small>Recibe un correo y elige su contraseña. Recomendado.</small>
              </span>
            </label>
            <label className="us-option">
              <input type="radio" name="modo" checked={mode === "password"} onChange={() => setMode("password")} />
              <span>
                <strong>Fijar una contraseña ahora</strong>
                <small>Útil si todavía no hay correo saliente configurado.</small>
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
              <small>Compártala por un canal seguro y pida que la cambie al entrar.</small>
            </label>
          )}
        </div>
      )}

      {step === 1 && (
        <fieldset className="us-rolepick">
          <legend className="sr-only">Rol de toda la intranet</legend>
          {globalRoles.map((item) => {
            const matrix = roleMatrix(item, reports, roleUnits);
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
      )}

      {step === 2 && (
        <>
          <p className="users-hint">
            Opcional. En cada programa, facultad u oficina: su función con los datos (Gestor, Contribuyente o
            Consulta) y su cargo. También puede hacerlo después desde su ficha.
          </p>
          <MembershipEditor value={drafts} onChange={setDrafts} units={units} disabled={saving} />
          <aside className="us-summary" aria-label="Lo que podrá hacer">
            <h3>{fullName.trim() || "La persona"} podrá</h3>
            <ul>
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </aside>
        </>
      )}

      <footer className="us-wizard__foot">
        <button type="button" className="button-ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)} disabled={saving}>
          {step === 0 ? "Cancelar" : "Atrás"}
        </button>
        <button type="submit" className="button-primary" disabled={saving || (step === 2 && Boolean(problem))}>
          {step < STEPS.length - 1 ? (
            <>
              Siguiente <Icon name="arrow-right" size={15} />
            </>
          ) : saving ? (
            "Creando…"
          ) : mode === "invite" ? (
            "Crear y enviar invitación"
          ) : (
            "Crear usuario"
          )}
        </button>
      </footer>
    </form>
  );
}
