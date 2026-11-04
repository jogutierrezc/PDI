/* =============================================================================
   Convenios · datos (migración 0255). Una sola lectura trae todos los convenios
   (unos cientos): el tablero, el registro y los vencimientos trabajan sobre esa
   lista en el navegador. Cada cambio relevante deja una fila en conv_historial.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import { hoyBogota } from "../lib/permisos";
import { enlaceDeArchivo } from "../../udrive/datos";
import type { Convenio, ConvenioNuevo } from "./logica";

export interface HistorialConvenio {
  id: string;
  convenio_id: string;
  fecha: string;
  texto: string;
  autor: string | null;
  created_at: string;
}

interface ErrorBase {
  code?: string;
  message?: string;
}

function errorDe(e: ErrorBase): Error {
  const falta = ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /schema cache|does not exist/i.test(e.message ?? "");
  if (falta) return new FaltaMigracion("Falta aplicar la migración 0255 (Convenios de Internacionalización).");
  if (e.code === "23505") return new Error("Ya existe un convenio con ese código.");
  if (e.code === "42501") return new Error("No tiene permiso para cambiar los convenios.");
  return new Error(e.message ?? "Error de la base de datos");
}

export const CONV = {
  lista: ["conv", "lista"] as const,
  historial: (id: string) => ["conv", "historial", id] as const,
};

const PAGINA = 1000;

export function useConvenios() {
  return useQuery({
    queryKey: CONV.lista,
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<Convenio[]> => {
      const salida: Convenio[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await supabase
          .from("conv_convenios")
          .select("*")
          .order("codigo")
          .range(desde, desde + PAGINA - 1);
        if (r.error) throw errorDe(r.error);
        const filas = (r.data ?? []) as unknown as Convenio[];
        salida.push(...filas);
        if (filas.length < PAGINA) break;
      }
      return salida;
    },
  });
}

export function useHistorialConvenio(id: string | undefined) {
  return useQuery({
    queryKey: CONV.historial(id ?? ""),
    enabled: Boolean(id),
    retry: false,
    queryFn: async (): Promise<HistorialConvenio[]> => {
      const r = await supabase
        .from("conv_historial")
        .select("id, convenio_id, fecha, texto, autor, created_at")
        .eq("convenio_id", id ?? "")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as HistorialConvenio[];
    },
  });
}

export interface AnotacionHistorial {
  texto: string;
  /** «AAAA-MM-DD»; si falta, hoy. */
  fecha?: string;
}

async function anotar(convenioId: string, notas: AnotacionHistorial[]): Promise<void> {
  if (!notas.length) return;
  const r = await supabase.from("conv_historial").insert(notas.map((n) => ({ convenio_id: convenioId, texto: n.texto, fecha: n.fecha ?? hoyBogota() })));
  if (r.error) throw errorDe(r.error);
}

/** Crea un convenio y su primera anotación del historial. Devuelve el id. */
export function useCrearConvenio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { convenio: ConvenioNuevo; nota: string; carpetaUdrive?: boolean }): Promise<{ id: string; errorCarpeta: string | null }> => {
      const r = await supabase.from("conv_convenios").insert(a.convenio).select("id").single();
      if (r.error) throw errorDe(r.error);
      const id = (r.data as { id: string }).id;
      await anotar(id, [{ texto: a.nota }]);
      let errorCarpeta: string | null = null;
      if (a.carpetaUdrive) {
        try {
          await asegurarCarpeta(id);
        } catch (e) {
          errorCarpeta = e instanceof Error ? e.message : "No se pudo crear la carpeta.";
        }
      }
      return { id, errorCarpeta };
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["conv"] }),
  });
}

export type CambiosConvenio = Partial<
  Pick<Convenio, "fecha_firma" | "fecha_terminacion" | "indefinido" | "pasos" | "pasos_fechas" | "cerrado" | "cerrado_en" | "carpeta_estado" | "carpeta_url" | "renovacion" | "idioma">
>;

/** Cambia campos de un convenio y deja sus anotaciones en el historial. */
export function useActualizarConvenio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; cambios: CambiosConvenio; notas: AnotacionHistorial[] }) => {
      const r = await supabase.from("conv_convenios").update(a.cambios).eq("id", a.id);
      if (r.error) throw errorDe(r.error);
      await anotar(a.id, a.notas);
    },
    onSuccess: (_d, a) => {
      void cliente.invalidateQueries({ queryKey: CONV.lista });
      void cliente.invalidateQueries({ queryKey: CONV.historial(a.id) });
    },
  });
}

export interface ResultadoImportacion {
  nuevos: number;
  yaEstaban: number;
  /** Solo si se pidió crear carpetas en UDrive. */
  carpetas?: { creadas: number; fallidas: number; primerError: string | null };
}

const LOTE = 100;

