// @vitest-environment jsdom
/* La página pública de Contactos en el navegador (jsdom): el aviso de «recibido» al terminar un
   envío, el regreso de Microsoft (saluda, pide solo el cargo, cierra la sesión de Supabase), el
   dominio no institucional que no deja continuar y el interruptor de tema. */

import { createElement as h } from "react";
import type { ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { guardarSesion, marcarSalidaMicrosoft } from "../api";
import type { InvitacionPublica, Sesion } from "../api";
import { ContactosPublico } from "./ContactosPublico";

vi.mock("../../../../lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn() } },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "7Kq9x2mVb4zQ";
const info: InvitacionPublica = {
  nombre: "Contactos 2026-2 · Cúcuta",
  estado: "activa",
  vence: "2099-11-30",
  periodo: "2026-2",
  campus: { id: "c-cuc", name: "Cúcuta", code: "CUC" },
  campuses: [],
  tipos: ["academico", "empleador"],
  dominios: ["udes.edu.co"],
  limite: 200,
};
const sesion: Sesion = { aportante_id: "00000000-0000-4000-a000-000000000001", sesion: "x".repeat(43), nombre: "Laura Mendoza Ortiz", cargo: "Directora", correo: "lmendoza@udes.edu.co", campus_id: "c-cuc", enviados: 0 };

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const auth = supabase.auth as unknown as { getSession: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> };
let raiz: Root | null = null;
let caja: HTMLElement;

const respuestas: Record<string, (cuerpo: Record<string, unknown>) => unknown> = {};
function llamadas(accion: string) {
  return invoke.mock.calls.filter((c) => (c[1] as { body: { action: string } }).body.action === accion);
}

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar(s: Sesion | null) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cliente.setQueryData(["int-contactos", "info", TOKEN], info);
  if (s) guardarSesion(TOKEN, s);
  caja = document.createElement("div");
  document.body.appendChild(caja);
  raiz = createRoot(caja);
  const el: ReactElement = h(QueryClientProvider, { client: cliente }, h(MemoryRouter, { initialEntries: [`/contactos/i/${TOKEN}`] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) }))));
  await act(async () => raiz!.render(el));
  await esperar();
}

const texto = () => (caja.textContent ?? "").replace(/\s+/g, " ");
const boton = (nombre: string) => {
  const todos = [...caja.querySelectorAll("button")];
  return (todos.find((b) => b.textContent?.trim() === nombre) ?? todos.find((b) => b.textContent?.includes(nombre))) as HTMLButtonElement;
};
const clic = async (el: Element) => {
  await act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await esperar();
};
async function escribir(el: HTMLInputElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  invoke.mockReset();
  invoke.mockImplementation(async (_nombre: string, opciones: { body: Record<string, unknown> }) => {
    const f = respuestas[String(opciones.body.action)];
    return f ? { data: f(opciones.body), error: null } : { data: null, error: new Error("sin respuesta") };
  });
  respuestas.mis = () => ({ limite: 200, filas: [] });
  respuestas.enviar = () => ({ resultados: [{ fila: 1, accion: "crear", motivo: null, avisos: [] }], creadas: 1, actualizadas: 0, omitidas: 0, errores: 0, enviados: 1, limite: 200 });
  auth.getSession.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
});

afterEach(async () => {
  await act(async () => raiz?.unmount());
  caja?.remove();
  raiz = null;
});

describe("recibido", () => {
  it("al terminar un contacto uno a uno, Pilo celebra con el aviso de recibido", async () => {
    await montar(sesion);
    expect(texto()).not.toContain("¡Felicidades!");
    await clic(boton("Uno a uno"));
    for (const [id, valor] of [["cp-firstname", "María"], ["cp-lastname", "Ruiz"], ["cp-jobtitle", "Directora"], ["cp-email", "mf.ruiz@universidad.mx"]] as const) {
      await escribir(document.getElementById(id) as HTMLInputElement, valor);
    }
    await clic(boton("Terminar y enviar"));
    expect(llamadas("enviar")).toHaveLength(1);
    expect(caja.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim()).toBe("¡Felicidades! Los datos compartidos fueron recibidos con éxito.");
    expect(texto()).toContain("Contacto recibido");
    expect(texto()).toContain("Enviar más contactos");
    expect(texto()).toContain("Cúcuta");
  });

  it("«Enviar y agregar otro» no sale de la pantalla: cuenta y sigue", async () => {
    await montar(sesion);
    await clic(boton("Uno a uno"));
    for (const [id, valor] of [["cp-firstname", "Ana"], ["cp-lastname", "Gómez"], ["cp-jobtitle", "Docente"], ["cp-email", "ana@usal.es"]] as const) {
      await escribir(document.getElementById(id) as HTMLInputElement, valor);
    }
    await clic(boton("Enviar y agregar otro"));
    expect(llamadas("enviar")).toHaveLength(1);
    expect(texto()).not.toContain("¡Felicidades!");
    expect(texto()).toContain("Ya lleva 1 en esta ronda");
    expect((document.getElementById("cp-firstname") as HTMLInputElement).value).toBe("");
  });

  it("con el formulario vacío, Pilo avisa en vez de enviar", async () => {
    await montar(sesion);
    await clic(boton("Uno a uno"));
    await clic(boton("Terminar y enviar"));
    expect(llamadas("enviar")).toHaveLength(0);
    expect(texto()).toContain("Todavía no hay ningún contacto escrito");
  });
});

