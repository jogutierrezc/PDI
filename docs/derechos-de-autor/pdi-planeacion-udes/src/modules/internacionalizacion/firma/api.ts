/* =============================================================================
   Firma electrónica de convenios · cliente de la función conv-firma (migración 0258).

   Un solo punto de entrada: POST /functions/v1/conv-firma con { action, ... }. Las acciones
   públicas no llevan sesión (el token del enlace identifica al firmante); las internas llevan
   la sesión del usuario del panel. Los errores se deciden por `code`, nunca por el texto.
   El contrato completo está en supabase/functions/conv-firma/CONTRATO.md.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";

export class ErrorFirma extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(code: string, mensaje: string, status: number, extra: Record<string, unknown> = {}) {
    super(mensaje);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
  get retryAfter(): number | undefined {
    const v = this.extra.retry_after;
    return typeof v === "number" ? v : undefined;
  }
  get intentosRestantes(): number | undefined {
    const v = this.extra.intentos_restantes;
    return typeof v === "number" ? v : undefined;
  }
}

const base = () => (import.meta.env.VITE_SUPABASE_URL ?? "http://localhost:54321").replace(/\/+$/, "");
const anon = () => import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key";

async function llamar<T>(cuerpo: Record<string, unknown>, conSesion: boolean): Promise<T> {
  const cabeceras: Record<string, string> = { "Content-Type": "application/json", apikey: anon() };
  if (conSesion) {
    const s = await supabase.auth.getSession();
    const token = s.data.session?.access_token;
    if (!token) throw new ErrorFirma("sin_sesion", "Su sesión terminó. Vuelva a iniciar sesión.", 401);
    cabeceras.Authorization = `Bearer ${token}`;
  }
  let respuesta: Response;
  try {
    respuesta = await fetch(`${base()}/functions/v1/conv-firma`, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) });
  } catch {
    throw new ErrorFirma("red", "No hay conexión con el servidor. Revise su internet e intente de nuevo.", 0);
  }
  let datos: Record<string, unknown> = {};
  try {
    datos = (await respuesta.json()) as Record<string, unknown>;
  } catch {
    /* cuerpo vacío o no JSON */
  }
  if (!respuesta.ok) {
    const { error, code, ...extra } = datos;
    throw new ErrorFirma(typeof code === "string" ? code : "error_interno", typeof error === "string" ? error : "Algo falló al atender el pedido.", respuesta.status, extra);
  }
  return datos as T;
}

export const publica = <T>(action: string, datos: Record<string, unknown> = {}) => llamar<T>({ action, ...datos }, false);
export const interna = <T>(action: string, datos: Record<string, unknown> = {}) => llamar<T>({ action, ...datos }, true);

/* ---------- tipos ---------- */

export type Rol = "UDES" | "contraparte" | "testigo";
export type Idioma = "es" | "en";
export type EstadoFirma = "borrador" | "enviada" | "en_firma" | "firmada" | "vencida" | "cancelada";
export type EstadoFirmante = "pendiente" | "abierto" | "verificado" | "firmado";
export type Falta = "codigo" | "lectura" | "firma" | "esperar_turno" | "nada";
export type MetodoFirma = "dibujo" | "movil" | "certificado";

export interface RespAbrir {
  estado_firma: EstadoFirma;
  estado_firmante: EstadoFirmante;
  idioma: Idioma;
  documento: { nombre: string; institucion: string; paginas: number };
  firmante: { nombre: string; correo_enmascarado: string; rol: Rol; rol_texto: string; codigo_identidad: string };
  firmantes: { orden: number; rol: Rol; rol_texto: string; nombre: string; firmado: boolean }[];
  vence_en: string;
  turno: boolean;
  falta: Falta;
  codigo_vigente: boolean;
  espera_codigo_s: number;
  sesion_vigente: boolean;
  firmado_en: string | null;
  codigo_verificacion: string;
}

