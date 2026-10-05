/* =============================================================================
   Navegador de Mr. Pilo · abrir una página y leerla.

   Abre la página en Chromium (Playwright), espera a que su JavaScript la arme,
   la lee, y —si se pide— pulsa lo que despliega contenido (clics.js decide
   qué), leyendo de nuevo después de cada clic. Devuelve un HTML sencillo con
   todo lo leído (bloques.js).

   Cuidados:
     · un contexto de navegador nuevo por pedido: sin cookies, sin memoria,
       sin permisos, sin descargas; se cierra al terminar, pase lo que pase;
     · todo el tráfico sale por el proxy de red.js, que no deja ir a redes
       internas ni en redirecciones ni en subpeticiones;
     · mientras se pulsa, la página no puede irse a otra dirección: la
       navegación se corta, y si aun así cambió (una aplicación de una sola
       página), se vuelve atrás y el clic se anota como fallido;
     · las ventanas nuevas se cierran y los diálogos se descartan;
     · nada de lo leído se escribe en disco ni en el registro.

   Este archivo es el único que necesita Playwright: se importa al abrir el
   primer navegador, no antes.
   ========================================================================== */

import { armarHtml, fusionar } from "./bloques.js";
import { TOPES, clasificar, parar, rotulo, vecesDe } from "./clics.js";
import { controles, leerBloques } from "./en-pagina.js";
import { crearProxy, direccionPublica } from "./red.js";
import { AGENTE, leerRobots } from "./robots.js";

