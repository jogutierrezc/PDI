-- =============================================================================
-- PDI · 0004 · Datos iniciales.
--
-- Reemplaza los datos que antes vivían en src/data/pdi.ts. Son datos de
-- arranque para que el portal funcione de extremo a extremo desde el primer
-- despliegue: sustitúyelos por los reales desde la intranet.
--
-- La migración es idempotente (on conflict do nothing), así que volver a
-- ejecutarla no duplica nada.
--
-- Nota sobre el avance: aquí no se escribe ningún porcentaje de pilar. El
-- avance sale de contar actividades, así que las cifras del tablero y las de
-- cada pilar no pueden discrepar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogos globales
-- -----------------------------------------------------------------------------

insert into public.parameters (category, label, description, position) values
  ('estado_proyecto', 'Activo',       'El proyecto está en ejecución.',            1),
  ('estado_proyecto', 'En pausa',     'Detenido temporalmente.',                   2),
  ('estado_proyecto', 'Finalizado',   'Cerrado con evidencias entregadas.',        3),
  ('estado_proyecto', 'No iniciado',  'Programado, aún sin comenzar.',             4),
  ('nivel_gestion',   'Estratégico',  'Indicador de seguimiento del Consejo Superior.', 1),
  ('nivel_gestion',   'Táctico',      'Seguimiento de vicerrectoría o dirección.', 2),
  ('nivel_gestion',   'Operativo',    'Seguimiento del equipo ejecutor.',          3),
  ('unidad',          'Porcentaje',   'Resultado expresado de 0 a 100.',           1),
  ('unidad',          'Número',       'Conteo absoluto.',                          2),
  ('unidad',          'Pesos',        'Valor monetario en COP.',                   3),
  ('unidad',          'Índice',       'Valor compuesto normalizado.',              4),
  ('periodicidad',    'Mensual',      NULL,                                        1),
  ('periodicidad',    'Trimestral',   NULL,                                        2),
  ('periodicidad',    'Semestral',    NULL,                                        3),
  ('periodicidad',    'Anual',        NULL,                                        4)
on conflict (category, label) do nothing;

-- -----------------------------------------------------------------------------
-- Corte de reporte vigente
-- -----------------------------------------------------------------------------

insert into public.report_periods (label, cutoff_date, is_current, published_at)
values ('Corte agosto 2026', date '2026-08-28', true, timestamptz '2026-08-28 12:00:00-05')
on conflict (cutoff_date) do nothing;

-- -----------------------------------------------------------------------------
-- Pilares
-- -----------------------------------------------------------------------------

insert into public.pillars
  (slug, numeral, name, description, focus, insight, icon, accent_slot,
   impulsor, contributes, management_owner, calculation_owner, status, position)
