/* Pilo at Work · estado y conexión de Microsoft 365 (función pw-microsoft). */

import { useCallback, useEffect, useState } from "react";
import { callFn } from "./api";

export interface MsEstado {
  cargando: boolean;
  conectado: boolean;
  cuenta: string;
  scopes: string;
  configurado: boolean;
  correoPermitido: boolean;
  error: string;
}

export function useMs() {
  const [e, setE] = useState<MsEstado>({ cargando: true, conectado: false, cuenta: "", scopes: "", configurado: true, correoPermitido: false, error: "" });
  const recargar = useCallback(async () => {
    try {
      const r = await callFn<{ conectado: boolean; cuenta: string; scopes: string; configurado: boolean; correo_permitido: boolean }>("pw-microsoft", { action: "estado" });
      setE({ cargando: false, conectado: r.conectado, cuenta: r.cuenta, scopes: r.scopes, configurado: r.configurado, correoPermitido: r.correo_permitido, error: "" });
    } catch (err) {
      setE((x) => ({ ...x, cargando: false, error: err instanceof Error ? err.message : "No se pudo consultar Microsoft 365." }));
    }
  }, []);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  const tiene = (alcance: string) => e.scopes.toLowerCase().includes(alcance.toLowerCase());
  return { ...e, recargar, correoListo: e.conectado && tiene("Mail.Read"), agendaListo: e.conectado && tiene("Calendars"), puedeOrganizar: tiene("Mail.ReadWrite") };
}

/** Sale hacia Microsoft con los servicios pedidos; vuelve a /work/microsoft. */
export async function conectarMs(servicios: ("correo" | "agenda")[], organizar = true): Promise<void> {
  const r = await callFn<{ url: string }>("pw-microsoft", { action: "iniciar", servicios, organizar, borradores: organizar });
  window.location.assign(r.url);
}
