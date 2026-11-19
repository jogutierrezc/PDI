/* =============================================================================
   Planeación y Seguimiento · Fase 2 · modelo de las actividades. Sin DOM.

   Oficina = unidad del portal (`units`, con herencia por el árbol). El papel de una
   persona en la oficina es el `unit_role` de `unit_members` (jefe, editor, visor);
   aquí se llama gestor, colaborador y lector de la oficina. Todo texto visible habla
   de CAMPUS, nunca de sede.
   ========================================================================== */


/** Los cinco cubos del tablero, en orden. */
export const ESTADOS = ["por_iniciar", "en_curso", "en_riesgo", "en_revision", "hecho"] as const;
export type EstadoAct = (typeof ESTADOS)[number];

export interface DefEstado {
  id: EstadoAct;
  nombre: string;
  /** Una frase para quien llega al cubo por primera vez. */
  ayuda: string;
  tono: "neutro" | "activo" | "riesgo" | "pend" | "ok";
}

export const DEF_ESTADOS: Record<EstadoAct, DefEstado> = {
  por_iniciar: { id: "por_iniciar", nombre: "Por iniciar", ayuda: "Aún no se empieza.", tono: "neutro" },
  en_curso: { id: "en_curso", nombre: "En curso", ayuda: "Se está trabajando en ella.", tono: "activo" },
  en_riesgo: { id: "en_riesgo", nombre: "En riesgo", ayuda: "Puede no cumplirse a tiempo.", tono: "riesgo" },
  en_revision: { id: "en_revision", nombre: "En revisión", ayuda: "El colaborador terminó y espera al gestor.", tono: "pend" },
  hecho: { id: "hecho", nombre: "Hecho", ayuda: "El gestor la dio por cumplida.", tono: "ok" },
};

export const PRIORIDADES_ACT = ["Crítica", "Alta", "Media", "Baja"] as const;
export type PrioridadAct = (typeof PRIORIDADES_ACT)[number];
export const rangoPrioridad = (p: string): number => Math.max(0, PRIORIDADES_ACT.findIndex((x) => x === p));

/** `unit_role` de la base. */
export type PapelOficina = "jefe" | "editor" | "visor";
export const ROTULO_PAPEL: Record<PapelOficina, string> = { jefe: "Gestor de la oficina", editor: "Colaborador de la oficina", visor: "Lector de la oficina" };
/** Lo que el papel de la oficina permite como máximo. */
export type Poder = "ninguno" | "lector" | "colaborador" | "gestor";
export const ROTULO_PODER: Record<Poder, string> = { ninguno: "Sin acceso", lector: "Lector", colaborador: "Colaborador", gestor: "Gestor" };

export interface OficinaVista {
  id: string;
  nombre: string;
  parentId: string | null;
  /** Papel de la persona en la oficina (con herencia por el árbol); nulo si la ve solo por ser administradora. */
  papel: PapelOficina | null;
  /** De qué unidad le viene el papel si es heredado. */
  heredadoDe: string | null;
  /** Poder efectivo: el menor entre el nivel del módulo (ps_nivel) y el papel en la oficina. */
  poder: Poder;
  /** Cuántas líneas del plan tiene a su cargo. */
  nLineas: number;
}

export interface MiembroEquipo {
  id: string;
  nombre: string;
  correo: string;
  papel: PapelOficina;
  /** Se le pueden asignar actividades (los lectores no). */
  asignable: boolean;
  esYo: boolean;
  carga: Carga;
}

export interface Carga {
  /** Asignadas y no hechas. */
  activas: number;
  vencidas: number;
  enRiesgo: number;
  /** Asignadas, hechas o no. */
  total: number;
}

export interface ItemChecklist {
  id: string;
  texto: string;
  hecho: boolean;
}

export interface Actividad {
  id: string;
  oficinaId: string;
  /** Clave («no») de la línea del plan a la que contribuye; nulo = actividad propia de la oficina. */
  lineaNo: string | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoAct;
  prioridad: PrioridadAct;
  inicio: string | null;
  fin: string | null;
  esHito: boolean;
  campus: string;
  /** ids de las personas asignadas. */
  asignados: string[];
  checklist: ItemChecklist[];
  creadaPor: string;
  creadaEn: string;
  /** Dato de demostración (solo en el adaptador en memoria). */
  demo?: boolean;
}

export type TipoEvento = "creada" | "editada" | "estado" | "asignada" | "quitada" | "transferida" | "checklist";

