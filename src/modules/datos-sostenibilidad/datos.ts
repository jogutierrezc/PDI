/* =============================================================================
   Datos de Sostenibilidad · datos (TanStack Query + Supabase, migración 0178).

   Lecturas y escrituras del módulo. La base decide (RLS por oficina, los
   disparadores y las RPC de 0178); estos hooks no repiten permisos, salvo
   para no ofrecer lo imposible (lib/permisos.ts). Si las tablas no existen
   (migración sin aplicar), la consulta falla con FaltaMigracion y la pantalla
   lo dice, como en Programas en Cifras.

   Todo lo que depende de una oficina recibe `oficina` (uuid de units); sin
   él, la consulta no corre. El contrato completo, en README.md.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { FaltaMigracion } from "../rankings/noticias";
import { INDICADORES_DS } from "./lib/indicadores";
import type {
  DsActividad,
  DsCarpeta,
  DsColumna,
  DsErrorCelda,
  DsFila,
  DsIndicador,
  DsLibro,
  DsMiembro,
  DsResumenLibro,
  DsRespuesta,
  DsYo,
} from "./tipos";
import type { Columna } from "../programas-en-cifras/tipos";

export { FaltaMigracion };

const PAGINA = 1000;

interface ErrorBase {
  code?: string;
  message?: string;
}

const noExiste = (e: ErrorBase) =>
  Boolean(["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? "")) &&
  /ds_|does not exist|schema cache/i.test(e.message ?? "");

/** Error legible; si faltan las tablas o las funciones, el aviso de migración. */
export function errorDe(e: ErrorBase): Error {
  return noExiste(e) ? new FaltaMigracion("Falta aplicar la migración 0178 (Datos de Sostenibilidad).") : new Error(e.message ?? "Error de la base de datos");
}

export const esFaltaMigracion = (e: unknown): e is FaltaMigracion => e instanceof FaltaMigracion;

async function rpc<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw errorDe(r.error);
  return r.data as T;
}

/** Un libro con sus columnas, ya armado. */
export interface LibroCompleto extends DsLibro {
  columnas: DsColumna[];
}

const dsKeys = {
  all: ["datos-sostenibilidad"] as const,
  yo: ["datos-sostenibilidad", "yo"] as const,
  indicadores: ["datos-sostenibilidad", "indicadores"] as const,
  carpetas: (oficina: string) => ["datos-sostenibilidad", "carpetas", oficina] as const,
  libros: (oficina: string) => ["datos-sostenibilidad", "libros", oficina] as const,
  estructura: (oficina: string) => ["datos-sostenibilidad", "estructura", oficina] as const,
  filas: (libro: string) => ["datos-sostenibilidad", "filas", libro] as const,
  errores: (libro: string) => ["datos-sostenibilidad", "errores", libro] as const,
  resumen: (oficina: string) => ["datos-sostenibilidad", "resumen", oficina] as const,
  respuestas: (oficina: string) => ["datos-sostenibilidad", "respuestas", oficina] as const,
  actividad: (oficina: string) => ["datos-sostenibilidad", "actividad", oficina] as const,
  miembros: (oficina: string) => ["datos-sostenibilidad", "miembros", oficina] as const,
};

/** Al escribir, se relee lo que toca. */
function invalidar(client: QueryClient, oficina?: string) {
  if (oficina) {
    void client.invalidateQueries({ queryKey: dsKeys.estructura(oficina) });
    void client.invalidateQueries({ queryKey: dsKeys.libros(oficina) });
    void client.invalidateQueries({ queryKey: dsKeys.resumen(oficina) });
    void client.invalidateQueries({ queryKey: dsKeys.respuestas(oficina) });
    void client.invalidateQueries({ queryKey: dsKeys.actividad(oficina) });
  }
  void client.invalidateQueries({ queryKey: dsKeys.all });
}

/* --- Lecturas -------------------------------------------------------------------------- */

/** Mis papeles: a qué oficinas accedo y con qué rol (RPC ds_yo). */
export function useYo() {
  return useQuery({
    queryKey: dsKeys.yo,
    queryFn: async (): Promise<DsYo> => {
      const yo = await rpc<DsYo>("ds_yo", {});
      return { planeacion: Boolean(yo?.planeacion), oficinas: yo?.oficinas ?? [] };
    },
  });
}

