/* =============================================================================
   Convenios · lógica pura (sin pantalla ni base): vigencia por fechas, ruta de
   firma, países del mapa, y la lectura y normalización del Excel institucional.

   La vigencia NO se guarda: sale de las fechas y de la etapa. Lo que se guarda a
   mano es la ruta de firma (pasos) y el cierre anticipado (cerrado).
   ========================================================================== */

import { COUNTRIES } from "../../datos-abiertos/data/world-map";
import { hoyBogota } from "../lib/permisos";
import { diasHasta } from "../ui/logica";

/** Días de aviso para «Por vencer». Un solo lugar: el Excel ya usaba 180. */
export const ALERTA_DIAS = 180;
/** Hasta cuántos días adelante llega la lista de Vencimientos (12 meses). */
export const VENTANA_VENCIMIENTOS = 365;
export const POR_PAGINA = 20;

/** Nombre de la plantilla de rel_plantillas que usa «Avisar» (la deja la migración 0255). */
export const PLANTILLA_RENOVACION = "Renovación de convenio";

/**
 * La ruta de firma. Los responsables son un supuesto de la oficina: el usuario los
 * confirmará y se cambian aquí, en un solo lugar.
 */
export const PASOS: readonly { nombre: string; responsable: string }[] = [
  { nombre: "Borrador y objeto", responsable: "Relaciones Internacionales" },
  { nombre: "Revisión jurídica", responsable: "Secretaría General" },
  { nombre: "Firma de la UDES", responsable: "Rectoría" },
  { nombre: "Firma de la contraparte", responsable: "Institución socia" },
  { nombre: "Archivo en la carpeta digital", responsable: "Relaciones Internacionales" },
];

export const ESPACIOS_DOCUMENTOS = ["Convenio firmado", "Borrador y versiones", "Adendas y otrosíes", "Acta de aprobación", "Informes de ejecución"] as const;

export const DOCUMENTOS = ["Convenio", "Memorando de Entendimiento", "Red", "Acta de Vinculación/Adhesión", "Contrato", "Acuerdo"] as const;
export const MODALIDADES = ["Cooperación Académica", "Intercambio/semestre académico", "Prácticas/pasantías", "Estancias de Investigación", "Doble título"] as const;
export const RENOVACIONES = ["Por solicitud escrita", "Automática", "N/A"] as const;
export const TIPOS = ["Marco", "Específico", "Otro", "Sin tipo"] as const;
export const TIPOS_RENOVACION = ["Prórroga", "Renovación automática", "Nuevo convenio"] as const;

export type Tipo = (typeof TIPOS)[number];
export type Naturaleza = "Internacional" | "Nacional";
export type EstadoCarpeta = "udrive" | "enlace" | "sin";

/** Una fila de conv_convenios. */
export interface Convenio {
  id: string;
  codigo: string;
  documento: string;
  naturaleza: Naturaleza;
  institucion: string;
  pais: string;
  pais_cod: string | null;
  objeto: string;
  tipo: Tipo;
  tipo_excel: string;
  modalidad: string;
  fecha_firma: string | null;
  fecha_terminacion: string | null;
  indefinido: boolean;
  renovacion: string;
  campus: string;
  facultad: string;
  programas: string;
  observaciones: string;
  carpeta_estado: EstadoCarpeta;
  carpeta_url: string | null;
  /** Carpeta del convenio en la unidad «Internacionalización» de UDrive (estado «udrive»). */
  drive_carpeta_id: string | null;
  pasos: number;
  pasos_fechas: (string | null)[];
  cerrado: boolean;
  cerrado_en: string | null;
  estado_excel: string | null;
  /** Idioma de la contraparte (0256): en el aviso al contacto de la institución. */
  idioma: "es" | "en";
  origen: "manual" | "excel";
  created_by: string | null;
  created_at: string;
}

/** Lo que se escribe al crear o importar (el resto lo pone la base). */
export type ConvenioNuevo = Omit<Convenio, "id" | "created_by" | "created_at" | "drive_carpeta_id" | "cerrado" | "cerrado_en" | "idioma">;

