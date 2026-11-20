/* Migración 0288 (Planeación y Seguimiento, fase 3): avances con validación del gestor (nunca el propio), evidencias, riesgos y
   acciones, conexión con el PDI, plazos de aviso por oficina, plazo de validación, bucket privado y RLS. Ver CONTRATO-BD-F3.md. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

const id = (n: number) => `00000000-0000-4000-a000-00000000e${String(n).padStart(3, "0")}`;
const P = { admin: id(1), gtic: id(2), gtic2: id(3), col1: id(4), col2: id(5), lector: id(6), aprob: id(7), ginf: id(8), colinf: id(9), sinnivel: id(10) };
const NIVEL: Record<string, string> = { gtic: "gestor", gtic2: "gestor", col1: "colaborador", col2: "colaborador", lector: "lector", aprob: "aprobador", ginf: "gestor", colinf: "colaborador", sinnivel: "none" };

let t: TestDb;
let plan: string;
let TIC: string, INF: string, VR: string;
let PIL1: string, PIL2: string, PILB: string, AREA1: string;
const LIN: Record<string, string> = {};

type Json = Record<string, any>;
const rpc = <T = Json>(q: Query, fn: string, args: string, params: unknown[]) => q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const call = <T = Json>(user: string | null, fn: string, args: string, params: unknown[] = []) => t.asUser(user, (q) => rpc<T>(q, fn, args, params), { commit: true });
const fallo = (user: string | null, fn: string, args: string, params: unknown[] = []) => errorOf(call(user, fn, args, params));
const unit = async (code: string, parent: string | null) =>
  (await t.q<{ id: string }>("insert into units (code, name, slug, parent_id) values ($1, $2, $3, $4) returning id", [code, `Oficina ${code}`, code.toLowerCase(), parent]))[0].id;

/** Crea una actividad (con «sin_pdi» salvo que se pida otra cosa). */
const crear = (user: string, u: string, datos: Json) =>
  call(user, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, u, JSON.stringify({ pdi: { conexion: "sin_pdi" }, ...datos })]).then((r) => r.actividad as Json);
const reportar = (u: string, a: string, d: Json = {}) =>
  call(u, "ps_avance_reportar", "$1, $2::jsonb", [a, JSON.stringify({ av_fisico: 30, nota: "Se avanzó con la fase uno del trabajo", ...d })]);
const validar = (u: string, av: string, nota = "") => call(u, "ps_avance_validar", "$1, $2", [av, nota]);
const devolver = (u: string, av: string, nota: string) => call(u, "ps_avance_devolver", "$1, $2", [av, nota]);
const avisos = (act: string | null, plantilla?: string) =>
  t.q<{ destinatario_id: string; plantilla: string; datos: Json }>(
    "select destinatario_id, plantilla, datos from ps_avisos where ($1::uuid is null or actividad_id = $1) and ($2::text is null or plantilla = $2) order by id", [act, plantilla ?? null]);
const estadoDe = async (a: string) => (await t.q<{ estado: string }>("select estado from ps_actividades where id = $1", [a]))[0].estado;
const uuid = () => crypto.randomUUID();
const ruta = (unidad: string, act: string, nombre = "informe.pdf") => `${unidad}/${act}/${uuid()}-${nombre}`;
const archivo = (unidad: string, act: string, extra: Json = {}) => ({ tipo: "archivo", nombre: "informe.pdf", storage_path: ruta(unidad, act), mime: "application/pdf", bytes: 1000, ...extra });
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeAll(async () => {
  t = await createTestDb();
  VR = await unit("VRX", null);
  TIC = await unit("TICX", VR);
  INF = await unit("INFX", VR);

  for (const nivel of ["lector", "aprobador", "gestor", "colaborador", "none"]) {
    await t.q(`insert into access_roles (key, name, base_role, screens, ps_nivel) values ($1, $1, 'consulta', array['planeacion_seguimiento'], $2)`, [`ps3-${nivel}`, nivel]);
  }
  const nombres: Record<string, string> = { admin: "Ana Admin", gtic: "Gabriela TIC", gtic2: "Gerardo TIC", col1: "Carlos Uno", col2: "Camila Dos", lector: "Laura Lectora", aprob: "Alberto Aprobador", ginf: "Gonzalo INF", colinf: "Clara INF", sinnivel: "Sin Nivel" };
  for (const [k, uid] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid, `${k}@prueba.udes.edu.co`]);
    await t.q("insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [uid, `${k}@prueba.udes.edu.co`, nombres[k]]);
    await t.q("update profiles set is_active = true, full_name = $3, role = $2::app_role where id = $1", [uid, k === "admin" ? "admin" : "consulta", nombres[k]]);
    if (k !== "admin") await t.q("update profiles set access_role_id = (select id from access_roles where key = $2) where id = $1", [uid, `ps3-${NIVEL[k]}`]);
  }
  const m = (u: string, p: string, rol: string) => t.q("insert into unit_members (unit_id, profile_id, role) values ($1, $2, $3::unit_role)", [u, p, rol]);
  await m(TIC, P.gtic, "jefe"); await m(TIC, P.gtic2, "jefe"); await m(TIC, P.col1, "editor"); await m(TIC, P.col2, "editor");
  await m(TIC, P.sinnivel, "editor"); await m(INF, P.ginf, "jefe"); await m(INF, P.colinf, "editor");

  // Un pedacito del PDI: dos pilares publicados, uno en borrador, 13 líneas en el primero.
  const pil = async (slug: string, nombre: string, estado: string, pos: number) =>
    (await t.q<{ id: string }>("insert into pillars (slug, name, status, position) values ($1, $2, $3::publication_status, $4) returning id", [slug, nombre, estado, pos]))[0].id;
  PIL1 = await pil("tp-uno", "Pilar Uno", "publicado", 901);
  PIL2 = await pil("tp-dos", "Pilar Dos", "publicado", 902);
  PILB = await pil("tp-borrador", "Pilar Borrador", "borrador", 903);
  AREA1 = (await t.q<{ id: string }>("insert into strategic_areas (pillar_id, code, name, position) values ($1, 'TAE-1', 'Área Uno', 1) returning id", [PIL1]))[0].id;
  const area2 = (await t.q<{ id: string }>("insert into strategic_areas (pillar_id, code, name, position) values ($1, 'TAE-2', 'Área Dos', 1) returning id", [PIL2]))[0].id;
  for (let i = 1; i <= 13; i++) {
    LIN[`1.${i}`] = (await t.q<{ id: string }>("insert into action_lines (area_id, code, name, position) values ($1, $2, $3, $4) returning id", [AREA1, `TLA-1.${i}`, `Línea uno punto ${i}`, i]))[0].id;
  }
  LIN["2.1"] = (await t.q<{ id: string }>("insert into action_lines (area_id, code, name, position) values ($1, 'TLA-2.1', 'Línea dos punto uno', 1) returning id", [area2]))[0].id;

  plan = await call<string>(P.admin, "ps_crear_plan", "'PDIFyT avances', 2027, 2035, $1", [VR]);
  const fila = (clave: string) => ({ clave, nombre: `Proyecto ${clave}`, pilar: "Pilar A", campus: "Todos", prioridad: "Alto", monto: 1000 });
  const carga = await call<Json>(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [plan, JSON.stringify(["1", "2", "3"].map(fila))]);
  expect(carga.errores).toEqual([]);
  for (const [clave, u] of [["1", TIC], ["2", TIC], ["3", INF]] as const) await call(P.admin, "ps_asignar_oficina_linea", "$1, $2, $3", [carga.version_id, clave, u]);
  await call(P.admin, "ps_publicar_version", "$1, ''", [carga.version_id]);
}, 240_000);

afterAll(async () => t?.close());

