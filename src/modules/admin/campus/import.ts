/* =============================================================================
   Carga del libro a la base.

   Va en su propio archivo y no en `data/mutations.ts` porque no es una
   mutación de formulario: es un proceso de varios pasos con resolución de
   llaves, reemplazo de lote y un informe de lo que pasó.

   La regla que gobierna todo: **primero se resuelve, después se escribe**. Los
   códigos de línea y los nombres de sede se traducen a identificadores antes de
   tocar nada; si alguno no existe, no se escribe ni una fila. Cargar la mitad
   de un informe es peor que no cargarlo, porque el portal publicaría una
   cobertura del plan que no es la que dice el documento.

   El lote es la unidad de reemplazo: volver a subir el mismo campus y año borra
   su lote anterior —y por cascada sus filas— antes de insertar. Así una
   corrección no deja mezcladas las filas viejas con las nuevas.
   ========================================================================== */

import { supabase } from "../../../lib/supabase";
import { describeDatabaseError } from "../../../data/errors";
import type { DatabaseError } from "../../../data/errors";
import type { ParsedFact, ParsedIndicator, ParseResult } from "./parse";

export interface ImportSummary {
  /** Un lote por sede y vigencia. */
  batches: { campus: string; year: number; facts: number; indicators: number }[];
  /** Códigos que emparejaron tras normalizarlos: "6.1.1.A" → "6.1.1.a". */
  normalized: { from: string; to: string }[];
  /** Lo que no se pudo resolver. Si hay algo aquí, no se escribió nada. */
  blockers: string[];
}

/** Una línea con su área, como la pide la resolución de referencias. */
interface LineRow {
  id: string;
  code: string | null;
  name: string;
  area_id: string;
  /** PostgREST devuelve el área embebida como objeto, pero sus tipos la
   *  declaran como arreglo. Se admiten las dos formas y se resuelve al leerla. */
  strategic_areas: { code: string | null } | { code: string | null }[] | null;
}

/** El código del área de una línea, venga como objeto o como arreglo. */
function areaCodeOf(line: LineRow): string | null {
  const area = Array.isArray(line.strategic_areas) ? line.strategic_areas[0] : line.strategic_areas;
  return area?.code ?? null;
}

function unwrap<T>({ data, error }: { data: T | null; error: DatabaseError | null }): T {
  if (error) throw describeDatabaseError(error);
  return data as T;
}

