/* =============================================================================
   Gestión de convenios · datos (migraciones 0256 y 0257): reglas y configuración de
   avisos, plantillas de correo, bitácora, modelos de convenio, convenios generados y
   el bucket «conv-modelos». El envío real de correos lo hace la función conv-avisos.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { FaltaMigracion } from "../../rankings/noticias";
import type { Idioma } from "../../../../supabase/functions/conv-avisos/plantilla";

interface ErrorBase {
  code?: string;
  message?: string;
}

function errorDe(e: ErrorBase, migracion = "0256"): Error {
  const falta = ["42P01", "PGRST205", "PGRST202", "42883", "42703"].includes(e.code ?? "") || /schema cache|does not exist/i.test(e.message ?? "");
  if (falta) return new FaltaMigracion(`Falta aplicar la migración ${migracion} (Gestión de convenios de Internacionalización).`);
  if (e.code === "42501") return new Error("No tiene permiso para cambiar esto.");
  if (e.code === "23505") return new Error("Ya existe un registro con esos datos.");
  return new Error(e.message ?? "Error de la base de datos");
}

export const GEST = {
  config: ["gest", "config"] as const,
  reglas: ["gest", "reglas"] as const,
  plantillas: ["gest", "plantillas"] as const,
  bitacora: ["gest", "bitacora"] as const,
  modelos: ["gest", "modelos"] as const,
  generados: ["gest", "generados"] as const,
};

/* ---------- Avisos ---------------------------------------------------------------- */

export type DestinoAviso = "responsable" | "coordinacion" | "contacto" | "direccion";
export const DESTINOS: readonly { id: DestinoAviso; rotulo: string }[] = [
  { id: "responsable", rotulo: "Responsable del convenio" },
  { id: "coordinacion", rotulo: "Coordinación del programa" },
  { id: "contacto", rotulo: "Contacto de la institución" },
  { id: "direccion", rotulo: "Dirección de Internacionalización" },
];

export interface ConfigAvisos {
  activo: boolean;
  hora: string;
  solo_habiles: boolean;
  detener_renovacion: boolean;
  modo: "prueba" | "real";
  remitente: string;
  correo_direccion: string;
  tope_ejecucion: number;
}

export interface ReglaAviso {
  id: string;
  dias: number;
  activa: boolean;
  destinatarios: DestinoAviso[];
  plantilla_clave: string;
  orden: number;
}

export interface PlantillaCorreo {
  clave: string;
  idioma: Idioma;
  nombre: string;
  audiencia: "interna" | "externa" | "ambas";
  asunto: string;
  cuerpo: string;
  updated_at: string;
}

export interface EnvioAviso {
  id: string;
  convenio_id: string;
  regla_dias: number | null;
  fecha_vencimiento: string;
  destinatarios: { rol: string; correo: string; idioma: string; ok: boolean; error?: string }[];
  idioma: string | null;
  estado: "pendiente" | "enviado" | "error" | "rebote" | "sin_contacto";
  error: string | null;
  modo: "prueba" | "real";
  origen: "automatico" | "manual";
  created_at: string;
}

export function useConfigAvisos() {
  return useQuery({
    queryKey: GEST.config,
    retry: false,
    queryFn: async (): Promise<ConfigAvisos> => {
      const r = await supabase.from("conv_aviso_config").select("activo, hora, solo_habiles, detener_renovacion, modo, remitente, correo_direccion, tope_ejecucion").eq("id", true).maybeSingle();
      if (r.error) throw errorDe(r.error);
      if (!r.data) throw new FaltaMigracion("Falta aplicar la migración 0256 (Gestión de convenios de Internacionalización).");
      const d = r.data as unknown as ConfigAvisos;
      return { ...d, hora: String(d.hora).slice(0, 5) };
    },
  });
}

export function useGuardarConfig() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<ConfigAvisos>) => {
      const r = await supabase.from("conv_aviso_config").update(c).eq("id", true);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.config }),
  });
}

export function useReglas() {
  return useQuery({
    queryKey: GEST.reglas,
    retry: false,
    queryFn: async (): Promise<ReglaAviso[]> => {
      const r = await supabase.from("conv_aviso_reglas").select("id, dias, activa, destinatarios, plantilla_clave, orden").order("orden").order("dias", { ascending: false });
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as ReglaAviso[];
    },
  });
}

export function useGuardarRegla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; cambios: Partial<Pick<ReglaAviso, "dias" | "activa" | "destinatarios" | "plantilla_clave">> }) => {
      const r = await supabase.from("conv_aviso_reglas").update(a.cambios).eq("id", a.id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.reglas }),
  });
}

