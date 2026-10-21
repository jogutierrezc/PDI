// @vitest-environment jsdom
/* El panel de Encuestas con Pilo en servidor: la tabla (roles, aria-sort, vistas,
   estado editable o fijo) y «Título y mensajes». */

import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Aporte, Encuesta } from "../tipos";
import { ConfigEncuesta } from "./ConfigEncuesta";
import { TablaRespuestas } from "./TablaRespuestas";

vi.mock("../../../lib/supabase", () => ({ supabase: {} }));

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const aportes: Aporte[] = [
  {
    id: "a1",
    encuesta_id: "e1",
    correo: "ana@udes.edu.co",
    correo_verificado: true,
    dependencia: "Biblioteca",
    tipo: "reto",
    titulo: "Digitalizar el fondo",
    descripcion: "Falta digitalizar la colección histórica.",
    estado: "recibido",
    created_at: "2026-10-14T14:12:00Z",
    cifras: [{ id: "c1", aporte_id: "a1", orden: 0, que: "Presupuesto", tipo: "dinero", otro: null, valor: 120000000 }],
  },
  {
    id: "a2",
    encuesta_id: "e1",
    correo: "luis@mail.udes.edu.co",
    correo_verificado: false,
    dependencia: "Egresados",
    tipo: "logro",
    titulo: "Red más activa",
    descripcion: "Más encuentros y mentorías durante el año.",
    estado: "para_video",
    created_at: "2026-10-15T10:00:00Z",
    cifras: [{ id: "c2", aporte_id: "a2", orden: 0, que: "Vinculados", tipo: "otro", otro: "egresados", valor: 3150 }],
  },
];

const props = { aportes, slug: "rendicion-2026", onEstado: vi.fn(), onAviso: vi.fn() };

describe("TablaRespuestas", () => {
  it("es una cuadrícula accesible con encabezados que ordenan y una sola celda en el Tab", () => {
    const html = renderToString(h(TablaRespuestas, { ...props, puedeEditar: true }));
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    const t = texto(html);
    expect(t).toContain("Digitalizar el fondo");
    expect(t).toContain("2 aportes en pantalla");
    expect(t).toContain("Copiar para Excel");
    expect(t).toContain("Descargar CSV");
    expect(t).toContain("(sin confirmar)");
  });

  it("quien puede editar tiene el estado en la celda; quien solo lee, el texto", () => {
    expect(renderToString(h(TablaRespuestas, { ...props, puedeEditar: true }))).toContain('aria-label="Estado del aporte «Digitalizar el fondo»"');
    const lectura = renderToString(h(TablaRespuestas, { ...props, puedeEditar: false }));
    expect(lectura).not.toContain("<select class=\"en-est\"");
    expect(texto(lectura)).toContain("Para video");
  });

  it("sin aportes lo dice", () => {
    expect(texto(renderToString(h(TablaRespuestas, { ...props, aportes: [], puedeEditar: false })))).toContain("Aún no llega ningún aporte");
  });
});

describe("ConfigEncuesta", () => {
  const encuesta: Encuesta = {
    id: "e1",
    slug: "rendicion-2026",
    titulo: "Construyamos juntos la Rendición de Cuentas",
    anio: "2026",
    abierta: true,
    cierra_el: "2026-11-15",
    intro: "Estoy recopilando cifras.",
    despedida: "Gracias por su aporte.",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  it("quien edita ve el botón de guardar y la vista previa", () => {
    const html = renderToString(h(ConfigEncuesta, { encuesta, puedeEditar: true, guardando: false, onGuardar: vi.fn() }));
    expect(html).toContain('value="2026-11-15"');
    const t = texto(html);
    expect(t).toContain("Guardar cambios");
    expect(t).toContain("Estoy recopilando cifras.");
    expect(t).toContain("Por ahora esta encuesta trae estas preguntas fijas");
  });
  it("quien solo lee no tiene botón de guardar y los campos no se editan", () => {
    const html = renderToString(h(ConfigEncuesta, { encuesta, puedeEditar: false, guardando: false, onGuardar: vi.fn() }));
    expect(texto(html)).not.toContain("Guardar cambios");
    expect(html).toContain(`readonly=""`);
  });
});
