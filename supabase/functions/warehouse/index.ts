/* =============================================================================
   Edge Function · warehouse

   Pide a Master, Galileo y Davinci los reportes del Warehouse UDES
   (migraciones 0155 y 0156) y los guarda por periodo. Las tres plataformas
   viven en el servidor de cada sede (puerto 81), piden sesión y entregan los
   reportes como Excel en base64 (hasta unos 4 MB): por eso lo hace el
   servidor, con una cuenta de servicio, y no el navegador de cada persona.
   Cómo se pide cada reporte está en reportes.ts, sacado de los HAR.

   LÍMITES DEL SERVIDOR (runtime de funciones de producción): 150 MB de memoria y
   60 s por ejecución. Todo el diseño parte de ahí:
     · ninguna llamada pasa de ~52 s (LIMITE_LARGO_MS) y las de seguimiento de una
       tarea, de ~38 s (LIMITE_BREVE_MS): cada petición a la plataforma lleva como
       tope lo que queda del presupuesto, y si no alcanza se dice, no se cae.
     · el Excel no se descomprime entero: flujo.ts lo recorre por tramos y la fila
       es lo único que viaja (ver «Presupuesto de memoria»).
     · las tareas largas (nómina, estudiantes activos, reporte financiero) se
       parten en llamadas cortas dirigidas por el navegador (ver «Tareas»).

   Acciones (todas POST, con la sesión de quien llama):

     estado {}                                   → { ok, configurado, sedes, reportes }
     probar { sede }                             → { ok, periodo }
         inicia sesión en las tres plataformas, lee el periodo abierto y comprueba
         (en Master) que el servidor responde como la sede pedida.
     periodos { sede }                           → { ok, periodos, actual, aspirantes, deserciones }
         las listas de periodos de Master de esa sede.
     sondear { conjunto, sede, periodo?, corte? } → { ok, periodo, columnas, filas, … }
         pide el reporte y devuelve SOLO los nombres de sus columnas y cuántas
         filas trae (cuenta recorriendo el archivo por tramos; no guarda nada ni
         muestra ninguna fila).
     cargar { conjunto, sede, periodo?, corte?, motivo? }
                                                 → { ok, periodo, version, filas, duplicada, confirmado }

   Tareas (reportes con entrega «tarea»: la plataforma tarda de decenas de segundos a minutos):
     sondear | cargar { …, fase: "iniciar" }     → { ok, tarea: { id, pase, sistema, sede, conjunto, periodo, corte } }
         solo abre sesión, valida el periodo e inicia la tarea. NO espera. Sin `fase`
         un reporte de tarea se comporta igual (nunca espera dentro de la llamada).
     estado_tarea { tarea: { id, pase } }        → { ok, estado: "ejecutando"|"listo"|"fallo", progreso?, nombre?, pase? }
         una consulta a task_state (< ~15 s). Si la sesión caducó abre otra y devuelve un `pase` nuevo.
     finalizar { modo: "cargar"|"sondear", tarea: { id, pase }, motivo? }
                                                 → lo mismo que sondear / cargar, o { ok, pendiente: true, estado, pase? }
         descarga el resultado de la tarea terminada, lo procesa y guarda. Si la plataforma aún no entrega el
         Excel, responde pendiente (no es un error): el navegador espera y vuelve a finalizar (con `pase` si llega).
     cancelar { tarea: { id, pase } }            → { ok }
         cierra la sesión de la tarea (la plataforma no tiene una acción de cancelar).

   Resultados neutros (ok: true, no son errores; en cargar, sondear y finalizar):
     { ok, neutro: "sin_datos", mensaje }            la plataforma no tiene registros (periodo o sede sin datos)
     { ok, neutro: "galileo_no_responde", mensaje }  Galileo responde 5xx por dentro en esa sede

   El `pase` es la sesión de la plataforma (token y llave) cifrada con AES-GCM con una clave derivada de la
   clave de servicio: el navegador solo lo guarda y lo devuelve, no puede leerlo ni cambiarlo, está atado a
   quien lo pidió y caduca a los 15 minutos. El token nunca sale en claro de esta función.

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
     · Ni la contraseña ni el token salen de aquí. Los registros (console.error) llevan solo la acción, el
       reporte, la sede y un motivo corto ya limpiado (extractoSeguro: sin claves, correos ni números largos).
     · El contenido se huella (no el archivo): dos descargas iguales no cuentan
       como dos versiones.
     · Una sesión nueva en cada petición: un 401/403 con la sesión recién abierta es falta de permiso de la
       cuenta de servicio para ese reporte en esa sede, no sesión caducada. Solo si una sesión REUTILIZADA (la
       del pase) recibe 401 se abre otra y se reintenta una vez.

   Presupuesto de memoria (de 150 MB; lo que cuesta el runtime con supabase-js y fflate ronda 45–55 MB):
     etapa                                                         pico estimado
     respuesta de la plataforma como texto (4 MB base64)               ~4 MB
     base64 → bytes por tramos de 64 KB (zip de ~3 MB); se suelta el texto   ~3 MB
     cadenas compartidas del libro (todas las celdas de texto)        10–25 MB
     hoja por tramos (16 KB comprimidos ≈ 0,3–1 MB de XML a la vez)    ~1–2 MB
     huella (primera pasada): una fila a la vez                        <1 MB
     guardado (segunda pasada): 2 lotes de 2000 filas en vuelo ×
       (filas + cuerpo JSON ≈ 8–12 MB)                                 16–24 MB
     total sobre la base del runtime                                  ~35–60 MB  → ~90–115 MB
   Medido en Node con los Excel de los HAR: 23.600 filas de 30 columnas caben en 24 MB de heap (la lectura
   anterior necesitaba más de 48 MB solo para filas y matriz, sin contar copias del texto ni los lotes).

   Variables de entorno:
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (las pone la plataforma)
     WAREHOUSE_MASTER_USER, WAREHOUSE_MASTER_PASSWORD   la cuenta de servicio (la misma entra a las tres)
     WAREHOUSE_MASTER_URL_BUC / _CUC / _VAL / _BOG      opcionales; por defecto
                  https://master-{sede}.udes.edu.co:81
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { fuenteDeExcel, fuenteDeHoja, type Fuente } from "./flujo.ts";
import {
  FILAS_POR_LOTE,
  HuellaIncremental,
  aplanarJson,
  base64ABytes,
  derivacion,
  extractoSeguro,
  periodosEnTexto,
  periodoValido,
  recortador,
  separarBase64,
  ultimoPeriodoDe,
  type Fila,
  type Hoja,
} from "./motor.ts";
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
const NOMBRE_SISTEMA: Record<SistemaApi, string> = { master: "Master", galileo: "Galileo", davinci: "Davinci" };
const CORTES = ["1", "2", "3", "f"];
const SISTEMAS: SistemaApi[] = ["master", "galileo", "davinci"];
const ACCIONES = ["estado", "probar", "periodos", "sondear", "cargar", "estado_tarea", "finalizar", "cancelar", "docentes"];

/** Tope de una petición a la plataforma (además de lo que quede del presupuesto de la llamada). */
const TIEMPO_PETICION_MS = 45_000;
/** Presupuesto de una llamada que descarga y guarda (el servidor corta a los 60 s). */
const LIMITE_LARGO_MS = 52_000;
/** Presupuesto de las llamadas cortas: iniciar una tarea, preguntar su estado, probar, listar periodos. */
const LIMITE_BREVE_MS = 38_000;
/** Lotes de filas que viajan a la vez a la base: dos bastan y acotan la memoria. */
const LOTES_EN_VUELO = 2;
/** Cuánto vale un pase de tarea (la tarea más lenta, la nómina, tarda ~70 s). */
const VIDA_PASE_MS = 15 * 60_000;
const PERMANENTE = "permanente";

