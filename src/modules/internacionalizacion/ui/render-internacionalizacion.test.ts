// @vitest-environment jsdom
/* Las pantallas de Internacionalización renderizadas en servidor con datos
   falsos: cada sección por papel (Director, Coordinador, Gestor), los estados
   vacío y de error, y el aviso de la migración 0151 sin aplicar. */

import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Yo } from "../tipos";

vi.mock("../../../components/tour/TourProvider", () => ({ useTour: () => ({ start: () => undefined, isDone: () => true, active: null }) }));

const estado = vi.hoisted(() => ({ admin: false, yo: null as unknown, error: null as Error | null, periodos: null as unknown, vacio: false }));

vi.mock("../../../lib/auth", async (orig) => ({
  ...(await orig<typeof import("../../../lib/auth")>()),
  useAuth: () => ({ loading: false, profile: { id: "u1", role: estado.admin ? "admin" : "consulta" }, hasRole: (r: string) => (r === "admin" ? estado.admin : true) }),
}));

vi.mock("../../reportes/store", async (orig) => ({
  ...(await orig<typeof import("../../reportes/store")>()),
  useCatalogos: () => ({ data: { municipio: [] }, error: null }),
  useSedes: () => ({ data: [], error: null }),
}));

vi.mock("../datos", async (orig) => {
  const real = await orig<typeof import("../datos")>();
  const f = await import("../../../../tests/internacionalizacion/fixtures");
  const ok = (data: unknown) => ({ data, error: null, isPending: false, isFetching: false });
  const conErr = (data: unknown) => (estado.error ? { data: undefined, error: estado.error, isPending: false } : ok(data));
  const mut = () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false, error: null });
  return {
    ...real,
    useYo: () => conErr(estado.yo),
    useCampus: () => conErr(f.CAMPUS),
    usePeriodos: () => conErr(estado.periodos ?? f.PERIODOS),
    useEnvios: () => ok(f.ENVIOS),
    useCifras: () => ok(f.CIFRAS),
    useCifrasPeriodos: (ids: string[]) => ids.map(() => ok(f.CIFRAS)),
    useEstructura: () => ok(estado.vacio ? [] : f.ESTRUCTURA),
    useConceptos: () => ok(f.CONCEPTOS),
    usePlantillas: () => ok([]),
    useVentanas: () => ok(f.VENTANAS),
    useFilas: () => ok(f.FILAS),
    useHistorial: () => ok([]),
    useReaperturas: () => ok([]),
    useMiembros: () => ok(f.MIEMBROS),
    usePersonas: () => ok(undefined),
    useNombres: () => ok({}),
    useEnviosSnies: () => ok([]),
    useCambiarEstado: mut,
    useGuardarFilas: mut,
    useBorrarFilas: mut,
    useBorrarLibro: mut,
    useCrearTabla: mut,
    useGuardarHoja: mut,
    useGuardarColumnas: mut,
    useGuardarPeriodo: mut,
    useGuardarVentana: mut,
    useBorrarVentana: mut,
    useReabrir: mut,
    useGuardarMiembro: mut,
    useQuitarMiembro: mut,
    useGuardarPlantilla: mut,
    useBorrarPlantilla: mut,
    useEnviarSnies: mut,
  };
});

import { Internacionalizacion } from "./Internacionalizacion";
import { FaltaMigracion } from "../datos";
import { YO } from "../../../../tests/internacionalizacion/fixtures";

function pintar(ruta: string, yo: Yo, admin = false): string {
  estado.yo = yo;
  estado.admin = admin;
  const client = new QueryClient();
  return renderToString(
    h(
      QueryClientProvider,
      { client },
      h(MemoryRouter, { initialEntries: [ruta] }, h(Routes, null, h(Route, { path: "/admin/internacionalizacion/:seccion?", element: h(Internacionalizacion) }), h(Route, { path: "*", element: h("p", null, "fuera") }))),
    ),
  );
}

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

