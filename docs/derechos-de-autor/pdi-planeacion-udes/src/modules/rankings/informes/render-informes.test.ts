// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InformeCompleto } from "./tipos";

/* La cáscara de la intranet necesita tema y sesión: aquí basta con su contenido. */
vi.mock("../../admin/components/AdminShell", () => ({
  AdminShell: ({ title, rail, children }: { title: string; rail?: ReactNode; children: ReactNode }) => h("div", null, h("h1", null, title), rail, children),
  AdminRail: ({ children }: { children: ReactNode }) => h("nav", null, children),
  AdminRailTab: ({ children }: { children: ReactNode }) => h("span", null, children),
}));
vi.mock("../../../lib/auth", async (orig) => ({
  ...(await orig<typeof import("../../../lib/auth")>()),
  useAuth: () => ({ loading: false, profile: { id: "u1", role: "planeacion" }, session: null }),
}));
vi.mock("../noticias", async (orig) => ({
  ...(await orig<typeof import("../noticias")>()),
  useNewsInbox: () => ({ data: [], error: null, isPending: false, refetch: () => {} }),
  useNewsRuns: () => ({ data: [], error: null, isPending: false, refetch: () => {} }),
}));

const datos = vi.hoisted(() => ({ informe: null as InformeCompleto | null }));
vi.mock("./datos", async (orig) => {
  const real = await orig<typeof import("./datos")>();
  const { NOTAS_EJEMPLO } = await import("./ejemplo-ods4");
  const mutacion = () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false, error: null });
  return {
    ...real,
    useInforme: (ods: number) => ({ data: ods === datos.informe?.informe.ods ? datos.informe : null, isPending: false, error: null, refetch: () => {} }),
    useCrearInforme: mutacion,
    useGuardarBloque: mutacion,
    useAgregarBloque: mutacion,
    useQuitarBloque: mutacion,
    useGuardarFoto: mutacion,
    useGuardarEleccion: mutacion,
    useCambiarEstadoInforme: mutacion,
    useGuardarAjustes: mutacion,
    useNoticiasDeOds: () => ({ data: NOTAS_EJEMPLO, isPending: false, error: null }),
    usePiloInforme: () => ({ corriendo: false, progreso: real.PROGRESO_INFORME_CERO, error: null, faltaMigracion: false, iniciar: () => {}, detener: () => {} }),
    piloInformeEstado: async () => ({ lista: true }),
  };
});

import { RankingsAdmin } from "../RankingsAdmin";
import { INFORME_EJEMPLO } from "./ejemplo-ods4";

const page = (path: string) =>
  renderToString(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/admin/rankings/:seccion?", element: h(RankingsAdmin) }))),
    ),
  ).replace(/<!-- -->/g, "");

describe("Informes ODS con Pilo · intranet", () => {
  it("el tablero y THE Impact llevan a «Redactar informes con Pilo»", () => {
    datos.informe = null;
    expect(page("/admin/rankings")).toContain('href="/admin/rankings/informes"');
    expect(page("/admin/rankings/impact")).toContain("Redactar informes con Pilo");
  });

  it("sin informe: los 17 ODS con su estado y «Crear informe»", () => {
    datos.informe = null;
    const html = page("/admin/rankings/informes?ods=4");
    expect(html).toContain("Informes ODS con Pilo");
    expect(html.match(/class="ri-franja"/g)?.length).toBe(17);
    expect(html).toContain("Sin informe");
    expect(html).toContain("todavía no tiene informe de la edición 2025");
    expect(html).toContain("Crear informe");
    expect(html).not.toContain('role="tablist"');
  });

  it("redactar: origen de cada párrafo, cifras verificadas y el pasaje literal resaltado", () => {
    datos.informe = INFORME_EJEMPLO;
    const html = page("/admin/rankings/informes?ods=4&tab=redactar");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Redactó Pilo");
    expect(html).toContain("Pilo + persona");
    expect(html).toContain("Cifras verificadas");
    expect(html).toContain("Lo que Pilo tomó");
    expect(html).toContain("<mark>más de 400 estudiantes de bachillerato</mark>");
    expect(html).toContain("Que Pilo redacte este ODS");
    expect(html).toContain("Que Pilo añada un párrafo (1 en reserva)");
    expect(html).toContain("Pasar a revisión");
    expect(html).toContain('rel="noopener noreferrer"');
    /* El párrafo de reserva no está en el informe hasta que se añade. */
    expect(html).not.toContain("Un párrafo de reserva");
    expect(html).not.toMatch(/window\.confirm/);
  });

  it("publicar se bloquea con sus motivos o pide confirmación en la propia pantalla", () => {
    datos.informe = INFORME_EJEMPLO;
    const html = page("/admin/rankings/informes?ods=4");
    expect(html).toMatch(/>Publicar<\/button>/);
  });

  it("evidencia por indicador: una sola nota, puntos de THE y la página limpia en español e inglés", () => {
    datos.informe = INFORME_EJEMPLO;
    const html = page("/admin/rankings/informes?ods=4&tab=indicadores");
    expect(html).toContain("4.3.4");
    expect(html).toContain("La mejor");
    expect(html).toContain("Aprobar esta evidencia");
    expect(html).toContain("Evidence · Indicator 4.3.4");
    expect(html).toContain('lang="en"');
    expect(html).toContain("udes.edu.co/comunicaciones/noticias/el-recolector-la-libertad");
    const hoja = html.slice(html.indexOf('class="oev-sheet"'), html.indexOf("Dirección pública"));
    expect(hoja).not.toMatch(/<a /);
  });

  it("fotografías: recortador con proporciones, autorización de menores y campos editables", () => {
    datos.informe = INFORME_EJEMPLO;
    const html = page("/admin/rankings/informes?ods=4&tab=fotos");
    for (const r of ["3:1", "16:9", "4:3", "1:1"]) expect(html).toContain(`>${r}</button>`);
    expect(html).toContain("Tengo la autorización de imagen");
    expect(html).toContain("object-position:30% 25%");
    expect(html).toContain("Pie de foto");
    expect(html).toContain("Texto alternativo");
  });

  it("vista previa: el mismo cuerpo del portal, sin la foto de menores sin autorización", () => {
    datos.informe = INFORME_EJEMPLO;
    const html = page("/admin/rankings/informes?ods=4&tab=vista");
    expect(html).toContain("Lo que hicimos en 2025");
    expect(html).toContain("La UDES forma maestros");
    expect(html).toContain("aspect-ratio:3 / 1");
    expect(html).toContain("Pie de la foto de mutis");
    expect(html).not.toContain("Pie de la foto de diplomado");
    expect(html).toContain("La UDES en las noticias");
  });
});
