/* =============================================================================
   Mr. Pilo: un solo cerebro, varios portales (0121) · PRUEBAS DE FUGA.

   Con 0121 la separación entre los Pilos deja de ser una pared (un CHECK) y
   pasa a ser una regla de filtro (pilo_scope). Aquí se comprueba que la regla
   no deja pasar nada que no deba, por ningún camino.

   Los casos NO están escritos uno por uno: salen de la matriz. Por cada
       portal × fuente × visibilidad × quién pregunta
   hay un pasaje que solo ese caso puede o no puede ver, y un oráculo —la regla
   dicha otra vez, en TypeScript, leyendo pilo_portals y pilo_sources— dice si
   debe salir. Se pregunta por seis caminos:

     palabras     pilo_memory_search
     significado  pilo_memory_semantic
     vecinos      pilo_graph_neighbors (con una relación indebida hacia el otro ámbito)
     guardadas    pilo_answer_candidates (¿sigue fresca?)
     legibles     pilo_memory_readable (los pasajes de una guardada)
     malla        pilo_graph_around

   y con tres matrices: la de partida, una con todo abierto y celdas indebidas
   puestas a mano («casa» sobre fuentes ajenas, Moodle hacia fuera, «visita» en
   todo lo ajeno) y una con celdas en «no».

   Desde 0122 lo de otro ámbito SÍ se puede leer, y solo por dos caminos más:

     visita       pilo_memory_visit (cuando lo de casa no alcanza)
     puente       pilo_bridge_neighbors (un puente aprobado, desde un pasaje de casa)

   Cada caso lleva su puente aprobado hacia el «gemelo» del otro ámbito, así que
   el barrido comprueba, por cada portal × fuente × visibilidad × quién pregunta,
   que un pasaje de visita llega solo por esos dos caminos, solo si la celda dice
   «visita», con su visibilidad, y nunca por los seis de casa. Y lo repite con
   los puentes en «propuesta» y en «rechazada»: no traen nada.

   Además: la matriz de partida da EXACTAMENTE lo de antes de la migración (se
   comparan dos bases, una sin 0121 y otra con ella, llamadas como llama la
   función desplegada hoy); el catálogo y las guardadas de un portal no se
   sirven en otro; quién lee y quién cambia la matriz; el espejo con los
   interruptores de siempre; y los documentos del Pilo general.

   Este Postgres de pruebas no trae pgvector: se usa el mismo doble mínimo de
   pilo-espacios.test.ts (un `<=>` que vale 0 si los dos textos son iguales).
   ========================================================================== */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, type Query, type TestDb } from "./harness";

const MIGRATION = resolve(__dirname, "../../supabase/migrations/0121_pilo_portales.sql");
const BRIDGES = resolve(__dirname, "../../supabase/migrations/0122_pilo_puentes.sql");

type Vis = "publico" | "sesion" | "oculto";
type Cell = "casa" | "visita" | "no";
interface Source { id: string; scope: string; staff_only: boolean; stays_home: boolean; kind: string; name: string }
interface Portal { id: string; scope: string; matrix: Record<string, Cell> }

const VIS: Vis[] = ["publico", "sesion", "oculto"];

/** Quién pregunta, como lo manda la función: `p_public_only` y `p_member`. */
const WHO = [
  { id: "visitante", publicOnly: true, member: false },
  { id: "cuenta de Pilo", publicOnly: true, member: true },
  // Aunque alguien marcara por error a una cuenta de Pilo como «con sesión», no lee como personal.
  { id: "cuenta de Pilo mal marcada como sesión", publicOnly: false, member: true },
  { id: "personal de la intranet", publicOnly: false, member: false },
] as const;
type Who = (typeof WHO)[number];

/** Las nueve fuentes de antes de 0121, con su ámbito. */
const LEGACY: { id: string; scope: string }[] = [
  ...["cifras", "boletines", "pdi", "observatorio", "impacto"].map((id) => ({ id, scope: "planeacion" })),
  ...["innovacion", "politicas", "global", "moodle"].map((id) => ({ id, scope: "ensenanza" })),
];

/**
 * EL ORÁCULO: la regla, dicha otra vez y en el orden de la propuesta.
 *   1. Visibilidad del pasaje: «oculto» nunca; «sesion» solo el personal de la intranet.
 *   2. La matriz del portal: solo «casa», y «de casa» es lo del propio ámbito. Por los caminos de casa, «visita» es «no».
 *   3. Quién pregunta: una fuente que pide sesión (Impacto) solo con personal.
 *   4. Lo que no sale de casa (Moodle) solo importa para «visita»: ver `canVisit`.
 */
function canRead(portal: Portal, source: Source, vis: Vis, who: Who): boolean {
  const staff = !who.publicOnly && !who.member;
  if (vis === "oculto") return false;
  if (vis === "sesion" && !staff) return false;
  if ((portal.matrix[source.id] ?? "no") !== "casa") return false;
  if (source.scope !== portal.scope) return false;
  if (source.staff_only && !staff) return false;
  return true;
}

/**
 * EL ORÁCULO DE LA VISITA (0122): lo mismo, con la otra celda. Leer de visita no eleva permisos.
 *   1. Visibilidad del pasaje: «oculto» nunca; «sesion» solo el personal de la intranet (una cuenta de Pilo no lo es).
 *   2. La matriz del portal: la celda dice «visita» y la fuente es de OTRO ámbito.
 *   3. Quién pregunta: una fuente que pide sesión (Impacto) solo con personal.
 *   4. Lo que no sale de casa (Moodle) no se lee de visita, diga lo que diga la celda.
 */
function canVisit(portal: Portal, source: Source, vis: Vis, who: Who): boolean {
  const staff = !who.publicOnly && !who.member;
  if (vis === "oculto") return false;
  if (vis === "sesion" && !staff) return false;
  if ((portal.matrix[source.id] ?? "no") !== "visita") return false;
  if (source.scope === portal.scope) return false;
  if (source.staff_only && !staff) return false;
  if (source.stays_home) return false;
  return true;
}

/** La fuente del «gemelo» de cada ámbito: el pasaje de casa desde el que se piden los vecinos y los puentes. */
const TWIN_SOURCE: Record<string, string> = { planeacion: "cifras", ensenanza: "politicas" };

const other = (scope: string) => (scope === "planeacion" ? "ensenanza" : "planeacion");
const ref = (source: string, vis: Vis) => `fuga:${source}:${vis}`;

async function vectorDouble(t: TestDb) {
  await t.db.exec(`
    create domain extensions.vector as text;
    create function extensions.pilo_test_distance(text, text) returns double precision
      language sql immutable as $$ select case when $1 = $2 then 0::double precision else 1::double precision end $$;
    create operator extensions.<=> (leftarg = text, rightarg = text, function = extensions.pilo_test_distance);
    alter table public.pilo_memory add column if not exists embedding extensions.vector;
    alter table public.pilo_facts add column if not exists embedding extensions.vector;
    alter table public.pilo_catalog_vectors add column if not exists embedding extensions.vector;
  `);
}

/**
 * Siembra, igual en cualquier base: por cada fuente y visibilidad un pasaje con
 * una palabra que solo él tiene (y ese mismo texto como vector), su nodo en la
 * malla, un tema propio y, en cada ámbito, un «gemelo» público que trata del
 * mismo tema (desde él se piden los vecinos). Cada pasaje lleva además una
 * relación INDEBIDA hacia su tema con el espacio del otro ámbito: si los
 * vecinos se fiaran solo de las relaciones, por ahí cruzaría. Y por cada pasaje
 * una respuesta guardada en cada portal que solo lo cita a él.
 * Con 0122, además, un PUENTE APROBADO entre cada pasaje y el gemelo del otro
 * ámbito: si la lectura de visita se fiara solo del puente, por ahí saldría todo.
 */
