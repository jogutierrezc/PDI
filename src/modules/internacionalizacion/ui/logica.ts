/* =============================================================================
   Internacionalización · lógica de las pantallas (pura, sin React ni red).

   Lo que deciden las pantallas y conviene probar aparte: qué secciones ve
   cada papel, qué periodo se abre, el avance por campus y por estado, qué
   falta para cerrar el periodo, lo pendiente de cada papel (la cifra viva del
   lanzador), las acciones del envío con su rótulo, la escala de la línea de
   tiempo, los puntos de partida de «Nueva tabla» y el CSV de Cifras.
   Los permisos de verdad los decide la base (0151); esto solo evita ofrecer
   lo imposible.
   ========================================================================== */

import type { CifrasRpc } from "../lib/cifras";
import { CALCULO_DURACION } from "../lib/conceptos";
import { accionesPermitidas, ETIQUETA_ESTADO, hoyBogota, motivoBloqueoFilas, pideNota, rolEn, rolFila, ventanaAbierta } from "../lib/permisos";
import type {
  Campus,
  Columna,
  IntConceptoRow,
  IntEnvioRow,
  IntEstado,
  IntHojaRow,
  IntLibroRow,
  IntPeriodoRow,
  IntValor,
  IntVentanaRow,
  RolEnCampus,
  Yo,
} from "../tipos";

/* ---------- Secciones ------------------------------------------------------ */

export type SeccionId = "resumen" | "cifras" | "tablas" | "plantillas" | "periodos" | "accesos";

export interface Seccion {
  id: SeccionId;
  rotulo: string;
  titulo: string;
  descripcion: string;
  /** Solo el Director (y la administración) la ve. */
  director?: boolean;
}

export const SECCIONES: readonly Seccion[] = [
  { id: "resumen", rotulo: "Resumen", titulo: "Resumen del periodo", descripcion: "Qué falta para cerrar el periodo, campus por campus" },
  { id: "cifras", rotulo: "Cifras", titulo: "Cifras de internacionalización", descripcion: "Movilidad, países, convenios y personas de lo aprobado" },
  { id: "tablas", rotulo: "Tablas", titulo: "Tablas del repositorio", descripcion: "Las hojas de captura de cada campus, su envío y su validación" },
  { id: "plantillas", rotulo: "Plantillas", titulo: "Plantillas y cobertura", descripcion: "Qué responde el repositorio de SNIES, CNA y rankings" },
  { id: "periodos", rotulo: "Periodos", titulo: "Periodos y ventanas", descripcion: "Cuándo captura cada campus y qué se reabrió" },
  { id: "accesos", rotulo: "Accesos", titulo: "Accesos al módulo", descripcion: "Director, coordinadores de campus y gestores", director: true },
];

export function seccionesPara(director: boolean): Seccion[] {
  return SECCIONES.filter((s) => !s.director || director);
}

/** La sección pedida en la dirección, si existe y esta persona la puede ver; si no, nula. */
export function seccionDe(param: string | undefined, director: boolean): SeccionId | null {
  if (param === undefined) return "resumen";
  return seccionesPara(director).find((s) => s.id === param)?.id ?? null;
}

/* ---------- Periodo -------------------------------------------------------- */

/** El periodo de la dirección (por código); si no, el abierto más reciente; si no, el más reciente. */
export function periodoInicial(periodos: readonly IntPeriodoRow[], codigo?: string | null): IntPeriodoRow | null {
  if (codigo) {
    const pedido = periodos.find((p) => p.codigo === codigo);
    if (pedido) return pedido;
  }
  const orden = [...periodos].sort((a, b) => b.codigo.localeCompare(a.codigo));
  return orden.find((p) => p.estado === "abierto") ?? orden[0] ?? null;
}

/** Días entre hoy y una fecha «AAAA-MM-DD» (negativo si ya pasó), o nulo. */
export function diasHasta(fecha: string | null | undefined, hoy = hoyBogota()): number | null {
  if (!fecha) return null;
  const a = Date.parse(`${hoy}T00:00:00Z`);
  const b = Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-10-30» → «30 oct». Con año si no es el de hoy. */
export function fechaCorta(fecha: string | null | undefined, hoy = hoyBogota()): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return `${d} ${MESES[m - 1]}${String(a) === hoy.slice(0, 4) ? "" : ` ${a}`}`;
}

