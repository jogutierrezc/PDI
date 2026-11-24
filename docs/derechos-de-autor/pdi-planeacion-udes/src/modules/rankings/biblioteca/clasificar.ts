/* =============================================================================
   Biblioteca de evidencias · Pilo reconoce cada archivo y lo apunta a sus ODS
   e indicadores de THE. Sin IA: reglas y afinidad, como el recolector de
   noticias, y cada propuesta dice por qué.

   Señales y lo que pesan (el puntaje va de 0 a 100):
     · el número del indicador en la ruta o el nombre («5.6.3»)        +55
     · el número de su métrica («5.6») en la ruta                       +20
     · «ODS 5», «SDG5», «objetivo 5» en la ruta                         +22
     · afinidad del ODS por el léxico del recolector (noticias-ods)      hasta +18
     · palabras del indicador (título y pregunta de the-indicadores.ts)
       en el nombre, la carpeta o el texto (frecuencia normalizada, sin
       acentos; el nombre y la carpeta pesan el triple)                  hasta +40
     · el tipo de documento (política, informe, acta, cifras…) frente
       al tipo del indicador (doc, ev, dato)                              hasta +8
     · menciona la UDES                                                  +3
     · el año del documento cae en la ventana de THE (2022–2026)         +4
   Los indicadores de investigación (inv) nunca se proponen: los calcula THE.

   Resultado: los tres mejores candidatos con puntaje y razones legibles, y
   un estado: «propuesta», «ambiguo» (los dos primeros casi empatan) o
   «sin_coincidencia» (nada llega a 30).

   `refinarConPilo` es solo el punto de enganche para una segunda lectura con
   IA: hoy no hace nada y devuelve la propuesta tal cual.
   ========================================================================== */

import { leer, sinTildes } from "../../../../supabase/functions/noticias-ods/clasificar";
import { INDICADORES_THE } from "../informes/the-indicadores";
import type { IndicadorTHE } from "../informes/tipos";

export const UMBRAL_PROPUESTA = 30;
export const MARGEN_AMBIGUO = 6;
/** Desde aquí, «Aceptar en lote» ofrece la propuesta. */
export const UMBRAL_ALTO = 70;
export const VENTANA_ANIOS = { desde: 2022, hasta: 2026 } as const;

export interface Propuesta {
  indicador: string;
  ods: number;
  puntaje: number;
  razones: string[];
}

export type EstadoClasificacion = "propuesta" | "ambiguo" | "sin_coincidencia";

export interface Clasificacion {
  propuestas: Propuesta[];
  /** ODS que se le ven al archivo, del más al menos claro. */
  ods: number[];
  anio: number | null;
  estado: EstadoClasificacion;
  /** «política», «informe»… si se reconoce. */
  tipoDocumento: string | null;
}

export interface ArchivoParaClasificar {
  /** Ruta dentro del ZIP. */
  ruta: string;
  nombre: string;
  carpeta: string;
  ext: string;
  texto: string;
}

/* ---------- Normalización y palabras ---------------------------------------- */

/** Sin tildes, minúsculas, solo letras y números separados por un espacio. */
export const normal = (s: string) => sinTildes(s).replace(/[^a-z0-9]+/g, " ").trim();

const VACIAS = new Set(
  (
    "universidad universidades tiene tienen cuenta cuantos cuantas numero estudiantes estudiante personal empleados " +
    "programa programas apoyo sobre entre desde hasta donde cuando como para pero esta este estos estas otros otras " +
    "todos todas cada mismo misma ademas tambien incluye incluidas incluidos parte manera forma mediante acceso " +
    "existe existen ofrece ofrecen realiza realizan organiza participa medida medidas relacionadas relacionados " +
    "comunidad local locales campus institucion actividades iniciativas"
  ).split(" "),
);

/** Raíz corta de una palabra (seis letras) para que «maternidad» encuentre «maternidades». */
const raiz = (p: string) => p.slice(0, Math.min(p.length, 7));

export interface ClavesIndicador {
  id: string;
  ods: number;
  tipo: IndicadorTHE["tipo"];
  /** raíz → peso (2 si sale en el título, 1 si solo en la pregunta). */
  claves: Map<string, number>;
  /** La palabra completa más legible de cada raíz, para las razones. */
  muestra: Map<string, string>;
  total: number;
}

