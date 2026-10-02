/* =============================================================================
   Mr. Pilo por espacios (0113): el Pilo de Planeación y el de Enseñanza no se
   mezclan. Se siembran los dos espacios y se llama cada función con cada uno:
   una fila del otro nunca vuelve. Sin `p_space`, todo se comporta como antes
   y solo ve «planeacion».

   Este Postgres de pruebas no trae pgvector. Para poder probar el aislamiento
   de las funciones de vectores, aquí se pone un doble mínimo: un tipo
   `extensions.vector` que es texto y un `<=>` que vale 0 si los dos textos
   son iguales y 1 si no. No mide parecido de verdad; alcanza para comprobar
   qué filas entran y cuáles no.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0113_pilo_espacios.sql");

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });

/** Como la función del servidor: rol de servicio, sin persona. */
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

const refs = (rows: { ref: string }[]) => rows.map((r) => r.ref).sort();
const keys = (rows: { key: string }[]) => rows.map((r) => r.key).sort();

const QNORM = "que es la evaluacion formativa";

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);

  // El doble de pgvector (ver el encabezado).
  await t.db.exec(`
    create domain extensions.vector as text;
    create function extensions.pilo_test_distance(text, text) returns double precision
      language sql immutable as $$ select case when $1 = $2 then 0::double precision else 1::double precision end $$;
    create operator extensions.<=> (leftarg = text, rightarg = text, function = extensions.pilo_test_distance);
    alter table public.pilo_memory add column if not exists embedding extensions.vector;
    alter table public.pilo_facts add column if not exists embedding extensions.vector;
    alter table public.pilo_catalog_vectors add column if not exists embedding extensions.vector;
  `);

  // La memoria: un pasaje de Planeación y tres de Enseñanza (público, con sesión, oculto).
  await t.q(`insert into pilo_memory (ref, source, title, body, space, vis, embedding, embed_model, embedded_at) values
    ('cifras:evaluacion', 'cifras', 'Evaluación en cifras', 'La evaluación formativa en las cifras de Planeación.', 'planeacion', 'publico', 'v1', 'm', now() + interval '1 minute'),
    ('doc:pol:1', 'politicas', 'Política de evaluación', 'La evaluación formativa según la política institucional.', 'ensenanza', 'publico', 'v1', 'm', now() + interval '1 minute'),
    ('doc:moodle:1', 'moodle', 'Curso de evaluación', 'La evaluación formativa en un curso de Moodle.', 'ensenanza', 'sesion', 'v1', 'm', now() + interval '1 minute'),
    ('doc:inn:1', 'innovacion', 'Borrador de evaluación', 'La evaluación formativa en un borrador que no se muestra.', 'ensenanza', 'oculto', 'v1', 'm', now() + interval '1 minute')`);
  await t.q("insert into pilo_facts (ref, label) values ('cifra:matriculados', 'Matriculados')");

  // Respuestas guardadas: la misma pregunta en Planeación y en Enseñanza (sin rol, estudiante, profesor).
  await t.q(
    `insert into pilo_answers (question, qnorm, kind, answer, refs, space, rol, created_at) values
      ('¿Qué es la evaluación formativa?', $1, 'ia', 'PLANEACION', array['cifras:evaluacion'], 'planeacion', '', now() + interval '1 hour'),
      ('¿Qué es la evaluación formativa?', $1, 'ia', 'ENSENANZA-GENERAL', array['doc:pol:1'], 'ensenanza', '', now() + interval '1 hour'),
      ('¿Qué es la evaluación formativa?', $1, 'ia', 'ENSENANZA-ESTUDIANTE', array['doc:pol:1'], 'ensenanza', 'estudiante', now() + interval '1 hour'),
      ('¿Qué es la evaluación formativa?', $1, 'ia', 'ENSENANZA-PROFESOR', array['doc:moodle:1'], 'ensenanza', 'profesor', now() + interval '1 hour')`,
    [QNORM],
  );

  // El catálogo, por la función de importar.
  await asAdmin(async (q) => {
    await q("select pilo_catalog_import('respuesta', $1::jsonb)", [JSON.stringify([{ key: "R-001", question: "¿Qué es el PDI?", answer: "El Plan de Desarrollo." }])]);
    await q("select pilo_catalog_import('respuesta', $1::jsonb, false, 'ensenanza')", [JSON.stringify([{ key: "ER-001", question: "¿Qué es la evaluación formativa?", answer: "La que acompaña.", rol: "estudiante" }])]);
    await q("select pilo_catalog_import('capciosa', $1::jsonb, false, 'ensenanza')", [JSON.stringify([{ key: "EC-001", triggers: ["tarea"], answer: "No hago tareas." }])]);
  }, true);
  await t.q("insert into pilo_catalog_vectors (key, embedding, embed_model, embedded_at) values ('R-001', 'v1', 'm', now() + interval '1 minute'), ('ER-001', 'v1', 'm', now() + interval '1 minute')");

  // La malla: una rama por espacio y una relación de Enseñanza que apunta a un nodo de Planeación.
  await t.q(`insert into pilo_nodes (id, source, type, label, space) values
    ('fuente:pdi', 'pdi', 'fuente', 'Plan de Desarrollo', 'planeacion'),
    ('pdi:pilar:p1', 'pdi', 'pilar', 'Personalización', 'planeacion'),
    ('fuente:politicas', 'politicas', 'fuente', 'Políticas', 'ensenanza'),
    ('doc:pol:1', 'mapa', 'documento', 'Política de evaluación', 'ensenanza')`);
  await t.q(`insert into pilo_edges (from_id, to_id, rel, source, space) values
    ('fuente:pdi', 'pdi:pilar:p1', 'contiene', 'pdi', 'planeacion'),
    ('fuente:politicas', 'doc:pol:1', 'contiene', 'politicas', 'ensenanza'),
    ('doc:pol:1', 'pdi:pilar:p1', 'contiene', 'mapa', 'ensenanza')`);
}, 120_000);

