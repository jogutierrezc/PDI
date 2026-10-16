import { describe, expect, it } from "vitest";
import type { PcArchivoRow, ResumenArchivo } from "../tipos";
import { haceCuanto } from "../../../components/espacio/logica";
import { archivosVisibles, estadoVisible, opcionesDeTexto, parejaInicial } from "./logica";

const arch = (id: string, parcial: Partial<PcArchivoRow> = {}): PcArchivoRow => ({
  id, programa_id: "p", campus_id: "c", carpeta_id: "f1", nombre: id, tipo: "tabla", estado: "borrador", bloqueado: false, destino_origen: null,
  listo_en: null, listo_por: null, created_by: null, updated_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...parcial,
});

describe("explorador", () => {
  const resumen = new Map<string, ResumenArchivo>([["b", { archivo_id: "b", filas: 3, errores: 2 }]]);
  const archivos = [arch("a", { updated_at: "2026-10-03T00:00:00Z" }), arch("b", { tipo: "lista", updated_at: "2026-10-02T00:00:00Z" }), arch("c", { estado: "listo", carpeta_id: "f2" })];
  const ver = (p: Partial<Parameters<typeof archivosVisibles>[0]>) => archivosVisibles({ archivos, resumen, seccion: "archivos", carpeta: null, filtro: "todos", ...p }).map((a) => a.id);

  it("ordena lo más reciente primero y filtra por carpeta, tipo, errores y listos", () => {
    expect(ver({})).toEqual(["a", "b", "c"]);
    expect(ver({ carpeta: "f2" })).toEqual(["c"]);
    expect(ver({ filtro: "lista" })).toEqual(["b"]);
    expect(ver({ filtro: "errores" })).toEqual(["b"]);
    expect(ver({ seccion: "listos" })).toEqual(["c"]);
  });

  it("dice el estado y el tiempo", () => {
    expect(estadoVisible("listo", 4).clave).toBe("listo");
    expect(estadoVisible("borrador", 1).texto).toBe("1 error");
    expect(estadoVisible("borrador", 0).texto).toBe("Borrador");
    const t = Date.parse("2026-10-16T12:00:00Z");
    expect(haceCuanto("2026-10-16T11:30:00Z", t)).toBe("hace 30 min");
    expect(haceCuanto("2026-10-14T12:00:00Z", t)).toBe("hace 2 d");
  });

  it("abre la pareja de la dirección o la primera", () => {
    const yo = {
      planeacion: false,
      programas: [
        { programa_id: "p1", campus_id: "c1", rol: "director" as const, programa: "A", programa_codigo: "A", campus: "X" },
        { programa_id: "p2", campus_id: "c2", rol: "coordinador" as const, programa: "B", programa_codigo: "B", campus: "Y" },
      ],
    };
    expect(parejaInicial(yo, "p2", "c2")?.programa).toBe("B");
    expect(parejaInicial(yo, "zz", "c2")?.programa).toBe("A");
    expect(parejaInicial({ planeacion: false, programas: [] })).toBeNull();
  });
});

describe("programas por campus", () => {
  it("agrupa por campus y ordena campus y programas", async () => {
    const { agruparPorCampus } = await import("./logica");
    const p = (programa: string, campus_id: string, campus: string) => ({ programa, campus_id, campus });
    const g = agruparPorCampus([p("Medicina", "b", "Bucaramanga"), p("Derecho", "v", "Valledupar"), p("Enfermería", "b", "Bucaramanga"), p("Arquitectura", "b", "Bucaramanga")]);
    expect(g.map((x) => x.campus)).toEqual(["Bucaramanga", "Valledupar"]);
    expect(g[0].parejas.map((x) => x.programa)).toEqual(["Arquitectura", "Enfermería", "Medicina"]);
    expect(agruparPorCampus([])).toEqual([]);
  });
});

describe("campos", () => {
  it("separa las opciones de una lista", () => {
    expect(opcionesDeTexto("Sí, No;Sí\nTal vez")).toEqual(["Sí", "No", "Tal vez"]);
  });
});
