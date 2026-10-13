/* =============================================================================
   Edge Function · pilo-rankingsod

   Mr. Pilo arma los informes ODS (migración 0145) con las noticias aprobadas
   del recolector (0143, 0144). La lógica pura (mensajes, validación del JSON,
   verificación de citas y cifras, elección de evidencia, fotos) está en
   logica.ts, con pruebas en tests/noticias/pilo-rankingsod.test.ts.

   Usa el mismo proveedor de Mr. Pilo: lo lee de pilo_ai_settings y
   pilo_ai_secret con la clave de servicio, como noticias-pilo. La clave nunca
   sale de aquí. No gasta el cupo diario de /pregunta (no escribe en
   pilo_ai_log): la bitácora es news_runs (source «Pilo redacta informes ODS»).

     { action: "informes", step: "estado", ods? }
       → { ok, ai, motivo?, indicadores? }   (con ods: los indicadores «ev» de ese ODS)
     { action: "informes", step: "plan", report_id }
       → { ok, plan: {hicimos, proyectos, cifras, descartadas}, indicadores }
     { action: "informes", step: "redactar", report_id, sec, block_id?, count? }
       → { ok, escritos, bloques, reserva, quedan, fallos }
     { action: "informes", step: "indicador", report_id, indicator }
       → { ok, news_id, candidatas, page_es, page_en, motivo? }
     { action: "informes", step: "fotos", report_id }
       → { ok, propuestas, menores, graficas, aviso }

   Reglas:
     · Solo Planeación o la administración, con sesión.
     · Pilo no reescribe párrafos «persona» ni «editado» (409) ni elecciones
       aprobadas (409), ni escribe en un informe publicado.
     · Un párrafo se guarda solo si cada cita es literal y cada cifra sale de
       las citas; si no, un reintento con el error y, si sigue mal, no se
       guarda y se devuelve el motivo.
     · No se empieza otra llamada al proveedor pasados 50 s; tope de 95 s por
       llamada. Un 429, 401 o 5xx del proveedor detiene el lote.

   Despliegue:
     supabase functions deploy pilo-rankingsod --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { foldSystem, roleRejected, textTarget } from "../noticias-pilo/logica.ts";
import { INDICADORES_THE } from "./indicadores.ts";
import {
  armarEleccion,
  AVISO_IMAGENES,
  enGrupos,
  esReserva,
  indicadoresConNoticias,
  leerAjustes,
  leerIndicador,
  leerParrafo,
  leerPlan,
  mensajesIndicador,
  mensajesParrafo,
  mensajesPlan,
  mensajesReintento,
  notasParaIndicador,
  notasSinUsar,
  NOTAS_POR_PARRAFO,
  ODS_NOMBRES,
  ordenarNotas,
  planGuardado,
  proponerFotos,
  puedeReescribir,
  SECCIONES_PILO,
  siguientePos,
  verificarParrafo,
  type BloqueExistente,
  type IndicadorParaPilo,
  type Lectura,
  type Mensaje,
  type NotaInforme,
  type Parrafo,
  type SeccionPilo,
} from "./logica.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PRESUPUESTO_MS = 50_000;
const TOPE_LLAMADA_MS = 95_000;
const FIN_MS = 140_000;
const FUENTE_BITACORA = "Pilo redacta informes ODS";

const INDICADORES: IndicadorParaPilo[] = INDICADORES_THE;

const faltaMigracion = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const MIGRACION = { error: "Falta aplicar la migración 0145 (Informes ODS con Pilo).", code: "migracion" };

/** El proveedor falló: se detiene todo y se dice por qué. */
class AltoProveedor extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function detalleProveedor(r: Response): Promise<string> {
  try {
    const t = await r.text();
    if (/^\s*</.test(t)) return "respondió una página web, no la API";
    try {
      const d = JSON.parse(t);
      return String(d?.message ?? d?.error?.message ?? d?.error ?? d?.detail ?? t).slice(0, 200);
    } catch {
      return t.slice(0, 200);
    }
  } catch {
    return "";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: { action?: string; step?: string; report_id?: string; sec?: string; block_id?: string; count?: number; indicator?: string } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const PASOS = ["estado", "plan", "redactar", "indicador", "fotos"];
  const step = PASOS.includes(String(cuerpo.step)) ? String(cuerpo.step) : PASOS.includes(String(cuerpo.action)) ? String(cuerpo.action) : "";
  if (!step) return json({ error: "Paso desconocido." }, 400);

  // Quién llama: solo Planeación o la administración, con sesión activa.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);
  const { data: perfil } = await admin.from("profiles").select("role, is_active").eq("id", who.data.user.id).maybeSingle();
  if (!perfil?.is_active || !["planeacion", "admin"].includes(perfil.role)) return json({ error: "Solo Planeación o la administración." }, 403);

  // El proveedor de Mr. Pilo (0089, 0091).
  const [{ data: settings }, { data: secret }, prueba] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("ods_reports").select("id", { count: "exact", head: true }),
  ]);
  if (prueba.error) return json(faltaMigracion(prueba.error) ? MIGRACION : { error: prueba.error.message }, 500);
  const proveedor = String(settings?.provider ?? "mistral");
  const clave = String(secret?.[`${proveedor}_key`] ?? "") || String(secret?.api_key ?? "");
  const destino = textTarget(proveedor, String(settings?.base_url ?? ""), String(settings?.chat_path ?? ""), String(settings?.text_model ?? ""));
  const motivo = !settings
    ? "Falta la migración 0089 de Mr. Pilo con IA."
    : !settings.enabled
      ? "Mr. Pilo con IA está apagado: la administración lo enciende en Mr. Pilo con IA › Conexión."
      : !(destino.url.startsWith("https://") && destino.model && clave)
        ? "Mr. Pilo con IA aún no está conectado: la administración debe poner el proveedor y la clave."
        : null;

  if (step === "estado") {
    const n = Math.floor(Number((cuerpo as { ods?: number }).ods));
    return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}), ...(n >= 1 && n <= 17 ? { indicadores: indicadoresConNoticias(INDICADORES, n) } : {}) });
  }

  // El informe -----------------------------------------------------------------
  const reportId = String(cuerpo.report_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return json({ error: "Falta el informe (report_id)." }, 400);
  const { data: informe, error: errInforme } = await admin.from("ods_reports").select("id, ods, edition, state, settings").eq("id", reportId).maybeSingle();
  if (errInforme) return json(faltaMigracion(errInforme) ? MIGRACION : { error: errInforme.message }, 500);
  if (!informe) return json({ error: "No existe ese informe." }, 404);
  if (informe.state === "publicado") return json({ error: "El informe está publicado: pásalo a revisión para que Pilo escriba en él.", code: "publicado" }, 409);
  const ods = { n: Number(informe.ods), name: ODS_NOMBRES[Number(informe.ods) - 1] ?? `ODS ${informe.ods}` };
  const edition = Number(informe.edition);
  const ajustes = leerAjustes(informe.settings);

  // Las notas aprobadas con este ODS, con su texto.
  const cargarNotas = async (): Promise<NotaInforme[]> => {
    const { data, error } = await admin
      .from("news_ods")
      .select("score, indicator, news_items!inner(id, title, body, published_on, section, campus, url, image_url, state)")
      .eq("ods", ods.n)
      .eq("news_items.state", "ok")
      .limit(500);
    if (error) throw error;
    type Fila = { score: number; indicator: string | null; news_items: Omit<NotaInforme, "score" | "indicator"> & { state: string } };
    return ((data ?? []) as unknown as Fila[])
      .filter((f) => f.news_items && f.news_items.body)
      .map((f) => ({ ...f.news_items, score: f.score, indicator: f.indicator }));
  };

  // Fotos: sin IA ------------------------------------------------------------------
  if (step === "fotos") {
    const [notas, bloques, elecciones, fotos] = await Promise.all([
      cargarNotas(),
      admin.from("ods_report_blocks").select("sources").eq("report_id", reportId).eq("enabled", true).eq("spare", false),
      admin.from("ods_report_indicators").select("news_id").eq("report_id", reportId),
      admin.from("ods_report_photos").select("news_id, slot, use").eq("report_id", reportId),
    ]);
    const usadas = new Set<string>([
      ...((bloques.data ?? []) as { sources: { news_id: string }[] | null }[]).flatMap((b) => (b.sources ?? []).map((s) => s.news_id)),
      ...((elecciones.data ?? []) as { news_id: string | null }[]).map((e) => e.news_id).filter((x): x is string => Boolean(x)),
    ]);
    const propuestas = proponerFotos(
      notas.filter((n) => usadas.has(n.id)),
      (fotos.data ?? []) as { news_id: string; slot: string; use: boolean }[],
    );
    if (propuestas.length) {
      const r = await admin.from("ods_report_photos").upsert(propuestas.map((p) => ({ report_id: reportId, ...p })), { onConflict: "report_id,news_id", ignoreDuplicates: true });
      if (r.error) return json({ error: r.error.message }, 500);
    }
    return json({
      ok: true,
      propuestas: propuestas.length,
      menores: propuestas.filter((p) => p.minors).length,
      graficas: propuestas.filter((p) => p.kind === "grafica").length,
      aviso: AVISO_IMAGENES,
    });
  }

  // Lo que necesita la IA --------------------------------------------------------------
  if (motivo) return json({ error: motivo, code: "sin_ia" }, 503);

  const inicio = Date.now();
  const plegar = settings?.system_role === "user";
  let llamadas = 0;

  const llamar = async (mensajes: Mensaje[], maxTokens: number): Promise<string> => {
    const pasado = Date.now() - inicio;
    const enviar = (doblar: boolean) =>
      fetch(destino.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(Math.max(10_000, Math.min(TOPE_LLAMADA_MS, FIN_MS - pasado))),
        body: JSON.stringify({
          model: destino.model,
          messages: doblar ? foldSystem(mensajes) : mensajes,
          temperature: 0.2,
          max_tokens: maxTokens,
          ...(proveedor === "mistral" ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    llamadas++;
    let respuesta: Response;
    try {
      respuesta = await enviar(plegar);
      if (!respuesta.ok && !plegar && (respuesta.status === 400 || respuesta.status === 422) && roleRejected(respuesta.status, await detalleProveedor(respuesta.clone()))) {
        await respuesta.body?.cancel();
        respuesta = await enviar(true);
      }
    } catch (e) {
      const tiempo = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new AltoProveedor(tiempo ? "El proveedor de Mr. Pilo tardó demasiado en responder. Intenta de nuevo." : "No se pudo llegar al proveedor de Mr. Pilo.", "proveedor", 502);
    }
    if (!respuesta.ok) {
      const detalle = await detalleProveedor(respuesta);
      if (respuesta.status === 429) throw new AltoProveedor("El proveedor limitó los pedidos (429): espera un minuto y sigue.", "limite_proveedor", 429);
      if (respuesta.status === 401 || respuesta.status === 403) throw new AltoProveedor(`El proveedor rechazó la clave (${respuesta.status}): la administración debe revisarla en Mr. Pilo con IA › Conexión.`, "clave", 502);
      throw new AltoProveedor(`El proveedor respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`, "proveedor", 502);
    }
    try {
      const datos = await respuesta.json();
      return String(datos?.choices?.[0]?.message?.content ?? "");
    } catch {
      return "";
    }
  };

  const hayTiempo = () => Date.now() - inicio < PRESUPUESTO_MS;

  /** Una llamada, su lectura y, si no pasa, un reintento con el error. */
  const llamarVerificado = async <T>(mensajes: Mensaje[], maxTokens: number, leer: (crudo: string) => Lectura<T> | { ok: false; error: string }): Promise<Lectura<T>> => {
    const crudo = await llamar(mensajes, maxTokens);
    const primera = leer(crudo);
    if (primera.ok) return primera;
    if (!hayTiempo()) return { ok: false, error: `${primera.error} No hubo tiempo de reintentar.` };
    const segunda = leer(await llamar(mensajesReintento(mensajes, crudo, primera.error), maxTokens));
    return segunda.ok ? segunda : { ok: false, error: segunda.error };
  };

  const bitacora = async (guardados: number, fallidos: number, error: string | null) => {
    if (!llamadas) return;
    await admin.from("news_runs").insert({
      started_at: new Date(inicio).toISOString(),
      finished_at: new Date().toISOString(),
      source: FUENTE_BITACORA,
      seen: llamadas,
      saved: guardados,
      skipped: fallidos,
      error: error ? error.slice(0, 300) : null,
    });
  };

  const alto = async (e: unknown, guardados = 0, fallidos = 0) => {
    if (e instanceof AltoProveedor) {
      await bitacora(guardados, fallidos, e.message);
      return json({ error: e.message, code: e.code }, e.status);
    }
    const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    await bitacora(guardados, fallidos, m);
    return json(faltaMigracion(e as { code?: string; message?: string }) ? MIGRACION : { error: m }, 500);
  };

  // Plan ------------------------------------------------------------------------------
  if (step === "plan") {
    try {
      const notas = ordenarNotas(await cargarNotas());
      if (!notas.length) return json({ error: `No hay notas aprobadas con el ODS ${ods.n}.`, code: "sin_notas" }, 409);
      const r = await llamarVerificado(mensajesPlan(ods, edition, notas), 1400, (c) => leerPlan(c, notas));
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró un plan que sirva: ${r.error}`, code: "verificacion" }, 422);
      }
      const plan = { ...r.valor, fallidas: [], at: new Date().toISOString() };
      const w = await admin
        .from("ods_reports")
        .update({ settings: { ...((informe.settings as Record<string, unknown>) ?? {}), plan } })
        .eq("id", reportId);
      if (w.error) throw w.error;
      await bitacora(1, 0, null);
      return json({ ok: true, plan, indicadores: indicadoresConNoticias(INDICADORES, ods.n) });
    } catch (e) {
      return alto(e);
    }
  }

  // Párrafos ------------------------------------------------------------------------------
  if (step === "redactar") {
    const sec = String(cuerpo.sec ?? "") as SeccionPilo;
    if (!SECCIONES_PILO.includes(sec)) return json({ error: "Pilo redacta solo «hicimos», «proyectos» y «cifras»; la tesis y lo que viene los escribe una persona." }, 400);
    const plan = planGuardado(informe.settings);
    if (!plan) return json({ error: "Primero arma el plan del informe.", code: "sin_plan" }, 409);
    let escritos = 0;
    const ids: string[] = [];
    let reserva = 0;
    const fallos: { notas: string[]; motivo: string }[] = [];
    try {
      const [notas, filas] = await Promise.all([
        cargarNotas(),
        admin.from("ods_report_blocks").select("id, sec, pos, origin, enabled, spare, sources").eq("report_id", reportId),
      ]);
      if (filas.error) throw filas.error;
      const bloques = (filas.data ?? []) as BloqueExistente[];
      const porId = new Map(notas.map((n) => [n.id, n]));

      let grupos: string[][];
      const bloqueId = cuerpo.block_id ? String(cuerpo.block_id) : null;
      if (bloqueId) {
        const b = bloques.find((x) => x.id === bloqueId);
        if (!b) return json({ error: "No existe ese párrafo en el informe." }, 404);
        const puede = puedeReescribir(b);
        if (!puede.ok) return json({ error: puede.motivo, code: "de_persona" }, 409);
        const propias = [...new Set((b.sources ?? []).map((s) => s.news_id))].filter((id) => porId.has(id));
        grupos = [propias.length ? propias : enGrupos(notasSinUsar(sec, plan, bloques), NOTAS_POR_PARRAFO[sec])[0] ?? []];
      } else {
        const cuantos = Math.max(1, Math.min(2, Math.floor(Number(cuerpo.count) || 1)));
        grupos = enGrupos(
          notasSinUsar(sec, plan, bloques).filter((id) => porId.has(id)),
          NOTAS_POR_PARRAFO[sec],
        ).slice(0, cuantos);
      }
      grupos = grupos.filter((g) => g.length);
      if (!grupos.length) return json({ ok: true, escritos: 0, bloques: [], reserva: 0, quedan: 0, fallos: [], motivo: "Pilo no tiene más notas del plan sin usar en esta sección." });

      for (const grupo of grupos) {
        if (escritos + fallos.length > 0 && !hayTiempo()) break;
        const delGrupo = grupo.map((id) => porId.get(id)!).filter(Boolean);
        const r = await llamarVerificado<Parrafo>(mensajesParrafo(ods, sec, ajustes, delGrupo), 900, (crudo) => {
          const l = leerParrafo(crudo, delGrupo, sec);
          if (!l.ok) return l;
          const v = verificarParrafo(l.valor, delGrupo);
          return v.ok ? { ok: true, valor: { ...l.valor, warn: v.warn } } : { ok: false, error: v.error ?? "No pasó la verificación." };
        });
        if (!r.ok) {
          fallos.push({ notas: grupo, motivo: r.error });
          continue;
        }
        const p = r.valor;
        if (bloqueId) {
          const w = await admin
            .from("ods_report_blocks")
            .update({ text: p.text, orig: p.text, sources: p.sources, figs: p.figs, warn: p.warn })
            .eq("id", bloqueId)
            .eq("origin", "pilo")
            .select("id");
          if (w.error) throw w.error;
          if (!w.data?.length) {
            await bitacora(0, 1, "Una persona cambió el párrafo mientras Pilo escribía.");
            return json({ error: "Una persona cambió el párrafo mientras Pilo escribía: no se reescribió.", code: "de_persona" }, 409);
          }
          ids.push(bloqueId);
        } else {
          const spare = esReserva(sec, bloques);
          const pos = siguientePos(sec, bloques);
          const w = await admin
            .from("ods_report_blocks")
            .insert({ report_id: reportId, sec, pos, origin: "pilo", text: p.text, orig: p.text, sources: p.sources, figs: p.figs, warn: p.warn, enabled: true, spare })
            .select("id")
            .single();
          if (w.error) throw w.error;
          ids.push(w.data.id);
          bloques.push({ id: w.data.id, sec, pos, origin: "pilo", enabled: true, spare, sources: p.sources });
          if (spare) reserva++;
        }
        escritos++;
      }

      // Las notas con las que no se logró un párrafo verificable no se vuelven a intentar solas.
      if (fallos.length && !bloqueId) {
        const fallidas = [...new Set([...(plan.fallidas ?? []), ...fallos.flatMap((f) => f.notas)])];
        const actual = (informe.settings as Record<string, unknown>) ?? {};
        await admin
          .from("ods_reports")
          .update({ settings: { ...actual, plan: { ...((actual.plan as Record<string, unknown>) ?? {}), fallidas } } })
          .eq("id", reportId);
        plan.fallidas = fallidas;
      }
      const quedan = notasSinUsar(sec, plan, bloques).filter((id) => porId.has(id)).length;
      await bitacora(escritos, fallos.length, null);
      if (!escritos && fallos.length) return json({ error: `Pilo no logró un párrafo verificable: ${fallos[0].motivo}`, code: "verificacion", fallos, quedan }, 422);
      return json({ ok: true, escritos, bloques: ids, reserva, quedan, fallos });
    } catch (e) {
      return alto(e, escritos, fallos.length);
    }
  }

  // Indicadores ------------------------------------------------------------------------------
  if (step === "indicador") {
    const id = String(cuerpo.indicator ?? "");
    const def = INDICADORES.find((i) => i.id === id && Number(i.ods) === ods.n);
    if (!def) return json({ error: `No conozco el indicador ${id || "(vacío)"} del ODS ${ods.n}.` }, 404);
    if (def.tipo === "dato" || def.tipo === "inv")
      return json({ error: def.tipo === "dato" ? "Este indicador pide una cifra institucional: no se arma con noticias." : "Este indicador lo calcula THE con la investigación publicada: no se arma con noticias." }, 400);
    try {
      const { data: previa, error: errPrevia } = await admin.from("ods_report_indicators").select("approved").eq("report_id", reportId).eq("indicator", id).maybeSingle();
      if (errPrevia) throw errPrevia;
      if (previa?.approved) return json({ error: "Una persona ya aprobó esta evidencia: Pilo no la cambia.", code: "aprobada" }, 409);

      const guardar = async (fila: { news_id: string | null; candidates: unknown[]; page_es: string[]; page_en: string }) => {
        const w = previa
          ? await admin.from("ods_report_indicators").update(fila).eq("report_id", reportId).eq("indicator", id).eq("approved", false).select("indicator")
          : await admin.from("ods_report_indicators").insert({ report_id: reportId, indicator: id, ...fila, approved: false }).select("indicator");
        if (w.error) throw w.error;
        return Boolean(w.data?.length);
      };

      if (def.tipo === "doc") {
        await guardar({ news_id: null, candidates: [], page_es: [], page_en: "" });
        return json({ ok: true, news_id: null, candidatas: 0, page_es: [], page_en: "", motivo: "THE pide un documento institucional (política o plan) con su fecha: una noticia no basta. Sube el documento." });
      }

      const lista = notasParaIndicador(id, await cargarNotas());
      if (!lista.length) {
        await guardar({ news_id: null, candidates: [], page_es: [], page_en: "" });
        return json({ ok: true, news_id: null, candidatas: 0, page_es: [], page_en: "", motivo: `No hay notas aprobadas con el ODS ${ods.n}.` });
      }
      const r = await llamarVerificado(mensajesIndicador(def, edition, lista), 1600, (crudo) => {
        const l = leerIndicador(crudo, lista);
        if (!l.ok) return l;
        return armarEleccion(l.valor, lista, edition);
      });
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una evidencia verificable: ${r.error}`, code: "verificacion" }, 422);
      }
      const e = r.valor;
      if (!(await guardar(e))) {
        await bitacora(0, 1, "Una persona aprobó la evidencia mientras Pilo leía.");
        return json({ error: "Una persona aprobó esta evidencia mientras Pilo leía: no se cambió.", code: "aprobada" }, 409);
      }
      await bitacora(1, 0, null);
      return json({
        ok: true,
        news_id: e.news_id,
        candidatas: e.candidates.length,
        page_es: e.page_es,
        page_en: e.page_en,
        ...(e.news_id ? {} : { motivo: "Ninguna nota responde a lo que pide THE para este indicador." }),
      });
    } catch (e) {
      return alto(e);
    }
  }

  return json({ error: "Paso desconocido." }, 400);
});
