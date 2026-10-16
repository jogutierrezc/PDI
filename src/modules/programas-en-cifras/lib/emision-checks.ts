/* =============================================================================
   Programas en Cifras · reglas de «Emitir el Cuadro Maestro».

   Emitir genera el Excel del Cuadro Maestro del CNA de un programa y campus.
   La validación final la hace el cliente al generar (la base solo comprueba el
   orden de los periodos y que los archivos estén listos en pc_registrar_emision).
   Las reglas, con la nota del propio Excel del CNA que las pide:

     1. ventana      La ventana de observación está completa: todos los
                     periodos cerrados, en orden (Nota 1 del Cuadro 01).
     2. archivos     Cada cuadro que el programa llena tiene su archivo y todos
                     los que lo responden están «listos». Los cuadros que llena
                     el sistema (02, 03, 05 y 06) no piden archivo; el 10 solo
                     va en programas de salud.
     3. fecha        Una sola fecha de diligenciamiento: es la fecha de corte de
                     TODOS los cuadros (Nota 2 del Cuadro 01), y la de
                     autoevaluación está escrita.
     4. cuadro04     El total de profesores del Cuadro 04 es el del último
                     periodo reportado en el Cuadro 03 (Nota 1 del Cuadro 04).
     5. datos        Los cuadros 04, 05 y 06 llevan datos personales: se pide
                     confirmar la autorización de tratamiento (Nota 3 del Cuadro
                     01: Ley 1581 de 2012 y Ley 1188 de 2008).
   ========================================================================== */

import type { Datos, DestinoLocal, EstadoPeriodos, PcEstado, PcMapa } from "../tipos";
import { DESTINOS } from "./destinos";
import { fechaIsoValida } from "./validacion";

export type ReglaEmision = "ventana" | "archivos" | "fecha" | "cuadro04" | "datos";

export interface Hallazgo {
  regla: ReglaEmision;
  /** «bloquea»: no se puede emitir; «aviso»: se puede, pero conviene mirarlo. */
  nivel: "bloquea" | "aviso";
  mensaje: string;
  archivo_id?: string;
}

/** Un archivo con lo que las reglas necesitan: estado, filas y a qué destinos responde. */
export interface ArchivoParaEmitir {
  id: string;
  nombre: string;
  estado: PcEstado;
  filas: readonly Datos[];
  respuestas: readonly { destino_id: string; mapa: PcMapa }[];
}

export interface EntradaEmision {
  periodos: Pick<EstadoPeriodos, "ventana" | "siguiente" | "completa" | "cerrados" | "total">;
  /** Los archivos del programa y campus (todos; se filtran por los destinos a los que responden). */
  archivos: readonly ArchivoParaEmitir[];
  /** Programa del área de la salud: pide también el Cuadro 10. */
  salud?: boolean;
  /** Total de profesores del último periodo del Cuadro 03 (lo calcula el sistema); nulo si no hay dato. */
  profesoresUltimoPeriodo?: number | null;
  /** La persona confirmó la autorización de tratamiento de datos personales. */
  autorizacionDatos: boolean;
  destinos?: readonly DestinoLocal[];
}

export interface ResultadoEmision {
  puede: boolean;
  hallazgos: Hallazgo[];
}

/** Archivos que responden a un destino. */
export function respondenA(archivos: readonly ArchivoParaEmitir[], destinoId: string): ArchivoParaEmitir[] {
  return archivos.filter((a) => a.respuestas.some((r) => r.destino_id === destinoId));
}

const mapaDe = (a: ArchivoParaEmitir, destinoId: string): PcMapa => a.respuestas.find((r) => r.destino_id === destinoId)?.mapa ?? {};

/** Los valores de una columna del destino en los archivos que lo responden (ya sin vacíos). */
export function valoresDe(archivos: readonly ArchivoParaEmitir[], destinoId: string, claveDestino: string): string[] {
  const salida: string[] = [];
  for (const a of respondenA(archivos, destinoId)) {
    const clave = mapaDe(a, destinoId)[claveDestino];
    if (!clave) continue;
    for (const f of a.filas) {
      const v = f[clave];
      if (v !== null && v !== undefined && String(v).trim() !== "") salida.push(String(v).trim());
    }
  }
  return salida;
}

/** Cuadros del CNA que el programa llena con un archivo. */
export function cuadrosConArchivo(destinos: readonly DestinoLocal[] = DESTINOS, salud = false): DestinoLocal[] {
  return destinos.filter((d) => d.sistema === "CNA" && !d.automatico && (salud || !d.solo_salud));
}

