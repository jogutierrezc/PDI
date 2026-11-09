-- =============================================================================
-- PDI · 0266 · Documentos · las publicaciones de la comunidad «AJ. Rectoría»
--                           del Repositorio Digital de la UDES
--
-- Requiere 0051 y 0052. Idempotente: correrla dos veces no duplica nada.
--
-- Fuente: https://repositorio.udes.edu.co/communities/12aefab5-b6db-4c87-b0f0-ce67c9a7fcf5
-- (colección «AJA. Planeación Institucional»), leída el 2026-11-09: 29 publicaciones.
-- Cada una queda como un ENLACE a su página del repositorio (enlace permanente
-- /handle/001/N), con el tipo «Repositorio» y su año y fecha de publicación.
--
-- Qué hace con cada publicación, en este orden:
--   1. Si ya hay un documento con ese enlace del repositorio: no hace nada.
--   2. Si ya existe en el portal con un enlace a SharePoint (columna «actual»):
--      cambia SOLO su enlace al del repositorio. Conserva su título, su
--      descripción, su sección y su año.
--   3. Si no existe: la crea en la sección indicada.
--
-- Las nuevas quedan en BORRADOR para que revises la categoría antes de que se vean.
-- Para publicarlas todas de una vez, cambia v_estado a 'publicado' antes de aplicar,
-- o después corre:
--   update public.doc_items set status = 'publicado'
--    where url like 'https://repositorio.udes.edu.co/handle/%' and status = 'borrador';
--
-- La categoría es una propuesta: se cambia después en /admin/documentos.
-- Los autores y el PDF directo no se guardan aquí: el enlace lleva a la ficha del
-- repositorio, que los muestra.
-- =============================================================================

do $$
declare
  v_estado constant text := 'borrador';
  v_base   constant text := 'https://repositorio.udes.edu.co/handle/001/';
  r        record;
  v_col    uuid;
  v_id     uuid;
  n_previo int := 0;
  n_enlace int := 0;
  n_nuevo  int := 0;
  n_sin    int := 0;