afterAll(() => t?.close());

describe("los valores de partida", () => {
  it("toda columna `space` nace en «planeacion»; `vis` en «publico» y `rol` vacío", async () => {
    const cols = await t.q<{ table_name: string; column_name: string; column_default: string; is_nullable: string }>(
      `select table_name, column_name, column_default, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name in ('space', 'vis', 'rol')
         and table_name in ('pilo_memory', 'pilo_answers', 'pilo_catalog', 'pilo_inbox', 'pilo_nodes', 'pilo_edges', 'pilo_ai_log')
       order by table_name, column_name`,
    );
    expect(cols.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      "pilo_ai_log.rol", "pilo_ai_log.space",
      "pilo_answers.rol", "pilo_answers.space",
      "pilo_catalog.rol", "pilo_catalog.space",
      "pilo_edges.space",
      "pilo_inbox.rol", "pilo_inbox.space",
      "pilo_memory.space", "pilo_memory.vis",
      "pilo_nodes.space",
    ]);
    for (const c of cols) {
      expect(c.is_nullable).toBe("NO");
      const expected = c.column_name === "space" ? "'planeacion'" : c.column_name === "vis" ? "'publico'" : "''";
      expect(c.column_default).toContain(expected);
    }
  });

  it("cada función tiene una sola firma, y sus parámetros nuevos tienen valor de partida", async () => {
    const fns = await t.q<{ proname: string; args: string }>(
      `select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (
         'pilo_memory_search', 'pilo_memory_semantic', 'pilo_answer_candidates', 'pilo_catalog_active', 'pilo_catalog_import',
         'pilo_catalog_semantic', 'pilo_catalog_near', 'pilo_graph_around', 'pilo_graph_overview', 'pilo_embed_status',
         'pilo_embed_pending', 'pilo_inbox_add', 'pilo_ai_key_status', 'pilo_ai_public_config', 'pilo_space_usage')
       order by p.proname`,
    );
    expect(fns).toHaveLength(15);
    const args = Object.fromEntries(fns.map((f) => [f.proname, f.args]));
    const withSpace = fns.filter((f) => !["pilo_ai_key_status", "pilo_ai_public_config", "pilo_space_usage"].includes(f.proname));
    for (const f of withSpace) expect(f.args, f.proname).toContain("p_space text DEFAULT 'planeacion'::text");
    for (const name of ["pilo_memory_search", "pilo_memory_semantic", "pilo_answer_candidates"]) {
      expect(args[name], name).toContain("p_public_only boolean DEFAULT false");
    }
    expect(args.pilo_answer_candidates).toContain("p_rol text DEFAULT ''::text");
    expect(args.pilo_inbox_add).toContain("p_rol text DEFAULT ''::text");
    expect(args.pilo_space_usage).toBe("p_space text");
    expect(args.pilo_ai_key_status).toBe("");
    expect(args.pilo_ai_public_config).toBe("");
  });

  it("lo que se inserta sin decir espacio queda en «planeacion»", async () => {
    await asAdmin(async (q) => {
      await q("select pilo_inbox_add('¿Y esto de quién es?', 'y esto de quien es', 'sin_respuesta')");
      const [b] = await q<{ space: string; rol: string }>("select space, rol from pilo_inbox where qnorm = 'y esto de quien es'");
      expect(b).toEqual({ space: "planeacion", rol: "" });
      await q("select pilo_memory_replace('pdi', $1::jsonb)", [JSON.stringify([{ ref: "pdi:nuevo", title: "Pilar", body: "Un pasaje nuevo del plan." }])]);
      const [m] = await q<{ space: string; vis: string }>("select space, vis from pilo_memory where ref = 'pdi:nuevo'");
      expect(m).toEqual({ space: "planeacion", vis: "publico" });
    });
  });
});

