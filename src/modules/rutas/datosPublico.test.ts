/* La carga pública no pide tablas privadas: solo ruta, paradas y trazado (y solo de rutas públicas). */

import { beforeEach, describe, expect, it, vi } from "vitest";

const llamadas: { tabla: string; columnas: string; filtros: [string, unknown][] }[] = [];

vi.mock("../../lib/supabase", () => {
  const filas: Record<string, unknown> = {
    bus_routes: [{ id: "r1", code: "R1", name: "Campus", headway_min: 15, terminal_dwell_min: 5, first_departure: "05:30:00", last_departure: "21:00:00", updated_at: "2026-10-09T12:00:00Z" }],
    bus_stops: [
      { seq: 0, name: "UDES", lon: -73.09, lat: 7.1 },
      { seq: 1, name: "Parada", lon: -73.1, lat: 7.11 },
      { seq: 2, name: "UDES", lon: -73.09, lat: 7.1 },
    ],
    bus_route_geometry: { coords: [[-73.09, 7.1], [-73.1, 7.11], [-73.09, 7.1]], leg_distances_m: [1000, 1000], duration_s: 300 },
  };
  const constructor = (tabla: string) => {
    const reg = { tabla, columnas: "", filtros: [] as [string, unknown][] };
    llamadas.push(reg);
    const q: Record<string, unknown> = {};
    const resultado = () => ({ data: tabla === "bus_route_geometry" ? filas[tabla] : filas[tabla], error: null });
    q.select = (c: string) => ((reg.columnas = c), q);
    q.eq = (k: string, v: unknown) => (reg.filtros.push([k, v]), q);
    q.order = () => q;
    q.limit = () => q;
    q.maybeSingle = () => Promise.resolve(resultado());
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return q;
  };
  return { supabase: { from: constructor } };
});

import { TABLAS_PUBLICAS, cargarRutaPublica } from "./datosPublico";

beforeEach(() => {
  llamadas.length = 0;
});

describe("carga pública de la ruta", () => {
  it("solo consulta las tablas públicas", async () => {
    await cargarRutaPublica();
    const tablas = new Set(llamadas.map((l) => l.tabla));
    expect([...tablas].sort()).toEqual([...TABLAS_PUBLICAS].sort());
    for (const privada of ["bus_origin_cells", "bus_ridership", "bus_proposals"]) expect(tablas.has(privada)).toBe(false);
  });

  it("no pide columnas de estudiantes ni de flota", async () => {
    await cargarRutaPublica();
    const columnas = llamadas.map((l) => l.columnas).join(",");
    expect(columnas).not.toMatch(/students|\bterm\b|\bcell\b|boardings|vehicles|capacity/);
  });

  it("pide solo rutas activas y públicas", async () => {
    await cargarRutaPublica();
    const r = llamadas.find((l) => l.tabla === "bus_routes")!;
    expect(r.filtros).toContainEqual(["active", true]);
    expect(r.filtros).toContainEqual(["public", true]);
  });

  it("arma el horario con la primera y la última salida de la base", async () => {
    const d = await cargarRutaPublica();
    expect(d.ruta.horario).toEqual({ primeraMin: 330, ultimaMin: 1260, intervaloMin: 15, paradaCampusMin: 5 });
    expect(d.ruta.stops).toHaveLength(3);
    expect(d.ruta.legs).toEqual([1000, 1000]);
    expect(Object.keys(d)).toEqual(["ruta", "vias"]);
  });
});

describe("el código de la página pública no nombra datos de estudiantes", () => {
  it("los archivos públicos no mencionan las tablas privadas", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const f of ["datosPublico.ts", "mapaPublico.ts", "RutasPublico.tsx", "horario.ts", "tiposPublico.ts"]) {
      const texto = readFileSync(resolve(__dirname, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(texto, f).not.toMatch(/bus_origin_cells|bus_ridership|bus_proposals|celdas|coverage_gain/);
    }
  });
});
