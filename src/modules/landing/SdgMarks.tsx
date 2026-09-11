/* =============================================================================
   Marcas de ODS.

   El número es el dato; el color oficial de Naciones Unidas solo lo refuerza.
   Diecisiete colores no se separan bajo daltonismo ni aunque se intente, así
   que ningún objetivo se identifica por su tono: el número va dentro de la
   marca y el nombre viaja en la etiqueta accesible.

   Se usa en dos sitios y con dos preguntas distintas:
     · la franja de la portada pinta los diecisiete (`showAll`), porque es una
       matriz y los objetivos sin aporte también dicen algo;
     · el resultado de "tu ruta" pinta solo los que aplican, con su nombre,
       porque ahí es una respuesta y no una comparación.
   ========================================================================== */

import { Link } from "react-router-dom";
import { sdgGoals } from "../../data/pdi";

interface SdgMarksProps {
  /** Los objetivos con aporte. */
  goals: number[];
  /** Pintar los diecisiete, encendidos y apagados. */
  showAll?: boolean;
  /** Acompañar el número con el nombre del objetivo. */
  named?: boolean;
  /** Qué es esta lista, para quien no la ve. */
  label: string;
}

export function SdgMarks({ goals, showAll = false, named = false, label }: SdgMarksProps) {
  const on = new Set(goals);
  const shown = showAll ? sdgGoals : sdgGoals.filter((goal) => on.has(goal.id));

  if (shown.length === 0) return null;

  return (
    <ul className={`sdg-marks${named ? " sdg-marks--named" : ""}`} aria-label={label}>
      {shown.map((goal) => {
        const isOn = on.has(goal.id);
        return (
          <li key={goal.id}>
            <Link
              className={`sdg-mark${isOn ? " is-on" : ""}`}
              to="/ods"
              style={{ "--sdg": goal.color, "--sdg-ink": goal.ink } as React.CSSProperties}
              title={`${goal.id} · ${goal.label}`}
              aria-label={`Objetivo ${goal.id}, ${goal.label}${isOn ? "" : " · sin aporte declarado"}`}
            >
              <span className="sdg-mark__number" aria-hidden="true">
                {goal.id}
              </span>
              {named && (
                <span className="sdg-mark__label" aria-hidden="true">
                  {goal.label}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
