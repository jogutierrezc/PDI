/* =============================================================================
   Libro de la Rendición de Cuentas · modelo (lógica pura).

   El libro se arma con los aportes y las cifras de la encuesta de Rendición de
   Cuentas (enc_aportes y enc_cifras, solo totales y cifras por dependencia: nunca
   correos ni datos personales). Aquí viven la configuración que se guarda
   (enc_libros.config), el cálculo de los totales y los textos de plantilla que
   se usan mientras Pilo no redacta o cuando la IA no está disponible.
   ========================================================================== */

import type { Aporte, EstadoAporte, TipoCifra } from "../tipos";

export type IdModulo = "presentacion" | "cifras" | "destacados" | "dependencias" | "retos" | "ods" | "foco" | "compromisos";
export type IdPagina = "portada" | IdModulo | "notas" | "contra";
export type Paleta = "azul" | "verde" | "grafito";
export type Formato = "carta" | "a4";
export type Vista = "doble" | "hoja";
export type FiltroEstado = "video" | "rev" | "todo";

export const MODULOS: readonly { id: IdModulo; nombre: string }[] = [
  { id: "presentacion", nombre: "Presentación" },
  { id: "cifras", nombre: "El año en cifras" },
  { id: "destacados", nombre: "Logros destacados" },
  { id: "dependencias", nombre: "Logros y retos por dependencia" },
  { id: "retos", nombre: "Retos" },
  { id: "ods", nombre: "Aportes por ODS" },
  { id: "foco", nombre: "Dependencias en resumen" },
  { id: "compromisos", nombre: "Lo que sigue" },
];
export const nombreModulo = (id: IdModulo) => MODULOS.find((m) => m.id === id)?.nombre ?? id;
export const nombrePagina = (id: IdPagina): string => (id === "portada" ? "Portada" : id === "contra" ? "Contraportada" : id === "notas" ? "Notas" : nombreModulo(id));

export const PALETAS: readonly { id: Paleta; nombre: string; muestra: string }[] = [
  { id: "azul", nombre: "Azul UDES", muestra: "#0a2d63" },
  { id: "verde", nombre: "Verde sostenible", muestra: "#0b3d2e" },
  { id: "grafito", nombre: "Grafito", muestra: "#1b2430" },
];

export const FORMATOS: Record<Formato, { nombre: string; ancho: number; alto: number }> = {
  carta: { nombre: "Carta", ancho: 215.9, alto: 279.4 },
  a4: { nombre: "A4", ancho: 210, alto: 297 },
};

/** Recomendación visible: el libro cabe en 5 a 10 páginas, pero el contenido manda (no se recorta). */
export const MIN_PAGINAS = 5;
export const MAX_PAGINAS = 10;
const MIN_MODULOS = 3;
/** Un texto de página es de una o dos frases. */
export const MAX_TEXTO = 320;
export const MAX_MODULOS = 8;

/** Los textos de página: el que escribió una persona o Pilo (editado = true protege lo de la persona). */
export interface TextoPagina {
  t: string;
  editado: boolean;
}

export interface ConfigLibro {
  v: 1;
  formato: Formato;
  vista: Vista;
  folios: boolean;
  /** Orden de todos los módulos y cuáles van. */
  orden: IdModulo[];
  activas: IdModulo[];
  portada: { composicion: 1 | 2 | 3; paleta: Paleta; titulo: string; subtitulo: string; fecha: string; imagen: string | null; contraImagen: string | null };
  estado: FiltroEstado;
  /** Dependencias que NO entran (por defecto entran todas). */
  excluidas: string[];
  /** Dependencias del módulo «Dependencias en resumen»: null = todas las que tengan aportes. */
  resumen: string[] | null;
  largo: 1 | 2;
  tono: "i" | "c";
  textos: Record<string, TextoPagina>;
  /** ODS que Pilo asignó a cada aporte (id del aporte → números 1 a 17). */
  ods: Record<string, number[]>;
  /** Sangrado de 3 mm al imprimir. */
  sangrado: boolean;
}