describe("la procedencia de un pasaje es la de su fuente", () => {
  // Desde 0121 ya no hay un CHECK fuente ↔ espacio: lo garantiza la llave a pilo_sources
  // (pilo_memory_source_fk). La malla (nodos y relaciones) queda sin atadura.
  it("rechaza los cruces en la memoria; la malla ya no ata la fuente al espacio", async () => {
    const mem = (space: string, source: string) =>
      t.q("insert into pilo_memory (ref, source, title, body, space) values ('cruce:1', $2, 'Cruce', 'Un pasaje cruzado de prueba.', $1)", [space, source]);
    expect(await errorOf(mem("planeacion", "politicas"))).toMatch(/pilo_memory_source/);
    expect(await errorOf(mem("ensenanza", "cifras"))).toMatch(/pilo_memory_source/);
    expect(await errorOf(mem("ensenanza", "mapa"))).toMatch(/pilo_memory_source/);
    expect(await errorOf(t.q("update pilo_memory set space = 'ensenanza' where ref = 'cifras:evaluacion'"))).toMatch(/pilo_memory_source/);
    expect(await errorOf(t.q("update pilo_memory set source = 'pdi' where ref = 'doc:pol:1'"))).toMatch(/pilo_memory_source/);

    const gone = await t.q<{ conname: string }>("select conname from pg_constraint where conname in ('pilo_memory_source', 'pilo_nodes_source', 'pilo_edges_source')");
    expect(gone).toEqual([]);
    const kept = await t.q<{ conname: string }>("select conname from pg_constraint where conname in ('pilo_memory_source_fk', 'pilo_nodes_space', 'pilo_edges_space') order by conname");
    expect(kept.map((c) => c.conname)).toEqual(["pilo_edges_space", "pilo_memory_source_fk", "pilo_nodes_space"]);
    // Un nodo del mapa de documentos cabe ahora en Planeación (se revierte: no ensucia las demás pruebas).
    await t.db.exec("begin");
    try {
      await t.q("insert into pilo_nodes (id, source, type, label, space) values ('cruce:nodo', 'mapa', 'nodo', 'Cruce', 'planeacion')");
      await t.q("insert into pilo_edges (from_id, to_id, rel, source, space) values ('cruce:a', 'cruce:b', 'contiene', 'mapa', 'planeacion')");
    } finally {
      await t.db.exec("rollback");
    }
    expect(await errorOf(t.q("insert into pilo_nodes (id, source, type, label, space) values ('cruce:nodo', 'mapa', 'nodo', 'Cruce', 'otro')"))).toMatch(/pilo_nodes_space/);
  });

  it("no acepta espacios, visibilidades ni roles desconocidos", async () => {
    expect(await errorOf(t.q("insert into pilo_memory (ref, source, title, body, space) values ('otro:1', 'cifras', 'Otro', 'Un pasaje de otro espacio.', 'otro')"))).toMatch(/pilo_memory_(space|source)/);
    expect(await errorOf(t.q("update pilo_memory set vis = 'secreto' where ref = 'doc:pol:1'"))).toMatch(/pilo_memory_vis/);
    expect(await errorOf(t.q("update pilo_answers set rol = 'rector'"))).toMatch(/pilo_answers_rol/);
    expect(await errorOf(t.q("update pilo_catalog set space = 'otro'"))).toMatch(/pilo_catalog_space/);
    expect(await errorOf(t.q("insert into pilo_ai_log (portal, action, status, space) values ('x', 'preguntar', 'listo', 'otro')"))).toMatch(/pilo_ai_log_space/);
    expect(await errorOf(t.q("insert into pilo_ai_log (portal, action, status, rol) values ('x', 'preguntar', 'listo', 'general')"))).toMatch(/pilo_ai_log_rol/);
  });

  it("pilo_memory_replace y pilo_graph_replace siguen aceptando solo las cinco fuentes de Planeación", async () => {
    const row = JSON.stringify([{ ref: "doc:pol:9", title: "Política", body: "Un pasaje de una política." }]);
    expect(await errorOf(asAdmin((q) => q("select pilo_memory_replace('politicas', $1::jsonb)", [row])))).toMatch(/Fuente desconocida/);
    expect(await errorOf(asAdmin((q) => q("select pilo_graph_replace('mapa', '[]'::jsonb, '[]'::jsonb)")))).toMatch(/Fuente desconocida/);
    // Y no pueden apropiarse de un pasaje de Enseñanza usando su ref.
    const steal = JSON.stringify([{ ref: "doc:pol:1", title: "Robado", body: "Un pasaje que era de Enseñanza." }]);
    expect(await errorOf(asAdmin((q) => q("select pilo_memory_replace('pdi', $1::jsonb)", [steal])))).toMatch(/pilo_memory_source/);
  });
});

