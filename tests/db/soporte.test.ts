/* =============================================================================
   Portal de agentes (0181/0182) · lo que no puede fallar.

   El reparto round-robin respeta la capacidad; una oferta vencida pasa al
   siguiente; el ciclo no se salta pasos; el horario de atención se lee en hora
   de Bogotá; los adjuntos se validan en el servidor; la persona anónima solo
   entra con el secreto de su conversación; un agente ve lo de sus equipos y el
   director todo; las notas privadas no llegan a la persona; y nadie anónimo
   toca las tablas.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./harness";
import { STATUSES, canMove } from "../../src/modules/soporte/estados";

const U = {
  dir: "00000000-0000-4000-a000-0000000000d1",
  a: "00000000-0000-4000-a000-0000000000a1",
  b: "00000000-0000-4000-a000-0000000000a2",
  c: "00000000-0000-4000-a000-0000000000a3",
  nadie: "00000000-0000-4000-a000-0000000000e9",
};
const HASH = "a".repeat(64);
const OTRA = "b".repeat(64);
const CANAL = "c".repeat(32);

let t: TestDb;
const ids: Record<string, string> = {};
let n = 0;

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
/** Una acción de un agente que se queda guardada. */
const as = <T>(user: string, work: (q: Query) => Promise<T>) => t.asUser(user, work, { commit: true });
/** Una lectura (o un intento) que se revierte. */
const read = <T>(user: string | null, work: (q: Query) => Promise<T>) => t.asUser(user, work);

async function abrir(over: Partial<{ email: string; space: string; policy: string; hash: string }> = {}) {
  n += 1;
  return asService(
    async () =>
      (
        await t.q<{ r: { id: string; after_hours: boolean } }>(
          "select support_open($1, 'Camila Rojas', $2, '3001234567', 'Bucaramanga', $3, 'Preguntó por becas.', '¿Hay beca para posgrado?', $4, $5, 'ip') as r",
          [over.space ?? "planeacion", over.email ?? `camila${n}@mail.com`, over.policy ?? "v1-2026", over.hash ?? HASH, CANAL],
        )
      )[0].r,
  );
}
const estado = async (id: string) =>
  (await t.q<{ status: string; offered_to: string | null; assignee_id: string | null; declined_by: string[] }>("select status, offered_to, assignee_id, declined_by from support_conversations where id = $1", [id]))[0];
const tick = () => asService(() => t.q("select support_tick()"));
const enLinea = (u: string) => as(u, (q) => q("select support_set_availability('en_linea')"));
const vencer = (id: string) => t.q("update support_conversations set offer_expires_at = now() - interval '1 second' where id = $1", [id]);
const borrar = (...list: string[]) => Promise.all(list.map((id) => t.q("delete from support_conversations where id = $1", [id])));
const count = async (u: string, sql: string) => Number((await read(u, (q) => q<{ n: string }>(sql)))[0].n);

beforeAll(async () => {
  t = await createTestDb({ seed: false });
  for (const [k, u] of Object.entries(U)) await t.q("insert into auth.users (id, email) values ($1, $2)", [u, `${k}@udes.edu.co`]);
  const ag = async (k: string, role: string, name: string) => {
    ids[k] = (await t.q<{ id: string }>("insert into support_agents (name, email, role) values ($1, $2, $3) returning id", [name, `${k}@udes.edu.co`, role]))[0].id;
  };
  await ag("dir", "director", "Dora Directora");
  await ag("a", "agent", "Ana Agente");
  await ag("b", "agent", "Beto Agente");
  await ag("c", "agent", "Carla Afuera");
  const team = (await t.q<{ id: string }>("insert into support_teams (name) values ('Mercadeo') returning id"))[0].id;
  await t.q("insert into support_team_members (team_id, agent_id) values ($1, $2), ($1, $3)", [team, ids.a, ids.b]);
  await t.q("update support_portals set agent_on = true, team_id = $1, schedule = '{}'::jsonb where space = 'planeacion'", [team]);
  for (const k of ["dir", "a", "b", "c"] as const) await as(U[k], (q) => q("select support_claim()"));
});
afterAll(async () => {
  await t?.close();
});

