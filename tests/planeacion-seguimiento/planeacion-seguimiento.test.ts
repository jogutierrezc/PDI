/* Migración 0286 (Planeación y Seguimiento, fase 1): niveles, carga de la matriz
   real (75 filas) como v1.0, validación por fila, inmutabilidad, un solo borrador,
   ps_diff, resumen, calidad, eventos solo-anexar y dinero cerrado a anon. */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "./arnes";

// Copia de los datos reales de la matriz (75 proyectos del PDIFyT) extraídos del Excel.
const FIXTURE = new URL("./pdifyt-datos.json", import.meta.url);

const ADMIN = "00000000-0000-4000-a000-0000000000a1";
const LECTOR = "00000000-0000-4000-a000-0000000000a2";
const APROBADOR = "00000000-0000-4000-a000-0000000000a3";
const GESTOR = "00000000-0000-4000-a000-0000000000a4";
const SIN_NIVEL = "00000000-0000-4000-a000-0000000000a5";
const CAPACIDAD = "00000000-0000-4000-a000-0000000000a6"; // capacidad de planeación, sin nivel ps

type Fila = Record<string, unknown>;
const origen = FIXTURE;
const matriz: Fila[] = (JSON.parse(readFileSync(origen, "utf8")).projects as Fila[]).map((p) => ({
  clave: p.no, clasif: p.clasif, nombre: p.nombre, descripcion: p.desc, campus: p.campus, pilar: p.pilar,
  monto: p.monto, prioridad: p.prior, resultado: p.res, fuente: p.fuente, criterios: p.crit, viabilidad: p.viab,
  inicio: p.inicio, fin: p.fin, pct: p.pct, origen: p.origen, nota_no_eval: p.noEvalTexto,
  extra: { clasif_campus: p.clasifCampus, estado_desc: p.estadoDesc, nec_cm: p.necCM, fila: p.fila },
}));

let t: TestDb;
let plan: string;
let borrador: string;

const rpc = <T = unknown>(q: Query, fn: string, args: string, params: unknown[]) =>
  q<{ r: T }>(`select public.${fn}(${args}) as r`, params).then((x) => x[0].r);
const cargar = (q: Query, p: string, filas: unknown, nota = "") =>
  rpc<{ version_id: string | null; etiqueta: string | null; recibidas: number; aceptadas: number; errores: { fila: number | null; campo: string; mensaje: string }[] }>(
    q, "ps_cargar_matriz", "$1, $2::jsonb, $3", [p, JSON.stringify(filas), nota]);

beforeAll(async () => {
  t = await createTestDb();
  const roles: [string, string, string, string, string | null][] = [
    [ADMIN, "admin", "admin", "", null],
    [LECTOR, "lector", "consulta", "lector", "ps-lector"],
    [APROBADOR, "aprobador", "consulta", "aprobador", "ps-aprobador"],
    [GESTOR, "gestor", "consulta", "gestor", "ps-gestor"],
    [SIN_NIVEL, "sinnivel", "consulta", "none", "ps-none"],
    [CAPACIDAD, "capacidad", "planeacion", "none", "ps-cap"],
  ];
  for (const [id, n, rol, nivel, clave] of roles) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${n}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [id, `${n}@prueba.udes.edu.co`, n]);
    await t.q("update public.profiles set is_active = true, role = $2 where id = $1", [id, rol]);
    if (clave) {
      await t.q(
        `insert into public.access_roles (key, name, base_role, screens, ps_nivel)
         values ($1, $1, $2::public.app_role, array['planeacion_seguimiento'], $3)`, [clave, rol, nivel]);
      await t.q("update public.profiles set access_role_id = (select id from public.access_roles where key = $2) where id = $1", [id, clave]);
    }
  }
  // La capacidad de Planeación sin pantalla ni nivel: el rol del lector con la pantalla desmarcada.
  await t.q("update public.access_roles set screens = '{}' where key = 'ps-cap'");
}, 180_000);

afterAll(async () => t?.close());

