/* =============================================================================
   Navegador de Mr. Pilo · el servicio.

   Un servidor HTTP pequeño con dos rutas:

     GET  /salud   → { ok, ocupado, esperando }. Sin datos sensibles.
     POST /leer    → Authorization: Bearer <clave>, cuerpo { url, clics? }.
                     Devuelve { url, title, html, clicks: [{ what, ok }], cut, ms }.

   La clave viene de la variable NAVEGADOR_CLAVE: sin ella (o con una corta)
   el servicio NO arranca. Atiende un pedido a la vez, con una cola corta en
   memoria. El registro dice la hora, el sitio, el resultado y cuánto tardó:
   nunca el contenido leído, ni la clave, ni la consulta de la dirección.

   `crearServicio` no abre ningún puerto ni navegador por sí solo: así se
   prueba sin red. Al correr este archivo (`node src/servidor.js`), arranca.
   ========================================================================== */

import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { Ocupado, crearCola } from "./cola.js";

const CLAVE_MIN = 24;
const CUERPO_MAX = 4_096;

/** Lo que el servicio lee del entorno. Lanza si falta la clave: sin clave no hay servicio. */
export function configuracion(env = process.env) {
  const clave = String(env.NAVEGADOR_CLAVE ?? "").trim();
  if (!clave) throw new Error("Falta NAVEGADOR_CLAVE: el servicio no arranca sin clave.");
  if (clave.length < CLAVE_MIN) throw new Error(`NAVEGADOR_CLAVE debe tener al menos ${CLAVE_MIN} caracteres.`);
  const numero = (name, fallback, min, max) => {
    const n = Number(env[name]);
    return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
  };
  return {
    clave,
    puerto: numero("PORT", numero("NAVEGADOR_PUERTO", 8787, 1, 65535), 1, 65535),
    cola: numero("NAVEGADOR_COLA", 3, 0, 20),
    msTotal: numero("NAVEGADOR_MS", 45_000, 10_000, 120_000),
    maxHtml: numero("NAVEGADOR_MAX_HTML", 2_000_000, 50_000, 2_400_000),
    msInactivo: numero("NAVEGADOR_INACTIVO_MS", 120_000, 5_000, 3_600_000),
    robots: String(env.NAVEGADOR_ROBOTS ?? "si").toLowerCase() !== "no",
    agente: String(env.NAVEGADOR_AGENTE ?? "").trim().slice(0, 200),
  };
}

/** ¿La cabecera Authorization trae la clave? Se compara sin dar pistas por el tiempo. */
export function claveValida(header, clave) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header ?? "").trim());
  if (!m || !clave) return false;
  const a = createHash("sha256").update(m[1].trim()).digest();
  const b = createHash("sha256").update(String(clave)).digest();
  return timingSafeEqual(a, b);
}

/** El sitio de una dirección, para el registro: sin ruta ni consulta. */
const sitio = (url) => {
  try {
    return new URL(String(url)).host.slice(0, 80);
  } catch {
    return "?";
  }
};

/**
 * El manejador HTTP. `lector` es lo que abre páginas ({ leer(url, { clics }) });
 * `registro`, a dónde va una línea por pedido.
 */
export function crearServicio({ config, lector, registro = (line) => console.log(line) }) {
  const cola = crearCola(config.cola);
  const responder = (res, status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(text);
  };
  const cuerpo = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        // Pasado el tope no se guarda más; se responde y ahí se corta la conexión.
        if (size > CUERPO_MAX) reject(new Error("grande"));
        else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });

  return async function atender(req, res) {
    const path = String(req.url ?? "").split("?")[0].replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/salud") return responder(res, 200, { ok: true, ocupado: cola.ocupada, esperando: cola.esperando });
    if (path !== "/leer") return responder(res, 404, { error: "No existe.", code: "ruta" });
    if (req.method !== "POST") return responder(res, 405, { error: "Use POST.", code: "metodo" });
    if (!claveValida(req.headers.authorization, config.clave)) return responder(res, 401, { error: "Clave no válida.", code: "clave" });

    let pedido = null;
    try {
      pedido = JSON.parse(await cuerpo(req));
    } catch (error) {
      if (error?.message === "grande") {
        res.on("finish", () => req.destroy());
        return responder(res, 413, { error: "El cuerpo del pedido es demasiado grande.", code: "cuerpo" });
      }
      return responder(res, 400, { error: "El cuerpo debe ser JSON: { url, clics? }.", code: "cuerpo" });
    }
    const url = pedido && typeof pedido === "object" ? pedido.url : null;
    if (typeof url !== "string" || !url.trim()) return responder(res, 400, { error: "Falta la dirección de la página.", code: "direccion" });
    const started = Date.now();
    const anotar = (what) => registro(`${new Date().toISOString()} leer ${sitio(url)} · ${what} · ${Date.now() - started} ms`);
    try {
      const result = await cola.correr(() => lector.leer(url, { clics: pedido.clics !== false }));
      anotar(`listo, ${result.clicks.filter((c) => c.ok).length}/${result.clicks.length} clics${result.cut ? ", cortado" : ""}`);
      return responder(res, 200, result);
    } catch (error) {
      if (error instanceof Ocupado) {
        anotar("ocupado");
        return responder(res, 429, { error: error.message, code: "ocupado" });
      }
      const code = typeof error?.code === "string" ? error.code : "pagina";
      const status = Number.isInteger(error?.status) ? error.status : 502;
      anotar(`no: ${code}`);
      // Solo los mensajes propios salen: nada de lo que diga el navegador por dentro.
      return responder(res, status, { error: error?.name === "Error" && typeof error?.status === "number" ? error.message : "No se pudo leer la página.", code });
    }
  };
}

/** Arranca de verdad: lee el entorno, abre el puerto y deja listo el lector. */
export async function arrancar(env = process.env) {
  const config = configuracion(env);
  const { crearLector } = await import("./leer.js");
  const lector = crearLector(config);
  const server = http.createServer(crearServicio({ config, lector }));
  server.requestTimeout = config.msTotal + 60_000;
  server.headersTimeout = 15_000;
  const salir = async () => {
    server.close();
    await lector.cerrar();
    process.exit(0);
  };
  process.on("SIGTERM", salir);
  process.on("SIGINT", salir);
  await new Promise((resolve) => server.listen(config.puerto, resolve));
  console.log(`${new Date().toISOString()} navegador de Mr. Pilo escuchando en el puerto ${config.puerto}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  arrancar().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exit(1);
  });
}
