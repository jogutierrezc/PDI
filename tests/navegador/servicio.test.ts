/* =============================================================================
   Navegador de Mr. Pilo · el servicio HTTP (navegador/src/servidor.js), la
   cola (cola.js) y el armado del HTML que devuelve (bloques.js).

   Sin Chromium: el lector se finge. Lo que aquí se comprueba es lo que rodea
   al navegador: que sin clave no arranca ni responde, que atiende de a uno,
   que no registra lo leído y que el HTML devuelto es el que la función
   pilo-ia sabe volver pasajes.
   ========================================================================== */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { webPassages } from "../../src/components/pilo/ai/logic";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { armarHtml, fusionar, sinRepetidos } from "../../navegador/src/bloques.js";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { Ocupado, crearCola } from "../../navegador/src/cola.js";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { claveValida, configuracion, crearServicio } from "../../navegador/src/servidor.js";

const CLAVE = "una-clave-larga-de-prueba-0123456789";

describe("la configuración", () => {
  it("sin clave, o con una corta, el servicio no arranca", () => {
    expect(() => configuracion({})).toThrow(/NAVEGADOR_CLAVE/);
    expect(() => configuracion({ NAVEGADOR_CLAVE: "   " })).toThrow(/no arranca sin clave/);
    expect(() => configuracion({ NAVEGADOR_CLAVE: "corta" })).toThrow(/al menos 24/);
  });

  it("lo demás tiene valores de partida y topes", () => {
    expect(configuracion({ NAVEGADOR_CLAVE: CLAVE })).toMatchObject({ clave: CLAVE, puerto: 8787, cola: 3, msTotal: 45_000, maxHtml: 2_000_000, robots: true });
    expect(configuracion({ NAVEGADOR_CLAVE: CLAVE, PORT: "9000", NAVEGADOR_COLA: "0", NAVEGADOR_MS: "999999999", NAVEGADOR_MAX_HTML: "x", NAVEGADOR_ROBOTS: "no" })).toMatchObject({ puerto: 9000, cola: 0, msTotal: 45_000, maxHtml: 2_000_000, robots: false });
  });

  it("la clave se pide entera y como Bearer", () => {
    expect(claveValida(`Bearer ${CLAVE}`, CLAVE)).toBe(true);
    expect(claveValida(`bearer   ${CLAVE} `, CLAVE)).toBe(true);
    for (const bad of [undefined, "", CLAVE, `Basic ${CLAVE}`, `Bearer ${CLAVE}x`, `Bearer ${CLAVE.slice(0, -1)}`, "Bearer ", "Bearer undefined"]) expect(claveValida(bad, CLAVE), String(bad)).toBe(false);
    expect(claveValida("Bearer ", "")).toBe(false);
  });
});