export const CONFIG_INICIAL: ConfigLibro = {
  v: 1,
  formato: "carta",
  vista: "doble",
  folios: true,
  orden: MODULOS.map((m) => m.id),
  activas: ["presentacion", "cifras", "destacados", "dependencias", "retos", "ods"],
  portada: { composicion: 1, paleta: "azul", titulo: "Construyamos juntos", subtitulo: "Logros y retos de la UDES en cifras", fecha: "Rendición de Cuentas Institucional 2026", imagen: null, contraImagen: null },
  estado: "video",
  excluidas: [],
  resumen: null,
  largo: 1,
  tono: "i",
  textos: {},
  ods: {},
  sangrado: false,
};

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const txt = (x: unknown, max: number, d: string) => (typeof x === "string" ? x.slice(0, max) : d);

/** Lee lo guardado con cuidado: lo que falte o venga mal toma el valor de partida. */
export function leerConfigLibro(raw: unknown): ConfigLibro {
  const b = CONFIG_INICIAL;
  if (!esObj(raw)) return { ...b, portada: { ...b.portada } };
  const ids = MODULOS.map((m) => m.id);
  const orden = Array.isArray(raw.orden) ? (raw.orden as unknown[]).filter((x): x is IdModulo => ids.includes(x as IdModulo)) : [];
  for (const id of ids) if (!orden.includes(id)) orden.push(id);
  let activas = Array.isArray(raw.activas) ? (raw.activas as unknown[]).filter((x): x is IdModulo => ids.includes(x as IdModulo)) : b.activas;
  activas = [...new Set(activas)].slice(0, MAX_MODULOS);
  if (activas.length < MIN_MODULOS) activas = b.activas;
  const p = esObj(raw.portada) ? raw.portada : {};
  const textos: Record<string, TextoPagina> = {};
  if (esObj(raw.textos)) for (const [k, v] of Object.entries(raw.textos)) if (esObj(v) && typeof v.t === "string") textos[k.slice(0, 30)] = { t: v.t.slice(0, MAX_TEXTO), editado: v.editado === true };
  const ods: Record<string, number[]> = {};
  if (esObj(raw.ods)) for (const [k, v] of Object.entries(raw.ods)) if (Array.isArray(v)) ods[k] = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 17))].slice(0, 3);
  return {
    v: 1,
    formato: raw.formato === "a4" ? "a4" : "carta",
    vista: raw.vista === "hoja" ? "hoja" : "doble",
    folios: raw.folios !== false,
    orden,
    activas,
    portada: {
      composicion: p.composicion === 2 || p.composicion === 3 ? p.composicion : 1,
      paleta: p.paleta === "verde" || p.paleta === "grafito" ? p.paleta : "azul",
      titulo: txt(p.titulo, 60, b.portada.titulo),
      subtitulo: txt(p.subtitulo, 90, b.portada.subtitulo),
      fecha: txt(p.fecha, 80, b.portada.fecha),
      imagen: typeof p.imagen === "string" && p.imagen ? p.imagen.slice(0, 200) : null,
      contraImagen: typeof p.contraImagen === "string" && p.contraImagen ? p.contraImagen.slice(0, 200) : null,
    },
    estado: raw.estado === "rev" || raw.estado === "todo" ? raw.estado : "video",
    excluidas: Array.isArray(raw.excluidas) ? (raw.excluidas as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [],
    resumen: Array.isArray(raw.resumen) ? (raw.resumen as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : null,
    largo: raw.largo === 2 ? 2 : 1,
    tono: raw.tono === "c" ? "c" : "i",
    textos,
    ods,
    sangrado: raw.sangrado === true,
  };
}

/* ---------- paginación ----------
   Cada lista larga se reparte en páginas de continuación con un cálculo determinista: la altura
   de cada fila está fija en la hoja de estilos (libro.css) y aquí se cuenta cuántas caben. Las
   medidas están en «u» (1 % del ancho de la hoja), igual que el CSS. Si se cambia una altura en
   un lado hay que cambiarla en el otro. */

/** Alto de la hoja en u. */
export const altoU = (f: Formato): number => (100 * FORMATOS[f].alto) / FORMATOS[f].ancho;
export const MEDIDAS = {
  /** margen superior e inferior de la hoja */
  arriba: 6,
  abajo: 8,
  /** encabezado, título, texto de Pilo, leyenda y hueco entre bloques */
  hd: 4.2,
  ttl: 5.1,
  nar: 7.2,
  leg: 2.4,
  gap: 2.8,
  /** colchón contra redondeos de la fuente */
  colchon: 1.5,
  /** retos: ficha destacada (2 por fila) y fila de lista */
  ficha: 14.2,
  fichaGap: 1.8,
  fila: 5,
  /** logros destacados: una fila por logro */
  feat: 11.5,
  /** dependencias: fila del gráfico de barras y fila de la tabla de cifras; títulos y encabezado de la tabla */
  dvFila: 3.5,
  heatFila: 2.9,
  dvFijo: 12.6,
  /** dependencias en resumen: una ficha por dependencia */
  resFila: 7.6,
} as const;

/** Alto libre (u) para el cuerpo de una página de lista: con o sin el texto de Pilo de la primera página. */
export function altoLibre(f: Formato, primera: boolean): number {
  const m = MEDIDAS;
  const bloques = primera ? 5 : 4;
  return altoU(f) - m.arriba - m.abajo - m.hd - m.ttl - m.leg - (primera ? m.nar : 0) - (bloques - 1) * m.gap - m.colchon;
}

export interface Pag {
  id: IdPagina;
  /** Número de parte (1 = la primera) y total de partes del módulo. */
  parte: number;
  partes: number;
  /** Elementos de la lista que van en esta página: de `desde` (incluido) a `hasta` (excluido). */
  desde: number;
  hasta: number;
}

/** Reparte n elementos en páginas: la primera con capacidad `c1` y las demás con `c2`. */
export function repartir(n: number, c1: number, c2: number): [number, number][] {
  const c = [Math.max(1, Math.floor(c1)), Math.max(1, Math.floor(c2))];
  const r: [number, number][] = [];
  let i = 0;
  do {
    const cap = r.length === 0 ? c[0] : c[1];
    r.push([i, Math.min(n, i + cap)]);
    i += cap;
  } while (i < n);
  return r;
}

/** Los retos que van como ficha destacada en la primera página. */
export const FICHAS_RETOS = 4;
export const CIFRAS_RESUMEN = 3;

export function dependenciasResumen(c: Calculo, cfg: ConfigLibro): string[] {
  return cfg.resumen ? c.deps.filter((d) => cfg.resumen!.some((x) => claveDep(x) === claveDep(d))) : c.deps;
}

/** Cuántos elementos caben por página en cada módulo con lista. */
export function capacidades(f: Formato): Record<"retos" | "dependencias" | "foco", [number, number]> & { destacados: number } {
  const m = MEDIDAS;
  const l1 = altoLibre(f, true);
  const l2 = altoLibre(f, false);
  const fichasAlto = 2 * m.ficha + m.fichaGap;
  return {
    destacados: Math.max(3, Math.floor(l1 / m.feat)),
    retos: [FICHAS_RETOS + Math.max(1, Math.floor((l1 - fichasAlto - m.gap) / m.fila)), Math.floor(l2 / m.fila)],
    dependencias: [Math.floor((l1 - m.dvFijo) / (m.dvFila + m.heatFila)), Math.floor((l2 - m.dvFijo) / (m.dvFila + m.heatFila))],
    foco: [Math.floor(l1 / m.resFila), Math.floor(l2 / m.resFila)],
  };
}

/** Las páginas del libro, en orden de lectura: portada, módulos activos (con sus continuaciones), notas si hace falta y contraportada. Siempre un total par. */
export function paginasDe(cfg: ConfigLibro, c: Calculo): Pag[] {
  const cap = capacidades(cfg.formato);
  const una = (id: IdPagina): Pag => ({ id, parte: 1, partes: 1, desde: 0, hasta: 0 });
  const partes = (id: IdPagina, n: number, [c1, c2]: [number, number]): Pag[] => {
    const r = repartir(n, c1, c2);
    return r.map(([desde, hasta], i) => ({ id, parte: i + 1, partes: r.length, desde, hasta }));
  };
  const p: Pag[] = [una("portada")];
  for (const id of cfg.orden.filter((x) => cfg.activas.includes(x))) {
    if (id === "retos") p.push(...partes(id, c.R.length, cap.retos));
    else if (id === "dependencias") p.push(...partes(id, c.deps.length, cap.dependencias));
    else if (id === "foco") p.push(...partes(id, dependenciasResumen(c, cfg).length, cap.foco));
    else p.push(una(id));
  }
  if ((p.length + 1) % 2 === 1) p.push(una("notas"));
  p.push(una("contra"));
  return p;
}

/** Los pares de páginas que se ven a la vez. Con -1 = hoja en blanco (portada a la derecha, contraportada a la izquierda). */
export function pliegos(total: number, vista: Vista): [number, number][] {
  if (vista === "hoja") return Array.from({ length: total }, (_, i) => [i, -1] as [number, number]);
  const s: [number, number][] = [[-1, 0]];
  for (let i = 1; i < total - 1; i += 2) s.push([i, i + 1]);
  s.push([total - 1, -1]);
  return s;
}

/* ---------- los datos ---------- */

export interface Cif {
  tipo: TipoCifra;
  v: number;
  /** Qué mide, como lo escribió la dependencia («Estudiantes con acceso»). */
  q: string;
}
export interface Fila {
  id: string;
  dep: string;
  t: "L" | "R";
  e: EstadoAporte;
  ti: string;
  de: string;
  c: Cif[];
  o: number[];
}

export const TIPOS_LIBRO: readonly { id: TipoCifra; nombre: string; corto: string }[] = [
  { id: "estudiantes", nombre: "Estudiantes", corto: "Estudiantes" },
  { id: "programas", nombre: "Programas", corto: "Programas" },
  { id: "porcentaje", nombre: "Porcentaje", corto: "Porcentaje" },
  { id: "dinero", nombre: "Dinero", corto: "Dinero" },
  { id: "otro", nombre: "Otras cifras", corto: "Otras" },
];

/** Nombre corto de una dependencia para los gráficos. */
export function cortoDe(dep: string): string {
  const s = dep
    .replace(/^(facultad|dirección|direccion|oficina|vicerrectoría|vicerrectoria|centro|departamento|programa|escuela)\s+(de\s+(las?\s+|los\s+)?|del\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const u = s.charAt(0).toUpperCase() + s.slice(1);
  return u.length > 16 ? `${u.slice(0, 15).trim()}.` : u || dep.slice(0, 16);
}

const sinTilde = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** La clave con la que se reconoce una dependencia: sin tildes, sin mayúsculas, sin signos ni espacios de más. */
export const claveDep = (d: string): string =>
  sinTilde(d)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "con", "a", "o", "u"]);
/** Palabras de nombres de oficinas que llevan tilde (se escriben sin ella en los datos). */
const CON_TILDE: Record<string, string> = Object.fromEntries(
  [
    "Vicerrectoría", "Rectoría", "Dirección", "Coordinación", "Administración", "Planeación", "Comunicación", "Comunicaciones", "Educación", "Información", "Tecnología", "Tecnologías",
    "Gestión", "Académica", "Académico", "Investigación", "Internacionalización", "Extensión", "Proyección", "Evaluación", "Autoevaluación", "Acreditación", "Admisión", "Psicología", "Pedagogía",
    "Biología", "Química", "Física", "Matemáticas", "Nutrición", "Enfermería", "Odontología", "Ingeniería", "Ingenierías", "Económicas", "Económica", "Jurídicas", "Jurídica", "Políticas", "Política",
    "Pública", "Públicas", "Relación", "Relaciones", "Secretaría", "Auditoría", "Tesorería", "Contraloría", "Bogotá", "Cúcuta", "Géneros", "Género", "Inclusión", "Innovación", "Formación", "Atención", "Graduación",
    "Egresados", "Teología", "Filosofía", "Geología", "Sociología", "Antropología", "Metodología", "Comunicación", "Gerontología", "Fonoaudiología", "Kinesiología", "Terapia", "Música", "Ética", "Estadística", "Logística",
    "Mercadeo", "Cultura", "Cátedra", "Pastoral", "Análisis", "Sostenibilidad", "Bioética", "Bioética", "Cooperación", "Convenios", "Movilidad", "Educación",
  ].map((w) => [sinTilde(w).toLowerCase(), w]),
);
/** Un nombre de oficina con formato único: «VICERRECTORIA DE POSGRADOS» → «Vicerrectoría de Posgrados». */
export function canonDep(d: string): string {
  const limpio = d.replace(/\s+/g, " ").trim();
  return limpio
    .split(" ")
    .map((w, i) => {
      const k = sinTilde(w).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (CON_TILDE[k]) return w.replace(/[A-Za-zÀ-ÿ]+/, CON_TILDE[k]);
      if (i > 0 && PARTICULAS.has(k)) return w.toLowerCase();
      const mayus = w === w.toUpperCase();
      const minus = w === w.toLowerCase();
      if (mayus && w.length <= 4 && /^[A-ZÁÉÍÓÚÑ0-9]+$/.test(w) && !PARTICULAS.has(k)) return w; // siglas (UDES, TIC)
      if (mayus || minus) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w;
    })
    .join(" ");
}

/** Las dependencias distintas de los aportes: las variantes de un mismo nombre cuentan como una sola. */
export function dependenciasDe(aportes: Aporte[]): string[] {
  const vistas = new Map<string, string>();
  for (const a of aportes) {
    const k = claveDep(a.dependencia);
    if (k && !vistas.has(k)) vistas.set(k, canonDep(a.dependencia));
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "es"));
}

