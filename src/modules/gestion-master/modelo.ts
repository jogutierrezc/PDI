/* =============================================================================
   Gestión Master · el modelo: tipos, textos y reglas puras.

   Lo que la base hace cumplir (0194) se repite aquí solo para avisar antes de
   enviar: la autoridad es la base. Las reglas que vienen de Rua (justificación
   de 150 a 2000 caracteres, código en mayúsculas, nota obligatoria en cada
   decisión, errores solo en lo que el usuario ya tocó) se conservan.
   ========================================================================== */

export type Tipo = "nuevo" | "mejorar" | "eliminar";
export type Estado = "borrador" | "pendiente" | "revision" | "devuelta" | "aprobada" | "rechazada" | "cancelada";
export type Aplicacion = "sin_aplicar" | "aplicada" | "reflejada";
export type Prioridad = "normal" | "alta" | "urgente";
export type TipoActividad = "directa" | "apoyo";
export type Decision = "aprobar" | "devolver" | "rechazar";

/** Rua: justificación entre 150 y 2000 caracteres para enviar; nota de decisión de al menos 20. */
export const MIN_JUSTIFICACION = 150;
export const MAX_JUSTIFICACION = 2000;
export const MIN_NOTA = 20;
/** El indicador de plazo de Rua: 15 días hábiles. No corta nada: solo avisa. */
export const PLAZO_INDICADOR = 15;

export const TIPOS: Record<Tipo, { nombre: string; ayuda: string }> = {
  nuevo: { nombre: "Nuevo", ayuda: "Una actividad que no existe en el Master. Mire primero si ya hay algo parecido." },
  mejorar: { nombre: "Mejorar o mantener", ayuda: "Parte de un código que ya existe, con sus datos, y se puede ampliar o ajustar." },
  eliminar: { nombre: "Eliminar", ayuda: "Dar de baja un código. Vea antes cuántos profesores lo tienen asignado." },
};

export const ESTADOS: Record<Estado, { nombre: string; tono: "neutro" | "aviso" | "info" | "devuelta" | "ok" | "mal" }> = {
  borrador: { nombre: "Borrador", tono: "neutro" },
  pendiente: { nombre: "Pendiente", tono: "aviso" },
  revision: { nombre: "En revisión", tono: "info" },
  devuelta: { nombre: "Devuelta", tono: "devuelta" },
  aprobada: { nombre: "Aprobada", tono: "ok" },
  rechazada: { nombre: "Rechazada", tono: "mal" },
  cancelada: { nombre: "Cancelada", tono: "neutro" },
};

export const APLICACION: Record<Aplicacion, string> = {
  sin_aplicar: "Falta aplicar en el Master",
  aplicada: "Aplicada, falta la captura que lo confirme",
  reflejada: "Reflejada en el Master",
};

export const PRIORIDADES: Record<Prioridad, string> = { normal: "Normal", alta: "Alta", urgente: "Urgente" };

export const SEDES = [
  { id: "buc", nombre: "Bucaramanga" },
  { id: "cuc", nombre: "Cúcuta" },
  { id: "val", nombre: "Valledupar" },
  { id: "bog", nombre: "Bogotá" },
] as const;
export const nombreSede = (id: string) => SEDES.find((s) => s.id === id)?.nombre ?? id;

/** Periodos desde 2018b hasta el semestre en curso (a: enero a junio, b: julio a diciembre), el más reciente primero. */
export function periodosLista(hoy = new Date()): string[] {
  const actual = hoy.getFullYear();
  const mitad = hoy.getMonth() >= 6 ? "b" : "a";
  const salida: string[] = [];
  for (let y = 2018; y <= actual; y++) {
    if (y > 2018) salida.push(`${y}a`);
    if (y < actual || mitad === "b") salida.push(`${y}b`);
  }
  return salida.reverse();
}

export const nombrePeriodo = (p: string) => `${p.slice(0, 4)} ${p.slice(4).toUpperCase()}`;

/* --- Las filas que llegan de la base ------------------------------------------------------------ */

export interface FilaLista {
  id: string;
  folio: string;
  tipo: Tipo;
  estado: Estado;
  aplicacion: Aplicacion | null;
  prioridad: Prioridad;
  solicitante_id: string;
  solicitante: string | null;
  unidad_id: string | null;
  unidad: string | null;
  periodo: string;
  sede: string;
  paso_orden: number | null;
  paso_nombre: string | null;
  paso_funcion: string | null;
  total_pasos: number;
  enviada_en: string | null;
  limite_en: string | null;
  dias_restantes: number | null;
  actualizada_en: string;
  lineas: { codigo: string | null; nombre: string | null; origen_codigo: string | null }[];
  es_mia: boolean;
  puedo_decidir: boolean;
}

export interface Linea {
  id: string;
  orden: number;
  codigo: string | null;
  origen_codigo: string | null;
  origen_periodo: string | null;
  origen_sede: string | null;
  nombre: string | null;
  tipo_actividad: TipoActividad | null;
  instrucciones: string | null;
  vinculacion: string | null;
  activa: boolean;
  antes: { ficha?: Ficha; periodo?: string; sede?: string };
  despues: { nombre?: string; tipo_actividad?: string; instrucciones?: string; vinculacion?: string; activa?: boolean };
}

export interface Paso {
  id: string;
  ronda: number;
  orden: number;
  nombre: string;
  funcion: string;
  estado: "bloqueado" | "pendiente" | "aprobado" | "devuelto" | "rechazado" | "omitido";
  inicio_en: string | null;
  decidido_en: string | null;
  decidido_por: string | null;
  nota: string | null;
  por_admin: boolean;
  plazo_dias: number | null;
}

