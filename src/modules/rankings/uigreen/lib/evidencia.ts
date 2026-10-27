/* =============================================================================
   UI GreenMetric · evidencias: nombres, validadores y rutas (puros).

   Reglas de la guía 2026 (p. 52): cada archivo de evidencia, PDF de máximo 2 MB;
   descripciones en inglés (si el original no lo está, se entrega traducción);
   un enlace debe ser de acceso público. Decisión aprobada: la optimización se
   hace al EXPORTAR, no al subir; por eso un PDF de más de 2 MB o un archivo que
   no es PDF se aceptan con aviso. Límites duros (los mismos de 0211): formatos
   de la lista y 25 MB.
   ========================================================================== */

import { slugArchivo } from "./catalogo";
import type { CategoriaCatalogo, ConfigCiclo, PreguntaCatalogo } from "./tipos";

export const PDF_MAX_BYTES = 2 * 1024 * 1024;
export const ARCHIVO_MAX_BYTES = 25 * 1024 * 1024;
export const EXTENSIONES_EVIDENCIA = ["pdf", "png", "jpg", "jpeg", "docx", "doc", "xlsx", "xls", "csv", "txt"] as const;
export const EXTENSIONES_IMAGEN = ["png", "jpg", "jpeg"] as const;
/** La restricción de nombre de la ruta de Storage de UDrive (0205). */
export const NOMBRE_ARCHIVO_RE = /^[A-Za-z0-9._-]{1,150}$/;

export const extensionDe = (nombre: string): string => (nombre.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "").toLowerCase();

/**
 * Nombre normalizado de una evidencia: «<pregunta>_<descripción>_<año>.<ext>», sin acentos ni espacios.
 * Ej.: normalizarNombreEvidencia({ q: "1.10", descripcion: "Mapa de zonas verdes", anio: 2025, extension: "pdf" })
 *      → «1_10_mapa-de-zonas-verdes_2025.pdf».
 */
export function normalizarNombreEvidencia(e: { q: string; descripcion: string; anio: number; extension: string }): string {
  const ext = e.extension.toLowerCase().replace(/^\./, "");
  const desc = slugArchivo(e.descripcion || "evidencia", 70).toLowerCase().replace(/_/g, "-") || "evidencia";
  return `${e.q.replace(".", "_")}_${desc}_${e.anio}.${ext}`.slice(0, 150);
}

/** Convierte el nombre de un archivo cualquiera en uno aceptable (para el caso en que la persona no use el normalizado). */
export function limpiarNombreArchivo(nombre: string): string {
  const ext = extensionDe(nombre);
  const base = nombre.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const limpio = slugArchivo(base, 120).replace(/_/g, "-").toLowerCase() || "archivo";
  return ext ? `${limpio}.${ext}` : limpio;
}

export interface ValidacionArchivo {
  ok: boolean;
  /** Impiden subir. */
  errores: string[];
  /** Se puede subir, pero hay que saberlo. */
  avisos: string[];
}

export function validarArchivoEvidencia(a: { nombre: string; tamano: number; idioma?: "en" | "es" }): ValidacionArchivo {
  const errores: string[] = [];
  const avisos: string[] = [];
  const ext = extensionDe(a.nombre);
  if (!NOMBRE_ARCHIVO_RE.test(a.nombre)) errores.push("El nombre solo puede llevar letras, números, punto, guion y guion bajo (máximo 150).");
  if (!(EXTENSIONES_EVIDENCIA as readonly string[]).includes(ext)) errores.push("Ese tipo de archivo no se admite: use PDF, imagen, Word, Excel o CSV.");
  if (a.tamano <= 0) errores.push("El archivo está vacío.");
  else if (a.tamano > ARCHIVO_MAX_BYTES) errores.push("El archivo pesa más de 25 MB.");
  if (!errores.length) {
    if (ext === "pdf" && a.tamano > PDF_MAX_BYTES) avisos.push("La guía pide PDF de máximo 2 MB. Se acepta y se comprime al exportar.");
    if (ext !== "pdf") avisos.push("La guía pide PDF. Este archivo se acepta como material de trabajo y se convierte al exportar.");
    if (a.idioma === "es") avisos.push("La guía pide las descripciones y la evidencia en inglés.");
  }
  return { ok: errores.length === 0, errores, avisos };
}

export interface ValidacionEnlace {
  ok: boolean;
  error?: string;
  url?: string;
}

/** Mismo criterio que ugm_agregar_enlace (0211): https, con dominio, sin direcciones internas. */
export function validarEnlacePublico(crudo: string): ValidacionEnlace {
  const url = crudo.trim();
  if (!/^https:\/\/\S{3,490}$/.test(url)) return { ok: false, error: "El enlace debe empezar por https:// y no llevar espacios. La guía exige que sea de acceso público." };
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "El enlace no es una dirección válida." };
  }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return { ok: false, error: "El enlace debe apuntar a un sitio público con dominio, no a una dirección interna." };
  }
  return { ok: true, url };
}

/** La ruta de carpetas de UDrive donde va la evidencia de una pregunta. */
export function rutaCarpetaEvidencia(anio: number, categoria: Pick<CategoriaCatalogo, "carpeta_nombre">, pregunta: Pick<PreguntaCatalogo, "carpeta_nombre">): string[] {
  return ["Datos de Sostenibilidad", "UI GreenMetric", `Edición ${anio}`, categoria.carpeta_nombre, ...(pregunta.carpeta_nombre ? [pregunta.carpeta_nombre] : [])];
}

export const rutaComoTexto = (partes: readonly string[]): string => partes.join(" › ");

/** Descripción corta para sugerir el nombre a partir del que trae el archivo («IMG 2031 vista aérea.png» → «img-2031-vista-aerea»). */
export function descripcionDeNombre(nombre: string): string {
  return slugArchivo(nombre.replace(/\.[A-Za-z0-9]{1,5}$/, ""), 50).replace(/_/g, "-").toLowerCase();
}

/** Dimensiones de un PNG o JPEG por su cabecera (sin decodificar la imagen). Nulo si no se reconoce. */
export function dimensionesImagen(bytes: Uint8Array): { tipo: "png" | "jpg"; ancho: number; alto: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { tipo: "png", ancho: v.getUint32(16), alto: v.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marca = bytes[i + 1];
      if (marca === 0xff) {
        i++;
        continue;
      }
      // SOF0–SOF15, salvo DHT (C4), JPG (C8) y DAC (CC).
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { tipo: "jpg", alto: (bytes[i + 5] << 8) | bytes[i + 6], ancho: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}

/** Descripción de la edición para el paquete: «UIGM-2027_UDES». */
export function nombrePaquete(cfg: Pick<ConfigCiclo, "universidad">, anio: number): string {
  return `UIGM-${anio}_${(cfg.universidad.match(/\(([A-Za-z0-9]{2,12})\)/)?.[1] ?? slugArchivo(cfg.universidad, 30)) || "universidad"}`;
}
