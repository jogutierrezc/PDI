/* =============================================================================
   Pilo at Work · Microsoft 365 (supabase/functions/pw-microsoft).

   OAuth 2.0 con código + PKCE contra Microsoft Entra ID y Microsoft Graph.
   Los tokens se guardan CIFRADOS (AES-GCM) en pw_ms_tokens, que solo lee service_role.
   NUNCA se pide Mail.Send: Pilo no envía ni borra correo.

   Variables de entorno (ningún valor va en archivos):
     MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI, PW_TOKEN_KEY,
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN

   Acciones (POST JSON; con la sesión de la persona, salvo `sincronizar_todos`, que va con la
   clave de servicio y la llama pw-avisos):
     estado                                   → { conectado, cuenta, scopes, configurado }
     iniciar { servicios: ["correo","agenda"], organizar?, borradores? } → { url }
     canjear { code, state }                  → { ok, cuenta }
     desconectar
     correo_listar { top?, carpeta?, no_leidos? }   solo lectura
     correo_leer { id }                             solo lectura (texto plano recortado)
     correo_carpetas
     correo_organizar { cambios: [{ id, categorias?, carpeta? }] }  → { deshacer: [...] }
     correo_deshacer { deshacer: [...] }
     correo_borrador { responder_a?, para?, asunto?, cuerpo }       → { id, webLink }
     agenda_semana { desde, hasta }                 → { eventos }
     agenda_crear { titulo, inicio, fin, asistentes?, teams?, cuerpo? } → { id, webLink, joinUrl }
     agenda_libres { desde, hasta, minutos }        → { horarios }
     sincronizar_todos                              (servicio) → { personas }

   Fechas: las que entran y salen son hora de Bogotá sin zona ("2026-10-28T09:00:00"); Graph
   recibe el encabezado Prefer: outlook.timezone="SA Pacific Standard Time".
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Any = any;
const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);

const TZ = "SA Pacific Standard Time";
const GRAPH = "https://graph.microsoft.com/v1.0";

/* --- Cifrado de tokens (AES-GCM) -------------------------------------------------------- */

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function llave(): Promise<CryptoKey> {
  const secreto = Deno.env.get("PW_TOKEN_KEY");
  if (!secreto) throw new Error("Falta la clave de cifrado PW_TOKEN_KEY.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function cifrar(claro: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llave(), new TextEncoder().encode(claro)));
  const junto = new Uint8Array(iv.length + ct.length);
  junto.set(iv);
  junto.set(ct, iv.length);
  return b64(junto);
}
async function descifrar(cifrado: string): Promise<string> {
  const junto = unb64(cifrado);
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: junto.slice(0, 12) }, await llave(), junto.slice(12));
  return new TextDecoder().decode(claro);
}

/* --- Microsoft Entra ------------------------------------------------------------------------ */

const config = () => ({
  clientId: Deno.env.get("MS_CLIENT_ID") ?? "",
  tenant: Deno.env.get("MS_TENANT_ID") ?? "",
  secret: Deno.env.get("MS_CLIENT_SECRET") ?? "",
  redirect: Deno.env.get("MS_REDIRECT_URI") ?? "",
});
const configurado = () => {
  const c = config();
  return Boolean(c.clientId && c.tenant && c.secret && c.redirect && Deno.env.get("PW_TOKEN_KEY"));
};
const tokenUrl = () => `https://login.microsoftonline.com/${config().tenant}/oauth2/v2.0/token`;

function scopesPara(servicios: string[], organizar: boolean): string {
  const s = ["User.Read", "offline_access"];
  if (servicios.includes("correo")) s.push("Mail.Read", ...(organizar ? ["Mail.ReadWrite"] : []));
  if (servicios.includes("agenda")) s.push("Calendars.ReadWrite", "OnlineMeetings.ReadWrite");
  return s.join(" ");
}

async function pedirToken(parametros: Record<string, string>): Promise<Any> {
  const c = config();
  const r = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...parametros }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error_description ? String(data.error_description).split("\r\n")[0] : "Microsoft no aceptó el permiso.");
  return data;
}

