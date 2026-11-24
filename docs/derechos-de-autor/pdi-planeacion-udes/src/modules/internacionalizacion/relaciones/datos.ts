/* =============================================================================
   Relaciones · datos (migración 0254). El directorio es la vista rel_directorio
   sobre int_filas (sin copia); lo demás son las plantillas, los envíos y la
   función rel-correos (validar, enviar un lote, probar).
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import type { Actividad, PlantillaCorreo } from "../../../../supabase/functions/rel-correos/plantilla";
import type { TipoContacto } from "../../../../supabase/functions/int-contactos/contactos";

export type EstadoCorreo = "ok" | "pend" | "dom" | "bad" | "nv";
export type Nivel = "ok" | "bad" | "nv" | "na";

export const ESTADO_CORREO: Record<EstadoCorreo, { texto: string; clase: string }> = {
  ok: { texto: "Verificado", clase: "ok" },
  pend: { texto: "Sin validar", clase: "idle" },
  dom: { texto: "Dominio sin servidor", clase: "warn" },
  bad: { texto: "Rechazado", clase: "bad" },
  nv: { texto: "No verificable", clase: "warn" },
};

export interface ContactoRel {
  id: string;
  hoja_id: string;
  periodo_id: string;
  campus_id: string;
  datos: Record<string, string>;
  origen: "manual" | "excel";
  canal: "interno" | "enlace";
  created_at: string;
  tipo: TipoContacto;
  nombre: string;
  cargo: string;
  institucion: string;
  pais: string;
  correo: string;
  correo_estado: EstadoCorreo;
  correo_detalle: { f?: Nivel; d?: Nivel; b?: Nivel; m?: Nivel; nota?: string };
  correo_fecha: string | null;
  baja: boolean;
  baja_fecha: string | null;
  duplicado: boolean;
}

export interface PlantillaRel extends PlantillaCorreo {
  id: string;
  nombre: string;
  actividad: Partial<Actividad>;
}

export interface EnvioRel {
  id: string;
  plantilla_nombre: string;
  asunto: string;
  cuerpo: string;
  usa_actividad: boolean;
  actividad: Partial<Actividad>;
  remitente: string;
  destino: "mailpit" | "smtp";
  estado: "activo" | "terminado" | "cancelado";
  total: number;
  enviados: number;
  fallidos: number;
  created_by: string;
  created_at: string;
}

export interface DestinoRel {
  id: string;
  envio_id: string;
  fila_id: string | null;
  correo: string;
  nombre: string;
  estado: "pendiente" | "enviando" | "enviado" | "fallo";
  motivo: string;
  enviado_en: string | null;
  created_at: string;
  rel_envios?: { plantilla_nombre: string; created_by: string; destino: string } | null;
}

interface ErrorBase {
  code?: string;
  message?: string;
}

/** Error legible; si faltan las tablas de la 0254, el aviso de migración. */
function errorDe(e: ErrorBase): Error {
  const falta = ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "") || /schema cache|does not exist/i.test(e.message ?? "");
  return falta ? new FaltaMigracion("Falta aplicar la migración 0254 (Relaciones de Internacionalización).") : new Error(e.message ?? "Error de la base de datos");
}

const PAGINA = 1000;
const COLUMNAS =
  "id, hoja_id, periodo_id, campus_id, datos, origen, canal, created_at, tipo, nombre, cargo, institucion, pais, correo, correo_estado, correo_detalle, correo_fecha, baja, baja_fecha, duplicado";

export const REL = {
  directorio: ["rel", "directorio"] as const,
  plantillas: ["rel", "plantillas"] as const,
  envios: ["rel", "envios"] as const,
};

export function useDirectorio() {
  return useQuery({
    queryKey: REL.directorio,
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<ContactoRel[]> => {
      const salida: ContactoRel[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await supabase.from("rel_directorio").select(COLUMNAS).order("created_at", { ascending: false }).range(desde, desde + PAGINA - 1);
        if (r.error) throw errorDe(r.error);
        const filas = (r.data ?? []) as unknown as ContactoRel[];
        salida.push(...filas);
        if (filas.length < PAGINA) break;
      }
      return salida;
    },
  });
}

/* ---------- Guardar un contacto (la fila de int_filas) ------------------------------------------- */

export interface ContactoParaGuardar {
  id?: string;
  hoja: string;
  periodo: string;
  campus: string;
  datos: Record<string, string>;
  /** El correo cambió o es nuevo: la validación anterior ya no vale. */
  reiniciarCorreo: boolean;
}

export function useGuardarContacto() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: ContactoParaGuardar) => {
      const r = await supabase.rpc("int_guardar_filas", {
        p_hoja: c.hoja,
        p_periodo: c.periodo,
        p_filas: [{ ...(c.id ? { id: c.id } : {}), campus_id: c.campus, datos: c.datos }],
        p_reemplazar: null,
        p_origen: "manual",
        p_archivo: null,
      });
      if (r.error) throw errorDe(r.error);
      if (c.id && c.reiniciarCorreo) {
        const u = await supabase.from("rel_contactos").upsert({ fila_id: c.id, correo_estado: "pend", correo_detalle: {}, correo_fecha: null }, { onConflict: "fila_id" });
        if (u.error) throw errorDe(u.error);
      }
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.directorio }),
  });
}

/** Marca o quita la baja de un contacto a mano. */
export function useCambiarBaja() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; baja: boolean }) => {
      const r = await supabase.from("rel_contactos").upsert({ fila_id: a.id, baja: a.baja, baja_fecha: a.baja ? new Date().toISOString() : null }, { onConflict: "fila_id" });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.directorio }),
  });
}