describe("0286 · columna y niveles", () => {
  it("ps_nivel nace en none y rechaza valores fuera de la lista", async () => {
    const [r] = await t.q<{ ps_nivel: string }>("select ps_nivel from public.access_roles where key = 'admin'");
    expect(r.ps_nivel).toBe("none");
    expect(await errorOf(t.q("update public.access_roles set ps_nivel = 'dios' where key = 'ps-lector'"))).toMatch(/access_roles_ps_nivel/);
  });

  it("ps_nivel_actual y ps_puede salen del rol de acceso, no de la capacidad", async () => {
    const nivel = (id: string | null) => t.asUser(id, (q) => rpc<string>(q, "ps_nivel_actual", "", []).catch(() => "denegado"));
    expect(await nivel(ADMIN)).toBe("admin");
    expect(await nivel(LECTOR)).toBe("lector");
    expect(await nivel(APROBADOR)).toBe("aprobador");
    expect(await nivel(GESTOR)).toBe("gestor");
    expect(await nivel(SIN_NIVEL)).toBe("none");
    expect(await nivel(CAPACIDAD)).toBe("none");
    expect(await nivel(null)).toBe("denegado");
    const puede = (id: string, a: string) => t.asUser(id, (q) => rpc<boolean>(q, "ps_puede", "$1", [a]));
    expect(await puede(LECTOR, "ver")).toBe(true);
    expect(await puede(LECTOR, "cargar")).toBe(false);
    expect(await puede(APROBADOR, "aprobar")).toBe(true);
    expect(await puede(APROBADOR, "publicar")).toBe(false);
    expect(await puede(GESTOR, "solicitar")).toBe(true);
    expect(await puede(ADMIN, "publicar")).toBe(true);
    expect(await puede(ADMIN, "inventada")).toBe(false);
  });
});

