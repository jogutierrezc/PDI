/* =============================================================================
   Reportes Institucionales (0103, 0104): quién lee y quién escribe.

   ri_filas guarda datos personales (documento, nombres, correo): sin la
   pantalla «reportes» no se lee ni se escribe nada, anon no toca las tablas,
   los catálogos piden Planeación y el orden de los estados lo hace cumplir la
   base. Los documentos son inventados (1000000xxx).
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

/** Rol de acceso con pantallas explícitas y su rol base. */
async function darRol(persona: string, key: string, base: string, screens: string[]) {
  const [r] = await t.q<{ id: string }>(
    `insert into access_roles (key, name, base_role, screens, all_screens, all_reports)
     values ($1, $1, $2::app_role, $3::text[], false, false)
     on conflict (key) do update set base_role = excluded.base_role, screens = excluded.screens
     returning id`,
    [key, base, screens],
  );
  await t.q("update profiles set access_role_id = $1, role = $2::app_role, is_active = true where id = $3", [r.id, base, persona]);
}

const SIN_PANTALLA = PEOPLE.director; // responsable, sin «reportes»
const CAPTURA = PEOPLE.reportante; // responsable con «reportes»
const PLANEACION = PEOPLE.decano; // planeación con «reportes»
const LECTOR = PEOPLE.vi; // consulta con «reportes»

const filas = [
  { NUM_DOCUMENTO: "1000000001", PRIMER_NOMBRE: "Prueba", PRO_CONSECUTIVO: "Medicina" },
  { NUM_DOCUMENTO: "1000000002", PRIMER_NOMBRE: "Ejemplo", PRO_CONSECUTIVO: "Medicina" },
];

beforeAll(async () => {
  t = await createTestDb();
  await darRol(SIN_PANTALLA, "prueba_sin_reportes", "responsable", ["documents"]);
  await darRol(CAPTURA, "prueba_captura", "responsable", ["reportes"]);
  await darRol(PLANEACION, "prueba_planeacion", "planeacion", ["reportes"]);
  await darRol(LECTOR, "prueba_lector", "consulta", ["reportes"]);
  await t.asUser(CAPTURA, (q) => q("select ri_guardar_filas('matriculados', '2026-2', $1::jsonb)", [JSON.stringify(filas)]), {
    commit: true,
  });
}, 120_000);

afterAll(() => t?.close());

describe("sin la pantalla «reportes»", () => {
  it("no lee ri_filas ni ri_entregas", async () => {
    const [f] = await t.asUser(SIN_PANTALLA, (q) => q<{ n: number }>("select count(*)::int as n from ri_filas"));
    const [e] = await t.asUser(SIN_PANTALLA, (q) => q<{ n: number }>("select count(*)::int as n from ri_entregas"));
    expect(f.n).toBe(0);
    expect(e.n).toBe(0);
  });

  it("no escribe ni pide cruces", async () => {
    for (const sql of [
      "select ri_guardar_filas('matriculados', '2026-2', '[]'::jsonb)",
      "select ri_marcar_validacion('matriculados', '2026-2', 0)",
      "select ri_registrar_envio('matriculados', '2026-2', null)",
      "select ri_reabrir('matriculados', '2026-2')",
      "select * from ri_cruces('2026-2')",
      `select ri_catalogo_guardar('{"catalogo":"pais","codigo":"076","nombre":"Brasil"}'::jsonb)`,
      "select ri_renombrar_en_filas(array['PRO_CONSECUTIVO'], 'Medicina', 'Otra')",
    ]) {
      expect(await errorOf(t.asUser(SIN_PANTALLA, (q) => q(sql))), sql).toMatch(/permiso|acceso|Solo Planeación/);
    }
  });

  it("anon no toca las tablas ni las RPC", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from ri_filas")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from ri_entregas")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select ri_guardar_filas('matriculados', '2026-2', '[]'::jsonb)")))).toMatch(
      /permission denied/,
    );
  });

  it("no hay políticas de escritura ni para anon sobre ri_*", async () => {
    const pol = await t.q<{ tablename: string; cmd: string; roles: string[] }>(
      "select tablename, cmd, roles::text[] as roles from pg_policies where tablename like 'ri\\_%'",
    );
    for (const p of pol) {
      expect(p.cmd).toBe("SELECT");
      expect(p.roles).not.toContain("anon");
      expect(p.roles).not.toContain("public");
    }
  });
});

