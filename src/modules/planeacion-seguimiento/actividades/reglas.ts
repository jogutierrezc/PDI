/* =============================================================================
   Planeación y Seguimiento · Fase 2 · reglas puras: permisos del tablero,
   validación de actividades y transferencias, y a quién se avisa. Sin DOM.

   MODELO DE USUARIOS (decisión del usuario):
     · oficina = unidad (`units`, con herencia por el árbol);
     · papel en la oficina = `unit_role` de `unit_members`:
         jefe → gestor · editor → colaborador · visor → lector de esa oficina;
     · nivel del módulo = `ps_nivel` del rol de acceso (da la entrada y el techo).
   Poder efectivo en una oficina = el MENOR de los dos. La administración general y el
   administrador del módulo (nivel «admin») operan todas las oficinas.
   El permiso real lo hace cumplir la base; esto decide qué ofrece la pantalla.
   ========================================================================== */

import type { PsNivel } from "../modelo";
import type { Actividad, AvisoPrevio, DatosActividad, EstadoAct, MiembroEquipo, PapelOficina, Poder } from "./modelo";
import { DEF_ESTADOS, ESTADOS, PRIORIDADES_ACT, diasEntre } from "./modelo";

const RANGO: Record<Poder, number> = { ninguno: 0, lector: 1, colaborador: 2, gestor: 3 };
const MIN = (a: Poder, b: Poder): Poder => (RANGO[a] <= RANGO[b] ? a : b);

/** Lo que el nivel del módulo permite como máximo (el aprobador solo mira: aprobar llega en la fase 4). */
export function techoDelNivel(nivel: PsNivel): Poder {
  switch (nivel) {
    case "admin":
    case "gestor":
      return "gestor";
    case "colaborador":
      return "colaborador";
    case "lector":
    case "aprobador":
      return "lector";
    default:
      return "ninguno";
  }
}

/** Lo que el papel en la oficina permite como máximo. */
export function techoDelPapel(papel: PapelOficina | null): Poder {
  return papel === "jefe" ? "gestor" : papel === "editor" ? "colaborador" : papel === "visor" ? "lector" : "ninguno";
}

/** Poder efectivo en una oficina: el menor de los dos techos; el administrador opera todo. */
export function poderEn(nivel: PsNivel, papel: PapelOficina | null): Poder {
  if (nivel === "admin") return "gestor";
  // Contrato de la base: lector y aprobador ven TODAS las oficinas, en lectura, sean o no miembros.
  if ((nivel === "lector" || nivel === "aprobador") && papel === null) return "lector";
  return MIN(techoDelNivel(nivel), techoDelPapel(papel));
}

/** La frase que explica de dónde sale el poder (se muestra en la planificación). */
export function explicarPoder(nivel: PsNivel, papel: PapelOficina | null, poder: Poder): string {
  if (nivel === "admin") return "Como administrador del módulo puede operar todas las oficinas.";
  if (poder === "ninguno") return papel ? "Su nivel en el módulo no permite operar actividades." : "No es miembro de esta oficina.";
  const delNivel = techoDelNivel(nivel);
  const delPapel = techoDelPapel(papel);
  if (delNivel === delPapel) return "Su nivel en el módulo y su papel en la oficina coinciden.";
  return RANGO[delNivel] < RANGO[delPapel]
    ? "Su nivel en el módulo es el que limita lo que puede hacer aquí; el papel en la oficina permitiría más."
    : "Su papel en la oficina es el que limita lo que puede hacer aquí; el nivel del módulo permitiría más.";
}

export const puedeCrear = (p: Poder): boolean => p === "gestor";
export const puedeAsignar = (p: Poder): boolean => p === "gestor";
export const puedeTransferir = (p: Poder): boolean => p === "gestor";
export const puedeEditar = (p: Poder): boolean => p === "gestor";
export const puedeImportar = (p: Poder): boolean => p === "gestor";

