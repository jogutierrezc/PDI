import { describe, expect, it } from "vitest";
import { PS_NIVELES, compile, decompile, templateMatrix } from "../../admin/usuarios/role-matrix";
import real from "../datos/pdifyt-2027-2035.json";
import { crearApiMemoria } from "../api";
import type { HojaCruda } from "../importar";
import type { Linea, PsNivel } from "../modelo";
import { COLUMNAS_VAF, analizarEjecucion, analizarFinanciacion, filasListasVaf, hojasPlantillaVaf, problemasVaf } from "./excelVaf";
import {
  alertasDeLinea, antiguedadDias, cifrasDeMovimientos, desviacionDe, esFinanciero, estadoFinancieroDeConteos, estadoFinancieroLinea, estadoFinancieroPlan, pesosCompletos, pesosCortos, validarAnulacion, validarEvaluacion, validarFinanciacion, validarMovimiento, validarUmbrales, veFinanciacion, veSoloSusLineas,
} from "./modeloVaf";

const lineas = real as unknown as Linea[];
const api = (nivel: PsNivel, papel: "jefe" | "editor" | "ninguno" = "jefe") => crearApiMemoria({ estado: "publicado", nivel, papel });

describe("pesos legibles", () => {
  it("completos con formato es-CO y cortos con M y MM (miles de millones)", () => {
    expect(pesosCompletos(1250000000)).toBe("$ 1.250.000.000");
    expect(pesosCompletos(-5000)).toBe("−$ 5.000");
    expect(pesosCortos(12_500_000_000)).toBe("$ 12,5 MM");
    expect(pesosCortos(155_829_000_000)).toBe("$ 156 MM");
    expect(pesosCortos(1_250_000)).toBe("$ 1,3 M");
    expect(pesosCortos(480_000_000)).toBe("$ 480 M");
    expect(pesosCortos(250_000)).toBe("$ 250.000");
    expect(pesosCortos(null)).toBe("—");
  });
});

describe("quién puede qué", () => {
  it("escriben la VAF y el administrador; leen aprobador y lector; las oficinas, solo sus líneas", () => {
    expect([esFinanciero("financiero"), esFinanciero("admin"), esFinanciero("gestor"), esFinanciero("aprobador")]).toEqual([true, true, false, false]);
    expect([veFinanciacion("lector"), veFinanciacion("aprobador"), veFinanciacion("gestor"), veFinanciacion("none")]).toEqual([true, true, false, false]);
    expect(veSoloSusLineas("gestor") && veSoloSusLineas("colaborador") && !veSoloSusLineas("lector")).toBe(true);
  });
  it("el nivel financiero se ofrece en Roles y se guarda y recupera", () => {
    expect(PS_NIVELES.some((n) => n.id === "financiero" && /VAF/.test(n.label) && /Director VAF/.test(n.hint))).toBe(true);
    const m = templateMatrix("consulta");
    m.modules["planeacion-seguimiento"] = { level: "ver", screens: ["planeacion_seguimiento"] };
    m.ps.nivel = "financiero";
    expect(compile(m).ps_nivel).toBe("financiero");
    expect(decompile({ ...compile(m) }, []).ps.nivel).toBe("financiero");
  });
});

describe("evaluación del plan", () => {
  it("observaciones de al menos 20 caracteres con ajustes o no viable; monto salvo no viable", () => {
    expect(validarEvaluacion({ estado: "", montoAprobado: null, fuente: "", observaciones: "" })[0].campo).toBe("ev-estado");
    expect(validarEvaluacion({ estado: "aprobada", montoAprobado: 100, fuente: "", observaciones: "" })).toEqual([]);
    expect(validarEvaluacion({ estado: "aprobada", montoAprobado: null, fuente: "", observaciones: "" })[0].campo).toBe("ev-monto");
    expect(validarEvaluacion({ estado: "aprobada_con_ajustes", montoAprobado: 100, fuente: "", observaciones: "corto" })[0].campo).toBe("ev-obs");
    expect(validarEvaluacion({ estado: "no_viable", montoAprobado: null, fuente: "", observaciones: "No hay recursos para el periodo del plan." })).toEqual([]);
  });
  it("el estado financiero del plan sale del historial o de los conteos del tablero", () => {
    expect(estadoFinancieroPlan([{ estado: "no_viable", creadoEn: "2027-01-01" }, { estado: "en_revision", creadoEn: "2027-03-01" }])).toBe("en_revision");
    expect(estadoFinancieroPlan([])).toBe("sin_evaluar");
    expect(estadoFinancieroDeConteos({ pendientes: 1, aprobadas: 2, ajustadas: 0, noViables: 1 })).toBe("pendiente");
    expect(estadoFinancieroDeConteos({ pendientes: 0, aprobadas: 2, ajustadas: 1, noViables: 0 })).toBe("aprobada_con_ajustes");
    expect(estadoFinancieroDeConteos(undefined)).toBe("sin_evaluar");
    expect(antiguedadDias("2027-06-18T12:00:00Z", "2027-06-30T12:00:00Z")).toBe(12);
  });
});

