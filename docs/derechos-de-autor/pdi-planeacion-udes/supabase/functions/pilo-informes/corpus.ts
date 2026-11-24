/* =============================================================================
   El corpus de Pilo (informe_ejemplos) · lógica pura, sin IA ni red.

     · clasificarSeccion   título y contenido → seccion_tipo, por reglas.
     · limpiarSeccion      descarta ruido (índices, portadas, instrucciones de
                           la plantilla, textos de ejemplo del formato 2025,
                           tablas rotas) y quita las frases copiadas del formato.
     · sustituirCifras     las cifras pasan a «[cifra]» y los años a «[año]»:
                           el corpus no guarda cifras de un año.
     · tokensAMarcadores   [[clave]] → «[cifra: etiqueta]» (lo aprobado).
     · prepararIngesta     todo lo anterior para «ingerir», con dedup por hash.
     · elegirEjemplos      2 a 4 ejemplos de la misma plantilla y tipo, por
                           palabras clave y recencia.
     · perfilEstilo        mediana de palabras, aperturas, conectores y frases
                           típicas por tipo (determinista).
   ========================================================================== */

import { inferirPlantilla, SECCION_TIPOS, type Plantilla, type SeccionTipo } from "./plantillas.ts";

export const MIN_PALABRAS = 25;
const MAX_PALABRAS_TROZO = 600;

