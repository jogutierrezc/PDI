import { describe, expect, it } from "vitest";
import { esPlantillaConocida, seccionDe, seccionesDe } from "../../supabase/functions/pilo-informes/plantillas";

const propia = {
  plantilla: "X1",
  secciones: [
    { titulo: "Resumen de la oficina", tipo: "narr" },
    { titulo: "Alineación estratégica", tipo: "pdi" },
    { titulo: "Resultados y evidencias", tipo: "dim" },
    { titulo: "Conclusiones", tipo: "narr" },
    { titulo: "Evidencias y fuentes de verificación", tipo: "evid" },
    { titulo: "Anexos", tipo: "anexos" },
  ],
};

describe("Pilo · estructuras propias (0279)", () => {
  it("reconoce A–D y las estructuras propias, y rechaza lo demás", () => {
    for (const p of ["A", "D", "X1", "X12"]) expect(esPlantillaConocida(p)).toBe(true);
    for (const p of ["", "x1", "XXXX", null, 3]) expect(esPlantillaConocida(p)).toBe(false);
  });

  it("arma las secciones de la estructura con su clave por posición y el tipo que Pilo entiende", () => {
    const s = seccionesDe("X1", [], propia);
    expect(s.map((x) => x.clave)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(s.map((x) => x.tipo)).toEqual(["resumen", "alineacion", "resultados", "conclusiones", "otra", "otra"]);
    expect(seccionDe("X1", "s2", [], propia)?.extension).not.toBeNull();
  });

  it("evidencias y anexos son listas: Pilo no las redacta", () => {
    expect(seccionDe("X1", "s5", [], propia)?.extension).toBeNull();
    expect(seccionDe("X1", "s6", [], propia)?.extension).toBeNull();
  });

  it("respeta la configuración del ciclo: título propio y secciones desactivadas", () => {
    const s = seccionesDe("X1", [{ plantilla: "X1", clave: "s1", activa: true, titulo: "Presentación", libre: false }, { plantilla: "X1", clave: "s4", activa: false, titulo: null, libre: false }], propia);
    expect(s[0].titulo).toBe("Presentación");
    expect(s.find((x) => x.clave === "s4")).toBeUndefined();
  });

  it("sin la estructura (borrada o sin migración) no hay secciones, pero las del código siguen igual", () => {
    expect(seccionesDe("X9", [], null)).toEqual([]);
    expect(seccionesDe("A").length).toBe(10);
  });
});
