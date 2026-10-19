/* =============================================================================
   Internacionalización · roles, estados y quién puede qué.

   Espejo de las funciones SQL de 0151 (si cambia uno, cambia el otro):
     rolEn                 ↔ int_rol_en
     transicionPermitida   ↔ int_transicion_permitida
     motivoBloqueoFilas    ↔ int_motivo_bloqueo
     ventanaAbierta        ↔ int_ventana_abierta
     rolFila               ↔ int_rol_fila (0166: Multicampus)
     puedeCrear, controlaMulticampus, puedeCrearLibro, puedeEditarLibro
                           ↔ int_puede_crear, int_controla_multicampus, int_puede_crear_libro, int_puede_editar_libro

   Flujo por (hoja, periodo, campus):

     borrador ──enviar──▶ enviado ──validar──▶ validado ──aprobar──▶ aprobado
        ▲   (gestor,          │ (coordinador,      │ (director)          │
        │  coordinador,       │   director)        │                     │
        │   director)         ▼                    ▼                     ▼
        └──────── devolver con nota (coordinador o director) ◀── reabrir con motivo (director)

   Este archivo no toca la base: la pantalla lo usa para mostrar u ocultar
   botones; la base lo vuelve a comprobar (RLS, disparador int_filas_guard y
   la RPC int_cambiar_estado).
   ========================================================================== */

import type { IntEstado, IntLibroRow, IntPeriodoRow, IntRol, IntVentanaRow, RolEnCampus, Yo } from "../tipos";

export const ESTADOS: readonly IntEstado[] = ["borrador", "enviado", "validado", "aprobado"];

export const ETIQUETA_ESTADO: Record<IntEstado, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  validado: "Validado",
  aprobado: "Aprobado",
};

export const ETIQUETA_ROL: Record<IntRol, string> = {
  director: "Director de Internacionalización",
  coordinador: "Coordinador de campus",
  gestor: "Gestor de Internacionalización",
};

/** Quién puede cada transición. Clave «de→a». */
export const TRANSICIONES: Record<string, readonly IntRol[]> = {
  "borrador→enviado": ["gestor", "coordinador", "director"],
  "enviado→validado": ["coordinador", "director"],
  "validado→aprobado": ["director"],
  "enviado→borrador": ["coordinador", "director"],
  "validado→borrador": ["coordinador", "director"],
  "aprobado→borrador": ["director"],
};

export function transicionPermitida(de: IntEstado, a: IntEstado, rol: RolEnCampus): boolean {
  if (!rol) return false;
  return TRANSICIONES[`${de}→${a}`]?.includes(rol) ?? false;
}

/** Estados a los que este rol puede llevar el envío desde el actual. */
export function accionesPermitidas(estado: IntEstado, rol: RolEnCampus): IntEstado[] {
  return ESTADOS.filter((a) => a !== estado && transicionPermitida(estado, a, rol));
}

/** Volver a borrador pide nota: es devolver (desde enviado o validado) o reabrir (desde aprobado). */
export function pideNota(de: IntEstado, a: IntEstado): boolean {
  return a === "borrador" && de !== "borrador";
}

/** ¿Es una reapertura (queda en int_reaperturas)? */
export function esReapertura(de: IntEstado, a: IntEstado): boolean {
  return de === "aprobado" && a === "borrador";
}

/** Papel frente a un campus: el director gana siempre; luego coordinador; luego gestor. */
export function rolEn(yo: Yo | null | undefined, campusId: string): RolEnCampus {
  if (!yo) return null;
  if (yo.director) return "director";
  if (yo.coordinador.includes(campusId)) return "coordinador";
  if (yo.gestor.includes(campusId)) return "gestor";
  return null;
}

/** Campus que ve: todos para el director; para los demás, donde coordina o gestiona. */
export function campusVisibles(yo: Yo | null | undefined, todos: readonly string[]): string[] {
  if (!yo) return [];
  if (yo.director) return [...todos];
  return todos.filter((id) => yo.coordinador.includes(id) || yo.gestor.includes(id));
}

/** ¿Pertenece al módulo? (lo que abre la pantalla en el menú). Planeación lo ve sin ser miembro. */
export function esMiembro(yo: Yo | null | undefined): boolean {
  return Boolean(yo && (yo.director || yo.planeacion || yo.coordinador.length > 0 || yo.gestor.length > 0));
}

/* ---------- Carpetas y tablas Multicampus (0166) ---------------------------------- */

/** Crea carpetas y tablas «por campus»: el Director, Planeación o un Coordinador. */
export function puedeCrear(yo: Yo | null | undefined): boolean {
  if (!yo) return false;
  return Boolean(yo.director || yo.planeacion || yo.coordinador.length > 0);
}

/** Controla las tablas Multicampus: el Director, Planeación o el Coordinador del campus central (Bucaramanga). */
export function controlaMulticampus(yo: Yo | null | undefined): boolean {
  if (!yo) return false;
  return Boolean(yo.director || yo.planeacion || (yo.central && yo.coordinador.includes(yo.central)));
}

