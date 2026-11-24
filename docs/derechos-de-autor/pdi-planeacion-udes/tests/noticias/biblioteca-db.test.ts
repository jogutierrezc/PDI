/* Migración 0152 (biblioteca de evidencias y lectura de Planeación) en un
   Postgres en memoria: quién ve y escribe la biblioteca y su bucket, que el
   mismo contenido no se guarde dos veces, que un archivo se ligue una sola vez
   a una respuesta, las notas, y que Planeación (sin ser admin) lea las
   respuestas de todas las oficinas. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "../db/harness";

const PLANEACION = "00000000-0000-4000-a000-0000000000d1";
const HASH = (c: string) => c.repeat(64);
let t: TestDb;
let ciclo = "";
let respA = "";

const fila = (sha: string, ruta: string) => ({
  sql: `insert into public.ranking_biblioteca (ruta_zip, nombre, tamano, sha256, storage_path) values ($1, $2, 10, $3, $4) returning id`,
  params: [ruta, ruta.split("/").pop(), sha, `lote/${ruta}`],
});

beforeAll(async () => {
  t = await createTestDb();
  await t.q("insert into auth.users (id, email) values ($1, 'plan@prueba.udes.edu.co') on conflict do nothing", [PLANEACION]);
  await t.q("insert into public.profiles (id, email, full_name) values ($1, 'plan@prueba.udes.edu.co', 'Planeación') on conflict do nothing", [PLANEACION]);
  await t.q("update public.profiles set role = 'planeacion', is_active = true where id = $1", [PLANEACION]);
  [{ id: ciclo }] = await t.q<{ id: string }>("insert into public.ranking_cycles (anio, anio_datos) values (2027, 2025) returning id");
  await t.q("insert into public.ranking_indicators (ciclo, id, ods, nivel, tipo, texto_es) values ($1, '5.6.3', 5, 'indicator', 'ev', 'Maternidad')", [ciclo]);
  [{ id: respA }] = await t.q<{ id: string }>(
    "insert into public.ranking_responses (ciclo, indicador, unidad, estado, comentario_es) values ($1, '5.6.3', $2, 'sent', 'De la oficina A') returning id",
    [ciclo, UNITS.programaA],
  );
}, 120_000);
afterAll(async () => t?.close());

describe("0152 · lectura de Planeación", () => {
  it("Planeación sin ser admin lee las respuestas, evidencias y asignaciones de cualquier oficina", async () => {
    await t.asUser(PLANEACION, async (q) => {
      expect(await q("select id from public.ranking_responses where ciclo = $1", [ciclo])).toEqual([{ id: respA }]);
    });
  });

  it("una oficina sigue sin ver las respuestas de otra", async () => {
    await t.asUser(PEOPLE.otroDirector, async (q) => {
      expect(await q("select id from public.ranking_responses where ciclo = $1", [ciclo])).toEqual([]);
    });
  });

  it("Planeación aprueba lo que envió la oficina", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const [r] = await q<{ estado: string }>("update public.ranking_responses set estado = 'ok' where id = $1 returning estado", [respA]);
      expect(r.estado).toBe("ok");
    });
  });
});

describe("0152 · biblioteca", () => {
  it("solo Planeación escribe y lee la biblioteca; el mismo contenido no entra dos veces", async () => {
    const a = fila(HASH("a"), "ODS 5/licencia.pdf");
    await t.asUser(PLANEACION, (q) => q(a.sql, a.params), { commit: true });
    const otra = fila(HASH("a"), "copia/licencia.pdf");
    expect(await errorOf(t.asUser(PLANEACION, (q) => q(otra.sql, otra.params)))).toMatch(/duplicate|unique/i);
    const b = fila(HASH("b"), "x.pdf");
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(b.sql, b.params)))).toMatch(/row-level security|permission/i);
    expect(await t.asUser(PEOPLE.director, (q) => q("select id from public.ranking_biblioteca"))).toEqual([]);
    expect(await t.asUser(PLANEACION, (q) => q("select id from public.ranking_biblioteca"))).toHaveLength(1);
    expect(await errorOf(t.asUser(null, (q) => q("select id from public.ranking_biblioteca")))).toMatch(/permission/i);
  });

  it("rechaza hashes mal formados y rutas que suben de carpeta", async () => {
    const malo = fila("zz", "a.pdf");
    expect(await errorOf(t.asUser(PLANEACION, (q) => q(malo.sql, malo.params)))).toMatch(/ranking_biblioteca_sha/);
    expect(
      await errorOf(
        t.asUser(PLANEACION, (q) => q("insert into public.ranking_biblioteca (ruta_zip, nombre, tamano, sha256, storage_path) values ('a', 'a', 1, $1, '../x')", [HASH("c")])),
      ),
    ).toMatch(/ranking_biblioteca_ruta/);
  });

  it("bucket: Planeación sube; la oficina solo lee el archivo que quedó como evidencia suya", async () => {
    const [{ id: lib }] = await t.q<{ id: string }>("insert into public.ranking_biblioteca (ruta_zip, nombre, tamano, sha256, storage_path) values ('acta.pdf', 'acta.pdf', 5, $1, 'lote/acta.pdf') returning id", [HASH("d")]);
    await t.asUser(PLANEACION, (q) => q("insert into storage.objects (bucket_id, name) values ('ranking-biblioteca', 'lote/acta.pdf')"), { commit: true });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into storage.objects (bucket_id, name) values ('ranking-biblioteca', 'lote/otro.pdf')")))).toMatch(/row-level security/i);
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q("select name from storage.objects where bucket_id = 'ranking-biblioteca'")).toEqual([]);
    });
    await t.asUser(PLANEACION, (q) =>
      q("insert into public.ranking_evidence (response_id, kind, storage_path, nombre, biblioteca) values ($1, 'file', 'lote/acta.pdf', 'acta.pdf', $2)", [respA, lib]),
    { commit: true });
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q("select name from storage.objects where bucket_id = 'ranking-biblioteca'")).toEqual([{ name: "lote/acta.pdf" }]);
    });
    // Ligar otra vez el mismo archivo a la misma respuesta no duplica.
    expect(
      await errorOf(t.asUser(PLANEACION, (q) => q("insert into public.ranking_evidence (response_id, kind, storage_path, nombre, biblioteca) values ($1, 'file', 'lote/acta.pdf', 'acta.pdf', $2)", [respA, lib]))),
    ).toMatch(/duplicate|unique/i);
  });

  it("acepta notas con texto y rechaza notas vacías", async () => {
    await t.asUser(PLANEACION, (q) => q("insert into public.ranking_evidence (response_id, kind, nombre) values ($1, 'nota', 'Pedir el acta a Bienestar')", [respA]));
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("insert into public.ranking_evidence (response_id, kind, nombre) values ($1, 'nota', '')", [respA])))).toMatch(/ranking_evidence_origen/);
  });

  it("es idempotente", async () => {
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0152_biblioteca_evidencias_rankings.sql"), "utf8"));
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int as n from public.ranking_biblioteca");
    expect(n).toBeGreaterThan(0);
  });
});
