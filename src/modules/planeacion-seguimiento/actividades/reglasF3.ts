/* =============================================================================
   Planeación y Seguimiento · Fase 3 · reglas puras (sin DOM): quién reporta y quién
   valida, validación del reporte de avance, de las evidencias, de los riesgos y de
   los plazos de aviso, y a dónde lleva cada movimiento del tablero.
   Es lo que decide la pantalla; el permiso real lo hace cumplir la base (CONTRATO-BD-F3).
   ========================================================================== */

import type { PsNivel } from "../modelo";
import type { Actividad, AvisoPrevio, EstadoAct, MiembroEquipo, Poder } from "./modelo";
import { diasEntre } from "./modelo";
import type { Avance, ConfigAvisos, DatosAccion, DatosAvance, DatosRiesgo, NuevaEvidencia } from "./modeloF3";
import { NIVELES_RIESGO } from "./modeloF3";
import { MIN_MOTIVO, fechaValida, requiereNotaDevolucion } from "./reglas";

export const MIN_NOTA_AVANCE = 10;
export const MAX_NOTA_AVANCE = 2000;
export const MAX_EVIDENCIAS = 10;
export const MAX_BYTES_EVIDENCIA = 20 * 1024 * 1024;
export const MAX_LOTE = 50;
export const MAX_ACCIONES = 10;
export const MAX_RIESGOS_ABIERTOS = 20;
export const MIN_NOTA_REVISION = MIN_MOTIVO;
export const MIN_NOTA_CIERRE = 10;

/* ---------- Quién reporta, quién valida ---------- */

/** Reporta el gestor o el administrador, o el colaborador asignado; no se reporta sobre lo «Hecho» ni si ya hay un avance esperando. */
export function puedeReportar(poder: Poder, a: Pick<Actividad, "estado" | "asignados" | "avance">, yo: string | null): { ok: true } | { ok: false; motivo: string } {
  if (poder === "ninguno") return { ok: false, motivo: "No es miembro de la oficina de esta actividad." };
  if (poder === "lector") return { ok: false, motivo: "Con acceso de lector solo puede mirar; no reporta avances." };
  if (poder === "colaborador" && (yo === null || !a.asignados.includes(yo))) return { ok: false, motivo: "Un colaborador reporta avances solo de las actividades que tiene asignadas." };
  if (a.estado === "hecho") return { ok: false, motivo: "La actividad ya está hecha: no se reportan más avances. Si hace falta reabrirla, lo hace el gestor." };
  if (a.avance.pendientes > 0) return { ok: false, motivo: "Ya hay un avance esperando la revisión del gestor. Cuando lo valide o lo devuelva podrá reportar otro." };
  return { ok: true };
}

export interface ContextoValidacionAvance {
  /** Poder de quien valida en la oficina de la actividad. */
  poder: Poder;
  /** Es administrador del módulo («Planeación»). */
  esAdmin: boolean;
  yo: string | null;
  autorId: string;
  /** El autor del avance es gestor de la oficina (o administrador): lo valida un administrador. */
  autorEsGestor: boolean;
}

/**
 * Validar o devolver: gestor de la oficina o administrador, nunca el propio avance. Si el autor es gestor lo valida un
 * administrador del módulo.
 */
export function puedeValidar(c: ContextoValidacionAvance): { ok: true } | { ok: false; motivo: string } {
  if (c.poder !== "gestor") return { ok: false, motivo: "Validar y devolver avances es del gestor de la oficina." };
  if (c.yo !== null && c.autorId === c.yo) return { ok: false, motivo: "Nadie valida su propio avance: lo revisa otra persona." };
  if (c.autorEsGestor && !c.esAdmin) return { ok: false, motivo: "Este avance lo reportó un gestor: lo valida un administrador del módulo." };
  return { ok: true };
}

export const esAdminDelModulo = (nivel: PsNivel): boolean => nivel === "admin";
/** Cierre administrativo: el gestor de la oficina o el administrador. */
export const puedeCerrar = (poder: Poder): boolean => poder === "gestor";

/** Plazo de validación vencido: lleva más horas esperando que `validarHoras`. */
export function horasEsperando(reportadoEn: string, ahora: string): number {
  const ms = Date.parse(ahora) - Date.parse(reportadoEn);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 3_600_000)) : 0;
}
export const avanceVencido = (reportadoEn: string, ahora: string, validarHoras: number): boolean => horasEsperando(reportadoEn, ahora) >= validarHoras;
export function textoEspera(horas: number): string {
  if (horas < 1) return "menos de una hora";
  if (horas < 24) return horas === 1 ? "1 hora" : `${horas} horas`;
  const d = Math.floor(horas / 24);
  return d === 1 ? "1 día" : `${d} días`;
}

