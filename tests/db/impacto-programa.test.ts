/* =============================================================================
   Impacto · indicadores propios de los programas y cifras por sede (0084).

   Lo que importa: un programa crea y ve solo lo suyo; la vicerrectoría de la
   función lo lee y lo reorganiza; nadie más. Y el importador carga cifras
   globales, por sede y por programa con los permisos de quien carga.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

const VR = {
  vi: "00000000-0000-4000-b000-000000000001",
  ve: "00000000-0000-4000-b000-000000000002",
} as const;

let t: TestDb;
let campus: Record<string, string>;
let ficha: Record<string, string>;

const newProgramIndicator = (program: string, campusId: string, extra = "") =>
  `insert into imp_indicators (code, fn, stage, owner_unit_id, program_id, campus_id, name, status${extra ? ", parent_id" : ""})
   values ('', 'ensenanza', 'procesos', '${program}', '${program}', '${campusId}', 'Tutorías entre pares', 'publicado'${extra ? `, '${extra}'` : ""})
   returning id, code`;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q(`insert into imp_unit_functions (unit_id, fn) values ($1, 'investigacion'), ($2, 'ensenanza')`, [VR.vi, VR.ve]);
  const rows = await t.q<{ slug: string; id: string }>("select slug, id from campuses");
  campus = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  ficha = {};
  for (const [code, fn, owner] of [["T01", "ensenanza", VR.ve], ["T02", "investigacion", VR.vi]] as const) {
    const [row] = await t.q<{ id: string }>(
      `insert into imp_indicators (code, fn, stage, owner_unit_id, name, status) values ($1, $2, 'procesos', $3, $4, 'publicado') returning id`,
      [code, fn, owner, `Ficha ${code}`],
    );
    ficha[code] = row.id;
  }
}, 120_000);

afterAll(() => t?.close());

describe("Indicadores del programa", () => {
  let mine: { id: string; code: string };

  it("el programa crea el suyo, con código automático y relacionado con una ficha", async () => {
    [mine] = await t.asUser(
      PEOPLE.director,
      (q) => q<{ id: string; code: string }>(newProgramIndicator(UNITS.programaA, campus.bucaramanga, ficha.T01)),
      { commit: true },
    );
    expect(mine.code).toMatch(/^P-[A-Z0-9]+-[A-Z0-9]+-001$/);
    const [second] = await t.asUser(PEOPLE.director, (q) => q<{ code: string }>(newProgramIndicator(UNITS.programaA, campus.bucaramanga)));
    expect(second.code).toMatch(/-002$/);
  });

  it("no crea para otro programa, ni se relaciona con otro indicador de programa", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(newProgramIndicator(UNITS.programaB, campus.bucaramanga))))).toMatch(
      /row-level security/,
    );
    expect(
      await errorOf(t.asUser(PEOPLE.director, (q) => q(newProgramIndicator(UNITS.programaA, campus.bucaramanga, mine.id)))),
    ).toMatch(/ficha institucional/);
  });

  it("lo ven el programa y la vicerrectoría de su función; otro programa y otra vicerrectoría no", async () => {
    const read = (who: string) =>
      t.asUser(who, (q) => q<{ code: string }>("select code from imp_indicators where program_id is not null"));
    expect(await read(PEOPLE.director)).toHaveLength(1);
    expect(await read(PEOPLE.ve)).toHaveLength(1);
    expect(await read(PEOPLE.otroDirector)).toHaveLength(0);
    expect(await read(PEOPLE.vi)).toHaveLength(0);
  });

  it("no se adopta: ya es de su programa", async () => {
    expect(
      await errorOf(
        t.q(`insert into imp_adoptions (indicator_id, program_id, campus_id) values ($1, $2, $3)`, [
          mine.id,
          UNITS.programaB,
          campus.bucaramanga,
        ]),
      ),
    ).toMatch(/no se adopta/);
  });

  it("la vicerrectoría lo relaciona con una ficha de su función y le pone pilares; otra no", async () => {
    await t.asUser(PEOPLE.ve, (q) => q("select imp_link_program_indicator($1, null)", [mine.id]), { commit: true });
    const [row] = await t.q<{ parent_id: string | null }>("select parent_id from imp_indicators where id = $1", [mine.id]);
    expect(row.parent_id).toBeNull();
    expect(await errorOf(t.asUser(PEOPLE.ve, (q) => q("select imp_link_program_indicator($1, $2)", [mine.id, ficha.T02])))).toMatch(
      /misma función/,
    );
    expect(await errorOf(t.asUser(PEOPLE.vi, (q) => q("select imp_link_program_indicator($1, $2)", [mine.id, ficha.T01])))).toMatch(
      /reorganizan/,
    );
    const alignments = await t.asUser(PEOPLE.ve, (q) =>
      q(`insert into imp_alignments (indicator_id, target, sdg, origin, confirmed) values ($1, 'ods', 4, 'manual', true) returning id`, [mine.id]),
    );
    expect(alignments).toHaveLength(1);
  });

  it("el programa reporta sus cifras", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) =>
      q(`insert into imp_values (indicator_id, year, program_id, campus_id, value_num) values ($1, 2025, $2, $3, 12) returning id`, [
        mine.id,
        UNITS.programaA,
        campus.bucaramanga,
      ]),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("imp_import_values", () => {
  const load = (rows: object[]) => (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
    q("select imp_import_values($1::jsonb) as r", [JSON.stringify(rows)]) as Promise<{ r: { creadas: number; actualizadas: number } }[]>;

  it("la vicerrectoría carga global, por sede y por programa; volver a cargar actualiza", async () => {
    const rows = [
      { indicator_code: "T01", year: 2025, program_id: null, campus_id: null, value_num: 80 },
      { indicator_code: "T01", year: 2025, program_id: null, campus_id: campus.cucuta, value_num: 76 },
      { indicator_code: "T01", year: 2025, program_id: UNITS.programaA, campus_id: campus.cucuta, value_num: 71, note: "Corte diciembre" },
    ];
    const [{ r }] = await t.asUser(PEOPLE.ve, load(rows), { commit: true });
    expect(r).toEqual({ creadas: 3, actualizadas: 0 });
    const [{ r: again }] = await t.asUser(PEOPLE.ve, load([{ ...rows[1], value_num: 77 }]), { commit: true });
    expect(again).toEqual({ creadas: 0, actualizadas: 1 });
    const [sede] = await t.q<{ value_num: string }>(
      "select value_num from imp_values where indicator_id = $1 and program_id is null and campus_id = $2",
      [ficha.T01, campus.cucuta],
    );
    expect(Number(sede.value_num)).toBe(77);
  });

  it("una fila ajena detiene el lote entero", async () => {
    expect(
      await errorOf(
        t.asUser(PEOPLE.ve, load([
          { indicator_code: "T01", year: 2024, program_id: null, campus_id: null, value_num: 1 },
          { indicator_code: "T02", year: 2024, program_id: null, campus_id: null, value_num: 1 },
        ])),
      ),
    ).toMatch(/T02/); // Ni la ve: RLS la oculta, así que «no existe».
  });

  it("un programa no carga la cifra global", async () => {
    expect(
      await errorOf(t.asUser(PEOPLE.director, load([{ indicator_code: "T01", year: 2024, program_id: null, campus_id: null, value_num: 1 }]))),
    ).toMatch(/No puede cargar/);
  });
});

describe("imp_sync_apply con indicadores de programa", () => {
  it("crea por legacy_id, relaciona con su ficha y no duplica al repetir", async () => {
    const batch = {
      program_indicators: [
        {
          legacy_id: "P_FISBGA_050",
          program_id: UNITS.programaA,
          campus_id: campus.cucuta,
          fn: "ensenanza",
          stage: "impacto",
          name: "Egresados en posgrado",
          parent_code: "T01",
          baseline_text: "12",
          baseline_num: 12,
        },
      ],
      values: [{ legacy_id: "P_FISBGA_050", year: 2024, program_id: UNITS.programaA, campus_id: campus.cucuta, value_num: 14 }],
    };
    await t.asUser(PEOPLE.admin, (q) => q("select imp_sync_apply($1::jsonb)", [JSON.stringify(batch)]), { commit: true });
    await t.asUser(PEOPLE.admin, (q) => q("select imp_sync_apply($1::jsonb)", [JSON.stringify(batch)]), { commit: true });
    const rows = await t.q<{ parent_id: string; baseline_text: string; code: string }>(
      "select parent_id, baseline_text, code from imp_indicators where legacy_id = 'P_FISBGA_050'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ parent_id: ficha.T01, baseline_text: "12" });
    const values = await t.q("select 1 from imp_values v join imp_indicators i on i.id = v.indicator_id where i.legacy_id = 'P_FISBGA_050'");
    expect(values).toHaveLength(1);
  });
});

describe("Mr. Pilo: pesos, obligatorias y fuentes (0085)", () => {
  it("los pesos los lee cualquiera y los escribe la administración", async () => {
    const read = await t.asUser(PEOPLE.director, (q) => q<{ source_map: Record<string, string[]> }>("select source_map from imp_pilo_settings"));
    expect(read[0].source_map.p1p2p3).toContain("E04");
    const denied = await t.asUser(PEOPLE.director, (q) => q("update imp_pilo_settings set weights = '{\"cesu\": 9}' returning id"));
    expect(denied).toHaveLength(0);
    const done = await t.asUser(PEOPLE.admin, (q) => q("update imp_pilo_settings set weights = '{\"cesu\": 9}' returning id"));
    expect(done).toHaveLength(1);
  });

  it("solo una ficha institucional puede ser obligatoria", async () => {
    expect(
      await errorOf(t.q("update imp_indicators set mandatory = true where program_id is not null")),
    ).toMatch(/mandatory_scope/);
    await t.q("update imp_indicators set mandatory = true where code = 'T01'");
  });

  it("las cifras de fuentes las ve el programa en su sede, no otro programa", async () => {
    await t.q(
      `insert into imp_source_figures (source, period, year, program_id, campus_id, students, approved_rate)
       values ('p1p2p3', '2026-1', 2026, $1, $2, 120, 84.5)`,
      [UNITS.programaA, campus.bucaramanga],
    );
    expect(await t.asUser(PEOPLE.director, (q) => q("select 1 from imp_source_figures"))).toHaveLength(1);
    expect(await t.asUser(PEOPLE.otroDirector, (q) => q("select 1 from imp_source_figures"))).toHaveLength(0);
    expect(await t.asUser(PEOPLE.ve, (q) => q("select 1 from imp_source_figures"))).toHaveLength(1);
  });
});
