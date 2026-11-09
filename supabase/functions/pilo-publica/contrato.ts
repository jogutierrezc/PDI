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
  /** Quién propuso el gráfico: el estadístico con IA o la sugerencia determinista del código. */
  origen?: OrigenGrafico;
}

export type OrigenGrafico = "pilo" | "codigo";

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
  /** Imagen manual de una persona (spec.url https): la acción `imagenes` no la toca. */
  externa?: boolean;
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
  /** El párrafo del texto (1, 2, …) que se apoya en esta cita. */
  p?: number;
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

/* ---------- La procedencia de una cifra (pp_cifras.source) -------------------------- */

/**
 * De dónde sale una cifra y qué mide. Contrato con la pantalla: todo es
 * opcional salvo `kind` y `tabla`. Lo escribe `libro` en TODAS las vías
 * (Datos de Sostenibilidad, THE Impact, UI GreenMetric, UDES en Cifras,
 * documentos, noticias y derivadas); `describir` agrega la descripción.
 */
export interface SourceCifra {
  kind: KindFuente;
  /** Nombre LEGIBLE de la tabla, libro o informe («Brigadas de salud 2024», «UDES en Cifras · Bienestar»). */
  tabla: string;
  /** La oficina o unidad que reporta. */
  oficina?: string;
  /** La columna o el campo («Número de asistentes»). */
  columna?: string;
  /** La parte a la que se refiere («Sede Bucaramanga», «Oficina de Bienestar», «Toda la UDES»). */
  desglose?: string;
  /** El periodo («2024», «2024-1, 2024-2», «2025-03-12»). */
  periodo?: string;
  indicador_id?: string;
  /** Nombre del indicador. */
  indicador?: string;
  definicion?: string;
  /** El trozo literal que la contiene, si sale de un texto. */
  cita?: string;
  url?: string;
  fila?: string | number;
  /** Clave estable de la MISMA medida a través de años o periodos: lo que permite armar series sin adivinar. */
  serie?: string;
  /** Qué mide, a qué población, en qué periodo y cómo se obtuvo (ES). */
  descripcion?: string;
  descripcion_en?: string;
  /** Quién escribió la descripción: Pilo (`describir`), una persona (no se pisa) o el código (derivadas). */
  descrito?: "pilo" | "persona" | "codigo";
  /** Derivadas: cómo se calculó. */
  formula?: string;

  /* Campos internos de la función (la pantalla puede ignorarlos). */
  /** El `pp_fuentes.ref` del que sale («ds:<id>», «the:<id>», «od:<id>», el uuid de la nota…); «derivada» en las calculadas. */
  ref?: string;
  /** La tabla técnica de la base («ds_filas», «ranking_responses», «od_values»…). */
  tabla_db?: string;
  /** Todas las filas de origen, si se juntaron varias. */
  filas?: string[];
  /** Derivadas: las keys del libro de las que sale. */
  bases?: string[];
  /** Cómo se juntaron varias filas («suma de 12 filas»). */
  nota?: string;
  /** `describir`: cuándo se describió (ISO) y, si falló, el motivo. */
  descrito_at?: string;
  describir_fallo?: { motivo: string; at: string };
}

/** Nombre anterior del tipo (compatibilidad). */
export type RastroCifra = SourceCifra;

/* ---------- Cuerpos y respuestas ---------------------------------------------------- */

export type Accion = "estado" | "fuentes" | "libro" | "describir" | "analizar" | "redactar" | "imagenes" | "traducir";
export const ACCIONES: Accion[] = ["estado", "fuentes", "libro", "describir", "analizar", "redactar", "imagenes", "traducir"];

/** redactar «ejes»: «normal» = hasta 3 fuentes y 2–3 párrafos; «profunda» (defecto) = hasta 5 fuentes y 4–6 párrafos. */
export type Profundidad = "normal" | "profunda";

export interface Pedido {
  action: Accion;
  informe_id?: string;
  /**
   * analizar: reemplaza los kpi/gráficos de Pilo. redactar «portada»: escribe aunque ya haya título o entrada.
   * describir: vuelve a describir también las ya descritas por Pilo (nunca las de una persona); se puede
   * repetir con rehacer hasta quedan = 0 (las descritas en los últimos 15 minutos no se repiten).
   */
  rehacer?: boolean;
  /** redactar: la sección. */
  sec?: "portada" | "ejes";
  /** redactar «ejes»: reescribe ese bloque (solo si es de Pilo). */
  block_id?: string;
  /** redactar «ejes» con block_id: reescribe el eje en profundidad sumando fuentes del mismo indicador aún sin citar. */
  profundizar?: boolean;
  /** redactar «ejes»: cuántos ejes en esta llamada (con «profunda», siempre 1). */
  count?: number;
  /** redactar «ejes»: vuelve a intentar las fuentes que fallaron antes. */
  reintentar?: boolean;
  /** redactar «ejes»: por defecto «profunda». */
  profundidad?: Profundidad;
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

export interface RespuestaDescribir {
  ok: true;
  /** Cifras descritas en esta llamada. */
  descritas: number;
  /** Las que no pasaron la verificación (se omiten; el resto se guarda). */
  fallos: { key: string; motivo: string }[];
  /** Cifras que faltan por describir; el cliente repite hasta 0. */
  quedan: number;
}

export interface GraficoPropuesto {
  block_id?: string;
  chart: Grafico;
  title_es: string;
  /** «pilo»: lo propuso el estadístico con IA; «codigo»: sugerencia determinista para completar 3. */
  origen: OrigenGrafico;
}

export interface RespuestaAnalizar {
  ok: true;
  kpis: number;
  graficos: number;
  descartados: Descartado[];
  /** Cada gráfico creado, con quién lo propuso. */
  propuestos: GraficoPropuesto[];
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
  /** Avisos de la llamada (fuentes que no se pudieron leer, «profundizar» sin fuentes nuevas…). */
  avisos?: string[];
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
