/* =============================================================================
   Mr. Pilo · una sola memoria para un solo Pilo (0173).

   Desde 0173 lo que se lee depende de QUIÉN pregunta, no del portal:
     · «oculto» nunca;
     · «con sesión» y las fuentes que piden sesión (Impacto): solo el personal;
     · Moodle no sale de su portal;
     · el público (sin sesión o con cuenta de Pilo): solo lo público Y APROBADO;
     · una fuente apagada en su portal de casa está apagada para todos.
   Aquí se prueba que una pregunta de Enseñanza hecha desde el portal de
   Planeación encuentra lo público aprobado de Enseñanza y NO encuentra lo no
   aprobado, lo de sesión, lo oculto ni Moodle; la aprobación por fuente; la
   capa profunda (idempotente, nace sin aprobar, «Actualizar la memoria» no la
   toca); las respuestas guardadas coherentes; la búsqueda unificada y los
   saludos.
   ========================================================================== */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

let t: TestDb;

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

const WHO = {
  visitante: { publicOnly: true, member: false },
  cuenta: { publicOnly: true, member: true },
  personal: { publicOnly: false, member: false },
} as const;
type WhoId = keyof typeof WHO;

/** Los refs que una palabra encuentra, desde un portal, para quien pregunta. */
async function find(word: string, portal: string, who: WhoId): Promise<string[]> {
  const w = WHO[who];
  return asService(async (q) =>
    (await q<{ ref: string }>("select ref from pilo_memory_search($1, null, 20, $2, $3, $4) order by ref", [word, portal, w.publicOnly, w.member])).map((r) => r.ref),
  );
}

const pass = (ref: string, source: string, space: string, vis: string, body: string, extra = "") =>
  t.q(`insert into pilo_memory (ref, source, title, body, space, vis ${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, $3, $4, $5, $6 ${extra ? ", " + extra.split("=")[1] : ""})`, [ref, source, "Pasaje de prueba", body, space, vis]);

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
  // Lo que ya estaba encendido en cada portal de casa (como lo deja la administración).
  await t.q(
    `update pilo_portals set matrix = matrix || '{"cifras":"casa","pdi":"casa","impacto":"casa"}'::jsonb where id = 'planeacion'`,
  );
  await t.q(
    `update pilo_portals set matrix = matrix || '{"politicas":"casa","innovacion":"casa","moodle":"casa"}'::jsonb where id = 'ensenanza'`,
  );
  await pass("u:cifras:pub", "cifras", "planeacion", "publico", "La matrícula de Bucaramanga aparece como zafiro azul.");
  await pass("u:pdi:pub", "pdi", "planeacion", "publico", "El Plan de Desarrollo tiene el proyecto cuarzo verde.");
  await pass("u:impacto:ses", "impacto", "planeacion", "sesion", "El indicador de impacto turmalina rojo.");
  await pass("u:impacto:pub", "impacto", "planeacion", "publico", "Un pasaje de impacto marcado público: ópalo gris.");
  await pass("u:pol:pub", "politicas", "ensenanza", "publico", "La política de evaluación formativa menciona la palabra jaspe.");
  await pass("u:pol:ses", "politicas", "ensenanza", "sesion", "La política con sesión menciona la palabra obsidiana.");
  await pass("u:pol:oculto", "politicas", "ensenanza", "oculto", "La política oculta menciona la palabra ámbar.");
  await pass("u:pol:nook", "politicas", "ensenanza", "publico", "La política sin aprobar menciona la palabra berilo.", "approved=false");
  await pass("u:moodle:pub", "moodle", "ensenanza", "publico", "El curso de Moodle menciona la palabra malaquita.");
  await pass("u:inno:pub", "innovacion", "ensenanza", "publico", "La innovación educativa menciona la palabra jade.");
});

afterAll(async () => {
  await t.close();
});

