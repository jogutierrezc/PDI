/* =============================================================================
   Convenios · datos (migración 0255). Una sola lectura trae todos los convenios
   (unos cientos): el tablero, el registro y los vencimientos trabajan sobre esa
   lista en el navegador. Cada cambio relevante deja una fila en conv_historial.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import { hoyBogota } from "../lib/permisos";
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
    mutationFn: async (a: { convenio: ConvenioNuevo; nota: string }): Promise<string> => {
      const r = await supabase.from("conv_convenios").insert(a.convenio).select("id").single();
      if (r.error) throw errorDe(r.error);
      const id = (r.data as { id: string }).id;
      await anotar(id, [{ texto: a.nota }]);
      return id;
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["conv"] }),
  });
}

export type CambiosConvenio = Partial<
  Pick<Convenio, "fecha_firma" | "fecha_terminacion" | "indefinido" | "pasos" | "pasos_fechas" | "cerrado" | "cerrado_en" | "carpeta_estado" | "carpeta_url" | "carpeta_solicitada_en" | "renovacion">
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
}

const LOTE = 100;

/**
 * Inserta los convenios del Excel por lotes. Si el código ya existe se deja como está (no se
 * pisa lo que alguien cambió en la plataforma): reimportar no duplica ni deshace nada.
 */
export function useImportarConvenios() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { filas: ConvenioNuevo[]; alAvanzar?: (hechos: number) => void }): Promise<ResultadoImportacion> => {
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
      return { nuevos, yaEstaban: a.filas.length - nuevos };
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ["conv"] }),
  });
}
