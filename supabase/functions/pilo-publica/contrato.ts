/* =============================================================================
   Pilo Publica · contrato de la API y de los `spec` de los bloques (0262).

   Solo tipos y constantes: la pantalla los replica tal cual. Si cambia algo
   aquí, cambia también en la pantalla.
   ========================================================================== */

export type Ranking = "impact" | "world" | "green";
export const RANKINGS: Ranking[] = ["impact", "world", "green"];

export type EstadoInforme = "borrador" | "revision" | "publicado";
export type KindFuente = "noticia" | "indicador" | "libro" | "documento" | "cifras";
export const KINDS_FUENTE: KindFuente[] = ["noticia", "indicador", "libro", "documento", "cifras"];
export type KindBloque = "kpi" | "grafico" | "texto" | "imagen";
export type OrigenBloque = "pilo" | "persona" | "editado";
export type Grafico = "bar" | "line" | "donut";

/** Las secciones (`pp_bloques.sec`) que escribe Pilo. */
export const SECCIONES = { kpi: "kpis", grafico: "graficos", texto: "ejes", imagen: "imagenes" } as const;

/* ---------- Ajustes del informe (pp_informes.settings) --------------------------- */

export interface AjustesInforme {
  tone: "cercano" | "institucional";
  person: "nosotros" | "tercera";
  cover: "right" | "left";
  cols: 1 | 2;
  motion: "editorial" | "subtle" | "none";
}

/* ---------- Los spec de pp_bloques ------------------------------------------------ */

/** kpi: el valor sale del libro de cifras. */
export interface SpecKpi {
  cifra: string;
}

export interface PuntoSerie {
  /** bar/line: el año de la cifra («2024»). donut: la etiqueta de la porción. */
  x: string;
  cifra: string;
}

export interface SpecGrafico {
  chart: Grafico;
  title_es: string;
  title_en: string;
  /** Todas las cifras de una serie comparten unidad. */
  series: PuntoSerie[];
  /** La unidad común de la serie (la pone el código, no la IA). */
  unit?: string;
}

export interface SpecImagen {
  news_id: string;
  /** El id del bloque de texto (sec «ejes») al que acompaña. */
  eje?: string;
  image_id?: string;
  crop?: { fx: number; fy: number; ratio: string };
  caption?: string;
  /** Texto alternativo: sale del texto de la nota; Pilo no ve la imagen. */
  alt?: string;
  url?: string;
  credit?: string;
}

export interface SpecTexto {
  /** El indicador del ranking al que responde («4.3.1», «EC.2», «teaching.ratio»). */
  indicator?: string;
}

/** Una cita de un bloque de texto (`pp_bloques.sources`): de qué fuente y el trozo literal. */
export interface CitaBloque {
  /** `pp_fuentes.ref` (el uuid de la nota, «the:<id>», «ds:<id>», «bib:<id>», «od:<id>»…). */
  ref: string;
  kind: KindFuente;
  quote: string;
  /** El nombre visible de la fuente (título de la nota, del indicador, de la tabla…). */
  label?: string;
  title?: string;
  url?: string;
  /** La nota, si la fuente es una noticia (para las imágenes y los enlaces). */
  news_id?: string;
}

/** pp_fuentes.meta de una noticia (lo que la pantalla lee). */
export interface MetaNoticia {
  news_id: string;
  date: string | null;
  /** La sección de udes.edu.co que la publicó. */
  office: string;
  campus?: string;
  /** news_items.state (solo entran las «ok»). */
  state: string;
  /** Aprobada = pública en udes.edu.co. */
  public: boolean;
  /** El texto habla de niñas, niños o adolescentes (no se usan sus imágenes). */
  minors: boolean;
  url: string;
  indicator?: string | null;
  score?: number;
  fallo?: { motivo: string; at: string };
}

/* ---------- El rastro de una cifra (pp_cifras.source) ------------------------------ */