values
  ('personalizacion', 'I', 'Personalización',
   'Enfoque humano y adaptación a las necesidades individuales para potenciar el talento de cada estudiante.',
   'Acompañamiento estudiantil y experiencias flexibles.',
   'La permanencia mejora donde el acompañamiento llegó primero: conviene replicar ese modelo en las facultades que aún no lo aplican.',
   'person', 1,
   'Desarrollo integral de la comunidad universitaria',
   'Experiencia educativa y permanencia estudiantil',
   'Vicerrectoría Académica', 'Oficina de Planeación', 'publicado', 1),

  ('ambiente-tecnologico', 'II', 'Ambiente tecnológico',
   'Infraestructura y digitalización de vanguardia para soportar los procesos académicos e investigativos.',
   'Infraestructura digital, analítica y servicios.',
   'Priorizar las iniciativas de cultura digital en el próximo trimestre para equilibrar el desarrollo del pilar.',
   'chip', 2,
   'Transformación digital y eficiencia institucional',
   'Modernización, innovación y continuidad operativa',
   'Dirección TIC', 'Oficina de Planeación', 'publicado', 2),

  ('entorno-emprendedor', 'III', 'Entorno emprendedor',
   'Fomento de la innovación y la creación de empresas, conectando el saber con el desarrollo económico local.',
   'Innovación, incubación y conexión con empresas.',
   'La vinculación con el sector productivo es la línea con más riesgo: depende de convenios que aún no se firman.',
   'spark', 3,
   'Innovación, emprendimiento y transferencia',
   'Desarrollo económico regional y empleabilidad',
   'Cámara de Innovación', 'Oficina de Planeación', 'publicado', 3),

  ('gobernanza', 'IV', 'Gobernanza para el buen gobierno',
   'Estructuras sólidas, transparentes e inclusivas que garantizan una toma de decisiones participativa.',
   'Decisiones, transparencia y seguimiento.',
   'Es el pilar más consolidado. El siguiente salto está en publicar como datos abiertos lo que hoy solo se reporta en informes.',
   'columns', 4,
   'Transparencia y decisiones basadas en evidencia',
   'Confianza institucional y rendición de cuentas',
   'Secretaría General', 'Secretaría General', 'publicado', 4),

  ('sostenibilidad', 'V', 'Sostenibilidad',
   'Compromiso transversal con el cuidado ambiental, el equilibrio social y la viabilidad financiera.',
   'Gestión ambiental, financiera y social.',
   'Las compras responsables van por detrás del resto: el criterio ambiental todavía no es obligatorio en los pliegos.',
   'leaf', 5,
   'Equilibrio ambiental, social y financiero',
   'Viabilidad de largo plazo de la institución',
   'Planeación', 'Oficina de Planeación', 'publicado', 5),

  ('apropiacion-social', 'VI', 'Apropiación social',
   'Transferencia efectiva del conocimiento a la comunidad, fortaleciendo el tejido social y cultural.',
   'Impacto territorial y transferencia de conocimiento.',
   'El alcance territorial crece más despacio que la divulgación: hace falta presencia sostenida fuera del área metropolitana.',
   'community', 6,
   'Conocimiento al servicio del territorio',
   'Impacto social y pertinencia regional',
   'Extensión', 'Oficina de Planeación', 'publicado', 6)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Áreas estratégicas y líneas de acción
-- -----------------------------------------------------------------------------

insert into public.strategic_areas (pillar_id, code, name, description, position)
select p.id, v.code, v.name, v.description, v.position
from public.pillars p
join (values
  ('personalizacion',      'AE-01', 'Acompañamiento académico',      'Rutas de apoyo, tutoría y permanencia estudiantil.', 1),
  ('personalizacion',      'AE-02', 'Flexibilidad curricular',       'Trayectorias y modalidades adaptables.',             2),
  ('ambiente-tecnologico', 'AE-03', 'Infraestructura tecnológica',   'Capacidad, disponibilidad y modernización de los servicios digitales.', 1),
  ('ambiente-tecnologico', 'AE-04', 'Seguridad y continuidad',       'Protección de la información y operación confiable.', 2),
  ('ambiente-tecnologico', 'AE-05', 'Cultura digital',               'Competencias digitales de la comunidad.',            3),
  ('entorno-emprendedor',  'AE-06', 'Incubación y aceleración',      'Acompañamiento a emprendimientos de base tecnológica.', 1),
  ('entorno-emprendedor',  'AE-07', 'Vinculación con empresas',      'Convenios y proyectos con el sector productivo.',    2),
  ('gobernanza',           'AE-08', 'Normativa y estatutos',         'Marco normativo institucional.',                     1),
  ('gobernanza',           'AE-09', 'Transparencia y datos abiertos','Publicación y rendición de cuentas.',                2),
  ('sostenibilidad',       'AE-10', 'Gestión ambiental del campus',  'Huella ambiental y eficiencia de recursos.',         1),
  ('sostenibilidad',       'AE-11', 'Sostenibilidad financiera',     'Equilibrio presupuestal de largo plazo.',            2),
  ('apropiacion-social',   'AE-12', 'Extensión y proyección social', 'Programas con impacto en el territorio.',            1),
  ('apropiacion-social',   'AE-13', 'Divulgación científica',        'Comunicación pública del conocimiento.',             2)
) as v(slug, code, name, description, position) on v.slug = p.slug
on conflict (pillar_id, name) do nothing;

