/* =============================================================================
   Indicadores de Impacto (0078, 0079).

   Lo que importa probar es el reparto: cada vicerrectoría ve y define solo su
   función, los programas ven lo publicado de las tres, lo que se adopta y se
   reporta va por programa × sede, y la pertenencia limitada a una sede no
   alcanza a la otra. Y que la carga inicial entra entera.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

const VR = {
  vi: "00000000-0000-4000-b000-000000000001",
  ve: "00000000-0000-4000-b000-000000000002",
} as const;

let t: TestDb;
let campus: Record<string, string>;
let ind: Record<string, string>;

const insertIndicator = (code: string, fn: string, owner: string, status = "publicado") =>
  `insert into imp_indicators (code, fn, stage, owner_unit_id, name, status)
   values ('${code}', '${fn}', 'procesos', '${owner}', 'Indicador ${code}', '${status}') returning id`;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  // La semilla crea sus vicerrectorías después de 0078: se les da su función aquí.
  await t.q(
    `insert into imp_unit_functions (unit_id, fn) values ($1, 'investigacion'), ($2, 'ensenanza')`,
    [VR.vi, VR.ve],
  );
  const rows = await t.q<{ slug: string; id: string }>("select slug, id from campuses");
  campus = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  // Quien reporta en el Programa A solo lo hace por Cúcuta.
  await t.q("update unit_members set campus_id = $1 where profile_id = $2 and unit_id = $3", [
    campus.cucuta, PEOPLE.reportante, UNITS.programaA,
  ]);
  ind = {};
  for (const [code, fn, owner, status] of [
    ["T01", "ensenanza", VR.ve, "publicado"],
    ["T02", "ensenanza", VR.ve, "borrador"],
    ["T03", "investigacion", VR.vi, "publicado"],
  ] as const) {
    const [row] = await t.q<{ id: string }>(insertIndicator(code, fn, owner, status));
    ind[code] = row.id;
  }
}, 120_000);

afterAll(() => t?.close());

const codes = (rows: { code: string }[]) => rows.map((r) => r.code).sort();
const TEST_CODES = "code in ('T01', 'T02', 'T03')";

describe("Quién ve qué ficha", () => {
  it("la vicerrectoría ve toda su función, borradores incluidos, y nada de las otras", async () => {
    const rows = await t.asUser(PEOPLE.ve, (q) => q<{ code: string }>(`select code from imp_indicators where ${TEST_CODES}`));
    expect(codes(rows)).toEqual(["T01", "T02"]);
  });

  it("un programa ve lo publicado de las tres funciones", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) => q<{ code: string }>(`select code from imp_indicators where ${TEST_CODES}`));
    expect(codes(rows)).toEqual(["T01", "T03"]);
  });

  it("la decanatura hereda la vista de sus programas", async () => {
    const rows = await t.asUser(PEOPLE.decano, (q) => q<{ code: string }>(`select code from imp_indicators where ${TEST_CODES}`));
    expect(codes(rows)).toEqual(["T01", "T03"]);
  });

  it("Planeación lo ve todo", async () => {
    const rows = await t.asUser(PEOPLE.admin, (q) => q<{ code: string }>(`select code from imp_indicators where ${TEST_CODES}`));
    expect(codes(rows)).toEqual(["T01", "T02", "T03"]);
  });
});

describe("Quién crea una ficha", () => {
  it("la vicerrectoría crea en su función", async () => {
    const rows = await t.asUser(PEOPLE.ve, (q) => q(insertIndicator("T10", "ensenanza", VR.ve)));
    expect(rows).toHaveLength(1);
  });

  it("no en otra función ni a nombre de otra unidad", async () => {
    expect(await errorOf(t.asUser(PEOPLE.ve, (q) => q(insertIndicator("T11", "investigacion", VR.vi))))).toMatch(/row-level security/);
  });

  it("un programa no crea fichas", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(insertIndicator("T12", "ensenanza", VR.ve))))).toMatch(/row-level security/);
  });

  it("ni la administración puede poner de dueña a una unidad que no lleva la función", async () => {
    expect(await errorOf(t.q(insertIndicator("T13", "ensenanza", VR.vi)))).toMatch(/no lleva esa función/);
  });

  it("una oficina puede llevar varias funciones; un programa, ninguna", async () => {
    await t.q(
      `insert into units (id, kind, code, name, slug) values ('00000000-0000-4000-b000-0000000000b1', 'oficina', 'PR-BI', 'Bienestar (prueba)', 'prueba-bienestar')`,
    );
    await t.q(
      `insert into imp_unit_functions (unit_id, fn) values ('00000000-0000-4000-b000-0000000000b1', 'ensenanza'), ('00000000-0000-4000-b000-0000000000b1', 'extension')`,
    );
    expect(await errorOf(t.q(`insert into imp_unit_functions (unit_id, fn) values ($1, 'ensenanza')`, [UNITS.programaA]))).toMatch(
      /vicerrectoría o una oficina/,
    );
  });
});

describe("Lo que adopta un programa, por sede", () => {
  const adopt = (indicator: string, program: string, campusId: string) =>
    `insert into imp_adoptions (indicator_id, program_id, campus_id) values ('${indicator}', '${program}', '${campusId}') returning id`;

  it("adopta una ficha publicada en una sede donde se ofrece", async () => {
    const rows = await t.asUser(PEOPLE.director, (q) => q(adopt(ind.T01, UNITS.programaA, campus.bucaramanga)), { commit: true });
    expect(rows).toHaveLength(1);
  });

  it("no en una sede donde no se ofrece", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(adopt(ind.T03, UNITS.programaA, campus.valledupar))))).toMatch(
      /no se ofrece en esa sede/,
    );
  });

  it("no un borrador", async () => {
    expect(await errorOf(t.q(adopt(ind.T02, UNITS.programaA, campus.bucaramanga)))).toMatch(/ficha publicada/);
  });

  it("quien reporta solo por Cúcuta no adopta en Bucaramanga", async () => {
    expect(await errorOf(t.asUser(PEOPLE.reportante, (q) => q(adopt(ind.T03, UNITS.programaA, campus.bucaramanga))))).toMatch(
      /row-level security/,
    );
    const rows = await t.asUser(PEOPLE.reportante, (q) => q(adopt(ind.T03, UNITS.programaA, campus.cucuta)));
    expect(rows).toHaveLength(1);
  });
});

describe("Las cifras", () => {
  const value = (indicator: string, program: string | null, campusId: string | null, extra = "value_num", v = "10") =>
    `insert into imp_values (indicator_id, year, program_id, campus_id, ${extra})
     values ('${indicator}', 2025, ${program ? `'${program}'` : "null"}, ${campusId ? `'${campusId}'` : "null"}, ${v}) returning value_num`;

  it("la vicerrectoría escribe la cifra global y la de un programa", async () => {
    await t.asUser(PEOPLE.ve, async (q) => {
      expect(await q(value(ind.T01, null, null))).toHaveLength(1);
      expect(await q(value(ind.T01, UNITS.programaA, campus.bucaramanga))).toHaveLength(1);
    });
  });

  it("otra vicerrectoría no", async () => {
    expect(await errorOf(t.asUser(PEOPLE.vi, (q) => q(value(ind.T01, null, null))))).toMatch(/row-level security/);
  });

  it("el programa escribe la suya, pero no la global", async () => {
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q(value(ind.T01, UNITS.programaA, campus.cucuta))).toHaveLength(1);
    });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(value(ind.T01, null, null))))).toMatch(/row-level security/);
  });

  it("la sede de la pertenencia manda", async () => {
    expect(await errorOf(t.asUser(PEOPLE.reportante, (q) => q(value(ind.T01, UNITS.programaA, campus.bucaramanga))))).toMatch(
      /row-level security/,
    );
  });

  it("con numerador y denominador, la cifra la calcula la base", async () => {
    const [row] = await t.q<{ value_num: string }>(
      `insert into imp_values (indicator_id, year, numerator, denominator, value_num) values ($1, 2024, 412, 528, 1) returning value_num`,
      [ind.T01],
    );
    expect(Number(row.value_num)).toBeCloseTo(78.0303, 3);
  });

  it("un año se reporta una sola vez por alcance", async () => {
    await t.q(value(ind.T03, null, null).replace("2025", "2023"));
    expect(await errorOf(t.q(value(ind.T03, null, null).replace("2025", "2023")))).toMatch(/duplicate key/);
  });

  it("la cifra de un programa no la lee otro programa, sí su vicerrectoría", async () => {
    await t.q(value(ind.T01, UNITS.programaA, campus.bucaramanga).replace("2025", "2022"));
    const other = await t.asUser(PEOPLE.otroDirector, (q) => q("select 1 from imp_values where program_id = $1", [UNITS.programaA]));
    expect(other).toEqual([]);
    const ve = await t.asUser(PEOPLE.ve, (q) => q("select 1 from imp_values where program_id = $1", [UNITS.programaA]));
    expect(ve.length).toBeGreaterThan(0);
  });
});

describe("Carga inicial (0079)", () => {
  it("entra el catálogo entero con sus dimensiones, referencias y cruces", async () => {
    await t.q(
      `insert into units (kind, code, name, slug, substantive_function) values
         ('vicerrectoria', 'VI', 'Vicerrectoría de Investigaciones', 'vi', 'investigacion'),
         ('vicerrectoria', 'VE', 'Vicerrectoría de Enseñanza', 've', 'ensenanza'),
         ('vicerrectoria', 'VEX', 'Vicerrectoría de Extensión', 'vex', 'extension')`,
    );
    await t.q(
      `insert into imp_unit_functions (unit_id, fn) select id, substantive_function from units where code in ('VI', 'VE', 'VEX')`,
    );
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0079_impacto_carga_inicial.sql"), "utf8"));

    const [counts] = await t.q<Record<string, number>>(
      `select (select count(*)::int from imp_indicators where code !~ '^T') as fichas,
              (select count(*)::int from imp_indicators where fn = 'investigacion' and code !~ '^T') as inv,
              (select count(*)::int from imp_indicators where fn = 'ensenanza' and code !~ '^T') as ens,
              (select count(*)::int from imp_indicators where fn = 'extension' and code !~ '^T') as ext,
              (select count(*)::int from imp_indicators where suggested) as sugeridos,
              (select count(*)::int from imp_dimensions) as dimensiones,
              (select count(*)::int from imp_indicator_refs) as referencias`,
    );
    expect(counts).toEqual({ fichas: 105, inv: 37, ens: 26, ext: 42, sugeridos: 13, dimensiones: 11, referencias: 16 });

    const [e17] = await t.q<{ baseline_num: string; target_2026: string; cesu: string[] }>(
      "select baseline_num, target_2026, cesu from imp_indicators where code = 'E17'",
    );
    expect(Number(e17.baseline_num)).toBe(75);
    expect(e17.target_2026).toBe("≥ 80%");
    expect(e17.cesu).toEqual(["C23", "C39", "C40"]);

    const pillars = await t.q<{ position: number }>(
      `select p.position from imp_alignments a join imp_indicators i on i.id = a.indicator_id join pillars p on p.id = a.pillar_id
        where i.code = 'E17' order by p.position`,
    );
    expect(pillars.map((p) => p.position)).toEqual([1, 3]);

    // El diccionario del motor (0080) ya corrió con las migraciones: los seis
    // pilares y los ODS con criterios, y ninguno repetido.
    const criteria = await t.q<{ target: string; destinos: number; n: number }>(
      `select target, count(distinct coalesce(pillar_id::text, sdg::text))::int as destinos, count(*)::int as n
         from imp_criteria group by target order by target`,
    );
    expect(criteria.map((c) => [c.target, c.destinos])).toEqual([["ods", 17], ["pilar", 6]]);
    expect(criteria.reduce((sum, c) => sum + c.n, 0)).toBe(270);

    // Correr la carga otra vez no duplica nada.
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0079_impacto_carga_inicial.sql"), "utf8"));
    const [again] = await t.q<{ n: number }>("select count(*)::int as n from imp_indicators where code !~ '^T'");
    expect(again.n).toBe(105);
  });
});

describe("La sede de una pertenencia, desde Usuarios (0082)", () => {
  const set = (rows: object[]) => (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
    q("select admin_set_memberships($1, $2::jsonb, false)", [PEOPLE.reportante, JSON.stringify(rows)]);
  const campusOf = (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
    q("select campus_id from unit_members where profile_id = $1 and unit_id = $2", [PEOPLE.reportante, UNITS.programaA]) as Promise<
      { campus_id: string | null }[]
    >;

  it("sin la clave conserva la sede; null la abre a todas; una sede la limita", async () => {
    await t.asUser(PEOPLE.admin, async (q) => {
      await set([{ unit_id: UNITS.programaA, role: "editor" }])(q);
      expect((await campusOf(q))[0].campus_id).toBe(campus.cucuta);
      await set([{ unit_id: UNITS.programaA, campus_id: null }])(q);
      expect((await campusOf(q))[0].campus_id).toBeNull();
      await set([{ unit_id: UNITS.programaA, campus_id: campus.bucaramanga }])(q);
      expect((await campusOf(q))[0].campus_id).toBe(campus.bucaramanga);
    });
  });

  it("no deja limitar un programa a una sede donde no se ofrece", async () => {
    expect(
      await errorOf(t.asUser(PEOPLE.admin, (q) => set([{ unit_id: UNITS.programaA, campus_id: campus.valledupar }])(q))),
    ).toMatch(/no se ofrece/);
  });
});
