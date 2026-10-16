// @vitest-environment jsdom
/* El explorador, el editor y el asistente de Programas en Cifras renderizados
   en servidor con datos de ejemplo: lo que ve el Director y lo que ve Planeación. */

import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ArchivoCompleto, PcCarpetaRow, PcColumnaRow, PcRespuestaRow, PcRolEfectivo } from "../tipos";

const ok = (data: unknown) => ({ data, error: null, isPending: false, isFetching: false, refetch: async () => ({ data }) });
const mut = () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false, error: null });

const col = (clave: string, etiqueta: string, tipo: PcColumnaRow["tipo"], orden: number, extra: Partial<PcColumnaRow> = {}): PcColumnaRow => ({
  id: clave, archivo_id: "f1", clave, etiqueta, tipo, obligatorio: false, opciones: [], solo_lectura: null, posterior_a: null, personal: false, orden, ...extra,
});
const FILAS = [
  { id: "r1", datos: { grupo: "Grupo de Ingeniería de Software", codigo: "COL0054321", cat: "B" } },
  { id: "r2", datos: { grupo: "Grupo de Redes", codigo: "", cat: "Z" } },
];

vi.mock("../datos", async (orig) => ({
  ...(await orig<typeof import("../datos")>()),
  useFilas: () => ok(FILAS),
  useActividad: () => ok([{ id: 1, accion: "filas", en: "2026-10-16T10:00:00Z" }]),
  useGuardarFilas: mut, useMarcarListo: mut, useActualizarArchivo: mut, useGuardarColumnas: mut, useGuardarRespuesta: mut, useQuitarRespuesta: mut,
  useBorrarArchivo: mut, useGuardarMiembro: mut, useQuitarMiembro: mut, useCerrarPeriodo: mut, useReabrirPeriodo: mut, useDefinirVentana: mut, useCrearArchivo: mut,
}));

const MIEMBROS = [
  { id: "m1", user_id: "u1", rol: "director", programa_id: "p", campus_id: "c", created_at: "", nombre: "Marta Ruiz", email: "marta@udes.edu.co" },
  { id: "m2", user_id: "u2", rol: "coordinador", programa_id: "p", campus_id: "c", created_at: "", nombre: "Luis Vega", email: "luis@udes.edu.co" },
];
vi.mock("./equipo-datos", async (orig) => ({ ...(await orig<typeof import("./equipo-datos")>()), useTodosMiembros: () => ok(MIEMBROS) }));
vi.mock("../../internacionalizacion/datos", async (orig) => ({ ...(await orig<typeof import("../../internacionalizacion/datos")>()), usePersonas: () => ({ data: undefined, isFetching: false, error: null }) }));

const { ProveedorEspacio } = await import("./contexto");
const { Riel, Migas, Comandos, ZonaArchivos } = await import("./Explorador");
const { Detalles } = await import("./Detalles");
const { Editor } = await import("./Editor");
const { Asistente } = await import("./Asistente");
const { Equipo } = await import("./Equipo");

const CARPETAS: PcCarpetaRow[] = [
  { id: "cna", clave: "cna", programa_id: null, campus_id: null, nombre: "Cuadro Maestro CNA 2026", subtitulo: "Cuadros que pide el CNA", orden: 1, fija: true },
  { id: "tr", clave: "trabajo", programa_id: null, campus_id: null, nombre: "Trabajo del programa", subtitulo: "Tablas y listas propias", orden: 3, fija: true },
];
const ARCHIVO: ArchivoCompleto = {
  id: "f1", programa_id: "p", campus_id: "c", carpeta_id: "cna", nombre: "07 Grupos y líneas", tipo: "tabla", estado: "borrador", bloqueado: true, destino_origen: "cna07",
  listo_en: null, listo_por: null, created_by: null, updated_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T09:00:00Z",
  columnas: [col("grupo", "Nombre del grupo de investigación o creación que apoya al programa", "texto", 1, { obligatorio: true }), col("codigo", "Código del grupo en MinCiencias", "texto", 2, { obligatorio: true }), col("cat", "Categoría 957_2024", "lista", 3, { opciones: ["A1", "A", "B", "C"] })],
};
const RESPUESTA: PcRespuestaRow = { id: "x", archivo_id: "f1", destino_id: "cna07", mapa: { grupo: "grupo", codigo_grupo: "codigo", categoria_957_2024: "cat" }, updated_at: "2026-10-16T09:00:00Z" };

function espacio(rol: PcRolEfectivo, extra: Record<string, unknown> = {}) {
  return {
    pareja: { programa_id: "p", campus_id: "c", rol: rol ?? "planeacion", programa: "Ingeniería de Sistemas", programa_codigo: "IS", campus: "Bucaramanga" },
    rol, editable: rol === "director" || rol === "coordinador", admin: false, verEquipo: false, parejas: [], carpetas: CARPETAS, archivos: [ARCHIVO], resumen: new Map([["f1", { archivo_id: "f1", filas: 2, errores: 2 }]]),
    respuestas: [RESPUESTA], periodos: { ventana: { anios: 5 as const, hasta: "2025-02" }, periodos: [{ codigo: "2025-01", cerrado: true, cerrado_en: null }, { codigo: "2025-02", cerrado: false, cerrado_en: null }], siguiente: "2025-02", completa: false, cerrados: 1, total: 2 },
    salud: false, decir: () => {}, abrirEditor: () => {}, abrirAsistente: () => {}, empezarRecorrido: () => {}, ...extra,
  };
}
const control = (parcial = {}) => ({ estado: { seccion: "archivos" as const, carpeta: "cna", filtro: "todos" as const, vista: "mosaicos" as const, detalles: true, seleccion: "f1", ...parcial }, cambiar: () => {}, nuevaCarpeta: () => {} });
const envolver = (rol: PcRolEfectivo, ...hijos: Parameters<typeof h>[2][]) => renderToString(h(MemoryRouter, null, h(ProveedorEspacio, { value: espacio(rol) }, ...hijos)));
const PAREJAS = [
  { programa_id: "p", campus_id: "c", rol: "director" as const, programa: "Ingeniería de Sistemas", programa_codigo: "IS", campus: "Bucaramanga" },
  { programa_id: "q", campus_id: "c", rol: "planeacion" as const, programa: "Derecho", programa_codigo: "DE", campus: "Bucaramanga" },
];
const como = (rol: PcRolEfectivo, extra: Record<string, unknown>, ...hijos: Parameters<typeof h>[2][]) =>
  renderToString(h(QueryClientProvider, { client: new QueryClient() }, h(MemoryRouter, null, h(ProveedorEspacio, { value: espacio(rol, extra) }, ...hijos))));