export interface Evento {
  id: number;
  tipo: string;
  actor: string | null;
  datos: Record<string, unknown>;
  creado_en: string;
}

export interface Detalle {
  id: string;
  folio: string;
  tipo: Tipo;
  estado: Estado;
  aplicacion: Aplicacion | null;
  prioridad: Prioridad;
  solicitante_id: string;
  solicitante: string | null;
  unidad_id: string | null;
  unidad: string | null;
  periodo: string;
  sede: string;
  justificacion: string;
  ronda: number;
  enviada_en: string | null;
  limite_en: string | null;
  resuelta_en: string | null;
  aplicada_en: string | null;
  reflejada_en: string | null;
  creada_en: string;
  es_mia: boolean;
  puedo_editar: boolean;
  puedo_cancelar: boolean;
  puedo_decidir: boolean;
  lineas: Linea[];
  pasos: Paso[];
  eventos: Evento[];
}

/** La ficha de un código desde el Warehouse (gm_ficha_codigo): catálogo, profesores, horas y de qué corte. */
export interface Ficha {
  codigo: string;
  catalogo: { codigo: string; nombre: string | null; tipo: string | null; instrucciones: string | null; activa: boolean | null; directa: boolean | null; vinculacion: string | null } | null;
  sin_captura_catalogo: boolean;
  sin_captura_nomina: boolean;
  n_profesores: number | null;
  horas: number | null;
  promedio_horas: number | null;
  coincidencia: "codigo" | "nombre";
  profesores: { seudonimo: string; programa: string | null; asignaciones: number; horas: number }[];
  carga_actdir: { id: string; version: number; corte: string } | null;
  carga_nomina: { id: string; version: number; corte: string } | null;
}

export interface ActividadPeriodo {
  codigo: string;
  nombre: string | null;
  tipo_actividad: string;
  activa: boolean | null;
  vinculacion: string | null;
  n_profesores: number | null;
  horas: number | null;
  promedio_horas: number | null;
  solicitudes_abiertas: number;
}

export interface ProfesorPeriodo {
  seudonimo: string;
  programa: string | null;
  actividades: number;
  horas: number;
  codigos: string[] | null;
}

export interface Corte {
  sede: string;
  conjunto: string;
  version: number;
  filas: number;
  terminada_en: string;
  periodo: string;
}

export interface FlujoPaso {
  id?: string;
  orden: number;
  nombre: string;
  funcion: string;
  suplente_funcion: string | null;
  plazo_dias: number | null;
}

export interface Flujo {
  id: string;
  nombre: string;
  descripcion: string;
  plazo_dias: number;
  por_defecto: boolean;
  activo: boolean;
  pasos: FlujoPaso[];
}

export interface Funcion {
  codigo: string;
  nombre: string;
  activa: boolean;
  orden: number;
}

export interface TiempoPaso {
  funcion: string;
  nombre: string;
  decididas: number;
  promedio_dias: number | null;
  pendientes: number;
  mayor_espera_dias: number | null;
}

/* --- Reglas de captura (las de Rua) ------------------------------------------------------------- */

export const RE_CODIGO = /^[A-Z0-9._-]{1,32}$/;
export const AYUDA_CODIGO = "Mayúsculas, números, punto, guion y guion bajo, hasta 32 caracteres.";

export const normalizarCodigo = (v: string) => v.trim().toUpperCase();

/** El motivo por el que un código no sirve, o null. Un código vacío es válido cuando no es obligatorio. */
export function validarCodigo(valor: string, obligatorio: boolean): string | null {
  const limpio = normalizarCodigo(valor);
  if (!limpio) return obligatorio ? "El código es obligatorio." : null;
  if (limpio.length > 32) return "Demasiado largo: máximo 32 caracteres.";
  if (!RE_CODIGO.test(limpio)) return "Solo mayúsculas, números, punto, guion y guion bajo (sin espacios ni acentos).";
  return null;
}

/* --- Presentación ------------------------------------------------------------------------------- */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** «Vence en 3 días hábiles», «Vence hoy» o «Vencida hace 2 días hábiles». */
export function textoPlazo(dias: number | null | undefined): { texto: string; nivel: "ok" | "pronto" | "vencida" | "" } {
  if (dias === null || dias === undefined) return { texto: "", nivel: "" };
  if (dias < 0) return { texto: `Vencida hace ${-dias} ${-dias === 1 ? "día hábil" : "días hábiles"}`, nivel: "vencida" };
  if (dias === 0) return { texto: "Vence hoy", nivel: "pronto" };
  if (dias === 1) return { texto: "Vence mañana", nivel: "pronto" };
  return { texto: `Vence en ${dias} días hábiles`, nivel: "ok" };
}

export const horasTexto = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`);

/** Lo que dijo Postgres, sin el prefijo técnico, para mostrarlo a una persona. */
export function mensajeDe(error: unknown): string {
  const m = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (/gm_\w+.*does not exist|schema cache|PGRST202/i.test(m)) return "Falta aplicar la migración 0194 (Gestión Master) en la base de datos.";
  return m.replace(/^ERROR:\s*/i, "").trim() || "Algo falló. Intente de nuevo.";
}

/** Lo que hay que mostrar de una línea: su código y nombre, o «(sin código)». */
export const resumenLinea = (l: { codigo: string | null; nombre: string | null }) => `${l.codigo ?? "(sin código)"}${l.nombre ? ` · ${l.nombre}` : ""}`;
