// @vitest-environment jsdom
import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NewsItem } from "./noticias";

/* La cáscara de la intranet necesita tema y sesión: aquí basta con su contenido. */
vi.mock("../admin/components/AdminShell", () => ({
  AdminShell: ({ title, description, rail, children }: { title: string; description?: string; rail?: ReactNode; children: ReactNode }) =>
    h("div", null, h("h1", null, title), h("p", null, description), rail, children),
  AdminRail: ({ children }: { children: ReactNode }) => h("nav", null, children),
  AdminRailTab: ({ children, count }: { children: ReactNode; count?: number }) => h("span", { "data-count": count }, children),
}));
vi.mock("../../lib/auth", async (orig) => ({
  ...(await orig<typeof import("../../lib/auth")>()),
  useAuth: () => ({ loading: false, profile: { id: "u1", role: "planeacion" }, session: null }),
}));

const datos = vi.hoisted(() => ({ notas: [] as unknown[], error: null as Error | null }));
vi.mock("./noticias", async (orig) => {
  const real = await orig<typeof import("./noticias")>();
  const mutacion = () => ({ mutate: () => {}, isPending: false, error: null, variables: undefined });
  return {
    ...real,
    useNewsInbox: () => ({ data: datos.error ? undefined : datos.notas, error: datos.error, isPending: false, refetch: () => {} }),
    useNewsRuns: () => ({ data: [], error: null, isPending: false, refetch: () => {} }),
    useSetNewsState: mutacion,
    useToggleNewsOds: mutacion,
  };
});

import { RankingsAdmin } from "./RankingsAdmin";
import { FaltaMigracion } from "./noticias";

const nota = (id: string, over: Partial<NewsItem>): NewsItem => ({
  id,
  url: `https://udes.edu.co/comunicaciones/noticias/${id}`,
  title: `Nota ${id}`,
  excerpt: "Extracto",
  image_url: null,
  published_on: "2025-03-14",
  section: "Comunicaciones",
  campus: "Bucaramanga",
  state: "pending",
  ods: [{ ods: 13, score: 82, reason: "Siembra y cuenca", manual: false }],
  ...over,
});

const page = (path: string) =>
  renderToString(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/admin/rankings/:seccion?", element: h(RankingsAdmin) }))),
    ),
  );

describe("Tablero de rankings", () => {
  it("el tablero ofrece los tres rankings y el recolector con sus contadores reales", () => {
    datos.error = null;
    datos.notas = [nota("a", {}), nota("b", {}), nota("c", { state: "ok" }), nota("d", { state: "no" })];
    const html = page("/admin/rankings");
    for (const t of ["THE Impact Rankings", "THE World University Rankings", "UI GreenMetric", "Recolector de noticias"]) expect(html).toContain(t);
    expect(html).toContain('href="/admin/rankings/impact"');
    expect(html).toContain('href="/sostenible/impact/informes"');
    expect(html).toContain('href="/sostenible/impact/boletin"');
    expect(html).toContain('href="/sostenible/green"');
    expect(html.match(/Cifras ilustrativas hasta cargar las oficiales/g)?.length).toBe(2);
    expect(html).toMatch(/2<\/strong> por revisar/);
    expect(html).toMatch(/1<\/strong> aprobadas/);
  });

  it("sin la migración, el tablero lo dice en vez de contar", () => {
    datos.error = new FaltaMigracion("Falta");
    expect(page("/admin/rankings")).toContain("Falta aplicar la migración 0143");
    expect(page("/admin/rankings/noticias")).toContain("Falta aplicar la migración 0143");
  });

  it("la página de un ranking es corta y honesta", () => {
    datos.error = null;
    const html = page("/admin/rankings/world");
    expect(html).toContain("Próximamente: carga de datos");
    expect(html).toContain("Cifras ilustrativas");
    expect(html).not.toContain("Los 17 informes");
  });

  it("la bandeja muestra por revisar, con ODS, afinidad, razón y acciones; pagina de 30 en 30", () => {
    datos.error = null;
    datos.notas = [
      ...Array.from({ length: 35 }, (_, i) => nota(`p${i}`, { published_on: `2025-01-${String((i % 28) + 1).padStart(2, "0")}` })),
      nota("aprobada", { state: "ok", title: "Ya aprobada" }),
      nota("manual", { title: "Con foto", image_url: "https://udes.edu.co/x.jpg", ods: [{ ods: 7, score: 100, reason: "Agregado por Planeación", manual: true }] }),
    ];
    const html = page("/admin/rankings/noticias");
    expect(html.match(/class="rk-item[ "]/g)?.length).toBe(30);
    expect(html).toContain("Mostrar más");
    expect(html).not.toContain("Ya aprobada");
    expect(html).toContain("Siembra y cuenca");
    expect(html).toContain("82 %");
    expect(html).toContain("Aprobar");
    expect(html).toContain("Descartar");
    expect(html).toContain("Corregir ODS");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('rel="noopener"');
  });

  it("la nota con foto la pide perezosa y sin referer; la afinidad manual se rotula", () => {
    datos.error = null;
    datos.notas = [nota("manual", { image_url: "https://udes.edu.co/x.jpg", ods: [{ ods: 7, score: 100, reason: "Agregado por Planeación", manual: true }] })];
    const html = page("/admin/rankings/noticias");
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/i);
    expect(html).toContain(">manual<");
  });

  it("la carga trae el formulario con todas las fuentes, el año 2025 y las reglas", () => {
    datos.error = null;
    const html = page("/admin/rankings/noticias?vista=carga");
    expect(html).toContain("Cargar noticias de udes.edu.co");
    expect(html.match(/type="checkbox" checked=""/g)?.length).toBe(7);
    expect(html).toContain('value="2025"');
    expect(html).toContain("NOTICIAS_CRON");
    expect(html).toContain("Últimas cargas");
    expect(html).toContain('role="log"');
  });

  it("una sección desconocida vuelve al tablero", () => {
    expect(page("/admin/rankings/otra")).not.toContain("Próximamente");
  });
});
