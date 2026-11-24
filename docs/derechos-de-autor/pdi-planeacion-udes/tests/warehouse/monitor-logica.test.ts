/* Lógica del Monitor de alertas tempranas (src/modules/monitor/logica.ts): clasificación NE · ED · RS,
   agregación por facultad y programa, grupos, cursos críticos y el resumen para Pilo. */

import { describe, expect, it } from "vitest";
import {
  UMBRALES_MONITOR,
  agregar,
  clasificar,
  cortesConNotas,
  criticas,
  nivelDeGrupo,
  nivelDeNota,
  nodosDeGrupos,
  porFacultad,
  resumenParaPilo,
  type FilaMonitor,
  type GrupoMonitor,
  type Programa,
} from "../../src/modules/monitor/logica";

const fila = (o: Partial<FilaMonitor> = {}): FilaMonitor => ({
  estudiante: "x-1",
  codigo_programa: "011",
  programa: "DERECHO",
  materias: 6,
  con_p1: 6,
  con_p2: 0,
  con_p3: 0,
  prom_p1: 4.0,
  prom_p2: null,
  prom_p3: null,
  riesgo_p1: 0,
  riesgo_p2: 0,
  riesgo_p3: 0,
  ...o,
});

const programas: Programa[] = [
  { codigo_programa: "011", nombre: "Derecho", unit_id: "u1", unidad: "Derecho", facultad_id: "f1", facultad: "Facultad de Derecho" },
  { codigo_programa: "012", nombre: "Psicología", unit_id: "u2", unidad: "Psicología", facultad_id: "f1", facultad: "Facultad de Derecho" },
  { codigo_programa: "021", nombre: "Medicina", unit_id: "u3", unidad: "Medicina", facultad_id: "f2", facultad: "Facultad de Salud" },
  { codigo_programa: "099", nombre: "Sin unidad", unit_id: null, unidad: null, facultad_id: null, facultad: null },
];

describe("clasificar: NE · ED · RS", () => {
  it("NE con promedio de 3,5 o más y ninguna materia perdida", () => {
    expect(clasificar(fila({ prom_p1: 3.5 }), 1)?.nivel).toBe("NE");
    expect(clasificar(fila({ prom_p1: 4.6 }), 1)?.nivel).toBe("NE");
  });

  it("ED entre 3,0 y 3,49, o con una materia perdida", () => {
    expect(clasificar(fila({ prom_p1: 3.49 }), 1)?.nivel).toBe("ED");
    expect(clasificar(fila({ prom_p1: 3.0 }), 1)?.nivel).toBe("ED");
    expect(clasificar(fila({ prom_p1: 4.2, riesgo_p1: 1 }), 1)?.nivel).toBe("ED");
  });

  it("RS con promedio bajo 3,0, dos o más materias perdidas o una caída de 0,5", () => {
    expect(clasificar(fila({ prom_p1: 2.99 }), 1)?.nivel).toBe("RS");
    expect(clasificar(fila({ prom_p1: 4.2, riesgo_p1: 2 }), 1)?.nivel).toBe("RS");
    const c = clasificar(fila({ con_p2: 6, prom_p1: 4.2, prom_p2: 3.7 }), 2);
    expect(c?.nivel).toBe("RS");
    expect(c?.caida).toBe(0.5);
    expect(clasificar(fila({ con_p2: 6, prom_p1: 4.2, prom_p2: 3.8 }), 2)?.nivel).toBe("NE");
  });

  it("sin notas suficientes en el corte no se clasifica", () => {
    expect(clasificar(fila({ con_p2: 2, prom_p2: 1.0 }), 2)).toBeNull(); // 2 de 6 materias
    expect(clasificar(fila({ con_p1: 0, prom_p1: null }), 1)).toBeNull();
    expect(clasificar(fila(), 3)).toBeNull();
  });

  it("la caída se mide contra el último corte anterior que sí tuvo notas", () => {
    expect(clasificar(fila({ con_p3: 6, prom_p1: 4.4, prom_p3: 3.8 }), 3)?.caida).toBe(0.6);
  });

  it("los umbrales se pueden cambiar", () => {
    expect(clasificar(fila({ prom_p1: 3.4 }), 1, { ...UMBRALES_MONITOR, ne: 3.3 })?.nivel).toBe("NE");
    expect(clasificar(fila({ prom_p1: 4.2, riesgo_p1: 2 }), 1, { ...UMBRALES_MONITOR, perdidas: 3 })?.nivel).toBe("ED");
  });

  it("los cortes con notas", () => {
    expect(cortesConNotas([fila(), fila({ con_p2: 6, prom_p2: 3.9 })])).toEqual([1, 2]);
    expect(cortesConNotas([])).toEqual([]);
  });
});