describe("la memoria no se cruza", () => {
  it("por palabras: cada espacio ve lo suyo; sin sesión, solo lo público; lo oculto, nunca", async () => {
    await asAdmin(async (q) => {
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa')"))).toEqual(["cifras:evaluacion"]);
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'planeacion')"))).toEqual(["cifras:evaluacion"]);
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'ensenanza')"))).toEqual(["doc:moodle:1", "doc:pol:1"]);
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'ensenanza', true)"))).toEqual(["doc:pol:1"]);
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'planeacion', true)"))).toEqual(["cifras:evaluacion"]);
      // Pedir las fuentes del otro espacio no abre la puerta.
      expect(await q("select ref from pilo_memory_search('evaluación formativa', array['politicas', 'moodle', 'innovacion'])")).toEqual([]);
      expect(await q("select ref from pilo_memory_search('evaluación formativa', array['cifras'], 20, 'ensenanza')")).toEqual([]);
      expect(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'otro')")).toEqual([]);
    });
  });

  it("por significado: igual", async () => {
    await asAdmin(async (q) => {
      expect(refs(await q("select ref from pilo_memory_semantic('v1', 'm')"))).toEqual(["cifras:evaluacion"]);
      expect(refs(await q("select ref from pilo_memory_semantic('v1', 'm', null, 20, 0.3, 'ensenanza')"))).toEqual(["doc:moodle:1", "doc:pol:1"]);
      expect(refs(await q("select ref from pilo_memory_semantic('v1', 'm', null, 20, 0.3, 'ensenanza', true)"))).toEqual(["doc:pol:1"]);
      expect(await q("select ref from pilo_memory_semantic('v1', 'm', array['politicas', 'moodle'])")).toEqual([]);
      expect(await q("select ref from pilo_memory_semantic('v1', 'm', array['cifras'], 20, 0.3, 'ensenanza')")).toEqual([]);
    });
  });

  it("la usan la función del servidor y la administración, nadie más", async () => {
    expect(refs(await asService((q) => q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'ensenanza', true)")))).toEqual(["doc:pol:1"]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select ref from pilo_memory_search('evaluación', null, 6, 'ensenanza')")))).toMatch(/Solo la función/);
    expect(await errorOf(t.asUser(null, (q) => q("select ref from pilo_memory_search('evaluación', null, 6, 'ensenanza')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select ref from pilo_memory_semantic('v1', 'm', null, 8, 0.3, 'ensenanza')")))).toMatch(/permission denied/);
  });
});

describe("las respuestas guardadas se separan por espacio y por rol", () => {
  const answers = (q: Query, args: string) => q<{ answer: string; fresh: boolean }>(`select answer, fresh from pilo_answer_candidates(${args})`, [QNORM]);

  it("sin espacio, solo la de Planeación", async () => {
    await asAdmin(async (q) => {
      expect(await answers(q, "$1")).toEqual([{ answer: "PLANEACION", fresh: true }]);
      // Un rol no saca respuestas de Planeación que no son suyas, ni las de Enseñanza.
      expect(await answers(q, "$1, 'planeacion', 'estudiante'")).toEqual([]);
    });
  });

  it("en Enseñanza, una por rol; un rol desconocido cuenta como sin rol", async () => {
    await asAdmin(async (q) => {
      expect(await answers(q, "$1, 'ensenanza'")).toEqual([{ answer: "ENSENANZA-GENERAL", fresh: true }]);
      expect(await answers(q, "$1, 'ensenanza', 'estudiante'")).toEqual([{ answer: "ENSENANZA-ESTUDIANTE", fresh: true }]);
      expect(await answers(q, "$1, 'ensenanza', 'profesor'")).toEqual([{ answer: "ENSENANZA-PROFESOR", fresh: true }]);
      expect(await answers(q, "$1, 'ensenanza', 'general'")).toEqual([{ answer: "ENSENANZA-GENERAL", fresh: true }]);
      expect(await answers(q, "$1, 'otro'")).toEqual([]);
    });
  });

  it("sin sesión, la que cita un pasaje que no es público deja de estar fresca", async () => {
    await asAdmin(async (q) => {
      expect(await answers(q, "$1, 'ensenanza', 'profesor', true")).toEqual([{ answer: "ENSENANZA-PROFESOR", fresh: false }]);
      expect(await answers(q, "$1, 'ensenanza', 'estudiante', true")).toEqual([{ answer: "ENSENANZA-ESTUDIANTE", fresh: true }]);
    });
  });

  it("la que cita un pasaje oculto o de otro espacio tampoco está fresca", async () => {
    await asAdmin(async (q) => {
      await q("update pilo_answers set refs = array['cifras:evaluacion'] where answer = 'ENSENANZA-ESTUDIANTE'");
      expect(await answers(q, "$1, 'ensenanza', 'estudiante'")).toEqual([{ answer: "ENSENANZA-ESTUDIANTE", fresh: false }]);
      await q("update pilo_answers set refs = array['doc:inn:1'] where answer = 'ENSENANZA-ESTUDIANTE'");
      expect(await answers(q, "$1, 'ensenanza', 'estudiante'")).toEqual([{ answer: "ENSENANZA-ESTUDIANTE", fresh: false }]);
      await q("update pilo_answers set refs = array['doc:pol:1'] where answer = 'PLANEACION'");
      expect(await answers(q, "$1")).toEqual([{ answer: "PLANEACION", fresh: false }]);
    });
  });
});

