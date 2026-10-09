import { describe, expect, it } from "vitest";
import {
  DIA_S,
  aCampoHora,
  aMinutos,
  busesEnRuta,
  construirPerfil,
  estadoServicio,
  formatoEspera,
  formatoHora,
  horarioSeguro,
  posicionBus,
  proximasLlegadas,
  salidas,
  segundosDelDia,
  type Horario,
} from "./horario";

const H: Horario = { primeraMin: 5 * 60 + 30, ultimaMin: 21 * 60, intervaloMin: 15, paradaCampusMin: 5 };
// Cuatro paradas: la UDES, dos intermedias y el regreso. Mil metros por tramo, 10 minutos de conducción.
const LEGS = [1000, 1000, 1000];
const P = construirPerfil(LEGS, 600 / 1.15, 20);

describe("horario", () => {
  it("lee las horas de la base", () => {
    expect(aMinutos("05:30")).toBe(330);
    expect(aMinutos("21:00:00")).toBe(1260);
    expect(() => aMinutos("tarde")).toThrow();
  });

  it("acota un horario sin sentido", () => {
    const h = horarioSeguro({ primeraMin: 600, ultimaMin: 300, intervaloMin: 1, paradaCampusMin: 99 });
    expect(h.ultimaMin).toBeGreaterThanOrEqual(h.primeraMin);
    expect(h.intervaloMin).toBe(3);
    expect(h.paradaCampusMin).toBe(30);
  });

  it("las salidas van de la primera a la última cada intervalo", () => {
    const s = salidas(H);
    expect(s[0]).toBe(5.5 * 3600);
    expect(s[1] - s[0]).toBe(15 * 60);
    expect(s[s.length - 1]).toBe(21 * 3600);
    expect(s).toHaveLength(63);
  });

  it("la hora de Bogotá es UTC-5 y no cambia en el año", () => {
    expect(segundosDelDia(Date.UTC(2026, 9, 9, 12, 30, 0))).toBe(7.5 * 3600);
    expect(segundosDelDia(Date.UTC(2026, 0, 1, 3, 0, 0))).toBe(22 * 3600);
  });

  it("escribe las horas como se dicen en Colombia", () => {
    expect(formatoHora(5.5 * 3600)).toBe("5:30 a. m.");
    expect(formatoHora(12 * 3600)).toBe("12:00 m.");
    expect(formatoHora(12.25 * 3600)).toBe("12:15 p. m.");
    expect(formatoHora(21 * 3600)).toBe("9:00 p. m.");
    expect(formatoHora(0)).toBe("12:00 a. m.");
    expect(aCampoHora(7.75 * 3600)).toBe("07:45");
  });

  it("dice cuánto falta", () => {
    expect(formatoEspera(10)).toBe("ahora");
    expect(formatoEspera(45)).toBe("en menos de 1 min");
    expect(formatoEspera(6 * 60 - 20)).toBe("en 6 min");
    expect(formatoEspera(65 * 60)).toBe("en 1 h 05 min");
  });
});

describe("perfil del recorrido", () => {
  it("el bus parte en 0, descansa en las intermedias y termina en la UDES", () => {
    expect(P.llega[0]).toBe(0);
    expect(P.sale[0]).toBe(0);
    expect(P.sale[1] - P.llega[1]).toBe(20);
    expect(P.sale[3]).toBe(P.llega[3]);
    expect(P.total).toBe(P.llega[3]);
    expect(P.frac).toEqual([0, 1 / 3, 2 / 3, 1]);
    // 10 minutos de carro más 15 %, más dos descansos de 20 s.
    expect(P.total).toBeCloseTo(600 + 40, 5);
  });

  it("sin duración calculada usa una velocidad razonable", () => {
    const p = construirPerfil([3000, 3000], null);
    expect(p.total).toBeGreaterThan(600);
    expect(p.total).toBeLessThan(1500);
  });
});