const normDep = canonDep;

export function filasDe(aportes: Aporte[], cfg: ConfigLibro): Fila[] {
  const fuera = new Set(cfg.excluidas.map(claveDep));
  return aportes
    .filter((a) => {
      if (fuera.has(claveDep(a.dependencia))) return false;
      if (a.estado === "rechazado" || a.estado === "descartado") return false;
      if (cfg.estado === "video") return a.estado === "para_video";
      if (cfg.estado === "rev") return a.estado === "revisado" || a.estado === "para_video";
      return true;
    })
    .map((a) => ({
      id: a.id,
      dep: normDep(a.dependencia),
      t: a.tipo === "logro" ? ("L" as const) : ("R" as const),
      e: a.estado,
      ti: a.titulo,
      de: a.descripcion,
      c: [...a.cifras].sort((x, y) => x.orden - y.orden).map((c) => ({ tipo: c.tipo, v: Number(c.valor), q: c.tipo === "otro" && c.otro ? `${c.que} (${c.otro})` : c.que })),
      o: cfg.ods[a.id] ?? [],
    }));
}

export interface PorDep {
  L: number;
  R: number;
  t: Record<TipoCifra, number>;
}
export interface Calculo {
  r: Fila[];
  L: Fila[];
  R: Fila[];
  /** Estudiantes, programas e inversión (COP) de los logros. */
  est: number;
  prog: number;
  din: number;
  nc: number;
  nd: number;
  tipo: Record<TipoCifra, number>;
  byDep: Record<string, PorDep>;
  /** Dependencias con aportes, en el orden alfabético de la encuesta. */
  deps: string[];
  ods: Record<number, { L: number; R: number }>;
  clasificados: number;
}