describe("el catálogo no se cruza", () => {
  it("lo activo, por espacio", async () => {
    await asAdmin(async (q) => {
      expect(keys(await q("select key from pilo_catalog_active()"))).toEqual(["R-001"]);
      expect(keys(await q("select key from pilo_catalog_active('planeacion')"))).toEqual(["R-001"]);
      const rows = await q<{ key: string; space: string; rol: string }>("select key, space, rol from pilo_catalog_active('ensenanza') order by key");
      expect(rows).toEqual([
        { key: "EC-001", space: "ensenanza", rol: "" },
        { key: "ER-001", space: "ensenanza", rol: "estudiante" },
      ]);
      expect(await q("select key from pilo_catalog_active('otro')")).toEqual([]);
    });
    expect(keys(await asService((q) => q("select key from pilo_catalog_active('ensenanza')")))).toEqual(["EC-001", "ER-001"]);
  });

  it("importar no pisa una clave del otro espacio, y la cuenta como rechazada", async () => {
    const [a] = await asAdmin(
      (q) => q<{ r: Record<string, unknown> }>("select pilo_catalog_import('respuesta', $1::jsonb, false, 'ensenanza') as r", [
        JSON.stringify([
          { key: "R-001", question: "¿Qué es el PDI?", answer: "PISADA DESDE ENSEÑANZA" },
          { key: "ER-002", question: "¿Qué es una rúbrica?", answer: "Una guía para valorar.", rol: "profesor" },
          { key: "ER-001", question: "¿Qué es la evaluación formativa?", answer: "La que acompaña el aprendizaje.", rol: "estudiante" },
        ]),
      ]),
      true,
    );
    expect(a.r).toMatchObject({ space: "ensenanza", added: 1, updated: 1, rejected: 1, rejected_keys: ["R-001"], total: 2 });

    const [b] = await asAdmin(
      (q) => q<{ r: Record<string, unknown> }>("select pilo_catalog_import('respuesta', $1::jsonb) as r", [
        JSON.stringify([{ key: "ER-001", question: "¿Qué es la evaluación formativa?", answer: "PISADA DESDE PLANEACIÓN" }]),
      ]),
      true,
    );
    expect(b.r).toMatchObject({ space: "planeacion", added: 0, updated: 0, rejected: 1, rejected_keys: ["ER-001"], total: 1 });

    const rows = await t.q<{ key: string; space: string; answer: string; rol: string }>("select key, space, answer, rol from pilo_catalog order by key");
    expect(rows).toEqual([
      { key: "EC-001", space: "ensenanza", answer: "No hago tareas.", rol: "" },
      { key: "ER-001", space: "ensenanza", answer: "La que acompaña el aprendizaje.", rol: "estudiante" },
      { key: "ER-002", space: "ensenanza", answer: "Una guía para valorar.", rol: "profesor" },
      { key: "R-001", space: "planeacion", answer: "El Plan de Desarrollo.", rol: "" },
    ]);
  });

  it("«reemplazar» borra solo lo de su espacio", async () => {
    await asAdmin(async (q) => {
      const [r] = await q<{ r: Record<string, unknown> }>("select pilo_catalog_import('respuesta', $1::jsonb, true, 'ensenanza') as r", [
        JSON.stringify([{ key: "ER-002", question: "¿Qué es una rúbrica?", answer: "Una guía para valorar." }]),
      ]);
      expect(r.r).toMatchObject({ updated: 1, removed: 1, total: 1 });
      expect(keys(await q("select key from pilo_catalog"))).toEqual(["EC-001", "ER-002", "R-001"]);
    });
    await asAdmin(async (q) => {
      const [r] = await q<{ r: Record<string, unknown> }>("select pilo_catalog_import('respuesta', '[]'::jsonb, true) as r");
      expect(r.r).toMatchObject({ removed: 1, total: 0 });
      expect(keys(await q("select key from pilo_catalog"))).toEqual(["EC-001", "ER-001", "ER-002"]);
    });
  });

  it("importar es de la administración y no acepta espacios desconocidos", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_catalog_import('respuesta', '[]'::jsonb, false, 'ensenanza')")))).toMatch(/Solo la administración/);
    expect(await errorOf(asAdmin((q) => q("select pilo_catalog_import('respuesta', '[]'::jsonb, false, 'otro')")))).toMatch(/Espacio desconocido/);
  });

  it("por significado: la más cercana y las cercanas son del espacio pedido", async () => {
    await asAdmin(async (q) => {
      expect(keys(await q("select key from pilo_catalog_semantic('v1', 'm')"))).toEqual(["R-001"]);
      expect(keys(await q("select key from pilo_catalog_semantic('v1', 'm', 0.8, 'ensenanza')"))).toEqual(["ER-001"]);
      expect(keys(await q("select key from pilo_catalog_near('v1', 'm')"))).toEqual(["R-001"]);
      expect(keys(await q("select key from pilo_catalog_near('v1', 'm', 20, 'ensenanza')"))).toEqual(["ER-001"]);
      expect(await q("select key from pilo_catalog_near('v1', 'm', 20, 'otro')")).toEqual([]);
    });
  });
});

describe("el índice de vectores va por espacio", () => {
  it("el estado cuenta lo de cada espacio; las cifras en vivo son solo de Planeación", async () => {
    await asAdmin(async (q) => {
      const [p] = await q<{ s: Record<string, number> }>("select pilo_embed_status('m') as s");
      expect(p.s).toMatchObject({ memory_total: 1, memory_done: 1, facts_total: 1, facts_done: 0, catalog_total: 1, catalog_done: 1 });
      const [e] = await q<{ s: Record<string, number> }>("select pilo_embed_status('m', 'ensenanza') as s");
      expect(e.s).toMatchObject({ memory_total: 3, memory_done: 3, facts_total: 0, facts_done: 0, catalog_total: 3, catalog_done: 1 });
    });
  });

  it("lo pendiente también", async () => {
    await asAdmin(async (q) => {
      const p = await q<{ kind: string; ref: string }>("select kind, ref from pilo_embed_pending('otro-modelo')");
      expect(p.map((r) => `${r.kind}:${r.ref}`).sort()).toEqual(["catalogo:R-001", "cifra:cifra:matriculados", "memoria:cifras:evaluacion"]);
      const e = await q<{ kind: string; ref: string }>("select kind, ref from pilo_embed_pending('otro-modelo', 64, 'ensenanza')");
      expect(e.map((r) => `${r.kind}:${r.ref}`).sort()).toEqual([
        "catalogo:EC-001", "catalogo:ER-001", "catalogo:ER-002",
        "memoria:doc:inn:1", "memoria:doc:moodle:1", "memoria:doc:pol:1",
      ]);
    });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_embed_status('m', 'ensenanza')")))).toMatch(/Solo la función/);
  });
});

