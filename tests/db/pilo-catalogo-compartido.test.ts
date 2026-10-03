/* =============================================================================
   Mr. Pilo · el catálogo compartido y dentro de la memoria (0126).

     · «Para todos los Pilos»: una entrada compartida sirve en los dos; una
       para un rol no se comparte; solo la administración comparte.
     · Cada respuesta activa y sin rol es un pasaje y un punto de la malla; las
       capciosas, las inactivas, las de un rol y las borradas no dejan nada.
     · Nace apagada: ningún portal la lee hasta que su celda diga «de visita».
     · Entra en los puentes: por reglas (la misma norma), como destino de los que
       propone la IA, y un puente aprobado trae la respuesta del otro Pilo.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = true) => t.asUser(PEOPLE.admin, work, { commit });
const importAnswers = (rows: Record<string, unknown>[], space?: string) =>
  asAdmin((q) => (space ? q("select pilo_catalog_import('respuesta', $1::jsonb, false, $2)", [JSON.stringify(rows), space]) : q("select pilo_catalog_import('respuesta', $1::jsonb)", [JSON.stringify(rows)])));
const memory = (where = "true") => t.q<{ ref: string; source: string; space: string; title: string; section: string; vis: string; body: string }>(`select ref, source, space, title, section, vis, body from pilo_memory where ref like 'catalogo:%' and ${where} order by ref`);
const nodes = () => t.q<{ id: string; source: string; space: string; type: string; label: string }>("select id, source, space, type, label from pilo_nodes where id like 'catalogo:%' order by id");
const keys = async (fn: string, args: unknown[] = []) => (await asAdmin((q) => q<{ key: string }>(`select key from ${fn}`, args), false)).map((r) => r.key);

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.db.exec(`
    create domain extensions.vector as text;
    create function extensions.pilo_test_distance(text, text) returns double precision
      language sql immutable as $$ select case when $1 = $2 then 0::double precision else 1::double precision end $$;
    create operator extensions.<=> (leftarg = text, rightarg = text, function = extensions.pilo_test_distance);
    alter table public.pilo_memory add column if not exists embedding extensions.vector;
    alter table public.pilo_facts add column if not exists embedding extensions.vector;
    alter table public.pilo_catalog_vectors add column if not exists embedding extensions.vector;
  `);
}, 120_000);

afterAll(() => t?.close());

describe("la respuesta oficial es un pasaje y un punto de la malla", () => {
  it("una respuesta activa y sin rol entra con su fuente, pública y con su título", async () => {
    await importAnswers([
      { key: "R-100", question: "¿Qué dice la Ley 30 de 1992?", answer: "Organiza el servicio público de la educación superior.", source_title: "Normativa", source_path: "/normativa" },
      { key: "R-101", question: "¿Qué es el PDI?", answer: "El Plan de Desarrollo Institucional.", active: false },
    ]);
    await importAnswers(
      [
        { key: "ER-100", question: "¿Cómo aplico la Ley 30 de 1992 en el aula?", answer: "Con la autonomía universitaria que la ley reconoce." },
        { key: "ER-101", question: "¿Cómo evalúo a mis estudiantes?", answer: "Con evaluación formativa.", rol: "profesor" },
      ],
      "ensenanza",
    );
    expect(await memory()).toEqual([
      { ref: "catalogo:ER-100", source: "respuestasens", space: "ensenanza", title: "¿Cómo aplico la Ley 30 de 1992 en el aula?", section: "Respuesta oficial", vis: "publico", body: "Con la autonomía universitaria que la ley reconoce." },
      { ref: "catalogo:R-100", source: "respuestasplan", space: "planeacion", title: "¿Qué dice la Ley 30 de 1992?", section: "Respuesta oficial", vis: "publico", body: "Organiza el servicio público de la educación superior." },
    ]);
    expect(await nodes()).toEqual([
      { id: "catalogo:ER-100", source: "respuestasens", space: "ensenanza", type: "respuesta", label: "¿Cómo aplico la Ley 30 de 1992 en el aula?" },
      { id: "catalogo:R-100", source: "respuestasplan", space: "planeacion", type: "respuesta", label: "¿Qué dice la Ley 30 de 1992?" },
    ]);
  });

  it("las capciosas, las inactivas y las de un rol no dejan nada", async () => {
    await asAdmin((q) => q("select pilo_catalog_import('capciosa', $1::jsonb)", [JSON.stringify([{ key: "C-100", triggers: ["salario"], answer: "No hablo de plata." }])]));
    expect(await t.q("select ref from pilo_memory where ref in ('catalogo:C-100', 'catalogo:R-101', 'catalogo:ER-101')")).toEqual([]);
    expect(await t.q("select id from pilo_nodes where id in ('catalogo:C-100', 'catalogo:R-101', 'catalogo:ER-101')")).toEqual([]);
  });

  it("las dos fuentes nacen con su primera respuesta, en el catálogo de fuentes y apagadas en la matriz", async () => {
    expect(await t.q("select id, scope, kind, stays_home, staff_only from pilo_sources where kind = 'catalogo' order by id")).toEqual([
      { id: "respuestasens", scope: "ensenanza", kind: "catalogo", stays_home: false, staff_only: false },
      { id: "respuestasplan", scope: "planeacion", kind: "catalogo", stays_home: false, staff_only: false },
    ]);
    for (const portal of ["planeacion", "ensenanza"]) {
      const m = (await t.q<{ matrix: Record<string, string> }>("select matrix from pilo_portals where id = $1", [portal]))[0].matrix;
      expect(m.respuestasplan ?? "no").toBe("no");
      expect(m.respuestasens ?? "no").toBe("no");
      const seen = await asAdmin((q) => q<{ source: string }>("select source from pilo_scope($1, true, false)", [portal]), false);
      expect(seen.map((r) => r.source)).not.toContain("respuestasplan");
      expect(seen.map((r) => r.source)).not.toContain("respuestasens");
    }
  });

  it("no se pueden subir documentos a una fuente del catálogo", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    expect(
      await errorOf(
        asAdmin((q) => q("select pilo_doc_save('ensenanza', $1::jsonb)", [JSON.stringify({ id, kind: "pdf", source: "respuestasens", title: "X", file_path: `ensenanza/${id}/x.pdf`, file_name: "x.pdf", file_hash: "h-x" })]), false),
      ),
    ).toMatch(/no recibe documentos/);
  });

  it("cambiar la respuesta cambia el pasaje y su fecha; servir la entrada (hits) no toca nada", async () => {
    const before = (await t.q<{ updated_at: Date }>("select updated_at from pilo_memory where ref = 'catalogo:R-100'"))[0].updated_at;
    await t.q("select pg_sleep(0.01)");
    await asAdmin((q) => q("select pilo_catalog_hit('R-100')"));
    expect((await t.q<{ updated_at: Date }>("select updated_at from pilo_memory where ref = 'catalogo:R-100'"))[0].updated_at).toEqual(before);

    await importAnswers([{ key: "R-100", question: "¿Qué dice la Ley 30 de 1992?", answer: "Organiza la educación superior en Colombia.", source_title: "Normativa", source_path: "/normativa" }]);
    const [row] = await memory("ref = 'catalogo:R-100'");
    expect(row.body).toBe("Organiza la educación superior en Colombia.");
    expect((await t.q<{ updated_at: Date }>("select updated_at from pilo_memory where ref = 'catalogo:R-100'"))[0].updated_at.getTime()).toBeGreaterThan(before.getTime());
  });

  it("apagar la entrada, o borrarla, la saca de la memoria, de la malla y de los puentes", async () => {
    await importAnswers([{ key: "R-200", question: "¿Qué es el SNIES?", answer: "El Sistema Nacional de Información de la Educación Superior." }]);
    expect(await memory("ref = 'catalogo:R-200'")).toHaveLength(1);
    await t.q("insert into pilo_bridges (a_scope, a_id, b_scope, b_id, kind, why, origin, status) values ('ensenanza', 'catalogo:ER-100', 'planeacion', 'catalogo:R-200', 'relacion', 'prueba de puente', 'ia', 'propuesta')");
    expect(await t.q("select id from pilo_bridges where b_id = 'catalogo:R-200'")).toHaveLength(1);

    await asAdmin((q) => q("update pilo_catalog set active = false where key = 'R-200'"));
    expect(await memory("ref = 'catalogo:R-200'")).toEqual([]);
    expect(await t.q("select id from pilo_nodes where id = 'catalogo:R-200'")).toEqual([]);
    await asAdmin((q) => q("update pilo_catalog set active = true where key = 'R-200'"));
    expect(await memory("ref = 'catalogo:R-200'")).toHaveLength(1);

    await asAdmin((q) => q("delete from pilo_catalog where key = 'R-200'"));
    expect(await memory("ref = 'catalogo:R-200'")).toEqual([]);
    expect(await t.q("select id from pilo_bridges where a_id = 'catalogo:R-200' or b_id = 'catalogo:R-200'")).toEqual([]);
  });

  it("si la entrada cambia de rol, deja de ser un pasaje", async () => {
    await asAdmin((q) => q("update pilo_catalog set rol = 'profesor' where key = 'ER-100'"));
    expect(await memory("ref = 'catalogo:ER-100'")).toEqual([]);
    await asAdmin((q) => q("update pilo_catalog set rol = '' where key = 'ER-100'"));
    expect(await memory("ref = 'catalogo:ER-100'")).toHaveLength(1);
  });
});

describe("para todos los Pilos", () => {
  it("una entrada compartida sirve en el otro Pilo; las demás, no", async () => {
    // (El filtro por rol de las entradas de Enseñanza lo hace la función del servidor.)
    expect(await keys("pilo_catalog_active('ensenanza')")).toEqual(["ER-100", "ER-101"]);
    expect(await keys("pilo_catalog_active('planeacion')")).toEqual(["C-100", "R-100"]);

    const [r] = await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_catalog_share('R-100', true) as r"));
    expect(r.r).toEqual({ key: "R-100", space: "planeacion", shared: true });
    expect(await keys("pilo_catalog_active('ensenanza')")).toEqual(["ER-100", "ER-101", "R-100"]);
    expect(await keys("pilo_catalog_active('planeacion')")).toEqual(["C-100", "R-100"]);

    await asAdmin((q) => q("select pilo_catalog_share('R-100', false)"));
    expect(await keys("pilo_catalog_active('ensenanza')")).toEqual(["ER-100", "ER-101"]);
  });

  it("también por significado", async () => {
    await t.q("insert into pilo_catalog_vectors (key, embedding, embed_model, embedded_at) values ('R-100', 'v1', 'm', now() + interval '1 minute') on conflict (key) do update set embedding = excluded.embedding, embed_model = excluded.embed_model, embedded_at = excluded.embedded_at");
    expect(await keys("pilo_catalog_semantic('v1', 'm', 0.8, 'ensenanza')")).toEqual([]);
    await asAdmin((q) => q("select pilo_catalog_share('R-100', true)"));
    expect(await keys("pilo_catalog_semantic('v1', 'm', 0.8, 'ensenanza')")).toEqual(["R-100"]);
    expect(await keys("pilo_catalog_near('v1', 'm', 5, 'ensenanza')")).toEqual(["R-100"]);
    expect(await keys("pilo_catalog_semantic('v1', 'm', 0.8, 'planeacion')")).toEqual(["R-100"]);
    await asAdmin((q) => q("select pilo_catalog_share('R-100', false)"));
  });

  it("solo la administración comparte, y no las entradas de un rol", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_catalog_share('R-100', true)")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_catalog_share('R-100', true)")))).toMatch(/permission denied/);
    await importAnswers([{ key: "ER-300", question: "¿Cómo planeo una clase?", answer: "Con objetivos claros.", rol: "profesor" }], "ensenanza");
    expect(await errorOf(asAdmin((q) => q("select pilo_catalog_share('ER-300', true)"), false))).toMatch(/solo para un rol/);
    expect(await errorOf(asAdmin((q) => q("select pilo_catalog_share('NOHAY', true)"), false))).toMatch(/no existe/);
    expect(await errorOf(asAdmin((q) => q("update pilo_catalog set shared = true where key = 'ER-300'"), false))).toMatch(/pilo_catalog_shared/);
  });
});

describe("el catálogo entra en los puentes y en la lectura de visita", () => {
  it("«de visita» el otro Pilo lee la respuesta oficial, por palabras, solo cuando la celda lo dice", async () => {
    const visit = (portal: string) => asAdmin((q) => q<{ ref: string; source_name: string }>("select ref, source_name from pilo_memory_visit('organiza educación superior', 4, $1, true, false)", [portal]), false);
    expect(await visit("ensenanza")).toEqual([]);
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { respuestasplan: "visita" } })]));
    expect(await visit("ensenanza")).toEqual([{ ref: "catalogo:R-100", source_name: "Respuestas oficiales de Planeación" }]);
    // Y Planeación no lee la de Enseñanza: su celda sigue en «no».
    expect(await asAdmin((q) => q("select ref from pilo_memory_visit('autonomía universitaria ley', 4, 'planeacion', true, false)"), false)).toEqual([]);
  });

  it("las reglas unen las dos respuestas que nombran la misma norma", async () => {
    await asAdmin((q) => q("select pilo_bridges_sync()"));
    const [b] = await t.q<{ a_id: string; b_id: string; kind: string; status: string; origin: string; why: string }>(
      "select a_id, b_id, kind, status, origin, why from pilo_bridges where a_id like 'catalogo:%' or b_id like 'catalogo:%'",
    );
    expect(b).toMatchObject({ a_id: "catalogo:ER-100", b_id: "catalogo:R-100", kind: "referencia", status: "aprobada", origin: "reglas" });
    expect(b.why).toMatch(/Ley 30/);
  });

  it("un puente aprobado trae la respuesta del otro Pilo desde un pasaje de casa", async () => {
    // Enseñanza lee de casa su propia respuesta (ER-100) y, de visita, la de Planeación.
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { respuestasens: "casa" } })]));
    const near = await asAdmin((q) => q<{ ref: string; source: string; space: string; why: string }>("select ref, source, space, why from pilo_bridge_neighbors(array['catalogo:ER-100'], 'ensenanza', true, false, 2)"), false);
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ ref: "catalogo:R-100", source: "respuestasplan", space: "planeacion" });
    // Con la celda de visita en «no», el puente no trae nada.
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { respuestasplan: "no" } })]));
    expect(await asAdmin((q) => q("select ref from pilo_bridge_neighbors(array['catalogo:ER-100'], 'ensenanza', true, false, 2)"), false)).toEqual([]);
  });

  it("la IA compara cada punto de Planeación con las respuestas oficiales de Enseñanza", async () => {
    const targets = await asAdmin((q) => q<{ scope: string; id: string; type: string }>("select scope, id, type from pilo_bridge_targets('planeacion', 60)"), false);
    expect(targets).toContainEqual({ scope: "ensenanza", id: "catalogo:ER-100", type: "respuesta" });
    expect(targets.some((r) => r.id === "catalogo:R-100")).toBe(false);
    const candidates = await asAdmin((q) => q<{ id: string }>("select id from pilo_bridge_candidates('planeacion', 40)"), false);
    expect(candidates.map((r) => r.id)).toContain("catalogo:R-100");
    // Y lo propuesto con esos puntos pasa la revisión de extremos.
    const [ok] = await t.q<{ ok: boolean }>("select pilo_bridge_end_ok('ensenanza', 'catalogo:ER-100') and pilo_bridge_end_ok('planeacion', 'catalogo:R-100') as ok");
    expect(ok.ok).toBe(true);
  });
});

describe("la migración", () => {
  it("se puede aplicar otra vez sin cambiar nada", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const snapshot = () =>
      t.q(`select (select count(*)::int from pilo_memory) as memory, (select count(*)::int from pilo_nodes) as nodes,
                  (select count(*)::int from pilo_sources) as sources, (select count(*)::int from pilo_catalog) as catalog,
                  (select count(*)::int from pilo_bridges) as bridges`);
    const before = await snapshot();
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/0126_pilo_catalogo_compartido.sql"), "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
  });
});