describe("financiación y libro", () => {
  const vig = { ini: 2027, fin: 2029 };
  it("financiación: año dentro del plan, monto no negativo, nota con ajuste o rechazo", () => {
    expect(validarFinanciacion({ anio: 2028, monto: 1000, fuente: "", estado: "aprobada", nota: "" }, vig)).toEqual([]);
    expect(validarFinanciacion({ anio: 2035, monto: 1000, fuente: "", estado: "aprobada", nota: "" }, vig)[0].campo).toBe("fn-anio");
    expect(validarFinanciacion({ anio: 2028, monto: -1, fuente: "", estado: "aprobada", nota: "" }, vig)[0].campo).toBe("fn-monto");
    expect(validarFinanciacion({ anio: 2028, monto: 10, fuente: "", estado: "ajustada", nota: "corta" }, vig)[0].campo).toBe("fn-nota");
    expect(estadoFinancieroLinea([{ estado: "aprobada" }, { estado: "sin_evaluar" }])).toBe("parcial");
    expect(estadoFinancieroLinea([{ estado: "aprobada" }, { estado: "ajustada" }])).toBe("ajustada");
    expect(estadoFinancieroLinea([{ estado: "aprobada" }, { estado: "rechazada" }])).toBe("rechazada");
    expect(estadoFinancieroLinea([{ estado: "sin_evaluar" }])).toBe("sin_evaluar");
  });
  it("movimiento: monto distinto de cero, negativo solo en una modificación, fecha no futura, año del plan", () => {
    const ok = { anio: 2027, tipo: "ejecutado" as const, monto: 500, fecha: "2027-05-01", fuente: "", referencia: "", nota: "" };
    const ctx = { hoy: "2027-06-30", ini: 2027, fin: 2029 };
    expect(validarMovimiento(ok, ctx)).toEqual([]);
    expect(validarMovimiento({ ...ok, monto: 0 }, ctx)[0].campo).toBe("mv-monto");
    expect(validarMovimiento({ ...ok, monto: -5 }, ctx)[0].mensaje).toMatch(/modificación/);
    expect(validarMovimiento({ ...ok, tipo: "modificacion", monto: -5 }, ctx)).toEqual([]);
    expect(validarMovimiento({ ...ok, fecha: "2027-07-01" }, ctx)[0].campo).toBe("mv-fecha");
    expect(validarMovimiento({ ...ok, anio: 2040 }, ctx)[0].campo).toBe("mv-anio");
    expect(validarAnulacion("corto")).not.toBeNull();
    expect(validarAnulacion("Se registró en la línea equivocada.")).toBeNull();
  });
  it("cifras: aprobado, modificado, vigente, disponible y % de ejecución; una anulación resta", () => {
    const m = (tipo: "aprobado" | "ejecutado" | "modificacion" | "comprometido", monto: number, anulaId: string | null = null) => ({ anio: 2027, tipo, monto, anulaId });
    const { total } = cifrasDeMovimientos([m("aprobado", 1000), m("modificacion", -100), m("comprometido", 700), m("ejecutado", 450), m("ejecutado", 100, "x")]);
    expect(total).toMatchObject({ aprobado: 1000, modificado: -100, vigente: 900, comprometido: 700, ejecutado: 350, disponible: 200, pctEjecucion: 38.9 });
    // sin movimientos de aprobado, cuenta lo aprobado por la VAF
    expect(cifrasDeMovimientos([], { 2027: 800 }).total).toMatchObject({ aprobado: 800, vigente: 800, disponible: 800 });
    expect(desviacionDe(60, 40)).toBe(20);
    expect(desviacionDe(null, 40)).toBeNull();
  });
});