/** Fallo de la plataforma o del reporte con un mensaje para la persona (ya sin datos sensibles). */
class ErrorPlataforma extends Error {}
/** 401/403 de una sesión que se reutilizó: la sesión caducó; quien llama puede abrir otra y reintentar una vez. */
class ErrorSesion extends ErrorPlataforma {}
/**
 * Resultado neutro: no es un fallo ni cuenta como error. «sin_datos»: la plataforma no tiene registros para esa consulta
 * (a veces lo dice con un 401). «galileo_no_responde»: Galileo responde 5xx por dentro en esa sede.
 */
type TipoNeutro = "sin_datos" | "galileo_no_responde";
class Neutro extends ErrorPlataforma {
  constructor(
    readonly tipo: TipoNeutro,
    mensaje: string,
  ) {
    super(mensaje);
  }
}
/** Acciones que pueden responder un resultado neutro (con ok: true). Las demás lo siguen mostrando como error. */
const ACCIONES_NEUTRAS = ["cargar", "sondear", "finalizar"];

/** Frases con las que la plataforma dice «no hay datos» (sin distinguir mayúsculas ni tildes). */
const PATRONES_SIN_DATOS = [/no se encontr/, /\bno hay\b/, /sin resultados/, /sin datos/, /\bno existen? (?:datos|registros|resultados|estudiantes|informacion)\b/];
/** Un mensaje que habla de permisos o de la sesión no es «sin datos», aunque diga «no hay». */
function pareceSinDatos(texto: string): boolean {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/permis|autoriz|credencial|contrase|sesion|token/.test(t)) return false;
  return PATRONES_SIN_DATOS.some((p) => p.test(t));
}
/** Un resultado «sin datos» con su frase para la persona (la frase cuenta lo que no hay) y el detalle de la plataforma. */
const sinDatos = (frase: string, detalle = "") => new Neutro("sin_datos", `Sin datos en este periodo y sede: ${frase}.${detalle ? ` Detalle de la plataforma: «${detalle}».` : ""}`);

const baseDe = (sede: string) => (ENV(SEDES[sede].variable) || SEDES[sede].porDefecto).replace(/\/+$/, "");

/** A quién se le pide algo: sirve para que los errores digan sistema, sede y reporte. */
interface Destino {
  base: string;
  sede: string;
  sistema: SistemaApi;
  /** El reporte que se está pidiendo (para el mensaje de error). */
  reporte?: string;
  /** Hora (ms) hasta la que esta llamada puede seguir pidiendo; después se detiene con un mensaje claro. */
  limite: number;
}

interface Credencial {
  token: string;
  apiKey: string;
  /** true: viene de un pase, no se abrió en esta petición. */
  reutilizada?: boolean;
}

interface Sesion extends Destino, Credencial {
  /** El periodo abierto que informa esta plataforma. */
  periodo: string;
}

type Respuesta = { msg?: unknown; code?: number; task_id?: string };

/** Qué pasó con la petición, con lo que hace falta para decidir qué hacer y qué decirle a la persona. */
function errorHttp(d: Destino, estado: number, cuerpo: string, opciones: { sesion?: boolean; reutilizada?: boolean; inicioSesion?: boolean }): ErrorPlataforma {
  const donde = `${NOMBRE_SISTEMA[d.sistema]} de ${SEDES[d.sede].nombre}${d.reporte ? `, reporte «${d.reporte}»` : ""}`;
  const detalle = extractoSeguro(cuerpo, 200);
  const nota = detalle ? ` Detalle de la plataforma: «${detalle}».` : "";
  const galileo = d.sistema === "galileo" ? " Es posible que Galileo no esté habilitado en esta sede." : "";
  if (d.sistema === "galileo" && estado >= 500) {
    return new Neutro("galileo_no_responde", `Galileo no responde en esta sede (${SEDES[d.sede].nombre}): respondió ${estado} por dentro, no es un fallo de esta función. Reintente más tarde; si se repite, avise a Galileo.${nota}`);
  }
  // Un 401 (o 400, 403…) con texto de «no hay datos» es un periodo o sede sin registros, no falta de permiso. El 404 y los 5xx no se miran.
  if (estado !== 404 && estado < 500 && !opciones.inicioSesion && pareceSinDatos(cuerpo)) {
    return sinDatos(`${donde} no tiene registros para esta consulta`, detalle);
  }
  if (estado === 401 || estado === 403) {
    if (opciones.reutilizada) return new ErrorSesion(`La plataforma respondió ${estado} (${donde}): la sesión caducó.`);
    if (opciones.inicioSesion) return new ErrorPlataforma(`La plataforma respondió ${estado} al iniciar sesión (${donde}): no aceptó la cuenta de servicio.${nota}${galileo}`);
    return new ErrorPlataforma(
      `La plataforma respondió ${estado} (${donde}): la cuenta de servicio no tiene permiso para este reporte en esta sede. La sesión se acababa de abrir, así que no es una sesión caducada: pida que se habilite el reporte a la cuenta.${nota}${galileo}`,
    );
  }
  if (estado === 404) return new ErrorPlataforma(`La plataforma respondió 404 (${donde}): esa ruta no existe en esa plataforma o en esa sede (¿el reporte cambió de lugar?).${nota}${galileo}`);
  if (estado >= 500) {
    const raro = estado === 540 ? " El 540 no es un código estándar: lo devuelve la propia plataforma cuando el reporte falla por dentro." : "";
    return new ErrorPlataforma(`La plataforma respondió ${estado} (${donde}): falló al generar el reporte.${raro} Suele pasar con datos inconsistentes de la sede o con el servidor ocupado; reintente en unos minutos.${nota}${galileo}`);
  }
  return new ErrorPlataforma(`La plataforma respondió ${estado} (${donde}).${nota}${galileo}`);
}

