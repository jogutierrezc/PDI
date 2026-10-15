/* =============================================================================
   Warehouse UDES · lectura y escritura en Supabase (0155).

   wh_periodos / wh_cargas / wh_filas   las tablas (solo lectura para el portal)
   wh_vigentes                          la última versión guardada de cada carga
   v_wh_cobertura                       qué hay guardado, para el tablero
   v_wh_rendimiento                     rendimiento de Master, ya tipado

   Toda escritura va por RPC (wh_abrir_carga → wh_agregar_filas →
   wh_cerrar_carga): la política de privacidad la aplica la base, así que
   cargar desde el navegador o desde el servidor deja lo mismo guardado.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unzipSync } from "fflate";
import { supabase, readFunctionError } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { FILAS_POR_LOTE, derivarColumnas, enLotes, enParalelo, huellaContenido, leerSegun, recortarPorPolitica, type Fila, type Hoja } from "./motor";
import { lectorDe } from "./reportes";
import type { ResumenGrupoNotas } from "./estudio";
import type { DatosParaPilo } from "./paraPilo";

export const whKeys = {
  all: ["warehouse"] as const,
  cobertura: ["warehouse", "cobertura"] as const,
  cargas: ["warehouse", "cargas"] as const,
  periodos: ["warehouse", "periodos"] as const,
  politicas: ["warehouse", "politicas"] as const,
  rendimiento: (periodo: string, sede: string) => ["warehouse", "rendimiento", periodo, sede] as const,
  todas: (carga: string) => ["warehouse", "todas", carga] as const,
};

/** PostgREST corta cada respuesta en 1000 filas: lo largo se pide por páginas. */
const PAGINA = 1000;

/** Las funciones de la base responden «codigo: mensaje»; a la persona solo le sirve el mensaje. */
export function mensajeDe(error: unknown): string {
  const m = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return m.replace(/^[a-z_]+: /, "");
}

export interface Cobertura {
  conjunto: string;
  periodo: string;
  sede: string;
  corte: string;
  version: number;
  filas: number;
  origen: "servidor" | "archivo";
  terminada_en: string | null;
  periodo_estado: "abierto" | "cerrado";
  versiones: number;
  /** La carga vigente: de aquí se leen las filas. */
  id: string;
}

export interface Carga {
  id: string;
  conjunto: string;
  periodo: string;
  sede: string;
  corte: string;
  version: number;
  estado: "en_curso" | "guardada" | "error" | "reemplazada";
  origen: "servidor" | "archivo";
  filas: number;
  huella: string;
  archivo_nombre: string;
  columnas: string[];
  motivo: string;
  error: string;
  creada_en: string;
  terminada_en: string | null;
}

export interface PeriodoEstado {
  periodo: string;
  estado: "abierto" | "cerrado";
  nota: string;
  cerrado_en: string | null;
}

export interface Politica {
  conjunto: string;
  modo: "permitir" | "excluir";
  lista: string[];
  seudonimizar: string[];
  nota: string;
}

/** Fila de v_wh_rendimiento. */
export interface GrupoRendimiento {
  periodo: string;
  sede: string;
  corte: string;
  codigo: string;
  letra: string;
  nombre: string;
  plan: string;
  departamento: string;
  docente: string;
  matriculados: number;
  reprobados: number;
  pct_reprobados: number;
  aprobados: number;
  pct_aprobados: number;
  no_presenta: number;
  pct_no_presenta: number;
  promedio: number;
}

export function usePermisosWarehouse() {
  const { canSee, hasRole } = useAuth();
  const ver = canSee("warehouse") && hasRole("planeacion");
  return { ver, administrar: ver && hasRole("admin") };
}

/** Cuántas páginas se piden a la vez: más no acelera (la base y la red tienen tope) y sí sobrecarga. */
const PARALELO = 4;

