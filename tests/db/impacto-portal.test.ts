/* =============================================================================
   Fase 7 (cierre) · el portal lee la base (0072).

   vr7 publicada con el piloto y el periodo 2026-2 abierto. El Programa A
   captura y envía; la decanatura aprueba casi todo; Enseñanza y Extensión
   validan lo suyo; Investigaciones no valida nada. El Programa B tiene cifras
   pero sigue en borrador. Solo lo validado debe llegar al portal, y solo a
   quien tiene sesión.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INSTITUTION, buildPortal, resolveScope, statFor } from "../../src/modules/impacto/data/lens";
import type { RawCatalog, RawRecord, RawStructure } from "../../src/modules/impacto/data/lens";
import { PEOPLE, UNITS, createTestDb, errorOf, publishPilotCatalog } from "./harness";
import type { Query, TestDb } from "./harness";

let t: TestDb;
let periodId: string;

const LECTOR = "00000000-0000-4000-a000-000000000050";
const INACTIVO = "00000000-0000-4000-a000-000000000051";

interface Row {
  id: string;
  code: string;
  campus: string | null;
  state: string;
  function_id: string;
}

const commit = <T>(user: string, work: (q: Query) => Promise<T>) => t.asUser(user, work, { commit: true });
const review = (user: string, ids: string[], action: string) =>
  commit(user, (q) => q("select imp_review($1::uuid[], $2, null, '')", [ids, action]));
const rowsOf = (program: string) =>
  t.q<Row>(
    `select r.id, i.code, c.slug as campus, r.state, i.function_id
       from imp_records r join imp_assignments a on a.id = r.assignment_id join imp_indicators i on i.id = a.indicator_id
       left join campuses c on c.id = a.campus_id
      where a.program_id = $1 and a.period_id = $2 order by i.code, c.slug`,
    [program, periodId],
  );

const portalRecords = (user: string | null = LECTOR) => t.asUser(user, (q) => q<RawRecord>("select * from imp_portal_records()"));
const portalCatalog = (user: string | null = LECTOR) =>
  t.asUser(user, (q) => q<{ c: RawCatalog }>("select imp_portal_catalog() as c")).then((r) => r[0].c);
const portalStructure = (user: string | null = LECTOR) =>
  t.asUser(user, (q) => q<{ s: RawStructure }>("select imp_portal_structure() as s")).then((r) => r[0].s);
const portal = async () => buildPortal(await portalCatalog(), await portalStructure(), await portalRecords());

beforeAll(async () => {
  t = await createTestDb();
  await t.q(`insert into auth.users (id, email) values ($1, 'lector@prueba.udes.edu.co'), ($2, 'inactivo@prueba.udes.edu.co') on conflict do nothing`, [LECTOR, INACTIVO]);
  await t.q(`insert into profiles (id, email, full_name) values ($1, 'lector@prueba.udes.edu.co', 'Consulta'), ($2, 'inactivo@prueba.udes.edu.co', 'Inactivo') on conflict (id) do nothing`, [LECTOR, INACTIVO]);
  await t.q("update profiles set role = 'consulta', is_active = (id = $1) where id in ($1, $2)", [LECTOR, INACTIVO]);

  const versionId = await publishPilotCatalog(t);
  const [{ r }] = await commit(PEOPLE.admin, (q) =>
    q<{ r: { periodId: string } }>("select imp_open_period('2026-2', '2026-10-15', '2026-10-25', '2026-11-05', $1) as r", [versionId]),
  );
  periodId = r.periodId;

  // La dirección del Programa A captura: Bucaramanga 80 de 100, Cúcuta 45 de 50.
  const a = await rowsOf(UNITS.programaA);
  await commit(PEOPLE.director, async (q) => {
    for (const row of a) {
      const [num, den] = row.campus === "cucuta" ? [45, 50] : [80, 100];
      await q("update imp_records set numerator = $2, denominator = $3, n_responses = 40, num_comparison = 5, den_comparison = 20 where id = $1", [row.id, num, den]);
    }
  });
  // El Programa B tiene cifras, pero nadie las ha enviado.
  await t.q(
    `update imp_records r set numerator = 999, denominator = 1000
       from imp_assignments a where a.id = r.assignment_id and a.program_id = $1`,
    [UNITS.programaB],
  );
});

afterAll(async () => {
  await t.close();
});

describe("solo sale lo validado", () => {
  it("en borrador no sale nada, aunque tenga cifras", async () => {
    expect(await portalRecords()).toEqual([]);
  });

  it("enviado y aprobado por la decanatura tampoco", async () => {
    await commit(PEOPLE.director, (q) => q("select imp_submit_program($1, $2, true)", [periodId, UNITS.programaA]));
    expect(await portalRecords()).toEqual([]);

    // La decanatura aprueba todo menos X04 en Cúcuta, que se queda enviado.
    const a = await rowsOf(UNITS.programaA);
    const keep = a.find((r) => r.code === "X04" && r.campus === "cucuta")!;
    await review(PEOPLE.decano, a.filter((r) => r.id !== keep.id).map((r) => r.id), "aprobar");
    expect(await portalRecords()).toEqual([]);
  });

  it("validado sí: Enseñanza y Extensión validan lo suyo, Investigaciones no", async () => {
    const approved = (await rowsOf(UNITS.programaA)).filter((r) => r.state === "aprobado_decanatura");
    await review(PEOPLE.ve, approved.filter((r) => r.function_id === "ensenanza").map((r) => r.id), "validar");
    await review(PEOPLE.vx, approved.filter((r) => r.function_id === "extension").map((r) => r.id), "validar");

    const all = await rowsOf(UNITS.programaA);
    const validated = all.filter((r) => r.state === "validado");
    const out = await portalRecords();
    expect(out).toHaveLength(validated.length);
    expect(out.length).toBeGreaterThan(0);
    // Nada de Investigaciones (aprobado), del Programa B (borrador) ni X04 en Cúcuta (enviado).
    expect(out.some((r) => r.code.startsWith("I"))).toBe(false);
    expect(out.some((r) => r.program_id === UNITS.programaB)).toBe(false);
    expect(all.find((r) => r.code === "X04" && r.campus === "cucuta")!.state).toBe("enviado");
    expect(out.filter((r) => r.code === "X04")).toHaveLength(1);
    expect(out.every((r) => r.period_code === "2026-2")).toBe(true);
  });

  it("sale la medida, no un porcentaje suelto: numerador, denominador y n", async () => {
    const e04 = (await portalRecords()).filter((r) => r.code === "E04");
    expect(e04.map((r) => [Number(r.numerator), Number(r.denominator)]).sort()).toEqual([[45, 50], [80, 100]]);
    expect(e04.every((r) => r.campus_id !== null)).toBe(true);
    const e13 = (await portalRecords()).filter((r) => r.code === "E13");
    expect(e13).toHaveLength(1);
    expect(e13[0].campus_id).toBeNull();
  });
});

describe("quién lee el portal", () => {
  it("una sesión con rol consulta lee las tres cosas", async () => {
    const catalog = await portalCatalog();
    expect(catalog.version?.number).toBe(1);
    expect(catalog.indicators).toHaveLength(106);
    const structure = await portalStructure();
    expect(structure.programs.map((p) => p.id)).toEqual(expect.arrayContaining([UNITS.programaA, UNITS.programaB, UNITS.maestria]));
    expect(structure.faculties.map((f) => f.id)).toContain(UNITS.facultad);
    const a = structure.programs.find((p) => p.id === UNITS.programaA)!;
    expect(a.faculty_id).toBe(UNITS.facultad);
    expect(a.campus_ids).toHaveLength(2);
  });

  it("anon no ejecuta ninguna", async () => {
    expect(await errorOf(portalRecords(null))).toMatch(/permission denied/);
    expect(await errorOf(portalCatalog(null))).toMatch(/permission denied/);
    expect(await errorOf(portalStructure(null))).toMatch(/permission denied/);
  });

  it("un perfil desactivado tampoco", async () => {
    expect(await errorOf(portalRecords(INACTIVO))).toMatch(/sesión activa de la intranet/);
    expect(await errorOf(portalCatalog(INACTIVO))).toMatch(/sesión activa de la intranet/);
  });
});

describe("las lentes con las cifras de la base", () => {
  it("la facultad consolida por razón de sumas, no promediando porcentajes", async () => {
    const data = await portal();
    const e04 = data.indicatorByCode.get("E04")!;
    const stat = statFor(data, e04, resolveScope(data, "facultad", "prueba-facultad")!);
    // (80 + 45) ÷ (100 + 50) × 100 = 83,3 %; el promedio de 80 % y 90 % sería 85 %.
    expect(stat.current?.numerador).toBe(125);
    expect(stat.current?.denominador).toBe(150);
    expect(stat.current?.valor).toBeCloseTo(83.333, 2);
    expect(statFor(data, e04, INSTITUTION).current?.valor).toBeCloseTo(83.333, 2);
  });

  it("la lente de campus no reparte lo que se reporta por programa", async () => {
    const data = await portal();
    const campus = resolveScope(data, "campus", "bucaramanga")!;
    const e04 = statFor(data, data.indicatorByCode.get("E04")!, campus);
    expect(e04.current?.valor).toBe(80);
    expect(e04.current?.registros).toBe(1);
    // E13 se reporta por programa: en el campus no tiene cifra, aunque el programa la tenga.
    const e13 = data.indicatorByCode.get("E13")!;
    expect(statFor(data, e13, campus)).toMatchObject({ current: null, gap: "sin_desagregar" });
    expect(statFor(data, e13, resolveScope(data, "programa", "prueba-programa-a")!).current?.valor).toBe(80);
  });

  it("lo no validado se ve hueco: Investigaciones sin registros, los sugeridos como sugeridos", async () => {
    const data = await portal();
    expect(statFor(data, data.indicatorByCode.get("I01")!, INSTITUTION).gap).toBe("sin_registros");
    const suggested = data.indicators.find((i) => i.estado === "sugerido")!;
    expect(statFor(data, suggested, INSTITUTION).gap).toBe("sugerido");
  });
});

describe("la versión publicada, no el borrador", () => {
  it("un borrador nuevo no cambia lo que ve el portal", async () => {
    const [{ id }] = await commit(PEOPLE.admin, (q) => q<{ id: string }>("select imp_new_draft() as id"));
    await commit(PEOPLE.admin, (q) => q("update imp_indicators set name = 'Nombre en borrador' where version_id = $1 and code = 'E04'", [id]));
    const catalog = await portalCatalog();
    expect(catalog.version?.number).toBe(1);
    expect(catalog.indicators.find((i) => i.code === "E04")!.name).not.toBe("Nombre en borrador");
  });

  it("al publicar la versión 2, un indicador cuya fórmula cambió deja fuera los periodos de la anterior", async () => {
    const [draft] = await t.q<{ id: string }>("select id from imp_catalog_versions where state = 'borrador'");
    await commit(PEOPLE.admin, (q) => q("update imp_indicators set aggregation = 'no_agregable' where version_id = $1 and code = 'E04'", [draft.id]));
    await commit(PEOPLE.admin, (q) => q("select imp_publish_catalog($1)", [draft.id]));

    const catalog = await portalCatalog();
    expect(catalog.version?.number).toBe(2);
    expect(catalog.indicators.find((i) => i.code === "E04")!.name).toBe("Nombre en borrador");
    const out = await portalRecords();
    // E04 se calculaba distinto en 2026-2: no se mezcla. E13 no cambió: sigue.
    expect(out.some((r) => r.code === "E04")).toBe(false);
    expect(out.some((r) => r.code === "E13")).toBe(true);
  });
});
