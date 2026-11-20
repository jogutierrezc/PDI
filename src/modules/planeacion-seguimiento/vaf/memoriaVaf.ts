/* =============================================================================
   Planeación y Seguimiento · VAF · adaptador EN MEMORIA (demostración y pruebas).
   Evaluaciones en varios estados, financiación y presupuesto por línea con casos que disparan cada alerta.
   Aplica las mismas reglas que la interfaz (modeloVaf.ts). No es un simulacro de seguridad: la base manda.
   ========================================================================== */

import type { Linea, PsNivel } from "../modelo";
import { llano } from "../modelo";
import type { ErrorCargaVaf, PsApiVaf, ResultadoCargaVaf } from "./contratoVaf";
import {
  alertasDeLinea, cifrasDeMovimientos, desviacionDe, esFinanciero, validarAnulacion, validarEvaluacion, validarFinanciacion, validarMovimiento, validarUmbrales,
  UMBRALES_POR_OMISION,
  type AlertaVigilancia, type CifrasPresupuesto, type ConfigVaf, type EvaluacionVaf, type FinanciacionAnio, type MovPresupuesto, type PresupuestoLinea, type PresupuestoPlan, type TipoMov, type Umbrales,
} from "./modeloVaf";

export interface PlanVafMem {
  id: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  oficinaId: string;
  estado: "activo" | "archivado";
  versionId: string | null;
  versionEtiqueta: string | null;
  creadoEn: string;
}

export interface DepsVaf {
  hoy: string;
  nivel: PsNivel;
  espera: () => Promise<void>;
  /** Espera a que los planes estén sembrados. */
  listo: () => Promise<void>;
  planes: () => PlanVafMem[];
  lineasDe: (planId: string) => Linea[];
  oficina: (id: string) => { id: string; nombre: string } | null;
  /** La oficina (id) de una línea: la que trae o, en la demostración, la inferida. */
  oficinaDeLinea: (linea: Linea) => string | null;
  /** Avance físico validado de las actividades de la línea; nulo si no tiene actividades. */
  avanceDeLinea: (planId: string, no: string) => Promise<number | null>;
  /** ¿La persona ve el presupuesto de esta línea? (VAF, administración, lector y aprobador, todo; gestor y colaborador, solo sus oficinas.) */
  veLinea: (planId: string, linea: Linea) => Promise<boolean>;
  unidades: () => { id: string; nombre: string; codigo: string }[];
}

export const idLinea = (planId: string, no: string): string => `${planId}::${no}`;
export const deIdLinea = (id: string): { planId: string; no: string } => {
  const i = id.indexOf("::");
  return { planId: id.slice(0, i), no: id.slice(i + 2) };
};

const redondear = (n: number): number => Math.round(n / 1e5) * 1e5;