describe("vigilancia", () => {
  const base = { planId: "p", lineaId: "p::1", clave: "1", nombre: "Línea", oficinaId: "of-4", vigente: 1000, ejecutado: 500, aprobado: 1000, pctEjecucion: 50, desviacion: 0, ultimoMovimiento: "2027-06-01", tieneFinanciacion: true };
  const u = { umbralDesviacion: 15, umbralSobreejecucion: 100, mesesSinEjecucion: 3 };
  it("cada tipo de alerta con su severidad", () => {
    expect(alertasDeLinea(base, u, "2027-06-30")).toEqual([]);
    expect(alertasDeLinea({ ...base, ejecutado: 1200, pctEjecucion: 120 }, u, "2027-06-30")[0]).toMatchObject({ tipo: "sobreejecucion", severidad: "alta" });
    expect(alertasDeLinea({ ...base, desviacion: 20 }, u, "2027-06-30")[0]).toMatchObject({ tipo: "ejecucion_sobre_avance", severidad: "media" });
    expect(alertasDeLinea({ ...base, desviacion: -20 }, u, "2027-06-30")[0]).toMatchObject({ tipo: "avance_sobre_ejecucion", severidad: "baja" });
    expect(alertasDeLinea({ ...base, ultimoMovimiento: "2027-01-10" }, u, "2027-06-30")[0]).toMatchObject({ tipo: "sin_movimientos", severidad: "media" });
    expect(alertasDeLinea({ ...base, ultimoMovimiento: null, vigente: 0, aprobado: 0, ejecutado: 0, tieneFinanciacion: false }, u, "2027-06-30")[0]).toMatchObject({ tipo: "sin_evaluar_vaf", severidad: "baja" });
  });
  it("los umbrales tienen rangos", () => {
    expect(validarUmbrales(u)).toEqual([]);
    expect(validarUmbrales({ ...u, umbralDesviacion: 0 })[0].campo).toBe("um-desv");
    expect(validarUmbrales({ ...u, umbralSobreejecucion: 400 })[0].campo).toBe("um-sobre");
    expect(validarUmbrales({ ...u, mesesSinEjecucion: 30 })[0].campo).toBe("um-meses");
  });
});