export interface RastroCifra {
  /** La tabla de origen («news_figures», «ds_filas», «ranking_responses», «ugm_respuestas», «od_values», «ranking_biblioteca»). */
  tabla: string;
  /** El `pp_fuentes.ref` del que sale. */
  ref: string;
  kind: KindFuente;
  /** Fila(s) de origen. */
  fila?: string | string[];
  columna?: string;
  /** El trozo literal que la contiene, si lo hay. */
  cita?: string;
  url?: string;
  /** Cómo se obtuvo, si se juntaron varias filas. */
  nota?: string;
}

/* ---------- Cuerpos y respuestas ---------------------------------------------------- */

export type Accion = "estado" | "fuentes" | "libro" | "analizar" | "redactar" | "imagenes" | "traducir";
export const ACCIONES: Accion[] = ["estado", "fuentes", "libro", "analizar", "redactar", "imagenes", "traducir"];

export interface Pedido {
  action: Accion;
  informe_id?: string;
  /** analizar: reemplaza los kpi/gráficos de Pilo. redactar «portada»: escribe aunque ya haya título o entrada. */
  rehacer?: boolean;
  /** redactar: la sección. */
  sec?: "portada" | "ejes";
  /** redactar «ejes»: reescribe ese bloque (solo si es de Pilo). */
  block_id?: string;
  /** redactar «ejes»: cuántos párrafos en esta llamada. */
  count?: number;
  /** redactar «ejes»: vuelve a intentar las fuentes que fallaron antes. */
  reintentar?: boolean;
}

export type CodigoError =
  | "sesion"
  | "permiso"
  | "cuerpo"
  | "accion"
  | "informe"
  | "publicado"
  | "migracion"
  | "sin_ia"
  | "proveedor"
  | "limite_proveedor"
  | "clave"
  | "verificacion"
  | "de_persona"
  | "ya_hecho"
  | "sin_libro"
  | "sin_fuentes"
  | "sin_ejes"
  | "interno";

export interface RespuestaError {
  error: string;
  code: CodigoError;
}

export const ROL = "periodista-estadistico" as const;

export interface RespuestaEstado {
  ok: true;
  ai: boolean;
  motivo?: string;
  proveedor: string;
  modelo: string;
  rol: typeof ROL;
}

export interface RespuestaFuentes {
  ok: true;
  /** Cuántas hay de cada clase (todas, incluidas o no). */
  fuentes: Record<KindFuente, number>;
  /** Cuántas son nuevas en esta llamada. */
  nuevas: number;
  avisos: string[];
}

export interface RespuestaLibro {
  ok: true;
  cifras: number;
  derivadas: number;
  avisos: string[];
}

export interface Descartado {
  motivo: string;
}

export interface RespuestaAnalizar {
  ok: true;
  kpis: number;
  graficos: number;
  descartados: Descartado[];
}

export interface Fallo {
  refs: string[];
  motivo: string;
}

export interface SinUsar {
  ref: string;
  label: string;
  motivo: string;
}

export interface RespuestaRedactar {
  ok: true;
  escritos: number;
  /** Bloques de texto (o 0 en «portada») que quedan por escribir; el cliente repite hasta 0. */
  quedan: number;
  fallos: Fallo[];
  /** Noticias incluidas que no quedaron citadas en ningún texto, con el motivo. */
  sin_usar: SinUsar[];
  bloques?: string[];
}

export interface PropuestaImagen {
  news_id: string;
  image_id?: string;
  /** El bloque de imagen creado. */
  block_id?: string;
  url?: string;
  /** El bloque de texto al que acompaña (spec.eje). */
  eje?: string;
}

export interface RespuestaImagenes {
  ok: true;
  /** Bloques de imagen nuevos (se crean apagados: una persona mira cada foto). */
  propuestas: PropuestaImagen[];
  omitidas: { news_id: string; motivo: string }[];
  aviso: string;
}

export interface RespuestaTraducir {
  ok: true;
  hechos: number;
  fallos: { ref: string; error: string }[];
  quedan: number;
}