describe("el ciclo de la conversación", () => {
  it("la base y la pantalla permiten exactamente las mismas transiciones", async () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const r = await t.q<{ ok: boolean }>("select support_transition_ok($1, $2) as ok", [from, to]);
        expect(r[0].ok, `${from} → ${to}`).toBe(canMove(from, to));
      }
    }
  });
});

describe("el horario de atención", () => {
  const horario = '{"tz":"America/Bogota","days":{"1":[["08:00","12:00"],["14:00","18:00"]],"5":[["08:00","12:00"]]}}';
  const abierto = async (at: string) => (await t.q<{ o: boolean }>("select support_portal_open('ensenanza', $1::timestamptz) as o", [at]))[0].o;
  it("lee la ventana en hora de Bogotá", async () => {
    await t.q("update support_portals set schedule = $1::jsonb where space = 'ensenanza'", [horario]);
    expect(await abierto("2026-10-19T14:00:00Z")).toBe(true); // lunes 09:00
    expect(await abierto("2026-10-19T17:30:00Z")).toBe(false); // lunes 12:30, almuerzo
    expect(await abierto("2026-10-19T20:00:00Z")).toBe(true); // lunes 15:00
    expect(await abierto("2026-10-19T23:00:00Z")).toBe(false); // lunes 18:00 en punto
    expect(await abierto("2026-10-19T12:59:00Z")).toBe(false); // lunes 07:59
    expect(await abierto("2026-10-20T15:00:00Z")).toBe(false); // martes sin ventanas
    expect(await abierto("2026-10-24T15:00:00Z")).toBe(false); // sábado
    expect(await abierto("2026-10-23T15:00:00Z")).toBe(true); // viernes 10:00
    expect(await abierto("2026-10-23T20:00:00Z")).toBe(false); // viernes 15:00
  });
  it("sin horario siempre hay atención", async () => {
    await t.q("update support_portals set schedule = '{}'::jsonb where space = 'ensenanza'");
    expect(await abierto("2026-10-24T03:00:00Z")).toBe(true);
  });
});

describe("abrir la conversación", () => {
  it("exige la autorización de datos y que el portal tenga atención por agente", async () => {
    expect(await errorOf(abrir({ policy: "" }))).toMatch(/autorización/);
    expect(await errorOf(abrir({ space: "ensenanza" }))).toMatch(/no tiene atención/);
  });
  it("registra el consentimiento y deja la conversación en cola con el resumen de Pilo", async () => {
    const { id, after_hours } = await abrir();
    expect(after_hours).toBe(false);
    expect((await estado(id)).status).toBe("queued");
    const [c] = await t.q<{ policy_version: string }>("select policy_version from support_consents where conversation_id = $1", [id]);
    expect(c.policy_version).toBe("v1-2026");
    const notas = await t.q<{ body: string; staff_only: boolean }>("select body, staff_only from support_messages where conversation_id = $1", [id]);
    expect(notas.some((m) => m.body.startsWith("Resumen de Pilo") && m.staff_only)).toBe(true);
    await borrar(id);
  });
  it("una persona con una conversación abierta no abre otra", async () => {
    const { id } = await abrir({ email: "repetida@mail.com" });
    expect(await errorOf(abrir({ email: "repetida@mail.com" }))).toMatch(/Ya tiene/);
    await borrar(id);
  });
  it("fuera de horario queda en cola, marcada, y no se ofrece a nadie hasta que abra", async () => {
    await t.q('update support_portals set schedule = \'{"tz":"America/Bogota","days":{"1":[["03:00","03:01"]]}}\'::jsonb where space = \'planeacion\'');
    await enLinea(U.a);
    const { id, after_hours } = await abrir({ email: "tarde@mail.com" });
    expect(after_hours).toBe(true);
    await tick();
    expect((await estado(id)).status).toBe("queued");
    await t.q("update support_portals set schedule = '{}'::jsonb where space = 'planeacion'");
    await tick();
    expect((await estado(id)).status).toBe("offered");
    await borrar(id);
    await t.q("update support_agents set availability = 'fuera'");
  });
});