async function seed(t: TestDb, sources: { id: string; scope: string }[]) {
  const [{ bridges }] = await t.q<{ bridges: boolean }>("select to_regclass('public.pilo_bridges') is not null as bridges");
  await t.db.exec("create table public.fuga_cases (ref text primary key, token text, source text, space text, vis text, twin_planeacion text, twin_ensenanza text); grant select on public.fuga_cases to service_role, authenticated;");
  let n = 0;
  for (const s of sources) {
    for (const vis of VIS) {
      const token = `q${1000 + n++}k`;
      const id = ref(s.id, vis);
      const hub = `tema:fuga-${token}`;
      const twin = { planeacion: `gemelo:planeacion:${token}`, ensenanza: `gemelo:ensenanza:${token}` };
      await t.q(
        `insert into pilo_memory (ref, source, title, body, space, vis, embedding, embed_model, embedded_at)
         values ($1, $2, 'Caso de fuga', $3, $4, $5, $6, 'm', now() + interval '1 minute')`,
        [id, s.id, `Solo este pasaje dice ${token} en toda la memoria.`, s.scope, vis, token],
      );
      await t.q(
        `insert into pilo_memory (ref, source, title, body, space, vis) values
           ($1, 'cifras', 'Gemelo', 'Un pasaje vecino, de Planeación, para pedir los vecinos del mapa.', 'planeacion', 'publico'),
           ($2, 'politicas', 'Gemelo', 'Un pasaje vecino, de Enseñanza, para pedir los vecinos del mapa.', 'ensenanza', 'publico')`,
        [twin.planeacion, twin.ensenanza],
      );
      await t.q("insert into pilo_nodes (id, source, type, label, space) values ($1, 'mapa', 'tema', $2, 'ensenanza')", [hub, `Tema ${token}`]);
      await t.q(
        `insert into pilo_edges (from_id, to_id, rel, source, space, origin) values
           ($1, $2, 'trata', $7, $3, 'ia'),
           ($1, $2, 'cita', $8, $4, 'ia'),
           ($5, $2, 'trata', 'cifras', 'planeacion', 'ia'),
           ($6, $2, 'trata', 'mapa', 'ensenanza', 'ia')`,
        // La fuente de la relación no decide nada; se pone una que también cabe antes de 0121.
        [id, hub, s.scope, other(s.scope), twin.planeacion, twin.ensenanza, s.scope === "planeacion" ? "cifras" : "mapa", s.scope === "planeacion" ? "mapa" : "cifras"],
      );
      await t.q(
        `insert into pilo_answers (question, qnorm, kind, answer, refs, space, rol, created_at) values
           ($1, $1, 'ia', $2, array[$3], 'planeacion', '', now() + interval '1 hour'),
           ($1, $1, 'ia', $2, array[$3], 'ensenanza', '', now() + interval '1 hour')`,
        [token, `Respuesta que cita ${id}.`, id],
      );
      await t.q("insert into fuga_cases (ref, token, source, space, vis, twin_planeacion, twin_ensenanza) values ($1, $2, $3, $4, $5, $6, $7)", [id, token, s.id, s.scope, vis, twin.planeacion, twin.ensenanza]);
      // El par se guarda con el ámbito menor primero («ensenanza» < «planeacion»).
      if (bridges) {
        await t.q(
          "insert into pilo_bridges (a_scope, a_id, b_scope, b_id, kind, why, origin, status) values ('ensenanza', $1, 'planeacion', $2, 'referencia', 'Puente de la prueba de fuga', 'reglas', 'aprobada')",
          s.scope === "planeacion" ? [twin.ensenanza, id] : [id, twin.planeacion],
        );
      }
    }
    // Su lugar en la malla: un nodo de esa fuente, colgado de la raíz de su ámbito.
    await t.q("insert into pilo_nodes (id, source, type, label, space) values ($1, $2, 'nodo', $3, $4)", [`malla:${s.id}`, s.id, `Nodo de ${s.id}`, s.scope]);
  }
}

/** Como la función del servidor: rol de servicio, sin persona. */
async function asService<T>(t: TestDb, work: (q: Query) => Promise<T>): Promise<T> {
  await t.db.exec("begin");
  try {
    await t.db.exec("set local role service_role");
    await t.db.query("select set_config('request.jwt.claim.role', 'service_role', true)");
    await t.db.query("select set_config('request.jwt.claim.sub', '', true)");
    return await work(t.q);
  } finally {
    await t.db.exec("rollback");
  }
}

interface Seen {
  ref: string;
  source: string;
  vis: Vis;
  words: string[];
  meaning: string[];
  neighbors: string[];
  readable: string[];
  fresh: boolean;
  saved_n: number;
  /** Los dos caminos de visita (0122). */
  visit: string[];
  bridge: string[];
}

/** Los caminos de pasajes (los cuatro de casa y los dos de visita) y las guardadas, para todos los casos, como ese portal y esa persona. */
const look = (t: TestDb, portal: string, who: Who) =>
  asService(t, (q) =>
    q<Seen>(
      `select c.ref, c.source, c.vis,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_search(c.token, null, 20, $1, $2, $3) r) as words,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_semantic(c.token, 'm', null, 20, 0.3, $1, $2, $3) r) as meaning,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_graph_neighbors(array[case when $1 = 'planeacion' then c.twin_planeacion else c.twin_ensenanza end], $1, null, $2, 10, $3) r) as neighbors,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_readable(array[c.ref], $1, $2, $3) r) as readable,
         (select coalesce(bool_or(a.fresh), false) from pilo_answer_candidates(c.token, $1, '', $2, $3) a) as fresh,
         (select count(*)::int from pilo_answer_candidates(c.token, $1, '', $2, $3) a) as saved_n,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_visit(c.token, 8, $1, $2, $3) r) as visit,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_bridge_neighbors(array[case when $1 = 'planeacion' then c.twin_planeacion else c.twin_ensenanza end], $1, $2, $3, 4) r) as bridge
       from fuga_cases c order by c.ref`,
      [portal, who.publicOnly, who.member],
    ),
  );

/** Solo el camino de los puentes, para todos los casos: lo que un puente trae desde el gemelo de casa. */
const lookBridges = (t: TestDb, portal: string, who: Who) =>
  asService(t, (q) =>
    q<{ ref: string; bridge: string[] }>(
      `select c.ref,
         (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_bridge_neighbors(array[case when $1 = 'planeacion' then c.twin_planeacion else c.twin_ensenanza end], $1, $2, $3, 4) r) as bridge
       from fuga_cases c order by c.ref`,
      [portal, who.publicOnly, who.member],
    ),
  );

/** La malla: de cada fuente, ¿su nodo le llega a la función para ese portal y esa persona? */
const lookMesh = (t: TestDb, portal: string, who: Who, ids: string[]) =>
  asService(t, async (q) => {
    const [r] = await q<{ g: { nodes: { id: string }[] } }>("select pilo_graph_around($1::text[], null, 6, 1, 400, $2, $3, $4) as g", [ids, portal, who.publicOnly, who.member]);
    return r.g.nodes.map((n) => n.id).sort();
  });

const loadMatrix = async (t: TestDb) => ({
  sources: await t.q<Source>("select id, scope, staff_only, stays_home, kind, name from pilo_sources order by sort"),
  portals: await t.q<Portal>("select id, scope, matrix from pilo_portals order by sort"),
});

/** Pone una matriz A MANO, como dueño de la tabla: sin pasar por pilo_portal_update ni por sus rejas. */
const forceMatrix = (t: TestDb, portal: string, matrix: Record<string, Cell>) => t.q("update pilo_portals set matrix = $2::jsonb where id = $1", [portal, JSON.stringify(matrix)]);

let t: TestDb;
const asAdmin = <T>(work: (q: Query) => Promise<T>, commit = false) => t.asUser(PEOPLE.admin, work, { commit });
let start: Record<string, Record<string, Cell>> = {};

beforeAll(async () => {
  t = await createTestDb({ before: "0173" }); // 0121–0127 tal como eran: 0173 unifica la lectura (ver pilo-memoria-unificada.test.ts)
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'admin') where id = $1", [PEOPLE.admin]);
  await t.q("update profiles set access_role_id = (select id from access_roles where key = 'consulta'), role = 'consulta' where id = $1", [PEOPLE.vx]);
  await vectorDouble(t);
  const { sources, portals } = await loadMatrix(t);
  start = Object.fromEntries(portals.map((p) => [p.id, p.matrix]));
  await seed(t, sources);
}, 180_000);

afterAll(() => t?.close());

/**
 * Corre todos los casos con la matriz que haya y devuelve cuántos comprobó, cuántos debían verse de
 * casa, cuántos de visita (lo de casa no alcanza) y cuántos por su puente aprobado.
 */
