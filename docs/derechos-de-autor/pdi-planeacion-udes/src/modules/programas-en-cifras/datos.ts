/* =============================================================================
   Programas en Cifras · datos (TanStack Query + Supabase, migración 0164).

   Lecturas y escrituras del módulo. La base decide (RLS por programa × campus,
   los disparadores y las RPC); estos hooks no repiten permisos, salvo para no
   ofrecer lo imposible (lib/permisos.ts). Si las tablas no existen (migración
   sin aplicar), la consulta falla con FaltaMigracion y la pantalla lo dice,
   como en Internacionalización y rankings.

   Ver README.md para el contrato (qué devuelve cada hook y qué manda cada
   mutación). Todo lo que depende de un programa recibe `programa` y `campus`
   (uuid de units y de campuses); si falta alguno, la consulta no corre.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import type {
  ArchivoCompleto,
  Campus,
  Columna,
  Datos,
  DestinoCompleto,
  ErrorArchivo,
  EstadoPeriodos,
  PcActividadRow,
  PcArchivoRow,
  PcArchivoTipo,
  PcCarpetaRow,
  PcColumnaRow,
  PcDestinoColumnaRow,
  PcDestinoRow,
  PcDominioRow,
  PcFilaRow,
  PcMapa,
  PcMiembroRow,
  PcRespuestaRow,
  PcRol,
  ResumenArchivo,
  Yo,
} from "./tipos";

export { FaltaMigracion };

const PAGINA = 1000;

interface ErrorBase {
  code?: string;
  message?: string;
}

const noExiste = (e: ErrorBase) =>
  Boolean(["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "")) &&
  /pc_|does not exist|schema cache/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  return noExiste(e) ? new FaltaMigracion("Falta aplicar la migración 0164 (Programas en Cifras).") : new Error(e.message ?? "Error de la base de datos");
}

export const esFaltaMigracion = (e: unknown): e is FaltaMigracion => e instanceof FaltaMigracion;

async function todasLas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: ErrorBase | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await pedir(desde, desde + PAGINA - 1);
    if (r.error) throw errorDe(r.error);
    const filas = (r.data ?? []) as T[];
    salida.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return salida;
}

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

export const PC_CLAVES = {
  todo: ["pc"] as const,
  yo: ["pc", "yo"] as const,
  campus: ["pc", "campus"] as const,
  destinos: ["pc", "destinos"] as const,
  carpetas: (p: string, c: string) => ["pc", "carpetas", p, c] as const,
  archivos: (p: string, c: string) => ["pc", "archivos", p, c] as const,
  estructura: (p: string, c: string) => ["pc", "estructura", p, c] as const,
  resumen: (p: string, c: string) => ["pc", "resumen", p, c] as const,
  filas: (archivo: string) => ["pc", "filas", archivo] as const,
  errores: (archivo: string) => ["pc", "errores", archivo] as const,
  respuestas: (p: string, c: string) => ["pc", "respuestas", p, c] as const,
  periodos: (p: string, c: string) => ["pc", "periodos", p, c] as const,
  actividad: (p: string, c: string) => ["pc", "actividad", p, c] as const,
  miembros: (p: string, c: string) => ["pc", "miembros", p, c] as const,
};

const invalidar = (cliente: QueryClient, ...claves: readonly (readonly unknown[])[]) => {
  for (const queryKey of claves) void cliente.invalidateQueries({ queryKey });
};

/** Todo lo de un programa y campus que cambia cuando se toca un archivo. */
const delPrograma = (p: string, c: string) => [PC_CLAVES.archivos(p, c), PC_CLAVES.estructura(p, c), PC_CLAVES.resumen(p, c), PC_CLAVES.actividad(p, c), PC_CLAVES.respuestas(p, c)] as const;

/* ---------- Lecturas ---------------------------------------------------------- */

/** Mis papeles (pc_yo): si soy de Planeación y a qué parejas programa × campus accedo, con mi rol en cada una. */
export function useYo() {
  return useQuery({
    queryKey: PC_CLAVES.yo,
    retry: false,
    staleTime: 60_000,
    queryFn: () => rpc<Yo>("pc_yo", {}),
  });
}