describe("posición simulada de los buses", () => {
  it("no hay bus antes de salir ni después de terminar", () => {
    expect(posicionBus(P, -1)).toBeNull();
    expect(posicionBus(P, P.total + 1)).toBeNull();
  });

  it("al salir está en la UDES y en la mitad del primer tramo va entre paradas", () => {
    expect(posicionBus(P, 0)).toMatchObject({ frac: 0, estado: "parada", parada: 0 });
    const medio = posicionBus(P, (P.llega[1] + P.sale[0]) / 2)!;
    expect(medio.estado).toBe("marcha");
    expect(medio.frac).toBeCloseTo(1 / 6, 5);
    expect(medio.parada).toBe(1);
  });

  it("se detiene en cada parada intermedia durante su descanso", () => {
    const a = posicionBus(P, P.llega[1] + 5)!;
    expect(a).toMatchObject({ estado: "parada", parada: 1 });
    expect(a.frac).toBeCloseTo(1 / 3, 6);
  });

  it("avanza siempre hacia adelante", () => {
    let previo = -1;
    for (let e = 0; e <= P.total; e += 3) {
      const p = posicionBus(P, e)!;
      expect(p.frac).toBeGreaterThanOrEqual(previo - 1e-9);
      previo = p.frac;
    }
  });

  it("es función de la hora: la misma hora da el mismo lugar, sin importar el estado", () => {
    const t = 7 * 3600 + 20 * 60;
    expect(busesEnRuta(H, P, t)).toEqual(busesEnRuta(H, P, t));
  });

  it("a las 7:20 hay buses en el recorrido y a las 4 de la mañana ninguno", () => {
    const buses = busesEnRuta(H, P, 7 * 3600 + 20 * 60);
    expect(buses.length).toBeGreaterThan(0);
    expect(buses.length).toBeLessThanOrEqual(Math.ceil(P.total / (15 * 60)));
    expect(busesEnRuta(H, P, 4 * 3600)).toHaveLength(0);
  });

  it("al volver a la UDES el bus sale del mapa", () => {
    const llegada = 5.5 * 3600 + P.total;
    expect(busesEnRuta({ ...H, ultimaMin: H.primeraMin }, P, llegada)).toHaveLength(0);
  });
});

describe("próximo bus", () => {
  it("la próxima salida desde la UDES es la siguiente a la hora actual", () => {
    expect(proximasLlegadas(H, P, 0, 7 * 3600 + 20 * 60, 3)).toEqual([7 * 3600 + 30 * 60, 7 * 3600 + 45 * 60, 8 * 3600]);
  });

  it("en una parada suma lo que tarda el bus en llegar", () => {
    const [primera] = proximasLlegadas(H, P, 2, 7 * 3600 + 20 * 60, 1);
    // La salida de las 7:15 llega a la parada 2 pasadas las 7:22, o sea después de las 7:20.
    expect(primera).toBe(7.25 * 3600 + P.llega[2]);
    expect(primera).toBeGreaterThanOrEqual(7 * 3600 + 20 * 60);
  });

  it("si el bus está detenido en la parada ahora mismo, todavía cuenta", () => {
    const t = 7.5 * 3600 + P.llega[1] + 5;
    expect(proximasLlegadas(H, P, 1, t, 1)[0]).toBe(7.5 * 3600 + P.llega[1]);
  });

  it("pasada la última salida, sigue con las de mañana", () => {
    const [m] = proximasLlegadas(H, P, 0, 22 * 3600, 1);
    expect(m).toBe(DIA_S + 5.5 * 3600);
    const [antes] = proximasLlegadas(H, P, 0, 3 * 3600, 1);
    expect(antes).toBe(5.5 * 3600);
  });

  it("dice si hay servicio", () => {
    expect(estadoServicio(H, P, 4 * 3600)).toBe("antes");
    expect(estadoServicio(H, P, 12 * 3600)).toBe("servicio");
    expect(estadoServicio(H, P, 21 * 3600 + P.total + 60)).toBe("despues");
  });
});
