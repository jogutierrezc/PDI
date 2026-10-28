/* THE Impact · piezas pequeñas compartidas por las vistas: la etiqueta de estado y los nombres de la bitácora. */

import type { EstadoRespuesta } from "../../reporte/tipos";
import { ETIQUETA_ESTADO } from "../../reporte/estados";

/** Los estados del reporte de THE (none, draft, sent, back, ok) con las clases de color de UI GreenMetric; el texto del estado va siempre, así que no se distingue solo por color. */
const CLASE: Record<EstadoRespuesta, string> = { none: "", draft: "ugm-st-en_captura", sent: "ugm-st-enviado", back: "ugm-st-devuelto", ok: "ugm-st-aprobado" };

export function EstadoThi({ estado }: { estado: EstadoRespuesta }) {
  return <span className={`ugm-pill ${CLASE[estado]}`.trim()}>{ETIQUETA_ESTADO[estado]}</span>;
}

export const ACCION_BITACORA: Record<string, string> = {
  ciclo_creado: "creó el ciclo",
  ciclo_estado: "cambió el estado del ciclo",
  config_guardada: "cambió las fechas y los avisos",
  carpetas: "preparó las carpetas",
  asignado: "asignó a una oficina",
  borrador: "empezó a responder",
  retomado: "retomó tras la devolución",
  enviado: "envió a revisión",
  aprobado: "aprobó",
  devuelto: "devolvió con observaciones",
  evidencia_agregada: "agregó una evidencia",
  evidencia_quitada: "quitó una evidencia",
  lista_para_entrega: "marcó lista para la entrega",
  retirada_de_entrega: "retiró de la lista de entrega",
  estado: "cambió el estado",
};