describe("0288 · reportar, validar y devolver: permisos por rol", () => {
  let act: string, av1: string;

  it("reportar: el gestor y el colaborador asignado sí; el resto no", async () => {
    act = (await crear(P.gtic, TIC, { titulo: "Migrar el servidor", responsables: [P.col1] })).id;
    for (const u of [P.col2, P.lector, P.aprob]) expect(await errorOf(reportar(u, act)), u).toMatch(/Sin permiso/);
    for (const u of [P.ginf, P.sinnivel]) expect(await errorOf(reportar(u, act)), u).toMatch(/no existe/);
    const r = await reportar(P.col1, act, { av_fisico: 30, av_financiero: 10 });
    expect(r.ok).toBe(true);
    av1 = r.avance.id;
    expect(r.avance).toMatchObject({ estado: "pendiente", av_fisico: 30, av_financiero: 10, vencido: false, actividad_id: act });
    expect(r.avance.reportado_por).toMatchObject({ id: P.col1, nombre: "Carlos Uno" });
    expect(r.avance.revisado_por).toBeNull();
    expect(r.actividad.estado).toBe("en_revision");
    expect(r.actividad.avance).toMatchObject({ fisico: 0, financiero: null, validado_en: null, pendientes: 1 });
    const av = await avisos(act, "c-ps-avance");
    expect(av.map((x) => x.destinatario_id).sort()).toEqual([P.gtic, P.gtic2].sort());
    expect(av[0].datos).toMatchObject({ fisico: 30, actividad: "Migrar el servidor" });
    const tipos = (await t.q<{ tipo: string }>("select tipo from ps_eventos where actividad_id = $1", [act])).map((x) => x.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["avance.reportado", "actividad.movida"]));
    const [c] = await t.q<{ tipo: string }>("select tipo from ps_comentarios where actividad_id = $1 order by creado_en desc limit 1", [act]);
    expect(c.tipo).toBe("cambio_estado");
  });

  it("un segundo avance pendiente, fechas futuras, porcentajes y nota inválidos se rechazan", async () => {
    expect(await errorOf(reportar(P.col1, act, { av_fisico: 40 }))).toMatch(/pendiente de revisión/);
    const otra = (await crear(P.gtic, TIC, { titulo: "Validaciones de datos", responsables: [P.col1] })).id;
    expect(await errorOf(reportar(P.col1, otra, { av_fisico: 101 }))).toMatch(/entre 0 y 100/);
    expect(await errorOf(reportar(P.col1, otra, { av_fisico: -1 }))).toMatch(/entre 0 y 100/);
    expect(await errorOf(reportar(P.col1, otra, { av_financiero: 150 }))).toMatch(/financiero/);
    expect(await errorOf(reportar(P.col1, otra, { nota: "corta" }))).toMatch(/entre 10 y 2000/);
    expect(await errorOf(reportar(P.col1, otra, { fecha: "2999-01-01" }))).toMatch(/futura/);
    expect(await errorOf(reportar(P.col1, otra, { fecha: "no-es-fecha" }))).toMatch(/válidos/);
    expect(await errorOf(call(P.col1, "ps_avance_reportar", "$1, '[]'::jsonb", [otra]))).toMatch(/objeto/);
    expect(await estadoDe(otra)).toBe("por_iniciar");
  });

  it("validar: solo el gestor de la oficina o el admin; el colaborador, el lector y otra oficina no", async () => {
    for (const u of [P.col1, P.col2, P.lector, P.aprob]) expect(await errorOf(validar(u, av1)), u).toMatch(/Sin permiso/);
    expect(await errorOf(validar(P.ginf, av1))).toMatch(/no existe/);
    const r = await validar(P.gtic, av1, "Va bien, sigan así");
    expect(r.avance).toMatchObject({ estado: "validado", nota_revision: "Va bien, sigan así" });
    expect(r.avance.revisado_por.id).toBe(P.gtic);
    expect(r.actividad.estado).toBe("en_curso");
    expect(r.actividad.avance).toMatchObject({ fisico: 30, financiero: 10, pendientes: 0 });
    expect(r.actividad.avance.validado_en).not.toBeNull();
    const v = await avisos(act, "c-ps-validado");
    expect(v.map((x) => x.destinatario_id)).toEqual([P.col1]);
    expect(await errorOf(validar(P.gtic, av1))).toMatch(/ya fue revisado/);
  });

  it("devolver exige 20 caracteres, deja la actividad en curso, comenta y avisa al autor", async () => {
    const r = await reportar(P.col1, act, { av_fisico: 45, nota: "Segundo avance de la migración" });
    const av2 = r.avance.id;
    expect(await errorOf(devolver(P.gtic, av2, "muy corta"))).toMatch(/20 caracteres/);
    expect(await errorOf(devolver(P.col1, av2, "Una nota suficientemente larga"))).toMatch(/Sin permiso/);
    const d = await devolver(P.gtic, av2, "Falta adjuntar el acta de la reunión");
    expect(d.avance).toMatchObject({ estado: "devuelto", nota_revision: "Falta adjuntar el acta de la reunión" });
    expect(d.actividad.estado).toBe("en_curso");
    expect(d.actividad.avance.fisico).toBe(30); // el devuelto no cuenta
    const dev = await avisos(act, "c-ps-devuelto");
    expect(dev.map((x) => x.destinatario_id)).toEqual([P.col1]);
    const [c] = await t.q<{ tipo: string; texto: string }>("select tipo, texto from ps_comentarios where actividad_id = $1 and tipo = 'devolucion'", [act]);
    expect(c.texto).toMatch(/acta de la reunión/);
    const mis = await call<Json[]>(P.col1, "ps_mis_avances", "");
    expect(mis.find((x) => x.id === av2)).toMatchObject({ estado: "devuelto", nota_revision: "Falta adjuntar el acta de la reunión", actividad: { id: act } });
    expect(mis.every((x) => x.reportado_por.id === P.col1)).toBe(true);
  });

  it("monotonía: el físico no baja respecto al último validado (al reportar y a nivel de tabla)", async () => {
    expect(await errorOf(reportar(P.col1, act, { av_fisico: 20 }))).toMatch(/no puede ser menor/);
    expect(await errorOf(t.q(`insert into ps_avances (actividad_id, version_id, fecha, av_fisico, nota, reportado_por)
      select id, version_creacion_id, current_date, 10, 'Intento por la puerta de atrás', $2 from ps_actividades where id = $1`, [act, P.col1]))).toMatch(/no puede ser menor/);
    const igual = await reportar(P.col1, act, { av_fisico: 30, nota: "Mismo porcentaje que el anterior" });
    expect(igual.avance.estado).toBe("pendiente");
    await devolver(P.gtic, igual.avance.id, "Sin cambios respecto del anterior, no se acepta");
  });

  it("un avance revisado no se edita ni se borra; las tablas no admiten escritura directa", async () => {
    expect(await errorOf(t.q("update ps_avances set av_fisico = 99 where id = $1", [av1]))).toMatch(/no se edita/);
    expect(await errorOf(t.q("delete from ps_avances where id = $1", [av1]))).toMatch(/no se borra/);
    expect(await errorOf(t.asUser(P.gtic, (q) => q("update ps_avances set av_fisico = 99 where id = $1", [av1])))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(P.gtic, (q) => q("insert into ps_riesgos (actividad_id, oficina_unit_id, titulo) values ($1, $2, 'directo')", [act, TIC])))).toMatch(/permission denied/);
  });
});

describe("0288 · nadie valida lo propio", () => {
  it("el gestor que reporta no se valida ni se devuelve; otro gestor tampoco: lo revisa el admin", async () => {
    const act = (await crear(P.gtic, TIC, { titulo: "Trabajo del gestor" })).id;
    const r = await reportar(P.gtic, act, { av_fisico: 50 });
    expect(await errorOf(validar(P.gtic, r.avance.id))).toMatch(/nadie revisa|él mismo/);
    expect(await errorOf(devolver(P.gtic, r.avance.id, "Me devuelvo a mí mismo sin permiso"))).toMatch(/él mismo/);
    expect(await errorOf(validar(P.gtic2, r.avance.id))).toMatch(/administrador/);
    expect(await errorOf(devolver(P.gtic2, r.avance.id, "Otro gestor no revisa a un gestor"))).toMatch(/administrador/);
    // el aviso de avance llegó al otro gestor, no al autor
    expect((await avisos(act, "c-ps-avance")).map((x) => x.destinatario_id)).toEqual([P.gtic2]);
    const por = await call<Json[]>(P.gtic, "ps_avances_por_validar", "$1", [TIC]);
    expect(por.find((x) => x.id === r.avance.id)).toMatchObject({ puede_validar: false });
    const v = await validar(P.admin, r.avance.id, "Revisado por la administración");
    expect(v.avance).toMatchObject({ estado: "validado", autovalidado: false });
    expect(v.avance.revisado_por.id).toBe(P.admin);
  });

  it("a nivel de tabla: revisor igual a autor solo con la marca autovalidado", async () => {
    const act = (await crear(P.gtic, TIC, { titulo: "Prueba de la restricción" })).id;
    expect(await errorOf(t.q(`insert into ps_avances (actividad_id, version_id, fecha, av_fisico, nota, estado, reportado_por, revisado_por, revisado_en)
      select id, version_creacion_id, current_date, 10, 'Avance que se valida a sí mismo', 'validado', $2, $2, now() from ps_actividades where id = $1`, [act, P.gtic]))).toMatch(/nace pendiente|ps_av_no_propio/);
  });
});