/** Sin acentos y en minúsculas: "Cúcuta" y "Cucuta" son la misma sede. */
function key(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/**
 * El código de línea, reducido a su forma canónica.
 *
 * Los códigos del plan tienen la forma `6.1.1.a`, pero en una hoja de cálculo
 * casi nunca llegan así. Excel pone mayúscula a la letra (`6.1.1.A`), la gente
 * escribe el separador con guion o con espacio, se cuela un espacio duro al
 * copiar de un PDF, y a veces la letra viene pegada (`6.1.1a`). Todas esas son
 * la misma línea, y hacerlas fallar por la forma de escribirlas obligaba a
 * editar el libro a mano antes de cada carga.
 *
 * Lo que NO hace es adivinar. Un código que no existe sigue siendo un bloqueo:
 * esto empareja lo que ya es igual salvo el formato, no inventa equivalencias.
 */
export function normalizeLineCode(code: string): string {
  const clean = code
    // Espacios duros y de ancho cero, de los que se cuelan al copiar de un
    // PDF. Se escriben con su punto de código porque pegados tal cual son
    // invisibles y nadie sabría qué dice esta línea.
    .replace(/[  -‍﻿]/g, " ")
    .trim()
    .toLowerCase()
    // Guion, subrayado o espacio entre partes: todos son el punto del código.
    .replace(/[\s\-_]+/g, ".")
    // Una letra pegada al número es el último tramo: "6.1.1a" → "6.1.1.a".
    .replace(/(\d)([a-z])/g, "$1.$2")
    // Puntos repetidos o sobrantes en los extremos.
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

  return clean;
}

/**
 * Comprueba que todo lo que el libro nombra existe en la base.
 *
 * Se llama antes de escribir y también desde la vista previa, para que quien
 * sube el archivo vea los problemas sin haber cambiado nada.
 */
export async function resolveReferences(parsed: ParseResult): Promise<{
  campusBySlugName: Map<string, string>;
  /** Resuelve el identificador de una línea desde el código del libro. */
  resolveLine: (code: string) => { id: string; viaLetter: boolean } | null;
  /** Códigos que emparejaron solo tras normalizarlos. No bloquean; se avisan. */
  normalized: { from: string; to: string }[];
  blockers: string[];
}> {
  const blockers: string[] = [];

  const campuses = await supabase
    .from("campuses")
    .select("id, name, slug")
    .then(unwrap<{ id: string; name: string; slug: string }[]>);

  const campusBySlugName = new Map<string, string>();
  for (const c of campuses) {
    campusBySlugName.set(key(c.name), c.id);
    campusBySlugName.set(key(c.slug), c.id);
  }

  // El área se pide también: es lo que permite reconocer una línea por su
  // letra cuando su código no está puesto (ver más abajo).
  const lineResponse = await supabase
    .from("action_lines")
    .select("id, code, name, area_id, strategic_areas(code)");
  if (lineResponse.error) throw describeDatabaseError(lineResponse.error);
  const lines = (lineResponse.data ?? []) as unknown as LineRow[];

  // El índice va por el código normalizado, y guarda además el código tal y
  // como lo escribe el plan: es lo que se le enseña a quien sube el archivo
  // cuando su libro escribe el mismo código de otra forma.
  const lineByCode = new Map<string, string>();
  const canonicalCode = new Map<string, string>();
  for (const line of lines) {
    if (!line.code) continue;
    const normalized = normalizeLineCode(line.code);
    lineByCode.set(normalized, line.id);
    canonicalCode.set(normalized, line.code);
  }

  /* --- Segundo índice: el área y la letra ---------------------------------
     Los códigos del plan son `<área>.<letra>` —6.1.3.b— y los nombres de sus
     líneas empiezan por esa misma letra: "b. Arquitectura institucional". Son
     dos formas de decir lo mismo, y en la práctica no siempre llegan las dos:
     hay líneas cargadas con su nombre correcto y el código sin poner.

     Este índice las alcanza igual. Se construye desde el área y la letra del
     nombre, y solo se consulta cuando el código no encontró nada, así que
     nunca le gana a una coincidencia directa.
     -------------------------------------------------------------------- */

  const lineByAreaLetter = new Map<string, string>();
  for (const line of lines) {
    const areaCode = areaCodeOf(line);
    if (!areaCode) continue;

    // La letra sale del nombre ("b. Arquitectura…") o del propio código.
    const fromName = /^\s*([a-z])\s*[.)-]/i.exec(line.name)?.[1];
    const fromCode = line.code ? /\.([a-z])$/i.exec(line.code)?.[1] : undefined;
    const letter = (fromName ?? fromCode)?.toLowerCase();
    if (!letter) continue;

    const key = `${normalizeLineCode(areaCode)}.${letter}`;
    // Si dos líneas del área empiezan por la misma letra, la referencia es
    // ambigua y no se usa: emparejar a ciegas sería peor que no emparejar.
    lineByAreaLetter.set(key, lineByAreaLetter.has(key) ? "" : line.id);
  }

  /** El identificador de una línea, por código y, si no, por área y letra. */
  function resolveLine(code: string): { id: string; viaLetter: boolean } | null {
    const normalized = normalizeLineCode(code);

    const direct = lineByCode.get(normalized);
    if (direct) return { id: direct, viaLetter: false };

    const byLetter = lineByAreaLetter.get(normalized);
    if (byLetter) return { id: byLetter, viaLetter: true };

    return null;
  }

  /* --- Qué nombra el libro que la base no tiene --------------------------- */

  const missingCampus = [
    ...new Set(
      [...parsed.facts, ...parsed.indicators]
        .map((r) => r.campus_name)
        .filter((n) => n && !campusBySlugName.has(key(n))),
    ),
  ];
  for (const name of missingCampus) {
    blockers.push(`La sede "${name}" no está registrada en el portal.`);
  }

  const codes = [...new Set([...parsed.facts, ...parsed.indicators].map((r) => r.line_code))];

  const missingLines = codes.filter((code) => code && !resolveLine(code));

  // Los que emparejaron pero no tal cual venían. Se avisan en vez de
  // corregirse en silencio: si el libro escribe "6.1.1.A" donde el plan dice
  // "6.1.1.a", o si hubo que reconocer la línea por su letra, quien lo sube
  // debería enterarse —puede ser un descuido de formato o puede ser que esté
  // mirando otra versión de la estructura—.
  const normalized = codes
    .filter((code) => code && code !== canonicalCode.get(normalizeLineCode(code)))
    .flatMap((code) => {
      const match = resolveLine(code);
      if (!match) return [];
      const canonical = canonicalCode.get(normalizeLineCode(code));
      return [
        {
          from: code,
          to: canonical ?? `${code} (reconocida por su letra dentro del área)`,
        },
      ];
    });
  if (missingLines.length > 0) {
    // El mensaje dice qué hay en la base, no qué supone que pasó. Antes
    // apuntaba siempre a "falta aplicar la 0017", que es una conjetura: las
    // líneas pueden faltar porque la migración no corrió, porque corrió a
    // medias, o porque corrió y una normalización posterior las movió. Con las
    // cuentas delante se distingue en un vistazo cuál de los tres es.
    const withRealCode = lines.filter((l) => l.code && /^\d+(\.\d+)+\.[a-z]$/i.test(l.code));

    blockers.push(
      `${missingLines.length} ${missingLines.length === 1 ? "línea no existe" : "líneas no existen"} en la estructura del plan: ` +
        `${missingLines.slice(0, 6).join(", ")}${missingLines.length > 6 ? "…" : ""}.`,
    );
    blockers.push(
      `La base tiene ahora ${lines.length} ${lines.length === 1 ? "línea" : "líneas"} en total, ` +
        `de las cuales ${withRealCode.length} ${withRealCode.length === 1 ? "tiene" : "tienen"} código de la estructura real (6.1.1.a). ` +
        (withRealCode.length === 0
          ? "Ninguna: la migración 0017 no llegó a insertar la estructura. Vuelve a aplicarla entera y comprueba que termina sin error."
          : withRealCode.length < 62
            ? "Faltan para las 62 del plan: la 0017 se aplicó a medias. Vuelve a aplicarla entera; es idempotente."
            : "Están todas, así que el libro está citando códigos que el plan no usa. Revisa la columna COD_LINEA."),
    );
  }

  return { campusBySlugName, resolveLine, normalized, blockers };
}

