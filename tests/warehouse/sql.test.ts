/* Migración 0155 (Warehouse UDES): quién puede cargar y leer, que la política
   de privacidad descarta y seudonimiza dentro de la base, las versiones, la
   misma huella sin duplicar, el periodo cerrado y la vista de rendimiento. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type Query, type TestDb } from "../db/harness";

const PLANEACION = "00000000-0000-4000-a000-0000000000f1";
const CONSULTA = "00000000-0000-4000-a000-0000000000f2";
const ADMIN = "00000000-0000-4000-a000-0000000000f3";

const HUELLA_A = "a".repeat(64);
const HUELLA_B = "b".repeat(64);
const HUELLA_C = "c".repeat(64);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ seed: false });
  for (const [nombre, id, rol] of [
    ["planeacion", PLANEACION, "planeacion"],
    ["consulta", CONSULTA, "consulta"],
    ["admin", ADMIN, "admin"],
  ] as const) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [id, `${nombre}@prueba.udes.edu.co`, nombre]);
    await t.q("update public.profiles set is_active = true, role = $2 where id = $1", [id, rol]);
  }
}, 180_000);

afterAll(async () => t?.close());

const abrir = (q: Query, conjunto: string, periodo: string, huella: string, extra: { corte?: string; motivo?: string; sede?: string } = {}) =>
  q<{ id: string; version: number; duplicada: boolean }>(
    "select * from public.wh_abrir_carga($1, $2, $3, $4, $5, 'archivo', 'prueba.xlsx', $6)",
    [conjunto, periodo, extra.sede ?? "buc", extra.corte ?? "", huella, extra.motivo ?? ""],
  ).then((r) => r[0]);

async function guardar(q: Query, conjunto: string, periodo: string, huella: string, filas: object[], extra: { corte?: string; motivo?: string } = {}) {
  const carga = await abrir(q, conjunto, periodo, huella, extra);
  if (carga.duplicada) return carga;
  await q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [carga.id, JSON.stringify(filas)]);
  await q("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb)", [carga.id]);
  return carga;
}

describe("0155 · quién puede qué", () => {
  it("sin sesión no se lee ni se carga nada", async () => {
    for (const tabla of ["wh_cargas", "wh_filas", "wh_periodos", "wh_politicas", "wh_vigentes", "v_wh_rendimiento", "wh_secretos"]) {
      expect(await errorOf(t.asUser(null, (q) => q(`select * from public.${tabla}`)))).toMatch(/permission denied/);
    }
    expect(await errorOf(t.asUser(null, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_A)))).toMatch(/permission denied/);
  });

  it("Consulta no carga ni lee: el almacén es de Planeación", async () => {
    await t.asUser(CONSULTA, async (q) => {
      expect(await q("select * from public.wh_cargas")).toEqual([]);
      expect(await q("select * from public.wh_politicas")).toEqual([]);
    });
    expect(await errorOf(t.asUser(CONSULTA, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_A)))).toMatch(/sin permiso/);
  });

  it("nadie escribe las tablas directamente, ni Planeación", async () => {
    expect(
      await errorOf(t.asUser(PLANEACION, (q) => q("insert into public.wh_cargas (conjunto, periodo, sede, version, origen, huella) values ('x','2026b','buc',1,'archivo','h')"))),
    ).toMatch(/permission denied/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("select * from public.wh_secretos")))).toMatch(/permission denied/);
  });

  it("un conjunto sin política no se guarda", async () => {
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "dv_fin", "2026b", HUELLA_A)))).toMatch(/sin_politica/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "dv_asp", "2026b", HUELLA_A)))).toMatch(/sin_politica/);
  });

  it("valida el periodo y la huella", async () => {
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026-1", HUELLA_A)))).toMatch(/periodo_invalido/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026b", "corta")))).toMatch(/huella_invalida/);
  });
});

describe("0155 · la política de privacidad vive en la base", () => {
  it("matriculados: descarta lo personal y seudonimiza el código", async () => {
    await t.asUser(
      PLANEACION,
      async (q) => {
        await guardar(q, "dv_matric", "2026b", HUELLA_A, [
          {
            tipo_id: "CC", identificacion: "1098765432", codigo: "U0012345", nombres: "ANA", apellidos: "PEREZ", direccion: "Calle 1", telefono: "3000000000",
            email: "ana@correo.com", salud: "EPS", estado: "Matriculado", programa: "DERECHO", promedio_acumulado: 3.4, cred_aprobados: 60,
          },
        ]);
      },
      { commit: true },
    );
    const [fila] = await t.q<{ datos: Record<string, unknown> }>("select datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_matric'");
    expect(Object.keys(fila.datos).sort()).toEqual(["codigo", "cred_aprobados", "estado", "programa", "promedio_acumulado"]);
    expect(fila.datos.codigo).toMatch(/^x-[0-9a-f]{10}$/);
    expect(JSON.stringify(fila.datos)).not.toContain("U0012345");
  });

  it("el mismo código da el mismo seudónimo en otra carga", async () => {
    await t.asUser(
      PLANEACION,
      (q) => guardar(q, "dv_matric", "2026a", HUELLA_B, [{ codigo: "U0012345", programa: "DERECHO" }]),
      { commit: true },
    );
    const r = await t.q<{ c: string }>("select distinct datos->>'codigo' as c from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_matric'");
    expect(r).toHaveLength(1);
  });

  it("0156 · la carga académica de docentes y la matrícula global no guardan nombres ni correos", async () => {
    await t.asUser(
      PLANEACION,
      async (q) => {
        await guardar(q, "ms_nom", "2026b", "d".repeat(64), [
          { cedula: "1000270463", nombre: "DANIELA", apellido: "PEÑA", correo: "d@gmail.com", correo_institucional: "d@udes.edu.co", contrato: "INSTRUCTOR", asignatura_actividad: "INGLES III", horas_semanales: 4, observaciones: "llamar a Daniela" },
        ]);
        await guardar(q, "dv_global", "2026b", "e".repeat(64), [
          { codigo: "01060291015", id_estudiante: "1095803022", nombres: "BAYRON", apellidos: "FLOREZ", correo: "b@hotmail.com", cod_materia: "8206", materia: "EXCEL", id_docente: "37753956", docente: "INGRID CARREÑO" },
        ]);
      },
      { commit: true },
    );
    const filas = await t.q<{ conjunto: string; datos: Record<string, string> }>("select c.conjunto, f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto in ('ms_nom', 'dv_global')");
    const nom = filas.find((f) => f.conjunto === "ms_nom")!.datos;
    const glo = filas.find((f) => f.conjunto === "dv_global")!.datos;
    expect(Object.keys(nom).sort()).toEqual(["asignatura_actividad", "cedula", "contrato", "horas_semanales"]);
    expect(nom.cedula).toMatch(/^x-/);
    expect(Object.keys(glo).sort()).toEqual(["cod_materia", "codigo", "id_docente", "materia"]);
    expect(glo.codigo).toMatch(/^x-/);
    expect(glo.id_docente).toMatch(/^x-/);
    expect(JSON.stringify([nom, glo])).not.toMatch(/DANIELA|BAYRON|INGRID|gmail|hotmail|1095803022|1000270463/);
  });

  it("0157 · las notas por estudiante se resumen por estudiante y su seudónimo coincide con el de matriculados", async () => {
    await t.asUser(
      PLANEACION,
      async (q) => {
        await guardar(q, "dv_notas", "2026b", "f".repeat(64), [
          { codigo_estudiante: "01251152003", nombre_de_estudiante: "ROLDAN STEVEN", codigo_programa: "115", nombre_programa: "INGENIERIA", codigo_materia: "372605", nombre_materia: "GESTORES", grupo: "B", p1: "3.9", p2: "5.0", p3: "-", nota_acumulada: "2.7" },
          { codigo_estudiante: "01251152003", nombre_de_estudiante: "ROLDAN STEVEN", codigo_programa: "115", nombre_programa: "INGENIERIA", codigo_materia: "372606", nombre_materia: "REDES", grupo: "A", p1: "2.1", p2: "-", p3: "-", nota_acumulada: "0.0" },
          { codigo_estudiante: "01240371001", nombre_de_estudiante: "JAIRO MO", codigo_programa: "037", nombre_programa: "DERECHO", codigo_materia: "372605", nombre_materia: "GESTORES", grupo: "B", p1: "-", p2: "-", p3: "-", nota_acumulada: "0.0" },
        ]);
        await guardar(q, "dv_matric", "2026b", "9".repeat(64), [{ codigo: "01251152003", programa: "INGENIERIA", promedio_acumulado: 3.1 }]);
      },
      { commit: true },
    );
    const crudas = await t.q<{ datos: Record<string, string> }>("select f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_notas'");
    expect(JSON.stringify(crudas)).not.toMatch(/ROLDAN|JAIRO|01251152003/);
    expect(Object.keys(crudas[0].datos).sort()).toEqual(["codigo_materia", "codigo_programa", "codigo_estudiante", "grupo", "nombre_materia", "nombre_programa", "nota_acumulada", "p1", "p2", "p3"].sort());

    await t.asUser(PLANEACION, async (q) => {
      const r = await q<{ estudiante: string; materias: number; con_p1: number; con_p2: number; prom_p1: string; prom_p2: string; prom_p3: string | null; riesgo_p1: number }>(
        "select * from public.wh_notas_resumen('2026b', 'buc') order by materias desc",
      );
      expect(r).toHaveLength(2);
      expect(r[0]).toMatchObject({ materias: 2, con_p1: 2, con_p2: 1, riesgo_p1: 1 });
      expect(Number(r[0].prom_p1)).toBeCloseTo(3.0); // (3.9 + 2.1) / 2
      expect(Number(r[0].prom_p2)).toBeCloseTo(5.0);
      expect(r[0].prom_p3).toBeNull(); // «-» no es una nota
      expect(r[1]).toMatchObject({ materias: 1, con_p1: 0 }); // sin ninguna nota todavía
      // El mismo código da el mismo seudónimo que en matriculados: se pueden cruzar.
      const m = await q<{ c: string }>("select f.datos->>'codigo' as c from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_matric' and c.periodo = '2026b'");
      expect(r.map((x) => x.estudiante)).toContain(m[0].c);
    });
  });

  it("0159 · Medicina aprueba con 3,5, materias y grupos se resumen, y matriculados admite el grupo etario", async () => {
    await t.asUser(
      PLANEACION,
      async (q) => {
        await guardar(q, "dv_notas", "2025b", "1".repeat(64), [
          { codigo_estudiante: "m1", nombre_programa: "MEDICINA", codigo_materia: "C1", nombre_materia: "ANATOMÍA", grupo: "A", p1: "3.2", p2: "-", p3: "-" },
          { codigo_estudiante: "m2", nombre_programa: "DERECHO", codigo_materia: "C1", nombre_materia: "ANATOMÍA", grupo: "A", p1: "3.2", p2: "-", p3: "-" },
          { codigo_estudiante: "m3", nombre_programa: "DERECHO", codigo_materia: "C1", nombre_materia: "ANATOMÍA", grupo: "A", p1: "2.5", p2: "-", p3: "-" },
        ]);
        await guardar(q, "dv_matric", "2025b", "2".repeat(64), [{ codigo: "m1", fecha_nac: "2000-01-01", ciudad: "BUCARAMANGA", grupo_etario: "21–25", origen: "Santander", programa: "MEDICINA" }]);
      },
      { commit: true },
    );
    await t.asUser(PLANEACION, async (q) => {
      const r = await q<{ estudiante: string; riesgo_p1: number }>("select estudiante, riesgo_p1 from public.wh_notas_resumen('2025b', 'buc')");
      const por = Object.fromEntries(r.map((x) => [x.estudiante, x.riesgo_p1]));
      expect(Object.values(por).sort()).toEqual([0, 1, 1]); // 3,2 pierde en Medicina (3,5), no en Derecho (3,0); 2,5 pierde
      const g = await q<{ estudiantes: number; bajo_p1: number; con_p1: number }>("select estudiantes, bajo_p1, con_p1 from public.wh_notas_grupos('2025b', 'buc')");
      expect(g).toEqual([{ estudiantes: 3, bajo_p1: 2, con_p1: 3 }]);
    });
    const [fila] = await t.q<{ datos: Record<string, string> }>("select f.datos from public.wh_filas f join public.wh_cargas c on c.id = f.carga_id where c.conjunto = 'dv_matric' and c.periodo = '2025b'");
    expect(fila.datos.grupo_etario).toBe("21–25");
    expect(fila.datos.origen).toBe("Santander");
    expect(fila.datos).not.toHaveProperty("fecha_nac");
    expect(fila.datos).not.toHaveProperty("ciudad");
  });

  it("0157 · Consulta no lee notas ni resumen", async () => {
    await t.asUser(CONSULTA, async (q) => {
      expect(await q("select * from public.wh_notas_resumen('2026b', 'buc')")).toEqual([]);
      expect(await q("select * from public.v_wh_notas")).toEqual([]);
    });
    expect(await errorOf(t.asUser(null, (q) => q("select * from public.wh_notas_resumen('2026b', 'buc')")))).toMatch(/permission denied/);
  });

  it("rendimiento: guarda las cifras y deja al docente como seudónimo", async () => {
    await t.asUser(
      PLANEACION,
      (q) =>
        guardar(
          q,
          "ma_rendimiento",
          "2026b",
          HUELLA_A,
          [
            { codigo: "103801", letra: "A", nombre: "SALUD", plan: "TRES CORTES", programa: "TERAPIA OCUPACIONAL", docente: "DEYANIRA CACUA", matriculados: "12", reprobados: "3", pct_reprobados: "25.0", aprobados: "9", pct_aprobados: "75.0", no_presenta: "0", pct_no_presenta: "0.0", promedio: "3.5" },
            { codigo: "372601", letra: "A", nombre: "DISEÑO", plan: "TRES CORTES", programa: "SOFTWARE", docente: "CARMEN DULCEY", matriculados: 18, reprobados: 0, pct_reprobados: 0, aprobados: 15, pct_aprobados: 83.3, no_presenta: 3, pct_no_presenta: 16.7, promedio: 4.7 },
          ],
          { corte: "1" },
        ),
      { commit: true },
    );
    await t.asUser(PLANEACION, async (q) => {
      const filas = await q<{ docente: string; matriculados: string; pct_reprobados: string; departamento: string }>(
        "select docente, matriculados, pct_reprobados, departamento from public.v_wh_rendimiento order by codigo",
      );
      expect(filas).toHaveLength(2);
      expect(filas[0].docente).toMatch(/^x-/);
      expect(Number(filas[0].matriculados)).toBe(12); // llegó como texto, sale tipado
      expect(Number(filas[0].pct_reprobados)).toBe(25);
      expect(filas[0].departamento).toBe("TERAPIA OCUPACIONAL");
    });
  });
});

describe("0155 · versiones, huella y periodo cerrado", () => {
  it("la misma huella no se guarda dos veces", async () => {
    const otra = await t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_A, { corte: "1" }), { commit: true });
    expect(otra.duplicada).toBe(true);
    expect(otra.version).toBe(1);
  });

  it("una huella distinta crea la versión 2 y deja la 1 reemplazada", async () => {
    await t.asUser(PLANEACION, (q) => guardar(q, "ma_rendimiento", "2026b", HUELLA_B, [{ codigo: "1", letra: "A", matriculados: 5 }], { corte: "1" }), { commit: true });
    const r = await t.q<{ version: number; estado: string }>(
      "select version, estado from public.wh_cargas where conjunto = 'ma_rendimiento' and periodo = '2026b' and corte = '1' order by version",
    );
    expect(r).toEqual([
      { version: 1, estado: "reemplazada" },
      { version: 2, estado: "guardada" },
    ]);
    await t.asUser(PLANEACION, async (q) => {
      const v = await q<{ version: number; filas: number }>("select version, filas from public.wh_vigentes where conjunto = 'ma_rendimiento' and corte = '1'");
      expect(v).toEqual([{ version: 2, filas: 1 }]);
    });
  });

  it("cada corte es una carga aparte", async () => {
    await t.asUser(PLANEACION, (q) => guardar(q, "ma_rendimiento", "2026b", HUELLA_A, [{ codigo: "1", letra: "A", matriculados: 5 }], { corte: "2" }), { commit: true });
    await t.asUser(PLANEACION, async (q) => {
      const cortes = await q<{ corte: string }>("select corte from public.v_wh_cobertura where conjunto = 'ma_rendimiento' order by corte");
      expect(cortes.map((c) => c.corte)).toEqual(["1", "2"]);
    });
  });

  it("un periodo cerrado exige motivo para recargarse, y lo guarda", async () => {
    await t.asUser(PLANEACION, (q) => q("select public.wh_cerrar_periodo('2026b', 'Cierre de semestre')"), { commit: true });
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_C, { corte: "1" })))).toMatch(/periodo_cerrado/);
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_C, { corte: "1", motivo: "no" })))).toMatch(/periodo_cerrado/);

    const c = await t.asUser(PLANEACION, (q) => guardar(q, "ma_rendimiento", "2026b", HUELLA_C, [{ codigo: "1", letra: "A", matriculados: 6 }], { corte: "1", motivo: "Corrección de notas del docente" }), { commit: true });
    expect(c.version).toBe(3);
    const [{ motivo }] = await t.q<{ motivo: string }>("select motivo from public.wh_cargas where id = $1", [c.id]);
    expect(motivo).toBe("Corrección de notas del docente");
  });

  it("repetir la misma huella en un periodo cerrado no pide motivo ni crea versión", async () => {
    const otra = await t.asUser(PLANEACION, (q) => abrir(q, "ma_rendimiento", "2026b", HUELLA_C, { corte: "1" }));
    expect(otra.duplicada).toBe(true);
  });

  it("reabrir un periodo es de la administración y pide motivo", async () => {
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("select public.wh_reabrir_periodo('2026b', 'Se necesita reabrir')")))).toMatch(/administración/);
    expect(await errorOf(t.asUser(ADMIN, (q) => q("select public.wh_reabrir_periodo('2026b', 'x')")))).toMatch(/motivo_requerido/);
    await t.asUser(ADMIN, (q) => q("select public.wh_reabrir_periodo('2026b', 'Se necesita reabrir por error')"), { commit: true });
    const [p] = await t.q<{ estado: string }>("select estado from public.wh_periodos where periodo = '2026b'");
    expect(p.estado).toBe("abierto");
  });
});

describe("0155 · cargas que fallan", () => {
  it("un archivo sin filas queda en error y no reemplaza lo guardado", async () => {
    const antes = await t.q<{ version: number }>("select version from public.wh_vigentes where conjunto = 'ma_rendimiento' and corte = '2'");
    await t.asUser(
      PLANEACION,
      async (q) => {
        const c = await abrir(q, "ma_rendimiento", "2026b", HUELLA_B, { corte: "2" });
        const total = await q<{ n: number }>("select public.wh_cerrar_carga($1, true, '', '[]'::jsonb) as n", [c.id]);
        expect(total[0].n).toBe(0);
      },
      { commit: true },
    );
    const despues = await t.q<{ version: number }>("select version from public.wh_vigentes where conjunto = 'ma_rendimiento' and corte = '2'");
    expect(despues).toEqual(antes);
    const [e] = await t.q<{ estado: string; error: string }>("select estado, error from public.wh_cargas where conjunto = 'ma_rendimiento' and corte = '2' order by version desc limit 1");
    expect(e.estado).toBe("error");
    expect(e.error).toMatch(/no trae filas/);
  });

  it("una carga en curso bloquea otra igual, y solo la agrega quien la abrió", async () => {
    const c = await t.asUser(PLANEACION, (q) => abrir(q, "dm_prog", "permanente", HUELLA_A), { commit: true });
    expect(await errorOf(t.asUser(PLANEACION, (q) => abrir(q, "dm_prog", "permanente", HUELLA_B)))).toMatch(/carga_en_curso/);
    expect(await errorOf(t.asUser(ADMIN, (q) => q("select public.wh_agregar_filas($1, 1, '[]'::jsonb)", [c.id])))).toMatch(/carga_no_disponible/);
    await t.asUser(PLANEACION, (q) => q("select public.wh_cerrar_carga($1, false, 'cancelada', null)", [c.id]), { commit: true });
  });

  it("máximo 2000 filas por llamada", async () => {
    const c = await t.asUser(PLANEACION, (q) => abrir(q, "dm_prog", "permanente", HUELLA_C), { commit: true });
    const muchas = JSON.stringify(Array.from({ length: 2001 }, (_, i) => ({ codigo: String(i) })));
    expect(await errorOf(t.asUser(PLANEACION, (q) => q("select public.wh_agregar_filas($1, 1, $2::jsonb)", [c.id, muchas])))).toMatch(/filas_demasiadas/);
  });
});

describe("0155 · la migración es idempotente", () => {
  it("se puede volver a aplicar sin perder lo guardado", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const antes = await t.q<{ n: number }>("select count(*)::int as n from public.wh_filas");
    await t.db.exec(readFileSync(resolve(__dirname, "../../supabase/migrations/0155_warehouse_udes.sql"), "utf8"));
    const despues = await t.q<{ n: number }>("select count(*)::int as n from public.wh_filas");
    expect(despues).toEqual(antes);
  });
});
