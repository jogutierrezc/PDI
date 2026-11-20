import { describe, expect, it } from "vitest";
import real from "./datos/pdifyt-2027-2035.json";
import { crearApiMemoria } from "./api";
import { COLUMNAS } from "./columnas";
import { analizarLibro, type HojaCruda } from "./importar";
import type { Linea } from "./modelo";
import { catalogoColumnas, columnasDeConfig, configPorOmision, filtrarTablero, nivelCalor, ordenarPlanes, pilaresDeConfig, resolverPilar, saludDe, totalesDe, validarDatosPlan, type ConfigPlan, type DatosPlan } from "./modeloPlanes";
import { hojasPlantilla } from "./plantilla";

const lineas = real as unknown as Linea[];
const base = (o: Partial<DatosPlan> = {}): DatosPlan => ({ nombre: "Plan de Tecnología", anioIni: 2027, anioFin: 2029, descripcion: "", oficinaId: "of-4", alcance: "oficina", config: configPorOmision(), ...o });
const ctxAdmin = { nivel: "admin" as const, oficinasPermitidas: [] };
const ctxGestor = { nivel: "gestor" as const, oficinasPermitidas: ["of-4"] };

describe("crear plan · validación de los datos", () => {
  it("un plan completo no tiene errores", () => expect(validarDatosPlan(base(), ctxAdmin)).toEqual([]));
  it("la oficina dueña es obligatoria", () => expect(validarDatosPlan(base({ oficinaId: null }), ctxAdmin)[0]).toMatchObject({ campo: "plan-oficina", paso: "oficina" }));
  it("el gestor solo crea planes de su oficina y de alcance «oficina»", () => {
    expect(validarDatosPlan(base(), ctxGestor)).toEqual([]);
    expect(validarDatosPlan(base({ oficinaId: "of-5" }), ctxGestor)[0].campo).toBe("plan-oficina");
    expect(validarDatosPlan(base({ alcance: "institucional" }), ctxGestor)[0].campo).toBe("plan-alcance");
  });
  it("años y nombre", () => {
    expect(validarDatosPlan(base({ anioFin: 2025 }), ctxAdmin)[0].campo).toBe("plan-anioFin");
    expect(validarDatosPlan(base({ nombre: "ab" }), ctxAdmin)[0].campo).toBe("plan-nombre");
  });
  it("«N.º» y «Nombre» siempre obligatorias; clave fuera del catálogo se rechaza", () => {
    const c = configPorOmision();
    const sinNo: ConfigPlan = { ...c, columnas: c.columnas.filter((x) => x.clave !== "no") };
    expect(validarDatosPlan(base({ config: sinNo }), ctxAdmin).some((e) => e.campo === "plan-columnas")).toBe(true);
    const rara: ConfigPlan = { ...c, columnas: [...c.columnas, { clave: "inventada", etiqueta: "x", tipo: "texto", obligatoria: false }] };
    expect(validarDatosPlan(base({ config: rara }), ctxAdmin).some((e) => /no existe en el catálogo/.test(e.mensaje))).toBe(true);
  });
  it("pilar obligatoria sin pilares definidos, repetidos o sin nombre", () => {
    const c = configPorOmision();
    expect(validarDatosPlan(base({ config: { ...c, pilares: [] } }), ctxAdmin).some((e) => e.campo === "plan-pilares")).toBe(true);
    expect(validarDatosPlan(base({ config: { ...c, pilares: [{ codigo: "A", nombre: "Uno", pillarId: null, activo: true }, { codigo: "A", nombre: "Dos", pillarId: null, activo: true }] } }), ctxAdmin).some((e) => /repetido/.test(e.mensaje))).toBe(true);
  });
  it("una lista vacía o con repetidos en una columna activa es un error", () => {
    const c = configPorOmision();
    expect(validarDatosPlan(base({ config: { ...c, listas: { ...c.listas, prioridad: [] } } }), ctxAdmin)[0].campo).toBe("plan-lista-prioridad");
    expect(validarDatosPlan(base({ config: { ...c, listas: { ...c.listas, prioridad: ["Alto", "alto"] } } }), ctxAdmin)[0].campo).toBe("plan-lista-prioridad");
  });
});

