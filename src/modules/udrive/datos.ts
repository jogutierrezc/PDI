/* =============================================================================
   UDrive · datos (TanStack Query + Supabase, migración 0187).

   Lecturas y escrituras del módulo. La base decide (RLS por carpeta y archivo,
   disparadores y funciones); estos hooks no repiten permisos, salvo para no
   ofrecer lo imposible (lib/permisos.ts). Si las tablas no existen (migración
   sin aplicar), la consulta falla con FaltaMigracion y la pantalla lo dice.

   Nunca se pide `contenido` en las listas (una tabla puede pesar megas): solo
   al abrir el archivo (useContenido). El cliente no manda updated_at,
   creada_por, tipo ni ruta_storage fuera de la creación: la base los pone.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import { rutaStorage } from "./lib/nombres";
import type { ArchivoRow, CarpetaRow, DuenoRow, EstadoItem, PermisoRow, RolDrive, TipoItem } from "./tipos";

export { FaltaMigracion };

const BUCKET = "udrive";
const PAGINA = 1000;

interface ErrorBase {
  code?: string;
  message?: string;
}

const noExiste = (e: ErrorBase) =>
  Boolean(["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "")) && /drive_|does not exist|schema cache/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  if (noExiste(e)) {
    const de0188 = /drive_(versiones|comentarios|doc_|cifras)|estado_doc|bloqueado_/.test(e.message ?? "");
    return new FaltaMigracion(de0188 ? "Falta aplicar la migración 0188 (documentos de UDrive)." : "Falta aplicar la migración 0187 (UDrive).");
  }
  const m = e.message ?? "Error de la base de datos";
  if (/drive_carpetas_nombre_uq|drive_archivos_nombre_uq/.test(m)) return new Error("Ya hay algo con ese nombre en esa carpeta.");
  if (/row-level security/i.test(m)) return new Error("No tiene permiso para hacer eso en esa carpeta.");
  if (/permission denied/i.test(m)) return new Error("No tiene permiso para hacer eso.");
  if (/lock_not_available|Otra persona está editando/i.test(m)) return new Error("Otra persona está editando este documento en este momento.");
  return new Error(m);
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

export async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

export const UD_CLAVES = {
  todo: ["ud"] as const,
  carpetas: ["ud", "carpetas"] as const,
  archivos: ["ud", "archivos"] as const,
  duenos: (ids: string) => ["ud", "duenos", ids] as const,
  contenido: (id: string) => ["ud", "contenido", id] as const,
  permisos: (tipo: string, id: string) => ["ud", "permisos", tipo, id] as const,
};

const invalidarListas = (c: QueryClient) => {
  void c.invalidateQueries({ queryKey: UD_CLAVES.carpetas });
  void c.invalidateQueries({ queryKey: UD_CLAVES.archivos });
  void c.invalidateQueries({ queryKey: ["ud", "duenos"] });
};

/* ---------- Lecturas ---------------------------------------------------------- */

const COLUMNAS_CARPETA = "id, padre_id, nombre, creada_por, borrado_en, created_at, updated_at";
const COLUMNAS_ARCHIVO = "id, carpeta_id, tipo, nombre, mime, tamano, ruta_storage, resumen, estado, creada_por, borrado_en, created_at, updated_at";

/** Todas las carpetas que veo, también las de la papelera (la pantalla las separa). */
export function useCarpetas() {
  return useQuery({
    queryKey: UD_CLAVES.carpetas,
    retry: false,
    queryFn: () => todasLas<CarpetaRow>((a, b) => supabase.from("drive_carpetas").select(COLUMNAS_CARPETA).order("nombre").range(a, b)),
  });
}

/** Todos los archivos que veo, sin su contenido. */
export function useArchivos() {
  return useQuery({
    queryKey: UD_CLAVES.archivos,
    retry: false,
    queryFn: () => todasLas<ArchivoRow>((a, b) => supabase.from("drive_archivos").select(COLUMNAS_ARCHIVO).order("updated_at", { ascending: false }).range(a, b)),
  });
}

/** Mi papel y el dueño de cada elemento (en tandas de 300 ids). */
export function useDuenos(ids: readonly string[]) {
  const clave = ids.length ? `${ids.length}:${ids[0]}:${ids[ids.length - 1]}` : "0";
  return useQuery({
    queryKey: UD_CLAVES.duenos(clave),
    enabled: ids.length > 0,
    retry: false,
    queryFn: async (): Promise<Map<string, DuenoRow>> => {
      const mapa = new Map<string, DuenoRow>();
      for (let i = 0; i < ids.length; i += 300) {
        const filas = await rpc<DuenoRow[]>("drive_duenos", { p_ids: ids.slice(i, i + 300) });
        for (const f of filas ?? []) mapa.set(f.id, f);
      }
      return mapa;
    },
  });
}

