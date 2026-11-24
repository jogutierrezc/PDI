/* =============================================================================
   Estados de una respuesta del reporte por oficinas, y quién puede moverlos.

     none → draft → sent → ok
                    sent → back → draft   (la oficina corrige y reenvía)
                    ok   → back           (Planeación reabre una aprobada)

   Reglas (espejo de la función SQL ranking_transicion_permitida, 0149):
     · none → draft, back → draft: Planeación, el jefe o un editor.
     · draft → sent: el jefe de la oficina, o Planeación.
     · sent → ok, sent → back, ok → back: solo Planeación.

   Una respuesta enviada o aprobada no la cambia nadie más que Planeación. Un
   visor solo lee. Este archivo no toca la base: la pantalla lo usa para
   mostrar o esconder botones, y el disparador de la base lo vuelve a comprobar.
   ========================================================================== */

import type { EstadoRespuesta, RolActor } from "./tipos";

export const ESTADOS: readonly EstadoRespuesta[] = ["none", "draft", "sent", "back", "ok"];

export const ETIQUETA_ESTADO: Record<EstadoRespuesta, string> = {
  none: "Sin empezar",
  draft: "En borrador",
  sent: "Enviada a Planeación",
  back: "Devuelta para corregir",
  ok: "Aprobada",
};

/** Quién puede hacer cada transición. Clave: «de→a». */
const TRANSICIONES: Record<string, readonly RolActor[]> = {
  "none→draft": ["planeacion", "jefe", "editor"],
  "back→draft": ["planeacion", "jefe", "editor"],
  "draft→sent": ["planeacion", "jefe"],
  "sent→ok": ["planeacion"],
  "sent→back": ["planeacion"],
  "ok→back": ["planeacion"],
};

/** ¿Puede este rol pasar la respuesta de un estado a otro? */
export function transicionPermitida(de: EstadoRespuesta, a: EstadoRespuesta, rol: RolActor | null): boolean {
  if (rol === null || rol === "visor") return false;
  return TRANSICIONES[`${de}→${a}`]?.includes(rol) ?? false;
}

/** Estados a los que este rol puede llevar la respuesta desde el actual, en orden. */
export function accionesPermitidas(estado: EstadoRespuesta, rol: RolActor | null): EstadoRespuesta[] {
  return ESTADOS.filter((a) => a !== estado && transicionPermitida(estado, a, rol));
}

/**
 * ¿Puede este rol cambiar los datos, el comentario y las evidencias de la
 * respuesta? Planeación, siempre. La oficina (editor o jefe) mientras no esté
 * enviada ni aprobada: en none, draft y back.
 */
export function puedeEditar(estado: EstadoRespuesta, rol: RolActor | null): boolean {
  if (rol === "planeacion") return true;
  if (rol !== "editor" && rol !== "jefe") return false;
  return estado === "none" || estado === "draft" || estado === "back";
}

/** Enviada o aprobada: la oficina la ve pero no la cambia; Planeación sí. */
export function bloqueadaParaOficina(estado: EstadoRespuesta): boolean {
  return estado === "sent" || estado === "ok";
}
