// @vitest-environment jsdom
/* El panel de Encuestas con Pilo en servidor: la tabla (roles, aria-sort, vistas,
   estado editable o fijo) y «Título y mensajes». */

import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Aporte, Encuesta } from "../tipos";
import { plantillaDe } from "../lib/plantillas";
import { preguntasDe } from "../lib/estructura";
import { leerConfig } from "../lib/config";
import { Entrada } from "../publico/Campos";
import { Formulario } from "../publico/Formulario";
import { Acceso } from "./Acceso";
import { EstructuraCol } from "./Estructura";
import { PropiedadesCol } from "./Propiedades";
import { Resultados } from "./Resultados";
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

const encuesta: Encuesta = {
  id: "e1",
  slug: "satisfaccion",
  titulo: "Encuesta de satisfacción",
  anio: "2026",
  abierta: false,
  cierra_el: null,
  intro: "Estoy recopilando opiniones.",
  despedida: "Gracias por responder.",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  acceso: "microsoft",
  dominios_permitidos: ["udes.edu.co"],
  una_por_persona: false,
  abre_el: null,
  limite_respuestas: null,
  mensaje_cierre: "",
  estado: "borrador",
  plantilla_origen: "satisfaccion",
  modo_llenado: "guiado",
  config_pilo: {},
  version_publicada_id: null,
};
const estructura = plantillaDe("satisfaccion")!.estructura();

describe("editor: columnas", () => {
  it("la estructura lista las preguntas con asa, subir y bajar", () => {
    const html = renderToString(h(EstructuraCol, { estructura, seleccion: "servicio", puedeEditar: true, onSeleccionar: vi.fn(), onNombreSeccion: vi.fn(), onMover: vi.fn(), onArrastrar: vi.fn(), onAgregar: vi.fn(), onAgregarSeccion: vi.fn(), onQuitarSeccion: vi.fn(), onMoverSeccion: vi.fn() }));
    expect(texto(html)).toContain("5 preguntas");
    expect(html).toContain("arrastre, o use Alt con flecha arriba o abajo");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Subir «¿Qué servicio utilizó?»");
    expect(html).toContain('aria-live="polite"');
  });
  it("quien solo lee no ve asas ni botones de mover", () => {
    const html = renderToString(h(EstructuraCol, { estructura, seleccion: null, puedeEditar: false, onSeleccionar: vi.fn(), onNombreSeccion: vi.fn(), onMover: vi.fn(), onArrastrar: vi.fn(), onAgregar: vi.fn(), onAgregarSeccion: vi.fn(), onQuitarSeccion: vi.fn(), onMoverSeccion: vi.fn() }));
    expect(html).not.toContain("ed-asa");
    expect(html).not.toContain("Agregar pregunta");
  });
  it("las propiedades traen la Capa de Pilo con su botón de sugerencia", () => {
    const html = renderToString(h(PropiedadesCol, { pregunta: estructura.secciones[0].preguntas[1], anteriores: [estructura.secciones[0].preguntas[0]], tituloEncuesta: "x", puedeEditar: true, iaEncendida: true, onCambiar: vi.fn() }));
    const t = texto(html);
    expect(t).toContain("Capa de Pilo");
    expect(t).toContain("Que Pilo la sugiera");
    expect(t).toContain("Mostrar si");
    expect(html).toContain("1 es nada satisfecho");
  });
});

describe("acceso, presentación y resultados", () => {
  it("el acceso lista «Antes de publicar» y deshabilita Publicar si algo falta", () => {
    const html = renderToString(h(Acceso, { encuesta: { ...encuesta, mensaje_cierre: "" }, estructura, puedeEditar: true, guardando: false, publicando: false, onGuardar: vi.fn(), onPublicar: vi.fn(), onAviso: vi.fn() }));
    const t = texto(html);
    expect(t).toContain("Antes de publicar");
    expect(t).toContain("Tiene un mensaje para cuando cierre");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Publicar encuesta<\/button>/);
    expect(html).toContain("Código QR del enlace");
  });
  it("abierta pide verificación contra robots y no ofrece «una por persona»", () => {
    const html = renderToString(h(Acceso, { encuesta: { ...encuesta, acceso: "abierta" }, estructura, puedeEditar: true, guardando: false, publicando: false, onGuardar: vi.fn(), onPublicar: vi.fn(), onAviso: vi.fn() }));
    const t = texto(html);
    expect(t).toContain("Verificación contra robots");
    expect(t).not.toContain("Una respuesta por persona");
  });
  it("los resultados cuentan por estado y dibujan barras con su número", () => {
    const r = (id: string, valores: Record<string, unknown>, e: "recibido" | "revisado" = "recibido") => ({ id, estado: e, valores: valores as never });
    const html = renderToString(h(Resultados, { estructura, respuestas: [r("1", { satisfaccion: 5 }), r("2", { satisfaccion: 5 }, "revisado"), { ...r("3", { satisfaccion: 1 }), borrado_en: "2026-10-01" }] }));
    const t = texto(html);
    expect(t).toContain("2 respuestas");
    expect(t).toContain("Revisado");
    expect(html).toContain("data-barra");
  });
  it("sin respuestas lo dice", () => {
    expect(texto(renderToString(h(Resultados, { estructura, respuestas: [] })))).toContain("Todavía no hay resultados");
  });
});

describe("renderizador público de la estructura", () => {
  const config = leerConfig({});
  const base = { estructura, config, valores: {}, onValores: vi.fn(), enviando: false, errorEnvio: null, onEnviar: vi.fn() };
  it("el clásico pone todas las secciones y la ayuda de Pilo como texto", () => {
    const html = renderToString(h(Formulario, { ...base, modo: "clasico" }));
    const t = texto(html);
    expect(t).toContain("¿Qué servicio utilizó?");
    expect(t).toContain("1 es nada satisfecho");
    expect(t).toContain("(opcional)");
    expect(html).not.toContain("porque_no");
  });
  it("la lógica «mostrar si» oculta y muestra", () => {
    expect(renderToString(h(Formulario, { ...base, modo: "clasico", valores: { volveria: "no" } }))).toContain("q-porque_no");
  });
  it("el guiado muestra el avance y botón Siguiente o Enviar", () => {
    const multi = plantillaDe("evento")!.estructura();
    const html = renderToString(h(Formulario, { ...base, estructura: multi, modo: "guiado" }));
    expect(texto(html)).toContain("Parte 1 de 2");
    expect(texto(html)).toContain("Siguiente");
  });
  it("cada tipo de campo se pinta", () => {
    for (const p of preguntasDe(plantillaDe("evento")!.estructura())) {
      expect(renderToString(h(Entrada, { p, valor: undefined, decir: vi.fn(), onCambio: vi.fn(), onFoco: vi.fn() }))).toContain(`q-${p.id}`);
    }
  });
});
