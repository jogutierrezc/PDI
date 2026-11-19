/* =============================================================================
   Mr. Pilo · la app móvil · el interruptor del diseño nuevo (beta).

   Hay dos diseños: «clasico» (el de siempre, por defecto) y «nuevo» (el de
   Mr. Pilo para Apple: barra de pestañas flotante, título grande, hojas, listas
   agrupadas). El nuevo no cambia ninguna función: solo se pone un atributo
   (data-diseno="nuevo") en la raíz `.pa` y una hoja aparte (pilo-app-nuevo.css)
   lo pinta. Quitar el atributo devuelve el diseño de antes.

   Se recuerda por dispositivo («pilo-app:diseno») y el parámetro de la dirección
   lo fija: /app?diseno=nuevo o /app?diseno=clasico. Cualquier otro valor se
   ignora; sin nada guardado, es «clasico».
   ========================================================================== */

import { createContext, useContext } from "react";
import { readStored, storageKey, writeStored } from "../pregunta/store";
import { APP_PREFIX } from "./themes";

export type Diseno = "clasico" | "nuevo";

export const DEFAULT_DISENO: Diseno = "clasico";
export const KEY_DISENO = storageKey(APP_PREFIX, "diseno");
/** El parámetro de la dirección que fija el diseño: ?diseno=nuevo | ?diseno=clasico. */
export const DISENO_PARAM = "diseno";

/** Un valor reconocido, o null si no lo es (nada, «Nuevo» con otra forma, basura). */
export function parseDiseno(value: unknown): Diseno | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "nuevo" || v === "clasico" ? v : null;
}

/** Lo que pide la dirección (`?diseno=…`), o null. */
export function disenoFromSearch(search: string | null | undefined): Diseno | null {
  try {
    return parseDiseno(new URLSearchParams(search ?? "").get(DISENO_PARAM));
  } catch {
    return null;
  }
}

export const writeDiseno = (diseno: Diseno) => writeStored(KEY_DISENO, diseno);

/** El diseño de este dispositivo: la dirección manda (y se recuerda); si no, lo guardado; si no, «clasico». */
export function readDiseno(search: string | null | undefined = typeof window !== "undefined" ? window.location.search : ""): Diseno {
  const asked = disenoFromSearch(search);
  if (asked) {
    writeDiseno(asked);
    return asked;
  }
  return parseDiseno(readStored(KEY_DISENO)) ?? DEFAULT_DISENO;
}

/** El valor del atributo de la raíz: solo el nuevo lo lleva; el clásico no tiene atributo. */
export const disenoAttr = (diseno: Diseno): "nuevo" | undefined => (diseno === "nuevo" ? "nuevo" : undefined);

export interface DisenoState {
  diseno: Diseno;
  setDiseno: (diseno: Diseno) => void;
}

export const DisenoContext = createContext<DisenoState>({ diseno: DEFAULT_DISENO, setDiseno: () => {} });
export const useDiseno = () => useContext(DisenoContext);
