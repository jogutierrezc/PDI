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
import { FILAS_POR_LOTE, derivarColumnas, enLotes, enParalelo, huellaContenido, leerSegun, periodoDelArchivo, recortarPorPolitica, ultimoPeriodoDe, type Fila, type Hoja } from "./motor";
import { lectorDe, reportePorId } from "./reportes";
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
export async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>): Promise<T[]> {
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
  /** false: el reporte no dice de qué periodo es y se guardó con el pedido (solo pasa cuando la plataforma recibe el periodo en la URL). */
  confirmado?: boolean;
  /** Resultado neutro (no se guardó nada y no es un error): sin datos en ese periodo y sede, o Galileo no responde. */
  neutro?: ResultadoNeutro;
  mensaje?: string;
}

/** «sin_datos»: la plataforma no tiene registros; «galileo_no_responde»: Galileo responde 5xx por dentro en esa sede. */
export type ResultadoNeutro = "sin_datos" | "galileo_no_responde";

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
  const hoja = leerSegun(lectorDe(conjunto), partes);
  // Si el reporte dice de qué periodo es (el título que arma la plataforma o la última columna de un histórico), se anota
  // para comprobarlo contra el periodo elegido antes de guardar.
  const confirma = reportePorId(conjunto)?.confirma;
  if (confirma === "columnas") hoja.periodoArchivo = ultimoPeriodoDe(hoja);
  else if (confirma) hoja.periodoArchivo = periodoDelArchivo(partes);
  return hoja;
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
  if (hoja.periodoArchivo && pedido.periodo !== "permanente" && hoja.periodoArchivo !== pedido.periodo) {
    throw new Error(`Periodo distinto del elegido: el archivo es de ${hoja.periodoArchivo} y se iba a guardar como ${pedido.periodo}. Cambie el periodo de arriba o descargue el reporte del periodo correcto.`);
  }
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

/**
 * El texto para cuando la función «warehouse» responde 5xx sin un {error} propio: la plataforma de funciones la
 * cortó (más de 150 MB de memoria o más de 60 s en una llamada) o no pudo arrancarla. Dice la causa probable y qué hacer.
 */
export function mensajeFuncionCaida(estado: number, detalle = ""): string {
  const extra = detalle ? ` Respuesta: «${detalle.slice(0, 160)}».` : "";
  return (
    `La función «warehouse» se cayó o se quedó sin tiempo o memoria (HTTP ${estado}).${extra} ` +
    "Causa probable: el reporte es muy grande para los límites del servidor (150 MB de memoria y 60 s por llamada), o la plataforma de la sede tardó demasiado. " +
    "Qué hacer: reintente en un momento (solo esa celda, con «Reintentar las que fallaron»); si falla otra vez con el mismo reporte y sede, " +
    "descargue el Excel en la plataforma y cárguelo a mano en «Cargar un reporte». Si fallan todos, revise que estén subidos index.ts, flujo.ts, motor.ts y reportes.ts."
  );
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("warehouse", { body });
  if (r.error) {
    const contexto = (r.error as { context?: Response }).context;
    if (!contexto) {
      throw new Error(
        "No se pudo llegar a la función «warehouse»: ¿está desplegada? También pasa cuando la función se cae por memoria o tiempo (el navegador no alcanza a ver la respuesta): reintente solo ese reporte o cárguelo a mano con el Excel.",
      );
    }
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
    if (contexto.status >= 500) throw new Error(mensajeFuncionCaida(contexto.status, texto));
    const pista = contexto.status === 401 || contexto.status === 403 ? " (la sesión o el permiso no pasó; si dice «Invalid JWT», cierre sesión y vuelva a entrar)" : "";
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
/* --- Tareas largas, partidas en llamadas cortas --------------------------------------------------------
   La función tiene 60 s por llamada. Los reportes de «tarea» (nómina, estudiantes activos, reporte financiero) los
   genera la plataforma aparte y pueden tardar minutos: la función solo los INICIA y el navegador pregunta cada
   unos segundos (`estado_tarea`, una consulta breve). Al terminar, `finalizar` descarga, procesa y guarda. */

/** La tarea que la función inició en la plataforma; el `pase` es su sesión, cifrada: solo se devuelve tal cual. */
export interface TareaServidor {
  id: string;
  pase: string;
  sistema: string;
  sede: string;
  conjunto: string;
  periodo: string;
  corte: string;
}

/** Cada cuánto se pregunta por la tarea. */
export const PAUSA_TAREA_MS = 4_500;
/** Hasta cuándo se espera una tarea antes de rendirse con un mensaje claro. */
export const ESPERA_TAREA_MS = 8 * 60_000;

export interface OpcionesPedido {
  /** Texto de avance (por ejemplo, «La plataforma está generando el reporte… 40 s»). */
  alAvance?: (texto: string) => void;
  /** Para cancelar: la espera se detiene y la sesión de la tarea se cierra. */
  signal?: AbortSignal;
}

/** Fin de una tarea que no se reintenta (la plataforma dijo que falló, se agotó la espera o se canceló). */
class FinDeTarea extends Error {
  constructor(
    mensaje: string,
    readonly cancelada = false,
  ) {
    super(mensaje);
  }
}

/** ¿La persona canceló? Distingue una cancelación de un fallo. */
export const esCancelacion = (e: unknown) => e instanceof FinDeTarea && e.cancelada;

const dormir = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolver) => {
    const t = setTimeout(resolver, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolver();
      },
      { once: true },
    );
  });