/** El catálogo de indicadores. Si la base no está aplicada, cae a la semilla local. */
export function useIndicadores() {
  return useQuery({
    queryKey: dsKeys.indicadores,
    queryFn: async (): Promise<DsIndicador[]> => {
      const r = await supabase.from("ds_indicadores").select("id,ods,nombre,descripcion,unidad,position").order("ods").order("position");
      if (r.error) {
        if (noExiste(r.error)) return INDICADORES_DS;
        throw errorDe(r.error);
      }
      return (r.data ?? []) as DsIndicador[];
    },
  });
}

/** Crea o edita un indicador del catálogo (solo la administración: lo hace cumplir la RLS de 0178). */
export function useGuardarIndicador() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (i: DsIndicador) => {
      const r = await supabase
        .from("ds_indicadores")
        .upsert({ id: i.id.trim(), ods: i.ods, nombre: i.nombre.trim(), descripcion: i.descripcion.trim(), unidad: i.unidad.trim(), position: i.position }, { onConflict: "id" })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: dsKeys.indicadores }),
  });
}

/** Las carpetas: las dos fijas del módulo y las de la oficina. */
export function useCarpetas(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.carpetas(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: async (): Promise<DsCarpeta[]> => {
      const r = await supabase.from("ds_carpetas").select("id,oficina_id,clave,nombre,fija").order("fija", { ascending: false }).order("nombre");
      if (r.error) throw errorDe(r.error);
      return ((r.data ?? []) as DsCarpeta[]).filter((c) => c.fija || c.oficina_id === oficina);
    },
  });
}

/** Los libros de una oficina, lo más reciente primero. */
export function useLibros(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.libros(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: async (): Promise<DsLibro[]> => {
      const r = await supabase
        .from("ds_libros")
        .select("id,oficina_id,carpeta_id,nombre,tipo,estado,created_by,created_at,updated_at,listo_en,listo_por")
        .eq("oficina_id", oficina!)
        .order("created_at", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as DsLibro[];
    },
  });
}

/** Los libros de una oficina con sus columnas, para el editor y la cobertura. */
export function useEstructura(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.estructura(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: async (): Promise<LibroCompleto[]> => {
      const [librosR, columnasR] = await Promise.all([
        supabase.from("ds_libros").select("*").eq("oficina_id", oficina!).order("created_at", { ascending: false }),
        supabase.from("ds_columnas").select("id,libro_id,clave,etiqueta,tipo,obligatorio,opciones,solo_lectura,posterior_a,orden").order("orden"),
      ]);
      if (librosR.error) throw errorDe(librosR.error);
      if (columnasR.error) throw errorDe(columnasR.error);
      const columnas = (columnasR.data ?? []) as DsColumna[];
      return ((librosR.data ?? []) as DsLibro[]).map((l) => ({
        ...l,
        columnas: columnas.filter((c) => c.libro_id === l.id),
      }));
    },
  });
}

/** Las filas de un libro, en orden. */
export function useFilas(libro: string | undefined) {
  return useQuery({
    queryKey: dsKeys.filas(libro ?? ""),
    enabled: Boolean(libro),
    queryFn: async (): Promise<DsFila[]> => {
      const salida: DsFila[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await supabase
          .from("ds_filas")
          .select("id,libro_id,oficina_id,datos,orden,origen")
          .eq("libro_id", libro!)
          .order("orden")
          .range(desde, desde + PAGINA - 1);
        if (r.error) throw errorDe(r.error);
        const pagina = (r.data ?? []) as DsFila[];
        salida.push(...pagina);
        if (pagina.length < PAGINA) break;
      }
      return salida;
    },
  });
}

/** Los errores de un libro, celda por celda (RPC ds_errores_libro). */
export function useErrores(libro: string | undefined) {
  return useQuery({
    queryKey: dsKeys.errores(libro ?? ""),
    enabled: Boolean(libro),
    queryFn: () => rpc<DsErrorCelda[]>("ds_errores_libro", { p_libro: libro }),
  });
}

