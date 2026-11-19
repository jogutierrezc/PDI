import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import real from "../datos/pdifyt-2027-2035.json";
import type { Linea } from "../modelo";
import { leerLibro, type HojaCruda } from "../importar";
import { ACT_PROPIA, COLUMNAS_ACT, HOJA_ACTIVIDADES } from "./columnasAct";
import { actividadesListas, analizarActividades, problemasDeActividades, textoLineaLista, type OpcionesActividades } from "./importarAct";
import type { DatosActividad } from "./modelo";
import { construirPlantillaActividades, hojasPlantillaActividades } from "./plantillaAct";
import { generarActividades, oficinaDeLinea, PERSONAS_DEMO, correoDemo, ID_YO, HOY_DEMO } from "./semilla";

const lineasReales = real as unknown as Linea[];
const CAMPUS = ["Bucaramanga", "Valledupar", "Cúcuta"];
const equipo = [
  { id: ID_YO, nombre: "Mariana Solano", correo: correoDemo("Mariana Solano"), asignable: true },
  ...PERSONAS_DEMO.filter((p) => p.oficina === "of-4").map((p) => ({ id: p.id, nombre: p.nombre, correo: correoDemo(p.nombre), asignable: p.papel !== "visor" })),
];
const delaOficina = lineasReales.filter((l) => oficinaDeLinea(l) === "of-4").map((l) => ({ no: l.no, nombre: l.nombre }));
const op: OpcionesActividades = { oficinaId: "of-4", oficinaNombre: "Tecnología e Infraestructura TI", lineas: delaOficina, equipo, campus: [...CAMPUS, "Todos"] };

/** Una hoja «Actividades» mínima, con banda de 3 filas, para casos de error. */
function hojaDe(filas: Record<string, string>[]): HojaCruda[] {
  const enc = COLUMNAS_ACT.map((c) => `${c.base} (x)`);
  const cuerpo = filas.map((f) => COLUMNAS_ACT.map((c) => f[c.id] ?? ""));
  return [{ nombre: HOJA_ACTIVIDADES, oculta: false, filas: [["banda"], [""], [""], enc, ...cuerpo] }];
}
const fila = (o: Record<string, string> = {}): Record<string, string> => ({ linea: textoLineaLista(delaOficina[0]), titulo: "Levantar el inventario", inicio: "2027-02-01", fin: "2027-03-31", prioridad: "Alto", campus: "Cúcuta", "resp:1": equipo[1].correo, ...o });

describe("importar actividades · reglas por fila", () => {
  it("una fila completa se lee sin problemas", () => {
    const r = analizarActividades(hojaDe([fila()]), op);
    expect(r.error).toBeNull();
    expect(problemasDeActividades(r)).toHaveLength(1); // solo el aviso de «sin _Control»
    expect(actividadesListas(r)).toEqual([{ oficinaId: "of-4", lineaNo: delaOficina[0].no, titulo: "Levantar el inventario", descripcion: "", inicio: "2027-02-01", fin: "2027-03-31", esHito: false, prioridad: "Alto", campus: "Cúcuta", asignados: [equipo[1].id] }]);
  });
  it("«Actividad propia de la oficina» no lleva línea", () => {
    expect(actividadesListas(analizarActividades(hojaDe([fila({ linea: ACT_PROPIA })]), op))[0].lineaNo).toBeNull();
  });
  it("una línea que no es de la oficina no se importa y se explica", () => {
    const r = analizarActividades(hojaDe([fila({ linea: "999 · Otra línea" })]), op);
    expect(r.filas[0].datos).toBeNull();
    expect(r.filas[0].problemas[0]).toMatchObject({ nivel: "error", columna: "Línea del plan", fila: 5 });
    expect(r.filas[0].problemas[0].mensaje).toMatch(/no es una línea a cargo de Tecnología/);
  });
  it("un correo que no es de la oficina no se importa: un gestor solo asigna a su gente", () => {
    const r = analizarActividades(hojaDe([fila({ "resp:1": "intruso@otra.edu" })]), op);
    expect(r.filas[0].datos).toBeNull();
    expect(r.filas[0].problemas[0].mensaje).toMatch(/solo asigna a la gente de su oficina/);
  });
  it("una lectora de la oficina no recibe actividades", () => {
    const lectora = equipo.find((m) => !m.asignable)!;
    const r = analizarActividades(hojaDe([fila({ "resp:2": lectora.correo })]), op);
    expect(r.filas[0].problemas[0].mensaje).toMatch(/lectora/);
  });
  it("faltantes y fechas: mensajes por columna", () => {
    const r = analizarActividades(hojaDe([fila({ titulo: "", fin: "", prioridad: "", campus: "" })]), op);
    const col = r.filas[0].problemas.map((p) => p.columna);
    expect(col).toEqual(expect.arrayContaining(["Actividad", "Fecha de fin", "Prioridad", "Campus"]));
    expect(r.filas[0].datos).toBeNull();
    const f = analizarActividades(hojaDe([fila({ inicio: "mañana", fin: "2027-01-01" })]), op);
    expect(f.filas[0].problemas.map((p) => p.columna)).toContain("Fecha de inicio");
    const orden = analizarActividades(hojaDe([fila({ inicio: "2027-05-01", fin: "2027-03-01" })]), op);
    expect(orden.filas[0].problemas[0].mensaje).toMatch(/anterior a la de inicio/);
  });
  it("un hito no lleva inicio y acepta Sí", () => {
    const r = analizarActividades(hojaDe([fila({ hito: "Sí", inicio: "", fin: "2027-06-30" })]), op);
    expect(actividadesListas(r)[0]).toMatchObject({ esHito: true, inicio: null, fin: "2027-06-30" });
  });
  it("«campus» solo de la lista del portal; «sede» no existe", () => {
    const r = analizarActividades(hojaDe([fila({ campus: "Norte" })]), op);
    expect(r.filas[0].problemas[0].mensaje).toMatch(/campus «Norte» no existe/);
    expect(JSON.stringify(r)).not.toMatch(/\bsedes?\b/i);
  });
  it("las filas repetidas se avisan pero entran", () => {
    const r = analizarActividades(hojaDe([fila(), fila()]), op);
    expect(r.filas.filter((f) => f.datos)).toHaveLength(2);
    expect(r.filas[1].problemas.some((p) => p.nivel === "aviso" && /repetida/.test(p.mensaje))).toBe(true);
  });
  it("una fila con error no frena a las buenas", () => {
    const r = analizarActividades(hojaDe([fila(), fila({ titulo: "" }), fila({ titulo: "Otra" })]), op);
    expect(actividadesListas(r)).toHaveLength(2);
  });
  it("sin la hoja «Actividades» se explica", () => {
    expect(analizarActividades([{ nombre: "Hoja1", oculta: false, filas: [] }], op).error).toMatch(/No encuentro la hoja «Actividades»/);
  });
});

