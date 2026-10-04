/* =============================================================================
   Mr. Pilo · lo que lee en otros portales (0127).

   La lectura de una página no entra sola a la memoria: queda en la bandeja del
   Pilo que la leyó y la administración decide. Aquí se comprueba que:

     · solo la función de Pilo anota lecturas y solo la administración las ve
       y las decide;
     · la misma página con el mismo contenido suma una vista; con otro
       contenido, queda pendiente solo la versión nueva;
     · guardarla pide un documento «web» de esa página y de su mismo ámbito;
     · al decidirla se borra su texto de la bandeja;
     · una página ya guardada con ese contenido no vuelve a la bandeja.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = true) => t.asUser(PEOPLE.admin, work, { commit });

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(work: (q: Query) => Promise<T>, commit = true): Promise<T> {
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

const URL_A = "https://www.udes.edu.co/admisiones";
const text = (seed: string) => `## Admisiones\n\n${`${seed} Las inscripciones se hacen en línea y el proceso tiene cuatro pasos. `.repeat(6)}`;

const capture = async (space: string, url: string, body: string, title = "Admisiones") =>
  (await asService((q) => q<{ r: string }>("select pilo_reading_capture($1, $2::jsonb) as r", [space, JSON.stringify({ url, title, body, sections: 1, omitted: 0 })])))[0].r;

const rows = (space: string) =>
  t.q<{ id: string; status: string; seen: number; body: string; url_hash: string; content_hash: string; host: string; doc_id: string | null }>(
    "select id, status, seen, body, url_hash, content_hash, host, doc_id from pilo_readings where space = $1 order by first_seen, id",
    [space],
  );

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("quién puede", () => {
  it("solo la función de Pilo anota una lectura", async () => {
    const reading = JSON.stringify({ url: URL_A, title: "x", body: text("a") });
    for (const who of [PEOPLE.admin, PEOPLE.vx, null]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_reading_capture('ensenanza', $1::jsonb)", [reading])))).toMatch(/permission denied/);
    }
    expect(await rows("ensenanza")).toEqual([]);
  });

  it("no acepta una dirección que no sea de un sitio, ni un texto vacío", async () => {
    expect(await errorOf(capture("ensenanza", "javascript:alert(1)", text("a")))).toMatch(/dirección/);
    expect(await errorOf(capture("ensenanza", URL_A, "corto"))).toMatch(/tamaño/);
    expect(await errorOf(capture("otro", URL_A, text("a")))).toMatch(/Espacio desconocido/);
  });
});

describe("la bandeja", () => {
  it("una página nueva entra pendiente; repetida, suma una vista", async () => {
    expect(await capture("ensenanza", URL_A, text("uno"))).toBe("nueva");
    expect(await capture("ensenanza", URL_A, text("uno"))).toBe("vista");
    const [row] = await rows("ensenanza");
    expect(row).toMatchObject({ status: "pendiente", seen: 2, host: "www.udes.edu.co" });
    expect(row.url_hash).toHaveLength(64);
  });

  it("cada Pilo tiene la suya", async () => {
    expect(await capture("planeacion", URL_A, text("uno"))).toBe("nueva");
    expect(await rows("planeacion")).toHaveLength(1);
    expect(await rows("ensenanza")).toHaveLength(1);
  });

  it("si la página cambió, queda pendiente solo la versión nueva", async () => {
    expect(await capture("ensenanza", URL_A, text("dos"))).toBe("nueva");
    const all = await rows("ensenanza");
    expect(all.map((r) => r.status).sort()).toEqual(["descartada", "pendiente"]);
    expect(all.find((r) => r.status === "descartada")?.body).toBe("");
  });

  it("solo la administración la lee", async () => {
    expect(await t.asUser(PEOPLE.vx, (q) => q("select id from pilo_readings"))).toEqual([]);
    expect(await errorOf(t.asUser(null, (q) => q("select id from pilo_readings")))).toMatch(/permission denied/);
    expect((await asAdmin((q) => q("select id from pilo_readings"), false)).length).toBe(3);
  });
});

describe("decidir", () => {
  it("solo la administración decide, y solo guardar o descartar", async () => {
    const pending = (await rows("ensenanza")).find((r) => r.status === "pendiente")!;
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_reading_decide($1, 'descartada')", [pending.id])))).toMatch(/Solo la administración/);
    expect(await errorOf(asAdmin((q) => q("select pilo_reading_decide($1, 'pendiente')", [pending.id]), false))).toMatch(/se guarda o se descarta/);
  });

  it("guardar pide el documento web de esa página, en su mismo ámbito", async () => {
    const pending = (await rows("ensenanza")).find((r) => r.status === "pendiente")!;
    const doc = (hash: string, space: string, source: string) =>
      asAdmin(async (q) => (await q<{ id: string }>("select pilo_doc_save($1, $2::jsonb) as id", [space, JSON.stringify({ origin: "web", kind: "web", source, title: "Admisiones", external_id: hash, content_hash: pending.content_hash, vis: "publico" })]))[0].id);
    const ajeno = await doc(pending.url_hash, "planeacion", "institucional");
    expect(await errorOf(asAdmin((q) => q("select pilo_reading_decide($1, 'guardada', $2)", [pending.id, ajeno]), false))).toMatch(/otro ámbito/);
    expect(await errorOf(asAdmin((q) => q("select pilo_reading_decide($1, 'guardada')", [pending.id]), false))).toMatch(/otro ámbito/);

    const propio = await doc(pending.url_hash, "ensenanza", "politicas");
    await asAdmin((q) => q("select pilo_reading_decide($1, 'guardada', $2)", [pending.id, propio]));
    const saved = (await rows("ensenanza")).find((r) => r.id === pending.id)!;
    expect(saved).toMatchObject({ status: "guardada", body: "", doc_id: propio });
  });

  it("lo que ya está en la memoria con ese contenido no vuelve a la bandeja", async () => {
    const before = (await rows("ensenanza")).length;
    expect(await capture("ensenanza", URL_A, text("dos"))).toBe("guardada");
    expect(await rows("ensenanza")).toHaveLength(before);
  });

  it("descartar borra el texto y la deja descartada", async () => {
    const [row] = await rows("planeacion");
    await asAdmin((q) => q("select pilo_reading_decide($1, 'descartada')", [row.id]));
    expect((await rows("planeacion"))[0]).toMatchObject({ status: "descartada", body: "", doc_id: null });
    expect(await capture("planeacion", URL_A, text("uno"))).toBe("descartada");
  });
});
