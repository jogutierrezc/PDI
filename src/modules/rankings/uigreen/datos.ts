/* =============================================================================
   UI GreenMetric · datos (TanStack Query + Supabase, migraciones 0208 a 0213).

   Lecturas y escrituras de la sección. La base decide (RLS, disparadores y
   funciones definer); estos hooks no repiten permisos, salvo para no ofrecer lo
   imposible (lib/estados.ts). Si faltan las migraciones, la consulta falla con
   FaltaMigracion y la pantalla lo dice, como en el resto de Rankings.
   El contrato completo, en README.md.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../noticias";
import type {
  ActividadUgm, AsignacionUgm, CalculadoUgm, CapturaUgm, CategoriaCiclo, CicloUgm, ColaEstado, ComentarioUgm, ConfigCiclo, EvaluacionUgm,
  EvidenciaUgm, ExportacionUgm, FilaTabla, GlosarioUgm, GraficaDisponible, IdiomaPublico, ImportacionUgm, NotificacionUgm, PersonaBuscada,
  PreguntaCiclo, PublicacionEstado, PublicoCategoria, PublicoCicloListado, PublicoHoja, PublicoResumen, RespuestaUgm, ReservaEvidencia,
  ResumenCiclo, TablaDisponible, TraduccionUgm, VersionUgm, VinculoDato,
} from "./lib/tipos";

export { FaltaMigracion };
export const RANKING_UGM = "ui-greenmetric";
const PAGINA = 1000; // tope de filas por lectura de respuestas (118 por ciclo)

interface ErrorBase { code?: string; message?: string }
const noExiste = (e: ErrorBase) =>
  ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache|Could not find the function/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  return noExiste(e) ? new FaltaMigracion("Falta aplicar las migraciones de UI GreenMetric (0208 a 0213).") : new Error(e.message ?? "Error de la base de datos");
}
export const esFaltaMigracion = (e: unknown): e is FaltaMigracion => e instanceof FaltaMigracion;

async function rpc<T>(nombre: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

async function tabla<T>(nombre: string, f: (q: ReturnType<typeof supabase.from>) => PromiseLike<{ data: unknown; error: ErrorBase | null }>): Promise<T[]> {
  const r = await f(supabase.from(nombre));
  if (r.error) throw errorDe(r.error);
  return (r.data ?? []) as T[];
}

export const claves = {
  ciclos: ["ugm", "ciclos"] as const,
  ciclo: (c: string) => ["ugm", c] as const,
};
const invalidar = (qc: QueryClient, ciclo?: string) => qc.invalidateQueries({ queryKey: ciclo ? claves.ciclo(ciclo) : ["ugm"] });

/** Una mutación que llama una función y refresca el ciclo (o todo UGM). */
function useAccion<A, R = unknown>(fn: (a: A) => Promise<R>, ciclo?: string | ((a: A) => string | undefined)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, a) => invalidar(qc, typeof ciclo === "function" ? ciclo(a) : ciclo),
  });
}

/* --- Ciclos, configuración y catálogo ---------------------------------------------------------------- */

export const useCiclosUgm = () =>
  useQuery({ queryKey: claves.ciclos, queryFn: () => tabla<CicloUgm>("ranking_cycles", (t) => t.select("*").eq("ranking", RANKING_UGM).order("anio", { ascending: false })) });

export const useConfigUgm = (ciclo?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "config"],
    enabled: !!ciclo,
    queryFn: async () => (await tabla<ConfigCiclo>("ugm_config", (t) => t.select("*").eq("ciclo_id", ciclo!)))[0] ?? null,
  });

export const useCategoriasUgm = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "categorias"], enabled: !!ciclo, queryFn: () => tabla<CategoriaCiclo>("ugm_categorias", (t) => t.select("*").eq("ciclo_id", ciclo!).order("numero")) });

