/* Migración 0160 (Monitor de alertas tempranas): quién ve qué por su unidad y no por una clave,
   la asignación de programas a unidades y que ninguna función entrega nombres. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, PEOPLE, UNITS, type Query, type TestDb } from "../db/harness";

const PLANEACION = "00000000-0000-4000-a000-0000000000f1";
const AJENO = "00000000-0000-4000-a000-0000000000f4";
const HUELLA = "a".repeat(64);

let t: TestDb;

const fila = (cod: string, prog: string, est: string, p1: string, p2 = "-", mat = "372605", gr = "A") => ({
  codigo_estudiante: est,
  codigo_programa: cod,
  nombre_programa: prog,
  codigo_materia: mat,
  nombre_materia: "GESTORES",
  grupo: gr,
  p1,
  p2,
  p3: "-",
  nota_acumulada: "0.0",
});

beforeAll(async () => {
  t = await createTestDb({ seed: true });
  for (const [nombre, id, rol] of [
    ["planeacion", PLANEACION, "planeacion"],
    ["ajeno", AJENO, "consulta"],
  ] as const) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [id, `${nombre}@prueba.udes.edu.co`, nombre]);
    await t.q("update public.profiles set is_active = true, role = $2 where id = $1", [id, rol]);
  }
  await t.q("update public.profiles set is_active = true where email like '%@prueba.udes.edu.co'");

  // Notas de cuatro programas: A, B (de la facultad de prueba), M (maestría, sin unidad asignada) y Z (otra facultad).
  await t.asUser(
    PLANEACION,
    async (q: Query) => {
      const c = await q<{ id: string }>("select * from public.wh_abrir_carga('dv_notas', '2026b', 'buc', '', $1, 'archivo', 'n.xlsx', '')", [HUELLA]);
      await q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [
        c[0].id,
        JSON.stringify([
          fila("011", "PROGRAMA DE PRUEBA A", "a1", "4.0", "4.2"),
          fila("011", "PROGRAMA DE PRUEBA A", "a2", "2.0", "2.5", "372606"),
          fila("012", "Programa de Prueba B", "b1", "3.1"),
          fila("099", "MAESTRÍA SIN ASIGNAR", "m1", "3.9"),
          fila("021", "PROGRAMA DE OTRA FACULTAD", "z1", "2.2"),
        ]),
      ]);
      await q("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb)", [c[0].id]);
    },
    { commit: true },
  );
});

afterAll(async () => t?.close());

// Desde 0161 el código del estudiante es el real (sin nombre): el alcance de cada quien se prueba por su código y su programa.
const resumen = (q: Query) => q<{ estudiante: string; codigo_programa: string }>("select estudiante, codigo_programa from public.wh_monitor_resumen('2026b', 'buc') order by codigo_programa, estudiante");
const progs = async (q: Query) => (await resumen(q)).map((r) => r.codigo_programa);

describe("0160 · quién ve qué, por su unidad y no por una clave", () => {
  it("sin sesión no se lee nada", async () => {
    for (const f of ["wh_monitor_resumen('2026b','buc')", "wh_monitor_grupos('2026b','buc')", "wh_monitor_mapa('2026b','buc')", "wh_monitor_estudiante('2026b','buc','a1')"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from public.${f}`)))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => q("select public.wh_monitor_puede()")))).toMatch(/permission denied/);
  });

  it("sin programas asignados a unidades, solo Planeación ve las notas", async () => {
    await t.asUser(PLANEACION, async (q) => {
      expect(await progs(q)).toEqual(["011", "011", "012", "021", "099"]);
    });
    expect(await errorOf(t.asUser(PEOPLE.decano, (q) => resumen(q)))).toMatch(/sin permiso/);
    expect(await errorOf(t.asUser(AJENO, (q) => resumen(q)))).toMatch(/sin permiso/);
  });

  it("Planeación asigna los programas a las unidades; nadie más puede", async () => {
    expect(await errorOf(t.asUser(PEOPLE.decano, (q) => q("select public.wh_monitor_asignar('011', 'A', $1)", [UNITS.programaA])))).toMatch(/Planeación/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("select public.wh_monitor_asignar('011', 'A', $1)", [UNITS.facultad])))).toMatch(/programa del organigrama/);
    await t.asUser(
      PLANEACION,
      async (q) => {
        await q("select public.wh_monitor_asignar('011', 'PROGRAMA DE PRUEBA A', $1)", [UNITS.programaA]);
        await q("select public.wh_monitor_asignar('021', 'PROGRAMA DE OTRA FACULTAD', $1)", [UNITS.programaZ]);
        // «Programa de Prueba B» se reconoce por su nombre, sin tildes ni mayúsculas.
        const n = await q<{ n: number }>("select public.wh_monitor_autoasignar('2026b', 'buc') as n");
        expect(n[0].n).toBe(1);
      },
      { commit: true },
    );
  });

  it("la decanatura ve su facultad (sus programas); la dirección, solo su programa; el de otra facultad, nada ajeno", async () => {
    await t.asUser(PEOPLE.decano, async (q) => {
      expect(await progs(q)).toEqual(["011", "011", "012"]);
    });
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await progs(q)).toEqual(["011", "011"]);
    });
    await t.asUser(PEOPLE.otroDirector, async (q) => {
      expect(await progs(q)).toEqual(["021"]);
    });
    expect(await errorOf(t.asUser(AJENO, (q) => resumen(q)))).toMatch(/sin permiso/);
  });

  it("un programa sin unidad solo lo ve Planeación", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const m = await q<{ codigo_programa: string; unit_id: string | null }>("select codigo_programa, unit_id from public.wh_monitor_mapa('2026b', 'buc') order by codigo_programa");
      expect(m.find((x) => x.codigo_programa === "099")?.unit_id).toBeNull();
    });
    await t.asUser(PEOPLE.decano, async (q) => {
      const m = await q<{ codigo_programa: string; facultad: string }>("select codigo_programa, facultad from public.wh_monitor_mapa('2026b', 'buc') order by codigo_programa");
      expect(m.map((x) => x.codigo_programa)).toEqual(["011", "012"]);
      expect(m[0].facultad).toBe("Facultad de Prueba");
    });
  });

  it("los grupos y el estudiante respetan el mismo alcance", async () => {
    await t.asUser(PEOPLE.director, async (q) => {
      const g = await q<{ codigo_programa: string }>("select codigo_programa from public.wh_monitor_grupos('2026b', 'buc')");
      expect([...new Set(g.map((x) => x.codigo_programa))]).toEqual(["011"]);
      const mio = (await resumen(q))[0].estudiante;
      expect(await q("select * from public.wh_monitor_estudiante('2026b', 'buc', $1)", [mio])).toHaveLength(1);
    });
    const ajeno = await t.asUser(PLANEACION, async (q) => (await resumen(q)).find((r) => r.codigo_programa === "021")!.estudiante);
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q("select * from public.wh_monitor_estudiante('2026b', 'buc', $1)", [ajeno])).toEqual([]); // existe, pero no es de su programa
    });
  });

  it("los estudiantes de un grupo salen solo dentro del alcance", async () => {
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q("select * from public.wh_monitor_grupo_estudiantes('2026b', 'buc', '372605', 'A')")).toHaveLength(1);
    });
    await t.asUser(PLANEACION, async (q) => {
      expect(await q("select * from public.wh_monitor_grupo_estudiantes('2026b', 'buc', '372605', 'A')")).toHaveLength(4);
    });
  });

  it("ninguna función devuelve nombres: solo el código real y cifras", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const r = await q("select * from public.wh_monitor_resumen('2026b', 'buc')");
      expect(Object.keys(r[0]).sort()).toEqual(["codigo_programa", "con_p1", "con_p2", "con_p3", "estudiante", "materias", "programa", "prom_p1", "prom_p2", "prom_p3", "riesgo_p1", "riesgo_p2", "riesgo_p3"]);
    });
  });

  it("las tablas del Monitor no se escriben ni se leen directamente", async () => {
    expect(await errorOf(t.asUser(PEOPLE.decano, (q) => q("select * from public.wh_programas_unidad")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("insert into public.wh_programas_unidad (codigo_programa) values ('x')")))).toMatch(/permission denied/);
  });
});

describe("0161 · el código real del estudiante, solo para quien ya ve ese programa", () => {
  const codigos = (q: Query) => resumen(q).then((r) => r.map((x) => x.estudiante).sort());

  it("se guarda el código real (marcado como dato personal) y nunca un nombre", async () => {
    const filas = await t.q<{ datos: Record<string, string> }>("select f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_notas' and c.periodo = '2026b'");
    expect(filas.map((f) => f.datos.codigo_estudiante).sort()).toEqual(["a1", "a2", "b1", "m1", "z1"]);
    expect(JSON.stringify(filas)).not.toMatch(/x-[0-9a-f]{10}/);
    const [pol] = await t.q<{ seudonimizar: string[]; datos_personales: string[]; finalidad: string }>("select seudonimizar, datos_personales, finalidad from public.wh_politicas where conjunto = 'dv_notas'");
    expect(pol.seudonimizar).toEqual([]);
    expect(pol.datos_personales).toEqual(["codigo_estudiante"]);
    expect(pol.finalidad).toMatch(/seguimiento académico/i);
  });

  it("Planeación ve todos los códigos; la decanatura, los de su facultad; la dirección, los de su programa", async () => {
    await t.asUser(PLANEACION, async (q) => expect(await codigos(q)).toEqual(["a1", "a2", "b1", "m1", "z1"]));
    await t.asUser(PEOPLE.decano, async (q) => expect(await codigos(q)).toEqual(["a1", "a2", "b1"]));
    await t.asUser(PEOPLE.director, async (q) => expect(await codigos(q)).toEqual(["a1", "a2"]));
    await t.asUser(PEOPLE.otroDirector, async (q) => expect(await codigos(q)).toEqual(["z1"]));
  });

  it("quien no ve ese programa no puede pedir el código ni por el grupo ni por la ficha", async () => {
    await t.asUser(PEOPLE.director, async (q) => {
      expect(await q("select * from public.wh_monitor_estudiante('2026b', 'buc', 'z1')")).toEqual([]);
      expect(await q("select * from public.wh_monitor_estudiante('2026b', 'buc', 'b1')")).toEqual([]);
      const g = await q<{ estudiante: string }>("select estudiante from public.wh_monitor_grupo_estudiantes('2026b', 'buc', '372605', 'A')");
      expect(g.map((x) => x.estudiante)).toEqual(["a1"]);
    });
    expect(await errorOf(t.asUser(AJENO, (q) => codigos(q)))).toMatch(/sin permiso/);
    expect(await errorOf(t.asUser(AJENO, (q) => q("select * from public.wh_monitor_estudiante('2026b', 'buc', 'a1')")))).toMatch(/sin permiso/);
  });

  it("las filas guardadas no se leen directamente fuera de Planeación (el código real no sale por RLS)", async () => {
    await t.asUser(PEOPLE.decano, async (q) => expect(await q("select * from public.wh_filas")).toEqual([]));
    await t.asUser(PEOPLE.director, async (q) => expect(await q("select * from public.wh_filas")).toEqual([]));
    expect(await errorOf(t.asUser(null, (q) => q("select * from public.wh_filas")))).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("update public.wh_filas set datos = '{}'::jsonb")))).toMatch(/permission denied/);
  });

  it("aunque el reporte traiga nombre, documento, correo o teléfono, solo queda el código", async () => {
    await t.asUser(
      PLANEACION,
      async (q) => {
        const c = await q<{ id: string }>("select * from public.wh_abrir_carga('dv_notas', '2026a', 'buc', '', $1, 'archivo', 'n2.xlsx', '')", ["b".repeat(64)]);
        await q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [
          c[0].id,
          JSON.stringify([{ ...fila("011", "PROGRAMA DE PRUEBA A", "01251152003", "3.9"), nombre_de_estudiante: "ROLDAN STEVEN", nombres: "ROLDAN", documento: "1098765432", email: "r@udes.edu.co", telefono: "3001112233", fecha_nacimiento: "2001-02-03", direccion: "Calle 5", salud: "EPS" }]),
        ]);
        await q("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb)", [c[0].id]);
      },
      { commit: true },
    );
    const [f] = await t.q<{ datos: Record<string, string> }>("select f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_notas' and c.periodo = '2026a'");
    expect(f.datos.codigo_estudiante).toBe("01251152003");
    expect(Object.keys(f.datos).sort()).toEqual(["codigo_estudiante", "codigo_materia", "codigo_programa", "grupo", "nombre_materia", "nombre_programa", "nota_acumulada", "p1", "p2", "p3"].sort());
    expect(JSON.stringify(f.datos)).not.toMatch(/ROLDAN|1098765432|udes\.edu|3001112233|2001|Calle|EPS/);
    // Y ninguna función del Monitor devuelve esas columnas.
    await t.asUser(PLANEACION, async (q) => {
      for (const fn of ["wh_monitor_resumen('2026a','buc')", "wh_monitor_grupos('2026a','buc')", "wh_monitor_grupo_estudiantes('2026a','buc','372605','A')", "wh_monitor_estudiante('2026a','buc','01251152003')", "wh_monitor_mapa('2026a','buc')"]) {
        const r = await q(`select * from public.${fn}`);
        expect(JSON.stringify(r)).not.toMatch(/ROLDAN|1098765432|udes\.edu|3001112233|Calle|nombre_de_estudiante|documento|telefono|email|correo/);
      }
    });
  });

  it("la política no deja guardar una columna de identidad, y la sal sigue como opción para otros conjuntos", async () => {
    expect(await errorOf(t.q("insert into public.wh_politicas (conjunto, modo, lista) values ('x_malo', 'permitir', '{codigo,nombres}')"))).toMatch(/wh_politicas_sin_identidad/);
    expect(await errorOf(t.q("insert into public.wh_politicas (conjunto, modo, lista, datos_personales) values ('x_malo2', 'permitir', '{codigo}', '{documento}')"))).toMatch(/wh_politicas_personales_coherentes|wh_politicas_sin_identidad/);
    // Los docentes siguen como seudónimo (HMAC con sal).
    const pol = await t.q<{ conjunto: string; seudonimizar: string[] }>("select conjunto, seudonimizar from public.wh_politicas where conjunto in ('dv_global','ms_nom','ms_doc') order by conjunto");
    expect(pol).toEqual([
      { conjunto: "dv_global", seudonimizar: ["id_docente"] },
      { conjunto: "ms_doc", seudonimizar: ["identification"] },
      { conjunto: "ms_nom", seudonimizar: ["cedula"] },
    ]);
  });
});

describe("0161 · plan del grupo, clave código + letra y mapa de riesgo", () => {
  const nota = (est: string, cod: string, cm: string, gr: string, p1: string, p2: string, fin: string) => ({
    codigo_estudiante: est, codigo_programa: cod, nombre_programa: cod === "011" ? "PROGRAMA DE PRUEBA A" : "PROGRAMA DE OTRA FACULTAD",
    codigo_materia: cm, nombre_materia: `MATERIA ${cm}`, grupo: gr, p1, p2, p3: "-", nota_acumulada: fin,
  });
  const ma = (codigo: string, letra: string, plan: string) => ({ codigo, letra, nombre: "X", plan, programa: "DEPTO", docente: "DOCENTE", matriculados: 2, reprobados: 1, pct_reprobados: 50, aprobados: 1, promedio: 3.0 });

  beforeAll(async () => {
    await t.asUser(
      PLANEACION,
      async (q: Query) => {
        const c = await q<{ id: string }>("select * from public.wh_abrir_carga('dv_notas', '2025b', 'buc', '', $1, 'archivo', 'p.xlsx', '')", ["c".repeat(64)]);
        await q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [
          c[0].id,
          JSON.stringify([
            nota("e1", "011", "SIS101", "A", "2.0", "4.0", "2.8"),
            nota("e2", "011", "SIS101", "A", "4.0", "-", "4.2"),
            nota("e1", "011", "SIS300", "A", "2.5", "-", "0.0"),
            nota("e3", "011", "SIS101", "B", "2.0", "2.0", "2.5"), // plan única: sus «cortes» no cuentan
            nota("e4", "011", "SIS101", "B", "-", "-", "4.0"),
            nota("e5", "021", "SIS200", "A", "-", "-", "2.0"), // formación permanente, otro programa
          ]),
        ]);
        await q("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb)", [c[0].id]);
        const m = await q<{ id: string }>("select * from public.wh_abrir_carga('ma_rendimiento', '2025b', 'buc', 'f', $1, 'archivo', 'm.xlsx', '')", ["d".repeat(64)]);
        await q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [
          m[0].id,
          JSON.stringify([ma("SIS101", "A", "TRES CORTES"), ma("SIS101", "B", "ÚNICA"), ma("SIS200", "a", "FORMACIÓN PERMANENTE")]),
        ]);
        await q("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb)", [m[0].id]);
      },
      { commit: true },
    );
  });

  it("el plan se conserva (no es dato personal) y se normaliza; sin plan = tres cortes", async () => {
    const [f] = await t.q<{ datos: Record<string, string> }>("select f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'ma_rendimiento' and f.datos->>'letra' = 'B'");
    expect(f.datos.plan).toBe("ÚNICA");
    expect(f.datos.docente).toMatch(/^x-/); // el docente sigue como seudónimo
    const r = await t.q<{ a: string; b: string; c: string; d: string; e: string }>(
      "select public.wh_plan_norm('TRES CORTES') a, public.wh_plan_norm('Única') b, public.wh_plan_norm('FORMACIÓN PERMANENTE') c, public.wh_plan_norm(null) d, public.wh_plan_norm('') e",
    );
    expect(r[0]).toEqual({ a: "tres_cortes", b: "unica", c: "permanente", d: "tres_cortes", e: "tres_cortes" });
    expect(await t.q("select public.wh_grupo_clave(' SIS101 ', ' a ') as k")).toEqual([{ k: "SIS101~A" }]);
  });

  it("las vistas por corte (estudiantes y grupos) usan solo los grupos de tres cortes", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const est = await q<{ estudiante: string; materias: number }>("select estudiante, materias from public.wh_monitor_resumen('2025b', 'buc') order by estudiante");
      expect(est).toEqual([{ estudiante: "e1", materias: 2 }, { estudiante: "e2", materias: 1 }]); // e3, e4 (única) y e5 (permanente) no entran
      const g = await q<{ grupo_clave: string }>("select grupo_clave from public.wh_monitor_grupos('2025b', 'buc') order by 1");
      expect(g.map((x) => x.grupo_clave)).toEqual(["SIS101~A", "SIS300~A"]);
      const e1 = await q<{ grupo_clave: string }>("select grupo_clave from public.wh_monitor_estudiante('2025b', 'buc', 'e1') order by 1");
      expect(e1.map((x) => x.grupo_clave)).toEqual(["SIS101~A", "SIS300~A"]);
    });
  });

  it("la clave código + letra asocia estudiante y grupo (sin importar mayúsculas), y respeta la unidad", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const a = await q<{ estudiante: string }>("select estudiante from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS101~A') order by 1");
      expect(a.map((x) => x.estudiante)).toEqual(["e1", "e2"]);
      expect((await q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS101~a')")).length).toBe(2);
      expect(await q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS101')")).toEqual([]); // sin letra: no hay grupo
      expect((await q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS200~A')")).length).toBe(1);
    });
    await t.asUser(PEOPLE.director, async (q) => {
      expect((await q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS101~B')")).length).toBe(2);
      expect(await q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS200~A')")).toEqual([]); // es de otro programa
    });
    expect(await errorOf(t.asUser(AJENO, (q) => q("select * from public.wh_monitor_grupo_estudiantes('2025b', 'buc', 'SIS101~A')")))).toMatch(/sin permiso/);
    const ix = await t.q<{ indexname: string }>("select indexname from pg_indexes where tablename = 'wh_filas' and indexname in ('wh_filas_grupo_idx','wh_filas_estudiante_idx','wh_filas_plan_idx')");
    expect(ix).toHaveLength(3);
  });

  it("mapa de riesgo: cortes 1 a 3 solo de tres cortes; la nota final, de todos los planes", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const r = await q<{ grupo_clave: string; plan: string; corte: number; con: number; bajo: number }>(
        "select grupo_clave, plan, corte, con, bajo from public.wh_monitor_riesgo('2025b', 'buc') order by corte, grupo_clave",
      );
      const por = (c: number) => r.filter((x) => x.corte === c);
      expect(por(1)).toEqual([
        { grupo_clave: "SIS101~A", plan: "tres_cortes", corte: 1, con: 2, bajo: 1 },
        { grupo_clave: "SIS300~A", plan: "tres_cortes", corte: 1, con: 1, bajo: 1 },
      ]);
      expect(por(2).map((x) => x.grupo_clave)).toEqual(["SIS101~A"]);
      expect(por(3)).toEqual([]);
      // Nota final: todos los planes; una nota acumulada de 0 es «sin nota», no una reprobada.
      expect(por(4).map((x) => `${x.grupo_clave}:${x.plan}:${x.con}:${x.bajo}`)).toEqual(["SIS101~A:tres_cortes:2:1", "SIS101~B:unica:2:1", "SIS200~A:permanente:1:1"]);
    });
  });

  it("el riesgo respeta la unidad y no entrega nada individual", async () => {
    await t.asUser(PEOPLE.director, async (q) => {
      const r = await q<Record<string, unknown>>("select * from public.wh_monitor_riesgo('2025b', 'buc')");
      expect(r.every((x) => x.codigo_programa === "011")).toBe(true);
      expect(Object.keys(r[0]).sort()).toEqual(["bajo", "codigo_materia", "codigo_programa", "con", "corte", "grupo", "grupo_clave", "materia", "plan", "programa", "promedio"]);
      expect(JSON.stringify(r)).not.toMatch(/"e[1-5]"/); // ningún código de estudiante
    });
    expect(await errorOf(t.asUser(AJENO, (q) => q("select * from public.wh_monitor_riesgo('2025b', 'buc')")))).toMatch(/sin permiso/);
    expect(await errorOf(t.asUser(null, (q) => q("select * from public.wh_monitor_riesgo('2025b', 'buc')")))).toMatch(/permission denied/);
  });

  it("cuántos grupos hay de cada plan, y sin reporte de Master todos son tres cortes", async () => {
    await t.asUser(PLANEACION, async (q) => {
      const p = await q<{ plan: string; grupos: number; matriculas: number; plan_conocido: boolean }>("select * from public.wh_monitor_planes_resumen('2025b', 'buc') order by plan");
      expect(p).toEqual([
        { plan: "permanente", grupos: 1, matriculas: 1, plan_conocido: true },
        { plan: "tres_cortes", grupos: 2, matriculas: 3, plan_conocido: true },
        { plan: "unica", grupos: 1, matriculas: 2, plan_conocido: true },
      ]);
      const s = await q<{ plan: string; plan_conocido: boolean }>("select plan, plan_conocido from public.wh_monitor_planes_resumen('2026b', 'buc')");
      expect(s).toEqual([{ plan: "tres_cortes", plan_conocido: false }]); // 2026b no tiene reporte de Master: degradación segura
    });
  });
});
