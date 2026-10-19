/* =============================================================================
   Edge Function · informe-plan

   Trae el Plan de Trabajo de la decanatura (API «Plan de Trabajo Decanatura
   UDES 2026», solo lectura) para la sección «Objetivos y metas» y «Resultados
   por dimensión» de Mi informe (src/modules/informes).

   La clave de la API vive en el secreto PLAN_API_KEY de la función; nunca
   llega al navegador. Solo devuelve las filas de la facultad de la unidad.

     { unit_id }  → { facultad, decano, plan, acciones, actividades, seguimientos, traido_en }

   Reglas:
     · Solo con sesión. Planeación o la administración, o quien tenga algún
       papel en la unidad (unit_role_at, con herencia).
     · La unidad debe ser una facultad con código de la API (FCS, FIT, FCMS,
       FCN, FCAV, FCEAC o CFTT); si no, 404.
     · Sin corte: la API devuelve el último seguimiento guardado por acción.

   Secretos (los pone el administrador, no el código):
     supabase secrets set PLAN_API_KEY=Udes2027* PLAN_API_URL=https://smnattxrjhqoqcvjgitf.supabase.co/functions/v1/api-planes

   Despliegue:
     supabase functions deploy informe-plan --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FACULTADES = ["FCS", "FIT", "FCMS", "FCN", "FCAV", "FCEAC", "CFTT"];
const UUID = /^[0-9a-f-]{36}$/i;
const TIEMPO_MAX_MS = 25_000;

async function pedir(base: string, clave: string, ruta: string, facultad: string): Promise<unknown[]> {
  const url = `${base.replace(/\/$/, "")}/${ruta}?facultad=${encodeURIComponent(facultad)}`;
  const r = await fetch(url, { headers: { "x-api-key": clave }, signal: AbortSignal.timeout(TIEMPO_MAX_MS) });
  if (!r.ok) throw new Error(`La API del plan respondió ${r.status} en /${ruta}.`);
  const j = (await r.json()) as { datos?: unknown[] };
  return j.datos ?? [];
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const clave = ENV("PLAN_API_KEY");
  const base = ENV("PLAN_API_URL") || "https://smnattxrjhqoqcvjgitf.supabase.co/functions/v1/api-planes";
  if (!url || !serviceKey || !clave) return json({ error: "La función no está configurada (falta PLAN_API_KEY)." }, 500);

  let cuerpo: { unit_id?: string } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const unitId = String(cuerpo.unit_id ?? "");
  if (!UUID.test(unitId)) return json({ error: "Falta la unidad (unit_id)." }, 400);

  // Quién llama ---------------------------------------------------------------------
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);

  const { data: perfil } = await admin.from("profiles").select("role").eq("id", who.data.user.id).maybeSingle();
  if (!["planeacion", "admin"].includes(String(perfil?.role))) {
    const comoUsuario = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const { data: rol, error: errRol } = await comoUsuario.rpc("unit_role_at", { target: unitId });
    if (errRol) return json({ error: "No se pudo comprobar su papel en la unidad." }, 500);
    if (!rol) return json({ error: "No tiene acceso a esta unidad." }, 403);
  }

  // La unidad y su código en la API -------------------------------------------------
  const { data: unidad, error: errUnidad } = await admin.from("units").select("id, name, code, kind").eq("id", unitId).maybeSingle();
  if (errUnidad) return json({ error: "No se pudo leer la unidad." }, 500);
  const facultad = String(unidad?.code ?? "").toUpperCase();
  if (!unidad || !FACULTADES.includes(facultad)) return json({ error: "Esta unidad no tiene plan de trabajo en la API." }, 404);

  try {
    const [planes, acciones, actividades, seguimientos] = await Promise.all([
      pedir(base, clave, "planes", facultad),
      pedir(base, clave, "acciones", facultad),
      pedir(base, clave, "actividades", facultad),
      pedir(base, clave, "seguimientos", facultad),
    ]);
    const plan = (planes as Record<string, unknown>[]).find((p) => p.facultad === facultad) ?? null;
    return json({
      facultad,
      decano: plan?.decano ?? null,
      plan,
      acciones,
      actividades,
      seguimientos,
      traido_en: new Date().toISOString(),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Error desconocido";
    return json({ error: `No se pudo traer el plan de trabajo: ${m}` }, 502);
  }
});