insert into public.action_lines (area_id, code, name, progress, position)
select a.id, v.code, v.name, v.progress, v.position
from public.strategic_areas a
join (values
  ('AE-01', 'LA-1.1', 'Acompañamiento académico',        88, 1),
  ('AE-02', 'LA-2.1', 'Flexibilidad curricular',         74, 1),
  ('AE-02', 'LA-2.2', 'Bienestar y permanencia',         66, 2),
  ('AE-03', 'LA-4.1', 'Infraestructura base',            85, 1),
  ('AE-04', 'LA-4.2', 'Ciberseguridad institucional',    60, 1),
  ('AE-05', 'LA-5.1', 'Cultura digital',                 30, 1),
  ('AE-06', 'LA-6.1', 'Incubación y aceleración',        72, 1),
  ('AE-07', 'LA-7.1', 'Vinculación con empresas',        58, 1),
  ('AE-07', 'LA-7.2', 'Propiedad intelectual',           41, 2),
  ('AE-08', 'LA-8.1', 'Normativa y estatutos',           94, 1),
  ('AE-09', 'LA-9.1', 'Participación de la comunidad',   81, 1),
  ('AE-09', 'LA-9.2', 'Transparencia y datos abiertos',  77, 2),
  ('AE-10', 'LA-10.1','Gestión ambiental del campus',    84, 1),
  ('AE-11', 'LA-11.1','Sostenibilidad financiera',       79, 1),
  ('AE-11', 'LA-11.2','Compras responsables',            52, 2),
  ('AE-12', 'LA-12.1','Extensión y proyección social',   83, 1),
  ('AE-12', 'LA-12.2','Redes con el territorio',         49, 2),
  ('AE-13', 'LA-13.1','Divulgación científica',          64, 1)
) as v(area_code, code, name, progress, position) on v.area_code = a.code
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Indicadores (dos protocolos por pilar)
-- -----------------------------------------------------------------------------

insert into public.indicators
  (pillar_id, code, name, status_label, level_id, unit_id, periodicity_id,
   considerations, budget_amount, budget_progress, elapsed_label, elapsed_progress,
   critical_tasks, is_primary, position)
select
  p.id, v.code, v.name, v.status_label,
  (select id from public.parameters where category = 'nivel_gestion' and label = v.level),
  (select id from public.parameters where category = 'unidad'        and label = 'Porcentaje'),
  (select id from public.parameters where category = 'periodicidad'  and label = v.periodicity),
  v.considerations, v.budget, v.budget_progress, v.elapsed, v.elapsed_progress,
  v.critical, v.is_primary, v.position