describe("0286 · crear plan y cargar la matriz real", () => {
  it("solo el administrador crea planes", async () => {
    for (const id of [LECTOR, APROBADOR, GESTOR, SIN_NIVEL, CAPACIDAD]) {
      expect(await errorOf(t.asUser(id, (q) => rpc(q, "ps_crear_plan", "'PDIFyT 2027-2035', 2027, 2035", [])))).toMatch(/Sin permiso/);
    }
    plan = await t.asUser(ADMIN, (q) => rpc<string>(q, "ps_crear_plan", "'PDIFyT 2027-2035', 2027, 2035", []), { commit: true });
    expect(plan).toMatch(/^[0-9a-f-]{36}$/);
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_crear_plan", "'pdifyt 2027-2035 ', 2027, 2035", [])))).toMatch(/Ya existe/);
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_crear_plan", "'Otro', 2030, 2027", [])))).toMatch(/años/);
  });

  it("la matriz de prueba trae 75 filas", () => {
    expect(matriz).toHaveLength(75);
  });

  it("nadie con nivel menor a admin carga la matriz", async () => {
    for (const id of [LECTOR, APROBADOR, GESTOR, SIN_NIVEL, CAPACIDAD]) {
      expect(await errorOf(t.asUser(id, (q) => cargar(q, plan, matriz)))).toMatch(/Sin permiso/);
    }
  });

  it("filas con errores no crean nada y el informe es por fila y campo", async () => {
    const mala = matriz.slice(0, 6).map((f) => ({ ...f }));
    mala[0].monto = -5;
    mala[1].fin = "2020-01-01"; // antes del inicio
    mala[2].prioridad = "Urgentísimo";
    mala[3].campus = "Medellín";
    mala[4].pct = { "2027": 0.5, "2028": 0.2 }; // suma 0.7
    mala[5].clave = mala[0].clave; // repetida
    const r = await t.asUser(ADMIN, (q) => cargar(q, plan, mala), { commit: true });
    expect(r.version_id).toBeNull();
    expect(r.aceptadas).toBe(0);
    expect(r.recibidas).toBe(6);
    const por = (campo: string) => r.errores.find((e) => e.campo === campo);
    expect(por("monto")).toMatchObject({ fila: 1 });
    expect(por("fin")).toMatchObject({ fila: 2 });
    expect(por("prioridad")).toMatchObject({ fila: 3 });
    expect(por("campus")).toMatchObject({ fila: 4 });
    expect(por("campus")?.mensaje).toMatch(/Medellín/);
    expect(por("pct")).toMatchObject({ fila: 5 });
    expect(por("clave")).toMatchObject({ fila: 6 });
    const [c] = await t.q<{ v: number; l: number; e: number }>(
      "select (select count(*) from ps_versiones)::int v, (select count(*) from ps_lineas)::int l, (select count(*) from ps_eventos where tipo like 'matriz.%')::int e");
    expect(c).toEqual({ v: 0, l: 0, e: 0 });
  });

  it("valida campos obligatorios, topes, fechas y tipos", async () => {
    const base = { ...matriz[0] };
    const casos: [Fila, string][] = [
      [{ ...base, nombre: "" }, "nombre"],
      [{ ...base, nombre: "x".repeat(301) }, "nombre"],
      [{ ...base, pilar: null }, "pilar"],
      [{ ...base, campus: "" }, "campus"],
      [{ ...base, monto: "12.000,5" }, "monto"],
      [{ ...base, inicio: "18/01/2027" }, "inicio"],
      [{ ...base, inicio: "2027-02-31" }, "inicio"],
      [{ ...base, descripcion: "y".repeat(4001) }, "descripcion"],
      [{ ...base, pct: { "2040": 1 } }, "pct"],
      [{ ...base, pct: { "2027": 1.5 } }, "pct"],
      [{ ...base, criterios: [1, 2] }, "criterios"],
      [{ ...base, oficina_unit_id: "00000000-0000-4000-b000-00000000ffff" }, "oficina_unit_id"],
    ];
    for (const [fila, campo] of casos) {
      const r = await t.asUser(ADMIN, (q) => cargar(q, plan, [fila]));
      expect(r.errores.some((e) => e.campo === campo), campo).toBe(true);
      expect(r.version_id).toBeNull();
    }
    const vacia = await t.asUser(ADMIN, (q) => cargar(q, plan, []));
    expect(vacia.errores[0].campo).toBe("lineas");
  });

  it("la carga válida crea el borrador v1.0 con 75 filas y campus resuelto", async () => {
    const r = await t.asUser(ADMIN, (q) => cargar(q, plan, matriz, "Carga inicial"), { commit: true });
    expect(r.errores).toEqual([]);
    expect(r.etiqueta).toBe("v1.0");
    expect(r.aceptadas).toBe(75);
    borrador = r.version_id as string;
    const [v] = await t.q<{ estado: string; n: number; lineas: number }>(
      "select v.estado, (select count(*) from ps_version_lineas where version_id = v.id)::int n, (select count(*) from ps_lineas)::int lineas from ps_versiones v where v.id = $1", [borrador]);
    expect(v).toEqual({ estado: "borrador", n: 75, lineas: 75 });
    const campus = await t.q<{ campus_texto: string; c: string | null; n: number }>(
      `select vl.campus_texto, c.name c, count(*)::int n from ps_version_lineas vl left join campuses c on c.id = vl.campus_id
        where vl.version_id = $1 group by 1, 2 order by 1`, [borrador]);
    expect(campus).toEqual([
      { campus_texto: "Bucaramanga", c: "Bucaramanga", n: 37 },
      { campus_texto: "Cúcuta", c: "Cúcuta", n: 14 },
      { campus_texto: "Todos", c: null, n: 8 },
      { campus_texto: "Valledupar", c: "Valledupar", n: 16 },
    ]);
    const prior = await t.q<{ prioridad: string; n: number }>("select prioridad, count(*)::int n from ps_version_lineas group by 1 order by 1");
    expect(Object.fromEntries(prior.map((p) => [p.prioridad, p.n]))).toEqual({ Alto: 24, "Crítico": 16, Medio: 23, "Largo plazo": 12 });
    const [m] = await t.q<{ s: string }>("select sum(monto)::text s from ps_version_lineas where version_id = $1", [borrador]);
    expect(Number(m.s)).toBe(133374668643);
  });

  it("un segundo borrador no cabe (índice único) y recargar reemplaza el borrador", async () => {
    expect(await errorOf(t.q(
      "insert into ps_versiones (plan_id, numero, etiqueta) values ($1, 2, 'v1.1')", [plan]))).toMatch(/ps_versiones_un_borrador/);
    const r = await t.asUser(ADMIN, (q) => cargar(q, plan, matriz.slice(0, 10), "Recarga parcial"), { commit: true });
    expect(r.version_id).toBe(borrador);
    expect(r.aceptadas).toBe(10);
    const [c] = await t.q<{ v: number; n: number; l: number }>(
      "select (select count(*) from ps_versiones)::int v, (select count(*) from ps_version_lineas)::int n, (select count(*) from ps_lineas)::int l");
    expect(c).toEqual({ v: 1, n: 10, l: 10 });
    const completa = await t.asUser(ADMIN, (q) => cargar(q, plan, matriz, "Carga completa"), { commit: true });
    expect(completa.version_id).toBe(borrador);
    expect(completa.aceptadas).toBe(75);
  });
});

