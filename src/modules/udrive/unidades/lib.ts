/* =============================================================================
   UDrive · Unidades de trabajo · lógica pura (sin React ni base de datos).

   Contraste del color de acento, monograma por defecto, vencimientos y cuota.
   La base repite el contraste y los topes con checks y disparadores: esto sirve
   para avisar antes, no para hacer cumplir.
   ========================================================================== */

import type { Apariencia, IconoUnidad, MiembroBorrador, RolUnidad, UnidadFila } from "./tipos";
import { ACENTOS, AVISO_VENCE_DIAS, DOMINIO_INSTITUCIONAL, MAX_DIAS_EXTERNO } from "./tipos";

/* ---------- Color ---------- */

/** «#0B3A78», «0b3a78» o «#abc» → «#0b3a78»; nulo si no es un color de seis (o tres) cifras. */
export function normalizarHex(v: string): string | null {
  let h = v.trim().toLowerCase().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return /^#[0-9a-f]{6}$/.test(h) ? h : null;
}

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contraste del color contra blanco (1 a 21). */
export const contrasteConBlanco = (hex: string): number => 1.05 / (luminancia(hex) + 0.05);
export const MIN_CONTRASTE = 4.5;
export const cumpleContraste = (hex: string): boolean => contrasteConBlanco(hex) >= MIN_CONTRASTE;
export const textoContraste = (n: number): string => n.toFixed(1).replace(".", ",");

/** Oscurece el color poco a poco hasta que el texto blanco se lea (4,5:1). */
export function oscurecerHastaCumplir(hex: string): string {
  let h = hex;
  for (let i = 0; i < 60 && !cumpleContraste(h); i++) {
    h = `#${[1, 3, 5].map((k) => Math.round(parseInt(h.slice(k, k + 2), 16) * 0.93).toString(16).padStart(2, "0")).join("")}`;
  }
  return h;
}

/* ---------- Nombre, monograma y valores por defecto ---------- */

export const quitarTildes = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "para", "en", "a"]);

/** «Planeación Institucional» → «PI»; «Bienestar» → «BIEN»; «Decanatura de Ingenierías» → «DI». */
export function monogramaPorDefecto(nombre: string): string {
  const w = quitarTildes(nombre).split(/[^a-z0-9]+/).filter((x) => x && !PALABRAS_VACIAS.has(x));
  if (!w.length) return "";
  if (w.length === 1) return w[0].slice(0, 4).toUpperCase();
  return w.map((x) => x[0]).join("").slice(0, 4).toUpperCase();
}
export const normalizarMonograma = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
export const monogramaValido = (v: string): boolean => /^[A-Z0-9]{2,4}$/.test(v);

export function hashTexto(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const ICONOS_LISTA: IconoUnidad[] = ["chart", "book", "flask", "heart", "building", "globe", "people", "compass", "leaf", "scale", "cap", "gear"];

/** Un acento, una composición y un icono propuestos a partir del nombre, para que cada unidad nazca distinta. */
export function propuestaDeNombre(nombre: string): { acento: string; composicion: "A" | "B" | "C" | "D"; icono: IconoUnidad } {
  const h = hashTexto(quitarTildes(nombre));
  return { acento: ACENTOS[h % ACENTOS.length], composicion: (["A", "B", "C", "D"] as const)[(h >>> 3) % 4], icono: ICONOS_LISTA[(h >>> 5) % ICONOS_LISTA.length] };
}

export function nombreUnidadError(nombre: string, otras: readonly string[]): string {
  const v = nombre.trim();
  if (!v) return "Escriba un nombre para la unidad.";
  if (v.length < 3) return "Use al menos 3 caracteres.";
  if (/[/\\]/.test(v)) return "El nombre no puede llevar barras.";
  if (otras.some((o) => quitarTildes(o.trim()) === quitarTildes(v))) return "Ya hay una unidad con ese nombre. Añada el campus o el año para distinguirla.";
  return "";
}

/* ---------- Personas ---------- */

export const esCorreo = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const esInstitucional = (correo: string): boolean => correo.trim().toLowerCase().endsWith(`@${DOMINIO_INSTITUCIONAL}`);

/** Los correos de un texto pegado (separados por espacios, comas, punto y coma o saltos de línea), sin repetir. */
export function correosDeTexto(t: string): { correos: string[]; invalidos: string[] } {
  const partes = t.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const vistos = new Set<string>();
  const correos: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    if (vistos.has(p)) continue;
    vistos.add(p);
    (esCorreo(p) ? correos : invalidos).push(p);
  }
  return { correos, invalidos };
}

/** Papel sugerido a partir del de la estructura: Gestor administra, Contribuyente crea, Consulta ve. */
export const rolSugerido = (papel: "jefe" | "editor" | "visor"): RolUnidad => (papel === "jefe" ? "admin" : papel === "editor" ? "creador" : "lector");