/** El checklist lo marca el gestor, o el colaborador asignado. */
export function puedeMarcarChecklist(p: Poder, a: Pick<Actividad, "asignados">, yo: string | null): boolean {
  return p === "gestor" || (p === "colaborador" && yo !== null && a.asignados.includes(yo));
}

export type Decision = { ok: true } | { ok: false; motivo: string };

/**
 * ¿Puede esta persona mover la actividad a este cubo?
 *   · colaborador: solo las suyas y solo hasta «En revisión»; no toca lo que ya espera al gestor o está hecho;
 *   · gestor (y administrador): cualquiera de su oficina, a cualquier cubo. En esta fase pasar a «Hecho» lo hace el
 *     gestor directamente (FASE 3: aquí irá el reporte de avance en pantalla completa);
 *   · lector: nada.
 */
export function puedeMover(poder: Poder, a: Pick<Actividad, "estado" | "asignados">, destino: EstadoAct, yo: string | null): Decision {
  if (a.estado === destino) return { ok: false, motivo: `Ya está en «${DEF_ESTADOS[destino].nombre}».` };
  if (poder === "ninguno") return { ok: false, motivo: "No es miembro de la oficina de esta actividad." };
  if (poder === "lector") return { ok: false, motivo: "Con acceso de lector solo puede mirar; no puede mover actividades." };
  if (poder === "gestor") return { ok: true };
  if (yo === null || !a.asignados.includes(yo)) return { ok: false, motivo: "Un colaborador solo mueve las actividades que tiene asignadas." };
  if (a.estado === "en_revision") return { ok: false, motivo: "Ya está en revisión: la mueve el gestor de la oficina (la valida o la devuelve)." };
  if (a.estado === "hecho") return { ok: false, motivo: "Está hecha. Si hace falta reabrirla, pídaselo al gestor de la oficina." };
  if (destino === "hecho") return { ok: false, motivo: "Un colaborador mueve la actividad hasta «En revisión»: pasarla a «Hecho» lo hace el gestor de la oficina." };
  return { ok: true };
}

/** Devolver una actividad de «En revisión» a otro cubo exige una nota de al menos 20 caracteres (contrato: ps_actividad_mover). */
export const requiereNotaDevolucion = (origen: EstadoAct, destino: EstadoAct): boolean => origen === "en_revision" && (destino === "por_iniciar" || destino === "en_curso" || destino === "en_riesgo");

/** Todos los cubos con su decisión (los no permitidos se muestran con el motivo). */
export const destinosPosibles = (poder: Poder, a: Pick<Actividad, "estado" | "asignados">, yo: string | null): { estado: EstadoAct; decision: Decision }[] =>
  ESTADOS.map((estado) => ({ estado, decision: puedeMover(poder, a, estado, yo) }));

/* ---------- Validación de la actividad ---------- */

export interface ErrorActividad {
  /** Id del campo del formulario. */
  campo: string;
  mensaje: string;
  /** Paso del formulario donde está el campo. */
  paso: "que" | "cuando" | "quien";
}

export interface ContextoValidacion {
  /** Claves de las líneas del plan que la oficina tiene a su cargo. */
  lineas: readonly string[];
  campus: readonly string[];
  /** Vigencia del plan (años): la base rechaza fechas fuera de 1 ene anioIni a 31 dic anioFin. */
  vigencia?: { anioIni: number; anioFin: number };
  /** Personas a las que se puede asignar (miembros de la oficina). */
  equipo: readonly Pick<MiembroEquipo, "id" | "asignable">[];
}