describe("la malla no se cruza", () => {
  type Graph = { nodes: { id: string }[]; edges: { from: string; to: string }[] };
  const ids = (g: Graph) => g.nodes.map((n) => n.id).sort();

  it("alrededor de un nodo: no sale del espacio aunque una relación apunte afuera", async () => {
    await asAdmin(async (q) => {
      const [e] = await q<{ g: Graph }>("select pilo_graph_around(array['doc:pol:1'], null, 6, 3, 80, 'ensenanza') as g");
      expect(ids(e.g)).toEqual(["doc:pol:1", "fuente:politicas"]);
      expect(e.g.edges).toEqual([{ from: "fuente:politicas", to: "doc:pol:1", rel: "contiene" }]);

      const [p] = await q<{ g: Graph }>("select pilo_graph_around(array['pdi:pilar:p1']) as g");
      expect(ids(p.g)).toEqual(["fuente:pdi", "pdi:pilar:p1"]);
      expect(p.g.edges).toEqual([{ from: "fuente:pdi", to: "pdi:pilar:p1", rel: "contiene" }]);

      // Un id del otro espacio no encuentra nada.
      const [x] = await q<{ g: Graph }>("select pilo_graph_around(array['doc:pol:1']) as g");
      expect(x.g).toEqual({ nodes: [], edges: [] });
      const [y] = await q<{ g: Graph }>("select pilo_graph_around(array['pdi:pilar:p1'], null, 6, 1, 80, 'ensenanza') as g");
      expect(y.g).toEqual({ nodes: [], edges: [] });
    });
  });

  it("la malla completa, por espacio", async () => {
    await asAdmin(async (q) => {
      const [p] = await q<{ g: Graph }>("select pilo_graph_overview() as g");
      expect(ids(p.g)).toEqual(["fuente:pdi", "pdi:pilar:p1"]);
      expect(p.g.edges).toHaveLength(1);
      const [e] = await q<{ g: Graph }>("select pilo_graph_overview(null, 'ensenanza') as g");
      expect(ids(e.g)).toEqual(["doc:pol:1", "fuente:politicas"]);
      expect(e.g.edges).toHaveLength(2);
      const [x] = await q<{ g: Graph }>("select pilo_graph_overview(array['politicas', 'mapa']) as g");
      expect(x.g).toEqual({ nodes: [], edges: [] });
    });
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_graph_overview(null, 'ensenanza')")))).toMatch(/Solo la administración/);
  });
});

describe("la bandeja va por espacio", () => {
  it("la misma pregunta pendiente es una por espacio, y guarda para quién era", async () => {
    await asAdmin(async (q) => {
      await q("select pilo_inbox_add('¿Qué es una rúbrica?', 'que es una rubrica', 'sin_respuesta')");
      await q("select pilo_inbox_add('¿Qué es una rúbrica?', 'que es una rubrica', 'sin_respuesta', 'nada', '', null, 'ensenanza', 'estudiante')");
      await q("select pilo_inbox_add('¿Qué es una rúbrica?', 'que es una rubrica', 'sin_respuesta', 'nada', '', null, 'ensenanza', 'profesor')");
      await q("select pilo_inbox_add('¿Qué es una rúbrica?', 'que es una rubrica', 'sin_respuesta', 'nada', '', null, 'ensenanza', 'general')");
    }, true);
    const rows = await t.q<{ space: string; rol: string; times: number }>("select space, rol, times from pilo_inbox where qnorm = 'que es una rubrica' order by space");
    expect(rows).toEqual([
      { space: "ensenanza", rol: "", times: 3 },
      { space: "planeacion", rol: "", times: 1 },
    ]);
    expect(await errorOf(asAdmin((q) => q("select pilo_inbox_add('¿Otra cosa?', 'otra cosa', 'sin_respuesta', '', '', null, 'otro')")))).toMatch(/pilo_inbox_space/);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_inbox_add('¿Otra cosa?', 'otra cosa', 'sin_respuesta', '', '', null, 'ensenanza')")))).toMatch(/Solo la función/);
  });

  it("el índice de pendientes incluye el espacio", async () => {
    const [i] = await t.q<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'pilo_inbox_pending_idx'");
    expect(i.indexdef).toMatch(/UNIQUE/);
    expect(i.indexdef).toContain("(space, qnorm, reason)");
  });
});

