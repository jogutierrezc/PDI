/* =============================================================================
   Mr. Pilo · relaciones, premisas de las capciosas y análisis (0130).

   El razonamiento pesado se hace antes y queda guardado y revisado: para cada
   capciosa, qué da por cierto la pregunta y qué es cierto. Aquí se comprueba que:

     · los tres interruptores nacen apagados, en los dos Pilos, y sus topes
       tienen margen;
     · solo la función de Pilo anota lo que propone la IA, y solo la
       administración escribe, aprueba o borra; nadie escribe la tabla directo;
     · lo que propone la IA nunca pisa lo que ya hay, y solo vale para
       capciosas de ese Pilo;
     · al responder se sirve SOLO lo aprobado;
     · cada Pilo lee las premisas de sus capciosas y las de las compartidas,
       ni una más: no se abre ningún camino nuevo entre ámbitos;
     · si la capciosa cambia, lo aprobado vuelve a revisión; si se borra, su
       premisa se va con ella.
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

const importTricky = (rows: Record<string, unknown>[], space?: string) =>
  asAdmin((q) => (space ? q("select pilo_catalog_import('capciosa', $1::jsonb, false, $2)", [JSON.stringify(rows), space]) : q("select pilo_catalog_import('capciosa', $1::jsonb)", [JSON.stringify(rows)])));
const propose = async (space: string, rows: Record<string, unknown>[]) => (await asService((q) => q<{ n: number }>("select pilo_premises_propose($1, $2::jsonb) as n", [space, JSON.stringify(rows)])))[0].n;
const save = (key: string, premise: string, truth: string, approve = false) => asAdmin((q) => q("select pilo_premise_save($1, $2, $3, $4)", [key, premise, truth, approve]));
/** Lo que la función de Pilo usaría al responder en ese portal. */
const served = async (space: string) => asService((q) => q<{ key: string; premise: string; truth: string }>("select key, premise, truth from pilo_premises_active($1)", [space]), false);
const pending = async (space: string) => (await asService((q) => q<{ key: string }>("select key from pilo_premises_pending($1, 40)", [space]), false)).map((r) => r.key);
const rows = () => t.q<{ key: string; premise: string; truth: string; status: string; origin: string; reviewed_by: string | null; reviewed_at: Date | null }>("select key, premise, truth, status, origin, reviewed_by, reviewed_at from pilo_catalog_premises order by key");
const row = async (key: string) => (await rows()).find((r) => r.key === key);

const PREMISE = "Da por hecho que Pilo es una persona y tiene pareja.";
const TRUTH = "Pilo es una inteligencia artificial: no tiene vida sentimental.";

beforeAll(async () => {
  t = await createTestDb();
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
  await importTricky([
    { key: "C-001", question: "Vida personal de Pilo", triggers: ["tienes novia"], answer: "¡Solo tengo ojos para los datos!" },
    { key: "C-002", question: "¿Eres humano?", triggers: ["eres humano"], answer: "Soy Mr. Pilo, la Inteligencia Artificial de la UDES." },
    { key: "C-003", question: "Salarios", triggers: ["salario"], answer: "No hablo de plata.", active: false },
  ]);
  await importTricky([{ key: "EC-001", question: "Hacer la tarea", triggers: ["hazme la tarea"], answer: "La tarea es suya." }], "ensenanza");
  await asAdmin((q) => q("select pilo_catalog_import('respuesta', $1::jsonb)", [JSON.stringify([{ key: "R-001", question: "¿Qué es el PDI?", answer: "El Plan de Desarrollo Institucional." }])]));
}, 120_000);

afterAll(() => t?.close());

