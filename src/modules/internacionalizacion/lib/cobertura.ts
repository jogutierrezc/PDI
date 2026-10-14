/* =============================================================================
   Internacionalización · cobertura de plantillas.

   ¿Qué parte de una plantilla (SNIES, CNA, un ranking) se puede responder con
   lo que ya guarda el repositorio? Cada columna de la plantilla queda:
     directo   un concepto del repositorio la responde tal cual;
     derivado  se calcula de conceptos que sí están (el año, del periodo; el
               código del programa, de su nombre; la sede, del campus);
     falta     ningún campo la responde.
   El porcentaje es (directo + derivado) / total. Un mismo mecanismo para todas:
     · SNIES: plantillaDesdeSnies() lee el catálogo REAL de Reportes
       Institucionales (src/modules/reportes/snies/plantillas) y le aplica
       MAPEO_SNIES (campo SNIES → concepto).
     · CNA / rankings: las carga el Director (int_plantillas +
       int_plantilla_columnas); propuestaPlantilla() propone el emparejamiento
       a partir de los encabezados del CSV/Excel y él lo corrige.
   ========================================================================== */

import type { Campo, PlantillaSpec } from "../../reportes/tipos";
import type { Concepto, IntColumnaRow, IntPlantillaColumnaRow } from "../tipos";
import { emparejarConcepto, IMPLICITOS } from "./conceptos";

export type Modo = "directo" | "derivado" | "falta";

/** Una columna de una plantilla y cómo se piensa responder. */
export interface ColumnaPlantilla {
  etiqueta: string;
  /** Código del campo en la plantilla (SNIES: «NUM_DOCUMENTO»). */
  codigo?: string;
  /** Concepto que la responde (directo) o del que se deriva. */
  concepto_id: string | null;
  modo: Modo;
  /** Derivado: conceptos que hacen falta para calcularla (además de concepto_id). */
  desde?: string[];
  nota?: string;
  obligatorio?: boolean;
}

export interface PlantillaCobertura {
  id: string;
  nombre: string;
  tipo: "snies" | "cna" | "ranking" | "otra";
  columnas: ColumnaPlantilla[];
}

export interface ColumnaCubierta extends ColumnaPlantilla {
  resultado: Modo;
  /** Por qué falta, o de dónde sale. */
  motivo: string;
  /** Hojas del repositorio que llevan el concepto. */
  hojas: string[];
}

export interface Cobertura {
  total: number;
  respondidas: number;
  directas: number;
  derivadas: number;
  porcentaje: number;
  /** Obligatorias que faltan (las que impiden alimentar la plantilla). */
  obligatoriasFaltantes: string[];
  columnas: ColumnaCubierta[];
}

/** Concepto → nombres de las hojas que lo llevan. periodo y campus siempre están (van en la fila). */
export type Disponibles = ReadonlyMap<string, readonly string[]>;

/** Conceptos disponibles a partir de las columnas del repositorio. */
export function disponiblesDe(hojas: readonly { nombre: string; columnas: readonly Pick<IntColumnaRow, "concepto_id">[] }[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const h of hojas) {
    for (const c of h.columnas) {
      if (!c.concepto_id) continue;
      const lista = mapa.get(c.concepto_id) ?? [];
      if (!lista.includes(h.nombre)) lista.push(h.nombre);
      mapa.set(c.concepto_id, lista);
    }
  }
  for (const id of IMPLICITOS) if (!mapa.has(id)) mapa.set(id, ["(en cada fila)"]);
  return mapa;
}

/** Calcula la cobertura de una plantilla con los conceptos disponibles. */
export function cobertura(plantilla: Pick<PlantillaCobertura, "columnas">, disponibles: Disponibles, nombreDe: (id: string) => string = (id) => id): Cobertura {
  const columnas: ColumnaCubierta[] = plantilla.columnas.map((col) => {
    const necesita = [col.concepto_id, ...(col.desde ?? [])].filter((x): x is string => Boolean(x));
    const hojas = [...new Set(necesita.flatMap((id) => disponibles.get(id) ?? []))];
    if (col.modo === "falta" || necesita.length === 0) {
      return { ...col, resultado: "falta", motivo: col.nota || "Ningún campo del repositorio la responde.", hojas: [] };
    }
    const ausentes = necesita.filter((id) => !disponibles.has(id));
    if (ausentes.length > 0) {
      return {
        ...col,
        resultado: "falta",
        motivo: `Ninguna tabla lleva ${ausentes.map((id) => `«${nombreDe(id)}»`).join(" ni ")}.`,
        hojas: [],
      };
    }
    return { ...col, resultado: col.modo, motivo: col.nota || (col.modo === "directo" ? "Directo del repositorio." : "Se calcula."), hojas };
  });
  const directas = columnas.filter((c) => c.resultado === "directo").length;
  const derivadas = columnas.filter((c) => c.resultado === "derivado").length;
  const total = columnas.length;
  const respondidas = directas + derivadas;
  return {
    total,
    respondidas,
    directas,
    derivadas,
    porcentaje: total === 0 ? 0 : Math.round((respondidas / total) * 100),
    obligatoriasFaltantes: columnas.filter((c) => c.obligatorio && c.resultado === "falta").map((c) => c.etiqueta),
    columnas,
  };
}

/* ---------- SNIES: el catálogo de Reportes Institucionales ---------- */

