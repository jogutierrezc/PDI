/* =============================================================================
   Cumplimiento de Tipología · tipos, rótulos y reglas de lectura de la pantalla.
   Las filas son las de las tablas ct_* (migración 0260). Nada de esto calcula
   cumplimiento: eso lo hizo el motor al calcular el corte (motor/).
   ========================================================================== */

import type { CtNivel } from "../../types/database";
import type { Comparacion, RangoDesglose, Sugerencia } from "./motor/corte";

export { nombrePeriodo, nombreSede, periodosLista, SEDES } from "../gestion-master/modelo";

export type NivelCt = CtNivel;

export type Vista = "programa" | "sedes" | "corte" | "programas";

/**
 * Cómo se colorea el cumplimiento. Son criterios de lectura de la maqueta aprobada, NO una regla de la universidad ni
 * parte de la tipología: cambiarlos no cambia ningún veredicto.
 */
export const LECTURA = {
  /** El titular del programa va en verde desde este porcentaje de profesores que cumplen. */
  titularBueno: 70,
  /** Programas por sede: verde desde aquí, ámbar desde `matrizAmbar`, rojo por debajo. */
  matrizBueno: 75,
  matrizAmbar: 55,
} as const;

/** Las cinco canastas de Master, con su campo en ct_resumen y su color (tokens: paleta categórica `--od-line-*`). */
export const CANASTAS_UI = [
  { campo: "horas_docencia", nombre: "Docencia", color: "var(--od-line-1)" },
  { campo: "horas_investigacion", nombre: "Investigación", color: "var(--od-line-4)" },
  { campo: "horas_extension", nombre: "Extensión", color: "var(--od-line-2)" },
  { campo: "horas_administracion", nombre: "Administración", color: "var(--od-line-7)" },
  { campo: "horas_bienestar", nombre: "Bienestar", color: "var(--od-line-6)" },
] as const;

export type CampoCanasta = (typeof CANASTAS_UI)[number]["campo"];

/** El estado en Master, con el vocabulario del motor (normalizarEstadoMaster). */
export const ESTADO_MASTER: Record<string, { texto: string; tono: "ok" | "wait" | "neutral" | "risk" }> = {
  APROBADA: { texto: "Aprobada", tono: "ok" },
  PREAPROBADA: { texto: "Preaprobada", tono: "wait" },
  SIN_APROBAR: { texto: "Sin aprobar", tono: "risk" },
  NO_DETERMINADO: { texto: "Por confirmar", tono: "wait" },
  SIN_DATO_MASTER: { texto: "Sin dato", tono: "neutral" },
};

export const FUENTE_TEXTO: Record<string, string> = { PREGRADO: "Pregrado", POSGRADO: "Solo posgrado", AMBAS: "Pregrado y posgrado" };

/* --- Filas de la base --------------------------------------------------------------------------------------- */

export interface Resumen {
  id: string;
  corte_id: string;
  periodo: string;
  sede: string;
  seudonimo: string;
  programa: string;
  programa_norm: string;
  contrato: string;
  perfil: string;
  escalafon: string;
  duracion: string;
  veredicto: string;
  horas_esperadas: number | null;
  horas_total: number;
  horas_docencia: number;
  horas_investigacion: number;
  horas_extension: number;
  horas_administracion: number;
  horas_bienestar: number;
  horas_ensenanza: number;
  horas_derivadas: number;
  horas_inv_ext: number;
  horas_gestion: number;
  horas_capacitacion: number;
  horas_comite: number;
  horas_preparacion: number;
  horas_pregrado: number;
  horas_posgrado: number;
  actividades: number;
  estado_master: string;
  preaprobacion: string;
  fuente_nomina: string;
  lectura_operativa: string;
  perfil_sugerido: string | null;
  sugerencia: Sugerencia;
  consideracion_aprobacion: boolean;
  incumplimientos: number;
  preventivas: number;
  causas: string[];
  comparacion: Comparacion[];
  desglose: RangoDesglose[];
  semana: number[][] | null;
  carga: { c: string; h: number; t: string }[];
}

