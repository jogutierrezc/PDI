// @vitest-environment jsdom
/* La página pública de Encuestas con Pilo renderizada en servidor con datos falsos:
   la bienvenida con el título de la encuesta, la identificación, la lista de lo
   registrado, el detalle de un aporte y la encuesta cerrada. */

import { createElement as h } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AporteEnvio, InfoEncuesta } from "../tipos";
import { guardarBorrador } from "../lib/borrador";
import { EncuestaPublica } from "./EncuestaPublica";
import { Detalle, Elegir, Identificacion } from "./Pasos";
import { frasesBienvenida, frasesDespedida } from "./frases";

vi.mock("../../../lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn() } },
}));

const SLUG = "rendicion-2026";
const info: InfoEncuesta = {
  slug: SLUG,
  titulo: "Construyamos juntos la Rendición de Cuentas 2026",
  anio: "2026",
  intro: "Estoy recopilando cifras de las dependencias de la UDES.",
  despedida: "Esto no es la rendición de cuentas: es un insumo para el video.",
  abierta: true,
  cierra_el: null,
};

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

function pagina(i: Partial<InfoEncuesta> | null) {
  const c = new QueryClient();
  if (i) c.setQueryData(["encuestas", "info", SLUG], { ...info, ...i });
  return renderToString(h(QueryClientProvider, { client: c }, h(MemoryRouter, { initialEntries: [`/encuesta/${SLUG}`] }, h(Routes, null, h(Route, { path: "/encuesta/:slug", element: h(EncuestaPublica) })))));
}

beforeEach(() => window.sessionStorage.clear());

describe("EncuestaPublica", () => {
  it("al entrar, Pilo da la bienvenida con el título de la encuesta y no la oculta tras el formulario", () => {
    const html = pagina({});
    const t = texto(html);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Bienvenida de Mr. Pilo"');
    expect(html).toContain(`aria-label="${info.titulo}"`);
    expect(t).toContain("Saltar");
    expect(t).toContain("Siguiente");
    // La marca de la UDES y el tema claro.
    expect(html).toContain("/logo-udes.svg");
  });

  it("quien ya vio la bienvenida va directo a identificarse, con su dependencia guardada", () => {
    guardarBorrador(SLUG, { dependencia: "Biblioteca", visto: true, aportes: [] });
    const html = pagina({});
    const t = texto(html);
    expect(html).not.toContain("Bienvenida de Mr. Pilo");
    expect(t).toContain("Identifíquese con su correo institucional");
    expect(t).toContain("Continuar con Microsoft");
    expect(t).toContain("@udes.edu.co");
    expect(html).toContain('value="Biblioteca"');
    expect(t).toContain(info.titulo);
  });

  it("una encuesta cerrada lo dice con claridad y no ofrece el formulario", () => {
    const t = texto(pagina({ abierta: false }));
    expect(t).toContain("Esta encuesta ya no recibe respuestas");
    expect(t).not.toContain("Continuar con Microsoft");
  });

  it("una fecha de cierre pasada también la cierra", () => {
    expect(texto(pagina({ cierra_el: "2020-01-01" }))).toContain("ya no recibe respuestas");
  });
});

