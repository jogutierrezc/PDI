/* Programas en Cifras · piezas pequeñas propias: la ficha de estado de un archivo, los sellos de «responde a» y los avisos. */

import { Icon } from "../../../components/ui/Icon";
import { Ficha } from "../../../components/espacio/piezas";
import { destino as destinoDe, etiquetaSistema } from "../lib/destinos";
import type { PcEstado, PcRespuestaRow } from "../tipos";
import { estadoVisible } from "./logica";

export function FichaEstado({ estado, errores }: { estado: PcEstado; errores: number }) {
  const x = estadoVisible(estado, errores);
  return <Ficha clave={x.clave} texto={x.texto} icono={x.icono} />;
}

/** «CNA · 07», «SNIES · Graduados»: a qué responde un archivo. */
export function Sellos({ respuestas }: { respuestas: readonly Pick<PcRespuestaRow, "destino_id">[] }) {
  return (
    <>
      {respuestas.map((r) => {
        const d = destinoDe(r.destino_id);
        return d ? (
          <span className="es-tag" data-s={d.sistema} key={r.destino_id}>
            {etiquetaSistema(d)}
          </span>
        ) : null;
      })}
    </>
  );
}

export function AvisoMigracion({ mensaje }: { mensaje?: string }) {
  return (
    <div className="es-banner es-banner--risk" role="alert">
      <Icon name="alert" size={16} />
      <div>
        <b>{mensaje || "Falta aplicar la migración 0164 (Programas en Cifras)."}</b>
        <p>Mientras tanto el módulo no lee ni guarda nada. Aplique la migración en Supabase y recargue la página.</p>
      </div>
    </div>
  );
}
