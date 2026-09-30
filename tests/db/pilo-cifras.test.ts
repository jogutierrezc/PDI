/* =============================================================================
   Pregúntele a Pilo · las cifras en vivo (0107). Las series las escribe la
   administración y las lee la función del servidor; nadie más. (El índice por
   significado, 0108, necesita pgvector, que este Postgres de pruebas no
   tiene: aquí solo se comprueba que su migración se aplica igual.)
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const facts = [
  {
    ref: "cifras:poblacional:matriculados",
    report: "Poblacional",
    label: "Matriculados",
    unit: "estudiantes",
    format: "entero",
    definition: "Estudiantes con matrícula en el periodo.",
    office: "Admisiones",
    path: "/datos-abiertos/poblacional",
    period: "2020–2025",
    illustrative: false,
    series: [
      { y: 2025, t: null, c: "", v: 15870 },
      { y: 2025, t: "B", c: "Cúcuta", v: 2960 },
      { y: 2025, t: null, c: "Bucaramanga", v: 9412 },
    ],
  },
  { ref: "cifras:permanencia:desercion", report: "Permanencia", label: "Tasa de deserción", unit: "%", format: "porcentaje", series: [{ y: 2025, t: "A", c: "", v: 8.4 }] },
];

describe("cifras en vivo", () => {
  it("solo la administración las reemplaza, y una lista vacía no borra nada", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_facts_replace($1::jsonb)", [JSON.stringify(facts)])))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select pilo_facts_replace('[]'::jsonb)")))).toMatch(/al menos un indicador/);
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_facts_replace($1::jsonb) as r", [JSON.stringify(facts)]), { commit: true });
    expect(r.r).toMatchObject({ total: 2, removed: 0 });
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_facts")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select * from pilo_facts"))).toHaveLength(0);
  });

  it("busca el indicador por su nombre, sin tildes, con la serie completa", async () => {
    const [m] = await t.asUser(PEOPLE.admin, (q) => q<{ ref: string; series: unknown[]; format: string }>("select ref, series, format from pilo_facts_search('¿Cuántos matriculados hay en Cúcuta?')"));
    expect(m.ref).toBe("cifras:poblacional:matriculados");
    expect(m.series).toHaveLength(3);
    const [d] = await t.asUser(PEOPLE.admin, (q) => q<{ ref: string; format: string }>("select ref, format from pilo_facts_search('desercion')"));
    expect(d).toMatchObject({ ref: "cifras:permanencia:desercion", format: "porcentaje" });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select * from pilo_facts_search('desercion')")))).toMatch(/Solo la función/);
  });

  it("dice qué sedes aparecen en las series", async () => {
    const [c] = await t.asUser(PEOPLE.admin, (q) => q<{ c: string[] }>("select pilo_facts_campuses() as c"));
    expect(c.c).toEqual(["Bucaramanga", "Cúcuta"]);
  });

  it("lo que ya no viene sale", async () => {
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_facts_replace($1::jsonb) as r", [JSON.stringify([facts[1]])]), { commit: true });
    expect(r.r).toMatchObject({ total: 1, removed: 1 });
  });

});
