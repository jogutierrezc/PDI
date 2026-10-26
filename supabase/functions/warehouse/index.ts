/* =============================================================================
   Edge Function · warehouse

   Pide a Master, Galileo y Davinci los reportes del Warehouse UDES
   (migraciones 0155 y 0156) y los guarda por periodo. Las tres plataformas
   viven en el servidor de cada sede (puerto 81), piden sesión y entregan los
   reportes como Excel en base64 (hasta unos 4 MB): por eso lo hace el
   servidor, con una cuenta de servicio, y no el navegador de cada persona.
   Cómo se pide cada reporte está en reportes.ts, sacado de los HAR.

     estado {}                                   → { ok, configurado, sedes, reportes }
     probar { sede }                             → { ok, periodo }
         inicia sesión en las tres plataformas, lee el periodo abierto y comprueba
         (en Master) que el servidor responde como la sede pedida.
     periodos { sede }                           → { ok, periodos, actual, aspirantes, deserciones }
         las listas de periodos de Master de esa sede (get_periods,
         periods_applicants, periods_to_student_desertion_report).
     sondear { conjunto, sede, periodo?, corte? } → { ok, periodo, columnas, filas, … }
         pide el reporte y devuelve SOLO los nombres de sus columnas y cuántas
         filas trae: no guarda nada y no muestra ninguna fila. Sirve para
         escribir la política de privacidad de un reporte nuevo y para ver si el
         reporte de una sede tiene la misma forma que el de Bucaramanga (columnas
         que la política espera y faltan, periodo que dice el archivo, avisos).
     cargar { conjunto, sede, periodo?, corte?, motivo? }
                                                 → { ok, periodo, version, filas, duplicada, confirmado }

   Reglas:
     · Solo con sesión, y solo Planeación o más (wh_autorizado). Las escrituras
       van a la base con la sesión de quien llama, por wh_abrir_carga /
       wh_agregar_filas / wh_cerrar_carga: la política de privacidad la aplica
       la base, no esta función. Un reporte sin política no se guarda.
     · El periodo lo elige quien llama solo si la plataforma lo deja pedir
       (va en la ruta, en ?selected_period o en el cuerpo). Si lo fija la sesión
       (horarios, posgrado…), es el periodo abierto que informa la plataforma:
       pedir otro falla en vez de guardarse con el periodo equivocado.
     · Lo que la plataforma devuelve se compara con lo pedido: el título del
       Excel, el nombre de la tarea o la última columna del histórico dicen de
       qué periodo es. Si no coincide, no se guarda nada. Si el reporte no lo
       dice, un periodo distinto del abierto solo se acepta cuando está probado
       (rendimiento) o se marca «sin confirmar» (consulta); en el cuerpo se rechaza.
     · Cada sede va a su servidor, con su propio inicio de sesión; las claves de
       la base incluyen la sede, así que una carga de una sede nunca reemplaza
       ni se confunde con la de otra.
     · Ni la contraseña ni el token salen de aquí ni van a los registros: esta
       función no usa `console`.
     · El contenido se huella (no el archivo): dos descargas iguales no cuentan
       como dos versiones.

   Variables de entorno:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (las pone la plataforma)
     WAREHOUSE_MASTER_USER, WAREHOUSE_MASTER_PASSWORD   la cuenta de servicio (la misma entra a las tres)
     WAREHOUSE_MASTER_URL_BUC / _CUC / _VAL / _BOG      opcionales; por defecto
                  https://master-{sede}.udes.edu.co:81
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { FILAS_POR_LOTE, aplanarJson, derivarColumnas, base64ABytes, enLotes, enParalelo, esExcelBase64, huellaContenido, leerSegun, periodoDelArchivo, periodosEnTexto, periodoValido, ultimoPeriodoDe, type Hoja } from "./motor.ts";
import { consultaDe, edificiosDe, estadoTarea, periodosDeLista, REPORTES, reportePorId, sedeDeNombre, type Contexto, type Peticion, type Reporte, type SistemaApi } from "./reportes.ts";

const ENV = (name: string) => Deno.env.get(name) ?? "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SEDES: Record<string, { variable: string; porDefecto: string; nombre: string }> = {
  buc: { variable: "WAREHOUSE_MASTER_URL_BUC", porDefecto: "https://master-buc.udes.edu.co:81", nombre: "Bucaramanga" },
  cuc: { variable: "WAREHOUSE_MASTER_URL_CUC", porDefecto: "https://master-cuc.udes.edu.co:81", nombre: "Cúcuta" },
  val: { variable: "WAREHOUSE_MASTER_URL_VAL", porDefecto: "https://master-val.udes.edu.co:81", nombre: "Valledupar" },
  bog: { variable: "WAREHOUSE_MASTER_URL_BOG", porDefecto: "https://master-bog.udes.edu.co:81", nombre: "Bogotá" },
};
const CORTES = ["1", "2", "3", "f"];
const SISTEMAS: SistemaApi[] = ["master", "galileo", "davinci"];
const TIEMPO_MS = 120_000;
/** Una tarea larga (el reporte financiero de Davinci tarda minutos) se espera hasta este tope. */
const ESPERA_TAREA_MS = 8 * 60_000;
const PAUSA_TAREA_MS = 2_000;
const PERMANENTE = "permanente";