async function sweep(): Promise<{ cases: number; checks: number; visible: number; visiting: number; bridged: number }> {
  const { sources, portals } = await loadMatrix(t);
  const byId = new Map(sources.map((s) => [s.id, s]));
  let cases = 0;
  let checks = 0;
  let visible = 0;
  let visiting = 0;
  let bridged = 0;
  for (const portal of portals) {
    for (const who of WHO) {
      const seen = await look(t, portal.id, who);
      expect(seen).toHaveLength(sources.length * VIS.length);
      for (const c of seen) {
        const want = canRead(portal, byId.get(c.source)!, c.vis, who);
        const label = `${portal.id} · ${c.source} · ${c.vis} · ${who.id}`;
        const only = want ? [c.ref] : [];
        // Ni el pasaje del caso cuando no toca, ni ningún otro en su lugar.
        expect(c.words, `palabras · ${label}`).toEqual(only);
        expect(c.meaning, `significado · ${label}`).toEqual(only);
        expect(c.neighbors, `vecinos · ${label}`).toEqual(only);
        expect(c.readable, `legibles · ${label}`).toEqual(only);
        expect(c.fresh, `guardadas · ${label}`).toBe(want);
        // La guardada del OTRO portal, con la misma pregunta, nunca es candidata aquí.
        expect(c.saved_n, `guardadas de otro portal · ${label}`).toBe(1);
        // De visita: solo por sus dos caminos. Por el puente, además, solo si el pasaje de casa del que
        // sale (el gemelo) se lee de casa en ese portal para esa persona.
        const visit = canVisit(portal, byId.get(c.source)!, c.vis, who);
        const fromHome = canRead(portal, byId.get(TWIN_SOURCE[portal.scope])!, "publico", who);
        expect(c.visit, `visita · ${label}`).toEqual(visit ? [c.ref] : []);
        expect(c.bridge, `puente · ${label}`).toEqual(visit && fromHome ? [c.ref] : []);
        // Nunca las dos cosas: lo que se lee de casa no es de visita.
        expect(want && visit, `casa y visita a la vez · ${label}`).toBe(false);
        cases += 1;
        checks += 8;
        if (want) visible += 1;
        if (visit) visiting += 1;
        if (visit && fromHome) bridged += 1;
      }
      // La malla: los nodos de las fuentes que ese portal lee de casa para esa persona, y nada más.
      const staff = !who.publicOnly && !who.member;
      const wantNodes = sources
        .filter((s) => (portal.matrix[s.id] ?? "no") === "casa" && s.scope === portal.scope && (!s.staff_only || staff))
        .map((s) => `malla:${s.id}`)
        .sort();
      expect(await lookMesh(t, portal.id, who, sources.map((s) => `malla:${s.id}`)), `malla · ${portal.id} · ${who.id}`).toEqual(wantNodes);
      checks += sources.length;
    }
  }
  return { cases, checks, visible, visiting, bridged };
}

/** Con los puentes en un estado que no es «aprobada», ninguno trae nada: todos los casos, todos los portales, todos los que preguntan. */
async function sweepBridges(status: "propuesta" | "rechazada"): Promise<number> {
  await t.q("update pilo_bridges set status = $1 where why = 'Puente de la prueba de fuga'", [status]);
  let checks = 0;
  try {
    for (const portal of (await loadMatrix(t)).portals) {
      for (const who of WHO) {
        for (const c of await lookBridges(t, portal.id, who)) {
          expect(c.bridge, `puente ${status} · ${portal.id} · ${c.ref} · ${who.id}`).toEqual([]);
          checks += 1;
        }
      }
    }
  } finally {
    await t.q("update pilo_bridges set status = 'aprobada' where why = 'Puente de la prueba de fuga'");
  }
  return checks;
}

describe("la matriz de partida", () => {
  it("nace con lo de hoy: cada portal lee solo sus fuentes y nada del otro ámbito", async () => {
    const { sources, portals } = await loadMatrix(t);
    expect(sources.map((s) => `${s.scope}:${s.id}`)).toEqual([
      "planeacion:cifras", "planeacion:boletines", "planeacion:pdi", "planeacion:observatorio", "planeacion:impacto",
      "planeacion:institucional", "planeacion:normativa", "planeacion:lineamientos",
      "ensenanza:innovacion", "ensenanza:politicas", "ensenanza:global", "ensenanza:moodle",
    ]);
    expect(sources.filter((s) => s.staff_only).map((s) => s.id)).toEqual(["impacto"]);
    expect(sources.filter((s) => s.stays_home).map((s) => s.id)).toEqual(["moodle"]);
    expect(portals.map((p) => [p.id, p.scope])).toEqual([["planeacion", "planeacion"], ["ensenanza", "ensenanza"]]);
    const casa = (p: Portal) => Object.entries(p.matrix).filter(([, v]) => v === "casa").map(([k]) => k).sort();
    expect(casa(portals[0])).toEqual(["boletines", "cifras", "impacto", "observatorio", "pdi"]);
    expect(casa(portals[1])).toEqual(["global", "innovacion", "moodle", "politicas"]);
    // Ninguna celda nace en «visita», y las colecciones nuevas de Planeación nacen en «no».
    for (const p of portals) expect(Object.values(p.matrix)).not.toContain("visita");
    for (const s of ["institucional", "normativa", "lineamientos"]) expect(portals[0].matrix[s]).toBe("no");
    const [w] = await t.q<{ a: string; b: string }>("select (select written_for from pilo_portals where id = 'planeacion') as a, (select written_for from pilo_portals where id = 'ensenanza') as b");
    expect(w.a).toMatch(/Planeación/);
    expect(w.b).toBe("profesores y estudiantes");
  });

  it("todos los casos, por los seis caminos de casa y los dos de visita: nada sale de su ámbito", async () => {
    const r = await sweep();
    // 2 portales × 12 fuentes × 3 visibilidades × 4 quién pregunta.
    expect(r.cases).toBe(2 * 12 * 3 * 4);
    expect(r.checks).toBe(r.cases * 8 + 2 * 4 * 12);
    // La lectura entre ámbitos nace apagada: con cada pasaje unido por un puente aprobado, no sale ninguno.
    expect(r.visiting).toBe(0);
    expect(r.bridged).toBe(0);
    // Con la matriz de partida: visitante y cuentas ven lo público de sus fuentes sin Impacto (4 + 4, tres veces);
    // el personal, lo público y lo de sesión de sus fuentes (5 × 2 + 4 × 2).
    expect(r.visible).toBe(3 * (4 + 4) + (10 + 8));
  }, 120_000);
});

describe("con todo abierto y celdas indebidas puestas a mano", () => {
  it("«visita» se lee solo por sus dos caminos, «casa» sobre lo ajeno no vale y Moodle no sale de su portal", async () => {
    const { sources } = await loadMatrix(t);
    const open = (portal: string): Record<string, Cell> => {
      const scope = portal;
      return Object.fromEntries(sources.map((s) => [s.id, s.scope === scope ? "casa" : "visita"])) as Record<string, Cell>;
    };
    // Planeación: «casa» sobre Innovación (indebida); lo demás ajeno, «visita», también Moodle (que no sale de su casa).
    // Y «visita» sobre una fuente propia (Boletines), que no tiene sentido: no se lee ni de casa ni de visita.
    await forceMatrix(t, "planeacion", { ...open("planeacion"), innovacion: "casa", boletines: "visita" });
    // Enseñanza: «casa» sobre las cifras (indebida) y «visita» sobre todo lo demás ajeno, con Impacto.
    await forceMatrix(t, "ensenanza", { ...open("ensenanza"), cifras: "casa", impacto: "visita" });

    const r = await sweep();
    expect(r.cases).toBe(288);
    // De casa solo crece lo propio: Planeación gana sus tres colecciones de documentos y pierde Boletines. Nada ajeno por esos caminos.
    expect(r.visible).toBe(3 * (6 + 4) + (14 + 8));
    // De visita. Planeación: Políticas y Mirada global (ni Moodle, ni la «casa» indebida): lo público a quien no es
    // personal (2 × 3) y lo público y lo «con sesión» al personal (4). Enseñanza: seis fuentes de Planeación a quien
    // no es personal (6 × 3) y, con Impacto, siete al personal (14). Las cifras, con «casa» indebida, a nadie.
    expect(r.visiting).toBe(2 * 3 + 4 + (6 * 3 + 14));
    // Y cada uno llega también por su puente aprobado, porque el gemelo de casa se lee.
    expect(r.bridged).toBe(r.visiting);

    // Un puente que no está aprobado no trae nada, con la matriz abierta: los 288 casos, dos veces.
    expect(await sweepBridges("propuesta")).toBe(288);
    expect(await sweepBridges("rechazada")).toBe(288);

    // El valor existe en el filtro: pilo_scope devuelve aparte lo que estaría «de visita»…
    const visiting = (portal: string, session: boolean, member = false) =>
      asService(t, (q) => q<{ source: string; mode: string }>("select source, mode from pilo_scope($1, $2, $3) where mode <> 'casa' order by source", [portal, session, member]));
    // …sin Moodle (no sale de casa, aunque su celda dice «visita»), sin lo marcado «casa» siendo ajeno, y con Impacto solo para el personal.
    expect(await visiting("planeacion", true)).toEqual([{ source: "global", mode: "visita" }, { source: "politicas", mode: "visita" }]);
    expect((await visiting("ensenanza", true)).map((x) => x.source)).toEqual(["boletines", "impacto", "institucional", "lineamientos", "normativa", "observatorio", "pdi"]);
    expect((await visiting("ensenanza", false)).map((x) => x.source)).not.toContain("impacto");
    expect((await visiting("ensenanza", true, true)).map((x) => x.source)).not.toContain("impacto");
    // «casa» nunca es de otro ámbito, diga lo que diga la celda.
    const home = await asService(t, (q) => q<{ source: string; space: string }>("select source, space from pilo_scope('planeacion', true, false) where mode = 'casa'"));
    expect(home.every((x) => x.space === "planeacion")).toBe(true);
    expect(home.map((x) => x.source)).not.toContain("moodle");
  }, 120_000);
});

