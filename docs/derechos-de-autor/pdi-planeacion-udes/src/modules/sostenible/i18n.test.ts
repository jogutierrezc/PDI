import { describe, expect, it } from "vitest";
import { DICCIONARIO, ODS_CIFRAS_EN, ODS_NOMBRE_EN, ODS_TESIS_EN, ODS_VIENE_EN, conLang, fechaCorta, fechaLarga, leerLang, tr } from "./i18n";
import type { Clave } from "./i18n";
import { ODS_LIST } from "./ods-data";

describe("i18n del portal de rankings", () => {
  it("cobertura: toda clave tiene español e inglés, sin huecos", () => {
    const claves = Object.keys(DICCIONARIO) as Clave[];
    expect(claves.length).toBeGreaterThan(80);
    for (const k of claves) {
      expect(DICCIONARIO[k].es.trim(), `${k} (es)`).not.toBe("");
      expect(DICCIONARIO[k].en.trim(), `${k} (en)`).not.toBe("");
    }
  });

  it("las variables {x} son las mismas en los dos idiomas", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [k, v] of Object.entries(DICCIONARIO)) expect(vars(v.en), k).toBe(vars(v.es));
  });

  it("los 17 ODS tienen nombre, tesis, «lo que viene» y cifras en inglés", () => {
    expect(ODS_NOMBRE_EN).toHaveLength(ODS_LIST.length);
    expect(ODS_TESIS_EN).toHaveLength(ODS_LIST.length);
    expect(ODS_VIENE_EN).toHaveLength(ODS_LIST.length);
    expect(ODS_CIFRAS_EN).toHaveLength(ODS_LIST.length);
    for (const c of ODS_CIFRAS_EN) expect(c).toHaveLength(2);
  });

  it("interpola variables y cae al español si falta", () => {
    expect(tr("en", "notas_n", { n: 61 })).toBe("61 news stories from 2025 on this SDG, published on udes.edu.co.");
    expect(tr("es", "rango_de", { a: 1, b: 3, n: 11 })).toBe("1–3 de 11");
    expect(tr("en", "rango_de", { a: 1, b: 3, n: 11 })).toBe("1–3 of 11");
  });

  it("el idioma: ?lang manda, luego lo guardado, luego el de partida", () => {
    expect(leerLang("en", "es", "es")).toBe("en");
    expect(leerLang(null, "en", "es")).toBe("en");
    expect(leerLang("fr", null, "es")).toBe("es");
    expect(leerLang(null, null, "en")).toBe("en");
    expect(conLang("/sostenible/impact#x", "en")).toBe("/sostenible/impact?lang=en#x");
    expect(conLang("/a?b=1", "es")).toBe("/a?b=1");
  });

  it("fechas con Intl según el idioma, sin desfase de zona", () => {
    expect(fechaCorta("2025-03-01", "es")).toMatch(/^1 mar 2025$/);
    expect(fechaCorta("2025-03-01", "en")).toBe("1 Mar 2025");
    expect(fechaLarga("2025-11-12", "en")).toBe("12 November 2025");
    expect(fechaLarga("2025-11-12", "es")).toBe("12 de noviembre de 2025");
  });
});
