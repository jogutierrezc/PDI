/* =============================================================================
   Correos · lo que la pantalla lee y escribe.

   Plantillas, remitentes y ajustes se leen y se guardan directo en la base
   (migración 0137): las políticas RLS dejan pasar solo a la administración.
   La contraseña SMTP va por su función (`correo_secret_set`) y nunca vuelve:
   solo sus 4 últimos. «Probar conexión» y «Enviar una prueba» los hace la
   función del servidor `correos`, que es la única que conoce la contraseña.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { PLANTILLAS, plantillaDeFila, type Identidad, type Plantilla, type Rol, type Seguridad } from "./servidor-logica";

export const MIGRACION = "0137";

export interface Remitente {
  nombre: string;
  direccion: string;
  responder: string;
}

export interface Ajustes {
  encendido: boolean;
  host: string;
  puerto: string;
  seguridad: Seguridad;
  usuario: string;
  topeHora: string;
  topePersona: string;
  dominios: string;
}

export interface Clave {
  hay: boolean;
  ultimos: string;
}

export interface Configuracion {
  plantillas: Plantilla[];
  remitentes: Record<Identidad, Remitente>;
  ajustes: Ajustes;
  clave: Clave;
}

export interface Envio {
  id: number;
  cuando: string;
  tipo: "cuenta" | "prueba" | "aviso";
  identidad: Identidad;
  plantilla: string;
  rol: string;
  para: string;
  resultado: "aceptado" | "rechazado" | "en_espera";
  motivo: string;
}

/** Una lectura que puede decir «falta la migración». */
export type Leido<T> = { falta: true } | { falta: false; datos: T };

type DbError = { code?: string; message?: string };

/** ¿El error es que la tabla o la función todavía no existen? */
function faltaMigracion(error: DbError | null): boolean {
  if (!error) return false;
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "") || /could not find the (table|function)|does not exist/i.test(error.message ?? "");
}

const fallo = (error: DbError, que: string): Error =>
  new Error(error.code === "42501" ? "Su rol no permite hacer esto." : `${que}${error.message ? ` (${error.message})` : ""}`);

const s = (v: unknown) => (typeof v === "string" ? v : "");

export const claves = {
  configuracion: ["correos", "configuracion"] as const,
  bitacora: ["correos", "bitacora"] as const,
};

export async function leerConfiguracion(): Promise<Leido<Configuracion>> {
  const [plantillas, remitentes, ajustes, clave] = await Promise.all([
    supabase.from("correo_templates" as never).select("*").order("sort"),
    supabase.from("correo_identities" as never).select("*"),
    supabase.from("correo_settings" as never).select("*").maybeSingle(),
    supabase.rpc("correo_secret_status" as never),
  ]);
  const primero = plantillas.error ?? remitentes.error ?? ajustes.error ?? clave.error;
  if (primero) {
    if (faltaMigracion(primero)) return { falta: true };
    throw fallo(primero, "No se pudo leer la configuración de los correos.");
  }

  const filas = (plantillas.data ?? []) as unknown as Record<string, unknown>[];
  // Las de fábrica, en su orden, con lo que haya guardado; una fila apagada se muestra con lo escrito, no con el original.
  const lista = PLANTILLAS.map((original) => plantillaDeFila({ ...(filas.find((f) => f.key === original.clave) ?? {}), active: true }, original.clave) ?? original);

  const porId = new Map(((remitentes.data ?? []) as unknown as Record<string, unknown>[]).map((r) => [s(r.id), r]));
  const remitente = (id: Identidad): Remitente => ({ nombre: s(porId.get(id)?.from_name), direccion: s(porId.get(id)?.address), responder: s(porId.get(id)?.reply_to) });

  const a = (ajustes.data ?? {}) as unknown as Record<string, unknown>;
  const k = (clave.data ?? {}) as unknown as { has?: boolean; last4?: string };
  return {
    falta: false,
    datos: {
      plantillas: lista,
      remitentes: { plan: remitente("plan"), pilo: remitente("pilo") },
      ajustes: {
        encendido: a.enabled !== false,
        host: s(a.smtp_host),
        puerto: String(a.smtp_port ?? 587),
        seguridad: a.smtp_security === "ssl" ? "ssl" : a.smtp_security === "none" ? "none" : "starttls",
        usuario: s(a.smtp_user),
        topeHora: String(a.hourly_limit ?? 200),
        topePersona: String(a.person_daily_limit ?? 5),
        dominios: Array.isArray(a.allowed_domains) ? a.allowed_domains.join(", ") : "",
      },
      clave: { hay: k.has === true, ultimos: s(k.last4) },
    },
  };
}

