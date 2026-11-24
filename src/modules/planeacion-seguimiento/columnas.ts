/* =============================================================================
   Planeación y Seguimiento · las columnas de la hoja «Líneas del plan».

   Una sola definición para la plantilla (plantilla.ts) y para el importador
   (importar.ts): el encabezado, de qué tipo es la columna y cómo se diligencia.
   Sin DOM ni exceljs.
   ========================================================================== */

import { ANIOS, CRITERIOS, VIABILIDADES } from "./modelo";

export const HOJA_INSTRUCCIONES = "Instrucciones";
export const HOJA_LINEAS = "Líneas del plan";
export const HOJA_LISTAS = "Listas";
export const HOJA_CONTROL = "_Control";
/** Lo que lleva la columna N.º de las filas de ejemplo: al importar se ignoran. */
export const MARCA_EJEMPLO = "EJEMPLO";
export const FORMATO_PLAN = "pdi-plan-lineas";
export const VERSION_FORMATO = 1;
export const MAX_LINEAS = 300;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILAS_LECTURA = 1500;
export const MAX_COLUMNAS_LECTURA = 48;

export type Tipo = "diligenciar" | "obligatoria" | "bloqueada";

export type CampoId =
  | "no" | "clasif" | "nombre" | "descripcion" | "campus" | "pilar" | "monto" | "prioridad" | "resultado" | "fuente"
  | `crit:${string}` | `viab:${string}` | "inicio" | "fin" | `pct:${number}` | "origen" | "oficina" | "gestorCorreo";

export interface Columna {
  id: CampoId;
  /** Lo que identifica la columna al importar (lo que va antes del paréntesis). */
  base: string;
  /** Pista corta entre paréntesis. */
  pista: string;
  ancho: number;
  tipo: Tipo;
}

const col = (id: CampoId, base: string, pista: string, ancho: number, tipo: Tipo): Columna => ({ id, base, pista, ancho, tipo });

export const COLUMNAS: Columna[] = [
  col("no", "N.º", "clave de la línea; no se repite", 10, "obligatoria"),
  col("clasif", "Clasificación", "PLF, IFT, IFT-LOG o IFT-LAB", 16, "obligatoria"),
  col("nombre", "Nombre", "hasta 300 caracteres", 44, "obligatoria"),
  col("descripcion", "Descripción", "hasta 1.000 caracteres", 60, "diligenciar"),
  col("campus", "Campus", "elija de la lista", 16, "obligatoria"),
  col("pilar", "Pilar", "elija de la lista", 34, "obligatoria"),
  col("monto", "Monto", "en pesos, solo el número", 20, "obligatoria"),
  col("prioridad", "Prioridad", "elija de la lista", 14, "obligatoria"),
  col("resultado", "Resultado de la evaluación", "vacío si aún no se evalúa", 20, "diligenciar"),
  col("fuente", "Fuente de financiación", "elija de la lista", 30, "diligenciar"),
  ...Object.entries(CRITERIOS).map(([k, v]) => col(`crit:${k}`, `Criterio ${v}`, "Sí o No", 13, "diligenciar")),
  ...Object.entries(VIABILIDADES).map(([k, v]) => col(`viab:${k}`, `Viabilidad ${v}`, "Sí o No", 13, "diligenciar")),
  col("inicio", "Fecha de inicio", "AAAA-MM-DD", 16, "diligenciar"),
  col("fin", "Fecha de fin", "AAAA-MM-DD", 16, "diligenciar"),
  ...ANIOS.map((a) => col(`pct:${a}`, `% de inversión ${a}`, "de 0 a 100", 12, "diligenciar")),
  col("origen", "Origen", "de dónde viene la línea", 24, "diligenciar"),
  col("oficina", "Oficina responsable", "elija de la lista", 36, "diligenciar"),
  col("gestorCorreo", "Correo del gestor", "opcional", 30, "diligenciar"),
];

export const tituloColumna = (c: Columna): string => `${c.base} (${c.pista})`;

/** «Monto (en pesos, solo el número)» → «Monto». */
export const baseDeEncabezado = (t: string): string => t.replace(/\s*\(.*$/s, "").trim();
