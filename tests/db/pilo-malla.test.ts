/* =============================================================================
   Pregúntele a Pilo (0097): la malla se rehace por fuente y se lee alrededor
   de unos nodos (su ruta hacia arriba y lo que contienen).
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
}, 120_000);

afterAll(() => t?.close());

const nodes = [
  { id: "fuente:pdi", type: "fuente", label: "Plan de Desarrollo" },
  { id: "pdi:pilar:p1", type: "pilar", code: "P1", label: "Personalización" },
  { id: "pdi:area:a1", type: "area", code: "AE1", label: "Acompañamiento" },
  { id: "pdi:linea:l1", type: "linea", code: "LA1", label: "Permanencia" },
  { id: "pdi:proyecto:r1", type: "proyecto", code: "PR1", label: "Tutorías" },
];
const edges = [
  { from: "fuente:pdi", to: "pdi:pilar:p1" },
  { from: "pdi:pilar:p1", to: "pdi:area:a1" },
  { from: "pdi:area:a1", to: "pdi:linea:l1" },
  { from: "pdi:linea:l1", to: "pdi:proyecto:r1" },
];

describe("malla de Pilo", () => {
  it("solo la administración la rehace", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_graph_replace('pdi', $1::jsonb, $2::jsonb)", [JSON.stringify(nodes), JSON.stringify(edges)])))).toMatch(/Solo la administración/);
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_graph_replace('pdi', $1::jsonb, $2::jsonb) as r", [JSON.stringify(nodes), JSON.stringify(edges)]), { commit: true });
    expect(r.r).toMatchObject({ nodes: 5, edges: 4, removed: 0 });
  });

  it("alrededor de una línea: su ruta completa y lo que contiene", async () => {
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ g: { nodes: { id: string }[]; edges: unknown[] } }>("select pilo_graph_around(array['pdi:linea:l1'], null, 6, 1, 80) as g"));
    expect(r.g.nodes.map((n) => n.id).sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(r.g.edges).toHaveLength(4);
  });

  it("rehacer quita lo que ya no está, y el público no la lee", async () => {
    const [r] = await t.asUser(PEOPLE.admin, (q) => q<{ r: Record<string, number> }>("select pilo_graph_replace('pdi', $1::jsonb, $2::jsonb) as r", [JSON.stringify(nodes.slice(0, 3)), JSON.stringify(edges.slice(0, 2))]), { commit: true });
    expect(r.r).toMatchObject({ removed: 2, edges: 2 });
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_nodes")))).toMatch(/permission denied/);
    const [o] = await t.asUser(PEOPLE.admin, (q) => q<{ g: { nodes: unknown[] } }>("select pilo_graph_overview() as g"));
    expect(o.g.nodes).toHaveLength(3);
  });
});
