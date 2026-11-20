import { describe, expect, it } from "vitest";
import { crearApiMemoria, superponerEvaluaciones } from "../api";
import { lineasParaActividadDeJson, resumenAprobacionDeJson } from "./supabaseProy";
import { configPorOmision } from "../modeloPlanes";
import type { PsNivel } from "../modelo";
import type { LineasParaActividad } from "./contratoProy";
import {
  DATOS_PROYECTO_VACIOS, MIN_NOTA_PROYECTO, agruparPorOficina, ayudaLineasParaActividad, datosInicialesEvaluacion, distribuirParejo, estadoProyecto, filtrarLineasParaActividad, puedeEditarProyectos, puedeEvaluarProyecto,
  resumenAprobacion, siguienteClave, sumaEs100, sumaPorcentajes, textoTotalPct, validarEvaluacionProyecto, validarPlanParaEnviar, validarProyecto, type DatosEvaluacionProyecto,
} from "./modeloProy";

const NIVELES: PsNivel[] = ["none", "lector", "colaborador", "gestor", "aprobador", "financiero", "admin"];
const SI = { alin: true, deficit: true, norm: false, pdi: true, sost: true };
const VI = { tec: true, fin: true, op: false };
const ctx = { montoSolicitado: 1_000_000, anioIni: 2027, anioFin: 2035, prioridades: ["Crítico", "Alto", "Medio", "Largo plazo"] };
const ok = (o: Partial<DatosEvaluacionProyecto> = {}): DatosEvaluacionProyecto => ({
  decision: "aprobado", criterios: SI, viabilidad: VI, prioridad: "Alto", inicio: "2027-03-01", fin: "2028-12-15", pct: { "2027": 50, "2028": 50 }, montoAprobado: 1_000_000, nota: "", ...o,
});
const campos = (d: DatosEvaluacionProyecto) => validarEvaluacionProyecto(d, ctx).map((e) => e.campo);

describe("permisos por nivel", () => {
  it("solo el financiero y el administrador evalúan (aprobar o rechazar)", () => {
    expect(NIVELES.filter(puedeEvaluarProyecto)).toEqual(["financiero", "admin"]);
  });
  it("editan el borrador el administrador y el gestor de la oficina dueña; nunca una versión publicada", () => {
    expect(puedeEditarProyectos("admin", "admin", "borrador")).toBe(true);
    expect(puedeEditarProyectos("gestor", "gestor", "borrador")).toBe(true);
    expect(puedeEditarProyectos("gestor", "gestor", null)).toBe(true);
    expect(puedeEditarProyectos("gestor", "colaborador", "borrador")).toBe(false);
    expect(puedeEditarProyectos("lector", "lector", "borrador")).toBe(false);
    expect(puedeEditarProyectos("colaborador", "colaborador", "borrador")).toBe(false);
    expect(puedeEditarProyectos("admin", "admin", "publicada")).toBe(false);
    expect(puedeEditarProyectos("gestor", "gestor", "publicada")).toBe(false);
  });
});

describe("distribución anual", () => {
  it("la suma debe ser 100 (con tolerancia de centésimas)", () => {
    expect(sumaEs100(sumaPorcentajes({ a: 33.33, b: 33.33, c: 33.34 }))).toBe(true);
    expect(sumaEs100(sumaPorcentajes({ a: 50, b: 49 }))).toBe(false);
    expect(sumaEs100(sumaPorcentajes({ a: 50, b: null }))).toBe(false);
  });
  it("el total se anuncia con lo que falta o sobra", () => {
    expect(textoTotalPct(87.5)).toMatch(/faltan 12,5 puntos/);
    expect(textoTotalPct(103)).toMatch(/sobran 3 puntos/);
    expect(textoTotalPct(100)).toMatch(/completa/);
  });
  it("repartir parejo siempre suma 100", () => {
    for (const n of [1, 2, 3, 7, 9]) expect(sumaEs100(sumaPorcentajes(distribuirParejo(Array.from({ length: n }, (_, i) => 2027 + i))))).toBe(true);
  });
});