describe("0286 · resumen y calidad (borrador)", () => {
  it("el resumen suma lo que dice la matriz y no inventa distribución", async () => {
    const r = await t.asUser(LECTOR, (q) => rpc<any>(q, "ps_resumen_plan", "$1", [plan]));
    expect(r.version).toMatchObject({ etiqueta: "v1.0", estado: "borrador", es_vigente: false });
    expect(r.totales).toMatchObject({ lineas: 75, evaluadas: 63, sin_evaluar: 12, con_oficina: 0, sin_oficina: 75, cobertura_oficina: 0 });
    expect(r.totales.monto).toBe(133374668643);
    expect(r.totales.monto_evaluado + r.totales.monto_sin_evaluar).toBe(r.totales.monto);
    expect(r.por_prioridad.map((p: any) => p.prioridad)).toEqual(["Crítico", "Alto", "Medio", "Largo plazo"]);
    expect(r.por_campus.find((c: any) => c.campus_id === null)).toMatchObject({ campus: "Todos", lineas: 8 });
    expect(r.por_anio).toHaveLength(9);
    const porAnio = r.por_anio.reduce((s: number, a: any) => s + a.monto, 0);
    // Los pct de la matriz vienen redondeados a 2 decimales (suman 1 ±0.02): la diferencia es de redondeo, menor al 0,1 %.
    expect(Math.abs(porAnio + r.totales.monto_sin_distribuir - r.totales.monto) / r.totales.monto).toBeLessThan(0.001);
    expect(r.totales.monto_sin_distribuir).toBe(r.totales.monto_sin_evaluar);
  });

  it("la calidad distingue pendiente, no aplica todavía e inconsistente", async () => {
    const c = await t.asUser(LECTOR, (q) => rpc<any>(q, "ps_calidad_matriz", "$1", [borrador]));
    expect(c.resumen.lineas).toBe(75);
    expect(c.resumen.por_campo.oficina_unit_id).toBe(75);
    expect(c.resumen.por_categoria.no_aplica).toBeGreaterThanOrEqual(12 * 5);
    const sinEvaluar = c.hallazgos.filter((h: any) => h.campo === "resultado");
    expect(sinEvaluar).toHaveLength(12);
    // 11 traen la nota «No pasa a la etapa de evaluación…» (no aplica todavía); 1 no la trae (pendiente de diligenciar).
    expect(sinEvaluar.filter((h: any) => h.categoria === "no_aplica")).toHaveLength(11);
    expect(sinEvaluar.filter((h: any) => h.categoria === "pendiente")).toHaveLength(1);
    expect(c.hallazgos.filter((h: any) => h.campo === "oficina_unit_id").every((h: any) => h.categoria === "pendiente" || h.categoria === "no_aplica")).toBe(true);
    // Lo evaluado de la matriz real viene completo: el único pendiente de fuente es la línea sin evaluar y sin nota.
    const sinFuente = c.hallazgos.filter((h: any) => h.campo === "fuente" && h.categoria === "pendiente");
    expect(sinFuente.map((h: any) => h.clave)).toEqual(["28"]);
  });

  it("una fila evaluada con vacíos e incoherencias se reporta pendiente e inconsistente", async () => {
    const [p2] = await t.asUser(ADMIN, async (q) => {
      const id = await rpc<string>(q, "ps_crear_plan", "'Plan de calidad', 2027, 2030", []);
      const r = await cargar(q, id, [
        { clave: "A", nombre: "A", pilar: "P1", campus: "Todos", prioridad: "Alto", resultado: "Aprobado", monto: 0 },
        { clave: "B", nombre: "B", pilar: "P1", campus: "Cucuta", prioridad: "medio", monto: 10, resultado: null, criterios: { alin: "Si" }, inicio: "2026-01-01" },
      ]);
      return [{ id, v: r.version_id }];
    }, { commit: true });
    const c = await t.asUser(ADMIN, (q) => rpc<any>(q, "ps_calidad_matriz", "$1", [p2.v]));
    const h = (clave: string, campo: string) => c.hallazgos.filter((x: any) => x.clave === clave && x.campo === campo);
    expect(h("A", "monto")[0].categoria).toBe("inconsistente");
    expect(h("A", "fuente")[0].categoria).toBe("pendiente");
    expect(h("B", "criterios").some((x: any) => x.categoria === "inconsistente")).toBe(true);
    expect(h("B", "inicio").some((x: any) => x.categoria === "inconsistente")).toBe(true);
    expect(h("B", "resultado")[0].categoria).toBe("pendiente");
  });
});