/**
 * Una petición a la plataforma. Devuelve el JSON y, si la respuesta traía un Excel en base64, el base64 aparte (sin
 * dejarlo dentro del objeto): ver `separarBase64`.
 */
async function pedir(d: Destino, p: Peticion, credencial?: Credencial, opciones: { inicioSesion?: boolean } = {}): Promise<{ json: Respuesta; base64: string | null }> {
  const q = credencial ? consultaDe(credencial.token, credencial.apiKey, p.consulta) : p.consulta ? new URLSearchParams(p.consulta).toString() : "";
  const url = `${d.base}${p.ruta}${q ? `?${q}` : ""}`;
  const restante = d.limite - Date.now();
  if (restante < 3_000) {
    throw new ErrorPlataforma(`Se acabó el tiempo de la llamada (la función tiene 60 s) antes de terminar «${d.reporte ?? "la petición"}» en ${SEDES[d.sede].nombre}. Reintente; si se repite, cargue ese reporte con el Excel descargado.`);
  }
  const galileo = d.sistema === "galileo" ? " Es posible que Galileo no esté habilitado en esta sede." : "";
  let respuesta: Response;
  let texto: string;
  try {
    const señal = AbortSignal.timeout(Math.min(TIEMPO_PETICION_MS, restante));
    respuesta = await fetch(url, {
      method: p.metodo,
      headers: p.cuerpo ? { "Content-Type": "application/json;charset=UTF-8" } : undefined,
      body: p.cuerpo ? JSON.stringify(p.cuerpo) : undefined,
      signal: señal,
    });
    if (!respuesta.ok) {
      texto = (await respuesta.text().catch(() => "")).slice(0, 4000);
      throw errorHttp(d, respuesta.status, texto, { reutilizada: credencial?.reutilizada, inicioSesion: opciones.inicioSesion });
    }
    texto = await respuesta.text();
  } catch (e) {
    if (e instanceof ErrorPlataforma) throw e;
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ErrorPlataforma(`La plataforma de ${SEDES[d.sede].nombre} tardó más de ${Math.round(Math.min(TIEMPO_PETICION_MS, restante) / 1000)} s en responder (${NOMBRE_SISTEMA[d.sistema]}${d.reporte ? `, «${d.reporte}»` : ""}).${galileo}`);
    }
    throw new ErrorPlataforma(`No se pudo conectar con ${NOMBRE_SISTEMA[d.sistema]} de ${SEDES[d.sede].nombre}. Revise que el servidor de la función llegue a la red de la universidad.${galileo}`);
  }
  try {
    const { json: cuerpo, base64 } = separarBase64(texto);
    return { json: (cuerpo ?? {}) as Respuesta, base64 };
  } catch {
    throw new ErrorPlataforma(`La plataforma devolvió algo que no es JSON (${NOMBRE_SISTEMA[d.sistema]} de ${SEDES[d.sede].nombre}${d.reporte ? `, «${d.reporte}»` : ""}): «${extractoSeguro(texto, 120)}».`);
  }
}

const pedirJson = async (d: Destino, p: Peticion, credencial?: Credencial) => (await pedir(d, p, credencial)).json;

/** Inicia sesión en una plataforma (cada una tiene la suya) y lee su periodo abierto. */
async function iniciarSesion(sede: string, sistema: SistemaApi, limite: number, reporte?: string): Promise<Sesion> {
  const usuario = ENV("WAREHOUSE_MASTER_USER");
  const clave = ENV("WAREHOUSE_MASTER_PASSWORD");
  if (!usuario || !clave) throw new ErrorPlataforma("Falta la cuenta de servicio (WAREHOUSE_MASTER_USER y WAREHOUSE_MASTER_PASSWORD).");
  const destino: Destino = { base: baseDe(sede), sede, sistema, reporte, limite };
  const { json: r } = await pedir(destino, { metodo: "POST", ruta: `/${sistema}/mod_auth/login/`, cuerpo: { login: usuario, password: clave } }, undefined, { inicioSesion: true });
  const msg = r.msg as { access_token?: string; api_key?: string } | string | undefined;
  if (r.code !== 200 || !msg || typeof msg === "string" || !msg.access_token) {
    throw new ErrorPlataforma(`${NOMBRE_SISTEMA[sistema]} de ${SEDES[sede].nombre} no aceptó la cuenta de servicio.${sistema === "galileo" ? " Es posible que Galileo no esté habilitado en esta sede." : ""}`);
  }
  const credencial: Credencial = { token: msg.access_token, apiKey: msg.api_key ?? "0" };
  const p = await pedirJson(destino, { metodo: "GET", ruta: `/${sistema}/mod_auth/current_period/` }, credencial);
  const periodo = (p.msg as { period?: string } | undefined)?.period ?? "";
  if (!periodoValido(periodo)) throw new ErrorPlataforma(`${NOMBRE_SISTEMA[sistema]} de ${SEDES[sede].nombre} no informó el periodo abierto.`);
  if (sistema === "master") {
    // Master dice a qué sede pertenece: si el servidor configurado para una sede responde como otra, se detiene aquí.
    let real: string | null = null;
    try {
      const h = await pedirJson(destino, { metodo: "GET", ruta: "/master/mod_auth/headquarter/" }, credencial);
      real = sedeDeNombre((h.msg as { name?: unknown } | undefined)?.name);
    } catch {
      // Sin respuesta de la sede: no es motivo para detener la carga.
    }
    if (real && real !== sede) {
      throw new ErrorPlataforma(`El servidor configurado para ${SEDES[sede].nombre} responde como ${SEDES[real].nombre}. Revise WAREHOUSE_MASTER_URL_${sede.toUpperCase()}.`);
    }
  }
  return { ...destino, ...credencial, periodo };
}

async function cerrarSesion(s: Sesion) {
  try {
    await pedirJson({ ...s, limite: Math.max(s.limite, Date.now() + 5_000) }, { metodo: "GET", ruta: `/${s.sistema}/mod_auth/logout/` }, s);
  } catch {
    // Cerrar la sesión es cortesía: si falla, la sesión caduca sola.
  }
}

/* --- El pase de una tarea ---------------------------------------------------------------------------- */

interface PaseDatos {
  /** token y llave de la sesión de la plataforma */
  t: string;
  k: string;
  sistema: SistemaApi;
  sede: string;
  /** periodo abierto de esa sesión */
  ab: string;
  conjunto: string;
  /** periodo con que se guardará («permanente» en los catálogos) */
  p: string;
  corte: string;
  /** id de la tarea en la plataforma */
  id: string;
  /** quién lo pidió */
  u: string;
  /** vence (ms) */
  e: number;
}

