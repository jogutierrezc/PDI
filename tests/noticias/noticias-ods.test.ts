import { describe, expect, it } from "vitest";
import { clasificar, extracto, UMBRAL } from "../../supabase/functions/noticias-ods/clasificar";
import { enlacesDelListado, leerK2 } from "../../supabase/functions/noticias-ods/parseo";

describe("clasificar", () => {
  it("pone el ODS 13 primero en una nota de siembra y cuenca", () => {
    const r = clasificar("Estudiantes siembran 600 árboles nativos en la cuenca del río Surata", "La jornada de reforestación busca mitigar el cambio climático.");
    expect(r[0].ods).toBe(13);
    expect(r[0].score).toBeGreaterThanOrEqual(UMBRAL);
    expect(r[0].reason).toMatch(/^Menciona /);
  });
  it("reconoce salud, mujeres y justicia", () => {
    expect(clasificar("Jornada de salud mental reúne a 900 estudiantes", "Tamizajes y atención psicológica.")[0].ods).toBe(3);
    expect(clasificar("Mujeres emprendedoras presentan sus negocios", "Liderazgo femenino y equidad de género.").map((a) => a.ods)).toContain(5);
    expect(clasificar("Consultorio Jurídico atendió 2.400 casos", "Acceso a la justicia para víctimas del conflicto.")[0].ods).toBe(16);
  });
  it("una nota administrativa no llega a ningún ODS", () => {
    expect(clasificar("Declaración de renta 2025: las preguntas que debería resolver", "Fechas y requisitos para declarar.")).toEqual([]);
  });
  it("devuelve como mucho tres ODS, del más al menos afín", () => {
    const r = clasificar("Alianza para la salud, la educación, la energía solar y el agua potable", "Convenio de cooperación, becas, vacunación y paneles solares en el acueducto.");
    expect(r.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
  });
});

describe("extracto", () => {
  it("deja intacto un texto corto", () => expect(extracto("Una frase breve.")).toBe("Una frase breve."));
  it("corta en unas 40 palabras", () => {
    const largo = Array.from({ length: 120 }, (_, i) => `palabra${i}`).join(" ");
    const e = extracto(largo);
    expect(e.split(" ").length).toBeLessThanOrEqual(41);
    expect(e.endsWith("…")).toBe(true);
  });
});

describe("parseo de udes.edu.co", () => {
  it("toma los enlaces de noticias sin repetirlos ni contar la portada de la sección", () => {
    const html = `<a href="/comunicaciones/noticias"></a><a href="/extension/noticias/a-b-c"></a><a href="/extension/noticias/a-b-c"></a><a href="/investigacion/noticias/x"></a><a href="/x/noticias/content">`;
    expect(enlacesDelListado(html)).toEqual(["/extension/noticias/a-b-c", "/investigacion/noticias/x"]);
  });
  it("lee el objeto que K2 deja en la consola, aun con llaves dentro de las cadenas", () => {
    const obj = { title: "Una {nota}", publish_up: "2025-03-14 10:00:00", introtext: "<p>Hola \"mundo\" }</p>", category: { name: "Investigación" } };
    const html = `<script>console.log("K2 Debug $this->item:",${JSON.stringify(obj)});</script>`;
    expect(leerK2(html)).toEqual(obj);
  });
  it("devuelve null si la página no trae el objeto", () => expect(leerK2("<html></html>")).toBeNull());
});