describe("pasos", () => {
  const decir = vi.fn();
  const aportes: AporteEnvio[] = [{ tipo: "logro", titulo: "Acreditación del programa", descripcion: "Una descripción suficientemente larga para pasar", cifras: [{ que: "Estudiantes", tipo: "estudiantes", valor: 412 }] }];

  it("identificación: con cuenta confirmada muestra el correo que dio Microsoft", () => {
    const t = texto(renderToString(h(Identificacion, { dependencia: "Biblioteca", onDependencia: vi.fn(), cuenta: { correo: "ana@udes.edu.co", nombre: "Ana" }, microsoft: { fase: "inactivo" }, onMicrosoft: vi.fn(), onSeguir: vi.fn(), decir })));
    expect(t).toContain("Correo confirmado por Microsoft: ana@udes.edu.co");
    expect(t).toContain("Continuar");
    expect(t).not.toContain("Continuar con Microsoft");
  });

  it("identificación: un error de Microsoft se dice y se puede reintentar", () => {
    const t = texto(renderToString(h(Identificacion, { dependencia: "", onDependencia: vi.fn(), cuenta: null, microsoft: { fase: "error", mensaje: "No llegó la confirmación." }, onMicrosoft: vi.fn(), onSeguir: vi.fn(), decir })));
    expect(t).toContain("No llegó la confirmación.");
    expect(t).toContain("Continuar con Microsoft");
  });

  it("elegir: lista lo registrado, su número de cifras, y habilita el envío", () => {
    const t = texto(renderToString(h(Elegir, { cuenta: { correo: "ana@udes.edu.co", nombre: "Ana" }, dependencia: "Biblioteca", aportes, enviando: false, error: null, onElegir: vi.fn(), onEditar: vi.fn(), onQuitar: vi.fn(), onEnviar: vi.fn() })));
    expect(t).toContain("Acreditación del programa");
    expect(t).toContain("1 cifra");
    expect(t).toContain("Enviar todo (1)");
    expect(t).toContain("ana@udes.edu.co · Biblioteca");
  });

  it("elegir: sin nada registrado no deja enviar; con error ofrece reintentar", () => {
    const vacio = renderToString(h(Elegir, { cuenta: { correo: "a@udes.edu.co", nombre: "" }, dependencia: "Biblioteca", aportes: [], enviando: false, error: null, onElegir: vi.fn(), onEditar: vi.fn(), onQuitar: vi.fn(), onEnviar: vi.fn() }));
    expect(vacio).toMatch(/<button[^>]*disabled[^>]*>Enviar todo<\/button>/);
    const fallo = texto(renderToString(h(Elegir, { cuenta: { correo: "a@udes.edu.co", nombre: "" }, dependencia: "Biblioteca", aportes, enviando: false, error: "No se pudo conectar.", onElegir: vi.fn(), onEditar: vi.fn(), onQuitar: vi.fn(), onEnviar: vi.fn() })));
    expect(fallo).toContain("No se pudo conectar.");
    expect(fallo).toContain("Reintentar el envío (1)");
  });

  it("elegir: cada aporte trae Editar (icono y texto) y Quitar", () => {
    const html = renderToString(h(Elegir, { cuenta: { correo: "a@udes.edu.co", nombre: "" }, dependencia: "Biblioteca", aportes, enviando: false, error: null, onElegir: vi.fn(), onEditar: vi.fn(), onQuitar: vi.fn(), onEnviar: vi.fn() }));
    expect(html).toMatch(/aria-label="Editar: [^"]+"[^>]*>.*?<span>Editar<\/span>/);
    expect(html).toContain("Quitar: ");
  });

  it("detalle: al editar carga el aporte en el formulario", () => {
    const t = renderToString(h(Detalle, { tipo: "logro", inicial: aportes[0], onGuardar: vi.fn(), onVolver: vi.fn(), decir }));
    expect(t).toContain("Editando un ");
    expect(t).toContain(aportes[0].titulo.replace(/&/g, "&amp;"));
  });

  it("detalle: arranca por el título del logro o del reto", () => {
    const logro = texto(renderToString(h(Detalle, { tipo: "logro", onGuardar: vi.fn(), onVolver: vi.fn(), decir })));
    expect(logro).toContain("¿Cuál es el logro que quiere destacar?");
    expect(logro).toMatch(/0 \/ 120/);
    expect(texto(renderToString(h(Detalle, { tipo: "reto", onGuardar: vi.fn(), onVolver: vi.fn(), decir })))).toContain("¿Cuál es el reto que enfrenta?");
  });
});

describe("lo que dice Pilo", () => {
  it("la bienvenida lleva la introducción de la encuesta; sin ella, esa frase no se dice", () => {
    expect(frasesBienvenida(info.intro).some((f) => f.say === info.intro)).toBe(true);
    expect(frasesBienvenida("  ").some((f) => f.id === "intro")).toBe(false);
  });
  it("la despedida lleva el mensaje de la encuesta entre el agradecimiento y el vuelo", () => {
    const f = frasesDespedida(info.despedida);
    expect(f.map((x) => x.id)).toEqual(["listo", "propia", "vuelo"]);
    expect(f[1].say).toBe(info.despedida);
    expect(frasesDespedida("").map((x) => x.id)).toEqual(["listo", "vuelo"]);
  });
});
