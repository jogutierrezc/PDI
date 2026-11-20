/* Arnés propio de estas pruebas. Es el de tests/db/harness.ts con un paso más: expone
   pgcrypto también en el esquema «extensions» antes de las migraciones. Con PGlite 0.5.8 la
   extensión ya no queda ahí por sí sola y la migración 0155 falla en el arnés común
   («extensions.gen_random_bytes no existe»). Cuando el arnés común se arregle, estas
   pruebas pueden volver a importarlo. */

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TestDb, Query } from "../db/harness";

export { errorOf } from "../db/harness";
export type { TestDb, Query };

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");

/** Migraciones de las que depende 0286: si fallan, la prueba no vale. */
const NECESARIAS = ["0001", "0002", "0017", "0024", "0057", "0063", "0078", "0286", "0287", "0288", "0289", "0290", "0291"];

export async function createTestDb(): Promise<TestDb & { omitidas: string[] }> {
  const omitidas: string[] = [];
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(ROOT, "tests/db/supabase-stub.sql"), "utf8"));
  // pgcrypto queda en public (como lo pide 0001) y se expone también en «extensions», como en Supabase.
  await db.exec(`create extension if not exists pgcrypto;
    create or replace function extensions.gen_random_bytes(integer) returns bytea language sql as 'select public.gen_random_bytes($1)';
    create or replace function extensions.digest(bytea, text) returns bytea language sql as 'select public.digest($1, $2)';
    create or replace function extensions.digest(text, text) returns bytea language sql as 'select public.digest($1, $2)';`);

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    } catch (error) {
      // El stub de Supabase del arnés común no sigue el paso de las migraciones recientes
      // (p. ej. 0261 pide auth.users.email_confirmed_at). Una migración ajena que falla se
      // salta; las que este módulo necesita (y la propia 0286) deben aplicarse sí o sí.
      if (NECESARIAS.some((n) => file.startsWith(n))) throw new Error(`La migración ${file} falló: ${(error as Error).message}`);
      omitidas.push(file);
    }
  }

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
  return { db, q, asUser, close: () => db.close(), omitidas };
}