describe("Excel de financiación y ejecución", () => {
  const op = { planId: "plan-1", planNombre: "PDIFyT", lineas: lineas.slice(0, 5).map((l) => ({ no: l.no, nombre: l.nombre })), anioIni: 2027, anioFin: 2035, hoy: "2027-06-30" };
  const hoja = (tipo: "financiacion" | "ejecucion", filas: Record<string, string>[]): HojaCruda[] => {
    const cols = COLUMNAS_VAF[tipo];
    return [{ nombre: tipo === "financiacion" ? "Financiación" : "Ejecución", oculta: false, filas: [["banda"], [""], [""], cols.map((c) => `${c.base} (x)`), ...filas.map((f) => cols.map((c) => f[c.id] ?? ""))] }];
  };
  it("la plantilla trae instrucciones, datos con listas, líneas y control", () => {
    for (const t of ["financiacion", "ejecucion"] as const) {
      const h = hojasPlantillaVaf(t, op);
      expect(h.map((x) => x.nombre)).toEqual(["Instrucciones", t === "financiacion" ? "Financiación" : "Ejecución", "Listas", "_Control"]);
      expect(h[1].columnas.length).toBe(COLUMNAS_VAF[t].length);
      expect(h[2].oculta).toBe(true);
    }
  });
  it("financiación: filas válidas, estado en español y monto con puntos", () => {
    const r = analizarFinanciacion(hoja("financiacion", [{ linea: `${op.lineas[0].no} · x`, anio: "2027", monto: "1.250.000.000", estado: "Ajustada", nota: "Se ajusta al techo del año." }, { linea: op.lineas[1].no, anio: "2028", monto: "500" }]), op);
    expect(r.error).toBeNull();
    expect(filasListasVaf(r)).toEqual([
      { linea: op.lineas[0].no, anio: 2027, montoAprobado: 1250000000, fuente: "", estado: "ajustada", nota: "Se ajusta al techo del año." },
      { linea: op.lineas[1].no, anio: 2028, montoAprobado: 500, fuente: "", estado: "aprobada", nota: "" },
    ]);
  });
  it("financiación: errores por fila y columna; una fila mala no deja cargar nada (todo o nada)", () => {
    const r = analizarFinanciacion(hoja("financiacion", [{ linea: "999", anio: "2027", monto: "100" }, { linea: op.lineas[0].no, anio: "2050", monto: "x" }, { linea: op.lineas[0].no, anio: "2027", monto: "10", estado: "Rechazada" }, { linea: op.lineas[0].no, anio: "2027", monto: "10" }, { linea: op.lineas[0].no, anio: "2027", monto: "20" }]), op);
    const errs = problemasVaf(r).filter((p) => p.nivel === "error");
    expect(errs.find((p) => p.fila === 5 && p.columna === "N.º de la línea")?.mensaje).toMatch(/no es una línea de este plan/);
    expect(errs.some((p) => p.fila === 6 && p.columna === "Año")).toBe(true);
    expect(errs.some((p) => p.fila === 6 && p.columna === "Monto aprobado")).toBe(true);
    expect(errs.some((p) => p.fila === 7 && p.columna === "Nota")).toBe(true);
    expect(errs.some((p) => p.fila === 9 && /ya están en la fila 8/.test(p.mensaje))).toBe(true);
    // La pantalla no deja cargar mientras haya una fila con error (todo o nada): lo bueno no se envía solo.
    expect(r.filas.filter((f) => !f.datos).length).toBeGreaterThanOrEqual(4);
  });
  it("ejecución: tipo en español, fecha vacía es hoy, negativo solo en modificación, fecha no futura", () => {
    const l = op.lineas[0].no;
    const r = analizarEjecucion(hoja("ejecucion", [{ linea: l, anio: "2027", tipo: "Ejecutado", monto: "300000000" }, { linea: l, anio: "2027", tipo: "Modificación", monto: "-100", fecha: "2027-05-01" }]), op);
    expect(filasListasVaf(r)).toMatchObject([{ tipo: "ejecutado", monto: 300000000, fecha: "2027-06-30" }, { tipo: "modificacion", monto: -100 }]);
    const mal = analizarEjecucion(hoja("ejecucion", [{ linea: l, anio: "2027", tipo: "Pagado", monto: "-5" }, { linea: l, anio: "2027", tipo: "Ejecutado", monto: "5", fecha: "2028-01-01" }, { linea: l, anio: "2027", tipo: "Inventado", monto: "5" }]), op);
    const cols = problemasVaf(mal).filter((p) => p.nivel === "error").map((p) => `${p.fila}:${p.columna}`);
    expect(cols).toEqual(expect.arrayContaining(["5:Monto", "6:Fecha", "7:Tipo"]));
  });
  it("una plantilla de otro plan o de otro tipo se rechaza con un mensaje", () => {
    const h = hojasPlantillaVaf("ejecucion", op);
    const control: HojaCruda = { nombre: "_Control", oculta: true, filas: [["formato", "pdi-plan-vaf-ejecucion"], ["plan_id", "otro-plan"], ["plan", "Otro"]] };
    expect(analizarEjecucion([...hoja("ejecucion", [{ linea: op.lineas[0].no, anio: "2027", tipo: "Pagado", monto: "1" }]), control], op).error).toMatch(/Otro/);
    expect(h.length).toBe(4);
  });
});