describe("el uso de hoy", () => {
  beforeAll(async () => {
    await t.q(`insert into pilo_ai_log (portal, action, subject, status, cached, space, rol) values
      ('ensenanza', 'preguntar', 'a', 'listo', false, 'ensenanza', 'estudiante'),
      ('ensenanza', 'preguntar', 'b', 'listo', false, 'ensenanza', 'estudiante'),
      ('ensenanza', 'preguntar', 'c', 'listo', false, 'ensenanza', 'profesor'),
      ('ensenanza', 'preguntar', 'd', 'listo', false, 'ensenanza', ''),
      ('ensenanza', 'preguntar', 'e', 'listo · guardada', true, 'ensenanza', 'profesor'),
      ('ensenanza', 'comprender', 'f', 'listo', false, 'ensenanza', ''),
      ('ensenanza', 'voz', 'g', 'listo', false, 'ensenanza', 'profesor'),
      ('ensenanza', 'preguntar', 'h', 'listo', false, 'ensenanza', 'estudiante')`);
    await t.q("update pilo_ai_log set created_at = now() - interval '2 days' where subject = 'h'");
    await t.q(`insert into pilo_ai_log (portal, action, subject, status, cached) values
      ('pregunta', 'preguntar', 'p1', 'listo', false),
      ('cifras', 'resumir', 'p2', 'listo', false),
      ('pregunta', 'voz', 'p3', 'listo', false)`);
  });

  it("pilo_space_usage reparte el uso de Enseñanza por rol, con su propio cupo", async () => {
    await t.q("update pilo_spaces set daily_limit = 321 where id = 'ensenanza'");
    const [u] = await asAdmin((q) => q<{ u: Record<string, unknown> }>("select pilo_space_usage('ensenanza') as u"));
    expect(u.u).toEqual({ space: "ensenanza", today: 4, limit: 321, by_rol: { estudiante: 2, profesor: 1, "": 1 }, today_voice: 1 });
    await t.q("update pilo_spaces set daily_limit = 200 where id = 'ensenanza'");
  });

  it("el de Planeación no cuenta lo de Enseñanza, ni en pilo_space_usage ni en pilo_ai_key_status", async () => {
    const [u] = await asAdmin((q) => q<{ u: Record<string, unknown> }>("select pilo_space_usage('planeacion') as u"));
    expect(u.u).toEqual({ space: "planeacion", today: 2, limit: 200, by_rol: { estudiante: 0, profesor: 0, "": 2 }, today_voice: 1 });
    const [s] = await asAdmin((q) => q<{ s: { today: number; today_voice: number } }>("select pilo_ai_key_status() as s"));
    expect(s.s).toMatchObject({ today: 2, today_voice: 1 });
  });

  it("solo la administración lo ve, y el espacio tiene que existir", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_space_usage('ensenanza')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_space_usage('ensenanza')")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("select pilo_space_usage('otro')")))).toMatch(/Espacio desconocido/);
  });
});

describe("pilo_spaces", () => {
  it("nace con Enseñanza apagada y solo para la administración", async () => {
    const [s] = await t.q<Record<string, unknown>>(
      `select id, "on", aud, ai, welcome, intro, ask_rol, memory_sources, daily_limit, visitor_limit, visitor_window_seconds, widget_on, widget_origins, roles
       from pilo_spaces`,
    );
    expect(s).toEqual({
      id: "ensenanza", on: false, aud: "admin", ai: true, welcome: true,
      intro: "la Inteligencia Artificial de la Universidad de Santander", ask_rol: true,
      memory_sources: { innovacion: true, politicas: true, global: true, moodle: true },
      daily_limit: 200, visitor_limit: 20, visitor_window_seconds: 600, widget_on: false, widget_origins: [],
      roles: {
        estudiante: { tone: "", suggestions: [], voice_style: "", expression: "feliz", mood: "emocionado" },
        profesor: { tone: "", suggestions: [], voice_style: "", expression: "graduado", mood: "atento" },
      },
    });
  });

  it("solo la administración la lee y la cambia", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_spaces")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select * from pilo_spaces"))).toEqual([]);
    expect(await t.asUser(PEOPLE.director, (q) => q("select * from pilo_spaces"))).toEqual([]);
    expect(await t.asUser(PEOPLE.vx, (q) => q(`update pilo_spaces set "on" = true returning id`))).toEqual([]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("insert into pilo_spaces (id) values ('otro')")))).toMatch(/permission denied|row-level security/);
    expect(await asAdmin((q) => q("select id from pilo_spaces"))).toEqual([{ id: "ensenanza" }]);
    expect(await asAdmin((q) => q(`update pilo_spaces set greeting = 'Hola' where id = 'ensenanza' returning greeting`))).toEqual([{ greeting: "Hola" }]);
  });

  it("no acepta un id raro, «planeacion», una audiencia desconocida ni textos largos", async () => {
    expect(await errorOf(t.q("insert into pilo_spaces (id) values ('planeacion')"))).toMatch(/pilo_spaces_id/);
    expect(await errorOf(t.q("insert into pilo_spaces (id) values ('Otro-1')"))).toMatch(/pilo_spaces_id/);
    expect(await errorOf(t.q("update pilo_spaces set aud = 'todos'"))).toMatch(/pilo_spaces_aud/);
    expect(await errorOf(t.q("update pilo_spaces set focus = repeat('x', 601)"))).toMatch(/pilo_spaces_len/);
    expect(await errorOf(t.q("update pilo_spaces set intro = repeat('x', 301)"))).toMatch(/pilo_spaces_len/);
    expect(await errorOf(t.q("update pilo_spaces set visitor_window_seconds = 1"))).toMatch(/pilo_spaces_limits/);
    expect(await errorOf(t.q("update pilo_spaces set widget_origins = array(select 'https://a' || g from generate_series(1, 51) g)"))).toMatch(/pilo_spaces_widget/);
  });
});

