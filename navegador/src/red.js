/* =============================================================================
   Navegador de Mr. Pilo · a dónde se puede ir.

   El servicio abre direcciones que le llegan de fuera: sin cuidado, serviría
   para alcanzar lo que solo se ve desde su propia red (SSRF). Tres defensas,
   una encima de otra:

     1. direccionPublica(url): solo http/https, con nombre de dominio público
        y puerto de web. Nunca una IP (escrita como sea), localhost ni un
        nombre de red interna. Se revisa antes de abrir y en la dirección final.
     2. busquedaSegura: la resolución de nombres. Si un nombre público resuelve
        a una dirección privada, local o reservada, no se conecta. La conexión
        se hace a la dirección que se revisó, no a otra (sin «DNS rebinding»).
     3. crearProxy(): TODO el tráfico del navegador sale por un proxy propio,
        dentro de este proceso, que aplica 1 y 2 a cada conexión: la página,
        cada redirección, cada marco y cada subpetición. El navegador no tiene
        otra salida.

   Sin dependencias.
   ========================================================================== */

import dns from "node:dns";
import http from "node:http";
import net from "node:net";

const NOMBRE_PUBLICO = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}|xn--[a-z0-9-]{2,59})$/;
const NOMBRE_INTERNO = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa|nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me)$/;
const PUERTOS = new Set(["", "80", "443"]);

/** ¿Esa dirección IP es de una red privada, local o reservada? Lo que no se entiende cuenta como privado. */
export function direccionPrivada(ip) {
  const text = String(ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!text.includes(":") || !/^[0-9a-f:.]+$/.test(text)) return true;
  // Una IPv4 dentro de una IPv6 (::ffff:10.0.0.1, 64:ff9b::…): no se usa para un sitio público.
  if (text.includes(".") || /^::ffff:/.test(text) || /^64:ff9b:/.test(text)) return true;
  const head = parseInt(text.split(":")[0] || "0", 16);
  // ::/16, fc00::/7 (privadas), fe80::/10 (de enlace), ff00::/8 (multidifusión), 2001:db8::/32 (documentación).
  return head === 0 || (head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80 || (head & 0xff00) === 0xff00 || /^2001:0?db8:/.test(text);
}

/** ¿Ese nombre es de un sitio público? Ni IP, ni localhost, ni nombres de red interna. */
export function nombrePublico(host) {
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "");
  if (!h || h.startsWith("[") || h.includes(":")) return false;
  return NOMBRE_PUBLICO.test(h) && !NOMBRE_INTERNO.test(h);
}

/** La dirección de una página que el navegador puede abrir, o por qué no. */
export function direccionPublica(raw) {
  const no = (reason) => ({ ok: false, reason });
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return no("Falta la dirección de la página.");
  if (text.length > 2000 || /[\s\\]/.test(text)) return no("La dirección de la página no es válida.");
  let u;
  try {
    u = new URL(text);
  } catch {
    return no("La dirección de la página no es válida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return no("Solo se abren direcciones http o https.");
  if (u.username || u.password) return no("La dirección no puede llevar usuario.");
  if (!PUERTOS.has(u.port)) return no("La dirección no puede llevar un puerto distinto de 80 o 443.");
  if (!nombrePublico(u.hostname)) return no("La dirección debe ser de un sitio público: no una dirección IP ni un nombre de red interna.");
  u.hash = "";
  return { ok: true, url: u.toString(), host: u.hostname.toLowerCase().replace(/\.$/, ""), origin: u.origin };
}

/**
 * Una resolución de nombres que se niega a entregar direcciones privadas.
 * Tiene la forma de `dns.lookup`, para dársela a net.connect o a https.get:
 * así la conexión va a la dirección que aquí se revisó. `resolver` se puede
 * cambiar en las pruebas.
 */
export function crearBusqueda(resolver = dns.lookup) {
  return function busquedaSegura(hostname, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "object" && options ? options : {};
    const fail = (message) => cb(Object.assign(new Error(message), { code: "EPILOSSRF" }));
    if (!nombrePublico(hostname)) return fail("nombre no permitido");
    resolver(hostname, { all: true, family: opts.family ?? 0 }, (error, found) => {
      if (error) return cb(error);
      const list = (Array.isArray(found) ? found : [{ address: found, family: 4 }]).filter((a) => a && a.address);
      // Con una sola dirección privada entre varias, tampoco: no se sabe a cuál se conectaría.
      if (!list.length || list.some((a) => direccionPrivada(a.address))) return fail("el nombre resuelve a una red interna");
      if (opts.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

export const busquedaSegura = crearBusqueda();

/**
 * El proxy por el que sale el navegador. Escucha solo en esta máquina, en un
 * puerto libre, y por cada conexión revisa el destino: nombre público, puerto
 * 80 o 443 y direcciones públicas. Atiende CONNECT (https, ws seguro) y http
 * sin cifrar. No guarda ni registra nada de lo que pasa por él.
 */
export function crearProxy({ busqueda = busquedaSegura, conectar = net.connect } = {}) {
  const abiertas = new Set();
  const seguir = (socket) => {
    abiertas.add(socket);
    socket.on("close", () => abiertas.delete(socket));
    socket.on("error", () => socket.destroy());
  };
  const destino = (host, port) => {
    const p = String(port || "");
    if (!nombrePublico(host) || !(p === "80" || p === "443")) return null;
    return { host: String(host).toLowerCase(), port: Number(p) };
  };

  const server = http.createServer((req, res) => {
    // http sin cifrar: la dirección llega entera.
    let u;
    try {
      u = new URL(req.url ?? "");
    } catch {
      u = null;
    }
    const to = u && u.protocol === "http:" ? destino(u.hostname, u.port || "80") : null;
    if (!to) {
      res.writeHead(403, { "content-type": "text/plain" });
      return res.end("Destino no permitido.");
    }
    const headers = { ...req.headers, host: u.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const out = http.request({ host: to.host, port: to.port, method: req.method, path: `${u.pathname}${u.search}`, headers, lookup: busqueda }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    out.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("No se pudo conectar.");
    });
    req.pipe(out);
  });

  server.on("connection", seguir);
  server.on("connect", (req, client, head) => {
    const [host, port] = String(req.url ?? "").split(/:(?=\d+$)/);
    const to = destino(host, port);
    if (!to) {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = conectar({ host: to.host, port: to.port, lookup: busqueda });
    seguir(upstream);
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once("error", () => {
      if (client.writable) client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
  });
  server.on("clientError", (_error, socket) => socket.destroy());

  return {
    /** Arranca y dice su dirección («http://127.0.0.1:puerto»). */
    abrir: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
      }),
    cerrar: () =>
      new Promise((resolve) => {
        for (const s of abiertas) s.destroy();
        server.close(() => resolve());
      }),
  };
}
