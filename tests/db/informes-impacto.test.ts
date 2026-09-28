/* =============================================================================
   Informes de Impacto con Mr. Pilo (0100): por defecto solo la
   administración; ella los abre por tipo de unidad, y aun así cada quien
   escribe solo sobre la unidad a la que pertenece. Lo escrito lo ven quien
   lo escribió y la administración.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

let t: TestDb;
let bucaramanga = "";
let cucuta = "";

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  // Las vicerrectorías de prueba llevan su función (la semilla llega después de 0078).
  await t.q("insert into imp_unit_functions (unit_id, fn) select id, substantive_function from units where code like 'PR-V%' on conflict do nothing");
  [{ id: bucaramanga }] = await t.q<{ id: string }>("select id from campuses where slug = 'bucaramanga'");
  [{ id: cucuta }] = await t.q<{ id: string }>("select id from campuses where slug = 'cucuta'");
}, 120_000);

afterAll(() => t?.close());

const open = (value: Record<string, boolean>) => t.q("update pilo_ai_settings set impacto_report = $1::jsonb where id = 1", [JSON.stringify(value)]);
const allowed = (who: string, kind: string, ref: string, campus: string | null = null) =>
  t.asUser(who, async (q) => (await q<{ ok: boolean }>("select imp_report_allowed($1, $2, $3::uuid) as ok", [kind, ref, campus]))[0].ok);

describe("interruptor de los informes", () => {
  it("por defecto está cerrado para todos menos la administración", async () => {
    const [row] = await t.q<{ r: Record<string, boolean> }>("select impacto_report as r from pilo_ai_settings");
    expect(row.r).toEqual({ programa: false, facultad: false, vicerrectoria: false });
    expect(await allowed(PEOPLE.admin, "programa", UNITS.programaZ)).toBe(true);
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaA)).toBe(false);
    expect(await allowed(PEOPLE.decano, "facultad", UNITS.facultad)).toBe(false);
    expect(await allowed(PEOPLE.vi, "vicerrectoria", "investigacion")).toBe(false);
  });

  it("cualquier sesión sabe qué está abierto; sin sesión, nada", async () => {
    await open({ programa: true, facultad: false, vicerrectoria: false });
    const [{ s }] = await t.asUser(PEOPLE.reportante, (q) => q<{ s: Record<string, boolean> }>("select imp_report_switches() as s"));
    expect(s).toMatchObject({ programa: true, facultad: false, vicerrectoria: false });
    expect(await errorOf(t.asUser(null, (q) => q("select imp_report_switches()")))).toMatch(/permission denied/);
  });

  it("solo la administración cambia el interruptor", async () => {
    await t.asUser(PEOPLE.director, (q) => q(`update pilo_ai_settings set impacto_report = '{"programa": true, "facultad": true, "vicerrectoria": true}'`), { commit: true });
    const [row] = await t.q<{ r: Record<string, boolean> }>("select impacto_report as r from pilo_ai_settings");
    expect(row.r.facultad).toBe(false);
    expect(await errorOf(t.q("update pilo_ai_settings set impacto_report = '[]'::jsonb"))).toMatch(/pilo_ai_settings_impacto_report/);
  });
});

describe("cada quien, su unidad", () => {
  it("un programa escribe sobre el suyo y no sobre otro", async () => {
    await open({ programa: true, facultad: true, vicerrectoria: true });
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaA)).toBe(true);
    expect(await allowed(PEOPLE.reportante, "programa", UNITS.programaA, cucuta)).toBe(true);
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaB)).toBe(false);
    expect(await allowed(PEOPLE.director, "facultad", UNITS.facultad)).toBe(false);
    expect(await allowed(PEOPLE.director, "programa", "no-es-un-id")).toBe(false);
  });

  it("la decanatura, su facultad y sus programas; no los de otra facultad", async () => {
    expect(await allowed(PEOPLE.decano, "facultad", UNITS.facultad)).toBe(true);
    expect(await allowed(PEOPLE.decano, "programa", UNITS.programaB)).toBe(true);
    expect(await allowed(PEOPLE.decano, "programa", UNITS.programaZ)).toBe(false);
    expect(await allowed(PEOPLE.otroDirector, "facultad", UNITS.facultad)).toBe(false);
  });

  it("una vicerrectoría, su función", async () => {
    expect(await allowed(PEOPLE.vi, "vicerrectoria", "investigacion")).toBe(true);
    expect(await allowed(PEOPLE.vi, "vicerrectoria", "extension")).toBe(false);
    expect(await allowed(PEOPLE.director, "vicerrectoria", "investigacion")).toBe(false);
  });

  it("una pertenencia de una sede no alcanza para todas las sedes", async () => {
    await t.q("update unit_members set campus_id = $1 where profile_id = $2 and unit_id = $3", [bucaramanga, PEOPLE.reportante, UNITS.programaA]);
    expect(await allowed(PEOPLE.reportante, "programa", UNITS.programaA, bucaramanga)).toBe(true);
    expect(await allowed(PEOPLE.reportante, "programa", UNITS.programaA, cucuta)).toBe(false);
    expect(await allowed(PEOPLE.reportante, "programa", UNITS.programaA)).toBe(false);
    await t.q("update unit_members set campus_id = null where profile_id = $1 and unit_id = $2", [PEOPLE.reportante, UNITS.programaA]);
  });

  it("al cerrar el tipo, vuelve a ser solo de la administración", async () => {
    await open({ programa: false, facultad: true, vicerrectoria: true });
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaA)).toBe(false);
    expect(await allowed(PEOPLE.admin, "programa", UNITS.programaA)).toBe(true);
  });
});

describe("informes guardados", () => {
  const save = (who: string, kind: string, ref: string, title = "Informe de prueba") =>
    t.asUser(who, (q) => q("insert into imp_ai_reports (kind, ref, title, content) values ($1, $2, $3, '{\"version\": 1}'::jsonb)", [kind, ref, title]), { commit: true });

  it("se guarda solo lo que se puede pedir", async () => {
    await open({ programa: true, facultad: false, vicerrectoria: false });
    await save(PEOPLE.director, "programa", UNITS.programaA);
    expect(await errorOf(save(PEOPLE.director, "programa", UNITS.programaB))).toMatch(/row-level security/);
    expect(await errorOf(save(PEOPLE.decano, "facultad", UNITS.facultad))).toMatch(/row-level security/);
    await save(PEOPLE.admin, "vicerrectoria", "extension", "De la administración");
  });

  it("nadie firma a nombre de otro", async () => {
    expect(
      await errorOf(
        t.asUser(PEOPLE.director, (q) =>
          q("insert into imp_ai_reports (kind, ref, title, content, created_by) values ('programa', $1, 'x', '{}'::jsonb, $2)", [UNITS.programaA, PEOPLE.decano]),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("cada quien ve los suyos; la administración, todos", async () => {
    const mine = await t.asUser(PEOPLE.director, (q) => q<{ title: string }>("select title from imp_ai_reports"));
    expect(mine.map((r) => r.title)).toEqual(["Informe de prueba"]);
    expect(await t.asUser(PEOPLE.decano, (q) => q("select * from imp_ai_reports"))).toHaveLength(0);
    expect(await t.asUser(PEOPLE.admin, (q) => q("select * from imp_ai_reports"))).toHaveLength(2);
    expect(await errorOf(t.asUser(null, (q) => q("select * from imp_ai_reports")))).toMatch(/permission denied/);
  });

  it("solo su autor lo completa, y sin cambiarlo de unidad", async () => {
    await t.asUser(PEOPLE.director, (q) => q(`update imp_ai_reports set content = '{"version": 1, "listo": true}'::jsonb where kind = 'programa'`), { commit: true });
    const [row] = await t.q<{ c: Record<string, unknown> }>("select content as c from imp_ai_reports where kind = 'programa'");
    expect(row.c.listo).toBe(true);
    await t.asUser(PEOPLE.decano, (q) => q("update imp_ai_reports set title = 'ajeno' where kind = 'programa'"), { commit: true });
    const [same] = await t.q<{ title: string }>("select title from imp_ai_reports where kind = 'programa'");
    expect(same.title).toBe("Informe de prueba");
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("update imp_ai_reports set ref = $1 where kind = 'programa'", [UNITS.programaB])))).toMatch(/permission denied/);
  });

  it("solo su autor o la administración los borran", async () => {
    await t.asUser(PEOPLE.decano, (q) => q("delete from imp_ai_reports where kind = 'programa'"), { commit: true });
    expect(await t.q("select * from imp_ai_reports")).toHaveLength(2);
    await t.asUser(PEOPLE.director, (q) => q("delete from imp_ai_reports where kind = 'programa'"), { commit: true });
    expect(await t.q("select * from imp_ai_reports")).toHaveLength(1);
  });

  it("el título no puede ir vacío y el tipo debe ser conocido", async () => {
    expect(await errorOf(t.q("insert into imp_ai_reports (kind, ref, title, content, created_by) values ('programa', 'x', '  ', '{}'::jsonb, $1)", [PEOPLE.admin]))).toMatch(
      /imp_ai_reports_title/,
    );
    expect(await errorOf(t.q("insert into imp_ai_reports (kind, ref, title, content, created_by) values ('sede', 'x', 'x', '{}'::jsonb, $1)", [PEOPLE.admin]))).toMatch(
      /imp_ai_reports_kind/,
    );
  });
});