describe("0288 · validar en lote (todo o nada) y paso a «hecho»", () => {
  const pendiente = async (titulo: string, quien = P.col1, extra: Json = {}) => {
    const a = (await crear(P.gtic, TIC, { titulo, responsables: [P.col1] })).id;
    const r = await reportar(quien, a, extra);
    return { act: a, av: r.avance.id as string };
  };

  it("si uno falla no se valida ninguno; si todos pasan, se validan todos", async () => {
    const a = await pendiente("Lote A");
    const b = await pendiente("Lote B");
    const propio = (await crear(P.gtic, TIC, { titulo: "Lote propio" })).id;
    const c = (await reportar(P.gtic, propio, { av_fisico: 20 })).avance.id;
    expect(await errorOf(call(P.gtic, "ps_avances_validar_lote", "$1::uuid[]", [[a.av, b.av, c]]))).toMatch(/nadie revisa|él mismo/);
    for (const x of [a.act, b.act]) expect(await estadoDe(x)).toBe("en_revision");
    expect((await t.q("select 1 from ps_avances where id = any($1::uuid[]) and estado = 'pendiente'", [[a.av, b.av, c]]))).toHaveLength(3);
    const r = await call(P.gtic, "ps_avances_validar_lote", "$1::uuid[]", [[a.av, b.av]]);
    expect(r).toMatchObject({ ok: true, validados: 2 });
    for (const x of [a.act, b.act]) expect(await estadoDe(x)).toBe("en_curso");
    expect(await fallo(P.col1, "ps_avances_validar_lote", "$1::uuid[]", [[c]])).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_avances_validar_lote", "$1::uuid[]", [[]])).toMatch(/1 a 50/);
    expect(await fallo(P.gtic, "ps_avances_validar_lote", "$1::uuid[]", [Array.from({ length: 51 }, () => uuid())])).toMatch(/1 a 50/);
    expect(await fallo(P.gtic, "ps_avances_validar_lote", "$1::uuid[]", [[uuid()]])).toMatch(/no existe/);
  });

  it("con 100 % la actividad pasa a hecho en el mismo acto, con avisos de validado y cumplida", async () => {
    const { act, av } = await pendiente("Entrega completa", P.col1, { av_fisico: 100, av_financiero: 100 });
    const r = await validar(P.gtic, av, "Entregado y verificado");
    expect(r.actividad.estado).toBe("hecho");
    expect(r.actividad.completada_en).not.toBeNull();
    expect(r.actividad.avance).toMatchObject({ fisico: 100, financiero: 100 });
    expect((await avisos(act, "c-ps-validado")).map((x) => x.destinatario_id)).toEqual([P.col1]);
    expect((await avisos(act, "c-ps-cumplida")).map((x) => x.destinatario_id).sort()).toEqual([P.gtic2, P.col1].sort());
    expect(await errorOf(reportar(P.col1, act, { av_fisico: 100 }))).toMatch(/ya está hecha/);
  });

  it("con un riesgo Alto abierto, validar un avance parcial deja la actividad en riesgo", async () => {
    const a = (await crear(P.gtic, TIC, { titulo: "Con riesgo", responsables: [P.col1] })).id;
    const r = await reportar(P.col1, a, { av_fisico: 40, riesgo: { titulo: "Proveedor retrasado", descripcion: "No entrega a tiempo", nivel: "Alto", mitigacion: "Buscar otro" } });
    expect(r.actividad.estado).toBe("en_revision"); // un avance siempre va a revisión
    expect((await t.q("select 1 from ps_riesgos where actividad_id = $1 and nivel = 'Alto' and estado = 'abierto'", [a]))).toHaveLength(1);
    expect((await validar(P.gtic, r.avance.id)).actividad.estado).toBe("en_riesgo");
  });

  it("ps_actividad_mover a hecho: valida el pendiente de otra persona, exige uno validado y no deja cerrar con uno propio", async () => {
    const { act, av } = await pendiente("Cierre por mover", P.col1, { av_fisico: 60 });
    const r = await call(P.gtic, "ps_actividad_mover", "$1, 'hecho'", [act]);
    expect(r.actividad.estado).toBe("hecho");
    expect((await t.q<{ estado: string }>("select estado from ps_avances where id = $1", [av]))[0].estado).toBe("validado");
    expect((await avisos(act, "c-ps-validado")).map((x) => x.destinatario_id)).toEqual([P.col1]);
    // sin ningún avance
    const sin = (await crear(P.gtic, TIC, { titulo: "Sin avances" })).id;
    expect(await fallo(P.gtic, "ps_actividad_mover", "$1, 'hecho'", [sin])).toMatch(/Cerrar actividad/);
    // con un avance propio sin revisar
    const propio = (await crear(P.gtic, TIC, { titulo: "Avance propio" })).id;
    await reportar(P.gtic, propio, { av_fisico: 10 });
    expect(await fallo(P.gtic, "ps_actividad_mover", "$1, 'hecho'", [propio])).toMatch(/Sin permiso/);
    expect(await estadoDe(propio)).toBe("en_revision");
  });

  it("mover: devolver con un avance pendiente lo deja devuelto; el colaborador no mueve una actividad con un avance suyo en revisión", async () => {
    const { act, av } = await pendiente("Devolver por mover");
    expect(await fallo(P.col1, "ps_actividad_mover", "$1, 'en_curso'", [act])).toMatch(/pendiente de revisión/);
    const r = await call(P.gtic, "ps_actividad_mover", "$1, 'en_curso', 'Faltan los anexos del informe'", [act]);
    expect(r.actividad.estado).toBe("en_curso");
    expect((await t.q<{ estado: string }>("select estado from ps_avances where id = $1", [av]))[0].estado).toBe("devuelto");
  });

  it("ps_actividad_cerrar: cierre administrativo del gestor, autovalidado y auditado", async () => {
    const a = (await crear(P.gtic, TIC, { titulo: "Cierre administrativo", responsables: [P.col1] })).id;
    expect(await fallo(P.col1, "ps_actividad_cerrar", "$1, 'Quiero cerrarla yo mismo'", [a])).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_actividad_cerrar", "$1, 'corta'", [a])).toMatch(/entre 10 y 2000/);
    const r = await call(P.gtic, "ps_actividad_cerrar", "$1, 'El trabajo se terminó fuera del portal'", [a]);
    expect(r.actividad.estado).toBe("hecho");
    expect(r.avance).toMatchObject({ estado: "validado", av_fisico: 100, autovalidado: true });
    expect(r.avance.reportado_por.id).toBe(P.gtic);
    expect(r.avance.revisado_por.id).toBe(P.gtic);
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'avance.autovalidado'", [a]);
    expect(ev.datos.autovalidado).toBe(true);
    expect((await avisos(a, "c-ps-cumplida")).map((x) => x.destinatario_id).sort()).toEqual([P.gtic2, P.col1].sort());
    expect(await fallo(P.gtic, "ps_actividad_cerrar", "$1, 'Otra vez el cierre de la actividad'", [a])).toMatch(/ya está hecha/);
    // la marca solo existe en el cierre: no se puede fabricar un autovalidado pendiente
    const b = (await crear(P.gtic, TIC, { titulo: "Cierre con pendiente ajeno", responsables: [P.col1] })).id;
    const p = await reportar(P.col1, b, { av_fisico: 70 });
    const c = await call(P.gtic, "ps_actividad_cerrar", "$1, 'Se cierra con lo ya reportado'", [b]);
    expect(c.actividad.estado).toBe("hecho");
    expect((await t.q<{ estado: string }>("select estado from ps_avances where id = $1", [p.avance.id]))[0].estado).toBe("validado");
    const d = (await crear(P.gtic, TIC, { titulo: "Cierre con pendiente propio" })).id;
    await reportar(P.gtic, d, { av_fisico: 5 });
    expect(await fallo(P.gtic, "ps_actividad_cerrar", "$1, 'No se puede con uno propio'", [d])).toMatch(/propio/);
  });
});

