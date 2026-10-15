/* =============================================================================
   Roles de Impacto con alcance (0154): Editor y Administrador de indicadores de
   impacto, limitados a las vicerrectorías, facultades o programas que lleve el
   rol. Lo que importa probar: que el rol aporta pertenencias efectivas sin
   tocar unit_members, que el alcance se hereda por el árbol de unidades y no
   más, que escribir sigue pasando por las políticas de siempre, y que los
   informes se emiten sobre el alcance aunque el interruptor esté cerrado.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

const VI = "00000000-0000-4000-b000-000000000001"; // Vicerrectoría de Investigaciones (prueba)
const VE = "00000000-0000-4000-b000-000000000002"; // Vicerrectoría de Enseñanza (prueba)
const ANA = "00000000-0000-4000-a000-0000000000e1"; // editora de un programa
const LUIS = "00000000-0000-4000-a000-0000000000e2"; // administrador de una facultad
const EVA = "00000000-0000-4000-a000-0000000000e3"; // editora de una vicerrectoría
const TODO = "00000000-0000-4000-a000-0000000000e4"; // administrador de toda la estructura
const SIN = "00000000-0000-4000-a000-0000000000e5"; // rol sin alcance

let t: TestDb;
const roles: Record<string, string> = {};

async function person(id: string, email: string) {
  await t.q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}') on conflict do nothing", [id, email]);
  await t.q("insert into profiles (id, email, full_name) values ($1, $2, $2) on conflict do nothing", [id, email]);
}

async function role(key: string, level: "none" | "editor" | "admin", units: string[], all = false) {
  const [row] = await t.q<{ id: string }>(
    `insert into access_roles (key, name, base_role, screens, impact_level, all_impact_units)
     values ($1, $1, 'consulta', array['impacto'], $2, $3) returning id`,
    [key, level, all],
  );
  for (const unit of units) await t.q("insert into access_role_units (access_role_id, unit_id) values ($1, $2)", [row.id, unit]);
  roles[key] = row.id;
}

const give = (who: string, key: string) => t.q("update profiles set access_role_id = $1 where id = $2", [roles[key], who]);
const as = <T>(who: string, sql: string, params: unknown[] = []) => t.asUser(who, (q) => q<T>(sql, params));
const scalar = async <T>(who: string, sql: string, params: unknown[] = []) => Object.values((await as<Record<string, T>>(who, sql, params))[0])[0];
const allowed = (who: string, kind: string, ref: string, campus: string | null = null) =>
  scalar<boolean>(who, "select imp_report_allowed($1, $2, $3::uuid)", [kind, ref, campus]);

beforeAll(async () => {
  t = await createTestDb();
  // Las vicerrectorías de prueba llevan su función (la semilla llega después de 0078).
  await t.q("insert into imp_unit_functions (unit_id, fn) select id, substantive_function from units where code like 'PR-V%' on conflict do nothing");

  await role("editor_programa", "editor", [UNITS.programaA]);
  await role("admin_facultad", "admin", [UNITS.facultad]);
  await role("editor_vi", "editor", [VI]);
  await role("admin_todo", "admin", [], true);
  await role("sin_alcance", "editor", []);

  for (const [id, email] of [[ANA, "ana"], [LUIS, "luis"], [EVA, "eva"], [TODO, "todo"], [SIN, "sin"]] as const) {
    await person(id, `${email}@prueba.udes.edu.co`);
  }
  await give(ANA, "editor_programa");
  await give(LUIS, "admin_facultad");
  await give(EVA, "editor_vi");
  await give(TODO, "admin_todo");
  await give(SIN, "sin_alcance");
}, 120_000);

afterAll(() => t?.close());

describe("el rol aporta pertenencias efectivas", () => {
  it("un Editor recibe «editor» y un Administrador, «jefe», sin tocar unit_members", async () => {
    const mine = await as<{ unit_id: string; role: string; via_role: boolean }>(ANA, "select unit_id, role, via_role from imp_my_memberships()");
    expect(mine).toEqual([{ unit_id: UNITS.programaA, role: "editor", via_role: true }]);
    const boss = await as<{ role: string }>(LUIS, "select role from imp_my_memberships()");
    expect(boss).toEqual([{ role: "jefe" }]);
    expect(await t.q("select 1 from unit_members where profile_id = any($1)", [[ANA, LUIS, EVA]])).toHaveLength(0);
  });

  it("las pertenencias de siempre siguen y se suman a las del rol", async () => {
    const mine = await as<{ via_role: boolean }>(PEOPLE.director, "select via_role from imp_my_memberships()");
    expect(mine).toEqual([{ via_role: false }]);
  });

  it("un rol sin alcance no da nada, y un perfil inactivo tampoco", async () => {
    expect(await as(SIN, "select * from imp_my_memberships()")).toHaveLength(0);
    await t.q("update profiles set is_active = false where id = $1", [ANA]);
    expect(await as(ANA, "select * from imp_my_memberships()")).toHaveLength(0);
    await t.q("update profiles set is_active = true where id = $1", [ANA]);
  });

  it("«todas» alcanza vicerrectorías, facultades y programas, y nada más", async () => {
    const kinds = await as<{ unit_kind: string }>(TODO, "select distinct unit_kind from imp_my_role_scope() order by 1");
    expect(kinds.map((k) => k.unit_kind)).toEqual(["facultad", "programa", "vicerrectoria"]);
  });
});

describe("el alcance se hereda por el árbol y no más", () => {
  it("un programa: el suyo y no su hermano", async () => {
    expect(await scalar<string>(ANA, "select imp_program_role($1, null)", [UNITS.programaA])).toBe("editor");
    expect(await scalar<string | null>(ANA, "select imp_program_role($1, null)", [UNITS.programaB])).toBeNull();
    expect(await scalar<boolean>(ANA, "select imp_can_edit_program($1, null)", [UNITS.programaA])).toBe(true);
    // Sin pertenencia la función da NULL (como en 0078), que RLS trata como «no».
    expect(await scalar<boolean | null>(ANA, "select imp_can_edit_program($1, null)", [UNITS.programaB])).not.toBe(true);
  });

  it("una facultad: sus programas y no los de otra", async () => {
    expect(await scalar<string>(LUIS, "select imp_program_role($1, null)", [UNITS.programaA])).toBe("jefe");
    expect(await scalar<string>(LUIS, "select imp_program_role($1, null)", [UNITS.programaB])).toBe("jefe");
    expect(await scalar<string | null>(LUIS, "select imp_program_role($1, null)", [UNITS.programaZ])).toBeNull();
  });

  it("quien trabaja del lado de los programas lo está también por su rol", async () => {
    expect(await scalar<boolean>(ANA, "select imp_on_program_side()")).toBe(true);
    expect(await scalar<boolean>(EVA, "select imp_on_program_side()")).toBe(false);
    expect(await scalar<boolean>(SIN, "select imp_on_program_side()")).toBe(false);
  });
});

describe("las fichas de una vicerrectoría", () => {
  it("el Editor define las de la función de su vicerrectoría y no las de otra", async () => {
    expect(await scalar<boolean>(EVA, "select imp_can_define('investigacion', $1)", [VI])).toBe(true);
    expect(await scalar<boolean>(EVA, "select imp_can_define('ensenanza', $1)", [VE])).toBe(false);
    expect(await scalar<boolean>(EVA, "select imp_fn_member('investigacion', 'editor')", [])).toBe(true);
    expect(await scalar<boolean>(EVA, "select imp_fn_member('investigacion', 'jefe')", [])).toBe(false);
  });

  it("el Administrador de toda la estructura es «jefe» en cada función", async () => {
    for (const fn of ["investigacion", "ensenanza", "extension"]) {
      expect(await scalar<boolean>(TODO, "select imp_fn_member($1, 'jefe')", [fn])).toBe(true);
    }
  });

  it("escribir sigue pasando por las políticas: solo en la función de su alcance", async () => {
    const insert = (who: string, fn: string) =>
      t.asUser(who, (q) => q("insert into imp_dimensions (fn, name, position) values ($1, 'Dimensión de prueba', 99)", [fn]));
    await insert(EVA, "investigacion");
    expect(await errorOf(insert(EVA, "ensenanza"))).toMatch(/row-level security/);
    expect(await errorOf(insert(ANA, "investigacion"))).toMatch(/row-level security/);
  });
});

describe("informes de Impacto", () => {
  it("con el interruptor cerrado, un rol emite los de su alcance y nada más", async () => {
    await t.q(`update pilo_ai_settings set impacto_report = '{"programa": false, "facultad": false, "vicerrectoria": false}' where id = 1`);
    expect(await allowed(ANA, "programa", UNITS.programaA)).toBe(true);
    expect(await allowed(ANA, "programa", UNITS.programaB)).toBe(false);
    expect(await allowed(LUIS, "facultad", UNITS.facultad)).toBe(true);
    expect(await allowed(LUIS, "programa", UNITS.programaB)).toBe(true);
    expect(await allowed(LUIS, "programa", UNITS.programaZ)).toBe(false);
    expect(await allowed(EVA, "vicerrectoria", "investigacion")).toBe(true);
    expect(await allowed(EVA, "vicerrectoria", "extension")).toBe(false);
    expect(await allowed(SIN, "programa", UNITS.programaA)).toBe(false);
  });

  it("quien solo pertenece a la unidad sigue sujeto al interruptor", async () => {
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaA)).toBe(false);
    await t.q(`update pilo_ai_settings set impacto_report = '{"programa": true, "facultad": false, "vicerrectoria": false}' where id = 1`);
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaA)).toBe(true);
    expect(await allowed(PEOPLE.director, "programa", UNITS.programaB)).toBe(false);
  });

  it("el alcance por rol respeta la sede igual que una pertenencia: sin sede fija, todas", async () => {
    const [{ id: cucuta }] = await t.q<{ id: string }>("select id from campuses where slug = 'cucuta'");
    expect(await allowed(ANA, "programa", UNITS.programaA, cucuta)).toBe(true);
  });

  it("lo emitido se guarda a nombre de quien lo escribe", async () => {
    await t.asUser(ANA, (q) => q("insert into imp_ai_reports (kind, ref, title, content) values ('programa', $1, 'Informe', '{}'::jsonb)", [UNITS.programaA]), { commit: true });
    expect(await errorOf(t.asUser(ANA, (q) => q("insert into imp_ai_reports (kind, ref, title, content) values ('programa', $1, 'Ajeno', '{}'::jsonb)", [UNITS.programaB])))).toMatch(
      /row-level security/,
    );
  });
});

describe("quién asigna el alcance", () => {
  const ADMIN = PEOPLE.admin;

  it("solo la administración escribe access_role_units", async () => {
    await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [ADMIN]);
    await t.asUser(ADMIN, (q) => q("insert into access_role_units (access_role_id, unit_id) values ($1, $2)", [roles.editor_programa, UNITS.programaB]), { commit: true });
    expect(await t.q("select 1 from access_role_units where access_role_id = $1", [roles.editor_programa])).toHaveLength(2);
    await t.asUser(
      ANA,
      (q) => q("insert into access_role_units (access_role_id, unit_id) values ($1, $2)", [roles.editor_programa, UNITS.programaZ]),
      { commit: true },
    ).catch(() => undefined);
    expect(await t.q("select 1 from access_role_units where unit_id = $1", [UNITS.programaZ])).toHaveLength(0);
  });

  it("una unidad que no es vicerrectoría, oficina, facultad o programa se rechaza", async () => {
    const [other] = await t.q<{ id: string }>(
      "insert into units (kind, code, name, slug) values ('otra', 'PR-OT', 'Otra', 'prueba-otra') returning id",
    );
    expect(await errorOf(t.q("insert into access_role_units (access_role_id, unit_id) values ($1, $2)", [roles.editor_programa, other.id]))).toMatch(
      /vicerrectoría, oficina, facultad o programa/,
    );
  });

  it("el nivel solo puede ser none, editor o admin", async () => {
    expect(await errorOf(t.q("update access_roles set impact_level = 'jefe' where id = $1", [roles.editor_programa]))).toMatch(/access_roles_impact_level_check/);
  });

  it("al borrar un rol se va su alcance", async () => {
    await t.q("update profiles set access_role_id = null where id = $1", [SIN]);
    await t.q("delete from access_roles where id = $1", [roles.sin_alcance]);
    expect(await t.q("select 1 from access_role_units where access_role_id = $1", [roles.sin_alcance])).toHaveLength(0);
  });
});