async function guardarTokens(admin: Any, userId: string, t: Any, cuenta?: string) {
  const fila: Record<string, unknown> = {
    user_id: userId,
    access_cifrado: await cifrar(String(t.access_token)),
    expira_en: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
    scopes: String(t.scope ?? ""),
    actualizado_en: new Date().toISOString(),
  };
  if (t.refresh_token) fila.refresh_cifrado = await cifrar(String(t.refresh_token));
  if (cuenta) fila.cuenta = cuenta;
  const { data: previa } = await admin.from("pw_ms_tokens").select("user_id").eq("user_id", userId).maybeSingle();
  if (previa) await admin.from("pw_ms_tokens").update(fila).eq("user_id", userId);
  else await admin.from("pw_ms_tokens").insert({ refresh_cifrado: await cifrar(String(t.refresh_token ?? "")), cuenta: cuenta ?? "", ...fila });
}

/** Un token de acceso vigente; si venció, se renueva solo con el de renovación. */
async function tokenDe(admin: Any, userId: string): Promise<string> {
  const { data } = await admin.from("pw_ms_tokens").select("access_cifrado, refresh_cifrado, expira_en, scopes").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Aún no conectó Microsoft 365.");
  if (new Date(data.expira_en).getTime() - Date.now() > 120_000) return await descifrar(data.access_cifrado);
  const nuevo = await pedirToken({ grant_type: "refresh_token", refresh_token: await descifrar(data.refresh_cifrado), scope: data.scopes });
  await guardarTokens(admin, userId, nuevo);
  return String(nuevo.access_token);
}

