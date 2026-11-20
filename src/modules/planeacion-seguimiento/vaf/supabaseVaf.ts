/* =============================================================================
   Planeación y Seguimiento · VAF · implementación SUPABASE, escrita contra CONTRATO-BD-F3B.md §6 y la migración
   0290 (leídas, NO ejecutadas contra una base real). Todo por `supabase.rpc` con la sesión de la persona.
   `p_linea` es `ps_lineas.id`: la interfaz lo toma de `linea_id` en las respuestas de presupuesto.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import type { ErrorCargaVaf, PsApiVaf, ResultadoCargaVaf } from "./contratoVaf";
import {
  UMBRALES_POR_OMISION,
  type AlertaVigilancia, type CifrasAnio, type CifrasPresupuesto, type EvaluacionVaf, type FinanciacionAnio, type MovPresupuesto, type PresupuestoLinea, type PresupuestoPlan, type TipoAlertaVigilancia, type Umbrales,
} from "./modeloVaf";

type Fila = Record<string, unknown>;
const falla = (e: { message?: string } | null): Error => new Error(e?.message || "No se pudo completar la operación.");
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const n0 = (v: unknown): number => num(v) ?? 0;
const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
async function rpc<T>(nombre: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await supabase.rpc(nombre, args);
  if (r.error) throw falla(r.error);
  return r.data as T;
}
/** Vacía la cola de correos al momento (el resultado de una evaluación avisa a la oficina). */
const despachar = () => void supabase.functions.invoke("planeacion-seguimiento", { body: { action: "avisos" } }).catch(() => undefined);

export function cifrasDeJson(v: unknown): CifrasPresupuesto {
  const f = (v ?? {}) as Fila;
  return { aprobado: n0(f.aprobado), modificado: n0(f.modificado), vigente: n0(f.vigente), comprometido: n0(f.comprometido), ejecutado: n0(f.ejecutado), pagado: n0(f.pagado), disponible: n0(f.disponible), pctEjecucion: num(f.pct_ejecucion) };
}
const persona = (v: unknown) => {
  const f = (v ?? null) as Fila | null;
  return f && f.id ? { id: String(f.id), nombre: String(f.nombre ?? "Persona sin nombre") } : null;
};
const oficinaDe = (v: unknown) => {
  const f = (v ?? null) as Fila | null;
  return f && (f.unit_id || f.id) ? { id: String(f.unit_id ?? f.id), nombre: String(f.nombre ?? "Oficina") } : null;
};

