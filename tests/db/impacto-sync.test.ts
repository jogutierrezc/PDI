/* =============================================================================
   Impacto · sincronizar la hoja de Apps Script y los conteos de Mr. Pilo (0083).

   La sincronización es de la administración y entra entera o no entra. Los
   conteos para Mr. Pilo dicen cuántos programas parecidos siguen cada
   indicador, sin dejar ver cuáles.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

let t: TestDb;
let campus: Record<string, string>;
/** Una sede donde se ofrece cada programa de prueba. */
let siteA: string;
let siteB: string;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  // La carga inicial necesita sus vicerrectorías, que la semilla no trae.
  await t.q(
    `insert into units (kind, code, name, slug, substantive_function) values
       ('vicerrectoria', 'VI', 'Vicerrectoría de Investigaciones', 'vi', 'investigacion'),
       ('vicerrectoria', 'VE', 'Vicerrectoría de Enseñanza', 've', 'ensenanza'),
       ('vicerrectoria', 'VEX', 'Vicerrectoría de Extensión', 'vex', 'extension')`,
  );
  await t.q(`insert into imp_unit_functions (unit_id, fn) select id, substantive_function from units where code in ('VI', 'VE', 'VEX')`);
  await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0079_impacto_carga_inicial.sql"), "utf8"));
  const rows = await t.q<{ slug: string; id: string }>("select slug, id from campuses");
  campus = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  const offer = await t.q<{ program_id: string; campus_id: string }>(
    "select program_id, campus_id from program_campuses where program_id in ($1, $2) and active order by campus_id",
    [UNITS.programaA, UNITS.programaB],
  );
  siteA = offer.find((o) => o.program_id === UNITS.programaA)!.campus_id;
  siteB = offer.find((o) => o.program_id === UNITS.programaB)?.campus_id ?? "";
}, 120_000);

afterAll(() => t?.close());

const apply = (batch: object) => (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
  q("select imp_sync_apply($1::jsonb) as r", [JSON.stringify(batch)]) as Promise<{ r: Record<string, number> }[]>;

describe("imp_sync_apply", () => {
  it("solo la administración sincroniza", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, apply({})))).toMatch(/Solo la administración/);
  });

  it("aplica programas, fichas, adopciones y cifras, y lo anota", async () => {
    const [{ r }] = await t.asUser(
      PEOPLE.admin,
      apply({
        source_url: "https://script.google.com/macros/s/x/exec",
        summary: { omitidas: 2 },
        programs: [{ code: "bac-bga", program_id: UNITS.programaA, campus_id: siteA, name: "Bacteriología" }],
        indicators: [{ code: "E04", baseline_text: "81%", baseline_num: 81 }],
        adoptions: [{ indicator_code: "E17", program_id: UNITS.programaA, campus_id: siteA, target_2026: "≥ 80%", target_2026_num: 80 }],
        values: [
          { indicator_code: "E04", year: 2026, program_id: null, campus_id: null, value_num: 82.5 },
          { indicator_code: "E17", year: 2024, program_id: UNITS.programaA, campus_id: siteA, value_num: 70 },
          { indicator_code: "E17", year: 2025, program_id: UNITS.programaA, campus_id: siteA, not_applicable: true },
        ],
      }),
      { commit: true },
    );
    expect(r).toMatchObject({ programas: 1, fichas: 1, adopciones: 1, cifras: 3 });

    const [e04] = await t.q<{ baseline_text: string; baseline_num: string; target_2026: string }>(
      "select baseline_text, baseline_num, target_2026 from imp_indicators where code = 'E04'",
    );
    expect(e04.baseline_text).toBe("81%");
    expect(Number(e04.baseline_num)).toBe(81);

    const [legacy] = await t.q<{ code: string }>("select code from imp_legacy_programs");
    expect(legacy.code).toBe("BAC-BGA");

    const [run] = await t.q<{ summary: Record<string, number> }>("select summary from imp_sync_runs");
    expect(run.summary).toMatchObject({ omitidas: 2, cifras: 3 });
  });

  it("volver a correr actualiza en vez de duplicar, y un campo ausente se conserva", async () => {
    await t.asUser(
      PEOPLE.admin,
      apply({
        adoptions: [{ indicator_code: "E17", program_id: UNITS.programaA, campus_id: siteA, baseline_text: "65%", baseline_num: 65 }],
        values: [{ indicator_code: "E17", year: 2024, program_id: UNITS.programaA, campus_id: siteA, value_num: 72 }],
      }),
      { commit: true },
    );
    const adoptions = await t.q<{ baseline_text: string; target_2026: string }>(
      "select a.baseline_text, a.target_2026 from imp_adoptions a join imp_indicators i on i.id = a.indicator_id where i.code = 'E17'",
    );
    expect(adoptions).toEqual([{ baseline_text: "65%", target_2026: "≥ 80%" }]);
    const values = await t.q<{ value_num: string }>(
      "select v.value_num from imp_values v join imp_indicators i on i.id = v.indicator_id where i.code = 'E17' and v.year = 2024",
    );
    expect(values.map((v) => Number(v.value_num))).toEqual([72]);
  });

  it("una ficha que no existe detiene todo el lote", async () => {
    const before = await t.q<{ n: number }>("select count(*)::int as n from imp_sync_runs");
    expect(
      await errorOf(
        t.asUser(
          PEOPLE.admin,
          apply({ values: [{ indicator_code: "Z99", year: 2024, program_id: null, campus_id: null, value_num: 1 }] }),
          { commit: true },
        ),
      ),
    ).toMatch(/no existe/);
    const after = await t.q<{ n: number }>("select count(*)::int as n from imp_sync_runs");
    expect(after[0].n).toBe(before[0].n);
  });

  it("la dirección de la hoja y el historial no los ve nadie más", async () => {
    const settings = await t.asUser(PEOPLE.director, (q) => q("select * from imp_sync_settings"));
    const runs = await t.asUser(PEOPLE.director, (q) => q("select * from imp_sync_runs"));
    expect(settings).toHaveLength(0);
    expect(runs).toHaveLength(0);
    const mine = await t.asUser(PEOPLE.admin, (q) => q<{ source_url: string }>("select source_url from imp_sync_settings"));
    expect(mine[0].source_url).toMatch(/^https:\/\/script\.google\.com\//);
  });
});

describe("imp_peer_adoptions", () => {
  it("cuenta los programas que siguen cada indicador sin contar al que pregunta", async () => {
    if (!siteB) return;
    // El Programa A sigue E17 (arriba). Desde el B, E17 lo sigue 1 de 1.
    const rows = await t.asUser(PEOPLE.otroDirector, (q) =>
      q<{ code: string; peers_all: number; total_all: number }>(
        `select i.code, p.peers_all, p.total_all from imp_peer_adoptions($1, $2) p join imp_indicators i on i.id = p.indicator_id`,
        [UNITS.programaB, siteB],
      ),
    );
    expect(rows).toContainEqual({ code: "E17", peers_all: 1, total_all: 1 });

    // Desde el propio A no se cuenta a sí mismo.
    const own = await t.asUser(PEOPLE.director, (q) => q("select * from imp_peer_adoptions($1, $2)", [UNITS.programaA, siteA]));
    expect(own).toHaveLength(0);
    void campus;
  });
});
