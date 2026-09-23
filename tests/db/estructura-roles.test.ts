/* =============================================================================
   Estructura institucional, roles y usuarios (0073).

   Lo que importa probar: que solo la administración escribe la estructura y
   las pertenencias, que la sede de un programa se desactiva y no se borra,
   que la carga masiva es todo o nada, y que un rol de unidad sigue dando sus
   capacidades de Impacto donde se asigna (las políticas no cambiaron).
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

const ADMIN = "00000000-0000-4000-a000-0000000000aa";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'admin@prueba.udes.edu.co', '{"full_name": "Administración"}') on conflict do nothing`,
    [ADMIN],
  );
  await t.q(
    "insert into profiles (id, email, full_name) values ($1, 'admin@prueba.udes.edu.co', 'Administración') on conflict do nothing",
    [ADMIN],
  );
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [ADMIN]);
}, 120_000);

afterAll(() => t?.close());

const roleId = async (key: string) =>
  (await t.q<{ id: string }>("select id from access_roles where key = $1", [key]))[0].id;

describe("alcance de los roles", () => {
  it("los roles de Impacto por unidad quedan como roles de unidad", async () => {
    const rows = await t.q<{ key: string; scope: string }>(
      "select key, scope from access_roles where key like 'impacto_%' order by key",
    );
    expect(Object.fromEntries(rows.map((r) => [r.key, r.scope]))).toEqual({
      impacto_admin: "global",
      impacto_decano: "unidad",
      impacto_director: "unidad",
      impacto_reportante: "unidad",
      impacto_vicerrector: "unidad",
    });
  });

  it("trae el rol de partida Editor de UDES en Cifras", async () => {
    const [row] = await t.q<{ base_role: string; screens: string[]; all_reports: boolean }>(
      "select base_role, screens, all_reports from access_roles where key = 'editor_cifras'",
    );
    expect(row).toEqual({ base_role: "planeacion", screens: ["cifras"], all_reports: false });
  });

  it("un rol de unidad no puede ser el rol global de nadie", async () => {
    const director = await roleId("impacto_director");
    const message = await errorOf(
      t.q("update profiles set access_role_id = $1 where id = $2", [director, PEOPLE.vx]),
    );
    expect(message).toContain("se da en una unidad");
  });

  it("un rol global no va en una unidad", async () => {
    const consulta = await roleId("consulta");
    const message = await errorOf(
      t.q("update unit_members set access_role_id = $1 where profile_id = $2", [consulta, PEOPLE.director]),
    );
    expect(message).toContain("en una unidad solo van roles de unidad");
  });

  it("un rol en uso no cambia de alcance", async () => {
    const message = await errorOf(t.q("update access_roles set scope = 'global' where key = 'impacto_director'"));
    expect(message).toContain("no puede pasar a ser de toda la intranet");
  });
});

describe("cambiar la capacidad de un rol en uso", () => {
  it("la reciben quienes ya lo llevan", async () => {
    const [custom] = await t.q<{ id: string }>(
      "insert into access_roles (key, name, base_role, all_screens) values ('prueba_cap', 'Prueba', 'consulta', true) returning id",
    );
    await t.q("update profiles set access_role_id = $1 where id = $2", [custom.id, PEOPLE.ve]);
    await t.asUser(ADMIN, (q) => q("update access_roles set base_role = 'planeacion' where id = $1", [custom.id]), {
      commit: true,
    });
    const [row] = await t.q<{ role: string }>("select role from profiles where id = $1", [PEOPLE.ve]);
    expect(row.role).toBe("planeacion");
  });
});

describe("estructura institucional", () => {
  it("solo la administración guarda unidades", async () => {
    const message = await t.asUser(PEOPLE.admin, (q) =>
      errorOf(q("select admin_save_unit($1::jsonb)", [JSON.stringify({ kind: "oficina", code: "X", name: "X", slug: "x" })])),
    );
    expect(message).toContain("Solo la administración");
  });

  it("crea un programa con sus sedes y desactiva, sin borrar, la que se quita", async () => {
    const id = await t.asUser(
      ADMIN,
      async (q) => {
        const [row] = await q<{ id: string }>("select admin_save_unit($1::jsonb, $2) as id", [
          JSON.stringify({
            kind: "programa",
            parent_id: UNITS.facultad,
            code: "PR-N",
            name: "Programa Nuevo",
            slug: "prueba-programa-nuevo",
            snies_code: "900100",
            degree_level: "pregrado",
            modality: "virtual",
          }),
          ["bucaramanga", "bogota"],
        ]);
        await q("select admin_save_unit($1::jsonb, $2)", [
          JSON.stringify({
            id: row.id,
            kind: "programa",
            parent_id: UNITS.facultad,
            code: "PR-N",
            name: "Programa Nuevo",
            snies_code: "900100",
            degree_level: "pregrado",
            modality: "virtual",
          }),
          ["bucaramanga"],
        ]);
        return row.id;
      },
      { commit: true },
    );
    const campuses = await t.q<{ slug: string; active: boolean }>(
      `select c.slug, pc.active from imp_program_campuses pc join campuses c on c.id = pc.campus_id
        where pc.program_id = $1 order by c.slug`,
      [id],
    );
    expect(campuses).toEqual([
      { slug: "bogota", active: false },
      { slug: "bucaramanga", active: true },
    ]);
  });

  it("una sede que no existe se rechaza con su nombre", async () => {
    const message = await t.asUser(ADMIN, (q) =>
      errorOf(
        q("select admin_save_unit($1::jsonb, $2)", [
          JSON.stringify({ id: UNITS.programaA, kind: "programa", parent_id: UNITS.facultad, code: "PR-A", name: "Programa de Prueba A", snies_code: "900001", degree_level: "pregrado", modality: "presencial" }),
          ["pasto"],
        ]),
      ),
    );
    expect(message).toContain("No existe la sede «pasto»");
  });

  it("una facultad depende de una vicerrectoría en el organigrama, sin heredar de ella", async () => {
    await t.asUser(
      ADMIN,
      (q) =>
        q("select admin_save_unit($1::jsonb)", [
          JSON.stringify({
            id: UNITS.facultad,
            kind: "facultad",
            code: "PR-FAC",
            name: "Facultad de Prueba",
            reports_to: "00000000-0000-4000-b000-000000000002",
          }),
        ]),
      { commit: true },
    );
    const [row] = await t.q<{ parent_id: string | null; reports_to: string }>(
      "select parent_id, reports_to from units where id = $1",
      [UNITS.facultad],
    );
    expect(row).toEqual({ parent_id: null, reports_to: "00000000-0000-4000-b000-000000000002" });

    const message = await errorOf(t.q("update units set reports_to = $1 where id = $2", [UNITS.facultad, UNITS.programaA]));
    expect(message).toContain("Solo una facultad");
  });
});

describe("carga masiva de programas", () => {
  const row = (over: Record<string, unknown>) => ({
    line: 2,
    snies_code: "900200",
    code: "PR-C",
    name: "Programa Cargado",
    slug: "prueba-programa-cargado",
    faculty_code: "PR-FAC",
    degree_level: "pregrado",
    modality: "presencial",
    campuses: ["cucuta"],
    ...over,
  });

  it("es todo o nada y el error dice la fila", async () => {
    const message = await t.asUser(ADMIN, (q) =>
      errorOf(
        q("select admin_import_programs($1::jsonb)", [
          JSON.stringify([row({}), row({ line: 3, snies_code: "900201", code: "PR-D", slug: "prueba-d", faculty_code: "NO-EXISTE" })]),
        ]),
      ),
    );
    expect(message).toContain("Fila 3: no existe la facultad «NO-EXISTE»");
    const [{ n }] = await t.q<{ n: number }>("select count(*)::int as n from units where snies_code = '900200'");
    expect(n).toBe(0);
  });

  it("crea los nuevos y actualiza los que reconoce por SNIES", async () => {
    const result = await t.asUser(
      ADMIN,
      async (q) =>
        (
          await q<{ r: { created: number; updated: number } }>("select admin_import_programs($1::jsonb) as r", [
            JSON.stringify([row({}), row({ line: 3, snies_code: "900001", code: "PR-A", name: "Programa A renombrado", slug: "x", modality: "hibrida" })]),
          ])
        )[0].r,
      { commit: true },
    );
    expect(result).toEqual({ created: 1, updated: 1 });
    const [a] = await t.q<{ name: string; slug: string; modality: string }>(
      "select name, slug, modality from units where id = $1",
      [UNITS.programaA],
    );
    // El slug de un programa existente no cambia: los enlaces siguen vivos.
    expect(a).toEqual({ name: "Programa A renombrado", slug: "prueba-programa-a", modality: "hibrida" });
  });
});

describe("dónde trabaja una persona", () => {
  it("solo la administración asigna", async () => {
    const message = await t.asUser(PEOPLE.decano, (q) =>
      errorOf(q("select admin_set_memberships($1, '[]'::jsonb)", [PEOPLE.vx])),
    );
    expect(message).toContain("Solo la administración");
  });

  it("asigna, toma el papel de Mis Tableros del rol y da la capacidad en esa unidad", async () => {
    const director = await roleId("impacto_director");
    await t.q("update access_roles set unit_role = 'editor' where id = $1", [director]);
    await t.asUser(
      ADMIN,
      (q) =>
        q("select admin_set_memberships($1, $2::jsonb)", [
          PEOPLE.vx,
          JSON.stringify([{ unit_id: UNITS.programaB, access_role_id: director }]),
        ]),
      { commit: true },
    );
    const members = await t.q<{ unit_id: string; role: string }>(
      "select unit_id, role from unit_members where profile_id = $1",
      [PEOPLE.vx],
    );
    expect(members).toEqual([{ unit_id: UNITS.programaB, role: "editor" }]);
    const can = await t.asUser(PEOPLE.vx, async (q) =>
      (await q<{ ok: boolean }>("select imp_can('impacto.capturar', $1) as ok", [UNITS.programaB]))[0].ok,
    );
    expect(can).toBe(true);
  });

  it("reemplazar quita las que no vienen; añadir las conserva", async () => {
    const decano = await roleId("impacto_decano");
    await t.asUser(
      ADMIN,
      (q) =>
        q("select admin_set_memberships($1, $2::jsonb, false)", [
          PEOPLE.vx,
          JSON.stringify([{ unit_id: UNITS.facultad, access_role_id: decano, role: "jefe" }]),
        ]),
      { commit: true },
    );
    expect(
      (await t.q("select 1 from unit_members where profile_id = $1", [PEOPLE.vx])).length,
    ).toBe(2);

    await t.asUser(
      ADMIN,
      (q) =>
        q("select admin_set_memberships($1, $2::jsonb)", [
          PEOPLE.vx,
          JSON.stringify([{ unit_id: UNITS.facultad, access_role_id: decano }]),
        ]),
      { commit: true },
    );
    const rows = await t.q<{ unit_id: string; role: string }>(
      "select unit_id, role from unit_members where profile_id = $1",
      [PEOPLE.vx],
    );
    // Sin papel explícito conserva el que tenía (jefe).
    expect(rows).toEqual([{ unit_id: UNITS.facultad, role: "jefe" }]);
  });
});
