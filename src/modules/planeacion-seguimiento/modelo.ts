/* =============================================================================
   Planeación y Seguimiento · modelo (tipos, listas y formatos). Sin DOM.

   Vocabulario: plan (PDIFyT 2027-2035) › versión (v1.0 borrador o publicada) ›
   línea (cada fila de la matriz, con clave estable `no`). Se habla de CAMPUS
   (Bucaramanga, Valledupar, Cúcuta; «Todos» = todos los campus), nunca de sede.
   ========================================================================== */

import type { PsNivel } from "../../types/database";

export type { PsNivel };

export const CAMPUS = ["Bucaramanga", "Valledupar", "Cúcuta"] as const;
export const CAMPUS_TODOS = "Todos";
export const CAMPUS_LISTA: readonly string[] = [...CAMPUS, CAMPUS_TODOS];
export const CLASIFICACIONES = ["PLF", "IFT", "IFT-LOG"] as const;
export const PRIORIDADES = ["Crítico", "Alto", "Medio", "Largo plazo"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

/** Pilares del PDIFyT tal como vienen en la matriz (clave = código). */
export const PILARES: Record<string, string> = {
  P2: "Ambiente tecnológico",
  P3: "Entorno emprendedor",
  P4: "Gobernanza para el buen gobierno",
  P6: "Apropiación social",
};
export const PILARES_LISTA = Object.entries(PILARES).map(([k, v]) => `${k}. ${v}`);
export const RESULTADOS = ["Aprobado"] as const;
export const FUENTES = ["Presupuesto ordinario institucional", "Crédito bancario", "Financiación mixta", "Leasign financiero", "Otra fuente"] as const;
export const ORIGENES = ["Necesidad Transversal", "PMC"] as const;

export const CRITERIOS = { alin: "Alineación", deficit: "Déficit", norm: "Normativa", pdi: "PDI", sost: "Sostenibilidad" } as const;
export const VIABILIDADES = { tec: "Técnica", fin: "Financiera", op: "Operativa", nor: "Normativa", est: "Estratégica" } as const;
export type ClaveCriterio = keyof typeof CRITERIOS;
export type ClaveViabilidad = keyof typeof VIABILIDADES;

export const ANIO_INI = 2027;
export const ANIO_FIN = 2035;

/** Una línea del plan (una fila de la matriz). Lo vacío es `null`: nunca se inventa. */
export interface Linea {
  no: string;
  clasif: string;
  nombre: string;
  descripcion: string | null;
  campus: string;
  pilar: string;
  monto: number | null;
  prioridad: string;
  resultado: string | null;
  fuente: string | null;
  criterios: Record<ClaveCriterio, boolean | null>;
  viabilidad: Record<ClaveViabilidad, boolean | null>;
  /** AAAA-MM-DD */
  inicio: string | null;
  fin: string | null;
  /** Fracción (0 a 1) de la inversión de cada año; la clave es el año. */
  pct: Record<string, number>;
  origen: string | null;
  /** Nombre de la oficina responsable (de las unidades del portal), si se indicó. */
  oficina: string | null;
  gestorCorreo: string | null;
}

export interface PlanVista {
  id: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  /** La versión que se muestra: la vigente (publicada) o, si no hay, el borrador. */
  version: VersionResumen | null;
}

export interface VersionResumen {
  id: string;
  etiqueta: string;
  estado: "borrador" | "publicada";
  vigente: boolean;
  origen: string | null;
  nLineas: number;
  inversion: number;
  creadaEn: string;
  publicadaEn: string | null;
  nota: string | null;
}

export interface Oficina {
  id: string;
  nombre: string;
}

export interface CargaPlanificacion {
  planId: string;
  lineas: Linea[];
  nombreArchivo: string;
}

/* ---------- Años ---------- */

export const aniosDe = (ini = ANIO_INI, fin = ANIO_FIN): number[] => Array.from({ length: Math.max(0, fin - ini + 1) }, (_, i) => ini + i);
export const ANIOS = aniosDe();

/* ---------- Formatos ---------- */

const nf = new Intl.NumberFormat("es-CO");
/** Pesos completos: $ 6.971.769.559 */
export const pesos = (n: number | null | undefined): string => (n === null || n === undefined ? "Sin monto" : `$ ${nf.format(Math.round(n))}`);
/** Millones: $ 133.374 M (se trunca, como el tablero de ejemplo). */
export const millones = (n: number): string => `$ ${nf.format(Math.floor(n / 1e6))} M`;
export const millones1 = (n: number): string => (Math.abs(n) < 10e6 ? `$ ${(n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : millones(n));
export const entero = (n: number): string => nf.format(n);
export const porcentaje = (fraccion: number, decimales = 0): string => `${(fraccion * 100).toLocaleString("es-CO", { maximumFractionDigits: decimales })} %`;

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fecha(s: string | null | undefined): string {
  if (!s) return "Sin fecha";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${Number(d)} ${MES[Number(m) - 1]} ${y}`;
}

export const pilarCodigo = (pilar: string): string => pilar.slice(0, 2);
export const pilarNombre = (pilar: string): string => pilar.replace(/^P\d\.?\s*/, "");
export const clavePilar = (pilar: string): number => Number(pilar.slice(1, 2)) || 0;

export const rotuloCampus = (campus: string): string => (campus === CAMPUS_TODOS ? "Todos los campus" : campus);
export const rotuloNivel: Record<PsNivel, string> = {
  none: "Sin acceso",
  lector: "Lector o directivo",
  colaborador: "Colaborador",
  gestor: "Gestor de oficina",
  aprobador: "Aprobador",
  admin: "Administrador de planeación",
};

/** ¿Puede cargar la planificación, crear el plan y publicar? Solo el administrador. */
export const puedeAdministrar = (nivel: PsNivel): boolean => nivel === "admin";

/** Texto sin tildes, en minúsculas y sin espacios repetidos: para comparar lo escrito con las listas. */
export const llano = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
