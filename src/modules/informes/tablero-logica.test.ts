import { describe, expect, it } from "vitest";
import { filtrarEntrega, iniciales, normalizar, permitidasDe, plantillaInicial, resumirEntrega, SIN_FILTROS, tiposDe } from "./tablero-logica";
import type { FilaEntrega } from "./tablero-logica";

const f = (o: Partial<FilaEntrega>): FilaEntrega => ({ clave: "k", unitId: "u", nombre: "Unidad", tipo: "facultad", estado: "none", hechas: 0, total: 10, conEvidencias: false, ...o });
const filas = [
  f({ clave: "1", nombre: "Facultad de Ingeniería", estado: "draft", hechas: 5 }),
  f({ clave: "2", nombre: "Decanatura de Salud", tipo: "decanatura", estado: "ok", hechas: 10, conEvidencias: true }),
  f({ clave: "3", nombre: "Planeación Institucional", tipo: "oficina" }),
];

describe("resumirEntrega", () => {
  it("cuenta por estado, abiertos, avance y evidencias", () => {
    const r = resumirEntrega(filas);
    expect(r.total).toBe(3);
    expect(r.abiertos).toBe(2);
    expect(r.porEstado).toMatchObject({ none: 1, draft: 1, ok: 1, sent: 0, back: 0 });
    expect(r.avance).toBeCloseTo(15 / 30);
    expect(r.conEvidencias).toBe(1);
  });
  it("sin filas no divide por cero", () => expect(resumirEntrega([]).avance).toBe(0));
});

describe("filtrarEntrega", () => {
  it("sin filtros devuelve todo", () => expect(filtrarEntrega(filas, SIN_FILTROS)).toHaveLength(3));
  it("por estado y tipo", () => {
    expect(filtrarEntrega(filas, { ...SIN_FILTROS, estado: "ok" }).map((x) => x.clave)).toEqual(["2"]);
    expect(filtrarEntrega(filas, { ...SIN_FILTROS, tipo: "oficina" }).map((x) => x.clave)).toEqual(["3"]);
  });
  it("busca sin tildes ni mayúsculas", () => {
    expect(filtrarEntrega(filas, { ...SIN_FILTROS, texto: "  ingenieria " }).map((x) => x.clave)).toEqual(["1"]);
    expect(filtrarEntrega(filas, { ...SIN_FILTROS, texto: "PLANEACION" }).map((x) => x.clave)).toEqual(["3"]);
  });
  it("combina filtros", () => expect(filtrarEntrega(filas, { estado: "draft", tipo: "decanatura", texto: "" })).toHaveLength(0));
  it("tiposDe sin repetir", () => expect(tiposDe(filas)).toEqual(["decanatura", "facultad", "oficina"]));
});

describe("plantillaInicial", () => {
  const pu = [{ plantilla: "X1", unit_id: "plan" }];
  it("respeta lo elegido si se puede usar", () => expect(plantillaInicial("u", "facultad", "F", ["A", "B"], [], "B")).toBe("B"));
  it("ignora lo elegido si ya no se permite", () => expect(plantillaInicial("u", "facultad", "F", ["A"], [], "B")).toBe("A"));
  it("prefiere la plantilla limitada a la oficina", () => expect(plantillaInicial("plan", "oficina", "Planeación", ["B", "X1"], pu)).toBe("X1"));
  it("sugiere por tipo y cae a la primera permitida", () => {
    expect(plantillaInicial("u", "facultad", "F", ["A", "B"], [])).toBe("A");
    expect(plantillaInicial("u", "oficina", "Oficina", ["C", "D"], [])).toBe("C");
  });
  it("permitidasDe filtra las limitadas", () => expect(permitidasDe(pu, "otra", ["A", "X1"])).toEqual(["A"]));
});

describe("texto", () => {
  it("normaliza", () => expect(normalizar("  Ñandú Él ")).toBe("nandu el"));
  it("iniciales", () => {
    expect(iniciales("Ana María Pérez")).toBe("AP");
    expect(iniciales("", "juan.lopez@udes.edu.co")).toBe("JL");
  });
});
