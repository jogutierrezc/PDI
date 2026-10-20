/* =============================================================================
   Pilo · el código de verificación al crear la cuenta (0175).

   Lo que no puede fallar: la base nunca guarda el código ni el correo, solo
   huellas; un código se vence, se gasta y se agota; nadie del portal llega a
   estas funciones; solo con un tiquete verificado se puede crear la cuenta; y
   Bogotá entra como sede administrativa.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type TestDb } from "./harness";

const PURPOSE = "pilo_registro";
const EMAIL = "a".repeat(64);
const OTRO = "b".repeat(64);
const CODE = "1".repeat(64);
const MAL = "2".repeat(64);
const TICKET = "3".repeat(64);

let t: TestDb;

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(work: () => Promise<T>): Promise<T> {
  await t.db.exec("begin");
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    const result = await work();
    await t.db.exec("commit");
    return result;
  } catch (error) {
    await t.db.exec("rollback");
    throw error;
  }
}

const emitir = (email = EMAIL, code = CODE, wait = 60, hourly = 6) =>
  asService(async () => (await t.q<{ r: { ok: boolean; reason?: string; wait?: number } }>("select correo_codigo_emitir($1, $2, $3, 600, $4, 3, $5) as r", [PURPOSE, email, code, wait, hourly]))[0].r);
const verificar = (email = EMAIL, code = CODE, ticket = TICKET) =>
  asService(async () => (await t.q<{ r: { ok: boolean; reason?: string; left?: number } }>("select correo_codigo_verificar($1, $2, $3, $4) as r", [PURPOSE, email, code, ticket]))[0].r);
const ticket = (consume: boolean, email = EMAIL, tk = TICKET) =>
  asService(async () => (await t.q<{ r: boolean }>("select correo_codigo_ticket($1, $2, $3, $4) as r", [PURPOSE, email, tk, consume]))[0].r);

beforeAll(async () => {
  t = await createTestDb();
}, 120_000);

afterAll(() => t?.close());

describe("Bogotá entra como sede administrativa", () => {
  it("la regla de la base", async () => {
    const [{ r }] = await t.q<{ r: unknown }>("select pilo_email_rule('Ana@Bogota.UDES.edu.co') as r");
    expect(r).toEqual({ roles: ["administrativo", "profesor"], campus: "bogota" });
    const [{ r: otra }] = await t.q<{ r: unknown }>("select pilo_email_rule('ana@otra.bogota.udes.edu.co') as r");
    expect(otra).toBeNull();
  });

  it("la bitácora de Correos admite el tipo «codigo»", async () => {
    await t.q("insert into correo_log (kind, identity, template, recipient, result) values ('codigo', 'pilo', 'pilo-codigo', 'l•••z@mail.udes.edu.co', 'aceptado')");
    expect(await t.q("select kind from correo_log where kind = 'codigo'")).toEqual([{ kind: "codigo" }]);
  });
});

describe("emitir, verificar y gastar el tiquete", () => {
  it("el camino feliz: se emite, se verifica y el tiquete sirve una sola vez", async () => {
    expect(await emitir()).toEqual({ ok: true });
    expect(await verificar()).toEqual({ ok: true });
    expect(await ticket(false)).toBe(true);
    expect(await ticket(true)).toBe(true);
    // Gastado: no sirve de nuevo.
    expect(await ticket(false)).toBe(false);
    expect(await ticket(true)).toBe(false);
  });

  it("no hay tiquete sin verificar, ni con otro tiquete u otro correo", async () => {
    await t.q("delete from correo_codigos where purpose = $1", [PURPOSE]);
    expect(await emitir()).toEqual({ ok: true });
    expect(await ticket(false)).toBe(false);
    expect(await verificar()).toEqual({ ok: true });
    expect(await ticket(false, EMAIL, "4".repeat(64))).toBe(false);
    expect(await ticket(false, OTRO)).toBe(false);
    expect(await ticket(false, EMAIL, "")).toBe(false);
  });

  it("la base solo guarda huellas: no hay un correo ni un código legibles", async () => {
    const rows = await t.q<Record<string, unknown>>("select * from correo_codigos where purpose = $1", [PURPOSE]);
    for (const row of rows) for (const value of Object.values(row)) expect(String(value)).not.toMatch(/@|udes/);
    expect(await errorOf(t.q("insert into correo_codigos (purpose, email_hash, code_hash, expires_at) values ('pilo_registro', 'laura@mail.udes.edu.co', 'abc', now())"))).toMatch(/correo_codigos_hashes/);
  });

  it("un código incorrecto gasta un intento y, agotados, bloquea incluso al correcto", async () => {
    await t.q("delete from correo_codigos where purpose = $1", [PURPOSE]);
    expect(await emitir(OTRO)).toEqual({ ok: true });
    expect(await verificar(OTRO, MAL)).toEqual({ ok: false, reason: "incorrecto", left: 2 });
    expect(await verificar(OTRO, MAL)).toEqual({ ok: false, reason: "incorrecto", left: 1 });
    expect(await verificar(OTRO, MAL)).toEqual({ ok: false, reason: "bloqueado", left: 0 });
    expect(await verificar(OTRO, CODE)).toEqual({ ok: false, reason: "bloqueado" });
  });

  it("un código vencido no sirve", async () => {
    await t.q("delete from correo_codigos where purpose = $1", [PURPOSE]);
    expect(await emitir()).toEqual({ ok: true });
    await t.q("update correo_codigos set expires_at = now() - interval '1 second' where purpose = $1", [PURPOSE]);
    expect(await verificar()).toEqual({ ok: false, reason: "vencido" });
    // Sin ningún código pendiente, lo mismo.
    expect(await verificar("c".repeat(64))).toEqual({ ok: false, reason: "vencido" });
  });

  it("espera entre envíos; el nuevo invalida al anterior; y hay un tope por hora", async () => {
    await t.q("delete from correo_codigos where purpose = $1", [PURPOSE]);
    expect(await emitir()).toEqual({ ok: true });
    const again = await emitir();
    expect(again).toMatchObject({ ok: false, reason: "espera" });
    expect(again.wait).toBeGreaterThan(0);
    expect(again.wait).toBeLessThanOrEqual(60);
    // Sin espera, el segundo reemplaza al primero: el primero ya no verifica.
    expect(await emitir(EMAIL, MAL, 0)).toEqual({ ok: true });
    expect(await verificar(EMAIL, CODE)).toMatchObject({ ok: false, reason: "incorrecto" });
    expect(await verificar(EMAIL, MAL)).toEqual({ ok: true });
    // El tope por hora: con 2 como máximo, el tercero se rechaza aunque no haya espera.
    await t.q("delete from correo_codigos where purpose = $1", [PURPOSE]);
    expect(await emitir(EMAIL, CODE, 0, 2)).toEqual({ ok: true });
    expect(await emitir(EMAIL, CODE, 0, 2)).toEqual({ ok: true });
    expect(await emitir(EMAIL, CODE, 0, 2)).toMatchObject({ ok: false, reason: "limite" });
  });
});

describe("quién llega a estas funciones", () => {
  it("nadie del portal: ni la administración, ni un visitante", async () => {
    for (const fn of ["correo_codigo_emitir($1, $2, $3)", "correo_codigo_verificar($1, $2, $3, $4)", "correo_codigo_ticket($1, $2, $3, false)"]) {
      const params = [PURPOSE, EMAIL, CODE, TICKET].slice(0, fn.includes("$4") ? 4 : 3);
      expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q(`select ${fn}`, params)))).toMatch(/permission denied|42501/i);
    }
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("select * from correo_codigos")))).toMatch(/permission denied/i);
  });
});
