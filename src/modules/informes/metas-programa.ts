/* =============================================================================
   Informes Institucionales · «Objetivos y metas» desde los indicadores del
   programa, sin React ni Supabase.

   La migración 0165 deja, por cada indicador que el programa seleccionó en
   Impacto (ficha adoptada o propio) y por sede, una fila de `informe_cifras`
   con clave «meta_…», la meta del año y, en `consulta`, el programa, la sede y
   si el indicador debe bajar. El valor sale en vivo o de la foto, como el de
   cualquier cifra; aquí solo se arma la fila que ve el editor.
   ========================================================================== */

import { resultadoMeta, semaforo } from "./cifras-vivas";
import type { CifraVista, Semaforo } from "./cifras-vivas";
import type { CifraRow } from "./types";

export const esMetaDelPrograma = (clave: string) => clave.startsWith("meta_");

/** Unidades que reciben esta sección desde Impacto: el programa y, sumando los suyos, la facultad. */
export const recibeMetasDeImpacto = (kind: string) => kind === "programa" || kind === "facultad";

export interface FilaMetaPrograma {
  clave: string;
  nombre: string;
  /** «Programa · Sede». */
  donde: string;
  origen: "adopcion" | "propio";
  unidad: string;
  meta: number | null;
  /** La meta escrita en la ficha cuando no tiene número («+2 pp vs LB»). */
  metaTexto: string;
  alcanzado: number | null;
  /** El indicador debe bajar (deserción). */
  baja: boolean;
  resultado: ReturnType<typeof resultadoMeta>;
  semaforo: Semaforo | null;
  cambio: CifraVista["cambio"];
  congelada: boolean;
  viva: boolean;
  fuente: string;
  corte: string | null;
}

const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** Resultado frente a la meta: si el indicador baja, estar por debajo la supera. */
export const resultadoDe = (meta: number | null, valor: number | null, baja: boolean) => (baja ? resultadoMeta(valor, meta) : resultadoMeta(meta, valor));

/** Las filas de metas del programa, en orden de programa, sede y nombre. */
export function filasMetaPrograma(filas: CifraRow[], vista: (clave: string) => CifraVista): FilaMetaPrograma[] {
  return filas
    .filter((f) => esMetaDelPrograma(f.clave))
    .map((f): FilaMetaPrograma => {
      const q = f.consulta ?? {};
      const v = vista(f.clave);
      const baja = q.baja === true;
      const meta = v.meta;
      return {
        clave: f.clave,
        nombre: v.etiqueta,
        donde: [texto(q.programa_nombre), texto(q.sede_nombre)].filter(Boolean).join(" · "),
        origen: q.origen === "propio" ? "propio" : "adopcion",
        unidad: v.unidad,
        meta,
        metaTexto: texto(q.meta_texto),
        alcanzado: v.valor,
        baja,
        resultado: resultadoDe(meta, v.valor, baja),
        semaforo: semaforo(v.valor, meta, !baja),
        cambio: v.cambio,
        congelada: v.congelada,
        viva: v.viva,
        fuente: v.fuente,
        corte: v.corte,
      };
    })
    .sort((a, b) => a.donde.localeCompare(b.donde, "es") || a.nombre.localeCompare(b.nombre, "es"));
}