describe("la lectura unificada: depende de quién pregunta, no del portal", () => {
  it("desde el portal de Planeación, el público encuentra lo público aprobado de Enseñanza", async () => {
    expect(await find("jaspe", "planeacion", "visitante")).toEqual(["u:pol:pub"]);
    expect(await find("jade", "planeacion", "visitante")).toEqual(["u:inno:pub"]);
    expect(await find("jaspe", "planeacion", "cuenta")).toEqual(["u:pol:pub"]);
  });

  it("y desde Enseñanza, lo de Planeación", async () => {
    expect(await find("zafiro", "ensenanza", "visitante")).toEqual(["u:cifras:pub"]);
    expect(await find("cuarzo", "ensenanza", "visitante")).toEqual(["u:pdi:pub"]);
  });

  it("no encuentra lo no aprobado, lo de sesión ni lo oculto (el público)", async () => {
    for (const word of ["berilo", "obsidiana", "ámbar"]) {
      expect(await find(word, "planeacion", "visitante")).toEqual([]);
      expect(await find(word, "planeacion", "cuenta")).toEqual([]);
    }
  });

  it("el personal con sesión lee también lo de sesión y lo no aprobado; lo oculto, nunca", async () => {
    expect(await find("obsidiana", "planeacion", "personal")).toEqual(["u:pol:ses"]);
    expect(await find("berilo", "planeacion", "personal")).toEqual(["u:pol:nook"]);
    expect(await find("ámbar", "planeacion", "personal")).toEqual([]);
  });

  it("Moodle no sale de su portal: ni el público ni el personal lo leen desde Planeación", async () => {
    expect(await find("malaquita", "planeacion", "visitante")).toEqual([]);
    expect(await find("malaquita", "planeacion", "personal")).toEqual([]);
    expect(await find("malaquita", "ensenanza", "visitante")).toEqual(["u:moodle:pub"]);
  });

  it("Impacto pide sesión de la intranet en cualquier portal, aunque el pasaje diga «público»", async () => {
    expect(await find("ópalo", "ensenanza", "visitante")).toEqual([]);
    expect(await find("ópalo", "planeacion", "cuenta")).toEqual([]);
    expect(await find("ópalo", "ensenanza", "personal")).toEqual(["u:impacto:pub"]);
    expect(await find("turmalina", "planeacion", "personal")).toEqual(["u:impacto:ses"]);
  });

  it("una fuente apagada en su portal de casa está apagada para todos", async () => {
    await t.q(`update pilo_portals set matrix = matrix || '{"innovacion":"no"}'::jsonb where id = 'ensenanza'`);
    expect(await find("jade", "planeacion", "personal")).toEqual([]);
    expect(await find("jade", "ensenanza", "personal")).toEqual([]);
    await t.q(`update pilo_portals set matrix = matrix || '{"innovacion":"casa"}'::jsonb where id = 'ensenanza'`);
    expect(await find("jade", "planeacion", "visitante")).toEqual(["u:inno:pub"]);
  });

  it("un portal que no existe no lee nada", async () => {
    expect(await find("jaspe", "otro", "personal")).toEqual([]);
  });

  it("pilo_scope: la misma lista desde cualquier portal (salvo Moodle) y siempre «casa»", async () => {
    const list = (portal: string, who: WhoId) => asService((q) => q<{ source: string; mode: string }>("select source, mode from pilo_scope($1, $2, $3) order by source", [portal, !WHO[who].publicOnly, WHO[who].member]));
    const plan = await list("planeacion", "personal");
    const ens = await list("ensenanza", "personal");
    expect(plan.map((r) => r.source)).not.toContain("moodle");
    expect(ens.map((r) => r.source)).toContain("moodle");
    expect(ens.filter((r) => r.source !== "moodle")).toEqual(plan);
    expect(plan.every((r) => r.mode === "casa")).toBe(true);
    expect((await list("planeacion", "visitante")).map((r) => r.source)).not.toContain("impacto");
  });
});

