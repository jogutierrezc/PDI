-- =============================================================================
-- PDI · Diagnóstico
--
-- Pégalo entero en el editor SQL de Supabase y mira los cuatro resultados.
-- Sirve para saber por qué la API devuelve 404 sin tener que adivinar.
--
-- Lectura rápida:
--   · Si el primer bloque dice 0 tablas → las migraciones no llegaron a
--     aplicarse (el editor SQL revierte todo el script si una sentencia falla).
--   · Si hay 14 tablas y 6 vistas pero la API sigue en 404 → es la caché de
--     PostgREST: la arregla 0007_permisos_y_cache.sql.
--   · Si faltan permisos para "anon" → también lo arregla 0007.
-- =============================================================================

-- 1. ¿Cuánto se creó?
select 'tablas'    as objeto, count(*)::text as cantidad, '14 esperadas' as esperado
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
union all
select 'vistas', count(*)::text, '6 esperadas'
from information_schema.views
where table_schema = 'public'
union all
select 'políticas RLS', count(*)::text, '25 esperadas'
from pg_policies
where schemaname = 'public'
union all
select 'disparadores', count(*)::text, '15 esperados'
from information_schema.triggers
where trigger_schema = 'public'
union all
select 'disparador en auth.users', count(*)::text, '1 esperado'
from pg_trigger
where tgname = 'on_auth_user_created' and not tgisinternal;

-- 2. Qué existe exactamente.
select table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_type, table_name;

-- 3. ¿Puede leer el rol anónimo? Sin SELECT para "anon", PostgREST ni siquiera
--    incluye el objeto en su caché y responde 404 en vez de 401.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name
order by table_name;

-- 4. ¿Hay datos?
select 'pilares' as tabla, count(*)::text as filas from public.pillars
union all select 'actividades', count(*)::text from public.activities
union all select 'proyectos',   count(*)::text from public.projects
union all select 'cortes',      count(*)::text from public.report_periods;
