/* =============================================================================
   Warehouse UDES · tableros propios: guardado, cálculo y Pilo Tableros.

   Un tablero es un archivo de UDrive (`drive_archivos.tipo = 'tablero'`, 0270) con su definición (ModeloBI) en
   `contenido`. No guarda datos: cada visual se calcula al abrirlo con wh_explorar (0269), así que quien no tiene
   el Warehouse no ve cifras. Aquí vive todo lo que toca la red; las reglas están en ./modelo.
   ========================================================================== */

import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase, readFunctionError } from "../../lib/supabase";
import { useArchivos } from "../udrive/datos";
import type { ArchivoRow } from "../udrive/tipos";
import {
  columnaDe,
  detectarHallazgos,
  dimensionesDeLaMedida,
  ejecutarMedida,
  fuentePorId,
  medidaPorId,
  nombreDeDimension,
  NoCalculable,
  normalizarNombre,
  registrarMedidas,
  tablaDePeriodos,
  type AnalisisRelaciones,
  type FilaResultado,
  type Lector,
  type ModeloBI,
  type Perfiles,
  type VisualBI,
} from "./modelo";
import { explorarCarga, perfilarCarga, type Cobertura, type ColumnaPerfil } from "./store";

/* --- Listar -------------------------------------------------------------------------------- */

export const esTablero = (a: ArchivoRow) => (a.tipo as string) === "tablero" && !a.borrado_en;

export function useTablerosGuardados(): { tableros: ArchivoRow[]; cargando: boolean; error: unknown } {
  const q = useArchivos();
  return { tableros: (q.data ?? []).filter(esTablero), cargando: q.isPending, error: q.error };
}

/** Lo que se guarda: se recorta a la forma del modelo para no guardar nada de más. */
export function modeloParaGuardar(m: ModeloBI): ModeloBI {
  const propias = (m.medidasPropias ?? []).filter((x) => m.medidas.includes(x.id));
  return {
    version: 1,
    nombre: m.nombre.trim().slice(0, 80),
    pregunta: m.pregunta.trim().slice(0, 400),
    publico: m.publico,
    fuentes: m.fuentes,
    reglas: m.reglas,
    medidas: m.medidas,
    ...(propias.length ? { medidasPropias: propias } : {}),
    ...(m.analisis ? { analisis: m.analisis } : {}),
    paginas: m.paginas,
  };
}

export function leerModelo(contenido: unknown): ModeloBI | null {
  const m = contenido as Partial<ModeloBI> | null;
  if (!m || typeof m !== "object" || m.version !== 1 || !Array.isArray(m.paginas) || !Array.isArray(m.fuentes)) return null;
  const propias = Array.isArray(m.medidasPropias) ? m.medidasPropias : [];
  registrarMedidas(propias);
  return {
    version: 1,
    nombre: String(m.nombre ?? ""),
    pregunta: String(m.pregunta ?? ""),
    publico: m.publico ?? "planeacion",
    fuentes: m.fuentes,
    reglas: m.reglas ?? [],
    medidas: m.medidas ?? [],
    ...(propias.length ? { medidasPropias: propias } : {}),
    ...(m.analisis ? { analisis: m.analisis } : {}),
    paginas: m.paginas,
  };
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

  const dims: string[] = v.tipo === "kpi" ? [] : v.dimensiones;
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
export function dimensionesDeMedida(id: string): string[] {
  const m = medidaPorId(id);
  return m ? dimensionesDeLaMedida(m) : [];
}
export const nombreDimension = nombreDeDimension;

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
  paginas: { nombre: string; plantilla: "ejecutivo" | "diagnostico" | "detalle"; visuales: { tipo: VisualBI["tipo"]; titulo: string; medidas: string[]; dimensiones: string[] }[] }[];
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

export const proponerTablero = (pedido: { pregunta: string; publico: string; fuentes: string[]; contexto?: string; medidas: { id: string; nombre: string; descripcion: string; dimensiones: string[] }[] }) =>
  invocarTableros<{ ok: boolean; propuesta: PropuestaPilo }>({ action: "proponer", pedido });

/* --- Relaciones entre fuentes: el perfil de cada una y el análisis de Pilo --------------------------- */

/** El perfil de columnas de la carga más reciente de cada fuente elegida en la sede, para armar medidas y analizar relaciones. */
export function useDatosFuentes(fuentes: string[], cobertura: Cobertura[], sede: string) {
  const cargas = fuentes.map((id) => ({ id, carga: cobertura.filter((c) => c.conjunto === id && c.sede === sede).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] }));
  const qs = useQueries({
    queries: cargas.map(({ id, carga }) => ({
      queryKey: ["warehouse", "perfil", carga?.id ?? id],
      enabled: Boolean(carga),
      retry: false,
      staleTime: Infinity,
      queryFn: () => perfilarCarga(carga!.id),
    })),
  });
  const perfiles: Record<string, ColumnaPerfil[]> = {};
  const sinCarga: string[] = [];
  cargas.forEach(({ id, carga }, i) => {
    const d = qs[i]?.data;
    if (!carga) sinCarga.push(id);
    else if (d) perfiles[id] = d.columnas;
  });
  return { perfiles: perfiles as Perfiles & Record<string, ColumnaPerfil[]>, sinCarga, cargando: qs.some((q) => q.isPending && q.fetchStatus !== "idle"), errores: qs.flatMap((q) => (q.error ? [mensajeDeError(q.error)] : [])) };
}
const mensajeDeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface PedidoRelaciones {
  pregunta: string;
  fuentes: { id: string; nombre: string; grano: string; columnas: { col: string; tipo: string; distintos: number; llenos: number; personal: boolean; dimension?: string }[] }[];
  hallazgos: { id: string; titulo: string; detalle: string; requiereAprobacion: boolean }[];
  reglas_permitidas: string[];
}

