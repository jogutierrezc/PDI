-- =============================================================================
-- PDI · Diagnóstico
--
-- Pégalo entero en el editor SQL de Supabase y mira los resultados.
-- Sirve para saber por qué la API devuelve 404 sin tener que adivinar.
--
-- El portal muestra "La base de datos todavía no tiene las tablas del portal"
-- cuando PostgREST responde PGRST205: el objeto no está en su caché de esquema.
-- Eso significa una de dos cosas, nunca que la consulta esté mal:
--
--   1. La migración que lo crea no se aplicó.  → El bloque 1 dice cuál.
--   2. Se aplicó, pero PostgREST no se enteró.  → El bloque 1 lo dirá todo
--      presente; en ese caso ejecuta `notify pgrst, 'reload schema';` o vuelve
--      a aplicar 0007_permisos_y_cache.sql.
--
-- Ojo con el editor SQL de Supabase: revierte el script entero si una sola
-- sentencia falla. Un módulo a medias casi siempre es eso.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qué falta, y qué migración lo crea
--
-- Una fila por objeto que el portal necesita. Ordenado para que lo que falta
-- salga primero: si la primera fila dice "OK", está todo.
-- -----------------------------------------------------------------------------

with esperado(migracion, modulo, objeto, tipo) as (values
  ('0001-0014', 'Núcleo del plan',    'pillars',                   'tabla'),
  ('0001-0014', 'Núcleo del plan',    'strategic_areas',           'tabla'),
  ('0001-0014', 'Núcleo del plan',    'action_lines',              'tabla'),
  ('0001-0014', 'Núcleo del plan',    'activities',                'tabla'),
  ('0001-0014', 'Núcleo del plan',    'activity_targets',          'tabla'),
  ('0001-0014', 'Núcleo del plan',    'projects',                  'tabla'),
  ('0001-0014', 'Núcleo del plan',    'project_links',             'tabla'),
  ('0001-0014', 'Núcleo del plan',    'documents',                 'tabla'),
  ('0001-0014', 'Núcleo del plan',    'profiles',                  'tabla'),
  ('0001-0014', 'Núcleo del plan',    'report_periods',            'tabla'),
  ('0001-0014', 'Núcleo del plan',    'v_pillar_progress',         'vista'),
  ('0001-0014', 'Núcleo del plan',    'v_pdi_summary',             'vista'),
  ('0001-0014', 'Núcleo del plan',    'v_year_progress',           'vista'),
  ('0001-0014', 'Núcleo del plan',    'v_current_period',          'vista'),
  ('0001-0014', 'Núcleo del plan',    'v_projects',                'vista'),

  ('0015', 'Presupuesto (intranet)',  'project_budget_reports',    'tabla'),
  ('0015', 'Presupuesto (intranet)',  'v_projects_admin',          'vista'),
  ('0015', 'Presupuesto (intranet)',  'v_project_budget',          'vista'),
  ('0015', 'Presupuesto (intranet)',  'v_pillar_budget',           'vista'),

  ('0016', 'PDI por facultad',        'faculties',                 'tabla'),
  ('0016', 'PDI por facultad',        'faculty_proposals',         'tabla'),
  ('0016', 'PDI por facultad',        'v_faculty_proposals',       'vista'),
  ('0016', 'PDI por facultad',        'v_faculty_proposals_admin', 'vista'),
  ('0016', 'PDI por facultad',        'v_faculties',               'vista'),
  ('0016', 'PDI por facultad',        'v_faculty_pillar_matrix',   'vista'),

  ('0017', 'PDI por campus',          'campuses',                  'tabla'),
  ('0017', 'PDI por campus',          'campus_report_batches',     'tabla'),
  ('0017', 'PDI por campus',          'campus_facts',              'tabla'),
  ('0017', 'PDI por campus',          'campus_indicators',         'tabla'),
  ('0017', 'PDI por campus',          'v_campus_facts',            'vista'),
  ('0017', 'PDI por campus',          'v_campus_facts_admin',      'vista'),
  ('0017', 'PDI por campus',          'v_campus_indicators',       'vista'),
  ('0017', 'PDI por campus',          'v_campus_pillar',           'vista'),
  ('0017', 'PDI por campus',          'v_campus_summary',          'vista'),
  ('0017', 'PDI por campus',          'v_campus_line_coverage',    'vista')
)
select
  case when c.oid is null then '✗ FALTA' else '✓ OK' end as estado,
  e.migracion,
  e.modulo,
  e.objeto,
  e.tipo,
  case
    when c.oid is null then 'Aplica supabase/migrations/' || e.migracion || '*.sql'
    -- Sin SELECT para `anon`, PostgREST ni siquiera mete el objeto en su caché:
    -- responde 404 en vez de 401, que es lo que despista.
    when e.objeto like 'v_%'
     and e.objeto not like '%_admin'
     and not has_table_privilege('anon', c.oid, 'SELECT')
      then 'Existe, pero anon no puede leerla: la API devolverá 404'
    else ''
  end as que_hacer
