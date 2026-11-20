import { describe, expect, it } from "vitest";
import real from "../datos/pdifyt-2027-2035.json";
import type { Linea, PsNivel } from "../modelo";
import { crearActividadesMemoria } from "./memoria";
import type { PapelOficina } from "./modelo";

const lineas = real as unknown as Linea[];
const api = (nivel: PsNivel, papel: PapelOficina | "ninguno") => crearActividadesMemoria({ nivel, papel, campus: ["Bucaramanga", "Valledupar", "Cúcuta"], lineas: async () => structuredClone(lineas), espera: async () => {} });
const datos = { fecha: "2027-06-30", fisico: 80, financiero: null, nota: "Se completó la etapa y queda el soporte.", evidencias: [], riesgo: null };

describe("demostración · avances, evidencias, riesgos y PDI", () => {
  it("hay avances en los tres estados, evidencias, riesgos y actividades con y sin PDI", async () => {
    const a = api("admin", "jefe");
    const acts = await a.actividades(["of-3", "of-4", "of-5", "of-6"]);
    const dets = await Promise.all(acts.map((x) => a.actividad(x.id)));
    const estados = new Set(dets.flatMap((d) => d.avances.map((v) => v.estado)));
    expect([...estados].sort()).toEqual(["devuelto", "pendiente", "validado"]);
    expect(dets.some((d) => d.avances.some((v) => v.evidencias.length))).toBe(true);
    expect(dets.some((d) => d.riesgos.some((r) => r.acciones.length))).toBe(true);
    expect(new Set(acts.map((x) => x.pdi.conexion)).size).toBe(3);
    expect((await a.catalogoPdi()).length).toBeGreaterThan(2);
  });
  it("el avance de la actividad es el del último validado; hecho = 100", async () => {
    const a = api("admin", "jefe");
    const acts = await a.actividades(["of-4"]);
    expect(acts.filter((x) => x.estado === "hecho").every((x) => x.avance.fisico === 100)).toBe(true);
    expect(acts.filter((x) => x.estado === "por_iniciar").every((x) => x.avance.fisico === 0)).toBe(true);
  });
  it("el colaborador reporta: avance pendiente y la actividad pasa a «En revisión»; monotonía y fecha", async () => {
    const a = api("colaborador", "editor");
    const x = (await a.actividades(["of-4"])).find((v) => v.asignados.includes("u-yo") && v.estado !== "hecho" && v.estado !== "en_revision" && v.avance.pendientes === 0)!;
    await expect(a.reportarAvance(x.id, { ...datos, fisico: x.avance.fisico - 1 })).rejects.toThrow(/no puede bajar|0 a 100/);
    await expect(a.reportarAvance(x.id, { ...datos, fecha: "2030-01-01" })).rejects.toThrow(/futura/);
    const r = await a.reportarAvance(x.id, { ...datos, fisico: Math.max(80, x.avance.fisico), riesgo: { titulo: "El proveedor puede fallar", descripcion: "", nivel: "Alto", mitigacion: "" } });
    expect(r.avance.estado).toBe("pendiente");
    const d = await a.actividad(x.id);
    expect(d.actividad.estado).toBe("en_revision");
    expect(d.actividad.avance.pendientes).toBe(1);
    expect(d.riesgos.some((q) => q.titulo === "El proveedor puede fallar")).toBe(true);
    await expect(a.reportarAvance(x.id, datos)).rejects.toThrow(/esperando/);
  });
  it("nadie valida lo propio; otro gestor sí; 100 % deja la actividad hecha; devolver pide nota", async () => {
    const colab = api("colaborador", "editor");
    const x = (await colab.actividades(["of-4"])).find((v) => v.asignados.includes("u-yo") && v.estado !== "hecho" && v.estado !== "en_revision" && v.avance.pendientes === 0)!;
    await colab.reportarAvance(x.id, { ...datos, fisico: 100 });
    // el colaborador no valida
    const prop = (await colab.actividad(x.id)).avances.find((v) => v.estado === "pendiente")!;
    await expect(colab.validarAvance(prop.id)).rejects.toThrow(/gestor/);
    // un gestor (jefe de TI) revisa lo ajeno
    const g = api("gestor", "jefe");
    const cola = await g.avancesPorValidar("of-4");
    expect(cola.length).toBeGreaterThan(0);
    const ajeno = cola.find((c) => c.puedeValidar)!;
    await expect(g.devolverAvance(ajeno.avance.id, "corto")).rejects.toThrow(/20/);
    await g.validarAvance(ajeno.avance.id);
    expect((await g.actividad(ajeno.actividad.id)).avances.find((v) => v.id === ajeno.avance.id)!.estado).toBe("validado");
  });
  it("el lote es todo o nada y hasta 50", async () => {
    const g = api("gestor", "jefe");
    const cola = (await g.avancesPorValidar("of-4")).filter((c) => c.puedeValidar);
    expect(cola.length).toBeGreaterThan(1);
    await expect(g.validarLote(["no-existe", cola[0].avance.id])).rejects.toThrow();
    expect((await g.avancesPorValidar("of-4")).length).toBeGreaterThanOrEqual(cola.length); // no se validó ninguno
    await expect(g.validarLote(Array.from({ length: 51 }, (_, i) => `x${i}`))).rejects.toThrow(/50/);
    const r = await g.validarLote(cola.map((c) => c.avance.id));
    expect(r.validados).toBe(cola.length);
  });
  it("devolver deja el avance devuelto y la actividad en curso", async () => {
    const g = api("gestor", "jefe");
    const f = (await g.avancesPorValidar("of-4")).find((c) => c.puedeValidar)!;
    await g.devolverAvance(f.avance.id, "Falta adjuntar el acta firmada de la reunión.");
    const d = await g.actividad(f.actividad.id);
    expect(d.actividad.estado).toBe("en_curso");
    expect(d.avances.find((v) => v.id === f.avance.id)).toMatchObject({ estado: "devuelto", notaRevision: "Falta adjuntar el acta firmada de la reunión." });
  });
  it("cierre administrativo: «Hecha» al 100 %, autovalidado y auditado; el colaborador no puede", async () => {
    const g = api("gestor", "jefe");
    const x = (await g.actividades(["of-4"])).find((v) => v.estado === "en_curso" && v.avance.pendientes === 0)!;
    await expect(g.cerrarActividad(x.id, "corta")).rejects.toThrow(/10/);
    expect(await g.cerrarActividad(x.id, "Se entregó y se recibió a satisfacción.")).toEqual({ autovalidado: true });
    const d = await g.actividad(x.id);
    expect(d.actividad).toMatchObject({ estado: "hecho", avance: { fisico: 100 } });
    expect(d.avances[0].autovalidado).toBe(true);
    await expect(api("colaborador", "editor").cerrarActividad(x.id, "Se entregó y se recibió.")).rejects.toThrow(/gestor/);
  });
  it("riesgos y acciones: crear, acción con responsable y vence, marcar, cerrar", async () => {
    const g = api("gestor", "jefe");
    const x = (await g.actividades(["of-4"])).find((v) => v.estado === "en_curso")!;
    const r = await g.crearRiesgo(x.id, { titulo: "Retraso de Compras", descripcion: "", nivel: "Crítico", mitigacion: "" });
    const ac = await g.crearAccion(r.id, { texto: "Llamar al proveedor", responsableId: "u-12", vence: "2027-07-15" });
    await g.marcarAccion(ac.id, "hecha");
    await g.cerrarRiesgo(r.id, "Se resolvió con otro proveedor");
    const d = (await g.actividad(x.id)).riesgos.find((q) => q.id === r.id)!;
    expect(d.estado).toBe("cerrado");
    expect(d.acciones[0]).toMatchObject({ estado: "hecha", responsableId: "u-12", vence: "2027-07-15" });
    await expect(g.crearRiesgo(x.id, { titulo: "x", descripcion: "", nivel: "Alto", mitigacion: "" })).rejects.toThrow();
    await expect(api("lector", "ninguno" as never).crearRiesgo(x.id, { titulo: "Algo pasa", descripcion: "", nivel: "Alto", mitigacion: "" })).rejects.toThrow();
  });
  it("crear una actividad exige elegir la conexión con el PDI", async () => {
    const g = api("gestor", "jefe");
    const base = { oficinaId: "of-4", lineaNo: null, titulo: "Probar el PDI", descripcion: "", inicio: "2027-07-01", fin: "2027-07-31", esHito: false, prioridad: "Medio" as const, campus: "Bucaramanga", asignados: [] };
    await expect(g.guardarActividad({ ...base, pdi: { conexion: "sin_definir", items: [] } })).rejects.toThrow(/Elija una/);
    const cat = await g.catalogoPdi();
    const r = await g.guardarActividad({ ...base, pdi: { conexion: "con_pdi", items: [{ pillarId: cat[0].pillarId, lineaId: cat[0].areas[0].lineas[0].lineaId }] } });
    expect((await g.actividad(r.id!)).actividad.pdi.items[0].lineaCodigo).toBe(cat[0].areas[0].lineas[0].codigo);
    expect((await g.resumenPdi("of-4")).conPdi).toBeGreaterThan(0);
  });
  it("plazos por oficina: el gestor fija los suyos y vuelve al general; otra oficina no", async () => {
    const g = api("gestor", "jefe");
    const c = { diasAntes: [10, 2], vencidaMaxAvisos: 2, vencidaGestorHoras: 24, validarHoras: 48, activo: true };
    expect((await g.leerConfigAvisos("of-4")).propia).toBeNull();
    const r = await g.guardarConfigAvisos("of-4", c);
    expect(r.efectiva).toEqual(c);
    expect(r.porDefecto.validarHoras).toBe(72);
    await expect(g.guardarConfigAvisos("of-4", { ...c, diasAntes: [99] })).rejects.toThrow();
    await expect(g.guardarConfigAvisos("of-3", c)).rejects.toThrow(/gestor/); // en of-3 es colaborador
    expect((await g.quitarConfigAvisos("of-4")).propia).toBeNull();
  });
  it("evidencia: tipo no permitido se rechaza; huella y ruta", async () => {
    const g = api("gestor", "jefe");
    const f = new File(["hola"], "acta.pdf", { type: "application/pdf" });
    const e = await g.subirEvidencia("of-4", "a-1", f, "abc");
    expect(e).toMatchObject({ tipo: "archivo", nombre: "acta.pdf", huella: "abc" });
    expect(e.storagePath).toMatch(/^of-4\/a-1\/.+acta\.pdf$/);
    await expect(g.subirEvidencia("of-4", "a-1", new File(["x"], "a.exe"), "h")).rejects.toThrow(/no está permitido/);
  });
});
