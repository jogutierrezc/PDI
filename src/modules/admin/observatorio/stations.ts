/* Las cuatro estaciones del taller del Observatorio. Viven aparte, sin el taller,
   porque el lanzador de la intranet (/admin) también las lista en su portal. */

import type { IconName } from "../../../components/ui/Icon";

export type ObsStationId = "captura" | "diseno" | "tableros" | "boletin";

export const OBS_STATIONS: { id: ObsStationId; number: number; label: string; hint: string; icon: IconName }[] = [
  { id: "captura", number: 1, label: "Captura de datos", hint: "Importar, analizar y anonimizar las tablas de cada tema", icon: "upload" },
  { id: "diseno", number: 2, label: "Diseño visual", hint: "Armar visores sobre las tablas: tipo de gráfica, campos y clasificación", icon: "spark-chart" },
  { id: "tableros", number: 3, label: "Tableros", hint: "Tipo de informe de cada tema y vista previa de su página", icon: "columns" },
  { id: "boletin", number: 4, label: "Boletín", hint: "PDF del Observatorio por temas, años, periodos, fuentes y tipos de dato", icon: "document" },
];