describe("los interruptores", () => {
  it("nacen apagados y con sus topes de partida, en los dos Pilos", async () => {
    const off = { ask_relations: false, ask_relations_lines: 12, ask_relations_chars: 1200, tricky_near: false, tricky_near_min: 0.7, ask_analysis: false };
    const cols = "ask_relations, ask_relations_lines, ask_relations_chars, tricky_near, round(tricky_near_min::numeric, 2)::float8 as tricky_near_min, ask_analysis";
    expect(await t.q(`select ${cols} from pilo_ai_settings where id = 1`)).toEqual([off]);
    expect(await t.q(`select ${cols} from pilo_spaces where id = 'ensenanza'`)).toEqual([off]);
  });

  it("la administración los cambia; fuera de margen, la base lo rechaza", async () => {
    await asAdmin((q) => q("update pilo_ai_settings set ask_relations = true, ask_relations_lines = 20, tricky_near_min = 0.8 where id = 1"), false);
    await asAdmin((q) => q("update pilo_spaces set ask_analysis = true, ask_relations_chars = 800 where id = 'ensenanza'"), false);
    expect(await errorOf(asAdmin((q) => q("update pilo_ai_settings set ask_relations_lines = 0 where id = 1"), false))).toMatch(/pilo_ai_settings_reason/);
    expect(await errorOf(asAdmin((q) => q("update pilo_ai_settings set tricky_near_min = 0.2 where id = 1"), false))).toMatch(/pilo_ai_settings_reason/);
    expect(await errorOf(asAdmin((q) => q("update pilo_spaces set ask_relations_chars = 90000 where id = 'ensenanza'"), false))).toMatch(/pilo_spaces_reason/);
  });
});

describe("quién puede", () => {
  it("solo la función de Pilo anota lo que propone la IA", async () => {
    const payload = JSON.stringify([{ key: "C-001", premise: PREMISE, truth: TRUTH }]);
    for (const who of [PEOPLE.admin, PEOPLE.vx, null]) {
      expect(await errorOf(t.asUser(who, (q) => q("select pilo_premises_propose('planeacion', $1::jsonb)", [payload])))).toMatch(/permission denied/);
    }
    expect(await rows()).toEqual([]);
  });

  it("solo la administración escribe, aprueba o borra una premisa", async () => {
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_premise_save('C-001', $1, $2, true)", [PREMISE, TRUTH])))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_premise_clear('C-001')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_premise_save('C-001', $1, $2, true)", [PREMISE, TRUTH])))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_premise_clear('C-001')")))).toMatch(/permission denied/);
    // El servicio propone, no aprueba: aprobar es de una persona de la administración.
    expect(await errorOf(asService((q) => q("select pilo_premise_save('C-001', $1, $2, true)", [PREMISE, TRUTH]), false))).toMatch(/permission denied|Solo la administración/);
    expect(await rows()).toEqual([]);
  });

  it("nadie escribe la tabla directo, y solo la administración la lee", async () => {
    await propose("planeacion", [{ key: "C-001", premise: PREMISE, truth: TRUTH }]);
    for (const who of [PEOPLE.admin, PEOPLE.vx]) {
      expect(await errorOf(t.asUser(who, (q) => q("insert into pilo_catalog_premises (key, premise, truth, status) values ('C-002', 'x', 'y', 'propuesta')")))).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("update pilo_catalog_premises set status = 'aprobada', reviewed_at = now() where key = 'C-001'")))).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(who, (q) => q("delete from pilo_catalog_premises where key = 'C-001'")))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select key from pilo_catalog_premises")))).toMatch(/permission denied/);
    expect(await t.asUser(PEOPLE.vx, (q) => q("select key from pilo_catalog_premises"))).toEqual([]);
    expect(await asAdmin((q) => q("select key from pilo_catalog_premises"), false)).toEqual([{ key: "C-001" }]);
    // Lo que se sirve al responder tampoco lo lee cualquiera.
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select * from pilo_premises_active('planeacion')")))).toMatch(/Solo la función de Pilo/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from pilo_premises_active('planeacion')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select * from pilo_premises_pending('planeacion')")))).toMatch(/Solo la función de Pilo/);
  });
});