const ceroTipos = (): Record<TipoCifra, number> => ({ estudiantes: 0, programas: 0, porcentaje: 0, dinero: 0, otro: 0 });

export function calcular(filas: Fila[]): Calculo {
  const s: Calculo = { r: filas, L: filas.filter((a) => a.t === "L"), R: filas.filter((a) => a.t === "R"), est: 0, prog: 0, din: 0, nc: 0, nd: 0, tipo: ceroTipos(), byDep: {}, deps: [], ods: {}, clasificados: 0 };
  for (const a of filas) {
    const b = (s.byDep[a.dep] ??= { L: 0, R: 0, t: ceroTipos() });
    b[a.t === "L" ? "L" : "R"]++;
    for (const c of a.c) {
      s.nc++;
      s.tipo[c.tipo]++;
      b.t[c.tipo]++;
      if (a.t === "L") {
        if (c.tipo === "estudiantes") s.est += c.v;
        if (c.tipo === "programas") s.prog += c.v;
        if (c.tipo === "dinero") s.din += c.v;
      }
    }
    if (a.o.length) s.clasificados++;
    for (const o of a.o) (s.ods[o] ??= { L: 0, R: 0 })[a.t]++;
  }
  s.deps = Object.keys(s.byDep).sort((a, b) => a.localeCompare(b, "es"));
  s.nd = s.deps.length;
  return s;
}

