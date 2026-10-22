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
import type { Aporte, BitacoraFila, CambiosEncuesta, Cifra, EditorEncuesta, Encuesta, EstadoAporte, InfoEncuesta, AporteEnvio, CuentaMicrosoft, RespuestaEnvio, RespuestaModelo, Version } from "./tipos";
import type { Estructura, Valores } from "./lib/estructura";
import { cuerpoEnvio } from "./lib/validacion";

/** El cliente sin tipos de tabla: el único cast del módulo. */
const tabla = (nombre: "enc_encuestas" | "enc_aportes" | "enc_cifras" | "enc_versiones" | "enc_respuestas" | "enc_bitacora") => (supabase as unknown as SupabaseClient).from(nombre);

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

/** Las respuestas vigentes (las borradas no salen) o, con `papelera`, solo las borradas. */
export async function leerAportes(encuestaId: string, papelera = false): Promise<Aporte[]> {
  const salida: Aporte[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const base = tabla("enc_aportes").select("*, enc_cifras(*)").eq("encuesta_id", encuestaId);
    const r = await (papelera ? base.not("borrado_en", "is", null) : base.is("borrado_en", null))
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

/** Borrado lógico: la respuesta va a la papelera 30 días. */
export async function borrarAporte(id: string, motivo?: string): Promise<void> {
  const r = await (supabase as unknown as SupabaseClient).rpc("enc_borrar_aporte", { p_id: id, p_motivo: motivo?.trim() || null });
  if (r.error) throw errorDe(r.error);
}

export async function restaurarAporte(id: string): Promise<void> {
  const r = await (supabase as unknown as SupabaseClient).rpc("enc_restaurar_aporte", { p_id: id });
  if (r.error) throw errorDe(r.error);
}

/** Borra de verdad lo que lleva más de 30 días en la papelera; devuelve cuántas. */
export async function purgarPapelera(): Promise<number> {
  const r = await (supabase as unknown as SupabaseClient).rpc("enc_purgar_borrados");
  if (r.error) throw errorDe(r.error);
  return Number(r.data ?? 0);
}

/** Lo que el panel puede cambiar de una encuesta (las columnas con permiso de escritura, 0179 y 0184). */
export type AjustesEncuesta = Partial<CambiosEncuesta> &
  Partial<Pick<Encuesta, "abierta" | "acceso" | "dominios_permitidos" | "una_por_persona" | "abre_el" | "limite_respuestas" | "mensaje_cierre" | "estado" | "modo_llenado" | "config_pilo">>;

export async function guardarEncuesta(id: string, cambios: AjustesEncuesta): Promise<void> {
  const r = await tabla("enc_encuestas").update(cambios).eq("id", id);
  if (r.error) throw errorDe(r.error);
}

/* ---------- Página pública (función Edge `encuestas`) ---------- */

// Sin token de Microsoft va la clave anónima: una sesión vieja guardada en el navegador no debe tumbar la página pública.
async function llamar<T>(accion: string, cuerpo: Record<string, unknown>, jwt?: string): Promise<T> {
  const r = await supabase.functions.invoke("encuestas", { body: { accion, ...cuerpo }, headers: { Authorization: `Bearer ${jwt ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` } });
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

/** Lo que Microsoft dice de la cuenta (correo y nombre), ya comprobado el dominio, y un pase firmado para el envío: la sesión de Microsoft se cierra enseguida. No guarda nada. */
export const datosMicrosoft = (slug: string, jwt: string) => llamar<CuentaMicrosoft & { pase: string }>("microsoft_datos", { slug }, jwt);

export const enviarAportes = (slug: string, pase: string, dependencia: string, aportes: readonly AporteEnvio[]) =>
  llamar<RespuestaEnvio>("enviar", { ...cuerpoEnvio(slug, dependencia, aportes), pase });

/** Verificación contra robots de la encuesta abierta: una cuenta sencilla y su pase. */
export const pedirReto = (slug: string) => llamar<{ pregunta: string; pase: string }>("reto", { slug });

export interface CuerpoRespuesta {
  valores: Valores;
  /** Con Microsoft: el pase de datosMicrosoft. */
  pase?: string;
  /** Abierta: el reto y su respuesta. */
  reto_pase?: string;
  reto_respuesta?: string;
  nombre?: string;
  consentimiento?: boolean;
}

/** Envía una respuesta de una encuesta del modelo nuevo. */
export const enviarRespuesta = (slug: string, c: CuerpoRespuesta) => llamar<{ ok: true; id: string }>("responder", { ...c, web: "" });

/** Una sesión de Microsoft vencida o inválida: hay que volver a confirmar. */
export const sesionVencida = (e: unknown): boolean => e instanceof ErrorEncuestas && (e.estado === 401 || (e.estado === 403 && e.codigo !== "cerrada"));
/** La encuesta se cerró (o no existe) mientras la persona escribía. */
export const esCerrada = (e: unknown): boolean => e instanceof ErrorEncuestas && ((e.estado === 403 && e.codigo === "cerrada") || e.estado === 404);
/** El error es de red (no llegó a la función): se puede reintentar sin perder nada. */
export const esDeRed = (e: unknown): boolean => e instanceof ErrorEncuestas && e.estado === 0;

/* ---------- Editor de encuestas (0184) ---------- */

const rpc = () => supabase as unknown as SupabaseClient;

export async function leerVersiones(encuestaId: string): Promise<Version[]> {
  const r = await tabla("enc_versiones").select("*").eq("encuesta_id", encuestaId).order("numero", { ascending: false });
  if (r.error) throw errorDe(r.error);
  return (r.data ?? []) as Version[];
}

export async function guardarBorrador(encuestaId: string, estructura: Estructura, nota = ""): Promise<void> {
  const r = await rpc().rpc("enc_guardar_borrador", { p_encuesta: encuestaId, p_estructura: estructura, p_nota: nota });
  if (r.error) throw errorDe(r.error);
}

export async function publicarVersion(encuestaId: string, nota = ""): Promise<void> {
  const r = await rpc().rpc("enc_publicar", { p_encuesta: encuestaId, p_nota: nota });
  if (r.error) throw errorDe(r.error);
}

export async function crearEncuesta(slug: string, titulo: string, estructura: Estructura, plantilla: string | null): Promise<string> {
  const r = await rpc().rpc("enc_crear_encuesta", { p_slug: slug, p_titulo: titulo, p_estructura: estructura, p_plantilla: plantilla });
  if (r.error) throw errorDe(r.error);
  return r.data as string;
}

export async function duplicarEncuesta(id: string, slug: string, titulo: string): Promise<string> {
  const r = await rpc().rpc("enc_duplicar_encuesta", { p_id: id, p_slug: slug, p_titulo: titulo });
  if (r.error) throw errorDe(r.error);
  return r.data as string;
}

export async function editoresDe(encuestaId: string): Promise<EditorEncuesta[]> {
  const r = await rpc().rpc("enc_editores_de", { p_encuesta: encuestaId });
  if (r.error) throw errorDe(r.error);
  return (r.data ?? []) as EditorEncuesta[];
}

export async function compartirEncuesta(encuestaId: string, correo: string, rol: "editor" | "lector"): Promise<void> {
  const r = await rpc().rpc("enc_compartir", { p_encuesta: encuestaId, p_correo: correo, p_rol: rol });
  if (r.error) throw errorDe(r.error);
}

export async function quitarEditor(encuestaId: string, usuarioId: string): Promise<void> {
  const r = await rpc().rpc("enc_quitar_editor", { p_encuesta: encuestaId, p_usuario: usuarioId });
  if (r.error) throw errorDe(r.error);
}

export async function leerBitacora(encuestaId: string): Promise<BitacoraFila[]> {
  const r = await tabla("enc_bitacora").select("*").eq("encuesta_id", encuestaId).order("en", { ascending: false }).limit(60);
  if (r.error) throw errorDe(r.error);
  return (r.data ?? []) as BitacoraFila[];
}

interface RespuestaConValores extends Omit<RespuestaModelo, "valores"> {
  enc_valores: { pregunta_id: string; valor: Valores[string] }[] | null;
}

/** Las respuestas del modelo nuevo: las vigentes o, con `papelera`, las borradas. */
export async function leerRespuestas(encuestaId: string, papelera = false): Promise<RespuestaModelo[]> {
  const salida: RespuestaModelo[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const base = tabla("enc_respuestas").select("*, enc_valores(pregunta_id, valor)").eq("encuesta_id", encuestaId);
    const r = await (papelera ? base.not("borrado_en", "is", null) : base.is("borrado_en", null)).order("created_at", { ascending: true }).order("id", { ascending: true }).range(desde, desde + PAGINA - 1);
    if (r.error) throw errorDe(r.error);
    const filas = (r.data ?? []) as RespuestaConValores[];
    for (const { enc_valores, ...x } of filas) salida.push({ ...x, valores: Object.fromEntries((enc_valores ?? []).map((v) => [v.pregunta_id, v.valor])) });
    if (filas.length < PAGINA) break;
  }
  return salida;
}

export async function cambiarEstadoRespuesta(id: string, estado: EstadoAporte): Promise<void> {
  const r = await tabla("enc_respuestas").update({ estado }).eq("id", id);
  if (r.error) throw errorDe(r.error);
}

export async function borrarRespuesta(id: string, motivo?: string): Promise<void> {
  const r = await rpc().rpc("enc_borrar_respuesta", { p_id: id, p_motivo: motivo?.trim() || null });
  if (r.error) throw errorDe(r.error);
}

export async function restaurarRespuesta(id: string): Promise<void> {
  const r = await rpc().rpc("enc_restaurar_respuesta", { p_id: id });
  if (r.error) throw errorDe(r.error);
}

/* ---------- Capa de Pilo: pedir un borrador a la IA ---------- */

export class SinSugerencia extends Error {
  constructor(
    mensaje: string,
    readonly motivo: "apagada" | "sin_sesion" | "error",
  ) {
    super(mensaje);
  }
}

/** Un borrador de la explicación que Pilo da de un dato (pilo-ia, action «sugerir»). Nunca se aplica solo. */
export async function sugerirExplicacion(pregunta: { tipo: string; enunciado: string; apoyo?: string; opciones?: string[]; unidad?: string; encuesta?: string }): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ explicacion?: string }>("pilo-ia", { body: { action: "sugerir", portal: "encuestas", pregunta } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensaje = "";
    try {
      mensaje = ((await ctx?.json()) as { error?: string })?.error ?? "";
    } catch {
      // sin cuerpo
    }
    const estado = ctx?.status ?? 0;
    if (estado === 401 || /inicie sesión/i.test(mensaje)) throw new SinSugerencia(mensaje, "sin_sesion");
    if (estado === 403 || estado === 503 || /apagado|no está conectado|aún no/i.test(mensaje)) throw new SinSugerencia(mensaje, "apagada");
    throw new SinSugerencia(mensaje, "error");
  }
  const t = data?.explicacion?.trim();
  if (!t) throw new SinSugerencia("", "error");
  return t;
}

/** Cuántas respuestas vigentes tiene cada encuesta (aportes de la vieja + respuestas del modelo nuevo). */
export async function contarRespuestas(ids: readonly string[]): Promise<Record<string, number>> {
  const cuenta = async (nombre: "enc_aportes" | "enc_respuestas", id: string): Promise<number> => {
    const r = await tabla(nombre).select("id", { count: "exact", head: true }).eq("encuesta_id", id).is("borrado_en", null);
    return r.error ? 0 : (r.count ?? 0);
  };
  const filas = await Promise.all(ids.map(async (id) => [id, (await cuenta("enc_aportes", id)) + (await cuenta("enc_respuestas", id))] as const));
  return Object.fromEntries(filas);
}