afterEach(() => Object.assign(estado, { admin: false, yo: null, error: null, periodos: null, vacio: false }));

describe("Resumen", () => {
  it("el Director ve los cuatro campus, lo pendiente y la cobertura de las plantillas", () => {
    const t = texto(pintar("/admin/internacionalizacion", YO.director));
    for (const c of ["Valledupar", "Bucaramanga", "Cúcuta", "Bogotá"]) expect(t).toContain(c);
    expect(t).toContain("Qué falta para cerrar 2026-2");
    expect(t).toContain("Lo aprueba el Director");
    expect(t).toContain("Plantillas que el repositorio ya responde");
    expect(t).toContain("Accesos");
    // El riel del marco: secciones, carpetas por clase y el buscador.
    expect(t).toContain("Carpetas");
    expect(t).toContain("Buscar tablas, secciones y acciones");
  });

  it("el Gestor solo ve su campus y no tiene Accesos", () => {
    const t = texto(pintar("/admin/internacionalizacion", YO.gestor));
    expect(t).toContain("Bucaramanga");
    expect(t).not.toContain("Valledupar");
    expect(t).not.toContain("Accesos");
  });

  it("sin periodos: el Director recibe la invitación a abrir el primero", () => {
    estado.periodos = [];
    expect(texto(pintar("/admin/internacionalizacion", YO.director))).toContain("Abrir el primer periodo");
  });

  it("sin la migración 0151 lo dice, en vez de romperse", () => {
    estado.error = new FaltaMigracion("Falta aplicar la migración 0151 (Internacionalización).");
    expect(texto(pintar("/admin/internacionalizacion", YO.director))).toContain("Falta aplicar la migración 0151");
  });

  it("alguien sin campus asignado recibe a quién pedírselo", () => {
    expect(texto(pintar("/admin/internacionalizacion", { director: false, coordinador: [], gestor: [] }))).toContain("Todavía no tiene campus asignado");
  });
});

describe("Cifras", () => {
  it("el Director tiene el conmutador de qué cuenta, el CSV y la serie por periodo", () => {
    const t = texto(pintar("/admin/internacionalizacion/cifras", YO.director));
    expect(t).toContain("Solo aprobado");
    expect(t).toContain("Exportar CSV");
    expect(t).toContain("Movilidad por periodo");
    expect(t).toContain("México");
  });

  it("el Coordinador no ve el conmutador", () => {
    const t = texto(pintar("/admin/internacionalizacion/cifras", YO.coordinador));
    expect(t).not.toContain("Desde enviado");
    expect(t).toContain("Exportar CSV");
  });
});

