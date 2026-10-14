/* =============================================================================
   Resumen del reporte por oficinas · cuentas puras, sin red ni React.

   Cualquier oficina con función Contribuyente o Gestor puede aportar a
   cualquier indicador. Las asignaciones son solo un «responsable sugerido».

   Estado de un indicador (lo que ve Planeación):
     · si tiene una aportación aprobada, «ok»; su oficial es la que Planeación
       marcó (columna oficial, 0150) o, si no marcó ninguna, la aprobada más
       reciente;
     · si no, lo más pendiente de sus aportaciones: enviado, devuelto o borrador;
     · si no hay ninguna aportación, «none» («Sin empezar»).
   El avance de un ODS es lo que tiene oficial aprobada sobre sus indicadores
   («nivel indicator»; las métricas y las opciones no cuentan).
   ========================================================================== */

import type { AporteRef, Asignacion, EstadoRespuesta, Indicador, Respuesta, RolAsignacion } from "./tipos";

/** Una respuesta con la fecha de su última edición (la base la trae; sirve para elegir la oficial). */
export type RespuestaFechada = Respuesta & { updated_at?: string | null };

export interface ResumenOds {
  ods: number;
  total: number;
  ok: number;
  sent: number;
  draft: number;
  back: number;
  none: number;
  /** ok / total, de 0 a 1. */
  avance: number;
}

/** Un indicador del catálogo para una oficina: sugerido (con su papel) o aporte libre. */
export interface ItemOficina {
  indicador: Indicador;
  rol: RolAsignacion | null;
}

/** Respuesta de una oficina a un indicador, si existe. */
export function respuestaDe(respuestas: Respuesta[], indicador: string, unidad: string): Respuesta | undefined {
  return respuestas.find((r) => r.indicador === indicador && r.unidad === unidad);
}

/** Todas las aportaciones con contenido a un indicador, de cualquier oficina (no «Sin empezar»). */
export function aportesDe<T extends Respuesta>(indicador: string, respuestas: T[]): T[] {
  return respuestas.filter((r) => r.indicador === indicador && r.estado !== "none");
}

/** Respuesta oficial: la aprobada que Planeación marcó como oficial; si no hay, la aprobada más reciente. */
export function respuestaOficial<T extends RespuestaFechada>(indicador: string, respuestas: T[]): T | undefined {
  const aprobadas = respuestas.filter((r) => r.indicador === indicador && r.estado === "ok");
  return aprobadas.find((r) => r.oficial) ?? aprobadas.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
}

/** ¿La oficial la eligió Planeación, o es la regla de la aprobada más reciente? */
export function oficialMarcada<T extends RespuestaFechada>(indicador: string, respuestas: T[]): boolean {
  return respuestas.some((r) => r.indicador === indicador && r.estado === "ok" && r.oficial === true);
}

/** Las demás oficinas que aportaron a un indicador (RPC ranking_aportes), por nombre. */
export function otrosAportes(indicador: string, aportes: AporteRef[], unidad: string): AporteRef[] {
  return aportes
    .filter((a) => a.indicador === indicador && a.unidad !== unidad && a.estado !== "none")
    .sort((a, b) => a.unidad_nombre.localeCompare(b.unidad_nombre, "es"));
}

/** Cuántas oficinas distintas de la propia aportaron, por indicador. */
export function conteoAportes(aportes: AporteRef[], unidad: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const a of aportes) {
    if (a.unidad === unidad || a.estado === "none") continue;
    mapa.set(a.indicador, (mapa.get(a.indicador) ?? 0) + 1);
  }
  return mapa;
}

const PENDIENTE_PRIMERO: EstadoRespuesta[] = ["sent", "back", "draft"];

/** Estado de un indicador: su oficial aprobada, o lo más pendiente de sus aportaciones. */
export function estadoIndicador<T extends RespuestaFechada>(indicador: string, respuestas: T[]): EstadoRespuesta {
  if (respuestaOficial(indicador, respuestas)) return "ok";
  for (const estado of PENDIENTE_PRIMERO) {
    if (respuestas.some((r) => r.indicador === indicador && r.estado === estado)) return estado;
  }
  return "none";
}