/** Palabras clave de un indicador, derivadas de su título y su pregunta. */
export function clavesDe(ind: Pick<IndicadorTHE, "id" | "ods" | "tipo" | "titulo" | "pregunta">): ClavesIndicador {
  const claves = new Map<string, number>();
  const muestra = new Map<string, string>();
  const sumar = (texto: string, peso: number) => {
    for (const p of normal(texto).split(" ")) {
      if (p.length < 5 || VACIAS.has(p) || /^\d/.test(p)) continue;
      const r = raiz(p);
      claves.set(r, Math.max(claves.get(r) ?? 0, peso));
      if (!muestra.has(r)) muestra.set(r, p);
    }
  };
  sumar(ind.titulo, 2);
  sumar(ind.pregunta, 1);
  let total = 0;
  for (const v of claves.values()) total += v;
  return { id: ind.id, ods: ind.ods, tipo: ind.tipo, claves, muestra, total };
}

const CLAVES_THE = INDICADORES_THE.filter((i) => i.tipo !== "inv").map(clavesDe);

/** Frecuencia de raíces de un texto normalizado (cada raíz al principio de una palabra). */
export function frecuencias(textoNormal: string): Map<string, number> {
  const f = new Map<string, number>();
  for (const p of textoNormal.split(" ")) {
    if (p.length < 5) continue;
    const r = raiz(p);
    f.set(r, (f.get(r) ?? 0) + 1);
  }
  return f;
}

/* ---------- Señales sueltas ------------------------------------------------- */

/** ODS que la ruta nombra: «ODS 5», «ODS_05», «SDG5», «objetivo 5». */
export function odsEnRuta(ruta: string): number[] {
  const t = normal(ruta);
  const salida = new Set<number>();
  for (const m of t.matchAll(/\b(?:ods|sdg|objetivo)\s?0?(\d{1,2})\b/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 17) salida.add(n);
  }
  return [...salida];
}

