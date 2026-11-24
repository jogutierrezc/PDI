// @vitest-environment jsdom
/* El lanzador (/admin) en un DOM de pruebas: los carteles que ve cada rol, el
   microportal que se abre y se cierra (sin animación: GSAP es un doble), el
   buscador con «/», flechas y Enter, y los data-tour del recorrido. */

import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminScreen, AppRole } from "../../../types/database";

const RANK: Record<AppRole, number> = { consulta: 0, responsable: 1, planeacion: 2, admin: 3 };
const who = vi.hoisted(() => ({
  role: "admin" as AppRole,
  screens: null as string[] | null,
  side: null as "programa" | "funcion" | "ambos" | null,
}));
const probe = vi.hoisted(() => ({ at: "" }));

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({
    profile: { id: "u1", full_name: "Jorge Gutiérrez", email: "j@udes.edu.co", role: who.role },
    hasRole: (m: AppRole) => RANK[who.role] >= RANK[m],
    canSee: (s: AdminScreen) => !who.screens || who.screens.includes(s),
    canSeeReport: () => true,
    impactoSide: who.side,
    signOut: async () => undefined,
  }),
}));
vi.mock("../../../components/tour/TourProvider", () => ({ useTour: () => ({ start: () => undefined, isDone: () => true, active: null }) }));
vi.mock("../../../components/pilo/PiloAvatar", () => ({ PiloAvatar: () => null }));
vi.mock("../../../lib/supabase", () => {
  const chain: unknown = new Proxy(() => undefined, {
    get: (_t, key) => (key === "then" ? (ok: (v: unknown) => void) => ok({ data: [], count: 0, error: null }) : () => chain),
  });
  return { supabase: chain };
});
// Sin animación en jsdom: cada tween termina en el acto.
vi.mock("gsap", () => {
  type Vars = { onComplete?: () => void } | undefined;
  const gsap = {
    context: (fn?: () => void) => {
      fn?.();
      return { add: (f: () => void) => f(), revert: () => undefined };
    },
    to: (_t: unknown, v: Vars) => v?.onComplete?.(),
    fromTo: (_t: unknown, _f: unknown, v: Vars) => v?.onComplete?.(),
    set: () => undefined,
    killTweensOf: () => undefined,
  };
  return { default: gsap, gsap };
});

const { Launcher, wallSpans } = await import("./Launcher");
const { MODULES } = await import("./portales");

function Probe() {
  const l = useLocation();
  probe.at = `${l.pathname}${l.hash}`;
  return null;
}

let root: Root | null = null;
let host: HTMLElement;

async function mount(path = "/admin") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client },
        h(MemoryRouter, { initialEntries: [path] }, h(Probe), h(Routes, null, h(Route, { path: "/admin", element: h(Launcher) }), h(Route, { path: "*", element: null }))),
      ),
    );
  });
}