describe("0286 · asignar oficina solo en borrador", () => {
  it("el admin asigna y quita la oficina; los demás no", async () => {
    const [u] = await t.q<{ id: string }>("insert into public.units (code, name, slug) values ('PLN', 'Planeación', 'planeacion-ps') returning id");
    expect(await errorOf(t.asUser(GESTOR, (q) => rpc(q, "ps_asignar_oficina_linea", "$1, '1', $2", [borrador, u.id])))).toMatch(/Sin permiso/);
    const r = await t.asUser(ADMIN, (q) => rpc<any>(q, "ps_asignar_oficina_linea", "$1, '1', $2", [borrador, u.id]), { commit: true });
    expect(r).toMatchObject({ clave: "1", oficina_unit_id: u.id });
    const res = await t.asUser(LECTOR, (q) => rpc<any>(q, "ps_resumen_plan", "$1", [plan]));
    expect(res.totales).toMatchObject({ con_oficina: 1, sin_oficina: 74 });
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_asignar_oficina_linea", "$1, 'no-existe', $2", [borrador, u.id])))).toMatch(/no está en esta versión/);
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_asignar_oficina_linea", "$1, '1', '00000000-0000-4000-b000-00000000ffff'", [borrador])))).toMatch(/no existe/);
    await t.asUser(ADMIN, (q) => rpc(q, "ps_asignar_oficina_linea", "$1, '1', null", [borrador]), { commit: true });
  });
});

describe("0286 · publicar e inmutabilidad", () => {
  it("nadie con nivel menor a admin publica", async () => {
    for (const id of [LECTOR, APROBADOR, GESTOR, SIN_NIVEL, CAPACIDAD]) {
      expect(await errorOf(t.asUser(id, (q) => rpc(q, "ps_publicar_version", "$1, ''", [borrador])))).toMatch(/Sin permiso/);
    }
  });

  it("publicar fija la vigente, calcula la huella y deja la versión inmutable", async () => {
    const r = await t.asUser(ADMIN, (q) => rpc<any>(q, "ps_publicar_version", "$1, 'Línea base'", [borrador]), { commit: true });
    expect(r).toMatchObject({ version_id: borrador, etiqueta: "v1.0", lineas: 75 });
    expect(r.huella).toMatch(/^[0-9a-f]{64}$/);
    const [p] = await t.q<{ version_vigente_id: string }>("select version_vigente_id from ps_planes where id = $1", [plan]);
    expect(p.version_vigente_id).toBe(borrador);
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_publicar_version", "$1, ''", [borrador])))).toMatch(/ya está publicada/);
    // Ni siquiera el dueño de las tablas puede tocar lo publicado.
    expect(await errorOf(t.q("update ps_versiones set nota = 'x' where id = $1", [borrador]))).toMatch(/publicada/);
    expect(await errorOf(t.q("delete from ps_versiones where id = $1", [borrador]))).toMatch(/publicada/);
    expect(await errorOf(t.q("update ps_version_lineas set monto = 1 where version_id = $1", [borrador]))).toMatch(/publicada/);
    expect(await errorOf(t.q("delete from ps_version_lineas where version_id = $1", [borrador]))).toMatch(/publicada/);
    expect(await errorOf(t.q(
      `insert into ps_version_lineas (version_id, linea_id, clave, nombre, pilar, prioridad)
       select $1, id, 'ZZ', 'z', 'p', 'Alto' from ps_lineas limit 1`, [borrador]))).toMatch(/publicada/);
    expect(await errorOf(t.asUser(ADMIN, (q) => rpc(q, "ps_asignar_oficina_linea", "$1, '1', null", [borrador])))).toMatch(/publicada/);
  });

  it("con versión vigente la carga directa se rechaza con un mensaje claro", async () => {
    const r = await t.asUser(ADMIN, (q) => cargar(q, plan, matriz));
    expect(r.version_id).toBeNull();
    expect(r.errores[0].mensaje).toMatch(/solicitud de cambio \(fase 4\)/);
  });
});

