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

     { action: "imagenes", start?, limite?, ods? }   (0146) repasa las notas
       aprobadas ya cargadas (de un ODS, si se da), vuelve a pedir cada página y
       guarda sus imágenes en news_images. Salta las que ya tienen imágenes.
       → { ok, seen, saved, next, fin }

     { action: "evaluar", perfil, start?, limite?, reevaluar? }   (0242) lee con un perfil de
       ranking las notas ya guardadas, sin descargar nada. → { ok, seen, saved, next, fin }

     { action: "nuevas" }   con el encabezado x-noticias-cron (secreto NOTICIAS_CRON):
       lee la primera página de cada fuente y guarda lo nuevo del año en curso.
       Pensada para una tarea diaria (pg_cron o cron externo).

   Reglas:
     · Con sesión: solo Planeación o administración.
     · Una nota que ya existe no se toca: su estado y sus ODS corregidos a mano
       se respetan.
     · Perfiles (0242): una descarga se lee una sola vez y se evalúa con cada
       perfil que recibe noticias (perfiles.ts): ODS en news_items y news_ods,
       los demás en news_profile_notes y news_temas. Sin 0242, solo ODS, como antes.
     · Con 0144, una nota con CUALQUIER coincidencia del léxico (aunque no
       llegue al umbral) queda «pending» con ai_status = 'pendiente': Mr. Pilo
       la lee después (función noticias-pilo). Una sin ninguna coincidencia se
       guarda como «no» (así no se vuelve a descargar), sin gastar IA, y
       Planeación puede rescatarla. Sin 0144, se guarda como antes.
     · Una nota cada ~450 ms, con un identificador claro, para ser amable con el
       servidor de la Universidad.

   Despliegue:
     supabase functions deploy noticias-ods --no-verify-jwt
     supabase secrets set NOTICIAS_CRON=<un valor largo al azar>
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { extracto, leer } from "./clasificar.ts";
import { enlacesDelListado, imagenesDeK2, leerK2, tamanoOg, type ImagenNota } from "./parseo.ts";
import { hablaDeMenores } from "../pilo-rankingsod/logica.ts";
import { PERFIL_IDS, opcionesOds } from "./perfiles.ts";
import type { PerfilId } from "./perfiles.ts";
import { cargarPerfiles, evaluarEnPerfiles, fuenteDeUrl, leeDeLaFuente, reevaluarNota } from "./perfiles-db.ts";
import type { Perfiles } from "./perfiles-db.ts";

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
  /** 0146: la portada y las imágenes del texto. */
  imagenes: ImagenNota[];
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
    imagenes: imagenesDeK2(k2, host, tamanoOg(html)),
  };
}

/**
 * Guarda las imágenes de una nota sin repetir (news_images_unique). Los
 * menores se marcan por el texto de la nota: Pilo no ve las imágenes. Sin la
 * migración 0146 no hace nada.
 */
async function guardarImagenes(admin: ReturnType<typeof createClient>, newsId: string, nota: Pick<Nota, "title" | "body" | "imagenes">): Promise<number> {
  if (!nota.imagenes.length) return 0;
  const menores = hablaDeMenores({ title: nota.title, body: nota.body });
  const { data, error } = await admin
    .from("news_images")
    .upsert(
      nota.imagenes.map((i) => ({ news_id: newsId, url: i.url, width: i.width, height: i.height, caption: i.caption.slice(0, 400), credit: i.credit.slice(0, 200), pos: i.pos, is_cover: i.is_cover, kind: i.kind, minors: menores, alt: i.alt.slice(0, 400) })),
      { onConflict: "news_id,url", ignoreDuplicates: true },
    )
    .select("id");
  return error ? 0 : (data ?? []).length;
}

interface Resultado {
  seen: number;
  saved: number;
  skipped: number;
  next: number;
  fin: boolean;
}

