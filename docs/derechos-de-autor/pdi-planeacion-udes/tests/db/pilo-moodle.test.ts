/* =============================================================================
   Mr. Pilo en Enseñanza: Moodle (0116).

   El token de Moodle es un secreto: nadie lo lee desde el portal —ni el
   público, ni una persona con sesión, ni la administración por SQL—; la
   administración solo ve si hay token y sus cuatro últimos caracteres. La
   función del servidor (rol de servicio) sí lo lee. Los cursos son documentos
   y su visibilidad baja a sus pasajes.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0116_pilo_moodle.sql");

const FUNCTIONS = ["pilo_moodle_course_set", "pilo_moodle_courses_save", "pilo_space_secret_status", "pilo_space_set_secret"];

const TOKEN = "0123456789abcdef0123456789abWXYZ";

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

const courseSet = (q: Query, course: number, patch: Record<string, unknown>, space = "ensenanza") =>
  q<{ r: Record<string, unknown> }>("select pilo_moodle_course_set($1, $2, $3::jsonb) as r", [space, course, JSON.stringify(patch)]);

const passagesVis = async (doc: string) =>
  (await t.q<{ vis: string }>("select vis from pilo_memory where doc_id = $1 order by ref", [doc])).map((p) => p.vis);

beforeAll(async () => {
  // Como quedó con 0116: la conexión única. Los varios sitios (0133) tienen su prueba en pilo-moodle-sitios.test.ts.
  t = await createTestDb({ before: "0133" });
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("el token de Moodle", () => {
  it("lo guarda la administración y solo vuelven sus cuatro últimos caracteres", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN])))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN])))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN])))).toMatch(/permission denied/);
    // Ni siquiera la función del servidor lo cambia: es cosa de la administración.
    expect(await errorOf(asService((q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN])))).toMatch(/permission denied|Solo la administración/);

    const [r] = await asAdmin((q) => q<{ last4: string }>("select pilo_space_set_secret('ensenanza', 'moodle', $1) as last4", [`  ${TOKEN}\n`]), true);
    expect(r.last4).toBe("WXYZ");
    expect(await t.q("select moodle_token, updated_by from pilo_space_secret where space = 'ensenanza'")).toEqual([{ moodle_token: TOKEN, updated_by: PEOPLE.admin }]);

    expect(await errorOf(asAdmin((q) => q("select pilo_space_set_secret('ensenanza', 'otra', 'x')")))).toMatch(/El secreto es/);
    expect(await errorOf(asAdmin((q) => q("select pilo_space_set_secret('planeacion', 'moodle', 'x')")))).toMatch(/Espacio desconocido/);
    expect(await errorOf(asAdmin((q) => q("select pilo_space_set_secret('ensenanza', 'moodle', repeat('x', 201))")))).toMatch(/demasiado largo/);
  });

  it("no lo lee el público, ni una persona con sesión, ni la administración por SQL", async () => {
    for (const who of [null, PEOPLE.vx, PEOPLE.director, PEOPLE.admin]) {
      expect(await errorOf(t.asUser(who, (q) => q("select moodle_token from pilo_space_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("select count(*) from pilo_space_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("update pilo_space_secret set moodle_token = 'x' where true returning moodle_token"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("delete from pilo_space_secret where true returning moodle_token"))), String(who)).toMatch(/permission denied/);
    }
    const [c] = await t.q<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'pilo_space_secret') as policies
       from pg_class c where c.oid = 'public.pilo_space_secret'::regclass`,
    );
    expect(c).toEqual({ rls: true, policies: 0 });
    for (const role of ["anon", "authenticated"]) {
      const [p] = await t.q<{ any: boolean }>("select has_table_privilege($1, 'public.pilo_space_secret', 'select, insert, update, delete') as any", [role]);
      expect(p.any, role).toBe(false);
    }
  });

  it("la administración ve solo el estado; nadie más, ni eso", async () => {
    const [s] = await asAdmin((q) => q<{ s: Record<string, unknown> }>("select pilo_space_secret_status('ensenanza') as s"));
    expect(s.s).toMatchObject({ space: "ensenanza", moodle: { has: true, last4: "WXYZ" } });
    expect(JSON.stringify(s.s)).not.toContain(TOKEN);
    expect(JSON.stringify(s.s)).not.toContain(TOKEN.slice(0, 12));
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_space_secret_status('ensenanza')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_space_secret_status('ensenanza')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_space_secret_status('ensenanza')")))).toMatch(/permission denied/);
    // Tampoco sale en la configuración pública ni en la ficha del espacio.
    const [c] = await t.asUser(null, (q) => q<{ c: unknown }>("select pilo_ai_public_config() as c"));
    expect(JSON.stringify(c.c)).not.toContain("WXYZ");
    expect(JSON.stringify(c.c)).not.toContain("moodle_");
    const [sp] = await asAdmin((q) => q<Record<string, unknown>>("select * from pilo_spaces where id = 'ensenanza'"));
    expect(JSON.stringify(sp)).not.toContain("WXYZ");
  });

  it("la función del servidor sí lo lee", async () => {
    expect(await asService((q) => q("select moodle_token from pilo_space_secret where space = 'ensenanza'"))).toEqual([{ moodle_token: TOKEN }]);
    const [s] = await asService((q) => q<{ s: { moodle: unknown } }>("select pilo_space_secret_status('ensenanza') as s"));
    expect(s.s.moodle).toEqual({ has: true, last4: "WXYZ" });
  });

  it("vaciarlo lo quita", async () => {
    await asAdmin(async (q) => {
      const [r] = await q<{ last4: string }>("select pilo_space_set_secret('ensenanza', 'moodle_token', '') as last4");
      expect(r.last4).toBe("");
      const [s] = await q<{ s: { moodle: unknown } }>("select pilo_space_secret_status('ensenanza') as s");
      expect(s.s.moodle).toEqual({ has: false, last4: "" });
    });
  });
});

describe("la conexión en la ficha del espacio", () => {
  it("nace apagada y sin dirección", async () => {
    expect(await t.q("select moodle_on, moodle_url, moodle_site, moodle_checked_at from pilo_spaces where id = 'ensenanza'")).toEqual([
      { moodle_on: false, moodle_url: "", moodle_site: {}, moodle_checked_at: null },
    ]);
  });

  it("la dirección solo puede ser https", async () => {
    const set = (url: string) => t.q("update pilo_spaces set moodle_url = $1 where id = 'ensenanza'", [url]);
    for (const bad of ["http://moodle.udes.edu.co", "ftp://moodle.udes.edu.co", "moodle.udes.edu.co", "javascript:alert(1)", "https://", "https:///ruta", "https://moodle.udes.edu.co/ con espacio", " https://moodle.udes.edu.co"]) {
      expect(await errorOf(set(bad)), bad).toMatch(/pilo_spaces_moodle_url/);
    }
    expect(await errorOf(t.q("update pilo_spaces set moodle_site = '[]'::jsonb where id = 'ensenanza'"))).toMatch(/pilo_spaces_moodle_site/);
    const ok = await asAdmin((q) => q("update pilo_spaces set moodle_on = true, moodle_url = 'https://moodle.udes.edu.co', moodle_site = '{\"sitename\": \"Campus\"}'::jsonb, moodle_checked_at = now() where id = 'ensenanza' returning moodle_url"), true);
    expect(ok).toEqual([{ moodle_url: "https://moodle.udes.edu.co" }]);
    expect(await t.asUser(PEOPLE.director, (q) => q("update pilo_spaces set moodle_url = 'https://malo.example' where id = 'ensenanza' returning id"))).toEqual([]);
  });
});

describe("los cursos", () => {
  let doc = "";

  it("se anotan sin elegir y con visibilidad «sesion»; anotar de nuevo no cambia lo elegido", async () => {
    const rows = [
      { id: 42, category_id: 7, category_name: "Docencia", shortname: "IND-1", fullname: "Inducción docente", time_modified: 1790000000 },
      { course_id: 43, category_id: 7, category_name: "Docencia", shortname: "EVA-1", fullname: "Evaluación por competencias" },
      { id: "no-es-numero", fullname: "No entra" },
    ];
    const [s] = await asService((q) => q<{ n: number }>("select pilo_moodle_courses_save('ensenanza', $1::jsonb) as n", [JSON.stringify(rows)]), true);
    expect(s.n).toBe(2);
    expect(await t.q("select course_id::int as course_id, shortname, selected, vis, doc_id, status from pilo_moodle_courses order by course_id")).toEqual([
      { course_id: 42, shortname: "IND-1", selected: false, vis: "sesion", doc_id: null, status: "" },
      { course_id: 43, shortname: "EVA-1", selected: false, vis: "sesion", doc_id: null, status: "" },
    ]);

    await asAdmin((q) => courseSet(q, 42, { selected: true }), true);
    await asService((q) => q("select pilo_moodle_courses_save('ensenanza', $1::jsonb)", [JSON.stringify([{ id: 42, shortname: "IND-1", fullname: "Inducción docente 2026" }])]), true);
    expect(await t.q("select fullname, selected, vis, category_name, time_modified::text as time_modified from pilo_moodle_courses where course_id = 42")).toEqual([
      { fullname: "Inducción docente 2026", selected: true, vis: "sesion", category_name: "Docencia", time_modified: "1790000000" },
    ]);
    expect(await errorOf(asAdmin((q) => q("select pilo_moodle_courses_save('planeacion', '[]'::jsonb)")))).toMatch(/Espacio desconocido/);
  });

  it("la función del servidor lee el curso y lo deja como documento, con sus pasajes «sesion»", async () => {
    doc = await asService(async (q) => {
      const [{ id }] = await q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [
        JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title: "Inducción docente 2026", external_id: "42", content_hash: "h1" }),
      ]);
      await q("select pilo_doc_replace($1, $2::jsonb)", [id, JSON.stringify([
        { seq: 1, section: "Tema 1", body: "Bienvenida al curso de inducción docente." },
        { seq: 2, section: "Tema 2", body: "La planeación de clase se entrega cada semana." },
      ])]);
      const [r] = await courseSet(q, 42, { doc_id: id, status: "listo", error: "", content_hash: "h1", synced: true });
      expect(r.r).toMatchObject({ doc_id: id, status: "listo", selected: true, vis: "sesion" });
      return id;
    }, true);
    expect(await passagesVis(doc)).toEqual(["sesion", "sesion"]);
    expect(await t.q("select origin, kind, source, vis, active, synced_at is not null as synced from pilo_docs where id = $1", [doc])).toEqual([
      { origin: "moodle", kind: "curso", source: "moodle", vis: "sesion", active: true, synced: true },
    ]);
    // Sin sesión no se reciben; con sesión sí. Y entran al índice de vectores de su espacio.
    await asAdmin(async (q) => {
      expect(await q("select ref from pilo_memory_search('inducción docente', array['moodle'], 20, 'ensenanza', true)")).toEqual([]);
      expect(await q("select ref from pilo_memory_search('inducción docente', array['moodle'], 20, 'ensenanza', false)")).toHaveLength(2);
      expect(await q("select ref from pilo_memory_search('inducción docente')")).toEqual([]);
    });
  });

  it("la visibilidad del curso baja a su documento y a sus pasajes", async () => {
    await asAdmin((q) => courseSet(q, 42, { vis: "publico" }), true);
    expect(await passagesVis(doc)).toEqual(["publico", "publico"]);
    expect(await t.q("select vis from pilo_docs where id = $1", [doc])).toEqual([{ vis: "publico" }]);
    await asAdmin(async (q) => expect(await q("select ref from pilo_memory_search('inducción docente', null, 20, 'ensenanza', true)")).toHaveLength(2));

    await asAdmin((q) => courseSet(q, 42, { vis: "sesion" }), true);
    expect(await passagesVis(doc)).toEqual(["sesion", "sesion"]);
    expect(await errorOf(asAdmin((q) => courseSet(q, 42, { vis: "oculto" })))).toMatch(/pilo_moodle_courses_vis/);
  });

  it("soltar el curso oculta sus pasajes; elegirlo de nuevo los devuelve con su visibilidad", async () => {
    await asAdmin((q) => courseSet(q, 42, { selected: false }), true);
    expect(await passagesVis(doc)).toEqual(["oculto", "oculto"]);
    await asAdmin(async (q) => expect(await q("select ref from pilo_memory_search('inducción docente', null, 20, 'ensenanza', false)")).toEqual([]));
    await asAdmin((q) => courseSet(q, 42, { selected: true }), true);
    expect(await passagesVis(doc)).toEqual(["sesion", "sesion"]);
  });

  it("un curso no se queda con el documento de otro, ni con un archivo", async () => {
    const file = (await asAdmin((q) => q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [JSON.stringify({ kind: "pdf", source: "politicas", title: "Una política" })]), true))[0].id;
    expect(await errorOf(asAdmin((q) => courseSet(q, 43, { doc_id: doc })))).toMatch(/no es el de este curso/);
    expect(await errorOf(asAdmin((q) => courseSet(q, 43, { doc_id: file })))).toMatch(/no es el de este curso/);
    expect(await errorOf(asAdmin((q) => courseSet(q, 999, { selected: true })))).toMatch(/no está anotado/);
    expect(await errorOf(asAdmin((q) => courseSet(q, 42, { selected: true }, "planeacion")))).toMatch(/no está anotado/);
  });

  it("borrar el documento del curso deja el curso sin documento", async () => {
    await asAdmin((q) => q("select pilo_doc_delete($1)", [doc]), true);
    expect(await t.q("select doc_id, selected from pilo_moodle_courses where course_id = 42")).toEqual([{ doc_id: null, selected: true }]);
    expect(await passagesVis(doc)).toEqual([]);
  });
});

describe("quién puede", () => {
  it("pilo_moodle_courses: la administración lee; nadie escribe directo; el público no entra", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select course_id from pilo_moodle_courses")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select course_id from pilo_moodle_courses"))).toEqual([]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select course_id from pilo_moodle_courses"))).toEqual([]);
    expect(await asAdmin((q) => q("select course_id from pilo_moodle_courses"))).toHaveLength(2);
    expect(await errorOf(asAdmin((q) => q("update pilo_moodle_courses set vis = 'publico' where true")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("insert into pilo_moodle_courses (space, course_id) values ('ensenanza', 1)")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("delete from pilo_moodle_courses where true")))).toMatch(/permission denied/);
    const [rls] = await t.q<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.pilo_moodle_courses'::regclass");
    expect(rls.relrowsecurity).toBe(true);
  });

  it("las funciones de cursos: la del servidor y la administración", async () => {
    for (const who of [PEOPLE.director, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_moodle_courses_save('ensenanza', '[]'::jsonb)")))).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(who, (q) => courseSet(q, 42, { vis: "publico" })))).toMatch(/Solo la función/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_moodle_courses_save('ensenanza', '[]'::jsonb)")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => courseSet(q, 42, { vis: "publico" })))).toMatch(/permission denied/);
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
  it("aplicarla dos veces no falla, no cambia nada y no pierde el token", async () => {
    await asAdmin((q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN]), true);
    const snapshot = () =>
      t.q(`select
        (select jsonb_agg(to_jsonb(k) order by k.space) from pilo_space_secret k) as secrets,
        (select jsonb_agg(to_jsonb(c) order by c.course_id) from pilo_moodle_courses c) as courses,
        (select jsonb_agg(to_jsonb(sp) order by sp.id) from pilo_spaces sp) as spaces,
        (select count(*)::int from pg_policies where tablename in ('pilo_space_secret', 'pilo_moodle_courses')) as policies,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_indexes where schemaname = 'public' and indexname like 'pilo\\_%') as indexes`);
    const before = await snapshot();
    const sql = readFileSync(MIGRATION, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
    expect(await t.q("select moodle_token from pilo_space_secret where space = 'ensenanza'")).toEqual([{ moodle_token: TOKEN }]);
    expect(await errorOf(asAdmin((q) => q("select moodle_token from pilo_space_secret")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_space_secret_status('ensenanza')")))).toMatch(/permission denied/);
    expect(await asService((q) => q("select moodle_token from pilo_space_secret where space = 'ensenanza'"))).toEqual([{ moodle_token: TOKEN }]);
  });
});
