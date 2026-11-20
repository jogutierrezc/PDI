/* =============================================================================
   Planeación y Seguimiento · Fase 3 · adaptador EN MEMORIA de avances, evidencias,
   riesgos, comentarios, conexión con el PDI y plazos de aviso por oficina.
   Aplica las mismas reglas que la interfaz (reglas.ts, reglasF3.ts). No es un simulacro
   de seguridad: la base (CONTRATO-BD-F3.md) es quien hace cumplir. El reloj es el de la
   demostración («hoy» a las 12:00) más el tiempo real transcurrido.
   ========================================================================== */

import type { PsNivel } from "../modelo";
import type { PsApiAct } from "./contratoApi";
import type { Actividad, AvisoPrevio, EventoActividad, MiembroEquipo, PapelOficina, Poder } from "./modelo";
import type { Accion, Avance, Comentario, ConfigAvisos, ConfigOficina, Evidencia, NuevaEvidencia, Riesgo } from "./modeloF3";
import { CATALOGO_PDI_DEMO, type DatosF3 } from "./semilla";
import { resumirPdi } from "./pdi";
import { MAX_ACCIONES, MAX_RIESGOS_ABIERTOS, esRiesgoGrave, estadoTrasValidar, horasEsperando, puedeCerrar, puedeReportar, puedeValidar, validarAccion, validarArchivo, validarAvance, validarConfigAvisos, validarLote, validarNotaCierre, validarNotaRevision, validarRiesgo, rutaEvidencia, validarEvidencia } from "./reglasF3";

export type MetodosF3 = Pick<PsApiAct, "catalogoPdi" | "resumenPdi" | "reportarAvance" | "subirEvidencia" | "urlEvidencia" | "validarAvance" | "devolverAvance" | "validarLote" | "cerrarActividad" | "avancesPorValidar" | "misAvances" | "crearRiesgo" | "editarRiesgo" | "cerrarRiesgo" | "crearAccion" | "editarAccion" | "marcarAccion" | "comentar" | "leerConfigAvisos" | "guardarConfigAvisos" | "quitarConfigAvisos">;

export interface DepsF3 {
  hoy: string;
  yoId: string;
  nivel: PsNivel;
  espera: () => Promise<void>;
  /** Todo lo que ya cargó el adaptador de actividades. */
  estado: () => Promise<{ acts: Actividad[]; eventos: Map<string, EventoActividad[]>; f3: DatosF3 }>;
  poderOf: (oficinaId: string) => Poder;
  visible: (oficinaId: string) => boolean;
  nombreDe: (id: string) => string;
  oficinaNombre: (id: string) => string;
  /** Papel (unit_role) de una persona en la oficina. */
  papelDe: (personaId: string, oficinaId: string) => PapelOficina | null;
  equipo: (oficinaId: string, acts: readonly Actividad[]) => MiembroEquipo[];
  registrar: (a: Actividad, ev: Omit<EventoActividad, "id" | "en" | "por">) => Promise<void>;
}

export const CONFIG_GENERAL_DEMO: ConfigAvisos = { diasAntes: [7, 3, 0], vencidaMaxAvisos: 3, vencidaGestorHoras: 48, validarHoras: 72, activo: true };

