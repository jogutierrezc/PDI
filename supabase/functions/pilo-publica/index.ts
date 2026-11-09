/* =============================================================================
   Edge Function · pilo-publica

   Pilo, con el rol de PERIODISTA Y ESTADÍSTICO, arma el informe de un ranking
   (0262): THE Impact por ODS, THE World por pilar y UI GreenMetric por
   categoría. Lee TODAS las fuentes que se le dan, arma el libro de cifras,
   propone el tablero y los gráficos y redacta, en español y en inglés, cómo la
   UDES responde a los indicadores del ranking. Fidelidad sobre elocuencia: una
   cifra o una cita que no se pueda rastrear a una fuente no se publica.

   La lógica pura está en libro.ts (libro de cifras y derivadas), logica.ts
   (lectura y verificación de lo que devuelve la IA), roles.ts (los dos roles y
   sus mensajes), unidades.ts (pilares, categorías, palabras clave, métricas) y
   contrato.ts (tipos de la API y de los spec). Reutiliza, sin cambiarlos, el
   proveedor, la verificación de citas y cifras y la traducción de
   pilo-rankingsod y noticias-pilo.

   El proveedor de IA es el de los rankings (news_settings, 0146) sobre el de
   Mr. Pilo (pilo_ai_settings, pilo_ai_secret). Las claves nunca salen de aquí.

     estado    {}                              → { ok, ai, motivo?, proveedor, modelo, rol }
     fuentes   { informe_id }                  → { ok, fuentes:{noticia,indicador,libro,documento,cifras}, nuevas, avisos }
                 junta lo que existe para (ranking, unit_key, edition); no pisa `include`.
     libro     { informe_id }                  → { ok, cifras, derivadas, avisos }       sin IA
                 cada cifra con un label legible («qué mide — desglose (año)») y su
                 procedencia en pp_cifras.source (SourceCifra en contrato.ts: tabla,
                 oficina, columna, desglose, periodo, indicador, definición, cita,
                 serie…). Conserva lo descrito por una persona (siempre) y por Pilo
                 (si la cifra no cambió).
     describir { informe_id, rehacer? }        → { ok, descritas, fallos:[{key,motivo}], quedan }   estadístico
                 explica las cifras sin descripción (o, con rehacer, también las de
                 Pilo; NUNCA las de una persona) por lotes de ~12: label ES/EN (≤ 90)
                 y descripción ES/EN (≤ 240: qué mide, a qué población, en qué
                 periodo y cómo se obtuvo). El modelo solo ve la procedencia; el
                 valor no se toca; un texto con números que no estén en la
                 procedencia, el valor o el año se omite con su motivo (y la cifra
                 queda marcada para no repetirla en bucle). El cliente repite hasta
                 quedan = 0 (con rehacer, las descritas en los últimos 15 minutos no
                 se repiten).
     analizar  { informe_id, rehacer? }        → { ok, kpis, graficos, descartados, propuestos:[{block_id,chart,title_es,origen}] }
                 el libro llega agrupado por serie con su label y descripción; pide
                 3 a 6 gráficos y, si quedan menos de 3 válidos, el código completa con
                 sugerencias deterministas (origen «codigo»). La IA nunca teclea números.
     redactar  { informe_id, sec?:'portada'|'ejes', block_id?, profundizar?, count?, reintentar?, profundidad?:'normal'|'profunda' }
                                               → { ok, escritos, quedan, fallos, sin_usar, bloques, avisos? }   periodista
                 «profunda» (defecto): hasta 5 fuentes y 4–6 párrafos por eje, UN eje
                 por llamada; «normal»: 3 fuentes y 2–3 párrafos. Con block_id +
                 profundizar, reescribe en profundidad un eje de Pilo sumando fuentes
                 del mismo indicador aún sin citar.
     imagenes  { informe_id }                  → { ok, propuestas, omitidas, aviso }     sin IA
                 no toca imágenes de una persona (origin ≠ pilo) ni externas (spec.externa).
     traducir  { informe_id }                  → { ok, hechos, fallos, quedan }

   Reglas:
     · Solo Planeación o la administración, con sesión (403 si no).
     · Informe publicado: 409 (code «publicado») para todo lo que escribe.
     · La IA nunca escribe un número del tablero: elige keys del libro. En el
       texto, cada número sale de una cifra del libro citada por su key (o es un
       año, una fecha de las citas, el número de fuentes, el ODS o un
       indicador); cada párrafo tiene al menos una cita literal y se citan todas
       las fuentes; el inglés trae las mismas cifras y los mismos párrafos. Un
       reintento con el error (si queda tiempo); si no pasa, el eje queda como
       borrador apagado «SIN VERIFICAR» con el motivo.
     · Pilo no reescribe bloques «persona» ni «editado» (409). Las fuentes que
       fallan quedan marcadas (pp_fuentes.meta.fallo) y se listan; ninguna
       noticia incluida se descarta en silencio (sin_usar).
     · Las imágenes se proponen APAGADAS: Pilo no las ve; nunca con menores.
     · No se empieza otra llamada pasados 50 s; tope de 95 s por llamada. Un
       429 espera hasta 3 s y reintenta una vez. El cliente repite hasta que
       `quedan` sea 0.
     · Bitácora: pp_corridas (cada paso) y news_runs (source «Pilo Publica»).

   Despliegue:
     supabase functions deploy pilo-publica --no-verify-jwt
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { foldSystem, roleRejected } from "../noticias-pilo/logica.ts";
import { anioDeNoticias, rangoFechasDeAnio } from "../pilo-rankingsod/anios.ts";
import { extraerCifras } from "../pilo-rankingsod/cifras.ts";
import { afinidadOds, cifraAnual, plano, UMBRAL_FUENTE, type Criterio, type FilaCifras } from "../pilo-rankingsod/fuentes.ts";
import { altDeFoto, AVISO_IMAGENES, enGrupos, hablaDeMenores, leerAjustes, pieDeFoto, RECORTE_POR_DEFECTO, siguientePos, type Lectura, type Mensaje, type NotaInforme } from "../pilo-rankingsod/logica.ts";
import { elegirProveedor, esperaTras429, leerAjustesIA } from "../pilo-rankingsod/proveedor.ts";
import { ACCIONES, ROL, SECCIONES, type Accion, type CitaBloque, type CodigoError, type Fallo, type GraficoPropuesto, type KindFuente, type MetaNoticia, type Profundidad, type PropuestaImagen, type Ranking, type SinUsar, type SourceCifra, type SpecGrafico } from "./contrato.ts";
import { aNumeroLibre, anioDePeriodo, armarLibro, conservarDescripciones, cortar, formatoValor, resumir, type CifraCruda, type CifraLibro } from "./libro.ts";
import {
  formaEje,
  FUENTES_POR_EJE_MAX,
  fuentesParaProfundizar,
  leerDescripciones,
  leerEje,
  leerPortada,
  leerTablero,
  leerTraduccionesPP,
  MIN_GRAFICOS,
  MAX_GRAFICOS,
  mensajesReintentoPP,
  numerosPermitidos,
  RECORDATORIO,
  sugerirGraficos,
  trabajosEje,
  verificarEje,
  verificarPortada,
  type Descripcion,
  type Eje,
  type FuentePendiente,
  type FuenteTexto,
  type ItemDescribir,
  type ItemTraduccion,
  type Portada,
} from "./logica.ts";
import { mensajesDescribir, mensajesEje, mensajesPortada, mensajesTablero, mensajesTraducirPP } from "./roles.ts";
import { coincidencias, indicadoresDe, indicadorProbable, tocaUnidad, unidadDe, type IndicadorRanking, type PreguntaGreen } from "./unidades.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fallo = (error: string, code: CodigoError, status: number, extra: Record<string, unknown> = {}) => json({ error, code, ...extra }, status);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRESUPUESTO_MS = 50_000;
const TOPE_LLAMADA_MS = 95_000;
const FIN_MS = 140_000;
const FUENTE_BITACORA = "Pilo Publica";
const PAGINA = 1000;
/** Años hacia atrás que lee UDES en Cifras para las series. */
const ANIOS_SERIE = 5;
/** Cifras que se sacan, como máximo, del texto de un documento. */
const CIFRAS_POR_DOCUMENTO = 30;

const CICLO_RANKING: Partial<Record<Ranking, string>> = { impact: "the-impact", green: "ui-greenmetric" };

const faltaMigracion = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "")));
const MIGRACION = { error: "Falta aplicar la migración 0262 (Pilo Publica).", code: "migracion" as const };

