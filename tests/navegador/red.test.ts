/* =============================================================================
   Navegador de Mr. Pilo · a dónde se puede ir (navegador/src/red.js) y
   robots.txt (navegador/src/robots.js).

   Sin Internet: la resolución de nombres se finge, y el proxy se prueba contra
   un servidor de esta misma máquina.
   ========================================================================== */

import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { crearBusqueda, crearProxy, direccionPrivada, direccionPublica, nombrePublico } from "../../navegador/src/red.js";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { AGENTE, leerRobots, robotsPermite } from "../../navegador/src/robots.js";

describe("la dirección de la página", () => {
  it("acepta http y https de un dominio público, y le quita el ancla", () => {
    expect(direccionPublica(" https://www.udes.edu.co/admisiones?sede=cucuta#fechas ")).toEqual({ ok: true, url: "https://www.udes.edu.co/admisiones?sede=cucuta", host: "www.udes.edu.co", origin: "https://www.udes.edu.co" });
    expect(direccionPublica("http://udes.edu.co/")).toMatchObject({ ok: true });
    expect(direccionPublica("https://udes.edu.co:443/x")).toMatchObject({ ok: true });
  });

  it("rechaza otros protocolos, las IP escritas como sea, localhost, las redes internas, los puertos raros y el usuario", () => {
    const bad = [
      "", "udes.edu.co", "ftp://udes.edu.co/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "about:blank", "chrome://settings",
      "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.10/", "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://[::1]/", "http://[fd00::1]/",
      "http://localhost/", "http://localhost:3000/", "https://intranet/", "https://servidor.internal/x", "https://impresora.local/", "https://a.nip.io/", "https://x.localtest.me/", "https://metadata.google.internal/",
      "https://udes.edu.co:8443/", "http://udes.edu.co:22/", "https://usuario:clave@udes.edu.co/", "https://udes.edu.co/a b", "https://udes.edu.co\\@interno/",
    ];
    for (const url of bad) expect(direccionPublica(url).ok, url).toBe(false);
    expect(direccionPublica(42).ok).toBe(false);
    expect(direccionPublica(null).ok).toBe(false);
  });

  it("sabe qué nombres son públicos y qué direcciones son privadas", () => {
    for (const h of ["udes.edu.co", "www.udes.edu.co", "xn--espaa-rta.es"]) expect(nombrePublico(h), h).toBe(true);
    for (const h of ["", "localhost", "intranet", "a.local", "10.0.0.1", "[::1]", "::1", "servidor", "a.internal"]) expect(nombrePublico(h), h).toBe(false);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2001:db8::1", "no-es-ip", ""]) {
      expect(direccionPrivada(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "190.90.20.10", "172.32.0.1", "100.63.0.1", "2800:e2:c080::1", "2607:f8b0:4005::200e"]) expect(direccionPrivada(ip), ip).toBe(false);
  });
});

describe("la resolución de nombres segura", () => {
  type Found = { address: string; family: number }[];
  const fake = (table: Record<string, Found>) => (host: string, _opts: unknown, cb: (e: Error | null, list?: Found) => void) => (table[host] ? cb(null, table[host]) : cb(new Error("ENOTFOUND")));
  const ask = (busqueda: (h: string, o: unknown, cb: (e: Error | null, a?: unknown, f?: number) => void) => void, host: string, opts: unknown = {}) =>
    new Promise<{ error: (Error & { code?: string }) | null; address?: unknown; family?: number }>((resolve) => busqueda(host, opts, (error, address, family) => resolve({ error, address, family })));

  const busqueda = crearBusqueda(
    fake({
      "www.udes.edu.co": [{ address: "190.90.20.10", family: 4 }, { address: "2800:e2:c080::1", family: 6 }],
      "trampa.example.com": [{ address: "10.0.0.5", family: 4 }],
      "mixto.example.com": [{ address: "190.90.20.10", family: 4 }, { address: "127.0.0.1", family: 4 }],
      "metadatos.example.com": [{ address: "169.254.169.254", family: 4 }],
      "vacio.example.com": [],
    }),
  );

  it("entrega la dirección de un sitio público, y todas si se piden", async () => {
    expect(await ask(busqueda, "www.udes.edu.co")).toMatchObject({ error: null, address: "190.90.20.10", family: 4 });
    expect((await ask(busqueda, "www.udes.edu.co", { all: true })).address).toHaveLength(2);
  });

  it("un nombre público que resuelve a una red interna no conecta, ni con una sola dirección privada entre varias", async () => {
    for (const host of ["trampa.example.com", "mixto.example.com", "metadatos.example.com", "vacio.example.com"]) {
      const r = await ask(busqueda, host);
      expect(r.error?.code, host).toBe("EPILOSSRF");
      expect(r.address, host).toBeUndefined();
    }
  });

  it("ni siquiera pregunta por lo que no es un nombre público", async () => {
    let asked = 0;
    const counting = crearBusqueda((_h: string, _o: unknown, cb: (e: Error | null, l?: Found) => void) => {
      asked += 1;
      cb(null, [{ address: "8.8.8.8", family: 4 }]);
    });
    for (const host of ["localhost", "127.0.0.1", "intranet", "a.internal", "::1"]) expect((await ask(counting, host)).error?.code, host).toBe("EPILOSSRF");
    expect(asked).toBe(0);
  });
});