begin
  for r in
    select * from (values
      -- num, título, fecha, sección (slug), enlace actual a reemplazar (like), descripción corta
      (13926, 'Informe de Avance Plan de Desarrollo Institucional 2024-2028. Línea base 2023 y ejecución 2024-2025.', '2026-10-29', 'informes-de-gestion', null::text,
        'Seguimiento del Plan de Desarrollo Institucional 2024-2028 durante 2024 y 2025, con línea base 2023: 20 indicadores en seis pilares estratégicos.'),
      (13693, 'Informe de Ejecución Plan de Desarrollo Institucional 2019 - 2023', '2026-09-10', 'informes-de-gestion', null,
        'Evaluación de la ejecución del Plan de Desarrollo Institucional 2019-2023: cumplimiento global del 80,19 % sobre los seis ejes estratégicos.'),

      (13548, 'Plan de Desarrollo Institucional 2024-2028', '2023-12-18', 'planeacion-estrategica', '%/plan-desarrollo-institucional-2024-2028-udes.pdf',
        'Instrumento de orientación estratégica con las prioridades, apuestas y acciones institucionales para 2024-2028.'),
      (13520, 'Plan de Desarrollo Institucional 2024 - 2028 Versión Ejecutiva', '2026-05-08', 'planeacion-estrategica', '%/ejecutivo-plan-desarrollo-institucional-2024-2028.pdf',
        'Versión ejecutiva del Plan 2024-2028: calidad académica, investigación, extensión y posicionamiento regional, nacional e internacional.'),
      (13544, 'Cultura PDI "Juntos Construimos el Futuro Desde Nuestro Territorio"', '2026-05-06', 'planeacion-estrategica', '%/historieta-cultura-pdi.pdf',
        'Material de cultura del Plan de Desarrollo Institucional 2024-2028 para toda la comunidad universitaria.'),
      (13519, 'Relatoría: Redefinición Estratégica del PDI', '2026-07-31', 'planeacion-estrategica', '%/pdi_relatoria.pdf',
        'Sistematiza la construcción y operacionalización del Plan de Desarrollo Institucional 2024-2028, con una metodología mixta, secuencial y participativa.'),

      (12653, 'Informe General de Seguimiento de la Tasa de Graduación de las Mujeres 2008 - 2024', '2025-11-10', 'informes-estadisticos', null,
        'Seguimiento de la tasa de graduación diferenciada por género en la UDES entre 2008 y 2024.'),
      (11699, 'Documento de Analítica Académica No 26. Informe de caracterización estudiantes recién ingreso 2025-1 Campus Valledupar', '2025-04-21', 'informes-estadisticos', null,
        'Caracterización socioeconómica, académica y cultural de los estudiantes de nuevo ingreso 2025-1 del campus Valledupar.'),
      (11690, 'Documento de Analítica Académica No 25. Informe de caracterización estudiantes recién ingreso 2025-1 Campus Cúcuta', '2024-04-21', 'informes-estadisticos', null,
        'Caracterización socioeconómica, académica y cultural de los estudiantes de nuevo ingreso 2025-1 del campus Cúcuta.'),
      (11554, 'Documento de Analítica Académica No 24. Informe de caracterización estudiantes recién ingreso 2025-1 Campus Bucaramanga', '2025-03-13', 'informes-estadisticos', null,
        'Caracterización socioeconómica, académica y cultural de los estudiantes de nuevo ingreso 2025-1 del campus Bucaramanga.'),

      (13880, 'Valor Agregado Académico como Estrategia Institucional de Seguimiento y Mejora del Aprendizaje: Saber TyT en la Universidad de Santander – Campus Bucaramanga.', '2026-10-19', 'estudios', null,
        'Valor agregado académico de los programas tecnológicos de UDESTEC en Saber TyT, descontado el nivel de ingreso medido en Saber 11.'),
      (12294, 'Valor agregado académico como estrategia institucional de seguimiento y mejora del aprendizaje: estudio en la Universidad de Santander – campus Bucaramanga, Saber Pro 2023-2024', '2025-09-01', 'estudios', null,
        'Impacto formativo de la UDES en las competencias genéricas, medido con valor agregado académico en Saber Pro 2023-2024.'),
      (11232, 'Estudio de demanda para programas técnicos laborales Universidad de Santander', '2024-11-20', 'estudios', '%/estudio-demanda-tecnico-laborales.pdf',
        'Interés de los posibles aspirantes, factores de decisión y capacidad de pago para cursar programas técnicos laborales.'),
      (10894, 'Informe resultados estrategia. Regresa, la UDES te espera.', '2024-05-31', 'estudios', null,
        'Resultados de la estrategia «Regresa, la UDES te espera», orientada a reforzar el ingreso y la culminación exitosa de los estudios.'),
      (9707, 'Valor Agregado Intermedio Estrategia de Mejoramiento para el Aprendizaje', '2023', 'estudios', null,
        'Modelo de monitoreo del desempeño en competencias genéricas de estudiantes que cursaron cerca del 50 % de los créditos.'),
      (9706, 'Estudio del Valor Agregado Académico de la Universidad De Santander: Estrategia de Seguimiento y Mejoramiento Continuo del Aprendizaje de los Estudiantes que Presentaron Pruebas Saber Pro en 2022 - Campus Bucaramanga', '2023', 'estudios', null,
        'Progreso de aprendizaje de los estudiantes UDES que presentaron Saber Pro en 2022, campus Bucaramanga.'),

      (13921, 'Datos que incluyen: la transición de la data storytelling a la inteligencia artificial en la gestión de la educación inclusiva', '2026-10-28', 'publicaciones-y-divulgacion', null,
        'Ponencia sobre la integración de analítica académica, narrativa de datos e inteligencia artificial en la gestión de la educación superior inclusiva.'),
      (13603, 'Udes en los rankings 2026', '2026-08-18', 'publicaciones-y-divulgacion', null,
        'Qué son y qué evalúan los rankings internacionales de universidades, y el desempeño de la UDES en 2026.'),
      (12652, 'UDES en los rankings 2025', '2025-12-09', 'publicaciones-y-divulgacion', null,
        'Qué son y qué evalúan los rankings internacionales de universidades, y el desempeño de la UDES en 2025.'),
      (9758, 'UDES en los rankings 2023', '2023-11-20', 'publicaciones-y-divulgacion', null,
        'Qué son y qué evalúan los rankings internacionales de universidades, y el desempeño de la UDES en 2023.'),
      (11298, 'Boletín Rankings Universidad de Santander #22 - 2024', '2024-12-11', 'publicaciones-y-divulgacion', null,
        'Boletín de rankings de la Universidad de Santander, edición 22 (2024).'),
      (11299, 'Visualización de datos de publicaciones científicas en universidades del gran Santander', '2023-04-27', 'publicaciones-y-divulgacion', null,
        'Visualización de datos de la producción científica de las universidades del Gran Santander.'),
      (11231, 'Importancia de la bibliometría para un trabajo de grado', '2024-12-03', 'publicaciones-y-divulgacion', null,
        'Presentación sobre la bibliometría en un trabajo de grado, con la librería Bibliometrix y otras estrategias.'),
      (9622, 'Herramientas de Minería de Datos como Transformación Digital en el Aula', '2023-10-05', 'publicaciones-y-divulgacion', null,
        'Herramientas de minería de datos para la transformación digital en el aula.'),
      (11300, 'Modelo de análisis estructural en el desempeño de competencias genéricas evaluadas en pruebas de estado: el caso de la Universidad de Santander', '2023-04-27', 'publicaciones-y-divulgacion', null,
        'Modelo de análisis estructural del desempeño en competencias genéricas evaluadas en pruebas de Estado, caso UDES.'),
      (7865, 'Modelo de valor agregado en la Universidad de Santander como estrategia de seguimiento y mejoramiento continuo del aprendizaje', '2022-12-14', 'publicaciones-y-divulgacion', null,
        'Modelo de valor agregado como estrategia de seguimiento y mejoramiento continuo del aprendizaje en la UDES.'),
      (9653, 'Estrategias de Seguimiento, Monitoreo e Intervención Académica Para la Permanencia Universitaria: Caso Universidad de Santander', '2021', 'publicaciones-y-divulgacion', null,
        'Caso de estudio sobre seguimiento, monitoreo e intervención académica para la permanencia, en el marco del ODS 4.'),
      (9652, 'Estrategias de Intervención Preventiva Para Fomentar la Permanencia y Éxito Estudiantil: Alertas Tempranas', '2023-09-30', 'publicaciones-y-divulgacion', null,
        'Validación de las estrategias de alertas tempranas para la permanencia y el acompañamiento académico en la UDES.'),
      (9650, 'Análisis y plan de mejora de la calidad académica en el marco de la permanencia estudiantil bajo el enfoque Lean Six Sigma', '2022', 'publicaciones-y-divulgacion', null,
        'Aplicación de Lean Six Sigma para reducir la deserción estudiantil en la UDES, campus Bucaramanga.')
    ) as t(num, titulo, fecha, seccion, actual, descr)
  loop
    -- 1. ya está
    if exists (select 1 from public.doc_items where url = v_base || r.num) then
      n_previo := n_previo + 1;
      continue;
    end if;

    -- 2. ya existía con un enlace a SharePoint: solo cambia el enlace
    if r.actual is not null then
      select id into v_id from public.doc_items
       where url like r.actual and url not like 'https://repositorio.udes.edu.co/%'
       order by created_at limit 1;
      if v_id is not null then
        update public.doc_items
           set url = v_base || r.num, kind = 'enlace', path = null, file_type = 'Repositorio',
               issued_on = coalesce(issued_on, case when length(r.fecha) = 10 then r.fecha::date end)
         where id = v_id;
        n_enlace := n_enlace + 1;
        continue;
      end if;
    end if;

    -- 3. nueva, en su sección
    select id into v_col from public.doc_collections where slug = r.seccion;
    if v_col is null then
      raise notice 'No existe la sección «%»: se omite «%».', r.seccion, left(r.titulo, 60);
      n_sin := n_sin + 1;
      continue;
    end if;
    insert into public.doc_items (collection_id, title, description, kind, url, file_type, year, issued_on, status)
    values (v_col, r.titulo, r.descr, 'enlace', v_base || r.num, 'Repositorio', left(r.fecha, 4)::smallint,
            case when length(r.fecha) = 10 then r.fecha::date end, v_estado);
    n_nuevo := n_nuevo + 1;
  end loop;

  raise notice 'Repositorio: % nuevas (%), % enlaces cambiados, % ya estaban, % sin sección.', n_nuevo, v_estado, n_enlace, n_previo, n_sin;
end $$;