from public.pillars p
join (values
  ('personalizacion',      'PDI-PE-001', 'Indicador principal',    'En curso',      'Estratégico', 'Anual',   'El avance considera proyectos activos, hitos aprobados y evidencias reportadas durante el periodo de seguimiento.', 3100000.00, 78, '18 meses', 40, 1, true,  1),
  ('personalizacion',      'PDI-PE-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Mensual', 'La medición se actualiza con reportes de acompañamiento y actas de validación del comité técnico.',                 1900000.00, 46, '9 meses',  22, 1, false, 2),
  ('ambiente-tecnologico', 'PDI-AT-001', 'Indicador principal',    'En curso',      'Estratégico', 'Anual',   'El avance considera proyectos activos, hitos aprobados y evidencias reportadas durante el periodo de seguimiento.', 4200000.00, 65, '18 meses', 40, 2, true,  1),
  ('ambiente-tecnologico', 'PDI-AT-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Mensual', 'La medición se actualiza con reportes de disponibilidad, usuarios activos y actas de validación.',                   2800000.00, 38, '9 meses',  22, 3, false, 2),
  ('entorno-emprendedor',  'PDI-EE-001', 'Indicador principal',    'En curso',      'Estratégico', 'Anual',   'El avance considera convenios firmados, cohortes abiertas y registros de propiedad intelectual.',                   2600000.00, 52, '18 meses', 40, 3, true,  1),
  ('entorno-emprendedor',  'PDI-EE-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Trimestral', 'La medición se actualiza con actas de la incubadora y reportes de vinculación empresarial.',                     1600000.00, 33, '9 meses',  22, 2, false, 2),
  ('gobernanza',           'PDI-GB-001', 'Indicador principal',    'Consolidado',   'Estratégico', 'Anual',   'El avance considera actos administrativos expedidos y publicaciones de rendición de cuentas.',                      1800000.00, 88, '18 meses', 40, 1, true,  1),
  ('gobernanza',           'PDI-GB-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Semestral', 'La medición se actualiza con las sesiones del Consejo Superior y los conjuntos de datos publicados.',             900000.00,  61, '9 meses',  22, 1, false, 2),
  ('sostenibilidad',       'PDI-SO-001', 'Indicador principal',    'En curso',      'Estratégico', 'Anual',   'El avance considera la huella medida, la ejecución presupuestal y los pliegos con criterio ambiental.',             3400000.00, 71, '18 meses', 40, 2, true,  1),
  ('sostenibilidad',       'PDI-SO-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Trimestral', 'La medición se actualiza con los reportes de planta física y las actas del comité financiero.',                  2100000.00, 44, '9 meses',  22, 1, false, 2),
  ('apropiacion-social',   'PDI-AS-001', 'Indicador principal',    'En curso',      'Estratégico', 'Anual',   'El avance considera nodos territoriales activos, actividades de divulgación y beneficiarios registrados.',          2200000.00, 49, '18 meses', 40, 3, true,  1),
  ('apropiacion-social',   'PDI-AS-002', 'Seguimiento operativo',  'En validación', 'Táctico',     'Mensual', 'La medición se actualiza con los reportes de extensión y las actas de los nodos.',                                  1300000.00, 30, '9 meses',  22, 2, false, 2)
) as v(slug, code, name, status_label, level, periodicity, considerations,
       budget, budget_progress, elapsed, elapsed_progress, critical, is_primary, position)
  on v.slug = p.slug
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Proyectos estratégicos
-- -----------------------------------------------------------------------------

