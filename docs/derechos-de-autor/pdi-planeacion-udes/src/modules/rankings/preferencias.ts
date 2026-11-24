/* =============================================================================
   Preferencias de vista de la intranet de rankings: «Enfoque» (pliega los paneles
   laterales) y «Compacta» (filas de 30 px). Se recuerdan en este navegador y valen
   para las tres pantallas. Si el navegador no guarda nada, valen solo esta visita.
   ========================================================================== */

import { useState } from "react";

export type Preferencia = "enfoque" | "compacta";

const clave = (p: Preferencia) => `rankings.vista.${p}`;

export function leerPreferencia(p: Preferencia): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(clave(p)) === "1";
  } catch {
    return false;
  }
}

export function usePreferencia(p: Preferencia): [boolean, (valor: boolean) => void] {
  const [valor, setValor] = useState(() => leerPreferencia(p));
  const cambiar = (nuevo: boolean) => {
    setValor(nuevo);
    try {
      window.localStorage.setItem(clave(p), nuevo ? "1" : "0");
    } catch {
      /* Sin almacenamiento: la preferencia dura hasta recargar. */
    }
  };
  return [valor, cambiar];
}