describe("el reparto round-robin", () => {
  it("no ofrece a quien está fuera, ocupado, sin latido o de otro equipo", async () => {
    await as(U.c, (q) => q("select support_set_availability('en_linea')"));
    await as(U.b, (q) => q("select support_set_availability('ocupado')"));
    const { id } = await abrir({ email: "solo@mail.com" });
    expect((await estado(id)).status).toBe("queued"); // Carla está en línea pero no es del equipo
    await t.q("update support_agents set availability = 'en_linea', last_seen_at = now() - interval '5 minutes' where id = $1", [ids.a]);
    await tick();
    expect((await estado(id)).status).toBe("queued"); // sin latido reciente
    await as(U.a, (q) => q("select support_heartbeat()"));
    const e = await estado(id);
    expect(e.status).toBe("offered");
    expect(e.offered_to).toBe(ids.a);
    await borrar(id);
    await t.q("update support_agents set availability = 'fuera'");
  });

  it("reparte por turnos y respeta la capacidad", async () => {
    await t.q("update support_agents set capacity = 1 where id in ($1, $2)", [ids.a, ids.b]);
    await enLinea(U.a);
    await enLinea(U.b);
    const c1 = await abrir({ email: "r1@mail.com" });
    const c2 = await abrir({ email: "r2@mail.com" });
    const c3 = await abrir({ email: "r3@mail.com" });
    const e1 = await estado(c1.id);
    const e2 = await estado(c2.id);
    expect(e1.status).toBe("offered");
    expect(e2.status).toBe("offered");
    expect(new Set([e1.offered_to, e2.offered_to]).size).toBe(2); // una para cada agente
    expect((await estado(c3.id)).status).toBe("queued"); // los dos están al tope

    const primero = e1.offered_to === ids.a ? U.a : U.b;
    await as(primero, (q) => q("select support_accept($1)", [c1.id]));
    await as(primero, (q) => q("select support_resolve($1)", [c1.id]));
    await tick();
    const e3 = await estado(c3.id);
    expect(e3.status).toBe("offered");
    expect(e3.offered_to).toBe(e1.offered_to); // quedó libre y recibe la siguiente
    await borrar(c1.id, c2.id, c3.id);
    await t.q("update support_agents set capacity = null, availability = 'fuera'");
  });

  it("atiende primero a la que más lleva esperando cuando la regla lo pide", async () => {
    await t.q("update support_assignment_policy set queue_order = 'longest_wait' where id = 1");
    const x = await abrir({ email: "o1@mail.com" });
    const y = await abrir({ email: "o2@mail.com" });
    await t.q("update support_conversations set waiting_since = now() - interval '1 hour' where id = $1", [y.id]);
    await t.q("update support_assignment_policy set default_capacity = 1 where id = 1");
    await enLinea(U.a);
    expect((await estado(y.id)).offered_to).toBe(ids.a);
    expect((await estado(x.id)).status).toBe("queued");
    await borrar(x.id, y.id);
    await t.q("update support_assignment_policy set queue_order = 'oldest', default_capacity = 5 where id = 1");
    await t.q("update support_agents set availability = 'fuera'");
  });
});

describe("las ofertas", () => {
  it("una oferta vencida pasa al siguiente y nadie la acepta tarde", async () => {
    await enLinea(U.a);
    await enLinea(U.b);
    const { id } = await abrir({ email: "of1@mail.com" });
    const primera = (await estado(id)).offered_to as string;
    await vencer(id);
    const tarde = primera === ids.a ? U.a : U.b;
    expect(await errorOf(as(tarde, (q) => q("select support_accept($1)", [id])))).toMatch(/venció/);
    await tick();
    const e = await estado(id);
    expect(e.status).toBe("offered");
    expect(e.offered_to).not.toBe(primera);
    expect(e.declined_by).toContain(primera);
    const [audit] = await t.q<{ n: string }>("select count(*) n from support_audit where conversation_id = $1 and action = 'offer_expired'", [id]);
    expect(Number(audit.n)).toBe(1);
    await borrar(id);
  });

  it("si todos la dejan vencer, la ronda vuelve a empezar", async () => {
    const { id } = await abrir({ email: "of2@mail.com" });
    for (let i = 0; i < 3; i += 1) {
      await vencer(id);
      await tick();
    }
    expect((await estado(id)).status).toBe("offered");
    await borrar(id);
  });

  it("quien la rechaza no la recibe de nuevo y solo el ofrecido la acepta", async () => {
    const { id } = await abrir({ email: "of3@mail.com" });
    const e = await estado(id);
    const yo = e.offered_to === ids.a ? U.a : U.b;
    const otro = yo === U.a ? U.b : U.a;
    expect(await errorOf(as(otro, (q) => q("select support_accept($1)", [id])))).toMatch(/ya no se le ofrece/);
    await as(yo, (q) => q("select support_decline($1)", [id]));
    const despues = await estado(id);
    expect(despues.offered_to).not.toBe(e.offered_to);
    expect(despues.declined_by).toContain(e.offered_to);
    await borrar(id);
  });
});