insert into public.projects (pillar_id, name, owner, description, due_date, progress, status, position)
select p.id, v.name, v.owner, v.description, v.due_date, v.progress, v.status::public.activity_status, v.position
from public.pillars p
join (values
  ('personalizacion',      'Rutas de acompañamiento estudiantil',           'Bienestar Universitario',        'Despliegue de las rutas de apoyo en todos los programas de pregrado.', date '2026-08-31', 100, 'cumplida',  1),
  ('personalizacion',      'Modelo de tutorías entre pares',                'Vicerrectoría Académica',        'Formación y seguimiento de tutores estudiantiles.',                    date '2026-10-30',  68, 'curso',     2),
  ('personalizacion',      'Alertas tempranas de deserción',                'Analítica Institucional',        'Tablero predictivo de riesgo de deserción por programa.',              date '2027-02-26',  22, 'pendiente', 3),
  ('ambiente-tecnologico', 'Migración a la nube institucional',             'Dirección TIC',                  'Migración de servicios críticos a infraestructura en la nube.',        date '2026-10-30',  75, 'curso',     1),
  ('ambiente-tecnologico', 'Ampliación de cobertura WiFi · Campus Sur',     'Dirección TIC',                  'Cobertura inalámbrica completa del campus sur.',                       date '2026-01-30', 100, 'cumplida',  2),
  ('ambiente-tecnologico', 'Actualización de protocolos de ciberseguridad', 'Seguridad de la Información',    'Adopción de un modelo de confianza cero.',                             date '2027-03-31',  10, 'pendiente', 3),
  ('entorno-emprendedor',  'Alianzas con el sector productivo regional',    'Innovación y Emprendimiento',    'Convenios marco con gremios y empresas de la región.',                 date '2026-09-30',  61, 'riesgo',    1),
  ('entorno-emprendedor',  'Incubadora de base tecnológica',                'Cámara de Innovación',           'Segunda cohorte de emprendimientos acompañados.',                      date '2026-07-31',  90, 'curso',     2),
  ('entorno-emprendedor',  'Oficina de transferencia de resultados',        'Vicerrectoría de Investigación', 'Puesta en marcha de la oficina de transferencia.',                     date '2027-04-30',  18, 'pendiente', 3),
  ('gobernanza',           'Tablero de indicadores de gobernanza',          'Secretaría General',             'Publicación del seguimiento a las decisiones de gobierno.',            date '2026-08-31',  95, 'cumplida',  1),
  ('gobernanza',           'Actualización del estatuto general',            'Consejo Superior',               'Reforma estatutaria participativa.',                                   date '2026-11-30',  82, 'curso',     2),
  ('gobernanza',           'Portal de datos abiertos institucionales',      'Planeación',                     'Publicación de conjuntos de datos del PDI.',                           date '2027-05-31',  30, 'pendiente', 3),
  ('sostenibilidad',       'Plan institucional de sostenibilidad 2026',     'Gestión Ambiental',              'Formulación y adopción del plan de sostenibilidad.',                   date '2026-10-30',  84, 'curso',     1),
  ('sostenibilidad',       'Medición de la huella de carbono',              'Planta Física',                  'Línea base de emisiones del campus.',                                  date '2026-06-30', 100, 'cumplida',  2),
  ('sostenibilidad',       'Política de compras responsables',              'Vicerrectoría Administrativa',   'Criterios ambientales obligatorios en la contratación.',               date '2027-03-31',  35, 'pendiente', 3),
  ('apropiacion-social',   'Red de museos y bibliotecas abiertas',          'Extensión',                      'Apertura de espacios culturales a la comunidad.',                      date '2026-11-30',  40, 'pendiente', 1),
  ('apropiacion-social',   'Programa de divulgación científica',            'Vicerrectoría de Investigación', 'Calendario permanente de divulgación.',                                date '2026-09-30',  88, 'curso',     2),
  ('apropiacion-social',   'Nodos territoriales de conocimiento',           'Extensión',                      'Presencia sostenida fuera del área metropolitana.',                    date '2027-02-26', 100, 'cumplida',  3)
) as v(slug, name, owner, description, due_date, progress, status, position) on v.slug = p.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Actividades
--
-- El avance de cada pilar y el del plan completo salen de contar estas filas.
-- -----------------------------------------------------------------------------