describe("con celdas en «no»", () => {
  it("una celda en «no» no deja pasar nada por ningún camino, ni con un puente aprobado; lo demás sigue igual", async () => {
    // Cada portal, además, con UNA celda «de visita»: lo demás ajeno sigue en «no» aunque tenga su puente aprobado.
    await forceMatrix(t, "planeacion", { ...start.planeacion, pdi: "no", impacto: "no", institucional: "casa", politicas: "visita" });
    await forceMatrix(t, "ensenanza", { ...start.ensenanza, politicas: "no", moodle: "no", cifras: "visita" });
    const r = await sweep();
    expect(r.cases).toBe(288);
    // Planeación: cifras, boletines, observatorio e institucional; Enseñanza: innovación y global.
    expect(r.visible).toBe(3 * (4 + 2) + (8 + 4));
    // De visita, una fuente por portal: lo público a tres y lo público y lo «con sesión» al personal.
    expect(r.visiting).toBe(5 + 5);
    // Por el puente solo en Planeación: en Enseñanza el pasaje de casa del que sale (Políticas) está en «no».
    expect(r.bridged).toBe(5);
    // Un portal que no existe no lee nada.
    const nobody = await asService(t, (q) => q("select * from pilo_memory_search('q1000k', null, 20, 'otro', false, false)"));
    expect(nobody).toEqual([]);
    expect(await asService(t, (q) => q("select * from pilo_scope('otro', true, false)"))).toEqual([]);
    // Y se vuelve a la de partida para lo que sigue.
    await forceMatrix(t, "planeacion", start.planeacion);
    await forceMatrix(t, "ensenanza", start.ensenanza);
    const back = await sweep();
    expect(back.visible).toBe(3 * (4 + 4) + (10 + 8));
    expect(back.visiting).toBe(0);
    expect(back.bridged).toBe(0);
  }, 240_000);
});

describe("el catálogo y las guardadas son de cada portal", () => {
  it("una entrada del catálogo o una guardada de un portal no se sirve en otro", async () => {
    await asAdmin(async (q) => {
      await q("select pilo_catalog_import('respuesta', $1::jsonb)", [JSON.stringify([{ key: "R-900", question: "¿Qué es una fuga?", answer: "Lo que no debe pasar." }])]);
      await q("select pilo_catalog_import('respuesta', $1::jsonb, false, 'ensenanza')", [JSON.stringify([{ key: "ER-900", question: "¿Qué es una fuga?", answer: "Lo que no debe pasar en Enseñanza." }])]);
    }, true);
    const keys = (portal: string) => asService(t, (q) => q<{ key: string }>("select key from pilo_catalog_active($1) order by key", [portal])).then((rows) => rows.map((r) => r.key));
    expect(await keys("planeacion")).toEqual(["R-900"]);
    expect(await keys("ensenanza")).toEqual(["ER-900"]);
    // Las guardadas: la misma pregunta está en los dos portales y cada uno recibe solo la suya.
    const mine = (portal: string) =>
      asService(t, (q) => q<{ id: number }>("select id from pilo_answer_candidates('q1000k', $1, '', false, false)", [portal])).then(async (rows) => {
        expect(rows).toHaveLength(1);
        return (await t.q<{ space: string }>("select space from pilo_answers where id = $1", [rows[0].id]))[0].space;
      });
    expect(await mine("planeacion")).toBe("planeacion");
    expect(await mine("ensenanza")).toBe("ensenanza");
    // Y por rol: la de «general» no es candidata para un estudiante.
    expect(await asService(t, (q) => q("select id from pilo_answer_candidates('q1000k', 'ensenanza', 'estudiante', false, false)"))).toEqual([]);
    // Estas dos entradas dejan de ser pasajes y fuentes (0126): el resto de las pruebas parte del catálogo de siempre.
    await t.q("delete from pilo_catalog where key in ('R-900', 'ER-900')");
    await t.q("delete from pilo_sources where kind = 'catalogo'");
  });

  it("una guardada deja de servirse en cuanto su portal o esa persona ya no pueden leer lo que cita", async () => {
    // «q1000k» es el pasaje público de UDES en Cifras.
    const fresh = (publicOnly: boolean) =>
      asService(t, (q) => q<{ fresh: boolean }>("select fresh from pilo_answer_candidates('q1000k', 'planeacion', '', $1, false)", [publicOnly])).then((r) => r[0].fresh);
    expect(await fresh(true)).toBe(true);
    await forceMatrix(t, "planeacion", { ...start.planeacion, cifras: "no" });
    expect(await fresh(true)).toBe(false);
    expect(await fresh(false)).toBe(false);
    await forceMatrix(t, "planeacion", start.planeacion);
    expect(await fresh(true)).toBe(true);
    // Una guardada que cita Impacto (con sesión de la intranet) no se le repite a un visitante ni a una cuenta de Pilo.
    const [impacto] = await t.q<{ token: string }>("select token from fuga_cases where ref = 'fuga:impacto:publico'");
    const served = (publicOnly: boolean, member: boolean) =>
      asService(t, (q) => q<{ fresh: boolean }>("select fresh from pilo_answer_candidates($1, 'planeacion', '', $2, $3)", [impacto.token, publicOnly, member])).then((r) => r[0].fresh);
    expect(await served(false, false)).toBe(true);
    expect(await served(true, false)).toBe(false);
    expect(await served(true, true)).toBe(false);
    expect(await served(false, true)).toBe(false);
  });
});

