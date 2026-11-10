/* =============================================================================
   Warehouse UDES · tableros propios: guardado, cálculo y Pilo Tableros.

   Un tablero es un archivo de UDrive (`drive_archivos.tipo = 'tablero'`, 0270) con su definición (ModeloBI) en
   `contenido`. No guarda datos: cada visual se calcula al abrirlo con wh_explorar (0269), así que quien no tiene
   el Warehouse no ve cifras. Aquí vive todo lo que toca la red; las reglas están en ./modelo.
   ========================================================================== */

import { useQuery } from "@tanstack/react-query";
import { supabase, readFunctionError } from "../../lib/supabase";
import { useArchivos } from "../udrive/datos";
import type { ArchivoRow } from "../udrive/tipos";
import {
  DIMENSIONES,
  dimensionesDesglosables,
  ejecutarMedida,
  medidaPorId,
  NoCalculable,
  normalizarNombre,
  tablaDePeriodos,
  type DimensionId,
  type FilaResultado,
  type Lector,
  type ModeloBI,
  type VisualBI,
} from "./modelo";
import { explorarCarga, type Cobertura } from "./store";

/* --- Listar -------------------------------------------------------------------------------- */

export const esTablero = (a: ArchivoRow) => (a.tipo as string) === "tablero" && !a.borrado_en;

export function useTablerosGuardados(): { tableros: ArchivoRow[]; cargando: boolean; error: unknown } {
  const q = useArchivos();
  return { tableros: (q.data ?? []).filter(esTablero), cargando: q.isPending, error: q.error };
}

/** Lo que se guarda: se recorta a la forma del modelo para no guardar nada de más. */
export function modeloParaGuardar(m: ModeloBI): ModeloBI {
  return { version: 1, nombre: m.nombre.trim().slice(0, 80), pregunta: m.pregunta.trim().slice(0, 400), publico: m.publico, fuentes: m.fuentes, reglas: m.reglas, medidas: m.medidas, paginas: m.paginas };
}

export function leerModelo(contenido: unknown): ModeloBI | null {
  const m = contenido as Partial<ModeloBI> | null;
  if (!m || typeof m !== "object" || m.version !== 1 || !Array.isArray(m.paginas) || !Array.isArray(m.fuentes)) return null;
  return { version: 1, nombre: String(m.nombre ?? ""), pregunta: String(m.pregunta ?? ""), publico: m.publico ?? "planeacion", fuentes: m.fuentes, reglas: m.reglas ?? [], medidas: m.medidas ?? [], paginas: m.paginas };
}

/* --- Leer de la base ------------------------------------------------------------------------- */

const ORDEN_CORTE = ["f", "3", "2", "1", ""];

/** El lector de la base: la carga vigente de la fuente en la sede y el periodo (con el corte pedido o el más reciente). */
export function crearLector(cobertura: Cobertura[], sede: string, corte: string | null): Lector {
  return async (p) => {
    const posibles = cobertura.filter((c) => c.conjunto === p.fuente && c.sede === sede && c.periodo === p.periodo);
    if (!posibles.length) return null;
    const carga = (corte !== null ? posibles.find((c) => c.corte === corte) : undefined) ?? [...posibles].sort((a, b) => ORDEN_CORTE.indexOf(a.corte) - ORDEN_CORTE.indexOf(b.corte))[0];
    const r = await explorarCarga(carga.id, p.dims, [p.medida], p.filtros, "valor_desc", 5000);
    return { filas: r.filas.map((f) => ({ k: f.k, v: f.v })), descartados: r.descartados };
  };
}

/* --- Calcular un visual ------------------------------------------------------------------------ */

export interface DatosVisual {
  /** Una columna por medida del visual. */
  encabezados: string[];
  formatos: string[];
  filas: { clave: string[]; valores: (number | null)[] }[];
  /** Para líneas: los periodos del eje y una serie por medida. */
  periodos?: string[];
  series?: { nombre: string; valores: (number | null)[] }[];
  descartados: number;
  /** Lo que no se pudo calcular o falta: se muestra al pie del visual. */
  avisos: string[];
}

const claveDe = (c: string[]) => c.map((x) => normalizarNombre(x)).join("|");

export async function calcularVisual(v: VisualBI, ctx: { periodo: string; periodosGuardados: string[]; leer: Lector }): Promise<DatosVisual> {
  const tabla = tablaDePeriodos(ctx.periodosGuardados);
  const fila = tabla.find((f) => f.periodo === ctx.periodo);
  const base = { periodo: ctx.periodo, anterior: fila?.anterior ?? null, leer: ctx.leer };
  const nombres = v.medidas.map((id) => medidaPorId(id)?.nombre ?? id);
  const formatos = v.medidas.map((id) => medidaPorId(id)?.formato ?? "decimal");
  const salida: DatosVisual = { encabezados: nombres, formatos, filas: [], descartados: 0, avisos: [] };
  if (v.tipo === "narrativa" || !v.medidas.length) return salida;

  const aviso = (e: unknown) => {
    if (e instanceof NoCalculable) salida.avisos.push(e.message);
    else throw e;
  };

  if (v.tipo === "lineas") {
    const hasta = tabla.filter((f) => f.orden <= (fila?.orden ?? 0)).slice(-8);
    salida.periodos = hasta.map((f) => f.periodo);
    salida.series = [];
    for (const id of v.medidas) {
      const valores: (number | null)[] = [];
      try {
        for (const f of hasta) {
          const r = await ejecutarMedida(id, { periodo: f.periodo, anterior: f.anterior, dims: [], leer: ctx.leer });
          valores.push(r.filas[0]?.valor ?? null);
          salida.descartados += r.descartados;
        }
        salida.series.push({ nombre: medidaPorId(id)?.nombre ?? id, valores });
      } catch (e) {
        aviso(e);
      }
    }
    return salida;
  }

  const dims: DimensionId[] = v.tipo === "kpi" ? [] : (v.dimensiones as DimensionId[]);
  const unidas = new Map<string, { clave: string[]; valores: (number | null)[] }>();
  for (const [i, id] of v.medidas.entries()) {
    try {
      const r = await ejecutarMedida(id, { ...base, dims });
      salida.descartados += r.descartados;
      if (r.sinDatos.length) salida.avisos.push(`No hay carga de «${r.sinDatos.join(", ")}» en ${ctx.periodo}.`);
      for (const f of r.filas) {
        const k = claveDe(f.clave);
        const existente = unidas.get(k) ?? { clave: f.clave, valores: v.medidas.map(() => null) };
        existente.valores[i] = f.valor;
        unidas.set(k, existente);
      }
    } catch (e) {
      aviso(e);
    }
  }
  salida.filas = [...unidas.values()];
  return salida;
}