describe("plantilla de actividades ↔ importador (ida y vuelta, con exceljs)", () => {
  const semilla = generarActividades(lineasReales, [...PERSONAS_DEMO, { id: ID_YO, nombre: "Mariana Solano", oficina: "of-4", papel: "editor" }], HOY_DEMO, CAMPUS);
  const deTI = semilla.actividades.filter((a) => a.oficinaId === "of-4");
  const datos: DatosActividad[] = deTI.map((a) => ({ oficinaId: a.oficinaId, lineaNo: a.lineaNo, titulo: a.titulo, descripcion: a.descripcion ?? "", inicio: a.esHito ? null : a.inicio, fin: a.fin, esHito: a.esHito, prioridad: a.prioridad, campus: a.campus, asignados: a.asignados }));
  const base = { oficina: { id: "of-4", nombre: op.oficinaNombre }, equipo, lineas: delaOficina, campus: CAMPUS, plan: "PDIFyT 2027-2035", ahora: new Date("2027-06-30") };

  it("las hojas son Instrucciones, Actividades, Listas y _Control, con las dos últimas ocultas", () => {
    const h = hojasPlantillaActividades(base);
    expect(h.map((x) => x.nombre)).toEqual(["Instrucciones", "Actividades", "Listas", "_Control"]);
    expect(h.map((x) => Boolean(x.oculta))).toEqual([false, false, true, true]);
    expect(h[1].banner?.titulo).toMatch(/Tecnología/);
    // las listas desplegables: línea y responsables por rango de la hoja oculta; prioridad y campus en línea
    const idx = (id: string) => COLUMNAS_ACT.findIndex((c) => c.id === id);
    expect(h[1].listas?.[idx("linea")]).toEqual({ rango: expect.stringContaining("Listas") });
    expect(h[1].listas?.[idx("resp:1")]).toEqual({ rango: expect.stringContaining("Listas") });
    expect(h[1].listas?.[idx("prioridad")]).toEqual(["Crítico", "Alto", "Medio", "Bajo"]);
    expect(h[1].listas?.[idx("campus")]).toEqual(CAMPUS);
    // colores: amarillo obligatorio, azul claro opcional (tipos por columna) y gris en los dos ejemplos
    expect(h[1].tipos?.[idx("titulo")]).toBe("obligatoria");
    expect(h[1].tipos?.[idx("descripcion")]).toBe("diligenciar");
    expect(h[1].celdas?.every((c) => c.tipo === "bloqueada" && c.fila < 2)).toBe(true);
  });

  it("plantilla vacía: se lee, solo trae ejemplos y no importa nada", async () => {
    const buffer = await construirPlantillaActividades(base);
    const hojas = await leerLibro(buffer);
    const r = analizarActividades(hojas, op);
    expect(r.error).toBeNull();
    expect(r.origen).toBe("plantilla");
    expect(r.oficinaDelArchivo?.id).toBe("of-4");
    expect(r.ejemplosIgnorados).toBe(2);
    expect(actividadesListas(r)).toHaveLength(0);
    if (process.env.PS_F2_OUT) writeFileSync(`${process.env.PS_F2_OUT}/plantilla-actividades-vacia.xlsx`, Buffer.from(buffer));
  });

  it("plantilla llena → archivo → importar: las mismas actividades", async () => {
    expect(datos.length).toBeGreaterThan(20);
    const buffer = await construirPlantillaActividades({ ...base, actividades: datos });
    const r = analizarActividades(await leerLibro(buffer), op);
    expect(r.error).toBeNull();
    expect(r.ejemplosIgnorados).toBe(2);
    expect(r.filas.filter((f) => !f.datos)).toHaveLength(0);
    expect(actividadesListas(r)).toEqual(datos.map((d) => ({ ...d, titulo: d.titulo.trim() })));
    expect(problemasDeActividades(r).filter((p) => p.nivel === "error")).toHaveLength(0);
    if (process.env.PS_F2_OUT) writeFileSync(`${process.env.PS_F2_OUT}/plantilla-actividades-llena.xlsx`, Buffer.from(buffer));
  });

  it("una plantilla de otra oficina se rechaza con el motivo", async () => {
    const buffer = await construirPlantillaActividades({ ...base, oficina: { id: "of-3", nombre: "Infraestructura y Planta Física" } });
    const r = analizarActividades(await leerLibro(buffer), op);
    expect(r.error).toMatch(/se descargó para «Infraestructura y Planta Física»/);
  });

  it("un archivo que no es .xlsx se explica", async () => {
    await expect(leerLibro(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow(/no es un libro de Excel/);
  });
});