describe("0288 · evidencias", () => {
  let act: string;
  beforeAll(async () => { act = (await crear(P.gtic, TIC, { titulo: "Con evidencias", responsables: [P.col1] })).id; });

  it("archivos y enlaces válidos se guardan con el avance; no hay URL, solo la ruta", async () => {
    const f = archivo(TIC, act, { huella_sha256: "a".repeat(64) });
    const r = await reportar(P.col1, act, { evidencias: [f, { tipo: "enlace", nombre: "Tablero", url: "https://planeacion.udes.edu.co/x" }] });
    const evs = r.avance.evidencias as Json[];
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ tipo: "archivo", nombre: "informe.pdf", storage_path: f.storage_path, mime: "application/pdf", bytes: 1000, url: null });
    expect(evs[1]).toMatchObject({ tipo: "enlace", url: "https://planeacion.udes.edu.co/x", storage_path: null });
    const d = await call(P.col2, "ps_actividad_detalle", "$1", [act]);
    expect(d.avances[0].evidencias).toHaveLength(2);
    await devolver(P.gtic, r.avance.id, "Se devuelve para probar las evidencias");
  });

  it("rechaza tipos, extensiones, tamaños, rutas ajenas, enlaces y más de 10", async () => {
    const ok = (e: Json) => reportar(P.col1, act, { evidencias: [e] });
    expect(await errorOf(ok(archivo(TIC, act, { nombre: "programa.exe", mime: "application/x-msdownload" })))).toMatch(/no admitido/);
    expect(await errorOf(ok(archivo(TIC, act, { nombre: "informe.docx", mime: "application/pdf" })))).toMatch(/no admitido/);
    expect(await errorOf(ok(archivo(TIC, act, { nombre: "sin-extension", mime: "application/pdf" })))).toMatch(/no admitido/);
    expect(await errorOf(ok(archivo(TIC, act, { bytes: 20 * 1024 * 1024 + 1 })))).toMatch(/20 MB/);
    expect(await errorOf(ok(archivo(TIC, act, { bytes: 0 })))).toMatch(/20 MB/);
    expect(await errorOf(ok(archivo(TIC, uuid())))).toMatch(/carpeta de esta actividad/);
    expect(await errorOf(ok(archivo(INF, act)))).toMatch(/carpeta de esta actividad/);
    expect(await errorOf(ok(archivo(TIC, act, { storage_path: `${TIC}/${act}/../otra/x.pdf` })))).toMatch(/carpeta/);
    expect(await errorOf(ok(archivo(TIC, act, { huella_sha256: "xyz" })))).toMatch(/sha256/);
    expect(await errorOf(ok({ tipo: "enlace", nombre: "Malo", url: "javascript:alert(1)" }))).toMatch(/http/);
    expect(await errorOf(ok({ tipo: "enlace", nombre: "Malo", url: "ftp://servidor/x" }))).toMatch(/http/);
    expect(await errorOf(ok({ tipo: "otro", nombre: "x" }))).toMatch(/archivo o enlace/);
    expect(await errorOf(ok({ tipo: "enlace", nombre: "", url: "https://a.co" }))).toMatch(/nombre/);
    const once = Array.from({ length: 11 }, (_, i) => ({ tipo: "enlace", nombre: `E${i}`, url: `https://a.co/${i}` }));
    expect(await errorOf(reportar(P.col1, act, { evidencias: once }))).toMatch(/hasta 10/);
    // los tipos admitidos
    const tipos: [string, string][] = [["a.pdf", "application/pdf"], ["a.docx", MIME_DOCX], ["a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["a.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], ["a.png", "image/png"], ["a.jpg", "image/jpeg"], ["a.csv", "text/csv"], ["a.txt", "text/plain"], ["a.zip", "application/zip"]];
    const r = await reportar(P.col1, act, { evidencias: tipos.map(([nombre, mime]) => archivo(TIC, act, { nombre, mime })) });
    expect(r.avance.evidencias).toHaveLength(9);
    await devolver(P.gtic, r.avance.id, "Se devuelve para seguir con las pruebas");
  });

  it("registrar y quitar solo en un avance pendiente; el avance validado conserva su evidencia", async () => {
    const r = await reportar(P.col1, act, { evidencias: [{ tipo: "enlace", nombre: "Uno", url: "https://a.co/1" }] });
    const av = r.avance.id;
    expect(await fallo(P.col2, "ps_evidencia_registrar", "$1, $2::jsonb", [av, JSON.stringify({ tipo: "enlace", nombre: "Dos", url: "https://a.co/2" })])).toMatch(/Sin permiso/);
    const e2 = await call(P.col1, "ps_evidencia_registrar", "$1, $2::jsonb", [av, JSON.stringify(archivo(TIC, act, { nombre: "plano.png", mime: "image/png" }))]);
    expect(e2).toMatchObject({ tipo: "archivo", nombre: "plano.png" });
    expect(await fallo(P.col2, "ps_evidencia_quitar", "$1", [e2.id])).toMatch(/Sin permiso/);
    expect((await call(P.col1, "ps_evidencia_quitar", "$1", [e2.id])).storage_path).toBe(e2.storage_path);
    expect((await t.q("select 1 from ps_evidencias where avance_id = $1", [av]))).toHaveLength(1);
    const ev = (await t.q<{ id: string }>("select id from ps_evidencias where avance_id = $1", [av]))[0].id;
    await validar(P.gtic, av);
    expect(await fallo(P.col1, "ps_evidencia_registrar", "$1, $2::jsonb", [av, JSON.stringify({ tipo: "enlace", nombre: "Tarde", url: "https://a.co/3" })])).toMatch(/ya fue revisado/);
    expect(await fallo(P.gtic, "ps_evidencia_quitar", "$1", [ev])).toMatch(/no se borra/);
    expect(await errorOf(t.q("delete from ps_evidencias where id = $1", [ev]))).toMatch(/ya revisado/);
    expect(await errorOf(t.q("update ps_evidencias set nombre = 'x' where id = $1", [ev]))).toMatch(/no se modifica/);
  });

  it("el bucket ps-evidencias es privado y sus políticas siguen a ps_poder", async () => {
    const [b] = await t.q<{ public: boolean; file_size_limit: string }>("select public, file_size_limit from storage.buckets where id = 'ps-evidencias'");
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(20971520);
    const a2 = (await crear(P.gtic, TIC, { titulo: "Bucket", responsables: [P.col1] })).id;
    const nombre = ruta(TIC, a2, "evidencia.pdf");
    const sube = (u: string, name: string) => t.asUser(u, (q) => q("insert into storage.objects (bucket_id, name) values ('ps-evidencias', $1)", [name]), { commit: true });
    expect(await errorOf(sube(P.col2, nombre))).toMatch(/row-level security/);     // no asignado
    expect(await errorOf(sube(P.lector, nombre))).toMatch(/row-level security/);
    expect(await errorOf(sube(P.ginf, nombre))).toMatch(/row-level security/);     // otra oficina
    expect(await errorOf(sube(P.col1, `${TIC}/${uuid()}/x.pdf`))).toMatch(/row-level security/); // actividad que no existe
    expect(await errorOf(sube(P.col1, `${TIC}/${a2}/../x.pdf`))).toMatch(/row-level security/);
    expect(await errorOf(t.asUser(P.col1, (q) => q("insert into storage.objects (bucket_id, name) values ('otro-bucket', $1)", [nombre])))).toBeTruthy();
    await sube(P.col1, nombre);
    await sube(P.gtic, ruta(TIC, a2, "del-gestor.pdf"));
    const ve = (u: string) => t.asUser(u, (q) => q("select name from storage.objects where bucket_id = 'ps-evidencias' and name = $1", [nombre]));
    expect(await ve(P.col2)).toHaveLength(1);   // todos los de la oficina leen
    expect(await ve(P.lector)).toHaveLength(1); // el lector ve todas las oficinas
    expect(await ve(P.ginf)).toHaveLength(0);   // gestor de otra oficina: no la ve
    expect(await ve(P.sinnivel)).toHaveLength(0);
    // borrar: solo quien puede subir; un archivo ligado a un avance revisado no se borra
    const borra = (u: string, name: string) => t.asUser(u, (q) => q("delete from storage.objects where bucket_id = 'ps-evidencias' and name = $1 returning name", [name]), { commit: true });
    expect(await borra(P.col2, nombre)).toHaveLength(0);
    expect(await borra(P.col1, nombre)).toHaveLength(1);
    const ligado = ruta(TIC, a2, "ligado.pdf");
    await sube(P.gtic, ligado);
    const r = await reportar(P.col1, a2, { evidencias: [{ tipo: "archivo", nombre: "ligado.pdf", storage_path: ligado, mime: "application/pdf", bytes: 5 }] });
    expect(await borra(P.gtic, ligado)).toHaveLength(1);   // pendiente: se puede quitar
    await sube(P.gtic, ligado);
    await validar(P.gtic, r.avance.id);
    expect(await borra(P.gtic, ligado)).toHaveLength(0);   // validado: queda
  });
});

