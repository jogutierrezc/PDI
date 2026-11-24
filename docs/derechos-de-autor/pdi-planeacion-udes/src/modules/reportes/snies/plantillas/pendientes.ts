/* =============================================================================
   SNIES · plantillas que aún no se capturan.

   Aparecen en el tablero con su orden y sus fechas (§2.6.1), pero sin campos
   ni reglas hasta que se construyan.
   ========================================================================== */

import type { PlantillaSpec } from "../../tipos";

export const DOCENTES: PlantillaSpec = {
  id: "docentes",
  nombre: "Docentes",
  modulo: "Recurso humano",
  seccion: "§3.3.1",
  orden: 8,
  depende: ["participante"],
  // §2.6.1: Recurso humano solo tiene fecha definitiva.
  fechas: {
    1: { primerCorte: null, definitiva: { fecha: "07-31" } },
    2: { primerCorte: null, definitiva: { fecha: "01-31", siguienteAnio: true } },
  },
  disponible: false,
  campos: [],
  reglas: [],
  reglasPlantilla: [],
};
