/* Cumplimiento de Tipología · piezas pequeñas que se repiten (chips, perfiles, estado en Master). */

import { Icon } from "../../components/ui/Icon";
import { ESTADO_MASTER, type Resumen } from "./modelo";

export function ChipVeredicto({ veredicto }: { veredicto: string }) {
  if (veredicto === "Cumple")
    return (
      <span className="ct-chip" data-t="ok">
        <Icon name="check" size={13} />
        Cumple
      </span>
    );
  if (veredicto === "No cumple")
    return (
      <span className="ct-chip" data-t="risk">
        <Icon name="alert" size={13} />
        No cumple
      </span>
    );
  return (
    <span className="ct-chip" data-t="neutral" title={veredicto === "No aplica" ? "El contrato no tiene tipología 2026: no hay regla automática." : veredicto === "Pendiente de fuente" ? "Falta un insumo para evaluar la regla de este perfil." : "El perfil aún no tiene reglas en el modelo."}>
      {veredicto === "No aplica" ? "Sin tipología" : veredicto === "Pendiente de fuente" ? "Falta una fuente" : "Sin regla"}
    </span>
  );
}

export function ChipMaster({ estado }: { estado: string }) {
  const e = ESTADO_MASTER[estado] ?? ESTADO_MASTER.SIN_DATO_MASTER;
  return (
    <span className="ct-chip" data-t={e.tono}>
      {e.tono === "ok" && <Icon name="check" size={13} />}
      {e.tono === "wait" && <Icon name="clock" size={13} />}
      {e.texto}
    </span>
  );
}

export function PerfilTag({ perfil, sugerido = false }: { perfil: string; sugerido?: boolean }) {
  return <span className={sugerido ? "ct-perfil ct-perfil--sug" : "ct-perfil"}>{perfil || "Sin perfil"}</span>;
}

/** Lo que se lee de una sugerencia en la lista: mantener, cambiar a otro perfil o ajustar la carga. */
export function Sugerencia({ fila }: { fila: Pick<Resumen, "sugerencia" | "perfil" | "perfil_sugerido"> }) {
  if (fila.sugerencia === "mantener") return <span className="ct-sug">Mantener</span>;
  if (fila.sugerencia === "cambiar") return <span className="ct-sug ct-sug--go">{fila.perfil} &rarr; {fila.perfil_sugerido}</span>;
  if (fila.sugerencia === "ajustar") return <span className="ct-sug">Ajustar carga</span>;
  return <span className="ct-sug">—</span>;
}
