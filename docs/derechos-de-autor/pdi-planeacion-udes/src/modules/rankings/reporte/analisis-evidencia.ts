/* =============================================================================
   Análisis de una evidencia antes de guardarla · chequeos puros, sin red.

   Lo que se mira:
     · archivo: formato admitido (pdf, doc, docx, xls, xlsx, ppt, pptx, png,
       jpg), tamaño (máx. 15 MB) y año 2020–2026 en el nombre;
     · URL: https, dominio udes.edu.co y año 2020–2026 en la dirección;
     · duplicado: la misma dirección, o el mismo nombre, ya en la respuesta.

   «Fuerte» = ningún chequeo en advertencia ni en riesgo, y si es URL, que sea
   de udes.edu.co (la evidencia pública es la que más puntúa).

   Nada de esto sustituye la lectura de Planeación: es el primer filtro.
   ========================================================================== */

import type { Chequeo, NivelChequeo } from "./tipos";

export const FORMATOS_EVIDENCIA = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg"] as const;
export const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024;
export const ANIO_MINIMO = 2020;
export const ANIO_MAXIMO = 2026;
export const DOMINIO_UDES = "udes.edu.co";

/** Lo que se sabe de la evidencia al subirla. */
export interface EntradaEvidencia {
  kind: "file" | "url";
  /** Nombre del archivo (con extensión). Para una URL, puede faltar. */
  nombre?: string;
  /** Tamaño del archivo en bytes. */
  tamano?: number;
  /** Dirección completa, para kind «url». */
  url?: string;
}

/** Lo que ya tiene la respuesta, para detectar duplicados. */
export interface OtraEvidencia {
  nombre?: string;
  url?: string;
}

export interface ResultadoAnalisis {
  chequeos: Chequeo[];
  /** Nivel más alto de los chequeos: ok, warn o risk. */
  nivel: NivelChequeo;
  /** Sin advertencias ni riesgos (y de dominio UDES si es URL). */
  fuerte: boolean;
}

const ORDEN: Record<NivelChequeo, number> = { ok: 0, warn: 1, risk: 2 };

/** Extensión en minúsculas, sin el punto. Vacía si no tiene. */
export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(nombre.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Años de 4 cifras que aparecen en un texto (2019–2100). */
export function aniosEn(texto: string): number[] {
  return [...texto.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1]));
}

/** Clave para comparar direcciones: minúsculas, sin fragmento, sin barra final ni «www.». */
export function claveUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const ruta = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${ruta}${u.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function chequeoAnio(texto: string, donde: string): Chequeo {
  const anios = aniosEn(texto);
  if (anios.length === 0) {
    return { nivel: "warn", texto: `El ${donde} no dice el año; ${ANIO_MINIMO}–${ANIO_MAXIMO} debe verse en el nombre o la dirección.` };
  }
  const en = anios.filter((a) => a >= ANIO_MINIMO && a <= ANIO_MAXIMO);
  if (en.length > 0) {
    return { nivel: "ok", texto: `Año ${en[en.length - 1]} en el ${donde}.` };
  }
  return { nivel: "warn", texto: `El año del ${donde} (${anios.join(", ")}) está fuera de ${ANIO_MINIMO}–${ANIO_MAXIMO}.` };
}

function chequeoArchivo(e: EntradaEvidencia): Chequeo[] {
  const out: Chequeo[] = [];
  const nombre = (e.nombre ?? "").trim();
  if (!nombre) {
    out.push({ nivel: "risk", texto: "El archivo no tiene nombre." });
    return out;
  }

  const ext = extensionDe(nombre);
  if ((FORMATOS_EVIDENCIA as readonly string[]).includes(ext)) {
    out.push({ nivel: "ok", texto: `Formato admitido (${ext}).` });
  } else {
    out.push({ nivel: "risk", texto: `Formato no admitido${ext ? ` (.${ext})` : ""}. Use pdf, doc(x), xls(x), ppt(x), png o jpg.` });
  }

  if (e.tamano !== undefined) {
    if (e.tamano > TAMANO_MAXIMO_BYTES) {
      out.push({ nivel: "risk", texto: `Pesa ${mb(e.tamano)}; el máximo es 15 MB.` });
    } else if (e.tamano <= 0) {
      out.push({ nivel: "risk", texto: "El archivo está vacío." });
    } else {
      out.push({ nivel: "ok", texto: `Tamaño ${mb(e.tamano)}.` });
    }
  }

  out.push(chequeoAnio(nombre, "nombre"));
  return out;
}

function chequeoUrl(e: EntradaEvidencia): Chequeo[] {
  const out: Chequeo[] = [];
  const bruta = (e.url ?? "").trim();
  let u: URL | null = null;
  try {
    u = new URL(bruta);
  } catch {
    u = null;
  }
  if (!u) {
    out.push({ nivel: "risk", texto: "La dirección no es válida." });
    return out;
  }

  if (u.protocol !== "https:") {
    out.push({ nivel: "risk", texto: "La dirección debe empezar por https://." });
  } else {
    out.push({ nivel: "ok", texto: "Dirección segura (https)." });
  }

  const host = u.hostname.toLowerCase();
  if (host === DOMINIO_UDES || host.endsWith(`.${DOMINIO_UDES}`)) {
    out.push({ nivel: "ok", texto: "Dominio de la UDES." });
  } else {
    out.push({ nivel: "warn", texto: `El dominio (${host}) no es ${DOMINIO_UDES}; la evidencia pública debe estar en la web de la UDES.` });
  }

  out.push(chequeoAnio(`${u.pathname}${u.search} ${(e.nombre ?? "")}`, "enlace"));
  return out;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Chequeos de una evidencia nueva frente a las que ya tiene la respuesta.
 * Un duplicado (misma dirección o mismo nombre) es advertencia, no riesgo: a
 * veces el mismo documento sirve a dos indicadores, y eso se hace con un enlace.
 */
export function analizarEvidencia(entrada: EntradaEvidencia, otras: OtraEvidencia[] = []): ResultadoAnalisis {
  const chequeos = entrada.kind === "url" ? chequeoUrl(entrada) : chequeoArchivo(entrada);

  if (entrada.kind === "url" && entrada.url) {
    const clave = claveUrl(entrada.url);
    if (otras.some((o) => o.url && claveUrl(o.url) === clave)) {
      chequeos.push({ nivel: "warn", texto: "Esta dirección ya está en la respuesta." });
    }
  }
  if (entrada.kind === "file" && entrada.nombre) {
    const n = entrada.nombre.trim().toLowerCase();
    if (otras.some((o) => o.nombre && o.nombre.trim().toLowerCase() === n)) {
      chequeos.push({ nivel: "warn", texto: "Ya hay un archivo con ese nombre en la respuesta." });
    }
  }

  const nivel = chequeos.reduce<NivelChequeo>((peor, c) => (ORDEN[c.nivel] > ORDEN[peor] ? c.nivel : peor), "ok");
  // Una URL fuera de udes.edu.co ya es advertencia, así que «ok» basta.
  return { chequeos, nivel, fuerte: nivel === "ok" };
}