/** Bitácora de un contacto: qué se le envió, quién y cuándo. */
export function useBitacoraContacto(filaId: string | undefined) {
  return useQuery({
    queryKey: ["rel", "bitacora", filaId ?? ""],
    enabled: Boolean(filaId),
    retry: false,
    queryFn: async (): Promise<DestinoRel[]> => {
      const r = await supabase
        .from("rel_envio_destinos")
        .select("id, envio_id, fila_id, correo, nombre, estado, motivo, enviado_en, created_at, rel_envios(plantilla_nombre, created_by, destino)")
        .eq("fila_id", filaId ?? "")
        .order("created_at", { ascending: false })
        .limit(20);
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as DestinoRel[];
    },
  });
}

/* ---------- Plantillas ----------------------------------------------------------------------------- */

export function usePlantillasRel() {
  return useQuery({
    queryKey: REL.plantillas,
    retry: false,
    queryFn: async (): Promise<PlantillaRel[]> => {
      const r = await supabase.from("rel_plantillas").select("id, nombre, asunto, cuerpo, usa_actividad, actividad").order("created_at");
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as PlantillaRel[];
    },
  });
}

export function useGuardarPlantillaRel() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<PlantillaRel, "id"> & { id?: string }): Promise<string> => {
      const fila = { nombre: p.nombre.trim() || "Plantilla sin nombre", asunto: p.asunto, cuerpo: p.cuerpo, usa_actividad: p.usa_actividad, actividad: p.actividad };
      const r = p.id ? await supabase.from("rel_plantillas").update(fila).eq("id", p.id).select("id").single() : await supabase.from("rel_plantillas").insert(fila).select("id").single();
      if (r.error) throw errorDe(r.error);
      return (r.data as { id: string }).id;
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.plantillas }),
  });
}

export function useBorrarPlantillaRel() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("rel_plantillas").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.plantillas }),
  });
}

/* ---------- Envíos ----------------------------------------------------------------------------------- */

export function useEnviosRel() {
  return useQuery({
    queryKey: REL.envios,
    retry: false,
    queryFn: async (): Promise<EnvioRel[]> => {
      const r = await supabase
        .from("rel_envios")
        .select("id, plantilla_nombre, asunto, cuerpo, usa_actividad, actividad, remitente, destino, estado, total, enviados, fallidos, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as EnvioRel[];
    },
  });
}

export interface EnvioNuevo {
  plantilla: PlantillaCorreo & { nombre: string };
  remitente: string;
  destino: "mailpit" | "smtp";
  destinos: { fila_id: string; correo: string; nombre: string }[];
}

/** Arma el envío (una copia de la plantilla) y su lista de destinatarios; la función rel-correos lo va enviando. */
export function useCrearEnvio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (e: EnvioNuevo): Promise<string> => {
      const r = await supabase
        .from("rel_envios")
        .insert({ plantilla_nombre: e.plantilla.nombre, asunto: e.plantilla.asunto, cuerpo: e.plantilla.cuerpo, usa_actividad: e.plantilla.usa_actividad, actividad: e.plantilla.actividad, remitente: e.remitente, destino: e.destino, total: e.destinos.length })
        .select("id")
        .single();
      if (r.error) throw errorDe(r.error);
      const id = (r.data as { id: string }).id;
      for (let i = 0; i < e.destinos.length; i += 500) {
        const d = await supabase.from("rel_envio_destinos").insert(e.destinos.slice(i, i + 500).map((x) => ({ ...x, envio_id: id })));
        if (d.error) {
          await supabase.from("rel_envios").update({ estado: "cancelado" }).eq("id", id);
          throw errorDe(d.error);
        }
      }
      return id;
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.envios }),
  });
}

export function useCancelarEnvio() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("rel_envios").update({ estado: "cancelado" }).eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: REL.envios }),
  });
}

/* ---------- La función rel-correos ------------------------------------------------------------------- */

export class ErrorFuncion extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

export async function llamarRel<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("rel-correos", { body: cuerpo });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = "No se pudo conectar con el servicio de correos. Revise que la función rel-correos esté desplegada.";
    let codigo: string | undefined;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      codigo = j?.code;
    } catch {
      // Sin cuerpo JSON: queda el mensaje general.
    }
    throw new ErrorFuncion(mensaje, codigo);
  }
  return r.data as T;
}

export interface ResultadoValidacion {
  id: string;
  correo: string;
  f: Nivel;
  d: Nivel;
  b: Nivel;
  m: Nivel;
  estado: "ok" | "dom" | "bad" | "nv";
  nota: string;
}

export const validarCorreos = (ids: string[], plantilla: PlantillaCorreo | null, remitente: string) =>
  llamarRel<{ resultados: ResultadoValidacion[]; mailpit: boolean | null }>({ action: "validar", ids, ...(plantilla ? { plantilla, remitente } : {}) });

export interface RespuestaLote {
  estado: EnvioRel["estado"];
  espera: number;
  pendientes: number;
  enviados: number;
  fallidos: number;
  error?: string;
  code?: string;
}

export const enviarLote = (envioId: string) => llamarRel<RespuestaLote>({ action: "enviar", envio_id: envioId });

export const enviarPrueba = (a: { plantilla: PlantillaCorreo; destino: "mailpit" | "smtp"; para: string; remitente: string; fila_id?: string }) => llamarRel<{ ok: true }>({ action: "prueba", ...a });
