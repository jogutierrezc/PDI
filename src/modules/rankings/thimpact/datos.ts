/* =============================================================================
   THE Impact · datos de la capa de ciclo (TanStack Query + Supabase, migraciones 0237 a 0241).

   Lo que ya existía (catálogo, asignaciones, respuestas y su flujo de estados) sigue en
   reporte/datos.ts y no se duplica: estas funciones agregan el ciclo (crear, abrir, fechas),
   los requisitos de la metodología, las evidencias en UDrive, la bitácora, los avisos y la lista
   de entrega. La base decide (RLS y funciones definer); aquí no se repiten permisos. Si faltan
   las migraciones, la consulta falla con FaltaMigracion y la pantalla lo dice.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../noticias";

export { FaltaMigracion };

interface ErrorBase { code?: string; message?: string }
const noExiste = (e: ErrorBase) =>
  ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache|Could not find the function/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  return noExiste(e) ? new FaltaMigracion("Falta aplicar las migraciones de THE Impact (0237 a 0241).") : new Error(e.message ?? "Error de la base de datos");
}

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

/* --- Tipos ------------------------------------------------------------------------------------------ */

export interface ConfigThi {
  ciclo_id: string;
  metodologia: string;
  metodologia_version: string;
  anio_academico: number | null;
  universidad: string;
  pais: string;
  web: string;
  periodo_ref_desde: string | null;
  periodo_ref_hasta: string | null;
  envio_desde: string | null;
  envio_hasta: string | null;
  biblio_desde: number | null;
  biblio_hasta: number | null;
  recordatorio_dias: number[];
  resumen_semanal: boolean;
  resumen_dia: number;
  avisos_activos: boolean;
  avisar_a: string[];
  unidad_id: string | null;
  carpeta_raiz: string | null;
  ciclo_anterior: string | null;
  updated_at: string;
}

export type EvidenciaRequerida = "obligatoria" | "respaldo" | "no_aplica";

export interface RequisitoThi {
  metodologia: string;
  indicador: string;
  ods: number;
  titulo: string;
  tipo: "ev" | "doc" | "dato" | "inv";
  evidencia: EvidenciaRequerida;
  peso: number | null;
  maximo: number;
  pregunta: string;
  regla: string;
}

export interface EvidenciaThi {
  id: string;
  respuesta_id: string;
  archivo_id: string | null;
  url: string | null;
  nota: string | null;
  orden: number;
  publica: boolean;
  creada_por: string | null;
  created_at: string;
}

export interface ConteoEvidencias { respuesta_id: string; en_udrive: number; en_bucket: number; publicas: number }

export interface ActividadThi {
  id: number;
  ciclo_id: string;
  respuesta_id: string | null;
  indicador: string | null;
  actor: string | null;
  accion: string;
  de: string | null;
  a: string | null;
  detalle: Record<string, unknown>;
  created_at: string;
}

export type EstadoNotificacion = "en_cola" | "enviando" | "enviado" | "error" | "omitido";

export interface NotificacionThi {
  id: string;
  ciclo_id: string;
  respuesta_id: string | null;
  destinatario: string;
  plantilla: string;
  valores: Record<string, string>;
  estado: EstadoNotificacion;
  intentos: number;
  enviado_at: string | null;
  error: string | null;
  created_at: string;
}

export interface ColaEstado {
  conteo: Partial<Record<EstadoNotificacion, number>>;
  errores: { id: string; plantilla: string; error: string | null; intentos: number; creado: string }[];
  ultimo_envio: string | null;
}

export interface FilaEntrega {
  respuesta_id: string;
  indicador: string;
  unidad: string;
  estado: string;
  lista: boolean;
  exigida: boolean;
  n_evidencias: number;
  publicas: number;
  motivo: string;
}

export interface ReservaEvidencia { reserva_id: string; bucket: string; ruta: string; vence: string; aviso: string; carpeta_id: string }

export interface CambiosConfig {
  universidad?: string;
  pais?: string;
  web?: string;
  anio_academico?: number | null;
  periodo_ref_desde?: string | null;
  periodo_ref_hasta?: string | null;
  envio_desde?: string | null;
  envio_hasta?: string | null;
  recordatorio_dias?: number[];
  resumen_semanal?: boolean;
  resumen_dia?: number;
  avisos_activos?: boolean;
  avisar_a?: string[];
  fecha_limite?: boolean;
}

/* --- Llaves y acciones --------------------------------------------------------------------------------- */

const raiz = ["thi"] as const;
const claves = { ciclo: (c: string) => ["thi", c] as const };
/** Tras una escritura se refrescan las lecturas de esta capa y las del reporte por oficinas (comparten el ciclo y las respuestas). */
const invalidar = (qc: QueryClient) => Promise.all([qc.invalidateQueries({ queryKey: raiz }), qc.invalidateQueries({ queryKey: ["reporte"] })]);