/** Agrupa por sede y vigencia: cada grupo será un lote. */
function groupByBatch(facts: ParsedFact[]): Map<string, ParsedFact[]> {
  const groups = new Map<string, ParsedFact[]>();
  for (const fact of facts) {
    const k = `${key(fact.campus_name)}::${fact.year}`;
    const list = groups.get(k) ?? [];
    list.push(fact);
    groups.set(k, list);
  }
  return groups;
}

export async function importWorkbook(
  parsed: ParseResult,
  meta: { fileName: string; publish: boolean },
): Promise<ImportSummary> {
  const { campusBySlugName, resolveLine, normalized, blockers } = await resolveReferences(parsed);

  // Los errores del propio libro también bloquean: una fila sin línea no se
  // puede guardar, y guardarla "casi" sería inventarse el anclaje.
  for (const issue of parsed.issues.filter((i) => i.level === "error")) {
    blockers.push(`${issue.sheet}${issue.row ? ` fila ${issue.row}` : ""}: ${issue.message}`);
  }

  if (blockers.length > 0) return { batches: [], normalized, blockers };

  const groups = groupByBatch(parsed.facts);
  const summary: ImportSummary["batches"] = [];

  for (const [k, facts] of groups) {
    const [campusKey, yearText] = k.split("::");
    const campusId = campusBySlugName.get(campusKey)!;
    const year = Number(yearText);

    // Los indicadores no traen año: pertenecen a la sede, y el libro es de una
    // vigencia. Se adjuntan al lote de esa sede para el año más reciente.
    const indicators = parsed.indicators.filter(
      (i) => key(i.campus_name) === campusKey && year === Math.max(...parsed.years),
    );

    /* --- Reemplazo del lote ------------------------------------------------
       Borrar antes de insertar, y no un upsert fila a fila: el libro puede
       traer menos filas que la carga anterior —porque se corrigió el informe— y
       un upsert dejaría vivas las que ya no están. */
    await supabase
      .from("campus_report_batches")
      .delete()
      .eq("campus_id", campusId)
      .eq("year", year)
      .then(({ error }) => {
        if (error) throw describeDatabaseError(error);
      });

    const batch = await supabase
      .from("campus_report_batches")
      .insert({
        campus_id: campusId,
        year,
        file_name: meta.fileName,
        source_document: facts[0]?.source_document ?? "",
        fact_count: facts.length,
        indicator_count: indicators.length,
        status: meta.publish ? "publicado" : "borrador",
      })
      .select("id")
      .single()
      .then(unwrap<{ id: string }>);

    /* --- Las filas ----------------------------------------------------------
       `campus_id` y `year` no se envían: el disparador de la 0017 los toma del
       lote, para que una fila no pueda decir que es de otra sede que el archivo
       del que vino. Tampoco el cumplimiento ni el estado, que los calcula la
       base con la regla del diccionario. */
    const factRows = facts.map((f) => ({
      batch_id: batch.id,
      campus_id: campusId,
      year,
      action_line_id: resolveLine(f.line_code)!.id,
      source_code: f.source_code,
      reported_pillar: f.reported_pillar,
      reported_axis: f.reported_axis,
      reported_function: f.reported_function,
      reported_state: f.reported_state,
      objective: f.objective,
      action: f.action,
      unit: f.unit,
      target_value: f.target_value,
      actual_value: f.actual_value,
      confidence: f.confidence,
      note: f.note,
      evidence: f.evidence,
      source_document: f.source_document,
      source_page: f.source_page,
      position: f.position,
    }));

    if (factRows.length > 0) {
      await supabase
        .from("campus_facts")
        .insert(factRows)
        .then(({ error }) => {
          if (error) throw describeDatabaseError(error);
        });
    }

    if (indicators.length > 0) {
      await supabase
        .from("campus_indicators")
        .insert(
          indicators.map((i) => ({
            batch_id: batch.id,
            campus_id: campusId,
            action_line_id: resolveLine(i.line_code)!.id,
            source_code: i.source_code,
            name: i.name,
            unit: i.unit,
            base_year: i.base_year,
            base_value: i.base_value,
            last_year: i.last_year,
            last_value: i.last_value,
            reported_variation: i.reported_variation,
            evidence: i.evidence,
            source_document: i.source_document,
            confidence: i.confidence,
            note: i.note,
            position: i.position,
          })),
        )
        .then(({ error }) => {
          if (error) throw describeDatabaseError(error);
        });
    }

    summary.push({
      campus: facts[0]?.campus_name ?? campusKey,
      year,
      facts: facts.length,
      indicators: indicators.length,
    });
  }

  return { batches: summary, normalized, blockers: [] };
}