describe("evaluar un proyecto", () => {
  it("una aprobación completa no tiene errores", () => expect(campos(ok())).toEqual([]));
  it("rechazar pide solo una nota de al menos 20 caracteres", () => {
    expect(campos(ok({ decision: "rechazado", nota: "" }))).toEqual(["pe-nota"]);
    expect(campos(ok({ decision: "rechazado", nota: "x".repeat(MIN_NOTA_PROYECTO - 1) }))).toEqual(["pe-nota"]);
    expect(campos({ ...ok({ decision: "rechazado", nota: "No hay recursos en este periodo." }), criterios: { alin: null, deficit: null, norm: null, pdi: null, sost: null }, pct: {}, inicio: "", fin: "", prioridad: "", montoAprobado: null })).toEqual([]);
  });
  it("aprobar pide criterios y viabilidades respondidos, prioridad, fechas y monto", () => {
    const e = campos(ok({ criterios: { ...SI, pdi: null }, viabilidad: { ...VI, tec: null }, prioridad: "", inicio: "", fin: "", montoAprobado: null }));
    expect(e).toEqual(expect.arrayContaining(["pe-criterios", "pe-viabilidad", "pe-prioridad", "pe-inicio", "pe-fin", "pe-monto"]));
  });
  it("la distribución que no suma 100 se rechaza con el mensaje de cuánto falta", () => {
    const e = validarEvaluacionProyecto(ok({ pct: { "2027": 50, "2028": 37.5 } }), ctx);
    expect(e.map((x) => x.campo)).toEqual(["pe-pct"]);
    expect(e[0].mensaje).toMatch(/12,5/);
  });
  it("un porcentaje fuera de las fechas del proyecto es un error", () => {
    expect(campos(ok({ pct: { "2027": 50, "2030": 50 } }))).toEqual(["pe-pct"]);
  });
  it("fin anterior al inicio y fechas fuera de los años del plan", () => {
    expect(campos(ok({ inicio: "2028-05-01", fin: "2028-01-01", pct: { "2028": 100 } }))).toEqual(["pe-fin"]);
    expect(campos(ok({ inicio: "2026-05-01" }))).toContain("pe-inicio");
    expect(campos(ok({ fin: "2028-02-30" }))).toContain("pe-fin");
  });
  it("si el monto aprobado difiere del solicitado, la nota pide 20 caracteres", () => {
    expect(campos(ok({ montoAprobado: 800_000 }))).toEqual(["pe-nota"]);
    expect(campos(ok({ montoAprobado: 800_000, nota: "Se recorta el alcance de obra civil." }))).toEqual([]);
    expect(campos(ok({ montoAprobado: 0 }))).toContain("pe-monto");
  });
  it("el formulario precarga el monto solicitado", () => {
    const l = { ...lineaBase(), monto: 5_000_000 };
    expect(datosInicialesEvaluacion(l, [2027, 2028]).montoAprobado).toBe(5_000_000);
  });
});

function lineaBase() {
  return { no: "1", clasif: "PLF", nombre: "Proyecto", descripcion: null, campus: "Bucaramanga", pilar: "P2. Ambiente tecnológico", monto: 1_000_000, prioridad: "Alto", resultado: null, fuente: null, criterios: { alin: null, deficit: null, norm: null, pdi: null, sost: null }, viabilidad: { tec: null, fin: null, op: null, nor: null, est: null }, inicio: null, fin: null, pct: {}, origen: null, oficina: null, gestorCorreo: null };
}

describe("proyectos del plan", () => {
  const cfg = configPorOmision();
  const c = { config: cfg, campus: ["Bucaramanga", "Valledupar", "Cúcuta"], oficinas: ["Planeación Institucional"] };
  const bueno = { ...DATOS_PROYECTO_VACIOS, nombre: "Dotar laboratorios", campus: "Bucaramanga", pilar: "P2. Ambiente tecnológico", monto: 5_000_000, prioridad: "Alto", clasif: "PLF" };
  it("un proyecto completo pasa; faltan los obligatorios del plan", () => {
    expect(validarProyecto(bueno, c)).toEqual([]);
    expect(validarProyecto(DATOS_PROYECTO_VACIOS, c).map((e) => e.campo)).toEqual(expect.arrayContaining(["pr-nombre", "pr-campus", "pr-pilar", "pr-monto", "pr-prioridad"]));
  });
  it("campus, pilar, prioridad y oficina se validan contra las listas", () => {
    const e = validarProyecto({ ...bueno, campus: "Marte", pilar: "P9. X", prioridad: "Urgente", oficina: "Nadie" }, c).map((x) => x.campo);
    expect(e).toEqual(expect.arrayContaining(["pr-campus", "pr-pilar", "pr-prioridad", "pr-oficina"]));
  });
  it("el siguiente N.º conserva el prefijo", () => {
    expect(siguienteClave([])).toBe("1");
    expect(siguienteClave(["1", "2", "10"])).toBe("11");
    expect(siguienteClave(["T1", "T2"])).toBe("T3");
  });
  it("enviar: sin proyectos o con claves repetidas no pasa", () => {
    expect(validarPlanParaEnviar([], c)[0].mensaje).toMatch(/no tiene proyectos/);
    const l = { ...lineaBase(), oficina: null };
    expect(validarPlanParaEnviar([l, { ...l }], c).some((p) => /repetida/.test(p.mensaje))).toBe(true);
    expect(validarPlanParaEnviar([{ ...l, no: "1" }], c)).toEqual([]);
  });
});