const bytesABase64Url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const base64UrlABytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function llavePase(): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`warehouse-pase|${ENV("SUPABASE_SERVICE_ROLE_KEY")}`));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sellarPase(datos: PaseDatos): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llavePase(), new TextEncoder().encode(JSON.stringify(datos))));
  const todo = new Uint8Array(iv.length + cifrado.length);
  todo.set(iv, 0);
  todo.set(cifrado, iv.length);
  return bytesABase64Url(todo);
}

async function abrirPase(pase: unknown, usuario: string, id: unknown): Promise<PaseDatos> {
  const invalido = new ErrorPlataforma("La tarea ya no es válida (el pase no se pudo leer o venció). Vuelva a iniciar la carga.");
  if (typeof pase !== "string" || pase.length < 40) throw invalido;
  let datos: PaseDatos;
  try {
    const todo = base64UrlABytes(pase);
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: todo.slice(0, 12) }, await llavePase(), todo.slice(12));
    datos = JSON.parse(new TextDecoder().decode(claro)) as PaseDatos;
  } catch {
    throw invalido;
  }
  if (datos.u !== usuario || datos.e < Date.now() || (id !== undefined && String(id) !== datos.id) || !SEDES[datos.sede] || !reportePorId(datos.conjunto)) throw invalido;
  return datos;
}

/** La sesión de un pase, sin ir a la plataforma (se comprueba al usarla). */
const sesionDePase = (pase: PaseDatos, limite: number): Sesion => ({
  base: baseDe(pase.sede),
  sede: pase.sede,
  sistema: pase.sistema,
  reporte: pase.conjunto,
  limite,
  token: pase.t,
  apiKey: pase.k,
  reutilizada: true,
  periodo: pase.ab,
});

/** Hace `trabajo` con la sesión del pase; si la plataforma la da por caducada, abre otra una vez y repite. */
async function conSesionDePase<T>(pase: PaseDatos, limite: number, trabajo: (s: Sesion) => Promise<T>): Promise<{ valor: T; sesion: Sesion; renovada: boolean }> {
  let sesion = sesionDePase(pase, limite);
  try {
    return { valor: await trabajo(sesion), sesion, renovada: false };
  } catch (e) {
    if (!(e instanceof ErrorSesion)) throw e;
  }
  sesion = await iniciarSesion(pase.sede, pase.sistema, limite, pase.conjunto);
  try {
    return { valor: await trabajo(sesion), sesion, renovada: true };
  } catch (e) {
    if (e instanceof Neutro) throw e;
    // Con la sesión nueva la plataforma puede no reconocer una tarea que empezó otra sesión: se dice, no se confunde con otro fallo.
    if (e instanceof ErrorPlataforma) throw new ErrorPlataforma(`${e.message} La sesión de la tarea caducó y se abrió otra; si la plataforma no reconoce la tarea con la sesión nueva, inicie la carga otra vez.`);
    throw e;
  }
}

/* --- Pedir y leer los reportes ------------------------------------------------------------------------- */

/** Lo que devolvió pedir un reporte: el Excel ya en bytes, o el id de la tarea que lo genera. */
async function descargar(s: Sesion, p: Peticion): Promise<{ bytes: Uint8Array | null; tareaId: string | null }> {
  const { json: r, base64 } = await pedir(s, p, s);
  if (base64 && (r.code === undefined || r.code === 200)) return { bytes: base64ABytes(base64), tareaId: null };
  if (r.task_id) return { bytes: null, tareaId: String(r.task_id) };
  if (typeof r.msg === "string" && pareceSinDatos(r.msg)) throw sinDatos(`${NOMBRE_SISTEMA[s.sistema]} de ${SEDES[s.sede].nombre}, reporte «${s.reporte ?? ""}», no tiene registros para esta consulta`, extractoSeguro(r.msg, 160));
  throw new ErrorPlataforma(
    typeof r.msg === "string" && r.msg.length > 0 && r.msg.length < 200
      ? `La plataforma dijo: «${extractoSeguro(r.msg, 160)}» (${NOMBRE_SISTEMA[s.sistema]} de ${SEDES[s.sede].nombre}, «${s.reporte ?? ""}»).`
      : "La plataforma no devolvió el reporte (¿aún no hay datos?).",
  );
}

/** Un Excel como fuente de filas; si no tiene la forma del reporte, lo dice. */
function fuenteDe(r: Reporte, bytes: Uint8Array): Fuente {
  try {
    return fuenteDeExcel(bytes, r.lector);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("La plataforma devolvió un archivo")) throw new ErrorPlataforma(e.message);
    throw new ErrorPlataforma(`El reporte llegó con otra forma de la esperada (¿cambió en esta sede?): ${extractoSeguro(e, 140) || "no se pudo leer"}`);
  }
}

/** Una fuente que está entera en memoria, como tabla (para juntar partes pequeñas). */
function aTabla(fuente: Fuente): Hoja {
  return { columnas: fuente.columnas, originales: fuente.originales, filas: fuente.abrir().siguiente(Number.MAX_SAFE_INTEGER) };
}

/** Junta varias hojas con las mismas columnas (departamentos de pregrado y posgrado; un edificio por pedido). */
function juntar(partes: { rotulo: string; hoja: Hoja }[], columna: string): Hoja {
  const columnas = [columna];
  const originales = [columna];
  for (const { hoja } of partes) hoja.columnas.forEach((c, i) => !columnas.includes(c) && (columnas.push(c), originales.push(hoja.originales[i] ?? c)));
  const filas = partes.flatMap(({ rotulo, hoja }) => hoja.filas.map((f) => ({ [columna]: rotulo, ...f })));
  return { columnas, originales, filas };
}

/**
 * Pide un reporte y lo deja como fuente de filas. Si la plataforma contesta con una tarea, devuelve su id en vez de
 * esperarla: seguirla es cosa del navegador (acción `estado_tarea`).
 */