export interface ContextoVisual {
  periodo: string;
  sede: string;
  corte: string | null;
  cobertura: Cobertura[];
}

/** La consulta de un visual: la comparten la pantalla y la lectura de Pilo, que así no calculan dos veces. */
export function consultaVisual(clave: string, v: VisualBI, ctx: ContextoVisual) {
  const delaSede = ctx.cobertura.filter((c) => c.sede === ctx.sede);
  const periodosGuardados = [...new Set(delaSede.map((c) => c.periodo))];
  return {
    queryKey: ["warehouse", "visual", clave, v, ctx.periodo, ctx.sede, ctx.corte, delaSede.map((c) => c.id)] as const,
    retry: false as const,
    staleTime: 5 * 60_000,
    queryFn: () => calcularVisual(v, { periodo: ctx.periodo, periodosGuardados, leer: crearLector(ctx.cobertura, ctx.sede, ctx.corte) }),
  };
}

/** Un visual calculado, con caché: una versión guardada no cambia, así que el resultado tampoco. */
export function useVisual(clave: string, v: VisualBI, ctx: ContextoVisual) {
  return useQuery({ ...consultaVisual(clave, v, ctx), enabled: v.tipo !== "narrativa" });
}

/** Las dimensiones por las que se puede desglosar cada medida, listas para ofrecer al asistente y a Pilo. */
export function dimensionesDeMedida(id: string): DimensionId[] {
  const m = medidaPorId(id);
  return m ? dimensionesDesglosables(m.calculo) : [];
}
export const nombreDimension = (d: string) => DIMENSIONES[d as DimensionId]?.nombre ?? d;

/** Las filas de más valor, hasta `limite`; la razón de las ocultas se dice al pie. */
export function mejores(filas: DatosVisual["filas"], limite: number) {
  const ordenadas = [...filas].sort((a, b) => (b.valores[0] ?? -Infinity) - (a.valores[0] ?? -Infinity));
  return { visibles: ordenadas.slice(0, limite), ocultas: Math.max(0, ordenadas.length - limite) };
}
export type { FilaResultado };

/* --- Pilo Tableros --------------------------------------------------------------------------- */

export interface PropuestaPilo {
  nombre: string;
  medidas: string[];
  paginas: { nombre: string; plantilla: "ejecutivo" | "diagnostico" | "detalle"; visuales: { tipo: VisualBI["tipo"]; titulo: string; medidas: string[]; dimensiones: DimensionId[] }[] }[];
  notas: string[];
}
export interface NarracionPilo {
  titular: string;
  parrafos: string[];
  limites: string[];
  avisos: string[];
}

async function invocarTableros<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("pilo-tableros", { body });
  if (r.error) {
    const contexto = (r.error as { context?: Response }).context;
    if (!contexto) throw new Error("No se pudo llegar a la función «pilo-tableros»: ¿está desplegada?");
    const detalle = await readFunctionError(r.error);
    if (detalle) throw new Error(detalle);
    throw new Error(`La función respondió ${contexto.status}.`);
  }
  return r.data as T;
}

export const estadoPiloTableros = () => invocarTableros<{ ok: boolean; ai: boolean; motivo?: string; proveedor: string; modelo: string }>({ action: "estado" });

export function useEstadoPiloTableros() {
  return useQuery({ queryKey: ["warehouse", "pilo-tableros"], queryFn: estadoPiloTableros, retry: false, staleTime: 60_000 });
}

export const proponerTablero = (pedido: { pregunta: string; publico: string; fuentes: string[]; medidas: { id: string; nombre: string; descripcion: string; dimensiones: string[] }[] }) =>
  invocarTableros<{ ok: boolean; propuesta: PropuestaPilo }>({ action: "proponer", pedido });

export const narrarTablero = (cifras: { nombre: string; pregunta: string; periodo: string; sede: string; visuales: { titulo: string; medida: string; formato: string; filas: { clave: string; valor: number | null }[] }[] }) =>
  invocarTableros<{ ok: boolean; narracion: NarracionPilo }>({ action: "narrar", cifras });

/** Las cifras de un visual que se le entregan a Pilo: ya agregadas, hasta 12 filas. */
export function cifrasDeVisual(v: VisualBI, d: DatosVisual): { titulo: string; medida: string; formato: string; filas: { clave: string; valor: number | null }[] } | null {
  if (v.tipo === "narrativa" || !d.filas.length) return null;
  const { visibles } = mejores(d.filas, 12);
  return { titulo: v.titulo, medida: d.encabezados[0] ?? "", formato: d.formatos[0] ?? "decimal", filas: visibles.map((f) => ({ clave: f.clave.join(" · ") || "Total", valor: f.valores[0] })) };
}
