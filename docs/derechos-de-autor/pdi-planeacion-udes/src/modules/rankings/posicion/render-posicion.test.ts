// @vitest-environment jsdom
/* La pantalla de posicionamiento: con la tabla real de THE 2026, sin datos y
   sin la migración; y la línea del tablero. */

import { createElement as h } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FilaTHE } from "./tipos";

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

const estado = vi.hoisted(() => ({ modo: "datos" as "datos" | "vacio" | "migracion", cobertura: null as unknown }));
vi.mock("./datos", async (orig) => {
  const real = await orig<typeof import("./datos")>();
  const { FaltaMigracion } = await import("../noticias");
  const { readFileSync: leer } = await import("node:fs");
  const { resolve: ruta } = await import("node:path");
  const seed = JSON.parse(leer(ruta(__dirname, "../../../../supabase/seed/the-impact-2026.json"), "utf8"));
  const respuesta = <T>(data: T) =>
    estado.modo === "migracion"
      ? { data: undefined, error: new FaltaMigracion("Falta aplicar la migración 0148."), isPending: false }
      : { data, error: null, isPending: false };
  return {
    ...real,
    useFilasTHE: () => respuesta(estado.modo === "vacio" ? { filas: [], captura: null } : { filas: seed.rows, captura: { year: 2026, scope: "overall", source: "THE", captured_at: seed.captured_at, row_count: 1603, notes: "" } }),
    useUdesTHE: () => respuesta(estado.modo === "vacio" ? null : seed.rows.find((r: FilaTHE) => r.name === "University of Santander")),
    useCoberturaTodos: () => ({ data: estado.cobertura ?? undefined, error: null, isPending: false }),
  };
});

import { RankingsAdmin } from "../RankingsAdmin";

const page = (path: string) =>
  renderToString(
    h(
      QueryClientProvider,
      { client: new QueryClient() },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/admin/rankings/:seccion?", element: h(RankingsAdmin) }))),
    ),
  ).replace(/<!-- -->/g, "");


describe("Posicionamiento en THE Impact", () => {
  it("con la tabla 2026: escalera, escenario, resultados, palancas y método", () => {
    estado.modo = "datos";
    estado.cobertura = { 2025: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, null])), 2026: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, null])) };
    const html = page("/admin/rankings/posicion");
    expect(html).toContain("Posicionamiento en THE Impact");
    expect(html).toContain("Dónde está la UDES hoy (THE 2026)");
    expect(html).toContain("UDES · University of Santander");
    expect(html).toContain("Pontificia Universidad Javeriana");
    expect(html).toContain("=2");
    expect(html).toContain("601–800");
    expect(html).toContain("Escenario 2027");
    expect(html).toContain("estatus quo");
    expect(html).toContain("Qué tan probable es");
    expect(html).toMatch(/≈ \d+ %|&lt; 5 %|&gt; 95 %/);
    expect(html).not.toMatch(/\d+\.\d+ %/); // nada de decimales en las probabilidades
    expect(html).toContain("Qué mover");
    expect(html).toContain("El ODS 17 es la palanca más grande");
    expect(html).toContain("Cómo se calcula y qué no sabemos");
    expect(html).toMatch(/captura del 13 de octubre de 2026/);
    expect(html).toContain("<table");
    expect(html).not.toMatch(/IA genera/i);
  });

  it("sin datos cargados, lo dice y explica cómo cargarlos", () => {
    estado.modo = "vacio";
    const html = page("/admin/rankings/posicion");
    expect(html).toContain("está vacía");
    expect(html).toContain("import-the-impact.mjs");
  });

  it("sin la migración 0148, el aviso de siempre", () => {
    estado.modo = "migracion";
    const html = page("/admin/rankings/posicion");
    expect(html).toContain("Falta aplicar la migración 0148");
    const tablero = page("/admin/rankings");
    expect(tablero).toContain("Falta aplicar la migración 0148");
  });

  it("el tablero y la página de THE Impact muestran el resultado oficial 2026 y el acceso", () => {
    estado.modo = "datos";
    for (const ruta of ["/admin/rankings", "/admin/rankings/impact"]) {
      const html = page(ruta);
      expect(html).toContain("Resultado oficial THE 2026:");
      expect(html).toMatch(/601–800<\/strong> · puntaje <strong class="rk-num">60,7–66,1<\/strong> · ODS 17: <strong class="rk-num">401–600/);
      expect(html).toContain("Analizar el posicionamiento");
    }
  });
});
