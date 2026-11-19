import { describe, expect, it } from "vitest";
import real from "../datos/pdifyt-2027-2035.json";
import type { Linea, PsNivel } from "../modelo";
import { crearActividadesMemoria, YO_DEMO } from "./memoria";
import type { DatosActividad, PapelOficina } from "./modelo";
import { agrupar, filtrarActividades, ordenarLista } from "./filtros";
import { SIN_RESPONSABLE } from "./modelo";

const lineas = real as unknown as Linea[];
const api = (nivel: PsNivel, papel: PapelOficina | "ninguno") => crearActividadesMemoria({ nivel, papel, campus: ["Bucaramanga", "Valledupar", "Cúcuta"], lineas: async () => structuredClone(lineas), espera: async () => {} });
const nueva = (o: Partial<DatosActividad> = {}): DatosActividad => ({ oficinaId: "of-4", lineaNo: null, titulo: "Probar el adaptador", descripcion: "", inicio: "2027-07-01", fin: "2027-07-31", esHito: false, prioridad: "Medio", campus: "Bucaramanga", asignados: [], ...o });

describe("adaptador en memoria · oficinas por unidad, papel y herencia", () => {
  it("el administrador ve todas las oficinas y opera todo", async () => {
    const o = await api("admin", "ninguno").oficinasVisibles();
    expect(o).toHaveLength(6);
    expect(o.every((x) => x.poder === "gestor")).toBe(true);
  });
  it("gestor del módulo × jefe de TI: gestor en TI, colaborador en Infraestructura (editor), y no ve las demás", async () => {
    const o = await api("gestor", "jefe").oficinasVisibles();
    expect(o.map((x) => [x.id, x.papel, x.poder])).toEqual([["of-3", "editor", "colaborador"], ["of-4", "jefe", "gestor"]]);
  });
  it("colaborador × jefe: el techo del nivel manda", async () => {
    const o = await api("colaborador", "jefe").oficinasVisibles();
    expect(o.find((x) => x.id === "of-4")).toMatchObject({ papel: "jefe", poder: "colaborador" });
  });
  it("sin pertenecer a ninguna oficina no hay oficinas (estado vacío guiado)", async () => {
    expect(await api("gestor", "ninguno").oficinasVisibles()).toEqual([]);
  });
  it("cada oficina trae las líneas del plan que tiene a su cargo (los 75 reales repartidos)", async () => {
    const a = api("admin", "jefe");
    const total = (await Promise.all(["of-1", "of-2", "of-3", "of-4", "of-5", "of-6"].map((id) => a.lineasDeOficina(id)))).reduce((s, l) => s + l.length, 0);
    expect(total).toBe(75);
  });
  it("las actividades de demostración son estables (semilla fija) y de la oficina", async () => {
    const a = await api("admin", "jefe").actividades(["of-4"]);
    const b = await api("admin", "jefe").actividades(["of-4"]);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.length).toBeGreaterThan(15);
    expect(a.every((x) => x.demo && x.oficinaId === "of-4")).toBe(true);
  });
  it("sin ver la oficina no se leen sus actividades ni su equipo", async () => {
    const a = api("gestor", "jefe");
    expect(await a.actividades(["of-5"])).toEqual([]);
    await expect(a.equipo("of-5")).rejects.toThrow(/No puede ver/);
  });
});