from esperado e
left join pg_class c
  on c.relname = e.objeto
 and c.relnamespace = 'public'::regnamespace
order by (c.oid is not null), e.migracion, e.tipo, e.objeto;

-- -----------------------------------------------------------------------------
-- 2. Resumen por migración
-- -----------------------------------------------------------------------------

with esperado(migracion, objeto) as (values
  ('0015', 'project_budget_reports'), ('0015', 'v_project_budget'),
  ('0016', 'faculties'), ('0016', 'faculty_proposals'), ('0016', 'v_faculty_proposals'),
  ('0017', 'campuses'), ('0017', 'campus_facts'), ('0017', 'v_campus_facts'),
  ('0017', 'v_campus_pillar'), ('0017', 'v_campus_summary')
)
select
  e.migracion,
  count(*) filter (where c.oid is not null)::text || ' de ' || count(*)::text as presentes,
  case
    when count(*) filter (where c.oid is null) = 0 then '✓ aplicada'
    when count(*) filter (where c.oid is not null) = 0 then '✗ sin aplicar'
    else '⚠ a medias — el editor SQL revierte todo si una sentencia falla'
  end as estado
from esperado e
left join pg_class c
  on c.relname = e.objeto and c.relnamespace = 'public'::regnamespace
group by e.migracion
order by e.migracion;

-- -----------------------------------------------------------------------------
-- 3. La estructura del plan: ¿21 áreas y 62 líneas?
--
-- La 0017 trae la estructura real del PDI. Si aquí salen 13 áreas, esa
-- migración no se aplicó y el módulo de campus no tendrá dónde anclar nada.
-- -----------------------------------------------------------------------------

select 'pilares'            as nivel, count(*)::text as filas, '6 esperados'  as esperado from public.pillars
union all
select 'áreas estratégicas', count(*)::text, '21 esperadas' from public.strategic_areas
union all
select 'líneas de acción',   count(*)::text, '62 esperadas' from public.action_lines
union all
select '  · de ellas, de la estructura antigua (AE-*)',
       count(*)::text, '0 si ya se retiró'
from public.strategic_areas where code like 'AE-%';

-- -----------------------------------------------------------------------------
-- 4. Lo que `anon` puede leer
--
-- Las tablas de campus NO deben aparecer aquí: llevan cifras financieras y solo
-- se publican a través de sus vistas. Si `campus_facts` o `campus_indicators`
-- salen en esta lista, alguien volvió a aplicar la 0007 después de la 0017.
-- -----------------------------------------------------------------------------

select
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as permisos,
  case
    when table_name in ('campus_facts', 'campus_indicators', 'project_budget_reports')
      then '⚠ NO debería estar: expone cifras financieras'
    else ''
  end as aviso
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name
order by (table_name in ('campus_facts', 'campus_indicators', 'project_budget_reports')) desc, table_name;

-- -----------------------------------------------------------------------------
-- 5. ¿Hay datos?
-- -----------------------------------------------------------------------------

select 'pilares'     as tabla, count(*)::text as filas from public.pillars
union all select 'actividades',  count(*)::text from public.activities
union all select 'proyectos',    count(*)::text from public.projects
union all select 'cortes',       count(*)::text from public.report_periods;
