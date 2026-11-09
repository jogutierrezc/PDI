/* =============================================================================
   Intranet · Portales públicos.

   La administración abre o cierra cada portal público y cambia, por un tiempo, los
   vínculos del menú de la página pública. Solo el rol admin (la base lo exige
   también: migración 0263).

   Tres vistas, en el riel de la cabecera:
     · Portales   interruptor, mensaje de mantenimiento, fecha de regreso, vista previa.
     · Menú       ocultar, renombrar o redirigir cada vínculo, con un periodo.
     · Historial  quién cambió qué y cuándo.

   El sitio público falla abierto: si la migración no está aplicada, todo funciona
   como siempre y esta pantalla lo avisa.
   ========================================================================== */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { AdminRail, AdminRailTab, AdminShell } from "../components/AdminShell";
import { claves, leerBitacora, leerMenu, leerPortales } from "./datos";
import { TabHistorial } from "./TabHistorial";
import { TabMenu } from "./TabMenu";
import { TabPortales } from "./TabPortales";
import { Cargando, FaltaMigracion, Fallo } from "./Piezas";
import "./portales-publicos.css";

type Vista = "portales" | "menu" | "historial";

export function PortalesPublicos() {
  const location = useLocation();
  // La franja de aviso del sitio manda aquí con el portal que se estaba viendo.
  const enfocar = (location.state as { portal?: string } | null)?.portal;
  const [vista, setVista] = useState<Vista>("portales");

  const portales = useQuery({ queryKey: claves.portales, queryFn: leerPortales, staleTime: 15_000 });
  const menu = useQuery({ queryKey: claves.menu, queryFn: leerMenu, staleTime: 15_000 });
  const bitacora = useQuery({ queryKey: claves.bitacora, queryFn: leerBitacora, staleTime: 15_000, enabled: vista === "historial" });

  const lista = portales.data && !portales.data.falta ? portales.data.datos : [];
  const filasMenu = menu.data && !menu.data.falta ? menu.data.datos : [];
  const nombres = useMemo(() => new Map(lista.map((p) => [p.slug, p.nombre])), [lista]);
  const cerrados = lista.filter((p) => !p.habilitado).length;
  const falta = portales.data?.falta === true || menu.data?.falta === true;

  return (
    <AdminShell
      section="portales_publicos"
      kicker="Sistema"
      title="Portales públicos"
      description="Abra o cierre cada portal público y cambie, por un tiempo, los vínculos de su menú. Todo cambio queda en el historial."
      rail={
        <AdminRail label="Vistas de Portales públicos">
          <AdminRailTab current={vista === "portales"} count={cerrados} onSelect={() => setVista("portales")}>
            Portales
          </AdminRailTab>
          <AdminRailTab current={vista === "menu"} count={filasMenu.length} onSelect={() => setVista("menu")}>
            Menú
          </AdminRailTab>
          <AdminRailTab current={vista === "historial"} onSelect={() => setVista("historial")}>
            Historial
          </AdminRailTab>
        </AdminRail>
      }
    >
      {portales.isPending ? (
        <Cargando que="Leyendo los portales…" />
      ) : portales.isError ? (
        <Fallo error={portales.error} onRetry={() => void portales.refetch()} />
      ) : falta ? (
        <FaltaMigracion />
      ) : (
        <>
          {vista === "portales" && <TabPortales portales={lista} enfocar={enfocar} />}
          {vista === "menu" &&
            (menu.isPending ? (
              <Cargando que="Leyendo los cambios del menú…" />
            ) : menu.isError ? (
              <Fallo error={menu.error} onRetry={() => void menu.refetch()} />
            ) : (
              <TabMenu portales={lista} filas={filasMenu} />
            ))}
          {vista === "historial" &&
            (bitacora.isPending ? (
              <Cargando que="Leyendo el historial…" />
            ) : bitacora.isError ? (
              <Fallo error={bitacora.error} onRetry={() => void bitacora.refetch()} />
            ) : bitacora.data.falta ? (
              <FaltaMigracion />
            ) : (
              <TabHistorial filas={bitacora.data.datos} actualizando={bitacora.isFetching} onActualizar={() => void bitacora.refetch()} nombres={nombres} />
            ))}
        </>
      )}
    </AdminShell>
  );
}
