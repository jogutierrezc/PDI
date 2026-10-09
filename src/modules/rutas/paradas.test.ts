import { describe, expect, it } from "vitest";
import { leerParadas, paradasDelRecorrido } from "./paradas";

const tres = "UDES; 7,10524; -73,09510\nParada B; 7,1086; -73,09823\nParada C; 7,1070; -73,1010";

describe("leer las paradas pegadas", () => {
  it("acepta coma decimal y punto y coma", () => {
    const r = leerParadas(tres);
    expect(r.error).toBeNull();
    expect(r.paradas).toHaveLength(3);
    expect(r.paradas[0]).toEqual({ name: "UDES", lat: 7.10524, lon: -73.0951 });
  });
  it("avisa en qué línea falla", () => {
    expect(leerParadas("UDES; 7,1; -73,1\nsolo nombre").error).toMatch(/Línea 2/);
    expect(leerParadas("UDES; abc; -73,1\nB; 7,1; -73,1").error).toMatch(/Línea 1.*números/);
  });
  it("detecta latitud y longitud invertidas", () => {
    expect(leerParadas("UDES; -73,1; 7,1\nB; 7,1; -73,1").error).toMatch(/fuera de Colombia/);
  });
  it("pide al menos dos paradas", () => {
    expect(leerParadas("UDES; 7,1; -73,1").error).toMatch(/al menos dos/);
  });
});

describe("el recorrido siempre cierra donde empezó", () => {
  const { paradas } = leerParadas(tres);
  it("directo: vuelve a la primera parada", () => {
    const r = paradasDelRecorrido(paradas, "directo");
    expect(r.map((p) => p.name)).toEqual(["UDES", "Parada B", "Parada C", "UDES"]);
  });
  it("mismas paradas: ida y vuelta, y cierra en la UDES", () => {
    const r = paradasDelRecorrido(paradas, "mismas");
    expect(r.map((p) => p.name)).toEqual(["UDES", "Parada B", "Parada C", "Parada B (regreso)", "UDES"]);
    expect(r[r.length - 1]).toEqual(r[0]);
  });
});
