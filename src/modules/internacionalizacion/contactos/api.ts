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
  /** El correo lo confirmó Microsoft (migración 0171); a mano queda sin confirmar. */
  correo_verificado?: boolean;
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

async function llamar<T>(accion: string, token: string, cuerpo: Record<string, unknown> = {}, headers?: Record<string, string>): Promise<T> {
  const r = await supabase.functions.invoke("int-contactos", { body: { action: accion, token, web: "", ...cuerpo }, ...(headers ? { headers } : {}) });
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

/* ---------- Continuar con Microsoft ----------------------------------------------------- */

export interface DatosMicrosoft {
  nombre: string;
  correo: string;
}

const conJwt = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

/** Lo que Microsoft dice de la cuenta (nombre y correo), ya comprobado el dominio. No guarda nada. */
export const datosMicrosoft = (token: string, jwt: string) => llamar<DatosMicrosoft>("microsoft_datos", token, {}, conJwt(jwt));

/** Identifica a la persona con su cuenta de Microsoft: pide solo el cargo (y el campus si el enlace no lo fija). */
export const identificarMicrosoft = (token: string, jwt: string, d: { cargo: string; campus_id: string | null; nombre?: string }) =>
  llamar<Sesion>("identificar_microsoft", token, d, conJwt(jwt));

/** Abre Microsoft (proveedor Azure de Supabase) y vuelve a esta misma dirección. El navegador sale de la página. */
export async function iniciarMicrosoft(token: string): Promise<void> {
  marcarSalidaMicrosoft(token);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) {
    consumirRegresoMicrosoft(token);
    throw error;
  }
}

/** Cierra la sesión de Supabase de este navegador (solo local): quien entró por Microsoft no queda con una sesión de intranet. */
export async function cerrarSesionMicrosoft(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // sin sesión que cerrar
  }
}

/** El token de la sesión de Microsoft que dejó el regreso, si hay una. */
export async function tokenDeMicrosoft(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Marca que la persona salió hacia Microsoft desde este enlace, para reconocer su regreso (y no confundir una sesión de intranet). */
const llaveMs = (token: string) => `int-contactos-ms:${token}`;
export function marcarSalidaMicrosoft(token: string): void {
  try {
    window.sessionStorage.setItem(llaveMs(token), String(Date.now()));
  } catch {
    // sin almacenamiento: no se podrá reconocer el regreso
  }
}
/** ¿Volvió de Microsoft? Lee y borra la marca; vale 15 minutos. */
export function consumirRegresoMicrosoft(token: string): boolean {
  try {
    const t = Number(window.sessionStorage.getItem(llaveMs(token)));
    window.sessionStorage.removeItem(llaveMs(token));
    return Number.isFinite(t) && t > 0 && Date.now() - t < 15 * 60_000;
  } catch {
    return false;
  }
}

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
