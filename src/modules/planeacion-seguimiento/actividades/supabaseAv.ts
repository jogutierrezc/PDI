/* =============================================================================
   Planeación y Seguimiento · Fase 3 · implementación SUPABASE de avances, evidencias,
   riesgos, conexión con el PDI y plazos por oficina, escrita contra
   docs/planeacion-seguimiento/CONTRATO-BD-F3.md (migración 0288). NO se ejecutó contra una
   base real: la migración la construye otro agente en paralelo. Nombres de funciones y
   parámetros: los del contrato. Todo por `supabase.rpc` con la sesión de la persona; los
   archivos van al bucket privado `ps-evidencias` con supabase-js y se descargan por URL firmada.

   Supuestos que el contrato deja abiertos (si la base los resuelve distinto, se ajusta aquí):
     · `ps_avances_por_validar` devuelve cada fila con los campos del avance en la raíz o bajo `avance`
       (se aceptan las dos formas); `actividad.oficina_unit_id` puede faltar (entonces queda vacío);
     · `ps_riesgos.creado_por` puede venir como id o como {id, nombre};
     · `ps_actividad_cerrar` informa `autovalidado` (booleano) en su respuesta.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import type { PersonaRef, PsApiAct } from "./contratoApi";
import type { Accion, Avance, Comentario, ConfigAvisos, ConfigOficina, Evidencia, PdiActividad, PersonaAv, PilarCatalogo, PorValidar, Riesgo } from "./modeloF3";
import { SIN_AVANCE } from "./modeloF3";
import { rutaEvidencia } from "./reglasF3";
import { falla, lista, numero, rpc, despacharAvisos, texto, type Fila } from "./supabaseComun";

const persona = (v: unknown, nombres: Map<string, PersonaRef>): PersonaAv | null => {
  if (v && typeof v === "object") {
    const o = v as Fila;
    const id = String(o.id ?? "");
    const nombre = texto(o.nombre) ?? nombres.get(id)?.nombre ?? "Persona sin nombre";
    if (id) nombres.set(id, { id, nombre, correo: nombres.get(id)?.correo ?? "" });
    return { id, nombre };
  }
  if (typeof v === "string" && v) return { id: v, nombre: nombres.get(v)?.nombre ?? "Persona sin nombre" };
  return null;
};

export const evidenciaDe = (f: Fila): Evidencia => ({
  id: String(f.id), tipo: f.tipo === "enlace" ? "enlace" : "archivo", nombre: String(f.nombre ?? "Evidencia"), url: texto(f.url), storagePath: texto(f.storage_path), mime: texto(f.mime), bytes: numero(f.bytes), huella: texto(f.huella_sha256), creadaEn: String(f.creado_en ?? f.creada_en ?? ""),
});

export function avanceDe(f: Fila, nombres: Map<string, PersonaRef> = new Map()): Avance {
  return {
    id: String(f.id), actividadId: String(f.actividad_id ?? ""), fecha: String(f.fecha ?? ""), fisico: Number(f.av_fisico ?? 0), financiero: numero(f.av_financiero), nota: String(f.nota ?? ""),
    estado: f.estado === "validado" || f.estado === "devuelto" ? f.estado : "pendiente",
    reportadoPor: persona(f.reportado_por, nombres) ?? { id: "", nombre: "Persona sin nombre" }, reportadoEn: String(f.reportado_en ?? ""),
    revisadoPor: persona(f.revisado_por, nombres), revisadoEn: texto(f.revisado_en), notaRevision: texto(f.nota_revision), vencido: Boolean(f.vencido), autovalidado: Boolean(f.autovalidado),
    evidencias: lista<Fila>(f.evidencias).map(evidenciaDe),
  };
}

export function riesgoDe(f: Fila, nombres: Map<string, PersonaRef> = new Map()): Riesgo {
  const id = String(f.id);
  return {
    id, actividadId: String(f.actividad_id ?? ""), titulo: String(f.titulo ?? ""), descripcion: String(f.descripcion ?? ""), nivel: (f.nivel as Riesgo["nivel"]) ?? "Medio", estado: (f.estado as Riesgo["estado"]) ?? "abierto", mitigacion: String(f.mitigacion ?? ""),
    creadoPor: persona(f.creado_por, nombres) ?? { id: "", nombre: "Persona sin nombre" }, creadoEn: String(f.creado_en ?? ""), cerradoEn: texto(f.cerrado_en),
    acciones: lista<Fila>(f.acciones).map((a): Accion => ({ id: String(a.id), riesgoId: id, texto: String(a.texto ?? ""), responsableId: texto(a.responsable_id), vence: texto(a.vence), estado: (a.estado as Accion["estado"]) ?? "pendiente" })),
  };
}

export const comentarioDe = (c: Fila): Comentario => ({ id: String(c.id), autor: String(c.autor ?? "Alguien"), tipo: (c.tipo as Comentario["tipo"]) ?? "comentario", texto: String(c.texto ?? ""), creadoEn: String(c.creado_en ?? "") });

export function pdiDe(v: unknown): PdiActividad {
  const f = (v ?? {}) as Fila;
  const conexion = f.conexion === "con_pdi" || f.conexion === "sin_pdi" ? f.conexion : "sin_definir";
  return {
    conexion,
    items: lista<Fila>(f.items).map((i) => ({ pillarId: String(i.pillar_id), pilar: String(i.pillar ?? "Pilar"), pilarSlug: texto(i.pillar_slug), area: texto(i.area), lineaId: texto(i.linea_id), lineaCodigo: texto(i.linea_codigo), linea: texto(i.linea) })),
  };
}

export const avanceActDe = (v: unknown): Actividad_Avance => {
  const f = (v ?? null) as Fila | null;
  return f ? { fisico: Number(f.fisico ?? 0), financiero: numero(f.financiero), validadoEn: texto(f.validado_en), pendientes: Number(f.pendientes ?? 0) } : { ...SIN_AVANCE };
};
type Actividad_Avance = typeof SIN_AVANCE;

const cfgDe = (v: unknown): ConfigAvisos => {
  const f = (v ?? {}) as Fila;
  return { diasAntes: lista<number>(f.dias_antes).map(Number), vencidaMaxAvisos: Number(f.vencida_max_avisos ?? 0), vencidaGestorHoras: Number(f.vencida_gestor_horas ?? 0), validarHoras: Number(f.validar_horas ?? 72), activo: f.activo !== false };
};
const configOficinaDe = (v: unknown): ConfigOficina => {
  const f = (v ?? {}) as Fila;
  return { porDefecto: cfgDe(f.por_defecto), propia: f.propia ? cfgDe(f.propia) : null, efectiva: cfgDe(f.efectiva ?? f.propia ?? f.por_defecto) };
};

const BUCKET = "ps-evidencias";

type Metodos = Pick<PsApiAct, "catalogoPdi" | "resumenPdi" | "reportarAvance" | "subirEvidencia" | "urlEvidencia" | "validarAvance" | "devolverAvance" | "validarLote" | "cerrarActividad" | "avancesPorValidar" | "misAvances" | "crearRiesgo" | "editarRiesgo" | "cerrarRiesgo" | "crearAccion" | "editarAccion" | "marcarAccion" | "comentar" | "leerConfigAvisos" | "guardarConfigAvisos" | "quitarConfigAvisos">;

export function crearAvancesSupabase(nombres: Map<string, PersonaRef>, planActivo: () => string | null = () => null): Metodos {
  const evidenciaEnvio = (e: { tipo: string; nombre: string; storagePath?: string | null; url?: string | null; mime?: string | null; bytes?: number | null; huella?: string | null }) => ({
    tipo: e.tipo, nombre: e.nombre.trim(), storage_path: e.tipo === "archivo" ? e.storagePath : null, url: e.tipo === "enlace" ? e.url : null, mime: e.mime ?? null, bytes: e.bytes ?? null, huella_sha256: e.huella ?? null,
  });
  const datosRiesgo = (r: { titulo: string; descripcion: string; nivel: string; mitigacion: string }) => ({ titulo: r.titulo.trim(), descripcion: r.descripcion.trim(), nivel: r.nivel, mitigacion: r.mitigacion.trim() });
  const cfgEnvio = (oficinaId: string, c: ConfigAvisos) => ({ p_unit: oficinaId, p_dias_antes: c.diasAntes, p_vencida_max_avisos: c.vencidaMaxAvisos, p_vencida_gestor_horas: c.vencidaGestorHoras, p_validar_horas: c.validarHoras, p_activo: c.activo });

  return {
    async catalogoPdi() {
      const filas = await rpc<Fila[]>("ps_pdi_catalogo", {});
      return lista<Fila>(filas).map((p): PilarCatalogo => ({
        pillarId: String(p.pillar_id), codigo: String(p.codigo ?? p.slug ?? ""), nombre: String(p.nombre ?? ""),
        areas: lista<Fila>(p.areas).map((a) => ({ areaId: String(a.area_id), codigo: String(a.codigo ?? ""), nombre: String(a.nombre ?? ""), lineas: lista<Fila>(a.lineas).map((l) => ({ lineaId: String(l.linea_id), codigo: String(l.codigo ?? ""), nombre: String(l.nombre ?? "") })) })),
      }));
    },
    async resumenPdi(oficinaId) {
      const r = await rpc<Fila>("ps_resumen_pdi_oficina", { p_unit: oficinaId, p_plan: planActivo() });
      return { conPdi: Number(r.con_pdi ?? 0), sinPdi: Number(r.sin_pdi ?? 0), sinDefinir: Number(r.sin_definir ?? 0), porPilar: lista<Fila>(r.por_pilar).map((p) => ({ pillarId: String(p.pillar_id), nombre: String(p.nombre ?? ""), actividades: Number(p.actividades ?? 0) })) };
    },

    async reportarAvance(actividadId, d) {
      const r = await rpc<Fila>("ps_avance_reportar", {
        p_actividad: actividadId,
        p_datos: { fecha: d.fecha, av_fisico: d.fisico, av_financiero: d.financiero, nota: d.nota.trim(), evidencias: d.evidencias.map(evidenciaEnvio), riesgo: d.riesgo ? datosRiesgo(d.riesgo) : null },
      });
      despacharAvisos();
      return { avance: avanceDe((r.avance ?? {}) as Fila, nombres), avisara: [] };
    },
    async subirEvidencia(oficinaId, actividadId, archivo, huella) {
      const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const ruta = rutaEvidencia(oficinaId, actividadId, uuid, archivo.name);
      const r = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false });
      if (r.error) throw falla(r.error);
      return { tipo: "archivo", nombre: archivo.name.trim(), storagePath: ruta, mime: archivo.type || null, bytes: archivo.size, huella };
    },
    async urlEvidencia(e) {
      if (e.tipo === "enlace") return e.url ?? "";
      if (!e.storagePath) throw new Error("Esta evidencia no tiene archivo.");
      const r = await supabase.storage.from(BUCKET).createSignedUrl(e.storagePath, 300, { download: e.nombre });
      if (r.error || !r.data?.signedUrl) throw falla(r.error);
      return r.data.signedUrl;
    },
    async validarAvance(id, nota = "") {
      await rpc("ps_avance_validar", { p_id: id, p_nota: nota.trim() });
      despacharAvisos();
    },
    async devolverAvance(id, nota) {
      await rpc("ps_avance_devolver", { p_id: id, p_nota: nota.trim() });
      despacharAvisos();
    },
    async validarLote(ids) {
      const r = await rpc<Fila>("ps_avances_validar_lote", { p_ids: ids });
      despacharAvisos();
      return { validados: Number(r.validados ?? ids.length), completadas: Number(r.completadas ?? r.hechas ?? 0) };
    },
    async cerrarActividad(id, nota) {
      const r = await rpc<Fila>("ps_actividad_cerrar", { p_id: id, p_nota: nota.trim() });
      despacharAvisos();
      return { autovalidado: Boolean(r.autovalidado) };
    },
    async avancesPorValidar(oficinaId = null) {
      const filas = await rpc<Fila[]>("ps_avances_por_validar", { p_unit: oficinaId, p_plan: planActivo() });
      return lista<Fila>(filas).map((f): PorValidar => {
        const av = avanceDe(((f.avance as Fila | undefined) ?? f) as Fila, nombres);
        const rp = persona(f.reportado_por, nombres);
        const a = (f.actividad ?? {}) as Fila;
        return {
          avance: { ...av, actividadId: av.actividadId || String(a.id ?? ""), reportadoPor: rp ?? av.reportadoPor, vencido: Boolean(f.vencido ?? av.vencido) },
          actividad: { id: String(a.id ?? av.actividadId), titulo: String(a.titulo ?? "Actividad"), oficinaId: String(a.oficina_unit_id ?? ""), oficina: String(a.oficina ?? ""), fin: texto(a.fin) },
          horasEsperando: Number(f.horas_esperando ?? 0), vencido: Boolean(f.vencido), puedeValidar: f.puede_validar !== false,
        };
      });
    },
    async misAvances() {
      const filas = await rpc<Fila[]>("ps_mis_avances", {});
      return lista<Fila>(filas).map((f) => avanceDe(f, nombres));
    },

    async crearRiesgo(actividadId, d) {
      const r = await rpc<Fila>("ps_riesgo_crear", { p_actividad: actividadId, p_datos: datosRiesgo(d) });
      return riesgoDe(((r.riesgo as Fila | undefined) ?? r) as Fila, nombres);
    },
    async editarRiesgo(id, cambios) {
      await rpc("ps_riesgo_editar", { p_id: id, p_cambios: { ...(cambios.titulo !== undefined ? { titulo: cambios.titulo.trim() } : {}), ...(cambios.descripcion !== undefined ? { descripcion: cambios.descripcion.trim() } : {}), ...(cambios.nivel ? { nivel: cambios.nivel } : {}), ...(cambios.mitigacion !== undefined ? { mitigacion: cambios.mitigacion.trim() } : {}), ...(cambios.estado ? { estado: cambios.estado } : {}) } });
    },
    async cerrarRiesgo(id, nota) {
      await rpc("ps_riesgo_cerrar", { p_id: id, p_nota: nota.trim() });
    },
    async crearAccion(riesgoId, d) {
      const r = await rpc<Fila>("ps_accion_crear", { p_riesgo: riesgoId, p_datos: { texto: d.texto.trim(), responsable_id: d.responsableId, vence: d.vence } });
      const f = ((r.accion as Fila | undefined) ?? r) as Fila;
      return { id: String(f.id), riesgoId, texto: String(f.texto ?? d.texto), responsableId: texto(f.responsable_id), vence: texto(f.vence), estado: (f.estado as Accion["estado"]) ?? "pendiente" };
    },
    async editarAccion(id, cambios) {
      await rpc("ps_accion_editar", { p_id: id, p_cambios: { ...(cambios.texto !== undefined ? { texto: cambios.texto.trim() } : {}), ...(cambios.responsableId !== undefined ? { responsable_id: cambios.responsableId } : {}), ...(cambios.vence !== undefined ? { vence: cambios.vence } : {}) } });
    },
    async marcarAccion(id, estado) {
      await rpc("ps_accion_marcar", { p_id: id, p_estado: estado });
    },
    async comentar(actividadId, textoC) {
      await rpc("ps_comentar", { p_actividad: actividadId, p_texto: textoC.trim() });
    },

    async leerConfigAvisos(oficinaId) {
      return configOficinaDe(await rpc<Fila>("ps_config_oficina_leer", { p_unit: oficinaId }));
    },
    async guardarConfigAvisos(oficinaId, c) {
      await rpc("ps_config_oficina_guardar", cfgEnvio(oficinaId, c));
      despacharAvisos();
      return configOficinaDe(await rpc<Fila>("ps_config_oficina_leer", { p_unit: oficinaId }));
    },
    async quitarConfigAvisos(oficinaId) {
      await rpc("ps_config_oficina_quitar", { p_unit: oficinaId });
      return configOficinaDe(await rpc<Fila>("ps_config_oficina_leer", { p_unit: oficinaId }));
    },
  };
}
