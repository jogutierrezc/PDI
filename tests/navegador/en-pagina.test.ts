// @vitest-environment jsdom
/* =============================================================================
   Navegador de Mr. Pilo · lo que corre dentro de la página
   (navegador/src/en-pagina.js), sobre una página armada con jsdom.

   jsdom no pinta ni ejecuta la página: aquí se prueba QUÉ se lee y qué
   controles se describen, y que las reglas de clic, aplicadas a esas
   descripciones, eligen los correctos. No reemplaza una prueba con Chromium.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { clasificar } from "../../navegador/src/clics.js";
// @ts-expect-error El servicio es JavaScript: no trae tipos.
import { controles, leerBloques } from "../../navegador/src/en-pagina.js";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8").replace(/\r\n/g, "\n");

const LONG = "Este bloque está oculto sin más señas, pero tiene texto de sobra para que se lea como contenido de la página.";

const PAGE = `
  <header><a href="/">Inicio</a> <button aria-expanded="false" aria-controls="menu-movil">Menú</button></header>
  <nav aria-label="Principal"><ul><li><a href="/programas">Programas</a></li><li><button aria-expanded="false" aria-controls="sub1">Admisiones</button></li></ul></nav>
  <main>
    <h1>Admisiones</h1>
    <p>Presentación visible de la página.</p>
    <div role="tablist">
      <button role="tab" id="t1" aria-controls="p1" aria-selected="true">Pregrado</button>
      <button role="tab" id="t2" aria-controls="p2" aria-selected="false">Posgrado</button>
      <a role="tab" id="t3" href="/educacion-continua" aria-selected="false">Continua</a>
    </div>
    <div role="tabpanel" id="p1" aria-labelledby="t1"><p>Pregrado abre en octubre.</p></div>
    <div role="tabpanel" id="p2" aria-labelledby="t2" hidden><p>Posgrado abre en enero.</p></div>
    <h2>Preguntas</h2>
    <h3><button aria-expanded="false" aria-controls="a1">¿Cómo pagar la matrícula?</button></h3>
    <div id="a1" class="collapse" style="display:none"><p>En línea o en el banco.</p></div>
    <details><summary>Requisitos</summary><ul><li>Documento de identidad</li><li>Diploma</li></ul></details>
    <table><tr><th>Sede</th><th>Horario</th></tr><tr><td>Cúcuta</td><td>8 a 6</td></tr></table>
    <div style="display:none"><p>${LONG}</p></div>
    <button class="ver-mas">Ver más</button>
    <a href="#" class="cargar">Cargar más noticias</a>
    <a href="/noticias">Ver más</a>
    <a href="https://otro.sitio.com/x" target="_blank">Leer más</a>
    <a href="/guia.pdf" download>Descargar guía</a>
    <button>Iniciar sesión</button>
    <button>Eliminar</button>
    <button>Comprar</button>
    <form action="/buscar"><input name="q"><button type="submit">Buscar</button><button type="button">Ver más</button></form>
    <div id="cookie-banner"><p>Usamos cookies.</p><button>Aceptar</button><button aria-expanded="false" aria-controls="cookie-detalle">Ver más</button></div>
    <div role="dialog" hidden><button>Ver más</button><p>Inicie sesión para continuar con su proceso de inscripción.</p></div>
    <nav aria-label="Paginación"><ul class="pagination"><li><button>Anterior</button></li><li><button>Siguiente</button></li><li><a href="?page=3">3</a></li></ul></nav>
    <aside><p>Publicidad lateral que no es contenido.</p></aside>
  </main>
  <footer><button aria-expanded="false" aria-controls="legal">Aviso legal</button></footer>`;

function mount(html = PAGE) {
  document.title = "  Admisiones   | UDES ";
  document.body.innerHTML = html;
  // jsdom no calcula tamaños: aquí todo lo que no está oculto «se ve».
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    const hidden = el.closest("[hidden],[style*='display:none']");
    el.getClientRects = (() => (hidden ? [] : [{ width: 10, height: 10 }])) as unknown as typeof el.getClientRects;
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  delete (window as unknown as { __piloNav?: number }).__piloNav;
});

describe("las reglas de lectura son las del chat incrustado", () => {
  it("el bloque de reglas de en-pagina.js es el mismo de public/pilo.js", () => {
    const cut = (source: string) => {
      const from = source.indexOf("/* --- Las reglas de lectura");
      const to = source.indexOf("/* --- fin de las reglas --- */");
      expect(from).toBeGreaterThan(0);
      expect(to).toBeGreaterThan(from);
      return source.slice(from, to);
    };
    expect(cut(read("../../navegador/src/en-pagina.js"))).toBe(cut(read("../../public/pilo.js")));
  });
});

