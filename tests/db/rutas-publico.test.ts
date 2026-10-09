/* =============================================================================
   Ruta del bus UDES, versión pública (0140).

   Lo que se comprueba: sin iniciar sesión se lee la ruta, sus paradas y su
   trazado (solo de rutas activas y públicas, y solo las columnas del mapa);
   nadie sin sesión escribe nada; las tablas con datos de estudiantes, abordajes
   y propuestas siguen cerradas; y la política de escritura de Planeación (0139)
   sigue mandando.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0140_rutas_publico.sql");
let t: TestDb;
let privada: string;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  // Una ruta oculta (public = false) con una parada y un trazado, y una inactiva.
  const [r] = await t.q<{ id: string }>("insert into bus_routes (code, name, \"public\") values ('R-OCULTA', 'Ruta oculta', false) returning id");
  privada = r.id;
  await t.q("insert into bus_stops (route_id, seq, name, lon, lat) values ($1, 0, 'Parada oculta', -73.1, 7.1)", [privada]);
  await t.q("insert into bus_route_geometry (route_id, coords, distance_m, duration_s, leg_distances_m) values ($1, '[[-73.1,7.1],[-73.2,7.2]]', 10, 10, '{10}')", [privada]);
  await t.q("insert into bus_routes (code, name, active) values ('R-APAGADA', 'Ruta apagada', false)");
  await t.q("insert into bus_origin_cells (cell, term, lon, lat, students) values ('c1', '2026-2', -73.1, 7.1, 9)");
  await t.q("insert into bus_proposals (name) values ('Propuesta interna')");
}, 120_000);

afterAll(() => t?.close());

describe("lectura pública de la ruta", () => {
  it("sin sesión se ve la ruta activa y pública, con su horario", async () => {
    const filas = await t.asUser(null, (q) => q<{ code: string; first_departure: string; last_departure: string; headway_min: number }>("select code, first_departure, last_departure, headway_min from bus_routes order by code"));
    expect(filas.map((f) => f.code)).toEqual(["R1"]);
    expect(filas[0].first_departure).toBe("05:30:00");
    expect(filas[0].last_departure).toBe("21:00:00");
    expect(filas[0].headway_min).toBe(15);
  });

  it("sin sesión se ven sus paradas y su trazado, y nada de la ruta oculta", async () => {
    const paradas = await t.asUser(null, (q) => q<{ name: string }>("select name from bus_stops"));
    expect(paradas).toHaveLength(20);
    expect(paradas.some((p) => p.name === "Parada oculta")).toBe(false);
    const trazados = await t.asUser(null, (q) => q("select route_id from bus_route_geometry"));
    expect(trazados).toHaveLength(1);
  });

  it("la ruta oculta o apagada no se ve sin sesión, pero Planeación sí la ve", async () => {
    const anon = await t.asUser(null, (q) => q("select id from bus_routes where code in ('R-OCULTA', 'R-APAGADA')"));
    expect(anon).toHaveLength(0);
    const admin = await t.asUser(PEOPLE.admin, (q) => q("select id from bus_routes where code in ('R-OCULTA', 'R-APAGADA')"));
    expect(admin).toHaveLength(2);
  });

  it("quien inicia sesión sin ser de Planeación también lee solo lo público", async () => {
    const filas = await t.asUser(PEOPLE.vx, (q) => q<{ code: string }>("select code from bus_routes"));
    expect(filas.map((f) => f.code)).toEqual(["R1"]);
  });

  it("sin sesión solo se leen las columnas del mapa (no la flota ni la capacidad)", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select vehicles from bus_routes")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select capacity from bus_routes")))).toMatch(/permission denied/);
  });
});

describe("lo privado sigue cerrado", () => {
  it.each(["bus_origin_cells", "bus_ridership", "bus_proposals"])("%s no se lee sin sesión", async (tabla) => {
    expect(await errorOf(t.asUser(null, (q) => q(`select * from ${tabla}`)))).toMatch(/permission denied/);
  });

  it.each(["bus_origin_cells", "bus_ridership", "bus_proposals"])("%s no se lee con sesión sin ser de Planeación", async (tabla) => {
    const filas = await t.asUser(PEOPLE.vx, (q) => q(`select * from ${tabla}`));
    expect(filas).toHaveLength(0);
  });

  it("Planeación sigue leyendo los estudiantes por celda y las propuestas", async () => {
    expect(await t.asUser(PEOPLE.admin, (q) => q("select * from bus_origin_cells"))).toHaveLength(1);
    expect(await t.asUser(PEOPLE.admin, (q) => q("select * from bus_proposals"))).toHaveLength(1);
  });
});

describe("la escritura no se abre", () => {
  it("sin sesión no se inserta, ni se cambia, ni se borra", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("insert into bus_routes (code, name) values ('X', 'X')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("update bus_routes set name = 'x' where code = 'R1'")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("delete from bus_stops where seq = 0")))).toMatch(/permission denied/);
  });

  it("una persona con sesión sin ser de Planeación no escribe", async () => {
    // La política de select no deja pasar un update: no encuentra filas que cambiar.
    const cambiadas = await t.asUser(PEOPLE.vx, (q) => q("update bus_routes set name = 'hackeada' where code = 'R1' returning id"));
    expect(cambiadas).toHaveLength(0);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("insert into bus_stops (route_id, seq, name, lon, lat) values ($1, 99, 'x', 0, 0)", [privada])))).toMatch(/row-level security/);
  });

  it("Planeación sigue escribiendo con la política de 0139", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update bus_routes set headway_min = 12 where code = 'R1'"), { commit: true });
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ headway_min: number }>("select headway_min from bus_routes where code = 'R1'"));
    expect(r.headway_min).toBe(12);
    await t.asUser(PEOPLE.admin, (q) => q("update bus_routes set headway_min = 15 where code = 'R1'"), { commit: true });
  });

  it("la última salida no puede ser anterior a la primera", async () => {
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("update bus_routes set last_departure = '04:00' where code = 'R1'")))).toMatch(/check constraint/);
  });
});

describe("la migración", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const ejecutable = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("es idempotente: volver a aplicarla no falla ni cambia lo visible", async () => {
    await t.db.exec(sql);
    const filas = await t.asUser(null, (q) => q<{ code: string }>("select code from bus_routes"));
    expect(filas.map((f) => f.code)).toEqual(["R1"]);
  });

  it("no tiene DELETE ni UPDATE sin WHERE, ni abre las tablas privadas", () => {
    expect(ejecutable).not.toMatch(/\bdelete\s+from\b/i);
    expect(ejecutable).not.toMatch(/\bupdate\s+public\./i);
    expect(ejecutable).not.toMatch(/grant\s+[^;]*\bon\s+public\.(bus_origin_cells|bus_ridership|bus_proposals)\b[^;]*\bto\s+(anon|public)/i);
    expect(ejecutable).not.toMatch(/create\s+policy\s+\w+\s+on\s+public\.(bus_origin_cells|bus_ridership|bus_proposals)/i);
  });

  it("solo da select a anon", () => {
    const grants = ejecutable.match(/grant[^;]*to anon;/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g).toMatch(/^grant select/i);
  });
});
