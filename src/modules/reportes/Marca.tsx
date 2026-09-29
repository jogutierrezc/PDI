/* Marca de estado: círculo de 16 px con glifo y texto oculto. El color nunca
   va solo: Con errores lleva una equis, Validada y Enviada un visto. */

import { Icon } from "../../components/ui/Icon";
import type { Estado } from "./tipos";
import { ETIQUETA_ESTADO } from "./util";

export function Marca({ estado }: { estado: Estado }) {
  const glifo = estado === "errores" ? "close" : estado === "validada" || estado === "enviada" ? "check" : null;
  return (
    <span className="ri-mark" data-s={estado} title={ETIQUETA_ESTADO[estado]}>
      {glifo && <Icon name={glifo} size={10} strokeWidth={3} />}
      <span className="sr-only">{ETIQUETA_ESTADO[estado]}</span>
    </span>
  );
}