/* ---------- formato ---------- */

export const fmtN = (n: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(n);
/** Dinero en pesos: desde un millón se dice en millones («$480 millones»). Es la forma que ve el lector y la que recibe Pilo. */
export const fmtDinero = (v: number): string => (v >= 1_000_000_000 ? `$${fmtN(Math.round(v / 1e8) / 10)} miles de millones` : v >= 1_000_000 ? `$${fmtN(Math.round(v / 1_000_000))} millones` : `$${fmtN(v)}`);
/** Solo la cifra del dinero, sin la palabra («$480»): para números grandes con la unidad aparte. */
export const fmtDineroNum = (v: number): string => (v >= 1_000_000_000 ? `$${fmtN(Math.round(v / 1e8) / 10)}` : v >= 1_000_000 ? `$${fmtN(Math.round(v / 1_000_000))}` : `$${fmtN(v)}`);
/** La unidad que se escribe debajo de la cifra de dinero. */
export const unidadDinero = (v: number): string => (v >= 1_000_000_000 ? "miles de millones de pesos" : v >= 1_000_000 ? "millones de pesos" : "pesos");
/** Recorta con puntos suspensivos a un máximo de caracteres, sin cortar una palabra. */
export function recortar(t: string, max: number): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const e = corte.lastIndexOf(" ");
  return `${(e > max * 0.6 ? corte.slice(0, e) : corte).replace(/[\s,.;:]+$/, "")}…`;
}
export const valorDe = (c: Cif): string => (c.tipo === "porcentaje" ? `${fmtN(c.v)} %` : c.tipo === "dinero" ? fmtDinero(c.v) : fmtN(c.v));
export const principal = (a: Fila): Cif | undefined => a.c.find((c) => c.tipo === "estudiantes") ?? a.c[0];

