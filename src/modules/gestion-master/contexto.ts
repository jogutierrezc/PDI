/* Gestión Master · lo que cada sección recibe de la pantalla principal. */

import type { NivelGm } from "./api";

export type Seccion = "bandeja" | "nueva" | "estructura" | "periodo" | "seguimiento" | "flujos" | "conexion" | "rua";

export interface Contexto {
  /** Periodo elegido arriba (2026b). */
  periodo: string;
  /** Sede elegida arriba (buc, cuc, val, bog) o «todas». */
  sede: string;
  /** Nivel del rol y su función de aprobación, tal como los dice la base. */
  nivel: NivelGm;
  funcion: string | null;
  /** Todos los periodos que se pueden elegir. */
  periodos: string[];
  /** Cambia de sección conservando periodo y sede; con `id`, abre esa solicitud; `extra` añade parámetros (tipo, codigo…). */
  ir: (seccion: Seccion, id?: string, extra?: Record<string, string>) => void;
}

/** Una sección que necesita una sola sede (no «todas»): la que se elige, o Bucaramanga. */
export const sedeUnica = (sede: string) => (sede === "todas" ? "buc" : sede);