/** Pregunta por la tarea hasta que termina. Devuelve la tarea con el pase vigente (puede cambiar si la sesión se renovó). */
async function esperarTarea(tarea: TareaServidor, op: OpcionesPedido): Promise<TareaServidor> {
  const inicio = Date.now();
  let actual = tarea;
  let fallos = 0;
  const soltar = () => invocar({ action: "cancelar", tarea: { id: actual.id, pase: actual.pase } }).catch(() => undefined);
  for (;;) {
    if (op.signal?.aborted) {
      await soltar();
      throw new FinDeTarea("Cancelado.", true);
    }
    if (Date.now() - inicio > ESPERA_TAREA_MS) {
      await soltar();
      throw new FinDeTarea(
        `La plataforma lleva más de ${Math.round(ESPERA_TAREA_MS / 60_000)} minutos generando «${actual.conjunto}» y se dejó de esperar. Intente de nuevo más tarde (suele pasar con el servidor ocupado) o descargue el Excel en la plataforma y cárguelo a mano.`,
      );
    }
    await dormir(PAUSA_TAREA_MS, op.signal);
    if (op.signal?.aborted) continue;
    try {
      const e = await invocar<{ estado: "ejecutando" | "listo" | "fallo"; progreso?: number; pase?: string }>({ action: "estado_tarea", tarea: { id: actual.id, pase: actual.pase } });
      fallos = 0;
      if (e.pase) actual = { ...actual, pase: e.pase };
      if (e.estado === "fallo") throw new FinDeTarea(`La plataforma no pudo generar «${actual.conjunto}» en esta sede (la tarea terminó con error). Reintente en unos minutos.`);
      if (e.estado === "listo") return actual;
      const segundos = Math.round((Date.now() - inicio) / 1000);
      op.alAvance?.(`La plataforma está generando el reporte… ${segundos} s${typeof e.progreso === "number" ? ` (${Math.round(e.progreso)} %)` : ""}`);
    } catch (err) {
      if (err instanceof FinDeTarea) throw err;
      // Un fallo suelto de red o de la función no pierde la tarea: se reintenta; tres seguidos sí cortan.
      if (++fallos >= 3) throw err;
    }
  }
}

/**
 * Descarga y guarda la tarea terminada. Si la plataforma todavía no entrega el Excel, la función responde `pendiente`:
 * eso no es un error, así que se espera PAUSA_TAREA_MS y se vuelve a finalizar, con el mismo tope de espera.
 */