class ErrorPlataforma extends Error {}

const baseDe = (sede: string) => (ENV(SEDES[sede].variable) || SEDES[sede].porDefecto).replace(/\/+$/, "");
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sesion {
  base: string;
  sistema: SistemaApi;
  token: string;
  apiKey: string;
  /** El periodo abierto que informa esta plataforma. */
  periodo: string;
}

async function pedirJson(base: string, p: Peticion, sesion?: { token: string; apiKey: string }) {
  const q = sesion ? consultaDe(sesion.token, sesion.apiKey, p.consulta) : p.consulta ? new URLSearchParams(p.consulta).toString() : "";
  const url = `${base}${p.ruta}${q ? `?${q}` : ""}`;
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: p.metodo,
      headers: p.cuerpo ? { "Content-Type": "application/json;charset=UTF-8" } : undefined,
      body: p.cuerpo ? JSON.stringify(p.cuerpo) : undefined,
      signal: AbortSignal.timeout(TIEMPO_MS),
    });
  } catch {
    throw new ErrorPlataforma("No se pudo conectar con la plataforma. Revise que el servidor de la función llegue a la red de la universidad.");
  }
  if (respuesta.status === 404) throw new ErrorPlataforma("La plataforma respondió 404: esa ruta no existe en esa plataforma o en esa sede (¿el reporte cambió de lugar?).");
  if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorPlataforma(`La plataforma respondió ${respuesta.status}: la sesión caducó o la cuenta de servicio no tiene permiso para este reporte.`);
  if (!respuesta.ok) throw new ErrorPlataforma(`La plataforma respondió ${respuesta.status}.`);
  try {
    return (await respuesta.json()) as { msg?: unknown; code?: number; task_id?: string };
  } catch {
    throw new ErrorPlataforma("La plataforma devolvió algo que no es JSON.");
  }
}

