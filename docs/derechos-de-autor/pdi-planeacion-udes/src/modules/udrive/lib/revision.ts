/* =============================================================================
   UDrive · «revisar antes de imprimir», sin React (0190).

   Junta en una lista lo que conviene corregir antes de abrir la ventana de
   impresión: figuras sin título, tablas más anchas que la hoja, imágenes
   pesadas, texto con bajo contraste (los avisos del estilo), referencias sin
   citar y cifras que cambiaron desde la última revisión. «Bloquea» impide
   imprimir mientras no se corrija o se deje así a propósito; «avisa» se puede
   dejar; «informa» es solo una nota.
   ========================================================================== */

import type { BGrafica, BImagen, BMapa, BTabla, Documento } from "./documento";
import { esFigura } from "./documento";
import { avisosDeEstilo } from "./estilo";
import type { Estilo, Hallazgo } from "./estilo";
import type { Figura } from "./numeracion";
import { fuentesCitadas } from "./texto";

export interface HallazgoRevision extends Hallazgo {
  id: string;
  origen: "estilo" | "contenido";
  /** Bloque donde se corrige, si es de un bloque. */
  bloqueId?: string;
}

export interface DatosRevision {
  doc: Documento;
  estilo: Estilo;
  figuras: ReadonlyMap<string, Figura>;
  /** Tablas cuyo ancho natural pasa del de la hoja (de la medición del paginado). */
  tablasAnchas: readonly string[];
  /** Peso en bytes de los archivos de UDrive y su nombre. */
  tamanos: ReadonlyMap<string, number>;
  nombres: ReadonlyMap<string, string>;
  /** Cuántas cifras vivas cambiaron desde la última revisión. */
  cifrasCambiadas: number;
}

/** Desde cuántos bytes una imagen se considera pesada para un PDF. */
export const IMAGEN_PESADA = 2_500_000;

const mb = (n: number): string => (n / 1_000_000).toFixed(1).replace(".", ",");

const citasDe = (doc: Documento): Set<string> => {
  const s = new Set<string>();
  for (const b of doc.bloques) {
    if (b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota") fuentesCitadas(b.texto).forEach((f) => s.add(f));
    else if (b.tipo === "lista") b.items.forEach((i) => fuentesCitadas(i).forEach((f) => s.add(f)));
  }
  return s;
};

export function revisarAntesDeImprimir(d: DatosRevision): HallazgoRevision[] {
  const L: HallazgoRevision[] = [];
  const { doc } = d;

  for (const b of doc.bloques) {
    if (!esFigura(b)) continue;
    const fig = d.figuras.get(b.id);
    const etiqueta = fig?.etiqueta ?? "La figura";
    const f = b as BTabla | BGrafica | BImagen | BMapa;
    if (f.tipo !== "mapa" && !f.archivoId) {
      L.push({ id: `vacia:${b.id}`, origen: "contenido", nivel: "avisa", bloqueId: b.id, texto: `${etiqueta} no tiene archivo.`, detalle: "Se imprime un aviso en su lugar. Elija el archivo de UDrive o quite el bloque." });
      continue;
    }
    if (!fig || !fig.titulo.trim()) L.push({ id: `titulo:${b.id}`, origen: "contenido", nivel: "bloquea", bloqueId: b.id, texto: `${etiqueta} no tiene título.`, detalle: "Sin título no entra al índice y no se puede citar en el texto." });
  }

  for (const id of d.tablasAnchas) {
    const fig = d.figuras.get(id);
    L.push({ id: `ancha:${id}`, origen: "contenido", nivel: "bloquea", bloqueId: id, texto: `${fig?.etiqueta ?? "Una tabla"} es más ancha que la hoja.`, detalle: "Se aprieta y puede quedar ilegible. Pásela a una sección horizontal (bloque «Salto de página») o quite columnas." });
  }

  const usadas = new Set<string>();
  for (const b of doc.bloques) if (b.tipo === "imagen" && b.archivoId) usadas.add(b.archivoId);
  if (doc.portada.imagenId) usadas.add(doc.portada.imagenId);
  if (doc.instantanea) {
    if (doc.instantanea.portada.logos.propioId) usadas.add(doc.instantanea.portada.logos.propioId);
    if (doc.instantanea.cabpie.marca.imagenId) usadas.add(doc.instantanea.cabpie.marca.imagenId);
  }
  for (const id of usadas) {
    const peso = d.tamanos.get(id);
    if (peso && peso > IMAGEN_PESADA) L.push({ id: `peso:${id}`, origen: "contenido", nivel: "avisa", texto: `La imagen «${d.nombres.get(id) ?? "sin nombre"}» pesa ${mb(peso)} MB.`, detalle: "El PDF pesará lo mismo. Si importa el tamaño, súbala más chica." });
  }

  const citadas = citasDe(doc);
  const definidas = new Set(doc.fuentes.map((f) => f.id));
  const sinCitar = doc.fuentes.filter((f) => !citadas.has(f.id));
  if (sinCitar.length && citadas.size > 0) L.push({ id: "sin-citar", origen: "contenido", nivel: "avisa", texto: sinCitar.length === 1 ? "Una fuente de la lista no se cita en el texto." : `${sinCitar.length} fuentes de la lista no se citan en el texto.`, detalle: sinCitar.slice(0, 3).map((f) => f.titulo.trim() || "Fuente sin título").join(" · ") });
  const fantasma = [...citadas].filter((c) => !definidas.has(c));
  if (fantasma.length) L.push({ id: "cita-rota", origen: "contenido", nivel: "bloquea", texto: fantasma.length === 1 ? "El texto cita una fuente que no existe." : `El texto cita ${fantasma.length} fuentes que no existen.`, detalle: "Aparece «(fuente sin definir)» en el PDF. Defínala en «Fuentes de las citas»." });

  if (d.cifrasCambiadas > 0) L.push({ id: "cifras", origen: "contenido", nivel: "avisa", texto: d.cifrasCambiadas === 1 ? "Una cifra viva cambió desde su última revisión." : `${d.cifrasCambiadas} cifras vivas cambiaron desde su última revisión.`, detalle: "Acepte los valores nuevos en «Documento» o deje los anteriores a propósito." });

  avisosDeEstilo(d.estilo).forEach((h, i) => L.push({ ...h, id: `estilo:${i}`, origen: "estilo" }));
  const orden = { bloquea: 0, avisa: 1, info: 2 } as const;
  return L.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

/** ¿Algo impide imprimir? Lo que bloquea y no se dejó así a propósito. */
export const bloqueos = (hallazgos: readonly HallazgoRevision[], ignorados: ReadonlySet<string>): HallazgoRevision[] => hallazgos.filter((h) => h.nivel === "bloquea" && !ignorados.has(h.id));
