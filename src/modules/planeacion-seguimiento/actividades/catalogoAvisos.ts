/* Planeación y Seguimiento · los correos que envía el servidor y con qué plazo.
   Los plazos son los de la oficina (CONTRATO-BD-F3 §3, `ps_config_oficina`) y, si la oficina no tiene los suyos, los generales
   (`ps_config`, por defecto 7, 3 y 0 días antes; hasta 3 avisos de vencida; 48 h para el gestor; 72 h para validar).
   La interfaz no envía nada: solo explica y muestra a quién llegará. Los textos que dependen de los plazos se arman en `textoAviso`. */

import type { ConfigAvisos } from "./modeloF3";
import { diasDeAviso } from "./reglasF3";

export interface DefAviso {
  id: "asignacion" | "por_vencer" | "vencida" | "transferencia" | "cumplida" | "avance" | "validado" | "devuelto" | "validacion_pendiente";
  titulo: string;
  quien: string;
  cuando: string;
  texto: string;
  /** Depende de un plazo configurable por oficina. */
  dias?: number;
}

export const AVISOS: DefAviso[] = [
  { id: "asignacion", titulo: "Le asignaron una actividad", quien: "La persona que recibe la actividad", cuando: "Al momento de asignarla", texto: "Dice qué actividad es, de qué línea del plan, la fecha límite y quién la asignó. No se avisa a quien asigna." },
  { id: "por_vencer", titulo: "Una actividad está por vencer", quien: "Las personas asignadas", cuando: "7 días antes, 3 días antes y el mismo día de la fecha límite", dias: 7, texto: "Solo si la actividad no está hecha. No se repite el mismo aviso el mismo día." },
  { id: "vencida", titulo: "Una actividad venció", quien: "Las personas asignadas y el gestor de la oficina", cuando: "Cada día después de la fecha límite, hasta 3 avisos", dias: 1, texto: "A las personas asignadas. El gestor de la oficina recibe copia pasadas 48 horas de vencida." },
  { id: "transferencia", titulo: "Le pasaron o le quitaron una actividad", quien: "La persona que la recibe, la que la deja y, en copia, el gestor", cuando: "Al momento de transferirla", texto: "Incluye el motivo que escribió el gestor (de al menos 20 caracteres), que también queda en el historial." },
  { id: "avance", titulo: "Reportaron un avance", quien: "El gestor de la oficina", cuando: "Cuando un colaborador (o un gestor) reporta un avance", texto: "Dice quién lo reportó, de qué actividad y cuánto avanzó; lleva a la pantalla de revisión." },
  { id: "validacion_pendiente", titulo: "Hay avances esperando su revisión", quien: "El gestor de la oficina", cuando: "Cuando un avance pasa 72 horas sin revisarse (una sola vez por avance)", dias: 72, texto: "«Hay N avances esperando tu revisión». Lleva a la cola «Por validar»." },
  { id: "validado", titulo: "Validaron su avance", quien: "La persona que lo reportó", cuando: "Cuando el gestor valida el avance", texto: "Dice cuánto quedó validado. Si llegó al 100 %, la actividad quedó «Hecha»." },
  { id: "devuelto", titulo: "Le devolvieron un avance", quien: "La persona que lo reportó", cuando: "Cuando el gestor devuelve el avance", texto: "Incluye la nota del gestor (de al menos 20 caracteres): qué corregir antes de volver a reportar." },
  { id: "cumplida", titulo: "Una actividad se cumplió", quien: "El gestor de la oficina y las personas asignadas", cuando: "Cuando pasa a «Hecho» (por un avance validado al 100 % o por el cierre del gestor)", texto: "Un resumen: quién la hizo y si cerró a tiempo. No se avisa a quien la cerró." },
];

/** El «cuándo» de un aviso con los plazos efectivos de la oficina. */
export function cuandoAviso(a: DefAviso, c: ConfigAvisos): string {
  if (!c.activo) return "Los avisos por vencimiento de esta oficina están desactivados.";
  switch (a.id) {
    case "por_vencer": return c.diasAntes.length ? `${diasDeAviso(c.diasAntes)[0].toUpperCase()}${diasDeAviso(c.diasAntes).slice(1)} de la fecha límite` : "No se envía: no hay días de aviso configurados";
    case "vencida": return c.vencidaMaxAvisos > 0 ? `Cada día después de la fecha límite, hasta ${c.vencidaMaxAvisos} ${c.vencidaMaxAvisos === 1 ? "aviso" : "avisos"}` : "No se envía: los avisos de vencida están en 0";
    case "validacion_pendiente": return `Cuando un avance pasa ${c.validarHoras} horas sin revisarse (una sola vez por avance)`;
    default: return a.cuando;
  }
}
export function textoAviso(a: DefAviso, c: ConfigAvisos): string {
  if (a.id === "vencida") return `A las personas asignadas. El gestor de la oficina recibe copia pasadas ${c.vencidaGestorHoras} horas de vencida.`;
  return a.texto;
}
