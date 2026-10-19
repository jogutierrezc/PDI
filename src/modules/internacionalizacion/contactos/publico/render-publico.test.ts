// @vitest-environment jsdom
/* La página pública de Contactos renderizada en servidor con datos falsos: cada paso
   (identificación, elegir cómo aportar), los enlaces que no sirven, y los formularios
   que salen de las plantillas de Rua. */

import { createElement as h } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InvitacionPublica, Sesion } from "../api";
import { guardarSesion } from "../api";
import { ContactosPublico } from "./ContactosPublico";
import { ImportarArchivo } from "./ImportarArchivo";
import { UnoAUno } from "./UnoAUno";

vi.mock("../../../../lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn() } },
}));

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
const sesion: Sesion = { aportante_id: "00000000-0000-4000-a000-000000000001", sesion: "x".repeat(43), nombre: "Laura Mendoza Ortiz", cargo: "Directora de programa", correo: "lmendoza@udes.edu.co", campus_id: "c-cuc", enviados: 7 };

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

function cliente(inv: Partial<InvitacionPublica> | null, s: Sesion | null) {
  const c = new QueryClient();
  if (inv) c.setQueryData(["int-contactos", "info", TOKEN], { ...info, ...inv });
  window.sessionStorage.clear();
  if (s) {
    guardarSesion(TOKEN, s);
    c.setQueryData(["int-contactos", "mis", TOKEN, s.aportante_id], {
      limite: 200,
      filas: [{ id: "f1", tipo: "academico", datos: { propio_first_name: "Ana", propio_last_name: "Gómez", propio_institution: "U. de Salamanca", propio_country: "España" }, origen: "manual", archivo: null, creado: "2026-10-10T15:00:00Z" }],
    });
  }
  return c;
}

function pagina(inv: Partial<InvitacionPublica> | null, s: Sesion | null = null, ruta = `/contactos/i/${TOKEN}`) {
  return texto(
    renderToString(
      h(QueryClientProvider, { client: cliente(inv, s) }, h(MemoryRouter, { initialEntries: [ruta] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) })))),
    ),
  );
}

beforeEach(() => window.sessionStorage.clear());

describe("el enlace de invitación", () => {
  it("sin sesión abre con el titular de Pilo, la puerta de Microsoft y el formulario", () => {
    const t = pagina({}, null);
    expect(t).toContain("Primero necesitamos saber quién es usted.");
    expect(t).toContain("Son tres datos y menos de un minuto.");
    expect(t).toContain("Continuar con Microsoft");
    expect(t).toContain("Nombre completo");
    expect(t).toContain("Cargo en la UDES");
    expect(t).toContain("Correo institucional");
    expect(t).toContain("Acepto el tratamiento de los datos");
    expect(t).toContain("por aprobar");
    expect(t).toContain("Contactos 2026-2 · Cúcuta");
    expect(t).toContain("Continuar");
    expect(t).toContain("Mr. Pilo");
    expect(t).not.toContain("Uno a uno");
  });

  it("el correo sugiere los cinco dominios de la UDES, con el del campus del enlace por defecto", () => {
    const html = renderToString(h(QueryClientProvider, { client: cliente({}, null) }, h(MemoryRouter, { initialEntries: [`/contactos/i/${TOKEN}`] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) })))));
    const t = texto(html);
    for (const d of ["udes.edu.co", "valledupar.udes.edu.co", "cucuta.udes.edu.co", "bogota.udes.edu.co", "mail.udes.edu.co"]) {
      expect(t).toContain(`@${d}`);
      expect(html).toContain(`value="${d}"`);
    }
    // Enlace de Cúcuta: el dominio de Cúcuta viene elegido.
    expect(html).toMatch(/<option value="cucuta\.udes\.edu\.co" selected/);
    // Y los dominios de la invitación se suman a los cinco.
    expect(pagina({ dominios: ["udes.edu.co", "aliado.org"] }, null)).toContain("@aliado.org");
  });

  it("tiene un interruptor de tema Claro / Oscuro / Automático", () => {
    const t = pagina({}, null);
    expect(t).toContain("Claro");
    expect(t).toContain("Oscuro");
    expect(t).toContain("Automático");
    expect(renderToString(h(QueryClientProvider, { client: cliente({}, null) }, h(MemoryRouter, { initialEntries: [`/contactos/i/${TOKEN}`] }, h(Routes, null, h(Route, { path: "/contactos/i/:token", element: h(ContactosPublico) })))))).toContain('role="radiogroup" aria-label="Tema de la página"');
  });

  it("el pie y los avisos nombran a Planeación Institucional, no a Internacionalización", () => {
    const t = pagina({}, null);
    expect(t).toContain("Universidad de Santander · Planeación Institucional");
    expect(t).not.toContain("Oficina de Internacionalización");
    expect(t).not.toContain("Relaciones Internacionales");
    expect(pagina({ estado: "pausada" }, null)).toContain("Planeación Institucional");
    expect(pagina({ estado: "vencida" }, null)).toContain("pida a Planeación Institucional");
  });

  it("si la invitación no trae campus, la persona lo elige", () => {
    const t = pagina({ campus: null, campuses: [{ id: "c-1", name: "Valledupar", code: "VAL" }, { id: "c-2", name: "Bogotá", code: "BOG" }] }, null);
    expect(t).toContain("Su campus");
    expect(t).toContain("Valledupar");
    expect(t).toContain("Bogotá");
  });

  it("con sesión ofrece los dos caminos y los dos tipos de contacto", () => {
    const t = pagina({}, sesion);
    expect(t).toContain("Hola, Laura");
    expect(t).toContain("Uno a uno");
    expect(t).toContain("Importar un archivo");
    expect(t).toContain("Académicos");
    expect(t).toContain("Empleadores");
    expect(t).toContain("Ya envió 1");
    expect(t).toContain("Campus Cúcuta");
  });

  it("si solo se reciben académicos, no hay selector de tipo", () => {
    const t = pagina({ tipos: ["academico"] }, sesion);
    expect(t).toContain("Uno a uno");
    expect(t).not.toContain("Empleadores");
  });

  it("una invitación en pausa, vencida o de un periodo cerrado no recibe a nadie", () => {
    expect(pagina({ estado: "pausada" }, sesion)).toContain("en pausa");
    expect(pagina({ estado: "vencida" }, sesion)).toContain("ya venció");
    expect(pagina({ estado: "periodo_cerrado" }, null)).toContain("ya cerró");
    expect(pagina({ estado: "pausada" }, sesion)).not.toContain("Uno a uno");
  });

  it("mientras abre, lo dice", () => {
    expect(pagina(null, null)).toContain("Abriendo la invitación");
  });
});