/**
 * Pide todas las páginas de una consulta. La primera trae el total (`count`, si la consulta lo pide);
 * con él, las demás se piden de a cuatro en paralelo en vez de una tras otra: 29.000 filas dejan de ser
 * 30 viajes en fila. Sin total, se pide en fila hasta que una página venga corta.
 */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>): Promise<T[]> {
  const primera = await pedir(0, PAGINA - 1);
  if (primera.error) throw new Error(mensajeDe(primera.error));
  const salida: T[] = [...(primera.data ?? [])];
  if (!primera.data || primera.data.length < PAGINA) return salida;

  if (typeof primera.count === "number") {
    const desdes: number[] = [];
    for (let d = PAGINA; d < primera.count; d += PAGINA) desdes.push(d);
    const paginas: T[][] = new Array(desdes.length);
    let siguiente = 0;
    await Promise.all(
      Array.from({ length: Math.min(PARALELO, desdes.length) }, async () => {
        while (siguiente < desdes.length) {
          const i = siguiente++;
          const r = await pedir(desdes[i], desdes[i] + PAGINA - 1);
          if (r.error) throw new Error(mensajeDe(r.error));
          paginas[i] = r.data ?? [];
        }
      }),
    );
    for (const p of paginas) salida.push(...p);
    return salida;
  }

  for (let desde = PAGINA; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(mensajeDe(error));
    salida.push(...(data ?? []));
    if (!data || data.length < PAGINA) return salida;
  }
}

export function useCobertura() {
  return useQuery({
    queryKey: whKeys.cobertura,
    queryFn: () => todas<Cobertura>((a, b) => supabase.from("v_wh_cobertura").select("*").range(a, b)),
  });
}

export function useCargas(limite = 200) {
  return useQuery({
    queryKey: [...whKeys.cargas, limite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wh_cargas")
        .select("id,conjunto,periodo,sede,corte,version,estado,origen,filas,huella,archivo_nombre,columnas,motivo,error,creada_en,terminada_en")
        .order("creada_en", { ascending: false })
        .limit(limite);
      if (error) throw new Error(mensajeDe(error));
      return (data ?? []) as Carga[];
    },
  });
}

export function usePeriodosWh() {
  return useQuery({
    queryKey: whKeys.periodos,
    queryFn: async () => {
      const { data, error } = await supabase.from("wh_periodos").select("periodo,estado,nota,cerrado_en");
      if (error) throw new Error(mensajeDe(error));
      return (data ?? []) as PeriodoEstado[];
    },
  });
}

export function usePoliticas() {
  return useQuery({
    queryKey: whKeys.politicas,
    queryFn: async () => {
      const { data, error } = await supabase.from("wh_politicas").select("conjunto,modo,lista,seudonimizar,nota");
      if (error) throw new Error(mensajeDe(error));
      return (data ?? []) as Politica[];
    },
  });
}

/** Rendimiento de un periodo y sede, con todos sus cortes. */
export function useRendimiento(periodo: string, sede: string) {
  return useQuery({
    queryKey: whKeys.rendimiento(periodo, sede),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) =>
        supabase.from("v_wh_rendimiento").select("*").eq("periodo", periodo).eq("sede", sede).order("codigo").order("letra").range(a, b),
      );
      return filas.map(
        (r): GrupoRendimiento => ({
          periodo: String(r.periodo),
          sede: String(r.sede),
          corte: String(r.corte),
          codigo: String(r.codigo ?? ""),
          letra: String(r.letra ?? ""),
          nombre: String(r.nombre ?? ""),
          plan: String(r.plan ?? ""),
          departamento: String(r.departamento ?? ""),
          docente: String(r.docente ?? ""),
          matriculados: Number(r.matriculados ?? 0),
          reprobados: Number(r.reprobados ?? 0),
          pct_reprobados: Number(r.pct_reprobados ?? 0),
          aprobados: Number(r.aprobados ?? 0),
          pct_aprobados: Number(r.pct_aprobados ?? 0),
          no_presenta: Number(r.no_presenta ?? 0),
          pct_no_presenta: Number(r.pct_no_presenta ?? 0),
          promedio: Number(r.promedio ?? 0),
        }),
      );
    },
  });
}

