/* =============================================================================
   UDrive · el modelo del documento por bloques (fase 2, migración 0188).

   Un documento es JSON versionado en `drive_archivos.contenido` (tipo
   «documento»): portada, qué índices lleva, las fuentes para citar en APA y una
   lista de bloques. Cada bloque tiene un id estable (los comentarios y las
   referencias cruzadas apuntan a él, no a su posición).

   Aquí, sin React ni Supabase: los tipos, los límites, el validador que
   también normaliza (patrón de encuestas/lib/estructura.ts) y las operaciones
   puras sobre la lista de bloques (insertar, mover, duplicar, quitar) que usa
   el editor para deshacer y rehacer.
   ========================================================================== */

export type PlantillaId = "lineamientos" | "blanco";
export type NivelCapitulo = 1 | 2 | 3;
export type AnchoFigura = "completo" | "medio" | "pequeno";
export type EstadoDoc = "borrador" | "revision" | "aprobado";

export const LIMITES = {
  bloques: 2000,
  /** Tamaño del JSON ya serializado: muy por debajo del tope de 15 MB de la base. */
  bytes: 3_000_000,
  titulo: 300,
  texto: 20_000,
  nota: 600,
  items: 200,
  fuentes: 500,
  id: 60,
  portada: 300,
} as const;

/** Una fuente para citar en APA 7. Los campos que no apliquen al tipo quedan vacíos. */
export interface Fuente {
  id: string;
  tipo: "libro" | "articulo" | "informe" | "web";
  autores: string;
  anio: string;
  titulo: string;
  /** Revista, editorial, entidad o sitio, según el tipo. */
  origen: string;
  volumen: string;
  paginas: string;
  url: string;
}

export interface Portada {
  titulo: string;
  subtitulo: string;
  entidad: string;
  anio: string;
  /** Id de un archivo de imagen de UDrive para la portada a sangre. */
  imagenId?: string;
}

export interface Indices {
  contenido: boolean;
  ilustraciones: boolean;
  tablas: boolean;
  graficas: boolean;
}

interface Base {
  id: string;
}

export interface BCapitulo extends Base {
  tipo: "capitulo";
  nivel: NivelCapitulo;
  titulo: string;
}
export interface BParrafo extends Base {
  tipo: "parrafo";
  texto: string;
}
export interface BLista extends Base {
  tipo: "lista";
  ordenada: boolean;
  items: string[];
}
export interface BTabla extends Base {
  tipo: "tabla";
  archivoId: string;
  /** Vacío = el de «Cómo se ve en el documento» de la tabla. */
  titulo: string;
  nota: string;
  enIndice: boolean;
  mapaCalor: boolean;
  repetirEncabezado: boolean;
}
export interface BGrafica extends Base {
  tipo: "grafica";
  archivoId: string;
  titulo: string;
  nota: string;
  enIndice: boolean;
  ancho: AnchoFigura;
}
export interface BImagen extends Base {
  tipo: "imagen";
  archivoId: string;
  titulo: string;
  /** La fuente o nota que va debajo («Nota. …»). */
  nota: string;
  alt: string;
  enIndice: boolean;
  ancho: AnchoFigura;
}
export interface BDestacado extends Base {
  tipo: "destacado";
  texto: string;
}
export interface BNota extends Base {
  tipo: "nota";
  texto: string;
}
export interface BSalto extends Base {
  tipo: "salto";
}
export interface BReferencias extends Base {
  tipo: "referencias";
  titulo: string;
}

export type Bloque = BCapitulo | BParrafo | BLista | BTabla | BGrafica | BImagen | BDestacado | BNota | BSalto | BReferencias;
export type TipoBloque = Bloque["tipo"];

/** Una cifra viva con el valor que tenía al aprobar el documento. */
export interface CifraCongelada {
  texto: string;
  fuente: string;
  corte: string | null;
}

export interface Documento {
  version: 1;
  plantilla: PlantillaId;
  portada: Portada;
  indices: Indices;
  fuentes: Fuente[];
  bloques: Bloque[];
  /** El valor de cada [[clave]] la última vez que la persona lo revisó: si el vivo cambia, el editor avisa. */
  vistas?: Record<string, string>;
  /** Solo en documentos aprobados: el valor de cada [[clave]] al aprobar. */
  congeladas?: Record<string, CifraCongelada>;
}