describe("continuar con Microsoft", () => {
  it("al volver saluda por el nombre, pide solo el cargo y cierra la sesión de Supabase", async () => {
    marcarSalidaMicrosoft(TOKEN);
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-de-microsoft-".padEnd(40, "x") } } });
    respuestas.microsoft_datos = () => ({ nombre: "Laura Mendoza Ortiz", correo: "lmendoza@cucuta.udes.edu.co" });
    const cliente = new QueryClient();
    cliente.setQueryData(["int-contactos", "info", TOKEN], info);
    caja = document.createElement("div");
    document.body.appendChild(caja);
    raiz = createRoot(caja);
    await act(async () => raiz!.render(h(QueryClientProvider, { client: cliente }, h(MemoryRouter, { initialEntries: [`/contactos/i/${TOKEN}`] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) }))))));
    await esperar();
    await esperar();

    expect(llamadas("microsoft_datos")).toHaveLength(1);
    expect((llamadas("microsoft_datos")[0][1] as { headers: Record<string, string> }).headers.Authorization).toMatch(/^Bearer jwt-de-microsoft/);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    const t = texto();
    expect(t).toContain("Hola, Laura");
    expect(t).toContain("Correo confirmado por Microsoft");
    expect(t).toContain("Cargo en la UDES");
    expect(t).not.toContain("Nombre completo");
    expect(t).not.toContain("Correo institucional");
  });

  it("si la cuenta de Microsoft no es institucional, Pilo lo explica y deja el formulario", async () => {
    marcarSalidaMicrosoft(TOKEN);
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-de-microsoft-".padEnd(40, "x") } } });
    invoke.mockImplementation(async () => ({ data: null, error: Object.assign(new Error("x"), { context: new Response(JSON.stringify({ error: "El correo de su cuenta Microsoft (a@gmail.com) no es un correo institucional de la UDES." }), { status: 400 }) }) }));
    const cliente = new QueryClient();
    cliente.setQueryData(["int-contactos", "info", TOKEN], info);
    caja = document.createElement("div");
    document.body.appendChild(caja);
    raiz = createRoot(caja);
    await act(async () => raiz!.render(h(QueryClientProvider, { client: cliente }, h(MemoryRouter, { initialEntries: [`/contactos/i/${TOKEN}`] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) }))))));
    await esperar();
    await esperar();
    expect(texto()).toContain("no es un correo institucional de la UDES");
    expect(texto()).toContain("Puede escribir sus datos en el formulario");
    expect(texto()).toContain("Nombre completo");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("sin haber salido hacia Microsoft desde este enlace, una sesión de intranet no se toca", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "otra-sesion".padEnd(40, "x") } } });
    await montar(null);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(llamadas("microsoft_datos")).toHaveLength(0);
  });
});

describe("el correo institucional", () => {
  it("un dominio que no es de la UDES lo dice Pilo y no deja continuar", async () => {
    await montar(null);
    await escribir(caja.querySelector('input[autocomplete="name"]') as HTMLInputElement, "Laura Mendoza Ortiz");
    await escribir(caja.querySelector('input[autocomplete="organization-title"]') as HTMLInputElement, "Directora");
    await escribir(document.getElementById("cp-correo-local") as HTMLInputElement, "laura@gmail.com");
    expect(texto()).toContain("El dominio @gmail.com no es institucional");
    await act(async () => void (caja.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await clic(boton("Continuar") as HTMLButtonElement);
    expect(llamadas("identificar")).toHaveLength(0);
  });

  it("si pega el correo completo, separa el dominio solo", async () => {
    await montar(null);
    const campo = document.getElementById("cp-correo-local") as HTMLInputElement;
    await escribir(campo, "lmendoza@valledupar.udes.edu.co");
    expect(campo.value).toBe("lmendoza");
    expect((caja.querySelector('select[aria-label="Dominio del correo"]') as HTMLSelectElement).value).toBe("valledupar.udes.edu.co");
    expect(texto()).toContain("lmendoza@valledupar.udes.edu.co");
  });
});

describe("el tema", () => {
  it("el interruptor fija data-theme en la página (no en <html>) y lo recuerda", async () => {
    await montar(null);
    const pagina = caja.querySelector(".cp") as HTMLElement;
    expect(pagina.getAttribute("data-theme")).toBeNull();
    await clic(boton("Oscuro"));
    expect(pagina.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem("int-contactos:tema")).toBe("oscuro");
    await clic(boton("Claro"));
    expect(pagina.getAttribute("data-theme")).toBe("light");
    await clic(boton("Automático"));
    expect(pagina.getAttribute("data-theme")).toBeNull();
    expect(window.localStorage.getItem("int-contactos:tema")).toBeNull();
  });

  it("recuerda el tema elegido al volver", async () => {
    window.localStorage.setItem("int-contactos:tema", "oscuro");
    await montar(null);
    // montar() limpia solo sessionStorage; el tema se leyó de localStorage al iniciar.
    expect((caja.querySelector(".cp") as HTMLElement).getAttribute("data-theme")).toBe("dark");
  });
});