describe("la aprobación pública por fuente", () => {
  it("el resumen cuenta pasajes, públicos aprobados y pendientes, y solo lo ve la administración", async () => {
    const [{ o }] = await t.asUser(PEOPLE.admin, (q) => q<{ o: { id: string; passages: number; public: number; approved: number; pending: number; public_ok: boolean }[] }>("select pilo_sources_overview() as o"));
    const pol = o.find((s) => s.id === "politicas")!;
    expect(pol).toMatchObject({ passages: 3, public: 2, approved: 1, pending: 1, public_ok: true });
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_sources_overview()")))).toMatch(/administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_source_approve('politicas', true)")))).toMatch(/administración/);
  });

  it("aprobar una fuente aprueba sus pasajes; quitarla la saca del público pero no del personal", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_source_approve('politicas', true)"), { commit: true });
    expect(await find("berilo", "planeacion", "visitante")).toEqual(["u:pol:nook"]);
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_source_approve('politicas', false)"), { commit: true });
    expect(await find("jaspe", "planeacion", "visitante")).toEqual([]);
    expect(await find("jaspe", "planeacion", "personal")).toEqual(["u:pol:pub"]);
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_source_approve('politicas', true)"), { commit: true });
    await t.q("update pilo_memory set approved = false where ref = 'u:pol:nook'");
    expect(await find("jaspe", "planeacion", "visitante")).toEqual(["u:pol:pub"]);
    expect(await find("berilo", "planeacion", "visitante")).toEqual([]);
  });

  it("una fuente nueva nace sin aprobar; encenderla en su portal de casa la aprueba", async () => {
    await t.q("insert into pilo_sources (id, scope, name, kind, sort) values ('nuevacol', 'ensenanza', 'Nueva', 'documentos', 50)");
    expect((await t.q<{ public_ok: boolean }>("select public_ok from pilo_sources where id = 'nuevacol'"))[0].public_ok).toBe(false);
    await t.q(`update pilo_portals set matrix = matrix || '{"nuevacol":"casa"}'::jsonb where id = 'ensenanza'`);
    expect((await t.q<{ public_ok: boolean }>("select public_ok from pilo_sources where id = 'nuevacol'"))[0].public_ok).toBe(true);
    await t.q("update pilo_sources set public_ok = false where id = 'nuevacol'");
    await pass("u:nueva:pub", "nuevacol", "ensenanza", "publico", "Una colección nueva menciona la palabra cinabrio.");
    expect(await find("cinabrio", "planeacion", "visitante")).toEqual([]);
    expect(await find("cinabrio", "planeacion", "personal")).toEqual(["u:nueva:pub"]);
  });
});

