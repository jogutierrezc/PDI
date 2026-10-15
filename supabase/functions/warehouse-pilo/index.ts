/* =============================================================================
   Edge Function · warehouse-pilo

   El análisis de Pilo para el Monitor de alertas tempranas del Warehouse UDES
   (migraciones 0155–0159). Recibe un resumen AGREGADO —conteos por nivel,
   programas, materias críticas, evolución por corte—, y devuelve un análisis
   escrito: titular, resumen, hallazgos con su evidencia, acción y responsable,
   prioridades y límites. La lógica pura (el prompt con lo que dice el estudio
   de la UDES y la verificación de las cifras) está en analisis.ts, con pruebas
   en tests/warehouse/pilo.test.ts.

     estado   {}                              → { ok, ai, motivo?, proveedor, modelo }
     analizar { datos, pregunta? }            → { ok, analisis, proveedor, modelo }

   Reglas:
     · Solo con sesión y solo Planeación o más (wh_autorizado).
     · Pilo nunca recibe códigos de estudiante ni notas individuales, y esta
       función rechaza un cuerpo que no sea un resumen razonable.
     · Pilo no inventa cifras: lo que cite tiene que estar en los datos o en
       el estudio. Una cifra de más se le devuelve una vez; si insiste, el
       texto sale con el aviso que la señala.
     · El proveedor de IA es el de Mr. Pilo (pilo-rankingsod/proveedor.ts); la
       clave nunca sale de aquí. La bitácora es news_runs.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { elegirProveedor, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { AltoProveedor, crearIA } from "../pilo-informes/ia.ts";
import { leerAnalisis, mensajesAnalisis, validarDatos } from "./analisis.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FUENTE_BITACORA = "Pilo analiza alertas tempranas";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const accion = String(cuerpo.action ?? "");
  if (!["estado", "analizar"].includes(accion)) return json({ error: "Acción desconocida." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const quien = await admin.auth.getUser(authorization.slice(7));
  if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);

  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const permiso = await db.rpc("wh_autorizado");
  if (permiso.error) {
    const falta = permiso.error.code === "PGRST202" || /wh_autorizado/.test(permiso.error.message);
    return json({ error: falta ? "Falta aplicar la migración 0155 (Warehouse UDES)." : permiso.error.message, code: falta ? "migracion" : undefined }, 500);
  }
  if (permiso.data !== true) return json({ error: "Solo Planeación puede pedirle un análisis a Pilo." }, 403);

  // El proveedor de IA, el mismo de los informes y los rankings --------------------------
  const [settings, secret, ajustes] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const destino = elegirProveedor(leerAjustesIA(ajustes.data as Record<string, unknown> | null), settings.data as Record<string, unknown> | null, secret.data as Record<string, unknown> | null);
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de Pilo no está lista.";
  const enUso = { proveedor: destino.proveedor, modelo: destino.model };

  if (accion === "estado") return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}), ...enUso });
  if (motivo) return json({ error: motivo, code: "sin_ia", ...enUso }, 503);

  const datos = validarDatos(cuerpo.datos);
  if (!datos.ok) return json({ error: datos.error }, 400);
  const pregunta = typeof cuerpo.pregunta === "string" ? cuerpo.pregunta.replace(/\s+/g, " ").trim().slice(0, 400) : "";

  const settingsFila = settings.data as Record<string, unknown> | null;
  const ia = crearIA(destino, settingsFila?.system_role === "user" && destino.eleccion === "pilo");
  const bitacora = async (guardados: number, fallidos: number, error: string | null) => {
    if (!ia.llamadas()) return;
    await admin.from("news_runs").insert({
      started_at: new Date(ia.inicio).toISOString(),
      finished_at: new Date().toISOString(),
      source: FUENTE_BITACORA,
      seen: ia.llamadas(),
      saved: guardados,
      skipped: fallidos,
      error: error ? error.slice(0, 300) : null,
    });
  };

  try {
    const r = await ia.llamarVerificado(mensajesAnalisis(datos.valor, pregunta), 2200, (crudo) => leerAnalisis(crudo, datos.valor));
    if (!r.ok) {
      await bitacora(0, 1, r.error);
      return json({ error: `Pilo no logró un análisis que se apoye en los datos: ${r.error}`, code: "verificacion" }, 422);
    }
    await bitacora(1, 0, null);
    return json({ ok: true, analisis: r.valor, ...enUso });
  } catch (e) {
    if (e instanceof AltoProveedor) {
      await bitacora(0, 1, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    await bitacora(0, 1, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo completar el análisis." }, 500);
  }
});