/** El catálogo del ciclo (117 preguntas + 3.18) con su carpeta en UDrive. */
export const usePreguntasUgm = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "preguntas"], enabled: !!ciclo, queryFn: () => tabla<PreguntaCiclo>("ugm_preguntas", (t) => t.select("*").eq("ciclo_id", ciclo!).order("orden")) });

export const useCrearCiclo = () =>
  useAccion((a: { anio: number; anioDatos: number; guia?: string; fechaLimite?: string | null; copiarDe?: string | null }) =>
    rpc<string>("ugm_crear_ciclo", { p_anio: a.anio, p_anio_datos: a.anioDatos, p_guia: a.guia ?? "2026", p_fecha_limite: a.fechaLimite ?? null, p_copiar_de: a.copiarDe ?? null }));

export const useCambiarEstadoCiclo = () => useAccion((a: { ciclo: string; estado: "preparacion" | "abierto" | "cerrado" }) => rpc("ugm_cambiar_estado_ciclo", { p_ciclo: a.ciclo, p_estado: a.estado }), (a) => a.ciclo);

/** Cambia fechas, encabezado, recordatorios (columnas con grant de 0208/0213). */
export const useGuardarConfig = () =>
  useAccion(async (a: { ciclo: string; cambios: Partial<Omit<ConfigCiclo, "ciclo_id" | "guia" | "unidad_id" | "carpeta_raiz" | "ciclo_anterior" | "updated_at">> }) => {
    const r = await supabase.from("ugm_config").update(a.cambios).eq("ciclo_id", a.ciclo);
    if (r.error) throw errorDe(r.error);
  }, (a) => a.ciclo);

export const useCrearCarpetas = () => useAccion((ciclo: string) => rpc<{ unidad_id: string; categorias: number; preguntas: number }>("ugm_crear_carpetas", { p_ciclo: ciclo }), (c) => c);

export const useGlosario = () => useQuery({ queryKey: ["ugm", "glosario"], queryFn: () => tabla<GlosarioUgm>("ugm_glosario", (t) => t.select("*").order("termino_es")) });

/* --- Asignaciones --------------------------------------------------------------------------------------- */

export const useAsignaciones = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "asignaciones"], enabled: !!ciclo, queryFn: () => tabla<AsignacionUgm>("ugm_asignaciones", (t) => t.select("*").eq("ciclo_id", ciclo!).eq("vigente", true)) });

export const usePersonasBuscar = (texto: string, unidad?: string) =>
  useQuery({ queryKey: ["ugm", "personas", texto, unidad ?? ""], enabled: texto.trim().length >= 2, queryFn: () => rpc<PersonaBuscada[]>("ugm_personas_buscar", { p_texto: texto, p_unidad: unidad ?? null }) });

type Asignar = { ciclo: string; q: string; usuario: string; unidad?: string | null; rol?: "responsable" | "apoyo"; fechaLimite?: string | null };
export const useAsignar = () => useAccion((a: Asignar) => rpc<string>("ugm_asignar", { p_ciclo: a.ciclo, p_q: a.q, p_usuario: a.usuario, p_unidad: a.unidad ?? null, p_rol: a.rol ?? "responsable", p_fecha_limite: a.fechaLimite ?? null }), (a) => a.ciclo);
export const useAsignarCategoria = () => useAccion((a: { ciclo: string; categoria: string; usuario: string; unidad?: string | null; fechaLimite?: string | null }) => rpc<number>("ugm_asignar_categoria", { p_ciclo: a.ciclo, p_categoria: a.categoria, p_usuario: a.usuario, p_unidad: a.unidad ?? null, p_fecha_limite: a.fechaLimite ?? null }), (a) => a.ciclo);
export const useAsignarMasivo = () => useAccion((a: { ciclo: string; items: { q: string; usuario_id: string; unidad_id?: string | null; rol?: string; fecha_limite?: string | null }[] }) => rpc<number>("ugm_asignar_masivo", { p_ciclo: a.ciclo, p_items: a.items }), (a) => a.ciclo);
export const useAsignarRevisor = () => useAccion((a: { ciclo: string; categoria: string; usuario: string }) => rpc<string>("ugm_asignar_revisor", { p_ciclo: a.ciclo, p_categoria: a.categoria, p_usuario: a.usuario }), (a) => a.ciclo);
export const useReasignar = () => useAccion((a: { ciclo: string; q: string; usuario: string }) => rpc<string>("ugm_reasignar", { p_ciclo: a.ciclo, p_q: a.q, p_usuario: a.usuario }), (a) => a.ciclo);
export const useRetirarAsignacion = () => useAccion((a: { ciclo: string; asignacion: string }) => rpc("ugm_retirar_asignacion", { p_asignacion: a.asignacion }), (a) => a.ciclo);
export const useFijarVencimiento = () => useAccion((a: { ciclo: string; fecha: string; q?: string; categoria?: string }) => rpc<number>("ugm_fijar_vencimiento", { p_ciclo: a.ciclo, p_fecha: a.fecha, p_q: a.q ?? null, p_categoria: a.categoria ?? null }), (a) => a.ciclo);

