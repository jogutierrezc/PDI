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

// El código del estudiante queda como seudónimo en la base: se reconoce por su programa.
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

  it("ninguna función devuelve nombres: solo código seudónimo y cifras", async () => {
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
