/* =============================================================================
   Mr. Pilo · colecciones de documentos propias (0125).

   Una colección es una fila de pilo_sources: crearla, renombrarla y borrarla
   no debe tocar nada de lo demás. Aquí se comprueba que:

     · solo la administración las maneja;
     · el id sale del nombre, solo con letras, y no choca con otro;
     · nace en «no» en la matriz (o en «casa» si se pide), nunca en el otro Pilo;
     · acepta documentos, que se pueden mover de una a otra;
     · las de partida no se renombran ni se borran;
     · una con documentos no se borra; una vacía sí, y no deja rastro.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

let t: TestDb;

const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = true) => t.asUser(PEOPLE.admin, work, { commit });
const create = async (scope: string, name: string, read = false) =>
  (await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_collection_create($1, $2, $3) as r", [scope, name, read])))[0].r;
const matrixOf = async (portal: string) => (await t.q<{ matrix: Record<string, string> }>("select matrix from pilo_portals where id = $1", [portal]))[0].matrix;
const sourceRow = (id: string) => t.q<Record<string, unknown>>("select id, scope, name, kind, staff_only, stays_home, custom from pilo_sources where id = $1", [id]);

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
}, 120_000);

afterAll(() => t?.close());

describe("quién puede", () => {
  it("las de partida quedan marcadas como tales", async () => {
    const rows = await t.q<{ id: string; custom: boolean }>("select id, custom from pilo_sources order by id");
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.custom === false)).toBe(true);
  });

  it("solo la administración crea, renombra y borra", async () => {
    for (const who of [PEOPLE.director, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_collection_create('ensenanza', 'Intrusa')")))).toMatch(/Solo la administración/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_collection_rename('politicas', 'Otra')")))).toMatch(/Solo la administración/);
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_collection_delete('politicas')")))).toMatch(/Solo la administración/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_collection_create('ensenanza', 'Intrusa')")))).toMatch(/permission denied/);
    expect(await t.q("select id from pilo_sources where lower(name) = 'intrusa'")).toEqual([]);
  });

  it("nadie escribe en pilo_sources por su cuenta", async () => {
    expect(await errorOf(asAdmin((q) => q("insert into pilo_sources (id, scope, name, kind, custom) values ('tramposa', 'ensenanza', 'Tramposa', 'documentos', true)"), false))).toMatch(/permission denied/);
  });
});

describe("crear", () => {
  it("el id sale del nombre, sin tildes ni signos, y los dígitos pasan a letras", async () => {
    const a = await create("ensenanza", "  Guías   de Laboratorio ");
    expect(a).toMatchObject({ id: "guiasdelaboratorio", scope: "ensenanza", name: "Guías de Laboratorio", kind: "documentos", custom: true, read: false });
    const b = await create("ensenanza", "Reglamentos 2026");
    expect(b.id).toBe("reglamentoscacg");
    expect(b.id).toMatch(/^[a-z]{3,30}$/);
    expect(await sourceRow("guiasdelaboratorio")).toEqual([{ id: "guiasdelaboratorio", scope: "ensenanza", name: "Guías de Laboratorio", kind: "documentos", staff_only: false, stays_home: false, custom: true }]);
  });

  it("dos años del mismo nombre no chocan; un nombre repetido sí", async () => {
    expect((await create("ensenanza", "Reglamentos 2027")).id).toBe("reglamentoscach");
    expect(await errorOf(create("ensenanza", "reglamentos 2026"))).toMatch(/Ya existe/);
    expect((await create("planeacion", "Guías de laboratorio")).id).toBe("guiasdelaboratoriopla");
    // El mismo nombre en el otro Pilo es otra colección, con su id distinguido por el ámbito.
    expect((await create("ensenanza", "Normativa")).id).toBe("normativaens");
    expect(await errorOf(create("ensenanza", "NORMATIVA"))).toMatch(/Ya existe/);
  });

  it("rechaza lo que no sirve", async () => {
    expect(await errorOf(create("ensenanza", "ab"))).toMatch(/tres letras/);
    expect(await errorOf(create("ensenanza", "¡¡!!"))).toMatch(/tres letras/);
    expect(await errorOf(create("ensenanza", "Mapa"))).toMatch(/reservado/);
    expect(await errorOf(create("otro", "Una colección"))).toMatch(/no existe/);
    expect(await errorOf(create("ensenanza", "Politicas"))).toMatch(/Ya existe/);
  });

  it("nace en «no» en la matriz de los dos Pilos", async () => {
    const id = "guiasdelaboratorio";
    expect((await matrixOf("ensenanza"))[id] ?? "no").toBe("no");
    expect((await matrixOf("planeacion"))[id] ?? "no").toBe("no");
    expect((await asAdmin((q) => q<{ source: string }>("select source from pilo_scope('ensenanza', true, false)"), false)).map((r) => r.source)).not.toContain(id);
  });

  it("con p_read nace «de casa» solo en el Pilo de su ámbito", async () => {
    const r = await create("planeacion", "Directrices del rector", true);
    expect(r).toMatchObject({ scope: "planeacion", read: true });
    expect((await matrixOf("planeacion"))[r.id as string]).toBe("casa");
    expect((await matrixOf("ensenanza"))[r.id as string] ?? "no").toBe("no");
    const seen = await asAdmin((q) => q<{ source: string; mode: string }>("select source, mode from pilo_scope('planeacion', false, false)"), false);
    expect(seen).toContainEqual({ source: r.id, mode: "casa" });
    // El espejo de los interruptores de siempre la refleja.
    const [st] = await t.q<{ memory_sources: Record<string, boolean> }>("select memory_sources from pilo_ai_settings where id = 1");
    expect(st.memory_sources[r.id as string]).toBe(true);
  });

  it("Enseñanza se puede encender con el cambio de celda de siempre", async () => {
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { guiasdelaboratorio: "casa" } })]));
    expect((await matrixOf("ensenanza")).guiasdelaboratorio).toBe("casa");
    // Una colección de Enseñanza no puede ser «de casa» en Planeación.
    expect(await errorOf(asAdmin((q) => q("select pilo_portal_update('planeacion', $1::jsonb)", [JSON.stringify({ matrix: { guiasdelaboratorio: "casa" } })]), false))).toMatch(/solo para las fuentes del propio portal/);
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { guiasdelaboratorio: "no" } })]));
  });

  it("cada Pilo admite hasta 30 colecciones propias", async () => {
    const have = Number((await t.q<{ n: string }>("select count(*) as n from pilo_sources where custom and scope = 'planeacion'"))[0].n);
    for (let i = have; i < 30; i++) await create("planeacion", `Colección ${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${"abcdefghijklmnopqrstuvwxyz"[Math.floor(i / 26)]}x`);
    expect(await errorOf(create("planeacion", "Una más de la cuenta"))).toMatch(/hasta 30/);
    expect((await create("ensenanza", "Todavía cabe en Enseñanza")).scope).toBe("ensenanza");
  });
});

describe("documentos en una colección propia", () => {
  const doc = "33333333-3333-4333-8333-333333333333";

  it("acepta documentos y pasajes, y se pueden mover a otra colección", async () => {
    await asAdmin((q) =>
      q("select pilo_doc_save('ensenanza', $1::jsonb)", [JSON.stringify({ id: doc, kind: "pdf", source: "guiasdelaboratorio", title: "Guía 1", file_path: `ensenanza/${doc}/guia.pdf`, file_name: "guia.pdf", file_hash: "h-guia" })]),
    );
    await asAdmin((q) => q("select pilo_doc_replace($1, $2::jsonb)", [doc, JSON.stringify([{ seq: 1, section: "Uno", body: "Uso seguro del laboratorio de química." }])]));
    expect(await t.q("select source, space from pilo_memory where doc_id = $1", [doc])).toEqual([{ source: "guiasdelaboratorio", space: "ensenanza" }]);

    await asAdmin((q) => q("select pilo_doc_update($1, $2::jsonb)", [doc, JSON.stringify({ source: "reglamentoscacg" })]));
    expect(await t.q("select source from pilo_memory where doc_id = $1", [doc])).toEqual([{ source: "reglamentoscacg" }]);
    expect(await t.q("select source from pilo_docs where id = $1", [doc])).toEqual([{ source: "reglamentoscacg" }]);
  });

  it("no acepta un documento de Enseñanza en una colección de Planeación", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    expect(
      await errorOf(
        asAdmin((q) => q("select pilo_doc_save('ensenanza', $1::jsonb)", [JSON.stringify({ id: other, kind: "pdf", source: "directricesdelrector", title: "X", file_path: `ensenanza/${other}/x.pdf`, file_name: "x.pdf", file_hash: "h-x" })]), false),
      ),
    ).toBeTruthy();
  });
});

describe("renombrar", () => {
  it("cambia el nombre y el del nodo en el mapa, sin tocar el id", async () => {
    await t.q("insert into pilo_nodes (id, source, type, label, space) values ('fuente:reglamentoscacg', 'mapa', 'fuente', 'Reglamentos 2026', 'ensenanza') on conflict (id) do nothing");
    const r = await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_collection_rename('reglamentoscacg', '  Reglamentos   vigentes ') as r"));
    expect(r[0].r).toEqual({ id: "reglamentoscacg", scope: "ensenanza", name: "Reglamentos vigentes" });
    expect((await sourceRow("reglamentoscacg"))[0].name).toBe("Reglamentos vigentes");
    expect(await t.q("select label from pilo_nodes where id = 'fuente:reglamentoscacg'")).toEqual([{ label: "Reglamentos vigentes" }]);
  });

  it("no se repite un nombre del mismo Pilo y las de partida no se tocan", async () => {
    expect(await errorOf(asAdmin((q) => q("select pilo_collection_rename('reglamentoscacg', 'guías de laboratorio')"), false))).toMatch(/Ya existe/);
    expect(await errorOf(asAdmin((q) => q("select pilo_collection_rename('reglamentoscacg', 'x')"), false))).toMatch(/tres letras/);
    expect(await errorOf(asAdmin((q) => q("select pilo_collection_rename('politicas', 'Otro nombre')"), false))).toMatch(/de partida/);
    expect(await errorOf(asAdmin((q) => q("select pilo_collection_rename('nohay', 'Otro nombre')"), false))).toMatch(/no existe/);
  });
});

describe("borrar", () => {
  const doc = "33333333-3333-4333-8333-333333333333";

  it("no borra una colección con documentos y dice cuántos", async () => {
    expect(await errorOf(asAdmin((q) => q("select pilo_collection_delete('reglamentoscacg')"), false))).toMatch(/1 documento y 1 pasaje/);
    expect(await sourceRow("reglamentoscacg")).toHaveLength(1);
  });

  it("las de partida no se borran", async () => {
    for (const id of ["politicas", "cifras", "moodle", "normativa"]) {
      expect(await errorOf(asAdmin((q) => q("select pilo_collection_delete($1)", [id]), false))).toMatch(/de partida/);
    }
    expect(await t.q("select id from pilo_sources")).toHaveLength(12 + Number((await t.q<{ n: string }>("select count(*) as n from pilo_sources where custom"))[0].n));
  });

  it("vacía, se borra sin dejar rastro: ni fuente, ni celda, ni interruptor, ni nodo", async () => {
    await asAdmin((q) => q("select pilo_doc_delete($1)", [doc]));
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { reglamentoscacg: "casa" } })]));
    expect((await t.q<{ memory_sources: Record<string, boolean> }>("select memory_sources from pilo_spaces where id = 'ensenanza'"))[0].memory_sources.reglamentoscacg).toBe(true);

    const r = await asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_collection_delete('reglamentoscacg') as r"));
    expect(r[0].r).toMatchObject({ id: "reglamentoscacg", scope: "ensenanza" });

    expect(await sourceRow("reglamentoscacg")).toEqual([]);
    expect("reglamentoscacg" in (await matrixOf("ensenanza"))).toBe(false);
    expect("reglamentoscacg" in (await matrixOf("planeacion"))).toBe(false);
    expect((await t.q<{ memory_sources: Record<string, boolean> }>("select memory_sources from pilo_spaces where id = 'ensenanza'"))[0].memory_sources).not.toHaveProperty("reglamentoscacg");
    expect((await t.q<{ memory_sources: Record<string, boolean> }>("select memory_sources from pilo_ai_settings where id = 1"))[0].memory_sources).not.toHaveProperty("reglamentoscacg");
    expect(await t.q("select id from pilo_nodes where id = 'fuente:reglamentoscacg'")).toEqual([]);
  });

  it("el nombre queda libre otra vez", async () => {
    expect((await create("ensenanza", "Reglamentos 2026")).id).toBe("reglamentoscacg");
  });
});