describe("0288 · riesgos y acciones de mitigación", () => {
  let act: string, riesgo: string, accion: string;
  beforeAll(async () => { act = (await crear(P.gtic, TIC, { titulo: "Con riesgos", responsables: [P.col1] })).id; });
  const nuevo = (u: string, d: Json = {}) => call(u, "ps_riesgo_crear", "$1, $2::jsonb", [act, JSON.stringify({ titulo: "Falla del proveedor", descripcion: "No entrega", nivel: "Crítico", mitigacion: "Plan B", ...d })]);

  it("crear: gestor, admin y colaborador asignado; no el colaborador ajeno, el lector ni otra oficina", async () => {
    const r = await nuevo(P.col1);
    riesgo = r.id;
    expect(r).toMatchObject({ nivel: "Crítico", estado: "abierto", actividad_id: act, oficina_unit_id: TIC, acciones: [] });
    expect(r.creado_por.id).toBe(P.col1);
    expect((await nuevo(P.gtic, { nivel: "medio" })).nivel).toBe("Medio");
    for (const u of [P.col2, P.lector, P.aprob]) expect(await errorOf(nuevo(u)), u).toMatch(/Sin permiso/);
    expect(await errorOf(nuevo(P.ginf))).toMatch(/no existe/);
    expect(await errorOf(nuevo(P.gtic, { titulo: "ab" }))).toMatch(/entre 3 y 200/);
    expect(await errorOf(nuevo(P.gtic, { nivel: "Enorme" }))).toMatch(/Crítico, Alto, Medio o Bajo/);
  });

  it("editar y cerrar son del gestor; el estado y el cierre quedan coherentes", async () => {
    expect(await fallo(P.col1, "ps_riesgo_editar", "$1, $2::jsonb", [riesgo, JSON.stringify({ nivel: "Bajo" })])).toMatch(/Sin permiso/);
    expect(await fallo(P.col1, "ps_riesgo_cerrar", "$1, ''", [riesgo])).toMatch(/Sin permiso/);
    expect(await fallo(P.gtic, "ps_riesgo_editar", "$1, $2::jsonb", [riesgo, JSON.stringify({ actividad_id: uuid() })])).toMatch(/no se puede editar/);
    expect(await fallo(P.gtic, "ps_riesgo_editar", "$1, $2::jsonb", [riesgo, JSON.stringify({ estado: "raro" })])).toMatch(/abierto, mitigando o cerrado/);
    const e = await call(P.gtic, "ps_riesgo_editar", "$1, $2::jsonb", [riesgo, JSON.stringify({ estado: "mitigando", nivel: "Alto", mitigacion: "Se contrató otro proveedor" })]);
    expect(e).toMatchObject({ estado: "mitigando", nivel: "Alto", cerrado_en: null });
    const c = await call(P.gtic, "ps_riesgo_cerrar", "$1, 'Entregado por el nuevo proveedor'", [riesgo]);
    expect(c).toMatchObject({ estado: "cerrado", nota_cierre: "Entregado por el nuevo proveedor" });
    expect(c.cerrado_en).not.toBeNull();
    expect(await fallo(P.gtic, "ps_riesgo_cerrar", "$1, ''", [riesgo])).toMatch(/ya está cerrado/);
    expect((await call(P.gtic, "ps_riesgo_editar", "$1, $2::jsonb", [riesgo, JSON.stringify({ estado: "abierto" })])).cerrado_en).toBeNull();
    const tipos = (await t.q<{ tipo: string }>("select distinct tipo from ps_eventos where actividad_id = $1 and tipo like 'riesgo.%'", [act])).map((x) => x.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["riesgo.creado", "riesgo.editado", "riesgo.cerrado"]));
  });

  it("acciones: el gestor las define (responsable de la oficina); el responsable las marca; hasta 10", async () => {
    const mk = (u: string, d: Json) => call(u, "ps_accion_crear", "$1, $2::jsonb", [riesgo, JSON.stringify(d)]);
    expect(await errorOf(mk(P.col1, { texto: "Llamar al proveedor" }))).toMatch(/Sin permiso/);
    expect(await errorOf(mk(P.gtic, { texto: "ab" }))).toMatch(/entre 3 y 300/);
    expect(await errorOf(mk(P.gtic, { texto: "Llamar al proveedor", responsable_id: P.colinf }))).toMatch(/no pertenece a la oficina/);
    expect(await errorOf(mk(P.gtic, { texto: "Llamar al proveedor", vence: "ayer" }))).toMatch(/no son válidos/);
    const a = await mk(P.gtic, { texto: "Llamar al proveedor", responsable_id: P.col1, vence: "2027-03-01" });
    accion = a.id;
    expect(a).toMatchObject({ estado: "pendiente", responsable_id: P.col1, responsable: "Carlos Uno", vence: "2027-03-01", hecha_en: null });
    for (const [u, estado] of [[P.col2, "hecha"], [P.lector, "hecha"]] as const) expect(await fallo(u, "ps_accion_marcar", "$1, $2", [accion, estado]), u).toMatch(/Sin permiso/);
    expect(await fallo(P.col1, "ps_accion_marcar", "$1, 'rara'", [accion])).toMatch(/pendiente, en_curso o hecha/);
    expect((await call(P.col1, "ps_accion_marcar", "$1, 'en_curso'", [accion])).estado).toBe("en_curso");
    const h = await call(P.col1, "ps_accion_marcar", "$1, 'hecha'", [accion]);
    expect(h.estado).toBe("hecha");
    expect(h.hecha_en).not.toBeNull();
    expect((await call(P.gtic, "ps_accion_marcar", "$1, 'pendiente'", [accion])).hecha_en).toBeNull();
    expect(await fallo(P.col1, "ps_accion_editar", "$1, $2::jsonb", [accion, JSON.stringify({ texto: "Otra cosa distinta" })])).toMatch(/Sin permiso/);
    expect((await call(P.gtic, "ps_accion_editar", "$1, $2::jsonb", [accion, JSON.stringify({ texto: "Llamar y escribir al proveedor", responsable_id: null })])).responsable_id).toBeNull();
    for (let i = 0; i < 9; i++) await mk(P.gtic, { texto: `Acción número ${i}` });
    expect(await errorOf(mk(P.gtic, { texto: "La acción once" }))).toMatch(/hasta 10/);
  });

  it("máximo 20 riesgos abiertos por actividad; ps_riesgos_oficina filtra y ordena", async () => {
    const otra = (await crear(P.gtic, TIC, { titulo: "Muchos riesgos" })).id;
    const mk = (n: number, nivel = "Bajo") => call(P.gtic, "ps_riesgo_crear", "$1, $2::jsonb", [otra, JSON.stringify({ titulo: `Riesgo ${n}`, nivel })]);
    for (let i = 0; i < 20; i++) await mk(i);
    expect(await errorOf(mk(21))).toMatch(/hasta 20 riesgos abiertos/);
    const r = await call(P.col2, "ps_riesgos_oficina", "$1", [TIC]);
    expect(r.total).toBeGreaterThanOrEqual(22);
    expect(r.riesgos.length).toBe(r.total);
    const f = await call(P.lector, "ps_riesgos_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ actividad_id: otra, nivel: "bajo" })]);
    expect(f.total).toBe(20);
    expect(f.riesgos[0]).toMatchObject({ actividad: "Muchos riesgos", nivel: "Bajo" });
    const g = await call(P.gtic, "ps_riesgos_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ actividad_id: act, estado: "abierto" })]);
    expect(g.riesgos.every((x: Json) => x.estado === "abierto" && x.actividad_id === act)).toBe(true);
    expect(g.riesgos[0].nivel).toBe("Alto"); // el más grave primero
    expect(g.riesgos.find((x: Json) => x.id === riesgo).acciones.length).toBe(10);
    expect(await fallo(P.gtic, "ps_riesgos_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ nivel: "x" })])).toMatch(/inválido/);
    expect(await fallo(P.ginf, "ps_riesgos_oficina", "$1", [TIC])).toMatch(/Sin permiso/);
  });
});

describe("0288 · conexión con el PDI", () => {
  const pdi = (conexion: string, items: Json[] = []) => ({ conexion, items });
  const crearCon = (u: string, datos: Json) => call(u, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, TIC, JSON.stringify(datos)]);

  it("el catálogo trae pilares publicados → áreas → líneas, para cualquier persona con nivel de módulo", async () => {
    const cat = await call<Json[]>(P.col1, "ps_pdi_catalogo", "");
    const uno = cat.find((x) => x.pillar_id === PIL1)!;
    expect(uno).toMatchObject({ nombre: "Pilar Uno", slug: "tp-uno" });
    expect(uno.areas[0]).toMatchObject({ area_id: AREA1, codigo: "TAE-1", nombre: "Área Uno" });
    expect(uno.areas[0].lineas).toHaveLength(13);
    expect(uno.areas[0].lineas[0]).toMatchObject({ linea_id: LIN["1.1"], codigo: "TLA-1.1" });
    expect(cat.find((x) => x.pillar_id === PILB)).toBeUndefined(); // el borrador no aparece
    expect(cat.findIndex((x) => x.pillar_id === PIL1)).toBeLessThan(cat.findIndex((x) => x.pillar_id === PIL2));
    expect(await fallo(P.sinnivel, "ps_pdi_catalogo", "")).toMatch(/Sin permiso/);
    expect(await fallo(null, "ps_pdi_catalogo", "")).toMatch(/permission denied|Sin permiso/);
  });

  it("al crear hay que elegir: sin «pdi» o con «sin_definir» se rechaza; con_pdi y sin_pdi se guardan", async () => {
    expect(await errorOf(crearCon(P.gtic, { titulo: "Sin elegir el PDI" }))).toMatch(/Indique si la actividad se conecta con el PDI/);
    expect(await errorOf(crearCon(P.gtic, { titulo: "Sin definir el PDI", pdi: pdi("sin_definir") }))).toMatch(/con_pdi o sin_pdi/);
    const a = (await crearCon(P.gtic, { titulo: "Conectada con una línea", pdi: pdi("con_pdi", [{ pillar_id: PIL1, action_line_id: LIN["1.1"] }, { pillar_id: PIL2, action_line_id: null }]) })).actividad;
    expect(a.pdi.conexion).toBe("con_pdi");
    expect(a.pdi.items).toHaveLength(2);
    expect(a.pdi.items[0]).toMatchObject({ pillar_id: PIL1, pillar: "Pilar Uno", pillar_slug: "tp-uno", area: "Área Uno", linea_id: LIN["1.1"], linea_codigo: "TLA-1.1", linea: "Línea uno punto 1" });
    expect(a.pdi.items[1]).toMatchObject({ pillar_id: PIL2, linea_id: null, linea_codigo: null });
    const b = (await crearCon(P.gtic, { titulo: "Desconectada del PDI", pdi: pdi("sin_pdi") })).actividad;
    expect(b.pdi).toEqual({ conexion: "sin_pdi", items: [] });
    const d = await call(P.col2, "ps_actividad_detalle", "$1", [a.id]);
    expect(d.pdi.items).toHaveLength(2);
    expect(d.actividad.pdi.conexion).toBe("con_pdi");
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.creada'", [a.id]);
    expect(ev.datos.pdi).toBe("con_pdi");
  });

  it("rechaza lo incoherente: línea de otro pilar, pilar en borrador, sin items, sin_pdi con items, más de 12, repetidos", async () => {
    const f = (p: Json, t2 = "Prueba del PDI") => errorOf(crearCon(P.gtic, { titulo: t2, pdi: p }));
    expect(await f(pdi("con_pdi", [{ pillar_id: PIL2, action_line_id: LIN["1.1"] }]))).toMatch(/no pertenece al pilar/);
    expect(await f(pdi("con_pdi", [{ pillar_id: PILB }]))).toMatch(/no existe o no está publicado/);
    expect(await f(pdi("con_pdi", []))).toMatch(/al menos un pilar/);
    expect(await f(pdi("sin_pdi", [{ pillar_id: PIL1 }]))).toMatch(/sin conexión con el PDI no lleva/);
    expect(await f(pdi("con_pdi", Array.from({ length: 13 }, (_, i) => ({ pillar_id: PIL1, action_line_id: LIN[`1.${i + 1}`] }))))).toMatch(/hasta 12/);
    expect(await f(pdi("con_pdi", [{ pillar_id: uuid() }]))).toMatch(/no existe o no está publicado/);
    expect(await f(pdi("con_pdi", [{ action_line_id: uuid() }]))).toMatch(/no existe en el PDI/);
    expect(await f(pdi("quizas"))).toMatch(/con_pdi o sin_pdi/);
    // un mismo pilar o línea repetidos cuentan una vez
    const r = (await crearCon(P.gtic, { titulo: "Repetidos", pdi: pdi("con_pdi", [{ pillar_id: PIL1 }, { pillar_id: PIL1 }, { action_line_id: LIN["1.2"] }, { pillar_id: PIL1, action_line_id: LIN["1.2"] }]) })).actividad;
    expect(r.pdi.items).toHaveLength(2);
    // por la puerta de atrás (tabla): el disparador también lo impide
    const x = r.id;
    expect(await errorOf(t.q("insert into ps_actividad_pdi (actividad_id, pillar_id, action_line_id) values ($1, $2, $3)", [x, PIL2, LIN["1.3"]]))).toMatch(/no pertenece al pilar/);
    expect(await errorOf(t.q("insert into ps_actividad_pdi (actividad_id, pillar_id) values ($1, $2)", [x, PIL1]))).toMatch(/duplicate|unique|ps_actpdi/i);
  });

  it("editar: solo gestor y admin; deja el evento actividad.pdi; una vieja puede quedarse sin definir", async () => {
    const a = (await crearCon(P.gtic, { titulo: "Para editar el PDI", pdi: pdi("con_pdi", [{ pillar_id: PIL1 }]) })).actividad.id;
    expect(await fallo(P.col1, "ps_actividad_editar", "$1, $2::jsonb", [a, JSON.stringify({ pdi: pdi("sin_pdi") })])).toMatch(/Sin permiso/);
    const e = await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [a, JSON.stringify({ pdi: pdi("con_pdi", [{ action_line_id: LIN["1.5"] }]) })]);
    expect(e.pdi.items).toHaveLength(1);
    expect(e.pdi.items[0].linea_codigo).toBe("TLA-1.5");
    const s = await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [a, JSON.stringify({ pdi: pdi("sin_pdi") })]);
    expect(s.pdi).toEqual({ conexion: "sin_pdi", items: [] });
    expect(await fallo(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [a, JSON.stringify({ pdi: pdi("sin_definir") })])).toMatch(/sin definir/);
    const evs = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.pdi' order by id", [a]);
    expect(evs).toHaveLength(2);
    expect(evs[1].datos.antes.conexion).toBe("con_pdi");
    expect(evs[1].datos.despues.conexion).toBe("sin_pdi");
    // una actividad anterior a la fase 3 queda sin_definir y se edita sin tocar el PDI
    const [v] = await t.q<{ id: string }>(`insert into ps_actividades (plan_id, oficina_unit_id, titulo, version_creacion_id)
      select plan_id, oficina_unit_id, 'Actividad heredada de la fase 2', version_creacion_id from ps_actividades where id = $1 returning id`, [a]);
    expect((await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [v.id, JSON.stringify({ descripcion: "Se edita sin tocar el PDI" })])).pdi).toEqual({ conexion: "sin_definir", items: [] });
    expect((await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [v.id, JSON.stringify({ pdi: pdi("sin_definir") })])).pdi.conexion).toBe("sin_definir");
    expect((await call(P.gtic, "ps_actividad_editar", "$1, $2::jsonb", [v.id, JSON.stringify({ pdi: pdi("sin_pdi") })])).pdi.conexion).toBe("sin_pdi");
  });

  it("filtros por conexión y por pilar, y el resumen de la oficina", async () => {
    const lista = (f: Json) => call(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify(f)]);
    const con = await lista({ pdi: "con_pdi" });
    expect(con.actividades.length).toBeGreaterThan(0);
    expect(con.actividades.every((a: Json) => a.pdi.conexion === "con_pdi")).toBe(true);
    const sin = await lista({ pdi: "sin_pdi" });
    expect(sin.actividades.every((a: Json) => a.pdi.conexion === "sin_pdi")).toBe(true);
    const def = await lista({ pdi: "sin_definir" });
    expect(def.actividades.every((a: Json) => a.pdi.conexion === "sin_definir")).toBe(true);
    const p2 = await lista({ pillar_id: PIL2 });
    expect(p2.total).toBeGreaterThan(0);
    expect(p2.actividades.every((a: Json) => a.pdi.items.some((i: Json) => i.pillar_id === PIL2))).toBe(true);
    expect(await fallo(P.gtic, "ps_actividades_oficina", "$1, $2::jsonb", [TIC, JSON.stringify({ pdi: "x" })])).toMatch(/inválido/);
    const [n] = await t.q<{ c: number; s: number; d: number }>(`select count(*) filter (where pdi_conexion = 'con_pdi')::int c, count(*) filter (where pdi_conexion = 'sin_pdi')::int s,
      count(*) filter (where pdi_conexion = 'sin_definir')::int d from ps_actividades where oficina_unit_id = $1`, [TIC]);
    const res = await call(P.col2, "ps_resumen_pdi_oficina", "$1", [TIC]);
    expect(res).toMatchObject({ con_pdi: n.c, sin_pdi: n.s, sin_definir: n.d });
    const porPilar = res.por_pilar as Json[];
    expect(porPilar.find((x) => x.pillar_id === PIL1)!.actividades).toBeGreaterThan(0);
    expect(porPilar.find((x) => x.pillar_id === PIL2)!.actividades).toBeGreaterThan(0);
    expect(await fallo(P.ginf, "ps_resumen_pdi_oficina", "$1", [TIC])).toMatch(/Sin permiso/);
  });

  it("importación por Excel: pdi, pilar_pdi y linea_pdi, todo o nada y errores por fila y campo", async () => {
    const cargar = (filas: Json[]) => call(P.gtic, "ps_actividades_cargar", "$1, $2::jsonb, null, false", [TIC, JSON.stringify(filas)]);
    const malas = await cargar([
      { titulo: "Importada sin la columna pdi" },
      { titulo: "Importada con PDI sin pilar", pdi: "Con PDI" },
      { titulo: "Importada con línea de otro pilar", pdi: "Con PDI", pilar_pdi: "Pilar Dos", linea_pdi: "TLA-1.1" },
      { titulo: "Importada con pilar desconocido", pdi: "Con PDI", pilar_pdi: "Pilar Inventado" },
      { titulo: "Importada con línea desconocida", pdi: "Con PDI", linea_pdi: "TLA-9.9" },
      { titulo: "Importada sin conexión pero con pilar", pdi: "Sin conexión", pilar_pdi: "Pilar Uno" },
      { titulo: "Importada con valor raro", pdi: "Tal vez" },
      { titulo: "Importada con pilar borrador", pdi: "Con PDI", pilar_pdi: "tp-borrador" },
    ]);
    expect(malas.creadas).toBe(0);
    const campos = (malas.errores as Json[]).map((e) => `${e.fila}:${e.campo}`);
    expect(campos).toEqual(["1:pdi", "2:pilar_pdi", "3:linea_pdi", "4:pilar_pdi", "5:linea_pdi", "6:pdi", "7:pdi", "8:pilar_pdi"]);
    const antes = (await t.q<{ n: number }>("select count(*)::int n from ps_actividades where titulo like 'Importada%'"))[0].n;
    expect(antes).toBe(0);
    const ok = await cargar([
      { titulo: "Importada con una línea", pdi: "Con PDI", pilar_pdi: "Pilar Uno", linea_pdi: "TLA-1.2" },
      { titulo: "Importada con dos pilares", pdi: "con pdi", pilar_pdi: "Pilar Uno; tp-dos", linea_pdi: "Línea uno punto 3" },
      { titulo: "Importada solo con la línea", pdi: "Con PDI", linea_pdi: "tla-2.1" },
      { titulo: "Importada desconectada", pdi: "Sin conexión" },
    ]);
    expect(ok).toMatchObject({ creadas: 4, errores: [] });
    const det = async (i: number) => (await call(P.gtic, "ps_actividad_detalle", "$1", [ok.ids[i]])).pdi as Json;
    const d0 = await det(0);
    expect(d0.items).toHaveLength(1);
    expect(d0.items[0].linea_codigo).toBe("TLA-1.2");
    const d1 = await det(1);
    expect(d1.items.map((i: Json) => i.linea_codigo ?? i.pillar_slug).sort()).toEqual(["TLA-1.3", "tp-dos"]);
    const d2 = await det(2);
    expect(d2.items[0]).toMatchObject({ pillar_id: PIL2, linea_codigo: "TLA-2.1" });
    expect(await det(3)).toEqual({ conexion: "sin_pdi", items: [] });
  });
});