export interface RespVerificarCodigo {
  sesion: string;
  sesion_vence_en: string;
  mensaje_firma: string;
  huella: string;
  paginas: number;
  algoritmos_certificado: string[];
}

export interface RespDocumento {
  url: string;
  vence_en_s: number;
  nombre: string;
  paginas: number;
  huella: string;
  mensaje_firma: string;
}

export interface RespFirmar {
  firmado: boolean;
  firmado_en: string;
  codigo_identidad: string;
  codigo_verificacion: string;
  pendientes: number;
  finalizado: boolean;
  finalizacion_pendiente: boolean;
  aviso?: string;
}

export interface RespVerificar {
  encontrado: boolean;
  codigo?: string;
  estado?: string;
  firmada_en?: string | null;
  huella_coincide?: boolean | null;
  documento?: { nombre: string; institucion: string; convenio: string };
  firmantes_total?: number;
  huella_documento?: string;
  huella_pdf_firmado?: string;
  sello?: { sujeto?: string; emisor?: string; serie?: string; hora_utc?: string; sello_de_tiempo?: unknown };
  firmantes?: {
    orden: number;
    rol: Rol;
    rol_texto: string;
    nombre: string;
    correo_enmascarado: string;
    codigo_identidad: string;
    metodo: MetodoFirma | null;
    firmado_en: string | null;
    pais: string | null;
    cert: { sujeto?: string; emisor?: string; serie?: string; desde?: string; hasta?: string; cadena?: string } | null;
    es_el_consultado: boolean;
  }[];
}

/** Lo que el panel ve de una solicitud (columnas no secretas). */
export interface FirmaFila {
  id: string;
  convenio_id: string;
  generado_id: string | null;
  estado: EstadoFirma;
  idioma: Idioma;
  secuencial: boolean;
  codigo_verificacion: string;
  nombre_documento: string;
  pdf_paginas: number | null;
  pdf_base_hash: string | null;
  pdf_firmado_hash: string | null;
  finalizacion: null | "pendiente" | "en_proceso" | "error" | "lista";
  finalizacion_error: string | null;
  vence_en: string | null;
  enviada_en: string | null;
  firmada_en: string | null;
  cancelada_en: string | null;
  cancelada_motivo: string | null;
  created_at: string;
}

export interface FirmanteFila {
  id: string;
  orden: number;
  rol: Rol;
  rol_texto: string;
  nombre: string;
  correo: string;
  idioma: Idioma;
  estado: EstadoFirmante;
  codigo_identidad: string | null;
  enlace_enviado_en: string | null;
  recordatorios: number;
  metodo: MetodoFirma | null;
  cert_sujeto: string | null;
  cert_emisor: string | null;
  cert_serie: string | null;
  cert_desde: string | null;
  cert_hasta: string | null;
  cert_cadena: string | null;
  pais: string | null;
  abierto_en: string | null;
  verificado_en: string | null;
  leido_en: string | null;
  firmado_en: string | null;
}

export type FirmaConFirmantes = FirmaFila & { firmantes: FirmanteFila[] };

export interface EventoFirma {
  id: string;
  firmante_id: string | null;
  tipo: string;
  ocurrio_en: string;
  ip: string | null;
  agente: string | null;
  detalle: Record<string, unknown> | null;
  hash: string | null;
}

export interface EstadoCertUdes {
  configurado: boolean;
  codigo?: string;
  mensaje?: string;
  origen?: "p12" | "servicio";
  sujeto?: string;
  emisor?: string;
  serie?: string;
  desde?: string;
  hasta?: string;
  vigente?: boolean;
  autofirmado?: boolean;
  sello_de_tiempo?: { configurado: boolean; servidor?: string };
  nota?: string;
  gotenberg?: { configurado: boolean; disponible?: boolean };
  correo?: { modo?: string; disponible?: boolean; error?: string };
}

export interface FirmanteNuevo {
  orden: number;
  rol: Rol;
  rol_texto?: string;
  nombre: string;
  correo: string;
  idioma: Idioma;
}