export const evaluacionDe = (f: Fila): EvaluacionVaf => ({
  id: String(f.id), planId: String(f.plan_id), versionId: String(f.version_id), plan: String(f.plan ?? ""), oficina: oficinaDe(f.oficina), version: String(f.version ?? ""), estado: f.estado as EvaluacionVaf["estado"],
  montoSolicitado: n0(f.monto_solicitado), montoAprobado: num(f.monto_aprobado), fuente: String(f.fuente_financiacion ?? ""), observaciones: String(f.observaciones ?? ""), evaluadoPor: persona(f.evaluado_por), evaluadoEn: texto(f.evaluado_en), creadoEn: String(f.creado_en ?? ""),
});
export const movDe = (f: Fila): MovPresupuesto => ({
  id: String(f.id), planId: String(f.plan_id), lineaId: String(f.linea_id), lineaClave: String(f.linea_clave ?? ""), anio: n0(f.anio), tipo: f.tipo as MovPresupuesto["tipo"], monto: n0(f.monto), fecha: String(f.fecha ?? ""), fuente: String(f.fuente ?? ""), referencia: String(f.referencia ?? ""), nota: String(f.nota ?? ""),
  anulaId: texto(f.anula_id), anulado: Boolean(f.anulado), registradoPor: persona(f.registrado_por), creadoEn: String(f.creado_en ?? ""),
});
const anioDe = (f: Fila): CifrasAnio => ({ anio: n0(f.anio), aprobado: n0(f.aprobado), modificado: n0(f.modificado), vigente: n0(f.vigente), comprometido: n0(f.comprometido), ejecutado: n0(f.ejecutado), pagado: n0(f.pagado) });
const finDe = (f: Fila): FinanciacionAnio => ({ anio: n0(f.anio), montoAprobado: n0(f.monto_aprobado), fuente: String(f.fuente ?? ""), estado: f.estado as FinanciacionAnio["estado"], nota: String(f.nota ?? ""), evaluadoEn: texto(f.evaluado_en) });
const lineaDe = (f: Fila): PresupuestoLinea => ({
  ...cifrasDeJson(f), lineaId: String(f.linea_id), planId: String(f.plan_id ?? ""), clave: String(f.clave ?? ""), nombre: texto(f.nombre) ?? undefined, pilar: texto(f.pilar) ?? undefined, oficinaId: texto(f.oficina_unit_id), solicitado: num(f.solicitado) ?? undefined,
  avanceFisico: num(f.avance_fisico), desviacion: num(f.desviacion), ultimoMovimiento: texto(f.ultimo_movimiento), porAnio: lista<Fila>(f.por_anio ?? f._anios).map(anioDe), financiacion: lista<Fila>(f.financiacion).map(finDe), movimientos: lista<Fila>(f.movimientos).map(movDe),
});
const grupoDe = (f: Fila, clave: string, nombre: string) => ({ ...cifrasDeJson(f), clave, nombre });
const alertaDe = (f: Fila): AlertaVigilancia => ({
  tipo: f.tipo as TipoAlertaVigilancia, severidad: f.severidad === "alta" || f.severidad === "baja" ? f.severidad : "media", planId: String(f.plan_id), lineaId: String(f.linea_id), lineaClave: String(f.linea_clave ?? ""), linea: String(f.linea ?? ""), oficinaId: texto(f.oficina_unit_id), valor: num(f.valor), texto: String(f.texto ?? ""),
});
const cargaDe = (r: Fila, n: number): ResultadoCargaVaf => ({
  cargadas: n0(r.cargadas), recibidas: n0(r.recibidas ?? n),
  errores: lista<Fila>(r.errores).map((e): ErrorCargaVaf => ({ fila: e.fila === null || e.fila === undefined ? null : Number(e.fila), campo: String(e.campo ?? ""), mensaje: String(e.mensaje ?? "") })),
});
const umbralesDe = (v: unknown): Umbrales => {
  const f = (v ?? {}) as Fila;
  return { umbralDesviacion: num(f.umbral_desviacion) ?? UMBRALES_POR_OMISION.umbralDesviacion, umbralSobreejecucion: num(f.umbral_sobreejecucion) ?? UMBRALES_POR_OMISION.umbralSobreejecucion, mesesSinEjecucion: num(f.meses_sin_ejecucion) ?? UMBRALES_POR_OMISION.mesesSinEjecucion };
};

