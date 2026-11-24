/* Internacionalización · todas las plantillas que mira el módulo: las SNIES
   del catálogo REAL de Reportes y las que cargó el Director (CNA, rankings). */

import { PLANTILLAS } from "../../reportes/snies/plantillas";
import type { PlantillaSpec } from "../../reportes/tipos";
import type { PlantillaConColumnas } from "../datos";
import { plantillaDesdeFilas, plantillaDesdeSnies } from "../lib/cobertura";
import type { PlantillaCobertura } from "../lib/cobertura";
import { definicionPuente } from "../lib/puente-snies";

export interface PlantillaVista extends PlantillaCobertura {
  /** La spec de Reportes, si es SNIES. */
  spec?: PlantillaSpec;
  /** Fila de int_plantillas, si la cargó el Director. */
  guardada?: PlantillaConColumnas;
  /** ¿Tiene puente «Enviar a SNIES»? */
  puente: boolean;
}

export const ETIQUETA_TIPO: Record<PlantillaCobertura["tipo"], string> = { snies: "SNIES", cna: "CNA", ranking: "Ranking", otra: "Otra" };

export function listaPlantillas(guardadas: readonly PlantillaConColumnas[]): PlantillaVista[] {
  const snies: PlantillaVista[] = PLANTILLAS.map((spec) => ({ ...plantillaDesdeSnies(spec), spec, puente: Boolean(definicionPuente(spec.id)) && spec.disponible }));
  const propias: PlantillaVista[] = guardadas.map((g) => ({ ...plantillaDesdeFilas(g, g.columnas), guardada: g, puente: false }));
  return [...snies, ...propias];
}