/* --- Respuestas y flujo ------------------------------------------------------------------------------------ */

export const useRespuestas = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "respuestas"], enabled: !!ciclo, queryFn: () => tabla<RespuestaUgm>("ugm_respuestas", (t) => t.select("*").eq("ciclo_id", ciclo!).range(0, PAGINA - 1)) });

/** Guarda la captura (solo las columnas con grant). El disparador mueve «asignado/devuelto» a «en captura». */
export const useGuardarCaptura = () =>
  useAccion(async (a: { ciclo: string; id: string; captura: CapturaUgm }) => {
    const r = await supabase.from("ugm_respuestas").update(a.captura).eq("id", a.id);
    if (r.error) throw errorDe(r.error);
  }, (a) => a.ciclo);

type ConResp = { ciclo: string; respuesta: string };
export const useEnviar = () => useAccion((a: ConResp) => rpc("ugm_enviar", { p_respuesta: a.respuesta }), (a) => a.ciclo);
export const useTomarRevision = () => useAccion((a: ConResp) => rpc("ugm_tomar_revision", { p_respuesta: a.respuesta }), (a) => a.ciclo);
export const useDevolver = () => useAccion((a: ConResp & { comentario: string }) => rpc("ugm_devolver", { p_respuesta: a.respuesta, p_comentario: a.comentario }), (a) => a.ciclo);
export const useAprobar = () => useAccion((a: ConResp & { sinDatosPersonales: boolean; comentario?: string }) => rpc("ugm_aprobar", { p_respuesta: a.respuesta, p_sin_datos_personales: a.sinDatosPersonales, p_comentario: a.comentario ?? null }), (a) => a.ciclo);
export const useReabrir = () => useAccion((a: ConResp & { comentario: string }) => rpc("ugm_reabrir", { p_respuesta: a.respuesta, p_comentario: a.comentario }), (a) => a.ciclo);
export const useComentar = () => useAccion((a: ConResp & { texto: string; campo?: string }) => rpc<string>("ugm_comentar", { p_respuesta: a.respuesta, p_texto: a.texto, p_campo: a.campo ?? null }), (a) => a.ciclo);
export const useResolverComentario = () => useAccion((a: { ciclo: string; comentario: string; resuelto?: boolean }) => rpc("ugm_resolver_comentario", { p_comentario: a.comentario, p_resuelto: a.resuelto ?? true }), (a) => a.ciclo);

export const useVersiones = (respuesta?: string) =>
  useQuery({ queryKey: ["ugm", "versiones", respuesta], enabled: !!respuesta, queryFn: () => tabla<VersionUgm>("ugm_versiones", (t) => t.select("*").eq("respuesta_id", respuesta!).order("created_at", { ascending: false })) });
export const useComentarios = (respuesta?: string) =>
  useQuery({ queryKey: ["ugm", "comentarios", respuesta], enabled: !!respuesta, queryFn: () => tabla<ComentarioUgm>("ugm_comentarios", (t) => t.select("*").eq("respuesta_id", respuesta!).order("created_at")) });