describe("tomar y repartir a mano", () => {
  it("un agente toma lo que espera en su cola y el director reparte al más libre", async () => {
    await t.q("update support_agents set availability = 'fuera'");
    const x = (await abrir({ email: "toma@mail.com" })).id;
    expect((await estado(x)).status).toBe("queued");
    expect(await errorOf(as(U.c, (q) => q("select support_take($1)", [x])))).toMatch(/No tiene acceso/);
    await as(U.a, (q) => q("select support_take($1)", [x]));
    const e = await estado(x);
    expect(e.status).toBe("open");
    expect(e.assignee_id).toBe(ids.a);
    expect(await errorOf(as(U.b, (q) => q("select support_take($1)", [x])))).toMatch(/ya no está esperando/);

    const y = (await abrir({ email: "reparte@mail.com" })).id;
    expect(await errorOf(as(U.a, (q) => q("select support_assign_best($1)", [y])))).toMatch(/Solo el director/);
    const nadie = await as(U.dir, (q) => q<{ r: boolean }>("select support_assign_best($1) as r", [y]));
    expect(nadie[0].r).toBe(false); // nadie en línea
    await t.q("update support_agents set availability = 'en_linea', last_seen_at = now() where id = $1", [ids.b]);
    const alguien = await as(U.dir, (q) => q<{ r: boolean }>("select support_assign_best($1) as r", [y]));
    expect(alguien[0].r).toBe(true);
    expect((await estado(y)).offered_to).toBe(ids.b);
    await borrar(x, y);
    await t.q("update support_agents set availability = 'fuera'");
  });
});

