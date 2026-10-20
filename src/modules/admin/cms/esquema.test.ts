/* =============================================================================
   CMS Portales · pruebas de lo que el inspector muestra como datos.
   ========================================================================== */

import { describe, expect, it } from "vitest";
import { BLOQUES, definicion } from "./bloques";
import { codigoGsap, esquemaDeBloque, filaDeBloque, resumenDeBloque } from "./esquema";
import { MOVIMIENTO_DEFECTO } from "./logica";
import type { Movimiento } from "./tipos";

describe("esquemaDeBloque", () => {
  it("cada tipo del registro produce un esquema con un atributo por campo", () => {
    for (const def of BLOQUES) {
      const esquema = esquemaDeBloque(def);
      expect(Object.keys(esquema.attributes), def.tipo).toEqual(def.campos.map((c) => c.clave));
      expect(esquema.info.displayName).toBe(def.nombre);
      expect(esquema.info.live).toBe(Boolean(def.vivo));
      expect(esquema.collectionName).toMatch(/^components_cms_[a-z0-9_]+$/);
    }
  });

  it("traduce los tipos de campo, los requeridos, las opciones y los rangos", () => {
    const hero = esquemaDeBloque(definicion("hero")!).attributes;
    expect(hero.titulo).toEqual({ type: "string", required: true });
    expect(hero.texto).toEqual({ type: "text" });
    expect(hero.rueda).toEqual({ type: "boolean" });
    expect(hero.tono).toEqual({ type: "enumeration", enum: ["oscuro", "claro"] });
    const ods = esquemaDeBloque(definicion("ods")!).attributes;
    expect(ods.velocidad).toEqual({ type: "integer", min: 10, max: 80 });
  });

  it("una lista es un componente repetible con los atributos de sus elementos", () => {
    const frentes = esquemaDeBloque(definicion("frentes")!).attributes.items;
    expect(frentes.type).toBe("component");
    expect(frentes.repeatable).toBe(true);
    expect(frentes.component).toBe("cms.frentes-items");
    expect(Object.keys(frentes.attributes ?? {})).toEqual(["nombre", "texto", "icono"]);
    expect(frentes.attributes?.icono?.enum).toContain("energia");
  });

  it("el mosaico ya no declara una lista: sus teselas son las reales de la portada", () => {
    const mosaico = definicion("mosaico")!;
    expect(mosaico.vivo).toBe(true);
    expect(mosaico.campos.map((c) => c.clave)).toEqual(["titulo", "texto"]);
  });
});

describe("filaDeBloque", () => {
  it("es la fila que se escribe: las claves reservadas viajan dentro de props", () => {
    const props = { titulo: "Hola", _oculto: true, _estilo: { fondo: "alterno", espacio: "normal" } };
    const fila = filaDeBloque({ id: "b1", tipo: "texto", ancho: 12, props }, 3);
    expect(fila).toEqual({ id: "b1", orden: 3, tipo: "texto", ancho: 12, props });
  });
});

describe("codigoGsap", () => {
  const mov = (preset: Movimiento["preset"]): Movimiento => ({ ...MOVIMIENTO_DEFECTO, preset, dur: 0.9, stagger: 0.12, delay: 0.2, ease: "expo.out" });

  it("sin entrada es un comentario, no código", () => {
    expect(codigoGsap(mov("ninguna"))).toMatch(/^\/\//);
  });

  it("incluye los valores elegidos y el selector que usa el render", () => {
    expect(codigoGsap(mov("palabras"))).toContain('gsap.from(".cms-w"');
    expect(codigoGsap(mov("palabras"))).toContain("stagger: 0.12");
    expect(codigoGsap(mov("cascada"))).toContain('"[data-in]"');
    expect(codigoGsap(mov("zoom"))).toContain('".cms-arte"');
    for (const preset of ["palabras", "sube", "cascada", "zoom"] as const) {
      const codigo = codigoGsap(mov(preset));
      expect(codigo, preset).toContain("duration: 0.9");
      expect(codigo, preset).toContain("delay: 0.2");
      expect(codigo, preset).toContain('ease: "expo.out"');
    }
  });
});

describe("resumenDeBloque", () => {
  it("prefiere el título, luego el texto, luego el antetítulo", () => {
    expect(resumenDeBloque({ titulo: "T", texto: "X", antetitulo: "A" })).toBe("T");
    expect(resumenDeBloque({ titulo: "  ", texto: "X", antetitulo: "A" })).toBe("X");
    expect(resumenDeBloque({ antetitulo: "A" })).toBe("A");
    expect(resumenDeBloque({})).toBe("");
  });

  it("recorta lo largo con puntos suspensivos y junta los espacios", () => {
    const largo = resumenDeBloque({ titulo: `${"palabra ".repeat(30)}`}, 20);
    expect(largo.length).toBeLessThanOrEqual(20);
    expect(largo.endsWith("…")).toBe(true);
    expect(resumenDeBloque({ titulo: "a\n  b" })).toBe("a b");
  });

  it("ignora valores que no son texto", () => {
    expect(resumenDeBloque({ titulo: 5, texto: ["x"] })).toBe("");
  });
});
