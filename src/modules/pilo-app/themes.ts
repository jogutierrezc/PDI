/* =============================================================================
   Mr. Pilo · la app móvil · sus temas.

   Cinco temas, elegidos en el menú y recordados por dispositivo. Aquí solo
   van sus nombres: los colores viven en una sola hoja (pilo-app-themes.css),
   como variables, y la muestra de cada tema en el menú se pinta con ellas.
   ========================================================================== */

import { readStored, storageKey, writeStored } from "../pregunta/store";

export type AppTheme = "udes" | "blanco" | "negro" | "futurista" | "pilo";

export const APP_THEMES: { id: AppTheme; label: string }[] = [
  { id: "udes", label: "Mi UDES" },
  { id: "blanco", label: "Blanco" },
  { id: "negro", label: "Negro" },
  { id: "futurista", label: "Futurista" },
  { id: "pilo", label: "Estilo Pilo" },
];

export const DEFAULT_THEME: AppTheme = "udes";

/** Lo que la app recuerda en el dispositivo va bajo este prefijo («pilo-app:tema», «pilo-app:voz»…). */
export const APP_PREFIX = "pilo-app";

/** El tema guardado; cualquier otra cosa (nada, un tema que ya no existe) es «Mi UDES». */
export function parseTheme(value: unknown): AppTheme {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return APP_THEMES.find((t) => t.id === v)?.id ?? DEFAULT_THEME;
}

export const readTheme = (): AppTheme => parseTheme(readStored(storageKey(APP_PREFIX, "tema")));
export const writeTheme = (theme: AppTheme) => writeStored(storageKey(APP_PREFIX, "tema"), parseTheme(theme));
