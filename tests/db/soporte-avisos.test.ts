/* =============================================================================
   Portal de agentes (0184) · avisos, festivos y reanudación.

   Los festivos de Colombia se calculan con el traslado a lunes de la Ley
   Emiliani; el horario cierra en festivo; el agente colgado pasa a «Fuera»
   solo; la persona que abre su conversación deja marca; los enlaces y llaves
   de push son solo del servicio; y nadie anónimo ni un agente sin más entra a
   las tablas nuevas.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./harness";

const U = {
  dir: "00000000-0000-4000-a000-0000000000d1",
  a: "00000000-0000-4000-a000-0000000000a1",
  b: "00000000-0000-4000-a000-0000000000a2",
};
const HASH = "a".repeat(64);
const CANAL = "d".repeat(32);

let t: TestDb;
const ids: Record<string, string> = {};
let n = 0;

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
const as = <T>(user: string, work: (q: Query) => Promise<T>) => t.asUser(user, work, { commit: true });
const read = <T>(user: string | null, work: (q: Query) => Promise<T>) => t.asUser(user, work);

async function abrir() {
  n += 1;
  return asService(
    async () =>
      (
        await t.q<{ r: { id: string } }>(
          "select support_open($1, 'Camila Rojas', $2, '3001234567', 'Bucaramanga', 'v1-2026', 'Preguntó por becas.', '¿Hay beca para posgrado?', $3, $4, 'ip') as r",
          ["planeacion", `camila${n}@mail.com`, HASH, CANAL],
        )
      )[0].r,
  );
}
const tick = () => asService(() => t.q("select support_tick()"));

beforeAll(async () => {
  t = await createTestDb({ seed: false });
  for (const [k, u] of Object.entries(U)) await t.q("insert into auth.users (id, email) values ($1, $2)", [u, `${k}@udes.edu.co`]);
  const ag = async (k: string, role: string, name: string) => {
    ids[k] = (await t.q<{ id: string }>("insert into support_agents (name, email, role) values ($1, $2, $3) returning id", [name, `${k}@udes.edu.co`, role]))[0].id;
  };
  await ag("dir", "director", "Dora Directora");
  await ag("a", "agent", "Ana Agente");
  await ag("b", "agent", "Beto Agente");
  await t.q("update support_portals set agent_on = true, schedule = '{}'::jsonb where space = 'planeacion'");
  for (const k of ["dir", "a", "b"] as const) await as(U[k], (q) => q("select support_claim()"));
});
afterAll(async () => {
  await t?.close();
});

describe("los festivos de Colombia", () => {
  it("calcula el año 2026 con el traslado a lunes donde va", async () => {
    const f = await t.q<{ dia: string; nombre: string }>("select to_char(dia, 'YYYY-MM-DD') as dia, nombre from support_colombia_festivos(2026) order by dia");
    const porNombre = new Map(f.map((x) => [x.nombre, x.dia]));
    expect(porNombre.size).toBe(18);
    expect(porNombre.get("Año Nuevo")).toBe("2026-01-01");
    expect(porNombre.get("Día de los Reyes Magos")).toBe("2026-01-12"); // martes → lunes
    expect(porNombre.get("Día de San José")).toBe("2026-03-23"); // jueves → lunes
    expect(porNombre.get("Jueves Santo")).toBe("2026-04-02"); // no se traslada
    expect(porNombre.get("Viernes Santo")).toBe("2026-04-03");
    expect(porNombre.get("Día del Trabajo")).toBe("2026-05-01");
    expect(porNombre.get("La Ascensión del Señor")).toBe("2026-05-18"); // jueves → lunes
    expect(porNombre.get("Corpus Christi")).toBe("2026-06-08"); // jueves → lunes
    expect(porNombre.get("El Sagrado Corazón de Jesús")).toBe("2026-06-15"); // viernes → lunes
    expect(porNombre.get("San Pedro y San Pablo")).toBe("2026-06-29"); // ya era lunes
    expect(porNombre.get("Grito de Independencia")).toBe("2026-07-20");
    expect(porNombre.get("Batalla de Boyacá")).toBe("2026-08-07");
    expect(porNombre.get("La Asunción de la Virgen")).toBe("2026-08-17"); // sábado → lunes
    expect(porNombre.get("Día de la Raza")).toBe("2026-10-12"); // ya era lunes
    expect(porNombre.get("Todos los Santos")).toBe("2026-11-02"); // domingo → lunes
    expect(porNombre.get("Independencia de Cartagena")).toBe("2026-11-16"); // miércoles → lunes
    expect(porNombre.get("La Inmaculada Concepción")).toBe("2026-12-08");
    expect(porNombre.get("Navidad")).toBe("2026-12-25");
  });
  it("el lunes siguiente no mueve lo que ya cae en lunes", async () => {
    expect((await t.q<{ d: string }>("select to_char(support_lunes_siguiente('2026-06-29'), 'YYYY-MM-DD') as d"))[0].d).toBe("2026-06-29");
    expect((await t.q<{ d: string }>("select to_char(support_lunes_siguiente('2026-08-15'), 'YYYY-MM-DD') as d"))[0].d).toBe("2026-08-17");
  });
  it("la migración deja cargados el año que corre y el siguiente", async () => {
    const anio = new Date().getFullYear();
    const rows = await t.q<{ n: string }>("select count(*) as n from support_holidays where extract(year from dia) in ($1, $2)", [anio, anio + 1]);
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(36);
  });
  it("el director carga un año nuevo y repetir no duplica", async () => {
    await as(U.dir, (q) => q("select support_festivos_cargar(2028)"));
    const una = await t.q<{ n: string }>("select count(*) as n from support_holidays where extract(year from dia) = 2028");
    expect(Number(una[0].n)).toBe(18);
    const otraVez = await as(U.dir, (q) => q<{ n: number }>("select support_festivos_cargar(2028) as n"));
    expect(Number(otraVez[0].n)).toBe(0);
  });
  it("un agente no carga festivos", async () => {
    expect(await errorOf(as(U.a, (q) => q("select support_festivos_cargar(2029)")))).toMatch(/director/i);
  });
});

describe("el horario cierra en festivo", () => {
  const LUNES = '{"tz":"America/Bogota","days":{"1":[["08:00","18:00"]]}}';
  it("un lunes festivo con horario no abre", async () => {
    await t.q("update support_portals set schedule = $1::jsonb where space = 'ensenanza'", [LUNES]);
    // 12 de enero de 2026, Día de los Reyes Magos (trasladado al lunes), 10:00 en Bogotá.
    const festivo = (await t.q<{ o: boolean }>("select support_portal_open('ensenanza', '2026-01-12T15:00:00Z'::timestamptz) as o"))[0].o;
    expect(festivo).toBe(false);
  });
  it("un lunes normal con horario abre", async () => {
    const normal = (await t.q<{ o: boolean }>("select support_portal_open('ensenanza', '2026-01-19T15:00:00Z'::timestamptz) as o"))[0].o;
    expect(normal).toBe(true);
  });
});

describe("el agente colgado", () => {
  it("la base no le cambia la disponibilidad: quien no late sigue «en línea» en su fila", async () => {
    await as(U.a, (q) => q("select support_set_availability('en_linea')"));
    await t.q("update support_agents set last_seen_at = now() - interval '10 minutes' where id = $1", [ids.a]);
    await tick();
    const estado = await t.q<{ av: string }>("select availability as av from support_agents where id = $1", [ids.a]);
    expect(estado[0].av).toBe("en_linea"); // la pantalla lo muestra «Fuera» (useAgents); la base no lo toca
  });
  it("y el reparto sí lo respeta: sin latido reciente no se le ofrece nada", async () => {
    await as(U.a, (q) => q("select support_set_availability('en_linea')"));
    await t.q("update support_agents set last_seen_at = now() - interval '10 minutes' where id = $1", [ids.a]);
    const { id } = await abrir();
    await tick();
    const conversacion = await t.q<{ status: string; offered_to: string | null }>("select status, offered_to from support_conversations where id = $1", [id]);
    expect(conversacion[0].status).toBe("queued");
    expect(conversacion[0].offered_to).toBeNull();
    await t.q("delete from support_conversations where id = $1", [id]);
  });
  it("quien vuelve y late, vuelve a recibir ofertas sin tocar nada", async () => {
    await as(U.a, (q) => q("select support_set_availability('en_linea')"));
    await as(U.a, (q) => q("select support_heartbeat()"));
    const { id } = await abrir();
    await tick();
    const conversacion = await t.q<{ status: string }>("select status from support_conversations where id = $1", [id]);
    expect(conversacion[0].status).toBe("offered");
    await t.q("delete from support_conversations where id = $1", [id]);
  });
});

describe("la persona abre su conversación", () => {
  it("la vista deja la marca de que estuvo ahí", async () => {
    const { id } = await abrir();
    await asService(async () => {
      await t.q("select support_student_view($1, $2)", [id, HASH]);
    });
    const marca = await t.q<{ visto: string | null }>("select student_last_seen_at as visto from support_conversations where id = $1", [id]);
    expect(marca[0].visto).not.toBeNull();
    await t.q("delete from support_conversations where id = $1", [id]);
  });
});

describe("las reglas nuevas del reparto", () => {
  it("vienen con valores por defecto sanos", async () => {
    const pol = await t.q<{ stale: number; esc: number; calma: number }>("select stale_minutes as stale, escalate_after_minutes as esc, escalate_cooldown_hours as calma from support_assignment_policy where id = 1");
    expect(pol[0].stale).toBe(3);
    expect(pol[0].esc).toBe(15);
    expect(pol[0].calma).toBe(2);
  });
});

describe("las tablas nuevas son del servicio", () => {
  it("un agente lee los festivos pero no entra a push, tokens ni secretos", async () => {
    const festivos = await read(U.a, (q) => q<{ n: string }>("select count(*) as n from support_holidays"));
    expect(Number(festivos[0].n)).toBeGreaterThan(0);
    for (const tabla of ["support_push_subscriptions", "support_push_config", "support_resume_tokens", "support_resume_secrets"]) {
      const rows = await read(U.a, (q) => q<{ n: string }>(`select count(*) as n from ${tabla}`));
      expect(Number(rows[0].n), tabla).toBe(0);
      expect(await errorOf(as(U.a, (q) => q(`insert into ${tabla} default values`))), tabla).toBeTruthy();
    }
  });
  it("nadie anónimo lee nada", async () => {
    const rows = await read(null, (q) => q<{ n: string }>("select count(*) as n from support_holidays"));
    expect(Number(rows[0].n)).toBe(0);
  });
  it("el servicio guarda llaves VAPID y suscripciones", async () => {
    await t.q("update support_push_config set public_key = 'pk', private_key = 'sk' where id = 1");
    await t.q("insert into support_push_subscriptions (agent_id, endpoint, p256dh, auth_key) values ($1, 'https://push.example/uno', 'p', 'a')", [ids.a]);
    const sub = await t.q<{ n: string }>("select count(*) as n from support_push_subscriptions where agent_id = $1", [ids.a]);
    expect(Number(sub[0].n)).toBe(1);
  });
  it("un token de reanudación vive con su conversación", async () => {
    const { id } = await abrir();
    await t.q("insert into support_resume_secrets (conversation_id, crypt) values ($1, 'cifrado')", [id]);
    await t.q("insert into support_resume_tokens (conversation_id, token_hash, expires_at) values ($1, $2, now() + interval '30 days')", [id, "f".repeat(64)]);
    const filas = await t.q<{ n: string }>("select count(*) as n from support_resume_tokens where conversation_id = $1 and used_at is null", [id]);
    expect(Number(filas[0].n)).toBe(1);
    await t.q("delete from support_conversations where id = $1", [id]);
    const quedan = await t.q<{ n: string }>("select count(*) as n from support_resume_tokens");
    expect(Number(quedan[0].n)).toBe(0); // se van en cascada con la conversación
  });
});
