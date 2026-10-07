/* =============================================================================
   Mr. Pilo en Enseñanza: varios sitios de Moodle (0133).

   La conexión única de 0116 pasa a ser una lista de sitios, cada uno con su
   dirección, su token (secreto: nadie lo lee desde el portal), su interruptor
   y sus cursos. El mismo número de curso puede existir en dos sitios sin que
   uno se quede con el documento del otro. Lo que ya había pasa a ser el sitio
   «principal», sin perder el token ni los cursos.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0133_pilo_moodle_sitios.sql");

const FUNCTIONS = ["pilo_moodle_course_set", "pilo_moodle_courses_save", "pilo_moodle_site_delete", "pilo_moodle_site_save", "pilo_moodle_site_set_token", "pilo_moodle_sites_status"];

const TOKEN_A = "0123456789abcdef0123456789abWXYZ";
const TOKEN_B = "fedcba9876543210fedcba987654QRST";

let t: TestDb;

const admins = async (db: TestDb) => {
  await db.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await db.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
};

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(work: (q: Query) => Promise<T>, commit = false, db: TestDb = t): Promise<T> {
  await db.db.exec("begin");
  let ok = false;
  try {
    await db.db.exec("set local role service_role");
    await db.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await db.db.query("select set_config('request.jwt.claim.sub', '', true)");
    const result = await work(db.q);
    ok = true;
    return result;
  } finally {
    await db.db.exec(ok && commit ? "commit" : "rollback");
  }
}

const siteSave = (q: Query, site: string, patch: Record<string, unknown>, space = "ensenanza") =>
  q<{ r: Record<string, unknown> }>("select pilo_moodle_site_save($1, $2, $3::jsonb) as r", [space, site, JSON.stringify(patch)]);

const coursesSave = (q: Query, site: string, rows: unknown[], space = "ensenanza") =>
  q<{ n: number }>("select pilo_moodle_courses_save($1, $2, $3::jsonb) as n", [space, site, JSON.stringify(rows)]);

const courseSet = (q: Query, site: string, course: number, patch: Record<string, unknown>, space = "ensenanza") =>
  q<{ r: Record<string, unknown> }>("select pilo_moodle_course_set($1, $2, $3, $4::jsonb) as r", [space, site, course, JSON.stringify(patch)]);

/** Lee un curso como lo hace la función: su documento («sitio:curso»), dos pasajes y la marca en el curso. */
const readCourse = (q: Query, site: string, course: number, title: string) =>
  (async () => {
    const [{ id }] = await q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [
      JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title, external_id: `${site}:${course}`, content_hash: "h1" }),
    ]);
    await q("select pilo_doc_replace($1, $2::jsonb)", [id, JSON.stringify([
      { seq: 1, section: "Tema 1", body: `Bienvenida al curso ${title}.` },
      { seq: 2, section: "Tema 2", body: `La planeación de ${title} se entrega cada semana.` },
    ])]);
    await courseSet(q, site, course, { doc_id: id, status: "leido", error: "", content_hash: "h1", synced: true });
    return id;
  })();

beforeAll(async () => {
  t = await createTestDb();
  await admins(t);
}, 120_000);

afterAll(() => t?.close());

