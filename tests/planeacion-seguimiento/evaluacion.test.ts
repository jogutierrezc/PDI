/* Migración 0291 (Planeación y Seguimiento, fase 3C): evaluación de proyectos (aprobar/rechazar, historial insert-only, financiación por año),
   resumen solicitado vs aprobado, plan creado desde la app (mismas validaciones que el Excel), apertura retroactiva de la evaluación VAF
   y oficinas de las líneas de un plan vigente / aportar a otra oficina. Ver CONTRATO-BD-F3B.md §8. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

const id = (n: number) => `00000000-0000-4000-a000-00000000e${String(n).padStart(3, "0")}`;
const P = { admin: id(1), fin: id(2), gA: id(3), cA: id(4), gB: id(5), lector: id(6), aprob: id(7) };
const NIVEL: Record<string, string> = { fin: "financiero", gA: "gestor", cA: "colaborador", gB: "gestor", lector: "lector", aprob: "aprobador" };

let t: TestDb;
let VRP: string, OA: string, OB: string, VAF: string;
let EV: string, EVVER: string;            // plan vigente para evaluar
const L: Record<string, string> = {};     // clave → ps_lineas.id del plan EV

type Json = Record<string, any>;
const rpc = <T = Json>(q: Query, fn: string, args: string, params: unknown[]) => q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const call = <T = Json>(user: string | null, fn: string, args: string, params: unknown[] = []) => t.asUser(user, (q) => rpc<T>(q, fn, args, params), { commit: true });
const fallo = (user: string | null, fn: string, args: string, params: unknown[] = []) => errorOf(call(user, fn, args, params));
const unit = async (code: string, parent: string | null) =>
  (await t.q<{ id: string }>("insert into units (code, name, slug, parent_id) values ($1, $2, $3, $4) returning id", [code, `Oficina ${code}`, code.toLowerCase(), parent]))[0].id;
const fila = (clave: string, extra: Json = {}) => ({ clave, nombre: `Proyecto ${clave}`, pilar: "Pilar Uno", campus: "Todos", prioridad: "Alto", monto: 1000, ...extra });
const crearPlan = (u: string, nombre: string, oficina: string) => call<string>(u, "ps_crear_plan", "$1, 2027, 2030, $2, 'oficina', 'Descripción', null", [nombre, oficina]);
const proyecto = (u: string, plan: string, d: Json) => call(u, "ps_proyecto_crear", "$1, $2::jsonb", [plan, JSON.stringify(d)]);
const evaluar = (u: string, linea: string, d: Json) => call(u, "ps_proyecto_evaluar", "$1, $2::jsonb", [linea, JSON.stringify(d)]);
const fevaluar = (u: string, linea: string, d: Json) => fallo(u, "ps_proyecto_evaluar", "$1, $2::jsonb", [linea, JSON.stringify(d)]);
const criterios = { alin: "Sí", deficit: true, norm: "Sí", pdi: "No", sost: true };
const viabilidad = { tec: "Sí", fin: true, op: "Sí" };
const aprobacion = (extra: Json = {}) => ({ resultado: "Aprobado", criterios, viabilidad, inicio: "2027-02-01", fin: "2029-11-30", pct: { 2027: 40, 2028: 60 }, ...extra });
const fin = (linea: string) => t.q<{ anio: number; monto_aprobado: string; estado: string }>("select anio::int, monto_aprobado::text, estado from ps_linea_financiacion where linea_id = $1 order by anio", [linea]);
const act = (d: Json) => JSON.stringify({ pdi: { conexion: "sin_pdi" }, ...d });
const sql = (f: string) => readFileSync(join(__dirname, "../../supabase/migrations", f), "utf8");

beforeAll(async () => {
  t = await createTestDb();
  VRP = await unit("VRPE", null);
  OA = await unit("OAE", VRP);
  OB = await unit("OBE", VRP);
  VAF = await unit("VAFE", null);
  for (const nivel of ["lector", "aprobador", "gestor", "colaborador", "financiero"]) {
    await t.q(`insert into access_roles (key, name, base_role, screens, ps_nivel) values ($1, $1, 'consulta', array['planeacion_seguimiento'], $2)`, [`ps3d-${nivel}`, nivel]);
  }
  for (const [k, uid] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid, `${k}@prueba.udes.edu.co`]);
    await t.q("insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [uid, `${k}@prueba.udes.edu.co`, k]);
    await t.q("update profiles set is_active = true, role = $2::app_role where id = $1", [uid, k === "admin" ? "admin" : "consulta"]);
    if (k !== "admin") await t.q("update profiles set access_role_id = (select id from access_roles where key = $2) where id = $1", [uid, `ps3d-${NIVEL[k]}`]);
  }
  const m = (u: string, p: string, rol: string) => t.q("insert into unit_members (unit_id, profile_id, role) values ($1, $2, $3::unit_role)", [u, p, rol]);
  await m(OA, P.gA, "jefe"); await m(OA, P.cA, "editor"); await m(OB, P.gB, "jefe"); await m(VAF, P.fin, "jefe");

  // Plan vigente para evaluar (carga por Excel + publicación): 1 y 4 de OA; 2 y 3 de OB.
  EV = await call<string>(P.admin, "ps_crear_plan", "'Plan a evaluar', 2027, 2030, $1, 'oficina'", [VRP]);
  const c = await call<Json>(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [EV, JSON.stringify([
    fila("1", { oficina: "OAE", monto: 1000, pct: { 2027: 0.5, 2028: 0.5 } }),
    fila("2", { oficina: "OBE", monto: 2000 }),
    fila("3", { oficina: "OBE", monto: 500, pilar: "Pilar Dos" }),
    fila("4", { oficina: "OAE", monto: 700, pilar: "Pilar Dos" })])]);
  expect(c.errores).toEqual([]);
  EVVER = c.version_id;
  await call(P.admin, "ps_publicar_version", "$1, ''", [EVVER]);
  for (const x of await t.q<{ id: string; clave: string }>("select id, clave from ps_lineas where plan_id = $1", [EV])) L[x.clave] = x.id;
}, 240_000);

afterAll(async () => t?.close());

describe("0291 · evaluar proyectos", () => {
  it("solo financiero y admin evalúan; los demás solo leen", async () => {
    for (const u of [P.gA, P.cA, P.gB, P.lector, P.aprob]) {
      expect(await fevaluar(u, L["1"], aprobacion()), u).toMatch(/Sin permiso/);
    }
    expect(await fallo(P.gB, "ps_proyecto_evaluacion_leer", "$1", [L["1"]])).toMatch(/no existe/);   // gestor: solo los proyectos de su oficina
    const leida = await call(P.gA, "ps_proyecto_evaluacion_leer", "$1", [L["1"]]);
    expect(leida).toMatchObject({ clave: "1", estado: "sin_evaluar", solicitado: 1000, vigente: null, historial: [] });
    expect(await call(P.lector, "ps_proyecto_evaluacion_leer", "$1", [L["2"]])).toMatchObject({ estado: "sin_evaluar" });
  });

  it("valida resultado, criterios, fechas, distribución, monto y nota", async () => {
    expect(await fevaluar(P.fin, L["1"], { resultado: "Quizás" })).toMatch(/Aprobado o Rechazado/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ criterios: { alin: "Sí" } }))).toMatch(/Responda/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ criterios: { ...criterios, otro: true } }))).toMatch(/no existe en los criterios/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ viabilidad: { ...viabilidad, tec: "Tal vez" } }))).toMatch(/Sí o No/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ inicio: undefined }))).toMatch(/fechas de inicio y fin/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ fin: "2026-12-31" }))).toMatch(/anterior|vigencia/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ fin: "2040-01-01" }))).toMatch(/vigencia/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ pct: { 2027: 40, 2028: 50 } }))).toMatch(/suma 90/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ pct: { 2027: 50, 2035: 50 } }))).toMatch(/fuera del plan/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ monto_aprobado: 800 }))).toMatch(/al menos 20 caracteres/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ monto_aprobado: 800, nota: "muy corta" }))).toMatch(/al menos 20 caracteres/);
    expect(await fevaluar(P.fin, L["1"], aprobacion({ monto_aprobado: 0 }))).toMatch(/mayor que cero/);
    expect(await fevaluar(P.fin, L["1"], { resultado: "Rechazado" })).toMatch(/al menos 20 caracteres/);
    expect(await fevaluar(P.fin, L["1"], { resultado: "Aprobado", criterios, viabilidad, inicio: "2027-02-01", fin: "2029-11-30", prioridad: "Urgente", pct: { 2027: 100 } })).toMatch(/prioridad/);
    expect(await t.q("select 1 from ps_evaluaciones_proyecto")).toHaveLength(0);
  });

  it("aprobar con el monto solicitado escribe la financiación por año y alimenta el aprobado del presupuesto", async () => {
    const e = await evaluar(P.fin, L["1"], aprobacion());
    expect(e).toMatchObject({ resultado: "Aprobado", clave: "1", monto_solicitado: 1000, monto_aprobado: 1000, prioridad: "Alto", pct: { 2027: 40, 2028: 60 } });
    expect(e.criterios).toEqual({ alin: true, deficit: true, norm: true, pdi: false, sost: true });
    expect(e.viabilidad).toEqual({ tec: true, fin: true, op: true });
    expect(e.evaluado_por).toMatchObject({ id: P.fin });
    expect((await fin(L["1"])).map((r) => [r.anio, Number(r.monto_aprobado), r.estado])).toEqual([[2027, 400, "aprobada"], [2028, 600, "aprobada"]]);
    expect((await call(P.fin, "ps_presupuesto_linea", "$1", [L["1"]])).aprobado).toBe(1000);
    expect((await t.q<{ tipo: string }>("select tipo from ps_eventos where tipo = 'proyecto.evaluado' and linea_clave = '1'"))).toHaveLength(1);
  });

  it("aprobar con monto distinto exige nota; la financiación queda ajustada y el redondeo suma exacto", async () => {
    const e = await evaluar(P.admin, L["2"], aprobacion({ monto_aprobado: 1500, nota: "Se aprueba el 75 % por restricción presupuestal.", pct: { 2027: 33.33, 2028: 33.33, 2029: 33.34 }, prioridad: "critico" }));
    expect(e).toMatchObject({ monto_solicitado: 2000, monto_aprobado: 1500, prioridad: "Crítico" });
    const f = await fin(L["2"]);
    expect(f.map((r) => r.estado)).toEqual(["ajustada", "ajustada", "ajustada"]);
    expect(f.reduce((s, r) => s + Number(r.monto_aprobado), 0)).toBeCloseTo(1500, 2);
  });

  it("rechazar exige nota; queda rechazada en la financiación y el monto aprobado en cero", async () => {
    const e = await evaluar(P.fin, L["3"], { resultado: "rechazado", nota: "No hay recursos ni sustento técnico suficiente." });
    expect(e).toMatchObject({ resultado: "Rechazado", monto_solicitado: 500, monto_aprobado: 0, pct: {} });
    const f = await fin(L["3"]);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((r) => r.estado === "rechazada" && Number(r.monto_aprobado) === 0)).toBe(true);
  });

  it("re-evaluar conserva el historial, la vigente es la última y cambia la financiación; el historial es insert-only", async () => {
    await evaluar(P.fin, L["3"], aprobacion({ pct: { 2029: 100 } }));
    const h = await call(P.admin, "ps_proyecto_evaluacion_leer", "$1", [L["3"]]);
    expect(h.estado).toBe("aprobado");
    expect(h.historial.map((x: Json) => x.resultado)).toEqual(["Aprobado", "Rechazado"]);
    expect(h.vigente.id).toBe(h.historial[0].id);
    const f = await fin(L["3"]);
    expect(f.find((r) => r.anio === 2029)).toMatchObject({ estado: "aprobada" });
    expect(Number(f.find((r) => r.anio === 2029)!.monto_aprobado)).toBe(500);
    expect(f.filter((r) => r.anio !== 2029).every((r) => Number(r.monto_aprobado) === 0)).toBe(true);
    expect(await errorOf(t.q("update ps_evaluaciones_proyecto set nota = 'x'"))).toMatch(/solo admite INSERT/);
    expect(await errorOf(t.q("delete from ps_evaluaciones_proyecto"))).toMatch(/solo admite INSERT/);
    // lo vuelve a rechazar para el resumen (aprobado 2: líneas 1 y 2; rechazado: la 3)
    await evaluar(P.fin, L["3"], { resultado: "Rechazado", nota: "Se retira del plan por decisión del comité financiero." });
    expect((await call(P.admin, "ps_proyecto_evaluacion_leer", "$1", [L["3"]])).historial).toHaveLength(3);
  });

  it("no evalúa sin versión publicada ni en un plan archivado", async () => {
    const borr = await crearPlan(P.admin, "Plan solo borrador", OA);
    await proyecto(P.admin, borr, fila("1"));
    const lin = (await t.q<{ id: string }>("select id from ps_lineas where plan_id = $1", [borr]))[0].id;
    expect(await fevaluar(P.fin, lin, aprobacion())).toMatch(/versión publicada/);
    expect(await fallo(P.fin, "ps_proyecto_evaluar", "$1::uuid, $2::jsonb", ["00000000-0000-4000-a000-0000000fffff", "{}"])).toMatch(/no existe/);
  });
});

describe("0291 · resumen solicitado vs aprobado", () => {
  it("totales, por pilar, campus, oficina, año y la lista de proyectos", async () => {
    const r = await call(P.fin, "ps_resumen_aprobacion", "$1", [EV]);
    expect(r.totales.solicitado).toEqual({ monto: 4200, cantidad: 4 });
    expect(r.totales.aprobado).toEqual({ monto: 2500, cantidad: 2, solicitado: 3000, ajuste: -500 });
    expect(r.totales.rechazado).toEqual({ monto: 500, cantidad: 1 });
    expect(r.totales.sin_evaluar).toEqual({ monto: 700, cantidad: 1 });
    const pil = Object.fromEntries(r.por_pilar.map((x: Json) => [x.pilar, x]));
    expect(pil["Pilar Uno"].aprobado.monto).toBe(2500);
    expect(pil["Pilar Dos"].rechazado.monto).toBe(500);
    expect(pil["Pilar Dos"].sin_evaluar.monto).toBe(700);
    const of = Object.fromEntries(r.por_oficina.map((x: Json) => [x.nombre, x]));
    expect(of["Oficina OAE"].solicitado.monto).toBe(1700);
    expect(of["Oficina OAE"].aprobado.monto).toBe(1000);
    expect(of["Oficina OBE"].rechazado.cantidad).toBe(1);
    expect(r.por_campus).toHaveLength(1);
    expect(r.por_plan).toHaveLength(1);
    // por año: solicitado programado (monto × pct de la matriz) vs aprobado (financiación aprobada/ajustada)
    expect(r.solicitado_sin_distribuir).toBe(3200);
    const a = Object.fromEntries(r.por_anio.map((x: Json) => [x.anio, x]));
    expect(a[2027]).toMatchObject({ solicitado: 500 });
    expect(a[2027].aprobado).toBeCloseTo(400 + 499.95, 2);
    expect(r.por_anio.reduce((s: number, x: Json) => s + x.aprobado, 0)).toBeCloseTo(2500, 2);
    const p = Object.fromEntries(r.proyectos.map((x: Json) => [x.clave, x]));
    expect(p["1"]).toMatchObject({ estado: "aprobado", solicitado: 1000, aprobado: 1000, diferencia: 0, resultado: "Aprobado" });
    expect(p["2"]).toMatchObject({ estado: "aprobado", solicitado: 2000, aprobado: 1500, diferencia: -500 });
    expect(p["3"]).toMatchObject({ estado: "rechazado", aprobado: null });
    expect(p["4"]).toMatchObject({ estado: "sin_evaluar", aprobado: null, resultado: null });
    expect(p["4"].oficina).toMatchObject({ nombre: "Oficina OAE" });
    expect(p["1"].pct).toBeUndefined();
  });

  it("p_plan nulo agrega los planes activos; cada quien ve solo lo suyo", async () => {
    const todos = await call(P.lector, "ps_resumen_aprobacion", "null::uuid");
    expect(todos.totales.solicitado.cantidad).toBeGreaterThanOrEqual(4);
    const gA = await call(P.gA, "ps_resumen_aprobacion", "$1", [EV]);
    expect(gA.totales.solicitado).toEqual({ monto: 1700, cantidad: 2 });
    expect(gA.proyectos.map((x: Json) => x.clave).sort()).toEqual(["1", "4"]);
    const gB = await call(P.gB, "ps_resumen_aprobacion", "$1", [EV]);
    expect(gB.totales.solicitado).toEqual({ monto: 2500, cantidad: 2 });
    expect(gB.totales.aprobado.monto).toBe(1500);
  });
});

describe("0291 · crear el plan desde la app", () => {
  let plan: string;

  it("el gestor de la oficina dueña crea, edita y borra proyectos del borrador; otros no", async () => {
    plan = await crearPlan(P.gA, "Plan hecho en la app", OA);
    expect((await call(P.gA, "ps_borrador_leer", "$1", [plan]))).toMatchObject({ publicada: false, puede_editar: true, version: null, proyectos: [] });
    const r = await proyecto(P.gA, plan, { nombre: "Laboratorio de redes", descripcion: "Equipos", campus: "Todos", pilar: "Pilar Uno", monto: 1200, prioridad: "alto", fuente: "Presupuesto ordinario", clasif: "IFT" });
    expect(r).toMatchObject({ ok: true, etiqueta: "v1.0", proyecto: { clave: "1", nombre: "Laboratorio de redes", prioridad: "Alto", monto: 1200 } });
    expect(r.proyecto.oficina).toMatchObject({ unit_id: OA });      // hereda la oficina dueña
    const r2 = await proyecto(P.gA, plan, { nombre: "Sala de cómputo", campus: "Todos", pilar: "Pilar Dos", monto: 300, prioridad: "Medio", oficina: "OAE" });
    expect(r2.proyecto.clave).toBe("2");
    const lin = r.proyecto.linea_id as string;
    const ed = await call(P.gA, "ps_proyecto_editar", "$1, $2::jsonb", [lin, JSON.stringify({ monto: 1500, nombre: "Laboratorio de redes y datos" })]);
    expect(ed).toMatchObject({ ok: true, proyecto: { monto: 1500, nombre: "Laboratorio de redes y datos", fuente: "Presupuesto ordinario", clasif: "IFT" } });
    const bor = await call(P.gA, "ps_borrador_leer", "$1", [plan]);
    expect(bor.totales).toEqual({ proyectos: 2, monto: 1800 });
    expect(bor.proyectos.map((x: Json) => x.clave)).toEqual(["1", "2"]);
    const del = await call(P.gA, "ps_proyecto_borrar", "$1, 'Duplicado'", [r2.proyecto.linea_id]);
    expect(del).toMatchObject({ ok: true, clave: "2" });
    expect(await t.q("select 1 from ps_lineas where id = $1", [r2.proyecto.linea_id])).toHaveLength(0);
    const tipos = (await t.q<{ tipo: string }>("select distinct tipo from ps_eventos where plan_id = $1", [plan])).map((x) => x.tipo);
    for (const e of ["proyecto.creado", "proyecto.editado", "proyecto.borrado"]) expect(tipos).toContain(e);
    for (const u of [P.gB, P.cA, P.lector, P.aprob, P.fin]) {
      expect(await fallo(u, "ps_proyecto_crear", "$1, $2::jsonb", [plan, JSON.stringify(fila("9"))]), u).toMatch(/Sin permiso/);
      expect(await fallo(u, "ps_proyecto_editar", "$1, $2::jsonb", [lin, JSON.stringify({ monto: 1 })]), u).toMatch(/Sin permiso/);
      expect(await fallo(u, "ps_proyecto_borrar", "$1", [lin]), u).toMatch(/Sin permiso/);
      expect(await fallo(u, "ps_plan_enviar_a_evaluacion", "$1", [plan]), u).toMatch(/Sin permiso/);
    }
    expect(await call(P.admin, "ps_proyecto_crear", "$1, $2::jsonb", [plan, JSON.stringify(fila("7", { monto: 10 }))])).toMatchObject({ ok: true });
    await call(P.admin, "ps_proyecto_borrar", "$1", [(await t.q<{ id: string }>("select id from ps_lineas where plan_id = $1 and clave = '7'", [plan]))[0].id]);
  });

  it("las validaciones son las del Excel: mismos mensajes y mismo resultado guardado", async () => {
    const malas = [{ prioridad: "Urgente" }, { campus: "Atlántida" }, { monto: "mucho" }, { inicio: "2027-13-45" }, { nombre: "" }, { pct: { 2027: 0.4, 2028: 0.3 } }, { oficina: "NoExiste" }];
    const planX = await crearPlan(P.admin, "Plan Excel comparado", OA);
    const planM = await crearPlan(P.admin, "Plan manual comparado", OA);
    for (const mala of malas) {
      const x = await call(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [planX, JSON.stringify([fila("1", mala)])]);
      const m = await proyecto(P.admin, planM, fila("1", mala));
      expect(m.ok, JSON.stringify(mala)).toBe(false);
      expect(m.errores.map((e: Json) => [e.campo, e.mensaje]), JSON.stringify(mala)).toEqual(x.errores.map((e: Json) => [e.campo, e.mensaje]));
    }
    expect(await t.q("select 1 from ps_lineas where plan_id = $1", [planM])).toHaveLength(0);   // con errores no escribe nada
    const buena = fila("1", { descripcion: "Texto", fuente: "Crédito bancario", inicio: "2027-02-01", fin: "2028-02-01", pct: { 2027: 0.5, 2028: 0.5 }, oficina: "OBE" });
    await call(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, ''", [planX, JSON.stringify([buena])]);
    await proyecto(P.admin, planM, buena);
    const guardado = (p: string) => t.q("select clave, nombre, descripcion, campus_texto, pilar, monto::text, prioridad, fuente, inicio::text, fin::text, pct, oficina_unit_id from ps_version_lineas v join ps_versiones s on s.id = v.version_id where s.plan_id = $1", [p]);
    expect(await guardado(planM)).toEqual(await guardado(planX));
    // clave repetida y plantilla del plan (columna obligatoria) también se aplican a la creación manual
    expect((await proyecto(P.admin, planM, buena)).errores[0]).toMatchObject({ campo: "clave" });
    await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [planM, JSON.stringify({ columnas: [
      { clave: "no", etiqueta: "No.", tipo: "texto", obligatoria: true }, { clave: "nombre", etiqueta: "Proyecto", tipo: "texto", obligatoria: true },
      { clave: "origen", etiqueta: "Origen", tipo: "texto", obligatoria: true }] })]);
    expect((await proyecto(P.admin, planM, fila("2"))).errores[0]).toMatchObject({ campo: "origen" });
    expect((await proyecto(P.admin, planM, fila("2", { origen: "Necesidad" }))).ok).toBe(true);
  });

  it("enviar a evaluación revalida con la plantilla, publica y abre la evaluación VAF con aviso", async () => {
    await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ columnas: [
      { clave: "no", etiqueta: "No.", tipo: "texto", obligatoria: true }, { clave: "nombre", etiqueta: "Proyecto", tipo: "texto", obligatoria: true },
      { clave: "origen", etiqueta: "Origen", tipo: "texto", obligatoria: true }] })]);
    const mal = await call(P.gA, "ps_plan_enviar_a_evaluacion", "$1", [plan]);
    expect(mal.enviada).toBe(false);
    expect(mal.errores[0]).toMatchObject({ campo: "origen" });
    expect((await call(P.gA, "ps_borrador_leer", "$1", [plan])).version).not.toBeNull();   // sigue siendo borrador
    const lin = (await t.q<{ id: string }>("select id from ps_lineas where plan_id = $1", [plan]))[0].id;
    await call(P.gA, "ps_proyecto_editar", "$1, $2::jsonb", [lin, JSON.stringify({ origen: "Necesidad transversal" })]);
    const ok = await call(P.gA, "ps_plan_enviar_a_evaluacion", "$1, 'Primera versión'", [plan]);
    expect(ok).toMatchObject({ enviada: true, etiqueta: "v1.0", lineas: 1, evaluacion_vaf: { estado: "pendiente" } });
    const [ev] = await t.q<{ monto_solicitado: string; estado: string }>("select monto_solicitado::text, estado from ps_evaluaciones_vaf where plan_id = $1", [plan]);
    expect(ev).toEqual({ monto_solicitado: "1500.00", estado: "pendiente" });
    const av = await t.q<{ destinatario_id: string }>("select destinatario_id from ps_avisos where plantilla = 'c-ps-vaf-evaluar' and datos ->> 'plan_id' = $1", [plan]);
    expect(av.map((x) => x.destinatario_id)).toContain(P.fin);
    expect((await call(P.gA, "ps_borrador_leer", "$1", [plan]))).toMatchObject({ publicada: true, puede_editar: false });
    // nadie edita una versión publicada
    for (const u of [P.admin, P.gA]) {
      expect(await fallo(u, "ps_proyecto_crear", "$1, $2::jsonb", [plan, JSON.stringify(fila("5"))]), u).toMatch(/versión publicada/);
      expect(await fallo(u, "ps_proyecto_editar", "$1, $2::jsonb", [lin, JSON.stringify({ monto: 5 })]), u).toMatch(/versión publicada/);
      expect(await fallo(u, "ps_proyecto_borrar", "$1", [lin]), u).toMatch(/versión publicada/);
      expect(await fallo(u, "ps_plan_enviar_a_evaluacion", "$1", [plan]), u).toMatch(/ya tiene una versión publicada/);
    }
    // la VAF evalúa el plan y el proyecto
    expect(await call(P.fin, "ps_vaf_evaluar", "$1, $2, 'aprobada', 1500", [plan, ok.version_id])).toMatchObject({ estado: "aprobada" });
    expect(await evaluar(P.fin, lin, aprobacion({ pct: { 2027: 100 } }))).toMatchObject({ resultado: "Aprobado", monto_aprobado: 1500 });
  });

  it("un plan sin proyectos no se envía", async () => {
    const vacio = await crearPlan(P.gA, "Plan vacío en la app", OA);
    expect(await fallo(P.gA, "ps_plan_enviar_a_evaluacion", "$1", [vacio])).toMatch(/no tiene proyectos/);
  });
});

describe("0291 · apertura retroactiva de la evaluación VAF", () => {
  it("abre la de los planes con versión publicada que no tienen ninguna; solo financiero y admin; idempotente", async () => {
    // Simula un plan publicado antes de 0290: se quita su evaluación (el trigger la protege, así que se desactiva un momento).
    await t.db.exec("alter table ps_evaluaciones_vaf disable trigger ps_evaluaciones_vaf_integridad");
    await t.q("delete from ps_evaluaciones_vaf where plan_id = $1", [EV]);
    await t.db.exec("alter table ps_evaluaciones_vaf enable trigger ps_evaluaciones_vaf_integridad");
    for (const u of [P.gA, P.cA, P.lector, P.aprob]) expect(await fallo(u, "ps_vaf_abrir_pendientes", ""), u).toMatch(/Sin permiso/);
    const r = await call(P.fin, "ps_vaf_abrir_pendientes", "");
    expect(r.abiertas).toBe(1);
    expect(r.planes[0]).toMatchObject({ plan_id: EV, version_id: EVVER });
    const [ev] = await t.q<{ estado: string; monto_solicitado: string }>("select estado, monto_solicitado::text from ps_evaluaciones_vaf where plan_id = $1", [EV]);
    expect(ev).toEqual({ estado: "pendiente", monto_solicitado: "4200.00" });
    expect(((await t.q("select 1 from ps_avisos where plantilla = 'c-ps-vaf-evaluar' and datos ->> 'plan_id' = $1", [EV])).length)).toBeGreaterThan(0);
    expect((await call(P.admin, "ps_vaf_abrir_pendientes", "")).abiertas).toBe(0);
    expect((await call(P.fin, "ps_vaf_abrir_pendientes", "")).planes).toEqual([]);
  });
});

describe("0291 · oficinas de las líneas de un plan vigente y aportar a otra oficina", () => {
  it("solo el admin asigna en lote, todo o nada, sin crear versión; el trigger solo deja pasar ese cambio", async () => {
    const huella = (await t.q<{ huella: string }>("select huella from ps_versiones where id = $1", [EVVER]))[0].huella;
    const versiones = (await t.q("select 1 from ps_versiones where plan_id = $1", [EV])).length;
    for (const u of [P.gA, P.fin, P.lector, P.aprob]) {
      expect(await fallo(u, "ps_asignar_oficinas_lineas", "$1, $2::jsonb", [EV, JSON.stringify([{ clave: "4", oficina_unit_id: OB }])]), u).toMatch(/Sin permiso/);
    }
    const mala = await call(P.admin, "ps_asignar_oficinas_lineas", "$1, $2::jsonb", [EV, JSON.stringify([
      { clave: "4", oficina_unit_id: OB }, { clave: "99", oficina_unit_id: OB }, { clave: "1", oficina_unit_id: "00000000-0000-4000-a000-0000000fffff" }, { clave: "4", oficina_unit_id: OA }, { clave: "2" }])]);
    expect(mala.asignadas).toBe(0);
    expect(mala.errores.map((e: Json) => e.fila)).toEqual([2, 3, 4, 5]);
    expect((await t.q<{ o: string }>("select oficina_unit_id o from ps_version_lineas where version_id = $1 and clave = '4'", [EVVER]))[0].o).toBe(OA);
    const ok = await call(P.admin, "ps_asignar_oficinas_lineas", "$1, $2::jsonb", [EV, JSON.stringify([
      { clave: "4", oficina_unit_id: OB }, { linea_id: L["1"], oficina_unit_id: null }, { clave: "2", oficina_unit_id: OB }])]);
    expect(ok).toMatchObject({ recibidas: 3, asignadas: 2, sin_cambio: 1, errores: [] });
    const of = Object.fromEntries((await t.q<{ clave: string; o: string | null }>("select clave, oficina_unit_id o from ps_version_lineas where version_id = $1", [EVVER])).map((x) => [x.clave, x.o]));
    expect(of).toMatchObject({ "1": null, "2": OB, "3": OB, "4": OB });
    const ev = await t.q<{ linea_clave: string; datos: Json }>("select linea_clave, datos from ps_eventos where tipo = 'linea.oficina_asignada' and plan_id = $1 order by id", [EV]);
    expect(ev.map((x) => x.linea_clave)).toEqual(["4", "1"]);
    expect(ev[0].datos).toMatchObject({ antes: OA, despues: OB, vigente: true });
    expect(ev[1].datos).toMatchObject({ antes: OA, despues: null });
    expect((await t.q<{ huella: string }>("select huella from ps_versiones where id = $1", [EVVER]))[0].huella).toBe(huella);
    expect((await t.q("select 1 from ps_versiones where plan_id = $1", [EV])).length).toBe(versiones);
    expect(await errorOf(t.q("update ps_version_lineas set oficina_unit_id = null where version_id = $1", [EVVER]))).toMatch(/no se pueden modificar/);
    expect(await errorOf(t.q("update ps_version_lineas set nombre = 'x' where version_id = $1", [EVVER]))).toMatch(/no se pueden modificar/);
  });

  it("ps_lineas_para_actividad: propios primero; las de otras oficinas con su oficina; sin oficina solo las vincula el admin", async () => {
    const lista = await call<Json[]>(P.gB, "ps_lineas_para_actividad", "$1, $2", [OB, EV]);
    expect(lista.map((x) => x.clave)).toEqual(["2", "3", "4", "1"]);
    expect(lista.slice(0, 3).every((x) => x.propios && !x.aporta)).toBe(true);
    const l1 = lista.find((x) => x.clave === "1")!;
    expect(l1).toMatchObject({ propios: false, aporta: false, sin_oficina: true, puede_vincular: false, oficina: null });
    expect(JSON.stringify(lista)).not.toMatch(/monto/);
    // devolvemos la 1 a la oficina A para ver el caso «de otra oficina»
    await call(P.admin, "ps_asignar_oficinas_lineas", "$1, $2::jsonb", [EV, JSON.stringify([{ clave: "1", oficina_unit_id: OA }])]);
    const deA = await call<Json[]>(P.gA, "ps_lineas_para_actividad", "$1", [OA]);
    expect(deA.find((x) => x.clave === "1")).toMatchObject({ propios: true, puede_vincular: true });
    expect(deA.find((x) => x.clave === "2")).toMatchObject({ propios: false, aporta: true, puede_vincular: true, oficina: { unit_id: OB, nombre: "Oficina OBE" } });
    expect(await fallo(P.gB, "ps_lineas_para_actividad", "$1", [OA])).toMatch(/Sin permiso/);
    const admin = await call<Json[]>(P.admin, "ps_lineas_para_actividad", "$1, $2", [OB, EV]);
    expect(admin).toHaveLength(4);
  });

  it("una oficina aporta a una línea de otra: se crea, queda el evento y se avisa al gestor dueño; sin oficina, no", async () => {
    const r = await call(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [EV, OA, act({ titulo: "Apoyo a Oficina B", linea_clave: "2", fin: "2028-03-01" })]);
    expect(r).toMatchObject({ ok: true, actividad: { linea_clave: "2", oficina_unit_id: OA } });
    const idAct = r.actividad.id as string;
    const [ev] = await t.q<{ datos: Json }>("select datos from ps_eventos where tipo = 'actividad.aporta_otra_oficina' and actividad_id = $1", [idAct]);
    expect(ev.datos).toMatchObject({ oficina_duena: OB });
    const av = await t.q<{ destinatario_id: string; actividad_id: string | null; datos: Json }>("select destinatario_id, actividad_id, datos from ps_avisos where plantilla = 'c-ps-aporte'");
    expect(av.map((x) => x.destinatario_id)).toEqual([P.gB]);
    expect(av[0].datos).toMatchObject({ actividad: "Apoyo a Oficina B", linea: "2", oficina_aporta: "Oficina OAE" });
    expect(await call(P.gA, "ps_actividad_aporte", "$1", [idAct])).toMatchObject({ aporta: true, oficina_duena: { unit_id: OB } });
    // una propia no aporta ni avisa
    const propia = await call(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [EV, OA, act({ titulo: "Actividad propia", linea_clave: "1" })]);
    expect(await call(P.gA, "ps_actividad_aporte", "$1", [propia.actividad.id])).toMatchObject({ aporta: false, oficina_duena: null });
    expect((await t.q("select 1 from ps_avisos where plantilla = 'c-ps-aporte'"))).toHaveLength(1);
    // carga masiva: también permite aportar
    const masiva = await call(P.gA, "ps_actividades_cargar", "$1, $2::jsonb, $3", [OA, JSON.stringify([{ titulo: "Aporte por Excel", linea: "3", fin: "2028-04-01", pdi: "Sin conexión" }]), EV]);
    expect(masiva).toMatchObject({ creadas: 1, errores: [] });
    // una línea sin oficina: rechazada salvo para el admin
    await call(P.admin, "ps_asignar_oficinas_lineas", "$1, $2::jsonb", [EV, JSON.stringify([{ clave: "4", oficina_unit_id: null }])]);
    expect(await fallo(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [EV, OA, act({ titulo: "Sin oficina", linea_clave: "4" })])).toMatch(/sin oficina/);
    expect(await call(P.admin, "ps_actividad_crear", "$1, $2, $3::jsonb", [EV, OA, act({ titulo: "Admin sobre línea sin oficina", linea_clave: "4" })])).toMatchObject({ ok: true });
  });
});

describe("0291 · seguridad e idempotencia", () => {
  it("anon no ejecuta ni lee; las internas no están al alcance de authenticated; el historial no se escribe directo", async () => {
    const anon = (fn: string, args = "") => errorOf(t.asUser(null, (q) => rpc(q, fn, args, [])));
    expect(await anon("ps_resumen_aprobacion")).toMatch(/permission denied|permiso/i);
    expect(await t.asUser(null, (q) => q("select 1 from ps_evaluaciones_proyecto").catch((e) => String(e.message)))).toMatch(/permission denied/);
    for (const fn of ["ps_vaf_abrir_pendientes_interno()", "ps_evaluacion_sincronizar(null::ps_evaluaciones_proyecto)", "ps_validar_fila_matriz(null, 1, null, null, false, false, null)"]) {
      expect(await errorOf(t.asUser(P.admin, (q) => q(`select public.${fn}`))), fn).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(P.admin, (q) => q("insert into ps_evaluaciones_proyecto (plan_id, linea_id, version_id, resultado, prioridad) values ($1, $2, $3, 'Rechazado', 'Alto')", [EV, L["1"], EVVER])))).toMatch(/permission denied/);
    expect((await t.asUser(P.lector, (q) => q("select 1 from ps_evaluaciones_proyecto"))).length).toBeGreaterThan(0);
    expect(await t.asUser(P.gB, (q) => q("select distinct linea_id from ps_evaluaciones_proyecto"))).toEqual(
      expect.not.arrayContaining([{ linea_id: L["1"] }]));
  });

  it("aplicar la migración otra vez no falla ni duplica filas, plantillas ni evaluaciones", async () => {
    const cuenta = async () => (await t.q<{ n: number }>(`select ((select count(*) from ps_evaluaciones_proyecto) + (select count(*) from ps_evaluaciones_vaf) + (select count(*) from ps_linea_financiacion)
      + (select count(*) from ps_planes) + (select count(*) from correo_templates where key like 'c-ps-%') + (select count(*) from ps_avisos))::int n`))[0].n;
    const antes = await cuenta();
    for (let i = 0; i < 2; i++) await t.db.exec(sql("0291_planeacion_seguimiento_evaluacion_proyectos.sql"));
    expect(await cuenta()).toBe(antes);
    expect((await call(P.fin, "ps_resumen_aprobacion", "$1", [EV])).totales.aprobado.monto).toBe(2500);
  });
});
