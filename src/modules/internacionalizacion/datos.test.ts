/* Partes puras de datos.ts: aviso de migración, armado de la estructura y estado por defecto. */

import { describe, expect, it } from "vitest";
import { armarEstructura, errorDe, estadoDe, FaltaMigracion } from "./datos";

describe("datos", () => {
  it("una tabla o función que no existe es «falta la migración 0151»", () => {
    expect(errorDe({ code: "42P01", message: 'relation "public.int_filas" does not exist' })).toBeInstanceOf(FaltaMigracion);
    expect(errorDe({ code: "PGRST202", message: "Could not find the function public.int_yo in the schema cache" }).message).toMatch(/0151/);
    const otro = errorDe({ code: "42501", message: "La ventana de captura de esta hoja está cerrada para este campus." });
    expect(otro).not.toBeInstanceOf(FaltaMigracion);
    expect(otro.message).toMatch(/ventana/);
  });

  it("arma libros → hojas → columnas", () => {
    const e = armarEstructura(
      [{ id: "l", nombre: "Movilidad", descripcion: "", captura: "campus", orden: 1, carpeta_id: null, created_by: null, created_at: "" }],
      [
        { id: "h1", libro_id: "l", nombre: "Saliente", clase: "movilidad", sentido: "saliente", orden: 1 },
        { id: "h2", libro_id: "otro", nombre: "X", clase: "general", sentido: null, orden: 1 },
      ],
      [{ id: "c", hoja_id: "h1", clave: "pais_contraparte", etiqueta: "País", tipo: "texto", concepto_id: "pais_contraparte", obligatorio: false, opciones: [], calculo: null, orden: 1 }],
    );
    expect(e[0].hojas.map((h) => [h.id, h.columnas.length])).toEqual([["h1", 1]]);
  });

  it("sin fila en int_envios, el estado es borrador", () => {
    expect(estadoDe([], "h", "c")).toBe("borrador");
    expect(estadoDe([{ periodo_id: "p", hoja_id: "h", campus_id: "c", estado: "validado", nota: "", enviado_en: null, validado_en: null, aprobado_en: null, updated_by: null, updated_at: "" }], "h", "c")).toBe(
      "validado",
    );
  });
});