/** Lo que se le entrega a Pilo: nombres, tipos y conteos de columnas. Nunca filas ni valores. */
export function armarPedidoRelaciones(pregunta: string, fuentes: string[], perfiles: Record<string, ColumnaPerfil[]>): PedidoRelaciones {
  const hallazgos = detectarHallazgos(fuentes, perfiles);
  return {
    pregunta,
    fuentes: fuentes.flatMap((id) => {
      const f = fuentePorId(id);
      if (!f) return [];
      const cols = perfiles[id]?.map((c) => ({ col: c.col, tipo: c.tipo, distintos: c.distintos, llenos: c.llenos, personal: c.personal })) ?? Object.keys(f.columnas).map((col) => ({ col, tipo: f.columnas[col].rol, distintos: 0, llenos: 0, personal: Boolean(f.columnas[col].personal) }));
      return [{ id, nombre: f.nombre, grano: f.grano, columnas: cols.slice(0, 60).map((c) => ({ ...c, dimension: columnaDe(f, c.col)?.dimension })) }];
    }),
    hallazgos: hallazgos.map((h) => ({ id: h.id, titulo: h.titulo, detalle: h.detalle.slice(0, 300), requiereAprobacion: h.requiereAprobacion })),
    reglas_permitidas: hallazgos.filter((h) => h.requiereAprobacion).map((h) => h.id),
  };
}

export const analizarRelacionesPilo = (pedido: PedidoRelaciones) => invocarTableros<{ ok: boolean; analisis: AnalisisRelaciones & { avisos: string[] } }>({ action: "relaciones", pedido });

export const narrarTablero = (cifras: { nombre: string; pregunta: string; periodo: string; sede: string; visuales: { titulo: string; medida: string; formato: string; filas: { clave: string; valor: number | null }[] }[] }) =>
  invocarTableros<{ ok: boolean; narracion: NarracionPilo }>({ action: "narrar", cifras });

/** Las cifras de un visual que se le entregan a Pilo: ya agregadas, hasta 12 filas. */
export function cifrasDeVisual(v: VisualBI, d: DatosVisual): { titulo: string; medida: string; formato: string; filas: { clave: string; valor: number | null }[] } | null {
  if (v.tipo === "narrativa" || !d.filas.length) return null;
  const { visibles } = mejores(d.filas, 12);
  return { titulo: v.titulo, medida: d.encabezados[0] ?? "", formato: d.formatos[0] ?? "decimal", filas: visibles.map((f) => ({ clave: f.clave.join(" · ") || "Total", valor: f.valores[0] })) };
}