export const MAX_TITULO = 200;
export const MAX_DESCRIPCION = 1000; // la base admite 4000; la pantalla es más estricta a propósito
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const fechaValida = (s: string): boolean => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function validarActividad(d: DatosActividad, ctx: ContextoValidacion): ErrorActividad[] {
  const e: ErrorActividad[] = [];
  const titulo = d.titulo.trim();
  if (titulo.length < 3) e.push({ campo: "act-titulo", paso: "que", mensaje: "Escriba qué se va a hacer (al menos 3 letras)." });
  else if (titulo.length > MAX_TITULO) e.push({ campo: "act-titulo", paso: "que", mensaje: `El título admite hasta ${MAX_TITULO} caracteres.` });
  if (d.descripcion.length > MAX_DESCRIPCION) e.push({ campo: "act-descripcion", paso: "que", mensaje: `La descripción admite hasta ${MAX_DESCRIPCION} caracteres.` });
  if (d.lineaNo !== null && !ctx.lineas.includes(d.lineaNo)) e.push({ campo: "act-linea", paso: "que", mensaje: "Elija una línea del plan que esté a cargo de esta oficina, o «Actividad propia de la oficina»." });

  const finOk = d.fin !== null && fechaValida(d.fin);
  if (!d.fin) e.push({ campo: "act-fin", paso: "cuando", mensaje: d.esHito ? "Escriba la fecha del hito." : "Escriba la fecha de fin." });
  else if (!finOk) e.push({ campo: "act-fin", paso: "cuando", mensaje: "La fecha de fin no es válida. Use el selector de fecha." });
  if (!d.esHito) {
    if (!d.inicio) e.push({ campo: "act-inicio", paso: "cuando", mensaje: "Escriba la fecha de inicio." });
    else if (!fechaValida(d.inicio)) e.push({ campo: "act-inicio", paso: "cuando", mensaje: "La fecha de inicio no es válida. Use el selector de fecha." });
    else if (finOk && d.fin! < d.inicio) e.push({ campo: "act-fin", paso: "cuando", mensaje: "La fecha de fin no puede ser anterior a la de inicio." });
  }
  if (ctx.vigencia) {
    const fuera = (f: string | null) => f !== null && fechaValida(f) && (Number(f.slice(0, 4)) < ctx.vigencia!.anioIni || Number(f.slice(0, 4)) > ctx.vigencia!.anioFin);
    const m = `Las fechas deben caer dentro de la vigencia del plan (${ctx.vigencia.anioIni} a ${ctx.vigencia.anioFin}).`;
    if (fuera(d.fin)) e.push({ campo: "act-fin", paso: "cuando", mensaje: m });
    else if (!d.esHito && fuera(d.inicio)) e.push({ campo: "act-inicio", paso: "cuando", mensaje: m });
  }
  if (!PRIORIDADES_ACT.some((p) => p === d.prioridad)) e.push({ campo: "act-prioridad", paso: "cuando", mensaje: "Elija la prioridad." });
  if (!ctx.campus.includes(d.campus)) e.push({ campo: "act-campus", paso: "cuando", mensaje: "Elija el campus donde se hace." });

  const ids = new Set(ctx.equipo.filter((m) => m.asignable).map((m) => m.id));
  if (d.asignados.some((id) => !ids.has(id))) e.push({ campo: "act-asignados", paso: "quien", mensaje: "Solo puede asignar a miembros de esta oficina que reciben actividades (los lectores no)." });
  return e;
}

/** Avisos que no impiden crear: por ejemplo, la actividad cae fuera de las fechas de su línea. */
export function avisosActividad(d: DatosActividad, linea: { inicio: string | null; fin: string | null } | null, hoy: string): string[] {
  const a: string[] = [];
  const ini = d.esHito ? d.fin : d.inicio;
  if (linea && d.fin && linea.fin && d.fin > linea.fin) a.push(`Termina después de la línea del plan (${linea.fin}). Se puede crear, pero conviene revisarlo.`);
  if (linea && ini && linea.inicio && ini < linea.inicio) a.push(`Empieza antes de la línea del plan (${linea.inicio}). Se puede crear, pero conviene revisarlo.`);
  if (d.fin && fechaValida(d.fin) && !d.id && diasEntre(hoy, d.fin) < 0) a.push("La fecha de fin ya pasó: la actividad nacerá vencida.");
  return a;
}

