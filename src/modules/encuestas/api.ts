/* =============================================================================
   Encuestas con Pilo · acceso a datos.

   Dos puertas:
     · el panel interno lee y actualiza las tablas enc_* (0179) con el cliente
       de Supabase; la base decide con RLS (función «encuestas»);
     · la página pública habla solo con la función Edge `encuestas`, con el
       token de Microsoft en la cabecera. El correo sale del token, no del cuerpo.

   Mientras database.ts no traiga las tablas, el cliente se usa sin tipos aquí
   y solo aquí (`tabla`); el resto del módulo trabaja con tipos.ts.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { Aporte, CambiosEncuesta, Cifra, Encuesta, EstadoAporte, InfoEncuesta, AporteEnvio, CuentaMicrosoft, RespuestaEnvio } from "./tipos";
import { cuerpoEnvio } from "./lib/validacion";

/** El cliente sin tipos de tabla: el único cast del módulo. */
const tabla = (nombre: "enc_encuestas" | "enc_aportes" | "enc_cifras") => (supabase as unknown as SupabaseClient).from(nombre);

const PAGINA = 1000;

export class ErrorEncuestas extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
    readonly codigo?: string,
    /** Ruta del dato inválido, p. ej. «aportes[2].cifras[1].valor». */
    readonly campo?: string,
  ) {
    super(mensaje);
  }
}

/** ¿Falta aplicar la migración 0179? */
export class FaltaMigracionEncuestas extends Error {
  constructor() {
    super("Falta aplicar la migración 0179 (Encuestas con Pilo).");
  }
}

interface ErrorBase {
  code?: string;
  message?: string;
}

function errorDe(e: ErrorBase): Error {
  const falta = ["42P01", "PGRST205"].includes(e.code ?? "") || /enc_.*does not exist|schema cache/i.test(e.message ?? "");
  return falta ? new FaltaMigracionEncuestas() : new Error(e.message ?? "Error de la base de datos");
}

/* ---------- Panel interno ---------- */

export async function leerEncuestas(): Promise<Encuesta[]> {
  const r = await tabla("enc_encuestas").select("*").order("created_at", { ascending: true });
  if (r.error) throw errorDe(r.error);
  return (r.data ?? []) as Encuesta[];
}

interface AporteConCifras extends Omit<Aporte, "cifras"> {
  enc_cifras: Cifra[] | null;
}

export async function leerAportes(encuestaId: string): Promise<Aporte[]> {
  const salida: Aporte[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await tabla("enc_aportes")
      .select("*, enc_cifras(*)")
      .eq("encuesta_id", encuestaId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (r.error) throw errorDe(r.error);
    const filas = (r.data ?? []) as AporteConCifras[];
    for (const { enc_cifras, ...a } of filas) salida.push({ ...a, cifras: (enc_cifras ?? []).map((c) => ({ ...c, valor: Number(c.valor) })) });
    if (filas.length < PAGINA) break;
  }
  return salida;
}

export async function cambiarEstado(aporteId: string, estado: EstadoAporte): Promise<void> {
  const r = await tabla("enc_aportes").update({ estado }).eq("id", aporteId);
  if (r.error) throw errorDe(r.error);
}

export async function guardarEncuesta(id: string, cambios: Partial<CambiosEncuesta> & { abierta?: boolean }): Promise<void> {
  const r = await tabla("enc_encuestas").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id);
  if (r.error) throw errorDe(r.error);
}

/* ---------- Página pública (función Edge `encuestas`) ---------- */

async function llamar<T>(accion: string, cuerpo: Record<string, unknown>, jwt?: string): Promise<T> {
  const r = await supabase.functions.invoke("encuestas", { body: { accion, ...cuerpo }, ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}) });
  if (r.error) {
    const ctx = (r.error as { context?: Response }).context;
    let mensaje = "No se pudo conectar. Revise su internet e intente de nuevo.";
    let codigo: string | undefined;
    let campo: string | undefined;
    try {
      const j = ctx ? ((await ctx.json()) as { error?: string; code?: string; campo?: string }) : null;
      if (j?.error) mensaje = j.error;
      codigo = j?.code;
      campo = j?.campo;
    } catch {
      // Sin cuerpo JSON: queda el mensaje general.
    }
    const estado = ctx?.status ?? 0;
    if (estado === 404) mensaje = "Esta encuesta no existe. Revise el enlace.";
    else if (estado === 403 && codigo === "cerrada") mensaje = "Esta encuesta ya no recibe respuestas.";
    else if (estado === 500 && codigo === "migracion") mensaje = "La encuesta todavía no está lista en el servidor. Avise a Planeación Institucional.";
    throw new ErrorEncuestas(mensaje, estado, codigo, campo);
  }
  return r.data as T;
}

export const infoEncuesta = async (slug: string): Promise<InfoEncuesta> => {
  const r = await llamar<{ encuesta: InfoEncuesta }>("info", { slug });
  return r.encuesta;
};

/** Lo que Microsoft dice de la cuenta (correo y nombre), ya comprobado el dominio. No guarda nada. */
export const datosMicrosoft = (slug: string, jwt: string) => llamar<CuentaMicrosoft>("microsoft_datos", { slug }, jwt);

export const enviarAportes = (slug: string, jwt: string, dependencia: string, aportes: readonly AporteEnvio[]) =>
  llamar<RespuestaEnvio>("enviar", cuerpoEnvio(slug, dependencia, aportes), jwt);

/** Una sesión de Microsoft vencida o inválida: hay que volver a confirmar. */
export const sesionVencida = (e: unknown): boolean => e instanceof ErrorEncuestas && (e.estado === 401 || (e.estado === 403 && e.codigo !== "cerrada"));
/** La encuesta se cerró (o no existe) mientras la persona escribía. */
export const esCerrada = (e: unknown): boolean => e instanceof ErrorEncuestas && ((e.estado === 403 && e.codigo === "cerrada") || e.estado === 404);
/** El error es de red (no llegó a la función): se puede reintentar sin perder nada. */
export const esDeRed = (e: unknown): boolean => e instanceof ErrorEncuestas && e.estado === 0;