/** Filas y errores de cada libro de la oficina, para el explorador (RPC). */
export function useResumenLibros(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.resumen(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: () => rpc<DsResumenLibro[]>("ds_resumen_libros", { p_oficina: oficina }),
  });
}

/** Las conexiones a indicadores de todos los libros de una oficina. */
export function useRespuestas(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.respuestas(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: async (): Promise<DsRespuesta[]> => {
      const libros = await supabase.from("ds_libros").select("id").eq("oficina_id", oficina!).order("created_at");
      if (libros.error) throw errorDe(libros.error);
      const ids = (libros.data ?? []).map((l: { id: string }) => l.id);
      if (!ids.length) return [];
      const salida: DsRespuesta[] = [];
      for (let desde = 0; desde < ids.length; desde += PAGINA) {
        const r = await supabase.from("ds_respuestas").select("id,libro_id,indicador_id,mapa").in("libro_id", ids.slice(desde, desde + PAGINA));
        if (r.error) throw errorDe(r.error);
        salida.push(...((r.data ?? []) as DsRespuesta[]));
      }
      return salida;
    },
  });
}

/** El historial de una oficina, lo último primero. */
export function useActividad(oficina: string | undefined, limite = 50) {
  return useQuery({
    queryKey: [...dsKeys.actividad(oficina ?? ""), limite],
    enabled: Boolean(oficina),
    queryFn: async (): Promise<DsActividad[]> => {
      const r = await supabase
        .from("ds_actividad")
        .select("id,oficina_id,libro_id,accion,detalle,user_id,at")
        .eq("oficina_id", oficina!)
        .order("at", { ascending: false })
        .limit(limite);
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as DsActividad[];
    },
  });
}

/** El equipo de una oficina, con nombre y correo. */
export function useMiembros(oficina: string | undefined) {
  return useQuery({
    queryKey: dsKeys.miembros(oficina ?? ""),
    enabled: Boolean(oficina),
    queryFn: async (): Promise<DsMiembro[]> => {
      const r = await supabase
        .from("ds_miembros")
        .select("id,user_id,oficina_id,rol,profiles(full_name,email)")
        .eq("oficina_id", oficina!)
        .order("rol");
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        user_id: m.user_id as string,
        oficina_id: m.oficina_id as string,
        rol: m.rol as DsMiembro["rol"],
        name: ((m.profiles as { full_name?: string | null } | null)?.full_name ?? "").trim() || "Sin nombre",
        email: (m.profiles as { email?: string | null } | null)?.email ?? "",
      }));
    },
  });
}

/* --- Escrituras ------------------------------------------------------------------------ */