async function graph(token: string, ruta: string, init: RequestInit = {}): Promise<Any> {
  const r = await fetch(`${GRAPH}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: `outlook.timezone="${TZ}"`, ...(init.headers ?? {}) },
  });
  if (r.status === 204) return {};
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(data?.error?.message ?? "Microsoft Graph respondió con un error.");
    if (r.status === 403) throw new Error("Falta un permiso de Microsoft 365. Vuelva a conectar y acepte los permisos.");
    throw new Error(msg.slice(0, 200));
  }
  return data;
}

/* --- Ayudas --------------------------------------------------------------------------------- */

const sinHtml = (h: string) =>
  h
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
const aHtml = (t: string) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
const iso = (v: unknown) => {
  const s = text(v, 40);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(s) ? s.slice(0, 19) : "";
};
const resumenEvento = (e: Any) => ({
  id: e.id,
  titulo: e.subject ?? "(sin título)",
  inicio: String(e.start?.dateTime ?? "").slice(0, 19),
  fin: String(e.end?.dateTime ?? "").slice(0, 19),
  teams: Boolean(e.isOnlineMeeting),
  joinUrl: e.onlineMeeting?.joinUrl ?? null,
  lugar: e.location?.displayName ?? "",
  organizador: e.organizer?.emailAddress?.name ?? "",
});

async function semana(token: string, desde: string, hasta: string) {
  const d = await graph(token, `/me/calendarView?startDateTime=${encodeURIComponent(desde)}&endDateTime=${encodeURIComponent(hasta)}&$orderby=start/dateTime&$top=100&$select=id,subject,start,end,isOnlineMeeting,onlineMeeting,location,organizer,isCancelled`);
  return (d.value ?? []).filter((e: Any) => !e.isCancelled).map(resumenEvento);
}

/* --- Servidor -------------------------------------------------------------------------------- */

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Falta la configuración del servidor." }, 500);
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let body: Any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "El pedido no se entiende." }, 400);
  }
  const action = text(body?.action, 40);

  try {
    /* El cron de pw-avisos llega con la clave de servicio, sin persona. */
    if (action === "sincronizar_todos") {
      if (token !== serviceKey) return json({ error: "No autorizado." }, 401);
      if (!configurado()) return json({ personas: 0, nota: "Microsoft no está configurado." });
      const { data: filas } = await admin.from("pw_ms_tokens").select("user_id, scopes").like("scopes", "%Calendars%").limit(500);
      let n = 0;
      const ahora = new Date();
      const hasta = new Date(ahora.getTime() + 36 * 3600_000);
      for (const f of filas ?? []) {
        try {
          const t = await tokenDe(admin, f.user_id);
          const evs = await semana(t, ahora.toISOString(), hasta.toISOString());
          for (const e of evs) {
            // Graph devuelve la hora local de Bogotá (UTC-5, sin horario de verano): se convierte a un instante.
            const cuando = new Date(`${e.inicio}-05:00`).toISOString();
            const { data: ya } = await admin.from("pw_recordatorios").select("id").eq("user_id", f.user_id).eq("graph_id", e.id).maybeSingle();
            if (ya) await admin.from("pw_recordatorios").update({ titulo: e.titulo, inicia_en: cuando }).eq("id", ya.id);
            else await admin.from("pw_recordatorios").insert({ user_id: f.user_id, tipo: "reunion", titulo: e.titulo, inicia_en: cuando, origen: "graph", graph_id: e.id });
          }
          n++;
        } catch {
          /* una persona sin token válido no frena a las demás */
        }
      }
      return json({ personas: n });
    }

    if (!token) return json({ error: "Inicie sesión.", code: "sesion" }, 401);
    const { data: quien } = await admin.auth.getUser(token);
    const user = quien?.user;
    if (!user) return json({ error: "La sesión venció. Vuelva a entrar.", code: "sesion" }, 401);
    const mine = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: rol } = await mine.rpc("pw_mi_rol");
    if (!rol) return json({ error: "Su cuenta no tiene un rol en Pilo at Work.", code: "sin_rol" }, 403);
    const conCorreo = rol !== "colaborador";

    if (action === "estado") {
      const { data } = await admin.from("pw_ms_tokens").select("cuenta, scopes").eq("user_id", user.id).maybeSingle();
      return json({ conectado: Boolean(data), cuenta: data?.cuenta ?? "", scopes: data?.scopes ?? "", configurado: configurado(), correo_permitido: conCorreo });
    }
    if (!configurado()) return json({ error: "Microsoft 365 aún no está configurado por TIC.", code: "sin_config" }, 503);

    if (action === "iniciar") {
      const servicios = (Array.isArray(body.servicios) ? body.servicios : []).filter((s: string) => s === "correo" || s === "agenda");
      if (!servicios.length) return json({ error: "Elija correo, agenda o ambos." }, 400);
      if (servicios.includes("correo") && !conCorreo) return json({ error: "Su rol no incluye el correo. Pídalo a la administración." }, 403);
      const verificador = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const desafio = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
      const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
      const organizar = body.organizar !== false || body.borradores !== false;
      await admin.from("pw_ms_pkce").delete().eq("user_id", user.id);
      await admin.from("pw_ms_pkce").insert({ state, user_id: user.id, verificador_cifrado: await cifrar(verificador), permisos: { servicios, organizar } });
      const c = config();
      const q = new URLSearchParams({
        client_id: c.clientId,
        response_type: "code",
        redirect_uri: c.redirect,
        response_mode: "query",
        scope: scopesPara(servicios, organizar),
        state,
        code_challenge: desafio,
        code_challenge_method: "S256",
        prompt: "select_account",
      });
      return json({ url: `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/authorize?${q}` });
    }

    if (action === "canjear") {
      const state = text(body.state, 80);
      const { data: p } = await admin.from("pw_ms_pkce").select("*").eq("state", state).eq("user_id", user.id).maybeSingle();
      if (!p || Date.now() - new Date(p.creado_en).getTime() > 15 * 60_000) return json({ error: "El permiso venció. Empiece de nuevo." }, 400);
      await admin.from("pw_ms_pkce").delete().eq("state", state);
      const servicios: string[] = p.permisos?.servicios ?? [];
      const t = await pedirToken({ grant_type: "authorization_code", code: text(body.code, 4000), redirect_uri: config().redirect, code_verifier: await descifrar(p.verificador_cifrado), scope: scopesPara(servicios, p.permisos?.organizar !== false) });
      const yo = await graph(String(t.access_token), "/me?$select=displayName,mail,userPrincipalName");
      await guardarTokens(admin, user.id, t, String(yo.mail ?? yo.userPrincipalName ?? ""));
      void admin.from("pw_bitacora").insert({ user_id: user.id, accion: "ms_conectar", detalle: { servicios } });
      return json({ ok: true, cuenta: String(yo.mail ?? yo.userPrincipalName ?? "") });
    }

    if (action === "desconectar") {
      await mine.rpc("pw_ms_desconectar");
      return json({ ok: true });
    }

    const t = await tokenDe(admin, user.id);
    const permitidoCorreo = () => {
      if (!conCorreo) throw new Error("Su rol no incluye el correo.");
    };
    void admin.from("pw_bitacora").insert({ user_id: user.id, accion: `ms_${action}`.slice(0, 60), detalle: {} });

    /* ----------------------------- Correo ----------------------------- */
    if (action === "correo_listar") {
      permitidoCorreo();
      const top = Math.min(Math.max(Number(body.top) || 15, 1), 30);
      const carpeta = /^[\w=-]{1,200}$/.test(text(body.carpeta, 200)) ? text(body.carpeta, 200) : "inbox";
      const filtro = body.no_leidos ? "&$filter=isRead eq false" : "";
      const d = await graph(t, `/me/mailFolders/${carpeta}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,isRead,categories,parentFolderId,webLink,hasAttachments${filtro}`);
      return json({
        mensajes: (d.value ?? []).map((m: Any) => ({
          id: m.id,
          asunto: m.subject ?? "(sin asunto)",
          de: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "",
          correo: m.from?.emailAddress?.address ?? "",
          fecha: m.receivedDateTime,
          vista: text(m.bodyPreview, 220),
          leido: Boolean(m.isRead),
          categorias: m.categories ?? [],
          carpeta: m.parentFolderId,
          enlace: m.webLink,
          adjuntos: Boolean(m.hasAttachments),
        })),
      });
    }
    if (action === "correo_leer") {
      permitidoCorreo();
      const id = text(body.id, 300);
      const m = await graph(t, `/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,receivedDateTime,body,categories`);
      return json({ id: m.id, asunto: m.subject, de: m.from?.emailAddress?.address ?? "", fecha: m.receivedDateTime, texto: sinHtml(String(m.body?.content ?? "")).slice(0, 6000), categorias: m.categories ?? [] });
    }
    if (action === "correo_carpetas") {
      permitidoCorreo();
      const d = await graph(t, "/me/mailFolders?$top=40&$select=id,displayName,unreadItemCount");
      return json({ carpetas: (d.value ?? []).map((f: Any) => ({ id: f.id, nombre: f.displayName, sin_leer: f.unreadItemCount })) });
    }
    if (action === "correo_organizar") {
      permitidoCorreo();
      const deshacer: Any[] = [];
      for (const c of (Array.isArray(body.cambios) ? body.cambios : []).slice(0, 25)) {
        const id = text(c?.id, 300);
        if (!id) continue;
        const antes = await graph(t, `/me/messages/${encodeURIComponent(id)}?$select=categories,parentFolderId`);
        let actual = id;
        if (Array.isArray(c.categorias)) {
          await graph(t, `/me/messages/${encodeURIComponent(actual)}`, { method: "PATCH", body: JSON.stringify({ categories: c.categorias.slice(0, 10).map((x: string) => text(x, 40)) }) });
        }
        if (c.carpeta) {
          const mov = await graph(t, `/me/messages/${encodeURIComponent(actual)}/move`, { method: "POST", body: JSON.stringify({ destinationId: text(c.carpeta, 300) }) });
          actual = String(mov.id ?? actual);
        }
        deshacer.push({ id: actual, categorias: antes.categories ?? [], carpeta: antes.parentFolderId, movido: Boolean(c.carpeta) });
      }
      return json({ ok: true, deshacer });
    }
    if (action === "correo_deshacer") {
      permitidoCorreo();
      for (const u of (Array.isArray(body.deshacer) ? body.deshacer : []).slice(0, 25)) {
        let id = text(u?.id, 300);
        if (u.movido && u.carpeta) {
          const mov = await graph(t, `/me/messages/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ destinationId: text(u.carpeta, 300) }) });
          id = String(mov.id ?? id);
        }
        await graph(t, `/me/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ categories: Array.isArray(u.categorias) ? u.categorias : [] }) });
      }
      return json({ ok: true });
    }
    if (action === "correo_borrador") {
      permitidoCorreo();
      const cuerpo = aHtml(text(body.cuerpo, 8000));
      let borrador: Any;
      if (body.responder_a) {
        borrador = await graph(t, `/me/messages/${encodeURIComponent(text(body.responder_a, 300))}/createReply`, { method: "POST", body: JSON.stringify({}) });
        // El texto propuesto va arriba del mensaje citado; el borrador queda en Borradores y NO se envía.
        const previo = String(borrador.body?.content ?? "");
        await graph(t, `/me/messages/${encodeURIComponent(borrador.id)}`, { method: "PATCH", body: JSON.stringify({ body: { contentType: "html", content: cuerpo + previo } }) });
      } else {
        borrador = await graph(t, "/me/messages", {
          method: "POST",
          body: JSON.stringify({
            subject: text(body.asunto, 200),
            body: { contentType: "html", content: cuerpo },
            toRecipients: (Array.isArray(body.para) ? body.para : []).slice(0, 20).map((a: string) => ({ emailAddress: { address: text(a, 200) } })),
          }),
        });
      }
      return json({ ok: true, id: borrador.id, enlace: borrador.webLink ?? null });
    }

    /* ----------------------------- Agenda ----------------------------- */
    if (action === "agenda_semana") {
      const desde = iso(body.desde);
      const hasta = iso(body.hasta);
      if (!desde || !hasta) return json({ error: "Falta el rango de fechas." }, 400);
      // calendarView con zona: el rango va como hora de Bogotá.
      const eventos = await semana(t, `${desde}-05:00`, `${hasta}-05:00`);
      return json({ eventos });
    }
    if (action === "agenda_crear") {
      const inicio = iso(body.inicio);
      const fin = iso(body.fin);
      if (!inicio || !fin || !text(body.titulo, 200).trim()) return json({ error: "Faltan el título o las horas." }, 400);
      const teams = body.teams !== false;
      const ev = await graph(t, "/me/events", {
        method: "POST",
        body: JSON.stringify({
          subject: text(body.titulo, 200),
          start: { dateTime: inicio, timeZone: TZ },
          end: { dateTime: fin, timeZone: TZ },
          body: { contentType: "html", content: aHtml(text(body.cuerpo, 4000)) },
          attendees: (Array.isArray(body.asistentes) ? body.asistentes : []).slice(0, 30).map((a: string) => ({ emailAddress: { address: text(a, 200) }, type: "required" })),
          ...(teams ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
        }),
      });
      const cuando = new Date(`${inicio}-05:00`).toISOString();
      await admin.from("pw_recordatorios").insert({ user_id: user.id, tipo: "reunion", titulo: text(body.titulo, 200), inicia_en: cuando, origen: "pilo", graph_id: ev.id });
      return json({ ok: true, id: ev.id, enlace: ev.webLink ?? null, joinUrl: ev.onlineMeeting?.joinUrl ?? null });
    }
    if (action === "agenda_libres") {
      const desde = iso(body.desde);
      const hasta = iso(body.hasta);
      const minutos = Math.min(Math.max(Number(body.minutos) || 45, 15), 240);
      if (!desde || !hasta) return json({ error: "Falta el rango de fechas." }, 400);
      const ocupados = (await semana(t, `${desde}-05:00`, `${hasta}-05:00`)).map((e: Any) => [new Date(`${e.inicio}-05:00`).getTime(), new Date(`${e.fin}-05:00`).getTime()]);
      const horarios: string[] = [];
      const dia = new Date(`${desde.slice(0, 10)}T00:00:00-05:00`);
      const limite = new Date(`${hasta}-05:00`).getTime();
      for (let d = 0; d < 14 && horarios.length < 6; d++, dia.setDate(dia.getDate() + 1)) {
        const dow = new Date(dia.getTime() - 5 * 3600_000).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        for (let h = 8; h < 18 && horarios.length < 6; h++) {
          const ini = dia.getTime() + h * 3600_000;
          const fn = ini + minutos * 60_000;
          if (ini < Date.now() || fn > limite || fn > dia.getTime() + 18 * 3600_000) continue;
          if (!ocupados.some(([a, b]: number[]) => ini < b && fn > a)) horarios.push(new Date(ini - 5 * 3600_000).toISOString().slice(0, 19));
        }
      }
      return json({ horarios });
    }
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Algo falló con Microsoft 365." }, 502);
  }
});