describe("lo que propone la IA", () => {
  it("queda como propuesta, de la IA y sin revisar; y no se sirve", async () => {
    expect(await row("C-001")).toMatchObject({ premise: PREMISE, truth: TRUTH, status: "propuesta", origin: "ia", reviewed_by: null, reviewed_at: null });
    expect(await served("planeacion")).toEqual([]);
  });

  it("lo que falta por revisar son las capciosas activas de ese Pilo sin fila", async () => {
    // C-001 ya tiene fila; C-003 está inactiva; R-001 no es capciosa; EC-001 es del otro Pilo.
    expect(await pending("planeacion")).toEqual(["C-002"]);
    expect(await pending("ensenanza")).toEqual(["EC-001"]);
  });

  it("una capciosa sin premisa queda anotada vacía, para no preguntarla otra vez; media premisa también", async () => {
    expect(await propose("planeacion", [{ key: "C-002", premise: "Solo la premisa, sin lo cierto.", truth: "" }])).toBe(1);
    expect(await row("C-002")).toMatchObject({ premise: "", truth: "", status: "propuesta", origin: "ia" });
    expect(await pending("planeacion")).toEqual([]);
  });

  it("nunca pisa lo que ya hay, ni escribe sobre lo que no es una capciosa de ese Pilo", async () => {
    expect(
      await propose("planeacion", [
        { key: "C-001", premise: "Otra premisa que la IA propone después.", truth: "Otra corrección que la IA propone después." },
        { key: "R-001", premise: PREMISE, truth: TRUTH },
        { key: "EC-001", premise: PREMISE, truth: TRUTH },
        { key: "NO-EXISTE", premise: PREMISE, truth: TRUTH },
        "basura",
      ]),
    ).toBe(0);
    expect((await rows()).map((r) => r.key)).toEqual(["C-001", "C-002"]);
    expect(await row("C-001")).toMatchObject({ premise: PREMISE, truth: TRUTH });
    expect(await errorOf(propose("planeacion", { key: "C-001" } as never))).toMatch(/lista/);
  });
});

describe("la administración revisa", () => {
  it("aprobar pide la premisa y lo cierto, y solo en una capciosa que exista", async () => {
    expect(await errorOf(save("C-002", "", "", true))).toMatch(/hacen falta/);
    expect(await errorOf(save("C-002", PREMISE, "no", true))).toMatch(/hacen falta/);
    expect(await errorOf(save("R-001", PREMISE, TRUTH, true))).toMatch(/no es una capciosa/);
    expect(await errorOf(save("NO-EXISTE", PREMISE, TRUTH, true))).toMatch(/no existe/);
    expect(await errorOf(save("C-002", "x".repeat(401), TRUTH))).toMatch(/400 caracteres/);
  });

  it("solo lo aprobado se sirve; aprobar tal cual lo de la IA no cambia quién lo escribió", async () => {
    await save("C-001", PREMISE, TRUTH, true);
    const approved = await row("C-001");
    expect(approved).toMatchObject({ status: "aprobada", origin: "ia", reviewed_by: PEOPLE.admin });
    expect(approved!.reviewed_at).not.toBeNull();
    expect(await served("planeacion")).toEqual([{ key: "C-001", premise: PREMISE, truth: TRUTH }]);
    // Guardar sin aprobar la devuelve a propuesta: deja de servirse.
    await save("C-001", "Da por hecho que Pilo es una persona.", TRUTH, false);
    expect(await row("C-001")).toMatchObject({ status: "propuesta", origin: "admin", reviewed_by: null, reviewed_at: null });
    expect(await served("planeacion")).toEqual([]);
    await save("C-001", PREMISE, TRUTH, true);
    expect(await served("planeacion")).toHaveLength(1);
  });

  it("la administración puede escribirla sin que la IA la haya propuesto, y borrarla para que se proponga otra vez", async () => {
    await save("C-003", "Da por hecho que Pilo conoce los salarios de las personas.", "Pilo no da cifras de dinero ni datos de personas.", true);
    expect(await row("C-003")).toMatchObject({ status: "aprobada", origin: "admin" });
    await asAdmin((q) => q("select pilo_premise_clear('C-002')"));
    expect(await row("C-002")).toBeUndefined();
    expect(await pending("planeacion")).toEqual(["C-002"]);
  });

  it("una capciosa apagada no se sirve aunque su premisa esté aprobada", async () => {
    // C-003 está inactiva en el catálogo.
    expect((await served("planeacion")).map((r) => r.key)).toEqual(["C-001"]);
    await asAdmin((q) => q("update pilo_catalog set active = true where key = 'C-003'"));
    expect((await served("planeacion")).map((r) => r.key)).toEqual(["C-001", "C-003"]);
    // Encenderla o apagarla no toca lo aprobado.
    expect(await row("C-003")).toMatchObject({ status: "aprobada" });
  });

  it("el estado cuenta las capciosas activas de ese Pilo", async () => {
    const status = async (space: string) => (await asService((q) => q<{ s: Record<string, number> }>("select pilo_premises_status($1) as s", [space]), false))[0].s;
    expect(await status("planeacion")).toEqual({ total: 3, pending: 1, proposed: 0, approved: 2 });
    expect(await status("ensenanza")).toEqual({ total: 1, pending: 1, proposed: 0, approved: 0 });
  });
});