describe("la cola", () => {
  it("corre de a uno, en orden, y rechaza cuando no hay puesto", async () => {
    const cola = crearCola(1);
    const order: string[] = [];
    let release: () => void = () => undefined;
    const first = cola.correr(() => new Promise<string>((resolve) => (release = () => (order.push("a"), resolve("a")))));
    const second = cola.correr(async () => (order.push("b"), "b"));
    expect(cola.ocupada).toBe(true);
    expect(cola.esperando).toBe(1);
    await expect(cola.correr(async () => "c")).rejects.toBeInstanceOf(Ocupado);
    release();
    expect(await first).toBe("a");
    expect(await second).toBe("b");
    expect(order).toEqual(["a", "b"]);
    expect(cola.ocupada).toBe(false);
    // Un trabajo que falla no tranca la cola.
    await expect(cola.correr(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await cola.correr(async () => "d")).toBe("d");
  });

  it("sin puestos de espera, el segundo pedido se rechaza de una", async () => {
    const cola = crearCola(0);
    let release: () => void = () => undefined;
    const first = cola.correr(() => new Promise<void>((resolve) => (release = resolve)));
    await expect(cola.correr(async () => 1)).rejects.toMatchObject({ code: "ocupado" });
    release();
    await first;
  });
});

describe("el servicio", () => {
  const SECRET = "CONTENIDO-LEIDO-QUE-NO-DEBE-REGISTRARSE";
  let server: http.Server | null = null;
  const lines: string[] = [];
  const asked: { url: string; clics: boolean }[] = [];

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    lines.length = 0;
    asked.length = 0;
  });

  async function start(leer: (url: string, o: { clics: boolean }) => Promise<unknown>, cola = 3) {
    const config = { ...configuracion({ NAVEGADOR_CLAVE: CLAVE }), cola };
    const lector = { leer: (url: string, o: { clics: boolean }) => (asked.push({ url, clics: o.clics }), leer(url, o)) };
    server = http.createServer(crearServicio({ config, lector, registro: (line: string) => void lines.push(line) }));
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(`${base}${path}`, init);
      return { status: r.status, body: (await r.json()) as Record<string, unknown> };
    };
    const leerPagina = (body: unknown, key: string | null = CLAVE) =>
      call("/leer", { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
    return { call, leerPagina };
  }

  const ok = async (url: string) => ({ url, title: "Admisiones", html: `<main><p>${SECRET}</p></main>`, clicks: [{ what: "pestaña · Posgrado", ok: true }, { what: "ver más · Ver más", ok: false }], cut: false, ms: 12 });

  it("/salud responde sin clave y sin datos sensibles", async () => {
    const { call } = await start(ok);
    const r = await call("/salud");
    expect(r).toEqual({ status: 200, body: { ok: true, ocupado: false, esperando: 0 } });
    expect(JSON.stringify(r.body)).not.toContain(CLAVE);
  });

  it("/leer exige la clave: sin ella no se abre nada", async () => {
    const { leerPagina, call } = await start(ok);
    expect(await leerPagina({ url: "https://www.udes.edu.co/" }, null)).toMatchObject({ status: 401, body: { code: "clave" } });
    expect(await leerPagina({ url: "https://www.udes.edu.co/" }, "otra-clave-larga-de-prueba-000000")).toMatchObject({ status: 401 });
    expect(await call("/leer")).toMatchObject({ status: 405 });
    expect(await call("/otra")).toMatchObject({ status: 404 });
    expect(asked).toEqual([]);
  });

  it("con la clave, lee y devuelve lo que armó el lector; el registro no lleva lo leído, ni la ruta, ni la clave", async () => {
    const { leerPagina } = await start(ok);
    const r = await leerPagina({ url: "https://www.udes.edu.co/admisiones/secretaria?token=abc123" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ title: "Admisiones", cut: false, clicks: [{ what: "pestaña · Posgrado", ok: true }, { what: "ver más · Ver más", ok: false }] });
    expect(String(r.body.html)).toContain(SECRET);
    expect(asked).toEqual([{ url: "https://www.udes.edu.co/admisiones/secretaria?token=abc123", clics: true }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/leer www\.udes\.edu\.co · listo, 1\/2 clics · \d+ ms$/);
    for (const hidden of [SECRET, CLAVE, "secretaria", "abc123", "Posgrado", "Admisiones"]) expect(lines[0]).not.toContain(hidden);
  });

  it("«clics: false» llega al lector; un cuerpo que no sirve se rechaza", async () => {
    const { leerPagina } = await start(ok);
    await leerPagina({ url: "https://www.udes.edu.co/", clics: false });
    expect(asked).toEqual([{ url: "https://www.udes.edu.co/", clics: false }]);
    expect(await leerPagina("no es json")).toMatchObject({ status: 400, body: { code: "cuerpo" } });
    expect(await leerPagina({})).toMatchObject({ status: 400, body: { code: "direccion" } });
    expect(await leerPagina({ url: 42 })).toMatchObject({ status: 400, body: { code: "direccion" } });
    expect(await leerPagina({ url: "https://x.co/", relleno: "x".repeat(10_000) })).toMatchObject({ status: 413, body: { code: "cuerpo" } });
    expect(asked).toHaveLength(1);
  });

  it("un rechazo del lector sale con su código; un error cualquiera no cuenta lo que pasó por dentro", async () => {
    const { leerPagina } = await start(async (url) => {
      if (url.includes("robots")) throw Object.assign(new Error("El sitio no deja entrar a MrPiloBot: robots.txt no lo permite."), { code: "robots", status: 403 });
      throw new Error(`fallo interno con ${SECRET} en /tmp/x`);
    });
    expect(await leerPagina({ url: "https://www.udes.edu.co/robots-no" })).toMatchObject({ status: 403, body: { code: "robots", error: expect.stringMatching(/MrPiloBot/) } });
    const r = await leerPagina({ url: "https://www.udes.edu.co/" });
    expect(r).toMatchObject({ status: 502, body: { code: "pagina", error: "No se pudo leer la página." } });
    expect(JSON.stringify(r.body) + lines.join("\n")).not.toContain(SECRET);
  });

  it("atiende un pedido a la vez y, con la cola llena, responde 429", async () => {
    let release: () => void = () => undefined;
    let running = 0;
    let peak = 0;
    const { leerPagina, call } = await start(async (url) => {
      running += 1;
      peak = Math.max(peak, running);
      if (url.endsWith("/lenta")) await new Promise<void>((resolve) => (release = resolve));
      running -= 1;
      return ok(url);
    }, 1);
    const slow = leerPagina({ url: "https://www.udes.edu.co/lenta" });
    await expect.poll(async () => (await call("/salud")).body.ocupado).toBe(true);
    const waiting = leerPagina({ url: "https://www.udes.edu.co/espera" });
    await expect.poll(async () => (await call("/salud")).body.esperando).toBe(1);
    expect(await leerPagina({ url: "https://www.udes.edu.co/sobra" })).toMatchObject({ status: 429, body: { code: "ocupado" } });
    release();
    expect((await slow).status).toBe(200);
    expect((await waiting).status).toBe(200);
    expect(peak).toBe(1);
  });
});

describe("de lo leído al HTML", () => {
  const p = (t: string) => ({ tag: "p", t });
  const h = (t: string, n = 2) => ({ tag: `h${n}`, t });

  it("lo nuevo de cada lectura entra después de lo conocido que lo precede, y nada de lo anterior se pierde", () => {
    const first = [h("Admisiones", 1), p("Presentación de la página."), h("Pregrado", 3), p("Pregrado abre en octubre."), p("Pie de la sección.")];
    // Al pulsar «Posgrado», la página CAMBIA el panel: ya no trae lo de Pregrado.
    const second = [h("Admisiones", 1), p("Presentación de la página."), h("Posgrado", 3), p("Posgrado abre en enero."), p("Pie de la sección.")];
    const one = fusionar([], first);
    expect(one).toEqual({ blocks: first, added: first.reduce((n, b) => n + b.t.length, 0) });
    const two = fusionar(one.blocks, second);
    expect(two.blocks.map((b: { t: string }) => b.t)).toEqual(["Admisiones", "Presentación de la página.", "Posgrado", "Posgrado abre en enero.", "Pregrado", "Pregrado abre en octubre.", "Pie de la sección."]);
    expect(two.added).toBe("Posgrado".length + "Posgrado abre en enero.".length);
    // La misma lectura otra vez no suma nada.
    expect(fusionar(two.blocks, second)).toEqual({ blocks: two.blocks, added: 0 });
    expect(fusionar(two.blocks, first).added).toBe(0);
  });

  it("«cargar más» suma al final de la lista, y dos bloques iguales no se confunden", () => {
    const first = [h("Noticias"), p("Noticia 1"), p("Noticia 2"), p("Leer"), p("Leer")];
    const more = [h("Noticias"), p("Noticia 1"), p("Noticia 2"), p("Leer"), p("Leer"), p("Noticia 3"), p("Leer")];
    const merged = fusionar(first, more);
    expect(merged.blocks.map((b: { t: string }) => b.t)).toEqual(["Noticias", "Noticia 1", "Noticia 2", "Leer", "Leer", "Noticia 3", "Leer"]);
    expect(merged.added).toBe("Noticia 3".length + "Leer".length);
  });

  it("un párrafo largo repetido sale una vez; los títulos y lo corto no se tocan", () => {
    const long = "Este párrafo está dos veces en la página: una a la vista y otra en la copia oculta para móviles.";
    expect(sinRepetidos([h("A"), p(long), h("A"), p("Sí"), p("Sí"), p(long.toUpperCase())]).map((b: { t: string }) => b.t)).toEqual(["A", long, "A", "Sí", "Sí"]);
  });

  it("arma un HTML sin nada que ejecutar, que la función vuelve pasajes como siempre", () => {
    const blocks = [
      h("Admisiones de pregrado", 1),
      p("La inscripción se hace en línea, desde el formulario de aspirantes de la universidad."),
      h("Posgrado", 2),
      p('Texto con <script>alert("x")</script> & símbolos que no deben volverse etiquetas.'),
      { tag: "li", t: "Documento de identidad, legible y vigente al momento de la inscripción." },
      { tag: "script", t: "Una etiqueta que no es de las permitidas se vuelve párrafo, con texto de sobra." },
      h("Requisitos", 3),
      p("Diploma de bachiller y resultados de la prueba de Estado, en un solo archivo PDF."),
    ];
    const built = armarHtml("Admisiones | UDES", blocks);
    expect(built.cut).toBe(false);
    expect(built.html).toMatch(/^<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Admisiones \| UDES<\/title><\/head><body><main>\n/);
    expect(built.html).not.toMatch(/<script/i);
    expect(built.html).toContain("&lt;script&gt;alert(\"x\")&lt;/script&gt; &amp; símbolos");
    expect(built.html).toContain("<li>Documento de identidad");
    const page = webPassages("https://www.udes.edu.co/admisiones", built.html);
    expect(page.title).toBe("Admisiones de pregrado");
    expect(page.sections).toEqual(["Presentación", "Posgrado"]);
    expect(page.rows.map((r) => r.section)).toEqual(["Presentación", "Posgrado", "Posgrado › Requisitos"]);
    expect(page.rows[1].body).toContain('<script>alert("x")</script> & símbolos');
    expect(page.rows[1].body).toContain("- Documento de identidad");
    expect(page.rows[2].body).toContain("Diploma de bachiller");
  });

  it("se corta al llegar al tope de tamaño, y lo dice", () => {
    const blocks = Array.from({ length: 200 }, (_, i) => p(`Párrafo número ${i} ${"x".repeat(1000)}`));
    const built = armarHtml("Larga", blocks, 20_000);
    expect(built.cut).toBe(true);
    expect(Buffer.byteLength(built.html)).toBeLessThanOrEqual(20_000);
    expect(built.html.endsWith("</main></body></html>")).toBe(true);
    expect(built.blocks).toBeGreaterThan(5);
    expect(built.blocks).toBeLessThan(200);
  });
});