describe("la capa profunda", () => {
  const RUN1 = "2026-10-20T10:00:00Z";
  const RUN2 = "2026-10-20T11:00:00Z";
  const row = (n: number, body: string, vis = "publico") => ({ ref: `prof:cifras:ind-${n}`, title: `Indicador ${n}`, section: "Serie", body, path: "/datos-abiertos", cut: "", office: "Planeación", vis });
  const save = (run: string, rows: unknown[]) => asService((q) => q<{ r: Record<string, number> }>("select pilo_deep_save('cifras', $1::timestamptz, $2::jsonb) as r", [run, JSON.stringify(rows)]).then((x) => x[0].r), true);
  const prune = (run: string) => asService((q) => q<{ r: Record<string, number> }>("select pilo_deep_prune('cifras', $1::timestamptz) as r", [run]).then((x) => x[0].r), true);

  it("nace SIN aprobar: el público no la lee; el personal sí", async () => {
    const r = await save(RUN1, [row(1, "La serie completa de graduados menciona la palabra feldespato."), row(2, "Otra serie que menciona la palabra esmeralda.")]);
    expect(r).toMatchObject({ seen: 2, added: 2, changed: 0 });
    expect(await find("feldespato", "planeacion", "visitante")).toEqual([]);
    expect(await find("feldespato", "ensenanza", "personal")).toEqual(["prof:cifras:ind-1"]);
    const [m] = await t.q<{ layer: string; approved: boolean }>("select layer, approved from pilo_memory where ref = 'prof:cifras:ind-1'");
    expect(m).toEqual({ layer: "profunda", approved: false });
  });

  it("es idempotente: repetirla no cambia nada ni mueve la fecha", async () => {
    const before = await t.q<{ updated_at: string }>("select updated_at from pilo_memory where ref = 'prof:cifras:ind-1'");
    const r = await save(RUN2, [row(1, "La serie completa de graduados menciona la palabra feldespato."), row(2, "Otra serie que menciona la palabra esmeralda.")]);
    expect(r).toMatchObject({ added: 0, changed: 0 });
    expect((await t.q<{ updated_at: string }>("select updated_at from pilo_memory where ref = 'prof:cifras:ind-1'"))[0].updated_at).toEqual(before[0].updated_at);
  });

  it("aprobada la fuente, entra al público; lo nuevo nace aprobado; lo cambiado conserva su aprobación", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("select pilo_source_approve('cifras', true)"), { commit: true });
    expect(await find("feldespato", "ensenanza", "visitante")).toEqual(["prof:cifras:ind-1"]);
    const r = await save("2026-10-20T12:00:00Z", [row(1, "La serie ahora menciona la palabra feldespato y calcita."), row(2, "Otra serie que menciona la palabra esmeralda."), row(3, "Una tercera serie menciona la palabra rodonita.")]);
    expect(r).toMatchObject({ added: 1, changed: 1 });
    expect(await find("rodonita", "planeacion", "visitante")).toEqual(["prof:cifras:ind-3"]);
    expect(await find("calcita", "planeacion", "visitante")).toEqual(["prof:cifras:ind-1"]);
  });

  it("la poda borra lo que la corrida no tocó, y «Actualizar la memoria» no toca la capa profunda", async () => {
    await save("2026-10-20T13:00:00Z", [row(1, "La serie ahora menciona la palabra feldespato y calcita.")]);
    expect((await prune("2026-10-20T13:00:00Z")).removed).toBe(2);
    expect((await t.q("select ref from pilo_memory where layer = 'profunda' and source = 'cifras'")).length).toBe(1);
    const left = await asService(async (q) => {
      await q("select pilo_memory_replace('cifras', $1::jsonb)", [JSON.stringify([{ ref: "cifras:base:uno", title: "Base", body: "Un pasaje de la capa base de cifras." }])]);
      return q<{ ref: string }>("select ref from pilo_memory_readable(array['prof:cifras:ind-1', 'cifras:base:uno'], 'planeacion', false, false) order by ref");
    });
    expect(left.map((r) => r.ref)).toEqual(["cifras:base:uno", "prof:cifras:ind-1"]);
  });

  it("solo para las fuentes de portal, con ref «prof:» y sin ser público lo que pide sesión", async () => {
    expect(await errorOf(asService((q) => q("select pilo_deep_save('politicas', now(), '[]'::jsonb)")))).toMatch(/fuente desconocida/i);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_deep_save('cifras', now(), '[]'::jsonb)")))).toMatch(/Solo la administración/);
    const r = await asService((q) => q<{ r: { added: number } }>("select pilo_deep_save('impacto', now(), $1::jsonb) as r", [JSON.stringify([{ ref: "prof:impacto:x", title: "Ficha", body: "Una ficha de impacto con la palabra lapislazuli.", vis: "publico" }, { ref: "cualquiera:y", title: "Mal", body: "Sin el prefijo del lector profundo." }])]), true);
    expect(r[0].r.added).toBe(1);
    expect((await t.q<{ vis: string }>("select vis from pilo_memory where ref = 'prof:impacto:x'"))[0].vis).toBe("sesion");
  });
});

describe("las respuestas guardadas son coherentes con quien lee", () => {
  const ask = (q: string, portal: string, who: WhoId) =>
    asService((s) => s<{ id: number; fresh: boolean }>("select id, fresh from pilo_answer_candidates($1, $2, '', $3, $4)", [q, portal, WHO[who].publicOnly, WHO[who].member]));

  it("solo está fresca si todo lo que cita lo puede leer el mismo lector", async () => {
    await t.q("update pilo_memory set approved = true where ref = 'u:pol:nook'");
    await t.q(
      `insert into pilo_answers (question, qnorm, kind, answer, refs, space, rol, created_at) values
         ('jaspe', 'jaspe', 'ia', 'Respuesta que cita Enseñanza.', array['u:pol:pub'], 'planeacion', '', now() + interval '1 hour'),
         ('obsidiana', 'obsidiana', 'ia', 'Respuesta que cita lo de sesión.', array['u:pol:ses'], 'planeacion', '', now() + interval '1 hour')`,
    );
    expect((await ask("jaspe", "planeacion", "visitante")).map((r) => r.fresh)).toEqual([true]);
    expect((await ask("obsidiana", "planeacion", "visitante")).map((r) => r.fresh)).toEqual([false]);
    expect((await ask("obsidiana", "planeacion", "personal")).map((r) => r.fresh)).toEqual([true]);
    // sin aprobar, la guardada deja de servirle al público pero no al personal
    await t.q("update pilo_memory set approved = false where ref = 'u:pol:pub'");
    expect((await ask("jaspe", "planeacion", "visitante")).map((r) => r.fresh)).toEqual([false]);
    expect((await ask("jaspe", "planeacion", "personal")).map((r) => r.fresh)).toEqual([true]);
    await t.q("update pilo_memory set approved = true where ref = 'u:pol:pub'");
  });

  it("pilo_memory_readable dice cuáles de los citados puede leer este lector", async () => {
    const readable = (who: WhoId) => asService((q) => q<{ ref: string }>("select ref from pilo_memory_readable(array['u:pol:pub','u:pol:ses','u:pol:oculto','u:moodle:pub'], 'planeacion', $1, $2) order by ref", [WHO[who].publicOnly, WHO[who].member]).then((r) => r.map((x) => x.ref)));
    expect(await readable("visitante")).toEqual(["u:pol:pub"]);
    expect(await readable("personal")).toEqual(["u:pol:pub", "u:pol:ses"]);
  });
});

