/* =============================================================================
   Datos de Sostenibilidad · el catálogo de indicadores y el mapa de conexión.

   Un libro se conecta a un indicador (`ds_indicadores`) con un mapa
   {slot: clave de la columna}. Los SLOTS son fijos —los define la migración
   0178 (ds_slots) y este archivo los espeja— porque todos los indicadores se
   responden igual: con una cifra, un periodo, y opcionalmente campus, fuente
   y evidencia. El indicador dice QUÉ se mide; el slot, QUÉ se responde de él.

   La semilla de indicadores son los del ODS 13 (los del marco de THE que ya
   están definidos en sostenible/ods-data.ts). El resto los añade la
   administración; INDICADORES_DS es el espejo de la semilla para la paridad
   (tests/datos-sostenibilidad) y para caer cuando la base no está aplicada.
   ========================================================================== */

import type { Columna } from "../../programas-en-cifras/tipos";
import type { DsIndicador } from "../tipos";

/** Un slot del indicador: qué parte de la respuesta sale de qué columna. */
export interface DsSlot {
  clave: "valor" | "periodo" | "campus" | "fuente" | "evidencia";
  etiqueta: string;
  /** El tipo de columna que lo puede llenar. */
  tipo: "numero" | "texto";
  obligatorio: boolean;
  pista: string;
}

/** Los cinco slots (espejo de ds_slots, 0178). */
export const SLOTS: DsSlot[] = [
  { clave: "valor", etiqueta: "Valor", tipo: "numero", obligatorio: true, pista: "La cifra del indicador: sale de una columna de número o porcentaje." },
  { clave: "periodo", etiqueta: "Periodo", tipo: "texto", obligatorio: true, pista: "Cuándo: el año, el semestre, el corte." },
  { clave: "campus", etiqueta: "Campus", tipo: "texto", obligatorio: false, pista: "Dónde: si el dato es por campus." },
  { clave: "fuente", etiqueta: "Fuente", tipo: "texto", obligatorio: false, pista: "Quién reporta la cifra." },
  { clave: "evidencia", etiqueta: "Evidencia", tipo: "texto", obligatorio: false, pista: "El documento, enlace o soporte que la respalda." },
];

export const slotDe = (clave: string) => SLOTS.find((s) => s.clave === clave);

/** La semilla de indicadores (espejo del bloque de semilla de 0178). */
export const INDICADORES_DS: DsIndicador[] = [
  { id: "13.1", ods: 13, nombre: "Investigación sobre acción climática", descripcion: "Producción científica y proyectos que atienden el cambio climático y la transición energética.", unidad: "", position: 1 },
  { id: "13.2", ods: 13, nombre: "Energía con bajas emisiones", descripcion: "Consumo de energía de fuentes limpias en los campus y plan de transición.", unidad: "%", position: 2 },
  { id: "13.3", ods: 13, nombre: "Educación ambiental", descripcion: "Cursos, campañas y jornadas que forman a la comunidad frente al clima.", unidad: "", position: 3 },
  { id: "13.4", ods: 13, nombre: "Compromiso carbono neutral", descripcion: "Certificaciones, alianzas y metas públicas de neutralidad de carbono.", unidad: "", position: 4 },
];

const esCifra = (c: Columna) => c.tipo === "numero" || c.tipo === "porcentaje";
const porEtiqueta = (c: Columna, patron: RegExp) => patron.test(c.etiqueta) || patron.test(c.clave);

/**
 * Propone el mapa de conexión de un libro a un indicador: la primera cifra
 * para el valor, y para el resto la primera columna que lo parezca por su
 * nombre. Nunca repite columna: un valor sale de una sola parte del libro.
 */
export function autoMap(columnas: readonly Columna[]): Record<string, string> {
  const usadas = new Set<string>();
  const tomar = (ok: (c: Columna) => boolean): string | undefined => {
    const col = columnas.find((c) => !usadas.has(c.clave) && ok(c));
    if (col) usadas.add(col.clave);
    return col?.clave;
  };
  const mapa: Record<string, string> = {};
  const valor = tomar(esCifra);
  if (valor) mapa.valor = valor;
  const periodo = tomar((c) => !esCifra(c) && porEtiqueta(c, /periodo|a[ñn]o|semestre|corte|vigencia|fecha/i));
  if (periodo) mapa.periodo = periodo;
  const campus = tomar((c) => !esCifra(c) && porEtiqueta(c, /campus|sede/i));
  if (campus) mapa.campus = campus;
  const fuente = tomar((c) => !esCifra(c) && porEtiqueta(c, /fuente|origen|reporta|entidad/i));
  if (fuente) mapa.fuente = fuente;
  const evidencia = tomar((c) => !esCifra(c) && porEtiqueta(c, /evidencia|enlace|url|soporte|documento/i));
  if (evidencia) mapa.evidencia = evidencia;
  return mapa;
}

/** Qué falta en un mapa para que la conexión sirva: los slots obligatorios sin columna. */
export function faltanDelMapa(mapa: Record<string, string> | null | undefined): string[] {
  return SLOTS.filter((s) => s.obligatorio && !mapa?.[s.clave]).map((s) => s.etiqueta);
}

/** Cuántos slots están conectados, para pintar el avance de la conexión. */
export function coberturaDelMapa(mapa: Record<string, string> | null | undefined): { conectados: number; total: number } {
  return { conectados: SLOTS.filter((s) => mapa?.[s.clave]).length, total: SLOTS.length };
}

/** Un nombre para un libro nuevo a partir del indicador al que va a responder. */
export function nombreSugerido(indicador: DsIndicador): string {
  return `${indicador.nombre} · ODS ${indicador.ods}`;
}