describe("agregar y jerarquía", () => {
  const filas = [
    fila({ estudiante: "a", codigo_programa: "011", prom_p1: 4.2 }),
    fila({ estudiante: "b", codigo_programa: "011", prom_p1: 3.2 }),
    fila({ estudiante: "c", codigo_programa: "012", prom_p1: 2.5, riesgo_p1: 3 }),
    fila({ estudiante: "d", codigo_programa: "021", prom_p1: 3.9 }),
    fila({ estudiante: "e", codigo_programa: "099", prom_p1: 2.7 }),
    fila({ estudiante: "f", codigo_programa: "021", con_p1: 0, prom_p1: null }), // aún sin notas
  ];

  it("cuenta los niveles y calcula el promedio solo de los clasificados", () => {
    const n = agregar("todo", "Institución", filas, 1);
    expect(n).toMatchObject({ estudiantes: 5, NE: 2, ED: 1, RS: 2 });
    expect(n.pctRS).toBe(40);
    expect(n.promedio).toBeCloseTo(3.3, 1);
    expect(n.serie).toHaveLength(1);
  });

  it("por facultad: junta los programas, deja aparte los sin facultad y ordena por % en RS", () => {
    const fs = porFacultad(filas, programas, 1);
    expect(fs.map((x) => x.nombre)).toEqual(["Sin facultad asignada", "Facultad de Derecho", "Facultad de Salud"]);
    const derecho = fs.find((x) => x.clave === "f1")!;
    expect(derecho.estudiantes).toBe(3);
    expect(derecho.programas.map((p) => p.nombre).sort()).toEqual(["Derecho", "Psicología"]);
    expect(derecho.RS).toBe(1);
  });

  it("la evolución cuenta cada corte con sus estudiantes", () => {
    const dos = [fila({ con_p2: 6, prom_p1: 3.6, prom_p2: 2.8 }), fila({ estudiante: "y", con_p2: 6, prom_p1: 4.0, prom_p2: 4.0 })];
    const n = agregar("x", "x", dos, 2);
    expect(n.serie.map((s) => s.corte)).toEqual([1, 2]);
    expect(n.serie[0].pctRS).toBe(0);
    expect(n.serie[1].pctRS).toBe(50);
  });
});

describe("grupos y cursos críticos", () => {
  const g = (o: Partial<GrupoMonitor> = {}): GrupoMonitor => ({ codigo_programa: "011", codigo_materia: "1", materia: "CÁLCULO I", grupo: "A", estudiantes: 30, con_p1: 30, con_p2: 0, con_p3: 0, prom_p1: 3.1, prom_p2: null, prom_p3: null, bajo_p1: 12, bajo_p2: 0, bajo_p3: 0, ...o });

  it("el nivel de un grupo sale del % bajo la de aprobar", () => {
    expect(nivelDeGrupo(29.9)).toBe("ED");
    expect(nivelDeGrupo(30)).toBe("RS");
    expect(nivelDeGrupo(15)).toBe("ED");
    expect(nivelDeGrupo(14.9)).toBe("NE");
  });

  it("nodosDeGrupos usa el corte y deja fuera los grupos sin notas", () => {
    const n = nodosDeGrupos([g(), g({ grupo: "B", con_p1: 0, bajo_p1: 0, prom_p1: null })], 1);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ grupo: "A", pctBajo: 40, nivel: "RS", estudiantes: 30 });
    expect(nodosDeGrupos([g()], 2)).toEqual([]);
  });

  it("cursos con alta reprobación, con el nombre del programa", () => {
    const c = criticas([g(), g({ grupo: "B", bajo_p1: 6 })], programas);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ materia: "CÁLCULO I", grupos: 2, pctBajo: 30, programas: ["Derecho"] });
  });

  it("una nota suelta: aprobar es 3,0 y bajo 3,5 va en desarrollo", () => {
    expect(nivelDeNota(2.9)).toBe("RS");
    expect(nivelDeNota(3.0)).toBe("ED");
    expect(nivelDeNota(3.5)).toBe("NE");
    expect(nivelDeNota(null)).toBeNull();
  });
});

describe("el resumen que recibe Pilo", () => {
  it("lleva conteos, programas y materias, y nunca códigos de estudiante", () => {
    const filas = [fila({ estudiante: "x-secreto-1" }), fila({ estudiante: "x-secreto-2", prom_p1: 2.5, riesgo_p1: 3 })];
    const nodo = agregar("todo", "Institución", filas, 1);
    const r = resumenParaPilo(nodo, [], [], { periodo: "2026b", sede: "buc", corte: 1, alcance: { nivel: "institucion" }, umbrales: UMBRALES_MONITOR })!;
    expect(r.totales).toEqual({ estudiantes: 2, NE: 1, ED: 0, RS: 1 });
    expect(JSON.stringify(r)).not.toContain("secreto");
    expect(r.umbrales).toMatchObject({ ne: 3.5, rs: 3.0 });
  });

  it("sin estudiantes clasificados no hay resumen", () => {
    expect(resumenParaPilo(agregar("x", "x", [], 1), [], [], { periodo: "2026b", sede: "buc", corte: 1, alcance: { nivel: "institucion" }, umbrales: UMBRALES_MONITOR })).toBeNull();
  });
});
