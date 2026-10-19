/* Migración 0169: un rol de acceso puede dar el informe de unidades a las que la
   persona no pertenece (informe_level + access_role_informe_units), y la base lo
   hace cumplir igual que la pertenencia: el que diligencia no envía, el Gestor sí. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, UNITS, type TestDb } from "../db/harness";
import { abrirFacultad, enviar, escenario, P, seccion, U } from "./fixtures";

let t: TestDb;
let ciclo = "";
let fac = "";

const PERSONA = "00000000-0000-4000-a000-0000000000f1";

async function darRol(nivel: "none" | "editor" | "jefe", opciones: { todas?: boolean; unidades?: string[] } = {}) {
  await t.q("delete from public.access_role_informe_units where access_role_id in (select id from public.access_roles where key = 'prueba_informes')");
  await t.q("update public.profiles set access_role_id = null where id = $1", [PERSONA]);
  await t.q("delete from public.access_roles where key = 'prueba_informes'");
  const [{ id }] = await t.q<{ id: string }>(
    "insert into public.access_roles (key, name, base_role, all_screens, informe_level, all_informe_units) values ('prueba_informes', 'Prueba informes', 'consulta', true, $1, $2) returning id",
    [nivel, opciones.todas ?? false],
  );
  for (const unidad of opciones.unidades ?? []) {
    await t.q("insert into public.access_role_informe_units (access_role_id, unit_id) values ($1, $2)", [id, unidad]);
  }
  await t.q("update public.profiles set access_role_id = $1 where id = $2", [id, PERSONA]);
}

beforeAll(async () => {
  ({ t, ciclo } = await escenario());
  await t.q("insert into auth.users (id, email) values ($1, 'rolero@prueba.udes.edu.co') on conflict do nothing", [PERSONA]);
  await t.q("insert into public.profiles (id, email, full_name) values ($1, 'rolero@prueba.udes.edu.co', 'Rolero') on conflict (id) do nothing", [PERSONA]);
  await t.q("update public.profiles set is_active = true where id = $1", [PERSONA]);
  fac = await abrirFacultad(t, ciclo);
}, 180_000);

afterAll(async () => t?.close());

describe("0169 · el rol da el informe de otras unidades", () => {
  it("sin papel en el rol, quien no pertenece a la unidad no ve su informe", async () => {
    await darRol("none", { unidades: [U.facultad] });
    await t.asUser(PERSONA, async (q) => {
      expect(await q("select id from public.informe_instancias")).toEqual([]);
      expect(await q("select * from public.informe_mis_unidades()")).toEqual([]);
    });
  });

  it("editor con la unidad en su alcance: lee, diligencia y no envía", async () => {
    await darRol("editor", { unidades: [U.facultad] });
    await t.asUser(PERSONA, async (q) => {
      expect((await q("select id from public.informe_instancias")).length).toBe(1);
      expect(await q("select role from public.informe_mis_unidades() where unit_id = $1", [U.facultad])).toEqual([{ role: "editor" }]);
      await seccion(q, fac, "s1", false, "Lo escribió quien lleva el rol.");
    });
    expect(await errorOf(t.asUser(PERSONA, (q) => enviar(q, fac)))).toMatch(/no permitido|Sin permiso/);
  });

  it("jefe con la unidad en su alcance: además envía", async () => {
    await darRol("jefe", { unidades: [U.facultad] });
    await t.asUser(PERSONA, async (q) => {
      expect((await q("select informe_actor($1) as actor", [U.facultad]))[0]).toEqual({ actor: "jefe" });
    });
  });

  it("una unidad fuera del alcance sigue cerrada", async () => {
    // Una unidad ajena a la facultad y a su destino (la rectoría, que sí ve el estado de lo que le llega).
    await darRol("editor", { unidades: [UNITS.programaB] });
    await t.asUser(PERSONA, async (q) => {
      expect(await q("select id from public.informe_instancias")).toEqual([]);
    });
    expect(await errorOf(t.asUser(PERSONA, (q) => seccion(q, fac, "s2")))).toMatch(/no es suyo|row-level security/);
  });

  it("toda la estructura alcanza cualquier unidad", async () => {
    await darRol("editor", { todas: true });
    await t.asUser(PERSONA, async (q) => {
      expect((await q("select informe_actor($1) as actor", [U.facultad]))[0]).toEqual({ actor: "editor" });
      expect((await q("select informe_actor($1) as actor", [U.rectoria]))[0]).toEqual({ actor: "editor" });
    });
  });

  it("quien ya pertenece conserva el más fuerte de los dos papeles", async () => {
    await darRol("editor", { unidades: [U.facultad] });
    // El Gestor de la facultad (jefe por pertenencia) no baja a editor por llevar un rol así.
    await t.q("update public.profiles set access_role_id = (select id from public.access_roles where key = 'prueba_informes') where id = $1", [P.gestor]);
    await t.asUser(P.gestor, async (q) => {
      expect((await q("select informe_actor($1) as actor", [U.facultad]))[0]).toEqual({ actor: "jefe" });
    });
  });

  it("el rol no cambia lo que ve otra gente: el ajeno sigue sin informe", async () => {
    await darRol("editor", { unidades: [U.facultad] });
    await t.asUser(P.ajeno, async (q) => {
      expect(await q("select id from public.informe_instancias")).toEqual([]);
    });
  });
});
