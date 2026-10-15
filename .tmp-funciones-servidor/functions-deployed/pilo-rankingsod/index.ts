/* =============================================================================
   Edge Function · pilo-rankingsod

   Mr. Pilo arma los informes ODS (0145, 0146) con TODAS las noticias aprobadas
   del recolector (0143, 0144) y con otras fuentes (Impacto, UDES en Cifras,
   proyectos del PDI: fuentes.ts). La lógica pura está en logica.ts, cifras.ts,
   imagenes.ts, ficha.ts, fuentes.ts, pagina.ts y proveedor.ts, con pruebas en
   tests/noticias.

   El proveedor de IA es el de los rankings (news_settings.ai_provider, 0146):
   «pilo» = el de Mr. Pilo; «mistral» = Mistral con la clave que ya guarda
   Mr. Pilo. Las claves nunca salen de aquí. No gasta el cupo diario de
   /pregunta: la bitácora es news_runs (source «Pilo redacta informes ODS»).

     estado    { ods? }                → { ok, ai, motivo?, eleccion, proveedor, modelo, vision, lote, fuentes, indicadores? }
     cifras    { report_id | ods }     → { ok, extraidas, confirmadas, quedan, motivo? }
                 paso 1 sin IA (extraer con cita literal), paso 2 con IA (¿es logro de la UDES?)
     plan      { report_id, rehacer?, reintentar? }
                                       → { ok, plan, temas, notas, quedan, indicadores, avisos }
                 todas las notas en temas (sin IA) y Pilo los nombra por lotes
     redactar  { report_id, sec, block_id?, count? }
                                       → { ok, escritos, bloques, quedan, fallos, tema?, cubiertas, total_notas }
     fotos     { report_id }           → { ok, propuestas, en_uso, menores, graficas, vision, aviso }
     indicador { report_id, indicator }→ { ok, news_id, candidatas, page_es, page_en, ficha, motivo? }
     evaluar   { report_id, indicator }→ { ok, eval }
     mejorar   { report_id, indicator }→ { ok, antes, despues }
     traducir  { report_id, news_ids? }→ { ok, bloques, noticias, fallos, quedan }

   Reglas:
     · Solo Planeación o la administración, con sesión; «traducir-texto» también
       Gestor o Contribuyente de alguna oficina (reporte THE, 0149).
     · Ninguna nota aprobada se descarta: queda citada en la narrativa o en el
       registro (ods_registro); las que fallan la verificación quedan en
       settings.plan.fallidas con el motivo.
     · Pilo no reescribe párrafos «persona» ni «editado» (409) ni elecciones
       aprobadas (409), ni escribe en un informe publicado; nunca aprueba.
     · Un párrafo se guarda solo si cita todas sus fuentes, cada cita es
       literal, cada cifra está en el libro de cifras y el inglés trae las
       mismas cifras; si no, un reintento con el error.
     · No se empieza otra llamada pasados 50 s; tope de 95 s por llamada. Un
       429 espera hasta 3 s y reintenta una vez; 401, 5xx o un segundo 429
       detienen el lote con un mensaje claro.

   Despliegue:
     supabase functions deploy pilo-rankingsod --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { foldSystem, roleRejected } from "../noticias-pilo/logica.ts";
import { INDICADORES_THE } from "./indicadores.ts";
import { anioDeNoticias, rangoFechasDeAnio } from "./anios.ts";
import { extraerCifras, leerConfirmacion, mensajesConfirmarCifras, type CifraParaConfirmar } from "./cifras.ts";
import { combinarRiesgos, completarFicha, leerEvaluacion, leerFichaMejorada, leerTextoParaTraducir, leerTraduccionTexto, leerTraducciones, mensajesEvaluar, mensajesMejorar, mensajesTraducir, puedeLlamar, validarFicha, verificarTraduccion, type Evaluacion, type ItemTraducir } from "./ficha.ts";
import { aNotaVirtual, datosCifras, datosImpacto, datosProyectos, ESTADO_FUENTES, type Criterio, type DatoFuente, type FilaCifras, type FilaImpacto, type FilaProyecto } from "./fuentes.ts";
import { leerVision, mensajesVision, organizarImagenes, type ImagenDeNota, type UsoNota } from "./imagenes.ts";
import {
  aplicarLote,
  armarEleccion,
  AVISO_IMAGENES,
  cubiertas,
  enGrupos,
  esAnuncio,
  esDuplicado,
  indicadoresConNoticias,
  leerAjustes,
  leerIndicador,
  leerParrafo,
  leerTemas,
  lotesDeTemas,
  mensajesIndicador,
  mensajesParrafo,
  mensajesReintento,
  mensajesTemas,
  notasParaIndicador,
  notasSinUsar,
  NOTAS_POR_PARRAFO,
  ODS_NOMBRES,
  ordenarNotas,
  planGuardado,
  planInicial,
  puedeReescribir,
  SECCIONES_PILO,
  siguienteGrupo,
  siguientePos,
  sumarNuevas,
  tipoDeId,
  verificarParrafo,
  type BloqueExistente,
  type CifraLibro,
  type IndicadorParaPilo,
  type Lectura,
  type Mensaje,
  type NotaInforme,
  type Parrafo,
  type Plan,
  type SeccionPilo,
} from "./logica.ts";
import { leerFicha, paginaEvidencia } from "./pagina.ts";
import { elegirProveedor, esperaTras429, leerAjustesIA } from "./proveedor.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRESUPUESTO_MS = 50_000;
const TOPE_LLAMADA_MS = 95_000;
const FIN_MS = 140_000;
const FUENTE_BITACORA = "Pilo redacta informes ODS";
const PAGINA = 1000;

const INDICADORES: IndicadorParaPilo[] = INDICADORES_THE;

const faltaMigracion = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const MIGRACION = { error: "Falta aplicar las migraciones 0145 y 0146 (Informes ODS con Pilo).", code: "migracion" };

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


/** Lee todas las filas de una consulta, por páginas de 1.000 (nada se trunca). */
// deno-lint-ignore no-explicit-any
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw error;
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGINA) return out;
  }
}

