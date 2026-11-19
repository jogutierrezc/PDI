/* =============================================================================
   Planeación y Seguimiento · Fase 2 · adaptador EN MEMORIA (demostración y pruebas).

   Aplica las mismas reglas de permisos y validación que la interfaz (reglas.ts) y el
   mismo cálculo de papel por herencia que el portal (tableros/model.ts `roleAt`, espejo
   de `unit_role_at`). No es un simulacro de seguridad: la base es quien hace cumplir.
   ========================================================================== */

import { roleAt, roleSource, type UnitMember, type UnitRole } from "../../tableros/model";
import type { Linea, PsNivel } from "../modelo";
import { CAMPUS_TODOS, llano } from "../modelo";
import type { PersonaRef, PsApiAct, ResultadoCargaAct } from "./contratoApi";
import type { Actividad, ActividadDetalle, AvisoPrevio, DatosActividad, EstadoAct, EventoActividad, LineaOficina, MiembroEquipo, OficinaVista, PapelOficina } from "./modelo";
import { DEF_ESTADOS, cargaPorPersona } from "./modelo";
import { avisoAsignacion, avisoTransferencia, poderEn, puedeAsignar, puedeCrear, puedeImportar, puedeMarcarChecklist, puedeMover, puedeTransferir, validarActividad, validarTransferencia } from "./reglas";
import { HOY_DEMO, ID_YO, PERSONAS_DEMO, UNIDADES_DEMO, correoDemo, generarActividades, oficinaDeLinea, type PersonaSemilla } from "./semilla";

export interface OpcionesActividadesMemoria {
  nivel: PsNivel;
  /** Papel de la persona de la sesión en su oficina (TI); «ninguno» = no es miembro de ninguna. */
  papel: PapelOficina | "ninguno";
  hoy?: string;
  campus: string[];
  /** Las líneas del plan vigente (de la capa del plan). */
  lineas: () => Promise<Linea[]>;
  espera: () => Promise<void>;
}

export const YO_DEMO: PersonaRef = { id: ID_YO, nombre: "Mariana Solano", correo: correoDemo("Mariana Solano") };

