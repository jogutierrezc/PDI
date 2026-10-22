/* =============================================================================
   UDrive · cifras vivas del documento, sin React ni Supabase.

   Un párrafo cita [[clave]] (el módulo Informes ya define los tokens en
   informes/tokens.ts y la presentación en informes/cifras-vivas.ts; aquí se
   reutilizan). El valor vivo sale de UDES en Cifras (drive_cifras_vivas, 0188).
   Mientras el documento no esté aprobado se muestra el vivo y se avisa si
   cambió desde que la persona lo revisó (`vistas`). Aprobado, manda el valor
   congelado en `congeladas`: lo que se aprobó es lo que se lee y se imprime.
   ========================================================================== */

import { extraerTokens } from "../../informes/tokens";
import { formatoCifra } from "../../informes/cifras-vivas";
import type { CifraCongelada, Documento } from "./documento";
import { clavesDeCifras } from "./texto";

export interface LecturaCifra {
  clave: string;
  valor: number | null;
  fuente: string;
  corte: string | null;
}

export interface CifraResuelta {
  clave: string;
  /** Lo que se pinta: «2.580», o «sin dato» si la base no tiene valor. */
  texto: string;
  fuente: string;
  corte: string | null;
  congelada: boolean;
  /** Cambió desde que se revisó: «de 2.400 a 2.580». */
  cambio: string | null;
  /** ¿Hay valor? Sin valor el PDF no debe salir como aprobado. */
  conValor: boolean;
}

export const SIN_DATO = "sin dato";

export function textoDeLectura(l: LecturaCifra | undefined): string {
  return l && l.valor !== null ? formatoCifra(l.valor) : SIN_DATO;
}

/** Todas las claves de cifras que usa el documento, sin repetir. */
export function clavesDelDocumento(doc: Pick<Documento, "bloques">): string[] {
  const textos: string[] = [];
  for (const b of doc.bloques) {
    if (b.tipo === "parrafo" || b.tipo === "destacado" || b.tipo === "nota") textos.push(b.texto);
    else if (b.tipo === "lista") textos.push(...b.items);
    else if (b.tipo === "grafica" || b.tipo === "tabla" || b.tipo === "imagen") textos.push(b.titulo, b.nota);
  }
  return [...new Set(textos.flatMap((t) => [...clavesDeCifras(t), ...extraerTokens(t)]))];
}

/** El valor que se pinta para una clave, según el estado del documento. */
export function resolverCifra(doc: Pick<Documento, "vistas" | "congeladas">, clave: string, lecturas: ReadonlyMap<string, LecturaCifra>, aprobado: boolean): CifraResuelta | null {
  const k = clave.toLowerCase();
  if (aprobado) {
    const c = doc.congeladas?.[k];
    if (c) return { clave: k, texto: c.texto, fuente: c.fuente, corte: c.corte, congelada: true, cambio: null, conValor: c.texto !== SIN_DATO };
  }
  const l = lecturas.get(k);
  if (!l) return null;
  const texto = textoDeLectura(l);
  const visto = doc.vistas?.[k];
  const cambio = visto !== undefined && l.valor !== null && visto !== texto ? `de ${visto} a ${texto}` : null;
  return { clave: k, texto, fuente: l.fuente, corte: l.corte, congelada: false, cambio, conValor: l.valor !== null };
}

/** Lo que se guarda al aprobar: el valor de cada cifra del documento en ese momento. */
export function congelar(doc: Pick<Documento, "bloques">, lecturas: ReadonlyMap<string, LecturaCifra>): Record<string, CifraCongelada> {
  const salida: Record<string, CifraCongelada> = {};
  for (const k of clavesDelDocumento(doc)) {
    const l = lecturas.get(k.toLowerCase());
    if (l) salida[k.toLowerCase()] = { texto: textoDeLectura(l), fuente: l.fuente, corte: l.corte };
  }
  return salida;
}

/** Las cifras que cambiaron desde la última revisión, para el aviso del encabezado. */
export function cifrasCambiadas(doc: Pick<Documento, "vistas" | "bloques">, lecturas: ReadonlyMap<string, LecturaCifra>): { clave: string; de: string; a: string }[] {
  const salida: { clave: string; de: string; a: string }[] = [];
  for (const k of clavesDelDocumento(doc)) {
    const l = lecturas.get(k.toLowerCase());
    const visto = doc.vistas?.[k.toLowerCase()];
    if (l && l.valor !== null && visto !== undefined && visto !== textoDeLectura(l)) salida.push({ clave: k, de: visto, a: textoDeLectura(l) });
  }
  return salida;
}

/** Claves que el documento cita y la base no devolvió (no existen en el catálogo). */
export function clavesSinFuente(doc: Pick<Documento, "bloques">, lecturas: ReadonlyMap<string, LecturaCifra>): string[] {
  return clavesDelDocumento(doc).filter((k) => !lecturas.has(k.toLowerCase()));
}