describe("leerBloques", () => {
  it("lee títulos, párrafos, listas y filas, también lo plegado, cada cosa con su etiqueta", () => {
    mount();
    const r = leerBloques() as { title: string; blocks: { tag: string; t: string }[]; chars: number };
    expect(r.title).toBe("Admisiones | UDES");
    expect(r.blocks).toEqual([
      { tag: "h1", t: "Admisiones" },
      { tag: "p", t: "Presentación visible de la página." },
      { tag: "h2", t: "Pregrado" },
      { tag: "p", t: "Pregrado abre en octubre." },
      { tag: "h2", t: "Posgrado" },
      { tag: "p", t: "Posgrado abre en enero." },
      { tag: "h2", t: "Preguntas" },
      { tag: "h3", t: "¿Cómo pagar la matrícula?" },
      { tag: "p", t: "En línea o en el banco." },
      { tag: "h4", t: "Requisitos" },
      { tag: "li", t: "Documento de identidad" },
      { tag: "li", t: "Diploma" },
      { tag: "p", t: "Sede · Horario" },
      { tag: "p", t: "Cúcuta · 8 a 6" },
      { tag: "p", t: LONG },
      { tag: "p", t: "Ver más Leer más Descargar guía" },
    ]);
    expect(r.chars).toBe(r.blocks.reduce((n, b) => n + b.t.length, 0));
  });

  it("no lee menús, pies, formularios, diálogos, avisos de cookies ni laterales", () => {
    mount();
    const all = (leerBloques() as { blocks: { t: string }[] }).blocks.map((b) => b.t).join("\n");
    for (const never of ["Inicio", "Menú", "Programas", "Buscar", "Inicie sesión", "Publicidad", "Aviso legal", "Anterior", "Siguiente", "Iniciar sesión", "Eliminar", "Comprar", "Aceptar", "cookies", "Cargar más noticias"]) expect(all, never).not.toContain(never);
  });

  it("no cambia la página", () => {
    mount();
    const before = document.body.innerHTML;
    leerBloques();
    expect(document.body.innerHTML).toBe(before);
  });
});

describe("controles + clasificar", () => {
  const pick = () => {
    const found = controles() as { key: string; tag: string; text: string; attrs: Record<string, string>; insideForm: boolean; ancestors: string }[];
    return found.map((d) => ({ d, v: clasificar(d, { url: window.location.href }) as { ok: boolean; kind: string | null; why: string } }));
  };

  it("de toda la página, solo se pulsa lo que despliega contenido", () => {
    mount();
    const chosen = pick().filter((x) => x.v.ok).map((x) => `${x.v.kind} · ${x.d.text}`);
    expect(chosen).toEqual(["pestaña · Posgrado", "acordeón · ¿Cómo pagar la matrícula?", "detalle · Requisitos", "ver más · Ver más", "ver más · Cargar más noticias", "siguiente · Siguiente"]);
  });

  it("y cada uno de los demás tiene su razón", () => {
    mount();
    const why = (text: string, where = "") => pick().filter((x) => !x.v.ok && x.d.text === text && (!where || ` ${x.d.ancestors} `.includes(` ${where} `) || (x.d.attrs.class ?? "").includes(where))).map((x) => x.v.why);
    expect(why("Menú")).toEqual(["está en la navegación del sitio"]);
    expect(why("Admisiones")).toEqual(["está en la navegación del sitio"]);
    expect(why("Pregrado")).toEqual(["la pestaña ya está elegida"]);
    expect(why("Iniciar sesión")).toEqual(["dice una orden"]);
    expect(why("Eliminar")).toEqual(["dice una orden"]);
    expect(why("Comprar")).toEqual(["dice una orden"]);
    expect(why("Buscar")).toEqual(["está dentro de un formulario"]);
    expect(why("Ver más", "form")).toEqual(["está dentro de un formulario"]);
    expect(why("Aceptar")).toEqual(["es un control de cookies, publicidad o ventana emergente"]);
    expect(why("Aviso legal")).toEqual(["está en un pie, un diálogo o un menú"]);
    expect(why("Anterior")).toEqual(["está en la navegación del sitio"]);
    // Los enlaces que navegan (otra ruta, otro sitio, descarga) ni siquiera se recogen: nunca llegan a pulsarse.
    const texts = pick().map((x) => x.d.text);
    for (const gone of ["Programas", "Leer más", "Descargar guía", "3", "Continua"]) expect(texts.filter((t) => t === gone && gone !== "Continua"), gone).toEqual([]);
    // La pestaña que es un enlace a otra página sí se recoge (es role=tab), y se rechaza.
    expect(why("Continua")).toEqual(["lleva a otra dirección"]);
    // Lo que está dentro de un diálogo oculto no se ve: no se recoge.
    expect(pick().some((x) => ` ${x.d.ancestors} `.includes(" role:dialog "))).toBe(false);
  });

  it("marca cada control una sola vez, para hallarlo después", () => {
    mount();
    const first = (controles() as { key: string }[]).map((d) => d.key);
    const second = (controles() as { key: string }[]).map((d) => d.key);
    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
    expect(document.querySelectorAll("[data-pilo-nav]").length).toBe(first.length);
    expect(document.querySelector(`[data-pilo-nav="${first[0]}"]`)).not.toBeNull();
  });
});
