/* =============================================================================
   Cómo trabaja cada persona con los datos de Impacto: vista sencilla o hoja
   de cálculo. Es una sola elección para todas las vistas (Catálogo, Periodo,
   Mi reporte, Revisión), se cambia desde la barra de Impacto y se recuerda en
   este navegador. Es comodidad de quien trabaja, no un permiso: lo que cada
   quien puede escribir lo deciden sus capacidades, en cualquiera de las dos.
   ========================================================================== */

import { useCallback, useState } from "react";
import { Icon } from "../../../components/ui/Icon";

export type WorkMode = "sencillo" | "hoja";

/** La misma clave de siempre: quien ya había elegido hoja en «Mi reporte» la conserva. */
const KEY = "impacto:modo-captura";

function read(): WorkMode {
  try {
    return window.localStorage.getItem(KEY) === "hoja" ? "hoja" : "sencillo";
  } catch {
    return "sencillo";
  }
}

export function useWorkMode(): [WorkMode, (mode: WorkMode) => void] {
  const [mode, setState] = useState<WorkMode>(read);
  const set = useCallback((next: WorkMode) => {
    setState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* Sin almacenamiento: vuelve a sencilla al recargar. */
    }
  }, []);
  return [mode, set];
}

export function ModeSwitch({ mode, onMode }: { mode: WorkMode; onMode: (mode: WorkMode) => void }) {
  return (
    <div className="ia-mode" role="group" aria-label="Forma de trabajar con los datos">
      <button type="button" aria-pressed={mode === "sencillo"} onClick={() => onMode("sencillo")}>
        <Icon name="columns" size={14} /> Vista sencilla
      </button>
      <button type="button" aria-pressed={mode === "hoja"} onClick={() => onMode("hoja")}>
        <Icon name="table" size={14} /> Hoja de cálculo
      </button>
    </div>
  );
}