/* ---------- Vigencia y etapa ---------------------------------------------- */

export type Etapa = "En proceso" | "En revisión" | "Pendiente firma" | "Firmado" | "Terminado";
export type Vigencia = "Vigente" | "Por vencer" | "Vencido" | "Sin fecha" | "Terminado" | "En proceso" | "En revisión" | "Pendiente firma";

type ParaVigencia = Pick<Convenio, "pasos" | "cerrado" | "indefinido" | "fecha_terminacion">;

export function etapaDe(c: Pick<Convenio, "pasos" | "cerrado">): Etapa {
  if (c.cerrado) return "Terminado";
  if (c.pasos >= 5) return "Firmado";
  if (c.pasos >= 3) return "Pendiente firma";
  if (c.pasos === 2) return "En revisión";
  return "En proceso";
}

export const enTramite = (c: Pick<Convenio, "pasos" | "cerrado">): boolean => {
  const e = etapaDe(c);
  return e === "En proceso" || e === "En revisión" || e === "Pendiente firma";
};

/** Días que faltan para terminar (negativo si ya pasó); nulo si es indefinido o no hay fecha. */
export function diasFaltantes(c: Pick<Convenio, "indefinido" | "fecha_terminacion">, hoy = hoyBogota()): number | null {
  if (c.indefinido || !c.fecha_terminacion) return null;
  return diasHasta(c.fecha_terminacion, hoy);
}

export function vigenciaDe(c: ParaVigencia, hoy = hoyBogota()): Vigencia {
  const e = etapaDe(c);
  if (e === "Terminado") return "Terminado";
  if (e !== "Firmado") return e;
  if (c.indefinido) return "Vigente";
  if (!c.fecha_terminacion) return "Sin fecha";
  const d = diasFaltantes(c, hoy) ?? 0;
  return d < 0 ? "Vencido" : d <= ALERTA_DIAS ? "Por vencer" : "Vigente";
}

export const CLASE_VIGENCIA: Record<Vigencia, "ok" | "warn" | "bad" | "idle"> = {
  Vigente: "ok",
  "Por vencer": "warn",
  Vencido: "bad",
  "Sin fecha": "warn",
  Terminado: "idle",
  "En proceso": "idle",
  "En revisión": "idle",
  "Pendiente firma": "idle",
};

/** El Excel dice Vigente / Por vencer / Vencido pero las fechas dicen otra cosa (solo convenios importados, firmados y con fecha). */
export function desajustado(c: ParaVigencia & { estado_excel: string | null }, hoy = hoyBogota()): boolean {
  if (!c.estado_excel || !["Vigente", "Vencido", "Por vencer"].includes(c.estado_excel)) return false;
  if (etapaDe(c) !== "Firmado") return false;
  const v = vigenciaDe(c, hoy);
  return v !== "Sin fecha" && v !== c.estado_excel;
}

export type FiltroEstado = "" | "Vigente" | "Por vencer" | "Vencido" | "tramite" | "Sin fecha" | "desajuste";

export function cumpleEstado(c: Convenio, f: FiltroEstado, hoy = hoyBogota()): boolean {
  if (!f) return true;
  if (f === "desajuste") return desajustado(c, hoy);
  if (f === "tramite") return enTramite(c);
  return vigenciaDe(c, hoy) === f;
}

export interface Conteos {
  vigentes: number;
  porVencer: number;
  vencidos: number;
  tramite: number;
  pendienteFirma: number;
  sinFecha: number;
  indefinidos: number;
  desajustados: number;
}

export function contar(lista: readonly Convenio[], hoy = hoyBogota()): Conteos {
  const c: Conteos = { vigentes: 0, porVencer: 0, vencidos: 0, tramite: 0, pendienteFirma: 0, sinFecha: 0, indefinidos: 0, desajustados: 0 };
  for (const r of lista) {
    const v = vigenciaDe(r, hoy);
    if (v === "Vigente") c.vigentes++;
    else if (v === "Por vencer") c.porVencer++;
    else if (v === "Vencido") c.vencidos++;
    else if (v === "Sin fecha") c.sinFecha++;
    if (enTramite(r)) c.tramite++;
    if (v === "Pendiente firma") c.pendienteFirma++;
    if (r.indefinido && etapaDe(r) === "Firmado") c.indefinidos++;
    if (desajustado(r, hoy)) c.desajustados++;
  }
  return c;
}