describe("con la pantalla «reportes»", () => {
  // 0104: las filas tienen datos personales; Consulta ve el tablero, no las filas.
  it("Consulta ve las entregas, pero no lee filas ni cruces, ni captura", async () => {
    const [f] = await t.asUser(LECTOR, (q) => q<{ n: number }>("select count(*)::int as n from ri_filas"));
    expect(f.n).toBe(0);
    const [e] = await t.asUser(LECTOR, (q) => q<{ n: number }>("select count(*)::int as n from ri_entregas"));
    expect(e.n).toBeGreaterThan(0);
    expect(await errorOf(t.asUser(LECTOR, (q) => q("select * from ri_cruces('2026-2')")))).toMatch(/acceso/);
    expect(await errorOf(t.asUser(LECTOR, (q) => q("select ri_guardar_filas('matriculados', '2026-2', '[]'::jsonb)")))).toMatch(
      /permiso/,
    );
  });

  it("los catálogos piden Planeación (responsable no basta)", async () => {
    const item = `'{"catalogo":"pais","codigo":"076","nombre":"Brasil"}'::jsonb`;
    expect(await errorOf(t.asUser(CAPTURA, (q) => q(`select ri_catalogo_guardar(${item})`)))).toMatch(/Solo Planeación/);
    await t.asUser(PLANEACION, (q) => q(`select ri_catalogo_guardar(${item})`));
    expect(
      await errorOf(t.asUser(PLANEACION, (q) => q(`select ri_catalogo_guardar('{"catalogo":"pais","codigo":"76","nombre":"Brasil"}'::jsonb)`))),
    ).toMatch(/3 dígitos/);
  });

  it("Responsable con la pantalla lee las filas", async () => {
    const [f] = await t.asUser(CAPTURA, (q) => q<{ n: number }>("select count(*)::int as n from ri_filas"));
    expect(f.n).toBe(2);
  });

  it("el ciclo cargada → validada → enviada, y enviada no se edita", async () => {
    await t.asUser(CAPTURA, async (q) => {
      const [c] = await q<{ estado: string }>("select (ri_guardar_filas('graduados', '2026-2', $1::jsonb)).estado", [JSON.stringify(filas)]);
      expect(c.estado).toBe("cargada");
      expect(await errorOf(q("select ri_registrar_envio('graduados', '2026-2', null)"))).toMatch(/validada/);
    });
    await t.asUser(CAPTURA, async (q) => {
      await q("select ri_guardar_filas('graduados', '2026-2', $1::jsonb)", [JSON.stringify(filas)]);
      const [v] = await q<{ estado: string }>("select (ri_marcar_validacion('graduados', '2026-2', 0)).estado");
      expect(v.estado).toBe("validada");
      const [e] = await q<{ estado: string }>("select (ri_registrar_envio('graduados', '2026-2', null)).estado");
      expect(e.estado).toBe("enviada");
    }, { commit: true });
    expect(await errorOf(t.asUser(CAPTURA, (q) => q("select ri_guardar_filas('graduados', '2026-2', '[]'::jsonb)")))).toMatch(/ya se envió/);
    expect(await errorOf(t.asUser(CAPTURA, (q) => q("select ri_reabrir('graduados', '2026-2')")))).toMatch(/Solo Planeación/);
    const [r] = await t.asUser(PLANEACION, (q) => q<{ estado: string }>("select (ri_reabrir('graduados', '2026-2')).estado"));
    expect(r.estado).toBe("cargada");
  });

  it("ri_cruces devuelve NUM_DOCUMENTO y PRO_CONSECUTIVO", async () => {
    const rows = await t.asUser(CAPTURA, (q) => q<{ plantilla: string; documento: string; programa: string }>("select * from ri_cruces('2026-2')"));
    expect(rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ plantilla: "matriculados", documento: "1000000001", programa: "Medicina" })]),
    );
  });

  it("Consulta de fábrica (all_screens) y perfil sin rol de acceso tampoco leen filas (0104)", async () => {
    await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
    await t.q("update profiles set access_role_id = null, role = 'consulta' where id = $1", [PEOPLE.ve]);
    for (const quien of [PEOPLE.vx, PEOPLE.ve]) {
      const [f] = await t.asUser(quien, (q) => q<{ n: number }>("select count(*)::int as n from ri_filas"));
      expect(f.n).toBe(0);
      expect(await errorOf(t.asUser(quien, (q) => q("select * from ri_cruces('2026-2')")))).toMatch(/acceso/);
    }
  });

  it("ri_cruces (0104) lee inscritos sin programa y admitidos por PRO_CONSECUTIVO, sin mirar la sede", async () => {
    await t.asUser(
      CAPTURA,
      async (q) => {
        await q("select ri_guardar_filas('inscritos', '2026-2', $1::jsonb)", [JSON.stringify([{ NUM_DOCUMENTO: "1000000003", PRIMER_NOMBRE: "Prueba" }])]);
        await q("select ri_guardar_filas('admitidos', '2026-2', $1::jsonb)", [
          JSON.stringify([{ NUM_DOCUMENTO: "1000000003", PRO_CONSECUTIVO: "Medicina" }]),
        ]);
      },
      { commit: true },
    );
    const rows = await t.asUser(CAPTURA, (q) => q<{ plantilla: string; periodo: string; documento: string; programa: string | null }>("select * from ri_cruces('2026-2')"));
    expect(rows).toEqual(
      expect.arrayContaining([
        { plantilla: "inscritos", periodo: "2026-2", documento: "1000000003", programa: null },
        { plantilla: "admitidos", periodo: "2026-2", documento: "1000000003", programa: "Medicina" },
      ]),
    );
  });

  it("el bucket de certificados es privado", async () => {
    const [b] = await t.q<{ public: boolean }>("select public from storage.buckets where id = 'reportes-certificados'");
    expect(b.public).toBe(false);
  });
});