describe("0286 · ps_diff", () => {
  it("compara dos versiones: añadidas, retiradas, modificadas y totales", async () => {
    // Se arma una v1.1 de prueba como dueño (la fase 4 la creará por solicitud).
    const [v] = await t.q<{ id: string }>(
      "insert into ps_versiones (plan_id, numero, etiqueta, origen, base_id) values ($1, 2, 'v1.1', 'solicitud', $2) returning id", [plan, borrador]);
    await t.q(
      `insert into ps_version_lineas (version_id, linea_id, clave, orden, clasif, nombre, descripcion, campus_id, campus_texto, pilar, monto, prioridad,
          resultado, nota_no_eval, fuente, criterios, viabilidad, inicio, fin, pct, origen, oficina_unit_id, extra)
       select $1, linea_id, clave, orden, clasif, nombre, descripcion, campus_id, campus_texto, pilar, monto, prioridad,
          resultado, nota_no_eval, fuente, criterios, viabilidad, inicio, fin, pct, origen, oficina_unit_id, extra
         from ps_version_lineas where version_id = $2 and clave <> '2'`, [v.id, borrador]);
    await t.q("update ps_version_lineas set monto = monto + 1000, prioridad = 'Medio' where version_id = $1 and clave = '1'", [v.id]);
    await t.q("insert into ps_lineas (plan_id, clave) values ($1, 'NUEVA')", [plan]);
    await t.q(
      `insert into ps_version_lineas (version_id, linea_id, clave, orden, nombre, pilar, prioridad, monto)
       select $1, id, 'NUEVA', 99, 'Línea nueva', 'P2', 'Alto', 500 from ps_lineas where plan_id = $2 and clave = 'NUEVA'`, [v.id, plan]);

    const d = await t.asUser(LECTOR, (q) => rpc<any>(q, "ps_diff", "$1, $2", [borrador, v.id]));
    expect(d.a.etiqueta).toBe("v1.0");
    expect(d.b.etiqueta).toBe("v1.1");
    expect(d.anadidas.map((x: any) => x.clave)).toEqual(["NUEVA"]);
    expect(d.retiradas.map((x: any) => x.clave)).toEqual(["2"]);
    expect(d.modificadas).toHaveLength(1);
    expect(d.modificadas[0].clave).toBe("1");
    expect(Object.keys(d.modificadas[0].cambios).sort()).toEqual(["monto", "prioridad"]);
    expect(d.modificadas[0].cambios.prioridad).toEqual({ antes: "Alto", despues: "Medio" });
    expect(d.modificadas[0].cambios.monto.despues - d.modificadas[0].cambios.monto.antes).toBe(1000);
    expect(d.totales).toMatchObject({ lineas_a: 75, lineas_b: 75, anadidas: 1, retiradas: 1, modificadas: 1 });
    expect(d.totales.variacion_monto).toBe(1000 + 500 - 6381938079);
    const igual = await t.asUser(LECTOR, (q) => rpc<any>(q, "ps_diff", "$1, $1", [borrador]));
    expect(igual.totales).toMatchObject({ anadidas: 0, retiradas: 0, modificadas: 0, variacion_monto: 0 });
    expect(await errorOf(t.asUser(SIN_NIVEL, (q) => rpc(q, "ps_diff", "$1, $2", [borrador, v.id])))).toMatch(/Sin permiso/);
    await t.q("delete from ps_versiones where id = $1", [v.id]); // borrador de prueba: se puede descartar
    await t.q("delete from ps_lineas where plan_id = $1 and clave = 'NUEVA'", [plan]);
  });
});

