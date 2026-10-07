/* =============================================================================
   Correos (0137): plantillas, remitentes, conexión, secreto y bitácora.

   Lo que se comprueba es quién puede qué: nadie del portal lee la contraseña
   SMTP; solo la administración lee y cambia plantillas, remitentes y ajustes;
   Planeación lee la bitácora y nadie del portal la escribe; la función (rol de
   servicio) lo lee todo en un viaje. Y que la bitácora no admite un
   destinatario sin enmascarar, que lo sembrado es el texto original del código
   y que volver a aplicar la migración no pisa lo escrito.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";
import { PLANTILLAS, enmascarar } from "../../src/modules/admin/correos/servidor-logica";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0137_correos.sql");
const TABLES = ["correo_identities", "correo_templates", "correo_settings", "correo_secret", "correo_log"];
const FUNCTIONS = ["correo_context", "correo_secret_set", "correo_secret_status", "correo_touch"];
const CLAVE = "Una-contraseña con espacios_x7Qa";

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });
const asPlaneacion = <T>(work: (q: Query) => Promise<T>) => t.asUser(PEOPLE.director, work);
const asConsulta = <T>(work: (q: Query) => Promise<T>) => t.asUser(PEOPLE.vx, work);

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

const anotar = (q: Query, fila: Record<string, unknown> = {}) => {
  const f = { kind: "cuenta", identity: "plan", template: "plan-recovery", rol: "", action: "recovery", recipient: enmascarar("laura.gomez@mail.udes.edu.co"), recipient_hash: "ab12", result: "aceptado", reason: "Aceptado por el servidor", hook_id: "msg_1", ...fila };
  return q("insert into correo_log (kind, identity, template, rol, action, recipient, recipient_hash, result, reason, hook_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", Object.values(f));
};

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set role = 'admin', is_active = true where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set role = 'planeacion', is_active = true where id = $1", [PEOPLE.director]);
  await t.q("update profiles set role = 'consulta', is_active = true where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe("lo que queda sembrado", () => {
  it("las dos identidades, sin dirección: se usa el usuario de la conexión", async () => {
    expect(await t.q("select id, from_name, address, reply_to from correo_identities order by id")).toEqual([
      { id: "pilo", from_name: "Mr. Pilo · UDES", address: "", reply_to: "" },
      { id: "plan", from_name: "Planeación UDES", address: "", reply_to: "" },
    ]);
  });

  it("las plantillas son, palabra por palabra, el texto original del código", async () => {
    const filas = await t.q<Record<string, unknown>>("select * from correo_templates order by key");
    expect(filas.map((f) => f.key)).toEqual(PLANTILLAS.map((p) => p.clave).sort());
    for (const p of PLANTILLAS) {
      const f = filas.find((x) => x.key === p.clave) as Record<string, unknown>;
      expect(
        { identidad: f.identity, grupo: f.grp, nombre: f.name, cuando: f.sent_when, asunto: f.subject, previa: f.preheader, titulo: f.title, saludo: f.greeting, mensaje: f.body, boton: f.button, nota: f.note, roles: f.role_bodies },
        p.clave,
      ).toEqual({ identidad: p.identidad, grupo: p.grupo, nombre: p.nombre, cuando: p.cuando, asunto: p.asunto, previa: p.previa, titulo: p.titulo, saludo: p.saludo, mensaje: p.mensaje, boton: p.boton, nota: p.nota, roles: p.roles });
      expect(f.active).toBe(true);
      expect(p.clave.endsWith(`-${String(f.action)}`), p.clave).toBe(true);
    }
  });

  it("los avisos «para después» no se siembran", async () => {
    expect(await t.q("select key from correo_templates where grp = 'Avisos' or action = ''")).toEqual([]);
  });

  it("los ajustes: una fila, encendido, sin servidor, con sus topes y sin dominios", async () => {
    expect(await t.q("select enabled, smtp_host, smtp_port, smtp_security, smtp_user, hourly_limit, person_daily_limit, allowed_domains from correo_settings")).toEqual([
      { enabled: true, smtp_host: "", smtp_port: 587, smtp_security: "starttls", smtp_user: "", hourly_limit: 200, person_daily_limit: 5, allowed_domains: [] },
    ]);
    expect(await errorOf(t.q("insert into correo_settings (id) values (false)"))).toMatch(/correo_settings_one/);
  });
});

describe("la contraseña SMTP", () => {
  it("la administración la guarda y solo vuelven sus 4 últimos", async () => {
    const [{ r }] = await asAdmin((q) => q<{ r: string }>("select correo_secret_set($1) as r", [`${CLAVE}\r\n`]), true);
    expect(r).toBe("x7Qa");
    const [{ s }] = await asAdmin((q) => q<{ s: { has: boolean; last4: string } }>("select correo_secret_status() as s"));
    expect(s).toMatchObject({ has: true, last4: "x7Qa" });
    // Se guarda entera, con sus espacios y sin el salto de línea de pegarla.
    expect(await t.q("select smtp_password from correo_secret")).toEqual([{ smtp_password: CLAVE }]);
  });

  it("de una contraseña corta no vuelve ni un carácter", async () => {
    const [{ r }] = await asAdmin((q) => q<{ r: string }>("select correo_secret_set('abc1234') as r"));
    expect(r).toBe("");
  });

  it("nadie del portal la lee: ni la administración, ni Planeación, ni un visitante", async () => {
    for (const who of [PEOPLE.admin, PEOPLE.director, PEOPLE.vx, null]) {
      expect(await errorOf(t.asUser(who, (q) => q("select * from correo_secret"))), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("select correo_context('', '')"))), String(who)).toMatch(/permission denied/);
    }
    expect(await errorOf(asAdmin((q) => q("update correo_secret set smtp_password = 'x' where id")))).toMatch(/permission denied/);
  });

  it("solo la administración la guarda y ve su estado", async () => {
    for (const as of [asPlaneacion, asConsulta]) {
      expect(await errorOf(as((q) => q("select correo_secret_set('otra-contraseña')")))).toMatch(/Solo la administración/);
      expect(await errorOf(as((q) => q("select correo_secret_status()")))).toMatch(/Solo la administración/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select correo_secret_set('x')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select correo_secret_status()")))).toMatch(/permission denied/);
    expect(await t.q("select smtp_password from correo_secret")).toEqual([{ smtp_password: CLAVE }]);
  });

  it("la función sí la lee, junto con todo lo demás, en un viaje", async () => {
    const [{ c }] = await asService((q) => q<{ c: Record<string, unknown> }>("select correo_context('', '') as c"));
    expect(c.password).toBe(CLAVE);
    expect(c.settings).toMatchObject({ enabled: true, smtp_port: 587, hourly_limit: 200, person_daily_limit: 5 });
    expect(Object.keys(c.identities as object).sort()).toEqual(["pilo", "plan"]);
    expect(Object.keys(c.templates as object).sort()).toEqual(PLANTILLAS.map((p) => p.clave).sort());
    expect(c).toMatchObject({ in_hour: 0, person_day: 0, repeated: false });
  });
});

describe("plantillas, remitentes y ajustes: solo la administración", () => {
  it("la administración los lee; Planeación, consulta y los visitantes no ven ni una fila", async () => {
    for (const table of ["correo_identities", "correo_templates", "correo_settings"]) {
      expect((await asAdmin((q) => q(`select * from ${table}`))).length, table).toBeGreaterThan(0);
      expect(await asPlaneacion((q) => q(`select * from ${table}`)), table).toEqual([]);
      expect(await asConsulta((q) => q(`select * from ${table}`)), table).toEqual([]);
      expect(await errorOf(t.asUser(null, (q) => q(`select * from ${table}`))), table).toMatch(/permission denied/);
    }
  });

  it("la administración cambia un texto, y queda quién y cuándo", async () => {
    await asAdmin((q) => q("update correo_templates set subject = 'Bienvenido a Planeación' where key = 'plan-invite'"), true);
    const [fila] = await t.q<{ subject: string; updated_by: string; updated_at: Date }>("select subject, updated_by, updated_at from correo_templates where key = 'plan-invite'");
    expect(fila.subject).toBe("Bienvenido a Planeación");
    expect(fila.updated_by).toBe(PEOPLE.admin);
    expect(new Date(fila.updated_at).getFullYear()).toBeGreaterThan(2020);
  });

  it("Planeación y consulta no cambian nada, aunque lo intenten", async () => {
    for (const as of [asPlaneacion, asConsulta]) {
      await as((q) => q("update correo_templates set subject = 'Intruso' where key = 'plan-recovery'"));
      await as((q) => q("update correo_settings set enabled = false where id"));
      await as((q) => q("update correo_identities set from_name = 'Intruso' where id = 'plan'"));
    }
    expect(await t.q("select count(*)::int as n from correo_templates where subject = 'Intruso'")).toEqual([{ n: 0 }]);
    expect(await t.q("select enabled from correo_settings")).toEqual([{ enabled: true }]);
    expect(await t.q("select from_name from correo_identities where id = 'plan'")).toEqual([{ from_name: "Planeación UDES" }]);
  });

  it("ni la administración cambia la clave o la identidad de una plantilla, ni crea o borra plantillas desde el portal", async () => {
    expect(await errorOf(asAdmin((q) => q("update correo_templates set identity = 'pilo' where key = 'plan-invite'")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("update correo_templates set key = 'otra-clave' where key = 'plan-invite'")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("delete from correo_templates where key = 'plan-invite'")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("insert into correo_identities (id, from_name) values ('plan', 'x')")))).toMatch(/permission denied/);
  });

  it("una plantilla no se guarda sin asunto, sin botón o sin mensaje", async () => {
    expect(await errorOf(asAdmin((q) => q("update correo_templates set subject = '  ' where key = 'plan-invite'")))).toMatch(/correo_templates_lines/);
    expect(await errorOf(asAdmin((q) => q("update correo_templates set button = '' where key = 'plan-invite'")))).toMatch(/correo_templates_lines/);
    expect(await errorOf(asAdmin((q) => q("update correo_templates set subject = E'Uno\\nBcc: x@y.co' where key = 'plan-invite'")))).toMatch(/correo_templates_lines/);
    expect(await errorOf(asAdmin((q) => q("update correo_templates set body = '' where key = 'plan-invite'")))).toMatch(/correo_templates_message/);
    expect(await errorOf(asAdmin((q) => q(`update correo_templates set role_bodies = '{"estudiante":"","profesor":"x","administrativo":"x"}' where key = 'pilo-invite'`)))).toMatch(/correo_templates_message/);
    expect(await errorOf(asAdmin((q) => q(`update correo_templates set role_bodies = '{"estudiante":"x","profesor":"x","administrativo":"x","rector":"x"}' where key = 'pilo-invite'`)))).toMatch(/correo_templates_roles/);
    expect(await errorOf(asAdmin((q) => q(`update correo_templates set role_bodies = '{"estudiante":"x"}' where key = 'pilo-invite'`)))).toMatch(/correo_templates_roles/);
  });

  it("los ajustes y los remitentes rechazan lo que no puede funcionar", async () => {
    expect(await errorOf(asAdmin((q) => q("update correo_settings set smtp_host = 'https://smtp.office365.com' where id")))).toMatch(/correo_settings_host/);
    expect(await errorOf(asAdmin((q) => q("update correo_settings set smtp_port = 0 where id")))).toMatch(/correo_settings_port/);
    expect(await errorOf(asAdmin((q) => q("update correo_settings set smtp_security = 'ninguna' where id")))).toMatch(/correo_settings_security/);
    expect(await errorOf(asAdmin((q) => q("update correo_settings set hourly_limit = -1 where id")))).toMatch(/correo_settings_limits/);
    expect(await errorOf(asAdmin((q) => q("update correo_settings set allowed_domains = array['no es dominio'] where id")))).toMatch(/correo_settings_domains/);
    expect(await errorOf(asAdmin((q) => q("update correo_identities set address = 'sin-arroba' where id = 'plan'")))).toMatch(/correo_identities_address/);
    expect(await errorOf(asAdmin((q) => q("update correo_identities set from_name = 'Ana <a@x.co>' where id = 'plan'")))).toMatch(/correo_identities_name/);
    await asAdmin((q) => q("update correo_settings set smtp_host = 'smtp.office365.com', smtp_user = 'p@udes.edu.co', allowed_domains = array['udes.edu.co','mail.udes.edu.co'] where id"));
    await asAdmin((q) => q("update correo_identities set address = 'pilo@udes.edu.co', reply_to = 'planeacion@udes.edu.co' where id = 'pilo'"));
  });
});

describe("la bitácora", () => {
  it("solo la función anota; del portal, nadie", async () => {
    await asService((q) => anotar(q), true);
    for (const who of [PEOPLE.admin, PEOPLE.director, PEOPLE.vx, null]) {
      expect(await errorOf(t.asUser(who, (q) => anotar(q))), String(who)).toMatch(/permission denied/);
    }
    expect(await errorOf(asAdmin((q) => q("delete from correo_log where id > 0")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("update correo_log set reason = 'x' where id > 0")))).toMatch(/permission denied/);
  });

  it("no admite un destinatario sin enmascarar, ni un resultado o una identidad que no existen", async () => {
    expect(await errorOf(asService((q) => anotar(q, { recipient: "laura.gomez@mail.udes.edu.co" })))).toMatch(/correo_log_recipient/);
    expect(await errorOf(asService((q) => anotar(q, { result: "quizá" })))).toMatch(/correo_log_result/);
    expect(await errorOf(asService((q) => anotar(q, { identity: "otra" })))).toMatch(/correo_log_identity/);
    expect(await errorOf(asService((q) => anotar(q, { recipient_hash: "laura@udes.edu.co" })))).toMatch(/correo_log_hash/);
  });

  it("no tiene dónde guardar el contenido ni el enlace", async () => {
    const cols = (await t.q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'correo_log' ")).map((c) => c.column_name).sort();
    expect(cols).toEqual(["action", "created_at", "hook_id", "id", "identity", "kind", "reason", "recipient", "recipient_hash", "result", "rol", "template"]);
  });

  it("la leen Planeación y la administración; consulta y los visitantes, no", async () => {
    expect(await asPlaneacion((q) => q("select recipient, result from correo_log"))).toEqual([{ recipient: "l•••a.gomez@mail.udes.edu.co", result: "aceptado" }]);
    expect((await asAdmin((q) => q("select id from correo_log"))).length).toBe(1);
    expect(await asConsulta((q) => q("select id from correo_log"))).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q("select id from correo_log")))).toMatch(/permission denied/);
  });

  it("cuenta el tope por hora y el tope por persona con lo aceptado, y reconoce un pedido repetido", async () => {
    await asService(async (q) => {
      await anotar(q, { hook_id: "msg_2" });
      await anotar(q, { hook_id: "msg_3", result: "rechazado", reason: "Rechazado (550)" });
      await anotar(q, { hook_id: "", kind: "prueba" });
      await anotar(q, { hook_id: "msg_4", recipient_hash: "cd34" });
    }, true);
    // Un envío viejo no cuenta.
    await t.q("insert into correo_log (created_at, identity, recipient, recipient_hash, result) values (now() - interval '2 days', 'plan', 'l•••a@udes.edu.co', 'ab12', 'aceptado')");
    const ctx = async (hash: string, hook: string) => (await asService((q) => q<{ c: Record<string, unknown> }>("select correo_context($1, $2) as c", [hash, hook])))[0].c;
    expect(await ctx("ab12", "msg_9")).toMatchObject({ in_hour: 4, person_day: 2, repeated: false });
    expect(await ctx("cd34", "msg_4")).toMatchObject({ person_day: 1, repeated: true });
    // El mismo pedido para otra persona (cambio de correo: dos destinatarios) no es repetido.
    expect(await ctx("ab12", "msg_4")).toMatchObject({ repeated: false });
    // Uno rechazado se puede volver a intentar.
    expect(await ctx("ab12", "msg_3")).toMatchObject({ repeated: false });
    expect(await ctx("", "")).toMatchObject({ person_day: 0, repeated: false });
  });
});

describe("la migración", () => {
  it("activa RLS en todas sus tablas y fija el search_path de sus funciones", async () => {
    expect(await t.q("select relname from pg_class where relname = any($1) and not relrowsecurity", [TABLES])).toEqual([]);
    const fns = await t.q<{ proname: string; proconfig: string[] | null }>("select proname, proconfig from pg_proc where proname = any($1) order by 1", [FUNCTIONS]);
    expect(fns.map((f) => f.proname)).toEqual(FUNCTIONS);
    for (const f of fns) expect(f.proconfig, f.proname).toContain("search_path=public");
  });

  it("ninguna de sus funciones queda abierta a visitantes", async () => {
    const abiertas = await t.q("select p.proname from pg_proc p where p.proname = any($1) and has_function_privilege('anon', p.oid, 'execute')", [FUNCTIONS]);
    expect(abiertas).toEqual([]);
  });

  it("volver a aplicarla no pisa lo escrito ni duplica nada", async () => {
    await t.db.exec(readFileSync(MIGRATION, "utf8"));
    expect(await t.q("select subject from correo_templates where key = 'plan-invite'")).toEqual([{ subject: "Bienvenido a Planeación" }]);
    expect(await t.q("select count(*)::int as n from correo_templates")).toEqual([{ n: PLANTILLAS.length }]);
    expect(await t.q("select count(*)::int as n from correo_settings")).toEqual([{ n: 1 }]);
    expect(await t.q("select smtp_password from correo_secret")).toEqual([{ smtp_password: CLAVE }]);
    expect((await t.q("select id from correo_log")).length).toBe(6);
    // Y los permisos siguen como estaban.
    expect(await errorOf(asAdmin((q) => q("select * from correo_secret")))).toMatch(/permission denied/);
  });

  it("todo UPDATE y DELETE de la migración lleva WHERE", () => {
    const sql = readFileSync(MIGRATION, "utf8").replace(/--.*$/gm, "");
    for (const stmt of sql.split(";")) {
      if (/^\s*(update|delete)\b/i.test(stmt)) expect(stmt).toMatch(/\bwhere\b/i);
    }
  });
});
