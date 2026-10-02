/* =============================================================================
   Mr. Pilo en Enseñanza: el mapa de conexiones (0115).

   Tres documentos de Enseñanza —uno público, uno solo con sesión y uno
   inactivo— y un pasaje de Planeación. Se prueba la estructura sin IA
   (pilo_doc_outline), lo que guarda «comprender» (pilo_map_save) y los vecinos
   por el mapa (pilo_graph_neighbors), que respetan el espacio, la visibilidad
   y su límite, y nunca devuelven los pasajes de entrada.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0115_pilo_mapa.sql");

const FUNCTIONS = ["pilo_doc_outline", "pilo_graph_neighbors", "pilo_map_pending", "pilo_map_save", "pilo_map_status", "pilo_map_topics"];

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // políticas, público
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // innovación, solo con sesión
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // global, inactivo

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });

async function asService<T>(work: (q: Query) => Promise<T>): Promise<T> {
  await t.db.exec("begin");
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    return await work(t.q);
  } finally {
    await t.db.exec("rollback");
  }
}

const rpc = async <T = unknown>(sql: string, params: unknown[] = []) => (await asAdmin((q) => q<{ r: T }>(`select ${sql} as r`, params), true))[0].r;

const mapSave = (rows: unknown[], space = "ensenanza") => rpc<number>("pilo_map_save($1, $2::jsonb)", [space, JSON.stringify(rows)]);

const outline = (doc: string, nodes: unknown[], edges: unknown[]) =>
  rpc<Record<string, number>>("pilo_doc_outline($1, $2::jsonb, $3::jsonb)", [doc, JSON.stringify(nodes), JSON.stringify(edges)]);

const edgesFrom = (ref: string) =>
  t.q<{ to_id: string; rel: string; origin: string }>("select to_id, rel, origin from pilo_edges where from_id = $1 order by to_id", [ref]);

const neighbors = (q: Query, refs: string[], args = "'ensenanza'") =>
  q<{ ref: string; via: string; shared: number }>(`select ref, via, shared from pilo_graph_neighbors($1::text[], ${args})`, [refs]);

const topic = (slug: string, label: string) => ({ id: `tema:${slug}`, label });

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);

  await asAdmin(async (q) => {
    const save = (doc: Record<string, unknown>) => q("select pilo_doc_save('ensenanza', $1::jsonb)", [JSON.stringify(doc)]);
    const fill = (id: string, bodies: string[]) =>
      q("select pilo_doc_replace($1, $2::jsonb)", [id, JSON.stringify(bodies.map((body, i) => ({ seq: i + 1, section: `Sección ${i + 1}`, body })))]);
    await save({ id: A, kind: "pdf", source: "politicas", title: "Política de evaluación", vis: "publico" });
    await save({ id: B, kind: "docx", source: "innovacion", title: "Guía de aula invertida", vis: "sesion" });
    await save({ id: C, kind: "pdf", source: "global", title: "Borrador sin publicar", vis: "publico" });
    await fill(A, [
      "La evaluación formativa acompaña el aprendizaje, según la Ley 30 de 1992.",
      "La rúbrica describe los niveles de desempeño de cada competencia.",
      "El comité curricular revisa los resultados cada semestre.",
    ]);
    await fill(B, ["El aula invertida usa la evaluación formativa antes de la clase.", "La rúbrica del aula invertida se comparte con el curso."]);
    await fill(C, ["Un borrador sobre evaluación formativa que todavía no se publica."]);
    await q("select pilo_doc_update($1, $2::jsonb)", [C, JSON.stringify({ active: false })]);
  }, true);

  // Planeación: un pasaje y una relación con el mismo nombre de tema, en su espacio.
  await t.q("insert into pilo_memory (ref, source, title, body) values ('cifras:evaluacion', 'cifras', 'Evaluación en cifras', 'La evaluación formativa en las cifras de Planeación.')");
  await t.q("insert into pilo_edges (from_id, to_id, rel, source) values ('cifras:evaluacion', 'tema:evaluacion-formativa', 'trata', 'cifras')");
}, 120_000);

afterAll(() => t?.close());

describe("las relaciones nuevas", () => {
  it("la malla acepta «trata» y «cita», y sigue rechazando lo que no conoce", async () => {
    const [c] = await t.q<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'pilo_edges_rel'");
    for (const rel of ["contiene", "vincula", "incluye", "mide", "trata", "cita"]) expect(c.def).toContain(`'${rel}'`);
    expect(await errorOf(t.q("insert into pilo_edges (from_id, to_id, rel, source) values ('a:1', 'b:1', 'inventa', 'pdi')"))).toMatch(/pilo_edges_rel/);
    expect(await errorOf(t.q("insert into pilo_edges (from_id, to_id, rel, source, origin) values ('a:1', 'b:1', 'cita', 'pdi', 'humano')"))).toMatch(/pilo_edges_origin/);
    // Lo que ya había es «de reglas», y pilo_graph_replace sigue como estaba.
    expect(await t.q("select origin from pilo_edges where from_id = 'cifras:evaluacion'")).toEqual([{ origin: "reglas" }]);
    const [g] = await asAdmin((q) => q<{ g: { edges: number } }>("select pilo_graph_replace('pdi', '[]'::jsonb, $1::jsonb) as g", [JSON.stringify([{ from: "a:1", to: "b:1", rel: "trata" }])]));
    expect(g.g.edges).toBe(0);
  });
});

describe("la estructura de un documento, sin IA", () => {
  const nodes = [
    { id: "fuente:politicas", label: "Políticas institucionales" },
    { id: `doc:${A}`, label: "Política de evaluación", path: "/docs/a" },
    { id: `doc:${A}#seccion-1`, label: "Sección 1" },
    { id: `doc:${A}#seccion-2`, label: "Sección 2" },
    { id: "ref:ley-30-de-1992", label: "Ley 30 de 1992" },
    // Nada de esto es suyo:
    { id: "fuente:innovacion", label: "Otra colección" },
    { id: `doc:${B}`, label: "Otro documento" },
    { id: "pdi:pilar:p1", label: "Un nodo de Planeación" },
  ];
  const edges = [
    { from: "fuente:politicas", to: `doc:${A}` },
    { from: `doc:${A}`, to: `doc:${A}#seccion-1` },
    { from: `doc:${A}`, to: `doc:${A}#seccion-2` },
    { from: `doc:${A}#seccion-1`, to: `doc:${A}:1` },
    { from: `doc:${A}:1`, to: "ref:ley-30-de-1992", rel: "cita" },
    // Nada de esto entra:
    { from: `doc:${B}`, to: `doc:${B}:1` },
    { from: `doc:${A}`, to: "pdi:pilar:p1" },
    { from: "fuente:innovacion", to: `doc:${A}` },
    { from: `doc:${A}`, to: `doc:${A}#seccion-1`, rel: "inventa" },
  ];

  it("guarda lo del documento y cuenta lo que rechaza", async () => {
    const r = await outline(A, nodes, edges);
    expect(r).toMatchObject({ doc: A, nodes: 5, edges: 5, removed: 0, rejected: 7 });
    const saved = await t.q<{ id: string; source: string; type: string; space: string }>("select id, source, type, space from pilo_nodes where space = 'ensenanza' order by id");
    expect(saved).toEqual([
      { id: `doc:${A}`, source: "mapa", type: "documento", space: "ensenanza" },
      { id: `doc:${A}#seccion-1`, source: "mapa", type: "seccion", space: "ensenanza" },
      { id: `doc:${A}#seccion-2`, source: "mapa", type: "seccion", space: "ensenanza" },
      { id: "fuente:politicas", source: "mapa", type: "fuente", space: "ensenanza" },
      { id: "ref:ley-30-de-1992", source: "mapa", type: "referencia", space: "ensenanza" },
    ]);
    expect(await t.q("select distinct source, space, origin from pilo_edges where space = 'ensenanza'")).toEqual([{ source: "mapa", space: "ensenanza", origin: "reglas" }]);
    expect(await t.q("select status from pilo_docs where id = $1", [A])).toEqual([{ status: "en_mapa" }]);
    expect(await t.q("select id from pilo_nodes where space = 'planeacion'")).toEqual([]);
  });

  it("rehacerla reemplaza la anterior y no toca lo que puso la IA", async () => {
    await mapSave([{ ref: `doc:${A}:1`, topics: [topic("evaluacion-formativa", "Evaluación formativa")] }]);
    const r = await outline(A, nodes.slice(0, 3), edges.slice(0, 2));
    // La colección ya estaba: no se vuelve a escribir.
    expect(r).toMatchObject({ nodes: 2, edges: 2, removed: 1, rejected: 0 });
    expect((await t.q<{ id: string }>("select id from pilo_nodes where space = 'ensenanza' order by id")).map((n) => n.id)).toEqual([
      `doc:${A}`, `doc:${A}#seccion-1`, "fuente:politicas", "tema:evaluacion-formativa",
    ]);
    // La referencia se quedó sin relación y se fue; la relación de la IA sigue.
    expect(await edgesFrom(`doc:${A}:1`)).toEqual([{ to_id: "tema:evaluacion-formativa", rel: "trata", origin: "ia" }]);
    await outline(A, nodes, edges);
    expect(await edgesFrom(`doc:${A}:1`)).toEqual([
      { to_id: "ref:ley-30-de-1992", rel: "cita", origin: "reglas" },
      { to_id: "tema:evaluacion-formativa", rel: "trata", origin: "ia" },
    ]);
  });

  it("se ve en la malla de Enseñanza y no en la de Planeación", async () => {
    await asAdmin(async (q) => {
      const [e] = await q<{ g: { nodes: { id: string }[]; edges: unknown[] } }>("select pilo_graph_overview(null, 'ensenanza') as g");
      expect(e.g.nodes).toHaveLength(6);
      expect(e.g.edges).toHaveLength(6);
      const [p] = await q<{ g: { nodes: unknown[]; edges: unknown[] } }>("select pilo_graph_overview() as g");
      expect(p.g.nodes).toEqual([]);
      expect(p.g.edges).toEqual([{ from: "cifras:evaluacion", to: "tema:evaluacion-formativa", rel: "trata" }]);
    });
  });

  it("no acepta un documento que no existe", async () => {
    expect(await errorOf(outline("99999999-9999-4999-8999-999999999999", [], []))).toMatch(/no existe/);
  });
});

describe("comprender: lo pendiente y lo guardado", () => {
  it("lo pendiente: pasajes de documentos activos sin marca, en orden", async () => {
    await asAdmin(async (q) => {
      const all = await q<{ ref: string }>("select ref from pilo_map_pending('ensenanza')");
      expect(all.map((p) => p.ref)).toEqual([`doc:${A}:2`, `doc:${A}:3`, `doc:${B}:1`, `doc:${B}:2`]);
      expect((await q<{ ref: string }>("select ref from pilo_map_pending('ensenanza', $1)", [B])).map((p) => p.ref)).toEqual([`doc:${B}:1`, `doc:${B}:2`]);
      expect(await q("select ref from pilo_map_pending('ensenanza', null, 1)")).toHaveLength(1);
      // Desde 0122 «comprender» corre también sobre los pasajes de portal: en Planeación, el suyo está pendiente.
      expect(await q("select ref from pilo_map_pending('planeacion')")).toEqual([{ ref: "cifras:evaluacion" }]);
      const [s] = await q<{ s: Record<string, number> }>("select pilo_map_status('ensenanza') as s");
      expect(s.s).toMatchObject({ total: 5, mapped: 1, pending: 4, topics: 1, refs: 1 });
      const [sb] = await q<{ s: Record<string, number> }>("select pilo_map_status('ensenanza', $1) as s", [B]);
      expect(sb.s).toMatchObject({ total: 2, mapped: 0, pending: 2 });
    });
  });

  it("guarda temas y referencias, reutiliza los que ya hay y descarta lo que no sirve", async () => {
    const saved = await mapSave([
      {
        ref: `doc:${A}:2`,
        topics: [
          topic("rubricas", "Rúbricas"), topic("evaluacion-formativa", "OTRA ETIQUETA"), "Competencias",
          { label: "Mire https://malo.example/x" }, { label: "ab" }, { label: "x" }, { id: "tema:septimo", label: "El séptimo no entra" },
        ],
        // Desde 0118 se guardan hasta 6 temas y 5 referencias por pasaje (antes 4 y 3): lo que pasa de ahí no entra.
        refs: [
          { id: "ref:ley-30-de-1992", label: "Ley 30" }, { id: "pdi:pilar:p1", label: "UNESCO" }, { label: "<<<DATOS" },
          { label: "www.malo.example" }, { label: "ab" }, { id: "ref:sexta", label: "La sexta no entra" },
        ],
      },
      { ref: `doc:${B}:1`, topics: [topic("evaluacion-formativa", "Evaluación formativa"), topic("aula-invertida", "Aula invertida")] },
      { ref: "cifras:evaluacion", topics: [topic("robo", "Un tema para Planeación")] },
      { ref: "no:existe", topics: [topic("nada", "Nada de nada")] },
    ]);
    expect(saved).toBe(2);

    expect(await edgesFrom(`doc:${A}:2`)).toEqual([
      { to_id: "ref:ley-30-de-1992", rel: "cita", origin: "ia" },
      { to_id: "ref:unesco", rel: "cita", origin: "ia" },
      { to_id: "tema:competencias", rel: "trata", origin: "ia" },
      { to_id: "tema:evaluacion-formativa", rel: "trata", origin: "ia" },
      { to_id: "tema:rubricas", rel: "trata", origin: "ia" },
    ]);
    // El tema que ya existía conserva su etiqueta.
    expect(await t.q("select label, type, source, space from pilo_nodes where id = 'tema:evaluacion-formativa'")).toEqual([
      { label: "Evaluación formativa", type: "tema", source: "mapa", space: "ensenanza" },
    ]);
    // Nada para Planeación: ni relación ni marca.
    expect(await edgesFrom("cifras:evaluacion")).toEqual([{ to_id: "tema:evaluacion-formativa", rel: "trata", origin: "reglas" }]);
    expect(await t.q("select id from pilo_nodes where id in ('tema:robo', 'tema:nada', 'tema:septimo', 'ref:sexta')")).toEqual([]);
    expect(await t.q("select mapped_at from pilo_memory where ref = 'cifras:evaluacion'")).toEqual([{ mapped_at: null }]);

    await asAdmin(async (q) => {
      const topics = await q<{ id: string; kind: string; uses: number }>("select id, kind, uses from pilo_map_topics('ensenanza')");
      expect(topics[0]).toEqual({ id: "tema:evaluacion-formativa", kind: "tema", uses: 3 });
      expect(topics.map((x) => x.id).sort()).toEqual([
        "ref:ley-30-de-1992", "ref:unesco", "tema:aula-invertida", "tema:competencias", "tema:evaluacion-formativa", "tema:rubricas",
      ]);
      expect(await q("select id from pilo_map_topics('ensenanza', 2)")).toHaveLength(2);
      // Desde 0121 los temas son comunes: Planeación ve el que SU relación ya usa (la de la siembra), y ninguno más.
      expect(await q("select id, uses from pilo_map_topics('planeacion')")).toEqual([{ id: "tema:evaluacion-formativa", uses: 1 }]);
    });
  });

  it("volver a guardar un pasaje reemplaza sus relaciones de IA, y solo las suyas", async () => {
    const otherBefore = await edgesFrom(`doc:${B}:1`);
    expect(await mapSave([{ ref: `doc:${A}:2`, topics: [topic("competencias", "Competencias")], refs: [] }])).toBe(1);
    expect(await edgesFrom(`doc:${A}:2`)).toEqual([{ to_id: "tema:competencias", rel: "trata", origin: "ia" }]);
    expect(await edgesFrom(`doc:${B}:1`)).toEqual(otherBefore);
    // Las de reglas del pasaje 1 siguen; los temas y referencias que quedaron solos se fueron.
    expect(await edgesFrom(`doc:${A}:1`)).toHaveLength(2);
    expect((await t.q<{ id: string }>("select id from pilo_nodes where space = 'ensenanza' and (id like 'tema:%' or id like 'ref:%') order by id")).map((n) => n.id)).toEqual([
      "ref:ley-30-de-1992", "tema:aula-invertida", "tema:competencias", "tema:evaluacion-formativa",
    ]);
    // Sin nada que guardar, el pasaje queda comprendido igual.
    expect(await mapSave([{ ref: `doc:${A}:3` }])).toBe(1);
    expect(await edgesFrom(`doc:${A}:3`)).toEqual([]);
  });

  it("el documento queda «entendido» cuando no le falta ningún pasaje, y vuelve a faltar el que cambia", async () => {
    expect(await t.q("select status, understood_at is not null as understood from pilo_docs where id = $1", [A])).toEqual([{ status: "entendido", understood: true }]);
    expect(await t.q("select status, understood_at is not null as understood from pilo_docs where id = $1", [B])).toEqual([{ status: "en_pasajes", understood: false }]);
    await t.q("update pilo_memory set updated_at = now() - interval '1 day', mapped_at = now() - interval '1 hour' where doc_id = $1", [A]);
    await rpc("pilo_doc_replace($1, $2::jsonb)", [A, JSON.stringify([
      { seq: 1, section: "Sección 1", body: "La evaluación formativa acompaña el aprendizaje, según la Ley 30 de 1992." },
      { seq: 2, section: "Sección 2", body: "La rúbrica describe los niveles de desempeño de cada competencia, con ejemplos." },
      { seq: 3, section: "Sección 3", body: "El comité curricular revisa los resultados cada semestre." },
    ])]);
    await asAdmin(async (q) => {
      expect((await q<{ ref: string }>("select ref from pilo_map_pending('ensenanza', $1)", [A])).map((p) => p.ref)).toEqual([`doc:${A}:2`]);
    });
    expect(await t.q("select status from pilo_docs where id = $1", [A])).toEqual([{ status: "en_pasajes" }]);
    // La relación del pasaje que cambió sigue hasta que se vuelva a comprender.
    expect(await edgesFrom(`doc:${A}:2`)).toHaveLength(1);
  });

  it("no acepta un espacio desconocido ni filas que no sean una lista", async () => {
    // Desde 0121 Planeación también tiene mapa de documentos: lo desconocido es lo que no es de ningún portal.
    expect(await errorOf(mapSave([], "otro"))).toMatch(/Espacio desconocido/);
    expect(await mapSave([], "planeacion")).toBe(0);
    expect(await errorOf(rpc("pilo_map_save('ensenanza', '{}'::jsonb)"))).toMatch(/lista/);
  });
});

describe("vecinos por el mapa", () => {
  beforeAll(async () => {
    // Todos tratan de evaluación formativa: A1 (público), A2 (público), B1 (sesión), C1 (oculto).
    await mapSave([
      { ref: `doc:${A}:2`, topics: [topic("competencias", "Competencias"), topic("evaluacion-formativa", "Evaluación formativa")] },
      { ref: `doc:${B}:2`, topics: [topic("competencias", "Competencias")] },
    ]);
    await t.q("insert into pilo_edges (from_id, to_id, rel, source, space, origin) values ($1, 'tema:evaluacion-formativa', 'trata', 'mapa', 'ensenanza', 'ia')", [`doc:${C}:1`]);
  });

  it("devuelve los que comparten tema, nunca los de entrada, y primero el que más comparte", async () => {
    await asAdmin(async (q) => {
      const near = await neighbors(q, [`doc:${A}:2`], "'ensenanza', null, false, 10");
      expect(near.map((n) => n.ref).sort()).toEqual([`doc:${A}:1`, `doc:${B}:1`, `doc:${B}:2`]);
      expect(near.every((n) => n.shared === 1 && n.via !== "")).toBe(true);
      const two = await neighbors(q, [`doc:${A}:2`, `doc:${B}:2`], "'ensenanza', null, false, 10");
      expect(two.map((n) => n.ref).sort()).toEqual([`doc:${A}:1`, `doc:${B}:1`]);
      expect(await neighbors(q, [`doc:${A}:3`])).toEqual([]);
      expect(await neighbors(q, [])).toEqual([]);
      expect(await neighbors(q, ["no:existe"])).toEqual([]);
    });
  });

  it("respeta la visibilidad: lo oculto nunca; sin sesión, solo lo público", async () => {
    await asAdmin(async (q) => {
      const all = await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, false, 10");
      expect(all.map((n) => n.ref).sort()).toEqual([`doc:${A}:2`, `doc:${B}:1`]);
      expect(all.map((n) => n.ref)).not.toContain(`doc:${C}:1`);
      const pub = await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, true, 10");
      expect(pub.map((n) => n.ref)).toEqual([`doc:${A}:2`]);
      // Desde un pasaje con sesión, sin sesión solo salen los públicos.
      expect((await neighbors(q, [`doc:${B}:1`], "'ensenanza', null, true, 10")).map((n) => n.ref).sort()).toEqual([`doc:${A}:1`, `doc:${A}:2`]);
    });
  });

  it("respeta el espacio y las fuentes", async () => {
    await asAdmin(async (q) => {
      const near = await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, false, 10");
      expect(near.map((n) => n.ref)).not.toContain("cifras:evaluacion");
      expect(await neighbors(q, [`doc:${A}:1`], "'planeacion', null, false, 10")).toEqual([]);
      expect(await neighbors(q, ["cifras:evaluacion"], "'planeacion', null, false, 10")).toEqual([]);
      expect(await neighbors(q, ["cifras:evaluacion"], "'ensenanza', null, false, 10")).toEqual([]);
      expect(await neighbors(q, [`doc:${A}:1`], "'otro', null, false, 10")).toEqual([]);
      expect((await neighbors(q, [`doc:${A}:1`], "'ensenanza', array['innovacion'], false, 10")).map((n) => n.ref)).toEqual([`doc:${B}:1`]);
      expect(await neighbors(q, [`doc:${A}:1`], "'ensenanza', array['cifras', 'moodle'], false, 10")).toEqual([]);
    });
  });

  it("respeta su límite: 3 de partida, 10 como máximo", async () => {
    await asAdmin(async (q) => {
      expect(await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, false, 1")).toHaveLength(1);
      // Veinte pasajes más con el mismo tema.
      await q("select pilo_doc_replace($1, $2::jsonb)", [B, JSON.stringify(Array.from({ length: 22 }, (_, i) => ({ seq: i + 1, body: `Pasaje ${i + 1} de la guía de aula invertida.` })))]);
      await q("select pilo_map_save('ensenanza', $1::jsonb)", [JSON.stringify(Array.from({ length: 22 }, (_, i) => ({ ref: `doc:${B}:${i + 1}`, topics: [topic("evaluacion-formativa", "Evaluación formativa")] })))]);
      expect(await neighbors(q, [`doc:${A}:1`])).toHaveLength(3);
      expect(await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, false, 500")).toHaveLength(10);
      expect(await neighbors(q, [`doc:${A}:1`], "'ensenanza', null, false, 0")).toHaveLength(1);
    });
  });

  it("la usan la función del servidor y la administración, nadie más", async () => {
    expect((await asService((q) => neighbors(q, [`doc:${A}:1`], "'ensenanza', null, true, 10"))).map((n) => n.ref)).toEqual([`doc:${A}:2`]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => neighbors(q, [`doc:${A}:1`])))).toMatch(/Solo la función/);
    expect(await errorOf(t.asUser(null, (q) => neighbors(q, [`doc:${A}:1`])))).toMatch(/permission denied/);
  });
});

describe("quién puede", () => {
  it("las funciones del mapa: la del servidor y la administración", async () => {
    for (const call of [
      `pilo_doc_outline('${A}', '[]'::jsonb, '[]'::jsonb)`, "pilo_map_save('ensenanza', '[]'::jsonb)", "pilo_map_status('ensenanza')",
    ]) {
      expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(`select ${call}`))), call).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(null, (q) => q(`select ${call}`))), call).toMatch(/permission denied/);
    }
    for (const call of ["pilo_map_pending('ensenanza')", "pilo_map_topics('ensenanza')"]) {
      expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(`select * from ${call}`))), call).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(null, (q) => q(`select * from ${call}`))), call).toMatch(/permission denied/);
    }
    expect(await asService((q) => q<{ n: number }>("select pilo_map_save('ensenanza', '[]'::jsonb) as n"))).toEqual([{ n: 0 }]);
  });

  it("toda función nueva es «security definer», con search_path fijo y sin permiso para el público", async () => {
    const fns = await t.q<{ proname: string; prosecdef: boolean; proconfig: string[] | null; anon: boolean; pub: boolean }>(
      `select p.proname, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any ($1) order by p.proname`,
      [FUNCTIONS],
    );
    expect(fns.map((f) => f.proname)).toEqual(FUNCTIONS);
    for (const f of fns) {
      expect(f.prosecdef, f.proname).toBe(true);
      expect(f.proconfig, f.proname).toContain("search_path=public");
      expect(f.anon, f.proname).toBe(false);
      expect(f.pub, f.proname).toBe(false);
    }
  });
});

describe("la migración es idempotente", () => {
  it("aplicarla dos veces no falla ni cambia nada", async () => {
    const snapshot = () =>
      t.q(`select
        (select jsonb_agg(to_jsonb(e) order by e.from_id, e.to_id, e.rel) from pilo_edges e) as edges,
        (select jsonb_agg(jsonb_build_object('id', n.id, 'space', n.space, 'label', n.label) order by n.id) from pilo_nodes n) as nodes,
        (select jsonb_agg(jsonb_build_object('ref', m.ref, 'mapped', m.mapped_at, 'at', m.updated_at) order by m.ref) from pilo_memory m) as memory,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_indexes where schemaname = 'public' and indexname like 'pilo\\_%') as indexes`);
    const before = await snapshot();
    // 0115 y, encima, 0118 (que solo sube el tope de temas y referencias de pilo_map_save).
    // Y 0121, que vuelve a dejar las funciones del mapa como las dejó (una sola firma de cada una).
    const sql = ["0118_pilo_mapa_mas_temas.sql", "0121_pilo_portales.sql", "0122_pilo_puentes.sql"].reduce((all, f) => all + ";\n" + readFileSync(resolve(__dirname, "../../supabase/migrations", f), "utf8"), readFileSync(MIGRATION, "utf8"));
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
    expect(await errorOf(t.asUser(null, (q) => neighbors(q, [`doc:${A}:1`])))).toMatch(/permission denied/);
    expect(await errorOf(t.q("insert into pilo_edges (from_id, to_id, rel, source) values ('a:1', 'b:1', 'inventa', 'pdi')"))).toMatch(/pilo_edges_rel/);
  });
});