describe("0288 · plazos de aviso por oficina", () => {
  let aT: string, aI: string;
  const gen = (d: string) => t.q<{ r: Json }>("select public.ps_generar_avisos_vencimiento($1::date) as r", [d]).then((x) => x[0].r);
  const pv = (a: string) => avisos(a, "c-ps-por-vencer");
  beforeAll(async () => {
    aT = (await crear(P.gtic, TIC, { titulo: "Plazo de TIC", fin: "2030-06-10", responsables: [P.col1] })).id;
    aI = (await crear(P.ginf, INF, { titulo: "Plazo de INF", fin: "2030-06-10", responsables: [P.colinf] })).id;
  });

  it("leer: la efectiva la ve quien ve la oficina; sin plazos propios vale el general", async () => {
    const l = await call(P.col1, "ps_config_oficina_leer", "$1", [TIC]);
    expect(l.propia).toBeNull();
    expect(l.efectiva).toMatchObject({ dias_antes: [7, 3, 0], vencida_max_avisos: 3, vencida_gestor_horas: 24, validar_horas: 72, activo: true, propia: false });
    expect(l.por_defecto).toMatchObject({ dias_antes: [7, 3, 0], validar_horas: 72 });
    expect((await call(P.lector, "ps_config_oficina_leer", "$1", [TIC])).efectiva.propia).toBe(false);
    expect(await fallo(P.ginf, "ps_config_oficina_leer", "$1", [TIC])).toMatch(/Sin permiso/);
    expect(await fallo(null, "ps_config_oficina_leer", "$1", [TIC])).toMatch(/permission denied/);
  });

  it("guardar y quitar: el gestor de la oficina o el admin; cotas validadas; evento con la oficina", async () => {
    const g = (u: string, unidad: string, dias: number[], max = 1, horas = 24, validar = 1, activo = true) =>
      call(u, "ps_config_oficina_guardar", "$1, $2::int[], $3, $4, $5, $6", [unidad, dias, max, horas, validar, activo]);
    for (const u of [P.col1, P.lector, P.aprob]) expect(await errorOf(g(u, TIC, [2])), u).toMatch(/Sin permiso/);
    expect(await errorOf(g(P.ginf, TIC, [2]))).toMatch(/Sin permiso/);
    expect(await errorOf(g(P.gtic, TIC, [99]))).toMatch(/entre 0 y 60/);
    expect(await errorOf(g(P.gtic, TIC, [1, 2, 3, 4, 5, 6, 7]))).toMatch(/hasta 6/);
    expect(await errorOf(g(P.gtic, TIC, [2], 11))).toMatch(/0 a 10/);
    expect(await errorOf(g(P.gtic, TIC, [2], 1, 721))).toMatch(/0 a 720/);
    expect(await errorOf(g(P.gtic, TIC, [2], 1, 24, 0))).toMatch(/1 a 720/);
    const r = await g(P.gtic, TIC, [2, 5]);
    expect(r.propia).toMatchObject({ dias_antes: [5, 2], vencida_max_avisos: 1, validar_horas: 1, activo: true });
    expect(r.efectiva).toMatchObject({ dias_antes: [5, 2], validar_horas: 1, propia: true });
    expect((await call(P.ginf, "ps_config_oficina_leer", "$1", [INF])).efectiva.propia).toBe(false); // otra oficina: sigue el general
    const [ev] = await t.q<{ datos: Json; oficina_unit_id: string }>("select datos, oficina_unit_id from ps_eventos where tipo = 'config.avisos' and oficina_unit_id = $1 order by id desc limit 1", [TIC]);
    expect(ev.datos).toMatchObject({ oficina_unit_id: TIC, dias_antes: [5, 2] });
    expect((await t.asUser(P.gtic, (q) => q("select oficina_unit_id from ps_config_oficina"))).length).toBe(1);
    expect((await t.asUser(P.col1, (q) => q("select oficina_unit_id from ps_config_oficina"))).length).toBe(0);
  });

  it("ps_generar_avisos_vencimiento usa los plazos de cada oficina y, si no hay, los generales", async () => {
    // TIC avisa a 5 y 2 días; INF (sin plazos propios) a 7, 3 y 0.
    await gen("2030-06-03"); // 7 días antes: INF sí, TIC no
    expect((await pv(aI)).length).toBe(1);
    expect((await pv(aT)).length).toBe(0);
    await gen("2030-06-05"); // 5 días antes: TIC sí
    expect((await pv(aT)).map((x) => x.datos.dias)).toEqual([5]);
    await gen("2030-06-08"); // 2 días antes: TIC sí; INF no (no es 7, 3 ni 0)
    expect((await pv(aT)).map((x) => x.datos.dias)).toEqual([5, 2]);
    expect((await pv(aI)).length).toBe(1);
    // quitar los propios: vuelve al general
    const q = await call(P.gtic, "ps_config_oficina_quitar", "$1", [TIC]);
    expect(q.propia).toBeNull();
    expect(q.efectiva.propia).toBe(false);
    await gen("2030-06-07"); // 3 días antes
    expect((await pv(aT)).map((x) => x.datos.dias)).toEqual([5, 2, 3]);
    expect(await fallo(P.col1, "ps_config_oficina_quitar", "$1", [TIC])).toMatch(/Sin permiso/);
  });

  it("una oficina puede apagar sus avisos sin tocar a las demás; el general (ps_config) también acepta validar_horas", async () => {
    await call(P.gtic, "ps_config_oficina_guardar", "$1, $2::int[], 3, 24, 72, false", [TIC, [0]]);
    const antes = (await pv(aT)).length;
    await gen("2030-06-10"); // el día de la fecha: INF avisa, TIC está apagada
    expect((await pv(aT)).length).toBe(antes);
    expect((await pv(aI)).length).toBe(3); // 7 días (3 jun), 3 días (7 jun) y el día de la fecha (10 jun)
    await call(P.gtic, "ps_config_oficina_quitar", "$1", [TIC]);
    expect(await fallo(P.gtic, "ps_config_guardar", "'{1}'::int[], 3, 24, true, 100")).toMatch(/Sin permiso/);
    const c = await call(P.admin, "ps_config_guardar", "'{7,3,0}'::int[], 3, 24, true, 48");
    expect(c.validar_horas).toBe(48);
    expect((await call(P.admin, "ps_config_guardar", "'{7,3,0}'::int[], 3, 24, true"))).toMatchObject({ validar_horas: 48 }); // nulo conserva
    expect(await fallo(P.admin, "ps_config_guardar", "'{7,3,0}'::int[], 3, 24, true, 0")).toMatch(/1 a 720/);
    await call(P.admin, "ps_config_guardar", "'{7,3,0}'::int[], 3, 24, true, 72");
  });
});