describe("solicitado vs aprobado", () => {
  const a = { ...lineaBase(), no: "1", monto: 1000, resultado: "Aprobado", montoAprobado: 800, pct: { "2027": 0.5, "2028": 0.5 }, oficina: "TI" };
  const r = { ...lineaBase(), no: "2", monto: 500, resultado: "Rechazado", montoAprobado: 0, oficina: "TI" };
  const s = { ...lineaBase(), no: "3", monto: 200, resultado: null };
  it("clasifica y suma montos y cantidades", () => {
    expect([a, r, s].map(estadoProyecto)).toEqual(["aprobado", "rechazado", "sin_evaluar"]);
    const x = resumenAprobacion([a, r, s], [2027, 2028]);
    expect(x.solicitado).toEqual({ monto: 1700, n: 3 });
    expect(x.aprobado).toEqual({ monto: 800, n: 1 });
    expect(x.rechazado).toEqual({ monto: 500, n: 1 });
    expect(x.sinEvaluar).toEqual({ monto: 200, n: 1 });
    expect(x.porOficina.find((g) => g.clave === "TI")).toMatchObject({ solicitado: 1500, aprobado: 800 });
    expect(x.porAnio.map((g) => [g.aprobado, g.solicitado])).toEqual([[400, 500], [400, 500]]);
    expect(x.proyectos.map((p) => p.diferencia)).toEqual([-200, null, null]);
    expect(x.proyectos.map((p) => p.aprobado)).toEqual([800, null, null]);
  });
});

describe("proyectos para una actividad", () => {
  const l = (no: string, nombre: string) => ({ no, nombre, monto: 1, campus: "Todos", prioridad: "Alto", inicio: null, fin: null, clasif: "PLF" });
  const d: LineasParaActividad = { propias: [l("1", "Aulas")], otras: [{ ...l("5", "Redes"), oficinaId: "of-4", oficinaNombre: "TI" }, { ...l("6", "Becas"), oficinaId: "of-6", oficinaNombre: "Bienestar" }, { ...l("7", "Wifi"), oficinaId: "of-4", oficinaNombre: "TI" }], conOficina: 4, total: 9 };
  it("busca por nombre, número u oficina y conserva la elegida", () => {
    expect(filtrarLineasParaActividad(d, "red").otras.map((x) => x.no)).toEqual(["5"]);
    expect(filtrarLineasParaActividad(d, "bienestar").otras.map((x) => x.no)).toEqual(["6"]);
    expect(filtrarLineasParaActividad(d, "zzz", "5").otras.map((x) => x.no)).toEqual(["5"]);
  });
  it("agrupa las de otras oficinas", () => {
    expect(agruparPorOficina(d.otras).map((g) => [g.oficinaNombre, g.lineas.map((x) => x.no)])).toEqual([["Bienestar", ["6"]], ["TI", ["5", "7"]]]);
  });
  it("sin ninguna línea con oficina explica el motivo y, para el administrador, enlaza a asignar", () => {
    const vacio: LineasParaActividad = { propias: [], otras: [], conOficina: 0, total: 75 };
    expect(ayudaLineasParaActividad(vacio, "TI", true)).toMatchObject({ asignar: true });
    expect(ayudaLineasParaActividad(vacio, "TI", true).texto).toMatch(/oficina responsable/);
    expect(ayudaLineasParaActividad(vacio, "TI", false).asignar).toBe(false);
    expect(ayudaLineasParaActividad(d, "TI", true).asignar).toBe(false);
  });
});

