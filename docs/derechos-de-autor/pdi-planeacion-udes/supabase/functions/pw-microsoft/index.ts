/* =============================================================================
   Pilo at Work · Microsoft 365 (supabase/functions/pw-microsoft).

   OAuth 2.0 con código + PKCE contra Microsoft Entra ID y Microsoft Graph.
   Los tokens se guardan CIFRADOS (AES-GCM) en pw_ms_tokens, que solo lee service_role.
   NUNCA se pide Mail.Send: Pilo no envía ni borra correo. El navegador NUNCA recibe el
   token de Microsoft (la única URL que sale es la `uploadUrl` de una sesión de subida, que
   Microsoft entrega ya autenticada, es de un solo archivo y vence sola).

   Variables de entorno (ningún valor va en archivos):
     MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI, PW_TOKEN_KEY,
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN

   Permisos por MÓDULO (se piden por separado y se suman sin perder los anteriores):
     «Correo y agenda» → Mail.Read (+ Mail.ReadWrite), Calendars.ReadWrite, OnlineMeetings.ReadWrite
     «Archivos»        → Files.ReadWrite, Sites.ReadWrite.All
   (todos con User.Read y offline_access). Lo concedido a cada persona se lee de la columna
   `scopes` de pw_ms_tokens; al reconectar un módulo, los alcances nuevos se UNEN a los viejos.

   Acciones (POST JSON; con la sesión de la persona, salvo `sincronizar_todos`, que va con la
   clave de servicio y la llama pw-avisos):
     estado                                   → { conectado, cuenta, scopes, configurado, correo_permitido }
     configuracion                            (admin de Planeación) → booleanos de las variables, módulos y conteos
     iniciar { servicios: ["correo","agenda","archivos"], organizar? } → { url }
     canjear { code, state }                  → { ok, cuenta }
     desconectar
     correo_listar { top?, skip?, carpeta?, filtro?: "no_leidos"|"hoy"|"adjuntos" }   solo lectura
     correo_contar { periodo: "hoy"|"ayer"|"7dias", carpeta? }                         solo lectura
     correo_leer { id }                       solo lectura (texto + html + adjuntos)
     correo_hilo { id }                       solo lectura (mensajes de la misma conversación)
     correo_adjunto { id, adjunto }           solo lectura (≤ 8 MB, base64)
     correo_carpetas
     correo_organizar / correo_deshacer / correo_borrador   (con aprobación en la interfaz)
     agenda_semana { desde, hasta }           → { eventos }   (calendarView paginado, hora de Bogotá)
     agenda_detalle { id }                    → { evento }
     agenda_crear { titulo, inicio, fin, asistentes?, teams?, cuerpo?, lugar?, recordatorio? }
     agenda_editar { id, titulo?, inicio?, fin?, cuerpo?, lugar? }
     agenda_eliminar { id }                   (cancela si es organizadora con invitados; si no, elimina)
     agenda_libres { desde, hasta, minutos }
     archivos_sitios { q? } / archivos_bibliotecas { sitio }
     archivos_listar { drive, item?, q?, siguiente? }    drive = "me" o el id de una biblioteca
     archivos_leer { drive, item }            → texto (txt/md/csv/json…) o base64 (≤ 8 MB)
     archivos_crear_carpeta { drive, padre, nombre }
     archivos_subir_simple { drive, padre, nombre, b64, conflicto? }   ≤ 1 MiB
     archivos_sesion { drive, padre, nombre, tamano, conflicto? }      → { uploadUrl }
     archivos_trozo { uploadUrl, desde, hasta, total, b64 }            (relevo si el navegador no llega directo)
     sincronizar_todos                        (servicio) → { personas }

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
const TIEMPO_GRAPH_MS = 25_000;
/** Subida simple solo hasta aquí (Graph admite 250 MB, pero un JSON base64 grande pasa mal por proxies); más grande va por sesión. */
const SIMPLE_MAX = 1024 * 1024;
const LEER_MAX = 8 * 1024 * 1024;
const SUBIDA_TOPE_MB = 100;
const MODULOS = {
  correo_agenda: "Mail.Read Mail.ReadWrite Calendars.ReadWrite OnlineMeetings.ReadWrite",
  archivos: "Files.ReadWrite Sites.ReadWrite.All",
};

/* --- Cifrado de tokens (AES-GCM) -------------------------------------------------------- */

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
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
  if (servicios.includes("archivos")) s.push("Files.ReadWrite", "Sites.ReadWrite.All");
  return s.join(" ");
}

