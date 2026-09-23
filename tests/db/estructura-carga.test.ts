/* =============================================================================
   Estructura institucional: carga completa y cargo de las personas (0074).
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

const ADMIN = "00000000-0000-4000-a000-0000000000ab";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'admin.carga@prueba.udes.edu.co', '{"full_name": "Administración"}') on conflict do nothing`,
    [ADMIN],
  );
  await t.q(
    "insert into profiles (id, email, full_name) values ($1, 'admin.carga@prueba.udes.edu.co', 'Administración') on conflict do nothing",
    [ADMIN],
  );
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [ADMIN]);
}, 120_000);

afterAll(() => t?.close());

const load = (rows: unknown[]) => (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
  q("select admin_import_units($1::jsonb) as r", [JSON.stringify(rows)]);

describe("carga de toda la estructura", () => {
  it("solo la administración carga", async () => {
    const message = await t.asUser(PEOPLE.admin, (q) =>
      errorOf(load([{ sheet: "Oficinas", line: 2, kind: "oficina", code: "X", name: "X", slug: "x" }])(q)),
    );
    expect(message).toContain("Solo la administración");
  });

  it("resuelve los padres que vienen en el mismo archivo, en cualquier orden de hojas", async () => {
    const result = await t.asUser(
      ADMIN,
      async (q) =>
        (
          (await q("select admin_import_units($1::jsonb) as r", [
            JSON.stringify([
              { sheet: "Programas", line: 2, kind: "programa", code: "CG-P", name: "Programa Cargado", slug: "cg-programa",
                snies_code: "990001", faculty_code: "CG-FAC", degree_level: "maestria", modality: "virtual", campuses: ["cucuta"] },
              { sheet: "Oficinas", line: 2, kind: "oficina", code: "CG-OF2", name: "Oficina hija", slug: "cg-oficina-hija", parent_code: "CG-OF1" },
              { sheet: "Oficinas", line: 3, kind: "oficina", code: "CG-OF1", name: "Oficina madre", slug: "cg-oficina-madre", parent_code: "CG-VA" },
              { sheet: "Facultades", line: 2, kind: "facultad", code: "CG-FAC", name: "Facultad Cargada", slug: "cg-facultad", vice_code: "CG-VA" },
              { sheet: "Vicerrectorías", line: 2, kind: "vicerrectoria", code: "CG-VA", name: "Vicerrectoría Cargada", slug: "cg-vice", substantive_function: "extension" },
            ]),
          ])) as { r: { created: number; updated: number } }[]
        )[0].r,
      { commit: true },
    );
    expect(result).toEqual({ created: 5, updated: 0 });

    const rows = await t.q<{ code: string; kind: string; parent: string | null; reports: string | null }>(
      `select u.code, u.kind::text as kind, p.code as parent, r.code as reports
         from units u left join units p on p.id = u.parent_id left join units r on r.id = u.reports_to
        where u.code like 'CG-%' order by u.code`,
    );
    expect(rows).toEqual([
      { code: "CG-FAC", kind: "facultad", parent: null, reports: "CG-VA" },
      { code: "CG-OF1", kind: "oficina", parent: "CG-VA", reports: null },
      { code: "CG-OF2", kind: "oficina", parent: "CG-OF1", reports: null },
      { code: "CG-P", kind: "programa", parent: "CG-FAC", reports: null },
      { code: "CG-VA", kind: "vicerrectoria", parent: null, reports: null },
    ]);
    const [offer] = await t.q<{ slug: string }>(
      "select c.slug from imp_program_campuses pc join campuses c on c.id = pc.campus_id join units u on u.id = pc.program_id where u.code = 'CG-P'",
    );
    expect(offer.slug).toBe("cucuta");
  });

  it("actualiza lo existente y conserva lo que la hoja no trae", async () => {
    await t.q("update units set description = 'Se queda' where code = 'CG-FAC'");
    const result = await t.asUser(
      ADMIN,
      async (q) =>
        (
          (await q("select admin_import_units($1::jsonb) as r", [
            JSON.stringify([
              { sheet: "Facultades", line: 2, kind: "facultad", code: "cg-fac", name: "Facultad Renombrada", slug: "otro", vice_code: "" },
            ]),
          ])) as { r: { created: number; updated: number } }[]
        )[0].r,
      { commit: true },
    );
    expect(result).toEqual({ created: 0, updated: 1 });
    const [row] = await t.q<{ name: string; slug: string; description: string; reports_to: string | null }>(
      "select name, slug, description, reports_to from units where upper(code) = 'CG-FAC'",
    );
    // Se reconoce sin importar mayúsculas; el slug y la descripción se conservan.
    expect(row).toEqual({ name: "Facultad Renombrada", slug: "cg-facultad", description: "Se queda", reports_to: null });
  });

  it("es todo o nada y el error dice hoja y fila", async () => {
    const message = await t.asUser(ADMIN, (q) =>
      errorOf(
        load([
          { sheet: "Vicerrectorías", line: 2, kind: "vicerrectoria", code: "CG-NUEVA", name: "Nueva", slug: "cg-nueva" },
          { sheet: "Programas", line: 7, kind: "programa", code: "CG-Q", name: "Q", slug: "cg-q", faculty_code: "NO-EXISTE",
            degree_level: "pregrado", modality: "virtual", campuses: [] },
        ])(q),
      ),
    );
    expect(message).toContain("Hoja Programas, fila 7: no existe la facultad «NO-EXISTE»");
    expect((await t.q("select 1 from units where code = 'CG-NUEVA'")).length).toBe(0);
  });

  it("un código de otra clase no se pisa", async () => {
    const message = await t.asUser(ADMIN, (q) =>
      errorOf(load([{ sheet: "Oficinas", line: 4, kind: "oficina", code: "PR-FAC", name: "Pisada", slug: "pisada" }])(q)),
    );
    expect(message).toContain("Hoja Oficinas, fila 4: el código «PR-FAC» ya es de «Facultad de Prueba», que no es de esta clase");
  });

  it("una oficina no cuelga de una facultad", async () => {
    const message = await t.asUser(ADMIN, (q) =>
      errorOf(load([{ sheet: "Oficinas", line: 2, kind: "oficina", code: "CG-X", name: "X", slug: "cg-x", parent_code: "PR-FAC" }])(q)),
    );
    expect(message).toContain("no existe la vicerrectoría u oficina «PR-FAC»");
  });

  it("admin_import_programs sigue funcionando", async () => {
    const [{ n }] = await t.q<{ n: number }>(
      "select count(*)::int as n from pg_proc where proname = 'admin_import_programs'",
    );
    expect(n).toBe(1);
  });
});

describe("el cargo en la unidad", () => {
  const set = (rows: unknown[], replace = false) => (q: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
    q("select admin_set_memberships($1, $2::jsonb, $3)", [PEOPLE.vx, JSON.stringify(rows), replace]);
  const titleOf = async () =>
    (await t.q<{ title: string | null; role: string }>(
      "select title, role::text as role from unit_members where profile_id = $1 and unit_id = $2",
      [PEOPLE.vx, UNITS.programaB],
    ))[0];

  it("se guarda, se conserva con nulo y se borra con texto vacío", async () => {
    await t.asUser(ADMIN, set([{ unit_id: UNITS.programaB, role: "editor", title: "  Coordinadora de calidad " }]), { commit: true });
    expect(await titleOf()).toEqual({ title: "Coordinadora de calidad", role: "editor" });

    await t.asUser(ADMIN, set([{ unit_id: UNITS.programaB, role: "jefe" }]), { commit: true });
    expect(await titleOf()).toEqual({ title: "Coordinadora de calidad", role: "jefe" });

    await t.asUser(ADMIN, set([{ unit_id: UNITS.programaB, title: null }]), { commit: true });
    expect((await titleOf()).title).toBe("Coordinadora de calidad");

    await t.asUser(ADMIN, set([{ unit_id: UNITS.programaB, title: "" }]), { commit: true });
    expect((await titleOf()).title).toBeNull();
  });

  it("añadir sin reemplazar conserva las demás pertenencias", async () => {
    const before = (await t.q("select 1 from unit_members where profile_id = $1", [PEOPLE.vx])).length;
    await t.asUser(ADMIN, set([{ unit_id: UNITS.facultad, role: "visor", title: "Asesora" }]), { commit: true });
    const after = (await t.q("select 1 from unit_members where profile_id = $1", [PEOPLE.vx])).length;
    expect(after).toBe(before + 1);
  });

  it("con reemplazo sigue quitando lo que no viene", async () => {
    await t.asUser(ADMIN, set([{ unit_id: UNITS.facultad }], true), { commit: true });
    const rows = await t.q<{ title: string }>("select title from unit_members where profile_id = $1", [PEOPLE.vx]);
    expect(rows).toEqual([{ title: "Asesora" }]);
  });
});