describe("quién lee y quién cambia la matriz", () => {
  it("el público no ve nada; quien no es administración tampoco; la administración lee y cambia por la función", async () => {
    for (const sql of ["select * from pilo_portals", "select * from pilo_sources", "select * from pilo_scope('planeacion')", "select pilo_portal_update('planeacion', '{}'::jsonb)", "select * from pilo_memory_readable(array['fuga:cifras:publico'])"]) {
      expect(await errorOf(t.asUser(null, (q) => q(sql))), sql).toMatch(/permission denied/);
    }
    await t.asUser(PEOPLE.vx, async (q) => {
      expect(await q("select id from pilo_portals")).toEqual([]);
      expect(await q("select id from pilo_sources")).toEqual([]);
    });
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select * from pilo_scope('planeacion')")))).toMatch(/Solo la función de Pilo/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_portal_update('planeacion', '{}'::jsonb)")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select * from pilo_memory_search('q1000k')")))).toMatch(/Solo la función de Pilo/);
    await asAdmin(async (q) => {
      expect(await q("select id from pilo_portals order by sort")).toEqual([{ id: "planeacion" }, { id: "ensenanza" }]);
      expect(await q("select id from pilo_sources")).toHaveLength(12);
      expect((await q<{ source: string }>("select source from pilo_scope('ensenanza', true)")).map((r) => r.source)).toEqual(["innovacion", "politicas", "global", "moodle"]);
    });
    // Ni la administración escribe la tabla directo: solo por pilo_portal_update, que revisa cada celda.
    expect(await errorOf(asAdmin((q) => q("update pilo_portals set matrix = '{}'::jsonb where id = 'planeacion'")))).toMatch(/permission denied/);
    expect(await errorOf(asAdmin((q) => q("insert into pilo_sources (id, scope, name) values ('nueva', 'planeacion', 'Nueva')")))).toMatch(/permission denied/);
    // El servicio (la función) no cambia la matriz.
    expect(await errorOf(asService(t, (q) => q("select pilo_portal_update('planeacion', '{}'::jsonb)")))).toMatch(/permission denied|Solo la administración/);
    // Y la tabla no admite valores que no conoce.
    expect(await errorOf(t.q("update pilo_portals set matrix = '{\"cifras\": \"siempre\"}'::jsonb where id = 'planeacion'"))).toMatch(/pilo_portals_matrix/);
    expect(await errorOf(t.q("update pilo_portals set matrix = '[]'::jsonb where id = 'planeacion'"))).toMatch(/pilo_portals_matrix/);
  });

  it("cada celda se revisa: «casa» solo en lo propio, «visita» solo en lo ajeno que puede salir, y dice su efecto", async () => {
    const set = (portal: string, patch: unknown) => asAdmin((q) => q<{ r: { matrix: Record<string, Cell>; effects: Record<string, unknown>[]; written_for: string } }>("select pilo_portal_update($1, $2::jsonb) as r", [portal, JSON.stringify(patch)]), true).then((r) => r[0].r);
    // «De visita» es solo para lo de otro ámbito, y nunca para lo que no sale de su casa.
    expect(await errorOf(set("planeacion", { matrix: { cifras: "visita" } }))).toMatch(/solo para las fuentes de otro ámbito/);
    expect(await errorOf(set("ensenanza", { matrix: { politicas: "visita" } }))).toMatch(/solo para las fuentes de otro ámbito/);
    expect(await errorOf(set("planeacion", { matrix: { moodle: "visita" } }))).toMatch(/no sale de su portal/);
    expect(await errorOf(set("ensenanza", { matrix: { moodle: "visita" } }))).toMatch(/solo para las fuentes de otro ámbito/);
    expect(await errorOf(set("planeacion", { matrix: { politicas: "casa" } }))).toMatch(/solo para las fuentes del propio portal/);
    expect(await errorOf(set("planeacion", { matrix: { moodle: "casa" } }))).toMatch(/solo para las fuentes del propio portal/);
    expect(await errorOf(set("ensenanza", { matrix: { cifras: "casa" } }))).toMatch(/solo para las fuentes del propio portal/);
    expect(await errorOf(set("planeacion", { matrix: { inventada: "casa" } }))).toMatch(/Fuente desconocida/);
    expect(await errorOf(set("planeacion", { matrix: { cifras: "siempre" } }))).toMatch(/«casa», «visita» o «no»/);
    expect(await errorOf(set("planeacion", { matrix: [] }))).toMatch(/objeto/);
    expect(await errorOf(set("otro", { matrix: {} }))).toMatch(/Portal desconocido/);
    // Nada de lo rechazado cambió la matriz.
    expect((await loadMatrix(t)).portals.map((p) => p.matrix)).toEqual([start.planeacion, start.ensenanza]);

    // Apagar una fuente: dice cuántos pasajes deja de leer y cuántas guardadas dejan de servirse.
    const off = await set("planeacion", { matrix: { pdi: "no", cifras: "casa" } });
    expect(off.matrix.pdi).toBe("no");
    expect(off.effects).toEqual([{ source: "pdi", name: "Plan de Desarrollo", from: "casa", to: "no", passages: 2, public: 1, session: 1, answers: 3, bridges: 0, staff_only: false, home: "Pilo de la Universidad", written_for: "la dirección de la universidad y la Oficina de Planeación" }]);
    // Encender una colección de documentos de casa.
    const on = await set("planeacion", { matrix: { normativa: "casa" }, written_for: "  la   dirección de la universidad " });
    expect(on.effects.map((e) => [e.source, e.from, e.to])).toEqual([["normativa", "no", "casa"]]);
    expect(on.written_for).toBe("la dirección de la universidad");
    // «no» sobre lo ajeno se puede decir siempre (ya lo era).
    expect((await set("planeacion", { matrix: { politicas: "no" } })).effects).toEqual([]);
    await set("planeacion", { matrix: { pdi: "casa", normativa: "no" }, written_for: "la dirección de la universidad y la Oficina de Planeación" });
    expect((await loadMatrix(t)).portals[0].matrix).toEqual(start.planeacion);
  });

  it("«De visita» se marca celda por celda: antes dice qué efecto tendrá, y no escribe si la celda cambió en otra pestaña", async () => {
    const set = (portal: string, patch: unknown) => asAdmin((q) => q<{ r: { matrix: Record<string, Cell>; effects: Record<string, unknown>[] } }>("select pilo_portal_update($1, $2::jsonb) as r", [portal, JSON.stringify(patch)]), true).then((r) => r[0].r);
    const preview = (portal: string, source: string, value: string) => asAdmin((q) => q<{ r: Record<string, unknown> }>("select pilo_portal_preview($1, $2, $3) as r", [portal, source, value])).then((r) => r[0].r);
    // Antes de confirmar: cuántos pasajes de esa fuente podrá leer el portal (públicos y «con sesión»),
    // de qué portal es, para quién fue escrita y cuántos puentes aprobados hay entre los dos ámbitos.
    // (Políticas tiene los dos pasajes del caso y, públicos, los 36 «gemelos» de Enseñanza.)
    const before = await preview("planeacion", "politicas", "visita");
    expect(before).toMatchObject({ source: "politicas", name: "Políticas institucionales", from: "no", to: "visita", passages: 38, public: 37, session: 1, staff_only: false, home: "Pilo en Enseñanza", written_for: "profesores y estudiantes" });
    expect(Number(before.bridges)).toBe(36);
    // Ver el efecto no cambia nada, y solo la administración lo pide.
    expect((await loadMatrix(t)).portals[0].matrix).toEqual(start.planeacion);
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_portal_preview('planeacion', 'politicas', 'visita')")))).toMatch(/Solo la administración/);
    expect(await errorOf(t.asUser(null, (q) => q("select pilo_portal_preview('planeacion', 'politicas', 'visita')")))).toMatch(/permission denied/);
    expect(await errorOf(preview("planeacion", "moodle", "visita"))).toMatch(/no sale de su portal/);

    // Otra pestaña ya movió la celda: quien la veía en «no» y quiere «visita» no escribe nada.
    await forceMatrix(t, "planeacion", { ...start.planeacion, politicas: "visita" });
    expect(await errorOf(set("planeacion", { matrix: { politicas: "no" }, expect: { politicas: "no" } }))).toMatch(/cambió mientras tanto \(ahora dice «visita»\)/);
    expect((await loadMatrix(t)).portals[0].matrix.politicas).toBe("visita");
    await forceMatrix(t, "planeacion", start.planeacion);
    // Con lo esperado al día, se aplica, y devuelve el mismo efecto que anunció.
    const on = await set("planeacion", { matrix: { politicas: "visita" }, expect: { politicas: "no" } });
    expect(on.matrix.politicas).toBe("visita");
    expect(on.effects).toEqual([before]);
    // Una celda que no está escrita se espera como «no».
    expect(await errorOf(set("ensenanza", { matrix: { cifras: "visita" }, expect: { cifras: "casa" } }))).toMatch(/cambió mientras tanto/);
    expect(await errorOf(set("planeacion", { matrix: {}, expect: [] }))).toMatch(/objeto/);

    // Y ahora sí se lee, solo por los caminos de visita y con su procedencia.
    const [policy] = await t.q<{ token: string; twin_planeacion: string }>("select token, twin_planeacion from fuga_cases where ref = 'fuga:politicas:publico'");
    const visit = await asService(t, (q) => q<Record<string, unknown>>("select ref, space, source_name, home_name, written_for, audience from pilo_memory_visit($1, 4, 'planeacion', true, false)", [policy.token]));
    expect(visit).toEqual([{ ref: "fuga:politicas:publico", space: "ensenanza", source_name: "Políticas institucionales", home_name: "Pilo en Enseñanza", written_for: "profesores y estudiantes", audience: ["estudiante", "profesor"] }]);
    const bridge = await asService(t, (q) => q<Record<string, unknown>>("select ref, space, home_name, why, origin, kind from pilo_bridge_neighbors($1::text[], 'planeacion', true, false, 2)", [[policy.twin_planeacion]]));
    expect(bridge).toEqual([{ ref: "fuga:politicas:publico", space: "ensenanza", home_name: "Pilo en Enseñanza", why: "Puente de la prueba de fuga", origin: "reglas", kind: "referencia" }]);
    expect(await asService(t, (q) => q("select ref from pilo_memory_search($1, null, 20, 'planeacion', true, false)", [policy.token]))).toEqual([]);
    // Sin decir quién lee, la visita es la de un visitante: nunca lo «con sesión».
    const [reserved] = await t.q<{ token: string }>("select token from fuga_cases where ref = 'fuga:politicas:sesion'");
    expect(await asService(t, (q) => q("select ref from pilo_memory_visit($1, 4, 'planeacion')", [reserved.token]))).toEqual([]);
    expect(await asService(t, (q) => q("select ref from pilo_memory_visit($1, 4, 'planeacion', false, false)", [reserved.token]))).toEqual([{ ref: "fuga:politicas:sesion" }]);
    // El público no llama a ninguna de las dos, y quien no es administración tampoco.
    for (const sql of ["select * from pilo_memory_visit('x')", "select * from pilo_bridge_neighbors(array['x'], 'planeacion')"]) {
      expect(await errorOf(t.asUser(null, (q) => q(sql))), sql).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q(sql))), sql).toMatch(/Solo la función de Pilo/);
    }

    // El espejo no aprende «visita»: los interruptores de siempre solo conocen lo de casa.
    const [flags] = await t.q<{ p: Record<string, unknown>; e: Record<string, unknown> }>("select (select memory_sources from pilo_ai_settings where id = 1) as p, (select memory_sources from pilo_spaces where id = 'ensenanza') as e");
    expect(Object.keys(flags.p)).not.toContain("politicas");
    expect(JSON.stringify(flags)).not.toContain("visita");
    // Y una pestaña vieja que guarda sus interruptores (aunque nombre la fuente ajena) no toca la celda de visita.
    await t.q(`update pilo_ai_settings set memory_sources = memory_sources || '{"politicas": false, "pdi": true}'::jsonb where id = 1`);
    expect((await loadMatrix(t)).portals[0].matrix.politicas).toBe("visita");
    await t.q("update pilo_ai_settings set memory_sources = memory_sources - 'politicas' where id = 1");

    // Apagarla dice cuántos pasajes deja de leer.
    const off = await set("planeacion", { matrix: { politicas: "no" }, expect: { politicas: "visita" } });
    expect(off.effects).toEqual([{ ...before, from: "visita", to: "no" }]);
    expect((await loadMatrix(t)).portals[0].matrix).toEqual(start.planeacion);
    expect(await asService(t, (q) => q("select ref from pilo_memory_visit($1, 4, 'planeacion', true, false)", [policy.token]))).toEqual([]);
  });
});

