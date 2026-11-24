/* =============================================================================
   UDES en Cifras · rótulos de la definición de un indicador.

   Los mismos en Estructura y KPI (vista clásica) y en el modo completo del
   taller: un formato o una lectura de la variación se llaman igual en las dos.
   ========================================================================== */

import type { OdAggregation, OdDirection, OdValueFormat } from "../../../types/database";

export const FORMAT_LABEL: Record<OdValueFormat, string> = { entero: "Entero", porcentaje: "Porcentaje", decimal: "Decimal" };
export const DIRECTION_LABEL: Record<OdDirection, string> = { sube: "Subir es mejor", baja: "Bajar es mejor", neutro: "Neutro" };
export const AGGREGATION_LABEL: Record<OdAggregation, string> = {
  suma: "Suma de campus",
  reportado: "Total reportado aparte",
};