describe("0288 · plazo de validación pendiente", () => {
  const gen = (d: string) => t.q<{ r: Json }>("select public.ps_generar_avisos_vencimiento($1::date) as r", [d]).then((x) => x[0].r);
  let a1: string, a2: string, av1: string;
  const dia = async (mas: number) => (await t.q<{ d: string }>("select (current_date + $1::int)::text d", [mas]))[0].d;

  it("un avance que pasa el plazo avisa al gestor una sola vez (idempotente); uno nuevo genera otro aviso", async () => {
    a1 = (await crear(P.ginf, INF, { titulo: "Validación lenta uno", responsables: [P.colinf] })).id;
    av1 = (await reportar(P.colinf, a1)).avance.id;
    expect((await gen(await dia(-1))).validacion).toBe(0);               // todavía dentro del plazo (72 h)
    const r1 = await gen(await dia(5));
    expect(r1.validacion).toBe(1);                                       // ginf es el único gestor de INF
    const av = (await avisos(a1, "c-ps-validacion-pendiente"));
    expect(av.map((x) => x.destinatario_id)).toEqual([P.ginf]);
    expect(av[0].datos).toMatchObject({ n: 1, oficina: "Oficina INFX" });
    expect((await gen(await dia(5))).validacion).toBe(0);                // idempotente
    a2 = (await crear(P.ginf, INF, { titulo: "Validación lenta dos", responsables: [P.colinf] })).id;
    await reportar(P.colinf, a2, { av_fisico: 10 });
    const r3 = await gen(await dia(6));
    expect(r3.validacion).toBe(1);                                       // el conjunto cambió: un solo aviso nuevo con n = 2
    expect((await avisos(null, "c-ps-validacion-pendiente")).filter((x) => x.destinatario_id === P.ginf).pop()!.datos.n).toBe(2);
    expect((await gen(await dia(6))).validacion).toBe(0);
  });

  it("el plazo propio de la oficina manda: con validar_horas alto no hay aviso", async () => {
    await call(P.ginf, "ps_config_oficina_guardar", "$1, '{7,3,0}'::int[], 3, 24, 720, true", [INF]);
    const a3 = (await crear(P.ginf, INF, { titulo: "Validación lenta tres", responsables: [P.colinf] })).id;
    await reportar(P.colinf, a3, { av_fisico: 5 });
    const antes = (await avisos(null, "c-ps-validacion-pendiente")).length;
    expect((await gen(await dia(10))).validacion).toBe(0);
    expect((await avisos(null, "c-ps-validacion-pendiente")).length).toBe(antes);
    await call(P.ginf, "ps_config_oficina_quitar", "$1", [INF]);
  });

  it("ps_avances_por_validar: más antiguo primero, vencido, horas esperando y puede_validar; ps_mis_avances", async () => {
    await t.db.exec("alter table ps_avances disable trigger ps_avances_integridad");
    await t.q("update ps_avances set reportado_en = now() - interval '100 hours' where id = $1", [av1]);
    await t.db.exec("alter table ps_avances enable trigger ps_avances_integridad");
    const lista = await call<Json[]>(P.ginf, "ps_avances_por_validar", "");
    expect(lista[0].id).toBe(av1);
    expect(lista[0]).toMatchObject({ vencido: true, puede_validar: true, estado: "pendiente" });
    expect(lista[0].horas_esperando).toBeGreaterThanOrEqual(100);
    expect(lista[0].actividad).toMatchObject({ id: a1, titulo: "Validación lenta uno", oficina: "Oficina INFX" });
    expect(lista[0].reportado_por).toMatchObject({ id: P.colinf, nombre: "Clara INF" });
    expect(lista.every((x) => x.actividad.oficina === "Oficina INFX")).toBe(true);
    const porTic = await call<Json[]>(P.gtic, "ps_avances_por_validar", "$1", [TIC]);
    expect(porTic.every((x) => x.actividad.oficina === "Oficina TICX")).toBe(true);
    const todas = await call<Json[]>(P.admin, "ps_avances_por_validar", "");
    expect(todas.some((x) => x.actividad.oficina === "Oficina INFX")).toBe(true);
    for (let i = 1; i < todas.length; i++) expect(new Date(todas[i - 1].reportado_en).getTime()).toBeLessThanOrEqual(new Date(todas[i].reportado_en).getTime());
    for (const u of [P.col1, P.lector, P.aprob]) expect(await fallo(u, "ps_avances_por_validar", ""), u).toMatch(/Sin permiso/);
    expect(await fallo(P.ginf, "ps_avances_por_validar", "$1", [TIC])).toMatch(/Sin permiso/);
    const mis = await call<Json[]>(P.colinf, "ps_mis_avances", "");
    expect(mis.find((x) => x.id === av1)).toMatchObject({ estado: "pendiente", vencido: true });
    expect(await fallo(P.sinnivel, "ps_mis_avances", "")).toMatch(/Sin permiso/);
  });
});

