/* =============================================================================
   Mr. Pilo en Enseñanza: los documentos de la memoria (0114).

   Un documento es una ficha (pilo_docs) y sus pasajes (pilo_memory.doc_id).
   Aquí se prueba que reemplazar los pasajes solo le cambia la fecha al que
   cambió, que borrar el documento se lleva todo lo suyo, que la visibilidad
   baja a los pasajes y que un documento nunca escribe en otro espacio.

   Este Postgres de pruebas no trae pgvector: se pone el mismo doble mínimo de
   pilo-espacios.test.ts para poder llamar a pilo_embed_pending.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0114_pilo_documentos.sql");

const FUNCTIONS = ["pilo_doc_save", "pilo_doc_replace", "pilo_doc_update", "pilo_doc_delete", "pilo_map_prune"];

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(work: (q: Query) => Promise<T>, commit = false): Promise<T> {
  await t.db.exec("begin");
  let ok = false;
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    const result = await work(t.q);
    ok = true;
    return result;
  } finally {
    await t.db.exec(ok && commit ? "commit" : "rollback");
  }
}

type Passage = { seq: number; title?: string; section?: string; body: string; path?: string; cut?: string };

const save = async (doc: Record<string, unknown>, space = "ensenanza") =>
  (await asAdmin((q) => q<{ id: string }>("select pilo_doc_save($1, $2::jsonb) as id", [space, JSON.stringify(doc)]), true))[0].id;

const replace = async (id: string, rows: unknown[]) =>
  (await asAdmin((q) => q<{ r: Record<string, number> }>("select pilo_doc_replace($1, $2::jsonb) as r", [id, JSON.stringify(rows)]), true))[0].r;

const update = async (id: string, patch: Record<string, unknown>) =>
  (await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_doc_update($1, $2::jsonb) as r", [id, JSON.stringify(patch)]), true))[0].r;

const passages = (id: string) =>
  t.q<{ ref: string; space: string; source: string; vis: string; title: string; body: string; updated_at: Date }>(
    "select ref, space, source, vis, title, body, updated_at from pilo_memory where doc_id = $1 order by length(ref), ref",
    [id],
  );

const P = (seq: number, body: string, extra: Partial<Passage> = {}): Passage => ({ seq, section: `Capítulo ${seq}`, body, ...extra });

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
  await t.db.exec(`
    create domain extensions.vector as text;
    create function extensions.pilo_test_distance(text, text) returns double precision
      language sql immutable as $$ select case when $1 = $2 then 0::double precision else 1::double precision end $$;
    create operator extensions.<=> (leftarg = text, rightarg = text, function = extensions.pilo_test_distance);
    alter table public.pilo_memory add column if not exists embedding extensions.vector;
    alter table public.pilo_facts add column if not exists embedding extensions.vector;
    alter table public.pilo_catalog_vectors add column if not exists embedding extensions.vector;
  `);
  await t.q("insert into pilo_memory (ref, source, title, body) values ('pdi:pilar:p1', 'pdi', 'Pilar 1', 'Un pasaje del Plan de Desarrollo de siempre.')");
}, 120_000);

afterAll(() => t?.close());

describe("el bucket pilo-docs", () => {
  it("es privado, de 25 MB y solo para docx, xlsx, csv y pdf", async () => {
    const [b] = await t.q<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'pilo-docs'",
    );
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(25 * 1024 * 1024);
    expect(b.allowed_mime_types).toContain("application/pdf");
    expect(b.allowed_mime_types).toContain("text/csv");
    expect(b.allowed_mime_types.some((m) => m.startsWith("audio/") || m.startsWith("image/"))).toBe(false);
  });

  it("solo la administración sube, lee, cambia y borra", async () => {
    const insert = "insert into storage.objects (bucket_id, name) values ('pilo-docs', 'ensenanza/doc/politica.pdf') returning name";
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q(insert)))).toMatch(/row-level security/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q(insert)))).toMatch(/row-level security/);
    expect(await errorOf(t.asUser(null, (q) => q(insert)))).toMatch(/permission denied/);
    expect(await asAdmin((q) => q(insert), true)).toEqual([{ name: "ensenanza/doc/politica.pdf" }]);

    const read = "select name from storage.objects where bucket_id = 'pilo-docs'";
    expect(await t.asUser(PEOPLE.director, (q) => q(read))).toEqual([]);
    expect(await asAdmin((q) => q(read))).toHaveLength(1);
    expect(await t.asUser(PEOPLE.director, (q) => q("update storage.objects set name = 'x' where bucket_id = 'pilo-docs' returning name"))).toEqual([]);
    expect(await t.asUser(PEOPLE.director, (q) => q("delete from storage.objects where bucket_id = 'pilo-docs' returning name"))).toEqual([]);
    expect(await asAdmin((q) => q("delete from storage.objects where bucket_id = 'pilo-docs' returning name"), true)).toHaveLength(1);
  });
});

describe("guardar la ficha", () => {
  it("crea el documento con sus valores de partida", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const got = await save({
      id, kind: "pdf", source: "politicas", title: "Política de evaluación",
      file_path: `ensenanza/${id}/politica.pdf`, file_name: "politica.pdf", file_size: 1234, file_hash: "hash-a", pages: 12,
    });
    expect(got).toBe(id);
    const [d] = await t.q<Record<string, unknown>>(
      "select space, origin, kind, source, title, vis, active, status, pages, passages, created_by from pilo_docs where id = $1", [id],
    );
    expect(d).toEqual({
      space: "ensenanza", origin: "archivo", kind: "pdf", source: "politicas", title: "Política de evaluación",
      vis: "sesion", active: true, status: "leido", pages: 12, passages: 0, created_by: PEOPLE.admin,
    });
  });

  it("el mismo archivo no entra dos veces: devuelve el que ya estaba y no le cambia la ruta", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const got = await save({
      id: other, kind: "pdf", source: "politicas", title: "Política de evaluación (otra vez)",
      file_path: `ensenanza/${other}/politica.pdf`, file_name: "copia.pdf", file_hash: "hash-a",
    });
    expect(got).toBe("11111111-1111-4111-8111-111111111111");
    const docs = await t.q<{ id: string; title: string; file_name: string; file_path: string }>("select id, title, file_name, file_path from pilo_docs");
    expect(docs).toEqual([{
      id: "11111111-1111-4111-8111-111111111111", title: "Política de evaluación (otra vez)",
      file_name: "politica.pdf", file_path: "ensenanza/11111111-1111-4111-8111-111111111111/politica.pdf",
    }]);
    await update(got, { title: "Política de evaluación" });
  });

  it("no acepta un espacio, una clase, una colección ni una ruta que no sean suyas", async () => {
    const doc = { kind: "pdf", source: "politicas", title: "Otro" };
    expect(await errorOf(save(doc, "planeacion"))).toMatch(/Espacio desconocido/);
    expect(await errorOf(save(doc, "otro"))).toMatch(/Espacio desconocido/);
    expect(await errorOf(save({ ...doc, source: "cifras" }))).toMatch(/pilo_docs_source/);
    expect(await errorOf(save({ ...doc, source: "moodle" }))).toMatch(/pilo_docs_moodle/);
    expect(await errorOf(save({ ...doc, kind: "exe" }))).toMatch(/pilo_docs_kind/);
    expect(await errorOf(save({ ...doc, title: "" }))).toMatch(/pilo_docs_len/);
    expect(await errorOf(save({ ...doc, vis: "oculto" }))).toMatch(/pilo_docs_vis/);
    expect(await errorOf(save({ ...doc, file_size: 26214401 }))).toMatch(/pilo_docs_numbers/);
    expect(await errorOf(save({ ...doc, id: "33333333-3333-4333-8333-333333333333", file_path: "planeacion/33333333-3333-4333-8333-333333333333/a.pdf" }))).toMatch(/pilo_docs_path/);
    expect(await errorOf(save({ ...doc, id: "33333333-3333-4333-8333-333333333333", file_path: "ensenanza/11111111-1111-4111-8111-111111111111/a.pdf" }))).toMatch(/pilo_docs_path/);
    expect(await t.q("select id from pilo_docs")).toHaveLength(1);
  });
});

describe("reemplazar los pasajes", () => {
  const DOC = "11111111-1111-4111-8111-111111111111";
  const QNORM = "que dice la politica de evaluacion";

  it("entran con el espacio, la colección y la visibilidad del documento, digan lo que digan las filas", async () => {
    const r = await replace(DOC, [
      { ...P(1, "La evaluación formativa acompaña el aprendizaje."), ref: "cifras:robado", space: "planeacion", source: "cifras", vis: "publico" },
      P(2, "La rúbrica describe los niveles de desempeño."),
      P(3, "El plan de mejora se entrega al final del periodo.", { title: "Plan de mejora" }),
      { seq: 4, body: "corto" },
      { seq: "x", body: "Una fila sin número de pasaje no entra." },
    ]);
    expect(r).toMatchObject({ added: 3, changed: 0, removed: 0, total: 3, skipped: 0 });
    const rows = await passages(DOC);
    expect(rows.map((p) => [p.ref, p.space, p.source, p.vis, p.title])).toEqual([
      [`doc:${DOC}:1`, "ensenanza", "politicas", "sesion", "Política de evaluación"],
      [`doc:${DOC}:2`, "ensenanza", "politicas", "sesion", "Política de evaluación"],
      [`doc:${DOC}:3`, "ensenanza", "politicas", "sesion", "Plan de mejora"],
    ]);
    const [d] = await t.q("select passages, status from pilo_docs where id = $1", [DOC]);
    expect(d).toEqual({ passages: 3, status: "en_pasajes" });
    expect(await t.q("select ref from pilo_memory where space = 'planeacion' order by ref")).toEqual([{ ref: "pdi:pilar:p1" }]);
  });

  it("solo el pasaje que cambió estrena fecha: los vectores, la marca del mapa y las respuestas de los demás siguen", async () => {
    // Hace un día se indexó y se comprendió todo; hace una hora se guardaron dos respuestas.
    await t.q(
      `update pilo_memory set updated_at = now() - interval '1 day', embedding = 'v1', embed_model = 'm',
         embedded_at = now() - interval '2 hours', mapped_at = now() - interval '2 hours' where doc_id = $1`, [DOC],
    );
    await t.q(
      `insert into pilo_answers (question, qnorm, kind, answer, refs, space, created_at) values
        ('¿Qué dice la política de evaluación?', $1, 'ia', 'CITA-1', array[$2], 'ensenanza', now() - interval '1 hour'),
        ('¿Qué dice la política de evaluación?', $1, 'ia', 'CITA-2', array[$3], 'ensenanza', now() - interval '1 hour')`,
      [QNORM, `doc:${DOC}:1`, `doc:${DOC}:2`],
    );
    const before = await passages(DOC);

    const r = await replace(DOC, [
      P(1, "La evaluación formativa acompaña el aprendizaje."),
      P(2, "La rúbrica describe los niveles de desempeño y sus criterios."),
      P(4, "La retroalimentación se da en los cinco días siguientes."),
    ]);
    expect(r).toMatchObject({ added: 1, changed: 1, removed: 1, total: 3 });

    const after = await passages(DOC);
    expect(after.map((p) => p.ref)).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`, `doc:${DOC}:4`]);
    expect(after[0].updated_at.getTime()).toBe(before[0].updated_at.getTime());
    expect(after[1].updated_at.getTime()).toBeGreaterThan(before[1].updated_at.getTime());

    await asAdmin(async (q) => {
      const pending = await q<{ kind: string; ref: string }>("select kind, ref from pilo_embed_pending('m', 64, 'ensenanza')");
      expect(pending.filter((p) => p.kind === "memoria").map((p) => p.ref).sort()).toEqual([`doc:${DOC}:2`, `doc:${DOC}:4`]);
      const [s] = await q<{ s: Record<string, number> }>("select pilo_embed_status('m', 'ensenanza') as s");
      expect(s.s).toMatchObject({ memory_total: 3, memory_done: 1 });
      const map = await q<{ ref: string }>("select ref from pilo_map_pending('ensenanza')");
      expect(map.map((p) => p.ref)).toEqual([`doc:${DOC}:2`, `doc:${DOC}:4`]);
      const answers = await q<{ answer: string; fresh: boolean }>("select answer, fresh from pilo_answer_candidates($1, 'ensenanza') order by answer", [QNORM]);
      expect(answers).toEqual([{ answer: "CITA-1", fresh: true }, { answer: "CITA-2", fresh: false }]);
      // El Pilo de siempre no ve nada de esto.
      expect(await q("select ref from pilo_embed_pending('m', 64) where ref like 'doc:%'")).toEqual([]);
    });
  });

  it("repetir lo mismo no cambia nada", async () => {
    const before = await passages(DOC);
    const r = await replace(DOC, [
      P(1, "La evaluación formativa acompaña el aprendizaje."),
      P(2, "La rúbrica describe los niveles de desempeño y sus criterios."),
      P(4, "La retroalimentación se da en los cinco días siguientes."),
    ]);
    expect(r).toMatchObject({ added: 0, changed: 0, removed: 0, total: 3 });
    expect((await passages(DOC)).map((p) => p.updated_at.getTime())).toEqual(before.map((p) => p.updated_at.getTime()));
  });

  it("corta en 400 pasajes y avisa cuántos quedaron fuera", async () => {
    const id = await save({ kind: "csv", source: "global", title: "Tabla larga", file_hash: "hash-largo" });
    const many = Array.from({ length: 403 }, (_, i) => P(i + 1, `Fila ${i + 1}: un valor cualquiera de la tabla.`));
    expect(await replace(id, many)).toMatchObject({ added: 400, total: 400, skipped: 3 });
    const [last] = await t.q<{ ref: string }>("select ref from pilo_memory where doc_id = $1 order by length(ref) desc, ref desc limit 1", [id]);
    expect(last.ref).toBe(`doc:${id}:400`);
    await asAdmin((q) => q("select pilo_doc_delete($1)", [id]), true);
  });
});

describe("un documento no escribe en otro espacio", () => {
  const DOC = "11111111-1111-4111-8111-111111111111";

  it("la llave del pasaje va con el espacio del documento", async () => {
    const cross = t.q(
      "insert into pilo_memory (ref, source, title, body, space, doc_id) values ('pdi:cruce', 'pdi', 'Cruce', 'Un pasaje de Planeación colgado de un documento.', 'planeacion', $1)", [DOC],
    );
    expect(await errorOf(cross)).toMatch(/pilo_memory_doc/);
    expect(await errorOf(t.q("update pilo_memory set doc_id = $1 where ref = 'pdi:pilar:p1'", [DOC]))).toMatch(/pilo_memory_doc/);
    expect(await errorOf(t.q("update pilo_memory set space = 'planeacion', source = 'pdi' where doc_id = $1", [DOC]))).toMatch(/pilo_memory_doc/);
    expect(await errorOf(t.q("update pilo_docs set space = 'planeacion' where id = $1", [DOC]))).toMatch(/pilo_docs_(path|space_fkey)|pilo_memory_doc/);
  });

  it("pilo_memory_replace de Planeación no puede quedarse con un pasaje de un documento", async () => {
    const steal = JSON.stringify([{ ref: `doc:${DOC}:1`, title: "Robado", body: "Un pasaje que era de un documento de Enseñanza." }]);
    expect(await errorOf(asAdmin((q) => q("select pilo_memory_replace('pdi', $1::jsonb)", [steal])))).toMatch(/pilo_memory_(source|doc)/);
    // Y rehacer una fuente de Planeación no borra pasajes de documentos.
    await asAdmin((q) => q("select pilo_memory_replace('pdi', $1::jsonb)", [JSON.stringify([{ ref: "pdi:pilar:p1", title: "Pilar 1", body: "Un pasaje del Plan de Desarrollo de siempre." }])]), true);
    expect(await passages(DOC)).toHaveLength(3);
  });

  it("guardar con el id de un documento de otro espacio se rechaza", async () => {
    await t.q("insert into pilo_spaces (id, name) values ('otro', 'Otro espacio')");
    expect(await errorOf(save({ id: DOC, kind: "pdf", source: "politicas", title: "Ajeno" }, "otro"))).toMatch(/otro espacio/);
    // El mismo archivo en otro espacio es otro documento, y sus pasajes no caben en la memoria de nadie más.
    const other = await save({ kind: "pdf", source: "politicas", title: "El mismo archivo", file_hash: "hash-a" }, "otro");
    expect(other).not.toBe(DOC);
    expect(await errorOf(replace(other, [P(1, "Un pasaje de un espacio que la memoria no conoce.")]))).toMatch(/pilo_memory_(space|source)/);
    expect(await passages(other)).toEqual([]);
    await t.q("delete from pilo_docs where id = $1", [other]);
    await t.q("delete from pilo_spaces where id = 'otro'");
  });
});

describe("cambiar la ficha", () => {
  const DOC = "11111111-1111-4111-8111-111111111111";
  const search = (q: Query, publicOnly: boolean) =>
    q<{ ref: string }>("select ref from pilo_memory_search('evaluación formativa rúbrica retroalimentación', null, 20, 'ensenanza', $1)", [publicOnly]);

  it("la visibilidad baja a los pasajes sin estrenar fecha", async () => {
    const before = await passages(DOC);
    await asAdmin(async (q) => {
      expect(await search(q, false)).toHaveLength(3);
      expect(await search(q, true)).toEqual([]);
    });
    const d = await update(DOC, { vis: "publico" });
    expect(d).toMatchObject({ id: DOC, vis: "publico", active: true });
    const after = await passages(DOC);
    expect(after.map((p) => p.vis)).toEqual(["publico", "publico", "publico"]);
    expect(after.map((p) => p.updated_at.getTime())).toEqual(before.map((p) => p.updated_at.getTime()));
    await asAdmin(async (q) => expect(await search(q, true)).toHaveLength(3));
  });

  it("inactivo = pasajes ocultos; al activarlo vuelve su visibilidad", async () => {
    await update(DOC, { active: false });
    expect((await passages(DOC)).map((p) => p.vis)).toEqual(["oculto", "oculto", "oculto"]);
    await asAdmin(async (q) => {
      expect(await search(q, false)).toEqual([]);
      expect(await q("select ref from pilo_map_pending('ensenanza')")).toEqual([]);
    });
    // Lo que entra mientras está inactivo también queda oculto.
    await replace(DOC, [
      P(1, "La evaluación formativa acompaña el aprendizaje."),
      P(2, "La rúbrica describe los niveles de desempeño y sus criterios."),
      P(4, "La retroalimentación se da en los cinco días siguientes."),
      P(5, "La evaluación formativa no lleva nota definitiva."),
    ]);
    expect((await passages(DOC)).map((p) => p.vis)).toEqual(["oculto", "oculto", "oculto", "oculto"]);
    await update(DOC, { active: true, vis: "sesion" });
    expect((await passages(DOC)).map((p) => p.vis)).toEqual(["sesion", "sesion", "sesion", "sesion"]);
  });

  it("el título y la colección llegan a los pasajes; el título estrena fecha solo en los que lo llevaban", async () => {
    await replace(DOC, [
      P(1, "La evaluación formativa acompaña el aprendizaje."),
      P(2, "La rúbrica describe los niveles de desempeño y sus criterios.", { title: "Rúbricas" }),
    ]);
    await t.q("update pilo_memory set updated_at = now() - interval '1 day' where doc_id = $1", [DOC]);
    const before = await passages(DOC);
    await update(DOC, { title: "Política de evaluación 2026", source: "innovacion" });
    const after = await passages(DOC);
    expect(after.map((p) => [p.title, p.source])).toEqual([["Política de evaluación 2026", "innovacion"], ["Rúbricas", "innovacion"]]);
    expect(after[0].updated_at.getTime()).toBeGreaterThan(before[0].updated_at.getTime());
    expect(after[1].updated_at.getTime()).toBe(before[1].updated_at.getTime());
    // La colección de un archivo no puede ser Moodle, ni una de Planeación.
    expect(await errorOf(update(DOC, { source: "moodle" }))).toMatch(/pilo_docs_moodle/);
    expect(await errorOf(update(DOC, { source: "pdi" }))).toMatch(/pilo_docs_source/);
    expect(await errorOf(update(DOC, { status: "inventado" }))).toMatch(/pilo_docs_status/);
    expect(await errorOf(update("99999999-9999-4999-8999-999999999999", { vis: "publico" }))).toMatch(/no existe/);
  });
});

describe("borrar un documento", () => {
  it("se lleva sus pasajes, las respuestas que lo citan, sus nodos y los temas que quedan solos", async () => {
    const a = await save({ kind: "docx", source: "politicas", title: "Reglamento estudiantil", file_hash: "hash-reglamento", id: "44444444-4444-4444-8444-444444444444", file_path: "ensenanza/44444444-4444-4444-8444-444444444444/reglamento.docx" });
    const b = await save({ kind: "pdf", source: "global", title: "Informe UNESCO", file_hash: "hash-unesco" });
    await replace(a, [P(1, "El reglamento define la evaluación por competencias."), P(2, "El reglamento cita la Ley 30 de 1992.")]);
    await replace(b, [P(1, "La UNESCO recomienda la evaluación por competencias.")]);

    await asAdmin(async (q) => {
      await q("select pilo_doc_outline($1, $2::jsonb, $3::jsonb)", [
        a,
        JSON.stringify([
          { id: "fuente:politicas", label: "Políticas" }, { id: `doc:${a}`, label: "Reglamento estudiantil" },
          { id: `doc:${a}#capitulo-1`, label: "Capítulo 1" }, { id: "ref:ley-30-de-1992", label: "Ley 30 de 1992" },
        ]),
        JSON.stringify([
          { from: "fuente:politicas", to: `doc:${a}` }, { from: `doc:${a}`, to: `doc:${a}#capitulo-1` },
          { from: `doc:${a}#capitulo-1`, to: `doc:${a}:1` }, { from: `doc:${a}:2`, to: "ref:ley-30-de-1992", rel: "cita" },
        ]),
      ]);
      await q("select pilo_map_save('ensenanza', $1::jsonb)", [JSON.stringify([
        { ref: `doc:${a}:1`, topics: [{ id: "tema:evaluacion-por-competencias", label: "Evaluación por competencias" }, { id: "tema:reglamento", label: "Reglamento" }] },
        { ref: `doc:${b}:1`, topics: [{ id: "tema:evaluacion-por-competencias", label: "Evaluación por competencias" }] },
      ])]);
    }, true);
    await t.q(
      `insert into pilo_answers (question, qnorm, kind, answer, refs, space) values
        ('¿Qué dice el reglamento?', 'que dice el reglamento', 'ia', 'CITA-REGLAMENTO', array[$1, $2], 'ensenanza'),
        ('¿Qué dice la UNESCO?', 'que dice la unesco', 'ia', 'CITA-UNESCO', array[$2], 'ensenanza'),
        ('¿Qué dice el plan?', 'que dice el plan', 'ia', 'CITA-PDI', array['pdi:pilar:p1'], 'planeacion')`,
      [`doc:${a}:2`, `doc:${b}:1`],
    );
    const answersBefore = (await t.q("select id from pilo_answers")).length;

    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_doc_delete($1)", [a])))).toMatch(/Solo la función/);
    const [r] = await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_doc_delete($1) as r", [a]), true);
    expect(r.r).toEqual({
      doc: a, space: "ensenanza", file_path: `ensenanza/${a}/reglamento.docx`,
      passages: 2, answers: 1, nodes: 2, edges: 6, topics: 2,
    });

    expect(await t.q("select id from pilo_docs where id = $1", [a])).toEqual([]);
    expect(await passages(a)).toEqual([]);
    expect(await t.q("select id from pilo_answers")).toHaveLength(answersBefore - 1);
    expect(await t.q("select answer from pilo_answers where answer in ('CITA-REGLAMENTO', 'CITA-UNESCO', 'CITA-PDI') order by answer")).toEqual([{ answer: "CITA-PDI" }, { answer: "CITA-UNESCO" }]);
    // Quedan la colección, y el tema que el otro documento sigue usando; se van el tema y la referencia huérfanos.
    expect((await t.q<{ id: string }>("select id from pilo_nodes where space = 'ensenanza' order by id")).map((n) => n.id)).toEqual(["fuente:politicas", "tema:evaluacion-por-competencias"]);
    expect(await t.q("select from_id, to_id, rel from pilo_edges where space = 'ensenanza'")).toEqual([{ from_id: `doc:${b}:1`, to_id: "tema:evaluacion-por-competencias", rel: "trata" }]);
    // El otro documento sigue entero, y Planeación también.
    expect(await passages(b)).toHaveLength(1);
    expect(await t.q("select ref from pilo_memory where space = 'planeacion'")).toEqual([{ ref: "pdi:pilar:p1" }]);

    expect(await errorOf(asAdmin((q) => q("select pilo_doc_delete($1)", [a])))).toMatch(/no existe/);
  });

  it("limpiar el mapa no toca la malla de Planeación", async () => {
    await t.q("insert into pilo_nodes (id, source, type, label) values ('tema:suelto-de-planeacion', 'pdi', 'tema', 'Un nodo suelto del Plan')");
    expect((await asAdmin((q) => q<{ n: number }>("select pilo_map_prune('planeacion') as n")))[0].n).toBe(0);
    expect((await asAdmin((q) => q<{ n: number }>("select pilo_map_prune('ensenanza') as n")))[0].n).toBe(0);
    await t.q("delete from pilo_nodes where id = 'tema:suelto-de-planeacion'");
  });
});

describe("quién puede", () => {
  it("pilo_docs: la administración lee; nadie escribe directo; el público no entra", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select id from pilo_docs")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select id from pilo_docs"))).toEqual([]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select id from pilo_docs"))).toEqual([]);
    expect((await asAdmin((q) => q("select id from pilo_docs"))).length).toBeGreaterThan(0);
    expect(await errorOf(asAdmin((q) => q("insert into pilo_docs (space, kind, source, title) values ('ensenanza', 'pdf', 'global', 'Directo')")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("update pilo_docs set vis = 'publico'")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("delete from pilo_docs where true")))).toMatch(/permission denied/);
    const [rls] = await t.q<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.pilo_docs'::regclass");
    expect(rls.relrowsecurity).toBe(true);
  });

  it("las funciones: la del servidor y la administración; nadie más", async () => {
    const doc = JSON.stringify({ kind: "pdf", source: "global", title: "Desde fuera" });
    const DOC = "11111111-1111-4111-8111-111111111111";
    for (const who of [PEOPLE.director, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_doc_save('ensenanza', $1::jsonb)", [doc])))).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_doc_replace($1, '[]'::jsonb)", [DOC])))).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_doc_update($1, '{}'::jsonb)", [DOC])))).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_map_prune('ensenanza')")))).toMatch(/Solo la función/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_doc_save('ensenanza', $1::jsonb)", [doc])))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_doc_delete($1)", [DOC])))).toMatch(/permission denied/);

    // La función del servidor (Moodle) guarda un curso como documento.
    const course = await asService(async (q) => {
      const [{ id }] = await q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [
        JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title: "Curso de inducción", external_id: "42" }),
      ]);
      const [again] = await q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [
        JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title: "Curso de inducción docente", external_id: "42" }),
      ]);
      expect(again.id).toBe(id);
      const [r] = await q<{ r: Record<string, number> }>("select pilo_doc_replace($1, $2::jsonb) as r", [id, JSON.stringify([P(1, "Bienvenida al curso de inducción docente.")])]);
      expect(r.r).toMatchObject({ added: 1, total: 1 });
      return id;
    }, true);
    expect(await t.q("select title, source, vis, space from pilo_memory where doc_id = $1", [course])).toEqual([
      { title: "Curso de inducción docente", source: "moodle", vis: "sesion", space: "ensenanza" },
    ]);
    await asService((q) => q("select pilo_doc_delete($1)", [course]), true);
    expect(await t.q("select id from pilo_docs where id = $1", [course])).toEqual([]);
  });

  it("toda función nueva es «security definer», con search_path fijo y sin permiso para el público", async () => {
    const fns = await t.q<{ proname: string; prosecdef: boolean; proconfig: string[] | null; anon: boolean; pub: boolean }>(
      `select p.proname, p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any ($1) order by p.proname`,
      [[...FUNCTIONS, "pilo_doc_owns"]],
    );
    expect(fns.map((f) => f.proname)).toEqual([...FUNCTIONS, "pilo_doc_owns"].sort());
    for (const f of fns) {
      expect(f.proconfig, f.proname).toContain("search_path=public");
      expect(f.anon, f.proname).toBe(false);
      expect(f.pub, f.proname).toBe(false);
      if (f.proname !== "pilo_doc_owns") expect(f.prosecdef, f.proname).toBe(true);
    }
  });
});

describe("la migración es idempotente", () => {
  it("aplicarla dos veces no falla ni cambia nada", async () => {
    const snapshot = () =>
      t.q(`select
        (select jsonb_agg(to_jsonb(d) order by d.id) from pilo_docs d) as docs,
        (select jsonb_agg(jsonb_build_object('ref', m.ref, 'doc', m.doc_id, 'space', m.space, 'vis', m.vis, 'at', m.updated_at) order by m.ref) from pilo_memory m) as memory,
        (select count(*)::int from pilo_answers) as answers,
        (select count(*)::int from pilo_nodes) as nodes,
        (select count(*)::int from pilo_edges) as edges,
        (select count(*)::int from storage.buckets) as buckets,
        (select count(*)::int from pg_policies where policyname like 'pilo\\_docs\\_%') as policies,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_indexes where schemaname = 'public' and indexname like 'pilo\\_%') as indexes`);
    const before = await snapshot();
    expect((before[0] as { policies: number }).policies).toBe(5);
    const sql = readFileSync(MIGRATION, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_doc_replace('11111111-1111-4111-8111-111111111111', '[]'::jsonb)")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("update pilo_docs set vis = 'publico'")))).toMatch(/permission denied/);
  });
});
