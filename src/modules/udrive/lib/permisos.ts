/* =============================================================================
   UDrive · permisos de carpetas y archivos.

   Espejo en TypeScript de drive_rol_carpeta / drive_rol_archivo (0187). La
   pantalla recibe el rol ya calculado por la base (drive_duenos); estas
   funciones sirven para decidir qué ofrecer (arrastrar, soltar, compartir) y
   para comprobar que los dos lados dicen lo mismo. Si cambia una regla, hay que
   cambiarla en los dos.

   El rol más alto gana: lo que la persona creó en una carpeta o en una de sus
   carpetas superiores es suyo (propietaria); lo que le compartieron en esa
   carpeta, en una superior o en el archivo le da el rol compartido.
   ========================================================================== */

import type { RolDrive } from "../tipos";

export interface CarpetaPermiso {
  id: string;
  padre_id: string | null;
  creada_por: string;
}
export interface ArchivoPermiso {
  id: string;
  carpeta_id: string | null;
  creada_por: string;
}
export interface Compartido {
  usuario_id: string;
  rol: RolDrive;
  carpeta_id?: string | null;
  archivo_id?: string | null;
}

/** Cuatro niveles desde 0191: Solo ver 1, Editar 2, Crear 3, Propietario 4. «creador» solo existe dentro de una unidad de trabajo. */
export const RANGO: Record<RolDrive, number> = { lector: 1, editor: 2, creador: 3, propietario: 4 };
const DE_RANGO: (RolDrive | null)[] = [null, "lector", "editor", "creador", "propietario"];

export const rangoDe = (rol: RolDrive | null | undefined): number => (rol ? RANGO[rol] : 0);

export function rolMayor(...roles: (RolDrive | null | undefined)[]): RolDrive | null {
  return DE_RANGO[Math.max(0, ...roles.map(rangoDe))];
}

export function rolEnCarpeta(carpetas: readonly CarpetaPermiso[], permisos: readonly Compartido[], carpeta: string | null, usuario: string): RolDrive | null {
  if (carpeta === null) return "propietario"; // la raíz es de cada quien
  const porId = new Map(carpetas.map((c) => [c.id, c] as const));
  const roles: (RolDrive | null)[] = [];
  const vistos = new Set<string>();
  for (let c = porId.get(carpeta); c && !vistos.has(c.id); c = c.padre_id ? porId.get(c.padre_id) : undefined) {
    vistos.add(c.id);
    if (c.creada_por === usuario) roles.push("propietario");
    for (const p of permisos) if (p.carpeta_id === c.id && p.usuario_id === usuario) roles.push(p.rol);
  }
  return rolMayor(...roles);
}

export function rolEnArchivo(carpetas: readonly CarpetaPermiso[], archivos: readonly ArchivoPermiso[], permisos: readonly Compartido[], archivo: string, usuario: string): RolDrive | null {
  const a = archivos.find((x) => x.id === archivo);
  if (!a) return null;
  const propio = a.creada_por === usuario ? "propietario" : null;
  const directo = permisos.filter((p) => p.archivo_id === archivo && p.usuario_id === usuario).map((p) => p.rol);
  const deCarpeta = a.carpeta_id ? rolEnCarpeta(carpetas, permisos, a.carpeta_id, usuario) : null;
  return rolMayor(propio, deCarpeta, ...directo);
}

export const puedeVer = (rol: RolDrive | null | undefined): boolean => rangoDe(rol) >= 1;
export const puedeEditar = (rol: RolDrive | null | undefined): boolean => rangoDe(rol) >= 2;
export const puedeCompartir = (rol: RolDrive | null | undefined): boolean => rangoDe(rol) >= 4;

/** Crear o subir: fuera de una unidad basta poder editar; dentro, hace falta el papel Crear (0191). */
export const puedeCrearEn = (rol: RolDrive | null | undefined, enUnidad: boolean): boolean => rangoDe(rol) >= (enUnidad ? 3 : 2);
/** Mover un elemento: lo mismo que crear. */
export const puedeMoverEn = puedeCrearEn;
/** Mandar a la papelera o restaurar. En una unidad: quien administra, o quien crea si el elemento es suyo. */
export const puedeBorrarEn = (rol: RolDrive | null | undefined, enUnidad: boolean, esPropio: boolean): boolean =>
  enUnidad ? rangoDe(rol) >= 4 || (rangoDe(rol) >= 3 && esPropio) : rangoDe(rol) >= 2;
export const puedeBorrarParaSiempre = puedeCompartir;

export const ETIQUETA_ROL: Record<RolDrive, string> = { propietario: "Propietario", creador: "Puede crear", editor: "Puede editar", lector: "Solo puede ver" };