export const contarPalabras = (t: string) => (String(t ?? "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Minúsculas, sin tildes, espacios simples. */
export const normalizar = (t: string) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Palabras normalizadas (sin marcadores ni signos). */
export const palabras = (t: string) => normalizar(t).replace(/\[[^\]]*\]/g, " ").match(/[a-z0-9ñ]+/g) ?? [];

/** SHA-256 del texto normalizado: dedup dentro de un envío (la base dedup por md5(texto)). */
export async function hashTexto(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(normalizar(texto));
  const h = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Cifras fuera ---------------------------------------------------- */

/** Las cifras escritas pasan a «[cifra]», los años a «[año]»; la numeración de listas se va. */
export function sustituirCifras(texto: string): string {
  return String(texto ?? "")
    .replace(/^[ \t]*\d{1,2}[.)](?=\s)/gm, "")
    .replace(/(?:\$\s?)?\d+(?:[.,]\d+)*(?:\s?%)?/g, (m) => (/^(19|20)\d{2}$/.test(m) ? "[año]" : "[cifra]"))
    .replace(/\[cifra\](?:\s*[-–]?\s*\[cifra\])+/g, "[cifra]")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Los tokens [[clave]] de un texto aprobado pasan a «[cifra: etiqueta]»; además, sin cifras a mano. */
export function tokensAMarcadores(texto: string, etiquetas: Map<string, string>): string {
  const sinTokens = String(texto ?? "").replace(/\[\[([A-Za-z0-9_.-]+)\]\]/g, (_m, clave: string) => {
    const e = (etiquetas.get(clave) ?? "").replace(/\d+/g, "").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
    return e ? `[cifra: ${e}]` : "[cifra]";
  });
  return sustituirCifras(sinTokens);
}

/* ---------- Clasificar ------------------------------------------------------ */

const POR_TITULO: [SeccionTipo, RegExp][] = [
  ["conclusiones", /conclusi|consideraciones finales|cierre|proyecciones|lecciones aprendidas/],
  ["presentacion", /presentacion|introduccion|carta del|mensaje del|palabras del/],
  ["resumen", /resumen|sintesis ejecutiva/],
  ["retos", /reto|oportunidad|puntos? critico|acciones de mejora|dificultad|desafio|limitacion/],
  ["logros", /logro|destacad|reconocimiento|innovador|excepcional/],
  ["metas", /objetivo|meta/],
  ["alineacion", /alineacion|plan de desarrollo|\bpdi\b|pilar|direccionamiento/],
  ["resultados", /resultado|gestion|indicador|dimension|investigacion|extension|docencia|ensenanza|financier|consolidado|funcion sustantiva|bienestar|internacionalizacion|calidad|academic|matricula/],
];

const POR_CONTENIDO: [SeccionTipo, RegExp][] = [
  ["conclusiones", /\ben conclusion\b|\bpara concluir\b|\bfinalmente\b|\bproximo periodo\b/g],
  ["retos", /\breto|\bdificultad|\boportunidad|\bmejora\b/g],
  ["logros", /\blogr[oó]|\bpremi|\breconocimiento|\bdestac/g],
  ["metas", /\bmeta\b|\bmetas\b|\bobjetivo/g],
  ["alineacion", /\bpilar|\bpdi\b|plan de desarrollo/g],
  ["resultados", /\bse realiz|\bse desarroll|\bresultado|\bse logr|\bse alcanz/g],
];

/** El tipo de sección por su título y, si el título no dice nada, por su contenido. */
export function clasificarSeccion(titulo: string, texto: string): SeccionTipo {
  const t = normalizar(titulo);
  for (const [tipo, re] of POR_TITULO) if (re.test(t)) return tipo;
  const c = normalizar(texto);
  let mejor: SeccionTipo = "otra";
  let max = 1; // al menos 2 señales
  for (const [tipo, re] of POR_CONTENIDO) {
    const n = (c.match(re) ?? []).length;
    if (n > max) [mejor, max] = [tipo, n];
  }
  return mejor;
}

/* ---------- Ruido ------------------------------------------------------------ */

/** Frases del formato 2025 (guía y ejemplos de la Vicerrectoría de Extensión) que algunas unidades copiaron. */
const HUELLAS_PLANTILLA = [
  "telecentro",
  "convenios internacionales habilitaron movilidad estudiantil por primera vez",
  "por que hacerlo",
  "porque hacerlo",
  "extension recomendada",
  "es la ventana principal del informe",
  "el resumen ejecutivo es una sintesis clara",
  "la alineacion estrategica es el espacio donde",
  "esta seccion describe los objetivos y metas especificas",
  "este apartado presenta los principales logros",
  "este apartado resalta los maximos logros",
  "este apartado expone y analiza las principales dificultades",
  "en este apartado se listan y describen",
  "las conclusiones sintetizan y valoran",
  "en los anexos se incluyen todos los documentos",
  "fortalecer la proyeccion social, tecnologica y academica de la vicerrectoria de extension",
  "plataforma de seguimiento para beneficiarios de programas sociales",
  "virtualizacion de las actividades en zonas rurales presento dificultades",
  "reduccion temporal de recursos financieros para ampliacion de cobertura",
  "dificultad para coordinar acciones interinstitucionales por diferencias en agendas",
  "fortalecer la colaboracion con el area de tic",
  "una revision mas frecuente del cronograma",
  "la participacion en redes internacionales puede facilitar el acceso a nuevos fondos",
  "replicar talleres de emprendimiento en otras facultades",
  "solicitar mejor dotacion tecnologica y buscar fondos externos",
  "formalizar una mesa de trabajo interareas",
  "demostro la capacidad institucional de adaptacion, innovacion y compromiso social",
  "lejos de limitar los objetivos",
  "ratifican el compromiso de la unidad con los pilares del pdi",
  "destacamos el aporte al pilar de apropiacion social",
  "cada anexo debe vincularse en el cuerpo del informe",
  "incluye anexos de registros, certificados, encuestas",
  "en caso de haber realizado ajustes durante el ano",
  "grado de satisfaccion de los beneficiarios subio",
  "redacta en parrafos cortos",
];

const INSTRUCCIONES = [/\bdescrib[ae]\b/, /\bdiligenci[ae]\b/, /\bincluy[ae]\b/, /\bse recomienda\b/, /\ben esta seccion\b/, /\beste apartado\b/, /\bdebe(?:n)? (?:incluir|expresar|comparar|hacerse)\b/, /\bmaximo \S+ paginas?\b/, /\bde \S+ a \S+ parrafos\b/, /\bejemplo:/];

/** Trozos de una sección: líneas y frases. */
const frases = (texto: string) =>
  String(texto ?? "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ•])/)
    .map((x) => x.replace(/^[\s•·\-–]+/, "").trim())
    .filter(Boolean);

const esDePlantilla = (frase: string) => {
  const n = normalizar(frase);
  return /^ejemplo de\b/.test(n) || HUELLAS_PLANTILLA.some((h) => n.includes(h));
};

export type Limpieza = { ok: true; texto: string; quitadas: number } | { ok: false; motivo: string };

/** ¿La sección sirve para el corpus? Si sirve, sin las frases copiadas del formato. */
export function limpiarSeccion(titulo: string, texto: string): Limpieza {
  const t = normalizar(titulo);
  const crudo = String(texto ?? "").replace(/\r\n?/g, "\n").trim();
  if (/^(indice|tabla de contenidos?|contenidos?)$/.test(t)) return { ok: false, motivo: "índice" };
  if (/^portada\b/.test(t)) return { ok: false, motivo: "portada" };
  if (/^anexos?\b|^evidencias?\b|fuentes de verificacion/.test(t)) return { ok: false, motivo: "lista de anexos o evidencias" };

  const lineas = crudo.split("\n").map((l) => l.trim()).filter(Boolean);
  const conPagina = lineas.filter((l) => /(\.{3,}|…{2,})\s*\d+\s*$/.test(l)).length;
  if (conPagina >= 3 || (lineas.length >= 4 && conPagina / lineas.length > 0.3)) return { ok: false, motivo: "índice" };

  const conBarras = lineas.filter((l) => (l.match(/\|/g) ?? []).length >= 2).length;
  const cortas = lineas.filter((l) => contarPalabras(l) <= 3).length;
  const letras = (crudo.match(/\p{L}/gu) ?? []).length;
  const digitos = (crudo.match(/\d/g) ?? []).length;
  if (conBarras >= 3 || (lineas.length >= 6 && cortas / lineas.length > 0.6) || (letras > 0 && digitos / letras > 0.35)) return { ok: false, motivo: "tabla rota" };

  const n = normalizar(crudo);
  if (INSTRUCCIONES.filter((re) => re.test(n)).length >= 3) return { ok: false, motivo: "instrucciones de la plantilla" };

  const todas = frases(crudo);
  const buenas = todas.filter((f) => !esDePlantilla(f));
  const quitadas = todas.length - buenas.length;
  if (todas.length && quitadas / todas.length >= 0.5) return { ok: false, motivo: "texto de ejemplo de la plantilla" };

  // Se rearma por párrafos: las líneas partidas por el PDF se unen.
  const limpio = crudo
    .split(/\n\s*\n/)
    .map((p) =>
      frases(p)
        .filter((f) => !esDePlantilla(f))
        .join(" "),
    )
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (contarPalabras(limpio) < MIN_PALABRAS) return { ok: false, motivo: quitadas ? "texto de ejemplo de la plantilla" : "muy corto (título, portada o fragmento)" };
  return { ok: true, texto: limpio, quitadas };
}

/** Una sección larga se parte por párrafos en trozos de hasta ~600 palabras. */
export function partir(texto: string, max = MAX_PALABRAS_TROZO): string[] {
  const out: string[] = [];
  let actual: string[] = [];
  let n = 0;
  for (const p of texto.split(/\n\s*\n/)) {
    const k = contarPalabras(p);
    if (n && n + k > max) {
      out.push(actual.join("\n\n"));
      actual = [];
      n = 0;
    }
    actual.push(p);
    n += k;
  }
  if (actual.length) out.push(actual.join("\n\n"));
  return out.filter((t) => contarPalabras(t) >= MIN_PALABRAS);
}

/* ---------- Ingerir --------------------------------------------------------- */

export interface ArchivoIngesta {
  nombre: string;
  unidad?: string;
  secciones: { titulo: string; texto: string }[];
}

export interface FilaEjemplo {
  origen: "informe2025" | "aprobado";
  anio: number;
  plantilla: Plantilla | null;
  seccion_tipo: SeccionTipo;
  unidad_nombre: string;
  titulo: string;
  texto: string;
  hash: string;
  aprobado: boolean;
}

export const LIMITES_INGESTA = { archivos: 40, secciones: 600, caracteres: 60_000 };

/** Lee el cuerpo de «ingerir» con cuidado. */
export function leerIngesta(cuerpo: Record<string, unknown>): { ok: true; anio: number; plantilla: Plantilla | null; archivos: ArchivoIngesta[] } | { ok: false; error: string } {
  const anio = Math.floor(Number(cuerpo.anio));
  if (!(anio >= 2000 && anio <= 2100)) return { ok: false, error: "Falta el año (anio) de los informes." };
  const p = cuerpo.plantilla;
  if (p != null && p !== "" && !["A", "B", "C", "D"].includes(String(p))) return { ok: false, error: "La plantilla debe ser A, B, C o D." };
  if (!Array.isArray(cuerpo.archivos) || !cuerpo.archivos.length) return { ok: false, error: "No llegaron archivos." };
  if (cuerpo.archivos.length > LIMITES_INGESTA.archivos) return { ok: false, error: `Máximo ${LIMITES_INGESTA.archivos} archivos por envío.` };
  let total = 0;
  const archivos: ArchivoIngesta[] = [];
  for (const a of cuerpo.archivos as Record<string, unknown>[]) {
    const secciones = Array.isArray(a?.secciones) ? (a.secciones as Record<string, unknown>[]) : [];
    total += secciones.length;
    archivos.push({
      nombre: String(a?.nombre ?? "").slice(0, 200),
      unidad: a?.unidad ? String(a.unidad).slice(0, 200) : undefined,
      secciones: secciones.map((x) => ({ titulo: String(x?.titulo ?? "").slice(0, 300), texto: String(x?.texto ?? "").slice(0, LIMITES_INGESTA.caracteres) })),
    });
  }
  if (total > LIMITES_INGESTA.secciones) return { ok: false, error: `Máximo ${LIMITES_INGESTA.secciones} secciones por envío.` };
  return { ok: true, anio, plantilla: p ? (String(p) as Plantilla) : null, archivos };
}

export interface Descartado {
  archivo: string;
  titulo: string;
  motivo: string;
}

/** Las filas del corpus de unos informes ya extraídos (sin IA), sin repetidas por hash. */
export async function prepararIngesta(anio: number, plantilla: Plantilla | null, archivos: ArchivoIngesta[]): Promise<{ filas: FilaEjemplo[]; descartados: Descartado[]; repetidas: number }> {
  const filas: FilaEjemplo[] = [];
  const descartados: Descartado[] = [];
  const vistos = new Set<string>();
  let repetidas = 0;
  for (const a of archivos) {
    const unidad = (a.unidad || a.nombre.replace(/\.(pdf|docx?)$/i, "")).trim();
    const pl = plantilla ?? inferirPlantilla(a.unidad, a.nombre);
    for (const sec of a.secciones) {
      const l = limpiarSeccion(sec.titulo, sec.texto);
      if (!l.ok) {
        descartados.push({ archivo: a.nombre, titulo: sec.titulo, motivo: l.motivo });
        continue;
      }
      const tipo = clasificarSeccion(sec.titulo, l.texto);
      for (const trozo of partir(sustituirCifras(l.texto))) {
        const hash = await hashTexto(trozo);
        if (vistos.has(hash)) {
          repetidas++;
          continue;
        }
        vistos.add(hash);
        filas.push({ origen: "informe2025", anio, plantilla: pl, seccion_tipo: tipo, unidad_nombre: unidad.slice(0, 200), titulo: sec.titulo.trim().slice(0, 300), texto: trozo, hash, aprobado: true });
      }
    }
  }
  return { filas, descartados, repetidas };
}

/* ---------- Elegir ejemplos -------------------------------------------------- */

export interface EjemploCorpus {
  id?: string;
  origen: string;
  anio: number | null;
  plantilla: string | null;
  seccion_tipo: string;
  unidad_nombre: string | null;
  titulo: string | null;
  texto: string;
}

const VACIAS = new Set("de la el los las del en y a que se con por para un una al su sus lo como mas es o este esta estos estas fue han ha the cifra ano entre sobre desde durante".split(" "));
const clavesDe = (t: string) => new Set(palabras(t).filter((w) => w.length > 3 && !VACIAS.has(w) && !/^\d+$/.test(w)));

/**
 * De 2 a 4 ejemplos para guiar el tono: primero de la misma plantilla y tipo
 * (por palabras clave en común y recencia), sin repetir unidad más de dos
 * veces; si no alcanzan 2, se completa con otras plantillas del mismo tipo.
 */
export function elegirEjemplos(filas: EjemploCorpus[], q: { plantilla: string; tipo: string; consulta: string; max?: number }): { ejemplos: EjemploCorpus[]; otrasPlantillas: boolean } {
  const max = Math.min(4, Math.max(2, q.max ?? 3));
  const consulta = clavesDe(q.consulta);
  const puntaje = (f: EjemploCorpus) => {
    const k = clavesDe(f.texto);
    let comun = 0;
    for (const w of consulta) if (k.has(w)) comun++;
    return comun / Math.sqrt(1 + k.size) + (f.origen === "aprobado" ? 0.3 : 0) + (Number(f.anio) || 0) / 10_000;
  };
  const ordenar = (lista: EjemploCorpus[]) => lista.map((f) => ({ f, p: puntaje(f) })).sort((a, b) => b.p - a.p || a.f.texto.localeCompare(b.f.texto)).map((x) => x.f);
  const delTipo = filas.filter((f) => f.seccion_tipo === q.tipo && contarPalabras(f.texto) >= MIN_PALABRAS);
  const elegir = (lista: EjemploCorpus[], ya: EjemploCorpus[]) => {
    const out = [...ya];
    const porUnidad = new Map<string, number>();
    for (const f of out) porUnidad.set(f.unidad_nombre ?? "", (porUnidad.get(f.unidad_nombre ?? "") ?? 0) + 1);
    for (const f of lista) {
      if (out.length >= max) break;
      const u = f.unidad_nombre ?? "";
      if ((porUnidad.get(u) ?? 0) >= 2 || out.includes(f)) continue;
      porUnidad.set(u, (porUnidad.get(u) ?? 0) + 1);
      out.push(f);
    }
    return out;
  };
  const propios = elegir(ordenar(delTipo.filter((f) => f.plantilla === q.plantilla)), []);
  if (propios.length >= 2) return { ejemplos: propios, otrasPlantillas: false };
  const todos = elegir(ordenar(delTipo.filter((f) => f.plantilla !== q.plantilla)), propios).slice(0, Math.max(2, propios.length));
  return { ejemplos: todos, otrasPlantillas: todos.length > propios.length };
}

/* ---------- Lo que Pilo aprendió ------------------------------------------- */

const CONECTORES = ["además", "asimismo", "así mismo", "igualmente", "de igual manera", "por otra parte", "por su parte", "en este sentido", "en consecuencia", "por lo anterior", "sin embargo", "no obstante", "finalmente", "en cuanto a", "de esta manera", "con el fin de", "en particular", "por consiguiente", "a su vez", "en síntesis"];

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

const top = (conteo: Map<string, number>, n: number, minimo = 1) =>
  [...conteo.entries()]
    .filter(([, c]) => c >= minimo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([texto, veces]) => ({ texto, veces }));

export interface PerfilTipo {
  tipo: string;
  textos: number;
  mediana_palabras: number;
  aperturas: { texto: string; veces: number }[];
  conectores: { texto: string; veces: number }[];
  frases: { texto: string; veces: number }[];
}

/** El perfil de estilo de un tipo de sección: determinista (mismo corpus, mismo perfil). */
export function perfilEstilo(tipo: string, textos: string[]): PerfilTipo {
  const aperturas = new Map<string, number>();
  const conectores = new Map<string, number>();
  const frasesN = new Map<string, number>();
  for (const t of textos) {
    const inicio = String(t).replace(/\[[^\]]*\]/g, " ").match(/[\p{L}]+/gu)?.slice(0, 3).join(" ").toLowerCase();
    if (inicio && inicio.split(" ").length === 3) aperturas.set(inicio, (aperturas.get(inicio) ?? 0) + 1);
    const n = ` ${String(t).toLowerCase().replace(/\s+/g, " ")} `;
    for (const c of CONECTORES) if (new RegExp(`[\\s,.;:(]${c}[\\s,]`, "u").test(n)) conectores.set(c, (conectores.get(c) ?? 0) + 1);
    // Frases de 4 palabras que aparecen en textos distintos (una vez por texto).
    const w = String(t).replace(/\[[^\]]*\]/g, " | ").toLowerCase().match(/[\p{L}|]+/gu) ?? [];
    const enEste = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) {
      const g = w.slice(i, i + 4);
      if (g.includes("|") || g.filter((x) => !VACIAS.has(normalizar(x))).length < 2) continue;
      enEste.add(g.join(" "));
    }
    for (const g of enEste) frasesN.set(g, (frasesN.get(g) ?? 0) + 1);
  }
  return {
    tipo,
    textos: textos.length,
    mediana_palabras: mediana(textos.map(contarPalabras)),
    aperturas: top(aperturas, 5),
    conectores: top(conectores, 8),
    frases: top(frasesN, 8, 2),
  };
}

/** Conteos por origen, plantilla y tipo, y el perfil de cada tipo. */
export function resumenCorpus(filas: EjemploCorpus[]) {
  const contar = (f: (x: EjemploCorpus) => string) => {
    const m: Record<string, number> = {};
    for (const x of filas) m[f(x)] = (m[f(x)] ?? 0) + 1;
    return m;
  };
  return {
    total: filas.length,
    por_origen: contar((x) => x.origen),
    por_plantilla: contar((x) => x.plantilla ?? "sin plantilla"),
    por_tipo: contar((x) => x.seccion_tipo),
    perfiles: SECCION_TIPOS.map((t) => perfilEstilo(t, filas.filter((x) => x.seccion_tipo === t).map((x) => x.texto))).filter((p) => p.textos > 0),
  };
}