describe("la búsqueda unificada", () => {
  const findAll = (q: string, portal: string, who: WhoId, emb: string | null = null) =>
    asService((s) => s<{ ref: string; via: string; space: string; layer: string; source: string; rank: number }>("select ref, via, space, layer, source, rank from pilo_memory_find($1, $2, $3, null, 8, 0.3, $4, $5, $6)", [q, emb, emb ? "m" : null, portal, WHO[who].publicOnly, WHO[who].member]));

  it("trae pasajes de los dos ámbitos con su procedencia, ordenados por relevancia", async () => {
    await pass("u:mix:1", "politicas", "ensenanza", "publico", "Reglamento de graduación con mención honorífica de la universidad.");
    await pass("u:mix:2", "pdi", "planeacion", "publico", "Meta del plan: mejorar la graduación a tiempo en toda la universidad con graduación.");
    const rows = await findAll("graduación", "planeacion", "visitante");
    expect(rows.map((r) => r.ref).sort()).toEqual(["u:mix:1", "u:mix:2"]);
    expect(rows.find((r) => r.ref === "u:mix:1")).toMatchObject({ space: "ensenanza", source: "politicas", layer: "base", via: "palabras" });
    expect(rows.find((r) => r.ref === "u:mix:2")).toMatchObject({ space: "planeacion", source: "pdi" });
    expect(rows[0].rank).toBe(1);
  });

  it("respeta las mismas reglas de lectura que las demás búsquedas", async () => {
    expect((await findAll("obsidiana", "planeacion", "visitante")).length).toBe(0);
    expect((await findAll("obsidiana", "planeacion", "personal")).map((r) => r.ref)).toEqual(["u:pol:ses"]);
    expect((await findAll("malaquita", "planeacion", "personal")).length).toBe(0);
  });

  it("sin pgvector (o con un vector que no sirve) sigue por palabras sin fallar", async () => {
    const rows = await findAll("jaspe", "planeacion", "visitante", "[0.1,0.2]");
    expect(rows.map((r) => r.ref)).toEqual(["u:pol:pub"]);
  });
});

describe("la malla cruza de ámbito, con las mismas reglas de lectura", () => {
  it("los vecinos por un tema común incluyen pasajes de otro ámbito que quien pregunta puede leer", async () => {
    await pass("u:m:a", "pdi", "planeacion", "publico", "El PDI trata de la evaluación formativa del aprendizaje.");
    await pass("u:m:b", "politicas", "ensenanza", "publico", "La política de aula trata de la evaluación formativa.");
    await pass("u:m:c", "politicas", "ensenanza", "sesion", "Un lineamiento interno trata de la evaluación formativa.");
    await t.q("insert into pilo_nodes (id, source, type, label, space) values ('tema:evaluacion-formativa', 'mapa', 'tema', 'Evaluación formativa', 'ensenanza') on conflict (id) do nothing");
    await t.q(
      `insert into pilo_edges (from_id, to_id, rel, source, space, origin) values
         ('u:m:a', 'tema:evaluacion-formativa', 'trata', 'pdi', 'planeacion', 'ia'),
         ('u:m:b', 'tema:evaluacion-formativa', 'trata', 'politicas', 'ensenanza', 'ia'),
         ('u:m:c', 'tema:evaluacion-formativa', 'trata', 'politicas', 'ensenanza', 'ia')`,
    );
    const near = (who: WhoId) => asService((q) => q<{ ref: string; space: string }>("select ref, space from pilo_graph_neighbors(array['u:m:a'], 'planeacion', null, $1, 5, $2) order by ref", [WHO[who].publicOnly, WHO[who].member]));
    expect((await near("visitante")).map((r) => [r.ref, r.space])).toEqual([["u:m:b", "ensenanza"]]);
    expect((await near("personal")).map((r) => r.ref)).toEqual(["u:m:b", "u:m:c"]);
  });
});