/**
 * Inserta los convenios del Excel por lotes. Si el código ya existe se deja como está (no se
 * pisa lo que alguien cambió en la plataforma): reimportar no duplica ni deshace nada.
 */
export function useImportarConvenios() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { filas: ConvenioNuevo[]; crearCarpetas?: boolean; alAvanzar?: (hechos: number) => void; alAvanzarCarpetas?: (hechas: number, total: number) => void }): Promise<ResultadoImportacion> => {
      let nuevos = 0;
      for (let i = 0; i < a.filas.length; i += LOTE) {
        const lote = a.filas.slice(i, i + LOTE);
        const r = await supabase.from("conv_convenios").upsert(lote, { onConflict: "codigo", ignoreDuplicates: true }).select("id, estado_excel");
        if (r.error) throw errorDe(r.error);
        const puestos = (r.data ?? []) as unknown as { id: string; estado_excel: string | null }[];
        nuevos += puestos.length;
        if (puestos.length) {
          const h = await supabase.from("conv_historial").insert(puestos.map((p) => ({ convenio_id: p.id, fecha: hoyBogota(), texto: `Importado del Excel. Estado en el archivo: «${p.estado_excel || "sin dato"}».` })));
          if (h.error) throw errorDe(h.error);
        }
        a.alAvanzar?.(Math.min(i + LOTE, a.filas.length));
      }
      const salida: ResultadoImportacion = { nuevos, yaEstaban: a.filas.length - nuevos };
      if (a.crearCarpetas) {
        // Los convenios del archivo que quedaron sin carpeta (los que traen enlace conservan el suyo).
        const ids: string[] = [];
        const codigos = a.filas.map((f) => f.codigo);
        for (let i = 0; i < codigos.length; i += LOTE) {
          const q = await supabase.from("conv_convenios").select("id").in("codigo", codigos.slice(i, i + LOTE)).eq("carpeta_estado", "sin");
          if (q.error) throw errorDe(q.error);
          ids.push(...((q.data ?? []) as { id: string }[]).map((x) => x.id));
        }
        salida.carpetas = await crearCarpetasPorLotes(ids, a.alAvanzarCarpetas);
      }
      return salida;
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["conv"] }),
  });
}

/* ---------- Carpeta digital en UDrive --------------------------------------------------------- */

/** Asegura Internacionalización › Convenios › País › código · institución (función SQL conv_asegurar_carpeta) y devuelve el id de la carpeta. */
export async function asegurarCarpeta(convenioId: string): Promise<string> {
  const r = await supabase.rpc("conv_asegurar_carpeta", { p_convenio: convenioId });
  if (r.error) throw errorDe(r.error);
  return r.data as unknown as string;
}

const SIMULTANEAS = 4;

/** Crea las carpetas de varios convenios, unas pocas a la vez, y cuenta los éxitos y fallos sin detenerse por uno. */
export async function crearCarpetasPorLotes(ids: readonly string[], alAvanzar?: (hechas: number, total: number) => void) {
  let creadas = 0;
  let fallidas = 0;
  let primerError: string | null = null;
  let hechas = 0;
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < ids.length) {
      const id = ids[siguiente++];
      try {
        await asegurarCarpeta(id);
        creadas++;
      } catch (e) {
        fallidas++;
        primerError ??= e instanceof Error ? e.message : "Error desconocido";
      }
      alAvanzar?.(++hechas, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, ids.length) }, trabajador));
  return { creadas, fallidas, primerError };
}

export function useCrearCarpetaUdrive() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => asegurarCarpeta(id),
    onSuccess: (_d, id) => {
      void cliente.invalidateQueries({ queryKey: CONV.lista });
      void cliente.invalidateQueries({ queryKey: CONV.historial(id) });
    },
  });
}

export interface ArchivoConvenio {
  id: string;
  tipo: "archivo" | "tabla" | "grafica" | "cruce" | "documento";
  nombre: string;
  mime: string | null;
  tamano: number | null;
  ruta_storage: string | null;
  updated_at: string;
}

/** Los archivos de la carpeta UDrive del convenio (los que RLS de UDrive deja ver). */
export function useArchivosConvenio(carpetaId: string | null | undefined) {
  return useQuery({
    queryKey: ["conv", "archivos", carpetaId ?? ""],
    enabled: Boolean(carpetaId),
    retry: false,
    queryFn: async (): Promise<ArchivoConvenio[]> => {
      const r = await supabase
        .from("drive_archivos")
        .select("id, tipo, nombre, mime, tamano, ruta_storage, updated_at")
        .eq("carpeta_id", carpetaId ?? "")
        .is("borrado_en", null)
        .order("updated_at", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as ArchivoConvenio[];
    },
  });
}

/** Abre un archivo subido (enlace firmado de UDrive) en otra pestaña. */
export async function abrirArchivoSubido(ruta: string): Promise<void> {
  const url = await enlaceDeArchivo(ruta);
  window.open(url, "_blank", "noopener,noreferrer");
}
