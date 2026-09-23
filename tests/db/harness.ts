/* =============================================================================
   Arnés de pruebas de base de datos.

   Levanta un Postgres en memoria (PGlite), le pone lo mínimo de Supabase
   (supabase-stub.sql), aplica TODAS las migraciones en orden —las mismas que
   se aplican en el proyecto real— y, si se pide, las semillas de prueba.

   `asUser` corre un bloque con la sesión de una persona: rol authenticated y
   su id en request.jwt.claim.sub, igual que PostgREST. Así las políticas RLS
   se prueban de verdad y no con el dueño de las tablas, que se las salta.
   ========================================================================== */

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");

export const PEOPLE = {
  admin: "00000000-0000-4000-a000-000000000001",
  director: "00000000-0000-4000-a000-000000000002",
  reportante: "00000000-0000-4000-a000-000000000003",
  decano: "00000000-0000-4000-a000-000000000004",
  vi: "00000000-0000-4000-a000-000000000005",
  ve: "00000000-0000-4000-a000-000000000006",
  vx: "00000000-0000-4000-a000-000000000007",
  otroDirector: "00000000-0000-4000-a000-000000000008",
} as const;

export const UNITS = {
  facultad: "00000000-0000-4000-b000-000000000010",
  programaA: "00000000-0000-4000-b000-000000000011",
  programaB: "00000000-0000-4000-b000-000000000012",
  maestria: "00000000-0000-4000-b000-000000000013",
  programaZ: "00000000-0000-4000-b000-000000000021",
} as const;

export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface TestDb {
  db: PGlite;
  /** Consulta como dueño de las tablas (se salta RLS). */
  q: Query;
  /** Un bloque con la sesión de una persona. Se revierte al final, salvo con `commit`. */
  asUser: <T>(userId: string | null, work: (q: Query) => Promise<T>, options?: { commit?: boolean }) => Promise<T>;
  close: () => Promise<void>;
}

export async function createTestDb({ seed = true } = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    } catch (error) {
      throw new Error(`La migración ${file} falló: ${(error as Error).message}`);
    }
  }
  if (seed) await db.exec(readFileSync(join(ROOT, "supabase/seed/impacto_prueba.sql"), "utf8"));

  const q: Query = async (sql, params) => (await db.query(sql, params)).rows as never;

  const asUser: TestDb["asUser"] = async (userId, work, options = {}) => {
    await db.exec("begin");
    let ok = false;
    try {
      await db.exec(userId ? "set local role authenticated" : "set local role anon");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      const result = await work(q);
      ok = true;
      return result;
    } finally {
      await db.exec(ok && options.commit ? "commit" : "rollback");
    }
  };

  return { db, q, asUser, close: () => db.close() };
}

/** El mensaje de error de una promesa que se espera que falle. */
export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Se esperaba un error y la operación terminó bien.");
}

/**
 * Un catálogo mínimo para probar la operación: versión 1 publicada con una
 * razón (E04) y un conteo (E13), un periodo 2026-2 y una asignación de cada
 * uno al programa A en Bucaramanga, con su registro en borrador.
 */
export async function publishedFixture(q: Query) {
  const [version] = await q<{ id: string }>(
    "insert into imp_catalog_versions (number, source_file) values (1, 'vr7.xlsx') returning id",
  );
  const sheet = `unit, calc_type, numerator_def, factor, aggregation, direction, periodicity, report_level,
                 applies_degrees, capture_mode, validator_function, in_pilot`;
  const [ratio] = await q<{ id: string }>(
    `insert into imp_indicators (version_id, code, function_id, level, name, ${sheet}, denominator_def)
     values ($1, 'E04', 'ensenanza', 'procesos', 'Tasa de retención estudiantil',
             'porcentaje', 'razon', 'Siguen matriculados', 100, 'razon_de_sumas', 'mayor_mejor', 'semestral',
             'programa_sede', '{pregrado}', 'precargado', 'ensenanza', true, 'Matriculados el periodo anterior')
     returning id`,
    [version.id],
  );
  const [count] = await q<{ id: string }>(
    `insert into imp_indicators (version_id, code, function_id, level, name, ${sheet})
     values ($1, 'E13', 'ensenanza', 'productos', 'Innovaciones pedagógicas',
             'numero', 'conteo', 'Innovaciones documentadas', 1, 'suma', 'mayor_mejor', 'anual',
             'programa', '{pregrado,maestria}', 'manual', 'ensenanza', true)
     returning id`,
    [version.id],
  );
  await q("update imp_catalog_versions set state = 'publicada', published_at = now() where id = $1", [version.id]);

  const [period] = await q<{ id: string }>(
    `insert into imp_periods (code, catalog_version_id, cutoff_program, cutoff_faculty, cutoff_vice)
     values ('2026-2', $1, '2026-10-15', '2026-10-25', '2026-11-05') returning id`,
    [version.id],
  );
  const [bucaramanga] = await q<{ id: string }>("select id from campuses where slug = 'bucaramanga'");
  const [ratioAssignment] = await q<{ id: string }>(
    "insert into imp_assignments (period_id, indicator_id, program_id, campus_id) values ($1, $2, $3, $4) returning id",
    [period.id, ratio.id, UNITS.programaA, bucaramanga.id],
  );
  const [countAssignment] = await q<{ id: string }>(
    "insert into imp_assignments (period_id, indicator_id, program_id) values ($1, $2, $3) returning id",
    [period.id, count.id, UNITS.programaA],
  );
  const [ratioRecord] = await q<{ id: string }>(
    "insert into imp_records (assignment_id) values ($1) returning id",
    [ratioAssignment.id],
  );
  const [countRecord] = await q<{ id: string }>(
    "insert into imp_records (assignment_id) values ($1) returning id",
    [countAssignment.id],
  );
  return {
    versionId: version.id,
    ratioId: ratio.id,
    countId: count.id,
    periodId: period.id,
    bucaramangaId: bucaramanga.id,
    ratioRecordId: ratioRecord.id,
    countRecordId: countRecord.id,
  };
}