export interface EventoActividad {
  id: string;
  tipo: TipoEvento;
  /** Nombre de quien lo hizo. */
  por: string;
  en: string;
  detalle: string;
  /** Solo en transferencias y asignaciones. */
  de?: string | null;
  a?: string | null;
  motivo?: string | null;
}

export interface ActividadDetalle {
  actividad: Actividad;
  eventos: EventoActividad[];
}

export interface DatosActividad {
  id?: string;
  oficinaId: string;
  lineaNo: string | null;
  titulo: string;
  descripcion: string;
  inicio: string | null;
  fin: string | null;
  esHito: boolean;
  prioridad: PrioridadAct;
  campus: string;
  asignados: string[];
}

/** A quién llegará un aviso por correo (lo envía el servidor; la interfaz solo lo muestra). */
export interface AvisoPrevio {
  personaId: string;
  nombre: string;
  correo: string;
  motivo: "asignacion" | "transferencia_entra" | "transferencia_sale" | "copia_gestor";
}

export interface LineaOficina {
  no: string;
  nombre: string;
  monto: number | null;
  campus: string;
  prioridad: string;
  inicio: string | null;
  fin: string | null;
  clasif: string;
}

/* ---------- Fechas (todas AAAA-MM-DD, sin zona horaria) ---------- */

const MS_DIA = 86_400_000;
export const aDia = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / MS_DIA;
export const diasEntre = (desde: string, hasta: string): number => Math.round(aDia(hasta) - aDia(desde));
export const sumarDias = (iso: string, n: number): string => new Date((aDia(iso) + n) * MS_DIA).toISOString().slice(0, 10);

export type EstadoPlazo = "hecha" | "vencida" | "proxima" | "en_plazo" | "sin_fecha";
export const DIAS_PROXIMA = 7;

/** Vencida: pasó su fecha límite y no está hecha. Próxima: vence en los próximos 7 días. */
export function estadoPlazo(a: Pick<Actividad, "estado" | "fin">, hoy: string): EstadoPlazo {
  if (a.estado === "hecho") return "hecha";
  if (!a.fin) return "sin_fecha";
  const d = diasEntre(hoy, a.fin);
  if (d < 0) return "vencida";
  if (d <= DIAS_PROXIMA) return "proxima";
  return "en_plazo";
}

export function textoPlazo(a: Pick<Actividad, "estado" | "fin">, hoy: string): string {
  const p = estadoPlazo(a, hoy);
  if (p === "sin_fecha") return "Sin fecha";
  if (!a.fin) return "Sin fecha";
  const d = diasEntre(hoy, a.fin);
  if (p === "hecha") return "Cumplida";
  if (p === "vencida") return d === -1 ? "Venció ayer" : `Venció hace ${-d} días`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  if (p === "proxima") return `Vence en ${d} días`;
  return "En plazo";
}

/* ---------- Carga y agrupación ---------- */

export function cargaPorPersona(acts: readonly Actividad[], personaId: string, hoy: string): Carga {
  const mias = acts.filter((a) => a.asignados.includes(personaId));
  const activas = mias.filter((a) => a.estado !== "hecho");
  return {
    total: mias.length,
    activas: activas.length,
    vencidas: activas.filter((a) => estadoPlazo(a, hoy) === "vencida").length,
    enRiesgo: activas.filter((a) => a.estado === "en_riesgo").length,
  };
}

export const SIN_RESPONSABLE = "__sin__";

export interface ResumenOficina {
  total: number;
  porEstado: Record<EstadoAct, number>;
  vencidas: number;
  sinResponsable: number;
  propias: number;
}

export function resumirActividades(acts: readonly Actividad[], hoy: string): ResumenOficina {
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoAct, number>;
  let vencidas = 0;
  let sin = 0;
  let propias = 0;
  for (const a of acts) {
    porEstado[a.estado] += 1;
    if (estadoPlazo(a, hoy) === "vencida") vencidas += 1;
    if (!a.asignados.length && a.estado !== "hecho") sin += 1;
    if (!a.lineaNo) propias += 1;
  }
  return { total: acts.length, porEstado, vencidas, sinResponsable: sin, propias };
}

export function progresoChecklist(a: Pick<Actividad, "checklist">): { hechos: number; total: number } {
  return { hechos: a.checklist.filter((i) => i.hecho).length, total: a.checklist.length };
}

/** Iniciales para el avatar: «Laura Mendoza» → «LM». */
export const iniciales = (nombre: string): string =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

