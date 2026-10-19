/* =============================================================================
   Contactos · la API pública (función int-contactos, migración 0167).

   Sin cuenta: la página se abre con el token del enlace. Lo único que identifica a la
   persona es la sesión que le da la función al identificarse; vive en sessionStorage
   de su navegador (si lo cierra, se identifica de nuevo con el mismo correo y la
   sesión anterior deja de servir). Los errores traen el mensaje en español de la base.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import type { AccionFila, FilaEnvio, ResultadoFila, TipoContacto } from "../../../../supabase/functions/int-contactos/contactos";

export type EstadoInvitacion = "activa" | "pausada" | "vencida" | "periodo_cerrado";

export interface CampusPublico {
  id: string;
  name: string;
  code: string | null;
}

export interface InvitacionPublica {
  nombre: string;
  estado: EstadoInvitacion;
  vence: string;
  periodo: string;
  campus: CampusPublico | null;
  campuses: CampusPublico[];
  tipos: TipoContacto[];
  dominios: string[];
  limite: number;
}

export interface Sesion {
  aportante_id: string;
  sesion: string;
  nombre: string;
  cargo: string;
  correo: string;
  campus_id: string;
  enviados: number;
}

export interface RespuestaRevisar {
  resultados: ResultadoFila[];
  enviados: number;
  limite: number;
}

export interface RespuestaEnviar {
  resultados: ResultadoFila[];
  creadas: number;
  actualizadas: number;
  omitidas: number;
  errores: number;
  enviados: number;
  limite: number;
}

export interface MiContacto {
  id: string;
  tipo: TipoContacto;
  datos: Record<string, string>;
  origen: "manual" | "excel";
  archivo: string | null;
  creado: string;
}

export class ErrorContactos extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

async function llamar<T>(accion: string, token: string, cuerpo: Record<string, unknown> = {}): Promise<T> {
  const r = await supabase.functions.invoke("int-contactos", { body: { action: accion, token, web: "", ...cuerpo } });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = "No se pudo conectar. Revise su internet e intente de nuevo.";
    let codigo: string | undefined;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string }) : null;
      if (j?.error) mensaje = j.error;
      codigo = j?.code;
    } catch {
      // Sin cuerpo JSON: queda el mensaje general.
    }
    throw new ErrorContactos(mensaje, ctx?.status ?? 0, codigo);
  }
  return r.data as T;
}

export const infoInvitacion = (token: string) => llamar<InvitacionPublica>("info", token);

export const identificar = (token: string, d: { nombre: string; cargo: string; correo: string; campus_id: string | null }) =>
  llamar<Sesion>("identificar", token, d);

const conSesion = (s: Sesion) => ({ aportante_id: s.aportante_id, sesion: s.sesion });

export const revisar = (token: string, s: Sesion, tipo: TipoContacto, filas: FilaEnvio[]) =>
  llamar<RespuestaRevisar>("revisar", token, { ...conSesion(s), tipo, filas });

export const enviar = (token: string, s: Sesion, tipo: TipoContacto, filas: FilaEnvio[], origen: "manual" | "excel", archivo?: string) =>
  llamar<RespuestaEnviar>("enviar", token, { ...conSesion(s), tipo, filas, origen, archivo });

export const misContactos = (token: string, s: Sesion) => llamar<{ filas: MiContacto[]; limite: number }>("mis", token, conSesion(s));

export const quitarContactos = (token: string, s: Sesion, ids: string[]) => llamar<{ quitadas: number }>("quitar", token, { ...conSesion(s), ids });

/* ---------- La sesión en el navegador ------------------------------------------------- */

const llave = (token: string) => `int-contactos:${token}`;

export function leerSesion(token: string): Sesion | null {
  try {
    const t = window.sessionStorage.getItem(llave(token));
    return t ? (JSON.parse(t) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(token: string, s: Sesion): void {
  try {
    window.sessionStorage.setItem(llave(token), JSON.stringify(s));
  } catch {
    // Sin almacenamiento (navegación privada): la sesión dura mientras la página siga abierta.
  }
}

export function olvidarSesion(token: string): void {
  try {
    window.sessionStorage.removeItem(llave(token));
  } catch {
    // nada que olvidar
  }
}

/** Lo que dice la pantalla de cada acción. */
export const TEXTO_ACCION: Record<AccionFila, string> = { crear: "Nueva", actualizar: "Se actualizará", omitir: "Ya estaba", error: "Error" };

/** Una sesión vencida (401) pide volver a identificarse. */
export const sesionVencida = (e: unknown): boolean => e instanceof ErrorContactos && e.estado === 401;
