/* =============================================================================
   UDES en Cifras · piezas de interfaz de las estaciones.

   Paneles, estado de guardado y confirmación en línea. Sin modales: borrar un
   indicador pide confirmar en el mismo sitio, y el foco no salta a otra capa.
   ========================================================================== */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";

export function Panel({
  title,
  description,
  actions,
  children,
  id,
  tone,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  tone?: "quiet";
}) {
  return (
    <section className="oda-panel" aria-labelledby={id ? `${id}-titulo` : undefined} id={id} data-tone={tone}>
      <header className="oda-panel__head">
        <div>
          <h2 id={id ? `${id}-titulo` : undefined}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="oda-panel__actions">{actions}</div>}
      </header>
      <div className="oda-panel__body">{children}</div>
    </section>
  );
}

/** Estado de una escritura: guardando, guardado (se desvanece) o error con el motivo. */
export function SaveState({ pending, error, success, idle }: { pending: boolean; error: unknown; success: boolean; idle?: string }) {
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (!success) return;
    setShowSuccess(true);
    const timer = window.setTimeout(() => setShowSuccess(false), 2600);
    return () => window.clearTimeout(timer);
  }, [success]);

  if (pending) {
    return (
      <span className="oda-save" data-state="pending" role="status">
        <span className="oda-save__spinner" aria-hidden="true" /> Guardando…
      </span>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar.";
    return (
      <span className="oda-save" data-state="error" role="alert">
        <Icon name="alert" size={14} /> {message}
      </span>
    );
  }
  if (showSuccess) {
    return (
      <span className="oda-save" data-state="ok" role="status">
        <Icon name="check" size={14} /> Guardado
      </span>
    );
  }
  return idle ? <span className="oda-save">{idle}</span> : null;
}

/** Botón que pide confirmar en el mismo sitio antes de una acción destructiva. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="oda-link-button" data-tone="danger" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </button>
    );
  }
  return (
    <span className="oda-confirm" role="group" aria-label={confirmLabel}>
      <span>{confirmLabel}</span>
      <button
        type="button"
        className="oda-link-button"
        data-tone="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Sí, borrar
      </button>
      <button type="button" className="oda-link-button" onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}

/** Aviso cuando no hay informe elegido o el informe no tiene lo que la estación necesita. */
export function StageEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="oda-stage-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