/** Inicia sesión en una plataforma (cada una tiene la suya) y lee su periodo abierto. */
async function iniciarSesion(sede: string, sistema: SistemaApi): Promise<Sesion> {
  const usuario = ENV("WAREHOUSE_MASTER_USER");
  const clave = ENV("WAREHOUSE_MASTER_PASSWORD");
  if (!usuario || !clave) throw new ErrorPlataforma("Falta la cuenta de servicio (WAREHOUSE_MASTER_USER y WAREHOUSE_MASTER_PASSWORD).");
  const base = baseDe(sede);
  const r = await pedirJson(base, { metodo: "POST", ruta: `/${sistema}/mod_auth/login/`, cuerpo: { login: usuario, password: clave } });
  const msg = r.msg as { access_token?: string; api_key?: string } | string | undefined;
  if (r.code !== 200 || !msg || typeof msg === "string" || !msg.access_token) throw new ErrorPlataforma(`${sistema}: no aceptó la cuenta de servicio.`);
  const sesion = { token: msg.access_token, apiKey: msg.api_key ?? "0" };
  const p = await pedirJson(base, { metodo: "GET", ruta: `/${sistema}/mod_auth/current_period/` }, sesion);
  const periodo = (p.msg as { period?: string } | undefined)?.period ?? "";
  if (!periodoValido(periodo)) throw new ErrorPlataforma(`${sistema}: no informó el periodo abierto.`);
  if (sistema === "master") {
    // Master dice a qué sede pertenece: si el servidor configurado para una sede responde como otra, se detiene aquí.
    let real: string | null = null;
    try {
      const h = await pedirJson(base, { metodo: "GET", ruta: "/master/mod_auth/headquarter/" }, sesion);
      real = sedeDeNombre((h.msg as { name?: unknown } | undefined)?.name);
    } catch {
      // Sin respuesta de la sede: no es motivo para detener la carga.
    }
    if (real && real !== sede) {
      throw new ErrorPlataforma(`El servidor configurado para ${SEDES[sede].nombre} responde como ${SEDES[real].nombre}. Revise WAREHOUSE_MASTER_URL_${sede.toUpperCase()}.`);
    }
  }
  return { base, sistema, ...sesion, periodo };
}

async function cerrarSesion(s: Sesion) {
  try {
    await pedirJson(s.base, { metodo: "GET", ruta: `/${s.sistema}/mod_auth/logout/` }, s);
  } catch {
    // Cerrar la sesión es cortesía: si falla, la sesión caduca sola.
  }
}

/** Un archivo Excel pedido: llega en `msg` (base64) o, si es una tarea, al terminarla (con el nombre que la plataforma le dio). */
async function descargarExcel(s: Sesion, p: Peticion, entrega: Reporte["entrega"]): Promise<{ archivos: Record<string, Uint8Array>; nombre?: string }> {
  const r = await pedirJson(s.base, p, s);
  let base64: string | undefined;
  let nombre: string | undefined;
  if (entrega === "tarea" || (!esExcelBase64(r.msg) && r.task_id)) {
    if (!r.task_id) throw new ErrorPlataforma("La plataforma no inició la tarea del reporte.");
    const limite = Date.now() + ESPERA_TAREA_MS;
    while (Date.now() < limite) {
      await dormir(PAUSA_TAREA_MS);
      const e = estadoTarea(await pedirJson(s.base, { metodo: "GET", ruta: `/${s.sistema}/mod_home/home/task_state/${encodeURIComponent(r.task_id)}/` }, s));
      nombre = e.nombre ?? nombre;
      if (e.fallo) throw new ErrorPlataforma("La plataforma no pudo generar el reporte.");
      if (e.listo) {
        base64 = e.base64;
        break;
      }
    }
    if (!base64) throw new ErrorPlataforma("El reporte tardó más de lo esperado en generarse. Intente de nuevo en unos minutos.");
  } else if (r.code === 200 && esExcelBase64(r.msg)) {
    base64 = r.msg;
  }
  if (!base64) {
    throw new ErrorPlataforma(typeof r.msg === "string" && r.msg.length < 200 ? `La plataforma: ${r.msg}` : "La plataforma no devolvió el reporte (¿aún no hay datos?).");
  }
  try {
    return { archivos: unzipSync(base64ABytes(base64)), nombre };
  } catch {
    throw new ErrorPlataforma("La plataforma devolvió un archivo que no es un Excel.");
  }
}

/** Junta varias hojas con las mismas columnas (departamentos de pregrado y posgrado; un edificio por pedido). */
function juntar(partes: { rotulo: string; hoja: Hoja }[], columna: string): Hoja {
  const columnas = [columna];
  const originales = [columna];
  for (const { hoja } of partes) hoja.columnas.forEach((c, i) => !columnas.includes(c) && (columnas.push(c), originales.push(hoja.originales[i] ?? c)));
  const filas = partes.flatMap(({ rotulo, hoja }) => hoja.filas.map((f) => ({ [columna]: rotulo, ...f })));
  return { columnas, originales, filas };
}

