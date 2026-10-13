/* =============================================================================
   Edge Function · noticias-ods

   El recolector de noticias de UDES Sostenible. Recorre las páginas de noticias
   de udes.edu.co, guarda cada nota en `news_items` (migración 0143) y le
   propone los ODS que toca (clasificar.ts, sin IA). Planeación revisa el
   resultado en /admin/rankings; el público solo ve lo aprobado.

   Una llamada procesa pocas páginas del listado para no pasar del tiempo de la
   función; la intranet repite la llamada con el `next` que recibe hasta que
   llega `fin`.

     { action: "cargar", fuente, start, year, pages }
         fuente  una de FUENTES (nunca una dirección libre: no hay SSRF posible)
         start   desplazamiento del listado (0, 10, 20…); cada página trae 10
         year    solo se guardan las notas de ese año (por defecto, el actual)
         pages   cuántas páginas del listado en esta llamada (1 o 2)
       → { ok, seen, saved, skipped, next, fin }

     { action: "nuevas" }   con el encabezado x-noticias-cron (secreto NOTICIAS_CRON):
       lee la primera página de cada fuente y guarda lo nuevo del año en curso.
       Pensada para una tarea diaria (pg_cron o cron externo).

   Reglas:
     · Con sesión: solo Planeación o administración.
     · Una nota que ya existe no se toca: su estado y sus ODS corregidos a mano
       se respetan.
     · Una nota sin ningún ODS por encima del umbral se guarda como «no» (así no
       se vuelve a descargar) y Planeación puede rescatarla.
     · Una nota cada ~450 ms, con un identificador claro, para ser amable con el
       servidor de la Universidad.

   Despliegue:
     supabase functions deploy noticias-ods --no-verify-jwt
     supabase secrets set NOTICIAS_CRON=<un valor largo al azar>
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { clasificar, extracto } from "./clasificar.ts";
import { enlacesDelListado, leerK2 } from "./parseo.ts";

const FUENTES: Record<string, { host: string; ruta: string; sede: string; seccion: string }> = {
  comunicaciones: { host: "udes.edu.co", ruta: "/comunicaciones/noticias", sede: "", seccion: "Comunicaciones" },
  investigacion: { host: "udes.edu.co", ruta: "/investigacion/noticias", sede: "", seccion: "Investigación" },
  extension: { host: "udes.edu.co", ruta: "/extension/noticias", sede: "", seccion: "Extensión" },
  bucaramanga: { host: "bucaramanga.udes.edu.co", ruta: "/comunicaciones/noticias", sede: "Bucaramanga", seccion: "Comunicaciones" },
  cucuta: { host: "cucuta.udes.edu.co", ruta: "/comunicaciones/noticias", sede: "Cúcuta", seccion: "Comunicaciones" },
  valledupar: { host: "valledupar.udes.edu.co", ruta: "/comunicaciones/noticias", sede: "Valledupar", seccion: "Comunicaciones" },
  bogota: { host: "bogota.udes.edu.co", ruta: "/comunicaciones/noticias", sede: "Bogotá", seccion: "Comunicaciones" },
};

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-noticias-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AGENTE = "UDES-Planeacion-Recolector/1.0 (+https://planeacion.udes.edu.co)";

async function bajar(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": AGENTE, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const final = new URL(r.url);
    if (!/(^|\.)udes\.edu\.co$/.test(final.hostname)) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const aTexto = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&(?:aacute|eacute|iacute|oacute|uacute|ntilde);/gi, (e) => ({ "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ" } as Record<string, string>)[e.toLowerCase()] ?? e)
    .replace(/\s+/g, " ")
    .trim();

interface Nota {
  url: string;
  title: string;
  body: string;
  image_url: string | null;
  published_on: string | null;
  section: string;
}

async function leerNota(host: string, ruta: string, seccion: string): Promise<Nota | null> {
  const url = `https://${host}${ruta}`;
  const html = await bajar(url);
  if (!html) return null;
  const k2 = leerK2(html);
  if (!k2) return null;
  const titulo = aTexto(String(k2.title ?? ""));
  if (!titulo) return null;
  const cuerpo = aTexto(String(k2.introtext ?? "") + " " + String(k2.fulltext ?? ""));
  const fecha = String(k2.publish_up ?? k2.created ?? "").slice(0, 10);
  const imagenRel = typeof k2.imageXLarge === "string" && k2.imageXLarge ? k2.imageXLarge : null;
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  const imagen = imagenRel ? new URL(imagenRel, `https://${host}`).toString() : og;
  const cat = (k2.category as { name?: string } | undefined)?.name;
  return {
    url,
    title: titulo,
    body: cuerpo,
    image_url: imagen && imagen.startsWith("https://") ? imagen : null,
    published_on: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    section: cat || seccion,
  };
}

interface Resultado {
  seen: number;
  saved: number;
  skipped: number;
  next: number;
  fin: boolean;
}

async function cargarFuente(admin: ReturnType<typeof createClient>, clave: string, start: number, year: number, pages: number): Promise<Resultado> {
  const f = FUENTES[clave];
  const r: Resultado = { seen: 0, saved: 0, skipped: 0, next: start, fin: false };
  let viejas = 0;
  for (let p = 0; p < pages; p++) {
    const desplazamiento = start + p * 10;
    const listado = await bajar(`https://${f.host}${f.ruta}?start=${desplazamiento}`);
    if (!listado) {
      r.fin = true;
      break;
    }
    const enlaces = enlacesDelListado(listado);
    if (!enlaces.length) {
      r.fin = true;
      break;
    }
    const urls = enlaces.map((e) => `https://${f.host}${e}`);
    const { data: ya } = await admin.from("news_items").select("url").in("url", urls);
    const existentes = new Set((ya ?? []).map((x: { url: string }) => x.url));
    let viejasPagina = 0;
    for (const e of enlaces) {
      const url = `https://${f.host}${e}`;
      r.seen++;
      if (existentes.has(url)) continue;
      await dormir(450);
      const nota = await leerNota(f.host, e, f.seccion);
      if (!nota) continue;
      const anio = nota.published_on ? Number(nota.published_on.slice(0, 4)) : 0;
      if (anio && anio < year) {
        viejasPagina++;
        continue;
      }
      if (anio !== year) continue;
      const afinidad = clasificar(nota.title, nota.body);
      const { data: fila, error } = await admin
        .from("news_items")
        .upsert(
          {
            url: nota.url,
            title: nota.title,
            excerpt: extracto(nota.body),
            body: nota.body,
            image_url: nota.image_url,
            published_on: nota.published_on,
            section: nota.section,
            campus: f.sede,
            state: afinidad.length ? "pending" : "no",
          },
          { onConflict: "url", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error || !fila) continue;
      if (afinidad.length) {
        await admin.from("news_ods").insert(afinidad.map((a) => ({ news_id: fila.id, ods: a.ods, score: a.score, reason: a.reason, manual: false })));
        r.saved++;
      } else {
        r.skipped++;
      }
    }
    viejas += viejasPagina;
    r.next = desplazamiento + 10;
    // El listado va de lo nuevo a lo viejo: con varias notas anteriores al año ya no hay más que guardar.
    if (viejas >= 3) {
      r.fin = true;
      break;
    }
  }
  return r;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: { action?: string; fuente?: string; start?: number; year?: number; pages?: number } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const action = cuerpo.action ?? "";

  const cron = request.headers.get("x-noticias-cron");
  let autor: string | null = null;
  if (cron) {
    const secreto = ENV("NOTICIAS_CRON");
    if (!secreto || action !== "nuevas" || cron !== secreto) return json({ error: "No autorizado." }, 401);
  } else {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const who = await caller.auth.getUser();
    if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);
    const { data: perfil } = await caller.from("profiles").select("role, is_active").eq("id", who.data.user.id).maybeSingle();
    if (!perfil?.is_active || !["planeacion", "admin"].includes(perfil.role)) return json({ error: "Solo Planeación o la administración." }, 403);
    autor = who.data.user.id;
  }

  const anioActual = new Date().getFullYear();

  if (action === "cargar") {
    const fuente = String(cuerpo.fuente ?? "");
    if (!FUENTES[fuente]) return json({ error: "Fuente desconocida." }, 400);
    const start = Math.max(0, Math.min(20_000, Math.floor(Number(cuerpo.start) || 0)));
    const year = Math.floor(Number(cuerpo.year) || anioActual);
    if (year < 2015 || year > anioActual) return json({ error: "Año fuera de rango." }, 400);
    const pages = Math.max(1, Math.min(2, Math.floor(Number(cuerpo.pages) || 1)));
    const inicio = new Date().toISOString();
    const r = await cargarFuente(admin, fuente, start, year, pages);
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: `${fuente} ${year} (${autor ? "intranet" : "cron"})`, seen: r.seen, saved: r.saved, skipped: r.skipped });
    return json({ ok: true, ...r });
  }

  if (action === "nuevas") {
    const total = { seen: 0, saved: 0, skipped: 0 };
    const inicio = new Date().toISOString();
    for (const clave of Object.keys(FUENTES)) {
      const r = await cargarFuente(admin, clave, 0, anioActual, 1);
      total.seen += r.seen;
      total.saved += r.saved;
      total.skipped += r.skipped;
    }
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: "nuevas (cron)", ...total });
    return json({ ok: true, ...total });
  }

  return json({ error: "Acción desconocida." }, 400);
});