describe("adaptador en memoria · mover, crear, asignar, transferir", () => {
  it("el gestor mueve a «Hecho»; queda en el historial", async () => {
    const a = api("gestor", "jefe");
    const x = (await a.actividades(["of-4"])).find((v) => v.estado === "en_curso")!;
    await a.moverActividad(x.id, "hecho");
    const d = await a.actividad(x.id);
    expect(d.actividad.estado).toBe("hecho");
    expect(d.eventos.at(-1)?.detalle).toMatch(/a «Hecho»/);
  });
  it("el colaborador mueve la suya hasta «En revisión» y se le rechaza «Hecho» y lo ajeno", async () => {
    const a = api("colaborador", "editor");
    const mias = (await a.actividades(["of-4"])).filter((v) => v.asignados.includes(YO_DEMO.id) && v.estado !== "hecho" && v.estado !== "en_revision");
    expect(mias.length).toBeGreaterThan(1);
    await a.moverActividad(mias[0].id, "en_revision");
    await expect(a.moverActividad(mias[0].id, "en_curso")).rejects.toThrow(/Ya está en revisión/);
    await expect(a.moverActividad(mias[1].id, "hecho")).rejects.toThrow(/hasta «En revisión»/);
    const ajena = (await a.actividades(["of-4"])).find((v) => !v.asignados.includes(YO_DEMO.id) && v.estado === "por_iniciar")!;
    await expect(a.moverActividad(ajena.id, "en_curso")).rejects.toThrow(/solo mueve las actividades que tiene asignadas/);
  });
  it("el lector no mueve nada", async () => {
    const a = api("gestor", "visor");
    const x = (await a.actividades(["of-4"]))[0];
    await expect(a.moverActividad(x.id, "en_riesgo")).rejects.toThrow(/solo puede mirar/);
  });
  it("crear: solo gestor; valida; avisa a quien recibe", async () => {
    const g = api("gestor", "jefe");
    const equipo = await g.equipo("of-4");
    const otro = equipo.find((m) => !m.esYo && m.asignable)!;
    const r = await g.guardarActividad(nueva({ asignados: [otro.id] }));
    expect(r.avisara.map((x) => x.personaId)).toEqual([otro.id]);
    expect((await g.actividad(r.id)).actividad).toMatchObject({ estado: "por_iniciar", asignados: [otro.id], titulo: "Probar el adaptador" });
    await expect(g.guardarActividad(nueva({ titulo: "x" }))).rejects.toThrow(/al menos 3 letras/);
    await expect(g.guardarActividad(nueva({ asignados: ["u-01"] }))).rejects.toThrow(/miembros de esta oficina/);
    await expect(api("gestor", "editor").guardarActividad(nueva())).rejects.toThrow(/Solo el gestor/);
  });
  it("editar conserva el id y solo avisa a quien se suma", async () => {
    const g = api("gestor", "jefe");
    const otro = (await g.equipo("of-4")).find((m) => !m.esYo && m.asignable)!;
    const { id } = await g.guardarActividad(nueva({ asignados: [otro.id] }));
    const r = await g.guardarActividad(nueva({ id, titulo: "Nuevo título", asignados: [otro.id] }));
    expect(r.id).toBe(id);
    expect(r.avisara).toEqual([]);
  });
  it("asignación masiva: solo a miembros de la oficina de cada actividad", async () => {
    const g = api("gestor", "jefe");
    const sin = (await g.actividades(["of-4"])).filter((v) => !v.asignados.length).slice(0, 3);
    expect(sin.length).toBe(3);
    const persona = (await g.equipo("of-4")).find((m) => m.id !== YO_DEMO.id && m.asignable)!;
    const r = await g.asignar(sin.map((v) => v.id), persona.id);
    expect(r.avisara).toHaveLength(1);
    for (const v of sin) expect((await g.actividad(v.id)).actividad.asignados).toContain(persona.id);
    await expect(g.asignar([sin[0].id], "u-01")).rejects.toThrow(/solo asigna a su oficina/);
    await expect(api("gestor", "editor").asignar([sin[0].id], persona.id)).rejects.toThrow(/Solo el gestor/);
  });
  it("transferir: motivo ≥ 20 caracteres, avisa a las partes y deja el historial con el motivo", async () => {
    const g = api("gestor", "jefe");
    const equipo = await g.equipo("of-4");
    const [de, a] = equipo.filter((m) => m.asignable && !m.esYo);
    const act = { ...nueva({ asignados: [de.id] }) };
    const { id } = await g.guardarActividad(act);
    await expect(g.transferir(id, de.id, a.id, "corto")).rejects.toThrow(/al menos 20 caracteres/);
    const r = await g.transferir(id, de.id, a.id, "El equipo de seguridad necesita más manos esta semana");
    expect(r.avisara.map((x) => x.motivo).sort()).toEqual(["transferencia_entra", "transferencia_sale"].sort());
    const d = await g.actividad(id);
    expect(d.actividad.asignados).toEqual([a.id]);
    expect(d.eventos.at(-1)).toMatchObject({ tipo: "transferida", de: de.id, a: a.id, motivo: "El equipo de seguridad necesita más manos esta semana" });
  });
  it("cargar actividades es todo o nada", async () => {
    const g = api("gestor", "jefe");
    const antes = (await g.actividades(["of-4"])).length;
    const mal = await g.cargarActividades("of-4", [nueva(), nueva({ titulo: "" })], "x.xlsx");
    expect(mal.creadas).toBe(0);
    expect(mal.errores[0]).toMatchObject({ fila: 2, campo: "act-titulo" });
    expect((await g.actividades(["of-4"])).length).toBe(antes);
    const bien = await g.cargarActividades("of-4", [nueva(), nueva({ titulo: "Otra actividad" })], "x.xlsx");
    expect(bien).toMatchObject({ creadas: 2, errores: [] });
    expect((await g.actividades(["of-4"])).length).toBe(antes + 2);
    await expect(api("gestor", "editor").cargarActividades("of-4", [nueva()], "x.xlsx")).rejects.toThrow(/Solo el gestor/);
  });
  it("checklist: lo marca el gestor o el asignado", async () => {
    const c = api("colaborador", "editor");
    const mia = (await c.actividades(["of-4"])).find((v) => v.asignados.includes(YO_DEMO.id) && v.checklist.length)!;
    await c.marcarChecklist(mia.id, mia.checklist[0].id, !mia.checklist[0].hecho);
    const ajena = (await c.actividades(["of-4"])).find((v) => !v.asignados.includes(YO_DEMO.id) && v.checklist.length)!;
    await expect(c.marcarChecklist(ajena.id, ajena.checklist[0].id, true)).rejects.toThrow(/No puede marcar/);
  });
});