export function crearActividadesMemoria(op: OpcionesActividadesMemoria): PsApiAct {
  const hoy = op.hoy ?? HOY_DEMO;
  const yoId = ID_YO;
  const personasBase: PersonaSemilla[] = [
    ...PERSONAS_DEMO,
    // Solo para repartir actividades (la pertenencia real de la sesión sale de `miembros`).
    { id: yoId, nombre: YO_DEMO.nombre, oficina: "of-4", papel: "editor" },
    { id: yoId, nombre: YO_DEMO.nombre, oficina: "of-3", papel: "editor" },
  ];
  const miembros: UnitMember[] = PERSONAS_DEMO.map((p) => ({ id: `m-${p.id}`, unitId: p.oficina, profileId: p.id, role: p.papel as UnitRole, name: p.nombre, email: correoDemo(p.nombre) }));
  if (op.papel !== "ninguno") {
    miembros.push({ id: "m-yo-4", unitId: "of-4", profileId: yoId, role: op.papel, name: YO_DEMO.nombre, email: YO_DEMO.correo });
    miembros.push({ id: "m-yo-3", unitId: "of-3", profileId: yoId, role: "editor", name: YO_DEMO.nombre, email: YO_DEMO.correo });
  }
  const unidades = UNIDADES_DEMO;
  const nombreDe = (id: string) => (id === yoId ? YO_DEMO.nombre : PERSONAS_DEMO.find((p) => p.id === id)?.nombre ?? "Alguien");
  const correoDe = (id: string) => (id === yoId ? YO_DEMO.correo : correoDemo(nombreDe(id)));

  let estado: Promise<{ acts: Actividad[]; eventos: Map<string, EventoActividad[]>; lineas: Linea[] }> | null = null;
  let contador = 0;
  const cargar = () =>
    (estado ??= (async () => {
      const lineas = await op.lineas();
      const g = generarActividades(lineas, personasBase, hoy, op.campus);
      contador = g.actividades.length;
      return { acts: g.actividades, eventos: g.eventos, lineas };
    })());

  const papelEn = (oficinaId: string): PapelOficina | null => roleAt(unidades, miembros, yoId, oficinaId);
  const poderOf = (oficinaId: string) => poderEn(op.nivel, papelEn(oficinaId));
  const visibles = () => unidades.filter((u) => op.nivel === "admin" || papelEn(u.id) !== null);

  const equipoDe = (oficinaId: string, todas: readonly Actividad[]): MiembroEquipo[] => {
    // La carga es la que la persona tiene en ESTA oficina (lo que el gestor ve y reparte).
    const acts = todas.filter((a) => a.oficinaId === oficinaId);
    return miembros
      .filter((m) => m.unitId === oficinaId)
      .map((m) => ({ id: m.profileId, nombre: m.name, correo: m.email, papel: m.role, asignable: m.role !== "visor", esYo: m.profileId === yoId, carga: cargaPorPersona(acts, m.profileId, hoy) }))
      .sort((a, b) => Number(b.esYo) - Number(a.esYo) || ({ jefe: 0, editor: 1, visor: 2 }[a.papel] - { jefe: 0, editor: 1, visor: 2 }[b.papel]) || a.nombre.localeCompare(b.nombre, "es"));
  };

  const nuevoEvento = (a: Actividad, ev: Omit<EventoActividad, "id" | "en" | "por">, por = nombreDe(yoId)): EventoActividad => ({ id: `${a.id}-e${Date.now()}${Math.floor(Math.random() * 1e4)}`, en: new Date().toISOString(), por, ...ev });
  const registrar = async (a: Actividad, ev: Omit<EventoActividad, "id" | "en" | "por">) => {
    const e = await cargar();
    e.eventos.set(a.id, [...(e.eventos.get(a.id) ?? []), nuevoEvento(a, ev)]);
  };
  const exigir = (ok: boolean, mensaje: string) => {
    if (!ok) throw new Error(mensaje);
  };
  const lineasDe = (lineas: readonly Linea[], oficinaId: string): LineaOficina[] =>
    lineas.filter((l) => oficinaDeLinea(l) === oficinaId).map((l) => ({ no: l.no, nombre: l.nombre, monto: l.monto, campus: l.campus, prioridad: l.prioridad, inicio: l.inicio, fin: l.fin, clasif: l.clasif }));

  const aplicar = async (d: DatosActividad, acts: Actividad[], lineas: Linea[]): Promise<{ a: Actividad; avisara: AvisoPrevio[] }> => {
    const equipo = equipoDe(d.oficinaId, acts);
    const previa = d.id ? acts.find((x) => x.id === d.id) : undefined;
    const nuevosIds = d.asignados.filter((id) => !previa?.asignados.includes(id));
    const base = { oficinaId: d.oficinaId, lineaNo: d.lineaNo, titulo: d.titulo.trim(), descripcion: d.descripcion.trim() || null, prioridad: d.prioridad, inicio: d.esHito ? null : d.inicio, fin: d.fin, esHito: d.esHito, campus: d.campus, asignados: [...new Set(d.asignados)] };
    let a: Actividad;
    if (previa) {
      Object.assign(previa, base);
      a = previa;
      await registrar(a, { tipo: "editada", detalle: "Se editó la actividad." });
    } else {
      a = { id: `a-${++contador}`, estado: "por_iniciar", checklist: [], creadaPor: yoId, creadaEn: new Date().toISOString(), demo: true, ...base };
      acts.push(a);
      (await cargar()).eventos.set(a.id, [nuevoEvento(a, { tipo: "creada", detalle: "Se creó la actividad." })]);
    }
    for (const u of nuevosIds) await registrar(a, { tipo: "asignada", detalle: `Se asignó a ${nombreDe(u)}.`, a: u });
    void lineas;
    return { a, avisara: avisoAsignacion(nuevosIds, equipo, yoId) };
  };

  const ctxValidar = (d: DatosActividad, lineas: Linea[], acts: Actividad[]) => ({
    lineas: lineasDe(lineas, d.oficinaId).map((l) => l.no),
    campus: [...op.campus, CAMPUS_TODOS],
    equipo: equipoDe(d.oficinaId, acts),
  });

  return {
    hoy,
    demo: true,
    async yo() { await op.espera(); return YO_DEMO; },
    async oficinasVisibles() {
      const e = await cargar();
      await op.espera();
      return visibles().map((u): OficinaVista => {
        const papel = papelEn(u.id);
        const fuente = roleSource(unidades, miembros, yoId, u.id);
        return { id: u.id, nombre: u.name, parentId: u.parentId, papel, heredadoDe: fuente && fuente.id !== u.id ? fuente.name : null, poder: poderOf(u.id), nLineas: lineasDe(e.lineas, u.id).length };
      });
    },
    async personas() {
      await op.espera();
      const ids = new Set(visibles().map((u) => u.id));
      const vistos = new Map<string, PersonaRef>();
      for (const m of miembros) if (ids.has(m.unitId)) vistos.set(m.profileId, { id: m.profileId, nombre: m.name, correo: m.email });
      vistos.set(yoId, YO_DEMO);
      return [...vistos.values()];
    },
    async equipo(oficinaId) {
      const e = await cargar();
      await op.espera();
      exigir(visibles().some((u) => u.id === oficinaId), "No puede ver esa oficina.");
      return equipoDe(oficinaId, e.acts);
    },
    async lineasDeOficina(oficinaId) {
      const e = await cargar();
      await op.espera();
      return lineasDe(e.lineas, oficinaId);
    },
    async actividades(oficinaIds) {
      const e = await cargar();
      await op.espera();
      const ok = new Set(visibles().map((u) => u.id));
      return structuredClone(e.acts.filter((a) => oficinaIds.includes(a.oficinaId) && ok.has(a.oficinaId)));
    },
    async actividad(id): Promise<ActividadDetalle> {
      const e = await cargar();
      await op.espera();
      const a = e.acts.find((x) => x.id === id);
      exigir(Boolean(a) && visibles().some((u) => u.id === a!.oficinaId), "Esa actividad no existe o no puede verla.");
      return structuredClone({ actividad: a!, eventos: e.eventos.get(id) ?? [] });
    },
    async guardarActividad(d) {
      const e = await cargar();
      await op.espera();
      exigir(puedeCrear(poderOf(d.oficinaId)) || (Boolean(d.id) && puedeCrear(poderOf(d.oficinaId))), "Solo el gestor de la oficina crea y edita actividades.");
      const errs = validarActividad(d, ctxValidar(d, e.lineas, e.acts));
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      const { a, avisara } = await aplicar(d, e.acts, e.lineas);
      return { id: a.id, avisara };
    },
    async moverActividad(id, destino: EstadoAct) {
      const e = await cargar();
      await op.espera();
      const a = e.acts.find((x) => x.id === id);
      exigir(Boolean(a), "Esa actividad no existe.");
      const dec = puedeMover(poderOf(a!.oficinaId), a!, destino, yoId);
      if (!dec.ok) throw new Error(dec.motivo);
      const de = a!.estado;
      a!.estado = destino;
      await registrar(a!, { tipo: "estado", detalle: `Pasó de «${DEF_ESTADOS[de].nombre}» a «${DEF_ESTADOS[destino].nombre}».` });
    },
    async asignar(ids, personaId) {
      const e = await cargar();
      await op.espera();
      const avisara: AvisoPrevio[] = [];
      const objetivo = ids.map((id) => e.acts.find((x) => x.id === id));
      for (const a of objetivo) {
        exigir(Boolean(a), "Una de las actividades no existe.");
        exigir(puedeAsignar(poderOf(a!.oficinaId)), "Solo el gestor de la oficina asigna actividades.");
        const equipo = equipoDe(a!.oficinaId, e.acts);
        exigir(equipo.some((m) => m.id === personaId && m.asignable), `${nombreDe(personaId)} no es miembro de la oficina de «${a!.titulo}»: un gestor solo asigna a su oficina.`);
      }
      for (const a of objetivo) {
        if (a!.asignados.includes(personaId)) continue;
        a!.asignados.push(personaId);
        await registrar(a!, { tipo: "asignada", detalle: `Se asignó a ${nombreDe(personaId)}.`, a: personaId });
      }
      const eq = e.acts.length ? equipoDe(objetivo[0]!.oficinaId, e.acts) : [];
      avisara.push(...avisoAsignacion([personaId], eq, yoId));
      return { avisara };
    },
    async transferir(id, de, a, motivo) {
      const e = await cargar();
      await op.espera();
      const act = e.acts.find((x) => x.id === id);
      exigir(Boolean(act), "Esa actividad no existe.");
      exigir(puedeTransferir(poderOf(act!.oficinaId)), "Solo el gestor de la oficina transfiere actividades.");
      const equipo = equipoDe(act!.oficinaId, e.acts);
      const errs = validarTransferencia({ de, a, motivo }, act!, equipo);
      exigir(!errs.length, errs[0]?.mensaje ?? "");
      act!.asignados = act!.asignados.map((x) => (x === de ? a : x));
      await registrar(act!, { tipo: "transferida", detalle: `Se transfirió de ${nombreDe(de)} a ${nombreDe(a)}.`, de, a, motivo: motivo.trim() });
      return { avisara: avisoTransferencia(de, a, equipo, yoId) };
    },
    async marcarChecklist(id, itemId, hecho) {
      const e = await cargar();
      await op.espera();
      const a = e.acts.find((x) => x.id === id);
      exigir(Boolean(a), "Esa actividad no existe.");
      exigir(puedeMarcarChecklist(poderOf(a!.oficinaId), a!, yoId), "No puede marcar el checklist de esta actividad.");
      const it = a!.checklist.find((x) => x.id === itemId);
      exigir(Boolean(it), "Ese elemento no existe.");
      it!.hecho = hecho;
      await registrar(a!, { tipo: "checklist", detalle: `${hecho ? "Marcó" : "Desmarcó"} «${it!.texto}».` });
    },
    async agregarItemChecklist(id, texto) {
      const e = await cargar();
      await op.espera();
      const a = e.acts.find((x) => x.id === id);
      exigir(Boolean(a), "Esa actividad no existe.");
      exigir(puedeCrear(poderOf(a!.oficinaId)), "Solo el gestor agrega elementos al checklist.");
      const t = texto.trim();
      exigir(t.length >= 2 && t.length <= 200, "Escriba el elemento (de 2 a 200 caracteres).");
      a!.checklist.push({ id: `${a!.id}-c${Date.now()}`, texto: t, hecho: false });
      await registrar(a!, { tipo: "checklist", detalle: `Agregó «${t}».` });
    },
    async cargarActividades(oficinaId, filas, nombreArchivo): Promise<ResultadoCargaAct> {
      const e = await cargar();
      await op.espera();
      exigir(puedeImportar(poderOf(oficinaId)), "Solo el gestor de la oficina importa su planificación.");
      const errores: ResultadoCargaAct["errores"] = [];
      filas.forEach((d, i) => {
        if (d.oficinaId !== oficinaId) errores.push({ fila: i + 1, campo: "oficina", mensaje: "La actividad es de otra oficina." });
        for (const er of validarActividad(d, ctxValidar(d, e.lineas, e.acts))) errores.push({ fila: i + 1, campo: er.campo, mensaje: er.mensaje });
      });
      void nombreArchivo;
      if (errores.length) return { recibidas: filas.length, creadas: 0, errores, avisara: [] };
      const avisos = new Map<string, AvisoPrevio>();
      const equipo = equipoDe(oficinaId, e.acts);
      for (const d of filas) {
        const { avisara } = await aplicar({ ...d, id: undefined }, e.acts, e.lineas);
        for (const a of avisara) avisos.set(a.personaId, a);
      }
      void equipo;
      void llano;
      return { recibidas: filas.length, creadas: filas.length, errores: [], avisara: [...avisos.values()] };
    },
  };
}
