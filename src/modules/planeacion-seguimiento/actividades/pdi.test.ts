import { describe, expect, it } from "vitest";
import { CATALOGO_PDI_DEMO } from "./semilla";
import { alternarItem, columnasPdiExcel, filtrarCatalogo, leerPdiExcel, resolverSeleccion, resumirPdi } from "./pdi";

const cat = CATALOGO_PDI_DEMO;
const l1 = cat[0].areas[0].lineas[0];

describe("catálogo del PDI", () => {
  it("busca sin tildes en pilares y líneas", () => {
    expect(filtrarCatalogo(cat, "ciberseguridad")[0].areas[0].lineas).toHaveLength(1);
    expect(filtrarCatalogo(cat, "zzzz")).toEqual([]);
    expect(filtrarCatalogo(cat, "")).toHaveLength(cat.length);
  });
  it("alterna elementos y resuelve nombres", () => {
    const s = alternarItem({ conexion: "con_pdi", items: [] }, { pillarId: cat[0].pillarId, lineaId: l1.lineaId });
    expect(s.items).toHaveLength(1);
    expect(resolverSeleccion(cat, s).items[0].lineaCodigo).toBe(l1.codigo);
    expect(alternarItem(s, s.items[0]).items).toHaveLength(0);
  });
  it("resumen por conexión y pilar", () => {
    const r = resumirPdi([{ pdi: resolverSeleccion(cat, { conexion: "con_pdi", items: [{ pillarId: cat[0].pillarId, lineaId: null }] }) }, { pdi: { conexion: "sin_pdi", items: [] } }, { pdi: { conexion: "sin_definir", items: [] } }]);
    expect([r.conPdi, r.sinPdi, r.sinDefinir, r.porPilar.length]).toEqual([1, 1, 1, 1]);
  });
});

describe("columnas de Excel pdi / pilar_pdi / linea_pdi", () => {
  it("«Sin conexión» no lleva nada", () => expect(leerPdiExcel("Sin conexión", "", "", cat).seleccion).toEqual({ conexion: "sin_pdi", items: [] }));
  it("la conexión es obligatoria y válida", () => {
    expect(leerPdiExcel("", "", "", cat).errores[0].columna).toBe("pdi");
    expect(leerPdiExcel("tal vez", "", "", cat).errores[0].columna).toBe("pdi");
  });
  it("línea por código implica su pilar; varias con «;»", () => {
    const l2 = cat[1].areas[0].lineas[0];
    const r = leerPdiExcel("Con PDI", "", `${l1.codigo}; ${l2.codigo}`, cat);
    expect(r.errores).toEqual([]);
    expect(r.seleccion.items).toEqual([{ pillarId: cat[0].pillarId, lineaId: l1.lineaId }, { pillarId: cat[1].pillarId, lineaId: l2.lineaId }]);
  });
  it("pilar completo por nombre; línea inexistente da error en linea_pdi", () => {
    expect(leerPdiExcel("Con PDI", cat[0].nombre, "", cat).seleccion.items).toEqual([{ pillarId: cat[0].pillarId, lineaId: null }]);
    expect(leerPdiExcel("Con PDI", "", "LA-9.9.9", cat).errores[0].columna).toBe("linea_pdi");
    expect(leerPdiExcel("Con PDI", "Pilar inventado", "", cat).errores[0].columna).toBe("pilar_pdi");
  });
  it("Con PDI sin pilar ni línea es un error; Sin conexión con línea también", () => {
    expect(leerPdiExcel("Con PDI", "", "", cat).errores).toHaveLength(1);
    expect(leerPdiExcel("Sin conexión", "", l1.codigo, cat).errores[0].columna).toBe("linea_pdi");
  });
  it("ida y vuelta con lo que lee la base", () => {
    const sel = { conexion: "con_pdi" as const, items: [{ pillarId: cat[0].pillarId, lineaId: l1.lineaId }, { pillarId: cat[1].pillarId, lineaId: null }] };
    const c = columnasPdiExcel(sel, cat);
    expect(leerPdiExcel(c.pdi, c.pilar_pdi, c.linea_pdi, cat).seleccion.items).toHaveLength(2);
  });
});
