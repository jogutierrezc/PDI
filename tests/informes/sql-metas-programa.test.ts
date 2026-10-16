/* Migración 0165: «Objetivos y metas» del informe salen de los indicadores que
   el programa seleccionó (adopciones y propios), con la meta del año, en vivo
   hasta enviar y con foto después. Solo lo ve quien ve el informe. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, PEOPLE, UNITS, type Query, type TestDb } from "../db/harness";
import { enviar, escenario, P, seccion, U } from "./fixtures";

let t: TestDb;
let ciclo = "";
let prog = "";
let fac = "";
let fichaT = "";

const sync = (q: Query, inst: string) => q<{ n: number }>("select public.informe_metas_sincronizar($1) as n", [inst]).then((r) => r[0].n);
const filas = () =>
  t.q<{ clave: string; etiqueta: string; meta: string | null; unidad: string; consulta: Record<string, unknown> }>(
    "select clave, etiqueta, meta, unidad, consulta from informe_cifras where instancia_id = $1 and clave like 'meta!_%' escape '!' order by etiqueta",
    [prog],
  );

beforeAll(async () => {
  ({ t, ciclo } = await escenario());
  const VE = "00000000-0000-4000-b000-000000000002";
  const ficha = async (code: string, nombre: string, medida: string, direccion: string, t26: number | null, t28: number | null, reporta = true) =>
    (
      await t.q<{ id: string }>(
        `insert into imp_indicators (code, fn, stage, owner_unit_id, name, status, measure, direction, target_2026_num, target_2028_num, program_reports)
         values ($1, 'ensenanza', 'procesos', $2, $3, 'publicado', $4, $5, $6, $7, $8) returning id`,
        [code, VE, nombre, medida, direccion, t26, t28, reporta],
      )
    )[0].id;
  fichaT = await ficha("TM1", "Tasa de graduación", "porcentaje", "sube", 80, 90);
  const fichaD = await ficha("TM2", "Deserción", "porcentaje", "baja", 10, null);
  const fichaPesos = await ficha("TM3", "Recursos", "pesos", "sube", 1000, null);
  const fichaSolo = await ficha("TM4", "Solo consulta", "numero", "sube", 5, null, false);
  const [{ id: buc }] = await t.q<{ id: string }>("select id from campuses where slug = 'bucaramanga'");
  const [{ id: cuc }] = await t.q<{ id: string }>("select id from campuses where slug = 'cucuta'");
  await t.q(
    `insert into imp_adoptions (indicator_id, program_id, campus_id, target_2026_num) values
       ($1, $5, $6, 85), ($2, $5, $6, null), ($3, $5, $6, 7), ($4, $5, $6, 3), ($1, $7, $6, null)`,
    [fichaT, fichaD, fichaPesos, fichaSolo, UNITS.programaA, buc, UNITS.programaB],
  );
  await t.q(
    `insert into imp_indicators (code, fn, stage, owner_unit_id, program_id, campus_id, name, status, target_2026_num)
     values ('', 'ensenanza', 'procesos', $1, $1, $2, 'Tutorías entre pares', 'borrador', 5)`,
    [UNITS.programaA, cuc],
  );
  await t.q("insert into imp_values (indicator_id, year, program_id, campus_id, value_num) values ($1, 2026, $2, $3, 90)", [fichaT, UNITS.programaA, buc]);

  prog = await t.asUser(PEOPLE.director, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'B') as id", [ciclo, UNITS.programaA]))[0].id, { commit: true });
  fac = await t.asUser(P.gestor, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'A', $3) as id", [ciclo, U.facultad, U.rectoria]))[0].id, { commit: true });
}, 180_000);

afterAll(async () => t?.close());

describe("0165 · metas del programa", () => {
  it("trae lo que el programa seleccionó, con la meta del año; deja fuera pesos y lo que solo consulta", async () => {
    expect(await t.asUser(PEOPLE.director, (q) => sync(q, prog), { commit: true })).toBe(3);
    const f = await filas();
    expect(f.map((x) => [x.etiqueta, x.meta === null ? null : Number(x.meta), x.unidad])).toEqual([
      ["Deserción", 10, " %"],
      ["Tasa de graduación", 85, " %"],
      ["Tutorías entre pares", 5, ""],
    ]);
    expect(f.find((x) => x.etiqueta === "Deserción")!.consulta).toMatchObject({ baja: true, origen: "adopcion", sede: "bucaramanga" });
    expect(f.find((x) => x.etiqueta === "Tutorías entre pares")!.consulta).toMatchObject({ origen: "propio", sede: "cucuta" });
  });

  it("lee el valor en vivo de su programa y sede", async () => {
    const v = await t.asUser(PEOPLE.director, (q) => q<{ clave: string; valor: string | null }>("select clave, valor from informe_cifras_vivas($1)", [prog]));
    const clave = (await filas()).find((x) => x.etiqueta === "Tasa de graduación")!.clave;
    expect(Number(v.find((x) => x.clave === clave)!.valor)).toBe(90);
  });

  it("sincronizar es idempotente y conserva lo que la unidad aceptó", async () => {
    const [{ clave }] = await filas();
    await t.q("update informe_cifras set visto = 7 where instancia_id = $1 and clave = $2", [prog, clave]);
    await t.asUser(PEOPLE.director, (q) => sync(q, prog), { commit: true });
    expect(await filas()).toHaveLength(3);
    expect(Number((await t.q<{ visto: string }>("select visto from informe_cifras where instancia_id = $1 and clave = $2", [prog, clave]))[0].visto)).toBe(7);
  });

  it("un ajeno no sincroniza", async () => {
    expect(await errorOf(t.asUser(P.ajeno, (q) => sync(q, prog)))).toMatch(/Sin permiso/);
  });

  it("la facultad suma los de sus programas, cada sede aparte", async () => {
    expect(await t.asUser(P.gestor, (q) => sync(q, fac), { commit: true })).toBe(4);
    const programas = await t.q<{ p: string }>(
      "select distinct consulta ->> 'programa_nombre' as p from informe_cifras where instancia_id = $1 and clave like 'meta!_%' escape '!' order by 1",
      [fac],
    );
    expect(programas.map((x) => x.p)).toEqual(["Programa de Prueba A", "Programa de Prueba B"]);
  });

  it("al quitar un indicador desaparece su fila; en otra clase de unidad no hace nada", async () => {
    await t.q("update imp_adoptions set active = false where program_id = $1 and indicator_id = $2", [UNITS.programaB, fichaT]);
    expect(await t.asUser(P.gestor, (q) => sync(q, fac), { commit: true })).toBe(3);
    await t.q("update imp_adoptions set active = true where program_id = $1 and indicator_id = $2", [UNITS.programaB, fichaT]);
    const rect = await t.asUser(P.rector, async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'C') as id", [ciclo, U.rectoria]))[0].id, { commit: true });
    expect(await t.asUser(P.rector, (q) => sync(q, rect))).toBe(0);
  });

  it("enviado, manda la foto: ni el valor posterior ni los cambios del programa mueven el informe", async () => {
    await t.asUser(
      PEOPLE.director,
      async (q) => {
        for (let i = 1; i <= 9; i++) await seccion(q, prog, `s${i}`);
        await enviar(q, prog);
      },
      { commit: true },
    );
    const clave = (await filas()).find((x) => x.etiqueta === "Tasa de graduación")!.clave;
    const foto = () => t.q<{ foto_valor: string | null; meta: string }>("select foto_valor, meta from informe_cifras where instancia_id = $1 and clave = $2", [prog, clave]);
    expect(Number((await foto())[0].foto_valor)).toBe(90);
    await t.q("update imp_values set value_num = 50 where indicator_id = $1 and program_id = $2", [fichaT, UNITS.programaA]);
    await t.q("update imp_adoptions set active = false where program_id = $1", [UNITS.programaA]);
    await t.asUser(PEOPLE.director, (q) => sync(q, prog), { commit: true });
    expect(await filas()).toHaveLength(3);
    expect(Number((await foto())[0].foto_valor)).toBe(90);
    expect(Number((await foto())[0].meta)).toBe(85);
  });
});
