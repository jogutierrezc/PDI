/* =============================================================================
   Planeación y Seguimiento · proyectos · implementación SUPABASE, escrita contra CONTRATO-BD-F3B.md §8 y la migración 0291
   (leídas, NO ejecutadas contra una base real). Todo por `supabase.rpc` con la sesión de la persona.
   Un proyecto es `ps_lineas.id`: la interfaz trabaja con la clave (N.º) y aquí se resuelve a `linea_id`.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import type { LineaOficina } from "../actividades/modelo";
import { CAMPUS_TODOS, type Linea } from "../modelo";
import type { LineaDeOtraOficina, PsApiProy } from "./contratoProy";
import type { CifraMonto, EstadoProyecto, EvaluacionProyecto, FilaAprobacion, GrupoAprobacion, ResumenAprobacion } from "./modeloProy";

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
/** Las funciones de matriz no lanzan por errores de campo: devuelven `{ok:false, errores}`; aquí se vuelven un error con el primer mensaje. */
function exigirOk(r: Fila): void {
  if (r.ok === false || r.enviada === false) {
    const e = lista<Fila>(r.errores);
    throw new Error(e.length ? `${e[0].campo ? `${String(e[0].campo)}: ` : ""}${String(e[0].mensaje ?? "Hay datos por corregir.")}` : "Hay datos por corregir.");
  }
}

/* ---------- Resumen solicitado vs aprobado (ps_resumen_aprobacion) ---------- */

const cantidad = (v: unknown): CifraMonto => ({ monto: n0((v as Fila | null)?.monto), n: n0((v as Fila | null)?.cantidad) });
const grupo = (f: Fila, clave: string, nombre: string): GrupoAprobacion => {
  const sol = (f.solicitado ?? {}) as Fila;
  const apr = (f.aprobado ?? {}) as Fila;
  return { clave, nombre, solicitado: n0(sol.monto), aprobado: n0(apr.monto), n: n0(sol.cantidad) };
};
const estadoDe = (v: unknown): EstadoProyecto => (v === "aprobado" || v === "rechazado" ? v : "sin_evaluar");

export function resumenAprobacionDeJson(v: unknown): ResumenAprobacion {
  const f = (v ?? {}) as Fila;
  const t = (f.totales ?? {}) as Fila;
  return {
    solicitado: cantidad(t.solicitado), aprobado: cantidad(t.aprobado), rechazado: cantidad(t.rechazado), sinEvaluar: cantidad(t.sin_evaluar),
    porPilar: lista<Fila>(f.por_pilar).map((g) => grupo(g, String(g.pilar ?? ""), String(g.pilar ?? "Sin pilar"))),
    porCampus: lista<Fila>(f.por_campus).map((g) => grupo(g, String(g.campus ?? ""), String(g.campus ?? "Sin campus"))),
    porOficina: lista<Fila>(f.por_oficina).map((g) => grupo(g, String(g.unit_id ?? "sin"), String(g.nombre ?? "Sin oficina"))),
    porAnio: lista<Fila>(f.por_anio).map((g) => ({ clave: String(g.anio), nombre: String(g.anio), solicitado: n0(g.solicitado), aprobado: n0(g.aprobado), n: 0 })),
    solicitadoSinDistribuir: n0(f.solicitado_sin_distribuir),
    proyectos: lista<Fila>(f.proyectos).map((p): FilaAprobacion => {
      const of = (p.oficina ?? null) as Fila | null;
      return {
        no: String(p.clave ?? ""), nombre: String(p.nombre ?? ""), pilar: String(p.pilar ?? ""), campus: String(p.campus ?? ""), oficina: of ? texto(of.nombre) : null,
        estado: estadoDe(p.estado), solicitado: n0(p.solicitado), aprobado: num(p.aprobado), diferencia: num(p.diferencia),
      };
    }),
  };
}

const evaluacionDe = (f: Fila, planId: string, no: string): EvaluacionProyecto => {
  const por = (f.evaluado_por ?? null) as Fila | null;
  return {
    id: String(f.id), planId, no, decision: f.resultado === "Rechazado" ? "rechazado" : "aprobado", montoSolicitado: num(f.monto_solicitado), montoAprobado: num(f.monto_aprobado),
    nota: String(f.nota ?? ""), evaluadoPor: por && por.id ? { id: String(por.id), nombre: String(por.nombre ?? "Persona sin nombre") } : null, evaluadoEn: String(f.evaluado_en ?? ""), version: "",
  };
};

/** `ps_lineas_para_actividad` → propias y de otras oficinas (las que se pueden vincular). Sin dinero ni fechas: la base no los trae. */
export function lineasParaActividadDeJson(v: unknown, oficinaId: string) {
  const filas = lista<Fila>(v);
  const lineaOf = (f: Fila): LineaOficina => ({ no: String(f.clave), nombre: String(f.nombre ?? ""), monto: null, campus: texto(f.campus) ?? CAMPUS_TODOS, prioridad: String(f.prioridad ?? ""), inicio: null, fin: null, clasif: "" });
  const conOf = (f: Fila) => Boolean((f.oficina as Fila | null)?.unit_id);
  return {
    propias: filas.filter((f) => f.propios === true).map(lineaOf),
    otras: filas.filter((f) => f.aporta === true && f.puede_vincular === true && conOf(f)).map((f): LineaDeOtraOficina => {
      const o = f.oficina as Fila;
      return { ...lineaOf(f), oficinaId: String(o.unit_id), oficinaNombre: String(o.nombre ?? "Otra oficina") };
    }),
    conOficina: filas.filter(conOf).length,
    total: filas.length,
    oficinaId,
  };
}

