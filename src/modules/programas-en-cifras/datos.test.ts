/* Partes puras de datos.ts: aviso de migración, armado de la estructura y de los destinos. */

import { describe, expect, it } from "vitest";
import { armarDestinos, armarEstructura, errorDe, esFaltaMigracion, FaltaMigracion, PC_CLAVES } from "./datos";
import type { PcArchivoRow, PcColumnaRow, PcDestinoColumnaRow, PcDestinoRow } from "./tipos";

const archivo = (id: string): PcArchivoRow => ({
  id,
  programa_id: "p",
  campus_id: "c",
  carpeta_id: "k",
  nombre: id,
  tipo: "tabla",
  estado: "borrador",
  bloqueado: false,
  destino_origen: null,
  listo_en: null,
  listo_por: null,
  created_by: null,
  updated_by: null,
  created_at: "",
  updated_at: "",
});
const columna = (archivo_id: string, clave: string, orden: number): PcColumnaRow => ({
  id: `${archivo_id}-${clave}`,
  archivo_id,
  clave,
  etiqueta: clave,
  tipo: "texto",
  obligatorio: false,
  opciones: [],
  solo_lectura: null,
  posterior_a: null,
  personal: false,
  orden,
});

describe("datos", () => {
  it("una tabla o función que no existe es «falta la migración 0164»", () => {
    expect(errorDe({ code: "42P01", message: 'relation "public.pc_archivos" does not exist' })).toBeInstanceOf(FaltaMigracion);
    expect(errorDe({ code: "PGRST202", message: "Could not find the function public.pc_yo in the schema cache" }).message).toMatch(/0164/);
    const otro = errorDe({ code: "42501", message: "Planeación solo observa: los archivos los edita el programa." });
    expect(otro).not.toBeInstanceOf(FaltaMigracion);
    expect(otro.message).toMatch(/solo observa/);
    expect(esFaltaMigracion(errorDe({ code: "PGRST205", message: "Could not find the table 'public.pc_destinos' in the schema cache" }))).toBe(true);
    expect(esFaltaMigracion(new Error("otro"))).toBe(false);
  });

  it("arma archivo → columnas ordenadas", () => {
    const e = armarEstructura([archivo("a1"), archivo("a2")], [columna("a1", "b", 2), columna("a1", "a", 1), columna("a2", "x", 1), columna("otro", "z", 1)]);
    expect(e.map((a) => [a.id, a.columnas.map((c) => c.clave)])).toEqual([
      ["a1", ["a", "b"]],
      ["a2", ["x"]],
    ]);
  });

  it("arma destino → columnas con la lista de su dominio", () => {
    const d = (id: string, orden: number): PcDestinoRow => ({ id, sistema: "CNA", plantilla: null, nombre: id, cuadro: null, orden, automatico: null, estructura_bloqueada: true, solo_salud: false, tipo_archivo: "tabla", carpeta: "cna" });
    const c = (destino_id: string, clave: string, dominio_id: string | null, orden: number): PcDestinoColumnaRow => ({
      id: `${destino_id}-${clave}`,
      destino_id,
      clave,
      etiqueta: clave,
      tipo: dominio_id ? "lista" : "texto",
      obligatorio: false,
      dominio_id,
      solo_lectura: null,
      posterior_a: null,
      personal: false,
      orden,
      nota: "",
    });
    const r = armarDestinos([d("b", 2), d("a", 1)], [c("a", "y", "si_no", 2), c("a", "x", null, 1), c("b", "z", null, 1)], [{ id: "si_no", nombre: "Sí / No", opciones: ["Sí", "No"], numerado: false }]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[0].columnas.map((x) => [x.clave, x.opciones])).toEqual([
      ["x", []],
      ["y", ["Sí", "No"]],
    ]);
  });

  it("las claves de consulta cuelgan de «pc» para invalidar todo junto", () => {
    expect(PC_CLAVES.todo).toEqual(["pc"]);
    expect(PC_CLAVES.filas("a")[0]).toBe("pc");
    expect(PC_CLAVES.estructura("p", "c").slice(0, 2)).toEqual(["pc", "estructura"]);
  });
});