export function iniciales(nombre: string, correo: string): string {
  const base = (nombre || correo).replace(/@.*/, "");
  const w = base.split(/[\s._-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}

const FONDOS_AVATAR = ["#0b3a78", "#00717e", "#6b3fa0", "#2e6b2f", "#a4471f", "#ad2f58", "#43536b", "#1a6b5a"];
export const colorAvatar = (clave: string): string => FONDOS_AVATAR[hashTexto(clave) % FONDOS_AVATAR.length];

/** ¿Falta una persona con papel Administra? */
export const sinAdministra = (m: readonly Pick<MiembroBorrador, "rol">[]): boolean => !m.some((x) => x.rol === "admin");

/* ---------- Vencimientos ---------- */

const DIA = 86_400_000;
export const diasHasta = (iso: string, ahora = Date.now()): number => Math.ceil((Date.parse(iso) - ahora) / DIA);

/** Fecha dentro de `dias` días, como «AAAA-MM-DD» para un campo de fecha. */
export function venceIsoEn(dias: number, ahora = Date.now()): string {
  return new Date(ahora + dias * DIA).toISOString().slice(0, 10);
}
/** Un día se vence al terminar ese día. */
export const fechaDeCampo = (v: string): string => `${v.slice(0, 10)}T23:59:59`;
export const maxVence = (ahora = Date.now()): string => venceIsoEn(MAX_DIAS_EXTERNO - 1, ahora);

export function venceError(v: string | null, ahora = Date.now()): string {
  if (!v) return "Indique hasta cuándo tendrá acceso.";
  const t = Date.parse(fechaDeCampo(v));
  if (Number.isNaN(t)) return "La fecha no es válida.";
  if (t <= ahora) return "La fecha debe ser futura.";
  if (t > ahora + MAX_DIAS_EXTERNO * DIA) return `El máximo son ${MAX_DIAS_EXTERNO} días (2 años).`;
  return "";
}

export function textoVence(iso: string | null, ahora = Date.now()): { texto: string; tono: "normal" | "pronto" | "vencida" } | null {
  if (!iso) return null;
  const d = diasHasta(iso, ahora);
  const fecha = new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  if (d < 0) return { texto: `Venció el ${fecha}`, tono: "vencida" };
  if (d <= AVISO_VENCE_DIAS) return { texto: `Vence en ${d <= 0 ? "menos de un día" : `${d} ${d === 1 ? "día" : "días"}`} (${fecha})`, tono: "pronto" };
  return { texto: `Hasta el ${fecha}`, tono: "normal" };
}

/* ---------- Cuota ---------- */

export type NivelCuota = "bien" | "aviso" | "lleno";
export const nivelCuota = (uso: number, cuota: number): NivelCuota => (cuota > 0 && uso >= cuota ? "lleno" : cuota > 0 && uso / cuota >= 0.8 ? "aviso" : "bien");
export const fraccionCuota = (uso: number, cuota: number): number => (cuota > 0 ? Math.min(1, uso / cuota) : 1);

export const GB = 1024 ** 3;
export function textoBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${Math.round(b / 1024)} KB`;
  if (b < GB) return `${(b / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(b / GB).toFixed(b >= 10 * GB ? 0 : 1).replace(".", ",")} GB`;
}

/* ---------- Apariencia ---------- */

export function aparienciaDe(u: Pick<UnidadFila, "nombre" | "descripcion" | "monograma" | "acento" | "icono" | "composicion" | "portada" | "imagen">, imagenUrl: string | null): Apariencia {
  return { nombre: u.nombre, descripcion: u.descripcion, monograma: u.monograma, acento: u.acento, icono: u.icono, composicion: u.composicion, portada: u.portada, imagenUrl, imagen: u.imagen ? { x: u.imagen.x, y: u.imagen.y, zoom: u.imagen.zoom } : null };
}

/* ---------- Acciones del registro, en palabras ---------- */

const ACCIONES: Record<string, string> = {
  creada: "Creó la unidad",
  personalizada: "Cambió la presentación de la unidad",
  archivada: "Archivó la unidad",
  restaurada: "Restauró la unidad",
  ingreso_admin: "Entró a la unidad sin ser miembro",
  persona_añadida: "Añadió a una persona",
  persona_quitada: "Quitó a una persona",
  papel_cambiado: "Cambió el papel de una persona",
  vencimiento_cambiado: "Cambió el vencimiento de una persona",
  administracion_transferida: "Pasó la administración",
  cuota_cambiada: "Cambió la cuota de almacenamiento",
  ampliacion_pedida: "Pidió más espacio",
  ampliacion_aprobada: "Aprobó una ampliación de espacio",
  ampliacion_rechazada: "Rechazó una ampliación de espacio",
  papelera_vaciada: "Vació la papelera vencida",
};
export const textoAccion = (a: string): string => ACCIONES[a] ?? a;
