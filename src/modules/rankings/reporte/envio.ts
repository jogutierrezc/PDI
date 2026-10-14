/* =============================================================================
   Reglas de la ficha de una oficina, sin React: quién actúa, qué le falta a
   una respuesta para enviarse (en español) y la relevancia de una evidencia
   para la estimación de puntos. Lo usan la pantalla y las pruebas.

   Quien decide de verdad es la base (ranking_responses_guard, 0149); esto
   solo dice a la persona por qué no puede, antes de que lo intente.
   ========================================================================== */

import { transicionPermitida } from "./estados";
import { errorComentario } from "./comentario";
import type { Chequeo, EstadoRespuesta, Relevancia, RolActor, TipoIndicador } from "./tipos";

/** Pertenencia de la persona a una oficina (unit_members). */
export interface Membresia {
  unidad: string;
  rol: "visor" | "editor" | "jefe";
  nombre: string;
}

/**
 * Papel de la persona frente a una oficina. Planeación gana siempre; si no, el
 * de su pertenencia. Gestor = jefe, Contribuyente = editor, Consulta = visor.
 */
export function actorDe(planeacion: boolean, membresias: Membresia[], unidad: string): RolActor | null {
  if (planeacion) return "planeacion";
  const m = membresias.find((x) => x.unidad === unidad);
  return m ? m.rol : null;
}

/** Relevancia de una evidencia: específica si todos sus chequeos están bien; si no, general. */
export function relevanciaDe(chequeos: Chequeo[]): Relevancia {
  return chequeos.length > 0 && chequeos.every((c) => c.nivel === "ok") ? "s" : "g";
}

/** Nombre legible del papel, con los nombres de las funciones de Mis Tableros. */
export function nombreRol(rol: RolActor | null): string {
  switch (rol) {
    case "planeacion":
      return "Planeación";
    case "jefe":
      return "Gestor";
    case "editor":
      return "Contribuyente";
    case "visor":
      return "Consulta";
    default:
      return "Sin función";
  }
}

export interface DatosEnvio {
  tipo: TipoIndicador;
  siNo: boolean | null;
  /** Cifras por campo; los campos son los del indicador (o su propia clave). */
  valores: Record<string, number | null>;
  /** Claves de los campos numéricos del indicador. */
  campos: string[];
  /** Evidencias que ya están guardadas y no tienen riesgo. */
  evidencias: number;
  /** Evidencias guardadas con algún chequeo en riesgo: se deben quitar o corregir. */
  riesgos: number;
  comentario: string;
  /** La versión en inglés existe y es de este comentario. */
  traduccionAlDia: boolean;
  estado: EstadoRespuesta;
  actor: RolActor | null;
}

/** Lo que le falta a una ficha para enviarse, en español. Vacío = puede enviarse. */
export function motivosNoEnviar(d: DatosEnvio): string[] {
  const motivos: string[] = [];

  if (d.estado === "sent" || d.estado === "ok") {
    motivos.push("Ya se envió: Planeación la revisa y solo ella puede cambiarla.");
    return motivos;
  }
  if (!transicionPermitida(d.estado, "sent", d.actor)) {
    motivos.push("Solo el Gestor de la oficina o Planeación puede enviar.");
  }

  if (d.tipo === "dato") {
    if (d.campos.length === 0) {
      motivos.push("Este indicador no tiene campos de cifras cargados.");
    } else if (d.campos.some((k) => d.valores[k] === null || d.valores[k] === undefined)) {
      motivos.push("Complete todas las cifras.");
    } else if (d.campos.some((k) => (d.valores[k] ?? 0) < 0)) {
      motivos.push("Las cifras no pueden ser negativas.");
    }
  } else if (d.tipo !== "inv") {
    if (d.siNo === null) {
      motivos.push("Responda Sí o No.");
    } else if (d.siNo && d.evidencias === 0) {
      motivos.push("Agregue al menos una evidencia, o responda No.");
    }
  }

  if (d.riesgos > 0) motivos.push("Quite o corrija las evidencias con riesgo.");

  const errorTexto = errorComentario(d.comentario);
  if (errorTexto) motivos.push(errorTexto);
  if (d.comentario.trim() && !d.traduccionAlDia) motivos.push("Traduzca el comentario al inglés.");

  return motivos;
}