insert into public.activities (pillar_id, title, owner, due_date, progress, status, is_featured, position)
select p.id, v.title, v.owner, v.due_date, v.progress, v.status::public.activity_status, v.is_featured, v.position
from public.pillars p
join (values
  -- Personalización · 5 de 6 cumplidas
  ('personalizacion', 'Actualización de rutas de acompañamiento',        'Bienestar Universitario',        date '2026-08-31', 100, 'cumplida',  true,  1),
  ('personalizacion', 'Diagnóstico de permanencia por programa',         'Vicerrectoría Académica',        date '2026-05-29', 100, 'cumplida',  false, 2),
  ('personalizacion', 'Formación de tutores pares',                      'Bienestar Universitario',        date '2026-06-30', 100, 'cumplida',  false, 3),
  ('personalizacion', 'Ajuste de trayectorias flexibles',                'Vicerrectoría Académica',        date '2026-07-31', 100, 'cumplida',  false, 4),
  ('personalizacion', 'Protocolo de atención psicosocial',               'Bienestar Universitario',        date '2026-04-30', 100, 'cumplida',  false, 5),
  ('personalizacion', 'Piloto de alertas tempranas',                     'Analítica Institucional',        date '2026-12-18',  55, 'curso',     false, 6),

  -- Ambiente tecnológico · 4 de 6 cumplidas
  ('ambiente-tecnologico', 'Fortalecimiento del aula híbrida',           'Dirección TIC',                  date '2026-09-30',  72, 'curso',     true,  1),
  ('ambiente-tecnologico', 'Cobertura WiFi del campus sur',              'Dirección TIC',                  date '2026-01-30', 100, 'cumplida',  false, 2),
  ('ambiente-tecnologico', 'Renovación del centro de datos',             'Dirección TIC',                  date '2026-03-31', 100, 'cumplida',  false, 3),
  ('ambiente-tecnologico', 'Integración del sistema académico',          'Dirección TIC',                  date '2026-06-30', 100, 'cumplida',  false, 4),
  ('ambiente-tecnologico', 'Mesa de ayuda institucional',                'Soporte TI',                     date '2026-07-31', 100, 'cumplida',  false, 5),
  ('ambiente-tecnologico', 'Plan de formación en competencias digitales','Dirección TIC',                  date '2027-02-26',  15, 'pendiente', false, 6),

  -- Entorno emprendedor · 3 de 6 cumplidas, 1 en riesgo
  ('entorno-emprendedor', 'Alianzas con el sector productivo regional',  'Innovación y Emprendimiento',    date '2026-09-30',  61, 'riesgo',    true,  1),
  ('entorno-emprendedor', 'Primera cohorte de la incubadora',            'Cámara de Innovación',           date '2026-02-27', 100, 'cumplida',  false, 2),
  ('entorno-emprendedor', 'Reglamento de propiedad intelectual',         'Vicerrectoría de Investigación', date '2026-05-29', 100, 'cumplida',  false, 3),
  ('entorno-emprendedor', 'Feria regional de emprendimiento',            'Cámara de Innovación',           date '2026-08-28', 100, 'cumplida',  false, 4),
  ('entorno-emprendedor', 'Segunda cohorte de la incubadora',            'Cámara de Innovación',           date '2026-12-18',  70, 'curso',     false, 5),
  ('entorno-emprendedor', 'Puesta en marcha de la oficina de transferencia', 'Vicerrectoría de Investigación', date '2027-04-30', 18, 'pendiente', false, 6),

  -- Gobernanza · 5 de 6 cumplidas
  ('gobernanza', 'Tablero de indicadores de gobernanza',                 'Secretaría General',             date '2026-08-31', 100, 'cumplida',  true,  1),
  ('gobernanza', 'Política de conflicto de intereses',                   'Secretaría General',             date '2026-03-31', 100, 'cumplida',  false, 2),
  ('gobernanza', 'Calendario de rendición de cuentas',                   'Secretaría General',             date '2026-04-30', 100, 'cumplida',  false, 3),
  ('gobernanza', 'Reglamento de comités institucionales',                'Secretaría General',             date '2026-06-30', 100, 'cumplida',  false, 4),
  ('gobernanza', 'Actualización del estatuto general · fase 1',          'Consejo Superior',               date '2026-07-31', 100, 'cumplida',  false, 5),
  ('gobernanza', 'Publicación de datos abiertos del PDI',                'Planeación',                     date '2026-12-18',  30, 'curso',     false, 6),

  -- Sostenibilidad · 4 de 6 cumplidas
  ('sostenibilidad', 'Plan institucional de sostenibilidad 2026',        'Gestión Ambiental',              date '2026-10-30',  84, 'curso',     true,  1),
  ('sostenibilidad', 'Línea base de huella de carbono',                  'Planta Física',                  date '2026-06-30', 100, 'cumplida',  false, 2),
  ('sostenibilidad', 'Programa de eficiencia energética',                'Planta Física',                  date '2026-05-29', 100, 'cumplida',  false, 3),
  ('sostenibilidad', 'Gestión integral de residuos',                     'Gestión Ambiental',              date '2026-03-31', 100, 'cumplida',  false, 4),
  ('sostenibilidad', 'Modelo financiero a cinco años',                   'Vicerrectoría Administrativa',   date '2026-07-31', 100, 'cumplida',  false, 5),
  ('sostenibilidad', 'Criterios ambientales en la contratación',         'Vicerrectoría Administrativa',   date '2027-03-31',  35, 'curso',     false, 6),

  -- Apropiación social · 3 de 6 cumplidas
  ('apropiacion-social', 'Red de museos y bibliotecas abiertas',         'Extensión',                      date '2026-11-30',  40, 'pendiente', true,  1),
  ('apropiacion-social', 'Nodos territoriales de conocimiento',          'Extensión',                      date '2026-02-27', 100, 'cumplida',  false, 2),
  ('apropiacion-social', 'Ciclo de divulgación científica',              'Vicerrectoría de Investigación', date '2026-05-29', 100, 'cumplida',  false, 3),
  ('apropiacion-social', 'Programa de voluntariado universitario',       'Extensión',                      date '2026-06-30', 100, 'cumplida',  false, 4),
  ('apropiacion-social', 'Observatorio de impacto social',               'Extensión',                      date '2026-12-18',  45, 'curso',     false, 5),
  ('apropiacion-social', 'Ampliación a dos municipios más',              'Extensión',                      date '2027-05-31',  10, 'pendiente', false, 6)
) as v(slug, title, owner, due_date, progress, status, is_featured, position) on v.slug = p.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Planeación de resultados
-- -----------------------------------------------------------------------------

