/* =============================================================================
   Informes · estructura configurable por ciclo (migración 0276).

   Un solo resolvedor combina la plantilla del código con lo que Planeación
   configuró en el ciclo (informe_secciones_config): sección activa o no, orden,
   título propio, solo lectura y secciones libres. Sin fila, manda el código.
   Lo usan el editor, la revisión, la vista, la impresión y el Tablero.
   ========================================================================== */

import { PLANTILLAS } from "./plantillas";
import { tablaConDatos } from "./tabla-libre";
import type { ContenidoSeccion, Plantilla, SeccionConfigRow, SeccionDef } from "./types";

/** Una sección de la plantilla vista por el Tablero: con su configuración, activa o no. */
export interface SeccionEstructura {
  def: SeccionDef;
  activa: boolean;
  /** ¿La unidad puede editarla? */
  editable: boolean;
  /** Título de la plantilla (la libre no tiene: usa el suyo). */
  tituloBase: string;
  fila: SeccionConfigRow | null;
}

export const TITULO_LIBRE = "Sección nueva";

/** Todas las secciones de la plantilla en el ciclo (también las inactivas), en su orden. */
export function estructuraDe(plantilla: Plantilla, config: SeccionConfigRow[]): SeccionEstructura[] {
  const filas = config.filter((f) => f.plantilla === plantilla);
  const de = (clave: string) => filas.find((f) => f.clave === clave) ?? null;
  const base = PLANTILLAS[plantilla].secciones.map((d, i) => {
    const fila = de(d.clave);
    return { e: { def: { ...d, titulo: fila?.titulo?.trim() || d.titulo, ...(fila && !fila.editable_por_unidad ? { soloLectura: true } : {}) }, activa: d.tipo === "evid" ? true : (fila?.activa ?? true), editable: fila?.editable_por_unidad ?? true, tituloBase: d.titulo, fila } as SeccionEstructura, pos: fila?.orden ?? i + 1, i };
  });
  const libres = filas
    .filter((f) => f.libre)
    .map((f, n) => ({
      e: {
        def: { clave: f.clave, titulo: f.titulo?.trim() || TITULO_LIBRE, tipo: "libre", libre: true, ...(f.minimo ? { minimo: f.minimo } : {}), ...(!f.editable_por_unidad ? { soloLectura: true } : {}) } as SeccionDef,
        activa: f.activa,
        editable: f.editable_por_unidad,
        tituloBase: "",
        fila: f,
      } as SeccionEstructura,
      pos: f.orden ?? 1000 + n,
      i: 1000 + n,
    }));
  return [...base, ...libres].sort((a, b) => a.pos - b.pos || a.i - b.i).map((x) => x.e);
}

/** Las secciones que se ven en el informe: las activas, con su título y su permiso. Sin ninguna activa, las de la plantilla. */
export function resolverSecciones(plantilla: Plantilla, config: SeccionConfigRow[]): SeccionDef[] {
  const activas = estructuraDe(plantilla, config).filter((e) => e.activa);
  return activas.length ? activas.map((e) => e.def) : PLANTILLAS[plantilla].secciones;
}

/** Claves que Planeación desactivó en la plantilla. */
export const clavesInactivas = (plantilla: Plantilla, config: SeccionConfigRow[]): Set<string> => {
  // Evidencias y fuentes de verificación nunca se desactivan: es obligatoria en toda estructura.
  const evid = new Set((PLANTILLAS[plantilla]?.secciones ?? []).filter((x) => x.tipo === "evid").map((x) => x.clave));
  return new Set(config.filter((f) => f.plantilla === plantilla && !f.activa && !evid.has(f.clave)).map((f) => f.clave));
};

/** La clave libre siguiente («x1», «x2»…) de la plantilla. */
export function claveLibreNueva(plantilla: Plantilla, config: SeccionConfigRow[]): string {
  const usadas = config.filter((f) => f.plantilla === plantilla && f.libre).map((f) => Number(f.clave.slice(1)) || 0);
  return `x${Math.max(0, ...usadas) + 1}`;
}

/** El texto de los bloques de texto de una sección libre, junto. */
export const textoLibre = (c: ContenidoSeccion | null | undefined): string =>
  (c?.bloques ?? []).flatMap((b) => (b.tipo === "texto" ? [b.texto] : [])).join("\n\n");

/** Elementos de UDrive de los bloques de una sección libre, en orden. */
export const driveLibre = (c: ContenidoSeccion | null | undefined) => (c?.bloques ?? []).flatMap((b) => (b.tipo === "drive" ? b.drive : []));

/** Cuántas tablas de Excel con datos tiene (una sin datos no cuenta). */
export const tablasLibre = (c: ContenidoSeccion | null | undefined): number => (c?.bloques ?? []).filter((b) => b.tipo === "tabla" && tablaConDatos(b)).length;

/** ¿Tiene algo escrito o elegido? (para confirmar antes de borrar). */
export const tieneContenidoLibre = (c: ContenidoSeccion | null | undefined): boolean => textoLibre(c).trim() !== "" || driveLibre(c).length > 0 || tablasLibre(c) > 0;
