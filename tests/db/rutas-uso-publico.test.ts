/* =============================================================================
   Uso público de la ruta del bus (0142): agregados de bus_ridership.

   Se comprueba que sin conteos no sale nada, que con conteos salen sumas
   correctas y en la hora de Colombia, que los grupos pequeños y los periodos
   con pocos abordajes se suprimen, que no se filtran filas crudas, y que la
   tabla bus_ridership sigue cerrada a anon.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0142_rutas_uso_publico.sql");
let t: TestDb;
let paradas: { id: string; seq: number }[];

/** Un instante UTC de hace `dias` días a la hora UTC indicada. */
const hace = (dias: number, hh: string) => `((date_trunc('day', now() at time zone 'utc') at time zone 'utc') - interval '${dias} days' + interval '${hh}')`;

async function contar(seq: number, dias: number, horaUtc: string, abordajes: number) {
  const p = paradas.find((x) => x.seq === seq)!;
  await t.q(`insert into bus_ridership (stop_id, observed_at, boardings, alightings, source) values ($1, ${hace(dias, horaUtc)}, $2, 0, 'conteo-manual')`, [p.id, abordajes]);
}

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  paradas = await t.q<{ id: string; seq: number }>("select s.id, s.seq from bus_stops s join bus_routes r on r.id = s.route_id where r.code = 'R1' order by s.seq");
}, 120_000);

beforeEach(async () => {
  await t.q("delete from bus_ridership where true");
});

afterAll(() => t?.close());

const paradasAnon = () => t.asUser(null, (q) => q<Record<string, unknown>>("select * from bus_uso_paradas()"));
const horasAnon = () => t.asUser(null, (q) => q<Record<string, unknown>>("select * from bus_uso_horas()"));