describe("0286 · lectura, anon y eventos", () => {
  it("sin nivel no se lee nada; con nivel sí; anon no ve el dinero", async () => {
    for (const id of [SIN_NIVEL, CAPACIDAD]) {
      await t.asUser(id, async (q) => {
        for (const tabla of ["ps_planes", "ps_lineas", "ps_versiones", "ps_version_lineas", "ps_eventos"]) {
          expect(await q(`select * from public.${tabla}`), `${id} ${tabla}`).toEqual([]);
        }
      });
      expect(await errorOf(t.asUser(id, (q) => rpc(q, "ps_resumen_plan", "$1", [plan])))).toMatch(/Sin permiso/);
      expect(await errorOf(t.asUser(id, (q) => rpc(q, "ps_calidad_matriz", "$1", [borrador])))).toMatch(/Sin permiso/);
    }
    await t.asUser(LECTOR, async (q) => {
      expect(await q("select 1 from public.ps_version_lineas limit 1")).toHaveLength(1);
      expect(await q("select * from public.ps_eventos")).toEqual([]); // la bitácora no es del lector
    });
    await t.asUser(APROBADOR, async (q) => {
      expect((await q("select * from public.ps_eventos")).length).toBeGreaterThan(0);
    });
    for (const tabla of ["ps_planes", "ps_lineas", "ps_versiones", "ps_version_lineas", "ps_eventos"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from public.${tabla}`)))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select monto from public.ps_version_lineas")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(null, (q) => rpc(q, "ps_resumen_plan", "$1", [plan])))).toMatch(/permission denied/);
  });

  it("nadie escribe directo, ni siquiera con nivel admin", async () => {
    for (const id of [ADMIN, GESTOR]) {
      expect(await errorOf(t.asUser(id, (q) => q("insert into public.ps_planes (nombre, anio_ini, anio_fin) values ('X', 2027, 2028)")))).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(id, (q) => q("update public.ps_version_lineas set monto = 0 where true")))).toMatch(/permission denied/);
      expect(await errorOf(t.asUser(id, (q) => q("delete from public.ps_eventos where true")))).toMatch(/permission denied/);
    }
  });

  it("las funciones internas no se ejecutan desde el cliente", async () => {
    expect(await errorOf(t.asUser(ADMIN, (q) => q("select public.ps_evento('x.y', null, null, null, '{}')")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(ADMIN, (q) => q("select public.ps_normalizar_linea(1, '{}', 2027, 2035)")))).toMatch(/permission denied/);
  });

  it("ps_eventos solo admite anexar y registra cada escritura", async () => {
    expect(await errorOf(t.q("update ps_eventos set tipo = 'otro' where true"))).toMatch(/solo admite INSERT/);
    expect(await errorOf(t.q("delete from ps_eventos where true"))).toMatch(/solo admite INSERT/);
    const tipos = (await t.q<{ tipo: string }>("select distinct tipo from ps_eventos")).map((e) => e.tipo);
    for (const tipo of ["plan.creado", "matriz.cargada", "matriz.recargada", "version.publicada", "linea.oficina_asignada"]) {
      expect(tipos).toContain(tipo);
    }
    const [e] = await t.q<{ actor_id: string; version_id: string; datos: { huella: string } }>(
      "select actor_id, version_id, datos from ps_eventos where tipo = 'version.publicada' and plan_id = $1", [plan]);
    expect(e.actor_id).toBe(ADMIN);
    expect(e.version_id).toBe(borrador);
    expect(e.datos.huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el resumen de una versión publicada se marca vigente", async () => {
    const r = await t.asUser(GESTOR, (q) => rpc<any>(q, "ps_resumen_plan", "$1", [plan]));
    expect(r.version).toMatchObject({ estado: "publicada", es_vigente: true });
  });
});

describe("0286 · idempotencia", () => {
  it("aplicar la migración otra vez no falla ni toca los datos", async () => {
    const sql = readFileSync(new URL("../../supabase/migrations/0286_planeacion_seguimiento.sql", import.meta.url), "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    const [c] = await t.q<{ n: number; v: string }>(
      "select (select count(*) from ps_version_lineas where version_id = $1)::int n, (select estado from ps_versiones where id = $1) v", [borrador]);
    expect(c).toEqual({ n: 75, v: "publicada" });
  });
});