export function crearProyectosSupabase(plan: () => string | null): PsApiProy {
  /** `ps_lineas.id` de un proyecto por su clave. */
  const lineaId = async (planId: string, no: string): Promise<string> => {
    const r = await supabase.from("ps_lineas").select("id").eq("plan_id", planId).eq("clave", no).maybeSingle();
    if (r.error) throw falla(r.error);
    const id = (r.data as Fila | null)?.id;
    if (!id) throw new Error(`El proyecto «${no}» no existe en este plan.`);
    return String(id);
  };
  return {
    async proyectoEvaluar(planId, no, d) {
      const datos = d.decision === "aprobado"
        ? {
            resultado: "Aprobado", criterios: d.criterios, viabilidad: d.viabilidad, prioridad: d.prioridad, inicio: d.inicio, fin: d.fin,
            pct: Object.fromEntries(Object.entries(d.pct).filter(([, v]) => (v ?? 0) > 0).map(([a, v]) => [a, v])), monto_aprobado: d.montoAprobado, nota: d.nota.trim(),
          }
        : { resultado: "Rechazado", criterios: Object.fromEntries(Object.entries(d.criterios).filter(([, v]) => v !== null)), viabilidad: Object.fromEntries(Object.entries(d.viabilidad).filter(([, v]) => v !== null)), nota: d.nota.trim() };
      return evaluacionDe(await rpc<Fila>("ps_proyecto_evaluar", { p_linea: await lineaId(planId, no), p_datos: datos }), planId, no);
    },
    async proyectoEvaluaciones(planId, no) {
      const r = await rpc<Fila>("ps_proyecto_evaluacion_leer", { p_linea: await lineaId(planId, no) });
      return lista<Fila>(r.historial).map((f) => evaluacionDe(f, planId, no));
    },
    async resumenAprobacion(planId) { return resumenAprobacionDeJson(await rpc("ps_resumen_aprobacion", { p_plan: planId })); },
    async vafAbrirPendientes() {
      const r = await rpc<Fila>("ps_vaf_abrir_pendientes");
      return { abiertas: n0(r.abiertas), planes: lista<Fila>(r.planes).map((p) => String(p.plan ?? p.nombre ?? "Plan")) };
    },
    async proyectoGuardar(planId, d, no) {
      const datos = { nombre: d.nombre.trim(), descripcion: d.descripcion.trim(), campus: d.campus, pilar: d.pilar, monto: d.monto, prioridad: d.prioridad, oficina: d.oficina, fuente: d.fuente, clasif: d.clasif };
      let r: Fila;
      if (no) {
        const b = await rpc<Fila>("ps_borrador_leer", { p_plan: planId });
        const p = lista<Fila>(b.proyectos).find((x) => x.clave === no);
        if (!p) throw new Error(`El proyecto «${no}» no está en el borrador.`);
        r = await rpc<Fila>("ps_proyecto_editar", { p_linea: String(p.linea_id), p_cambios: datos });
      } else r = await rpc<Fila>("ps_proyecto_crear", { p_plan: planId, p_datos: datos });
      exigirOk(r);
      const p = (r.proyecto ?? {}) as Fila;
      return { no: String(p.clave ?? no ?? ""), lineaId: texto(p.linea_id) ?? undefined, ...datos, descripcion: datos.descripcion || null, fuente: datos.fuente || null, oficina: datos.oficina || null, resultado: null } as unknown as Linea;
    },
    async proyectoEliminar(planId, no) {
      const b = await rpc<Fila>("ps_borrador_leer", { p_plan: planId });
      const p = lista<Fila>(b.proyectos).find((x) => x.clave === no);
      if (!p) throw new Error(`El proyecto «${no}» no está en el borrador.`);
      exigirOk(await rpc<Fila>("ps_proyecto_borrar", { p_linea: String(p.linea_id), p_motivo: "" }));
    },
    async planEnviarEvaluacion(planId, nota) {
      const r = await rpc<Fila>("ps_plan_enviar_a_evaluacion", { p_plan: planId, p_nota: nota });
      exigirOk(r);
      return { etiqueta: String(r.etiqueta ?? "") };
    },
    async proyectosAsignarOficina(planId, claves, oficinaId) {
      const p = await supabase.from("ps_planes").select("version_vigente_id").eq("id", planId).maybeSingle();
      if (p.error) throw falla(p.error);
      if ((p.data as Fila | null)?.version_vigente_id) {
        const r = await rpc<Fila>("ps_asignar_oficinas_lineas", { p_plan: planId, p_asignaciones: claves.map((c) => ({ clave: c, oficina_unit_id: oficinaId })) });
        exigirOk({ ok: lista(r.errores).length === 0, errores: r.errores });
        return { asignadas: n0(r.asignadas) + n0(r.sin_cambio) };
      }
      // Sin versión vigente: la oficina se asigna en el borrador, proyecto por proyecto (`ps_asignar_oficina_linea`).
      const b = await supabase.from("ps_versiones").select("id").eq("plan_id", planId).eq("estado", "borrador").maybeSingle();
      if (b.error) throw falla(b.error);
      const version = (b.data as Fila | null)?.id;
      if (!version) throw new Error("El plan no tiene proyectos.");
      for (const c of claves) await rpc("ps_asignar_oficina_linea", { p_version: String(version), p_clave: c, p_unit: oficinaId });
      return { asignadas: claves.length };
    },
    async lineasParaActividad(oficinaId) {
      const { oficinaId: _o, ...r } = lineasParaActividadDeJson(await rpc("ps_lineas_para_actividad", { p_oficina: oficinaId, p_plan: plan() }), oficinaId);
      void _o;
      return r;
    },
  };
}
