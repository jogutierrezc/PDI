/* Migración 0171 (Contactos · correo confirmado por Microsoft) en un Postgres en memoria:
   la variante verificada de la identificación, que el ingreso a mano siga sin verificar,
   los cinco dominios institucionales siempre aceptados y que nadie con cuenta llame a las
   funciones (solo la clave de servicio). */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "../db/harness";

let t: TestDb;
let campus = "";
let token = "";
let tokenGmail = "";
let tokenLibre = "";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Respuesta = { aportante_id: string; correo: string; correo_verificado: boolean };

const manual = async (tk: string, correo: string, secreto: string, nombre = "Laura Mendoza", cargo = "Directora de programa", camp: string | null = null) =>
  (await t.q<{ r: Respuesta }>("select public.int_contactos_identificar($1, $2, $3, $4, $5, $6) as r", [tk, nombre, cargo, correo, camp, hash(secreto)]))[0].r;
const microsoft = async (tk: string, correo: string, secreto: string, nombre = "Laura Mendoza Ortiz", cargo = "Directora de programa", camp: string | null = null) =>
  (await t.q<{ r: Respuesta }>("select public.int_contactos_identificar_microsoft($1, $2, $3, $4, $5, $6) as r", [tk, nombre, cargo, correo, camp, hash(secreto)]))[0].r;
const verificado = async (id: string) => (await t.q<{ v: boolean }>("select correo_verificado as v from public.int_aportantes where id = $1", [id]))[0].v;

beforeAll(async () => {
  t = await createTestDb();
  [{ id: campus }] = await t.q<{ id: string }>("select id from public.campuses where slug = 'cucuta'");
  const [{ id: periodo }] = await t.q<{ id: string }>("insert into public.int_periodos (codigo, nombre, cierra) values ('2026-2', 'Segundo semestre 2026', '2026-12-15') returning id");
  [{ token }] = await t.q<{ token: string }>("insert into public.int_invitaciones (nombre, periodo_id, campus_id, vence) values ('Cúcuta', $1, $2, public.int_hoy() + 30) returning token", [periodo, campus]);
  // Una invitación que solo permite otro dominio: los institucionales entran igual.
  [{ token: tokenGmail }] = await t.q<{ token: string }>("insert into public.int_invitaciones (nombre, periodo_id, campus_id, vence, dominios) values ('Aliados', $1, $2, public.int_hoy() + 30, '{aliado.org}') returning token", [periodo, campus]);
  // Y una sin dominios: no restringe a nadie.
  [{ token: tokenLibre }] = await t.q<{ token: string }>("insert into public.int_invitaciones (nombre, periodo_id, campus_id, vence, dominios) values ('Abierta', $1, $2, public.int_hoy() + 30, '{}') returning token", [periodo, campus]);
}, 180_000);

afterAll(async () => t?.close());

describe("0171 · correo confirmado por Microsoft", () => {
  it("la identificación a mano deja el correo sin verificar y la de Microsoft lo deja verificado", async () => {
    const a = await manual(token, "ana.gomez@udes.edu.co", "s1", "Ana Gómez");
    expect(a.correo_verificado).toBe(false);
    expect(await verificado(a.aportante_id)).toBe(false);
    const m = await microsoft(token, "pedro.rios@udes.edu.co", "s2", "Pedro Ríos");
    expect(m.correo_verificado).toBe(true);
    expect(await verificado(m.aportante_id)).toBe(true);
  });

  it("reutiliza al aportante por su correo: Microsoft confirma el que ya existía", async () => {
    const a = await manual(token, "carlos@cucuta.udes.edu.co", "viejo", "Carlos Pérez");
    const m = await microsoft(token, "CARLOS@cucuta.udes.edu.co", "nuevo", "Carlos Pérez Díaz", "Profesor de planta");
    expect(m.aportante_id).toBe(a.aportante_id);
    expect(await verificado(a.aportante_id)).toBe(true);
    expect((await t.q<{ n: string }>("select count(*)::text as n from public.int_aportantes where lower(correo) = 'carlos@cucuta.udes.edu.co'"))[0].n).toBe("1");
    // La sesión anterior deja de servir: queda la nueva.
    expect((await t.q<{ h: string }>("select sesion_hash as h from public.int_aportantes where id = $1", [a.aportante_id]))[0].h).toBe(hash("nuevo"));
  });

  it("si vuelve a entrar a mano con un correo que estaba verificado, deja de estarlo", async () => {
    const m = await microsoft(token, "marta@bogota.udes.edu.co", "m1", "Marta Ruiz");
    expect(await verificado(m.aportante_id)).toBe(true);
    await manual(token, "marta@bogota.udes.edu.co", "m2", "Marta Ruiz");
    expect(await verificado(m.aportante_id)).toBe(false);
  });

  it("los cinco dominios institucionales entran siempre, aunque la invitación permita otro", async () => {
    for (const [i, d] of ["udes.edu.co", "valledupar.udes.edu.co", "cucuta.udes.edu.co", "bogota.udes.edu.co", "mail.udes.edu.co"].entries()) {
      expect((await microsoft(tokenGmail, `persona${i}@${d}`, `s${i}`)).correo).toBe(`persona${i}@${d}`);
      expect((await manual(tokenGmail, `otra${i}@${d}`, `t${i}`)).correo_verificado).toBe(false);
    }
    expect((await manual(tokenGmail, "aliada@aliado.org", "a1")).correo).toBe("aliada@aliado.org");
  });

  it("un correo ajeno a todos los dominios no entra por ninguna de las dos puertas", async () => {
    expect(await errorOf(microsoft(token, "laura@gmail.com", "x"))).toMatch(/correo institucional/);
    expect(await errorOf(manual(token, "laura@gmail.com", "x"))).toMatch(/correo institucional/);
    expect(await errorOf(microsoft(tokenGmail, "laura@falsoudes.edu.co", "x"))).toMatch(/correo institucional/);
  });

  it("una invitación sin dominios no restringe a nadie", async () => {
    expect((await manual(tokenLibre, "cualquiera@gmail.com", "l1")).correo).toBe("cualquiera@gmail.com");
  });

  it("pide nombre, cargo y una sesión válida también por la puerta de Microsoft", async () => {
    expect(await errorOf(microsoft(token, "sin.cargo@udes.edu.co", "x", "Sin Cargo", ""))).toMatch(/nombre completo y su cargo/);
    expect(await errorOf(t.q("select public.int_contactos_identificar_microsoft($1, 'Ana Gómez', 'Docente', 'a@udes.edu.co', null, 'corto')", [token]))).toMatch(/Sesión no válida/);
  });

  it("no la puede llamar nadie con cuenta ni sin ella: solo la clave de servicio", async () => {
    for (const quien of [null, "00000000-0000-4000-a000-0000000000f1"]) {
      expect(await errorOf(t.asUser(quien, (q) => q("select public.int_contactos_identificar_microsoft($1, 'Ana Gómez', 'Docente', 'a@udes.edu.co', null, $2)", [token, hash("x")])))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select public.int_contactos_identificar_base($1, 'Ana Gómez', 'Docente', 'a@udes.edu.co', null, $2, true)", [token, hash("x")])))).toMatch(/permission denied/);
  });
});
