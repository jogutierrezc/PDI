/* =============================================================================
   Impacto · la foto del portal (0088).

   Cualquier sesión activa ve la estructura y las cifras; nadie sin sesión.
   Nunca salen borradores, notas ni enlaces de evidencia.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q(
    `insert into units (kind, code, name, slug, substantive_function) values
       ('vicerrectoria', 'VI', 'Vicerrectoría de Investigaciones', 'vi', 'investigacion'),
       ('vicerrectoria', 'VE', 'Vicerrectoría de Enseñanza', 've', 'ensenanza'),
       ('vicerrectoria', 'VEX', 'Vicerrectoría de Extensión', 'vex', 'extension')`,
  );
  await t.q(`insert into imp_unit_functions (unit_id, fn) select id, substantive_function from units where code in ('VI', 'VE', 'VEX')`);
  await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0079_impacto_carga_inicial.sql"), "utf8"));
  await t.q("update imp_indicators set status = 'publicado' where program_id is null");
  await t.q("update imp_indicators set status = 'borrador' where code = 'E04'");
  const [site] = await t.q<{ campus_id: string }>("select campus_id from program_campuses where program_id = $1 and active limit 1", [
    UNITS.programaA,
  ]);
  await t.q(
    `insert into imp_values (indicator_id, year, program_id, campus_id, value_num, note, evidence_url)
     select id, 2025, $1, $2, 70, 'nota interna', 'https://evidencia.example/x' from imp_indicators where code = 'E17'`,
    [UNITS.programaA, site.campus_id],
  );
}, 120_000);

afterAll(() => t?.close());

const snapshot = (q: (sql: string) => Promise<unknown[]>) =>
  q("select imp_portal_snapshot() as s") as Promise<{ s: Record<string, Record<string, unknown>[]> }[]>;

describe("imp_portal_snapshot", () => {
  it("sin sesión no se ve nada", async () => {
    expect(await errorOf(t.asUser(null, snapshot))).toMatch(/permission denied|sesión activa/);
  });

  it("una persona sin unidad de Impacto ve todas las fichas publicadas, sin borradores", async () => {
    const [{ s }] = await t.asUser(PEOPLE.reportante, snapshot);
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int as n from imp_indicators where program_id is null and status = 'publicado'");
    expect(s.indicators).toHaveLength(n);
    expect(s.indicators.map((i) => i.code)).not.toContain("E04");
    expect(s.dimensions.length).toBeGreaterThan(0);
    expect(s.units.some((u) => u.id === UNITS.facultad)).toBe(true);
  });

  it("las cifras salen sin notas ni evidencias", async () => {
    const [{ s }] = await t.asUser(PEOPLE.reportante, snapshot);
    const value = s.values.find((v) => v.program_id === UNITS.programaA);
    expect(value).toMatchObject({ year: 2025 });
    expect(Number(value!.value_num)).toBe(70);
    expect(value).not.toHaveProperty("note");
    expect(value).not.toHaveProperty("evidence_url");
  });
});