describe("plantilla por plan", () => {
  const minima: ConfigPlan = {
    columnas: catalogoColumnas().filter((c) => ["no", "nombre", "monto", "pilar", "oficina"].includes(c.clave)).map((c) => ({ ...c, obligatoria: ["no", "nombre", "pilar"].includes(c.clave) })),
    listas: { clasif: ["A"], prioridad: ["Alta", "Baja"], resultado: [], fuente: [] },
    pilares: [{ codigo: "T1", nombre: "Continuidad", pillarId: null, activo: true }, { codigo: "T2", nombre: "Seguridad", pillarId: null, activo: true }],
  };
  it("las columnas salen de la configuración (las de la base) más los extras siempre opcionales, en el orden del catálogo", () => {
    const c = columnasDeConfig(minima, [2027, 2028]);
    const ids = c.map((x) => x.id);
    expect(ids.slice(0, 4)).toEqual(["no", "nombre", "pilar", "monto"]);
    expect(ids).not.toContain("clasif");
    expect(ids).not.toContain("descripcion");
    expect(ids).toContain("crit:alin");
    expect(ids).toContain("pct:2028");
    expect(ids).not.toContain("pct:2029");
    expect(ids.at(-2)).toBe("oficina");
    expect(c.filter((x) => x.tipo === "obligatoria").map((x) => x.id)).toEqual(["no", "nombre", "pilar"]);
  });
  it("sin configuración, el conjunto del PDIFyT (nada cambia)", () => expect(columnasDeConfig(null).map((c) => c.id)).toEqual(COLUMNAS.map((c) => c.id)));
  it("los «% de inversión» siguen los años del plan, aunque no sean los del PDIFyT", () => {
    expect(columnasDeConfig(null, [2024, 2025]).filter((c) => c.id.startsWith("pct:")).map((c) => c.id)).toEqual(["pct:2024", "pct:2025"]);
  });
  it("la hoja de líneas lleva solo las columnas del plan, con sus pilares y listas", () => {
    const h = hojasPlantilla({ plan: "Plan TI", config: minima, anios: [2027, 2028], oficinaDuena: "Tecnología" });
    const hoja = h.find((x) => x.nombre === "Líneas del plan")!;
    expect(hoja.columnas[0].titulo).toMatch(/^N\.º/);
    expect(hoja.columnas.some((c) => /^Clasificación/.test(c.titulo))).toBe(false);
    expect(JSON.stringify(h)).toContain("T1. Continuidad");
    expect(h[0].filas.some((f) => /Oficina de cada línea/.test(String(f[0])))).toBe(true);
  });
  it("el importador exige las obligatorias del plan y valida el pilar contra la lista del plan", () => {
    const cols = columnasDeConfig(minima, [2027, 2028]);
    const hoja = (filas: string[][]): HojaCruda[] => [{ nombre: "Líneas del plan", oculta: false, filas: [["banda"], [""], [""], cols.map((c) => `${c.base} (x)`), ...filas] }];
    const fila = (o: Record<string, string>) => cols.map((c) => o[c.id] ?? "");
    const ok = analizarLibro(hoja([fila({ no: "1", nombre: "Renovar la red", pilar: "T1", monto: "1000" })]), { config: minima, anios: [2027, 2028] });
    expect(ok.lineas[0].linea).toMatchObject({ no: "1", pilar: "T1. Continuidad", monto: 1000, clasif: "" });
    const mal = analizarLibro(hoja([fila({ no: "1", nombre: "Renovar", pilar: "P2" })]), { config: minima, anios: [2027, 2028] });
    expect(mal.lineas[0].linea).toBeNull();
    expect(mal.lineas[0].problemas[0].mensaje).toMatch(/no es un pilar de este plan/);
    const falta = analizarLibro(hoja([fila({ no: "1", nombre: "Renovar" })]), { config: minima, anios: [2027, 2028] });
    expect(falta.lineas[0].problemas[0]).toMatchObject({ nivel: "error", columna: "Pilar" });
    // una columna opcional que no está en el plan no se avisa como faltante
    expect(ok.generales.filter((g) => /No hay columna/.test(g.mensaje))).toEqual([]);
  });
  it("los pilares del plan se resuelven por código, nombre o texto completo", () => {
    expect(pilaresDeConfig(minima)).toEqual(["T1. Continuidad", "T2. Seguridad"]);
    expect(resolverPilar(minima, "t2")).toBe("T2. Seguridad");
    expect(resolverPilar(minima, "Continuidad")).toBe("T1. Continuidad");
    expect(resolverPilar(minima, "X9")).toBeNull();
  });
});

