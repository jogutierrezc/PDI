/* =============================================================================
   Páginas web (0129): la dirección que Pilo acepta leer desde el servidor y
   los pasajes que saca del HTML de una página. Sin red.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { WEB_MAX_PASSAGES, webAddress, webPassages } from "./logic";

describe("la dirección de una página web", () => {
  it("acepta una página https de un dominio público y le quita lo privado", () => {
    expect(webAddress(" https://www.udes.edu.co/admisiones?utm_source=x&sede=cucuta#fechas ")).toEqual({ ok: true, url: "https://www.udes.edu.co/admisiones?sede=cucuta", host: "www.udes.edu.co" });
  });

  it("rechaza lo que no es https, las direcciones IP y los nombres de red interna", () => {
    for (const bad of ["", "http://www.udes.edu.co/", "ftp://udes.edu.co", "https://192.168.1.10/", "https://2130706433/", "https://[::1]/", "https://localhost/", "https://intranet/", "https://servidor.internal/x", "https://a.nip.io/", "https://udes.edu.co:8443/", "https://usuario@udes.edu.co/", "https://udes.edu.co/a b"]) {
      expect(webAddress(bad).ok, bad).toBe(false);
    }
    expect(webAddress(42).ok).toBe(false);
  });
});

describe("los pasajes de una página web", () => {
  const html = `<!doctype html><html><head><title>Admisiones | UDES</title><style>p{color:red}</style></head><body>
    <header><a href="/">Inicio</a> Menú del sitio que no es contenido de la página</header>
    <nav>Programas Admisiones Investigación Bienestar Contacto y más enlaces del menú</nav>
    <main>
      <h1>Admisiones de pregrado</h1>
      <p>La inscripción se hace en línea, desde el formulario de aspirantes de la universidad.</p>
      <h2>Documentos</h2>
      <p>Se pide el documento de identidad y el diploma de bachiller. Dudas al correo admisiones@udes.edu.co o al 607 651 6500.</p>
      <h3>Formato</h3>
      <p>Los documentos se cargan en PDF, legibles y completos; uno ilegible se devuelve.</p>
      <h2>Calendario</h2>
      <p>Las inscripciones abren al comienzo de cada periodo académico y cierran una semana antes.</p>
      <form><input name="q"><button>Buscar en el sitio con este formulario largo</button></form>
      <script>var secreto = "esto no se lee nunca, aunque sea largo";</script>
    </main>
    <footer>Universidad de Santander. Todos los derechos reservados. Dirección y redes.</footer>
  </body></html>`;

  it("parte la página por sus títulos y deja por fuera menús, pies, formularios y código", () => {
    const page = webPassages("https://www.udes.edu.co/admisiones", html);
    expect(page.title).toBe("Admisiones de pregrado");
    expect(page.sections).toEqual(["Presentación", "Documentos", "Calendario"]);
    expect(page.rows.map((r) => r.section)).toEqual(["Presentación", "Documentos", "Documentos › Formato", "Calendario"]);
    expect(page.rows.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(page.rows.every((r) => r.title === "Admisiones de pregrado" && r.path === "https://www.udes.edu.co/admisiones")).toBe(true);
    const all = page.rows.map((r) => r.body).join("\n");
    expect(all).not.toMatch(/Menú del sitio|Programas Admisiones|derechos reservados|secreto|Buscar en el sitio|color:red/);
    expect(all).toContain("formulario de aspirantes");
  });

  it("omite correos y teléfonos, y lo cuenta", () => {
    const page = webPassages("https://www.udes.edu.co/admisiones", html);
    expect(page.rows[1].body).not.toMatch(/admisiones@udes\.edu\.co/);
    expect(page.rows[1].body).toContain("[dato omitido]");
    expect(page.redacted).toBeGreaterThanOrEqual(1);
  });

  it("sin <main>, lee el cuerpo sin la cabecera del sitio; sin título, usa el de la pestaña", () => {
    const page = webPassages("https://www.udes.edu.co/x", `<html><head><title>Biblioteca · Servicios</title></head><body><header>Menú principal del sitio con muchos enlaces</header><div><p>El préstamo de libros se hace con el carné vigente, en el mostrador.</p></div></body></html>`);
    expect(page.title).toBe("Biblioteca · Servicios");
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].body).not.toContain("Menú principal");
  });

  it("no repite un mismo párrafo, ignora lo muy corto y tiene tope", () => {
    const same = "<p>Este párrafo se repite muchas veces en la página, igual cada vez.</p>";
    const many = Array.from({ length: WEB_MAX_PASSAGES + 30 }, (_, i) => `<h2>Sección ${i}</h2><p>${"Contenido distinto de la sección número " + i + ". "}${"x".repeat(1300)}</p>`).join("");
    const page = webPassages("https://www.udes.edu.co/x", `<body>${same}${same}<p>Corto.</p>${many}</body>`);
    expect(page.rows.filter((r) => r.body.includes("se repite"))).toHaveLength(1);
    expect(page.rows.some((r) => r.body === "Corto.")).toBe(false);
    expect(page.rows).toHaveLength(WEB_MAX_PASSAGES);
    expect(page.dropped).toBeGreaterThan(0);
  });

  it("una página sin texto no deja pasajes", () => {
    expect(webPassages("https://www.udes.edu.co/x", `<body><div id="root"></div><script>render()</script></body>`).rows).toEqual([]);
  });
});
