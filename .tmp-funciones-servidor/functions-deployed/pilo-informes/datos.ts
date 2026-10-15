/* =============================================================================
   Todo el acceso a datos de pilo-informes, en un solo lugar (tablas informe_*
   de la migración 0153, unit_role_at de 0057, news_runs y el proveedor de IA).
   Si el esquema final cambia un nombre, se ajusta solo aquí.
   ========================================================================== */

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import type { EjemploCorpus, FilaEjemplo } from "./corpus.ts";
import type { CifraInforme } from "./redaccion.ts";

type DB = SupabaseClient<any, any, any>;
const PAGINA = 1000;

export const faltaMigracion = (e: { code?: string; message?: string } | null | undefined) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));

async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}

/* ---------- Quién llama ------------------------------------------------------ */

export async function leerPerfil(admin: DB, userId: string) {
  const [{ data: perfil }, { data: membresias }] = await Promise.all([
    admin.from("profiles").select("role, is_active").eq("id", userId).maybeSingle(),
    admin.from("unit_members").select("role").eq("profile_id", userId),
  ]);
  return { perfil: perfil as { role?: string; is_active?: boolean } | null, rolesUnidad: ((membresias ?? []) as { role: string }[]).map((m) => m.role) };
}

/** El papel de quien llama en una unidad, con la herencia del árbol (unit_role_at, con SU sesión). */
export async function rolEnUnidad(comoUsuario: DB, unitId: string): Promise<string | null> {
  const { data, error } = await comoUsuario.rpc("unit_role_at", { target: unitId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/* ---------- Proveedor (el de los rankings, 0146, sobre el de Mr. Pilo) ------- */

export async function leerProveedor(admin: DB) {
  const [{ data: settings }, { data: secret }, { data: ajustes }] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  return { settings: settings as Record<string, unknown> | null, secret: secret as Record<string, unknown> | null, ajustes: ajustes as Record<string, unknown> | null };
}

/* ---------- Instancias ------------------------------------------------------- */

export interface Instancia {
  id: string;
  ciclo_id: string;
  unit_id: string;
  plantilla: string;
  estado: string;
  anio: number;
  unidad: string;
}

export async function leerInstancia(admin: DB, id: string): Promise<Instancia | null> {
  const { data, error } = await admin.from("informe_instancias").select("id, ciclo_id, unit_id, plantilla, estado").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [ciclo, unidad] = await Promise.all([
    admin.from("informe_ciclos").select("anio").eq("id", data.ciclo_id).maybeSingle(),
    admin.from("units").select("name").eq("id", data.unit_id).maybeSingle(),
  ]);
  if (ciclo.error) throw ciclo.error;
  return { ...(data as Omit<Instancia, "anio" | "unidad">), anio: Number(ciclo.data?.anio) || new Date().getFullYear(), unidad: String(unidad.data?.name ?? "la unidad") };
}

/** La última decisión de Planeación sobre una sección (aprobado | devuelto), si la hay. */
export async function decisionDeSeccion(admin: DB, instanciaId: string, clave: string): Promise<string | null> {
  const { data, error } = await admin.from("informe_revisiones").select("decision").eq("instancia_id", instanciaId).eq("seccion_clave", clave).order("en", { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0]?.decision as string) ?? null;
}

export async function leerSecciones(admin: DB, instanciaId: string): Promise<{ clave: string; contenido: unknown; listo: boolean }[]> {
  return todas((a, b) => admin.from("informe_secciones").select("clave, contenido, listo").eq("instancia_id", instanciaId).order("orden").range(a, b));
}

export async function leerCifras(admin: DB, instanciaId: string): Promise<CifraInforme[]> {
  return todas((a, b) =>
    admin
      .from("informe_cifras")
      .select("clave, etiqueta, fuente_tipo, fuente_nombre, valor, visto, foto_valor, anterior, meta, incluida, justificacion, pilar")
      .eq("instancia_id", instanciaId)
      .order("clave")
      .range(a, b),
  );
}

/* ---------- Aprendizaje ------------------------------------------------------ */

export async function guardarBorrador(admin: DB, instanciaId: string, clave: string, borrador: string) {
  const { error } = await admin.from("informe_aprendizaje").insert({ instancia_id: instanciaId, seccion_clave: clave, borrador_pilo: borrador });
  if (error) throw error;
}

/** El texto final de la unidad en los borradores de Pilo de esa sección que aún no lo tienen. */
export async function completarFinal(admin: DB, instanciaId: string, clave: string, final: string): Promise<number> {
  const { data, error } = await admin.from("informe_aprendizaje").update({ final_unidad: final }).eq("instancia_id", instanciaId).eq("seccion_clave", clave).is("final_unidad", null).select("seccion_clave");
  if (error) throw error;
  return (data ?? []).length;
}

/* ---------- Corpus (informe_ejemplos) ---------------------------------------- */

const COLS_EJEMPLO = "origen, anio, plantilla, seccion_tipo, unidad_nombre, titulo, texto";

/** Los ejemplos aprobados de un tipo de sección (todas las plantillas; se eligen en corpus.ts). */
export async function leerEjemplos(admin: DB, tipo: string): Promise<EjemploCorpus[]> {
  const { data, error } = await admin.from("informe_ejemplos").select(COLS_EJEMPLO).eq("aprobado", true).eq("seccion_tipo", tipo).order("anio", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as EjemploCorpus[];
}

export async function leerCorpus(admin: DB): Promise<EjemploCorpus[]> {
  return todas((a, b) => admin.from("informe_ejemplos").select(COLS_EJEMPLO).eq("aprobado", true).order("hash").range(a, b));
}

/**
 * Inserta sin repetir: `hash` es columna calculada en la base (md5(texto), única),
 * así que no se envía; «on conflict (hash) do nothing». Devuelve cuántas eran nuevas.
 */
export async function insertarEjemplos(admin: DB, filas: FilaEjemplo[]): Promise<number> {
  let nuevos = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200).map(({ hash: _h, ...f }) => f);
    const { data, error } = await admin.from("informe_ejemplos").upsert(lote, { onConflict: "hash", ignoreDuplicates: true }).select("hash");
    if (error) throw error;
    nuevos += (data ?? []).length;
  }
  return nuevos;
}

export async function contarCorpus(admin: DB): Promise<number> {
  const { count, error } = await admin.from("informe_ejemplos").select("hash", { count: "exact", head: true }).eq("aprobado", true);
  if (error) throw error;
  return count ?? 0;
}

/* ---------- Bitácora (news_runs; no gasta el cupo de /pregunta) -------------- */

export const FUENTE_BITACORA = "Pilo redacta informes de gestión";

export async function bitacora(admin: DB, b: { inicio: number; llamadas: number; guardados: number; fallidos: number; error: string | null }) {
  if (!b.llamadas) return;
  await admin.from("news_runs").insert({
    started_at: new Date(b.inicio).toISOString(),
    finished_at: new Date().toISOString(),
    source: FUENTE_BITACORA,
    seen: b.llamadas,
    saved: b.guardados,
    skipped: b.fallidos,
    error: b.error ? b.error.slice(0, 300) : null,
  });
}
