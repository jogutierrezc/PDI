/* Planeación y Seguimiento · Fase 2 · columnas de la hoja «Actividades» (plantilla e importador comparten esta definición). Sin DOM ni exceljs. */

import type { Tipo } from "../columnas";

export const HOJA_INSTRUCCIONES_ACT = "Instrucciones";
export const HOJA_ACTIVIDADES = "Actividades";
export const HOJA_LISTAS_ACT = "Listas";
/** Hoja de ayuda, visible, con el catálogo del PDI (pilares, áreas y líneas de acción con su código). */
export const HOJA_PDI_ACT = "PDI";
export const HOJA_CONTROL_ACT = "_Control";
export const FORMATO_ACT = "pdi-plan-actividades";
export const VERSION_FORMATO_ACT = 2;
export const MARCA_EJEMPLO_ACT = "EJEMPLO";
export const MAX_ACTIVIDADES = 300;
/** Lo que se elige en «Línea del plan» cuando la actividad no contribuye a una línea. */
export const ACT_PROPIA = "Actividad propia de la oficina";
export const MAX_RESPONSABLES = 3;

export type CampoAct = "n" | "linea" | "titulo" | "descripcion" | "inicio" | "fin" | "hito" | "prioridad" | "campus" | "pdi" | "pilar_pdi" | "linea_pdi" | `resp:${number}`;

export interface ColumnaAct {
  id: CampoAct;
  base: string;
  pista: string;
  ancho: number;
  tipo: Tipo;
}

const c = (id: CampoAct, base: string, pista: string, ancho: number, tipo: Tipo): ColumnaAct => ({ id, base, pista, ancho, tipo });

export const COLUMNAS_ACT: ColumnaAct[] = [
  c("n", "N.º", "opcional, para su control", 9, "diligenciar"),
  c("linea", "Línea del plan", "elija de la lista", 52, "obligatoria"),
  c("titulo", "Actividad", "qué se va a hacer, hasta 200 caracteres", 46, "obligatoria"),
  c("descripcion", "Descripción", "hasta 1.000 caracteres", 50, "diligenciar"),
  c("inicio", "Fecha de inicio", "AAAA-MM-DD; en un hito, vacía", 16, "obligatoria"),
  c("fin", "Fecha de fin", "AAAA-MM-DD; en un hito, su fecha", 16, "obligatoria"),
  c("hito", "Es un hito", "Sí o No; vacío es No", 12, "diligenciar"),
  c("prioridad", "Prioridad", "elija de la lista", 13, "obligatoria"),
  c("campus", "Campus", "elija de la lista", 16, "obligatoria"),
  c("pdi", "Conexión con el PDI", "Con PDI o Sin conexión", 20, "obligatoria"),
  c("pilar_pdi", "Pilar del PDI", "nombre o código; varios con «;»", 34, "diligenciar"),
  c("linea_pdi", "Línea de acción del PDI", "código como LA-2.1.1; varios con «;»", 34, "diligenciar"),
  ...Array.from({ length: MAX_RESPONSABLES }, (_, i) => c(`resp:${i + 1}`, `Responsable ${i + 1}`, "correo; elija de la lista", 32, "diligenciar")),
];

export const tituloColumnaAct = (col: ColumnaAct): string => `${col.base} (${col.pista})`;
export const colAct = (id: CampoAct): ColumnaAct => COLUMNAS_ACT.find((x) => x.id === id)!;
