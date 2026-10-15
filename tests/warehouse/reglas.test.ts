/* Las alertas tempranas (src/modules/warehouse/reglas.ts) y la coherencia
   entre el catálogo de la pantalla y las políticas de privacidad de la base. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONJUNTOS, cargaPorArchivo, pideSolo, periodosDisponibles } from "../../src/modules/warehouse/conjuntos";
import {
  UMBRALES_ESTUDIANTE,
  UMBRALES_GRUPO,
  UMBRALES_NOTAS,
  contarNiveles,
  evaluarEstudiantes,
  evaluarGrupos,
  evaluarNotas,
  evolucionPorCorte,
  nivelDe,
  numero,
  resumenPorDepartamento,
} from "../../src/modules/warehouse/reglas";
import { REPORTES } from "../../src/modules/warehouse/reportes";
import type { GrupoRendimiento, ResumenNotas } from "../../src/modules/warehouse/store";

const grupo = (o: Partial<GrupoRendimiento>): GrupoRendimiento => ({
  periodo: "2026b",
  sede: "buc",
  corte: "1",
  codigo: "100",
  letra: "A",
  nombre: "CÁLCULO",
  plan: "TRES CORTES",
  departamento: "MATEMÁTICAS",
  docente: "x-abc",
  matriculados: 20,
  reprobados: 2,
  pct_reprobados: 10,
  aprobados: 18,
  pct_aprobados: 90,
  no_presenta: 0,
  pct_no_presenta: 0,
  promedio: 4,
  ...o,
});

describe("alertas por grupo", () => {
  it("un grupo sano no alerta", () => {
    const [a] = evaluarGrupos([grupo({})], "1");
    expect(a.reglas).toEqual([]);
    expect(a.nivel).toBe(0);
  });

  it("el nivel sale de cuántas reglas se cumplen", () => {
    const uno = evaluarGrupos([grupo({ pct_reprobados: 30 })], "1")[0];
    const dos = evaluarGrupos([grupo({ pct_reprobados: 30, pct_no_presenta: 20 })], "1")[0];
    const tres = evaluarGrupos([grupo({ pct_reprobados: 30, pct_no_presenta: 20, promedio: 2.8 })], "1")[0];
    expect([uno.nivel, dos.nivel, tres.nivel]).toEqual([1, 2, 3]);
    expect(nivelDe(5)).toBe(3);
  });

  it("los umbrales son inclusivos: justo en el valor, alerta", () => {
    expect(evaluarGrupos([grupo({ pct_reprobados: UMBRALES_GRUPO.reprobados })], "1")[0].reglas).toContain("reprobados");
    expect(evaluarGrupos([grupo({ pct_reprobados: UMBRALES_GRUPO.reprobados - 0.1 })], "1")[0].reglas).not.toContain("reprobados");
  });

  it("un grupo pequeño no se evalúa", () => {
    expect(evaluarGrupos([grupo({ matriculados: 4, pct_reprobados: 100 })], "1")).toEqual([]);
  });

  it("un promedio de 0 (sin notas todavía) no cuenta como promedio bajo", () => {
    expect(evaluarGrupos([grupo({ promedio: 0 })], "1")[0].reglas).not.toContain("promedio");
  });

  it("la caída se mide contra el corte anterior del MISMO grupo", () => {
    const todos = [grupo({ corte: "1", promedio: 4.2 }), grupo({ corte: "2", promedio: 3.7 }), grupo({ corte: "2", codigo: "200", promedio: 3.7 })];
    const c2 = evaluarGrupos(todos, "2");
    expect(c2.find((a) => a.grupo.codigo === "100")!.reglas).toContain("caida");
    expect(c2.find((a) => a.grupo.codigo === "100")!.anterior).toBe(4.2);
    // El otro grupo no tiene corte anterior: no hay con qué comparar, no alerta por caída.
    expect(c2.find((a) => a.grupo.codigo === "200")!.reglas).not.toContain("caida");
  });

  it("si falta el corte anterior, compara con el último que sí se cargó", () => {
    const todos = [grupo({ corte: "1", promedio: 4.5 }), grupo({ corte: "3", promedio: 3.9 })];
    expect(evaluarGrupos(todos, "3")[0].reglas).toContain("caida");
  });

  it("resumen por departamento: aprobación ponderada y grupos en alerta", () => {
    const alertas = evaluarGrupos(
      [
        grupo({ departamento: "A", matriculados: 10, aprobados: 5, reprobados: 5, pct_reprobados: 50 }),
        grupo({ codigo: "2", departamento: "A", matriculados: 30, aprobados: 30, reprobados: 0, pct_reprobados: 0 }),
        grupo({ codigo: "3", departamento: "B", matriculados: 10, aprobados: 10, reprobados: 0, pct_reprobados: 0 }),
      ],
      "1",
    );
    const r = resumenPorDepartamento(alertas);
    expect(r[0].departamento).toBe("A"); // el que más alerta va primero
    expect(r[0]).toMatchObject({ grupos: 2, matriculados: 40, enAlerta: 1 });
    expect(r[0].aprobacion).toBeCloseTo(87.5);
  });

  it("evolución: una cifra por corte cargado, ponderada por matriculados", () => {
    const e = evolucionPorCorte([
      grupo({ corte: "1", matriculados: 10, aprobados: 9, promedio: 4 }),
      grupo({ corte: "1", codigo: "2", matriculados: 30, aprobados: 21, promedio: 3 }),
      grupo({ corte: "2", matriculados: 10, aprobados: 10, promedio: 4 }),
    ]);
    expect(e.map((p) => p.corte)).toEqual(["1", "2"]);
    expect(e[0].aprobacion).toBeCloseTo(75);
    expect(e[0].promedio).toBeCloseTo(3.25);
  });
});

describe("alertas por estudiante", () => {
  const fila = (o: Record<string, unknown>) => ({ codigo: "x-1", programa: "DERECHO", jornada: "DIURNA", promedio_acumulado: 4, promedio_semestre_ultimo_poligrafo: 4, cred_aprobados: 60, cred_segun_ubicacion: 60, ...o });

  it("lee números de Excel con coma o punto", () => {
    expect(numero("3,4")).toBe(3.4);
    expect(numero("3.4")).toBe(3.4);
    expect(numero(3.4)).toBe(3.4);
    expect(numero("")).toBeNull();
    expect(numero("N/A")).toBeNull();
  });

  it("un estudiante al día no alerta", () => {
    expect(evaluarEstudiantes([fila({})])[0].nivel).toBe(0);
  });

  it("promedio acumulado bajo", () => {
    expect(evaluarEstudiantes([fila({ promedio_acumulado: 3.0, promedio_semestre_ultimo_poligrafo: 3.0 })])[0].reglas).toEqual(["acumulado"]);
  });

  it("un acumulado en 0 es un estudiante nuevo, no uno con mal promedio", () => {
    const [a] = evaluarEstudiantes([fila({ promedio_acumulado: 0, promedio_semestre_ultimo_poligrafo: 0 })]);
    expect(a.reglas).toEqual([]);
  });

  it("caída del último polígrafo frente al acumulado", () => {
    expect(evaluarEstudiantes([fila({ promedio_acumulado: 4.2, promedio_semestre_ultimo_poligrafo: 3.7 })])[0].reglas).toEqual(["caida"]);
    expect(evaluarEstudiantes([fila({ promedio_acumulado: 4.2, promedio_semestre_ultimo_poligrafo: 3.9 })])[0].reglas).toEqual([]);
  });

  it("créditos aprobados contra los que corresponden a su ubicación", () => {
    expect(evaluarEstudiantes([fila({ cred_aprobados: 40, cred_segun_ubicacion: 60 })])[0].reglas).toEqual(["avance"]);
    expect(evaluarEstudiantes([fila({ cred_aprobados: 45, cred_segun_ubicacion: 60 })])[0].reglas).toEqual([]); // justo 75 %
    expect(evaluarEstudiantes([fila({ cred_aprobados: 0, cred_segun_ubicacion: 0 })])[0].reglas).toEqual([]);
  });

  it("tres reglas dan nivel crítico, y los umbrales se pueden cambiar", () => {
    const f = fila({ promedio_acumulado: 3.0, promedio_semestre_ultimo_poligrafo: 2.4, cred_aprobados: 20 });
    const [a] = evaluarEstudiantes([f]);
    expect(a.reglas).toHaveLength(3);
    expect(a.nivel).toBe(3);
    expect(evaluarEstudiantes([f], { ...UMBRALES_ESTUDIANTE, acumulado: 2.5 })[0].reglas).not.toContain("acumulado");
  });

  it("los datos faltantes no inventan alertas", () => {
    const [a] = evaluarEstudiantes([{ codigo: "x-9" }]);
    expect(a.reglas).toEqual([]);
    expect(contarNiveles([a]).porNivel).toEqual([1, 0, 0, 0]);
  });
});

describe("catálogo ↔ políticas de la base", () => {
  const leer = (f: string) => {
    const sql = readFileSync(resolve(__dirname, `../../supabase/migrations/${f}`), "utf8");
    return sql.slice(sql.indexOf("insert into public.wh_politicas"), sql.indexOf("on conflict (conjunto) do update"));
  };
  const bloque = ["0155_warehouse_udes.sql", "0156_warehouse_politicas_plataformas.sql", "0157_warehouse_notas_y_velocidad.sql"].map(leer).join("\n");
  const conPolitica = [...bloque.matchAll(/^\s*\('([a-z_]+)',\s*'(?:permitir|excluir)'/gm)].map((m) => m[1]);

  it("todo conjunto que se puede cargar tiene su política, y los que no, no", () => {
    for (const c of CONJUNTOS) {
      if (c.estado === "listo") expect(conPolitica, `falta la política de ${c.id}`).toContain(c.id);
      else expect(conPolitica, `${c.id} no debería tener política todavía`).not.toContain(c.id);
    }
  });

  it("no hay políticas de conjuntos que el catálogo no conoce", () => {
    const ids = new Set(CONJUNTOS.map((c) => c.id));
    for (const id of conPolitica) expect(ids.has(id), `${id} no está en el catálogo`).toBe(true);
  });

  it("los ids son únicos", () => {
    expect(new Set(CONJUNTOS.map((c) => c.id)).size).toBe(CONJUNTOS.length);
  });

  it("todo lo que la función sabe pedir está en el catálogo, y al revés", () => {
    const ids = new Set(CONJUNTOS.map((c) => c.id));
    for (const r of REPORTES) expect(ids.has(r.id), `${r.id} no está en el catálogo`).toBe(true);
    for (const c of CONJUNTOS.filter(pideSolo)) expect(REPORTES.some((r) => r.id === c.id)).toBe(true);
  });

  it("lo que se pide solo y no tiene política queda para sondear, nunca se guarda", () => {
    for (const c of CONJUNTOS.filter((x) => pideSolo(x) && x.estado !== "listo")) {
      expect(conPolitica, c.id).not.toContain(c.id);
    }
  });

  it("solo se carga por Excel lo que llega como Excel y tiene política", () => {
    for (const c of CONJUNTOS.filter(cargaPorArchivo)) expect(c.entrega).toBe("archivo");
  });

  it("lo que trae datos personales se guarda con lista de columnas permitidas", () => {
    for (const id of ["dv_matric", "dv_grad", "dv_homol", "ms_eval"]) {
      expect(bloque, id).toMatch(new RegExp(`\\('${id}',\\s*'permitir'`));
    }
    // Estas columnas jamás deben aparecer entre las permitidas de matriculados.
    const lista = bloque.match(/\('dv_matric',\s*'permitir',\s*'\{([^}]*)\}'/)![1].split(",");
    for (const prohibida of ["tipo_id", "identificacion", "nombres", "apellidos", "genero", "fecha_nac", "ciudad", "direccion", "barrio", "telefono", "celular", "email", "email_institucional", "colegio", "salud", "responsable_matricula"]) {
      expect(lista, `dv_matric permite ${prohibida}`).not.toContain(prohibida);
    }
  });

  it("los periodos disponibles van de 2018b al semestre en curso", () => {
    expect(periodosDisponibles(new Date(2026, 9, 15))[0]).toBe("2026b");
    expect(periodosDisponibles(new Date(2026, 2, 1))[0]).toBe("2026a");
    expect(periodosDisponibles(new Date(2026, 9, 15)).at(-1)).toBe("2018b");
    expect(periodosDisponibles(new Date(2026, 9, 15))).toHaveLength(17);
  });
});

describe("alertas por notas de cada estudiante", () => {
  const r = (o: Partial<ResumenNotas>): ResumenNotas => ({
    estudiante: "x-1",
    programa: "DERECHO",
    materias: 6,
    con_p1: 6,
    con_p2: 0,
    con_p3: 0,
    prom_p1: 4,
    prom_p2: null,
    prom_p3: null,
    riesgo_p1: 0,
    riesgo_p2: 0,
    riesgo_p3: 0,
    ...o,
  });

  it("un estudiante al día no alerta", () => {
    const [a] = evaluarNotas([r({})]);
    expect(a.nivel).toBe(0);
    expect(a.corte).toBe(1);
  });

  it("evalúa el último corte con notas, no uno con tres notas sueltas", () => {
    const [a] = evaluarNotas([r({ con_p2: 1, prom_p2: 1.0, riesgo_p2: 1 })]);
    expect(a.corte).toBe(1); // P2 apenas tiene 1 de 6 notas
    const [b] = evaluarNotas([r({ con_p2: 5, prom_p2: 2.8, riesgo_p2: 3 })]);
    expect(b.corte).toBe(2);
    expect(b.reglas).toContain("materias");
  });

  it("materias perdidas, promedio bajo y caída suman niveles", () => {
    const [a] = evaluarNotas([r({ con_p2: 6, prom_p1: 4.2, prom_p2: 2.9, riesgo_p2: 3 })]);
    expect(a.reglas.sort()).toEqual(["caida", "materias", "promedio"]);
    expect(a.nivel).toBe(3);
    expect(a.anterior).toBe(4.2);
  });

  it("la caída necesita dos cortes con notas", () => {
    expect(evaluarNotas([r({ prom_p1: 3.0 })])[0].reglas).toEqual(["promedio"]);
  });

  it("sin ninguna nota todavía no se evalúa ni alerta", () => {
    const [a] = evaluarNotas([r({ con_p1: 0, prom_p1: null })]);
    expect(a.corte).toBeNull();
    expect(a.reglas).toEqual([]);
  });

  it("los umbrales se pueden cambiar", () => {
    const x = r({ con_p2: 6, prom_p1: 3.6, prom_p2: 3.1, riesgo_p2: 1 });
    expect(evaluarNotas([x])[0].reglas.sort()).toEqual(["caida", "promedio"]);
    expect(evaluarNotas([x], { ...UMBRALES_NOTAS, promedio: 3.0, caida: 0.6 })[0].reglas).toEqual([]);
  });
});
