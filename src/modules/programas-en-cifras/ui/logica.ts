/* =============================================================================
   Programas en Cifras · la lógica pura de las pantallas.

   Sin React ni DOM, para poder probarla: qué archivos se ven según la sección
   y el filtro, cómo se dice el estado de un archivo y cómo se agrupan las
   parejas programa × campus. Lo de la hoja (pegar, errores, guardado) es de
   components/espacio/logica.ts.
   ========================================================================== */

import type { IconName } from "../../../components/ui/Icon";
import type { Columna, PcArchivoRow, PcCarpetaRow, PcEstado, ProgramaCampus, ResumenArchivo, Yo } from "../tipos";

export type SeccionNav = "archivos" | "recientes" | "listos" | "plantillas" | "equipo";
export type FiltroArchivos = "todos" | "tabla" | "lista" | "errores" | "listo";

export const SECCIONES_NAV: { id: SeccionNav; etiqueta: string; icono: IconName }[] = [
  { id: "archivos", etiqueta: "Mis archivos", icono: "folder" },
  { id: "recientes", etiqueta: "Recientes", icono: "clock" },
  { id: "listos", etiqueta: "Listos para Planeación", icono: "share" },
  { id: "plantillas", etiqueta: "Plantillas CNA y SNIES", icono: "library" },
  { id: "equipo", etiqueta: "Equipo", icono: "users" },
];

export const FILTROS: { id: FiltroArchivos; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "tabla", etiqueta: "Tablas" },
  { id: "lista", etiqueta: "Listas" },
  { id: "errores", etiqueta: "Con errores" },
  { id: "listo", etiqueta: "Listos" },
];

/* ---------- tiempo y estado ------------------------------------------------------ */

export interface EstadoVisible {
  clave: "listo" | "err" | "borrador";
  texto: string;
  icono: IconName;
}

/** Lo que dice la ficha de estado: listo, con N errores, o borrador. */
export function estadoVisible(estado: PcEstado, errores: number): EstadoVisible {
  if (estado === "listo") return { clave: "listo", texto: "Listo para Planeación", icono: "check" };
  if (errores > 0) return { clave: "err", texto: `${errores} ${errores === 1 ? "error" : "errores"}`, icono: "alert" };
  return { clave: "borrador", texto: "Borrador", icono: "pen" };
}

export const textoTipoArchivo = (tipo: PcArchivoRow["tipo"]): string => (tipo === "lista" ? "Lista" : "Tabla");

/* ---------- qué archivos se ven ---------------------------------------------------- */

export interface EntradaVisibles<T extends PcArchivoRow = PcArchivoRow> {
  archivos: readonly T[];
  resumen: ReadonlyMap<string, ResumenArchivo>;
  seccion: SeccionNav;
  /** Carpeta abierta dentro de «Mis archivos»; nulo = la raíz (se ven las carpetas). */
  carpeta: string | null;
  filtro: FiltroArchivos;
}

export const erroresDe = (resumen: ReadonlyMap<string, ResumenArchivo>, id: string): number => resumen.get(id)?.errores ?? 0;

/** Lo más reciente primero. */
const masReciente = (a: Pick<PcArchivoRow, "updated_at">, b: Pick<PcArchivoRow, "updated_at">) => Date.parse(b.updated_at) - Date.parse(a.updated_at);

export function archivosVisibles<T extends PcArchivoRow>(e: EntradaVisibles<T>): T[] {
  let xs = [...e.archivos];
  if (e.seccion === "archivos" && e.carpeta) xs = xs.filter((a) => a.carpeta_id === e.carpeta);
  if (e.seccion === "listos") xs = xs.filter((a) => a.estado === "listo");
  if (e.filtro === "tabla" || e.filtro === "lista") xs = xs.filter((a) => a.tipo === e.filtro);
  if (e.filtro === "errores") xs = xs.filter((a) => a.estado !== "listo" && erroresDe(e.resumen, a.id) > 0);
  if (e.filtro === "listo") xs = xs.filter((a) => a.estado === "listo");
  xs.sort(masReciente);
  return e.seccion === "recientes" ? xs.slice(0, 12) : xs;
}

/** Las carpetas en su orden, las del CNA y el SNIES primero. */
export function carpetasOrdenadas(carpetas: readonly PcCarpetaRow[]): PcCarpetaRow[] {
  return [...carpetas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
}

/* ---------- la pareja programa × campus ---------------------------------------------- */

export const claveDePareja = (p: Pick<ProgramaCampus, "programa_id" | "campus_id">): string => `${p.programa_id}|${p.campus_id}`;

export const nombreDePareja = (p: Pick<ProgramaCampus, "programa" | "campus">): string => `${p.programa} · ${p.campus}`;

/** Pareja a abrir: la de la dirección si existe y se puede ver; si no, la primera. */
export function parejaInicial(yo: Yo | null | undefined, programa?: string | null, campus?: string | null): ProgramaCampus | null {
  const lista = yo?.programas ?? [];
  if (!lista.length) return null;
  return lista.find((p) => p.programa_id === programa && p.campus_id === campus) ?? lista[0];
}

export interface GrupoCampus<T extends Pick<ProgramaCampus, "campus_id" | "campus" | "programa"> = ProgramaCampus> {
  campus_id: string;
  campus: string;
  parejas: T[];
}

/** Las parejas agrupadas por campus (campus y programas en orden alfabético): el orden en que se elige en toda la pantalla. */
export function agruparPorCampus<T extends Pick<ProgramaCampus, "campus_id" | "campus" | "programa">>(parejas: readonly T[]): GrupoCampus<T>[] {
  const grupos = new Map<string, GrupoCampus<T>>();
  for (const p of parejas) {
    const g = grupos.get(p.campus_id) ?? { campus_id: p.campus_id, campus: p.campus, parejas: [] };
    g.parejas.push(p);
    grupos.set(p.campus_id, g);
  }
  const es = (a: string, b: string) => a.localeCompare(b, "es");
  return [...grupos.values()].sort((a, b) => es(a.campus, b.campus)).map((g) => ({ ...g, parejas: [...g.parejas].sort((a, b) => es(a.programa, b.programa)) }));
}

/* ---------- campos ---------------------------------------------------------------------- */

/** Símbolo corto del tipo de una columna, para la ficha del panel «Campos». */
export const SIMBOLO_TIPO: Record<Columna["tipo"], string> = { texto: "T", numero: "#", fecha: "F", lista: "▾", porcentaje: "%" };

/** Las opciones de una lista escritas como «Sí, No» → ["Sí", "No"]. */
export function opcionesDeTexto(texto: string): string[] {
  const vistas = new Set<string>();
  for (const o of texto.split(/[,\n;]/)) {
    const t = o.trim();
    if (t) vistas.add(t);
  }
  return [...vistas];
}

/** Datos de ejemplo para decir en el asistente cuántas columnas se detectaron. */
export const resumenColumnas = (n: number, filas: number): string => `${n} ${n === 1 ? "columna" : "columnas"} y ${filas} ${filas === 1 ? "fila" : "filas"} de muestra`;