/* ---------- Vencimientos por trimestre ------------------------------------ */

export interface Trimestre {
  rotulo: string;
  n: number;
  actual: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 8 trimestres desde el actual: firmados con fecha que terminan en cada uno (desde hoy). Los indefinidos no cuentan. */
export function trimestres(lista: readonly Convenio[], hoy = hoyBogota()): Trimestre[] {
  const y0 = Number(hoy.slice(0, 4));
  const q0 = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3);
  const firmados = lista.filter((c) => etapaDe(c) === "Firmado" && !c.indefinido && c.fecha_terminacion);
  const salida: Trimestre[] = [];
  for (let k = 0; k < 8; k++) {
    const q = (q0 + k) % 4;
    const y = y0 + Math.floor((q0 + k) / 4);
    const ini = `${y}-${pad2(q * 3 + 1)}-01`;
    const fin = q === 3 ? `${y + 1}-01-01` : `${y}-${pad2(q * 3 + 4)}-01`;
    const desde = ini > hoy ? ini : hoy;
    salida.push({ rotulo: `T${q + 1} ${String(y).slice(2)}`, n: firmados.filter((c) => (c.fecha_terminacion as string) >= desde && (c.fecha_terminacion as string) < fin).length, actual: k === 0 });
  }
  return salida;
}

/* ---------- Fechas legibles ------------------------------------------------ */

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-10-30» → «30 oct 2026». */
export function fechaLarga(f: string | null | undefined): string {
  if (!f) return "—";
  const [a, m, d] = f.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return f;
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

/** Fecha de terminación como se lee en la tabla: «Indefinido», la fecha o «—». */
export const terminaTexto = (c: Pick<Convenio, "indefinido" | "fecha_terminacion">): string => (c.indefinido ? "Indefinido" : fechaLarga(c.fecha_terminacion));

/* ---------- Países ---------------------------------------------------------- */

export const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

const POR_NOMBRE = new Map(COUNTRIES.map((c) => [normalizar(c.name), c]));
export const POR_CODIGO = new Map(COUNTRIES.map((c) => [c.code, c]));
const ALIAS_PAIS: Record<string, string> = { eeuu: "USA", "ee uu": "USA", "estados unidos": "USA", "republica checa": "CZE", "south korea": "KOR", roma: "ITA", brazil: "BRA" };
const VARIOS = /,| - |\//;

export const NOMBRES_PAISES: readonly string[] = [...COUNTRIES.map((c) => c.name)].sort((a, b) => a.localeCompare(b, "es"));

export interface PaisLeido {
  pais: string;
  cod: string | null;
}

/** El país como se guarda: el nombre del mapa si se reconoce; «Varios países» si son varios; «Sin país» si está vacío. */
export function leerPais(texto: string): PaisLeido {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t) return { pais: "Sin país", cod: null };
  const k = normalizar(t);
  if (k === "varios paises") return { pais: "Varios países", cod: null };
  if (k === "sin pais") return { pais: "Sin país", cod: null };
  const directo = ALIAS_PAIS[k] ?? POR_NOMBRE.get(k)?.code;
  if (directo && POR_CODIGO.has(directo)) return { pais: (POR_CODIGO.get(directo) as { name: string }).name, cod: directo };
  if (VARIOS.test(t)) return { pais: "Varios países", cod: null };
  return { pais: t, cod: null };
}

export interface GrupoPais {
  cod: string;
  nombre: string;
  n: number;
  vigentes: number;
  lista: Convenio[];
}