describe("el espejo con los interruptores de siempre", () => {
  const flags = async () => {
    const [r] = await t.q<{ p: Record<string, boolean>; e: Record<string, boolean> }>(
      "select (select memory_sources from pilo_ai_settings where id = 1) as p, (select memory_sources from pilo_spaces where id = 'ensenanza') as e",
    );
    return r;
  };
  const cell = async (portal: string, source: string) => (await t.q<{ v: string }>("select matrix ->> $2 as v from pilo_portals where id = $1", [portal, source]))[0].v;

  it("cambiar la matriz mueve `memory_sources`: la función y la intranet de antes siguen leyendo lo mismo", async () => {
    await asAdmin((q) => q("select pilo_portal_update('planeacion', $1::jsonb)", [JSON.stringify({ matrix: { observatorio: "no", institucional: "casa" } })]), true);
    await asAdmin((q) => q("select pilo_portal_update('ensenanza', $1::jsonb)", [JSON.stringify({ matrix: { global: "no" } })]), true);
    const f = await flags();
    expect(f.p).toMatchObject({ cifras: true, boletines: true, pdi: true, observatorio: false, impacto: true, institucional: true, normativa: false, lineamientos: false });
    expect(f.e).toEqual({ innovacion: true, politicas: true, global: false, moodle: true });
    // El espejo solo lleva lo de casa: ninguna fuente ajena aparece como interruptor.
    expect(Object.keys(f.p)).not.toContain("politicas");
    expect(Object.keys(f.e)).not.toContain("cifras");
  });

  it("y al revés: un interruptor de siempre mueve la celda; lo que no viene no se toca", async () => {
    // La intranet de antes guarda sus cinco fuentes: las colecciones nuevas no vienen y no cambian.
    await t.q(`update pilo_ai_settings set memory_sources = '{"cifras": true, "boletines": false, "pdi": true, "observatorio": true, "impacto": true}'::jsonb where id = 1`);
    expect(await cell("planeacion", "boletines")).toBe("no");
    expect(await cell("planeacion", "observatorio")).toBe("casa");
    expect(await cell("planeacion", "institucional")).toBe("casa");
    // Un interruptor de otra cosa (una fuente ajena, un valor que no es sí o no) no escribe nada.
    await t.q(`update pilo_ai_settings set memory_sources = memory_sources || '{"politicas": true, "pdi": "quizá"}'::jsonb where id = 1`);
    expect(await cell("planeacion", "politicas")).toBe("no");
    expect(await cell("planeacion", "pdi")).toBe("casa");
    await t.q(`update pilo_spaces set memory_sources = '{"innovacion": true, "politicas": true, "global": true, "moodle": false, "cifras": true}'::jsonb where id = 'ensenanza'`);
    expect(await cell("ensenanza", "global")).toBe("casa");
    expect(await cell("ensenanza", "moodle")).toBe("no");
    expect(await cell("ensenanza", "cifras")).toBe("no");
    // Nunca aparece «visita» por el espejo.
    for (const p of (await loadMatrix(t)).portals) expect(Object.values(p.matrix)).not.toContain("visita");
    // Todo vuelve a su sitio.
    await forceMatrix(t, "planeacion", start.planeacion);
    await forceMatrix(t, "ensenanza", start.ensenanza);
    expect((await flags()).e).toMatchObject({ innovacion: true, politicas: true, global: true, moodle: true });
    expect((await flags()).p).toMatchObject({ cifras: true, boletines: true, pdi: true, observatorio: true, impacto: true, institucional: false });
  });
});