export const NOMBRE_BLOQUE: Record<TipoBloque, string> = {
  capitulo: "Capítulo",
  parrafo: "Párrafo",
  lista: "Lista",
  tabla: "Tabla",
  grafica: "Gráfica",
  imagen: "Imagen",
  destacado: "Cuadro destacado",
  nota: "Nota o fuente",
  salto: "Salto de página",
  referencias: "Referencias",
};

export const ETIQUETA_ESTADO: Record<EstadoDoc, string> = { borrador: "Borrador", revision: "En revisión", aprobado: "Aprobado" };

/* ---------- ids y bloques nuevos ------------------------------------------------ */

const ID = /^[A-Za-z0-9_-]{1,60}$/;
export const esId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export const nuevoIdBloque = (): string => `b${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12)}`;

export function bloqueNuevo(tipo: TipoBloque, id: string = nuevoIdBloque()): Bloque {
  switch (tipo) {
    case "capitulo":
      return { id, tipo, nivel: 2, titulo: "" };
    case "parrafo":
      return { id, tipo, texto: "" };
    case "lista":
      return { id, tipo, ordenada: false, items: [""] };
    case "tabla":
      return { id, tipo, archivoId: "", titulo: "", nota: "", enIndice: true, mapaCalor: true, repetirEncabezado: true };
    case "grafica":
      return { id, tipo, archivoId: "", titulo: "", nota: "", enIndice: true, ancho: "completo" };
    case "imagen":
      return { id, tipo, archivoId: "", titulo: "", nota: "", alt: "", enIndice: true, ancho: "completo" };
    case "destacado":
      return { id, tipo, texto: "" };
    case "nota":
      return { id, tipo, texto: "" };
    case "salto":
      return { id, tipo };
    case "referencias":
      return { id, tipo, titulo: "Referencias" };
  }
}

export const portadaVacia = (): Portada => ({ titulo: "", subtitulo: "", entidad: "Universidad de Santander", anio: String(new Date().getFullYear()) });
export const indicesPorDefecto = (): Indices => ({ contenido: true, ilustraciones: true, tablas: true, graficas: true });

export const documentoVacio = (plantilla: PlantillaId = "blanco"): Documento => ({
  version: 1,
  plantilla,
  portada: portadaVacia(),
  indices: { contenido: false, ilustraciones: false, tablas: false, graficas: false },
  fuentes: [],
  bloques: [bloqueNuevo("parrafo")],
});

/* ---------- validación y normalización ---------------------------------------------- */

const cadena = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\u0000/g, "").slice(0, max) : "");
const logico = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ancho = (v: unknown): AnchoFigura => (v === "medio" || v === "pequeno" ? v : "completo");

function normalizarBloque(crudo: unknown, usados: Set<string>): Bloque | null {
  const b = objeto(crudo);
  let id = esId(b.id) ? b.id : nuevoIdBloque();
  while (usados.has(id)) id = nuevoIdBloque();
  usados.add(id);
  switch (b.tipo) {
    case "capitulo":
      return { id, tipo: "capitulo", nivel: b.nivel === 1 || b.nivel === 3 ? b.nivel : 2, titulo: cadena(b.titulo, LIMITES.titulo) };
    case "parrafo":
      return { id, tipo: "parrafo", texto: cadena(b.texto, LIMITES.texto) };
    case "lista":
      return {
        id,
        tipo: "lista",
        ordenada: logico(b.ordenada, false),
        items: (Array.isArray(b.items) ? b.items : []).slice(0, LIMITES.items).map((i) => cadena(i, 2000)),
      };
    case "tabla":
      return {
        id,
        tipo: "tabla",
        archivoId: esId(b.archivoId) ? b.archivoId : "",
        titulo: cadena(b.titulo, LIMITES.titulo),
        nota: cadena(b.nota, LIMITES.nota),
        enIndice: logico(b.enIndice, true),
        mapaCalor: logico(b.mapaCalor, true),
        repetirEncabezado: logico(b.repetirEncabezado, true),
      };
    case "grafica":
      return { id, tipo: "grafica", archivoId: esId(b.archivoId) ? b.archivoId : "", titulo: cadena(b.titulo, LIMITES.titulo), nota: cadena(b.nota, LIMITES.nota), enIndice: logico(b.enIndice, true), ancho: ancho(b.ancho) };
    case "imagen":
      return {
        id,
        tipo: "imagen",
        archivoId: esId(b.archivoId) ? b.archivoId : "",
        titulo: cadena(b.titulo, LIMITES.titulo),
        nota: cadena(b.nota, LIMITES.nota),
        alt: cadena(b.alt, LIMITES.titulo),
        enIndice: logico(b.enIndice, true),
        ancho: ancho(b.ancho),
      };
    case "destacado":
      return { id, tipo: "destacado", texto: cadena(b.texto, LIMITES.texto) };
    case "nota":
      return { id, tipo: "nota", texto: cadena(b.texto, LIMITES.nota) };
    case "salto":
      return { id, tipo: "salto" };
    case "referencias":
      return { id, tipo: "referencias", titulo: cadena(b.titulo, LIMITES.titulo) || "Referencias" };
    default:
      return null;
  }
}

