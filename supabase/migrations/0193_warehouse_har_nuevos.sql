-- =============================================================================
-- 0193 · Warehouse UDES · políticas de los reportes de los HAR de octubre de 2026
--
-- Los HAR nuevos («Master Har» y «davinci har», Bucaramanga) mostraron la ruta,
-- el cuerpo y el encabezado de reportes que el almacén aún no guardaba. Cada
-- conjunto necesita su política de privacidad (wh_politicas, 0155 y 0161) antes
-- de poder cargarse. Los nombres de columna son los del Excel normalizados (sin
-- tildes, en minúscula y con «_»; motor.ts · normalizarColumna).
--
--   ms_asp / ms_asppos  Consolidado general de aspirantes de pregrado / posgrado
--                       (Master). Solo conteos «ahora / histórico» por tipo y
--                       programa: sin personas.
--   dv_cred   Promedio, créditos y ubicación (Davinci). El Excel trae nombre,
--             correo personal y celular: se descartan. El código real se conserva.
--   dv_prom   Promedios de estudiantes (Davinci). Se descartan tipo de documento,
--             identificación y nombre.
--   dv_cond   Estudiantes condicionales (Davinci). Se descartan nombre,
--             apellidos e identificación.
--   dv_deser / dv_deserpos  Histórico de desertores de pregrado / posgrado
--             (Davinci). «Estudiante» es el código real; una columna por periodo
--             (2014a…2035b: las futuras ya quedan permitidas) con las siglas MP,
--             MAT, AUS, DES, GRAD, DP, PFP.
--   ms_nuevos / ms_activos  Nuevos matriculados y estudiantes activos (Master):
--             la misma ficha de 36 columnas que «Estudiantes matriculados»
--             (dv_matric) y la misma política: se descartan documento, nombres,
--             género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos,
--             correo, colegio y salud; se conserva el código real (dato personal)
--             y se derivan grupo_etario y origen antes de descartar la fecha de
--             nacimiento y el departamento.
--   ms_actdir Actividades directas y de apoyo (Master): catálogo de actividades,
--             sin personas.
--   ms_posgmat Matrícula de posgrados por estudiante y grupo (Master). Trae
--             documento y nombre del estudiante: se descartan; se conserva el
--             código real, el programa, la materia y el grupo.
--
-- Además, la nómina docente (ms_nom) cambió de ruta y de columnas: el Excel de
-- «paysheet/consolidated» trae grp, dpto_carrera, horas, semanas y mat donde el
-- anterior traía otros nombres. Se añaden a lo que la política conserva (la cédula
-- sigue como seudónimo; nombres, observaciones y correos se siguen descartando).
--
-- Lo que no cambia: NUNCA se guardan nombres, documento, fecha de nacimiento,
-- dirección, salud, contraseñas, correo ni teléfono; el CHECK de 0161 lo impide en
-- cualquier lista «permitir». Un conjunto sin política no se guarda.
--
-- Requiere 0155–0161. Idempotente. No borra nada.
-- =============================================================================

-- 1. Conjuntos sin personas -------------------------------------------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('ms_asp', 'excluir', '{}', '{}', '{}', '',
   'Aspirantes de pregrado por tipo y programa: conteos «ahora / histórico» por estado del proceso. Sin datos de personas.'),
  ('ms_asppos', 'excluir', '{}', '{}', '{}', '',
   'Aspirantes de posgrado por tipo y programa: conteos «ahora / histórico» por estado del proceso. Sin datos de personas.'),
  ('ms_actdir', 'excluir', '{}', '{}', '{}', '',
   'Actividades directas y de apoyo: código, nombre, tipo, instrucciones y vinculación. Sin datos de personas.')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- 2. Davinci: créditos, promedios, condicionales ------------------------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('dv_cred', 'permitir',
   '{codigo,estado,creditos_materias_plan_de_estudios,creditos_materias_electivas,creditos_materias_bienestar,creditos_ubicacion,semestre_ubicacion,creditos_semestre,creditos_promedio,promedio_acumulado,ultimo_poligrafo,promedio_semestre_ultimo_poligrafo}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan el nombre, el correo personal y el celular; el código real se conserva (dato personal).'),
  ('dv_prom', 'permitir',
   '{codigo,codigo_programa,nombre_programa,pensum,periodo_poligrafo,promedio_semestre,promedio_acumulado_poligrafo}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan el tipo de documento, la identificación y el nombre; el código real se conserva (dato personal).'),
  ('dv_cond', 'permitir',
   '{codigo,condicionalidades,programa,activo,activo_financiero,pfp}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan el nombre, los apellidos y la identificación; el código real se conserva (dato personal).')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- 3. Histórico de desertores: una columna por periodo ---------------------------------

do $$
declare
  periodos text[];
begin
  select array_agg(y::text || s order by y, s) into periodos
    from generate_series(2014, 2035) y, unnest(array['a', 'b']) s;

  insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
    ('dv_deser', 'permitir',
     array['estudiante', 'programa', 'periodo', 'pfp', 'modalidad'] || periodos,
     '{}', '{estudiante}', 'Seguimiento de la permanencia y la deserción de estudiantes.',
     'Histórico de desertores de pregrado. «Estudiante» es el código real (dato personal); cada columna de periodo trae la sigla del estado (MP, MAT, AUS, DES, GRAD, DP, PFP). La hoja «Convenciones» no se guarda.'),
    ('dv_deserpos', 'permitir',
     array['estudiante', 'programa', 'periodo', 'pfp', 'modalidad'] || periodos,
     '{}', '{estudiante}', 'Seguimiento de la permanencia y la deserción de estudiantes.',
     'Histórico de desertores de posgrado (sin verificar en un HAR). «Estudiante» es el código real (dato personal).')
  on conflict (conjunto) do update
    set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
        datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;
end
$$;

-- 4. Master: nuevos matriculados y activos (la ficha de dv_matric) ----------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota)
select c.conjunto, p.modo, p.lista, '{}'::text[], p.datos_personales, p.finalidad,
       'Se descartan documento, nombres, género, nacimiento, ciudad, dirección, barrio, estrato, teléfonos, correo, colegio, salud y responsable de matrícula; el código real se conserva (dato personal). Se derivan, sin identificar a nadie, el grupo etario y si viene de Santander.'
  from public.wh_politicas p
  cross join (values ('ms_nuevos'), ('ms_activos')) as c (conjunto)
 where p.conjunto = 'dv_matric'
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- 5. Master: matrícula de posgrados por estudiante y grupo --------------------------------

insert into public.wh_politicas (conjunto, modo, lista, seudonimizar, datos_personales, finalidad, nota) values
  ('ms_posgmat', 'permitir',
   '{codigo,cod_programa,programa,cod_materia,grupo,materia}',
   '{}', '{codigo}', 'Seguimiento académico de estudiantes (alertas tempranas).',
   'Se descartan el documento y el nombre del estudiante; el código real se conserva (dato personal).')
on conflict (conjunto) do update
  set modo = excluded.modo, lista = excluded.lista, seudonimizar = excluded.seudonimizar,
      datos_personales = excluded.datos_personales, finalidad = excluded.finalidad, nota = excluded.nota;

-- 6. Nómina docente: las columnas de la ruta nueva ---------------------------------------

update public.wh_politicas
   set lista = (select array_agg(distinct x) from unnest(lista || array['grp', 'dpto_carrera', 'horas', 'semanas', 'mat', 'ult_modificacion']) x)
 where conjunto = 'ms_nom';

notify pgrst, 'reload schema';
