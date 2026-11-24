/* Las imágenes de una nota de udes.edu.co (K2), con notas reales guardadas en
   fixtures/k2-notas.json (introtext, fulltext, portada y metas og:image). */

import { describe, expect, it } from "vitest";
import notas from "./fixtures/k2-notas.json";
import { creditoEn, imagenesDeK2, tamanoOg, urlAbsoluta } from "../../supabase/functions/noticias-ods/parseo";

type Fixture = { key: string; host: string; k2: Record<string, unknown>; og: string };
const nota = (k: string) => (notas as Fixture[]).find((n) => n.key === k)!;
const imagenes = (k: string) => {
  const n = nota(k);
  return imagenesDeK2(n.k2, n.host, tamanoOg(n.og));
};

describe("imágenes de una nota real", () => {
  it("El Recolector: la portada XL de 1920 × 640 y tres fotos del texto, con URL absoluta", () => {
    const im = imagenes("recolector");
    expect(im).toHaveLength(4);
    expect(im[0]).toMatchObject({ is_cover: true, width: 1920, height: 640, pos: 0, kind: "foto", caption: "" });
    expect(im[0].url).toBe("https://udes.edu.co/media/k2/items/cache/4f6bc95b0a51687620af448ccd23d463_XL.jpg");
    expect(im[1]).toMatchObject({ is_cover: false, width: 587, height: 265, url: "https://udes.edu.co/images/udes-libertad-reciclaje.jpg", alt: "udes libertad reciclaje" });
    expect(im.map((i) => i.pos)).toEqual([0, 1, 2, 3]);
  });

  it("toma el crédito de K2 de la portada", () => {
    expect(imagenes("diplomado")[0].credit).toBe("Educación Continua");
    expect(imagenes("inclusiva")[0].credit).toBe("Suministrada");
  });

  it("un alt que es el nombre del archivo no sirve de descripción", () => {
    const im = imagenes("diplomado");
    expect(im[1].alt).toBe("");
    expect(im[1].url).toMatch(/^https:\/\/udes\.edu\.co\/images\/WhatsApp_Image_2025-10-23/);
  });

  it("una convocatoria deja la portada como pieza gráfica", () => {
    expect(imagenes("gestion")[0].kind).toBe("grafica");
    expect(imagenes("recolector")[0].kind).toBe("foto");
  });

  it("una nota sin imágenes en el texto trae solo la portada", () => {
    expect(imagenes("superheroes")).toHaveLength(1);
  });
});

describe("filtros", () => {
  const k2 = (html: string, extra: Record<string, unknown> = {}) => imagenesDeK2({ title: "Una nota", introtext: html, fulltext: "", ...extra }, "udes.edu.co");

  it("descarta logos, íconos, megamenú, imágenes diminutas, data: y http ajeno", () => {
    const im = k2(
      [
        '<img src="/images/logo/udes.png" width="200">',
        '<img src="images/megamenu/x.jpg">',
        '<img src="/images/iconos/flecha.png">',
        '<img src="images/pixel.gif" width="1" height="1">',
        '<img src="images/foto.jpg" width="20" height="300">',
        '<img src="data:image/png;base64,AAAA">',
        '<img src="http://otro.com/a.jpg">',
        '<img src="images/buena.jpg" width="800" height="600">',
      ].join(""),
    );
    expect(im.map((i) => i.url)).toEqual(["https://udes.edu.co/images/buena.jpg"]);
  });

  it("no repite la misma imagen (ni con otra versión en la consulta)", () => {
    const im = k2('<img src="images/a.jpg"><img src="/images/a.jpg"><img src="https://udes.edu.co/images/a.jpg?v=2">');
    expect(im).toHaveLength(1);
  });

  it("el «Foto: …» que sigue a la imagen es su crédito; un pie antes de «Foto:» es su pie", () => {
    const im = k2('<p><img src="images/a.jpg" width="900"></p><p>Foto: Laura Gómez</p><p><img src="images/b.jpg"></p><p>Estudiantes en la jornada de siembra. Foto: Comunicaciones UDES</p>');
    expect(im[0].credit).toBe("Laura Gómez");
    expect(im[1].caption).toBe("Estudiantes en la jornada de siembra.");
    expect(im[1].credit).toBe("");
  });

  it("lee el ancho del estilo y marca afiches y banners", () => {
    const im = k2('<img src="images/afiche-convocatoria.jpg" style="width: 640px; height: 900px">');
    expect(im[0]).toMatchObject({ width: 640, height: 900, kind: "grafica" });
  });

  it("http de udes.edu.co pasa a https; las rutas relativas se resuelven en el sitio", () => {
    expect(urlAbsoluta("http://udes.edu.co/images/a.jpg", "udes.edu.co")).toBe("https://udes.edu.co/images/a.jpg");
    expect(urlAbsoluta("images/a.jpg", "cucuta.udes.edu.co")).toBe("https://cucuta.udes.edu.co/images/a.jpg");
    expect(urlAbsoluta("javascript:alert(1)", "udes.edu.co")).toBeNull();
  });

  it("créditos en el texto", () => {
    expect(creditoEn("<p>Fotografía: Educación Continua</p>")).toBe("Educación Continua");
    expect(creditoEn("Cortesía: Alcaldía de Bucaramanga.")).toBe("Alcaldía de Bucaramanga");
    expect(creditoEn("Sin crédito")).toBe("");
  });
});