/* ---------- Transferencia ---------- */

export const MIN_MOTIVO = 20;

export interface DatosTransferencia {
  de: string | null;
  a: string | null;
  motivo: string;
}

export function validarTransferencia(d: DatosTransferencia, act: Pick<Actividad, "asignados">, equipo: readonly Pick<MiembroEquipo, "id" | "asignable">[]): { campo: string; mensaje: string }[] {
  const e: { campo: string; mensaje: string }[] = [];
  if (!d.de) e.push({ campo: "tr-de", mensaje: "Elija a quién se le quita la actividad." });
  else if (!act.asignados.includes(d.de)) e.push({ campo: "tr-de", mensaje: "Esa persona no tiene asignada la actividad." });
  if (!d.a) e.push({ campo: "tr-a", mensaje: "Elija a quién se le pasa la actividad." });
  else if (d.a === d.de) e.push({ campo: "tr-a", mensaje: "La persona que recibe debe ser distinta de la que la deja." });
  else if (!equipo.some((m) => m.id === d.a && m.asignable)) e.push({ campo: "tr-a", mensaje: "Solo puede pasarla a un miembro de la oficina que reciba actividades." });
  else if (act.asignados.includes(d.a)) e.push({ campo: "tr-a", mensaje: "Esa persona ya tiene asignada esta actividad." });
  const n = d.motivo.trim().length;
  if (n < MIN_MOTIVO) e.push({ campo: "tr-motivo", mensaje: `Cuente el motivo con al menos ${MIN_MOTIVO} caracteres (lleva ${n}). Quedará en el historial.` });
  return e;
}

/* ---------- A quién se avisa ---------- */

const persona = (m: Pick<MiembroEquipo, "id" | "nombre" | "correo">, motivo: AvisoPrevio["motivo"]): AvisoPrevio => ({ personaId: m.id, nombre: m.nombre, correo: m.correo, motivo });

/** Asignar: se avisa a cada persona que recibe una actividad nueva (no a quien asigna). */
export function avisoAsignacion(nuevas: readonly string[], equipo: readonly MiembroEquipo[], yo: string | null): AvisoPrevio[] {
  return nuevas.filter((id) => id !== yo).flatMap((id) => { const m = equipo.find((x) => x.id === id); return m ? [persona(m, "asignacion")] : []; });
}

/** Transferir: recibe la nueva persona (asignación), se entera quien la deja y se copia a los gestores de la oficina. */
export function avisoTransferencia(de: string | null, a: string | null, equipo: readonly MiembroEquipo[], yo: string | null): AvisoPrevio[] {
  const out: AvisoPrevio[] = [];
  const entra = equipo.find((m) => m.id === a);
  const sale = equipo.find((m) => m.id === de);
  if (entra && entra.id !== yo) out.push(persona(entra, "transferencia_entra"));
  if (sale && sale.id !== yo) out.push(persona(sale, "transferencia_sale"));
  for (const g of equipo.filter((m) => m.papel === "jefe" && m.id !== yo && m.id !== a && m.id !== de)) out.push(persona(g, "copia_gestor"));
  return out;
}

/** Quién recibe el aviso de devolución: las personas que tienen la actividad. */
export function avisoDevolucion(asignados: readonly string[], equipo: readonly MiembroEquipo[], yo: string | null): AvisoPrevio[] {
  return asignados.filter((id) => id !== yo).flatMap((id) => { const m = equipo.find((x) => x.id === id); return m ? [persona(m, "devolucion")] : []; });
}

export const ROTULO_AVISO: Record<AvisoPrevio["motivo"], string> = {
  asignacion: "Recibe la actividad",
  transferencia_entra: "Recibe la actividad",
  transferencia_sale: "Deja la actividad",
  copia_gestor: "Copia al gestor",
  devolucion: "Se le devuelve la actividad",
};