describe("el chat", () => {
  let conv = "";
  const vista = async (hash = HASH) =>
    asService(
      async () =>
        (await t.q<{ v: { status: string; agent: { name: string } | null; messages: { author_kind: string; body: string; kind: string }[] } }>("select support_student_view($1, $2) as v", [conv, hash]))[0].v,
    );

  it("al aceptar, Pilo se despide con sus palabras y entra el agente", async () => {
    await t.q("update support_agents set availability = 'fuera'");
    await enLinea(U.a);
    conv = (await abrir({ email: "chat@mail.com" })).id;
    expect((await estado(conv)).offered_to).toBe(ids.a);
    expect(await errorOf(as(U.a, (q) => q("select support_send($1, 'hola')", [conv])))).toMatch(/Solo quien atiende/);
    await as(U.a, (q) => q("select support_accept($1)", [conv]));
    const v = await vista();
    expect(v.status).toBe("open");
    expect(v.agent?.name).toBe("Ana Agente");
    expect(v.messages.find((m) => m.author_kind === "pilo")?.body).toBe(
      "Hasta aquí termino yo, pero te dejo con un experto de la UDES que te puede ayudar. Recuerda que Pilo siempre está aquí cuando lo necesites.",
    );
  });

  it("la persona solo entra con su secreto", async () => {
    expect(await errorOf(vista(OTRA))).toMatch(/No encontramos/);
    expect(await errorOf(asService(() => t.q("select support_student_send($1, $2, 'hola')", [conv, OTRA])))).toMatch(/No encontramos/);
  });

  it("las notas privadas y los avisos del equipo no llegan a la persona", async () => {
    await as(U.a, (q) => q("select support_send($1, 'Ojo: es egresada', true)", [conv]));
    await as(U.a, (q) => q("select support_send($1, 'Hola Camila, ¿en qué te ayudo?')", [conv]));
    await asService(() => t.q("select support_student_send($1, $2, 'Quiero saber de becas')", [conv, HASH]));
    const v = await vista();
    const cuerpos = v.messages.map((m) => m.body).join("|");
    expect(cuerpos).toContain("Hola Camila");
    expect(cuerpos).toContain("Quiero saber de becas");
    expect(cuerpos).not.toContain("egresada");
    expect(cuerpos).not.toContain("Resumen de Pilo");
    expect(v.messages.every((m) => m.kind !== "private_note")).toBe(true);
  });

  it("los estados de lectura: enviado, entregado, leído", async () => {
    const msg = async () => (await t.q<{ status: string }>("select status from support_messages where conversation_id = $1 and kind = 'outgoing' and author_kind = 'agent'", [conv]))[0].status;
    expect(await msg()).toBe("delivered"); // la vista de arriba lo entregó
    await asService(() => t.q("select support_student_read($1, $2)", [conv, HASH]));
    expect(await msg()).toBe("read");
    await as(U.a, (q) => q("select support_mark_read($1)", [conv]));
    const [leido] = await t.q<{ status: string }>("select status from support_messages where conversation_id = $1 and kind = 'incoming'", [conv]);
    expect(leido.status).toBe("read");
  });

  it("reasignar avisa a la persona, deja nota privada y se puede deshacer", async () => {
    expect(await errorOf(as(U.b, (q) => q("select support_reassign($1, $2)", [conv, ids.b])))).toMatch(/Solo quien la atiende/);
    await as(U.a, (q) => q("select support_reassign($1, $2, 'Sabe de becas')", [conv, ids.b]));
    expect((await estado(conv)).assignee_id).toBe(ids.b);
    const v = await vista();
    expect(v.agent?.name).toBe("Beto Agente");
    expect(v.messages.at(-1)?.body).toBe("Te pasamos con Beto Agente, que ya conoce tu caso.");
    const [nota] = await t.q<{ body: string }>("select body from support_messages where conversation_id = $1 and kind = 'private_note' and body like 'Motivo%'", [conv]);
    expect(nota.body).toContain("Sabe de becas");

    await as(U.a, (q) => q("select support_undo_reassign($1)", [conv]));
    expect((await estado(conv)).assignee_id).toBe(ids.a);
    const acciones = await t.q<{ action: string }>("select action from support_audit where conversation_id = $1 and action in ('reassign','undo') order by id", [conv]);
    expect(acciones.map((a) => a.action)).toEqual(["reassign", "undo"]);
    expect(await errorOf(as(U.a, (q) => q("select support_undo_reassign($1)", [conv])))).toMatch(/Ya no se puede deshacer/);
  });

  it("cerrar, calificar una sola vez y que ya no se escriba", async () => {
    expect(await errorOf(asService(() => t.q("select support_student_rate($1, $2, 5)", [conv, HASH])))).toMatch(/No se puede calificar/);
    await as(U.a, (q) => q("select support_resolve($1)", [conv]));
    expect((await estado(conv)).status).toBe("resolved");
    expect(await errorOf(asService(() => t.q("select support_student_rate($1, $2, 9)", [conv, HASH])))).toMatch(/1 a 5/);
    await asService(() => t.q("select support_student_rate($1, $2, 5, 'Muy amable')", [conv, HASH]));
    expect(await errorOf(asService(() => t.q("select support_student_rate($1, $2, 1)", [conv, HASH])))).toMatch(/No se puede calificar/);
    expect(await errorOf(asService(() => t.q("select support_student_send($1, $2, 'hola')", [conv, HASH])))).toMatch(/ya se cerró/);
  });

  it("reabrir y posponer: la persona que escribe reabre sola", async () => {
    await as(U.a, (q) => q("select support_reopen($1)", [conv]));
    await as(U.a, (q) => q("select support_snooze($1)", [conv]));
    expect((await estado(conv)).status).toBe("snoozed");
    await asService(() => t.q("select support_student_send($1, $2, 'Sigo aquí')", [conv, HASH]));
    expect((await estado(conv)).status).toBe("open");
  });

  it("devolver a la cola la reparte al resto del equipo; las etiquetas y la prioridad se guardan", async () => {
    await t.q("update support_agents set availability = 'fuera'");
    await enLinea(U.a);
    const c = (await abrir({ email: "cola@mail.com" })).id;
    await as(U.a, (q) => q("select support_accept($1)", [c]));
    await enLinea(U.b);
    await as(U.a, (q) => q("select support_requeue($1, null, 'Es de pagos')", [c]));
    const e = await estado(c);
    expect(e.status).toBe("offered");
    expect(e.offered_to).toBe(ids.b);
    expect(e.assignee_id).toBeNull();
    await as(U.b, (q) => q("select support_update($1, array['pagos','pagos','urgente-no'], 'alta')", [c]));
    const [fila] = await t.q<{ labels: string[]; priority: string }>("select labels, priority from support_conversations where id = $1", [c]);
    expect(fila.priority).toBe("alta");
    expect(fila.labels.sort()).toEqual(["pagos", "urgente-no"]);
    expect(await errorOf(as(U.b, (q) => q("select support_update($1, null, 'ya')", [c])))).toMatch(/Prioridad desconocida/);
    await borrar(c);
    await t.q("update support_agents set availability = 'fuera'");
  });

  it("volver a Pilo mientras espera cierra la solicitud", async () => {
    const c = await abrir({ email: "cancela@mail.com", hash: OTRA });
    await asService(() => t.q("select support_student_cancel($1, $2)", [c.id, OTRA]));
    expect((await estado(c.id)).status).toBe("resolved");
    await borrar(c.id);
  });
});

