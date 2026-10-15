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
         inicia sesión en las tres plataformas y lee el periodo abierto.
     sondear { conjunto, sede, periodo?, corte? } → { ok, periodo, columnas, filas }
         pide el reporte y devuelve SOLO los nombres de sus columnas y cuántas
         filas trae: no guarda nada y no muestra ninguna fila. Sirve para
         escribir la política de privacidad de un reporte nuevo.
     cargar { conjunto, sede, periodo?, corte?, motivo? }
                                                 → { ok, periodo, version, filas, duplicada }

   Reglas:
     · Solo con sesión, y solo Planeación o más (wh_autorizado). Las escrituras
       van a la base con la sesión de quien llama, por wh_abrir_carga /
       wh_agregar_filas / wh_cerrar_carga: la política de privacidad la aplica
       la base, no esta función. Un reporte sin política no se guarda.
     · El periodo lo elige quien llama solo si la plataforma lo deja pedir
       (va en la ruta o en selected_period). Si lo fija la sesión (rendimiento,
       horarios…), es el periodo abierto que informa la plataforma: etiquetarlo
       con otro mentiría.
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
import { aplanarJson, base64ABytes, enLotes, esExcelBase64, huellaContenido, leerSegun, periodoValido, type Hoja } from "./motor.ts";
import { consultaDe, edificiosDe, estadoTarea, REPORTES, reportePorId, type Contexto, type Peticion, type Reporte, type SistemaApi } from "./reportes.ts";

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
const LOTE = 1000;
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
  return { base, sistema, ...sesion, periodo };
}

async function cerrarSesion(s: Sesion) {
  try {
    await pedirJson(s.base, { metodo: "GET", ruta: `/${s.sistema}/mod_auth/logout/` }, s);
  } catch {
    // Cerrar la sesión es cortesía: si falla, la sesión caduca sola.
  }
}

/** Un archivo Excel pedido: llega en `msg` (base64) o, si es una tarea, al terminarla. */
async function descargarExcel(s: Sesion, p: Peticion, entrega: Reporte["entrega"]): Promise<Record<string, Uint8Array>> {
  const r = await pedirJson(s.base, p, s);
  let base64: string | undefined;
  if (entrega === "tarea" || (!esExcelBase64(r.msg) && r.task_id)) {
    if (!r.task_id) throw new ErrorPlataforma("La plataforma no inició la tarea del reporte.");
    const limite = Date.now() + ESPERA_TAREA_MS;
    while (Date.now() < limite) {
      await dormir(PAUSA_TAREA_MS);
      const e = estadoTarea(await pedirJson(s.base, { metodo: "GET", ruta: `/${s.sistema}/mod_home/home/task_state/${encodeURIComponent(r.task_id)}/` }, s));
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
    return unzipSync(base64ABytes(base64));
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

/** Pide un reporte y lo deja como tabla. */
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
        const hoja = leerSegun(r.lector, await descargarExcel(s, r.armar({ ...ctx, edificio: e }), r.entrega));
        if (hoja.filas.length) partes.push({ rotulo: e.name, hoja });
      } catch {
        // Un edificio sin horarios responde vacío o con error: se salta.
      }
    }
    if (partes.length === 0) throw new ErrorPlataforma("Ningún edificio devolvió horarios.");
    return juntar(partes, "edificio");
  }
  return leerSegun(r.lector, await descargarExcel(s, r.armar(ctx), r.entrega));
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
  if (!["estado", "probar", "sondear", "cargar"].includes(accion)) return json({ error: "Acción desconocida." }, 400);

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
      reportes: REPORTES.map((r) => ({ id: r.id, sistema: r.sistema, verificado: r.verificado })),
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

  // sondear · cargar -------------------------------------------------------------------
  const conjunto = String(cuerpo.conjunto ?? "");
  const reporte = reportePorId(conjunto);
  if (!reporte) return json({ error: "Este conjunto aún no se pide solo: cárguelo con el Excel descargado." }, 400);
  const corte = String(cuerpo.corte ?? "");
  if (reporte.corte && !CORTES.includes(corte)) return json({ error: "Falta el corte (1, 2, 3 o f)." }, 400);
  const pedido = String(cuerpo.periodo ?? "");
  if ((reporte.periodoVia === "ruta" || reporte.periodoVia === "consulta") && !periodoValido(pedido)) return json({ error: "Falta el periodo (por ejemplo 2026b)." }, 400);
  const motivo = String(cuerpo.motivo ?? "").slice(0, 300);

  let sesion: Sesion | null = null;
  try {
    sesion = await iniciarSesion(sede, reporte.sistema);
    const periodo = reporte.periodoVia === "ninguno" ? PERMANENTE : reporte.periodoVia === "sesion" ? sesion.periodo : pedido;
    const ctx: Contexto = { sede, periodo: periodo === PERMANENTE ? sesion.periodo : periodo, corte: reporte.corte ? corte : "", usuario: ENV("WAREHOUSE_MASTER_USER") };
    const hoja = await obtenerHoja(reporte, ctx, sesion);
    if (hoja.filas.length === 0) throw new ErrorPlataforma("El reporte llegó sin filas.");

    if (accion === "sondear") {
      return json({ ok: true, periodo, columnas: hoja.columnas, originales: hoja.originales, filas: hoja.filas.length, verificado: reporte.verificado });
    }

    const huella = await huellaContenido(hoja);
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
    if (carga.duplicada) return json({ ok: true, periodo, version: carga.version, filas: hoja.filas.length, duplicada: true });

    let inicio = 1;
    try {
      for (const lote of enLotes(hoja.filas, LOTE)) {
        const a = await db.rpc("wh_agregar_filas", { p_carga: carga.id, p_inicio: inicio, p_filas: lote });
        if (a.error) throw new Error(a.error.message);
        inicio += lote.length;
      }
    } catch (e) {
      await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: false, p_error: e instanceof Error ? e.message : "error al guardar", p_columnas: null });
      throw new ErrorPlataforma("No se pudieron guardar las filas; la carga quedó en error y lo anterior sigue vigente.");
    }
    const cerrada = await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: true, p_error: "", p_columnas: hoja.columnas });
    if (cerrada.error) throw new ErrorPlataforma(cerrada.error.message);
    return json({ ok: true, periodo, version: carga.version, filas: Number(cerrada.data), duplicada: false });
  } catch (e) {
    return json({ ok: false, error: e instanceof ErrorPlataforma ? e.message : "No se pudo completar la carga." }, 502);
  } finally {
    if (sesion) await cerrarSesion(sesion);
  }
});
