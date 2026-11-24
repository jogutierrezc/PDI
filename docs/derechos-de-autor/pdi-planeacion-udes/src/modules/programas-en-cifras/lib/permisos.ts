/* =============================================================================
   Programas en Cifras · roles, estados y quién puede qué.

   Espejo de las funciones SQL de 0164 (si cambia uno, cambia el otro):
     rolEn                    ↔ pc_rol_en
     puedeEditar / puedeVer   ↔ pc_puede_editar / pc_puede_ver
     motivoNoEdita            ↔ los mensajes de los disparadores pc_*_guard
     estadoTrasEditar         ↔ pc_tocar_archivo (editar un archivo listo lo devuelve a borrador)
     puedeNombrar             ↔ la política pc_miembros_write

   Quién:
     · Director de programa y Coordinador de programa: editan lo de SU programa
       en SU campus (una fila de pc_miembros por programa y campus).
     · Planeación (profiles.role ≥ 'planeacion', y por tanto la administración):
       ve TODO y no edita nada. Si además fuera Director o Coordinador de un
       programa, en ese programa edita como tal.
     · Cualquier otra persona: no ve nada.

   Estados de un archivo: borrador → listo («Listo para Planeación»). Editar un
   archivo listo (filas, columnas) lo devuelve a borrador. Solo se marca listo
   sin errores de validación (la base lo comprueba en pc_marcar_listo).

   Este archivo no toca la base: la pantalla lo usa para mostrar u ocultar
   botones; la base lo vuelve a comprobar (RLS, disparadores y RPC).
   ========================================================================== */

import type { PcArchivoRow, PcColumnaRow, PcEstado, PcRol, PcRolEfectivo, Yo } from "../tipos";

export const ETIQUETA_ROL: Record<Exclude<PcRolEfectivo, null>, string> = {
  director: "Director de programa",
  coordinador: "Coordinador de programa",
  planeacion: "Planeación",
};

export const ETIQUETA_ESTADO: Record<PcEstado, string> = {
  borrador: "Borrador",
  listo: "Listo para Planeación",
};

/** Papel frente a un programa y campus, según lo que devolvió pc_yo(). */
export function rolEn(yo: Yo | null | undefined, programaId: string, campusId: string): PcRolEfectivo {
  if (!yo) return null;
  const mio = yo.programas.find((p) => p.programa_id === programaId && p.campus_id === campusId);
  if (mio) return mio.rol;
  return yo.planeacion ? "planeacion" : null;
}

export const puedeVer = (rol: PcRolEfectivo): boolean => rol !== null;

/** Solo el Director y el Coordinador editan; Planeación observa. */
export const puedeEditar = (rol: PcRolEfectivo): boolean => rol === "director" || rol === "coordinador";

/** ¿Tiene acceso al módulo? (lo que abre la pantalla en el menú). */
export function esMiembro(yo: Yo | null | undefined): boolean {
  return Boolean(yo && (yo.planeacion || yo.programas.length > 0));
}

/** Parejas programa × campus a las que tiene acceso, sin repetir. */
export function parejasVisibles(yo: Yo | null | undefined): Yo["programas"] {
  return yo?.programas ?? [];
}

/** Por qué no puede editar, o nulo si puede. Mismos mensajes que los disparadores. */
export function motivoNoEdita(rol: PcRolEfectivo): string | null {
  if (rol === null) return "No tiene acceso a este programa.";
  if (rol === "planeacion") return "Planeación solo observa: los archivos los edita el programa.";
  return null;
}

/** Los cuadros estándar del CNA fijan su estructura: no se cambian ni se quitan columnas ni se borra el archivo. */
export const estructuraBloqueada = (archivo: Pick<PcArchivoRow, "bloqueado">): boolean => archivo.bloqueado;

export function puedeCambiarEstructura(rol: PcRolEfectivo, archivo: Pick<PcArchivoRow, "bloqueado">): boolean {
  return puedeEditar(rol) && !archivo.bloqueado;
}

export function puedeEliminarArchivo(rol: PcRolEfectivo, archivo: Pick<PcArchivoRow, "bloqueado">): boolean {
  return puedeEditar(rol) && !archivo.bloqueado;
}

/** Una columna con origen de sistema (p. ej. Warehouse) no se edita. */
export const columnaEditable = (columna: Pick<PcColumnaRow, "solo_lectura">): boolean => !columna.solo_lectura;

export function puedeEditarCelda(rol: PcRolEfectivo, columna: Pick<PcColumnaRow, "solo_lectura">): boolean {
  return puedeEditar(rol) && columnaEditable(columna);
}

/** El mapa de un archivo se edita aunque su estructura esté bloqueada; desconectar el cuadro de origen no. */
export function puedeDesconectar(rol: PcRolEfectivo, archivo: Pick<PcArchivoRow, "bloqueado" | "destino_origen">, destinoId: string): boolean {
  return puedeEditar(rol) && !(archivo.bloqueado && archivo.destino_origen === destinoId);
}

/** Por qué no se puede marcar como listo, o nulo si se puede. */
export function motivoNoListo(rol: PcRolEfectivo, estado: PcEstado, errores: number): string | null {
  const m = motivoNoEdita(rol);
  if (m) return m;
  if (estado === "listo") return "El archivo ya está listo.";
  if (errores > 0) return `Corrija ${errores} ${errores === 1 ? "celda" : "celdas"} antes de marcarlo como listo.`;
  return null;
}

/** Volver a borrador lo puede hacer quien edita. */
export function puedeVolverABorrador(rol: PcRolEfectivo, estado: PcEstado): boolean {
  return puedeEditar(rol) && estado === "listo";
}

/** Editar un archivo listo (filas, columnas) lo devuelve a borrador. */
export function estadoTrasEditar(estado: PcEstado): PcEstado {
  return estado === "listo" ? "borrador" : estado;
}

/**
 * Quién nombra a quién: la administración de la intranet nombra a cualquiera;
 * el Director de un programa nombra Coordinadores de su programa y campus.
 */
export function puedeNombrar(rol: PcRol, args: { admin: boolean; rolEnElPrograma: PcRolEfectivo }): boolean {
  if (args.admin) return true;
  return args.rolEnElPrograma === "director" && rol === "coordinador";
}

/** Los papeles que puede dar en un programa y campus (la política pc_miembros_write): la administración, los dos; el Director, Coordinadores. */
export function rolesQueNombra(args: { admin: boolean; rolEnElPrograma: PcRolEfectivo }): PcRol[] {
  return (["director", "coordinador"] as const).filter((r) => puedeNombrar(r, args));
}

/** ¿Ve «Equipo»? La administración y quien dirige algún programa; el resto no tiene a quién nombrar. */
export function veEquipo(yo: Yo | null | undefined, admin: boolean): boolean {
  return admin || Boolean(yo?.programas.some((p) => p.rol === "director"));
}
