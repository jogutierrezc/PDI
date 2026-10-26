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

import { ESTILO_SIN_ELEGIR, estiloDeFabrica, estiloDelInforme, normalizarAjustes, normalizarEstilo } from "./estilo";
import type { Estilo, Papel } from "./estilo";
import { CENTRO_INICIAL, LAT_MAX, ZOOM_MAX, ZOOM_MIN } from "./mapa";

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
  marcadores: 50,
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

/** Cómo se encuadra la foto de portada: punto de anclaje en % (x, y), zoom de 1 a 3, ajuste y velo. */
export interface FotoPortada {
  x: number;
  y: number;
  zoom: number;
  /** «cubrir» llena el marco (recorta); «contener» muestra la foto entera. */
  ajuste: "cubrir" | "contener";
  /** Opacidad del velo blanco sobre la foto, de 0 a 60 %. */
  velo: number;
}

export interface Portada {
  titulo: string;
  subtitulo: string;
  entidad: string;
  anio: string;
  /** Id de un archivo de imagen de UDrive para la portada a sangre. */
  imagenId?: string;
  /** Campos de los estilos nuevos (0190); todos opcionales y lo vacío no se imprime. */
  autor?: string;
  afiliacion?: string;
  fecha?: string;
  nota?: string;
  /** Encuadre de la foto; sin él se usa el centro, sin zoom. */
  foto?: FotoPortada;
}

export interface Firma {
  nombre: string;
  cargo: string;
}

/** Página de cierre y contraportada del informe (0190). Todo es opcional. */
export interface Cierre {
  mensaje: string;
  firmas: Firma[];
  creditos: string;
  correo: string;
  telefono: string;
  direccion: string;
  web: string;
  /** Frase de la contraportada. */
  frase: string;
  /** Agrega la página de cierre. */
  conCierre: boolean;
  /** Agrega la contraportada. */
  conContraportada: boolean;
}

export const CIERRE_VACIO: Cierre = { mensaje: "", firmas: [], creditos: "", correo: "", telefono: "", direccion: "", web: "", frase: "", conCierre: false, conContraportada: false };
export const MAX_FIRMAS = 3;

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
/** Un punto marcado en el mapa, con su rótulo. */
export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  etiqueta: string;
}
export interface BMapa extends Base {
  tipo: "mapa";
  /** Centro y zoom del mapa (OpenStreetMap). */
  lat: number;
  lng: number;
  zoom: number;
  marcadores: Marcador[];
  titulo: string;
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
  /** Orientación de la sección que empieza aquí (0190). Sin valor, sigue la de antes. */
  orientacion?: "vertical" | "horizontal";
}
export interface BReferencias extends Base {
  tipo: "referencias";
  titulo: string;
}

export type Bloque = BCapitulo | BParrafo | BLista | BTabla | BGrafica | BImagen | BMapa | BDestacado | BNota | BSalto | BReferencias;
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
  /** El estilo que se aplicó y su versión («f:academico», o el id del archivo de estilo y su `updated_at`). Sin él, el Clásico. */
  estilo?: { id: string; v: string };
  /** Cambios de este informe sobre su estilo (solo lo que difiere). */
  ajustes?: Record<string, unknown>;
  /** Copia del estilo al aplicarlo: con ella el informe sale igual aunque el estilo cambie o no se pueda leer. */
  instantanea?: Estilo;
  /** Papel de este informe; sin él, el del estilo (Carta por defecto). */
  papel?: Papel;
  cierre?: Cierre;
}

