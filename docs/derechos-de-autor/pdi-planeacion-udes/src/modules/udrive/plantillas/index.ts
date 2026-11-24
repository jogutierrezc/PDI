/* =============================================================================
   UDrive · plantillas de documento.

   «Lineamientos estratégicos»: el informe de referencia (portada a sangre,
   contenido, capítulos sugeridos, figuras con pie arriba y nota abajo).
   «En blanco»: solo un párrafo. Una plantilla devuelve un Documento nuevo con
   ids frescos cada vez.
   ========================================================================== */

import type { Documento, PlantillaId } from "../lib/documento";
import { documentoVacio } from "../lib/documento";
import { lineamientos } from "./lineamientos";

export interface FichaPlantilla {
  id: PlantillaId;
  nombre: string;
  descripcion: string;
  crear(titulo: string): Documento;
}

export const PLANTILLAS: FichaPlantilla[] = [
  {
    id: "lineamientos",
    nombre: "Lineamientos estratégicos",
    descripcion: "Portada, contenido con puntos guía, capítulos sugeridos y los cuatro índices.",
    crear: lineamientos,
  },
  {
    id: "blanco",
    nombre: "En blanco",
    descripcion: "Una hoja con un párrafo. Usted arma el resto.",
    crear: (titulo) => {
      const d = documentoVacio("blanco");
      d.portada.titulo = titulo;
      return d;
    },
  },
];

export const plantillaDe = (id: PlantillaId): FichaPlantilla => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[1];