/** Resumen de los ODS que tienen indicadores en el catálogo, en orden. */
export function resumenPorOds<T extends RespuestaFechada>(indicadores: Indicador[], respuestas: T[]): ResumenOds[] {
  const mapa = new Map<number, ResumenOds>();
  for (const ind of indicadores) {
    if (ind.nivel !== "indicator") continue;
    let fila = mapa.get(ind.ods);
    if (!fila) {
      fila = { ods: ind.ods, total: 0, ok: 0, sent: 0, draft: 0, back: 0, none: 0, avance: 0 };
      mapa.set(ind.ods, fila);
    }
    fila.total += 1;
    fila[estadoIndicador(ind.id, respuestas)] += 1;
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, avance: f.total ? f.ok / f.total : 0 }))
    .sort((a, b) => a.ods - b.ods);
}

/** Asignación de un indicador: responsable sugerido y oficinas de apoyo sugeridas. */
export function asignacionDe(indicador: string, asignaciones: Asignacion[]): { principal: string | null; apoyo: string[] } {
  const filas = asignaciones.filter((a) => a.indicador === indicador);
  return {
    principal: filas.find((a) => a.rol === "principal")?.unidad ?? null,
    apoyo: filas.filter((a) => a.rol === "apoyo").map((a) => a.unidad),
  };
}

/** Indicadores (nivel indicator) sugeridos a una oficina, con su papel, en orden de ODS y número. */
export function indicadoresDeUnidad(unidad: string, indicadores: Indicador[], asignaciones: Asignacion[]): ItemOficina[] {
  const porId = new Map(indicadores.filter((i) => i.nivel === "indicator").map((i) => [i.id, i]));
  const salida: ItemOficina[] = [];
  for (const a of asignaciones) {
    if (a.unidad !== unidad) continue;
    const ind = porId.get(a.indicador);
    if (ind) salida.push({ indicador: ind, rol: a.rol });
  }
  return salida.sort(porNumero);
}

/** Catálogo completo de indicadores: los ODS priorizados al frente (en su orden), luego el resto por ODS. */
export function catalogoOrdenado(indicadores: Indicador[], priorizados: number[]): Indicador[] {
  const rango = (ods: number) => (priorizados.includes(ods) ? priorizados.indexOf(ods) : 100 + ods);
  return indicadores
    .filter((i) => i.nivel === "indicator")
    .sort((a, b) => rango(a.ods) - rango(b.ods) || porNumero({ indicador: a, rol: null }, { indicador: b, rol: null }));
}

/** Búsqueda por texto o número de indicador, sin acentos ni mayúsculas. Vacía = todo. */
export function coincide(indicador: Indicador, consulta: string): boolean {
  const q = normaliza(consulta);
  if (!q) return true;
  return normaliza(indicador.id).includes(q) || normaliza(indicador.texto_es).includes(q) || normaliza(indicador.texto_en).includes(q);
}

/** Campos numéricos de un indicador de dato: sus opciones (nivel option, padre = id). */
export function camposDeDato(indicador: string, indicadores: Indicador[]): Indicador[] {
  return indicadores
    .filter((i) => i.nivel === "option" && i.padre === indicador)
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id, "es", { numeric: true }));
}

function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function porNumero(a: ItemOficina, b: ItemOficina): number {
  return a.indicador.ods - b.indicador.ods || a.indicador.id.localeCompare(b.indicador.id, "es", { numeric: true });
}

/** Lo que reportó una oficina (p. ej. Planeación Institucional): con contenido, aprobado y oficial. */
export function avanceDeUnidad<T extends RespuestaFechada>(unidad: string, indicadores: Indicador[], respuestas: T[]): { reportados: number; aprobados: number; oficiales: number } {
  const ids = new Set(indicadores.filter((i) => i.nivel === "indicator").map((i) => i.id));
  const propias = respuestas.filter((r) => r.unidad === unidad && r.estado !== "none" && ids.has(r.indicador));
  return {
    reportados: propias.length,
    aprobados: propias.filter((r) => r.estado === "ok").length,
    oficiales: propias.filter((r) => r.estado === "ok" && respuestaOficial(r.indicador, respuestas)?.id === r.id).length,
  };
}

/** La oficina de Planeación Institucional entre las unidades (por nombre, sin tildes). */
export function unidadPlaneacion<U extends { id: string; name: string }>(unidades: U[]): U | undefined {
  const n = (s: string) => normaliza(s).replace(/\s+/g, " ");
  return unidades.find((u) => n(u.name) === "planeacion institucional") ?? unidades.find((u) => /planeacion/.test(n(u.name)));
}
