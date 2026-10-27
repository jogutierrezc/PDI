/* =============================================================================
   UDrive · el contexto de las pantallas que lo alojan.

   El explorador y los editores de UDrive se pueden montar dentro de otra
   pantalla (hoy, Datos de Sostenibilidad) sin sacar a la persona de ella:
   `base` es la ruta donde viven (los editores cuelgan de `${base}/tabla/:id`),
   `volver` el nombre al que se regresa, `incrustado` quita la barra y el riel
   propios del explorador (la pantalla anfitriona pone su marco), y los tres
   «extra» son huecos para paneles de la anfitriona. Sin proveedor, todo es
   el UDrive de siempre (/admin/udrive).
   ========================================================================== */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ArchivoRow, TablaDatos } from "../tipos";

export interface ContextoDrive {
  base: string;
  volver: string;
  incrustado: boolean;
  /** Panel extra en el editor de tablas (p. ej. «Conectar a un indicador»). */
  extraTabla?: (a: { id: string; nombre: string; tabla: TablaDatos; editable: boolean }) => ReactNode;
  /** Panel extra en el constructor de gráficas (p. ej. «Publicar en el portal»). */
  extraGrafica?: (a: { id: string; nombre: string; editable: boolean }) => ReactNode;
  /** Bloque extra en el panel de detalles de un archivo seleccionado (p. ej. «Dónde se usa»). */
  detalleExtra?: (a: { archivo: ArchivoRow }) => ReactNode;
}

const PREDETERMINADO: ContextoDrive = { base: "/admin/udrive", volver: "UDrive", incrustado: false };

const Contexto = createContext<ContextoDrive>(PREDETERMINADO);

export const ProveedorDrive = Contexto.Provider;
export const useContextoDrive = (): ContextoDrive => useContext(Contexto);
