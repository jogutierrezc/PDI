/* =============================================================================
   Informes Institucionales · capacitación de Pilo, sin React.

   Planeación sube los informes de 2025 (Word o PDF). El texto se extrae en el
   navegador con los lectores de Pilo Enseñanza (ingest/readDocument, que usa
   el lector de Word de UDES en Cifras y pdf.js) y aquí se divide por títulos.
   Lo que no sirve como ejemplo (índices, portadas, trozos muy cortos) se
   descarta con su motivo, para que Planeación lo vea antes de enviarlo a
   `pilo-informes` → `ingerir`.
   ========================================================================== */

import type { Block } from "../admin/pilo-ensenanza/ingest/types";
import { palabras } from "./tokens";
import type { Plantilla } from "./types";

export interface SeccionExtraida {
  titulo: string;
  texto: string;
}

export interface Descarte {
  titulo: string;
  motivo: string;
}

export interface Division {
  secciones: SeccionExtraida[];
  descartes: Descarte[];
}

export const MIN_PALABRAS = 25;
/** Tope por sección: un capítulo enorme se recorta (el corpus guarda ejemplos, no libros). */
export const MAX_CARACTERES = 12_000;
const INDICE = /^(tabla de )?contenido|^[íi]ndice|^tabla de contenido|^lista de (tablas|figuras|gr[áa]ficos)/i;

const textoDe = (b: Block) => (b.type === "table" ? b.rows.map((r) => r.filter(Boolean).join(" | ")).join("\n") : b.text);

/**
 * Divide los bloques por títulos. Usa el nivel de título más alto que aparezca
 * al menos dos veces (así un título único de portada no se traga el resto);
 * lo que va antes del primer título es «Presentación».
 */
export function dividirPorTitulos(bloques: Block[]): Division {
  const niveles = bloques.filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading").map((b) => b.level);
  const conteo = new Map<number, number>();
  for (const n of niveles) conteo.set(n, (conteo.get(n) ?? 0) + 1);
  const corte = [...conteo.keys()].sort((a, b) => a - b).find((n) => (conteo.get(n) ?? 0) >= 2) ?? Math.min(...niveles, 9);

  const crudas: SeccionExtraida[] = [];
  let actual: SeccionExtraida = { titulo: "Presentación", texto: "" };
  for (const b of bloques) {
    if (b.type === "heading" && b.level <= corte) {
      if (actual.texto.trim() || actual.titulo !== "Presentación") crudas.push(actual);
      actual = { titulo: b.text.trim(), texto: "" };
      continue;
    }
    const t = textoDe(b).trim();
    if (t) actual.texto += (actual.texto ? "\n\n" : "") + t;
  }
  crudas.push(actual);

  const secciones: SeccionExtraida[] = [];
  const descartes: Descarte[] = [];
  for (const s of crudas) {
    const texto = s.texto.trim();
    if (INDICE.test(s.titulo)) descartes.push({ titulo: s.titulo, motivo: "Índice o tabla de contenido" });
    else if (!texto) descartes.push({ titulo: s.titulo, motivo: "Título sin texto" });
    else if (palabras(texto) < MIN_PALABRAS) descartes.push({ titulo: s.titulo, motivo: `Muy corto (${palabras(texto)} palabras)` });
    else secciones.push({ titulo: s.titulo.slice(0, 200), texto: texto.length > MAX_CARACTERES ? `${texto.slice(0, MAX_CARACTERES)}…` : texto });
  }
  return { secciones, descartes };
}

const RUIDO = /\b(informe|info|inf|de|del|la|gesti[oó]n|final|v\d+|version|versi[oó]n|borrador)\b|\b(19|20)\d{2}\b|_\d{6,8}\b/gi;

/** La unidad que se adivina del nombre del archivo («INFO GESTIÓN VALLEDUPAR 2025.pdf» → «Valledupar»). */
export function unidadDesdeNombre(nombre: string): string {
  const base = nombre.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const limpio = base.replace(RUIDO, " ").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  // Siglas (FCS, VAF) se quedan en mayúscula; lo demás, con mayúscula inicial.
  return limpio
    .split(" ")
    .map((p) => (p.length <= 5 && p === p.toUpperCase() && /^[A-ZÁÉÍÓÚÑ]+$/.test(p) && !/^(CUCUTA|CÚCUTA)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(" ");
}

/** Plantilla probable por el nombre; nulo si no se sabe (Pilo la deduce). */
export function plantillaDesdeNombre(nombre: string): Plantilla | null {
  const n = nombre.toLowerCase();
  if (/rector[ií]a general|\brector\b/.test(n)) return "D";
  if (/campus|valledupar|c[uú]cuta|bogot[aá]|sede/.test(n)) return "C";
  if (/decan|facultad|\bf[a-z]{2,3}\b/.test(n)) return "A";
  if (/vicerrector|oficina|\bva[a-z]?\b|\bvi[a-z]?\b/.test(n)) return "B";
  return null;
}