describe("demostración de la VAF", () => {
  it("evaluaciones en varios estados, cola ordenada y permisos", async () => {
    const a = api("financiero");
    const cola = await a.vafPendientes();
    expect(cola.map((e) => e.estado).sort()).toEqual(["en_revision", "pendiente"]);
    expect(cola[0].creadoEn <= cola[1].creadoEn).toBe(true);
    const hist = await a.vafEvaluaciones("plan-1");
    expect(hist.map((e) => e.estado)).toEqual(["en_revision", "no_viable"]);
    expect((await a.vafEvaluaciones("plan-3"))[0].estado).toBe("aprobada_con_ajustes");
    await expect(api("gestor").vafPendientes()).rejects.toThrow(/Sin permiso/);
    await expect(api("lector").vafEnRevision(cola[0].id)).rejects.toThrow(/VAF/);
  });
  it("en revisión, evaluar (con observaciones), no se reevalúa y publicar abre una evaluación nueva", async () => {
    const a = api("admin");
    const e = (await a.vafPendientes()).find((x) => x.estado === "pendiente")!;
    expect((await a.vafEnRevision(e.id)).estado).toBe("en_revision");
    await expect(a.vafEnRevision(e.id)).rejects.toThrow(/no está pendiente/);
    await expect(a.vafEvaluar(e.planId, e.versionId, { estado: "no_viable", montoAprobado: null, fuente: "", observaciones: "corto" })).rejects.toThrow(/20/);
    const r = await a.vafEvaluar(e.planId, e.versionId, { estado: "aprobada_con_ajustes", montoAprobado: 1000, fuente: "Crédito", observaciones: "Se difiere la dotación a 2028 por el techo." });
    expect(r).toMatchObject({ estado: "aprobada_con_ajustes", montoAprobado: 1000 });
    await expect(a.vafEvaluar(e.planId, e.versionId, { estado: "aprobada", montoAprobado: 1, fuente: "", observaciones: "" })).rejects.toThrow(/ya está resuelta/);
    expect((await a.vafPendientes()).some((x) => x.id === e.id)).toBe(false);
  });
  it("presupuesto del plan: totales, por pilar, por oficina y por línea con avance físico y desviación", async () => {
    const a = api("financiero");
    const p = await a.presupuestoPlan("plan-1");
    expect(p.porLinea.length).toBe(75);
    expect(p.totales.vigente).toBeGreaterThan(0);
    expect(p.totales.ejecutado).toBeGreaterThan(0);
    expect(p.porPilar.length).toBeGreaterThan(1);
    expect(p.porOficina.length).toBeGreaterThan(1);
    expect(p.porAnio.length).toBeGreaterThan(0);
    const conAvance = p.porLinea.find((l) => l.avanceFisico !== null && l.pctEjecucion !== null)!;
    expect(conAvance.desviacion).toBe(Math.round(((conAvance.pctEjecucion as number) - (conAvance.avanceFisico as number)) * 10) / 10);
  });
  it("las oficinas ven solo el presupuesto de sus líneas; lector y aprobador ven todo", async () => {
    const todas = (await api("lector").presupuestoPlan("plan-1")).porLinea.length;
    const mias = (await api("gestor").presupuestoPlan("plan-1")).porLinea;
    expect(mias.length).toBeLessThan(todas);
    expect(mias.every((l) => l.oficinaId === "of-4" || l.oficinaId === "of-3")).toBe(true);
    expect((await api("aprobador").presupuestoPlan("plan-1")).porLinea.length).toBe(todas);
  });
  it("registrar y anular: el libro solo se agrega, una anulación resta y no se anula dos veces; el gestor no escribe", async () => {
    const a = api("financiero");
    const p = await a.presupuestoPlan("plan-1");
    const l = p.porLinea.find((x) => x.vigente > 0)!;
    const antes = (await a.presupuestoLinea(l.lineaId)).ejecutado;
    await expect(a.presupuestoRegistrar(l.lineaId, { anio: 2027, tipo: "ejecutado", monto: -5, fecha: "2027-06-01", fuente: "", referencia: "", nota: "" })).rejects.toThrow(/modificación/);
    const m = await a.presupuestoRegistrar(l.lineaId, { anio: 2027, tipo: "ejecutado", monto: 12_000_000, fecha: "2027-06-01", fuente: "", referencia: "RP-9", nota: "" });
    expect((await a.presupuestoLinea(l.lineaId)).ejecutado).toBe(antes + 12_000_000);
    await expect(a.presupuestoAnular(m.id, "corto")).rejects.toThrow(/10/);
    const an = await a.presupuestoAnular(m.id, "Se registró en la línea equivocada.");
    expect(an.anulaId).toBe(m.id);
    expect((await a.presupuestoLinea(l.lineaId)).ejecutado).toBe(antes);
    const libro = (await a.presupuestoLinea(l.lineaId)).movimientos;
    expect(libro.find((x) => x.id === m.id)?.anulado).toBe(true);
    await expect(a.presupuestoAnular(m.id, "Se registró en la línea equivocada.")).rejects.toThrow(/ya fue anulado/);
    await expect(a.presupuestoAnular(an.id, "Se registró en la línea equivocada.")).rejects.toThrow(/no se anula/);
    await expect(api("gestor").presupuestoRegistrar(l.lineaId, { anio: 2027, tipo: "ejecutado", monto: 5, fecha: "2027-06-01", fuente: "", referencia: "", nota: "" })).rejects.toThrow(/Sin permiso/);
  });
  it("la financiación por línea se evalúa por año y cuenta como aprobado cuando no hay movimientos de aprobado", async () => {
    const a = api("admin");
    const p = await a.presupuestoPlan("plan-1");
    const sin = p.porLinea.find((l) => l.aprobado === 0)!;
    await a.vafLineaEvaluar(sin.lineaId, { anio: 2027, monto: 90_000_000, fuente: "Ordinario", estado: "aprobada", nota: "" });
    const x = await a.presupuestoLinea(sin.lineaId);
    expect(x.aprobado).toBe(90_000_000);
    expect(x.financiacion.find((f) => f.anio === 2027)?.estado).toBe("aprobada");
    await expect(a.vafLineaEvaluar(sin.lineaId, { anio: 2027, monto: 1, fuente: "", estado: "rechazada", nota: "no" })).rejects.toThrow(/10/);
  });
  it("cargas masivas todo o nada: con un error no se carga nada", async () => {
    const a = api("financiero");
    const ok = { linea: "1", anio: 2027, montoAprobado: 100, fuente: "", estado: "aprobada" as const, nota: "" };
    const mal = await a.vafLineasCargar("plan-1", [ok, { ...ok, linea: "no-existe" }]);
    expect(mal.cargadas).toBe(0);
    expect(mal.errores[0]).toMatchObject({ fila: 2, campo: "linea" });
    expect((await a.vafLineasCargar("plan-1", [ok])).cargadas).toBe(1);
    const mov = { linea: "1", anio: 2027, tipo: "pagado" as const, monto: 10, fecha: "2027-06-01", fuente: "", referencia: "", nota: "" };
    expect((await a.presupuestoCargar("plan-1", [mov, { ...mov, fecha: "2030-01-01" }])).errores[0]).toMatchObject({ fila: 2, campo: "fecha" });
    expect((await a.presupuestoCargar("plan-1", [mov])).cargadas).toBe(1);
    expect((await a.vafLineasCargar("plan-1", [])).errores[0].campo).toBe("filas");
  });
  it("vigilancia: cada tipo en la demostración, solo planes activos, y los umbrales cambian el resultado", async () => {
    const a = api("financiero");
    const g = await a.vigilanciaGlobal();
    const tipos = new Set(g.map((x) => x.tipo));
    expect(tipos.has("sobreejecucion")).toBe(true);
    expect(tipos.has("sin_movimientos")).toBe(true);
    expect(tipos.has("sin_evaluar_vaf")).toBe(true);
    expect(g.every((x) => x.planId !== "plan-3")).toBe(true);
    const p1 = await a.vigilanciaPlan("plan-1");
    await a.guardarUmbrales("plan-1", { umbralDesviacion: 100, umbralSobreejecucion: 300, mesesSinEjecucion: 24 });
    const relajado = await a.vigilanciaPlan("plan-1");
    expect(relajado.length).toBeLessThan(p1.length);
    await expect(a.guardarUmbrales("plan-1", { umbralDesviacion: 0, umbralSobreejecucion: 100, mesesSinEjecucion: 3 })).rejects.toThrow(/desviación/i);
    await expect(api("lector").guardarUmbrales("plan-1", { umbralDesviacion: 10, umbralSobreejecucion: 100, mesesSinEjecucion: 3 })).rejects.toThrow(/Sin permiso/);
  });
  it("el tablero de todos los planes trae presupuesto, conteo de evaluaciones y alertas de vigilancia", async () => {
    const t = await api("admin").tableroAdmin();
    expect(t.totales.presupuesto?.vigente).toBeGreaterThan(0);
    expect(t.planes.find((p) => p.id === "plan-1")?.evaluacionesVaf).toMatchObject({ pendientes: 1, noViables: 1 });
    expect(estadoFinancieroDeConteos(t.planes.find((p) => p.id === "plan-3")?.evaluacionesVaf)).toBe("aprobada_con_ajustes");
    expect(t.alertas.some((a) => a.tipo === "sobreejecucion")).toBe(true);
  });
  it("la unidad de la VAF la fija solo el administrador", async () => {
    const a = api("admin");
    expect((await a.vafConfigLeer()).unidad?.id).toBe("of-1");
    expect((await a.vafConfigGuardar("of-2")).unidad?.id).toBe("of-2");
    expect((await a.vafConfigGuardar(null)).unidad).toBeNull();
    await expect(a.vafConfigGuardar("no-existe")).rejects.toThrow(/no existe/);
    await expect(api("financiero").vafConfigGuardar("of-2")).rejects.toThrow(/administrador/);
  });
  it("publicar una versión abre una evaluación pendiente para la VAF", async () => {
    const a = crearApiMemoria({ estado: "borrador", nivel: "admin", papel: "jefe" });
    const antes = (await a.vafEvaluaciones("plan-2")).length;
    const v = (await a.versiones("plan-2"))[0];
    await a.publicarVersion(v.id, "");
    const despues = await a.vafEvaluaciones("plan-2");
    expect(despues.length).toBe(antes);
    expect(despues.some((e) => e.estado === "pendiente")).toBe(true);
  });
});
