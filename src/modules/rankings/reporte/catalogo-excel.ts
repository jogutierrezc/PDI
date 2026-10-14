/* =============================================================================
   Catálogo del ciclo · lee el Excel de THE (Impact_2026_…xlsx) y lo convierte
   en filas de `ranking_indicators` y de sus oficinas.

   Qué sale de cada hoja «SDGn»:
     · la métrica (ref 4.2) y el indicador (ref 4.3.1), con su texto en inglés
       (siempre en la columna que sigue a la referencia) y en español (la
       columna «Metrica / Indicador …», cuando la hoja la trae);
     · las opciones: las filas siguientes con la misma referencia son campos o
       subopciones del indicador («Number of graduates», «Ad hoc»…). Se
       numeran «4.2.1/2», «4.2.1/3»…; el padre es el indicador;
     · el tipo, a partir de «Tipo de requerimiento» (o, si la hoja no lo trae,
       de la hoja summary: formato Continuous = dato, política = doc, evidencia
       = ev). Lo que no se puede inferir sale como ev y con advertencia;
     · el peso oficial THE, la prioridad, la oficina coordinadora, las oficinas
       responsables y las de apoyo (separadas por « / »).

   Las hojas de 7 columnas (SDG1–3, 6–9, 11–16) solo traen el texto en inglés:
   producen el mismo catálogo, con peso y oficinas nulos.

   Este archivo no hace red ni lee el disco: recibe un ExcelJS.Workbook ya
   cargado (lo carga la pantalla o la prueba). La hoja «CONTROL UDES 2026» no
   se lee: es la vista de seguimiento, con las mismas filas.
   ========================================================================== */

import type ExcelJS from "exceljs";
import type { Indicador, Nivel, Prioridad, TipoIndicador } from "./tipos";

/** Una fila del catálogo, con sus oficinas y de dónde salió en el Excel. */
export interface FilaCatalogo extends Indicador {
  /** Oficina coordinadora (columna «Coordinación del reporte»). */
  coordinacion: string;
  /** Oficinas responsables (columna «Responsable / fuente principal»). */
  responsables: string[];
  /** Oficinas de apoyo (columna «Dependencia(s) de apoyo»). */
  apoyo: string[];
  hoja: string;
  fila: number;
}

export interface CatalogoExcel {
  /** ODS que tienen hoja en el Excel, en orden. */
  ods: number[];
  filas: FilaCatalogo[];
  /** Cosas que no se pudieron leer o inferir, para mostrar a Planeación. */
  advertencias: string[];
}

/** Lo que dice la hoja summary de una referencia. */
interface ResumenRef {
  formato: string;
  evidencia: boolean;
  politica: boolean;
}

/** Quita acentos, pasa a minúsculas y colapsa espacios. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Texto de cualquier celda de ExcelJS: cadenas, números, fechas, texto
 * enriquecido, fórmulas (su resultado) e hipervínculos. Siempre devuelve
 * cadena, sin espacios de sobra.
 */
export function textoCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.replace(/\s+/g, " ").trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: unknown }[]).map((r) => String(r.text ?? "")).join("").replace(/\s+/g, " ").trim();
    }
    if ("result" in o) return textoCelda(o.result);
    if (typeof o.text === "string") return o.text.replace(/\s+/g, " ").trim();
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return "";
}