/** De qué periodo dice ser lo que entregó la plataforma, según donde el reporte lo deja leer (ver `Reporte.confirma`). */
function periodoHallado(r: Reporte, archivos: Record<string, Uint8Array>, nombreTarea: string | undefined, hoja: Hoja): string | null {
  if (r.confirma === "columnas") return ultimoPeriodoDe(hoja);
  if (r.confirma === "tarea") {
    const enNombre = periodosEnTexto(nombreTarea ?? "");
    return enNombre.length === 1 ? enNombre[0] : periodoDelArchivo(archivos);
  }
  if (r.confirma === "archivo") return periodoDelArchivo(archivos);
  return null;
}

/** Pide un reporte y lo deja como tabla; `periodoArchivo` trae el periodo que la plataforma dice haber entregado, si lo dice. */
async function obtenerHoja(r: Reporte, ctx: Contexto, s: Sesion): Promise<Hoja> {
  if (r.entrega === "json") {
    const primero = await pedirJson(s.base, r.armar(ctx), s);
    if (primero.code !== undefined && primero.code !== 200) throw new ErrorPlataforma("La plataforma no entregó la lista.");
    if (!r.extra) return aplanarJson(primero.msg);
    const partes = [{ rotulo: "pregrado", hoja: aplanarJson(primero.msg) }];
    for (const [i, otro] of r.extra.entries()) partes.push({ rotulo: i === 0 ? "posgrado" : `otro${i + 1}`, hoja: aplanarJson((await pedirJson(s.base, otro(ctx), s)).msg) });
    return juntar(partes, "origen");
  }
  if (r.porEdificio) {
    const lista = edificiosDe((await pedirJson(s.base, { metodo: "GET", ruta: "/master/mod_reports/reports/buildings/" }, s)).msg);
    if (lista.length === 0) throw new ErrorPlataforma("No se pudo leer la lista de edificios.");
    const partes: { rotulo: string; hoja: Hoja }[] = [];
    for (const e of lista) {
      try {
        const hoja = leerSegun(r.lector, (await descargarExcel(s, r.armar({ ...ctx, edificio: e }), r.entrega)).archivos);
        if (hoja.filas.length) partes.push({ rotulo: e.name, hoja });
      } catch {
        // Un edificio sin horarios responde vacío o con error: se salta.
      }
    }
    if (partes.length === 0) throw new ErrorPlataforma("Ningún edificio devolvió horarios.");
    return juntar(partes, "edificio");
  }
  const { archivos, nombre } = await descargarExcel(s, r.armar(ctx), r.entrega);
  let hoja: Hoja;
  try {
    hoja = leerSegun(r.lector, archivos);
  } catch (e) {
    throw new ErrorPlataforma(`El reporte llegó con otra forma de la esperada (¿cambió en esta sede?): ${e instanceof Error ? e.message : "no se pudo leer"}`);
  }
  hoja.periodoArchivo = periodoHallado(r, archivos, nombre, hoja);
  return hoja;
}

/** Una lista de periodos de Master de la sede (aspirantes o deserciones); null si no se pudo leer (no es motivo para detener la carga). */
async function listaDePeriodos(sede: string, clave: NonNullable<Reporte["listaPeriodos"]>, abierta?: Sesion): Promise<string[] | null> {
  let propia: Sesion | null = null;
  try {
    const s = abierta?.sistema === "master" ? abierta : (propia = await iniciarSesion(sede, "master"));
    const ruta = clave === "aspirantes" ? "/master/mod_reports/reports/periods_applicants/" : "/master/mod_reports/reports/periods_to_student_desertion_report/";
    const lista = periodosDeLista((await pedirJson(s.base, { metodo: "GET", ruta }, s)).msg).periodos;
    return lista.length ? lista : null;
  } catch {
    return null;
  } finally {
    if (propia) await cerrarSesion(propia);
  }
}