/** Los campus de public.campuses. */
export function useCampus() {
  return useQuery({
    queryKey: PC_CLAVES.campus,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Campus[]> => {
      const r = await supabase.from("campuses").select("id, slug, code, name").order("position");
      if (r.error) throw errorDe(r.error);
      return (r.data as Campus[] | null) ?? [];
    },
  });
}

/** Une destinos, sus columnas y las listas de sus dominios (exportada para las pruebas). */
export function armarDestinos(destinos: PcDestinoRow[], columnas: PcDestinoColumnaRow[], dominios: PcDominioRow[]): DestinoCompleto[] {
  const lista = new Map(dominios.map((d) => [d.id, d.opciones]));
  return [...destinos]
    .sort((a, b) => a.orden - b.orden)
    .map((d) => ({
      ...d,
      columnas: columnas
        .filter((c) => c.destino_id === d.id)
        .sort((a, b) => a.orden - b.orden)
        .map((c) => ({ ...c, opciones: c.dominio_id ? (lista.get(c.dominio_id) ?? []) : [] })),
    }));
}

/**
 * El catálogo de destinos (cuadros del CNA y plantillas del SNIES) con sus
 * columnas y listas. Si la migración no está, el error es FaltaMigracion; la
 * pantalla puede caer a lib/destinos.ts (DESTINOS, el mismo catálogo).
 */
export function useDestinos() {
  return useQuery({
    queryKey: PC_CLAVES.destinos,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DestinoCompleto[]> => {
      const [d, c, l] = await Promise.all([
        supabase.from("pc_destinos").select("id, sistema, plantilla, nombre, cuadro, orden, automatico, estructura_bloqueada, solo_salud, tipo_archivo, carpeta").order("orden"),
        todasLas<PcDestinoColumnaRow>((a, b) =>
          supabase.from("pc_destino_columnas").select("id, destino_id, clave, etiqueta, tipo, obligatorio, dominio_id, solo_lectura, posterior_a, personal, orden, nota").order("orden").range(a, b),
        ),
        supabase.from("pc_dominios").select("id, nombre, opciones, numerado"),
      ]);
      if (d.error) throw errorDe(d.error);
      if (l.error) throw errorDe(l.error);
      return armarDestinos((d.data as PcDestinoRow[] | null) ?? [], c, (l.data as PcDominioRow[] | null) ?? []);
    },
  });
}

/** Las carpetas de un programa y campus: las tres fijas (clave cna, snies, trabajo) y las que haya creado. */
export function useCarpetas(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.carpetas(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<PcCarpetaRow[]> => {
      const r = await supabase
        .from("pc_carpetas")
        .select("id, clave, programa_id, campus_id, nombre, subtitulo, orden, fija")
        .or(`fija.eq.true,and(programa_id.eq.${programa},campus_id.eq.${campus})`)
        .order("orden")
        .order("nombre");
      if (r.error) throw errorDe(r.error);
      return (r.data as PcCarpetaRow[] | null) ?? [];
    },
  });
}

const COLUMNAS_ARCHIVO = "id, programa_id, campus_id, carpeta_id, nombre, tipo, estado, bloqueado, destino_origen, listo_en, listo_por, created_by, updated_by, created_at, updated_at";

/** Los archivos de un programa y campus (sin columnas ni filas), los más recientes primero. */
export function useArchivos(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.archivos(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<PcArchivoRow[]> => {
      const r = await supabase
        .from("pc_archivos")
        .select(COLUMNAS_ARCHIVO)
        .eq("programa_id", programa ?? "")
        .eq("campus_id", campus ?? "")
        .order("updated_at", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data as PcArchivoRow[] | null) ?? [];
    },
  });
}

/** Une archivos con sus columnas ordenadas (exportada para las pruebas). */
export function armarEstructura(archivos: PcArchivoRow[], columnas: PcColumnaRow[]): ArchivoCompleto[] {
  return archivos.map((a) => ({ ...a, columnas: columnas.filter((c) => c.archivo_id === a.id).sort((x, y) => x.orden - y.orden) }));
}