/** Qué falta para enviar (campos, evidencia, traducción). */
export const useEvaluacion = (respuesta?: string) => useQuery({ queryKey: ["ugm", "evaluacion", respuesta], enabled: !!respuesta, queryFn: () => rpc<EvaluacionUgm>("ugm_evaluar", { p_respuesta: respuesta }) });
/** Los siete indicadores calculados con la fórmula de la guía. */
export const useCalculados = (ciclo?: string) => useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "calculados"], enabled: !!ciclo, queryFn: () => rpc<CalculadoUgm[]>("ugm_calculados", { p_ciclo: ciclo }) });
export const useResumenCiclo = (ciclo?: string) => useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "resumen"], enabled: !!ciclo, queryFn: () => rpc<ResumenCiclo[]>("ugm_resumen_ciclo", { p_ciclo: ciclo }) });
export const useBitacora = (ciclo?: string, respuesta?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "bitacora", respuesta ?? ""],
    enabled: !!ciclo,
    queryFn: () => tabla<ActividadUgm>("ugm_actividad", (t) => { const q = t.select("*").eq("ciclo_id", ciclo!); return (respuesta ? q.eq("respuesta_id", respuesta) : q).order("created_at", { ascending: false }).limit(200); }),
  });

/* --- Evidencias y datos de Datos de Sostenibilidad ------------------------------------------------------------ */

export const useEvidencias = (respuesta?: string) =>
  useQuery({ queryKey: ["ugm", "evidencias", respuesta], enabled: !!respuesta, queryFn: () => tabla<EvidenciaUgm>("ugm_evidencias", (t) => t.select("*").eq("respuesta_id", respuesta!).order("orden")) });

/** Reservar la ruta → subir a Storage → registrar. Devuelve {evidencia_id, archivo_id, avisos}. */
export const useSubirEvidencia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { respuesta: string; archivo: File; nombre: string; idioma?: "en" | "es"; figura?: number | null; pieEs?: string; pieEn?: string; esMapa?: boolean }) => {
      const res = await rpc<ReservaEvidencia>("ugm_reservar_evidencia", { p_respuesta: a.respuesta, p_nombre: a.nombre, p_mime: a.archivo.type || null, p_tamano: a.archivo.size });
      const up = await supabase.storage.from(res.bucket).upload(res.ruta, a.archivo, { upsert: false, contentType: a.archivo.type || undefined });
      if (up.error) throw new Error(`No se pudo subir el archivo: ${up.error.message}`);
      const reg = await rpc<{ evidencia_id: string; archivo_id: string; avisos: string[] }>("ugm_registrar_evidencia", {
        p_reserva: res.reserva_id, p_figura: a.figura ?? null, p_pie_es: a.pieEs ?? null, p_pie_en: a.pieEn ?? null, p_idioma: a.idioma ?? "en", p_es_mapa: a.esMapa ?? false,
      });
      return { ...reg, avisoSubida: res.aviso };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ugm"] }),
  });
};

export const useAgregarEnlace = () => useAccion((a: { respuesta: string; url: string; pieEs?: string; pieEn?: string }) => rpc<string>("ugm_agregar_enlace", { p_respuesta: a.respuesta, p_url: a.url, p_pie_es: a.pieEs ?? null, p_pie_en: a.pieEn ?? null }));
export const useVincularArchivo = () => useAccion((a: { respuesta: string; archivo: string; figura?: number | null; pieEs?: string; pieEn?: string; idioma?: "en" | "es" }) => rpc<string>("ugm_vincular_archivo", { p_respuesta: a.respuesta, p_archivo: a.archivo, p_figura: a.figura ?? null, p_pie_es: a.pieEs ?? null, p_pie_en: a.pieEn ?? null, p_idioma: a.idioma ?? "en" }));
export const useEditarEvidencia = () => useAccion((a: { evidencia: string; figura: number | null; pieEs: string; pieEn: string; orden: number; esMapa: boolean; idioma: "en" | "es" }) => rpc("ugm_editar_evidencia", { p_evidencia: a.evidencia, p_figura: a.figura, p_pie_es: a.pieEs, p_pie_en: a.pieEn, p_orden: a.orden, p_es_mapa: a.esMapa, p_idioma: a.idioma }));
export const useQuitarEvidencia = () => useAccion((evidencia: string) => rpc("ugm_quitar_evidencia", { p_evidencia: evidencia }));
export const usePublicarEvidencia = () => useAccion((a: { evidencia: string; publica: boolean }) => rpc("ugm_publicar_evidencia", { p_evidencia: a.evidencia, p_publica: a.publica }));

