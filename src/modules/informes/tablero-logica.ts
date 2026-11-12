/* =============================================================================
   Tablero del ciclo · lógica pura (sin React ni Supabase): resumen por estado,
   filtros de la entrega por unidad y qué plantilla toca a cada unidad.
   Se prueba aparte (tablero-logica.test.ts).
   ========================================================================== */

import { plantillaPermitida } from "./mejoras-logica";
import { plantillaSugerida } from "./plantillas";
import type { EstadoInstancia, Plantilla, PlantillaUnidadRow } from "./types";

export type EstadoFila = EstadoInstancia | "none";
export type FiltroEstado = EstadoFila | "todos";

/** Una fila del tablero: una unidad (y sede) con su informe, si ya se abrió. */
export interface FilaEntrega {
  clave: string;
  unitId: string;
  nombre: string;
  /** Tipo de unidad (units.kind). */
  tipo: string;
  estado: EstadoFila;
  hechas: number;
  total: number;
  /** Tiene al menos un archivo de evidencia cargado. */
  conEvidencias: boolean;
}

export const ORDEN_ESTADOS: EstadoFila[] = ["none", "draft", "sent", "back", "ok"];
export const ETIQUETA_FILTRO: Record<EstadoFila, string> = { none: "Sin abrir", draft: "Borrador", sent: "Enviado", back: "Devuelto", ok: "Aprobado" };

export interface ResumenEntrega {
  total: number;
  abiertos: number;
  porEstado: Record<EstadoFila, number>;
  /** Secciones listas entre las secciones totales de todas las unidades (0 a 1). */
  avance: number;
  conEvidencias: number;
}

export function resumirEntrega(filas: FilaEntrega[]): ResumenEntrega {
  const porEstado: Record<EstadoFila, number> = { none: 0, draft: 0, sent: 0, back: 0, ok: 0 };
  let hechas = 0;
  let total = 0;
  let conEvidencias = 0;
  for (const f of filas) {
    porEstado[f.estado] += 1;
    hechas += Math.min(f.hechas, f.total);
    total += f.total;
    if (f.conEvidencias) conEvidencias += 1;
  }
  return { total: filas.length, abiertos: filas.length - porEstado.none, porEstado, avance: total ? hechas / total : 0, conEvidencias };
}

/** Minúsculas y sin tildes, para buscar «decanatura» y encontrar «Decanatura». */
export const normalizar = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface Filtros {
  estado: FiltroEstado;
  /** «todos» o un valor de units.kind. */
  tipo: string;
  texto: string;
}

export const SIN_FILTROS: Filtros = { estado: "todos", tipo: "todos", texto: "" };
export const hayFiltros = (f: Filtros): boolean => f.estado !== "todos" || f.tipo !== "todos" || f.texto.trim() !== "";

export function filtrarEntrega(filas: FilaEntrega[], f: Filtros): FilaEntrega[] {
  const q = normalizar(f.texto);
  if (!hayFiltros(f)) return filas;
  return filas.filter((x) => (f.estado === "todos" || x.estado === f.estado) && (f.tipo === "todos" || x.tipo === f.tipo) && (!q || normalizar(x.nombre).includes(q)));
}

/** Los tipos de unidad presentes, ordenados, para el selector. */
export const tiposDe = (filas: FilaEntrega[]): string[] => [...new Set(filas.map((f) => f.tipo))].sort((a, b) => a.localeCompare(b, "es"));

/** «vicerrectoria_x» se lee «Vicerrectoria x». */
export const etiquetaTipo = (tipo: string): string => {
  const t = tipo.replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Otra";
};

/**
 * La plantilla que se propone a una unidad: la que Planeación eligió si la puede usar; si hay una plantilla
 * limitada a esta oficina, esa; luego la sugerida por su tipo; y si no puede usarla, la primera permitida.
 */
export function plantillaInicial(unitId: string, tipo: string, nombre: string, permitidas: Plantilla[], filasPU: PlantillaUnidadRow[], elegida?: Plantilla): Plantilla {
  if (elegida && permitidas.includes(elegida)) return elegida;
  const propia = permitidas.find((p) => filasPU.some((f) => f.plantilla === p && f.unit_id === unitId));
  if (propia) return propia;
  const sugerida = plantillaSugerida(tipo, nombre);
  if (permitidas.includes(sugerida)) return sugerida;
  return permitidas[0] ?? sugerida;
}

/** Las que la unidad puede usar según `informe_plantilla_unidades`. */
export const permitidasDe = (filasPU: PlantillaUnidadRow[], unitId: string, ofrecidas: Plantilla[]): Plantilla[] => ofrecidas.filter((p) => plantillaPermitida(filasPU, p, unitId));

/** Iniciales de una persona: dos letras (o el inicio del correo). */
export function iniciales(nombre: string, correo = ""): string {
  const partes = (nombre.trim() || correo.split("@")[0] || "?").split(/[\s._-]+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "?";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}