export function useNuevaRegla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (orden: number) => {
      const r = await supabase.from("conv_aviso_reglas").insert({ dias: 15, activa: false, destinatarios: ["responsable"], plantilla_clave: "aviso_interno", orden });
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.reglas }),
  });
}

export function useBorrarRegla() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.from("conv_aviso_reglas").delete().eq("id", id);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.reglas }),
  });
}

export function usePlantillasCorreo() {
  return useQuery({
    queryKey: GEST.plantillas,
    retry: false,
    queryFn: async (): Promise<PlantillaCorreo[]> => {
      const r = await supabase.from("conv_correo_plantillas").select("clave, idioma, nombre, audiencia, asunto, cuerpo, updated_at").order("nombre");
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as PlantillaCorreo[];
    },
  });
}

export function useGuardarPlantillaCorreo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (p: Pick<PlantillaCorreo, "clave" | "idioma" | "asunto" | "cuerpo">) => {
      const r = await supabase.from("conv_correo_plantillas").update({ asunto: p.asunto, cuerpo: p.cuerpo }).eq("clave", p.clave).eq("idioma", p.idioma);
      if (r.error) throw errorDe(r.error);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.plantillas }),
  });
}

export function useBitacoraAvisos() {
  return useQuery({
    queryKey: GEST.bitacora,
    retry: false,
    queryFn: async (): Promise<EnvioAviso[]> => {
      const r = await supabase
        .from("conv_aviso_envios")
        .select("id, convenio_id, regla_dias, fecha_vencimiento, destinatarios, idioma, estado, error, modo, origen, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (r.error) throw errorDe(r.error);
      return (r.data ?? []) as unknown as EnvioAviso[];
    },
  });
}

/* ---------- La función conv-avisos ------------------------------------------------------ */

export class ErrorAvisos extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

async function llamarAvisos<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await supabase.functions.invoke("conv-avisos", { body: cuerpo });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = "No se pudo conectar con el servicio de avisos. Revise que la función conv-avisos esté desplegada.";
    let codigo: string | undefined;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      codigo = j?.code;
    } catch {
      // Sin cuerpo JSON: queda el mensaje general.
    }
    throw new ErrorAvisos(mensaje, codigo);
  }
  return r.data as T;
}

export interface ResultadoEnvio {
  resultado: { convenio: string; institucion: string; estado: string; enviados: number; detalle?: string };
  modo: "prueba" | "real";
}

export function useEnviarAviso() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (a: { convenio_id: string; regla_id?: string }) => llamarAvisos<ResultadoEnvio>({ action: "enviar", ...a }),
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: GEST.bitacora });
      void cliente.invalidateQueries({ queryKey: ["conv"] });
    },
  });
}

export const enviarPruebaAviso = (a: { asunto: string; cuerpo: string; idioma: Idioma; para: string; destino: "mailpit" | "smtp"; convenio_id?: string }) => llamarAvisos<{ ok: true }>({ action: "prueba", ...a });

/* ---------- Modelos ---------------------------------------------------------------------- */

export type FuenteModelo = "editor" | "word";
export type IdiomaModelo = "es" | "en" | "bi";

export interface FirmanteModelo {
  orden: number;
  rol: string;
  metodos: string[];
}

export interface CampoPersonalizado {
  k: string;
  etiqueta: string;
}

export interface Modelo {
  id: string;
  nombre: string;
  tipo_documento: string;
  idioma: IdiomaModelo;
  version: number;
  estado: "borrador" | "vigente";
  fuente: FuenteModelo;
  contenido_html: string;
  archivo_ruta: string | null;
  archivo_nombre: string | null;
  archivo_hash: string | null;
  archivo_tamano: number | null;
  marcadores: string[];
  campos_personalizados: CampoPersonalizado[];
  logo_udes_ruta: string | null;
  firmantes: FirmanteModelo[];
  cajas_firma: { firmante: number; ancla: string }[];
  created_at: string;
  updated_at: string;
}

export interface ModeloNuevo {
  nombre: string;
  tipo_documento: string;
  idioma: IdiomaModelo;
  fuente: FuenteModelo;
  contenido_html?: string;
}

export function useModelos() {
  return useQuery({
    queryKey: GEST.modelos,
    retry: false,
    queryFn: async (): Promise<Modelo[]> => {
      const r = await supabase.from("conv_modelos").select("*").order("updated_at", { ascending: false });
      if (r.error) throw errorDe(r.error, "0257");
      return (r.data ?? []) as unknown as Modelo[];
    },
  });
}