describe("explorador", () => {
  it("el Director ve mosaicos con estado, destino y los botones de crear", () => {
    const c = control();
    const html = envolver("director", h(Riel, { control: c }), h(Migas, { control: c }), h(Comandos, { control: c, onNuevo: () => {}, onSubir: () => {} }), h(ZonaArchivos, { control: c, onPlantilla: () => {} }), h(Detalles, { control: c, onEmitir: () => {} }));
    expect(html).toContain("07 Grupos y líneas");
    expect(html).toContain("2 errores");
    expect(html).toContain("CNA · 07");
    expect(html).toContain("Subir plantilla");
    expect(html).not.toContain("Modo observador");
    expect(html).toContain("Responde a");
  });

  it("Planeación ve todo en modo observador y sin crear", () => {
    const c = control();
    const html = envolver("planeacion", h(Comandos, { control: c, onNuevo: () => {}, onSubir: () => {} }), h(ZonaArchivos, { control: c, onPlantilla: () => {} }));
    expect(html).toContain("Modo observador");
    expect(html).toContain('data-tour="pc-nuevo" disabled');
  });

  it("la carpeta del CNA muestra la ruta de periodos y el botón de emitir", () => {
    const html = envolver("director", h(Detalles, { control: control({ seleccion: null }), onEmitir: () => {} }));
    expect(html).toContain("2025-02");
    expect(html).toContain("Cerrar el periodo");
    expect(html).toContain("Emitir el Cuadro Maestro");
  });

  it("la vista Plantillas lista los cuadros y marca los automáticos", () => {
    const html = envolver("director", h(ZonaArchivos, { control: control({ seccion: "plantillas", carpeta: null }), onPlantilla: () => {} }));
    expect(html).toContain("Automático");
    expect(html).toContain("Abrir su archivo");
  });
});

describe("editor", () => {
  it("el Director ve el nombre, las herramientas y «Marcar como listo»", () => {
    const html = envolver("director", h(Editor, { archivoId: "f1", origen: null, onCerrar: () => {} }));
    expect(html).toContain("Marcar como listo");
    expect(html).toContain("Buscar en el archivo");
    expect(html).toContain("Responde a");
    expect(html).not.toContain("Solo lectura · Planeación");
  });

  it("Planeación lo ve en solo lectura, sin botones de edición", () => {
    const html = envolver("planeacion", h(Editor, { archivoId: "f1", origen: null, onCerrar: () => {} }));
    expect(html).toContain("Solo lectura · Planeación");
    expect(html).not.toContain("Marcar como listo");
    expect(html).not.toContain("Agregar fila");
  });
});

describe("asistente", () => {
  it("abre en el paso 1 con las cuatro opciones y a Pilo al costado", () => {
    const html = envolver("director", h(Asistente, { opciones: { origen: null }, onCerrar: () => {}, onCreado: () => {} }));
    expect(html).toContain("Tabla en blanco");
    expect(html).toContain("Desde mi plantilla de Excel");
    expect(html).toContain("Para un cuadro del CNA o del SNIES");
    expect(html).toContain("Empiece por lo que quiere guardar");
  });

  it("desde un cuadro del CNA salta a la revisión con los campos fijos", () => {
    const html = envolver("director", h(Asistente, { opciones: { origen: null, destino: "cna09" }, onCerrar: () => {}, onCreado: () => {} }));
    expect(html).toContain("Aquí armamos la estructura");
  });
});

describe("equipo", () => {
  it("el Director ve a su equipo, puede agregar y quitar, y no ve «Todos los programas»", () => {
    const html = como("director", { verEquipo: true, parejas: PAREJAS }, h(Equipo), h(Riel, { control: control({ seccion: "equipo", carpeta: null }) }));
    expect(html).toContain("Marta Ruiz");
    expect(html).toContain("luis@udes.edu.co");
    expect(html).toContain("Agregar persona");
    expect(html).toContain("Quitar a Luis Vega");
    expect(html).not.toContain("Quitar a Marta Ruiz");
    expect(html).not.toContain("Todos los programas");
    expect(html).toContain("Qué puede hacer cada rol");
  });

  it("quien no dirige no ve «Equipo» en el riel", () => {
    expect(como("coordinador", { verEquipo: false }, h(Riel, { control: control() }))).not.toContain("Equipo");
    expect(como("director", { verEquipo: true }, h(Riel, { control: control() }))).toContain("Equipo");
  });

  it("la administración ve «Todos los programas» y puede quitar también al Director", () => {
    const html = como("planeacion", { admin: true, verEquipo: true, parejas: PAREJAS }, h(Equipo));
    expect(html).toContain("Todos los programas");
    expect(html).toContain("Quitar a Marta Ruiz");
  });
});