function normalizarFuente(crudo: unknown, usados: Set<string>): Fuente | null {
  const f = objeto(crudo);
  if (!esId(f.id) || usados.has(f.id)) return null;
  usados.add(f.id);
  const tipo = f.tipo === "libro" || f.tipo === "articulo" || f.tipo === "informe" ? f.tipo : "web";
  return {
    id: f.id,
    tipo,
    autores: cadena(f.autores, 400),
    anio: cadena(f.anio, 12),
    titulo: cadena(f.titulo, 500),
    origen: cadena(f.origen, 300),
    volumen: cadena(f.volumen, 40),
    paginas: cadena(f.paginas, 40),
    url: cadena(f.url, 600),
  };
}

export interface ResultadoDocumento {
  documento: Documento;
  /** Lo que se corrigió o se descartó, en español. Vacío si el JSON ya estaba bien. */
  avisos: string[];
}

/** Lee cualquier JSON como documento: lo que no sirve se descarta o se corrige y queda anotado en `avisos`. */
export function normalizarDocumento(crudo: unknown): ResultadoDocumento {
  const avisos: string[] = [];
  const d = objeto(crudo);
  if (d.version !== undefined && d.version !== 1) avisos.push("La versión del documento es más nueva de la que entiende esta pantalla.");
  const p = objeto(d.portada);
  const ind = objeto(d.indices);
  const usados = new Set<string>();
  const crudos = Array.isArray(d.bloques) ? d.bloques : [];
  if (crudos.length > LIMITES.bloques) avisos.push(`Se descartaron los bloques que pasan de ${LIMITES.bloques}.`);
  const bloques: Bloque[] = [];
  for (const c of crudos.slice(0, LIMITES.bloques)) {
    const b = normalizarBloque(c, usados);
    if (b) bloques.push(b);
    else avisos.push("Se descartó un bloque de un tipo desconocido.");
  }
  const idsFuente = new Set<string>();
  const fuentes = (Array.isArray(d.fuentes) ? d.fuentes : []).slice(0, LIMITES.fuentes).flatMap((f) => normalizarFuente(f, idsFuente) ?? []);
  const congeladas: Record<string, CifraCongelada> = {};
  for (const [k, v] of Object.entries(objeto(d.congeladas)).slice(0, 500)) {
    const c = objeto(v);
    if (/^[a-z0-9_]{1,60}$/i.test(k) && typeof c.texto === "string") congeladas[k.toLowerCase()] = { texto: cadena(c.texto, 60), fuente: cadena(c.fuente, 300), corte: typeof c.corte === "string" ? cadena(c.corte, 40) : null };
  }
  const vistas: Record<string, string> = {};
  for (const [k, v] of Object.entries(objeto(d.vistas)).slice(0, 500)) if (/^[a-z0-9_]{1,60}$/i.test(k) && typeof v === "string") vistas[k.toLowerCase()] = cadena(v, 60);
  const documento: Documento = {
    version: 1,
    plantilla: d.plantilla === "lineamientos" ? "lineamientos" : "blanco",
    portada: {
      titulo: cadena(p.titulo, LIMITES.portada),
      subtitulo: cadena(p.subtitulo, LIMITES.portada),
      entidad: cadena(p.entidad, LIMITES.portada),
      anio: cadena(p.anio, 12),
      ...(esId(p.imagenId) ? { imagenId: p.imagenId } : {}),
    },
    indices: { contenido: logico(ind.contenido, false), ilustraciones: logico(ind.ilustraciones, false), tablas: logico(ind.tablas, false), graficas: logico(ind.graficas, false) },
    fuentes,
    bloques,
    ...(Object.keys(vistas).length ? { vistas } : {}),
    ...(Object.keys(congeladas).length ? { congeladas } : {}),
  };
  return { documento, avisos };
}

