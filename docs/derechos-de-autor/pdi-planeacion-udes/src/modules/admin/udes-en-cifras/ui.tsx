/* =============================================================================
   UDES en Cifras · piezas de interfaz de las estaciones.

   Paneles, estado de guardado y confirmación en línea. Sin modales: borrar un
   indicador pide confirmar en el mismo sitio, y el foco no salta a otra capa.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from "react";
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

/**
 * Botón que pide confirmar en el mismo sitio antes de una acción destructiva.
 *
 * La confirmación dice qué se borra (`subject`) y qué se pierde con ello
 * (`confirmLabel`). Las dos salidas no se parecen: «Cancelar» es un botón de
 * contorno y recibe el foco al abrir; la destructiva va rellena, con su verbo.
 * Escape cancela y el foco vuelve al botón que la abrió. Dentro de una celda de
 * tabla se despliega sobre la fila, anclada a la derecha, en vez de desbordar
 * la columna de acciones (ver `.oda-confirm` en od-admin.css).
 */
export function ConfirmButton({
  label,
  subject,
  confirmLabel,
  confirmAction,
  onConfirm,
  disabled,
}: {
  /** El botón en reposo: "Borrar", "Quitar", "Borrar 2024". Su primera palabra es el verbo. */
  label: string;
  /** Qué se borra, con artículo: "el indicador «Matrícula»". */
  subject?: string;
  /** Qué se pierde al hacerlo. */
  confirmLabel: string;
  /** El botón destructivo; por defecto "Sí, borrar" / "Sí, quitar". */
  confirmAction?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  const id = useId();

  useEffect(() => {
    if (asking) cancel.current?.focus();
    else if (restore.current) {
      restore.current = false;
      trigger.current?.focus();
    }
  }, [asking]);

  const close = () => {
    restore.current = true;
    setAsking(false);
  };

  if (!asking) {
    return (
      <button ref={trigger} type="button" className="oda-link-button" data-tone="danger" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </button>
    );
  }

  const verb = label.trim().split(/\s+/)[0] || "Borrar";
  return (
    <span
      className="oda-confirm"
      role="alertdialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      <span className="oda-confirm__text">
        <strong id={`${id}-titulo`}>
          <Icon name="alert" size={14} /> {subject ? `¿${verb} ${subject}?` : `¿${label}?`}
        </strong>
        <span id={`${id}-texto`}>{confirmLabel}</span>
      </span>
      <span className="oda-confirm__actions">
        <button ref={cancel} type="button" className="oda-confirm__cancel" onClick={close}>
          Cancelar
        </button>
        <button
          type="button"
          className="oda-confirm__danger"
          onClick={() => {
            close();
            onConfirm();
          }}
        >
          {confirmAction ?? `Sí, ${verb.toLowerCase()}`}
        </button>
      </span>
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

/**
 * Años con dato de un indicador o conjunto: todos los del periodo, o solo
 * algunos. `null` es "todos"; así un periodo que se alarga no deja años fuera.
 */
export function YearPicker({
  years,
  value,
  onChange,
  disabled,
  label = "Años con dato",
}: {
  years: number[];
  value: number[] | null;
  onChange: (next: number[] | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const all = !value || value.length === 0;
  const chosen = all ? years : years.filter((y) => value!.includes(y));
  const toggle = (year: number) => {
    const next = chosen.includes(year) ? chosen.filter((y) => y !== year) : [...chosen, year].sort((a, b) => a - b);
    // Todos marcados es lo mismo que "todos"; ninguno no se permite.
    if (next.length === 0) return;
    onChange(next.length === years.length ? null : next);
  };
  return (
    <fieldset className="oda-years" disabled={disabled}>
      <legend>{label}</legend>
      <div className="oda-years__mode">
        <label>
          <input type="radio" checked={all} onChange={() => onChange(null)} />
          Todos ({years[0]}-{years[years.length - 1]})
        </label>
        <label>
          <input type="radio" checked={!all} onChange={() => onChange(years.slice(-1))} />
          Solo algunos
        </label>
      </div>
      {!all && (
        <div className="oda-years__chips">
          {years.map((year) => (
            <button key={year} type="button" className="oda-year-chip" aria-pressed={chosen.includes(year)} onClick={() => toggle(year)}>
              {year}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** "2014-A": año y periodo académico. Con allowYear, también el año completo ("2014"). */
export function PeriodInput<T extends "A" | "B" | "anual" = "A" | "B">({
  value,
  onChange,
  label,
  min = 1990,
  max = new Date().getFullYear() + 1,
  allowYear = false,
}: {
  value: { year: number; term: T };
  onChange: (next: { year: number; term: T }) => void;
  label: string;
  min?: number;
  max?: number;
  allowYear?: boolean;
}) {
  return (
    <span className="oda-period-input" role="group" aria-label={label}>
      <span className="oda-period-input__label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value.year}
        aria-label={`${label}: año`}
        onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
      />
      <select value={value.term} aria-label={`${label}: periodo`} onChange={(e) => onChange({ ...value, term: e.target.value as T })}>
        <option value="A">1</option>
        <option value="B">2</option>
        {allowYear && <option value="anual">Año</option>}
      </select>
    </span>
  );
}

/** Periodos académicos de un rango, en orden: 2014-A, 2014-B, 2015-A… */
export function periodRange(from: { year: number; term: "A" | "B" }, to: { year: number; term: "A" | "B" }): string[] {
  const index = (p: { year: number; term: "A" | "B" }) => p.year * 2 + (p.term === "B" ? 1 : 0);
  const [a, b] = [index(from), index(to)].sort((x, y) => x - y);
  const labels: string[] = [];
  for (let i = a; i <= b && labels.length < 200; i += 1) labels.push(`${Math.floor(i / 2)}-${i % 2 ? "B" : "A"}`);
  return labels;
}
