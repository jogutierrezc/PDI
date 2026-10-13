/* =============================================================================
   Informes ODS con Pilo · el contrato entre la base, la función `pilo-rankingsod`
   y las pantallas (intranet y portal público).

   Un informe es de un ODS y una edición (2025, 2026…). Se arma con:
     · bloques de texto por sección (Pilo o una persona; cada frase de Pilo lleva
       la cita exacta de la nota de donde sale),
     · fotografías tomadas de las noticias aprobadas, con su recorte,
     · una elección de evidencia por indicador de THE (una sola nota por
       indicador) y su página de evidencia (sin menú, sin enlaces),
     · y, al final del informe público, el carrusel de las noticias aprobadas.

   Las tablas están en la migración 0145. Este archivo no usa red ni React: lo
   comparten la capa de datos, las pantallas y las pruebas.
   ========================================================================== */

/** Quién escribió un párrafo. «editado» = lo escribió Pilo y una persona lo cambió. */
export type Origen = "pilo" | "persona" | "editado";

/** Secciones del informe, en el orden en que se leen. */
export type Seccion = "tesis" | "cifras" | "hicimos" | "proyectos" | "viene";
export const SECCIONES: { id: Seccion; label: string }[] = [
  { id: "tesis", label: "Portada y tesis" },
  { id: "cifras", label: "Cifras" },
  { id: "hicimos", label: "Qué hicimos" },
  { id: "proyectos", label: "Proyectos" },
  { id: "viene", label: "Hacia la próxima edición" },
];

export type EstadoInforme = "borrador" | "revision" | "publicado";
export type Tono = "cercano" | "institucional";
export type Persona = "tercera" | "nosotros";

/** De dónde sale una fuente (0146). Las noticias siguen siendo la mayoría. */
export type TipoFuente = "noticia" | "proyecto" | "cifras" | "impacto" | "documento";

/**
 * La frase que sostiene lo que dice un párrafo. `quote` es un trozo literal de
 * la fuente. Para una noticia, `news_id` es su id (como en 0145). Para otra
 * fuente, `news_id` va vacío, `ref` es su referencia («cifras:<id>:2025»,
 * «impacto:…», «proyecto:…», «documento:…») y `origen` lo que se muestra
 * («Fuente: UDES en Cifras 2025»).
 */
export interface Fuente {
  news_id: string;
  quote: string;
  kind?: TipoFuente;
  ref?: string;
  origen?: string;
}

/** Una cifra que Pilo encontró: valor tal como se muestra, qué mide y de dónde sale. */
export interface Cifra {
  v: string;
  label: string;
  src: string;
}

export interface Bloque {
  id: string;
  report_id: string;
  sec: Seccion;
  pos: number;
  origin: Origen;
  text: string;
  /** El texto tal como lo escribió Pilo; sirve para saber si una persona lo cambió. */
  orig: string;
  sources: Fuente[];
  figs: Cifra[];
  /** Aviso de Pilo para quien revisa («la nota anuncia, no cuenta»). */
  warn: string | null;
  enabled: boolean;
  /** Párrafo de reserva: desde 0146, solo los casi idénticos a otro. */
  spare: boolean;
  /** 0146: el párrafo en inglés (THE lee en inglés; el español siempre existe). */
  text_en?: string;
  /** 0146: el inglés tal como lo escribió Pilo. */
  orig_en?: string;
  /** 0146: el subtítulo temático dentro de «Qué hicimos» («Educación en los colegios»). */
  heading?: string;
  heading_en?: string;
}

export type RanuraFoto = "portada" | "n1" | "n2" | "galeria";
export type ProporcionFoto = "3:1" | "16:9" | "4:3" | "1:1";

/** El recorte de una fotografía: punto de interés (0 a 1) y proporción de la ventana. */
export interface Recorte {
  fx: number;
  fy: number;
  ratio: ProporcionFoto;
}

export interface Foto {
  report_id: string;
  news_id: string;
  use: boolean;
  slot: RanuraFoto;
  caption: string;
  alt: string;
  credit: string;
  /** «grafica» = pieza con texto (afiche), no sirve para ilustrar. */
  kind: "foto" | "grafica";
  /** Aparecen niñas, niños o adolescentes: no se publica sin autorización de imagen. */
  minors: boolean;
  /** Una persona confirmó la autorización de imagen. */
  cleared: boolean;
  crop: Recorte;
  /** 0146: la imagen elegida de la nota (news_images). null o ausente: la portada de la nota, como en 0145. */
  image_id?: string | null;
}

/** 0146: una imagen que trae una nota (portada o cuerpo). Pilo solo elige entre estas; no crea imágenes. */
export interface ImagenNota {
  id: string;
  news_id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string;
  credit: string;
  pos: number;
  is_cover: boolean;
  kind: "foto" | "grafica";
  minors: boolean;
  alt: string;
}