describe("los documentos del Pilo general", () => {
  const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const TEACH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const rpc = async <T = unknown>(sql: string, params: unknown[] = []) => (await asAdmin((q) => q<{ r: T }>(`select ${sql} as r`, params), true))[0].r;
  const found = (portal: string, publicOnly: boolean, member = false) =>
    asService(t, (q) => q<{ ref: string }>("select ref from pilo_memory_search('estatuto profesoral escalafón', null, 20, $1, $2, $3) order by ref", [portal, publicOnly, member])).then((r) => r.map((x) => x.ref));

  it("se guardan en su ámbito, con sus colecciones, y solo la administración", async () => {
    expect(await errorOf(t.asUser(PEOPLE.vx, (q) => q("select pilo_doc_save('planeacion', $1::jsonb)", [JSON.stringify({ id: DOC, kind: "pdf", source: "normativa", title: "Estatuto" })])))).toMatch(/Solo la función de Pilo y la administración/);
    expect(await rpc("pilo_doc_save('planeacion', $1::jsonb)", [JSON.stringify({ id: DOC, kind: "pdf", source: "normativa", title: "Estatuto profesoral", file_path: `planeacion/${DOC}/estatuto.pdf` })])).toBe(DOC);
    const r = await rpc<Record<string, number>>("pilo_doc_replace($1, $2::jsonb)", [DOC, JSON.stringify([
      { seq: 1, section: "Capítulo 1", body: "El estatuto profesoral define el escalafón docente según la Ley 30 de 1992." },
      { seq: 2, section: "Capítulo 2", body: "El escalafón tiene cuatro categorías y la evaluación formativa del profesor." },
    ])]);
    expect(r).toMatchObject({ added: 2, total: 2 });
    const rows = await t.q<{ ref: string; space: string; source: string; vis: string }>("select ref, space, source, vis from pilo_memory where doc_id = $1 order by ref", [DOC]);
    expect(rows.map((x) => [x.space, x.source, x.vis])).toEqual([["planeacion", "normativa", "sesion"], ["planeacion", "normativa", "sesion"]]);
    // «Actualizada» se anota en la ficha de Planeación, no en la de Enseñanza.
    const [at] = await t.q<{ p: boolean }>("select memory_indexed_at > now() - interval '1 minute' as p from pilo_ai_settings where id = 1");
    expect(at.p).toBe(true);
    // Los vectores: sus pasajes quedan pendientes en el índice de Planeación, no en el de Enseñanza.
    const pending = (space: string) => asService(t, (q) => q<{ ref: string }>("select ref from pilo_embed_pending('m', 256, $1) where kind = 'memoria' and ref like 'doc:%'", [space])).then((x) => x.map((p) => p.ref));
    expect(await pending("planeacion")).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`]);
    expect(await pending("ensenanza")).toEqual([]);
  });

  it("nacen sin leerse: la colección está en «no» hasta que la administración la enciende", async () => {
    expect(await found("planeacion", false)).toEqual([]);
    await rpc("pilo_portal_update('planeacion', $1::jsonb)", [JSON.stringify({ matrix: { normativa: "casa" } })]);
    // Con sesión de la intranet sí; un visitante y una cuenta de Pilo no (el documento nace «con sesión»).
    expect(await found("planeacion", false)).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`]);
    expect(await found("planeacion", true)).toEqual([]);
    expect(await found("planeacion", true, true)).toEqual([]);
    expect(await found("planeacion", false, true)).toEqual([]);
    // Hecho público, lo ve cualquiera en ESE portal; el de Enseñanza no lo lee nunca.
    await rpc("pilo_doc_update($1, $2::jsonb)", [DOC, JSON.stringify({ vis: "publico" })]);
    expect(await found("planeacion", true)).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`]);
    expect(await found("ensenanza", false)).toEqual([]);
    // La función desplegada antes de 0121 manda sus cinco fuentes de siempre: no lo pide, no le llega.
    expect(await asService(t, (q) => q("select ref from pilo_memory_search('estatuto profesoral escalafón', array['cifras','boletines','pdi','observatorio','impacto'], 8)"))).toEqual([]);
  });

  it("el mapa sin IA y «comprender» sirven igual; los temas son comunes y los vecinos no cruzan de ámbito", async () => {
    const out = await rpc<Record<string, number>>("pilo_doc_outline($1, $2::jsonb, $3::jsonb)", [DOC,
      JSON.stringify([{ id: "fuente:normativa", label: "Normativa" }, { id: `doc:${DOC}`, label: "Estatuto profesoral" }, { id: `doc:${DOC}#capitulo-1`, label: "Capítulo 1" }, { id: "ref:ley-30-de-1992", label: "Ley 30 de 1992" }]),
      JSON.stringify([{ from: "fuente:normativa", to: `doc:${DOC}` }, { from: `doc:${DOC}`, to: `doc:${DOC}#capitulo-1` }, { from: `doc:${DOC}:1`, to: "ref:ley-30-de-1992", rel: "cita" }]),
    ]);
    expect(out).toMatchObject({ nodes: 4, edges: 3, rejected: 0 });
    expect(await t.q("select space, source from pilo_nodes where id = $1", [`doc:${DOC}`])).toEqual([{ space: "planeacion", source: "mapa" }]);
    expect((await t.q<{ status: string }>("select status from pilo_docs where id = $1", [DOC]))[0].status).toBe("en_mapa");

    // Un documento de Enseñanza que trata del mismo tema, creado antes: el tema es de quien lo nombró primero.
    await rpc("pilo_doc_save('ensenanza', $1::jsonb)", [JSON.stringify({ id: TEACH, kind: "pdf", source: "politicas", title: "Política de evaluación", vis: "publico" })]);
    await rpc("pilo_doc_replace($1, $2::jsonb)", [TEACH, JSON.stringify([{ seq: 1, body: "La evaluación formativa acompaña el aprendizaje del estudiante." }, { seq: 2, body: "La evaluación formativa usa rúbricas en cada curso." }])]);
    expect(await rpc("pilo_map_save('ensenanza', $1::jsonb)", [JSON.stringify([
      { ref: `doc:${TEACH}:1`, topics: [{ id: "tema:evaluacion-formativa", label: "Evaluación formativa" }] },
      { ref: `doc:${TEACH}:2`, topics: [{ id: "tema:evaluacion-formativa", label: "Evaluación formativa" }] },
    ])])).toBe(2);

    // «Comprender» en Planeación: lo pendiente son sus pasajes, los de documentos primero, y el tema que ya existe se reutiliza.
    const pending = await asService(t, (q) => q<{ ref: string }>("select ref from pilo_map_pending('planeacion', null, 60)"));
    expect(pending.slice(0, 2).map((p) => p.ref)).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`]);
    // Desde 0122 siguen los pasajes de portal (los de la siembra), nunca uno oculto ni uno de Enseñanza.
    expect(pending.length).toBeGreaterThan(2);
    expect(pending.slice(2).every((p) => /^(fuga|gemelo):/.test(p.ref) && !p.ref.endsWith(":oculto") && !p.ref.startsWith("gemelo:ensenanza"))).toBe(true);
    const mine = await asService(t, (q) => q<{ ref: string }>("select ref from pilo_map_pending('planeacion', $1, 60)", [DOC]));
    expect(mine.map((p) => p.ref)).toEqual([`doc:${DOC}:1`, `doc:${DOC}:2`]);
    expect(await rpc("pilo_map_save('planeacion', $1::jsonb)", [JSON.stringify([
      { ref: `doc:${DOC}:1`, topics: [{ id: "tema:escalafon", label: "Escalafón docente" }] },
      { ref: `doc:${DOC}:2`, topics: [{ id: "tema:escalafon", label: "Escalafón docente" }, { id: "tema:evaluacion-formativa", label: "OTRA ETIQUETA" }] },
      // Un pasaje de Enseñanza no se comprende desde Planeación.
      { ref: `doc:${TEACH}:1`, topics: [{ id: "tema:robo", label: "Un tema robado" }] },
    ])])).toBe(2);
    expect(await t.q("select label, space from pilo_nodes where id = 'tema:evaluacion-formativa'")).toEqual([{ label: "Evaluación formativa", space: "ensenanza" }]);
    expect(await t.q("select id from pilo_nodes where id = 'tema:robo'")).toEqual([]);
    // La relación es del ámbito del pasaje, aunque el tema lo haya creado el otro.
    expect(await t.q("select to_id, space from pilo_edges where from_id = $1 and origin = 'ia' order by to_id", [`doc:${DOC}:2`])).toEqual([
      { to_id: "tema:escalafon", space: "planeacion" },
      { to_id: "tema:evaluacion-formativa", space: "planeacion" },
    ]);
    expect((await t.q<{ status: string }>("select status from pilo_docs where id = $1", [DOC]))[0].status).toBe("entendido");
    const status = await asService(t, (q) => q<{ s: { total: number; pending: number; topics: number; refs: number } }>("select pilo_map_status('planeacion', $1) as s", [DOC]));
    expect(status[0].s).toMatchObject({ total: 2, pending: 0, refs: 1 });
    const topics = await asService(t, (q) => q<{ id: string }>("select id from pilo_map_topics('planeacion', 300) where id not like 'tema:fuga-%' order by id"));
    expect(topics.map((x) => x.id)).toEqual(["ref:ley-30-de-1992", "tema:escalafon", "tema:evaluacion-formativa"]);

    // Vecinos dentro de Planeación: el otro pasaje del estatuto llega por su tema, con su etiqueta.
    const near = (refs: string[], portal: string, publicOnly = false) =>
      asService(t, (q) => q<{ ref: string; via: string }>("select ref, via from pilo_graph_neighbors($1::text[], $2, null, $3, 10, false) order by ref", [refs, portal, publicOnly]));
    expect(await near([`doc:${DOC}:1`], "planeacion")).toEqual([{ ref: `doc:${DOC}:2`, via: "Escalafón docente" }]);
    // El tema compartido NO es un puente: desde el estatuto no se llega a la política de Enseñanza, ni al revés.
    expect((await near([`doc:${DOC}:2`], "planeacion")).map((x) => x.ref)).toEqual([`doc:${DOC}:1`]);
    expect((await near([`doc:${TEACH}:1`], "ensenanza")).map((x) => x.ref)).toEqual([`doc:${TEACH}:2`]);
    expect((await near([`doc:${TEACH}:1`], "ensenanza"))[0].via).toBe("Evaluación formativa");
    // Ni pidiendo desde un portal los vecinos de un pasaje del otro.
    expect(await near([`doc:${TEACH}:1`], "planeacion")).toEqual([]);
    expect(await near([`doc:${DOC}:2`], "ensenanza")).toEqual([]);
  });

  it("borrarlo se lleva lo suyo y deja el tema común mientras el otro ámbito lo use", async () => {
    const gone = await rpc<Record<string, number>>("pilo_doc_delete($1)", [DOC]);
    expect(gone).toMatchObject({ passages: 2 });
    expect(await t.q("select ref from pilo_memory where doc_id = $1", [DOC])).toEqual([]);
    expect(await t.q("select id from pilo_nodes where id in ('tema:escalafon', $1)", [`doc:${DOC}`])).toEqual([]);
    expect(await t.q("select id from pilo_nodes where id = 'tema:evaluacion-formativa'")).toEqual([{ id: "tema:evaluacion-formativa" }]);
    expect(await t.q("select count(*)::int as n from pilo_edges where to_id = 'tema:evaluacion-formativa'")).toEqual([{ n: 2 }]);
    await rpc("pilo_doc_delete($1)", [TEACH]);
    expect(await t.q("select id from pilo_nodes where id = 'tema:evaluacion-formativa'")).toEqual([]);
    await rpc("pilo_portal_update('planeacion', $1::jsonb)", [JSON.stringify({ matrix: { normativa: "no" } })]);
  });
});

describe("la migración", () => {
  it("es idempotente: aplicarla dos veces no falla ni cambia nada, y cada función queda con una sola firma", async () => {
    const snapshot = () =>
      t.q(`select
        (select jsonb_agg(to_jsonb(p) - 'updated_at' order by p.id) from pilo_portals p) as portals,
        (select jsonb_agg(to_jsonb(s) order by s.id) from pilo_sources s) as sources,
        (select memory_sources from pilo_ai_settings where id = 1) as flags_p,
        (select memory_sources from pilo_spaces where id = 'ensenanza') as flags_e,
        (select count(*)::int from pilo_memory) as memory,
        (select count(*)::int from pilo_edges) as edges,
        (select jsonb_agg(to_jsonb(b) - 'created_at' - 'decided_at' order by b.id) from pilo_bridges b) as bridges,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'pilo\\_%') as functions,
        (select count(*)::int from pg_constraint where conname like 'pilo\\_%') as constraints,
        (select count(*)::int from pg_trigger where tgname like 'pilo\\_%' and not tgisinternal) as triggers,
        (select count(*)::int from pg_policies where policyname like 'pilo\\_%') as policies`);
    const before = await snapshot();
    // 0121 y, encima, 0122: aplicar 0121 sola después de 0122 devolvería sus funciones a como eran
    // (sin lectura de visita); 0122 las vuelve a dejar. La cadena, dos veces, deja todo como estaba.
    const sql = readFileSync(MIGRATION, "utf8") + ";\n" + readFileSync(BRIDGES, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    expect(await snapshot()).toEqual(before);
    // 0122 tampoco cambia ninguna celda: la lectura entre ámbitos nace apagada.
    for (const p of (await loadMatrix(t)).portals) expect(Object.values(p.matrix)).not.toContain("visita");
    const visits = await t.q<{ proname: string; n: number; prosecdef: boolean; anon: boolean; pub: boolean }>(
      `select p.proname, count(*) over (partition by p.proname)::int as n, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('pilo_memory_visit', 'pilo_bridge_neighbors', 'pilo_bridges_sync', 'pilo_bridges_list', 'pilo_bridge_set', 'pilo_bridges_propose',
         'pilo_bridge_candidates', 'pilo_bridge_targets', 'pilo_bridges_status', 'pilo_portal_preview', 'pilo_cell_effect', 'pilo_bridge_end_ok', 'pilo_facts_search', 'pilo_facts_semantic',
         'pilo_map_pending', 'pilo_map_status', 'pilo_map_save', 'pilo_map_prune')
       order by p.proname`,
    );
    expect(visits).toHaveLength(18);
    for (const f of visits) {
      expect(f.n, f.proname).toBe(1);
      expect(f.prosecdef, f.proname).toBe(true);
      expect(f.anon, f.proname).toBe(false);
      expect(f.pub, f.proname).toBe(false);
    }
    // Quien llame a las cifras como antes (sin decir quién lee) sigue llamando: los parámetros nuevos tienen valor de partida.
    const facts = await t.q<{ args: string }>("select pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pilo_facts_search'");
    expect(facts[0].args).toBe("p_q text, p_limit integer DEFAULT 3, p_space text DEFAULT 'planeacion'::text, p_public_only boolean DEFAULT false, p_member boolean DEFAULT false");
    const fns = await t.q<{ proname: string; n: number }>(
      `select p.proname, count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('pilo_memory_search', 'pilo_memory_semantic', 'pilo_answer_candidates', 'pilo_graph_neighbors', 'pilo_graph_around', 'pilo_memory_readable', 'pilo_scope', 'pilo_portal_update')
       group by p.proname order by p.proname`,
    );
    expect(fns.map((f) => f.n)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    const defs = await t.q<{ proname: string; prosecdef: boolean; anon: boolean; pub: boolean }>(
      `select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon,
              exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('pilo_memory_search', 'pilo_memory_semantic', 'pilo_answer_candidates', 'pilo_graph_neighbors', 'pilo_graph_around', 'pilo_memory_readable', 'pilo_scope', 'pilo_portal_update', 'pilo_portals_mirror', 'pilo_settings_sources_sync', 'pilo_spaces_sources_sync', 'pilo_docs_source_kind')`,
    );
    expect(defs).toHaveLength(12);
    for (const f of defs) {
      expect(f.prosecdef, f.proname).toBe(true);
      expect(f.anon, f.proname).toBe(false);
      expect(f.pub, f.proname).toBe(false);
    }
  });

  it("los parámetros nuevos tienen valor de partida: quien llame como antes sigue llamando", async () => {
    const fns = await t.q<{ proname: string; args: string }>(
      `select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('pilo_memory_search', 'pilo_memory_semantic', 'pilo_answer_candidates', 'pilo_graph_neighbors', 'pilo_graph_around') order by p.proname`,
    );
    const args = Object.fromEntries(fns.map((f) => [f.proname, f.args]));
    for (const name of Object.keys(args)) expect(args[name], name).toContain("p_member boolean DEFAULT false");
    for (const name of ["pilo_memory_search", "pilo_memory_semantic", "pilo_answer_candidates", "pilo_graph_around"]) expect(args[name], name).toContain("p_space text DEFAULT 'planeacion'::text");
    for (const name of Object.keys(args)) expect(args[name], name).toContain("p_public_only boolean DEFAULT false");
    // Los que la función desplegada hoy manda siguen estando, con su nombre.
    expect(args.pilo_graph_neighbors.startsWith("p_refs text[], p_space text, p_sources text[] DEFAULT NULL::text[], p_public_only boolean DEFAULT false, p_limit integer DEFAULT 3")).toBe(true);
    expect(args.pilo_memory_search.startsWith("p_q text, p_sources text[] DEFAULT NULL::text[], p_limit integer DEFAULT 6, p_space text")).toBe(true);
  });
});

/* --- Antes y después ------------------------------------------------------------------
   Dos bases con los mismos datos: una se queda antes de 0121 y la otra la tiene.
   Se llaman las funciones COMO LAS LLAMA LA FUNCIÓN DESPLEGADA HOY (sus
   parámetros de siempre, con las fuentes que ella calcula) y se compara todo. */

describe("con la matriz de partida, los resultados son los de antes de la migración", () => {
  let old: TestDb;
  let now: TestDb;

  beforeAll(async () => {
    old = await createTestDb({ before: "0121" });
    now = await createTestDb({ before: "0173" });
    for (const db of [old, now]) {
      await vectorDouble(db);
      await seed(db, LEGACY);
    }
  }, 240_000);

  afterAll(async () => {
    await old?.close();
    await now?.close();
  });

  const P_VISITOR = ["cifras", "boletines", "pdi", "observatorio"];
  const P_STAFF = [...P_VISITOR, "impacto"];
  const E = ["innovacion", "politicas", "global", "moodle"];

  /** Lo que devuelve una base para todos los casos, llamada con las formas de hoy. */
  const legacy = (db: TestDb) =>
    asService(db, async (q) => {
      const rows = (sql: string, params: unknown[]) => q<Record<string, unknown>>(sql, params);
      const out: Record<string, unknown> = {};
      for (const [who, sources] of [["visitante", P_VISITOR], ["personal", P_STAFF]] as const) {
        out[`planeacion · ${who}`] = await rows(
          `select c.ref,
             (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_search(c.token, $1::text[], 8) r) as words,
             (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_semantic(c.token, 'm', $1::text[], 8, 0.3) r) as meaning,
             (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'fresh', a.fresh) order by a.id), '[]') from pilo_answer_candidates(c.token) a) as saved
           from fuga_cases c order by c.ref`,
          [sources],
        );
        out[`planeacion · ${who} · malla`] = await rows("select pilo_graph_around($1::text[], $2::text[], 6, 1, 160) as g", [LEGACY.map((s) => `malla:${s.id}`), sources]);
      }
      for (const publicOnly of [true, false]) {
        out[`ensenanza · solo público ${publicOnly}`] = await rows(
          `select c.ref,
             (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_search(c.token, $1::text[], 8, 'ensenanza', $2) r) as words,
             (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_memory_semantic(c.token, 'm', $1::text[], 8, 0.3, 'ensenanza', $2) r) as meaning,
             (select coalesce(array_agg(r.ref order by r.ref), '{}') from pilo_graph_neighbors(array[c.twin_ensenanza], 'ensenanza', $1::text[], $2, 3) r) as neighbors,
             (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'fresh', a.fresh) order by a.id), '[]') from pilo_answer_candidates(c.token, 'ensenanza', '', $2) a) as saved
           from fuga_cases c order by c.ref`,
          [E, publicOnly],
        );
        out[`ensenanza · solo público ${publicOnly} · malla`] = await rows("select pilo_graph_around($1::text[], $2::text[], 6, 1, 160, 'ensenanza') as g", [LEGACY.map((s) => `malla:${s.id}`), E]);
      }
      return out;
    });

  it("antes de 0121 no hay portales ni filtro; después sí", async () => {
    expect(await errorOf(old.q("select 1 from pilo_portals"))).toMatch(/does not exist/);
    expect(await now.q("select id from pilo_portals order by sort")).toEqual([{ id: "planeacion" }, { id: "ensenanza" }]);
  });

  it("la función de hoy recibe lo mismo de las dos bases, caso por caso", async () => {
    const before = await legacy(old);
    const after = await legacy(now);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const key of Object.keys(before)) expect(after[key], key).toEqual(before[key]);
    // Y no es una comparación vacía: hay casos que se ven y casos que no.
    const seen = (before["ensenanza · solo público true"] as { words: string[] }[]).filter((r) => r.words.length > 0);
    expect(seen).toHaveLength(4);
    expect((before["planeacion · personal"] as { words: string[] }[]).filter((r) => r.words.length > 0)).toHaveLength(10);
  }, 120_000);

  it("si los interruptores no estaban todos encendidos, la matriz nace igual que ellos", async () => {
    const db = await createTestDb({ before: "0121" });
    try {
      await db.q(`update pilo_ai_settings set memory_sources = '{"pdi": false, "impacto": false, "cifras": true}'::jsonb where id = 1`);
      await db.q(`update pilo_spaces set memory_sources = '{"innovacion": true, "politicas": false, "moodle": "sí"}'::jsonb where id = 'ensenanza'`);
      await db.db.exec(readFileSync(MIGRATION, "utf8"));
      const portals = await db.q<Portal>("select id, scope, matrix from pilo_portals order by sort");
      const casa = (p: Portal) => Object.entries(p.matrix).filter(([, v]) => v === "casa").map(([k]) => k).sort();
      // Planeación: encendida salvo que diga false. Enseñanza: solo lo que dice true.
      expect(casa(portals[0])).toEqual(["boletines", "cifras", "observatorio"]);
      expect(casa(portals[1])).toEqual(["innovacion"]);
      // La migración no tocó los interruptores.
      const [f] = await db.q<{ p: unknown; e: unknown }>("select (select memory_sources from pilo_ai_settings where id = 1) as p, (select memory_sources from pilo_spaces where id = 'ensenanza') as e");
      expect(f.p).toEqual({ pdi: false, impacto: false, cifras: true });
      expect(f.e).toEqual({ innovacion: true, politicas: false, moodle: "sí" });
    } finally {
      await db.close();
    }
  }, 120_000);
});
