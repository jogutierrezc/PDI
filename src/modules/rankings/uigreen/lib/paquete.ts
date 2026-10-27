/* =============================================================================
   UI GreenMetric · paquete .zip de exportación (fflate).

   Estructura que replica la carpeta oficial:
     UIGM-<año>_<sigla>/
       manifest.json                              qué contiene, versión y hash de cada respuesta, y lo que quedó fuera
       datos_para_el_sistema_en_linea.csv         las 32 preguntas sin plantilla y los valores de todas
       1_Setting_and_Infrastructure_SI/
         University_Country_1_10_….docx
         evidencias/1_10/<nombre normalizado>
       2_Energy_and_Climate_Change_EC/ …

   Solo entran respuestas LISTAS (aprobadas, traducción revisada, evidencia completa);
   las demás aparecen como advertencia en el manifiesto. Puro: recibe los bytes ya leídos.
   ========================================================================== */

import { strToU8, zipSync } from "fflate";
import type { CategoriaCatalogo, PreguntaCatalogo } from "./tipos";

export interface ItemPaquete {
  pregunta: PreguntaCatalogo;
  categoria: CategoriaCatalogo;
  lista: boolean;
  motivoNoLista?: string;
  version: number;
  /** El .docx ya lleno (solo preguntas con plantilla). */
  docx?: Uint8Array;
  nombreDocx?: string;
  evidencias: { nombre: string; bytes: Uint8Array }[];
}

export interface FilaDatos {
  q: string;
  indicador: string | null;
  nombre_en: string;
  valor: string;
  unidad: string;
  opcion: number | null;
}

export interface Manifiesto {
  generado: string;
  raiz: string;
  incluidas: { q: string; version: number; archivos: string[] }[];
  excluidas: { q: string; motivo: string }[];
}

const csv = (v: unknown): string => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Hoja de resumen para digitar en el sistema de UI: cifras y opciones (USO INTERNO). CSV UTF-8 con BOM. */
export function hojaDatosCsv(filas: readonly FilaDatos[]): string {
  const enc = ["question", "indicator", "name", "value", "unit", "option"].join(",");
  return "﻿" + [enc, ...filas.map((f) => [f.q, f.indicador, f.nombre_en, f.valor, f.unidad, f.opcion].map(csv).join(","))].join("\r\n");
}

export function armarPaquete(raiz: string, items: readonly ItemPaquete[], datos: readonly FilaDatos[]): { bytes: Uint8Array; manifiesto: Manifiesto } {
  const archivos: Record<string, Uint8Array> = {};
  const manifiesto: Manifiesto = { generado: new Date().toISOString(), raiz, incluidas: [], excluidas: [] };
  for (const it of items) {
    if (!it.lista) {
      manifiesto.excluidas.push({ q: it.pregunta.q, motivo: it.motivoNoLista ?? "No está lista para exportar." });
      continue;
    }
    const carpeta = `${raiz}/${it.categoria.carpeta_nombre}`;
    const nombres: string[] = [];
    if (it.docx && it.nombreDocx) {
      archivos[`${carpeta}/${it.nombreDocx}`] = it.docx;
      nombres.push(it.nombreDocx);
    }
    const dir = it.pregunta.q.replace(".", "_");
    for (const e of it.evidencias) {
      const ruta = `${carpeta}/evidencias/${dir}/${e.nombre}`;
      archivos[ruta] = e.bytes;
      nombres.push(`evidencias/${dir}/${e.nombre}`);
    }
    manifiesto.incluidas.push({ q: it.pregunta.q, version: it.version, archivos: nombres });
  }
  archivos[`${raiz}/datos_para_el_sistema_en_linea.csv`] = strToU8(hojaDatosCsv(datos));
  archivos[`${raiz}/manifest.json`] = strToU8(JSON.stringify(manifiesto, null, 2));
  return { bytes: zipSync(archivos, { level: 6 }), manifiesto };
}