function useAccion<A, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidar(qc) });
}

/* --- Ciclos y configuración -------------------------------------------------------------------------- */

export const useConfigThi = (ciclo?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "config"],
    enabled: !!ciclo,
    queryFn: async () => (await tabla<ConfigThi>("thi_config", (t) => t.select("*").eq("ciclo_id", ciclo!)))[0] ?? null,
  });

export const useCrearCicloThi = () =>
  useAccion((a: { anio: number; anioDatos: number; fechaLimite?: string | null; copiarDe?: string | null }) =>
    rpc<string>("thi_crear_ciclo", { p_anio: a.anio, p_anio_datos: a.anioDatos, p_fecha_limite: a.fechaLimite ?? null, p_copiar_de: a.copiarDe ?? null }));

export const useCambiarEstadoCicloThi = () =>
  useAccion((a: { ciclo: string; estado: "preparacion" | "abierto" | "cerrado" }) => rpc("thi_cambiar_estado_ciclo", { p_ciclo: a.ciclo, p_estado: a.estado }));

/** Guarda fechas, avisos y encabezado; la fecha límite y los ODS priorizados pertenecen a ranking_cycles. */
export const useGuardarConfigThi = () =>
  useAccion((a: { ciclo: string; cambios: CambiosConfig; fechaLimite?: string | null; ods?: number[] | null }) =>
    rpc("thi_guardar_config", { p_ciclo: a.ciclo, p_cambios: a.cambios, p_fecha_limite: a.fechaLimite ?? null, p_ods: a.ods ?? null }));

export const useCrearCarpetasThi = () => useAccion((ciclo: string) => rpc<{ carpeta_edicion: string; ods: number; indicadores: number; unidad_id: string | null }>("thi_crear_carpetas", { p_ciclo: ciclo }));

/* --- Requisitos de la metodología -------------------------------------------------------------------------- */

export const useRequisitosThi = (metodologia = "the-2027") =>
  useQuery({
    queryKey: ["thi", "requisitos", metodologia],
    staleTime: 600_000,
    queryFn: async () => {
      const filas: RequisitoThi[] = [];
      for (let desde = 0; ; desde += 1000) {
        const r = await tabla<RequisitoThi>("thi_requisitos", (t) => t.select("*").eq("metodologia", metodologia).order("ods").range(desde, desde + 999));
        filas.push(...r);
        if (r.length < 1000) break;
      }
      return new Map(filas.map((f) => [f.indicador, f]));
    },
  });

/** El requisito de un indicador del catálogo; una opción («4.3.1/2») usa el de su indicador. */
export const requisitoDe = (mapa: Map<string, RequisitoThi> | undefined, indicador: string): RequisitoThi | undefined => mapa?.get(indicador.split("/")[0]);

/* --- Evidencias en UDrive ------------------------------------------------------------------------------------- */

export const useEvidenciasThi = (respuesta?: string) =>
  useQuery({
    queryKey: ["thi", "evidencias", respuesta],
    enabled: !!respuesta,
    queryFn: () => tabla<EvidenciaThi>("thi_evidencias", (t) => t.select("*").eq("respuesta_id", respuesta!).order("orden")),
  });

/** Carpetas de UDrive del ciclo por clave (raiz, ods-4, 4.3.1), para abrirlas desde las pantallas. */
export const useCarpetasThi = (ciclo?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "carpetas"],
    enabled: !!ciclo,
    queryFn: async () => new Map((await tabla<{ clave: string; carpeta_id: string | null }>("thi_carpetas", (t) => t.select("clave,carpeta_id").eq("ciclo_id", ciclo!))).map((f) => [f.clave, f.carpeta_id])),
  });

export const useConteoEvidencias = (ciclo?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "conteo-evidencias"],
    enabled: !!ciclo,
    queryFn: async () => new Map((await rpc<ConteoEvidencias[]>("thi_conteo_evidencias", { p_ciclo: ciclo })).map((f) => [f.respuesta_id, f])),
  });

/** Reservar la ruta → subir a Storage → registrar. Devuelve {evidencia_id, archivo_id, avisos}. */
export const useSubirEvidenciaThi = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { respuesta: string; archivo: File; nombre: string; nota?: string }) => {
      const res = await rpc<ReservaEvidencia>("thi_reservar_evidencia", { p_respuesta: a.respuesta, p_nombre: a.nombre, p_mime: a.archivo.type || null, p_tamano: a.archivo.size });
      const up = await supabase.storage.from(res.bucket).upload(res.ruta, a.archivo, { upsert: false, contentType: a.archivo.type || undefined });
      if (up.error) throw new Error(`No se pudo subir el archivo: ${up.error.message}`);
      const reg = await rpc<{ evidencia_id: string; archivo_id: string; avisos: string[] }>("thi_registrar_evidencia", { p_reserva: res.reserva_id, p_nota: a.nota ?? null });
      return reg;
    },
    onSuccess: () => invalidar(qc),
  });
};