async function obtenerFuente(r: Reporte, ctx: Contexto, s: Sesion): Promise<{ fuente: Fuente | null; tareaId: string | null }> {
  if (r.entrega === "json") {
    const primero = await pedirJson(s, r.armar(ctx), s);
    if (primero.code !== undefined && primero.code !== 200) throw new ErrorPlataforma("La plataforma no entregó la lista.");
    if (!r.extra) return { fuente: fuenteDeHoja(aplanarJson(primero.msg)), tareaId: null };
    const partes = [{ rotulo: "pregrado", hoja: aplanarJson(primero.msg) }];
    for (const [i, otro] of r.extra.entries()) partes.push({ rotulo: i === 0 ? "posgrado" : `otro${i + 1}`, hoja: aplanarJson((await pedirJson(s, otro(ctx), s)).msg) });
    return { fuente: fuenteDeHoja(juntar(partes, "origen")), tareaId: null };
  }
  if (r.porEdificio) {
    const lista = edificiosDe((await pedirJson(s, { metodo: "GET", ruta: "/master/mod_reports/reports/buildings/" }, s)).msg);
    if (lista.length === 0) throw new ErrorPlataforma("No se pudo leer la lista de edificios.");
    const partes: { rotulo: string; hoja: Hoja }[] = [];
    for (const e of lista) {
      try {
        const d = await descargar(s, r.armar({ ...ctx, edificio: e }));
        if (!d.bytes) continue;
        const hoja = aTabla(fuenteDe(r, d.bytes));
        if (hoja.filas.length) partes.push({ rotulo: e.name, hoja });
      } catch (err) {
        // Un edificio sin horarios responde vacío o con error: se salta. Pero si se acabó el tiempo, se dice.
        if (s.limite - Date.now() < 3_000) {
          throw new ErrorPlataforma(`Se acabó el tiempo de la llamada con ${partes.length} de ${lista.length} edificios leídos. Reintente (la plataforma ya tiene los datos) o cargue el Excel descargado.`);
        }
        if (err instanceof ErrorSesion) throw err;
      }
    }
    if (partes.length === 0) throw sinDatos(`ningún edificio de ${SEDES[s.sede].nombre} tiene horarios para este periodo`);
    return { fuente: fuenteDeHoja(juntar(partes, "edificio")), tareaId: null };
  }
  const d = await descargar(s, r.armar(ctx));
  if (d.bytes) return { fuente: fuenteDe(r, d.bytes), tareaId: null };
  return { fuente: null, tareaId: d.tareaId };
}

/** De qué periodo dice ser lo que entregó la plataforma, según donde el reporte lo deja leer (ver `Reporte.confirma`). */
function periodoHallado(r: Reporte, nombreTarea: string | undefined, fuente: Fuente): string | null {
  if (r.confirma === "columnas") return ultimoPeriodoDe({ columnas: fuente.columnas });
  if (r.confirma === "tarea") {
    const enNombre = periodosEnTexto(nombreTarea ?? "");
    return enNombre.length === 1 ? enNombre[0] : fuente.periodoTitulos();
  }
  if (r.confirma === "archivo") return fuente.periodoTitulos();
  return null;
}

/** Una lista de periodos de Master de la sede (aspirantes o deserciones); null si no se pudo leer (no es motivo para detener la carga). */
async function listaDePeriodos(sede: string, clave: NonNullable<Reporte["listaPeriodos"]>, limite: number, abierta?: Sesion): Promise<string[] | null> {
  let propia: Sesion | null = null;
  try {
    const s = abierta?.sistema === "master" ? abierta : (propia = await iniciarSesion(sede, "master", limite));
    const ruta = clave === "aspirantes" ? "/master/mod_reports/reports/periods_applicants/" : "/master/mod_reports/reports/periods_to_student_desertion_report/";
    const lista = periodosDeLista((await pedirJson({ ...s, reporte: undefined }, { metodo: "GET", ruta }, s)).msg).periodos;
    return lista.length ? lista : null;
  } catch {
    return null;
  } finally {
    if (propia) await cerrarSesion(propia);
  }
}

interface Politica {
  modo: "permitir" | "excluir";
  lista: string[];
}

// deno-lint-ignore no-explicit-any
async function leerPolitica(db: any, conjunto: string): Promise<Politica | null> {
  const { data } = await db.from("wh_politicas").select("modo,lista").eq("conjunto", conjunto).maybeSingle();
  return (data as Politica | null) ?? null;
}

/** Lo que la política de privacidad espera del reporte frente a lo que la sede entregó (solo nombres de columnas). */
function revisarPolitica(pol: Politica | null, columnas: string[]) {
  if (!pol) return { sinPolitica: true, faltan: [] as string[], descartadas: [] as string[], otroReporte: false };
  if (pol.modo === "excluir") return { sinPolitica: false, faltan: [] as string[], descartadas: columnas.filter((c) => pol.lista.includes(c)), otroReporte: false };
  const conserva = columnas.filter((c) => pol.lista.includes(c));
  return {
    sinPolitica: false,
    faltan: pol.lista.filter((c) => !columnas.includes(c)),
    descartadas: columnas.filter((c) => !pol.lista.includes(c)),
    // Un archivo que no trae casi ninguna de las columnas que la política conserva es otro reporte (o el de otra sede con otra forma).
    otroReporte: conserva.length < Math.min(3, pol.lista.length),
  };
}

interface Entrega {
  accion: "sondear" | "cargar";
  reporte: Reporte;
  sede: string;
  /** Periodo con que se guarda («permanente» en los catálogos). */
  periodo: string;
  /** Periodo que se usa para derivar columnas y pedir (el abierto, si es permanente). */
  periodoCtx: string;
  abierto: string;
  corte: string;
  motivo: string;
  fuente: Fuente;
  nombreTarea?: string;
  limite: number;
  // deno-lint-ignore no-explicit-any
  db: any;
}

/**
 * Lo que sigue a tener el reporte en las manos: comprobar el periodo, revisar la política, sondear o guardar.
 * Dos pasadas por el archivo, ambas por tramos: la primera cuenta y calcula la huella (que la base pide ANTES de
 * abrir la carga); la segunda manda las filas, ya recortadas a lo que la política conserva, en lotes de 2000.
 */
