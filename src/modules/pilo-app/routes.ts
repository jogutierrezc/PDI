/* =============================================================================
   Mr. Pilo · la app móvil · sus rutas.

   Una app, dos Pilos:
     /app              la bienvenida la primera vez; después, la última conversación
     /app/universidad  Pilo de la Universidad (espacio «planeacion», el de /pregunta)
     /app/ensenanza    Pilo en Enseñanza      (espacio «ensenanza», el de /pilo-ensenanza)

   Las dos últimas son también los accesos directos del icono (manifest).
   Todo aquí es puro: se prueba en node.
   ========================================================================== */

import type { SpaceId } from "../pregunta/space";

export const APP_BASE = "/app";

/** La ruta de cada Pilo dentro de la app. */
export const APP_PATHS: Record<SpaceId, string> = {
  planeacion: "/app/universidad",
  ensenanza: "/app/ensenanza",
};

/** Cómo se llama cada Pilo en la app (el menú, la cabecera, la elección de la bienvenida). */
export const APP_PILOS: Record<SpaceId, { label: string; short: string; hint: string; under: string }> = {
  planeacion: { label: "Pilo de la Universidad", short: "Universidad", hint: "Cifras, planes e impacto", under: "Universidad de Santander" },
  ensenanza: { label: "Pilo en Enseñanza", short: "Enseñanza", hint: "Enseñar y aprender", under: "Enseñanza" },
};

export const APP_SPACES: SpaceId[] = ["planeacion", "ensenanza"];

export type AppPlace = { kind: "inicio" } | { kind: "pilo"; space: SpaceId } | { kind: "otra" };

/** Qué pantalla de la app pide una dirección. «otra» = no es de la app, o no existe dentro de ella. */
export function readAppPath(pathname: string): AppPlace {
  const p = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "").toLowerCase() || "/";
  if (p === APP_BASE) return { kind: "inicio" };
  for (const space of APP_SPACES) if (p === APP_PATHS[space]) return { kind: "pilo", space };
  return { kind: "otra" };
}

/** ¿Esta dirección es de la app? (para registrar el service worker solo ahí). */
export const isAppPath = (pathname: string): boolean => {
  const p = pathname.split(/[?#]/)[0] || "/";
  return p === APP_BASE || p.startsWith(`${APP_BASE}/`);
};

/**
 * Qué abre /app: la bienvenida la primera vez; después, el Pilo de la última
 * conversación (el de la Universidad si no hay ninguna).
 */
export function startTarget(input: { seen: boolean; last: SpaceId | null | undefined }): "bienvenida" | SpaceId {
  if (!input.seen) return "bienvenida";
  return input.last === "ensenanza" ? "ensenanza" : "planeacion";
}
