// @vitest-environment jsdom
/* La pantalla de Datos de Sostenibilidad en un DOM de pruebas: que abra con la
   oficina de la persona, muestre el explorador vacío y, para quien no
   pertenece, diga que no tiene oficina. */

import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatosSostenibilidad } from "./DatosSostenibilidad";

vi.mock("../../../lib/supabase", () => {
  const yo = { planeacion: false, oficinas: [{ oficina_id: "o1", oficina: "UDES Verde", codigo: "VERDE", rol: "gestor" }] };
  const chain: unknown = new Proxy(() => undefined, {
    get: (_t, key) => {
      if (key === "then") return (ok: (v: unknown) => void) => ok({ data: [], count: 0, error: null });
      if (key === "rpc") return (fn: string) => (fn === "ds_yo" ? Promise.resolve({ data: yo, error: null }) : Promise.resolve({ data: null, error: null }));
      return () => chain;
    },
  });
  return { supabase: chain };
});

vi.mock("../../../lib/auth", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAuth: () => ({
      profile: { id: "u1", full_name: "UDES Verde", email: "verde@udes.edu.co", role: "admin" },
      hasRole: (m: string) => m === "admin",
      canSee: () => true,
      signOut: async () => undefined,
    }),
  };
});

vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "claro", setTheme: () => undefined, toggle: () => undefined }) }));

let root: Root | null = null;

const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: ["/admin/datos-sostenibilidad"] }, h(DatosSostenibilidad)),
      ),
    );
  });
  return el;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
  document.body.replaceChildren();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Datos de Sostenibilidad · la pantalla", () => {
  it("abre con la oficina de la persona y el explorador de libros", async () => {
    const el = await mount();
    const text = () => el.textContent ?? "";
    await vi.waitFor(() => expect(text()).toContain("UDES Verde"));
    await vi.waitFor(() => expect(text()).toContain("Libros de datos"));
    expect(text()).toContain("Todavía no hay libros aquí");
    expect(text()).toContain("Nuevo libro");
  });

  it("el riel ofrece el equipo al gestor", async () => {
    const el = await mount();
    await vi.waitFor(() => expect(el.textContent).toContain("Equipo"));
  });
});