/** Convenios agrupados por país del mapa. Los de varios países o sin país no entran. */
export function porPais(lista: readonly Convenio[], hoy = hoyBogota()): Map<string, GrupoPais> {
  const m = new Map<string, GrupoPais>();
  for (const c of lista) {
    if (!c.pais_cod) continue;
    const g = m.get(c.pais_cod) ?? { cod: c.pais_cod, nombre: POR_CODIGO.get(c.pais_cod)?.name ?? c.pais, n: 0, vigentes: 0, lista: [] };
    g.n++;
    g.lista.push(c);
    const v = vigenciaDe(c, hoy);
    if (v === "Vigente" || v === "Por vencer") g.vigentes++;
    m.set(c.pais_cod, g);
  }
  return m;
}

/** Escala de 5 tonos del mapa: 1, 2-4, 5-14, 15-39, 40 o más. */
export const ESCALA: readonly { min: number; color: string; rotulo: string }[] = [
  { min: 40, color: "#1D4F7C", rotulo: "40 o más" },
  { min: 15, color: "#3A74AB", rotulo: "15 a 39" },
  { min: 5, color: "#6FA0CF", rotulo: "5 a 14" },
  { min: 2, color: "#A9C8E6", rotulo: "2 a 4" },
  { min: 1, color: "#D3E3F3", rotulo: "1" },
];
export const tonoDe = (n: number): string | null => ESCALA.find((e) => n >= e.min)?.color ?? null;

/* ---------- Código del convenio -------------------------------------------- */

export const CODIGO_VALIDO = /^c[in]-\d{2}-\d{3}$/;

