import { describe, expect, it } from "vitest";
import { ESTRUCTURA } from "../../../../tests/internacionalizacion/fixtures";
import { aplicarPegado, cambiarCelda, erroresEnCeldas } from "../../../components/espacio/logica";
import type { FilaLocal } from "../../../components/espacio/tipos";
import { avanceLibro, carpetaDeLibro, columnaEsp, reglasInt } from "./adaptador";

const hoja = ESTRUCTURA[0].hojas[0]; // Movilidad estudiantil · Saliente
const columnas = hoja.columnas.map(columnaEsp);
const reglas = reglasInt(hoja.columnas, new Set(["numero_documento"]));
const col = (clave: string) => columnas.find((c) => c.clave === clave)!;
const fila = (k: string, datos: FilaLocal["datos"], grupo = "c-bga"): FilaLocal => ({ k, datos, grupo });

describe("adaptador de Internacionalización", () => {
  it("una columna calculada es de solo lectura y el concepto va en la ayuda", () => {
    expect(col("duracion_dias").solo_lectura).toBe("calculada");
    expect(col("numero_documento").ayuda).toContain("numero_documento");
    expect(col("numero_documento").obligatorio).toBe(true);
  });

  it("lee lo escrito (fecha dd/mm/aaaa → AAAA-MM-DD) y rellena los días entre fechas", () => {
    let filas = [fila("1", {})];
    filas = cambiarCelda(filas, "1", col("fecha_inicio"), "01/09/2026", reglas, columnas);
    filas = cambiarCelda(filas, "1", col("fecha_fin"), "2026-09-11", reglas, columnas);
    expect(filas[0].datos.fecha_inicio).toBe("2026-09-01");
    expect(filas[0].datos.duracion_dias).toBe(10);
  });

  it("marca la fecha de fin anterior a la de inicio y el obligatorio que falta", () => {
    const malas = erroresEnCeldas(columnas, [fila("1", { fecha_inicio: "2026-09-14", fecha_fin: "2026-09-01" })], reglas);
    expect(malas.find((e) => e.clave === "fecha_fin")?.mensaje).toContain("es anterior");
    expect(malas.find((e) => e.clave === "numero_documento")?.mensaje).toContain("obligatorio");
  });

  it("pega un bloque de Excel en la fila de su campus y respeta las filas bloqueadas", () => {
    const filas = [fila("1", {}), fila("2", {}, "c-cuc")];
    const r = aplicarPegado({
      filas,
      orden: ["1", "2"],
      columnas,
      desde: { fila: 0, columna: 1 },
      matriz: [["1098765432", "México"], ["1090123456", "Chile"]],
      reglas,
      claveNueva: () => "nueva",
      grupoNuevo: () => "c-bga",
      bloqueada: (f) => f.grupo === "c-cuc",
    });
    expect(r.pegadas).toBe(1);
    expect(r.filas[0].datos.numero_documento).toBe("1098765432");
    expect(r.filas[1].datos).toEqual({});
  });

  it("oculta lo personal en las filas que no se pueden escribir", () => {
    expect(reglas.textoBloqueado!(col("numero_documento"), "1098765432")).toBe("••••5432");
    expect(reglas.textoBloqueado!(col("programa"), "Derecho")).toBe("Derecho");
  });

  it("agrupa los libros por la clase de sus hojas y cuenta lo aprobado en los campus que se ven", () => {
    expect(carpetaDeLibro(ESTRUCTURA[0])).toBe("movilidad");
    expect(carpetaDeLibro(ESTRUCTURA[1])).toBe("convenio");
    expect(carpetaDeLibro({ hojas: [...ESTRUCTURA[0].hojas, ...ESTRUCTURA[1].hojas] })).toBe("varias");
    expect(carpetaDeLibro({ hojas: [] })).toBe("general");
    const envios = [
      { hoja_id: "h-sal", campus_id: "c-bga", estado: "aprobado" as const },
      { hoja_id: "h-sal", campus_id: "c-cuc", estado: "aprobado" as const },
      { hoja_id: "h-ent", campus_id: "c-bga", estado: "enviado" as const },
    ];
    expect(avanceLibro(ESTRUCTURA[0], envios, ["c-bga"])).toEqual({ aprobadas: 1, total: 2 });
    expect(avanceLibro(ESTRUCTURA[0], envios, ["c-bga", "c-cuc"])).toEqual({ aprobadas: 2, total: 4 });
  });
});