/** Lo que la política de privacidad espera del reporte frente a lo que la sede entregó (solo nombres de columnas). */
// deno-lint-ignore no-explicit-any
async function revisarPolitica(db: any, conjunto: string, hoja: Hoja) {
  const { data } = await db.from("wh_politicas").select("modo,lista").eq("conjunto", conjunto).maybeSingle();
  const pol = data as { modo: "permitir" | "excluir"; lista: string[] } | null;
  if (!pol) return { sinPolitica: true, faltan: [] as string[], descartadas: [] as string[], otroReporte: false };
  if (pol.modo === "excluir") return { sinPolitica: false, faltan: [] as string[], descartadas: hoja.columnas.filter((c) => pol.lista.includes(c)), otroReporte: false };
  const conserva = hoja.columnas.filter((c) => pol.lista.includes(c));
  return {
    sinPolitica: false,
    faltan: pol.lista.filter((c) => !hoja.columnas.includes(c)),
    descartadas: hoja.columnas.filter((c) => !pol.lista.includes(c)),
    // Un archivo que no trae casi ninguna de las columnas que la política conserva es otro reporte (o el de otra sede con otra forma).
    otroReporte: conserva.length < Math.min(3, pol.lista.length),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = ENV("SUPABASE_URL");
  const anonKey = ENV("SUPABASE_ANON_KEY");
  const serviceKey = ENV("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "La función no está configurada." }, 500);

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = JSON.parse((await request.text()) || "{}");
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const accion = String(cuerpo.action ?? "");
  if (!["estado", "probar", "periodos", "sondear", "cargar"].includes(accion)) return json({ error: "Acción desconocida." }, 400);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const quien = await admin.auth.getUser(authorization.slice(7));
  if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);

  // Todo lo que se escribe va con la sesión de quien llama: la base decide.
  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const permiso = await db.rpc("wh_autorizado");
  if (permiso.error) {
    const falta = permiso.error.code === "PGRST202" || /wh_autorizado/.test(permiso.error.message);
    return json({ error: falta ? "Falta aplicar la migración 0155 (Warehouse UDES)." : permiso.error.message, code: falta ? "migracion" : undefined }, 500);
  }
  if (permiso.data !== true) return json({ error: "Solo Planeación puede usar el Warehouse." }, 403);

  if (accion === "estado") {
    const credenciales = Boolean(ENV("WAREHOUSE_MASTER_USER") && ENV("WAREHOUSE_MASTER_PASSWORD"));
    return json({
      ok: true,
      configurado: credenciales,
      sedes: Object.keys(SEDES).map((id) => ({ id, nombre: SEDES[id].nombre, configurada: credenciales })),
      reportes: REPORTES.map((r) => ({ id: r.id, sistema: r.sistema, verificado: r.verificado, periodoVia: r.periodoVia, confirma: r.confirma ?? null })),
    });
  }

  const sede = String(cuerpo.sede ?? "");
  if (!SEDES[sede]) return json({ error: "Sede desconocida." }, 400);

  if (accion === "probar") {
    const periodos: Record<string, string> = {};
    try {
      for (const sistema of SISTEMAS) {
        const s = await iniciarSesion(sede, sistema);
        periodos[sistema] = s.periodo;
        await cerrarSesion(s);
      }
      return json({ ok: true, periodo: periodos.master, periodos });
    } catch (e) {
      return json({ ok: false, error: e instanceof ErrorPlataforma ? e.message : "No se pudo probar la conexión.", periodos }, 502);
    }
  }

  if (accion === "periodos") {
    // Las listas de periodos de Master de esta sede: de ahí sale lo que la pantalla ofrece pedir.
    let s: Sesion | null = null;
    try {
      s = await iniciarSesion(sede, "master");
      const leer = async (ruta: string) => {
        try {
          return periodosDeLista((await pedirJson(s!.base, { metodo: "GET", ruta }, s!)).msg);
        } catch {
          return { periodos: [] as string[], actual: null };
        }
      };
      const todos = await leer("/master/mod_reports/reports/get_periods/");
      if (todos.periodos.length === 0) throw new ErrorPlataforma("La plataforma no entregó la lista de periodos.");
      const aspirantes = await leer("/master/mod_reports/reports/periods_applicants/");
      const deserciones = await leer("/master/mod_reports/reports/periods_to_student_desertion_report/");
      return json({ ok: true, periodos: todos.periodos, actual: todos.actual ?? s.periodo, abierto: s.periodo, aspirantes: aspirantes.periodos, deserciones: deserciones.periodos });
    } catch (e) {
      return json({ ok: false, error: e instanceof ErrorPlataforma ? e.message : "No se pudo leer la lista de periodos." }, 502);
    } finally {
      if (s) await cerrarSesion(s);
    }
  }

  // sondear · cargar -------------------------------------------------------------------
  const conjunto = String(cuerpo.conjunto ?? "");
  const reporte = reportePorId(conjunto);
  if (!reporte) return json({ error: "Este conjunto aún no se pide solo: cárguelo con el Excel descargado." }, 400);
  const corte = String(cuerpo.corte ?? "");
  if (reporte.corte && !CORTES.includes(corte)) return json({ error: "Falta el corte (1, 2, 3 o f)." }, 400);
  const pedido = String(cuerpo.periodo ?? "");
  if (["ruta", "consulta", "cuerpo"].includes(reporte.periodoVia) && !periodoValido(pedido)) return json({ error: "Falta el periodo (por ejemplo 2026b)." }, 400);
  const motivo = String(cuerpo.motivo ?? "").slice(0, 300);

  let sesion: Sesion | null = null;
  try {
    sesion = await iniciarSesion(sede, reporte.sistema);
    const abierto = sesion.periodo;
    // Qué periodo se guarda: el pedido si la plataforma deja pedirlo; el abierto si lo fija la sesión (y entonces pedir
    // otro falla: guardar el abierto con la etiqueta de otro periodo sería mentir); «permanente» en los catálogos.
    if (reporte.periodoVia === "sesion" && periodoValido(pedido) && pedido !== abierto) {
      throw new ErrorPlataforma(`Periodo distinto del pedido: este reporte solo se puede traer del periodo abierto (${abierto}), no de ${pedido}. Cambie el periodo o cárguelo con el Excel del periodo que necesita.`);
    }
    const periodo = reporte.periodoVia === "ninguno" ? PERMANENTE : reporte.periodoVia === "sesion" ? abierto : pedido;
    if (reporte.listaPeriodos && periodo !== PERMANENTE) {
      const lista = await listaDePeriodos(sede, reporte.listaPeriodos, sesion);
      if (lista && !lista.includes(periodo)) {
        throw new ErrorPlataforma(`El periodo ${periodo} no está en la lista de ${reporte.listaPeriodos === "aspirantes" ? "aspirantes" : "deserciones"} de ${SEDES[sede].nombre} (${lista.slice(0, 6).join(", ")}…).`);
      }
    }
    const ctx: Contexto = { sede, periodo: periodo === PERMANENTE ? abierto : periodo, abierto, corte: reporte.corte ? corte : "", usuario: ENV("WAREHOUSE_MASTER_USER") };
    const original = await obtenerHoja(reporte, ctx, sesion);
    if (original.filas.length === 0) throw new ErrorPlataforma("El reporte llegó sin filas.");

    // El periodo que la plataforma dice haber entregado debe ser el pedido. Si el reporte no lo dice, un periodo distinto
    // del abierto solo se acepta cuando está probado; si el periodo va en el cuerpo, se rechaza; si va en la URL, queda sin confirmar.
    const hallado = original.periodoArchivo ?? null;
    let confirmado = true;
    if (periodo !== PERMANENTE) {
      if (hallado && hallado !== periodo) {
        throw new ErrorPlataforma(`Periodo distinto del pedido: se pidió ${periodo} y la plataforma entregó ${hallado}. No se guardó nada.`);
      }
      if (!hallado && (reporte.periodoVia === "cuerpo" || reporte.periodoVia === "consulta") && periodo !== abierto && !reporte.periodoProbado) {
        if (reporte.periodoVia === "cuerpo") {
          throw new ErrorPlataforma(`Periodo sin confirmar: este reporte no dice de qué periodo es, y ${SEDES[sede].nombre} tiene abierto ${abierto}, no ${periodo}. Solo se guarda el periodo abierto; para otro, cargue el Excel a mano.`);
        }
        confirmado = false;
      }
    }

    // La huella es del contenido tal como llegó; las columnas derivadas (grupo etario, origen) se añaden después.
    const hoja = derivarColumnas(conjunto, original, periodo === PERMANENTE ? ctx.periodo : periodo);
    const revision = await revisarPolitica(db, conjunto, hoja);

    if (accion === "sondear") {
      const avisos = [...(reporte.avisos ?? [])];
      if (sede !== "buc") avisos.push("Los HAR con que se hizo este reporte son de Bucaramanga: en esta sede la ruta y el cuerpo son los mismos, pero las columnas pueden variar. Revise «faltan».");
      if (!reporte.verificado) avisos.push("Este reporte no se vio completo en un HAR: confirme las columnas antes de darlo por bueno.");
      if (!hallado && reporte.periodoVia !== "ruta" && reporte.periodoVia !== "sesion" && reporte.periodoVia !== "ninguno") avisos.push("El archivo no dice de qué periodo es.");
      return json({
        ok: true,
        periodo,
        abierto,
        periodoArchivo: hallado,
        confirmado,
        columnas: hoja.columnas,
        originales: hoja.originales,
        filas: hoja.filas.length,
        verificado: reporte.verificado,
        sinPolitica: revision.sinPolitica,
        faltan: revision.faltan,
        descartadas: revision.descartadas,
        otroReporte: revision.otroReporte,
        avisos,
      });
    }
    if (revision.otroReporte) {
      throw new ErrorPlataforma(`El archivo de ${SEDES[sede].nombre} no se parece a este reporte (faltan columnas que la política conserva: ${revision.faltan.slice(0, 6).join(", ")}). No se guardó nada; use «Sondear» para ver sus columnas.`);
    }

    const huella = await huellaContenido(original);
    const abierta = await db.rpc("wh_abrir_carga", {
      p_conjunto: conjunto,
      p_periodo: periodo,
      p_sede: sede,
      p_corte: reporte.corte ? corte : "",
      p_huella: huella,
      p_origen: "servidor",
      p_archivo: `${conjunto}${reporte.corte ? `-c${corte}` : ""}.xlsx`,
      p_motivo: motivo,
    });
    if (abierta.error) return json({ ok: false, error: abierta.error.message.replace(/^[a-z_]+: /, ""), code: abierta.error.message.split(":")[0] }, 409);
    const carga = (abierta.data as { id: string; version: number; duplicada: boolean }[])[0];
    if (carga.duplicada) return json({ ok: true, periodo, version: carga.version, filas: hoja.filas.length, duplicada: true, confirmado });

    try {
      await enParalelo(enLotes(hoja.filas, FILAS_POR_LOTE), async (lote, i) => {
        const a = await db.rpc("wh_agregar_filas", { p_carga: carga.id, p_inicio: i * FILAS_POR_LOTE + 1, p_filas: lote });
        if (a.error) throw new Error(a.error.message);
      });
    } catch (e) {
      await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: false, p_error: e instanceof Error ? e.message : "error al guardar", p_columnas: null });
      throw new ErrorPlataforma("No se pudieron guardar las filas; la carga quedó en error y lo anterior sigue vigente.");
    }
    const cerrada = await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: true, p_error: "", p_columnas: hoja.columnas });
    if (cerrada.error) throw new ErrorPlataforma(cerrada.error.message);
    return json({ ok: true, periodo, version: carga.version, filas: Number(cerrada.data), duplicada: false, confirmado });
  } catch (e) {
    return json({ ok: false, error: e instanceof ErrorPlataforma ? e.message : "No se pudo completar la carga." }, 502);
  } finally {
    if (sesion) await cerrarSesion(sesion);
  }
});
