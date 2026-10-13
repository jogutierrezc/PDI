import { describe, expect, it } from "vitest";
import { estiloRecorte, fechaCorta, direccionTexto, normalizarRecorte, numerarReferencias, pasajes, proporcionEn, puntoDesde, ventanaRecorte } from "./recorte";

describe("recorte de fotografías", () => {
  it("convierte el recorte en estilo CSS: proporción, cover y punto de interés", () => {
    expect(estiloRecorte({ fx: 0.3, fy: 0.25, ratio: "16:9" })).toEqual({ aspectRatio: "16 / 9", objectFit: "cover", objectPosition: "30% 25%" });
    expect(estiloRecorte({ fx: 1, fy: 0, ratio: "1:1" }).objectPosition).toBe("100% 0%");
  });

  it("la ranura manda: la portada siempre ancha, el texto 4:3, la galería 4:3 o 1:1", () => {
    expect(estiloRecorte({ fx: 0.5, fy: 0.5, ratio: "4:3" }, "portada").aspectRatio).toBe("3 / 1");
    expect(estiloRecorte({ fx: 0.5, fy: 0.5, ratio: "16:9" }, "portada").aspectRatio).toBe("16 / 9");
    expect(estiloRecorte({ fx: 0.5, fy: 0.5, ratio: "3:1" }, "n1").aspectRatio).toBe("4 / 3");
    expect(estiloRecorte({ fx: 0.5, fy: 0.5, ratio: "1:1" }, "galeria").aspectRatio).toBe("1 / 1");
    expect(proporcionEn("galeria", "16:9")).toBe("4:3");
    expect(proporcionEn(undefined, "3:1")).toBe("3:1");
  });

  it("tolera datos a medias o fuera de rango", () => {
    expect(normalizarRecorte(null)).toEqual({ fx: 0.5, fy: 0.5, ratio: "16:9" });
    expect(normalizarRecorte({ fx: 2, fy: -1 })).toEqual({ fx: 1, fy: 0, ratio: "16:9" });
    expect(estiloRecorte(undefined).objectPosition).toBe("50% 50%");
  });

  it("la ventana del recorte sobre una imagen 3:1 sigue la regla de object-position", () => {
    const v = ventanaRecorte(3, { fx: 0, fy: 0.5, ratio: "3:2" as never });
    expect(v.height).toBe(1);
    const c = ventanaRecorte(3, { fx: 1, fy: 0.5, ratio: "1:1" });
    expect(c.width).toBeCloseTo(1 / 3);
    expect(c.left).toBeCloseTo(2 / 3);
    expect(ventanaRecorte(3, { fx: 0.5, fy: 0.5, ratio: "3:1" })).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    /* Una imagen más alta que la ventana: se recorta arriba y abajo. */
    const alta = ventanaRecorte(1, { fx: 0.5, fy: 1, ratio: "16:9" });
    expect(alta.width).toBe(1);
    expect(alta.top + alta.height).toBeCloseTo(1);
  });

  it("un clic fija el punto de interés relativo a la caja", () => {
    expect(puntoDesde(150, 25, 300, 100)).toEqual({ fx: 0.5, fy: 0.25 });
    expect(puntoDesde(-10, 500, 300, 100)).toEqual({ fx: 0, fy: 1 });
  });
});

describe("pasajes citados y referencias", () => {
  const cuerpo = "En los meses de febrero y marzo de 2025, la Institución   Educativa La Libertad fue sede. A lo largo de los talleres, más de 400 estudiantes participaron.";

  it("resalta la cita literal con contexto, aunque cambien los espacios", () => {
    const p = pasajes(cuerpo, ["la Institución Educativa La Libertad", "más de 400 estudiantes"], 10);
    expect(p.faltan).toEqual([]);
    expect(p.encontrados.map((x) => x.cita)).toEqual(["la Institución Educativa La Libertad", "más de 400 estudiantes"]);
    expect(p.encontrados[0].antes.startsWith("…")).toBe(true);
  });

  it("dice qué citas no están en la nota", () => {
    expect(pasajes(cuerpo, ["500 estudiantes"]).faltan).toEqual(["500 estudiantes"]);
  });

  it("numera las notas por su primera aparición en el relato", () => {
    const m = numerarReferencias([
      { sources: [{ news_id: "b", quote: "x" }, { news_id: "a", quote: "y" }] },
      { sources: [{ news_id: "a", quote: "z" }, { news_id: "c", quote: "w" }] },
    ]);
    expect([...m.entries()]).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  it("fechas y direcciones como texto", () => {
    expect(fechaCorta("2025-03-14")).toBe("14 mar 2025");
    expect(direccionTexto("https://www.udes.edu.co/comunicaciones/noticias/x/")).toBe("udes.edu.co/comunicaciones/noticias/x");
  });
});
