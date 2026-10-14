import { describe, expect, it } from "vitest";
import { actorDe, motivosNoEnviar, nombreRol, relevanciaDe, type DatosEnvio } from "./envio";

const base: DatosEnvio = {
  tipo: "ev",
  siNo: true,
  valores: {},
  campos: [],
  evidencias: 1,
  riesgos: 0,
  comentario: "",
  traduccionAlDia: true,
  estado: "draft",
  actor: "jefe",
};

describe("actorDe", () => {
  it("Planeación gana siempre, aunque no tenga pertenencia", () => {
    expect(actorDe(true, [], "U1")).toBe("planeacion");
  });
  it("si no, el papel de su pertenencia a esa oficina", () => {
    const m = [{ unidad: "U1", rol: "editor" as const, nombre: "Talento" }];
    expect(actorDe(false, m, "U1")).toBe("editor");
    expect(actorDe(false, m, "U2")).toBeNull();
  });
});

describe("nombreRol", () => {
  it("usa los nombres de las funciones de Mis Tableros", () => {
    expect([nombreRol("jefe"), nombreRol("editor"), nombreRol("visor")]).toEqual(["Gestor", "Contribuyente", "Consulta"]);
  });
});

describe("relevanciaDe", () => {
  it("específica solo si todos los chequeos están bien", () => {
    expect(relevanciaDe([{ nivel: "ok", texto: "a" }])).toBe("s");
    expect(relevanciaDe([{ nivel: "ok", texto: "a" }, { nivel: "warn", texto: "b" }])).toBe("g");
    expect(relevanciaDe([])).toBe("g");
  });
});

describe("motivosNoEnviar", () => {
  it("una ficha completa puede enviarse", () => {
    expect(motivosNoEnviar(base)).toEqual([]);
  });

  it("el Contribuyente no envía, y se le dice", () => {
    expect(motivosNoEnviar({ ...base, actor: "editor" })).toContain("Solo el Gestor de la oficina o Planeación puede enviar.");
  });

  it("una respuesta enviada ya no se envía de nuevo", () => {
    expect(motivosNoEnviar({ ...base, estado: "sent" })).toEqual(["Ya se envió: Planeación la revisa y solo ella puede cambiarla."]);
  });

  it("sí sin evidencia y riesgos bloquean", () => {
    const m = motivosNoEnviar({ ...base, evidencias: 0, riesgos: 1 });
    expect(m).toContain("Agregue al menos una evidencia, o responda No.");
    expect(m).toContain("Quite o corrija las evidencias con riesgo.");
  });

  it("no sin evidencia no pide evidencia", () => {
    expect(motivosNoEnviar({ ...base, siNo: false, evidencias: 0 })).toEqual([]);
  });

  it("sin responder Sí o No, lo dice", () => {
    expect(motivosNoEnviar({ ...base, siNo: null })).toContain("Responda Sí o No.");
  });

  it("un dato pide todas sus cifras y no negativas", () => {
    const d: DatosEnvio = { ...base, tipo: "dato", siNo: null, campos: ["tot", "dis"], valores: { tot: 100, dis: null } };
    expect(motivosNoEnviar(d)).toContain("Complete todas las cifras.");
    expect(motivosNoEnviar({ ...d, valores: { tot: 100, dis: -1 } })).toContain("Las cifras no pueden ser negativas.");
    expect(motivosNoEnviar({ ...d, valores: { tot: 100, dis: 4 } })).toEqual([]);
  });

  it("una investigación no pide sí/no ni evidencia", () => {
    expect(motivosNoEnviar({ ...base, tipo: "inv", siNo: null, evidencias: 0 })).toEqual([]);
  });

  it("un comentario demasiado largo o sin traducir bloquea", () => {
    expect(motivosNoEnviar({ ...base, comentario: "a".repeat(1001) })[0]).toMatch(/máximo es 1000/);
    expect(motivosNoEnviar({ ...base, comentario: "Hola", traduccionAlDia: false })).toEqual(["Traduzca el comentario al inglés."]);
  });
});