export function crearVafMemoria(d: DepsVaf) {
  let evaluaciones: EvaluacionVaf[] = [];
  const financiacion = new Map<string, FinanciacionAnio[]>();
  let movs: MovPresupuesto[] = [];
  const umbrales = new Map<string, Umbrales>();
  let vafUnit: string | null = "of-1";
  let sembrado = false;
  let n = 0;
  const t0 = Date.now();
  const base = Date.parse(`${d.hoy}T12:00:00Z`);
  const ahora = () => new Date(base + (Date.now() - t0)).toISOString();
  const exigir = (ok: boolean, m: string) => { if (!ok) throw new Error(m); };
  const escribe = () => exigir(esFinanciero(d.nivel), "Sin permiso: esto es de la VAF y del administrador.");
  const hace = (dias: number) => new Date(base - dias * 86_400_000).toISOString();
  const persona = { id: "u-vaf", nombre: "Natalia Quintero (VAF)" };

  const sembrar = async () => {
    await d.listo();
    if (sembrado) return;
    sembrado = true;
    for (const p of d.planes()) {
      const lineas = d.lineasDe(p.id);
      const total = lineas.reduce((s, l) => s + (l.monto ?? 0), 0);
      const of = d.oficina(p.oficinaId);
      const ev = (id: string, estado: EvaluacionVaf["estado"], dias: number, extra: Partial<EvaluacionVaf> = {}): EvaluacionVaf => ({
        id, planId: p.id, versionId: p.versionId ?? `${p.id}-v`, plan: p.nombre, oficina: of, version: p.versionEtiqueta ?? "v1.0", estado, montoSolicitado: total, montoAprobado: null, fuente: "", observaciones: "", evaluadoPor: null, evaluadoEn: null, creadoEn: hace(dias), ...extra,
      });
      if (p.id === "plan-1") {
        evaluaciones.push(ev("ev-1a", "no_viable", 60, { versionId: "ver-0", version: "v0.9", montoSolicitado: total * 1.4, observaciones: "El monto solicitado supera la capacidad de financiación del periodo; se pide reducir el alcance de las obras civiles.", evaluadoPor: persona, evaluadoEn: hace(52) }));
        evaluaciones.push(ev("ev-1b", "en_revision", 12));
      } else if (p.id === "plan-2") evaluaciones.push(ev("ev-2a", "pendiente", 3));
      else evaluaciones.push(ev("ev-3a", "aprobada_con_ajustes", 900, { montoAprobado: redondear(total * 0.82), fuente: "Presupuesto ordinario institucional", observaciones: "Se aprueba el 82 % del monto: las líneas de dotación se difieren a 2026.", evaluadoPor: persona, evaluadoEn: hace(880) }));

      const activo = p.estado === "activo";
      lineas.forEach((l, i) => {
        if (!l.monto) return;
        // Un plan activo trae financiada su primera vigencia (las demás quedan por evaluar); uno archivado, todas sus vigencias.
        const anios = Array.from({ length: p.anioFin - p.anioIni + 1 }, (_, k) => p.anioIni + k).slice(0, activo ? 1 : 3);
        // Casos de la demostración: cada 7.ª línea cambia de caso; la sobreejecución (1) solo cada 14.ª, para no llenar la pantalla de alertas.
        const caso = i % 7;
        const kind = activo ? (caso === 1 && i % 14 !== 1 ? 0 : caso) : 0;
        const fin: FinanciacionAnio[] = anios.map((anio, k) => {
          const frac = (l.pct[String(anio)] ?? 1 / anios.length) || 1 / anios.length;
          const monto = redondear(l.monto! * frac * (kind === 3 ? 0.7 : 0.95));
          const estado = kind === 6 ? "sin_evaluar" : kind === 3 ? "ajustada" : kind === 4 ? "rechazada" : "aprobada";
          return { anio, montoAprobado: estado === "rechazada" || estado === "sin_evaluar" ? 0 : monto, fuente: estado === "sin_evaluar" ? "" : "Presupuesto ordinario institucional", estado, nota: estado === "ajustada" ? "Se ajusta al techo del año." : estado === "rechazada" ? "No hay recursos para el periodo." : "", evaluadoEn: estado === "sin_evaluar" ? null : hace(40 - k) };
        });
        financiacion.set(idLinea(p.id, l.no), fin);
        if (!activo) {
          // Plan archivado: todo ejecutado en sus años.
          for (const f of fin) for (const [t, r] of [["aprobado", 1], ["comprometido", 0.97], ["ejecutado", 0.95], ["pagado", 0.93]] as const) movs.push(mov(p.id, l.no, f.anio, t, f.montoAprobado * r, `${f.anio}-11-20`));
          return;
        }
        const f1 = fin[0];
        if (!f1 || f1.montoAprobado === 0 || kind === 5 || kind === 6) return;
        const vig = f1.montoAprobado;
        const ejec = kind === 1 ? 1.22 : kind === 2 ? 0.8 : 0.45;
        movs.push(mov(p.id, l.no, f1.anio, "aprobado", vig, `${f1.anio}-01-20`));
        movs.push(mov(p.id, l.no, f1.anio, "comprometido", vig * Math.min(1.25, ejec + 0.2), `${f1.anio}-03-12`));
        movs.push(mov(p.id, l.no, f1.anio, "ejecutado", vig * ejec, `${f1.anio}-05-${10 + (i % 15)}`));
        movs.push(mov(p.id, l.no, f1.anio, "pagado", vig * ejec * 0.9, `${f1.anio}-06-0${1 + (i % 8)}`));
        if (kind === 0 && i % 14 === 0) movs.push(mov(p.id, l.no, f1.anio, "modificacion", -redondear(vig * 0.1), `${f1.anio}-04-02`));
      });
    }
  };
  function mov(planId: string, no: string, anio: number, tipo: TipoMov, monto: number, fecha: string): MovPresupuesto {
    return { id: `mv-${++n}`, planId, lineaId: idLinea(planId, no), lineaClave: no, anio, tipo, monto: tipo === "modificacion" ? monto : Math.abs(redondear(monto)), fecha, fuente: "Presupuesto ordinario institucional", referencia: `RP-${1000 + n}`, nota: "", anulaId: null, anulado: false, registradoPor: persona, creadoEn: `${fecha}T15:00:00Z` };
  }

  const plan = (id: string): PlanVafMem => {
    const p = d.planes().find((x) => x.id === id);
    exigir(Boolean(p), "El plan no existe.");
    return p!;
  };
  const lineaDe = (lineaId: string) => {
    const { planId, no } = deIdLinea(lineaId);
    const p = plan(planId);
    const l = d.lineasDe(planId).find((x) => x.no === no);
    exigir(Boolean(l), "La línea no existe.");
    return { p, l: l! };
  };
  const movsDe = (planId: string, no: string) => movs.filter((m) => m.planId === planId && m.lineaClave === no).map((m) => ({ ...m, anulado: movs.some((x) => x.anulaId === m.id) }));
  const aprobadoVaf = (planId: string, no: string): Record<number, number> => Object.fromEntries((financiacion.get(idLinea(planId, no)) ?? []).filter((f) => f.estado === "aprobada" || f.estado === "ajustada").map((f) => [f.anio, f.montoAprobado]));

  const cifrasLinea = async (p: PlanVafMem, l: Linea): Promise<Omit<PresupuestoLinea, "movimientos" | "financiacion"> & { financiacion: FinanciacionAnio[] }> => {
    const ms = movsDe(p.id, l.no);
    const { total, porAnio } = cifrasDeMovimientos(ms, aprobadoVaf(p.id, l.no));
    const fis = await d.avanceDeLinea(p.id, l.no);
    const noAnul = ms.filter((m) => !m.anulaId).map((m) => m.fecha).sort();
    return { ...total, lineaId: idLinea(p.id, l.no), planId: p.id, clave: l.no, nombre: l.nombre, pilar: l.pilar, oficinaId: d.oficinaDeLinea(l), solicitado: l.monto ?? 0, avanceFisico: fis, desviacion: desviacionDe(total.pctEjecucion, fis), ultimoMovimiento: noAnul.at(-1) ?? null, porAnio, financiacion: financiacion.get(idLinea(p.id, l.no)) ?? [] };
  };
  const sumar = (xs: readonly CifrasPresupuesto[]): CifrasPresupuesto => {
    const s = (k: keyof CifrasPresupuesto) => xs.reduce((t, x) => t + ((x[k] as number) ?? 0), 0);
    const vigente = s("vigente");
    return { aprobado: s("aprobado"), modificado: s("modificado"), vigente, comprometido: s("comprometido"), ejecutado: s("ejecutado"), pagado: s("pagado"), disponible: s("disponible"), pctEjecucion: vigente > 0 ? Math.round((s("ejecutado") / vigente) * 1000) / 10 : null };
  };
  const visibles = async (p: PlanVafMem) => {
    const out: Linea[] = [];
    for (const l of d.lineasDe(p.id)) if (await d.veLinea(p.id, l)) out.push(l);
    return out;
  };
  const planPresupuesto = async (planId: string): Promise<PresupuestoPlan> => {
    const p = plan(planId);
    const filas = await Promise.all((await visibles(p)).map((l) => cifrasLinea(p, l)));
    const porLinea = filas.map(({ porAnio: _a, financiacion: _f, ...r }) => r as PresupuestoPlan["porLinea"][number]);
    const grupo = (clave: (x: { pilar?: string; oficinaId?: string | null }) => string, nombre: (k: string) => string) => {
      const m = new Map<string, typeof filas>();
      for (const f of filas) m.set(clave(f), [...(m.get(clave(f)) ?? []), f]);
      return [...m].map(([k, xs]) => ({ ...sumar(xs), clave: k, nombre: nombre(k) })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    };
    const anios = new Map<number, { anio: number; aprobado: number; modificado: number; vigente: number; comprometido: number; ejecutado: number; pagado: number }>();
    for (const f of filas) for (const a of f.porAnio) {
      const x = anios.get(a.anio) ?? { anio: a.anio, aprobado: 0, modificado: 0, vigente: 0, comprometido: 0, ejecutado: 0, pagado: 0 };
      for (const k of ["aprobado", "modificado", "vigente", "comprometido", "ejecutado", "pagado"] as const) x[k] += a[k];
      anios.set(a.anio, x);
    }
    return {
      planId, totales: { ...sumar(filas), solicitado: filas.reduce((s, f) => s + (f.solicitado ?? 0), 0) }, porLinea,
      porPilar: grupo((x) => x.pilar ?? "Sin pilar", (k) => k), porOficina: grupo((x) => x.oficinaId ?? "", (k) => d.oficina(k)?.nombre ?? "Sin oficina"),
      porAnio: [...anios.values()].sort((a, b) => a.anio - b.anio),
    };
  };
  const umbralesDe = (planId: string): Umbrales => umbrales.get(planId) ?? { ...UMBRALES_POR_OMISION };
  const alertasPlan = async (planId: string): Promise<AlertaVigilancia[]> => {
    const p = plan(planId);
    if (p.estado !== "activo" || !p.versionId) return [];
    const out: AlertaVigilancia[] = [];
    for (const l of await visibles(p)) {
      const c = await cifrasLinea(p, l);
      out.push(...alertasDeLinea({ planId: p.id, lineaId: c.lineaId, clave: l.no, nombre: l.nombre, oficinaId: c.oficinaId ?? null, vigente: c.vigente, ejecutado: c.ejecutado, aprobado: c.aprobado, pctEjecucion: c.pctEjecucion, desviacion: c.desviacion, ultimoMovimiento: c.ultimoMovimiento, tieneFinanciacion: c.financiacion.some((f) => f.estado !== "sin_evaluar") }, umbralesDe(p.id), d.hoy));
    }
    return out;
  };

  const errorCarga = (fila: number | null, campo: string, mensaje: string): ErrorCargaVaf => ({ fila, campo, mensaje });
  const claves = (planId: string) => new Map(d.lineasDe(planId).map((l) => [llano(l.no), l]));

  const api: PsApiVaf & { abrirEvaluacion: (planId: string, versionId: string, etiqueta: string, solicitado: number) => void; resumenPlan: (planId: string) => Promise<{ presupuesto: CifrasPresupuesto; evaluaciones: { pendientes: number; aprobadas: number; ajustadas: number; noViables: number } }> } = {
    abrirEvaluacion(planId, versionId, etiqueta, solicitado) {
      const p = plan(planId);
      if (evaluaciones.some((e) => e.versionId === versionId)) return;
      evaluaciones.push({ id: `ev-${++n}`, planId, versionId, plan: p.nombre, oficina: d.oficina(p.oficinaId), version: etiqueta, estado: "pendiente", montoSolicitado: solicitado, montoAprobado: null, fuente: "", observaciones: "", evaluadoPor: null, evaluadoEn: null, creadoEn: ahora() });
    },
    async resumenPlan(planId) {
      await sembrar();
      const pp = await planPresupuesto(planId);
      const ev = evaluaciones.filter((e) => e.planId === planId);
      return { presupuesto: { ...pp.totales }, evaluaciones: { pendientes: ev.filter((e) => e.estado === "pendiente" || e.estado === "en_revision").length, aprobadas: ev.filter((e) => e.estado === "aprobada").length, ajustadas: ev.filter((e) => e.estado === "aprobada_con_ajustes").length, noViables: ev.filter((e) => e.estado === "no_viable").length } };
    },
    async vafPendientes() {
      await sembrar(); await d.espera();
      exigir(["financiero", "admin", "aprobador", "lector"].includes(d.nivel), "Sin permiso: la cola de evaluación financiera es de la VAF y del administrador.");
      return structuredClone(evaluaciones.filter((e) => e.estado === "pendiente" || e.estado === "en_revision").sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)));
    },
    async vafEvaluaciones(planId) {
      await sembrar(); await d.espera(); plan(planId);
      return structuredClone(evaluaciones.filter((e) => e.planId === planId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)));
    },
    async vafEnRevision(id) {
      await sembrar(); await d.espera(); escribe();
      const e = evaluaciones.find((x) => x.id === id);
      exigir(Boolean(e), "La evaluación no existe.");
      exigir(e!.estado === "pendiente", `La evaluación no está pendiente (${e!.estado}).`);
      e!.estado = "en_revision";
      return structuredClone(e!);
    },
    async vafEvaluar(planId, versionId, datos) {
      await sembrar(); await d.espera(); escribe();
      const errs = validarEvaluacion(datos);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      const e = evaluaciones.find((x) => x.planId === planId && x.versionId === versionId);
      exigir(Boolean(e), "Ese plan y versión no tienen una evaluación abierta.");
      exigir(e!.estado === "pendiente" || e!.estado === "en_revision", `La evaluación ya está resuelta (${e!.estado}): una nueva versión abre otra.`);
      Object.assign(e!, { estado: datos.estado, montoAprobado: datos.montoAprobado, fuente: datos.fuente.trim(), observaciones: datos.observaciones.trim(), evaluadoPor: persona, evaluadoEn: ahora() });
      return structuredClone(e!);
    },
    async vafLineaEvaluar(lineaId, datos) {
      await sembrar(); await d.espera(); escribe();
      const { p } = lineaDe(lineaId);
      const errs = validarFinanciacion(datos, { ini: p.anioIni, fin: p.anioFin });
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      const lista = financiacion.get(lineaId) ?? [];
      const nuevo: FinanciacionAnio = { anio: datos.anio, montoAprobado: datos.monto ?? 0, fuente: datos.fuente.trim(), estado: datos.estado, nota: datos.nota.trim(), evaluadoEn: ahora() };
      financiacion.set(lineaId, [...lista.filter((f) => f.anio !== datos.anio), nuevo].sort((a, b) => a.anio - b.anio));
    },
    async vafLineasCargar(planId, filas) {
      await sembrar(); await d.espera(); escribe();
      const p = plan(planId);
      const lineas = claves(planId);
      const errores: ErrorCargaVaf[] = [];
      if (!filas.length) return { cargadas: 0, recibidas: 0, errores: [errorCarga(null, "filas", "Se esperaba una lista con al menos una fila.")] };
      if (filas.length > 2000) return { cargadas: 0, recibidas: filas.length, errores: [errorCarga(null, "filas", "La carga admite hasta 2000 filas.")] };
      const vistos = new Set<string>();
      filas.forEach((f, i) => {
        const l = lineas.get(llano(f.linea));
        if (!l) errores.push(errorCarga(i + 1, "linea", `La línea «${f.linea.slice(0, 40)}» no existe en el plan.`));
        for (const er of validarFinanciacion({ anio: f.anio, monto: f.montoAprobado, fuente: f.fuente, estado: f.estado, nota: f.nota }, { ini: p.anioIni, fin: p.anioFin })) errores.push(errorCarga(i + 1, er.campo === "fn-anio" ? "anio" : er.campo === "fn-monto" ? "monto" : er.campo === "fn-nota" ? "nota" : "fuente", er.mensaje));
        const k = `${llano(f.linea)}|${f.anio}`;
        if (vistos.has(k)) errores.push(errorCarga(i + 1, "anio", "La línea y el año están repetidos en la hoja."));
        vistos.add(k);
      });
      if (errores.length) return { cargadas: 0, recibidas: filas.length, errores };
      for (const f of filas) {
        const l = lineas.get(llano(f.linea))!;
        const id = idLinea(planId, l.no);
        financiacion.set(id, [...(financiacion.get(id) ?? []).filter((x) => x.anio !== f.anio), { anio: f.anio, montoAprobado: f.montoAprobado, fuente: f.fuente.trim(), estado: f.estado, nota: f.nota.trim(), evaluadoEn: ahora() }].sort((a, b) => a.anio - b.anio));
      }
      return { cargadas: filas.length, recibidas: filas.length, errores: [] } satisfies ResultadoCargaVaf;
    },
    async presupuestoPlan(planId) { await sembrar(); await d.espera(); return planPresupuesto(planId); },
    async presupuestoLinea(lineaId) {
      await sembrar(); await d.espera();
      const { p, l } = lineaDe(lineaId);
      exigir(await d.veLinea(p.id, l), "La línea no existe.");
      const c = await cifrasLinea(p, l);
      return { ...c, movimientos: movsDe(p.id, l.no).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, 300) };
    },
    async presupuestoRegistrar(lineaId, datos) {
      await sembrar(); await d.espera(); escribe();
      const { p, l } = lineaDe(lineaId);
      const errs = validarMovimiento(datos, { hoy: d.hoy, ini: p.anioIni, fin: p.anioFin });
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      const m: MovPresupuesto = { id: `mv-${++n}`, planId: p.id, lineaId, lineaClave: l.no, anio: datos.anio, tipo: datos.tipo as TipoMov, monto: datos.monto!, fecha: datos.fecha, fuente: datos.fuente.trim(), referencia: datos.referencia.trim(), nota: datos.nota.trim(), anulaId: null, anulado: false, registradoPor: persona, creadoEn: ahora() };
      movs.push(m);
      return structuredClone(m);
    },
    async presupuestoAnular(movId, motivo) {
      await sembrar(); await d.espera(); escribe();
      const o = movs.find((m) => m.id === movId);
      exigir(Boolean(o), "El movimiento no existe.");
      exigir(!o!.anulaId, "Una anulación no se anula.");
      exigir(!movs.some((m) => m.anulaId === movId), "El movimiento ya fue anulado.");
      const v = validarAnulacion(motivo);
      exigir(!v, v ?? "");
      const m: MovPresupuesto = { ...o!, id: `mv-${++n}`, fecha: d.hoy, nota: motivo.trim(), anulaId: movId, anulado: false, registradoPor: persona, creadoEn: ahora() };
      movs.push(m);
      return structuredClone(m);
    },
    async presupuestoCargar(planId, filas) {
      await sembrar(); await d.espera(); escribe();
      const p = plan(planId);
      const lineas = claves(planId);
      if (!filas.length) return { cargadas: 0, recibidas: 0, errores: [errorCarga(null, "filas", "Se esperaba una lista con al menos una fila.")] };
      if (filas.length > 2000) return { cargadas: 0, recibidas: filas.length, errores: [errorCarga(null, "filas", "La carga admite hasta 2000 filas.")] };
      const errores: ErrorCargaVaf[] = [];
      filas.forEach((f, i) => {
        if (!lineas.get(llano(f.linea))) errores.push(errorCarga(i + 1, "linea", `La línea «${f.linea.slice(0, 40)}» no existe en el plan.`));
        const campoDe: Record<string, string> = { "mv-anio": "anio", "mv-tipo": "tipo", "mv-monto": "monto", "mv-fecha": "fecha", "mv-fuente": "fuente", "mv-referencia": "referencia", "mv-nota": "nota" };
        for (const er of validarMovimiento({ anio: f.anio, tipo: f.tipo, monto: f.monto, fecha: f.fecha, fuente: f.fuente, referencia: f.referencia, nota: f.nota }, { hoy: d.hoy, ini: p.anioIni, fin: p.anioFin })) errores.push(errorCarga(i + 1, campoDe[er.campo] ?? "fila", er.mensaje));
      });
      if (errores.length) return { cargadas: 0, recibidas: filas.length, errores };
      for (const f of filas) {
        const l = lineas.get(llano(f.linea))!;
        movs.push({ id: `mv-${++n}`, planId, lineaId: idLinea(planId, l.no), lineaClave: l.no, anio: f.anio, tipo: f.tipo, monto: f.monto, fecha: f.fecha, fuente: f.fuente.trim(), referencia: f.referencia.trim(), nota: f.nota.trim(), anulaId: null, anulado: false, registradoPor: persona, creadoEn: ahora() });
      }
      return { cargadas: filas.length, recibidas: filas.length, errores: [] };
    },
    async vigilanciaPlan(planId) { await sembrar(); await d.espera(); return alertasPlan(planId); },
    async vigilanciaGlobal() {
      await sembrar(); await d.espera();
      return (await Promise.all(d.planes().filter((p) => p.estado === "activo").map((p) => alertasPlan(p.id)))).flat();
    },
    async umbralesPlan(planId) { await sembrar(); await d.espera(); plan(planId); return { ...umbralesDe(planId) }; },
    async guardarUmbrales(planId, u) {
      await sembrar(); await d.espera(); escribe(); plan(planId);
      const errs = validarUmbrales(u);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      umbrales.set(planId, { ...u });
      return { ...u };
    },
    async vafConfigLeer(): Promise<ConfigVaf> {
      await d.espera();
      const u = d.unidades().find((x) => x.id === vafUnit) ?? null;
      return { unidad: u, destinatarios: u ? 2 : 0 };
    },
    async vafConfigGuardar(unidadId) {
      await d.espera();
      exigir(d.nivel === "admin", "Sin permiso: la unidad de la VAF la fija el administrador del módulo.");
      exigir(unidadId === null || d.unidades().some((x) => x.id === unidadId), "La unidad indicada no existe.");
      vafUnit = unidadId;
      return api.vafConfigLeer();
    },
  };
  return api;
}