/** El siguiente código libre con el prefijo («ci-01-» o «cn-01-»). */
export function sugerirCodigo(lista: readonly Pick<Convenio, "codigo">[], prefijo: "ci-01-" | "cn-01-"): string {
  let max = 0;
  for (const c of lista) {
    const k = c.codigo.toLowerCase();
    if (!k.startsWith(prefijo)) continue;
    const n = Number(k.slice(-3));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefijo}${String(max + 1).padStart(3, "0")}`;
}

export const ENLACE_VALIDO = /^https:\/\/\S+$/;

/* ---------- Búsqueda, filtros y orden --------------------------------------- */

export type Orden = "cod" | "venc" | "inst";

export interface Filtros {
  q: string;
  estado: FiltroEstado;
  tipo: string;
  naturaleza: string;
  pais: string;
  campus: string;
  orden: Orden;
}

export const SIN_FILTROS: Filtros = { q: "", estado: "", tipo: "", naturaleza: "", pais: "", campus: "", orden: "cod" };

export function filtrar(lista: readonly Convenio[], f: Filtros, hoy = hoyBogota()): Convenio[] {
  const t = normalizar(f.q);
  const salida = lista.filter(
    (c) =>
      (!t || normalizar(`${c.institucion} ${c.pais} ${c.codigo} ${c.objeto}`).includes(t)) &&
      cumpleEstado(c, f.estado, hoy) &&
      (!f.tipo || c.tipo === f.tipo) &&
      (!f.naturaleza || c.naturaleza === f.naturaleza) &&
      (!f.pais || c.pais === f.pais) &&
      (!f.campus || c.campus === f.campus),
  );
  return salida.sort((a, b) => {
    if (f.orden === "venc") return (diasFaltantes(a, hoy) ?? 1e9) - (diasFaltantes(b, hoy) ?? 1e9) || a.codigo.localeCompare(b.codigo);
    if (f.orden === "inst") return a.institucion.localeCompare(b.institucion, "es");
    return a.codigo.localeCompare(b.codigo);
  });
}

/* ---------- Próximo paso (texto de la columna lateral) ---------------------- */

export function proximoPaso(c: Convenio, hoy = hoyBogota()): string {
  if (c.cerrado) return "Convenio cerrado antes de tiempo.";
  if (c.pasos < 5) return `Siguiente paso: ${PASOS[c.pasos].nombre.toLowerCase()}.`;
  const v = vigenciaDe(c, hoy);
  const d = diasFaltantes(c, hoy);
  if (v === "Vencido") return "Terminó. Registre una renovación o ciérrelo.";
  if (v === "Por vencer") return `Termina en ${d} días. Conviene renovarlo ahora.`;
  if (c.indefinido) return "Sin fecha de terminación: es indefinido.";
  if (d == null) return "Falta la fecha de terminación.";
  return `Termina en ${d} días.`;
}

/* ---------- Lectura del Excel ----------------------------------------------- */

const mayus = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

export function normEstado(raw: string): string {
  const k = limpio(raw).toLowerCase();
  if (!k) return "";
  if (k.startsWith("pendiente")) return "Pendiente firma";
  if (k === "por vencer") return "Por vencer";
  if (k === "revisar") return "En revisión";
  return mayus(k);
}

function normTipo(raw: string): Tipo {
  const k = normalizar(raw);
  if (!k) return "Sin tipo";
  if (k === "marco") return "Marco";
  if (k === "especifico") return "Específico";
  return "Otro";
}

function normCampus(raw: string): string {
  const t = limpio(raw);
  if (!t) return "Sin dato";
  if (/^todos|^todas/i.test(t)) return "Todos";
  if (/^n\/?a$|^en proceso$/i.test(t)) return "Sin dato";
  return t;
}

/** Fecha de calendario real y en un rango razonable (rechaza «29/02/2027» y años como 3031). */
function fechaReal(a: number, m: number, d: number): string | null {
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(a, m, 0)).getUTCDate()) return null;
  return `${a}-${pad2(m)}-${pad2(d)}`;
}

/** «AAAA-MM-DD» o «DD/MM/AAAA» (también «MM/DD/AAAA» cuando el primer número no puede ser mes); si no se entiende o no existe, nulo. */
function leerFecha(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return fechaReal(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) {
    const p = Number(m[1]), q = Number(m[2]), a = Number(m[3]);
    // Colombia escribe día/mes; si el segundo número no cabe como mes pero el primero sí, viene en mes/día.
    return q > 12 && p <= 12 ? fechaReal(a, p, q) : fechaReal(a, q, p);
  }
  return null;
}

/** Cómo se lee cada columna: el encabezado del Excel, el campo del módulo y la regla (para la tabla de la pantalla). */
const COLUMNAS: { campo: string; patron: RegExp; modulo: string; regla: string }[] = [
  { campo: "codigo", patron: /^codigo/, modulo: "Código", regla: "clave del registro, en minúsculas" },
  { campo: "documento", patron: /^documento/, modulo: "Documento", regla: "lista" },
  { campo: "pais", patron: /^pais/, modulo: "País", regla: "nombre del mapa; varios países juntos" },
  { campo: "institucion", patron: /^nombre de la institucion|^institucion/, modulo: "Institución", regla: "texto" },
  { campo: "naturaleza", patron: /^naturaleza/, modulo: "Naturaleza", regla: "nacional o internacional" },
  { campo: "objeto", patron: /^objeto/, modulo: "Objeto", regla: "texto" },
  { campo: "tipo", patron: /^tipo/, modulo: "Tipo", regla: "Marco, Específico, Otro o Sin tipo" },
  { campo: "modalidad", patron: /^modalidad/, modulo: "Modalidad", regla: "texto, con tildes corregidas" },
  { campo: "firma", patron: /^fecha de firma|^fecha de inicio/, modulo: "Firma", regla: "fecha" },
  { campo: "termina", patron: /^fecha de terminacion/, modulo: "Terminación", regla: "fecha o «Indefinido»" },
  { campo: "estado", patron: /^estado/, modulo: "Etapa (y estado del Excel)", regla: "la etapa se lee; la vigencia se calcula por fechas" },
  { campo: "renovacion", patron: /^renovacion/, modulo: "Renovación", regla: "lista" },
  { campo: "campus", patron: /^campus/, modulo: "Campus", regla: "«Todos» o el campus" },
  { campo: "facultad", patron: /^facultad/, modulo: "Facultad", regla: "texto" },
  { campo: "programas", patron: /^programas/, modulo: "Programas", regla: "texto" },
  { campo: "observaciones", patron: /^observaciones/, modulo: "Observaciones", regla: "texto" },
  { campo: "enlace", patron: /^enlace/, modulo: "Carpeta digital", regla: "enlace https de la carpeta" },
];
const IGNORADAS = [/^duracion/, /^dias faltantes/, /^fecha de relacion/];

export interface ColumnaLeida {
  encabezado: string;
  modulo: string;
  regla: string;
}

export interface InformeLectura {
  filas: ConvenioNuevo[];
  /** Filas con datos pero sin código: no se importan. */
  sinCodigo: number;
  /** Códigos que aparecen más de una vez en el archivo: se importa la primera fila. */
  repetidos: { codigo: string; institucion: string }[];
  columnas: ColumnaLeida[];
  cuentas: {
    estado: number;
    tipo: number;
    modalidad: number;
    campus: number;
    pais: number;
    documento: number;
    desajuste: number;
    sinFecha: number;
    sinTipo: number;
    sinEnlace: number;
    variosPaises: number;
    sinPais: number;
  };
}

export class ErrorLectura extends Error {}

/** Lee la matriz de la hoja (primera fila = encabezados, todo texto) y devuelve los convenios normalizados y el informe. */
export function leerConvenios(matriz: readonly (readonly string[])[], hoy = hoyBogota()): InformeLectura {
  const encabezados = (matriz[0] ?? []).map((h) => normalizar(h ?? ""));
  const col: Record<string, number> = {};
  const columnas: ColumnaLeida[] = [];
  (matriz[0] ?? []).forEach((h, i) => {
    const k = encabezados[i];
    if (!k) return;
    const def = COLUMNAS.find((c) => c.patron.test(k) && col[c.campo] === undefined);
    if (def) {
      col[def.campo] = i;
      columnas.push({ encabezado: limpio(h), modulo: def.modulo, regla: def.regla });
    } else if (IGNORADAS.some((p) => p.test(k))) {
      columnas.push({ encabezado: limpio(h), modulo: "(se calcula)", regla: "ya no se escribe a mano" });
    }
  });
  if (col.codigo === undefined || col.institucion === undefined) {
    throw new ErrorLectura("No se encontraron las columnas «Código» y «Nombre de la Institución». Compruebe que la primera fila del archivo traiga los encabezados del Excel institucional.");
  }
  const dato = (fila: readonly string[], campo: string): string => (col[campo] === undefined ? "" : (fila[col[campo]] ?? ""));

  const cuentas = { estado: 0, tipo: 0, modalidad: 0, campus: 0, pais: 0, documento: 0, desajuste: 0, sinFecha: 0, sinTipo: 0, sinEnlace: 0, variosPaises: 0, sinPais: 0 };
  const vistos = new Set<string>();
  const filas: ConvenioNuevo[] = [];
  const repetidos: InformeLectura["repetidos"] = [];
  let sinCodigo = 0;

  for (let i = 1; i < matriz.length; i++) {
    const f = matriz[i];
    if (!f || f.every((x) => !limpio(x ?? ""))) continue;
    const codigo = limpio(dato(f, "codigo")).toLowerCase();
    if (!codigo) {
      sinCodigo++;
      continue;
    }
    const institucion = limpio(dato(f, "institucion")) || "Sin institución";
    if (vistos.has(codigo)) {
      repetidos.push({ codigo, institucion });
      continue;
    }
    vistos.add(codigo);

    const natRaw = limpio(dato(f, "naturaleza"));
    const natK = normalizar(natRaw);
    const naturaleza: Naturaleza = natK.startsWith("internacional") ? "Internacional" : natK.startsWith("nacional") || natK.startsWith("fund") ? "Nacional" : codigo.startsWith("cn-") ? "Nacional" : "Internacional";

    const paisRaw = dato(f, "pais");
    const p = leerPais(paisRaw);
    if (p.pais !== paisRaw) cuentas.pais++;
    if (p.pais === "Varios países") cuentas.variosPaises++;
    if (p.pais === "Sin país") cuentas.sinPais++;

    const docRaw = limpio(dato(f, "documento"));
    const documento = !docRaw ? "Convenio" : docRaw.toLowerCase() === "convenio" ? "Convenio" : mayus(docRaw);
    if (documento !== dato(f, "documento")) cuentas.documento++;

    const tipoRaw = limpio(dato(f, "tipo"));
    const tipo = normTipo(tipoRaw);
    if (tipo !== tipoRaw) cuentas.tipo++;
    if (tipo === "Sin tipo") cuentas.sinTipo++;

    const modRaw = dato(f, "modalidad");
    const modalidad = limpio(modRaw).replace(/Cooperacion/g, "Cooperación").replace(/Acádemica/g, "Académica");
    if (modalidad !== modRaw) cuentas.modalidad++;

    const campRaw = dato(f, "campus");
    const campus = normCampus(campRaw);
    if (campus !== campRaw) cuentas.campus++;

    const estRaw = dato(f, "estado");
    const estado = normEstado(estRaw);
    if (estado !== estRaw) cuentas.estado++;
    const pasos = estado === "Pendiente firma" ? 3 : estado === "En revisión" ? 2 : estado === "En proceso" ? 1 : 5;

    const firma = leerFecha(dato(f, "firma"));
    const terminaRaw = limpio(dato(f, "termina"));
    const indefinido = /^indefinid|^permanente/i.test(terminaRaw);
    const termina = indefinido ? null : leerFecha(terminaRaw);
    if (!termina && !indefinido) cuentas.sinFecha++;

    const enlace = limpio(dato(f, "enlace"));
    const carpeta_url = ENLACE_VALIDO.test(enlace) ? enlace : null;
    if (!carpeta_url) cuentas.sinEnlace++;

    const fila: ConvenioNuevo = {
      codigo,
      documento,
      naturaleza,
      institucion,
      pais: p.pais,
      pais_cod: p.cod,
      objeto: limpio(dato(f, "objeto")),
      tipo,
      tipo_excel: tipoRaw,
      modalidad,
      fecha_firma: firma,
      fecha_terminacion: termina,
      indefinido,
      renovacion: limpio(dato(f, "renovacion")),
      campus,
      facultad: limpio(dato(f, "facultad")),
      programas: limpio(dato(f, "programas")),
      observaciones: limpio(dato(f, "observaciones")),
      carpeta_estado: carpeta_url ? "enlace" : "sin",
      carpeta_url,
      pasos,
      pasos_fechas: [null, null, null, null, null],
      estado_excel: estado || null,
      origen: "excel",
    };
    if (desajustado({ ...fila, cerrado: false }, hoy)) cuentas.desajuste++;
    filas.push(fila);
  }
  return { filas, sinCodigo, repetidos, columnas, cuentas };
}

/* ---------- Exportar --------------------------------------------------------- */

export const ENCABEZADOS_EXPORTACION = ["Código", "Documento", "Naturaleza", "Institución", "País", "Objeto", "Tipo", "Modalidad", "Firma", "Terminación", "Días faltantes", "Estado", "Etapa", "Renovación", "Campus", "Facultad", "Programas", "Observaciones", "Carpeta digital"];
export const ANCHOS_EXPORTACION = [12, 18, 14, 40, 16, 50, 11, 26, 12, 12, 10, 14, 15, 18, 14, 28, 28, 36, 40];

export function filaDeExportacion(c: Convenio, hoy = hoyBogota()): string[] {
  const d = diasFaltantes(c, hoy);
  return [
    c.codigo,
    c.documento,
    c.naturaleza,
    c.institucion,
    c.pais,
    c.objeto,
    c.tipo,
    c.modalidad,
    c.fecha_firma ?? "",
    c.indefinido ? "Indefinido" : (c.fecha_terminacion ?? ""),
    d == null ? "" : String(d),
    vigenciaDe(c, hoy),
    etapaDe(c),
    c.renovacion,
    c.campus,
    c.facultad,
    c.programas,
    c.observaciones,
    c.carpeta_url ?? "",
  ];
}