describe("Tablas", () => {
  it("el Director ve las tablas como archivos, por clase, y puede crear tablas", () => {
    const t = texto(pintar("/admin/internacionalizacion/tablas?campus=c-vup", YO.director));
    expect(t).toContain("Nueva tabla");
    expect(t).toContain("Desde Excel");
    expect(t).toContain("Movilidad");
    expect(t).toContain("Convenios");
    expect(t).toContain("Seleccione una tabla");
  });

  it("al abrir una carpeta se ven sus tablas con el avance por campus", () => {
    // Una sola clase en el libro seleccionado: el detalle muestra hojas, campus y las acciones del Director.
    const t = texto(pintar("/admin/internacionalizacion/tablas?libro=l-mov&campus=c-vup", YO.director));
    expect(t).toContain("Movilidad estudiantil");
    expect(t).toContain("Hojas por campus");
    expect(t).toContain("Nueva hoja");
    expect(t).toContain("Borrar tabla");
    expect(t).toContain("aprobadas");
  });

  it("el Director abre la hoja: pestañas, carga de Excel y puede aprobar lo validado", () => {
    const t = texto(pintar("/admin/internacionalizacion/tablas?libro=l-mov&hoja=h-sal&campus=c-vup", YO.director));
    expect(t).toContain("Aprobar");
    expect(t).toContain("Cargar Excel");
    expect(t).toContain("Nueva hoja");
    expect(t).toContain("Entrante");
    expect(t).toContain("Historial de estados");
  });

  it("el Coordinador valida o devuelve su campus, sin crear tablas", () => {
    const html = pintar("/admin/internacionalizacion/tablas?libro=l-mov&hoja=h-sal", YO.coordinador);
    const t = texto(html);
    expect(t).not.toContain("Nueva tabla");
    expect(t).not.toContain("Nueva hoja");
    expect(t).toContain("Validar");
    expect(t).toContain("Devolver");
    // Solo las filas de su campus: la de Bucaramanga no se pinta.
    // La ventana de su campus está cerrada: la fila se ve como texto y lo personal, oculto.
    expect(t).toContain("Derecho");
    expect(t).toContain("••••3456");
    expect(html).not.toContain("Ingeniería de Sistemas");
  });

  it("la hoja marca el error de la fecha de fin antes del inicio", () => {
    const html = pintar("/admin/internacionalizacion/tablas?libro=l-mov&hoja=h-sal&campus=c-cuc", YO.director);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-label="Fecha de fin"');
    expect(html).toContain("Fecha de fin");
  });

  it("el Gestor ve su campus en la hoja y el estado del envío", () => {
    const html = pintar("/admin/internacionalizacion/tablas?libro=l-mov&hoja=h-sal", YO.gestor);
    // La hoja de Bucaramanga está aprobada: solo lectura.
    expect(texto(html)).toContain("Bucaramanga");
    expect(texto(html)).toContain("Ingeniería de Sistemas");
    expect(texto(html)).toContain("Solo lectura");
    expect(html).not.toContain("Derecho");
  });

  it("sin tablas, el Director recibe cómo empezar", () => {
    estado.vacio = true;
    expect(texto(pintar("/admin/internacionalizacion/tablas", YO.director))).toContain("Ninguna tabla abierta");
  });
});

describe("Plantillas", () => {
  it("lista las plantillas SNIES del catálogo de Reportes y ofrece cargar CNA o rankings al Director", () => {
    const t = texto(pintar("/admin/internacionalizacion/plantillas", YO.director));
    expect(t).toContain("SNIES (catálogo de Reportes)");
    expect(t).toContain("Cargar plantilla");
    expect(t).toContain("Columnas de la plantilla");
  });
});

describe("Periodos", () => {
  it("el Director ve la cinta, la línea de tiempo con hoy y puede cerrar y abrir", () => {
    const t = texto(pintar("/admin/internacionalizacion/periodos", YO.director));
    expect(t).toContain("2026-1");
    expect(t).toContain("Hoy");
    expect(t).toContain("Cerrar 2026-2");
    expect(t).toContain("Abrir periodo");
    expect(t).toContain("Cúcuta · cerrada");
    expect(t).toContain("Reaperturas de 2026-2");
  });

  it("el Gestor la ve sin acciones", () => {
    const t = texto(pintar("/admin/internacionalizacion/periodos", YO.gestor));
    expect(t).toContain("Ventanas de captura de 2026-2");
    expect(t).not.toContain("Abrir periodo");
    expect(t).not.toContain("Cambiar ventana");
  });
});

describe("Accesos", () => {
  it("el Director ve el equipo por campus y nombra coordinadores y gestores, no directores", () => {
    const t = texto(pintar("/admin/internacionalizacion/accesos", YO.director));
    expect(t).toContain("Equipo del módulo");
    expect(t).toContain("Coordinador de prueba");
    expect(t).toContain("Nadie nombrado");
    expect(t).not.toContain("Todo el módulo, sin campus");
  });

  it("la administración también puede nombrar al Director", () => {
    expect(texto(pintar("/admin/internacionalizacion/accesos", YO.director, true))).toContain("Todo el módulo, sin campus");
  });

  it("quien no es Director no entra: vuelve al resumen", () => {
    expect(texto(pintar("/admin/internacionalizacion/accesos", YO.gestor))).not.toContain("Equipo del módulo");
  });
});