/** Números de indicador o métrica en la ruta («5.6.3», «4.3», «5_6_3»). */
export function codigosEnRuta(ruta: string): string[] {
  const t = sinTildes(ruta).replace(/_/g, ".");
  const salida = new Set<string>();
  for (const m of t.matchAll(/(?<![\d.])(\d{1,2})[.](\d{1,2})(?:[.](\d{1,2}))?(?![\d])/g)) {
    const ods = Number(m[1]);
    if (ods < 1 || ods > 17) continue;
    salida.add(m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`);
  }
  return [...salida];
}

/** Año del documento: el del nombre o la carpeta si lo hay; si no, el más repetido del texto (el más reciente si empatan). */
export function anioDe(ruta: string, texto: string): number | null {
  const anios = (s: string) => [...s.matchAll(/(?<!\d)(20[12]\d|2030)(?!\d)/g)].map((m) => Number(m[1]));
  const enRuta = anios(ruta);
  if (enRuta.length) return Math.max(...enRuta);
  const cuenta = new Map<number, number>();
  for (const a of anios(texto.slice(0, 8000))) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  let mejor: number | null = null;
  for (const [a, n] of cuenta) if (mejor === null || n > (cuenta.get(mejor) ?? 0) || (n === cuenta.get(mejor) && a > mejor)) mejor = a;
  return mejor;
}

const TIPOS_DOC: { tipo: string; clase: "doc" | "ev" | "dato"; patron: RegExp }[] = [
  { tipo: "política", clase: "doc", patron: /\b(politica|reglamento|estatuto|lineamiento|protocolo|codigo de|manual)/ },
  { tipo: "acuerdo o resolución", clase: "doc", patron: /\b(acuerdo|resolucion|circular|decreto)\b/ },
  { tipo: "plan", clase: "doc", patron: /\b(plan de|plan institucional|estrategia)/ },
  { tipo: "cifras", clase: "dato", patron: /\b(estadistic|cifras|indicadores|matriculad|consolidado|base de datos|datos)\b/ },
  { tipo: "informe", clase: "ev", patron: /\b(informe|reporte|memoria|balance)/ },
  { tipo: "acta", clase: "ev", patron: /\b(acta|asistencia|listado)/ },
  { tipo: "convenio", clase: "ev", patron: /\b(convenio|alianza|memorando)/ },
  { tipo: "evento", clase: "ev", patron: /\b(evento|taller|foro|jornada|seminario|congreso|curso|diplomado|noticia|boletin|fotos?|registro fotografico)/ },
];

/** Tipo de documento por nombre, carpeta y comienzo del texto. Las hojas de cálculo son cifras si nada dice otra cosa. */
export function tipoDocumento(rutaNormal: string, textoNormal: string, ext: string): { tipo: string; clase: "doc" | "ev" | "dato" } | null {
  for (const t of TIPOS_DOC) if (t.patron.test(rutaNormal)) return t;
  const inicio = textoNormal.slice(0, 600);
  for (const t of TIPOS_DOC) if (t.patron.test(inicio)) return t;
  if (["xlsx", "xls", "csv", "ods"].includes(ext)) return { tipo: "hoja de cálculo", clase: "dato" };
  if (["jpg", "jpeg", "png", "webp", "heic", "mp4", "mov"].includes(ext)) return { tipo: "foto o video", clase: "ev" };
  return null;
}

const CON_ARTICULO: Record<string, string> = {
  política: "una política",
  "acuerdo o resolución": "un acuerdo o resolución",
  plan: "un plan",
  cifras: "un archivo de cifras",
  informe: "un informe",
  acta: "un acta",
  convenio: "un convenio",
  evento: "la evidencia de un evento",
  "hoja de cálculo": "una hoja de cálculo",
  "foto o video": "una foto o un video",
};

export const mencionaUdes =(textoNormal: string) => /\b(udes|universidad de santander)\b/.test(textoNormal);

/* ---------- Clasificación ---------------------------------------------------- */

/** Clasifica un archivo contra los 17 ODS y cada indicador de THE. Pura y determinista. */
export function clasificarArchivo(a: ArchivoParaClasificar, catalogo: ClavesIndicador[] = CLAVES_THE): Clasificacion {
  const rutaNormal = normal(`${a.carpeta} ${a.nombre.replace(/\.[^.]+$/, "")}`);
  const textoNormal = normal(a.texto);
  const odsRuta = odsEnRuta(a.ruta);
  const codigos = codigosEnRuta(a.ruta);
  const lectura = leer(`${a.carpeta} ${a.nombre}`, a.texto);
  const afinidad = new Map(lectura.pistas.map((p) => [p.ods, p]));
  const fRuta = frecuencias(rutaNormal);
  const fTexto = frecuencias(textoNormal);
  const largo = Math.max(1, textoNormal.split(" ").length);
  const anio = anioDe(a.ruta, a.texto);
  const tipo = tipoDocumento(rutaNormal, textoNormal, a.ext);
  const udes = mencionaUdes(textoNormal) || mencionaUdes(rutaNormal);

  const candidatos: Propuesta[] = [];
  for (const ind of catalogo) {
    if (ind.tipo === "inv") continue;
    let puntaje = 0;
    const razones: string[] = [];
    const metrica = ind.id.split(".").slice(0, 2).join(".");
    if (codigos.includes(ind.id)) {
      puntaje += 55;
      razones.push(`la ruta dice «${ind.id}»`);
    } else if (codigos.includes(metrica)) {
      puntaje += 20;
      razones.push(`la ruta dice «${metrica}»`);
    }
    if (odsRuta.includes(ind.ods)) {
      puntaje += 22;
      razones.push(`carpeta ODS ${ind.ods}`);
    }
    const af = afinidad.get(ind.ods);
    if (af) puntaje += Math.round((af.score / 100) * 18);

    // Palabras del indicador: lo que sale en el nombre o la carpeta pesa el triple.
    let cubierto = 0;
    const vistas: { palabra: string; peso: number }[] = [];
    for (const [r, peso] of ind.claves) {
      const enRuta = fRuta.get(r) ?? 0;
      const enTexto = fTexto.get(r) ?? 0;
      if (!enRuta && !enTexto) continue;
      // Frecuencia normalizada por el largo del texto, con techo: diez menciones no valen diez veces una.
      const tf = Math.min(1, enRuta * 0.6 + Math.min(1, (enTexto * 400) / largo));
      cubierto += peso * tf;
      vistas.push({ palabra: ind.muestra.get(r) ?? r, peso: peso * tf + (enRuta ? 1 : 0) });
    }
    if (ind.total > 0 && cubierto > 0) {
      const cobertura = Math.min(1, cubierto / Math.min(ind.total, 8));
      puntaje += Math.round(cobertura * 40);
      const top = vistas.sort((x, y) => y.peso - x.peso).slice(0, 3).map((v) => `«${v.palabra}»`);
      razones.push(`aparece${top.length > 1 ? "n" : ""} ${top.join(", ")}`);
    }
    if (puntaje === 0) continue;
    if (af && af.score >= 35 && !odsRuta.includes(ind.ods)) razones.push(`el texto es del ODS ${ind.ods}`);
    if (tipo && (tipo.clase === ind.tipo || (tipo.clase === "ev" && ind.tipo === "doc" && /convenio|informe/.test(tipo.tipo)))) {
      puntaje += tipo.clase === ind.tipo ? 8 : 3;
      razones.push(`parece ${CON_ARTICULO[tipo.tipo] ?? tipo.tipo}`);
    }
    if (udes) puntaje += 3;
    if (anio !== null && anio >= VENTANA_ANIOS.desde && anio <= VENTANA_ANIOS.hasta) {
      puntaje += 4;
      razones.push(`año ${anio}`);
    }
    candidatos.push({ indicador: ind.id, ods: ind.ods, puntaje: Math.min(100, puntaje), razones });
  }

  candidatos.sort((x, y) => y.puntaje - x.puntaje || x.indicador.localeCompare(y.indicador, "es", { numeric: true }));
  const propuestas = candidatos.slice(0, 3);
  for (const p of propuestas) if (udes) p.razones.push("menciona la UDES");

  const ods: number[] = [];
  for (const n of [...odsRuta, ...propuestas.filter((p) => p.puntaje >= UMBRAL_PROPUESTA).map((p) => p.ods), ...lectura.afinidad.map((x) => x.ods)]) {
    if (!ods.includes(n)) ods.push(n);
  }

  const [p1, p2] = propuestas;
  let estado: EstadoClasificacion = "propuesta";
  if (!p1 || p1.puntaje < UMBRAL_PROPUESTA) estado = "sin_coincidencia";
  else if (p2 && p2.puntaje >= UMBRAL_PROPUESTA && p1.puntaje - p2.puntaje < MARGEN_AMBIGUO) estado = "ambiguo";

  return { propuestas, ods: ods.slice(0, 4), anio, estado, tipoDocumento: tipo?.tipo ?? null };
}

/** Las razones de una propuesta en una frase: «carpeta ODS 5; aparecen «maternidad», «licencia»; año 2024». */
export const razonesEnFrase = (p: Propuesta) => p.razones.join("; ");

/* ---------- Duplicados -------------------------------------------------------- */

/** Clave para casi-duplicados por nombre: sin extensión, sin «(1)», «copia», «final», «v2»… */
export function claveCasiDuplicado(nombre: string): string {
  return normal(nombre.replace(/\.[^.]+$/, ""))
    .replace(/\b(copia|copy|final|definitiv[oa]|ultim[oa]|nuevo|nueva|version|v\d+|\d)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ConDuplicados<T> {
  item: T;
  /** Ya existe un archivo con el mismo contenido (hash). */
  duplicadoDe: string | null;
  /** Otros archivos con un nombre casi igual (contenido distinto). */
  parecidos: string[];
}

/**
 * Marca duplicados exactos (mismo SHA-256 que otro de la lista o que uno ya
 * guardado) y casi-duplicados por nombre.
 */
export function marcarDuplicados<T extends { ruta: string; nombre: string; sha256: string }>(lista: T[], guardados: { sha256: string; ruta: string }[] = []): ConDuplicados<T>[] {
  const porHash = new Map(guardados.map((g) => [g.sha256, g.ruta]));
  const porClave = new Map<string, string[]>();
  for (const x of lista) {
    const k = claveCasiDuplicado(x.nombre);
    if (k.length >= 4) porClave.set(k, [...(porClave.get(k) ?? []), x.ruta]);
  }
  return lista.map((item) => {
    const previo = porHash.get(item.sha256) ?? null;
    if (!previo) porHash.set(item.sha256, item.ruta);
    const k = claveCasiDuplicado(item.nombre);
    return { item, duplicadoDe: previo, parecidos: (porClave.get(k) ?? []).filter((r) => r !== item.ruta) };
  });
}

/* ---------- Enganche para la IA ---------------------------------------------- */

/**
 * Punto de enganche para una segunda lectura con Pilo (IA). Hoy NO llama a
 * ninguna IA: devuelve la clasificación sin cambios. Si algún día se activa,
 * debe pasar por la función pilo-ia y respetar el permiso de Planeación.
 */
export async function refinarConPilo(_archivo: ArchivoParaClasificar, clasificacion: Clasificacion): Promise<Clasificacion> {
  return clasificacion;
}