export const NOMBRE_BLOQUE: Record<TipoBloque, string> = {
  capitulo: "Capítulo",
  parrafo: "Párrafo",
  lista: "Lista",
  tabla: "Tabla",
  grafica: "Gráfica",
  imagen: "Imagen",
  mapa: "Mapa",
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
    case "mapa":
      return { id, tipo, lat: CENTRO_INICIAL.lat, lng: CENTRO_INICIAL.lng, zoom: CENTRO_INICIAL.zoom, marcadores: [], titulo: "", nota: "", alt: "", enIndice: true, ancho: "completo" };
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
const numero = (v: unknown, min: number, max: number, def: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
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
    case "mapa": {
      const ids = new Set<string>();
      return {
        id,
        tipo: "mapa",
        lat: numero(b.lat, -LAT_MAX, LAT_MAX, CENTRO_INICIAL.lat),
        lng: numero(b.lng, -180, 180, CENTRO_INICIAL.lng),
        zoom: Math.round(numero(b.zoom, ZOOM_MIN, ZOOM_MAX, CENTRO_INICIAL.zoom)),
        marcadores: (Array.isArray(b.marcadores) ? b.marcadores : []).slice(0, LIMITES.marcadores).flatMap((m) => {
          const o = objeto(m);
          if (typeof o.lat !== "number" || typeof o.lng !== "number" || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return [];
          let mid = esId(o.id) ? o.id : nuevoIdBloque();
          while (ids.has(mid)) mid = nuevoIdBloque();
          ids.add(mid);
          return [{ id: mid, lat: numero(o.lat, -LAT_MAX, LAT_MAX, 0), lng: numero(o.lng, -180, 180, 0), etiqueta: cadena(o.etiqueta, 80) }];
        }),
        titulo: cadena(b.titulo, LIMITES.titulo),
        nota: cadena(b.nota, LIMITES.nota),
        alt: cadena(b.alt, LIMITES.titulo),
        enIndice: logico(b.enIndice, true),
        ancho: ancho(b.ancho),
      };
    }
    case "destacado":
      return { id, tipo: "destacado", texto: cadena(b.texto, LIMITES.texto) };
    case "nota":
      return { id, tipo: "nota", texto: cadena(b.texto, LIMITES.nota) };
    case "salto":
      return b.orientacion === "horizontal" || b.orientacion === "vertical" ? { id, tipo: "salto", orientacion: b.orientacion } : { id, tipo: "salto" };
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

function normalizarFoto(crudo: unknown): FotoPortada {
  const f = objeto(crudo);
  return {
    x: Math.round(numero(f.x, 0, 100, 50) * 10) / 10,
    y: Math.round(numero(f.y, 0, 100, 50) * 10) / 10,
    zoom: Math.round(numero(f.zoom, 1, 3, 1) * 100) / 100,
    ajuste: f.ajuste === "contener" ? "contener" : "cubrir",
    velo: Math.round(numero(f.velo, 0, 60, 0)),
  };
}

function normalizarCierre(crudo: unknown): Cierre {
  const c = objeto(crudo);
  const linea = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
  const bloque = (v: unknown, max: number) =>
    typeof v === "string"
      ? v
          .replace(/\u0000/g, "")
          .replace(/\r/g, "")
          .split("\n")
          .map((l) => l.replace(/[ \t]+/g, " ").trim())
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
          .slice(0, max)
      : "";
  return {
    mensaje: bloque(c.mensaje, 420),
    firmas: (Array.isArray(c.firmas) ? c.firmas : [])
      .slice(0, MAX_FIRMAS)
      .map((x) => {
        const o = objeto(x);
        return { nombre: linea(o.nombre, 40), cargo: linea(o.cargo, 46) };
      })
      .filter((x) => x.nombre || x.cargo),
    creditos: bloque(c.creditos, 240),
    correo: linea(c.correo, 80),
    telefono: linea(c.telefono, 36),
    direccion: linea(c.direccion, 90),
    web: linea(c.web, 80),
    frase: linea(c.frase, 90),
    conCierre: logico(c.conCierre, false),
    conContraportada: logico(c.conContraportada, false),
  };
}

/** `estilo`, `ajustes`, `instantanea`, `papel` y `cierre`: opcionales, así una pantalla vieja no pierde nada que no conozca y un documento sin ellos sale como el Clásico. */
function extrasDeEstilo(d: Record<string, unknown>, avisos: string[]): Partial<Documento> {
  const salida: Partial<Documento> = {};
  const e = objeto(d.estilo);
  if (typeof e.id === "string" && e.id.length > 0 && e.id.length <= 80) salida.estilo = { id: e.id, v: cadena(e.v, 40) };
  else if (d.estilo !== undefined) avisos.push("Se descartó la referencia al estilo porque no era válida.");
  if (Object.keys(objeto(d.instantanea)).length) salida.instantanea = normalizarEstilo(d.instantanea, estiloDeFabrica(ESTILO_SIN_ELEGIR));
  const base = salida.instantanea ?? estiloDeFabrica(ESTILO_SIN_ELEGIR);
  const aj = normalizarAjustes(d.ajustes, base);
  if (Object.keys(aj).length) salida.ajustes = aj;
  if (d.papel === "carta" || d.papel === "a4") salida.papel = d.papel;
  if (Object.keys(objeto(d.cierre)).length) salida.cierre = normalizarCierre(d.cierre);
  return salida;
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
      ...(typeof p.autor === "string" && p.autor.trim() ? { autor: cadena(p.autor, 90) } : {}),
      ...(typeof p.afiliacion === "string" && p.afiliacion.trim() ? { afiliacion: cadena(p.afiliacion, 90) } : {}),
      ...(typeof p.fecha === "string" && p.fecha.trim() ? { fecha: cadena(p.fecha, 40) } : {}),
      ...(typeof p.nota === "string" && p.nota.trim() ? { nota: cadena(p.nota, 80) } : {}),
      ...(p.foto && typeof p.foto === "object" ? { foto: normalizarFoto(p.foto) } : {}),
    },
    indices: { contenido: logico(ind.contenido, false), ilustraciones: logico(ind.ilustraciones, false), tablas: logico(ind.tablas, false), graficas: logico(ind.graficas, false) },
    fuentes,
    bloques,
    ...(Object.keys(vistas).length ? { vistas } : {}),
    ...(Object.keys(congeladas).length ? { congeladas } : {}),
    ...extrasDeEstilo(d, avisos),
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
  // Las imágenes del estilo: logo propio y marca de agua.
  if (doc.instantanea || doc.ajustes) {
    const e = estiloDelInforme(doc);
    if (e.portada.logos.propioId) im.add(e.portada.logos.propioId);
    if (e.cabpie.marca.modo === "imagen" && e.cabpie.marca.imagenId) im.add(e.cabpie.marca.imagenId);
  }
  return { tablas: [...t], graficas: [...g], imagenes: [...im] };
}

/** ¿Es un bloque de los que llevan número y título propios (figura)? */
export const esFigura = (b: Bloque): b is BTabla | BGrafica | BImagen | BMapa => b.tipo === "tabla" || b.tipo === "grafica" || b.tipo === "imagen" || b.tipo === "mapa";
