import { describe, expect, it } from "vitest";
import { barrasPorHora, hayUso, lecturaDeHora, paradasDeRuta, rutasMasUsadas, type UsoHora, type UsoParada } from "./uso";

const HORAS: UsoHora[] = [
  { hora: 6, promedio: 40, abordajes: 400 },
  { hora: 7, promedio: 90, abordajes: 900 },
  { hora: 12, promedio: 45, abordajes: 450 },
  { hora: 15, promedio: 20, abordajes: 200 },
  { hora: 23, promedio: 500, abordajes: 5000 }, // fuera del rango del gráfico
];

describe("barras por hora", () => {
  it("van de las 5 a las 22 y se escalan contra el pico del rango", () => {
    const { barras, pico } = barrasPorHora(HORAS);
    expect(barras).toHaveLength(18);
    expect(barras[0].hora).toBe(5);
    expect(barras[17].hora).toBe(22);
    expect(pico?.hora).toBe(7);
    expect(barras.find((b) => b.hora === 7)?.alto).toBe(1);
    expect(barras.find((b) => b.hora === 6)?.alto).toBeCloseTo(40 / 90, 6);
  });

  it("una hora sin conteos es un vacío, no un cero", () => {
    const b = barrasPorHora(HORAS).barras.find((x) => x.hora === 9)!;
    expect(b.promedio).toBeNull();
  });

  it("sin horas no hay pico", () => {
    expect(barrasPorHora([]).pico).toBeNull();
  });
});

describe("lectura en palabras", () => {
  it("compara con el pico de la propia ruta", () => {
    expect(lecturaDeHora(HORAS, 7).nivel).toBe("concurrido");
    expect(lecturaDeHora(HORAS, 12).nivel).toBe("moderado"); // 45/90 = 0,5
    expect(lecturaDeHora(HORAS, 15).nivel).toBe("tranquilo"); // 20/90 = 0,22
    expect(lecturaDeHora(HORAS, 6).nivel).toBe("moderado"); // 0,44
  });

  it("los umbrales son un tercio y dos tercios del pico", () => {
    const h: UsoHora[] = [
      { hora: 8, promedio: 90, abordajes: 90 },
      { hora: 9, promedio: 60, abordajes: 60 },
      { hora: 10, promedio: 30, abordajes: 30 },
      { hora: 11, promedio: 29, abordajes: 29 },
    ];
    expect(lecturaDeHora(h, 9).nivel).toBe("concurrido"); // justo 2/3
    expect(lecturaDeHora(h, 10).nivel).toBe("moderado"); // justo 1/3
    expect(lecturaDeHora(h, 11).nivel).toBe("tranquilo");
  });

  it("sin dato en esa hora no inventa una lectura", () => {
    expect(lecturaDeHora(HORAS, 9)).toEqual({ nivel: null, proporcion: null });
    expect(lecturaDeHora([], 9).nivel).toBeNull();
    expect(lecturaDeHora(HORAS, 23).nivel).toBeNull();
  });
});

describe("paradas y rutas", () => {
  const P = (routeId: string, seq: number, abordajes: number): UsoParada => ({ routeId, stopId: `${routeId}-${seq}`, seq, nombre: `P${seq}`, abordajes, participacion: 0 });
  const paradas = [P("a", 1, 50), P("a", 2, 80), P("b", 1, 120), P("a", 3, 80)];

  it("ordena las de una ruta de la más a la menos usada, y a igualdad por posición", () => {
    expect(paradasDeRuta(paradas, "a").map((p) => p.seq)).toEqual([2, 3, 1]);
  });

  it("suma por ruta y ordena", () => {
    const r = rutasMasUsadas(paradas, new Map([["a", { codigo: "R1", nombre: "Campus" }]]));
    expect(r.map((x) => [x.routeId, x.abordajes])).toEqual([
      ["a", 210],
      ["b", 120],
    ]);
    expect(r[0].codigo).toBe("R1");
    expect(r[1].nombre).toBe("Ruta");
  });

  it("sabe si hay algo que mostrar", () => {
    expect(hayUso(null)).toBe(false);
    expect(hayUso(undefined)).toBe(false);
    expect(hayUso({ dias: 30, total: 0, horas: [], paradas: [], rutas: [] })).toBe(false);
    expect(hayUso({ dias: 30, total: 99, horas: HORAS, paradas: [], rutas: [] })).toBe(true);
  });
});