async function procesar(e: Entrega): Promise<Response> {
  const { reporte, sede, periodo, abierto, fuente, db } = e;
  const conjunto = reporte.id;
  const deriv = derivacion(conjunto, fuente.columnas, fuente.originales, e.periodoCtx);
  const politica = await leerPolitica(db, conjunto);
  const revision = revisarPolitica(politica, deriv.columnas);

  // Primera pasada: filas y huella del contenido tal como llegó (las columnas derivadas se añaden después).
  const huella = e.accion === "cargar" ? new HuellaIncremental(fuente.columnas) : null;
  let total = 0;
  try {
    const lectura = fuente.abrir();
    for (let lote = lectura.siguiente(FILAS_POR_LOTE); lote.length > 0; lote = lectura.siguiente(FILAS_POR_LOTE)) {
      total += lote.length;
      if (huella) for (const f of lote) huella.agregar(f);
    }
  } catch (err) {
    if (err instanceof ErrorPlataforma) throw err;
    throw new ErrorPlataforma(`El reporte llegó con otra forma de la esperada (¿cambió en esta sede?): ${extractoSeguro(err, 140) || "no se pudo leer"}`);
  }
  if (total === 0) throw sinDatos(`el reporte de ${SEDES[sede].nombre} llegó sin filas para ${periodo === PERMANENTE ? "este catálogo" : periodo}`);

  // El periodo que la plataforma dice haber entregado debe ser el pedido. Si el reporte no lo dice, un periodo distinto
  // del abierto solo se acepta cuando está probado; si el periodo va en el cuerpo, se rechaza; si va en la URL, queda sin confirmar.
  const hallado = periodoHallado(reporte, e.nombreTarea, fuente);
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

  if (e.accion === "sondear") {
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
      columnas: deriv.columnas,
      originales: deriv.originales,
      filas: total,
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

  const abierta = await db.rpc("wh_abrir_carga", {
    p_conjunto: conjunto,
    p_periodo: periodo,
    p_sede: sede,
    p_corte: reporte.corte ? e.corte : "",
    p_huella: huella!.fin(),
    p_origen: "servidor",
    p_archivo: `${conjunto}${reporte.corte ? `-c${e.corte}` : ""}.xlsx`,
    p_motivo: e.motivo,
  });
  if (abierta.error) return json({ ok: false, error: abierta.error.message.replace(/^[a-z_]+: /, ""), code: abierta.error.message.split(":")[0] }, 409);
  const carga = (abierta.data as { id: string; version: number; duplicada: boolean }[])[0];
  if (carga.duplicada) return json({ ok: true, periodo, version: carga.version, filas: total, duplicada: true, confirmado });

  // Segunda pasada: derivar, recortar y mandar. Dos lotes en vuelo como máximo; el siguiente no se lee hasta que haya sitio.
  try {
    const enviadas = await guardarFilas(db, carga.id, fuente, deriv.derivar, politica ? recortador(politica) : (f) => f, e.limite);
    if (enviadas !== total) throw new Error(`se leyeron ${total} filas y se enviaron ${enviadas}`);
  } catch (err) {
    await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: false, p_error: extractoSeguro(err, 300) || "error al guardar", p_columnas: null });
    if (err instanceof ErrorPlataforma) throw err;
    throw new ErrorPlataforma(`No se pudieron guardar las filas (${extractoSeguro(err, 140) || "error"}); la carga quedó en error y lo anterior sigue vigente.`);
  }
  const cerrada = await db.rpc("wh_cerrar_carga", { p_carga: carga.id, p_ok: true, p_error: "", p_columnas: deriv.columnas });
  if (cerrada.error) throw new ErrorPlataforma(extractoSeguro(cerrada.error.message, 200));
  return json({ ok: true, periodo, version: carga.version, filas: Number(cerrada.data), duplicada: false, confirmado });
}

// deno-lint-ignore no-explicit-any
async function guardarFilas(db: any, carga: string, fuente: Fuente, derivar: (f: Fila) => Fila, recortar: (f: Fila) => Fila, limite: number): Promise<number> {
  const lectura = fuente.abrir();
  const enVuelo = new Set<Promise<void>>();
  let fallo: unknown = null;
  let enviadas = 0;
  while (fallo === null) {
    if (Date.now() > limite) {
      fallo = new ErrorPlataforma("Se acabó el tiempo de la función (60 s por llamada) a mitad del guardado; la carga quedó en error y lo anterior sigue vigente. Reintente; si se repite, cargue el Excel descargado.");
      break;
    }
    const bloque = lectura.siguiente(FILAS_POR_LOTE);
    if (bloque.length === 0) break;
    const lote = bloque.map((f) => recortar(derivar(f)));
    const inicio = enviadas + 1;
    enviadas += lote.length;
    const envio: Promise<void> = Promise.resolve(db.rpc("wh_agregar_filas", { p_carga: carga, p_inicio: inicio, p_filas: lote }))
      .then((a: { error?: { message: string } | null }) => {
        if (a.error) throw new Error(a.error.message);
      })
      .catch((err: unknown) => {
        fallo ??= err;
      })
      .finally(() => {
        enVuelo.delete(envio);
      });
    enVuelo.add(envio);
    if (enVuelo.size >= LOTES_EN_VUELO) await Promise.race(enVuelo);
  }
  await Promise.all(enVuelo);
  if (fallo !== null) throw fallo;
  return enviadas;
}

/* --- Nombres de los docentes de un código, en vivo (Gestión Master, 0194) ---------------------------- */

/** La primera lista de objetos que haya en la respuesta de la plataforma. */
function listaDeObjetos(msg: unknown, nivel = 0): Record<string, unknown>[] {
  if (Array.isArray(msg)) return msg.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  if (msg && typeof msg === "object" && nivel < 3) {
    for (const v of Object.values(msg as Record<string, unknown>)) {
      const l = listaDeObjetos(v, nivel + 1);
      if (l.length) return l;
    }
  }
  return [];
}

const identificacionDe = (o: Record<string, unknown>): string => {
  const v = o.identification ?? o.identificacion ?? o.document ?? o.id_number;
  return v === null || v === undefined ? "" : String(v).trim();
};

/**
 * El nombre de un docente a partir de los campos de texto que parecen nombre o apellido. Los campos exactos de
 * «prepare_professors» no se conocen (la política del Warehouse los descarta y no hay un HAR de ellos): por eso se buscan
 * por el nombre de la clave, sin repetir palabras. Si no hay ninguno, la pantalla lo dice.
 */
function nombreDe(o: Record<string, unknown>): string {
  const claves = Object.keys(o).filter(
    (k) => /name|nombre|apellid|surname/i.test(k) && !/user_?name|file|contract|equip|nick|company|institution|title/i.test(k) && typeof o[k] === "string" && String(o[k]).trim() !== "",
  );
  const apellido = (k: string) => (/last|surname|apellid/i.test(k) ? 1 : 0);
  const palabras: string[] = [];
  for (const k of claves.sort((a, b) => apellido(a) - apellido(b))) {
    for (const p of String(o[k]).trim().split(/\s+/)) if (!palabras.some((x) => x.toLowerCase() === p.toLowerCase())) palabras.push(p);
  }
  return palabras.join(" ").slice(0, 120);
}

/**
 * Los nombres de los docentes cuyos seudónimos pide Gestión Master, leídos del Master en este momento. NO se guardan:
 * ni en wh_filas ni en ninguna tabla; la respuesta va al navegador de quien los pidió y ahí se queda. Antes de leer, la
 * base comprueba que quien llama tiene acceso a Gestión Master y anota la consulta (quién, qué código, cuántos).
 * El seudónimo se calcula con la misma sal y la misma fórmula que usa el Warehouse al guardar (gm_seudonimos_de).
 */
