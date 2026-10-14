/* Escenario común de las pruebas de 0153 (Informes Institucionales): la base
   en memoria con todas las migraciones, Planeación, una facultad con su
   Gestor, Contribuyente y Consulta, una rectoría de campus (kind 'otra'), un
   ciclo abierto y una cifra de UDES en Cifras y otra del PDI ya publicadas. */

import { createTestDb, PEOPLE, UNITS, type Query, type TestDb } from "../db/harness";

export const P = {
  planeacion: PEOPLE.admin, // perfil con rol planeacion (no admin)
  gestor: PEOPLE.decano, // jefe de la facultad de prueba
  contribuyente: "00000000-0000-4000-a000-0000000000e1",
  consulta: "00000000-0000-4000-a000-0000000000e2",
  rector: "00000000-0000-4000-a000-0000000000e3",
  ajeno: PEOPLE.otroDirector, // jefe de un programa de otra facultad
};

export const U = {
  facultad: UNITS.facultad,
  rectoria: "00000000-0000-4000-b000-0000000000c1",
};

export interface Escenario {
  t: TestDb;
  ciclo: string;
  indicador: string;
}

export async function escenario(): Promise<Escenario> {
  const t = await createTestDb();
  for (const [nombre, id] of Object.entries({ contribuyente: P.contribuyente, consulta: P.consulta, rector: P.rector })) {
    await t.q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${nombre}@prueba.udes.edu.co`]);
    await t.q("insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing", [id, `${nombre}@prueba.udes.edu.co`, nombre]);
  }
  await t.q("update public.profiles set is_active = true where email like '%@prueba.udes.edu.co'");
  await t.q("update public.profiles set role = 'planeacion' where id = $1", [P.planeacion]);

  // La rectoría de campus es una unidad «otra»; la facultad le reporta su informe.
  await t.q(
    "insert into public.units (id, kind, code, name, slug) values ($1, 'otra', 'PR-RC', 'Rectoría Campus Bucaramanga (prueba)', 'prueba-rectoria-buc')",
    [U.rectoria],
  );
  await t.q(
    `insert into public.unit_members (unit_id, profile_id, role) values
       ($1, $2, 'editor'), ($1, $3, 'visor'), ($4, $5, 'jefe')`,
    [U.facultad, P.contribuyente, P.consulta, U.rectoria, P.rector],
  );

  const [{ id: ciclo }] = await t.q<{ id: string }>(
    "insert into public.informe_ciclos (anio, nombre, estado) values (2026, 'Informe de gestión 2026', 'abierto') returning id",
  );
  await t.q("insert into public.informe_requisitos (ciclo_id, plantilla, clave, condicion) values ($1, 'A', 'matric', 'justificar')", [ciclo]);

  // UDES en Cifras: matrícula por sede, regla «ultimo», el total sale de las sedes.
  const [periodo] = await t.q<{ id: string }>(
    "insert into public.od_periods (label, start_year, end_year, status, is_current) values ('2020-2026', 2020, 2026, 'publicado', false) returning id",
  );
  const campus = await t.q<{ id: string; slug: string }>("select id, slug from public.campuses where slug in ('bucaramanga', 'cucuta')");
  const sede = (slug: string) => campus.find((c) => c.slug === slug)!.id;
  for (const c of campus) await t.q("insert into public.od_period_campuses (period_id, campus_id, label) values ($1, $2, '')", [periodo.id, c.id]);
  const [informe] = await t.q<{ id: string }>(
    "insert into public.od_reports (period_id, slug, code, name, status) values ($1, 'poblacion', 'PO', 'Población estudiantil', 'publicado') returning id",
    [periodo.id],
  );
  const [{ id: indicador }] = await t.q<{ id: string }>(
    "insert into public.od_indicators (report_id, key, label, annual_rule, aggregation) values ($1, 'matriculados', 'Matrícula total', 'ultimo', 'suma') returning id",
    [informe.id],
  );
  await t.q(
    `insert into public.od_values (indicator_id, year, term, campus_id, value) values
       ($1, 2026, 'A', $2, 1000), ($1, 2026, 'A', $3, 400), ($1, 2026, 'B', $2, 1100), ($1, 2026, 'B', $3, 450)`,
    [indicador, sede("bucaramanga"), sede("cucuta")],
  );

  // PDI: un indicador publicado de la Vicerrectoría de Enseñanza, con su cifra global de 2026.
  const VE = "00000000-0000-4000-b000-000000000002";
  await t.q("insert into public.imp_unit_functions (unit_id, fn) values ($1, 'ensenanza') on conflict do nothing", [VE]);
  const [imp] = await t.q<{ id: string }>(
    "insert into public.imp_indicators (code, fn, stage, owner_unit_id, name, status) values ('EN3', 'ensenanza', 'productos', $1, 'Registros calificados vigentes', 'publicado') returning id",
    [VE],
  );
  await t.q("insert into public.imp_values (indicator_id, year, value_num) values ($1, 2026, 18)", [imp.id]);

  await t.q(
    `insert into public.informe_fuentes (clave, nombre, tipo, consulta) values
       ('matric', 'Matrícula total', 'auto', '{"indicador": "matriculados", "informe": "poblacion"}'),
       ('rc', 'Registros calificados', 'pdi', '{"indicador": "EN3"}')`,
  );
  return { t, ciclo, indicador };
}

/** Abre el informe A de la facultad (destino: la rectoría) como el Gestor. */
export async function abrirFacultad(t: TestDb, ciclo: string): Promise<string> {
  return t.asUser(
    P.gestor,
    async (q) => (await q<{ id: string }>("select public.informe_abrir($1, $2, 'A', $3) as id", [ciclo, U.facultad, U.rectoria]))[0].id,
    { commit: true },
  );
}

export const seccion = (q: Query, inst: string, clave: string, listo = true, texto = "Texto de la sección") =>
  q("select public.informe_guardar_seccion($1, $2, $3, $4)", [inst, clave, JSON.stringify({ texto }), listo]);

export const cifra = (q: Query, inst: string, clave: string, datos: Record<string, unknown>) =>
  q<{ r: Record<string, unknown> }>("select to_jsonb(public.informe_guardar_cifra($1, $2, $3)) as r", [inst, clave, JSON.stringify(datos)]).then((x) => x[0].r);

export const vivas = (q: Query, inst: string) =>
  q<{ clave: string; valor: string | null; fuente: string | null }>("select clave, valor, fuente from public.informe_cifras_vivas($1) order by clave", [inst]);

export const estado = (q: Query, inst: string, a: string, nota: string | null = null) =>
  q<{ r: Record<string, unknown> }>("select to_jsonb(public.informe_cambiar_estado($1, $2, $3)) as r", [inst, a, nota]).then((x) => x[0].r);

export const enviar = (q: Query, inst: string) =>
  q<{ r: Record<string, unknown> }>("select to_jsonb(public.informe_enviar($1)) as r", [inst]).then((x) => x[0].r);
