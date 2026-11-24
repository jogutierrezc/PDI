/* =============================================================================
   Datos de Sostenibilidad · permisos.

   Espejo de las funciones SQL de 0178 (si cambia uno, cambia el otro):
     esMiembro     ↔ ds_es_participante
     rolEn         ↔ ds_rol_en
     puedeEditar   ↔ ds_puede_editar

   Gestor y colaborador editan los libros de su oficina; la administración (y
   los roles de acceso con base administrador, como el de UDES Verde) edita en
   cualquier oficina; Planeación ve todo y no edita nada; quien no pertenece no
   ve el módulo.
   ========================================================================== */

import type { DsYo } from "../tipos";

export type DsRolEfectivo = "gestor" | "colaborador" | "admin" | "planeacion" | null;

/** ¿Pertenece al módulo? Pertenecer es el permiso, como en Programas en Cifras. */
export const esMiembro = (yo: DsYo | undefined): boolean => Boolean(yo && (yo.planeacion || yo.oficinas.length > 0));

/** Papel frente a una oficina. La base manda: esto solo evita ofrecer botones que no van a funcionar. */
export function rolEn(yo: DsYo | undefined, oficina: string): DsRolEfectivo {
  return yo?.oficinas.find((o) => o.oficina_id === oficina)?.rol ?? null;
}

/** ¿Edita los libros de esta oficina? La oficina, o la administración. */
export const puedeEditar = (yo: DsYo | undefined, oficina: string): boolean => {
  const rol = rolEn(yo, oficina);
  return rol === "gestor" || rol === "colaborador" || rol === "admin";
};

/** ¿Reparte los accesos de esta oficina? El gestor, o la administración. */
export const puedeRepartir = (yo: DsYo | undefined, oficina: string, isAdmin: boolean): boolean =>
  isAdmin || rolEn(yo, oficina) === "gestor";