/** Crea un libro con sus columnas, sus filas y, si vienen, sus conexiones. */
export function useCrearLibro(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: {
      carpeta: string;
      nombre: string;
      tipo?: "tabla" | "lista";
      columnas: (Pick<Columna, "clave" | "etiqueta" | "tipo"> & Partial<Pick<Columna, "obligatorio" | "opciones" | "posterior_a">> & { orden?: number })[];
      filas?: { datos: Record<string, unknown>; orden?: number }[];
      respuestas?: Record<string, Record<string, string>>;
    }) =>
      rpc<DsLibro>("ds_crear_libro", {
        p_oficina: oficina,
        p_carpeta: entrada.carpeta,
        p_nombre: entrada.nombre,
        p_tipo: entrada.tipo ?? "tabla",
        p_columnas: entrada.columnas,
        p_filas: entrada.filas ?? [],
        p_respuestas: entrada.respuestas ?? {},
      }),
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Renombra o mueve un libro de carpeta. */
export function useActualizarLibro(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nombre, carpeta }: { id: string; nombre?: string; carpeta?: string }) => {
      const campos: Record<string, string> = {};
      if (nombre !== undefined) campos.nombre = nombre;
      if (carpeta !== undefined) campos.carpeta_id = carpeta;
      const r = await supabase.from("ds_libros").update(campos).eq("id", id).select("id").single();
      if (r.error) throw errorDe(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Borra un libro (la base arrastra sus columnas, filas y conexiones). */
export function useBorrarLibro(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("ds_libros").delete().eq("id", id).select("id").maybeSingle();
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/**
 * Deja las columnas exactamente como la lista: crea las nuevas, actualiza las
 * que ya estaban y quita las que desaparecen (la base limpia filas y mapas).
 */
export function useGuardarColumnas(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ libro, columnas }: { libro: string; columnas: DsColumna[] }) => {
      const actualesR = await supabase.from("ds_columnas").select("id,clave").eq("libro_id", libro);
      if (actualesR.error) throw errorDe(actualesR.error);
      const actuales = (actualesR.data ?? []) as { id: string; clave: string }[];
      const quedan = new Set(columnas.filter((c) => c.id).map((c) => c.id as string));

      for (const vieja of actuales) {
        if (!quedan.has(vieja.id)) {
          const r = await supabase.from("ds_columnas").delete().eq("id", vieja.id).select("id").maybeSingle();
          if (r.error) throw errorDe(r.error);
        }
      }
      for (const [i, c] of columnas.entries()) {
        const campos = {
          libro_id: libro,
          clave: c.clave,
          etiqueta: c.etiqueta,
          tipo: c.tipo,
          obligatorio: c.obligatorio,
          opciones: c.opciones ?? [],
          posterior_a: c.posterior_a ?? null,
          orden: c.orden ?? i,
        };
        const r = c.id
          ? await supabase.from("ds_columnas").update(campos).eq("id", c.id).select("id").single()
          : await supabase.from("ds_columnas").insert(campos).select("id").single();
        if (r.error) throw errorDe(r.error);
      }
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Guarda filas por lotes (RPC ds_guardar_filas): {id?, datos, orden?}. */
export function useGuardarFilas(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { libro: string; filas: { id?: string; datos: Record<string, unknown>; orden?: number }[]; borrar?: string[]; reemplazar?: boolean; origen?: "manual" | "excel" }) =>
      rpc<{ insertadas: number; actualizadas: number; borradas: number }>("ds_guardar_filas", {
        p_libro: entrada.libro,
        p_filas: entrada.filas,
        p_borrar: entrada.borrar ?? null,
        p_reemplazar: entrada.reemplazar ?? false,
        p_origen: entrada.origen ?? "manual",
      }),
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Marca un libro como listo — o lo devuelve a borrador (RPC ds_marcar_listo). */
export function useMarcarListo(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ libro, listo }: { libro: string; listo: boolean }) => rpc<DsLibro>("ds_marcar_listo", { p_libro: libro, p_listo: listo }),
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Conecta un libro a un indicador: {slot: clave de la columna}. */
export function useGuardarRespuesta(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ libro, indicador, mapa }: { libro: string; indicador: string; mapa: Record<string, string> }) => {
      const r = await supabase
        .from("ds_respuestas")
        .upsert({ libro_id: libro, indicador_id: indicador, mapa }, { onConflict: "libro_id,indicador_id" })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Desconecta un libro de un indicador. */
export function useQuitarRespuesta(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ libro, indicador }: { libro: string; indicador: string }) => {
      const r = await supabase.from("ds_respuestas").delete().eq("libro_id", libro).eq("indicador_id", indicador).select("id").maybeSingle();
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Crea una carpeta propia de la oficina. */
export function useCrearCarpeta(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ nombre, clave }: { nombre: string; clave: string }) => {
      const r = await supabase.from("ds_carpetas").insert({ oficina_id: oficina, nombre, clave }).select("id").single();
      if (r.error) throw errorDe(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Borra una carpeta propia (las fijas las rechaza la base). */
export function useBorrarCarpeta(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("ds_carpetas").delete().eq("id", id).select("id").maybeSingle();
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Nombra a alguien en una oficina (gestor o colaborador). */
export function useGuardarMiembro(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, rol }: { user_id: string; rol: "gestor" | "colaborador" }) => {
      const r = await supabase
        .from("ds_miembros")
        .upsert({ user_id, rol, oficina_id: oficina }, { onConflict: "user_id,oficina_id" })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      return r.data;
    },
    onSuccess: () => invalidar(client, oficina),
  });
}

/** Quita a alguien de una oficina. */
export function useQuitarMiembro(oficina: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("ds_miembros").delete().eq("id", id).select("id").maybeSingle();
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => invalidar(client, oficina),
  });
}