describe("filtros, agrupación y orden", () => {
  const ctx = { nombreDe: (id: string) => id, nombreLinea: (no: string) => `${no} · Línea` };
  it("buscar ignora tildes y mayúsculas y exige todas las palabras", async () => {
    const acts = await api("admin", "jefe").actividades(["of-4"]);
    const r = filtrarActividades(acts, { q: "DIAGNÓSTICO redes", mias: false, yo: null }, ctx);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => /diagn.stico/i.test(a.titulo))).toBe(true);
    expect(filtrarActividades(acts, { q: "", mias: true, yo: YO_DEMO.id }, ctx).every((a) => a.asignados.includes(YO_DEMO.id))).toBe(true);
  });
  it("agrupar por estado siempre da los cinco cubos y reparte todo", async () => {
    const acts = await api("admin", "jefe").actividades(["of-4"]);
    const cols = agrupar(acts, "estado", { ...ctx, personas: [], campus: [], lineas: [] });
    expect(cols.map((c) => c.id)).toEqual(["por_iniciar", "en_curso", "en_riesgo", "en_revision", "hecho"]);
    expect(cols.reduce((s, c) => s + c.acts.length, 0)).toBe(acts.length);
  });
  it("agrupar por persona pone «Sin responsable» primero y repite a quien tiene dos responsables", async () => {
    const acts = await api("admin", "jefe").actividades(["of-4"]);
    const cols = agrupar(acts, "persona", { ...ctx, personas: [], campus: [], lineas: [] });
    expect(cols[0].id).toBe(SIN_RESPONSABLE);
    expect(cols.reduce((s, c) => s + c.acts.length, 0)).toBe(acts.reduce((s, a) => s + Math.max(1, a.asignados.length), 0));
  });
  it("agrupar por prioridad y por campus", async () => {
    const acts = await api("admin", "jefe").actividades(["of-4"]);
    expect(agrupar(acts, "prioridad", { ...ctx, personas: [], campus: [], lineas: [] }).map((c) => c.id)).toEqual(["Crítico", "Alto", "Medio", "Bajo"]);
    const camp = agrupar(acts, "campus", { ...ctx, personas: [], campus: ["Bucaramanga"], lineas: [] });
    expect(camp.reduce((s, c) => s + c.acts.length, 0)).toBe(acts.length);
  });
  it("ordenar la lista por fecha, ascendente y descendente", async () => {
    const acts = await api("admin", "jefe").actividades(["of-4"]);
    const o = { ...ctx, nombreOficina: () => "" };
    const asc = ordenarLista(acts, { col: "fin", dir: "asc" }, o).map((a) => a.fin ?? "9");
    expect(asc).toEqual([...asc].sort());
    const desc = ordenarLista(acts, { col: "fin", dir: "desc" }, o).map((a) => a.fin ?? "9");
    expect(desc).toEqual([...asc].reverse());
  });
});
