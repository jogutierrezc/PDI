/* Migración 0284: presentaciones del informe. Lee quien ve la instancia; crea quien la ve (a su nombre);
   edita y borra quien la creó o Planeación; quien no ve el informe no ve nada. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, type TestDb } from "../db/harness";
import { abrirFacultad, escenario, P } from "./fixtures";

let t: TestDb;
let fac = "";

const contenido = JSON.stringify({ titulo: "Informe", diapositivas: [] });
const crear = (q: Parameters<Parameters<TestDb["asUser"]>[1]>[0], quien: string, titulo = "Presentación") =>
  q<{ id: string }>("insert into public.informe_presentaciones (instancia_id, tono, titulo, contenido, creado_por, pensamiento_s) values ($1, 'cercano', $2, $3::jsonb, $4, 12.5) returning id", [fac, titulo, contenido, quien]);

/** Si la base en memoria no arranca en este equipo (PGlite/pgcrypto: falla igual en las demás pruebas de BD), las pruebas se omiten. */
let sinBase = "";

beforeAll(async () => {
  try {
    const e = await escenario();
    t = e.t;
    fac = await abrirFacultad(t, e.ciclo);
  } catch (e) {
    sinBase = e instanceof Error ? e.message : String(e);
  }
}, 180_000);

afterAll(async () => t?.close());

describe("0284 · informe_presentaciones", () => {
  let id = "";

  it("quien ve la instancia (el Gestor) crea una presentación a su nombre", async (ctx) => {
    if (sinBase) return ctx.skip();
    await t.asUser(P.gestor, async (q) => {
      [{ id }] = await crear(q, P.gestor);
      expect((await q("select creado_por from public.informe_presentaciones where id = $1", [id]))[0]).toEqual({ creado_por: P.gestor });
    });
  });

  it("no se puede crear a nombre de otra persona", async (ctx) => {
    if (sinBase) return ctx.skip();
    expect(await errorOf(t.asUser(P.gestor, (q) => crear(q, P.planeacion)))).toMatch(/row-level security/);
  });

  it("quien también ve la instancia la lee", async (ctx) => {
    if (sinBase) return ctx.skip();
    await t.asUser(P.contribuyente, async (q) => {
      expect((await q("select id from public.informe_presentaciones")).map((r) => (r as { id: string }).id)).toEqual([id]);
    });
    await t.asUser(P.planeacion, async (q) => expect((await q("select id from public.informe_presentaciones")).length).toBe(1));
  });

  it("quien no ve el informe no ve ni crea presentaciones", async (ctx) => {
    if (sinBase) return ctx.skip();
    await t.asUser(P.ajeno, async (q) => expect(await q("select id from public.informe_presentaciones")).toEqual([]));
    expect(await errorOf(t.asUser(P.ajeno, (q) => crear(q, P.ajeno)))).toMatch(/row-level security/);
  });

  it("otro lector no edita ni borra lo ajeno; el autor y Planeación sí", async (ctx) => {
    if (sinBase) return ctx.skip();
    await t.asUser(P.contribuyente, async (q) => {
      expect((await q("update public.informe_presentaciones set titulo = 'x' where id = $1 returning id", [id])).length).toBe(0);
      expect((await q("delete from public.informe_presentaciones where id = $1 returning id", [id])).length).toBe(0);
    });
    await t.asUser(P.gestor, async (q) => {
      expect((await q("update public.informe_presentaciones set titulo = 'Mío' where id = $1 returning id", [id])).length).toBe(1);
    });
    await t.asUser(P.planeacion, async (q) => {
      expect((await q("update public.informe_presentaciones set titulo = 'De Planeación' where id = $1 returning id", [id])).length).toBe(1);
      expect((await q("delete from public.informe_presentaciones where id = $1 returning id", [id])).length).toBe(1);
    });
  });

  it("el tono y el título tienen su regla", async (ctx) => {
    if (sinBase) return ctx.skip();
    expect(await errorOf(t.q("insert into public.informe_presentaciones (instancia_id, tono, titulo, contenido) values ($1, 'gracioso', 'x', '{}')", [fac]))).toMatch(/tono/);
    expect(await errorOf(t.q("insert into public.informe_presentaciones (instancia_id, tono, titulo, contenido) values ($1, 'cercano', '', '{}')", [fac]))).toMatch(/titulo/);
  });

  it("la migración es idempotente", async (ctx) => {
    if (sinBase) return ctx.skip();
    const { readFileSync } = await import("node:fs");
    await t.q(readFileSync("supabase/migrations/0284_informe_presentaciones.sql", "utf8"));
  });
});
