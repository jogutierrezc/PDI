/* =============================================================================
   Datos de Sostenibilidad · permisos.

   Espejo de las funciones SQL de 0178 (si cambia uno, cambia el otro):
     esMiembro     ↔ ds_es_participante
     rolEn         ↔ ds_rol_en
     puedeEditar   ↔ ds_puede_editar

   Gestor y colaborador editan los libros de su oficina; Planeación (y la
   administración) ve todo y no edita nada; quien no pertenece no ve el módulo.
   ========================================================================== */

import type { DsYo } from "../tipos";

export type DsRolEfectivo = "gestor" | "colaborador" | "planeacion" | null;

/** ¿Pertenece al módulo? Pertenecer es el permiso, como en Programas en Cifras. */
export const esMiembro = (yo: DsYo | undefined): boolean => Boolean(yo && (yo.planeacion || yo.oficinas.length > 0));

/** Papel frente a una oficina. La base manda: esto solo evita ofrecer botones que no van a funcionar. */
export function rolEn(yo: DsYo | undefined, oficina: string): DsRolEfectivo {
  return yo?.oficinas.find((o) => o.oficina_id === oficina)?.rol ?? null;
}

/** ¿Edita los libros de esta oficina? */
export const puedeEditar = (yo: DsYo | undefined, oficina: string): boolean => {
  const rol = rolEn(yo, oficina);
  return rol === "gestor" || rol === "colaborador";
};

/** ¿Reparte los accesos de esta oficina? El gestor, o la administración. */
export const puedeRepartir = (yo: DsYo | undefined, oficina: string, isAdmin: boolean): boolean =>
  isAdmin || rolEn(yo, oficina) === "gestor";
