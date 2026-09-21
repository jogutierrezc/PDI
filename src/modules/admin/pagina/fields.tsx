/* =============================================================================
   Página de la oficina · los campos.

   Un solo campo de texto para toda la pantalla, con su contador. El contador
   no impide escribir de más: dice cuánto llevas frente a lo que cabe bien en
   la banda, que es un consejo de maquetación, no una regla del dato. Cortar a
   la fuerza el titular de una campaña es peor que dejar que ocupe tres líneas.
   ========================================================================== */

import { useId } from "react";
import type { ReactNode } from "react";

interface TextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  /** Largo cómodo para esta banda. Solo informa. */
  comfortable?: number;
  rows?: number;
  wide?: boolean;
  type?: "text" | "email" | "url" | "tel";
}

export function Text({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  hint,
  comfortable,
  rows,
  wide,
  type = "text",
}: TextProps) {
  const id = useId();
  const long = comfortable !== undefined && value.length > comfortable;

  return (
    <label className={`admin-field${wide ? " admin-field--wide" : ""}`} htmlFor={id}>
      <span>
        {label}
        {comfortable !== undefined && (
          <output data-over={long || undefined}>
            {value.length}/{comfortable}
            {/* El ámbar nunca dice nada por sí solo: la palabra viaja con él. */}
            <span className={long ? "ofa-over" : "sr-only"}>{long ? " de más" : ` de ${comfortable} cómodos`}</span>
          </output>
        )}
      </span>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && <small className="ofa-hint">{hint}</small>}
    </label>
  );
}

/** Una lista de líneas (la formación de una persona), una por renglón. */
export function Lines({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <label className="admin-field admin-field--wide" htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        rows={3}
        value={value.join("\n")}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trimStart())
              .filter((line, index, all) => line !== "" || index < all.length - 1),
          )
        }
      />
      {hint && <small className="ofa-hint">{hint}</small>}
    </label>
  );
}