export interface ContenidoLeido {
  id: string;
  tipo: TipoItem;
  nombre: string;
  estado: EstadoItem;
  contenido: unknown;
  updated_at: string;
  carpeta_id: string | null;
}

/** Lee el contenido completo de un archivo; nulo si no existe o no se puede ver. */
export async function pedirContenido(id: string): Promise<ContenidoLeido | null> {
  const r = await supabase.from("drive_archivos").select("id, tipo, nombre, estado, contenido, updated_at, carpeta_id").eq("id", id).maybeSingle();
  if (r.error) throw errorDe(r.error);
  return (r.data as ContenidoLeido | null) ?? null;
}

/** El contenido completo de un archivo (tabla, gráfica, cruce o documento). */
export function useContenido(id: string | undefined) {
  return useQuery({
    queryKey: UD_CLAVES.contenido(id ?? ""),
    enabled: Boolean(id),
    retry: false,
    staleTime: 15_000,
    queryFn: () => pedirContenido(id!),
  });
}

/** Con quién se comparte (solo lo ve el propietario). */
export function usePermisos(tipo: "carpeta" | "archivo", id: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: UD_CLAVES.permisos(tipo, id ?? ""),
    enabled: Boolean(id) && activo,
    retry: false,
    queryFn: () => rpc<PermisoRow[]>("drive_permisos_de", { p_tipo: tipo, p_id: id }),
  });
}

/* ---------- Escrituras ---------------------------------------------------------- */

export function useCrearCarpeta() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { nombre: string; padre: string | null }) => {
      const r = await supabase.from("drive_carpetas").insert({ id: crypto.randomUUID(), padre_id: a.padre, nombre: a.nombre }).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidarListas(c),
  });
}

/** Crea una tabla, gráfica o cruce con su contenido inicial. */
export function useCrearItem() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { tipo: Exclude<TipoItem, "archivo">; nombre: string; carpeta: string | null; contenido: unknown }) => {
      const id = crypto.randomUUID();
      const r = await supabase.from("drive_archivos").insert({ id, carpeta_id: a.carpeta, tipo: a.tipo, nombre: a.nombre, contenido: a.contenido, estado: "borrador" }).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidarListas(c),
  });
}

export function useRenombrar() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { tipo: "carpeta" | "archivo"; id: string; nombre: string }) => {
      const r = await supabase.from(a.tipo === "carpeta" ? "drive_carpetas" : "drive_archivos").update({ nombre: a.nombre }).eq("id", a.id).select("id");
      if (r.error) throw errorDe(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para renombrar eso.");
    },
    onSuccess: (_x, a) => {
      invalidarListas(c);
      void c.invalidateQueries({ queryKey: UD_CLAVES.contenido(a.id) });
    },
  });
}

export function useMover() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { tipo: "carpeta" | "archivo"; id: string; destino: string | null }) => {
      const r = a.tipo === "carpeta"
        ? await supabase.from("drive_carpetas").update({ padre_id: a.destino }).eq("id", a.id).select("id")
        : await supabase.from("drive_archivos").update({ carpeta_id: a.destino }).eq("id", a.id).select("id");
      if (r.error) throw errorDe(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para mover eso.");
    },
    onSuccess: () => invalidarListas(c),
  });
}

export function useAPapelera() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "carpeta" | "archivo"; id: string }) => rpc<string>("drive_a_papelera", { p_tipo: a.tipo, p_id: a.id }),
    onSuccess: () => invalidarListas(c),
  });
}

export function useRestaurar() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "carpeta" | "archivo"; id: string }) => rpc<void>("drive_restaurar", { p_tipo: a.tipo, p_id: a.id }),
    onSuccess: () => invalidarListas(c),
  });
}

/** Quita de Storage los archivos que la base ya borró. Lo que no se pueda quitar queda como huérfano sin acceso. */
async function quitarDeStorage(rutas: readonly string[] | null) {
  const lista = (rutas ?? []).filter(Boolean);
  if (!lista.length) return;
  await supabase.storage.from(BUCKET).remove(lista as string[]);
}

export function useEliminarDefinitivo() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { tipo: "carpeta" | "archivo"; id: string }) => quitarDeStorage(await rpc<string[]>("drive_eliminar_definitivo", { p_tipo: a.tipo, p_id: a.id })),
    onSuccess: () => invalidarListas(c),
  });
}

/** Al abrir UDrive: lo mío que lleva más de 30 días en la papelera se borra para siempre. */
export function useVaciarVencidos() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async () => quitarDeStorage(await rpc<string[]>("drive_vaciar_vencidos", {})),
    onSuccess: () => invalidarListas(c),
  });
}

