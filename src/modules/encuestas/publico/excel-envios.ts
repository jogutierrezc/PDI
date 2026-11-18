/* =============================================================================
   Encuestas con Pilo · «Mis envíos» en Excel.

   Quien envió logros y retos puede bajarlos en un libro de Excel: una fila por
   logro o reto, con su fecha, su estado y sus cifras, y una hoja aparte con
   las cifras una por fila. Las columnas son fijas y la hoja oculta `_Control`
   las identifica, para poder leer este mismo libro en otro proceso.

   Todo sale de lo que «Mis envíos» ya tiene en pantalla (solo lo de la persona);
   no hay llamada nueva al servidor. exceljs se carga al descargar.
   ========================================================================== */

import { construirLibro, type HojaExcel } from "../../informes/ui/excel";
import { downloadBlob } from "../../admin/traslado/transfer";
import type { CifraHist, EnvioHist, TipoCifra } from "../tipos";

export const HOJA_ENVIOS = "Logros y retos";
export const HOJA_CIFRAS = "Cifras";
export const HOJA_CONTROL_ENVIOS = "_Control";
export const FORMATO_ENVIOS = "pilo-encuestas-logros-retos";
export const VERSION_ENVIOS = 1;

export const COLUMNAS_ENVIOS = ["N.º", "Encuesta", "Fecha de envío", "Tipo", "Título", "Descripción", "Cifras", "Estado"] as const;
export const COLUMNAS_CIFRAS = ["N.º", "Tipo", "Título", "Qué mide", "Valor", "Unidad", "Tipo de cifra"] as const;

/** El tipo de cifra con el texto de la lista desplegable del libro. */
export const TEXTO_TIPO_CIFRA: Record<TipoCifra, string> = { estudiantes: "Estudiantes", programas: "Programas", porcentaje: "Porcentaje", dinero: "Dinero", otro: "Otro" };

/** De la unidad que guarda «Mis envíos» («%», «$», «estudiantes», «programas» o una palabra) al tipo de cifra. */
export function tipoDeUnidad(unidad: string): TipoCifra {
  const u = unidad.trim().toLowerCase();
  return u === "%" ? "porcentaje" : u === "$" ? "dinero" : u === "estudiantes" ? "estudiantes" : u === "programas" ? "programas" : "otro";
}

const ETAPAS = ["Recibido", "Revisado", "En el video"] as const;
const tipoTexto = (t: "logro" | "reto") => (t === "logro" ? "Logro" : "Reto");

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** «1.200 estudiantes · 72 %»: las cifras de un logro o reto en una sola celda. */
export function cifrasEnTexto(cifras: readonly CifraHist[]): string {
  return cifras
    .map((c) => {
      const n = new Intl.NumberFormat("es-CO").format(c.valor);
      const u = c.unidad === "%" ? " %" : c.unidad === "$" ? "" : c.unidad ? ` ${c.unidad}` : "";
      return `${c.unidad === "$" ? "$" : ""}${n}${u} ${c.que}`.trim();
    })
    .join(" · ");
}

export interface FilaEnvio {
  fila: (string | number | null)[];
  cifras: (string | number | null)[][];
}

/** Las filas del libro: solo los logros y retos (las respuestas de encuesta no son logros ni retos). */
export function filasDeEnvios(envios: readonly EnvioHist[]): FilaEnvio[] {
  const filas: FilaEnvio[] = [];
  let n = 0;
  for (const e of [...envios].sort((a, b) => a.creado.localeCompare(b.creado))) {
    for (const it of e.items) {
      n++;
      filas.push({
        fila: [n, e.encuesta.titulo, fecha(e.creado), tipoTexto(it.tipo), it.titulo, it.descripcion, cifrasEnTexto(it.cifras), ETAPAS[e.etapa - 1]],
        cifras: it.cifras.map((c) => [n, tipoTexto(it.tipo), it.titulo, c.que, c.valor, c.unidad, TEXTO_TIPO_CIFRA[tipoDeUnidad(c.unidad)]]),
      });
    }
  }
  return filas;
}

export function hojasDeEnvios(envios: readonly EnvioHist[], opciones: { slug: string; alcance: "esta" | "todas"; ahora?: Date }): HojaExcel[] {
  const filas = filasDeEnvios(envios);
  const hoy = (opciones.ahora ?? new Date()).toISOString().slice(0, 10);
  const titulo = opciones.alcance === "esta" ? (envios[0]?.encuesta.titulo ?? "Encuestas con Pilo") : "Todas mis encuestas";
  return [
    {
      nombre: HOJA_ENVIOS,
      banner: { titulo: "Mis logros y retos", subtitulo: `${titulo} · descargado el ${hoy}`, ayuda: "Una fila por logro o reto enviado. Las cifras de cada uno están una por fila en la hoja «Cifras»." },
      columnas: COLUMNAS_ENVIOS.map((t, i) => ({ titulo: t, ancho: [6, 30, 17, 9, 34, 60, 40, 13][i] })),
      filas: filas.map((f) => f.fila),
    },
    {
      nombre: HOJA_CIFRAS,
      banner: { titulo: "Cifras de mis logros y retos", subtitulo: titulo, ayuda: "El N.º es el mismo de la hoja «Logros y retos». Para volver a importar este libro en la encuesta (Importar desde Excel) no cambie los encabezados." },
      columnas: COLUMNAS_CIFRAS.map((t, i) => ({ titulo: t, ancho: [6, 9, 34, 36, 14, 12, 16][i] })),
      filas: filas.flatMap((f) => f.cifras),
    },
    {
      nombre: HOJA_CONTROL_ENVIOS,
      oculta: true,
      columnas: [{ titulo: "clave" }, { titulo: "valor" }],
      filas: [
        ["formato", FORMATO_ENVIOS],
        ["version", VERSION_ENVIOS],
        ["origen", "descarga"],
        ["alcance", opciones.alcance],
        ["encuesta", opciones.alcance === "esta" ? opciones.slug : ""],
        ["generado", hoy],
        ["filas", filas.length],
      ],
    },
  ];
}

export const nombreArchivoEnvios = (slug: string, alcance: "esta" | "todas", ahora = new Date()): string => `logros-y-retos-${alcance === "esta" ? slug : "todas"}-${ahora.toISOString().slice(0, 10)}.xlsx`;

export async function cargarLogo(): Promise<string | undefined> {
  try {
    const base = (import.meta.env.BASE_URL as string | undefined) ?? "/";
    const r = await fetch(`${base}logo-udes-blanco.png`);
    if (!r.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return undefined;
  }
}

/** Baja el libro. Devuelve cuántos logros y retos lleva (0: no se descarga nada). */
export async function descargarEnviosExcel(envios: readonly EnvioHist[], opciones: { slug: string; alcance: "esta" | "todas" }): Promise<number> {
  const hojas = hojasDeEnvios(envios, opciones);
  const n = hojas[0].filas.length;
  if (n === 0) return 0;
  const logo = await cargarLogo();
  const buffer = await construirLibro(hojas, { logo, filasLibres: 0 });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivoEnvios(opciones.slug, opciones.alcance));
  return n;
}