/** Todas las filas de una carga, por páginas. Explorar busca, ordena y grafica sobre ellas en el navegador. */
export function useFilasCompletas(carga: string | null) {
  return useQuery({
    queryKey: whKeys.todas(carga ?? ""),
    enabled: Boolean(carga),
    // Una versión guardada no cambia nunca (recargar crea otra con otro id): no hay por qué volver a pedirla.
    staleTime: Infinity,
    gcTime: 15 * 60_000,
    queryFn: async () => (await todas<{ datos: Fila }>((a, b) => supabase.from("wh_filas").select("datos", { count: "exact" }).eq("carga_id", carga as string).order("n").range(a, b))).map((f) => f.datos),
  });
}

/** Un renglón por estudiante: lo que las alertas por notas necesitan (wh_notas_resumen, 0157). */
export interface ResumenNotas {
  estudiante: string;
  programa: string;
  materias: number;
  con_p1: number;
  con_p2: number;
  con_p3: number;
  prom_p1: number | null;
  prom_p2: number | null;
  prom_p3: number | null;
  riesgo_p1: number;
  riesgo_p2: number;
  riesgo_p3: number;
}

export function useNotasResumen(periodo: string, sede: string, habilitado: boolean) {
  return useQuery({
    queryKey: ["warehouse", "notas", periodo, sede],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_notas_resumen", { p_periodo: periodo, p_sede: sede }, { count: "exact" }).range(a, b));
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return filas.map(
        (r): ResumenNotas => ({
          estudiante: String(r.estudiante ?? ""),
          programa: String(r.programa ?? ""),
          materias: Number(r.materias ?? 0),
          con_p1: Number(r.con_p1 ?? 0),
          con_p2: Number(r.con_p2 ?? 0),
          con_p3: Number(r.con_p3 ?? 0),
          prom_p1: n(r.prom_p1),
          prom_p2: n(r.prom_p2),
          prom_p3: n(r.prom_p3),
          riesgo_p1: Number(r.riesgo_p1 ?? 0),
          riesgo_p2: Number(r.riesgo_p2 ?? 0),
          riesgo_p3: Number(r.riesgo_p3 ?? 0),
        }),
      );
    },
  });
}

/* --- El análisis de Pilo (función warehouse-pilo) ----------------------------------------- */

export interface AnalisisPilo {
  titular: string;
  resumen: string;
  hallazgos: { titulo: string; evidencia: string; accion: string; responsable: string }[];
  prioridades: string[];
  limites: string[];
  avisos: string[];
}

async function invocarPilo<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("warehouse-pilo", { body });
  if (r.error) {
    const contexto = (r.error as { context?: Response }).context;
    if (!contexto) throw new Error("No se pudo llegar a la función «warehouse-pilo»: ¿está desplegada?");
    const detalle = await readFunctionError(r.error);
    if (detalle) throw new Error(detalle);
    throw new Error(`La función respondió ${contexto.status}.`);
  }
  return r.data as T;
}

export const analizarConPilo = (datos: DatosParaPilo, pregunta: string) =>
  invocarPilo<{ ok: boolean; analisis: AnalisisPilo; proveedor: string; modelo: string }>({ action: "analizar", datos, pregunta });

export function useEstadoPilo() {
  return useQuery({
    queryKey: ["warehouse", "pilo"],
    queryFn: () => invocarPilo<{ ok: boolean; ai: boolean; motivo?: string; proveedor: string; modelo: string }>({ action: "estado" }),
    retry: false,
    staleTime: 60_000,
  });
}

/** Un renglón por materia y grupo (wh_notas_grupos, 0159): los cursos con alta reprobación salen de aquí. */
export function useNotasGrupos(periodo: string, sede: string, habilitado: boolean) {
  return useQuery({
    queryKey: ["warehouse", "notas-grupos", periodo, sede],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = await todas<Record<string, unknown>>((a, b) => supabase.rpc("wh_notas_grupos", { p_periodo: periodo, p_sede: sede }, { count: "exact" }).range(a, b));
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return filas.map(
        (r): ResumenGrupoNotas => ({
          codigo_materia: String(r.codigo_materia ?? ""),
          materia: String(r.materia ?? ""),
          grupo: String(r.grupo ?? ""),
          programa: String(r.programa ?? ""),
          estudiantes: Number(r.estudiantes ?? 0),
          con_p1: Number(r.con_p1 ?? 0),
          con_p2: Number(r.con_p2 ?? 0),
          con_p3: Number(r.con_p3 ?? 0),
          prom_p1: n(r.prom_p1),
          prom_p2: n(r.prom_p2),
          prom_p3: n(r.prom_p3),
          bajo_p1: Number(r.bajo_p1 ?? 0),
          bajo_p2: Number(r.bajo_p2 ?? 0),
          bajo_p3: Number(r.bajo_p3 ?? 0),
        }),
      );
    },
  });
}

