/* =============================================================================
   THE Impact · lo que fija la metodología 2027 (versión 1.1) para el reporte.

   Fuente: «Metodología de los Sustainability Impact Ratings 2027» (THE), traducción al
   español, Spanish_THE_Impact_Rankings_METHODOLOGY_2027.pdf en la raíz del repositorio:
   «Fechas» (p. 5), «Notas sobre el uso de LLM» (p. 8) y el Apéndice 2, «Envío de datos»
   (pp. 158-159). Lo que NO dice el documento queda marcado como decisión propia.
   Sin red ni React: lo comparten las pantallas y la validación de archivos.
   ========================================================================== */

export const METODOLOGIA = {
  clave: "the-2027",
  nombre: "Metodología 2027 · versión 1.1",
  /** Edición que se publica en junio de 2027. */
  edicion: 2027,
  /** Año académico que se reporta: el que termina en 2025 (natural, académico o fiscal). */
  anioDatos: 2025,
  /** Quinquenio bibliométrico (Scopus) que calcula THE; no se envía. */
  biblioDesde: 2021,
  biblioHasta: 2025,
  /** ODS que debe entregar para entrar en la clasificación general: al menos cuatro, uno de ellos el 17. */
  minimoOds: 4,
  odsObligatorio: 17,
} as const;

/** Formatos de archivo que THE acepta como evidencia (Apéndice 2: .doc, .pdf, Excel, .gif, .jpeg, .png). */
export const FORMATOS_ARCHIVO = ["pdf", "doc", "docx", "xls", "xlsx", "gif", "jpg", "jpeg", "png"] as const;
/** Formatos que THE rechaza de forma expresa (.rar, .txt, .zip) o que no deben incluirse (video, audio). */
export const FORMATOS_RECHAZADOS = ["rar", "txt", "zip", "csv", "mp4", "mov", "avi", "mkv", "mp3", "wav", "m4a"] as const;
/** El documento no fija un tope de tamaño: se usa el de ranking_evidence (0149), 15 MB. Decisión propia. */
export const TOPE_ARCHIVO = 15 * 1024 * 1024;
export const TOPE_NOTA = 400;

export const extensionDe = (nombre: string): string => (/\.([A-Za-z0-9]{1,5})$/.exec(nombre)?.[1] ?? "").toLowerCase();

/** Un nombre que la base acepta: letras, números, punto, guion y guion bajo (máximo 150). */
export function nombreSeguro(nombre: string): string {
  const ext = extensionDe(nombre);
  const base = nombre.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 140);
  return `${limpio || "evidencia"}${ext ? `.${ext}` : ""}`;
}

export interface ValidacionArchivo {
  ok: boolean;
  /** Por qué no se puede subir (si ok es falso). */
  error?: string;
  /** Lo que conviene saber aunque se pueda subir. */
  avisos: string[];
}

/** Revisa un archivo antes de pedir la reserva: la base vuelve a comprobarlo (thi_reservar_evidencia). */
export function validarArchivo(nombre: string, tamano: number): ValidacionArchivo {
  const ext = extensionDe(nombre);
  const avisos: string[] = [];
  if (!ext || !(FORMATOS_ARCHIVO as readonly string[]).includes(ext)) {
    const rechazado = (FORMATOS_RECHAZADOS as readonly string[]).includes(ext);
    return {
      ok: false,
      avisos,
      error: rechazado
        ? `THE no acepta archivos .${ext} como evidencia. Use PDF, Word, Excel, GIF, JPG o PNG; para una página web, agregue el enlace.`
        : "Ese tipo de archivo no es de los que acepta THE (PDF, Word, Excel, GIF, JPG o PNG).",
    };
  }
  if (tamano <= 0) return { ok: false, avisos, error: "El archivo está vacío." };
  if (tamano > TOPE_ARCHIVO) return { ok: false, avisos, error: "El archivo pesa más de 15 MB." };
  avisos.push("THE califica un archivo adjunto como no público, aunque su contenido lo sea. Si existe una página pública, agregue también el enlace.");
  if (["doc", "docx", "xls", "xlsx"].includes(ext)) avisos.push("Si solo una parte sirve, indíquela en la nota: THE no revisa el documento entero.");
  return { ok: true, avisos };
}

/** ¿Es una dirección que THE puede leer como evidencia pública? (misma regla de la base, para avisar antes). */
export function validarEnlace(texto: string): string | null {
  const url = texto.trim();
  if (!/^https:\/\/[^\s]{3,490}$/.test(url)) return "El enlace debe empezar por https:// y no llevar espacios.";
  const host = /^https:\/\/([^/:?#]+)/.exec(url)?.[1]?.toLowerCase() ?? "";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host)) {
    return "El enlace debe apuntar a un sitio público con dominio, no a una dirección interna.";
  }
  return null;
}

/** Cómo se lee la columna `evidencia` de thi_requisitos. */
export const TEXTO_EVIDENCIA: Record<"obligatoria" | "respaldo" | "no_aplica", { etiqueta: string; detalle: string }> = {
  obligatoria: {
    etiqueta: "Evidencia obligatoria",
    detalle: "Si la universidad dice que lo hace, THE solo puntúa con evidencia: hasta 1 punto por la evidencia y 1 más si es pública.",
  },
  respaldo: {
    etiqueta: "Evidencia de respaldo",
    detalle: "Puntúa la cifra que se envía; la evidencia sirve de apoyo y no suma puntos.",
  },
  no_aplica: {
    etiqueta: "No pide evidencia",
    detalle: "La calcula THE con datos de Scopus (investigación); no se envía nada.",
  },
};

export const TEXTO_TIPO: Record<"ev" | "doc" | "dato" | "inv", string> = { ev: "Existencia y evidencia", doc: "Documento institucional", dato: "Cifra", inv: "Investigación" };

/** Reglas generales de evidencia, en el orden en que conviene leerlas al subir (resumen del Apéndice 2 y de las notas de la p. 8). */
export const REGLAS_EVIDENCIA: readonly string[] = [
  "Lo mejor es un enlace a una página pública: los datos públicos son evidencia sólida y THE los califica como públicos.",
  "Un archivo adjunto se califica como no público aunque su contenido lo sea.",
  "THE evalúa una sola evidencia por indicador: elija la mejor.",
  "La evidencia debe bastarse sola: quien la revisa no abre enlaces ni explora otras páginas. Un documento o página con muchos enlaces se rechaza.",
  "Solo declarar que se pertenece a algo, con un enlace a un sitio de terceros, no es evidencia: la información debe verse en la evidencia misma.",
  "Si solo una parte del documento sirve, indique cuál en la nota; THE no lee el documento entero para encontrarla.",
  "La evidencia en línea debe seguir pública hasta el inicio del siguiente ciclo de recolección de THE.",
  "Formatos de archivo: PDF, Word, Excel, GIF, JPG y PNG. No se aceptan .rar, .txt ni .zip, ni videos ni audios.",
];