/** El proveedor falló: se detiene todo y se dice por qué. */
class AltoProveedor extends Error {
  constructor(
    message: string,
    readonly code: CodigoError,
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

const enTrozos = <T>(lista: T[], n = 150) => enGrupos(lista, n);
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
/** Huella corta y estable de un texto (para keys de cifras de documentos). */
const huella = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const slug = (s: string) => plano(s).replace(/ /g, "-").slice(0, 40) || "sin-dato";
const anioDe = (fecha: unknown) => {
  const m = String(fecha ?? "").match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
};

/* ---------- Filas que se leen ----------------------------------------------------------- */

interface Informe {
  id: string;
  ranking: Ranking;
  unit_key: string;
  edition: number;
  state: string;
  settings: Record<string, unknown> | null;
  title_es: string;
  title_en: string;
  lead_es: string;
  lead_en: string;
}

interface FilaFuente {
  id: string;
  kind: KindFuente;
  ref: string;
  label: string;
  include: boolean;
  meta: Record<string, unknown> | null;
}

interface FilaBloque {
  id: string;
  kind: "kpi" | "grafico" | "texto" | "imagen";
  sec: string;
  pos: number;
  origin: "pilo" | "persona" | "editado";
  enabled: boolean;
  spec: Record<string, unknown> | null;
  heading_es: string;
  heading_en: string;
  text_es: string;
  text_en: string;
  sources: CitaBloque[] | null;
  figs: string[] | null;
  warn?: string | null;
}

interface Candidata {
  kind: KindFuente;
  ref: string;
  label: string;
  include: boolean;
  meta: Record<string, unknown>;
}

interface Ciclo {
  id: string;
  anio_datos: number;
}

interface Nota {
  id: string;
  title: string;
  body: string | null;
  published_on: string | null;
  url: string;
  section: string;
  campus: string;
  state: string;
}

/** pp_fuentes.meta de una noticia (MetaNoticia en contrato.ts: lo que lee la pantalla). */
const metaNoticia = (n: Nota): Omit<MetaNoticia, "indicator" | "score"> => ({
  news_id: n.id,
  date: n.published_on,
  office: n.section ?? "",
  campus: n.campus ?? "",
  state: n.state,
  public: n.state === "ok",
  minors: hablaDeMenores({ title: n.title, body: n.body ?? "" }),
  url: n.url,
});
const fechaDe = (meta: Record<string, unknown> | null | undefined) => String(meta?.date ?? meta?.published_on ?? "");

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return fallo("Método no permitido.", "accion", 405);

  const url = ENV("SUPABASE_URL");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  if (!url || !serviceKey) return fallo("La función no está configurada.", "interno", 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let cuerpo: { action?: string; informe_id?: string; rehacer?: boolean; sec?: string; block_id?: string; count?: number; reintentar?: boolean; profundidad?: string; profundizar?: boolean } = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return fallo("Cuerpo inválido.", "cuerpo", 400);
  }
  const accion = String(cuerpo.action ?? "") as Accion;
  if (!ACCIONES.includes(accion)) return fallo("Acción desconocida.", "accion", 400);

  // Quién llama: Planeación o la administración, con sesión activa.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return fallo("Falta la sesión.", "sesion", 401);
  const who = await admin.auth.getUser(authorization.slice(7));
  if (who.error || !who.data.user) return fallo("Sesión inválida.", "sesion", 401);
  const actor = who.data.user.id;
  const { data: perfil } = await admin.from("profiles").select("role, is_active").eq("id", actor).maybeSingle();
  if (!perfil?.is_active || !["planeacion", "admin"].includes(String(perfil?.role))) return fallo("Solo Planeación o la administración.", "permiso", 403);

  // El proveedor de los rankings (0146) sobre el de Mr. Pilo (0089, 0091).
  const [{ data: settings }, { data: secret }, ajustesFila] = await Promise.all([
    admin.from("pilo_ai_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("pilo_ai_secret").select("*").eq("id", 1).maybeSingle(),
    admin.from("news_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const destino = elegirProveedor(leerAjustesIA(ajustesFila.data as Record<string, unknown> | null), settings as Record<string, unknown> | null, secret as Record<string, unknown> | null);
  const motivo = destino.ok ? null : destino.motivo ?? "La IA de los rankings no está lista.";

  if (accion === "estado") return json({ ok: true, ai: !motivo, ...(motivo ? { motivo } : {}), proveedor: destino.proveedor, modelo: destino.model, rol: ROL });

  // El informe ---------------------------------------------------------------------------
  const informeId = String(cuerpo.informe_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(informeId)) return fallo("Falta el informe (informe_id).", "informe", 400);
  const leido = await admin.from("pp_informes").select("id, ranking, unit_key, edition, state, settings, title_es, title_en, lead_es, lead_en").eq("id", informeId).maybeSingle();
  if (leido.error) return faltaMigracion(leido.error) ? json(MIGRACION, 503) : fallo(leido.error.message, "interno", 500);
  if (!leido.data) return fallo("No existe ese informe.", "informe", 404);
  const informe = leido.data as unknown as Informe;
  // Todas las acciones (salvo «estado») escriben: un informe publicado no se toca.
  if (informe.state === "publicado") return fallo("El informe está publicado: pásalo a revisión para que Pilo escriba en él.", "publicado", 409);
  const unidad = unidadDe(informe.ranking, String(informe.unit_key));
  if (!unidad) return fallo(`La unidad «${informe.unit_key}» no es válida para el ranking ${informe.ranking}.`, "informe", 400);
  const edition = Number(informe.edition);
  const anioNoticias = anioDeNoticias(edition);
  const voz = leerAjustes(informe.settings);

  // Presupuesto, llamadas y bitácora ------------------------------------------------------
  const inicio = Date.now();
  const plegar = (settings as Record<string, unknown> | null)?.system_role === "user" && destino.eleccion === "pilo";
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

  /**
   * Una llamada, su lectura y, si no pasa, un reintento con el error. El
   * reintento solo se hace si cabe en el presupuesto suponiendo que tarda lo
   * mismo que la primera (con textos largos, una llamada puede pasar de 30 s y
   * el servidor corta la petición).
   */
  const llamarVerificado = async <T>(mensajes: Mensaje[], maxTokens: number, leer: (crudo: string) => Lectura<T>, recordatorio?: string): Promise<Lectura<T>> => {
    const t0 = Date.now();
    const crudo = await llamar(mensajes, maxTokens);
    const duracion = Date.now() - t0;
    const primera = leer(crudo);
    if (primera.ok) return primera;
    if (!hayTiempo() || Date.now() - inicio + duracion > PRESUPUESTO_MS) return { ok: false, error: `${primera.error} No hubo tiempo de reintentar.` };
    const segunda = leer(await llamar(mensajesReintentoPP(mensajes, crudo, primera.error, recordatorio), maxTokens));
    return segunda.ok ? segunda : { ok: false, error: segunda.error };
  };

  const bitacora = async (detalle: Record<string, unknown>, guardados: number, fallidos: number, error: string | null) => {
    try {
      await admin.from("pp_corridas").insert({ informe_id: informeId, actor, accion, detalle: { ...detalle, llamadas, ms: Date.now() - inicio, ...(error ? { error: error.slice(0, 300) } : {}) } });
      await admin.from("news_runs").insert({
        started_at: new Date(inicio).toISOString(),
        finished_at: new Date().toISOString(),
        source: FUENTE_BITACORA,
        seen: llamadas,
        saved: guardados,
        skipped: fallidos,
        error: error ? `${accion}: ${error}`.slice(0, 300) : null,
      });
    } catch {
      // La bitácora no tumba el paso.
    }
  };

  const alto = async (e: unknown, detalle: Record<string, unknown> = {}, guardados = 0, fallidos = 0) => {
    if (e instanceof AltoProveedor) {
      await bitacora(detalle, guardados, fallidos, e.message);
      return fallo(e.message, e.code, e.status);
    }
    const m = mensajeDe(e);
    // Al log del contenedor (docker logs): el mensaje, el código de la base y el tiempo, para diagnosticar sin adivinar.
    console.error(`[pilo-publica] ${accion} falló tras ${Date.now() - inicio} ms:`, m, (e as { code?: string; details?: string; hint?: string })?.code ?? "", (e as { details?: string })?.details ?? "", (e as { hint?: string })?.hint ?? "");
    await bitacora(detalle, guardados, fallidos, m);
    return faltaMigracion(e as { code?: string; message?: string }) ? json(MIGRACION, 503) : fallo(m, "interno", 500);
  };

  // Lecturas comunes ------------------------------------------------------------------------
  const ciclo = async (): Promise<Ciclo | null> => {
    const r = CICLO_RANKING[informe.ranking];
    if (!r) return null;
    // El ciclo de la edición; si aún no existe (p. ej. edición 2027 con solo el ciclo 2026), el más reciente anterior.
    const { data, error } = await admin.from("ranking_cycles").select("id, anio_datos").eq("ranking", r).lte("anio", edition).order("anio", { ascending: false }).limit(1);
    if (error) throw error;
    const fila = data?.[0];
    return fila ? { id: String(fila.id), anio_datos: Number(fila.anio_datos) } : null;
  };

  const preguntasGreen = async (c: Ciclo | null): Promise<(PreguntaGreen & { unidad: string | null; esquema: { campos?: { k: string; tipo: string; es?: string; en?: string; unidad?: string }[] } | null })[]> => {
    if (informe.ranking !== "green" || !c) return [];
    return await todas((a, b) => admin.from("ugm_preguntas").select("q, categoria, nombre_es, nombre_en, unidad, esquema").eq("ciclo_id", c.id).eq("categoria", unidad.key).order("orden").range(a, b));
  };

  const indicadores = async (c: Ciclo | null): Promise<IndicadorRanking[]> => indicadoresDe(unidad, await preguntasGreen(c));

  const cargarFuentes = (soloIncluidas: boolean) =>
    todas<FilaFuente>((a, b) => {
      let q = admin.from("pp_fuentes").select("id, kind, ref, label, include, meta").eq("informe_id", informeId);
      if (soloIncluidas) q = q.eq("include", true);
      return q.order("created_at").range(a, b);
    });

  const cargarBloques = (kinds?: string[]) =>
    todas<FilaBloque>((a, b) => {
      let q = admin.from("pp_bloques").select("id, kind, sec, pos, origin, enabled, spec, heading_es, heading_en, text_es, text_en, sources, figs, warn").eq("informe_id", informeId);
      if (kinds) q = q.in("kind", kinds);
      return q.order("pos").range(a, b);
    });

  const cargarLibro = () =>
    todas<CifraLibro>((a, b) => admin.from("pp_cifras").select("key, label, label_en, unit, year, value, derived, formula, source, indicator").eq("informe_id", informeId).order("key").range(a, b)).then((l) =>
      l.map((c) => ({ ...c, value: Number(c.value) })).filter((c) => Number.isFinite(c.value)),
    );

  /** Las respuestas de THE Impact (ranking_responses) con el texto de su indicador y de sus campos. */
  const leerTHE = async (c: Ciclo, ids?: string[]) => {
    const inds = await todas<{ id: string; texto_es: string; texto_en: string; tipo: string | null; nivel: string }>((a, b) =>
      admin.from("ranking_indicators").select("id, texto_es, texto_en, tipo, nivel").eq("ciclo", c.id).eq("ods", Number(unidad.key)).range(a, b),
    );
    const texto = new Map(inds.map((i) => [i.id, i]));
    type Resp = { id: string; indicador: string; unidad: string; valores: Record<string, number | null> | null; si_no: boolean | null; comentario_es: string; comentario_en: string; oficial: boolean };
    const resp: Resp[] = [];
    const deIndicadores = inds.filter((i) => i.nivel !== "metric").map((i) => i.id);
    for (const trozo of enTrozos(deIndicadores)) {
      let q = admin.from("ranking_responses").select("id, indicador, unidad, valores, si_no, comentario_es, comentario_en, oficial").eq("ciclo", c.id).eq("estado", "ok").in("indicador", trozo);
      if (ids?.length) q = q.in("id", ids);
      const r = await q;
      if (r.error) throw r.error;
      resp.push(...((r.data ?? []) as Resp[]));
    }
    return { resp, texto };
  };

  /** Las respuestas aprobadas de UI GreenMetric (no sensibles) de la categoría. */
  const leerUGM = async (c: Ciclo, ids?: string[]) => {
    const preguntas = await preguntasGreen(c);
    const porQ = new Map(preguntas.map((p) => [p.q, p]));
    type Resp = { id: string; q: string; valores: Record<string, unknown> | null; textos_es: Record<string, unknown> | null };
    const resp: Resp[] = [];
    for (const trozo of enTrozos(preguntas.map((p) => p.q))) {
      let q = admin.from("ugm_respuestas").select("id, q, valores, textos_es").eq("ciclo_id", c.id).eq("estado", "aprobado").eq("sensible", false).in("q", trozo);
      if (ids?.length) q = q.in("id", ids);
      const r = await q;
      if (r.error) throw r.error;
      resp.push(...((r.data ?? []) as Resp[]));
    }
    return { resp, porQ };
  };

  /** El nombre legible de las unidades u oficinas (units.name) por id; lo que no se lee queda fuera. */
  const nombresDeUnidades = async (ids: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    for (const trozo of enTrozos([...new Set(ids.filter(Boolean))])) {
      const r = await admin.from("units").select("id, name").in("id", trozo);
      if (r.error) return out;
      for (const u of (r.data ?? []) as { id: string; name: string }[]) out.set(u.id, u.name);
    }
    return out;
  };

  /* ===================================================================================
     fuentes: junta lo que existe y lo guarda sin pisar `include`
     =================================================================================== */
  if (accion === "fuentes") {
    const avisos: string[] = [];
    const candidatas: Candidata[] = [];
    let c: Ciclo | null = null;
    try {
      c = await ciclo();
    } catch {
      avisos.push("No se pudo leer el ciclo del ranking (ranking_cycles): los indicadores diligenciados no se conectan.");
    }
    if (CICLO_RANKING[informe.ranking] && !c) avisos.push(`No hay un ciclo de ${informe.ranking === "impact" ? "THE Impact" : "UI GreenMetric"} para la edición ${edition}: no hay indicadores diligenciados que leer.`);

    // 1. Noticias aprobadas del año de noticias de la edición.
    const { desde, hasta } = rangoFechasDeAnio(anioNoticias);
    try {
      if (informe.ranking === "impact") {
        type Fila = { score: number; indicator: string | null; news_items: Nota };
        const filas = await todas<Fila>((a, b) =>
          admin
            .from("news_ods")
            .select("score, indicator, news_items!inner(id, title, body, published_on, url, section, campus, state)")
            .eq("ods", Number(unidad.key))
            .eq("news_items.state", "ok")
            .gte("news_items.published_on", desde)
            .lt("news_items.published_on", hasta)
            .order("news_id")
            .range(a, b),
        );
        for (const f of filas.filter((x) => x.news_items)) candidatas.push({ kind: "noticia", ref: f.news_items.id, label: f.news_items.title.slice(0, 300), include: true, meta: { ...metaNoticia(f.news_items), indicator: f.indicator, score: f.score } });
      } else {
        const filas = await todas<Nota>((a, b) =>
          admin.from("news_items").select("id, title, body, published_on, url, section, campus, state").eq("state", "ok").gte("published_on", desde).lt("published_on", hasta).order("id").range(a, b),
        );
        for (const n of filas) {
          if (!tocaUnidad(n.title, n.body ?? "", unidad.palabras, 2)) continue;
          candidatas.push({ kind: "noticia", ref: n.id, label: n.title.slice(0, 300), include: true, meta: { ...metaNoticia(n), palabras: coincidencias(`${n.title} ${n.body ?? ""}`, unidad.palabras).slice(0, 8) } });
        }
      }
    } catch (e) {
      avisos.push(`Noticias: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
    }
    if (!candidatas.some((c) => c.kind === "noticia")) {
      avisos.push(`No hay noticias aprobadas ${informe.ranking === "impact" ? `del ODS ${unidad.key} ` : "de esta unidad "}publicadas en ${anioNoticias}. La edición ${edition} usa las noticias de ${anioNoticias} (las de un año van a la edición siguiente): si tus noticias son de otro año, cambia la edición del informe. La edición 2026 usa las de 2025.`);
    }

    // 2. Indicadores diligenciados y aprobados.
    if (informe.ranking === "world") avisos.push("THE World no tiene reporte por oficinas en el sistema: no hay indicadores diligenciados que leer.");
    if (c && informe.ranking === "impact") {
      try {
        const { resp, texto } = await leerTHE(c);
        for (const r of resp)
          candidatas.push({ kind: "indicador", ref: `the:${r.id}`, label: `${r.indicador} · ${(texto.get(r.indicador)?.texto_es ?? "").slice(0, 200)}`, include: true, meta: { ciclo: c.id, indicador: r.indicador, unidad: r.unidad, oficial: r.oficial } });
      } catch (e) {
        avisos.push(`Indicadores de THE Impact: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
      }
    }
    if (c && informe.ranking === "green") {
      try {
        const { resp, porQ } = await leerUGM(c);
        for (const r of resp) candidatas.push({ kind: "indicador", ref: `ugm:${r.id}`, label: `${r.q} · ${(porQ.get(r.q)?.nombre_es ?? "").slice(0, 200)}`, include: true, meta: { ciclo: c.id, q: r.q, indicador: r.q } });
      } catch (e) {
        avisos.push(`Preguntas de UI GreenMetric: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
      }
    }

    // 3. Tablas de Datos de Sostenibilidad ligadas a la unidad.
    try {
      type Ind = { id: string; ods: number | null; nombre: string; descripcion: string; etiquetas: string[] | null; archivado: boolean | null };
      const inds = (await todas<Ind>((a, b) => admin.from("ds_indicadores").select("id, ods, nombre, descripcion, etiquetas, archivado").range(a, b))).filter(
        (i) => !i.archivado && (informe.ranking === "impact" ? Number(i.ods) === Number(unidad.key) : tocaUnidad(i.nombre, `${i.descripcion} ${(i.etiquetas ?? []).join(" ")}`, unidad.palabras, 1)),
      );
      const porInd = new Map(inds.map((i) => [i.id, i]));
      type Resp = { id: string; libro_id: string; indicador_id: string };
      const resp: Resp[] = [];
      for (const trozo of enTrozos(inds.map((i) => i.id))) {
        const r = await admin.from("ds_respuestas").select("id, libro_id, indicador_id").in("indicador_id", trozo);
        if (r.error) throw r.error;
        resp.push(...((r.data ?? []) as Resp[]));
      }
      const libros = new Map<string, { nombre: string; estado: string }>();
      for (const trozo of enTrozos([...new Set(resp.map((r) => r.libro_id))])) {
        const r = await admin.from("ds_libros").select("id, nombre, estado").in("id", trozo);
        if (r.error) throw r.error;
        for (const l of (r.data ?? []) as { id: string; nombre: string; estado: string }[]) libros.set(l.id, l);
      }
      let borradores = 0;
      for (const r of resp) {
        const l = libros.get(r.libro_id);
        if (!l) continue;
        const listo = l.estado === "listo";
        if (!listo) borradores++;
        candidatas.push({ kind: "libro", ref: `ds:${r.id}`, label: `${porInd.get(r.indicador_id)?.nombre ?? r.indicador_id} · ${l.nombre}`.slice(0, 300), include: listo, meta: { libro_id: r.libro_id, indicador_id: r.indicador_id, estado: l.estado } });
      }
      if (borradores) avisos.push(`${borradores} tabla(s) de Datos de Sostenibilidad siguen en borrador: quedan en la lista sin incluir.`);
    } catch (e) {
      avisos.push(`Datos de Sostenibilidad: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
    }

    // 4. UDES en Cifras: indicadores publicados que tocan la unidad.
    try {
      type Ind = { id: string; key: string; label: string; definition: string; od_reports: { name: string; status: string; od_periods: { status: string; illustrative: boolean; end_year: number } } };
      const inds = (await todas<Ind>((a, b) => admin.from("od_indicators").select("id, key, label, definition, od_reports!inner(name, status, od_periods!inner(status, illustrative, end_year))").range(a, b))).filter(
        (i) => i.od_reports?.status === "publicado" && i.od_reports.od_periods?.status === "publicado" && !i.od_reports.od_periods.illustrative,
      );
      let criterios: Criterio[] | null = null;
      if (informe.ranking === "impact") {
        try {
          criterios = await todas<Criterio>((a, b) => admin.from("imp_criteria").select("sdg, term, weight").eq("target", "ods").eq("sdg", Number(unidad.key)).range(a, b));
        } catch {
          avisos.push("No se pudo leer el diccionario del motor (imp_criteria): UDES en Cifras se reconoce con las palabras clave de Pilo Publica.");
        }
      }
      const toca = (i: Ind) =>
        criterios?.length
          ? afinidadOds(`${i.label} ${i.label} ${i.definition} ${i.od_reports.name}`, criterios, Number(unidad.key)).score >= UMBRAL_FUENTE
          : tocaUnidad(i.label, `${i.definition} ${i.od_reports.name}`, unidad.palabras, 2);
      // El mismo indicador (key) en varios periodos: el del periodo más reciente.
      const porKey = new Map<string, Ind>();
      for (const i of inds.filter(toca)) {
        const previo = porKey.get(i.key);
        if (!previo || i.od_reports.od_periods.end_year > previo.od_reports.od_periods.end_year) porKey.set(i.key, i);
      }
      for (const i of porKey.values()) candidatas.push({ kind: "cifras", ref: `od:${i.id}`, label: `${i.label} (${i.od_reports.name})`.slice(0, 300), include: true, meta: { indicator_id: i.id, key: i.key, report: i.od_reports.name } });
    } catch (e) {
      avisos.push(`UDES en Cifras: no se pudo leer (${mensajeDe(e).slice(0, 120)}).`);
    }

    // 5. Documentos de la biblioteca de evidencias con texto leído.
    try {
      type Doc = { id: string; nombre: string; carpeta: string; anio_detectado: number | null; evidencia: string | null; ods_propuestos: number[] | null; texto?: string };
      const docs = await todas<Doc>((a, b) => {
        let q = admin
          .from("ranking_biblioteca")
          .select(informe.ranking === "impact" ? "id, nombre, carpeta, anio_detectado, evidencia, ods_propuestos" : "id, nombre, carpeta, anio_detectado, evidencia, ods_propuestos, texto")
          .neq("estado", "descartada")
          .eq("estado_texto", "ok");
        if (informe.ranking === "impact") q = q.contains("ods_propuestos", [Number(unidad.key)]);
        return q.order("id").range(a, b);
      });
      const propios = informe.ranking === "impact" ? docs : docs.filter((d) => tocaUnidad(`${d.nombre} ${d.carpeta}`, (d.texto ?? "").slice(0, 6000), unidad.palabras, 2));
      const publicas = new Set<string>();
      for (const trozo of enTrozos(propios.map((d) => d.evidencia).filter((x): x is string => Boolean(x)))) {
        const r = await admin.from("ranking_evidence").select("id").in("id", trozo).eq("publica", true);
        if (r.error) throw r.error;
        for (const e of (r.data ?? []) as { id: string }[]) publicas.add(e.id);
      }
      let privados = 0;
      for (const d of propios) {
        const publica = Boolean(d.evidencia && publicas.has(d.evidencia));
        if (!publica) privados++;
        candidatas.push({ kind: "documento", ref: `bib:${d.id}`, label: d.nombre.slice(0, 300), include: publica && !/methodolog|metodolog/i.test(d.nombre), meta: { biblioteca_id: d.id, anio: d.anio_detectado, publica, ...(/methodolog|metodolog/i.test(d.nombre) ? { nota: "Metodología del ranking: no es evidencia de lo que hace la UDES." } : {}) } });
      }
      if (privados) avisos.push(`${privados} documento(s) de la biblioteca no están ligados a una evidencia pública: quedan en la lista sin incluir.`);
    } catch (e) {
      avisos.push(`Biblioteca de evidencias: no se pudo leer (${mensajeDe(e).slice(0, 120)}).`);
    }

    // Guardar sin pisar `include` de las que ya están.
    let nuevas = 0;
    try {
      const unicas = [...new Map(candidatas.map((x) => [`${x.kind}|${x.ref}`, x])).values()];
      for (const lote of enGrupos(unicas, 400)) {
        const w = await admin
          .from("pp_fuentes")
          .upsert(lote.map((x) => ({ informe_id: informeId, ...x })), { onConflict: "informe_id,kind,ref", ignoreDuplicates: true })
          .select("id");
        if (w.error) throw w.error;
        nuevas += (w.data ?? []).length;
      }
      const todasFuentes = await cargarFuentes(false);
      const fuentes = { noticia: 0, indicador: 0, libro: 0, documento: 0, cifras: 0 } as Record<KindFuente, number>;
      for (const f of todasFuentes) fuentes[f.kind] = (fuentes[f.kind] ?? 0) + 1;
      await bitacora({ fuentes, nuevas, avisos: avisos.length }, nuevas, 0, null);
      return json({ ok: true, fuentes, nuevas, avisos });
    } catch (e) {
      return alto(e, { nuevas });
    }
  }

  /* ===================================================================================
     libro: el estadístico sin IA
     =================================================================================== */
  if (accion === "libro") {
    const avisos: string[] = [];
    try {
      const fuentes = await cargarFuentes(true);
      if (!fuentes.length) return fallo("No hay fuentes incluidas: primero junta las fuentes.", "sin_fuentes", 409);
      const crudas: CifraCruda[] = [];
      const de = (k: KindFuente) => fuentes.filter((f) => f.kind === k);
      let c: Ciclo | null = null;
      try {
        c = await ciclo();
      } catch {
        avisos.push("No se pudo leer el ciclo del ranking.");
      }
      const anioDatos = c?.anio_datos ?? edition - 1;

      // Noticias: el libro de cifras de cada nota (news_figures, score > 0).
      try {
        const notas = de("noticia");
        const porId = new Map(notas.map((n) => [n.ref, n]));
        for (const trozo of enTrozos(notas.map((n) => n.ref))) {
          const filas = await todas<{ id: string; news_id: string; value: string; num: number | null; unit: string; label: string; quote: string; kind: string }>((a, b) =>
            admin.from("news_figures").select("id, news_id, value, num, unit, label, quote, kind").in("news_id", trozo).gt("score", 0).order("id").range(a, b),
          );
          for (const f of filas) {
            const n = porId.get(f.news_id);
            const campus = String(n?.meta?.campus ?? "").trim();
            const oficina = String(n?.meta?.office ?? "").trim();
            const fecha = fechaDe(n?.meta);
            const indicador = String(n?.meta?.indicator ?? "").split("/")[0];
            crudas.push({
              key: `nf:${f.id}`,
              serie: `nf:${f.id}`,
              label: f.label || f.value,
              que: f.label || `Cifra de la noticia «${(n?.label ?? "").slice(0, 80)}»`,
              ...(campus ? { desglose: `Sede ${campus}` } : {}),
              unit: f.kind === "porcentaje" ? "%" : f.unit,
              year: anioDe(fecha),
              value: f.num === null ? null : Number(f.num),
              source: {
                kind: "noticia",
                tabla: `Noticia: ${(n?.label ?? "").slice(0, 160)}`,
                tabla_db: "news_figures",
                ref: f.news_id,
                fila: f.id,
                ...(oficina ? { oficina } : {}),
                ...(fecha ? { periodo: fecha.slice(0, 10) } : {}),
                ...(indicador ? { indicador_id: indicador } : {}),
                ...(f.quote ? { cita: f.quote } : {}),
                ...(n?.meta?.url ? { url: String(n.meta.url) } : {}),
                serie: `nf:${f.id}`,
              },
              indicator: (n?.meta?.indicator as string | null) ?? null,
            });
          }
        }
        const sinCifras = notas.length && !crudas.length;
        if (sinCifras) avisos.push("Las noticias incluidas aún no tienen cifras extraídas (news_figures): corre «cifras» en los informes ODS para llenarlas.");
      } catch (e) {
        avisos.push(`Cifras de las noticias: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
      }

      // Indicadores diligenciados: cada campo numérico.
      const ind = de("indicador");
      if (ind.length && c && informe.ranking === "impact") {
        try {
          const ids = ind.map((f) => f.ref.replace(/^the:/, ""));
          const { resp, texto } = await leerTHE(c, ids);
          // La oficina que respondió (units.name): es el desglose de la cifra.
          const oficinas = await nombresDeUnidades(resp.map((r) => r.unidad));
          for (const r of resp)
            for (const [campo, valor] of Object.entries(r.valores ?? {})) {
              const delCampo = texto.get(campo);
              const delIndicador = texto.get(r.indicador);
              const nombre = delCampo?.texto_es || delIndicador?.texto_es || `Indicador ${r.indicador}`;
              const oficina = oficinas.get(r.unidad) ?? "";
              crudas.push({
                key: `the:${r.id}:${campo}`,
                serie: `the:${r.id}:${campo}`,
                label: nombre.slice(0, 200),
                que: nombre,
                ...(delCampo?.texto_en || delIndicador?.texto_en ? { que_en: delCampo?.texto_en || delIndicador?.texto_en } : {}),
                ...(oficina ? { desglose: oficina } : {}),
                unit: /%|porcentaje/i.test(nombre) ? "%" : "",
                year: anioDatos,
                value: typeof valor === "number" ? valor : null,
                source: {
                  kind: "indicador",
                  tabla: `Reporte por oficinas de THE Impact (ODS ${unidad.key})`,
                  tabla_db: "ranking_responses",
                  ref: `the:${r.id}`,
                  fila: r.id,
                  ...(oficina ? { oficina } : {}),
                  columna: delCampo?.texto_es ? cortar(delCampo.texto_es, 160) : campo,
                  periodo: `${anioDatos} (año de datos del ciclo)`,
                  indicador_id: r.indicador,
                  ...(delIndicador?.texto_es ? { indicador: cortar(delIndicador.texto_es, 200) } : {}),
                  ...(delIndicador?.texto_es || delCampo?.texto_es ? { definicion: cortar(delCampo?.texto_es || delIndicador?.texto_es || "", 400) } : {}),
                  serie: `the:${r.id}:${campo}`,
                },
                indicator: r.indicador.split("/")[0],
              });
            }
        } catch (e) {
          avisos.push(`Indicadores de THE Impact: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
        }
      }
      if (ind.length && c && informe.ranking === "green") {
        try {
          const ids = ind.map((f) => f.ref.replace(/^ugm:/, ""));
          const { resp, porQ } = await leerUGM(c, ids);
          for (const r of resp) {
            const p = porQ.get(r.q);
            for (const campo of p?.esquema?.campos ?? []) {
              if (campo.tipo !== "numero") continue;
              const valor = r.valores?.[campo.k];
              // «y1», «y2», «y3»: los tres años de la pregunta, sin año fijo.
              const sinAnio = /^y\d$/.test(campo.k);
              const pregunta = p?.nombre_es || `Pregunta ${r.q} de UI GreenMetric`;
              const que = campo.es && !sinAnio ? campo.es : pregunta;
              const queEn = campo.en && !sinAnio ? campo.en : p?.nombre_en || "";
              crudas.push({
                key: `ugm:${r.id}:${campo.k}`,
                serie: `ugm:${r.q}:${campo.k}`,
                label: que.slice(0, 200),
                que,
                ...(queEn ? { que_en: queEn } : {}),
                ...(sinAnio ? { desglose: campo.es ? `${campo.es}` : `año ${campo.k.slice(1)} de los tres que pide la pregunta` } : {}),
                unit: campo.unidad ?? p?.unidad ?? "",
                year: sinAnio ? null : anioDatos,
                value: typeof valor === "number" ? valor : aNumeroLibre(valor),
                source: {
                  kind: "indicador",
                  tabla: `Respuestas de UI GreenMetric · categoría ${unidad.key}`,
                  tabla_db: "ugm_respuestas",
                  ref: `ugm:${r.id}`,
                  fila: r.id,
                  columna: campo.es || campo.k,
                  periodo: sinAnio ? `${campo.es || campo.k} (de los años que pide la pregunta)` : `${anioDatos} (año de datos del ciclo)`,
                  indicador_id: r.q,
                  indicador: cortar(pregunta, 200),
                  serie: `ugm:${r.q}:${campo.k}`,
                },
                indicator: r.q,
              });
            }
          }
        } catch (e) {
          avisos.push(`Preguntas de UI GreenMetric: no se pudieron leer (${mensajeDe(e).slice(0, 120)}).`);
        }
      }

      // Datos de Sostenibilidad: el valor por año (y por sede, si el mapa la trae).
      for (const f of de("libro")) {
        try {
          const respId = f.ref.replace(/^ds:/, "");
          const r = await admin.from("ds_respuestas").select("id, libro_id, indicador_id, mapa").eq("id", respId).maybeSingle();
          if (r.error) throw r.error;
          if (!r.data) {
            avisos.push(`La tabla «${f.label.slice(0, 60)}» ya no está conectada.`);
            continue;
          }
          const mapa = (r.data.mapa ?? {}) as Record<string, string>;
          const ii = await admin.from("ds_indicadores").select("id, nombre, descripcion, unidad, resumen").eq("id", r.data.indicador_id).maybeSingle();
          if (ii.error) throw ii.error;
          if (!mapa.valor) {
            avisos.push(`«${f.label.slice(0, 60)}»: el mapa no dice qué columna da el valor.`);
            continue;
          }
          const libroId = String(r.data.libro_id);
          const [col, lib] = await Promise.all([
            admin.from("ds_columnas").select("clave, etiqueta, tipo").eq("libro_id", libroId).eq("clave", mapa.valor).maybeSingle(),
            admin.from("ds_libros").select("nombre, oficina_id").eq("id", libroId).maybeSingle(),
          ]);
          const filas = await todas<{ id: string; datos: Record<string, unknown> }>((a, b) => admin.from("ds_filas").select("id, datos").eq("libro_id", libroId).order("orden").range(a, b));
          const regla = (["suma", "promedio", "ultimo"].includes(String(ii.data?.resumen)) ? ii.data?.resumen : "promedio") as "suma" | "promedio" | "ultimo";
          const unit = col.data?.tipo === "porcentaje" ? "%" : String(ii.data?.unidad ?? "");
          const nombre = String(ii.data?.nombre ?? f.label);
          // Lo que mide: el indicador y, si dice algo más, la columna («Brigadas de salud · Número de asistentes»).
          const etiquetaCol = String(col.data?.etiqueta ?? "").trim();
          const que = etiquetaCol && !nombre.toLowerCase().includes(etiquetaCol.toLowerCase()) ? `${nombre} · ${etiquetaCol}` : nombre;
          const tabla = String(lib.data?.nombre ?? "").trim() || f.label;
          const oficina = lib.data?.oficina_id ? (await nombresDeUnidades([String(lib.data.oficina_id)])).get(String(lib.data.oficina_id)) ?? "" : "";
          const grupos = new Map<string, { year: number | null; sede: string; valores: number[]; filas: string[]; periodos: Set<string> }>();
          let sinValor = 0;
          for (const fila of filas) {
            const valor = aNumeroLibre(fila.datos?.[mapa.valor]);
            if (valor === null) {
              sinValor++;
              continue;
            }
            const year = mapa.periodo ? anioDePeriodo(fila.datos?.[mapa.periodo]) : null;
            const sede = mapa.campus ? String(fila.datos?.[mapa.campus] ?? "").trim() : "";
            const k = `${year ?? ""}|${sede}`;
            const g = grupos.get(k) ?? { year, sede, valores: [], filas: [], periodos: new Set<string>() };
            g.valores.push(valor);
            g.filas.push(fila.id);
            const periodo = mapa.periodo ? String(fila.datos?.[mapa.periodo] ?? "").trim() : "";
            if (periodo) g.periodos.add(periodo.slice(0, 20));
            grupos.set(k, g);
          }
          if (sinValor) avisos.push(`«${nombre.slice(0, 60)}»: ${sinValor} fila(s) sin valor numérico no entran al libro.`);
          const sedesPorAnio = new Map<string, Set<string>>();
          for (const g of grupos.values()) sedesPorAnio.set(String(g.year ?? ""), (sedesPorAnio.get(String(g.year ?? "")) ?? new Set<string>()).add(g.sede));
          for (const g of grupos.values()) {
            const varias = (sedesPorAnio.get(String(g.year ?? ""))?.size ?? 0) > 1 && g.sede;
            const value = resumir(g.valores, regla);
            const serie = `ds:${respId}${varias ? `:${slug(g.sede)}` : ""}`;
            const periodos = [...g.periodos].sort();
            const nota = g.valores.length > 1 ? `${regla === "suma" ? "suma" : regla === "ultimo" ? "último valor" : "promedio"} de ${g.valores.length} filas` : undefined;
            crudas.push({
              key: `ds:${respId}:${g.year ?? "sin-anio"}${varias ? `:${slug(g.sede)}` : ""}`,
              serie,
              label: varias ? `${nombre} — ${g.sede}` : nombre,
              que,
              ...(varias ? { desglose: g.sede } : {}),
              unit,
              year: g.year,
              value,
              source: {
                kind: "libro",
                tabla,
                tabla_db: "ds_filas",
                ref: f.ref,
                ...(g.filas.length === 1 ? { fila: g.filas[0] } : { fila: `${g.filas.length} filas`, filas: g.filas }),
                ...(oficina ? { oficina } : {}),
                columna: etiquetaCol || mapa.valor,
                ...(periodos.length ? { periodo: cortar(periodos.join(", "), 120) } : g.year !== null ? { periodo: String(g.year) } : {}),
                indicador_id: String(r.data.indicador_id),
                indicador: nombre,
                ...(ii.data?.descripcion ? { definicion: cortar(String(ii.data.descripcion), 400) } : {}),
                ...(nota ? { nota } : {}),
                serie,
              },
              sumable: regla === "suma",
              ...(varias ? { grupo: `ds:${respId}`, parte: g.sede } : {}),
            });
          }
        } catch (e) {
          avisos.push(`«${f.label.slice(0, 60)}»: no se pudo leer (${mensajeDe(e).slice(0, 120)}).`);
        }
      }

      // UDES en Cifras: la cifra anual institucional de los últimos años.
      const od = de("cifras");
      if (od.length) {
        try {
          type Ind = { id: string; key: string; label: string; unit: string; format: FilaCifras["format"]; annual_rule: FilaCifras["annual_rule"]; aggregation: string; definition: string | null; office_id: string | null; od_reports: { name: string } | null };
          const ids = od.map((f) => f.ref.replace(/^od:/, ""));
          const inds: Ind[] = [];
          for (const trozo of enTrozos(ids)) {
            const r = await admin.from("od_indicators").select("id, key, label, unit, format, annual_rule, aggregation, definition, office_id, od_reports(name)").in("id", trozo);
            if (r.error) throw r.error;
            inds.push(...((r.data ?? []) as unknown as Ind[]));
          }
          // La oficina responsable (od_offices.name); si no se puede leer, la cifra sigue sin ella.
          const oficinasOd = new Map<string, string>();
          const idsOficina = [...new Set(inds.map((i) => i.office_id).filter((x): x is string => Boolean(x)))];
          if (idsOficina.length) {
            const r = await admin.from("od_offices").select("id, name").in("id", idsOficina);
            for (const o of (r.data ?? []) as { id: string; name: string }[]) oficinasOd.set(o.id, o.name);
          }
          const reglaTexto: Record<string, string> = { suma: "suma de los periodos del año", promedio: "promedio de los periodos del año", ultimo: "valor del último periodo del año" };
          const anios = Array.from({ length: ANIOS_SERIE }, (_, i) => anioDatos - ANIOS_SERIE + 1 + i);
          for (const trozo of enTrozos(inds.map((i) => i.id))) {
            const vals = await todas<{ id: string; indicator_id: string; year: number; term: "A" | "B" | "anual"; value: number | null }>((a, b) =>
              admin.from("od_values").select("id, indicator_id, year, term, value").in("indicator_id", trozo).in("year", anios).is("campus_id", null).order("id").range(a, b),
            );
            for (const i of inds.filter((x) => trozo.includes(x.id)))
              for (const y of anios) {
                const del = vals.filter((v) => v.indicator_id === i.id && v.year === y);
                if (!del.length) continue;
                const n = cifraAnual(del.map((v) => ({ term: v.term, value: v.value === null ? null : Number(v.value) })), i.annual_rule);
                const oficina = i.office_id ? oficinasOd.get(i.office_id) ?? "" : "";
                const terminos = [...new Set(del.map((v) => (v.term === "anual" ? "anual" : `${y}-${v.term}`)))].join(", ");
                crudas.push({
                  key: `od:${i.id}:${y}`,
                  serie: `od:${i.key}`,
                  label: i.label,
                  que: i.label,
                  desglose: "Toda la UDES",
                  unit: i.format === "porcentaje" ? "%" : i.unit,
                  year: y,
                  value: n,
                  source: {
                    kind: "cifras",
                    tabla: `UDES en Cifras${i.od_reports?.name ? ` · ${i.od_reports.name}` : ""}`,
                    tabla_db: "od_values",
                    ref: `od:${i.id}`,
                    ...(del.length === 1 ? { fila: del[0].id } : { fila: `${del.length} valores`, filas: del.map((v) => v.id) }),
                    ...(oficina ? { oficina } : {}),
                    periodo: terminos ? `${y} (${terminos})` : String(y),
                    indicador_id: i.key,
                    indicador: i.label,
                    ...(i.definition ? { definicion: cortar(i.definition, 400) } : {}),
                    nota: `regla anual: ${reglaTexto[String(i.annual_rule)] ?? i.annual_rule}`,
                    serie: `od:${i.key}`,
                  },
                  sumable: i.aggregation === "suma" && i.format !== "porcentaje",
                });
              }
          }
        } catch (e) {
          avisos.push(`UDES en Cifras: no se pudo leer (${mensajeDe(e).slice(0, 120)}).`);
        }
      }

      // Documentos: las cifras con cita literal del texto leído (las de más puntaje).
      for (const f of de("documento")) {
        try {
          const id = f.ref.replace(/^bib:/, "");
          const r = await admin.from("ranking_biblioteca").select("id, texto, anio_detectado").eq("id", id).maybeSingle();
          if (r.error) throw r.error;
          const lista = extraerCifras(String(r.data?.texto ?? ""))
            .filter((x) => x.num !== null && x.kind !== "otro")
            .sort((a, b) => b.score - a.score)
            .slice(0, CIFRAS_POR_DOCUMENTO);
          const anioDoc = r.data?.anio_detectado ?? null;
          for (const x of lista) {
            const k = `bib:${id}:${huella(`${x.value}|${x.quote}`)}`;
            crudas.push({
              key: k,
              serie: k,
              label: x.label || x.value,
              que: x.label || `Cifra del documento «${f.label.slice(0, 80)}»`,
              unit: x.kind === "porcentaje" ? "%" : x.unit,
              year: anioDoc,
              value: x.num,
              source: {
                kind: "documento",
                tabla: `Documento: ${f.label.slice(0, 160)}`,
                tabla_db: "ranking_biblioteca",
                ref: f.ref,
                fila: id,
                ...(x.quote ? { cita: x.quote } : {}),
                ...(anioDoc ? { periodo: `${anioDoc} (año detectado en el documento)` } : {}),
                serie: k,
              },
            });
          }
        } catch (e) {
          avisos.push(`«${f.label.slice(0, 60)}»: no se pudo leer el documento (${mensajeDe(e).slice(0, 120)}).`);
        }
      }

      const libro = armarLibro(crudas, { anioMin: edition - 12, anioMax: edition });
      avisos.push(...libro.avisos);
      // Lo que ya explicó una persona (siempre) o Pilo (si la cifra no cambió) no se pierde al rehacer el libro.
      const previas = await todas<{ key: string; label: string; label_en: string; value: number; year: number | null; source: SourceCifra | null }>((a, b) =>
        admin.from("pp_cifras").select("key, label, label_en, value, year, source").eq("informe_id", informeId).order("key").range(a, b),
      );
      const filas = conservarDescripciones([...libro.cifras, ...libro.derivadas], previas).map((x) => ({ informe_id: informeId, ...x, label: x.label.slice(0, 300), label_en: x.label_en.slice(0, 300) }));
      for (const lote of enGrupos(filas, 400)) {
        const w = await admin.from("pp_cifras").upsert(lote, { onConflict: "informe_id,key" });
        if (w.error) throw w.error;
      }
      // Las cifras que ya no salen de ninguna fuente incluida: se borran si ningún bloque las usa.
      const nuevas = new Set(filas.map((x) => x.key));
      const viejas = previas.map((x) => x.key).filter((k) => !nuevas.has(k));
      if (viejas.length) {
        const bloques = await cargarBloques(["kpi", "grafico", "texto"]);
        const enUso = new Set(bloques.flatMap((b) => [String(b.spec?.cifra ?? ""), ...((b.spec?.series as { cifra: string }[] | undefined) ?? []).map((s) => s.cifra), ...(b.figs ?? [])]));
        const borrar = viejas.filter((k) => !enUso.has(k));
        for (const trozo of enTrozos(borrar)) {
          const d = await admin.from("pp_cifras").delete().eq("informe_id", informeId).in("key", trozo);
          if (d.error) throw d.error;
        }
        const quedan = viejas.length - borrar.length;
        if (quedan) avisos.push(`${quedan} cifra(s) ya no salen de ninguna fuente incluida pero las usa un bloque: revísalas.`);
      }
      await bitacora({ cifras: libro.cifras.length, derivadas: libro.derivadas.length, avisos: avisos.length }, filas.length, 0, null);
      return json({ ok: true, cifras: libro.cifras.length, derivadas: libro.derivadas.length, avisos });
    } catch (e) {
      return alto(e);
    }
  }

  /* ===================================================================================
     imagenes: sin IA, de las noticias citadas
     =================================================================================== */
  if (accion === "imagenes") {
    try {
      const bloques = await cargarBloques();
      // Cada nota citada, con el primer bloque de texto (en orden) que la cita: la imagen lo acompaña.
      const ejeDe = new Map<string, string>();
      for (const b of bloques.filter((x) => x.kind === "texto" && x.enabled).sort((x, y) => x.pos - y.pos))
        for (const s of b.sources ?? []) {
          const id = s.news_id || (s.kind === "noticia" ? s.ref : "");
          if (id && !ejeDe.has(id)) ejeDe.set(id, b.id);
        }
      // Solo se AGREGAN bloques: nunca se borra ni se cambia una imagen existente (y menos una de una persona,
      // origin ≠ pilo, o una externa con spec.url y spec.externa). Una nota que ya tiene imagen no se repite.
      const yaTienen = new Set(bloques.filter((b) => b.kind === "imagen").map((b) => String(b.spec?.news_id ?? "")).filter(Boolean));
      const pendientes = [...ejeDe.keys()].filter((id) => !yaTienen.has(id));
      const omitidas: { news_id: string; motivo: string }[] = [];
      let pos = siguientePos(SECCIONES.imagen, bloques);
      const propuestas: PropuestaImagen[] = [];
      for (const trozo of enTrozos(pendientes)) {
        const [notas, imgs] = await Promise.all([
          admin.from("news_items").select("id, title, body").in("id", trozo),
          admin.from("news_images").select("id, news_id, url, width, caption, credit, pos, is_cover, kind, minors, alt").in("news_id", trozo),
        ]);
        if (notas.error) throw notas.error;
        if (imgs.error) throw imgs.error;
        type Img = { id: string; news_id: string; url: string; width: number | null; caption: string; credit: string; pos: number; is_cover: boolean; kind: string; minors: boolean; alt: string };
        const porNota = new Map<string, Img[]>();
        for (const i of (imgs.data ?? []) as Img[]) porNota.set(i.news_id, [...(porNota.get(i.news_id) ?? []), i]);
        for (const n of (notas.data ?? []) as { id: string; title: string; body: string }[]) {
          if (hablaDeMenores(n)) {
            omitidas.push({ news_id: n.id, motivo: "La nota habla de niñas, niños o adolescentes: no se usan sus imágenes." });
            continue;
          }
          const todasImg = porNota.get(n.id) ?? [];
          const libres = todasImg.filter((i) => !i.minors).sort((a, b) => Number(b.kind === "foto") - Number(a.kind === "foto") || Number(b.is_cover) - Number(a.is_cover) || a.pos - b.pos || (b.width ?? 0) - (a.width ?? 0));
          if (!libres.length) {
            omitidas.push({ news_id: n.id, motivo: todasImg.length ? "Sus imágenes están marcadas con menores." : "La nota no tiene imágenes." });
            continue;
          }
          const i = libres[0];
          const eje = ejeDe.get(n.id);
          const w = await admin.from("pp_bloques").insert({
            informe_id: informeId,
            kind: "imagen",
            sec: SECCIONES.imagen,
            pos: pos++,
            origin: "pilo",
            // Apagado: Pilo no ve la imagen; una persona la mira antes de publicarla.
            enabled: false,
            spec: { news_id: n.id, image_id: i.id, eje, url: i.url, crop: RECORTE_POR_DEFECTO, caption: i.caption || pieDeFoto(n), alt: i.alt || altDeFoto(n, i.kind === "grafica"), credit: i.credit },
            warn: AVISO_IMAGENES,
          }).select("id").single();
          if (w.error) throw w.error;
          propuestas.push({ news_id: n.id, image_id: i.id, block_id: w.data.id, url: i.url, eje });
        }
      }
      await bitacora({ propuestas: propuestas.length, omitidas: omitidas.length }, propuestas.length, omitidas.length, null);
      return json({ ok: true, propuestas, omitidas, aviso: `${AVISO_IMAGENES} Las imágenes se proponen apagadas.` });
    } catch (e) {
      return alto(e);
    }
  }

  // Lo que necesita la IA ------------------------------------------------------------------
  if (motivo) return fallo(motivo, "sin_ia", 503, { proveedor: destino.proveedor, modelo: destino.model });

  /* ===================================================================================
     describir: el estadístico explica qué es cada cifra (solo con su procedencia)
     =================================================================================== */
  if (accion === "describir") {
    let descritas = 0;
    const fallos: { key: string; motivo: string }[] = [];
    try {
      const libro = await cargarLibro();
      if (!libro.length) return fallo("El libro de cifras está vacío: primero arma el libro.", "sin_libro", 409);
      const ahora = Date.now();
      /** Con «rehacer», las descritas por Pilo hace menos de 15 minutos no se repiten (el cliente puede repetir hasta quedan = 0). */
      const reciente = (s: SourceCifra | null | undefined) => {
        const t = Date.parse(String(s?.descrito_at ?? ""));
        return Number.isFinite(t) && ahora - t < 15 * 60_000;
      };
      const falloReciente = (s: SourceCifra | null | undefined) => {
        const t = Date.parse(String(s?.describir_fallo?.at ?? ""));
        return Number.isFinite(t) && (!cuerpo.rehacer || ahora - t < 15 * 60_000);
      };
      const falta = (c: CifraLibro) => {
        const s = c.source ?? ({} as SourceCifra);
        if (s.descrito === "persona") return false;
        if (falloReciente(s)) return false;
        const incompleta = !s.descripcion || !s.descripcion_en || !c.label_en;
        if (s.descrito === "codigo") return incompleta;
        return incompleta || Boolean(cuerpo.rehacer && !reciente(s));
      };
      const porKey = new Map(libro.map((c) => [c.key, c]));
      const pendientes = () => libro.filter(falta);

      /** Lo único que el modelo ve de una cifra: su procedencia, su valor y su año. */
      const contextoDe = (c: CifraLibro): string => {
        const s = c.source ?? ({} as SourceCifra);
        const bases = (s.bases ?? []).map((k) => porKey.get(k)?.label).filter(Boolean) as string[];
        return [
          `Nombre actual: ${c.label}`,
          `Valor: ${formatoValor(Number(c.value), c.unit)}${c.unit && !["%", "pp"].includes(c.unit) ? ` ${c.unit}` : ""} · unidad: ${c.unit || "sin unidad"} · año: ${c.year ?? "sin año"}`,
          s.tabla ? `Tabla o informe: ${s.tabla}` : "",
          s.oficina ? `Oficina: ${s.oficina}` : "",
          s.columna ? `Columna o campo: ${s.columna}` : "",
          s.indicador || s.indicador_id ? `Indicador: ${[s.indicador_id, s.indicador].filter(Boolean).join(" — ")}` : "",
          s.definicion ? `Definición del indicador: ${cortar(s.definicion, 400)}` : "",
          s.desglose ? `Desglose: ${s.desglose}` : "",
          s.periodo ? `Periodo: ${s.periodo}` : "",
          s.nota ? `Cómo se obtuvo: ${s.nota}` : "",
          c.derived ? `Calculada por el sistema: ${c.formula || s.formula || ""}` : "",
          bases.length ? `Calculada a partir de: ${bases.slice(0, 4).join("; ")}` : "",
          s.cita ? `Cita de la fuente: «${cortar(s.cita, 300)}»` : "",
        ]
          .filter(Boolean)
          .join("\n");
      };

      const guardar = async (c: CifraLibro, d: Descripcion) => {
        const s = c.source ?? ({} as SourceCifra);
        const { describir_fallo: _f, ...resto } = s;
        // Las derivadas conservan lo que escribió el código en español; Pilo completa lo que falta.
        const deCodigo = s.descrito === "codigo";
        const cambios = deCodigo
          ? {
              label_en: c.label_en || d.label_en,
              source: { ...resto, descripcion: s.descripcion || d.descripcion_es, descripcion_en: s.descripcion_en || d.descripcion_en, descrito: "codigo" as const, descrito_at: new Date().toISOString() },
            }
          : {
              label: d.label_es.slice(0, 300),
              label_en: d.label_en.slice(0, 300),
              source: { ...resto, descripcion: d.descripcion_es, descripcion_en: d.descripcion_en, descrito: "pilo" as const, descrito_at: new Date().toISOString() },
            };
        // Nunca sobre lo que describió una persona mientras Pilo trabajaba.
        const w = await admin.from("pp_cifras").update(cambios).eq("informe_id", informeId).eq("key", c.key).or("source->>descrito.is.null,source->>descrito.neq.persona").select("key");
        if (w.error) throw w.error;
        if (w.data?.length) {
          Object.assign(c, cambios);
          descritas++;
        } else {
          fallos.push({ key: c.key, motivo: "Una persona la describió mientras Pilo trabajaba: no se tocó." });
          c.source = { ...s, descrito: "persona" };
        }
      };

      const marcarFallo = async (c: CifraLibro, m: string) => {
        fallos.push({ key: c.key, motivo: m });
        const source = { ...(c.source ?? {}), describir_fallo: { motivo: m.slice(0, 300), at: new Date().toISOString() } } as SourceCifra;
        const w = await admin.from("pp_cifras").update({ source }).eq("informe_id", informeId).eq("key", c.key).or("source->>descrito.is.null,source->>descrito.neq.persona");
        if (w.error) throw w.error;
        c.source = source;
      };

      for (let vuelta = 0; ; vuelta++) {
        if (vuelta > 0 && !hayTiempo()) break;
        const lote = pendientes().slice(0, 12);
        if (!lote.length) break;
        const items: ItemDescribir[] = lote.map((c) => {
          const contexto = contextoDe(c);
          return { key: c.key, contexto, permitidos: numerosPermitidos(contexto, c) };
        });
        const r = await llamarVerificado(mensajesDescribir(unidad, informe.ranking, items), 3000, (crudo) => leerDescripciones(crudo, items), RECORDATORIO.describir);
        if (!r.ok) {
          // Sin tiempo para el reintento: no se marca nada, la próxima llamada lo intenta de nuevo.
          if (/No hubo tiempo de reintentar/.test(r.error)) {
            fallos.push(...lote.map((c) => ({ key: c.key, motivo: `${r.error} Sigue en la fila.` })));
            break;
          }
          // El lote no se pudo leer ni tras el reintento: cada cifra queda marcada con el motivo (no se repite en bucle; «rehacer» la vuelve a intentar).
          for (const c of lote) await marcarFallo(c, r.error);
          continue;
        }
        for (const d of r.valor.buenas) await guardar(porKey.get(d.key)!, d);
        for (const m of r.valor.malas) await marcarFallo(porKey.get(m.key)!, m.motivo);
      }
      const quedan = pendientes().length;
      await bitacora({ descritas, fallos: fallos.length, quedan, motivos: fallos.map((f) => `${f.key}: ${f.motivo}`.slice(0, 220)).slice(0, 8) }, descritas, fallos.length, null);
      return json({ ok: true, descritas, fallos, quedan });
    } catch (e) {
      return alto(e, { descritas, fallos: fallos.length }, descritas, fallos.length);
    }
  }

  /* ===================================================================================
     analizar: el estadístico con IA
     =================================================================================== */
  if (accion === "analizar") {
    try {
      const libro = await cargarLibro();
      if (!libro.length) return fallo("El libro de cifras está vacío: primero arma el libro.", "sin_libro", 409);
      const bloques = await cargarBloques(["kpi", "grafico"]);
      const dePilo = bloques.filter((b) => b.origin === "pilo");
      if (dePilo.length && !cuerpo.rehacer) return fallo("Pilo ya propuso el tablero y los gráficos: usa «rehacer» para reemplazar los suyos.", "ya_hecho", 409);
      const usadas = new Set(bloques.filter((b) => b.origin !== "pilo" && b.kind === "kpi").map((b) => String(b.spec?.cifra ?? "")));
      const c = await ciclo().catch(() => null);
      const inds = await indicadores(c);
      // Primero las que responden a un indicador y las más recientes.
      const orden = [...libro].sort((a, b) => Number(Boolean(b.indicator)) - Number(Boolean(a.indicator)) || (b.year ?? 0) - (a.year ?? 0) || a.key.localeCompare(b.key));
      const r = await llamarVerificado(mensajesTablero(unidad, informe.ranking, inds, orden), 2400, (crudo) => leerTablero(crudo, libro, usadas));
      if (!r.ok) {
        await bitacora({ error: r.error }, 0, 1, r.error);
        return fallo(`Pilo no logró un tablero legible: ${r.error}`, "verificacion", 422);
      }
      const t = r.valor;
      // Menos de 3 gráficos válidos: el código completa con sugerencias deterministas (origen «codigo»), sin repetir
      // los de una persona ni los que ya propuso Pilo.
      const deOtros = bloques.filter((b) => b.origin !== "pilo" && b.kind === "grafico").map((b) => b.spec as unknown as SpecGrafico).filter((s) => Array.isArray(s?.series));
      const sugeridos = t.graficos.length < MIN_GRAFICOS ? sugerirGraficos(libro, [...deOtros, ...t.graficos], Math.min(MAX_GRAFICOS - t.graficos.length, MIN_GRAFICOS - t.graficos.length)) : [];
      t.graficos.push(...sugeridos);
      if (cuerpo.rehacer && dePilo.length) {
        const d = await admin.from("pp_bloques").delete().eq("informe_id", informeId).eq("origin", "pilo").in("kind", ["kpi", "grafico"]);
        if (d.error) throw d.error;
      }
      const quedan = bloques.filter((b) => b.origin !== "pilo");
      let posK = siguientePos(SECCIONES.kpi, quedan);
      let posG = siguientePos(SECCIONES.grafico, quedan);
      const filas = [
        ...t.kpis.map((k) => ({ informe_id: informeId, kind: "kpi", sec: SECCIONES.kpi, pos: posK++, origin: "pilo", enabled: true, spec: k, heading_es: "", heading_en: "", figs: [k.cifra] })),
        ...t.graficos.map((g) => ({ informe_id: informeId, kind: "grafico", sec: SECCIONES.grafico, pos: posG++, origin: "pilo", enabled: true, spec: g, heading_es: g.title_es, heading_en: g.title_en, figs: g.series.map((s) => s.cifra) })),
      ];
      const propuestos: GraficoPropuesto[] = [];
      if (filas.length) {
        const w = await admin.from("pp_bloques").insert(filas, { defaultToNull: false }).select("id, kind, spec");
        if (w.error) throw w.error;
        for (const b of (w.data ?? []) as { id: string; kind: string; spec: SpecGrafico }[])
          if (b.kind === "grafico") propuestos.push({ block_id: b.id, chart: b.spec.chart, title_es: b.spec.title_es, origen: b.spec.origen === "codigo" ? "codigo" : "pilo" });
      }
      await bitacora(
        { kpis: t.kpis.length, graficos: t.graficos.length, sugeridos: sugeridos.length, descartados: t.descartados.length, motivos: t.descartados.map((d) => d.motivo.slice(0, 220)).slice(0, 8) },
        filas.length,
        t.descartados.length,
        null,
      );
      return json({ ok: true, kpis: t.kpis.length, graficos: t.graficos.length, descartados: t.descartados, propuestos });
    } catch (e) {
      return alto(e);
    }
  }

  /* ===================================================================================
     redactar: el periodista
     =================================================================================== */
  if (accion === "redactar") {
    const sec = cuerpo.sec === "portada" ? "portada" : "ejes";
    let escritos = 0;
    const fallos: Fallo[] = [];
    const ids: string[] = [];
    try {
      const c = await ciclo().catch(() => null);
      const inds = await indicadores(c);
      const libro = await cargarLibro();
      const porKey = new Map(libro.map((x) => [x.key, x]));
      const fijos = [...(informe.ranking === "impact" ? [unidad.key] : []), String(edition), ...inds.map((i) => i.id)];
      const fuentes = await cargarFuentes(true);
      const bloques = await cargarBloques();
      const textos = () => bloques.filter((b) => b.kind === "texto");
      const citadas = () => new Set(textos().flatMap((b) => (b.sources ?? []).map((s) => s.ref)));

      /** Las noticias incluidas que ningún texto cita, con el motivo. */
      const sinUsar = (quedan: number): SinUsar[] => {
        const cit = citadas();
        return fuentes
          .filter((f) => f.kind === "noticia" && !cit.has(f.ref))
          .map((f) => ({ ref: f.ref, label: f.label, motivo: String((f.meta?.fallo as { motivo?: string } | undefined)?.motivo ?? (quedan ? "Aún no se redacta: sigue en la fila." : "No quedó citada en ningún texto.")) }));
      };

      if (sec === "portada") {
        if ((informe.title_es.trim() || informe.lead_es.trim()) && !cuerpo.rehacer) return fallo("La portada ya tiene título o entrada: usa «rehacer» para que Pilo la escriba de nuevo.", "ya_hecho", 409);
        // Los ejes encendidos y los borradores sin verificar de Pilo (apagados, con aviso): la portada se apoya en lo escrito.
        const base = bloques.filter((b) => b.kind === "texto" && b.text_es.trim() && (b.enabled || (b.origin === "pilo" && String(b.warn ?? "").startsWith("SIN VERIFICAR"))));
        if (!base.length) return fallo("Primero redacta los ejes: la portada se escribe a partir de ellos.", "sin_ejes", 409);
        const notas: NotaInforme[] = base.map((b) => ({ id: b.id, title: b.heading_es || "Bloque", body: b.text_es }));
        const usadas = new Set(bloques.flatMap((b) => [...(b.figs ?? []), String(b.spec?.cifra ?? "")]));
        const sub = libro.filter((x) => usadas.has(x.key));
        const r = await llamarVerificado<Portada>(mensajesPortada(unidad, informe.ranking, voz, notas, sub, edition), 1200, (crudo) => {
          const l = leerPortada(crudo);
          if (!l.ok) return l;
          const v = verificarPortada(l.valor, porKey, notas, fijos);
          return v.ok ? l : { ok: false, error: v.error ?? "No pasó la verificación." };
        });
        if (!r.ok) {
          fallos.push({ refs: ["portada"], motivo: r.error });
          await bitacora({ sec, escritos: 0, fallos: 1, motivos: [r.error.slice(0, 220)] }, 0, 1, r.error);
          return json({ ok: true, escritos: 0, quedan: 0, fallos, sin_usar: sinUsar(0) });
        }
        let q = admin.from("pp_informes").update({ title_es: r.valor.title_es, title_en: r.valor.title_en, lead_es: r.valor.lead_es, lead_en: r.valor.lead_en, updated_by: actor }).eq("id", informeId).neq("state", "publicado");
        if (!cuerpo.rehacer) q = q.eq("title_es", "").eq("lead_es", "");
        const w = await q.select("id");
        if (w.error) throw w.error;
        if (!w.data?.length) return fallo("Alguien cambió la portada o publicó el informe mientras Pilo escribía: no se guardó.", "de_persona", 409);
        await bitacora({ sec, escritos: 1 }, 1, 0, null);
        return json({ ok: true, escritos: 1, quedan: 0, fallos, sin_usar: sinUsar(0) });
      }

      // Ejes ---------------------------------------------------------------------------
      if (!fuentes.length) return fallo("No hay fuentes incluidas: primero junta las fuentes.", "sin_fuentes", 409);
      if (cuerpo.reintentar) {
        for (const f of fuentes.filter((x) => x.meta?.fallo)) {
          const { fallo: _f, ...resto } = f.meta ?? {};
          await admin.from("pp_fuentes").update({ meta: resto }).eq("id", f.id);
          f.meta = resto;
        }
      }

      // El texto de cada fuente (lo que se cita literalmente), leído en vivo.
      const textoDe = new Map<string, FuenteTexto>();
      const avisos: string[] = [];
      const notas = fuentes.filter((f) => f.kind === "noticia");
      for (const trozo of enTrozos(notas.map((n) => n.ref))) {
        const r = await admin.from("news_items").select("id, title, body, published_on, section, campus, url, state").in("id", trozo);
        if (r.error) throw r.error;
        for (const n of (r.data ?? []) as (NotaInforme & { state: string })[]) {
          if (n.state !== "ok") continue;
          textoDe.set(n.id, { ...n, body: n.body ?? "", kind: "noticia" });
        }
      }
      const theFuentes = fuentes.filter((f) => f.kind === "indicador" && f.ref.startsWith("the:"));
      if (theFuentes.length && c) {
        const { resp, texto } = await leerTHE(c, theFuentes.map((f) => f.ref.slice(4)));
        for (const r of resp) {
          const t = texto.get(r.indicador);
          const valores = Object.entries(r.valores ?? {})
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => `${texto.get(k)?.texto_es || k}: ${formatoValor(Number(v), "")}.`);
          const body = [`Indicador ${r.indicador} de THE Impact: ${t?.texto_es ?? ""}.`, r.si_no === null ? "" : `Respuesta de la oficina: ${r.si_no ? "sí" : "no"}.`, r.comentario_es ? `Comentario de la oficina: ${r.comentario_es}` : "", ...valores].filter(Boolean).join(" ");
          textoDe.set(`the:${r.id}`, { id: `the:${r.id}`, title: `Indicador ${r.indicador} (reporte de la oficina)`, body, kind: "indicador", section: "Reporte por oficinas" });
        }
      }
      const ugmFuentes = fuentes.filter((f) => f.kind === "indicador" && f.ref.startsWith("ugm:"));
      if (ugmFuentes.length && c) {
        const { resp, porQ } = await leerUGM(c, ugmFuentes.map((f) => f.ref.slice(4)));
        for (const r of resp) {
          const p = porQ.get(r.q);
          const textosEs = Object.values(r.textos_es ?? {}).filter((v): v is string => typeof v === "string" && v.trim().length > 0);
          const numeros = (p?.esquema?.campos ?? []).filter((x) => x.tipo === "numero" && typeof r.valores?.[x.k] === "number").map((x) => `${x.es ?? x.k}: ${formatoValor(Number(r.valores?.[x.k]), "")}${x.unidad ? ` ${x.unidad}` : ""}.`);
          const body = [`Pregunta ${r.q} de UI GreenMetric: ${p?.nombre_es ?? ""}.`, ...textosEs, ...numeros].join(" ");
          textoDe.set(`ugm:${r.id}`, { id: `ugm:${r.id}`, title: `Pregunta ${r.q} de UI GreenMetric`, body, kind: "indicador", section: "UI GreenMetric" });
        }
      }
      for (const f of fuentes.filter((x) => x.kind === "libro" || x.kind === "cifras")) {
        const propias = libro.filter((x) => !x.derived && x.source?.ref === f.ref).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
        if (!propias.length) continue;
        const body = `${f.label}. ${propias.map((x) => `${x.label}${x.year ? ` (${x.year})` : ""}: ${formatoValor(x.value, x.unit)}${x.unit && !["%", "pp"].includes(x.unit) ? ` ${x.unit}` : ""}.`).join(" ")}`;
        textoDe.set(f.ref, { id: f.ref, title: f.label, body, kind: f.kind, section: f.kind === "libro" ? "Datos de Sostenibilidad" : "UDES en Cifras" });
      }
      const docs = fuentes.filter((f) => f.kind === "documento");
      for (const trozo of enTrozos(docs.map((d) => d.ref.slice(4)))) {
        const r = await admin.from("ranking_biblioteca").select("id, nombre, texto, anio_detectado").in("id", trozo);
        if (r.error) throw r.error;
        for (const d of (r.data ?? []) as { id: string; nombre: string; texto: string; anio_detectado: number | null }[])
          if (d.texto?.trim()) textoDe.set(`bib:${d.id}`, { id: `bib:${d.id}`, title: d.nombre, body: d.texto, kind: "documento", section: "Biblioteca de evidencias", published_on: d.anio_detectado ? String(d.anio_detectado) : null });
      }
      // Lo que no se pudo leer queda como fallo visible, no en silencio.
      for (const f of fuentes) {
        if (textoDe.has(f.ref) || f.meta?.fallo) continue;
        const m = f.kind === "noticia" ? "La nota ya no está aprobada o no se pudo leer." : f.kind === "libro" || f.kind === "cifras" ? "No tiene cifras en el libro: arma el libro primero." : "No se pudo leer su texto.";
        f.meta = { ...(f.meta ?? {}), fallo: { motivo: m, at: new Date().toISOString() } };
        await admin.from("pp_fuentes").update({ meta: f.meta }).eq("id", f.id);
        avisos.push(`«${f.label.slice(0, 60)}»: ${m}`);
      }

      const pistaDe = (f: FilaFuente): string | null => {
        const propia = String(f.meta?.indicator ?? f.meta?.indicador ?? "").split("/")[0];
        if (propia && inds.some((i) => i.id === propia)) return propia;
        const t = textoDe.get(f.ref);
        return indicadorProbable(`${f.label} ${(t?.body ?? "").slice(0, 2000)}`, inds);
      };
      const pendientes: FuentePendiente[] = fuentes.filter((f) => textoDe.has(f.ref)).map((f) => ({ ref: f.ref, kind: f.kind, pista: pistaDe(f), fecha: fechaDe(f.meta) }));
      const fallidas = () => new Set(fuentes.filter((f) => f.meta?.fallo).map((f) => f.ref));

      /** El libro del grupo: las cifras de sus fuentes y las derivadas de ellas. */
      const libroDe = (grupo: string[]) => {
        const g = new Set(grupo);
        const propias = libro.filter((x) => !x.derived && g.has(String(x.source?.ref ?? "")));
        const llaves = new Set(propias.map((x) => x.key));
        // Las bases de una derivada: `source.bases` (o `source.fila` en libros armados antes).
        const basesDe = (x: CifraLibro): unknown[] => (Array.isArray(x.source?.bases) ? x.source.bases : Array.isArray((x.source as { fila?: unknown })?.fila) ? ((x.source as { fila?: unknown[] }).fila ?? []) : [x.source?.fila]);
        const derivadas = libro.filter((x) => x.derived && basesDe(x).some((k) => llaves.has(String(k))));
        return [...propias, ...derivadas];
      };

      // Profundidad: «profunda» por defecto (5 fuentes, 4–6 párrafos, UN eje por llamada); «normal» = 3 fuentes, 2–3 párrafos.
      const profundidad: Profundidad = cuerpo.profundidad === "normal" ? "normal" : "profunda";
      const porEje = formaEje(profundidad, 0).fuentes;
      const bloqueId = cuerpo.block_id ? String(cuerpo.block_id) : null;
      const profundizar = Boolean(bloqueId && cuerpo.profundizar);
      const cuantos = bloqueId || profundidad === "profunda" ? 1 : Math.max(1, Math.min(Math.max(2, destino.lote), Math.floor(Number(cuerpo.count) || 2)));
      for (let vuelta = 0; vuelta < cuantos; vuelta++) {
        if (vuelta > 0 && !hayTiempo()) break;
        let trabajo: { grupo: string[]; pista: string | null; pos: number } | null = null;
        let anterior: { heading_es: string; text_es: string } | null = null;
        let eraBorrador = false;
        if (bloqueId) {
          const b = bloques.find((x) => x.id === bloqueId && x.kind === "texto");
          if (!b) return fallo("No existe ese bloque de texto en el informe.", "informe", 404);
          if (b.origin !== "pilo") return fallo("Una persona escribió o editó este bloque: Pilo no lo reescribe.", "de_persona", 409);
          const propias = [...new Set((b.sources ?? []).map((s) => s.ref))].filter((r) => textoDe.has(r));
          if (!propias.length) return fallo("Las fuentes de este bloque ya no están incluidas o no se pueden leer.", "sin_fuentes", 409);
          const pista = String(b.spec?.indicator ?? "") || null;
          let grupo = propias;
          if (profundizar) {
            // Más fuentes del MISMO indicador que ningún eje cita aún: al menos 2 nuevas si las hay, sin pasar del tope.
            const cupo = Math.min(FUENTES_POR_EJE_MAX - propias.length, Math.max(2, porEje - propias.length));
            const nuevas = fuentesParaProfundizar(pendientes, citadas(), fallidas(), pista, cupo);
            grupo = [...propias, ...nuevas];
            if (!nuevas.length) avisos.push(`No quedan fuentes del indicador ${pista ?? "(sin indicador)"} sin citar: el eje se reescribió en profundidad con sus mismas fuentes.`);
            anterior = { heading_es: b.heading_es, text_es: b.text_es };
          }
          eraBorrador = !b.enabled && String(b.warn ?? "").startsWith("SIN VERIFICAR");
          trabajo = { grupo, pista, pos: b.pos };
        } else {
          const t = trabajosEje(pendientes, citadas(), fallidas(), porEje)[0];
          if (t) trabajo = { ...t, pos: siguientePos(SECCIONES.texto, bloques) };
        }
        if (!trabajo) break;
        const grupo = trabajo.grupo.map((r) => textoDe.get(r)!).filter(Boolean);
        const sub = libroDe(trabajo.grupo);
        // Profundizar siempre escribe en profundidad, aunque se pida «normal».
        const forma = formaEje(profundizar ? "profunda" : profundidad, grupo.length);
        // El último texto con buena forma, aunque no pase la verificación: si no pasa, queda como borrador apagado y marcado.
        const ultimo: { v: Eje | null } = { v: null };
        const r = await llamarVerificado<Eje>(
          mensajesEje(unidad, informe.ranking, voz, inds, grupo, sub, trabajo.pista, forma, anterior),
          forma.maxTokens,
          (crudo) => {
            const l = leerEje(crudo, grupo, inds, forma);
            if (!l.ok) return l;
            ultimo.v = l.valor;
            const v = verificarEje(l.valor, grupo, porKey, { exigir: trabajo!.grupo, fijos });
            if (!v.ok) return { ok: false, error: v.error ?? "No pasó la verificación." };
            return { ok: true, valor: { ...l.valor, warn: v.warn } };
          },
          RECORDATORIO.eje,
        );
        if (!r.ok) {
          fallos.push({ refs: trabajo.grupo, motivo: r.error });
          if (!bloqueId && ultimo.v) {
            // Borrador: NO se publica solo. Queda apagado y con el aviso «SIN VERIFICAR» y el motivo, para que una persona lo revise, lo corrija y lo encienda.
            const b = ultimo.v;
            const aviso = `SIN VERIFICAR: ${r.error}`.slice(0, 500);
            const spec = { indicator: b.indicator };
            const w = await admin
              .from("pp_bloques")
              .insert({ informe_id: informeId, kind: "texto", sec: SECCIONES.texto, pos: trabajo.pos, origin: "pilo", enabled: false, spec, heading_es: b.heading_es, heading_en: b.heading_en, text_es: b.text_es, text_en: b.text_en, orig_es: b.text_es, orig_en: b.text_en, sources: b.sources, figs: b.figs, warn: aviso })
              .select("id")
              .single();
            if (w.error) throw w.error;
            ids.push(w.data.id);
            bloques.push({ id: w.data.id, kind: "texto", sec: SECCIONES.texto, pos: trabajo.pos, origin: "pilo", enabled: false, spec, heading_es: b.heading_es, heading_en: b.heading_en, text_es: b.text_es, text_en: b.text_en, sources: b.sources, figs: b.figs, warn: aviso });
            escritos++;
            continue;
          }
          if (!bloqueId) {
            // No se descarta en silencio: la fuente queda marcada con el motivo, para una persona.
            for (const f of fuentes.filter((x) => trabajo!.grupo.includes(x.ref))) {
              f.meta = { ...(f.meta ?? {}), fallo: { motivo: r.error.slice(0, 300), at: new Date().toISOString() } };
              const w = await admin.from("pp_fuentes").update({ meta: f.meta }).eq("id", f.id);
              if (w.error) throw w.error;
            }
          }
          continue;
        }
        const e = r.valor;
        const datos = { spec: { indicator: e.indicator }, heading_es: e.heading_es, heading_en: e.heading_en, text_es: e.text_es, text_en: e.text_en, orig_es: e.text_es, orig_en: e.text_en, sources: e.sources, figs: e.figs, warn: e.warn };
        if (bloqueId) {
          // Un borrador «SIN VERIFICAR» que ahora pasa la verificación se enciende como cualquier eje verificado de Pilo.
          const w = await admin
            .from("pp_bloques")
            .update({ ...datos, ...(eraBorrador ? { enabled: true } : {}) })
            .eq("id", bloqueId)
            .eq("origin", "pilo")
            .select("id");
          if (w.error) throw w.error;
          if (!w.data?.length) {
            await bitacora({ sec, escritos }, escritos, 1, "Una persona cambió el bloque mientras Pilo escribía.");
            return fallo("Una persona cambió el bloque mientras Pilo escribía: no se reescribió.", "de_persona", 409);
          }
          const b = bloques.find((x) => x.id === bloqueId)!;
          Object.assign(b, { sources: e.sources, figs: e.figs, text_es: e.text_es, warn: e.warn, ...(eraBorrador ? { enabled: true } : {}) });
          ids.push(bloqueId);
        } else {
          const w = await admin
            .from("pp_bloques")
            .insert({ informe_id: informeId, kind: "texto", sec: SECCIONES.texto, pos: trabajo.pos, origin: "pilo", enabled: true, ...datos })
            .select("id")
            .single();
          if (w.error) throw w.error;
          ids.push(w.data.id);
          bloques.push({ id: w.data.id, kind: "texto", sec: SECCIONES.texto, pos: trabajo.pos, origin: "pilo", enabled: true, spec: datos.spec, heading_es: e.heading_es, heading_en: e.heading_en, text_es: e.text_es, text_en: e.text_en, sources: e.sources, figs: e.figs });
        }
        escritos++;
      }
      const quedan = trabajosEje(pendientes, citadas(), fallidas(), porEje).length;
      await bitacora({ sec, profundidad, ...(profundizar ? { profundizar: true } : {}), escritos, fallos: fallos.length, quedan, motivos: fallos.map((f) => f.motivo.slice(0, 220)).slice(0, 6) }, escritos, fallos.length, null);
      return json({ ok: true, escritos, quedan, fallos, sin_usar: sinUsar(quedan), bloques: ids, ...(avisos.length ? { avisos } : {}) });
    } catch (e) {
      return alto(e, { sec, escritos }, escritos, fallos.length);
    }
  }

  /* ===================================================================================
     traducir: completa el idioma que falte, sin cambiar el otro
     =================================================================================== */
  if (accion === "traducir") {
    let hechos = 0;
    const fallos: { ref: string; error: string }[] = [];
    try {
      type Destino = { tabla: "informe" | "bloque" | "grafico"; id: string; campo: string; origin?: string; spec?: Record<string, unknown> };
      const trabajos: { hacia: "en" | "es"; texto: string; destino: Destino }[] = [];
      const par = (es: string, en: string, destinoEs: Destino, destinoEn: Destino) => {
        if (es.trim() && !en.trim()) trabajos.push({ hacia: "en", texto: es, destino: destinoEn });
        else if (en.trim() && !es.trim()) trabajos.push({ hacia: "es", texto: en, destino: destinoEs });
      };
      par(informe.title_es, informe.title_en, { tabla: "informe", id: informeId, campo: "title_es" }, { tabla: "informe", id: informeId, campo: "title_en" });
      par(informe.lead_es, informe.lead_en, { tabla: "informe", id: informeId, campo: "lead_es" }, { tabla: "informe", id: informeId, campo: "lead_en" });
      const bloques = await cargarBloques(["texto", "grafico"]);
      for (const b of bloques) {
        if (b.kind === "texto") {
          par(b.heading_es, b.heading_en, { tabla: "bloque", id: b.id, campo: "heading_es", origin: b.origin }, { tabla: "bloque", id: b.id, campo: "heading_en", origin: b.origin });
          par(b.text_es, b.text_en, { tabla: "bloque", id: b.id, campo: "text_es", origin: b.origin }, { tabla: "bloque", id: b.id, campo: "text_en", origin: b.origin });
        } else {
          const s = b.spec ?? {};
          par(String(s.title_es ?? ""), String(s.title_en ?? ""), { tabla: "grafico", id: b.id, campo: "title_es" }, { tabla: "grafico", id: b.id, campo: "title_en" });
        }
      }
      // Lotes por tamaño: hasta 6 textos y ~4.500 caracteres (un eje largo puede ir solo), para no pasarse de tiempo ni de tokens.
      const lotesDe = (lista: typeof trabajos) => {
        const out: (typeof trabajos)[] = [];
        let actual: typeof trabajos = [];
        let chars = 0;
        for (const t of lista) {
          if (actual.length && (actual.length >= 6 || chars + t.texto.length > 4500)) {
            out.push(actual);
            actual = [];
            chars = 0;
          }
          actual.push(t);
          chars += t.texto.length;
        }
        if (actual.length) out.push(actual);
        return out;
      };
      let intentados = 0;
      for (const hacia of ["en", "es"] as const) {
        for (const lote of lotesDe(trabajos.filter((t) => t.hacia === hacia))) {
          if (!hayTiempo()) break;
          intentados += lote.length;
          const items: ItemTraduccion[] = lote.map((t, i) => ({ ref: `T${i + 1}`, texto: t.texto }));
          const chars = lote.reduce((s, t) => s + t.texto.length, 0);
          const tokens = Math.min(3800, Math.max(1200, Math.ceil(chars / 2.5) + 400));
          const r = await llamarVerificado(mensajesTraducirPP(items, hacia), tokens, (c) => leerTraduccionesPP(c, items, hacia));
          if (!r.ok) {
            fallos.push(...lote.map((t) => ({ ref: `${t.destino.tabla}:${t.destino.id}:${t.destino.campo}`, error: r.error })));
            continue;
          }
          for (const m of r.valor.malas) {
            const t = lote[Number(m.ref.slice(1)) - 1];
            fallos.push({ ref: `${t.destino.tabla}:${t.destino.id}:${t.destino.campo}`, error: m.error });
          }
          for (const b of r.valor.buenas) {
            const t = lote[Number(b.ref.slice(1)) - 1];
            const d = t.destino;
            if (d.tabla === "informe") {
              const w = await admin.from("pp_informes").update({ [d.campo]: b.texto }).eq("id", d.id).eq(d.campo, "").neq("state", "publicado");
              if (w.error) throw w.error;
            } else if (d.tabla === "bloque") {
              // En un bloque de Pilo también se guarda el original; el de una persona solo se completa.
              const orig = d.origin === "pilo" && (d.campo === "text_es" || d.campo === "text_en") ? { [d.campo === "text_es" ? "orig_es" : "orig_en"]: b.texto } : {};
              const w = await admin.from("pp_bloques").update({ [d.campo]: b.texto, ...orig }).eq("id", d.id).eq(d.campo, "");
              if (w.error) throw w.error;
            } else {
              const actual = await admin.from("pp_bloques").select("spec").eq("id", d.id).maybeSingle();
              if (actual.error) throw actual.error;
              const spec = (actual.data?.spec ?? {}) as Record<string, unknown>;
              if (String(spec[d.campo] ?? "").trim()) continue;
              const w = await admin.from("pp_bloques").update({ spec: { ...spec, [d.campo]: b.texto }, [d.campo === "title_es" ? "heading_es" : "heading_en"]: b.texto }).eq("id", d.id);
              if (w.error) throw w.error;
            }
            hechos++;
          }
        }
      }
      const quedan = Math.max(0, trabajos.length - intentados);
      await bitacora({ hechos, fallos: fallos.length, quedan }, hechos, fallos.length, null);
      return json({ ok: true, hechos, fallos, quedan });
    } catch (e) {
      return alto(e, { hechos }, hechos, fallos.length);
    }
  }

  return fallo("Acción desconocida.", "accion", 400);
});