describe("adaptador en memoria", () => {
  const api = (nivel: PsNivel, estado: "borrador" | "publicado" = "publicado") => crearApiMemoria({ nivel, estado });
  const sinEv = async (a: ReturnType<typeof api>) => {
    const p = await a.plan();
    return (await a.lineas(p!.version!.id)).find((l) => !l.resultado)!;
  };
  it("el financiero aprueba un proyecto sin evaluar y queda en el historial", async () => {
    const a = api("financiero");
    const l = await sinEv(a);
    const planId = (await a.plan())!.id;
    await a.proyectoEvaluar(planId, l.no, ok({ montoAprobado: l.monto, prioridad: "Alto" }));
    const v = (await a.lineas((await a.plan())!.version!.id)).find((x) => x.no === l.no)!;
    expect(estadoProyecto(v)).toBe("aprobado");
    expect((await a.proyectoEvaluaciones(planId, l.no))[0].decision).toBe("aprobado");
    const res = await a.resumenAprobacion(planId);
    expect(res.proyectos.find((p) => p.no === l.no)?.estado).toBe("aprobado");
  });
  it("el gestor y el lector no pueden evaluar (la regla se repite en el adaptador)", async () => {
    for (const n of ["gestor", "lector", "colaborador"] as const) {
      const a = api(n);
      const l = await sinEv(a);
      await expect(a.proyectoEvaluar((await a.plan())!.id, l.no, ok({ decision: "rechazado", nota: "x".repeat(25) }))).rejects.toThrow(/Sin permiso/);
    }
  });
  it("rechazar sin nota falla; con nota queda rechazado", async () => {
    const a = api("admin");
    const l = await sinEv(a);
    const planId = (await a.plan())!.id;
    await expect(a.proyectoEvaluar(planId, l.no, ok({ decision: "rechazado", nota: "corta" }))).rejects.toThrow(/nota/);
    await a.proyectoEvaluar(planId, l.no, ok({ decision: "rechazado", nota: "No hay recursos en el periodo." }));
    expect(estadoProyecto((await a.lineas((await a.plan())!.version!.id)).find((x) => x.no === l.no)!)).toBe("rechazado");
  });
  it("el gestor crea, edita y elimina en borrador; en versión publicada nada se edita", async () => {
    const g = api("gestor", "borrador");
    const planId = (await g.plan())!.id;
    const nuevo = await g.proyectoGuardar(planId, { ...DATOS_PROYECTO_VACIOS, nombre: "Proyecto nuevo", campus: "Cúcuta", pilar: "P2. Ambiente tecnológico", monto: 1_000, prioridad: "Alto", clasif: "PLF" });
    expect(nuevo.no).toBe("76");
    const editado = await g.proyectoGuardar(planId, { ...DATOS_PROYECTO_VACIOS, nombre: "Proyecto editado", campus: "Cúcuta", pilar: "P2. Ambiente tecnológico", monto: 2_000, prioridad: "Alto", clasif: "PLF" }, nuevo.no);
    expect(editado.nombre).toBe("Proyecto editado");
    await g.proyectoEliminar(planId, nuevo.no);
    expect((await g.lineas((await g.plan())!.version!.id)).some((l) => l.no === nuevo.no)).toBe(false);
    const p = api("admin", "publicado");
    await expect(p.proyectoGuardar((await p.plan())!.id, { ...DATOS_PROYECTO_VACIOS, nombre: "X", campus: "Cúcuta", pilar: "P2. Ambiente tecnológico", monto: 1, prioridad: "Alto", clasif: "PLF" })).rejects.toThrow(/publicada/);
    await expect(api("lector", "borrador").proyectoEliminar("plan-1", "1")).rejects.toThrow();
  });
  it("solo el administrador asigna oficinas; el resumen de sin oficina baja", async () => {
    const planId = "plan-1";
    await expect(api("gestor").proyectosAsignarOficina(planId, ["1"], "of-4")).rejects.toThrow(/Sin permiso/);
    const a = api("admin");
    expect((await a.proyectosAsignarOficina(planId, ["1", "2"], "of-4")).asignadas).toBe(2);
    const ls = await a.lineas((await a.plan())!.version!.id);
    expect(ls.filter((l) => l.oficina === "Tecnología e Infraestructura TI").map((l) => l.no)).toEqual(["1", "2"]);
  });
  it("abrir evaluaciones pendientes: solo admin y financiero; abre las de planes publicados sin evaluación", async () => {
    await expect(api("lector").vafAbrirPendientes()).rejects.toThrow(/Sin permiso/);
    const a = api("financiero");
    const r = await a.vafAbrirPendientes();
    expect(r.planes).toContain("Plan de Infraestructura 2027-2028");
    expect((await a.vafAbrirPendientes()).abiertas).toBe(0);
  });
  it("las líneas para una actividad separan las propias de las de otras oficinas", async () => {
    const a = api("gestor");
    const r = await a.lineasParaActividad("of-4");
    expect(r.propias.length + r.otras.length).toBe(r.total);
    expect(r.otras.every((x) => x.oficinaId !== "of-4")).toBe(true);
  });
});