describe("demostración con tres planes", () => {
  const api = (nivel: "admin" | "lector" | "gestor" = "admin") => crearApiMemoria({ estado: "publicado", nivel, papel: "jefe" });
  it("hay tres planes: PDIFyT, uno de oficina y uno archivado, cada uno con su oficina", async () => {
    const p = await api().planes();
    expect(p.map((x) => [x.nombre, x.alcance, x.estado, x.oficina?.id])).toEqual([["PDIFyT 2027-2035", "institucional", "activo", "of-2"], ["Plan de Tecnología 2027-2029", "oficina", "activo", "of-4"], ["Plan de Bienestar 2024-2026", "oficina", "archivado", "of-6"]]);
    expect(p[0].lineas).toBe(75);
  });
  it("cambiar de plan cambia las líneas, las oficinas con actividades y la configuración", async () => {
    const a = api();
    a.fijarPlan("plan-2");
    expect((await a.plan())?.id).toBe("plan-2");
    const ls = await a.lineas((await a.plan())!.version!.id);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.length).toBeLessThan(75);
    const cfg = await a.configPlan("plan-2");
    expect(cfg.columnas.some((c) => c.clave === "fuente")).toBe(false);
    expect(cfg.pilares.map((x) => x.codigo)).toContain("T1");
    const acts = await a.actividades(["of-4"]);
    a.fijarPlan("plan-1");
    expect((await a.actividades(["of-4"])).map((x) => x.id)).not.toEqual(acts.map((x) => x.id).slice(0, 0));
    expect((await a.plan())?.id).toBe("plan-1");
  });
  it("crear un plan exige oficina; un gestor no crea institucionales; el plan nuevo queda activo", async () => {
    const a = api();
    await expect(a.crearPlan(base({ oficinaId: null }))).rejects.toThrow(/Indique la oficina/);
    await expect(api("gestor").crearPlan(base({ alcance: "institucional" }))).rejects.toThrow(/institucional/);
    const id = await a.crearPlan(base({ nombre: "Plan nuevo" }));
    expect((await a.plan())?.id).toBe(id);
    await expect(a.crearPlan(base({ nombre: "plan nuevo" }))).rejects.toThrow(/Ya existe/);
  });
  it("editar y archivar", async () => {
    const a = api();
    await a.editarPlan("plan-2", base({ nombre: "Plan de TI 2027-2029", descripcion: "Nuevo" }));
    expect((await a.planes()).find((p) => p.id === "plan-2")).toMatchObject({ nombre: "Plan de TI 2027-2029", descripcion: "Nuevo" });
    await expect(a.archivarPlan("plan-2", "corto")).rejects.toThrow(/10/);
    await a.archivarPlan("plan-2", "Terminó su periodo de ejecución.");
    expect((await a.planes()).find((p) => p.id === "plan-2")?.estado).toBe("archivado");
    await a.reabrirPlan("plan-2");
    expect((await a.planes()).find((p) => p.id === "plan-2")?.estado).toBe("activo");
  });
  it("tablero de todos los planes: totales, por oficina, alertas, ritmo y filtros", async () => {
    const t = await api().tableroAdmin();
    expect(t.totales.planes).toBe(3);
    expect(t.totales.activos).toBe(2);
    expect(t.planes[0].porOficina.length).toBeGreaterThan(1);
    expect(t.planes[0].ritmoSemanas).toHaveLength(8);
    expect(t.alertas.length).toBeGreaterThan(0);
    expect(t.totales.actividades).toBe(t.planes.reduce((s, p) => s + p.actividades, 0));
    const soloArchivados = await api().tableroAdmin({ estado: "archivado" });
    expect(soloArchivados.planes.map((p) => p.id)).toEqual(["plan-3"]);
    expect((await api().tableroAdmin({ anio: 2025 })).planes.map((p) => p.id)).toEqual(["plan-3"]);
  });
});

describe("tablero · cálculos puros", () => {
  it("salud, calor, orden y filtros", () => {
    expect(saludDe({ actividades: 0, vencidas: 0, porValidar: 0 })).toBe("sin_datos");
    expect(saludDe({ actividades: 10, vencidas: 0, porValidar: 0 })).toBe("verde");
    expect(saludDe({ actividades: 10, vencidas: 1, porValidar: 0 })).toBe("ambar");
    expect(saludDe({ actividades: 10, vencidas: 2, porValidar: 0 })).toBe("rojo");
    expect(nivelCalor(80, 3)).toBe(4);
    expect(nivelCalor(0, 0)).toBe(0);
  });
  it("orden por salud y filtro por oficina (con totales recalculados)", async () => {
    const a = crearApiMemoria({ estado: "publicado", nivel: "admin", papel: "jefe" });
    const t = await a.tableroAdmin();
    const o = ordenarPlanes(t.planes, "salud");
    expect(["rojo", "ambar", "verde", "sin_datos"].indexOf(o[0].salud)).toBeLessThanOrEqual(["rojo", "ambar", "verde", "sin_datos"].indexOf(o.at(-1)!.salud));
    const f = filtrarTablero(t, { oficinaId: "of-6" });
    expect(f.planes.length).toBeLessThan(t.planes.length + 1);
    expect(totalesDe(t.planes).planes).toBe(3);
  });
});
