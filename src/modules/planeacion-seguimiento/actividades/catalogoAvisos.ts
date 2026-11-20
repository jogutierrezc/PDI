/* Planeación y Seguimiento · Fase 2 · los correos que envía el servidor y con qué plazo.
   Los plazos son los valores por defecto de la base (CONTRATO-BD-F2, tabla ps_config): editables por el administrador del módulo
   y AÚN POR CONFIRMAR por la Universidad. La interfaz no envía nada: solo explica y muestra a quién llegará. */

export interface DefAviso {
  id: "asignacion" | "por_vencer" | "vencida" | "transferencia" | "cumplida" | "avance";
  titulo: string;
  quien: string;
  cuando: string;
  texto: string;
  /** Plazo configurable (en días), si aplica. */
  dias?: number;
  /** Aún no existe: llega en la fase 3. */
  fase3?: boolean;
}

export const AVISOS: DefAviso[] = [
  { id: "asignacion", titulo: "Le asignaron una actividad", quien: "La persona que recibe la actividad", cuando: "Al momento de asignarla", texto: "Dice qué actividad es, de qué línea del plan, la fecha límite y quién la asignó. No se avisa a quien asigna." },
  { id: "por_vencer", titulo: "Una actividad está por vencer", quien: "Las personas asignadas", cuando: "7 días antes, 3 días antes y el mismo día de la fecha límite", dias: 7, texto: "Solo si la actividad no está hecha. No se repite el mismo aviso el mismo día." },
  { id: "vencida", titulo: "Una actividad venció", quien: "Las personas asignadas y el gestor de la oficina", cuando: "Cada día después de la fecha límite, hasta 3 avisos", dias: 1, texto: "A las personas asignadas. El gestor de la oficina recibe copia desde el segundo día de vencida." },
  { id: "transferencia", titulo: "Le pasaron o le quitaron una actividad", quien: "La persona que la recibe, la que la deja y, en copia, el gestor", cuando: "Al momento de transferirla", texto: "Incluye el motivo que escribió el gestor (de al menos 20 caracteres), que también queda en el historial." },
  { id: "cumplida", titulo: "Una actividad se cumplió", quien: "El gestor de la oficina", cuando: "Cuando pasa a «Hecho»", texto: "Un resumen: quién la hizo y si cerró a tiempo." },
  { id: "avance", titulo: "Reportaron un avance", quien: "El gestor de la oficina", cuando: "Cuando un colaborador reporta", texto: "Llega con la fase de avances en pantalla completa: aún no se envía.", fase3: true },
];
