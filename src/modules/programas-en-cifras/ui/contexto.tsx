/* =============================================================================
   Programas en Cifras · lo que comparten las pantallas de un programa y campus.

   El explorador, el editor, el asistente y el buscador trabajan sobre la misma
   pareja programa × campus: sus archivos, carpetas, respuestas y periodos se
   leen una vez y se reparten por contexto.
   ========================================================================== */

import { createContext, useContext } from "react";
import type { ArchivoCompleto, PcCarpetaRow, PcRespuestaRow, ProgramaCampus, ResumenArchivo, EstadoPeriodos, PcRolEfectivo } from "../tipos";
import type { Caja } from "../../../components/espacio/movimiento";

export interface OpcionesAsistente {
  /** Un cuadro del CNA o una plantilla del SNIES de donde partir. */
  destino?: string;
  /** Empezar por «Subir plantilla de Excel». */
  excel?: boolean;
  /** Carpeta donde se creará. */
  carpeta?: string;
  origen: Caja | null;
}

export interface Espacio {
  pareja: ProgramaCampus;
  rol: PcRolEfectivo;
  editable: boolean;
  /** Administración de la intranet: nombra a cualquiera. */
  admin: boolean;
  /** Ve la sección «Equipo» (administración o Director de algún programa). */
  verEquipo: boolean;
  /** Todas las parejas a las que accede (para nombrar). */
  parejas: ProgramaCampus[];
  carpetas: PcCarpetaRow[];
  archivos: ArchivoCompleto[];
  resumen: ReadonlyMap<string, ResumenArchivo>;
  respuestas: PcRespuestaRow[];
  periodos: EstadoPeriodos | null;
  /** Programa del área de la salud: pide también el Cuadro 10. */
  salud: boolean;
  decir: (mensaje: string) => void;
  abrirEditor: (archivo: string, origen: Caja | null) => void;
  abrirAsistente: (opciones: OpcionesAsistente) => void;
  empezarRecorrido: (id: "programas" | "programas-editor") => void;
}

const Ctx = createContext<Espacio | null>(null);

export const ProveedorEspacio = Ctx.Provider;

export function useEspacio(): Espacio {
  const e = useContext(Ctx);
  if (!e) throw new Error("useEspacio fuera de ProveedorEspacio");
  return e;
}

/** El id de la carpeta fija del CNA o del SNIES. */
export function carpetaDe(carpetas: readonly PcCarpetaRow[], clave: "cna" | "snies" | "trabajo"): PcCarpetaRow | undefined {
  return carpetas.find((c) => c.clave === clave);
}