export const useTablasDisponibles = (activo = true) => useQuery({ queryKey: ["ugm", "tablas"], enabled: activo, queryFn: () => rpc<TablaDisponible[]>("ugm_tablas_disponibles") });
export const useGraficasDisponibles = (activo = true) => useQuery({ queryKey: ["ugm", "graficas"], enabled: activo, queryFn: () => rpc<GraficaDisponible[]>("ugm_graficas_disponibles") });
export const useVinculos = (respuesta?: string) => useQuery({ queryKey: ["ugm", "vinculos", respuesta], enabled: !!respuesta, queryFn: () => rpc<VinculoDato[]>("ugm_vinculos_de", { p_respuesta: respuesta }) });
export const useVincularDato = () =>
  useAccion((a: { respuesta: string; campo: string; archivo: string; columna: string; colPeriodo?: string | null; agregacion?: "suma" | "promedio" | "ultimo"; anioModo?: "ultimo" | "anterior" | "dos_atras" | "fijo"; anio?: number | null; modo?: "conectado" | "manual" }) =>
    rpc<{ valor: number; anio: number | null; filas: number } | null>("ugm_vincular_dato", { p_respuesta: a.respuesta, p_campo: a.campo, p_archivo: a.archivo, p_columna: a.columna, p_col_periodo: a.colPeriodo ?? null, p_agregacion: a.agregacion ?? "suma", p_anio_modo: a.anioModo ?? "ultimo", p_anio: a.anio ?? null, p_modo: a.modo ?? "conectado" }));
export const useQuitarVinculo = () => useAccion((a: { respuesta: string; campo: string }) => rpc("ugm_quitar_vinculo", { p_respuesta: a.respuesta, p_campo: a.campo }));
export const useVincularGrafica = () => useAccion((a: { respuesta: string; archivo: string }) => rpc<string>("ugm_vincular_grafica", { p_respuesta: a.respuesta, p_archivo: a.archivo }));
export const useQuitarGrafica = () => useAccion((a: { respuesta: string; archivo: string }) => rpc("ugm_quitar_grafica", { p_respuesta: a.respuesta, p_archivo: a.archivo }));

/* --- Traducción con Pilo ------------------------------------------------------------------------------------------ */

export const useTraducciones = (respuesta?: string) =>
  useQuery({ queryKey: ["ugm", "traducciones", respuesta], enabled: !!respuesta, queryFn: () => tabla<TraduccionUgm>("ugm_traducciones", (t) => t.select("*").eq("respuesta_id", respuesta!)) });
/** Campos cuya traducción NO está al día (vacío = todo revisado). */
export const usePendientesTraduccion = (respuesta?: string) => useQuery({ queryKey: ["ugm", "pendientes", respuesta], enabled: !!respuesta, queryFn: () => rpc<string[]>("ugm_traducciones_pendientes", { p_respuesta: respuesta }) });

export type TextoATraducir = { ref: string; es: string };
export interface TraduccionPilo { traducciones: { ref: string; en: string; warn: string | null }[]; fallos: { ref: string; error: string }[]; modelo?: string }