/** El avance validado vigente de una actividad (el más reciente por fecha de revisión). */
export function avanceVigente(avances: readonly Avance[]): Avance | null {
  const v = avances.filter((a) => a.estado === "validado");
  if (!v.length) return null;
  return [...v].sort((a, b) => (a.revisadoEn ?? "").localeCompare(b.revisadoEn ?? "") || a.reportadoEn.localeCompare(b.reportadoEn)).at(-1) ?? null;
}

/** Tras validar: 100 % → «Hecho»; si no, vuelve a «En curso» (o sigue «En riesgo» si tiene un riesgo Crítico o Alto abierto). */
export function estadoTrasValidar(fisico: number, riesgoGraveAbierto: boolean): EstadoAct {
  if (fisico >= 100) return "hecho";
  return riesgoGraveAbierto ? "en_riesgo" : "en_curso";
}

/* ---------- A dónde lleva un movimiento del tablero ---------- */

export type RutaMovimiento =
  | { tipo: "directo" }
  /** Devolver de «En revisión»: pantalla con nota (≥ 20). */
  | { tipo: "devolver" }
  /** Reporte de avance a pantalla completa. */
  | { tipo: "reportar" }
  /** Hay un avance esperando: se revisa (y al validarlo al 100 % la actividad queda «Hecha»). */
  | { tipo: "revisar" }
  /** Cierre administrativo del gestor. */
  | { tipo: "cerrar" };

/**
 * Colaborador → «En revisión» y gestor → «En revisión» o «Hecho» pasan por pantalla completa (reportar, revisar, cerrar);
 * devolver de «En revisión» pide nota; el resto se mueve directo. Los permisos los decide `puedeMover`.
 */
export function rutaDeMovimiento(poder: Poder, a: Pick<Actividad, "estado" | "avance">, destino: EstadoAct): RutaMovimiento {
  if (requiereNotaDevolucion(a.estado, destino)) return { tipo: "devolver" };
  if (destino === "en_revision" && (poder === "colaborador" || poder === "gestor")) return { tipo: "reportar" };
  if (destino === "hecho" && poder === "gestor") return a.avance.pendientes > 0 ? { tipo: "revisar" } : { tipo: "cerrar" };
  return { tipo: "directo" };
}

/* ---------- Validación del reporte ---------- */

export interface ErrorAvance {
  campo: string;
  mensaje: string;
  paso: "que" | "evidencias" | "riesgos";
}

export interface ContextoAvance {
  hoy: string;
  /** Avance físico del último avance validado (la monotonía: no se puede bajar). */
  ultimoValidado: number;
}

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function validarAvance(d: DatosAvance, c: ContextoAvance): ErrorAvance[] {
  const e: ErrorAvance[] = [];
  if (!esNumero(d.fisico) || d.fisico < 0 || d.fisico > 100) e.push({ campo: "av-fisico", paso: "que", mensaje: "El avance físico va de 0 a 100 %." });
  else if (d.fisico < c.ultimoValidado) e.push({ campo: "av-fisico", paso: "que", mensaje: `El avance no puede bajar: el último avance validado fue ${fmtPct(c.ultimoValidado)} %. Escriba ${fmtPct(c.ultimoValidado)} % o más.` });
  if (d.financiero !== null && (!esNumero(d.financiero) || d.financiero < 0 || d.financiero > 100)) e.push({ campo: "av-financiero", paso: "que", mensaje: "El avance financiero va de 0 a 100 %. Si no aplica, desmárquelo." });
  if (!d.fecha) e.push({ campo: "av-fecha", paso: "que", mensaje: "Escriba la fecha del avance." });
  else if (!fechaValida(d.fecha)) e.push({ campo: "av-fecha", paso: "que", mensaje: "La fecha no es válida. Use el selector de fecha." });
  else if (d.fecha > c.hoy) e.push({ campo: "av-fecha", paso: "que", mensaje: "La fecha del avance no puede ser futura." });
  const n = d.nota.trim().length;
  if (n < MIN_NOTA_AVANCE) e.push({ campo: "av-nota", paso: "que", mensaje: `Cuente qué se hizo con al menos ${MIN_NOTA_AVANCE} caracteres (lleva ${n}).` });
  else if (n > MAX_NOTA_AVANCE) e.push({ campo: "av-nota", paso: "que", mensaje: `La nota admite hasta ${MAX_NOTA_AVANCE} caracteres (lleva ${n}).` });
  if (d.evidencias.length > MAX_EVIDENCIAS) e.push({ campo: "av-evidencias", paso: "evidencias", mensaje: `Un avance admite hasta ${MAX_EVIDENCIAS} evidencias.` });
  for (const ev of d.evidencias) {
    const m = validarEvidencia(ev);
    if (m) e.push({ campo: "av-evidencias", paso: "evidencias", mensaje: m });
  }
  if (d.riesgo) for (const r of validarRiesgo(d.riesgo)) e.push({ campo: r.campo, paso: "riesgos", mensaje: r.mensaje });
  return e;
}
const fmtPct = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/* ---------- Evidencias ---------- */