describe("la configuración pública", () => {
  it("expone «spaces» sin el enfoque, el tono, el estilo de voz, la presentación ni los cupos", async () => {
    await t.q(
      `update pilo_spaces set
         name = 'Pilo Enseñanza', greeting = 'Hola, soy Pilo.', focus = 'ENFOQUE-SECRETO', intro = 'INTRO-SECRETA',
         daily_limit = 4321, visitor_limit = 987, visitor_window_seconds = 54321,
         widget_on = true, widget_origins = array['https://www.udes.edu.co'],
         roles = $1::jsonb
       where id = 'ensenanza'`,
      [JSON.stringify({
        estudiante: { tone: "TONO-SECRETO", suggestions: ["¿Qué es una rúbrica?"], voice_style: "ESTILO-SECRETO", expression: "feliz", mood: "emocionado" },
        profesor: { tone: "TONO-SECRETO", suggestions: [], voice_style: "ESTILO-SECRETO", expression: "graduado", mood: "atento" },
      })],
    );
    // La lee cualquiera, también sin sesión.
    const [c] = await t.asUser(null, (q) => q<{ c: Record<string, unknown> }>("select pilo_ai_public_config() as c"));
    expect(c.c.spaces).toEqual({
      ensenanza: {
        on: false, aud: "admin", welcome: true, ai: false, name: "Pilo Enseñanza", greeting: "Hola, soy Pilo.", ask_rol: true,
        roles: {
          estudiante: { suggestions: ["¿Qué es una rúbrica?"], expression: "feliz", mood: "emocionado" },
          profesor: { suggestions: [], expression: "graduado", mood: "atento" },
        },
        sources: { innovacion: true, politicas: true, global: true, moodle: true },
        widget: { on: true, origins: ["https://www.udes.edu.co"] },
      },
    });
    const text = JSON.stringify(c.c.spaces);
    for (const secret of ["SECRETO", "SECRETA", "focus", "tone", "voice_style", "intro", "limit", "4321", "987", "54321", "moodle_"]) {
      expect(text, secret).not.toContain(secret);
    }
    // Lo de siempre sigue ahí.
    expect(c.c).toHaveProperty("pregunta");
    expect(c.c).toHaveProperty("widget");
    expect(c.c).toHaveProperty("portals");
  });

  it("aguanta una ficha de roles incompleta", async () => {
    await t.q("update pilo_spaces set roles = '{}'::jsonb where id = 'ensenanza'");
    const [c] = await t.q<{ c: { spaces: { ensenanza: { roles: unknown } } } }>("select pilo_ai_public_config() as c");
    expect(c.c.spaces.ensenanza.roles).toEqual({
      estudiante: { suggestions: [], expression: "feliz", mood: "emocionado" },
      profesor: { suggestions: [], expression: "graduado", mood: "atento" },
    });
  });
});

describe("la migración es idempotente", () => {
  it("aplicarla dos veces no falla ni cambia nada", async () => {
    const snapshot = () =>
      t.q(`select
        (select count(*)::int from pilo_memory) as memory,
        (select count(*)::int from pilo_memory where space = 'ensenanza') as memory_e,
        (select count(*)::int from pilo_answers) as answers,
        (select count(*)::int from pilo_catalog) as catalog,
        (select count(*)::int from pilo_inbox) as inbox,
        (select count(*)::int from pilo_nodes) as nodes,
        (select count(*)::int from pilo_edges) as edges,
        (select count(*)::int from pilo_ai_log) as log,
        (select jsonb_agg(to_jsonb(sp) order by sp.id) from pilo_spaces sp) as spaces,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_indexes where schemaname = 'public' and indexname like 'pilo\\_%') as indexes`);
    const before = await snapshot();
    // 0113 y, encima, 0121: aplicar 0113 sola después de 0121 devolvería los CHECK y las firmas viejas;
    // 0121 los vuelve a quitar. La cadena, dos veces, deja todo como estaba.
    const sql = readFileSync(MIGRATION, "utf8") + ";\n" + readFileSync(resolve(__dirname, "../../supabase/migrations/0121_pilo_portales.sql"), "utf8") + ";\n" + readFileSync(resolve(__dirname, "../../supabase/migrations/0122_pilo_puentes.sql"), "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);

    await asAdmin(async (q) => {
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa')"))).toEqual(["cifras:evaluacion"]);
      expect(refs(await q("select ref from pilo_memory_search('evaluación formativa', null, 20, 'ensenanza', true)"))).toEqual(["doc:pol:1"]);
    });
    // Los permisos quedan como estaban: el público no ejecuta nada de esto.
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_catalog_active('ensenanza')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_embed_status('m', 'ensenanza')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_graph_around(array['doc:pol:1'], null, 6, 1, 80, 'ensenanza')")))).toMatch(/permission denied/);
  });
});
