/* =============================================================================
   Pilo at Work · avisos (Web Push) (supabase/functions/pw-avisos).

   Acciones (POST JSON):
     clave                      (sesión)   → { public }   la llave VAPID pública, o null si no está puesta
     probar                     (sesión)   → { enviados } un aviso de prueba a los dispositivos de la persona
     enviar                     (servicio) → { sincronizadas, enviados, vencidas }
                                  Lo programa el cron (cada 5 minutos): pide a pw-microsoft que traiga
                                  las reuniones próximas de quienes conectaron su calendario y avisa
                                  10 minutos antes (pw_recordatorios.avisar_min) a quienes lo permitieron.
     generar_claves             (servicio) → { public, private }  un par VAPID nuevo, para poner en las
                                  variables de entorno. No se guarda en ningún sitio.

   Variables de entorno (nunca en archivos): PW_VAPID_PUBLIC, PW_VAPID_PRIVATE, PW_VAPID_SUBJECT
   (un «mailto:» o https), SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN.

   Cada persona decide: `avisar_equipo` (avisos mientras trabaja en el equipo) y `segundo_plano`
   (también con la app cerrada). Un dispositivo con las dos apagadas no recibe nada.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { pushClaves, pushEnviar } from "./push.ts";
import type { PushClaves } from "./push.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Any = any;

const claves = (): PushClaves | null => {
  const pub = Deno.env.get("PW_VAPID_PUBLIC");
  const priv = Deno.env.get("PW_VAPID_PRIVATE");
  if (!pub || !priv) return null;
  return { public: pub, private: priv, subject: Deno.env.get("PW_VAPID_SUBJECT") || "mailto:planeacion@udes.edu.co" };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Falta la configuración del servidor." }, 500);
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let body: Any = {};
  try {
    body = await request.json();
  } catch {
    /* sin cuerpo */
  }
  const action = String(body?.action ?? "");
  const vapid = claves();

  try {
    if (action === "generar_claves" || action === "enviar") {
      if (token !== serviceKey) return json({ error: "No autorizado." }, 401);
      if (action === "generar_claves") {
        const par = await pushClaves(Deno.env.get("PW_VAPID_SUBJECT") || "mailto:planeacion@udes.edu.co");
        return json({ public: par.public, private: par.private });
      }
      if (!vapid) return json({ error: "Faltan PW_VAPID_PUBLIC y PW_VAPID_PRIVATE.", sincronizadas: 0, enviados: 0 }, 503);
      // 1. Reuniones nuevas de quienes conectaron Microsoft (si pw-microsoft no está, se sigue con lo que hay).
      let sincronizadas = 0;
      try {
        const r = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/pw-microsoft`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: anonKey },
          body: JSON.stringify({ action: "sincronizar_todos" }),
        });
        sincronizadas = Number((await r.json().catch(() => ({})))?.personas ?? 0);
      } catch {
        /* sigue */
      }
      // 2. Los avisos que vencen ahora.
      const { data: pendientes } = await admin.rpc("pw_avisos_pendientes", { p_limite: 200 });
      let enviados = 0;
      for (const p of (pendientes ?? []) as Any[]) {
        const { data: subs } = await admin.from("pw_push_suscripciones").select("id, endpoint, p256dh, auth_key, avisar_equipo, segundo_plano").eq("user_id", p.user_id).limit(10);
        const minutos = Math.max(0, Math.round((new Date(p.inicia_en).getTime() - Date.now()) / 60000));
        let alguno = false;
        for (const s of (subs ?? []) as Any[]) {
          if (!s.avisar_equipo && !s.segundo_plano) continue;
          const r = await pushEnviar(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth_key },
            { titulo: minutos <= 1 ? "Empieza ahora" : `Empieza en ${minutos} minutos`, cuerpo: String(p.titulo), tag: `pw-${p.id}`, url: String(p.url || "/work/agenda"), ttl: 600 },
            vapid,
          );
          if (r.gone) await admin.from("pw_push_suscripciones").delete().eq("id", s.id);
          else if (r.ok) alguno = true;
        }
        if (alguno || !(subs ?? []).length) {
          await admin.from("pw_recordatorios").update({ enviado_en: new Date().toISOString() }).eq("id", p.id);
          if (alguno) enviados++;
        }
      }
      // Lo que ya pasó y nunca se avisó se marca para no acumular.
      await admin.from("pw_recordatorios").update({ enviado_en: new Date().toISOString() }).is("enviado_en", null).lt("inicia_en", new Date(Date.now() - 6 * 60_000).toISOString());
      return json({ sincronizadas, enviados });
    }

    if (!token) return json({ error: "Inicie sesión.", code: "sesion" }, 401);
    const { data: quien } = await admin.auth.getUser(token);
    const user = quien?.user;
    if (!user) return json({ error: "La sesión venció.", code: "sesion" }, 401);
    const mine = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: rol } = await mine.rpc("pw_mi_rol");
    if (!rol) return json({ error: "Su cuenta no tiene un rol en Pilo at Work.", code: "sin_rol" }, 403);

    if (action === "clave") return json({ public: vapid?.public ?? null });
    if (action === "probar") {
      if (!vapid) return json({ error: "Los avisos con la app cerrada aún no están configurados por TIC.", code: "sin_vapid" }, 503);
      const { data: subs } = await admin.from("pw_push_suscripciones").select("id, endpoint, p256dh, auth_key").eq("user_id", user.id).limit(10);
      let enviados = 0;
      for (const s of (subs ?? []) as Any[]) {
        const r = await pushEnviar({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth_key }, { titulo: "Así le avisará Pilo", cuerpo: "Revisión de cifras · empieza en 10 minutos", tag: "pw-prueba", url: "/work/agenda", ttl: 120 }, vapid);
        if (r.gone) await admin.from("pw_push_suscripciones").delete().eq("id", s.id);
        else if (r.ok) enviados++;
      }
      return json({ enviados });
    }
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Algo falló en los avisos." }, 502);
  }
});