/* --- Cargar ------------------------------------------------------------------ */

export interface PedidoCarga {
  conjunto: string;
  periodo: string;
  sede: string;
  corte: string;
  motivo: string;
}

export interface ResultadoCarga {
  version: number;
  filas: number;
  duplicada: boolean;
  periodo?: string;
}

export type Avance = (texto: string, hecho: number, total: number) => void;

/** Lee un .xlsx del disco: lo descomprime y lo lee como lo pide su reporte (hoja, título antes de la tabla, una hoja por semana…). */
export async function leerArchivoExcel(archivo: File, conjunto: string): Promise<Hoja> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let partes: Record<string, Uint8Array>;
  try {
    partes = unzipSync(bytes);
  } catch {
    throw new Error("Ese archivo no es un Excel (.xlsx). Descargue el reporte de la plataforma y no lo vuelva a guardar con otro formato.");
  }
  return leerSegun(lectorDe(conjunto), partes);
}

/**
 * Guarda una hoja ya leída: abre la carga, manda las filas por lotes y la cierra.
 * Si algo falla a medias, la carga queda en «error» y lo anterior sigue vigente.
 */
export async function guardarHoja(
  pedido: PedidoCarga,
  hoja: Hoja,
  nombreArchivo: string,
  avance?: Avance,
  politica?: Pick<Politica, "modo" | "lista">,
): Promise<ResultadoCarga> {
  if (hoja.filas.length === 0) throw new Error("El archivo no trae filas.");
  avance?.("Calculando la huella del contenido", 0, hoja.filas.length);
  // La huella es del contenido completo, antes de recortar: así «el mismo archivo» se reconoce aunque la política cambie.
  const huella = await huellaContenido(hoja);

  const abierta = await supabase.rpc("wh_abrir_carga", {
    p_conjunto: pedido.conjunto,
    p_periodo: pedido.periodo,
    p_sede: pedido.sede,
    p_corte: pedido.corte,
    p_huella: huella,
    p_origen: "archivo",
    p_archivo: nombreArchivo,
    p_motivo: pedido.motivo,
  });
  if (abierta.error) throw new Error(mensajeDe(abierta.error));
  const carga = (abierta.data as { id: string; version: number; duplicada: boolean }[])[0];
  if (carga.duplicada) return { version: carga.version, filas: hoja.filas.length, duplicada: true };

  // Lo que la política descarta no sale del navegador (la base lo vuelve a aplicar). Los lotes llevan su
  // posición `n`, así que pueden llegar en cualquier orden y de a varios.
  // El grupo etario y el origen se calculan aquí, antes de descartar la fecha de nacimiento y el departamento.
  const derivada = derivarColumnas(pedido.conjunto, hoja, pedido.periodo);
  const filas = politica ? recortarPorPolitica(derivada.filas, politica) : derivada.filas;
  const lotes = enLotes(filas, FILAS_POR_LOTE);
  let enviadas = 0;
  try {
    await enParalelo(lotes, async (lote, i) => {
      const r = await supabase.rpc("wh_agregar_filas", { p_carga: carga.id, p_inicio: i * FILAS_POR_LOTE + 1, p_filas: lote });
      if (r.error) throw new Error(mensajeDe(r.error));
      enviadas += lote.length;
      avance?.("Guardando filas", enviadas, filas.length);
    });
  } catch (e) {
    await supabase.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: false, p_error: mensajeDe(e), p_columnas: null });
    throw e;
  }
  avance?.("Cerrando la carga", filas.length, filas.length);
  const cerrada = await supabase.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: true, p_error: "", p_columnas: hoja.columnas });
  if (cerrada.error) throw new Error(mensajeDe(cerrada.error));
  return { version: carga.version, filas: Number(cerrada.data), duplicada: false };
}

