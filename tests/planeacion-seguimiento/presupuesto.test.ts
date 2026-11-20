/* Migración 0290 (Planeación y Seguimiento, fase 3B, parte 2): papel financiero (VAF), evaluación financiera al publicar una versión,
   financiación por línea, libro de presupuesto insert-only, desviación, vigilancia y alertas semanales. Ver CONTRATO-BD-F3B.md §7. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

const id = (n: number) => `00000000-0000-4000-a000-00000000c${String(n).padStart(3, "0")}`;
const P = { admin: id(1), fin: id(2), finX: id(3), gA: id(4), cA: id(5), gB: id(6), lector: id(7), aprob: id(8) };
const NIVEL: Record<string, string> = { fin: "financiero", finX: "financiero", gA: "gestor", cA: "colaborador", gB: "gestor", lector: "lector", aprob: "aprobador" };

let t: TestDb;
let VRP: string, OA: string, OB: string, VAF: string;
let plan: string, version: string;
const L: Record<string, string> = {};   // clave → ps_lineas.id

type Json = Record<string, any>;
const rpc = <T = Json>(q: Query, fn: string, args: string, params: unknown[]) => q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const call = <T = Json>(user: string | null, fn: string, args: string, params: unknown[] = []) => t.asUser(user, (q) => rpc<T>(q, fn, args, params), { commit: true });
const fallo = (user: string | null, fn: string, args: string, params: unknown[] = []) => errorOf(call(user, fn, args, params));
const unit = async (code: string, parent: string | null) =>
  (await t.q<{ id: string }>("insert into units (code, name, slug, parent_id) values ($1, $2, $3, $4) returning id", [code, `Oficina ${code}`, code.toLowerCase(), parent]))[0].id;
const fila = (clave: string, extra: Json = {}) => ({ clave, nombre: `Proyecto ${clave}`, pilar: "Pilar Uno", campus: "Todos", prioridad: "Alto", monto: 1000, ...extra });
const reg = (u: string, linea: string, d: Json) => call(u, "ps_presupuesto_registrar", "$1, $2::jsonb", [L[linea] ?? linea, JSON.stringify({ anio: 2027, ...d })]);
const avisos = (plantilla: string) => t.q<{ destinatario_id: string; datos: Json; actividad_id: string | null }>("select destinatario_id, datos, actividad_id from ps_avisos where plantilla = $1 order by id", [plantilla]);
const sql = (f: string) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8");

beforeAll(async () => {
  t = await createTestDb();
  VRP = await unit("VRPY", null);
  OA = await unit("OAY", VRP);
  OB = await unit("OBY", VRP);
  VAF = await unit("VAFY", null);
  for (const nivel of ["lector", "aprobador", "gestor", "colaborador", "financiero"]) {
    await t.q(`insert into access_roles (key, name, base_role, screens, ps_nivel) values ($1, $1, 'consulta', array['planeacion_seguimiento'], $2)`, [`ps3c-${nivel}`, nivel]);
  }
  for (const [k, uid] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid, `${k}@prueba.udes.edu.co`]);
    await t.q("insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [uid, `${k}@prueba.udes.edu.co`, k]);
    await t.q("update profiles set is_active = true, role = $2::app_role where id = $1", [uid, k === "admin" ? "admin" : "consulta"]);
    if (k !== "admin") await t.q("update profiles set access_role_id = (select id from access_roles where key = $2) where id = $1", [uid, `ps3c-${NIVEL[k]}`]);
  }
  const m = (u: string, p: string, rol: string) => t.q("insert into unit_members (unit_id, profile_id, role) values ($1, $2, $3::unit_role)", [u, p, rol]);
  await m(OA, P.gA, "jefe"); await m(OA, P.cA, "editor"); await m(OB, P.gB, "jefe"); await m(VAF, P.fin, "jefe");
  plan = await call<string>(P.admin, "ps_crear_plan", "'Plan con presupuesto', 2027, 2030, $1, 'oficina'", [VRP]);
  const c = await call<Json>(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [plan, JSON.stringify([fila("1", { oficina: "OAY", monto: 1000 }), fila("2", { oficina: "OBY", monto: 2000 }), fila("3", { monto: 500, pilar: "Pilar Dos" })])]);
  expect(c.errores).toEqual([]);
  version = c.version_id;
  for (const x of await t.q<{ id: string; clave: string }>("select id, clave from ps_lineas where plan_id = $1", [plan])) L[x.clave] = x.id;
}, 240_000);

afterAll(async () => t?.close());

describe("0290 · papel financiero y unidad VAF", () => {
  it("el nivel financiero existe; la unidad VAF la fija el administrador y define a quién se avisa", async () => {
    expect(await errorOf(t.q("update access_roles set ps_nivel = 'dios' where key = 'ps3c-lector'"))).toMatch(/access_roles_ps_nivel/);
    expect(await call(P.fin, "ps_poder", "$1", [OA])).toBe("lector");
    expect(await call(P.fin, "ps_puede", "'financiero'")).toBe(true);
    expect(await call(P.admin, "ps_puede", "'financiero'")).toBe(true);
    for (const u of [P.gA, P.cA, P.lector, P.aprob]) expect(await call(u, "ps_puede", "'financiero'"), u).toBe(false);
    expect(await fallo(P.fin, "ps_vaf_config_guardar", "$1", [VAF])).toMatch(/Sin permiso/);
    expect(await fallo(P.admin, "ps_vaf_config_guardar", "$1", [id(999)])).toMatch(/no existe/);
    const c = await call(P.admin, "ps_vaf_config_guardar", "$1", [VAF]);
    expect(c).toMatchObject({ vaf_unit_id: VAF, destinatarios: 1 });
    expect(c.unidad.nombre).toBe("Oficina VAFY");
    expect((await call(P.lector, "ps_vaf_config_leer", "")).vaf_unit_id).toBe(VAF);
  });

  it("el financiero ve todos los planes en lectura, pero no crea actividades ni valida avances", async () => {
    await call(P.admin, "ps_publicar_version", "$1, ''", [version]);
    expect((await call<Json[]>(P.fin, "ps_planes_visibles", "")).map((p) => p.id)).toContain(plan);
    expect(await fallo(P.fin, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, OA, JSON.stringify({ titulo: "El financiero no crea", pdi: { conexion: "sin_pdi" } })])).toMatch(/Sin permiso/);
    const a = (await call(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, OA, JSON.stringify({ titulo: "Actividad de la línea uno", linea_clave: "1", pdi: { conexion: "sin_pdi" }, responsables: [P.cA] })])).actividad;
    const av = (await call(P.cA, "ps_avance_reportar", "$1, $2::jsonb", [a.id, JSON.stringify({ av_fisico: 20, nota: "Avance del veinte por ciento" })])).avance;
    expect(await fallo(P.fin, "ps_avance_validar", "$1, ''", [av.id])).toMatch(/Sin permiso/);
    expect(await fallo(P.fin, "ps_avances_por_validar", "")).toMatch(/Sin permiso/);
    await call(P.gA, "ps_avance_validar", "$1, ''", [av.id]);
  });
});

describe("0290 · evaluación financiera de la VAF", () => {
  let ev: string;
  it("publicar la primera versión abre una evaluación pendiente y avisa a la VAF (sin bloquear nada)", async () => {
    const [e] = await t.q<Json>("select id, estado, monto_solicitado, version_id from ps_evaluaciones_vaf where plan_id = $1", [plan]);
    expect(e).toMatchObject({ estado: "pendiente", version_id: version });
    expect(Number(e.monto_solicitado)).toBe(3500);
    ev = e.id;
    const av = await avisos("c-ps-vaf-evaluar");
    expect(av.map((x) => x.destinatario_id)).toEqual([P.fin]);            // finX no es de la unidad VAF; el admin tampoco es miembro
    expect(av[0].actividad_id).toBeNull();
    expect(av[0].datos).toMatchObject({ plan: "Plan con presupuesto", oficina: "Oficina VRPY", monto: 3500 });
    const pend = await call<Json[]>(P.fin, "ps_vaf_pendientes", "");
    expect(pend.find((x) => x.id === ev)).toMatchObject({ estado: "pendiente", plan: "Plan con presupuesto", version: "v1.0" });
    for (const u of [P.admin, P.lector, P.aprob]) expect((await call<Json[]>(u, "ps_vaf_pendientes", "")).length, u).toBeGreaterThan(0);
    for (const u of [P.gA, P.cA]) expect(await fallo(u, "ps_vaf_pendientes", ""), u).toMatch(/Sin permiso/);
    // la operación sigue: las oficinas ya crearon actividades y reportaron avances (prueba anterior)
    expect((await t.q("select 1 from ps_actividades where plan_id = $1", [plan])).length).toBeGreaterThan(0);
  });

  it("una versión nueva solo abre evaluación si cambian los montos", async () => {
    // v2 idéntica en montos: no abre; v3 con un monto distinto: abre
    const crearV = async (numero: number, cambio: number) => {
      const [v] = await t.q<{ id: string }>("insert into ps_versiones (plan_id, numero, etiqueta, estado, origen) values ($1, $2, $3, 'borrador', 'solicitud') returning id", [plan, numero, `v${numero}.0`]);
      await t.q(`insert into ps_version_lineas (version_id, linea_id, clave, orden, nombre, pilar, prioridad, monto, oficina_unit_id)
        select $1, linea_id, clave, orden, nombre, pilar, prioridad, case when clave = '1' then monto + $2 else monto end, oficina_unit_id from ps_version_lineas where version_id = $3`, [v.id, cambio, version]);
      await t.q("update ps_versiones set estado = 'publicada', publicada_en = now(), huella = 'x' where id = $1", [v.id]);
      return v.id;
    };
    const v2 = await crearV(2, 0);
    expect((await t.q<{ r: string | null }>("select public.ps_vaf_abrir_evaluacion($1, $2) as r", [plan, v2]))[0].r).toBeNull();
    const v3 = await crearV(3, 500);
    const r3 = (await t.q<{ r: string | null }>("select public.ps_vaf_abrir_evaluacion($1, $2) as r", [plan, v3]))[0].r;
    expect(r3).not.toBeNull();
    expect(Number((await t.q<{ m: string }>("select monto_solicitado m from ps_evaluaciones_vaf where id = $1", [r3]))[0].m)).toBe(4000);
    expect((await avisos("c-ps-vaf-evaluar")).length).toBe(2);
    expect((await t.q<{ r: string | null }>("select public.ps_vaf_abrir_evaluacion($1, $2) as r", [plan, v3]))[0].r).toBeNull(); // idempotente
    // dejar la v3 resuelta para no ensuciar la cola
    await call(P.admin, "ps_vaf_evaluar", "$1, $2, 'aprobada', 4000, 'Recursos propios', ''", [plan, v3]);
  });

  it("evaluar: solo financiero y admin; observaciones y montos validados; una resuelta no se edita", async () => {
    const e = (estado: string, monto: number | null, fuente = "Recursos propios", obs = "", u = P.fin) =>
      call(u, "ps_vaf_evaluar", "$1, $2, $3, $4, $5, $6", [plan, version, estado, monto, fuente, obs]);
    for (const u of [P.gA, P.cA, P.lector, P.aprob]) expect(await errorOf(e("aprobada", 1, "x", "", u)), u).toMatch(/Sin permiso/);
    expect(await errorOf(e("pendiente", 1))).toMatch(/aprobada, aprobada_con_ajustes o no_viable/);
    expect(await errorOf(e("aprobada", null))).toMatch(/monto aprobado/);
    expect(await errorOf(e("aprobada", -5))).toMatch(/monto aprobado/);
    expect(await errorOf(e("aprobada_con_ajustes", 3000, "x", "corto"))).toMatch(/20 caracteres/);
    expect(await errorOf(e("no_viable", null, "", "no alcanza"))).toMatch(/20 caracteres/);
    expect(await fallo(P.fin, "ps_vaf_evaluar", "$1, $2, 'aprobada', 1, ''", [plan, id(777)])).toMatch(/no tienen una evaluación/);
    const rev = await call(P.fin, "ps_vaf_en_revision", "$1", [ev0()]);
    expect(rev.estado).toBe("en_revision");
    expect(await fallo(P.fin, "ps_vaf_en_revision", "$1", [ev0()])).toMatch(/no está pendiente/);
    expect(await fallo(P.gA, "ps_vaf_en_revision", "$1", [ev0()])).toMatch(/Sin permiso/);
    const r = await e("aprobada_con_ajustes", 3000, "Regalías", "Se recorta el rubro de equipos por falta de disponibilidad");
    expect(r).toMatchObject({ estado: "aprobada_con_ajustes", monto_aprobado: 3000, monto_solicitado: 3500, fuente_financiacion: "Regalías" });
    expect(r.evaluado_por.id).toBe(P.fin);
    expect(await errorOf(e("aprobada", 3500))).toMatch(/ya está resuelta/);
    expect(await errorOf(t.q("update ps_evaluaciones_vaf set observaciones = 'x' where id = $1", [ev0()]))).toMatch(/resuelta no se edita/);
    expect(await errorOf(t.q("delete from ps_evaluaciones_vaf where id = $1", [ev0()]))).toMatch(/no se borra/);
    // aviso del resultado a la oficina dueña (gestores) y a quien creó el plan
    const res = await avisos("c-ps-vaf-resultado");
    expect(res.map((x) => x.destinatario_id)).toContain(P.admin);
    expect(res.find((x) => x.destinatario_id === P.admin)!.datos).toMatchObject({ resultado: "aprobada_con_ajustes", monto_aprobado: 3000 });
    const lista = await call<Json[]>(P.gA, "ps_vaf_evaluaciones", "$1", [plan]);
    expect(lista.map((x) => x.estado)).toEqual(expect.arrayContaining(["aprobada_con_ajustes", "aprobada"]));
    expect((await call<Json[]>(P.gB, "ps_vaf_evaluaciones", "$1", [plan])).length).toBeGreaterThan(0); // gB ve el plan (línea 2 en OB)
  });
  const ev0 = () => "" + evId;
  let evId = "";
  beforeAll(async () => { evId = (await t.q<{ id: string }>("select id from ps_evaluaciones_vaf where plan_id = $1 and version_id = $2", [plan, version]))[0].id; });
});

describe("0290 · financiación por línea", () => {
  it("evaluar una línea y un año: upsert, validaciones y permisos", async () => {
    const f = (u: string, linea: string, anio: number, monto: number | null, estado: string, nota = "") =>
      call(u, "ps_vaf_linea_evaluar", "$1, $2, $3, 'Regalías', $4, $5", [L[linea], anio, monto, estado, nota]);
    const r = await f(P.fin, "2", 2027, 2000, "aprobada");
    expect(r).toMatchObject({ linea_clave: "2", anio: 2027, monto_aprobado: 2000, estado: "aprobada", fuente: "Regalías" });
    expect((await f(P.fin, "2", 2027, 1800, "ajustada", "Se ajusta por disponibilidad")).monto_aprobado).toBe(1800);
    expect((await t.q("select 1 from ps_linea_financiacion where linea_id = $1", [L["2"]])).length).toBe(1);
    await f(P.admin, "2", 2027, 2000, "aprobada");
    for (const u of [P.gA, P.lector]) expect(await errorOf(f(u, "2", 2027, 1, "aprobada")), u).toMatch(/Sin permiso/);
    expect(await errorOf(f(P.fin, "2", 2040, 1, "aprobada"))).toMatch(/vigencia del plan/);
    expect(await errorOf(f(P.fin, "2", 2027, -1, "aprobada"))).toMatch(/no negativo/);
    expect(await errorOf(f(P.fin, "2", 2027, 1, "rara"))).toMatch(/sin_evaluar, aprobada/);
    expect(await errorOf(f(P.fin, "2", 2027, 1, "rechazada", "no"))).toMatch(/Explique/);
    expect(await fallo(P.fin, "ps_vaf_linea_evaluar", "$1, 2027, 1, '', 'aprobada'", [id(555)])).toMatch(/no existe/);
  });

  it("carga masiva todo o nada: con un error no se guarda nada", async () => {
    const c = (u: string, filas: Json[]) => call(u, "ps_vaf_lineas_cargar", "$1, $2::jsonb", [plan, JSON.stringify(filas)]);
    const mal = await c(P.fin, [{ linea: "1", anio: 2027, monto_aprobado: 800, fuente: "Propios" }, { linea: "99", anio: 2027, monto_aprobado: 5 }, { linea: "3", anio: 2045, monto_aprobado: -1, estado: "x" }]);
    expect(mal.cargadas).toBe(0);
    expect((mal.errores as Json[]).map((e) => `${e.fila}:${e.campo}`)).toEqual(expect.arrayContaining(["2:linea", "3:anio", "3:monto", "3:estado"]));
    expect((await t.q("select 1 from ps_linea_financiacion where linea_id = $1", [L["1"]])).length).toBe(0);
    const ok = await c(P.fin, [{ linea: "1", anio: 2027, monto_aprobado: 800, fuente: "Propios" }, { clave: "3", anio: 2028, monto: 300, estado: "aprobada" }]);
    expect(ok).toMatchObject({ cargadas: 2, errores: [] });
    expect((await t.q("select 1 from ps_linea_financiacion where plan_id = $1", [plan])).length).toBe(3);
    expect((await c(P.fin, [{ linea: "1", anio: 2027, monto_aprobado: 1 }, { linea: "1", anio: 2027, monto_aprobado: 2 }])).errores[0]).toMatchObject({ fila: 2, campo: "anio" });
    expect(await fallo(P.gA, "ps_vaf_lineas_cargar", "$1, '[]'::jsonb", [plan])).toMatch(/Sin permiso/);
    expect((await c(P.fin, [])).errores[0].campo).toBe("filas");
    // la línea 1 queda con 800 aprobados por la VAF; se limpia para las pruebas del libro
    await t.q("delete from ps_linea_financiacion where linea_id = $1 and anio = 2027", [L["1"]]);
  });
});

describe("0290 · libro de presupuesto insert-only", () => {
  let mov: string;
  it("registrar: solo financiero y admin; validaciones de año, tipo, monto y fecha", async () => {
    for (const u of [P.gA, P.cA, P.gB, P.lector, P.aprob]) expect(await errorOf(reg(u, "1", { tipo: "aprobado", monto: 10 })), u).toMatch(/Sin permiso/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "otro", monto: 10 }))).toMatch(/tipo debe ser/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "ejecutado", monto: 0 }))).toMatch(/distinto de cero/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "ejecutado", monto: -5 }))).toMatch(/distinto de cero/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "ejecutado", monto: 5, anio: 2050 }))).toMatch(/año debe estar/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "ejecutado", monto: 5, fecha: "2999-01-01" }))).toMatch(/futura/);
    expect(await errorOf(reg(P.fin, "1", { tipo: "ejecutado", monto: 5, fecha: "ayer" }))).toMatch(/AAAA-MM-DD/);
    expect(await fallo(P.fin, "ps_presupuesto_registrar", "$1, '{}'::jsonb", [id(444)])).toMatch(/no existe/);
    const a = await reg(P.fin, "1", { tipo: "aprobado", monto: 1000, fuente: "Propios", referencia: "RES-1" });
    mov = a.id;
    expect(a).toMatchObject({ tipo: "aprobado", monto: 1000, anio: 2027, linea_clave: "1", referencia: "RES-1", anulado: false, anula_id: null });
    expect(a.registrado_por.id).toBe(P.fin);
    expect((await reg(P.admin, "1", { tipo: "modificacion", monto: -100, nota: "Recorte" })).monto).toBe(-100);
    await reg(P.fin, "1", { tipo: "comprometido", monto: 500 });
    await reg(P.fin, "1", { tipo: "ejecutado", monto: 400 });
    await reg(P.fin, "1", { tipo: "pagado", monto: 300 });
  });

  it("no se edita ni se borra: se anula con un movimiento que lo referencia, una sola vez", async () => {
    expect(await errorOf(t.q("update ps_presupuesto_movs set monto = 1 where id = $1", [mov]))).toMatch(/solo admite INSERT/);
    expect(await errorOf(t.q("delete from ps_presupuesto_movs where id = $1", [mov]))).toMatch(/solo admite INSERT/);
    expect(await errorOf(t.asUser(P.admin, (q) => q("update ps_presupuesto_movs set monto = 1 where true")))).toMatch(/permission denied/);
    expect(await errorOf(t.q(`insert into ps_presupuesto_movs (plan_id, linea_id, anio, tipo, monto, fecha, anula_id) select plan_id, linea_id, anio, tipo, 7, current_date, id from ps_presupuesto_movs where id = $1`, [mov]))).toMatch(/Una anulación debe repetir/);
    const x = await reg(P.fin, "1", { tipo: "pagado", monto: 50 });
    expect(await fallo(P.gA, "ps_presupuesto_anular", "$1, 'Motivo suficiente'", [x.id])).toMatch(/Sin permiso/);
    expect(await fallo(P.fin, "ps_presupuesto_anular", "$1, 'corto'", [x.id])).toMatch(/entre 10 y 1000/);
    expect(await fallo(P.fin, "ps_presupuesto_anular", "$1, 'Motivo suficiente'", [id(333)])).toMatch(/no existe/);
    const an = await call(P.fin, "ps_presupuesto_anular", "$1, 'Se registró dos veces por error'", [x.id]);
    expect(an).toMatchObject({ anula_id: x.id, tipo: "pagado", monto: 50, nota: "Se registró dos veces por error" });
    expect(await fallo(P.fin, "ps_presupuesto_anular", "$1, 'Motivo suficiente'", [x.id])).toMatch(/ya fue anulado/);
    expect(await fallo(P.fin, "ps_presupuesto_anular", "$1, 'Motivo suficiente'", [an.id])).toMatch(/no se anula/);
    const l1 = await call(P.fin, "ps_presupuesto_linea", "$1", [L["1"]]);
    expect(l1.pagado).toBe(300);                                       // la anulación restó el pagado de 50
    expect(l1.movimientos.find((m: Json) => m.id === x.id).anulado).toBe(true);
  });

  it("carga masiva de ejecución: todo o nada, hasta 2000 filas", async () => {
    const c = (filas: Json[]) => call(P.fin, "ps_presupuesto_cargar", "$1, $2::jsonb", [plan, JSON.stringify(filas)]);
    const antes = (await t.q<{ n: number }>("select count(*)::int n from ps_presupuesto_movs"))[0].n;
    const mal = await c([{ linea: "2", anio: 2027, tipo: "comprometido", monto: 100 }, { linea: "77", anio: 2027, tipo: "ejecutado", monto: 1 }, { linea: "2", anio: 2027, tipo: "x", monto: -1 }]);
    expect(mal.cargadas).toBe(0);
    expect((mal.errores as Json[]).map((e) => `${e.fila}:${e.campo}`)).toEqual(expect.arrayContaining(["2:linea", "3:tipo", "3:monto"]));
    expect((await t.q<{ n: number }>("select count(*)::int n from ps_presupuesto_movs"))[0].n).toBe(antes);
    const ok = await c([{ linea: "2", anio: 2027, tipo: "aprobado", monto: 2000 }, { linea: "2", anio: 2027, tipo: "ejecutado", monto: 500, referencia: "OC-9" }]);
    expect(ok).toMatchObject({ cargadas: 2, errores: [] });
    expect((await t.q<{ n: number }>("select count(*)::int n from ps_presupuesto_movs"))[0].n).toBe(antes + 2);
    expect(await fallo(P.gA, "ps_presupuesto_cargar", "$1, '[]'::jsonb", [plan])).toMatch(/Sin permiso/);
    expect((await c(Array.from({ length: 2001 }, () => ({ linea: "2", anio: 2027, tipo: "ejecutado", monto: 1 })))).errores[0].mensaje).toMatch(/2000/);
  });
});

describe("0290 · cifras, desviación y agregados", () => {
  it("la línea 1: aprobado, modificado, vigente, disponible, % de ejecución, avance físico y desviación", async () => {
    const l = await call(P.fin, "ps_presupuesto_linea", "$1", [L["1"]]);
    expect(l).toMatchObject({ aprobado: 1000, modificado: -100, vigente: 900, comprometido: 500, ejecutado: 400, pagado: 300, disponible: 400, pct_ejecucion: 44.4, avance_fisico: 20, desviacion: 24.4 });
    expect(l.por_anio).toEqual([{ anio: 2027, aprobado: 1000, modificado: -100, vigente: 900, comprometido: 500, ejecutado: 400, pagado: 300 }]);
    expect(l.movimientos.length).toBeGreaterThanOrEqual(6);
  });

  it("sin movimientos «aprobado», lo aprobado por la VAF en la financiación hace de aprobado", async () => {
    await t.q("delete from ps_linea_financiacion where linea_id = $1 and anio = 2028", [L["3"]]);
    await call(P.fin, "ps_vaf_linea_evaluar", "$1, 2027, 750, 'Propios', 'aprobada'", [L["3"]]);
    const l = await call(P.admin, "ps_presupuesto_linea", "$1", [L["3"]]);
    expect(l).toMatchObject({ aprobado: 750, vigente: 750, ejecutado: 0, pct_ejecucion: 0, disponible: 750 });
    expect(l.financiacion).toHaveLength(1);
  });

  it("el plan agrega por línea, pilar, oficina y año", async () => {
    const p = await call(P.fin, "ps_presupuesto_plan", "$1", [plan]);
    expect(p.totales).toMatchObject({ aprobado: 3750, ejecutado: 900, solicitado: 3500 });
    expect(p.por_linea.map((x: Json) => x.clave)).toEqual(["1", "2", "3"]);
    expect(p.por_pilar.find((x: Json) => x.pilar === "Pilar Dos").aprobado).toBe(750);
    expect(p.por_oficina.find((x: Json) => x.unit_id === OA)).toMatchObject({ aprobado: 1000, ejecutado: 400 });
    expect(p.por_anio[0]).toMatchObject({ anio: 2027, aprobado: 3750 });
  });

  it("visibilidad: cada oficina ve el presupuesto de sus líneas; lector, aprobador y financiero, todo", async () => {
    const claves = async (u: string) => ((await call(u, "ps_presupuesto_plan", "$1", [plan])).por_linea as Json[]).map((x) => x.clave);
    expect(await claves(P.gA)).toEqual(["1"]);
    expect(await claves(P.cA)).toEqual(["1"]);
    expect(await claves(P.gB)).toEqual(["2"]);
    for (const u of [P.lector, P.aprob, P.fin, P.admin]) expect(await claves(u), u).toEqual(["1", "2", "3"]);
    expect((await call(P.gA, "ps_presupuesto_linea", "$1", [L["1"]])).ejecutado).toBe(400);
    expect(await fallo(P.gA, "ps_presupuesto_linea", "$1", [L["2"]])).toMatch(/no existe/);
    const filas = (u: string) => t.asUser(u, (q) => q("select linea_id from ps_presupuesto_movs")).then((x) => new Set(x.map((r: any) => r.linea_id)));
    expect([...(await filas(P.gA))]).toEqual([L["1"]]);
    expect((await filas(P.lector)).size).toBe(2);
    expect(await errorOf(t.asUser(null, (q) => q("select * from ps_presupuesto_movs")))).toMatch(/permission denied/);
    for (const tabla of ["ps_presupuesto_movs", "ps_linea_financiacion", "ps_evaluaciones_vaf"]) {
      expect(await errorOf(t.asUser(P.admin, (q) => q(`delete from ${tabla} where true`))), tabla).toMatch(/permission denied/);
    }
  });
});

describe("0290 · vigilancia y alertas semanales", () => {
  const tipos = async (u: string, plan_: string) => ((await call<Json[]>(u, "ps_vigilancia_plan", "$1", [plan_])) as Json[]);
  it("ejecución por encima del avance, sobreejecución, líneas sin movimientos y sin evaluar", async () => {
    // línea 3: aprobada por la VAF, con una ejecución vieja (hace más de tres meses) y sobreejecutada
    await reg(P.fin, "3", { tipo: "ejecutado", monto: 900, fecha: "2026-01-01" });
    const al = await tipos(P.fin, plan);
    const de = (tipo: string, linea: string) => al.find((a) => a.tipo === tipo && a.linea_clave === linea);
    expect(de("ejecucion_sobre_avance", "1")).toMatchObject({ severidad: "media", valor: 24.4, plan_id: plan, oficina_unit_id: OA });
    expect(de("sobreejecucion", "3")).toMatchObject({ severidad: "alta" });
    expect(de("sin_movimientos", "3")).toMatchObject({ severidad: "media", valor: 3 });
    expect(de("sin_movimientos", "1")).toBeUndefined();
    expect(de("sin_evaluar_vaf", "1")).toBeUndefined();                 // tiene aprobado en el libro
    expect(al.every((a) => ["tipo", "plan_id", "texto", "severidad", "linea_clave"].every((k) => k in a))).toBe(true);
  });

  it("el avance físico muy por encima de la ejecución (posible rezago de registro) y la línea sin evaluar", async () => {
    const a = (await call(P.gB, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, OB, JSON.stringify({ titulo: "Actividad de la línea dos", linea_clave: "2", pdi: { conexion: "sin_pdi" } })])).actividad;
    const av = (await call(P.gB, "ps_avance_reportar", "$1, $2::jsonb", [a.id, JSON.stringify({ av_fisico: 90, nota: "Casi terminada la línea dos" })])).avance;
    await t.asUser(P.admin, (q) => rpc(q, "ps_avance_validar", "$1, ''", [av.id]), { commit: true });
    const al = await tipos(P.admin, plan);
    // línea 2: aprobado 2000, ejecutado 500 → 25 % de ejecución frente a 90 % de avance
    expect(al.find((x) => x.tipo === "avance_sobre_ejecucion" && x.linea_clave === "2")).toMatchObject({ severidad: "baja", valor: -65 });
    await t.q("delete from ps_linea_financiacion where plan_id = $1", [plan]);
    await t.q("delete from ps_actividades where id = $1 and false", [a.id]);
  });

  it("los umbrales se configuran por plan (vigilancia) y se validan", async () => {
    expect(await fallo(P.fin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ vigilancia: { umbral_desviacion: 30 } })])).toMatch(/Sin permiso/);
    expect(await fallo(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ vigilancia: { umbral_desviacion: 500 } })])).toMatch(/fuera de rango/);
    expect(await fallo(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ vigilancia: { otro: 1 } })])).toMatch(/no admite/);
    const c = await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ vigilancia: { umbral_desviacion: 30, meses_sin_ejecucion: 24 } })]);
    expect(c.vigilancia).toEqual({ umbral_desviacion: 30, umbral_sobreejecucion: 100, meses_sin_ejecucion: 24 });
    const al = await tipos(P.admin, plan);
    expect(al.some((a) => a.tipo === "ejecucion_sobre_avance")).toBe(false);   // 24,4 < 30
    expect(al.some((a) => a.tipo === "sin_movimientos")).toBe(false);          // 24 meses
    expect(al.some((a) => a.tipo === "sobreejecucion")).toBe(true);
    await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ vigilancia: { umbral_desviacion: 15, meses_sin_ejecucion: 3 } })]);
  });

  it("alertas visibles por oficina; vigilancia global", async () => {
    const gA = await tipos(P.gA, plan);
    expect(gA.every((a) => a.oficina_unit_id === OA)).toBe(true);
    const glob = await call<Json[]>(P.fin, "ps_vigilancia_global", "");
    expect(glob.some((a) => a.plan_id === plan)).toBe(true);
    expect(await fallo(null, "ps_vigilancia_global", "")).toMatch(/permission denied/);
  });

  it("ps_generar_alertas_presupuesto: un aviso c-ps-vaf-alerta por plan y destinatario por semana, solo service_role", async () => {
    expect(await fallo(P.admin, "ps_generar_alertas_presupuesto", "null")).toMatch(/permission denied/);
    expect(await fallo(null, "ps_generar_alertas_presupuesto", "null")).toMatch(/permission denied/);
    const gen = (d: string) => t.q<{ r: Json }>("select public.ps_generar_alertas_presupuesto($1::date) as r", [d]).then((x) => x[0].r);
    const hoy = (await t.q<{ d: string }>("select current_date::text d"))[0].d;
    const r1 = await gen(hoy);
    expect(r1.avisos).toBe(1);
    const av = await avisos("c-ps-vaf-alerta");
    expect(av.map((x) => x.destinatario_id)).toEqual([P.fin]);
    expect(av[0].datos.n).toBeGreaterThanOrEqual(2);
    expect(av[0].datos.detalle).toMatch(/línea/);
    expect((await gen(hoy)).avisos).toBe(0);                           // misma semana: idempotente
    const sig = (await t.q<{ d: string }>("select (current_date + 7)::text d"))[0].d;
    expect((await gen(sig)).avisos).toBe(1);                           // otra semana: otro aviso
  });
});

describe("0290 · tablero con presupuesto, evaluaciones y alertas", () => {
  it("suma presupuesto por plan, oficina y pilar, las evaluaciones de la VAF y las alertas de vigilancia", async () => {
    const tb = await call(P.fin, "ps_tablero_admin", "");
    const p = tb.planes.find((x: Json) => x.id === plan);
    expect(p.presupuesto).toMatchObject({ aprobado: 1000 + 2000, ejecutado: 400 + 500 + 900 });
    expect(p.evaluaciones_vaf).toEqual({ pendientes: 0, aprobadas: 1, ajustadas: 1, no_viables: 0 });
    expect(p.por_oficina.find((o: Json) => o.unit_id === OA).presupuesto).toMatchObject({ aprobado: 1000, ejecutado: 400 });
    expect(p.por_pilar.find((o: Json) => o.pilar === "Pilar Dos").presupuesto.ejecutado).toBe(900);
    expect(p.presupuesto_por_anio[0].anio).toBe(2027);
    expect(tb.totales.presupuesto.aprobado).toBeGreaterThanOrEqual(3000);
    expect(tb.totales.evaluaciones_vaf).toMatchObject({ aprobadas: 1, ajustadas: 1 });
    expect(tb.alertas.some((a: Json) => a.tipo === "sobreejecucion" && a.plan_id === plan)).toBe(true);
    for (const u of [P.admin, P.lector, P.aprob]) expect((await call(u, "ps_tablero_admin", "")).planes.some((x: Json) => x.id === plan), u).toBe(true);
    for (const u of [P.gA, P.cA]) expect(await fallo(u, "ps_tablero_admin", ""), u).toMatch(/Sin permiso/);
  });
});

describe("0290 · idempotencia", () => {
  it("aplicar 0289 y 0290 otra vez no falla, no duplica filas y no pisa plantillas editadas", async () => {
    await t.q("update correo_templates set subject = 'Asunto editado de la VAF' where key = 'c-ps-vaf-evaluar'");
    const cuenta = async () => (await t.q<{ n: number }>(`select ((select count(*) from ps_presupuesto_movs) + (select count(*) from ps_evaluaciones_vaf) + (select count(*) from ps_linea_financiacion)
      + (select count(*) from ps_planes) + (select count(*) from correo_templates where key like 'c-ps-%'))::int n`))[0].n;
    const antes = await cuenta();
    for (let i = 0; i < 2; i++) for (const f of ["0289_planeacion_seguimiento_planes.sql", "0290_planeacion_seguimiento_presupuesto.sql", "0291_planeacion_seguimiento_evaluacion_proyectos.sql"]) await t.db.exec(sql(f));
    expect(await cuenta()).toBe(antes);
    expect((await t.q<{ subject: string }>("select subject from correo_templates where key = 'c-ps-vaf-evaluar'"))[0].subject).toBe("Asunto editado de la VAF");
    const tpl = await t.q<{ key: string; grp: string; action: string; tipo: string }>("select key, grp, action, tipo from correo_templates where key like 'c-ps-vaf-%' order by key");
    expect(tpl.map((x) => x.key)).toEqual(["c-ps-vaf-alerta", "c-ps-vaf-evaluar", "c-ps-vaf-resultado"]);
    expect(tpl.every((x) => x.grp === "Planeación y Seguimiento" && x.action === "ps" && x.tipo === "aviso")).toBe(true);
    expect((await call(P.fin, "ps_presupuesto_linea", "$1", [L["1"]])).vigente).toBe(900);
  });
});