insert into public.planning_items (pillar_id, text, position)
select p.id, v.text, v.position
from public.pillars p
join (values
  ('personalizacion',      'Extender las rutas de acompañamiento a los programas de posgrado.', 1),
  ('personalizacion',      'Consolidar el tablero de alertas tempranas de deserción.',          2),
  ('personalizacion',      'Validar evidencias del semestre con las facultades.',               3),
  ('ambiente-tecnologico', 'Cerrar la migración de los servicios críticos restantes.',          1),
  ('ambiente-tecnologico', 'Formalizar el plan de formación en competencias digitales.',        2),
  ('ambiente-tecnologico', 'Actualizar metas y responsables del indicador.',                    3),
  ('entorno-emprendedor',  'Formalizar los convenios pendientes con el sector productivo.',     1),
  ('entorno-emprendedor',  'Abrir la segunda cohorte de la incubadora.',                        2),
  ('entorno-emprendedor',  'Definir la línea base de registros de propiedad intelectual.',      3),
  ('gobernanza',           'Publicar el conjunto de datos abiertos del seguimiento del PDI.',   1),
  ('gobernanza',           'Cerrar el ciclo de actualización estatutaria.',                     2),
  ('gobernanza',           'Programar la audiencia pública de rendición de cuentas.',           3),
  ('sostenibilidad',       'Incorporar criterios ambientales obligatorios en la contratación.', 1),
  ('sostenibilidad',       'Publicar la huella de carbono del campus.',                         2),
  ('sostenibilidad',       'Revisar el modelo financiero a cinco años.',                        3),
  ('apropiacion-social',   'Ampliar la red de nodos territoriales a dos municipios más.',       1),
  ('apropiacion-social',   'Consolidar el calendario de divulgación científica.',               2),
  ('apropiacion-social',   'Medir el impacto social de los proyectos de extensión.',            3)
) as v(slug, text, position) on v.slug = p.slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Repositorio documental institucional
-- -----------------------------------------------------------------------------