describe("los adjuntos", () => {
  const sube = (name: string, mimetype: string, size: number) =>
    t.q("insert into storage.objects (bucket_id, name, metadata) values ('support-attachments', $1, $2::jsonb)", [name, JSON.stringify({ mimetype, size })]);
  let conv = "";
  const enviar = (files: unknown[]) => as(U.a, (q) => q("select support_send($1, 'x', false, $2::jsonb)", [conv, JSON.stringify(files)]));

  it("se validan en el servidor: tamaño, tipo y carpeta", async () => {
    await t.q("update support_agents set availability = 'fuera'");
    await enLinea(U.a);
    conv = (await abrir({ email: "adj@mail.com" })).id;
    await as(U.a, (q) => q("select support_accept($1)", [conv]));
    await sube(`${conv}/ok.pdf`, "application/pdf", 2_000_000);
    await sube(`${conv}/grande.pdf`, "application/pdf", 10_485_761);
    await sube(`${conv}/virus.exe`, "application/x-msdownload", 1000);
    await sube(`${conv}/svg.svg`, "image/svg+xml", 1000);
    await sube(`${U.a}/ajeno.pdf`, "application/pdf", 1000);

    await enviar([{ path: `${conv}/ok.pdf`, name: "ok.pdf" }]);
    const [a] = await t.q<{ mime: string; size: string }>("select mime, size from support_attachments where conversation_id = $1", [conv]);
    expect(a.mime).toBe("application/pdf");
    expect(Number(a.size)).toBe(2_000_000);

    expect(await errorOf(enviar([{ path: `${conv}/grande.pdf`, name: "x" }]))).toMatch(/no se admite/);
    expect(await errorOf(enviar([{ path: `${conv}/virus.exe`, name: "x" }]))).toMatch(/no se admite/);
    expect(await errorOf(enviar([{ path: `${conv}/svg.svg`, name: "x" }]))).toMatch(/no se admite/);
    expect(await errorOf(enviar([{ path: `${U.a}/ajeno.pdf`, name: "x" }]))).toMatch(/no pertenece/);
    expect(await errorOf(enviar([{ path: `${conv}/no-existe.pdf`, name: "x" }]))).toMatch(/No se encontró/);
  });

  it("máximo cinco archivos por mensaje", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ path: `${conv}/ok.pdf`, name: `${i}` }));
    expect(await errorOf(enviar(seis))).toMatch(/hasta 5/);
  });
});

