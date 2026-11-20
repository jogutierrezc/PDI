/* =============================================================================
   Planeación y Seguimiento · proyectos · adaptador EN MEMORIA (demostración y pruebas).
   Opera sobre los planes y versiones de la capa de memoria (se le pasan por `deps`) con las mismas reglas puras
   de modeloProy.ts. No es un simulacro de seguridad: la base manda.
   ========================================================================== */

import type { LineaOficina } from "../actividades/modelo";
import type { ConfigPlan } from "../modeloPlanes";
import { aniosDe, type Linea, type PsNivel, type VersionResumen } from "../modelo";
import type { EvaluacionVaf } from "../vaf/modeloVaf";
import type { PsApiProy } from "./contratoProy";
import {
  aplicarEvaluacion, lineaDeDatos, puedeEditarProyectos, puedeEnviarPlan, puedeEvaluarProyecto, resumenAprobacion, siguienteClave, validarEvaluacionProyecto, validarPlanParaEnviar, validarProyecto,
  type EvaluacionProyecto,
} from "./modeloProy";
import { listaDeConfig } from "../modeloPlanes";

export interface VersionProyMem {
  meta: VersionResumen;
  lineas: Linea[];
}
export interface PlanProyMem {
  id: string;
  nombre: string;
  anioIni: number;
  anioFin: number;
  oficinaId: string;
  estado: "activo" | "archivado";
  config: ConfigPlan;
  versiones: VersionProyMem[];
}

export interface DepsProy {
  nivel: PsNivel;
  espera: () => Promise<void>;
  listo: () => Promise<void>;
  planes: () => PlanProyMem[];
  planActivo: () => PlanProyMem | null;
  crearMeta: (id: string, etiqueta: string, lineas: Linea[], publicada: boolean) => VersionResumen;
  oficinas: () => { id: string; nombre: string }[];
  campus: () => string[];
  oficinaDeLinea: (l: Linea) => string | null;
  vaf: { vafEvaluaciones: (planId: string) => Promise<EvaluacionVaf[]>; abrirEvaluacion: (planId: string, versionId: string, etiqueta: string, solicitado: number) => void };
  /** Después de cambiar líneas: que los adaptadores que las leen de nuevo no queden con copias viejas. */
  alCambiarLineas?: (planId: string) => void;
}

const vigente = (p: PlanProyMem) => p.versiones.find((v) => v.meta.vigente) ?? p.versiones.find((v) => v.meta.estado === "borrador") ?? null;
const exigir = (ok: boolean, m: string) => { if (!ok) throw new Error(m); };

