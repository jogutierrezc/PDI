import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type TestDb } from "./harness";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  for (const [id, mail] of [[PEOPLE.admin, "a@prueba.udes.edu.co"], [PEOPLE.reportante, "r@prueba.udes.edu.co"]]) {
    await t.q("insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,'{}') on conflict do nothing", [id, mail]);
    await t.q("insert into profiles (id,email,full_name) values ($1,$2,'X') on conflict do nothing", [id, mail]);
  }
  await t.q("update profiles set access_role_id=(select id from access_roles where key='admin') where id=$1", [PEOPLE.admin]);
}, 120_000);
afterAll(() => t?.close());

describe("roles de acceso: crear, editar, borrar", () => {
  it("el administrador crea un rol con todas las pantallas, informes y unidades", async () => {
    const out = await t.asUser(PEOPLE.admin, async (q) => {
      const [r] = await q<{ id: string }>(
        `insert into access_roles (key,name,description,base_role,screens,all_screens,all_reports,impact_level,all_impact_units)
         values ('prueba','Prueba','', 'responsable', array['pilo','pilo_ensenanza','correos','rutas','rankings','internacionalizacion','informes','warehouse','monitor'], false,false,'editor',false) returning id`);
      await q("insert into access_role_reports (access_role_id,report_slug) values ($1,'x')", [r.id]);
      await q("insert into access_role_units (access_role_id,unit_id) values ($1,$2)", [r.id, UNITS.facultad]);
      await q("update access_roles set name='Otra' where id=$1", [r.id]);
      await q("delete from access_roles where id=$1", [r.id]);
      return "ok";
    });
    expect(out).toBe("ok");
  });
  it("un no administrador no puede crear roles", async () => {
    const msg = await errorOf(
      t.asUser(PEOPLE.reportante, (q) => q("insert into access_roles (key,name,base_role) values ('hack','H','admin')")));
    expect(msg).toBeTruthy();
  });
});

const alta = (id: string, email: string, provider: string, meta = "{}") =>
  t.q("insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3::jsonb,$4::jsonb)", [
    id, email, meta, JSON.stringify({ provider }),
  ]);
const perfil = async (email: string) =>
  (await t.q<{ role: string; is_active: boolean; key: string | null }>(
    `select p.role, p.is_active, r.key from profiles p left join access_roles r on r.id = p.access_role_id where p.email = $1`, [email]))[0];

describe("lista de acceso y Microsoft", () => {
  const U = (n: number) => `00000000-0000-4000-a000-0000000001${String(n).padStart(2, "0")}`;

  it("Microsoft fuera de la lista: perfil inactivo con rol invitado, sin ver nada", async () => {
    await alta(U(1), "Nuevo@UDES.edu.co", "azure", JSON.stringify({ role: "admin", full_name: "Nuevo" }));
    expect(await perfil("Nuevo@UDES.edu.co")).toEqual({ role: "consulta", is_active: false, key: "invitado" });
    const rol = await t.asUser(U(1), (q) => q("select public.current_role() as r"));
    expect(rol[0]).toEqual({ r: null });
  });

  it("Microsoft con el correo en la lista (sin importar mayúsculas): activo con el rol de la lista", async () => {
    await t.q("insert into access_allowlist (email, access_role_id) values ('  Ana@Udes.edu.co ', (select id from access_roles where key='planeacion'))");
    await alta(U(2), "ANA@udes.edu.co", "azure");
    expect(await perfil("ANA@udes.edu.co")).toEqual({ role: "planeacion", is_active: true, key: "planeacion" });
  });

  it("un dominio habilita a todos los suyos, y el correo exacto manda sobre el dominio", async () => {
    await t.q("insert into access_allowlist (email, access_role_id) values ('@dom.udes.edu.co', (select id from access_roles where key='consulta'))");
    await t.q("insert into access_allowlist (email, access_role_id) values ('jefe@dom.udes.edu.co', (select id from access_roles where key='responsable'))");
    await alta(U(3), "x@dom.udes.edu.co", "azure");
    await alta(U(4), "jefe@dom.udes.edu.co", "azure");
    expect((await perfil("x@dom.udes.edu.co")).key).toBe("consulta");
    expect((await perfil("jefe@dom.udes.edu.co")).key).toBe("responsable");
  });

  it("una entrada desactivada no habilita", async () => {
    await t.q("insert into access_allowlist (email, access_role_id, active) values ('off@udes.edu.co', (select id from access_roles where key='admin'), false)");
    await alta(U(5), "off@udes.edu.co", "azure");
    expect((await perfil("off@udes.edu.co")).is_active).toBe(false);
  });

  it("agregar el correo del que espera lo habilita; quitarlo lo cierra", async () => {
    await t.q("insert into access_allowlist (email, access_role_id) values ('nuevo@udes.edu.co', (select id from access_roles where key='consulta'))");
    expect(await perfil("Nuevo@UDES.edu.co")).toEqual({ role: "consulta", is_active: true, key: "consulta" });
    await t.q("delete from access_allowlist where email='nuevo@udes.edu.co'");
    expect(await perfil("Nuevo@UDES.edu.co")).toEqual({ role: "consulta", is_active: false, key: "invitado" });
  });

  it("el rol de los metadatos ya no se obedece (alta por correo)", async () => {
    await alta(U(6), "meta@udes.edu.co", "email", JSON.stringify({ role: "admin" }));
    expect((await perfil("meta@udes.edu.co")).role).toBe("consulta");
  });

  it("solo administración toca la lista", async () => {
    expect(await errorOf(t.asUser(PEOPLE.reportante, (q) => q("insert into access_allowlist (email, access_role_id) values ('z@udes.edu.co', (select id from access_roles where key='admin'))")))).toBeTruthy();
  });

  it("no deja cerrar al último administrador quitando su correo", async () => {
    const [{ email }] = await t.q<{ email: string }>("select email from profiles where id=$1", [PEOPLE.admin]);
    await t.q("update profiles set is_active=false where role='admin' and id <> $1", [PEOPLE.admin]);
    await t.q("insert into access_allowlist (email, access_role_id) values ($1, (select id from access_roles where key='admin')) on conflict do nothing", [email]);
    expect(await errorOf(t.q("delete from access_allowlist where email=$1", [email]))).toMatch(/administrador/i);
  });

  it("el correo debe tener forma de correo o de dominio", async () => {
    expect(await errorOf(t.q("insert into access_allowlist (email, access_role_id) values ('sin-arroba', (select id from access_roles where key='consulta'))"))).toBeTruthy();
  });
});