// deno-lint-ignore no-explicit-any
async function docentesDeCodigo(db: any, admin: any, cuerpo: Record<string, unknown>, limite: number): Promise<Response> {
  const sede = String(cuerpo.sede ?? "");
  const periodo = String(cuerpo.periodo ?? "");
  const codigo = String(cuerpo.codigo ?? "").trim().slice(0, 32);
  const pedidos = (Array.isArray(cuerpo.seudonimos) ? cuerpo.seudonimos : []).filter((x): x is string => typeof x === "string" && /^x-[0-9a-f]{10}$/.test(x)).slice(0, 80);
  if (!SEDES[sede] || !periodoValido(periodo) || !codigo || pedidos.length === 0) return json({ error: "Faltan la sede, el periodo, el código o los profesores." }, 400);

  const registro = await db.rpc("gm_registrar_consulta_nombres", { p_periodo: periodo, p_sede: sede, p_codigo: codigo, p_cantidad: pedidos.length });
  if (registro.error) {
    const falta = registro.error.code === "PGRST202" || /gm_registrar_consulta_nombres/.test(registro.error.message);
    return json({ error: falta ? "Falta aplicar la migración 0194 (Gestión Master)." : "No se pudo registrar la consulta." }, 500);
  }
  if (registro.data !== true) return json({ error: "Los nombres de los docentes son solo para quien tiene acceso a Gestión Master." }, 403);

  const reporte = reportePorId("ms_doc");
  if (!reporte) return json({ error: "El reporte de docentes no está en el catálogo." }, 500);
  const sesion = await iniciarSesion(sede, "master", limite, "ms_doc");
  const nombres: Record<string, string> = {};
  let total = 0;
  try {
    const ctx: Contexto = { sede, periodo, abierto: sesion.periodo, corte: "", usuario: ENV("WAREHOUSE_MASTER_USER") };
    const respuesta = await pedirJson(sesion, reporte.armar(ctx), sesion);
    let docentes = listaDeObjetos(respuesta.msg);
    total = docentes.length;
    const ids = docentes.map(identificacionDe);
    const seudonimos = await admin.rpc("gm_seudonimos_de", { p_ids: ids.filter((x: string) => x) });
    if (seudonimos.error) throw new ErrorPlataforma("No se pudieron calcular los seudónimos (¿falta la migración 0194?).");
    const deId = new Map<string, string>((seudonimos.data as { id: string; seudonimo: string }[]).map((r) => [r.id, r.seudonimo]));
    const quiero = new Set(pedidos);
    docentes.forEach((d, i) => {
      const s = deId.get(ids[i]);
      if (s && quiero.has(s) && !nombres[s]) nombres[s] = nombreDe(d);
    });
    docentes = [];
  } finally {
    await cerrarSesion(sesion);
  }
  return json({ ok: true, nombres, total, encontrados: Object.keys(nombres).length });
}

