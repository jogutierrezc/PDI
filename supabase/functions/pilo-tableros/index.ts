/* =============================================================================
   Edge Function · pilo-tableros

   Pilo Tableros: el diseñador y el narrador de los tableros del Warehouse UDES.

     estado    {}                                  → { ok, ai, motivo?, proveedor, modelo }
     proponer  { pedido }                          → { ok, propuesta }   páginas y visuales con medidas del catálogo
     narrar    { cifras }                          → { ok, narracion }   lectura escrita sobre cifras ya calculadas

   Reglas:
     · Solo con sesión y solo Planeación o más (wh_autorizado).
     · Pilo no calcula ni lee filas: recibe el catálogo de medidas o cifras agregadas (con la reserva de 5
       ya aplicada por la base) y esta función rechaza un cuerpo desmesurado.
     · Lo que Pilo proponga se depura contra el catálogo (un id inventado se descarta) y lo que narre se
       verifica contra las cifras: una cifra de más se le devuelve una vez; si insiste, sale con aviso.
     · El proveedor de IA es el de Mr. Pilo (pilo-rankingsod/proveedor.ts); la clave nunca sale de aquí.
       La bitácora es news_runs.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { elegirProveedor, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { AltoProveedor, crearIA } from "../pilo-informes/ia.ts";
import { leerNarracion, leerPropuesta, mensajesNarrar, mensajesProponer, validarNarrar, validarPedido } from "./propuesta.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FUENTE_BITACORA = "Pilo Tableros";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  let cuerpo: Record<string, unknown> = {};
  try {
    const texto = await request.text();
    if (texto.length > 120_000) return json({ error: "El cuerpo es demasiado grande." }, 413);
    cuerpo = JSON.parse(texto || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const accion = String(cuerpo.action ?? "");
  if (!["estado", "proponer", "narrar"].includes(accion)) return json({ error: "Acción desconocida." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const quien = await admin.auth.getUser(authorization.slice(7));
  if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);

  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const almacen = await db.rpc("wh_autorizado");
  if (almacen.error) {
    const falta = almacen.error.code === "PGRST202" || /wh_autorizado/.test(almacen.error.message);
    return json({ error: falta ? "Falta aplicar la migración 0155 (Warehouse UDES)." : almacen.error.message, code: falta ? "migracion" : undefined }, 500);
  }
  if (almacen.data !== true) return json({ error: "Pilo Tableros es del Warehouse, que es de Planeación." }, 403);

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
    if (accion === "proponer") {
      const pedido = validarPedido(cuerpo.pedido);
      if (!pedido.ok) return json({ error: pedido.error }, 400);
      const r = await ia.llamarVerificado(mensajesProponer(pedido.valor), 2400, (crudo) => leerPropuesta(crudo, pedido.valor));
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró un tablero que use el catálogo: ${r.error}`, code: "verificacion" }, 422);
      }
      await bitacora(1, 0, null);
      return json({ ok: true, propuesta: r.valor, ...enUso });
    }
    const cifras = validarNarrar(cuerpo.cifras);
    if (!cifras.ok) return json({ error: cifras.error }, 400);
    const r = await ia.llamarVerificado(mensajesNarrar(cifras.valor), 1800, (crudo) => leerNarracion(crudo, cifras.valor));
    if (!r.ok) {
      await bitacora(0, 1, r.error);
      return json({ error: `Pilo no logró una lectura que se apoye en las cifras: ${r.error}`, code: "verificacion" }, 422);
    }
    await bitacora(1, 0, null);
    return json({ ok: true, narracion: r.valor, ...enUso });
  } catch (e) {
    if (e instanceof AltoProveedor) {
      await bitacora(0, 1, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    await bitacora(0, 1, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo completar la petición." }, 500);
  }
});
