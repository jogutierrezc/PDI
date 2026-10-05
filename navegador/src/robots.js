/* =============================================================================
   Navegador de Mr. Pilo · robots.txt.

   Antes de abrir una página se lee el robots.txt de su sitio y se respeta lo
   que diga para este agente («MrPiloBot») o, si no lo nombra, para todos («*»).
   Como pide la norma (RFC 9309): sin archivo (4xx), todo permitido; si el
   sitio no responde o falla (5xx), nada permitido. Gana la regla más larga, y
   entre iguales, la que permite.

   `robotsPermite` es pura. `leerRobots` lo trae por la red con la resolución
   segura de red.js y sin seguir redirecciones a ciegas.
   ========================================================================== */

import http from "node:http";
import https from "node:https";
import { busquedaSegura, direccionPublica } from "./red.js";

export const AGENTE = "MrPiloBot";
const MAX_ROBOTS = 500_000;

/** Los grupos de un robots.txt: [{ agentes: [...], reglas: [{ permite, ruta }] }]. */
function grupos(txt) {
  const out = [];
  let grupo = null;
  let enAgentes = false;
  for (const raw of String(txt ?? "").split(/\r?\n|\r/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === "user-agent") {
      if (!grupo || !enAgentes) {
        grupo = { agentes: [], reglas: [] };
        out.push(grupo);
      }
      grupo.agentes.push(valor.toLowerCase());
      enAgentes = true;
    } else if (campo === "allow" || campo === "disallow") {
      enAgentes = false;
      if (grupo && valor !== "") grupo.reglas.push({ permite: campo === "allow", ruta: valor });
      // «Disallow:» vacío no prohíbe nada: no hace falta anotarlo.
    }
    // Sitemap, crawl-delay y demás no cierran la lista de agentes de un grupo.
  }
  return out;
}

/** La ruta de una regla como expresión: «*» es cualquier cosa y «$» al final, el fin de la dirección. */
function patron(ruta) {
  const fin = ruta.endsWith("$");
  const cuerpo = (fin ? ruta.slice(0, -1) : ruta)
    .split("*")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${cuerpo}${fin ? "$" : ""}`);
}

/**
 * ¿Puede `agente` leer `ruta` (con su consulta) según este robots.txt?
 * Vale el grupo que nombra al agente; si ninguno, el de «*»; si tampoco, sí.
 */
export function robotsPermite(txt, ruta, agente = AGENTE) {
  const yo = String(agente).toLowerCase();
  const todos = grupos(txt);
  const propios = todos.filter((g) => g.agentes.some((a) => a !== "*" && a !== "" && yo.includes(a)));
  const usar = propios.length ? propios : todos.filter((g) => g.agentes.includes("*"));
  const path = String(ruta || "/");
  let mejor = null;
  for (const g of usar) {
    for (const r of g.reglas) {
      if (!patron(r.ruta).test(path)) continue;
      const peso = r.ruta.length;
      if (!mejor || peso > mejor.peso || (peso === mejor.peso && r.permite)) mejor = { peso, permite: r.permite };
    }
  }
  return mejor ? mejor.permite : true;
}

/** Trae un texto corto por http(s), con la resolución segura y sin redirecciones. */
function traer(url, { ms, agente }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(u, { lookup: busquedaSegura, timeout: ms, headers: { "User-Agent": agente, Accept: "text/plain,*/*;q=0.1" } }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size <= MAX_ROBOTS) chunks.push(c);
        else res.destroy();
      });
      res.on("close", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? "", text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("tiempo")));
    req.on("error", reject);
  });
}

/**
 * El robots.txt del sitio de `url`, y si deja leer esa página.
 * Devuelve { permite, por }: «por» dice de dónde sale la respuesta.
 */
export async function leerRobots(url, { ms = 6000, agente = `${AGENTE}/1.0`, pedir = traer } = {}) {
  const page = new URL(url);
  let at = `${page.origin}/robots.txt`;
  try {
    for (let salto = 0; salto < 4; salto++) {
      const r = await pedir(at, { ms, agente });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        // Cada salto se revisa como la primera dirección.
        const next = direccionPublica(new URL(r.location, at).toString());
        if (!next.ok) return { permite: false, por: "robots.txt redirige a una dirección no permitida" };
        at = next.url;
        continue;
      }
      if (r.status >= 200 && r.status < 300) {
        const permite = robotsPermite(r.text, `${page.pathname}${page.search}`, agente);
        return { permite, por: permite ? "robots.txt lo permite" : "robots.txt no lo permite" };
      }
      if (r.status >= 400 && r.status < 500) return { permite: true, por: "el sitio no tiene robots.txt" };
      return { permite: false, por: `robots.txt respondió ${r.status}` };
    }
    return { permite: false, por: "robots.txt redirige demasiadas veces" };
  } catch {
    return { permite: false, por: "no se pudo leer robots.txt" };
  }
}