/** Pide a Pilo traducir hasta 12 textos (4000 caracteres cada uno) con el glosario del ranking. No guarda: usar useGuardarTraducciones. */
export async function traducirConPilo(ciclo: string, items: TextoATraducir[], glosario: { es: string; en: string }[]): Promise<TraduccionPilo> {
  const { data, error } = await supabase.functions.invoke("pilo-rankingsod", { body: { action: "traducir-campos", ciclo_id: ciclo, items, glosario } });
  if (error) {
    let mensaje = "Pilo no pudo traducir ahora. Intente de nuevo en un momento.";
    try { const j = (await (error as { context?: Response }).context?.json()) as { error?: string } | undefined; if (j?.error) mensaje = j.error; } catch { /* sin detalle */ }
    throw new Error(mensaje);
  }
  return data as TraduccionPilo;
}
export const useTraducirConPilo = () => useMutation({ mutationFn: (a: { ciclo: string; items: TextoATraducir[]; glosario: { es: string; en: string }[] }) => traducirConPilo(a.ciclo, a.items, a.glosario) });

/** Guarda el inglés como borrador: [{campo, en} | {campo: "tabla:<k>", filas}]. */
export const useGuardarTraducciones = () =>
  useAccion((a: { ciclo: string; respuesta: string; items: { campo: string; en?: string; filas?: FilaTabla[]; origen?: "pilo" | "humano" | "importacion"; modelo?: string }[] }) => rpc<number>("ugm_guardar_traducciones", { p_respuesta: a.respuesta, p_items: a.items }), (a) => a.ciclo);
export const useMarcarTraduccionRevisada = () => useAccion((a: { ciclo: string; respuesta: string; campos?: string[] }) => rpc<number>("ugm_marcar_traduccion_revisada", { p_respuesta: a.respuesta, p_campos: a.campos ?? null }), (a) => a.ciclo);

/* --- Publicación ------------------------------------------------------------------------------------------------------ */

export const usePublicacionEstado = (respuesta?: string) => useQuery({ queryKey: ["ugm", "publicacion", respuesta], enabled: !!respuesta, queryFn: () => rpc<PublicacionEstado>("ugm_publicacion_estado", { p_respuesta: respuesta }) });
export const usePublicar = () => useAccion((a: { ciclo: string; respuesta: string; publicar: boolean; motivo?: string }) => rpc<PublicacionEstado>("ugm_publicar", { p_respuesta: a.respuesta, p_publicar: a.publicar, p_motivo: a.motivo ?? null }), (a) => a.ciclo);
export const useMarcarSensible = () => useAccion((a: { ciclo: string; respuesta: string; valor: boolean }) => rpc("ugm_marcar_sensible", { p_respuesta: a.respuesta, p_valor: a.valor }), (a) => a.ciclo);

/* --- Avisos por correo ------------------------------------------------------------------------------------------------- */

export const useNotificaciones = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "notificaciones"], enabled: !!ciclo, queryFn: () => tabla<NotificacionUgm>("ugm_notificaciones", (t) => t.select("*").eq("ciclo_id", ciclo!).order("created_at", { ascending: false }).limit(200)) });
export const useColaEstado = (ciclo?: string) => useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "cola"], enabled: !!ciclo, queryFn: () => rpc<ColaEstado>("ugm_cola_estado", { p_ciclo: ciclo }) });
export const useReintentarAviso = () => useAccion((a: { ciclo: string; id: string }) => rpc("ugm_cola_reintentar", { p_id: a.id }), (a) => a.ciclo);
/** Prepara recordatorios y resumen semanal ahora (lo normal es programarlo; ver 0213). */
export const useTareasDiarias = () => useAccion((ciclo: string) => rpc<{ recordatorios: number; resumen: number }>("ugm_tareas_diarias"), (c) => c);
/** «Enviar avisos pendientes»: la función correos vacía un lote de la cola. */
export const useEnviarAvisos = () =>
  useAccion(async (ciclo: string) => {
    const { data, error } = await supabase.functions.invoke("correos", { body: { action: "ugm_cola", limite: 10 } });
    if (error) throw new Error("No se pudieron enviar los avisos ahora.");
    const r = data as { ok: boolean; enviados?: number; fallidos?: number; error?: string };
    if (!r.ok) throw new Error(r.error ?? "No se pudieron enviar los avisos.");
    return r;
  }, (c) => c);