export function revisarEmision(e: EntradaEmision): ResultadoEmision {
  const destinos = e.destinos ?? DESTINOS;
  const hallazgos: Hallazgo[] = [];
  const bloquea = (regla: ReglaEmision, mensaje: string, archivo_id?: string) => hallazgos.push({ regla, nivel: "bloquea", mensaje, archivo_id });
  const aviso = (regla: ReglaEmision, mensaje: string) => hallazgos.push({ regla, nivel: "aviso", mensaje });

  // 1. Ventana completa.
  if (!e.periodos.ventana) bloquea("ventana", "Defina la ventana de observación y cierre sus periodos.");
  else if (!e.periodos.completa) {
    const faltan = e.periodos.total - e.periodos.cerrados;
    bloquea("ventana", `Faltan ${faltan} ${faltan === 1 ? "periodo" : "periodos"} por cerrar${e.periodos.siguiente ? ` (sigue ${e.periodos.siguiente})` : ""}.`);
  }

  // 2. Un archivo listo por cuadro.
  for (const d of cuadrosConArchivo(destinos, e.salud)) {
    const fs = respondenA(e.archivos, d.id);
    if (!fs.length) {
      bloquea("archivos", `Falta el archivo del ${d.nombre}.`);
      continue;
    }
    for (const a of fs) if (a.estado !== "listo") bloquea("archivos", `«${a.nombre}» (${d.nombre}) no está listo.`, a.id);
  }

  // 3. Una sola fecha de diligenciamiento, y la de autoevaluación.
  const diligenciamiento = [...new Set(valoresDe(e.archivos, "cna01", "fecha_diligenciamiento"))];
  const validas = diligenciamiento.filter(fechaIsoValida);
  if (!diligenciamiento.length) bloquea("fecha", "Falta la fecha de diligenciamiento en el Cuadro 01: es la fecha de corte de todos los cuadros.");
  else if (diligenciamiento.length > 1) bloquea("fecha", `Hay ${diligenciamiento.length} fechas de diligenciamiento (${diligenciamiento.join(", ")}): el Cuadro Maestro tiene una sola fecha de corte.`);
  else if (!validas.length) bloquea("fecha", `La fecha de diligenciamiento «${diligenciamiento[0]}» no es una fecha válida (AAAA-MM-DD).`);
  if (!valoresDe(e.archivos, "cna01", "fecha_autoevaluacion").length) bloquea("fecha", "Falta la fecha de autoevaluación en el Cuadro 01.");

  // 4. Cuadro 04 = último periodo del Cuadro 03.
  const del04 = respondenA(e.archivos, "cna04");
  if (del04.length) {
    const cedulas = valoresDe(e.archivos, "cna04", "cedula");
    const total = cedulas.length ? new Set(cedulas).size : del04.reduce((s, a) => s + a.filas.length, 0);
    if (e.profesoresUltimoPeriodo === null || e.profesoresUltimoPeriodo === undefined) {
      aviso("cuadro04", `No se pudo comparar con el último periodo del Cuadro 03: el sistema aún no tiene ese total (el Cuadro 04 trae ${total} profesores).`);
    } else if (total !== e.profesoresUltimoPeriodo) {
      bloquea("cuadro04", `El Cuadro 04 lista ${total} profesores y el último periodo del Cuadro 03 reporta ${e.profesoresUltimoPeriodo}: deben coincidir.`);
    }
  }

  // 5. Autorización de datos personales (cuadros con personas).
  const conPersonas = ["cna04", "cna05", "cna06"].some((id) => respondenA(e.archivos, id).some((a) => a.filas.length > 0));
  const hayPersonales = conPersonas || destinos.some((d) => d.sistema === "CNA" && d.columnas.some((c) => c.personal) && respondenA(e.archivos, d.id).some((a) => a.filas.length > 0));
  if (hayPersonales && !e.autorizacionDatos) {
    bloquea("datos", "Confirme que cuenta con la autorización para tratar los datos personales de los cuadros 04, 05 y 06 (Ley 1581 de 2012).");
  }

  return { puede: !hallazgos.some((h) => h.nivel === "bloquea"), hallazgos };
}

/** Cuadros que el sistema llena solo, con su explicación (para mostrarlos como «Automático»). */
export function cuadrosAutomaticos(destinos: readonly DestinoLocal[] = DESTINOS): DestinoLocal[] {
  return destinos.filter((d) => d.sistema === "CNA" && d.automatico);
}

/** Nombre del Excel que se descarga. */
export function nombreArchivoEmitido(args: { programa: string; campus: string; hasta: string; salud?: boolean }): string {
  const base = args.salud ? "Cuadro Maestro Programas de Salud" : "Cuadro Maestro Programas";
  return `${base} - ${args.programa} - ${args.campus} - ${args.hasta}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
}
