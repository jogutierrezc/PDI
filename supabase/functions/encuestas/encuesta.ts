/* =============================================================================
   Encuestas con Pilo · lógica compartida y pura (migración 0179)

   La usan la función `encuestas` (el servidor) y la pantalla pública (el
   navegador): tipos, constantes, límites y validación de un aporte. Sin Deno, sin
   red, sin DOM. La base vuelve a validar todo en enc_enviar; esto da el mensaje
   claro antes y evita el viaje.
   ========================================================================== */

export type TipoAporte = "logro" | "reto";
export type TipoCifra = "estudiantes" | "programas" | "porcentaje" | "dinero" | "otro";
export type EstadoAporte = "recibido" | "revisado" | "para_video";

export interface CifraEnvio {
  que: string;
  tipo: TipoCifra;
  /** Una sola palabra (2 a 20 letras); solo cuando `tipo` es «otro». */
  otro?: string;
  valor: number;
}

export interface AporteEnvio {
  tipo: TipoAporte;
  titulo: string;
  descripcion: string;
  cifras: CifraEnvio[];
}

export type ResultadoValidacion = { ok: true } | { ok: false; campo: string; mensaje: string };

export const TIPOS_APORTE: readonly TipoAporte[] = ["logro", "reto"];
export const TIPOS_CIFRA: readonly TipoCifra[] = ["estudiantes", "programas", "porcentaje", "dinero", "otro"];
export const ESTADOS: readonly EstadoAporte[] = ["recibido", "revisado", "para_video"];

/** Los dominios de correo que se aceptan siempre: los de la UDES y sus subdominios. */
export const DOMINIOS_PERMITIDOS: readonly string[] = [
  "udes.edu.co",
  "valledupar.udes.edu.co",
  "cucuta.udes.edu.co",
  "bogota.udes.edu.co",
  "bucaramanga.udes.edu.co",
  "mail.udes.edu.co",
];

export const LIMITES = {
  dependencia: { min: 3, max: 90 },
  titulo: { min: 5, max: 120 },
  descripcion: { min: 20, max: 500 },
  que: { min: 2, max: 80 },
  otro: { min: 2, max: 20 },
  aportesPorEnvio: 30,
  cifrasPorAporte: 12,
} as const;

const PALABRA = /^[\p{L}]+$/u;
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Quita espacios de los bordes y junta los espacios repetidos. */
export const limpiar = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function dominioDe(correo: string): string {
  return correo.slice(correo.lastIndexOf("@") + 1).trim().toLowerCase();
}

/** ¿El correo es de un dominio permitido (o de un subdominio suyo)? */
export function correoPermitido(correo: string): boolean {
  const c = limpiar(correo).toLowerCase();
  if (!CORREO.test(c)) return false;
  const d = dominioDe(c);
  return DOMINIOS_PERMITIDOS.some((x) => d === x || d.endsWith(`.${x}`));
}

const fallo = (campo: string, mensaje: string): ResultadoValidacion => ({ ok: false, campo, mensaje });
const entre = (s: string, r: { min: number; max: number }) => s.length >= r.min && s.length <= r.max;

/** Valida una cifra. `campo` es la ruta que se le muestra a la persona (p. ej. «cifras[2].valor»). */
export function validarCifra(c: unknown, prefijo = "cifras[1]"): ResultadoValidacion {
  const o = (c ?? {}) as Record<string, unknown>;
  const que = limpiar(o.que);
  if (!entre(que, LIMITES.que)) return fallo(`${prefijo}.que`, `Describa la cifra con entre ${LIMITES.que.min} y ${LIMITES.que.max} letras.`);
  if (typeof o.tipo !== "string" || !TIPOS_CIFRA.includes(o.tipo as TipoCifra)) return fallo(`${prefijo}.tipo`, "Elija el tipo de cifra.");
  const tipo = o.tipo as TipoCifra;
  const otro = limpiar(o.otro);
  if (tipo === "otro") {
    if (!entre(otro, LIMITES.otro) || !PALABRA.test(otro)) return fallo(`${prefijo}.otro`, `Escriba una sola palabra de ${LIMITES.otro.min} a ${LIMITES.otro.max} letras.`);
  } else if (otro) {
    return fallo(`${prefijo}.otro`, "Solo se llena cuando el tipo de cifra es «otro».");
  }
  if (typeof o.valor !== "number" || !Number.isFinite(o.valor)) return fallo(`${prefijo}.valor`, "Escriba un número.");
  if (o.valor < 0) return fallo(`${prefijo}.valor`, "El valor no puede ser negativo.");
  if (tipo === "porcentaje" && o.valor > 100) return fallo(`${prefijo}.valor`, "Un porcentaje no pasa de 100.");
  return { ok: true };
}