describe("los formularios salen de las plantillas de Rua", () => {
  const renderizar = (el: ReturnType<typeof h>) => texto(renderToString(h(QueryClientProvider, { client: cliente({}, sesion) }, el)));

  it("académico: las once columnas, con la cabecera original entre paréntesis", () => {
    const t = renderizar(h(UnoAUno, { token: TOKEN, sesion, tipo: "academico", onVolver: () => undefined, onTerminado: () => undefined, onSesionVencida: () => undefined }));
    for (const c of ["Source", "Title", "First Name", "Last Name", "Job Title", "Department", "Institution", "Country or Territory", "Email", "Subject", "Phone (Optional)"]) expect(t).toContain(`(${c})`);
    expect(t).toContain("Nombres *");
    expect(t).toContain("Correo *");
    expect(t).toContain("Enviar y agregar otro");
    expect(t).toContain("Terminar y enviar");
    expect(t).toContain("1 enviado hasta ahora");
  });

  it("empleador: las diez columnas, con sector y empresa en lugar de departamento e institución", () => {
    const t = renderizar(h(UnoAUno, { token: TOKEN, sesion, tipo: "empleador", onVolver: () => undefined, onTerminado: () => undefined, onSesionVencida: () => undefined }));
    expect(t).toContain("(Position)");
    expect(t).toContain("(Industry)");
    expect(t).toContain("(Company Name)");
    expect(t).not.toContain("(Department)");
    expect(t).not.toContain("(Subject)");
  });

  it("importar: ofrece la plantilla del tipo con su número de columnas", () => {
    const ac = renderizar(h(ImportarArchivo, { token: TOKEN, sesion, tipo: "academico", onVolver: () => undefined, onEnviado: () => undefined, onSesionVencida: () => undefined }));
    expect(ac).toContain("Descargue la plantilla");
    expect(ac).toContain("11 columnas");
    expect(ac).toContain("Excel (.xlsx)");
    expect(ac).toContain("CSV");
    expect(ac).toContain("Arrastre aquí su Excel o CSV");
    const em = renderizar(h(ImportarArchivo, { token: TOKEN, sesion, tipo: "empleador", onVolver: () => undefined, onEnviado: () => undefined, onSesionVencida: () => undefined }));
    expect(em).toContain("10 columnas");
  });
});