export function topLogros(c: Calculo, n = 3): Fila[] {
  const peso = (a: Fila) => {
    const f = principal(a);
    return f ? (f.tipo === "estudiantes" ? f.v : f.v * 0.01) : 0;
  };
  return c.L.slice().sort((a, b) => peso(b) - peso(a)).slice(0, n);
}
export const odsPrincipales = (c: Calculo, n = 3): number[] =>
  Object.keys(c.ods).map(Number).sort((a, b) => c.ods[b].L + c.ods[b].R - (c.ods[a].L + c.ods[a].R) || a - b).slice(0, n);

/* ---------- los textos ---------- */

export const CLAVES_TEXTO: readonly IdPagina[] = ["presentacion", "cifras", "destacados", "dependencias", "retos", "ods", "foco", "compromisos", "contra"];
const tieneTexto = (id: IdPagina) => CLAVES_TEXTO.includes(id);
export const paginaTieneTexto = tieneTexto;

export interface DatoPagina {
  etiqueta: string;
  texto: string;
  numero: number;
}

/** Los datos que sostienen el texto de una página: los mismos van a Pilo y a la plantilla. */
export function datosDePagina(id: IdPagina, c: Calculo, cfg: ConfigLibro): DatoPagina[] {
  const d = (etiqueta: string, numero: number, texto = fmtN(numero)): DatoPagina => ({ etiqueta, numero, texto });
  switch (id) {
    case "presentacion":
      return [d("Dependencias con aportes", c.nd), d("Logros", c.L.length), d("Retos", c.R.length), d("Estudiantes alcanzados por los logros", c.est), d("Programas y proyectos de los logros", c.prog), ...(c.din > 0 ? [d("Inversión de los logros", c.din, fmtDinero(c.din))] : [])];
    case "cifras":
      return [d("Aportes recibidos", c.r.length), d("Cifras reportadas", c.nc), d("Logros", c.L.length), d("Retos", c.R.length), ...(c.din > 0 ? [d("Inversión de los logros", c.din, fmtDinero(c.din))] : []), d("Estudiantes alcanzados por los logros", c.est), d("Programas y proyectos de los logros", c.prog)];
    case "destacados":
      return topLogros(c).flatMap((a) => {
        const f = principal(a);
        return f ? [d(`${a.ti}: ${f.q}`, f.v, valorDe(f))] : [];
      });
    case "dependencias":
      return c.deps.slice(0, 8).flatMap((x) => [d(`Logros de ${cortoDe(x)}`, c.byDep[x].L), d(`Retos de ${cortoDe(x)}`, c.byDep[x].R)]);
    case "retos":
      return c.R.slice(0, 5).flatMap((a) => (a.c[0] ? [d(`${a.ti}: ${a.c[0].q}`, a.c[0].v, valorDe(a.c[0]))] : []));
    case "ods": {
      const top = odsPrincipales(c);
      return top.map((n) => d(`Aportes del ODS ${n}`, c.ods[n].L + c.ods[n].R));
    }
    case "foco": {
      const ds = dependenciasResumen(c, cfg);
      const top = ds.slice().sort((x, y) => c.byDep[y].L + c.byDep[y].R - (c.byDep[x].L + c.byDep[x].R)).slice(0, 3);
      return [d("Dependencias en el resumen", ds.length), ...top.map((x) => d(`Aportes de ${cortoDe(x)}`, c.byDep[x].L + c.byDep[x].R))];
    }
    case "compromisos":
      return [d("Retos convertidos en compromisos", Math.min(5, c.R.length)), d("Retos reportados", c.R.length)];
    case "contra":
      return [d("Aportes", c.r.length), d("Dependencias", c.nd)];
    default:
      return [];
  }
}