export function crearF3(d: DepsF3): MetodosF3 {
  const t0 = Date.now();
  const base = Date.parse(`${d.hoy}T12:00:00Z`);
  const ahora = () => new Date(base + (Date.now() - t0)).toISOString();
  const propias = new Map<string, ConfigAvisos>();
  const archivos = new Map<string, string>();
  let n = 0;
  const id = (p: string) => `${p}-m${Date.now().toString(36)}${++n}`;
  const exigir = (ok: boolean, mensaje: string) => {
    if (!ok) throw new Error(mensaje);
  };
  const yo = () => ({ id: d.yoId, nombre: d.nombreDe(d.yoId) });
  const efectiva = (oficinaId: string): ConfigAvisos => propias.get(oficinaId) ?? CONFIG_GENERAL_DEMO;
  const copia = <T,>(x: T): T => structuredClone(x);

  const actividad = async (actividadId: string) => {
    const e = await d.estado();
    await d.espera();
    const a = e.acts.find((x) => x.id === actividadId);
    exigir(Boolean(a) && d.visible(a!.oficinaId), "La actividad no existe o no puede verla.");
    return { a: a!, e };
  };
  const avancesDe = (e: { f3: DatosF3 }, actividadId: string) => e.f3.avances.filter((x) => x.actividadId === actividadId);
  /** El avance de la actividad = el del último validado; sin ninguno, 0. */
  const recalcular = (a: Actividad, e: { f3: DatosF3 }) => {
    const mios = avancesDe(e, a.id);
    const v = mios.filter((x) => x.estado === "validado").sort((p, q) => (p.revisadoEn ?? "").localeCompare(q.revisadoEn ?? "") || p.fisico - q.fisico).at(-1);
    a.avance = { fisico: v?.fisico ?? 0, financiero: v?.financiero ?? null, validadoEn: v?.revisadoEn ?? null, pendientes: mios.filter((x) => x.estado === "pendiente").length };
  };
  const comentarioDe = (e: { f3: DatosF3 }, actividadId: string, tipo: Comentario["tipo"], texto: string, autor = d.nombreDe(d.yoId)) => {
    const l = e.f3.comentarios.get(actividadId) ?? [];
    l.push({ id: id("cm"), autor, tipo, texto, creadoEn: ahora() });
    e.f3.comentarios.set(actividadId, l);
  };
  const gestoresDe = (oficinaId: string, acts: readonly Actividad[]) => d.equipo(oficinaId, acts).filter((m) => m.papel === "jefe");
  const avisar = (m: Pick<MiembroEquipo, "id" | "nombre" | "correo">, motivo: AvisoPrevio["motivo"]): AvisoPrevio => ({ personaId: m.id, nombre: m.nombre, correo: m.correo, motivo });
  const esGestor = (personaId: string, oficinaId: string) => d.papelDe(personaId, oficinaId) === "jefe";
  const riesgoGrave = (e: { f3: DatosF3 }, actividadId: string) => e.f3.riesgos.some((r) => r.actividadId === actividadId && esRiesgoGrave(r));

  const aEvidencia = (x: NuevaEvidencia, e = ahora()): Evidencia => ({ id: id("ev"), tipo: x.tipo, nombre: x.nombre.trim(), url: x.tipo === "enlace" ? (x.url ?? null) : null, storagePath: x.tipo === "archivo" ? (x.storagePath ?? null) : null, mime: x.mime ?? null, bytes: x.bytes ?? null, huella: x.huella ?? null, creadaEn: e });

  const crearRiesgoEn = (a: Actividad, e: { f3: DatosF3 }, r: Parameters<MetodosF3["crearRiesgo"]>[1]): Riesgo => {
    const errs = validarRiesgo(r);
    exigir(!errs.length, errs[0]?.mensaje ?? "");
    exigir(e.f3.riesgos.filter((x) => x.actividadId === a.id && x.estado !== "cerrado").length < MAX_RIESGOS_ABIERTOS, `Una actividad admite hasta ${MAX_RIESGOS_ABIERTOS} riesgos abiertos.`);
    const nuevo: Riesgo = { id: id("rg"), actividadId: a.id, titulo: r.titulo.trim(), descripcion: r.descripcion.trim(), nivel: r.nivel, estado: "abierto", mitigacion: r.mitigacion.trim(), creadoPor: yo(), creadoEn: ahora(), cerradoEn: null, acciones: [] };
    e.f3.riesgos.push(nuevo);
    return nuevo;
  };

  /** Por qué no se puede validar o devolver este avance (null = se puede). */
  const motivoNo = (av: Avance, a: Actividad, e: { f3: DatosF3 }): string | null => {
    if (av.estado !== "pendiente") return "Ese avance ya fue revisado.";
    const dec = puedeValidar({ poder: d.poderOf(a.oficinaId), esAdmin: d.nivel === "admin", yo: d.yoId, autorId: av.reportadoPor.id, autorEsGestor: esGestor(av.reportadoPor.id, a.oficinaId) });
    if (!dec.ok) return dec.motivo;
    void e;
    return null;
  };
  const aplicarValidacion = async (av: Avance, a: Actividad, e: { f3: DatosF3; acts: Actividad[] }, nota: string): Promise<boolean> => {
    const ultimo = e.f3.avances.filter((x) => x.actividadId === a.id && x.estado === "validado").reduce((m, x) => Math.max(m, x.fisico), 0);
    exigir(av.fisico >= ultimo, `El avance (${av.fisico} %) quedaría por debajo del último validado (${ultimo} %).`);
    av.estado = "validado";
    av.revisadoPor = yo();
    av.revisadoEn = ahora();
    av.notaRevision = nota.trim() || null;
    av.vencido = false;
    a.estado = estadoTrasValidar(av.fisico, riesgoGrave(e, a.id));
    recalcular(a, e);
    await d.registrar(a, { tipo: "avance", detalle: `Validó el avance de ${av.fisico} % de ${av.reportadoPor.nombre}.${av.fisico >= 100 ? " La actividad quedó «Hecha»." : ""}`, motivo: av.notaRevision });
    return av.fisico >= 100;
  };

  const leerConfig = (oficinaId: string): ConfigOficina => ({ porDefecto: copia(CONFIG_GENERAL_DEMO), propia: propias.has(oficinaId) ? copia(propias.get(oficinaId)!) : null, efectiva: copia(efectiva(oficinaId)) });
  const poderConfig = (oficinaId: string) => exigir(d.poderOf(oficinaId) === "gestor", "Solo el gestor de la oficina o la administración cambian sus plazos de aviso.");

  return {
    async catalogoPdi() {
      await d.espera();
      return copia(CATALOGO_PDI_DEMO);
    },
    async resumenPdi(oficinaId) {
      const e = await d.estado();
      await d.espera();
      exigir(d.visible(oficinaId), "No puede ver esa oficina.");
      return resumirPdi(e.acts.filter((a) => a.oficinaId === oficinaId));
    },

    async reportarAvance(actividadId, datos) {
      const { a, e } = await actividad(actividadId);
      const dec = puedeReportar(d.poderOf(a.oficinaId), a, d.yoId);
      if (!dec.ok) throw new Error(dec.motivo);
      const errs = validarAvance(datos, { hoy: d.hoy, ultimoValidado: a.avance.fisico });
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      const av: Avance = {
        id: id("av"), actividadId, fecha: datos.fecha, fisico: datos.fisico, financiero: datos.financiero, nota: datos.nota.trim(), estado: "pendiente", reportadoPor: yo(), reportadoEn: ahora(), revisadoPor: null, revisadoEn: null, notaRevision: null, vencido: false,
        evidencias: datos.evidencias.map((x) => aEvidencia(x)),
      };
      e.f3.avances.push(av);
      if (datos.riesgo) crearRiesgoEn(a, e, datos.riesgo);
      const de = a.estado;
      a.estado = "en_revision";
      recalcular(a, e);
      comentarioDe(e, a.id, "cambio_estado", `Reportó un avance de ${av.fisico} %.`);
      await d.registrar(a, { tipo: "avance", detalle: `Reportó un avance de ${av.fisico} % y pasó de «${de}» a «En revisión».`, motivo: av.nota });
      const gestores = gestoresDe(a.oficinaId, e.acts).filter((m) => m.id !== d.yoId);
      return { avance: copia(av), avisara: gestores.map((m) => avisar(m, "avance")) };
    },

    async subirEvidencia(oficinaId, actividadId, archivo, huella) {
      const m = validarArchivo({ name: archivo.name, size: archivo.size, type: archivo.type });
      exigir(!m, m ?? "");
      await d.espera();
      const ruta = rutaEvidencia(oficinaId, actividadId, id("u"), archivo.name);
      try {
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") archivos.set(ruta, URL.createObjectURL(archivo));
      } catch {
        /* sin URL de objeto: se usa el texto de demostración */
      }
      return { tipo: "archivo", nombre: archivo.name.trim(), storagePath: ruta, mime: archivo.type || null, bytes: archivo.size, huella };
    },
    async urlEvidencia(ev) {
      if (ev.tipo === "enlace") return ev.url ?? "";
      return archivos.get(ev.storagePath ?? "") ?? `data:text/plain;charset=utf-8,${encodeURIComponent(`Archivo de demostración: ${ev.nombre}. En la intranet se descarga con una URL firmada del bucket ps-evidencias.`)}`;
    },

    async validarAvance(avId, nota = "") {
      const e = await d.estado();
      await d.espera();
      const av = e.f3.avances.find((x) => x.id === avId);
      exigir(Boolean(av), "Ese avance no existe.");
      const a = e.acts.find((x) => x.id === av!.actividadId)!;
      exigir(d.visible(a.oficinaId), "Ese avance no existe.");
      const m = motivoNo(av!, a, e);
      exigir(!m, m ?? "");
      await aplicarValidacion(av!, a, e, nota);
      comentarioDe(e, a.id, "cambio_estado", `Validó el avance de ${av!.fisico} %.`);
    },
    async devolverAvance(avId, nota) {
      const e = await d.estado();
      await d.espera();
      const av = e.f3.avances.find((x) => x.id === avId);
      exigir(Boolean(av), "Ese avance no existe.");
      const a = e.acts.find((x) => x.id === av!.actividadId)!;
      exigir(d.visible(a.oficinaId), "Ese avance no existe.");
      const m = motivoNo(av!, a, e);
      exigir(!m, m ?? "");
      const v = validarNotaRevision(nota);
      exigir(!v, v ?? "");
      av!.estado = "devuelto";
      av!.revisadoPor = yo();
      av!.revisadoEn = ahora();
      av!.notaRevision = nota.trim();
      av!.vencido = false;
      a.estado = "en_curso";
      recalcular(a, e);
      comentarioDe(e, a.id, "devolucion", nota.trim());
      await d.registrar(a, { tipo: "avance", detalle: `Devolvió el avance de ${av!.reportadoPor.nombre}.`, motivo: nota.trim() });
    },
    async validarLote(ids) {
      const e = await d.estado();
      await d.espera();
      const v = validarLote(ids);
      exigir(!v, v ?? "");
      const lista = ids.map((x) => e.f3.avances.find((q) => q.id === x));
      // Todo o nada: primero se comprueban todos.
      for (const av of lista) {
        exigir(Boolean(av), "Uno de los avances no existe.");
        const a = e.acts.find((x) => x.id === av!.actividadId)!;
        exigir(d.visible(a.oficinaId), "Uno de los avances no existe.");
        const m = motivoNo(av!, a, e);
        exigir(!m, `Avance ${av!.id}: ${m} No se validó ninguno («${a.titulo}»).`);
      }
      let completadas = 0;
      for (const av of lista.sort((p, q) => p!.fisico - q!.fisico)) {
        const a = e.acts.find((x) => x.id === av!.actividadId)!;
        if (await aplicarValidacion(av!, a, e, "")) completadas += 1;
      }
      return { validados: lista.length, completadas };
    },
    async cerrarActividad(actId, nota) {
      const { a, e } = await actividad(actId);
      exigir(puedeCerrar(d.poderOf(a.oficinaId)), "El cierre administrativo es del gestor de la oficina.");
      exigir(a.estado !== "hecho", "La actividad ya está hecha.");
      const v = validarNotaCierre(nota);
      exigir(!v, v ?? "");
      // Lo que esperaba revisión de otra persona se valida en el mismo gesto; lo propio se da por reemplazado.
      for (const av of avancesDe(e, a.id).filter((x) => x.estado === "pendiente")) {
        if (av.reportadoPor.id === d.yoId) {
          av.estado = "devuelto";
          av.revisadoPor = null;
          av.revisadoEn = ahora();
          av.notaRevision = "Reemplazado por el cierre administrativo de la actividad.";
        } else if (!motivoNo(av, a, e)) await aplicarValidacion(av, a, e, "");
      }
      // Contrato F3 §6.1: el cierre siempre queda autovalidado (autor = revisor = quien cierra) y auditado.
      const autovalidado = true;
      const t = ahora();
      const cierre: Avance = {
        id: id("av"), actividadId: a.id, fecha: d.hoy, fisico: 100, financiero: a.avance.financiero, nota: nota.trim(), estado: "validado",
        reportadoPor: yo(), reportadoEn: t, revisadoPor: yo(), revisadoEn: t, notaRevision: "Cierre administrativo del gestor.", vencido: false, autovalidado: true, evidencias: [],
      };
      e.f3.avances.push(cierre);
      a.estado = "hecho";
      recalcular(a, e);
      comentarioDe(e, a.id, "cambio_estado", `Cierre administrativo: ${nota.trim()}`);
      await d.registrar(a, { tipo: "avance", detalle: "Cerró la actividad (cierre administrativo, autovalidado: queda para auditoría).", motivo: nota.trim() });
      return { autovalidado };
    },
    async avancesPorValidar(oficinaId = null) {
      const e = await d.estado();
      await d.espera();
      const t = ahora();
      const out = e.f3.avances
        .filter((av) => av.estado === "pendiente")
        .flatMap((av) => {
          const a = e.acts.find((x) => x.id === av.actividadId);
          if (!a || !d.visible(a.oficinaId) || d.poderOf(a.oficinaId) !== "gestor" || (oficinaId && a.oficinaId !== oficinaId)) return [];
          const h = horasEsperando(av.reportadoEn, t);
          const vencido = h >= efectiva(a.oficinaId).validarHoras;
          return [{ avance: copia({ ...av, vencido }), actividad: { id: a.id, titulo: a.titulo, oficinaId: a.oficinaId, oficina: d.oficinaNombre(a.oficinaId), fin: a.fin }, horasEsperando: h, vencido, puedeValidar: motivoNo(av, a, e) === null }];
        });
      return out.sort((p, q) => p.avance.reportadoEn.localeCompare(q.avance.reportadoEn));
    },
    async misAvances() {
      const e = await d.estado();
      await d.espera();
      return copia(e.f3.avances.filter((av) => av.reportadoPor.id === d.yoId).sort((p, q) => q.reportadoEn.localeCompare(p.reportadoEn)));
    },

    async crearRiesgo(actId, r) {
      const { a, e } = await actividad(actId);
      const poder = d.poderOf(a.oficinaId);
      exigir(poder === "gestor" || (poder === "colaborador" && a.asignados.includes(d.yoId)), "Crea riesgos el gestor o el colaborador que tiene asignada la actividad.");
      const nuevo = crearRiesgoEn(a, e, r);
      await d.registrar(a, { tipo: "riesgo", detalle: `Creó el riesgo «${nuevo.titulo}» (${nuevo.nivel}).` });
      return copia(nuevo);
    },
    async editarRiesgo(rid, cambios) {
      const e = await d.estado();
      await d.espera();
      const r = e.f3.riesgos.find((x) => x.id === rid);
      exigir(Boolean(r), "Ese riesgo no existe.");
      const a = e.acts.find((x) => x.id === r!.actividadId)!;
      exigir(d.poderOf(a.oficinaId) === "gestor", "Edita los riesgos el gestor de la oficina.");
      const nuevo = { titulo: r!.titulo, descripcion: r!.descripcion, nivel: r!.nivel, mitigacion: r!.mitigacion, ...cambios };
      const errs = validarRiesgo(nuevo);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      Object.assign(r!, { titulo: nuevo.titulo.trim(), descripcion: nuevo.descripcion.trim(), nivel: nuevo.nivel, mitigacion: nuevo.mitigacion.trim() });
      if (cambios.estado) {
        r!.estado = cambios.estado;
        r!.cerradoEn = cambios.estado === "cerrado" ? ahora() : null;
      }
      await d.registrar(a, { tipo: "riesgo", detalle: `Editó el riesgo «${r!.titulo}».` });
    },
    async cerrarRiesgo(rid, nota) {
      const e = await d.estado();
      await d.espera();
      const r = e.f3.riesgos.find((x) => x.id === rid);
      exigir(Boolean(r), "Ese riesgo no existe.");
      const a = e.acts.find((x) => x.id === r!.actividadId)!;
      exigir(d.poderOf(a.oficinaId) === "gestor", "Cierra los riesgos el gestor de la oficina.");
      exigir(nota.trim().length >= 3, "Cuente cómo quedó resuelto (al menos 3 caracteres).");
      r!.estado = "cerrado";
      r!.cerradoEn = ahora();
      await d.registrar(a, { tipo: "riesgo", detalle: `Cerró el riesgo «${r!.titulo}».`, motivo: nota.trim() });
    },
    async crearAccion(rid, x) {
      const e = await d.estado();
      await d.espera();
      const r = e.f3.riesgos.find((q) => q.id === rid);
      exigir(Boolean(r), "Ese riesgo no existe.");
      const a = e.acts.find((q) => q.id === r!.actividadId)!;
      exigir(d.poderOf(a.oficinaId) === "gestor", "Crea las acciones el gestor de la oficina.");
      const errs = validarAccion(x);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      exigir(r!.acciones.length < MAX_ACCIONES, `Un riesgo admite hasta ${MAX_ACCIONES} acciones.`);
      const acc: Accion = { id: id("ac"), riesgoId: rid, texto: x.texto.trim(), responsableId: x.responsableId, vence: x.vence, estado: "pendiente" };
      r!.acciones.push(acc);
      await d.registrar(a, { tipo: "riesgo", detalle: `Agregó la acción «${acc.texto}» al riesgo «${r!.titulo}».` });
      return copia(acc);
    },
    async editarAccion(aid, cambios) {
      const e = await d.estado();
      await d.espera();
      const r = e.f3.riesgos.find((q) => q.acciones.some((z) => z.id === aid));
      exigir(Boolean(r), "Esa acción no existe.");
      const a = e.acts.find((q) => q.id === r!.actividadId)!;
      exigir(d.poderOf(a.oficinaId) === "gestor", "Edita las acciones el gestor de la oficina.");
      const acc = r!.acciones.find((z) => z.id === aid)!;
      const nuevo = { texto: acc.texto, responsableId: acc.responsableId, vence: acc.vence, ...cambios };
      const errs = validarAccion(nuevo);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      Object.assign(acc, { texto: nuevo.texto.trim(), responsableId: nuevo.responsableId, vence: nuevo.vence });
    },
    async marcarAccion(aid, estado) {
      const e = await d.estado();
      await d.espera();
      const r = e.f3.riesgos.find((q) => q.acciones.some((z) => z.id === aid));
      exigir(Boolean(r), "Esa acción no existe.");
      const a = e.acts.find((q) => q.id === r!.actividadId)!;
      const acc = r!.acciones.find((z) => z.id === aid)!;
      const poder = d.poderOf(a.oficinaId);
      exigir(poder === "gestor" || (poder === "colaborador" && acc.responsableId === d.yoId), "Marca la acción su responsable o el gestor de la oficina.");
      acc.estado = estado;
      await d.registrar(a, { tipo: "riesgo", detalle: `Marcó la acción «${acc.texto}» como ${estado === "hecha" ? "hecha" : estado === "en_curso" ? "en curso" : "pendiente"}.` });
    },
    async comentar(actId, texto) {
      const { a, e } = await actividad(actId);
      const p = d.poderOf(a.oficinaId);
      exigir(p === "gestor" || p === "colaborador" || d.nivel === "aprobador", "Con acceso de lector solo puede leer los comentarios.");
      const t = texto.trim();
      exigir(t.length >= 1 && t.length <= 2000, "Escriba el comentario (hasta 2.000 caracteres).");
      comentarioDe(e, a.id, "comentario", t);
    },

    async leerConfigAvisos(oficinaId) {
      await d.espera();
      exigir(d.visible(oficinaId), "No puede ver esa oficina.");
      return leerConfig(oficinaId);
    },
    async guardarConfigAvisos(oficinaId, c) {
      await d.espera();
      poderConfig(oficinaId);
      const errs = validarConfigAvisos(c);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      propias.set(oficinaId, { ...c, diasAntes: [...c.diasAntes].sort((p, q) => q - p) });
      return leerConfig(oficinaId);
    },
    async quitarConfigAvisos(oficinaId) {
      await d.espera();
      poderConfig(oficinaId);
      propias.delete(oficinaId);
      return leerConfig(oficinaId);
    },
  };
}

export { validarEvidencia };
