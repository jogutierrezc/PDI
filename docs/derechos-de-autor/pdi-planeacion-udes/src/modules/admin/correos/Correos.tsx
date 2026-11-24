/* =============================================================================
   Intranet · Correos.

   Lo que dice cada correo de cuenta del Portal de Planeación y de Mr. Pilo,
   cómo llega, quién lo firma, por dónde sale y qué pasó con cada envío.

   Tres vistas, en el riel de la cabecera:
     · Plantillas              los textos, con vista previa y prueba.
     · Remitentes y conexión   el servidor SMTP, los remitentes y los topes.
     · Bitácora                qué salió, a quién (enmascarado) y si falló.

   Las dos primeras son de la administración. Planeación entra solo a la
   bitácora: así lo deciden también las políticas de la base (migración 0137),
   que es donde se autoriza de verdad.

   El envío lo hace la función del servidor `correos`; esta pantalla comparte
   con ella `servidor-logica.ts`, y por eso la vista previa es el correo real.
   ========================================================================== */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminRail, AdminRailTab, AdminShell, ReadOnlyNotice } from "../components/AdminShell";
import { useAuth } from "../../../lib/auth";
import { claves, leerConfiguracion } from "./datos";
import { Bitacora } from "./Bitacora";
import { Conexion } from "./Conexion";
import { Plantillas } from "./Plantillas";
import { Cargando, FaltaMigracion, Fallo } from "./partes";
import "./correos.css";

type Vista = "plantillas" | "conexion" | "bitacora";

export function Correos() {
  const { hasRole } = useAuth();
  const administra = hasRole("admin");
  const [vista, setVista] = useState<Vista>(administra ? "plantillas" : "bitacora");
  const config = useQuery({ queryKey: claves.configuracion, queryFn: leerConfiguracion, enabled: administra, staleTime: 60_000 });
  const actual: Vista = administra ? vista : "bitacora";

  return (
    <AdminShell
      section="correos"
      kicker="Sistema"
      title="Correos"
      description="Lo que dice cada correo de cuenta del Portal de Planeación y de Mr. Pilo, cómo llega, quién lo firma y qué pasó con cada envío."
      rail={
        administra ? (
          <AdminRail label="Vistas de Correos">
            <AdminRailTab current={actual === "plantillas"} onSelect={() => setVista("plantillas")}>
              Plantillas
            </AdminRailTab>
            <AdminRailTab current={actual === "conexion"} onSelect={() => setVista("conexion")}>
              Remitentes y conexión
            </AdminRailTab>
            <AdminRailTab current={actual === "bitacora"} onSelect={() => setVista("bitacora")}>
              Bitácora
            </AdminRailTab>
          </AdminRail>
        ) : undefined
      }
    >
      {!administra && <ReadOnlyNotice>Su rol permite consultar la bitácora. Las plantillas y la conexión las cambia la administración.</ReadOnlyNotice>}

      {actual === "bitacora" && <Bitacora />}
      {administra &&
        (config.isPending ? (
          actual !== "bitacora" && <Cargando que="Leyendo las plantillas y la conexión…" />
        ) : config.isError ? (
          actual !== "bitacora" && <Fallo error={config.error} onRetry={() => void config.refetch()} />
        ) : config.data.falta ? (
          actual !== "bitacora" && <FaltaMigracion />
        ) : (
          // Las dos quedan montadas: cambiar de vista no pierde un borrador sin guardar.
          <>
            <div hidden={actual !== "plantillas"}>
              <Plantillas config={config.data.datos} />
            </div>
            <div hidden={actual !== "conexion"}>
              <Conexion config={config.data.datos} />
            </div>
          </>
        ))}
    </AdminShell>
  );
}