/** Archivos con sus columnas, de una vez (lo que necesita el editor y la cobertura). */
export function useEstructura(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.estructura(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<ArchivoCompleto[]> => {
      const a = await supabase
        .from("pc_archivos")
        .select(COLUMNAS_ARCHIVO)
        .eq("programa_id", programa ?? "")
        .eq("campus_id", campus ?? "")
        .order("updated_at", { ascending: false });
      if (a.error) throw errorDe(a.error);
      const archivos = (a.data as PcArchivoRow[] | null) ?? [];
      if (!archivos.length) return [];
      const columnas = await todasLas<PcColumnaRow>((d, h) =>
        supabase
          .from("pc_columnas")
          .select("id, archivo_id, clave, etiqueta, tipo, obligatorio, opciones, solo_lectura, posterior_a, personal, orden")
          .in("archivo_id", archivos.map((x) => x.id))
          .order("orden")
          .range(d, h),
      );
      return armarEstructura(archivos, columnas);
    },
  });
}

/** Filas y celdas con error de cada archivo (el explorador: «3 errores»). */
export function useResumenArchivos(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.resumen(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<ResumenArchivo[]> => {
      const filas = await rpc<{ archivo_id: string; filas: number | string; errores: number | string }[]>("pc_resumen_archivos", { p_programa: programa, p_campus: campus });
      return (filas ?? []).map((f) => ({ archivo_id: f.archivo_id, filas: Number(f.filas), errores: Number(f.errores) }));
    },
  });
}

/** Las filas de un archivo, en su orden. */
export function useFilas(archivo: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.filas(archivo ?? ""),
    enabled: Boolean(archivo),
    retry: false,
    queryFn: () =>
      todasLas<PcFilaRow>((d, h) =>
        supabase
          .from("pc_filas")
          .select("id, archivo_id, programa_id, campus_id, datos, orden, origen, created_by, updated_by, created_at, updated_at")
          .eq("archivo_id", archivo ?? "")
          .order("orden")
          .order("created_at")
          .range(d, h),
      ),
  });
}

/** Los errores de validación de un archivo, celda por celda (la base es la fuente; lib/validacion.ts da lo mismo en el navegador). */
export function useErrores(archivo: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.errores(archivo ?? ""),
    enabled: Boolean(archivo),
    retry: false,
    queryFn: () => rpc<ErrorArchivo[]>("pc_errores_archivo", { p_archivo: archivo }),
  });
}

/** Los mapas «responde a» de todos los archivos de un programa y campus. */
export function useRespuestas(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.respuestas(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<PcRespuestaRow[]> => {
      const a = await supabase.from("pc_archivos").select("id").eq("programa_id", programa ?? "").eq("campus_id", campus ?? "");
      if (a.error) throw errorDe(a.error);
      const ids = ((a.data as { id: string }[] | null) ?? []).map((x) => x.id);
      if (!ids.length) return [];
      return todasLas<PcRespuestaRow>((d, h) => supabase.from("pc_respuestas").select("id, archivo_id, destino_id, mapa, updated_at").in("archivo_id", ids).range(d, h));
    },
  });
}

/** Ventana de observación y ruta de periodos (pc_estado_periodos). `ventana` es nulo hasta que se define. */
export function usePeriodos(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.periodos(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: () => rpc<EstadoPeriodos>("pc_estado_periodos", { p_programa: programa, p_campus: campus }),
  });
}

/** El historial de un programa y campus (lo último primero), opcionalmente de un solo archivo. */
export function useActividad(programa: string | undefined, campus: string | undefined, archivo?: string, limite = 50) {
  return useQuery({
    queryKey: [...PC_CLAVES.actividad(programa ?? "", campus ?? ""), archivo ?? "", limite],
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<PcActividadRow[]> => {
      let q = supabase.from("pc_actividad").select("id, programa_id, campus_id, archivo_id, accion, detalle, actor, en").eq("programa_id", programa ?? "").eq("campus_id", campus ?? "");
      if (archivo) q = q.eq("archivo_id", archivo);
      const r = await q.order("en", { ascending: false }).limit(limite);
      if (r.error) throw errorDe(r.error);
      return (r.data as PcActividadRow[] | null) ?? [];
    },
  });
}