/** Une dos listas de alcances sin repetir (sin distinguir mayúsculas). */
const unirScopes = (a: string, b: string) => {
  const vistos = new Map<string, string>();
  for (const x of `${a} ${b}`.split(/\s+/).filter(Boolean)) {
    const corto = x.replace(/^https:\/\/graph\.microsoft\.com\//i, "");
    if (!vistos.has(corto.toLowerCase())) vistos.set(corto.toLowerCase(), corto);
  }
  return [...vistos.values()].join(" ");
};

/** Los errores de Entra, en palabras de quien trabaja en una oficina. */
function mensajeEntra(desc: string): string {
  if (/AADSTS(65001|90094|90008|500011)|consent|admin approval/i.test(desc)) return "Falta el consentimiento de TIC para este permiso. Pida a TIC que lo conceda en Microsoft Entra y vuelva a intentar.";
  if (/AADSTS(70008|700082|50173|50076|50079|70043|invalid_grant)|expired|revoked/i.test(desc)) return "La conexión con Microsoft venció. Vuelva a conectar desde Conectores.";
  return desc.split("\r\n")[0].slice(0, 200) || "Microsoft no aceptó el permiso.";
}

async function pedirToken(parametros: Record<string, string>): Promise<Any> {
  const c = config();
  const r = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(20_000),
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...parametros }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(mensajeEntra(String(data?.error_description ?? data?.error ?? "")));
  return data;
}

async function guardarTokens(admin: Any, userId: string, t: Any, cuenta?: string) {
  const { data: previa } = await admin.from("pw_ms_tokens").select("user_id, scopes").eq("user_id", userId).maybeSingle();
  const fila: Record<string, unknown> = {
    user_id: userId,
    access_cifrado: await cifrar(String(t.access_token)),
    expira_en: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
    // Conectar un módulo nuevo SUMA alcances: nunca se pierden los del correo o la agenda.
    scopes: unirScopes(String(previa?.scopes ?? ""), String(t.scope ?? "")),
    actualizado_en: new Date().toISOString(),
  };
  if (t.refresh_token) fila.refresh_cifrado = await cifrar(String(t.refresh_token));
  if (cuenta) fila.cuenta = cuenta;
  if (previa) await admin.from("pw_ms_tokens").update(fila).eq("user_id", userId);
  else await admin.from("pw_ms_tokens").insert({ refresh_cifrado: await cifrar(String(t.refresh_token ?? "")), cuenta: cuenta ?? "", ...fila });
}

/** Un token de acceso vigente y los alcances concedidos; si venció, se renueva solo con el de renovación. */
async function tokenDe(admin: Any, userId: string): Promise<{ t: string; scopes: string }> {
  const { data } = await admin.from("pw_ms_tokens").select("access_cifrado, refresh_cifrado, expira_en, scopes").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Aún no conectó Microsoft 365.");
  if (new Date(data.expira_en).getTime() - Date.now() > 120_000) return { t: await descifrar(data.access_cifrado), scopes: String(data.scopes ?? "") };
  const nuevo = await pedirToken({ grant_type: "refresh_token", refresh_token: await descifrar(data.refresh_cifrado), scope: data.scopes });
  await guardarTokens(admin, userId, nuevo);
  return { t: String(nuevo.access_token), scopes: unirScopes(String(data.scopes ?? ""), String(nuevo.scope ?? "")) };
}

