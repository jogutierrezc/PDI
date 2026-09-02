-- =============================================================================
-- PDI · 0005 · Dos correcciones.
--
-- 1. Retira la columna pillars.progress.
--    El formulario de la intranet enviaba el avance derivado junto con las
--    columnas editables, así que PostgREST pedía una columna `progress` que
--    nunca debió existir. El fallo estaba en el frontend y ya está arreglado.
--
--    El avance no se guarda a propósito: se cuenta desde `activities` en la
--    vista v_pillar_progress. Guardarlo permitiría que el número del pilar y el
--    de sus actividades dejaran de coincidir, que es justo lo que se quiso
--    evitar al diseñar el esquema.
--
-- 2. Conecta los proyectos de la semilla con sus líneas de acción.
--    Sin ese enlace, el visor del pilar no puede mostrar de qué línea —y de qué
--    área— cuelga cada proyecto, ni filtrarlos por área.
--
-- Es idempotente: se puede ejecutar más de una vez sin efectos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fuera la columna de avance
-- -----------------------------------------------------------------------------

alter table public.pillars drop column if exists progress;

comment on view public.v_pillar_progress is
  'Avance de cada pilar. Es la única fuente del porcentaje: pillars no tiene columna de avance a propósito.';

-- -----------------------------------------------------------------------------
-- 2. Proyectos → líneas de acción
--
-- Se enlazan por nombre, que es único dentro de cada pilar. Solo toca los
-- proyectos que todavía no tienen línea, así que no pisa las asignaciones
-- hechas a mano desde la intranet.
-- -----------------------------------------------------------------------------

update public.projects p
set action_line_id = target.line_id
from (
  select
    pillar.id as pillar_id,
    m.project_name,
    line.id    as line_id
  from (values
    ('personalizacion',      'Rutas de acompañamiento estudiantil',           'LA-1.1'),
    ('personalizacion',      'Modelo de tutorías entre pares',                'LA-1.1'),
    ('personalizacion',      'Alertas tempranas de deserción',                'LA-2.2'),
    ('ambiente-tecnologico', 'Migración a la nube institucional',             'LA-4.1'),
    ('ambiente-tecnologico', 'Ampliación de cobertura WiFi · Campus Sur',     'LA-4.1'),
    ('ambiente-tecnologico', 'Actualización de protocolos de ciberseguridad', 'LA-4.2'),
    ('entorno-emprendedor',  'Alianzas con el sector productivo regional',    'LA-7.1'),
    ('entorno-emprendedor',  'Incubadora de base tecnológica',                'LA-6.1'),
    ('entorno-emprendedor',  'Oficina de transferencia de resultados',        'LA-7.2'),
    ('gobernanza',           'Tablero de indicadores de gobernanza',          'LA-9.2'),
    ('gobernanza',           'Actualización del estatuto general',            'LA-8.1'),
    ('gobernanza',           'Portal de datos abiertos institucionales',      'LA-9.2'),
    ('sostenibilidad',       'Plan institucional de sostenibilidad 2026',     'LA-10.1'),
    ('sostenibilidad',       'Medición de la huella de carbono',              'LA-10.1'),
    ('sostenibilidad',       'Política de compras responsables',              'LA-11.2'),
    ('apropiacion-social',   'Red de museos y bibliotecas abiertas',          'LA-12.1'),
    ('apropiacion-social',   'Programa de divulgación científica',            'LA-13.1'),
    ('apropiacion-social',   'Nodos territoriales de conocimiento',           'LA-12.2')
  ) as m(slug, project_name, line_code)
  join public.pillars         pillar on pillar.slug = m.slug
  join public.strategic_areas area   on area.pillar_id = pillar.id
  join public.action_lines    line   on line.area_id = area.id and line.code = m.line_code
) as target
where p.action_line_id is null
  and p.pillar_id = target.pillar_id
  and p.name = target.project_name;

-- Los proyectos que sigan sin línea quedan visibles en la intranet para que
-- alguien les asigne una; aquí no se inventa ninguna.