/** El texto de plantilla de una página (el que se usa mientras Pilo no redacte). */
export function plantilla(id: IdPagina, c: Calculo, cfg: ConfigLibro): string {
  const L = c.L.length;
  const R = c.R.length;
  const cer = cfg.tono === "c";
  const razon = R ? fmtN(Math.round((L / R) * 10) / 10) : null;
  const top = odsPrincipales(c);
  const P: Partial<Record<IdPagina, string[]>> = {
    presentacion: [
      cer ? `${c.nd} dependencias nos contaron ${L} logros y ${R} retos.` : `En este corte, ${c.nd} dependencias reportaron ${L} logros y ${R} retos.`,
      cer ? `Los logros llegan a ${fmtN(c.est)} estudiantes y a ${fmtN(c.prog)} programas y proyectos.` : `Los logros alcanzan a ${fmtN(c.est)} estudiantes y a ${fmtN(c.prog)} programas y proyectos.`,
    ],
    cifras: [
      `Recibimos ${c.r.length} aportes con ${c.nc} cifras: ${L} logros y ${R} retos.`,
      c.din > 0 ? `Los logros que reportan inversión suman ${fmtDinero(c.din)}.` : razon ? `Hay ${razon} logros por cada reto.` : "",
    ],
    destacados: ["Los logros que llegan a más personas.", "Cada cifra la reportó la dependencia."],
    dependencias: [
      `${c.nd} dependencias: a la izquierda lo conseguido, a la derecha lo que falta.`,
      "La tabla muestra el tipo de cifra que aportó cada una.",
    ],
    retos: [`${R} retos que piden más esfuerzo el próximo año.`, "Las cifras muestran la situación actual, no la meta."],
    ods: [
      top.length ? `Los aportes se concentran en los ODS ${top.join(", ")}.` : "Todavía no hay aportes clasificados por ODS. Pida a Pilo que los clasifique.",
      c.clasificados ? `${c.clasificados} de ${c.r.length} aportes quedaron clasificados.` : "",
    ],
    foco: [`${dependenciasResumen(c, cfg).length} dependencias, cada una con sus logros, retos y cifras más fuertes.`, "", ""],
    compromisos: [`Los primeros ${Math.min(12, R)} de ${R} retos, con una dependencia responsable.`, "Las fechas son una propuesta y cada dependencia las confirma."],
    contra: [cer ? `Gracias a las ${c.nd} dependencias que pusieron ${c.nc} cifras en este libro.` : `${c.nc} cifras de ${c.nd} dependencias de la UDES.`, "Sigamos construyendo juntos."],
  };
  return (P[id] ?? [""]).filter(Boolean).slice(0, cfg.largo === 1 ? 1 : 2).join(" ");
}

/** El texto que se ve: lo editado o redactado y guardado; si no, la plantilla. */
export const textoDe = (id: IdPagina, c: Calculo, cfg: ConfigLibro): string => cfg.textos[id]?.t || plantilla(id, c, cfg);

