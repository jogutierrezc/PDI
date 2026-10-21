/* =============================================================================
   Encuestas con Pilo · el borrador de quien responde.

   Lo escrito vive en sessionStorage de este navegador (con try/catch: puede no
   haber almacenamiento) para que un error de red, o el viaje de ida y vuelta a
   Microsoft, no le cuesten lo que ya llenó. El token de Microsoft NO se guarda
   aquí: vive solo en memoria.
   ========================================================================== */

import type { AporteEnvio } from "../tipos";

export interface Borrador {
  dependencia: string;
  /** Ya vio (o saltó) la bienvenida de Pilo. */
  visto: boolean;
  aportes: AporteEnvio[];
}

export const BORRADOR_VACIO: Borrador = { dependencia: "", visto: false, aportes: [] };

const llave = (slug: string) => `encuesta:${slug}:borrador`;

export function leerBorrador(slug: string): Borrador {
  try {
    const t = window.sessionStorage.getItem(llave(slug));
    if (!t) return BORRADOR_VACIO;
    const j = JSON.parse(t) as Partial<Borrador>;
    return {
      dependencia: typeof j.dependencia === "string" ? j.dependencia : "",
      visto: j.visto === true,
      aportes: Array.isArray(j.aportes) ? j.aportes : [],
    };
  } catch {
    return BORRADOR_VACIO;
  }
}

export function guardarBorrador(slug: string, b: Borrador): void {
  try {
    window.sessionStorage.setItem(llave(slug), JSON.stringify(b));
  } catch {
    // Sin almacenamiento: vale mientras la página siga abierta.
  }
}

export function borrarBorrador(slug: string): void {
  try {
    window.sessionStorage.removeItem(llave(slug));
  } catch {
    // nada que borrar
  }
}
