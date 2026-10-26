/* =============================================================================
   UDrive · aplicar un estilo a un informe, sin React (0190).

   Un informe guarda tres cosas: a qué estilo apunta (`estilo`: id y versión),
   una copia completa de ese estilo (`instantanea`) y, aparte, lo que cambió en
   este informe (`ajustes`). Lo que se imprime sale siempre de la copia más los
   ajustes, así que el informe no cambia aunque el estilo cambie después, no se
   pueda leer o el documento esté aprobado.
   ========================================================================== */

import type { Documento } from "./documento";
import { ESTILO_INFORME_NUEVO, ESTILO_SIN_ELEGIR, diferencia, estiloDeFabrica, estiloDelInforme, esDeFabrica, hayAjustes, normalizarEstilo } from "./estilo";
import type { Estilo } from "./estilo";

/** La versión de un estilo de fábrica (sube si cambia su diseño en el código). */
export const VERSION_FABRICA = "1";

/** Aplica un estilo: guarda su referencia y su copia, y borra los ajustes del informe anterior. */
export function aplicarEstilo(doc: Documento, ref: { id: string; v: string }, estilo: Estilo): Documento {
  const { ajustes: _ajustes, ...resto } = doc;
  void _ajustes;
  return { ...resto, estilo: { id: ref.id, v: ref.v }, instantanea: normalizarEstilo(estilo) };
}

/** Pone los ajustes de este informe a partir del estilo que el editor dejó (solo lo que difiere de la copia). */
export function conAjustes(doc: Documento, efectivo: Estilo): Documento {
  const base = doc.instantanea ?? estiloDeFabrica(ESTILO_SIN_ELEGIR);
  const aj = diferencia(base, normalizarEstilo(efectivo));
  const { ajustes: _ajustes, ...resto } = doc;
  void _ajustes;
  return hayAjustes(aj) ? { ...resto, ajustes: aj } : resto;
}

export function sinAjustes(doc: Documento): Documento {
  const { ajustes: _ajustes, ...resto } = doc;
  void _ajustes;
  return resto;
}

/** Qué estilo tiene hoy el informe: su nombre y de dónde viene. */
export function descripcionDelEstilo(doc: Pick<Documento, "estilo" | "instantanea" | "ajustes">): { id: string; nombre: string; deFabrica: boolean; ajustado: boolean } {
  const e = estiloDelInforme(doc);
  const id = doc.estilo?.id ?? ESTILO_SIN_ELEGIR;
  return { id, nombre: doc.instantanea ? doc.instantanea.nombre : e.nombre, deFabrica: esDeFabrica(id), ajustado: hayAjustes(doc.ajustes) };
}

/** El estilo y la referencia con que empieza un informe nuevo. */
export function estiloDeInformeNuevo(): { ref: { id: string; v: string }; estilo: Estilo } {
  return { ref: { id: ESTILO_INFORME_NUEVO, v: VERSION_FABRICA }, estilo: estiloDeFabrica(ESTILO_INFORME_NUEVO) };
}
