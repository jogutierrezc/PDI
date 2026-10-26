/* =============================================================================
   UDrive · Unidades de trabajo · el marco de las pantallas de unidades.

   La misma barra azul marino y el mismo riel de UDrive, con las entradas de
   este módulo. Dentro de una unidad, el riel lleva sus secciones.
   ========================================================================== */

import type { ReactNode } from "react";
import { BarraSuperior, EntradaRiel, EstadoPantalla, Riel, TituloRiel } from "../../../components/espacio/Marco";
import { useAuth } from "../../../lib/auth";
import { esFaltaMigracion } from "../datos";
import { ErrorBlock, CardSkeleton } from "../../../components/ui/QueryState";
import "../../../components/espacio/espacio.css";
import "../../../components/espacio/marco.css";
import "../ui/udrive.css";
import "./unidades.css";

export type SeccionUnidad = "inicio" | "archivos" | "personas" | "personalizar" | "espacio";

export function MarcoUnidades({ actual, unidad, children }: { actual: "lista" | "nueva" | "capacidad" | SeccionUnidad; unidad?: { id: string; nombre: string; puedeAdministrar: boolean }; children: ReactNode }) {
  const { hasRole } = useAuth();
  const admin = hasRole("admin");
  const enUnidad = Boolean(unidad);
  return (
    <div className="es pc ud un">
      <BarraSuperior sigla="UD" marca="UDrive" buscar="Buscar una unidad" onBuscar={() => document.getElementById("un-buscar")?.focus()} />
      <div className="pc-body">
        <Riel etiqueta="Unidades de trabajo">
          {enUnidad ? (
            <>
              <EntradaRiel icono="arrow-left" actual={false} to="/admin/udrive/unidades">Unidades de trabajo</EntradaRiel>
              <TituloRiel>{unidad!.nombre}</TituloRiel>
              <EntradaRiel icono="folder" actual={actual === "inicio"} to={`/admin/udrive/unidad/${unidad!.id}`}>Inicio</EntradaRiel>
              <EntradaRiel icono="document" actual={actual === "archivos"} to={`/admin/udrive/unidad/${unidad!.id}?s=archivos`}>Archivos</EntradaRiel>
              <EntradaRiel icono="users" actual={actual === "personas"} to={`/admin/udrive/unidad/${unidad!.id}?s=personas`}>Personas</EntradaRiel>
              {unidad!.puedeAdministrar ? <EntradaRiel icono="settings" actual={actual === "personalizar"} to={`/admin/udrive/unidad/${unidad!.id}?s=personalizar`}>Personalizar</EntradaRiel> : null}
              <EntradaRiel icono="chart" actual={actual === "espacio"} to={`/admin/udrive/unidad/${unidad!.id}?s=espacio`}>Espacio</EntradaRiel>
              <hr />
              <EntradaRiel icono="folder" actual={false} to="/admin/udrive">Mis archivos</EntradaRiel>
            </>
          ) : (
            <>
              <EntradaRiel icono="folder" actual={actual === "lista"} to="/admin/udrive/unidades">Unidades de trabajo</EntradaRiel>
              <EntradaRiel icono="plus" actual={actual === "nueva"} to="/admin/udrive/unidades/nueva">Nueva unidad</EntradaRiel>
              {admin ? (
                <>
                  <hr />
                  <TituloRiel>Administración general</TituloRiel>
                  <EntradaRiel icono="chart" actual={actual === "capacidad"} to="/admin/udrive/unidades/capacidad">Capacidad y registro</EntradaRiel>
                </>
              ) : null}
              <hr />
              <EntradaRiel icono="folder" actual={false} to="/admin/udrive">Mis archivos</EntradaRiel>
            </>
          )}
        </Riel>
        <main className="un-main" id="un-contenido">{children}</main>
      </div>
    </div>
  );
}

/** La espera y el error de una consulta de unidades, con el aviso de migración. */
export function EstadoUnidades({ cargando, error, reintentar }: { cargando: boolean; error: unknown; reintentar: () => void }) {
  if (cargando) return <EstadoPantalla><CardSkeleton count={3} /></EstadoPantalla>;
  if (esFaltaMigracion(error)) {
    return (
      <EstadoPantalla>
        <div className="es-empty"><b>Falta preparar las unidades de trabajo</b><span>{(error as Error).message} Pida a quien administra la base de datos que la aplique; mientras tanto, el resto de UDrive funciona igual.</span></div>
      </EstadoPantalla>
    );
  }
  return <EstadoPantalla><ErrorBlock error={error as Error} onRetry={reintentar} /></EstadoPantalla>;
}
