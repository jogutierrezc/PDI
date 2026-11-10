/* =============================================================================
   Edge Function · pilo-libro

   Pilo para el Libro de la Rendición de Cuentas (Encuestas con Pilo).

     estado   { encuesta_id }                        → { ok, ai, motivo? }
     narrar   { encuesta_id, paginas, tono, largo }  → { ok, textos: { clave: texto } }
     ods      { encuesta_id, aportes }               → { ok, ods: { idAporte: [n, …] } }

   Reglas:
     · Solo con sesión y solo quien puede editar esa encuesta (enc_puede_editar_encuesta).
     · Pilo no lee la base: recibe cifras ya calculadas (totales y cifras por dependencia) o los
       títulos y descripciones de los aportes. Nunca correos ni datos personales.
     · Lo que Pilo escriba se verifica contra los datos (una cifra de más se le devuelve una vez);
       si no pasa, el panel usa su plantilla de siempre.
     · El proveedor es el de Mr. Pilo (pilo-rankingsod/proveedor.ts). La clave y el modelo no salen de aquí:
       la respuesta no dice qué proveedor ni qué modelo se usó. Bitácora: news_runs.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { elegirProveedor, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { AltoProveedor, crearIA } from "../pilo-informes/ia.ts";
import { leerNarracion, leerOds, mensajesNarrar, mensajesOds, validarNarrar, validarOds } from "./texto.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FUENTE_BITACORA = "Pilo Libro";

async function atender(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  let cuerpo: Record<string, unknown> = {};
  try {
    const texto = await request.text();
    if (texto.length > 80_000) return json({ error: "El cuerpo es demasiado grande." }, 413);
    cuerpo = JSON.parse(texto || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const accion = String(cuerpo.action ?? "");
  if (!["estado", "narrar", "ods"].includes(accion)) return json({ error: "Acción desconocida." }, 400);
  const encuesta = String(cuerpo.encuesta_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(encuesta)) return json({ error: "Falta la encuesta." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const quien = await admin.auth.getUser(authorization.slice(7));
  if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);

  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const permiso = await db.rpc("enc_puede_editar_encuesta", { p_encuesta: encuesta });
  if (permiso.error) {
    const falta = permiso.error.code === "PGRST202" || /enc_puede_editar_encuesta/.test(permiso.error.message);
    return json({ error: falta ? "Falta aplicar la migración 0184 (editor de encuestas)." : permiso.error.message, code: falta ? "migracion" : undefined }, 500);
  }
  if (permiso.data !== true) return json({ error: "El libro lo edita quien puede editar la encuesta." }, 403);

  const [settings, secret, ajustes] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const destino = elegirProveedor(leerAjustesIA(ajustes.data as Record<string, unknown> | null), settings.data as Record<string, unknown> | null, secret.data as Record<string, unknown> | null);
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de Pilo no está lista.";

  if (accion === "estado") return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}) });
  if (motivo) return json({ error: motivo, code: "sin_ia" }, 503);

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
    if (accion === "narrar") {
      const pedido = validarNarrar(cuerpo);
      if (!pedido.ok) return json({ error: pedido.error }, 400);
      const r = await ia.llamarVerificado(mensajesNarrar(pedido.valor), 2200, (crudo) => leerNarracion(crudo, pedido.valor));
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró textos que se apoyen en las cifras: ${r.error}`, code: "verificacion" }, 422);
      }
      await bitacora(Object.keys(r.valor).length, 0, null);
      return json({ ok: true, textos: r.valor });
    }
    const pedido = validarOds(cuerpo);
    if (!pedido.ok) return json({ error: pedido.error }, 400);
    const r = await ia.llamarVerificado(mensajesOds(pedido.valor), 1800, (crudo) => leerOds(crudo, pedido.valor));
    if (!r.ok) {
      await bitacora(0, 1, r.error);
      return json({ error: `Pilo no logró clasificar los aportes: ${r.error}`, code: "verificacion" }, 422);
    }
    await bitacora(pedido.valor.length, 0, null);
    return json({ ok: true, ods: r.valor });
  } catch (e) {
    if (e instanceof AltoProveedor) {
      await bitacora(0, 1, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    await bitacora(0, 1, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo completar la petición." }, 500);
  }
}

Deno.serve(async (request: Request) => {
  try {
    return await atender(request);
  } catch (e) {
    const motivo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[pilo-libro] fallo interno: ${motivo.slice(0, 300)}`);
    return json({ error: "Pilo Libro falló por dentro.", code: "interno" }, 500);
  }
});