export interface EstadoServidor {
  ok: boolean;
  configurado: boolean;
  sedes: { id: string; nombre: string; configurada: boolean }[];
  reportes?: { id: string; sistema: string; verificado: boolean }[];
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("warehouse", { body });
  if (r.error) {
    const contexto = (r.error as { context?: Response }).context;
    if (!contexto) throw new Error("No se pudo llegar a la función «warehouse»: ¿está desplegada?");
    // Lo que la función dijo; si no es de la forma {error}, lo que haya en el cuerpo y el código HTTP, para saber qué falló.
    const detalle = await readFunctionError(r.error);
    if (detalle) throw new Error(detalle);
    let texto = "";
    try {
      texto = (await contexto.clone().text()).trim().slice(0, 300);
    } catch {
      /* sin cuerpo */
    }
    try {
      const j = JSON.parse(texto) as { message?: string; msg?: string; error_description?: string };
      texto = j.message ?? j.msg ?? j.error_description ?? texto;
    } catch {
      /* no era JSON */
    }
    const pista =
      contexto.status === 401 || contexto.status === 403
        ? " (la sesión o el permiso no pasó; si dice «Invalid JWT», cierre sesión y vuelva a entrar)"
        : contexto.status >= 500
          ? " (la función falló al arrancar o se cayó: revise los registros de la función «warehouse» y que estén subidos index.ts, motor.ts y reportes.ts)"
          : "";
    throw new Error(`La función respondió ${contexto.status}${texto ? `: ${texto}` : ""}${pista}.`);
  }
  const data = r.data as T & { ok?: boolean; error?: string };
  if (data && data.ok === false) throw new Error(data.error ?? "La función no pudo completar el pedido.");
  return data;
}

export const estadoServidor = () => invocar<EstadoServidor>({ action: "estado" });
export const probarServidor = (sede: string) => invocar<{ ok: boolean; periodo: string; periodos: Record<string, string> }>({ action: "probar", sede });
export interface PedidoServidor {
  conjunto: string;
  sede: string;
  /** Solo cuenta si la plataforma deja pedir el periodo (va en la ruta o en selected_period). */
  periodo: string;
  corte: string;
  motivo: string;
}
export const cargarDesdeServidor = (p: PedidoServidor) => invocar<ResultadoCarga & { ok: boolean }>({ action: "cargar", ...p });
/** Pide el reporte y devuelve solo los nombres de sus columnas: no guarda nada ni muestra filas. */
export const sondearServidor = (p: Omit<PedidoServidor, "motivo">) =>
  invocar<{ ok: boolean; periodo: string; columnas: string[]; originales: string[]; filas: number; verificado: boolean }>({ action: "sondear", ...p });

export function useEstadoServidor(habilitado: boolean) {
  return useQuery({ queryKey: ["warehouse", "servidor"], queryFn: estadoServidor, enabled: habilitado, retry: false, staleTime: 60_000 });
}

export function useAlRefrescar() {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: whKeys.all });
}

export function useCerrarPeriodo() {
  const refrescar = useAlRefrescar();
  return useMutation({
    mutationFn: async (p: { periodo: string; nota: string }) => {
      const r = await supabase.rpc("wh_cerrar_periodo", { p_periodo: p.periodo, p_nota: p.nota });
      if (r.error) throw new Error(mensajeDe(r.error));
    },
    onSuccess: refrescar,
  });
}

export function useReabrirPeriodo() {
  const refrescar = useAlRefrescar();
  return useMutation({
    mutationFn: async (p: { periodo: string; nota: string }) => {
      const r = await supabase.rpc("wh_reabrir_periodo", { p_periodo: p.periodo, p_nota: p.nota });
      if (r.error) throw new Error(mensajeDe(r.error));
    },
    onSuccess: refrescar,
  });
}