describe("sin conteos", () => {
  it("no devuelve nada, y el público puede llamarlas", async () => {
    expect(await paradasAnon()).toEqual([]);
    expect(await horasAnon()).toEqual([]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select * from bus_uso_horas(30)"))).toEqual([]);
  });

  it("con pocos abordajes en el periodo (menos de 50) tampoco", async () => {
    await contar(1, 2, "12:30", 20);
    await contar(2, 2, "12:30", 25);
    expect(await paradasAnon()).toEqual([]);
    expect(await horasAnon()).toEqual([]);
  });
});

describe("con conteos", () => {
  beforeEach(async () => {
    // 12:30 UTC es 7:30 a. m. en Bogotá; 23:30 UTC es 6:30 p. m.; 02:30 UTC es 9:30 p. m. del día anterior.
    await contar(1, 2, "12:30", 40);
    await contar(1, 3, "12:30", 60);
    await contar(2, 2, "12:30", 30);
    await contar(2, 3, "23:30", 20);
    await contar(3, 3, "23:30", 4); // menos de 10: se suprime
  });

  it("suma por parada, ordena y calcula la participación", async () => {
    const filas = await paradasAnon();
    expect(filas.map((f) => [f.seq, Number(f.abordajes)])).toEqual([
      [1, 100],
      [2, 50],
    ]);
    expect(Number(filas[0].total_periodo)).toBe(154);
    expect(Number(filas[0].participacion)).toBeCloseTo(64.9, 1);
    expect(filas[0].nombre).toBeTruthy();
  });

  it("la parada con menos de 10 abordajes no aparece", async () => {
    const filas = await paradasAnon();
    expect(filas.some((f) => f.seq === 3)).toBe(false);
  });

  it("promedia por hora de Colombia y por día de servicio", async () => {
    const filas = await horasAnon();
    // Hay 2 días con datos (hace 2 y 3 días). 7 a. m.: 40 + 60 + 30 = 130 en 2 días = 65. 18 h: 20 + 4 = 24 en 2 días = 12.
    expect(filas.map((f) => [f.hora, Number(f.promedio)])).toEqual([
      [7, 65],
      [18, 12],
    ]);
    expect(Number(filas[0].dias_servicio)).toBe(2);
  });

  it("la hora 7 no se confunde con la hora UTC (12)", async () => {
    const horas = (await horasAnon()).map((f) => f.hora);
    expect(horas).not.toContain(12);
    expect(horas).toContain(7);
  });

  it("un conteo de madrugada UTC cae en la noche del día anterior en Colombia", async () => {
    await contar(1, 2, "02:30", 30); // 9:30 p. m. del día anterior en Bogotá
    const filas = await horasAnon();
    expect(filas.map((f) => f.hora)).toContain(21);
  });

  it("p_days se acota entre 7 y 90", async () => {
    await contar(1, 40, "12:30", 200);
    const con = (d: number) => t.asUser(null, (q) => q<{ total_periodo: string }>("select total_periodo from bus_uso_paradas($1) limit 1", [d]));
    expect(Number((await con(100))[0].total_periodo)).toBe(354); // 100 se vuelve 90: entra el de hace 40 días
    expect(Number((await con(30))[0].total_periodo)).toBe(154); // 30 días: no entra
    expect(Number((await con(1))[0].total_periodo)).toBe(154); // 1 se vuelve 7: siguen los de hace 2 y 3 días
    expect((await con(-5)).length).toBe(1);
  });

  it("los conteos de rutas ocultas o apagadas no cuentan", async () => {
    await t.q("update bus_routes set \"public\" = false where code = 'R1'");
    expect(await paradasAnon()).toEqual([]);
    expect(await horasAnon()).toEqual([]);
    await t.q("update bus_routes set \"public\" = true where code = 'R1'");
    await t.q("update bus_routes set active = false where code = 'R1'");
    expect(await paradasAnon()).toEqual([]);
    await t.q("update bus_routes set active = true where code = 'R1'");
    expect((await paradasAnon()).length).toBe(2);
  });

  it("no devuelve filas crudas: ni la fuente ni la fecha exacta", async () => {
    for (const filas of [await paradasAnon(), await horasAnon()]) {
      for (const f of filas) {
        expect(Object.keys(f)).not.toContain("source");
        expect(Object.keys(f)).not.toContain("observed_at");
        expect(Object.keys(f)).not.toContain("alightings");
      }
    }
    expect(JSON.stringify(await horasAnon())).not.toContain("conteo-manual");
  });
});

describe("la tabla sigue cerrada", () => {
  it("anon no hace select directo a bus_ridership, ni a sus agregados por otra vía", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from bus_ridership")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("insert into bus_ridership (stop_id, observed_at, boardings, alightings) values ($1, now(), 1, 0)", [paradas[0].id])))).toMatch(/permission denied/);
  });

  it("una persona con sesión que no es de Planeación tampoco ve filas", async () => {
    await contar(1, 2, "12:30", 60);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select * from bus_ridership"))).toHaveLength(0);
  });

  it("las funciones son SECURITY DEFINER con search_path fijo y STABLE", async () => {
    const f = await t.q<{ proname: string; prosecdef: boolean; provolatile: string; cfg: string[] }>(
      "select proname, prosecdef, provolatile, proconfig as cfg from pg_proc where proname in ('bus_uso_paradas', 'bus_uso_horas') order by proname",
    );
    expect(f).toHaveLength(2);
    for (const x of f) {
      expect(x.prosecdef).toBe(true);
      expect(x.provolatile).toBe("s");
      expect(x.cfg.join(",")).toMatch(/search_path=public, pg_temp/);
    }
  });
});

describe("la migración", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const ejecutable = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("es idempotente", async () => {
    await contar(1, 2, "12:30", 70);
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect((await paradasAnon()).length).toBe(1);
  });

  it("no abre la tabla: ni grant ni política sobre bus_ridership, y sin delete ni update", () => {
    expect(ejecutable).not.toMatch(/grant[^;]*on\s+(table\s+)?public\.bus_ridership/i);
    expect(ejecutable).not.toMatch(/create\s+policy[^;]*bus_ridership/i);
    expect(ejecutable).not.toMatch(/\bdelete\s+from\b/i);
    expect(ejecutable).not.toMatch(/\bupdate\s+public\./i);
  });
});
