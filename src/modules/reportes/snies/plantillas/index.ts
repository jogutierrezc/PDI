/* =============================================================================
   SNIES · todas las plantillas, en el orden de cargue del tablero.
   ========================================================================== */

import type { PlantillaId, PlantillaSpec } from "../../tipos";
import { GRADUADOS } from "./graduados";
import { MATRICULADOS } from "./matriculados";
import { PARTICIPANTE } from "./participante";
import { ADMITIDOS } from "./admitidos";
import { INSCRITOS } from "./inscritos";
import { INSCRITOS_PROGRAMA } from "./inscritos_programa";
import { DOCENTES } from "./pendientes";
import { PRIMER_CURSO } from "./primer_curso";

export const PLANTILLAS: PlantillaSpec[] = [
  PARTICIPANTE,
  INSCRITOS,
  INSCRITOS_PROGRAMA,
  ADMITIDOS,
  PRIMER_CURSO,
  MATRICULADOS,
  GRADUADOS,
  DOCENTES,
].sort((a, b) => a.orden - b.orden);

export function plantilla(id: PlantillaId): PlantillaSpec {
  const p = PLANTILLAS.find((x) => x.id === id);
  if (!p) throw new Error(`Plantilla SNIES desconocida: ${id}`);
  return p;
}