describe("0288 · eliminar, RLS y migración idempotente", () => {
  it("una actividad con avances no se elimina; sin avances se va con su PDI y sus riesgos", async () => {
    const con = (await crear(P.gtic, TIC, { titulo: "Con avances no se borra", responsables: [P.col1] })).id;
    await reportar(P.col1, con);
    expect(await fallo(P.gtic, "ps_actividad_eliminar", "$1", [con])).toMatch(/avances/);
    const sin = (await call(P.gtic, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, TIC, JSON.stringify({ titulo: "Sin avances sí se borra", pdi: { conexion: "con_pdi", items: [{ pillar_id: PIL1 }] } })])).actividad.id;
    await call(P.gtic, "ps_riesgo_crear", "$1, $2::jsonb", [sin, JSON.stringify({ titulo: "Riesgo que se va" })]);
    expect((await call(P.gtic, "ps_actividad_eliminar", "$1, 'Creada por error'", [sin])).ok).toBe(true);
    expect(await t.q("select 1 from ps_actividad_pdi where actividad_id = $1", [sin])).toHaveLength(0);
    expect(await t.q("select 1 from ps_riesgos where actividad_id = $1", [sin])).toHaveLength(0);
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where actividad_id = $1 and tipo = 'actividad.eliminada'", [sin]);
    expect(ev.datos.riesgos).toBe(1);
    expect(ev.datos.copia.pdi.conexion).toBe("con_pdi");
  });

  it("RLS: otra oficina, sin nivel y anónimos no ven avances, evidencias, riesgos ni acciones", async () => {
    const act = (await crear(P.gtic, TIC, { titulo: "Visibilidad", responsables: [P.col1] })).id;
    const r = await reportar(P.col1, act, { evidencias: [{ tipo: "enlace", nombre: "E", url: "https://a.co/e" }], riesgo: { titulo: "Riesgo visible", nivel: "Medio" } });
    const ri = (await t.q<{ id: string }>("select id from ps_riesgos where actividad_id = $1", [act]))[0].id;
    await call(P.gtic, "ps_accion_crear", "$1, $2::jsonb", [ri, JSON.stringify({ texto: "Acción visible" })]);
    const ve = (u: string, tabla: string, col: string, v: string) => t.asUser(u, (q) => q(`select 1 from ${tabla} where ${col} = $1`, [v])).then((x) => x.length);
    for (const u of [P.gtic, P.col2, P.lector, P.aprob, P.admin]) {
      expect(await ve(u, "ps_avances", "actividad_id", act), u).toBe(1);
      expect(await ve(u, "ps_evidencias", "actividad_id", act), u).toBe(1);
      expect(await ve(u, "ps_riesgos", "actividad_id", act), u).toBe(1);
      expect(await ve(u, "ps_acciones", "riesgo_id", ri), u).toBe(1);
      expect(await ve(u, "ps_actividad_pdi", "actividad_id", act), u).toBe(0);
    }
    for (const u of [P.ginf, P.colinf, P.sinnivel]) {
      expect(await ve(u, "ps_avances", "actividad_id", act), u).toBe(0);
      expect(await ve(u, "ps_evidencias", "actividad_id", act), u).toBe(0);
      expect(await ve(u, "ps_riesgos", "actividad_id", act), u).toBe(0);
      expect(await ve(u, "ps_acciones", "riesgo_id", ri), u).toBe(0);
      expect(await fallo(u, "ps_actividad_detalle", "$1", [act]), u).toMatch(/no existe/);
    }
    for (const tabla of ["ps_avances", "ps_evidencias", "ps_riesgos", "ps_acciones", "ps_actividad_pdi", "ps_config_oficina"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from ${tabla}`))), tabla).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(P.admin, (q) => q(`delete from ${tabla} where true`))), tabla).toMatch(/permission denied/);
    }
    // anónimos no ejecutan nada de la fase 3
    for (const f of ["ps_avance_validar(null, '')", "ps_riesgos_oficina(null)", "ps_pdi_catalogo()", "ps_mis_avances()", "ps_avances_por_validar()"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select public.${f}`))), f).toMatch(/permission denied/);
    }
    // las internas ni siquiera las ejecuta una persona autenticada
    for (const f of ["ps_avance_revisar(null, 'validado', '', true)", "ps_evidencia_insertar(null, null)", "ps_riesgo_insertar(null, null)", "ps_generar_avisos_vencimiento(null)", "ps_avisar_cumplida(null, '')"]) {
      expect(await errorOf(t.asUser(P.admin, (q) => q(`select public.${f}`))), f).toMatch(/permission denied/);
    }
    // el detalle muestra el avance con sus evidencias (sin URL firmada) y los riesgos con acciones
    const d = await call(P.col2, "ps_actividad_detalle", "$1", [act]);
    expect(d.avances).toHaveLength(1);
    expect(d.avances[0].id).toBe(r.avance.id);
    expect(d.riesgos[0].acciones).toHaveLength(1);
  });

  it("aplicar 0288 otra vez no falla, no duplica filas y no pisa plantillas editadas", async () => {
    await t.q("update correo_templates set subject = 'Asunto editado a mano' where key = 'c-ps-validacion-pendiente'");
    const cuenta = async () => (await t.q<{ n: number }>("select ((select count(*) from ps_avances) + (select count(*) from ps_riesgos) + (select count(*) from ps_actividad_pdi) + (select count(*) from correo_templates where key like 'c-ps-%'))::int n"))[0].n;
    const antes = await cuenta();
    const sql = ["0288_planeacion_seguimiento_avances", "0289_planeacion_seguimiento_planes", "0290_planeacion_seguimiento_presupuesto"].map((m) => readFileSync(join(__dirname, `../../supabase/migrations/${m}.sql`), "utf8"));
    for (let i = 0; i < 2; i++) for (const m of sql) await t.db.exec(m);
    expect(await cuenta()).toBe(antes);
    expect((await t.q<{ subject: string }>("select subject from correo_templates where key = 'c-ps-validacion-pendiente'"))[0].subject).toBe("Asunto editado a mano");
    // sigue funcionando tras reaplicar
    const act = (await crear(P.gtic, TIC, { titulo: "Después de reaplicar", responsables: [P.col1] })).id;
    expect((await reportar(P.col1, act)).ok).toBe(true);
    const tpl = await t.q<{ key: string; grp: string; action: string; tipo: string }>("select key, grp, action, tipo from correo_templates where key in ('c-ps-validacion-pendiente', 'c-ps-avance', 'c-ps-validado')");
    expect(tpl).toHaveLength(3);
    expect(tpl.every((x) => x.grp === "Planeación y Seguimiento" && x.action === "ps" && x.tipo === "aviso")).toBe(true);
  });
});