insert into public.documents (pillar_id, title, description, kind, url, size_label, is_public, published_at, position)
values
  (null, 'Plan de Desarrollo Institucional 2024-2028', 'Documento maestro aprobado por el Consejo Superior.', 'PDF',
   'https://www.udes.edu.co/institucion/plan-de-desarrollo', '4,2 MB', true, now(), 1),
  (null, 'Matriz de indicadores por pilar', 'Fichas técnicas, metas y responsables de cálculo.', 'XLSX',
   'https://www.udes.edu.co/institucion/plan-de-desarrollo', '860 KB', true, now(), 2),
  (null, 'Informe de avance · corte agosto 2026', 'Resultados del periodo y evidencias asociadas.', 'PDF',
   'https://www.udes.edu.co/institucion/plan-de-desarrollo', '2,1 MB', true, now(), 3),
  (null, 'Guía metodológica de seguimiento', 'Cómo se reporta, valida y publica cada avance.', 'PDF',
   'https://www.udes.edu.co/institucion/plan-de-desarrollo', '1,3 MB', true, now(), 4)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Control de cambios
-- -----------------------------------------------------------------------------

insert into public.change_log (pillar_id, indicator_id, area_code, version, approved_by, changed_on, description, change_type)
select p.id, i.id, v.area_code, v.version, v.approved_by, v.changed_on, v.description, v.change_type::public.change_type
from public.pillars p
join (values
  ('personalizacion',      'PDI-PE-001', 'AE-01', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion'),
  ('personalizacion',      'PDI-PE-001', 'AE-01', '1.1', 'Dirección de Planeación',  date '2025-02-08', 'Actualización de metas y responsables de cálculo.',   'modificacion'),
  ('ambiente-tecnologico', 'PDI-AT-001', 'AE-03', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion'),
  ('ambiente-tecnologico', 'PDI-AT-001', 'AE-04', '1.2', 'Comité de Planeación',     date '2025-10-25', 'Actualización de presupuesto y tareas críticas.',     'modificacion'),
  ('entorno-emprendedor',  'PDI-EE-001', 'AE-06', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion'),
  ('gobernanza',           'PDI-GB-001', 'AE-08', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion'),
  ('gobernanza',           'PDI-GB-001', 'AE-09', '2.0', 'Consejo Superior',         date '2025-06-12', 'Reforma del alcance del indicador de transparencia.', 'reforma'),
  ('sostenibilidad',       'PDI-SO-001', 'AE-10', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion'),
  ('apropiacion-social',   'PDI-AS-001', 'AE-12', '1.0', 'Comité de Planeación',     date '2024-10-15', 'Registro inicial del indicador del pilar.',           'creacion')
) as v(slug, indicator_code, area_code, version, approved_by, changed_on, description, change_type)
  on v.slug = p.slug
left join public.indicators i on i.code = v.indicator_code
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Glosario
-- -----------------------------------------------------------------------------

-- Términos comunes a todo el plan (pillar_id nulo).
insert into public.glossary_terms (pillar_id, term, definition, description, position) values
  (null, 'Avance',    'Porcentaje de ejecución', 'Resultado validado frente a la meta definida para el periodo.', 1),
  (null, 'Hito',      'Resultado verificable',   'Evento o entregable que evidencia el avance de un proyecto.',   2),
  (null, 'Evidencia', 'Soporte documental',      'Archivo o registro que respalda el cumplimiento reportado.',    3)
on conflict do nothing;

insert into public.glossary_terms (pillar_id, term, definition, description, source, position)
select p.id, v.term, v.definition, v.description, v.source, v.position
from public.pillars p
join (values
  ('ambiente-tecnologico', 'Zero-Trust', 'Modelo de seguridad', 'Arquitectura sin confianza implícita: cada acceso se verifica.', 'NIST SP 800-207', 1),
  ('sostenibilidad',       'Huella de carbono', 'Emisiones equivalentes', 'Toneladas de CO₂ equivalente atribuibles a la operación del campus.', 'GHG Protocol', 1)
) as v(slug, term, definition, description, source, position) on v.slug = p.slug
on conflict do nothing;