describe("quién ve qué (RLS)", () => {
  let visible = "";

  it("el agente ve las conversaciones de su equipo; sin equipo no; el director, todo", async () => {
    visible = (await abrir({ email: "rls@mail.com" })).id;
    const sql = "select count(*) n from support_conversations";
    expect(await count(U.a, sql)).toBeGreaterThan(0);
    expect(await count(U.b, sql)).toBeGreaterThan(0); // mismo equipo
    expect(await count(U.c, sql)).toBe(0); // en línea, pero sin equipo y sin asignación
    expect(await count(U.dir, sql)).toBeGreaterThan(0);
    expect(await count(U.nadie, sql)).toBe(0); // con sesión, pero no es agente
  });

  it("nadie anónimo toca las tablas", async () => {
    for (const tabla of ["support_conversations", "support_messages", "support_contacts", "support_agents", "support_consents", "support_portals"]) {
      expect(await errorOf(read(null, (q) => q(`select * from ${tabla}`)))).toMatch(/permission denied/);
    }
  });

  it("las notas privadas y los datos de contacto los ven solo quienes ven la conversación", async () => {
    const abierta = (await t.q<{ id: string }>("select id from support_conversations where status = 'open' limit 1"))[0].id;
    await as(U.a, (q) => q("select support_send($1, 'nota interna', true)", [abierta]));
    const notas = "select count(*) n from support_messages where kind = 'private_note'";
    expect(await count(U.a, notas)).toBeGreaterThan(0);
    expect(await count(U.c, notas)).toBe(0);
    expect(await count(U.c, "select count(*) n from support_contacts")).toBe(0);
    expect(await count(U.a, "select count(*) n from support_contacts")).toBeGreaterThan(0);
  });

  it("las autorizaciones de datos solo las ve el director", async () => {
    expect(await count(U.a, "select count(*) n from support_consents")).toBe(0);
    expect(await count(U.dir, "select count(*) n from support_consents")).toBeGreaterThan(0);
  });

  it("el chat no se escribe a mano: solo por las funciones", async () => {
    expect(await errorOf(read(U.a, (q) => q("update support_conversations set status = 'resolved' where id = $1", [visible])))).toMatch(/permission denied/);
    expect(await errorOf(read(U.a, (q) => q("insert into support_messages (conversation_id, kind, author_kind, body) values ($1, 'outgoing', 'agent', 'x')", [visible])))).toMatch(/permission denied/);
    expect(await errorOf(read(U.a, (q) => q("delete from support_messages where conversation_id = $1", [visible])))).toMatch(/permission denied/);
  });

  it("solo el director administra agentes y reglas, y solo él ve los informes", async () => {
    const apagar = (u: string) =>
      read(u, async (q) => {
        await q("update support_assignment_policy set auto_assign = false where id = 1");
        return Number((await q<{ n: string }>("select count(*) n from support_assignment_policy where auto_assign = false"))[0].n);
      });
    expect(await apagar(U.a)).toBe(0); // la política no lo deja: la fila no cambió
    expect(await apagar(U.dir)).toBe(1);
    expect(await errorOf(read(U.a, (q) => q("insert into support_agents (name, email, role) values ('Intruso', 'i@udes.edu.co', 'director')")))).toMatch(/row-level security/);
    expect(await errorOf(as(U.a, (q) => q("select support_report()")))).toMatch(/Solo el director/);
    const informe = await read(U.dir, async (q) => (await q<{ r: { total: number } }>("select support_report() as r"))[0].r);
    expect(informe.total).toBeGreaterThan(0);
  });

  it("quien no es agente no entra al portal", async () => {
    const claim = await as(U.nadie, (q) => q<{ id: string | null }>("select (support_claim()).id as id"));
    expect(claim[0].id).toBeNull();
    expect(await errorOf(as(U.nadie, (q) => q("select support_heartbeat()")))).toMatch(/No tiene acceso/);
  });

  it("las funciones de la persona anónima son solo del servicio", async () => {
    expect(await errorOf(as(U.a, (q) => q("select support_student_view($1, $2)", [visible, HASH])))).toMatch(/permission denied/);
    expect(await errorOf(read(null, (q) => q("select support_open('planeacion','x y z','a@b.co','','','v1','','','a','b')")))).toMatch(/permission denied/);
  });
});