/** Lo que impide guardar el documento, en español; vacío si se puede. Revisa tamaño y cantidad de bloques. */
export function validarDocumento(doc: Documento): string {
  if (doc.bloques.length > LIMITES.bloques) return `El documento tiene más de ${LIMITES.bloques} bloques.`;
  const ids = new Set<string>();
  for (const b of doc.bloques) {
    if (!esId(b.id) || ids.has(b.id)) return "Hay bloques con el identificador repetido o no válido.";
    ids.add(b.id);
  }
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  if (bytes > LIMITES.bytes) return `El documento pesa ${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB; el máximo es ${LIMITES.bytes / 1_000_000} MB. Mueva texto largo a otro informe.`;
  return "";
}

/* ---------- operaciones sobre la lista de bloques ------------------------------------- */

export const indiceDe = (bloques: readonly Bloque[], id: string | null | undefined): number => (id ? bloques.findIndex((b) => b.id === id) : -1);

/** Inserta `nuevo` después del bloque `despuesDe` (nulo = al principio). */
export function insertarBloque(bloques: readonly Bloque[], nuevo: Bloque, despuesDe: string | null): Bloque[] {
  const i = despuesDe === null ? 0 : indiceDe(bloques, despuesDe) + 1;
  const copia = bloques.slice();
  copia.splice(i < 0 ? copia.length : i, 0, nuevo);
  return copia;
}

/** Mueve el bloque a la posición `destino` (índice en la lista resultante). */
export function moverBloque(bloques: readonly Bloque[], id: string, destino: number): Bloque[] {
  const desde = indiceDe(bloques, id);
  if (desde < 0) return bloques.slice();
  const copia = bloques.slice();
  const [b] = copia.splice(desde, 1);
  copia.splice(Math.max(0, Math.min(destino, copia.length)), 0, b);
  return copia;
}

export const subirBloque = (bloques: readonly Bloque[], id: string): Bloque[] => moverBloque(bloques, id, indiceDe(bloques, id) - 1);
export const bajarBloque = (bloques: readonly Bloque[], id: string): Bloque[] => moverBloque(bloques, id, indiceDe(bloques, id) + 1);

/** Copia un bloque con id nuevo justo debajo del original. */
export function duplicarBloque(bloques: readonly Bloque[], id: string): { bloques: Bloque[]; copiaId: string | null } {
  const i = indiceDe(bloques, id);
  if (i < 0) return { bloques: bloques.slice(), copiaId: null };
  const copia = { ...bloques[i], id: nuevoIdBloque() } as Bloque;
  const salida = bloques.slice();
  salida.splice(i + 1, 0, copia);
  return { bloques: salida, copiaId: copia.id };
}

export const quitarBloque = (bloques: readonly Bloque[], id: string): Bloque[] => bloques.filter((b) => b.id !== id);

export function reemplazarBloque(bloques: readonly Bloque[], bloque: Bloque): Bloque[] {
  return bloques.map((b) => (b.id === bloque.id ? bloque : b));
}

/** Las tablas y gráficas (y la imagen de portada) que usa el documento, sin repetir. */
export function archivosUsados(doc: Documento): { tablas: string[]; graficas: string[]; imagenes: string[] } {
  const t = new Set<string>();
  const g = new Set<string>();
  const im = new Set<string>();
  for (const b of doc.bloques) {
    if (b.tipo === "tabla" && b.archivoId) t.add(b.archivoId);
    if (b.tipo === "grafica" && b.archivoId) g.add(b.archivoId);
    if (b.tipo === "imagen" && b.archivoId) im.add(b.archivoId);
  }
  if (doc.portada.imagenId) im.add(doc.portada.imagenId);
  return { tablas: [...t], graficas: [...g], imagenes: [...im] };
}

/** ¿Es un bloque de los que llevan número y título propios (figura)? */
export const esFigura = (b: Bloque): b is BTabla | BGrafica | BImagen => b.tipo === "tabla" || b.tipo === "grafica" || b.tipo === "imagen";