export interface Observacion {
  id: number;
  orden: number;
  causa: string;
  categoria: string;
  tipo: string;
  texto: string;
  resumen: string;
}

export interface GrupoSinMatricula {
  id: number;
  codigo: string;
  nombre: string;
  grupo: string;
  capacidad: number;
  departamento: string;
  afectacion: string;
}

export interface ObservacionMaster {
  resumen_id: string;
  observacion_255: string;
  observacion_ampliada: string;
}

export interface CeldaMatriz {
  programa_norm: string;
  programa: string;
  sede: string;
  profesores: number;
  cumplen: number;
  no_cumplen: number;
  sin_regla: number;
  corte_en: string | null;
}

export interface CorteActual {
  id: string;
  terminado_en: string | null;
  profesores: number;
  observaciones: number;
  insumos: InsumoUsado[] | null;
  avisos: string[] | null;
}

export interface InsumoUsado {
  fuente: string;
  conjunto: string;
  version: number | null;
  filas: number;
  terminada_en: string | null;
  usado: boolean;
}

export interface FilaBitacora {
  id: string;
  sede: string;
  estado: "en_curso" | "completo" | "fallido" | "reemplazado";
  profesores: number;
  observaciones: number;
  mensaje: string;
  avisos: string[];
  insumos: InsumoUsado[];
  creado_en: string;
  terminado_en: string | null;
  quien: string;
}

export interface ProgramaUnidad {
  programa_norm: string;
  programa: string;
  unit_id: string | null;
  unidad: string | null;
  origen: "sugerida" | "manual";
  profesores: number;
}

export interface UnidadOpcion {
  id: string;
  nombre: string;
  tipo: string;
  codigo: string;
}

/* --- Lectura ------------------------------------------------------------------------------------------------- */

/** El número como se lee en horas: entero sin decimales, o con uno. */
export const horas = (v: number | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
};

export const entero = (v: number) => v.toLocaleString("es-CO");

/** «···a3f9»: cómo se nombra a un profesor mientras no se hayan leído los nombres. */
export const abreviado = (seudonimo: string) => `···${seudonimo.slice(-4)}`;

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "·";
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Los nombres de la nómina vienen «APELLIDOS NOMBRES» en mayúsculas: se leen mejor con inicial mayúscula. */
export function nombreLegible(nombre: string): string {
  return nombre
    .toLocaleLowerCase("es-CO")
    .split(/\s+/)
    .map((p) => (p.length > 2 ? p.charAt(0).toLocaleUpperCase("es-CO") + p.slice(1) : p))
    .join(" ");
}

export function mensajeDe(error: unknown): string {
  const m = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (/ct_\w+.*does not exist|schema cache|PGRST202|ct_nivel/i.test(m)) return "Falta aplicar la migración 0260 (Cumplimiento de Tipología) en la base de datos.";
  if (/corte_en_curso/.test(m)) return "Ya hay un corte de este periodo y sede en marcha. Espere a que termine o intente en media hora.";
  if (/corte_vacio/.test(m)) return "El corte no tiene profesores: no se dejó vigente. Revise que la nómina (ms_nom) esté cargada en el Warehouse.";
  if (/violates check constraint|violates (unique|foreign key) constraint/i.test(m)) return "Un dato del corte no cumple una regla de la base. Revise la bitácora e intente de nuevo.";
  return m.replace(/^ERROR:\s*/i, "").trim() || "Algo falló. Intente de nuevo.";
}

/** Reemplaza la línea de identidad de la observación ampliada por el nombre leído en vivo, si ya se leyó. */
export function conNombre(ampliada: string, nombre: string | undefined): string {
  if (!nombre) return ampliada;
  return ampliada.replace(/^Profesor: identificado por el seudónimo \S+/m, () => `Profesor: ${nombre}`);
}