async function finalizarTarea<T>(tarea: TareaServidor, cuerpo: { modo: "cargar" | "sondear"; motivo?: string }, op: OpcionesPedido): Promise<T> {
  const inicio = Date.now();
  let actual = tarea;
  for (;;) {
    if (op.signal?.aborted) {
      await invocar({ action: "cancelar", tarea: { id: actual.id, pase: actual.pase } }).catch(() => undefined);
      throw new FinDeTarea("Cancelado.", true);
    }
    const r = await invocar<T & { pendiente?: boolean; pase?: string }>({ action: "finalizar", ...cuerpo, tarea: { id: actual.id, pase: actual.pase } });
    if (!r.pendiente) return r as T;
    if (r.pase) actual = { ...actual, pase: r.pase };
    if (Date.now() - inicio > ESPERA_TAREA_MS) {
      await invocar({ action: "cancelar", tarea: { id: actual.id, pase: actual.pase } }).catch(() => undefined);
      throw new FinDeTarea(
        `La plataforma marcó «${actual.conjunto}» como lista, pero no entregó el Excel tras ${Math.round(ESPERA_TAREA_MS / 60_000)} minutos. Reintente; si se repite, descargue el Excel en la plataforma y cárguelo a mano.`,
      );
    }
    op.alAvance?.("La plataforma está terminando de preparar el reporte…");
    await dormir(PAUSA_TAREA_MS, op.signal);
  }
}

/**
 * Pide un reporte a la plataforma. Los de entrega directa vuelven en una sola llamada; los de tarea se inician,
 * se siguen desde aquí y se finalizan (descargar, procesar y guardar).
 */
export async function cargarDesdeServidor(p: PedidoServidor, op: OpcionesPedido = {}): Promise<ResultadoCarga & { ok: boolean }> {
  op.alAvance?.("Pidiendo el reporte a la plataforma");
  const r = await invocar<ResultadoCarga & { ok: boolean; tarea?: TareaServidor }>({ action: "cargar", fase: "iniciar", ...p });
  if (!r.tarea) return r;
  const lista = await esperarTarea(r.tarea, op);
  op.alAvance?.("Descargando y guardando el reporte");
  return finalizarTarea<ResultadoCarga & { ok: boolean }>(lista, { modo: "cargar", motivo: p.motivo }, op);
}
/** Pide el reporte y devuelve solo los nombres de sus columnas: no guarda nada ni muestra filas. */
export interface Sonda {
  ok: boolean;
  periodo: string;
  abierto?: string;
  /** El periodo que dice el archivo, si lo dice. */
  periodoArchivo?: string | null;
  confirmado?: boolean;
  columnas: string[];
  originales: string[];
  filas: number;
  verificado: boolean;
  sinPolitica?: boolean;
  /** Columnas que la política conserva y el archivo de esta sede no trajo. */
  faltan?: string[];
  descartadas?: string[];
  otroReporte?: boolean;
  avisos?: string[];
  neutro?: ResultadoNeutro;
  mensaje?: string;
}
export async function sondearServidor(p: Omit<PedidoServidor, "motivo">, op: OpcionesPedido = {}): Promise<Sonda> {
  op.alAvance?.("Pidiendo el reporte a la plataforma");
  const r = await invocar<Sonda & { tarea?: TareaServidor }>({ action: "sondear", fase: "iniciar", ...p });
  if (!r.tarea) return r;
  const lista = await esperarTarea(r.tarea, op);
  op.alAvance?.("Leyendo las columnas del reporte");
  return finalizarTarea<Sonda>(lista, { modo: "sondear" }, op);
}

export interface PeriodosPlataforma {
  ok: boolean;
  periodos: string[];
  actual: string;
  abierto: string;
  aspirantes: string[];
  deserciones: string[];
}
export const periodosServidor = (sede: string) => invocar<PeriodosPlataforma>({ action: "periodos", sede });

/** Los periodos que la plataforma de esa sede dice tener (get_periods); una consulta por sede, nunca compartida entre sedes. */
export function usePeriodosPlataforma(sede: string, habilitado: boolean) {
  return useQuery({ queryKey: ["warehouse", "periodos-plataforma", sede], queryFn: () => periodosServidor(sede), enabled: habilitado, retry: false, staleTime: 30 * 60_000 });
}

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