async function cargarFuente(admin: ReturnType<typeof createClient>, clave: string, start: number, year: number, pages: number, perfiles: Perfiles): Promise<Resultado> {
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
      // El perfil ODS (valores de fábrica = lo de siempre); los demás perfiles la leen al guardarla, una sola descarga.
      const cfgOds = perfiles.ods;
      const { afinidad, candidata, propia } = leeDeLaFuente(cfgOds, clave) ? leer(nota.title, nota.body, opcionesOds(cfgOds)) : { afinidad: [], candidata: false, propia: null };
      const propone = afinidad.length > 0 || Boolean(propia);
      const guardar = (conPilo: boolean) =>
        admin
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
              state: propone || (conPilo && candidata) ? "pending" : "no",
              ...(conPilo ? { ai_status: candidata ? "pendiente" : "none" } : {}),
            },
            { onConflict: "url", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
      let conPilo = true;
      let { data: fila, error } = await guardar(true);
      // Sin la migración 0144 la columna ai_status no existe: se guarda como antes.
      if (error && /ai_status|PGRST204|42703/.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
        conPilo = false;
        ({ data: fila, error } = await guardar(false));
      }
      if (error || !fila) continue;
      await guardarImagenes(admin, fila.id, nota);
      await evaluarEnPerfiles(admin, perfiles, { id: fila.id, title: nota.title, body: nota.body }, clave);
      if (propone || (conPilo && candidata)) {
        if (afinidad.length) await admin.from("news_ods").insert(afinidad.map((a) => ({ news_id: fila.id, ods: a.ods, score: a.score, reason: a.reason, manual: false })));
        if (propia) await admin.from("news_temas").upsert({ news_id: fila.id, profile: "ods", tema: "propio", score: propia.score, reason: propia.reason.slice(0, 300), manual: false, by_ai: false }, { onConflict: "news_id,profile,tema", ignoreDuplicates: true });
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

  let cuerpo: { action?: string; fuente?: string; start?: number; year?: number; pages?: number; limite?: number; ods?: number; perfil?: string; reevaluar?: boolean } = {};
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
    const { perfiles } = await cargarPerfiles(admin);
    const r = await cargarFuente(admin, fuente, start, year, pages, perfiles);
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: `${fuente} ${year} (${autor ? "intranet" : "cron"})`, seen: r.seen, saved: r.saved, skipped: r.skipped });
    return json({ ok: true, ...r });
  }

  if (action === "imagenes") {
    // Las notas aprobadas ya cargadas, en orden estable; se saltan las que ya tienen imágenes.
    const start = Math.max(0, Math.min(50_000, Math.floor(Number(cuerpo.start) || 0)));
    const limite = Math.max(1, Math.min(8, Math.floor(Number(cuerpo.limite) || 5)));
    const ods = Math.floor(Number(cuerpo.ods) || 0);
    const inicio = new Date().toISOString();
    let consulta = admin
      .from("news_items")
      .select(ods ? "id, url, title, body, news_images(id), news_ods!inner(ods)" : "id, url, title, body, news_images(id)")
      .eq("state", "ok")
      .order("created_at", { ascending: true })
      .range(start, start + limite - 1);
    if (ods >= 1 && ods <= 17) consulta = consulta.eq("news_ods.ods", ods);
    const { data, error } = await consulta;
    if (error) return json({ error: /news_images|42P01|PGRST2/.test(`${error.code} ${error.message}`) ? "Falta aplicar la migración 0146." : error.message, code: "migracion" }, 500);
    type Fila = { id: string; url: string; title: string; body: string; news_images: { id: string }[] | null };
    const filas = (data ?? []) as unknown as Fila[];
    let seen = 0;
    let saved = 0;
    for (const f of filas) {
      seen++;
      if ((f.news_images ?? []).length) continue;
      let destino: URL;
      try {
        destino = new URL(f.url);
      } catch {
        continue;
      }
      if (destino.protocol !== "https:" || !/(^|\.)udes\.edu\.co$/.test(destino.hostname)) continue;
      await dormir(450);
      const nota = await leerNota(destino.hostname, destino.pathname, "");
      if (!nota) continue;
      saved += await guardarImagenes(admin, f.id, { title: f.title, body: f.body, imagenes: nota.imagenes });
    }
    const fin = filas.length < limite;
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: `imagenes${ods ? ` ODS ${ods}` : ""} (intranet)`, seen, saved, skipped: 0 });
    return json({ ok: true, seen, saved, next: start + filas.length, fin });
  }

  if (action === "evaluar") {
    // Lee con un perfil las notas que ya están guardadas (sin descargar nada): las de un perfil nuevo o las que
    // recibirían una palabra propia. Con reevaluar, las que nadie ha decidido ni Pilo leído se vuelven a puntuar.
    const perfil = String(cuerpo.perfil ?? "") as PerfilId;
    if (!PERFIL_IDS.includes(perfil)) return json({ error: "Perfil desconocido." }, 400);
    const start = Math.max(0, Math.min(100_000, Math.floor(Number(cuerpo.start) || 0)));
    const limite = Math.max(1, Math.min(300, Math.floor(Number(cuerpo.limite) || 150)));
    const { perfiles, hay } = await cargarPerfiles(admin);
    if (!hay) return json({ error: "Falta aplicar la migración 0242 (perfiles del recolector).", code: "migracion" }, 500);
    const cfg = perfiles[perfil];
    const inicio = new Date().toISOString();
    const { data, error } = await admin
      .from("news_items")
      .select("id, url, title, body, state, reviewed_by, decided_by")
      .order("created_at", { ascending: true })
      .range(start, start + limite - 1);
    if (error) return json({ error: error.message }, 500);
    type FilaEv = { id: string; url: string; title: string; body: string; state: string; reviewed_by: string | null; decided_by: string | null };
    const filas = (data ?? []) as FilaEv[];
    let saved = 0;
    for (const f of filas) {
      const fuente = fuenteDeUrl(f.url);
      if (perfil === "ods") {
        // El perfil ODS no cambia: solo suma las coincidencias con sus palabras propias.
        if (!cfg.palabras.length || !leeDeLaFuente(cfg, fuente)) continue;
        const { propia } = leer(f.title, f.body, opcionesOds(cfg));
        if (!propia) continue;
        const { data: nuevo } = await admin
          .from("news_temas")
          .upsert({ news_id: f.id, profile: "ods", tema: "propio", score: propia.score, reason: propia.reason.slice(0, 300), manual: false, by_ai: false }, { onConflict: "news_id,profile,tema", ignoreDuplicates: true })
          .select("news_id");
        if (!(nuevo ?? []).length) continue;
        saved++;
        if (f.state === "no" && !f.reviewed_by && !f.decided_by) await admin.from("news_items").update({ state: "pending", ai_status: "pendiente" }).eq("id", f.id).eq("state", "no").is("reviewed_by", null).is("decided_by", null);
      } else {
        saved += await evaluarEnPerfiles(admin, perfiles, f, fuente, perfil);
        if (cuerpo.reevaluar === true && cfg.recibe && (await reevaluarNota(admin, perfiles, f, perfil))) saved++;
      }
    }
    const fin = filas.length < limite;
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: `evaluar ${perfil} (intranet)`, seen: filas.length, saved, skipped: 0 });
    return json({ ok: true, seen: filas.length, saved, next: start + filas.length, fin });
  }

  if (action === "nuevas") {
    const total = { seen: 0, saved: 0, skipped: 0 };
    const inicio = new Date().toISOString();
    const { perfiles } = await cargarPerfiles(admin);
    for (const clave of Object.keys(FUENTES)) {
      const r = await cargarFuente(admin, clave, 0, anioActual, 1, perfiles);
      total.seen += r.seen;
      total.saved += r.saved;
      total.skipped += r.skipped;
    }
    await admin.from("news_runs").insert({ started_at: inicio, finished_at: new Date().toISOString(), source: "nuevas (cron)", ...total });
    return json({ ok: true, ...total });
  }

  return json({ error: "Acción desconocida." }, 400);
});