/** ¿Puede crear una tabla con esta forma de captura? */
export function puedeCrearLibro(yo: Yo | null | undefined, captura: IntLibroRow["captura"]): boolean {
  if (!yo) return false;
  if (captura === "multicampus") return controlaMulticampus(yo);
  if (captura === "oficina") return Boolean(yo.director || yo.planeacion);
  return puedeCrear(yo);
}

/** ¿Cambia la estructura de este libro (o lo borra)? El Director y Planeación, todos; un Coordinador, los suyos; Multicampus, quien la controla. */
export function puedeEditarLibro(yo: Yo | null | undefined, libro: Pick<IntLibroRow, "captura" | "created_by">, userId: string | null | undefined): boolean {
  if (!yo) return false;
  if (yo.director || yo.planeacion) return true;
  if (libro.captura === "multicampus") return controlaMulticampus(yo);
  if (libro.captura === "campus") return Boolean(userId && libro.created_by === userId && yo.coordinador.length > 0);
  return false;
}

/**
 * Papel frente a las filas de un campus en una hoja. En una tabla Multicampus se
 * suma el mejor entre el de ese campus y el que da Planeación (coordinador) o la
 * persona en el campus central (Bucaramanga edita las de todos).
 */
export function rolFila(yo: Yo | null | undefined, campusId: string, multicampus: boolean): RolEnCampus {
  const base = rolEn(yo, campusId);
  if (base === "director" || !multicampus || !yo) return base;
  const extra: RolEnCampus = yo.planeacion ? "coordinador" : yo.central ? rolEn(yo, yo.central) : null;
  if (!base) return extra;
  if (!extra) return base;
  if (extra === "coordinador" || base === "coordinador") return "coordinador";
  return "gestor";
}

/** Campus cuyas filas se ven: en Multicampus, todos para quien pertenece al módulo. */
export function campusVisiblesEn(yo: Yo | null | undefined, todos: readonly string[], multicampus: boolean): string[] {
  if (multicampus && esMiembro(yo)) return [...todos];
  return campusVisibles(yo, todos);
}

/** «AAAA-MM-DD» de hoy en Bogotá (como int_hoy()). */
export function hoyBogota(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/**
 * La ventana que rige para (periodo, hoja, campus): la del campus si existe,
 * si no la general (campus_id nulo). Nulo si no hay.
 */
export function ventanaVigente(ventanas: readonly IntVentanaRow[], periodoId: string, hojaId: string, campusId: string): IntVentanaRow | null {
  const de = ventanas.filter((v) => v.periodo_id === periodoId && v.hoja_id === hojaId);
  return de.find((v) => v.campus_id === campusId) ?? de.find((v) => v.campus_id === null) ?? null;
}

/** ¿Captura abierta hoy? Periodo abierto y hoy dentro de la ventana vigente. */
export function ventanaAbierta(
  periodo: Pick<IntPeriodoRow, "id" | "estado"> | null | undefined,
  ventanas: readonly IntVentanaRow[],
  hojaId: string,
  campusId: string,
  hoy = hoyBogota(),
): boolean {
  if (!periodo || periodo.estado !== "abierto") return false;
  const v = ventanaVigente(ventanas, periodo.id, hojaId, campusId);
  return Boolean(v && v.abre <= hoy && hoy <= v.cierra);
}

/**
 * Por qué no puede escribir filas, o nulo si puede. Mismo orden de
 * comprobaciones que int_motivo_bloqueo().
 */
export function motivoBloqueoFilas(args: {
  rol: RolEnCampus;
  estado: IntEstado;
  captura: IntLibroRow["captura"];
  ventanaAbierta: boolean;
}): string | null {
  const { rol, estado, captura } = args;
  if (!rol) return "No tiene permiso en este campus.";
  if (estado === "aprobado") return "La hoja de este campus ya está aprobada: solo el Director la reabre, con motivo.";
  if (rol === "director") return null;
  if (captura === "oficina") return "Esta tabla la captura solo la oficina principal.";
  if (!args.ventanaAbierta) return "La ventana de captura de esta hoja está cerrada para este campus.";
  if (rol === "gestor" && estado !== "borrador") return "La hoja ya se envió: solo se corrige si la devuelven.";
  if (rol === "coordinador" && estado === "validado") return "La hoja ya está validada: devuélvala para corregirla.";
  return null;
}

/** Lo que el Director (y nadie más) hace: estructura, catálogo, plantillas, periodos, aprobar, puente SNIES. */
export function puedeAdministrar(yo: Yo | null | undefined): boolean {
  return Boolean(yo?.director);
}

/** El Director nombra coordinadores y gestores; a un Director lo nombra la administración de la intranet. */
export function puedeNombrar(rol: IntRol, args: { director: boolean; admin: boolean }): boolean {
  if (args.admin) return true;
  return args.director && rol !== "director";
}