/** 0146: una cifra del libro de cifras de una nota, con su cita literal. */
export interface CifraNota {
  id: string;
  news_id: string;
  value: string;
  num: number | null;
  unit: string;
  label: string;
  quote: string;
  kind: "personas" | "instituciones" | "horas" | "dinero" | "porcentaje" | "eventos" | "otro";
  /** 0 = Pilo dijo que no es un logro de la UDES. */
  score: number;
  /** Pilo ya la revisó. */
  checked: boolean;
}

/** 0146: la ficha de hechos de una evidencia, en inglés (la define pagina.ts). */
export type { FichaEvidencia } from "./pagina";

/** 0146: la pre-evaluación de Pilo como evaluador de THE (interna; nunca aprueba). */
export interface Evaluacion {
  grade: "s" | "g" | "n";
  confidence: number;
  reasons: string[];
  /** Qué dato faltaría para que sea específica. */
  missing: string[];
  risks: string[];
  at?: string;
}

/** 0146: una fila del «Registro de actividades» (todas las notas del ODS). */
export interface RegistroActividad {
  news_id: string;
  published_on: string | null;
  campus: string;
  section: string;
  title: string;
  title_en: string;
  url: string;
  figure_value: string | null;
  figure_label: string | null;
  /** La cita algún párrafo; si no, la nota está solo en el registro. */
  en_narrativa: boolean;
}

/** Valoración de Pilo de una nota para un indicador. */
export interface Candidata {
  news_id: string;
  /** «s» específica (1 punto), «g» general (0,5), «n» no relevante (0). */
  rel: "s" | "g" | "n";
  why: string;
  flags: string[];
}

/** Lo que se eligió y se armó para un indicador de THE. */
export interface EleccionIndicador {
  report_id: string;
  indicator: string;
  /** La única nota que sirve de evidencia. */
  news_id: string | null;
  candidates: Candidata[];
  /** Respuestas que solo una persona sabe («¿los actos son gratuitos?»). */
  ask: Record<string, string>;
  /** Frases de la nota, literales, para la página de evidencia. */
  page_es: string[];
  /** Texto de envío en inglés. */
  page_en: string;
  approved: boolean;
  /** 0146: la ficha de hechos para el LLM de THE ({} si aún no hay). */
  ficha?: Partial<import("./pagina").FichaEvidencia>;
  /** 0146: la pre-evaluación de Pilo, o null. Interna: el público no la ve. */
  eval?: Evaluacion | null;
}

export interface AjustesInforme {
  tone: Tono;
  person: Persona;
  /** 0146: describir fotos con el modelo de visión (si está configurado). Apagado por defecto. */
  vision?: boolean;
}

export interface Informe {
  id: string;
  ods: number;
  edition: number;
  state: EstadoInforme;
  settings: AjustesInforme;
  updated_at: string;
}

/** Todo lo de un informe, como lo lee la intranet. */
export interface InformeCompleto {
  informe: Informe;
  bloques: Bloque[];
  fotos: Foto[];
  elecciones: EleccionIndicador[];
}

/** Lo que lee el portal público: solo lo aprobado y publicado. */
export interface InformePublico {
  informe: Pick<Informe, "id" | "ods" | "edition" | "updated_at">;
  bloques: Pick<Bloque, "id" | "sec" | "pos" | "text" | "sources" | "figs" | "text_en" | "heading" | "heading_en">[];
  /** `url`: la imagen elegida (0146) o la portada de la nota. */
  fotos: (Pick<Foto, "news_id" | "slot" | "caption" | "alt" | "credit" | "crop" | "image_id"> & { url?: string | null })[];
  /** 0146: el «Registro de actividades»: todas las notas del ODS, en orden cronológico. */
  registro?: RegistroActividad[];
}

/** Un indicador de THE de los que piden evidencia o datos, sacado de la metodología. */
export interface IndicadorTHE {
  /** «4.3.4», «13.3.1». */
  id: string;
  ods: number;
  /** Nombre corto en español. */
  titulo: string;
  /** ev: pide evidencia (existencia + evidencia + pública). doc: pide un documento institucional.
   *  dato: pide una cifra. inv: investigación (Scopus), la calcula THE. */
  tipo: "ev" | "doc" | "dato" | "inv";
  /** Peso en el ODS, en %. */
  peso: number | null;
  /** La pregunta de THE, resumida. */
  pregunta: string;
  /** Cómo puntúa, en una frase. */
  regla: string;
  /** Puntos máximos de la evidencia (normalmente 3). */
  maximo: number;
  /** Si una persona debe confirmar algo antes de contar los puntos. */
  pregunta_persona?: { clave: string; texto: string; opciones: { valor: string; etiqueta: string }[]; por_defecto: string };
}

/** Puntos de una evidencia: existencia + relevancia + que sea pública (máximo 3 en la mayoría). */
export function puntosEvidencia(existencia: number, rel: "s" | "g" | "n", publica = true): { existencia: number; relevancia: number; publica: number; total: number } {
  const relevancia = rel === "s" ? 1 : rel === "g" ? 0.5 : 0;
  const pub = publica ? 1 : 0;
  return { existencia, relevancia, publica: pub, total: existencia + relevancia + pub };
}