describe("el proxy del navegador", () => {
  let target: http.Server;
  let proxy: { abrir: () => Promise<string>; cerrar: () => Promise<void> };
  let address = "";
  let hits = 0;
  let targetPort = 0;

  beforeAll(async () => {
    target = http.createServer((_req, res) => {
      hits += 1;
      res.end("secreto de la red interna");
    });
    await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
    targetPort = (target.address() as AddressInfo).port;
    // La resolución de verdad: cualquier nombre de prueba «resuelve» a esta máquina, como haría un DNS malicioso.
    const busqueda = crearBusqueda((_h: string, _o: unknown, cb: (e: Error | null, l?: { address: string; family: number }[]) => void) => cb(null, [{ address: "127.0.0.1", family: 4 }]));
    proxy = crearProxy({ busqueda });
    address = await proxy.abrir();
  });

  afterAll(async () => {
    await proxy.cerrar();
    await new Promise<void>((resolve) => target.close(() => resolve()));
  });

  /** Un pedido http sin cifrar a través del proxy. */
  const viaProxy = (url: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const p = new URL(address);
      const req = http.request({ host: p.hostname, port: p.port, method: "GET", path: url, headers: { host: new URL(url).host } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });

  /** Un CONNECT (https) a través del proxy: devuelve la primera línea de la respuesta. */
  const connect = (hostPort: string) =>
    new Promise<string>((resolve, reject) => {
      const p = new URL(address);
      const socket = net.connect(Number(p.port), p.hostname, () => socket.write(`CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\n\r\n`));
      let data = "";
      socket.on("data", (c) => {
        data += c;
        if (data.includes("\r\n")) {
          socket.destroy();
          resolve(data.split("\r\n")[0]);
        }
      });
      socket.on("error", reject);
      socket.on("close", () => resolve(data.split("\r\n")[0]));
    });

  it("escucha solo en esta máquina", () => {
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("no deja ir a una IP, a localhost ni a un puerto que no sea de web", async () => {
    for (const url of [`http://127.0.0.1:${targetPort}/`, `http://localhost:${targetPort}/`, "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "http://intranet/", `http://www.udes.edu.co:${targetPort}/`]) {
      const r = await viaProxy(url);
      expect(r.status, url).toBe(403);
      expect(r.body, url).not.toContain("secreto");
    }
    for (const hostPort of ["127.0.0.1:443", "localhost:443", `127.0.0.1:${targetPort}`, "169.254.169.254:80", "[::1]:443", "www.udes.edu.co:22", `www.udes.edu.co:${targetPort}`, "intranet:443"]) {
      expect(await connect(hostPort), hostPort).toMatch(/^HTTP\/1\.1 403/);
    }
    expect(hits).toBe(0);
  });

  it("un nombre público que resuelve a una red interna tampoco pasa: ni por http ni por CONNECT", async () => {
    const r = await viaProxy("http://www.udes.edu.co/");
    expect(r.status).toBe(502);
    expect(r.body).not.toContain("secreto");
    expect(await connect("www.udes.edu.co:443")).toMatch(/^HTTP\/1\.1 502/);
    expect(hits).toBe(0);
  });
});

describe("robots.txt", () => {
  const txt = `
    # Reglas del sitio
    User-agent: *
    Disallow: /privado/
    Disallow: /buscar
    Allow: /privado/publico.html
    Disallow: /*.pdf$

    User-agent: Googlebot
    User-agent: MrPiloBot
    Disallow: /solo-google-y-pilo/
    Allow: /

    User-agent: OtroBot
    Disallow: /
    Sitemap: https://www.udes.edu.co/sitemap.xml
  `;

  it("el agente se llama MrPiloBot", () => {
    expect(AGENTE).toBe("MrPiloBot");
  });

  it("vale el grupo que nombra al agente; si no lo nombra, el de todos", () => {
    // MrPiloBot tiene grupo propio: las reglas de «*» no le aplican.
    expect(robotsPermite(txt, "/privado/x", "MrPiloBot/1.0")).toBe(true);
    expect(robotsPermite(txt, "/solo-google-y-pilo/a", "MrPiloBot/1.0")).toBe(false);
    // Otro agente sin grupo cae en «*».
    expect(robotsPermite(txt, "/privado/x", "Curioso/2")).toBe(false);
    expect(robotsPermite(txt, "/privado/publico.html", "Curioso/2")).toBe(true);
    expect(robotsPermite(txt, "/buscar?q=becas", "Curioso/2")).toBe(false);
    expect(robotsPermite(txt, "/docs/guia.pdf", "Curioso/2")).toBe(false);
    expect(robotsPermite(txt, "/docs/guia.pdf?v=2", "Curioso/2")).toBe(true);
    expect(robotsPermite(txt, "/admisiones", "Curioso/2")).toBe(true);
    expect(robotsPermite(txt, "/admisiones", "OtroBot")).toBe(false);
  });

  it("sin reglas, o con «Disallow:» vacío, todo se permite; «Disallow: /» lo cierra todo", () => {
    expect(robotsPermite("", "/x")).toBe(true);
    expect(robotsPermite("User-agent: *\nDisallow:", "/x")).toBe(true);
    expect(robotsPermite("User-agent: *\nDisallow: /", "/x")).toBe(false);
    expect(robotsPermite("User-agent: *\nDisallow: /\n\nUser-agent: mrpilobot\nDisallow:", "/x")).toBe(true);
    expect(robotsPermite("User-agent: *\nAllow: /\n\nUser-agent: MrPiloBot\nDisallow: /", "/x")).toBe(false);
    // Entre dos reglas igual de largas gana la que permite.
    expect(robotsPermite("User-agent: *\nDisallow: /a\nAllow: /a", "/a")).toBe(true);
  });

  it("sin archivo se entra; si el sitio falla al darlo, no; y cada redirección se revisa", async () => {
    const con = (answers: Record<string, { status: number; text?: string; location?: string }>) => ({
      pedir: (url: string) => (answers[url] ? Promise.resolve({ text: "", location: "", ...answers[url] }) : Promise.reject(new Error("sin red"))),
    });
    const page = "https://www.udes.edu.co/privado/x?a=1";
    const robots = "https://www.udes.edu.co/robots.txt";
    expect(await leerRobots(page, con({ [robots]: { status: 200, text: "User-agent: *\nDisallow: /privado/" } }))).toMatchObject({ permite: false });
    expect(await leerRobots(page, con({ [robots]: { status: 200, text: "User-agent: *\nDisallow: /otra/" } }))).toMatchObject({ permite: true });
    expect(await leerRobots(page, con({ [robots]: { status: 404 } }))).toMatchObject({ permite: true, por: "el sitio no tiene robots.txt" });
    expect(await leerRobots(page, con({ [robots]: { status: 503 } }))).toMatchObject({ permite: false });
    expect(await leerRobots(page, con({}))).toMatchObject({ permite: false, por: "no se pudo leer robots.txt" });
    // Redirige a otro nombre del sitio: se sigue.
    expect(await leerRobots(page, con({ [robots]: { status: 301, location: "https://udes.edu.co/robots.txt" }, "https://udes.edu.co/robots.txt": { status: 200, text: "User-agent: *\nDisallow: /privado/" } }))).toMatchObject({ permite: false });
    // Redirige a una red interna: no se sigue.
    expect(await leerRobots(page, con({ [robots]: { status: 302, location: "http://169.254.169.254/latest/" } }))).toMatchObject({ permite: false, por: "robots.txt redirige a una dirección no permitida" });
    expect(await leerRobots(page, con({ [robots]: { status: 302, location: "http://localhost/robots.txt" } }))).toMatchObject({ permite: false });
  });
});