export function useCrearModelo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (m: ModeloNuevo & Partial<Pick<Modelo, "archivo_ruta" | "archivo_nombre" | "archivo_hash" | "archivo_tamano" | "marcadores">> & { id?: string }): Promise<Modelo> => {
      const r = await supabase.from("conv_modelos").insert(m).select("*").single();
      if (r.error) throw errorDe(r.error, "0257");
      return r.data as unknown as Modelo;
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.modelos }),
  });
}

export type CambiosModelo = Partial<
  Pick<Modelo, "nombre" | "tipo_documento" | "idioma" | "version" | "estado" | "contenido_html" | "archivo_ruta" | "archivo_nombre" | "archivo_hash" | "archivo_tamano" | "marcadores" | "campos_personalizados" | "logo_udes_ruta" | "firmantes" | "cajas_firma">
>;

export function useActualizarModelo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; cambios: CambiosModelo }) => {
      const r = await supabase.from("conv_modelos").update(a.cambios).eq("id", a.id);
      if (r.error) throw errorDe(r.error, "0257");
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.modelos }),
  });
}

export function useBorrarModelo() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (m: Modelo) => {
      const r = await supabase.from("conv_modelos").delete().eq("id", m.id);
      if (r.error) throw errorDe(r.error, "0257");
      const rutas = [m.archivo_ruta, m.logo_udes_ruta].filter((x): x is string => Boolean(x));
      if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas);
    },
    onSuccess: () => void cliente.invalidateQueries({ queryKey: GEST.modelos }),
  });
}

/* ---------- Generados -------------------------------------------------------------------- */

export interface Generado {
  id: string;
  convenio_id: string;
  modelo_id: string | null;
  modelo_nombre: string;
  modelo_version: number;
  idioma: Idioma;
  formato: "docx" | "html";
  nombre: string;
  ruta: string;
  tamano: number;
  hash_sha256: string;
  estado: "listo_firma" | "en_firma" | "firmado";
  created_by: string | null;
  created_at: string;
}

export function useGenerados() {
  return useQuery({
    queryKey: GEST.generados,
    retry: false,
    queryFn: async (): Promise<Generado[]> => {
      const r = await supabase
        .from("conv_generados")
        .select("id, convenio_id, modelo_id, modelo_nombre, modelo_version, idioma, formato, nombre, ruta, tamano, hash_sha256, estado, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (r.error) throw errorDe(r.error, "0257");
      return (r.data ?? []) as unknown as Generado[];
    },
  });
}

export function useRegistrarGenerado() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (g: Omit<Generado, "created_by" | "created_at" | "estado"> & { valores: Record<string, string> }) => {
      const r = await supabase.from("conv_generados").insert(g);
      if (r.error) throw errorDe(r.error, "0257");
      const h = await supabase.from("conv_historial").insert({
        convenio_id: g.convenio_id,
        texto: `Documento generado con el modelo «${g.modelo_nombre}» (v${g.modelo_version}, ${g.idioma === "es" ? "español" : "inglés"}), listo para firma. Huella ${g.hash_sha256.slice(0, 12)}…`,
      });
      if (h.error) throw errorDe(h.error, "0255");
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: GEST.generados });
      void cliente.invalidateQueries({ queryKey: ["conv"] });
    },
  });
}

/* ---------- Storage ---------------------------------------------------------------------- */

export const BUCKET = "conv-modelos";

export async function subirArchivo(ruta: string, bytes: Uint8Array | Blob, tipo: string): Promise<void> {
  const cuerpo = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: tipo });
  const r = await supabase.storage.from(BUCKET).upload(ruta, cuerpo, { contentType: tipo, upsert: true });
  if (r.error) throw new Error(/not found|bucket/i.test(r.error.message) ? "Falta el bucket «conv-modelos»: aplique la migración 0257." : r.error.message);
}

export async function bajarArchivo(ruta: string): Promise<Uint8Array> {
  const r = await supabase.storage.from(BUCKET).download(ruta);
  if (r.error || !r.data) throw new Error(r.error?.message ?? "No se pudo descargar el archivo.");
  return new Uint8Array(await r.data.arrayBuffer());
}

/** Enlace temporal (1 h) a un archivo del bucket, para mostrar un logo guardado. */
export function useUrlFirmada(ruta: string | null | undefined) {
  return useQuery({
    queryKey: ["gest", "url", ruta ?? ""],
    enabled: Boolean(ruta),
    retry: false,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const r = await supabase.storage.from(BUCKET).createSignedUrl(ruta ?? "", 3600);
      return r.error ? null : r.data.signedUrl;
    },
  });
}