/* --- Exportar e importar plantillas ------------------------------------------------------------------------------------- */

export const useExportaciones = (ciclo?: string) => useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "exportaciones"], enabled: !!ciclo, queryFn: () => tabla<ExportacionUgm>("ugm_exportaciones", (t) => t.select("*").eq("ciclo_id", ciclo!).order("created_at", { ascending: false }).limit(50)) });
export const useImportaciones = (ciclo?: string) => useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "importaciones"], enabled: !!ciclo, queryFn: () => tabla<ImportacionUgm>("ugm_importaciones", (t) => t.select("*").eq("ciclo_id", ciclo!).order("created_at", { ascending: false }).limit(50)) });
export const useRegistrarExportacion = () => useAccion((a: { ciclo: string; alcance: "indicador" | "categoria" | "todo"; q?: string; categoria?: string; hash?: string; manifiesto: Record<string, unknown> }) => rpc<string>("ugm_registrar_exportacion", { p_ciclo: a.ciclo, p_alcance: a.alcance, p_q: a.q ?? null, p_categoria: a.categoria ?? null, p_hash: a.hash ?? null, p_manifiesto: a.manifiesto }), (a) => a.ciclo);
export const useRegistrarImportacion = () => useAccion((a: { ciclo: string; archivo: string; hash?: string; q: string; resultado: Record<string, unknown> }) => rpc<string>("ugm_registrar_importacion", { p_ciclo: a.ciclo, p_archivo: a.archivo, p_hash: a.hash ?? null, p_q: a.q, p_resultado: a.resultado }), (a) => a.ciclo);
export const useCerrarImportacion = () => useAccion((a: { ciclo: string; importacion: string; aplicada: boolean }) => rpc("ugm_cerrar_importacion", { p_importacion: a.importacion, p_aplicada: a.aplicada }), (a) => a.ciclo);

/* --- Lecturas públicas (0212): sin sesión, sin puntos ni pesos ------------------------------------------------------------ */

const REFRESCO_PUBLICO = 60_000;
export const usePublicoCiclos = () => useQuery({ queryKey: ["ugm-publico", "ciclos"], refetchInterval: REFRESCO_PUBLICO, queryFn: () => rpc<PublicoCicloListado[]>("ugm_publico_ciclos") });
export const usePublicoResumen = (ciclo?: string | null) => useQuery({ queryKey: ["ugm-publico", "resumen", ciclo ?? ""], refetchInterval: REFRESCO_PUBLICO, queryFn: () => rpc<PublicoResumen | null>("ugm_publico_resumen", { p_ciclo: ciclo ?? null }) });
export const usePublicoCategoria = (ciclo: string | null | undefined, categoria: string | undefined, idioma: IdiomaPublico = "es") =>
  useQuery({ queryKey: ["ugm-publico", "categoria", ciclo ?? "", categoria, idioma], enabled: !!categoria, refetchInterval: REFRESCO_PUBLICO, queryFn: () => rpc<PublicoCategoria | null>("ugm_publico_categoria", { p_ciclo: ciclo ?? null, p_categoria: categoria, p_idioma: idioma }) });
export const usePublicoHoja = (ciclo: string | null | undefined, q: string | undefined, idioma: IdiomaPublico = "es") =>
  useQuery({ queryKey: ["ugm-publico", "hoja", ciclo ?? "", q, idioma], enabled: !!q, refetchInterval: REFRESCO_PUBLICO, queryFn: () => rpc<PublicoHoja | null>("ugm_publico_evidencia", { p_ciclo: ciclo ?? null, p_q: q, p_idioma: idioma }) });
