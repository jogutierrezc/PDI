/* =============================================================================
   Panel de errores. Solo existe después de «Validar plantilla»: se abre solo
   esa vez, se cierra con la equis y vuelve desde el contador de errores. Cada
   error dice fila y campo, qué está mal y la sección del manual; un clic lleva
   a la casilla. Si el motor trae un arreglo, va como botón debajo.
   Con miles de errores se muestran de 200 en 200.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import type { ErrorFila, PlantillaSpec } from "./tipos";
import { entrarPanel } from "./movimiento";

const LOTE = 200;

interface PanelErroresProps {
  spec: PlantillaSpec;
  errores: ErrorFila[];
  /** La entrada se anima solo cuando la abre «Validar plantilla» o el contador. */
  animar: number;
  /** Hay errores de validaciones anteriores que esta sesión no conoce: pide validar otra vez. */
  pendientesDeValidar: boolean;
  soloLectura: boolean;
  onCerrar: () => void;
  onIr: (e: ErrorFila) => void;
  onArreglar: (e: ErrorFila) => void;
}

export function PanelErrores({ spec, errores, animar, pendientesDeValidar, soloLectura, onCerrar, onIr, onArreglar }: PanelErroresProps) {
  const ref = useRef<HTMLElement>(null);
  const [mostrar, setMostrar] = useState(LOTE);

  useEffect(() => {
    if (animar) entrarPanel(ref.current);
  }, [animar]);

  const etiqueta = (codigo: string) => spec.campos.find((c) => c.codigo === codigo)?.etiqueta ?? codigo;
  const n = errores.length;
  const titulo = n ? `${n} ${n === 1 ? "error" : "errores"} por corregir` : pendientesDeValidar ? "Vuelva a validar" : "Plantilla sin errores";

  return (
    <aside className="ri-errs" aria-label="Errores de la plantilla" ref={ref}>
      <header>
        <h3>{titulo}</h3>
        <button type="button" className="ri-icon-btn" aria-label="Cerrar la lista de errores" onClick={onCerrar}>
          <Icon name="close" size={17} />
        </button>
        <p>Resultado de «Validar plantilla». Cada error cita la sección del manual del SNIES.</p>
      </header>
      <ol>
        {n === 0 && !pendientesDeValidar && (
          <li>
            <div className="ri-ok">
              <Icon name="check" size={17} />
              <span>Pasó todas las reglas, también los cruces con otras plantillas. Ya puede preparar el archivo para HECAA.</span>
            </div>
          </li>
        )}
        {n === 0 && pendientesDeValidar && (
          <li>
            <p className="ri-hint ri-pad">
              La última validación encontró errores que dependen de otras plantillas. Pulse «Validar plantilla» para verlos.
            </p>
          </li>
        )}
        {errores.slice(0, mostrar).map((e, k) => (
          <li key={`${e.fila}-${e.campo}-${k}`}>
            <button type="button" className="ri-go" onClick={() => onIr(e)}>
              <span className="ri-where">
                Fila {e.fila + 1} · <span>{etiqueta(e.campo)}</span>
              </span>
              <span className="ri-what">{e.mensaje}</span>
              <span className="ri-src">{e.seccion}</span>
            </button>
            {e.arreglo && !soloLectura && (
              <button type="button" className="ri-link ri-fix" onClick={() => onArreglar(e)}>
                {e.arreglo.etiqueta}
              </button>
            )}
          </li>
        ))}
        {n > mostrar && (
          <li>
            <button type="button" className="ri-link ri-fix" onClick={() => setMostrar(mostrar + LOTE)}>
              Ver {Math.min(LOTE, n - mostrar)} más de {n - mostrar} restantes
            </button>
          </li>
        )}
      </ol>
    </aside>
  );
}