/** Fecha y hora legibles de una marca de tiempo. */
export function momento(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/* ---------- Avance --------------------------------------------------------- */

export type Avance = CifrasRpc["avance"][number];

export interface ConteoEstados {
  borrador: number;
  enviado: number;
  validado: number;
  aprobado: number;
  total: number;
  filas: number;
}

const cero = (): ConteoEstados => ({ borrador: 0, enviado: 0, validado: 0, aprobado: 0, total: 0, filas: 0 });

/** Cuenta (hoja × campus) por estado. */
export function contarEstados(avance: readonly Avance[]): ConteoEstados {
  const c = cero();
  for (const a of avance) {
    c[a.estado]++;
    c.total++;
    c.filas += a.filas;
  }
  return c;
}

/** Avance de cada campus (en el orden dado), aunque no tenga nada. */
export function avancePorCampus(avance: readonly Avance[], campus: readonly Pick<Campus, "id" | "name">[]): (ConteoEstados & { campus: Pick<Campus, "id" | "name"> })[] {
  return campus.map((c) => ({ campus: c, ...contarEstados(avance.filter((a) => a.campus_id === c.id)) }));
}

export interface Faltante {
  hoja_id: string;
  campus_id: string;
  estado: IntEstado;
  filas: number;
  /** Quién tiene que moverlo: el campus envía, el coordinador valida, el Director aprueba. */
  quien: string;
}

const QUIEN: Record<Exclude<IntEstado, "aprobado">, string> = {
  borrador: "Lo envía el campus",
  enviado: "Lo valida el coordinador del campus",
  validado: "Lo aprueba el Director",
};

/** Lo que no está aprobado, de lo más atrasado a lo más cerca de cerrar. */
export function faltantes(avance: readonly Avance[]): Faltante[] {
  const orden: Record<IntEstado, number> = { borrador: 0, enviado: 1, validado: 2, aprobado: 3 };
  return avance
    .filter((a) => a.estado !== "aprobado")
    .map((a) => ({ hoja_id: a.hoja_id, campus_id: a.campus_id, estado: a.estado, filas: a.filas, quien: QUIEN[a.estado as Exclude<IntEstado, "aprobado">] }))
    .sort((x, y) => orden[x.estado] - orden[y.estado]);
}

/**
 * Lo que está esperando a esta persona: el Director aprueba lo validado; el
 * coordinador valida lo enviado de sus campus; el gestor no tiene nada que
 * validar ni aprobar. Es la cifra viva del cartel del lanzador y del riel.
 */
export function pendientesDe(yo: Yo | null | undefined, envios: readonly Pick<IntEnvioRow, "campus_id" | "estado">[]): { total: number; unidad: string } {
  if (!yo) return { total: 0, unidad: "" };
  if (yo.director) {
    const n = envios.filter((e) => e.estado === "validado").length;
    return { total: n, unidad: n === 1 ? "hoja por aprobar" : "hojas por aprobar" };
  }
  if (yo.coordinador.length) {
    const n = envios.filter((e) => e.estado === "enviado" && yo.coordinador.includes(e.campus_id)).length;
    return { total: n, unidad: n === 1 ? "hoja por validar" : "hojas por validar" };
  }
  return { total: 0, unidad: "" };
}

/* ---------- Acciones del envío -------------------------------------------- */

export interface AccionEnvio {
  a: IntEstado;
  rotulo: string;
  /** Devolver y reabrir piden nota (motivo). */
  nota: boolean;
  /** La acción principal de la barra (la que hace avanzar el flujo). */
  principal: boolean;
}

/** Las acciones de la barra de envío para este papel, con su rótulo en español. */
export function accionesEnvio(estado: IntEstado, rol: RolEnCampus): AccionEnvio[] {
  return accionesPermitidas(estado, rol).map((a) => ({
    a,
    rotulo: a === "enviado" ? "Enviar" : a === "validado" ? "Validar" : a === "aprobado" ? "Aprobar" : estado === "aprobado" ? "Reabrir" : "Devolver",
    nota: pideNota(estado, a),
    principal: a !== "borrador",
  }));
}

/** Qué se escribe en el historial: «Enviado → Validado». */
export const transicion = (de: IntEstado, a: IntEstado) => `${ETIQUETA_ESTADO[de]} → ${ETIQUETA_ESTADO[a]}`;

/** Glifo de cada estado: el color nunca va solo. */
export const GLIFO: Record<IntEstado, string> = { borrador: "○", enviado: "◐", validado: "◉", aprobado: "●" };

/* ---------- Permisos de escritura por campus ------------------------------ */

export interface PuedeEscribir {
  campus_id: string;
  /** Papel para escribir filas (en Multicampus puede venir de Bucaramanga o de Planeación). */
  rol: RolEnCampus;
  /** Papel para enviar, validar y aprobar: solo el que tiene en ese campus (int_cambiar_estado). */
  rolEnvio: RolEnCampus;
  estado: IntEstado;
  abierta: boolean;
  /** Por qué no puede escribir, o nulo. */
  bloqueo: string | null;
}

/** Para cada campus visible: papel, estado, ventana y si puede escribir en la hoja. */
export function escrituraPorCampus(args: {
  yo: Yo | null | undefined;
  campus: readonly string[];
  hoja: Pick<IntHojaRow, "id">;
  libro: Pick<IntLibroRow, "captura">;
  periodo: Pick<IntPeriodoRow, "id" | "estado"> | null;
  ventanas: readonly IntVentanaRow[];
  envios: readonly IntEnvioRow[];
  hoy?: string;
}): PuedeEscribir[] {
  // Multicampus (0166): el papel sale de rolFila (Bucaramanga edita las filas de todos).
  const multicampus = args.libro.captura === "multicampus";
  return args.campus.map((id) => {
    const rol = rolFila(args.yo, id, multicampus);
    const estado = args.envios.find((e) => e.hoja_id === args.hoja.id && e.campus_id === id)?.estado ?? "borrador";
    const abierta = ventanaAbierta(args.periodo, args.ventanas, args.hoja.id, id, args.hoy);
    const bloqueo = !args.periodo
      ? "No hay periodo abierto."
      : args.periodo.estado === "cerrado" && rol !== "director"
        ? "El periodo está cerrado."
        : motivoBloqueoFilas({ rol, estado, captura: args.libro.captura, ventanaAbierta: abierta });
    return { campus_id: id, rol, rolEnvio: rolEn(args.yo, id), estado, abierta, bloqueo };
  });
}

/* ---------- Grilla --------------------------------------------------------- */

/** Texto de una celda guardada, para el campo de la grilla. */
export const textoDe = (v: IntValor | undefined) => (v === null || v === undefined ? "" : String(v));

/** «••••4821»: lo personal se ve enmascarado donde no se edita. */
export function enmascarar(v: string): string {
  const t = v.trim();
  if (!t) return "";
  return t.length <= 4 ? "••••" : `••••${t.slice(-4)}`;
}

/* ---------- Línea de tiempo ------------------------------------------------ */

export interface Escala {
  desde: string;
  hasta: string;
  meses: { rotulo: string; pos: number; ancho: number }[];
  /** Posición en % de una fecha dentro de la escala (recortada a 0–100). */
  pos: (fecha: string) => number;
}

const dia = (f: string) => Date.parse(`${f.slice(0, 10)}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * La escala de la línea de tiempo: del primer día del mes más temprano (abre
 * del periodo, de las ventanas o hoy) al último día del mes más tardío.
 */
export function escalaTiempo(fechas: readonly (string | null | undefined)[], hoy = hoyBogota()): Escala {
  const validas = [...fechas, hoy].filter((f): f is string => Boolean(f) && !Number.isNaN(dia(f as string)));
  const min = Math.min(...validas.map(dia));
  const max = Math.max(...validas.map(dia));
  const a = new Date(min);
  const z = new Date(max);
  const inicio = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1);
  const fin = Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0);
  const total = Math.max(1, fin - inicio + 86_400_000);
  const pos = (f: string) => Math.max(0, Math.min(100, ((dia(f) - inicio) / total) * 100));
  const meses: Escala["meses"] = [];
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); Date.UTC(y, m, 1) <= fin; m++) {
    if (m > 11) {
      m = 0;
      y++;
    }
    const ini = Date.UTC(y, m, 1);
    const ult = Date.UTC(y, m + 1, 1);
    meses.push({ rotulo: MESES[m], pos: ((ini - inicio) / total) * 100, ancho: ((ult - ini) / total) * 100 });
  }
  return { desde: iso(inicio), hasta: iso(fin), meses, pos };
}

/* ---------- Nueva tabla ---------------------------------------------------- */

export type Partida = "saliente" | "entrante" | "convenio" | "general";

export const PARTIDAS: Record<Partida, { rotulo: string; ayuda: string; clase: IntHojaRow["clase"]; sentido: IntHojaRow["sentido"]; conceptos: string[] }> = {
  saliente: {
    rotulo: "Movilidad saliente",
    ayuda: "Cuenta en Cifras como movilidad saliente.",
    clase: "movilidad",
    sentido: "saliente",
    conceptos: ["programa", "tipo_persona", "tipo_documento", "numero_documento", "nombre_completo", "pais_contraparte", "institucion_contraparte", "tipo_movilidad", "modalidad", "fecha_inicio", "fecha_fin", "duracion_dias", "financiacion"],
  },
  entrante: {
    rotulo: "Movilidad entrante",
    ayuda: "Cuenta en Cifras como movilidad entrante (también profesores visitantes).",
    clase: "movilidad",
    sentido: "entrante",
    conceptos: ["programa", "tipo_persona", "tipo_documento", "numero_documento", "nombre_completo", "nacionalidad", "institucion_contraparte", "tipo_movilidad", "modalidad", "fecha_inicio", "fecha_fin", "duracion_dias", "financiacion"],
  },
  convenio: {
    rotulo: "Convenios",
    ayuda: "Cuenta en Cifras como convenio vigente según inicio, fin y vigencia.",
    clase: "convenio",
    sentido: null,
    conceptos: ["nombre_convenio", "institucion_contraparte", "pais_contraparte", "tipo_convenio", "fecha_inicio", "fecha_fin", "vigencia_anios", "ods"],
  },
  general: {
    rotulo: "General",
    ayuda: "No cuenta en Cifras; sirve para cualquier otro registro.",
    clase: "general",
    sentido: null,
    conceptos: [],
  },
};

/** Las columnas de una hoja a partir de los conceptos elegidos (y los campos propios). */
export function columnasDesdeConceptos(
  elegidos: readonly string[],
  conceptos: readonly Pick<IntConceptoRow, "id" | "nombre" | "tipo" | "opciones" | "implicito">[],
  obligatorios: ReadonlySet<string> = new Set(),
  propios: readonly Columna[] = [],
): (Columna & { orden: number })[] {
  const tieneFechas = elegidos.includes("fecha_inicio") && elegidos.includes("fecha_fin");
  const desdeConceptos: Columna[] = elegidos
    .map((id) => conceptos.find((c) => c.id === id && !c.implicito))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => {
      const duracion = c.id === "duracion_dias";
      return {
        clave: c.id,
        etiqueta: c.nombre,
        tipo: duracion ? (tieneFechas ? "calculado" : "numero") : c.tipo,
        concepto_id: c.id,
        obligatorio: obligatorios.has(c.id) && !(duracion && tieneFechas),
        opciones: [...c.opciones],
        calculo: duracion && tieneFechas ? { ...CALCULO_DURACION } : null,
      };
    });
  return [...desdeConceptos, ...propios].map((c, i) => ({ ...c, orden: i + 1 }));
}

/* ---------- CSV ------------------------------------------------------------ */

const celda = (v: unknown) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV con «;» (lo que abre Excel en español) y BOM para los acentos. */
export function aCsv(encabezados: readonly string[], filas: readonly (readonly unknown[])[]): string {
  return `﻿${[encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n")}\r\n`;
}

/** Las cifras mostradas, en filas: lo mismo que dibuja la pantalla. */
export function filasCsvCifras(args: {
  periodo: string;
  incluye: readonly IntEstado[];
  campus: readonly Pick<Campus, "id" | "name">[];
  cifras: Pick<CifrasRpc, "movilidad" | "por_pais" | "personas" | "convenios_vigentes" | "avance">;
}): { encabezados: string[]; filas: (string | number)[][] } {
  const { campus, cifras } = args;
  const ids = new Set(campus.map((c) => c.id));
  const nombre = (id: string) => campus.find((c) => c.id === id)?.name ?? id;
  const corte = `${args.periodo} (${args.incluye.map((e) => ETIQUETA_ESTADO[e].toLowerCase()).join(", ")})`;
  const filas: (string | number)[][] = [];
  for (const m of cifras.movilidad.filter((x) => ids.has(x.campus_id))) filas.push(["Movilidad por campus", corte, nombre(m.campus_id), m.sentido, m.total]);
  for (const p of cifras.por_pais) filas.push(["Movilidad por país (campus visibles)", corte, p.pais, p.sentido, p.total]);
  for (const p of cifras.personas.filter((x) => ids.has(x.campus_id))) filas.push(["Personas en movilidad", corte, nombre(p.campus_id), "", p.total]);
  for (const c of cifras.convenios_vigentes.filter((x) => ids.has(x.campus_id))) filas.push(["Convenios vigentes", corte, nombre(c.campus_id), "", c.total]);
  for (const a of avancePorCampus(cifras.avance, campus)) {
    for (const e of ["borrador", "enviado", "validado", "aprobado"] as IntEstado[]) filas.push(["Avance de validación (hojas)", args.periodo, a.campus.name, ETIQUETA_ESTADO[e], a[e]]);
  }
  return { encabezados: ["Cifra", "Corte", "Campus o país", "Sentido o estado", "Total"], filas };
}