describe("los sitios", () => {
  it("nace sin ninguno; la administración los agrega y nadie más", async () => {
    expect(await t.q("select id from pilo_moodle_sites")).toEqual([]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => siteSave(q, "bucaramanga", { name: "Bucaramanga" })))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => siteSave(q, "bucaramanga", { name: "Bucaramanga" })))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => siteSave(q, "bucaramanga", { name: "Bucaramanga" })))).toMatch(/permission denied/);
    // Ni siquiera la función del servidor: agregar un sitio es cosa de la administración.
    expect(await errorOf(asService((q) => siteSave(q, "bucaramanga", { name: "Bucaramanga" })))).toMatch(/permission denied|Solo la administración/);

    const [a] = await asAdmin((q) => siteSave(q, "bucaramanga", { name: "  Pregrado   Bucaramanga ", url: "https://aula.udes.edu.co/" }), true);
    expect(a.r).toMatchObject({ space: "ensenanza", id: "bucaramanga", name: "Pregrado Bucaramanga", url: "https://aula.udes.edu.co", enabled: false, site: {}, checked_at: null });
    await asAdmin((q) => siteSave(q, "cucuta", { name: "Cúcuta" }), true);
    expect(await t.q("select id, url, enabled from pilo_moodle_sites order by created_at, id")).toEqual([
      { id: "bucaramanga", url: "https://aula.udes.edu.co", enabled: false },
      { id: "cucuta", url: "", enabled: false },
    ]);
  });

  it("revisa el id, el nombre y la dirección; y no se enciende sin dirección", async () => {
    for (const bad of ["B", "1campus", "Campus", "con espacio", "x".repeat(25), ""]) {
      expect(await errorOf(asAdmin((q) => siteSave(q, bad, { name: "Otro" }))), bad).toMatch(/pilo_moodle_sites_id/);
    }
    expect(await errorOf(asAdmin((q) => siteSave(q, "nuevo", {})))).toMatch(/necesita un nombre/);
    expect(await errorOf(asAdmin((q) => siteSave(q, "nuevo", { name: "x".repeat(61) })))).toMatch(/pilo_moodle_sites_name/);
    // Dos sitios no se llaman igual, tampoco cambiando mayúsculas.
    expect(await errorOf(asAdmin((q) => siteSave(q, "nuevo", { name: "CÚCUTA" })))).toMatch(/pilo_moodle_sites_name_idx/);
    for (const bad of ["http://aula.udes.edu.co", "aula.udes.edu.co", "javascript:alert(1)", "https://", "https://aula.udes.edu.co/ con espacio"]) {
      expect(await errorOf(asAdmin((q) => siteSave(q, "cucuta", { url: bad }))), bad).toMatch(/pilo_moodle_sites_url/);
    }
    expect(await errorOf(asAdmin((q) => siteSave(q, "cucuta", { enabled: true })))).toMatch(/pilo_moodle_sites_enabled/);
    expect(await errorOf(asAdmin((q) => siteSave(q, "cucuta", { name: "Cúcuta" }, "planeacion")))).toMatch(/Espacio desconocido/);
    expect(await errorOf(asAdmin((q) => siteSave(q, "cucuta", ["no"] as never)))).toMatch(/deben ser un objeto/);
  });

  it("se cambia por partes; otra dirección borra la prueba anterior", async () => {
    await asAdmin((q) => siteSave(q, "cucuta", { url: "https://virtual.cucuta.udes.edu.co", enabled: true }), true);
    // La función anota lo que respondió el sitio al probarlo.
    await asService((q) => q("update pilo_moodle_sites set site = '{\"name\": \"Campus Cúcuta\"}'::jsonb, checked_at = now() where space = 'ensenanza' and id = 'cucuta'"), true);
    const [same] = await asAdmin((q) => siteSave(q, "cucuta", { name: "Sede Cúcuta", url: "https://virtual.cucuta.udes.edu.co" }), true);
    expect(same.r).toMatchObject({ name: "Sede Cúcuta", enabled: true, site: { name: "Campus Cúcuta" } });
    expect(same.r.checked_at).not.toBeNull();
    const [moved] = await asAdmin((q) => siteSave(q, "cucuta", { url: "https://aula.cucuta.udes.edu.co" }), true);
    expect(moved.r).toMatchObject({ name: "Sede Cúcuta", url: "https://aula.cucuta.udes.edu.co", enabled: true, site: {}, checked_at: null });
  });

  it("hasta 12 por espacio", async () => {
    await asAdmin(async (q) => {
      for (let i = 0; i < 10; i++) await siteSave(q, `extra-${i}`, { name: `Extra ${i}` });
      expect(await errorOf(siteSave(q, "trece", { name: "Trece" }))).toMatch(/Ya hay 12 sitios/);
    });
  });

  it("la tabla: la administración lee; nadie escribe directo; el público no entra", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select id from pilo_moodle_sites")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.director, (q) => q("select id from pilo_moodle_sites"))).toEqual([]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select id from pilo_moodle_sites"))).toEqual([]);
    expect(await asAdmin((q) => q("select id from pilo_moodle_sites"))).toHaveLength(2);
    expect(await errorOf(asAdmin((q) => q("update pilo_moodle_sites set url = 'https://malo.example' where true")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("insert into pilo_moodle_sites (space, id, name) values ('ensenanza', 'directo', 'Directo')")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("delete from pilo_moodle_sites where true")))).toMatch(/permission denied/);
    // No sale en la configuración pública.
    const [c] = await t.asUser(null, (q) => q<{ c: unknown }>("select pilo_ai_public_config() as c"));
    expect(JSON.stringify(c.c)).not.toContain("aula.udes.edu.co");
  });
});