describe("lectura de lo que devuelve la base (contrato 0291)", () => {
  it("ps_resumen_aprobacion → tarjetas, grupos y proyectos", () => {
    const ag = (s: number, a: number) => ({ solicitado: { monto: s, cantidad: 2 }, aprobado: { monto: a, cantidad: 1, solicitado: s, ajuste: a - s }, rechazado: { monto: 0, cantidad: 0 }, sin_evaluar: { monto: 0, cantidad: 0 } });
    const r = resumenAprobacionDeJson({
      totales: { solicitado: { monto: 1000, cantidad: 3 }, aprobado: { monto: 700, cantidad: 1 }, rechazado: { monto: 200, cantidad: 1 }, sin_evaluar: { monto: 100, cantidad: 1 } },
      por_pilar: [{ pilar: "P2. Ambiente", ...ag(500, 300) }], por_campus: [{ campus: "Bucaramanga", ...ag(500, 300) }], por_oficina: [{ unit_id: null, nombre: "Sin oficina", ...ag(500, 0) }], por_anio: [{ anio: 2027, solicitado: 10, aprobado: 8, diferencia: -2 }],
      solicitado_sin_distribuir: 50,
      proyectos: [{ clave: "28", nombre: "X", pilar: "P2", campus: "Bucaramanga", oficina: null, estado: "sin_evaluar", solicitado: 100, aprobado: null, diferencia: null }],
    });
    expect(r.aprobado).toEqual({ monto: 700, n: 1 });
    expect(r.sinEvaluar.n).toBe(1);
    expect(r.porPilar[0]).toMatchObject({ solicitado: 500, aprobado: 300 });
    expect(r.porAnio[0]).toMatchObject({ nombre: "2027", aprobado: 8 });
    expect(r.proyectos[0]).toMatchObject({ no: "28", estado: "sin_evaluar", aprobado: null });
    expect(r.solicitadoSinDistribuir).toBe(50);
  });
  it("ps_lineas_para_actividad → propias y de otras oficinas; sin oficina no se puede vincular", () => {
    const f = (clave: string, o: object | null, x: object) => ({ clave, nombre: `P${clave}`, pilar: "P2", campus: "Todos", prioridad: "Alto", oficina: o, propios: false, aporta: false, sin_oficina: !o, puede_vincular: Boolean(o), ...x });
    const r = lineasParaActividadDeJson([f("1", { unit_id: "a", nombre: "TI" }, { propios: true }), f("2", { unit_id: "b", nombre: "Bienestar" }, { aporta: true }), f("3", null, { aporta: true })], "a");
    expect(r.propias.map((x) => x.no)).toEqual(["1"]);
    expect(r.otras.map((x) => [x.no, x.oficinaNombre])).toEqual([["2", "Bienestar"]]);
    expect([r.conOficina, r.total]).toEqual([2, 3]);
  });
  it("la evaluación vigente se pone sobre la línea (pct de 0-100 a fracción)", () => {
    const l = { ...lineaBase(), lineaId: "u1" };
    const ev = new Map([["u1", { linea_id: "u1", resultado: "Aprobado", monto_aprobado: 900, nota: "Se ajusta.", prioridad: "Crítico", inicio: "2027-01-10", fin: "2027-12-10", pct: { "2027": 100 }, criterios: { alin: true }, viabilidad: { tec: "Sí" } }]]);
    const [x] = superponerEvaluaciones([l], ev);
    expect(estadoProyecto(x)).toBe("aprobado");
    expect(x).toMatchObject({ montoAprobado: 900, prioridad: "Crítico", pct: { "2027": 1 } });
    expect(x.criterios.alin).toBe(true);
    expect(x.viabilidad.tec).toBe(true);
  });
});
