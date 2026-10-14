/* Migración 0150 (catálogo abierto del reporte THE) en un Postgres en memoria:
   quién ve los aportes de otras oficinas y quién marca la respuesta oficial. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "../db/harness";

const SIN_OFICINA = "00000000-0000-4000-a000-0000000000c1";
let t: TestDb;
let ciclo = "";
const resp: Record<"a" | "z" | "borrador", string> = { a: "", z: "", borrador: "" };

beforeAll(async () => {
  t = await createTestDb();
  // Administración: además de escribir como Planeación, lee las respuestas de todas las oficinas (0061).
  await t.q("update public.profiles set role = 'admin', is_active = true where id = $1", [PEOPLE.admin]);
  await t.q("insert into auth.users (id, email) values ($1, 'sin@prueba.udes.edu.co') on conflict do nothing", [SIN_OFICINA]);
  await t.q("insert into public.profiles (id, email, full_name) values ($1, 'sin@prueba.udes.edu.co', 'Sin oficina') on conflict do nothing", [SIN_OFICINA]);
  [{ id: ciclo }] = await t.q<{ id: string }>("insert into public.ranking_cycles (anio, anio_datos) values (2026, 2024) returning id");
  await t.q(
    `insert into public.ranking_indicators (ciclo, id, ods, nivel, tipo, texto_es) values
       ($1, '4.3.1', 4, 'indicator', 'ev', 'Acceso abierto'),
       ($1, '4.3.2', 4, 'indicator', 'ev', 'Educación continua')`,
    [ciclo],
  );
  // Como servicio (sin sesión): dos oficinas aprobadas en 4.3.1 y un borrador en 4.3.2.
  const filas = await t.q<{ id: string; unidad: string; indicador: string }>(
    `insert into public.ranking_responses (ciclo, indicador, unidad, estado, comentario_es) values
       ($1, '4.3.1', $2, 'ok', 'Secreto de A'), ($1, '4.3.1', $3, 'ok', 'Secreto de Z'), ($1, '4.3.2', $2, 'draft', '')
     returning id, unidad, indicador`,
    [ciclo, UNITS.programaA, UNITS.programaZ],
  );
  resp.a = filas.find((f) => f.unidad === UNITS.programaA && f.indicador === "4.3.1")!.id;
  resp.z = filas.find((f) => f.unidad === UNITS.programaZ)!.id;
  resp.borrador = filas.find((f) => f.indicador === "4.3.2")!.id;
}, 120_000);
afterAll(async () => t?.close());

describe("0150 · catálogo abierto", () => {
  it("una oficina ve quién aportó (sin contenido), pero solo lee sus propias respuestas", async () => {
    await t.asUser(PEOPLE.otroDirector, async (q) => {
      const aportes = await q<Record<string, unknown>>("select * from public.ranking_aportes($1)", [ciclo]);
      expect(aportes).toHaveLength(3);
      expect(Object.keys(aportes[0]).sort()).toEqual(["estado", "indicador", "oficial", "unidad", "unidad_nombre", "updated_at"]);
      expect(aportes.filter((f) => f.indicador === "4.3.1").map((f) => f.unidad).sort()).toEqual([UNITS.programaA, UNITS.programaZ].sort());
      const propias = await q("select id from public.ranking_responses where ciclo = $1", [ciclo]);
      expect(propias).toEqual([{ id: resp.z }]);
    });
  });

  it("quien no es de ninguna oficina ni de Planeación no ve los aportes", async () => {
    const e = await errorOf(t.asUser(SIN_OFICINA, (q) => q("select * from public.ranking_aportes($1)", [ciclo])));
    expect(e).toMatch(/Sin permiso/);
  });

  it("solo Planeación marca la oficial, y solo una aprobada", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select public.ranking_marcar_oficial($1)", [resp.a])))).toMatch(/Solo Planeación/);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("update public.ranking_responses set oficial = true where id = $1", [resp.borrador])))).toMatch(/Solo Planeación/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select public.ranking_marcar_oficial($1)", [resp.borrador])))).toMatch(/aprobada/);
  });

  it("marcar una quita la marca de las demás del mismo indicador; devolverla la quita", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select public.ranking_marcar_oficial($1)", [resp.a]), { commit: true });
    await t.asUser(PEOPLE.admin, (q) => q("select public.ranking_marcar_oficial($1)", [resp.z]), { commit: true });
    const oficiales = await t.q<{ id: string }>("select id from public.ranking_responses where oficial");
    expect(oficiales).toEqual([{ id: resp.z }]);

    await t.asUser(PEOPLE.admin, (q) => q("update public.ranking_responses set estado = 'back', nota_revision = 'Revisar' where id = $1", [resp.z]), { commit: true });
    const [z] = await t.q<{ oficial: boolean }>("select oficial from public.ranking_responses where id = $1", [resp.z]);
    expect(z.oficial).toBe(false);
  });

  it("es idempotente y conserva la oficial", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select public.ranking_marcar_oficial($1)", [resp.a]), { commit: true });
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0150_catalogo_abierto_reporte.sql"), "utf8"));
    expect(await t.q("select id from public.ranking_responses where oficial")).toEqual([{ id: resp.a }]);
  });
});