export function crearProyectosMemoria(d: DepsProy): PsApiProy {
  const historial = new Map<string, EvaluacionProyecto[]>();
  let n = 0;
  const plan = (id: string): PlanProyMem => {
    const p = d.planes().find((x) => x.id === id);
    if (!p) throw new Error("Ese plan no existe o no puede verlo.");
    return p;
  };
  const poder = (): "admin" | "gestor" | "lector" => (d.nivel === "admin" ? "admin" : d.nivel === "gestor" ? "gestor" : "lector");
  const clave = (planId: string, no: string) => `${planId}::${no}`;
  const persona = () => (d.nivel === "admin" ? { id: "u-admin", nombre: "Administración de planeación (demostración)" } : { id: "u-vaf", nombre: "Natalia Quintero (VAF)" });
  const ctxProyecto = (p: PlanProyMem) => ({ config: p.config, campus: d.campus(), oficinas: d.oficinas().map((o) => o.nombre) });

  return {
    async proyectoEvaluar(planId, no, datos) {
      await d.listo(); await d.espera();
      exigir(puedeEvaluarProyecto(d.nivel), "Sin permiso: aprueban o rechazan proyectos solo el rol financiero (VAF) y el administrador.");
      const p = plan(planId);
      const v = vigente(p);
      const i = v?.lineas.findIndex((l) => l.no === no) ?? -1;
      exigir(Boolean(v) && i >= 0, `El proyecto «${no}» no está en la versión que se muestra.`);
      const l = v!.lineas[i];
      const errs = validarEvaluacionProyecto(datos, { montoSolicitado: l.monto, anioIni: p.anioIni, anioFin: p.anioFin, prioridades: listaDeConfig(p.config, "prioridad") });
      if (errs.length) throw new Error(errs[0].mensaje);
      v!.lineas[i] = aplicarEvaluacion(l, datos);
      d.alCambiarLineas?.(planId);
      const ev: EvaluacionProyecto = {
        id: `evp-${++n}`, planId, no, decision: datos.decision, montoSolicitado: l.monto, montoAprobado: datos.decision === "aprobado" ? datos.montoAprobado : 0,
        nota: datos.nota.trim(), evaluadoPor: persona(), evaluadoEn: new Date().toISOString(), version: v!.meta.etiqueta,
      };
      historial.set(clave(planId, no), [ev, ...(historial.get(clave(planId, no)) ?? [])]);
      return structuredClone(ev);
    },
    async proyectoEvaluaciones(planId, no) {
      await d.listo(); await d.espera();
      plan(planId);
      return structuredClone(historial.get(clave(planId, no)) ?? []);
    },
    async resumenAprobacion(planId) {
      await d.listo(); await d.espera();
      const p = plan(planId);
      return structuredClone(resumenAprobacion(vigente(p)?.lineas ?? [], aniosDe(p.anioIni, p.anioFin)));
    },
    async vafAbrirPendientes() {
      await d.listo(); await d.espera();
      exigir(d.nivel === "admin" || d.nivel === "financiero", "Sin permiso: abren las evaluaciones pendientes el administrador y la VAF.");
      const abiertas: string[] = [];
      for (const p of d.planes()) {
        const v = p.versiones.find((x) => x.meta.vigente);
        if (!v || p.estado !== "activo") continue;
        const evs = await d.vaf.vafEvaluaciones(p.id);
        if (evs.some((e) => e.versionId === v.meta.id)) continue;
        d.vaf.abrirEvaluacion(p.id, v.meta.id, v.meta.etiqueta, v.meta.inversion);
        abiertas.push(p.nombre);
      }
      return { abiertas: abiertas.length, planes: abiertas };
    },
    async proyectoGuardar(planId, datos, no) {
      await d.listo(); await d.espera();
      const p = plan(planId);
      let v = p.versiones.find((x) => x.meta.estado === "borrador") ?? null;
      const publicada = p.versiones.some((x) => x.meta.vigente);
      exigir(puedeEditarProyectos(d.nivel, poder(), v ? "borrador" : publicada ? "publicada" : null), publicada && !v ? "La versión publicada no se edita. Para cambiarla se abre un borrador por solicitud de cambio." : "Solo el administrador o el gestor de la oficina dueña crean y editan proyectos del borrador.");
      const errs = validarProyecto(datos, ctxProyecto(p));
      if (errs.length) throw new Error(errs[0].mensaje);
      if (!v) {
        v = { meta: d.crearMeta(`ver-${p.id}`, "v1.0", [], false), lineas: [] };
        p.versiones = [...p.versiones, v];
      }
      let nueva: Linea;
      if (no) {
        const i = v.lineas.findIndex((l) => l.no === no);
        exigir(i >= 0, `El proyecto «${no}» no está en el borrador.`);
        nueva = lineaDeDatos(no, datos, v.lineas[i]);
        v.lineas[i] = nueva;
      } else {
        nueva = lineaDeDatos(siguienteClave(v.lineas.map((l) => l.no)), datos);
        v.lineas = [...v.lineas, nueva];
      }
      v.meta = d.crearMeta(v.meta.id, v.meta.etiqueta, v.lineas, false);
      d.alCambiarLineas?.(planId);
      return structuredClone(nueva);
    },
    async proyectoEliminar(planId, no) {
      await d.listo(); await d.espera();
      const p = plan(planId);
      const v = p.versiones.find((x) => x.meta.estado === "borrador");
      exigir(Boolean(v), "La versión publicada no se edita: no se puede eliminar un proyecto.");
      exigir(puedeEditarProyectos(d.nivel, poder(), "borrador"), "Solo el administrador o el gestor de la oficina dueña eliminan proyectos del borrador.");
      exigir(v!.lineas.some((l) => l.no === no), `El proyecto «${no}» no está en el borrador.`);
      v!.lineas = v!.lineas.filter((l) => l.no !== no);
      v!.meta = d.crearMeta(v!.meta.id, v!.meta.etiqueta, v!.lineas, false);
      d.alCambiarLineas?.(planId);
    },
    async planEnviarEvaluacion(planId) {
      await d.listo(); await d.espera();
      const p = plan(planId);
      const v = p.versiones.find((x) => x.meta.estado === "borrador");
      exigir(Boolean(v), "No hay un borrador para enviar: la versión vigente ya está publicada.");
      exigir(puedeEnviarPlan(d.nivel, poder(), "borrador"), "Envían el plan a evaluación el administrador y el gestor de la oficina dueña.");
      exigir(p.estado === "activo", "Un plan archivado no se envía a evaluación.");
      const problemas = validarPlanParaEnviar(v!.lineas, ctxProyecto(p));
      if (problemas.length) throw new Error(`${problemas[0].no ? `Proyecto #${problemas[0].no}: ` : ""}${problemas[0].mensaje}`);
      v!.meta = d.crearMeta(v!.meta.id, v!.meta.etiqueta, v!.lineas, true);
      d.vaf.abrirEvaluacion(p.id, v!.meta.id, v!.meta.etiqueta, v!.meta.inversion);
      d.alCambiarLineas?.(planId);
      return { etiqueta: v!.meta.etiqueta };
    },
    async proyectosAsignarOficina(planId, claves, oficinaId) {
      await d.listo(); await d.espera();
      exigir(d.nivel === "admin", "Sin permiso: asigna oficinas a los proyectos solo el administrador de planeación.");
      exigir(claves.length > 0, "Elija al menos un proyecto.");
      const p = plan(planId);
      const of = oficinaId ? d.oficinas().find((o) => o.id === oficinaId) : null;
      exigir(!oficinaId || Boolean(of), "Esa oficina no existe.");
      const v = vigente(p);
      exigir(Boolean(v), "El plan no tiene proyectos.");
      let k = 0;
      v!.lineas = v!.lineas.map((l) => (claves.includes(l.no) ? (k++, { ...l, oficina: of?.nombre ?? null }) : l));
      d.alCambiarLineas?.(planId);
      return { asignadas: k };
    },
    async lineasParaActividad(oficinaId) {
      await d.listo(); await d.espera();
      const p = d.planActivo();
      const ls = p ? (vigente(p)?.lineas ?? []) : [];
      const conv = (l: Linea): LineaOficina => ({ no: l.no, nombre: l.nombre, monto: l.monto, campus: l.campus, prioridad: l.prioridad, inicio: l.inicio, fin: l.fin, clasif: l.clasif });
      const nombre = (id: string) => d.oficinas().find((o) => o.id === id)?.nombre ?? "Otra oficina";
      const propias = ls.filter((l) => d.oficinaDeLinea(l) === oficinaId).map(conv);
      const otras = ls.flatMap((l) => {
        const o = d.oficinaDeLinea(l);
        return o && o !== oficinaId ? [{ ...conv(l), oficinaId: o, oficinaNombre: nombre(o) }] : [];
      });
      return structuredClone({ propias, otras, conOficina: propias.length + otras.length, total: ls.length });
    },
  };
}