/** Campo SNIES → concepto. Lo que no está aquí, falta. Las «Sede» se derivan del campus. */
export const MAPEO_SNIES: Record<string, Omit<ColumnaPlantilla, "etiqueta" | "codigo" | "obligatorio">> = {
  "AÑO": { concepto_id: "periodo", modo: "derivado", nota: "Sale del periodo." },
  SEMESTRE: { concepto_id: "periodo", modo: "derivado", nota: "Sale del periodo." },
  ID_TIPO_DOCUMENTO: { concepto_id: "tipo_documento", modo: "directo" },
  NUM_DOCUMENTO: { concepto_id: "numero_documento", modo: "directo" },
  PRIMER_NOMBRE: { concepto_id: "primer_nombre", modo: "directo" },
  SEGUNDO_NOMBRE: { concepto_id: "segundo_nombre", modo: "directo" },
  PRIMER_APELLIDO: { concepto_id: "primer_apellido", modo: "directo" },
  SEGUNDO_APELLIDO: { concepto_id: "segundo_apellido", modo: "directo" },
  ID_SEXO_BIOLOGICO: { concepto_id: "sexo_biologico", modo: "directo" },
  ID_ESTADO_CIVIL: { concepto_id: "estado_civil", modo: "directo" },
  FECHA_NACIMIENTO: { concepto_id: "fecha_nacimiento", modo: "directo", nota: "Se escribe dd/mm/aaaa." },
  ID_PAIS: { concepto_id: "pais_nacimiento", modo: "directo" },
  ID_PAIS_NACIMIENTO: { concepto_id: "pais_nacimiento", modo: "directo" },
  TELEFONO_CONTACTO: { concepto_id: "telefono", modo: "directo" },
  EMAIL_PERSONAL: { concepto_id: "correo", modo: "directo" },
  PRO_CONSECUTIVO: { concepto_id: "programa", modo: "derivado", nota: "Código SNIES desde el nombre del programa (catálogo de Reportes)." },
};

/** Sede (municipio de oferta): se deriva del campus de la fila (ri_sedes). */
const SEDE: Omit<ColumnaPlantilla, "etiqueta" | "codigo" | "obligatorio"> = {
  concepto_id: "campus",
  modo: "derivado",
  nota: "Municipio de la sede del campus (ri_sedes).",
};

/** Cómo se responde un campo SNIES. */
export function mapeoDeCampo(campo: Campo): Omit<ColumnaPlantilla, "etiqueta" | "codigo" | "obligatorio"> {
  if (campo.etiqueta === "Sede") return SEDE;
  return MAPEO_SNIES[campo.codigo] ?? { concepto_id: null, modo: "falta", nota: "Sin concepto en el repositorio." };
}

/** Una plantilla SNIES del catálogo, como plantilla de cobertura. */
export function plantillaDesdeSnies(spec: PlantillaSpec): PlantillaCobertura {
  return {
    id: `snies:${spec.id}`,
    nombre: `SNIES · ${spec.nombre}`,
    tipo: "snies",
    columnas: spec.campos.map((campo) => ({ etiqueta: campo.etiqueta, codigo: campo.codigo, obligatorio: campo.obligatorio, ...mapeoDeCampo(campo) })),
  };
}

/* ---------- CNA / rankings: plantillas que carga el Director ---------- */

/** Encabezados de la primera fila de un CSV (separado por «;» o «,», con comillas). */
export function encabezadosDeCsv(texto: string): string[] {
  const linea = texto.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const sep = (linea.match(/;/g)?.length ?? 0) >= (linea.match(/,/g)?.length ?? 0) ? ";" : ",";
  const salida: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else comillas = !comillas;
    } else if (ch === sep && !comillas) {
      salida.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  salida.push(actual.trim());
  return salida.filter(Boolean);
}

/**
 * Propuesta de emparejamiento para una plantilla nueva: cada encabezado con
 * el concepto que le corresponde (directo) o «falta». El Director la corrige
 * (p. ej. «Estudiantes en movilidad saliente» → derivado de sentido_movilidad).
 */
export function propuestaPlantilla(encabezados: readonly string[], conceptos: readonly Concepto[]): ColumnaPlantilla[] {
  return encabezados.map((etiqueta) => {
    const par = emparejarConcepto(etiqueta, conceptos);
    return par
      ? { etiqueta, concepto_id: par.concepto.id, modo: "directo" as const, nota: par.como === "parecido" ? "Emparejado por parecido: revíselo." : "" }
      : { etiqueta, concepto_id: null, modo: "falta" as const, nota: "Sin concepto equivalente: cree el campo o descártela." };
  });
}

/** Filas de int_plantilla_columnas → plantilla de cobertura. */
export function plantillaDesdeFilas(
  plantilla: { id: string; nombre: string; tipo: PlantillaCobertura["tipo"] },
  filas: readonly Pick<IntPlantillaColumnaRow, "etiqueta" | "concepto_id" | "modo" | "nota" | "orden">[],
): PlantillaCobertura {
  return {
    id: plantilla.id,
    nombre: plantilla.nombre,
    tipo: plantilla.tipo,
    columnas: [...filas].sort((a, b) => a.orden - b.orden).map((f) => ({ etiqueta: f.etiqueta, concepto_id: f.concepto_id, modo: f.modo, nota: f.nota })),
  };
}