describe("cada Pilo, sus capciosas", () => {
  it("la premisa de un Pilo no llega al otro", async () => {
    await propose("ensenanza", [{ key: "EC-001", premise: "Da por hecho que Pilo resuelve las tareas por el estudiante.", truth: "Pilo es un tutor: explica y guía, no entrega la tarea hecha." }]);
    await save("EC-001", "Da por hecho que Pilo resuelve las tareas por el estudiante.", "Pilo es un tutor: explica y guía, no entrega la tarea hecha.", true);
    expect((await served("ensenanza")).map((r) => r.key)).toEqual(["EC-001"]);
    expect((await served("planeacion")).map((r) => r.key)).toEqual(["C-001", "C-003"]);
  });

  it("solo viaja con una capciosa compartida (0126), y deja de viajar al dejar de compartirla", async () => {
    await asAdmin((q) => q("select pilo_catalog_share('C-001', true)"));
    expect((await served("ensenanza")).map((r) => r.key)).toEqual(["C-001", "EC-001"]);
    // Compartirla no la vuelve pendiente del otro Pilo: su premisa es del Pilo que la escribió.
    expect(await pending("ensenanza")).toEqual([]);
    await asAdmin((q) => q("select pilo_catalog_share('C-001', false)"));
    expect((await served("ensenanza")).map((r) => r.key)).toEqual(["EC-001"]);
  });

  it("lo que la IA propone para un Pilo no escribe sobre las capciosas del otro", async () => {
    await asAdmin((q) => q("select pilo_premise_clear('EC-001')"));
    expect(await propose("planeacion", [{ key: "EC-001", premise: PREMISE, truth: TRUTH }])).toBe(0);
    expect(await row("EC-001")).toBeUndefined();
  });
});

describe("si la capciosa cambia", () => {
  it("lo aprobado vuelve a revisión cuando cambian su tema, sus disparadores o su respuesta", async () => {
    expect(await row("C-001")).toMatchObject({ status: "aprobada" });
    // Volver a importar lo mismo no cambia nada.
    await importTricky([{ key: "C-001", question: "Vida personal de Pilo", triggers: ["tienes novia"], answer: "¡Solo tengo ojos para los datos!" }]);
    expect(await row("C-001")).toMatchObject({ status: "aprobada", reviewed_by: PEOPLE.admin });
    await importTricky([{ key: "C-001", question: "Vida personal de Pilo", triggers: ["tienes novia", "estás casado"], answer: "¡Solo tengo ojos para los datos!" }]);
    expect(await row("C-001")).toMatchObject({ status: "propuesta", reviewed_by: null, reviewed_at: null, premise: PREMISE });
    expect((await served("planeacion")).map((r) => r.key)).toEqual(["C-003"]);
  });

  it("si deja de ser capciosa o se borra, su premisa se va", async () => {
    await asAdmin((q) => q("update pilo_catalog set kind = 'respuesta', question = '¿De qué salarios habla Pilo?' where key = 'C-003'"));
    expect(await row("C-003")).toBeUndefined();
    await asAdmin((q) => q("delete from pilo_catalog where key = 'C-001'"));
    expect(await row("C-001")).toBeUndefined();
    expect(await served("planeacion")).toEqual([]);
  });
});