/** Número de una celda, o nulo. Acepta coma decimal («0,154»). */
export function numeroCelda(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const t = textoCelda(valor).replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Prioridad de la hoja («=Alta» es una fórmula con resultado «Alta»). */
export function prioridadDesde(valor: unknown): Prioridad | null {
  const t = normalizar(textoCelda(valor).replace(/^=/, ""));
  return t === "alta" || t === "media" || t === "baja" ? t : null;
}

/**
 * Tipo de un indicador a partir de «Tipo de requerimiento». «Política /
 * evidencia pública» es un documento (doc): una noticia no lo reemplaza.
 */
export function tipoDeRequerimiento(texto: string): TipoIndicador | null {
  const t = normalizar(texto);
  if (!t) return null;
  if (/scopus|investigacion/.test(t)) return "inv";
  if (/politica|documento/.test(t)) return "doc";
  if (/dato|cuantitativ|cifra/.test(t)) return "dato";
  if (/evidencia/.test(t)) return "ev";
  return null;
}

/** Tipo a partir de la hoja summary, cuando la hoja SDG no trae requerimiento. */
export function tipoDeResumen(r: ResumenRef | undefined): TipoIndicador | null {
  if (!r) return null;
  if (/continuous/i.test(r.formato)) return "dato";
  if (r.politica) return "doc";
  if (r.evidencia) return "ev";
  return null;
}

/** Oficinas de una celda: «A / B / C» → [A, B, C]. */
export function oficinasDe(texto: string): string[] {
  return texto
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function resumenDeHoja(wb: ExcelJS.Workbook): Map<string, ResumenRef> {
  const mapa = new Map<string, ResumenRef>();
  const hoja = wb.getWorksheet("summary");
  if (!hoja) return mapa;
  const si = (v: string) => /^yes$/i.test(v);
  hoja.eachRow((row) => {
    const ref = textoCelda(row.getCell(1).value);
    if (!/^\d+(\.\d+){1,2}$/.test(ref)) return;
    mapa.set(ref, {
      formato: textoCelda(row.getCell(3).value),
      evidencia: si(textoCelda(row.getCell(4).value)),
      politica: si(textoCelda(row.getCell(5).value)),
    });
  });
  return mapa;
}

/** Columnas de la hoja, por el encabezado de la fila «Type». Nulo si no hay encabezado. */
function encabezados(ws: ExcelJS.Worksheet): { fila: number; tipo: number; ref: number; en: number; es: number | null; coordinacion: number | null; responsable: number | null; apoyo: number | null; requerimiento: number | null; peso: number | null; prioridad: number | null } | null {
  for (let fila = 1; fila <= Math.min(5, ws.rowCount); fila++) {
    const fijas = new Map<string, number>();
    ws.getRow(fila).eachCell({ includeEmpty: false }, (cell, col) => {
      fijas.set(normalizar(textoCelda(cell.value)), col);
    });
    const tipo = fijas.get("type");
    if (tipo === undefined) continue;
    const buscar = (pref: string) => {
      for (const [h, col] of fijas) if (h.startsWith(pref)) return col;
      return null;
    };
    const ref = buscar("metric and indicator reference") ?? 2;
    const en = ref + 1;
    // La columna en español es la primera «Metrica / Indicador…» después de la inglesa.
    const candidatas = [...fijas].filter(([h, col]) => col > en && h.startsWith("metrica")).map(([, col]) => col);
    const es = candidatas.length > 0 ? Math.min(...candidatas) : null;
    return {
      fila,
      tipo,
      ref,
      en,
      es,
      coordinacion: buscar("coordinacion"),
      responsable: buscar("responsable"),
      apoyo: buscar("dependencia"),
      requerimiento: buscar("tipo de requerimiento"),
      peso: buscar("peso oficial"),
      prioridad: fijas.get("prioridad") ?? null,
    };
  }
  return null;
}

/** Convierte el libro ya cargado en el catálogo del ciclo. Pura: no toca la red ni el disco. */
export function leerCatalogo(wb: ExcelJS.Workbook): CatalogoExcel {
  const resumen = resumenDeHoja(wb);
  const filas: FilaCatalogo[] = [];
  const advertencias: string[] = [];
  const ods: number[] = [];

  const hojas = wb.worksheets
    .map((ws) => ({ ws, n: /^SDG\s*(\d{1,2})$/i.exec(ws.name)?.[1] }))
    .filter((h): h is { ws: ExcelJS.Worksheet; n: string } => h.n !== undefined)
    .map((h) => ({ ws: h.ws, n: Number(h.n) }))
    .filter((h) => h.n >= 1 && h.n <= 17)
    .sort((a, b) => a.n - b.n);

  for (const { ws, n } of hojas) {
    ods.push(n);
    const cols = encabezados(ws);
    if (!cols) {
      advertencias.push(`${ws.name}: no encuentro la fila de encabezados («Type»); la hoja se omite.`);
      continue;
    }
    const vistos = new Map<string, number>(); // referencia de 3 partes → filas vistas (1 = el indicador)
    const celda = (row: ExcelJS.Row, col: number | null) => (col === null ? "" : textoCelda(row.getCell(col).value));

    ws.eachRow((row, fila) => {
      if (fila <= cols.fila) return;
      const ref = celda(row, cols.ref);
      if (!/^\d+(\.\d+){1,2}$/.test(ref)) return;
      const partes = ref.split(".");
      if (Number(partes[0]) !== n) {
        advertencias.push(`${ws.name} fila ${fila}: la referencia ${ref} no es de ODS ${n}.`);
      }
      const en = celda(row, cols.en);
      const es = celda(row, cols.es);
      const req = celda(row, cols.requerimiento);
      const pesoCrudo = numeroCelda(cols.peso === null ? null : row.getCell(cols.peso).value);
      const base = {
        ods: n,
        texto_en: en,
        texto_es: es,
        prioridad: cols.prioridad === null ? null : prioridadDesde(row.getCell(cols.prioridad).value),
        tipo_requerimiento: req,
        coordinacion: celda(row, cols.coordinacion),
        responsables: oficinasDe(celda(row, cols.responsable)),
        apoyo: oficinasDe(celda(row, cols.apoyo)),
        hoja: ws.name,
        fila,
        orden: filas.length,
      };

      let peso = pesoCrudo;
      if (peso !== null && peso > 1) {
        advertencias.push(`${ws.name} fila ${fila}: el peso ${peso} parece porcentaje; se toma como ${peso / 100}.`);
        peso = peso / 100;
      }

      if (partes.length === 2) {
        if (vistos.has(ref)) {
          advertencias.push(`${ws.name} fila ${fila}: la métrica ${ref} aparece dos veces; se omite la repetida.`);
          return;
        }
        vistos.set(ref, 1);
        const nivel: Nivel = "metric";
        filas.push({ ...base, id: ref, nivel, padre: null, tipo: null, peso });
        return;
      }

      const padre = partes.slice(0, 2).join(".");
      const yaVista = vistos.get(ref);
      if (yaVista === undefined) {
        // Primera fila de la referencia: el indicador.
        const tipo = tipoDeRequerimiento(req) ?? tipoDeResumen(resumen.get(ref));
        if (tipo === null) {
          advertencias.push(`${ws.name} fila ${fila}: no puedo inferir el tipo de ${ref}; queda como evidencia (ev).`);
        }
        vistos.set(ref, 1);
        filas.push({ ...base, id: ref, nivel: "indicator", padre, tipo: tipo ?? "ev", peso, });
        return;
      }

      // Filas siguientes con la misma referencia: campos u opciones del indicador.
      const k = yaVista + 1;
      vistos.set(ref, k);
      const indicador = filas.find((f) => f.ods === n && f.id === ref && f.nivel === "indicator");
      const tipo = tipoDeRequerimiento(req) ?? indicador?.tipo ?? tipoDeResumen(resumen.get(ref)) ?? "ev";
      filas.push({ ...base, id: `${ref}/${k}`, nivel: "option", padre: ref, tipo, peso, responsables: [], apoyo: [] });
    });
  }

  return { ods, filas, advertencias };
}

/** Cuántos indicadores (no métricas ni opciones) tiene cada ODS del catálogo. */
export function indicadoresPorOds(filas: FilaCatalogo[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const f of filas) {
    if (f.nivel !== "indicator") continue;
    mapa.set(f.ods, (mapa.get(f.ods) ?? 0) + 1);
  }
  return mapa;
}