export interface Miembro extends PcMiembroRow {
  nombre: string;
  email: string;
}

/** Director y Coordinadores de un programa y campus, con nombre y correo. */
export function useMiembros(programa: string | undefined, campus: string | undefined) {
  return useQuery({
    queryKey: PC_CLAVES.miembros(programa ?? "", campus ?? ""),
    enabled: Boolean(programa && campus),
    retry: false,
    queryFn: async (): Promise<Miembro[]> => {
      const r = await supabase
        .from("pc_miembros")
        .select("id, user_id, rol, programa_id, campus_id, created_at, profiles!pc_miembros_user_id_fkey(full_name, email)")
        .eq("programa_id", programa ?? "")
        .eq("campus_id", campus ?? "");
      if (r.error) throw errorDe(r.error);
      type Perfil = { full_name: string | null; email: string | null };
      const filas = (r.data as unknown as (PcMiembroRow & { profiles: Perfil | Perfil[] | null })[] | null) ?? [];
      return filas.map(({ profiles, ...m }) => {
        const p = Array.isArray(profiles) ? profiles[0] : profiles;
        return { ...m, nombre: p?.full_name ?? p?.email ?? "Persona", email: p?.email ?? "" };
      });
    },
  });
}

/* ---------- Escrituras: archivos ------------------------------------------------ */

export interface ColumnaNueva {
  clave: string;
  etiqueta: string;
  tipo: Columna["tipo"];
  obligatorio?: boolean;
  opciones?: string[];
  posterior_a?: string | null;
  personal?: boolean;
  orden?: number;
}

export interface ArchivoNuevo {
  programa: string;
  campus: string;
  carpeta: string;
  nombre: string;
  tipo?: PcArchivoTipo;
  /** Id de un destino (cna07, snies_graduados…): el archivo parte de su estructura y queda unido a él. */
  destino?: string | null;
  /** Columnas del archivo; se ignoran si el destino tiene la estructura bloqueada (las pone la base). */
  columnas?: ColumnaNueva[];
  filas?: { datos: Datos; orden?: number }[];
  /** Mapas hacia otros destinos: {destino: {clave del destino: clave de la columna}}. */
  mapas?: Record<string, PcMapa>;
}

/**
 * Crea un archivo con sus columnas, filas y mapas de una vez (pc_crear_archivo).
 * Devuelve la fila del archivo. Un cuadro estándar del CNA solo admite un archivo
 * por programa y campus.
 */
export function useCrearArchivo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: ArchivoNuevo) =>
      rpc<PcArchivoRow>("pc_crear_archivo", {
        p_programa: a.programa,
        p_campus: a.campus,
        p_carpeta: a.carpeta,
        p_nombre: a.nombre,
        p_tipo: a.tipo ?? "tabla",
        p_destino: a.destino ?? null,
        p_columnas: a.columnas ?? [],
        p_filas: a.filas ?? [],
        p_mapas: a.mapas ?? {},
      }),
    onSuccess: (_x, a) => invalidar(cliente, ...delPrograma(a.programa, a.campus)),
  });
}

/** Renombra un archivo o lo cambia de carpeta. */
export function useActualizarArchivo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; programa: string; campus: string; nombre?: string; carpeta?: string }) => {
      const cambios: Record<string, string> = {};
      if (a.nombre !== undefined) cambios.nombre = a.nombre.trim();
      if (a.carpeta !== undefined) cambios.carpeta_id = a.carpeta;
      const r = await supabase.from("pc_archivos").update(cambios).eq("id", a.id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, ...delPrograma(a.programa, a.campus)),
  });
}

/** Borra un archivo con sus columnas, filas y mapas. La base no deja borrar los de un cuadro del CNA. */
export function useBorrarArchivo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; programa: string; campus: string }) => {
      const r = await supabase.from("pc_archivos").delete().eq("id", a.id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, ...delPrograma(a.programa, a.campus), PC_CLAVES.filas(a.id)),
  });
}