/** Quita los textos que no editó una persona (al cambiar filtros, tono o extensión, los de Pilo quedan viejos). */
export function sinTextosViejos(textos: Record<string, TextoPagina>): Record<string, TextoPagina> {
  return Object.fromEntries(Object.entries(textos).filter(([, v]) => v.editado));
}

/* ---------- ODS ---------- */

export const ODS: readonly { n: number; nombre: string; color: string }[] = [
  { n: 1, nombre: "Fin de la pobreza", color: "#E5243B" },
  { n: 2, nombre: "Hambre cero", color: "#DDA63A" },
  { n: 3, nombre: "Salud y bienestar", color: "#4C9F38" },
  { n: 4, nombre: "Educación de calidad", color: "#C5192D" },
  { n: 5, nombre: "Igualdad de género", color: "#FF3A21" },
  { n: 6, nombre: "Agua limpia", color: "#26BDE2" },
  { n: 7, nombre: "Energía asequible", color: "#B88A00" },
  { n: 8, nombre: "Trabajo decente", color: "#A21942" },
  { n: 9, nombre: "Industria e innovación", color: "#D9531A" },
  { n: 10, nombre: "Reducción de desigualdades", color: "#DD1367" },
  { n: 11, nombre: "Ciudades sostenibles", color: "#C77A0C" },
  { n: 12, nombre: "Producción responsable", color: "#BF8B2E" },
  { n: 13, nombre: "Acción por el clima", color: "#3F7E44" },
  { n: 14, nombre: "Vida submarina", color: "#0A97D9" },
  { n: 15, nombre: "Vida de ecosistemas", color: "#3E8E1F" },
  { n: 16, nombre: "Paz y justicia", color: "#00689D" },
  { n: 17, nombre: "Alianzas", color: "#19486A" },
];

/** Cuántas páginas tiene el libro y si pasa de la recomendación. */
export function resumenPaginas(paginas: Pag[]): { total: number; notas: boolean; largo: boolean } {
  return { total: paginas.length, notas: paginas.some((p) => p.id === "notas"), largo: paginas.length > MAX_PAGINAS };
}

/* ---------- datos de la página «Dependencias en resumen» ---------- */

export interface ResumenDep {
  dep: string;
  L: number;
  R: number;
  /** Hasta 3 cifras agregadas más fuertes: valor ya formateado y qué mide. */
  cifras: { v: string; q: string }[];
  /** El logro (o, si no hay, el reto) con la cifra más grande. */
  principal: { t: "L" | "R"; ti: string } | null;
}

export function resumenDe(c: Calculo, dep: string): ResumenDep {
  const fs = c.r.filter((a) => a.dep === dep);
  const sum = (tipo: TipoCifra) => fs.filter((a) => a.t === "L").reduce((t, a) => t + a.c.filter((x) => x.tipo === tipo).reduce((u, x) => u + x.v, 0), 0);
  const est = sum("estudiantes");
  const prog = sum("programas");
  const din = sum("dinero");
  const nc = fs.reduce((t, a) => t + a.c.length, 0);
  const cifras: { v: string; q: string }[] = [];
  if (est > 0) cifras.push({ v: fmtN(est), q: "estudiantes" });
  if (din > 0) cifras.push({ v: fmtDineroNum(din), q: `inversión, ${unidadDinero(din)}` });
  if (prog > 0) cifras.push({ v: fmtN(prog), q: "programas" });
  if (cifras.length < CIFRAS_RESUMEN) cifras.push({ v: fmtN(nc), q: "cifras" });
  const peso = (a: Fila) => {
    const f = principal(a);
    return f ? (f.tipo === "estudiantes" ? f.v : f.v * 0.01) : 0;
  };
  const mejor = (t: "L" | "R") => fs.filter((a) => a.t === t).sort((a, b) => peso(b) - peso(a))[0];
  const p = mejor("L") ?? mejor("R");
  const b = c.byDep[dep];
  return { dep, L: b?.L ?? 0, R: b?.R ?? 0, cifras: cifras.slice(0, CIFRAS_RESUMEN), principal: p ? { t: p.t, ti: p.ti } : null };
}