export const useAgregarEnlaceThi = () =>
  useAccion((a: { respuesta: string; url: string; nota?: string }) => rpc<{ evidencia_id: string; avisos: string[] }>("thi_agregar_enlace", { p_respuesta: a.respuesta, p_url: a.url, p_nota: a.nota ?? null }));
export const useEditarEvidenciaThi = () =>
  useAccion((a: { evidencia: string; nota: string; publica?: boolean | null }) => rpc("thi_editar_evidencia", { p_evidencia: a.evidencia, p_nota: a.nota, p_publica: a.publica ?? null }));
export const useQuitarEvidenciaThi = () => useAccion((evidencia: string) => rpc("thi_quitar_evidencia", { p_evidencia: evidencia }));

/* --- Bitácora y avisos ------------------------------------------------------------------------------------------ */

export const useBitacoraThi = (ciclo?: string, respuesta?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "bitacora", respuesta ?? ""],
    enabled: !!ciclo,
    queryFn: () =>
      tabla<ActividadThi>("thi_actividad", (t) => {
        const q = t.select("*").eq("ciclo_id", ciclo!);
        return (respuesta ? q.eq("respuesta_id", respuesta) : q).order("created_at", { ascending: false }).limit(200);
      }),
  });

export const useNotificacionesThi = (ciclo?: string) =>
  useQuery({
    queryKey: [...claves.ciclo(ciclo ?? ""), "notificaciones"],
    enabled: !!ciclo,
    queryFn: () => tabla<NotificacionThi>("thi_notificaciones", (t) => t.select("*").eq("ciclo_id", ciclo!).order("created_at", { ascending: false }).limit(200)),
  });

export const useColaEstadoThi = (ciclo?: string) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "cola"], enabled: !!ciclo, queryFn: () => rpc<ColaEstado>("thi_cola_estado", { p_ciclo: ciclo }) });
export const useReintentarAvisoThi = () => useAccion((id: string) => rpc("thi_cola_reintentar", { p_id: id }));
/** Prepara recordatorios y resumen semanal ahora (lo normal es programarlo; ver 0241). */
export const useTareasDiariasThi = () => useAccion(() => rpc<{ recordatorios: number; resumen: number }>("thi_tareas_diarias"));
/** «Enviar avisos pendientes»: la función correos vacía un lote de la cola de THE Impact. */
export const useEnviarAvisosThi = () =>
  useAccion(async () => {
    const { data, error } = await supabase.functions.invoke("correos", { body: { action: "thi_cola", limite: 10 } });
    if (error) throw new Error("No se pudieron enviar los avisos ahora.");
    const r = data as { ok: boolean; enviados?: number; fallidos?: number; error?: string };
    if (!r.ok) throw new Error(r.error ?? "No se pudieron enviar los avisos.");
    return r;
  });

/** El texto editable de una plantilla de correo (el que se ve en la pantalla Correos). */
export interface PlantillaGuardada { key: string; name: string; sent_when: string; subject: string; html: string | null; active: boolean; updated_at: string | null }
export const usePlantillasCorreoThi = () =>
  useQuery({
    queryKey: ["thi", "plantillas-correo"],
    staleTime: 60_000,
    // Si la persona no puede leer la tabla de plantillas (la pantalla Correos pide otro rol), no es un error: solo no se muestra su estado.
    queryFn: async (): Promise<PlantillaGuardada[] | null> => {
      try {
        return await tabla<PlantillaGuardada>("correo_templates", (t) => t.select("key,name,sent_when,subject,html,active,updated_at").like("key", "c-thi-%").order("sort"));
      } catch {
        return null;
      }
    },
  });

/* --- Lista de entrega a THE ------------------------------------------------------------------------------------------ */

export const useEntregaThi = (ciclo?: string, activo = true) =>
  useQuery({ queryKey: [...claves.ciclo(ciclo ?? ""), "entrega"], enabled: !!ciclo && activo, queryFn: () => rpc<FilaEntrega[]>("thi_publicacion_estado", { p_ciclo: ciclo }) });
export const useMarcarListaThi = () =>
  useAccion((a: { ciclo: string; indicador: string; unidad: string; lista: boolean; nota?: string }) =>
    rpc("thi_marcar_lista", { p_ciclo: a.ciclo, p_indicador: a.indicador, p_unidad: a.unidad, p_lista: a.lista, p_nota: a.nota ?? null }));