/** Tipos permitidos: extensión → tipos MIME aceptados (el navegador a veces deja el MIME vacío). */
export const TIPOS_EVIDENCIA: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
  txt: ["text/plain"],
  zip: ["application/zip", "application/x-zip-compressed"],
};
export const ACEPTAR_EVIDENCIA = Object.keys(TIPOS_EVIDENCIA).map((x) => `.${x}`).join(",");
export const ROTULO_TIPOS_EVIDENCIA = "PDF, Word, Excel, PowerPoint, PNG, JPG, CSV, TXT o ZIP";

export const extensionDe = (nombre: string): string => (nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase() : "");

export function bytesLegibles(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toLocaleString("es-CO", { maximumFractionDigits: 0 })} KB`;
  return `${(b / 1024 / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/** Valida un archivo elegido (antes de subirlo). Devuelve el mensaje o null. */
export function validarArchivo(f: { name: string; size: number; type: string }): string | null {
  const nombre = f.name.trim();
  if (nombre.length < 1 || nombre.length > 200) return `El nombre del archivo debe tener de 1 a 200 caracteres: «${nombre.slice(0, 40)}».`;
  const ext = extensionDe(nombre);
  const mimes = TIPOS_EVIDENCIA[ext];
  if (!mimes) return `«${nombre}» no se puede subir: el tipo .${ext || "(sin extensión)"} no está permitido. Use ${ROTULO_TIPOS_EVIDENCIA}.`;
  if (f.type && !mimes.includes(f.type)) return `«${nombre}» dice ser ${f.type}, que no coincide con su extensión .${ext}. Guárdelo de nuevo en el formato correcto.`;
  if (f.size <= 0) return `«${nombre}» está vacío.`;
  if (f.size > MAX_BYTES_EVIDENCIA) return `«${nombre}» pesa ${bytesLegibles(f.size)} y el máximo es ${bytesLegibles(MAX_BYTES_EVIDENCIA)}. Comprímalo o súbalo como enlace.`;
  return null;
}

export const esUrlWeb = (s: string): boolean => {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/** Valida una evidencia ya armada (archivo o enlace). Devuelve el mensaje o null. */
export function validarEvidencia(e: NuevaEvidencia): string | null {
  const nombre = e.nombre.trim();
  if (nombre.length < 1 || nombre.length > 200) return "El nombre de la evidencia debe tener de 1 a 200 caracteres.";
  if (e.tipo === "enlace") {
    if (!e.url || !esUrlWeb(e.url)) return `El enlace de «${nombre}» debe empezar por http:// o https://.`;
    return null;
  }
  if (!e.storagePath) return `Al archivo «${nombre}» le falta subirse.`;
  return validarArchivo({ name: nombre, size: e.bytes ?? 1, type: e.mime ?? "" });
}

/** Nombre seguro para la ruta de almacenamiento: `<oficina>/<actividad>/<uuid>-<nombre>`. */
export function rutaEvidencia(oficinaId: string, actividadId: string, uuid: string, nombre: string): string {
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "archivo";
  return `${oficinaId}/${actividadId}/${uuid}-${limpio}`;
}

/** SHA-256 en hexadecimal, en el navegador (Web Crypto). */
export async function sha256Hex(datos: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = datos instanceof Uint8Array ? (datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer) : datos;
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Riesgos y acciones ---------- */

export interface ErrorSimple {
  campo: string;
  mensaje: string;
}

export function validarRiesgo(d: DatosRiesgo): ErrorSimple[] {
  const e: ErrorSimple[] = [];
  const t = d.titulo.trim().length;
  if (t < 3 || t > 200) e.push({ campo: "rg-titulo", mensaje: "Escriba el riesgo en pocas palabras (de 3 a 200 caracteres)." });
  if (!NIVELES_RIESGO.includes(d.nivel)) e.push({ campo: "rg-nivel", mensaje: "Elija el nivel del riesgo." });
  if (d.descripcion.length > 2000) e.push({ campo: "rg-descripcion", mensaje: "La descripción admite hasta 2.000 caracteres." });
  if (d.mitigacion.length > 2000) e.push({ campo: "rg-mitigacion", mensaje: "La mitigación admite hasta 2.000 caracteres." });
  return e;
}

export function validarAccion(d: DatosAccion): ErrorSimple[] {
  const e: ErrorSimple[] = [];
  const t = d.texto.trim().length;
  if (t < 3 || t > 300) e.push({ campo: "ac-texto", mensaje: "Escriba la acción (de 3 a 300 caracteres)." });
  if (d.vence && !fechaValida(d.vence)) e.push({ campo: "ac-vence", mensaje: "La fecha de vencimiento no es válida." });
  return e;
}

/** Un riesgo Crítico o Alto abierto mantiene la actividad «En riesgo» al validar un avance parcial. */
export const esRiesgoGrave = (r: { nivel: string; estado: string }): boolean => r.estado !== "cerrado" && (r.nivel === "Crítico" || r.nivel === "Alto");

/* ---------- Revisión ---------- */

export function validarNotaRevision(nota: string): string | null {
  const n = nota.trim().length;
  return n < MIN_NOTA_REVISION ? `Cuente por qué lo devuelve con al menos ${MIN_NOTA_REVISION} caracteres (lleva ${n}). Quien lo reportó la verá.` : null;
}

export function validarLote(ids: readonly string[]): string | null {
  if (!ids.length) return "Elija al menos un avance.";
  if (ids.length > MAX_LOTE) return `Se validan hasta ${MAX_LOTE} avances a la vez (eligió ${ids.length}).`;
  return null;
}

export function validarNotaCierre(nota: string): string | null {
  const n = nota.trim().length;
  return n < MIN_NOTA_CIERRE ? `Cuente por qué cierra la actividad con al menos ${MIN_NOTA_CIERRE} caracteres (lleva ${n}). Queda auditado.` : null;
}

export { validarPdi } from "./pdi";

/* ---------- Plazos de aviso ---------- */

export const COTAS_AVISOS = { maxDias: 6, diaMin: 0, diaMax: 60, avisosMax: 10, horasMax: 720, validarMin: 1 } as const;

/** Convierte «7, 3, 0» en [7,3,0]; devuelve null si algo no es un número entero. */
export function leerDias(texto: string): number[] | null {
  const partes = texto.split(/[\s,;]+/).filter(Boolean);
  const n = partes.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  return n.some(Number.isNaN) ? null : n;
}

export function validarConfigAvisos(c: ConfigAvisos): ErrorSimple[] {
  const e: ErrorSimple[] = [];
  const k = COTAS_AVISOS;
  if (c.diasAntes.length > k.maxDias) e.push({ campo: "cfg-dias", mensaje: `Hasta ${k.maxDias} días de aviso (puso ${c.diasAntes.length}).` });
  else if (c.diasAntes.some((d) => d < k.diaMin || d > k.diaMax)) e.push({ campo: "cfg-dias", mensaje: `Cada día va de ${k.diaMin} a ${k.diaMax} antes de la fecha límite.` });
  else if (new Set(c.diasAntes).size !== c.diasAntes.length) e.push({ campo: "cfg-dias", mensaje: "Hay un día repetido." });
  if (!Number.isInteger(c.vencidaMaxAvisos) || c.vencidaMaxAvisos < 0 || c.vencidaMaxAvisos > k.avisosMax) e.push({ campo: "cfg-vencida", mensaje: `Los avisos de vencida van de 0 a ${k.avisosMax}.` });
  if (!Number.isInteger(c.vencidaGestorHoras) || c.vencidaGestorHoras < 0 || c.vencidaGestorHoras > k.horasMax) e.push({ campo: "cfg-gestor", mensaje: `Las horas para avisar al gestor van de 0 a ${k.horasMax}.` });
  if (!Number.isInteger(c.validarHoras) || c.validarHoras < k.validarMin || c.validarHoras > k.horasMax) e.push({ campo: "cfg-validar", mensaje: `Las horas para validar van de ${k.validarMin} a ${k.horasMax}.` });
  return e;
}

export const diasDeAviso = (d: readonly number[]): string => (d.length ? [...d].sort((a, b) => b - a).map((x) => (x === 0 ? "el mismo día" : x === 1 ? "1 día antes" : `${x} días antes`)).join(", ") : "ninguno");

/** Los días que faltan o pasaron respecto a una fecha límite, para rotular un plazo. */
export const diasHasta = (hoy: string, fin: string): number => diasEntre(hoy, fin);

/** A quién llega el aviso de «reportaron un avance»: los gestores de la oficina, salvo quien lo reportó. */
export const avisoAvance = (equipo: readonly Pick<MiembroEquipo, "id" | "nombre" | "correo" | "papel">[], yo: string | null): AvisoPrevio[] =>
  equipo.filter((m) => m.papel === "jefe" && m.id !== yo).map((m) => ({ personaId: m.id, nombre: m.nombre, correo: m.correo, motivo: "avance" as const }));

/** A quién llega el aviso de «validaron / devolvieron su avance»: a quien lo reportó. */
export const avisoRevision = (autor: { id: string; nombre: string }, correo: string, motivo: "validado" | "devolucion", yo: string | null): AvisoPrevio[] =>
  autor.id === yo ? [] : [{ personaId: autor.id, nombre: autor.nombre, correo, motivo }];