export function crearVafSupabase(): PsApiVaf {
  return {
    async vafPendientes() { return lista<Fila>(await rpc("ps_vaf_pendientes")).map(evaluacionDe); },
    async vafEvaluaciones(planId) { return lista<Fila>(await rpc("ps_vaf_evaluaciones", { p_plan: planId })).map(evaluacionDe); },
    async vafEnRevision(id) { return evaluacionDe(await rpc<Fila>("ps_vaf_en_revision", { p_evaluacion: id })); },
    async vafEvaluar(planId, versionId, d) {
      const r = await rpc<Fila>("ps_vaf_evaluar", { p_plan: planId, p_version: versionId, p_estado: d.estado, p_monto_aprobado: d.estado === "no_viable" ? d.montoAprobado : d.montoAprobado, p_fuente: d.fuente.trim(), p_observaciones: d.observaciones.trim() });
      despachar();
      return evaluacionDe(r);
    },
    async vafLineaEvaluar(lineaId, d) {
      await rpc("ps_vaf_linea_evaluar", { p_linea: lineaId, p_anio: d.anio, p_monto: d.monto, p_fuente: d.fuente.trim(), p_estado: d.estado, p_nota: d.nota.trim() });
    },
    async vafLineasCargar(planId, filas) {
      const r = await rpc<Fila>("ps_vaf_lineas_cargar", { p_plan: planId, p_filas: filas.map((f) => ({ linea: f.linea, anio: f.anio, monto_aprobado: f.montoAprobado, fuente: f.fuente, estado: f.estado, nota: f.nota })) });
      return cargaDe(r, filas.length);
    },
    async presupuestoPlan(planId) {
      const r = await rpc<Fila>("ps_presupuesto_plan", { p_plan: planId });
      const t = (r.totales ?? {}) as Fila;
      return {
        planId, totales: { ...cifrasDeJson(t), solicitado: n0(t.solicitado) },
        porLinea: lista<Fila>(r.por_linea).map((f) => { const { movimientos: _m, ...x } = lineaDe(f); void _m; return x; }),
        porPilar: lista<Fila>(r.por_pilar).map((f) => grupoDe(f, String(f.pilar ?? ""), String(f.pilar ?? "Sin pilar"))),
        porOficina: lista<Fila>(r.por_oficina).map((f) => grupoDe(f, String(f.unit_id ?? ""), String(f.nombre ?? "Sin oficina"))),
        porAnio: lista<Fila>(r.por_anio).map(anioDe),
      } satisfies PresupuestoPlan;
    },
    async presupuestoLinea(lineaId) { return lineaDe(await rpc<Fila>("ps_presupuesto_linea", { p_linea: lineaId })); },
    async presupuestoRegistrar(lineaId, d) {
      return movDe(await rpc<Fila>("ps_presupuesto_registrar", { p_linea: lineaId, p_datos: { anio: d.anio, tipo: d.tipo, monto: d.monto, fecha: d.fecha, fuente: d.fuente.trim(), referencia: d.referencia.trim(), nota: d.nota.trim() } }));
    },
    async presupuestoAnular(movId, motivo) { return movDe(await rpc<Fila>("ps_presupuesto_anular", { p_id: movId, p_motivo: motivo.trim() })); },
    async presupuestoCargar(planId, filas) {
      const r = await rpc<Fila>("ps_presupuesto_cargar", { p_plan: planId, p_filas: filas.map((f) => ({ linea: f.linea, anio: f.anio, tipo: f.tipo, monto: f.monto, fecha: f.fecha, fuente: f.fuente, referencia: f.referencia, nota: f.nota })) });
      return cargaDe(r, filas.length);
    },
    async vigilanciaPlan(planId) { return lista<Fila>(await rpc("ps_vigilancia_plan", { p_plan: planId })).map(alertaDe); },
    async vigilanciaGlobal() { return lista<Fila>(await rpc("ps_vigilancia_global")).map(alertaDe); },
    async umbralesPlan(planId) { return umbralesDe(((await rpc<Fila>("ps_plan_config_leer", { p_plan: planId })).vigilancia)); },
    async guardarUmbrales(planId, u) {
      const r = await rpc<Fila>("ps_plan_config_guardar", { p_plan: planId, p_config: { vigilancia: { umbral_desviacion: u.umbralDesviacion, umbral_sobreejecucion: u.umbralSobreejecucion, meses_sin_ejecucion: u.mesesSinEjecucion } } });
      return umbralesDe(r.vigilancia);
    },
    async vafConfigLeer() {
      const r = await rpc<Fila>("ps_vaf_config_leer");
      const u = (r.unidad ?? null) as Fila | null;
      return { unidad: u ? { id: String(u.unit_id), nombre: String(u.nombre ?? ""), codigo: String(u.codigo ?? "") } : null, destinatarios: n0(r.destinatarios) };
    },
    async vafConfigGuardar(unidadId) {
      const r = await rpc<Fila>("ps_vaf_config_guardar", { p_unit: unidadId });
      const u = (r.unidad ?? null) as Fila | null;
      return { unidad: u ? { id: String(u.unit_id), nombre: String(u.nombre ?? ""), codigo: String(u.codigo ?? "") } : null, destinatarios: n0(r.destinatarios) };
    },
  };
}