/** Un pedido a Graph con tope de tiempo y errores en español. `ruta` puede ser absoluta (nextLink). */
async function graphRaw(token: string, ruta: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(ruta.startsWith("https://") ? ruta : `${GRAPH}${ruta}`, {
      ...init,
      signal: AbortSignal.timeout(TIEMPO_GRAPH_MS),
      headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.timezone="${TZ}"`, ...(init.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new Error("Microsoft tardó demasiado en responder. Intente de nuevo.");
    throw new Error("No se pudo hablar con Microsoft.");
  }
}
async function errorGraph(r: Response, ruta: string): Promise<never> {
  const data = await r.json().catch(() => ({}));
  const msg = String(data?.error?.message ?? "Microsoft Graph respondió con un error.");
  const esArchivo = /\/(drive|drives|sites)\b/.test(ruta);
  if (r.status === 401) throw new Error("La conexión con Microsoft venció. Vuelva a conectar desde Conectores.");
  if (r.status === 403) throw new Error(esArchivo ? "Falta el permiso de archivos o de ese sitio. Pulse «Conectar archivos»; si ya lo hizo, pida acceso al sitio." : "Falta un permiso de Microsoft 365. Vuelva a conectar y acepte los permisos.");
  if (r.status === 404) throw new Error("Microsoft no encontró eso (puede haberse movido o borrado).");
  if (r.status === 409) throw Object.assign(new Error("Ya existe algo con ese nombre."), { conflicto: true });
  if (r.status === 429) throw new Error("Microsoft pide esperar un momento. Intente de nuevo en unos segundos.");
  throw new Error(msg.slice(0, 200));
}
async function graph(token: string, ruta: string, init: RequestInit = {}): Promise<Any> {
  const r = await graphRaw(token, ruta, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 204) return {};
  if (!r.ok) return await errorGraph(r, ruta);
  return await r.json().catch(() => ({}));
}
/** Sigue @odata.nextLink hasta `max` elementos. */
async function graphTodo(token: string, ruta: string, max = 500, headers: Record<string, string> = {}): Promise<Any[]> {
  const out: Any[] = [];
  let sig: string | undefined = ruta;
  for (let i = 0; sig && i < 10 && out.length < max; i++) {
    const d: Any = await graph(token, sig, { headers });
    out.push(...(d.value ?? []));
    sig = d["@odata.nextLink"];
  }
  return out.slice(0, max);
}

/* --- Ayudas --------------------------------------------------------------------------------- */

const entidades = (h: string) => h.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const sinHtml = (h: string) =>
  entidades(
    h
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(p|div|tr|li|h\d)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
const aHtml = (t: string) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
const iso = (v: unknown) => {
  const s = text(v, 40);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(s) ? (s.length === 16 ? `${s}:00` : s.slice(0, 19)) : "";
};

/** Instantes UTC de inicio de día en Bogotá (UTC-5, sin horario de verano). */
const inicioDiaBogota = (desplazarDias = 0) => {
  const b = new Date(Date.now() - 5 * 3600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + desplazarDias, 5, 0, 0));
};
const iz = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

const respuesta = (e: Any) => e.responseStatus?.response ?? "none";
const resumenEvento = (e: Any) => ({
  id: e.id,
  titulo: e.subject ?? "(sin título)",
  inicio: String(e.start?.dateTime ?? "").slice(0, 19),
  fin: String(e.end?.dateTime ?? "").slice(0, 19),
  todoElDia: Boolean(e.isAllDay),
  teams: Boolean(e.isOnlineMeeting),
  joinUrl: e.onlineMeeting?.joinUrl ?? null,
  lugar: e.location?.displayName ?? "",
  organizador: e.organizer?.emailAddress?.name ?? "",
  mia: Boolean(e.isOrganizer),
  estado: e.showAs ?? "busy",
  respuesta: respuesta(e),
  recurrente: e.type === "occurrence" || e.type === "exception",
});
const CAMPOS_EVENTO = "id,subject,start,end,isAllDay,isOnlineMeeting,onlineMeeting,location,organizer,isOrganizer,isCancelled,showAs,responseStatus,type";

/** calendarView del rango (hora de Bogotá), paginado; las recurrentes ya vienen expandidas. */
async function semana(token: string, desde: string, hasta: string) {
  const lista = await graphTodo(token, `/me/calendarView?startDateTime=${encodeURIComponent(desde)}&endDateTime=${encodeURIComponent(hasta)}&$top=100&$select=${CAMPOS_EVENTO}`, 600);
  return lista
    .filter((e: Any) => !e.isCancelled)
    .map(resumenEvento)
    .sort((a: Any, b: Any) => a.inicio.localeCompare(b.inicio) || a.fin.localeCompare(b.fin));
}

/** Nombres de archivo de OneDrive/SharePoint: caracteres no permitidos, reservados y longitud. */
function nombreValido(n: string): string {
  const x = n.trim();
  if (!x) return "Escriba un nombre.";
  if (x.length > 200) return "El nombre es demasiado largo (máximo 200 caracteres).";
  if (/["*:<>?/\\|\u0000-\u001f]/.test(x)) return "El nombre no puede llevar \" * : < > ? / \\ |.";
  if (/[. ]$/.test(x) || /^\./.test(x) && x === ".") return "El nombre no puede terminar en punto o espacio.";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(x) || /^~\$|^_vti_|^desktop\.ini$/i.test(x)) return "Ese nombre está reservado por Microsoft.";
  return "";
}
/** La carpeta base de un «drive» (me o id de biblioteca). */
const baseDrive = (drive: string) => (drive === "me" ? "/me/drive" : `/drives/${encodeURIComponent(drive)}`);
const itemRuta = (drive: string, item: string) => (!item || item === "root" ? `${baseDrive(drive)}/root` : `${baseDrive(drive)}/items/${encodeURIComponent(item)}`);
const conflictoValido = (c: unknown) => (c === "replace" || c === "fail" ? c : "rename");
const hostSubida = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)(sharepoint\.com|1drv\.com|1drv\.ms|svc\.ms|onedrive\.com|live\.com|microsoftpersonalcontent\.com)$/i.test(x.hostname);
  } catch {
    return false;
  }
};
const resumenItem = (i: Any) => ({
  id: i.id,
  nombre: i.name,
  tamano: Number(i.size ?? 0),
  modificado: i.lastModifiedDateTime ?? "",
  carpeta: Boolean(i.folder),
  hijos: i.folder ? Number(i.folder.childCount ?? 0) : 0,
  tipo: i.file?.mimeType ?? "",
  url: i.webUrl ?? "",
  drive: i.parentReference?.driveId ?? "",
  padre: i.parentReference?.id ?? "",
  ruta: String(i.parentReference?.path ?? "").replace(/^.*root:/, "") || "/",
});
const CAMPOS_ITEM = "id,name,size,lastModifiedDateTime,webUrl,folder,file,parentReference";

/** Los interruptores globales de pw_config (por defecto, todo encendido; si la tabla no existe, igual). */
async function leerFunciones(admin: Any): Promise<{ funciones: Record<string, boolean>; subida_max_mb: number }> {
  try {
    const { data } = await admin.from("pw_config").select("funciones, subida_max_mb").eq("id", 1).maybeSingle();
    return { funciones: (data?.funciones && typeof data.funciones === "object" ? data.funciones : {}) as Record<string, boolean>, subida_max_mb: Math.min(Number(data?.subida_max_mb) || SUBIDA_TOPE_MB, SUBIDA_TOPE_MB) };
  } catch {
    return { funciones: {}, subida_max_mb: SUBIDA_TOPE_MB };
  }
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
          const { t } = await tokenDe(admin, f.user_id);
          const evs = await semana(t, ahora.toISOString(), hasta.toISOString());
          for (const e of evs) {
            if (e.todoElDia) continue;
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

    /* Administración de Planeación: configuración (solo booleanos y conteos, nunca valores). */
    if (action === "configuracion") {
      const { data: esAdmin } = await mine.rpc("has_role_at_least", { minimum: "admin" });
      if (!esAdmin) return json({ error: "Solo la administración de Planeación puede ver esto." }, 403);
      const c = config();
      const { count } = await admin.from("pw_ms_tokens").select("user_id", { count: "exact", head: true });
      return json({
        variables: { MS_CLIENT_ID: Boolean(c.clientId), MS_TENANT_ID: Boolean(c.tenant), MS_CLIENT_SECRET: Boolean(c.secret), MS_REDIRECT_URI: Boolean(c.redirect), PW_TOKEN_KEY: Boolean(Deno.env.get("PW_TOKEN_KEY")) },
        configurado: configurado(),
        modulos: [
          { id: "correo_agenda", nombre: "Correo y agenda", alcances: MODULOS.correo_agenda },
          { id: "archivos", nombre: "Archivos (OneDrive y SharePoint)", alcances: MODULOS.archivos },
        ],
        conectados: count ?? 0,
      });
    }

    const { data: rol } = await mine.rpc("pw_mi_rol");
    if (!rol) return json({ error: "Su cuenta no tiene un rol en Pilo at Work.", code: "sin_rol" }, 403);
    const conCorreo = rol !== "colaborador";

    if (action === "estado") {
      const { data } = await admin.from("pw_ms_tokens").select("cuenta, scopes").eq("user_id", user.id).maybeSingle();
      return json({ conectado: Boolean(data), cuenta: data?.cuenta ?? "", scopes: data?.scopes ?? "", configurado: configurado(), correo_permitido: conCorreo });
    }
    if (!configurado()) return json({ error: "Microsoft 365 aún no está configurado por TIC.", code: "sin_config" }, 503);

    if (action === "iniciar") {
      const servicios = (Array.isArray(body.servicios) ? body.servicios : []).filter((s: string) => s === "correo" || s === "agenda" || s === "archivos");
      if (!servicios.length) return json({ error: "Elija correo, agenda, archivos o varios." }, 400);
      if (servicios.includes("correo") && !conCorreo) return json({ error: "Su rol no incluye el correo. Pídalo a la administración.", code: "rol" }, 403);
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

    const { t, scopes } = await tokenDe(admin, user.id);
    const { funciones, subida_max_mb } = await leerFunciones(admin);
    const tiene = (a: string) => scopes.toLowerCase().includes(a.toLowerCase());
    const requiere = (modulo: "correo" | "agenda" | "archivos") => {
      if (funciones[modulo] === false) throw new Error("La administración apagó esta función por ahora.");
      if (modulo === "correo") {
        if (!conCorreo) throw new Error("Su rol no incluye el correo.");
        if (!tiene("Mail.Read")) throw new Error("Aún no conectó el correo. Hágalo desde Conectores.");
      }
      if (modulo === "agenda" && !tiene("Calendars")) throw new Error("Aún no conectó la agenda. Hágalo desde Conectores.");
      if (modulo === "archivos" && !tiene("Files.ReadWrite")) throw new Error("Aún no conectó «Archivos». Pulse «Conectar archivos» en Conectores.");
    };
    void admin.from("pw_bitacora").insert({ user_id: user.id, accion: `ms_${action}`.slice(0, 60), detalle: {} });

    /* ----------------------------- Correo ----------------------------- */
    if (action === "correo_listar") {
      requiere("correo");
      const top = Math.min(Math.max(Number(body.top) || 15, 1), 30);
      const skip = Math.min(Math.max(Number(body.skip) || 0, 0), 2000);
      const carpeta = /^[\w=-]{1,200}$/.test(text(body.carpeta, 200)) ? text(body.carpeta, 200) : "inbox";
      // Graph exige que lo que se ordena también esté en el $filter (si no, «InefficientFilter»).
      const f = [`receivedDateTime ge ${body.filtro === "hoy" ? iz(inicioDiaBogota()) : "1900-01-01T00:00:00Z"}`];
      if (body.filtro === "no_leidos" || body.no_leidos) f.push("isRead eq false");
      if (body.filtro === "adjuntos") f.push("hasAttachments eq true");
      const d = await graph(t, `/me/mailFolders/${carpeta}/messages?$top=${top}&$skip=${skip}&$orderby=receivedDateTime desc&$filter=${encodeURIComponent(f.join(" and "))}&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,categories,parentFolderId,webLink,hasAttachments,conversationId`);
      const mensajes = (d.value ?? []).map((m: Any) => ({
        id: m.id,
        asunto: m.subject ?? "(sin asunto)",
        de: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "",
        correo: m.from?.emailAddress?.address ?? "",
        para: (m.toRecipients ?? []).map((x: Any) => x.emailAddress?.name || x.emailAddress?.address).slice(0, 3),
        fecha: m.receivedDateTime,
        vista: text(m.bodyPreview, 220),
        leido: Boolean(m.isRead),
        categorias: m.categories ?? [],
        carpeta: m.parentFolderId,
        enlace: m.webLink,
        adjuntos: Boolean(m.hasAttachments),
        conversacion: m.conversationId ?? "",
      }));
      return json({ mensajes, mas: mensajes.length === top });
    }
    if (action === "correo_contar") {
      requiere("correo");
      const periodo = ["hoy", "ayer", "7dias"].includes(body.periodo) ? body.periodo : "hoy";
      const carpeta = /^[\w=-]{1,200}$/.test(text(body.carpeta, 200)) ? text(body.carpeta, 200) : "inbox";
      const desde = periodo === "hoy" ? inicioDiaBogota() : periodo === "ayer" ? inicioDiaBogota(-1) : inicioDiaBogota(-6);
      const hasta = periodo === "ayer" ? inicioDiaBogota() : inicioDiaBogota(1);
      const base = `receivedDateTime ge ${iz(desde)} and receivedDateTime lt ${iz(hasta)}`;
      const contar = async (extra: string) => {
        const d = await graph(t, `/me/mailFolders/${carpeta}/messages?$count=true&$top=1&$select=id&$filter=${encodeURIComponent(base + extra)}`, { headers: { ConsistencyLevel: "eventual" } });
        if (typeof d["@odata.count"] === "number") return d["@odata.count"] as number;
        // Respaldo: si Graph no devolvió el conteo, se cuenta paginando (hasta 2 000).
        return (await graphTodo(t, `/me/mailFolders/${carpeta}/messages?$top=100&$select=id&$filter=${encodeURIComponent(base + extra)}`, 2000)).length;
      };
      const [total, noLeidos] = await Promise.all([contar(""), contar(" and isRead eq false")]);
      return json({ periodo, carpeta, desde: iz(desde), hasta: iz(hasta), zona: "America/Bogota", total, no_leidos: noLeidos });
    }
    if (action === "correo_leer") {
      requiere("correo");
      const id = encodeURIComponent(text(body.id, 300));
      const m = await graph(t, `/me/messages/${id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,categories,webLink,hasAttachments,conversationId,isRead`);
      let adjuntos: Any[] = [];
      if (m.hasAttachments) {
        const a = await graph(t, `/me/messages/${id}/attachments?$select=id,name,size,contentType,isInline&$top=50`);
        adjuntos = (a.value ?? []).filter((x: Any) => !x.isInline).map((x: Any) => ({ id: x.id, nombre: x.name, tamano: Number(x.size ?? 0), tipo: x.contentType ?? "" }));
      }
      const esHtml = String(m.body?.contentType).toLowerCase() === "html";
      const bruto = String(m.body?.content ?? "");
      const quien = (x: Any) => ({ nombre: x.emailAddress?.name ?? "", correo: x.emailAddress?.address ?? "" });
      return json({
        id: m.id,
        asunto: m.subject ?? "(sin asunto)",
        de: quien(m.from ?? {}),
        para: (m.toRecipients ?? []).map(quien).slice(0, 20),
        cc: (m.ccRecipients ?? []).map(quien).slice(0, 20),
        fecha: m.receivedDateTime,
        texto: (esHtml ? sinHtml(bruto) : bruto).slice(0, 8000),
        html: esHtml ? bruto.slice(0, 400_000) : "",
        categorias: m.categories ?? [],
        adjuntos,
        enlace: m.webLink,
        conversacion: m.conversationId ?? "",
        leido: Boolean(m.isRead),
      });
    }
    if (action === "correo_hilo") {
      requiere("correo");
      const m = await graph(t, `/me/messages/${encodeURIComponent(text(body.id, 300))}?$select=conversationId`);
      const conv = String(m.conversationId ?? "").replace(/'/g, "''");
      if (!conv) return json({ mensajes: [] });
      const d = await graph(t, `/me/messages?$top=15&$filter=${encodeURIComponent(`conversationId eq '${conv}'`)}&$select=id,subject,from,receivedDateTime,body`);
      const mensajes = (d.value ?? [])
        .map((x: Any) => ({ id: x.id, asunto: x.subject ?? "", de: x.from?.emailAddress?.name ?? x.from?.emailAddress?.address ?? "", fecha: x.receivedDateTime, texto: sinHtml(String(x.body?.content ?? "")).slice(0, 3000) }))
        .sort((a: Any, b: Any) => String(a.fecha).localeCompare(String(b.fecha)));
      return json({ mensajes });
    }
    if (action === "correo_adjunto") {
      requiere("correo");
      const a = await graph(t, `/me/messages/${encodeURIComponent(text(body.id, 300))}/attachments/${encodeURIComponent(text(body.adjunto, 300))}`);
      if (a["@odata.type"] !== "#microsoft.graph.fileAttachment" || !a.contentBytes) return json({ error: "Ese adjunto no se puede descargar aquí. Ábralo en Outlook." }, 400);
      if (Number(a.size) > LEER_MAX) return json({ error: "El adjunto es muy grande para descargarlo aquí (máximo 8 MB). Ábralo en Outlook." }, 400);
      return json({ nombre: a.name, tipo: a.contentType, tamano: a.size, b64: a.contentBytes });
    }
    if (action === "correo_carpetas") {
      requiere("correo");
      const d = await graph(t, "/me/mailFolders?$top=40&$select=id,displayName,unreadItemCount");
      return json({ carpetas: (d.value ?? []).map((f: Any) => ({ id: f.id, nombre: f.displayName, sin_leer: f.unreadItemCount })) });
    }
    if (action === "correo_organizar") {
      requiere("correo");
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
      requiere("correo");
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
      requiere("correo");
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
      requiere("agenda");
      const desde = iso(body.desde);
      const hasta = iso(body.hasta);
      if (!desde || !hasta) return json({ error: "Falta el rango de fechas." }, 400);
      // calendarView: el rango va como hora de Bogotá (con su desfase) y los eventos vuelven en esa zona.
      return json({ eventos: await semana(t, `${desde}-05:00`, `${hasta}-05:00`) });
    }
    if (action === "agenda_detalle") {
      requiere("agenda");
      const e = await graph(t, `/me/events/${encodeURIComponent(text(body.id, 300))}?$select=${CAMPOS_EVENTO},body,attendees,webLink,reminderMinutesBeforeStart,isReminderOn,recurrence`);
      const html = String(e.body?.contentType).toLowerCase() === "html" ? String(e.body?.content ?? "") : "";
      return json({
        evento: {
          ...resumenEvento(e),
          enlace: e.webLink ?? null,
          cuerpoHtml: html.slice(0, 200_000),
          cuerpoTexto: html ? sinHtml(html).slice(0, 6000) : String(e.body?.content ?? "").slice(0, 6000),
          recordatorio: e.isReminderOn ? Number(e.reminderMinutesBeforeStart ?? 0) : null,
          periodica: Boolean(e.recurrence) || e.type === "occurrence" || e.type === "exception",
          asistentes: (e.attendees ?? []).map((a: Any) => ({ nombre: a.emailAddress?.name ?? "", correo: a.emailAddress?.address ?? "", tipo: a.type ?? "required", respuesta: a.status?.response ?? "none" })).slice(0, 80),
        },
      });
    }
    if (action === "agenda_crear") {
      requiere("agenda");
      const inicio = iso(body.inicio);
      const fin = iso(body.fin);
      if (!inicio || !fin || !text(body.titulo, 200).trim()) return json({ error: "Faltan el título o las horas." }, 400);
      if (fin <= inicio) return json({ error: "La reunión debe terminar después de empezar." }, 400);
      const teams = body.teams !== false;
      const recordatorio = Number.isFinite(Number(body.recordatorio)) && body.recordatorio !== null && body.recordatorio !== undefined ? Math.min(Math.max(Number(body.recordatorio), 0), 10080) : null;
      const ev = await graph(t, "/me/events", {
        method: "POST",
        body: JSON.stringify({
          subject: text(body.titulo, 200),
          start: { dateTime: inicio, timeZone: TZ },
          end: { dateTime: fin, timeZone: TZ },
          body: { contentType: "html", content: aHtml(text(body.cuerpo, 4000)) },
          ...(text(body.lugar, 200) ? { location: { displayName: text(body.lugar, 200) } } : {}),
          attendees: (Array.isArray(body.asistentes) ? body.asistentes : []).slice(0, 30).map((a: string) => ({ emailAddress: { address: text(a, 200) }, type: "required" })),
          ...(recordatorio !== null ? { isReminderOn: true, reminderMinutesBeforeStart: recordatorio } : {}),
          ...(teams ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
        }),
      });
      let joinUrl: string | null = ev.onlineMeeting?.joinUrl ?? null;
      if (teams && !joinUrl) {
        // A veces el enlace de Teams tarda un instante en estar listo: se vuelve a pedir una vez.
        await new Promise((r) => setTimeout(r, 800));
        joinUrl = (await graph(t, `/me/events/${encodeURIComponent(ev.id)}?$select=onlineMeeting`).catch(() => ({}))).onlineMeeting?.joinUrl ?? null;
      }
      const cuando = new Date(`${inicio}-05:00`).toISOString();
      await admin.from("pw_recordatorios").insert({ user_id: user.id, tipo: "reunion", titulo: text(body.titulo, 200), inicia_en: cuando, origen: "pilo", graph_id: ev.id });
      return json({ ok: true, id: ev.id, enlace: ev.webLink ?? null, joinUrl, evento: resumenEvento({ ...ev, onlineMeeting: { joinUrl } }) });
    }
    if (action === "agenda_editar") {
      requiere("agenda");
      const id = text(body.id, 300);
      const cambios: Record<string, unknown> = {};
      if (body.titulo !== undefined) {
        if (!text(body.titulo, 200).trim()) return json({ error: "El título no puede quedar vacío." }, 400);
        cambios.subject = text(body.titulo, 200);
      }
      if (body.inicio !== undefined || body.fin !== undefined) {
        const inicio = iso(body.inicio);
        const fin = iso(body.fin);
        if (!inicio || !fin || fin <= inicio) return json({ error: "Revise la hora de inicio y de fin." }, 400);
        cambios.start = { dateTime: inicio, timeZone: TZ };
        cambios.end = { dateTime: fin, timeZone: TZ };
      }
      if (body.cuerpo !== undefined) cambios.body = { contentType: "html", content: aHtml(text(body.cuerpo, 4000)) };
      if (body.lugar !== undefined) cambios.location = { displayName: text(body.lugar, 200) };
      if (!Object.keys(cambios).length) return json({ ok: true });
      const ev = await graph(t, `/me/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(cambios) });
      if (cambios.subject || cambios.start) {
        const fila: Record<string, unknown> = {};
        if (cambios.subject) fila.titulo = cambios.subject;
        if (cambios.start) fila.inicia_en = new Date(`${iso(body.inicio)}-05:00`).toISOString();
        await admin.from("pw_recordatorios").update(fila).eq("user_id", user.id).eq("graph_id", id);
      }
      return json({ ok: true, evento: resumenEvento(ev) });
    }
    if (action === "agenda_eliminar") {
      requiere("agenda");
      const id = text(body.id, 300);
      const e = await graph(t, `/me/events/${encodeURIComponent(id)}?$select=isOrganizer,attendees`);
      const conInvitados = Boolean(e.isOrganizer) && (e.attendees ?? []).length > 0;
      // Quien organiza una reunión con invitados la CANCELA (les avisa); en los demás casos se elimina de su calendario.
      if (conInvitados) await graph(t, `/me/events/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ comment: "Reunión cancelada por quien la organizó." }) });
      else await graph(t, `/me/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      await admin.from("pw_recordatorios").delete().eq("user_id", user.id).eq("graph_id", id);
      return json({ ok: true, cancelada: conInvitados });
    }
    if (action === "agenda_libres") {
      requiere("agenda");
      const desde = iso(body.desde);
      const hasta = iso(body.hasta);
      const minutos = Math.min(Math.max(Number(body.minutos) || 45, 15), 240);
      if (!desde || !hasta) return json({ error: "Falta el rango de fechas." }, 400);
      const ocupados = (await semana(t, `${desde}-05:00`, `${hasta}-05:00`)).filter((e: Any) => e.estado !== "free").map((e: Any) => [new Date(`${e.inicio}-05:00`).getTime(), new Date(`${e.fin}-05:00`).getTime()]);
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

    /* ----------------------------- Archivos (OneDrive y SharePoint) ----------------------------- */
    if (action === "archivos_sitios") {
      requiere("archivos");
      const q = text(body.q, 80).trim();
      const lista = q
        ? await graphTodo(t, `/sites?search=${encodeURIComponent(q)}&$select=id,displayName,webUrl&$top=25`, 25)
        : await graphTodo(t, "/me/followedSites?$select=id,displayName,webUrl", 60);
      return json({ sitios: lista.map((s: Any) => ({ id: s.id, nombre: s.displayName ?? s.name ?? "(sitio)", url: s.webUrl ?? "" })) });
    }
    if (action === "archivos_bibliotecas") {
      requiere("archivos");
      const d = await graph(t, `/sites/${encodeURIComponent(text(body.sitio, 300))}/drives?$select=id,name,webUrl,driveType`);
      return json({ bibliotecas: (d.value ?? []).map((x: Any) => ({ id: x.id, nombre: x.name, url: x.webUrl ?? "" })) });
    }
    if (action === "archivos_listar") {
      requiere("archivos");
      const drive = text(body.drive, 300) || "me";
      const q = text(body.q, 120).trim();
      let ruta: string;
      if (typeof body.siguiente === "string" && body.siguiente) {
        if (!body.siguiente.startsWith(`${GRAPH}/`)) return json({ error: "Enlace de página no válido." }, 400);
        ruta = body.siguiente;
      } else if (q) ruta = `${itemRuta(drive, "root")}/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$select=${CAMPOS_ITEM}&$top=50`;
      else ruta = `${itemRuta(drive, text(body.item, 300))}/children?$select=${CAMPOS_ITEM}&$top=100`;
      const d = await graph(t, ruta);
      return json({ items: (d.value ?? []).map(resumenItem), siguiente: d["@odata.nextLink"] ?? null });
    }
    if (action === "archivos_leer") {
      requiere("archivos");
      const drive = text(body.drive, 300) || "me";
      const ruta = itemRuta(drive, text(body.item, 300));
      const meta = await graph(t, `${ruta}?$select=${CAMPOS_ITEM}`);
      if (meta.folder) return json({ error: "Eso es una carpeta, no un archivo." }, 400);
      const tamano = Number(meta.size ?? 0);
      if (tamano > LEER_MAX) return json({ error: "El archivo es muy grande para leerlo aquí (máximo 8 MB). Ábralo en OneDrive o SharePoint.", tamano }, 400);
      const r = await graphRaw(t, `${ruta}/content`);
      if (!r.ok) return await errorGraph(r, ruta);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const nombre = String(meta.name ?? "");
      const esTexto = /\.(txt|md|csv|tsv|json|xml|html?|log|yml|yaml)$/i.test(nombre) || String(meta.file?.mimeType ?? "").startsWith("text/");
      if (esTexto) {
        const bruto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        return json({ nombre, tamano, tipo: meta.file?.mimeType ?? "", url: meta.webUrl ?? "", texto: (/\.html?$/i.test(nombre) ? sinHtml(bruto) : bruto).slice(0, 60_000), truncado: bruto.length > 60_000 });
      }
      return json({ nombre, tamano, tipo: meta.file?.mimeType ?? "", url: meta.webUrl ?? "", b64: b64(bytes) });
    }
    if (action === "archivos_crear_carpeta") {
      requiere("archivos");
      const nombre = text(body.nombre, 250).trim();
      const mal = nombreValido(nombre);
      if (mal) return json({ error: mal }, 400);
      const c = await graph(t, `${itemRuta(text(body.drive, 300) || "me", text(body.padre, 300))}/children`, { method: "POST", body: JSON.stringify({ name: nombre, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) }).catch((e) => {
        if (e?.conflicto) throw new Error("Ya existe una carpeta con ese nombre.");
        throw e;
      });
      return json({ ok: true, item: resumenItem(c) });
    }
    if (action === "archivos_subir_simple") {
      requiere("archivos");
      const nombre = text(body.nombre, 250).trim();
      const mal = nombreValido(nombre);
      if (mal) return json({ error: mal }, 400);
      const bytes = unb64(text(body.b64, SIMPLE_MAX * 2));
      if (!bytes.length) return json({ error: "El archivo está vacío." }, 400);
      if (bytes.length > SIMPLE_MAX) return json({ error: "Para archivos de más de 1 MiB se usa la subida por partes." }, 400);
      const padre = text(body.padre, 300);
      const ruta = `${itemRuta(text(body.drive, 300) || "me", padre)}:/${encodeURIComponent(nombre)}:/content?@microsoft.graph.conflictBehavior=${conflictoValido(body.conflicto)}`;
      const r = await graphRaw(t, ruta, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
      if (!r.ok) return await errorGraph(r, ruta);
      return json({ ok: true, item: resumenItem(await r.json().catch(() => ({}))) });
    }
    if (action === "archivos_sesion") {
      requiere("archivos");
      const nombre = text(body.nombre, 250).trim();
      const mal = nombreValido(nombre);
      if (mal) return json({ error: mal }, 400);
      const tamano = Number(body.tamano);
      if (!Number.isFinite(tamano) || tamano <= 0) return json({ error: "El archivo está vacío." }, 400);
      if (tamano > subida_max_mb * 1024 * 1024) return json({ error: `El archivo pasa el máximo de ${subida_max_mb} MB.` }, 400);
      const ruta = `${itemRuta(text(body.drive, 300) || "me", text(body.padre, 300))}:/${encodeURIComponent(nombre)}:/createUploadSession`;
      const s = await graph(t, ruta, { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": conflictoValido(body.conflicto), name: nombre } }) });
      if (!s.uploadUrl) return json({ error: "Microsoft no abrió la subida. Intente de nuevo." }, 502);
      return json({ ok: true, uploadUrl: s.uploadUrl, vence: s.expirationDateTime ?? null });
    }
    if (action === "archivos_trozo") {
      requiere("archivos");
      const u = text(body.uploadUrl, 3000);
      if (!hostSubida(u)) return json({ error: "Dirección de subida no válida." }, 400);
      const desde = Number(body.desde);
      const hasta = Number(body.hasta);
      const total = Number(body.total);
      const bytes = unb64(text(body.b64, 16 * 1024 * 1024));
      if (!(desde >= 0 && hasta >= desde && total > hasta && bytes.length === hasta - desde + 1)) return json({ error: "Rango de subida no válido." }, 400);
      // La uploadUrl ya va autenticada: no se le manda el token (Microsoft responde 401 si se manda).
      const r = await fetch(u, { method: "PUT", signal: AbortSignal.timeout(60_000), headers: { "Content-Length": String(bytes.length), "Content-Range": `bytes ${desde}-${hasta}/${total}` }, body: bytes });
      const data = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 202) return json({ error: String(data?.error?.message ?? `Microsoft respondió ${r.status}.`).slice(0, 200), status: r.status }, r.status === 416 ? 409 : 502);
      return json({ ok: true, status: r.status, siguiente: data.nextExpectedRanges ?? null, item: r.status === 200 || r.status === 201 ? resumenItem(data) : null });
    }
    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Algo falló con Microsoft 365." }, 502);
  }
});