describe("los saludos del chat incrustado", () => {
  it("nacen sembrados para los dos Pilos, sin números y con el de siempre", async () => {
    const rows = await t.q<{ space: string; text: string; moment: string }>("select space, text, moment from pilo_greetings order by space, sort");
    const planeacion = rows.filter((r) => r.space === "planeacion");
    expect(planeacion.length).toBeGreaterThanOrEqual(8);
    expect(rows.filter((r) => r.space === "ensenanza").length).toBeGreaterThanOrEqual(5);
    expect(planeacion[0].text).toBe("Hola, soy Mr. Pilo, la AI de la UDES. ¿En qué te ayudo hoy?");
    expect(planeacion.map((r) => r.text)).toContain("¡Hola! Soy Mr. Pilo, la AI de la UDES y estoy para ayudarte. Pregúntame lo que quieras de la universidad.");
    expect(rows.every((r) => !/[0-9]/.test(r.text))).toBe(true);
    for (const m of ["manana", "tarde", "noche"]) expect(planeacion.map((r) => r.moment)).toContain(m);
  });

  it("el chat anónimo los lee por la función y no por la tabla", async () => {
    const [{ g }] = await t.asUser(null, (q) => q<{ g: { text: string; moment: string }[] }>("select pilo_greetings_public('planeacion') as g"));
    expect(g.length).toBeGreaterThanOrEqual(8);
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_greetings")))).toMatch(/permission denied/i);
  });

  it("solo la administración los edita; con cifras no se aceptan", async () => {
    await t.asUser(PEOPLE.admin, (q) => q("insert into pilo_greetings (space, text, moment) values ('planeacion', 'Hola, aquí Mr. Pilo, la AI de la UDES.', 'cualquiera')"));
    expect(await errorOf(t.asUser(PEOPLE.admin, (q) => q("insert into pilo_greetings (space, text) values ('planeacion', 'Somos más de 20 mil estudiantes')")))).toMatch(/pilo_greetings_text/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("insert into pilo_greetings (space, text) values ('planeacion', 'Hola mundo desde cualquiera')")))).toMatch(/row-level security|permission denied/i);
  });

  it("uno inactivo no se entrega", async () => {
    await t.q("update pilo_greetings set active = false where space = 'ensenanza'");
    const [{ g }] = await t.asUser(null, (q) => q<{ g: unknown[] }>("select pilo_greetings_public('ensenanza') as g"));
    expect(g).toEqual([]);
  });
});

describe("la migración", () => {
  it("es idempotente: aplicarla otra vez no falla ni pisa lo que la administración decidió", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    await t.q("update pilo_sources set public_ok = false where id = 'cifras'");
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0173_pilo_memoria_unificada.sql"), "utf8"));
    expect((await t.q<{ public_ok: boolean }>("select public_ok from pilo_sources where id = 'cifras'"))[0].public_ok).toBe(false);
    const n = await t.q<{ n: string }>("select count(*)::text as n from pilo_greetings where space = 'planeacion'");
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0173_pilo_memoria_unificada.sql"), "utf8"));
    expect((await t.q<{ n: string }>("select count(*)::text as n from pilo_greetings where space = 'planeacion'"))[0].n).toBe(n[0].n);
    const sigs = await t.q<{ proname: string; n: string }>(
      `select p.proname, count(*)::text as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname in ('pilo_scope', 'pilo_memory_search', 'pilo_memory_semantic', 'pilo_memory_find', 'pilo_memory_readable', 'pilo_answer_candidates', 'pilo_graph_around', 'pilo_graph_neighbors')
       group by p.proname`,
    );
    for (const s of sigs) expect(s.n, s.proname).toBe("1");
  });
});