const tiles = () => Array.from(host.querySelectorAll(".ln-tile h2")).map((n) => n.textContent);
const portal = () => host.querySelector<HTMLElement>("[role='region']");
const key = (target: EventTarget, k: string) =>
  act(async () => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const click = (node: Element | null) =>
  act(async () => {
    expect(node, "el elemento existe").toBeTruthy();
    node!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  Object.assign(who, { role: "admin", screens: null, side: null });
});

describe("el muro de módulos", () => {
  it("la administración ve todos los módulos, el buscador y los data-tour del recorrido", async () => {
    await mount();
    expect(tiles()).toEqual(
      expect.arrayContaining(["Rankings", "Plan de Desarrollo", "UDES en Cifras", "Reportes Institucionales", "Observatorio de Analítica", "Sistema"]),
    );
    for (const t of ["launcher-tour", "launcher-search", "launcher-modules", "launcher-portal"]) {
      expect(host.querySelector(`[data-tour='${t}']`), t).toBeTruthy();
    }
    expect(host.textContent).toContain("Hola, Jorge");
    expect(host.querySelector("button[aria-label^='Abrir el portal de Rankings']")).toBeTruthy();
  });

  it("un programa solo ve Impacto y Mis Tableros, sin buscador; Tableros va directo", async () => {
    Object.assign(who, { role: "consulta", screens: ["impacto", "tableros"], side: "programa" });
    await mount();
    expect(tiles().sort()).toEqual(["Indicadores de Impacto", "Mis Tableros"]);
    expect(host.querySelector("[data-tour='launcher-search']")).toBeNull();
    expect(host.querySelector("a.ln-tile__go[href='/admin/tableros']")).toBeTruthy();
    // Impacto: las tres pantallas del programa forman su portal.
    expect(host.querySelector("button[aria-label='Abrir el portal de Indicadores de Impacto, 3 pantallas']")).toBeTruthy();
  });

  it("el microportal se abre desde el cartel y se cierra con Esc, devolviendo el foco", async () => {
    await mount();
    const trigger = host.querySelector<HTMLButtonElement>("button[aria-label^='Abrir el portal de Rankings']");
    await click(trigger);
    const region = portal();
    expect(region?.getAttribute("aria-labelledby")).toBe("ln-portal-title");
    expect(probe.at).toBe("/admin#rankings");
    expect(document.activeElement?.id).toBe("ln-portal-title");
    const hrefs = Array.from(region!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/admin/rankings/impact", "/admin/rankings/noticias", "/admin/rankings/informes", "/admin/rankings/posicion"]),
    );
    await key(document.activeElement ?? document, "Escape");
    expect(portal()).toBeNull();
    expect(probe.at).toBe("/admin");
    expect(document.activeElement).toBe(host.querySelector("button[aria-label^='Abrir el portal de Rankings']"));
  });

  it("abre directo por la dirección y se cierra con «← Intranet»", async () => {
    await mount("/admin#sistema");
    expect(portal()?.querySelector("a[href='/admin/usuarios']")?.textContent).toContain("Usuarios y roles");
    await click(Array.from(portal()!.querySelectorAll("button")).find((b) => b.textContent?.includes("Intranet")) ?? null);
    expect(portal()).toBeNull();
    expect(probe.at).toBe("/admin");
  });

  it("el buscador: «/» lo enfoca, las flechas eligen y Enter abre la pantalla", async () => {
    await mount();
    await key(document.body, "/");
    const input = host.querySelector<HTMLInputElement>("input[type='search']")!;
    expect(document.activeElement).toBe(input);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "estructura");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = host.querySelectorAll("[role='option']");
    expect(options.length).toBeGreaterThan(1);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    await key(input, "ArrowDown");
    expect(host.querySelectorAll("[role='option']")[1].getAttribute("aria-selected")).toBe("true");
    const target = host.querySelectorAll("[role='option'] a")[1].getAttribute("href");
    await key(input, "Enter");
    expect(probe.at).toBe(target);
  });
});

describe("Internacionalización en el muro", () => {
  it("la administración (Director) abre su portal con las seis secciones", async () => {
    await mount("/admin#internacionalizacion");
    const hrefs = Array.from(portal()!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/admin/internacionalizacion",
        "/admin/internacionalizacion/tablas",
        "/admin/internacionalizacion/cifras",
        "/admin/internacionalizacion/plantillas",
        "/admin/internacionalizacion/periodos",
        "/admin/internacionalizacion/accesos",
      ]),
    );
  });

  it("un grupo del menú sin entrada en MODULES no rompe el muro: usa sus pantallas", async () => {
    const reg = MODULES as Record<string, unknown>;
    const saved = reg.internacionalizacion;
    delete reg.internacionalizacion;
    try {
      await mount();
      expect(tiles()).toContain("Internacionalización");
      expect(host.querySelector("a.ln-tile__go[href='/admin/internacionalizacion']")).toBeTruthy();
    } finally {
      reg.internacionalizacion = saved;
    }
  });
});

describe("tamaños del muro", () => {
  it("llena filas completas de 12 columnas en escritorio y de 2 en tableta", () => {
    for (let n = 1; n <= 12; n++) {
      const s = wallSpans(n);
      const cells = s.reduce((a, x) => a + x.col * x.rows, 0);
      expect(cells % 12, `n=${n}`).toBe(0);
      expect(s.reduce((a, x) => a + x.md, 0) % 12, `tableta n=${n}`).toBe(0);
    }
  });
});

describe("Programas en Cifras en el muro", () => {
  it("la administración ve el cartel con su color y abre el portal con «Equipo y accesos»", async () => {
    await mount();
    expect(tiles()).toContain("Programas en Cifras");
    const cartel = Array.from(host.querySelectorAll<HTMLElement>("[style]")).find((n) => n.style.getPropertyValue("--k") === "var(--wall-programas-en-cifras)");
    expect(cartel, "el cartel usa el color del muro").toBeTruthy();
    await click(host.querySelector("button[aria-label^='Abrir el portal de Programas en Cifras']"));
    const hrefs = Array.from(portal()!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/admin/programas-en-cifras", "/admin/programas-en-cifras?seccion=equipo"]));
    expect(portal()!.textContent).toContain("Equipo y accesos");
  });

  it("un Director (sin rol de administración) ve el cartel, va directo y no ve «Equipo y accesos»", async () => {
    Object.assign(who, { role: "consulta", screens: ["programas-en-cifras"], side: null });
    await mount();
    expect(tiles()).toEqual(["Programas en Cifras"]);
    expect(host.querySelector("a.ln-tile__go[href='/admin/programas-en-cifras']")).toBeTruthy();
    expect(host.textContent).not.toContain("Equipo y accesos");
  });
});