/** Para listas largas de ids en un `in(...)`. */
const enTrozos = <T>(lista: T[], n = 150) => enGrupos(lista, n);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return json({ error: "La función no está configurada." }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: { action?: string; step?: string; report_id?: string; ods?: number; sec?: string; block_id?: string; count?: number; indicator?: string; rehacer?: boolean; reintentar?: boolean; news_ids?: string[]; texto?: unknown } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const PASOS = ["estado", "cifras", "plan", "redactar", "fotos", "indicador", "evaluar", "mejorar", "traducir"];
  const step = PASOS.includes(String(cuerpo.step)) ? String(cuerpo.step) : PASOS.includes(String(cuerpo.action)) ? String(cuerpo.action) : "";
  // «traducir-texto»: un comentario suelto (no es un informe); no guarda nada.
  const TEXTO = cuerpo.action === "traducir-texto";
  if (!step && !TEXTO) return json({ error: "Paso desconocido." }, 400);

  // Quién llama: Planeación o la administración, con sesión activa; «traducir-texto», también
  // quien es Gestor o Contribuyente (jefe o editor) de alguna oficina (puedeLlamar, ficha.ts).
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return json({ error: "Sesión inválida." }, 401);
  const { data: perfil } = await admin.from("profiles").select("role, is_active").eq("id", who.data.user.id).maybeSingle();
  const { data: membresias } = TEXTO ? await admin.from("unit_members").select("role").eq("profile_id", who.data.user.id) : { data: [] };
  const rolesUnidad = ((membresias ?? []) as { role: string }[]).map((m) => m.role);
  if (!puedeLlamar({ texto: TEXTO, perfil, rolesUnidad })) {
    return json({ error: TEXTO ? "Solo Planeación o quien diligencia el reporte en una oficina (Gestor o Contribuyente)." : "Solo Planeación o la administración." }, 403);
  }

  // El proveedor de los rankings (0146) sobre el de Mr. Pilo (0089, 0091).
  const [{ data: settings }, { data: secret }, ajustesFila, prueba] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("ods_reports").select("id", { count: "exact", head: true }),
  ]);
  if (prueba.error) return json(faltaMigracion(prueba.error) ? MIGRACION : { error: prueba.error.message }, 500);
  const destino = elegirProveedor(leerAjustesIA(ajustesFila.data as Record<string, unknown> | null), settings as Record<string, unknown> | null, secret as Record<string, unknown> | null);
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de los rankings no está lista.";
  const enUso = { eleccion: destino.eleccion, proveedor: destino.proveedor, modelo: destino.model, vision: destino.vision, lote: destino.lote };

  if (step === "estado") {
    const n = Math.floor(Number(cuerpo.ods));
    return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}), ...enUso, fuentes: ESTADO_FUENTES, ...(n >= 1 && n <= 17 ? { indicadores: indicadoresConNoticias(INDICADORES, n) } : {}) });
  }

  // El informe (o, para «cifras», solo el ODS) --------------------------------------
  const reportId = String(cuerpo.report_id ?? "");
  type Informe = { id: string; ods: number; edition: number; state: string; settings: Record<string, unknown> | null };
  let informe: Informe | null = null;
  if (/^[0-9a-f-]{36}$/i.test(reportId)) {
    const { data, error } = await admin.from("ods_reports").select("id, ods, edition, state, settings").eq("id", reportId).maybeSingle();
    if (error) return json(faltaMigracion(error) ? MIGRACION : { error: error.message }, 500);
    if (!data) return json({ error: "No existe ese informe." }, 404);
    informe = data as unknown as Informe;
  } else if (!TEXTO && !(step === "cifras" && Number(cuerpo.ods) >= 1 && Number(cuerpo.ods) <= 17)) {
    return json({ error: "Falta el informe (report_id)." }, 400);
  }
  if (informe && informe.state === "publicado" && step !== "cifras") return json({ error: "El informe está publicado: pásalo a revisión para que Pilo escriba en él.", code: "publicado" }, 409);
  const odsN = informe ? Number(informe.ods) : Math.floor(Number(cuerpo.ods));
  const ods = { n: odsN, name: ODS_NOMBRES[odsN - 1] ?? `ODS ${odsN}` };
  const edition = informe ? Number(informe.edition) : new Date().getFullYear() - 1;
  // Regla: las noticias del año N van a la edición N+1. Sin informe, las del último año.
  const anioNoticias = informe ? anioDeNoticias(edition) : new Date().getFullYear() - 1;
  const ajustes = leerAjustes(informe?.settings);
  const indicadoresOds = INDICADORES.filter((i) => Number(i.ods) === odsN);

  // Las notas aprobadas con este ODS publicadas en el año de noticias de la edición, con su texto, por páginas.
  const cargarNotas = async (): Promise<NotaInforme[]> => {
    type Fila = { score: number; indicator: string | null; news_items: Omit<NotaInforme, "score" | "indicator"> & { state: string } };
    const { desde, hasta } = rangoFechasDeAnio(anioNoticias);
    const filas = await todas<Fila>((a, b) =>
      admin
        .from("news_ods")
        .select("score, indicator, news_items!inner(id, title, body, published_on, section, campus, url, image_url, state)")
        .eq("ods", odsN)
        .eq("news_items.state", "ok")
        .gte("news_items.published_on", desde)
        .lt("news_items.published_on", hasta)
        .order("news_id")
        .range(a, b),
    );
    return filas.filter((f) => f.news_items).map((f) => ({ ...f.news_items, body: f.news_items.body ?? "", score: f.score, indicator: f.indicator }));
  };

  /** El libro de cifras de unas notas (score > 0). */
  const cargarLibro = async (ids: string[]): Promise<(CifraLibro & { score: number })[]> => {
    const out: (CifraLibro & { score: number })[] = [];
    for (const trozo of enTrozos(ids.filter((id) => tipoDeId(id) === "noticia"))) {
      const filas = await todas<{ news_id: string; value: string; label: string; quote: string; score: number }>((a, b) =>
        admin.from("news_figures").select("news_id, value, label, quote, score").in("news_id", trozo).gt("score", 0).order("score", { ascending: false }).range(a, b),
      );
      out.push(...filas);
    }
    return out;
  };

  /** Las otras fuentes del ODS (fuentes.ts). Las que fallan quedan como «no conectadas» en los avisos. */
  const cargarFuentes = async (): Promise<{ datos: DatoFuente[]; avisos: string[] }> => {
    const avisos: string[] = [];
    const datos: DatoFuente[] = [];
    let criterios: Criterio[] = [];
    try {
      criterios = await todas<Criterio>((a, b) => admin.from("imp_criteria").select("sdg, term, weight").eq("target", "ods").eq("sdg", odsN).range(a, b));
    } catch {
      avisos.push("No se pudo leer el diccionario del motor (imp_criteria): UDES en Cifras y los proyectos del PDI no se conectan.");
    }
    try {
      const al = await todas<{ indicator_id: string }>((a, b) => admin.from("imp_alignments").select("indicator_id").eq("target", "ods").eq("sdg", odsN).range(a, b));
      const ids = [...new Set(al.map((x) => x.indicator_id))];
      for (const trozo of enTrozos(ids)) {
        const [ind, val] = await Promise.all([
          admin.from("imp_indicators").select("id, name, unit_label, measure").in("id", trozo),
          admin.from("imp_values").select("indicator_id, year, value_num, value_text, not_applicable").in("indicator_id", trozo).eq("year", edition).is("program_id", null),
        ]);
        if (ind.error || val.error) throw ind.error ?? val.error;
        const porId = new Map(((ind.data ?? []) as { id: string; name: string; unit_label: string; measure: string }[]).map((i) => [i.id, i]));
        const filas: FilaImpacto[] = ((val.data ?? []) as { indicator_id: string; year: number; value_num: number | null; value_text: string; not_applicable: boolean }[])
          .filter((v) => porId.has(v.indicator_id))
          .map((v) => ({ ...v, name: porId.get(v.indicator_id)!.name, unit_label: porId.get(v.indicator_id)!.unit_label, measure: porId.get(v.indicator_id)!.measure }));
        datos.push(...datosImpacto(filas, edition));
      }
    } catch {
      avisos.push("Indicadores de Impacto: no se pudieron leer (no conectado en esta llamada).");
    }
    if (criterios.length) {
      try {
        type Ind = { id: string; label: string; definition: string; unit: string; format: FilaCifras["format"]; annual_rule: FilaCifras["annual_rule"]; od_reports: { name: string; status: string; od_periods: { status: string; illustrative: boolean } } };
        const inds = (await todas<Ind>((a, b) => admin.from("od_indicators").select("id, label, definition, unit, format, annual_rule, od_reports!inner(name, status, od_periods!inner(status, illustrative))").range(a, b))).filter(
          (i) => i.od_reports?.status === "publicado" && i.od_reports.od_periods?.status === "publicado" && !i.od_reports.od_periods.illustrative,
        );
        const porId = new Map(inds.map((i) => [i.id, i]));
        const filas: FilaCifras[] = [];
        for (const trozo of enTrozos(inds.map((i) => i.id))) {
          const val = await admin.from("od_values").select("indicator_id, year, term, value").in("indicator_id", trozo).eq("year", edition).is("campus_id", null);
          if (val.error) throw val.error;
          for (const v of (val.data ?? []) as { indicator_id: string; year: number; term: "A" | "B" | "anual"; value: number | null }[]) {
            const i = porId.get(v.indicator_id)!;
            filas.push({ indicator_id: i.id, label: i.label, definition: i.definition, unit: i.unit, format: i.format, annual_rule: i.annual_rule, report_name: i.od_reports.name, year: v.year, term: v.term, value: v.value });
          }
        }
        datos.push(...datosCifras(filas, criterios, odsN, edition));
      } catch {
        avisos.push("UDES en Cifras: no se pudo leer (no conectado en esta llamada).");
      }
      try {
        const proyectos = await todas<{ id: string; name: string; description: string; detail: string; pillars: { name: string } | null }>((a, b) =>
          admin.from("projects").select("id, name, description, detail, pillars(name)").range(a, b),
        );
        datos.push(...datosProyectos(proyectos.map((p): FilaProyecto => ({ id: p.id, name: p.name, description: p.description ?? "", detail: p.detail ?? "", pillar: p.pillars?.name ?? "" })), criterios, odsN));
      } catch {
        avisos.push("Proyectos del PDI: no se pudieron leer (no conectado en esta llamada).");
      }
    }
    return { datos, avisos };
  };

  const guardarPlan = async (plan: Plan) => {
    const actual = (await admin.from("ods_reports").select("settings").eq("id", reportId).single()).data?.settings ?? {};
    const w = await admin
      .from("ods_reports")
      .update({ settings: { ...(actual as Record<string, unknown>), plan: { ...plan, at: new Date().toISOString() } } })
      .eq("id", reportId);
    if (w.error) throw w.error;
  };

  // Sin IA: los pasos que no la necesitan corren aunque no esté lista.
  const inicio = Date.now();
  const plegar = settings?.system_role === "user" && destino.eleccion === "pilo";
  let llamadas = 0;
  const hayTiempo = () => Date.now() - inicio < PRESUPUESTO_MS;

  const enviar = async (cuerpoLlamada: Record<string, unknown>): Promise<Response> => {
    const pasado = Date.now() - inicio;
    const init = (): RequestInit => ({
      method: "POST",
      headers: { Authorization: `Bearer ${destino.clave}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(Math.max(10_000, Math.min(TOPE_LLAMADA_MS, FIN_MS - pasado))),
      body: JSON.stringify(cuerpoLlamada),
    });
    llamadas++;
    const primera = await fetch(destino.url, init());
    if (primera.status !== 429) return primera;
    // Límite por segundo (muy bajo en el plan gratuito de Mistral): espera hasta 3 s y reintenta una vez.
    const espera = esperaTras429(primera.headers.get("retry-after"));
    await primera.body?.cancel();
    await dormir(espera);
    return fetch(destino.url, init());
  };

  const llamar = async (mensajes: Mensaje[], maxTokens: number): Promise<string> => {
    const cuerpoLlamada = (doblar: boolean) => ({
      model: destino.model,
      messages: doblar ? foldSystem(mensajes) : mensajes,
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(destino.json ? { response_format: { type: "json_object" } } : {}),
    });
    let respuesta: Response;
    try {
      respuesta = await enviar(cuerpoLlamada(plegar));
      if (!respuesta.ok && !plegar && (respuesta.status === 400 || respuesta.status === 422) && roleRejected(respuesta.status, await detalleProveedor(respuesta.clone()))) {
        await respuesta.body?.cancel();
        respuesta = await enviar(cuerpoLlamada(true));
      }
    } catch (e) {
      const tiempo = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new AltoProveedor(tiempo ? "El proveedor de IA tardó demasiado en responder. Intenta de nuevo." : "No se pudo llegar al proveedor de IA.", "proveedor", 502);
    }
    if (!respuesta.ok) {
      const detalle = await detalleProveedor(respuesta);
      if (respuesta.status === 429) throw new AltoProveedor("El proveedor limitó los pedidos (429) aun después de esperar: espera un minuto y sigue.", "limite_proveedor", 429);
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

  // Un comentario en español → inglés (≤1000 caracteres). Solo devuelve la traducción; no guarda nada ---
  if (TEXTO) {
    const leido = leerTextoParaTraducir(cuerpo.texto);
    if (!leido.ok) return json({ error: leido.error, code: "texto" }, 400);
    if (motivo) return json({ error: motivo, code: "sin_ia", ...enUso }, 503);
    try {
      const r = await llamarVerificado(mensajesTraducir([{ ref: "T1", es: leido.valor }], "comentario"), 1200, (c) => leerTraduccionTexto(c, leido.valor));
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una traducción verificable: ${r.error}`, code: "verificacion" }, 422);
      }
      await bitacora(1, 0, null);
      return json({ ok: true, en: r.valor });
    } catch (e) {
      return alto(e);
    }
  }

  // Cifras: paso 1 sin IA, paso 2 con IA ---------------------------------------------------
  if (step === "cifras") {
    let extraidas = 0;
    let confirmadas = 0;
    try {
      const notas = await cargarNotas();
      const ids = notas.map((n) => n.id);
      const conCifras = new Set<string>();
      for (const trozo of enTrozos(ids)) {
        const filas = await todas<{ news_id: string }>((a, b) => admin.from("news_figures").select("news_id").in("news_id", trozo).range(a, b));
        for (const f of filas) conCifras.add(f.news_id);
      }
      for (const n of notas.filter((x) => !conCifras.has(x.id))) {
        const cifras = extraerCifras(n.body);
        if (!cifras.length) continue;
        const w = await admin
          .from("news_figures")
          .upsert(cifras.map((c) => ({ news_id: n.id, value: c.value.slice(0, 60), num: c.num, unit: c.unit.slice(0, 40), label: c.label.slice(0, 160), quote: c.quote.slice(0, 600), kind: c.kind, score: c.score })), { onConflict: "news_id,quote,value", ignoreDuplicates: true })
          .select("id");
        if (w.error) throw w.error;
        extraidas += (w.data ?? []).length;
      }
      // Paso 2: Pilo confirma las que aún no revisó, por lotes.
      const pendientes = async () => {
        const out: (CifraParaConfirmar & { checked: boolean })[] = [];
        for (const trozo of enTrozos(ids)) out.push(...(await todas<CifraParaConfirmar & { checked: boolean }>((a, b) => admin.from("news_figures").select("id, news_id, value, label, quote, checked").in("news_id", trozo).eq("checked", false).range(a, b))));
        return out;
      };
      let quedan = await pendientes();
      if (motivo) return json({ ok: true, extraidas, confirmadas, quedan: quedan.length, motivo: `${motivo} Las cifras quedan extraídas sin confirmar.` });
      const porLote = Math.max(10, destino.lote * 6);
      while (quedan.length && hayTiempo()) {
        const lote = quedan.slice(0, porLote);
        const delLote = notas.filter((n) => lote.some((c) => c.news_id === n.id));
        const r = await llamarVerificado(mensajesConfirmarCifras(lote, delLote), 1600, (c) => leerConfirmacion(c, lote));
        if (!r.ok) {
          // Un lote ilegible no frena el resto: se marcan revisadas con su puntaje del paso 1.
          for (const c of lote) await admin.from("news_figures").update({ checked: true }).eq("id", c.id);
        } else {
          for (const c of r.valor) {
            await admin.from("news_figures").update({ checked: true, label: c.label, score: c.score }).eq("id", c.id);
            confirmadas++;
          }
          const vistas = new Set(r.valor.map((c) => c.id));
          for (const c of lote.filter((x) => !vistas.has(x.id))) await admin.from("news_figures").update({ checked: true }).eq("id", c.id);
        }
        quedan = quedan.slice(lote.length);
      }
      await bitacora(confirmadas, 0, null);
      return json({ ok: true, extraidas, confirmadas, quedan: quedan.length });
    } catch (e) {
      return alto(e, extraidas + confirmadas);
    }
  }

  // Plan: todas las notas en temas; Pilo los nombra ----------------------------------------
  if (step === "plan") {
    try {
      const notas = ordenarNotas(await cargarNotas());
      if (!notas.length) return json({ error: `No hay notas aprobadas con el ODS ${ods.n}.`, code: "sin_notas" }, 409);
      let plan = planGuardado(informe!.settings);
      if (!plan || cuerpo.rehacer) {
        const libro = await cargarLibro(notas.map((n) => n.id));
        const mejor = new Map<string, number>();
        for (const c of libro) mejor.set(c.news_id, Math.max(mejor.get(c.news_id) ?? 0, c.score));
        plan = planInicial(notas, indicadoresOds, mejor);
        await guardarPlan(plan);
      } else {
        const antes = plan.temas.length;
        plan = sumarNuevas(plan, notas);
        // Reintentar las fallidas: vuelven a la fila de «Qué hicimos».
        const reintentar = Boolean(cuerpo.reintentar && plan.fallidas.length);
        if (reintentar) plan = { ...plan, fallidas: [] };
        if (plan.temas.length !== antes || reintentar) await guardarPlan(plan);
      }
      const avisos: string[] = [];
      if (!motivo) {
        for (const lote of lotesDeTemas(plan.temas)) {
          if (!hayTiempo()) break;
          const r = await llamarVerificado(mensajesTemas(ods, lote, notas), 1400, (c) => leerTemas(c, lote, notas));
          if (r.ok) plan = aplicarLote(plan, lote, r.valor.temas, r.valor.proyectos);
          else {
            // Sin nombre de Pilo, el tema conserva el determinista: nada se pierde ni se repite.
            plan = aplicarLote(plan, lote, lote.map((t) => ({ ...t, nombrado: true })), []);
            avisos.push(`No se pudieron nombrar ${lote.length} temas: ${r.error}`);
          }
          await guardarPlan(plan);
        }
      } else avisos.push(`${motivo} Los temas quedan con nombres automáticos.`);
      await bitacora(plan.temas.filter((t) => t.nombrado).length, avisos.length, null);
      return json({
        ok: true,
        plan,
        temas: plan.temas.length,
        notas: notas.length,
        quedan: lotesDeTemas(plan.temas).length,
        indicadores: indicadoresConNoticias(INDICADORES, ods.n),
        avisos,
      });
    } catch (e) {
      return alto(e);
    }
  }

  // Fotos: elegir entre las imágenes de las notas -------------------------------------------
  if (step === "fotos") {
    try {
      const [notas, bloques, elecciones, fotos] = await Promise.all([
        cargarNotas(),
        todas<{ sec: string; sources: { news_id: string }[] | null }>((a, b) => admin.from("ods_report_blocks").select("sec, sources").eq("report_id", reportId).eq("enabled", true).eq("spare", false).range(a, b)),
        admin.from("ods_report_indicators").select("news_id").eq("report_id", reportId),
        admin.from("ods_report_photos").select("news_id, image_id, slot, use").eq("report_id", reportId),
      ]);
      const porId = new Map(notas.map((n) => [n.id, n]));
      const pesos = new Map<string, { peso: number; sec: string }>();
      const PESO_SEC: Record<string, number> = { hicimos: 3, proyectos: 2, cifras: 1 };
      for (const b of bloques)
        for (const s of b.sources ?? []) {
          if (!s.news_id || !porId.has(s.news_id)) continue;
          const p = pesos.get(s.news_id) ?? { peso: 0, sec: b.sec };
          pesos.set(s.news_id, { peso: p.peso + (PESO_SEC[b.sec] ?? 1), sec: p.sec });
        }
      for (const e of (elecciones.data ?? []) as { news_id: string | null }[]) {
        if (!e.news_id || !porId.has(e.news_id)) continue;
        const p = pesos.get(e.news_id) ?? { peso: 0, sec: "indicador" };
        pesos.set(e.news_id, { peso: p.peso + 2, sec: p.sec });
      }
      const usos: UsoNota[] = [...pesos.entries()].map(([id, p]) => ({ nota: porId.get(id)!, sec: p.sec, peso: p.peso + (porId.get(id)!.score ?? 0) / 100 }));
      const imagenes: ImagenDeNota[] = [];
      for (const trozo of enTrozos(usos.map((u) => u.nota.id))) {
        const r = await admin.from("news_images").select("id, news_id, url, width, height, caption, credit, pos, is_cover, kind, minors, alt").in("news_id", trozo);
        if (r.error) throw r.error;
        imagenes.push(...((r.data ?? []) as ImagenDeNota[]));
      }
      const propuestas = organizarImagenes(usos, imagenes, (fotos.data ?? []) as { news_id: string; image_id: string | null; slot: string; use: boolean }[]);

      // Visión (opcional): describe la miniatura y busca rostros de menores. Pilo no crea ni cambia imágenes.
      let vision = false;
      const avisos: string[] = [];
      if (ajustes.vision && destino.vision && !motivo) {
        const urlDe = new Map(imagenes.map((i) => [i.id, i.url]));
        for (const p of propuestas.filter((x) => x.use).slice(0, 4)) {
          if (!hayTiempo()) break;
          const imagenUrl = (p.image_id && urlDe.get(p.image_id)) || porId.get(p.news_id)?.image_url;
          if (!imagenUrl) continue;
          const r = await enviar({ model: destino.vision, messages: mensajesVision({ url: imagenUrl }, porId.get(p.news_id)!), temperature: 0.1, max_tokens: 300, ...(destino.json ? { response_format: { type: "json_object" } } : {}) });
          if (!r.ok) {
            avisos.push(`El modelo de visión no respondió (${r.status}): las fotos quedan solo con el texto de la nota.`);
            await r.body?.cancel();
            break;
          }
          const v = leerVision(String((await r.json())?.choices?.[0]?.message?.content ?? ""));
          if (!v.ok) continue;
          vision = true;
          p.alt = `Revisar (descrito por Pilo con visión): ${v.alt}`;
          if (v.menores) Object.assign(p, { minors: true, use: false, motivo: "La visión ve rostros de niñas, niños o adolescentes: no se publica sin autorización." });
          if (v.texto) Object.assign(p, { kind: "grafica", use: false, motivo: "La visión ve una pieza con mucho texto." });
        }
      }
      if (propuestas.length) {
        const r = await admin
          .from("ods_report_photos")
          .upsert(propuestas.map(({ motivo: _m, ...p }) => ({ report_id: reportId, ...p })), { onConflict: "report_id,photo_key", ignoreDuplicates: true });
        if (r.error) throw r.error;
      }
      await bitacora(propuestas.length, 0, null);
      return json({
        ok: true,
        propuestas: propuestas.length,
        en_uso: propuestas.filter((p) => p.use).length,
        menores: propuestas.filter((p) => p.minors).length,
        graficas: propuestas.filter((p) => p.kind === "grafica").length,
        vision,
        aviso: vision ? "Pilo describió algunas fotos con visión: revisa cada texto alternativo. Pilo no crea ni cambia imágenes; solo elige entre las de las notas." : AVISO_IMAGENES,
        avisos,
      });
    } catch (e) {
      return alto(e);
    }
  }

  // Lo que necesita la IA ------------------------------------------------------------------------
  if (motivo) return json({ error: motivo, code: "sin_ia", ...enUso }, 503);

  // Párrafos ------------------------------------------------------------------------------
  if (step === "redactar") {
    const sec = String(cuerpo.sec ?? "") as SeccionPilo;
    if (!SECCIONES_PILO.includes(sec)) return json({ error: "Pilo redacta «hicimos», «proyectos» y «cifras»; la tesis y lo que viene los escribe una persona." }, 400);
    let plan = planGuardado(informe!.settings);
    if (!plan) return json({ error: "Primero arma el plan del informe.", code: "sin_plan" }, 409);
    let escritos = 0;
    const ids: string[] = [];
    const fallos: { notas: string[]; motivo: string }[] = [];
    let ultimoTema: { indice: number; total: number; heading: string } | null = null;
    try {
      const [notas, filas, externas] = await Promise.all([
        cargarNotas(),
        todas<BloqueExistente>((a, b) => admin.from("ods_report_blocks").select("id, sec, pos, origin, enabled, spare, sources, text").eq("report_id", reportId).range(a, b)),
        sec === "hicimos" ? Promise.resolve({ datos: [] as DatoFuente[], avisos: [] as string[] }) : cargarFuentes(),
      ]);
      plan = sumarNuevas(plan, notas);
      const bloques = filas;
      const virtuales = externas.datos.filter((d) => (sec === "proyectos" ? d.kind === "proyecto" : d.kind === "cifras" || d.kind === "impacto")).map(aNotaVirtual);
      const fuentes = [...notas, ...virtuales];
      const porId = new Map(fuentes.map((n) => [n.id, n]));
      const libroExterno: CifraLibro[] = externas.datos.filter((d) => d.value).map((d) => ({ news_id: d.ref, value: d.value!, label: d.label, quote: d.texto }));

      type Trabajo = { grupo: string[]; pos: number; heading: string; heading_en: string; tema: { indice: number; total: number; heading: string } | null };
      const siguiente = (): Trabajo | null => {
        if (sec === "hicimos") {
          const s = siguienteGrupo(plan!, bloques);
          if (!s) return null;
          return { grupo: s.grupo.filter((id) => porId.has(id)), pos: s.pos, heading: s.tema.heading, heading_en: s.tema.heading_en, tema: { indice: s.indice + 1, total: s.total, heading: s.tema.heading } };
        }
        const lista = sec === "proyectos" ? [...plan!.proyectos, ...virtuales.map((v) => v.id)] : [...plan!.cifras, ...virtuales.map((v) => v.id)];
        const libres = notasSinUsar(sec, lista.filter((id) => porId.has(id)), bloques, plan!.fallidas);
        if (!libres.length) return null;
        return { grupo: libres.slice(0, NOTAS_POR_PARRAFO[sec]), pos: siguientePos(sec, bloques), heading: "", heading_en: "", tema: null };
      };

      const bloqueId = cuerpo.block_id ? String(cuerpo.block_id) : null;
      const cuantos = bloqueId ? 1 : Math.max(1, Math.min(Math.max(2, destino.lote), Math.floor(Number(cuerpo.count) || 2)));
      for (let vuelta = 0; vuelta < cuantos; vuelta++) {
        if (vuelta > 0 && !hayTiempo()) break;
        let trabajo: Trabajo | null;
        if (bloqueId) {
          const b = bloques.find((x) => x.id === bloqueId);
          if (!b) return json({ error: "No existe ese párrafo en el informe." }, 404);
          const puede = puedeReescribir(b);
          if (!puede.ok) return json({ error: puede.motivo, code: "de_persona" }, 409);
          const propias = [...new Set((b.sources ?? []).map((s) => s.ref || s.news_id))].filter((id) => porId.has(id));
          trabajo = propias.length ? { grupo: propias, pos: b.pos, heading: "", heading_en: "", tema: null } : siguiente();
        } else trabajo = siguiente();
        if (!trabajo || !trabajo.grupo.length) break;
        ultimoTema = trabajo.tema;
        const delGrupo = trabajo.grupo.map((id) => porId.get(id)!).filter(Boolean);
        const libro = [...(await cargarLibro(trabajo.grupo)), ...libroExterno.filter((c) => trabajo!.grupo.includes(c.news_id))];
        const r = await llamarVerificado<Parrafo>(mensajesParrafo(ods, sec, ajustes, delGrupo, { libro, tema: trabajo.heading }), 1400, (crudo) => {
          const l = leerParrafo(crudo, delGrupo, sec);
          if (!l.ok) return l;
          const v = verificarParrafo(l.valor, delGrupo, { libro, exigir: trabajo!.grupo });
          if (!v.ok) return { ok: false, error: v.error ?? "No pasó la verificación." };
          const t = verificarTraduccion(l.valor.text, l.valor.text_en);
          if (!t.ok) return { ok: false, error: t.error ?? "El inglés no coincide con el español." };
          const warn = [v.warn, t.warn].filter(Boolean).join(" ") || null;
          return { ok: true, valor: { ...l.valor, warn } };
        });
        if (!r.ok) {
          fallos.push({ notas: trabajo.grupo, motivo: r.error });
          if (!bloqueId) {
            // No se descarta en silencio: queda en el registro y en «fallidas» con el motivo, para una persona.
            plan = { ...plan!, fallidas: [...plan!.fallidas.filter((f) => !trabajo!.grupo.includes(f.news_id)), ...trabajo.grupo.map((news_id) => ({ news_id, motivo: r.error.slice(0, 300) }))] };
            await guardarPlan(plan);
          }
          continue;
        }
        const p = r.valor;
        if (bloqueId) {
          const w = await admin
            .from("ods_report_blocks")
            .update({ text: p.text, orig: p.text, text_en: p.text_en, orig_en: p.text_en, sources: p.sources, figs: p.figs, warn: p.warn })
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
          const spare = esDuplicado(p.text, sec, bloques);
          const w = await admin
            .from("ods_report_blocks")
            .insert({ report_id: reportId, sec, pos: trabajo.pos, origin: "pilo", heading: trabajo.heading, heading_en: trabajo.heading_en, text: p.text, orig: p.text, text_en: p.text_en, orig_en: p.text_en, sources: p.sources, figs: p.figs, warn: p.warn, enabled: true, spare })
            .select("id")
            .single();
          if (w.error) throw w.error;
          ids.push(w.data.id);
          bloques.push({ id: w.data.id, sec, pos: trabajo.pos, origin: "pilo", enabled: true, spare, sources: p.sources, text: p.text });
        }
        escritos++;
      }
      const c = cubiertas(plan, bloques);
      const quedan =
        sec === "hicimos"
          ? plan.temas.flatMap((t) => t.grupos).filter((g) => g.some((id) => !new Set([...bloques.filter((b) => b.sec === "hicimos").flatMap((b) => (b.sources ?? []).map((s) => s.ref || s.news_id)), ...plan!.fallidas.map((f) => f.news_id)]).has(id))).length
          : notasSinUsar(sec, (sec === "proyectos" ? [...plan.proyectos, ...virtuales.map((v) => v.id)] : [...plan.cifras, ...virtuales.map((v) => v.id)]).filter((id) => porId.has(id)), bloques, plan.fallidas).length;
      await bitacora(escritos, fallos.length, null);
      const resumen = { escritos, bloques: ids, reserva: 0, quedan, fallos, tema: ultimoTema, cubiertas: c.cubiertas, total_notas: c.total, fallidas: c.fallidas, avisos: externas.avisos };
      if (!escritos && fallos.length) return json({ error: `Pilo no logró un párrafo verificable: ${fallos[0].motivo}`, code: "verificacion", ...resumen }, 422);
      return json({ ok: true, ...resumen, ...(escritos || quedan ? {} : { motivo: "No quedan fuentes sin usar en esta sección." }) });
    } catch (e) {
      return alto(e, escritos, fallos.length);
    }
  }

  // Indicadores: UNA evidencia, la más específica (regla de THE) -----------------------------
  const id = String(cuerpo.indicator ?? "");
  const def = INDICADORES.find((i) => i.id === id && Number(i.ods) === ods.n);

  if (step === "indicador") {
    if (!def) return json({ error: `No conozco el indicador ${id || "(vacío)"} del ODS ${ods.n}.` }, 404);
    if (def.tipo === "dato" || def.tipo === "inv")
      return json({ error: def.tipo === "dato" ? "Este indicador pide una cifra institucional: no se arma con noticias." : "Este indicador lo calcula THE con la investigación publicada: no se arma con noticias." }, 400);
    try {
      const { data: previa, error: errPrevia } = await admin.from("ods_report_indicators").select("approved").eq("report_id", reportId).eq("indicator", id).maybeSingle();
      if (errPrevia) throw errPrevia;
      if (previa?.approved) return json({ error: "Una persona ya aprobó esta evidencia: Pilo no la cambia.", code: "aprobada" }, 409);

      const guardar = async (fila: { news_id: string | null; candidates: unknown[]; page_es: string[]; page_en: string; ficha: unknown }) => {
        const datos = { ...fila, eval: {} };
        const w = previa
          ? await admin.from("ods_report_indicators").update(datos).eq("report_id", reportId).eq("indicator", id).eq("approved", false).select("indicator")
          : await admin.from("ods_report_indicators").insert({ report_id: reportId, indicator: id, ...datos, approved: false }).select("indicator");
        if (w.error) throw w.error;
        return Boolean(w.data?.length);
      };

      if (def.tipo === "doc") {
        await guardar({ news_id: null, candidates: [], page_es: [], page_en: "", ficha: {} });
        return json({ ok: true, news_id: null, candidatas: 0, page_es: [], page_en: "", ficha: null, motivo: "THE pide un documento institucional (política o plan) con su fecha: una noticia no basta. Sube el documento." });
      }

      const lista = notasParaIndicador(id, await cargarNotas());
      if (!lista.length) {
        await guardar({ news_id: null, candidates: [], page_es: [], page_en: "", ficha: {} });
        return json({ ok: true, news_id: null, candidatas: 0, page_es: [], page_en: "", ficha: null, motivo: `No hay notas aprobadas con el ODS ${ods.n}.` });
      }
      const r = await llamarVerificado(mensajesIndicador(def, anioNoticias, lista), 2000, (crudo) => {
        const l = leerIndicador(crudo, lista);
        if (!l.ok) return l;
        const a = armarEleccion(l.valor, lista, anioNoticias);
        if (!a.ok || !a.valor.news_id) return a;
        const nota = lista.find((n) => n.id === a.valor.news_id)!;
        const ficha = completarFicha(a.valor.ficha, def, anioNoticias);
        const errores = validarFicha(ficha, nota, anioNoticias);
        return errores.length ? { ok: false, error: `La ficha no cumple: ${errores.join(" ")}` } : { ok: true, valor: { ...a.valor, ficha } };
      });
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una evidencia verificable: ${r.error}`, code: "verificacion" }, 422);
      }
      const e = r.valor;
      if (!(await guardar({ ...e, ficha: e.ficha ?? {} }))) {
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
        ficha: e.ficha ?? null,
        ...(e.news_id ? {} : { motivo: "Ninguna nota responde a lo que pide THE para este indicador." }),
      });
    } catch (e) {
      return alto(e);
    }
  }

  // Evaluar y mejorar --------------------------------------------------------------------------
  if (step === "evaluar" || step === "mejorar") {
    if (!def) return json({ error: `No conozco el indicador ${id || "(vacío)"} del ODS ${ods.n}.` }, 404);
    try {
      const { data: fila, error } = await admin.from("ods_report_indicators").select("news_id, page_es, page_en, ficha, eval, approved").eq("report_id", reportId).eq("indicator", id).maybeSingle();
      if (error) throw error;
      if (!fila?.news_id) return json({ error: "Este indicador aún no tiene una nota elegida como evidencia.", code: "sin_evidencia" }, 409);
      const { data: nota, error: errNota } = await admin.from("news_items").select("id, title, body, published_on").eq("id", fila.news_id).single();
      if (errNota) throw errNota;

      const evaluar = async (ficha: unknown): Promise<Lectura<Evaluacion & { at: string }>> => {
        const pagina = paginaEvidencia({ id: def.id, titulo: def.titulo, pregunta: def.pregunta }, ficha as Record<string, unknown>, (fila.page_es ?? []) as string[], String(fila.page_en ?? ""), "en");
        const r = await llamarVerificado(mensajesEvaluar(def.pregunta, pagina.texto), 900, (c) => leerEvaluacion(c));
        return r.ok ? { ok: true, valor: { ...combinarRiesgos(r.valor, pagina.texto, anioNoticias, esAnuncio(nota as NotaInforme)), at: new Date().toISOString() } } : r;
      };

      if (step === "evaluar") {
        const r = await evaluar(fila.ficha);
        if (!r.ok) {
          await bitacora(0, 1, r.error);
          return json({ error: `El evaluador no dio una respuesta legible: ${r.error}`, code: "verificacion" }, 422);
        }
        await admin.from("ods_report_indicators").update({ eval: r.valor }).eq("report_id", reportId).eq("indicator", id);
        await bitacora(1, 0, null);
        return json({ ok: true, eval: r.valor });
      }

      if (fila.approved) return json({ error: "Una persona ya aprobó esta evidencia: Pilo no cambia su ficha.", code: "aprobada" }, 409);
      const previa = fila.eval as Partial<Evaluacion> | null;
      if (!previa?.grade) return json({ error: "Primero evalúa la evidencia.", code: "sin_eval" }, 409);
      if (previa.grade === "s" || !previa.missing?.length) return json({ error: "El evaluador ya la ve específica o no dijo qué falta: no hay nada que mejorar.", code: "nada" }, 409);
      const r = await llamarVerificado(mensajesMejorar(def, leerFicha(fila.ficha), previa.missing, nota as NotaInforme, anioNoticias), 1200, (c) => leerFichaMejorada(c, def, nota as NotaInforme, anioNoticias));
      if (!r.ok) {
        await bitacora(0, 1, r.error);
        return json({ error: `Pilo no logró una ficha mejor con lo que dice la nota: ${r.error}`, code: "verificacion" }, 422);
      }
      const despuesEval = hayTiempo() ? await evaluar(r.valor) : null;
      const w = await admin
        .from("ods_report_indicators")
        .update({ ficha: r.valor, eval: despuesEval?.ok ? despuesEval.valor : {} })
        .eq("report_id", reportId)
        .eq("indicator", id)
        .eq("approved", false)
        .select("indicator");
      if (w.error) throw w.error;
      if (!w.data?.length) return json({ error: "Una persona aprobó esta evidencia mientras Pilo escribía: no se cambió.", code: "aprobada" }, 409);
      await bitacora(1, 0, null);
      return json({ ok: true, antes: { ficha: fila.ficha, eval: fila.eval }, despues: { ficha: r.valor, eval: despuesEval?.ok ? despuesEval.valor : null } });
    } catch (e) {
      return alto(e);
    }
  }

  // Traducir lo que falte (nunca cambia el español) ---------------------------------------------
  if (step === "traducir") {
    let bloquesHechos = 0;
    let noticiasHechas = 0;
    const fallos: { ref: string; error: string }[] = [];
    try {
      const filas = await todas<{ id: string; text: string; text_en: string; origin: string; sources: { news_id: string }[] | null }>((a, b) =>
        admin.from("ods_report_blocks").select("id, text, text_en, origin, sources").eq("report_id", reportId).eq("enabled", true).range(a, b),
      );
      const faltan = filas.filter((b) => b.text.trim() && !b.text_en.trim());
      for (const lote of enGrupos(faltan, 6)) {
        if (!hayTiempo()) break;
        const items: ItemTraducir[] = lote.map((b, i) => ({ ref: `T${i + 1}`, es: b.text }));
        const r = await llamarVerificado(mensajesTraducir(items, "parrafo"), 2400, (c) => leerTraducciones(c, items));
        if (!r.ok) {
          fallos.push(...items.map((i) => ({ ref: lote[Number(i.ref.slice(1)) - 1].id, error: r.error })));
          continue;
        }
        for (const t of r.valor.buenas) {
          const b = lote[Number(t.ref.slice(1)) - 1];
          await admin.from("ods_report_blocks").update(b.origin === "pilo" ? { text_en: t.en, orig_en: t.en } : { text_en: t.en }).eq("id", b.id).eq("text_en", "");
          bloquesHechos++;
        }
        for (const m of r.valor.malas) fallos.push({ ref: lote[Number(m.ref.slice(1)) - 1].id, error: m.error });
      }
      // Los títulos y extractos de las notas del informe.
      const ids = Array.isArray(cuerpo.news_ids) && cuerpo.news_ids.length ? cuerpo.news_ids.map(String) : [...new Set(filas.flatMap((b) => (b.sources ?? []).map((s) => s.news_id)).filter(Boolean))];
      const notas: { id: string; title: string; excerpt: string }[] = [];
      for (const trozo of enTrozos(ids)) {
        const r = await admin.from("news_items").select("id, title, excerpt").in("id", trozo).eq("title_en", "");
        if (r.error) throw r.error;
        notas.push(...((r.data ?? []) as { id: string; title: string; excerpt: string }[]));
      }
      for (const lote of enGrupos(notas, 4)) {
        if (!hayTiempo()) break;
        const items: ItemTraducir[] = lote.flatMap((n, i) => [{ ref: `T${2 * i + 1}`, es: n.title }, ...(n.excerpt.trim() ? [{ ref: `T${2 * i + 2}`, es: n.excerpt }] : [])]);
        const r = await llamarVerificado(mensajesTraducir(items, "titulo"), 2000, (c) => leerTraducciones(c, items));
        if (!r.ok) continue;
        const en = new Map(r.valor.buenas.map((b) => [b.ref, b.en]));
        for (const [i, n] of lote.entries()) {
          const title_en = en.get(`T${2 * i + 1}`);
          if (!title_en) continue;
          await admin.from("news_items").update({ title_en, excerpt_en: en.get(`T${2 * i + 2}`) ?? "" }).eq("id", n.id).eq("title_en", "");
          noticiasHechas++;
        }
      }
      const quedan = faltan.length - bloquesHechos - fallos.length + Math.max(0, notas.length - noticiasHechas);
      await bitacora(bloquesHechos + noticiasHechas, fallos.length, null);
      return json({ ok: true, bloques: bloquesHechos, noticias: noticiasHechas, fallos, quedan: Math.max(0, quedan) });
    } catch (e) {
      return alto(e, bloquesHechos + noticiasHechas, fallos.length);
    }
  }

  return json({ error: "Paso desconocido." }, 400);
});
