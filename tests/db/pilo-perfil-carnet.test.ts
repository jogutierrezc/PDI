/* =============================================================================
   Perfil del carnet y «Mis límites» (0141).

   Lo que no puede fallar: cada quien lee y escribe solo su fila; anon no ve
   nada; la administración no la lee; lo que no es del perfil se descarta; el
   estado «suspendido» no se escribe desde el navegador; y pilo_my_limits
   devuelve lo configurado (no inventa contadores).
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const LAURA = "00000000-0000-4000-c000-000000000011";
const CARLOS = "00000000-0000-4000-c000-000000000012";
const SOFIA = "00000000-0000-4000-c000-000000000013";
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  for (const [id, email] of [
    [LAURA, "laura@mail.udes.edu.co"],
    [CARLOS, "carlos@cucuta.udes.edu.co"],
    [SOFIA, "sofia@udes.edu.co"],
  ]) {
    await t.q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [id, email, JSON.stringify({ pilo: true })]);
  }
  await t.q("insert into pilo_users (id, username, full_name, email, rol, campus) values ($1, 'laura.g', 'Laura Gómez', 'laura@mail.udes.edu.co', 'estudiante', 'bucaramanga')", [LAURA]);
  await t.q("insert into pilo_users (id, username, full_name, email, rol, campus) values ($1, 'carlos.r', 'Carlos Rojas', 'carlos@cucuta.udes.edu.co', 'profesor', 'cucuta')", [CARLOS]);
  await t.q("insert into pilo_users (id, username, full_name, email, rol, campus, status) values ($1, 'sofia.m', 'Sofía Medina', 'sofia@udes.edu.co', 'administrativo', 'bogota', 'suspendida')", [SOFIA]);
}, 120_000);

afterAll(() => t?.close());

const save = (who: string, sql: string, params: unknown[] = []) => t.asUser(who, (q) => q(sql, params), { commit: true });

describe("el perfil del carnet", () => {
  it("la estudiante guarda sus datos; lo que no es de su perfil se descarta y los textos se limpian", async () => {
    await save(
      LAURA,
      "insert into pilo_user_perfil (user_id, programa, semestre, jornada, facultad, vinculacion, codigo, rh, show_codigo, show_rh) values ($1, '  Ingeniería   de Software ', 5, 'diurna', 'Ingenierías', 'planta', '2260000', 'O+', true, true)",
      [LAURA],
    );
    const [row] = await t.asUser(LAURA, (q) => q<Record<string, unknown>>("select * from pilo_user_perfil"));
    expect(row).toMatchObject({ programa: "Ingeniería de Software", semestre: 5, jornada: "diurna", facultad: null, vinculacion: null, codigo: "2260000", rh: "O+", show_codigo: true, show_rh: true, suspendido_en: null });
  });

  it("sin código no hay «mostrar el código»", async () => {
    await save(LAURA, "update pilo_user_perfil set codigo = '', show_codigo = true where user_id = $1", [LAURA]);
    const [row] = await t.asUser(LAURA, (q) => q<{ codigo: string | null; show_codigo: boolean }>("select codigo, show_codigo from pilo_user_perfil"));
    expect(row).toEqual({ codigo: null, show_codigo: false });
  });

  it("rechaza valores fuera de lo permitido", async () => {
    expect(await errorOf(save(LAURA, "update pilo_user_perfil set jornada = 'tarde' where user_id = $1", [LAURA]))).toMatch(/valores/);
    expect(await errorOf(save(LAURA, "update pilo_user_perfil set rh = 'Z+' where user_id = $1", [LAURA]))).toMatch(/valores/);
    expect(await errorOf(save(LAURA, "update pilo_user_perfil set semestre = 30 where user_id = $1", [LAURA]))).toMatch(/valores/);
    expect(await errorOf(save(LAURA, "update pilo_user_perfil set codigo = 'a b' where user_id = $1", [LAURA]))).toMatch(/valores/);
  });

  it("cada quien ve solo lo suyo; anon y la administración, nada", async () => {
    await save(CARLOS, "insert into pilo_user_perfil (user_id, facultad, vinculacion) values ($1, 'Ingenierías', 'catedra')", [CARLOS]);
    expect(await t.asUser(LAURA, (q) => q("select user_id from pilo_user_perfil"))).toHaveLength(1);
    expect(await t.asUser(CARLOS, (q) => q("select user_id from pilo_user_perfil"))).toEqual([{ user_id: CARLOS }]);
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_user_perfil")))).toBeTruthy();
    expect(await t.asUser(PEOPLE.admin, (q) => q("select user_id from pilo_user_perfil"))).toEqual([]);
  });

  it("no se escribe la fila de otra persona", async () => {
    expect(await errorOf(save(LAURA, "insert into pilo_user_perfil (user_id, programa) values ($1, 'Ajeno')", [CARLOS]))).toBeTruthy();
    await save(LAURA, "update pilo_user_perfil set programa = 'Intruso' where user_id = $1", [CARLOS]);
    const [row] = await t.q<{ facultad: string }>("select facultad from pilo_user_perfil where user_id = $1", [CARLOS]);
    expect(row.facultad).toBe("Ingenierías");
  });

  it("una cuenta suspendida no escribe", async () => {
    expect(await errorOf(save(SOFIA, "insert into pilo_user_perfil (user_id, dependencia, cargo) values ($1, 'Planeación', 'Profesional')", [SOFIA]))).toBeTruthy();
  });

  it("el estado «suspendido» no se escribe desde el navegador", async () => {
    expect(await errorOf(save(LAURA, "update pilo_user_perfil set suspendido_en = now() where user_id = $1", [LAURA]))).toMatch(/permission|permiso/i);
    await t.q("update pilo_user_perfil set suspendido_en = now() where user_id = $1", [LAURA]);
    const [row] = await t.asUser(LAURA, (q) => q<{ suspendido_en: string | null }>("select suspendido_en from pilo_user_perfil"));
    expect(row.suspendido_en).not.toBeNull();
  });

  it("al borrarse la cuenta se va el perfil", async () => {
    await t.q("delete from pilo_users where id = $1", [CARLOS]);
    expect(await t.q("select user_id from pilo_user_perfil where user_id = $1", [CARLOS])).toEqual([]);
  });
});

describe("pilo_my_limits", () => {
  it("devuelve lo configurado, con los valores de partida de pilo-ia", async () => {
    const [{ r }] = await t.asUser(LAURA, (q) => q<{ r: any }>("select pilo_my_limits() as r"));
    expect(r.rol).toBe("estudiante");
    const e = r.espacios.planeacion;
    expect(e.ventana_s).toBeGreaterThan(0);
    expect(e).toMatchObject({ archivos: false, codigo: false, archivo_mb: 10, archivos_dia: 5, respuesta_tokens: 1200, codigo_tokens: 2000 });
    expect(Object.keys(r.espacios)).toEqual(expect.arrayContaining(["planeacion", "ensenanza"]));
  });

  it("refleja lo que la administración cambia (la cuenta de Pilo cuenta como «sesion»)", async () => {
    await t.q("update pilo_extras set files_aud = 'sesion', code_aud = 'admin', file_daily = 7, member_factor = 4 where space = 'ensenanza'");
    await t.q("update pilo_spaces set visitor_limit = 10, visitor_window_seconds = 300 where id = 'ensenanza'");
    const [{ r }] = await t.asUser(LAURA, (q) => q<{ r: any }>("select pilo_my_limits() as r"));
    expect(r.espacios.ensenanza).toMatchObject({ archivos: true, codigo: false, archivos_dia: 7, preguntas_max: 40, ventana_s: 300 });
  });

  it("sin límite por visitante, no hay tope (0)", async () => {
    await t.q("update pilo_spaces set visitor_limit = 0 where id = 'ensenanza'");
    const [{ r }] = await t.asUser(LAURA, (q) => q<{ r: any }>("select pilo_my_limits() as r"));
    expect(r.espacios.ensenanza.preguntas_max).toBe(0);
  });

  it("anon y las cuentas suspendidas no lo llaman", async () => {
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_my_limits()")))).toBeTruthy();
    expect(await errorOf(t.asUser(SOFIA, (q) => q("select pilo_my_limits()")))).toMatch(/activa/);
  });
});
