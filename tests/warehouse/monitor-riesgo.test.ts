/* 0161 · lógica del mapa de riesgo: clave de grupo, plan, agregados por corte y curso, histograma. */

import { describe, expect, it } from "vitest";
import { buscarCodigos, claveGrupo, cursosDe, filasDelCorte, gruposDeRiesgo, histogramaDe, indicadoresDe, nivelDeTasa, partirClave, pareceSeudonimo, planDe, tasaPorCorte, type FilaRiesgo } from "../../src/modules/monitor/logica";

const r = (o: Partial<FilaRiesgo>): FilaRiesgo => ({ codigo_programa: "011", programa: "A", codigo_materia: "SIS101", materia: "PROGRAMACIÓN", grupo: "A", grupo_clave: "SIS101~A", plan: "tres_cortes", corte: 1, con: 10, bajo: 3, promedio: 3.2, ...o });

describe("clave de grupo: código de materia + letra", () => {
  it("se arma y se parte sin ambigüedad, aunque el código traiga guiones", () => {
    expect(claveGrupo(" SIS101 ", " a ")).toBe("SIS101~A");
    expect(partirClave("SIS101~A")).toEqual({ codigo_materia: "SIS101", grupo: "A" });
    expect(partirClave("MAT-20~b")).toEqual({ codigo_materia: "MAT-20", grupo: "B" });
    expect(partirClave("SIS101")).toBeNull();
    expect(partirClave("~A")).toBeNull();
    expect(partirClave("SIS101~")).toBeNull();
  });
});

describe("plan del grupo", () => {
  it("se normaliza; vacío o desconocido = tres cortes", () => {
    expect(planDe("TRES CORTES")).toBe("tres_cortes");
    expect(planDe("ÚNICA")).toBe("unica");
    expect(planDe("Unica")).toBe("unica");
    expect(planDe("FORMACIÓN PERMANENTE")).toBe("permanente");
    expect(planDe(null)).toBe("tres_cortes");
    expect(planDe("")).toBe("tres_cortes");
    expect(planDe("otra cosa")).toBe("tres_cortes");
  });

  it("P1, P2 y P3 usan solo grupos de tres cortes; la nota final, todos los planes si se elige", () => {
    const filas = [r({}), r({ plan: "unica", grupo_clave: "SIS101~B", grupo: "B" }), r({ corte: 4, plan: "unica", grupo_clave: "SIS101~B", grupo: "B" }), r({ corte: 4, plan: "permanente", grupo_clave: "SIS200~A", codigo_materia: "SIS200" }), r({ corte: 4 })];
    expect(filasDelCorte(filas, 1).map((x) => x.grupo_clave)).toEqual(["SIS101~A"]);
    expect(filasDelCorte(filas, 4, "tres").map((x) => x.plan)).toEqual(["tres_cortes"]);
    expect(filasDelCorte(filas, 4, "todos").map((x) => x.plan).sort()).toEqual(["permanente", "tres_cortes", "unica"]);
  });
});

describe("mapa de riesgo", () => {
  const filas = [
    r({ corte: 1, con: 20, bajo: 4 }),
    r({ corte: 2, con: 20, bajo: 8 }),
    r({ corte: 3, con: 20, bajo: 12 }),
    r({ codigo_programa: "012", codigo_materia: "FIS1", materia: "FÍSICA", grupo: "A", grupo_clave: "FIS1~A", corte: 3, con: 10, bajo: 6 }),
    r({ codigo_materia: "ETI1", materia: "ÉTICA", grupo: "A", grupo_clave: "ETI1~A", corte: 3, con: 3, bajo: 3 }), // menos de 5: sin detalle
    r({ plan: "unica", grupo: "B", grupo_clave: "SIS101~B", corte: 4, con: 8, bajo: 2 }),
  ];

  it("la tasa por corte respeta la regla del plan", () => {
    expect(tasaPorCorte(filas, "tres").map((p) => `${p.corte}:${p.tasa}`)).toEqual(["1:20", "2:40", "3:63.6"]);
    expect(tasaPorCorte(filas, "todos").map((p) => `${p.corte}:${p.tasa}`)).toEqual(["1:20", "2:40", "3:63.6", "4:25"]); // el final suma el plan única
  });

  it("los indicadores: tasa, matrículas reprobadas, cursos, críticos, programas y detalle", () => {
    const i = indicadoresDe(filasDelCorte(filas, 3));
    expect(i).toMatchObject({ matriculas: 33, reprobadas: 21, cursos: 3, cursosConReprobacion: 3, cursosDetalle: 2, cursosCriticos: 2, programasConCritico: 2 });
    expect(i.tasa).toBeCloseTo(63.6, 1);
  });

  it("los cursos y los grupos se agrupan por código y por código + letra", () => {
    const c = cursosDe(filasDelCorte(filas, 3));
    expect(c.map((x) => x.codigo_materia)).toEqual(["ETI1", "SIS101", "FIS1"].sort((a, b) => c.findIndex((y) => y.codigo_materia === a) - c.findIndex((y) => y.codigo_materia === b)));
    expect(c.find((x) => x.codigo_materia === "SIS101")).toMatchObject({ con: 20, bajo: 12, tasa: 60, grupos: 1, nivel: "RS" });
    const g = gruposDeRiesgo(filasDelCorte(filas, 3));
    expect(g.map((x) => x.clave).sort()).toEqual(["ETI1~A", "FIS1~A", "SIS101~A"]);
  });

  it("el histograma cuenta solo cursos con detalle, por tramos de 10 puntos", () => {
    const h = histogramaDe(cursosDe(filasDelCorte(filas, 3)));
    expect(h.map((t) => t.cursos)).toEqual([0, 0, 0, 0, 0, 2]); // 60 % y 60 %; el de 3 matrículas no cuenta
    expect(h[5]).toMatchObject({ etiqueta: "50 o más", nivel: "RS" });
    expect(nivelDeTasa(29.9)).toBe("NE");
    expect(nivelDeTasa(30)).toBe("ED");
    expect(nivelDeTasa(50)).toBe("RS");
  });
});

describe("código del estudiante", () => {
  it("reconoce los seudónimos de cargas anteriores y busca por código", () => {
    expect(pareceSeudonimo("x-0a1b2c3d4e")).toBe(true);
    expect(pareceSeudonimo("01251152003")).toBe(false);
    const lista = [{ estudiante: "01251152003" }, { estudiante: "01240371001" }, { estudiante: "9901251" }];
    expect(buscarCodigos(lista, "0125").map((x) => x.estudiante)).toEqual(["01251152003", "9901251"]);
    expect(buscarCodigos(lista, "0")).toEqual([]); // menos de dos caracteres no busca
  });
});
