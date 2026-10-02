/* =============================================================================
   Mr. Pilo · cuentas (0120) · las piezas que comparten sus pantallas.

   Un campo con su etiqueta, su nota y su error junto a él (anunciado); un
   mensaje con glifo y palabra (nunca solo color); el selector de tono o de
   extensión; el de tema; la lista de lo que gana quien se registra; y la
   lista de lo que pide una contraseña.
   ========================================================================== */

import type { ReactNode } from "react";
import { APP_THEMES } from "../themes";
import type { AppTheme } from "../themes";
import { Icon } from "../icons";
import { ACCOUNT_BENEFITS, passwordChecks } from "./rules";

export function Msg({ tone, id, alert = false, children }: { tone: "ok" | "bad" | "info"; id?: string; alert?: boolean; children: ReactNode }) {
  return (
    <p className="pc-msg" data-t={tone} id={id} role={alert ? "alert" : "status"}>
      {tone === "ok" ? Icon.check : tone === "bad" ? Icon.close : Icon.dot}
      <span>{children}</span>
    </p>
  );
}

export interface FieldAria {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

/** Etiqueta, control, nota y error. El error va junto al campo, lo nombra `aria-describedby` y se anuncia. */
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; children: (aria: FieldAria) => ReactNode }) {
  const described = [hint ? `${id}-nota` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="pc-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": described })}
      {hint && (
        <span className="pc-hint" id={`${id}-nota`}>
          {hint}
        </span>
      )}
      {error && (
        <Msg tone="bad" id={`${id}-error`} alert>
          {error}
        </Msg>
      )}
    </div>
  );
}

/** Una elección entre pocas (tono, extensión): botones que dicen cuál está puesta. */
export function Seg<T extends string>({ label, value, options, onPick, disabled = false }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (id: T) => void; disabled?: boolean }) {
  return (
    <div className="pc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} disabled={disabled} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Los cinco temas de la app, con su muestra. */
export function ThemePicker({ value, onPick, labelledBy }: { value: AppTheme; onPick: (theme: AppTheme) => void; labelledBy: string }) {
  return (
    <div className="pa-temas pc-temas" role="group" aria-labelledby={labelledBy}>
      {APP_THEMES.map((t) => (
        <button key={t.id} type="button" className="pa-tema" aria-pressed={t.id === value} onClick={() => onPick(t.id)}>
          <span className="pa-tema__ring">
            <i className="pa-swatch" data-tema={t.id} aria-hidden="true" />
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Lo que gana quien se registra. */
export function Benefits({ title }: { title: string }) {
  return (
    <div className="pc-benefits">
      <p className="pc-label">{title}</p>
      <ul>
        {ACCOUNT_BENEFITS.map((b) => (
          <li key={b.title}>
            {Icon.check}
            <span>
              <strong>{b.title}</strong>
              <small>{b.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lo que pide la contraseña, con lo que ya cumple marcado (glifo y palabra). */
export function PasswordChecklist({ password, id }: { password: string; id: string }) {
  const c = passwordChecks(password);
  const items: [boolean, string][] = [
    [c.len, "8 caracteres o más"],
    [c.letter, "Una letra"],
    [c.num, "Un número"],
  ];
  return (
    <ul className="pc-checks" id={id} aria-label="Lo que pide la contraseña">
      {items.map(([ok, text]) => (
        <li key={text} data-ok={ok || undefined}>
          {ok ? Icon.check : Icon.dot}
          {text}
          <span className="pa-sr">{ok ? " (cumplido)" : " (falta)"}</span>
        </li>
      ))}
    </ul>
  );
}