/** Guarda el contenido de una tabla, gráfica o cruce (y, si se pide, su estado). */
export function useGuardarContenido() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; contenido: unknown; estado?: EstadoItem }) => {
      const cambios: Record<string, unknown> = { contenido: a.contenido };
      if (a.estado) cambios.estado = a.estado;
      const r = await supabase.from("drive_archivos").update(cambios).eq("id", a.id).select("id, updated_at");
      if (r.error) throw errorDe(r.error);
      if (!r.data?.length) throw new Error("No tiene permiso para guardar este archivo.");
      return r.data[0] as { id: string; updated_at: string };
    },
    onSuccess: (_x, a) => {
      void c.invalidateQueries({ queryKey: UD_CLAVES.archivos });
      void c.invalidateQueries({ queryKey: UD_CLAVES.contenido(a.id) });
    },
  });
}

export function useCompartir() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "carpeta" | "archivo"; id: string; correo: string; rol: Exclude<RolDrive, "propietario"> }) => rpc<string>("drive_compartir", { p_tipo: a.tipo, p_id: a.id, p_correo: a.correo, p_rol: a.rol }),
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: UD_CLAVES.permisos(a.tipo, a.id) }),
  });
}

export function useQuitarPermiso() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "carpeta" | "archivo"; id: string; usuario: string }) => rpc<void>("drive_quitar_permiso", { p_tipo: a.tipo, p_id: a.id, p_usuario: a.usuario }),
    onSuccess: (_x, a) => void c.invalidateQueries({ queryKey: UD_CLAVES.permisos(a.tipo, a.id) }),
  });
}

/* ---------- Subir y bajar archivos ------------------------------------------------ */

export interface OpcionesSubida {
  archivo: File;
  persona: string;
  carpeta: string | null;
  /** Nombre con que se guarda en UDrive (ya único en la carpeta). */
  nombre: string;
  onProgreso: (fraccion: number) => void;
  signal?: AbortSignal;
}

/** Sube a Storage con la sesión de la persona (políticas del bucket, no la clave de servicio) y mide el avance. */
function subirConProgreso(ruta: string, archivo: File, token: string, onProgreso: (f: number) => void, signal?: AbortSignal): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!base || !clave) return Promise.reject(new Error("Falta la configuración de Supabase."));
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${ruta.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", clave);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", archivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgreso(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver();
      let m = "";
      try {
        m = (JSON.parse(xhr.responseText) as { message?: string }).message ?? "";
      } catch {
        /* sin cuerpo legible */
      }
      rechazar(new Error(xhr.status === 413 ? "El archivo es más grande de lo permitido (100 MB)." : xhr.status === 401 || xhr.status === 403 ? "No tiene permiso para subir aquí. Vuelva a iniciar sesión." : /exists/i.test(m) ? "Ya se subió un archivo con esa ruta." : m || `No se pudo subir (código ${xhr.status}).`));
    };
    xhr.onerror = () => rechazar(new Error("Se cortó la conexión al subir el archivo. Inténtelo de nuevo."));
    xhr.onabort = () => rechazar(new Error("Subida cancelada."));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(archivo);
  });
}

export function useSubirArchivo() {
  const c = useQueryClient();
  return useMutation({
    mutationFn: async (o: OpcionesSubida) => {
      const sesion = (await supabase.auth.getSession()).data.session;
      if (!sesion) throw new Error("Su sesión venció. Inicie sesión de nuevo.");
      const id = crypto.randomUUID();
      const ruta = rutaStorage(o.persona, id, o.nombre);
      await subirConProgreso(ruta, o.archivo, sesion.access_token, o.onProgreso, o.signal);
      const r = await supabase.from("drive_archivos").insert({ id, carpeta_id: o.carpeta, tipo: "archivo", nombre: o.nombre, mime: o.archivo.type || null, tamano: o.archivo.size, ruta_storage: ruta }).select("id").single();
      if (r.error) {
        // Si la fila no se pudo crear, no se deja el archivo suelto en Storage.
        await supabase.storage.from(BUCKET).remove([ruta]);
        throw errorDe(r.error);
      }
      return (r.data as { id: string }).id;
    },
    onSuccess: () => invalidarListas(c),
  });
}

/** Un enlace de 5 minutos para ver o bajar el archivo; no se guarda en ningún lado. */
export async function enlaceDeArchivo(ruta: string, descargar?: string): Promise<string> {
  const r = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 300, descargar ? { download: descargar } : undefined);
  if (r.error || !r.data?.signedUrl) throw new Error("No se pudo abrir el archivo. Puede que ya no exista o que no tenga permiso.");
  return r.data.signedUrl;
}