export class Rechazo extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const sinAncla = (url) => String(url).replace(/#.*$/, "");

/**
 * El lector: guarda un navegador abierto (se cierra solo tras un rato sin
 * uso) y el proxy. `config`: { agente, maxHtml, msTotal, msInactivo, robots }.
 */
export function crearLector(config = {}) {
  const agente = config.agente || `Mozilla/5.0 (compatible; ${AGENTE}/1.0; lector de páginas de la Universidad de Santander)`;
  const maxHtml = config.maxHtml ?? 2_000_000;
  const msTotal = config.msTotal ?? 45_000;
  const msInactivo = config.msInactivo ?? 120_000;
  const respetarRobots = config.robots !== false;
  let browser = null;
  let proxy = null;
  let proxyUrl = "";
  let reloj = null;

  async function navegador() {
    if (browser && browser.isConnected()) return browser;
    const { chromium } = await import("playwright");
    if (!proxy) {
      proxy = crearProxy();
      proxyUrl = await proxy.abrir();
    }
    browser = await chromium.launch({
      headless: true,
      proxy: { server: proxyUrl },
      // «<-loopback>»: ni siquiera localhost se salta el proxy (que lo rechaza).
      args: ["--proxy-bypass-list=<-loopback>", "--disable-dev-shm-usage", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-sync", "--mute-audio"],
    });
    return browser;
  }

  async function cerrar() {
    clearTimeout(reloj);
    const b = browser;
    const p = proxy;
    browser = null;
    proxy = null;
    proxyUrl = "";
    if (b) await b.close().catch(() => undefined);
    if (p) await p.cerrar().catch(() => undefined);
  }

  /** Abre `url`, la lee y devuelve { url, title, html, clicks, cut, ms }. Lanza Rechazo si no se puede. */
  async function leer(url, { clics = true } = {}) {
    const started = Date.now();
    clearTimeout(reloj);
    const asked = direccionPublica(url);
    if (!asked.ok) throw new Rechazo("direccion", asked.reason, 400);
    if (respetarRobots) {
      const robots = await leerRobots(asked.url, { agente: `${AGENTE}/1.0` });
      if (!robots.permite) throw new Rechazo("robots", `El sitio no deja entrar a ${AGENTE}: ${robots.por}.`, 403);
    }
    const left = () => msTotal - (Date.now() - started);
    let context = null;
    try {
      const b = await navegador();
      context = await b.newContext({
        userAgent: agente,
        acceptDownloads: false,
        javaScriptEnabled: true,
        serviceWorkers: "block",
        permissions: [],
        locale: "es-CO",
        viewport: { width: 1280, height: 900 },
      });
      context.setDefaultTimeout(5_000);
      const page = await context.newPage();
      let pulsando = false;
      let quisoSalir = false;
      // Las ventanas nuevas no se leen: se cierran.
      context.on("page", (other) => {
        if (other !== page) other.close().catch(() => undefined);
      });
      page.on("dialog", (d) => d.dismiss().catch(() => undefined));
      page.on("download", (d) => d.cancel().catch(() => undefined));
      // Segunda defensa (la primera es el proxy): ningún pedido a un nombre que no sea público, y, mientras
      // se pulsa, ninguna navegación del documento principal.
      await context.route("**/*", (route) => {
        const request = route.request();
        let target = null;
        try {
          target = new URL(request.url());
        } catch {
          target = null;
        }
        if (!target) return route.abort("blockedbyclient");
        if (target.protocol === "http:" || target.protocol === "https:") {
          if (!direccionPublica(target.toString()).ok) return route.abort("blockedbyclient");
        } else if (target.protocol !== "data:" && target.protocol !== "blob:" && target.protocol !== "about:") {
          return route.abort("blockedbyclient");
        }
        if (pulsando && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          quisoSalir = true;
          return route.abort("aborted");
        }
        return route.continue();
      });

      const response = await page.goto(asked.url, { waitUntil: "domcontentloaded", timeout: Math.max(1_000, Math.min(20_000, left())) }).catch((error) => {
        throw new Rechazo(/timeout/i.test(String(error?.message)) ? "tiempo" : "pagina", "No se pudo abrir la página.", /timeout/i.test(String(error?.message)) ? 504 : 502);
      });
      if (!response) throw new Rechazo("pagina", "La página no respondió.", 502);
      if (response.status() >= 400) throw new Rechazo("pagina", `La página respondió ${response.status()}.`, 502);
      const type = String(response.headers()["content-type"] ?? "").toLowerCase();
      if (type && !/text\/html|application\/xhtml/.test(type)) throw new Rechazo("pagina", "Esa dirección no es una página web (no devuelve HTML).", 415);
      // La dirección en la que quedó (tras redirecciones) se revisa como la que se pidió.
      const landed = direccionPublica(page.url());
      if (!landed.ok) throw new Rechazo("direccion", "La página redirige a una dirección que no se puede abrir.", 400);

      // Que el JavaScript arme la página: red quieta, o lo que alcance.
      await page.waitForLoadState("networkidle", { timeout: Math.max(500, Math.min(8_000, left() - 15_000)) }).catch(() => undefined);
      // Un paseo hasta abajo y de vuelta despierta lo que carga al asomarse.
      await page.evaluate(() => window.scrollTo(0, document.body ? document.body.scrollHeight : 0)).catch(() => undefined);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

      let read = await page.evaluate(leerBloques);
      let title = read.title;
      let blocks = fusionar([], read.blocks).blocks;
      const inicio = read.chars;
      let chars = read.chars;
      const clicks = [];
      const home = sinAncla(page.url());

      if (clics) {
        const veces = new Map();
        const since = Date.now();
        let secos = 0;
        for (;;) {
          const msClics = Date.now() - since;
          if (parar({ clics: clicks.length, ms: msClics, inicio, chars, secos }) || left() < 6_000) break;
          const found = await page.evaluate(controles).catch(() => []);
          const next = found
            .map((d) => ({ d, verdict: clasificar(d, { url: home }) }))
            .find(({ d, verdict }) => verdict.ok && (veces.get(d.key) ?? 0) < vecesDe(verdict.kind, d.text));
          if (!next) break;
          const { d, verdict } = next;
          veces.set(d.key, (veces.get(d.key) ?? 0) + 1);
          let ok = false;
          pulsando = true;
          quisoSalir = false;
          try {
            await page.locator(`[data-pilo-nav="${d.key}"]`).first().click({ timeout: 1_500, noWaitAfter: true });
            await page.waitForTimeout(350);
            await page.waitForLoadState("networkidle", { timeout: 1_500 }).catch(() => undefined);
            ok = true;
          } catch {
            ok = false;
          }
          pulsando = false;
          // ¿Se fue a otra dirección? Se vuelve y el clic no cuenta.
          if (quisoSalir || sinAncla(page.url()) !== home) {
            ok = false;
            if (sinAncla(page.url()) !== home) {
              await page.goBack({ waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => undefined);
              if (sinAncla(page.url()) !== home) {
                clicks.push({ what: rotulo(verdict.kind, d.text), ok: false });
                break;
              }
              await page.waitForTimeout(300);
            }
          }
          if (ok) {
            read = await page.evaluate(leerBloques).catch(() => null);
            if (read) {
              const merged = fusionar(blocks, read.blocks);
              blocks = merged.blocks;
              chars += merged.added;
              secos = merged.added > 0 ? 0 : secos + 1;
              // Un «cargar más» que ya no trae nada no se vuelve a pulsar.
              if (merged.added === 0) veces.set(d.key, TOPES.repite);
              if (!title) title = read.title;
            }
          } else secos += 1;
          clicks.push({ what: rotulo(verdict.kind, d.text), ok });
        }
      }

      const built = armarHtml(title, blocks, maxHtml);
      return { url: landed.url, title, html: built.html, clicks, cut: built.cut, ms: Date.now() - started };
    } catch (error) {
      if (error instanceof Rechazo) throw error;
      const slow = /timeout/i.test(String(error?.message ?? ""));
      throw new Rechazo(slow ? "tiempo" : "pagina", slow ? "La página tardó demasiado." : "No se pudo leer la página.", slow ? 504 : 502);
    } finally {
      if (context) await context.close().catch(() => undefined);
      // Sin pedidos por un rato, el navegador se cierra: no queda gastando memoria.
      reloj = setTimeout(() => void cerrar(), msInactivo);
      if (typeof reloj.unref === "function") reloj.unref();
    }
  }

  /** Lee con un plazo total: pasado, se cierra el navegador entero (lo que hubiera abierto no queda vivo). */
  async function leerConPlazo(url, opciones) {
    let alarma = null;
    const plazo = new Promise((_, reject) => {
      alarma = setTimeout(() => {
        void cerrar();
        reject(new Rechazo("tiempo", "La página tardó demasiado.", 504));
      }, msTotal + 3_000);
    });
    try {
      return await Promise.race([leer(url, opciones), plazo]);
    } finally {
      clearTimeout(alarma);
    }
  }

  return { leer: leerConPlazo, cerrar };
}
