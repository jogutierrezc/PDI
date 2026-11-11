/* Tablero IGA · el programa abierto en la ventana de detalle vive en la dirección (?detalle=programa|sede): se comparte con un enlace. */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useDetalleUrl() {
  const [sp, setSp] = useSearchParams();
  const k = sp.get("detalle");
  const abrir = useCallback((valor: string) => { const n = new URLSearchParams(sp); n.set("detalle", valor); setSp(n, { replace: true }); }, [sp, setSp]);
  const cerrar = useCallback(() => { if (!sp.has("detalle")) return; const n = new URLSearchParams(sp); n.delete("detalle"); setSp(n, { replace: true }); }, [sp, setSp]);
  return { k, abrir, cerrar };
}
