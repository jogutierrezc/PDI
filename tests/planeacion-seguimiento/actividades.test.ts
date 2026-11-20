/* Migración 0287 (Planeación y Seguimiento, fase 2): actividades por oficina, asignación,
   transferencia, carga masiva, avisos y vencimientos. Matriz de permisos nivel × unit_role × oficina,
   herencia del árbol, campus del miembro, todo-o-nada, idempotencia de los vencimientos con reloj
   controlado, privacidad y bitácora solo-anexar. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

const id = (n: number) => `00000000-0000-4000-a000-00000000f${String(n).padStart(3, "0")}`;
const P = {
  admin: id(1), gtic: id(2), col1: id(3), col2: id(4), colgest: id(5), gvis: id(6), lector: id(7), aprob: id(8),
  ginf: id(9), colinf: id(10), sinnivel: id(11), jefevr: id(12), hereda: id(13), override: id(14), nomiembro: id(15),
};
const NIVEL: Record<string, string> = {
  gtic: "gestor", col1: "colaborador", col2: "colaborador", colgest: "colaborador", gvis: "gestor", lector: "lector", aprob: "aprobador",
  ginf: "gestor", colinf: "colaborador", sinnivel: "none", jefevr: "gestor", hereda: "colaborador", override: "gestor", nomiembro: "colaborador",
};

let t: TestDb;
let plan: string;
let VR1: string, TIC: string, INF: string, VR2: string, ADM2: string, SUB2: string;
let CUC: string, BUC: string;

type Json = Record<string, any>;
const rpc = <T = Json>(q: Query, fn: string, args: string, params: unknown[]) =>
  q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const call = <T = Json>(user: string | null, fn: string, args: string, params: unknown[] = []) =>
  t.asUser(user, (q) => rpc<T>(q, fn, args, params), { commit: true });
const fallo = (user: string | null, fn: string, args: string, params: unknown[] = []) => errorOf(call(user, fn, args, params));
const unit = async (code: string, parent: string | null) =>
  (await t.q<{ id: string }>("insert into units (code, name, slug, parent_id) values ($1, $2, $3, $4) returning id", [code, `Oficina ${code}`, code.toLowerCase(), parent]))[0].id;
const crear = (user: string, u: string, datos: Json, confirmar = false) =>
  // 0288: al crear hay que elegir la conexión con el PDI; estas pruebas de la fase 2 no la usan.
  call(user, "ps_actividad_crear", "$1, $2, $3::jsonb, $4", [plan, u, JSON.stringify({ pdi: { conexion: "sin_pdi" }, ...datos }), confirmar]);
const avisos = (act: string | null, plantilla?: string) =>
  t.q<{ destinatario_id: string; plantilla: string; datos: Json }>(
    `select destinatario_id, plantilla, datos from ps_avisos where ($1::uuid is null or actividad_id = $1) and ($2::text is null or plantilla = $2) order by id`, [act, plantilla ?? null]);
const estadoDe = async (a: string) => (await t.q<{ estado: string }>("select estado from ps_actividades where id = $1", [a]))[0].estado;

beforeAll(async () => {
  t = await createTestDb();
  VR1 = await unit("VR1", null);
  TIC = await unit("TIC", VR1);
  INF = await unit("INF", VR1);
  VR2 = await unit("VR2", null);
  ADM2 = await unit("ADM2", VR2);
  SUB2 = await unit("SUB2", ADM2);
  CUC = (await t.q<{ id: string }>("select id from campuses where slug = 'cucuta'"))[0].id;
  BUC = (await t.q<{ id: string }>("select id from campuses where slug = 'bucaramanga'"))[0].id;

  for (const nivel of ["lector", "aprobador", "gestor", "colaborador", "none"]) {
    await t.q(`insert into access_roles (key, name, base_role, screens, ps_nivel) values ($1, $1, 'consulta', array['planeacion_seguimiento'], $2)`, [`ps2-${nivel}`, nivel]);
  }
  const nombres: Record<string, string> = {
    admin: "Ana Admin", gtic: "Gabriela TIC", col1: "Carlos Uno", col2: "Camila Dos", colgest: "Cristina Jefa", gvis: "Gustavo Visor", lector: "Laura Lectora",
    aprob: "Alberto Aprobador", ginf: "Gonzalo INF", colinf: "Clara INF", sinnivel: "Sin Nivel", jefevr: "Jorge VR", hereda: "Hernán Hereda", override: "Olga Override", nomiembro: "Nora Nomiembro",
  };
  for (const [k, uid] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid, `${k}@prueba.udes.edu.co`]);
    await t.q("insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [uid, `${k}@prueba.udes.edu.co`, nombres[k]]);
    await t.q("update profiles set is_active = true, full_name = $3, role = $2::app_role where id = $1", [uid, k === "admin" ? "admin" : "consulta", nombres[k]]);
    if (k !== "admin") await t.q("update profiles set access_role_id = (select id from access_roles where key = $2) where id = $1", [uid, `ps2-${NIVEL[k]}`]);
  }
  const m = (u: string, p: string, rol: string, campus: string | null = null) =>
    t.q("insert into unit_members (unit_id, profile_id, role, campus_id) values ($1, $2, $3::unit_role, $4)", [u, p, rol, campus]);
  await m(TIC, P.gtic, "jefe"); await m(TIC, P.col1, "editor"); await m(TIC, P.col2, "editor", CUC);
  await m(TIC, P.colgest, "jefe"); await m(TIC, P.gvis, "visor"); await m(TIC, P.sinnivel, "editor");
  await m(INF, P.ginf, "jefe"); await m(INF, P.colinf, "editor");
  await m(VR2, P.jefevr, "jefe"); await m(VR2, P.hereda, "editor"); await m(VR2, P.override, "jefe"); await m(SUB2, P.override, "editor");

  plan = await call<string>(P.admin, "ps_crear_plan", "'PDIFyT 2027-2035', 2027, 2035, $1", [VR2]);
  const fila = (clave: string) => ({ clave, nombre: `Proyecto ${clave}`, pilar: "Pilar A", campus: "Todos", prioridad: "Alto", monto: 1000 });
  const carga = await call<Json>(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [plan, JSON.stringify(["1", "2", "3", "4"].map(fila))]);
  expect(carga.errores).toEqual([]);
  for (const [clave, u] of [["1", TIC], ["2", TIC], ["3", INF]] as const) await call(P.admin, "ps_asignar_oficina_linea", "$1, $2, $3", [carga.version_id, clave, u]);
  await call(P.admin, "ps_asignar_oficina_linea", "$1, $2, $3", [carga.version_id, "4", null]);   // 0291: la línea 4 queda sin oficina (0289 hereda la del plan)
  await call(P.admin, "ps_publicar_version", "$1, ''", [carga.version_id]);
}, 240_000);

afterAll(async () => t?.close());

describe("0287 · poder = mínimo entre el nivel y el unit_role, con herencia", () => {
  const poder = (u: string | null, o: string) => call<string | null>(u, "ps_poder", "$1", [o]);
  it("matriz nivel × unit_role × oficina", async () => {
    const esperado: [keyof typeof P, () => string, string | null][] = [
      ["admin", () => TIC, "admin"], ["admin", () => INF, "admin"],
      ["gtic", () => TIC, "gestor"], ["gtic", () => INF, null],
      ["col1", () => TIC, "colaborador"], ["col1", () => INF, null],
      ["colgest", () => TIC, "colaborador"],            // jefe en la unidad pero nivel colaborador: topa en colaborador
      ["gvis", () => TIC, "lector"],                    // nivel gestor pero visor en la unidad: topa en lector
      ["lector", () => TIC, "lector"], ["lector", () => INF, "lector"],
      ["aprob", () => TIC, "lector"], ["aprob", () => INF, "lector"],
      ["ginf", () => INF, "gestor"], ["ginf", () => TIC, null],
      ["sinnivel", () => TIC, null],                    // sin nivel de módulo no ve nada, aunque sea miembro
      ["nomiembro", () => TIC, null],
      ["jefevr", () => ADM2, "gestor"], ["jefevr", () => SUB2, "gestor"],      // herencia por el árbol
      ["hereda", () => ADM2, "colaborador"], ["hereda", () => SUB2, "colaborador"],
      ["override", () => ADM2, "gestor"], ["override", () => SUB2, "colaborador"], // la pertenencia más cercana manda
      ["jefevr", () => TIC, null],
    ];
    for (const [u, o, e] of esperado) expect(await poder(P[u], o()), `${u}`).toBe(e);
    expect(await call(null as any, "ps_poder", "$1", [TIC]).catch(() => "denegado")).toBe("denegado");
  });
});

describe("0287 · crear actividades", () => {
  it("el gestor crea en su oficina, con versión de creación, responsable y aviso de asignación", async () => {
    const r = await crear(P.gtic, TIC, { titulo: "Migrar el correo", linea_clave: "1", prioridad: "Alto", inicio: "2027-02-01", fin: "2027-06-30", responsables: [P.col1] });
    expect(r.ok).toBe(true);
    expect(r.actividad).toMatchObject({ linea_clave: "1", estado: "por_iniciar", oficina_unit_id: TIC });
    expect(r.actividad.responsables.map((x: Json) => x.id)).toEqual([P.col1]);
    const [a] = await t.q<{ version_creacion_id: string; vig: string }>(
      "select a.version_creacion_id, p.version_vigente_id vig from ps_actividades a join ps_planes p on p.id = a.plan_id where a.id = $1", [r.actividad.id]);
    expect(a.version_creacion_id).toBe(a.vig);
    const av = await avisos(r.actividad.id);
    expect(av.map((x) => [x.plantilla, x.destinatario_id])).toEqual([["c-ps-asignacion", P.col1]]);
    expect(av[0].datos).toMatchObject({ actividad: "Migrar el correo", oficina: "Oficina TIC", fin: "30/06/2027" });
    const [ev] = await t.q<{ tipo: string; oficina_unit_id: string }>("select tipo, oficina_unit_id from ps_eventos where actividad_id = $1", [r.actividad.id]);
    expect(ev).toEqual({ tipo: "actividad.creada", oficina_unit_id: TIC });
  });

  it("quién no puede crear: colaborador, lector, aprobador, otra oficina, sin nivel", async () => {
    for (const u of [P.col1, P.colgest, P.gvis, P.lector, P.aprob, P.ginf, P.sinnivel, P.nomiembro]) {
      expect(await errorOf(crear(u, TIC, { titulo: "No debería" })), `${u}`).toMatch(/Sin permiso/);
    }
  });

  it("valida línea, fechas, hito, título y campus", async () => {
    const f = (d: Json) => errorOf(crear(P.gtic, TIC, { titulo: "Prueba válida", ...d }));
    // 0291: una línea de INF (otra oficina del mismo plan) SÍ se puede vincular: la actividad aporta a INF (ver evaluacion.test.ts)
    expect(await f({ linea_clave: "4" })).toMatch(/sin oficina/); // línea sin oficina: solo admin
    expect(await f({ linea_clave: "999" })).toMatch(/no existe en la versión vigente/);
    expect(await f({ inicio: "2027-05-01", fin: "2027-04-01" })).toMatch(/anterior/);
    expect(await f({ fin: "2040-01-01" })).toMatch(/vigencia del plan/);
    expect(await f({ inicio: "2026-12-31", fin: "2027-01-10" })).toMatch(/vigencia del plan/);
    expect(await f({ fin: "2027-02-30" })).toMatch(/no existe en el calendario/);
    expect(await f({ es_hito: true })).toMatch(/hito necesita fecha/);
    expect(await f({ titulo: "ab" })).toMatch(/entre 3 y 200/);
    expect(await f({ prioridad: "Urgente" })).toMatch(/Crítico, Alto, Medio o Bajo/);
    expect(await f({ campus: "Medellín" })).toMatch(/no existe/);
    expect(await f({ responsables: [P.ginf] })).toMatch(/no pertenece a la oficina/);
    expect(await f({ responsables: [P.sinnivel] })).toMatch(/no pertenece a la oficina|sin acceso|acceso al módulo/);
    expect(await f({ responsables: [P.gvis] })).toMatch(/no pertenece a la oficina/); // visor: no asignable
  });

  it("actividad propia (sin línea) y el admin puede usar una línea sin oficina", async () => {
    const propia = await crear(P.gtic, TIC, { titulo: "Tarea propia de la oficina", fin: "2027-09-01", campus: "Cúcuta" });
    expect(propia.actividad).toMatchObject({ linea_clave: null, campus: "Cúcuta" });
    const adm = await crear(P.admin, TIC, { titulo: "Sobre línea sin oficina", linea_clave: "4" });
    expect(adm.ok).toBe(true);
  });

  it("no se crea sin versión vigente", async () => {
    const otro = await call<string>(P.admin, "ps_crear_plan", "'Plan sin vigente', 2030, 2032, $1", [VR2]);
    expect(await errorOf(call(P.admin, "ps_actividad_crear", "$1, $2, $3::jsonb", [otro, TIC, JSON.stringify({ titulo: "Sin plan vigente" })]))).toMatch(/versión vigente/);
  });
});

describe("0287 · asignar, campus y masiva", () => {
  let act: string;
  beforeAll(async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Instalar antenas", linea_clave: "2", campus_id: BUC, fin: "2027-08-15" })).actividad.id;
  });

  it("el gestor asigna a quien es de la oficina; el aviso queda en la cola", async () => {
    const r = await call(P.gtic, "ps_actividad_asignar", "$1, $2::uuid[], 'Vea los planos', false", [act, [P.col1]]);
    expect(r.asignados).toEqual([P.col1]);
    const repetida = await call(P.gtic, "ps_actividad_asignar", "$1, $2::uuid[]", [act, [P.col1]]);
    expect(repetida).toMatchObject({ asignados: [], ya_asignados: [P.col1] });
    expect((await avisos(act, "c-ps-asignacion")).map((x) => x.destinatario_id)).toEqual([P.col1]);
  });

  it("quién no asigna: colaborador, lector, gestor de otra oficina; ni a gente de fuera, sin nivel o visor", async () => {
    for (const u of [P.col1, P.colgest, P.lector, P.aprob]) expect(await fallo(u, "ps_actividad_asignar", "$1, $2::uuid[]", [act, [P.col2]]), u).toMatch(/Sin permiso/);
    expect(await fallo(P.ginf, "ps_actividad_asignar", "$1, $2::uuid[]", [act, [P.colinf]])).toMatch(/no existe/); // ni la ve
    for (const fuera of [P.colinf, P.sinnivel, P.gvis, P.nomiembro, P.admin]) {
      expect(await fallo(P.gtic, "ps_actividad_asignar", "$1, $2::uuid[]", [act, [fuera]]), fuera).toMatch(/no pertenece a la oficina/);
    }
    expect(await fallo(P.gtic, "ps_actividad_asignar", "$1, '{}'::uuid[]", [act])).toMatch(/1 a 20/);
  });

  it("el trigger impide asignar a quien no es de la oficina aunque se escriba directo", async () => {
    expect(await errorOf(t.q("insert into ps_asignaciones (actividad_id, profile_id) values ($1, $2)", [act, P.colinf]))).toMatch(/no pertenece a la oficina/);
    expect(await errorOf(t.q("insert into ps_asignaciones (actividad_id, profile_id) values ($1, $2)", [act, P.col1]))).toMatch(/ps_asig_activa/);
  });

  it("campus del miembro distinto del de la actividad: pide confirmación y no cambia nada hasta confirmar", async () => {
    const r = await call(P.gtic, "ps_actividad_asignar", "$1, $2::uuid[]", [act, [P.col2]]); // col2: Cúcuta; actividad: Bucaramanga
    expect(r).toMatchObject({ ok: false, requiere_confirmacion: true });
    expect(r.conflictos_campus[0]).toMatchObject({ perfil_id: P.col2, campus_miembro: "Cúcuta", campus_actividad: "Bucaramanga" });
    expect(await t.q("select 1 from ps_asignaciones where actividad_id = $1 and profile_id = $2", [act, P.col2])).toHaveLength(0);
    const ok = await call(P.gtic, "ps_actividad_asignar", "$1, $2::uuid[], '', true", [act, [P.col2]]);
    expect(ok.ok).toBe(true);
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.asignada' order by id desc limit 1", [act]);
    expect(ev.datos.campus_confirmado).toBe(true);
  });

  it("la herencia de pertenencia hace asignable a quien es editor de la unidad madre", async () => {
    const a2 = (await call(P.admin, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, SUB2, JSON.stringify({ titulo: "En la subunidad", pdi: { conexion: "sin_pdi" } })])).actividad.id;
    expect(await fallo(P.override, "ps_actividad_asignar", "$1, $2::uuid[]", [a2, [P.hereda]])).toMatch(/Sin permiso/); // en SUB2 solo es colaborador
    expect((await call(P.jefevr, "ps_actividad_asignar", "$1, $2::uuid[]", [a2, [P.hereda]])).ok).toBe(true);    // hereda: editor de la unidad madre
    expect((await call(P.jefevr, "ps_actividad_asignar", "$1, $2::uuid[]", [a2, [P.override]])).ok).toBe(true); // override es editor en SUB2
    expect(await fallo(P.override, "ps_actividad_desasignar", "$1, $2, 'motivo suficiente para cumplir'", [a2, P.hereda])).toMatch(/Sin permiso/); // en SUB2 es colaborador
    expect((await call(P.jefevr, "ps_actividad_desasignar", "$1, $2, 'motivo suficiente para cumplir'", [a2, P.hereda])).ok).toBe(true);
  });

  it("asignación masiva: todo o nada, solo oficinas donde se es gestor", async () => {
    const a = (await crear(P.gtic, TIC, { titulo: "Masiva uno" })).actividad.id;
    const b = (await crear(P.gtic, TIC, { titulo: "Masiva dos" })).actividad.id;
    const c = (await crear(P.ginf, INF, { titulo: "Masiva de INF", linea_clave: "3" })).actividad.id;
    expect(await fallo(P.gtic, "ps_actividades_asignar", "$1::uuid[], $2", [[a, b, c], P.col1])).toMatch(/Sin permiso|no existe/);
    expect(await t.q("select 1 from ps_asignaciones where actividad_id = any($1::uuid[])", [[a, b]])).toHaveLength(0);
    expect(await fallo(P.gtic, "ps_actividades_asignar", "$1::uuid[], $2", [[a, b], P.colinf])).toMatch(/no pertenece a la oficina/);
    const r = await call(P.gtic, "ps_actividades_asignar", "$1::uuid[], $2", [[a, b], P.col1]);
    expect(r).toMatchObject({ ok: true, asignadas: 2, ya_asignadas: 0 });
    expect(await fallo(P.col1, "ps_actividades_asignar", "$1::uuid[], $2", [[a], P.col1])).toMatch(/Sin permiso/);
  });
});

describe("0287 · transferir", () => {
  let act: string;
  beforeAll(async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Cambiar los switches", linea_clave: "1", responsables: [P.col1] })).actividad.id;
  });

  it("motivo corto, sin permiso y receptor ajeno fallan", async () => {
    const T = "$1, $2, $3, $4";
    expect(await fallo(P.gtic, "ps_actividad_transferir", T, [act, P.col1, P.col2, "muy corto"])).toMatch(/entre 20 y 1000/);
    expect(await fallo(P.gtic, "ps_actividad_transferir", T, [act, P.col1, P.col2, "     corto con espacios     "])).toMatch(/entre 20 y 1000/);
    for (const u of [P.col1, P.colgest, P.lector, P.aprob]) expect(await fallo(u, "ps_actividad_transferir", T, [act, P.col1, P.col2, "motivo suficientemente largo"]), u).toMatch(/Sin permiso/);
    expect(await fallo(P.ginf, "ps_actividad_transferir", T, [act, P.col1, P.col2, "motivo suficientemente largo"])).toMatch(/no existe/);
    expect(await fallo(P.gtic, "ps_actividad_transferir", T, [act, P.col1, P.colinf, "motivo suficientemente largo"])).toMatch(/no pertenece a la oficina/);
    expect(await fallo(P.gtic, "ps_actividad_transferir", T, [act, P.col2, P.colgest, "motivo suficientemente largo"])).toMatch(/no tiene la actividad/);
    expect(await fallo(P.gtic, "ps_actividad_transferir", T, [act, P.col1, P.col1, "motivo suficientemente largo"])).toMatch(/dos personas distintas/);
  });

  it("transfiere con historial, comentario, evento y tres avisos en cola", async () => {
    const antes = (await avisos(act, "c-ps-transferencia")).length;
    const r = await call(P.gtic, "ps_actividad_transferir", "$1, $2, $3, $4, true", [act, P.col1, P.col2, "Carlos sale de vacaciones y Camila continúa."]);
    expect(r.ok).toBe(true);
    expect(r.actividad.responsables.map((x: Json) => x.id)).toEqual([P.col2]);
    const hist = await t.q<{ profile_id: string; quitado_en: string | null; motivo: string }>(
      "select profile_id, quitado_en, motivo from ps_asignaciones where actividad_id = $1 order by asignado_en, id", [act]);
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ profile_id: P.col1 });
    expect(hist[0].quitado_en).not.toBeNull();
    expect(hist[0].motivo).toMatch(/Carlos sale de vacaciones/);
    expect(hist[1].quitado_en).toBeNull();
    const av = (await avisos(act, "c-ps-transferencia")).slice(antes);
    expect(av.map((x) => [x.datos.rol, x.destinatario_id]).sort()).toEqual([["cede", P.col1], ["gestor", P.gtic], ["recibe", P.col2]].sort());
    expect(av[0].datos).toMatchObject({ de: "Carlos Uno", a: "Camila Dos" });
    expect((await t.q("select 1 from ps_comentarios where actividad_id = $1 and tipo = 'transferencia'", [act]))).toHaveLength(1);
    expect((await t.q("select 1 from ps_eventos where actividad_id = $1 and tipo = 'actividad.transferida'", [act]))).toHaveLength(1);
  });

  it("el admin también transfiere; una asignación cerrada no se reabre ni se edita", async () => {
    const r = await call(P.admin, "ps_actividad_transferir", "$1, $2, $3, $4, true", [act, P.col2, P.col1, "Regresa Carlos de sus vacaciones y retoma."]);
    expect(r.ok).toBe(true);
    expect(await errorOf(t.q("update ps_asignaciones set quitado_en = null where actividad_id = $1 and profile_id = $2 and quitado_en is not null", [act, P.col1]))).toMatch(/cerrada|ps_asig/);
    expect(await errorOf(t.q("update ps_asignaciones set profile_id = $2 where actividad_id = $1 and quitado_en is null", [act, P.col2]))).toMatch(/solo se puede cerrar/);
  });
});

describe("0287 · mover entre estados", () => {
  let act: string;
  beforeAll(async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Revisar respaldos", responsables: [P.col1], fin: "2027-10-01" })).actividad.id;
  });
  const mover = (u: string, e: string, nota = "") => call(u, "ps_actividad_mover", "$1, $2, $3", [act, e, nota]);

  it("el colaborador mueve solo las suyas y solo hasta «en_revision»", async () => {
    expect((await mover(P.col1, "en_curso")).actividad.estado).toBe("en_curso");
    expect((await mover(P.col1, "en_revision")).actividad.estado).toBe("en_revision");
    expect(await errorOf(mover(P.col1, "hecho"))).toMatch(/del gestor/);
    expect(await errorOf(mover(P.col2, "en_curso"))).toMatch(/que tiene asignadas/);
    for (const u of [P.lector, P.aprob, P.gvis]) expect(await errorOf(mover(u, "en_curso")), u).toMatch(/lectura/);
    expect(await errorOf(mover(P.ginf, "en_curso"))).toMatch(/no existe/);
    expect(await errorOf(mover(P.col1, "inventado"))).toMatch(/estado debe ser/);
  });

  it("devolver de «en_revision» exige nota de 20 caracteres y avisa a quien la tiene", async () => {
    expect(await errorOf(mover(P.gtic, "en_curso", "falta"))).toMatch(/20 caracteres/);
    const r = await mover(P.gtic, "en_curso", "Falta adjuntar el acta de la prueba de restauración.");
    expect(r.actividad.estado).toBe("en_curso");
    const dev = await avisos(act, "c-ps-devuelto");
    expect(dev.map((x) => x.destinatario_id)).toEqual([P.col1]);
    expect(dev[0].datos.nota).toMatch(/acta de la prueba/);
    expect(await estadoDe(act)).toBe("en_curso");
  });

  it("el gestor pasa a «hecho», avisa a quien la tenía y el colaborador no la reabre", async () => {
    await mover(P.col1, "en_revision");
    expect(await errorOf(mover(P.gtic, "hecho"))).toMatch(/Cerrar actividad/); // 0288: sin avance validado se cierra con ps_actividad_cerrar
    const r = await call(P.gtic, "ps_actividad_cerrar", "$1, 'Cierre administrativo de la prueba'", [act]);
    expect(r.actividad.estado).toBe("hecho");
    expect(r.actividad.completada_en).not.toBeNull();
    const cum = await avisos(act, "c-ps-cumplida");
    expect(cum.map((x) => x.destinatario_id)).toEqual([P.col1]); // el gestor que la cerró no se avisa a sí mismo
    expect(await errorOf(mover(P.col1, "en_curso"))).toMatch(/del gestor/);
    expect((await mover(P.admin, "en_curso")).actividad.completada_en).toBeNull();
    const igual = await mover(P.admin, "en_curso");
    expect(igual.cambio).toBe(false);
  });
});

describe("0287 · editar, checklist, comentar y eliminar", () => {
  let act: string;
  beforeAll(async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Documentar la red", linea_clave: "1", responsables: [P.col1] })).actividad.id;
  });

  it("editar valida lo mismo y registra el diff; el colaborador no edita", async () => {
    expect(await fallo(P.col1, "ps_actividad_editar", "$1, $2::jsonb", [act, JSON.stringify({ titulo: "Otro título" })])).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [act, JSON.stringify({ oficina_unit_id: INF })])).toMatch(/no se puede editar/);
    expect(await fallo(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [act, JSON.stringify({ fin: "2050-01-01" })])).toMatch(/vigencia/);
    expect(await fallo(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [act, JSON.stringify({ linea_clave: "4" })])).toMatch(/sin oficina/);   // 0291: una línea de OTRA oficina sí se puede vincular; una sin oficina, no
    const r = await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [act, JSON.stringify({ titulo: "Documentar toda la red", fin: "2027-12-01", campus: "Valledupar" })]);
    expect(r).toMatchObject({ titulo: "Documentar toda la red", fin: "2027-12-01", campus: "Valledupar", linea_clave: "1" });
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.editada'", [act]);
    expect(Object.keys(ev.datos.cambios).sort()).toEqual(["campus_id", "fin", "titulo"]);
    expect(ev.datos.cambios.titulo).toEqual({ antes: "Documentar la red", despues: "Documentar toda la red" });
  });

  it("el plan, la oficina y la versión de creación no cambian", async () => {
    expect(await errorOf(t.q("update ps_actividades set oficina_unit_id = $2 where id = $1", [act, INF]))).toMatch(/no se pueden cambiar/);
    expect(await errorOf(t.q("update ps_actividades set version_creacion_id = gen_random_uuid() where id = $1", [act]))).toMatch(/no se pueden cambiar/);
    expect(await errorOf(t.q("update ps_actividades set plan_id = gen_random_uuid() where id = $1", [act]))).toMatch(/no se pueden cambiar/);
  });

  it("checklist: gestor y asignado; no el otro colaborador ni el lector", async () => {
    const item = await call(P.gtic, "ps_checklist_agregar", "$1, 'Recolectar planos'", [act]);
    expect((await call(P.col1, "ps_checklist_agregar", "$1, 'Fotografiar los racks'", [act])).orden).toBe(2);
    expect(await fallo(P.col2, "ps_checklist_agregar", "$1, 'No me toca'", [act])).toMatch(/Sin permiso/);
    expect(await fallo(P.lector, "ps_checklist_agregar", "$1, 'No me toca'", [act])).toMatch(/Sin permiso/);
    expect((await call(P.col1, "ps_checklist_marcar", "$1, true", [item.id])).hecho).toBe(true);
    expect(await fallo(P.col2, "ps_checklist_marcar", "$1, true", [item.id])).toMatch(/Sin permiso/);
    expect(await fallo(P.col1, "ps_checklist_quitar", "$1", [item.id])).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_checklist_agregar", "$1, ''", [act])).toMatch(/entre 1 y 200/);
    await call(P.gtic, "ps_checklist_editar", "$1, 'Recolectar los planos de la red'", [item.id]);
    const d = await call(P.col1, "ps_actividad_detalle", "$1", [act]);
    expect(d.checklist).toHaveLength(2);
    expect(d.actividad.checklist).toEqual({ total: 2, hechos: 1 });
    await call(P.gtic, "ps_checklist_quitar", "$1", [item.id]);
  });

  it("comentar: colaborador, gestor y aprobador sí; lector no", async () => {
    expect((await call(P.col1, "ps_comentar", "$1, 'Ya tengo los planos.'", [act])).id).toBeTruthy();
    expect((await call(P.aprob, "ps_comentar", "$1, 'Gracias por el avance.'", [act])).id).toBeTruthy();
    expect(await fallo(P.lector, "ps_comentar", "$1, 'Hola'", [act])).toMatch(/lectura/);
    expect(await errorOf(t.q("update ps_comentarios set texto = 'x' where actividad_id = $1", [act]))).toMatch(/no se modifica/);
    const d = await call(P.col1, "ps_actividad_detalle", "$1", [act]);
    expect(d.comentarios.map((c: Json) => c.autor)).toContain("Alberto Aprobador");
    expect(JSON.stringify(d)).not.toMatch(/@prueba/); // sin correos de nadie
  });

  it("eliminar: solo gestor y admin, y no con avances (gancho de la fase 3)", async () => {
    const x = (await crear(P.gtic, TIC, { titulo: "Borrar esta actividad" })).actividad.id;
    expect(await fallo(P.col1, "ps_actividad_eliminar", "$1", [x])).toMatch(/Sin permiso/);
    expect(await fallo(P.ginf, "ps_actividad_eliminar", "$1", [x])).toMatch(/no existe/);
    const y = (await crear(P.gtic, TIC, { titulo: "Con un avance" })).actividad.id;
    await t.q(`insert into ps_avances (actividad_id, version_id, fecha, av_fisico, nota, reportado_por)
               select id, version_creacion_id, current_date, 10, 'Avance de la prueba', $2 from ps_actividades where id = $1`, [y, P.col1]);
    expect(await fallo(P.gtic, "ps_actividad_eliminar", "$1", [y])).toMatch(/avances/);
    const r = await call(P.gtic, "ps_actividad_eliminar", "$1, 'Creada por error'", [x]);
    expect(r.ok).toBe(true);
    expect(await t.q("select 1 from ps_actividades where id = $1", [x])).toHaveLength(0);
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.eliminada'", [x]);
    expect(ev.datos.copia.titulo).toBe("Borrar esta actividad");
  });
});

describe("0287 · carga masiva por Excel", () => {
  const cargar = (u: string, unidad: string, filas: unknown[], confirmar = false) =>
    call(u, "ps_actividades_cargar", "$1, $2::jsonb, null, $3", [unidad, JSON.stringify(filas.map((f) => ({ pdi: "Sin conexión", ...(f as object) }))), confirmar]);
  const cuenta = async () => (await t.q<{ n: number }>("select count(*)::int n from ps_actividades where oficina_unit_id = $1", [TIC]))[0].n;

  it("con errores no crea nada y los informa por fila y campo", async () => {
    const antes = await cuenta();
    const evAntes = (await t.q<{ n: number }>("select count(*)::int n from ps_eventos where tipo like 'actividad%'"))[0].n;
    const r = await cargar(P.gtic, TIC, [
      { titulo: "Fila buena", linea: "1", fin: "2027-05-05", responsable: "col1@prueba.udes.edu.co" },
      { titulo: "", fin: "2027-05-05" },
      { titulo: "Línea sin oficina", linea: "4" },
      { titulo: "Campus raro", campus: "Medellín" },
      { titulo: "Responsable de fuera", responsable: "colinf@prueba.udes.edu.co" },
      { titulo: "Correo inexistente", responsable: "nadie@prueba.udes.edu.co" },
      { titulo: "Fecha mala", fin: "27/05/2027" },
      { titulo: "Fila buena", linea: "1", fin: "2027-05-05" },
    ]);
    expect(r.creadas).toBe(0);
    expect(r.recibidas).toBe(8);
    const por = (fila: number, campo: string) => r.errores.find((e: Json) => e.fila === fila && e.campo === campo);
    expect(por(2, "titulo")).toBeTruthy();
    expect(por(3, "linea")?.mensaje).toMatch(/sin oficina/);
    expect(por(4, "campus")?.mensaje).toMatch(/Medellín/);
    expect(por(5, "responsable")?.mensaje).toMatch(/no pertenece a la oficina/);
    expect(por(6, "responsable")?.mensaje).toMatch(/No hay una persona/);
    expect(por(7, "fin")).toBeTruthy();
    expect(por(8, "titulo")?.mensaje).toMatch(/igual a la fila 1/);
    expect(r.errores.some((e: Json) => e.fila === 1)).toBe(false);
    expect(await cuenta()).toBe(antes);
    expect((await t.q<{ n: number }>("select count(*)::int n from ps_eventos where tipo like 'actividad%'"))[0].n).toBe(evAntes);
  });

  it("una carga válida crea todo, asigna por correo y avisa; repetirla se rechaza por duplicada", async () => {
    const antes = await cuenta();
    const filas = [
      { titulo: "Cargada uno", linea: "1", fin: "2027-05-05", prioridad: "Crítico", campus: "Bucaramanga", responsable: "col1@prueba.udes.edu.co; col2@prueba.udes.edu.co", hito: "Sí" },
      { actividad: "Cargada dos", proyecto: 2, inicio: "2027-06-01", fin: "2027-07-01" },
    ];
    const r = await cargar(P.gtic, TIC, filas, true);
    expect(r).toMatchObject({ creadas: 2, errores: [] });
    expect(await cuenta()).toBe(antes + 2);
    const [a] = await t.q<{ es_hito: boolean; prioridad: string; campus: string }>(
      "select a.es_hito, a.prioridad, c.name campus from ps_actividades a join campuses c on c.id = a.campus_id where a.id = $1", [r.ids[0]]);
    expect(a).toEqual({ es_hito: true, prioridad: "Crítico", campus: "Bucaramanga" });
    expect((await avisos(r.ids[0], "c-ps-asignacion")).map((x) => x.destinatario_id).sort()).toEqual([P.col1, P.col2].sort());
    const otra = await cargar(P.gtic, TIC, filas, true);
    expect(otra.creadas).toBe(0);
    expect(otra.errores.map((e: Json) => e.mensaje).join(" ")).toMatch(/Ya existe una actividad igual/);
  });

  it("el campus del responsable distinto sin confirmar es un error de la fila; permisos", async () => {
    const fila = { titulo: "Con campus distinto", campus: "Bucaramanga", responsable: "col2@prueba.udes.edu.co" };
    const r = await cargar(P.gtic, TIC, [fila]);
    expect(r.errores[0]).toMatchObject({ fila: 1, campo: "responsable" });
    expect(r.errores[0].mensaje).toMatch(/confirme/);
    for (const u of [P.col1, P.lector, P.ginf]) expect(await errorOf(cargar(u, TIC, [{ titulo: "No debería" }])), u).toMatch(/Sin permiso/);
    expect((await cargar(P.gtic, TIC, [])).errores[0].campo).toBe("filas");
  });
});

describe("0287 · avisos de vencimiento con reloj controlado", () => {
  let act: string, sin: string, hecha: string;
  const hoy = (d: string) => t.q<{ r: Json }>("select public.ps_generar_avisos_vencimiento($1::date) as r", [d]).then((x) => x[0].r);
  const de = (a: string, p: string) => t.q<{ destinatario_id: string; datos: Json }>("select destinatario_id, datos from ps_avisos where actividad_id = $1 and plantilla = $2 order by id", [a, p]);
  beforeAll(async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Entrega con plazo", fin: "2030-03-10", responsables: [P.col1] })).actividad.id;
    sin = (await crear(P.gtic, TIC, { titulo: "Sin responsable", fin: "2030-03-10" })).actividad.id;
    hecha = (await crear(P.gtic, TIC, { titulo: "Ya hecha", fin: "2030-03-10", responsables: [P.col1] })).actividad.id;
    await call(P.gtic, "ps_actividad_cerrar", "$1, 'Cierre administrativo de la prueba'", [hecha]);
  });

  it("por vencer a 7 y 3 días y el día de la fecha; correrla dos veces no duplica", async () => {
    const r1 = await hoy("2030-03-03");
    expect(r1.por_vencer).toBe(2); // act → col1; sin → el gestor
    const r2 = await hoy("2030-03-03");
    expect(r2).toMatchObject({ por_vencer: 0, vencidas: 0, gestor: 0 });
    expect((await de(act, "c-ps-por-vencer")).map((x) => x.destinatario_id)).toEqual([P.col1]);
    expect((await de(sin, "c-ps-por-vencer")).map((x) => x.destinatario_id)).toEqual([P.gtic]); // sin responsable: el gestor
    expect((await de(hecha, "c-ps-por-vencer"))).toHaveLength(0);
    expect((await hoy("2030-03-05")).por_vencer).toBe(0); // 5 días: no es día de aviso
    expect((await hoy("2030-03-07")).por_vencer).toBe(2);
    expect((await hoy("2030-03-10")).por_vencer).toBe(2);
    expect((await hoy("2030-03-10")).por_vencer).toBe(0);
    expect((await de(act, "c-ps-por-vencer")).map((x) => x.datos.dias)).toEqual([7, 3, 0]);
  });

  it("vencida: aviso diario hasta 3 veces y copia al gestor a las 24 h, una sola vez", async () => {
    expect((await hoy("2030-03-11")).vencidas).toBe(2); // col1 y, por no tener responsable, el gestor de «sin»
    expect((await de(act, "c-ps-vencida")).filter((x) => x.datos.rol === "gestor")).toHaveLength(0); // aún no pasan 24 h
    const d12 = await hoy("2030-03-12");
    expect(d12.gestor).toBe(1); // act: gestor en copia
    expect((await de(act, "c-ps-vencida")).filter((x) => x.datos.rol === "gestor").map((x) => x.destinatario_id)).toEqual([P.gtic]);
    expect((await hoy("2030-03-12"))).toMatchObject({ vencidas: 0, gestor: 0 });
    await hoy("2030-03-13");
    await hoy("2030-03-14");
    await hoy("2030-03-20");
    const propios = (await de(act, "c-ps-vencida")).filter((x) => x.datos.rol === "responsable");
    expect(propios).toHaveLength(3);
    expect(propios[0].destinatario_id).toBe(P.col1);
    expect((await de(act, "c-ps-vencida")).filter((x) => x.datos.rol === "gestor")).toHaveLength(1);
    expect((await de(hecha, "c-ps-vencida"))).toHaveLength(0);
  });

  it("los plazos son editables solo por el administrador y se respetan", async () => {
    expect(await fallo(P.gtic, "ps_config_leer", "")).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_config_guardar", "'{1}'::int[], 3, 24, true")).toMatch(/Sin permiso/);
    expect(await fallo(P.admin, "ps_config_guardar", "'{99}'::int[], 3, 24, true")).toMatch(/entre 0 y 60/);
    const cfg = await call(P.admin, "ps_config_guardar", "'{5,1}'::int[], 1, 48, true");
    expect(cfg).toMatchObject({ dias_antes: [5, 1], vencida_max_avisos: 1, vencida_gestor_horas: 48, activo: true });
    const nueva = (await crear(P.gtic, TIC, { titulo: "Con plazos propios", fin: "2031-04-10", responsables: [P.col1] })).actividad.id;
    expect((await hoy("2031-04-05")).por_vencer).toBe(1);
    expect((await hoy("2031-04-07")).por_vencer).toBe(0); // 3 días ya no es plazo
    expect((await hoy("2031-04-09")).por_vencer).toBe(1);
    await call(P.admin, "ps_config_guardar", "'{0}'::int[], 3, 24, false");
    expect(await hoy("2031-04-10")).toMatchObject({ activo: false, por_vencer: 0 });
    await call(P.admin, "ps_config_guardar", "'{7,3,0}'::int[], 3, 24, true");
    expect((await de(nueva, "c-ps-por-vencer")).length).toBe(2);
  });

  it("solo la clave de servicio ejecuta el generador de vencimientos", async () => {
    expect(await fallo(P.admin, "ps_generar_avisos_vencimiento", "$1::date", ["2030-03-10"])).toMatch(/permission denied|permiso/i);
    expect(await fallo(null, "ps_generar_avisos_vencimiento", "$1::date", ["2030-03-10"])).toMatch(/permission denied|permiso/i);
  });
});

describe("0287 · visibilidad, privacidad y anónimos", () => {
  it("el colaborador solo ve su oficina; el lector y el aprobador ven todo en lectura", async () => {
    const infAct = (await crear(P.ginf, INF, { titulo: "Cosa de INF", linea_clave: "3" })).actividad.id;
    const col = await t.asUser(P.col1, (q) => q<{ oficina_unit_id: string }>("select distinct oficina_unit_id from ps_actividades"));
    expect(col.map((x) => x.oficina_unit_id)).toEqual([TIC]);
    expect(await fallo(P.col1, "ps_actividades_oficina", "$1", [INF])).toMatch(/Sin permiso/);
    expect(await fallo(P.col1, "ps_actividad_detalle", "$1", [infAct])).toMatch(/no existe/);
    expect((await call(P.col1, "ps_oficinas_visibles", "")).map((o: Json) => o.unit_id)).toEqual([TIC]);
    for (const u of [P.lector, P.aprob]) {
      const vistas = (await call(u, "ps_oficinas_visibles", "")).map((o: Json) => o.unit_id).sort();
      expect(vistas).toEqual(expect.arrayContaining([TIC, INF]));
      expect(vistas).not.toContain(VR1); // una unidad sin líneas ni actividades no es una oficina del plan
      expect((await call(u, "ps_actividades_oficina", "$1", [INF])).total).toBeGreaterThan(0);
    }
    const g = await call(P.gtic, "ps_oficinas_visibles", "");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ unit_id: TIC, poder: "gestor", unit_role: "jefe" });
    const todas = await call(P.admin, "ps_oficinas_visibles", "true");
    expect(todas.length).toBeGreaterThanOrEqual(6);
  });

  it("ps_actividades_oficina filtra", async () => {
    const r = await call(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ perfil: P.col1, estado: ["en_curso", "por_iniciar"] })]);
    expect(r.total).toBeGreaterThan(0);
    expect(r.actividades.every((a: Json) => a.responsables.some((x: Json) => x.id === P.col1))).toBe(true);
    const sin = await call(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ sin_asignar: true })]);
    expect(sin.actividades.every((a: Json) => a.responsables.length === 0)).toBe(true);
    const q = await call(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ q: "switches" })]);
    expect(q.actividades.map((a: Json) => a.titulo)).toEqual(["Cambiar los switches"]);
    expect(await fallo(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ perfil: "no-es-uuid" })])).toMatch(/inválido/);
    const sub = await call(P.jefevr, "ps_actividades_oficina", "$1, $2::jsonb", [ADM2, JSON.stringify({ incluir_subunidades: true })]);
    expect(sub.actividades.map((a: Json) => a.titulo)).toContain("En la subunidad");
  });

  it("mis actividades, carga del equipo y equipo de la oficina", async () => {
    const mis = await call(P.col1, "ps_mis_actividades", "");
    expect(mis.actividades.length).toBeGreaterThan(0);
    expect(mis.actividades.every((a: Json) => a.responsables.some((x: Json) => x.id === P.col1) && a.estado !== "hecho")).toBe(true);
    const carga = await call(P.gtic, "ps_carga_equipo", "$1", [TIC]);
    const c1 = carga.equipo.find((x: Json) => x.perfil_id === P.col1);
    expect(c1.activas).toBeGreaterThan(0);
    expect(carga.equipo.some((x: Json) => x.perfil_id === P.gvis)).toBe(false); // visor: no asignable
    expect(await fallo(P.col1, "ps_carga_equipo", "$1", [TIC])).toMatch(/Sin permiso/);
    const eqG = await call(P.gtic, "ps_equipo_oficina", "$1", [TIC]);
    const eqC = await call(P.col1, "ps_equipo_oficina", "$1", [TIC]);
    expect(eqG.find((x: Json) => x.perfil_id === P.col1).correo).toBe("col1@prueba.udes.edu.co");
    expect(eqC.find((x: Json) => x.perfil_id === P.col1).correo).toBeNull(); // privacidad
    expect(eqC.find((x: Json) => x.perfil_id === P.col1).nombre).toBe("Carlos Uno");
    expect(eqG.find((x: Json) => x.perfil_id === P.gvis).asignable).toBe(false);
    expect(eqG.find((x: Json) => x.perfil_id === P.sinnivel).asignable).toBe(false);
    expect(eqG.find((x: Json) => x.perfil_id === P.col2).campus).toBe("Cúcuta");
    expect(await fallo(P.col1, "ps_equipo_oficina", "$1", [INF])).toMatch(/Sin permiso/);
  });

  it("anon no accede a nada y las tablas no admiten escritura directa", async () => {
    for (const tabla of ["ps_actividades", "ps_checklist", "ps_asignaciones", "ps_comentarios", "ps_avisos", "ps_config"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from ${tabla}`))), tabla).toMatch(/permission denied/);
    }
    expect(await fallo(null, "ps_mis_actividades", "")).toMatch(/permission denied/);
    expect(await fallo(null, "ps_actividades_oficina", "$1", [TIC])).toMatch(/permission denied/);
    // Ni siquiera el admin escribe directo; la cola de avisos es del servicio.
    expect(await errorOf(t.asUser(P.admin, (q) => q("insert into ps_actividades (plan_id, oficina_unit_id, titulo, version_creacion_id) select plan_id, oficina_unit_id, 'x', version_creacion_id from ps_actividades limit 1")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(P.admin, (q) => q("select * from ps_avisos where false").then(() => q("insert into ps_avisos (plantilla, destinatario_id) values ('c-ps-x', $1)", [P.col1]))))).toMatch(/permission denied/);
    // Sin nivel de módulo, ni las tablas devuelven filas.
    expect(await t.asUser(P.sinnivel, (q) => q("select * from ps_actividades"))).toHaveLength(0);
    expect(await t.asUser(P.col1, (q) => q("select * from ps_avisos"))).toHaveLength(0);
    expect((await t.asUser(P.admin, (q) => q("select * from ps_avisos"))).length).toBeGreaterThan(0);
  });
});

describe("0287 · idempotencia de la migración", () => {
  it("aplicarla otra vez no falla, no pisa plantillas editadas ni duplica filas", async () => {
    await t.q("update correo_templates set subject = 'Asunto editado por la administración' where key = 'c-ps-asignacion'");
    const antes = (await t.q<{ n: number }>("select (select count(*) from ps_actividades)::int + (select count(*) from ps_config)::int n"))[0].n;
    const sql = ["0287_planeacion_seguimiento_actividades.sql", "0288_planeacion_seguimiento_avances.sql", "0289_planeacion_seguimiento_planes.sql", "0290_planeacion_seguimiento_presupuesto.sql", "0291_planeacion_seguimiento_evaluacion_proyectos.sql"].map((f) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8"));
    for (let i = 0; i < 2; i++) for (const m of sql) await t.db.exec(m);
    const despues = (await t.q<{ n: number }>("select (select count(*) from ps_actividades)::int + (select count(*) from ps_config)::int n"))[0].n;
    expect(despues).toBe(antes);
    const [c] = await t.q<{ subject: string }>("select subject from correo_templates where key = 'c-ps-asignacion'");
    expect(c.subject).toBe("Asunto editado por la administración");
    expect((await t.q("select 1 from correo_templates where key like 'c-ps-%'"))).toHaveLength(13);
  });
});

describe("0287 · bitácora solo-anexar y plantillas", () => {
  it("ps_eventos solo admite INSERT y la bitácora de oficina la leen gestor, aprobador y admin", async () => {
    expect(await errorOf(t.q("update ps_eventos set tipo = 'otro' where actividad_id is not null"))).toMatch(/solo admite INSERT/);
    expect(await errorOf(t.q("delete from ps_eventos where actividad_id is not null"))).toMatch(/solo admite INSERT/);
    const tipos = (await t.q<{ tipo: string }>("select distinct tipo from ps_eventos where oficina_unit_id is not null")).map((x) => x.tipo);
    for (const e of ["actividad.creada", "actividad.editada", "actividad.asignada", "actividad.movida", "actividad.transferida", "actividad.desasignada", "actividades.cargadas", "checklist.agregado", "comentario.creado"]) {
      expect(tipos, e).toContain(e);
    }
    for (const u of [P.gtic, P.aprob, P.admin]) expect((await call(u, "ps_bitacora_oficina", "$1, 50", [TIC])).length).toBeGreaterThan(0);
    for (const u of [P.col1, P.lector, P.ginf]) expect(await fallo(u, "ps_bitacora_oficina", "$1", [TIC]), u).toMatch(/Sin permiso/);
  });

  it("las plantillas c-ps-* existen, son del grupo y usan solo variables conocidas", async () => {
    const rows = await t.q<{ key: string; grp: string; action: string; tipo: string; subject: string; body: string; title: string; active: boolean }>(
      "select key, grp, action, tipo, subject, body, title, active from correo_templates where key like 'c-ps-%' order by key");
    expect(rows.map((r) => r.key)).toEqual(["c-ps-aporte", "c-ps-asignacion", "c-ps-avance", "c-ps-cumplida", "c-ps-devuelto", "c-ps-por-vencer", "c-ps-transferencia", "c-ps-vaf-alerta", "c-ps-vaf-evaluar", "c-ps-vaf-resultado", "c-ps-validacion-pendiente", "c-ps-validado", "c-ps-vencida"]);
    const conocidas = new Set(["nombre", "correo", "sede", "rol", "enlace", "modulo", "titulo_aviso", "detalle", "oficina", "fecha_limite", "dias", "comentario", "autor"]);
    for (const r of rows) {
      expect(r).toMatchObject({ grp: "Planeación y Seguimiento", action: "ps", tipo: "aviso", active: true });
      for (const m of `${r.subject} ${r.body} ${r.title}`.matchAll(/\{\{(\w+)\}\}/g)) expect(conocidas.has(m[1]), `${r.key}: ${m[1]}`).toBe(true);
    }
  });

  it("los avisos usan solo plantillas existentes", async () => {
    const huerfanas = await t.q("select distinct a.plantilla from ps_avisos a where not exists (select 1 from correo_templates c where c.key = a.plantilla)");
    expect(huerfanas).toEqual([]);
  });
});
