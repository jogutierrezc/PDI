/* Migración 0289 (Planeación y Seguimiento, fase 3B): varios planes, planes por oficina, visibilidad por plan, plantilla y pilares por plan,
   plan activo por persona, p_plan opcional y tablero de todos los planes. Ver CONTRATO-BD-F3B.md. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

const id = (n: number) => `00000000-0000-4000-a000-00000000d${String(n).padStart(3, "0")}`;
const P = { admin: id(1), gA: id(2), gB: id(3), cA: id(4), cSub: id(5), lector: id(6), aprob: id(7), fin: id(8), ext: id(9), sinnivel: id(10) };
const NIVEL: Record<string, string> = { gA: "gestor", gB: "gestor", cA: "colaborador", cSub: "colaborador", lector: "lector", aprob: "aprobador", fin: "financiero", ext: "gestor", sinnivel: "none" };

let t: TestDb;
let VRP: string, OA: string, OB: string, OC: string, SUBA: string;
let PIL1: string, PIL2: string;
let P1: string;           // institucional, oficina VRP
let PA: string;           // plan de oficina A

type Json = Record<string, any>;
const rpc = <T = Json>(q: Query, fn: string, args: string, params: unknown[]) => q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const call = <T = Json>(user: string | null, fn: string, args: string, params: unknown[] = []) => t.asUser(user, (q) => rpc<T>(q, fn, args, params), { commit: true });
const fallo = (user: string | null, fn: string, args: string, params: unknown[] = []) => errorOf(call(user, fn, args, params));
const unit = async (code: string, parent: string | null) =>
  (await t.q<{ id: string }>("insert into units (code, name, slug, parent_id) values ($1, $2, $3, $4) returning id", [code, `Oficina ${code}`, code.toLowerCase(), parent]))[0].id;
const fila = (clave: string, extra: Json = {}) => ({ clave, nombre: `Proyecto ${clave}`, pilar: "Pilar Uno", campus: "Todos", prioridad: "Alto", monto: 1000, ...extra });
const cargar = (u: string, plan: string, filas: Json[], oficina: string | null = null) =>
  call(u, "ps_cargar_matriz", "$1, $2::jsonb, '', $3", [plan, JSON.stringify(filas), oficina]);
const crearPlan = (u: string, nombre: string, oficina: string | null, alcance = "oficina", cfg: Json | null = null) =>
  call<string>(u, "ps_crear_plan", "$1, 2027, 2030, $2, $3, 'Descripción', $4::jsonb", [nombre, oficina, alcance, cfg ? JSON.stringify(cfg) : null]);
const ids = (arr: Json[]) => arr.map((x) => x.id);

beforeAll(async () => {
  t = await createTestDb();
  VRP = await unit("VRPX", null);
  OA = await unit("OAX", VRP);
  OB = await unit("OBX", VRP);
  SUBA = await unit("SUBAX", OA);
  OC = await unit("OCX", null);
  for (const nivel of ["lector", "aprobador", "gestor", "colaborador", "financiero", "none"]) {
    await t.q(`insert into access_roles (key, name, base_role, screens, ps_nivel) values ($1, $1, 'consulta', array['planeacion_seguimiento'], $2)`, [`ps3b-${nivel}`, nivel]);
  }
  for (const [k, uid] of Object.entries(P)) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid, `${k}@prueba.udes.edu.co`]);
    await t.q("insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [uid, `${k}@prueba.udes.edu.co`, k]);
    await t.q("update profiles set is_active = true, role = $2::app_role where id = $1", [uid, k === "admin" ? "admin" : "consulta"]);
    if (k !== "admin") await t.q("update profiles set access_role_id = (select id from access_roles where key = $2) where id = $1", [uid, `ps3b-${NIVEL[k]}`]);
  }
  const m = (u: string, p: string, rol: string) => t.q("insert into unit_members (unit_id, profile_id, role) values ($1, $2, $3::unit_role)", [u, p, rol]);
  await m(OA, P.gA, "jefe"); await m(OA, P.cA, "editor"); await m(SUBA, P.cSub, "editor"); await m(OB, P.gB, "jefe"); await m(OC, P.ext, "jefe");
  PIL1 = (await t.q<{ id: string }>("insert into pillars (slug, name, status, position) values ('tpl-uno', 'Pilar PDI Uno', 'publicado', 801) returning id"))[0].id;
  PIL2 = (await t.q<{ id: string }>("insert into pillars (slug, name, status, position) values ('tpl-dos', 'Pilar PDI Dos', 'borrador', 802) returning id"))[0].id;
}, 240_000);

afterAll(async () => t?.close());

describe("0289 · crear planes: admin, gestor de oficina y compatibilidad", () => {
  it("el administrador crea con oficina; sin oficina falla (también la firma de 3 argumentos)", async () => {
    P1 = await crearPlan(P.admin, "PDIFyT de prueba", VRP, "institucional");
    expect(P1).toMatch(/^[0-9a-f-]{36}$/);
    const [r] = await t.q<Json>("select oficina_unit_id, alcance, estado, descripcion, config from ps_planes where id = $1", [P1]);
    expect(r).toMatchObject({ oficina_unit_id: VRP, alcance: "institucional", estado: "activo", descripcion: "Descripción", config: {} });
    expect(await errorOf(crearPlan(P.admin, "Sin oficina", null))).toMatch(/Indique la oficina/);
    expect(await fallo(P.admin, "ps_crear_plan", "'Plan viejo', 2027, 2030")).toMatch(/Indique la oficina/);
    expect(await fallo(P.gA, "ps_crear_plan", "'Plan viejo', 2027, 2030")).toMatch(/Sin permiso/);
    expect(await errorOf(crearPlan(P.admin, "Oficina inexistente", id(999)))).toMatch(/no existe/);
    expect(await errorOf(crearPlan(P.admin, "PDIFyT de prueba ", VRP))).toMatch(/Ya existe/);
    expect(await errorOf(crearPlan(P.admin, "Alcance raro", VRP, "global"))).toMatch(/alcance/);
    expect(await errorOf(crearPlan(P.admin, "Config mala", VRP, "oficina", { columnas: [{ clave: "inventada", etiqueta: "X" }] }))).toMatch(/catálogo/);
  });

  it("el gestor crea solo para su oficina y con alcance «oficina», sin aprobación", async () => {
    PA = await crearPlan(P.gA, "Plan de la oficina A", OA);
    const [r] = await t.q<Json>("select oficina_unit_id, alcance, version_vigente_id from ps_planes where id = $1", [PA]);
    expect(r).toMatchObject({ oficina_unit_id: OA, alcance: "oficina", version_vigente_id: null });
    expect(await errorOf(crearPlan(P.gA, "Institucional del gestor", OA, "institucional"))).toMatch(/Sin permiso/);
    expect(await errorOf(crearPlan(P.gA, "Plan en otra oficina", OB))).toMatch(/Sin permiso/);
    for (const u of [P.cA, P.lector, P.aprob, P.fin, P.sinnivel]) expect(await errorOf(crearPlan(u, `Plan de ${u}`, OA)), u).toMatch(/Sin permiso/);
    // el gestor de una oficina hija usa su jefatura heredada: gA es jefe de OA y por eso gestor en SUBA
    expect(await crearPlan(P.gA, "Plan de la subunidad", SUBA)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("0289 · visibilidad por plan", () => {
  beforeAll(async () => {
    // P1: líneas de las oficinas A y B (columna «oficina»), una sin oficina (hereda VRP)
    const r = await cargar(P.admin, P1, [fila("1", { oficina: "OAX" }), fila("2", { oficina: "Oficina OBX" }), fila("3")]);
    expect(r.errores).toEqual([]);
    const lin = await t.q<{ clave: string; oficina_unit_id: string }>("select clave, oficina_unit_id from ps_version_lineas where version_id = $1 order by clave", [r.version_id]);
    expect(lin.map((x) => x.oficina_unit_id)).toEqual([OA, OB, VRP]);
    await call(P.admin, "ps_publicar_version", "$1, ''", [r.version_id]);
  });

  it("admin, lector, aprobador y financiero ven todos los planes (como antes)", async () => {
    for (const u of [P.admin, P.lector, P.aprob, P.fin]) {
      const v = await call<Json[]>(u, "ps_planes_visibles", "");
      expect(ids(v), u).toEqual(expect.arrayContaining([P1, PA]));
    }
    expect(await fallo(P.sinnivel, "ps_planes_visibles", "")).toMatch(/Sin permiso/);
  });

  it("gestor y colaborador: la oficina dueña y sus descendientes, y las oficinas con líneas o actividades", async () => {
    const ve = async (u: string) => ids(await call<Json[]>(u, "ps_planes_visibles", ""));
    expect(await ve(P.gA)).toEqual(expect.arrayContaining([P1, PA]));   // línea en OA; dueña OA
    expect(await ve(P.gB)).toContain(P1);                               // línea en OB
    expect(await ve(P.gB)).not.toContain(PA);
    expect(await ve(P.cA)).toEqual(expect.arrayContaining([P1, PA]));
    expect(await ve(P.cSub)).toEqual(expect.arrayContaining([P1, PA])); // SUBA cuelga de OA (PA) y de VRP (P1)
    expect(await ve(P.ext)).toEqual([]);                                 // OC no participa
  });

  it("las tablas respetan el plan visible: líneas, versiones y líneas de versión", async () => {
    const cuenta = (u: string, tabla: string, col: string, plan: string) => t.asUser(u, (q) => q(`select 1 from ${tabla} where ${col} = $1`, [plan])).then((x) => x.length);
    expect(await cuenta(P.gB, "ps_lineas", "plan_id", P1)).toBe(3);
    expect(await cuenta(P.gB, "ps_lineas", "plan_id", PA)).toBe(0);
    expect(await cuenta(P.lector, "ps_versiones", "plan_id", P1)).toBe(1);
    expect(await cuenta(P.sinnivel, "ps_versiones", "plan_id", P1)).toBe(0);
    expect(await errorOf(t.asUser(null, (q) => q("select * from ps_planes")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(P.admin, (q) => q("update ps_planes set descripcion = 'x' where true")))).toMatch(/permission denied/);
    // el detalle de un plan que no se ve
    expect(await fallo(P.gB, "ps_plan_config_leer", "$1", [PA])).toMatch(/no existe/);
    expect((await call(P.gA, "ps_plan_config_leer", "$1", [PA])).plan).toMatchObject({ id: PA, alcance: "oficina" });
  });

  it("el financiero es lector global: no crea actividades ni valida avances", async () => {
    expect(await call(P.fin, "ps_poder", "$1", [OA])).toBe("lector");
    expect(await call(P.fin, "ps_puede", "'financiero'")).toBe(true);
    expect(await call(P.gA, "ps_puede", "'financiero'")).toBe(false);
    expect(await fallo(P.fin, "ps_actividad_crear", "$1, $2, $3::jsonb", [P1, OA, JSON.stringify({ titulo: "No debería", pdi: { conexion: "sin_pdi" } })])).toMatch(/Sin permiso/);
    expect(await call(P.fin, "ps_pdi_catalogo", "")).toBeTruthy();
  });
});

describe("0289 · editar, archivar y reabrir", () => {
  it("editar: gestor de la oficina dueña o admin; la oficina solo el admin; los años mientras no haya versión publicada", async () => {
    const e = await call(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ nombre: "Plan A renombrado", descripcion: "Nueva descripción" })]);
    expect(e).toMatchObject({ nombre: "Plan A renombrado", descripcion: "Nueva descripción", estado: "activo" });
    expect(await fallo(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ oficina_unit_id: OB })])).toMatch(/del administrador/);
    expect(await fallo(P.cA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ nombre: "Otro nombre" })])).toMatch(/Sin permiso/);
    expect(await fallo(P.gB, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ nombre: "Otro nombre" })])).toMatch(/no existe/);
    expect(await fallo(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ monto: 1 })])).toMatch(/no se puede editar/);
    expect(await fallo(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ nombre: "PDIFyT de prueba" })])).toMatch(/Ya existe/);
    expect((await call(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ anio_fin: 2032 })])).anio_fin).toBe(2032);
    expect(await fallo(P.admin, "ps_plan_editar", "$1, $2::jsonb", [P1, JSON.stringify({ anio_fin: 2040 })])).toMatch(/versión publicada/);
    expect((await call(P.admin, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ oficina_unit_id: OA })])).oficina.unit_id).toBe(OA);
    await call(P.gA, "ps_plan_editar", "$1, $2::jsonb", [PA, JSON.stringify({ nombre: "Plan de la oficina A" })]);
  });

  it("archivar y reabrir; un plan archivado no admite actividades nuevas", async () => {
    const x = await crearPlan(P.gA, "Plan por archivar", OA);
    await cargar(P.gA, x, [fila("1")]);
    const v = (await t.q<{ id: string }>("select id from ps_versiones where plan_id = $1", [x]))[0].id;
    await call(P.gA, "ps_publicar_version", "$1, ''", [v]);
    expect(await fallo(P.cA, "ps_plan_archivar", "$1, 'x'", [x])).toMatch(/Sin permiso/);
    expect(await fallo(P.gB, "ps_plan_archivar", "$1, 'x'", [x])).toMatch(/no existe/);
    const a = await call(P.gA, "ps_plan_archivar", "$1, 'Ya no se usa'", [x]);
    expect(a.estado).toBe("archivado");
    expect(a.archivado_en).not.toBeNull();
    expect(await fallo(P.gA, "ps_plan_archivar", "$1, ''", [x])).toMatch(/ya está archivado/);
    expect(await fallo(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [x, OA, JSON.stringify({ titulo: "En un plan archivado", pdi: { conexion: "sin_pdi" } })])).toMatch(/archivado/);
    expect(await fallo(P.gA, "ps_cargar_matriz", "$1, '[]'::jsonb", [x])).toMatch(/archivado/);
    expect((await call(P.admin, "ps_planes_visibles", "")).find((p: Json) => p.id === x).estado).toBe("archivado");
    expect((await call(P.gA, "ps_plan_reabrir", "$1", [x])).estado).toBe("activo");
    expect(await fallo(P.gA, "ps_plan_reabrir", "$1", [x])).toMatch(/no está archivado/);
    const act = await call(P.gA, "ps_actividad_crear", "$1, $2, $3::jsonb", [x, OA, JSON.stringify({ titulo: "Otra vez abierto", pdi: { conexion: "sin_pdi" } })]);
    expect(act.actividad.plan_id).toBe(x);
  });
});

describe("0289 · plantilla por plan (columnas y listas)", () => {
  let plan: string;
  beforeAll(async () => { plan = await crearPlan(P.admin, "Plan con plantilla propia", VRP); });

  it("el plan sin config usa el conjunto del PDIFyT; no y nombre siempre son obligatorias", async () => {
    const c = await call(P.admin, "ps_plan_config_leer", "$1", [plan]);
    expect(c.personalizada).toBe(false);
    expect(c.columnas.map((x: Json) => x.clave)).toEqual(expect.arrayContaining(["no", "nombre", "pilar", "campus", "prioridad", "monto"]));
    expect(c.listas.prioridad).toEqual(["Crítico", "Alto", "Medio", "Largo plazo"]);
    const g = await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ columnas: [
      { clave: "nombre", etiqueta: "Actividad", tipo: "texto", obligatoria: false },
      { clave: "monto", etiqueta: "Presupuesto", tipo: "numero", obligatoria: true },
      { clave: "fuente", etiqueta: "Fuente", tipo: "lista", obligatoria: true, lista: "fuente" },
      { clave: "pilar", etiqueta: "Eje", tipo: "lista", obligatoria: false }] })]);
    expect(g.personalizada).toBe(true);
    expect(g.columnas[0]).toMatchObject({ clave: "no", obligatoria: true });          // se agrega al inicio
    expect(g.columnas.find((x: Json) => x.clave === "nombre").obligatoria).toBe(true); // forzada
    expect(g.columnas.find((x: Json) => x.clave === "monto")).toMatchObject({ etiqueta: "Presupuesto", obligatoria: true });
  });

  it("rechaza claves fuera del catálogo, repetidas, tipos raros y listas inválidas; solo quien administra el plan", async () => {
    const g = (u: string, cfg: Json) => fallo(u, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify(cfg)]);
    expect(await g(P.admin, { columnas: [{ clave: "inventada", etiqueta: "X" }] })).toMatch(/catálogo/);
    expect(await g(P.admin, { columnas: [{ clave: "monto", etiqueta: "A" }, { clave: "monto", etiqueta: "B" }] })).toMatch(/repetida/);
    expect(await g(P.admin, { columnas: [{ clave: "monto", etiqueta: "A", tipo: "magia" }] })).toMatch(/tipo/);
    expect(await g(P.admin, { columnas: [{ clave: "monto", etiqueta: "" }] })).toMatch(/etiqueta/);
    expect(await g(P.admin, { otra: 1 })).toMatch(/no admite/);
    expect(await g(P.admin, { listas: { colores: ["rojo"] } })).toMatch(/no existe/);
    expect(await g(P.admin, { listas: { prioridad: ["Urgente"] } })).toMatch(/solo admite/);
    expect(await g(P.gB, { listas: { fuente: ["A"] } })).toMatch(/Sin permiso|no existe/);
    expect(await g(P.lector, { listas: { fuente: ["A"] } })).toMatch(/no existe|Sin permiso/);
  });

  it("ps_cargar_matriz valida con la plantilla: obligatorias, listas y vacíos permitidos", async () => {
    await call(P.admin, "ps_plan_config_guardar", "$1, $2::jsonb", [plan, JSON.stringify({ listas: { fuente: ["Recursos propios", "Regalías"], clasif: ["Inversión"] } })]);
    const r = await cargar(P.admin, plan, [
      { clave: "A", nombre: "Sin monto ni fuente", pilar: "X", campus: "Todos", prioridad: "Alto" },
      { clave: "B", nombre: "Fuente fuera de lista", monto: 5, fuente: "Rifa", pilar: "X", campus: "Todos", prioridad: "Alto" },
      { clave: "C", nombre: "Clasificación fuera", monto: 5, fuente: "Regalías", clasif: "Gasto", campus: "Todos", prioridad: "Alto" },
    ]);
    expect(r.aceptadas).toBe(0);
    expect((r.errores as Json[]).map((e) => `${e.fila}:${e.campo}`).sort()).toEqual(["1:fuente", "1:monto", "2:fuente", "3:clasif"]);
    const ok = await cargar(P.admin, plan, [
      { clave: "A", nombre: "Completa", monto: 10, fuente: "regalías", clasif: "inversión", campus: "Todos", prioridad: "alto" },
      { clave: "B", nombre: "Sin pilar ni campus ni prioridad", monto: 20, fuente: "Recursos propios" }, // columnas opcionales: pilar; campus y prioridad siguen siendo obligatorias en la plantilla por omisión
    ]);
    expect(ok.errores.length).toBeGreaterThan(0);
    const bien = await cargar(P.admin, plan, [
      { clave: "A", nombre: "Completa", monto: 10, fuente: "regalías", clasif: "inversión", campus: "Todos", prioridad: "alto" },
      { clave: "B", nombre: "Sin pilar", monto: 20, fuente: "Recursos propios", campus: "Todos", prioridad: "Medio" },
    ]);
    expect(bien.errores).toEqual([]);
    const lin = await t.q<Json>("select clave, fuente, clasif, pilar, prioridad from ps_version_lineas where version_id = $1 order by clave", [bien.version_id]);
    expect(lin[0]).toMatchObject({ fuente: "Regalías", clasif: "Inversión", prioridad: "Alto" }); // se guarda el valor de la lista
    expect(lin[1].pilar).toBe("Sin pilar");
  });
});

describe("0289 · carga con columna «oficina» y permisos del gestor de un plan de oficina", () => {
  it("el gestor carga y publica su plan; las líneas son de su oficina o de las que cuelgan de ella", async () => {
    const r1 = await cargar(P.gA, PA, [fila("1", { oficina: "SUBAX" }), fila("2", { oficina: "OBX" })]);
    expect((r1.errores as Json[])[0]).toMatchObject({ fila: 2, campo: "oficina" });
    expect(await cargar(P.gB, PA, [fila("1")]).catch((e) => String(e.message))).toMatch(/Sin permiso|no existe/);
    expect(await fallo(P.cA, "ps_cargar_matriz", "$1, '[]'::jsonb", [PA])).toMatch(/Sin permiso/);
    const mala = await cargar(P.gA, PA, [fila("1", { oficina: "No existe esta" })]);
    expect((mala.errores as Json[])[0]).toMatchObject({ campo: "oficina" });
    const ok = await cargar(P.gA, PA, [fila("1"), fila("2", { oficina: "SUBAX" })]);
    expect(ok.errores).toEqual([]);
    const lin = await t.q<Json>("select clave, oficina_unit_id from ps_version_lineas where version_id = $1 order by clave", [ok.version_id]);
    expect(lin.map((x) => x.oficina_unit_id)).toEqual([OA, SUBA]);
    expect(await fallo(P.cA, "ps_publicar_version", "$1, ''", [ok.version_id])).toMatch(/Sin permiso/);
    expect(await fallo(P.gA, "ps_asignar_oficina_linea", "$1, '1', $2", [ok.version_id, OB])).toMatch(/Sin permiso/);
    expect((await call(P.gA, "ps_asignar_oficina_linea", "$1, '1', $2", [ok.version_id, SUBA])).oficina_unit_id).toBe(SUBA);
    expect((await call(P.gA, "ps_publicar_version", "$1, 'Línea base'", [ok.version_id])).lineas).toBe(2);
    expect((await call(P.admin, "ps_planes_visibles", "")).find((p: Json) => p.id === PA).version_vigente).toMatchObject({ numero: 1 });
  });

  it("un plan de una oficina sin oficina dueña (anterior a 0289) exige que el administrador indique la oficina", async () => {
    const [x] = await t.q<{ id: string }>("insert into ps_planes (nombre, anio_ini, anio_fin) values ('Plan heredado sin oficina', 2027, 2030) returning id");
    expect(await fallo(P.admin, "ps_cargar_matriz", "$1, $2::jsonb", [x.id, JSON.stringify([fila("1")])])).toMatch(/Indique la oficina/);
    const r = await cargar(P.admin, x.id, [fila("1")], OB);
    expect(r.errores).toEqual([]);
    expect((await t.q<{ oficina_unit_id: string }>("select oficina_unit_id from ps_planes where id = $1", [x.id]))[0].oficina_unit_id).toBe(OB);
    expect(await fallo(P.admin, "ps_cargar_matriz", "$1, $2::jsonb, '', $3", [x.id, JSON.stringify([fila("1")]), OA])).toMatch(/otra oficina/);
  });
});

describe("0289 · pilares por plan", () => {
  let plan: string;
  beforeAll(async () => { plan = await crearPlan(P.admin, "Plan con pilares", VRP); });

  it("guardar: pilares del PDI (publicados) y propios; la carga los valida", async () => {
    const g = (u: string, pil: Json[]) => call(u, "ps_plan_pilares_guardar", "$1, $2::jsonb", [plan, JSON.stringify(pil)]);
    expect(await errorOf(g(P.admin, [{ pillar_id: PIL2 }]))).toMatch(/no está publicado|no existe/);
    expect(await errorOf(g(P.admin, [{ nombre: "A" }]))).toMatch(/entre 2 y 150/);
    expect(await errorOf(g(P.admin, [{ nombre: "Uno" }, { nombre: "uno" }]))).toMatch(/repetido/);
    expect(await errorOf(g(P.cA, [{ nombre: "Uno" }]))).toMatch(/no existe|Sin permiso/);
    const r = await g(P.admin, [{ pillar_id: PIL1 }, { nombre: "Eje propio", codigo: "EP" }]);
    expect(r.pilares).toHaveLength(2);
    expect(r.pilares[0]).toMatchObject({ pillar_id: PIL1, nombre: "Pilar PDI Uno", codigo: "tpl-uno", orden: 1 });
    expect(r.pilares[1]).toMatchObject({ pillar_id: null, nombre: "Eje propio", codigo: "EP" });
    expect(r.pdi.pillar_ids).toEqual([PIL1]);
    const mal = await cargar(P.admin, plan, [fila("1", { pilar: "Inventado" })]);
    expect((mal.errores as Json[])[0]).toMatchObject({ fila: 1, campo: "pilar" });
    const bien = await cargar(P.admin, plan, [fila("1", { pilar: "pilar pdi uno" }), fila("2", { pilar: "EP" }), fila("3", { pilar: "Eje propio" })]);
    expect(bien.errores).toEqual([]);
    const lin = await t.q<{ pilar: string }>("select pilar from ps_version_lineas where version_id = $1 order by clave", [bien.version_id]);
    expect(lin.map((x) => x.pilar)).toEqual(["Pilar PDI Uno", "Eje propio", "Eje propio"]); // se guarda el nombre del pilar del plan
    await call(P.admin, "ps_publicar_version", "$1, ''", [bien.version_id]);
    expect(await errorOf(g(P.admin, [{ pillar_id: PIL1 }]))).toMatch(/lo usan líneas/);  // «Eje propio» lo usan líneas publicadas
    expect((await g(P.admin, [{ pillar_id: PIL1 }, { nombre: "Eje propio" }, { nombre: "Otro" }])).pilares).toHaveLength(3);
  });

  it("sin pilares definidos, el pilar sigue siendo texto libre (como hoy)", async () => {
    const libre = await crearPlan(P.admin, "Plan de pilares libres", VRP);
    expect((await cargar(P.admin, libre, [fila("1", { pilar: "Lo que sea" })])).errores).toEqual([]);
  });
});

describe("0289 · p_plan opcional (null = como hoy o todos los planes)", () => {
  let solo: string, otro: string;
  it("las lecturas filtran por plan o agregan todos, con el plan_id en cada fila", async () => {
    const crear = (u: string, plan: string, unidad: string, titulo: string) =>
      call(u, "ps_actividad_crear", "$1, $2, $3::jsonb", [plan, unidad, JSON.stringify({ titulo, pdi: { conexion: "sin_pdi" }, responsables: [P.cA] })]).then((r) => r.actividad as Json);
    const a1 = await crear(P.gA, P1, OA, "Actividad del plan uno");
    const a2 = await crear(P.gA, PA, OA, "Actividad del plan de la oficina");
    expect([a1.plan_id, a2.plan_id]).toEqual([P1, PA]);
    const todas = await call(P.gA, "ps_actividades_oficina", "$1", [OA]);
    expect(todas.actividades.map((a: Json) => a.plan_id)).toEqual(expect.arrayContaining([P1, PA]));
    const f1 = await call(P.gA, "ps_actividades_oficina", "$1, '{}'::jsonb, $2", [OA, P1]);
    expect(f1.actividades.map((a: Json) => a.titulo)).toEqual(["Actividad del plan uno"]);
    const f2 = await call(P.gA, "ps_actividades_oficina", "$1, $2::jsonb", [OA, JSON.stringify({ plan_id: PA })]);
    expect(f2.actividades.map((a: Json) => a.plan_id)).toEqual([PA]);
    expect((await call(P.cA, "ps_mis_actividades", "false")).actividades).toHaveLength(2);
    expect((await call(P.cA, "ps_mis_actividades", "false, $1", [PA])).actividades.map((a: Json) => a.plan_id)).toEqual([PA]);
    const of = await call<Json[]>(P.gA, "ps_oficinas_visibles", "false, $1", [PA]);
    expect(of.find((o) => o.unit_id === OA)).toMatchObject({ total: 1 });
    expect((await call<Json[]>(P.gA, "ps_oficinas_visibles", "")).find((o) => o.unit_id === OA)!.total).toBeGreaterThanOrEqual(2);
    expect((await call(P.gA, "ps_resumen_pdi_oficina", "$1", [OA])).sin_pdi).toBeGreaterThanOrEqual(2);
    expect((await call(P.gA, "ps_resumen_pdi_oficina", "$1, $2", [OA, P1])).sin_pdi).toBe(1);
    // avances y riesgos por plan
    const rep = await call(P.cA, "ps_avance_reportar", "$1, $2::jsonb", [a1.id, JSON.stringify({ av_fisico: 20, nota: "Avance del plan uno de prueba" })]);
    await call(P.cA, "ps_avance_reportar", "$1, $2::jsonb", [a2.id, JSON.stringify({ av_fisico: 30, nota: "Avance del plan de la oficina" })]);
    expect((await call<Json[]>(P.gA, "ps_avances_por_validar", "")).length).toBe(2);
    const pv = await call<Json[]>(P.gA, "ps_avances_por_validar", "$1, $2", [OA, P1]);
    expect(pv.map((x) => x.id)).toEqual([rep.avance.id]);
    await call(P.gA, "ps_riesgo_crear", "$1, $2::jsonb", [a1.id, JSON.stringify({ titulo: "Riesgo del plan uno" })]);
    await call(P.gA, "ps_riesgo_crear", "$1, $2::jsonb", [a2.id, JSON.stringify({ titulo: "Riesgo del plan A" })]);
    expect((await call(P.gA, "ps_riesgos_oficina", "$1", [OA])).total).toBeGreaterThanOrEqual(2);
    expect((await call(P.gA, "ps_riesgos_oficina", "$1, '{}'::jsonb, $2", [OA, PA])).riesgos.map((r: Json) => r.titulo)).toEqual(["Riesgo del plan A"]);
    expect(await fallo(P.gB, "ps_oficinas_visibles", "false, $1", [PA])).toMatch(/no existe/);
  });

  it("crear con p_plan nulo: con un solo plan vigente actúa como hoy; con varios pide el plan", async () => {
    const cuantos = (await t.q<{ n: number }>("select count(*)::int n from ps_planes where version_vigente_id is not null and estado = 'activo'"))[0].n;
    expect(cuantos).toBeGreaterThan(1);
    const fl = [{ titulo: "Carga sin plan", pdi: "Sin conexión" }];
    const r = await call(P.gA, "ps_actividades_cargar", "$1, $2::jsonb", [OA, JSON.stringify(fl)]);
    expect(r.creadas).toBe(0);
    expect(r.errores[0]).toMatchObject({ campo: "plan" });
    expect(r.errores[0].mensaje).toMatch(/Indique el plan/);
    const ok = await call(P.gA, "ps_actividades_cargar", "$1, $2::jsonb, $3", [OA, JSON.stringify(fl), PA]);
    expect(ok.creadas).toBe(1);
    // con un solo plan visible (el de su propia oficina), null elige ese plan
    const pc = await crearPlan(P.admin, "Plan solo de la oficina C", OC);
    const rc = await cargar(P.admin, pc, [fila("1")]);
    await call(P.admin, "ps_publicar_version", "$1, ''", [rc.version_id]);
    expect(ids(await call<Json[]>(P.ext, "ps_planes_visibles", ""))).toEqual([pc]);
    const r2 = await call(P.ext, "ps_actividades_cargar", "$1, $2::jsonb", [OC, JSON.stringify([{ titulo: "Carga de OC", pdi: "Sin conexión" }])]);
    expect(r2.errores).toEqual([]);
    expect((await t.q<{ plan_id: string }>("select plan_id from ps_actividades where id = $1", [r2.ids[0]]))[0].plan_id).toBe(pc);
    expect(await fallo(P.gB, "ps_actividad_crear", "$1, $2, $3::jsonb", [PA, OB, JSON.stringify({ titulo: "En un plan que no ve", pdi: { conexion: "sin_pdi" } })])).toMatch(/no existe/);
  });
});

describe("0289 · plan activo por persona", () => {
  it("se guarda por persona; si deja de verse, vuelve al más reciente visible", async () => {
    const act = async (u: string) => (await call<Json[]>(u, "ps_planes_visibles", "")).filter((p) => p.activo).map((p) => p.id);
    expect((await act(P.admin)).length).toBe(1);
    expect(await call(P.admin, "ps_plan_activo_guardar", "$1", [P1])).toMatchObject({ ok: true, plan_activo: P1 });
    expect(await act(P.admin)).toEqual([P1]);
    expect(await call(P.gA, "ps_plan_activo_guardar", "$1", [PA])).toMatchObject({ plan_activo: PA });
    expect(await act(P.gA)).toEqual([PA]);
    expect(await act(P.admin)).toEqual([P1]);                          // la preferencia es de cada persona
    expect(await fallo(P.gB, "ps_plan_activo_guardar", "$1", [PA])).toMatch(/no existe/);
    expect(await fallo(P.sinnivel, "ps_plan_activo_guardar", "$1", [PA])).toMatch(/Sin permiso/);
    // si el plan activo deja de verse (se retira la jefatura), vuelve al más reciente visible
    await call(P.gB, "ps_plan_activo_guardar", "$1", [P1]);
    await t.q("delete from unit_members where profile_id = $1", [P.gB]);
    await t.q("insert into unit_members (unit_id, profile_id, role) values ($1, $2, 'jefe')", [OC, P.gB]);
    const v = await call<Json[]>(P.gB, "ps_planes_visibles", "");
    expect(v.filter((p) => p.activo).length).toBeLessThanOrEqual(1);
    expect(v.find((p) => p.id === P1)?.activo ?? false).toBe(false);
    await call(P.admin, "ps_plan_activo_guardar", "null");
    expect((await t.q("select plan_activo from ps_usuario_pref where perfil_id = $1", [P.admin]))[0]).toMatchObject({ plan_activo: null });
    expect((await t.asUser(P.gA, (q) => q("select perfil_id from ps_usuario_pref"))).length).toBe(1);
  });
});

describe("0289 · tablero de todos los planes", () => {
  it("totales, por plan, por oficina, estados, pilares y ritmo semanal", async () => {
    const tb = await call(P.admin, "ps_tablero_admin", "");
    expect(tb.totales.planes).toBeGreaterThanOrEqual(4);
    expect(tb.totales.actividades).toBeGreaterThanOrEqual(2);
    expect(tb.totales.por_validar).toBeGreaterThanOrEqual(2);
    expect(Object.keys(tb.totales)).toEqual(expect.arrayContaining(["planes", "activos", "lineas", "actividades", "vencidas", "en_riesgo", "por_validar", "avance_fisico", "avance_financiero", "monto"]));
    const p1 = tb.planes.find((p: Json) => p.id === P1);
    expect(p1).toMatchObject({ estado: "activo", alcance: "institucional", lineas: 3, monto: 3000 });
    expect(p1.oficina).toMatchObject({ unit_id: VRP });
    expect(p1.por_oficina.map((o: Json) => o.unit_id)).toEqual(expect.arrayContaining([OA, OB]));
    expect(p1.por_oficina.find((o: Json) => o.unit_id === OA)).toMatchObject({ lineas: 1, actividades: 1, por_validar: 1 });
    expect(p1.por_estado).toMatchObject({ en_revision: 1 });
    expect(p1.por_pilar.find((x: Json) => x.pilar === "Pilar Uno").lineas).toBe(3);
    expect(p1.ritmo_semanas).toHaveLength(12);
    expect(p1.ritmo_semanas.every((x: Json) => typeof x.avances_validados === "number")).toBe(true);
    expect(["verde", "amarillo", "rojo", "sin_datos"]).toContain(p1.salud);
    expect(tb.alertas.some((a: Json) => a.tipo === "plan_sin_version" && a.plan_id !== P1)).toBe(true);
    expect(tb.alertas.every((a: Json) => ["tipo", "plan_id", "texto", "severidad"].every((k) => k in a))).toBe(true);
  });

  it("filtros y permisos: lector, aprobador y financiero lo leen; gestor y colaborador no", async () => {
    const f = (fl: Json) => call(P.admin, "ps_tablero_admin", "$1::jsonb", [JSON.stringify(fl)]);
    expect((await f({ estado: "archivado" })).planes.every((p: Json) => p.estado === "archivado")).toBe(true);
    expect((await f({ oficina_unit_id: OA })).planes.map((p: Json) => p.id)).toEqual(expect.arrayContaining([PA, P1]));
    expect((await f({ anio: 2040 })).planes).toEqual([]);
    expect((await f({ salud: "sin_datos" })).planes.every((p: Json) => p.salud === "sin_datos")).toBe(true);
    for (const bad of [{ estado: "raro" }, { salud: "azul" }, { anio: "x" }]) expect(await fallo(P.admin, "ps_tablero_admin", "$1::jsonb", [JSON.stringify(bad)])).toMatch(/inválido/);
    for (const u of [P.lector, P.aprob, P.fin]) expect((await call(u, "ps_tablero_admin", "")).planes.length, u).toBeGreaterThanOrEqual(4);
    for (const u of [P.gA, P.cA, P.ext, P.sinnivel]) expect(await fallo(u, "ps_tablero_admin", ""), u).toMatch(/Sin permiso/);
    expect(await errorOf(t.asUser(null, (q) => q("select public.ps_tablero_admin()")))).toMatch(/permission denied/);
  });

  it("alertas: oficina sin responsables, avances por validar vencidos y actividades vencidas", async () => {
    const base = (await call(P.admin, "ps_tablero_admin", "")).alertas as Json[];
    expect(base.some((a) => a.tipo === "oficina_sin_responsable" && a.plan_id === P1 && a.oficina_unit_id === VRP)).toBe(true); // VRP: línea 3 y nadie la gestiona
    await t.db.exec("alter table ps_avances disable trigger ps_avances_integridad");
    await t.q("update ps_avances set reportado_en = now() - interval '200 hours' where estado = 'pendiente'");
    await t.db.exec("alter table ps_avances enable trigger ps_avances_integridad");
    const lat = (await call(P.admin, "ps_tablero_admin", "")).alertas as Json[];
    expect(lat.some((a) => a.tipo === "avances_por_validar_vencidos")).toBe(true);
    await t.q("update ps_actividades set fin = '2027-01-10', inicio = '2027-01-01' where plan_id = $1 and oficina_unit_id = $2", [P1, OA]);
    // el aviso de actividades vencidas exige más de 5; con una sola no aparece
    expect(((await call(P.admin, "ps_tablero_admin", "")).alertas as Json[]).some((a) => a.tipo === "actividades_vencidas")).toBe(false);
  });

  it("el tablero solo cuenta lo que quien lo lee ve; plan de oficina en borrador más de 30 días", async () => {
    const [b] = await t.q<{ id: string }>("insert into ps_planes (nombre, anio_ini, anio_fin, oficina_unit_id, alcance, creado_en) values ('Borrador antiguo', 2027, 2028, $1, 'oficina', now() - interval '40 days') returning id", [OB]);
    const al = (await call(P.lector, "ps_tablero_admin", "")).alertas as Json[];
    expect(al.some((a) => a.tipo === "plan_borrador_antiguo" && a.plan_id === b.id)).toBe(true);
  });
});
