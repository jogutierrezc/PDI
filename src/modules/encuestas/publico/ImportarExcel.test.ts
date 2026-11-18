// @vitest-environment jsdom
/* La interfaz de importar desde Excel, renderizada en servidor: los dos botones, el panel de revisión
   con listos y problemas (fila y columna), el error de un archivo ajeno y su lugar en «Qué enviar». */

import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { analizarLibro } from "./importar-logros-retos";
import type { HojaCruda } from "./importar-logros-retos";
import { ENCABEZADOS_APORTES, ENCABEZADOS_CIFRAS } from "./plantilla-logros-retos";
import { ImportarExcel, RevisionImportacion } from "./ImportarExcel";
import { Elegir } from "./Pasos";
import { LIMITES } from "../lib/validacion";

vi.mock("../../../lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn() } } }));

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const cruda = (nombre: string, filas: string[][], oculta = false): HojaCruda => ({ nombre, oculta, filas, formulas: new Set() });
const DESC = "Se logró avanzar con el proyecto de la dependencia durante todo el año.";
const resultado = analizarLibro([
  cruda("Logros y retos", [[""], [""], [""], [...ENCABEZADOS_APORTES], ["1", "Logro", "Acreditación de tres programas", DESC, ""], ["2", "Reto", "Hola", DESC, ""]]),
  cruda("Cifras", [[""], [""], [""], [...ENCABEZADOS_CIFRAS], ["1", "", "", "Programas", "3", "", "Programas"], ["2", "", "", "Aulas", "mucho", "", "Estudiantes"]]),
  cruda("_Control", [["formato", "pilo-encuestas-logros-retos"], ["version", "1"], ["origen", "plantilla"]], true),
]);
const props = { resultado, yaHay: [], max: LIMITES.aportes, quitados: new Set<number>(), onQuitar: () => undefined, onAgregar: () => undefined, onCerrar: () => undefined };

describe("ImportarExcel", () => {
  it("ofrece descargar la plantilla e importar, y dice que no se envía nada", () => {
    const html = renderToString(h(ImportarExcel, { slug: "rendicion-2026", titulo: "Rendición", yaHay: [], onAgregar: () => undefined }));
    const t = texto(html);
    expect(t).toContain("Descargar plantilla de Excel");
    expect(t).toContain("Importar desde Excel");
    expect(t).toContain("No se envía nada hasta que usted lo confirme");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('accept=".xlsx');
  });

  it("el panel cuenta listos y con problemas, y señala hoja, fila y columna en lenguaje llano", () => {
    const html = renderToString(h(RevisionImportacion, props));
    const t = texto(html);
    expect(t).toContain("Se encontraron 2 aportes: 1 listo, 1 con problemas");
    expect(t).toContain("Hoja «Logros y retos», fila 6, columna «Título»");
    expect(t).toContain("Hoja «Cifras», fila 6, columna «Valor»");
    expect(t).toContain("Agregar 1 aporte al formulario");
    expect(t).toContain("Aún no se envía nada");
    expect(html).toContain('aria-label="Quitar de la revisión: Hola"');
  });

  it("sin cupo no deja agregar; con lo ya escrito igual, avisa que no se repite", () => {
    const yaHay = Array.from({ length: LIMITES.aportes }, (_, i) => ({ tipo: "reto" as const, titulo: `Escrito ${i}`, descripcion: DESC, cifras: [] }));
    const t = texto(renderToString(h(RevisionImportacion, { ...props, yaHay })));
    expect(t).toContain("Nada para agregar");
    expect(t).toContain("No cabe");
    const repetido = texto(renderToString(h(RevisionImportacion, { ...props, yaHay: [{ tipo: "logro", titulo: "acreditación de tres programas", descripcion: DESC, cifras: [] }] })));
    expect(repetido).toContain("no se agrega otra vez");
  });

  it("un archivo ajeno muestra el motivo como alerta", () => {
    const ajeno = analizarLibro([cruda("Ventas", [["a"]])]);
    const html = renderToString(h(RevisionImportacion, { ...props, resultado: ajeno }));
    expect(html).toContain('role="alert"');
    expect(texto(html)).toContain("No se pudo importar este archivo");
    expect(texto(html)).toContain("no es de la plantilla");
  });

  it("«Qué enviar» lo muestra antes de la lista de lo registrado", () => {
    const cuenta = { correo: "a@udes.edu.co", nombre: "A" };
    const html = renderToString(h(Elegir, { cuenta, dependencia: "Biblioteca", aportes: [], enviando: false, error: null, onElegir: () => undefined, onEditar: () => undefined, onQuitar: () => undefined, onEnviar: () => undefined, importador: h(ImportarExcel, { slug: "s", yaHay: [], onAgregar: () => undefined }) }));
    expect(html.indexOf("Importar desde Excel")).toBeGreaterThan(0);
    expect(html.indexOf("Importar desde Excel")).toBeLessThan(html.indexOf("Lo que lleva registrado"));
  });
});