/** Marca un archivo como listo («Listo para Planeación») o lo devuelve a borrador. Marcarlo con errores falla con el motivo. */
export function useMarcarListo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { archivo: string; listo: boolean; programa: string; campus: string }) => rpc<PcArchivoRow>("pc_marcar_listo", { p_archivo: a.archivo, p_listo: a.listo }),
    onSuccess: (_x, a) => invalidar(cliente, ...delPrograma(a.programa, a.campus)),
  });
}

/* ---------- Escrituras: columnas -------------------------------------------------- */

/**
 * Deja las columnas de un archivo libre exactamente como la lista (por clave):
 * actualiza las que existen, crea las nuevas y borra las que ya no están (sus
 * valores salen de las filas y de los mapas). Un cuadro del CNA no lo permite.
 */
export function useGuardarColumnas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { archivo: string; programa: string; campus: string; columnas: ColumnaNueva[] }) => {
      const filas = a.columnas.map((c, i) => ({
        archivo_id: a.archivo,
        clave: c.clave,
        etiqueta: c.etiqueta,
        tipo: c.tipo,
        obligatorio: c.obligatorio ?? false,
        opciones: c.tipo === "lista" ? (c.opciones ?? []) : [],
        posterior_a: c.posterior_a ?? null,
        personal: c.personal ?? false,
        orden: c.orden ?? i + 1,
      }));
      const actuales = await supabase.from("pc_columnas").select("clave").eq("archivo_id", a.archivo);
      if (actuales.error) throw errorDe(actuales.error);
      const nuevas = new Set(filas.map((f) => f.clave));
      const quitar = ((actuales.data as { clave: string }[] | null) ?? []).map((c) => c.clave).filter((k) => !nuevas.has(k));
      if (quitar.length) {
        const del = await supabase.from("pc_columnas").delete().eq("archivo_id", a.archivo).in("clave", quitar);
        if (del.error) throw errorDe(del.error);
      }
      if (filas.length) {
        const up = await supabase.from("pc_columnas").upsert(filas, { onConflict: "archivo_id,clave" });
        if (up.error) throw errorDe(up.error);
      }
    },
    onSuccess: (_x, a) => invalidar(cliente, ...delPrograma(a.programa, a.campus), PC_CLAVES.filas(a.archivo), PC_CLAVES.errores(a.archivo)),
  });
}

/* ---------- Escrituras: filas ------------------------------------------------------ */

export interface FilaParaGuardar {
  id?: string;
  /** Con id: la fila completa (los valores de solo lectura los conserva la base). */
  datos: Datos;
  orden?: number;
}

/**
 * Guarda filas por lotes (pc_guardar_filas): con id actualiza, sin id inserta al
 * final. `borrar`: ids de filas a quitar. `reemplazar`: borra todas antes
 * (recargar un Excel). Devuelve {insertadas, actualizadas, borradas}.
 */
export function useGuardarFilas() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { archivo: string; programa: string; campus: string; filas: FilaParaGuardar[]; borrar?: string[]; reemplazar?: boolean; origen?: "manual" | "excel" }) =>
      rpc<{ insertadas: number; actualizadas: number; borradas: number }>("pc_guardar_filas", {
        p_archivo: a.archivo,
        p_filas: a.filas,
        p_borrar: a.borrar?.length ? a.borrar : null,
        p_reemplazar: a.reemplazar ?? false,
        p_origen: a.origen ?? "manual",
      }),
    onSuccess: (_x, a) => invalidar(cliente, PC_CLAVES.filas(a.archivo), PC_CLAVES.errores(a.archivo), ...delPrograma(a.programa, a.campus)),
  });
}

/* ---------- Escrituras: «responde a» ------------------------------------------------- */

/** Guarda el mapa de un archivo hacia un destino ({clave del destino: clave de la columna}); crea la respuesta si no existe. */
export function useGuardarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { archivo: string; destino: string; mapa: PcMapa; programa: string; campus: string }) => {
      const r = await supabase.from("pc_respuestas").upsert({ archivo_id: a.archivo, destino_id: a.destino, mapa: a.mapa }, { onConflict: "archivo_id,destino_id" });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, PC_CLAVES.respuestas(a.programa, a.campus)),
  });
}