/* --- Entrada ---------------------------------------------------------------------------------------- */

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
  if (!ACCIONES.includes(accion)) return json({ error: "Acción desconocida." }, 400);
  const inicioLlamada = Date.now();
  const breve = inicioLlamada + LIMITE_BREVE_MS;
  const largo = inicioLlamada + LIMITE_LARGO_MS;

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) === anonKey) return json({ error: "Falta la sesión." }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const quien = await admin.auth.getUser(authorization.slice(7));
  if (quien.error || !quien.data.user) return json({ error: "Sesión inválida." }, 401);
  const usuarioId = quien.data.user.id;

  // Todo lo que se escribe va con la sesión de quien llama: la base decide.
  const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  // Los nombres de Gestión Master no piden ser de Planeación: la base comprueba gm_puede('nombres') y anota la consulta.
  if (accion === "docentes") {
    try {
      return await docentesDeCodigo(db, admin, cuerpo, largo);
    } catch (e) {
      return respuestaDeError(e, accion, "ms_doc", String(cuerpo.sede ?? ""));
    }
  }
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
      reportes: REPORTES.map((r) => ({ id: r.id, sistema: r.sistema, entrega: r.entrega, verificado: r.verificado, periodoVia: r.periodoVia, confirma: r.confirma ?? null })),
    });
  }

  // Seguimiento de una tarea: la sede y el reporte salen del pase, no del cuerpo -------------------
  if (accion === "estado_tarea" || accion === "finalizar" || accion === "cancelar") {
    const tarea = (cuerpo.tarea ?? {}) as { id?: unknown; pase?: unknown };
    let pase: PaseDatos | null = null;
    let sesion: Sesion | null = null;
    try {
      pase = await abrirPase(tarea.pase, usuarioId, tarea.id);
      const reporte = reportePorId(pase.conjunto)!;

      if (accion === "cancelar") {
        await cerrarSesion(sesionDePase(pase, breve));
        return json({ ok: true });
      }

      const rutaEstado: Peticion = { metodo: "GET", ruta: `/${pase.sistema}/mod_home/home/task_state/${encodeURIComponent(pase.id)}/` };

      if (accion === "estado_tarea") {
        const r = await conSesionDePase(pase, breve, (s) => pedir(s, rutaEstado, s));
        sesion = r.sesion;
        const e = estadoTarea(r.valor.json);
        const listo = e.listo || r.valor.base64 !== null;
        const nuevoPase = r.renovada ? await sellarPase({ ...pase, t: r.sesion.token, k: r.sesion.apiKey, ab: r.sesion.periodo, e: Date.now() + VIDA_PASE_MS }) : undefined;
        // La sesión sigue viva para el próximo estado o para finalizar: solo se cierra al terminar o cancelar.
        sesion = null;
        return json({ ok: true, estado: e.fallo ? "fallo" : listo ? "listo" : "ejecutando", progreso: e.progreso, nombre: e.nombre, pase: nuevoPase });
      }

      // finalizar
      const modo = cuerpo.modo === "sondear" ? "sondear" : "cargar";
      const r = await conSesionDePase(pase, largo, async (s) => {
        const { json: j, base64 } = await pedir(s, rutaEstado, s);
        const e = estadoTarea(j);
        if (e.fallo) throw new ErrorPlataforma(`La plataforma no pudo generar el reporte «${pase!.conjunto}» en ${SEDES[pase!.sede].nombre}.`);
        // Sin Excel todavía: no es un fallo. El navegador vuelve a finalizar (ver «pendiente» abajo).
        return { bytes: base64 ? base64ABytes(base64) : null, nombre: e.nombre };
      });
      if (!r.valor.bytes) {
        // La sesión sigue viva para el próximo intento: no se cierra aquí (sesion queda null). Si se renovó, va el pase nuevo.
        const nuevoPase = r.renovada ? await sellarPase({ ...pase, t: r.sesion.token, k: r.sesion.apiKey, ab: r.sesion.periodo, e: Date.now() + VIDA_PASE_MS }) : undefined;
        return json({ ok: true, pendiente: true, estado: "ejecutando", pase: nuevoPase });
      }
      sesion = r.sesion;
      const fuente = fuenteDe(reporte, r.valor.bytes);
      return await procesar({
        accion: modo,
        reporte,
        sede: pase.sede,
        periodo: pase.p,
        periodoCtx: pase.p === PERMANENTE ? pase.ab : pase.p,
        abierto: pase.ab,
        corte: pase.corte,
        motivo: String(cuerpo.motivo ?? "").slice(0, 300),
        fuente,
        nombreTarea: r.valor.nombre,
        limite: largo,
        db,
      });
    } catch (e) {
      return respuestaDeError(e, accion, pase?.conjunto, pase?.sede);
    } finally {
      if (sesion) await cerrarSesion(sesion);
    }
  }

  const sede = String(cuerpo.sede ?? "");
  if (!SEDES[sede]) return json({ error: "Sede desconocida." }, 400);

  if (accion === "probar") {
    const periodos: Record<string, string> = {};
    try {
      for (const sistema of SISTEMAS) {
        const s = await iniciarSesion(sede, sistema, breve);
        periodos[sistema] = s.periodo;
        await cerrarSesion(s);
      }
      return json({ ok: true, periodo: periodos.master, periodos });
    } catch (e) {
      const r = respuestaDeError(e, accion, undefined, sede);
      return json({ ...(await r.json()), periodos }, 502);
    }
  }

  if (accion === "periodos") {
    // Las listas de periodos de Master de esta sede: de ahí sale lo que la pantalla ofrece pedir.
    let s: Sesion | null = null;
    try {
      s = await iniciarSesion(sede, "master", breve);
      const abierta = s;
      const leer = async (ruta: string) => {
        try {
          return periodosDeLista((await pedirJson(abierta, { metodo: "GET", ruta }, abierta)).msg);
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
      return respuestaDeError(e, accion, undefined, sede);
    } finally {
      if (s) await cerrarSesion(s);
    }
  }

  // sondear · cargar · (iniciar) --------------------------------------------------------------------
  const conjunto = String(cuerpo.conjunto ?? "");
  const reporte = reportePorId(conjunto);
  if (!reporte) return json({ error: "Este conjunto aún no se pide solo: cárguelo con el Excel descargado." }, 400);
  const corte = String(cuerpo.corte ?? "");
  if (reporte.corte && !CORTES.includes(corte)) return json({ error: "Falta el corte (1, 2, 3 o f)." }, 400);
  const pedido = String(cuerpo.periodo ?? "");
  if (["ruta", "consulta", "cuerpo"].includes(reporte.periodoVia) && !periodoValido(pedido)) return json({ error: "Falta el periodo (por ejemplo 2026b)." }, 400);
  const motivo = String(cuerpo.motivo ?? "").slice(0, 300);
  const modo = accion === "sondear" ? "sondear" : "cargar";
  // Un reporte de tarea nunca espera dentro de la llamada: inicia y devuelve la tarea (con o sin `fase`).
  const limite = reporte.entrega === "tarea" ? breve : largo;

  let sesion: Sesion | null = null;
  let conservarSesion = false;
  try {
    sesion = await iniciarSesion(sede, reporte.sistema, limite, conjunto);
    const abierto = sesion.periodo;
    // Qué periodo se guarda: el pedido si la plataforma deja pedirlo; el abierto si lo fija la sesión (y entonces pedir
    // otro falla: guardar el abierto con la etiqueta de otro periodo sería mentir); «permanente» en los catálogos.
    if (reporte.periodoVia === "sesion" && periodoValido(pedido) && pedido !== abierto) {
      throw new ErrorPlataforma(`Periodo distinto del pedido: este reporte solo se puede traer del periodo abierto (${abierto}), no de ${pedido}. Cambie el periodo o cárguelo con el Excel del periodo que necesita.`);
    }
    const periodo = reporte.periodoVia === "ninguno" ? PERMANENTE : reporte.periodoVia === "sesion" ? abierto : pedido;
    if (reporte.listaPeriodos && periodo !== PERMANENTE) {
      const lista = await listaDePeriodos(sede, reporte.listaPeriodos, limite, sesion);
      if (lista && !lista.includes(periodo)) {
        throw new ErrorPlataforma(`El periodo ${periodo} no está en la lista de ${reporte.listaPeriodos === "aspirantes" ? "aspirantes" : "deserciones"} de ${SEDES[sede].nombre} (${lista.slice(0, 6).join(", ")}…).`);
      }
    }
    const ctx: Contexto = { sede, periodo: periodo === PERMANENTE ? abierto : periodo, abierto, corte: reporte.corte ? corte : "", usuario: ENV("WAREHOUSE_MASTER_USER") };
    const { fuente, tareaId } = await obtenerFuente(reporte, ctx, sesion);

    if (tareaId) {
      // La plataforma empezó una tarea: se devuelve el id y la sesión (en el pase) para que el navegador la siga.
      const pase = await sellarPase({
        t: sesion.token,
        k: sesion.apiKey,
        sistema: sesion.sistema,
        sede,
        ab: abierto,
        conjunto,
        p: periodo,
        corte: reporte.corte ? corte : "",
        id: tareaId,
        u: usuarioId,
        e: Date.now() + VIDA_PASE_MS,
      });
      conservarSesion = true;
      return json({ ok: true, tarea: { id: tareaId, pase, sistema: sesion.sistema, sede, conjunto, periodo, corte: reporte.corte ? corte : "", modo } });
    }
    if (reporte.entrega === "tarea" && !fuente) throw new ErrorPlataforma("La plataforma no inició la tarea del reporte.");

    return await procesar({ accion: modo, reporte, sede, periodo, periodoCtx: ctx.periodo, abierto, corte, motivo, fuente: fuente!, limite, db });
  } catch (e) {
    return respuestaDeError(e, accion, conjunto, sede);
  } finally {
    if (sesion && !conservarSesion) await cerrarSesion(sesion);
  }
});

/** El fallo de una acción como respuesta HTTP: mensaje para la persona y una línea limpia en los registros de la función. */
function respuestaDeError(e: unknown, accion: string, conjunto?: string, sede?: string): Response {
  // Sin datos o Galileo caído: no es un error de la función. Va con ok: true y `neutro`; la pantalla lo muestra aparte.
  if (e instanceof Neutro && ACCIONES_NEUTRAS.includes(accion)) {
    console.log(JSON.stringify({ funcion: "warehouse", accion, conjunto: conjunto ?? null, sede: sede ?? null, neutro: e.tipo }));
    return json({ ok: true, neutro: e.tipo, mensaje: e.message, conjunto: conjunto ?? null, sede: sede ?? null });
  }
  const propio = e instanceof ErrorPlataforma;
  const motivo = extractoSeguro(e instanceof Error ? e.message : e, 200);
  console.error(JSON.stringify({ funcion: "warehouse", accion, conjunto: conjunto ?? null, sede: sede ?? null, tipo: propio ? "plataforma" : e instanceof Error ? e.name : "desconocido", motivo }));
  const donde = [conjunto ? `«${conjunto}»` : "", sede && SEDES[sede] ? `en ${SEDES[sede].nombre}` : ""].filter(Boolean).join(" ");
  const mensaje = propio
    ? (e as Error).message
    : `No se pudo completar ${accion === "cargar" || accion === "finalizar" ? "la carga" : "la acción"}${donde ? ` de ${donde}` : ""}${motivo ? `: ${motivo}` : "."}`;
  return json({ ok: false, error: mensaje }, 502);
}
