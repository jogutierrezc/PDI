/* =============================================================================
   El taller · cómo lee cada KPI su cifra.

   Por cada indicador del tablero, una de cuatro lecturas: promedio (la de
   siempre, por defecto), última cifra reportada, variación porcentual o la
   gráfica de evolución. La elección va en los ajustes del bloque
   (`settings.kpiModes`, por clave de indicador) y se guarda con la ficha:
   no hay migración. Elegir «promedio» borra la elección y deja el bloque
   como estaba.
   ========================================================================== */

import { KPI_MODES, KPI_MODE_HINT, KPI_MODE_LABEL, kpiModeOf, withKpiMode } from "../../../datos-abiertos/data/kpi-options";
import type { KpiMode } from "../../../datos-abiertos/data/kpi-options";

export interface KpiModePickerProps {
  options: { key: string; label: string }[];
  modes: Record<string, KpiMode> | undefined;
  disabled?: boolean;
  /** Las elecciones nuevas, ya limpias; undefined si todos vuelven al promedio. */
  onChange: (modes: Record<string, KpiMode> | undefined) => void;
}

export function KpiModePicker({ options, modes, disabled = false, onChange }: KpiModePickerProps) {
  if (!options.length) return null;
  const custom = options.filter((o) => kpiModeOf(modes, o.key) !== "promedio").length;
  return (
    <details className="odt-picker">
      <summary>
        Cómo se lee cada KPI: {custom ? `${custom} con lectura distinta del promedio` : "todos con el promedio"}
      </summary>
      <div className="odt-picker__body">
        {options.map((option) => {
          const mode = kpiModeOf(modes, option.key);
          const id = `odt-kpimode-${option.key}`;
          return (
            <label key={option.key} className="odt-field" htmlFor={id}>
              <span className="odt-field__label">{option.label}</span>
              <select id={id} value={mode} disabled={disabled} onChange={(e) => onChange(withKpiMode(modes, option.key, e.target.value as KpiMode))}>
                {KPI_MODES.map((m) => (
                  <option key={m} value={m}>{KPI_MODE_LABEL[m]}{m === "promedio" ? " (por defecto)" : ""}</option>
                ))}
              </select>
              <small className="odt-field__hint">{KPI_MODE_HINT[mode]}</small>
            </label>
          );
        })}
        <p className="odt-note">
          La variación y la gráfica parten de la primera cifra reportada y llegan a la última del rango que se ve. Un año sin
          reportar no cuenta como cero. Si la cifra inicial es cero, no hay base de comparación y se muestra «—».
        </p>
      </div>
    </details>
  );
}
