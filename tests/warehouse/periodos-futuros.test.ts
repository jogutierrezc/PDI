/* Periodos nuevos del warehouse: los ayudantes de la pantalla (conjuntos.ts) y la migración 0295
   (wh_crear_periodo, wh_eliminar_periodo) contra la base de verdad. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorPeriodoNuevo, mezclarPeriodos, normalizarPeriodo, periodoPorDefecto, periodosSugeridos } from "../../src/modules/warehouse/conjuntos";
import { createTestDb, errorOf, type Query, type TestDb } from "../db/harness";

const HOY = new Date(2026, 10, 25); // 25 de noviembre de 2026 → semestre 2026b

describe("ayudantes de periodos", () => {
  it("normaliza 2027A, 2027 b y 2027-b", () => {
    expect(normalizarPeriodo("2027A")).toBe("2027a");
    expect(normalizarPeriodo(" 2027 b ")).toBe("2027b");
    expect(normalizarPeriodo("2027-B")).toBe("2027b");
    expect(normalizarPeriodo("2027c")).toBeNull();
    expect(normalizarPeriodo("27a")).toBeNull();
    expect(normalizarPeriodo("")).toBeNull();
  });

  it("rechaza lo repetido, lo muy lejano y lo anterior a 2018", () => {
    expect(errorPeriodoNuevo("2027A", ["2026b"], HOY)).toBeNull();
    expect(errorPeriodoNuevo("2026B", ["2026b"], HOY)).toMatch(/ya existe/);
    expect(errorPeriodoNuevo("2017b", [], HOY)).toMatch(/entre 2018 y 2031/);
    expect(errorPeriodoNuevo("2032a", [], HOY)).toMatch(/entre 2018 y 2031/);
    expect(errorPeriodoNuevo("hola", [], HOY)).toMatch(/año y la letra/);
  });

  it("sugiere los siguientes que aún no existen", () => {
    expect(periodosSugeridos(["2026b"], 3, HOY)).toEqual(["2027a", "2027b", "2028a"]);
    expect(periodosSugeridos([], 2, HOY)).toEqual(["2026b", "2027a"]);
  });

  it("un periodo futuro aparece en la lista pero no queda como el de entrada", () => {
    const lista = mezclarPeriodos(["2026a", "2026b"], ["2027a", "2027b"], HOY);
    expect(lista.slice(0, 3)).toEqual(["2027b", "2027a", "2026b"]);
    expect(periodoPorDefecto(lista, null, HOY)).toBe("2026b");
    expect(periodoPorDefecto(lista, "2026a", HOY)).toBe("2026a");
    expect(periodoPorDefecto(["2027a"], null, HOY)).toBe("2027a"); // si no hay otro, el único
  });
});

describe("0295 · crear y quitar periodos", () => {
  const PLANEACION = "00000000-0000-4000-a000-0000000000e1";
  const CONSULTA = "00000000-0000-4000-a000-0000000000e2";
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb({ seed: false });
    for (const [nombre, id, rol] of [["planeacion", PLANEACION, "planeacion"], ["consulta", CONSULTA, "consulta"]] as const) {
      await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
      await t.q("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [id, `${nombre}@prueba.udes.edu.co`, nombre]);
      await t.q("update public.profiles set is_active = true, role = $2 where id = $1", [id, rol]);
    }
  }, 180_000);
  afterAll(async () => t?.close());

  const crear = (p: string) => (q: Query) => q("select public.wh_crear_periodo($1)", [p]);
  // Cada asUser se revierte al terminar: un escenario entero va en un solo bloque.

  it("Planeación crea 2027a y 2027b abiertos y vacíos; los lee en la lista", async () => {
    await t.asUser(PLANEACION, async (q) => {
      await crear("2027A")(q); // acepta mayúscula
      await crear("2027b")(q);
      const filas = await q<{ periodo: string; estado: string }>("select periodo, estado from public.wh_periodos where periodo like '2027%' order by 1");
      expect(filas).toEqual([{ periodo: "2027a", estado: "abierto" }, { periodo: "2027b", estado: "abierto" }]);
    });
  });

  it("no crea repetidos, mal escritos ni fuera de rango; Consulta no puede", async () => {
    await t.asUser(PLANEACION, async (q) => {
      await crear("2027a")(q);
      for (const [malo, patron] of [["2027a", /periodo_existe/], ["2027-a", /periodo_invalido/], ["2017b", /periodo_invalido/], ["2099a", /periodo_invalido/]] as const) {
        await q("savepoint s");
        expect(await errorOf(crear(malo)(q))).toMatch(patron);
        await q("rollback to savepoint s");
      }
    });
    expect(await errorOf(t.asUser(CONSULTA, crear("2028a")))).toMatch(/sin permiso/);
    expect(await errorOf(t.asUser(null, crear("2028a")))).toMatch(/permission denied/);
  });

  it("quita un periodo vacío y abierto; no uno con cargas ni uno cerrado", async () => {
    await t.asUser(PLANEACION, async (q) => {
      await crear("2028a")(q);
      await q("select public.wh_eliminar_periodo('2028a')");
      expect(await q("select 1 from public.wh_periodos where periodo = '2028a'")).toHaveLength(0);

      await crear("2027a")(q);
      await q("select * from public.wh_abrir_carga('ma_rendimiento', '2027a', 'buc', '', $1, 'archivo', 'x.xlsx', '')", ["d".repeat(64)]);
      await q("savepoint s1");
      expect(await errorOf(q("select public.wh_eliminar_periodo('2027a')"))).toMatch(/periodo_con_cargas/);
      await q("rollback to savepoint s1");

      await crear("2028b")(q);
      await q("select public.wh_cerrar_periodo('2028b', 'prueba')");
      await q("savepoint s2");
      expect(await errorOf(q("select public.wh_eliminar_periodo('2028b')"))).toMatch(/periodo_no_quitable/);
      await q("rollback to savepoint s2");
      await q("savepoint s3");
      expect(await errorOf(q("select public.wh_eliminar_periodo('permanente')"))).toMatch(/periodo_no_quitable|periodo_con_cargas/);
      await q("rollback to savepoint s3");
    });
  });
});
