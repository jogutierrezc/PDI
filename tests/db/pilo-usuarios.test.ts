/* =============================================================================
   Usuarios de Pilo (0120): cuentas aparte de la intranet.

   Lo que no puede fallar: un usuario de Pilo no recibe perfil de intranet ni
   pasa ninguna de sus puertas; solo entran correos de la UDES con el perfil
   que su dominio admite; cada quien ve lo suyo y la administración ve la
   tabla; lo guardado es de su dueño.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const LAURA = "00000000-0000-4000-c000-000000000001";
const CARLOS = "00000000-0000-4000-c000-000000000002";
const NUEVO = "00000000-0000-4000-c000-000000000003";
const OTRO = "00000000-0000-4000-c000-000000000009";

let t: TestDb;

const addPiloUser = (id: string, email: string, username: string, rol: string, campus = "") =>
  t.q("insert into pilo_users (id, username, full_name, email, rol, campus) values ($1, $2, $3, $4, $5, $6)", [id, username, "Persona de prueba", email, rol, campus]);

const prefs = (who: string, patch: Record<string, unknown>, commit = true) => t.asUser(who, (q) => q("select pilo_user_update_prefs($1::jsonb)", [JSON.stringify(patch)]), { commit });

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.db.exec("alter table auth.users add column if not exists email_confirmed_at timestamptz");
  // Como la función del servidor: el usuario de auth nace con la marca de Pilo.
  await t.q("insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3::jsonb, now())", [LAURA, "laura.gomez@mail.udes.edu.co", JSON.stringify({ pilo: true, full_name: "Laura Gómez" })]);
  await t.q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [CARLOS, "c.rojas@cucuta.udes.edu.co", JSON.stringify({ pilo: true })]);
  await t.q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [OTRO, "x@x.co", JSON.stringify({ pilo: true })]);
  await addPiloUser(LAURA, "laura.gomez@mail.udes.edu.co", "laura.gomez", "estudiante", "bucaramanga");
  await addPiloUser(CARLOS, "c.rojas@cucuta.udes.edu.co", "c.rojas", "profesor", "cucuta");
}, 120_000);

afterAll(() => t?.close());

describe("una cuenta de Pilo no es una cuenta de la intranet", () => {
  it("no recibe perfil al crearse; un usuario de auth sin la marca sí, como siempre", async () => {
    expect(await t.q("select id from profiles where id = any($1)", [[LAURA, CARLOS, OTRO]])).toEqual([]);
    await t.q("insert into auth.users (id, email) values ($1, $2)", [NUEVO, "nuevo@ejemplo.org"]);
    expect(await t.q("select role from profiles where id = $1", [NUEVO])).toEqual([{ role: "consulta" }]);
  });

  it("no pasa ninguna puerta de la intranet", async () => {
    const [gate] = await t.asUser(LAURA, (q) => q<{ consulta: boolean; admin: boolean }>("select has_role_at_least('consulta') as consulta, has_role_at_least('admin') as admin"));
    expect(gate).toEqual({ consulta: false, admin: false });
    expect(await t.asUser(LAURA, (q) => q("select id from profiles"))).toEqual([]);
    expect(await errorOf(t.asUser(LAURA, (q) => q("select * from pilo_users_admin()")))).toBeTruthy();
  });
});

describe("qué correos entran y con qué perfil", () => {
  it("la regla por dominio", async () => {
    const rule = async (email: string | null) => (await t.q<{ r: unknown }>("select pilo_email_rule($1) as r", [email]))[0].r;
    expect(await rule("a@mail.udes.edu.co")).toEqual({ roles: ["estudiante", "profesor"], campus: "" });
    expect(await rule("A@UDES.EDU.CO")).toEqual({ roles: ["administrativo", "profesor"], campus: "" });
    expect(await rule("a@valledupar.udes.edu.co")).toEqual({ roles: ["administrativo", "profesor"], campus: "valledupar" });
    for (const bad of ["a@gmail.com", "a@udes.edu.co.evil.com", "a@xudes.edu.co", "sin-arroba", "a@mail.udes.edu.co b@x.co", null]) expect(await rule(bad)).toBeNull();
  });

  it("la tabla rechaza un correo de fuera, un perfil que el dominio no admite y un usuario mal formado", async () => {
    expect(await errorOf(addPiloUser(OTRO, "alguien@gmail.com", "alguien", "estudiante"))).toBeTruthy();
    expect(await errorOf(addPiloUser(OTRO, "alguien@mail.udes.edu.co", "alguien", "administrativo"))).toBeTruthy();
    expect(await errorOf(addPiloUser(OTRO, "alguien@udes.edu.co", "alguien", "estudiante"))).toBeTruthy();
    expect(await errorOf(addPiloUser(OTRO, "alguien@mail.udes.edu.co", "Con Mayúsculas", "estudiante"))).toBeTruthy();
    expect(await errorOf(addPiloUser(OTRO, "alguien@mail.udes.edu.co", "laura.gomez", "estudiante"))).toBeTruthy();
    expect(await errorOf(addPiloUser(OTRO, "alguien@mail.udes.edu.co", "alguien", "estudiante", "medellin"))).toBeTruthy();
  });
});

describe("quién ve y cambia qué", () => {
  it("cada quien lee su fila; la administración, la tabla con la confirmación del correo", async () => {
    expect((await t.asUser(LAURA, (q) => q<{ username: string }>("select username from pilo_users"))).map((r) => r.username)).toEqual(["laura.gomez"]);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select username from pilo_users"))).toEqual([]);
    const rows = await t.asUser(PEOPLE.admin, (q) => q<{ username: string; confirmed: boolean }>("select username, confirmed from pilo_users_admin() order by username"));
    expect(rows).toEqual([
      { username: "c.rojas", confirmed: false },
      { username: "laura.gomez", confirmed: true },
    ]);
  });

  it("la persona cambia cómo le habla Pilo, pero no su perfil, su usuario ni su estado", async () => {
    await prefs(LAURA, { nick: "  Lau  ", tone: "directo", length: "corta", about: "Estudio de noche.", rol: "profesor", status: "suspendida", username: "otra" });
    await t.asUser(LAURA, (q) => q("update pilo_users set rol = 'profesor', status = 'suspendida' where id = $1", [LAURA]), { commit: true });
    const [row] = await t.q("select username, rol, status, nick, tone, length, about, campus from pilo_users where id = $1", [LAURA]);
    expect(row).toEqual({ username: "laura.gomez", rol: "estudiante", status: "activa", nick: "Lau", tone: "directo", length: "corta", about: "Estudio de noche.", campus: "bucaramanga" });
    expect(await errorOf(prefs(LAURA, { tone: "grosero" }, false))).toBeTruthy();
  });

  it("la sede se elige solo cuando el correo no la fija", async () => {
    await prefs(LAURA, { campus: "bogota" });
    await prefs(CARLOS, { campus: "bogota" });
    const rows = await t.q<{ username: string; campus: string }>("select username, campus from pilo_users order by username");
    expect(rows).toEqual([
      { username: "c.rojas", campus: "cucuta" },
      { username: "laura.gomez", campus: "bogota" },
    ]);
  });

  it("la administración suspende una cuenta, y con eso deja de ser miembro", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("update pilo_users set status = 'suspendida' where id = $1", [CARLOS]), { commit: true });
    expect((await t.asUser(CARLOS, (q) => q<{ m: boolean }>("select pilo_is_member() as m")))[0].m).toBe(false);
    expect((await t.asUser(LAURA, (q) => q<{ m: boolean }>("select pilo_is_member() as m")))[0].m).toBe(true);
    expect(await errorOf(prefs(CARLOS, { nick: "C" }, false))).toBeTruthy();
  });
});

describe("lo guardado es de su dueño", () => {
  it("cada quien guarda, lee y quita lo suyo; ni otra cuenta ni la administración lo ven", async () => {
    await t.asUser(LAURA, (q) => q("insert into pilo_user_saved (space, question, answer) values ('ensenanza', '¿Qué es una rúbrica?', 'Una tabla de criterios.')"), { commit: true });
    expect(await t.asUser(LAURA, (q) => q("select question from pilo_user_saved"))).toEqual([{ question: "¿Qué es una rúbrica?" }]);
    expect(await t.asUser(PEOPLE.admin, (q) => q("select question from pilo_user_saved"))).toEqual([]);
    expect(await t.asUser(CARLOS, (q) => q("select question from pilo_user_saved"))).toEqual([]);
    // Una cuenta suspendida no guarda; nadie guarda a nombre de otro.
    expect(await errorOf(t.asUser(CARLOS, (q) => q("insert into pilo_user_saved (question, answer) values ('x', 'y')")))).toBeTruthy();
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("insert into pilo_user_saved (user_id, question, answer) values ($1, 'x', 'y')", [LAURA])))).toBeTruthy();
    await t.asUser(LAURA, (q) => q("delete from pilo_user_saved"), { commit: true });
    expect(await t.q("select id from pilo_user_saved")).toEqual([]);
  });
});