export async function guardarPlantilla(p: Plantilla): Promise<void> {
  const { error, data } = await supabase
    .from("correo_templates" as never)
    .update({ subject: p.asunto.trim(), preheader: p.previa.trim(), title: p.titulo.trim(), greeting: p.saludo.trim(), body: p.mensaje, button: p.boton.trim(), note: p.nota, role_bodies: p.roles, active: true } as never)
    .eq("key", p.clave)
    .select("key");
  if (error) {
    if (/correo_templates_(lines|message)/.test(error.message)) throw new Error("El asunto, el título, el botón y el mensaje no pueden quedar vacíos, y el asunto va en una sola línea.");
    throw fallo(error, "No se guardó la plantilla.");
  }
  if (!data || (data as unknown[]).length === 0) throw new Error("No se guardó: su rol no permite cambiar plantillas, o la plantilla ya no existe.");
}

export async function guardarConexion(ajustes: Ajustes, dominios: string[], remitentes: Record<Identidad, Remitente>): Promise<void> {
  const puesto = await supabase
    .from("correo_settings" as never)
    .update({
      enabled: ajustes.encendido,
      smtp_host: ajustes.host.trim().toLowerCase(),
      smtp_port: Number(ajustes.puerto),
      smtp_security: ajustes.seguridad,
      smtp_user: ajustes.usuario.trim(),
      hourly_limit: Number(ajustes.topeHora),
      person_daily_limit: Number(ajustes.topePersona),
      allowed_domains: dominios,
    } as never)
    .eq("id", true)
    .select("id");
  if (puesto.error) throw fallo(puesto.error, "No se guardó la conexión.");
  if (!puesto.data || (puesto.data as unknown[]).length === 0) throw new Error("No se guardó: su rol no permite cambiar la conexión.");
  for (const id of ["plan", "pilo"] as const) {
    const r = remitentes[id];
    const { error } = await supabase
      .from("correo_identities" as never)
      .update({ from_name: r.nombre.trim(), address: r.direccion.trim().toLowerCase(), reply_to: r.responder.trim().toLowerCase() } as never)
      .eq("id", id);
    if (error) throw fallo(error, "No se guardó el remitente.");
  }
}

/** Guarda la contraseña SMTP. Devuelve solo sus 4 últimos. */
export async function guardarClave(valor: string): Promise<string> {
  const { data, error } = await supabase.rpc("correo_secret_set" as never, { p_value: valor } as never);
  if (error) throw fallo(error, "No se guardó la contraseña.");
  return s(data);
}

export async function leerBitacora(): Promise<Leido<Envio[]>> {
  const { data, error } = await supabase
    .from("correo_log" as never)
    .select("id, created_at, kind, identity, template, rol, recipient, result, reason")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (faltaMigracion(error)) return { falta: true };
    throw fallo(error, "No se pudo leer la bitácora.");
  }
  return {
    falta: false,
    datos: ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
      id: Number(f.id),
      cuando: s(f.created_at),
      tipo: f.kind === "prueba" || f.kind === "aviso" ? f.kind : "cuenta",
      identidad: f.identity === "pilo" ? "pilo" : "plan",
      plantilla: s(f.template),
      rol: s(f.rol),
      para: s(f.recipient),
      resultado: f.result === "rechazado" || f.result === "en_espera" ? f.result : "aceptado",
      motivo: s(f.reason),
    })),
  };
}

/* --- La función del servidor ----------------------------------------------------------------- */

export interface Respuesta {
  ok: boolean;
  /** Lo que se le dice a la persona, haya salido bien o mal. */
  mensaje: string;
}

async function funcion(body: Record<string, unknown>): Promise<Respuesta> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; message?: string; error?: string }>("correos", { body });
  if (!error) return { ok: data?.ok === true, mensaje: data?.message ?? data?.error ?? "La función no respondió lo esperado." };
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    if (response.status === 404) return { ok: false, mensaje: "La función «correos» todavía no está desplegada en el servidor." };
    try {
      const leido = (await response.json()) as { error?: unknown };
      if (typeof leido?.error === "string") return { ok: false, mensaje: leido.error };
    } catch {
      // Respondió algo que no es JSON: vale el mensaje genérico.
    }
  }
  return { ok: false, mensaje: "No se pudo hablar con la función «correos». Revise que esté desplegada." };
}

/** Abre la conexión y se identifica, sin enviar nada. Prueba lo escrito en la pantalla con la contraseña guardada. */
export const probarConexion = (a: Ajustes) => funcion({ action: "probar", host: a.host.trim(), port: Number(a.puerto), security: a.seguridad, user: a.usuario.trim() });

/** Envía el borrador (sin guardarlo) a un correo, con la persona de ejemplo de ese rol. */
export const enviarPrueba = (para: string, borrador: Plantilla, rol: Rol) => funcion({ action: "prueba", to: para, clave: borrador.clave, rol, borrador });