/** Valida un aporte completo (logro o reto con sus cifras). */
export function validarAporte(a: unknown, prefijo = "aportes[1]"): ResultadoValidacion {
  const o = (a ?? {}) as Record<string, unknown>;
  if (typeof o.tipo !== "string" || !TIPOS_APORTE.includes(o.tipo as TipoAporte)) return fallo(`${prefijo}.tipo`, "Elija si es un logro o un reto.");
  if (!entre(limpiar(o.titulo), LIMITES.titulo)) return fallo(`${prefijo}.titulo`, `El título lleva entre ${LIMITES.titulo.min} y ${LIMITES.titulo.max} letras.`);
  if (!entre(limpiar(o.descripcion), LIMITES.descripcion)) return fallo(`${prefijo}.descripcion`, `La descripción lleva entre ${LIMITES.descripcion.min} y ${LIMITES.descripcion.max} letras.`);
  const cifras = o.cifras ?? [];
  if (!Array.isArray(cifras)) return fallo(`${prefijo}.cifras`, "Las cifras no tienen el formato esperado.");
  if (cifras.length > LIMITES.cifrasPorAporte) return fallo(`${prefijo}.cifras`, `Cada aporte admite hasta ${LIMITES.cifrasPorAporte} cifras.`);
  for (let i = 0; i < cifras.length; i++) {
    const r = validarCifra(cifras[i], `${prefijo}.cifras[${i + 1}]`);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Valida la dependencia y la lista de aportes de un envío. */
export function validarEnvio(dependencia: unknown, aportes: unknown): ResultadoValidacion {
  if (!entre(limpiar(dependencia), LIMITES.dependencia)) return fallo("dependencia", `Escriba su dependencia (entre ${LIMITES.dependencia.min} y ${LIMITES.dependencia.max} letras).`);
  if (!Array.isArray(aportes) || aportes.length === 0) return fallo("aportes", "Agregue al menos un logro o un reto.");
  if (aportes.length > LIMITES.aportesPorEnvio) return fallo("aportes", `Cada envío admite hasta ${LIMITES.aportesPorEnvio} aportes.`);
  for (let i = 0; i < aportes.length; i++) {
    const r = validarAporte(aportes[i], `aportes[${i + 1}]`);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/** Deja un aporte validado en su forma limpia, lista para la base. */
export function normalizarAporte(a: AporteEnvio): AporteEnvio {
  return {
    tipo: a.tipo,
    titulo: limpiar(a.titulo),
    descripcion: limpiar(a.descripcion),
    cifras: (a.cifras ?? []).map((c) => {
      const base: CifraEnvio = { que: limpiar(c.que), tipo: c.tipo, valor: c.valor };
      if (c.tipo === "otro") base.otro = limpiar(c.otro);
      return base;
    }),
  };
}

/** Lo que devuelve `info` al público: la encuesta sin nada interno. */
export interface EncuestaPublica {
  slug: string;
  titulo: string;
  anio: string;
  intro: string;
  despedida: string;
  abierta: boolean;
  cierra_el: string | null;
}

/** ¿Recibe aportes hoy? (abierta y sin pasar la fecha de cierre, que cuenta hasta el final de ese día en hora de Bogotá, UTC−5 sin horario de verano.) */
export function recibeAportes(e: Pick<EncuestaPublica, "abierta" | "cierra_el">, hoy: string = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)): boolean {
  return e.abierta && (!e.cierra_el || hoy <= e.cierra_el);
}
