/* =============================================================================
   UI GreenMetric · estados de una respuesta y quién puede moverlos.

     sin_asignar → asignado → en_captura → enviado → en_revision → aprobado
                                  ↑            │          │
                                  └─ devuelto ←┴──────────┘   (aprobado → devuelto: solo la administración)

   Espejo de la función SQL ugm_transicion_permitida (0208). La pantalla lo usa
   para mostrar u ocultar botones; el disparador ugm_respuestas_guardia lo vuelve
   a comprobar en la base. «Listo para exportar» NO es un estado: es aprobado con
   la traducción revisada y la evidencia completa (ver `listaParaExportar`).
   ========================================================================== */

import type { ActorUgm, EstadoRespuesta } from "./tipos";

export const ESTADOS: readonly EstadoRespuesta[] = ["sin_asignar", "asignado", "en_captura", "enviado", "en_revision", "devuelto", "aprobado"];

export const ETIQUETA_ESTADO: Record<EstadoRespuesta, string> = {
  sin_asignar: "Sin asignar",
  asignado: "Asignado",
  en_captura: "En captura",
  enviado: "Enviado",
  en_revision: "En revisión",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
};

/** Estados en los que el responsable puede editar. */
export const ESTADOS_ABIERTOS: readonly EstadoRespuesta[] = ["asignado", "en_captura", "devuelto"];

const TRANSICIONES: Record<string, readonly ActorUgm[]> = {
  "sin_asignar→asignado": ["admin", "sistema"],
  "asignado→sin_asignar": ["admin", "sistema"],
  "asignado→en_captura": ["admin", "responsable", "apoyo", "sistema"],
  "devuelto→en_captura": ["admin", "responsable", "apoyo", "sistema"],
  "en_captura→enviado": ["admin", "responsable", "sistema"],
  "devuelto→enviado": ["admin", "responsable", "sistema"],
  "enviado→en_revision": ["admin", "revisor", "sistema"],
  "enviado→devuelto": ["admin", "revisor", "sistema"],
  "enviado→aprobado": ["admin", "revisor", "sistema"],
  "en_revision→devuelto": ["admin", "revisor", "sistema"],
  "en_revision→aprobado": ["admin", "revisor", "sistema"],
  "aprobado→devuelto": ["admin", "sistema"],
  "aprobado→en_revision": ["admin", "sistema"],
};

export function transicionPermitida(de: EstadoRespuesta, a: EstadoRespuesta, actor: ActorUgm | null): boolean {
  return actor !== null && (TRANSICIONES[`${de}→${a}`]?.includes(actor) ?? false);
}

/** ¿Puede esta persona editar el contenido ahora? (El responsable y el apoyo, solo con la respuesta abierta; la administración, siempre.) */
export function puedeEditar(estado: EstadoRespuesta, actor: ActorUgm | null): boolean {
  if (actor === "admin") return true;
  return (actor === "responsable" || actor === "apoyo") && ESTADOS_ABIERTOS.includes(estado);
}

/** Las acciones del flujo que ofrece cada papel en cada estado (los botones de la pantalla). */
export type AccionFlujo = "enviar" | "tomar" | "devolver" | "aprobar" | "reabrir" | "publicar" | "retirar";

export function accionesDisponibles(estado: EstadoRespuesta, actor: ActorUgm | null, publicada: boolean): AccionFlujo[] {
  if (!actor || actor === "jefe") return [];
  const out: AccionFlujo[] = [];
  if ((estado === "en_captura" || estado === "devuelto") && (actor === "responsable" || actor === "admin")) out.push("enviar");
  if (estado === "enviado" && (actor === "revisor" || actor === "admin")) out.push("tomar");
  if ((estado === "enviado" || estado === "en_revision") && (actor === "revisor" || actor === "admin")) out.push("devolver", "aprobar");
  if (estado === "aprobado" && actor === "admin") {
    out.push("reabrir");
    out.push(publicada ? "retirar" : "publicar");
  }
  return out;
}

/** Los pasos del camino feliz, para dibujar un avance. «devuelto» vuelve a «en_captura». */
export const CAMINO: readonly EstadoRespuesta[] = ["sin_asignar", "asignado", "en_captura", "enviado", "en_revision", "aprobado"];

export function indiceEnCamino(estado: EstadoRespuesta): number {
  return estado === "devuelto" ? CAMINO.indexOf("en_captura") : CAMINO.indexOf(estado);
}

/**
 * ¿Está lista para exportar? Aprobada, con la traducción revisada y vigente, y con evidencia si la pregunta la exige.
 * Los pendientes de traducción salen de la función ugm_traducciones_pendientes (la huella la calcula la base).
 */
export function listaParaExportar(entrada: { estado: EstadoRespuesta; traduccionesPendientes: string[]; requiereEvidencia: boolean; evidencias: number }): boolean {
  return entrada.estado === "aprobado" && entrada.traduccionesPendientes.length === 0 && (!entrada.requiereEvidencia || entrada.evidencias > 0);
}