/** Desconecta un archivo de un destino (no el cuadro de origen de un archivo del CNA). */
export function useQuitarRespuesta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { archivo: string; destino: string; programa: string; campus: string }) => {
      const r = await supabase.from("pc_respuestas").delete().eq("archivo_id", a.archivo).eq("destino_id", a.destino);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, PC_CLAVES.respuestas(a.programa, a.campus)),
  });
}

/* ---------- Escrituras: carpetas -------------------------------------------------------- */

export function useCrearCarpeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { programa: string; campus: string; nombre: string; subtitulo?: string }) => {
      const r = await supabase
        .from("pc_carpetas")
        .insert({ programa_id: a.programa, campus_id: a.campus, nombre: a.nombre.trim(), subtitulo: a.subtitulo ?? "", fija: false })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: (_x, a) => invalidar(cliente, PC_CLAVES.carpetas(a.programa, a.campus)),
  });
}

/** Borra una carpeta propia (la base no deja si tiene archivos). */
export function useBorrarCarpeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; programa: string; campus: string }) => {
      const r = await supabase.from("pc_carpetas").delete().eq("id", a.id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, a) => invalidar(cliente, PC_CLAVES.carpetas(a.programa, a.campus)),
  });
}

/* ---------- Escrituras: periodos y emisión ------------------------------------------------ */

const alPeriodos = (cliente: QueryClient, a: { programa: string; campus: string }) => invalidar(cliente, PC_CLAVES.periodos(a.programa, a.campus), PC_CLAVES.actividad(a.programa, a.campus));

/** Fija la ventana de observación: 5, 6, 8 o 10 años hasta «AAAA-01» o «AAAA-02». Devuelve el estado de los periodos. */
export function useDefinirVentana() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { programa: string; campus: string; anios: 5 | 6 | 8 | 10; hasta: string }) =>
      rpc<EstadoPeriodos>("pc_definir_ventana", { p_programa: a.programa, p_campus: a.campus, p_anios: a.anios, p_hasta: a.hasta }),
    onSuccess: (_x, a) => alPeriodos(cliente, a),
  });
}

/** Cierra un periodo: solo el siguiente en el orden, y sin errores en los archivos del Cuadro Maestro. */
export function useCerrarPeriodo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { programa: string; campus: string; codigo: string }) => rpc<EstadoPeriodos>("pc_cerrar_periodo", { p_programa: a.programa, p_campus: a.campus, p_codigo: a.codigo }),
    onSuccess: (_x, a) => alPeriodos(cliente, a),
  });
}

/** Reabre el último periodo cerrado. */
export function useReabrirPeriodo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { programa: string; campus: string; codigo: string }) => rpc<EstadoPeriodos>("pc_reabrir_periodo", { p_programa: a.programa, p_campus: a.campus, p_codigo: a.codigo }),
    onSuccess: (_x, a) => alPeriodos(cliente, a),
  });
}

/** Deja constancia de que se emitió el Cuadro Maestro (la base exige ventana completa y archivos del CNA listos). */
export function useRegistrarEmision() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { programa: string; campus: string; nombre: string; detalle?: Record<string, unknown> }) =>
      rpc<PcActividadRow>("pc_registrar_emision", { p_programa: a.programa, p_campus: a.campus, p_nombre: a.nombre, p_detalle: a.detalle ?? {} }),
    onSuccess: (_x, a) => alPeriodos(cliente, a),
  });
}

/* ---------- Escrituras: equipo ------------------------------------------------------------- */

/** Nombra a alguien (la administración: cualquiera; el Director: Coordinadores de su programa y campus). */
export function useGuardarMiembro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (m: { user_id: string; rol: PcRol; programa: string; campus: string }) => {
      const r = await supabase.from("pc_miembros").insert({ user_id: m.user_id, rol: m.rol, programa_id: m.programa, campus_id: m.campus });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, m) => invalidar(cliente, PC_CLAVES.miembros(m.programa, m.campus), PC_CLAVES.yo),
  });
}

export function useQuitarMiembro() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id: string; programa: string; campus: string }) => {
      const r = await supabase.from("pc_miembros").delete().eq("id", m.id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: (_x, m) => invalidar(cliente, PC_CLAVES.miembros(m.programa, m.campus), PC_CLAVES.yo),
  });
}