describe("el token de cada sitio", () => {
  it("lo guarda la administración, por sitio, y solo vuelven sus cuatro últimos caracteres", async () => {
    const set = (q: Query, site: string, value: string) => q<{ last4: string }>("select pilo_moodle_site_set_token('ensenanza', $1, $2) as last4", [site, value]);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => set(q, "cucuta", TOKEN_A)))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => set(q, "cucuta", TOKEN_A)))).toMatch(/permission denied/);
    expect(await errorOf(asService((q) => set(q, "cucuta", TOKEN_A)))).toMatch(/permission denied|Solo la administración/);
    expect(await errorOf(asAdmin((q) => set(q, "no-existe", TOKEN_A)))).toMatch(/no existe/);
    expect(await errorOf(asAdmin((q) => set(q, "cucuta", "x".repeat(201))))).toMatch(/demasiado largo/);

    expect((await asAdmin((q) => set(q, "bucaramanga", `  ${TOKEN_A}\n`), true))[0].last4).toBe("WXYZ");
    expect((await asAdmin((q) => set(q, "cucuta", TOKEN_B), true))[0].last4).toBe("QRST");
    expect(await t.q("select site, token, updated_by from pilo_moodle_site_secret order by site")).toEqual([
      { site: "bucaramanga", token: TOKEN_A, updated_by: PEOPLE.admin },
      { site: "cucuta", token: TOKEN_B, updated_by: PEOPLE.admin },
    ]);
  });

  it("no lo lee el público, ni una persona con sesión, ni la administración por SQL; la función sí", async () => {
    for (const who of [null, PEOPLE.vx, PEOPLE.director, PEOPLE.admin]) {
      expect(await errorOf(t.asUser(who, (q) => q("select token from pilo_moodle_site_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("update pilo_moodle_site_secret set token = 'x' where true returning token"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("delete from pilo_moodle_site_secret where true returning token"))), String(who)).toMatch(/permission denied/);
    }
    const [c] = await t.q<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'pilo_moodle_site_secret') as policies
       from pg_class c where c.oid = 'public.pilo_moodle_site_secret'::regclass`,
    );
    expect(c).toEqual({ rls: true, policies: 0 });
    for (const role of ["anon", "authenticated"]) {
      const [p] = await t.q<{ any: boolean }>("select has_table_privilege($1, 'public.pilo_moodle_site_secret', 'select, insert, update, delete') as any", [role]);
      expect(p.any, role).toBe(false);
    }
    expect(await asService((q) => q("select token from pilo_moodle_site_secret where space = 'ensenanza' and site = 'cucuta'"))).toEqual([{ token: TOKEN_B }]);
  });

  it("el estado dice, por sitio, si hay token y sus cuatro últimos: nunca el token", async () => {
    const [s] = await asAdmin((q) => q<{ s: Record<string, { has: boolean; last4: string }> }>("select pilo_moodle_sites_status('ensenanza') as s"));
    expect(s.s.bucaramanga).toMatchObject({ has: true, last4: "WXYZ" });
    expect(s.s.cucuta).toMatchObject({ has: true, last4: "QRST" });
    for (const secret of [TOKEN_A, TOKEN_B, TOKEN_A.slice(0, 12)]) expect(JSON.stringify(s.s)).not.toContain(secret);
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_moodle_sites_status('ensenanza')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_moodle_sites_status('ensenanza')")))).toMatch(/permission denied/);
    // Vaciarlo lo quita, solo en ese sitio.
    await asAdmin(async (q) => {
      await q("select pilo_moodle_site_set_token('ensenanza', 'cucuta', '')");
      const [after] = await q<{ s: Record<string, { has: boolean; last4: string }> }>("select pilo_moodle_sites_status('ensenanza') as s");
      expect(after.s.cucuta).toMatchObject({ has: false, last4: "" });
      expect(after.s.bucaramanga).toMatchObject({ has: true, last4: "WXYZ" });
    });
  });
});

describe("los cursos, por sitio", () => {
  let docA = "";
  let docB = "";

  it("el mismo número de curso existe en dos sitios sin mezclarse", async () => {
    await asService((q) => coursesSave(q, "bucaramanga", [{ id: 42, category_name: "Docencia", shortname: "IND-B", fullname: "Inducción Bucaramanga" }]), true);
    await asService((q) => coursesSave(q, "cucuta", [{ id: 42, category_name: "Docencia", shortname: "IND-C", fullname: "Inducción Cúcuta" }, { id: 43, shortname: "EVA-C", fullname: "Evaluación Cúcuta" }]), true);
    expect(await t.q("select site, course_id::int as course_id, shortname, selected, vis from pilo_moodle_courses order by site, course_id")).toEqual([
      { site: "bucaramanga", course_id: 42, shortname: "IND-B", selected: false, vis: "sesion" },
      { site: "cucuta", course_id: 42, shortname: "IND-C", selected: false, vis: "sesion" },
      { site: "cucuta", course_id: 43, shortname: "EVA-C", selected: false, vis: "sesion" },
    ]);
    // Elegir el 42 de un sitio no elige el del otro.
    await asAdmin((q) => courseSet(q, "bucaramanga", 42, { selected: true }), true);
    expect(await t.q("select site, selected from pilo_moodle_courses where course_id = 42 order by site")).toEqual([
      { site: "bucaramanga", selected: true },
      { site: "cucuta", selected: false },
    ]);
    expect(await errorOf(asService((q) => coursesSave(q, "no-existe", [{ id: 1 }])))).toMatch(/no existe/);
    expect(await errorOf(asAdmin((q) => courseSet(q, "bucaramanga", 43, { selected: true })))).toMatch(/no está anotado/);
  });

  it("cada curso tiene su documento («sitio:curso») y no se queda con el del otro sitio", async () => {
    docA = await asService((q) => readCourse(q, "bucaramanga", 42, "Inducción Bucaramanga"), true);
    docB = await asService((q) => readCourse(q, "cucuta", 42, "Inducción Cúcuta"), true);
    expect(docA).not.toBe(docB);
    expect(await t.q("select external_id from pilo_docs where origin = 'moodle' order by external_id")).toEqual([{ external_id: "bucaramanga:42" }, { external_id: "cucuta:42" }]);
    expect(await errorOf(asAdmin((q) => courseSet(q, "cucuta", 42, { doc_id: docA })))).toMatch(/no es el de este curso/);
    expect(await errorOf(asAdmin((q) => courseSet(q, "cucuta", 43, { doc_id: docB })))).toMatch(/no es el de este curso/);
    // El de Bucaramanga está elegido: sus pasajes se ven con sesión. El de Cúcuta no: quedan ocultos.
    expect(await t.q("select vis from pilo_memory where doc_id = $1 order by ref", [docA])).toEqual([{ vis: "sesion" }, { vis: "sesion" }]);
    expect(await t.q("select vis from pilo_memory where doc_id = $1 order by ref", [docB])).toEqual([{ vis: "oculto" }, { vis: "oculto" }]);
  });

  it("las funciones de cursos: la del servidor y la administración", async () => {
    for (const who of [PEOPLE.director, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => coursesSave(q, "cucuta", [])))).toMatch(/Solo la función/);
      expect(await errorOf(t.asUser(who, (q) => courseSet(q, "cucuta", 42, { vis: "publico" })))).toMatch(/Solo la función/);
    }
    expect(await errorOf(t.asUser(null, (q) => coursesSave(q, "cucuta", [])))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => courseSet(q, "cucuta", 42, { vis: "publico" })))).toMatch(/permission denied/);
  });

  it("las firmas de 0116, sin sitio, ya no existen", async () => {
    expect(await errorOf(asAdmin((q) => q("select pilo_moodle_courses_save('ensenanza', '[]'::jsonb)")))).toMatch(/does not exist/);
    expect(await errorOf(asAdmin((q) => q("select pilo_moodle_course_set('ensenanza', 42::bigint, '{}'::jsonb)")))).toMatch(/does not exist/);
  });

  it("quitar un sitio se lleva su token, sus cursos y lo que Pilo leyó de ellos; lo del otro queda", async () => {
    expect(await errorOf(t.asUser(PEOPLE.director, (q) => q("select pilo_moodle_site_delete('ensenanza', 'cucuta')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_moodle_site_delete('ensenanza', 'cucuta')")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("select pilo_moodle_site_delete('ensenanza', 'no-existe')")))).toMatch(/no existe/);

    const [gone] = await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_moodle_site_delete('ensenanza', 'cucuta') as r"), true);
    expect(gone.r).toEqual({ site: "cucuta", courses: 2, docs: 1 });
    expect(await t.q("select id from pilo_moodle_sites order by id")).toEqual([{ id: "bucaramanga" }]);
    expect(await t.q("select site from pilo_moodle_site_secret")).toEqual([{ site: "bucaramanga" }]);
    expect(await t.q("select site, course_id::int as course_id from pilo_moodle_courses")).toEqual([{ site: "bucaramanga", course_id: 42 }]);
    expect(await t.q("select id from pilo_docs where id = $1", [docB])).toEqual([]);
    expect(await t.q("select count(*)::int as n from pilo_memory where doc_id = $1", [docB])).toEqual([{ n: 0 }]);
    // Lo de Bucaramanga sigue entero.
    expect(await t.q("select count(*)::int as n from pilo_memory where doc_id = $1", [docA])).toEqual([{ n: 2 }]);
    expect(await t.q("select doc_id from pilo_moodle_courses where site = 'bucaramanga'")).toEqual([{ doc_id: docA }]);
  });
});

describe("las funciones", () => {
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

describe("la migración", () => {
  it("es idempotente: aplicarla dos veces no falla, no cambia nada y no pierde los tokens", async () => {
    const snapshot = () =>
      t.q(`select
        (select jsonb_agg(to_jsonb(s) order by s.id) from pilo_moodle_sites s) as sites,
        (select jsonb_agg(to_jsonb(k) order by k.site) from pilo_moodle_site_secret k) as secrets,
        (select jsonb_agg(to_jsonb(c) order by c.site, c.course_id) from pilo_moodle_courses c) as courses,
        (select jsonb_agg(d.external_id order by d.external_id) from pilo_docs d where d.origin = 'moodle') as docs,
        (select jsonb_agg(to_jsonb(sp) order by sp.id) from pilo_spaces sp) as spaces,
        (select count(*)::int from pg_policies where tablename like 'pilo\\_moodle\\_%') as policies,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_indexes where schemaname = 'public' and indexname like 'pilo\\_%') as indexes`);
    const before = await snapshot();
    const sql = readFileSync(MIGRATION, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
    expect(await asService((q) => q("select token from pilo_moodle_site_secret where site = 'bucaramanga'"))).toEqual([{ token: TOKEN_A }]);
  });

  it("lo que ya había (0116) pasa a ser el sitio «principal», con su token, su prueba y sus cursos", async () => {
    const old = await createTestDb({ before: "0133" });
    try {
      await admins(old);
      await old.q("update pilo_spaces set moodle_on = true, moodle_url = 'https://moodle.udes.edu.co', moodle_site = '{\"name\": \"Campus\"}'::jsonb, moodle_checked_at = now() where id = 'ensenanza'");
      await old.asUser(PEOPLE.admin, (q) => q("select pilo_space_set_secret('ensenanza', 'moodle', $1)", [TOKEN_A]), { commit: true });
      const doc = await asService(
        async (q) => {
          await q("select pilo_moodle_courses_save('ensenanza', $1::jsonb)", [JSON.stringify([{ id: 42, shortname: "IND-1", fullname: "Inducción docente" }, { id: 43, shortname: "EVA-1", fullname: "Evaluación" }])]);
          await q("select pilo_moodle_course_set('ensenanza', 42::bigint, '{\"selected\": true}'::jsonb)");
          const [{ id }] = await q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title: "Inducción docente", external_id: "42" })]);
          await q("select pilo_doc_replace($1, $2::jsonb)", [id, JSON.stringify([{ seq: 1, section: "Tema 1", body: "Bienvenida al curso de inducción docente." }])]);
          await q("select pilo_moodle_course_set('ensenanza', 42::bigint, $1::jsonb)", [JSON.stringify({ doc_id: id, status: "leido", synced: true })]);
          return id;
        },
        true,
        old,
      );

      const sql = readFileSync(MIGRATION, "utf8");
      await old.db.exec(sql);
      await old.db.exec(sql);

      expect(await old.q("select id, name, url, enabled, site, checked_at is not null as checked from pilo_moodle_sites")).toEqual([
        { id: "principal", name: "Principal", url: "https://moodle.udes.edu.co", enabled: true, site: { name: "Campus" }, checked: true },
      ]);
      // El token se movió: está en el sitio y ya no en el secreto del espacio.
      expect(await old.q("select site, token from pilo_moodle_site_secret")).toEqual([{ site: "principal", token: TOKEN_A }]);
      expect(await old.q("select moodle_token from pilo_space_secret where space = 'ensenanza'")).toEqual([{ moodle_token: "" }]);
      expect(await old.q("select moodle_on, moodle_url, moodle_site, moodle_checked_at from pilo_spaces where id = 'ensenanza'")).toEqual([{ moodle_on: false, moodle_url: "", moodle_site: {}, moodle_checked_at: null }]);
      // Los cursos y su documento siguen, ahora del sitio «principal».
      expect(await old.q("select site, course_id::int as course_id, selected, doc_id, status from pilo_moodle_courses order by course_id")).toEqual([
        { site: "principal", course_id: 42, selected: true, doc_id: doc, status: "leido" },
        { site: "principal", course_id: 43, selected: false, doc_id: null, status: "" },
      ]);
      expect(await old.q("select external_id from pilo_docs where id = $1", [doc])).toEqual([{ external_id: "principal:42" }]);
      expect(await old.q("select vis from pilo_memory where doc_id = $1", [doc])).toEqual([{ vis: "sesion" }]);
      // Y se siguen manejando con las funciones nuevas: leerlo de nuevo halla el mismo documento.
      await old.asUser(PEOPLE.admin, (q) => q("select pilo_moodle_course_set('ensenanza', 'principal', 42::bigint, $1::jsonb)", [JSON.stringify({ doc_id: doc, vis: "publico" })]), { commit: true });
      expect(await old.q("select vis from pilo_memory where doc_id = $1", [doc])).toEqual([{ vis: "publico" }]);
      const [again] = await asService((q) => q<{ id: string }>("select pilo_doc_save('ensenanza', $1::jsonb) as id", [JSON.stringify({ origin: "moodle", kind: "curso", source: "moodle", title: "Inducción docente", external_id: "principal:42" })]), false, old);
      expect(again.id).toBe(doc);
    } finally {
      await old.close();
    }
  }, 120_000);

  it("sin conexión anterior no inventa ningún sitio", async () => {
    const fresh = await createTestDb();
    try {
      expect(await fresh.q("select id from pilo_moodle_sites")).toEqual([]);
      expect(await fresh.q("select site from pilo_moodle_site_secret")).toEqual([]);
    } finally {
      await fresh.close();
    }
  }, 120_000);
});
