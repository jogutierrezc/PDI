import { describe, expect, it } from "vitest";
import { analizarEvidencia, aniosEn, claveUrl, extensionDe, TAMANO_MAXIMO_BYTES } from "./analisis-evidencia";

const MB = 1024 * 1024;

describe("evidencia en archivo", () => {
  it("un PDF del año, pequeño y bien nombrado es fuerte", () => {
    const r = analizarEvidencia({ kind: "file", nombre: "Politica_inclusion_2025.pdf", tamano: 2 * MB });
    expect(r.nivel).toBe("ok");
    expect(r.fuerte).toBe(true);
    expect(r.chequeos.every((c) => c.nivel === "ok")).toBe(true);
  });

  it("un formato no admitido es riesgo", () => {
    const r = analizarEvidencia({ kind: "file", nombre: "acta_2025.zip", tamano: MB });
    expect(r.nivel).toBe("risk");
    expect(r.fuerte).toBe(false);
    expect(r.chequeos.some((c) => c.nivel === "risk" && c.texto.includes(".zip"))).toBe(true);
  });

  it("acepta todos los formatos de la lista, en mayúsculas también", () => {
    for (const ext of ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg"]) {
      const r = analizarEvidencia({ kind: "file", nombre: `a_2024.${ext.toUpperCase()}`, tamano: MB });
      expect(r.chequeos.find((c) => c.texto.startsWith("Formato"))?.nivel, ext).toBe("ok");
    }
  });

  it("más de 15 MB es riesgo; exactamente 15 MB no", () => {
    expect(analizarEvidencia({ kind: "file", nombre: "a_2025.pdf", tamano: TAMANO_MAXIMO_BYTES + 1 }).nivel).toBe("risk");
    expect(analizarEvidencia({ kind: "file", nombre: "a_2025.pdf", tamano: TAMANO_MAXIMO_BYTES }).nivel).toBe("ok");
  });

  it("un archivo vacío es riesgo", () => {
    expect(analizarEvidencia({ kind: "file", nombre: "a_2025.pdf", tamano: 0 }).nivel).toBe("risk");
  });

  it("sin año en el nombre es advertencia; con un año fuera de 2020–2026, también", () => {
    const sin = analizarEvidencia({ kind: "file", nombre: "politica.pdf", tamano: MB });
    expect(sin.nivel).toBe("warn");
    expect(sin.fuerte).toBe(false);
    const viejo = analizarEvidencia({ kind: "file", nombre: "informe_2018.pdf", tamano: MB });
    expect(viejo.nivel).toBe("warn");
    expect(viejo.chequeos.some((c) => c.texto.includes("2018"))).toBe(true);
  });

  it("un archivo con el mismo nombre que otro de la respuesta es advertencia", () => {
    const r = analizarEvidencia({ kind: "file", nombre: "Plan_2025.pdf", tamano: MB }, [{ nombre: "plan_2025.PDF" }]);
    expect(r.nivel).toBe("warn");
    expect(r.chequeos.some((c) => c.texto.includes("con ese nombre"))).toBe(true);
  });

  it("sin nombre es riesgo", () => {
    expect(analizarEvidencia({ kind: "file", nombre: "   " }).nivel).toBe("risk");
  });
});

describe("evidencia en URL", () => {
  it("una URL https de udes.edu.co con año es fuerte y pública", () => {
    const r = analizarEvidencia({ kind: "url", url: "https://www.udes.edu.co/politicas/diversidad-2025" });
    expect(r.nivel).toBe("ok");
    expect(r.fuerte).toBe(true);
  });

  it("http es riesgo", () => {
    const r = analizarEvidencia({ kind: "url", url: "http://www.udes.edu.co/noticia-2025" });
    expect(r.nivel).toBe("risk");
    expect(r.chequeos.some((c) => c.texto.includes("https"))).toBe(true);
  });

  it("un dominio ajeno a udes.edu.co es advertencia (y no fuerte)", () => {
    const r = analizarEvidencia({ kind: "url", url: "https://www.elespectador.com/udes-2025" });
    expect(r.nivel).toBe("warn");
    expect(r.fuerte).toBe(false);
  });

  it("un dominio que solo termina igual no cuenta como UDES", () => {
    const r = analizarEvidencia({ kind: "url", url: "https://fakeudes.edu.co.evil.com/2025" });
    expect(r.chequeos.find((c) => c.texto.toLowerCase().includes("dominio"))?.nivel).toBe("warn");
  });

  it("una dirección que no es URL es riesgo", () => {
    expect(analizarEvidencia({ kind: "url", url: "udes.edu.co/2025" }).nivel).toBe("risk");
  });

  it("la misma dirección, aunque cambie la barra final o el fragmento, es duplicado", () => {
    const r = analizarEvidencia(
      { kind: "url", url: "https://www.udes.edu.co/Politicas/2025/#anexo" },
      [{ url: "https://udes.edu.co/politicas/2025" }],
    );
    expect(r.nivel).toBe("warn");
    expect(r.chequeos.some((c) => c.texto.includes("ya está"))).toBe(true);
  });
});

describe("ayudas", () => {
  it("extensionDe y aniosEn", () => {
    expect(extensionDe("Plan.Final.PDF")).toBe("pdf");
    expect(extensionDe("sin_extension")).toBe("");
    expect(aniosEn("a_2024_b_2030_c20255")).toEqual([2024, 2030]);
  });

  it("claveUrl ignora mayúsculas, www, barra final y fragmento", () => {
    expect(claveUrl("https://WWW.udes.edu.co/A/b/#x")).toBe(claveUrl("https://udes.edu.co/a/b"));
    expect(claveUrl("no es url")).toBe("no es url");
  });
});
